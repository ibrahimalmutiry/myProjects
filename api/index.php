<?php
/**
 * API للتعامل مع البيانات
 * Workflow System API
 */

// بدء الجلسة للوصول إلى بيانات المستخدم
session_start();

// تعطيل عرض الأخطاء في الإخراج (سيتم إرسالها كـ JSON)
error_reporting(E_ALL);
ini_set('display_errors', 0);
require_once dirname(__DIR__) . '/includes/permissions_functions.php';
// معالج الأخطاء
set_error_handler(function($severity, $message, $file, $line) {
    throw new ErrorException($message, 0, $severity, $file, $line);
});

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE');
header('Access-Control-Allow-Headers: Content-Type');

// التعامل مع طلبات OPTIONS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

try {
    require_once dirname(__DIR__) . '/includes/functions.php';
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'خطأ في تحميل الملفات: ' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
    exit;
} catch (Error $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'خطأ فادح: ' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
    exit;
}

// الحصول على نوع الطلب والإجراء
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

// ── دالة مساعدة: تأكد من وجود جدول system_settings ──────────
function ensureSystemSettingsTable($conn = null) {
    if (!$conn) $conn = db();
    $sql = "CREATE TABLE IF NOT EXISTS system_settings (
        id            INT          NOT NULL AUTO_INCREMENT,
        setting_key   VARCHAR(100) NOT NULL,
        setting_value VARCHAR(255) NOT NULL DEFAULT '',
        setting_label VARCHAR(200) DEFAULT NULL,
        setting_group VARCHAR(100) DEFAULT 'general',
        updated_by    INT          DEFAULT NULL,
        updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_key (setting_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4";
    $conn->query($sql);
}

// ── دالة مساعدة: جلب إعداد من system_settings ──────────────
function getSystemSetting(string $key, string $default = ''): string {
    $conn = db();
    $stmt = $conn->prepare('SELECT setting_value FROM system_settings WHERE setting_key=? LIMIT 1');
    if (!$stmt) return $default;
    $stmt->bind_param('s', $key);
    $stmt->execute();
    $result = $stmt->get_result();
    $row = $result ? $result->fetch_assoc() : null;
    $stmt->close();
    return ($row && $row['setting_value'] !== null) ? (string)$row['setting_value'] : $default;
}

// معالجة الطلبات
try {
    switch ($action) {

        // ─── الإحصائيات ───────────────────────────────────────
        case 'stats':
            $stats = getStats();
            jsonResponse(['success' => true, 'data' => $stats]);
            break;

        // ─── بيانات الرسم البياني ──────────────────────────────
        case 'chart':
            $data = getChartData();
            jsonResponse(['success' => true, 'data' => $data]);
            break;

        // ─── جميع المعاملات ────────────────────────────────────
        // case 'transactions':
        //     $filters = [
        //         'search'    => $_GET['search']    ?? '',
        //         'status'    => $_GET['status']    ?? '',
        //         'date_from' => $_GET['date_from'] ?? '',
        //         'date_to'   => $_GET['date_to']   ?? ''
        //     ];
        //     $transactions = getAllTransactions($filters);
        //     jsonResponse(['success' => true, 'data' => $transactions]);
        //     break;
        case 'transactions':
            $filters = [
                'search'   => $_GET['search']   ?? '',
                'status'   => $_GET['status']   ?? '',
                'date_from'=> $_GET['date_from']?? '',
                'date_to'  => $_GET['date_to']  ?? '',
            ];

            // إذا طُلب pagination
            if (isset($_GET['page'])) {
                $filters['page']     = (int)$_GET['page'];
                $filters['per_page'] = (int)($_GET['per_page'] ?? 25);
                $result = getAllTransactions($filters);
                jsonResponse(['success' => true, 'data' => $result['data'], 'pagination' => $result['pagination']]);
            } else {
                // سلوك قديم محفوظ
                $transactions = getAllTransactions($filters);
                jsonResponse(['success' => true, 'data' => $transactions]);
            }
            break;
        // ─── معاملة واحدة ──────────────────────────────────────
        case 'transaction':
            $id = (int)($_GET['id'] ?? 0);
            if ($id <= 0) {
                jsonResponse(['success' => false, 'message' => 'معرف غير صالح'], 400);
            }
            $transaction = getTransaction($id);
            if ($transaction) {
                jsonResponse(['success' => true, 'data' => $transaction]);
            } else {
                jsonResponse(['success' => false, 'message' => 'المعاملة غير موجودة'], 404);
            }
            break;

        // ─── المعاملات العاجلة ─────────────────────────────────
        case 'urgent':
            $transactions = getUrgentTransactions();
            jsonResponse(['success' => true, 'data' => $transactions]);
            break;

        // ─── الموظفين ──────────────────────────────────────────
        case 'employees':
            $role      = $_GET['role'] ?? null;
            $employees = getEmployees($role);
            jsonResponse(['success' => true, 'data' => $employees]);
            break;

        // ─── أنواع المعاملات ────────────────────────────────────
        case 'types':
            $types = getTransactionTypes();
            jsonResponse(['success' => true, 'data' => $types]);
            break;

        // ─── إضافة معاملة ──────────────────────────────────────
        case 'add':
            if ($method !== 'POST') {
                jsonResponse(['success' => false, 'message' => 'طريقة الطلب غير صحيحة'], 405);
            }
            $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
            if (strpos($contentType, 'multipart/form-data') !== false) {
                $input = $_POST;
                $file  = $_FILES['attachment'] ?? null;
            } else {
                $input = json_decode(file_get_contents('php://input'), true);
                $file  = null;
            }
            if (empty($input['type_id']) || empty($input['description']) || empty($input['amount'])) {
                jsonResponse(['success' => false, 'message' => 'جميع الحقول مطلوبة'], 400);
            }
            $id = addTransaction($input, $file);
            if ($id) {
                jsonResponse(['success' => true, 'message' => 'تم إضافة المعاملة بنجاح', 'id' => $id]);
            } else {
                jsonResponse(['success' => false, 'message' => 'فشل في إضافة المعاملة'], 500);
            }
            break;

        // ─── رفع مرفقات متعددة ─────────────────────────────────
        case 'upload_attachment':
            if ($method !== 'POST') {
                jsonResponse(['success' => false, 'message' => 'طريقة الطلب غير صحيحة'], 405);
            }
            $transactionId = (int)($_POST['transaction_id'] ?? 0);
            if ($transactionId <= 0) {
                jsonResponse(['success' => false, 'message' => 'معرف المعاملة غير صالح'], 400);
            }
            // دعم المرفقات المتعددة attachments[] أو الملف المفرد attachment
            $hasMultiple = !empty($_FILES['attachments']['name'][0]);
            $hasSingle   = !empty($_FILES['attachment']['tmp_name']);
            if (!$hasMultiple && !$hasSingle) {
                jsonResponse(['success' => false, 'message' => 'لم يتم اختيار ملف'], 400);
            }
            $displayNames = $_POST['attachment_labels'] ?? [];
            if ($hasMultiple) {
                $results = addTransactionAttachments($transactionId, $_FILES['attachments'], $displayNames);
                $failed  = array_filter($results, fn($r) => !$r['success']);
                jsonResponse([
                    'success' => count($failed) === 0,
                    'message' => count($failed) === 0 ? 'تم رفع المرفقات بنجاح' : 'فشل رفع ' . count($failed) . ' ملف/ملفات',
                    'uploaded' => count($results) - count($failed),
                ]);
            } else {
                $results = addTransactionAttachments($transactionId, $_FILES['attachment'], $displayNames);
                $ok      = !empty($results[0]['success']);
                jsonResponse(['success' => $ok, 'message' => $ok ? 'تم رفع الملف بنجاح' : ($results[0]['message'] ?? 'فشل الرفع')]);
            }
            break;

        // ─── حذف مرفق ──────────────────────────────────────────
        case 'delete_attachment':
            if ($method !== 'POST') {
                jsonResponse(['success' => false, 'message' => 'طريقة الطلب غير صحيحة'], 405);
            }
            $input         = json_decode(file_get_contents('php://input'), true);
            $attachmentId  = (int)($input['attachment_id']  ?? 0);
            $transactionId = (int)($input['transaction_id'] ?? 0);
            // حذف مرفق محدد بالـ ID (النظام الجديد)
            if ($attachmentId > 0 && $transactionId > 0) {
                if (deleteTransactionAttachment($attachmentId, $transactionId)) {
                    jsonResponse(['success' => true, 'message' => 'تم حذف المرفق']);
                } else {
                    jsonResponse(['success' => false, 'message' => 'فشل في حذف المرفق'], 500);
                }
            // حذف المرفق القديم بالـ transaction_id (للتوافق مع السجلات القديمة)
            } elseif ($transactionId > 0) {
                if (deleteAttachment($transactionId)) {
                    jsonResponse(['success' => true, 'message' => 'تم حذف المرفق']);
                } else {
                    jsonResponse(['success' => false, 'message' => 'فشل في حذف المرفق'], 500);
                }
            } else {
                jsonResponse(['success' => false, 'message' => 'معرف غير صالح'], 400);
            }
            break;

        // ─── تحديث بيانات الاستلام ─────────────────────────────
        case 'update_receiving':
            if ($method !== 'POST') {
                jsonResponse(['success' => false, 'message' => 'طريقة الطلب غير صحيحة'], 405);
            }
            $input = json_decode(file_get_contents('php://input'), true);
            $id    = (int)($input['transaction_id'] ?? 0);
            if ($id <= 0) {
                jsonResponse(['success' => false, 'message' => 'معرف غير صالح'], 400);
            }
            if (updateReceivingData($id, $input)) {
                jsonResponse(['success' => true, 'message' => 'تم تحديث بيانات الاستلام']);
            } else {
                jsonResponse(['success' => false, 'message' => 'فشل في التحديث'], 500);
            }
            break;

        // ─── تحديث بيانات الموازنة ─────────────────────────────
        case 'update_budget':
            if ($method !== 'POST') {
                jsonResponse(['success' => false, 'message' => 'طريقة الطلب غير صحيحة'], 405);
            }
            $input = json_decode(file_get_contents('php://input'), true);
            $id    = (int)($input['transaction_id'] ?? 0);
            if ($id <= 0) {
                jsonResponse(['success' => false, 'message' => 'معرف غير صالح'], 400);
            }
            if (updateBudgetData($id, $input)) {
                jsonResponse(['success' => true, 'message' => 'تم تحديث بيانات الموازنة']);
            } else {
                jsonResponse(['success' => false, 'message' => 'فشل في التحديث'], 500);
            }
            break;

        // ─── مرحلة الفرز (dispatch) ────────────────────────────

        // جلب قائمة انتظار الفرز
        case 'dispatch_queue':
            require_once __DIR__ . '/../includes/dispatch_functions.php';
            $filters = [
                'dispatch_type' => $_GET['dispatch_type'] ?? '',
            ];
            jsonResponse(['success' => true, 'data' => getDispatchQueue($filters)]);
            break;

        // جلب بيانات dispatch لمعاملة واحدة
        case 'dispatch_get':
            require_once __DIR__ . '/../includes/dispatch_functions.php';
            $id = (int)($_GET['id'] ?? 0);
            jsonResponse(['success' => true, 'data' => getDispatchData($id)]);
            break;

        // حفظ قرار الفرز
        case 'dispatch_save':
            if ($method !== 'POST') jsonResponse(['success' => false, 'message' => 'طريقة غير صحيحة'], 405);
            require_once __DIR__ . '/../includes/dispatch_functions.php';
            $input        = json_decode(file_get_contents('php://input'), true);
            $txId         = (int)($input['transaction_id'] ?? 0);
            $dispatchType = $input['dispatch_type'] ?? 'to_payment';
            $routedTo     = $input['routed_to'] ?? '';
            $notes        = $input['notes'] ?? '';
            $empId        = (int)($_SESSION['user_id'] ?? 0);
            if ($txId <= 0) jsonResponse(['success' => false, 'message' => 'معرف غير صالح'], 400);
            jsonResponse(saveDispatch($txId, $empId, $dispatchType, $routedTo, $notes));
            break;

        // استئناف للدفع بعد عودة أمر الشراء
        case 'dispatch_resume':
            if ($method !== 'POST') jsonResponse(['success' => false, 'message' => 'طريقة غير صحيحة'], 405);
            require_once __DIR__ . '/../includes/dispatch_functions.php';
            $input  = json_decode(file_get_contents('php://input'), true);
            $txId   = (int)($input['transaction_id'] ?? 0);
            $notes  = $input['notes'] ?? '';
            $empId  = (int)($_SESSION['user_id'] ?? 0);
            jsonResponse(resumeDispatchToPayment($txId, $empId, $notes));
            break;

        // ─── تحديث بيانات الدفع ────────────────────────────────
        case 'update_payment':
            if ($method !== 'POST') {
                jsonResponse(['success' => false, 'message' => 'طريقة الطلب غير صحيحة'], 405);
            }
            $input = json_decode(file_get_contents('php://input'), true);
            // تعيين طريقة الدفع تلقائياً
            $input['method'] = $input['method'] ?? 'تحويل بنكي';
            $id = (int)($input['transaction_id'] ?? 0);
            if ($id <= 0) {
                jsonResponse(['success' => false, 'message' => 'معرف غير صالح'], 400);
            }
            if (updatePaymentData($id, $input)) {
                jsonResponse(['success' => true, 'message' => 'تم تحديث بيانات الدفع']);
            } else {
                jsonResponse(['success' => false, 'message' => 'فشل في التحديث'], 500);
            }
            break;

        // ─── تحديث بيانات الفوترة ──────────────────────────────
        case 'update_invoice':
            if ($method !== 'POST') {
                jsonResponse(['success' => false, 'message' => 'طريقة الطلب غير صحيحة'], 405);
            }
            $input = json_decode(file_get_contents('php://input'), true);
            $id    = (int)($input['transaction_id'] ?? 0);
            if ($id <= 0) {
                jsonResponse(['success' => false, 'message' => 'معرف غير صالح'], 400);
            }
            if (updateInvoiceData($id, $input)) {
                jsonResponse(['success' => true, 'message' => 'تم تحديث بيانات الفوترة']);
            } else {
                jsonResponse(['success' => false, 'message' => 'فشل في التحديث'], 500);
            }
            break;

        // ─── حذف معاملة ────────────────────────────────────────
        case 'delete':
            if ($method !== 'POST' && $method !== 'DELETE') {
                jsonResponse(['success' => false, 'message' => 'طريقة الطلب غير صحيحة'], 405);
            }
            $input = json_decode(file_get_contents('php://input'), true);
            $id    = (int)($input['id'] ?? $_GET['id'] ?? 0);
            if ($id <= 0) {
                jsonResponse(['success' => false, 'message' => 'معرف غير صالح'], 400);
            }
            if (deleteTransaction($id)) {
                jsonResponse(['success' => true, 'message' => 'تم حذف المعاملة']);
            } else {
                jsonResponse(['success' => false, 'message' => 'فشل في الحذف'], 500);
            }
            break;

        // ─── سجل النشاطات ──────────────────────────────────────
        case 'activity':
            $transactionId = isset($_GET['transaction_id']) ? (int)$_GET['transaction_id'] : null;
            $logs          = getActivityLog($transactionId);
            jsonResponse(['success' => true, 'data' => $logs]);
            break;

        // ─── تقرير أوقات الموظفين ──────────────────────────────
        case 'employee_times':
            $employeeId = isset($_GET['employee_id']) ? (int)$_GET['employee_id'] : null;
            $stage      = $_GET['stage']     ?? null;
            $dateFrom   = $_GET['date_from'] ?? null;
            $dateTo     = $_GET['date_to']   ?? null;
            $data       = getEmployeeTimeReport($employeeId, $stage, $dateFrom, $dateTo);
            jsonResponse(['success' => true, 'data' => $data]);
            break;

        // ─── ملخص أداء الموظفين ────────────────────────────────
        case 'performance_summary':
            $dateFrom = $_GET['date_from'] ?? null;
            $dateTo   = $_GET['date_to']   ?? null;
            $data     = getEmployeePerformanceSummary($dateFrom, $dateTo);
            jsonResponse(['success' => true, 'data' => $data]);
            break;

        // ─── تفاصيل أداء موظف ──────────────────────────────────
        case 'employee_performance':
            $employeeId = isset($_GET['employee_id']) ? (int)$_GET['employee_id'] : 0;
            if ($employeeId <= 0) {
                jsonResponse(['success' => false, 'message' => 'معرف الموظف غير صالح'], 400);
            }
            $dateFrom = $_GET['date_from'] ?? null;
            $dateTo   = $_GET['date_to']   ?? null;
            $data     = getEmployeePerformanceDetails($employeeId, $dateFrom, $dateTo);
            jsonResponse(['success' => true, 'data' => $data]);
            break;

        // ─── أحداث المعاملة ────────────────────────────────────
        case 'transaction_events':
            $transactionId = isset($_GET['transaction_id']) ? (int)$_GET['transaction_id'] : 0;
            if ($transactionId <= 0) {
                jsonResponse(['success' => false, 'message' => 'معرف المعاملة غير صالح'], 400);
            }
            $stage  = $_GET['stage'] ?? null;
            $events = getTransactionEvents($transactionId, $stage);
            jsonResponse(['success' => true, 'data' => $events]);
            break;

        // ─── جميع الأحداث ──────────────────────────────────────
        case 'all_events':
            $limit      = isset($_GET['limit'])       ? (int)$_GET['limit'] : 50;
            $stage      = $_GET['stage']              ?? null;
            $employeeId = isset($_GET['employee_id']) ? (int)$_GET['employee_id'] : null;
            $events     = getAllEvents($limit, $stage, $employeeId);
            jsonResponse(['success' => true, 'data' => $events]);
            break;
        
            /* ── نهاية الـ PATCH ── أضف هذا قبل default: في الـ switch ── */
        // ═══════════════════════════════════════════════════════
        //  APIs الودائع البنكية
        // ═══════════════════════════════════════════════════════

        // ─── الحسابات البنكية ───────────────────────────────────
        case 'bank_accounts':
            require_once __DIR__ . '/../includes/bank_functions.php';
            $accounts = getAllBankAccounts();
            jsonResponse(['success' => true, 'data' => $accounts]);
            break;

        // ─── جميع الودائع البنكية ──────────────────────────────
        case 'bank_deposits':
            require_once __DIR__ . '/../includes/bank_functions.php';
            $limit    = isset($_GET['limit']) ? (int)$_GET['limit'] : null;
            $deposits = getAllDeposits($limit);
            jsonResponse(['success' => true, 'data' => $deposits]);
            break;

        // ─── الأرصدة اليومية ───────────────────────────────────
        case 'daily_balances':
            require_once __DIR__ . '/../includes/bank_functions.php';
            $limit    = isset($_GET['limit']) ? (int)$_GET['limit'] : 30;
            $accountId = isset($_GET['account_id']) ? (int)$_GET['account_id'] : null;
            $balances = getDailyBalances($limit, $accountId);
            jsonResponse(['success' => true, 'data' => $balances]);
            break;

        // ─── إضافة إيداع بنكي ──────────────────────────────────
        case 'add_deposit':
            if ($method !== 'POST') {
                jsonResponse(['success' => false, 'message' => 'طريقة الطلب غير صحيحة'], 405);
            }
            require_once __DIR__ . '/../includes/bank_functions.php';
            $input  = json_decode(file_get_contents('php://input'), true);
            $result = addDeposit($input);
            jsonResponse($result);
            break;

        // ─── إضافة حساب بنكي ───────────────────────────────────
        case 'add_bank_account':
            if ($method !== 'POST') {
                jsonResponse(['success' => false, 'message' => 'طريقة الطلب غير صحيحة'], 405);
            }
            require_once __DIR__ . '/../includes/bank_functions.php';
            $input  = json_decode(file_get_contents('php://input'), true);
            $result = addBankAccount($input);
            jsonResponse($result);
            break;

        // ─── تعديل حساب بنكي ───────────────────────────────────
        case 'update_bank_account':
            if ($method !== 'POST') {
                jsonResponse(['success' => false, 'message' => 'طريقة الطلب غير صحيحة'], 405);
            }
            require_once __DIR__ . '/../includes/bank_functions.php';
            $input = json_decode(file_get_contents('php://input'), true);
            $id    = (int)($input['id'] ?? 0);
            if ($id <= 0) {
                jsonResponse(['success' => false, 'message' => 'معرف الحساب غير صالح'], 400);
            }
            $result = updateBankAccount($id, $input);
            jsonResponse($result);
            break;

        // ─── تأكيد إيداع بنكي ──────────────────────────────────
        case 'confirm_deposit':
            if ($method !== 'POST') {
                jsonResponse(['success' => false, 'message' => 'طريقة الطلب غير صحيحة'], 405);
            }
            require_once __DIR__ . '/../includes/bank_functions.php';
            $input  = json_decode(file_get_contents('php://input'), true);
            $result = confirmDeposit((int)($input['id'] ?? 0));
            jsonResponse($result);
            break;

        // ─── تسجيل رصيد يومي ───────────────────────────────────
        case 'record_daily_balance':
            if ($method !== 'POST') {
                jsonResponse(['success' => false, 'message' => 'طريقة الطلب غير صحيحة'], 405);
            }
            require_once __DIR__ . '/../includes/bank_functions.php';
            $input  = json_decode(file_get_contents('php://input'), true);
            $result = recordDailyBalance($input);
            jsonResponse($result);
            break;

        // ─── إحصاءات البنوك ────────────────────────────────────
        case 'bank_stats':
            require_once __DIR__ . '/../includes/bank_functions.php';
            $stats = getBankStats();
            jsonResponse(['success' => true, 'data' => $stats]);
            break;

        // ═══════════════════════════════════════════════════════
        //  APIs الودائع الشهرية المجدولة  ← جديد
        // ═══════════════════════════════════════════════════════

        // ─── جلب ودائع الشهر ───────────────────────────────────
        case 'monthly_deposits':
            require_once __DIR__ . '/../includes/bank_functions.php';
            require_once __DIR__ . '/../includes/bank_monthly_functions.php';
            $month    = (int)($_GET['month'] ?? date('m'));
            $year     = (int)($_GET['year']  ?? date('Y'));
            $deposits = getMonthlyDeposits($month, $year);
            jsonResponse(['success' => true, 'data' => $deposits]);
            break;

        // ─── إحصاءات ودائع الشهر ───────────────────────────────
        case 'monthly_deposit_stats':
            require_once __DIR__ . '/../includes/bank_functions.php';
            require_once __DIR__ . '/../includes/bank_monthly_functions.php';
            $month = (int)($_GET['month'] ?? date('m'));
            $year  = (int)($_GET['year']  ?? date('Y'));
            $stats = getMonthlyDepositStats($month, $year);
            jsonResponse(['success' => true, 'data' => $stats]);
            break;

        // ─── إضافة وديعة شهرية مجدولة ─────────────────────────
        case 'add_monthly_deposit':
            if ($method !== 'POST') {
                jsonResponse(['success' => false, 'message' => 'طريقة الطلب غير صحيحة'], 405);
            }
            require_once __DIR__ . '/../includes/bank_functions.php';
            require_once __DIR__ . '/../includes/bank_monthly_functions.php';
            $input  = json_decode(file_get_contents('php://input'), true);
            $result = addMonthlyDeposit($input);
            jsonResponse($result);
            break;

        // ─── تأكيد وديعة شهرية ─────────────────────────────────
        case 'confirm_monthly_deposit':
            if ($method !== 'POST') {
                jsonResponse(['success' => false, 'message' => 'طريقة الطلب غير صحيحة'], 405);
            }
            require_once __DIR__ . '/../includes/bank_functions.php';
            require_once __DIR__ . '/../includes/bank_monthly_functions.php';
            $input  = json_decode(file_get_contents('php://input'), true);
            $id     = (int)($input['id'] ?? 0);
            if ($id <= 0) {
                jsonResponse(['success' => false, 'message' => 'معرف الوديعة غير صالح'], 400);
            }
            $result = confirmMonthlyDeposit($id);
            jsonResponse($result);
            break;

        // ─── حذف وديعة شهرية ───────────────────────────────────
        case 'delete_monthly_deposit':
            if ($method !== 'POST') {
                jsonResponse(['success' => false, 'message' => 'طريقة الطلب غير صحيحة'], 405);
            }
            require_once __DIR__ . '/../includes/bank_functions.php';
            require_once __DIR__ . '/../includes/bank_monthly_functions.php';
            $input  = json_decode(file_get_contents('php://input'), true);
            $id     = (int)($input['id'] ?? 0);
            if ($id <= 0) {
                jsonResponse(['success' => false, 'message' => 'معرف الوديعة غير صالح'], 400);
            }
            $result = deleteMonthlyDeposit($id);
            jsonResponse($result);
            break;

        // ═══════════════════════════════════════════════════════
        //  APIs السجل اليومي
        // ═══════════════════════════════════════════════════════

        // ─── إحصاءات يوم ───────────────────────────────────────
        case 'daily_register_stats':
            require_once __DIR__ . '/../includes/daily_register_functions.php';
            $date  = $_GET['date'] ?? date('Y-m-d');
            $stats = getTodayFullStats($date);
            jsonResponse(['success' => true, 'data' => $stats]);
            break;

        // ─── تاريخ السجلات ─────────────────────────────────────
        case 'daily_register_history':
            require_once __DIR__ . '/../includes/daily_register_functions.php';
            $history = getDailyRegisterHistory(30);
            jsonResponse(['success' => true, 'data' => $history]);
            break;

        // ─── حفظ أرصدة اليوم ───────────────────────────────────
        case 'save_daily_register':
            if ($method !== 'POST') {
                jsonResponse(['success' => false, 'message' => 'طريقة الطلب غير صحيحة'], 405);
            }
            require_once __DIR__ . '/../includes/daily_register_functions.php';
            $input  = json_decode(file_get_contents('php://input'), true);
            $result = saveDailyRegister(
                $input['date'],
                $input['bank1_balance'] ?? 0,
                $input['bank2_balance'] ?? 0,
                $input['notes']         ?? ''
            );
            jsonResponse($result);
            break;

        // ─── تحميل المصروفات ────────────────────────────────────
        case 'daily_expenses':
            require_once __DIR__ . '/../includes/daily_register_functions.php';
            $date     = $_GET['date'] ?? date('Y-m-d');
            $expenses = getDailyExpenses($date);
            jsonResponse(['success' => true, 'data' => $expenses]);
            break;

        // ─── إضافة مصروف ───────────────────────────────────────
        case 'add_daily_expense':
            if ($method !== 'POST') {
                jsonResponse(['success' => false, 'message' => 'طريقة الطلب غير صحيحة'], 405);
            }
            require_once __DIR__ . '/../includes/daily_register_functions.php';
            $input  = json_decode(file_get_contents('php://input'), true);
            $result = addDailyExpense(
                $input['date'],
                $input['supplier_name'],
                $input['amount'],
                $input['description'] ?? ''
            );
            jsonResponse($result);
            break;

        // ─── حذف مصروف ─────────────────────────────────────────
        case 'delete_daily_expense':
            if ($method !== 'POST') {
                jsonResponse(['success' => false, 'message' => 'طريقة الطلب غير صحيحة'], 405);
            }
            require_once __DIR__ . '/../includes/daily_register_functions.php';
            $input  = json_decode(file_get_contents('php://input'), true);
            $result = deleteDailyExpense((int)($input['id'] ?? 0));
            jsonResponse($result);
            break;

        // ─── الودائع النشطة ────────────────────────────────────
        case 'active_deposits':
            require_once __DIR__ . '/../includes/daily_register_functions.php';
            $deposits = getActiveDeposits();
            jsonResponse(['success' => true, 'data' => $deposits]);
            break;


        // ═══════════════════════════════════════════════════════
        //  APIs الودائع الاستثمارية
        // ═══════════════════════════════════════════════════════

        case 'investments':
            require_once __DIR__ . '/../includes/bank_investment_functions.php';
            $status = $_GET['status'] ?? null;
            $data   = getAllInvestments($status);
            jsonResponse(['success' => true, 'data' => $data]);
            break;

        case 'investment':
            require_once __DIR__ . '/../includes/bank_investment_functions.php';
            $id  = (int)($_GET['id'] ?? 0);
            if ($id <= 0) jsonResponse(['success' => false, 'message' => 'معرف غير صالح'], 400);
            $inv = getInvestment($id);
            $inv ? jsonResponse(['success' => true, 'data' => $inv])
                 : jsonResponse(['success' => false, 'message' => 'الوديعة غير موجودة'], 404);
            break;

        case 'investment_stats':
            require_once __DIR__ . '/../includes/bank_investment_functions.php';
            jsonResponse(['success' => true, 'data' => getInvestmentStats()]);
            break;

        case 'investment_transactions':
            require_once __DIR__ . '/../includes/bank_investment_functions.php';
            $id = (int)($_GET['id'] ?? 0);
            if ($id <= 0) jsonResponse(['success' => false, 'message' => 'معرف غير صالح'], 400);
            jsonResponse(['success' => true, 'data' => getInvestmentTransactions($id)]);
            break;

        case 'create_investment':
            if ($method !== 'POST') jsonResponse(['success' => false, 'message' => 'طريقة غير صحيحة'], 405);
            require_once __DIR__ . '/../includes/bank_investment_functions.php';
            $input  = json_decode(file_get_contents('php://input'), true);
            $result = createInvestment($input);
            jsonResponse($result);
            break;

        case 'mature_investment':
            if ($method !== 'POST') jsonResponse(['success' => false, 'message' => 'طريقة غير صحيحة'], 405);
            require_once __DIR__ . '/../includes/bank_investment_functions.php';
            $input  = json_decode(file_get_contents('php://input'), true);
            $id     = (int)($input['id'] ?? 0);
            if ($id <= 0) jsonResponse(['success' => false, 'message' => 'معرف غير صالح'], 400);
            jsonResponse(matureInvestment($id, $input['actual_profit'] ?? null));
            break;




        case 'update_investment':
            if ($method !== 'POST') jsonResponse(['success' => false, 'message' => 'طريقة غير صحيحة'], 405);
            require_once __DIR__ . '/../includes/bank_investment_functions.php';
            $input = json_decode(file_get_contents('php://input'), true);
            $id    = (int)($input['id'] ?? 0);
            if ($id <= 0) jsonResponse(['success' => false, 'message' => 'معرف غير صالح'], 400);
            jsonResponse(updateInvestment($id, $input));
            break;



        case 'cancel_investment':
            if ($method !== 'POST') jsonResponse(['success' => false, 'message' => 'طريقة غير صحيحة'], 405);
            require_once __DIR__ . '/../includes/bank_investment_functions.php';
            $input  = json_decode(file_get_contents('php://input'), true);
            $id     = (int)($input['id'] ?? 0);
            if ($id <= 0) jsonResponse(['success' => false, 'message' => 'معرف غير صالح'], 400);
            $partialProfit = (float)($input['partial_profit'] ?? 0);
            jsonResponse(cancelInvestment($id, $input['notes'] ?? '', $partialProfit));
            break;


        // ═══════════════════════════════════════════════════════
        //  APIs  نظام SLA / OLA
        // ═══════════════════════════════════════════════════════

        // ─── إحصاءات SLA السريعة ────────────────────────────────
        case 'sla_stats':
            require_once __DIR__ . '/../includes/sla_functions.php';
            jsonResponse(['success' => true, 'data' => getSlaStats()]);
            break;

        // ─── لوحة SLA الكاملة ────────────────────────────────────
        case 'sla_dashboard':
            require_once __DIR__ . '/../includes/sla_functions.php';
            $filters = [
                'sla_status' => $_GET['sla_status'] ?? '',
            ];
            jsonResponse(['success' => true, 'data' => getSlaDashboard($filters)]);
            break;

        // ─── حالة SLA لمعاملة واحدة ─────────────────────────────
        case 'sla_transaction':
            require_once __DIR__ . '/../includes/sla_functions.php';
            $id = (int)($_GET['id'] ?? 0);
            if ($id <= 0) jsonResponse(['success' => false, 'message' => 'معرف غير صالح'], 400);
            jsonResponse(['success' => true, 'data' => getTransactionSlaStatus($id)]);
            break;

        // ─── سجل التجاوزات ────────────────────────────────────────
        case 'sla_breaches':
            require_once __DIR__ . '/../includes/sla_functions.php';
            $filters = [
                'type'        => $_GET['type'] ?? '',
                'employee_id' => $_GET['employee_id'] ?? '',
                'resolved'    => $_GET['resolved'] ?? '',
            ];
            $limit = (int)($_GET['limit'] ?? 50);
            jsonResponse(['success' => true, 'data' => getSlaBreachLog($limit, $filters)]);
            break;

        // ─── تشغيل فحص دوري يدوي ─────────────────────────────────
        case 'sla_run_check':
            require_once __DIR__ . '/../includes/sla_functions.php';
            require_once __DIR__ . '/../includes/notification_functions.php';
            $result = runSlaBatchCheckFull();
            jsonResponse(['success' => true, 'data' => $result]);
            break;

        // ─── حل تجاوز──────────────────────────────────────────────
        case 'sla_resolve_breach':
            if ($method !== 'POST') jsonResponse(['success' => false, 'message' => 'طريقة غير صحيحة'], 405);
            require_once __DIR__ . '/../includes/sla_functions.php';
            $input = json_decode(file_get_contents('php://input'), true);
            jsonResponse(resolveSlaBreachById((int)($input['id'] ?? 0)));
            break;

        // ─── جلب سياسات SLA ──────────────────────────────────────
        case 'sla_policies':
            require_once __DIR__ . '/../includes/sla_functions.php';
            jsonResponse(['success' => true, 'data' => getAllSlaPolicies()]);
            break;

        // ─── حفظ سياسة SLA ───────────────────────────────────────
        case 'sla_save_policy':
            if ($method !== 'POST') jsonResponse(['success' => false, 'message' => 'طريقة غير صحيحة'], 405);
            require_once __DIR__ . '/../includes/sla_functions.php';
            $input = json_decode(file_get_contents('php://input'), true);
            jsonResponse(saveSlaPolicy($input));
            break;

        // ─── حفظ قاعدة OLA ───────────────────────────────────────
        case 'sla_save_ola_rule':
            if ($method !== 'POST') jsonResponse(['success' => false, 'message' => 'طريقة غير صحيحة'], 405);
            require_once __DIR__ . '/../includes/sla_functions.php';
            $input = json_decode(file_get_contents('php://input'), true);
            jsonResponse(saveOlaRule($input));
            break;

        // ─── تشغيل فحص معاملة واحدة ──────────────────────────────
        case 'sla_check_transaction':
            if ($method !== 'POST') jsonResponse(['success' => false, 'message' => 'طريقة غير صحيحة'], 405);
            require_once __DIR__ . '/../includes/sla_functions.php';
            $input = json_decode(file_get_contents('php://input'), true);
            $id    = (int)($input['id'] ?? 0);
            if ($id <= 0) jsonResponse(['success' => false, 'message' => 'معرف غير صالح'], 400);
            jsonResponse(['success' => true, 'data' => checkTransactionSla($id)]);
            break;

        // ─── تصعيد يدوي لمرحلة ───────────────────────────────────
        case 'sla_manual_escalate':
            if ($method !== 'POST') jsonResponse(['success' => false, 'message' => 'طريقة غير صحيحة'], 405);
            require_once __DIR__ . '/../includes/sla_functions.php';
            $input = json_decode(file_get_contents('php://input'), true);
            $txId  = (int)($input['transaction_id'] ?? 0);
            $stage = $input['stage'] ?? '';
            if ($txId <= 0 || empty($stage))
                jsonResponse(['success' => false, 'error' => 'بيانات ناقصة'], 400);
            $userId = (int)($_SESSION['user_id'] ?? 0);
            jsonResponse(manualEscalateStage($txId, $stage, $userId));
            break;
            // ─── جلب صلاحيات موظف ─────────────────────────────────────────
        case 'get_employee_permissions':
            $empId = (int)($_GET['employee_id'] ?? 0);
            if (!$empId) {
                jsonResponse(['success' => false, 'error' => 'employee_id مطلوب']);
                break;
            }
            // فقط مدير النظام يمكنه رؤية صلاحيات الآخرين
            if (($_SESSION['permission_level'] ?? '') !== 'system_admin' && $_SESSION['user_id'] != $empId) {
                jsonResponse(['success' => false, 'error' => 'غير مصرح']);
                break;
            }
            $perms = getEmployeePermissions($empId);
            jsonResponse(['success' => true, 'data' => $perms]);
            break;

        // ─── حفظ صلاحيات موظف ────────────────────────────────────────
        case 'save_employee_permissions':
            if ($_SESSION['permission_level'] !== 'system_admin') {
                jsonResponse(['success' => false, 'error' => 'غير مصرح — مدير النظام فقط']);
                break;
            }
            $body  = json_decode(file_get_contents('php://input'), true) ?? [];
            $empId = (int)($body['employee_id'] ?? 0);
            if (!$empId) {
                jsonResponse(['success' => false, 'error' => 'employee_id مطلوب']);
                break;
            }
            $ok = saveEmployeePermissions($empId, $body);
            jsonResponse(['success' => $ok, 'error' => $ok ? null : 'خطأ في الحفظ']);
            break;

        // ─── جلب صلاحيات المستخدم الحالي (يُستخدم عند تحديث الجلسة) ─
        case 'my_permissions':
            $userId = (int)($_SESSION['user_id'] ?? 0);
            if (!$userId) {
                jsonResponse(['success' => false, 'error' => 'غير مسجل']);
                break;
            }
            loadUserPermissionsToSession($userId);
            jsonResponse([
                'success'          => true,
                'permission_level' => $_SESSION['permission_level'],
                'can_delete'       => $_SESSION['can_delete'],
                'page_permissions' => $_SESSION['page_permissions'],
            ]);
            break;
        
        // ─── الإشعارات (SLA/OLA مخصصة لكل موظف) ──────────────────

        // ─── الملف الشخصي للموظف ──────────────────────────────────
        case 'employee_profile':
            $uid = (int)($_SESSION['user_id'] ?? 0);
            if (!$uid) jsonResponse(['success'=>false,'message'=>'غير مسجل'],401);
            $conn = db();
            $r = $conn->query("
                SELECT e.*, d.name AS department_name,
                       sup.name AS supervisor_name
                FROM employees e
                LEFT JOIN departments d ON e.department_id = d.id
                LEFT JOIN employees sup ON e.supervisor_id = sup.id
                WHERE e.id = $uid LIMIT 1");
            if ($r && $r->num_rows > 0) {
                $row = $r->fetch_assoc();
                unset($row['password']);
                jsonResponse(['success'=>true,'data'=>$row]);
            } else {
                jsonResponse(['success'=>false,'message'=>'الموظف غير موجود'],404);
            }
            break;

        // ─── إحصاءات الموظف ──────────────────────────────────────
        case 'employee_stats':
            $uid = (int)($_SESSION['user_id'] ?? 0);
            if (!$uid) jsonResponse(['success'=>false],401);
            $conn = db();

            // إجمالي المعاملات ذات الصلة
            $totalRes = $conn->query("
                SELECT COUNT(DISTINCT t.id) AS cnt
                FROM transactions t
                LEFT JOIN receiving_data r ON t.id = r.transaction_id
                LEFT JOIN budget_data    b ON t.id = b.transaction_id
                LEFT JOIN payment_data   p ON t.id = p.transaction_id
                LEFT JOIN invoice_data   i ON t.id = i.transaction_id
                WHERE r.employee_id = $uid OR b.employee_id = $uid
                   OR p.employee_id = $uid OR i.employee_id = $uid
                   OR t.created_by  = $uid");
            $total = $totalRes ? (int)$totalRes->fetch_assoc()['cnt'] : 0;

            // مكتملة
            $doneRes = $conn->query("
                SELECT COUNT(DISTINCT t.id) AS cnt FROM transactions t
                LEFT JOIN invoice_data i ON t.id = i.transaction_id
                WHERE i.status IN ('صدرت الفاتورة','مكتملة','تمت الفوترة')
                  AND (i.employee_id = $uid OR t.created_by = $uid)");
            $done = $doneRes ? (int)$doneRes->fetch_assoc()['cnt'] : 0;

            // تصعيدات
            $escRes = $conn->query("
                SELECT COUNT(*) AS cnt FROM system_notifications
                WHERE category IN ('ola_breach','sla_breach','escalation','manual_escalation')
                  AND (employee_id = $uid OR recipient_id = $uid)");
            $esc = $escRes ? (int)$escRes->fetch_assoc()['cnt'] : 0;

            jsonResponse(['success'=>true,'data'=>[
                'total_transactions'     => $total,
                'completed_transactions' => $done,
                'pending_transactions'   => max(0, $total - $done),
                'escalations'            => $esc,
            ]]);
            break;

        // ─── معاملات الموظف ──────────────────────────────────────
        case 'employee_transactions':
            $uid   = (int)($_SESSION['user_id'] ?? 0);
            $limit = (int)($_GET['limit'] ?? 10);
            if (!$uid) jsonResponse(['success'=>false],401);
            $conn  = db();
            $res   = $conn->query("
                SELECT DISTINCT t.id, t.transaction_number, tt.name AS transaction_type,
                       t.amount, t.created_at,
                       COALESCE(r.updated_at, b.updated_at, p.updated_at, i.updated_at) AS update_time,
                       CASE
                           WHEN i.employee_id = $uid THEN 'invoice'
                           WHEN p.employee_id = $uid THEN 'payment'
                           WHEN b.employee_id = $uid THEN 'budget'
                           WHEN r.employee_id = $uid THEN 'receiving'
                           ELSE 'receiving'
                       END AS stage,
                       COALESCE(i.status, p.status, b.budget_status, r.status) AS status
                FROM transactions t
                LEFT JOIN transaction_types tt ON t.type_id = tt.id
                LEFT JOIN receiving_data r ON t.id = r.transaction_id
                LEFT JOIN budget_data    b ON t.id = b.transaction_id
                LEFT JOIN payment_data   p ON t.id = p.transaction_id
                LEFT JOIN invoice_data   i ON t.id = i.transaction_id
                WHERE r.employee_id = $uid OR b.employee_id = $uid
                   OR p.employee_id = $uid OR i.employee_id = $uid
                   OR t.created_by  = $uid
                ORDER BY update_time DESC, t.created_at DESC
                LIMIT $limit");
            $rows = [];
            if ($res) while ($row = $res->fetch_assoc()) $rows[] = $row;
            jsonResponse(['success'=>true,'data'=>$rows]);
            break;

        case 'notifications':
            require_once __DIR__ . '/../includes/notification_functions.php';
            $limit  = (int)($_GET['limit'] ?? 50);
            $userId = (int)($_SESSION['user_id'] ?? 0);

            // جلب تنبيهات SLA/OLA (لها is_read من system_notifications)
            $slaNotifs = $userId ? getSlaNotificationsForUser($userId, $limit) : [];

            // جلب تنبيهات المعاملات (ليس لها is_read — نجلبها من system_notifications)
            $txNotifs = getRecentNotifications(30);

            // جلب حالة القراءة لتنبيهات المعاملات من system_notifications
            if (!empty($txNotifs) && $userId > 0) {
                $conn = db();
                // جلب كل transaction_ids التي قرأها هذا المستخدم
                $readRes = $conn->query("
                    SELECT DISTINCT transaction_id
                    FROM system_notifications
                    WHERE is_read = 1
                      AND (employee_id = $userId OR employee_id IS NULL OR recipient_id = $userId)
                      AND transaction_id IS NOT NULL
                ");
                $readTxIds = [];
                if ($readRes) {
                    while ($r = $readRes->fetch_assoc()) {
                        $readTxIds[(int)$r['transaction_id']] = true;
                    }
                }
                // تطبيق is_read على كل تنبيه معاملة
                foreach ($txNotifs as &$tx) {
                    $txId = (int)($tx['id'] ?? 0);
                    $tx['is_read'] = isset($readTxIds[$txId]) ? 1 : 0;
                    // ضمان وجود حقل id فريد للتنبيه
                    $tx['notif_key'] = 'tx_' . $txId . '_' . ($tx['stage'] ?? '');
                }
                unset($tx);
            }

            $all = array_merge($slaNotifs, $txNotifs);
            usort($all, fn($a,$b) => strtotime($b['update_time'] ?? $b['created_at'] ?? '0')
                                   - strtotime($a['update_time'] ?? $a['created_at'] ?? '0'));

            $unread = count(array_filter($all, fn($n) => !($n['is_read'] ?? false)));
            jsonResponse([
                'success'      => true,
                'data'         => array_slice($all, 0, $limit),
                'unread_count' => $unread,
            ]);
            break;

        // ─── جلب الإشعارات الداخلية ──────────────────────────────
        case 'system_notifications':
            require_once __DIR__ . '/../includes/notification_functions.php';
            $userId     = (int)($_SESSION['user_id'] ?? 0);
            $limit      = (int)($_GET['limit'] ?? 50);
            $unreadOnly = ($_GET['unread'] ?? '0') === '1';
            jsonResponse(['success' => true, 'data' => getSystemNotifications($userId, $limit, $unreadOnly)]);
            break;

        // ─── عدد الإشعارات غير المقروءة ──────────────────────────
        case 'unread_count':
            require_once __DIR__ . '/../includes/notification_functions.php';
            $userId = (int)($_SESSION['user_id'] ?? 0);
            jsonResponse(['success' => true, 'count' => getUnreadNotificationCount($userId)]);
            break;

        // ─── تعليم إشعار كمقروء ──────────────────────────────────
        case 'read_notification':
        case 'mark_notification_read':
            if ($method !== 'POST') jsonResponse(['success' => false, 'message' => 'طريقة غير صحيحة'], 405);
            require_once __DIR__ . '/../includes/notification_functions.php';
            $input         = json_decode(file_get_contents('php://input'), true);
            $userId        = (int)($_SESSION['user_id'] ?? 0);
            $notifId       = (int)($input['notification_id'] ?? $input['id'] ?? 0);
            $transactionId = (int)($input['transaction_id'] ?? 0);

            if ($notifId > 0) {
                // تعليم تنبيه system_notifications كمقروء
                jsonResponse(markNotificationRead($notifId, $userId));
            } elseif ($transactionId > 0) {
                // تنبيه معاملة — أنشئ سجل قراءة في system_notifications
                $conn = db();
                $conn->query("
                    INSERT INTO system_notifications
                        (type, category, title, message, transaction_id, employee_id, is_read, read_at, created_at)
                    VALUES
                        ('info','tx_read','قراءة معاملة','',{$transactionId},{$userId},1,NOW(),NOW())
                    ON DUPLICATE KEY UPDATE is_read=1, read_at=NOW()
                ");
                jsonResponse(['success' => true]);
            } else {
                jsonResponse(['success' => false, 'message' => 'معرف غير صالح'], 400);
            }
            break;

        // ─── تعليم كل الإشعارات كمقروءة ─────────────────────────
        case 'mark_all_notifications_read':
        case 'read_all_notifications':
        case 'clear_all':
            if ($method !== 'POST') jsonResponse(['success' => false, 'message' => 'طريقة غير صحيحة'], 405);
            require_once __DIR__ . '/../includes/notification_functions.php';
            $userId = (int)($_SESSION['user_id'] ?? 0);
            jsonResponse(markAllNotificationsRead($userId));
            break;

        // ─── جلب إعدادات الإشعارات ───────────────────────────────
        case 'notification_settings':
            require_once __DIR__ . '/../includes/notification_functions.php';
            $settings = getNotificationSettings();
            foreach (['smtp_pass', 'ms_client_secret'] as $k) {
                if (!empty($settings[$k])) $settings[$k] = '••••••••';
            }
            jsonResponse(['success' => true, 'data' => $settings]);
            break;

        // ─── حفظ إعدادات الإشعارات ───────────────────────────────
        case 'save_notification_settings':
            if ($method !== 'POST') jsonResponse(['success' => false, 'message' => 'طريقة غير صحيحة'], 405);
            require_once __DIR__ . '/../includes/notification_functions.php';
            $input = json_decode(file_get_contents('php://input'), true);
            foreach (['smtp_pass', 'ms_client_secret'] as $k) {
                if (isset($input[$k]) && strpos($input[$k], '•') !== false) unset($input[$k]);
            }
            jsonResponse(saveNotificationSettings($input));
            break;

        // ─── اختبار SMTP ──────────────────────────────────────────
        case 'test_smtp':
            if ($method !== 'POST') jsonResponse(['success' => false, 'message' => 'طريقة غير صحيحة'], 405);
            require_once __DIR__ . '/../includes/notification_functions.php';
            $input = json_decode(file_get_contents('php://input'), true);
            $email = $input['test_email'] ?? '';
            if (!filter_var($email, FILTER_VALIDATE_EMAIL))
                jsonResponse(['success' => false, 'message' => 'بريد إلكتروني غير صالح'], 400);
            jsonResponse(testSmtpConnection($email));
            break;

        // ─── اختبار Exchange ──────────────────────────────────────
        case 'test_exchange':
            if ($method !== 'POST') jsonResponse(['success' => false, 'message' => 'طريقة غير صحيحة'], 405);
            require_once __DIR__ . '/../includes/notification_functions.php';
            $input = json_decode(file_get_contents('php://input'), true);
            $email = $input['test_email'] ?? '';
            if (!filter_var($email, FILTER_VALIDATE_EMAIL))
                jsonResponse(['success' => false, 'message' => 'بريد إلكتروني غير صالح'], 400);
            jsonResponse(testExchangeConnection($email));
            break;

        // ─── SLA للمراسلات ────────────────────────────────────────
        case 'sla_check_correspondence':
            if ($method !== 'POST') jsonResponse(['success' => false, 'message' => 'طريقة غير صحيحة'], 405);
            require_once __DIR__ . '/../includes/sla_functions.php';
            $input = json_decode(file_get_contents('php://input'), true);
            $id    = (int)($input['id'] ?? 0);
            if ($id <= 0) jsonResponse(['success' => false, 'message' => 'معرف غير صالح'], 400);
            jsonResponse(['success' => true, 'data' => checkCorrespondenceSla($id)]);
            break;

        case 'sla_email_escalations':
            require_once __DIR__ . '/../includes/sla_functions.php';
            $params = [
                'type'      => $_GET['type']      ?? '',
                'date_from' => $_GET['date_from']  ?? '',
                'date_to'   => $_GET['date_to']    ?? '',
                'limit'     => (int)($_GET['limit'] ?? 100),
            ];
            jsonResponse(['success' => true, 'data' => getSlaEmailEscalations($params)]);
            break;
        
        case 'set_priority':
            $input    = json_decode(file_get_contents('php://input'), true) ?? [];
            $id       = (int)($input['id']       ?? 0);
            $priority = $input['priority']        ?? 'normal';
            $note     = $input['note']            ?? null;
            if ($id <= 0) { jsonResponse(['success'=>false,'message'=>'معرف غير صالح'],400); break; }
            jsonResponse(setTransactionPriority($id, $priority, $note));
            break;
        
        
        

        // ════════════════════════════════════════════════════════
        //  المدفوعات اليومية
        // ════════════════════════════════════════════════════════
        case 'get_pending_payments':
            $conn = db();
            $typeFilter = isset($_GET['type']) ? (int)$_GET['type'] : 0;

            $sql = "
                SELECT
                    t.id, t.transaction_number, t.transaction_date,
                    t.description, t.amount, t.priority,
                    IFNULL(t.currency, 'SAR') AS currency,
                    IFNULL(t.exchange_rate, 1) AS exchange_rate,
                    tt.name  AS transaction_type,
                    ts.name  AS sub_type,
                    ec.name  AS created_by_name,
                    r.status AS receive_status,
                    b.budget_status AS budget_status,
                    b.budget_code,
                    d.status AS dispatch_status,
                    p.status AS payment_status,
                    p.payment_method, p.payment_date,
                    p.reference_number AS payment_ref,
                    ep.name AS payment_employee,
                    TIMESTAMPDIFF(MINUTE, t.created_at, NOW()) AS total_elapsed_min,
                    COALESCE(sp.total_hours, 3) * 60 AS sla_allowed_min,
                    ROUND(
                        TIMESTAMPDIFF(MINUTE, t.created_at, NOW()) /
                        (COALESCE(sp.total_hours, 3) * 60) * 100
                    , 1) AS sla_pct
                FROM transactions t
                LEFT JOIN transaction_types tt  ON t.type_id     = tt.id
                LEFT JOIN transaction_types ts  ON t.sub_type_id = ts.id
                LEFT JOIN employees ec          ON t.created_by  = ec.id
                LEFT JOIN receiving_data r      ON t.id = r.transaction_id
                LEFT JOIN budget_data b         ON t.id = b.transaction_id
                LEFT JOIN dispatch_data d       ON t.id = d.transaction_id
                LEFT JOIN payment_data p        ON t.id = p.transaction_id
                LEFT JOIN employees ep          ON p.employee_id = ep.id
                LEFT JOIN sla_policies sp       ON (sp.transaction_type_id = t.type_id
                                                    OR sp.transaction_type_id IS NULL)
                                               AND sp.is_active = 1
                                               AND sp.scope IN ('transaction','all')
                WHERE (p.status = 'معلق' OR p.status IS NULL)
                  AND b.budget_status IS NOT NULL
                  AND (p.status IS NULL OR p.status != 'تم الدفع')
            ";
            if ($typeFilter) $sql .= " AND t.type_id = $typeFilter";
            $sql .= " ORDER BY FIELD(t.priority,'urgent','high','normal'), sla_pct DESC, t.created_at ASC";

            $rows = [];
            $res  = $conn->query($sql);
            if ($res) while ($row = $res->fetch_assoc()) $rows[] = $row;

            $olaRes = $conn->query("SELECT allowed_hours*60 AS m FROM ola_rules WHERE stage='payment' LIMIT 1");
            $olaMin = $olaRes ? (float)($olaRes->fetch_assoc()['m'] ?? 18) : 18;

            foreach ($rows as &$r2) {
                $tid = (int)$r2['id'];
                $ev  = $conn->query("SELECT TIMESTAMPDIFF(MINUTE, MAX(created_at), NOW()) AS elapsed FROM transaction_events WHERE transaction_id=$tid AND stage IN ('budget','dispatch') HAVING elapsed IS NOT NULL");
                $evRow = $ev ? $ev->fetch_assoc() : null;
                $r2['ola_elapsed_min'] = $evRow['elapsed'] ?? 0;
                $r2['ola_allowed_min'] = $olaMin;
                $r2['ola_pct'] = $olaMin > 0 ? round((float)$r2['ola_elapsed_min'] / $olaMin * 100, 1) : 0;
            }
            jsonResponse(['success' => true, 'data' => $rows, 'count' => count($rows)]);
            break;

        case 'issue_payment_order':
            $conn = db();
            $input    = json_decode(file_get_contents('php://input'), true) ?? [];
            $ids      = array_map('intval', $input['ids']    ?? []);
            $method   = 'تحويل بنكي'; // ثابت دائماً
            $notes    = trim($input['notes']  ?? '');
            $orderRef = 'PO-' . date('Ymd') . '-' . strtoupper(substr(uniqid(), -5));

            if (empty($ids)) { jsonResponse(['success' => false, 'message' => 'لم يتم تحديد أي معاملات']); break; }

            $now = date('Y-m-d H:i:s');
            $updated = []; $failed = [];

            foreach ($ids as $tid) {
                $ok = updatePaymentData($tid, [
                    'status'    => 'تم الدفع',
                    'method'    => $method,
                    'reference' => $orderRef,
                    'notes'     => $notes ?: "أمر دفع يومي: $orderRef",
                ]);
                $ok ? $updated[] = $tid : $failed[] = $tid;
            }

            $details = [];
            if (!empty($updated)) {
                $in = implode(',', $updated);
                $r2 = $conn->query("SELECT t.id, t.transaction_number, t.description, t.amount, IFNULL(t.currency,'SAR') AS currency, IFNULL(t.amount_sar, t.amount) AS amount_sar, tt.name AS transaction_type, ec.name AS created_by_name, b.budget_code FROM transactions t LEFT JOIN transaction_types tt ON t.type_id=tt.id LEFT JOIN employees ec ON t.created_by=ec.id LEFT JOIN budget_data b ON t.id=b.transaction_id WHERE t.id IN ($in) ORDER BY t.transaction_number");
                if ($r2) while ($row = $r2->fetch_assoc()) {
                    $row['payment_date'] = $now; $row['payment_method'] = $method; $row['order_ref'] = $orderRef;
                    $details[] = $row;
                }
            }

            $sigReviewer = getSystemSetting('signer_reviewer') ?: '';
            $sigApprover = getSystemSetting('signer_approver') ?: '';
            jsonResponse([
                'success'        => true,
                'order_ref'      => $orderRef,
                'updated'        => count($updated),
                'failed'         => count($failed),
                'details'        => $details,
                'total_amount'   => array_sum(array_column($details, 'amount')),
                'issued_by'      => $_SESSION['user_name'] ?? 'النظام',
                'issued_at'      => $now,
                'method'         => $method,
                'signer_reviewer'=> $sigReviewer,
                'signer_approver'=> $sigApprover,
            ]);
            break;

 
        // ══ إعدادات النظام ══════════════════════════════════════
        case 'get_system_settings':
            $conn = db();
            ensureSystemSettingsTable($conn);

            // seed البادئات الافتراضية إن لم تكن موجودة
            $defaultPrefixes = [
                ['key' => 'prefix_transaction',   'value' => 'TR',  'label' => 'المعاملات',          'group' => 'prefixes'],
                ['key' => 'prefix_payment_order',  'value' => 'PO',  'label' => 'أوامر الدفع',         'group' => 'prefixes'],
                ['key' => 'prefix_reservation',    'value' => 'RES', 'label' => 'حجوزات الموازنة',    'group' => 'prefixes'],
                ['key' => 'prefix_investment',     'value' => 'INV', 'label' => 'الودائع الاستثمارية', 'group' => 'prefixes'],
                ['key' => 'prefix_correspondence', 'value' => 'COR', 'label' => 'الخطابات',           'group' => 'prefixes'],
            ];

            // seed أسماء الموقّعين في أوامر الدفع
            $defaultSigners = [
                ['key' => 'signer_reviewer', 'value' => '', 'label' => 'مدير الخزينة (المراجع)',        'group' => 'payment_order'],
                ['key' => 'signer_approver', 'value' => '', 'label' => 'رئيس القطاع المالي (المعتمد)', 'group' => 'payment_order'],
            ];
            $stmtSig = $conn->prepare('INSERT IGNORE INTO system_settings (setting_key, setting_value, setting_label, setting_group) VALUES (?,?,?,?)');
            if ($stmtSig) {
                foreach ($defaultSigners as $s) {
                    $stmtSig->bind_param('ssss', $s['key'], $s['value'], $s['label'], $s['group']);
                    $stmtSig->execute();
                }
                $stmtSig->close();
            }
            $stmtSeed = $conn->prepare('INSERT IGNORE INTO system_settings (setting_key, setting_value, setting_label, setting_group) VALUES (?,?,?,?)');
            if ($stmtSeed) {
                foreach ($defaultPrefixes as $p) {
                    $stmtSeed->bind_param('ssss', $p['key'], $p['value'], $p['label'], $p['group']);
                    $stmtSeed->execute();
                }
                $stmtSeed->close();
            }

            $rows = [];
            $r = $conn->query('SELECT * FROM system_settings ORDER BY setting_group, id');
            if ($r) while ($row = $r->fetch_assoc()) $rows[] = $row;
            jsonResponse(['success' => true, 'data' => $rows]);
            break;

        case 'save_system_setting':
            $conn = db();
            ensureSystemSettingsTable($conn);
            $input = json_decode(file_get_contents('php://input'), true) ?? [];
            $sKey  = trim($input['key']   ?? '');
            $sVal  = strtoupper(trim($input['value'] ?? ''));
            $sBy   = (int)($_SESSION['user_id'] ?? 0);
            if (!$sKey || !$sVal) {
                jsonResponse(['success' => false, 'message' => 'بيانات ناقصة']);
                return;
            }
            // البادئات: أحرف إنجليزية فقط — الأسماء: أي نص
            if (strpos($sKey, 'prefix_') === 0 && !preg_match('/^[A-Z0-9]{1,10}$/', $sVal)) {
                jsonResponse(['success' => false, 'message' => 'أحرف إنجليزية كبيرة أو أرقام فقط (1-10)']);
                return;
            }
            $sVal = trim($input['value'] ?? ''); // إعادة القيمة بدون strtoupper للأسماء
            if (strpos($sKey, 'prefix_') === 0) $sVal = strtoupper($sVal);
            $stmt = $conn->prepare('INSERT INTO system_settings (setting_key,setting_value,updated_by) VALUES (?,?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value),updated_by=VALUES(updated_by)');
            if (!$stmt) { jsonResponse(['success' => false, 'message' => $conn->error]); return; }
            $stmt->bind_param('ssi', $sKey, $sVal, $sBy);
            $ok = $stmt->execute();
            $stmt->close();
            jsonResponse(['success' => (bool)$ok]);
            break;

        // ══ سجل أوامر الدفع ═════════════════════════════════════
        case 'get_payment_orders_history':
            $conn = db();
            $dateFrom = $conn->real_escape_string($_GET['date_from'] ?? date('Y-m-01'));
            $dateTo   = $conn->real_escape_string($_GET['date_to']   ?? date('Y-m-d'));
            $refQ     = $conn->real_escape_string($_GET['order_ref'] ?? '');
            $where    = "p.status = 'تم الدفع' AND DATE(p.payment_date) BETWEEN '$dateFrom' AND '$dateTo'";
            if ($refQ) $where .= " AND p.reference_number LIKE '%$refQ%'";
            $sql = "
                SELECT
                    p.reference_number AS order_ref,
                    p.payment_date,
                    p.payment_method,
                    ep.name            AS issued_by,
                    COUNT(t.id)        AS txn_count,
                    SUM(IFNULL(t.amount_sar, t.amount)) AS total_amount_sar,
                    SUM(t.amount)                        AS total_amount_raw,
                    CASE WHEN COUNT(DISTINCT IFNULL(t.currency,'SAR')) = 1
                         THEN MAX(IFNULL(t.currency,'SAR'))
                         ELSE 'SAR'
                    END AS currency,
                    CASE WHEN COUNT(DISTINCT IFNULL(t.currency,'SAR')) > 1
                         THEN 1 ELSE 0
                    END AS is_mixed_currency,
                    GROUP_CONCAT(t.transaction_number ORDER BY t.transaction_number SEPARATOR ', ') AS txn_numbers
                FROM payment_data p
                JOIN transactions t ON t.id = p.transaction_id
                LEFT JOIN employees ep ON p.employee_id = ep.id
                WHERE $where
                GROUP BY p.reference_number, p.payment_date, p.payment_method, ep.name
                ORDER BY p.payment_date DESC
            ";
            $orders = [];
            $r = $conn->query($sql);
            if ($r) while ($row = $r->fetch_assoc()) $orders[] = $row;
            jsonResponse(['success' => true, 'data' => $orders, 'orders' => $orders]); // كلا المفتاحين للتوافق
            break;

        case 'get_payment_order_details':
            $conn = db();
            $ref = $conn->real_escape_string($_GET['ref'] ?? '');
            if (!$ref) { jsonResponse(['success' => false, 'message' => 'رقم الأمر مطلوب']); return; }
            $r = $conn->query("
                SELECT t.id, t.transaction_number, t.description, t.amount,
                       IFNULL(t.currency,'SAR') AS currency,
                       IFNULL(t.exchange_rate,1) AS exchange_rate,
                       IFNULL(t.amount_sar, t.amount) AS amount_sar,
                       tt.name AS transaction_type, ec.name AS created_by_name,
                       b.budget_code, p.payment_date, p.payment_method,
                       p.reference_number AS order_ref, ep.name AS issued_by
                FROM payment_data p
                JOIN transactions t ON t.id = p.transaction_id
                LEFT JOIN transaction_types tt ON t.type_id = tt.id
                LEFT JOIN employees ec ON t.created_by = ec.id
                LEFT JOIN budget_data b ON t.id = b.transaction_id
                LEFT JOIN employees ep ON p.employee_id = ep.id
                WHERE p.reference_number = '$ref'
                ORDER BY t.transaction_number
            ");
            $rows = [];
            if ($r) while ($row = $r->fetch_assoc()) $rows[] = $row;
            $sigReviewer2 = getSystemSetting('signer_reviewer') ?: '';
            $sigApprover2 = getSystemSetting('signer_approver') ?: '';
            jsonResponse([
                'success'         => true,
                'details'         => $rows,
                'total_amount'    => array_sum(array_column($rows, 'amount')),
                'order_ref'       => $ref,
                'signer_reviewer' => $sigReviewer2,
                'signer_approver' => $sigApprover2,
                'method'       => count($rows) > 0 ? ($rows[0]['payment_method'] ?? 'تحويل بنكي') : 'تحويل بنكي',
                'issued_by'    => count($rows) > 0 ? ($rows[0]['issued_by'] ?? '') : '',
                'issued_at'    => count($rows) > 0 ? ($rows[0]['payment_date'] ?? '') : '',
            ]);
            break;

            default:
            jsonResponse(['success' => false, 'message' => 'إجراء غير معروف: ' . $action], 400);
    }
    
} catch (Exception $e) {
    jsonResponse(['success' => false, 'message' => 'خطأ: ' . $e->getMessage()], 500);
} catch (Error $e) {
    jsonResponse(['success' => false, 'message' => 'خطأ فادح: ' . $e->getMessage() . ' في السطر ' . $e->getLine()], 500);
}