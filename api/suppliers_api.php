<?php
/**
 * suppliers_api.php
 * API إدارة الموردين (محلي / خارجي)
 * الموقع: api/suppliers_api.php
 */

ob_start();
session_start();
session_write_close();
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../includes/functions.php';

if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    ob_end_clean();
    echo json_encode(['success' => false, 'message' => 'يجب تسجيل الدخول أولاً'], JSON_UNESCAPED_UNICODE);
    exit;
}

$permissionLevel = $_SESSION['permission_level'] ?? 'employee';
$userId          = (int)$_SESSION['user_id'];
$action          = $_GET['action'] ?? $_POST['action'] ?? '';
$method          = $_SERVER['REQUEST_METHOD'];

// ── إنشاء جدول الموردين إذا لم يكن موجوداً ─────────────────
function ensureSuppliersTable(): void {
    $conn = db();
    $conn->query("
        CREATE TABLE IF NOT EXISTS suppliers (
            id            INT AUTO_INCREMENT PRIMARY KEY,
            name          VARCHAR(200) NOT NULL,
            category      VARCHAR(30)  NOT NULL DEFAULT 'محلي'
                          COMMENT 'محلي | خارجي',
            cr_number     VARCHAR(50)  DEFAULT NULL COMMENT 'السجل التجاري',
            vat_number    VARCHAR(50)  DEFAULT NULL COMMENT 'الرقم الضريبي',
            contact_name  VARCHAR(100) DEFAULT NULL,
            phone         VARCHAR(30)  DEFAULT NULL,
            email         VARCHAR(100) DEFAULT NULL,
            country       VARCHAR(80)  DEFAULT NULL,
            city          VARCHAR(80)  DEFAULT NULL,
            address       TEXT         DEFAULT NULL,
            notes         TEXT         DEFAULT NULL,
            is_active     TINYINT(1)   NOT NULL DEFAULT 1,
            added_by      INT          DEFAULT NULL,
            created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
            updated_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
    // أضف الأعمدة إذا كانت الجدول موجودة لكن الأعمدة ناقصة
    $cols = ['vat_number','contact_name','phone','email','country','city','address','notes','added_by'];
    foreach ($cols as $col) {
        $defs = [
            'vat_number'   => "VARCHAR(50) DEFAULT NULL",
            'contact_name' => "VARCHAR(100) DEFAULT NULL",
            'phone'        => "VARCHAR(30) DEFAULT NULL",
            'email'        => "VARCHAR(100) DEFAULT NULL",
            'country'      => "VARCHAR(80) DEFAULT NULL",
            'city'         => "VARCHAR(80) DEFAULT NULL",
            'address'      => "TEXT DEFAULT NULL",
            'notes'        => "TEXT DEFAULT NULL",
            'added_by'     => "INT DEFAULT NULL",
        ];
        @$conn->query("ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS `$col` {$defs[$col]}");
    }
}

ensureSuppliersTable();

$conn = db();

function jsonOut(array $data, int $code = 200): void {
    if (ob_get_level()) ob_end_clean();
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function esc(string $v): string {
    return db()->real_escape_string($v);
}

// ════════════════════════════════════════════════════════════
// GET
// ════════════════════════════════════════════════════════════
if ($method === 'GET') {

    // ── قائمة الموردين ──────────────────────────────────────
    if ($action === 'list') {
        $cat    = $_GET['category'] ?? ''; // 'محلي' | 'خارجي' | ''
        $search = esc(trim($_GET['search'] ?? ''));
        $active = $_GET['active'] ?? 'all'; // 'all' | '1' | '0'

        $where = ['1=1'];
        if ($cat !== '')    $where[] = "category = '" . esc($cat) . "'";
        if ($search !== '') $where[] = "(name LIKE '%$search%' OR cr_number LIKE '%$search%' OR contact_name LIKE '%$search%' OR phone LIKE '%$search%')";
        if ($active === '1') $where[] = 'is_active = 1';
        if ($active === '0') $where[] = 'is_active = 0';

        $sql = "SELECT s.*, e.name AS added_by_name
                FROM suppliers s
                LEFT JOIN employees e ON s.added_by = e.id
                WHERE " . implode(' AND ', $where) . "
                ORDER BY s.category, s.name";
        $r = $conn->query($sql);
        $rows = [];
        if ($r) while ($row = $r->fetch_assoc()) $rows[] = $row;
        jsonOut(['success' => true, 'data' => $rows]);
    }

    // ── مورد واحد ────────────────────────────────────────────
    elseif ($action === 'get') {
        $id = (int)($_GET['id'] ?? 0);
        if (!$id) jsonOut(['success' => false, 'message' => 'المعرّف مطلوب'], 400);
        $r = $conn->query("SELECT * FROM suppliers WHERE id=$id LIMIT 1");
        $row = $r ? $r->fetch_assoc() : null;
        if (!$row) jsonOut(['success' => false, 'message' => 'المورد غير موجود'], 404);
        jsonOut(['success' => true, 'data' => $row]);
    }

    else {
        jsonOut(['success' => false, 'message' => 'إجراء غير معروف'], 400);
    }
}

// ════════════════════════════════════════════════════════════
// POST
// ════════════════════════════════════════════════════════════
elseif ($method === 'POST') {
    $body = json_decode(file_get_contents('php://input'), true) ?: $_POST;

    // ── إضافة / تعديل مورد ──────────────────────────────────
    if (in_array($action, ['save', 'add', 'update'])) {

        $id       = (int)($body['id'] ?? 0);
        $name     = trim($body['name'] ?? '');
        $category = trim($body['category'] ?? 'محلي');
        $crNumber = trim($body['cr_number'] ?? '');
        $vatNum   = trim($body['vat_number'] ?? '');
        $contact  = trim($body['contact_name'] ?? '');
        $phone    = trim($body['phone'] ?? '');
        $email    = trim($body['email'] ?? '');
        $country  = trim($body['country'] ?? '');
        $city     = trim($body['city'] ?? '');
        $address  = trim($body['address'] ?? '');
        $notes    = trim($body['notes'] ?? '');
        $isActive = isset($body['is_active']) ? (int)$body['is_active'] : 1;

        if (!$name) jsonOut(['success' => false, 'message' => 'اسم المورد مطلوب'], 400);
        if (!in_array($category, ['محلي', 'خارجي']))
            $category = 'محلي';

        $nameE    = esc($name);
        $catE     = esc($category);
        $crE      = esc($crNumber);
        $vatE     = esc($vatNum);
        $contactE = esc($contact);
        $phoneE   = esc($phone);
        $emailE   = esc($email);
        $countryE = esc($country);
        $cityE    = esc($city);
        $addressE = esc($address);
        $notesE   = esc($notes);

        if ($id) {
            // تعديل
            $ok = $conn->query("
                UPDATE suppliers SET
                    name='$nameE', category='$catE', cr_number='$crE', vat_number='$vatE',
                    contact_name='$contactE', phone='$phoneE', email='$emailE',
                    country='$countryE', city='$cityE', address='$addressE',
                    notes='$notesE', is_active=$isActive
                WHERE id=$id
            ");
            if (!$ok) jsonOut(['success' => false, 'message' => 'فشل التعديل: ' . $conn->error], 500);
            jsonOut(['success' => true, 'message' => 'تم تعديل المورد بنجاح', 'id' => $id]);
        } else {
            // إضافة
            $ok = $conn->query("
                INSERT INTO suppliers (name, category, cr_number, vat_number,
                    contact_name, phone, email, country, city, address, notes, is_active, added_by)
                VALUES ('$nameE','$catE','$crE','$vatE',
                    '$contactE','$phoneE','$emailE','$countryE','$cityE','$addressE','$notesE',
                    $isActive, $userId)
            ");
            if (!$ok) jsonOut(['success' => false, 'message' => 'فشل الإضافة: ' . $conn->error], 500);
            $newId = $conn->insert_id;
            jsonOut(['success' => true, 'message' => 'تم إضافة المورد بنجاح', 'id' => $newId,
                     'supplier' => ['id' => $newId, 'name' => $name, 'category' => $category]]);
        }
    }

    // ── تفعيل / تعطيل ────────────────────────────────────────
    elseif ($action === 'toggle') {
        $id       = (int)($body['id'] ?? 0);
        $isActive = (int)($body['is_active'] ?? 0);
        if (!$id) jsonOut(['success' => false, 'message' => 'المعرّف مطلوب'], 400);
        $conn->query("UPDATE suppliers SET is_active=$isActive WHERE id=$id");
        jsonOut(['success' => true, 'message' => $isActive ? 'تم التفعيل' : 'تم الإيقاف']);
    }

    // ── حذف مورد ─────────────────────────────────────────────
    elseif ($action === 'delete') {
        if (!in_array($permissionLevel, ['system_admin', 'admin']))
            jsonOut(['success' => false, 'message' => 'غير مصرح'], 403);

        $id = (int)($body['id'] ?? 0);
        if (!$id) jsonOut(['success' => false, 'message' => 'المعرّف مطلوب'], 400);

        // تحقق هل يُستخدم في طلبات
        $used = $conn->query("SELECT COUNT(*) AS c FROM purchase_requests WHERE supplier_id=$id OR final_supplier_id=$id");
        $useCount = $used ? (int)$used->fetch_assoc()['c'] : 0;
        if ($useCount > 0)
            jsonOut(['success' => false, 'message' => "لا يمكن الحذف — المورد مرتبط بـ $useCount طلب. يمكنك إيقافه بدلاً من حذفه."], 400);

        $conn->query("DELETE FROM suppliers WHERE id=$id");
        jsonOut(['success' => true, 'message' => 'تم حذف المورد']);
    }

    // ── إضافة يدوية سريعة من نافذة الطلب ───────────────────
    // تُضيف مورداً وترجع بياناته فوراً لاستخدامه في القائمة
    elseif ($action === 'quick_add') {
        $name     = trim($body['name'] ?? '');
        $category = trim($body['category'] ?? 'محلي');
        $phone    = trim($body['phone'] ?? '');
        $notes    = trim($body['notes'] ?? '');

        if (!$name) jsonOut(['success' => false, 'message' => 'اسم المورد مطلوب'], 400);
        if (!in_array($category, ['محلي', 'خارجي'])) $category = 'محلي';

        $nameE  = esc($name);
        $catE   = esc($category);
        $phoneE = esc($phone);
        $notesE = esc($notes);

        $ok = $conn->query("
            INSERT INTO suppliers (name, category, phone, notes, is_active, added_by)
            VALUES ('$nameE', '$catE', '$phoneE', '$notesE', 1, $userId)
        ");
        if (!$ok) jsonOut(['success' => false, 'message' => 'فشل الإضافة: ' . $conn->error], 500);

        $newId = $conn->insert_id;
        jsonOut([
            'success'  => true,
            'message'  => 'تمت إضافة المورد بنجاح',
            'supplier' => [
                'id'       => $newId,
                'name'     => $name,
                'category' => $category,
                'phone'    => $phone,
            ],
        ]);
    }

    else {
        jsonOut(['success' => false, 'message' => 'إجراء غير معروف'], 400);
    }
}

else {
    jsonOut(['success' => false, 'message' => 'طريقة الطلب غير مدعومة'], 405);
}
