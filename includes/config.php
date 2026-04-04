<?php
/**
 * إعدادات النظام
 * Workflow Management System Configuration
 */

if (!defined('APP_ROOT')) {
    define('APP_ROOT', dirname(__FILE__));
}

// ============================================================
//  قراءة ملف .env (خارج git)
// ============================================================
$_envFile = dirname(__DIR__) . '/.env';
if (file_exists($_envFile)) {
    foreach (file($_envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $_line) {
        $_line = trim($_line);
        if ($_line === '' || (strpos($_line, '#') === 0)) continue;
        if (!(strpos($_line, '=') !== false)) continue;
        [$_k, $_v] = explode('=', $_line, 2);
        $_ENV[trim($_k)] = trim($_v);
    }
}
unset($_envFile, $_line, $_k, $_v);

// ============================================================
//  إعدادات قاعدة البيانات — تُقرأ من .env
// ============================================================
define('DB_HOST',    $_ENV['DB_HOST']    ?? 'localhost');
define('DB_NAME',    $_ENV['DB_NAME']    ?? 'workflow_system');
define('DB_USER',    $_ENV['DB_USER']    ?? 'root');
define('DB_PASS',    $_ENV['DB_PASS']    ?? '');
define('DB_CHARSET', $_ENV['DB_CHARSET'] ?? 'utf8mb4');

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
$_isProduction = !in_array($_SERVER['HTTP_HOST'] ?? '', ['localhost', '127.0.0.1'], true)
              && ($_ENV['APP_ENV'] ?? 'production') !== 'development';

if ($_isProduction) {
    error_reporting(0);
    ini_set('display_errors', '0');
    ini_set('log_errors',     '1');
    $__logDir = dirname(__DIR__) . '/logs';
    if (!is_dir($__logDir)) @mkdir($__logDir, 0750, true);
    ini_set('error_log', $__logDir . '/php_errors.log');
    unset($__logDir);
} else {
    error_reporting(E_ALL);
    ini_set('display_errors', '1');
}
define('IS_PRODUCTION', $_isProduction);
unset($_isProduction);

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