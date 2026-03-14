<?php
/**
 * route_debug.php — تشخيص التوجيه
 * ارفعه في نفس مجلد index.php وافتحه:
 * https://موقعك/route_debug.php
 * وكذلك:
 * https://موقعك/api/route_debug.php
 */
header('Content-Type: application/json; charset=utf-8');
echo json_encode([
    'this_file'       => __FILE__,
    'this_dir'        => __DIR__,
    'request_uri'     => $_SERVER['REQUEST_URI']     ?? '',
    'script_filename' => $_SERVER['SCRIPT_FILENAME'] ?? '',
    'script_name'     => $_SERVER['SCRIPT_NAME']     ?? '',
    'query_string'    => $_SERVER['QUERY_STRING']    ?? '',
    'get_params'      => $_GET,
    'document_root'   => $_SERVER['DOCUMENT_ROOT']  ?? '',
    'server_software' => $_SERVER['SERVER_SOFTWARE'] ?? '',
    'files_in_dir'    => array_values(array_filter(
        array_map('basename', glob(__DIR__ . '/*.php') ?: []),
        fn($f) => in_array($f, ['archive_api.php','ceo_approvals_api.php','budget.php','index.php'])
    )),
], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
