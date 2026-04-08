<?php
/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║          reports_api.php — API مركز التقارير الموحد                  ║
 * ║          نظام إدارة معاملات القطاع المالي                           ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * الموقع: api/reports_api.php
 *
 * Endpoints:
 *  GET ?action=transactions_summary  — ملخص المعاملات المالية
 *  GET ?action=purchase_requests     — طلبات الشراء
 *  GET ?action=bank_accounts         — الحسابات البنكية
 *  GET ?action=daily_payments        — المدفوعات اليومية
 *  GET ?action=employees_performance — أداء الموظفين
 *  GET ?action=budget_reservations   — حجوزات الموازنة
 *  GET ?action=correspondence        — الخطابات والمراسلات
 *  GET ?action=sla_compliance        — الامتثال لـ SLA
 *  GET ?action=global_stats          — الإحصائيات العامة لصفحة التقارير
 */

ob_start();
session_start();
session_write_close();
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

// معالج الأخطاء
set_exception_handler(function ($e) {
    if (ob_get_level()) ob_end_clean();
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'success' => false,
        'message' => 'خطأ: ' . $e->getMessage(),
    ], JSON_UNESCAPED_UNICODE);
    exit;
});

require_once __DIR__ . '/../includes/functions.php';

// ── التحقق من تسجيل الدخول ──────────────────────────────────────
if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    ob_end_clean();
    echo json_encode(['success' => false, 'message' => 'غير مصرح'], JSON_UNESCAPED_UNICODE);
    exit;
}

$currentUserId   = (int)$_SESSION['user_id'];
$permissionLevel = $_SESSION['permission_level'] ?? 'employee';
$action          = $_GET['action'] ?? '';

// ── مساعدات ─────────────────────────────────────────────────────
function jsonOut(array $data, int $code = 200): void {
    if (ob_get_level()) ob_end_clean();
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function getDateFilters(): array {
    $now = date('Y-m-d');
    $firstDay = date('Y-m-01');
    return [
        'from' => $_GET['date_from'] ?? $firstDay,
        'to'   => $_GET['date_to']   ?? $now,
    ];
}

function paginate(array $rows, int $page = 1, int $perPage = 50): array {
    $total   = count($rows);
    $offset  = ($page - 1) * $perPage;
    $items   = array_slice($rows, $offset, $perPage);
    return [
        'items'      => $items,
        'total'      => $total,
        'page'       => $page,
        'per_page'   => $perPage,
        'total_pages'=> (int)ceil($total / $perPage),
    ];
}

// ── محدد البيانات ────────────────────────────────────────────────
$conn    = db();
$dates   = getDateFilters();
$page    = max(1, (int)($_GET['page']    ?? 1));
$perPage = min(200, max(10, (int)($_GET['per_page'] ?? 50)));
$search  = trim($_GET['search'] ?? '');
$status  = trim($_GET['status'] ?? '');

try {

/* ════════════════════════════════════════════════════════════════
   1. الإحصائيات العامة لصفحة التقارير
   ════════════════════════════════════════════════════════════════ */
if ($action === 'global_stats') {
    $stats = [];

    // إجمالي المعاملات في الفترة
    $from = $conn->real_escape_string($dates['from']);
    $to   = $conn->real_escape_string($dates['to']);

    $r = $conn->query("SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status IN('paid','مدفوع','completed') THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN status NOT IN('paid','مدفوع','completed','rejected','مرفوض') THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN priority='urgent' OR is_urgent=1 THEN 1 ELSE 0 END) AS urgent,
        SUM(amount) AS total_amount
        FROM transactions
        WHERE DATE(created_at) BETWEEN '$from' AND '$to'");
    if ($r) {
        $row = $r->fetch_assoc();
        $stats['transactions'] = $row;
    }

    jsonOut(['success' => true, 'data' => $stats]);
}

/* ════════════════════════════════════════════════════════════════
   2. ملخص المعاملات المالية
   ════════════════════════════════════════════════════════════════ */
if ($action === 'transactions_summary') {
    $from   = $conn->real_escape_string($dates['from']);
    $to     = $conn->real_escape_string($dates['to']);
    $where  = ["DATE(t.created_at) BETWEEN '$from' AND '$to'"];

    if ($status) $where[] = "t.status='" . $conn->real_escape_string($status) . "'";
    if ($search) $where[] = "(t.transaction_number LIKE '%" . $conn->real_escape_string($search) . "%'
                              OR t.description LIKE '%" . $conn->real_escape_string($search) . "%')";

    $whereSQL = implode(' AND ', $where);

    $q = $conn->query("
        SELECT
            t.id,
            t.transaction_number AS number,
            tt.name AS type,
            t.amount,
            t.currency,
            t.status,
            d.name AS department,
            e.name AS created_by,
            t.created_at
        FROM transactions t
        LEFT JOIN transaction_types tt ON tt.id = t.type_id
        LEFT JOIN departments d        ON d.id  = t.department_id
        LEFT JOIN employees e          ON e.id  = t.created_by
        WHERE $whereSQL
        ORDER BY t.created_at DESC
    ");

    $rows = [];
    if ($q) while ($row = $q->fetch_assoc()) $rows[] = $row;

    // ملخص
    $qSum = $conn->query("
        SELECT
            COUNT(*) AS total,
            SUM(amount) AS total_amount,
            SUM(CASE WHEN status IN('paid','مدفوع','completed') THEN 1 ELSE 0 END) AS completed,
            SUM(CASE WHEN status NOT IN('paid','مدفوع','completed','rejected','مرفوض') THEN 1 ELSE 0 END) AS pending
        FROM transactions t
        WHERE $whereSQL
    ");
    $summary = $qSum ? $qSum->fetch_assoc() : [];

    $paged = paginate($rows, $page, $perPage);
    $paged['summary'] = $summary;

    jsonOut(['success' => true, 'data' => $paged]);
}

/* ════════════════════════════════════════════════════════════════
   3. طلبات الشراء
   ════════════════════════════════════════════════════════════════ */
if ($action === 'purchase_requests') {
    $from  = $conn->real_escape_string($dates['from']);
    $to    = $conn->real_escape_string($dates['to']);
    $where = ["DATE(pr.created_at) BETWEEN '$from' AND '$to'"];

    if ($status) $where[] = "pr.status='" . $conn->real_escape_string($status) . "'";
    if ($search) $where[] = "(pr.title LIKE '%" . $conn->real_escape_string($search) . "%'
                              OR pr.reference_number LIKE '%" . $conn->real_escape_string($search) . "%')";

    // فحص وجود جدول purchase_requests
    $chk = $conn->query("SHOW TABLES LIKE 'purchase_requests'");
    if (!$chk || $chk->num_rows === 0) {
        jsonOut(['success' => true, 'data' => ['items' => [], 'total' => 0], 'message' => 'جدول غير موجود']);
    }

    $whereSQL = implode(' AND ', $where);
    $q = $conn->query("
        SELECT
            pr.id,
            pr.reference_number AS id_display,
            pr.title,
            pr.total_amount,
            pr.status,
            pr.priority,
            e.name AS requester_name,
            d.name AS department_name,
            pr.created_at
        FROM purchase_requests pr
        LEFT JOIN employees e ON e.id = pr.created_by
        LEFT JOIN departments d ON d.id = pr.department_id
        WHERE $whereSQL
        ORDER BY pr.created_at DESC
    ");

    $rows = [];
    if ($q) while ($row = $q->fetch_assoc()) $rows[] = $row;

    jsonOut(['success' => true, 'data' => paginate($rows, $page, $perPage)]);
}

/* ════════════════════════════════════════════════════════════════
   4. الحسابات البنكية
   ════════════════════════════════════════════════════════════════ */
if ($action === 'bank_accounts') {
    $chk = $conn->query("SHOW TABLES LIKE 'bank_accounts'");
    if (!$chk || $chk->num_rows === 0) {
        jsonOut(['success' => true, 'data' => ['items' => [], 'total' => 0]]);
    }

    $where = ['1=1'];
    if ($status) $where[] = "ba.status='" . $conn->real_escape_string($status) . "'";
    if ($search) $where[] = "(ba.bank_name LIKE '%" . $conn->real_escape_string($search) . "%'
                              OR ba.account_number LIKE '%" . $conn->real_escape_string($search) . "%')";
    $whereSQL = implode(' AND ', $where);

    $q = $conn->query("
        SELECT
            ba.id, ba.bank_name, ba.account_number,
            ba.account_type, ba.currency, ba.balance,
            ba.status, ba.updated_at
        FROM bank_accounts ba
        WHERE $whereSQL
        ORDER BY ba.balance DESC
    ");

    $rows = [];
    if ($q) while ($row = $q->fetch_assoc()) $rows[] = $row;

    jsonOut(['success' => true, 'data' => paginate($rows, $page, $perPage)]);
}

/* ════════════════════════════════════════════════════════════════
   5. المدفوعات اليومية
   ════════════════════════════════════════════════════════════════ */
if ($action === 'daily_payments') {
    $from  = $conn->real_escape_string($dates['from']);
    $to    = $conn->real_escape_string($dates['to']);
    $where = ["DATE(dp.payment_date) BETWEEN '$from' AND '$to'"];

    if ($status) $where[] = "dp.status='" . $conn->real_escape_string($status) . "'";
    if ($search) $where[] = "(dp.description LIKE '%" . $conn->real_escape_string($search) . "%'
                              OR dp.reference LIKE '%" . $conn->real_escape_string($search) . "%')";

    $chk = $conn->query("SHOW TABLES LIKE 'daily_payments'");
    if (!$chk || $chk->num_rows === 0) {
        jsonOut(['success' => true, 'data' => ['items' => [], 'total' => 0]]);
    }

    $whereSQL = implode(' AND ', $where);
    $q = $conn->query("
        SELECT
            dp.id, dp.description, dp.amount,
            dp.payment_method, dp.reference,
            dp.status, dp.payment_date
        FROM daily_payments dp
        WHERE $whereSQL
        ORDER BY dp.payment_date DESC
    ");

    $rows = [];
    if ($q) while ($row = $q->fetch_assoc()) $rows[] = $row;

    jsonOut(['success' => true, 'data' => paginate($rows, $page, $perPage)]);
}

/* ════════════════════════════════════════════════════════════════
   6. أداء الموظفين
   ════════════════════════════════════════════════════════════════ */
if ($action === 'employees_performance') {
    $from  = $conn->real_escape_string($dates['from']);
    $to    = $conn->real_escape_string($dates['to']);
    $where = ['e.is_active = 1'];

    if ($search) $where[] = "(e.name LIKE '%" . $conn->real_escape_string($search) . "%'
                              OR d.name LIKE '%" . $conn->real_escape_string($search) . "%')";

    $whereSQL = implode(' AND ', $where);

    $q = $conn->query("
        SELECT
            e.id,
            e.name,
            d.name AS department,
            e.role,
            e.permission_level AS status,
            e.last_login AS last_activity,
            (SELECT COUNT(*) FROM transactions t WHERE t.created_by=e.id
             AND DATE(t.created_at) BETWEEN '$from' AND '$to') AS transactions_count,
            '—' AS avg_processing_time
        FROM employees e
        LEFT JOIN departments d ON d.id = e.department_id
        WHERE $whereSQL
        ORDER BY transactions_count DESC
    ");

    $rows = [];
    if ($q) while ($row = $q->fetch_assoc()) $rows[] = $row;

    jsonOut(['success' => true, 'data' => paginate($rows, $page, $perPage)]);
}

/* ════════════════════════════════════════════════════════════════
   7. حجوزات الموازنة
   ════════════════════════════════════════════════════════════════ */
if ($action === 'budget_reservations') {
    $from  = $conn->real_escape_string($dates['from']);
    $to    = $conn->real_escape_string($dates['to']);
    $where = ["DATE(br.created_at) BETWEEN '$from' AND '$to'"];

    if ($status) $where[] = "br.status='" . $conn->real_escape_string($status) . "'";
    if ($search) $where[] = "(br.title LIKE '%" . $conn->real_escape_string($search) . "%'
                              OR br.reservation_number LIKE '%" . $conn->real_escape_string($search) . "%')";

    $chk = $conn->query("SHOW TABLES LIKE 'budget_reservations'");
    if (!$chk || $chk->num_rows === 0) {
        jsonOut(['success' => true, 'data' => ['items' => [], 'total' => 0]]);
    }

    $whereSQL = implode(' AND ', $where);
    $q = $conn->query("
        SELECT
            br.id,
            br.reservation_number,
            br.title,
            br.reserved_amount,
            COALESCE(br.spent_amount, 0) AS spent_amount,
            br.status,
            d.name AS department,
            br.created_at
        FROM budget_reservations br
        LEFT JOIN departments d ON d.id = br.department_id
        WHERE $whereSQL
        ORDER BY br.created_at DESC
    ");

    $rows = [];
    if ($q) while ($row = $q->fetch_assoc()) $rows[] = $row;

    jsonOut(['success' => true, 'data' => paginate($rows, $page, $perPage)]);
}

/* ════════════════════════════════════════════════════════════════
   8. الخطابات والمراسلات
   ════════════════════════════════════════════════════════════════ */
if ($action === 'correspondence') {
    $from  = $conn->real_escape_string($dates['from']);
    $to    = $conn->real_escape_string($dates['to']);
    $where = ["DATE(c.created_at) BETWEEN '$from' AND '$to'"];

    if ($status) $where[] = "c.status='" . $conn->real_escape_string($status) . "'";
    if ($search) $where[] = "(c.subject LIKE '%" . $conn->real_escape_string($search) . "%'
                              OR c.reference_number LIKE '%" . $conn->real_escape_string($search) . "%')";

    $chk = $conn->query("SHOW TABLES LIKE 'correspondence'");
    if (!$chk || $chk->num_rows === 0) {
        jsonOut(['success' => true, 'data' => ['items' => [], 'total' => 0]]);
    }

    $whereSQL = implode(' AND ', $where);
    $q = $conn->query("
        SELECT
            c.id,
            c.reference_number,
            c.subject,
            c.type,
            COALESCE(c.sender_name, c.recipient_name, '—') AS from_to,
            c.status,
            c.priority,
            c.created_at AS date
        FROM correspondence c
        WHERE $whereSQL
        ORDER BY c.created_at DESC
    ");

    $rows = [];
    if ($q) while ($row = $q->fetch_assoc()) $rows[] = $row;

    jsonOut(['success' => true, 'data' => paginate($rows, $page, $perPage)]);
}

/* ════════════════════════════════════════════════════════════════
   9. تقرير امتثال SLA
   ════════════════════════════════════════════════════════════════ */
if ($action === 'sla_compliance') {
    $from = $conn->real_escape_string($dates['from']);
    $to   = $conn->real_escape_string($dates['to']);

    $q = $conn->query("
        SELECT
            d.name AS department,
            COUNT(t.id) AS total_transactions,
            SUM(CASE WHEN t.status IN('paid','مدفوع','completed') THEN 1 ELSE 0 END) AS on_time,
            SUM(CASE WHEN t.is_urgent=1 OR t.priority='urgent' THEN 1 ELSE 0 END) AS delayed,
            CONCAT(ROUND(
                SUM(CASE WHEN t.status IN('paid','مدفوع','completed') THEN 1 ELSE 0 END)
                / NULLIF(COUNT(t.id),0) * 100, 1
            ), '%') AS compliance_rate,
            '—' AS avg_time,
            CONCAT('$from', ' — ', '$to') AS period
        FROM transactions t
        LEFT JOIN departments d ON d.id = t.department_id
        WHERE DATE(t.created_at) BETWEEN '$from' AND '$to'
        GROUP BY d.id
        ORDER BY total_transactions DESC
    ");

    $rows = [];
    if ($q) while ($row = $q->fetch_assoc()) $rows[] = $row;

    jsonOut(['success' => true, 'data' => paginate($rows, $page, $perPage)]);
}

// إجراء غير معروف
jsonOut(['success' => false, 'message' => "إجراء غير معروف: $action"], 400);

} catch (Exception $e) {
    jsonOut(['success' => false, 'message' => $e->getMessage()], 500);
}