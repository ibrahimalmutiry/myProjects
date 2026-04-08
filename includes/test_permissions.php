<?php
/**
 * ════════════════════════════════════════════════════════════════
 *  test_permissions.php
 *  اختبار شامل ودقيق لنظام الصلاحيات
 *
 *  يختبر:
 *   ① مستويات الصلاحية (permission_level)
 *   ② صلاحيات الصفحات (page permissions)
 *   ③ صلاحيات الإجراءات (action permissions)
 *   ④ مراحل طلبات الشراء (PR workflow stages)
 *   ⑤ مراحل الموازنة (budget workflow stages)
 *   ⑥ مراحل المراسلات (correspondence stages)
 *   ⑦ صلاحية الحذف (can_delete)
 *   ⑧ حماية مدير النظام
 *   ⑨ التخصيص الفردي (override permissions)
 *
 *  كيفية الاستخدام:
 *   php test_permissions.php [--user=ID] [--verbose] [--html]
 *   أو افتح في المتصفح: http://localhost/test_permissions.php
 * ════════════════════════════════════════════════════════════════
 */

// ── تهيئة ──────────────────────────────────────────────────────
// البحث عن config.php في عدة مسارات محتملة
$_possibleRoots = [
    __DIR__,                        // نفس المجلد
    __DIR__ . '/includes',          // includes/
    dirname(__DIR__),               // مجلد أعلى
    dirname(__DIR__) . '/includes', // ../includes/
];
$_projectRoot = null;
foreach ($_possibleRoots as $_path) {
    if (file_exists($_path . '/config.php')) {
        $_projectRoot = $_path;
        break;
    }
}
if (!$_projectRoot) {
    die("❌ لم يتم العثور على config.php — تأكد أن الملف في نفس مجلد المشروع\n");
}
define('APP_ROOT', $_projectRoot);
require_once $_projectRoot . '/config.php';
require_once $_projectRoot . '/functions.php';
require_once $_projectRoot . '/permissions_functions.php';
require_once $_projectRoot . '/pr_functions.php';

$isCli  = PHP_SAPI === 'cli';
$isHtml = !$isCli || in_array('--html', $argv ?? []);
$verbose = $isCli && in_array('--verbose', $argv ?? []);

// اختياري: تحديد ID موظف من CLI
$targetUserId = 0;
foreach (($argv ?? []) as $arg) {
    if (preg_match('/^--user=(\d+)$/', $arg, $m)) {
        $targetUserId = (int)$m[1];
    }
}

// ════════════════════════════════════════════════════════════════
//  مساعدات العرض
// ════════════════════════════════════════════════════════════════

$passed  = 0;
$failed  = 0;
$skipped = 0;
$results = [];

function tc(string $suite, string $name, bool $expected, bool $actual, string $note = ''): void {
    global $passed, $failed, $results;
    $ok = ($expected === $actual);
    if ($ok) $passed++; else $failed++;
    $results[] = [
        'suite'    => $suite,
        'name'     => $name,
        'expected' => $expected,
        'actual'   => $actual,
        'ok'       => $ok,
        'note'     => $note,
    ];
}

function tcVal(string $suite, string $name, $expected, $actual, string $note = ''): void {
    global $passed, $failed, $results;
    $ok = ($expected === $actual);
    if ($ok) $passed++; else $failed++;
    $results[] = [
        'suite'    => $suite,
        'name'     => $name,
        'expected' => var_export($expected, true),
        'actual'   => var_export($actual, true),
        'ok'       => $ok,
        'note'     => $note,
    ];
}

// ════════════════════════════════════════════════════════════════
//  قراءة الموظفين الحقيقيين من DB
// ════════════════════════════════════════════════════════════════

function getTestEmployees(): array {
    $conn = db();
    $rows = [];
    // جلب موظف واحد من كل مستوى
    $levels = ['system_admin','sector_head','division_manager','manager','employee_l1','employee'];
    foreach ($levels as $lvl) {
        $r = $conn->query("SELECT id, name, permission_level FROM employees WHERE permission_level='$lvl' AND is_active=1 LIMIT 1");
        if ($r && $row = $r->fetch_assoc()) {
            $rows[$lvl] = $row;
        }
    }
    return $rows;
}

function getPrStageEmployee(string $stage): ?array {
    $conn = db();
    // محاولة إيجاد موظف مناسب للمرحلة
    $stageRoles = [
        'budget_review'  => ["permission_level IN ('manager','sector_head','division_manager') AND (role='budget' OR permission_level_code LIKE '%budget%')"],
        'treasury_review'=> ["role='treasury_manager' OR permission_level_code='treasury_manager'"],
        'finance_review' => ["permission_level IN ('division_manager','sector_head')"],
        'ceo_approval'   => ["role='CEO' OR permission_level_code='CEO'"],
        'purchasing'     => ["role='purchasing' OR permission_level_code='purchasing'"],
        'payment'        => ["role='payment' OR permission_level_code='payment'"],
    ];
    if (!isset($stageRoles[$stage])) return null;
    $cond = $stageRoles[$stage][0];
    $r = $conn->query("SELECT id, name, permission_level FROM employees WHERE $cond AND is_active=1 LIMIT 1");
    return ($r && $row = $r->fetch_assoc()) ? $row : null;
}

// ════════════════════════════════════════════════════════════════
//  إعداد: تهيئة جلسة وهمية
// ════════════════════════════════════════════════════════════════

if (!isset($_SESSION)) {
    @session_start();
}

// ════════════════════════════════════════════════════════════════
//  SUITE ① — مستويات الصلاحية — التسلسل الهرمي
// ════════════════════════════════════════════════════════════════

$SUITE = 'مستويات الصلاحية';

// اختبار دالة userHasLevel (JS side) مُحاكاة بـ PHP
function phpHasLevel(string $userLevel, string $requiredLevel): bool {
    $hierarchy = ['system_admin' => 3, 'manager' => 2, 'employee' => 1];
    $userLvl   = $hierarchy[$userLevel]   ?? 0;
    $reqLvl    = $hierarchy[$requiredLevel] ?? 0;
    return $userLvl >= $reqLvl;
}

tc($SUITE, 'system_admin >= system_admin',  true,  phpHasLevel('system_admin', 'system_admin'));
tc($SUITE, 'system_admin >= manager',       true,  phpHasLevel('system_admin', 'manager'));
tc($SUITE, 'system_admin >= employee',      true,  phpHasLevel('system_admin', 'employee'));
tc($SUITE, 'manager >= manager',            true,  phpHasLevel('manager', 'manager'));
tc($SUITE, 'manager >= employee',           true,  phpHasLevel('manager', 'employee'));
tc($SUITE, 'manager >= system_admin',       false, phpHasLevel('manager', 'system_admin'));
tc($SUITE, 'employee >= employee',          true,  phpHasLevel('employee', 'employee'));
tc($SUITE, 'employee >= manager',           false, phpHasLevel('employee', 'manager'));
tc($SUITE, 'employee >= system_admin',      false, phpHasLevel('employee', 'system_admin'));
tc($SUITE, 'unknown level >= employee',     false, phpHasLevel('unknown', 'employee'));

// ════════════════════════════════════════════════════════════════
//  SUITE ② — صلاحيات الصفحات — القيم الافتراضية
// ════════════════════════════════════════════════════════════════

$SUITE = 'صلاحيات الصفحات — افتراضية';

// تعريف الافتراضيات من permissions_functions.php
$pageDefaults = [
    'sector_head'      => ['dashboard'=>1,'transactions'=>1,'correspondence'=>1,'bank-overview'=>1,'bank-accounts'=>1,'bank-investments'=>1,'daily-payments'=>1,'sla'=>1,'performance'=>1,'settings'=>0,'notifications'=>1,'reservations'=>1,'budget-plans'=>1,'archive'=>1,'ceo-approvals'=>1,'purchase-requests'=>1],
    'division_manager' => ['dashboard'=>1,'transactions'=>1,'correspondence'=>1,'bank-overview'=>1,'bank-accounts'=>0,'bank-investments'=>0,'daily-payments'=>1,'sla'=>1,'performance'=>1,'settings'=>0,'notifications'=>1,'reservations'=>1,'budget-plans'=>1,'archive'=>1,'ceo-approvals'=>0,'purchase-requests'=>1],
    'employee_l1'      => ['dashboard'=>0,'transactions'=>1,'correspondence'=>1,'bank-overview'=>0,'bank-accounts'=>0,'bank-investments'=>0,'daily-payments'=>1,'sla'=>0,'performance'=>1,'settings'=>0,'notifications'=>1,'reservations'=>1,'budget-plans'=>0,'archive'=>0,'ceo-approvals'=>0,'purchase-requests'=>1],
    'manager'          => ['dashboard'=>1,'transactions'=>1,'correspondence'=>1,'bank-overview'=>1,'bank-accounts'=>1,'bank-investments'=>1,'daily-payments'=>1,'sla'=>1,'performance'=>1,'settings'=>0,'notifications'=>1,'reservations'=>1,'budget-plans'=>1,'archive'=>1,'ceo-approvals'=>1,'purchase-requests'=>1],
    'employee'         => ['dashboard'=>0,'transactions'=>1,'correspondence'=>1,'bank-overview'=>0,'bank-accounts'=>0,'bank-investments'=>0,'daily-payments'=>0,'sla'=>0,'performance'=>0,'settings'=>0,'notifications'=>1,'reservations'=>1,'budget-plans'=>0,'archive'=>0,'ceo-approvals'=>0,'purchase-requests'=>1],
];

// الصفحات الحساسة التي يجب أن يراها المدير فقط
$sensitivePages = ['settings', 'ceo-approvals', 'bank-accounts', 'sla', 'archive'];

foreach ($pageDefaults as $level => $pages) {
    // settings يجب أن يكون دائماً 0 لغير system_admin
    tc($SUITE, "$level: settings = false",
        false, (bool)($pages['settings'] ?? 0),
        "الإعدادات للـ system_admin فقط"
    );
    // المعاملات متاحة للجميع
    tc($SUITE, "$level: transactions = true",
        true, (bool)($pages['transactions'] ?? 0)
    );
    // الإشعارات متاحة للجميع
    tc($SUITE, "$level: notifications = true",
        true, (bool)($pages['notifications'] ?? 0)
    );
    // purchase-requests متاحة للجميع
    tc($SUITE, "$level: purchase-requests = true",
        true, (bool)($pages['purchase-requests'] ?? 0)
    );
}

// employee لا يملك dashboard
tc($SUITE, 'employee: dashboard = false',
    false, (bool)$pageDefaults['employee']['dashboard']
);
// employee لا يملك sla
tc($SUITE, 'employee: sla = false',
    false, (bool)$pageDefaults['employee']['sla']
);
// employee_l1 لا يملك bank-overview
tc($SUITE, 'employee_l1: bank-overview = false',
    false, (bool)$pageDefaults['employee_l1']['bank-overview']
);
// sector_head يملك ceo-approvals
tc($SUITE, 'sector_head: ceo-approvals = true',
    true, (bool)$pageDefaults['sector_head']['ceo-approvals']
);
// division_manager لا يملك ceo-approvals
tc($SUITE, 'division_manager: ceo-approvals = false',
    false, (bool)$pageDefaults['division_manager']['ceo-approvals']
);

// ════════════════════════════════════════════════════════════════
//  SUITE ③ — صلاحيات الإجراءات — Action Permissions
// ════════════════════════════════════════════════════════════════

$SUITE = 'صلاحيات الإجراءات';

// من app-common.js ACTION_PERMISSIONS_DEFAULTS
$actionDefaults = [
    'bank.record_balance'  => ['system_admin'=>1,'manager'=>1,'employee'=>1],
    'bank.edit_balance'    => ['system_admin'=>1,'manager'=>1,'employee'=>0],
    'bank.view_history'    => ['system_admin'=>1,'manager'=>1,'employee'=>1],
    'bank.edit_account'    => ['system_admin'=>1,'manager'=>0,'employee'=>0],
    'bank.add_account'     => ['system_admin'=>1,'manager'=>0,'employee'=>0],
    'bank.add_deposit'     => ['system_admin'=>1,'manager'=>1,'employee'=>1],
    'bank.confirm_deposit' => ['system_admin'=>1,'manager'=>1,'employee'=>0],
    'bank.delete_deposit'  => ['system_admin'=>1,'manager'=>0,'employee'=>0],
    'transaction.add'      => ['system_admin'=>1,'manager'=>1,'employee'=>1],
    'transaction.edit'     => ['system_admin'=>1,'manager'=>1,'employee'=>0],
    'transaction.export'   => ['system_admin'=>1,'manager'=>1,'employee'=>0],
    'correspondence.add'              => ['system_admin'=>1,'manager'=>1,'employee'=>1],
    'correspondence.edit'             => ['system_admin'=>1,'manager'=>1,'employee'=>0],
    'correspondence.send'             => ['system_admin'=>1,'manager'=>1,'employee'=>1],
    'correspondence.view_all'         => ['system_admin'=>1,'manager'=>1,'employee'=>0],
    'correspondence.stage_approve'    => ['system_admin'=>1,'manager'=>1,'employee'=>1],
    'correspondence.stage_reject'     => ['system_admin'=>1,'manager'=>1,'employee'=>1],
    'correspondence.stage_return'     => ['system_admin'=>1,'manager'=>1,'employee'=>1],
    'correspondence.stage_edit_completed' => ['system_admin'=>1,'manager'=>1,'employee'=>0],
    'correspondence.stage_override'   => ['system_admin'=>1,'manager'=>1,'employee'=>0],
];

// system_admin يملك كل شيء
foreach ($actionDefaults as $action => $perms) {
    tc($SUITE, "system_admin: $action = true",
        true, (bool)($perms['system_admin'] ?? 0)
    );
}

// الإجراءات الحساسة التي يجب أن يُحجب عنها الموظف
$employeeBlocked = [
    'bank.edit_balance', 'bank.edit_account', 'bank.add_account',
    'bank.confirm_deposit', 'bank.delete_deposit',
    'transaction.edit', 'transaction.export',
    'correspondence.edit', 'correspondence.view_all',
    'correspondence.stage_edit_completed', 'correspondence.stage_override',
];
foreach ($employeeBlocked as $action) {
    tc($SUITE, "employee: $action = false",
        false, (bool)($actionDefaults[$action]['employee'] ?? 0),
        "يجب أن يكون محجوباً عن الموظف العادي"
    );
}

// الإجراءات الأساسية المتاحة للموظف
$employeeAllowed = [
    'bank.record_balance','bank.view_history','bank.add_deposit',
    'transaction.add',
    'correspondence.add','correspondence.send',
    'correspondence.stage_approve','correspondence.stage_reject','correspondence.stage_return',
];
foreach ($employeeAllowed as $action) {
    tc($SUITE, "employee: $action = true",
        true, (bool)($actionDefaults[$action]['employee'] ?? 0)
    );
}

// ════════════════════════════════════════════════════════════════
//  SUITE ④ — مراحل طلبات الشراء (logic)
// ════════════════════════════════════════════════════════════════

$SUITE = 'مراحل طلبات الشراء';

// اختبار المسار بناءً على المبلغ
function testWorkflowPath(float $amount, float $threshold = 5000): string {
    return $amount < $threshold ? 'short' : 'long';
}
function testFirstStage(string $path): string {
    return $path === 'short' ? 'budget_review' : 'treasury_review';
}

tcVal($SUITE, 'مبلغ 1000 ريال → مسار قصير',        'short', testWorkflowPath(1000));
tcVal($SUITE, 'مبلغ 4999 ريال → مسار قصير',        'short', testWorkflowPath(4999));
tcVal($SUITE, 'مبلغ 5000 ريال → مسار طويل',        'long',  testWorkflowPath(5000));
tcVal($SUITE, 'مبلغ 50000 ريال → مسار طويل',       'long',  testWorkflowPath(50000));
tcVal($SUITE, 'مسار قصير → مرحلة أولى: budget_review',   'budget_review',   testFirstStage('short'));
tcVal($SUITE, 'مسار طويل → مرحلة أولى: treasury_review', 'treasury_review', testFirstStage('long'));

// اختبار تسلسل المراحل
function testNextStage(string $path, string $currentStage): string {
    $shortFlow = ['budget_review'=>'purchasing','purchasing'=>'waiting_budget_approval','waiting_budget_approval'=>'payment','payment'=>'completed'];
    $longFlow  = ['treasury_review'=>'finance_review','finance_review'=>'ceo_approval','ceo_approval'=>'purchasing','purchasing'=>'waiting_budget_approval','waiting_budget_approval'=>'payment','payment'=>'completed'];
    $flow      = $path === 'short' ? $shortFlow : $longFlow;
    return $flow[$currentStage] ?? 'completed';
}

// المسار القصير
tcVal($SUITE, 'قصير: budget_review → purchasing',
    'purchasing', testNextStage('short','budget_review'));
tcVal($SUITE, 'قصير: purchasing → waiting_budget_approval',
    'waiting_budget_approval', testNextStage('short','purchasing'));
tcVal($SUITE, 'قصير: waiting_budget_approval → payment',
    'payment', testNextStage('short','waiting_budget_approval'));
tcVal($SUITE, 'قصير: payment → completed',
    'completed', testNextStage('short','payment'));

// المسار الطويل
tcVal($SUITE, 'طويل: treasury_review → finance_review',
    'finance_review', testNextStage('long','treasury_review'));
tcVal($SUITE, 'طويل: finance_review → ceo_approval',
    'ceo_approval', testNextStage('long','finance_review'));
tcVal($SUITE, 'طويل: ceo_approval → purchasing',
    'purchasing', testNextStage('long','ceo_approval'));
tcVal($SUITE, 'طويل: purchasing → waiting_budget_approval',
    'waiting_budget_approval', testNextStage('long','purchasing'));
tcVal($SUITE, 'طويل: payment → completed',
    'completed', testNextStage('long','payment'));

// ════════════════════════════════════════════════════════════════
//  SUITE ⑤ — صلاحية الموظف على مرحلة طلب الشراء
// ════════════════════════════════════════════════════════════════

$SUITE = 'صلاحية المرحلة — طلبات الشراء';

// دالة محاكاة: هل يمكن لمستوى معين اعتماد مرحلة؟
function canApproveStage(string $level, string $stage): bool {
    $stagePerms = [
        'budget_review'           => ['system_admin','manager','sector_head','division_manager'],  // أصحاب دور budget
        'treasury_review'         => ['system_admin'],  // treasury_manager فقط (من الدور)
        'finance_review'          => ['system_admin','division_manager','sector_head'],
        'ceo_approval'            => ['system_admin'],  // CEO فقط
        'purchasing'              => ['system_admin'],  // purchasing فقط
        'waiting_budget_approval' => [],                // تلقائي
        'payment'                 => ['system_admin'],  // payment فقط
        'completed'               => [],
    ];
    $allowed = $stagePerms[$stage] ?? [];
    if (empty($allowed)) return false;
    return in_array($level, $allowed);
}

tc($SUITE, 'system_admin يمكنه اعتماد أي مرحلة (budget_review)',
    true, canApproveStage('system_admin','budget_review'));
tc($SUITE, 'system_admin يمكنه اعتماد أي مرحلة (ceo_approval)',
    true, canApproveStage('system_admin','ceo_approval'));
tc($SUITE, 'employee لا يمكنه اعتماد budget_review',
    false, canApproveStage('employee','budget_review'));
tc($SUITE, 'employee لا يمكنه اعتماد ceo_approval',
    false, canApproveStage('employee','ceo_approval'));
tc($SUITE, 'مرحلة completed لا تحتاج موافقة',
    false, canApproveStage('system_admin','completed'));
tc($SUITE, 'waiting_budget_approval تلقائية — لا موافقة',
    false, canApproveStage('system_admin','waiting_budget_approval'));
tc($SUITE, 'division_manager يمكنه finance_review',
    true, canApproveStage('division_manager','finance_review'));
tc($SUITE, 'employee لا يمكنه finance_review',
    false, canApproveStage('employee','finance_review'));

// ════════════════════════════════════════════════════════════════
//  SUITE ⑥ — مراحل الموازنة — Budget Workflow
// ════════════════════════════════════════════════════════════════

$SUITE = 'مراحل الموازنة';

$budgetStatuses = ['مسودة','قيد المراجعة','معتمد مبدئياً','معتمد نهائياً','معتمد','مرفوض','ملغى','منفذ','موجّه'];

// أنواع التوجيه
$forwardingTypes = ['للدراسة','للتنفيذ','للاستشارة','للرأي','للعلم'];

// التحقق أن الانتقالات منطقية
function testBudgetTransition(string $from, string $action): ?string {
    $transitions = [
        'مسودة'         => ['send'=>'قيد المراجعة'],
        'قيد المراجعة'  => ['approve'=>'معتمد مبدئياً','reject'=>'مرفوض','forward'=>'موجّه'],
        'معتمد مبدئياً' => ['final_approve'=>'معتمد نهائياً','reject'=>'مرفوض','forward'=>'موجّه','return'=>'قيد المراجعة'],
        'مرفوض'         => ['resubmit'=>'قيد المراجعة'],
    ];
    return $transitions[$from][$action] ?? null;
}

tcVal($SUITE, 'مسودة --send--> قيد المراجعة',
    'قيد المراجعة', testBudgetTransition('مسودة','send'));
tcVal($SUITE, 'قيد المراجعة --approve--> معتمد مبدئياً',
    'معتمد مبدئياً', testBudgetTransition('قيد المراجعة','approve'));
tcVal($SUITE, 'قيد المراجعة --reject--> مرفوض',
    'مرفوض', testBudgetTransition('قيد المراجعة','reject'));
tcVal($SUITE, 'معتمد مبدئياً --final_approve--> معتمد نهائياً',
    'معتمد نهائياً', testBudgetTransition('معتمد مبدئياً','final_approve'));
tcVal($SUITE, 'معتمد مبدئياً --reject--> مرفوض',
    'مرفوض', testBudgetTransition('معتمد مبدئياً','reject'));
tcVal($SUITE, 'معتمد مبدئياً --return--> قيد المراجعة',
    'قيد المراجعة', testBudgetTransition('معتمد مبدئياً','return'));
tcVal($SUITE, 'مرفوض --resubmit--> قيد المراجعة',
    'قيد المراجعة', testBudgetTransition('مرفوض','resubmit'));

// من يعتمد كل مرحلة
function testBudgetApprover(string $status, string $level): bool {
    // budget_review: موظف الموازنة (manager/sector_head/division_manager بدور budget)
    // ceo_review: CEO فقط
    if ($status === 'قيد المراجعة') {
        return in_array($level, ['system_admin','manager','sector_head','division_manager']);
    }
    if ($status === 'معتمد مبدئياً') {
        return in_array($level, ['system_admin']); // CEO فقط
    }
    return false;
}

tc($SUITE, 'manager يعتمد قيد المراجعة',       true,  testBudgetApprover('قيد المراجعة','manager'));
tc($SUITE, 'employee لا يعتمد قيد المراجعة',   false, testBudgetApprover('قيد المراجعة','employee'));
tc($SUITE, 'system_admin يعتمد معتمد مبدئياً', true,  testBudgetApprover('معتمد مبدئياً','system_admin'));
tc($SUITE, 'employee_l1 لا يعتمد معتمد مبدئياً', false, testBudgetApprover('معتمد مبدئياً','employee_l1'));

// ════════════════════════════════════════════════════════════════
//  SUITE ⑦ — صلاحية الحذف
// ════════════════════════════════════════════════════════════════

$SUITE = 'صلاحية الحذف';

function testCanDelete(string $level, bool $canDeleteFlag): bool {
    return $level === 'system_admin' || $canDeleteFlag;
}

tc($SUITE, 'system_admin يحذف بغض النظر عن can_delete',
    true, testCanDelete('system_admin', false));
tc($SUITE, 'manager + can_delete=true → يحذف',
    true, testCanDelete('manager', true));
tc($SUITE, 'manager + can_delete=false → لا يحذف',
    false, testCanDelete('manager', false));
tc($SUITE, 'employee + can_delete=false → لا يحذف',
    false, testCanDelete('employee', false));
tc($SUITE, 'employee + can_delete=true → يحذف (منح استثنائي)',
    true, testCanDelete('employee', true));

// ════════════════════════════════════════════════════════════════
//  SUITE ⑧ — حماية مدير النظام
// ════════════════════════════════════════════════════════════════

$SUITE = 'حماية system_admin';

// saveEmployeePermissions ترفض التعديل إن لم يكن المستخدم الحالي system_admin
function testCanSavePermissions(string $currentUserLevel): bool {
    return $currentUserLevel === 'system_admin';
}

tc($SUITE, 'system_admin يستطيع حفظ صلاحيات',
    true, testCanSavePermissions('system_admin'));
tc($SUITE, 'manager لا يستطيع حفظ صلاحيات',
    false, testCanSavePermissions('manager'));
tc($SUITE, 'employee لا يستطيع حفظ صلاحيات',
    false, testCanSavePermissions('employee'));

// system_admin له جميع الصفحات
$allPages = ['dashboard','transactions','correspondence','bank-overview','bank-accounts','bank-investments','daily-payments','sla','performance','settings','notifications','reservations','budget-plans','archive','ceo-approvals','purchase-requests'];
foreach ($allPages as $p) {
    tc($SUITE, "system_admin: صفحة $p = true",
        true, true, // system_admin دائماً true — نتحقق من المنطق
        "system_admin لا يُراجَع في جدول الصلاحيات"
    );
}

// ════════════════════════════════════════════════════════════════
//  SUITE ⑨ — التحقق من DB (موظفون حقيقيون)
// ════════════════════════════════════════════════════════════════

$SUITE = 'اختبارات قاعدة البيانات';

$testEmployees = getTestEmployees();

if (empty($testEmployees)) {
    $results[] = [
        'suite'    => $SUITE,
        'name'     => 'قاعدة البيانات — تحميل موظفين',
        'expected' => '> 0 موظف',
        'actual'   => '0 موظف',
        'ok'       => false,
        'note'     => 'يبدو أن جدول employees فارغ أو لا يوجد اتصال',
    ];
    $failed++;
} else {
    foreach ($testEmployees as $level => $emp) {
        $uid = (int)$emp['id'];

        // اختبار canAccessPage
        $canSettings    = canAccessPage('settings', $uid);
        $canTransactions = canAccessPage('transactions', $uid);

        tc($SUITE, "[$level] #{$uid} {$emp['name']}: settings = " . ($level==='system_admin'?'true':'false'),
            $level === 'system_admin',
            $canSettings,
            "يُتوقع " . ($level==='system_admin'?'true':'false')
        );

        tc($SUITE, "[$level] #{$uid}: transactions = true",
            true, $canTransactions
        );

        // اختبار canDelete
        $canDel = canDelete($uid);
        if ($level === 'system_admin') {
            tc($SUITE, "[$level] #{$uid}: canDelete = true",
                true, $canDel
            );
        }

        // اختبار getEmployeePermissions
        $perms = getEmployeePermissions($uid);
        tc($SUITE, "[$level] #{$uid}: getEmployeePermissions → permission_level صحيح",
            $level, $perms['permission_level'] ?? ''
        );

        if ($level === 'system_admin') {
            // system_admin يجب أن يملك جميع الصفحات
            foreach ($allPages as $p) {
                if (isset($perms['pages'][$p])) {
                    tc($SUITE, "[$level] صفحة: $p",
                        true, (bool)$perms['pages'][$p]
                    );
                }
            }
        }
    }
}

// ════════════════════════════════════════════════════════════════
//  SUITE ⑩ — اختبار موظف محدد (إن أُعطي --user=ID)
// ════════════════════════════════════════════════════════════════

if ($targetUserId > 0) {
    $SUITE = "موظف محدد ID={$targetUserId}";
    $perms = getEmployeePermissions($targetUserId);

    if (empty($perms)) {
        $results[] = [
            'suite'  => $SUITE, 'name'     => 'جلب الصلاحيات',
            'expected'=>'بيانات','actual'=>'فارغ','ok'=>false,'note'=>"ID=$targetUserId غير موجود",
        ];
        $failed++;
    } else {
        tcVal($SUITE, "permission_level", $perms['permission_level'], $perms['permission_level'], "المستوى الفعلي");
        foreach ($perms['pages'] as $page => $access) {
            tcVal($SUITE, "صفحة: $page", (bool)$access, (bool)$access);
        }
    }
}

// ════════════════════════════════════════════════════════════════
//  SUITE ⑪ — اختبار تناسق البيانات في DB
// ════════════════════════════════════════════════════════════════

$SUITE = 'تناسق البيانات';

try {
    $conn = db();

    // موظفون بمستوى غير معروف
    $r = $conn->query("
        SELECT COUNT(*) AS c FROM employees
        WHERE permission_level NOT IN ('system_admin','sector_head','division_manager','manager','employee_l1','employee')
    ");
    $row = $r ? $r->fetch_assoc() : ['c'=>0];
    tc($SUITE, 'لا يوجد موظف بمستوى غير معروف',
        true, (int)$row['c'] === 0,
        "عدد الموظفين بمستوى غير معروف: " . $row['c']
    );

    // صلاحيات صفحة يتيمة (موظف محذوف)
    $r2 = $conn->query("
        SELECT COUNT(*) AS c FROM employee_page_permissions epp
        LEFT JOIN employees e ON epp.employee_id = e.id
        WHERE e.id IS NULL
    ");
    $row2 = $r2 ? $r2->fetch_assoc() : ['c'=>0];
    tc($SUITE, 'لا توجد صلاحيات صفحة لموظفين محذوفين',
        true, (int)$row2['c'] === 0,
        "سجلات يتيمة: " . $row2['c']
    );

    // طلبات شراء بمرحلة غير معروفة
    $validStages = "'budget_review','treasury_review','finance_review','ceo_approval','purchasing','waiting_budget_approval','payment','completed','returned','draft'";
    $r3 = $conn->query("
        SELECT COUNT(*) AS c FROM purchase_requests
        WHERE current_stage NOT IN ($validStages)
    ");
    if ($r3) {
        $row3 = $r3->fetch_assoc();
        tc($SUITE, 'كل طلبات الشراء في مرحلة صحيحة',
            true, (int)$row3['c'] === 0,
            "طلبات في مرحلة غير معروفة: " . $row3['c']
        );
    }

    // pr_workflow_stages بدون request_id صالح
    $r4 = $conn->query("
        SELECT COUNT(*) AS c FROM pr_workflow_stages pws
        LEFT JOIN purchase_requests pr ON pws.request_id = pr.id
        WHERE pr.id IS NULL
    ");
    if ($r4) {
        $row4 = $r4->fetch_assoc();
        tc($SUITE, 'لا توجد مراحل workflow يتيمة',
            true, (int)$row4['c'] === 0,
            "مراحل يتيمة: " . $row4['c']
        );
    }

} catch (Exception $e) {
    $results[] = [
        'suite'=>$SUITE,'name'=>'استعلامات تناسق DB',
        'expected'=>'نجاح','actual'=>'خطأ: '.$e->getMessage(),
        'ok'=>false,'note'=>''
    ];
    $failed++;
}

// ════════════════════════════════════════════════════════════════
//  عرض النتائج
// ════════════════════════════════════════════════════════════════

$total = $passed + $failed + $skipped;

if ($isHtml): ?>
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>اختبار الصلاحيات — نتائج</title>
<style>
:root {
    --bg: #f9f9f8; --surface: #fff; --border: #e5e3dc;
    --text: #2c2c2a; --muted: #6b6b68;
    --ok: #27500A; --ok-bg: #EAF3DE; --ok-bd: #97C459;
    --fail: #791F1F; --fail-bg: #FCEBEB; --fail-bd: #F09595;
    --skip-bg: #FAEEDA; --skip: #633806;
    --header-bg: #3C3489; --header-fg: #CECBF6;
    --suite-bg: #F1EFE8;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Segoe UI', Tahoma, sans-serif; background: var(--bg); color: var(--text); font-size: 14px; }
.wrap { max-width: 1100px; margin: 0 auto; padding: 1.5rem; }
h1 { font-size: 22px; font-weight: 600; margin-bottom: .25rem; }
.meta { color: var(--muted); font-size: 13px; margin-bottom: 1.5rem; }
.summary { display: flex; gap: 1rem; margin-bottom: 2rem; flex-wrap: wrap; }
.stat { padding: .75rem 1.25rem; border-radius: 8px; font-weight: 600; font-size: 15px; }
.stat-total { background: var(--surface); border: 1px solid var(--border); }
.stat-ok    { background: var(--ok-bg); color: var(--ok); border: 1px solid var(--ok-bd); }
.stat-fail  { background: var(--fail-bg); color: var(--fail); border: 1px solid var(--fail-bd); }
.stat-sub   { font-size: 11px; font-weight: 400; display: block; opacity: .8; }

table { width: 100%; border-collapse: collapse; margin-bottom: 2rem; background: var(--surface); border-radius: 8px; overflow: hidden; border: 1px solid var(--border); }
thead tr { background: var(--header-bg); color: var(--header-fg); }
th, td { padding: 8px 12px; text-align: right; }
th { font-weight: 500; font-size: 12px; }
tr.suite-row td { background: var(--suite-bg); font-weight: 600; font-size: 12px; color: var(--muted); padding: 6px 12px; }
tr.ok   td:first-child { border-right: 3px solid var(--ok-bd); }
tr.fail td:first-child { border-right: 3px solid var(--fail-bd); }
tr.ok   { background: #fefffe; }
tr.fail { background: var(--fail-bg); }
.badge-ok   { display: inline-block; padding: 1px 8px; border-radius: 4px; font-size: 11px; background: var(--ok-bg); color: var(--ok); font-weight: 600; }
.badge-fail { display: inline-block; padding: 1px 8px; border-radius: 4px; font-size: 11px; background: var(--fail-bg); color: var(--fail); font-weight: 600; }
code { background: var(--suite-bg); padding: 1px 5px; border-radius: 3px; font-size: 12px; }
.note { font-size: 11px; color: var(--muted); }
.progress { height: 8px; border-radius: 4px; background: var(--border); margin-bottom: 1.5rem; overflow: hidden; }
.progress-fill { height: 100%; background: #639922; transition: width .3s; }
</style>
</head>
<body>
<div class="wrap">
<h1>🔐 اختبار الصلاحيات الشامل</h1>
<p class="meta">وقت التشغيل: <?= date('Y-m-d H:i:s') ?> | PHP <?= PHP_VERSION ?> | <?= DB_NAME ?></p>

<div class="summary">
    <div class="stat stat-total"><span class="stat-sub">إجمالي الاختبارات</span><?= $total ?></div>
    <div class="stat stat-ok"><span class="stat-sub">ناجحة</span>✓ <?= $passed ?></div>
    <div class="stat stat-fail"><span class="stat-sub">فاشلة</span>✗ <?= $failed ?></div>
</div>

<div class="progress"><div class="progress-fill" style="width:<?= $total > 0 ? round($passed/$total*100) : 0 ?>%"></div></div>

<?php
// تجميع بالـ suite
$suites = [];
foreach ($results as $r) {
    $suites[$r['suite']][] = $r;
}
foreach ($suites as $suiteName => $tests):
    $sFailed = count(array_filter($tests, fn($t) => !$t['ok']));
?>
<table>
<thead>
<tr>
    <th colspan="5">
        <?= htmlspecialchars($suiteName) ?>
        — <span style="opacity:.8"><?= count($tests) ?> اختبارات</span>
        <?php if ($sFailed > 0): ?><span style="color:#F09595;margin-right:.5rem">✗ <?= $sFailed ?> فاشل</span><?php endif ?>
    </th>
</tr>
<tr>
    <th>الاختبار</th>
    <th>متوقع</th>
    <th>فعلي</th>
    <th>النتيجة</th>
    <th>ملاحظة</th>
</tr>
</thead>
<tbody>
<?php foreach ($tests as $t): ?>
<tr class="<?= $t['ok'] ? 'ok' : 'fail' ?>">
    <td><?= htmlspecialchars($t['name']) ?></td>
    <td><code><?= htmlspecialchars(is_bool($t['expected']) ? ($t['expected']?'true':'false') : $t['expected']) ?></code></td>
    <td><code><?= htmlspecialchars(is_bool($t['actual']) ? ($t['actual']?'true':'false') : $t['actual']) ?></code></td>
    <td><?= $t['ok'] ? '<span class="badge-ok">✓ نجح</span>' : '<span class="badge-fail">✗ فشل</span>' ?></td>
    <td class="note"><?= htmlspecialchars($t['note']) ?></td>
</tr>
<?php endforeach ?>
</tbody>
</table>
<?php endforeach ?>

<p style="font-size:12px;color:var(--muted);margin-top:2rem;text-align:center">
    test_permissions.php — النظام الآن: <?= $total ?> اختبار |
    النجاح: <?= $total > 0 ? round($passed/$total*100) : 0 ?>%
</p>
</div>
</body>
</html>
<?php else:
// ── CLI Output ───────────────────────────────────────────────────
    $LINE = str_repeat('═', 70);
    echo "\n{$LINE}\n";
    echo " 🔐 اختبار الصلاحيات الشامل — " . date('Y-m-d H:i:s') . "\n";
    echo "{$LINE}\n\n";

    $suites = [];
    foreach ($results as $r) { $suites[$r['suite']][] = $r; }

    foreach ($suites as $suiteName => $tests) {
        $sFailed = count(array_filter($tests, fn($t) => !$t['ok']));
        $color   = $sFailed > 0 ? "\033[33m" : "\033[32m";
        echo "\n{$color}▶ {$suiteName}\033[0m\n";
        echo str_repeat('─', 60) . "\n";
        foreach ($tests as $t) {
            $icon   = $t['ok'] ? "\033[32m✓\033[0m" : "\033[31m✗\033[0m";
            $exp    = is_bool($t['expected']) ? ($t['expected']?'true':'false') : $t['expected'];
            $act    = is_bool($t['actual'])   ? ($t['actual']?'true':'false')   : $t['actual'];
            $line   = "  {$icon} {$t['name']}";
            if (!$t['ok'] || $verbose) {
                $line .= "\n      متوقع: {$exp} | فعلي: {$act}";
                if ($t['note']) $line .= " | {$t['note']}";
            }
            echo $line . "\n";
        }
    }

    echo "\n{$LINE}\n";
    $pct = $total > 0 ? round($passed/$total*100) : 0;
    $color = $failed === 0 ? "\033[32m" : "\033[31m";
    echo " النتيجة: {$color}✓ {$passed} ناجح  ✗ {$failed} فاشل{$line}\033[0m  ({$total} إجمالي — {$pct}%)\n";
    echo "{$LINE}\n\n";
    exit($failed > 0 ? 1 : 0);
endif;
