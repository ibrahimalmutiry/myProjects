<?php
/**
 * final_test.php — ارفعه في api/ واحذفه بعدها
 * يختبر archive_api مباشرة
 */
session_start();
header('Content-Type: application/json; charset=utf-8');

// اقرأ محتوى archive_api.php الموجود على السيرفر
$archiveApiPath = __DIR__ . '/archive_api.php';

$result = [
    'archive_api_exists' => file_exists($archiveApiPath),
    'archive_api_size'   => file_exists($archiveApiPath) ? filesize($archiveApiPath) : 0,
    'archive_api_mtime'  => file_exists($archiveApiPath) ? date('Y-m-d H:i:s', filemtime($archiveApiPath)) : null,
];

// تحقق من وجود الـ cases المهمة في الملف
if (file_exists($archiveApiPath)) {
    $content = file_get_contents($archiveApiPath);
    $result['has_case_stats']       = strpos($content, "case 'stats'") !== false;
    $result['has_case_expiry_list'] = strpos($content, "case 'expiry_list'") !== false;
    $result['has_case_upload']      = strpos($content, "case 'upload'") !== false;
    $result['has_ob_start']         = strpos($content, 'ob_start()') !== false;
    $result['first_100_chars']      = substr($content, 0, 100);
    $result['line_count']           = substr_count($content, "\n");
}

echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
