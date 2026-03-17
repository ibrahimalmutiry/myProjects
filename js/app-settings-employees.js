/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║      app-settings-employees.js — إدارة الموظفين والصلاحيات  ║
 * ║  يتطلب: app-common.js, app-transactions.js                   ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

// ========== قسم الموظفين ==========
async function loadSettingsEmployees() {
    try {
        var res = await fetch('api/?action=employees');
        var data = await res.json();
        if (data.success) {
            SettingsData.employees = data.data;
        }
        // جلب الأقسام من API الحجوزات
        var dRes = await fetch('api/budget.php?action=meta');
        var dData = await dRes.json();
        if (dData.success && dData.data.departments) {
            SettingsData.departments = dData.data.departments;
        }
    } catch (e) {
        console.error(e);
    }
}

function renderEmployeesSection() {
    var content = document.getElementById('settingsContent');

    var html = '<div class="settings-section-header">';
    html += '<h2>إدارة الموظفين</h2>';
    html += '<button class="btn btn-primary" onclick="openAddEmployeeModal()">';
    html += '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>';
    html += ' إضافة موظف';
    html += '</button>';
    html += '</div>';

    // فلتر الأقسام
    html += '<div class="filter-tabs">';
    html += '<button class="filter-tab ' + (SettingsData.currentFilter === 'all' ? 'active' : '') + '" onclick="filterEmployees(\'all\', this)">الكل</button>';
    html += '<button class="filter-tab ' + (SettingsData.currentFilter === 'CEO' ? 'active' : '') + '" onclick="filterEmployees(\'CEO\', this)">الرئيس التنفيذي</button>';
    html += '<button class="filter-tab ' + (SettingsData.currentFilter === 'admin' ? 'active' : '') + '" onclick="filterEmployees(\'admin\', this)">المديرين</button>';
    html += '<button class="filter-tab ' + (SettingsData.currentFilter === 'receiver' ? 'active' : '') + '" onclick="filterEmployees(\'receiver\', this)">الاستلام</button>';
    html += '<button class="filter-tab ' + (SettingsData.currentFilter === 'budget' ? 'active' : '') + '" onclick="filterEmployees(\'budget\', this)">الموازنة</button>';
    html += '<button class="filter-tab ' + (SettingsData.currentFilter === 'payment' ? 'active' : '') + '" onclick="filterEmployees(\'payment\', this)">الدفع</button>';
    html += '<button class="filter-tab ' + (SettingsData.currentFilter === 'invoice' ? 'active' : '') + '" onclick="filterEmployees(\'invoice\', this)">الفوترة</button>';
    html += '</div>';

    // بطاقات الموظفين
    html += '<div class="employees-grid">';

    var filtered = SettingsData.employees;
    if (SettingsData.currentFilter !== 'all') {
        filtered = SettingsData.employees.filter(function (e) {
            return e.role === SettingsData.currentFilter;
        });
    }

    if (filtered.length === 0) {
        html += '<div class="empty-state">لا يوجد موظفين</div>';
    } else {
        for (var i = 0; i < filtered.length; i++) {
            var emp = filtered[i];
            // جلب اسم المشرف
            var supervisorName = '';
            if (emp.supervisor_id) {
                var sup = SettingsData.employees.find(function (e) { return e.id == emp.supervisor_id; });
                supervisorName = sup ? sup.name : '';
            }

            html += '<div class="employee-card">';
            html += '<div class="employee-avatar">' + emp.employee_number + '</div>';
            html += '<div class="employee-info">';
            html += '<h4>' + emp.name + '</h4>';
            html += '<span class="role-badge role-' + emp.role + '">' + getRoleName(emp.role) + '</span>';
            html += '<p class="employee-contact">' + (emp.email || '—') + '</p>';
            html += '<p class="employee-contact">' + (emp.phone || '—') + '</p>';
            // عرض اسم القسم
            if (emp.department_id) {
                var dept = SettingsData.departments.find(function (d) { return d.id == emp.department_id; });
                if (dept) {
                    html += '<p class="employee-contact" style="color:var(--accent-purple);font-size:.8rem">🏢 ' + dept.name + '</p>';
                }
            }
            if (supervisorName) {
                html += '<p class="employee-contact" style="color:var(--accent-blue);font-size:.8rem">';
                html += '👤 المشرف: ' + supervisorName;
                html += '</p>';
            } else {
                html += '<p class="employee-contact" style="color:var(--text-muted);font-size:.78rem">';
                html += '👤 المشرف: مدير النظام (افتراضي)';
                html += '</p>';
            }
            html += '</div>';
            html += '<div class="employee-actions">';
            if (canDo('employee.permissions')) {
                html += '<button class="btn-icon-sm perm-btn" onclick="openPermissionsModal(' + emp.id + ', \'' + emp.name + '\')" title="إدارة الصلاحيات" style="color:var(--accent-blue);border-color:var(--accent-blue)">';
                html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>';
                html += '</button>';
            }
            if (canDo('employee.edit')) {
                html += '<button class="btn-icon-sm" onclick="editEmployee(' + emp.id + ')" title="تعديل"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>';
            }
            if (canDo('employee.delete')) {
                html += '<button class="btn-icon-sm btn-danger-icon" onclick="deleteEmployee(' + emp.id + ', \'' + emp.name + '\')" title="حذف"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>';
            }
            html += '</div>';
            html += '</div>';
        }
    }

    html += '</div>';
    content.innerHTML = html;
}

function getRoleName(role) {
    var roles = {
        'admin': 'مدير النظام',
        'receiver': 'الاستلام',
        'budget': 'الموازنة',
        'payment': 'الدفع',
        'invoice': 'الفوترة'
    };
    return roles[role] || role;
}

function filterEmployees(role, btn) {
    SettingsData.currentFilter = role;
    document.querySelectorAll('.filter-tab').forEach(function (t) {
        t.classList.remove('active');
    });
    btn.classList.add('active');
    renderEmployeesSection();
}

function _roleLabel(role) {
    return { admin: 'مدير', receiver: 'استلام', budget: 'موازنة', payment: 'دفع', invoice: 'فوترة' }[role] || role;
}

function openAddEmployeeModal() {
    const supervisorOptions = (SettingsData.employees || [])
        .filter(e => e.is_active != 0)
        .map(e => `<option value="${e.id}">${e.name} (${_roleLabel(e.role)})</option>`)
        .join('');

    const departmentOptions = (SettingsData.departments || [])
        .map(d => `<option value="${d.id}">${d.name}</option>`)
        .join('');

    DOM.modalTitle.textContent = 'إضافة موظف جديد';
    DOM.modalBody.innerHTML = `
        <form id="employeeForm" onsubmit="saveEmployee(event)">
            <input type="hidden" name="id" id="empId" value="">
             <div class="form-group">
                    <label class="form-label">رقم الموظف</label>
                    <input type="text" class="form-input" name="empNumber" id="empNumber" required>
                </div>
            <div class="modal-form-grid">
                <div class="form-group">
                    <label class="form-label">اسم الموظف</label>
                    <input type="text" class="form-input" name="name" id="empName" required>
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
                    <label class="form-label">القسم / الدور</label>
                    <select class="form-select" name="role" id="empRole" required>
                        <option value="">اختر القسم</option>
                        <option value="admin">مدير النظام</option>
                        <option value="CEO">الرئيس التنفيذي</option>
                        <option value="receiver">الاستلام</option>
                        <option value="budget">الموازنة</option>
                        <option value="payment">الدفع</option>
                        <option value="invoice">الفوترة</option>
                    </select>
                </div>
            </div>
            <div class="form-group" style="margin-top:.5rem">
                <label class="form-label">
                    🏢 القسم التنظيمي
                    <span style="font-size:.78rem;color:var(--text-muted);font-weight:400">
                        (يُحدد الحجوزات التي يستطيع الموظف رؤيتها)
                    </span>
                </label>
                <select class="form-select" name="department_id" id="empDepartment">
                    <option value="">— بدون قسم محدد —</option>
                    ${departmentOptions}
                </select>
            </div>
            <div class="form-group" style="margin-top:.5rem">
                <label class="form-label">
                    👤 المشرف المباشر
                    <span style="font-size:.78rem;color:var(--text-muted);font-weight:400">
                        (يُصعَّد إليه عند تجاوزOLA/SLA)
                    </span>
                </label>
                <select class="form-select" name="supervisor_id" id="empSupervisor">
                    <option value="">— بدون مشرف (يُصعَّد لمدير النظام) —</option>
                    ${supervisorOptions}
                </select>
            </div>
            <div class="modal-footer" style="padding: 0; border: none; margin-top: 1.5rem;">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
                <button type="submit" class="btn btn-primary">حفظ</button>
            </div>
        </form>
    `;
    openModal();
}

function editEmployee(id) {
    var emp = SettingsData.employees.find(function (e) { return e.id == id; });
    if (!emp) return;

    const supervisorOptions = (SettingsData.employees || [])
        .filter(e => e.is_active != 0 && e.id != emp.id)
        .map(e => `<option value="${e.id}" ${emp.supervisor_id == e.id ? 'selected' : ''}>${e.name} (${_roleLabel(e.role)})</option>`)
        .join('');

    const departmentOptions = (SettingsData.departments || [])
        .map(d => `<option value="${d.id}" ${emp.department_id == d.id ? 'selected' : ''}>${d.name}</option>`)
        .join('');

    DOM.modalTitle.textContent = 'تعديل موظف';
    DOM.modalBody.innerHTML = `
        <form id="employeeForm" onsubmit="saveEmployee(event)">
               <div class="form-group">
                    <label class="form-label">رقم الموظف</label>
                    <input type="text" class="form-input" name="employee_number" id="empNumber" value="${emp.employee_number}" required>
                </div>
            <input type="hidden" name="id" id="empId" value="${emp.id}">
            <div class="modal-form-grid">
                <div class="form-group">
                    <label class="form-label">اسم الموظف</label>
                    <input type="text" class="form-input" name="name" id="empName" value="${emp.name}" required>
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
                    <label class="form-label">القسم / الدور</label>
                    <select class="form-select" name="role" id="empRole" required>
                        <option value="admin" ${emp.role === 'admin' ? 'selected' : ''}>مدير النظام</option>
                        <option value="CEO" ${emp.role === 'CEO' ? 'selected' : ''}>الرئيس التنفيذي</option>
                        <option value="receiver" ${emp.role === 'receiver' ? 'selected' : ''}>الاستلام</option>
                        <option value="budget" ${emp.role === 'budget' ? 'selected' : ''}>الموازنة</option>
                        <option value="payment" ${emp.role === 'payment' ? 'selected' : ''}>الدفع</option>
                        <option value="invoice" ${emp.role === 'invoice' ? 'selected' : ''}>الفوترة</option>
                    </select>
                </div>
            </div>
            <div class="form-group" style="margin-top:.5rem">
                <label class="form-label">
                    🏢 القسم التنظيمي
                    <span style="font-size:.78rem;color:var(--text-muted);font-weight:400">
                        (يُحدد الحجوزات التي يستطيع الموظف رؤيتها)
                    </span>
                </label>
                <select class="form-select" name="department_id" id="empDepartment">
                    <option value="">— بدون قسم محدد —</option>
                    ${departmentOptions}
                </select>
            </div>
            <div class="form-group" style="margin-top:.5rem">
                <label class="form-label">
                    👤 المشرف المباشر
                    <span style="font-size:.78rem;color:var(--text-muted);font-weight:400">
                        (يُصعَّد إليه عند تجاوزOLA/SLA)
                    </span>
                </label>
                <select class="form-select" name="supervisor_id" id="empSupervisor">
                    <option value="">— بدون مشرف (يُصعَّد لمدير النظام) —</option>
                    ${supervisorOptions}
                </select>
            </div>
            <div class="modal-footer" style="padding: 0; border: none; margin-top: 1.5rem;">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
                <button type="submit" class="btn btn-primary">حفظ</button>
            </div>
        </form>
    `;
    openModal();
}

async function saveEmployee(e) {
    e.preventDefault();

    var id = document.getElementById('empId').value;
    var supervisorEl = document.getElementById('empSupervisor');
    var departmentEl = document.getElementById('empDepartment');
    var empNumberEl = document.getElementById('empNumber');
    var data = {
        name: document.getElementById('empName').value,
        email: document.getElementById('empEmail').value,
        phone: document.getElementById('empPhone').value,
        role: document.getElementById('empRole').value,
        employee_number: empNumberEl ? empNumberEl.value.trim() : '',
        supervisor_id: supervisorEl ? (supervisorEl.value || null) : null,
        department_id: departmentEl ? (departmentEl.value || null) : null
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
    { key: 'bank.record_balance', label: 'تسجيل رصيد اليوم', icon: '📊', group: 'البنك' },
    { key: 'bank.edit_balance', label: 'تعديل الرصيد', icon: '✏️', group: 'البنك' },
    { key: 'bank.edit_account', label: 'تعديل بيانات الحساب', icon: '⚙️', group: 'البنك' },
    { key: 'bank.add_account', label: 'إضافة حساب بنكي', icon: '🏦', group: 'البنك' },
    { key: 'bank.add_deposit', label: 'إضافة وديعة', icon: '💵', group: 'البنك' },
    { key: 'bank.confirm_deposit', label: 'تأكيد الوديعة', icon: '✅', group: 'البنك' },
    { key: 'bank.delete_deposit', label: 'حذف وديعة', icon: '🗑', group: 'البنك' },
    { key: 'transaction.add', label: 'إضافة معاملة', icon: '➕', group: 'المعاملات' },
    { key: 'transaction.edit', label: 'تعديل معاملة', icon: '✏️', group: 'المعاملات' },
    { key: 'transaction.delete', label: 'حذف معاملة', icon: '🗑', group: 'المعاملات' },
    { key: 'transaction.export', label: 'تصدير البيانات', icon: '📤', group: 'المعاملات' },
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
    { key: 'employee.add', label: 'إضافة موظف', icon: '👤', group: 'الموظفين' },
    { key: 'employee.edit', label: 'تعديل موظف', icon: '✏️', group: 'الموظفين' },
    { key: 'employee.delete', label: 'حذف موظف', icon: '🗑', group: 'الموظفين' },
    { key: 'employee.permissions', label: 'إدارة الصلاحيات', icon: '🔒', group: 'الموظفين' },
    { key: 'budget.review', label: 'مراجعة واعتماد الموازنة', icon: '⚖️', group: 'الموازنة' },
    { key: 'budget.link_transaction', label: 'ربط بمعاملة مالية', icon: '🔗', group: 'الموازنة' },
    { key: 'budget.edit_code', label: 'تعديل رمز الموازنة', icon: '🏷️', group: 'الموازنة' },
    { key: 'reservation.add', label: 'إضافة حجز جديد', icon: '📋', group: 'الحجوزات' },
    { key: 'reservation.view_own', label: 'عرض حجوزات القسم', icon: '👁', group: 'الحجوزات' },
    { key: 'reservation.view_all', label: 'عرض كل الحجوزات', icon: '📑', group: 'الحجوزات' },
    { key: 'reservation.review', label: 'مراجعة الحجوزات', icon: '🔍', group: 'الحجوزات' },
    { key: 'reservation.approve', label: 'اعتماد / رفض حجز', icon: '✅', group: 'الحجوزات' },
    { key: 'reservation.delete', label: 'حذف حجز', icon: '🗑', group: 'الحجوزات' },
];

var PAGES_CONFIG = [
    { key: 'dashboard', label: 'لوحة التحكم', icon: '📊', group: 'رئيسية' },
    { key: 'notifications', label: 'التنبيهات', icon: '🔔', group: 'رئيسية' },
    { key: 'transactions', label: 'المعاملات المالية', icon: '💰', group: 'معاملات' },
    { key: 'reservations', label: 'الحجوزات', icon: '📅', group: 'رئيسية' },
    { key: 'bank-deposits', label: 'الودائع البنكية', icon: '🏦', group: 'معاملات' },
    { key: 'correspondence', label: 'الخطابات', icon: '📨', group: 'معاملات' },
    { key: 'sla', label: 'SLA / OLA', icon: '⏱', group: 'متابعة' },
    { key: 'performance', label: 'متابعة الأداء', icon: '📈', group: 'متابعة' },
    { key: 'settings', label: 'الإعدادات', icon: '⚙️', group: 'نظام' },
];

var PERMISSION_LEVELS = [
    { value: 'system_admin', label: 'مدير النظام', desc: 'صلاحية كاملة على كل شيء بما فيها الحذف', color: 'var(--accent-red)' },
    { value: 'manager', label: 'مدير', desc: 'وصول موسع للتقارير والمتابعة', color: 'var(--accent-blue)' },
    { value: 'employee', label: 'موظف', desc: 'وصول محدود لصفحته الوظيفية', color: 'var(--accent-green)' },
];

var DEFAULT_PAGES = {
    system_admin: { dashboard: 1, notifications: 1, transactions: 1, 'bank-deposits': 1, correspondence: 1, sla: 1, performance: 1, settings: 1, reservations: 1 },
    manager: { dashboard: 1, notifications: 1, transactions: 1, 'bank-deposits': 1, correspondence: 1, sla: 1, performance: 1, settings: 0, reservations: 1 },
    employee: { dashboard: 0, notifications: 1, transactions: 1, 'bank-deposits': 1, correspondence: 1, sla: 0, performance: 0, settings: 0, reservations: 1 },
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
            '<div style="font-size:.76rem;color:var(--text-muted)">' + l.desc + '</div>' +
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
