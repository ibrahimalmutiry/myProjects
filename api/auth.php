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
        'last_ip'         => "ALTER TABLE employees ADD COLUMN last_ip VARCHAR(45) DEFAULT NULL",
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

    // جدول سجل الأمان الشامل
    $conn->query("CREATE TABLE IF NOT EXISTS security_log (
        id              BIGINT AUTO_INCREMENT PRIMARY KEY,
        employee_id     INT           DEFAULT NULL,
        employee_number VARCHAR(20)   DEFAULT NULL,
        employee_name   VARCHAR(200)  DEFAULT NULL,
        event_type      VARCHAR(50)   NOT NULL,
        event_result    ENUM('success','failure','warning') NOT NULL DEFAULT 'success',
        ip_address      VARCHAR(45)   NOT NULL DEFAULT '',
        user_agent      VARCHAR(500)  DEFAULT NULL,
        session_id      VARCHAR(128)  DEFAULT NULL,
        page_url        VARCHAR(500)  DEFAULT NULL,
        action_detail   TEXT          DEFAULT NULL,
        extra_data      JSON          DEFAULT NULL,
        created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_emp   (employee_id),
        INDEX idx_type  (event_type),
        INDEX idx_time  (created_at),
        INDEX idx_ip    (ip_address)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

// ============================================================
//  إرسال إشعار أمان لكل المديرين
// ============================================================
function sendSecurityAlert(mysqli $conn, string $title, string $body, string $severity = 'danger'): void {
    $t   = $conn->real_escape_string($title);
    $b   = $conn->real_escape_string($body);
    $sev = in_array($severity, ['danger','warning','info']) ? $severity : 'danger';

    // منع التكرار: نفس العنوان + الجسم خلال 5 دقائق = لا يُدرج مجدداً
    $dupCheck = $conn->query("SELECT id FROM system_notifications
        WHERE category='security' AND title='$t'
        AND created_at > DATE_SUB(NOW(), INTERVAL 5 MINUTE)
        LIMIT 1");
    if ($dupCheck && $dupCheck->num_rows > 0) return;

    $admins = $conn->query("SELECT id FROM employees
        WHERE permission_level='system_admin' OR role='admin' OR role='CEO' LIMIT 10");
    if ($admins) {
        while ($adm = $admins->fetch_assoc()) {
            $empId = (int)$adm['id'];
            $conn->query("INSERT INTO system_notifications
                (type, category, title, message, employee_id, created_at)
                VALUES ('$sev', 'security', '$t', '$b', $empId, NOW())");
        }
    }
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
//  تسجيل حدث أمني
// ============================================================
function logSecurityEvent(
    mysqli  $conn,
    string  $eventType,
    string  $result = 'success',
    array   $data   = []
): void {
    $empId     = $conn->real_escape_string((string)($data['employee_id']     ?? ''));
    $empNum    = $conn->real_escape_string($data['employee_number']  ?? '');
    $empName   = $conn->real_escape_string($data['employee_name']    ?? '');
    $ip        = $conn->real_escape_string($_SERVER['REMOTE_ADDR']   ?? '');
    $ua        = $conn->real_escape_string(substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 490));
    $sessId    = $conn->real_escape_string(session_id() ?: '');
    $url       = $conn->real_escape_string(substr(($_SERVER['HTTP_REFERER'] ?? $_SERVER['REQUEST_URI'] ?? ''), 0, 490));
    $detail    = $conn->real_escape_string($data['detail']           ?? '');
    $eType     = $conn->real_escape_string($eventType);
    $eResult   = in_array($result, ['success','failure','warning']) ? $result : 'success';
    $extra     = isset($data['extra']) ? $conn->real_escape_string(json_encode($data['extra'], JSON_UNESCAPED_UNICODE)) : 'NULL';

    $empIdSql  = $empId !== '' ? (int)$empId : 'NULL';
    $extraSql  = $extra !== 'NULL' ? "'$extra'" : 'NULL';

    $conn->query("INSERT INTO security_log
        (employee_id, employee_number, employee_name, event_type, event_result,
         ip_address, user_agent, session_id, page_url, action_detail, extra_data)
        VALUES
        ($empIdSql, '$empNum', '$empName', '$eType', '$eResult',
         '$ip', '$ua', '$sessId', '$url', '$detail', $extraSql)");
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
            $stmt->store_result();

            if ($stmt->num_rows > 0) {
                $r_id = $r_name = $r_role = $r_is_reg = null;
                $stmt->bind_result($r_id, $r_name, $r_role, $r_is_reg);
                $stmt->fetch();
                jsonResponse(['success' => true, 'data' => [
                    'id'            => $r_id,
                    'name'          => $r_name,
                    'role'          => $r_role,
                    'is_registered' => (int)$r_is_reg,
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
            $stmt->store_result();

            if (!$stmt->num_rows) {
                jsonResponse(['success' => false, 'message' => 'الرقم الوظيفي غير موجود'], 404);
            }
            $r_id = $r_is_reg = null;
            $stmt->bind_result($r_id, $r_is_reg);
            $stmt->fetch();
            $emp = ['id' => $r_id, 'is_registered' => $r_is_reg];

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

            // فحص Brute Force — تنبيه عند 3، حجب عند 5
            $empEscBF = $conn->real_escape_string($empNumber);
            $failCnt  = (int)($conn->query("SELECT COUNT(*) AS c FROM login_attempts
                WHERE employee_number='$empEscBF'
                AND attempted_at > DATE_SUB(NOW(), INTERVAL 15 MINUTE)")->fetch_assoc()['c'] ?? 0);

            if ($failCnt >= 3 && $failCnt < 5) {
                sendSecurityAlert($conn,
                    '⚠️ محاولات دخول مشبوهة',
                    'الرقم الوظيفي: ' . $empNumber . ' — ' . $failCnt . ' محاولات فاشلة من IP: ' . ($_SERVER['REMOTE_ADDR'] ?? ''),
                    'warning'
                );
                logSecurityEvent($conn, 'brute_force_warning', 'warning', [
                    'employee_number' => $empNumber,
                    'detail'          => 'تحذير — ' . $failCnt . ' محاولات فاشلة',
                ]);
            }

            if (checkBruteForce($conn, $empNumber)) {
                sendSecurityAlert($conn,
                    '🚨 تم حجب دخول مشبوه',
                    'الرقم الوظيفي: ' . $empNumber . ' — 5 محاولات فاشلة من IP: ' . ($_SERVER['REMOTE_ADDR'] ?? ''),
                    'danger'
                );
                logSecurityEvent($conn, 'brute_force_blocked', 'warning', [
                    'employee_number' => $empNumber,
                    'detail'          => 'تم حجب الدخول — تجاوز 5 محاولات فاشلة',
                ]);
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
            $stmt->store_result();

            if (!$stmt->num_rows) {
                recordFailedAttempt($conn, $empNumber);
                logSecurityEvent($conn, 'login_failed', 'failure', [
                    'employee_number' => $empNumber,
                    'detail'          => 'رقم وظيفي غير موجود',
                ]);
                jsonResponse(['success' => false, 'message' => 'الرقم الوظيفي أو كلمة المرور غير صحيحة'], 401);
            }
            $l_id = $l_name = $l_pass = $l_is_reg = $l_role = null;
            $stmt->bind_result($l_id, $l_name, $l_pass, $l_is_reg, $l_role);
            $stmt->fetch();
            $emp = [
                'id'            => $l_id,
                'name'          => $l_name,
                'password'      => $l_pass,
                'is_registered' => $l_is_reg,
                'role'          => $l_role,
            ];

            if ((int)$emp['is_registered'] === 0) {
                jsonResponse(['success' => false, 'message' => 'يجب التسجيل أولاً وإنشاء كلمة مرور'], 400);
            }

            if (empty($emp['password']) || !password_verify($password, $emp['password'])) {
                recordFailedAttempt($conn, $empNumber);
                logSecurityEvent($conn, 'login_failed', 'failure', [
                    'employee_id'     => $emp['id'],
                    'employee_number' => $empNumber,
                    'employee_name'   => $emp['name'],
                    'detail'          => 'كلمة مرور خاطئة',
                ]);
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

            // جلب آخر IP قبل التحديث
            $lastIpRow = $conn->query("SELECT last_ip FROM employees WHERE id=$employeeId LIMIT 1");
            $lastIp    = $lastIpRow ? ($lastIpRow->fetch_assoc()['last_ip'] ?? '') : '';
            $currentIp = $_SERVER['REMOTE_ADDR'] ?? '';
            $curIpE    = $conn->real_escape_string($currentIp);

            // تحديث last_login و last_ip
            $conn->query("UPDATE employees SET last_login=NOW(), last_ip='$curIpE' WHERE id=$employeeId");

            // ── كشف IP جديد ──────────────────────────────────
            if ($lastIp && $lastIp !== $currentIp) {
                logSecurityEvent($conn, 'new_ip_login', 'warning', [
                    'employee_id'     => $employeeId,
                    'employee_number' => $empNumber,
                    'employee_name'   => $emp['name'],
                    'detail'          => 'دخول من IP جديد — السابق: ' . $lastIp . ' — الحالي: ' . $currentIp,
                ]);
                sendSecurityAlert($conn,
                    '🌐 دخول من موقع جديد',
                    'الموظف: ' . $emp['name'] . ' (' . $empNumber . ') — IP الجديد: ' . $currentIp . ' (السابق: ' . $lastIp . ')',
                    'warning'
                );
            }

            // ── كشف الدخول خارج أوقات الدوام (6ص - 10م) ─────
            $hour    = (int)date('G');
            $weekday = (int)date('N');
            $isWeekend  = ($weekday >= 5);
            $isOffHours = ($hour < 6 || $hour >= 22);
            if ($isWeekend || $isOffHours) {
                $timeLabel = $isWeekend ? 'عطلة نهاية الأسبوع' : ($hour < 6 ? 'فجراً قبل 6ص' : 'ليلاً بعد 10م');
                logSecurityEvent($conn, 'login_off_hours', 'warning', [
                    'employee_id'     => $employeeId,
                    'employee_number' => $empNumber,
                    'employee_name'   => $emp['name'],
                    'detail'          => 'دخول خارج أوقات الدوام — ' . $timeLabel . ' الساعة ' . date('H:i'),
                ]);
                sendSecurityAlert($conn,
                    '🕐 دخول خارج أوقات الدوام',
                    'الموظف: ' . $emp['name'] . ' — ' . $timeLabel . ' الساعة ' . date('H:i') . ' من IP: ' . $currentIp,
                    'warning'
                );
            }

            // تسجيل دخول ناجح في security_log
            logSecurityEvent($conn, 'login', 'success', [
                'employee_id'     => $employeeId,
                'employee_number' => $empNumber,
                'employee_name'   => $emp['name'],
                'detail'          => 'تسجيل دخول ناجح',
                'extra'           => ['role' => $emp['role'], 'ip' => $currentIp],
            ]);

            // إعادة تشفير بكلفة أعلى إذا كانت قديمة
            if (!empty($emp['password']) && password_needs_rehash($emp['password'], PASSWORD_BCRYPT, ['cost' => 12])) {
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
            if (isset($_SESSION['user_id'])) {
                $logConn = db();
                logSecurityEvent($logConn, 'logout', 'success', [
                    'employee_id'     => $_SESSION['user_id'],
                    'employee_number' => $_SESSION['employee_number'] ?? '',
                    'employee_name'   => $_SESSION['user_name']       ?? '',
                    'detail'          => 'تسجيل خروج',
                ]);
            }
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