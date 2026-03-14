<?php
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

/**
 * API للإعدادات
 * Settings API
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE');
header('Access-Control-Allow-Headers: Content-Type');

require_once __DIR__ . '/../includes/functions.php';

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

try {
    switch ($action) {
        
        // ==================== الموظفين ====================
        
        // إضافة موظف
        case 'add_employee':
            if ($method !== 'POST') {
                jsonResponse(['success' => false, 'message' => 'طريقة غير صحيحة'], 405);
            }
            
            $input = json_decode(file_get_contents('php://input'), true);
            $conn = db();
            
            $name           = $conn->real_escape_string($input['name']);
            $email          = $conn->real_escape_string($input['email'] ?? '');
            $phone          = $conn->real_escape_string($input['phone'] ?? '');
            $role           = $conn->real_escape_string($input['role']);
            $employeeNumber = $conn->real_escape_string($input['employee_number'] ?? '');
            $supervisorId   = !empty($input['supervisor_id']) ? (int)$input['supervisor_id'] : 'NULL';
            $departmentId   = !empty($input['department_id']) ? (int)$input['department_id'] : 'NULL';

            $sql = "INSERT INTO employees (name, email, phone, role, employee_number, supervisor_id, department_id)
                    VALUES ('$name', '$email', '$phone', '$role', '$employeeNumber', $supervisorId, $departmentId)";
            
            if ($conn->query($sql)) {
                jsonResponse(['success' => true, 'message' => 'تم إضافة الموظف', 'id' => $conn->insert_id]);
            } else {
                jsonResponse(['success' => false, 'message' => 'فشل في الإضافة: ' . $conn->error], 500);
            }
            break;
        
        // تعديل موظف
        case 'update_employee':
            if ($method !== 'POST') {
                jsonResponse(['success' => false, 'message' => 'طريقة غير صحيحة'], 405);
            }
            
            $input = json_decode(file_get_contents('php://input'), true);
            $conn = db();
            
            $id             = (int)$input['id'];
            $name           = $conn->real_escape_string($input['name']);
            $email          = $conn->real_escape_string($input['email'] ?? '');
            $phone          = $conn->real_escape_string($input['phone'] ?? '');
            $role           = $conn->real_escape_string($input['role']);
            $employeeNumber = $conn->real_escape_string($input['employee_number'] ?? '');
            $supervisorId   = !empty($input['supervisor_id']) ? (int)$input['supervisor_id'] : 'NULL';
            $departmentId   = !empty($input['department_id']) ? (int)$input['department_id'] : 'NULL';

            $sql = "UPDATE employees
                    SET name='$name', email='$email', phone='$phone',
                        role='$role', employee_number='$employeeNumber',
                        supervisor_id=$supervisorId, department_id=$departmentId
                    WHERE id=$id";
            
            if ($conn->query($sql)) {
                jsonResponse(['success' => true, 'message' => 'تم تحديث الموظف']);
            } else {
                jsonResponse(['success' => false, 'message' => 'فشل في التحديث'], 500);
            }
            break;
        
        // ═══════════════════════════════════════
        //  إدارة الأقسام
        // ═══════════════════════════════════════

        case 'get_departments':
            $conn = db();
            $rows = [];
            $r = $conn->query("SELECT * FROM departments ORDER BY name ASC");
            if ($r) while ($row = $r->fetch_assoc()) $rows[] = $row;
            jsonResponse(['success' => true, 'data' => $rows]);
            break;

        case 'add_department':
            if ($method !== 'POST') jsonResponse(['success'=>false,'message'=>'POST فقط'],405);
            $conn  = db();
            $input = json_decode(file_get_contents('php://input'), true) ?? [];
            $name  = $conn->real_escape_string(trim($input['name'] ?? ''));
            $code  = strtoupper($conn->real_escape_string(trim($input['code'] ?? '')));
            $desc  = $conn->real_escape_string(trim($input['description'] ?? ''));
            if (!$name) jsonResponse(['success'=>false,'message'=>'اسم القسم مطلوب']);
            $sql = "INSERT INTO departments (name, code, description, is_active)
                    VALUES ('$name', " . ($code ? "'$code'" : "NULL") . ", " . ($desc ? "'$desc'" : "NULL") . ", 1)";
            if ($conn->query($sql))
                jsonResponse(['success'=>true, 'message'=>'تم إضافة القسم', 'id'=>$conn->insert_id]);
            else
                jsonResponse(['success'=>false,'message'=>$conn->error]);
            break;

        case 'update_department':
            if ($method !== 'POST') jsonResponse(['success'=>false,'message'=>'POST فقط'],405);
            $conn  = db();
            $input = json_decode(file_get_contents('php://input'), true) ?? [];
            $id    = (int)($input['id'] ?? 0);
            $name  = $conn->real_escape_string(trim($input['name'] ?? ''));
            $code  = strtoupper($conn->real_escape_string(trim($input['code'] ?? '')));
            $desc  = $conn->real_escape_string(trim($input['description'] ?? ''));
            $active= (int)($input['is_active'] ?? 1);
            if (!$id || !$name) jsonResponse(['success'=>false,'message'=>'بيانات ناقصة']);
            $sql = "UPDATE departments SET
                        name='$name',
                        code=" . ($code ? "'$code'" : "NULL") . ",
                        description=" . ($desc ? "'$desc'" : "NULL") . ",
                        is_active=$active
                    WHERE id=$id";
            if ($conn->query($sql))
                jsonResponse(['success'=>true,'message'=>'تم التحديث']);
            else
                jsonResponse(['success'=>false,'message'=>$conn->error]);
            break;

        case 'delete_department':
            if ($method !== 'POST') jsonResponse(['success'=>false,'message'=>'POST فقط'],405);
            $conn  = db();
            $input = json_decode(file_get_contents('php://input'), true) ?? [];
            $id    = (int)($input['id'] ?? 0);
            if (!$id) jsonResponse(['success'=>false,'message'=>'id مطلوب']);
            // فك الربط بالموظفين
            $conn->query("UPDATE employees SET department_id=NULL WHERE department_id=$id");
            if ($conn->query("DELETE FROM departments WHERE id=$id"))
                jsonResponse(['success'=>true]);
            else
                jsonResponse(['success'=>false,'message'=>$conn->error]);
            break;

        // حذف موظف
        case 'delete_employee':
            if ($method !== 'POST') {
                jsonResponse(['success' => false, 'message' => 'طريقة غير صحيحة'], 405);
            }
            
            $input = json_decode(file_get_contents('php://input'), true);
            $id = (int)$input['id'];
            $conn = db();
            
            $sql = "DELETE FROM employees WHERE id=$id";
            
            if ($conn->query($sql)) {
                jsonResponse(['success' => true, 'message' => 'تم حذف الموظف']);
            } else {
                jsonResponse(['success' => false, 'message' => 'فشل في الحذف'], 500);
            }
            break;
        
        // ==================== أنواع المعاملات ====================

        // جلب جميع الأنواع (مع parent_id للهرمية)
        case 'get_types':
            $conn = db();
            $conn->query("ALTER TABLE transaction_types ADD COLUMN IF NOT EXISTS parent_id INT DEFAULT NULL");
            $conn->query("ALTER TABLE transaction_types ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0");
            $r = $conn->query("SELECT id, name, description, parent_id, sort_order, is_active
                               FROM transaction_types WHERE is_active=1
                               ORDER BY COALESCE(parent_id, id), sort_order, name");
            $types = [];
            if ($r) while ($row = $r->fetch_assoc()) $types[] = $row;
            jsonResponse(['success' => true, 'data' => $types]);
            break;

        // إضافة نوع
        case 'add_type':
            if ($method !== 'POST') {
                jsonResponse(['success' => false, 'message' => 'طريقة غير صحيحة'], 405);
            }
            
            $input = json_decode(file_get_contents('php://input'), true);
            $conn = db();

            // ضمان وجود عمود parent_id
            $conn->query("ALTER TABLE transaction_types ADD COLUMN IF NOT EXISTS parent_id INT DEFAULT NULL");
            $conn->query("ALTER TABLE transaction_types ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0");
            
            $name      = $conn->real_escape_string($input['name']);
            $desc      = $conn->real_escape_string($input['description'] ?? '');
            $parentId  = !empty($input['parent_id']) ? (int)$input['parent_id'] : 'NULL';
            $sortOrder = (int)($input['sort_order'] ?? 0);
            
            $sql = "INSERT INTO transaction_types (name, description, parent_id, sort_order)
                    VALUES ('$name', '$desc', $parentId, $sortOrder)";
            
            if ($conn->query($sql)) {
                jsonResponse(['success' => true, 'message' => 'تم إضافة النوع', 'id' => $conn->insert_id]);
            } else {
                jsonResponse(['success' => false, 'message' => 'فشل في الإضافة'], 500);
            }
            break;
        
        // تعديل نوع
        case 'update_type':
            if ($method !== 'POST') {
                jsonResponse(['success' => false, 'message' => 'طريقة غير صحيحة'], 405);
            }
            
            $input = json_decode(file_get_contents('php://input'), true);
            $conn = db();
            
            $id        = (int)$input['id'];
            $name      = $conn->real_escape_string($input['name']);
            $desc      = $conn->real_escape_string($input['description'] ?? '');
            $parentId  = !empty($input['parent_id']) ? (int)$input['parent_id'] : 'NULL';
            $sortOrder = (int)($input['sort_order'] ?? 0);
            
            $sql = "UPDATE transaction_types SET name='$name', description='$desc',
                    parent_id=$parentId, sort_order=$sortOrder WHERE id=$id";
            
            if ($conn->query($sql)) {
                jsonResponse(['success' => true, 'message' => 'تم تحديث النوع']);
            } else {
                jsonResponse(['success' => false, 'message' => 'فشل في التحديث'], 500);
            }
            break;
        
        // حذف نوع
        case 'delete_type':
            if ($method !== 'POST') {
                jsonResponse(['success' => false, 'message' => 'طريقة غير صحيحة'], 405);
            }
            
            $input = json_decode(file_get_contents('php://input'), true);
            $id    = (int)$input['id'];
            $conn  = db();

            // جمع IDs: النوع نفسه + أبناؤه
            $ids = [$id];
            $childRes = $conn->query("SELECT id FROM transaction_types WHERE parent_id=$id");
            if ($childRes) while ($cr = $childRes->fetch_assoc()) $ids[] = (int)$cr['id'];
            $idList = implode(',', $ids);

            // التحقق من وجود معاملات مرتبطة
            $check = $conn->query("SELECT COUNT(*) as cnt FROM transactions WHERE type_id IN ($idList)");
            $row   = $check->fetch_assoc();
            if ($row['cnt'] > 0) {
                jsonResponse(['success' => false, 'message' => 'لا يمكن الحذف — يوجد ' . $row['cnt'] . ' معاملة مرتبطة بهذا التصنيف أو تصنيفاته الفرعية'], 400);
            }

            // حذف الأبناء أولاً ثم الأب
            $conn->query("DELETE FROM transaction_types WHERE parent_id=$id");
            if ($conn->query("DELETE FROM transaction_types WHERE id=$id")) {
                jsonResponse(['success' => true, 'message' => 'تم الحذف']);
            } else {
                jsonResponse(['success' => false, 'message' => 'فشل في الحذف'], 500);
            }
            break;
        
        // ==================== إدارة المعاملات ====================
        
        // حذف معاملة
        case 'delete_transaction':
            if ($method !== 'POST') {
                jsonResponse(['success' => false, 'message' => 'طريقة غير صحيحة'], 405);
            }
            
            $input = json_decode(file_get_contents('php://input'), true);
            $id = (int)$input['id'];
            
            if (deleteTransaction($id)) {
                jsonResponse(['success' => true, 'message' => 'تم حذف المعاملة']);
            } else {
                jsonResponse(['success' => false, 'message' => 'فشل في الحذف'], 500);
            }
            break;
        
        // حذف جميع المعاملات
        case 'clear_all':
            if ($method !== 'POST') {
                jsonResponse(['success' => false, 'message' => 'طريقة غير صحيحة'], 405);
            }
            
            $conn = db();
            
            // حذف البيانات المرتبطة أولاً
            $conn->query("DELETE FROM activity_log");
            $conn->query("DELETE FROM invoice_data");
            $conn->query("DELETE FROM payment_data");
            $conn->query("DELETE FROM budget_data");
            $conn->query("DELETE FROM receiving_data");
            $conn->query("DELETE FROM transactions");
            
            // إعادة تعيين auto_increment
            $conn->query("ALTER TABLE transactions AUTO_INCREMENT = 1");
            
            jsonResponse(['success' => true, 'message' => 'تم حذف جميع المعاملات']);
            break;
        
        // ==================== تصدير البيانات ====================
        
        case 'export':
            $conn = db();
            $result = $conn->query("SELECT * FROM v_full_transactions ORDER BY id DESC");
            
            $data = [];
            while ($row = $result->fetch_assoc()) {
                $data[] = $row;
            }
            
            // تصدير كـ CSV
            header('Content-Type: text/csv; charset=utf-8');
            header('Content-Disposition: attachment; filename="transactions_' . date('Y-m-d') . '.csv"');
            
            $output = fopen('php://output', 'w');
            
            // BOM for UTF-8
            fprintf($output, chr(0xEF).chr(0xBB).chr(0xBF));
            
            // Headers
            if (count($data) > 0) {
                fputcsv($output, array_keys($data[0]));
            }
            
            // Data
            foreach ($data as $row) {
                fputcsv($output, $row);
            }
            
            fclose($output);
            exit;
            break;
        
        // ==================== الإحصائيات ====================
        
        case 'full_stats':
            $conn = db();
            $stats = [];
            $result = $conn->query("SELECT COUNT(*) as total FROM transactions");
            $stats['transactions'] = $result->fetch_assoc()['total'];
            $result = $conn->query("SELECT COUNT(*) as total FROM employees");
            $stats['employees'] = $result->fetch_assoc()['total'];
            $result = $conn->query("SELECT role, COUNT(*) as cnt FROM employees GROUP BY role");
            $stats['employees_by_role'] = [];
            while ($row = $result->fetch_assoc()) {
                $stats['employees_by_role'][$row['role']] = $row['cnt'];
            }
            $result = $conn->query("SELECT COUNT(*) as total FROM transaction_types");
            $stats['types'] = $result->fetch_assoc()['total'];
            $result = $conn->query("SELECT SUM(amount) as total FROM transactions");
            $stats['total_amount'] = $result->fetch_assoc()['total'] ?? 0;
            $result = $conn->query("SELECT COUNT(*) as total FROM transactions WHERE MONTH(transaction_date) = MONTH(CURRENT_DATE()) AND YEAR(transaction_date) = YEAR(CURRENT_DATE())");
            $stats['this_month'] = $result->fetch_assoc()['total'];
            jsonResponse(['success' => true, 'data' => $stats]);
            break;

        // ══════════════════ إحصائيات النظام التقنية ══════════════
        case 'system_health':
            $conn = db();
            $out = [];

            // ── أداء النظام ──────────────────────────────────────
            $out['php_version']    = PHP_VERSION;
            $out['server_software'] = $_SERVER['SERVER_SOFTWARE'] ?? 'Unknown';
            $out['uptime']         = @file_get_contents('/proc/uptime') ?: null;
            $out['load_avg']       = function_exists('sys_getloadavg') ? sys_getloadavg() : null;
            $out['request_time']   = round((microtime(true) - ($_SERVER['REQUEST_TIME_FLOAT'] ?? microtime(true))) * 1000, 2);

            // ── الذاكرة ──────────────────────────────────────────
            $out['memory_usage']       = memory_get_usage(true);
            $out['memory_peak']        = memory_get_peak_usage(true);
            $out['memory_limit']       = ini_get('memory_limit');
            $out['memory_limit_bytes'] = (int)(ini_get('memory_limit')) * 1024 * 1024;

            // ── حجم النظام (مجلد uploads) ────────────────────────
            $uploadsDir = dirname(__DIR__) . '/uploads';
            if (!is_dir($uploadsDir)) $uploadsDir = __DIR__ . '/uploads';
            $uploadSize = 0; $uploadCount = 0;
            if (is_dir($uploadsDir)) {
                $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($uploadsDir, FilesystemIterator::SKIP_DOTS));
                foreach ($it as $f) { $uploadSize += $f->getSize(); $uploadCount++; }
            }
            $out['uploads_size']  = $uploadSize;
            $out['uploads_count'] = $uploadCount;
            $out['uploads_path']  = $uploadsDir;

            // حجم مجلد temp/session
            $sessSize = 0;
            $sessPath = session_save_path() ?: sys_get_temp_dir();
            if (is_dir($sessPath)) {
                foreach (glob($sessPath . '/sess_*') ?: [] as $sf) $sessSize += filesize($sf);
            }
            $out['session_size'] = $sessSize;
            $out['session_path'] = $sessPath;

            // ── قاعدة البيانات ───────────────────────────────────
            // حجم كل جدول
            $r = $conn->query("SELECT table_name, table_rows,
                data_length + index_length AS total_size,
                data_length, index_length
                FROM information_schema.TABLES
                WHERE table_schema = DATABASE()
                ORDER BY total_size DESC");
            $tables = [];
            $dbTotalSize = 0;
            while ($row = $r->fetch_assoc()) {
                $tables[] = $row;
                $dbTotalSize += $row['total_size'];
            }
            $out['db_tables']     = $tables;
            $out['db_total_size'] = $dbTotalSize;
            $out['db_table_count'] = count($tables);

            // MySQL نسخة وإعدادات
            $r = $conn->query("SELECT VERSION() as v");
            $out['mysql_version'] = $r->fetch_assoc()['v'];
            $r = $conn->query("SHOW STATUS LIKE 'Threads_connected'");
            $out['db_connections'] = $r->fetch_assoc()['Value'] ?? 0;
            $r = $conn->query("SHOW STATUS LIKE 'Queries'");
            $out['db_queries_total'] = $r->fetch_assoc()['Value'] ?? 0;
            $r = $conn->query("SHOW STATUS LIKE 'Slow_queries'");
            $out['db_slow_queries'] = $r->fetch_assoc()['Value'] ?? 0;

            // ── OPcache ──────────────────────────────────────────
            $out['opcache_enabled'] = function_exists('opcache_get_status');
            if ($out['opcache_enabled']) {
                $oc = @opcache_get_status(false);
                $out['opcache'] = $oc ? [
                    'used_memory'  => $oc['memory_usage']['used_memory'] ?? 0,
                    'free_memory'  => $oc['memory_usage']['free_memory'] ?? 0,
                    'cached_files' => $oc['opcache_statistics']['num_cached_scripts'] ?? 0,
                    'hits'         => $oc['opcache_statistics']['hits'] ?? 0,
                    'misses'       => $oc['opcache_statistics']['misses'] ?? 0,
                    'hit_rate'     => round($oc['opcache_statistics']['opcache_hit_rate'] ?? 0, 1),
                    'enabled'      => $oc['opcache_enabled'] ?? false,
                ] : null;
            }

            // ── صحة النظام ───────────────────────────────────────
            $health = [];
            // فحص الاتصال بقاعدة البيانات
            $health['db_connection'] = $conn->ping() ? 'ok' : 'error';
            // فحص مجلد uploads قابل للكتابة
            $health['uploads_writable'] = is_writable($uploadsDir) ? 'ok' : 'warning';
            // فحص الذاكرة
            $memPct = $out['memory_limit_bytes'] > 0
                ? round(($out['memory_usage'] / $out['memory_limit_bytes']) * 100, 1)
                : 0;
            $health['memory_status'] = $memPct > 80 ? 'warning' : 'ok';
            $health['memory_pct']    = $memPct;
            // PHP version check
            $health['php_ok'] = version_compare(PHP_VERSION, '7.4', '>=') ? 'ok' : 'warning';
            // Slow queries
            $health['slow_queries'] = intval($out['db_slow_queries']) > 10 ? 'warning' : 'ok';
            $out['health'] = $health;

            jsonResponse(['success' => true, 'data' => $out]);
            break;

        case 'clear_cache':
            // فحص الصلاحية — مدير النظام فقط
            if (!isset($_SESSION['user_id'])) {
                jsonResponse(['success' => false, 'message' => 'غير مصرح']);
                exit;
            }
            $cleared = [];
            // OPcache
            if (function_exists('opcache_reset')) {
                opcache_reset();
                $cleared[] = 'opcache';
            }
            // Sessions القديمة (أكثر من ساعة)
            $sessPath = session_save_path() ?: sys_get_temp_dir();
            $sessCleared = 0;
            if (is_dir($sessPath)) {
                foreach (glob($sessPath . '/sess_*') ?: [] as $sf) {
                    if (filemtime($sf) < time() - 3600) { @unlink($sf); $sessCleared++; }
                }
            }
            $cleared[] = "sessions ({$sessCleared})";
            // Temp files
            $tmpCleared = 0;
            foreach (glob(sys_get_temp_dir() . '/php*') ?: [] as $tf) {
                if (is_file($tf) && filemtime($tf) < time() - 3600) { @unlink($tf); $tmpCleared++; }
            }
            $cleared[] = "tmp ({$tmpCleared})";
            jsonResponse(['success' => true, 'cleared' => $cleared, 'message' => 'تم تفريغ الذاكرة المؤقتة']);
            break;
        

        // ══════════════════════════════════════════════════════
        //  نظام الصلاحيات
        // ══════════════════════════════════════════════════════

        // ── إنشاء الجداول إذا لم تكن موجودة (يُنفَّذ تلقائياً) ──
        case 'init_permissions':
        case 'get_employee_permissions':
        case 'save_employee_permissions':

            $conn = db();

            // تأكد من وجود عمود permission_level
            $chkCol = $conn->query("SHOW COLUMNS FROM employees LIKE 'permission_level'");
            if (!$chkCol || $chkCol->num_rows === 0) {
                $conn->query("ALTER TABLE employees
                    ADD COLUMN permission_level ENUM('system_admin','manager','employee')
                        NOT NULL DEFAULT 'employee' AFTER role,
                    ADD COLUMN can_delete TINYINT(1) NOT NULL DEFAULT 0 AFTER permission_level");
                // مدير النظام role=admin → system_admin
                $conn->query("UPDATE employees SET permission_level='system_admin', can_delete=1 WHERE role='admin'");
            }

            // تأكد من وجود جدول الصلاحيات
            $chkTbl = $conn->query("SHOW TABLES LIKE 'employee_page_permissions'");
            if (!$chkTbl || $chkTbl->num_rows === 0) {
                $conn->query("CREATE TABLE employee_page_permissions (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    employee_id INT NOT NULL,
                    page VARCHAR(50) NOT NULL,
                    can_access TINYINT(1) NOT NULL DEFAULT 1,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY uq_emp_page (employee_id, page),
                    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
            }

            if ($action === 'init_permissions') {
                jsonResponse(['success' => true, 'message' => 'تم تهيئة جداول الصلاحيات']);
                break;
            }

            // ── GET: جلب صلاحيات موظف ────────────────────────
            if ($action === 'get_employee_permissions') {
                $empId = (int)($_GET['employee_id'] ?? 0);
                if (!$empId) {
                    jsonResponse(['success' => false, 'error' => 'employee_id مطلوب']);
                    break;
                }

                $r = $conn->query("SELECT permission_level, can_delete FROM employees WHERE id=$empId LIMIT 1");
                if (!$r || !($emp = $r->fetch_assoc())) {
                    jsonResponse(['success' => false, 'error' => 'موظف غير موجود']);
                    break;
                }

                $allPages = ['dashboard','transactions','correspondence','bank-deposits','sla','performance','settings','notifications','reservations'];
                $pages    = [];

                if ($emp['permission_level'] === 'system_admin') {
                    foreach ($allPages as $p) $pages[$p] = true;
                } else {
                    // قراءة الصلاحيات المخزنة
                    $r2 = $conn->query("SELECT page, can_access FROM employee_page_permissions WHERE employee_id=$empId");
                    $stored = [];
                    if ($r2) { while ($row = $r2->fetch_assoc()) $stored[$row['page']] = (bool)$row['can_access']; }

                    // الافتراضيات حسب المستوى
                    $defaults = [
                        'manager'  => ['dashboard'=>1,'transactions'=>1,'correspondence'=>1,'bank-deposits'=>1,'sla'=>1,'performance'=>1,'settings'=>0,'notifications'=>1,'reservations'=>1],
                        'employee' => ['dashboard'=>0,'transactions'=>1,'correspondence'=>1,'bank-deposits'=>1,'sla'=>0,'performance'=>0,'settings'=>0,'notifications'=>1,'reservations'=>1],
                    ];
                    $def = $defaults[$emp['permission_level']] ?? [];

                    foreach ($allPages as $p) {
                        if (isset($stored[$p]))    $pages[$p] = $stored[$p];
                        elseif (isset($def[$p]))   $pages[$p] = (bool)$def[$p];
                        else                       $pages[$p] = false;
                    }
                }

                // جلب overrides الإجراءات
                $actionOverrides = [];
                $chkAct = $conn->query("SHOW TABLES LIKE 'employee_action_permissions'");
                if ($chkAct && $chkAct->num_rows > 0) {
                    $ra = $conn->query("SELECT action, can_do FROM employee_action_permissions WHERE employee_id=$empId");
                    if ($ra) { while ($row = $ra->fetch_assoc()) $actionOverrides[$row['action']] = (bool)$row['can_do']; }
                }

                jsonResponse(['success' => true, 'data' => [
                    'permission_level'    => $emp['permission_level'],
                    'can_delete'          => (bool)$emp['can_delete'],
                    'pages'               => $pages,
                    'action_permissions'  => $actionOverrides,
                ]]);
                break;
            }

            // ── POST: حفظ صلاحيات موظف ───────────────────────
            if ($action === 'save_employee_permissions') {
                $body  = json_decode(file_get_contents('php://input'), true) ?? [];
                $empId = (int)($body['employee_id'] ?? 0);

                if (!$empId) {
                    jsonResponse(['success' => false, 'error' => 'employee_id مطلوب']);
                    break;
                }

                $level     = $conn->real_escape_string($body['permission_level'] ?? 'employee');
                $canDelete = !empty($body['can_delete']) ? 1 : 0;

                // تحديث جدول الموظفين
                $conn->query("UPDATE employees
                    SET permission_level='$level', can_delete=$canDelete
                    WHERE id=$empId");

                // تحديث جدول الصلاحيات
                if (isset($body['pages']) && is_array($body['pages'])) {
                    $conn->query("DELETE FROM employee_page_permissions WHERE employee_id=$empId");
                    foreach ($body['pages'] as $page => $access) {
                        $page   = $conn->real_escape_string($page);
                        $access = $access ? 1 : 0;
                        $conn->query("INSERT INTO employee_page_permissions (employee_id, page, can_access)
                            VALUES ($empId, '$page', $access)
                            ON DUPLICATE KEY UPDATE can_access=$access");
                    }
                }

                // حفظ overrides الإجراءات
                if (isset($body['action_permissions']) && is_array($body['action_permissions'])) {
                    // تأكد من وجود الجدول
                    $conn->query("CREATE TABLE IF NOT EXISTS employee_action_permissions (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        employee_id INT NOT NULL,
                        action VARCHAR(80) NOT NULL,
                        can_do TINYINT(1) NOT NULL DEFAULT 1,
                        UNIQUE KEY uq_emp_action (employee_id, action),
                        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

                    $conn->query("DELETE FROM employee_action_permissions WHERE employee_id=$empId");
                    foreach ($body['action_permissions'] as $action => $allow) {
                        $action = $conn->real_escape_string($action);
                        $allow  = $allow ? 1 : 0;
                        $conn->query("INSERT INTO employee_action_permissions (employee_id, action, can_do)
                            VALUES ($empId, '$action', $allow)
                            ON DUPLICATE KEY UPDATE can_do=$allow");
                    }
                }

                jsonResponse(['success' => true, 'message' => 'تم حفظ الصلاحيات']);
                break;
            }
            break;

        default:
            jsonResponse(['success' => false, 'message' => 'إجراء غير معروف'], 400);
    }
    
} catch (Exception $e) {
    jsonResponse(['success' => false, 'message' => $e->getMessage()], 500);
}