<?php
/**
 * API المصادقة
 * Authentication API
 */
session_start();

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../includes/config.php';

$action = $_GET['action'] ?? '';
$input = json_decode(file_get_contents('php://input'), true);

// دالة للتأكد من وجود الأعمدة المطلوبة
function ensureAuthColumns($conn) {
    // التحقق من وجود عمود employee_number
    $result = $conn->query("SHOW COLUMNS FROM employees LIKE 'employee_number'");
    if ($result->num_rows == 0) {
        $conn->query("ALTER TABLE employees ADD COLUMN employee_number VARCHAR(20) AFTER id");
        $conn->query("UPDATE employees SET employee_number = CONCAT('EMP', LPAD(id, 4, '0')) WHERE employee_number IS NULL");
    }
    
    // التحقق من وجود عمود password
    $result = $conn->query("SHOW COLUMNS FROM employees LIKE 'password'");
    if ($result->num_rows == 0) {
        $conn->query("ALTER TABLE employees ADD COLUMN password VARCHAR(255) DEFAULT NULL");
    }
    
    // التحقق من وجود عمود is_registered
    $result = $conn->query("SHOW COLUMNS FROM employees LIKE 'is_registered'");
    if ($result->num_rows == 0) {
        $conn->query("ALTER TABLE employees ADD COLUMN is_registered TINYINT(1) DEFAULT 0");
    }
    
    // التحقق من وجود عمود last_login
    $result = $conn->query("SHOW COLUMNS FROM employees LIKE 'last_login'");
    if ($result->num_rows == 0) {
        $conn->query("ALTER TABLE employees ADD COLUMN last_login DATETIME DEFAULT NULL");
    }
}

try {
    $conn = db();
    
    // التأكد من وجود الأعمدة المطلوبة
    ensureAuthColumns($conn);
    
    switch ($action) {
        
        // التحقق من الرقم الوظيفي
        case 'check':
            $empNumber = $conn->real_escape_string($input['employee_number'] ?? '');
            
            if (empty($empNumber)) {
                jsonResponse(['success' => false, 'message' => 'الرقم الوظيفي مطلوب'], 400);
            }
            
            $sql = "SELECT id, name, role, IFNULL(is_registered, 0) as is_registered FROM employees WHERE employee_number = '$empNumber'";
            $result = $conn->query($sql);
            
            if ($result && $result->num_rows > 0) {
                $employee = $result->fetch_assoc();
                jsonResponse([
                    'success' => true,
                    'data' => [
                        'id' => $employee['id'],
                        'name' => $employee['name'],
                        'role' => $employee['role'],
                        'is_registered' => (int)$employee['is_registered']
                    ]
                ]);
            } else {
                jsonResponse(['success' => false, 'message' => 'الرقم الوظيفي غير موجود'], 404);
            }
            break;
        
        // التسجيل (إنشاء كلمة المرور لأول مرة)
        case 'register':
            $empNumber = $conn->real_escape_string($input['employee_number'] ?? '');
            $password = $input['password'] ?? '';
            
            if (empty($empNumber) || empty($password)) {
                jsonResponse(['success' => false, 'message' => 'جميع الحقول مطلوبة'], 400);
            }
            
            if (strlen($password) < 6) {
                jsonResponse(['success' => false, 'message' => 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'], 400);
            }
            
            // التحقق من وجود الموظف
            $sql = "SELECT id, IFNULL(is_registered, 0) as is_registered FROM employees WHERE employee_number = '$empNumber'";
            $result = $conn->query($sql);
            
            if (!$result || $result->num_rows === 0) {
                jsonResponse(['success' => false, 'message' => 'الرقم الوظيفي غير موجود'], 404);
            }
            
            $employee = $result->fetch_assoc();
            
            if ($employee['is_registered'] == 1) {
                jsonResponse(['success' => false, 'message' => 'هذا الحساب مسجل مسبقاً'], 400);
            }
            
            // تشفير كلمة المرور وتحديث الحساب
            $hashedPassword = password_hash($password, PASSWORD_DEFAULT);
            $employeeId = $employee['id'];
            
            $sql = "UPDATE employees SET password = '$hashedPassword', is_registered = 1, last_login = NOW() WHERE id = $employeeId";
            
            if ($conn->query($sql)) {
                // تسجيل الدخول تلقائياً
                $_SESSION['user_id'] = $employeeId;
                $_SESSION['employee_number'] = $empNumber;
                
                // جلب اسم الموظف
                $nameResult = $conn->query("SELECT name, role FROM employees WHERE id = $employeeId");
                if ($nameResult && $row = $nameResult->fetch_assoc()) {
                    $_SESSION['user_name'] = $row['name'];
                    $_SESSION['user_role'] = $row['role'];
                }
                
                jsonResponse(['success' => true, 'message' => 'تم التسجيل بنجاح']);
            } else {
                jsonResponse(['success' => false, 'message' => 'حدث خطأ في التسجيل'], 500);
            }
            break;
        
        // تسجيل الدخول
        case 'login':
            $empNumber = $conn->real_escape_string($input['employee_number'] ?? '');
            $password = $input['password'] ?? '';
            
            if (empty($empNumber) || empty($password)) {
                jsonResponse(['success' => false, 'message' => 'جميع الحقول مطلوبة'], 400);
            }
            
            $sql = "SELECT id, name, password, IFNULL(is_registered, 0) as is_registered, role FROM employees WHERE employee_number = '$empNumber'";
            $result = $conn->query($sql);
            
            if (!$result || $result->num_rows === 0) {
                jsonResponse(['success' => false, 'message' => 'الرقم الوظيفي غير موجود'], 404);
            }
            
            $employee = $result->fetch_assoc();
            
            if ($employee['is_registered'] == 0) {
                jsonResponse(['success' => false, 'message' => 'يجب التسجيل أولاً'], 400);
            }
            
            if (!password_verify($password, $employee['password'])) {
                jsonResponse(['success' => false, 'message' => 'كلمة المرور غير صحيحة'], 401);
            }
            
            // تسجيل الدخول
            $_SESSION['user_id'] = $employee['id'];
            $_SESSION['user_name'] = $employee['name'];
            $_SESSION['user_role'] = $employee['role'];
            $_SESSION['employee_number'] = $empNumber;
            
            // تحديث آخر دخول
            $conn->query("UPDATE employees SET last_login = NOW() WHERE id = " . $employee['id']);
            
            jsonResponse([
                'success' => true,
                'message' => 'تم تسجيل الدخول بنجاح',
                'data' => [
                    'name' => $employee['name'],
                    'role' => $employee['role']
                ]
            ]);
            break;
        
        // تسجيل الخروج
        case 'logout':
            session_destroy();
            jsonResponse(['success' => true, 'message' => 'تم تسجيل الخروج']);
            break;
        
        // التحقق من الجلسة
        case 'session':
            if (isset($_SESSION['user_id'])) {
                jsonResponse([
                    'success' => true,
                    'logged_in' => true,
                    'data' => [
                        'id' => $_SESSION['user_id'],
                        'name' => $_SESSION['user_name'] ?? '',
                        'role' => $_SESSION['user_role'] ?? ''
                    ]
                ]);
            } else {
                jsonResponse(['success' => true, 'logged_in' => false]);
            }
            break;
        
        default:
            jsonResponse(['success' => false, 'message' => 'إجراء غير معروف'], 400);
    }
    
} catch (Exception $e) {
    jsonResponse(['success' => false, 'message' => 'خطأ: ' . $e->getMessage()], 500);
}
