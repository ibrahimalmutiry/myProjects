/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║      app-settings-employees.js — إدارة الموظفين والصلاحيات  ║
 * ║  يتطلب: app-common.js, app-transactions.js                   ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

// ========== قسم الموظفين ==========
async function loadSettingsEmployees() {
    try {
        // الموظفون
        var res = await fetch('api/?action=employees');
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
            PERM_LEVELS_CACHE = data.data;
        }
    } catch (e) { /* تُستخدم القيم الثابتة */ }
    if (!PERM_LEVELS_CACHE.length) {
        PERM_LEVELS_CACHE = [
            { code: 'system_admin', label: 'مدير النظام', description: 'صلاحية كاملة', color: '#ef4444' },
            { code: 'sector_head', label: 'رئيس القطاع', description: 'يرى قطاعه كاملاً', color: '#8b5cf6' },
            { code: 'division_manager', label: 'مدير القسم', description: 'يرى قسمه', color: '#3b82f6' },
            { code: 'employee_l1', label: 'موظف مستوى أول', description: 'وصول موسع', color: '#f59e0b' },
            { code: 'employee', label: 'موظف', description: 'وصول محدود', color: '#22c55e' },
        ];
    }
}


/* تعريف أدوار النظام الثابتة مع ألوانها ومسمياتها */
const SYSTEM_ROLES = [
    { value: 'admin', label: 'مدير النظام', label_en: 'System Admin', color: '#ef4444', desc: 'صلاحية كاملة على النظام' },
    { value: 'CEO', label: 'الرئيس التنفيذي', label_en: 'CEO', color: '#8b5cf6', desc: 'اعتماد الطلبات الكبيرة' },
    { value: 'receiver', label: 'الاستلام', label_en: 'Receiver', color: '#3b82f6', desc: 'استلام المعاملات وتصنيفها' },
    { value: 'budget', label: 'الموازنة', label_en: 'Budget', color: '#f59e0b', desc: 'مراجعة واعتماد الموازنة' },
    { value: 'dispatch', label: 'التوجيه', label_en: 'Dispatcher', color: '#10b981', desc: 'توجيه المعاملات' },
    { value: 'payment', label: 'المالية — الدفع', label_en: 'Payment', color: '#06b6d4', desc: 'تنفيذ المدفوعات' },
    { value: 'invoice', label: 'الفوترة', label_en: 'Invoice', color: '#6366f1', desc: 'إصدار الفواتير' },
    { value: 'employee', label: 'موظف', label_en: 'Employee', color: '#94a3b8', desc: 'موظف عادي بدون دور نظامي' },
];

function renderEmployeesSection() {
    var cont = document.getElementById('settingsContent');

    var filtered = SettingsData.employees || [];
    var cf = SettingsData.currentFilter || 'all';
    if (cf !== 'all') filtered = filtered.filter(function (e) { return e.role === cf; });

    var counts = {};
    (SettingsData.employees || []).forEach(function (e) { counts[e.role] = (counts[e.role] || 0) + 1; });
    var total = (SettingsData.employees || []).length;

    var filters = [{ key: 'all', label: 'الكل' }].concat(
        (SYSTEM_ROLES || []).map(function (r) { return { key: r.value, label: r.label }; })
    );

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

function filterEmployees(role, btn) {
    SettingsData.currentFilter = role;
    document.querySelectorAll('.emp-filter-btn').forEach(function (t) { t.classList.remove('active'); });
    if (btn) btn.classList.add('active');
    renderEmployeesSection();
}

function _roleLabel(role) {
    return { admin: 'مدير', receiver: 'استلام', budget: 'موازنة', payment: 'دفع', invoice: 'فوترة' }[role] || role;
}


/** بناء خيارات الأدوار الوظيفية مع الوصف */
function buildRoleOptions(selectedRole) {
    return (SYSTEM_ROLES || []).map(function (r) {
        var sel = selectedRole === r.value ? 'selected' : '';
        return '<option value="' + r.value + '" ' + sel + '>'
            + r.label
            + (r.desc ? ' — ' + r.desc : '')
            + '</option>';
    }).join('');
}

function openAddEmployeeModal() {
    const supervisorOptions = (SettingsData.employees || [])
        .filter(e => e.is_active != 0)
        .map(e => `<option value="${e.id}">${e.name} (${_roleLabel(e.role)})</option>`)
        .join('');

    const sectors = SettingsData.sectors || [];
    const divisions = SettingsData.divisions || [];
    const sectorOpts = sectors.map(s => {
        var lbl = s.name + (s.name_en && s.name_en !== s.name ? ' — ' + s.name_en : '');
        return `<option value="${s.id}">${lbl}</option>`;
    }).join('');
    const divOpts = divisions.map(d => {
        var label = d.name + (d.name_en && d.name_en !== d.name ? ' — ' + d.name_en : '');
        return `<option value="${d.id}" data-sector="${d.sector_id || d.parent_id || ''}">${label}</option>`;
    }).join('');
    const permOpts = PERM_LEVELS_CACHE.map(p =>
        `<option value="${p.code}">${p.label}</option>`
    ).join('');

    DOM.modalTitle.textContent = 'إضافة موظف جديد';
    DOM.modalBody.innerHTML = `
        <form id="employeeForm" onsubmit="saveEmployee(event)">
            <input type="hidden" name="id" id="empId" value="">
            <div class="form-group">
                <label class="form-label">رقم الموظف *</label>
                <input type="text" class="form-input" name="empNumber" id="empNumber" required>
            </div>
            <div class="modal-form-grid">
                <div class="form-group">
                    <label class="form-label">اسم الموظف *</label>
                    <input type="text" class="form-input" name="name" id="empName" required>
                </div>
                <div class="form-group" style="grid-column:1/-1">
                    <label class="form-label">المسمى الوظيفي
                        <span style="font-size:.72rem;color:var(--text-muted);font-weight:400">اختياري — يظهر في الملف الشخصي</span>
                    </label>
                    <input type="text" class="form-input" name="job_title" id="empJobTitle"
                           placeholder="مثال: مدير الخزينة، مهندس صيانة، محاسب أول">
                </div>
                <div class="form-group">
                    <label class="form-label">البريد الإلكتروني</label>
                    <input type="email" class="form-input" name="email" id="empEmail">
                </div>
                <div class="form-group">
                    <label class="form-label">رقم الهاتف</label>
                    <input type="text" class="form-input" name="phone" id="empPhone">
                </div>
                <div class="form-group">
                    <label class="form-label">الدور الوظيفي في النظام *
                        <span style="font-size:.72rem;color:var(--text-muted);font-weight:400">يحدد صلاحيات سير العمل</span>
                    </label>
                    <select class="form-select" name="role" id="empRole" required>
                        <option value="">— اختر الدور —</option>
                        ${buildRoleOptions('')}
                    </select>
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">🔒 مستوى الصلاحية</label>
                <select class="form-select" name="permission_level_code" id="empPermLevel">
                    ${permOpts}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">🏛️ القطاع
                    <span style="font-size:.75rem;color:var(--text-muted);font-weight:400">(نطاق رؤية المعاملات)</span>
                </label>
                <select class="form-select" name="sector_id" id="empSector" onchange="onSectorChange(this)">
                    <option value="">— بدون قطاع —</option>
                    ${sectorOpts}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">🏢 القسم التنظيمي
                    <span style="font-size:.75rem;color:var(--text-muted);font-weight:400">(الوحدة المباشرة داخل القطاع)</span>
                </label>
                <select class="form-select" name="division_id" id="empDivision">
                    <option value="">— بدون قسم —</option>
                    ${divOpts}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">👤 المشرف المباشر
                    <span style="font-size:.75rem;color:var(--text-muted);font-weight:400">(يُصعَّد إليه عند تجاوز OLA/SLA)</span>
                </label>
                <select class="form-select" name="supervisor_id" id="empSupervisor">
                    <option value="">— بدون مشرف —</option>
                    ${supervisorOptions}
                </select>
            </div>
            <div class="modal-footer" style="padding:0;border:none;margin-top:1.5rem">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
                <button type="submit" class="btn btn-primary">حفظ</button>
            </div>
        </form>
    `;
    openModal();
}

/** فلترة الأقسام عند تغيير القطاع */
function onSectorChange(sel) {
    var sectorId = sel ? sel.value : '';
    var divSel = document.getElementById('empDivision');
    if (!divSel) return;
    Array.from(divSel.options).forEach(function (opt) {
        if (!opt.value) return;
        opt.style.display = (!sectorId || opt.dataset.sector == sectorId) ? '' : 'none';
    });
    // إعادة تعيين الاختيار إن لم يكن منتمياً للقطاع
    var cur = divSel.options[divSel.selectedIndex];
    if (cur && cur.value && sectorId && cur.dataset.sector != sectorId) {
        divSel.value = '';
    }
}

function editEmployee(id) {
    var emp = SettingsData.employees.find(function (e) { return e.id == id; });
    if (!emp) return;

    const supervisorOptions = (SettingsData.employees || [])
        .filter(e => e.is_active != 0 && e.id != emp.id)
        .map(e => `<option value="${e.id}" ${emp.supervisor_id == e.id ? 'selected' : ''}>${e.name} (${_roleLabel(e.role)})</option>`)
        .join('');

    const sectors = SettingsData.sectors || [];
    const divisions = SettingsData.divisions || [];
    const curSector = emp.sector_id || emp.department_id;

    const sectorOptsEdit = sectors.map(s => {
        var label = s.name + (s.name_en && s.name_en !== s.name ? ' — ' + s.name_en : '');
        return `<option value="${s.id}" ${curSector == s.id ? 'selected' : ''}>${label}</option>`;
    }).join('');
    const divOptsEdit = divisions.map(d => {
        var sid = d.sector_id || d.parent_id || '';
        var hidden = (curSector && String(sid) !== String(curSector)) ? 'style="display:none"' : '';
        var label = d.name + (d.name_en && d.name_en !== d.name ? ' — ' + d.name_en : '');
        return `<option value="${d.id}" data-sector="${sid}" ${emp.division_id == d.id ? 'selected' : ''} ${hidden}>${label}</option>`;
    }).join('');
    const permOptsEdit = PERM_LEVELS_CACHE.map(p =>
        `<option value="${p.code}" ${(emp.permission_level_code || emp.permission_level) == p.code ? 'selected' : ''}>${p.label}</option>`
    ).join('');

    DOM.modalTitle.textContent = 'تعديل موظف';
    DOM.modalBody.innerHTML = `
        <form id="employeeForm" onsubmit="saveEmployee(event)">
            <input type="hidden" name="id" id="empId" value="${emp.id}">
            <div class="form-group">
                <label class="form-label">رقم الموظف *</label>
                <input type="text" class="form-input" name="employee_number" id="empNumber" value="${emp.employee_number}" required>
            </div>
            <div class="modal-form-grid">
                <div class="form-group">
                    <label class="form-label">اسم الموظف *</label>
                    <input type="text" class="form-input" name="name" id="empName" value="${emp.name}" required>
                </div>
                <div class="form-group" style="grid-column:1/-1">
                    <label class="form-label">المسمى الوظيفي
                        <span style="font-size:.72rem;color:var(--text-muted);font-weight:400">اختياري — يظهر في الملف الشخصي</span>
                    </label>
                    <input type="text" class="form-input" name="job_title" id="empJobTitle"
                           value="${emp.job_title || ''}"
                           placeholder="مثال: مدير الخزينة، مهندس صيانة، محاسب أول">
                </div>
                <div class="form-group">
                    <label class="form-label">البريد الإلكتروني</label>
                    <input type="email" class="form-input" name="email" id="empEmail" value="${emp.email || ''}">
                </div>
                <div class="form-group">
                    <label class="form-label">رقم الهاتف</label>
                    <input type="text" class="form-input" name="phone" id="empPhone" value="${emp.phone || ''}">
                </div>
                <div class="form-group">
                    <label class="form-label">الدور الوظيفي في النظام *
                        <span style="font-size:.72rem;color:var(--text-muted);font-weight:400">يحدد صلاحيات سير العمل</span>
                    </label>
                    <select class="form-select" name="role" id="empRole" required>
                        <option value="">— اختر الدور —</option>
                        ${buildRoleOptions(emp.role)}
                    </select>
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">🔒 مستوى الصلاحية</label>
                <select class="form-select" name="permission_level_code" id="empPermLevel">
                    ${permOptsEdit}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">🏛️ القطاع
                    <span style="font-size:.75rem;color:var(--text-muted);font-weight:400">(نطاق رؤية المعاملات)</span>
                </label>
                <select class="form-select" name="sector_id" id="empSector" onchange="onSectorChange(this)">
                    <option value="">— بدون قطاع —</option>
                    ${sectorOptsEdit}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">🏢 القسم التنظيمي
                    <span style="font-size:.75rem;color:var(--text-muted);font-weight:400">(الوحدة المباشرة داخل القطاع)</span>
                </label>
                <select class="form-select" name="division_id" id="empDivision">
                    <option value="">— بدون قسم —</option>
                    ${divOptsEdit}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">👤 المشرف المباشر
                    <span style="font-size:.75rem;color:var(--text-muted);font-weight:400">(يُصعَّد إليه عند تجاوز OLA/SLA)</span>
                </label>
                <select class="form-select" name="supervisor_id" id="empSupervisor">
                    <option value="">— بدون مشرف —</option>
                    ${supervisorOptions}
                </select>
            </div>
            <div class="modal-footer" style="padding:0;border:none;margin-top:1.5rem">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
                <button type="submit" class="btn btn-primary">💾 حفظ التعديلات</button>
            </div>
        </form>
    `;
    openModal();
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
        var res = await fetch('api/settings.php?action=' + action, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
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
        var res = await fetch('api/settings.php?action=delete_employee', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id })
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
];

var PAGES_CONFIG = [
    // رئيسية
    { key: 'dashboard', label: 'لوحة التحكم', icon: '📊', group: 'رئيسية' },
    { key: 'notifications', label: 'التنبيهات', icon: '🔔', group: 'رئيسية' },
    // المعاملات
    { key: 'purchase-requests', label: 'طلبات الشراء (المعاملات)', icon: '📋', group: 'معاملات' },
    { key: 'transactions', label: 'المعاملات المالية', icon: '💰', group: 'معاملات' },
    { key: 'correspondence', label: 'الخطابات', icon: '📨', group: 'معاملات' },
    // التخطيط المالي
    { key: 'reservations', label: 'حجوزات الموازنة', icon: '📅', group: 'التخطيط المالي' },
    { key: 'budget-plans', label: 'الموازنة التقديرية', icon: '📊', group: 'التخطيط المالي' },
    // الخزينة
    { key: 'bank-overview', label: 'نظرة عامة (الخزينة)', icon: '🏦', group: 'الخزينة' },
    { key: 'bank-accounts', label: 'الحسابات البنكية', icon: '💳', group: 'الخزينة' },
    { key: 'bank-investments', label: 'الودائع الاستثمارية', icon: '📈', group: 'الخزينة' },
    { key: 'daily-payments', label: 'المدفوعات اليومية', icon: '💵', group: 'الخزينة' },
    // الأرشيف
    { key: 'archive', label: 'الأرشيف المالي', icon: '🗂️', group: 'الأرشيف' },
    // المتابعة
    { key: 'ceo-approvals', label: 'اعتمادات الرئيس التنفيذي', icon: '✅', group: 'المتابعة' },
    { key: 'sla', label: 'SLA / OLA', icon: '⏱', group: 'المتابعة' },
    { key: 'performance', label: 'متابعة الأداء', icon: '📈', group: 'المتابعة' },
    // نظام
    { key: 'settings', label: 'الإعدادات', icon: '⚙️', group: 'نظام' },
];

// PERMISSION_LEVELS — getter ديناميكي يقرأ من PERM_LEVELS_CACHE دائماً
Object.defineProperty(window, 'PERMISSION_LEVELS', {
    get: function () { return PERM_LEVELS_CACHE; },
    configurable: true
});

var DEFAULT_PAGES = {
    system_admin: {
        dashboard: 1, notifications: 1, 'purchase-requests': 1,
        transactions: 1, correspondence: 1, reservations: 1, 'budget-plans': 1,
        'bank-overview': 1, 'bank-accounts': 1, 'bank-investments': 1, 'daily-payments': 1,
        archive: 1, 'ceo-approvals': 1, sla: 1, performance: 1, settings: 1,
    },
    manager: {
        dashboard: 1, notifications: 1, 'purchase-requests': 1,
        transactions: 1, correspondence: 1, reservations: 1, 'budget-plans': 1,
        'bank-overview': 1, 'bank-accounts': 1, 'bank-investments': 1, 'daily-payments': 1,
        archive: 1, 'ceo-approvals': 1, sla: 1, performance: 1, settings: 0,
    },
    employee: {
        dashboard: 0, notifications: 1, 'purchase-requests': 1,
        transactions: 1, correspondence: 1, reservations: 1, 'budget-plans': 0,
        'bank-overview': 0, 'bank-accounts': 0, 'bank-investments': 0, 'daily-payments': 0,
        archive: 0, 'ceo-approvals': 0, sla: 0, performance: 0, settings: 0,
    },
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
        return '<label class="perm-level-card ' + (level === l.value ? 'selected' : '') + '" data-level="' + l.value + '">' +
            '<input type="radio" name="permLevel" value="' + l.value + '" ' + checked + ' onchange="onPermLevelChange(this,' + empId + ')" hidden>' +
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
    var level = input.value;

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
        var res = await fetch('api/settings.php?action=save_employee_permissions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
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