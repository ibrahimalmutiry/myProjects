<?php
/**
 * process_signature.php — api/process_signature.php
 */
ob_start();
session_start();
session_write_close();
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../includes/functions.php';

if (!isset($_SESSION['user_id'])) {
    ob_end_clean(); http_response_code(401);
    echo json_encode(['success'=>false,'message'=>'غير مصرح'],JSON_UNESCAPED_UNICODE); exit;
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    ob_end_clean();
    echo json_encode(['success'=>false,'message'=>'POST فقط'],JSON_UNESCAPED_UNICODE); exit;
}

// مجلد مؤقت داخل المشروع
$tmpDir = __DIR__ . '/../uploads/tmp_sig/';
if (!is_dir($tmpDir)) @mkdir($tmpDir, 0755, true);
if (!is_dir($tmpDir) || !is_writable($tmpDir)) $tmpDir = rtrim(sys_get_temp_dir(),'/').'/';

$body   = json_decode(file_get_contents('php://input'), true) ?? [];
$b64    = $body['image_base64'] ?? '';
$doCrop = !empty($body['crop']);

if (empty($b64)) {
    ob_end_clean();
    echo json_encode(['success'=>false,'message'=>'image_base64 مطلوب'],JSON_UNESCAPED_UNICODE); exit;
}

// استخراج base64 بشكل صحيح
if (strpos($b64, ';base64,') !== false) {
    $b64clean = substr($b64, strpos($b64, ';base64,') + 8);
} else {
    $b64clean = $b64;
}
$b64clean = trim($b64clean);
$imgData  = base64_decode($b64clean, true);

if ($imgData === false || strlen($imgData) < 10) {
    ob_end_clean();
    echo json_encode(['success'=>false,'message'=>'base64 غير صالح: len='.strlen($b64clean)],JSON_UNESCAPED_UNICODE);
    exit;
}

$uid       = uniqid('sig_', true);
$tmpInput  = $tmpDir . $uid . '_in.png';
$tmpOutput = $tmpDir . $uid . '_out.png';

if (file_put_contents($tmpInput, $imgData) === false) {
    ob_end_clean();
    echo json_encode(['success'=>false,'message'=>'فشل حفظ الملف المؤقت','dir'=>$tmpDir,'writable'=>is_writable($tmpDir)],JSON_UNESCAPED_UNICODE); exit;
}

function findPython(): string {
    foreach (['/opt/homebrew/bin/python3','/usr/local/bin/python3','/usr/bin/python3','python3','python'] as $p) {
        if (strpos($p,'/') === 0 && file_exists($p)) return $p;
        $f = trim((string)shell_exec("which $p 2>/dev/null"));
        if ($f) return $f;
    }
    return 'python3';
}

$scriptPath = null;
foreach ([__DIR__.'/extract_signature.py', __DIR__.'/../extract_signature.py', __DIR__.'/../scripts/extract_signature.py'] as $p)
    if (file_exists($p)) { $scriptPath = $p; break; }

if (!$scriptPath) {
    @unlink($tmpInput); ob_end_clean();
    echo json_encode(['success'=>false,'message'=>'extract_signature.py غير موجود — ضعه في api/'],JSON_UNESCAPED_UNICODE); exit;
}

$python = findPython();
$cmd    = escapeshellarg($python).' '.escapeshellarg($scriptPath).' '.escapeshellarg($tmpInput).' '.escapeshellarg($tmpOutput).($doCrop?' --crop':'').' 2>&1';
$stdout = shell_exec($cmd);
@unlink($tmpInput);

if ($stdout === null) {
    ob_end_clean();
    echo json_encode(['success'=>false,'message'=>'فشل تشغيل Python','hint'=>'pip3 install opencv-python numpy'],JSON_UNESCAPED_UNICODE); exit;
}

$pyResult = null;
foreach (array_reverse(array_filter(array_map('trim', explode("\n", trim($stdout))))) as $line) {
    $d = json_decode($line, true);
    if ($d !== null) { $pyResult = $d; break; }
}

if (!$pyResult || !$pyResult['success']) {
    @unlink($tmpOutput); ob_end_clean();
    echo json_encode(['success'=>false,'message'=>$pyResult['error']??'خطأ Python','stdout'=>substr($stdout,0,400)],JSON_UNESCAPED_UNICODE); exit;
}

if (!file_exists($tmpOutput) || filesize($tmpOutput) < 100) {
    ob_end_clean();
    echo json_encode(['success'=>false,'message'=>'ملف الناتج غير موجود'],JSON_UNESCAPED_UNICODE); exit;
}

$png = file_get_contents($tmpOutput);
@unlink($tmpOutput);
ob_end_clean();
echo json_encode([
    'success'      => true,
    'image_base64' => 'data:image/png;base64,' . base64_encode($png),
    'size'         => $pyResult['size'] ?? null,
    'message'      => 'OpenCV OK',
], JSON_UNESCAPED_UNICODE);