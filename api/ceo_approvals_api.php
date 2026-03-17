<?php
/**
 * ceo_approvals_api.php
 * API صفحة اعتمادات الرئيس التنفيذي
 */

ob_start();
session_start();
session_write_close(); // ✅ أغلق lock الـ session فوراً — يمنع تعارض الطلبات المتزامنة
header('Content-Type: application/json; charset=utf-8');

// ✅ نفس نمط budget.php — المسار الصحيح لهذا المشروع
require_once __DIR__ . '/../includes/functions.php';

if (!function_exists('db')) {
    ob_end_clean();
    echo json_encode(['success' => false, 'message' => 'functions.php غير موجود'], JSON_UNESCAPED_UNICODE);
    exit;
}

// التحقق من تسجيل الدخول
if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'غير مصرح'], JSON_UNESCAPED_UNICODE);
    exit;
}

$userId       = (int)$_SESSION['user_id'];
$userName     = $_SESSION['user_name']        ?? '';
$userRole     = $_SESSION['user_role']        ?? '';
$permLevel    = $_SESSION['permission_level'] ?? 'employee';
$departmentId = $_SESSION['department_id']    ?? null;

// التحقق من الصلاحية: رئيس تنفيذي أو مدير نظام فقط
$allowed = $permLevel === 'system_admin'
        || in_array($userRole, ['ceo', 'CEO', 'الرئيس التنفيذي', 'admin']);

if (!$allowed) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'غير مصرح'], JSON_UNESCAPED_UNICODE);
    exit;
}

$conn   = db();
$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

// ── إنشاء الجداول بأمان كامل ──────────────────────────────────
try {
$conn->query("CREATE TABLE IF NOT EXISTS ceo_approval_actions (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    reservation_id    INT NOT NULL,
    action_type       ENUM('اعتماد','مراجعة','توجيه','رفض') NOT NULL,
    action_by         INT NOT NULL,
    actor_name        VARCHAR(200) NOT NULL,
    actor_position    VARCHAR(200) DEFAULT NULL,
    action_date       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    notes             TEXT DEFAULT NULL,
    archive_file_path VARCHAR(500) DEFAULT NULL,
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_res (reservation_id),
    INDEX idx_by  (action_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

$conn->query("CREATE TABLE IF NOT EXISTS ceo_stamp_settings (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    stamp_text          VARCHAR(200) DEFAULT 'معتمد',
    stamp_sub_text      VARCHAR(200) DEFAULT 'معتمد رسمياً',
    show_sub_text       TINYINT(1)   DEFAULT 1,
    stamp_color         VARCHAR(20)  DEFAULT '#1e40af',
    stamp_bg_color      VARCHAR(20)  DEFAULT 'rgba(30,64,175,0.08)',
    stamp_shape         ENUM('circle','square','hexagon','oval') DEFAULT 'circle',
    stamp_size          ENUM('small','medium','large') DEFAULT 'medium',
    stamp_border_width  TINYINT      DEFAULT 3,
    show_inner_ring     TINYINT(1)   DEFAULT 1,
    show_date_in_stamp  TINYINT(1)   DEFAULT 0,
    stamp_org_name      VARCHAR(200) DEFAULT NULL,
    show_org_name       TINYINT(1)   DEFAULT 0,
    signature_image     MEDIUMBLOB   DEFAULT NULL,
    signature_name      VARCHAR(200) DEFAULT NULL,
    updated_by          INT          DEFAULT NULL,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

// إضافة الأعمدة الجديدة إن لم تكن موجودة
$newCols = [
    'stamp_sub_text'     => "VARCHAR(200) DEFAULT 'معتمد رسمياً'",
    'show_sub_text'      => "TINYINT(1) DEFAULT 1",
    'stamp_size'         => "ENUM('small','medium','large') DEFAULT 'medium'",
    'stamp_border_width' => "TINYINT DEFAULT 3",
    'show_inner_ring'    => "TINYINT(1) DEFAULT 1",
    'show_date_in_stamp' => "TINYINT(1) DEFAULT 0",
    'stamp_org_name'     => "VARCHAR(200) DEFAULT NULL",
    'show_org_name'      => "TINYINT(1) DEFAULT 0",
    'stamp_rotate'       => "INT DEFAULT 0",
    'sig_pdf_size'       => "INT DEFAULT 130",
    'sig_gap'            => "INT DEFAULT 0",
    'sig_x'              => "INT DEFAULT 40",
    'sig_y'              => "INT DEFAULT 40",
];
foreach ($newCols as $col => $def) {
    $chkCol = $conn->query("SHOW COLUMNS FROM ceo_stamp_settings LIKE '$col'");
    if (!$chkCol || $chkCol->num_rows === 0) {
        $conn->query("ALTER TABLE ceo_stamp_settings ADD COLUMN $col $def");
    }
}

$chk = $conn->query("SELECT COUNT(*) as c FROM ceo_stamp_settings");
if ($chk && $chk->fetch_assoc()['c'] == 0) {
    $conn->query("INSERT INTO ceo_stamp_settings (stamp_text, stamp_color) VALUES ('معتمد', '#1e40af')");
}

// إضافة أعمدة CEO لجدول budget_reservations إن لم تكن موجودة
foreach (['ceo_approval_id INT DEFAULT NULL', 'ceo_action_type VARCHAR(20) DEFAULT NULL', 'ceo_actioned_at DATETIME DEFAULT NULL'] as $colDef) {
    $colName = explode(' ', $colDef)[0];
    $chkCol  = $conn->query("SHOW COLUMNS FROM budget_reservations LIKE '$colName'");
    if (!$chkCol || $chkCol->num_rows === 0) {
        @$conn->query("ALTER TABLE budget_reservations ADD COLUMN $colDef");
    }
}
} catch (Exception $e) {
    // تجاهل أخطاء إنشاء الجداول — لا نوقف الـ API
}

// ──────────────────────────────────────────────────────────────
switch ($action) {

    case 'list':
        $statusFilter = $conn->real_escape_string($_GET['status'] ?? '');
        $search       = $conn->real_escape_string($_GET['search'] ?? '');
        $year         = (int)($_GET['year'] ?? 0);

        // ✅ إظهار كل الحجوزات التي خرجت من المسودة (قيد المراجعة + معتمد + مرفوض + منفذ)
        // بدون تصفية بالحالة افتراضياً — الرئيس يرى الكل
        $where = ["br.status NOT IN ('مسودة','ملغى')"];

        // تصفية اختيارية بالحالة إذا مُررت من الفرونت
        if ($statusFilter) $where[] = "br.status = '$statusFilter'";
        if ($search)       $where[] = "(br.reservation_number LIKE '%$search%' OR br.purpose LIKE '%$search%' OR d.name LIKE '%$search%')";
        if ($year)         $where[] = "br.fiscal_year = $year";

        $wSql = 'WHERE ' . implode(' AND ', $where);

        $res = $conn->query("
            SELECT br.id, br.reservation_number, br.purpose, br.status,
                   br.grand_total, br.grand_total_sar, br.currency, br.fiscal_year,
                   br.priority, br.request_date, br.created_at,
                   br.budget_category,
                   d.name AS department_name,
                   e.name AS requested_by_name,
                   ca.action_type       AS ceo_action,
                   ca.actor_name        AS ceo_actor_name,
                   ca.action_date       AS ceo_action_date,
                   ca.archive_file_path AS ceo_archive_path
            FROM budget_reservations br
            LEFT JOIN departments d ON br.department_id = d.id
            LEFT JOIN employees   e ON br.requested_by  = e.id
            LEFT JOIN ceo_approval_actions ca
                ON ca.id = (
                    SELECT MAX(id) FROM ceo_approval_actions
                    WHERE reservation_id = br.id
                )
            $wSql
            ORDER BY
                (ca.action_type IS NULL) DESC,
                FIELD(br.status, 'قيد المراجعة', 'معتمد', 'منفذ', 'مرفوض') ASC,
                br.created_at DESC
            LIMIT 500
        ");

        $rows = [];
        if ($res) while ($r = $res->fetch_assoc()) $rows[] = $r;
        jsonResponse(['success' => true, 'data' => $rows]);
        break;

    case 'get':
        $id = (int)($_GET['id'] ?? 0);
        if (!$id) jsonResponse(['success' => false, 'message' => 'المعرف مطلوب']);

        $res = $conn->query("
            SELECT br.*,
                   d.name  AS department_name,
                   e.name  AS requested_by_name,
                   ea.name AS approved_by_name,
                   COALESCE(s.name, br.supplier_name_manual) AS supplier_name
            FROM budget_reservations br
            LEFT JOIN departments d  ON br.department_id = d.id
            LEFT JOIN employees   e  ON br.requested_by  = e.id
            LEFT JOIN employees   ea ON br.approved_by   = ea.id
            LEFT JOIN suppliers   s  ON br.supplier_id   = s.id
            WHERE br.id = $id LIMIT 1
        ");
        $row = $res ? $res->fetch_assoc() : null;
        if (!$row) jsonResponse(['success' => false, 'message' => 'الحجز غير موجود']);

        $iRes = $conn->query("
            SELECT description, qty, unit, unit_price, line_total
            FROM budget_reservation_items
            WHERE reservation_id = $id
            ORDER BY sort_order, id
        ");
        $items = [];
        if ($iRes) while ($ir = $iRes->fetch_assoc()) $items[] = $ir;
        $row['items'] = $items;

        $aRes = $conn->query("
            SELECT action_type, actor_name, actor_position, action_date, notes
            FROM ceo_approval_actions
            WHERE reservation_id = $id
            ORDER BY created_at ASC
        ");
        $actions = [];
        if ($aRes) while ($ar = $aRes->fetch_assoc()) $actions[] = $ar;
        $row['ceo_actions'] = $actions;

        jsonResponse(['success' => true, 'data' => $row]);
        break;

    case 'do_action':
        if ($method !== 'POST') jsonResponse(['success' => false, 'message' => 'POST فقط']);

        $body          = json_decode(file_get_contents('php://input'), true) ?? [];
        $resId         = (int)($body['reservation_id'] ?? 0);
        $actionTypeRaw = $body['action_type'] ?? '';
        $notes         = $conn->real_escape_string($body['notes'] ?? '');

        if (!$resId || !in_array($actionTypeRaw, ['اعتماد','مراجعة','توجيه','رفض'], true)) {
            jsonResponse(['success' => false, 'message' => 'بيانات غير صحيحة']);
        }

        $actionType = $conn->real_escape_string($actionTypeRaw);

        // التحقق من عدم وجود إجراء سابق
        $chk2 = $conn->query("SELECT id FROM ceo_approval_actions WHERE reservation_id = $resId LIMIT 1");
        if ($chk2 && $chk2->num_rows > 0) {
            jsonResponse(['success' => false, 'message' => 'تم تنفيذ إجراء على هذا الحجز مسبقاً - الأزرار تُستخدم مرة واحدة فقط']);
        }

        $empRes   = $conn->query("SELECT role, name FROM employees WHERE id = $userId LIMIT 1");
        $empRow   = $empRes ? $empRes->fetch_assoc() : [];
        $position = $conn->real_escape_string($empRow['role'] ?? $userRole);
        $safeUser = $conn->real_escape_string($userName);

        $conn->query("
            INSERT INTO ceo_approval_actions
                (reservation_id, action_type, action_by, actor_name, actor_position, notes)
            VALUES
                ($resId, '$actionType', $userId, '$safeUser', '$position', '$notes')
        ");
        $newId = $conn->insert_id;

        if (!$newId) jsonResponse(['success' => false, 'message' => 'فشل الحفظ: ' . $conn->error]);

        if ($actionType === 'اعتماد') {
            $conn->query("UPDATE budget_reservations SET status='معتمد', approved_by=$userId, approved_at=NOW() WHERE id=$resId");
        } elseif ($actionType === 'رفض') {
            $conn->query("UPDATE budget_reservations SET status='مرفوض', approved_by=$userId, approved_at=NOW() WHERE id=$resId");
        } elseif ($actionType === 'مراجعة') {
            $conn->query("UPDATE budget_reservations SET status='قيد المراجعة' WHERE id=$resId");
        }

        jsonResponse(['success' => true, 'message' => "تم تنفيذ إجراء ($actionType) بنجاح", 'action_id' => $newId]);
        break;

    case 'save_archive_path':
        if ($method !== 'POST') jsonResponse(['success' => false, 'message' => 'POST فقط']);
        $body  = json_decode(file_get_contents('php://input'), true) ?? [];
        $resId = (int)($body['reservation_id'] ?? 0);
        $path  = $conn->real_escape_string($body['file_path'] ?? '');
        if (!$resId || !$path) jsonResponse(['success' => false, 'message' => 'بيانات ناقصة']);
        $conn->query("UPDATE ceo_approval_actions SET archive_file_path='$path' WHERE reservation_id=$resId ORDER BY id DESC LIMIT 1");
        jsonResponse(['success' => true]);
        break;

    case 'get_stamp':
        $res = $conn->query("SELECT * FROM ceo_stamp_settings LIMIT 1");
        $row = $res ? $res->fetch_assoc() : [];
        unset($row['signature_image']); // لا نرسله هنا — يُجلب بـ get_signature_image
        jsonResponse(['success' => true, 'data' => $row]);
        break;

    case 'delete_signature':
        if ($method !== 'POST') jsonResponse(['success' => false, 'message' => 'POST فقط']);
        if ($permLevel !== 'system_admin') jsonResponse(['success' => false, 'message' => 'مدير النظام فقط']);
        $conn->query("UPDATE ceo_stamp_settings SET signature_image = NULL, updated_by = $userId LIMIT 1");
        jsonResponse(['success' => true, 'message' => 'تم حذف صورة التوقيع']);
        break;

    case 'get_signature_image':
        $res = $conn->query("SELECT signature_image FROM ceo_stamp_settings LIMIT 1");
        $row = $res ? $res->fetch_assoc() : [];
        if (!empty($row['signature_image'])) {
            jsonResponse(['success' => true, 'image' => 'data:image/png;base64,' . base64_encode($row['signature_image'])]);
        } else {
            jsonResponse(['success' => true, 'image' => null]);
        }
        break;

    case 'save_stamp':
        if ($method !== 'POST') jsonResponse(['success' => false, 'message' => 'POST فقط']);
        if ($permLevel !== 'system_admin') jsonResponse(['success' => false, 'message' => 'مدير النظام فقط']);

        $body = json_decode(file_get_contents('php://input'), true) ?? [];

        $stampText       = $conn->real_escape_string($body['stamp_text']        ?? 'معتمد');
        $stampSubText    = $conn->real_escape_string($body['stamp_sub_text']     ?? 'معتمد رسمياً');
        $showSubText     = isset($body['show_sub_text'])     ? (int)(bool)$body['show_sub_text']     : 1;
        $stampColor      = $conn->real_escape_string($body['stamp_color']        ?? '#1e40af');
        $stampBgColor    = $conn->real_escape_string($body['stamp_bg_color']     ?? 'rgba(30,64,175,0.08)');
        $stampShape      = $conn->real_escape_string($body['stamp_shape']        ?? 'circle');
        $stampSize       = $conn->real_escape_string($body['stamp_size']         ?? 'medium');
        $borderWidth     = max(1, min(8, (int)($body['stamp_border_width']       ?? 3)));
        $showInnerRing   = isset($body['show_inner_ring'])   ? (int)(bool)$body['show_inner_ring']   : 1;
        $showDateInStamp = isset($body['show_date_in_stamp'])? (int)(bool)$body['show_date_in_stamp']: 0;
        $orgName         = $conn->real_escape_string($body['stamp_org_name']     ?? '');
        $showOrgName     = isset($body['show_org_name'])     ? (int)(bool)$body['show_org_name']     : 0;
        $stampRotate     = (int)($body['stamp_rotate']       ?? 0);
        $sigPdfSize      = max(60, min(250, (int)($body['sig_pdf_size']          ?? 130)));
        $sigGap          = max(-100, min(60, (int)($body['sig_gap']              ?? 0)));
        $sigName         = $conn->real_escape_string($body['signature_name']     ?? '');

        $sigImageSql = '';
        if (!empty($body['signature_image'])) {
            $b64data = preg_replace('/^data:image\/\w+;base64,/', '', $body['signature_image']);
            $binData = base64_decode($b64data);
            if ($binData !== false) {
                $safeBin     = $conn->real_escape_string($binData);
                $sigImageSql = ", signature_image = '$safeBin'";
            }
        }

        $conn->query("
            UPDATE ceo_stamp_settings SET
                stamp_text        = '$stampText',
                stamp_sub_text    = '$stampSubText',
                show_sub_text     = $showSubText,
                stamp_color       = '$stampColor',
                stamp_bg_color    = '$stampBgColor',
                stamp_shape       = '$stampShape',
                stamp_size        = '$stampSize',
                stamp_border_width= $borderWidth,
                show_inner_ring   = $showInnerRing,
                show_date_in_stamp= $showDateInStamp,
                stamp_org_name    = '$orgName',
                show_org_name     = $showOrgName,
                stamp_rotate      = $stampRotate,
                sig_pdf_size      = $sigPdfSize,
                sig_gap           = $sigGap,
                signature_name    = '$sigName',
                updated_by        = $userId
                $sigImageSql
            LIMIT 1
        ");

        jsonResponse(['success' => true, 'message' => 'تم حفظ إعدادات الختم بنجاح']);
        break;

    // ══════════════════════════════════════════════════════════════
    // حفظ PDF في الأرشيف — يستقبل base64 عبر JSON (بدون FormData)
    // ══════════════════════════════════════════════════════════════
    case 'upload_to_archive':
        if ($method !== 'POST') jsonResponse(['success' => false, 'message' => 'POST فقط']);

        $body      = json_decode(file_get_contents('php://input'), true) ?? [];
        $pdfBase64 = $body['pdf_base64'] ?? '';
        $fileName  = preg_replace('/[^a-zA-Z0-9._-]/', '', $body['file_name'] ?? ('ceo_'.time().'.pdf'));

        if (empty($pdfBase64)) {
            jsonResponse(['success' => false, 'message' => 'بيانات PDF مفقودة']);
        }

        $pdfData = base64_decode($pdfBase64);
        if ($pdfData === false || strlen($pdfData) < 100) {
            jsonResponse(['success' => false, 'message' => 'بيانات PDF غير صالحة']);
        }

        // حفظ الملف
        $uploadDir = __DIR__ . '/../uploads/ceo_approvals/';
        if (!is_dir($uploadDir)) @mkdir($uploadDir, 0755, true);

        $safeName = 'ceo_' . time() . '_' . $fileName;
        $destPath = $uploadDir . $safeName;
        $relPath  = 'uploads/ceo_approvals/' . $safeName;

        if (file_put_contents($destPath, $pdfData) === false) {
            jsonResponse(['success' => false, 'message' => 'فشل حفظ الملف على السيرفر']);
        }

        $fileSize    = strlen($pdfData);
        $displayName = $conn->real_escape_string($body['display_name']  ?? $safeName);
        $category    = $conn->real_escape_string($body['category']      ?? 'موازنة_تخطيط');
        $description = $conn->real_escape_string($body['description']   ?? '');
        $srcModule   = $conn->real_escape_string($body['source_module'] ?? 'budget');
        $srcId       = (int)($body['source_id'] ?? 0);
        $tags        = $conn->real_escape_string($body['tags']          ?? 'اعتمادات الرئيس التنفيذي');
        $filePathEsc = $conn->real_escape_string($relPath);
        $deptId      = $departmentId ? (int)$departmentId : 'NULL';

        $inserted = $conn->query("
            INSERT INTO financial_archive
                (file_name, display_name, file_path, file_size, file_type, file_extension,
                 source_module, source_id, source_ref, category, tags, description,
                 uploaded_by, department_id, is_manual)
            VALUES
                ('$safeName', '$displayName', '$filePathEsc', $fileSize, 'application/pdf', 'pdf',
                 '$srcModule', " . ($srcId ?: 'NULL') . ", '$displayName',
                 '$category', '$tags', '$description',
                 $userId, $deptId, 1)
        ");

        if (!$inserted) {
            jsonResponse(['success' => false, 'message' => 'فشل التسجيل في الأرشيف: ' . $conn->error]);
        }

        $archiveId = $conn->insert_id;
        jsonResponse(['success' => true, 'id' => $archiveId, 'path' => $relPath]);
        break;

    default:
        jsonResponse(['success' => false, 'message' => 'action غير معروف في ceo_approvals_api: ' . $action]);
}