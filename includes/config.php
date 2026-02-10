<?php
/**
 * إعدادات النظام
 * Workflow Management System Configuration
 */

// منع الوصول المباشر
if (!defined('APP_ROOT')) {
    define('APP_ROOT', dirname(__FILE__));
}

// إعدادات قاعدة البيانات
define('DB_HOST', 'localhost');
define('DB_NAME', 'workflow_system');
define('DB_USER', 'root');
define('DB_PASS', '');
define('DB_CHARSET', 'utf8mb4');

// إعدادات التطبيق
define('APP_NAME', 'نظام إدارة المعاملات');
define('APP_VERSION', '1.0.0');
define('APP_LANG', 'ar');

// إعدادات المنطقة الزمنية
date_default_timezone_set('Asia/Riyadh');

// إعدادات الأخطاء (غيّر إلى 0 في الإنتاج)
error_reporting(E_ALL);
ini_set('display_errors', 1);

/**
 * كلاس الاتصال بقاعدة البيانات
 */
class Database {
    private static $instance = null;
    private $connection;

    private function __construct() {
        try {
            $this->connection = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME);
            
            if ($this->connection->connect_error) {
                throw new Exception('فشل الاتصال بقاعدة البيانات: ' . $this->connection->connect_error);
            }
            
            $this->connection->set_charset(DB_CHARSET);
            
        } catch (Exception $e) {
            die('خطأ في قاعدة البيانات: ' . $e->getMessage());
        }
    }

    public static function getInstance() {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    public function getConnection() {
        return $this->connection;
    }

    public function query($sql) {
        return $this->connection->query($sql);
    }

    public function prepare($sql) {
        return $this->connection->prepare($sql);
    }

    public function escape($string) {
        return $this->connection->real_escape_string($string);
    }

    public function lastInsertId() {
        return $this->connection->insert_id;
    }

    public function affectedRows() {
        return $this->connection->affected_rows;
    }

    public function error() {
        return $this->connection->error;
    }

    private function __clone() {}
    public function __wakeup() {}
}

/**
 * دالة مساعدة للحصول على اتصال قاعدة البيانات
 */
function db() {
    return Database::getInstance()->getConnection();
}

/**
 * دالة لتنظيف المدخلات
 */
function clean($data) {
    $data = trim($data);
    $data = stripslashes($data);
    $data = htmlspecialchars($data, ENT_QUOTES, 'UTF-8');
    return $data;
}

/**
 * دالة للرد بـ JSON
 */
function jsonResponse($data, $status = 200) {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * دالة لتنسيق المبالغ
 */
function formatMoney($amount) {
    return number_format($amount, 2, '.', ',') . ' ر.س';
}

/**
 * دالة لتنسيق التاريخ
 */
function formatDate($date) {
    if (empty($date)) return '—';
    return date('Y-m-d', strtotime($date));
}
