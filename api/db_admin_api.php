<?php
/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║       db_admin_api.php — API إدارة قاعدة البيانات           ║
 * ║  مخصص لمدير النظام (system_admin) فقط                        ║
 * ║  الموقع: workflow-system/api/db_admin_api.php                ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

ini_set('display_errors', 0);
ini_set('display_startup_errors', 0);
error_reporting(E_ALL);

session_start();

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}
require_once __DIR__ . '/../includes/config.php';
// دالة jsonResponse مبكرة قبل require
if (!function_exists('jsonResponse')) {
    function jsonResponse($data, $status = 200) {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }
}

// البحث عن functions.php في المسارات المحتملة
$possiblePaths = [
    __DIR__ . '/../includes/functions.php',
    dirname(__DIR__)  . '/includes/functions.php',
    __DIR__ . '/../../includes/functions.php',
    __DIR__ . '/../functions.php',
    __DIR__ . '/functions.php',
];

$functionsPath = null;
foreach ($possiblePaths as $path) {
    if (file_exists($path)) {
        $functionsPath = $path;
        break;
    }
}

if (!$functionsPath) {
    jsonResponse([
        'success' => false,
        'message' => 'تعذّر إيجاد functions.php. جُرِّب: ' . implode(' | ', $possiblePaths)
    ], 500);
}

try {
    require_once $functionsPath;
} catch (Throwable $e) {
    jsonResponse(['success' => false, 'message' => 'خطأ تحميل functions.php: ' . $e->getMessage()], 500);
}

// التحقق من تسجيل الدخول
if (!isset($_SESSION['user_id'])) {
    jsonResponse(['success' => false, 'message' => 'يجب تسجيل الدخول أولاً'], 401);
}

// التحقق من الصلاحية
$permissionLevel = $_SESSION['permission_level'] ?? '';
if (empty($permissionLevel)) {
    $conn   = db();
    $uid    = (int)$_SESSION['user_id'];
    $r      = $conn->query("SELECT role, permission_level FROM employees WHERE id=$uid LIMIT 1");
    if ($r && $row = $r->fetch_assoc()) {
        $permissionLevel = ($row['role'] === 'admin') ? 'system_admin' : ($row['permission_level'] ?? 'employee');
    }
}

if ($permissionLevel !== 'system_admin') {
    jsonResponse(['success' => false, 'message' => 'هذه الصفحة مخصصة لمدير النظام فقط'], 403);
}

$conn   = db();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

try {
    switch ($action) {

        case 'get_tables':
            $tables = [];
            $res = $conn->query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'");
            if (!$res) $res = $conn->query("SHOW TABLES");
            while ($row = $res->fetch_array()) {
                $tbl    = $row[0];
                $cntRes = $conn->query("SELECT COUNT(*) as c FROM `$tbl`");
                $cnt    = $cntRes ? (int)($cntRes->fetch_assoc()['c'] ?? 0) : 0;
                $tables[] = ['name' => $tbl, 'count' => $cnt];
            }
            jsonResponse(['success' => true, 'data' => $tables]);
            break;

        case 'get_columns':
            $table = $conn->real_escape_string($_GET['table'] ?? '');
            if (!$table) jsonResponse(['success' => false, 'message' => 'اسم الجدول مفقود'], 400);
            $res = $conn->query("DESCRIBE `$table`");
            if (!$res) jsonResponse(['success' => false, 'message' => 'جدول غير موجود: ' . $conn->error], 404);
            $columns = [];
            while ($row = $res->fetch_assoc()) $columns[] = $row;
            jsonResponse(['success' => true, 'data' => $columns]);
            break;

        case 'get_rows':
            $table  = $conn->real_escape_string($_GET['table'] ?? '');
            $search = trim($_GET['search'] ?? '');
            $page   = max(1, (int)($_GET['page']  ?? 1));
            $limit  = min(100, max(10, (int)($_GET['limit'] ?? 50)));
            $offset = ($page - 1) * $limit;

            if (!$table) jsonResponse(['success' => false, 'message' => 'اسم الجدول مفقود'], 400);

            $where = '';
            if ($search !== '') {
                $s      = $conn->real_escape_string($search);
                $colRes = $conn->query("SHOW COLUMNS FROM `$table`");
                $conds  = [];
                if ($colRes) {
                    while ($c = $colRes->fetch_assoc()) {
                        $t = strtolower($c['Type']);
                        if (str_contains($t, 'char') || str_contains($t, 'text') || str_contains($t, 'enum')) {
                            $conds[] = "`{$c['Field']}` LIKE '%$s%'";
                        }
                    }
                }
                if ($conds) $where = ' WHERE ' . implode(' OR ', $conds);
            }

            $totalRes  = $conn->query("SELECT COUNT(*) as c FROM `$table`$where");
            $totalRows = $totalRes ? (int)($totalRes->fetch_assoc()['c'] ?? 0) : 0;

            $rows = [];
            $res  = $conn->query("SELECT * FROM `$table`$where ORDER BY 1 DESC LIMIT $limit OFFSET $offset");
            if ($res) while ($r = $res->fetch_assoc()) $rows[] = $r;

            jsonResponse([
                'success' => true,
                'data'    => $rows,
                'meta'    => [
                    'total' => $totalRows,
                    'page'  => $page,
                    'limit' => $limit,
                    'pages' => (int)ceil($totalRows / max(1, $limit))
                ]
            ]);
            break;

        case 'add_row':
            if ($method !== 'POST') jsonResponse(['success' => false, 'message' => 'طريقة غير صحيحة'], 405);
            $table = $conn->real_escape_string($_GET['table'] ?? '');
            $input = json_decode(file_get_contents('php://input'), true) ?? [];
            if (!$table) jsonResponse(['success' => false, 'message' => 'اسم الجدول مفقود'], 400);
            if (empty($input)) jsonResponse(['success' => false, 'message' => 'لا توجد بيانات'], 400);
            $cols = []; $vals = [];
            foreach ($input as $col => $val) {
                $cols[] = '`' . $conn->real_escape_string($col) . '`';
                $vals[] = ($val === null || $val === '') ? 'NULL' : "'" . $conn->real_escape_string((string)$val) . "'";
            }
            $sql = "INSERT INTO `$table` (" . implode(',', $cols) . ") VALUES (" . implode(',', $vals) . ")";
            if ($conn->query($sql)) jsonResponse(['success' => true, 'message' => 'تمت الإضافة بنجاح', 'id' => $conn->insert_id]);
            else jsonResponse(['success' => false, 'message' => 'فشل الإضافة: ' . $conn->error], 500);
            break;

        case 'update_row':
            if ($method !== 'POST') jsonResponse(['success' => false, 'message' => 'طريقة غير صحيحة'], 405);
            $table  = $conn->real_escape_string($_GET['table']  ?? '');
            $pk     = $conn->real_escape_string($_GET['pk']     ?? 'id');
            $pkVal  = $conn->real_escape_string($_GET['pk_val'] ?? '');
            $input  = json_decode(file_get_contents('php://input'), true) ?? [];
            if (!$table || $pkVal === '') jsonResponse(['success' => false, 'message' => 'بيانات غير مكتملة'], 400);
            if (empty($input)) jsonResponse(['success' => false, 'message' => 'لا توجد بيانات للتعديل'], 400);
            $sets = [];
            foreach ($input as $col => $val) {
                $c = $conn->real_escape_string($col);
                $v = ($val === null || $val === '') ? 'NULL' : "'" . $conn->real_escape_string((string)$val) . "'";
                $sets[] = "`$c` = $v";
            }
            $sql = "UPDATE `$table` SET " . implode(', ', $sets) . " WHERE `$pk` = '$pkVal'";
            if ($conn->query($sql)) jsonResponse(['success' => true, 'message' => 'تم التعديل بنجاح']);
            else jsonResponse(['success' => false, 'message' => 'فشل التعديل: ' . $conn->error], 500);
            break;

        case 'delete_row':
            if ($method !== 'DELETE' && $method !== 'POST') {
                jsonResponse(['success' => false, 'message' => 'طريقة غير صحيحة'], 405);
            }
            $table = $conn->real_escape_string($_GET['table']  ?? '');
            $pk    = $conn->real_escape_string($_GET['pk']     ?? 'id');
            $pkVal = $conn->real_escape_string($_GET['pk_val'] ?? '');
            if (!$table || $pkVal === '') jsonResponse(['success' => false, 'message' => 'بيانات غير مكتملة'], 400);
            $sql = "DELETE FROM `$table` WHERE `$pk` = '$pkVal' LIMIT 1";
            if ($conn->query($sql)) jsonResponse(['success' => true, 'message' => 'تم الحذف بنجاح']);
            else jsonResponse(['success' => false, 'message' => 'فشل الحذف: ' . $conn->error], 500);
            break;

        // ══════════════════════════════════════════════════════
        //  إنشاء جدول جديد مع دعم Foreign Keys
        // ══════════════════════════════════════════════════════
        case 'create_table':
            if ($method !== 'POST') jsonResponse(['success' => false, 'message' => 'طريقة غير صحيحة'], 405);
            $input = json_decode(file_get_contents('php://input'), true) ?? [];

            $tableName = trim($input['table_name'] ?? '');
            $columns   = $input['columns']     ?? [];
            $fkeys     = $input['foreign_keys'] ?? [];

            // التحقق من اسم الجدول
            if (!$tableName || !preg_match('/^[a-z][a-z0-9_]{0,63}$/', $tableName)) {
                jsonResponse(['success' => false, 'message' => 'اسم الجدول غير صالح. يجب أن يبدأ بحرف ويحتوي على أحرف صغيرة وأرقام وشرطة سفلية فقط.'], 400);
            }

            // التأكد من عدم وجود الجدول مسبقاً
            $exists = $conn->query("SHOW TABLES LIKE '" . $conn->real_escape_string($tableName) . "'");
            if ($exists && $exists->num_rows > 0) {
                jsonResponse(['success' => false, 'message' => "الجدول '$tableName' موجود مسبقاً"], 409);
            }

            if (empty($columns)) {
                jsonResponse(['success' => false, 'message' => 'يجب إضافة عمود واحد على الأقل'], 400);
            }

            // الأنواع المسموح بها فقط
            $allowedTypes = [
                'INT','BIGINT','TINYINT','SMALLINT','FLOAT','DOUBLE',
                'DECIMAL','VARCHAR','TEXT','LONGTEXT','MEDIUMTEXT',
                'DATE','DATETIME','TIMESTAMP','BOOLEAN','ENUM','JSON'
            ];

            $colDefs = [];
            $pkCols  = [];
            $uqCols  = [];

            foreach ($columns as $col) {
                $colName = trim($col['name'] ?? '');
                $colType = strtoupper(trim($col['type'] ?? 'VARCHAR(255)'));

                if (!$colName || !preg_match('/^[a-z][a-z0-9_]{0,63}$/', $colName)) {
                    jsonResponse(['success' => false, 'message' => "اسم العمود غير صالح: '$colName'"], 400);
                }

                // التحقق من نوع العمود (نستخرج الاسم الأساسي)
                $baseType = preg_replace('/\(.*/', '', $colType);
                if (!in_array($baseType, $allowedTypes)) {
                    jsonResponse(['success' => false, 'message' => "نوع غير مسموح: '$colType'"], 400);
                }

                // معالجة ENUM
                if ($baseType === 'ENUM' && !empty($col['enumVals'])) {
                    $enumVals = array_map(function($v) use ($conn) {
                        return "'" . $conn->real_escape_string(trim($v)) . "'";
                    }, explode(',', $col['enumVals']));
                    $colType = "ENUM(" . implode(',', $enumVals) . ")";
                }

                // معالجة VARCHAR بدون حجم
                if ($baseType === 'VARCHAR' && !str_contains($colType, '(')) {
                    $colType = 'VARCHAR(255)';
                }

                // معالجة DECIMAL بدون حجم
                if ($baseType === 'DECIMAL' && !str_contains($colType, '(')) {
                    $colType = 'DECIMAL(15,2)';
                }

                $def = "  `$colName` $colType";

                $notNull = !empty($col['notNull']) || !empty($col['pk']);
                $autoInc = !empty($col['autoInc']) && in_array($baseType, ['INT','BIGINT','SMALLINT','TINYINT']);
                $isPk    = !empty($col['pk']);
                $isUniq  = !empty($col['unique']) && !$isPk;

                if ($notNull) $def .= ' NOT NULL';
                if ($autoInc) $def .= ' AUTO_INCREMENT';

                // Default value (لا تُضاف مع AUTO_INCREMENT)
                if (!$autoInc && isset($col['default']) && $col['default'] !== '' && $col['default'] !== null) {
                    $defVal = $conn->real_escape_string($col['default']);
                    $def .= " DEFAULT '$defVal'";
                }

                $colDefs[] = $def;

                if ($isPk)   $pkCols[] = "`$colName`";
                if ($isUniq) $uqCols[] = $colName;
            }

            // PRIMARY KEY
            if ($pkCols) {
                $colDefs[] = "  PRIMARY KEY (" . implode(', ', $pkCols) . ")";
            }

            // UNIQUE KEYS
            foreach ($uqCols as $uq) {
                $colDefs[] = "  UNIQUE KEY `uq_{$tableName}_{$uq}` (`$uq`)";
            }

            // FOREIGN KEYS
            $fkIdx = 0;
            foreach ($fkeys as $fk) {
                $fkCol    = trim($fk['col']      ?? '');
                $refTable = trim($fk['refTable'] ?? '');
                $refCol   = trim($fk['refCol']   ?? '');
                $onDelete = strtoupper(trim($fk['onDelete'] ?? 'RESTRICT'));

                if (!$fkCol || !$refTable || !$refCol) continue;

                // التحقق من صحة الأسماء
                if (!preg_match('/^[a-z][a-z0-9_]{0,63}$/', $fkCol)   ||
                    !preg_match('/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/', $refTable) ||
                    !preg_match('/^[a-z][a-z0-9_]{0,63}$/', $refCol)) {
                    continue; // تجاهل FK غير الصالحة
                }

                $validOnDelete = ['RESTRICT','CASCADE','SET NULL','NO ACTION'];
                if (!in_array($onDelete, $validOnDelete)) $onDelete = 'RESTRICT';

                $constraintName = "fk_{$tableName}_{$fkCol}_{$fkIdx}";
                $colDefs[] = "  CONSTRAINT `$constraintName`\n    FOREIGN KEY (`$fkCol`) REFERENCES `$refTable` (`$refCol`)\n    ON DELETE $onDelete";
                $fkIdx++;
            }

            $sql = "CREATE TABLE `$tableName` (\n" . implode(",\n", $colDefs) . "\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";

            if ($conn->query($sql)) {
                jsonResponse([
                    'success' => true,
                    'message' => "تم إنشاء الجدول '$tableName' بنجاح",
                    'sql'     => $sql
                ]);
            } else {
                jsonResponse([
                    'success' => false,
                    'message' => 'فشل إنشاء الجدول: ' . $conn->error,
                    'sql'     => $sql
                ], 500);
            }
            break;

        case 'db_stats':
            $tables = [];
            $res = $conn->query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'");
            if (!$res) $res = $conn->query("SHOW TABLES");
            while ($row = $res->fetch_array()) {
                $tbl    = $row[0];
                $cntRes = $conn->query("SELECT COUNT(*) as c FROM `$tbl`");
                $cnt    = $cntRes ? (int)($cntRes->fetch_assoc()['c'] ?? 0) : 0;
                $tables[] = ['table' => $tbl, 'count' => $cnt];
            }
            $sizeMb  = 0;
            $sizeRes = $conn->query("SELECT ROUND(SUM(data_length+index_length)/1024/1024,2) AS mb FROM information_schema.tables WHERE table_schema=DATABASE()");
            if ($sizeRes && $sr = $sizeRes->fetch_assoc()) $sizeMb = (float)($sr['mb'] ?? 0);
            jsonResponse(['success' => true, 'data' => ['tables' => $tables, 'size_mb' => $sizeMb]]);
            break;

        default:
            jsonResponse(['success' => false, 'message' => 'إجراء غير معروف: ' . htmlspecialchars($action)], 400);
    }

} catch (Throwable $e) {
    jsonResponse([
        'success' => false,
        'message' => 'خطأ داخلي: ' . $e->getMessage(),
        'file'    => basename($e->getFile()),
        'line'    => $e->getLine()
    ], 500);
}