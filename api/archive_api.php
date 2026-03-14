<?php
/**
 * archive_api.php
 * API نظام الأرشيف المالي
 */

ob_start();
error_reporting(0);
ini_set('display_errors', 0);
ini_set('display_startup_errors', 0);

// معالج الأخطاء — يضمن JSON دائماً بدل HTML
set_error_handler(function($errno, $errstr, $errfile, $errline) {
    ob_end_clean();
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'success' => false,
        'message' => "PHP Error [$errno]: $errstr",
        'file'    => basename($errfile),
        'line'    => $errline
    ], JSON_UNESCAPED_UNICODE);
    exit;
});

set_exception_handler(function($e) {
    ob_end_clean();
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'success' => false,
        'message' => 'Exception: ' . $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
    exit;
});

session_start();

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

// ── تحميل config.php ─────────────────────────────────────────
$configPaths = [
    dirname(__DIR__) . '/config.php',               // api/../config.php  ✅
    dirname(__DIR__) . '/includes/config.php',      // api/../includes/config.php
    __DIR__ . '/../config.php',
];
$configLoaded = false;
foreach ($configPaths as $cp) {
    if (file_exists($cp)) { require_once $cp; $configLoaded = true; break; }
}
if (!$configLoaded) {
    ob_end_clean();
    echo json_encode([
        'success' => false,
        'message' => 'config.php غير موجود',
        'searched' => $configPaths
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// ── تحميل archive_functions.php ──────────────────────────────
$funcPaths = [
    dirname(__DIR__) . '/includes/archive_functions.php',  // api/../includes/archive_functions.php
    dirname(__DIR__) . '/archive_functions.php',           // api/../archive_functions.php
    __DIR__ . '/../includes/archive_functions.php',
];
$funcLoaded = false;
foreach ($funcPaths as $fp) {
    if (file_exists($fp)) { require_once $fp; $funcLoaded = true; break; }
}
if (!$funcLoaded) {
    ob_end_clean();
    echo json_encode([
        'success' => false,
        'message' => 'archive_functions.php غير موجود',
        'searched' => $funcPaths
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// ── التحقق من تسجيل الدخول ──────────────────────────────────
if (!isset($_SESSION['user_id'])) {
    ob_end_clean();
    echo json_encode(['success' => false, 'message' => 'يجب تسجيل الدخول أولاً'], JSON_UNESCAPED_UNICODE);
    exit;
}

// تهيئة الجداول
ensureArchiveTables();

$userId       = (int)$_SESSION['user_id'];
$userRole     = $_SESSION['user_role'] ?? '';
$departmentId = $_SESSION['department_id'] ?? null;
$permLevel    = $_SESSION['permission_level'] ?? 'employee';
$method       = $_SERVER['REQUEST_METHOD'];
$action       = $_GET['action'] ?? '';

try {
    switch ($action) {

        // ══ الإحصائيات ════════════════════════════════════════
        case 'stats':
            $stats = getArchiveStats($permLevel, $departmentId);
            ob_end_clean();
            echo json_encode(['success' => true, 'data' => $stats], JSON_UNESCAPED_UNICODE);
            break;

        // ══ قائمة الملفات ════════════════════════════════════
        case 'list':
            $filters = [
                'search'         => $_GET['search'] ?? '',
                'source_module'  => $_GET['source_module'] ?? '',
                'category'       => $_GET['category'] ?? '',
                'file_extension' => $_GET['file_extension'] ?? '',
                'date_from'      => $_GET['date_from'] ?? '',
                'date_to'        => $_GET['date_to'] ?? '',
                'order'          => $_GET['order'] ?? 'date_desc',
                'page'           => (int)($_GET['page'] ?? 1),
                'limit'          => (int)($_GET['limit'] ?? 20),
            ];
            $data = getArchiveFiles($filters, $userId, $permLevel, $departmentId);
            ob_end_clean();
            echo json_encode(['success' => true, 'data' => $data], JSON_UNESCAPED_UNICODE);
            break;

        // ══ تفاصيل ملف واحد ══════════════════════════════════
        case 'file':
            $id   = (int)($_GET['id'] ?? 0);
            $file = getArchiveFile($id);
            ob_end_clean();
            if (!$file) {
                echo json_encode(['success' => false, 'message' => 'الملف غير موجود'], JSON_UNESCAPED_UNICODE);
            } else {
                echo json_encode(['success' => true, 'data' => $file], JSON_UNESCAPED_UNICODE);
            }
            break;

        // ══ رفع ملف جديد ════════════════════════════════════
        case 'upload':
            if ($method !== 'POST') {
                ob_end_clean();
                echo json_encode(['success' => false, 'message' => 'طريقة غير مسموحة'], JSON_UNESCAPED_UNICODE);
                break;
            }
            if (empty($_FILES['file'])) {
                ob_end_clean();
                echo json_encode(['success' => false, 'message' => 'لم يتم اختيار ملف'], JSON_UNESCAPED_UNICODE);
                break;
            }
            $result = uploadToArchive($_FILES['file'], $_POST, $userId, $departmentId);
            ob_end_clean();
            echo json_encode($result, JSON_UNESCAPED_UNICODE);
            break;

        // ══ حذف ملف ══════════════════════════════════════════
        case 'delete':
            if ($method !== 'POST') {
                ob_end_clean();
                echo json_encode(['success' => false, 'message' => 'طريقة غير مسموحة'], JSON_UNESCAPED_UNICODE);
                break;
            }
            $body = json_decode(file_get_contents('php://input'), true);
            $id   = (int)($body['id'] ?? 0);
            ob_end_clean();
            if (!$id) {
                echo json_encode(['success' => false, 'message' => 'معرّف غير صالح'], JSON_UNESCAPED_UNICODE);
            } else {
                $ok = deleteArchiveFile($id, $userId);
                echo json_encode(['success' => $ok, 'message' => $ok ? 'تم الحذف' : 'فشل الحذف'], JSON_UNESCAPED_UNICODE);
            }
            break;

        // ══ وثائق الصلاحية — قائمة ═══════════════════════════
        case 'expiry_list':
            $filters = [
                'doc_type' => $_GET['doc_type'] ?? '',
                'status'   => $_GET['status'] ?? '',
            ];
            $docs = getExpiryDocs($filters, $userId, $permLevel, $departmentId);
            ob_end_clean();
            echo json_encode(['success' => true, 'data' => $docs], JSON_UNESCAPED_UNICODE);
            break;

        // ══ وثائق الصلاحية — إضافة ═══════════════════════════
        case 'expiry_add':
            if ($method !== 'POST') {
                ob_end_clean();
                echo json_encode(['success' => false, 'message' => 'طريقة غير مسموحة'], JSON_UNESCAPED_UNICODE);
                break;
            }
            $body = json_decode(file_get_contents('php://input'), true);
            if (empty($body['doc_name']) || empty($body['doc_type']) || empty($body['expiry_date'])) {
                ob_end_clean();
                echo json_encode(['success' => false, 'message' => 'البيانات المطلوبة غير مكتملة'], JSON_UNESCAPED_UNICODE);
                break;
            }
            $id = addExpiryDoc($body, $userId, $departmentId);
            ob_end_clean();
            echo json_encode(['success' => true, 'id' => $id, 'message' => 'تمت الإضافة بنجاح'], JSON_UNESCAPED_UNICODE);
            break;

        // ══ وثائق الصلاحية — تحديث ═══════════════════════════
        case 'expiry_update':
            if ($method !== 'POST') {
                ob_end_clean();
                echo json_encode(['success' => false, 'message' => 'طريقة غير مسموحة'], JSON_UNESCAPED_UNICODE);
                break;
            }
            $body = json_decode(file_get_contents('php://input'), true);
            $id   = (int)($body['id'] ?? 0);
            ob_end_clean();
            if (!$id) {
                echo json_encode(['success' => false, 'message' => 'معرّف غير صالح'], JSON_UNESCAPED_UNICODE);
            } else {
                $ok = updateExpiryDoc($id, $body);
                echo json_encode(['success' => $ok, 'message' => $ok ? 'تم التحديث' : 'فشل التحديث'], JSON_UNESCAPED_UNICODE);
            }
            break;

        // ══ وثائق الصلاحية — حذف ════════════════════════════
        case 'expiry_delete':
            if ($method !== 'POST') {
                ob_end_clean();
                echo json_encode(['success' => false, 'message' => 'طريقة غير مسموحة'], JSON_UNESCAPED_UNICODE);
                break;
            }
            $body = json_decode(file_get_contents('php://input'), true);
            $id   = (int)($body['id'] ?? 0);
            ob_end_clean();
            if (!$id) {
                echo json_encode(['success' => false, 'message' => 'معرّف غير صالح'], JSON_UNESCAPED_UNICODE);
            } else {
                $ok = deleteExpiryDoc($id);
                echo json_encode(['success' => $ok, 'message' => $ok ? 'تم الحذف' : 'فشل الحذف'], JSON_UNESCAPED_UNICODE);
            }
            break;

        // ══ عرض ملف (stream) ══════════════════════════════════
        case 'view':
            $id   = (int)($_GET['id'] ?? 0);
            $file = getArchiveFile($id);
            ob_end_clean();
            if (!$file) { http_response_code(404); echo 'الملف غير موجود'; exit; }

            $fullPath = __DIR__ . '/../' . $file['file_path'];

            // جرب المسار المباشر أيضاً
            if (!file_exists($fullPath)) {
                $fullPath = __DIR__ . '/' . $file['file_path'];
            }
            if (!file_exists($fullPath)) {
                $fullPath = realpath($file['file_path']);
            }

            if (!$fullPath || !file_exists($fullPath)) {
                http_response_code(404);
                echo 'الملف غير موجود على السيرفر: ' . $file['file_path'];
                exit;
            }

            $mimeTypes = [
                'pdf'  => 'application/pdf',
                'jpg'  => 'image/jpeg', 'jpeg' => 'image/jpeg',
                'png'  => 'image/png',  'gif'  => 'image/gif',
                'webp' => 'image/webp', 'txt'  => 'text/plain',
            ];
            $ext  = strtolower($file['file_extension'] ?? '');
            $mime = $mimeTypes[$ext] ?? 'application/octet-stream';

            header('Content-Type: ' . $mime);
            header('Content-Disposition: inline; filename="' . rawurlencode($file['display_name']) . '"');
            header('Content-Length: ' . filesize($fullPath));
            header('Cache-Control: private, max-age=3600');
            readfile($fullPath);
            exit;

        // ══ تحميل ملف ════════════════════════════════════════
        case 'download':
            $id   = (int)($_GET['id'] ?? 0);
            $file = getArchiveFile($id);
            ob_end_clean();
            if (!$file) { http_response_code(404); echo 'الملف غير موجود'; exit; }

            $fullPath = __DIR__ . '/../' . $file['file_path'];
            if (!file_exists($fullPath)) $fullPath = __DIR__ . '/' . $file['file_path'];

            if (!file_exists($fullPath)) {
                http_response_code(404);
                echo 'الملف غير موجود على السيرفر';
                exit;
            }

            header('Content-Type: application/octet-stream');
            header('Content-Disposition: attachment; filename="' . rawurlencode($file['display_name']) . '"');
            header('Content-Length: ' . filesize($fullPath));
            readfile($fullPath);
            exit;

        // ══ مزامنة يدوية ════════════════════════════════════
        case 'sync':
            syncExistingAttachments();
            ob_end_clean();
            echo json_encode(['success' => true, 'message' => 'تمت المزامنة بنجاح'], JSON_UNESCAPED_UNICODE);
            break;

        // ══ تشخيص (للاختبار فقط) ════════════════════════════
        case 'debug':
            ob_end_clean();
            echo json_encode([
                'success'    => true,
                'php_ver'    => PHP_VERSION,
                'dir'        => __DIR__,
                'session_ok' => isset($_SESSION['user_id']),
                'user_id'    => $_SESSION['user_id'] ?? null,
                'perm'       => $permLevel,
            ], JSON_UNESCAPED_UNICODE);
            break;

        default:
            ob_end_clean();
            echo json_encode(['success' => false, 'message' => 'إجراء غير معروف: ' . $action], JSON_UNESCAPED_UNICODE);
    }

} catch (Exception $e) {
    ob_end_clean();
    echo json_encode([
        'success' => false,
        'message' => 'خطأ: ' . $e->getMessage(),
        'trace'   => $e->getFile() . ':' . $e->getLine()
    ], JSON_UNESCAPED_UNICODE);
}