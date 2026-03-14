<?php
/**
 * api_test.php — ارفعه في مجلد api/ واختبره
 * /workflow-system/api/api_test.php
 */
header('Content-Type: application/json; charset=utf-8');
echo json_encode([
    'ok'           => true,
    'action'       => $_GET['action'] ?? 'none',
    'all_get'      => $_GET,
    'query_string' => $_SERVER['QUERY_STRING'] ?? '',
    'request_uri'  => $_SERVER['REQUEST_URI']  ?? '',
    'php_self'     => $_SERVER['PHP_SELF']      ?? '',
], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
