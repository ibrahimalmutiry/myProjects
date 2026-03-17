<?php
/**
 * pdf_generator.php
 * يستدعي Python + pdfkit + wkhtmltopdf لتوليد PDF
 */

ob_start();
error_reporting(0);
ini_set('display_errors', 0);
session_start();
session_write_close();
ob_clean();
header('Content-Type: application/json; charset=utf-8');

function jsonOut($d) { ob_clean(); echo json_encode($d, JSON_UNESCAPED_UNICODE); exit; }

// functions.php
$fp = __DIR__ . '/../includes/functions.php';
if (!file_exists($fp)) jsonOut(['success' => false, 'message' => 'functions.php غير موجود']);
require_once $fp;

// جلسة
if (!isset($_SESSION['user_id'])) { http_response_code(401); jsonOut(['success' => false, 'message' => 'غير مصرح']); }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonOut(['success' => false, 'message' => 'POST فقط']);

// بيانات
$body  = json_decode(file_get_contents('php://input'), true) ?? [];
$html  = $body['html']     ?? '';
$fname = $body['filename'] ?? ('ceo_' . time() . '.pdf');
$resId = (int)($body['reservation_id'] ?? 0);
if (empty(trim($html))) jsonOut(['success' => false, 'message' => 'HTML مفقود']);

// ── مسارات ──────────────────────────────────────────────────────
// Python من pyenv (المسار الذي يستخدمه المستخدم)
// python3 من النظام — يملك pdfkit + wkhtmltopdf
$pythonBin = '/usr/bin/python3';
if (!file_exists($pythonBin)) $pythonBin = 'python3';

$pyScript  = __DIR__ . '/pdf_python.py';
if (!file_exists($pyScript)) jsonOut(['success' => false, 'message' => 'pdf_python.py غير موجود: ' . $pyScript]);

// مجلد حفظ PDF
$uploadDir = __DIR__ . '/../uploads/ceo_approvals/';
if (!is_dir($uploadDir)) @mkdir($uploadDir, 0755, true);
if (!is_dir($uploadDir)) jsonOut(['success' => false, 'message' => 'تعذر إنشاء المجلد: ' . $uploadDir]);

$safeFilename = preg_replace('/[^a-zA-Z0-9._-]/', '_', $fname);
$outputPath   = $uploadDir . $safeFilename;
$relPath      = 'uploads/ceo_approvals/' . $safeFilename;

// ── كتابة HTML في مجلد uploads (قابل للكتابة) ───────────────────
$tmpHtml = $uploadDir . 'tmp_' . uniqid() . '.html';
if (file_put_contents($tmpHtml, $html) === false) {
    jsonOut(['success' => false, 'message' => 'تعذر كتابة ملف HTML في: ' . $uploadDir]);
}

// ── تشغيل Python ────────────────────────────────────────────────
$cmd = escapeshellarg($pythonBin) . ' '
     . escapeshellarg($pyScript) . ' '
     . escapeshellarg($tmpHtml) . ' '
     . escapeshellarg($outputPath);

$output = []; $code = 0;
exec($cmd . ' 2>&1', $output, $code);
@unlink($tmpHtml);

$outStr = trim(implode("\n", $output));
$result = json_decode($outStr, true);

if (!is_array($result)) {
    jsonOut([
        'success' => false,
        'message' => 'Python لم يُرجع JSON صالحاً',
        'debug'   => $outStr,
        'cmd'     => $cmd,
        'code'    => $code,
    ]);
}

if (!($result['success'] ?? false)) {
    jsonOut([
        'success' => false,
        'message' => 'فشل توليد PDF: ' . ($result['error'] ?? 'خطأ غير معروف'),
        'debug'   => $outStr,
    ]);
}

// ── أرشفة ────────────────────────────────────────────────────────
try {
    $conn   = db();
    $uid    = (int)$_SESSION['user_id'];
    $fsize  = $result['size'] ?? (file_exists($outputPath) ? filesize($outputPath) : 0);
    $dname  = $conn->real_escape_string($body['display_name']  ?? $safeFilename);
    $desc   = $conn->real_escape_string($body['description']   ?? '');
    $cat    = $conn->real_escape_string($body['category']      ?? 'موازنة_تخطيط');
    $tags   = $conn->real_escape_string($body['tags']          ?? 'اعتمادات الرئيس التنفيذي');
    $srcMod = $conn->real_escape_string($body['source_module'] ?? 'budget');
    $fpath  = $conn->real_escape_string($relPath);
    $deptId = isset($_SESSION['department_id']) ? (int)$_SESSION['department_id'] : 'NULL';
    $srcId  = $resId ?: 'NULL';

    $conn->query("INSERT INTO financial_archive
        (file_name, display_name, file_path, file_size, file_type, file_extension,
         source_module, source_id, source_ref, category, tags, description,
         uploaded_by, department_id, is_manual)
        VALUES ('$safeFilename','$dname','$fpath',$fsize,'application/pdf','pdf',
         '$srcMod',$srcId,'$dname','$cat','$tags','$desc',$uid,$deptId,1)");
    $archiveId = $conn->insert_id ?: null;
} catch (Exception $e) {
    $archiveId = null;
}

jsonOut(['success' => true, 'path' => $relPath, 'archive_id' => $archiveId, 'size' => $fsize]);