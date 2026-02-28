/**
 * app-budget.js — شاشة الحجوزات المالية
 * ════════════════════════════════════════════════════════════
 */

// ── حالة الشاشة ────────────────────────────────────────────
const BudgetState = {
    reservations: [],
    meta: { departments: [], suppliers: [], transactions: [] },
    filter: { status: '', department_id: '', fiscal_year: '', search: '' },
    currentStep: 1,
    loaded: false,
};

// ── تسميات الحالات ──────────────────────────────────────────
const RES_STATUS = {
    'مسودة': { color: '#94a3b8', bg: 'rgba(148,163,184,.15)', icon: '📝' },
    'قيد المراجعة': { color: '#f59e0b', bg: 'rgba(245,158,11,.12)', icon: '🔍' },
    'معتمد': { color: '#22c55e', bg: 'rgba(34,197,94,.12)', icon: '✅' },
    'مرفوض': { color: '#ef4444', bg: 'rgba(239,68,68,.12)', icon: '❌' },
    'ملغى': { color: '#6b7280', bg: 'rgba(107,114,128,.12)', icon: '🚫' },
    'منفذ': { color: '#8b5cf6', bg: 'rgba(139,92,246,.12)', icon: '🎯' },
};

const PRIORITY_COLOR = {
    'عادي': 'var(--text-muted)',
    'عاجل': '#f59e0b',
    'حرج': '#ef4444',
};

// ── ثوابت نموذج الحجز ───────────────────────────────────────
const BUDGET_CATEGORIES = [
    'رأس المال', 'تشغيلي', 'صيانة وإصلاح', 'تقنية معلومات',
    'تدريب وتطوير', 'خدمات استشارية', 'مستلزمات مكتبية',
    'أثاث ومعدات', 'سيارات ومركبات', 'إنشاءات وبنية تحتية',
];
const COST_CENTERS = [
    { id: 'CC-1001', name: 'الإدارة العامة' },
    { id: 'CC-1002', name: 'التخطيط والميزانية' },
    { id: 'CC-1003', name: 'الموارد البشرية' },
    { id: 'CC-1004', name: 'تقنية المعلومات' },
    { id: 'CC-1005', name: 'المشتريات' },
    { id: 'CC-1006', name: 'المالية والحسابات' },
    { id: 'CC-1007', name: 'الشؤون الإدارية' },
    { id: 'CC-1008', name: 'التدريب والتطوير' },
];

// حالة أصناف الطلب (multi-item)
let _rfItems = [];

// ═══════════════════════════════════════════════════════════════
//  نقطة الدخول
// ═══════════════════════════════════════════════════════════════
async function loadBudgetReservationsPage() {
    DOM.mainContent.innerHTML = `
        <div class="budget-page-wrap">
            <div style="text-align:center;padding:3rem">
                <div class="spinner"></div>
                <p style="margin-top:1rem;color:var(--text-muted)">جاري التحميل…</p>
            </div>
        </div>`;

    injectBudgetStyles();

    await Promise.all([
        fetchReservations(),
        fetchBudgetMeta(),
    ]);

    renderBudgetPage();
}

// ── جلب البيانات ────────────────────────────────────────────
async function fetchReservations() {
    try {
        const params = new URLSearchParams(
            Object.fromEntries(Object.entries(BudgetState.filter).filter(([, v]) => v))
        );
        // ── صلاحيات العرض ──────────────────────────────────
        const canViewAll = canDo('reservation.view_all');
        const canViewOwn = canDo('reservation.view_own');
        if (!canViewAll && !canViewOwn) { BudgetState.reservations = []; return; }
        if (!canViewAll) params.set('scope', 'own');

        const res = await fetch(`api/budget.php?action=list&${params}`);
        const data = await res.json();
        if (data.success) BudgetState.reservations = data.data;
    } catch (e) { console.error(e); }
}

async function fetchBudgetMeta() {
    try {
        const res = await fetch('api/budget.php?action=meta');
        const data = await res.json();
        if (data.success) BudgetState.meta = data.data;
    } catch (e) { console.error(e); }
}

// ═══════════════════════════════════════════════════════════════
//  رسم الصفحة الرئيسية
// ═══════════════════════════════════════════════════════════════
function renderBudgetPage() {
    const { reservations, filter, meta } = BudgetState;

    // إحصائيات سريعة
    const total = reservations.length;
    const pending = reservations.filter(r => r.status === 'قيد المراجعة').length;
    const approved = reservations.filter(r => r.status === 'معتمد').length;
    const rejected = reservations.filter(r => r.status === 'مرفوض').length;
    const totalAmt = reservations.reduce((s, r) => s + parseFloat(r.grand_total || 0), 0);

    const statsHtml = `
        <div class="budget-stats-row">
            <div class="budget-stat-card">
                <div class="bsc-icon" style="background:rgba(99,102,241,.12);color:#6366f1">📋</div>
                <div class="bsc-body">
                    <div class="bsc-num">${total}</div>
                    <div class="bsc-label">إجمالي الحجوزات</div>
                </div>
            </div>
            <div class="budget-stat-card">
                <div class="bsc-icon" style="background:rgba(245,158,11,.12);color:#f59e0b">🔍</div>
                <div class="bsc-body">
                    <div class="bsc-num">${pending}</div>
                    <div class="bsc-label">قيد المراجعة</div>
                </div>
            </div>
            <div class="budget-stat-card">
                <div class="bsc-icon" style="background:rgba(34,197,94,.12);color:#22c55e">✅</div>
                <div class="bsc-body">
                    <div class="bsc-num">${approved}</div>
                    <div class="bsc-label">معتمدة</div>
                </div>
            </div>
            <div class="budget-stat-card">
                <div class="bsc-icon" style="background:rgba(239,68,68,.12);color:#ef4444">❌</div>
                <div class="bsc-body">
                    <div class="bsc-num">${rejected}</div>
                    <div class="bsc-label">مرفوضة</div>
                </div>
            </div>
            <div class="budget-stat-card wide">
                <div class="bsc-icon" style="background:rgba(139,92,246,.12);color:#8b5cf6">💰</div>
                <div class="bsc-body">
                    <div class="bsc-num">${fmtMoney ? fmtMoney(totalAmt) : totalAmt.toLocaleString('ar-SA')}</div>
                    <div class="bsc-label">إجمالي المبالغ المطلوبة</div>
                </div>
            </div>
        </div>`;

    // شريط الفلاتر
    const filtersHtml = `
        <div class="budget-filters-bar">
            <input type="text" class="filter-input" placeholder="🔍 بحث برقم الحجز أو الغرض…"
                value="${filter.search}" oninput="budgetFilterChange('search', this.value)">

            <select class="filter-select" onchange="budgetFilterChange('status', this.value)">
                <option value="">كل الحالات</option>
                ${Object.keys(RES_STATUS).map(s =>
        `<option value="${s}" ${filter.status === s ? 'selected' : ''}>${s}</option>`
    ).join('')}
            </select>

            <select class="filter-select" onchange="budgetFilterChange('department_id', this.value)">
                <option value="">كل الأقسام</option>
                ${meta.departments.map(d =>
        `<option value="${d.id}" ${filter.department_id == d.id ? 'selected' : ''}>${d.name}</option>`
    ).join('')}
            </select>

            ${canDo('reservation.add') ? `
            <button class="btn btn-primary" onclick="openAddReservationModal()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                حجز جديد
            </button>` : ''}
        </div>`;

    DOM.mainContent.innerHTML = `
        <div class="budget-page-wrap">
            <div class="budget-page-header">
                <div>
                    <h2 class="budget-page-title">📑 شاشة الحجوزات</h2>
                    <p class="budget-page-sub">إدارة حجوزات الموازنة المالية لكافة الأقسام</p>
                </div>
            </div>
            ${statsHtml}
            ${filtersHtml}
            ${renderReservationsTable(reservations)}
        </div>`;
}

// ── الجدول ─────────────────────────────────────────────────
function renderReservationsTable(list) {
    if (!list.length) return `
        <div class="budget-empty">
            <div style="font-size:3rem">📋</div>
            <h3>لا توجد حجوزات</h3>
            <p>ابدأ بإضافة حجز جديد</p>
        </div>`;

    const rows = list.map(r => {
        const st = RES_STATUS[r.status] || RES_STATUS['مسودة'];
        const prColor = PRIORITY_COLOR[r.priority] || 'var(--text-muted)';
        const amt = parseFloat(r.grand_total || 0).toLocaleString('ar-SA', { minimumFractionDigits: 2 });
        const txBadge = r.transaction_number
            ? `<span class="res-tx-badge" title="مرتبط بمعاملة">${r.transaction_number}</span>`
            : `<span class="res-tx-badge unlinked">غير مرتبط</span>`;

        return `
            <tr class="res-row" onclick="openReservationDetails(${r.id})">
                <td>
                    <div class="res-num">${r.reservation_number}</div>
                    <div class="res-date">${r.request_date}</div>
                </td>
                <td>
                    <div class="res-purpose">${r.purpose}</div>
                    <div class="res-dept">${r.department_name || '—'}</div>
                </td>
                <td>
                    <div style="font-weight:600">${r.supplier_name || '—'}</div>
                    ${r.quotation_number ? `<div class="res-date">عرض سعر: ${r.quotation_number}</div>` : ''}
                </td>
                <td class="res-amount">
                    <div>${fmtMoney ? fmtMoney(parseFloat(r.grand_total || 0)) : amt} ${r.currency}</div>
                    ${r.vat_amount > 0 ? `<div class="res-date">+ ض.ق.م ${fmtMoney ? fmtMoney(parseFloat(r.vat_amount)) : parseFloat(r.vat_amount).toLocaleString('ar-SA')}</div>` : ''}
                </td>
                <td>
                    <span class="res-status-badge" style="color:${st.color};background:${st.bg}">
                        ${st.icon} ${r.status}
                    </span>
                </td>
                <td>
                    <span style="color:${prColor};font-weight:600;font-size:.78rem">${r.priority}</span>
                </td>
                <td>${txBadge}</td>
                <td onclick="event.stopPropagation()">
                    <div style="display:flex;gap:.35rem;justify-content:center">
                        <button class="btn-icon-sm" onclick="openReservationDetails(${r.id})" title="تفاصيل">👁</button>
                        ${canDo('reservation.review') && r.status === 'قيد المراجعة'
                ? `<button class="btn-icon-sm btn-success" onclick="event.stopPropagation();openReviewModal(${r.id})" title="مراجعة">✓</button>`
                : ''}
                    </div>
                </td>
            </tr>`;
    }).join('');

    return `
        <div class="budget-table-wrap">
            <table class="budget-table">
                <thead>
                    <tr>
                        <th>رقم الحجز</th>
                        <th>الغرض / القسم</th>
                        <th>المورد</th>
                        <th>المبلغ</th>
                        <th>الحالة</th>
                        <th>الأولوية</th>
                        <th>المعاملة</th>
                        <th>إجراءات</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;
}

// ── فلترة ────────────────────────────────────────────────────
let budgetSearchTimer;
function budgetFilterChange(key, value) {
    BudgetState.filter[key] = value;
    clearTimeout(budgetSearchTimer);
    budgetSearchTimer = setTimeout(async () => {
        await fetchReservations();
        renderBudgetPage();
    }, 300);
}

// ═══════════════════════════════════════════════════════════════
//  نموذج إضافة حجز — مراحل متتالية
// ═══════════════════════════════════════════════════════════════
function openAddReservationModal() {
    BudgetState.currentStep = 1;
    _rfItems = Array.from({ length: 5 }, () => ({
        description: '', qty: 1, unit: 'قطعة', price: 0, includeVat: false,
    }));
    DOM.modalTitle.textContent = '📋 حجز جديد';
    DOM.modalBody.innerHTML = renderReservationForm();
    document.querySelector('.modal')?.classList.add('budget-modal-wide');
    openModal();
}

function renderReservationForm(step = BudgetState.currentStep) {
    const { departments, suppliers } = BudgetState.meta;
    const today = new Date().toISOString().split('T')[0];

    const steps = [
        { n: 1, label: 'البيانات الأساسية', icon: '📌' },
        { n: 2, label: 'بيانات المورد', icon: '🏢' },
        { n: 3, label: 'بيانات الطلب', icon: '📦' },
    ];

    const stepsHtml = `
        <div class="res-steps-bar">
            ${steps.map(s => `
                <div class="res-step ${step === s.n ? 'active' : step > s.n ? 'done' : ''}">
                    <div class="res-step-circle">${step > s.n ? '✓' : s.n}</div>
                    <div class="res-step-label">${s.icon} ${s.label}</div>
                </div>
                ${s.n < 3 ? '<div class="res-step-line"></div>' : ''}
            `).join('')}
        </div>`;

    let formBody = '';

    // ── الخطوة 1: البيانات الأساسية ─────────────────────────
    if (step === 1) {
        formBody = `
            <div class="res-form-grid">
                <div class="res-form-group full">
                    <label>الغرض من الشراء <span class="req">*</span></label>
                    <input type="text" class="form-input" id="rf_purpose"
                        placeholder="مثال: شراء أجهزة حاسوب لقسم تقنية المعلومات">
                </div>
                <div class="res-form-group">
                    <label>القسم الطالب <span class="req">*</span></label>
                    <select class="form-select" id="rf_department_id">
                        <option value="">-- اختر القسم --</option>
                        ${departments.map(d => `<option value="${d.id}">${d.name}</option>`).join('')}
                    </select>
                </div>
                <div class="res-form-group">
                    <label>تاريخ الطلب <span class="req">*</span></label>
                    <input type="date" class="form-input" id="rf_request_date" value="${today}">
                </div>
                <div class="res-form-group">
                    <label>الأولوية</label>
                    <select class="form-select" id="rf_priority">
                        <option value="عادي">عادي</option>
                        <option value="عاجل">عاجل ⚡</option>
                        <option value="حرج">حرج 🔴</option>
                    </select>
                </div>
                <div class="res-form-group">
                    <label>بند الموازنة</label>
                    <select class="form-select" id="rf_budget_category">
                        <option value="">-- اختر البند --</option>
                        ${BUDGET_CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('')}
                    </select>
                </div>
                <div class="res-form-group">
                    <label>مركز التكلفة</label>
                    <select class="form-select" id="rf_cost_center">
                        <option value="">-- اختر مركز التكلفة --</option>
                        ${COST_CENTERS.map(c =>
            `<option value="${c.id}">${c.id} — ${c.name}</option>`
        ).join('')}
                    </select>
                </div>
            </div>`;
    }

    // ── الخطوة 2: بيانات المورد ─────────────────────────────
    if (step === 2) {
        formBody = `
            <div class="res-form-grid">
                <div class="res-form-group full">
                    <label>المورد</label>
                    <select class="form-select" id="rf_supplier_id" onchange="onSupplierChange(this)">
                        <option value="">-- اختر من القائمة أو أدخل يدوياً --</option>
                        ${suppliers.map(s =>
            `<option value="${s.id}">${s.name} (${s.cr_number || '—'})</option>`
        ).join('')}
                        <option value="manual">➕ مورد غير موجود في القائمة</option>
                    </select>
                </div>
                <div class="res-form-group full" id="rf_manual_supplier_wrap" style="display:none">
                    <label>اسم المورد <span class="req">*</span></label>
                    <input type="text" class="form-input" id="rf_supplier_name_manual"
                        placeholder="أدخل اسم المورد">
                    <small style="color:var(--text-muted);font-size:.74rem">
                        💡 سيتم إضافة هذا المورد لقاعدة البيانات عند حفظ الحجز
                    </small>
                </div>
                <div class="res-form-group">
                    <label>رقم عرض السعر</label>
                    <input type="text" class="form-input" id="rf_quotation_number" placeholder="Q-2026-XXXX">
                </div>
                <div class="res-form-group">
                    <label>تاريخ عرض السعر</label>
                    <input type="date" class="form-input" id="rf_quotation_date">
                </div>
            </div>`;
    }

    // ── الخطوة 3: جدول الأصناف ──────────────────────────────
    if (step === 3) {
        formBody = `
            <div class="rf-items-wrap">
                <div class="rf-items-header">
                    <span style="flex:3;min-width:140px">الوصف / الصنف <span class="req">*</span></span>
                    <span style="flex:.7;min-width:55px;text-align:center">الكمية</span>
                    <span style="flex:1;min-width:80px;text-align:center">الوحدة</span>
                    <span style="flex:1.1;min-width:85px;text-align:center">سعر الوحدة</span>
                    <span style="flex:.8;min-width:70px;text-align:center">يشمل VAT</span>
                    <span style="flex:1;min-width:80px;text-align:center">الإجمالي</span>
                    <span style="width:30px"></span>
                </div>
                <div id="rf_items_list">
                    ${_rfItems.map((it, i) => renderItemRow(it, i)).join('')}
                </div>
            </div>

            <button class="rf-add-row-btn" onclick="addItemRow()">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                إضافة صف جديد
            </button>

            <div class="rf-totals-box" id="rf_totals_box">${renderTotalsBox()}</div>

            <div class="res-form-group" style="margin-top:.25rem">
                <label>العملة</label>
                <select class="form-select" id="rf_currency" style="max-width:220px">
                    <option value="SAR" selected>ريال سعودي (SAR)</option>
                    <option value="USD">دولار أمريكي (USD)</option>
                    <option value="EUR">يورو (EUR)</option>
                </select>
            </div>`;
    }

    const navHtml = `
        <div class="res-form-nav">
            ${step > 1
            ? `<button class="btn btn-secondary" onclick="budgetFormStep(${step - 1})">← السابق</button>`
            : `<button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>`}
            ${step < 3
            ? `<button class="btn btn-primary" onclick="budgetFormStep(${step + 1})">التالي →</button>`
            : `<button class="btn btn-primary" onclick="submitReservation()">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        حفظ الحجز
                   </button>`}
        </div>`;

    return `<div class="res-form-wrap">${stepsHtml}<div class="res-form-body">${formBody}</div>${navHtml}</div>`;
}

// ── جدول الأصناف ────────────────────────────────────────────
function renderItemRow(item, i) {
    const units = ['قطعة', 'طن', 'متر', 'لتر', 'صندوق', 'كيلوغرام', 'خدمة', 'أخرى'];
    return `
        <div class="rf-item-row" data-i="${i}">
            <input class="form-input"
                style="flex:3;min-width:140px"
                placeholder="وصف الصنف…" value="${item.description || ''}"
                oninput="updateItem(${i},'description',this.value)">
            <input class="form-input" type="number" min="1"
                style="flex:.7;min-width:55px;text-align:center"
                value="${item.qty || 1}"
                oninput="updateItem(${i},'qty',+this.value);refreshTotals()">
            <select class="form-select" style="flex:1;min-width:80px"
                onchange="updateItem(${i},'unit',this.value)">
                ${units.map(u => `<option ${item.unit === u ? 'selected' : ''}>${u}</option>`).join('')}
            </select>
            <input class="form-input" type="number" min="0" step="0.01"
                style="flex:1.1;min-width:85px;text-align:center;direction:ltr"
                value="${item.price || 0}"
                oninput="updateItem(${i},'price',+this.value);refreshTotals()">
            <div style="flex:.8;min-width:70px;display:flex;align-items:center;justify-content:center">
                <label class="rf-vat-toggle" title="السعر يشمل ضريبة القيمة المضافة (15%)">
                    <input type="checkbox" ${item.includeVat ? 'checked' : ''}
                        onchange="updateItem(${i},'includeVat',this.checked);refreshTotals()">
                    <span class="rf-vat-slider"></span>
                </label>
            </div>
            <div class="rf-item-line-total" id="rf_line_${i}"
                 style="flex:1;min-width:80px;font-weight:600;font-size:.84rem;
                        color:var(--accent-blue);text-align:center;direction:ltr">
                ${calcLineTotal(item)}
            </div>
            <button class="rf-del-row" onclick="removeItemRow(${i})" title="حذف الصف">✕</button>
        </div>`;
}

function calcLineTotal(item) {
    const net = (item.qty || 0) * (item.price || 0) / (item.includeVat ? 1.15 : 1);
    return net.toFixed(2);
}

function renderTotalsBox() {
    let subtotal = 0, vatTotal = 0;
    _rfItems.forEach(it => {
        const net = (it.qty || 0) * (it.price || 0) / (it.includeVat ? 1.15 : 1);
        subtotal += net;
        vatTotal += net * 0.15;
    });
    const grand = subtotal + vatTotal;
    return `
        <div class="rf-total-row"><span>المجموع قبل الضريبة</span><span>SAR ${subtotal.toFixed(2)}</span></div>
        <div class="rf-total-row"><span>ضريبة القيمة المضافة (15%)</span><span>SAR ${vatTotal.toFixed(2)}</span></div>
        <div class="rf-total-row grand"><span>الإجمالي الكلي</span><span>SAR ${grand.toFixed(2)}</span></div>`;
}

function updateItem(i, field, value) {
    if (_rfItems[i]) _rfItems[i][field] = value;
}

function refreshTotals() {
    _rfItems.forEach((it, i) => {
        const el = document.getElementById(`rf_line_${i}`);
        if (el) el.textContent = calcLineTotal(it);
    });
    const box = document.getElementById('rf_totals_box');
    if (box) box.innerHTML = renderTotalsBox();
}

function addItemRow() {
    _rfItems.push({ description: '', qty: 1, unit: 'قطعة', price: 0, includeVat: false });
    const list = document.getElementById('rf_items_list');
    if (list) {
        const tmp = document.createElement('div');
        tmp.innerHTML = renderItemRow(_rfItems[_rfItems.length - 1], _rfItems.length - 1);
        list.appendChild(tmp.firstElementChild);
    }
    refreshTotals();
}

function removeItemRow(i) {
    if (_rfItems.length <= 1) {
        showToast('⚠️ يجب الإبقاء على صف واحد على الأقل', 'warning');
        return;
    }
    _rfItems.splice(i, 1);
    const list = document.getElementById('rf_items_list');
    if (list) list.innerHTML = _rfItems.map((it, idx) => renderItemRow(it, idx)).join('');
    refreshTotals();
}

// ── التنقل بين الخطوات ──────────────────────────────────────
function budgetFormStep(step) {
    if (step > BudgetState.currentStep) {
        if (!validateBudgetStep(BudgetState.currentStep)) return;
    }
    saveBudgetFormData();
    BudgetState.currentStep = step;
    DOM.modalBody.innerHTML = renderReservationForm(step);
    restoreBudgetFormData();
}

const _budgetFormData = {};
function saveBudgetFormData() {
    const fields = [
        'rf_purpose', 'rf_department_id', 'rf_request_date', 'rf_priority',
        'rf_budget_category', 'rf_cost_center',
        'rf_supplier_id', 'rf_supplier_name_manual', 'rf_quotation_number', 'rf_quotation_date',
        'rf_currency',
    ];
    fields.forEach(id => {
        const el = document.getElementById(id);
        if (el) _budgetFormData[id] = el.value;
    });
}

function restoreBudgetFormData() {
    Object.entries(_budgetFormData).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el) el.value = val;
    });
    if (_budgetFormData['rf_supplier_id'] === 'manual') {
        const wrap = document.getElementById('rf_manual_supplier_wrap');
        if (wrap) wrap.style.display = 'block';
    }
    refreshTotals();
}

function validateBudgetStep(step) {
    if (step === 1) {
        const purpose = document.getElementById('rf_purpose')?.value.trim();
        const dept = document.getElementById('rf_department_id')?.value;
        if (!purpose) { showToast('⚠️ أدخل الغرض من الشراء', 'warning'); return false; }
        if (!dept) { showToast('⚠️ اختر القسم الطالب', 'warning'); return false; }
    }
    if (step === 3) {
        const hasDesc = _rfItems.some(it => it.description.trim());
        if (!hasDesc) { showToast('⚠️ أدخل وصف صنف واحد على الأقل', 'warning'); return false; }
    }
    saveBudgetFormData();
    return true;
}

function onSupplierChange(sel) {
    const wrap = document.getElementById('rf_manual_supplier_wrap');
    if (wrap) wrap.style.display = (sel.value === 'manual') ? 'block' : 'none';
}

// ── إرسال الحجز ─────────────────────────────────────────────
async function submitReservation() {
    if (!validateBudgetStep(3)) return;
    saveBudgetFormData();

    const activeItems = _rfItems.filter(it => it.description.trim());
    let subtotal = 0, vatTotal = 0;
    activeItems.forEach(it => {
        const net = (it.qty || 0) * (it.price || 0) / (it.includeVat ? 1.15 : 1);
        subtotal += net;
        vatTotal += net * 0.15;
    });

    const suppId = _budgetFormData['rf_supplier_id'];
    const body = {
        purpose: _budgetFormData['rf_purpose'],
        department_id: _budgetFormData['rf_department_id'],
        request_date: _budgetFormData['rf_request_date'],
        priority: _budgetFormData['rf_priority'],
        budget_category: _budgetFormData['rf_budget_category'],
        cost_center: _budgetFormData['rf_cost_center'],
        supplier_id: suppId !== 'manual' ? suppId : '',
        supplier_name_manual: suppId === 'manual' ? _budgetFormData['rf_supplier_name_manual'] : '',
        quotation_number: _budgetFormData['rf_quotation_number'],
        quotation_date: _budgetFormData['rf_quotation_date'],
        currency: _budgetFormData['rf_currency'] || 'SAR',
        items: activeItems,
        // backward-compat fields
        items_description: activeItems.map(it => `${it.description} (${it.qty} ${it.unit})`).join('\n'),
        quantity: activeItems.reduce((s, it) => s + (it.qty || 0), 0),
        unit: 'متعدد',
        unit_price: activeItems[0]?.price || 0,
        total_amount: subtotal.toFixed(2),
        vat_amount: vatTotal.toFixed(2),
        grand_total: (subtotal + vatTotal).toFixed(2),
    };

    try {
        const res = await fetch('api/budget.php?action=add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await res.json();
        if (data.success) {
            showToast(`✅ تم إنشاء الحجز رقم ${data.number}`, 'success');
            if (data.new_supplier_id) {
                BudgetState.meta.suppliers.push({
                    id: data.new_supplier_id, name: body.supplier_name_manual,
                });
            }
            closeModal();
            await fetchReservations();
            renderBudgetPage();
        } else {
            showToast('❌ ' + (data.error || 'خطأ في الحفظ'), 'error');
        }
    } catch (e) {
        showToast('❌ خطأ في الاتصال', 'error');
    }
}

// ═══════════════════════════════════════════════════════════════
//  تفاصيل الحجز — تصميم محدّث
// ═══════════════════════════════════════════════════════════════
async function openReservationDetails(id) {
    DOM.modalTitle.textContent = 'تفاصيل الحجز';
    DOM.modalBody.innerHTML = '<div style="text-align:center;padding:3rem"><div class="spinner"></div></div>';
    document.querySelector('.modal')?.classList.add('budget-modal-wide');
    openModal();

    try {
        const res = await fetch(`api/budget.php?action=get&id=${id}`);
        const data = await res.json();
        if (!data.success) {
            DOM.modalBody.innerHTML = '<p style="color:var(--accent-red);padding:2rem;text-align:center">خطأ في التحميل</p>';
            return;
        }

        const r = data.data;
        const st = RES_STATUS[r.status] || RES_STATUS['مسودة'];
        const log = r.log || [];

        // الأولوية
        const prioMap = {
            'عادي': { color: 'var(--text-muted)', bg: 'var(--bg-surface)', icon: '○' },
            'عاجل': { color: '#d97706', bg: 'rgba(245,158,11,.12)', icon: '⚡' },
            'حرج': { color: '#ef4444', bg: 'rgba(239,68,68,.12)', icon: '🔴' },
        };
        const prio = prioMap[r.priority] || prioMap['عادي'];

        // ── أصناف الطلب ────────────────────────────────────
        let itemsHtml = '';
        const rawItems = r.items
            ? (typeof r.items === 'string'
                ? (() => { try { return JSON.parse(r.items); } catch { return null; } })()
                : r.items)
            : null;

        if (rawItems && rawItems.length) {
            itemsHtml = `
                <div class="rdv-items-table">
                    <div class="rdv-items-head">
                        <span style="flex:3">الصنف</span>
                        <span style="flex:.8;text-align:center">الكمية</span>
                        <span style="flex:1">الوحدة</span>
                        <span style="flex:1.3;text-align:left">صافي الوحدة</span>
                        <span style="flex:1.3;text-align:left">الإجمالي</span>
                    </div>
                    ${rawItems.map(it => {
                const unitNet = (parseFloat(it.price) || 0) / (it.includeVat ? 1.15 : 1);
                const lineNet = unitNet * (parseFloat(it.qty) || 0);
                return `
                        <div class="rdv-items-row">
                            <span style="flex:3">${it.description || '—'}</span>
                            <span style="flex:.8;text-align:center">${it.qty || 0}</span>
                            <span style="flex:1">${it.unit || ''}</span>
                            <span style="flex:1.3;text-align:left;direction:ltr">${unitNet.toFixed(2)}${it.includeVat ? ' <small style="color:var(--text-muted)">(شامل)</small>' : ''}</span>
                            <span style="flex:1.3;text-align:left;font-weight:600;color:var(--accent-blue);direction:ltr">${lineNet.toFixed(2)}</span>
                        </div>`;
            }).join('')}
                </div>`;
        }

        // ── سجل الأحداث ────────────────────────────────────
        const logColors = {
            create: 'var(--accent-blue)', review: 'var(--accent-amber)',
            approve: 'var(--accent-green)', reject: 'var(--accent-red)',
        };
        const logHtml = log.length
            ? log.map(l => `
                <div class="rdv-log-item">
                    <div class="rdv-log-dot" style="background:${logColors[l.action] || 'var(--text-muted)'}"></div>
                    <div class="rdv-log-body">
                        <div class="rdv-log-action">${getLogActionLabel(l.action)}
                            ${l.new_status
                    ? `<span class="rdv-log-status" style="color:${logColors[l.action] || 'var(--text-muted)'}">← ${l.new_status}</span>`
                    : ''}
                        </div>
                        <div class="rdv-log-meta">
                            <span>👤 ${l.employee_name || '—'}</span>
                            <span>🕐 ${(l.created_at || '').slice(0, 16).replace('T', ' ')}</span>
                        </div>
                        ${l.notes ? `<div class="rdv-log-notes">${l.notes}</div>` : ''}
                    </div>
                </div>`).join('')
            : '<p style="color:var(--text-muted);font-size:.82rem;padding:.5rem 0">لا يوجد سجل أحداث بعد</p>';

        // ── التوجيه ────────────────────────────────────────
        const dtLabels = {
            'to_payment': '⚡ دفع مباشر',
            'to_purchase_order': '📋 أمر شراء / تعميد',
            'to_requester': '↩️ جهة طالبة',
        };
        const dtColors = {
            'to_payment': 'var(--accent-green)',
            'to_purchase_order': 'var(--accent-amber)',
            'to_requester': 'var(--accent-purple)',
        };
        const hasDispatch = !!r.dispatch_type;
        const isPaused = r.dispatch_ola_active == 0;
        const dtColor = dtColors[r.dispatch_type] || 'var(--text-muted)';

        DOM.modalTitle.textContent = `حجز #${r.reservation_number}`;
        DOM.modalBody.innerHTML = `
        <div class="rdv-wrap">

            <!-- رأس الحجز -->
            <div class="rdv-hero">
                <div class="rdv-hero-left">
                    <div class="rdv-num">${r.reservation_number}</div>
                    <div class="rdv-hero-meta">
                        <span>📅 ${r.request_date}</span>
                        <span>🏢 ${r.department_name || '—'}</span>
                        <span>👤 ${r.requested_by_name || '—'}</span>
                    </div>
                </div>
                <div class="rdv-hero-right">
                    <div class="rdv-status-pill" style="color:${st.color};background:${st.bg};border:1px solid ${st.color}30">
                        ${st.icon} ${r.status}
                    </div>
                    <div class="rdv-priority-pill" style="color:${prio.color};background:${prio.bg}">
                        ${prio.icon} ${r.priority}
                    </div>
                </div>
            </div>

            <!-- شريط المبلغ -->
            <div class="rdv-amount-banner">
                <div class="rdv-amount-parts">
                    <div class="rdv-amount-part">
                        <span class="rdv-amount-label">قبل الضريبة</span>
                        <span class="rdv-amount-val">${parseFloat(r.total_amount || 0).toLocaleString('ar-SA', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div class="rdv-amount-sep">+</div>
                    <div class="rdv-amount-part">
                        <span class="rdv-amount-label">ضريبة 15%</span>
                        <span class="rdv-amount-val">${parseFloat(r.vat_amount || 0).toLocaleString('ar-SA', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div class="rdv-amount-sep">=</div>
                    <div class="rdv-amount-part grand">
                        <span class="rdv-amount-label">الإجمالي الكلي</span>
                        <span class="rdv-amount-val grand">${parseFloat(r.grand_total || 0).toLocaleString('ar-SA', { minimumFractionDigits: 2 })} ${r.currency || 'SAR'}</span>
                    </div>
                </div>
            </div>

            <!-- عمودان -->
            <div class="rdv-cols">

                <!-- العمود الأيمن -->
                <div class="rdv-col">
                    <!-- الغرض -->
                    <div class="rdv-card rdv-purpose-card">
                        <div class="rdv-card-icon">📌</div>
                        <div>
                            <div class="rdv-card-label">الغرض من الشراء</div>
                            <div class="rdv-purpose-text">${r.purpose || '—'}</div>
                        </div>
                    </div>

                    <!-- المورد -->
                    <div class="rdv-card">
                        <div class="rdv-card-head">🏢 بيانات المورد</div>
                        <div class="rdv-row"><span>المورد</span><strong>${r.supplier_name || '—'}</strong></div>
                        ${r.quotation_number ? `<div class="rdv-row"><span>رقم العرض</span><strong>${r.quotation_number}</strong></div>` : ''}
                        ${r.quotation_date ? `<div class="rdv-row"><span>تاريخ العرض</span><strong>${r.quotation_date}</strong></div>` : ''}
                    </div>

                    <!-- الموازنة -->
                    <div class="rdv-card">
                        <div class="rdv-card-head">⚖️ مرحلة الموازنة</div>
                        <div class="rdv-row"><span>موظف الموازنة</span><strong>${r.budget_employee_name || '—'}</strong></div>
                        ${r.budget_code ? `<div class="rdv-row"><span>رمز الموازنة</span>
                            <strong style="font-family:monospace;color:var(--accent-blue)">${r.budget_code}</strong></div>` : ''}
                        ${r.budget_review_date ? `<div class="rdv-row"><span>تاريخ المراجعة</span>
                            <strong>${r.budget_review_date.slice?.(0, 10)}</strong></div>` : ''}
                        <div class="rdv-row"><span>معاملة مرتبطة</span>
                            ${r.transaction_number
                ? `<span class="res-tx-badge">${r.transaction_number}</span>`
                : '<span style="color:var(--text-muted)">—</span>'}</div>
                        ${r.budget_notes ? `<div class="rdv-row"><span>ملاحظات</span>
                            <span style="color:var(--text-secondary);font-size:.79rem">${r.budget_notes}</span></div>` : ''}
                        ${r.rejection_reason ? `
                            <div class="rdv-rejection">
                                <span>⛔</span><span>${r.rejection_reason}</span>
                            </div>` : ''}
                    </div>
                </div>

                <!-- العمود الأيسر -->
                <div class="rdv-col">
                    <!-- بند الموازنة + مركز التكلفة -->
                    <div class="rdv-card rdv-info-chips">
                        <div class="rdv-chip">
                            <div class="rdv-chip-label">بند الموازنة</div>
                            <div class="rdv-chip-val">${r.budget_category || '—'}</div>
                        </div>
                        <div class="rdv-chip">
                            <div class="rdv-chip-label">مركز التكلفة</div>
                            <div class="rdv-chip-val">${r.cost_center || '—'}</div>
                        </div>
                    </div>

                    <!-- الأصناف / الطلب -->
                    <div class="rdv-card">
                        <div class="rdv-card-head">📦 بيانات الطلب</div>
                        ${itemsHtml || `
                            <div class="rdv-row"><span>الوصف</span>
                                <span style="white-space:pre-line;color:var(--text-secondary)">${r.items_description || '—'}</span></div>
                            <div class="rdv-row"><span>الكمية</span>
                                <strong>${r.quantity || '—'} ${r.unit || ''}</strong></div>
                        `}
                    </div>

                    <!-- التوجيه -->
                    <div class="rdv-card rdv-dispatch-card">
                        <div class="rdv-card-head" style="color:#818cf8">🔀 التوجيه</div>
                        ${hasDispatch ? `
                            <div class="rdv-dispatch-badge"
                                 style="background:${dtColor}18;color:${dtColor};border:1px solid ${dtColor}30">
                                ${dtLabels[r.dispatch_type] || r.dispatch_type}
                            </div>
                            <div class="rdv-row"><span>الموظف</span><strong>${r.dispatch_employee_name || '—'}</strong></div>
                            ${r.routed_to ? `<div class="rdv-row"><span>الجهة</span><strong>${r.routed_to}</strong></div>` : ''}
                            <div class="rdv-row"><span>الحالة</span><strong>${r.dispatch_status || '—'}</strong></div>
                            ${r.dispatched_at ? `<div class="rdv-row"><span>التاريخ</span>
                                <strong>${r.dispatched_at.slice(0, 10)}</strong></div>` : ''}
                            ${isPaused ? `
                                <div class="rdv-paused-bar">
                                    <span>⏸ OLA معلّق — بانتظار عودة أمر الشراء</span>
                                    ${(currentUser?.role === 'dispatch' || currentUser?.role === 'admin') ? `
                                    <button onclick="closeModal();openResumeDispatchModal(${r.transaction_id})"
                                            class="rdv-resume-btn">▶ استئناف للدفع</button>` : ''}
                                </div>` : ''}
                            ${r.dispatch_notes ? `<div class="rdv-row" style="margin-top:.35rem">
                                <span>ملاحظات</span>
                                <span style="color:var(--text-muted);font-size:.8rem">${r.dispatch_notes}</span>
                            </div>` : ''}
                        ` : `
                            <div class="rdv-dispatch-empty">
                                <span style="font-size:1.8rem;opacity:.3">🔀</span>
                                <span>${r.transaction_number ? 'لم يتم التوجيه بعد' : 'لا توجد معاملة مرتبطة'}</span>
                            </div>`}
                    </div>

                    <!-- سجل الأحداث -->
                    <div class="rdv-card">
                        <div class="rdv-card-head">📜 سجل الأحداث</div>
                        <div class="rdv-log-list">${logHtml}</div>
                    </div>
                </div>
            </div>

            <!-- أزرار -->
            <div class="rdv-footer">
                <button class="btn btn-secondary" onclick="closeModal()">إغلاق</button>
                ${canDo('reservation.review') && r.status === 'قيد المراجعة'
                ? `<button class="btn btn-primary" onclick="closeModal();openReviewModal(${r.id})">
                           ✓ مراجعة الحجز
                       </button>`
                : ''}
            </div>
        </div>`;

    } catch (e) {
        DOM.modalBody.innerHTML = '<p style="color:var(--accent-red);padding:2rem;text-align:center">خطأ في تحميل البيانات</p>';
    }
}

// ── نموذج مراجعة موظف الموازنة ──────────────────────────────
function openReviewModal(id) {
    const { transactions } = BudgetState.meta;
    const reservation = BudgetState.reservations.find(r => r.id === id);
    const reservationNumber = reservation?.reservation_number || '';

    DOM.modalTitle.textContent = '✅ مراجعة الحجز';
    DOM.modalBody.innerHTML = `
        <div class="res-review-wrap">
            <p style="color:var(--text-muted);margin-bottom:1.25rem;font-size:.88rem">
                قم بمراجعة الحجز وتحديد حالته وربطه بالمعاملة المالية المناسبة إذا وُجدت.
            </p>
            <div class="res-form-grid">
                <div class="res-form-group full">
                    <label>ربط بمعاملة مالية</label>
                    <select class="form-select" id="rev_transaction_id">
                        <option value="">-- بدون ربط --</option>
                        ${transactions.map(t =>
        `<option value="${t.id}">${t.transaction_number} — ${parseFloat(t.amount).toLocaleString('ar-SA')} ريال
                             ${t.budget_status ? `(${t.budget_status})` : ''}</option>`
    ).join('')}
                    </select>
                </div>
                <div class="res-form-group">
                    <label>رمز الموازنة <span class="req">*</span></label>
                    <input type="text" class="form-input" id="rev_budget_code"
                        value="${reservationNumber}" placeholder="BUD-2026-XXXX">
                </div>
                <div class="res-form-group">
                    <label>الحالة الجديدة <span class="req">*</span></label>
                    <select class="form-select" id="rev_status">
                        <option value="معتمد">✅ معتمد</option>
                        <option value="مرفوض">❌ مرفوض</option>
                        <option value="قيد المراجعة">🔍 إعادة للمراجعة</option>
                    </select>
                </div>
                <div class="res-form-group full" id="rev_rejection_wrap" style="display:none">
                    <label>سبب الرفض <span class="req">*</span></label>
                    <textarea class="form-textarea" id="rev_rejection_reason" rows="2"
                        placeholder="اذكر سبب الرفض بوضوح"></textarea>
                </div>
                <div class="res-form-group full">
                    <label>ملاحظات الموازنة</label>
                    <textarea class="form-textarea" id="rev_budget_notes" rows="2"
                        placeholder="ملاحظات إضافية…"></textarea>
                </div>
            </div>
            <div class="res-form-nav">
                <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
                <button class="btn btn-primary" onclick="submitReview(${id})">حفظ المراجعة</button>
            </div>
        </div>`;

    document.getElementById('rev_status').addEventListener('change', function () {
        document.getElementById('rev_rejection_wrap').style.display =
            this.value === 'مرفوض' ? 'block' : 'none';
    });
    document.querySelector('.modal')?.classList.add('budget-modal-wide');
    openModal();
}

async function submitReview(id) {
    const status = document.getElementById('rev_status').value;
    const txId = document.getElementById('rev_transaction_id').value;
    const code = document.getElementById('rev_budget_code').value.trim();
    const notes = document.getElementById('rev_budget_notes').value.trim();
    const rejReason = document.getElementById('rev_rejection_reason')?.value.trim();

    if (!code) { showToast('⚠️ أدخل رمز الموازنة', 'warning'); return; }
    if (status === 'مرفوض' && !rejReason) { showToast('⚠️ أدخل سبب الرفض', 'warning'); return; }

    try {
        const res = await fetch('api/budget.php?action=review', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id, status, budget_code: code,
                budget_notes: notes, transaction_id: txId,
                rejection_reason: rejReason,
            }),
        });
        const data = await res.json();
        if (data.success) {
            showToast(`✅ تم تحديث الحجز — ${status}`, 'success');
            closeModal();
            await fetchReservations();
            await fetchBudgetMeta();
            renderBudgetPage();
        } else {
            showToast('❌ ' + (data.error || 'خطأ'), 'error');
        }
    } catch (e) {
        showToast('❌ خطأ في الاتصال', 'error');
    }
}

// ── دوال حساب الإجمالي (توافق مع النماذج القديمة) ──────────
function calcReservationTotal() {
    const qty = parseFloat(document.getElementById('rf_quantity')?.value || 0);
    const price = parseFloat(document.getElementById('rf_unit_price')?.value || 0);
    const total = qty * price;
    const totEl = document.getElementById('rf_total_amount');
    if (totEl) totEl.value = total.toFixed(2);
    calcVAT();
}

function calcVAT() {
    const total = parseFloat(document.getElementById('rf_total_amount')?.value || 0);
    const vat = total * 0.15;
    const grand = total + vat;
    const vatEl = document.getElementById('rf_vat_amount');
    const dispEl = document.getElementById('rf_grand_total_display');
    if (vatEl) vatEl.value = vat.toFixed(2);
    if (dispEl) dispEl.textContent = grand.toLocaleString('ar-SA', { minimumFractionDigits: 2 }) + ' ريال';
    _budgetFormData['rf_grand_total'] = grand.toFixed(2);
    _budgetFormData['rf_vat_amount'] = vat.toFixed(2);
}

function getLogActionLabel(action) {
    return {
        create: 'إنشاء الحجز',
        review: 'مراجعة الموازنة',
        approve: 'اعتماد',
        reject: 'رفض',
        link_transaction: 'ربط بمعاملة',
        update: 'تعديل',
    }[action] || action;
}

// ═══════════════════════════════════════════════════════════════
//  CSS
// ═══════════════════════════════════════════════════════════════
function injectBudgetStyles() {
    if (document.getElementById('budget-styles')) return;
    const s = document.createElement('style');
    s.id = 'budget-styles';
    s.textContent = `
    /* ── الصفحة ─────────────────────────────────── */
    .budget-page-wrap   { padding:.25rem 0; display:flex; flex-direction:column; gap:1.25rem; }
    .budget-page-header { display:flex; align-items:flex-end; justify-content:space-between; }
    .budget-page-title  { font-size:1.3rem; font-weight:700; color:var(--text-primary); margin:0; }
    .budget-page-sub    { color:var(--text-muted); font-size:.82rem; margin:.2rem 0 0; }

    /* ── توسيع المودل لشاشة الحجوزات ───────────── */
    .budget-modal-wide { max-width: 860px !important; width: 92% !important; }

    /* ── الإحصائيات ─────────────────────────────── */
    .budget-stats-row { display:grid; grid-template-columns:repeat(4,1fr) 1.5fr; gap:.75rem; }
    .budget-stat-card { background:var(--bg-card); border:1px solid var(--border-color);
                        border-radius:12px; padding:.85rem 1rem; display:flex; align-items:center; gap:.85rem; }
    .bsc-icon { width:40px; height:40px; border-radius:10px; display:flex; align-items:center;
                justify-content:center; font-size:1.1rem; flex-shrink:0; }
    .bsc-num  { font-size:1.4rem; font-weight:700; color:var(--text-primary); line-height:1; }
    .bsc-label{ font-size:.75rem; color:var(--text-muted); margin-top:.2rem; }

    /* ── الفلاتر ────────────────────────────────── */
    .budget-filters-bar { display:flex; gap:.625rem; align-items:center; flex-wrap:wrap; }
    .budget-filters-bar .filter-input { flex:1; min-width:200px; }

    /* ── الجدول ─────────────────────────────────── */
    .budget-table-wrap { background:var(--bg-card); border:1px solid var(--border-color);
                         border-radius:12px; overflow:hidden; }
    .budget-table { width:100%; border-collapse:collapse; }
    .budget-table thead th { padding:.75rem 1rem; text-align:right; font-size:.78rem;
                              font-weight:600; color:var(--text-muted);
                              background:var(--bg-surface); border-bottom:1px solid var(--border-color); }
    .res-row { cursor:pointer; transition:background .15s; }
    .res-row:hover { background:var(--bg-surface); }
    .res-row td { padding:.75rem 1rem; border-bottom:1px solid var(--border-color);
                  font-size:.83rem; vertical-align:middle; }
    .res-num     { font-weight:700; font-size:.88rem; color:var(--text-primary); font-family:monospace; }
    .res-date    { font-size:.74rem; color:var(--text-muted); margin-top:.15rem; }
    .res-purpose { font-weight:500; color:var(--text-primary); }
    .res-dept    { font-size:.74rem; color:var(--text-muted); }
    .res-amount  { font-weight:600; color:var(--text-primary); text-align:left; direction:ltr; }
    .res-status-badge { display:inline-flex; align-items:center; gap:.3rem; padding:.3rem .7rem;
                        border-radius:6px; font-size:.76rem; font-weight:600; white-space:nowrap; }
    .res-status-badge.lg { font-size:.88rem; padding:.4rem .9rem; }
    .res-tx-badge { background:rgba(99,102,241,.12); color:#6366f1; padding:.2rem .55rem;
                    border-radius:5px; font-size:.74rem; font-family:monospace; font-weight:600; }
    .res-tx-badge.unlinked { background:var(--bg-surface); color:var(--text-muted); }
    .budget-empty { text-align:center; padding:3rem; color:var(--text-muted); }
    .budget-empty h3 { margin:.75rem 0 .25rem; color:var(--text-secondary); }

    /* ── نموذج الإدخال — خطوات ─────────────────── */
    .res-form-wrap  { display:flex; flex-direction:column; gap:1.25rem; }
    .res-form-body  { display:flex; flex-direction:column; gap:1rem; }
    .res-steps-bar  { display:flex; align-items:center; gap:0; }
    .res-step { display:flex; align-items:center; gap:.5rem; }
    .res-step-circle { width:28px; height:28px; border-radius:50%; display:flex; align-items:center;
                       justify-content:center; font-size:.78rem; font-weight:700;
                       background:var(--bg-surface); color:var(--text-muted);
                       border:2px solid var(--border-color); transition:all .2s; flex-shrink:0; }
    .res-step.active .res-step-circle { background:var(--btn-primary-bg); color:var(--btn-primary-text);
                                        border-color:var(--btn-primary-bg); }
    .res-step.done  .res-step-circle  { background:var(--accent-green); color:#fff;
                                        border-color:var(--accent-green); }
    .res-step-label { font-size:.78rem; color:var(--text-muted); white-space:nowrap; }
    .res-step.active .res-step-label  { color:var(--text-primary); font-weight:600; }
    .res-step-line  { flex:1; height:2px; background:var(--border-color); margin:0 .5rem; min-width:20px; }
    .res-form-grid  { display:grid; grid-template-columns:1fr 1fr; gap:.85rem; }
    .res-form-group { display:flex; flex-direction:column; gap:.35rem; }
    .res-form-group.full { grid-column:span 2; }
    .res-form-group label { font-size:.82rem; font-weight:600; color:var(--text-secondary); }
    .req { color:var(--accent-red); }
    .res-grand-total { background:var(--btn-primary-bg); color:var(--btn-primary-text);
                       padding:.85rem 1.25rem; border-radius:10px; font-size:1.15rem;
                       font-weight:700; text-align:center; }
    .res-form-nav { display:flex; justify-content:space-between; padding-top:.5rem;
                    border-top:1px solid var(--border-color); }

    /* ── جدول الأصناف (multi-item) ──────────────── */
    .rf-items-wrap   { display:flex; flex-direction:column; gap:.4rem; }
    .rf-items-header { display:flex; align-items:center; gap:.5rem; padding:.4rem .6rem;
                       background:var(--bg-surface); border-radius:8px; direction:rtl;
                       font-size:.74rem; font-weight:700; color:var(--text-muted); }
    .rf-item-row     { display:flex; align-items:center; gap:.5rem; padding:.3rem 0;
                       border-bottom:1px solid var(--border-color); direction:rtl; }
    .rf-item-row .form-input,
    .rf-item-row .form-select { padding:.42rem .6rem; font-size:.82rem; height:36px; }
    .rf-del-row { width:26px; height:26px; flex-shrink:0; border:none; background:transparent;
                  cursor:pointer; color:var(--accent-red); font-size:.95rem; border-radius:4px;
                  display:flex; align-items:center; justify-content:center; opacity:.5; transition:.15s; }
    .rf-del-row:hover { opacity:1; background:rgba(239,68,68,.1); }

    /* VAT toggle */
    .rf-vat-toggle  { position:relative; display:inline-block; width:36px; height:20px; cursor:pointer; }
    .rf-vat-toggle input { opacity:0; width:0; height:0; position:absolute; }
    .rf-vat-slider  { position:absolute; inset:0; background:#cbd5e1; border-radius:20px; transition:.2s; }
    .rf-vat-slider::before { content:''; position:absolute; width:14px; height:14px;
                              left:3px; top:3px; background:#fff; border-radius:50%; transition:.2s; }
    .rf-vat-toggle input:checked + .rf-vat-slider { background:var(--accent-green); }
    .rf-vat-toggle input:checked + .rf-vat-slider::before { transform:translateX(16px); }

    /* Add row button */
    .rf-add-row-btn { display:flex; align-items:center; gap:.5rem; justify-content:center;
                      width:100%; padding:.5rem; border:1.5px dashed var(--border-color);
                      border-radius:8px; background:transparent; color:var(--text-muted);
                      cursor:pointer; font-size:.82rem; font-family:inherit; transition:.15s; margin-top:.2rem; }
    .rf-add-row-btn:hover { border-color:var(--btn-primary-bg); color:var(--btn-primary-bg);
                            background:rgba(99,102,241,.04); }

    /* Totals box */
    .rf-totals-box  { background:var(--bg-surface); border-radius:10px; padding:.7rem 1rem;
                      display:flex; flex-direction:column; gap:.35rem; }
    .rf-total-row   { display:flex; justify-content:space-between; font-size:.82rem;
                      color:var(--text-secondary); }
    .rf-total-row.grand { font-weight:700; font-size:.95rem; color:var(--accent-green);
                          border-top:1px solid var(--border-color); padding-top:.35rem; margin-top:.15rem; }

    /* ══ تفاصيل الحجز (rdv) ════════════════════════ */
    .rdv-wrap { display:flex; flex-direction:column; gap:1.1rem; }

    /* رأس */
    .rdv-hero { display:flex; align-items:flex-start; justify-content:space-between;
                background:linear-gradient(135deg,var(--bg-surface),var(--bg-card));
                border:1px solid var(--border-color); border-radius:14px; padding:1.1rem 1.25rem; gap:1rem; }
    .rdv-hero-left  { display:flex; flex-direction:column; gap:.4rem; }
    .rdv-hero-right { display:flex; flex-direction:column; align-items:flex-end; gap:.5rem; flex-shrink:0; }
    .rdv-num        { font-size:1.6rem; font-weight:800; font-family:monospace; color:var(--text-primary); }
    .rdv-hero-meta  { display:flex; flex-wrap:wrap; gap:.5rem; }
    .rdv-hero-meta span { font-size:.76rem; color:var(--text-muted); background:var(--bg-card);
                          border:1px solid var(--border-color); padding:.2rem .55rem; border-radius:20px; }
    .rdv-status-pill   { display:inline-flex; align-items:center; gap:.35rem;
                         padding:.4rem 1rem; border-radius:20px; font-size:.82rem; font-weight:700; }
    .rdv-priority-pill { display:inline-flex; align-items:center; gap:.3rem;
                         padding:.3rem .75rem; border-radius:20px; font-size:.76rem; font-weight:600; }

    /* شريط المبلغ */
    .rdv-amount-banner { background:linear-gradient(135deg,#1e293b,#0f172a); border-radius:14px; padding:1rem 1.5rem; }
    .rdv-amount-parts  { display:flex; align-items:center; justify-content:center; gap:1.5rem; flex-wrap:wrap; }
    .rdv-amount-part   { display:flex; flex-direction:column; align-items:center; gap:.2rem; }
    .rdv-amount-part.grand { border-right:1px solid rgba(255,255,255,.1); padding-right:1.5rem; margin-right:.5rem; }
    .rdv-amount-label  { font-size:.7rem; color:rgba(255,255,255,.5); letter-spacing:.5px; }
    .rdv-amount-val    { font-size:1rem; font-weight:700; color:rgba(255,255,255,.85); font-family:monospace; direction:ltr; }
    .rdv-amount-val.grand { font-size:1.35rem; color:#34d399; }
    .rdv-amount-sep    { font-size:1.2rem; color:rgba(255,255,255,.25); }

    /* عمودان */
    .rdv-cols { display:grid; grid-template-columns:1fr 1fr; gap:.85rem; align-items:start; }
    .rdv-col  { display:flex; flex-direction:column; gap:.85rem; }

    /* البطاقات */
    .rdv-card { background:var(--bg-card); border:1px solid var(--border-color); border-radius:12px; padding:.85rem 1rem; }
    .rdv-card-head  { font-size:.76rem; font-weight:700; color:var(--text-muted); text-transform:uppercase;
                      letter-spacing:.4px; padding-bottom:.5rem; margin-bottom:.5rem;
                      border-bottom:1px solid var(--border-color); }
    .rdv-card-icon  { font-size:1.2rem; flex-shrink:0; }
    .rdv-card-label { font-size:.7rem; color:var(--text-muted); margin-bottom:.15rem; }
    .rdv-purpose-card { display:flex; gap:.7rem; align-items:flex-start;
                        background:rgba(99,102,241,.05); border-color:rgba(99,102,241,.2); }
    .rdv-purpose-text { font-size:.9rem; color:var(--text-primary); font-weight:600; line-height:1.4; }
    .rdv-row { display:flex; justify-content:space-between; align-items:baseline;
               gap:.5rem; padding:.3rem 0; border-bottom:1px solid var(--border-color); font-size:.81rem; }
    .rdv-row:last-child { border-bottom:none; }
    .rdv-row span:first-child { color:var(--text-muted); flex-shrink:0; }
    .rdv-row strong { color:var(--text-primary); text-align:left; }
    .rdv-rejection  { display:flex; gap:.5rem; align-items:flex-start; margin-top:.5rem;
                      background:rgba(239,68,68,.07); border:1px solid rgba(239,68,68,.2);
                      border-radius:8px; padding:.5rem .7rem; font-size:.8rem; color:#ef4444; }
    .rdv-info-chips { display:flex; gap:.6rem; }
    .rdv-chip       { flex:1; background:var(--bg-surface); border:1px solid var(--border-color);
                      border-radius:10px; padding:.6rem .8rem; }
    .rdv-chip-label { font-size:.7rem; color:var(--text-muted); margin-bottom:.2rem; }
    .rdv-chip-val   { font-size:.82rem; font-weight:600; color:var(--text-primary); }

    /* جدول الأصناف في التفاصيل */
    .rdv-items-table { display:flex; flex-direction:column; }
    .rdv-items-head  { display:flex; gap:.5rem; padding:.3rem .4rem;
                       background:var(--bg-surface); border-radius:6px; margin-bottom:.25rem;
                       font-size:.7rem; font-weight:700; color:var(--text-muted); direction:rtl; }
    .rdv-items-row   { display:flex; gap:.5rem; padding:.35rem .4rem; direction:rtl;
                       border-bottom:1px solid var(--border-color); font-size:.8rem; }
    .rdv-items-row:last-child { border-bottom:none; }

    /* التوجيه */
    .rdv-dispatch-card  { border-color:rgba(129,140,248,.2) !important; background:rgba(129,140,248,.03) !important; }
    .rdv-dispatch-badge { display:inline-block; padding:.3rem .85rem; border-radius:20px;
                          font-size:.78rem; font-weight:700; margin-bottom:.6rem; }
    .rdv-dispatch-empty { display:flex; flex-direction:column; align-items:center;
                          gap:.4rem; padding:.75rem 0; color:var(--text-muted); font-size:.82rem; }
    .rdv-paused-bar { display:flex; justify-content:space-between; align-items:center; gap:.5rem;
                      margin-top:.5rem; background:rgba(234,179,8,.08); border:1px solid rgba(234,179,8,.25);
                      border-radius:8px; padding:.45rem .65rem; font-size:.78rem; color:#b45309; flex-wrap:wrap; }
    .rdv-resume-btn { background:#818cf8; color:#fff; border:none; border-radius:6px;
                      padding:.25rem .65rem; font-size:.74rem; cursor:pointer;
                      font-family:inherit; white-space:nowrap; }

    /* سجل الأحداث */
    .rdv-log-list   { display:flex; flex-direction:column; gap:.75rem; max-height:220px;
                      overflow-y:auto; padding-right:.25rem; }
    .rdv-log-list::-webkit-scrollbar { width:3px; }
    .rdv-log-list::-webkit-scrollbar-thumb { background:var(--border-color); border-radius:3px; }
    .rdv-log-item   { display:flex; gap:.65rem; align-items:flex-start; }
    .rdv-log-dot    { width:8px; height:8px; border-radius:50%; flex-shrink:0; margin-top:.35rem; }
    .rdv-log-body   { flex:1; }
    .rdv-log-action { font-size:.82rem; font-weight:600; color:var(--text-primary); }
    .rdv-log-status { font-size:.75rem; font-weight:500; margin-right:.4rem; }
    .rdv-log-meta   { display:flex; gap:.75rem; font-size:.72rem; color:var(--text-muted); margin-top:.15rem; }
    .rdv-log-notes  { font-size:.76rem; color:var(--text-secondary); margin-top:.2rem;
                      background:var(--bg-surface); padding:.3rem .5rem; border-radius:5px; }

    /* أزرار التذييل */
    .rdv-footer { display:flex; justify-content:flex-start; gap:.625rem;
                  padding-top:.75rem; border-top:1px solid var(--border-color); }

    /* مراجعة الموازنة */
    .res-review-wrap .res-form-grid { gap:.85rem; }
    .res-details-footer { display:flex; justify-content:flex-start; gap:.625rem;
                          padding-top:.75rem; border-top:1px solid var(--border-color); }

    /* ── Responsive ─────────────────────────────── */
    @media (max-width:1100px) {
        .rdv-cols { grid-template-columns:1fr 1fr; }
    }
    @media (max-width:750px) {
        .rdv-cols            { grid-template-columns:1fr; }
        .rdv-amount-parts    { gap:1rem; }
        .rdv-amount-part.grand { border:none; padding:0; margin:0; }
        .rdv-info-chips      { flex-direction:column; }
    }
    @media (max-width:700px) {
        .budget-stats-row    { grid-template-columns:1fr 1fr; }
        .res-form-grid       { grid-template-columns:1fr; }
        .res-form-group.full { grid-column:span 1; }
        .rf-items-header     { display:none; }
        .rf-item-row         { flex-wrap:wrap; }
    }
    `;
    document.head.appendChild(s);

    // إزالة budget-modal-wide تلقائياً عند إغلاق المودل
    const _modalEl = document.querySelector('.modal-overlay');
    if (_modalEl && !_modalEl._budgetObserver) {
        _modalEl._budgetObserver = new MutationObserver(() => {
            if (!_modalEl.classList.contains('active')) {
                document.querySelector('.modal')?.classList.remove('budget-modal-wide');
            }
        });
        _modalEl._budgetObserver.observe(_modalEl, { attributes: true, attributeFilter: ['class'] });
    }
}