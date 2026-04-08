<?php
/**
 * ملف تشخيص شامل — الأدوار والصلاحيات والموظفين والواجهة
 * diagnostic.php
 */
require_once __DIR__ . '/includes/functions.php';
$conn = db();

// ═══════════════════════════════════════════════════════
// جمع البيانات
// ═══════════════════════════════════════════════════════

// 1. بنية عمود permission_level
$colInfo = $conn->query("SHOW COLUMNS FROM employees WHERE Field='permission_level'")->fetch_assoc();

// 2. الموظفون كاملاً
$employees = [];
$r = $conn->query("
    SELECT e.id, e.name, e.role, e.permission_level, e.permission_level_code, e.can_delete,
           e.department_id, e.sector_id, e.division_id,
           d1.name AS department_name, d1.dept_type AS department_type,
           d2.name AS sector_name,
           d3.name AS division_name,
           pld.label AS perm_label, pld.color AS perm_color
    FROM employees e
    LEFT JOIN departments d1 ON d1.id = e.department_id
    LEFT JOIN departments d2 ON d2.id = e.sector_id
    LEFT JOIN departments d3 ON d3.id = e.division_id
    LEFT JOIN permission_level_definitions pld ON pld.code = e.permission_level
    WHERE e.is_active = 1
    ORDER BY e.permission_level, e.name
");
if ($r) while ($row = $r->fetch_assoc()) $employees[] = $row;

// 3. مستويات الصلاحية في DB
$permLevels = [];
$r2 = $conn->query("SELECT * FROM permission_level_definitions WHERE is_active=1 ORDER BY sort_order");
if ($r2) while ($row = $r2->fetch_assoc()) $permLevels[] = $row;

// 4. الأقسام والقطاعات
$departments = [];
$r3 = $conn->query("SELECT d.*, COUNT(e.id) AS emp_count FROM departments d LEFT JOIN employees e ON e.department_id=d.id OR e.sector_id=d.id GROUP BY d.id ORDER BY d.dept_type DESC, d.id");
if ($r3) while ($row = $r3->fetch_assoc()) $departments[] = $row;

// 5. توزيع الأدوار
$roleStats = [];
$r4 = $conn->query("SELECT role, permission_level, COUNT(*) AS cnt FROM employees WHERE is_active=1 GROUP BY role, permission_level ORDER BY cnt DESC");
if ($r4) while ($row = $r4->fetch_assoc()) $roleStats[] = $row;

// 6. مشاكل محتملة
$issues = [];
// موظفين بدور غير معروف
$r5 = $conn->query("SELECT id, name, role, permission_level FROM employees WHERE is_active=1 AND permission_level NOT IN (SELECT code FROM permission_level_definitions)");
if ($r5) while ($row = $r5->fetch_assoc()) $issues[] = ['type'=>'❌ صلاحية غير موجودة في التعريفات', 'data'=>$row];
// موظفين CEO بدون permission_level صحيح
$r6 = $conn->query("SELECT id, name, role, permission_level FROM employees WHERE role='CEO' AND permission_level NOT IN ('system_admin','CEO')");
if ($r6) while ($row = $r6->fetch_assoc()) $issues[] = ['type'=>'⚠️ CEO بصلاحية غير متوقعة', 'data'=>$row];
// موظفين بدون قطاع
$r7 = $conn->query("SELECT id, name, role FROM employees WHERE is_active=1 AND sector_id IS NULL AND department_id IS NULL");
if ($r7) while ($row = $r7->fetch_assoc()) $issues[] = ['type'=>'⚠️ موظف بدون قطاع أو قسم', 'data'=>$row];

// 7. فحص ملف JS - الأدوار المعرفة فيه
$jsFile = file_exists(__DIR__ . '/js/app-settings-employees.js') ? __DIR__ . '/js/app-settings-employees.js' : __DIR__ . '/app-settings-employees.js';
$jsContent = file_exists($jsFile) ? file_get_contents($jsFile) : '';
preg_match_all("/value:\s*'([^']+)',\s*label:\s*'([^']+)'/", $jsContent, $jsRoles);
$jsParsedRoles = array_combine($jsRoles[1], $jsRoles[2]);

// PERM_LEVELS fallback في JS
preg_match_all("/value:\s*'([^']+)',\s*code:\s*'([^']+)',\s*label:\s*'([^']+)'/", $jsContent, $jsPerms);

// ROLE_PERM_MAP
preg_match("/const ROLE_PERM_MAP\s*=\s*\{([^}]+)\}/s", $jsContent, $mapMatch);
$rolePermMapRaw = $mapMatch[1] ?? '';

// sector_head في SYSTEM_ROLES
$hasSectorHead = strpos($jsContent, "value: 'sector_head'") !== false;

// helpers
function badge($text, $color='#6b7280') {
    return "<span style='background:{$color}22;color:{$color};border:1px solid {$color}44;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600'>{$text}</span>";
}
function roleColor($role) {
    $map = ['admin'=>'#ef4444','CEO'=>'#8b5cf6','sector_head'=>'#7c3aed','system_admin'=>'#ef4444','division_manager'=>'#3b82f6','employee_l1'=>'#f59e0b','employee'=>'#22c55e','manager'=>'#3b82f6','receiver'=>'#3b82f6','budget'=>'#f59e0b','treasury_manager'=>'#0891b2','dispatch'=>'#10b981','payment'=>'#06b6d4','invoice'=>'#6366f1','purchasing'=>'#f97316'];
    return $map[$role] ?? '#6b7280';
}
?>
<!DOCTYPE html>
<html dir="rtl" lang="ar">

<head>
    <meta charset="UTF-8">
    <title>🔍 التشخيص الشامل — الأدوار والصلاحيات</title>
    <style>
    * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
    }

    body {
        font-family: 'Segoe UI', Tahoma, sans-serif;
        background: #0f172a;
        color: #e2e8f0;
        direction: rtl;
    }

    .page {
        max-width: 1400px;
        margin: 0 auto;
        padding: 24px;
    }

    h1 {
        font-size: 22px;
        font-weight: 700;
        color: #f8fafc;
        margin-bottom: 6px;
    }

    .subtitle {
        color: #94a3b8;
        font-size: 13px;
        margin-bottom: 28px;
    }

    .section {
        background: #1e293b;
        border-radius: 12px;
        padding: 20px;
        margin-bottom: 20px;
        border: 1px solid #334155;
    }

    .section-title {
        font-size: 15px;
        font-weight: 600;
        color: #f1f5f9;
        margin-bottom: 16px;
        display: flex;
        align-items: center;
        gap: 8px;
    }

    table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12.5px;
    }

    th {
        background: #0f172a;
        color: #94a3b8;
        font-weight: 600;
        padding: 9px 12px;
        text-align: right;
        border-bottom: 1px solid #334155;
    }

    td {
        padding: 9px 12px;
        border-bottom: 1px solid #1e293b;
        vertical-align: middle;
    }

    tr:hover td {
        background: #253347;
    }

    .badge {
        display: inline-block;
        padding: 2px 9px;
        border-radius: 20px;
        font-size: 11px;
        font-weight: 600;
    }

    .ok {
        color: #22c55e;
    }

    .warn {
        color: #f59e0b;
    }

    .err {
        color: #ef4444;
    }

    .grid2 {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
    }

    .grid3 {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 16px;
    }

    .stat-card {
        background: #0f172a;
        border-radius: 8px;
        padding: 14px;
        border: 1px solid #334155;
    }

    .stat-num {
        font-size: 28px;
        font-weight: 700;
        color: #38bdf8;
    }

    .stat-label {
        font-size: 12px;
        color: #64748b;
        margin-top: 2px;
    }

    .issue-row {
        background: #2d1f1f;
        border: 1px solid #7f1d1d44;
        border-radius: 8px;
        padding: 10px 14px;
        margin-bottom: 8px;
        font-size: 12.5px;
    }

    .issue-type {
        color: #fca5a5;
        font-weight: 600;
        margin-bottom: 4px;
    }

    .issue-data {
        color: #94a3b8;
        font-family: monospace;
    }

    .col-info {
        background: #0f172a;
        border-radius: 8px;
        padding: 12px 16px;
        font-family: monospace;
        font-size: 12px;
        color: #7dd3fc;
        border: 1px solid #334155;
    }

    .js-check {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 7px 0;
        border-bottom: 1px solid #1e293b;
        font-size: 12.5px;
    }

    .js-check:last-child {
        border-bottom: none;
    }

    .map-item {
        background: #0f172a;
        border-radius: 6px;
        padding: 6px 12px;
        margin: 3px;
        display: inline-block;
        font-size: 12px;
        font-family: monospace;
    }
    </style>
</head>

<body>
    <div class="page">

        <h1>🔍 التشخيص الشامل — الأدوار والصلاحيات والموظفين</h1>
        <div class="subtitle">تاريخ الفحص: <?= date('Y-m-d H:i:s') ?> | إجمالي الموظفين النشطين:
            <?= count($employees) ?></div>

        <!-- ① الإحصائيات السريعة -->
        <div class="grid3" style="margin-bottom:20px">
            <div class="stat-card">
                <div class="stat-num"><?= count($employees) ?></div>
                <div class="stat-label">👤 موظف نشط</div>
            </div>
            <div class="stat-card">
                <div class="stat-num"><?= count($permLevels) ?></div>
                <div class="stat-label">🔒 مستوى صلاحية معرّف</div>
            </div>
            <div class="stat-card">
                <div class="stat-num" style="color:<?= count($issues)>0?'#ef4444':'#22c55e' ?>"><?= count($issues) ?>
                </div>
                <div class="stat-label">⚠️ مشكلة مكتشفة</div>
            </div>
        </div>

        <!-- ② بنية عمود permission_level -->
        <div class="section">
            <div class="section-title">🗄️ بنية عمود <code>permission_level</code> في قاعدة البيانات</div>
            <div class="col-info">
                النوع: <b><?= htmlspecialchars($colInfo['Type'] ?? 'غير موجود') ?></b> &nbsp;|&nbsp;
                القيمة الافتراضية: <b><?= htmlspecialchars($colInfo['Default'] ?? 'NULL') ?></b> &nbsp;|&nbsp;
                يقبل NULL: <b><?= ($colInfo['Null'] ?? '') === 'YES' ? 'نعم' : 'لا' ?></b>
            </div>
            <?php
    // استخراج قيم ENUM إن وجدت
    if (isset($colInfo['Type']) && strpos($colInfo['Type'], 'enum') !== false) {
        preg_match_all("/'([^']+)'/", $colInfo['Type'], $enumVals);
        echo "<div style='margin-top:12px;font-size:12px;color:#f59e0b'>⚠️ العمود لا يزال ENUM — القيم المقبولة فقط: ";
        foreach ($enumVals[1] as $v) echo "<span class='map-item'>{$v}</span>";
        echo "</div>";
    } else {
        echo "<div style='margin-top:12px;font-size:12px;color:#22c55e'>✅ العمود VARCHAR — يقبل أي قيمة</div>";
    }
    ?>
        </div>

        <!-- ③ مستويات الصلاحية في DB -->
        <div class="section">
            <div class="section-title">🔒 مستويات الصلاحية المعرّفة في قاعدة البيانات</div>
            <table>
                <tr>
                    <th>#</th>
                    <th>الكود</th>
                    <th>الاسم</th>
                    <th>الترتيب</th>
                    <th>اللون</th>
                    <th>نظام</th>
                    <th>عدد الموظفين</th>
                </tr>
                <?php foreach ($permLevels as $pl):
            $cnt = count(array_filter($employees, fn($e) => $e['permission_level'] === $pl['code']));
        ?>
                <tr>
                    <td><?= $pl['id'] ?></td>
                    <td><code style="color:#7dd3fc"><?= htmlspecialchars($pl['code']) ?></code></td>
                    <td><?= htmlspecialchars($pl['label']) ?></td>
                    <td><?= $pl['sort_order'] ?></td>
                    <td><span
                            style="background:<?= $pl['color'] ?>;width:16px;height:16px;display:inline-block;border-radius:50%;vertical-align:middle"></span>
                        <?= $pl['color'] ?></td>
                    <td><?= $pl['is_system']=='1' ? '<span class="ok">✅ نعم</span>' : '—' ?></td>
                    <td><b><?= $cnt ?></b></td>
                </tr>
                <?php endforeach; ?>
            </table>
        </div>

        <!-- ④ فحص ملف JS -->
        <div class="section">
            <div class="section-title">📦 فحص ملف <code>app-settings-employees.js</code> <span
                    style="font-size:11px;color:#64748b">← <?php echo $jsFile; ?></span></div>
            <div class="grid2">
                <div>
                    <div style="font-size:12px;color:#94a3b8;margin-bottom:8px">الأدوار في SYSTEM_ROLES</div>
                    <?php foreach ($jsParsedRoles as $val => $label): ?>
                    <div class="js-check">
                        <span style="color:<?= roleColor($val) ?>">●</span>
                        <code style="color:#7dd3fc"><?= htmlspecialchars($val) ?></code>
                        <span style="color:#cbd5e1"><?= htmlspecialchars($label) ?></span>
                    </div>
                    <?php endforeach; ?>
                    <div class="js-check" style="margin-top:8px">
                        <?php if ($hasSectorHead): ?>
                        <span class="ok">✅ sector_head موجود في SYSTEM_ROLES</span>
                        <?php else: ?>
                        <span class="err">❌ sector_head غائب من SYSTEM_ROLES</span>
                        <?php endif; ?>
                    </div>
                </div>
                <div>
                    <div style="font-size:12px;color:#94a3b8;margin-bottom:8px">ROLE_PERM_MAP (الدور → الصلاحية)</div>
                    <?php
            preg_match_all("/(\w+):\s*'([^']+)'/", $rolePermMapRaw, $mapItems);
            foreach ($mapItems[1] as $i => $role):
                $perm = $mapItems[2][$i];
            ?>
                    <div class="js-check">
                        <code style="color:#f97316"><?= htmlspecialchars($role) ?></code>
                        <span style="color:#64748b">→</span>
                        <code style="color:#7dd3fc"><?= htmlspecialchars($perm) ?></code>
                        <?php
                // تحقق أن الصلاحية موجودة في DB
                $exists = in_array($perm, array_column($permLevels, 'code'));
                echo $exists ? '<span class="ok">✅</span>' : '<span class="err">❌ غير موجودة في DB</span>';
                ?>
                    </div>
                    <?php endforeach; ?>
                </div>
            </div>
        </div>

        <!-- ⑤ جدول الموظفين التفصيلي -->
        <div class="section">
            <div class="section-title">👥 جدول الموظفين التفصيلي (<?= count($employees) ?> موظف)</div>
            <table>
                <tr>
                    <th>#</th>
                    <th>الاسم</th>
                    <th>الدور (role)</th>
                    <th>الصلاحية (permission_level)</th>
                    <th>كود الصلاحية المخزن</th>
                    <th>القطاع</th>
                    <th>القسم</th>
                    <th>حذف</th>
                    <th>حالة</th>
                </tr>
                <?php foreach ($employees as $emp):
            $permInDb = in_array($emp['permission_level'], array_column($permLevels, 'code'));
            $status = $permInDb ? '<span class="ok">✅</span>' : '<span class="err">❌ صلاحية غير معروفة</span>';
            $permColor = $emp['perm_color'] ?? roleColor($emp['permission_level']);
        ?>
                <tr>
                    <td style="color:#64748b"><?= $emp['id'] ?></td>
                    <td><b><?= htmlspecialchars($emp['name']) ?></b></td>
                    <td>
                        <span class="badge"
                            style="background:<?= roleColor($emp['role']) ?>22;color:<?= roleColor($emp['role']) ?>;border:1px solid <?= roleColor($emp['role']) ?>44">
                            <?= htmlspecialchars($emp['role'] ?? '—') ?>
                        </span>
                    </td>
                    <td>
                        <span class="badge"
                            style="background:<?= $permColor ?>22;color:<?= $permColor ?>;border:1px solid <?= $permColor ?>44">
                            <?= htmlspecialchars($emp['permission_level'] ?? '—') ?>
                        </span>
                        <?php if ($emp['perm_label']): ?>
                        <div style="font-size:11px;color:#64748b;margin-top:3px">
                            <?= htmlspecialchars($emp['perm_label']) ?></div>
                        <?php endif; ?>
                    </td>
                    <td><code
                            style="font-size:11px;color:#94a3b8"><?= htmlspecialchars($emp['permission_level_code'] ?? '—') ?></code>
                    </td>
                    <td><?= htmlspecialchars($emp['sector_name'] ?? $emp['department_name'] ?? '—') ?></td>
                    <td><?= htmlspecialchars($emp['division_name'] ?? '—') ?></td>
                    <td><?= $emp['can_delete'] ? '<span class="ok">✅</span>' : '—' ?></td>
                    <td><?= $status ?></td>
                </tr>
                <?php endforeach; ?>
            </table>
        </div>

        <!-- ⑥ توزيع الأدوار والصلاحيات -->
        <div class="section">
            <div class="section-title">📊 توزيع الأدوار والصلاحيات</div>
            <table>
                <tr>
                    <th>الدور (role)</th>
                    <th>الصلاحية (permission_level)</th>
                    <th>العدد</th>
                    <th>الحالة</th>
                </tr>
                <?php foreach ($roleStats as $stat):
            $permExists = in_array($stat['permission_level'], array_column($permLevels, 'code'));
        ?>
                <tr>
                    <td><span class="badge"
                            style="background:<?= roleColor($stat['role']) ?>22;color:<?= roleColor($stat['role']) ?>"><?= htmlspecialchars($stat['role']) ?></span>
                    </td>
                    <td><span class="badge"
                            style="background:<?= roleColor($stat['permission_level']) ?>22;color:<?= roleColor($stat['permission_level']) ?>"><?= htmlspecialchars($stat['permission_level']) ?></span>
                    </td>
                    <td><b><?= $stat['cnt'] ?></b></td>
                    <td><?= $permExists ? '<span class="ok">✅ سليم</span>' : '<span class="err">❌ صلاحية غير معروفة</span>' ?>
                    </td>
                </tr>
                <?php endforeach; ?>
            </table>
        </div>

        <!-- ⑦ الأقسام والقطاعات -->
        <div class="section">
            <div class="section-title">🏢 هيكل الأقسام والقطاعات</div>
            <table>
                <tr>
                    <th>ID</th>
                    <th>الاسم</th>
                    <th>النوع</th>
                    <th>القطاع الأب</th>
                    <th>عدد الموظفين</th>
                </tr>
                <?php foreach ($departments as $dept):
            $typeColor = $dept['dept_type']==='sector' ? '#8b5cf6' : ($dept['dept_type']==='division' ? '#3b82f6' : '#10b981');
        ?>
                <tr>
                    <td style="color:#64748b"><?= $dept['id'] ?></td>
                    <td><b><?= htmlspecialchars($dept['name']) ?></b></td>
                    <td><span class="badge"
                            style="background:<?= $typeColor ?>22;color:<?= $typeColor ?>"><?= $dept['dept_type'] ?></span>
                    </td>
                    <td><?= $dept['parent_id'] ? '#'.$dept['parent_id'] : '—' ?></td>
                    <td><?= $dept['emp_count'] ?></td>
                </tr>
                <?php endforeach; ?>
            </table>
        </div>

        <!-- ⑧ المشاكل المكتشفة -->
        <div class="section">
            <div class="section-title">⚠️ المشاكل المكتشفة (<?= count($issues) ?>)</div>
            <?php if (empty($issues)): ?>
            <div style="color:#22c55e;font-size:14px;padding:12px 0">✅ لا توجد مشاكل — كل شيء سليم!</div>
            <?php else: foreach ($issues as $issue): ?>
            <div class="issue-row">
                <div class="issue-type"><?= $issue['type'] ?></div>
                <div class="issue-data">
                    ID: <?= $issue['data']['id'] ?> |
                    الاسم: <?= htmlspecialchars($issue['data']['name']) ?> |
                    الدور: <?= htmlspecialchars($issue['data']['role'] ?? '—') ?> |
                    الصلاحية: <?= htmlspecialchars($issue['data']['permission_level'] ?? '—') ?>
                </div>
            </div>
            <?php endforeach; endif; ?>
        </div>

        <!-- ⑨ SQL إصلاح سريع -->
        <?php if (!empty($issues)): ?>
        <div class="section">
            <div class="section-title">🔧 SQL إصلاح سريع</div>
            <pre
                style="background:#0f172a;padding:14px;border-radius:8px;font-size:12px;color:#7dd3fc;border:1px solid #334155;overflow-x:auto">-- إصلاح موظفي CEO
UPDATE employees SET permission_level='CEO', permission_level_code='CEO'
WHERE role='CEO' AND permission_level NOT IN ('system_admin','CEO');

-- إصلاح موظفي sector_head
UPDATE employees SET permission_level='sector_head', permission_level_code='sector_head'
WHERE role='sector_head' AND permission_level NOT IN ('system_admin','sector_head');

-- تحقق بعد الإصلاح
SELECT id, name, role, permission_level FROM employees WHERE is_active=1 ORDER BY role;</pre>
        </div>
        <?php endif; ?>

    </div>
</body>

</html>