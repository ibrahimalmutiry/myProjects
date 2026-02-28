<?php
// ═══════════════════════════════════════════════════════════════
//  نظام الصلاحيات — يُضاف في نهاية functions.php
// ═══════════════════════════════════════════════════════════════

/**
 * التحقق من صلاحية الوصول لصفحة معينة
 *
 * @param string $page   اسم الصفحة (dashboard, transactions, ...)
 * @param int    $userId معرف المستخدم (الجلسة افتراضياً)
 * @return bool
 */
function canAccessPage(string $page, int $userId = 0): bool {
    if (!$userId) {
        $userId = (int)($_SESSION['user_id'] ?? 0);
    }
    if (!$userId) return false;

    $conn = db();
    $userId = (int)$userId;

    // جلب مستوى الصلاحية
    $r = $conn->query("SELECT permission_level FROM employees WHERE id = $userId LIMIT 1");
    if (!$r || !($row = $r->fetch_assoc())) return false;

    // مدير النظام: دائماً true
    if ($row['permission_level'] === 'system_admin') return true;

    // التحقق من جدول الصلاحيات الفردية
    $page = $conn->real_escape_string($page);
    $r2 = $conn->query("
        SELECT can_access
        FROM employee_page_permissions
        WHERE employee_id = $userId AND page = '$page'
        LIMIT 1
    ");

    if ($r2 && ($perm = $r2->fetch_assoc())) {
        return (bool)$perm['can_access'];
    }

    // لا يوجد سجل → افتراضي حسب المستوى
    $defaults = [
        'manager'  => ['dashboard','transactions','correspondence','bank-deposits','sla','performance','notifications'],
        'employee' => ['transactions','correspondence','bank-deposits','notifications'],
    ];

    $level = $row['permission_level'];
    $allowed = $defaults[$level] ?? [];
    return in_array($page, $allowed);
}

/**
 * التحقق من صلاحية الحذف
 */
function canDelete(int $userId = 0): bool {
    if (!$userId) $userId = (int)($_SESSION['user_id'] ?? 0);
    if (!$userId) return false;

    $conn  = db();
    $userId = (int)$userId;
    $r = $conn->query("SELECT permission_level, can_delete FROM employees WHERE id = $userId LIMIT 1");
    if (!$r || !($row = $r->fetch_assoc())) return false;

    return $row['permission_level'] === 'system_admin' || (bool)$row['can_delete'];
}

/**
 * جلب صلاحيات موظف واحد (للـ API)
 *
 * @return array { permission_level, can_delete, pages: { page => bool } }
 */
function getEmployeePermissions(int $userId): array {
    $conn   = db();
    $userId = (int)$userId;

    $r = $conn->query("
        SELECT permission_level, can_delete
        FROM employees WHERE id = $userId LIMIT 1
    ");
    if (!$r || !($row = $r->fetch_assoc())) return [];

    $pages = [];
    $allPages = ['dashboard','transactions','correspondence','bank-deposits','sla','performance','settings','notifications','reservations'];

    if ($row['permission_level'] === 'system_admin') {
        foreach ($allPages as $p) $pages[$p] = true;
    } else {
        // القيم المخزنة
        $r2 = $conn->query("
            SELECT page, can_access
            FROM employee_page_permissions
            WHERE employee_id = $userId
        ");
        $stored = [];
        if ($r2) {
            while ($pr = $r2->fetch_assoc()) {
                $stored[$pr['page']] = (bool)$pr['can_access'];
            }
        }

        // دمج مع الافتراضيات
        $defaults = [
            'manager'  => ['dashboard'=>1,'transactions'=>1,'correspondence'=>1,'bank-deposits'=>1,'sla'=>1,'performance'=>1,'settings'=>0,'notifications'=>1,'reservations'=>1],
            'employee' => ['dashboard'=>0,'transactions'=>1,'correspondence'=>1,'bank-deposits'=>1,'sla'=>0,'performance'=>0,'settings'=>0,'notifications'=>1,'reservations'=>1],
        ];
        $def = $defaults[$row['permission_level']] ?? [];

        foreach ($allPages as $p) {
            if (isset($stored[$p])) {
                $pages[$p] = $stored[$p];
            } elseif (isset($def[$p])) {
                $pages[$p] = (bool)$def[$p];
            } else {
                $pages[$p] = false;
            }
        }
    }

    return [
        'permission_level' => $row['permission_level'],
        'can_delete'       => (bool)$row['can_delete'],
        'pages'            => $pages,
    ];
}

/**
 * حفظ صلاحيات موظف (من لوحة الإعدادات)
 * $data = [
 *   'permission_level' => 'manager'|'employee'|'system_admin',
 *   'can_delete'       => bool,
 *   'pages'            => ['dashboard' => bool, ...]
 * ]
 */
function saveEmployeePermissions(int $userId, array $data): bool {
    // مدير النظام لا يمكن تعديل صلاحياته إلا من system_admin آخر
    $currentUserLevel = $_SESSION['permission_level'] ?? 'employee';
    if ($currentUserLevel !== 'system_admin') return false;

    $conn   = db();
    $userId = (int)$userId;

    // تحديث المستوى وصلاحية الحذف
    $level     = $conn->real_escape_string($data['permission_level'] ?? 'employee');
    $canDelete = isset($data['can_delete']) && $data['can_delete'] ? 1 : 0;

    $conn->query("
        UPDATE employees
        SET permission_level = '$level',
            can_delete = $canDelete
        WHERE id = $userId
    ");

    // حذف الصلاحيات القديمة وإعادة الإدراج
    if (isset($data['pages']) && is_array($data['pages'])) {
        $conn->query("DELETE FROM employee_page_permissions WHERE employee_id = $userId");

        foreach ($data['pages'] as $page => $access) {
            $page   = $conn->real_escape_string($page);
            $access = $access ? 1 : 0;
            $conn->query("
                INSERT INTO employee_page_permissions (employee_id, page, can_access)
                VALUES ($userId, '$page', $access)
                ON DUPLICATE KEY UPDATE can_access = $access
            ");
        }
    }

    return true;
}

/**
 * جلب صلاحيات المستخدم الحالي وحقنها في الجلسة
 * يُستدعى بعد تسجيل الدخول
 */
function loadUserPermissionsToSession(int $userId): void {
    $conn   = db();
    $userId = (int)$userId;

    $r = $conn->query("
        SELECT permission_level, can_delete
        FROM employees WHERE id = $userId LIMIT 1
    ");
    if (!$r || !($row = $r->fetch_assoc())) return;

    $_SESSION['permission_level'] = $row['permission_level'];
    $_SESSION['can_delete']       = (bool)$row['can_delete'];

    // تحميل صلاحيات الصفحات
    $allPages = ['dashboard','transactions','correspondence','bank-deposits','sla','performance','settings','notifications','reservations'];
    $pagePerms = [];

    if ($row['permission_level'] === 'system_admin') {
        foreach ($allPages as $p) $pagePerms[$p] = true;
    } else {
        $r2 = $conn->query("
            SELECT page, can_access
            FROM employee_page_permissions
            WHERE employee_id = $userId
        ");
        $stored = [];
        if ($r2) {
            while ($pr = $r2->fetch_assoc()) {
                $stored[$pr['page']] = (bool)$pr['can_access'];
            }
        }

        $defaults = [
            'manager'  => ['dashboard'=>1,'transactions'=>1,'correspondence'=>1,'bank-deposits'=>1,'sla'=>1,'performance'=>1,'settings'=>0,'notifications'=>1,'reservations'=>1],
            'employee' => ['dashboard'=>0,'transactions'=>1,'correspondence'=>1,'bank-deposits'=>1,'sla'=>0,'performance'=>0,'settings'=>0,'notifications'=>1,'reservations'=>1],
        ];
        $def = $defaults[$row['permission_level']] ?? [];

        foreach ($allPages as $p) {
            $pagePerms[$p] = isset($stored[$p]) ? $stored[$p] : ((bool)($def[$p] ?? false));
        }
    }

    $_SESSION['page_permissions'] = $pagePerms;
}