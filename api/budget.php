<?php
/**
 * API شاشة الحجوزات — Budget Reservations API
 * المسار: api/budget.php
 */
session_start();
header('Content-Type: application/json; charset=utf-8');

// ✅ المسار الصحيح لهذا المشروع
require_once __DIR__ . '/../includes/functions.php';

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'غير مصرح']);
    exit;
}

$userId   = (int)$_SESSION['user_id'];
$userRole = $_SESSION['user_role'] ?? 'employee';

try {
    $conn = db();
    ensureReservationsTables($conn);

    switch ($action) {

        // ── قائمة الحجوزات ──────────────────────────────────
        case 'list':
            $where = [];
            if (!in_array($userRole, ['admin', 'budget'])) {
                $deptId = getDepartmentByEmployee($conn, $userId);
                $where[] = $deptId ? "br.department_id = $deptId" : "br.requested_by = $userId";
            }
            if (!empty($_GET['status']))
                $where[] = "br.status = '".$conn->real_escape_string($_GET['status'])."'";
            if (!empty($_GET['department_id']))
                $where[] = "br.department_id = ".(int)$_GET['department_id'];
            if (!empty($_GET['fiscal_year']))
                $where[] = "br.fiscal_year = ".(int)$_GET['fiscal_year'];
            if (!empty($_GET['search'])) {
                $q = $conn->real_escape_string($_GET['search']);
                $where[] = "(br.reservation_number LIKE '%$q%' OR br.purpose LIKE '%$q%' OR br.items_description LIKE '%$q%')";
            }

            $wSql = $where ? 'WHERE '.implode(' AND ', $where) : '';
            $result = $conn->query("
                SELECT br.*,
                       d.name  AS department_name,
                       e.name  AS requested_by_name,
                       eb.name AS budget_employee_name,
                       COALESCE(s.name, br.supplier_name_manual) AS supplier_name,
                       t.transaction_number,
                       dd.dispatch_type,
                       dd.routed_to,
                       dd.status       AS dispatch_status,
                       dd.ola_active   AS dispatch_ola_active,
                       dd.dispatched_at,
                       dd.notes        AS dispatch_notes,
                       ed.name         AS dispatch_employee_name
                FROM budget_reservations br
                LEFT JOIN departments  d  ON br.department_id      = d.id
                LEFT JOIN employees    e  ON br.requested_by       = e.id
                LEFT JOIN employees    eb ON br.budget_employee_id = eb.id
                LEFT JOIN suppliers    s  ON br.supplier_id        = s.id
                LEFT JOIN transactions t  ON br.transaction_id     = t.id
                LEFT JOIN dispatch_data dd ON t.id = dd.transaction_id
                LEFT JOIN employees    ed ON dd.employee_id        = ed.id
                $wSql
                ORDER BY br.created_at DESC
                LIMIT 200
            ");
            $rows = [];
            if ($result) while ($r = $result->fetch_assoc()) $rows[] = $r;
            jsonResponse(['success' => true, 'data' => $rows]);
            break;

        // ── تفاصيل حجز ──────────────────────────────────────
        case 'get':
            $id  = (int)($_GET['id'] ?? 0);
            $res = $conn->query("
                SELECT br.*,
                       d.name  AS department_name,
                       e.name  AS requested_by_name,
                       eb.name AS budget_employee_name,
                       ea.name AS approved_by_name,
                       COALESCE(s.name, br.supplier_name_manual) AS supplier_name,
                       t.transaction_number, t.amount AS transaction_amount
                FROM budget_reservations br
                LEFT JOIN departments  d  ON br.department_id      = d.id
                LEFT JOIN employees    e  ON br.requested_by       = e.id
                LEFT JOIN employees    eb ON br.budget_employee_id = eb.id
                LEFT JOIN employees    ea ON br.approved_by        = ea.id
                LEFT JOIN suppliers    s  ON br.supplier_id        = s.id
                LEFT JOIN transactions t  ON br.transaction_id     = t.id
                WHERE br.id = $id LIMIT 1
            ");
            $row = $res ? $res->fetch_assoc() : null;
            if (!$row) { jsonResponse(['success' => false, 'error' => 'غير موجود']); break; }

            $logRes = $conn->query("
                SELECT l.*, e.name AS employee_name
                FROM budget_reservation_log l
                LEFT JOIN employees e ON l.employee_id = e.id
                WHERE l.reservation_id = $id
                ORDER BY l.created_at ASC
            ");
            $log = [];
            if ($logRes) while ($lr = $logRes->fetch_assoc()) $log[] = $lr;
            $row['log'] = $log;
            jsonResponse(['success' => true, 'data' => $row]);
            break;

        // ── إضافة حجز ───────────────────────────────────────
        case 'add':
            if ($method !== 'POST') { jsonResponse(['success'=>false,'error'=>'POST فقط']); break; }
            $body = json_decode(file_get_contents('php://input'), true) ?? [];

            $deptId   = (int)($body['department_id'] ?? 0);
            $purpose  = $conn->real_escape_string($body['purpose'] ?? '');
            $itemsDesc= $conn->real_escape_string($body['items_description'] ?? '');
            if (!$deptId || !$purpose || !$itemsDesc) {
                jsonResponse(['success' => false, 'error' => 'البيانات الأساسية مطلوبة']); break;
            }

            $number      = generateReservationNumber($conn);
            $fiscalYear  = (int)date('y');
            $priority    = $conn->real_escape_string($body['priority'] ?? 'عادي');
            $budgetCat   = $conn->real_escape_string($body['budget_category'] ?? '');
            $costCenter  = $conn->real_escape_string($body['cost_center'] ?? '');
            $suppId      = (!empty($body['supplier_id']) && $body['supplier_id'] !== 'manual')
                            ? (int)$body['supplier_id'] : 'NULL';
            $suppManual  = $conn->real_escape_string($body['supplier_name_manual'] ?? '');
            $quotNo      = $conn->real_escape_string($body['quotation_number'] ?? '');
            $quotDate    = !empty($body['quotation_date'])
                            ? "'".$conn->real_escape_string($body['quotation_date'])."'" : 'NULL';
            $qty         = (float)($body['quantity'] ?? 1);
            $unit        = $conn->real_escape_string($body['unit'] ?? '');
            $unitPrice   = (float)($body['unit_price'] ?? 0);
            $totalAmount = (float)($body['total_amount'] ?? 0);
            $vatAmount   = (float)($body['vat_amount'] ?? 0);
            $grandTotal  = (float)($body['grand_total'] ?? 0);
            $currency    = $conn->real_escape_string($body['currency'] ?? 'SAR');
            $reqDate     = $conn->real_escape_string($body['request_date'] ?? date('Y-m-d'));

            $sql = "INSERT INTO budget_reservations
                (reservation_number, fiscal_year, department_id, requested_by, request_date,
                 purpose, priority, budget_category, cost_center,
                 supplier_id, supplier_name_manual, quotation_number, quotation_date,
                 items_description, quantity, unit, unit_price,
                 total_amount, vat_amount, grand_total, currency, status)
                VALUES
                ('$number', $fiscalYear, $deptId, $userId, '$reqDate',
                 '$purpose', '$priority', '$budgetCat', '$costCenter',
                 $suppId, '$suppManual', '$quotNo', $quotDate,
                 '$itemsDesc', $qty, '$unit', $unitPrice,
                 $totalAmount, $vatAmount, $grandTotal, '$currency', 'قيد المراجعة')";

            if ($conn->query($sql)) {
                $newId = $conn->insert_id;
                logReservation($conn, $newId, $userId, 'create', null, 'قيد المراجعة', 'تم إنشاء الحجز');
                jsonResponse(['success' => true, 'id' => $newId, 'number' => $number]);
            } else {
                jsonResponse(['success' => false, 'error' => $conn->error]);
            }
            break;

        // ── مراجعة موظف الموازنة ────────────────────────────
        case 'review':
            if ($method !== 'POST') { jsonResponse(['success'=>false,'error'=>'POST فقط']); break; }
            if (!in_array($userRole, ['admin','budget'])) {
                jsonResponse(['success'=>false,'error'=>'صلاحية موظف الموازنة فقط']); break;
            }
            $body       = json_decode(file_get_contents('php://input'), true) ?? [];
            $id         = (int)($body['id'] ?? 0);
            $newStatus  = $conn->real_escape_string($body['status'] ?? '');
            $budgetCode = $conn->real_escape_string($body['budget_code'] ?? '');
            $budgetNotes= $conn->real_escape_string($body['budget_notes'] ?? '');
            $txId       = !empty($body['transaction_id']) ? (int)$body['transaction_id'] : 'NULL';
            $rejReason  = $conn->real_escape_string($body['rejection_reason'] ?? '');

            $old   = $conn->query("SELECT status FROM budget_reservations WHERE id=$id")->fetch_assoc();
            $oldSt = $old['status'] ?? '';

            $approvedFields = ($newStatus === 'معتمد') ? ", approved_by=$userId, approved_at=NOW()" : '';

            $conn->query("UPDATE budget_reservations SET
                status             = '$newStatus',
                budget_code        = '$budgetCode',
                budget_notes       = '$budgetNotes',
                budget_employee_id = $userId,
                budget_review_date = NOW(),
                transaction_id     = $txId,
                rejection_reason   = '$rejReason'
                $approvedFields
                WHERE id = $id");

            // ✅ مزامنة مع budget_data — INSERT إن لم يكن موجوداً، UPDATE إن كان موجوداً
            if ($txId !== 'NULL' && $txId > 0) {
                $conn->query("INSERT INTO budget_data
                    (transaction_id, employee_id, budget_code, budget_status, notes, review_date)
                    VALUES ($txId, $userId, '$budgetCode', '$newStatus', '$budgetNotes', NOW())
                    ON DUPLICATE KEY UPDATE
                        employee_id   = VALUES(employee_id),
                        budget_code   = VALUES(budget_code),
                        budget_status = VALUES(budget_status),
                        notes         = VALUES(notes),
                        review_date   = VALUES(review_date)");

                // ✅ تحديث OLA — تسجيل وقت المرحلة حسب الحالة الجديدة
                // هذا يضمن أن اعتماد الحجز يُسجَّل في stage_times تماماً كما لو تم من صفحة المعاملات
                recordStageTimeFromLastUpdate($txId, 'budget', $userId, $newStatus);
            }

            logReservation($conn, $id, $userId, 'review', $oldSt, $newStatus, $budgetNotes);
            jsonResponse(['success' => true]);
            break;

        // ── البيانات المساعدة ────────────────────────────────
        case 'meta':
            $depts = [];
            // ✅ departments فيها is_active
            $r = $conn->query("SELECT id, name, code FROM departments WHERE is_active=1 ORDER BY name");
            if ($r) while ($row = $r->fetch_assoc()) $depts[] = $row;

            $suppliers = [];
            // ✅ suppliers أُنشئت بـ ensureReservationsTables بدون is_active
            $r = $conn->query("SELECT id, name, cr_number, category FROM suppliers ORDER BY name");
            if ($r) while ($row = $r->fetch_assoc()) $suppliers[] = $row;

            $transactions = [];
            if (in_array($userRole, ['admin','budget'])) {
                $r = $conn->query("
                    SELECT t.id, t.transaction_number, t.amount, t.description,
                           bd.budget_status, bd.budget_code
                    FROM transactions t
                    LEFT JOIN budget_data bd ON t.id = bd.transaction_id
                    LEFT JOIN budget_reservations br ON t.id = br.transaction_id
                    WHERE br.id IS NULL
                    ORDER BY t.id DESC
                    LIMIT 100
                ");
                if ($r) while ($row = $r->fetch_assoc()) $transactions[] = $row;
            }
            jsonResponse(['success' => true, 'data' => [
                'departments'  => $depts,
                'suppliers'    => $suppliers,
                'transactions' => $transactions,
            ]]);
            break;

        default:
            jsonResponse(['success' => false, 'error' => 'action غير معروف']);
    }

} catch (Exception $e) {
    jsonResponse(['success' => false, 'error' => $e->getMessage()]);
}

// ════════════════════════════════════════════════════════════
//  دوال مساعدة
// ════════════════════════════════════════════════════════════

function generateReservationNumber($conn) {
    $year   = date('y');
    $result = $conn->query("
        SELECT MAX(CAST(SUBSTRING(reservation_number, 3) AS UNSIGNED)) AS maxSeq
        FROM budget_reservations WHERE fiscal_year = $year
    ");
    $row = $result->fetch_assoc();
    $seq = (int)($row['maxSeq'] ?? 0) + 1;
    return $year . str_pad($seq, 5, '0', STR_PAD_LEFT);
}

function getDepartmentByEmployee($conn, $empId) {
    $r = $conn->query("SELECT department_id FROM employees WHERE id=$empId LIMIT 1");
    if ($r && ($row = $r->fetch_assoc())) return (int)$row['department_id'];
    return 0;
}

function logReservation($conn, $reservationId, $empId, $action, $oldStatus, $newStatus, $notes = '') {
    $action    = $conn->real_escape_string($action);
    $oldStatus = $oldStatus ? "'".$conn->real_escape_string($oldStatus)."'" : 'NULL';
    $newStatus = $newStatus ? "'".$conn->real_escape_string($newStatus)."'" : 'NULL';
    $notes     = $conn->real_escape_string($notes);
    $conn->query("
        INSERT INTO budget_reservation_log (reservation_id, employee_id, action, old_status, new_status, notes)
        VALUES ($reservationId, $empId, '$action', $oldStatus, $newStatus, '$notes')
    ");
}

function ensureReservationsTables($conn) {
    // ✅ ينشئ الجداول تلقائياً بدل رمي exception
    $conn->query("CREATE TABLE IF NOT EXISTS suppliers (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        name         VARCHAR(150) NOT NULL,
        cr_number    VARCHAR(50)  DEFAULT NULL,
        vat_number   VARCHAR(50)  DEFAULT NULL,
        contact_name VARCHAR(100) DEFAULT NULL,
        phone        VARCHAR(30)  DEFAULT NULL,
        email        VARCHAR(100) DEFAULT NULL,
        category     VARCHAR(80)  DEFAULT NULL,
        created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $conn->query("INSERT IGNORE INTO suppliers (id, name, cr_number, category) VALUES
        (1, 'شركة التوريدات العامة',  '1010100001', 'مستلزمات مكتبية'),
        (2, 'مؤسسة التقنية الحديثة', '1010100002', 'تقنية المعلومات'),
        (3, 'شركة الخدمات اللوجستية','1010100003', 'شحن وتوصيل'),
        (4, 'مصنع المعدات الصناعية', '1010100004', 'معدات ومكائن')");

    $conn->query("CREATE TABLE IF NOT EXISTS budget_reservations (
        id                   INT AUTO_INCREMENT PRIMARY KEY,
        reservation_number   VARCHAR(20)  NOT NULL,
        fiscal_year          SMALLINT(4)  NOT NULL,
        department_id        INT          NOT NULL,
        requested_by         INT          NOT NULL,
        request_date         DATE         NOT NULL,
        purpose              VARCHAR(255) NOT NULL,
        priority             ENUM('عادي','عاجل','حرج') NOT NULL DEFAULT 'عادي',
        budget_category      VARCHAR(100) DEFAULT NULL,
        cost_center          VARCHAR(50)  DEFAULT NULL,
        supplier_id          INT          DEFAULT NULL,
        supplier_name_manual VARCHAR(150) DEFAULT NULL,
        quotation_number     VARCHAR(50)  DEFAULT NULL,
        quotation_date       DATE         DEFAULT NULL,
        items_description    TEXT         NOT NULL,
        quantity             DECIMAL(12,2) DEFAULT 1,
        unit                 VARCHAR(30)  DEFAULT NULL,
        unit_price           DECIMAL(15,2) DEFAULT 0,
        total_amount         DECIMAL(15,2) DEFAULT 0,
        vat_amount           DECIMAL(15,2) DEFAULT 0,
        grand_total          DECIMAL(15,2) DEFAULT 0,
        currency             VARCHAR(10)  DEFAULT 'SAR',
        attachment           VARCHAR(255) DEFAULT NULL,
        transaction_id       INT          DEFAULT NULL,
        budget_employee_id   INT          DEFAULT NULL,
        budget_code          VARCHAR(50)  DEFAULT NULL,
        budget_review_date   DATETIME     DEFAULT NULL,
        budget_notes         TEXT         DEFAULT NULL,
        status               ENUM('مسودة','قيد المراجعة','معتمد','مرفوض','ملغى','منفذ') DEFAULT 'مسودة',
        rejection_reason     TEXT         DEFAULT NULL,
        approved_by          INT          DEFAULT NULL,
        approved_at          DATETIME     DEFAULT NULL,
        created_at           TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
        updated_at           TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_reservation_number (reservation_number)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $conn->query("CREATE TABLE IF NOT EXISTS budget_reservation_log (
        id             INT AUTO_INCREMENT PRIMARY KEY,
        reservation_id INT         NOT NULL,
        employee_id    INT         DEFAULT NULL,
        action         VARCHAR(80) NOT NULL,
        old_status     VARCHAR(50) DEFAULT NULL,
        new_status     VARCHAR(50) DEFAULT NULL,
        notes          TEXT        DEFAULT NULL,
        created_at     TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (reservation_id) REFERENCES budget_reservations(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // إضافة department_id لموظفين إن لم يكن موجوداً
    $chk = $conn->query("SHOW COLUMNS FROM employees LIKE 'department_id'");
    if (!$chk || $chk->num_rows === 0)
        $conn->query("ALTER TABLE employees ADD COLUMN department_id INT DEFAULT NULL");
}