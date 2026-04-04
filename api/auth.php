<?php
/**
 * API المصادقة
 * Authentication API
 */
session_start();

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../includes/config.php';

$action = $_GET['action'] ?? '';
$input  = json_decode(file_get_contents('php://input'), true) ?? [];

// ============================================================
//  تأكد من بنية الجداول (يُنفَّذ مرة واحدة — migration)
// ============================================================
function ensureAuthColumns(mysqli $conn): void {
    static $done = false;
    if ($done) return;
    $done = true;

    $cols = [
        'employee_number' => "ALTER TABLE employees ADD COLUMN employee_number VARCHAR(20) AFTER id",
        'password'        => "ALTER TABLE employees ADD COLUMN password VARCHAR(255) DEFAULT NULL",
        'is_registered'   => "ALTER TABLE employees ADD COLUMN is_registered TINYINT(1) DEFAULT 0",
        'last_login'      => "ALTER TABLE employees ADD COLUMN last_login DATETIME DEFAULT NULL",
    ];
    foreach ($cols as $col => $sql) {
        $r = $conn->query("SHOW COLUMNS FROM employees LIKE '$col'");
        if ($r && $r->num_rows === 0) $conn->query($sql);
    }

    // جدول محاولات الدخول الفاشلة
    $conn->query("CREATE TABLE IF NOT EXISTS login_attempts (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        employee_number VARCHAR(20)  NOT NULL,
        ip              VARCHAR(45)  NOT NULL DEFAULT '',
        attempted_at    DATETIME     NOT NULL DEFAULT NOW(),
        INDEX idx_emp_time (employee_number, attempted_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

// ============================================================
//  Brute-Force: فحص عدد المحاولات الفاشلة
// ============================================================
function checkBruteForce(mysqli $conn, string $empNumber): bool {
    $emp = $conn->real_escape_string($empNumber);
    $r   = $conn->query("
        SELECT COUNT(*) AS c FROM login_attempts
        WHERE employee_number = '$emp'
        AND attempted_at > DATE_SUB(NOW(), INTERVAL 15 MINUTE)
    ");
    return (int)($r->fetch_assoc()['c'] ?? 0) >= 5;
}

function recordFailedAttempt(mysqli $conn, string $empNumber): void {
    $emp = $conn->real_escape_string($empNumber);
    $ip  = $conn->real_escape_string($_SERVER['REMOTE_ADDR'] ?? '');
    $conn->query("INSERT INTO login_attempts (employee_number, ip) VALUES ('$emp', '$ip')");
}

function clearLoginAttempts(mysqli $conn, string $empNumber): void {
    $emp = $conn->real_escape_string($empNumber);
    $conn->query("DELETE FROM login_attempts WHERE employee_number = '$emp'");
}

// ============================================================
//  التحقق من قوة كلمة المرور
// ============================================================
function validatePasswordStrength(string $password): ?string {
    if (strlen($password) < 8) {
        return 'كلمة المرور يجب أن تكون 8 أحرف على الأقل';
    }
    if (!preg_match('/[A-Z]/', $password)) {
        return 'يجب أن تحتوي كلمة المرور على حرف كبير (A-Z)';
    }
    if (!preg_match('/[a-z]/', $password)) {
        return 'يجب أن تحتوي كلمة المرور على حرف صغير (a-z)';
    }
    if (!preg_match('/[0-9]/', $password)) {
        return 'يجب أن تحتوي كلمة المرور على رقم';
    }
    if (!preg_match('/[\W_]/', $password)) {
        return 'يجب أن تحتوي كلمة المرور على رمز خاص مثل @، #، !';
    }
    return null; // صحيحة
}

// ============================================================
//  جلب بيانات القسم وحفظها في الجلسة
// ============================================================
function loadDepartmentIntoSession(mysqli $conn, int $employeeId): void {
    $r = $conn->query("SELECT department_id FROM employees WHERE id = $employeeId LIMIT 1");
    if (!$r) return;
    $row = $r->fetch_assoc();
    $_SESSION['department_id'] = $row['department_id'] ?? null;
    if (!empty($row['department_id'])) {
        $dr = $conn->query(
            "SELECT name, code FROM departments WHERE id = " . (int)$row['department_id'] . " LIMIT 1"
        );
        if ($dr && $drow = $dr->fetch_assoc()) {
            $_SESSION['department_name'] = $drow['name'];
            $_SESSION['department_code'] = $drow['code'] ?? '';
        }
    }
}

// ============================================================
//  Main
// ============================================================
try {
    $conn = db();
    ensureAuthColumns($conn);

    switch ($action) {

        // ── التحقق من الرقم الوظيفي ─────────────────────────
        case 'check':
            $stmt = $conn->prepare(
                "SELECT id, name, role, IFNULL(is_registered,0) AS is_registered
                 FROM employees WHERE employee_number = ? LIMIT 1"
            );
            $empNumber = $input['employee_number'] ?? '';
            if (empty($empNumber)) {
                jsonResponse(['success' => false, 'message' => 'الرقم الوظيفي مطلوب'], 400);
            }
            $stmt->bind_param('s', $empNumber);
            $stmt->execute();
            $result = $stmt->get_result();

            if ($result->num_rows > 0) {
                $emp = $result->fetch_assoc();
                jsonResponse(['success' => true, 'data' => [
                    'id'            => $emp['id'],
                    'name'          => $emp['name'],
                    'role'          => $emp['role'],
                    'is_registered' => (int)$emp['is_registered'],
                ]]);
            }
            jsonResponse(['success' => false, 'message' => 'الرقم الوظيفي غير موجود'], 404);

        // ── التسجيل (إنشاء كلمة المرور لأول مرة) ───────────
        case 'register':
            $empNumber = $input['employee_number'] ?? '';
            $password  = $input['password']        ?? '';

            if (empty($empNumber) || empty($password)) {
                jsonResponse(['success' => false, 'message' => 'جميع الحقول مطلوبة'], 400);
            }

            // التحقق من قوة كلمة المرور
            $pwError = validatePasswordStrength($password);
            if ($pwError !== null) {
                jsonResponse(['success' => false, 'message' => $pwError], 400);
            }

            // جلب بيانات الموظف
            $stmt = $conn->prepare(
                "SELECT id, IFNULL(is_registered,0) AS is_registered
                 FROM employees WHERE employee_number = ? LIMIT 1"
            );
            $stmt->bind_param('s', $empNumber);
            $stmt->execute();
            $result = $stmt->get_result();

            if (!$result || $result->num_rows === 0) {
                jsonResponse(['success' => false, 'message' => 'الرقم الوظيفي غير موجود'], 404);
            }
            $emp = $result->fetch_assoc();

            if ((int)$emp['is_registered'] === 1) {
                jsonResponse(['success' => false, 'message' => 'هذا الحساب مسجل مسبقاً. استخدم تسجيل الدخول.'], 400);
            }

            // تشفير وحفظ
            $hashedPassword = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
            $employeeId     = (int)$emp['id'];

            $upd = $conn->prepare(
                "UPDATE employees SET password = ?, is_registered = 1, last_login = NOW()
                 WHERE id = ?"
            );
            $upd->bind_param('si', $hashedPassword, $employeeId);

            if (!$upd->execute()) {
                jsonResponse(['success' => false, 'message' => 'حدث خطأ أثناء التسجيل'], 500);
            }

            // تسجيل دخول تلقائي — مع تجديد الجلسة
            session_regenerate_id(true);
            $_SESSION['user_id']        = $employeeId;
            $_SESSION['employee_number'] = $empNumber;

            $nr = $conn->query("SELECT name, role FROM employees WHERE id = $employeeId LIMIT 1");
            if ($nr && $nrow = $nr->fetch_assoc()) {
                $_SESSION['user_name'] = $nrow['name'];
                $_SESSION['user_role'] = $nrow['role'];
            }
            loadDepartmentIntoSession($conn, $employeeId);

            jsonResponse(['success' => true, 'message' => 'تم التسجيل بنجاح']);

        // ── تسجيل الدخول ────────────────────────────────────
        case 'login':
            $empNumber = $input['employee_number'] ?? '';
            $password  = $input['password']        ?? '';

            if (empty($empNumber) || empty($password)) {
                jsonResponse(['success' => false, 'message' => 'جميع الحقول مطلوبة'], 400);
            }

            // فحص Brute Force
            if (checkBruteForce($conn, $empNumber)) {
                jsonResponse(['success' => false,
                    'message' => 'تم تجاوز عدد المحاولات المسموح بها. يرجى المحاولة بعد 15 دقيقة.'], 429);
            }

            // جلب بيانات الموظف
            $stmt = $conn->prepare(
                "SELECT id, name, password, IFNULL(is_registered,0) AS is_registered, role
                 FROM employees WHERE employee_number = ? LIMIT 1"
            );
            $stmt->bind_param('s', $empNumber);
            $stmt->execute();
            $result = $stmt->get_result();

            if (!$result || $result->num_rows === 0) {
                recordFailedAttempt($conn, $empNumber);
                jsonResponse(['success' => false, 'message' => 'الرقم الوظيفي أو كلمة المرور غير صحيحة'], 401);
            }
            $emp = $result->fetch_assoc();

            if ((int)$emp['is_registered'] === 0) {
                jsonResponse(['success' => false, 'message' => 'يجب التسجيل أولاً وإنشاء كلمة مرور'], 400);
            }

            if (!password_verify($password, $emp['password'])) {
                recordFailedAttempt($conn, $empNumber);
                // رسالة موحّدة لا تكشف أيهما خاطئ
                jsonResponse(['success' => false, 'message' => 'الرقم الوظيفي أو كلمة المرور غير صحيحة'], 401);
            }

            // تسجيل دخول ناجح — امسح محاولات الفشل وجدّد الجلسة
            clearLoginAttempts($conn, $empNumber);
            session_regenerate_id(true);

            $employeeId = (int)$emp['id'];
            $_SESSION['user_id']         = $employeeId;
            $_SESSION['user_name']        = $emp['name'];
            $_SESSION['user_role']        = $emp['role'];
            $_SESSION['employee_number']  = $empNumber;
            loadDepartmentIntoSession($conn, $employeeId);

            // تحديث last_login
            $conn->query("UPDATE employees SET last_login = NOW() WHERE id = $employeeId");

            // إعادة تشفير بكلفة أعلى إذا كانت قديمة
            if (password_needs_rehash($emp['password'], PASSWORD_BCRYPT, ['cost' => 12])) {
                $newHash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
                $rh = $conn->prepare("UPDATE employees SET password = ? WHERE id = ?");
                $rh->bind_param('si', $newHash, $employeeId);
                $rh->execute();
            }

            jsonResponse(['success' => true, 'message' => 'تم تسجيل الدخول بنجاح', 'data' => [
                'name' => $emp['name'],
                'role' => $emp['role'],
            ]]);

        // ── تسجيل الخروج ────────────────────────────────────
        case 'logout':
            $_SESSION = [];
            if (ini_get('session.use_cookies')) {
                $p = session_get_cookie_params();
                setcookie(session_name(), '', time() - 42000,
                    $p['path'], $p['domain'], $p['secure'], $p['httponly']);
            }
            session_destroy();
            jsonResponse(['success' => true, 'message' => 'تم تسجيل الخروج']);

        // ── التحقق من الجلسة ────────────────────────────────
        case 'session':
            if (isset($_SESSION['user_id'])) {
                jsonResponse(['success' => true, 'logged_in' => true, 'data' => [
                    'id'   => $_SESSION['user_id'],
                    'name' => $_SESSION['user_name'] ?? '',
                    'role' => $_SESSION['user_role'] ?? '',
                ]]);
            }
            jsonResponse(['success' => true, 'logged_in' => false]);

        default:
            jsonResponse(['success' => false, 'message' => 'إجراء غير معروف'], 400);
    }

} catch (Exception $e) {
    error_log('Auth API Error: ' . $e->getMessage());
    jsonResponse(['success' => false, 'message' => 'حدث خطأ داخلي'], 500);
}