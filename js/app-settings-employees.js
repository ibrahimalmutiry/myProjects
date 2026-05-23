async function openAddEmployeeModal() {
    await openProfModal(null);
}

/** بناء نموذج الموظف — يُستخدم في الإضافة والتعديل */
function _buildEmpForm(emp) {
    const id = emp.id || '';
    const sectors = SettingsData.sectors || [];
    const divisions = SettingsData.divisions || [];
    const employees = SettingsData.employees || [];

    const curSector = emp.sector_id || emp.department_id || '';

    const sectorOpts = sectors.map(s => {
        const lbl = s.name + (s.name_en && s.name_en !== s.name ? ' — ' + s.name_en : '');
        return `<option value="${s.id}" ${curSector == s.id ? 'selected' : ''}>${lbl}</option>`;
    }).join('');

    const divOpts = divisions.map(d => {
        const sid = d.sector_id || d.parent_id || '';
        const label = d.name + (d.name_en && d.name_en !== d.name ? ' — ' + d.name_en : '');
        const sel = emp.division_id == d.id ? 'selected' : '';
        const hid = (curSector && String(sid) !== String(curSector)) ? 'hidden' : '';
        return `<option value="${d.id}" data-sector="${sid}" ${sel} ${hid}>${label}</option>`;
    }).join('');

    const supOpts = employees
        .filter(e => e.is_active != 0 && e.id != id)
        .map(e => `<option value="${e.id}" ${emp.supervisor_id == e.id ? 'selected' : ''}>${e.name} (${_roleLabel(e.role)})</option>`)
        .join('');

    const roleDesc = (SYSTEM_ROLES.find(r => r.value === emp.role) || {}).desc || '';

    return `
    <form id="employeeForm" onsubmit="saveEmployee(event)" autocomplete="off">
        <input type="hidden" name="id" id="empId" value="${id}">

        <!-- ① الهوية -->
        <div class="modal-form-grid" style="grid-template-columns:1fr 1fr 1fr">
            <div class="form-group">
                <label class="form-label">رقم الموظف *</label>
                <input class="form-input" name="employee_number" id="empNumber"
                       value="${emp.employee_number || ''}" required
                       placeholder="EMP-0001">
            </div>
            <div class="form-group" style="grid-column:span 2">
                <label class="form-label">الاسم الكامل *</label>
                <input class="form-input" name="name" id="empName"
                       value="${emp.name || ''}" required placeholder="اسم الموظف">
            </div>
            <div class="form-group">
                <label class="form-label">البريد الإلكتروني</label>
                <input class="form-input" type="email" name="email" id="empEmail"
                       value="${emp.email || ''}" placeholder="name@company.com">
            </div>
            <div class="form-group">
                <label class="form-label">رقم الهاتف</label>
                <input class="form-input" name="phone" id="empPhone"
                       value="${emp.phone || ''}" placeholder="05xxxxxxxx">
            </div>
        </div>

        <hr style="border:none;border-top:.5px solid var(--border-color);margin:.75rem 0">

        <!-- ② التنظيم: القطاع → القسم -->
        <div class="modal-form-grid" style="grid-template-columns:1fr 1fr">
            <div class="form-group">
                <label class="form-label">
                    🏛️ القطاع
                    <span class="form-hint">نطاق رؤية المعاملات</span>
                </label>
                <select class="form-select" name="sector_id" id="empSector"
                        onchange="onSectorChange(this)">
                    <option value="">— بدون قطاع —</option>
                    ${sectorOpts}
                </select>
                <div id="sectorHint" class="form-hint" style="margin-top:.35rem"></div>
            </div>
            <div class="form-group">
                <label class="form-label">
                    🏢 القسم
                    <span class="form-hint">يُفلتر تلقائياً</span>
                </label>
                <select class="form-select" name="division_id" id="empDivision">
                    <option value="">— بدون قسم —</option>
                    ${divOpts}
                </select>
            </div>
        </div>

        <hr style="border:none;border-top:.5px solid var(--border-color);margin:.75rem 0">

        <!-- ③ الدور والصلاحية -->
        <div class="modal-form-grid" style="grid-template-columns:1fr 1fr">
            <div class="form-group">
                <label class="form-label">
                    ⚙️ الدور *
                    <span class="form-hint">يحدد سير العمل</span>
                </label>
                <select class="form-select" name="role" id="empRole"
                        required onchange="onRoleChange(this)">
                    <option value="">— اختر —</option>
                    ${buildRoleOptions(emp.role || '', emp.sector_id || emp.department_id || '')}
                </select>
                <div id="roleHint" class="form-hint" style="margin-top:.35rem;font-style:italic">
                    ${roleDesc}
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">
                    🔒 الصلاحية
                    <span class="form-hint">تُضبط تلقائياً</span>
                </label>
                <select class="form-select" name="permission_level_code" id="empPermLevel">
                    ${(PERM_LEVELS_CACHE || []).map(p =>
        `<option value="${p.code}" ${(emp.permission_level_code || emp.permission_level) == p.code ? 'selected' : ''}>${p.label}</option>`
    ).join('')}
                </select>
            </div>
        </div>

        <hr style="border:none;border-top:.5px solid var(--border-color);margin:.75rem 0">

        <!-- ④ المشرف -->
        <div class="form-group">
            <label class="form-label">
                👤 المشرف المباشر
                <span class="form-hint">يُصعَّد إليه عند تجاوز SLA</span>
            </label>
            <select class="form-select" name="supervisor_id" id="empSupervisor">
                <option value="">— بدون مشرف —</option>
                ${supOpts}
            </select>
        </div>

        <div class="modal-footer" style="padding:0;border:none;margin-top:1.25rem">
            <button type="button" class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
            <button type="submit" class="btn btn-primary">
                ${id ? '💾 حفظ التعديلات' : '➕ إضافة الموظف'}
            </button>
        </div>
    </form>`;
}


/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║      app-settings-employees.js — إدارة الموظفين والصلاحيات  ║
 * ║  يتطلب: app-common.js, app-transactions.js                   ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

// ========== قسم الموظفين ==========
async function loadSettingsEmployees() {
    try {
        // الموظفون — من settings.php لضمان إرجاع permission_level
        var res = await fetch('api/settings.php?action=get_employees');
        var data = await res.json();
        if (data.success) SettingsData.employees = data.data;

        // الأقسام (قطاعات + أقسام تنظيمية)
        var dRes = await fetch('api/settings.php?action=get_departments');
        var dData = await dRes.json();
        if (dData.success && dData.data) {
            var all = dData.data;
            SettingsData.sectors = all.filter(function (d) { return !d.parent_id || d.dept_type === 'sector'; });
            SettingsData.divisions = all.filter(function (d) { return d.parent_id || d.dept_type === 'division' || d.dept_type === 'team'; });
            SettingsData.departments = all; // كل الأقسام للتوافق
        } else {
            // fallback
            var fRes = await fetch('api/budget.php?action=meta');
            var fData = await fRes.json();
            if (fData.success && fData.data && fData.data.departments) {
                SettingsData.departments = fData.data.departments;
                SettingsData.sectors = fData.data.departments;
                SettingsData.divisions = [];
            }
        }

        // مستويات الصلاحية
        await loadPermissionLevels();

    } catch (e) {
        console.error('loadSettingsEmployees:', e);
    }
}

// ── مستويات الصلاحية الديناميكية ─────────────────────────────
var PERM_LEVELS_CACHE = [];

async function loadPermissionLevels() {
    try {
        var res = await fetch('api/settings.php?action=get_permission_levels');
        var data = await res.json();
        if (data.success && data.data && data.data.length) {
            // normalize: ensure each item has 'value' field (API may return 'code')
            PERM_LEVELS_CACHE = data.data.map(function (p) {
                return Object.assign({}, p, { value: p.value || p.code });
            });
        }
    } catch (e) { /* تُستخدم القيم الثابتة */ }
    if (!PERM_LEVELS_CACHE.length) {
        PERM_LEVELS_CACHE = [
            { value: 'system_admin', code: 'system_admin', label: 'مدير النظام', description: 'صلاحية كاملة على كل شيء بما فيها الحذف', color: '#ef4444' },
            { value: 'CEO', code: 'CEO', label: 'الرئيس التنفيذي', description: 'يعتمد جميع المعاملات النهائية', color: '#8b5cf6' },
            { value: 'sector_head', code: 'sector_head', label: 'رئيس القطاع', description: 'يرى كل معاملات قطاعه ويعتمد طلباته', color: '#8b5cf6' },
            { value: 'division_manager', code: 'division_manager', label: 'مدير القسم', description: 'يرى معاملات قسمه ويتابع موظفيه', color: '#3b82f6' },
            { value: 'employee_l1', code: 'employee_l1', label: 'موظف مستوى أول', description: 'وصول موسع للتقارير والمتابعة', color: '#f59e0b' },
            { value: 'employee', code: 'employee', label: 'موظف', description: 'وصول محدود لصفحته الوظيفية', color: '#22c55e' },
        ];
    }
}


/* الأدوار الستة الرسمية للنظام */
const SYSTEM_ROLES = [
    { value: 'admin', label: 'مدير النظام', color: '#ef4444', desc: 'صلاحية كاملة على النظام بما فيها الحذف والإعدادات' },
    { value: 'CEO', label: 'الرئيس التنفيذي', color: '#8b5cf6', desc: 'يعتمد الطلبات الكبيرة ويرى جميع المعاملات' },
    { value: 'sector_head', label: 'رئيس القطاع', color: '#3b82f6', desc: 'يرى جميع معاملات قطاعه ويُصعَّد إليه عند تجاوز SLA' },
    { value: 'division_manager', label: 'مدير القسم', color: '#10b981', desc: 'يرى معاملات قسمه ويعتمد الطلبات المبدئية' },
    { value: 'employee_l1', label: 'موظف مستوى أول', color: '#f59e0b', desc: 'وصول موسع للتقارير وله دور وظيفي محدد' },
    { value: 'employee', label: 'موظف', color: '#94a3b8', desc: 'يُنشئ الطلبات ويتابع ما يخصه فقط' },
];

/**
 * الأدوار المتاحة لكل قطاع بناءً على كوده
 * الأدوار المشتركة (admin, CEO, employee) تظهر دائماً
 * ---
 * sector code mapping:
 *   31xxxx = القطاع المالي (Finance)
 *   41xxxx = سلاسل الإمداد (Supply Chain)
 *   32xxxx = الخدمات المشتركة (Shared Services)
 *   42xxxx = العمليات (Operations)
 *   FIN    = القطاع المالي (بديل)
 *   PUR    = المشتريات (بديل)
 */
/**
 * الأدوار الخمسة تظهر في كل القطاعات
 * القطاع يحدد نطاق الرؤية فقط — لا يقيّد الدور
 */
const SECTOR_ROLES = {
    finance: { match: (code, name) => code?.startsWith('31') || code === 'FIN' || /مال|finance/i.test(name), roles: ['admin', 'CEO', 'sector_head', 'division_manager', 'employee_l1', 'employee'], label: 'القطاع المالي' },
    supply: { match: (code, name) => code?.startsWith('41') || code === 'PUR' || /supply|مشتريات|إمداد/i.test(name), roles: ['admin', 'CEO', 'sector_head', 'division_manager', 'employee_l1', 'employee'], label: 'سلاسل الإمداد' },
    shared: { match: (code, name) => code?.startsWith('32') || /shared|مشترك|إدار|hr|تقني/i.test(name), roles: ['admin', 'CEO', 'sector_head', 'division_manager', 'employee_l1', 'employee'], label: 'الخدمات المشتركة' },
    operations: { match: (code, name) => code?.startsWith('42') || /operat|عمليات|إنتاج/i.test(name), roles: ['admin', 'CEO', 'sector_head', 'division_manager', 'employee_l1', 'employee'], label: 'العمليات' },
};

/** جلب الأدوار المتاحة لقطاع معيَّن */
function getRolesForSector(sectorId) {
    if (!sectorId) return SYSTEM_ROLES; // بدون قطاع: أظهر الكل

    const sector = (SettingsData.sectors || []).find(s => String(s.id) === String(sectorId));
    if (!sector) return SYSTEM_ROLES;

    const code = (sector.code || '').toUpperCase();
    const name = sector.name || '';

    for (const key of Object.keys(SECTOR_ROLES)) {
        const def = SECTOR_ROLES[key];
        if (def.match(code, name)) {
            return SYSTEM_ROLES.filter(r => def.roles.includes(r.value));
        }
    }
    // قطاع غير معروف: أظهر الأدوار الخمسة كاملة
    return SYSTEM_ROLES;
}


/** خريطة: الدور → مستوى الصلاحية التلقائي */
const ROLE_PERM_MAP = {
    admin: 'system_admin',
    CEO: 'CEO',
    sector_head: 'sector_head',
    division_manager: 'division_manager',
    employee_l1: 'employee_l1',
    employee: 'employee',
};

/** عند تغيير الدور: ضبط الصلاحية تلقائياً مع تنبيه */
function onRoleChange(sel) {
    const role = sel?.value || '';
    const perm = ROLE_PERM_MAP[role] || 'employee';
    const permEl = document.getElementById('empPermLevel');

    // إذا كان هناك صلاحية محددة مسبقاً وتختلف عن الجديدة → اسأل أولاً
    if (permEl && permEl.value && permEl.value !== perm) {
        const roleName = (SYSTEM_ROLES.find(r => r.value === role) || {}).label || role;
        const confirmed = confirm('تغيير الدور إلى "' + roleName + '" سيُعيد ضبط الصلاحيات للافتراضي.\nهل تريد المتابعة؟');
        if (confirmed) {
            permEl.value = perm;
        } else {
            // أعد الدور للقيمة السابقة
            sel.value = sel.dataset.prevRole || '';
        }
    } else if (permEl) {
        permEl.value = perm;
    }

    // احفظ الدور الحالي للرجوع إليه عند الإلغاء
    if (sel) sel.dataset.prevRole = role;

    // hint توضيحي
    const hint = document.getElementById('roleHint');
    const desc = (SYSTEM_ROLES.find(r => r.value === role) || {}).desc || '';
    if (hint) hint.textContent = desc;
}

/** عند تغيير القطاع: فلترة الأقسام + تحديث الأدوار المتاحة */
function onSectorChange(sel) {
    const sectorId = sel?.value || '';

    // ── فلترة الأقسام ─────────────────────────────────────────
    const divSel = document.getElementById('empDivision');
    if (divSel) {
        Array.from(divSel.options).forEach(opt => {
            if (!opt.value) return;
            opt.hidden = !(!sectorId || opt.dataset.sector == sectorId);
        });
        const cur = divSel.options[divSel.selectedIndex];
        if (cur && cur.value && sectorId && cur.dataset.sector != sectorId) {
            divSel.value = '';
        }
    }

    // ── تحديث قائمة الأدوار بناءً على القطاع ─────────────────
    const roleEl = document.getElementById('empRole');
    if (roleEl) {
        const currentRole = roleEl.value;
        roleEl.innerHTML = '<option value="">— اختر —</option>'
            + buildRoleOptions(currentRole, sectorId);

        // إذا لم يعد الدور الحالي متاحاً في هذا القطاع → صفّره
        const stillAvail = Array.from(roleEl.options).some(o => o.value === currentRole && o.value);
        if (!stillAvail) {
            roleEl.value = '';
            // صفّر الصلاحية والـ hint
            const permEl = document.getElementById('empPermLevel');
            if (permEl) permEl.value = 'employee';
            const hint = document.getElementById('roleHint');
            if (hint) hint.textContent = '';
        }
    }

    // ── hint القطاع ───────────────────────────────────────────
    const sector = (SettingsData.sectors || []).find(s => String(s.id) === String(sectorId));
    if (sector) {
        for (const def of Object.values(SECTOR_ROLES)) {
            const code = (sector.code || '').toUpperCase();
            if (def.match(code, sector.name || '')) {
                const hint = document.getElementById('sectorHint');
                if (hint) hint.textContent = 'أدوار ' + def.label + ': ' + def.roles.length + ' دور متاح';
                break;
            }
        }
    }
}

function renderEmployeesSection() {
    var cont = document.getElementById('settingsContent');

    var filtered = SettingsData.employees || [];
    var cf = SettingsData.currentFilter || 'all';

    // الفلتر يعمل على permission_level
    if (cf !== 'all') filtered = filtered.filter(function (e) {
        return (e.permission_level || 'employee') === cf;
    });

    // حساب الأعداد بناءً على permission_level
    var counts = {};
    (SettingsData.employees || []).forEach(function (e) {
        var pl = e.permission_level || 'employee';
        counts[pl] = (counts[pl] || 0) + 1;
    });
    var total = (SettingsData.employees || []).length;

    // بناء التبويبات من PERM_LEVELS_CACHE
    var permFilters = (PERM_LEVELS_CACHE || []).map(function (p) {
        return { key: p.code || p.value, label: p.label };
    });
    var filters = [{ key: 'all', label: 'الكل' }].concat(permFilters);

    var filterHTML = filters.map(function (f) {
        var cnt = f.key === 'all' ? total : (counts[f.key] || 0);
        var active = cf === f.key ? 'active' : '';
        return '<button class="emp-filter-btn ' + active + '" onclick="filterEmployees(\'' + f.key + '\', this)">' +
            f.label + (cnt ? ' <span class="emp-filter-cnt">' + cnt + '</span>' : '') +
            '</button>';
    }).join('');

    var rows = '';
    if (!filtered.length) {
        rows = '<tr><td colspan="9" style="text-align:center;padding:2.5rem;color:var(--text-muted)">لا يوجد موظفون في هذا التصنيف</td></tr>';
    } else {
        filtered.forEach(function (emp) {
            var sectors = SettingsData.sectors || SettingsData.departments || [];
            var divisions = SettingsData.divisions || [];
            var all = SettingsData.departments || [];

            var sectorId = emp.sector_id || emp.department_id;
            var divisionId = emp.division_id;

            var sector = sectors.find(function (s) { return s.id == sectorId; })
                || all.find(function (d) { return d.id == sectorId; });
            var division = divisions.find(function (d) { return d.id == divisionId; })
                || all.find(function (d) { return d.id == divisionId; });

            function biName(rec) {
                if (!rec) return '—';
                var ar = rec.name || '';
                var en = rec.name_en || '';
                if (ar && en && ar !== en) return ar + ' <span style="color:var(--text-muted);font-size:.7rem">' + en + '</span>';
                return ar || en || '—';
            }
            var sectorName = biName(sector);
            var divName = division ? biName(division) : '—';

            var sup = emp.supervisor_id
                ? (SettingsData.employees || []).find(function (e) { return e.id == emp.supervisor_id; })
                : null;
            var supName = sup ? sup.name : '<span style="color:var(--text-muted)">—</span>';

            var permCode = emp.permission_level_code || emp.permission_level || 'employee';
            var permLevel = (PERM_LEVELS_CACHE || []).find(function (p) { return p.code === permCode; });
            var permLabel = permLevel ? permLevel.label : permCode;
            var permColor = permLevel ? permLevel.color : '#6b7280';

            var roleName = getRoleName(emp.role);
            var roleColor = getRoleColor(emp.role);

            var actionsHtml = '<div style="display:flex;gap:.3rem;justify-content:center">';
            if (canDo('employee.permissions'))
                actionsHtml += '<button class="emp-act-btn emp-act-perm" onclick="openPermissionsModal(' + emp.id + ',\'' + emp.name.replace(/'/g, "\\'") + '\')" title="الصلاحيات">🔒</button>';
            if (canDo('employee.edit'))
                actionsHtml += '<button class="emp-act-btn emp-act-edit" onclick="editEmployee(' + emp.id + ')" title="تعديل">✏️</button>';
            if (canDo('employee.delete'))
                actionsHtml += '<button class="emp-act-btn emp-act-del" onclick="deleteEmployee(' + emp.id + ',\'' + emp.name.replace(/'/g, "\\'") + '\')" title="حذف">🗑</button>';
            actionsHtml += '</div>';

            rows += '<tr class="emp-row">'
                + '<td><div class="emp-name-cell">' + emp.name + '</div>' + (emp.job_title ? '<div class="emp-job-title">' + emp.job_title + '</div>' : '') + '</td>'
                + '<td><span class="emp-num-badge">' + emp.employee_number + '</span></td>'
                + '<td><span class="emp-role-badge" style="background:' + roleColor + '18;color:' + roleColor + '">' + roleName + '</span></td>'
                + '<td><span class="emp-perm-badge" style="background:' + permColor + '18;color:' + permColor + '">' + permLabel + '</span></td>'
                + '<td><div class="emp-contact-cell"><span>' + (emp.email || '—') + '</span>'
                + '<span style="color:var(--text-muted)">' + (emp.phone || '—') + '</span></div></td>'
                + '<td><div class="emp-dept-cell"><span class="emp-sector-tag">' + sectorName + '</span>'
                + (divisionId && divName !== '—' ? '<span class="emp-div-tag">' + divName + '</span>' : '')
                + '</div></td>'
                + '<td class="emp-sup-cell">' + supName + '</td>'
                + '<td><span class="emp-status" style="' + (emp.is_active != '0' ? 'background:#dcfce7;color:#16a34a' : 'background:#fee2e2;color:#dc2626') + '">' + (emp.is_active != '0' ? 'نشط' : 'موقوف') + '</span></td>'
                + '<td>' + actionsHtml + '</td>'
                + '</tr>';
        });
    }

    cont.innerHTML =
        '<div class="emp-page">'
        + '<div class="emp-page-header">'
        + '<div><h2 class="emp-page-title">👥 إدارة الموظفين</h2>'
        + '<p class="emp-page-sub">' + total + ' موظف مسجل</p></div>'
        + '<div style="display:flex;gap:.5rem;align-items:center">'
        + '<input type="text" id="emp-search" class="emp-search" placeholder="🔍 بحث بالاسم أو الرقم..." oninput="empTableSearch(this.value)">'
        + '<button class="btn btn-primary" onclick="openAddEmployeeModal()">'
        + '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>'
        + ' إضافة موظف</button>'
        + '</div></div>'
        + '<div class="emp-filters">' + filterHTML + '</div>'
        + '<div class="emp-table-wrap">'
        + '<table class="emp-table" id="emp-table">'
        + '<thead><tr>'
        + '<th>الاسم</th>'
        + '<th>رقم الموظف</th>'
        + '<th>الدور</th>'
        + '<th>مستوى الصلاحية</th>'
        + '<th>التواصل</th>'
        + '<th>القطاع / القسم</th>'
        + '<th>المشرف</th>'
        + '<th>الحالة</th>'
        + '<th style="text-align:center">إجراءات</th>'
        + '</tr></thead>'
        + '<tbody id="emp-tbody">' + rows + '</tbody>'
        + '</table></div>'
        + '</div>'
        + '<style>'
        + '.emp-page{display:flex;flex-direction:column;gap:1rem;padding:var(--pr-gap,1.25rem);animation:prFadeIn .3s ease}'
        + '.emp-page-header{display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:.75rem}'
        + '.emp-page-title{margin:0;font-size:1.2rem;font-weight:700;color:var(--text-primary)}'
        + '.emp-page-sub{margin:.2rem 0 0;font-size:.8rem;color:var(--text-muted)}'
        + '.emp-search{padding:.5rem .85rem;border:1px solid var(--border-color);border-radius:7px;background:var(--bg-card);color:var(--text-primary);font-size:.85rem;width:220px;transition:border-color .2s}'
        + '.emp-search:focus{outline:none;border-color:var(--primary,#3b82f6);box-shadow:0 0 0 3px rgba(59,130,246,.12)}'
        + '.emp-filters{display:flex;flex-wrap:wrap;gap:.4rem}'
        + '.emp-filter-btn{padding:.35rem .8rem;border:1px solid var(--border-color);border-radius:99px;background:var(--bg-card);color:var(--text-secondary);font-size:.8rem;cursor:pointer;transition:all .15s;display:flex;align-items:center;gap:.3rem}'
        + '.emp-filter-btn:hover{border-color:var(--primary,#3b82f6);color:var(--primary,#3b82f6)}'
        + '.emp-filter-btn.active{background:var(--primary,#3b82f6);color:#fff;border-color:transparent}'
        + '.emp-filter-cnt{background:rgba(255,255,255,.25);border-radius:99px;padding:0 .4rem;font-size:.72rem}'
        + '.emp-filter-btn:not(.active) .emp-filter-cnt{background:var(--bg-secondary);color:var(--text-muted)}'
        + '.emp-table-wrap{overflow-x:auto;border:1px solid var(--border-color);border-radius:10px;background:var(--bg-card);box-shadow:0 2px 12px rgba(0,0,0,.06)}'
        + '.emp-table{width:100%;border-collapse:collapse;font-size:.855rem;direction:rtl}'
        + '.emp-table thead tr{background:var(--bg-secondary)}'
        + '.emp-table th{padding:.8rem 1rem;text-align:right;font-size:.75rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap;border-bottom:1px solid var(--border-color)}'
        + '.emp-row{border-bottom:1px solid var(--border-light,#f1f5f9);transition:background .15s;cursor:default}'
        + '.emp-row:last-child{border-bottom:none}'
        + '.emp-row:hover{background:var(--bg-hover,#f8fafc)}'
        + '.emp-row td{padding:.75rem 1rem;vertical-align:middle}'
        + '.emp-name-cell{font-weight:600;color:var(--text-primary);font-size:.88rem}'
        + '.emp-job-title{font-size:.72rem;color:var(--text-muted);margin-top:.1rem}'
        + '.emp-num-badge{display:inline-block;font-family:monospace;font-size:.82rem;font-weight:700;color:var(--primary,#3b82f6);background:rgba(59,130,246,.09);padding:.2rem .55rem;border-radius:5px}'
        + '.emp-role-badge,.emp-perm-badge{display:inline-block;padding:.2rem .65rem;border-radius:99px;font-size:.75rem;font-weight:600;white-space:nowrap}'
        + '.emp-contact-cell{display:flex;flex-direction:column;gap:.1rem;font-size:.8rem;color:var(--text-secondary)}'
        + '.emp-dept-cell{display:flex;flex-direction:column;gap:.25rem}'
        + '.emp-sector-tag{font-size:.78rem;font-weight:600;color:var(--text-primary)}'
        + '.emp-div-tag{font-size:.72rem;color:var(--text-muted);padding:.1rem .4rem;background:var(--bg-secondary);border-radius:4px;width:fit-content}'
        + '.emp-sup-cell{font-size:.82rem;color:var(--text-secondary)}'
        + '.emp-status{display:inline-block;padding:.2rem .6rem;border-radius:99px;font-size:.72rem;font-weight:600}'
        + '.emp-act-btn{width:30px;height:30px;border:1px solid var(--border-color);border-radius:6px;background:none;cursor:pointer;font-size:.9rem;display:inline-flex;align-items:center;justify-content:center;transition:all .15s}'
        + '.emp-act-btn:hover{transform:scale(1.1)}'
        + '.emp-act-perm:hover{background:#dbeafe;border-color:#3b82f6}'
        + '.emp-act-edit:hover{background:#dcfce7;border-color:#22c55e}'
        + '.emp-act-del:hover{background:#fee2e2;border-color:#ef4444}'
        + '[data-theme="dark"] .emp-table-wrap,[data-theme="dark"] .emp-search{background:var(--bg-card,#1e293b);border-color:var(--border-color,#334155)}'
        + '[data-theme="dark"] .emp-table thead tr{background:var(--bg-secondary,#0f172a)}'
        + '[data-theme="dark"] .emp-row:hover{background:rgba(255,255,255,.04)}'
        + '@media(max-width:768px){.emp-table th:nth-child(n+4),.emp-row td:nth-child(n+4){display:none}.emp-search{width:150px}}'
        + '</style>';
}

/** بحث مباشر في جدول الموظفين */
function empTableSearch(q) {
    var lower = q.toLowerCase();
    var rows = document.querySelectorAll('#emp-tbody .emp-row');
    rows.forEach(function (row) {
        var txt = row.textContent.toLowerCase();
        row.style.display = (!q || txt.includes(lower)) ? '' : 'none';
    });
}

function getRoleName(role) {
    var r = (typeof SYSTEM_ROLES !== 'undefined' ? SYSTEM_ROLES : [])
        .find(function (x) { return x.value === role; });
    return r ? r.label : (role || '—');
}
function getRoleColor(role) {
    var r = (typeof SYSTEM_ROLES !== 'undefined' ? SYSTEM_ROLES : [])
        .find(function (x) { return x.value === role; });
    return r ? r.color : '#94a3b8';
}

function filterEmployees(permLevel, btn) {
    SettingsData.currentFilter = permLevel;
    document.querySelectorAll('.emp-filter-btn').forEach(function (t) { t.classList.remove('active'); });
    if (btn) btn.classList.add('active');
    renderEmployeesSection();
}

function _roleLabel(role) {
    return { admin: 'مدير', receiver: 'استلام', budget: 'موازنة', payment: 'دفع', invoice: 'فوترة' }[role] || role;
}


/** بناء خيارات الأدوار الوظيفية مع الوصف */
function buildRoleOptions(selectedRole, sectorId) {
    const roles = getRolesForSector(sectorId);
    return roles.map(r => {
        const sel = selectedRole === r.value ? 'selected' : '';
        return `<option value="${r.value}" ${sel}>${r.label}${r.desc ? ' — ' + r.desc : ''}</option>`;
    }).join('');
}
/** فلترة الأقسام عند تغيير القطاع */
async function editEmployee(id) {
    await openProfModal(id);
}

async function saveEmployee(e) {
    e.preventDefault();

    var id = document.getElementById('empId')?.value;
    var supervisorEl = document.getElementById('empSupervisor');
    var sectorEl = document.getElementById('empSector');
    var divisionEl = document.getElementById('empDivision');
    var permLevelEl = document.getElementById('empPermLevel');
    var empNumberEl = document.getElementById('empNumber');
    var data = {
        name: document.getElementById('empName').value,
        email: document.getElementById('empEmail').value,
        phone: document.getElementById('empPhone').value,
        role: document.getElementById('empRole').value,
        job_title: document.getElementById('empJobTitle')?.value?.trim() || '',
        employee_number: empNumberEl ? empNumberEl.value.trim() : '',
        supervisor_id: supervisorEl ? (supervisorEl.value || null) : null,
        sector_id: sectorEl ? (sectorEl.value || null) : null,
        division_id: divisionEl ? (divisionEl.value || null) : null,
        permission_level_code: permLevelEl ? (permLevelEl.value || null) : null,
        // department_id = sector_id للتوافق مع الكود القديم
        department_id: sectorEl ? (sectorEl.value || null) : null,
    };

    if (id) data.id = id;

    var action = id ? 'update_employee' : 'add_employee';

    try {
        var _tok = (typeof _getCsrfToken === 'function') ? await _getCsrfToken() : (window.csrfToken || '');
        var res = await fetch('api/settings.php?action=' + action, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': _tok },
            body: JSON.stringify(Object.assign({ csrf_token: _tok }, data))
        });

        var result = await res.json();

        if (result.success) {
            showToast(id ? 'تم تحديث الموظف' : 'تم إضافة الموظف', 'success');
            closeModal();
            await loadSettingsEmployees();
            renderEmployeesSection();
        } else {
            showToast(result.message || 'خطأ', 'error');
        }
    } catch (err) {
        showToast('خطأ في الاتصال', 'error');
    }
}

async function deleteEmployee(id, name) {
    if (!confirm('هل أنت متأكد من حذف الموظف "' + name + '"؟')) return;

    try {
        var _tok = (typeof _getCsrfToken === 'function') ? await _getCsrfToken() : (window.csrfToken || '');
        var res = await fetch('api/settings.php?action=delete_employee', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': _tok },
            body: JSON.stringify({ csrf_token: _tok, id: id })
        });

        var result = await res.json();

        if (result.success) {
            showToast('تم حذف الموظف', 'success');
            await loadSettingsEmployees();
            renderEmployeesSection();
        } else {
            showToast(result.message || 'خطأ في الحذف', 'error');
        }
    } catch (err) {
        showToast('خطأ في الاتصال', 'error');
    }
}

// ═══════════════════════════════════════════════════════════════
//  نظام إدارة الصلاحيات — Permissions Management
// ═══════════════════════════════════════════════════════════════

var ACTIONS_CONFIG = [
    // البنك
    { key: 'bank.record_balance', label: 'تسجيل رصيد اليوم', icon: '📊', group: 'البنك' },
    { key: 'bank.edit_balance', label: 'تعديل الرصيد', icon: '✏️', group: 'البنك' },
    { key: 'bank.edit_account', label: 'تعديل بيانات الحساب', icon: '⚙️', group: 'البنك' },
    { key: 'bank.add_account', label: 'إضافة حساب بنكي', icon: '🏦', group: 'البنك' },
    { key: 'bank.add_deposit', label: 'إضافة وديعة', icon: '💵', group: 'البنك' },
    { key: 'bank.confirm_deposit', label: 'تأكيد الوديعة', icon: '✅', group: 'البنك' },
    { key: 'bank.delete_deposit', label: 'حذف وديعة', icon: '🗑', group: 'البنك' },
    { key: 'bank.add_investment', label: 'إضافة وديعة استثمارية', icon: '📈', group: 'البنك' },
    { key: 'bank.edit_investment', label: 'تعديل وديعة استثمارية', icon: '✏️', group: 'البنك' },
    { key: 'bank.delete_investment', label: 'حذف وديعة استثمارية', icon: '🗑', group: 'البنك' },
    // المدفوعات اليومية
    { key: 'payments.add', label: 'إضافة دفعة يومية', icon: '➕', group: 'المدفوعات اليومية' },
    { key: 'payments.edit', label: 'تعديل دفعة', icon: '✏️', group: 'المدفوعات اليومية' },
    { key: 'payments.delete', label: 'حذف دفعة', icon: '🗑', group: 'المدفوعات اليومية' },
    { key: 'payments.approve', label: 'اعتماد دفعة', icon: '✅', group: 'المدفوعات اليومية' },
    // المعاملات المالية
    { key: 'transaction.add', label: 'إضافة معاملة', icon: '➕', group: 'المعاملات' },
    { key: 'transaction.edit', label: 'تعديل معاملة', icon: '✏️', group: 'المعاملات' },
    { key: 'transaction.delete', label: 'حذف معاملة', icon: '🗑', group: 'المعاملات' },
    { key: 'transaction.export', label: 'تصدير البيانات', icon: '📤', group: 'المعاملات' },
    // الخطابات
    { key: 'correspondence.add', label: 'إضافة خطاب', icon: '✉️', group: 'الخطابات' },
    { key: 'correspondence.edit', label: 'تعديل خطاب', icon: '✏️', group: 'الخطابات' },
    { key: 'correspondence.delete', label: 'حذف خطاب', icon: '🗑', group: 'الخطابات' },
    { key: 'correspondence.send', label: 'إرسال خطاب', icon: '📤', group: 'الخطابات' },
    { key: 'correspondence.view_all', label: 'عرض كل الخطابات', icon: '📋', group: 'الخطابات' },
    { key: 'correspondence.stage_approve', label: 'موافقة على المرحلة', icon: '✅', group: 'الخطابات' },
    { key: 'correspondence.stage_reject', label: 'رفض المرحلة', icon: '❌', group: 'الخطابات' },
    { key: 'correspondence.stage_return', label: 'إعادة المرحلة', icon: '↩️', group: 'الخطابات' },
    { key: 'correspondence.stage_edit_completed', label: 'تعديل مرحلة مكتملة', icon: '🔓', group: 'الخطابات' },
    { key: 'correspondence.stage_override', label: 'التصرف في مراحل الآخرين', icon: '🛡️', group: 'الخطابات' },
    // الموازنة
    { key: 'budget.review', label: 'مراجعة واعتماد الموازنة', icon: '⚖️', group: 'الموازنة' },
    { key: 'budget.link_transaction', label: 'ربط بمعاملة مالية', icon: '🔗', group: 'الموازنة' },
    { key: 'budget.edit_code', label: 'تعديل رمز الموازنة', icon: '🏷️', group: 'الموازنة' },
    { key: 'budget.edit_plans', label: 'تعديل الموازنة التقديرية', icon: '📊', group: 'الموازنة' },
    { key: 'budget.delete_plan', label: 'حذف خطة موازنة', icon: '🗑', group: 'الموازنة' },
    // الحجوزات
    { key: 'reservation.add', label: 'إضافة حجز جديد', icon: '📋', group: 'الحجوزات' },
    { key: 'reservation.edit', label: 'تعديل حجز', icon: '✏️', group: 'الحجوزات' },
    { key: 'reservation.view_own', label: 'عرض حجوزات القسم', icon: '👁', group: 'الحجوزات' },
    { key: 'reservation.view_all', label: 'عرض كل الحجوزات', icon: '📑', group: 'الحجوزات' },
    { key: 'reservation.review', label: 'مراجعة الحجوزات', icon: '🔍', group: 'الحجوزات' },
    { key: 'reservation.approve', label: 'اعتماد / رفض حجز', icon: '✅', group: 'الحجوزات' },
    { key: 'reservation.delete', label: 'حذف حجز', icon: '🗑', group: 'الحجوزات' },
    // اعتمادات CEO
    { key: 'ceo.view', label: 'عرض طلبات الاعتماد', icon: '👁', group: 'اعتمادات CEO' },
    { key: 'ceo.approve', label: 'اعتماد / رفض الطلب', icon: '✅', group: 'اعتمادات CEO' },
    { key: 'ceo.delegate', label: 'تفويض الاعتماد', icon: '🔀', group: 'اعتمادات CEO' },
    // الأرشيف
    { key: 'archive.upload', label: 'رفع مستند', icon: '📤', group: 'الأرشيف' },
    { key: 'archive.delete', label: 'حذف مستند', icon: '🗑', group: 'الأرشيف' },
    { key: 'archive.view_all', label: 'عرض كل المستندات', icon: '📋', group: 'الأرشيف' },
    // الموظفين
    { key: 'employee.add', label: 'إضافة موظف', icon: '👤', group: 'الموظفين' },
    { key: 'employee.edit', label: 'تعديل موظف', icon: '✏️', group: 'الموظفين' },
    { key: 'employee.delete', label: 'حذف موظف', icon: '🗑', group: 'الموظفين' },
    { key: 'employee.permissions', label: 'إدارة الصلاحيات', icon: '🔒', group: 'الموظفين' },
    // طلبات الشراء — المعاملات
    { key: 'pr.create', label: 'إنشاء طلب شراء', icon: '➕', group: 'طلبات الشراء' },
    { key: 'pr.view_all', label: 'عرض كل الطلبات', icon: '👁', group: 'طلبات الشراء' },
    { key: 'pr.view_own', label: 'عرض طلباتي فقط', icon: '📋', group: 'طلبات الشراء' },
    { key: 'pr.approve', label: 'موافقة / رفض طلب', icon: '✅', group: 'طلبات الشراء' },
    { key: 'pr.refer', label: 'إحالة طلب', icon: '🔀', group: 'طلبات الشراء' },
    { key: 'pr.assign', label: 'إسناد داخلي', icon: '👤', group: 'طلبات الشراء' },
    { key: 'pr.issue_po', label: 'إصدار أمر الشراء', icon: '📄', group: 'طلبات الشراء' },
    { key: 'pr.budget_review', label: 'مراجعة الموازنة', icon: '💰', group: 'طلبات الشراء' },
    { key: 'pr.delete', label: 'حذف طلب', icon: '🗑', group: 'طلبات الشراء' },
    { key: 'pr.export', label: 'تصدير الطلبات', icon: '📤', group: 'طلبات الشراء' },
    // العينات — مراحل سير العمل
    { key: 'sample.create', label: 'إنشاء طلب عينة', icon: '➕', group: 'العينات' },
    { key: 'sample.advance', label: 'تقديم لمرحلة تالية', icon: '↩️', group: 'العينات' },
    { key: 'sample.reject', label: 'رفض العينة', icon: '❌', group: 'العينات' },
    { key: 'sample.need_modification', label: 'إرجاع للتعديل (الجودة)', icon: '✏️', group: 'العينات' },
    { key: 'sample.dispatch', label: 'تسجيل الإرسال', icon: '🚚', group: 'العينات' },
    { key: 'sample.mark_delivered', label: 'تأكيد التسليم', icon: '✅', group: 'العينات' },
    { key: 'sample.upload', label: 'إرفاق ملفات', icon: '📎', group: 'العينات' },
    { key: 'sample.print_card', label: 'طباعة بطاقة العينة', icon: '🖨️', group: 'العينات' },
    { key: 'sample.sla_edit', label: 'تعديل مهل الـ SLA', icon: '⏱', group: 'العينات' },
    { key: 'sample.delete', label: 'حذف عينة', icon: '🗑', group: 'العينات' },
];

var PAGES_CONFIG = [
    // رئيسية
    { key: 'dashboard', label: 'لوحة التحكم', icon: '📊', group: 'رئيسية' },
    { key: 'notifications', label: 'التنبيهات', icon: '🔔', group: 'رئيسية' },
    // المعاملات
    { key: 'purchase-requests', label: 'طلبات الشراء (المعاملات)', icon: '📋', group: 'معاملات' },
    { key: 'transactions', label: 'المعاملات المالية', icon: '💰', group: 'معاملات' },
    { key: 'correspondence', label: 'الخطابات', icon: '📨', group: 'معاملات' },
    { key: 'samples', label: 'إدارة العينات', icon: '🧪', group: 'معاملات' },
    // التخطيط المالي
    { key: 'reservations', label: 'حجوزات الموازنة', icon: '📅', group: 'التخطيط المالي' },
    { key: 'budget-plans', label: 'الموازنة التقديرية', icon: '📊', group: 'التخطيط المالي' },
    // الخزينة
    { key: 'bank-overview', label: 'نظرة عامة (الخزينة)', icon: '🏦', group: 'الخزينة' },
    { key: 'bank-accounts', label: 'الحسابات البنكية', icon: '💳', group: 'الخزينة' },
    { key: 'bank-investments', label: 'الودائع الاستثمارية', icon: '📈', group: 'الخزينة' },
    { key: 'daily-payments', label: 'المدفوعات اليومية', icon: '💵', group: 'الخزينة' },
    // الأرشيف المالي — رئيسي + أقسام فرعية
    { key: 'archive', label: 'جميع المستندات', icon: '🗂️', group: 'الأرشيف المالي', archiveSub: 'all' },
    { key: 'archive-operational', label: 'مستندات تشغيلية', icon: '📋', group: 'الأرشيف المالي', archiveSub: 'operational' },
    { key: 'archive-op-contract', label: '— العقود والاتفاقيات', icon: '📄', group: 'الأرشيف المالي', archiveSub: 'op-contract', indent: true },
    { key: 'archive-op-mandate', label: '— التعميدات والتفويضات', icon: '📄', group: 'الأرشيف المالي', archiveSub: 'op-mandate', indent: true },
    { key: 'archive-op-letter', label: '— الخطابات والمراسلات', icon: '📄', group: 'الأرشيف المالي', archiveSub: 'op-letter', indent: true },
    { key: 'archive-financial', label: 'مستندات مالية', icon: '💰', group: 'الأرشيف المالي', archiveSub: 'financial' },
    { key: 'archive-fin-invoice-sales', label: '— فواتير مبيعات', icon: '📄', group: 'الأرشيف المالي', archiveSub: 'fin-invoice-sales', indent: true },
    { key: 'archive-fin-invoice-supplier', label: '— فواتير موردين', icon: '📄', group: 'الأرشيف المالي', archiveSub: 'fin-invoice-supplier', indent: true },
    { key: 'archive-fin-journal', label: '— قيود يومية', icon: '📄', group: 'الأرشيف المالي', archiveSub: 'fin-journal', indent: true },
    { key: 'archive-fin-bank', label: '— مستندات بنكية', icon: '📄', group: 'الأرشيف المالي', archiveSub: 'fin-bank', indent: true },
    { key: 'archive-fin-tax', label: '— ضرائب وزكاة', icon: '📄', group: 'الأرشيف المالي', archiveSub: 'fin-tax', indent: true },
    { key: 'archive-reports', label: 'تقارير وموازنة', icon: '📊', group: 'الأرشيف المالي', archiveSub: 'reports' },
    { key: 'archive-rep-report', label: '— تقارير مالية', icon: '📄', group: 'الأرشيف المالي', archiveSub: 'rep-report', indent: true },
    { key: 'archive-rep-budget', label: '— موازنة وتخطيط', icon: '📄', group: 'الأرشيف المالي', archiveSub: 'rep-budget', indent: true },
    { key: 'archive-official', label: 'وثائق رسمية', icon: '🏛️', group: 'الأرشيف المالي', archiveSub: 'official' },
    { key: 'archive-off-gov', label: '— وثائق حكومية', icon: '📄', group: 'الأرشيف المالي', archiveSub: 'off-gov', indent: true },
    { key: 'archive-off-commercial', label: '— سجلات تجارية', icon: '📄', group: 'الأرشيف المالي', archiveSub: 'off-commercial', indent: true },
    { key: 'archive-renewals', label: 'التجديد والصلاحيات', icon: '🔄', group: 'الأرشيف المالي', archiveSub: 'renewals' },
    // المتابعة
    { key: 'ceo-approvals', label: 'اعتمادات الرئيس التنفيذي', icon: '✅', group: 'المتابعة' },
    { key: 'sla', label: 'SLA / OLA', icon: '⏱', group: 'المتابعة' },
    { key: 'performance', label: 'متابعة الأداء', icon: '📈', group: 'المتابعة' },
    // نظام
    { key: 'settings', label: 'الإعدادات', icon: '⚙️', group: 'نظام' },
    { key: 'db-admin', label: 'إدارة قاعدة البيانات', icon: '🗄️', group: 'نظام' },
];

// PERMISSION_LEVELS — getter ديناميكي يقرأ من PERM_LEVELS_CACHE دائماً
Object.defineProperty(window, 'PERMISSION_LEVELS', {
    get: function () { return PERM_LEVELS_CACHE; },
    configurable: true
});

// مفاتيح أقسام الأرشيف الفرعية — تُستخدم في DEFAULT_PAGES
var _ARCHIVE_ALL_KEYS = {
    'archive': 1, 'archive-operational': 1,
    'archive-op-contract': 1, 'archive-op-mandate': 1, 'archive-op-letter': 1,
    'archive-financial': 1,
    'archive-fin-invoice-sales': 1, 'archive-fin-invoice-supplier': 1,
    'archive-fin-journal': 1, 'archive-fin-bank': 1, 'archive-fin-tax': 1,
    'archive-reports': 1, 'archive-rep-report': 1, 'archive-rep-budget': 1,
    'archive-official': 1, 'archive-off-gov': 1, 'archive-off-commercial': 1,
    'archive-renewals': 1,
};
var _ARCHIVE_NONE_KEYS = Object.fromEntries(Object.keys(_ARCHIVE_ALL_KEYS).map(function (k) { return [k, 0]; }));

var DEFAULT_PAGES = {
    system_admin: Object.assign({
        dashboard: 1, notifications: 1, 'purchase-requests': 1, transactions: 1, correspondence: 1,
        reservations: 1, 'budget-plans': 1, 'bank-overview': 1, 'bank-accounts': 1,
        'bank-investments': 1, 'daily-payments': 1, 'ceo-approvals': 1,
        sla: 1, performance: 1, settings: 1, 'db-admin': 1,
    }, _ARCHIVE_ALL_KEYS),
    // ② الرئيس التنفيذي — يرى الكل إلا الإعدادات
    CEO: Object.assign({
        dashboard: 1, notifications: 1, 'purchase-requests': 1, transactions: 1, correspondence: 1,
        reservations: 1, 'budget-plans': 1, 'bank-overview': 1, 'bank-accounts': 0,
        'bank-investments': 0, 'daily-payments': 1, 'ceo-approvals': 1,
        sla: 1, performance: 1, settings: 0, 'db-admin': 0,
    }, _ARCHIVE_ALL_KEYS),
    // ③ رئيس القطاع — يرى قطاعه فقط
    sector_head: Object.assign({
        dashboard: 1, notifications: 1, 'purchase-requests': 1, transactions: 1, correspondence: 1,
        reservations: 1, 'budget-plans': 1, 'bank-overview': 1, 'bank-accounts': 1,
        'bank-investments': 1, 'daily-payments': 1, 'ceo-approvals': 1,
        sla: 1, performance: 1, settings: 0, 'db-admin': 0,
    }, _ARCHIVE_ALL_KEYS),
    // ④ مدير القسم — يرى قسمه، البنك: لا
    division_manager: Object.assign({
        dashboard: 1, notifications: 1, 'purchase-requests': 1, transactions: 1, correspondence: 1,
        reservations: 1, 'budget-plans': 1, 'bank-overview': 0, 'bank-accounts': 0,
        'bank-investments': 0, 'daily-payments': 1, 'ceo-approvals': 0,
        sla: 1, performance: 1, settings: 0, 'db-admin': 0,
    }, _ARCHIVE_ALL_KEYS),
    // ⑤ موظف مستوى أول — وصول موسع للتقارير
    employee_l1: Object.assign({
        dashboard: 0, notifications: 1, 'purchase-requests': 1, transactions: 1, correspondence: 1,
        reservations: 1, 'budget-plans': 0, 'bank-overview': 0, 'bank-accounts': 0,
        'bank-investments': 0, 'daily-payments': 1, 'ceo-approvals': 0,
        sla: 0, performance: 1, settings: 0, 'db-admin': 0,
    }, { 'archive': 1, 'archive-financial': 1, 'archive-fin-invoice-sales': 1, 'archive-fin-invoice-supplier': 1, 'archive-fin-bank': 1 }),
    // ⑥ موظف — ما أنشأه فقط
    employee: Object.assign({
        dashboard: 0, notifications: 1, 'purchase-requests': 1, transactions: 1, correspondence: 1,
        reservations: 0, 'budget-plans': 0, 'bank-overview': 0, 'bank-accounts': 0,
        'bank-investments': 0, 'daily-payments': 0, 'ceo-approvals': 0,
        sla: 0, performance: 0, settings: 0, 'db-admin': 0,
    }, _ARCHIVE_NONE_KEYS),
};

/** فتح modal صلاحيات الموظف */
async function openPermissionsModal(empId, empName) {
    DOM.modalTitle.textContent = '🔒 صلاحيات: ' + empName;
    DOM.modalBody.innerHTML = '<div style="text-align:center;padding:2rem"><div class="spinner"></div></div>';
    openModal();

    // تهيئة الجداول تلقائياً إذا لم تكن موجودة
    await fetch('api/settings.php?action=init_permissions').catch(() => { });

    try {
        var res = await fetch('api/settings.php?action=get_employee_permissions&employee_id=' + empId);
        var data = await res.json();
        var perms = data.success ? data.data : { permission_level: 'employee', can_delete: false, pages: {} };
        DOM.modalBody.innerHTML = renderPermissionsForm(empId, empName, perms);
        injectPermissionsStyles();
    } catch (e) {
        DOM.modalBody.innerHTML = '<div style="color:var(--accent-red);padding:1rem">خطأ في تحميل الصلاحيات</div>';
    }
}

/** رسم نموذج الصلاحيات */
function renderPermissionsForm(empId, empName, perms) {
    var level = perms.permission_level || 'employee';
    var pages = perms.pages || {};
    var isSystemAdmin = (level === 'system_admin');

    // مستويات الصلاحية
    var levelsHtml = PERMISSION_LEVELS.map(function (l) {
        var checked = (level === l.value) ? 'checked' : '';
        return '<label class="perm-level-card ' + (level === l.value ? 'selected' : '') + '" data-level="' + l.value + '" onclick="onPermLevelChange(this.querySelector(\'input\'),' + empId + ')">' +
            '<input type="radio" name="permLevel" value="' + l.value + '" ' + checked + ' hidden>' +
            '<div class="perm-level-dot" style="background:' + l.color + '"></div>' +
            '<div>' +
            '<div style="font-weight:700;font-size:.88rem">' + l.label + '</div>' +
            '<div style="font-size:.76rem;color:var(--text-muted)">' + (l.description || l.desc || '') + '</div>' +
            '</div>' +
            '</label>';
    }).join('');

    // صلاحية الحذف
    var canDelChecked = perms.can_delete ? 'checked' : '';

    // الصفحات مجمعة بحسب المجموعة
    var groups = {};
    PAGES_CONFIG.forEach(function (p) {
        if (!groups[p.group]) groups[p.group] = [];
        groups[p.group].push(p);
    });

    var pagesHtml = '';
    Object.keys(groups).forEach(function (g) {
        pagesHtml += '<div class="perm-group">';
        pagesHtml += '<div class="perm-group-label">' + g + '</div>';
        pagesHtml += '<div class="perm-pages-grid">';

        groups[g].forEach(function (pg) {
            var hasAccess = isSystemAdmin ? true : !!(pages[pg.key]);
            var toggleCls = hasAccess ? 'on' : 'off';
            var disabled = isSystemAdmin ? 'disabled' : '';

            pagesHtml += '<div class="perm-page-item" data-page="' + pg.key + '">' +
                '<span class="perm-page-icon">' + pg.icon + '</span>' +
                '<span class="perm-page-name">' + pg.label + '</span>' +
                '<button class="perm-toggle ' + toggleCls + '" ' + disabled + ' ' +
                'onclick="togglePagePerm(this,\'' + pg.key + '\')" ' +
                'title="' + (hasAccess ? 'محجوب حالياً — اضغط للحجب' : 'محجوب — اضغط للسماح') + '">' +
                (hasAccess ?
                    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>' :
                    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>'
                ) +
                '</button>' +
                '</div>';
        });

        pagesHtml += '</div></div>';
    });

    return '<div class="perms-modal-body">' +

        // القسم 1: مستوى الصلاحية
        '<div class="perm-section">' +
        '<h4 class="perm-section-title">🏅 مستوى الصلاحية</h4>' +
        '<div class="perm-levels">' + levelsHtml + '</div>' +
        '</div>' +

        // القسم 2: صلاحية الحذف
        '<div class="perm-section">' +
        '<h4 class="perm-section-title">🗑️ إجراءات خاصة</h4>' +
        '<label class="perm-special-row">' +
        '<input type="checkbox" id="perm_can_delete" ' + canDelChecked + ' ' + (isSystemAdmin ? 'disabled' : '') + '>' +
        '<div>' +
        '<div style="font-weight:600;font-size:.88rem">صلاحية الحذف</div>' +
        '<div style="font-size:.76rem;color:var(--text-muted)">يمكنه حذف المعاملات والموظفين والودائع</div>' +
        '</div>' +
        (isSystemAdmin ? '<span style="font-size:.75rem;color:var(--accent-red);font-weight:600">دائمة لمدير النظام</span>' : '') +
        '</label>' +
        '</div>' +

        // القسم 3: صلاحيات الصفحات
        '<div class="perm-section">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem">' +
        '<h4 class="perm-section-title" style="margin:0">📑 صلاحيات الصفحات</h4>' +
        (!isSystemAdmin ?
            '<div style="display:flex;gap:.5rem">' +
            '<button class="btn btn-ghost-sm" onclick="setAllPages(true)">تحديد الكل</button>' +
            '<button class="btn btn-ghost-sm" onclick="setAllPages(false)">إلغاء الكل</button>' +
            '</div>' : '') +
        '</div>' +
        (isSystemAdmin ?
            '<div style="padding:.75rem;background:rgba(239,68,68,.08);border-radius:8px;font-size:.82rem;color:var(--accent-red)">' +
            '🔓 مدير النظام يملك صلاحية وصول كاملة لا يمكن تقييدها</div>' :
            '<div id="permsPagesContainer">' + pagesHtml + '</div>') +
        '</div>' +

        // القسم 4: صلاحيات الإجراءات
        '<div class="perm-section">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem">' +
        '<h4 class="perm-section-title" style="margin:0">🎛️ صلاحيات الإجراءات</h4>' +
        (!isSystemAdmin ? '<div style="display:flex;gap:.5rem"><button class="btn btn-ghost-sm" onclick="setAllActions(true)">تحديد الكل</button><button class="btn btn-ghost-sm" onclick="setAllActions(false)">إلغاء الكل</button></div>' : '') +
        '</div>' +
        (isSystemAdmin ?
            '<div style="padding:.75rem;background:rgba(239,68,68,.08);border-radius:8px;font-size:.82rem;color:var(--accent-red)">🔓 مدير النظام يملك صلاحية تنفيذ جميع الإجراءات</div>' :
            '<div id="permsActionsContainer">' + buildActionsGrid(perms.action_permissions || {}, level) + '</div>') +
        '</div>' +

        // القسم 5: مراحل الخطابات المسموحة
        '<div class="perm-section">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem">' +
        '<h4 class="perm-section-title" style="margin:0">📨 مراحل الخطابات المسموحة</h4>' +
        (!isSystemAdmin ? '<div style="display:flex;gap:.5rem"><button class="btn btn-ghost-sm" onclick="setAllStages(true)">تحديد الكل</button><button class="btn btn-ghost-sm" onclick="setAllStages(false)">إلغاء الكل</button></div>' : '') +
        '</div>' +
        '<p style="font-size:.82rem;color:var(--text-muted);margin:0 0 .75rem">حدد المراحل التي يسمح لهذا الموظف بالتصرف فيها (موافقة / رفض / إعادة)</p>' +
        (isSystemAdmin ?
            '<div style="padding:.75rem;background:rgba(239,68,68,.08);border-radius:8px;font-size:.82rem;color:var(--accent-red)">🔓 مدير النظام يملك صلاحية التصرف في جميع المراحل</div>' :
            '<div id="permsStagesContainer">' + buildStagesGrid(perms.action_permissions || {}) + '</div>') +
        '</div>' +

        // أزرار الحفظ
        '<div class="perm-footer">' +
        '<button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>' +
        '<button class="btn btn-primary" onclick="savePermissions(' + empId + ', \'' + empName + '\')">' +
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>' +
        ' حفظ الصلاحيات</button>' +
        '</div>' +

        '</div>';
}

/** بناء grid صلاحيات الإجراءات */
function buildActionsGrid(overrides, level) {
    var defaults = {
        system_admin: {},  // كلها true دائماً
        manager: { 'bank.edit_balance': 1, 'bank.view_history': 1, 'bank.record_balance': 1, 'bank.add_deposit': 1, 'bank.confirm_deposit': 1, 'transaction.add': 1, 'transaction.edit': 1, 'transaction.export': 1, 'correspondence.add': 1, 'correspondence.edit': 1, 'correspondence.send': 1, 'correspondence.view_all': 1, 'correspondence.stage_approve': 1, 'correspondence.stage_reject': 1, 'correspondence.stage_return': 1, 'correspondence.stage_edit_completed': 1, 'correspondence.stage_override': 1 },
        employee: { 'bank.record_balance': 1, 'bank.view_history': 1, 'bank.add_deposit': 1, 'transaction.add': 1, 'correspondence.add': 1, 'correspondence.send': 1, 'correspondence.stage_approve': 1, 'correspondence.stage_reject': 1, 'correspondence.stage_return': 1 },
    };
    var def = defaults[level] || {};

    var groups = {};
    ACTIONS_CONFIG.forEach(function (a) {
        if (!groups[a.group]) groups[a.group] = [];
        groups[a.group].push(a);
    });

    var html = '';
    Object.keys(groups).forEach(function (g) {
        html += '<div class="perm-group"><div class="perm-group-label">' + g + '</div>';
        html += '<div class="perm-pages-grid">';
        groups[g].forEach(function (act) {
            var isOn = overrides.hasOwnProperty(act.key) ? !!overrides[act.key] : !!(def[act.key]);
            var cls = isOn ? 'on' : 'off';
            html += '<div class="perm-page-item" data-action="' + act.key + '">' +
                '<span class="perm-page-icon">' + act.icon + '</span>' +
                '<span class="perm-page-name">' + act.label + '</span>' +
                '<button class="perm-toggle ' + cls + '" onclick="toggleActionPerm(this,\'' + act.key + '\')">' +
                (isOn
                    ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>'
                    : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>') +
                '</button></div>';
        });
        html += '</div></div>';
    });
    return html;
}

/** تبديل حالة إجراء */
function toggleActionPerm(btn, actionKey) {
    var isOn = btn.classList.contains('on');
    btn.classList.toggle('on', !isOn);
    btn.classList.toggle('off', isOn);
    btn.innerHTML = !isOn
        ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>'
        : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
}

/** تحديد/إلغاء كل الإجراءات */
function setAllActions(state) {
    document.querySelectorAll('#permsActionsContainer .perm-toggle').forEach(function (btn) {
        btn.classList.toggle('on', state);
        btn.classList.toggle('off', !state);
        btn.innerHTML = state
            ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>'
            : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    });
}


var CORRESPONDENCE_STAGES = [
    { key: 'إنشاء', label: 'إنشاء', types: ['داخلي مالي', 'داخلي عام', 'صادر'] },
    { key: 'مراجعة', label: 'مراجعة', types: ['داخلي مالي', 'صادر'] },
    { key: 'اعتماد', label: 'اعتماد', types: ['داخلي مالي', 'داخلي عام', 'صادر'] },
    { key: 'تسليم', label: 'تسليم', types: ['داخلي مالي', 'داخلي عام'] },
    { key: 'استلام', label: 'استلام', types: ['وارد'] },
    { key: 'توجيه', label: 'توجيه', types: ['وارد'] },
    { key: 'معالجة', label: 'معالجة', types: ['وارد'] },
    { key: 'أرشفة', label: 'أرشفة', types: ['وارد'] },
    { key: 'إرسال', label: 'إرسال', types: ['صادر'] },
];

/** بناء grid مراحل الخطابات */
function buildStagesGrid(overrides) {
    var svgOn = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    var svgOff = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    var html = '<div class="perm-pages-grid">';
    CORRESPONDENCE_STAGES.forEach(function (s) {
        var stageKey = 'correspondence.stage.' + s.key;
        var isOn = overrides.hasOwnProperty(stageKey) ? !!overrides[stageKey] : false;
        var cls = isOn ? 'on' : 'off';
        html += '<div class="perm-page-item" data-stage="' + stageKey + '">' +
            '<span class="perm-page-icon">📋</span>' +
            '<span class="perm-page-name">' + s.label + '</span>' +
            '<span style="font-size:.72rem;color:var(--text-muted);display:block;margin-top:2px">' + s.types.join(' · ') + '</span>' +
            '<button class="perm-toggle ' + cls + '" onclick="toggleStagePerm(this,\'' + stageKey + '\')">' +
            (isOn ? svgOn : svgOff) +
            '</button></div>';
    });
    html += '</div>';
    return html;
}

/** تبديل حالة مرحلة */
function toggleStagePerm(btn, stageKey) {
    var isOn = btn.classList.contains('on');
    btn.classList.toggle('on', !isOn);
    btn.classList.toggle('off', isOn);
    var svgOn = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    var svgOff = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    btn.innerHTML = !isOn ? svgOn : svgOff;
}

/** تحديد/إلغاء كل المراحل */
function setAllStages(state) {
    var svgOn = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    var svgOff = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    document.querySelectorAll('#permsStagesContainer .perm-toggle').forEach(function (btn) {
        btn.classList.toggle('on', state);
        btn.classList.toggle('off', !state);
        btn.innerHTML = state ? svgOn : svgOff;
    });
}


/** تبديل حالة صفحة */
function togglePagePerm(btn, pageKey) {
    var isOn = btn.classList.contains('on');
    btn.classList.toggle('on', !isOn);
    btn.classList.toggle('off', isOn);
    btn.title = !isOn ? 'مسموح — اضغط للحجب' : 'محجوب — اضغط للسماح';
    btn.innerHTML = !isOn
        ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>'
        : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
}

/** تحديد/إلغاء كل الصفحات */
function setAllPages(state) {
    document.querySelectorAll('.perm-toggle:not([disabled])').forEach(function (btn) {
        btn.classList.toggle('on', state);
        btn.classList.toggle('off', !state);
        btn.innerHTML = state
            ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>'
            : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    });
}

/** عند تغيير مستوى الصلاحية → تطبيق الافتراضيات */
function onPermLevelChange(input, empId) {
    // input قد يكون العنصر radio أو العنصر label
    var level = input.value || input.closest?.('[data-level]')?.dataset.level || input.dataset?.level;
    if (!level) return;

    // تأكيد تحديد الـ radio المناسب
    var radio = document.querySelector('input[name="permLevel"][value="' + level + '"]');
    if (radio) radio.checked = true;

    // تحديث تصميم الكارد المختار
    document.querySelectorAll('.perm-level-card').forEach(function (c) {
        c.classList.toggle('selected', c.dataset.level === level);
    });

    // تطبيق إجراءات افتراضية حسب المستوى
    var actionDefaults = {
        manager: [
            'bank.edit_balance', 'bank.view_history', 'bank.record_balance',
            'bank.add_deposit', 'bank.confirm_deposit',
            'transaction.add', 'transaction.edit', 'transaction.export',
            'correspondence.add', 'correspondence.edit', 'correspondence.send', 'correspondence.view_all',
            'correspondence.stage_approve', 'correspondence.stage_reject', 'correspondence.stage_return',
            'correspondence.stage_edit_completed', 'correspondence.stage_override',
            'reservation.add', 'reservation.view_own', 'reservation.view_all',
        ],
        employee: [
            'bank.record_balance', 'bank.view_history', 'bank.add_deposit',
            'transaction.add',
            'correspondence.add', 'correspondence.send',
            'correspondence.stage_approve', 'correspondence.stage_reject', 'correspondence.stage_return',
            'reservation.add', 'reservation.view_own', 'reservation.view_all',
        ],
    };
    var actDef = actionDefaults[level] || [];
    document.querySelectorAll('[data-action]').forEach(function (item) {
        var key = item.dataset.action;
        var btn = item.querySelector('.perm-toggle');
        if (!btn) return;
        var isOn = actDef.includes(key);
        btn.classList.toggle('on', isOn);
        btn.classList.toggle('off', !isOn);
        btn.innerHTML = isOn
            ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>'
            : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    });

    // تطبيق الصفحات الافتراضية
    var defaults = DEFAULT_PAGES[level] || {};
    document.querySelectorAll('.perm-page-item').forEach(function (item) {
        var key = item.dataset.page;
        var btn = item.querySelector('.perm-toggle');
        if (!btn || btn.disabled) return;
        var isOn = !!(defaults[key]);
        btn.classList.toggle('on', isOn);
        btn.classList.toggle('off', !isOn);
        btn.innerHTML = isOn
            ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>'
            : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    });

    // إظهار/إخفاء صلاحية الحذف
    var delChk = document.getElementById('perm_can_delete');
    if (delChk) {
        delChk.disabled = (level === 'system_admin');
        if (level === 'system_admin') delChk.checked = true;
    }
}

/** جمع وحفظ الصلاحيات */
async function savePermissions(empId, empName) {
    var level = document.querySelector('input[name="permLevel"]:checked')?.value || 'employee';
    var canDel = !!(document.getElementById('perm_can_delete')?.checked);

    var pages = {};
    document.querySelectorAll('.perm-page-item').forEach(function (item) {
        var key = item.dataset.page;
        var btn = item.querySelector('.perm-toggle');
        pages[key] = btn ? btn.classList.contains('on') : false;
    });

    var actionPerms = {};
    document.querySelectorAll('[data-action]').forEach(function (item) {
        var key = item.dataset.action;
        var btn = item.querySelector('.perm-toggle');
        actionPerms[key] = btn ? btn.classList.contains('on') : false;
    });
    // إضافة صلاحيات المراحل
    document.querySelectorAll('[data-stage]').forEach(function (item) {
        var key = item.dataset.stage;
        var btn = item.querySelector('.perm-toggle');
        actionPerms[key] = btn ? btn.classList.contains('on') : false;
    });

    try {
        var _tok = (typeof _getCsrfToken === 'function') ? await _getCsrfToken() : (window.csrfToken || '');
        var res = await fetch('api/settings.php?action=save_employee_permissions', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': _tok },
            body: JSON.stringify({
                csrf_token: _tok,
                employee_id: empId,
                permission_level: level,
                can_delete: canDel,
                pages: pages,
                action_permissions: actionPerms
            })
        });
        var data = await res.json();

        if (data.success) {
            showToast('✅ تم حفظ صلاحيات ' + empName, 'success');
            closeModal();
            await loadSettingsEmployees();
            renderEmployeesSection();
        } else {
            showToast('❌ ' + (data.error || 'خطأ في الحفظ'), 'error');
        }
    } catch (e) {
        showToast('❌ خطأ في الاتصال', 'error');
    }
}

/** حقن CSS الصلاحيات */
function injectPermissionsStyles() {
    if (document.getElementById('perms-styles')) return;
    var s = document.createElement('style');
    s.id = 'perms-styles';
    s.textContent = `
        /* ── Modal Body ── */
        .perms-modal-body { display:flex; flex-direction:column; gap:1.25rem; }

        /* ── Sections ── */
        .perm-section { background:var(--bg-surface); border-radius:12px; padding:1rem 1.1rem; }
        .perm-section-title { font-size:.88rem; font-weight:700; color:var(--text-primary); margin:0 0 .75rem; }

        /* ── Level Cards ── */
        .perm-levels { display:flex; flex-direction:column; gap:.5rem; }
        .perm-level-card {
            display:flex; align-items:center; gap:.75rem;
            padding:.7rem 1rem; border-radius:9px;
            border:1.5px solid var(--border-color);
            cursor:pointer; transition:all .2s;
            background: var(--bg-card);
        }
        .perm-level-card:hover { border-color:var(--btn-primary-bg); }
        .perm-level-card.selected {
            border-color:var(--btn-primary-bg);
            background:var(--bg-secondary);
            box-shadow:0 1px 8px rgba(0,0,0,.12);
        }
        .perm-level-dot { width:10px; height:10px; border-radius:50%; flex-shrink:0; }

        /* ── Special Row (delete) ── */
        .perm-special-row {
            display:flex; align-items:center; gap:.85rem;
            padding:.65rem 1rem; border-radius:8px;
            background:var(--bg-card); cursor:pointer;
        }
        .perm-special-row input[type=checkbox] { width:18px; height:18px; cursor:pointer; flex-shrink:0; }

        /* ── Pages Grid ── */
        .perm-group { margin-bottom:.85rem; }
        .perm-group:last-child { margin-bottom:0; }
        .perm-group-label { font-size:.72rem; font-weight:700; text-transform:uppercase;
                            letter-spacing:.07em; color:var(--text-muted); margin-bottom:.4rem; }
        .perm-pages-grid {
            display:grid; grid-template-columns:repeat(auto-fill, minmax(190px, 1fr));
            gap:.4rem;
        }
        .perm-page-item {
            display:flex; align-items:center; gap:.6rem;
            padding:.55rem .85rem; border-radius:8px;
            background:var(--bg-card); border:1px solid var(--border-color);
        }
        .perm-page-icon { font-size:.95rem; flex-shrink:0; }
        .perm-page-name { flex:1; font-size:.82rem; font-weight:500; color:var(--text-secondary); }

        /* ── Toggle ── */
        .perm-toggle {
            width:26px; height:26px; border-radius:6px; border:none; cursor:pointer;
            display:flex; align-items:center; justify-content:center;
            flex-shrink:0; transition:all .18s; font-size:.8rem;
        }
        .perm-toggle.on {
            background:rgba(105,219,124,.18); color:var(--accent-green);
        }
        .perm-toggle.on:hover { background:rgba(105,219,124,.32); }
        .perm-toggle.off {
            background:rgba(239,68,68,.12); color:var(--accent-red);
        }
        .perm-toggle.off:hover { background:rgba(239,68,68,.22); }
        .perm-toggle[disabled] { opacity:.45; cursor:not-allowed; }

        /* ── Footer ── */
        .perm-footer { display:flex; justify-content:flex-start; gap:.625rem; padding-top:.25rem; }

        /* ── Ghost SM Button ── */
        .btn-ghost-sm {
            padding:.3rem .75rem; font-size:.76rem; border-radius:6px;
            border:1px solid var(--border-color); background:transparent;
            color:var(--text-muted); cursor:pointer; transition:all .15s;
            font-family:inherit;
        }
        .btn-ghost-sm:hover { background:var(--bg-surface); color:var(--text-primary); }

        @media (max-width:560px) {
            .perm-pages-grid { grid-template-columns:1fr 1fr; }
        }
    `;
    document.head.appendChild(s);
}
// ══════════════════════════════════════════════════════
// النموذج الاحترافي الموحد — two-column layout + tabs
// ══════════════════════════════════════════════════════

async function openProfModal(id) {
    var emp = id ? (SettingsData.employees || []).find(function (e) { return e.id == id; }) || {} : {};
    if (!PERM_LEVELS_CACHE.length) await loadPermissionLevels();

    DOM.modalTitle.textContent = id ? 'تعديل بيانات الموظف والصلاحيات' : 'إضافة موظف';
    DOM.modalBody.innerHTML = '<div style="text-align:center;padding:3rem"><div class="spinner"></div></div>';
    openModal('xl');

    var perms = { permission_level: emp.permission_level || 'employee', can_delete: false, pages: {}, action_permissions: {} };
    if (id) {
        try {
            var r = await fetch('api/settings.php?action=get_employee_permissions&employee_id=' + id);
            var d = await r.json();
            if (d.success) perms = d.data;
        } catch (e) { }
    }

    injectProfStyles();
    DOM.modalBody.innerHTML = _buildProfModal(emp, perms);
    document.querySelector('.modal').classList.add('prof-modal');
    onSectorChange(document.getElementById('profSector'));
    if (emp.role) onRoleChange({ value: emp.role, id: 'profRole', dataset: { prevRole: emp.role } });
    profSwitchTab('pages');
}

function _buildProfModal(emp, perms) {
    emp = emp || {};
    perms = perms || {};
    var id = emp.id || '';
    var sectors = SettingsData.sectors || [];
    var divisions = SettingsData.divisions || [];
    var employees2 = SettingsData.employees || [];
    var curSector = emp.sector_id || emp.department_id || '';
    var level = perms.permission_level || 'employee';
    var pages = perms.pages || {};
    var actionPerms = perms.action_permissions || {};
    var isAdmin = (level === 'system_admin');
    var empPermCode = emp.permission_level_code || level;

    var initials = (emp.name || 'م').split(' ').slice(0, 2).map(function (w) { return w[0] || ''; }).join('');

    var levelFound = (PERM_LEVELS_CACHE || []).find(function (p) { return p.code === empPermCode; });
    var levelColor = (levelFound || {}).color || '#6b7280';
    var levelLabel = (levelFound || {}).label || empPermCode;
    var roleName = getRoleName(emp.role);
    var roleColor = getRoleColor(emp.role);

    // sector options
    var secOpts = '<option value="">\u2014 \u0628\u062f\u0648\u0646 \u0642\u0637\u0627\u0639 \u2014</option>'
        + sectors.map(function (s) {
            var lbl = s.name + (s.name_en && s.name_en !== s.name ? ' \u2014 ' + s.name_en : '');
            return '<option value="' + s.id + '"' + (curSector == s.id ? ' selected' : '') + '>' + lbl + '</option>';
        }).join('');

    var divOpts = '<option value="">\u2014 \u0628\u062f\u0648\u0646 \u0642\u0633\u0645 \u2014</option>'
        + divisions.map(function (d) {
            var sid = d.sector_id || d.parent_id || '';
            var hid = (curSector && String(sid) !== String(curSector)) ? 'hidden' : '';
            return '<option value="' + d.id + '" data-sector="' + sid + '"' + (emp.division_id == d.id ? ' selected' : '') + ' ' + hid + '>' + d.name + '</option>';
        }).join('');

    var supOpts = '<option value="">\u2014</option>'
        + employees2.filter(function (e) { return e.is_active != 0 && e.id != id; })
            .map(function (e) { return '<option value="' + e.id + '"' + (emp.supervisor_id == e.id ? ' selected' : '') + '>' + e.name + '</option>'; }).join('');

    var roleDesc = (SYSTEM_ROLES.find(function (r) { return r.value === emp.role; }) || {}).desc || '';

    // ── Tab 1: مستوى الصلاحية ──
    var levelCardsHtml = (PERM_LEVELS_CACHE || []).map(function (l) {
        var sel = (empPermCode === l.code) ? 'prof-level-selected' : '';
        return '<div class="prof-level-card ' + sel + '" data-lcode="' + l.code + '" style="--lc:' + l.color + '" onclick="profPickLevel(this)">'
            + '<span class="prof-level-dot" style="background:' + l.color + '"></span>'
            + '<div><div class="prof-level-name">' + l.label + '</div>'
            + '<div class="prof-level-desc">' + (l.description || l.desc || '') + '</div></div>'
            + '</div>';
    }).join('');

    // ── Tab 2: صلاحيات الصفحات ──
    var pGroups = {};
    PAGES_CONFIG.forEach(function (p) { if (!pGroups[p.group]) pGroups[p.group] = []; pGroups[p.group].push(p); });
    var pagesTabHtml = '';
    Object.keys(pGroups).forEach(function (g) {
        if (g === 'الأرشيف المالي') {
            // الأرشيف — عرض مفصّل بقسم خاص
            pagesTabHtml += '<div class="prof-pgroup-title prof-archive-hdr">🗂️ الأرشيف المالي</div>';
            // تعريف البطاقات الرئيسية للأرشيف
            var archiveBlocks = [
                { key: 'archive', label: 'جميع المستندات', icon: '📂', desc: 'عرض موحد', color: '#6b7280', children: [] },
                {
                    key: 'archive-operational', label: 'مستندات تشغيلية', icon: '📋', desc: 'عقود · تعميدات · خطابات', color: '#1D9E75',
                    children: [
                        { key: 'archive-op-contract', label: 'العقود والاتفاقيات' },
                        { key: 'archive-op-mandate', label: 'التعميدات والتفويضات' },
                        { key: 'archive-op-letter', label: 'الخطابات والمراسلات' },
                    ]
                },
                {
                    key: 'archive-financial', label: 'مستندات مالية', icon: '💰', desc: 'فواتير · قيود · بنكية · ضرائب', color: '#185FA5',
                    children: [
                        { key: 'archive-fin-invoice-sales', label: 'فواتير مبيعات' },
                        { key: 'archive-fin-invoice-supplier', label: 'فواتير موردين' },
                        { key: 'archive-fin-journal', label: 'قيود يومية' },
                        { key: 'archive-fin-bank', label: 'مستندات بنكية' },
                        { key: 'archive-fin-tax', label: 'ضرائب وزكاة' },
                    ]
                },
                {
                    key: 'archive-reports', label: 'تقارير وموازنة', icon: '📊', desc: 'تقارير مالية · موازنة وتخطيط', color: '#854F0B',
                    children: [
                        { key: 'archive-rep-report', label: 'تقارير مالية' },
                        { key: 'archive-rep-budget', label: 'موازنة وتخطيط' },
                    ]
                },
                {
                    key: 'archive-official', label: 'وثائق رسمية', icon: '🏛️', desc: 'حكومية · سجلات تجارية', color: '#534AB7',
                    children: [
                        { key: 'archive-off-gov', label: 'وثائق حكومية' },
                        { key: 'archive-off-commercial', label: 'سجلات تجارية' },
                    ]
                },
                { key: 'archive-renewals', label: 'التجديد والصلاحيات', icon: '🔄', desc: 'تتبع انتهاء الوثائق', color: '#993C1D', children: [] },
            ];
            archiveBlocks.forEach(function (blk) {
                var mainOn = isAdmin ? true : !!(pages[blk.key]);
                var hasChildren = blk.children.length > 0;
                var blockId = 'arch-blk-' + blk.key;
                // header البطاقة
                pagesTabHtml += '<div class="prof-arch-block" style="--abcolor:' + blk.color + '">'
                    + '<div class="prof-arch-hdr"' + (hasChildren ? ' onclick="profArchToggleBlock(\'' + blockId + '\')"' : '') + '>'
                    + '<span class="prof-arch-icon">' + blk.icon + '</span>'
                    + '<div class="prof-arch-meta"><div class="prof-arch-name">' + blk.label + '</div>'
                    + '<div class="prof-arch-desc">' + blk.desc + '</div></div>'
                    + (hasChildren ? '<span class="prof-arch-chevron" id="' + blockId + '-chev">▸</span>' : '')
                    + '<label class="prof-arch-tog-wrap" onclick="event.stopPropagation()">'
                    + '<span class="prof-toggle' + (mainOn ? ' on' : '') + '" data-page="' + blk.key + '" onclick="profTogglePage(this,\'' + blk.key + '\')"><span class="prof-knob"></span></span>'
                    + '</label>'
                    + '</div>';
                // الأقسام الفرعية
                if (hasChildren) {
                    pagesTabHtml += '<div class="prof-arch-children" id="' + blockId + '" style="display:none">';
                    blk.children.forEach(function (ch) {
                        var chOn = isAdmin ? true : !!(pages[ch.key]);
                        pagesTabHtml += '<label class="prof-arch-child" onclick="profTogglePage(this,\'' + ch.key + '\')">'
                            + '<span class="prof-arch-child-name">' + ch.label + '</span>'
                            + '<span class="prof-toggle' + (chOn ? ' on' : '') + '" data-page="' + ch.key + '"><span class="prof-knob"></span></span>'
                            + '</label>';
                    });
                    pagesTabHtml += '</div>';
                }
                pagesTabHtml += '</div>';
            });
        } else {
            pagesTabHtml += '<div class="prof-pgroup-title">' + g + '</div>';
            pGroups[g].forEach(function (pg) {
                var isOn = isAdmin ? true : !!(pages[pg.key]);
                pagesTabHtml += '<label class="prof-prow" onclick="profTogglePage(this,\'' + pg.key + '\')">'
                    + '<span class="prof-prow-icon">' + pg.icon + '</span>'
                    + '<span class="prof-prow-label">' + pg.label + '</span>'
                    + '<span class="prof-toggle' + (isOn ? ' on' : '') + '" data-page="' + pg.key + '"><span class="prof-knob"></span></span>'
                    + '</label>';
            });
        }
    });

    // ── Tab 3: صلاحيات الإجراءات ──
    var aGroups = {};
    ACTIONS_CONFIG.forEach(function (a) { if (!aGroups[a.group]) aGroups[a.group] = []; aGroups[a.group].push(a); });
    var actionDefaults = {
        manager: { 'bank.edit_balance': 1, 'bank.view_history': 1, 'bank.record_balance': 1, 'bank.add_deposit': 1, 'bank.confirm_deposit': 1, 'transaction.add': 1, 'transaction.edit': 1, 'transaction.export': 1, 'correspondence.add': 1, 'correspondence.edit': 1, 'correspondence.send': 1, 'correspondence.view_all': 1, 'correspondence.stage_approve': 1, 'correspondence.stage_reject': 1, 'correspondence.stage_return': 1 },
        employee: { 'bank.record_balance': 1, 'bank.view_history': 1, 'bank.add_deposit': 1, 'transaction.add': 1, 'correspondence.add': 1, 'correspondence.send': 1, 'correspondence.stage_approve': 1, 'correspondence.stage_reject': 1, 'correspondence.stage_return': 1 }
    };
    var aDef = actionDefaults[level] || {};
    var actTabHtml = '';
    Object.keys(aGroups).forEach(function (g) {
        actTabHtml += '<div class="prof-pgroup-title">' + g + '</div>';
        aGroups[g].forEach(function (act) {
            var isOn = actionPerms.hasOwnProperty(act.key) ? !!actionPerms[act.key] : !!(aDef[act.key]);
            actTabHtml += '<label class="prof-prow" onclick="profToggleAction(this,\'' + act.key + '\')">'
                + '<span class="prof-prow-icon">' + act.icon + '</span>'
                + '<span class="prof-prow-label">' + act.label + '</span>'
                + '<span class="prof-toggle' + (isOn ? ' on' : '') + '" data-action="' + act.key + '"><span class="prof-knob"></span></span>'
                + '</label>';
        });
    });

    // ── Tab 4: مراحل الخطابات ──
    var stagesTabHtml = '<p class="prof-tab-note">\u062d\u062f\u062f \u0627\u0644\u0645\u0631\u0627\u062d\u0644 \u0627\u0644\u062a\u064a \u064a\u0633\u0645\u062d \u0644\u0647\u0630\u0627 \u0627\u0644\u0645\u0648\u0638\u0641 \u0628\u0627\u0644\u062a\u0635\u0631\u0641 \u0641\u064a\u0647\u0627</p>';
    CORRESPONDENCE_STAGES.forEach(function (s) {
        var sk = 'correspondence.stage.' + s.key;
        var isOn = actionPerms.hasOwnProperty(sk) ? !!actionPerms[sk] : false;
        stagesTabHtml += '<label class="prof-prow" onclick="profToggleAction(this,\'' + sk + '\')">'
            + '<span class="prof-prow-icon">\ud83d\udccb</span>'
            + '<span class="prof-prow-label">' + s.label + ' <span class="prof-prow-types">' + s.types.join(' \u00b7 ') + '</span></span>'
            + '<span class="prof-toggle' + (isOn ? ' on' : '') + '" data-action="' + sk + '"><span class="prof-knob"></span></span>'
            + '</label>';
    });

    var adminBanner = '<div class="prof-admin-banner">\ud83d\udd13 \u0645\u062f\u064a\u0631 \u0627\u0644\u0646\u0638\u0627\u0645 \u064a\u0645\u0644\u0643 \u0635\u0644\u0627\u062d\u064a\u0629 \u0643\u0627\u0645\u0644\u0629</div>';

    return '<input type="hidden" id="profId" value="' + id + '">'
        + '<input type="hidden" id="profPermLevel" value="' + empPermCode + '">'
        + '<div class="prof-body">'

        // ── الشريط الجانبي ──
        + '<div class="prof-sidebar">'
        + '<div class="prof-avatar">' + initials + '</div>'
        + '<div class="prof-emp-name">' + (emp.name || '\u0645\u0648\u0638\u0641 \u062c\u062f\u064a\u062f') + '</div>'
        + '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:12px">'
        + (emp.role ? '<span class="prof-badge" style="background:' + roleColor + '18;color:' + roleColor + '">' + roleName + '</span>' : '')
        + '<span class="prof-badge" style="background:' + levelColor + '18;color:' + levelColor + '">' + levelLabel + '</span>'
        + '</div>'
        + '<div class="prof-sep"></div>'
        + '<div class="prof-field"><label>\u0631\u0642\u0645 \u0627\u0644\u0645\u0648\u0638\u0641</label><input id="profNumber" class="prof-input" value="' + (emp.employee_number || '') + '" placeholder="EMP-001"></div>'
        + '<div class="prof-field"><label>\u0627\u0644\u0627\u0633\u0645 \u0627\u0644\u0643\u0627\u0645\u0644</label><input id="profName" class="prof-input" value="' + (emp.name || '') + '" placeholder="\u0627\u0644\u0627\u0633\u0645" oninput="profUpdateAvatar(this.value)"></div>'
        + '<div class="prof-grid2">'
        + '<div class="prof-field"><label>\u0627\u0644\u0628\u0631\u064a\u062f</label><input id="profEmail" type="email" class="prof-input" value="' + (emp.email || '') + '" placeholder="email@co.com"></div>'
        + '<div class="prof-field"><label>\u0627\u0644\u0647\u0627\u062a\u0641</label><input id="profPhone" class="prof-input" value="' + (emp.phone || '') + '" placeholder="05xxxxxxxx"></div>'
        + '</div>'
        + '<div class="prof-sep"></div>'
        + '<div class="prof-field"><label>\u0627\u0644\u0642\u0637\u0627\u0639</label><select id="profSector" class="prof-select" onchange="onSectorChange(this);profSyncDivisions()"><option value="">\u2014</option>' + secOpts + '</select></div>'
        + '<div class="prof-field"><label>\u0627\u0644\u0642\u0633\u0645</label><select id="profDivision" class="prof-select"><option value="">\u2014</option>' + divOpts + '</select></div>'
        + '<div class="prof-field"><label>\u0627\u0644\u062f\u0648\u0631</label>'
        + '<select id="profRole" class="prof-select" data-prev-role="' + (emp.role || '') + '" onchange="onRoleChange(this)">'
        + '<option value="">\u2014 \u0627\u062e\u062a\u0631 \u2014</option>' + buildRoleOptions(emp.role || '', curSector) + '</select>'
        + '<div id="roleHint" class="prof-hint">' + roleDesc + '</div></div>'
        + '<div class="prof-field"><label>\u0627\u0644\u0645\u0634\u0631\u0641</label><select id="profSupervisor" class="prof-select"><option value="">\u2014</option>' + supOpts + '</select></div>'
        + '</div>'

        // ── المنطقة الرئيسية ──
        + '<div class="prof-main">'
        + '<div class="prof-tabs">'
        + '<button class="prof-tab" data-tab="level" onclick="profSwitchTab(\'level\')">\ud83c\udfc5 \u0645\u0633\u062a\u0648\u0649 \u0627\u0644\u0635\u0644\u0627\u062d\u064a\u0629</button>'
        + '<button class="prof-tab prof-tab-active" data-tab="pages" onclick="profSwitchTab(\'pages\')">\ud83d\udcd1 \u0635\u0644\u0627\u062d\u064a\u0627\u062a \u0627\u0644\u0635\u0641\u062d\u0627\u062a</button>'
        + '<button class="prof-tab" data-tab="actions" onclick="profSwitchTab(\'actions\')">\ud83c\udf9b\ufe0f \u0635\u0644\u0627\u062d\u064a\u0627\u062a \u0627\u0644\u0625\u062c\u0631\u0627\u0621\u0627\u062a</button>'
        + '<button class="prof-tab" data-tab="stages" onclick="profSwitchTab(\'stages\')">\ud83d\udce8 \u0645\u0631\u0627\u062d\u0644 \u0627\u0644\u062e\u0637\u0627\u0628\u0627\u062a</button>'
        + '</div>'

        // محتوى التبويبات
        + '<div class="prof-tab-content" id="prof-tab-level" style="display:none">'
        + '<div class="prof-tc-header"><span>\u0627\u062e\u062a\u0631 \u0645\u0633\u062a\u0648\u0649 \u0627\u0644\u0635\u0644\u0627\u062d\u064a\u0629</span></div>'
        + '<div class="prof-level-grid">' + levelCardsHtml + '</div>'
        + '</div>'

        + '<div class="prof-tab-content" id="prof-tab-pages" style="display:block">'
        + '<div class="prof-tc-header"><span>صلاحيات الصفحات</span>'
        + (!isAdmin ? '<div class="prof-tc-actions"><button class="prof-sm-btn" onclick="profSetAllPages(true)">تفعيل الكل</button><button class="prof-sm-btn" onclick="profSetAllPages(false)">إيقاف الكل</button></div>' : '')
        + '</div>'
        + (isAdmin ? adminBanner : '<div class="prof-prows-wrap">' + pagesTabHtml + '</div>')
        + '</div>'

        + '<div class="prof-tab-content" id="prof-tab-actions" style="display:none">'
        + '<div class="prof-tc-header"><span>\u0635\u0644\u0627\u062d\u064a\u0627\u062a \u0627\u0644\u0625\u062c\u0631\u0627\u0621\u0627\u062a</span>'
        + (!isAdmin ? '<div class="prof-tc-actions"><button class="prof-sm-btn" onclick="profSetAllToggles(\'.prof-toggle[data-action]\',true)">\u062a\u0641\u0639\u064a\u0644 \u0627\u0644\u0643\u0644</button><button class="prof-sm-btn" onclick="profSetAllToggles(\'.prof-toggle[data-action]\',false)">\u0625\u064a\u0642\u0627\u0641 \u0627\u0644\u0643\u0644</button></div>' : '')
        + '</div>'
        + (isAdmin ? adminBanner : '<div class="prof-prows-wrap">' + actTabHtml + '</div>')
        + '</div>'

        + '<div class="prof-tab-content" id="prof-tab-stages" style="display:none">'
        + '<div class="prof-tc-header"><span>\u0645\u0631\u0627\u062d\u0644 \u0627\u0644\u062e\u0637\u0627\u0628\u0627\u062a</span>'
        + (!isAdmin ? '<div class="prof-tc-actions"><button class="prof-sm-btn" onclick="profSetAllToggles(\'.prof-toggle[data-action*=\\\"correspondence.stage\\\"]\',true)">\u062a\u0641\u0639\u064a\u0644 \u0627\u0644\u0643\u0644</button><button class="prof-sm-btn" onclick="profSetAllToggles(\'.prof-toggle[data-action*=\\\"correspondence.stage\\\"]\',false)">\u0625\u064a\u0642\u0627\u0641 \u0627\u0644\u0643\u0644</button></div>' : '')
        + '</div>'
        + (isAdmin ? adminBanner : '<div class="prof-prows-wrap">' + stagesTabHtml + '</div>')
        + '</div>'

        + '</div>'
        + '</div>'

        // ── footer ──
        + '<div class="prof-footer">'
        + '<label class="prof-del-row">'
        + '<span class="prof-toggle-mini' + (perms.can_delete ? ' on' : '') + '" id="profCanDelete" onclick="event.stopPropagation();this.classList.toggle(\'on\')"><span class="prof-knob"></span></span>'
        + '<span style="font-size:13px;color:var(--text-secondary)">\ud83d\uddd1\ufe0f \u0635\u0644\u0627\u062d\u064a\u0629 \u0627\u0644\u062d\u0630\u0641</span>'
        + '<span style="font-size:11.5px;color:var(--text-muted)">\u062d\u0630\u0641 \u0627\u0644\u0645\u0639\u0627\u0645\u0644\u0627\u062a \u0648\u0627\u0644\u0645\u0648\u0638\u0641\u064a\u0646 \u0648\u0627\u0644\u0648\u062f\u0627\u0626\u0639</span>'
        + '</label>'
        + '<div style="display:flex;gap:8px">'
        + '<button class="prof-btn ghost" onclick="closeModal()">\u0625\u0644\u063a\u0627\u0621</button>'
        + '<button class="prof-btn primary" onclick="saveProfEmployee()">'
        + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>'
        + (id ? ' \u062d\u0641\u0638 \u0627\u0644\u062a\u0639\u062f\u064a\u0644\u0627\u062a' : ' \u0625\u0636\u0627\u0641\u0629 \u0645\u0648\u0638\u0641')
        + '</button></div>'
        + '</div>';
}

function profSwitchTab(name) {
    document.querySelectorAll('.prof-tab').forEach(function (t) { t.classList.toggle('prof-tab-active', t.dataset.tab === name); });
    document.querySelectorAll('.prof-tab-content').forEach(function (c) { c.style.display = 'none'; });
    var el = document.getElementById('prof-tab-' + name);
    if (el) el.style.display = 'block';
}

function profPickLevel(card) {
    document.querySelectorAll('.prof-level-card').forEach(function (c) { c.classList.remove('prof-level-selected'); });
    card.classList.add('prof-level-selected');
    var code = card.dataset.lcode;
    document.getElementById('profPermLevel').value = code;
    var defs = DEFAULT_PAGES[code] || DEFAULT_PAGES['employee'] || {};
    document.querySelectorAll('.prof-toggle[data-page]').forEach(function (t) {
        t.classList.toggle('on', !!(defs[t.dataset.page]));
    });
}

function profTogglePage(el, key) {
    var t = el.classList && el.classList.contains('prof-toggle')
        ? el
        : (el.querySelector ? el.querySelector('.prof-toggle[data-page="' + key + '"]') : null);
    if (t) t.classList.toggle('on');
}

function profArchToggleBlock(id) {
    var body = document.getElementById(id);
    var chev = document.getElementById(id + '-chev');
    if (!body) return;
    var open = body.style.display !== 'none';
    body.style.display = open ? 'none' : 'block';
    if (chev) chev.textContent = open ? '▸' : '▾';
}

function profToggleAction(label, key) {
    var t = label.querySelector('.prof-toggle[data-action="' + key + '"]');
    if (t) t.classList.toggle('on');
}
function profSetAllToggles(sel, state) {
    document.querySelectorAll(sel).forEach(function (t) { t.classList.toggle('on', state); });
}

function profSetAllPages(state) {
    // تفعيل/إيقاف جميع صفحات بما فيها أقسام الأرشيف الفرعية
    document.querySelectorAll('.prof-toggle[data-page]').forEach(function (t) { t.classList.toggle('on', state); });
    // فتح جميع بطاقات الأرشيف عند التفعيل
    if (state) {
        document.querySelectorAll('.prof-arch-children').forEach(function (b) {
            b.style.display = 'block';
            var chev = document.getElementById(b.id + '-chev');
            if (chev) chev.textContent = '▾';
        });
    }
}
function profUpdateAvatar(val) {
    var av = document.querySelector('.prof-avatar');
    if (!av) return;
    av.textContent = (val || 'م').split(' ').slice(0, 2).map(function (w) { return w[0] || ''; }).join('');
    document.querySelector('.prof-emp-name') && (document.querySelector('.prof-emp-name').textContent = val || '\u0645\u0648\u0638\u0641 \u062c\u062f\u064a\u062f');
}
function profSyncDivisions() {
    var sec = document.getElementById('profSector');
    var div = document.getElementById('profDivision');
    if (!sec || !div) return;
    var sid = sec.value;
    div.querySelectorAll('option[data-sector]').forEach(function (o) {
        o.hidden = sid ? (o.dataset.sector !== sid) : false;
    });
    div.value = '';
}

async function saveProfEmployee() {
    var id = document.getElementById('profId').value;
    var level = document.getElementById('profPermLevel').value || 'employee';
    var canDel = !!(document.getElementById('profCanDelete') && document.getElementById('profCanDelete').classList.contains('on'));

    var empData = {
        id: id || undefined,
        name: document.getElementById('profName') && document.getElementById('profName').value,
        email: document.getElementById('profEmail') && document.getElementById('profEmail').value,
        phone: document.getElementById('profPhone') && document.getElementById('profPhone').value,
        role: document.getElementById('profRole') && document.getElementById('profRole').value,
        employee_number: document.getElementById('profNumber') && document.getElementById('profNumber').value,
        supervisor_id: document.getElementById('profSupervisor') && document.getElementById('profSupervisor').value || null,
        sector_id: document.getElementById('profSector') && document.getElementById('profSector').value || null,
        division_id: document.getElementById('profDivision') && document.getElementById('profDivision').value || null,
        department_id: document.getElementById('profSector') && document.getElementById('profSector').value || null,
        permission_level_code: level,
    };
    if (!empData.name) { showToast('\u0627\u0633\u0645 \u0627\u0644\u0645\u0648\u0638\u0641 \u0645\u0637\u0644\u0648\u0628', 'error'); return; }

    var pages = {};
    document.querySelectorAll('.prof-toggle[data-page]').forEach(function (t) { pages[t.dataset.page] = t.classList.contains('on'); });
    var actionPerms = {};
    document.querySelectorAll('.prof-toggle[data-action]').forEach(function (t) { actionPerms[t.dataset.action] = t.classList.contains('on'); });

    try {
        var _tok = (typeof _getCsrfToken === 'function') ? await _getCsrfToken() : (window.csrfToken || '');
        var _csrfHeaders = { 'Content-Type': 'application/json', 'X-CSRF-Token': _tok };
        var a = id ? 'update_employee' : 'add_employee';
        var r1 = await fetch('api/settings.php?action=' + a, { method: 'POST', credentials: 'same-origin', headers: _csrfHeaders, body: JSON.stringify(Object.assign({ csrf_token: _tok }, empData)) });
        var d1 = await r1.json();
        if (!d1.success) { showToast('\u274c ' + (d1.message || '\u062e\u0637\u0623'), 'error'); return; }
        var empId = id || d1.id;
        var r2 = await fetch('api/settings.php?action=save_employee_permissions', {
            method: 'POST', credentials: 'same-origin', headers: _csrfHeaders,
            body: JSON.stringify({ csrf_token: _tok, employee_id: empId, permission_level: level, can_delete: canDel, pages: pages, action_permissions: actionPerms })
        });
        var d2 = await r2.json();
        showToast('\u2705 \u062a\u0645 \u0627\u0644\u062d\u0641\u0638 \u0628\u0646\u062c\u0627\u062d', 'success');
        closeModal();
        await loadSettingsEmployees();
        renderEmployeesSection();
    } catch (e) { showToast('\u274c \u062e\u0637\u0623 \u0641\u064a \u0627\u0644\u0627\u062a\u0635\u0627\u0644', 'error'); }
}

function injectProfStyles() {
    if (document.getElementById('prof-css')) return;
    var s = document.createElement('style'); s.id = 'prof-css';
    s.textContent = [
        // modal sizing - use system variables
        '.prof-modal .modal{max-width:960px!important;width:94vw!important;max-height:92vh!important;overflow:hidden!important;border-radius:20px!important;display:flex!important;flex-direction:column!important}',
        '.prof-modal .modal-body,.prof-modal #modal-body{padding:0!important;overflow-y:auto!important;max-height:calc(90vh - 70px)!important;display:flex!important;flex-direction:column!important}',

        // layout
        '.prof-body{display:grid;grid-template-columns:270px 1fr;flex:1;overflow:hidden;min-height:460px}',

        // sidebar - uses system bg-surface
        '.prof-sidebar{background:var(--bg-surface);border-left:1px solid var(--border-color);padding:16px 14px;overflow-y:auto;min-height:460px;max-height:calc(90vh - 130px);display:flex;flex-direction:column;gap:0}',
        '.prof-avatar{width:46px;height:46px;border-radius:50%;background:var(--btn-primary-bg);display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;color:var(--btn-primary-text);margin-bottom:8px;flex-shrink:0}',
        '.prof-emp-name{font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:6px;line-height:1.3}',
        '.prof-badge{display:inline-flex;align-items:center;font-size:11px;padding:2px 8px;border-radius:8px;font-weight:500;border:1px solid currentColor}',
        '.prof-sep{height:1px;background:var(--border-color);margin:10px 0;flex-shrink:0}',
        '.prof-field{margin-bottom:8px}',
        '.prof-field label{display:block;font-size:11px;font-weight:600;color:var(--text-muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em}',
        '.prof-hint{font-size:11px;color:var(--text-muted);margin-top:3px;font-style:italic;line-height:1.3}',
        // inputs/selects match system form-input exactly
        '.prof-input,.prof-select{width:100%;padding:.5rem .75rem;border-radius:10px;border:1px solid var(--border-color);background:var(--bg-card);color:var(--text-primary);font-family:inherit;font-size:.82rem;transition:all .2s;outline:none}',
        '.prof-input:focus,.prof-select:focus{border-color:var(--btn-primary-bg);box-shadow:0 0 0 3px rgba(148,137,121,.2)}',
        '.prof-input::placeholder{color:var(--text-muted)}',
        '.prof-grid2{display:grid;grid-template-columns:1fr 1fr;gap:7px}',

        // main area
        '.prof-main{display:flex;flex-direction:column;overflow:hidden;height:100%;background:var(--bg-primary)}',

        // tabs bar
        '.prof-tabs{display:flex;border-bottom:1px solid var(--border-color);background:var(--bg-card);flex-shrink:0;overflow-x:auto;padding:0 4px}',
        '.prof-tab{padding:11px 14px;font-size:12.5px;color:var(--text-muted);border:none;background:transparent;cursor:pointer;border-bottom:2px solid transparent;white-space:nowrap;transition:all .2s;font-family:inherit;font-weight:500}',
        '.prof-tab:hover{color:var(--text-primary);background:rgba(148,137,121,.08)}',
        '.prof-tab-active{color:var(--text-primary)!important;border-bottom-color:var(--btn-primary-bg)!important}',
        '.prof-tab-content{flex:1;overflow-y:auto;height:0;min-height:0;background:var(--bg-primary)}',

        // tab inner
        '.prof-tc-header{display:flex;align-items:center;justify-content:space-between;padding:11px 14px;border-bottom:1px solid var(--border-color);font-size:12px;font-weight:600;color:var(--text-secondary);position:sticky;top:0;background:var(--bg-card);z-index:1;text-transform:uppercase;letter-spacing:.04em}',
        '.prof-tc-actions{display:flex;gap:5px}',
        '.prof-sm-btn{padding:4px 11px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-surface);color:var(--text-secondary);font-size:11.5px;cursor:pointer;font-family:inherit;transition:all .2s}',
        '.prof-sm-btn:hover{background:var(--bg-card);color:var(--text-primary)}',
        '.prof-tab-note{font-size:12px;color:var(--text-muted);padding:10px 14px;font-style:italic}',
        '.prof-admin-banner{margin:12px 14px;padding:10px 14px;background:rgba(250,82,82,.1);border:1px solid rgba(250,82,82,.3);border-radius:10px;font-size:12.5px;color:var(--accent-red)}',

        // perm rows - 2-col grid
        '.prof-prows-wrap{padding:8px 10px 16px;display:grid;grid-template-columns:1fr 1fr;gap:0 6px}',
        '.prof-pgroup-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);padding:9px 8px 5px;border-bottom:1px solid var(--border-color);margin-bottom:2px;grid-column:1/-1}',
        '.prof-prow{display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:8px;cursor:pointer;transition:background .15s;user-select:none}',
        '.prof-prow:hover{background:var(--bg-surface)}',
        '.prof-prow-icon{font-size:13px;width:18px;text-align:center;flex-shrink:0}',
        '.prof-prow-label{flex:1;font-size:12.5px;color:var(--text-primary);line-height:1.2}',
        '.prof-prow-types{font-size:10.5px;color:var(--text-muted);display:block;margin-top:1px}',

        // level grid - 3 cols
        '.prof-level-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;padding:14px}',
        '.prof-level-card{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;border:1px solid var(--border-color);cursor:pointer;transition:all .2s;background:var(--bg-card)}',
        '.prof-level-card:hover{border-color:var(--lc,#948979);background:var(--bg-surface)}',
        '.prof-level-selected{border-color:var(--lc,#948979)!important;background:var(--bg-surface)!important;box-shadow:0 0 0 3px color-mix(in srgb,var(--lc,#948979) 20%,transparent)}',
        '.prof-level-dot{width:9px;height:9px;border-radius:50%;flex-shrink:0}',
        '.prof-level-name{font-size:12.5px;font-weight:600;color:var(--text-primary)}',
        '.prof-level-desc{font-size:11px;color:var(--text-muted);margin-top:1px}',

        // toggles
        '.prof-toggle{position:relative;width:38px;height:21px;border-radius:11px;background:var(--bg-surface);border:1px solid var(--border-color);flex-shrink:0;cursor:pointer;display:inline-block;transition:background .2s,border-color .2s;vertical-align:middle}',
        '.prof-toggle.on{background:var(--accent-green);border-color:var(--accent-green)}',
        '.prof-knob{position:absolute;top:2px;left:2px;width:15px;height:15px;border-radius:50%;background:var(--bg-card);transition:transform .18s;pointer-events:none;box-shadow:0 1px 3px rgba(0,0,0,.25)}',
        '.prof-toggle.on .prof-knob{transform:translateX(17px);background:#fff}',

        // footer
        '.prof-footer{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-top:1px solid var(--border-color);background:var(--bg-card);flex-shrink:0;position:sticky;bottom:0;z-index:10}',
        '.prof-del-row{display:flex;align-items:center;gap:8px;cursor:pointer}',
        '.prof-toggle-mini{position:relative;width:32px;height:18px;border-radius:9px;background:var(--bg-surface);border:1px solid var(--border-color);flex-shrink:0;cursor:pointer;display:inline-block;transition:background .2s}',
        '.prof-toggle-mini.on{background:var(--accent-red);border-color:var(--accent-red)}',
        '.prof-toggle-mini .prof-knob{position:absolute;top:1.5px;left:1.5px;width:13px;height:13px;border-radius:50%;background:var(--bg-card);transition:transform .18s;box-shadow:0 1px 2px rgba(0,0,0,.2)}',
        '.prof-toggle-mini.on .prof-knob{transform:translateX(14px);background:#fff}',

        // buttons match system .btn style
        '.prof-btn{display:inline-flex;align-items:center;gap:.4rem;padding:.6rem 1.1rem;border-radius:12px;font-size:.88rem;font-weight:500;cursor:pointer;transition:all .2s;font-family:inherit;border:none}',
        '.prof-btn.ghost{background:var(--bg-surface);color:var(--text-secondary);border:1px solid var(--border-color)}',
        '.prof-btn.ghost:hover{background:var(--bg-card);color:var(--text-primary)}',
        '.prof-btn.primary{background:var(--btn-primary-bg);color:var(--btn-primary-text)}',
        '.prof-btn.primary:hover{opacity:.88;transform:translateY(-1px)}',

        // scrollbar match system
        '.prof-sidebar::-webkit-scrollbar,.prof-tab-content::-webkit-scrollbar{width:4px}',
        '.prof-sidebar::-webkit-scrollbar-track,.prof-tab-content::-webkit-scrollbar-track{background:transparent}',
        '.prof-sidebar::-webkit-scrollbar-thumb,.prof-tab-content::-webkit-scrollbar-thumb{background:var(--border-color);border-radius:2px}',

        '@media(max-width:680px){.prof-body{grid-template-columns:1fr;height:auto}.prof-sidebar{border-left:none;border-bottom:1px solid var(--border-color);height:auto;max-height:260px}.prof-level-grid{grid-template-columns:1fr 1fr}.prof-prows-wrap{grid-template-columns:1fr}}',

        // ── الأرشيف المالي — بطاقات قابلة للطي ──
        '.prof-archive-hdr{color:#1D9E75;border-bottom-color:#5DCAA5}',
        '.prof-arch-block{border:.5px solid var(--border-color);border-radius:10px;margin-bottom:8px;overflow:hidden;border-right:3px solid var(--abcolor,#6b7280)}',
        '.prof-arch-hdr{display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--bg-surface);cursor:pointer;user-select:none}',
        '.prof-arch-hdr:hover{background:var(--bg-card)}',
        '.prof-arch-icon{font-size:15px;width:22px;text-align:center;flex-shrink:0}',
        '.prof-arch-meta{flex:1}',
        '.prof-arch-name{font-size:12.5px;font-weight:600;color:var(--text-primary)}',
        '.prof-arch-desc{font-size:10.5px;color:var(--text-muted)}',
        '.prof-arch-chevron{font-size:11px;color:var(--text-muted);flex-shrink:0;transition:transform .15s}',
        '.prof-arch-tog-wrap{flex-shrink:0;margin-right:4px}',
        '.prof-arch-children{border-top:.5px solid var(--border-color);padding:6px 10px 8px}',
        '.prof-arch-child{display:flex;align-items:center;justify-content:space-between;padding:5px 8px;border-radius:7px;cursor:pointer;transition:background .12s}',
        '.prof-arch-child:hover{background:var(--bg-surface)}',
        '.prof-arch-child-name{font-size:12px;color:var(--text-secondary);flex:1}',
    ].join('');
    document.head.appendChild(s);
}