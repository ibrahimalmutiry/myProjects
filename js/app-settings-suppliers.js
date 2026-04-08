/**
 * app-settings-suppliers.js
 * ════════════════════════════════════════════════════════════
 * إدارة الموردين في صفحة الإعدادات
 *  - جدول الموردين المحليين
 *  - جدول الموردين الخارجيين
 *  - إضافة / تعديل / تفعيل / حذف
 *  - إضافة يدوية سريعة من نافذة الطلب (prQuickAddSupplier)
 * ════════════════════════════════════════════════════════════
 */

// ══════════════════════════════════════════════════════════
// الحالة
// ══════════════════════════════════════════════════════════
const SuppState = {
    local: [],
    foreign: [],
    filter: { local: '', foreign: '' },
};

// ══════════════════════════════════════════════════════════
// نقطة الدخول الرئيسية
// ══════════════════════════════════════════════════════════
async function renderSuppliersSection() {
    const el = document.getElementById('settingsContent');
    if (!el) return;

    el.innerHTML = `
    <div class="supp-page">

        <!-- رأس الصفحة -->
        <div class="supp-header">
            <div>
                <h2 class="supp-title">🏭 إدارة الموردين</h2>
                <p class="supp-subtitle">الموردون المحليون والخارجيون المعتمدون في النظام</p>
            </div>
        </div>

        <!-- تبويبات محلي / خارجي -->
        <div class="supp-tabs">
            <button class="supp-tab active" id="supp-tab-local"
                    onclick="suppSwitchTab('local')">
                🏠 الموردون المحليون
                <span class="supp-tab-count" id="supp-count-local">—</span>
            </button>
            <button class="supp-tab" id="supp-tab-foreign"
                    onclick="suppSwitchTab('foreign')">
                🌐 الموردون الخارجيون
                <span class="supp-tab-count" id="supp-count-foreign">—</span>
            </button>
        </div>

        <!-- محلي -->
        <div id="supp-panel-local" class="supp-panel">
            <div class="supp-toolbar">
                <div class="supp-search-wrap">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                    <input type="text" id="supp-search-local" placeholder="بحث..."
                           oninput="suppFilter('local')" class="supp-search">
                </div>
                <button class="supp-btn-add" onclick="suppOpenModal(null,'محلي')">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    إضافة مورد محلي
                </button>
            </div>
            <div class="supp-table-wrap">
                <table class="supp-table" id="supp-table-local">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>اسم المورد</th>
                            <th>السجل التجاري</th>
                            <th>الرقم الضريبي</th>
                            <th>جهة الاتصال</th>
                            <th>الهاتف</th>
                            <th>الحالة</th>
                            <th>إجراءات</th>
                        </tr>
                    </thead>
                    <tbody id="supp-tbody-local">
                        <tr><td colspan="8" class="supp-loading">⏳ جارٍ التحميل...</td></tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- خارجي -->
        <div id="supp-panel-foreign" class="supp-panel" style="display:none">
            <div class="supp-toolbar">
                <div class="supp-search-wrap">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                    <input type="text" id="supp-search-foreign" placeholder="بحث..."
                           oninput="suppFilter('foreign')" class="supp-search">
                </div>
                <button class="supp-btn-add" onclick="suppOpenModal(null,'خارجي')">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    إضافة مورد خارجي
                </button>
            </div>
            <div class="supp-table-wrap">
                <table class="supp-table" id="supp-table-foreign">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>اسم المورد</th>
                            <th>الدولة</th>
                            <th>المدينة</th>
                            <th>جهة الاتصال</th>
                            <th>الهاتف</th>
                            <th>الحالة</th>
                            <th>إجراءات</th>
                        </tr>
                    </thead>
                    <tbody id="supp-tbody-foreign">
                        <tr><td colspan="8" class="supp-loading">⏳ جارٍ التحميل...</td></tr>
                    </tbody>
                </table>
            </div>
        </div>

    </div>`;

    suppInjectStyles();
    await suppLoadAll();
}

// ══════════════════════════════════════════════════════════
// تحميل البيانات
// ══════════════════════════════════════════════════════════
async function suppLoadAll() {
    try {
        const [rL, rF] = await Promise.all([
            fetch('api/suppliers_api.php?action=list&category=محلي'),
            fetch('api/suppliers_api.php?action=list&category=خارجي'),
        ]);
        const [dL, dF] = await Promise.all([rL.json(), rF.json()]);
        SuppState.local = dL.success ? dL.data : [];
        SuppState.foreign = dF.success ? dF.data : [];
        suppRender('local');
        suppRender('foreign');
    } catch (e) {
        showToast('خطأ في تحميل الموردين', 'error');
    }
}

// ══════════════════════════════════════════════════════════
// رسم الجدول
// ══════════════════════════════════════════════════════════
function suppRender(type) {
    const isLocal = type === 'local';
    const data = SuppState[type];
    const q = (SuppState.filter[type] || '').toLowerCase();
    const tbody = document.getElementById(`supp-tbody-${type}`);
    const countEl = document.getElementById(`supp-count-${type}`);
    if (!tbody) return;

    const filtered = q
        ? data.filter(s => (s.name + s.cr_number + s.contact_name + s.phone + s.country).toLowerCase().includes(q))
        : data;

    if (countEl) countEl.textContent = data.length;

    if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="8" class="supp-empty">
            ${q ? '🔍 لا نتائج للبحث' : (isLocal ? '🏠 لا يوجد موردون محليون بعد' : '🌐 لا يوجد موردون خارجيون بعد')}
        </td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map((s, i) => {
        const active = parseInt(s.is_active);
        const badge = active
            ? '<span class="supp-badge supp-badge-active">نشط</span>'
            : '<span class="supp-badge supp-badge-inactive">موقوف</span>';

        const col3 = isLocal
            ? `<td>${s.cr_number || '<span class="supp-na">—</span>'}</td>
               <td>${s.vat_number || '<span class="supp-na">—</span>'}</td>`
            : `<td>${s.country || '<span class="supp-na">—</span>'}</td>
               <td>${s.city || '<span class="supp-na">—</span>'}</td>`;

        return `
        <tr class="${active ? '' : 'supp-row-inactive'}">
            <td class="supp-idx">${i + 1}</td>
            <td class="supp-name">
                <div class="supp-name-main">${s.name}</div>
                ${s.notes ? `<div class="supp-name-sub">${s.notes}</div>` : ''}
            </td>
            ${col3}
            <td>${s.contact_name || '<span class="supp-na">—</span>'}</td>
            <td dir="ltr">${s.phone || '<span class="supp-na">—</span>'}</td>
            <td>${badge}</td>
            <td class="supp-actions">
                <button class="supp-act-btn supp-act-edit" onclick="suppOpenModal(${s.id},'${s.category}')" title="تعديل">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                </button>
                <button class="supp-act-btn ${active ? 'supp-act-pause' : 'supp-act-play'}"
                        onclick="suppToggle(${s.id},${active ? 0 : 1},'${type}')" title="${active ? 'إيقاف' : 'تفعيل'}">
                    ${active
                ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>'
                : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>'
            }
                </button>
                <button class="supp-act-btn supp-act-del" onclick="suppDelete(${s.id},'${type}')" title="حذف">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                        <path d="M10 11v6"/><path d="M14 11v6"/>
                    </svg>
                </button>
            </td>
        </tr>`;
    }).join('');
}

// ══════════════════════════════════════════════════════════
// تبديل التبويب
// ══════════════════════════════════════════════════════════
function suppSwitchTab(type) {
    ['local', 'foreign'].forEach(t => {
        document.getElementById(`supp-tab-${t}`)?.classList.toggle('active', t === type);
        const p = document.getElementById(`supp-panel-${t}`);
        if (p) p.style.display = t === type ? '' : 'none';
    });
}

// ══════════════════════════════════════════════════════════
// بحث
// ══════════════════════════════════════════════════════════
function suppFilter(type) {
    SuppState.filter[type] = document.getElementById(`supp-search-${type}`)?.value || '';
    suppRender(type);
}

// ══════════════════════════════════════════════════════════
// فتح Modal الإضافة / التعديل
// ══════════════════════════════════════════════════════════
async function suppOpenModal(id, defaultCategory) {
    const isEdit = !!id;
    let data = { category: defaultCategory || 'محلي' };

    if (isEdit) {
        try {
            const r = await fetch(`api/suppliers_api.php?action=get&id=${id}`);
            const d = await r.json();
            if (!d.success) { showToast('تعذّر جلب بيانات المورد', 'error'); return; }
            data = d.data;
        } catch { showToast('خطأ في الاتصال', 'error'); return; }
    }

    const isLocal = data.category === 'محلي';
    const title = isEdit
        ? `تعديل مورد ${isLocal ? 'محلي 🏠' : 'خارجي 🌐'}`
        : `إضافة مورد ${isLocal ? 'محلي 🏠' : 'خارجي 🌐'}`;

    DOM.modalTitle.textContent = title;
    DOM.modalBody.innerHTML = `
    <div class="supp-form">
        <input type="hidden" id="sf-id"       value="${data.id || ''}">
        <input type="hidden" id="sf-category" value="${data.category}">

        <div class="supp-form-grid">

            <div class="supp-form-field supp-form-full">
                <label>اسم المورد <span class="prf-req">*</span></label>
                <input type="text" id="sf-name" class="supp-inp" value="${data.name || ''}"
                       placeholder="الاسم الرسمي للمورد">
            </div>

            ${isLocal ? `
            <div class="supp-form-field">
                <label>السجل التجاري</label>
                <input type="text" id="sf-cr" class="supp-inp" value="${data.cr_number || ''}"
                       placeholder="رقم السجل التجاري">
            </div>
            <div class="supp-form-field">
                <label>الرقم الضريبي</label>
                <input type="text" id="sf-vat" class="supp-inp" value="${data.vat_number || ''}"
                       placeholder="رقم ضريبة القيمة المضافة">
            </div>
            ` : `
            <div class="supp-form-field">
                <label>الدولة</label>
                <input type="text" id="sf-country" class="supp-inp" value="${data.country || ''}"
                       placeholder="مثال: المملكة العربية السعودية">
            </div>
            <div class="supp-form-field">
                <label>المدينة</label>
                <input type="text" id="sf-city" class="supp-inp" value="${data.city || ''}"
                       placeholder="المدينة">
            </div>
            `}

            <div class="supp-form-field">
                <label>جهة الاتصال</label>
                <input type="text" id="sf-contact" class="supp-inp" value="${data.contact_name || ''}"
                       placeholder="اسم المسؤول">
            </div>
            <div class="supp-form-field">
                <label>الهاتف</label>
                <input type="tel" id="sf-phone" class="supp-inp" dir="ltr" value="${data.phone || ''}"
                       placeholder="+966 5x xxx xxxx">
            </div>
            <div class="supp-form-field">
                <label>البريد الإلكتروني</label>
                <input type="email" id="sf-email" class="supp-inp" dir="ltr" value="${data.email || ''}"
                       placeholder="email@example.com">
            </div>
            <div class="supp-form-field">
                <label>الحالة</label>
                <select id="sf-active" class="supp-inp">
                    <option value="1" ${parseInt(data.is_active ?? 1) ? 'selected' : ''}>✅ نشط</option>
                    <option value="0" ${!parseInt(data.is_active ?? 1) ? 'selected' : ''}>🚫 موقوف</option>
                </select>
            </div>

            <div class="supp-form-field supp-form-full">
                <label>العنوان</label>
                <input type="text" id="sf-address" class="supp-inp" value="${data.address || ''}"
                       placeholder="العنوان التفصيلي">
            </div>
            <div class="supp-form-field supp-form-full">
                <label>ملاحظات</label>
                <textarea id="sf-notes" class="supp-inp" rows="2"
                          placeholder="أي ملاحظات إضافية...">${data.notes || ''}</textarea>
            </div>

        </div>

        <div class="modal-footer" style="padding:0;border:none;margin-top:1.25rem">
            <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
            <button class="btn btn-primary" onclick="suppSave()">
                ${isEdit ? '💾 حفظ التعديلات' : '➕ إضافة المورد'}
            </button>
        </div>
    </div>`;

    openModal();
}

// ══════════════════════════════════════════════════════════
// حفظ
// ══════════════════════════════════════════════════════════
async function suppSave() {
    const id = document.getElementById('sf-id')?.value || '';
    const category = document.getElementById('sf-category')?.value || 'محلي';
    const name = document.getElementById('sf-name')?.value?.trim() || '';
    const isLocal = category === 'محلي';

    if (!name) { showToast('اسم المورد مطلوب', 'error'); return; }

    const body = {
        id,
        name,
        category,
        cr_number: isLocal ? (document.getElementById('sf-cr')?.value?.trim() || '') : '',
        vat_number: isLocal ? (document.getElementById('sf-vat')?.value?.trim() || '') : '',
        country: !isLocal ? (document.getElementById('sf-country')?.value?.trim() || '') : '',
        city: !isLocal ? (document.getElementById('sf-city')?.value?.trim() || '') : '',
        contact_name: document.getElementById('sf-contact')?.value?.trim() || '',
        phone: document.getElementById('sf-phone')?.value?.trim() || '',
        email: document.getElementById('sf-email')?.value?.trim() || '',
        address: document.getElementById('sf-address')?.value?.trim() || '',
        notes: document.getElementById('sf-notes')?.value?.trim() || '',
        is_active: document.getElementById('sf-active')?.value ?? '1',
    };

    try {
        const res = await fetch('api/suppliers_api.php?action=save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await res.json();
        if (data.success) {
            showToast(data.message, 'success');
            closeModal();
            await suppLoadAll();
            suppSwitchTab(category === 'محلي' ? 'local' : 'foreign');
        } else {
            showToast(data.message || 'فشل الحفظ', 'error');
        }
    } catch { showToast('خطأ في الاتصال', 'error'); }
}

// ══════════════════════════════════════════════════════════
// تفعيل / إيقاف
// ══════════════════════════════════════════════════════════
async function suppToggle(id, isActive, type) {
    try {
        const res = await fetch('api/suppliers_api.php?action=toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, is_active: isActive }),
        });
        const data = await res.json();
        if (data.success) {
            showToast(data.message, 'success');
            await suppLoadAll();
            suppSwitchTab(type);
        } else {
            showToast(data.message || 'فشل التحديث', 'error');
        }
    } catch { showToast('خطأ في الاتصال', 'error'); }
}

// ══════════════════════════════════════════════════════════
// حذف
// ══════════════════════════════════════════════════════════
async function suppDelete(id, type) {
    if (!confirm('هل تريد حذف هذا المورد نهائياً؟')) return;
    try {
        const res = await fetch('api/suppliers_api.php?action=delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id }),
        });
        const data = await res.json();
        if (data.success) {
            showToast(data.message, 'success');
            await suppLoadAll();
            suppSwitchTab(type);
        } else {
            showToast(data.message, 'error');
        }
    } catch { showToast('خطأ في الاتصال', 'error'); }
}

// ══════════════════════════════════════════════════════════
// حقن الأنماط
// ══════════════════════════════════════════════════════════
function suppInjectStyles() {
    if (document.getElementById('supp-styles')) return;
    const s = document.createElement('style');
    s.id = 'supp-styles';
    s.textContent = `
    /* ── صفحة الموردين ─────────────────────────── */
    .supp-page { display:flex; flex-direction:column; gap:1.25rem; }
    .supp-header { display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:1rem; }
    .supp-title { font-size:1.3rem; font-weight:700; color:var(--text-primary); margin:0; }
    .supp-subtitle { font-size:.82rem; color:var(--text-muted); margin:.25rem 0 0; }

    /* تبويبات */
    .supp-tabs { display:flex; gap:.5rem; border-bottom:2px solid var(--border-color); padding-bottom:0; }
    .supp-tab {
        display:flex; align-items:center; gap:.5rem;
        padding:.6rem 1.25rem; background:transparent;
        border:none; border-bottom:3px solid transparent; margin-bottom:-2px;
        font-family:inherit; font-size:.88rem; font-weight:500;
        color:var(--text-secondary); cursor:pointer; transition:all .2s;
        border-radius:6px 6px 0 0;
    }
    .supp-tab:hover { color:var(--text-primary); background:var(--bg-surface); }
    .supp-tab.active { color:var(--btn-primary-bg,#3F5950); border-bottom-color:var(--btn-primary-bg,#3F5950); font-weight:600; }
    .supp-tab-count {
        display:inline-flex; align-items:center; justify-content:center;
        min-width:22px; height:20px; padding:0 6px;
        background:var(--bg-surface); border:1px solid var(--border-color);
        border-radius:10px; font-size:.75rem; font-weight:700; color:var(--text-muted);
    }
    .supp-tab.active .supp-tab-count {
        background:var(--btn-primary-bg,#3F5950); color:#fff; border-color:transparent;
    }

    /* لوحة */
    .supp-panel { display:flex; flex-direction:column; gap:1rem; }

    /* شريط الأدوات */
    .supp-toolbar { display:flex; align-items:center; gap:.75rem; flex-wrap:wrap; }
    .supp-search-wrap {
        display:flex; align-items:center; gap:.5rem;
        background:var(--bg-surface); border:1px solid var(--border-color);
        border-radius:8px; padding:.45rem .75rem; flex:1; min-width:200px;
        color:var(--text-muted);
    }
    .supp-search { border:none; background:transparent; color:var(--text-primary); font-family:inherit; font-size:.85rem; outline:none; width:100%; }
    .supp-btn-add {
        display:flex; align-items:center; gap:.5rem;
        padding:.5rem 1.1rem; background:var(--btn-primary-bg,#3F5950);
        color:var(--btn-primary-text,#fff); border:none; border-radius:8px;
        font-family:inherit; font-size:.85rem; font-weight:600; cursor:pointer;
        transition:opacity .2s; white-space:nowrap;
    }
    .supp-btn-add:hover { opacity:.88; }

    /* جدول */
    .supp-table-wrap { overflow-x:auto; border-radius:10px; border:1px solid var(--border-color); }
    .supp-table { width:100%; border-collapse:collapse; font-size:.84rem; }
    .supp-table thead tr { background:var(--bg-surface); }
    .supp-table th {
        padding:.7rem 1rem; text-align:right; font-weight:600;
        color:var(--text-secondary); font-size:.78rem;
        border-bottom:1px solid var(--border-color); white-space:nowrap;
    }
    .supp-table td { padding:.7rem 1rem; border-bottom:1px solid var(--border-color); color:var(--text-primary); vertical-align:middle; }
    .supp-table tbody tr:last-child td { border-bottom:none; }
    .supp-table tbody tr:hover { background:var(--bg-surface); }
    .supp-row-inactive td { opacity:.55; }
    .supp-idx { color:var(--text-muted); font-size:.78rem; width:40px; }
    .supp-name-main { font-weight:600; }
    .supp-name-sub { font-size:.75rem; color:var(--text-muted); margin-top:2px; }
    .supp-na { color:var(--text-muted); font-size:.78rem; }
    .supp-loading, .supp-empty { text-align:center; padding:2.5rem 1rem; color:var(--text-muted); font-size:.9rem; }

    /* شارات */
    .supp-badge { display:inline-block; padding:.2rem .6rem; border-radius:5px; font-size:.75rem; font-weight:600; }
    .supp-badge-active   { background:rgba(34,197,94,.12); color:#22c55e; }
    .supp-badge-inactive { background:rgba(148,163,184,.12); color:#94a3b8; }

    /* أزرار الإجراءات */
    .supp-actions { display:flex; gap:.3rem; }
    .supp-act-btn {
        display:inline-flex; align-items:center; justify-content:center;
        width:28px; height:28px; border-radius:6px; border:none;
        cursor:pointer; transition:all .15s; background:var(--bg-surface);
        color:var(--text-secondary);
    }
    .supp-act-btn:hover { transform:scale(1.1); }
    .supp-act-edit:hover  { color:#3b82f6; background:rgba(59,130,246,.1); }
    .supp-act-pause:hover { color:#f59e0b; background:rgba(245,158,11,.1); }
    .supp-act-play:hover  { color:#22c55e; background:rgba(34,197,94,.1); }
    .supp-act-del:hover   { color:#ef4444; background:rgba(239,68,68,.1); }

    /* نموذج */
    .supp-form-grid { display:grid; grid-template-columns:1fr 1fr; gap:.85rem; }
    .supp-form-full { grid-column:1/-1; }
    .supp-form-field { display:flex; flex-direction:column; gap:.3rem; }
    .supp-form-field label { font-size:.8rem; font-weight:600; color:var(--text-secondary); }
    .supp-inp {
        padding:.55rem .85rem; border:1px solid var(--border-color);
        border-radius:8px; background:var(--bg-surface); color:var(--text-primary);
        font-family:inherit; font-size:.88rem; outline:none; transition:border-color .2s;
        width:100%; box-sizing:border-box;
    }
    .supp-inp:focus { border-color:var(--btn-primary-bg,#3F5950); }
    textarea.supp-inp { resize:vertical; min-height:60px; }

    /* إضافة سريعة */
    .supp-quick-form { padding:.5rem 0; }

    @media (max-width:600px) {
        .supp-form-grid { grid-template-columns:1fr; }
        .supp-form-full { grid-column:1; }
        .supp-toolbar { flex-direction:column; align-items:stretch; }
    }
    `;
    document.head.appendChild(s);
}