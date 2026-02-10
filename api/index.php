<?php
/**
 * API للتعامل مع البيانات
 * Workflow System API
 */

// تعطيل عرض الأخطاء في الإخراج (سيتم إرسالها كـ JSON)
error_reporting(E_ALL);
ini_set('display_errors', 0);

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

// معالجة الطلبات
try {
    switch ($action) {
        
        // الحصول على الإحصائيات
        case 'stats':
            $stats = getStats();
            jsonResponse(['success' => true, 'data' => $stats]);
            break;
        
        // الحصول على بيانات الرسم البياني
        case 'chart':
            $data = getChartData();
            jsonResponse(['success' => true, 'data' => $data]);
            break;
        
        // الحصول على جميع المعاملات
        case 'transactions':
            $filters = [
                'search' => $_GET['search'] ?? '',
                'status' => $_GET['status'] ?? '',
                'date_from' => $_GET['date_from'] ?? '',
                'date_to' => $_GET['date_to'] ?? ''
            ];
            $transactions = getAllTransactions($filters);
            jsonResponse(['success' => true, 'data' => $transactions]);
            break;
        
        // الحصول على معاملة واحدة
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
        
        // الحصول على المعاملات العاجلة
        case 'urgent':
            $transactions = getUrgentTransactions();
            jsonResponse(['success' => true, 'data' => $transactions]);
            break;
        
        // الحصول على الموظفين
        case 'employees':
            $role = $_GET['role'] ?? null;
            $employees = getEmployees($role);
            jsonResponse(['success' => true, 'data' => $employees]);
            break;
        
        // الحصول على أنواع المعاملات
        case 'types':
            $types = getTransactionTypes();
            jsonResponse(['success' => true, 'data' => $types]);
            break;
        
        // إضافة معاملة جديدة
        case 'add':
            if ($method !== 'POST') {
                jsonResponse(['success' => false, 'message' => 'طريقة الطلب غير صحيحة'], 405);
            }
            
            // التحقق من نوع المحتوى
            $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
            
            if (strpos($contentType, 'multipart/form-data') !== false) {
                // رفع ملف مع البيانات
                $input = $_POST;
                $file = $_FILES['attachment'] ?? null;
            } else {
                // JSON فقط
                $input = json_decode(file_get_contents('php://input'), true);
                $file = null;
            }
            
            if (empty($input['date']) || empty($input['type_id']) || empty($input['description']) || empty($input['amount'])) {
                jsonResponse(['success' => false, 'message' => 'جميع الحقول مطلوبة'], 400);
            }
            
            $id = addTransaction($input, $file);
            if ($id) {
                jsonResponse(['success' => true, 'message' => 'تم إضافة المعاملة بنجاح', 'id' => $id]);
            } else {
                jsonResponse(['success' => false, 'message' => 'فشل في إضافة المعاملة'], 500);
            }
            break;
        
        // رفع/تحديث مرفق
        case 'upload_attachment':
            if ($method !== 'POST') {
                jsonResponse(['success' => false, 'message' => 'طريقة الطلب غير صحيحة'], 405);
            }
            
            $transactionId = (int)($_POST['transaction_id'] ?? 0);
            $file = $_FILES['attachment'] ?? null;
            
            if ($transactionId <= 0) {
                jsonResponse(['success' => false, 'message' => 'معرف المعاملة غير صالح'], 400);
            }
            
            if (!$file || !$file['tmp_name']) {
                jsonResponse(['success' => false, 'message' => 'لم يتم اختيار ملف'], 400);
            }
            
            $result = updateAttachment($transactionId, $file);
            jsonResponse($result);
            break;
        
        // حذف مرفق
        case 'delete_attachment':
            if ($method !== 'POST') {
                jsonResponse(['success' => false, 'message' => 'طريقة الطلب غير صحيحة'], 405);
            }
            
            $input = json_decode(file_get_contents('php://input'), true);
            $transactionId = (int)($input['transaction_id'] ?? 0);
            
            if ($transactionId <= 0) {
                jsonResponse(['success' => false, 'message' => 'معرف المعاملة غير صالح'], 400);
            }
            
            if (deleteAttachment($transactionId)) {
                jsonResponse(['success' => true, 'message' => 'تم حذف المرفق']);
            } else {
                jsonResponse(['success' => false, 'message' => 'فشل في حذف المرفق'], 500);
            }
            break;
        
        // تحديث بيانات الاستلام
        case 'update_receiving':
            if ($method !== 'POST') {
                jsonResponse(['success' => false, 'message' => 'طريقة الطلب غير صحيحة'], 405);
            }
            
            $input = json_decode(file_get_contents('php://input'), true);
            $id = (int)($input['transaction_id'] ?? 0);
            
            if ($id <= 0) {
                jsonResponse(['success' => false, 'message' => 'معرف غير صالح'], 400);
            }
            
            if (updateReceivingData($id, $input)) {
                jsonResponse(['success' => true, 'message' => 'تم تحديث بيانات الاستلام']);
            } else {
                jsonResponse(['success' => false, 'message' => 'فشل في التحديث'], 500);
            }
            break;
        
        // تحديث بيانات الموازنة
        case 'update_budget':
            if ($method !== 'POST') {
                jsonResponse(['success' => false, 'message' => 'طريقة الطلب غير صحيحة'], 405);
            }
            
            $input = json_decode(file_get_contents('php://input'), true);
            $id = (int)($input['transaction_id'] ?? 0);
            
            if ($id <= 0) {
                jsonResponse(['success' => false, 'message' => 'معرف غير صالح'], 400);
            }
            
            if (updateBudgetData($id, $input)) {
                jsonResponse(['success' => true, 'message' => 'تم تحديث بيانات الموازنة']);
            } else {
                jsonResponse(['success' => false, 'message' => 'فشل في التحديث'], 500);
            }
            break;
        
        // تحديث بيانات الدفع
        case 'update_payment':
            if ($method !== 'POST') {
                jsonResponse(['success' => false, 'message' => 'طريقة الطلب غير صحيحة'], 405);
            }
            
            $input = json_decode(file_get_contents('php://input'), true);
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
        
        // تحديث بيانات الفوترة
        case 'update_invoice':
            if ($method !== 'POST') {
                jsonResponse(['success' => false, 'message' => 'طريقة الطلب غير صحيحة'], 405);
            }
            
            $input = json_decode(file_get_contents('php://input'), true);
            $id = (int)($input['transaction_id'] ?? 0);
            
            if ($id <= 0) {
                jsonResponse(['success' => false, 'message' => 'معرف غير صالح'], 400);
            }
            
            if (updateInvoiceData($id, $input)) {
                jsonResponse(['success' => true, 'message' => 'تم تحديث بيانات الفوترة']);
            } else {
                jsonResponse(['success' => false, 'message' => 'فشل في التحديث'], 500);
            }
            break;
        
        // حذف معاملة
        case 'delete':
            if ($method !== 'POST' && $method !== 'DELETE') {
                jsonResponse(['success' => false, 'message' => 'طريقة الطلب غير صحيحة'], 405);
            }
            
            $input = json_decode(file_get_contents('php://input'), true);
            $id = (int)($input['id'] ?? $_GET['id'] ?? 0);
            
            if ($id <= 0) {
                jsonResponse(['success' => false, 'message' => 'معرف غير صالح'], 400);
            }
            
            if (deleteTransaction($id)) {
                jsonResponse(['success' => true, 'message' => 'تم حذف المعاملة']);
            } else {
                jsonResponse(['success' => false, 'message' => 'فشل في الحذف'], 500);
            }
            break;
        
        // سجل النشاطات
        case 'activity':
            $transactionId = isset($_GET['transaction_id']) ? (int)$_GET['transaction_id'] : null;
            $logs = getActivityLog($transactionId);
            jsonResponse(['success' => true, 'data' => $logs]);
            break;
        
        // تقرير أوقات الموظفين
        case 'employee_times':
            $employeeId = isset($_GET['employee_id']) ? (int)$_GET['employee_id'] : null;
            $stage = $_GET['stage'] ?? null;
            $dateFrom = $_GET['date_from'] ?? null;
            $dateTo = $_GET['date_to'] ?? null;
            
            $data = getEmployeeTimeReport($employeeId, $stage, $dateFrom, $dateTo);
            jsonResponse(['success' => true, 'data' => $data]);
            break;
        
        // ملخص أداء الموظفين
        case 'performance_summary':
            $dateFrom = $_GET['date_from'] ?? null;
            $dateTo = $_GET['date_to'] ?? null;
            
            $data = getEmployeePerformanceSummary($dateFrom, $dateTo);
            jsonResponse(['success' => true, 'data' => $data]);
            break;
        
        // تفاصيل أداء موظف
        case 'employee_performance':
            $employeeId = isset($_GET['employee_id']) ? (int)$_GET['employee_id'] : 0;
            if ($employeeId <= 0) {
                jsonResponse(['success' => false, 'message' => 'معرف الموظف غير صالح'], 400);
            }
            
            $dateFrom = $_GET['date_from'] ?? null;
            $dateTo = $_GET['date_to'] ?? null;
            
            $data = getEmployeePerformanceDetails($employeeId, $dateFrom, $dateTo);
            jsonResponse(['success' => true, 'data' => $data]);
            break;
        
        default:
            jsonResponse(['success' => false, 'message' => 'إجراء غير معروف: ' . $action], 400);
    }
    
} catch (Exception $e) {
    jsonResponse(['success' => false, 'message' => 'خطأ: ' . $e->getMessage()], 500);
} catch (Error $e) {
    jsonResponse(['success' => false, 'message' => 'خطأ فادح: ' . $e->getMessage() . ' في السطر ' . $e->getLine()], 500);
}
