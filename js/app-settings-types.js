/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║      app-settings-types.js — أنواع المعاملات والأقسام        ║
 * ║  يتطلب: app-common.js, app-transactions.js                   ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

// ========== قسم أنواع المعاملات ==========
async function loadSettingsTypes() {
    try {
        var res = await fetch('api/settings.php?action=get_types');
        var data = await res.json();
        if (data.success) {
            SettingsData.types = data.data;
        }
    } catch (e) {
        console.error(e);
    }
}

async function renderTypesSection() {
    await loadSettingsTypes();

    const content = document.getElementById('settingsContent');
    if (!content) return;

    const all = SettingsData.types || [];
    const parents = all.filter(t => !t.parent_id || t.parent_id == 0);
    const childOf = id => all.filter(t => t.parent_id == id);

    let html = `
    <div class="settings-section-header">
        <h2>أنواع المعاملات</h2>
        <button class="btn btn-primary" onclick="openTypeModal(null, null)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            إضافة تصنيف رئيسي
        </button>
    </div>
    <div class="types-tree">`;

    if (parents.length === 0) {
        html += '<div class="empty-state">لا يوجد أنواع — أضف تصنيفاً رئيسياً</div>';
    }

    parents.forEach(parent => {
        const subs = childOf(parent.id);
        html += `
        <div class="tt-parent-block">
            <div class="tt-parent-row">
                <div class="tt-parent-icon">${getTypeIcon(parent.name)}</div>
                <div class="tt-parent-info">
                    <div class="tt-parent-name">${parent.name}</div>
                    ${parent.description ? `<div class="tt-parent-desc">${parent.description}</div>` : ''}
                </div>
                <div class="tt-parent-meta">
                    <span class="tt-sub-count">${subs.length} تصنيف فرعي</span>
                </div>
                <div class="tt-actions">
                    <button class="tt-btn tt-btn-add" onclick="openTypeModal(null, ${parent.id})" title="إضافة فرعي">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                        </svg> إضافة فرعي
                    </button>
                    <button class="tt-btn tt-btn-edit" onclick="openTypeModal(${parent.id}, null)" title="تعديل">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                    <button class="tt-btn tt-btn-del" onclick="deleteType(${parent.id}, '${parent.name.replace(/'/g, "\\'")}', ${subs.length})" title="حذف">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                    </button>
                </div>
            </div>
            ${subs.length > 0 ? `
            <div class="tt-subs-list">
                ${subs.map(sub => `
                <div class="tt-sub-row">
                    <div class="tt-sub-bullet"></div>
                    <div class="tt-sub-info">
                        <span class="tt-sub-name">${sub.name}</span>
                        ${sub.description ? `<span class="tt-sub-desc">${sub.description}</span>` : ''}
                    </div>
                    <div class="tt-actions">
                        <button class="tt-btn tt-btn-edit" onclick="openTypeModal(${sub.id}, ${parent.id})" title="تعديل">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                        </button>
                        <button class="tt-btn tt-btn-del" onclick="deleteType(${sub.id}, '${sub.name.replace(/'/g, "\\'")}', 0)" title="حذف">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"/>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                        </button>
                    </div>
                </div>`).join('')}
            </div>` : ''}
        </div>`;
    });

    html += '</div>';
    content.innerHTML = html;
}

function getTypeIcon(name) {
    const icons = {
        'راتب': '💵', 'رواتب': '💵', 'صرف راتب': '💵',
        'مكافأة': '🏆', 'مكافآت': '🏆',
        'سلفة': '🏦', 'سلف': '🏦',
        'فاتورة': '🧾', 'فواتير': '🧾',
        'مستخلص': '📋', 'مستخلصات': '📋',
        'تسوية': '⚖️', 'تسويات': '⚖️',
        'شراء': '🛒', 'مشتريات': '🛒', 'أمر شراء': '🛒',
        'مطالبة': '📄', 'مطالبات': '📄',
        'بدل': '💳', 'بدلات': '💳',
        'إضافي': '⏰', 'عمل إضافي': '⏰',
        'أخرى': '📂', 'عام': '📂',
    };
    for (const [key, icon] of Object.entries(icons)) {
        if (name.includes(key)) return icon;
    }
    return '📁';
}

function openTypeModal(editId, parentId) {
    const all = SettingsData.types || [];
    const parents = all.filter(t => !t.parent_id || t.parent_id == 0);
    const existing = editId ? all.find(t => t.id == editId) : null;
    const isEdit = !!existing;
    const currentParentId = isEdit ? (existing.parent_id || '') : (parentId || '');
    const currentIsParent = isEdit && !existing.parent_id;

    DOM.modalTitle.textContent = isEdit
        ? (currentIsParent ? `تعديل الرئيسي: ${existing.name}` : `تعديل الفرعي: ${existing.name}`)
        : (parentId ? `إضافة فرعي تحت: ${parents.find(p => p.id == parentId)?.name || ''}` : 'إضافة تصنيف رئيسي');

    DOM.modalBody.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:1rem;">
            <div class="form-group">
                <label class="form-label">التصنيف الرئيسي</label>
                <select class="form-select" id="typeParentId">
                    <option value="">— تصنيف رئيسي مستقل —</option>
                    ${parents.filter(p => p.id != editId).map(p =>
        `<option value="${p.id}" ${currentParentId == p.id ? 'selected' : ''}>${p.name}</option>`
    ).join('')}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">الاسم <span class="req">*</span></label>
                <input type="text" class="form-input" id="typeName"
                    value="${isEdit ? existing.name : ''}"
                    placeholder="${parentId ? 'مثال: الرواتب الشهرية' : 'مثال: الرواتب'}" autofocus>
            </div>
            <div class="form-group">
                <label class="form-label">الوصف</label>
                <textarea class="form-input" id="typeDesc" rows="2"
                    placeholder="وصف مختصر (اختياري)">${isEdit ? (existing.description || '') : ''}</textarea>
            </div>
            <div style="display:flex;gap:.75rem;padding-top:.5rem;">
                <button class="btn btn-primary" onclick="saveType(${isEdit ? editId : 'null'})">
                    ${isEdit ? 'حفظ التعديلات' : 'إضافة'}
                </button>
                <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
            </div>
        </div>`;
    openModal();
}

async function saveType(editId) {
    const name = document.getElementById('typeName')?.value.trim();
    const desc = document.getElementById('typeDesc')?.value.trim() || '';
    const parentEl = document.getElementById('typeParentId');
    const parentId = parentEl ? (parentEl.value || null) : null;
    if (!name) { showToast('⚠️ اسم التصنيف مطلوب', 'warning'); return; }
    const payload = { name, description: desc, parent_id: parentId };
    if (editId) payload.id = editId;
    const action = editId ? 'update_type' : 'add_type';
    try {
        const res = await fetch('api/settings.php?action=' + action, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            showToast(editId ? '✅ تم تحديث التصنيف' : '✅ تم إضافة التصنيف', 'success');
            closeModal(); renderTypesSection();
        } else { showToast(data.message || 'خطأ', 'error'); }
    } catch (e) { showToast('خطأ في الاتصال', 'error'); }
}

async function deleteType(id, name, subCount) {
    const msg = subCount > 0
        ? `حذف "${name}" سيحذف أيضاً ${subCount} تصنيف فرعي. هل أنت متأكد؟`
        : `هل تريد حذف "${name}"؟`;
    if (!confirm(msg)) return;
    try {
        const res = await fetch('api/settings.php?action=delete_type', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        const data = await res.json();
        if (data.success) { showToast('✅ تم الحذف', 'success'); renderTypesSection(); }
        else { showToast(data.message || 'خطأ في الحذف', 'error'); }
    } catch (e) { showToast('خطأ في الاتصال', 'error'); }
}


// ========== مراكز التكلفة ==========
async function renderCostCentersSection() {
    var content = document.getElementById('settingsContent');
    content.innerHTML = '<div style="text-align:center;padding:2rem"><div class="spinner"></div></div>';
    try {
        var res = await fetch('api/budget.php?action=cost_centers_list');
        var data = await res.json();
        var rows = data.data || [];
        var html = `
        <div class="settings-section-header">
            <h2>مراكز التكلفة</h2>
            <button class="btn btn-primary" onclick="openCostCenterModal()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                إضافة مركز
            </button>
        </div>
        <div class="table-container">
            <table class="data-table">
                <thead><tr>
                    <th>رقم المركز</th><th>الاسم</th><th>الحالة</th><th>إجراءات</th>
                </tr></thead>
                <tbody>
                ${rows.length ? rows.map(function (r) {
            return `
                    <tr>
                        <td><span class="tx-number">${r.code}</span></td>
                        <td style="font-weight:600">${r.name}</td>
                        <td><span class="status-badge ${r.is_active == 1 ? 'status-completed' : 'status-cancelled'}">${r.is_active == 1 ? 'نشط' : 'موقوف'}</span></td>
                        <td>
                            <div style="display:flex;gap:.4rem">
                                <button class="btn btn-sm btn-secondary" onclick="openCostCenterModal(${JSON.stringify(r).replace(/"/g, '&quot;')})">تعديل</button>
                                <button class="btn btn-sm btn-danger"    onclick="deleteCostCenter(${r.id},'${r.name}')">حذف</button>
                            </div>
                        </td>
                    </tr>`;
        }).join('') : '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:2rem">لا توجد مراكز تكلفة</td></tr>'}
                </tbody>
            </table>
        </div>`;
        content.innerHTML = html;
    } catch (e) {
        content.innerHTML = '<p style="color:red;padding:1rem">خطأ في تحميل البيانات</p>';
    }
}

function openCostCenterModal(row) {
    var isEdit = !!row;
    DOM.modalTitle.textContent = isEdit ? 'تعديل مركز التكلفة' : 'إضافة مركز تكلفة';
    DOM.modalBody.innerHTML = `
        <div class="form-group">
            <label class="form-label">رقم المركز <span style="color:var(--accent-red)">*</span></label>
            <input class="form-input" id="cc_code" placeholder="مثال: 102200001" value="${isEdit ? row.code : ''}">
        </div>
        <div class="form-group">
            <label class="form-label">اسم المركز <span style="color:var(--accent-red)">*</span></label>
            <input class="form-input" id="cc_name" placeholder="مثال: المالية والحسابات" value="${isEdit ? row.name : ''}">
        </div>
        <div class="form-group">
            <label class="form-label">الحالة</label>
            <select class="form-select" id="cc_active">
                <option value="1" ${(!isEdit || row.is_active == 1) ? 'selected' : ''}>نشط</option>
                <option value="0" ${(isEdit && row.is_active == 0) ? 'selected' : ''}>موقوف</option>
            </select>
        </div>
        <div class="modal-footer" style="padding:0;border:none;margin-top:1.5rem">
            <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
            <button class="btn btn-primary" onclick="saveCostCenter(${isEdit ? row.id : 'null'})">
                ${isEdit ? 'حفظ التعديلات' : 'إضافة'}
            </button>
        </div>`;
    openModal();
}

async function saveCostCenter(id) {
    var code = document.getElementById('cc_code').value.trim();
    var name = document.getElementById('cc_name').value.trim();
    var active = document.getElementById('cc_active').value;
    if (!code || !name) { showToast('رقم المركز والاسم مطلوبان', 'error'); return; }
    var body = { code, name, is_active: parseInt(active) };
    if (id) body.id = id;
    try {
        var res = await fetch('api/budget.php?action=cost_center_save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        var data = await res.json();
        if (data.success) { showToast(id ? 'تم التعديل' : 'تمت الإضافة', 'success'); closeModal(); renderCostCentersSection(); }
        else showToast(data.error || 'خطأ', 'error');
    } catch (e) { showToast('خطأ في الاتصال', 'error'); }
}

async function deleteCostCenter(id, name) {
    if (!confirm('هل تريد حذف مركز التكلفة "' + name + '"؟')) return;
    try {
        var res = await fetch('api/budget.php?action=cost_center_delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
        var data = await res.json();
        if (data.success) { showToast('تم الحذف', 'success'); renderCostCentersSection(); }
        else showToast(data.error || 'خطأ في الحذف', 'error');
    } catch (e) { showToast('خطأ في الاتصال', 'error'); }
}

// ═══════════════════════════════════════════════════════
//  إدارة الأقسام
// ═══════════════════════════════════════════════════════

async function renderDepartmentsSection() {
    var content = document.getElementById('settingsContent');
    content.innerHTML = '<div style="text-align:center;padding:2rem"><div class="spinner"></div></div>';
    try {
        var res = await fetch('api/settings.php?action=get_departments');
        var data = await res.json();
        var rows = data.data || [];

        var tbody = rows.length
            ? rows.map(function (d) {
                var safeName = d.name.replace(/'/g, "\\'");
                return '<tr>' +
                    '<td><span class="tx-number">' + (d.code || '—') + '</span></td>' +
                    '<td style="font-weight:600">' + d.name + '</td>' +
                    '<td style="color:var(--text-muted);font-size:.85rem">' + (d.description || '—') + '</td>' +
                    '<td><span class="status-badge ' + (d.is_active == 1 ? 'status-completed' : 'status-cancelled') + '">' + (d.is_active == 1 ? 'نشط' : 'متوقف') + '</span></td>' +
                    '<td>' +
                    '<button class="btn btn-ghost-sm" onclick="openDepartmentModal(' + d.id + ')">✏️ تعديل</button> ' +
                    '<button class="btn btn-ghost-sm" style="color:#ef4444" onclick="deleteDepartment(' + d.id + ',\'' + safeName + '\')">🗑 حذف</button>' +
                    '</td>' +
                    '</tr>';
            }).join('')
            : '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:2rem">لا توجد أقسام</td></tr>';

        content.innerHTML =
            '<div class="settings-section-header">' +
            '<h2>إدارة الأقسام</h2>' +
            '<button class="btn btn-primary" onclick="openDepartmentModal()">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
            '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>' +
            '</svg> إضافة قسم' +
            '</button>' +
            '</div>' +
            '<div class="table-container">' +
            '<table class="data-table">' +
            '<thead><tr><th>الكود</th><th>اسم القسم</th><th>الوصف</th><th>الحالة</th><th>إجراءات</th></tr></thead>' +
            '<tbody>' + tbody + '</tbody>' +
            '</table>' +
            '</div>';
    } catch (e) {
        document.getElementById('settingsContent').innerHTML =
            '<div style="color:#ef4444;padding:1rem">خطأ في تحميل الأقسام</div>';
    }
}

async function openDepartmentModal(id) {
    var dept = null;
    if (id) {
        try {
            var res = await fetch('api/settings.php?action=get_departments');
            var data = await res.json();
            dept = (data.data || []).find(function (d) { return d.id == id; });
        } catch (e) { }
    }

    DOM.modalTitle.textContent = id ? '✏️ تعديل القسم' : '➕ إضافة قسم جديد';

    var statusField = id
        ? '<div class="form-group">' +
        '<label class="form-label">الحالة</label>' +
        '<select id="deptActive" class="form-input">' +
        '<option value="1"' + (dept && dept.is_active == 1 ? ' selected' : '') + '>نشط</option>' +
        '<option value="0"' + (dept && dept.is_active == 0 ? ' selected' : '') + '>متوقف</option>' +
        '</select>' +
        '</div>'
        : '';

    DOM.modalBody.innerHTML =
        '<form onsubmit="saveDepartment(event,' + (id || 0) + ')">' +
        '<div class="modal-form-grid">' +
        '<div class="form-group">' +
        '<label class="form-label">اسم القسم *</label>' +
        '<input type="text" id="deptName" class="form-input" value="' + (dept ? dept.name : '') + '" required placeholder="مثال: القطاع المالي">' +
        '</div>' +
        '<div class="form-group">' +
        '<label class="form-label">الكود</label>' +
        '<input type="text" id="deptCode" class="form-input" value="' + (dept ? (dept.code || '') : '') + '" placeholder="مثال: FIN" style="text-transform:uppercase" oninput="this.value=this.value.toUpperCase()">' +
        '</div>' +
        '<div class="form-group full-span">' +
        '<label class="form-label">الوصف</label>' +
        '<textarea id="deptDesc" class="form-input" rows="2" placeholder="وصف مختصر للقسم">' + (dept ? (dept.description || '') : '') + '</textarea>' +
        '</div>' +
        statusField +
        '</div>' +
        '<div style="display:flex;gap:.75rem;justify-content:flex-end;margin-top:1.25rem">' +
        '<button type="button" class="btn btn-secondary" onclick="closeModal()">إلغاء</button>' +
        '<button type="submit" class="btn btn-primary">💾 حفظ</button>' +
        '</div>' +
        '</form>';

    openModal();
}

async function saveDepartment(e, id) {
    e.preventDefault();
    var activeEl = document.getElementById('deptActive');
    var data = {
        name: document.getElementById('deptName').value.trim(),
        code: document.getElementById('deptCode').value.trim(),
        description: document.getElementById('deptDesc').value.trim(),
        is_active: activeEl ? parseInt(activeEl.value) : 1
    };
    if (id) data.id = id;

    var action = id ? 'update_department' : 'add_department';
    try {
        var res = await fetch('api/settings.php?action=' + action, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        var result = await res.json();
        if (result.success) {
            showToast(id ? 'تم تحديث القسم' : 'تم إضافة القسم', 'success');
            closeModal();
            renderDepartmentsSection();
            loadSettingsEmployees();
        } else {
            showToast(result.message || 'خطأ', 'error');
        }
    } catch (err) {
        showToast('خطأ في الاتصال', 'error');
    }
}

async function deleteDepartment(id, name) {
    if (!confirm('هل تريد حذف قسم "' + name + '"؟\nسيتم إلغاء ربط الموظفين بهذا القسم.')) return;
    try {
        var res = await fetch('api/settings.php?action=delete_department', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id })
        });
        var result = await res.json();
        if (result.success) {
            showToast('تم الحذف', 'success');
            renderDepartmentsSection();
        } else {
            showToast(result.message || 'خطأ في الحذف', 'error');
        }
    } catch (e) {
        showToast('خطأ في الاتصال', 'error');
    }
}
