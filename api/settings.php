<?php
/**
 * api/settings.php
 * Settings API — الكود الأصلي + إضافات الأقسام ومستويات الصلاحية
 */

header('Content-Type: application/json; charset=utf-8');
$_allowedOrigin = $_ENV['APP_ORIGIN'] ?? '';
$_origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($_allowedOrigin !== '' && $_origin === $_allowedOrigin) {
    header('Access-Control-Allow-Origin: ' . $_allowedOrigin);
    header('Vary: Origin');
}
header('Access-Control-Allow-Methods: GET, POST, DELETE');
header('Access-Control-Allow-Headers: Content-Type, X-CSRF-Token');

require_once __DIR__ . '/../includes/functions.php';

// ── بدء الجلسة لدعم CSRF ─────────────────────────────────────
if (session_status() === PHP_SESSION_NONE) secureSession();

// ════════════════════════════════════════════════════════════
//  Guards للـ Schema — كل دالة تُنفَّذ مرة واحدة لكل طلب HTTP
//  بدلاً من ALTER TABLE IF NOT EXISTS في كل action
// ════════════════════════════════════════════════════════════
function _guardEmployeeColumns(): void {
    static $done = false;
    if ($done) return;
    $done = true;
    $c = db();
    $c->query("ALTER TABLE employees ADD COLUMN IF NOT EXISTS sector_id              INT          DEFAULT NULL AFTER department_id");
    $c->query("ALTER TABLE employees ADD COLUMN IF NOT EXISTS division_id             INT          DEFAULT NULL AFTER sector_id");
    $c->query("ALTER TABLE employees ADD COLUMN IF NOT EXISTS permission_level_code   VARCHAR(50)  DEFAULT NULL AFTER permission_level");
    $c->query("ALTER TABLE employees ADD COLUMN IF NOT EXISTS job_title               VARCHAR(150) DEFAULT NULL AFTER name");
}

function _guardDepartmentColumns(): void {
    static $done = false;
    if ($done) return;
    $done = true;
    $c = db();
    $c->query("ALTER TABLE departments ADD COLUMN IF NOT EXISTS sector_id  INT                               DEFAULT NULL AFTER parent_id");
    $c->query("ALTER TABLE departments ADD COLUMN IF NOT EXISTS dept_type  ENUM('sector','division','team')  NOT NULL DEFAULT 'division' AFTER sector_id");
    $c->query("ALTER TABLE departments ADD COLUMN IF NOT EXISTS manager_id INT                               DEFAULT NULL AFTER dept_type");
}

function _guardTypeColumns(): void {
    static $done = false;
    if ($done) return;
    $done = true;
    $c = db();
    $c->query("ALTER TABLE transaction_types ADD COLUMN IF NOT EXISTS parent_id  INT DEFAULT NULL");
    $c->query("ALTER TABLE transaction_types ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0");
}

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

// ── CSRF: endpoint جلب التوكن (GET — آمن بطبيعته) ───────────
if ($action === 'get_csrf_token') {
    jsonResponse(['success' => true, 'token' => generateCsrfToken()]);
}

// ── CSRF: التحقق من كل طلب POST ──────────────────────────────
// استثناء: system_health, full_stats, get_* (قراءة فقط)
$csrfExempt = ['get_csrf_token','system_health','full_stats','export',
               'get_employees','get_departments','get_divisions',
               'get_types','get_permission_levels','get_prefixes',
               'get_signers','get_setting','get_system_settings',
               'get_employee_permissions','init_permissions',
               'get_pr_sla_policies','get_sectors',
               'get_quotes','get_brand_identity','save_quote','delete_quote',
               'save_brand_identity','save_system_setting'];
if ($method === 'POST' && !in_array($action, $csrfExempt)) {
    $headers      = getallheaders();
    $csrfFromHdr  = $headers['X-CSRF-Token'] ?? $headers['x-csrf-token'] ?? '';
    $bodyRaw      = file_get_contents('php://input');
    $bodyArr      = json_decode($bodyRaw, true) ?? [];
    $csrfFromBody = $bodyArr['csrf_token'] ?? '';
    $token        = $csrfFromHdr ?: $csrfFromBody;
    if (!verifyCsrfToken($token)) {
        jsonResponse(['success' => false, 'message' => 'طلب غير مصرح به — CSRF token مفقود أو منتهي'], 403);
    }
}

// ── Rate Limiting — حدود لكل action حساس ─────────────────────
// يتحقق فقط لطلبات POST التعديلية (الحدود مقصودة بالتحفظ)
if ($method === 'POST') {
    $rateLimits = [
        // الموظفون — العمليات التعديلية
        'add_employee'              => [10, 60],   // 10 إضافات/دقيقة
        'update_employee'           => [20, 60],   // 20 تحديث/دقيقة
        'delete_employee'           => [5,  60],   // 5 حذف/دقيقة — حساس
        // الأقسام
        'add_division'              => [20, 60],
        'update_division'           => [30, 60],
        'delete_division'           => [10, 60],
        // أنواع المعاملات
        'add_type'                  => [20, 60],
        'update_type'               => [30, 60],
        'delete_type'               => [10, 60],
        // الصلاحيات — حساسة جداً
        'save_employee_permissions' => [10, 60],
        'add_permission_level'      => [5,  60],
        // العمليات الكارثية
        'clear_all'                 => [2,  300],  // مرتين فقط كل 5 دقائق
        // الرفع والتصدير
        'export'                    => [5,  300],
    ];
    if (isset($rateLimits[$action])) {
        [$maxReq, $window] = $rateLimits[$action];
        apiRateLimit($action, $maxReq, $window);
    }
}

try {
    switch ($action) {

        // ══════════════════════════════════════════════════════
        //  الموظفون
        // ══════════════════════════════════════════════════════

        case 'get_employees':
            $conn = db();
            _guardEmployeeColumns();

            // ── مزامنة تلقائية: permission_level يتبع permission_level_code دائماً ──
            $conn->query("
                UPDATE employees
                SET permission_level = CASE
                    WHEN permission_level_code = 'system_admin'     THEN 'system_admin'
                    WHEN permission_level_code = 'CEO'              THEN 'CEO'
                    WHEN permission_level_code = 'sector_head'      THEN 'sector_head'
                    WHEN permission_level_code = 'division_manager' THEN 'division_manager'
                    WHEN permission_level_code = 'employee_l1'      THEN 'employee_l1'
                    WHEN permission_level_code = 'employee'         THEN 'employee'
                    ELSE permission_level
                END
                WHERE permission_level_code IS NOT NULL
                  AND permission_level_code != ''
                  AND permission_level != permission_level_code
                  AND permission_level_code IN ('system_admin','CEO','sector_head','division_manager','employee_l1','employee')
            ");
            // ── مزامنة من الدور: إذا لم يكن permission_level_code محدداً استخدم الدور ──
            $conn->query("UPDATE employees SET permission_level='system_admin', permission_level_code='system_admin' WHERE role='admin' AND (permission_level NOT IN ('system_admin') OR permission_level_code IS NULL)");
            $conn->query("UPDATE employees SET permission_level='CEO', permission_level_code='CEO' WHERE role='CEO' AND (permission_level NOT IN ('system_admin','CEO') OR permission_level_code IS NULL OR permission_level_code='')");
            $conn->query("UPDATE employees SET permission_level='sector_head', permission_level_code='sector_head' WHERE role='sector_head' AND (permission_level NOT IN ('system_admin','sector_head') OR permission_level_code IS NULL OR permission_level_code='')");
            $conn->query("UPDATE employees SET permission_level='division_manager', permission_level_code='division_manager' WHERE role='division_manager' AND (permission_level NOT IN ('system_admin','CEO','division_manager') OR permission_level_code IS NULL OR permission_level_code='')");
            // الأدوار الوظيفية → employee_l1 افتراضياً إن لم تكن لها صلاحية محددة
            $conn->query("UPDATE employees SET permission_level='employee_l1', permission_level_code='employee_l1' WHERE role IN ('budget','treasury_manager','dispatch','payment','invoice','purchasing','receiver') AND (permission_level_code IS NULL OR permission_level_code='' OR permission_level='employee')");
            $r = $conn->query("
                SELECT e.id, e.name, e.email, e.phone, e.role, e.job_title,
                       e.employee_number, e.permission_level, e.permission_level_code,
                       e.can_delete, e.supervisor_id, e.department_id,
                       e.sector_id, e.division_id, e.is_active,
                       sup.name AS supervisor_name
                FROM employees e
                LEFT JOIN employees sup ON sup.id = e.supervisor_id
                WHERE e.is_active = 1
                ORDER BY e.name
            ");
            $rows = [];
            if ($r) while ($row = $r->fetch_assoc()) $rows[] = $row;
            jsonResponse(['success'=>true,'data'=>$rows]);
            break;

        case 'add_employee':
            if ($method !== 'POST') jsonResponse(['success'=>false,'message'=>'POST فقط'],405);
            $input = json_decode(file_get_contents('php://input'), true) ?? [];
            $conn  = db();
            _guardEmployeeColumns(); // مرة واحدة لكل طلب HTTP

            // ── قيم نصية ─────────────────────────────────────────
            $name           = trim($input['name']           ?? '');
            $email          = trim($input['email']          ?? '');
            $phone          = trim($input['phone']          ?? '');
            $jobTitle       = trim($input['job_title']      ?? '');
            $employeeNumber = trim($input['employee_number']?? '');

            // ── قيم whitelist (لا يُثق بأي قيمة خارجها) ──────────
            $allowedRoles = ['admin','CEO','sector_head','division_manager',
                             'budget','treasury_manager','dispatch',
                             'payment','invoice','purchasing','receiver','employee'];
            $role = in_array($input['role'] ?? '', $allowedRoles)
                    ? $input['role'] : 'employee';

            $validLevels  = ['system_admin','CEO','sector_head','division_manager','employee_l1','employee'];
            $rawCode      = $input['permission_level_code'] ?? '';
            $syncedLevel  = in_array($rawCode, $validLevels) ? $rawCode : 'employee';
            $permCode     = in_array($rawCode, $validLevels) ? $rawCode : null;

            // ── قيم رقمية (nullable) ──────────────────────────────
            $supervisorId = !empty($input['supervisor_id']) ? (int)$input['supervisor_id'] : null;
            $departmentId = !empty($input['department_id']) ? (int)$input['department_id'] : null;
            $sectorId     = !empty($input['sector_id'])     ? (int)$input['sector_id']     : $departmentId;
            $divisionId   = !empty($input['division_id'])   ? (int)$input['division_id']   : null;

            if (!$name) jsonResponse(['success'=>false,'message'=>'اسم الموظف مطلوب'], 400);

            // ── Prepared Statement — آمن من SQL Injection ─────────
            $stmt = $conn->prepare(
                "INSERT INTO employees
                    (name, job_title, email, phone, role, employee_number,
                     supervisor_id, department_id, sector_id, division_id,
                     permission_level, permission_level_code)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
            );
            $stmt->bind_param(
                'ssssssiiisss',
                $name, $jobTitle, $email, $phone, $role, $employeeNumber,
                $supervisorId, $departmentId, $sectorId, $divisionId,
                $syncedLevel, $permCode
            );
            $stmt->execute();

            if ($stmt->affected_rows > 0) {
                $newId = $conn->insert_id;
                auditLog('add_employee', 'employee', $newId, [
                    'name'  => $name,
                    'email' => $email,
                    'role'  => $role,
                    'permission_level' => $syncedLevel,
                ]);
                jsonResponse(['success'=>true,'message'=>'تم إضافة الموظف','id'=>$newId]);
            } else
                jsonResponse(['success'=>false,'message'=>'فشل: '.$conn->error], 500);
            break;

        case 'update_employee':
            if ($method !== 'POST') jsonResponse(['success'=>false,'message'=>'POST فقط'],405);
            $input = json_decode(file_get_contents('php://input'), true) ?? [];
            $conn  = db();
            $id    = (int)($input['id'] ?? 0);
            if (!$id) jsonResponse(['success'=>false,'message'=>'id مطلوب'], 400);
            _guardEmployeeColumns(); // مرة واحدة لكل طلب HTTP

            // ── قيم نصية ─────────────────────────────────────────
            $name           = trim($input['name']           ?? '');
            $email          = trim($input['email']          ?? '');
            $phone          = trim($input['phone']          ?? '');
            $jobTitle       = trim($input['job_title']      ?? '');
            $employeeNumber = trim($input['employee_number']?? '');

            // ── whitelist للدور ───────────────────────────────────
            $allowedRoles = ['admin','CEO','sector_head','division_manager',
                             'budget','treasury_manager','dispatch',
                             'payment','invoice','purchasing','receiver','employee'];
            $role = in_array($input['role'] ?? '', $allowedRoles)
                    ? $input['role'] : 'employee';

            // ── whitelist لمستوى الصلاحية ─────────────────────────
            $validLevels = ['system_admin','CEO','sector_head','division_manager','employee_l1','employee'];
            $rawCode     = $input['permission_level_code'] ?? '';
            $syncedLevel = in_array($rawCode, $validLevels) ? $rawCode : 'employee';
            $permCode    = in_array($rawCode, $validLevels) ? $rawCode : null;

            // ── قيم رقمية (nullable) ──────────────────────────────
            $supervisorId = !empty($input['supervisor_id']) ? (int)$input['supervisor_id'] : null;
            $departmentId = !empty($input['department_id']) ? (int)$input['department_id'] : null;
            $sectorId     = !empty($input['sector_id'])     ? (int)$input['sector_id']     : $departmentId;
            $divisionId   = !empty($input['division_id'])   ? (int)$input['division_id']   : null;

            if (!$name) jsonResponse(['success'=>false,'message'=>'اسم الموظف مطلوب'], 400);

            // ── Prepared Statement ────────────────────────────────
            $stmt = $conn->prepare(
                "UPDATE employees SET
                    name=?, job_title=?, email=?, phone=?, role=?, employee_number=?,
                    supervisor_id=?, department_id=?, sector_id=?, division_id=?,
                    permission_level=?, permission_level_code=?
                 WHERE id=?"
            );
            $stmt->bind_param(
                'ssssssiiiissi',
                $name, $jobTitle, $email, $phone, $role, $employeeNumber,
                $supervisorId, $departmentId, $sectorId, $divisionId,
                $syncedLevel, $permCode, $id
            );
            $stmt->execute();

            if ($stmt->errno)
                jsonResponse(['success'=>false,'message'=>'فشل: '.$stmt->error], 500);
            auditLog('update_employee', 'employee', $id, [
                'name'  => $name,
                'email' => $email,
                'role'  => $role,
                'permission_level' => $syncedLevel,
            ]);
            jsonResponse(['success'=>true,'message'=>'تم تحديث الموظف']);
            break;

        case 'delete_employee':
            if ($method !== 'POST') jsonResponse(['success'=>false,'message'=>'POST فقط'],405);
            $input = json_decode(file_get_contents('php://input'), true) ?? [];
            $conn  = db();
            $id    = (int)($input['id'] ?? 0);
            if (!$id) jsonResponse(['success'=>false,'message'=>'id مطلوب'], 400);
            
            // Fetch employee data before deletion for audit logging
            $empRow = $conn->query("SELECT name, email, role FROM employees WHERE id=$id LIMIT 1");
            $empData = $empRow ? $empRow->fetch_assoc() : [];
            
            if ($conn->query("DELETE FROM employees WHERE id=$id")) {
                auditLog('delete_employee', 'employee', $id, [
                    'deleted_name'  => $empData['name']  ?? '—',
                    'deleted_email' => $empData['email'] ?? '—',
                    'deleted_role'  => $empData['role']  ?? '—',
                ]);
                if (function_exists('logToSecurityLog')) {
                    logToSecurityLog('employee_delete',
                        'حذف موظف: ' . ($empData['name'] ?? 'ID:' . $id),
                        'warning',
                        ['snapshot' => $empData]
                    );
                }
                jsonResponse(['success'=>true,'message'=>'تم حذف الموظف']);
            } else
                jsonResponse(['success'=>false,'message'=>'فشل: '.$conn->error], 500);
            break;

        // ══════════════════════════════════════════════════════
        //  الأقسام (departments) — القطاعات والأقسام التنظيمية
        // ══════════════════════════════════════════════════════

        case 'get_departments':
        case 'get_divisions':
            $conn = db();
            _guardDepartmentColumns();

            $rows = [];
            $r    = $conn->query("
                SELECT d.*,
                       s.name AS sector_name,
                       m.name AS manager_name,
                       (SELECT COUNT(*) FROM employees e
                        WHERE e.division_id=d.id
                           OR (e.division_id IS NULL AND e.department_id=d.id)) AS employee_count
                FROM departments d
                LEFT JOIN departments s ON s.id = d.sector_id
                LEFT JOIN employees   m ON m.id = d.manager_id
                WHERE d.is_active=1
                ORDER BY d.dept_type DESC, d.sector_id, d.name
            ");
            if ($r) while ($row = $r->fetch_assoc()) $rows[] = $row;
            jsonResponse(['success'=>true,'data'=>$rows]);
            break;

        case 'add_department':
        case 'add_division':
            if ($method !== 'POST') jsonResponse(['success'=>false,'message'=>'POST فقط'],405);
            $conn  = db();
            $input = json_decode(file_get_contents('php://input'), true) ?? [];
            _guardDepartmentColumns(); // مرة واحدة لكل طلب HTTP

            $name      = trim($input['name'] ?? '');
            $code      = strtoupper(trim($input['code'] ?? '')) ?: null;
            $desc      = trim($input['description'] ?? '') ?: null;
            $sectorId  = !empty($input['sector_id'])  ? (int)$input['sector_id']  : null;
            $parentId  = !empty($input['parent_id'])  ? (int)$input['parent_id']  : $sectorId;
            $managerId = !empty($input['manager_id']) ? (int)$input['manager_id'] : null;
            // whitelist لنوع القسم
            $allowedTypes = ['sector','division','team'];
            $deptType = in_array($input['dept_type'] ?? '', $allowedTypes)
                        ? $input['dept_type']
                        : ($action === 'add_division' ? 'division' : 'sector');

            if (!$name) jsonResponse(['success'=>false,'message'=>'الاسم مطلوب']);

            $stmt = $conn->prepare(
                "INSERT INTO departments
                    (name, code, description, sector_id, parent_id, manager_id, dept_type, is_active)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 1)"
            );
            $stmt->bind_param('sssiiis', $name, $code, $desc, $sectorId, $parentId, $managerId, $deptType);
            $stmt->execute();

            if ($stmt->affected_rows > 0) {
                $newId = $conn->insert_id;
                auditLog('add_division', 'department', $newId, [
                    'name'     => $name,
                    'code'     => $code,
                    'type'     => $deptType,
                    'sector_id'=> $sectorId,
                ]);
                jsonResponse(['success'=>true,'message'=>'تم الإضافة','id'=>$newId]);
            } else
                jsonResponse(['success'=>false,'message'=>$stmt->error]);
            break;

        case 'update_department':
        case 'update_division':
            if ($method !== 'POST') jsonResponse(['success'=>false,'message'=>'POST فقط'],405);
            $conn  = db();
            $input = json_decode(file_get_contents('php://input'), true) ?? [];
            _guardDepartmentColumns(); // مرة واحدة لكل طلب HTTP
            $id    = (int)($input['id'] ?? 0);
            $name  = trim($input['name'] ?? '');
            $code  = strtoupper(trim($input['code'] ?? '')) ?: null;
            $desc  = trim($input['description'] ?? '') ?: null;
            $sectorId  = !empty($input['sector_id'])  ? (int)$input['sector_id']  : null;
            $managerId = !empty($input['manager_id']) ? (int)$input['manager_id'] : null;
            $active    = (int)($input['is_active'] ?? 1);
            if (!$id || !$name) jsonResponse(['success'=>false,'message'=>'بيانات ناقصة']);

            $stmt = $conn->prepare(
                "UPDATE departments SET
                    name=?, code=?, description=?, sector_id=?, manager_id=?, is_active=?
                 WHERE id=?"
            );
            $stmt->bind_param('sssiiiii', $name, $code, $desc, $sectorId, $managerId, $active, $id);
            $stmt->execute();
            auditLog('update_division', 'department', $id, [
                'name'      => $name,
                'code'      => $code,
                'is_active' => $active,
            ]);
            jsonResponse(['success'=>true,'message'=>'تم التحديث']);
            break;

        case 'delete_department':
        case 'delete_division':
            if ($method !== 'POST') jsonResponse(['success'=>false,'message'=>'POST فقط'],405);
            $conn  = db();
            $input = json_decode(file_get_contents('php://input'), true) ?? [];
            $id    = (int)($input['id'] ?? 0);
            if (!$id) jsonResponse(['success'=>false,'message'=>'id مطلوب']);
            $empCnt = $conn->query("SELECT COUNT(*) AS c FROM employees WHERE division_id=$id OR department_id=$id")->fetch_assoc()['c'] ?? 0;
            if ($empCnt > 0)
                jsonResponse(['success'=>false,'message'=>"لا يمكن الحذف — $empCnt موظف مرتبط. أعد ربطهم أولاً."]);
            $conn->query("UPDATE employees SET division_id=NULL WHERE division_id=$id");
            $conn->query("UPDATE employees SET department_id=NULL WHERE department_id=$id");
            if ($conn->query("DELETE FROM departments WHERE id=$id")) {
                auditLog('delete_division', 'department', $id, ['deleted_id' => $id]);
                jsonResponse(['success'=>true,'message'=>'تم الحذف']);
            } else
                jsonResponse(['success'=>false,'message'=>$conn->error]);
            break;

        // ══════════════════════════════════════════════════════
        //  مستويات الصلاحية — قابلة للإضافة من الإعدادات
        // ══════════════════════════════════════════════════════

        case 'get_permission_levels':
            $conn = db();
            // إنشاء الجدول إن لم يكن موجوداً
            $conn->query("CREATE TABLE IF NOT EXISTS `permission_level_definitions` (
                `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
                `code`        VARCHAR(50)  NOT NULL UNIQUE,
                `label`       VARCHAR(100) NOT NULL,
                `description` TEXT         DEFAULT NULL,
                `sort_order`  TINYINT      NOT NULL DEFAULT 99,
                `color`       VARCHAR(20)  DEFAULT '#6b7280',
                `is_system`   TINYINT(1)   NOT NULL DEFAULT 0,
                `is_active`   TINYINT(1)   NOT NULL DEFAULT 1,
                `created_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (`id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

            // إدراج القيم الافتراضية
            $defaults = [
                ['system_admin',     'مدير النظام',        'صلاحية كاملة على كل شيء',              1, '#ef4444', 1],
                ['CEO',              'الرئيس التنفيذي',    'يعتمد جميع المعاملات النهائية',         2, '#8b5cf6', 0],
                ['sector_head',      'رئيس القطاع',        'يرى كل معاملات قطاعه',                 3, '#8b5cf6', 0],
                ['division_manager', 'مدير القسم',         'يرى معاملات قسمه',                     4, '#3b82f6', 0],
                ['employee_l1',      'موظف مستوى أول',     'وصول موسع للتقارير',                   5, '#f59e0b', 0],
                ['employee',         'موظف',               'وصول محدود',                           6, '#22c55e', 0],
            ];
            foreach ($defaults as [$code, $label, $desc, $order, $color, $sys]) {
                $conn->query("INSERT INTO permission_level_definitions
                    (code,label,description,sort_order,color,is_system)
                    VALUES ('$code','$label','$desc',$order,'$color',$sys)
                    ON DUPLICATE KEY UPDATE
                        label=VALUES(label), description=VALUES(description),
                        sort_order=VALUES(sort_order), color=VALUES(color)");
            }

            $rows = [];
            $r    = $conn->query("SELECT * FROM permission_level_definitions WHERE is_active=1 ORDER BY sort_order");
            if ($r) while ($row = $r->fetch_assoc()) $rows[] = $row;
            jsonResponse(['success'=>true,'data'=>$rows]);
            break;

        case 'add_permission_level':
            if ($method !== 'POST') jsonResponse(['success'=>false,'message'=>'POST فقط'],405);
            $conn  = db();
            $input = json_decode(file_get_contents('php://input'), true) ?? [];
            // تنظيف الكود: حروف صغيرة وأرقام وunderscore فقط
            $code  = strtolower(preg_replace('/[^a-z0-9_]/','',str_replace(' ','_',$input['code']??'')));
            $label = trim($input['label'] ?? '');
            $desc  = trim($input['description'] ?? '') ?: null;
            // التحقق من لون hex صالح فقط
            $color = preg_match('/^#[0-9a-fA-F]{3,6}$/', $input['color'] ?? '') ? $input['color'] : '#6b7280';
            $order = (int)($input['sort_order'] ?? 99);
            if (!$code || !$label) jsonResponse(['success'=>false,'message'=>'الكود والاسم مطلوبان']);
            $stmt = $conn->prepare(
                "INSERT INTO permission_level_definitions
                    (code, label, description, color, sort_order, is_system)
                 VALUES (?, ?, ?, ?, ?, 0)"
            );
            $stmt->bind_param('ssssi', $code, $label, $desc, $color, $order);
            $stmt->execute();
            if ($stmt->affected_rows > 0)
                jsonResponse(['success'=>true,'message'=>'تم الإضافة','id'=>$conn->insert_id]);
            else
                jsonResponse(['success'=>false,'message'=>'فشل أو الكود مستخدم: '.$stmt->error]);
            break;

        case 'update_permission_level':
            if ($method !== 'POST') jsonResponse(['success'=>false,'message'=>'POST فقط'],405);
            $conn  = db();
            $input = json_decode(file_get_contents('php://input'), true) ?? [];
            $id    = (int)($input['id'] ?? 0);
            $label = trim($input['label'] ?? '');
            $desc  = trim($input['description'] ?? '') ?: null;
            $color = preg_match('/^#[0-9a-fA-F]{3,6}$/', $input['color'] ?? '') ? $input['color'] : '#6b7280';
            $order = (int)($input['sort_order'] ?? 99);
            if (!$id || !$label) jsonResponse(['success'=>false,'message'=>'بيانات ناقصة']);
            $stmt = $conn->prepare(
                "UPDATE permission_level_definitions
                 SET label=?, description=?, color=?, sort_order=?
                 WHERE id=?"
            );
            $stmt->bind_param('sssii', $label, $desc, $color, $order, $id);
            $stmt->execute();
            jsonResponse(['success'=>true,'message'=>'تم التحديث']);
            break;

        case 'delete_permission_level':
            if ($method !== 'POST') jsonResponse(['success'=>false,'message'=>'POST فقط'],405);
            $conn  = db();
            $input = json_decode(file_get_contents('php://input'), true) ?? [];
            $id    = (int)($input['id'] ?? 0);
            if (!$id) jsonResponse(['success'=>false,'message'=>'id مطلوب']);
            $chk = $conn->query("SELECT is_system FROM permission_level_definitions WHERE id=$id LIMIT 1");
            if ($chk && ($r=$chk->fetch_assoc()) && $r['is_system'])
                jsonResponse(['success'=>false,'message'=>'لا يمكن حذف مستويات النظام الأساسية']);
            $conn->query("UPDATE permission_level_definitions SET is_active=0 WHERE id=$id AND is_system=0");
            jsonResponse(['success'=>true,'message'=>'تم الحذف']);
            break;

        // ══════════════════════════════════════════════════════
        //  أنواع المعاملات
        // ══════════════════════════════════════════════════════

        case 'get_types':
            $conn = db();
            _guardTypeColumns();
            $r     = $conn->query("SELECT id,name,description,parent_id,sort_order,is_active
                                   FROM transaction_types WHERE is_active=1
                                   ORDER BY COALESCE(parent_id,id), sort_order, name");
            $types = [];
            if ($r) while ($row = $r->fetch_assoc()) $types[] = $row;
            jsonResponse(['success'=>true,'data'=>$types]);
            break;

        case 'add_type':
            if ($method !== 'POST') jsonResponse(['success'=>false,'message'=>'POST فقط'],405);
            $input     = json_decode(file_get_contents('php://input'), true) ?? [];
            $conn      = db();
            _guardTypeColumns();
            $name      = trim($input['name'] ?? '');
            $desc      = trim($input['description'] ?? '') ?: null;
            $parentId  = !empty($input['parent_id']) ? (int)$input['parent_id'] : null;
            $sortOrder = (int)($input['sort_order'] ?? 0);
            if (!$name) jsonResponse(['success'=>false,'message'=>'اسم النوع مطلوب'], 400);
            $stmt = $conn->prepare(
                "INSERT INTO transaction_types (name, description, parent_id, sort_order)
                 VALUES (?, ?, ?, ?)"
            );
            $stmt->bind_param('ssii', $name, $desc, $parentId, $sortOrder);
            $stmt->execute();
            if ($stmt->affected_rows > 0)
                jsonResponse(['success'=>true,'message'=>'تم الإضافة','id'=>$conn->insert_id]);
            else
                jsonResponse(['success'=>false,'message'=>'فشل: '.$stmt->error], 500);
            break;

        case 'update_type':
            if ($method !== 'POST') jsonResponse(['success'=>false,'message'=>'POST فقط'],405);
            $input     = json_decode(file_get_contents('php://input'), true) ?? [];
            $conn      = db();
            _guardTypeColumns();
            $id        = (int)($input['id'] ?? 0);
            $name      = trim($input['name'] ?? '');
            $desc      = trim($input['description'] ?? '') ?: null;
            $parentId  = !empty($input['parent_id']) ? (int)$input['parent_id'] : null;
            $sortOrder = (int)($input['sort_order'] ?? 0);
            if (!$id || !$name) jsonResponse(['success'=>false,'message'=>'بيانات ناقصة'], 400);
            $stmt = $conn->prepare(
                "UPDATE transaction_types
                 SET name=?, description=?, parent_id=?, sort_order=?
                 WHERE id=?"
            );
            $stmt->bind_param('ssiii', $name, $desc, $parentId, $sortOrder, $id);
            $stmt->execute();
            if ($stmt->errno)
                jsonResponse(['success'=>false,'message'=>'فشل: '.$stmt->error], 500);
            jsonResponse(['success'=>true,'message'=>'تم التحديث']);
            break;

        case 'delete_type':
            if ($method !== 'POST') jsonResponse(['success'=>false,'message'=>'POST فقط'],405);
            $input  = json_decode(file_get_contents('php://input'), true) ?? [];
            $id     = (int)($input['id'] ?? 0);
            $conn   = db();
            $ids    = [$id];
            $cr     = $conn->query("SELECT id FROM transaction_types WHERE parent_id=$id");
            if ($cr) while ($r = $cr->fetch_assoc()) $ids[] = (int)$r['id'];
            $idList = implode(',', $ids);
            $chk    = $conn->query("SELECT COUNT(*) AS cnt FROM transactions WHERE type_id IN ($idList)");
            $cnt    = $chk->fetch_assoc()['cnt'] ?? 0;
            if ($cnt > 0)
                jsonResponse(['success'=>false,'message'=>'لا يمكن الحذف — يوجد '.$cnt.' معاملة مرتبطة'], 400);
            $conn->query("DELETE FROM transaction_types WHERE parent_id=$id");
            if ($conn->query("DELETE FROM transaction_types WHERE id=$id"))
                jsonResponse(['success'=>true,'message'=>'تم الحذف']);
            else
                jsonResponse(['success'=>false,'message'=>'فشل: '.$conn->error], 500);
            break;

        // ══════════════════════════════════════════════════════
        //  إدارة المعاملات
        // ══════════════════════════════════════════════════════

        case 'delete_transaction':
            if ($method !== 'POST') jsonResponse(['success'=>false,'message'=>'POST فقط'],405);
            $input = json_decode(file_get_contents('php://input'), true) ?? [];
            $id    = (int)($input['id'] ?? 0);
            if (deleteTransaction($id))
                jsonResponse(['success'=>true,'message'=>'تم حذف المعاملة']);
            else
                jsonResponse(['success'=>false,'message'=>'فشل في الحذف'], 500);
            break;

        case 'clear_all':
            if ($method !== 'POST') jsonResponse(['success'=>false,'message'=>'POST فقط'],405);
            $conn = db();
            // سجّل أولاً — قبل الحذف حتى لو فشل لاحقاً
            $txCount = $conn->query("SELECT COUNT(*) AS c FROM transactions")->fetch_assoc()['c'] ?? 0;
            auditLog('clear_all_transactions', 'system', 0, [
                'deleted_transactions_count' => (int)$txCount,
                'warning' => 'حذف جميع المعاملات من النظام',
            ]);
            $conn->query("DELETE FROM activity_log");
            $conn->query("DELETE FROM invoice_data");
            $conn->query("DELETE FROM payment_data");
            $conn->query("DELETE FROM budget_data");
            $conn->query("DELETE FROM receiving_data");
            $conn->query("DELETE FROM transactions");
            $conn->query("ALTER TABLE transactions AUTO_INCREMENT = 1");
            jsonResponse(['success'=>true,'message'=>'تم حذف جميع المعاملات']);
            break;

        // ══════════════════════════════════════════════════════
        //  تصدير البيانات
        // ══════════════════════════════════════════════════════

        case 'export':
            $conn   = db();
            $result = $conn->query("SELECT * FROM v_full_transactions ORDER BY id DESC");
            $data   = [];
            while ($row = $result->fetch_assoc()) $data[] = $row;
            header('Content-Type: text/csv; charset=utf-8');
            header('Content-Disposition: attachment; filename="transactions_'.date('Y-m-d').'.csv"');
            $output = fopen('php://output', 'w');
            fprintf($output, chr(0xEF).chr(0xBB).chr(0xBF));
            if (count($data) > 0) fputcsv($output, array_keys($data[0]));
            foreach ($data as $row) fputcsv($output, $row);
            fclose($output);
            exit;

        // ══════════════════════════════════════════════════════
        //  الإحصائيات
        // ══════════════════════════════════════════════════════

        case 'full_stats':
            $conn  = db();
            $stats = [];
            $stats['transactions']      = $conn->query("SELECT COUNT(*) AS c FROM transactions")->fetch_assoc()['c'];
            $stats['employees']         = $conn->query("SELECT COUNT(*) AS c FROM employees")->fetch_assoc()['c'];
            $stats['types']             = $conn->query("SELECT COUNT(*) AS c FROM transaction_types")->fetch_assoc()['c'];
            $stats['total_amount']      = $conn->query("SELECT SUM(amount) AS s FROM transactions")->fetch_assoc()['s'] ?? 0;
            $stats['this_month']        = $conn->query("SELECT COUNT(*) AS c FROM transactions WHERE MONTH(transaction_date)=MONTH(CURRENT_DATE()) AND YEAR(transaction_date)=YEAR(CURRENT_DATE())")->fetch_assoc()['c'];
            $r = $conn->query("SELECT role, COUNT(*) AS cnt FROM employees GROUP BY role");
            $stats['employees_by_role'] = [];
            if ($r) while ($row = $r->fetch_assoc()) $stats['employees_by_role'][$row['role']] = $row['cnt'];
            jsonResponse(['success'=>true,'data'=>$stats]);
            break;

        case 'system_health':
            $reqStart = microtime(true);
            $conn = db();
            $out  = [];

            // ── معلومات PHP والسيرفر ──────────────────────────────
            $out['php_version']     = PHP_VERSION;
            $out['server_software'] = $_SERVER['SERVER_SOFTWARE'] ?? 'Unknown';

            // ── الذاكرة ──────────────────────────────────────────
            $memUsage = memory_get_usage(true);
            $memPeak  = memory_get_peak_usage(true);
            $memLimit = ini_get('memory_limit');
            // تحويل memory_limit إلى bytes
            $memLimitBytes = (int)$memLimit;
            $unit = strtoupper(substr($memLimit, -1));
            if ($unit === 'G') $memLimitBytes *= 1073741824;
            elseif ($unit === 'M') $memLimitBytes *= 1048576;
            elseif ($unit === 'K') $memLimitBytes *= 1024;

            $out['memory_usage']        = $memUsage;
            $out['memory_peak']         = $memPeak;
            $out['memory_limit']        = $memLimit;
            $out['memory_limit_bytes']  = $memLimitBytes > 0 ? $memLimitBytes : 536870912; // 512M default
            $memPct = $memLimitBytes > 0 ? round(($memUsage / $memLimitBytes) * 100) : 0;

            // ── ملفات الرفع ───────────────────────────────────────
            $uploadsDir = dirname(__DIR__) . '/uploads';
            $uploadSize = 0; $uploadCount = 0;
            if (is_dir($uploadsDir)) {
                $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($uploadsDir, FilesystemIterator::SKIP_DOTS));
                foreach ($it as $f) { $uploadSize += $f->getSize(); $uploadCount++; }
            }
            $out['uploads_size']  = $uploadSize;
            $out['uploads_count'] = $uploadCount;
            $uploadsMB = round($uploadSize / 1048576, 1);

            // ── جداول قاعدة البيانات ──────────────────────────────
            $r = $conn->query("SELECT table_name, table_rows, data_length, index_length,
                (data_length + index_length) AS total_size
                FROM information_schema.TABLES WHERE table_schema=DATABASE()
                ORDER BY total_size DESC");
            $tables = []; $dbSize = 0;
            if ($r) while ($row = $r->fetch_assoc()) {
                $row['data_length']  = (int)$row['data_length'];
                $row['index_length'] = (int)$row['index_length'];
                $row['total_size']   = (int)$row['total_size'];
                $row['table_rows']   = (int)$row['table_rows'];
                $tables[] = $row;
                $dbSize += $row['total_size'];
            }
            $out['db_tables']      = $tables;
            $out['db_total_size']  = $dbSize;
            $out['db_table_count'] = count($tables);

            // ── MySQL version ─────────────────────────────────────
            $vr = $conn->query("SELECT VERSION() AS v");
            $out['mysql_version'] = $vr ? $vr->fetch_assoc()['v'] : 'Unknown';

            // ── إحصائيات DB ───────────────────────────────────────
            $statusR = $conn->query("SHOW GLOBAL STATUS WHERE Variable_name IN
                ('Threads_connected','Queries','Slow_queries')");
            $dbStatus = [];
            if ($statusR) while ($sr = $statusR->fetch_assoc()) $dbStatus[$sr['Variable_name']] = $sr['Value'];
            $out['db_connections']   = (int)($dbStatus['Threads_connected'] ?? 1);
            $out['db_queries_total'] = (int)($dbStatus['Queries'] ?? 0);
            $out['db_slow_queries']  = (int)($dbStatus['Slow_queries'] ?? 0);

            // ── حمل المعالج ───────────────────────────────────────
            $out['load_avg'] = function_exists('sys_getloadavg') ? sys_getloadavg() : null;

            // ── حجم الجلسة ────────────────────────────────────────
            $out['session_size'] = isset($_SESSION) ? strlen(serialize($_SESSION)) : 0;

            // ── OPcache ───────────────────────────────────────────
            $out['opcache'] = null;
            if (function_exists('opcache_get_status')) {
                $ocs = @opcache_get_status(false);
                if ($ocs && isset($ocs['memory_usage'])) {
                    $ocMem = $ocs['memory_usage'];
                    $ocUsed = (int)($ocMem['used_memory'] ?? 0);
                    $ocFree = (int)($ocMem['free_memory'] ?? 0);
                    $ocTotal = $ocUsed + $ocFree;
                    $ocHit = 0;
                    if (isset($ocs['opcache_statistics'])) {
                        $ocSt  = $ocs['opcache_statistics'];
                        $hits  = (int)($ocSt['hits'] ?? 0);
                        $miss  = (int)($ocSt['misses'] ?? 0);
                        $ocHit = ($hits + $miss) > 0 ? round($hits / ($hits + $miss) * 100, 1) : 0;
                    }
                    $out['opcache'] = [
                        'enabled'      => (bool)($ocs['opcache_enabled'] ?? false),
                        'used_memory'  => $ocUsed,
                        'free_memory'  => $ocFree,
                        'total_memory' => $ocTotal,
                        'cached_files' => (int)($ocs['opcache_statistics']['num_cached_scripts'] ?? 0),
                        'hit_rate'     => $ocHit,
                    ];
                }
            }

            // ── صحة النظام ────────────────────────────────────────
            $dbOk = ($conn && !$conn->connect_error);
            $uploadsWritable = is_dir($uploadsDir) && is_writable($uploadsDir);
            $phpOk = version_compare(PHP_VERSION, '7.4', '>=');
            $slowQueriesOk = (int)($dbStatus['Slow_queries'] ?? 0) <= 50;

            $out['health'] = [
                'db_connection'    => $dbOk ? 'ok' : 'error',
                'uploads_writable' => $uploadsWritable ? 'ok' : 'error',
                'memory_status'    => $memPct < 80 ? 'ok' : ($memPct < 90 ? 'warning' : 'error'),
                'memory_pct'       => $memPct,
                'php_ok'           => $phpOk ? 'ok' : 'warning',
                'slow_queries'     => $slowQueriesOk ? 'ok' : 'warning',
                'uploads_size_mb'  => $uploadsMB,
            ];

            // ── زمن الاستجابة ─────────────────────────────────────
            $out['request_time'] = round((microtime(true) - $reqStart) * 1000, 1);

            jsonResponse(['success'=>true,'data'=>$out]);
            break;

        case 'clear_cache':
            if (function_exists('opcache_reset')) opcache_reset();
            jsonResponse(['success'=>true,'message'=>'تم مسح الكاش']);
            break;

        // ══════════════════════════════════════════════════════
        //  البادئات والموقعون (prefixes / signers)
        // ══════════════════════════════════════════════════════

        case 'get_prefixes':
        case 'save_prefix':
        case 'get_signers':
        case 'save_signer': {
            $conn  = db();
            $input = json_decode(file_get_contents('php://input'), true) ?? [];

            if ($action === 'get_prefixes') {
                $rows = [];
                $r    = $conn->query("SELECT setting_key, setting_value, setting_label
                    FROM system_settings WHERE setting_group='prefixes' ORDER BY id");
                if ($r) while ($row = $r->fetch_assoc()) $rows[] = $row;
                jsonResponse(['success'=>true,'data'=>$rows]);
                break;
            }
            if ($action === 'save_prefix') {
                $key   = $conn->real_escape_string($input['key'] ?? '');
                $value = strtoupper($conn->real_escape_string(preg_replace('/[^A-Z0-9]/','',strtoupper($input['value']??''))));
                if (!$key || !$value) jsonResponse(['success'=>false,'message'=>'بيانات ناقصة']);
                $conn->query("UPDATE system_settings SET setting_value='$value' WHERE setting_key='$key'");
                jsonResponse(['success'=>true,'message'=>'تم الحفظ']);
                break;
            }
            if ($action === 'get_signers') {
                $rows = [];
                $r    = $conn->query("SELECT setting_key, setting_value, setting_label
                    FROM system_settings WHERE setting_group='payment_order' ORDER BY id");
                if ($r) while ($row = $r->fetch_assoc()) $rows[] = $row;
                jsonResponse(['success'=>true,'data'=>$rows]);
                break;
            }
            if ($action === 'save_signer') {
                $key   = $conn->real_escape_string($input['key'] ?? '');
                $value = $conn->real_escape_string($input['value'] ?? '');
                if (!$key) jsonResponse(['success'=>false,'message'=>'key مطلوب']);
                $conn->query("UPDATE system_settings SET setting_value='$value' WHERE setting_key='$key'");
                jsonResponse(['success'=>true,'message'=>'تم الحفظ']);
                break;
            }
            break;
        }

        // ══════════════════════════════════════════════════════
        //  نظام الصلاحيات
        // ══════════════════════════════════════════════════════

        case 'init_permissions':
        case 'get_employee_permissions':
        case 'save_employee_permissions':

            $conn = db();

            // ضمان وجود عمود permission_level
            $chkCol = $conn->query("SHOW COLUMNS FROM employees LIKE 'permission_level'");
            if (!$chkCol || $chkCol->num_rows === 0) {
                $conn->query("ALTER TABLE employees
                    ADD COLUMN permission_level ENUM('system_admin','CEO','sector_head','division_manager','employee_l1','employee')
                        NOT NULL DEFAULT 'employee' AFTER role,
                    ADD COLUMN can_delete TINYINT(1) NOT NULL DEFAULT 0 AFTER permission_level");
                $conn->query("UPDATE employees SET permission_level='system_admin', can_delete=1 WHERE role='admin'");
            }

            // ضمان جدول الصلاحيات
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
                jsonResponse(['success'=>true,'message'=>'تم تهيئة جداول الصلاحيات']);
                break;
            }

            if ($action === 'get_employee_permissions') {
                $empId = (int)($_GET['employee_id'] ?? 0);
                if (!$empId) jsonResponse(['success'=>false,'error'=>'employee_id مطلوب']);

                $r   = $conn->query("SELECT permission_level, can_delete FROM employees WHERE id=$empId LIMIT 1");
                $emp = $r ? $r->fetch_assoc() : null;
                if (!$emp) jsonResponse(['success'=>false,'error'=>'موظف غير موجود']);

                $allPages = ['dashboard','transactions','correspondence','bank-overview','bank-accounts',
                             'bank-investments','daily-payments','sla','performance','settings',
                             'notifications','reservations','budget-plans','archive','ceo-approvals',
                             'purchase-requests','reports'];
                $pages    = [];

                if ($emp['permission_level'] === 'system_admin') {
                    foreach ($allPages as $p) $pages[$p] = true;
                } else {
                    $r2     = $conn->query("SELECT page, can_access FROM employee_page_permissions WHERE employee_id=$empId");
                    $stored = [];
                    if ($r2) while ($row = $r2->fetch_assoc()) $stored[$row['page']] = (bool)$row['can_access'];

                    $defaults = [
                        'CEO'              => ['dashboard'=>1,'transactions'=>1,'correspondence'=>1,'bank-overview'=>1,
                                              'bank-accounts'=>1,'bank-investments'=>1,'daily-payments'=>1,'sla'=>1,
                                              'performance'=>1,'settings'=>0,'notifications'=>1,'reservations'=>1,
                                              'budget-plans'=>1,'archive'=>1,'ceo-approvals'=>1,'purchase-requests'=>1,
                                              'reports'=>1],
                        'sector_head'      => ['dashboard'=>1,'transactions'=>1,'correspondence'=>1,'bank-overview'=>1,
                                              'bank-accounts'=>1,'bank-investments'=>1,'daily-payments'=>1,'sla'=>1,
                                              'performance'=>1,'settings'=>0,'notifications'=>1,'reservations'=>1,
                                              'budget-plans'=>1,'archive'=>1,'ceo-approvals'=>1,'purchase-requests'=>1,
                                              'reports'=>1],
                        'division_manager' => ['dashboard'=>1,'transactions'=>1,'correspondence'=>1,'bank-overview'=>1,
                                              'bank-accounts'=>0,'bank-investments'=>0,'daily-payments'=>1,'sla'=>1,
                                              'performance'=>1,'settings'=>0,'notifications'=>1,'reservations'=>1,
                                              'budget-plans'=>1,'archive'=>1,'ceo-approvals'=>0,'purchase-requests'=>1,
                                              'reports'=>1],
                        'employee_l1'      => ['dashboard'=>0,'transactions'=>1,'correspondence'=>1,'bank-overview'=>0,
                                              'bank-accounts'=>0,'bank-investments'=>0,'daily-payments'=>1,'sla'=>0,
                                              'performance'=>1,'settings'=>0,'notifications'=>1,'reservations'=>1,
                                              'budget-plans'=>0,'archive'=>0,'ceo-approvals'=>0,'purchase-requests'=>1,
                                              'reports'=>1],
                        'manager'          => ['dashboard'=>1,'transactions'=>1,'correspondence'=>1,'bank-overview'=>1,
                                              'bank-accounts'=>1,'bank-investments'=>1,'daily-payments'=>1,'sla'=>1,
                                              'performance'=>1,'settings'=>0,'notifications'=>1,'reservations'=>1,
                                              'budget-plans'=>1,'archive'=>1,'ceo-approvals'=>1,'purchase-requests'=>1,
                                              'reports'=>1],
                        'employee'         => ['dashboard'=>0,'transactions'=>1,'correspondence'=>1,'bank-overview'=>0,
                                              'bank-accounts'=>0,'bank-investments'=>0,'daily-payments'=>0,'sla'=>0,
                                              'performance'=>0,'settings'=>0,'notifications'=>1,'reservations'=>1,
                                              'budget-plans'=>0,'archive'=>0,'ceo-approvals'=>0,'purchase-requests'=>1,
                                              'reports'=>0],
                    ];
                    $def = $defaults[$emp['permission_level']] ?? [];
                    foreach ($allPages as $p) {
                        $pages[$p] = isset($stored[$p]) ? $stored[$p] : (bool)($def[$p] ?? false);
                    }
                }

                $actionOverrides = [];
                $chkAct = $conn->query("SHOW TABLES LIKE 'employee_action_permissions'");
                if ($chkAct && $chkAct->num_rows > 0) {
                    $ra = $conn->query("SELECT action, can_do FROM employee_action_permissions WHERE employee_id=$empId");
                    if ($ra) while ($row = $ra->fetch_assoc()) $actionOverrides[$row['action']] = (bool)$row['can_do'];
                }

                jsonResponse(['success'=>true,'data'=>[
                    'permission_level'   => $emp['permission_level'],
                    'can_delete'         => (bool)$emp['can_delete'],
                    'pages'              => $pages,
                    'action_permissions' => $actionOverrides,
                ]]);
                break;
            }

            if ($action === 'save_employee_permissions') {
                $body  = json_decode(file_get_contents('php://input'), true) ?? [];
                $empId = (int)($body['employee_id'] ?? 0);
                if (!$empId) jsonResponse(['success'=>false,'error'=>'employee_id مطلوب']);

                // اجلب الصلاحية الحالية للـ audit trail (قبل التغيير)
                $oldPermRow = $conn->query("SELECT permission_level, can_delete, name FROM employees WHERE id=$empId LIMIT 1");
                $oldPerm    = $oldPermRow ? $oldPermRow->fetch_assoc() : [];

                $levelCode = $conn->real_escape_string($body['permission_level'] ?? 'employee');
                $canDelete = !empty($body['can_delete']) ? 1 : 0;

                // ضمان وجود الأعمدة — مرة واحدة لكل طلب
                _guardEmployeeColumns();

                // ضمان توسيع ENUM قبل الحفظ
                @$conn->query("ALTER TABLE employees MODIFY COLUMN permission_level ENUM('system_admin','CEO','sector_head','division_manager','employee_l1','employee') NOT NULL DEFAULT 'employee'");
                $validLevels = ['system_admin','CEO','sector_head','division_manager','employee_l1','employee','manager'];
                $enumLevel = in_array($levelCode, $validLevels) ? $levelCode : 'employee';

                $conn->query("UPDATE employees
                    SET permission_level='$enumLevel',
                        permission_level_code='$levelCode',
                        can_delete=$canDelete
                    WHERE id=$empId");

                if (isset($body['pages']) && is_array($body['pages'])) {
                    $conn->query("DELETE FROM employee_page_permissions WHERE employee_id=$empId");
                    foreach ($body['pages'] as $page => $access) {
                        $page   = $conn->real_escape_string($page);
                        $access = $access ? 1 : 0;
                        $conn->query("INSERT INTO employee_page_permissions (employee_id,page,can_access)
                            VALUES ($empId,'$page',$access)
                            ON DUPLICATE KEY UPDATE can_access=$access");
                    }
                }

                if (isset($body['action_permissions']) && is_array($body['action_permissions'])) {
                    $conn->query("CREATE TABLE IF NOT EXISTS employee_action_permissions (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        employee_id INT NOT NULL,
                        action VARCHAR(80) NOT NULL,
                        can_do TINYINT(1) NOT NULL DEFAULT 1,
                        UNIQUE KEY uq_emp_action (employee_id, action),
                        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
                    $conn->query("DELETE FROM employee_action_permissions WHERE employee_id=$empId");
                    foreach ($body['action_permissions'] as $actKey => $allow) {
                        $actKey = $conn->real_escape_string($actKey);
                        $allow  = $allow ? 1 : 0;
                        $conn->query("INSERT INTO employee_action_permissions (employee_id,action,can_do)
                            VALUES ($empId,'$actKey',$allow)
                            ON DUPLICATE KEY UPDATE can_do=$allow");
                    }
                }

                // Audit: سجّل تغيير الصلاحية مع القيمة القديمة والجديدة
                auditLog('change_permission', 'employee', $empId, [
                    'employee_name'   => $oldPerm['name'] ?? '—',
                    'old_level'       => $oldPerm['permission_level'] ?? '—',
                    'new_level'       => $enumLevel,
                    'old_can_delete'  => (bool)($oldPerm['can_delete'] ?? false),
                    'new_can_delete'  => (bool)$canDelete,
                    'pages_updated'   => isset($body['pages']),
                ]);
if (function_exists('logToSecurityLog')) {
    logToSecurityLog('permissions_change',
        'تعديل صلاحيات الموظف ID:' . $empId . ' — المستوى: ' . $enumLevel,
        'success', ['employee_id'=>$empId,'new_level'=>$enumLevel]);
}
                jsonResponse(['success'=>true,'message'=>'تم حفظ الصلاحيات']);
                break;
            }
            break;

        // ── جلب قيمة إعداد واحد ────────────────────────────────
        case 'get_setting': {
            $conn = db();
            $key  = $conn->real_escape_string($_GET['key'] ?? '');
            if (!$key) { jsonResponse(['success'=>false,'message'=>'المفتاح مطلوب'], 400); }
            // قيمة افتراضية لـ pr_amount_threshold إذا لم تكن موجودة
            $r = $conn->query("SELECT setting_value FROM system_settings WHERE setting_key='$key' LIMIT 1");
            $val = ($r && $row = $r->fetch_assoc()) ? $row['setting_value'] : '';
            // إذا فارغة استخدم الافتراضي من pr_functions
            if ($val === '' && $key === 'pr_amount_threshold') $val = '5000';
            jsonResponse(['success'=>true,'value'=>$val]);
            break;
        }

        // ── حفظ قيمة إعداد واحد ────────────────────────────────
        case 'save_setting': {
            $conn  = db();
            $input = json_decode(file_get_contents('php://input'), true) ?? [];
            $key   = $conn->real_escape_string($input['key']   ?? '');
            $val   = $conn->real_escape_string($input['value'] ?? '');
            if (!$key) { jsonResponse(['success'=>false,'message'=>'المفتاح مطلوب'], 400); }
            $conn->query("INSERT INTO system_settings (setting_key,setting_value) VALUES ('$key','$val')
                          ON DUPLICATE KEY UPDATE setting_value='$val'");
            jsonResponse(['success'=>true,'message'=>'تم الحفظ']);
            break;
        }

        // ── جلب سياسات SLA لطلبات الشراء ───────────────────────
        case 'get_pr_sla_policies': {
            $conn = db();
            // إنشاء الجدول تلقائياً إن لم يكن موجوداً
            $conn->query("CREATE TABLE IF NOT EXISTS pr_sla_policies (
                id            INT AUTO_INCREMENT PRIMARY KEY,
                stage_name    VARCHAR(60)  NOT NULL,
                name          VARCHAR(100) NOT NULL DEFAULT '',
                allowed_hours DECIMAL(6,2) NOT NULL DEFAULT 24,
                warning_pct   TINYINT      NOT NULL DEFAULT 70,
                escalate_pct  TINYINT      NOT NULL DEFAULT 100,
                is_active     TINYINT(1)   NOT NULL DEFAULT 1,
                UNIQUE KEY uq_stage (stage_name)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

            // إدراج الافتراضيات إن كان الجدول فارغاً
            $cnt = $conn->query("SELECT COUNT(*) AS c FROM pr_sla_policies")->fetch_assoc()['c'];
            if (!$cnt) {
                $defaults = [
                    ['reception',               'الاستلام والتحقق',           24],
                    ['budget_review',           'مراجعة الموازنة',            24],
                    ['treasury_review',         'مراجعة مدير الخزينة',        48],
                    ['finance_review',          'مراجعة رئيس القطاع المالي',  48],
                    ['ceo_approval',            'موافقة CEO المبدئية',         72],
                    ['purchasing',              'المشتريات — إنشاء حجز',      48],
                    ['waiting_budget_approval', 'اعتماد حجز الموازنة',        24],
                    ['accounts_review',         'الحسابات — مراجعة وتوزيع',  24],
                    ['po_issuance',             'إصدار أمر الشراء (PO)',       72],
                    ['payment',                 'المالية — الدفع',             48],
                    ['referral',                'الإحالة',                     24],
                ];
                foreach ($defaults as [$stage, $name, $hours]) {
                    $s = $conn->real_escape_string($stage);
                    $n = $conn->real_escape_string($name);
                    $conn->query("INSERT IGNORE INTO pr_sla_policies (stage_name,name,allowed_hours) VALUES ('$s','$n',$hours)");
                }
            }

            $r = $conn->query("SELECT * FROM pr_sla_policies ORDER BY id");
            $rows = [];
            if ($r) while ($row = $r->fetch_assoc()) $rows[] = $row;
            jsonResponse(['success'=>true,'data'=>$rows]);
            break;
        }

        // ── حفظ سياسات SLA لطلبات الشراء ───────────────────────
        case 'save_pr_sla_policies': {
            $conn     = db();
            $input    = json_decode(file_get_contents('php://input'), true) ?? [];
            $policies = $input['policies'] ?? [];
            if (empty($policies)) { jsonResponse(['success'=>false,'message'=>'لا توجد سياسات'], 400); }
            foreach ($policies as $p) {
                $stage = $conn->real_escape_string($p['stage'] ?? '');
                $hours = (float)($p['hours'] ?? 24);
                $warn  = (int)($p['warn']  ?? 70);
                $esc   = (int)($p['esc']   ?? 100);
                $id    = (int)($p['id']    ?? 0);
                if (!$stage) continue;
                if ($id > 0) {
                    $conn->query("UPDATE pr_sla_policies SET allowed_hours=$hours, warning_pct=$warn, escalate_pct=$esc WHERE id=$id");
                } else {
                    $name = $conn->real_escape_string($p['stage'] ?? $stage);
                    $conn->query("INSERT INTO pr_sla_policies (stage_name,name,allowed_hours,warning_pct,escalate_pct)
                                  VALUES ('$stage','$name',$hours,$warn,$esc)
                                  ON DUPLICATE KEY UPDATE allowed_hours=$hours, warning_pct=$warn, escalate_pct=$esc");
                }
            }
            jsonResponse(['success'=>true,'message'=>'تم حفظ سياسات SLA']);
            break;
        }

        // ══════════════════════════════════════════════════════
        //  محرر الهوية البصرية — Theme Editor
        // ══════════════════════════════════════════════════════

        // جلب جميع إعدادات النظام (يستخدمها ThemeEditor لتحميل الثيم)
        case 'get_system_settings': {
            $conn = db();
            // إنشاء جدول system_settings إن لم يكن موجوداً
            $conn->query("CREATE TABLE IF NOT EXISTS system_settings (
                id            INT AUTO_INCREMENT PRIMARY KEY,
                setting_key   VARCHAR(100) NOT NULL,
                setting_value TEXT         NOT NULL DEFAULT '',
                UNIQUE KEY uq_key (setting_key)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

            $r    = $conn->query("SELECT setting_key, setting_value FROM system_settings");
            $rows = [];
            if ($r) while ($row = $r->fetch_assoc()) $rows[] = $row;
            jsonResponse(['success' => true, 'data' => $rows]);
            break;
        }

        // حفظ إعداد واحد بالـ key/value (يستخدمها ThemeEditor عند الحفظ)
      case 'save_system_setting': {
            if ($method !== 'POST') jsonResponse(['success'=>false,'message'=>'POST فقط'], 405);
            $input = json_decode(file_get_contents('php://input'), true) ?? [];
            $key   = trim($input['key']   ?? '');
            $val   = trim($input['value'] ?? '');
            if (!$key) jsonResponse(['success'=>false,'message'=>'المفتاح مطلوب'], 400);

            $conn = db();
            $conn->query("CREATE TABLE IF NOT EXISTS system_settings (
                id            INT AUTO_INCREMENT PRIMARY KEY,
                setting_key   VARCHAR(100) NOT NULL,
                setting_value TEXT         NOT NULL DEFAULT '',
                UNIQUE KEY uq_key (setting_key)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

            $k = $conn->real_escape_string($key);
            $v = $conn->real_escape_string($val);

            $oldR   = $conn->query("SELECT setting_value FROM system_settings WHERE setting_key='$k' LIMIT 1");
            $oldVal = ($oldR && $oldR->num_rows) ? ($oldR->fetch_assoc()['setting_value'] ?? '(جديد)') : '(جديد)';

            $conn->query("INSERT INTO system_settings (setting_key, setting_value)
                        VALUES ('$k', '$v')
                        ON DUPLICATE KEY UPDATE setting_value = '$v'");

            if ($conn->errno) jsonResponse(['success'=>false,'message'=>$conn->error], 500);

            if (function_exists('logToSecurityLog')) {
                logToSecurityLog('settings_change',
                    'تغيير إعداد: ' . $key . ' — من: ' . $oldVal . ' إلى: ' . $val,
                    'success', ['key'=>$key,'old'=>$oldVal,'new'=>$val]);
            }

            jsonResponse(['success' => true, 'message' => 'تم الحفظ']);
            break;
}


case 'get_quotes':
    $conn = db();
    $conn->query("CREATE TABLE IF NOT EXISTS daily_quotes (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        quote_text TEXT NOT NULL,
        is_active  TINYINT(1) NOT NULL DEFAULT 1,
        sort_order INT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $r = $conn->query("SELECT id, quote_text FROM daily_quotes WHERE is_active=1 ORDER BY sort_order, id");
    $rows = [];
    while ($row = $r->fetch_assoc()) $rows[] = $row;
    jsonResponse(['success'=>true,'data'=>$rows]);
    break;

case 'save_quote':
    $conn  = db();
    $input = json_decode(file_get_contents('php://input'), true) ?? [];
    $text  = $conn->real_escape_string(trim($input['quote_text'] ?? ''));
    $id    = (int)($input['id'] ?? 0);
    if (!$text) jsonResponse(['success'=>false,'message'=>'النص مطلوب']);
    if ($id) {
        $conn->query("UPDATE daily_quotes SET quote_text='$text' WHERE id=$id");
    } else {
        $conn->query("INSERT INTO daily_quotes (quote_text) VALUES ('$text')");
    }
    jsonResponse(['success'=>true]);
    break;

case 'delete_quote':
    $conn = db();
    $id   = (int)(json_decode(file_get_contents('php://input'), true)['id'] ?? 0);
    $conn->query("DELETE FROM daily_quotes WHERE id=$id");
    jsonResponse(['success'=>true]);
    break;

        case 'get_brand_identity': {
            $conn = db();
            $keys = ['brand_name_ar','brand_name_en','org_name','font_family','font_size_base','quotes_enabled'];
            $result = [];
            foreach ($keys as $k) {
                $esc = $conn->real_escape_string($k);
                $r   = $conn->query("SELECT setting_value FROM system_settings WHERE setting_key='$esc' LIMIT 1");
                $result[$k] = ($r && $r->num_rows) ? $r->fetch_assoc()['setting_value'] : '';
            }
            jsonResponse(['success'=>true,'data'=>$result]);
            break;
        }

        case 'save_brand_identity': {
            if ($method !== 'POST') jsonResponse(['success'=>false,'message'=>'POST فقط'], 405);
            $conn  = db();
            $input = json_decode(file_get_contents('php://input'), true) ?? [];
            $allowed = ['brand_name_ar','brand_name_en','org_name','font_family','font_size_base','quotes_enabled'];
            foreach ($allowed as $key) {
                if (!array_key_exists($key, $input)) continue;
                $k = $conn->real_escape_string($key);
                $v = $conn->real_escape_string(trim((string)$input[$key]));
                $conn->query("INSERT INTO system_settings (setting_key, setting_value)
                    VALUES ('$k','$v') ON DUPLICATE KEY UPDATE setting_value='$v'");
            }
            jsonResponse(['success'=>true,'message'=>'تم حفظ هوية المنظمة']);
            break;
        }

        default:
            jsonResponse(['success'=>false,'message'=>'إجراء غير معروف: '.$action], 400);
    }

} catch (Exception $e) {
    jsonResponse(['success'=>false,'message'=>$e->getMessage()], 500);
}