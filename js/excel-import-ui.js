/**
 * excel-import-ui.js — مراكز التكلفة + بنود الموازنة
 * يُحمَّل بعد app-transactions.js في index.php
 */

// ══════════════════════════════════════════════════════
//  مراكز التكلفة
// ══════════════════════════════════════════════════════
async function renderCostCentersSection() {
    var content = document.getElementById('settingsContent');
    content.innerHTML = '<div style="text-align:center;padding:2rem"><div class="spinner"></div></div>';
    try {
        var res = await fetch('api/budget.php?action=cost_centers_list');
        var data = await res.json();
        var rows = data.data || [];
        var activeCount = rows.filter(r => r.is_active == 1).length;
        var inactiveCount = rows.length - activeCount;

        content.innerHTML = `
        <div class="settings-section-header">
            <h2>مراكز التكلفة <span style="font-size:.8rem;font-weight:400;color:var(--text-muted)">(${rows.length} مركز · ${activeCount} نشط · ${inactiveCount} موقوف)</span></h2>
            <div style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:center">

                <!-- فلتر الحالة -->
                <select id="ccFilter" class="form-select" style="font-size:.82rem;padding:.3rem .6rem;height:auto"
                    onchange="filterCostCentersTable()">
                    <option value="all">الكل</option>
                    <option value="1">نشط فقط</option>
                    <option value="0">موقوف فقط</option>
                </select>

                <!-- تفعيل / إيقاف الكل -->
                <button class="btn btn-secondary" onclick="toggleAllCostCenters(1)"
                    style="font-size:.82rem;padding:.35rem .75rem;display:inline-flex;align-items:center;gap:.3rem">
                    ✅ تفعيل الكل
                </button>
                <button class="btn btn-secondary" onclick="toggleAllCostCenters(0)"
                    style="font-size:.82rem;padding:.35rem .75rem;display:inline-flex;align-items:center;gap:.3rem">
                    🚫 إيقاف الكل
                </button>

                <!-- تحميل النموذج -->
                <a href="templates/نموذج_مراكز_التكلفة.xlsx" download class="btn btn-secondary"
                    style="font-size:.82rem;padding:.35rem .75rem;display:inline-flex;align-items:center;gap:.3rem">
                    ⬇️ تحميل النموذج
                </a>

                <!-- رفع CSV -->
                <button class="btn btn-secondary" onclick="triggerImport('cost_centers')"
                    style="font-size:.82rem;padding:.35rem .75rem;display:inline-flex;align-items:center;gap:.3rem">
                    ⬆️ رفع CSV
                </button>

                <!-- إضافة -->
                <button class="btn btn-primary" onclick="openCostCenterModal()"
                    style="font-size:.82rem;padding:.35rem .75rem;display:inline-flex;align-items:center;gap:.3rem">
                    ＋ إضافة مركز
                </button>
            </div>
        </div>

        <div class="table-container">
            <table class="data-table" id="ccTable">
                <thead><tr>
                    <th>رقم المركز</th><th>الاسم</th><th>الحالة</th><th>إجراءات</th>
                </tr></thead>
                <tbody id="ccTbody">
                ${rows.length ? rows.map(r => `
                    <tr data-active="${r.is_active}">
                        <td><span class="tx-number">${r.code}</span></td>
                        <td style="font-weight:600">${r.name}</td>
                        <td>
                            <span class="status-badge ${r.is_active == 1 ? 'status-completed' : 'status-cancelled'}">
                                ${r.is_active == 1 ? 'نشط' : 'موقوف'}
                            </span>
                        </td>
                        <td>
                            <div style="display:flex;gap:.35rem">
                                <button class="btn btn-sm" style="background:${r.is_active == 1 ? 'rgba(255,169,77,.15)' : 'rgba(105,219,124,.15)'};color:${r.is_active == 1 ? 'var(--accent-orange)' : 'var(--accent-green)'};border:1px solid ${r.is_active == 1 ? 'rgba(255,169,77,.4)' : 'rgba(105,219,124,.4)'}"
                                    onclick="toggleCostCenter(${r.id}, ${r.is_active == 1 ? 0 : 1}, this)">
                                    ${r.is_active == 1 ? '🚫 إيقاف' : '✅ تفعيل'}
                                </button>
                                <button class="btn btn-sm btn-secondary"
                                    onclick="openCostCenterModal(${JSON.stringify(r).replace(/"/g, '&quot;')})">تعديل</button>
                                <button class="btn btn-sm btn-danger"
                                    onclick="deleteCostCenter(${r.id}, '${r.name.replace(/'/g, "\\'")}', this)">حذف</button>
                            </div>
                        </td>
                    </tr>`).join('')
                : '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:2rem">لا توجد مراكز تكلفة</td></tr>'}
                </tbody>
            </table>
        </div>
        <input type="file" id="importFileInput" accept=".csv" style="display:none"
            onchange="handleImportFile('cost_centers')">`;

    } catch (e) {
        content.innerHTML = '<p style="color:red;padding:1rem">خطأ في تحميل البيانات</p>';
    }
}

// فلترة الجدول بدون إعادة fetch
function filterCostCentersTable() {
    var val = document.getElementById('ccFilter')?.value || 'all';
    document.querySelectorAll('#ccTbody tr[data-active]').forEach(tr => {
        tr.style.display = (val === 'all' || tr.dataset.active === val) ? '' : 'none';
    });
}

// تفعيل / إيقاف مركز واحد — يحدّث الصف مباشرة
async function toggleCostCenter(id, newActive, btn) {
    try {
        var row = btn.closest('tr');
        var res = await fetch('api/budget.php?action=cost_center_save', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, is_active: newActive })
        });
        var data = await res.json();
        if (!data.success) { showToast(data.error || 'خطأ', 'error'); return; }

        // تحديث الصف بدون إعادة تحميل
        row.dataset.active = newActive;
        var badge = row.querySelector('.status-badge');
        if (badge) {
            badge.textContent = newActive ? 'نشط' : 'موقوف';
            badge.className = 'status-badge ' + (newActive ? 'status-completed' : 'status-cancelled');
        }
        btn.textContent = newActive ? '🚫 إيقاف' : '✅ تفعيل';
        btn.style.background = newActive ? 'rgba(255,169,77,.15)' : 'rgba(105,219,124,.15)';
        btn.style.color = newActive ? 'var(--accent-orange)' : 'var(--accent-green)';
        btn.style.border = newActive ? '1px solid rgba(255,169,77,.4)' : '1px solid rgba(105,219,124,.4)';
        btn.setAttribute('onclick', `toggleCostCenter(${id}, ${newActive ? 0 : 1}, this)`);
        showToast(newActive ? 'تم التفعيل' : 'تم الإيقاف', 'success');
    } catch (e) { showToast('خطأ في الاتصال', 'error'); }
}

// تفعيل / إيقاف الكل
async function toggleAllCostCenters(newActive) {
    var label = newActive ? 'تفعيل الكل' : 'إيقاف الكل';
    if (!confirm(`هل تريد ${label}؟`)) return;
    var rows = document.querySelectorAll('#ccTbody tr[data-active]');
    var promises = [];
    rows.forEach(tr => {
        var btn = tr.querySelector('button:first-child');
        var id = btn ? parseInt(btn.getAttribute('onclick').match(/\d+/)[0]) : null;
        if (id) promises.push(
            fetch('api/budget.php?action=cost_center_save', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, is_active: newActive })
            })
        );
    });
    await Promise.all(promises);
    renderCostCentersSection();
    showToast(label + ' تم بنجاح', 'success');
}

// حذف مركز — يحذف الصف من الجدول مباشرة
async function deleteCostCenter(id, name, btn) {
    if (!confirm('هل تريد حذف مركز التكلفة "' + name + '"؟')) return;
    try {
        var res = await fetch('api/budget.php?action=cost_center_delete', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        var data = await res.json();
        if (data.success) {
            // احذف الصف مباشرة من الجدول
            var row = btn.closest('tr');
            row.style.transition = 'opacity .25s';
            row.style.opacity = '0';
            setTimeout(() => row.remove(), 250);
            showToast('تم الحذف', 'success');
        } else {
            showToast(data.error || 'خطأ في الحذف', 'error');
        }
    } catch (e) { showToast('خطأ في الاتصال', 'error'); }
}


// ══════════════════════════════════════════════════════
//  بنود الموازنة
// ══════════════════════════════════════════════════════
async function renderBudgetCategoriesSection() {
    var content = document.getElementById('settingsContent');
    content.innerHTML = '<div style="text-align:center;padding:2rem"><div class="spinner"></div></div>';
    try {
        var res = await fetch('api/budget.php?action=budget_categories_list');
        var data = await res.json();
        var rows = data.data || [];
        var activeCount = rows.filter(r => r.is_active == 1).length;
        var inactiveCount = rows.length - activeCount;

        content.innerHTML = `
        <div class="settings-section-header">
            <h2>بنود الموازنة <span style="font-size:.8rem;font-weight:400;color:var(--text-muted)">(${rows.length} بند · ${activeCount} نشط · ${inactiveCount} موقوف)</span></h2>
            <div style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:center">

                <!-- فلتر الحالة -->
                <select id="bcFilter" class="form-select" style="font-size:.82rem;padding:.3rem .6rem;height:auto"
                    onchange="filterBudgetCategoriesTable()">
                    <option value="all">الكل</option>
                    <option value="1">نشط فقط</option>
                    <option value="0">موقوف فقط</option>
                </select>

                <!-- تفعيل / إيقاف الكل -->
                <button class="btn btn-secondary" onclick="toggleAllBudgetCategories(1)"
                    style="font-size:.82rem;padding:.35rem .75rem;display:inline-flex;align-items:center;gap:.3rem">
                    ✅ تفعيل الكل
                </button>
                <button class="btn btn-secondary" onclick="toggleAllBudgetCategories(0)"
                    style="font-size:.82rem;padding:.35rem .75rem;display:inline-flex;align-items:center;gap:.3rem">
                    🚫 إيقاف الكل
                </button>

                <!-- تحميل النموذج -->
                <a href="templates/نموذج_بنود_الموازنة.xlsx" download class="btn btn-secondary"
                    style="font-size:.82rem;padding:.35rem .75rem;display:inline-flex;align-items:center;gap:.3rem">
                    ⬇️ تحميل النموذج
                </a>

                <!-- رفع CSV -->
                <button class="btn btn-secondary" onclick="triggerImport('budget_categories')"
                    style="font-size:.82rem;padding:.35rem .75rem;display:inline-flex;align-items:center;gap:.3rem">
                    ⬆️ رفع CSV
                </button>

                <!-- إضافة -->
                <button class="btn btn-primary" onclick="openBudgetCategoryModal()"
                    style="font-size:.82rem;padding:.35rem .75rem;display:inline-flex;align-items:center;gap:.3rem">
                    ＋ إضافة بند
                </button>
            </div>
        </div>

        <div class="table-container">
            <table class="data-table" id="bcTable">
                <thead><tr>
                    <th>كود البند</th><th>اسم البند</th><th>الحالة</th><th>إجراءات</th>
                </tr></thead>
                <tbody id="bcTbody">
                ${rows.length ? rows.map(r => `
                    <tr data-active="${r.is_active}">
                        <td><span class="tx-number">${r.code || '—'}</span></td>
                        <td style="font-weight:600">${r.name}</td>
                        <td>
                            <span class="status-badge ${r.is_active == 1 ? 'status-completed' : 'status-cancelled'}">
                                ${r.is_active == 1 ? 'نشط' : 'موقوف'}
                            </span>
                        </td>
                        <td>
                            <div style="display:flex;gap:.35rem">
                                <button class="btn btn-sm" style="background:${r.is_active == 1 ? 'rgba(255,169,77,.15)' : 'rgba(105,219,124,.15)'};color:${r.is_active == 1 ? 'var(--accent-orange)' : 'var(--accent-green)'};border:1px solid ${r.is_active == 1 ? 'rgba(255,169,77,.4)' : 'rgba(105,219,124,.4)'}"
                                    onclick="toggleBudgetCategory(${r.id}, ${r.is_active == 1 ? 0 : 1}, this)">
                                    ${r.is_active == 1 ? '🚫 إيقاف' : '✅ تفعيل'}
                                </button>
                                <button class="btn btn-sm btn-secondary"
                                    onclick="openBudgetCategoryModal(${JSON.stringify(r).replace(/"/g, '&quot;')})">تعديل</button>
                                <button class="btn btn-sm btn-danger"
                                    onclick="deleteBudgetCategory(${r.id}, '${r.name.replace(/'/g, "\\'")}', this)">حذف</button>
                            </div>
                        </td>
                    </tr>`).join('')
                : '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:2rem">لا توجد بنود</td></tr>'}
                </tbody>
            </table>
        </div>
        <input type="file" id="importFileInput" accept=".csv" style="display:none"
            onchange="handleImportFile('budget_categories')">`;

    } catch (e) {
        content.innerHTML = '<p style="color:red;padding:1rem">خطأ في تحميل البيانات</p>';
    }
}

function filterBudgetCategoriesTable() {
    var val = document.getElementById('bcFilter')?.value || 'all';
    document.querySelectorAll('#bcTbody tr[data-active]').forEach(tr => {
        tr.style.display = (val === 'all' || tr.dataset.active === val) ? '' : 'none';
    });
}

async function toggleBudgetCategory(id, newActive, btn) {
    try {
        var row = btn.closest('tr');
        var res = await fetch('api/budget.php?action=budget_category_save', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, is_active: newActive })
        });
        var data = await res.json();
        if (!data.success) { showToast(data.error || 'خطأ', 'error'); return; }

        row.dataset.active = newActive;
        var badge = row.querySelector('.status-badge');
        if (badge) {
            badge.textContent = newActive ? 'نشط' : 'موقوف';
            badge.className = 'status-badge ' + (newActive ? 'status-completed' : 'status-cancelled');
        }
        btn.textContent = newActive ? '🚫 إيقاف' : '✅ تفعيل';
        btn.style.background = newActive ? 'rgba(255,169,77,.15)' : 'rgba(105,219,124,.15)';
        btn.style.color = newActive ? 'var(--accent-orange)' : 'var(--accent-green)';
        btn.style.border = newActive ? '1px solid rgba(255,169,77,.4)' : '1px solid rgba(105,219,124,.4)';
        btn.setAttribute('onclick', `toggleBudgetCategory(${id}, ${newActive ? 0 : 1}, this)`);
        showToast(newActive ? 'تم التفعيل' : 'تم الإيقاف', 'success');
    } catch (e) { showToast('خطأ في الاتصال', 'error'); }
}

async function toggleAllBudgetCategories(newActive) {
    var label = newActive ? 'تفعيل الكل' : 'إيقاف الكل';
    if (!confirm(`هل تريد ${label}؟`)) return;
    var rows = document.querySelectorAll('#bcTbody tr[data-active]');
    var promises = [];
    rows.forEach(tr => {
        var btn = tr.querySelector('button:first-child');
        var id = btn ? parseInt(btn.getAttribute('onclick').match(/\d+/)[0]) : null;
        if (id) promises.push(
            fetch('api/budget.php?action=budget_category_save', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, is_active: newActive })
            })
        );
    });
    await Promise.all(promises);
    renderBudgetCategoriesSection();
    showToast(label + ' تم بنجاح', 'success');
}

async function deleteBudgetCategory(id, name, btn) {
    if (!confirm('هل تريد حذف البند "' + name + '"؟')) return;
    try {
        var res = await fetch('api/budget.php?action=budget_category_delete', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        var data = await res.json();
        if (data.success) {
            var row = btn.closest('tr');
            row.style.transition = 'opacity .25s';
            row.style.opacity = '0';
            setTimeout(() => row.remove(), 250);
            showToast('تم الحذف', 'success');
        } else {
            showToast(data.error || 'خطأ في الحذف', 'error');
        }
    } catch (e) { showToast('خطأ في الاتصال', 'error'); }
}


// ══════════════════════════════════════════════════════
//  دوال رفع CSV المشتركة
// ══════════════════════════════════════════════════════
function triggerImport(type) {
    var input = document.getElementById('importFileInput');
    if (input) { input.value = ''; input.click(); }
}

async function handleImportFile(type) {
    var input = document.getElementById('importFileInput');
    if (!input || !input.files.length) return;
    var file = input.files[0];
    if (file.size > 5 * 1024 * 1024) { showToast('حجم الملف كبير (الحد الأقصى 5MB)', 'error'); return; }

    showToast('جاري الاستيراد...', 'info');
    var formData = new FormData();
    formData.append('file', file);
    try {
        var res = await fetch('api/import_excel.php?type=' + type, { method: 'POST', body: formData });
        var result = await res.json();
        if (result.success) {
            showImportSummaryModal(result, type);
            if (type === 'cost_centers') renderCostCentersSection();
            else if (type === 'budget_categories') renderBudgetCategoriesSection();
        } else {
            showToast(result.error || 'فشل الاستيراد', 'error');
        }
    } catch (e) { showToast('خطأ في الاتصال بالخادم', 'error'); }
}

function showImportSummaryModal(result, type) {
    var typeName = type === 'cost_centers' ? 'مراكز التكلفة' : 'بنود الموازنة';
    var errHtml = result.errors && result.errors.length
        ? `<div style="margin-top:1rem;padding:.75rem;background:rgba(255,107,107,.08);border:1px solid rgba(255,107,107,.2);border-radius:8px">
               <div style="font-weight:700;color:var(--accent-red);margin-bottom:.4rem">⚠️ تنبيهات (${result.errors.length})</div>
               ${result.errors.slice(0, 10).map(e => `<div style="font-size:.82rem;color:var(--text-secondary);padding:.1rem 0">${e}</div>`).join('')}
           </div>` : '';
    DOM.modalTitle.textContent = `📥 نتيجة استيراد ${typeName}`;
    DOM.modalBody.innerHTML = `
    <div style="text-align:center;padding:1rem 0">
        <div style="font-size:2.5rem;margin-bottom:.75rem">${(result.inserted + result.updated) > 0 ? '✅' : '⚠️'}</div>
        <div style="font-size:1.05rem;font-weight:700;margin-bottom:1.25rem">${result.message}</div>
        <div style="display:flex;gap:.75rem;justify-content:center;flex-wrap:wrap">
            <div style="padding:.65rem 1.25rem;background:rgba(105,219,124,.1);border-radius:10px;border:1px solid rgba(105,219,124,.3)">
                <div style="font-size:1.5rem;font-weight:800;color:var(--accent-green)">${result.inserted || 0}</div>
                <div style="font-size:.75rem;color:var(--text-muted)">سجل جديد</div>
            </div>
            <div style="padding:.65rem 1.25rem;background:rgba(77,171,247,.1);border-radius:10px;border:1px solid rgba(77,171,247,.3)">
                <div style="font-size:1.5rem;font-weight:800;color:var(--accent-blue)">${result.updated || 0}</div>
                <div style="font-size:.75rem;color:var(--text-muted)">سجل محدَّث</div>
            </div>
            <div style="padding:.65rem 1.25rem;background:rgba(156,163,175,.1);border-radius:10px;border:1px solid rgba(156,163,175,.2)">
                <div style="font-size:1.5rem;font-weight:800;color:var(--text-muted)">${result.skipped || 0}</div>
                <div style="font-size:.75rem;color:var(--text-muted)">متجاهَل</div>
            </div>
        </div>
        ${errHtml}
    </div>
    <div style="display:flex;justify-content:center;margin-top:1rem">
        <button class="btn btn-primary" onclick="closeModal()">حسناً</button>
    </div>`;
    openModal();
}