/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║      app-settings-budget.js — بنود الموازنة                  ║
 * ║  يتطلب: app-common.js, app-transactions.js                   ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

// ========== بنود الموازنة ==========
async function renderBudgetCategoriesSection() {
    var content = document.getElementById('settingsContent');
    content.innerHTML = '<div style="text-align:center;padding:2rem"><div class="spinner"></div></div>';
    try {
        var res = await fetch('api/budget.php?action=budget_categories_list');
        var data = await res.json();
        var rows = data.data || [];
        var html = `
        <div class="settings-section-header">
            <h2>بنود الموازنة</h2>
            <button class="btn btn-primary" onclick="openBudgetCategoryModal()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                إضافة بند
            </button>
        </div>
        <div class="table-container">
            <table class="data-table">
                <thead><tr>
                    <th>كود البند</th><th>اسم البند</th><th>الحالة</th><th>إجراءات</th>
                </tr></thead>
                <tbody>
                ${rows.length ? rows.map(function (r) {
            return `
                    <tr>
                        <td><span class="tx-number">${r.code || '—'}</span></td>
                        <td style="font-weight:600">${r.name}</td>
                        <td><span class="status-badge ${r.is_active == 1 ? 'status-completed' : 'status-cancelled'}">${r.is_active == 1 ? 'نشط' : 'موقوف'}</span></td>
                        <td>
                            <div style="display:flex;gap:.4rem">
                                <button class="btn btn-sm btn-secondary" onclick="openBudgetCategoryModal(${JSON.stringify(r).replace(/"/g, '&quot;')})">تعديل</button>
                                <button class="btn btn-sm btn-danger"    onclick="deleteBudgetCategory(${r.id},'${r.name}')">حذف</button>
                            </div>
                        </td>
                    </tr>`;
        }).join('') : '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:2rem">لا توجد بنود</td></tr>'}
                </tbody>
            </table>
        </div>`;
        content.innerHTML = html;
    } catch (e) {
        content.innerHTML = '<p style="color:red;padding:1rem">خطأ في تحميل البيانات</p>';
    }
}

function openBudgetCategoryModal(row) {
    var isEdit = !!row;
    DOM.modalTitle.textContent = isEdit ? 'تعديل بند الموازنة' : 'إضافة بند موازنة';
    DOM.modalBody.innerHTML = `
        <div class="form-group">
            <label class="form-label">اسم البند <span style="color:var(--accent-red)">*</span></label>
            <input class="form-input" id="bc_name" placeholder="مثال: تقنية معلومات" value="${isEdit ? row.name : ''}">
        </div>
        <div class="form-group">
            <label class="form-label">كود البند (اختياري)</label>
            <input class="form-input" id="bc_code" placeholder="مثال: IT-001" value="${isEdit && row.code ? row.code : ''}">
        </div>
        <div class="form-group">
            <label class="form-label">الحالة</label>
            <select class="form-select" id="bc_active">
                <option value="1" ${(!isEdit || row.is_active == 1) ? 'selected' : ''}>نشط</option>
                <option value="0" ${(isEdit && row.is_active == 0) ? 'selected' : ''}>موقوف</option>
            </select>
        </div>
        <div class="modal-footer" style="padding:0;border:none;margin-top:1.5rem">
            <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
            <button class="btn btn-primary" onclick="saveBudgetCategory(${isEdit ? row.id : 'null'})">
                ${isEdit ? 'حفظ التعديلات' : 'إضافة'}
            </button>
        </div>`;
    openModal();
}

async function saveBudgetCategory(id) {
    var name = document.getElementById('bc_name').value.trim();
    var code = document.getElementById('bc_code').value.trim();
    var active = document.getElementById('bc_active').value;
    if (!name) { showToast('اسم البند مطلوب', 'error'); return; }
    var body = { name, code, is_active: parseInt(active) };
    if (id) body.id = id;
    try {
        var res = await fetch('api/budget.php?action=budget_category_save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        var data = await res.json();
        if (data.success) { showToast(id ? 'تم التعديل' : 'تمت الإضافة', 'success'); closeModal(); renderBudgetCategoriesSection(); }
        else showToast(data.error || 'خطأ', 'error');
    } catch (e) { showToast('خطأ في الاتصال', 'error'); }
}

async function deleteBudgetCategory(id, name) {
    if (!confirm('هل تريد حذف البند "' + name + '"؟')) return;
    try {
        var res = await fetch('api/budget.php?action=budget_category_delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
        var data = await res.json();
        if (data.success) { showToast('تم الحذف', 'success'); renderBudgetCategoriesSection(); }
        else showToast(data.error || 'خطأ في الحذف', 'error');
    } catch (e) { showToast('خطأ في الاتصال', 'error'); }
}
