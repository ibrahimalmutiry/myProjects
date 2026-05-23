<?php
/**
 * workflow_config_api.php
 * ════════════════════════════════════════════════════════════
 * API إدارة قوالب سير العمل (مراحل الموافقات)
 * يدعم: إنشاء / تعديل / حذف القوالب والمراحل
 * الصلاحية المطلوبة: system_admin فقط
 * ════════════════════════════════════════════════════════════
 */

ob_start();
header('Content-Type: application/json; charset=utf-8');

set_exception_handler(function($e) {
    if (ob_get_level()) ob_end_clean();
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'success' => false,
        'message' => 'خطأ في الخادم: ' . $e->getMessage(),
    ], JSON_UNESCAPED_UNICODE);
    exit;
});

require_once __DIR__ . '/../includes/config.php';
setApiSecurityHeaders();
secureSession();

// ── التحقق من تسجيل الدخول ──────────────────────────────────
if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    ob_end_clean();
    echo json_encode(['success'=>false,'message'=>'يجب تسجيل الدخول أولاً'], JSON_UNESCAPED_UNICODE);
    exit;
}

// ── التحقق من صلاحية مدير النظام ────────────────────────────
$permissionLevel = $_SESSION['permission_level'] ?? 'employee';
if (!in_array($permissionLevel, ['system_admin', 'CEO'])) {
    http_response_code(403);
    ob_end_clean();
    echo json_encode(['success'=>false,'message'=>'هذه الصفحة لمديري النظام فقط'], JSON_UNESCAPED_UNICODE);
    exit;
}

$currentUserId = (int)$_SESSION['user_id'];
$action = $_GET['action'] ?? $_POST['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];
$input  = ($method === 'POST') ? (json_decode(file_get_contents('php://input'), true) ?? []) : [];

// ── تهيئة جداول سير العمل ───────────────────────────────────
wfBootstrap();

$conn = db();

// ════════════════════════════════════════════════════════════
// Helper: إخراج JSON
// ════════════════════════════════════════════════════════════
function wfOut(array $data, int $code = 200): void {
    if (ob_get_level()) ob_end_clean();
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

// ════════════════════════════════════════════════════════════
// Bootstrap: إنشاء الجداول وإدراج البيانات الافتراضية
// ════════════════════════════════════════════════════════════
function wfBootstrap(): void {
    static $done = false;
    if ($done) return;
    $done = true;
    $conn = db();

    // جدول قوالب سير العمل
    $conn->query("
        CREATE TABLE IF NOT EXISTS workflow_templates (
            id            INT AUTO_INCREMENT PRIMARY KEY,
            name_ar       VARCHAR(120) NOT NULL,
            name_en       VARCHAR(120) NOT NULL DEFAULT '',
            template_key  VARCHAR(60)  NOT NULL UNIQUE,
            description   TEXT         DEFAULT NULL,
            is_active     TINYINT(1)   NOT NULL DEFAULT 1,
            is_system     TINYINT(1)   NOT NULL DEFAULT 0 COMMENT 'لا يمكن حذفه',
            amount_min    DECIMAL(15,2) DEFAULT NULL COMMENT 'الحد الأدنى للمبلغ بالريال',
            amount_max    DECIMAL(15,2) DEFAULT NULL COMMENT 'الحد الأقصى للمبلغ بالريال (NULL = بلا حد)',
            sort_order    INT           NOT NULL DEFAULT 0,
            created_by    INT           DEFAULT NULL,
            created_at    DATETIME      DEFAULT CURRENT_TIMESTAMP,
            updated_at    DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_key (template_key),
            INDEX idx_active (is_active)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    // جدول تعريف مراحل كل قالب
    $conn->query("
        CREATE TABLE IF NOT EXISTS workflow_stage_definitions (
            id                   INT AUTO_INCREMENT PRIMARY KEY,
            template_id          INT          NOT NULL,
            stage_key            VARCHAR(80)  NOT NULL,
            stage_name_ar        VARCHAR(120) NOT NULL,
            stage_name_en        VARCHAR(120) NOT NULL DEFAULT '',
            stage_order          INT          NOT NULL DEFAULT 1,
            responsible_role     VARCHAR(60)  DEFAULT NULL COMMENT 'دور الموظف المسؤول (من جدول employees.role)',
            responsible_perm     VARCHAR(60)  DEFAULT NULL COMMENT 'permission_level البديل',
            responsible_dept_code VARCHAR(20) DEFAULT NULL COMMENT 'كود القسم المسؤول',
            is_mandatory         TINYINT(1)   NOT NULL DEFAULT 1,
            requires_dual_approval TINYINT(1) NOT NULL DEFAULT 0,
            is_terminal          TINYINT(1)   NOT NULL DEFAULT 0 COMMENT 'مرحلة نهائية (completed)',
            can_reject           TINYINT(1)   NOT NULL DEFAULT 1,
            notes                TEXT         DEFAULT NULL,
            created_at           DATETIME     DEFAULT CURRENT_TIMESTAMP,
            updated_at           DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_template_stage (template_id, stage_key),
            INDEX idx_template (template_id),
            FOREIGN KEY (template_id) REFERENCES workflow_templates(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    // ── إدراج القوالب الافتراضية إن لم تكن موجودة ──────────────
    $exists = $conn->query("SELECT COUNT(*) AS c FROM workflow_templates")->fetch_assoc()['c'] ?? 0;
    if ((int)$exists === 0) {
        wfInsertDefaultTemplates($conn);
    }
}

// ════════════════════════════════════════════════════════════
// إدراج القوالب والمراحل الافتراضية (ترحيل من الكود الصلب)
// ════════════════════════════════════════════════════════════
function wfInsertDefaultTemplates(\mysqli $conn): void {

    // قالب المسار القصير
    $conn->query("
        INSERT INTO workflow_templates
            (name_ar, name_en, template_key, description, is_system, amount_min, amount_max, sort_order)
        VALUES
            ('مسار قصير', 'Short Path', 'short',
             'للمعاملات التي تقل قيمتها عن حد المبلغ المحدد في الإعدادات',
             1, 0, 4999.99, 1)
    ");
    $shortId = $conn->insert_id;

    // قالب المسار الطويل
    $conn->query("
        INSERT INTO workflow_templates
            (name_ar, name_en, template_key, description, is_system, amount_min, amount_max, sort_order)
        VALUES
            ('مسار طويل', 'Long Path', 'long',
             'للمعاملات التي تساوي أو تتجاوز حد المبلغ المحدد في الإعدادات — يشمل موافقة الرئيس التنفيذي',
             1, 5000, NULL, 2)
    ");
    $longId = $conn->insert_id;

    // ── مراحل المسار القصير ──────────────────────────────────
    $shortStages = [
        ['reception',               1, 'الاستلام والتحقق',              'Reception & Verification',        'receiver',         null,            null,   1, 0, 0, 1],
        ['budget_review',           2, 'مراجعة موظف الموازنة',          'Budget Review',                   'budget',           null,            null,   1, 0, 0, 1],
        ['treasury_review',         3, 'مراجعة مدير الخزينة',           'Treasury Review',                 'treasury_manager', null,            null,   1, 1, 0, 1],
        ['finance_review',          4, 'مراجعة رئيس القطاع المالي',     'Finance Sector Head Review',      'finance_manager',  'sector_head',   'FIN',  1, 1, 0, 1],
        ['purchasing',              5, 'المشتريات — إنشاء حجز',         'Purchasing — Create Reservation', 'purchasing',       null,            'PUR',  1, 0, 0, 1],
        ['waiting_budget_approval', 6, 'اعتماد حجز الموازنة',           'Budget Reservation Approval',     'budget',           null,            null,   1, 0, 0, 1],
        ['accounts_review',         7, 'الحسابات — مراجعة وتوزيع',      'Accounts Review',                 'accountant',       null,            'ACC',  1, 0, 0, 1],
        ['payment',                 8, 'المالية — الدفع',               'Finance — Payment',               'payment',          null,            null,   1, 0, 0, 1],
        ['completed',               9, 'مكتملة',                        'Completed',                       null,               null,            null,   1, 0, 1, 0],
    ];

    foreach ($shortStages as [$key, $ord, $ar, $en, $role, $perm, $dept, $mand, $dual, $terminal, $canRej]) {
        $k  = $conn->real_escape_string($key);
        $a  = $conn->real_escape_string($ar);
        $e  = $conn->real_escape_string($en);
        $r  = $role  ? "'{$conn->real_escape_string($role)}'"  : 'NULL';
        $p  = $perm  ? "'{$conn->real_escape_string($perm)}'"  : 'NULL';
        $d  = $dept  ? "'{$conn->real_escape_string($dept)}'"  : 'NULL';
        $conn->query("
            INSERT IGNORE INTO workflow_stage_definitions
                (template_id, stage_key, stage_name_ar, stage_name_en, stage_order,
                 responsible_role, responsible_perm, responsible_dept_code,
                 is_mandatory, requires_dual_approval, is_terminal, can_reject)
            VALUES
                ($shortId, '$k', '$a', '$e', $ord,
                 $r, $p, $d,
                 $mand, $dual, $terminal, $canRej)
        ");
    }

    // ── مراحل المسار الطويل (مثل القصير + ceo_approval بعد finance_review) ──
    $longStages = [
        ['reception',               1,  'الاستلام والتحقق',              'Reception & Verification',        'receiver',         null,            null,   1, 0, 0, 1],
        ['budget_review',           2,  'مراجعة موظف الموازنة',          'Budget Review',                   'budget',           null,            null,   1, 0, 0, 1],
        ['treasury_review',         3,  'مراجعة مدير الخزينة',           'Treasury Review',                 'treasury_manager', null,            null,   1, 1, 0, 1],
        ['finance_review',          4,  'مراجعة رئيس القطاع المالي',     'Finance Sector Head Review',      'finance_manager',  'sector_head',   'FIN',  1, 1, 0, 1],
        ['ceo_approval',            5,  'موافقة الرئيس التنفيذي',        'CEO Approval',                    'CEO',              'CEO',           null,   1, 0, 0, 1],
        ['purchasing',              6,  'المشتريات — إنشاء حجز',         'Purchasing — Create Reservation', 'purchasing',       null,            'PUR',  1, 0, 0, 1],
        ['waiting_budget_approval', 7,  'اعتماد حجز الموازنة',           'Budget Reservation Approval',     'budget',           null,            null,   1, 0, 0, 1],
        ['accounts_review',         8,  'الحسابات — مراجعة وتوزيع',      'Accounts Review',                 'accountant',       null,            'ACC',  1, 0, 0, 1],
        ['payment',                 9,  'المالية — الدفع',               'Finance — Payment',               'payment',          null,            null,   1, 0, 0, 1],
        ['completed',               10, 'مكتملة',                        'Completed',                       null,               null,            null,   1, 0, 1, 0],
    ];

    foreach ($longStages as [$key, $ord, $ar, $en, $role, $perm, $dept, $mand, $dual, $terminal, $canRej]) {
        $k  = $conn->real_escape_string($key);
        $a  = $conn->real_escape_string($ar);
        $e  = $conn->real_escape_string($en);
        $r  = $role  ? "'{$conn->real_escape_string($role)}'"  : 'NULL';
        $p  = $perm  ? "'{$conn->real_escape_string($perm)}'"  : 'NULL';
        $d  = $dept  ? "'{$conn->real_escape_string($dept)}'"  : 'NULL';
        $conn->query("
            INSERT IGNORE INTO workflow_stage_definitions
                (template_id, stage_key, stage_name_ar, stage_name_en, stage_order,
                 responsible_role, responsible_perm, responsible_dept_code,
                 is_mandatory, requires_dual_approval, is_terminal, can_reject)
            VALUES
                ($longId, '$k', '$a', '$e', $ord,
                 $r, $p, $d,
                 $mand, $dual, $terminal, $canRej)
        ");
    }
}

// ════════════════════════════════════════════════════════════
// GET Endpoints
// ════════════════════════════════════════════════════════════
if ($method === 'GET') {

    // ── قائمة القوالب مع مراحلها ────────────────────────────
    if ($action === 'list_templates') {
        $r = $conn->query("
            SELECT t.*,
                   COUNT(s.id) AS stage_count
            FROM workflow_templates t
            LEFT JOIN workflow_stage_definitions s ON s.template_id = t.id
            GROUP BY t.id
            ORDER BY t.sort_order ASC, t.id ASC
        ");
        $templates = [];
        while ($row = $r->fetch_assoc()) $templates[] = $row;
        wfOut(['success'=>true,'data'=>$templates]);
    }

    // ── مراحل قالب محدد ──────────────────────────────────────
    elseif ($action === 'get_stages') {
        $tplId = (int)($_GET['template_id'] ?? 0);
        if (!$tplId) wfOut(['success'=>false,'message'=>'template_id مطلوب'], 400);

        $r = $conn->query("
            SELECT * FROM workflow_stage_definitions
            WHERE template_id = $tplId
            ORDER BY stage_order ASC
        ");
        $stages = [];
        while ($row = $r->fetch_assoc()) $stages[] = $row;

        $tplRow = $conn->query("SELECT * FROM workflow_templates WHERE id=$tplId LIMIT 1")->fetch_assoc();
        wfOut(['success'=>true,'data'=>$stages,'template'=>$tplRow]);
    }

    // ── الأدوار المتاحة في النظام (للقائمة المنسدلة) ─────────
    elseif ($action === 'get_roles') {
        $r = $conn->query("
            SELECT DISTINCT role, COUNT(*) AS emp_count
            FROM employees
            WHERE is_active=1 AND role IS NOT NULL AND role != ''
            GROUP BY role
            ORDER BY role ASC
        ");
        $roles = [];
        while ($row = $r->fetch_assoc()) $roles[] = $row;

        // الأدوار الثابتة في permission_level
        $permRoles = ['system_admin','CEO','sector_head','division_manager','employee'];

        // الأقسام للقائمة
        $deptR = $conn->query("SELECT id, name, code FROM departments WHERE is_active=1 ORDER BY name ASC");
        $depts = [];
        while ($row = $deptR->fetch_assoc()) $depts[] = $row;

        wfOut(['success'=>true,'roles'=>$roles,'perm_roles'=>$permRoles,'departments'=>$depts]);
    }

    // ── إحصاء الطلبات المستخدِمة لكل قالب ───────────────────
    elseif ($action === 'get_usage') {
        $tplId = (int)($_GET['template_id'] ?? 0);
        if (!$tplId) wfOut(['success'=>false,'message'=>'template_id مطلوب'], 400);

        $tpl = $conn->query("SELECT template_key FROM workflow_templates WHERE id=$tplId LIMIT 1")->fetch_assoc();
        $key = $conn->real_escape_string($tpl['template_key'] ?? '');
        $count = 0;
        if ($key) {
            $cr = $conn->query("SELECT COUNT(*) AS c FROM purchase_requests WHERE workflow_path='$key' AND current_stage NOT IN ('completed','returned')");
            $count = (int)($cr->fetch_assoc()['c'] ?? 0);
        }
        wfOut(['success'=>true,'active_requests'=>$count,'template_key'=>$key]);
    }

    else {
        wfOut(['success'=>false,'message'=>'action غير معروف'], 400);
    }
}

// ════════════════════════════════════════════════════════════
// POST Endpoints
// ════════════════════════════════════════════════════════════
elseif ($method === 'POST') {

    // ── إنشاء قالب جديد ──────────────────────────────────────
    if ($action === 'create_template') {
        $nameAr = trim(clean($input['name_ar'] ?? ''));
        $nameEn = trim(clean($input['name_en'] ?? ''));
        $key    = preg_replace('/[^a-z0-9_]/', '_', strtolower(trim($input['template_key'] ?? '')));
        $desc   = trim(clean($input['description'] ?? ''));
        $amtMin = isset($input['amount_min']) && $input['amount_min'] !== '' ? (float)$input['amount_min'] : null;
        $amtMax = isset($input['amount_max']) && $input['amount_max'] !== '' ? (float)$input['amount_max'] : null;

        if (!$nameAr || !$key) wfOut(['success'=>false,'message'=>'اسم القالب والمفتاح إلزاميان'], 400);

        // التحقق من تكرار المفتاح
        $dup = $conn->query("SELECT id FROM workflow_templates WHERE template_key='{$conn->real_escape_string($key)}' LIMIT 1");
        if ($dup && $dup->num_rows) wfOut(['success'=>false,'message'=>'مفتاح القالب موجود مسبقاً'], 409);

        $nameArE = $conn->real_escape_string($nameAr);
        $nameEnE = $conn->real_escape_string($nameEn);
        $keyE    = $conn->real_escape_string($key);
        $descE   = $conn->real_escape_string($desc);
        $amtMinS = $amtMin !== null ? $amtMin : 'NULL';
        $amtMaxS = $amtMax !== null ? $amtMax : 'NULL';

        // ترتيب: آخر رقم + 1
        $lastOrd = (int)($conn->query("SELECT MAX(sort_order) AS m FROM workflow_templates")->fetch_assoc()['m'] ?? 0);

        $conn->query("
            INSERT INTO workflow_templates
                (name_ar, name_en, template_key, description, amount_min, amount_max, sort_order, created_by, is_system)
            VALUES
                ('$nameArE','$nameEnE','$keyE','$descE',$amtMinS,$amtMaxS," . ($lastOrd+1) . ",$currentUserId, 0)
        ");
        $newId = $conn->insert_id;
        if (!$newId) wfOut(['success'=>false,'message'=>'فشل الإنشاء: '.$conn->error], 500);

        // إضافة مرحلتَي البداية والنهاية الأساسيتين تلقائياً
        $conn->query("
            INSERT INTO workflow_stage_definitions
                (template_id, stage_key, stage_name_ar, stage_name_en, stage_order, responsible_role, is_mandatory, is_terminal, can_reject)
            VALUES
                ($newId, 'reception', 'الاستلام والتحقق', 'Reception & Verification', 1, 'receiver', 1, 0, 1),
                ($newId, 'completed', 'مكتملة', 'Completed', 99, NULL, 1, 1, 0)
        ");

        wfLog($conn, $currentUserId, 'create_template', $newId, "إنشاء قالب: $nameAr");
        wfOut(['success'=>true,'id'=>$newId,'message'=>'تم إنشاء القالب بنجاح']);
    }

    // ── تعديل قالب ───────────────────────────────────────────
    elseif ($action === 'update_template') {
        $tplId  = (int)($input['id'] ?? 0);
        if (!$tplId) wfOut(['success'=>false,'message'=>'id مطلوب'], 400);

        $nameAr = trim(clean($input['name_ar'] ?? ''));
        $nameEn = trim(clean($input['name_en'] ?? ''));
        $desc   = trim(clean($input['description'] ?? ''));
        $active = isset($input['is_active']) ? (int)(bool)$input['is_active'] : 1;
        $amtMin = isset($input['amount_min']) && $input['amount_min'] !== '' ? (float)$input['amount_min'] : null;
        $amtMax = isset($input['amount_max']) && $input['amount_max'] !== '' ? (float)$input['amount_max'] : null;

        if (!$nameAr) wfOut(['success'=>false,'message'=>'اسم القالب مطلوب'], 400);

        $nameArE = $conn->real_escape_string($nameAr);
        $nameEnE = $conn->real_escape_string($nameEn);
        $descE   = $conn->real_escape_string($desc);
        $amtMinS = $amtMin !== null ? $amtMin : 'NULL';
        $amtMaxS = $amtMax !== null ? $amtMax : 'NULL';

        $conn->query("
            UPDATE workflow_templates SET
                name_ar     = '$nameArE',
                name_en     = '$nameEnE',
                description = '$descE',
                is_active   = $active,
                amount_min  = $amtMinS,
                amount_max  = $amtMaxS
            WHERE id = $tplId
        ");

        wfLog($conn, $currentUserId, 'update_template', $tplId, "تعديل قالب #$tplId");
        wfOut(['success'=>true,'message'=>'تم تحديث القالب']);
    }

    // ── حذف قالب (يمنع حذف القوالب النظامية) ────────────────
    elseif ($action === 'delete_template') {
        $tplId = (int)($input['id'] ?? 0);
        if (!$tplId) wfOut(['success'=>false,'message'=>'id مطلوب'], 400);

        $tpl = $conn->query("SELECT is_system, template_key, name_ar FROM workflow_templates WHERE id=$tplId LIMIT 1")->fetch_assoc();
        if (!$tpl) wfOut(['success'=>false,'message'=>'القالب غير موجود'], 404);
        if ((int)$tpl['is_system']) wfOut(['success'=>false,'message'=>'لا يمكن حذف القوالب النظامية الأساسية (short / long)'], 403);

        // التحقق من الاستخدام في طلبات نشطة
        $key = $conn->real_escape_string($tpl['template_key']);
        $cr  = $conn->query("SELECT COUNT(*) AS c FROM purchase_requests WHERE workflow_path='$key' AND current_stage NOT IN ('completed','returned','rejected')");
        $cnt = (int)($cr->fetch_assoc()['c'] ?? 0);
        if ($cnt > 0) wfOut(['success'=>false,'message'=>"لا يمكن الحذف — يوجد $cnt طلب نشط يستخدم هذا القالب"], 409);

        $conn->query("DELETE FROM workflow_templates WHERE id=$tplId");
        wfLog($conn, $currentUserId, 'delete_template', $tplId, "حذف قالب: {$tpl['name_ar']}");
        wfOut(['success'=>true,'message'=>'تم حذف القالب']);
    }

    // ── إضافة مرحلة لقالب ────────────────────────────────────
    elseif ($action === 'add_stage') {
        $tplId   = (int)($input['template_id'] ?? 0);
        $stageKey = preg_replace('/[^a-z0-9_]/', '_', strtolower(trim($input['stage_key'] ?? '')));
        $nameAr  = trim(clean($input['stage_name_ar'] ?? ''));
        $nameEn  = trim(clean($input['stage_name_en'] ?? ''));
        $role    = trim(clean($input['responsible_role'] ?? ''));
        $perm    = trim(clean($input['responsible_perm'] ?? ''));
        $deptCode = trim(clean($input['responsible_dept_code'] ?? ''));
        $mandatory = (int)(bool)($input['is_mandatory'] ?? 1);
        $dual    = (int)(bool)($input['requires_dual_approval'] ?? 0);
        $canRej  = (int)(bool)($input['can_reject'] ?? 1);
        $notes   = trim(clean($input['notes'] ?? ''));
        $afterStage = trim($input['after_stage'] ?? ''); // إدراج بعد مرحلة معينة

        if (!$tplId || !$stageKey || !$nameAr) wfOut(['success'=>false,'message'=>'البيانات الإلزامية ناقصة'], 400);

        // التحقق من عدم تكرار المفتاح في نفس القالب
        $dup = $conn->query("SELECT id FROM workflow_stage_definitions WHERE template_id=$tplId AND stage_key='{$conn->real_escape_string($stageKey)}' LIMIT 1");
        if ($dup && $dup->num_rows) wfOut(['success'=>false,'message'=>'مفتاح المرحلة موجود مسبقاً في هذا القالب'], 409);

        // تحديد الترتيب: إذا حُدد after_stage، أدخل بعده وأزح الباقي
        if ($afterStage) {
            $afterRow = $conn->query("SELECT stage_order FROM workflow_stage_definitions WHERE template_id=$tplId AND stage_key='{$conn->real_escape_string($afterStage)}' LIMIT 1")->fetch_assoc();
            if ($afterRow) {
                $afterOrder = (int)$afterRow['stage_order'];
                // أزح كل المراحل التي ترتيبها أكبر من afterOrder
                $conn->query("UPDATE workflow_stage_definitions SET stage_order = stage_order + 1 WHERE template_id=$tplId AND stage_order > $afterOrder AND is_terminal=0");
                // أيضاً أزح مرحلة completed (terminal)
                $conn->query("UPDATE workflow_stage_definitions SET stage_order = stage_order + 1 WHERE template_id=$tplId AND is_terminal=1");
                $newOrder = $afterOrder + 1;
            } else {
                // إذا لم يُعثر على after_stage، أضف قبل completed
                $maxOrd = (int)($conn->query("SELECT MAX(stage_order) AS m FROM workflow_stage_definitions WHERE template_id=$tplId AND is_terminal=0")->fetch_assoc()['m'] ?? 0);
                $newOrder = $maxOrd + 1;
                $conn->query("UPDATE workflow_stage_definitions SET stage_order = stage_order + 1 WHERE template_id=$tplId AND is_terminal=1");
            }
        } else {
            // أضف قبل مرحلة completed (is_terminal=1)
            $maxOrd = (int)($conn->query("SELECT MAX(stage_order) AS m FROM workflow_stage_definitions WHERE template_id=$tplId AND is_terminal=0")->fetch_assoc()['m'] ?? 0);
            $newOrder = $maxOrd + 1;
            $conn->query("UPDATE workflow_stage_definitions SET stage_order = stage_order + 1 WHERE template_id=$tplId AND is_terminal=1");
        }

        $skE    = $conn->real_escape_string($stageKey);
        $arE    = $conn->real_escape_string($nameAr);
        $enE    = $conn->real_escape_string($nameEn);
        $roleS  = $role  ? "'{$conn->real_escape_string($role)}'"  : 'NULL';
        $permS  = $perm  ? "'{$conn->real_escape_string($perm)}'"  : 'NULL';
        $deptS  = $deptCode ? "'{$conn->real_escape_string($deptCode)}'" : 'NULL';
        $notesS = $conn->real_escape_string($notes);

        $conn->query("
            INSERT INTO workflow_stage_definitions
                (template_id, stage_key, stage_name_ar, stage_name_en, stage_order,
                 responsible_role, responsible_perm, responsible_dept_code,
                 is_mandatory, requires_dual_approval, is_terminal, can_reject, notes)
            VALUES
                ($tplId,'$skE','$arE','$enE',$newOrder,
                 $roleS,$permS,$deptS,
                 $mandatory,$dual,0,$canRej,'$notesS')
        ");
        $newId = $conn->insert_id;
        wfLog($conn, $currentUserId, 'add_stage', $tplId, "إضافة مرحلة: $nameAr (قالب #$tplId)");
        wfOut(['success'=>true,'id'=>$newId,'stage_order'=>$newOrder,'message'=>'تمت إضافة المرحلة']);
    }

    // ── تعديل مرحلة ──────────────────────────────────────────
    elseif ($action === 'update_stage') {
        $stageId = (int)($input['id'] ?? 0);
        if (!$stageId) wfOut(['success'=>false,'message'=>'id مطلوب'], 400);

        $nameAr   = trim(clean($input['stage_name_ar'] ?? ''));
        $nameEn   = trim(clean($input['stage_name_en'] ?? ''));
        $role     = trim(clean($input['responsible_role'] ?? ''));
        $perm     = trim(clean($input['responsible_perm'] ?? ''));
        $deptCode = trim(clean($input['responsible_dept_code'] ?? ''));
        $mandatory= (int)(bool)($input['is_mandatory'] ?? 1);
        $dual     = (int)(bool)($input['requires_dual_approval'] ?? 0);
        $canRej   = (int)(bool)($input['can_reject'] ?? 1);
        $notes    = trim(clean($input['notes'] ?? ''));

        if (!$nameAr) wfOut(['success'=>false,'message'=>'اسم المرحلة مطلوب'], 400);

        $arE    = $conn->real_escape_string($nameAr);
        $enE    = $conn->real_escape_string($nameEn);
        $roleS  = $role  ? "'{$conn->real_escape_string($role)}'"  : 'NULL';
        $permS  = $perm  ? "'{$conn->real_escape_string($perm)}'"  : 'NULL';
        $deptS  = $deptCode ? "'{$conn->real_escape_string($deptCode)}'" : 'NULL';
        $notesS = $conn->real_escape_string($notes);

        $conn->query("
            UPDATE workflow_stage_definitions SET
                stage_name_ar          = '$arE',
                stage_name_en          = '$enE',
                responsible_role       = $roleS,
                responsible_perm       = $permS,
                responsible_dept_code  = $deptS,
                is_mandatory           = $mandatory,
                requires_dual_approval = $dual,
                can_reject             = $canRej,
                notes                  = '$notesS'
            WHERE id = $stageId
        ");
        wfLog($conn, $currentUserId, 'update_stage', $stageId, "تعديل مرحلة #$stageId: $nameAr");
        wfOut(['success'=>true,'message'=>'تم تحديث المرحلة']);
    }

    // ── حذف مرحلة ────────────────────────────────────────────
    elseif ($action === 'delete_stage') {
        $stageId = (int)($input['id'] ?? 0);
        if (!$stageId) wfOut(['success'=>false,'message'=>'id مطلوب'], 400);

        $stage = $conn->query("SELECT * FROM workflow_stage_definitions WHERE id=$stageId LIMIT 1")->fetch_assoc();
        if (!$stage) wfOut(['success'=>false,'message'=>'المرحلة غير موجودة'], 404);
        if ((int)$stage['is_terminal']) wfOut(['success'=>false,'message'=>'لا يمكن حذف مرحلة الإتمام النهائية'], 403);
        if ($stage['stage_key'] === 'reception') wfOut(['success'=>false,'message'=>'لا يمكن حذف مرحلة الاستلام'], 403);
        if ((int)$stage['is_mandatory'] && $stage['stage_key'] !== 'reception') {
            // تحذير: المرحلة إلزامية — نسمح بالحذف لكن نسجّل
        }

        $tplId = (int)$stage['template_id'];
        $deletedOrder = (int)$stage['stage_order'];
        $conn->query("DELETE FROM workflow_stage_definitions WHERE id=$stageId");
        // إعادة ترتيب المراحل التالية
        $conn->query("UPDATE workflow_stage_definitions SET stage_order = stage_order - 1 WHERE template_id=$tplId AND stage_order > $deletedOrder");

        wfLog($conn, $currentUserId, 'delete_stage', $stageId, "حذف مرحلة: {$stage['stage_name_ar']} من قالب #$tplId");
        wfOut(['success'=>true,'message'=>'تم حذف المرحلة']);
    }

    // ── إعادة ترتيب المراحل (Drag & Drop) ───────────────────
    elseif ($action === 'reorder_stages') {
        $tplId  = (int)($input['template_id'] ?? 0);
        $orders = $input['orders'] ?? []; // [['id'=>X,'order'=>Y], ...]
        if (!$tplId || empty($orders)) wfOut(['success'=>false,'message'=>'بيانات الترتيب ناقصة'], 400);

        $conn->begin_transaction();
        try {
            foreach ($orders as $item) {
                $sid = (int)($item['id'] ?? 0);
                $ord = (int)($item['order'] ?? 0);
                if ($sid && $ord) {
                    $conn->query("UPDATE workflow_stage_definitions SET stage_order=$ord WHERE id=$sid AND template_id=$tplId");
                }
            }
            $conn->commit();
        } catch (\Exception $e) {
            $conn->rollback();
            wfOut(['success'=>false,'message'=>'فشل إعادة الترتيب: '.$e->getMessage()], 500);
        }
        wfLog($conn, $currentUserId, 'reorder_stages', $tplId, "إعادة ترتيب مراحل قالب #$tplId");
        wfOut(['success'=>true,'message'=>'تم حفظ الترتيب الجديد']);
    }

    // ── نسخ قالب ─────────────────────────────────────────────
    elseif ($action === 'clone_template') {
        $tplId  = (int)($input['id'] ?? 0);
        $newKey = preg_replace('/[^a-z0-9_]/', '_', strtolower(trim($input['new_key'] ?? '')));
        $newName = trim(clean($input['new_name'] ?? ''));
        if (!$tplId || !$newKey || !$newName) wfOut(['success'=>false,'message'=>'البيانات الإلزامية ناقصة'], 400);

        $dup = $conn->query("SELECT id FROM workflow_templates WHERE template_key='{$conn->real_escape_string($newKey)}' LIMIT 1");
        if ($dup && $dup->num_rows) wfOut(['success'=>false,'message'=>'المفتاح موجود مسبقاً'], 409);

        $src = $conn->query("SELECT * FROM workflow_templates WHERE id=$tplId LIMIT 1")->fetch_assoc();
        if (!$src) wfOut(['success'=>false,'message'=>'القالب المصدر غير موجود'], 404);

        $nameE  = $conn->real_escape_string($newName);
        $keyE   = $conn->real_escape_string($newKey);
        $amtMin = $src['amount_min'] !== null ? $src['amount_min'] : 'NULL';
        $amtMax = $src['amount_max'] !== null ? $src['amount_max'] : 'NULL';
        $lastOrd = (int)($conn->query("SELECT MAX(sort_order) AS m FROM workflow_templates")->fetch_assoc()['m'] ?? 0);

        $conn->query("
            INSERT INTO workflow_templates
                (name_ar, name_en, template_key, description, is_system, amount_min, amount_max, sort_order, created_by)
            VALUES
                ('$nameE','','$keyE','{$conn->real_escape_string($src['description'])}',0,$amtMin,$amtMax,".($lastOrd+1).",$currentUserId)
        ");
        $newTplId = $conn->insert_id;

        // نسخ جميع المراحل
        $stagesR = $conn->query("SELECT * FROM workflow_stage_definitions WHERE template_id=$tplId ORDER BY stage_order ASC");
        while ($st = $stagesR->fetch_assoc()) {
            $sk   = $conn->real_escape_string($st['stage_key']);
            $ar   = $conn->real_escape_string($st['stage_name_ar']);
            $en   = $conn->real_escape_string($st['stage_name_en']);
            $r    = $st['responsible_role']  ? "'{$conn->real_escape_string($st['responsible_role'])}'" : 'NULL';
            $p    = $st['responsible_perm']  ? "'{$conn->real_escape_string($st['responsible_perm'])}'" : 'NULL';
            $d    = $st['responsible_dept_code'] ? "'{$conn->real_escape_string($st['responsible_dept_code'])}'" : 'NULL';
            $nt   = $conn->real_escape_string($st['notes'] ?? '');
            $conn->query("
                INSERT INTO workflow_stage_definitions
                    (template_id, stage_key, stage_name_ar, stage_name_en, stage_order,
                     responsible_role, responsible_perm, responsible_dept_code,
                     is_mandatory, requires_dual_approval, is_terminal, can_reject, notes)
                VALUES
                    ($newTplId,'$sk','$ar','$en',{$st['stage_order']},
                     $r,$p,$d,
                     {$st['is_mandatory']},{$st['requires_dual_approval']},{$st['is_terminal']},{$st['can_reject']},'$nt')
            ");
        }
        wfLog($conn, $currentUserId, 'clone_template', $newTplId, "نسخ قالب #$tplId → $newName");
        wfOut(['success'=>true,'id'=>$newTplId,'message'=>'تم نسخ القالب بنجاح']);
    }

    // ── تعديل ترتيب القوالب نفسها ────────────────────────────
    elseif ($action === 'reorder_templates') {
        $orders = $input['orders'] ?? [];
        foreach ($orders as $item) {
            $id  = (int)($item['id'] ?? 0);
            $ord = (int)($item['order'] ?? 0);
            if ($id && $ord) $conn->query("UPDATE workflow_templates SET sort_order=$ord WHERE id=$id");
        }
        wfOut(['success'=>true,'message'=>'تم حفظ الترتيب']);
    }

    else {
        wfOut(['success'=>false,'message'=>'action غير معروف'], 400);
    }
}

else {
    wfOut(['success'=>false,'message'=>'Method غير مدعوم'], 405);
}

// ════════════════════════════════════════════════════════════
// تسجيل سجل التدقيق
// ════════════════════════════════════════════════════════════
function wfLog(\mysqli $conn, int $userId, string $action, int $targetId, string $desc): void {
    $userIdS = $userId;
    $aE = $conn->real_escape_string($action);
    $dE = $conn->real_escape_string($desc);
    @$conn->query("
        INSERT INTO security_log (user_id, action, description, ip_address, created_at)
        VALUES ($userIdS, 'workflow_config.$aE', '$dE — target_id=$targetId',
                '{$conn->real_escape_string($_SERVER['REMOTE_ADDR'] ?? '')}', NOW())
    ");
}