<?php
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

/**
 * API للإعدادات
 * Settings API
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE');
header('Access-Control-Allow-Headers: Content-Type');

require_once __DIR__ . '/../includes/functions.php';

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

try {
    switch ($action) {
        
        // ==================== الموظفين ====================
        
        // إضافة موظف
        case 'add_employee':
            if ($method !== 'POST') {
                jsonResponse(['success' => false, 'message' => 'طريقة غير صحيحة'], 405);
            }
            
            $input = json_decode(file_get_contents('php://input'), true);
            $conn = db();
            
            $name = $conn->real_escape_string($input['name']);
            $email = $conn->real_escape_string($input['email'] ?? '');
            $phone = $conn->real_escape_string($input['phone'] ?? '');
            $role = $conn->real_escape_string($input['role']);
            
            $sql = "INSERT INTO employees (name, email, phone, role) VALUES ('$name', '$email', '$phone', '$role')";
            
            if ($conn->query($sql)) {
                jsonResponse(['success' => true, 'message' => 'تم إضافة الموظف', 'id' => $conn->insert_id]);
            } else {
                jsonResponse(['success' => false, 'message' => 'فشل في الإضافة: ' . $conn->error], 500);
            }
            break;
        
        // تعديل موظف
        case 'update_employee':
            if ($method !== 'POST') {
                jsonResponse(['success' => false, 'message' => 'طريقة غير صحيحة'], 405);
            }
            
            $input = json_decode(file_get_contents('php://input'), true);
            $conn = db();
            
            $id = (int)$input['id'];
            $name = $conn->real_escape_string($input['name']);
            $email = $conn->real_escape_string($input['email'] ?? '');
            $phone = $conn->real_escape_string($input['phone'] ?? '');
            $role = $conn->real_escape_string($input['role']);
            
            $sql = "UPDATE employees SET name='$name', email='$email', phone='$phone', role='$role' WHERE id=$id";
            
            if ($conn->query($sql)) {
                jsonResponse(['success' => true, 'message' => 'تم تحديث الموظف']);
            } else {
                jsonResponse(['success' => false, 'message' => 'فشل في التحديث'], 500);
            }
            break;
        
        // حذف موظف
        case 'delete_employee':
            if ($method !== 'POST') {
                jsonResponse(['success' => false, 'message' => 'طريقة غير صحيحة'], 405);
            }
            
            $input = json_decode(file_get_contents('php://input'), true);
            $id = (int)$input['id'];
            $conn = db();
            
            $sql = "DELETE FROM employees WHERE id=$id";
            
            if ($conn->query($sql)) {
                jsonResponse(['success' => true, 'message' => 'تم حذف الموظف']);
            } else {
                jsonResponse(['success' => false, 'message' => 'فشل في الحذف'], 500);
            }
            break;
        
        // ==================== أنواع المعاملات ====================
        
        // إضافة نوع
        case 'add_type':
            if ($method !== 'POST') {
                jsonResponse(['success' => false, 'message' => 'طريقة غير صحيحة'], 405);
            }
            
            $input = json_decode(file_get_contents('php://input'), true);
            $conn = db();
            
            $name = $conn->real_escape_string($input['name']);
            $desc = $conn->real_escape_string($input['description'] ?? '');
            
            $sql = "INSERT INTO transaction_types (name, description) VALUES ('$name', '$desc')";
            
            if ($conn->query($sql)) {
                jsonResponse(['success' => true, 'message' => 'تم إضافة النوع', 'id' => $conn->insert_id]);
            } else {
                jsonResponse(['success' => false, 'message' => 'فشل في الإضافة'], 500);
            }
            break;
        
        // تعديل نوع
        case 'update_type':
            if ($method !== 'POST') {
                jsonResponse(['success' => false, 'message' => 'طريقة غير صحيحة'], 405);
            }
            
            $input = json_decode(file_get_contents('php://input'), true);
            $conn = db();
            
            $id = (int)$input['id'];
            $name = $conn->real_escape_string($input['name']);
            $desc = $conn->real_escape_string($input['description'] ?? '');
            
            $sql = "UPDATE transaction_types SET name='$name', description='$desc' WHERE id=$id";
            
            if ($conn->query($sql)) {
                jsonResponse(['success' => true, 'message' => 'تم تحديث النوع']);
            } else {
                jsonResponse(['success' => false, 'message' => 'فشل في التحديث'], 500);
            }
            break;
        
        // حذف نوع
        case 'delete_type':
            if ($method !== 'POST') {
                jsonResponse(['success' => false, 'message' => 'طريقة غير صحيحة'], 405);
            }
            
            $input = json_decode(file_get_contents('php://input'), true);
            $id = (int)$input['id'];
            $conn = db();
            
            // التحقق من عدم وجود معاملات مرتبطة
            $check = $conn->query("SELECT COUNT(*) as cnt FROM transactions WHERE type_id=$id");
            $row = $check->fetch_assoc();
            
            if ($row['cnt'] > 0) {
                jsonResponse(['success' => false, 'message' => 'لا يمكن الحذف، يوجد معاملات مرتبطة بهذا النوع'], 400);
            }
            
            $sql = "DELETE FROM transaction_types WHERE id=$id";
            
            if ($conn->query($sql)) {
                jsonResponse(['success' => true, 'message' => 'تم حذف النوع']);
            } else {
                jsonResponse(['success' => false, 'message' => 'فشل في الحذف'], 500);
            }
            break;
        
        // ==================== إدارة المعاملات ====================
        
        // حذف معاملة
        case 'delete_transaction':
            if ($method !== 'POST') {
                jsonResponse(['success' => false, 'message' => 'طريقة غير صحيحة'], 405);
            }
            
            $input = json_decode(file_get_contents('php://input'), true);
            $id = (int)$input['id'];
            
            if (deleteTransaction($id)) {
                jsonResponse(['success' => true, 'message' => 'تم حذف المعاملة']);
            } else {
                jsonResponse(['success' => false, 'message' => 'فشل في الحذف'], 500);
            }
            break;
        
        // حذف جميع المعاملات
        case 'clear_all':
            if ($method !== 'POST') {
                jsonResponse(['success' => false, 'message' => 'طريقة غير صحيحة'], 405);
            }
            
            $conn = db();
            
            // حذف البيانات المرتبطة أولاً
            $conn->query("DELETE FROM activity_log");
            $conn->query("DELETE FROM invoice_data");
            $conn->query("DELETE FROM payment_data");
            $conn->query("DELETE FROM budget_data");
            $conn->query("DELETE FROM receiving_data");
            $conn->query("DELETE FROM transactions");
            
            // إعادة تعيين auto_increment
            $conn->query("ALTER TABLE transactions AUTO_INCREMENT = 1");
            
            jsonResponse(['success' => true, 'message' => 'تم حذف جميع المعاملات']);
            break;
        
        // ==================== تصدير البيانات ====================
        
        case 'export':
            $conn = db();
            $result = $conn->query("SELECT * FROM v_full_transactions ORDER BY id DESC");
            
            $data = [];
            while ($row = $result->fetch_assoc()) {
                $data[] = $row;
            }
            
            // تصدير كـ CSV
            header('Content-Type: text/csv; charset=utf-8');
            header('Content-Disposition: attachment; filename="transactions_' . date('Y-m-d') . '.csv"');
            
            $output = fopen('php://output', 'w');
            
            // BOM for UTF-8
            fprintf($output, chr(0xEF).chr(0xBB).chr(0xBF));
            
            // Headers
            if (count($data) > 0) {
                fputcsv($output, array_keys($data[0]));
            }
            
            // Data
            foreach ($data as $row) {
                fputcsv($output, $row);
            }
            
            fclose($output);
            exit;
            break;
        
        // ==================== الإحصائيات ====================
        
        case 'full_stats':
            $conn = db();
            
            $stats = [];
            
            // إجمالي المعاملات
            $result = $conn->query("SELECT COUNT(*) as total FROM transactions");
            $stats['transactions'] = $result->fetch_assoc()['total'];
            
            // إجمالي الموظفين
            $result = $conn->query("SELECT COUNT(*) as total FROM employees");
            $stats['employees'] = $result->fetch_assoc()['total'];
            
            // موظفين حسب القسم
            $result = $conn->query("SELECT role, COUNT(*) as cnt FROM employees GROUP BY role");
            $stats['employees_by_role'] = [];
            while ($row = $result->fetch_assoc()) {
                $stats['employees_by_role'][$row['role']] = $row['cnt'];
            }
            
            // أنواع المعاملات
            $result = $conn->query("SELECT COUNT(*) as total FROM transaction_types");
            $stats['types'] = $result->fetch_assoc()['total'];
            
            // إجمالي المبالغ
            $result = $conn->query("SELECT SUM(amount) as total FROM transactions");
            $stats['total_amount'] = $result->fetch_assoc()['total'] ?? 0;
            
            // المعاملات هذا الشهر
            $result = $conn->query("SELECT COUNT(*) as total FROM transactions WHERE MONTH(transaction_date) = MONTH(CURRENT_DATE()) AND YEAR(transaction_date) = YEAR(CURRENT_DATE())");
            $stats['this_month'] = $result->fetch_assoc()['total'];
            
            jsonResponse(['success' => true, 'data' => $stats]);
            break;
        
        default:
            jsonResponse(['success' => false, 'message' => 'إجراء غير معروف'], 400);
    }
    
} catch (Exception $e) {
    jsonResponse(['success' => false, 'message' => $e->getMessage()], 500);
}