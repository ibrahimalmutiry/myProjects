<?php
// ═══════════════════════════════════════════════════════════════
//  نظام الصلاحيات — ٣ طبقات متراكبة
//  ─────────────────────────────────────────────────────────────
//  الطبقة ١: الدور الإداري  (permission_level)
//  الطبقة ٢: القطاع         (sector_id من جدول departments)
//  الطبقة ٣: التخصيص الفردي (employee_page_permissions)
//  قاعدة الأولوية: طبقة ٣ > طبقة ٢ > طبقة ١
// ═══════════════════════════════════════════════════════════════

// ── ثوابت القطاعات ──────────────────────────────────────────────
if (!defined('SECTOR_FINANCE'))      define('SECTOR_FINANCE',       4);
if (!defined('SECTOR_CEO'))          define('SECTOR_CEO',           2);
if (!defined('SECTOR_SUPPLY_CHAIN')) define('SECTOR_SUPPLY_CHAIN',  6);

// أقسام الموازنة — من يعتمد مراجعة الموازنة
if (!defined('DEPT_BUDGET_IDS'))   define('DEPT_BUDGET_IDS',   [33, 34]);
if (!defined('DEPT_TREASURY_IDS')) define('DEPT_TREASURY_IDS', [39, 40]);
if (!defined('DEPT_PAYMENT_IDS'))  define('DEPT_PAYMENT_IDS',  [36, 37, 38]);

// ── الأدوار الإدارية الخمسة ─────────────────────────────────────
if (!defined('ROLE_SYSTEM_ADMIN'))     define('ROLE_SYSTEM_ADMIN',     'system_admin');
if (!defined('ROLE_CEO'))              define('ROLE_CEO',               'CEO');
if (!defined('ROLE_SECTOR_HEAD'))      define('ROLE_SECTOR_HEAD',       'sector_head');
if (!defined('ROLE_DIVISION_MANAGER')) define('ROLE_DIVISION_MANAGER',  'division_manager');
if (!defined('ROLE_EMPLOYEE'))         define('ROLE_EMPLOYEE',          'employee');

// ── قائمة الصفحات ───────────────────────────────────────────────
if (!defined('ALL_PAGES')) define('ALL_PAGES', [
    'dashboard','transactions','correspondence',
    'bank-overview','bank-accounts','bank-investments',
    'daily-payments','sla','performance','settings',
    'notifications','reservations','budget-plans',
    'archive','ceo-approvals','purchase-requests',
    'sample-warehouse','samples',
]);

// ════════════════════════════════════════════════════════════════
//  دالة مساعد: جلب بيانات الموظف مع sector_id
// ════════════════════════════════════════════════════════════════
function _getEmployeeData(int $userId): ?array {
    $conn = db();
    $r = $conn->query("
        SELECT e.id, e.permission_level, e.can_delete, e.department_id,
               d.parent_id, d.dept_type,
               COALESCE(
                   d.sector_id,
                   IF(d.dept_type='sector', d.id, d.parent_id)
               ) AS sector_id
        FROM employees e
        LEFT JOIN departments d ON d.id = e.department_id
        WHERE e.id = $userId LIMIT 1
    ");
    if (!$r || !($row = $r->fetch_assoc())) return null;
    $row['sector_id'] = $row['sector_id'] ? (int)$row['sector_id'] : null;
    return $row;
}

// ════════════════════════════════════════════════════════════════
//  الطبقة ١: الافتراضيات حسب الدور
// ════════════════════════════════════════════════════════════════
function _getDefaultsByRole(string $level): array {
    $map = [
        'system_admin' => array_fill_keys(ALL_PAGES, true),
        'CEO' => [
            'dashboard'=>1,'transactions'=>1,'correspondence'=>1,
            'bank-overview'=>1,'bank-accounts'=>1,'bank-investments'=>1,
            'daily-payments'=>1,'sla'=>1,'performance'=>1,'settings'=>0,
            'notifications'=>1,'reservations'=>1,'budget-plans'=>1,
            'archive'=>1,'ceo-approvals'=>1,'purchase-requests'=>1,
            'sample-warehouse'=>1,'samples'=>1,
        ],
        'sector_head' => [
            'dashboard'=>1,'transactions'=>1,'correspondence'=>1,
            'bank-overview'=>1,'bank-accounts'=>1,'bank-investments'=>1,
            'daily-payments'=>1,'sla'=>1,'performance'=>1,'settings'=>0,
            'notifications'=>1,'reservations'=>1,'budget-plans'=>1,
            'archive'=>1,'ceo-approvals'=>1,'purchase-requests'=>1,
            'sample-warehouse'=>1,'samples'=>1,
        ],
        'division_manager' => [
            'dashboard'=>1,'transactions'=>1,'correspondence'=>1,
            'bank-overview'=>1,'bank-accounts'=>0,'bank-investments'=>0,
            'daily-payments'=>1,'sla'=>1,'performance'=>1,'settings'=>0,
            'notifications'=>1,'reservations'=>1,'budget-plans'=>1,
            'archive'=>1,'ceo-approvals'=>0,'purchase-requests'=>1,
            'sample-warehouse'=>1,'samples'=>1,
        ],
        'employee' => [
            'dashboard'=>0,'transactions'=>1,'correspondence'=>1,
            'bank-overview'=>0,'bank-accounts'=>0,'bank-investments'=>0,
            'daily-payments'=>0,'sla'=>0,'performance'=>0,'settings'=>0,
            'notifications'=>1,'reservations'=>1,'budget-plans'=>0,
            'archive'=>0,'ceo-approvals'=>0,'purchase-requests'=>1,
            'sample-warehouse'=>1,'samples'=>1,
        ],
    ];
    // توافق مع الأسماء القديمة
    $map['manager']     = $map['sector_head'];
    $map['employee_l1'] = $map['employee'];

    $raw = $map[$level] ?? $map['employee'];
    return array_map('boolval', $raw);
}

// ════════════════════════════════════════════════════════════════
//  الطبقة ٢: توسيع الصلاحيات بناءً على القطاع
// ════════════════════════════════════════════════════════════════
function _applySectorLayer(array $pages, ?int $sectorId): array {
    if (!$sectorId) return $pages;
    switch ($sectorId) {
        case SECTOR_FINANCE:
            foreach (['dashboard','transactions','purchase-requests','budget-plans',
                      'daily-payments','bank-overview','sla','archive',
                      'correspondence','notifications','reservations','performance','samples'] as $p) {
                $pages[$p] = true;
            }
            break;
        case SECTOR_CEO:
            foreach (ALL_PAGES as $p) {
                if ($p !== 'settings') $pages[$p] = true;
            }
            break;
        case SECTOR_SUPPLY_CHAIN:
            foreach (['purchase-requests','transactions','correspondence','notifications','samples'] as $p) {
                $pages[$p] = true;
            }
            break;
        // ── قطاعات سير عمل العينات (Sample Tracking Workflow) ──
        // 3=التجاري · 7=العمليات · 8=الجودة · 9=الإنتاج (من جدول departments)
        case 3: case 7: case 8: case 9:
            foreach (['dashboard','samples','notifications','correspondence'] as $p) {
                $pages[$p] = true;
            }
            break;
    }
    return $pages;
}

// ════════════════════════════════════════════════════════════════
//  الطبقة ٣: التخصيص الفردي
// ════════════════════════════════════════════════════════════════
function _applyIndividualLayer(array $pages, int $userId): array {
    $conn = db();
    $r = $conn->query("SELECT page, can_access FROM employee_page_permissions WHERE employee_id=$userId");
    if ($r) while ($row = $r->fetch_assoc()) $pages[$row['page']] = (bool)$row['can_access'];
    return $pages;
}

// ════════════════════════════════════════════════════════════════
//  الدالة الرئيسية: حساب الصلاحيات الفعلية
// ════════════════════════════════════════════════════════════════
function computeEmployeePermissions(int $userId): array {
    $emp = _getEmployeeData($userId);
    if (!$emp) return [];

    $level    = $emp['permission_level'];
    $sectorId = $emp['sector_id'];

    if ($level === ROLE_SYSTEM_ADMIN) {
        return [
            'permission_level' => $level,
            'sector_id'        => $sectorId,
            'can_delete'       => true,
            'pages'            => array_fill_keys(ALL_PAGES, true),
        ];
    }

    $pages = _getDefaultsByRole($level);
    $pages = _applySectorLayer($pages, $sectorId);
    $pages = _applyIndividualLayer($pages, $userId);

    return [
        'permission_level' => $level,
        'sector_id'        => $sectorId,
        'can_delete'       => (bool)$emp['can_delete'],
        'pages'            => $pages,
    ];
}

// ════════════════════════════════════════════════════════════════
//  دوال مراحل سير العمل (بدون role القديم)
// ════════════════════════════════════════════════════════════════
function canApproveBudgetReview(int $userId): bool {
    $emp = _getEmployeeData($userId);
    if (!$emp) return false;
    if ($emp['permission_level'] === ROLE_SYSTEM_ADMIN) return true;
    return $emp['sector_id'] === SECTOR_FINANCE
        && in_array((int)$emp['department_id'], DEPT_BUDGET_IDS);
}

function canApproveTreasuryReview(int $userId): bool {
    $emp = _getEmployeeData($userId);
    if (!$emp) return false;
    if ($emp['permission_level'] === ROLE_SYSTEM_ADMIN) return true;
    return $emp['sector_id'] === SECTOR_FINANCE
        && in_array((int)$emp['department_id'], DEPT_TREASURY_IDS);
}

function canApprovePayment(int $userId): bool {
    $emp = _getEmployeeData($userId);
    if (!$emp) return false;
    if ($emp['permission_level'] === ROLE_SYSTEM_ADMIN) return true;
    return $emp['sector_id'] === SECTOR_FINANCE
        && in_array((int)$emp['department_id'], DEPT_PAYMENT_IDS);
}

function canApprovePurchasing(int $userId): bool {
    $emp = _getEmployeeData($userId);
    if (!$emp) return false;
    if ($emp['permission_level'] === ROLE_SYSTEM_ADMIN) return true;
    return $emp['sector_id'] === SECTOR_SUPPLY_CHAIN;
}

function canApproveCeo(int $userId): bool {
    $emp = _getEmployeeData($userId);
    if (!$emp) return false;
    return in_array($emp['permission_level'], [ROLE_SYSTEM_ADMIN, ROLE_CEO]);
}

/**
 * جلب معرفات المستلمين لكل مرحلة (للإشعارات)
 */
function getStageRecipientIds(string $stage): array {
    $conn = db();
    $ids  = [];

    switch ($stage) {
        case 'budget_review':
        case 'waiting_budget_approval':
            $dids = implode(',', DEPT_BUDGET_IDS);
            $r = $conn->query("SELECT id FROM employees WHERE department_id IN ($dids) AND is_active=1");
            break;
        case 'treasury_review':
            $dids = implode(',', DEPT_TREASURY_IDS);
            $r = $conn->query("SELECT id FROM employees WHERE department_id IN ($dids) AND is_active=1");
            break;
        case 'finance_review':
            $s = SECTOR_FINANCE;
            $r = $conn->query("
                SELECT e.id FROM employees e
                JOIN departments d ON d.id=e.department_id
                WHERE (d.sector_id=$s OR d.parent_id=$s)
                  AND e.permission_level IN ('division_manager','sector_head','CEO','system_admin')
                  AND e.is_active=1
            ");
            break;
        case 'ceo_approval':
            $r = $conn->query("SELECT id FROM employees WHERE permission_level IN ('CEO','system_admin') AND is_active=1 LIMIT 3");
            break;
        case 'purchasing':
            $s = SECTOR_SUPPLY_CHAIN;
            $r = $conn->query("
                SELECT e.id FROM employees e
                JOIN departments d ON d.id=e.department_id
                WHERE (d.sector_id=$s OR d.parent_id=$s)
                  AND e.permission_level IN ('division_manager','sector_head','system_admin')
                  AND e.is_active=1
            ");
            break;
        case 'payment':
            $dids = implode(',', DEPT_PAYMENT_IDS);
            $r = $conn->query("SELECT id FROM employees WHERE department_id IN ($dids) AND is_active=1");
            break;
        default:
            $r = null;
    }

    if ($r) while ($row = $r->fetch_assoc()) $ids[] = (int)$row['id'];

    if (empty($ids)) {
        $fb = $conn->query("SELECT id FROM employees WHERE permission_level='system_admin' AND is_active=1 LIMIT 2");
        if ($fb) while ($row = $fb->fetch_assoc()) $ids[] = (int)$row['id'];
    }

    return array_unique($ids);
}

// ════════════════════════════════════════════════════════════════
//  واجهات متوافقة مع الكود القديم
// ════════════════════════════════════════════════════════════════
function canAccessPage(string $page, int $userId = 0): bool {
    if (!$userId) $userId = (int)($_SESSION['user_id'] ?? 0);
    if (!$userId) return false;
    $perms = computeEmployeePermissions($userId);
    if (empty($perms)) return false;
    if ($perms['permission_level'] === ROLE_SYSTEM_ADMIN) return true;
    return (bool)($perms['pages'][$page] ?? false);
}

function canDelete(int $userId = 0): bool {
    if (!$userId) $userId = (int)($_SESSION['user_id'] ?? 0);
    if (!$userId) return false;
    $conn = db();
    $r = $conn->query("SELECT permission_level, can_delete FROM employees WHERE id=$userId LIMIT 1");
    if (!$r || !($row = $r->fetch_assoc())) return false;
    return $row['permission_level'] === ROLE_SYSTEM_ADMIN || (bool)$row['can_delete'];
}

function getEmployeePermissions(int $userId): array {
    return computeEmployeePermissions($userId);
}

/**
 * حفظ الصلاحيات — مع دعم reset_to_default (جديد)
 */
function saveEmployeePermissions(int $userId, array $data): bool {
    $currentUserLevel = $_SESSION['permission_level'] ?? 'employee';
    if ($currentUserLevel !== ROLE_SYSTEM_ADMIN) return false;

    $conn   = db();
    $userId = (int)$userId;
    $level  = $conn->real_escape_string($data['permission_level'] ?? ROLE_EMPLOYEE);
    $canDel = !empty($data['can_delete']) ? 1 : 0;

    $conn->query("UPDATE employees SET permission_level='$level', can_delete=$canDel WHERE id=$userId");

    // إعادة الضبط للافتراضي → احذف التخصيصات فقط
    if (!empty($data['reset_to_default'])) {
        $conn->query("DELETE FROM employee_page_permissions WHERE employee_id=$userId");
        return true;
    }

    if (isset($data['pages']) && is_array($data['pages'])) {
        $conn->query("DELETE FROM employee_page_permissions WHERE employee_id=$userId");
        foreach ($data['pages'] as $page => $access) {
            $page   = $conn->real_escape_string($page);
            $access = $access ? 1 : 0;
            $conn->query("
                INSERT INTO employee_page_permissions (employee_id, page, can_access)
                VALUES ($userId, '$page', $access)
                ON DUPLICATE KEY UPDATE can_access=$access
            ");
        }
    }
    return true;
}

function loadUserPermissionsToSession(int $userId): void {
    $perms = computeEmployeePermissions($userId);
    if (empty($perms)) return;
    $_SESSION['permission_level'] = $perms['permission_level'];
    $_SESSION['can_delete']       = $perms['can_delete'];
    $_SESSION['page_permissions'] = $perms['pages'];
    $_SESSION['sector_id']        = $perms['sector_id'] ?? null;
}

function getDefaultPermissionsForRole(string $level, ?int $sectorId = null): array {
    $pages = _getDefaultsByRole($level);
    if ($sectorId) $pages = _applySectorLayer($pages, $sectorId);
    return $pages;
}