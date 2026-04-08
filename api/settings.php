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
header('Access-Control-Allow-Headers: Content-Type');

require_once __DIR__ . '/../includes/functions.php';

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

try {
    switch ($action) {

        // ══════════════════════════════════════════════════════
        //  الموظفون
        // ══════════════════════════════════════════════════════

        case 'get_employees':
            $conn = db();
            @$conn->query("ALTER TABLE employees ADD COLUMN IF NOT EXISTS permission_level_code VARCHAR(50) DEFAULT NULL");
            @$conn->query("ALTER TABLE employees ADD COLUMN IF NOT EXISTS sector_id INT DEFAULT NULL");
            @$conn->query("ALTER TABLE employees ADD COLUMN IF NOT EXISTS division_id INT DEFAULT NULL");
            @$conn->query("ALTER TABLE employees ADD COLUMN IF NOT EXISTS job_title VARCHAR(150) DEFAULT NULL");

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
            $input          = json_decode(file_get_contents('php://input'), true) ?? [];
            $conn           = db();
            $name           = $conn->real_escape_string($input['name'] ?? '');
            $email          = $conn->real_escape_string($input['email'] ?? '');
            $phone          = $conn->real_escape_string($input['phone'] ?? '');
            $role           = $conn->real_escape_string($input['role'] ?? 'employee');
            $jobTitle       = $conn->real_escape_string($input['job_title'] ?? '');
            $employeeNumber = $conn->real_escape_string($input['employee_number'] ?? '');
            $supervisorId   = !empty($input['supervisor_id'])  ? (int)$input['supervisor_id']  : 'NULL';
            $departmentId   = !empty($input['department_id'])  ? (int)$input['department_id']  : 'NULL';
            $sectorId       = !empty($input['sector_id'])      ? (int)$input['sector_id']      : $departmentId;
            $divisionId     = !empty($input['division_id'])    ? (int)$input['division_id']    : 'NULL';
            $permCode       = !empty($input['permission_level_code'])
                              ? "'".$conn->real_escape_string($input['permission_level_code'])."'" : 'NULL';

            // ضمان الأعمدة الجديدة
            $conn->query("ALTER TABLE employees ADD COLUMN IF NOT EXISTS sector_id INT DEFAULT NULL AFTER department_id");
            $conn->query("ALTER TABLE employees ADD COLUMN IF NOT EXISTS division_id INT DEFAULT NULL AFTER sector_id");
            $conn->query("ALTER TABLE employees ADD COLUMN IF NOT EXISTS permission_level_code VARCHAR(50) DEFAULT NULL AFTER permission_level");
            $conn->query("ALTER TABLE employees ADD COLUMN IF NOT EXISTS job_title VARCHAR(150) DEFAULT NULL AFTER name");

            // مزامنة permission_level مع permission_level_code
            $validLevels = ['system_admin','CEO','sector_head','division_manager','employee_l1','employee'];
            $rawCode = $input['permission_level_code'] ?? '';
            $syncedLevel = in_array($rawCode, $validLevels) ? $rawCode : 'employee';

            $conn->query("INSERT INTO employees
                (name, job_title, email, phone, role, employee_number, supervisor_id,
                 department_id, sector_id, division_id, permission_level, permission_level_code)
                VALUES
                ('$name','$jobTitle','$email','$phone','$role','$employeeNumber',$supervisorId,
                 $departmentId,$sectorId,$divisionId,'$syncedLevel',$permCode)");

            if ($conn->affected_rows > 0)
                jsonResponse(['success'=>true,'message'=>'تم إضافة الموظف','id'=>$conn->insert_id]);
            else
                jsonResponse(['success'=>false,'message'=>'فشل: '.$conn->error], 500);
            break;

        case 'update_employee':
            if ($method !== 'POST') jsonResponse(['success'=>false,'message'=>'POST فقط'],405);
            $input          = json_decode(file_get_contents('php://input'), true) ?? [];
            $conn           = db();
            $id             = (int)($input['id'] ?? 0);
            $name           = $conn->real_escape_string($input['name'] ?? '');
            $email          = $conn->real_escape_string($input['email'] ?? '');
            $phone          = $conn->real_escape_string($input['phone'] ?? '');
            $role           = $conn->real_escape_string($input['role'] ?? 'receiver');
            $jobTitle       = $conn->real_escape_string($input['job_title'] ?? '');
            $employeeNumber = $conn->real_escape_string($input['employee_number'] ?? '');
            $supervisorId   = !empty($input['supervisor_id'])  ? (int)$input['supervisor_id']  : 'NULL';
            $departmentId   = !empty($input['department_id'])  ? (int)$input['department_id']  : 'NULL';
            $sectorId       = !empty($input['sector_id'])      ? (int)$input['sector_id']      : $departmentId;
            $divisionId     = !empty($input['division_id'])    ? (int)$input['division_id']    : 'NULL';
            $permCode       = !empty($input['permission_level_code'])
                              ? "'".$conn->real_escape_string($input['permission_level_code'])."'" : 'NULL';

            // ضمان الأعمدة الجديدة
            $conn->query("ALTER TABLE employees ADD COLUMN IF NOT EXISTS sector_id INT DEFAULT NULL AFTER department_id");
            $conn->query("ALTER TABLE employees ADD COLUMN IF NOT EXISTS division_id INT DEFAULT NULL AFTER sector_id");
            $conn->query("ALTER TABLE employees ADD COLUMN IF NOT EXISTS permission_level_code VARCHAR(50) DEFAULT NULL AFTER permission_level");
            $conn->query("ALTER TABLE employees ADD COLUMN IF NOT EXISTS job_title VARCHAR(150) DEFAULT NULL AFTER name");

            // مزامنة permission_level مع permission_level_code — الأدوار الخمسة فقط
            $validLevels = ['system_admin','CEO','sector_head','division_manager','employee_l1','employee'];
            $rawCode = $input['permission_level_code'] ?? '';
            $syncedLevel = in_array($rawCode, $validLevels) ? $rawCode : 'employee';
            $syncedLevelSql = "'" . $conn->real_escape_string($syncedLevel) . "'";

            $conn->query("UPDATE employees SET
                name='$name', job_title='$jobTitle', email='$email', phone='$phone',
                role='$role', employee_number='$employeeNumber',
                supervisor_id=$supervisorId, department_id=$departmentId,
                sector_id=$sectorId, division_id=$divisionId,
                permission_level=$syncedLevelSql,
                permission_level_code=$permCode
                WHERE id=$id");

            if ($conn->affected_rows >= 0)
                jsonResponse(['success'=>true,'message'=>'تم تحديث الموظف']);
            else
                jsonResponse(['success'=>false,'message'=>'فشل: '.$conn->error], 500);
            break;

        case 'delete_employee':
            if ($method !== 'POST') jsonResponse(['success'=>false,'message'=>'POST فقط'],405);
            $input = json_decode(file_get_contents('php://input'), true) ?? [];
            $id    = (int)($input['id'] ?? 0);
            $conn  = db();
            if ($conn->query("DELETE FROM employees WHERE id=$id"))
                jsonResponse(['success'=>true,'message'=>'تم حذف الموظف']);
            else
                jsonResponse(['success'=>false,'message'=>'فشل: '.$conn->error], 500);
            break;

        // ══════════════════════════════════════════════════════
        //  الأقسام (departments) — القطاعات والأقسام التنظيمية
        // ══════════════════════════════════════════════════════

        case 'get_departments':
        case 'get_divisions':
            $conn = db();
            // ضمان الأعمدة الجديدة
            $conn->query("ALTER TABLE departments ADD COLUMN IF NOT EXISTS sector_id INT DEFAULT NULL AFTER parent_id");
            $conn->query("ALTER TABLE departments ADD COLUMN IF NOT EXISTS dept_type ENUM('sector','division','team') NOT NULL DEFAULT 'division' AFTER sector_id");
            $conn->query("ALTER TABLE departments ADD COLUMN IF NOT EXISTS manager_id INT DEFAULT NULL AFTER dept_type");

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
            $conn      = db();
            $input     = json_decode(file_get_contents('php://input'), true) ?? [];
            $name      = $conn->real_escape_string(trim($input['name'] ?? ''));
            $code      = strtoupper($conn->real_escape_string(trim($input['code'] ?? '')));
            $desc      = $conn->real_escape_string(trim($input['description'] ?? ''));
            $sectorId  = !empty($input['sector_id'])   ? (int)$input['sector_id']  : 'NULL';
            $parentId  = !empty($input['parent_id'])   ? (int)$input['parent_id']  : $sectorId;
            $managerId = !empty($input['manager_id'])  ? (int)$input['manager_id'] : 'NULL';
            $deptType  = in_array($input['dept_type'] ?? '', ['sector','division','team'])
                         ? $input['dept_type'] : ($action === 'add_division' ? 'division' : 'sector');

            $conn->query("ALTER TABLE departments ADD COLUMN IF NOT EXISTS sector_id INT DEFAULT NULL AFTER parent_id");
            $conn->query("ALTER TABLE departments ADD COLUMN IF NOT EXISTS dept_type ENUM('sector','division','team') NOT NULL DEFAULT 'division' AFTER sector_id");
            $conn->query("ALTER TABLE departments ADD COLUMN IF NOT EXISTS manager_id INT DEFAULT NULL AFTER dept_type");

            if (!$name) jsonResponse(['success'=>false,'message'=>'الاسم مطلوب']);
            $codeSQL = $code ? "'$code'" : 'NULL';
            $descSQL = $desc ? "'$desc'" : 'NULL';

            $conn->query("INSERT INTO departments
                (name, code, description, sector_id, parent_id, manager_id, dept_type, is_active)
                VALUES ('$name',$codeSQL,$descSQL,$sectorId,$parentId,$managerId,'$deptType',1)");

            if ($conn->affected_rows > 0)
                jsonResponse(['success'=>true,'message'=>'تم الإضافة','id'=>$conn->insert_id]);
            else
                jsonResponse(['success'=>false,'message'=>$conn->error]);
            break;

        case 'update_department':
        case 'update_division':
            if ($method !== 'POST') jsonResponse(['success'=>false,'message'=>'POST فقط'],405);
            $conn      = db();
            $input     = json_decode(file_get_contents('php://input'), true) ?? [];
            $id        = (int)($input['id'] ?? 0);
            $name      = $conn->real_escape_string(trim($input['name'] ?? ''));
            $code      = strtoupper($conn->real_escape_string(trim($input['code'] ?? '')));
            $desc      = $conn->real_escape_string(trim($input['description'] ?? ''));
            $sectorId  = !empty($input['sector_id'])  ? (int)$input['sector_id']  : 'NULL';
            $managerId = !empty($input['manager_id']) ? (int)$input['manager_id'] : 'NULL';
            $active    = (int)($input['is_active'] ?? 1);
            if (!$id || !$name) jsonResponse(['success'=>false,'message'=>'بيانات ناقصة']);

            $conn->query("UPDATE departments SET
                name='$name', code=".($code?"'$code'":"NULL").",
                description=".($desc?"'$desc'":"NULL").",
                sector_id=$sectorId, manager_id=$managerId, is_active=$active
                WHERE id=$id");
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
            if ($conn->query("DELETE FROM departments WHERE id=$id"))
                jsonResponse(['success'=>true,'message'=>'تم الحذف']);
            else
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
            $code  = $conn->real_escape_string(strtolower(preg_replace('/[^a-z0-9_]/','',str_replace(' ','_',$input['code']??''))));
            $label = $conn->real_escape_string(trim($input['label'] ?? ''));
            $desc  = $conn->real_escape_string(trim($input['description'] ?? ''));
            $color = $conn->real_escape_string($input['color'] ?? '#6b7280');
            $order = (int)($input['sort_order'] ?? 99);
            if (!$code || !$label) jsonResponse(['success'=>false,'message'=>'الكود والاسم مطلوبان']);
            $conn->query("INSERT INTO permission_level_definitions (code,label,description,color,sort_order,is_system)
                VALUES ('$code','$label','$desc','$color',$order,0)");
            if ($conn->affected_rows > 0)
                jsonResponse(['success'=>true,'message'=>'تم الإضافة','id'=>$conn->insert_id]);
            else
                jsonResponse(['success'=>false,'message'=>'فشل أو الكود مستخدم: '.$conn->error]);
            break;

        case 'update_permission_level':
            if ($method !== 'POST') jsonResponse(['success'=>false,'message'=>'POST فقط'],405);
            $conn  = db();
            $input = json_decode(file_get_contents('php://input'), true) ?? [];
            $id    = (int)($input['id'] ?? 0);
            $label = $conn->real_escape_string(trim($input['label'] ?? ''));
            $desc  = $conn->real_escape_string(trim($input['description'] ?? ''));
            $color = $conn->real_escape_string($input['color'] ?? '#6b7280');
            $order = (int)($input['sort_order'] ?? 99);
            if (!$id || !$label) jsonResponse(['success'=>false,'message'=>'بيانات ناقصة']);
            $conn->query("UPDATE permission_level_definitions
                SET label='$label',description='$desc',color='$color',sort_order=$order WHERE id=$id");
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
            $conn->query("ALTER TABLE transaction_types ADD COLUMN IF NOT EXISTS parent_id INT DEFAULT NULL");
            $conn->query("ALTER TABLE transaction_types ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0");
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
            $conn->query("ALTER TABLE transaction_types ADD COLUMN IF NOT EXISTS parent_id INT DEFAULT NULL");
            $conn->query("ALTER TABLE transaction_types ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0");
            $name      = $conn->real_escape_string($input['name'] ?? '');
            $desc      = $conn->real_escape_string($input['description'] ?? '');
            $parentId  = !empty($input['parent_id']) ? (int)$input['parent_id'] : 'NULL';
            $sortOrder = (int)($input['sort_order'] ?? 0);
            $conn->query("INSERT INTO transaction_types (name,description,parent_id,sort_order)
                VALUES ('$name','$desc',$parentId,$sortOrder)");
            if ($conn->affected_rows > 0)
                jsonResponse(['success'=>true,'message'=>'تم الإضافة','id'=>$conn->insert_id]);
            else
                jsonResponse(['success'=>false,'message'=>'فشل: '.$conn->error], 500);
            break;

        case 'update_type':
            if ($method !== 'POST') jsonResponse(['success'=>false,'message'=>'POST فقط'],405);
            $input     = json_decode(file_get_contents('php://input'), true) ?? [];
            $conn      = db();
            $id        = (int)($input['id'] ?? 0);
            $name      = $conn->real_escape_string($input['name'] ?? '');
            $desc      = $conn->real_escape_string($input['description'] ?? '');
            $parentId  = !empty($input['parent_id']) ? (int)$input['parent_id'] : 'NULL';
            $sortOrder = (int)($input['sort_order'] ?? 0);
            $conn->query("UPDATE transaction_types SET name='$name',description='$desc',
                parent_id=$parentId,sort_order=$sortOrder WHERE id=$id");
            if ($conn->affected_rows >= 0)
                jsonResponse(['success'=>true,'message'=>'تم التحديث']);
            else
                jsonResponse(['success'=>false,'message'=>'فشل: '.$conn->error], 500);
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
            $conn = db();
            $out  = [];
            $out['php_version']     = PHP_VERSION;
            $out['server_software'] = $_SERVER['SERVER_SOFTWARE'] ?? 'Unknown';
            $out['memory_usage']    = memory_get_usage(true);
            $out['memory_peak']     = memory_get_peak_usage(true);
            $out['memory_limit']    = ini_get('memory_limit');
            $uploadsDir = dirname(__DIR__) . '/uploads';
            $uploadSize = 0; $uploadCount = 0;
            if (is_dir($uploadsDir)) {
                $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($uploadsDir, FilesystemIterator::SKIP_DOTS));
                foreach ($it as $f) { $uploadSize += $f->getSize(); $uploadCount++; }
            }
            $out['uploads_size']  = $uploadSize;
            $out['uploads_count'] = $uploadCount;
            $r = $conn->query("SELECT table_name, table_rows, data_length+index_length AS total_size
                FROM information_schema.TABLES WHERE table_schema=DATABASE() ORDER BY total_size DESC");
            $tables = []; $dbSize = 0;
            if ($r) while ($row = $r->fetch_assoc()) { $tables[] = $row; $dbSize += $row['total_size']; }
            $out['db_tables']      = $tables;
            $out['db_total_size']  = $dbSize;
            $out['db_table_count'] = count($tables);
            $out['mysql_version']  = $conn->query("SELECT VERSION() AS v")->fetch_assoc()['v'];
            $out['opcache_enabled']= function_exists('opcache_get_status');
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

                $levelCode = $conn->real_escape_string($body['permission_level'] ?? 'employee');
                $canDelete = !empty($body['can_delete']) ? 1 : 0;

                // ضمان وجود عمود permission_level_code
                $conn->query("ALTER TABLE employees ADD COLUMN IF NOT EXISTS permission_level_code VARCHAR(50) DEFAULT NULL");

                // ضمان توسيع ENUM قبل الحفظ
                @$conn->query("ALTER TABLE employees MODIFY COLUMN permission_level ENUM('system_admin','CEO','sector_head','division_manager','employee_l1','employee') NOT NULL DEFAULT 'employee'");
                $validLevels = ['system_admin','CEO','sector_head','division_manager','employee_l1','employee','manager'];
                // CEO يُحفظ مباشرة كـ 'CEO' في الـ ENUM
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
            // إنشاء الجدول تلقائياً إن لم يكن موجوداً
            $conn->query("CREATE TABLE IF NOT EXISTS system_settings (
                id            INT AUTO_INCREMENT PRIMARY KEY,
                setting_key   VARCHAR(100) NOT NULL,
                setting_value TEXT         NOT NULL DEFAULT '',
                UNIQUE KEY uq_key (setting_key)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

            $k = $conn->real_escape_string($key);
            $v = $conn->real_escape_string($val);
            $conn->query("INSERT INTO system_settings (setting_key, setting_value)
                          VALUES ('$k', '$v')
                          ON DUPLICATE KEY UPDATE setting_value = '$v'");

            if ($conn->errno) jsonResponse(['success'=>false,'message'=>$conn->error], 500);
            jsonResponse(['success' => true, 'message' => 'تم الحفظ']);
            break;
        }

        default:
            jsonResponse(['success'=>false,'message'=>'إجراء غير معروف: '.$action], 400);
    }

} catch (Exception $e) {
    jsonResponse(['success'=>false,'message'=>$e->getMessage()], 500);
}