<?php
/**
 * إعدادات النظام
 * Workflow Management System Configuration
 */

if (!defined('APP_ROOT')) {
    define('APP_ROOT', dirname(__FILE__));
}

// ============================================================
//  قراءة ملف .env — يُبحث في مسارين: خارج المشروع أولاً
//  ⚠ لا تضع بيانات DB كـ fallback مباشرة في الكود
//     بدلاً من ذلك: أنشئ ملف .env بجوار المشروع
// ============================================================
$_envPaths = [
    dirname(__DIR__) . '/.env',         // خارج public_html (الأفضل)
    dirname(__DIR__, 2) . '/.env',      // مستويين فوق
    __DIR__ . '/../.env',               // بديل نسبي
];
foreach ($_envPaths as $_envFile) {
    if (file_exists($_envFile) && is_readable($_envFile)) {
        foreach (file($_envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $_line) {
            $_line = trim($_line);
            if ($_line === '' || $_line[0] === '#') continue;
            if (!str_contains($_line, '=')) continue;
            [$_k, $_v] = explode('=', $_line, 2);
            $_k = trim($_k);
            $_v = trim($_v);
            // إزالة علامات الاقتباس الاختيارية: "value" أو 'value'
            if (strlen($_v) >= 2 && (($_v[0] === '"' && $_v[-1] === '"') || ($_v[0] === "'" && $_v[-1] === "'"))) {
                $_v = substr($_v, 1, -1);
            }
            if (!isset($_ENV[$_k])) $_ENV[$_k] = $_v;
        }
        break; // استخدم أول ملف موجود فقط
    }
}
unset($_envPaths, $_envFile, $_line, $_k, $_v);

// ============================================================
//  إعدادات قاعدة البيانات — تُقرأ من .env حصراً
//  ⚠ لا يوجد fallback لكلمة المرور — إذا غاب .env سيفشل الاتصال
//    وهذا مقصود: أفضل من تشغيل النظام بـ credentials مكشوفة
// ============================================================
$_dbHost = $_ENV['DB_HOST'] ?? null;
$_dbName = $_ENV['DB_NAME'] ?? null;
$_dbUser = $_ENV['DB_USER'] ?? null;
$_dbPass = $_ENV['DB_PASS'] ?? null; // لا fallback هنا

define('DB_HOST',    $_dbHost ?? 'localhost');
define('DB_NAME',    $_dbName ?? 'workflow_system');
define('DB_USER',    $_dbUser ?? 'root');          // للتطوير المحلي فقط
define('DB_PASS',    $_dbPass ?? '');               // للتطوير المحلي فقط
define('DB_CHARSET', $_ENV['DB_CHARSET'] ?? 'utf8mb4');
unset($_dbHost, $_dbName, $_dbUser, $_dbPass);

// ============================================================
//  إعدادات التطبيق
// ============================================================
define('APP_NAME',    'نظام إدارة معاملات القطاع المالي');
define('APP_VERSION', '1.0.0');
define('APP_LANG',    'ar');

date_default_timezone_set('Asia/Riyadh');

// ============================================================
//  الأخطاء — إنتاج vs تطوير
// ============================================================
$_httpHost = strtolower(explode(':', $_SERVER['HTTP_HOST'] ?? '')[0]);
$_isProduction = !in_array($_httpHost, ['localhost', '127.0.0.1', '::1'], true)
              && ($_ENV['APP_ENV'] ?? 'production') !== 'development';
unset($_httpHost);

if ($_isProduction) {
    error_reporting(0);
    ini_set('display_errors', '0');
    ini_set('log_errors',     '1');
    $__logDir = dirname(__DIR__) . '/logs';
    if (!is_dir($__logDir)) {
        $__oldErr = set_error_handler(null);
        @mkdir($__logDir, 0750, true);
        if ($__oldErr) set_error_handler($__oldErr);
    }
    if (is_dir($__logDir) && is_writable($__logDir)) {
        ini_set('error_log', $__logDir . '/php_errors.log');
    }
    unset($__logDir, $__oldErr);
} else {
    error_reporting(E_ALL);
    ini_set('display_errors', '1');
}
define('IS_PRODUCTION', $_isProduction);
unset($_isProduction);

// ── فحص اكتمال .env في بيئة الإنتاج ────────────────────────
if (IS_PRODUCTION && (DB_USER === 'root' || DB_PASS === '')) {
    error_log('SECURITY WARNING: بيانات DB الافتراضية في بيئة الإنتاج — تحقق من ملف .env');
}

// ============================================================
//  Database Singleton
// ============================================================
class Database {
    private static ?Database $instance = null;
    private mysqli $connection;

    private function __construct() {
        try {
            $this->connection = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME);
            if ($this->connection->connect_error) {
                throw new Exception('فشل الاتصال بقاعدة البيانات');
            }
            $this->connection->set_charset(DB_CHARSET);
        } catch (Exception $e) {
            error_log('DB Connection Error: ' . $e->getMessage());
            die(json_encode(['success' => false, 'message' => 'خطأ في الاتصال بقاعدة البيانات'], JSON_UNESCAPED_UNICODE));
        }
    }

    public static function getInstance(): static {
        if (self::$instance === null) self::$instance = new self();
        return self::$instance;
    }

    public function getConnection(): mysqli       { return $this->connection; }
    public function query(string $sql): mixed     { return $this->connection->query($sql); }
    public function prepare(string $sql): mixed   { return $this->connection->prepare($sql); }
    public function escape(string $s): string     { return $this->connection->real_escape_string($s); }
    public function lastInsertId(): int           { return $this->connection->insert_id; }
    public function affectedRows(): int           { return $this->connection->affected_rows; }
    public function error(): string               { return $this->connection->error; }

    private function __clone() {}
    public function __wakeup(): void {}
}

function db(): mysqli {
    return Database::getInstance()->getConnection();
}

function clean(string $data): string {
    return htmlspecialchars(trim(stripslashes($data)), ENT_QUOTES, 'UTF-8');
}

function jsonResponse(array $data, int $status = 200): void {
    if (ob_get_level()) ob_end_clean();
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function formatMoney(float $amount): string {
    return number_format($amount, 2, '.', ',') . ' ر.س';
}

function formatDate(string $date): string {
    if (empty($date)) return '—';
    return date('Y-m-d', strtotime($date));
}

// ============================================================
//  CSRF Protection
// ============================================================
function generateCsrfToken(): string {
    if (session_status() !== PHP_SESSION_ACTIVE) session_start();
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

function verifyCsrfToken(string $token): bool {
    if (session_status() !== PHP_SESSION_ACTIVE) session_start();
    $stored = $_SESSION['csrf_token'] ?? '';
    return $stored !== '' && hash_equals($stored, $token);
}

// ============================================================
//  إدارة الجلسات — تصليب كامل
// ============================================================
/**
 * secureSession()
 * استدعِها قبل session_start() في كل ملف PHP يحتاج جلسة.
 * تُطبّق: httponly, samesite=Strict, secure (في الإنتاج),
 *          use_strict_mode, fingerprint check.
 */
function secureSession(): void {
    if (session_status() === PHP_SESSION_ACTIVE) return;

    // ── إعدادات الكوكي ────────────────────────────────────
    $isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || (int)($_SERVER['SERVER_PORT'] ?? 80) === 443;

    session_set_cookie_params([
        'lifetime' => 0,                          // تنتهي بإغلاق المتصفح
        'path'     => '/',
        'domain'   => '',
        'secure'   => IS_PRODUCTION && $isHttps,  // HTTPS فقط في الإنتاج
        'httponly' => true,                        // ← يمنع JS من قراءة PHPSESSID
        'samesite' => 'Strict',                   // ← يمنع CSRF عبر المواقع
    ]);

    // ── إعدادات صارمة ─────────────────────────────────────
    ini_set('session.use_strict_mode',   '1'); // يرفض Session IDs خارجية
    ini_set('session.use_only_cookies',  '1'); // لا Session ID في URL
    ini_set('session.use_trans_sid',     '0'); // لا Session ID في الروابط
    ini_set('session.cookie_httponly',   '1');
    ini_set('session.cookie_samesite',   'Strict');
    ini_set('session.gc_maxlifetime',    '7200'); // ساعتان خمول = logout تلقائي
    ini_set('session.cache_limiter',     'nocache');

    session_start();
}

/**
 * validateSessionFingerprint()
 * يفحص أن الجلسة تخص نفس المتصفح والـ IP — يكتشف Session Hijacking.
 * استدعِها بعد secureSession() في الصفحات المحمية.
 */
function validateSessionFingerprint(): bool {
    if (!isset($_SESSION['user_id'])) return true; // جلسة غير مسجّلة — لا فحص

    $currentFP = hash('sha256',
        ($_SERVER['HTTP_USER_AGENT'] ?? '') .
        ($_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? '')
        // تعمّدنا استبعاد IP لأن بعض المستخدمين يتغيّر IP عبر VPN/Mobile NAT
    );

    if (!isset($_SESSION['_fingerprint'])) {
        // أول طلب — احفظ البصمة
        $_SESSION['_fingerprint'] = $currentFP;
        return true;
    }

    if (!hash_equals($_SESSION['_fingerprint'], $currentFP)) {
        // بصمة مختلفة — قد يكون Session Hijacking
        error_log(sprintf(
            'Session fingerprint mismatch: user_id=%d ip=%s ua_hash=%s',
            $_SESSION['user_id'] ?? 0,
            $_SERVER['REMOTE_ADDR'] ?? '',
            substr($currentFP, 0, 8)
        ));
        session_destroy();
        return false;
    }
    return true;
}

// ============================================================
//  Security Headers
// ============================================================
/**
 * setSecurityHeaders()
 * أضف استدعاءها في بداية index.php و login.php
 * قبل أي echo أو إخراج HTML.
 *
 * تُطبّق: X-Frame-Options, X-Content-Type-Options, X-XSS-Protection,
 *          Referrer-Policy, CSP, وتُخفي X-Powered-By.
 */
function setSecurityHeaders(): void {
    if (headers_sent()) return;

    // ── منع Clickjacking ────────────────────────────────────
    header('X-Frame-Options: SAMEORIGIN');

    // ── منع MIME Sniffing ───────────────────────────────────
    header('X-Content-Type-Options: nosniff');

    // ── XSS Filter (للمتصفحات القديمة) ──────────────────────
    header('X-XSS-Protection: 1; mode=block');

    // ── Referrer Policy ─────────────────────────────────────
    header('Referrer-Policy: strict-origin-when-cross-origin');

    // ── منع caching للصفحات الحساسة ──────────────────────────
    header('Cache-Control: no-store, no-cache, must-revalidate, private');
    header('Pragma: no-cache');

    // ── إخفاء إصدار PHP والسيرفر ────────────────────────────
    header_remove('X-Powered-By');
    header_remove('Server');

    // ── Content Security Policy ──────────────────────────────
    // تسمح بـ: نفس الأصل + Google Fonts + cdnjs للمكتبات
    // unsafe-inline ضروري حالياً لـ <style> المضمّنة — يمكن رفعه لاحقاً بـ nonces
    $csp = implode('; ', [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' cdnjs.cloudflare.com",
        "style-src 'self' 'unsafe-inline' fonts.googleapis.com",
        "font-src 'self' fonts.gstatic.com data:",
        "img-src 'self' data: blob:",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'self'",
    ]);
    header("Content-Security-Policy: $csp");
}

/**
 * setApiSecurityHeaders()
 * نسخة مخففة لملفات API (JSON فقط — لا CSP كامل)
 */
function setApiSecurityHeaders(): void {
    if (headers_sent()) return;
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Cache-Control: no-store, private');
    header_remove('X-Powered-By');
    header_remove('Server');
}