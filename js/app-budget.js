/**
 * app-budget.js — شاشة الحجوزات المالية
 * ════════════════════════════════════════════════════════════
 */

// ── حالة الشاشة ────────────────────────────────────────────
const BudgetState = {
    reservations: [],
    meta: { departments: [], suppliers: [], transactions: [], cost_centers: [], budget_categories: [] },
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

// ── مساعد العملة ─────────────────────────────────────────────
const CURRENCY_MAP = {
    SAR: { symbol: 'ر.س', name: 'ريال سعودي' },
    USD: { symbol: '$', name: 'دولار أمريكي' },
    EUR: { symbol: '€', name: 'يورو' },
    GBP: { symbol: '£', name: 'جنيه إسترليني' },
    AED: { symbol: 'د.إ', name: 'درهم إماراتي' },
    KWD: { symbol: 'د.ك', name: 'دينار كويتي' },
    QAR: { symbol: 'ر.ق', name: 'ريال قطري' },
};

// العملة النشطة في فورم الحجز الحالي
let _rfCurrency = 'SAR';

function getCurrencySymbol(code) {
    return (CURRENCY_MAP[code] || CURRENCY_MAP.SAR).symbol;
}

function fmtMoneyCur(amount, currencyCode) {
    const sym = getCurrencySymbol(currencyCode || _rfCurrency || 'SAR');
    const num = (parseFloat(amount) || 0).toLocaleString('en-US',
        { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return num + ' ' + sym;
}

// ── ثوابت نموذج الحجز ───────────────────────────────────────
const BUDGET_CATEGORIES = [
    'رأس المال', 'تشغيلي', 'صيانة وإصلاح', 'تقنية معلومات',
    'تدريب وتطوير', 'خدمات استشارية', 'مستلزمات مكتبية',
    'أثاث ومعدات', 'سيارات ومركبات', 'إنشاءات وبنية تحتية',
];
const COST_CENTERS = [
    { id: '102200001', name: 'الإدارة العامة' },
    { id: '102200002', name: 'التخطيط والميزانية' },
    { id: '102200003', name: 'الموارد البشرية' },
    { id: '102200004', name: 'تقنية المعلومات' },
    { id: '102200005', name: 'المشتريات' },
    { id: '102200006', name: 'المالية والحسابات' },
    { id: '102200007', name: 'الشؤون الإدارية' },
    { id: '102200008', name: 'التدريب والتطوير' },
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
        if (data.success) {
            BudgetState.meta = data.data;
            // تحديث اسم قسم المستخدم الحالي إن لم يكن محدداً بعد
            if (typeof currentUser !== 'undefined' && currentUser.departmentId && !currentUser.departmentName) {
                const dept = (data.data.departments || []).find(d => d.id == currentUser.departmentId);
                if (dept) currentUser.departmentName = dept.name;
            }
        }
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
                    <div class="bsc-num">${formatMoney(totalAmt)}</div>
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

    // بانر القسم — يظهر للموظف العادي فقط (غير المدير)
    const isAdmin = (typeof currentUser !== 'undefined') &&
        (currentUser.permissionLevel === 'system_admin' ||
            currentUser.role === 'admin' ||
            currentUser.role === 'budget');
    const deptName = (typeof currentUser !== 'undefined') ? currentUser.departmentName : '';
    const showDeptBanner = !canDo('reservation.view_all') && deptName;

    const deptBannerHtml = showDeptBanner ? `
        <div class="budget-dept-banner">
            <div class="budget-dept-banner-icon">🏢</div>
            <div class="budget-dept-banner-content">
                <span class="budget-dept-banner-label">أنت تعرض حجوزات قسم</span>
                <span class="budget-dept-banner-name">${deptName}</span>
            </div>
        </div>` : '';

    DOM.mainContent.innerHTML = `
        <div class="budget-page-wrap">
            <div class="budget-page-header">
                <div>
                    <h2 class="budget-page-title">📑 شاشة الحجوزات</h2>
                    <p class="budget-page-sub">إدارة حجوزات الموازنة المالية لكافة الأقسام</p>
                </div>
            </div>
            ${deptBannerHtml}
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
        const amt = fmtMoneyCur(parseFloat(r.grand_total || 0), r.currency);
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
                    <div>${fmtMoneyCur(parseFloat(r.grand_total || 0), r.currency)}</div>
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
    _rfCurrency = 'SAR'; // إعادة تعيين العملة عند فتح فورم جديد
    _rfItems = Array.from({ length: 5 }, () => ({
        description: '', qty: 1, unit: 'قطعة', price: 0,
    }));
    DOM.modalTitle.textContent = '📋 حجز جديد';
    DOM.modalBody.innerHTML = renderReservationForm();
    document.querySelector('.modal')?.classList.add('budget-modal-wide');
    openModal();
}

function renderReservationForm(step = BudgetState.currentStep) {
    const { departments, suppliers, cost_centers, budget_categories } = BudgetState.meta;
    const today = new Date().toISOString().split('T')[0];

    // fallback للثوابت المحلية لو لم تُحمَّل البيانات بعد
    const ccList = cost_centers?.length ? cost_centers : COST_CENTERS.map(c => ({ code: c.id, name: c.name }));
    const catList = budget_categories?.length ? budget_categories : BUDGET_CATEGORIES.map(n => ({ name: n }));

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
        const savedCC = _budgetFormData['rf_cost_center'] || '';
        const savedDept = savedCC ? (COST_CENTERS.find(c => c.id === savedCC)?.name || '') : '';
        formBody = `
            <div class="res-form-grid">
                <div class="res-form-group">
                    <label>مركز التكلفة <span class="req">*</span></label>
                    ${searchableSelect({
            id: 'rf_cost_center',
            placeholder: 'ابحث بالرقم أو الاسم...',
            value: savedCC,
            options: [{ value: '', label: '-- اختر مركز التكلفة --' },
            ...ccList.map(c => ({ value: c.code, label: `${c.code} — ${c.name}` }))]
        })}
                </div>
                <div class="res-form-group">
                    <label>القسم الطالب</label>
                    <div class="dept-auto-field" id="rf_department_display">
                        ${savedDept
                ? `<span class="dept-auto-value">${savedDept}</span>`
                : `<span class="dept-auto-placeholder">يتعبّأ تلقائياً عند اختيار مركز التكلفة</span>`}
                    </div>
                    <input type="hidden" id="rf_department_id" value="${_budgetFormData['rf_department_id'] || ''}">
                    <input type="hidden" id="rf_department_name" value="${savedDept}">
                </div>
                <div class="res-form-group">
                    <label>بند الموازنة</label>
                    ${searchableSelect({
                    id: 'rf_budget_category',
                    placeholder: 'ابحث عن البند...',
                    value: _budgetFormData['rf_budget_category'] || '',
                    options: [{ value: '', label: '-- اختر البند --' },
                    ...catList.map(c => ({ value: c.name, label: c.code ? `${c.code} — ${c.name}` : c.name }))]
                })}
                </div>
                      <div class="res-form-group">
                    <label>الأولوية</label>
                    ${searchableSelect({
                    id: 'rf_priority',
                    placeholder: 'اختر الأولوية',
                    value: _budgetFormData['rf_priority'] || 'عادي',
                    options: [
                        { value: 'عادي', label: 'عادي' },
                        { value: 'عاجل', label: 'عاجل ⚡' },
                        { value: 'حرج', label: 'حرج 🔴' },
                    ]
                })}
                </div>
                <div class="res-form-group full">
                    <label>الغرض من الشراء <span class="req">*</span></label>
                    <input type="text" class="form-input" id="rf_purpose"
                        placeholder="مثال: شراء أجهزة حاسوب لقسم تقنية المعلومات"
                        value="${(_budgetFormData['rf_purpose'] || '').replace(/"/g, '&quot;')}">
                </div>
                <div class="res-form-group">
                    <label>تاريخ الطلب <span class="req">*</span></label>
                    <input type="date" class="form-input" id="rf_request_date" value="${_budgetFormData['rf_request_date'] || today}">
                </div>
          
            </div>`;
    }

    // ── الخطوة 2: بيانات المورد ─────────────────────────────
    if (step === 2) {
        formBody = `
            <div class="res-form-grid">
                <div class="res-form-group full">
                    <label>المورد</label>
                    ${searchableSelect({
            id: 'rf_supplier_id',
            placeholder: 'ابحث عن المورد...',
            value: _budgetFormData['rf_supplier_id'] || '',
            options: [
                { value: '', label: '-- اختر من القائمة أو أدخل يدوياً --' },
                ...suppliers.map(s => ({ value: String(s.id), label: `${s.name} (${s.cr_number || '—'})` })),
                { value: 'manual', label: '➕ مورد غير موجود في القائمة' },
            ]
        })}
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
                <select class="form-select" id="rf_currency" style="max-width:220px"
                    onchange="_onCurrencyChange(this.value)">
                    <option value="SAR">ريال سعودي (SAR) ر.س</option>
                    <option value="USD">دولار أمريكي (USD) $</option>
                    <option value="EUR">يورو (EUR) €</option>
                    <option value="GBP">جنيه إسترليني (GBP) £</option>
                    <option value="AED">درهم إماراتي (AED) د.إ</option>
                    <option value="KWD">دينار كويتي (KWD) د.ك</option>
                    <option value="QAR">ريال قطري (QAR) ر.ق</option>
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
            <div class="rf-item-line-total" id="rf_line_${i}"
                 style="flex:1;min-width:80px;font-weight:600;font-size:.84rem;
                        color:var(--accent-blue);text-align:center;direction:ltr">
                ${fmtMoneyCur(calcLineTotal(item), _rfCurrency)}
            </div>
            <button class="rf-del-row" onclick="removeItemRow(${i})" title="حذف الصف">✕</button>
        </div>`;
}

function calcLineTotal(item) {
    return ((item.qty || 0) * (item.price || 0)).toFixed(2);
}

function renderTotalsBox() {
    let total = 0;
    _rfItems.forEach(it => { total += (it.qty || 0) * (it.price || 0); });
    const sym = getCurrencySymbol(_rfCurrency);
    return `<div class="rf-total-row grand">
        <span>الإجمالي الكلي</span>
        <span>${fmtMoneyCur(total, _rfCurrency)} <span class="rf-cur-badge">${_rfCurrency}</span></span>
    </div>`;
}

function _onCurrencyChange(val) {
    _rfCurrency = val;
    // تحديث رمز العملة في كل الأرقام
    refreshTotals();
    // تحديث الشارة في العنوان
    document.querySelectorAll('.rf-currency-live').forEach(el => {
        el.textContent = getCurrencySymbol(val) + ' ' + val;
    });
}

function updateItem(i, field, value) {
    if (_rfItems[i]) _rfItems[i][field] = value;
}

function refreshTotals() {
    _rfItems.forEach((it, i) => {
        const el = document.getElementById(`rf_line_${i}`);
        if (el) el.textContent = fmtMoneyCur(calcLineTotal(it), _rfCurrency);
    });
    const box = document.getElementById('rf_totals_box');
    if (box) box.innerHTML = renderTotalsBox();
}

function addItemRow() {
    _rfItems.push({ description: '', qty: 1, unit: 'قطعة', price: 0 });
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
        'rf_purpose', 'rf_department_id', 'rf_department_name', 'rf_request_date', 'rf_priority',
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
        if (!el) return;
        el.value = val;
        // للـ ss-wrap: حدّث العرض المرئي
        const wrap = el.closest?.('.ss-wrap') || el.parentElement?.querySelector('.ss-wrap[data-id="' + id + '"]');
        if (!wrap) {
            // حقل عادي
        } else {
            const opt = wrap.querySelector(`.ss-option[data-value="${CSS.escape(val)}"]`);
            if (opt) {
                wrap.querySelector('.ss-display').innerHTML = opt.textContent;
                wrap.querySelectorAll('.ss-option').forEach(o => o.classList.toggle('selected', o === opt));
            }
        }
    });
    // استعادة ss-wrap الصحيحة بطريقة مباشرة
    document.querySelectorAll('.ss-wrap').forEach(wrap => {
        const id = wrap.dataset.id;
        const val = _budgetFormData[id];
        if (val === undefined) return;
        const hidden = wrap.querySelector(`#${id}`);
        if (hidden) hidden.value = val;
        const opt = wrap.querySelector(`.ss-option[data-value="${val}"]`);
        if (opt) {
            wrap.querySelector('.ss-display').innerHTML = opt.textContent;
            wrap.querySelectorAll('.ss-option').forEach(o => o.classList.toggle('selected', o === opt));
        }
    });
    if (_budgetFormData['rf_supplier_id'] === 'manual') {
        const wrap = document.getElementById('rf_manual_supplier_wrap');
        if (wrap) wrap.style.display = 'block';
    }
    // ربط change event للمورد
    const suppEl = document.getElementById('rf_supplier_id');
    if (suppEl) suppEl.addEventListener('change', () => onSupplierChange(suppEl));
    refreshTotals();
}

function validateBudgetStep(step) {
    if (step === 1) {
        const purpose = document.getElementById('rf_purpose')?.value.trim();
        const cc = document.getElementById('rf_cost_center')?.value;
        if (!cc) { showToast('⚠️ اختر مركز التكلفة', 'warning'); return false; }
        if (!purpose) { showToast('⚠️ أدخل الغرض من الشراء', 'warning'); return false; }
    }
    if (step === 3) {
        const hasDesc = _rfItems.some(it => it.description.trim());
        if (!hasDesc) { showToast('⚠️ أدخل وصف صنف واحد على الأقل', 'warning'); return false; }
    }
    saveBudgetFormData();
    return true;
}

function onSupplierChange(el) {
    // يُستدعى من dispatchEvent('change') على hidden input
    const val = el?.value ?? document.getElementById('rf_supplier_id')?.value ?? '';
    const wrap = document.getElementById('rf_manual_supplier_wrap');
    if (wrap) wrap.style.display = (val === 'manual') ? 'block' : 'none';
}

function onCostCenterChange(val) {
    const ccList = BudgetState.meta.cost_centers?.length
        ? BudgetState.meta.cost_centers
        : COST_CENTERS.map(c => ({ code: c.id, name: c.name }));
    const cc = ccList.find(c => c.code === val);
    const display = document.getElementById('rf_department_display');
    const hiddenId = document.getElementById('rf_department_id');
    const hiddenNm = document.getElementById('rf_department_name');
    if (!display) return;
    if (cc) {
        display.innerHTML = `<span class="dept-auto-value">${cc.name}</span>`;
        if (hiddenId) hiddenId.value = cc.code;
        if (hiddenNm) hiddenNm.value = cc.name;
        _budgetFormData['rf_department_id'] = cc.code;
        _budgetFormData['rf_department_name'] = cc.name;
    } else {
        display.innerHTML = `<span class="dept-auto-placeholder">يتعبّأ تلقائياً عند اختيار مركز التكلفة</span>`;
        if (hiddenId) hiddenId.value = '';
        if (hiddenNm) hiddenNm.value = '';
        _budgetFormData['rf_department_id'] = '';
        _budgetFormData['rf_department_name'] = '';
    }
}

// ── إرسال الحجز ─────────────────────────────────────────────
async function submitReservation() {
    if (!validateBudgetStep(3)) return;
    saveBudgetFormData();

    const activeItems = _rfItems.filter(it => it.description.trim());
    let total = 0;
    activeItems.forEach(it => { total += (it.qty || 0) * (it.price || 0); });

    const suppId = _budgetFormData['rf_supplier_id'];
    const body = {
        purpose: _budgetFormData['rf_purpose'],
        request_date: _budgetFormData['rf_request_date'],
        priority: _budgetFormData['rf_priority'],
        budget_category: _budgetFormData['rf_budget_category'],
        cost_center: _budgetFormData['rf_cost_center'],
        cost_center_name: _budgetFormData['rf_department_name'],
        supplier_id: suppId !== 'manual' ? suppId : '',
        supplier_name_manual: suppId === 'manual' ? _budgetFormData['rf_supplier_name_manual'] : '',
        quotation_number: _budgetFormData['rf_quotation_number'],
        quotation_date: _budgetFormData['rf_quotation_date'],
        currency: _budgetFormData['rf_currency'] || _rfCurrency || 'SAR',
        items: activeItems,
        items_description: activeItems.map(it => `${it.description} (${it.qty} ${it.unit})`).join('\n'),
        quantity: activeItems.reduce((s, it) => s + (it.qty || 0), 0),
        unit: 'متعدد',
        unit_price: activeItems[0]?.price || 0,
        total_amount: total.toFixed(2),
        vat_amount: '0.00',
        grand_total: total.toFixed(2),
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

        const prioMap = {
            'عادي': { color: '#64748b', bg: '#f1f5f9', icon: '○', label: 'عادي' },
            'عاجل': { color: '#d97706', bg: '#fffbeb', icon: '⚡', label: 'عاجل' },
            'حرج': { color: '#ef4444', bg: '#fef2f2', icon: '●', label: 'حرج' },
        };
        const prio = prioMap[r.priority] || prioMap['عادي'];

        // ── أصناف الطلب ────────────────────────────────────
        // r.items يأتي كـ array من budget_reservation_items
        let rawItems = null;
        if (Array.isArray(r.items) && r.items.length) {
            rawItems = r.items;
        } else if (r.items_json) {
            // fallback: items_json
            try { rawItems = JSON.parse(r.items_json); } catch { rawItems = null; }
        }
        // fallback أخير: items_description نص
        if (!rawItems || !rawItems.length) {
            const descText = (r.items_description || '').trim();
            if (descText) {
                rawItems = descText.split(/\n/).map((line, i) => {
                    const m = line.match(/^(.+?)\s*\((\d+(?:\.\d+)?)\s*(.*)\)\s*$/);
                    if (m) return { description: m[1].trim(), qty: parseFloat(m[2]), unit: m[3].trim(), unit_price: 0, line_total: 0 };
                    return line.trim() ? { description: line.trim(), qty: 1, unit: '', unit_price: 0, line_total: 0 } : null;
                }).filter(Boolean);
            }
        }

        let itemsRows = '';
        let grandTotalFromItems = 0;
        if (rawItems && rawItems.length) {
            itemsRows = rawItems.map((it, idx) => {
                const price = parseFloat(it.unit_price || it.price) || 0;
                const qty = parseFloat(it.qty) || 0;
                const lineTotal = parseFloat(it.line_total) || (price * qty);
                grandTotalFromItems += lineTotal;
                return `
                <tr class="rv-item-row">
                    <td class="rv-item-num">${idx + 1}</td>
                    <td class="rv-item-desc">${it.description || '—'}</td>
                    <td class="rv-item-qty">${qty > 0 ? qty : '—'}</td>
                    <td class="rv-item-unit">${it.unit || '—'}</td>
                    <td class="rv-item-price">${price > 0 ? fmtMoneyCur(price, r.currency) : '—'}</td>
                    <td class="rv-item-total">${lineTotal > 0 ? fmtMoneyCur(lineTotal, r.currency) : '—'}</td>
                </tr>`;
            }).join('');
        } else {
            // لا يوجد بيانات كافية
            itemsRows = `<tr class="rv-item-row">
                <td class="rv-item-num">1</td>
                <td class="rv-item-desc" colspan="4">${r.items_description || r.purpose || '—'}</td>
                <td class="rv-item-total">${fmtMoneyCur(parseFloat(r.grand_total || 0), r.currency)}</td>
            </tr>`;
        }

        // ── سجل الأحداث ────────────────────────────────────
        const logColors = {
            create: '#3b82f6', review: '#f59e0b',
            approve: '#10b981', reject: '#ef4444',
        };
        const logHtml = log.length
            ? log.map(l => `
                <div class="rdv2-log-row">
                    <div class="rdv2-log-dot" style="background:${logColors[l.action] || '#94a3b8'}"></div>
                    <div class="rdv2-log-body">
                        <span class="rdv2-log-act">${getLogActionLabel(l.action)}</span>
                        ${l.new_status ? `<span class="rdv2-log-st" style="color:${logColors[l.action] || '#94a3b8'}">${l.new_status}</span>` : ''}
                        <span class="rdv2-log-who">· ${l.employee_name || '—'}</span>
                        <span class="rdv2-log-when">${(l.created_at || '').slice(0, 16).replace('T', ' ')}</span>
                        ${l.notes ? `<div class="rdv2-log-note">${l.notes}</div>` : ''}
                    </div>
                </div>`).join('')
            : '<p style="color:#94a3b8;font-size:.8rem;margin:0">لا يوجد سجل أحداث</p>';

        // ── التوجيه ────────────────────────────────────────
        const dtLabels = {
            'to_payment': 'دفع مباشر',
            'to_purchase_order': 'أمر شراء / تعميد',
            'to_requester': 'إعادة لجهة طالبة',
        };
        const dtColors = {
            'to_payment': '#10b981',
            'to_purchase_order': '#f59e0b',
            'to_requester': '#8b5cf6',
        };
        const hasDispatch = !!r.dispatch_type;
        const isPaused = r.dispatch_ola_active == 0;
        const dtColor = dtColors[r.dispatch_type] || '#64748b';

        DOM.modalTitle.textContent = `حجز #${r.reservation_number}`;
        DOM.modalBody.innerHTML = `
        <div class="rdv2-shell" id="rdv2_printable">

            <!-- ══ شريط الأدوات ══ -->
            <div class="rdv2-toolbar no-print">
                <div class="rdv2-toolbar-left">
                    <button class="rdv2-tool-btn rdv2-print-btn" onclick="printReservation()">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                            <rect x="6" y="14" width="12" height="8"/>
                        </svg>
                        طباعة
                    </button>
                    <button class="rdv2-tool-btn rdv2-pdf-btn" onclick="downloadReservationPDF(${r.id})">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/>
                            <polyline points="9 15 12 18 15 15"/>
                        </svg>
                        تنزيل PDF
                    </button>
                </div>
                <div class="rdv2-toolbar-right">
                    ${canDo('reservation.review') && r.status === 'قيد المراجعة'
                ? `<button class="rdv2-tool-btn rdv2-review-btn" onclick="closeModal();openReviewModal(${r.id})">
                               ✓ مراجعة الحجز
                           </button>` : ''}
                    <button class="rdv2-tool-btn" onclick="closeModal()">إغلاق</button>
                </div>
            </div>

            <!-- ══ وثيقة الحجز ══ -->
            <div class="rdv2-doc">

                <!-- رأس الوثيقة -->
                <div class="rdv2-doc-header">
                    <div class="rdv2-doc-logo">
                        <div class="rdv2-logo-icon">⚡</div>
                        <div>
                            <div class="rdv2-org-name">نظام إدارة المعاملات المالية</div>
                            <div class="rdv2-org-sub">وثيقة حجز ميزانية رسمية</div>
                        </div>
                    </div>
                    <div class="rdv2-doc-id-block">
                        <div class="rdv2-doc-num">${r.reservation_number}</div>
                        <div class="rdv2-doc-date">📅 ${r.request_date}</div>
                        <div class="rdv2-doc-badges">
                            <span class="rdv2-status-badge" style="background:${st.bg};color:${st.color};border:1.5px solid ${st.color}40">
                                ${st.icon} ${r.status}
                            </span>
                            <span class="rdv2-prio-badge" style="background:${prio.bg};color:${prio.color}">
                                ${prio.icon} ${prio.label}
                            </span>
                        </div>
                    </div>
                </div>

                <div class="rdv2-divider"></div>

                <!-- معلومات أساسية -->
                <div class="rdv2-info-grid">
                    <div class="rdv2-info-cell">
                        <div class="rdv2-info-lbl">مقدم الطلب</div>
                        <div class="rdv2-info-val">${r.requested_by_name || '—'}</div>
                    </div>
                    <div class="rdv2-info-cell">
                        <div class="rdv2-info-lbl">القسم / الجهة الطالبة</div>
                        <div class="rdv2-info-val">${r.department_name || '—'}</div>
                    </div>
                    <div class="rdv2-info-cell">
                        <div class="rdv2-info-lbl">مركز التكلفة</div>
                        <div class="rdv2-info-val rdv2-mono">${r.cost_center || '—'}</div>
                    </div>
                    <div class="rdv2-info-cell">
                        <div class="rdv2-info-lbl">بند الموازنة</div>
                        <div class="rdv2-info-val">${r.budget_category || '—'}</div>
                    </div>
                    <div class="rdv2-info-cell rdv2-span2">
                        <div class="rdv2-info-lbl">الغرض من الشراء</div>
                        <div class="rdv2-info-val rdv2-purpose">${r.purpose || '—'}</div>
                    </div>
                </div>

                <div class="rdv2-divider"></div>

                <!-- جدول الأصناف -->
                <div class="rdv2-section-title">📦 الأصناف والبنود</div>
                <table class="rdv2-items-tbl">
                    <thead>
                        <tr>
                            <th style="width:40px">#</th>
                            <th>الوصف / الصنف</th>
                            <th style="width:70px;text-align:center">الكمية</th>
                            <th style="width:80px;text-align:center">الوحدة</th>
                            <th style="width:110px;text-align:left">سعر الوحدة</th>
                            <th style="width:120px;text-align:left">الإجمالي</th>
                        </tr>
                    </thead>
                    <tbody>${itemsRows}</tbody>
                    <tfoot>
                        <tr>
                            <td colspan="5" style="text-align:right;font-weight:700;padding:.65rem 1rem;color:#1e293b">الإجمالي الكلي</td>
                            <td style="text-align:left;direction:ltr;font-family:monospace;font-size:1.05rem;font-weight:800;color:#1e40af;padding:.65rem 1rem">
                                ${fmtMoneyCur(parseFloat(r.grand_total || 0), r.currency)}
                                <span class="rv-cur-badge">${r.currency || 'SAR'}</span>
                            </td>
                        </tr>
                    </tfoot>
                </table>

                <!-- المورد + الموازنة في صفين -->
                <div class="rdv2-lower-grid">

                    <!-- المورد -->
                    <div class="rdv2-panel">
                        <div class="rdv2-panel-head">🏢 بيانات المورد</div>
                        <div class="rdv2-panel-rows">
                            <div class="rdv2-prow"><span>المورد</span><strong>${r.supplier_name || '—'}</strong></div>
                            ${r.quotation_number ? `<div class="rdv2-prow"><span>رقم عرض السعر</span><strong>${r.quotation_number}</strong></div>` : ''}
                            ${r.quotation_date ? `<div class="rdv2-prow"><span>تاريخ العرض</span><strong>${r.quotation_date}</strong></div>` : ''}
                            ${r.currency ? `<div class="rdv2-prow"><span>العملة</span><strong>${r.currency}</strong></div>` : ''}
                        </div>
                    </div>

                    <!-- الموازنة -->
                    <div class="rdv2-panel">
                        <div class="rdv2-panel-head">⚖️ مرحلة الموازنة</div>
                        <div class="rdv2-panel-rows">
                            <div class="rdv2-prow"><span>موظف الموازنة</span><strong>${r.budget_employee_name || '—'}</strong></div>
                            ${r.budget_code ? `<div class="rdv2-prow"><span>رمز الموازنة</span>
                                <strong class="rdv2-mono" style="color:#1e40af">${r.budget_code}</strong></div>` : ''}
                            ${r.budget_review_date ? `<div class="rdv2-prow"><span>تاريخ المراجعة</span>
                                <strong>${(r.budget_review_date || '').slice(0, 10)}</strong></div>` : ''}
                            <div class="rdv2-prow"><span>معاملة مرتبطة</span>
                                ${r.transaction_number
                ? `<span class="rdv2-tx-tag">${r.transaction_number}</span>`
                : '<span style="color:#94a3b8">—</span>'}</div>
                            ${r.budget_notes ? `<div class="rdv2-prow rdv2-prow-full"><span>ملاحظات</span>
                                <span style="color:#475569;font-size:.8rem">${r.budget_notes}</span></div>` : ''}
                            ${r.rejection_reason ? `
                                <div class="rdv2-rejection-bar">⛔ ${r.rejection_reason}</div>` : ''}
                        </div>
                    </div>

                    <!-- التوجيه -->
                    <div class="rdv2-panel ${hasDispatch ? 'rdv2-panel-dispatch' : ''}">
                        <div class="rdv2-panel-head" style="color:#818cf8">🔀 التوجيه</div>
                        ${hasDispatch ? `
                        <div class="rdv2-panel-rows">
                            <div class="rdv2-dispatch-badge-lg" style="background:${dtColor}15;color:${dtColor};border:1.5px solid ${dtColor}30">
                                ${dtLabels[r.dispatch_type] || r.dispatch_type}
                            </div>
                            <div class="rdv2-prow"><span>الموظف المسؤول</span><strong>${r.dispatch_employee_name || '—'}</strong></div>
                            ${r.routed_to ? `<div class="rdv2-prow"><span>الجهة</span><strong>${r.routed_to}</strong></div>` : ''}
                            <div class="rdv2-prow"><span>الحالة</span><strong>${r.dispatch_status || '—'}</strong></div>
                            ${r.dispatched_at ? `<div class="rdv2-prow"><span>تاريخ التوجيه</span>
                                <strong>${r.dispatched_at.slice(0, 10)}</strong></div>` : ''}
                            ${isPaused ? `<div class="rdv2-paused-bar no-print">
                                ⏸ OLA معلّق — بانتظار عودة أمر الشراء
                                ${(currentUser?.role === 'dispatch' || currentUser?.role === 'admin') ? `
                                <button onclick="closeModal();openResumeDispatchModal(${r.transaction_id})" class="rdv2-resume-btn">▶ استئناف</button>` : ''}
                            </div>` : ''}
                            ${r.dispatch_notes ? `<div class="rdv2-prow"><span>ملاحظات</span>
                                <span style="color:#64748b;font-size:.8rem">${r.dispatch_notes}</span></div>` : ''}
                        </div>` : `
                        <div class="rdv2-dispatch-empty">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".2">
                                <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                                <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                            </svg>
                            <span>${r.transaction_number ? 'لم يتم التوجيه بعد' : 'لا توجد معاملة مرتبطة'}</span>
                        </div>`}
                    </div>

                    <!-- سجل الأحداث -->
                    <div class="rdv2-panel rdv2-log-panel">
                        <div class="rdv2-panel-head">📜 سجل الأحداث</div>
                        <div class="rdv2-log-scroll">${logHtml}</div>
                    </div>
                </div>

                <!-- تذييل الوثيقة -->
                <div class="rdv2-doc-footer print-only">
                    <span>تم إصدار هذه الوثيقة من نظام إدارة المعاملات المالية</span>
                    <span>تاريخ الطباعة: ${new Date().toLocaleDateString('ar-SA')}</span>
                </div>

            </div><!-- /rdv2-doc -->
        </div><!-- /rdv2-shell -->`;

    } catch (e) {
        DOM.modalBody.innerHTML = '<p style="color:var(--accent-red);padding:2rem;text-align:center">خطأ في تحميل البيانات</p>';
    }
}

// ── طباعة الحجز ─────────────────────────────────────────────
function printReservation() {
    const content = document.getElementById('rdv2_printable');
    if (!content) return;
    const win = window.open('', '_blank', 'width=900,height=700');
    win.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head>
        <meta charset="utf-8"><title>وثيقة حجز ميزانية</title>
        <style>
            @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&display=swap');
            * { box-sizing:border-box; margin:0; padding:0; }
            body { font-family:'IBM Plex Sans Arabic',sans-serif; color:#1e293b; background:#fff; }
            .rdv2-toolbar,.no-print { display:none !important; }
            ${getRdv2PrintCSS()}
        </style></head><body>
        ${content.innerHTML}
        <script>
            window.onload = function() {
                setTimeout(function(){ window.print(); }, 800);
            };
        <\/script>
        </body></html>`);
    win.document.close();
}

// ── تنزيل PDF ───────────────────────────────────────────────
async function downloadReservationPDF(id) {
    const btn = document.querySelector('.rdv2-pdf-btn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ جاري التحضير...'; }
    try {
        const content = document.getElementById('rdv2_printable');
        if (!content) return;
        const win = window.open('', '_blank', 'width=900,height=700');
        win.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head>
            <meta charset="utf-8"><title>حجز ميزانية</title>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&display=swap');
                * { box-sizing:border-box; margin:0; padding:0; }
                body { font-family:'IBM Plex Sans Arabic',sans-serif; color:#1e293b; background:#fff; }
                .rdv2-toolbar,.no-print { display:none !important; }
                ${getRdv2PrintCSS()}
            </style></head><body>
            ${content.innerHTML}
            <script>
                window.onload = function() {
                    setTimeout(function(){ window.print(); setTimeout(function(){ window.close(); }, 1500); }, 800);
                };
            <\/script>
            </body></html>`);
        win.document.close();
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 18 15 15"/></svg> تنزيل PDF'; }
    }
}

function getRdv2PrintCSS() {
    return `
        @page {
            size: A4 portrait;
            margin: 7mm 8mm;
        }
        * { box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
        html, body { margin:0; padding:0; background:#fff; }
        body { font-size:10.5px; font-family:'IBM Plex Sans Arabic',sans-serif; color:#1e293b; }

        /* الهيكل العام */
        .rdv2-shell { width:100%; }
        .rdv2-doc   { background:#fff; border:none; box-shadow:none; border-radius:0; }

        /* رأس الوثيقة */
        .rdv2-doc-header {
            display:flex; justify-content:space-between; align-items:center;
            padding:.5rem .8rem;
            background:linear-gradient(135deg,#1e3a5f,#1e40af) !important;
            color:#fff;
        }
        .rdv2-doc-logo  { display:flex; align-items:center; gap:.4rem; }
        .rdv2-logo-icon { font-size:1rem; width:28px; height:28px; background:rgba(255,255,255,.2);
            border-radius:6px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
        .rdv2-org-name  { font-size:.78rem; font-weight:700; }
        .rdv2-org-sub   { font-size:.58rem; opacity:.7; margin-top:.05rem; }
        .rdv2-doc-id-block { display:flex; flex-direction:column; align-items:flex-start; gap:.12rem; }
        .rdv2-doc-num   { font-size:.95rem; font-weight:800; font-family:monospace; letter-spacing:.5px; }
        .rdv2-doc-date  { font-size:.6rem; opacity:.8; }
        .rdv2-doc-badges { display:flex; gap:.3rem; }
        .rdv2-status-badge,.rdv2-prio-badge {
            font-size:.6rem; font-weight:700; padding:.08rem .4rem;
            border-radius:20px; display:inline-flex; align-items:center; gap:.2rem; background:#fff;
        }

        /* فاصل ومعلومات أساسية */
        .rdv2-divider   { height:1px; background:#e2e8f0; margin:.25rem 0; }
        .rdv2-info-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:.3rem; padding:.3rem 0; }
        .rdv2-span2     { grid-column:span 2; }
        .rdv2-info-cell { background:#f8fafc; border:1px solid #e2e8f0; border-radius:4px; padding:.28rem .45rem; }
        .rdv2-info-lbl  { font-size:.56rem; color:#64748b; font-weight:700;
            text-transform:uppercase; letter-spacing:.3px; margin-bottom:.08rem; }
        .rdv2-info-val  { font-size:.72rem; font-weight:600; color:#1e293b; line-height:1.3; }
        .rdv2-info-val.rdv2-purpose { font-weight:500; font-size:.68rem; line-height:1.4; }
        .rdv2-mono      { font-family:monospace; }

        /* عنوان القسم */
        .rdv2-section-title {
            font-size:.6rem; font-weight:700; color:#64748b; text-transform:uppercase;
            letter-spacing:.4px; display:flex; align-items:center; gap:.25rem;
            padding:.1rem 0 .18rem; margin-top:.2rem;
        }

        /* شارة العملة */
        .rv-cur-badge, .rf-cur-badge {
            display:inline-block;
            font-size:.62rem; font-weight:800;
            padding:.1rem .38rem; border-radius:4px;
            margin-right:.3rem;
            background:rgba(30,64,175,.1); color:#1e40af;
            border:1px solid rgba(30,64,175,.2);
            font-family:sans-serif; letter-spacing:.03em;
            vertical-align:middle;
        }

        /* جدول الأصناف */
        .rdv2-items-tbl { width:100%; border-collapse:collapse; font-size:.82rem; }
        .rdv2-items-tbl thead tr { background:#1e3a8a !important; color:#fff !important; }
        .rdv2-items-tbl thead th {
            padding:.5rem .7rem; font-weight:700; font-size:.76rem;
            text-align:right; white-space:nowrap;
        }
        .rdv2-items-tbl tbody tr { border-bottom:1px solid #e2e8f0; }
        .rdv2-items-tbl tbody tr:nth-child(even) { background:#f8fafc !important; }
        .rdv2-items-tbl tbody tr:hover { background:#eff6ff !important; }
        .rdv2-items-tbl tbody td {
            padding:.55rem .7rem; color:#1e293b; vertical-align:middle;
        }
        /* أعمدة محددة */
        .rv-item-num   { text-align:center; color:#94a3b8; font-size:.75rem; width:32px; }
        .rv-item-desc  { font-weight:500; min-width:160px; }
        .rv-item-qty   { text-align:center; color:#475569; width:55px; }
        .rv-item-unit  { text-align:center; color:#64748b; font-size:.78rem; width:55px; }
        .rv-item-price { text-align:left; direction:ltr; font-family:monospace; color:#475569; width:80px; }
        .rv-item-total {
            text-align:left; direction:ltr; font-family:monospace;
            font-weight:700; color:#1d4ed8; width:90px;
        }
        .rdv2-items-tbl tfoot tr { background:#dbeafe !important; }
        .rdv2-items-tbl tfoot td {
            border-top:2px solid #93c5fd; padding:.45rem .7rem;
            font-size:.82rem; font-weight:800;
        }

        /* الشبكة السفلية */
        .rdv2-lower-grid { display:grid; grid-template-columns:1fr 1fr; gap:.35rem; margin-top:.4rem; }
        .rdv2-panel { background:#f8fafc !important; border:1px solid #e2e8f0; border-radius:5px; padding:.35rem .5rem; }
        .rdv2-panel-dispatch { border-color:#c4b5fd !important; background:#faf5ff !important; }
        .rdv2-panel-head {
            font-size:.58rem; font-weight:700; color:#64748b; text-transform:uppercase;
            letter-spacing:.4px; margin-bottom:.25rem; padding-bottom:.18rem; border-bottom:1px solid #e2e8f0;
        }
        .rdv2-panel-rows { display:flex; flex-direction:column; gap:.12rem; }
        .rdv2-prow {
            display:flex; justify-content:space-between; align-items:baseline;
            font-size:.67rem; padding:.08rem 0; border-bottom:1px dashed #e2e8f0; gap:.25rem;
        }
        .rdv2-prow:last-child { border-bottom:none; }
        .rdv2-prow span:first-child { color:#64748b; flex-shrink:0; }
        .rdv2-prow strong { color:#1e293b; text-align:left; }
        .rdv2-prow-full { flex-direction:column; gap:.08rem; }
        .rdv2-tx-tag {
            background:#dbeafe !important; color:#1e40af; font-size:.62rem;
            font-weight:700; padding:.06rem .35rem; border-radius:3px; font-family:monospace;
        }
        .rdv2-rejection-bar {
            background:#fef2f2 !important; color:#ef4444; font-size:.63rem;
            padding:.15rem .4rem; border-radius:3px; border:1px solid #fecaca; margin-top:.15rem;
        }
        .rdv2-dispatch-badge-lg {
            font-size:.67rem; font-weight:600; padding:.15rem .5rem;
            border-radius:5px; display:inline-block; margin-bottom:.2rem;
        }
        .rdv2-dispatch-empty {
            display:flex; flex-direction:column; align-items:center;
            justify-content:center; gap:.25rem; color:#94a3b8; font-size:.67rem;
            padding:.5rem; text-align:center;
        }
        .rdv2-paused-bar { display:none; }

        /* سجل الأحداث */
        .rdv2-log-panel  { grid-column:span 2; }
        .rdv2-log-scroll { max-height:none; overflow:visible; display:flex; flex-direction:column; gap:.25rem; }
        .rdv2-log-row    { display:flex; gap:.35rem; align-items:flex-start; }
        .rdv2-log-dot    { width:6px; height:6px; border-radius:50%; flex-shrink:0; margin-top:.25rem; }
        .rdv2-log-body   { flex:1; font-size:.63rem; }
        .rdv2-log-act    { font-weight:600; color:#1e293b; }
        .rdv2-log-st     { font-size:.6rem; font-weight:500; margin-right:.15rem; }
        .rdv2-log-who    { color:#64748b; margin-right:.15rem; }
        .rdv2-log-when   { color:#94a3b8; font-size:.6rem; }
        .rdv2-log-note   {
            color:#475569; font-size:.6rem; margin-top:.06rem;
            background:#f1f5f9 !important; padding:.08rem .3rem; border-radius:3px;
        }

        /* التذييل */
        .rdv2-doc-footer {
            display:flex !important; justify-content:space-between;
            font-size:.58rem; color:#94a3b8; margin-top:.4rem;
            padding-top:.25rem; border-top:1px solid #e2e8f0;
        }
        .no-print { display:none !important; }
    `;
}

// ── نموذج مراجعة موظف الموازنة ──────────────────────────────
function openReviewModal(id) {
    const { transactions } = BudgetState.meta;
    const reservation = BudgetState.reservations.find(r => r.id === id);
    const reservationNumber = reservation?.reservation_number || '';

    // رمز الموازنة يُولَّد تلقائياً = رقم الحجز
    const autoCode = reservationNumber;

    DOM.modalTitle.textContent = '✅ مراجعة الحجز';
    DOM.modalBody.innerHTML = `
        <div class="res-review-wrap">
            <p style="color:var(--text-muted);margin-bottom:1.25rem;font-size:.88rem">
                قم بمراجعة الحجز وتحديد حالته وربطه بالمعاملة المالية المناسبة إذا وُجدت.
            </p>
            <div class="res-form-grid">
                <div class="res-form-group full">
                    <label>ربط بمعاملة مالية</label>
                    <select class="form-select" id="rev_transaction_id" onchange="updateBudgetCode('${reservationNumber}', this.value)">
                        <option value="">-- بدون ربط --</option>
                        ${transactions.map(t =>
        `<option value="${t.id}" data-num="${t.transaction_number}">${t.transaction_number} — ${formatMoney(parseFloat(t.amount))}
                             ${t.budget_status ? `(${t.budget_status})` : ''}</option>`
    ).join('')}
                    </select>
                </div>
                <div class="res-form-group">
                    <label>رمز الموازنة</label>
                    <div class="rev-code-display" id="rev_budget_code_display">${autoCode}</div>
                    <input type="hidden" id="rev_budget_code" value="${autoCode}">
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

// ── تحديث رمز الموازنة تلقائياً عند اختيار المعاملة ────────
function updateBudgetCode(reservationNumber, txSelectEl) {
    const display = document.getElementById('rev_budget_code_display');
    const hidden = document.getElementById('rev_budget_code');
    if (!display || !hidden) return;

    // رمز الموازنة = رقم الحجز دائماً (ثابت بغض النظر عن المعاملة)
    display.textContent = reservationNumber;
    hidden.value = reservationNumber;
}

async function submitReview(id) {
    const status = document.getElementById('rev_status').value;
    const txId = document.getElementById('rev_transaction_id').value;
    const code = document.getElementById('rev_budget_code').value.trim();
    const notes = document.getElementById('rev_budget_notes').value.trim();
    const rejReason = document.getElementById('rev_rejection_reason')?.value.trim();

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
    _budgetFormData['rf_grand_total'] = total.toFixed(2);
    _budgetFormData['rf_vat_amount'] = '0.00';
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
// ══════════════════════════════════════════════════════════════
//  مكوّن القائمة المنسدلة مع البحث (Searchable Select)
//  الاستخدام: searchableSelect({ id, options:[{value,label}], placeholder, value })
//  يُنتج HTML ويُشغَّل بـ initSearchableSelects() بعد إدراجه في DOM
// ══════════════════════════════════════════════════════════════

function searchableSelect({ id, options = [], placeholder = 'ابحث أو اختر...', value = '' }) {
    const opts = options.map(o =>
        `<div class="ss-option ${o.value === value ? 'selected' : ''}" data-value="${o.value}">${o.label}</div>`
    ).join('');
    const selectedLabel = options.find(o => o.value === value)?.label || '';
    return `
    <div class="ss-wrap" data-id="${id}" data-value="${value}">
        <input type="hidden" id="${id}" value="${value}">
        <div class="ss-trigger" onclick="toggleSS(this)">
            <span class="ss-display">${selectedLabel || `<span class="ss-ph">${placeholder}</span>`}</span>
            <svg class="ss-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="6 9 12 15 18 9"/>
            </svg>
        </div>
        <div class="ss-dropdown">
            <div class="ss-search-wrap">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input class="ss-search" type="text" placeholder="ابحث..." oninput="filterSS(this)" autocomplete="off">
            </div>
            <div class="ss-options">${opts}</div>
        </div>
    </div>`;
}

function toggleSS(trigger) {
    const wrap = trigger.closest('.ss-wrap');
    const isOpen = wrap.classList.contains('open');
    // أغلق كل القوائم المفتوحة
    document.querySelectorAll('.ss-wrap.open').forEach(w => {
        w.classList.remove('open');
        w.querySelector('.ss-arrow')?.classList.remove('flipped');
    });
    if (!isOpen) {
        wrap.classList.add('open');
        trigger.querySelector('.ss-arrow')?.classList.add('flipped');
        wrap.querySelector('.ss-search')?.focus();
    }
}

function filterSS(input) {
    const q = input.value.trim().toLowerCase();
    input.closest('.ss-dropdown').querySelectorAll('.ss-option').forEach(opt => {
        opt.style.display = opt.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
}

function selectSSOption(opt) {
    const wrap = opt.closest('.ss-wrap');
    const id = wrap.dataset.id;
    const val = opt.dataset.value;
    const lbl = opt.textContent;

    // تحديث الحالة
    wrap.dataset.value = val;
    wrap.querySelector(`#${id}`).value = val;
    wrap.querySelector('.ss-display').innerHTML = lbl;
    wrap.querySelectorAll('.ss-option').forEach(o => o.classList.toggle('selected', o === opt));

    // إغلاق القائمة
    wrap.classList.remove('open');
    wrap.querySelector('.ss-arrow')?.classList.remove('flipped');
    wrap.querySelector('.ss-search').value = '';
    filterSS(wrap.querySelector('.ss-search'));

    // تفعيل أي callback مرتبط
    const hidden = wrap.querySelector(`#${id}`);
    hidden.dispatchEvent(new Event('change', { bubbles: true }));

    // callbacks مخصصة حسب الحقل
    if (id === 'rf_cost_center') onCostCenterChange(val);
    if (id === 'rf_supplier_id') onSupplierChange(hidden);
}

// تفعيل delegate listener مرة واحدة على الـ document
if (!window._ssListenerAttached) {
    document.addEventListener('click', e => {
        const opt = e.target.closest('.ss-option');
        if (opt) { selectSSOption(opt); return; }
        // إغلاق عند الضغط خارج
        if (!e.target.closest('.ss-wrap')) {
            document.querySelectorAll('.ss-wrap.open').forEach(w => {
                w.classList.remove('open');
                w.querySelector('.ss-arrow')?.classList.remove('flipped');
            });
        }
    });
    window._ssListenerAttached = true;
}

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

    /* ── بانر القسم ──────────────────────────────── */
    .budget-dept-banner {
        display:flex; align-items:center; gap:.85rem;
        background: linear-gradient(135deg, rgba(99,102,241,.1), rgba(139,92,246,.08));
        border: 1px solid rgba(99,102,241,.25);
        border-radius: 14px; padding: .85rem 1.2rem;
        backdrop-filter: blur(4px);
    }
    .budget-dept-banner-icon {
        font-size: 1.6rem; width: 44px; height: 44px;
        border-radius: 12px;
        background: rgba(99,102,241,.15);
        display:flex; align-items:center; justify-content:center;
        flex-shrink:0;
    }
    .budget-dept-banner-content { display:flex; flex-direction:column; gap:.18rem; }
    .budget-dept-banner-label { font-size:.77rem; color:var(--text-muted); font-weight:500; }
    .budget-dept-banner-name {
        font-size:1.05rem; font-weight:700;
        background: linear-gradient(135deg, #6366f1, #8b5cf6);
        -webkit-background-clip: text; -webkit-text-fill-color: transparent;
        background-clip: text;
    }

    /* ── حقل القسم التلقائي ─────────────────────────────── */
    .dept-auto-field {
        display:flex; align-items:center;
        min-height:42px; padding:.55rem .85rem;
        border-radius:10px;
        border:1px dashed var(--border-color);
        background:var(--bg-surface);
        transition:all .2s;
    }
    .dept-auto-value {
        font-size:.85rem; font-weight:600;
        color:var(--accent-blue);
        display:flex; align-items:center; gap:.4rem;
    }
    .dept-auto-value::before {
        content:'🏢'; font-size:.8rem;
    }
    .dept-auto-placeholder {
        font-size:.78rem; color:var(--text-muted);
        font-style:italic;
    }

    /* ── Searchable Select ───────────────────────────────── */
    .ss-wrap { position:relative; width:100%; }
    .ss-trigger {
        display:flex; align-items:center; justify-content:space-between;
        padding:.55rem .85rem; border-radius:10px;
        border:1px solid var(--border-color);
        background:var(--bg-card);
        cursor:pointer; min-height:42px;
        transition:border-color .15s, box-shadow .15s;
        user-select:none;
    }
    .ss-wrap.open .ss-trigger,
    .ss-trigger:hover { border-color:var(--accent-blue); }
    .ss-wrap.open .ss-trigger { box-shadow:0 0 0 3px rgba(99,102,241,.15); }
    .ss-display { font-size:.85rem; color:var(--text-primary); flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .ss-ph { color:var(--text-muted); }
    .ss-arrow { color:var(--text-muted); flex-shrink:0; transition:transform .2s; }
    .ss-arrow.flipped { transform:rotate(180deg); }

    .ss-dropdown {
        display:none; position:absolute; top:calc(100% + 4px); right:0; left:0;
        background:var(--bg-card); border:1px solid var(--border-color);
        border-radius:12px; box-shadow:0 8px 32px rgba(0,0,0,.22);
        z-index:9999; overflow:hidden;
        animation:ssDrop .15s ease;
    }
    @keyframes ssDrop { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }
    .ss-wrap.open .ss-dropdown { display:block; }

    .ss-search-wrap {
        display:flex; align-items:center; gap:.5rem;
        padding:.6rem .8rem; border-bottom:1px solid var(--border-color);
        color:var(--text-muted);
    }
    .ss-search {
        flex:1; border:none; background:transparent; outline:none;
        font-size:.82rem; color:var(--text-primary); direction:rtl;
    }
    .ss-search::placeholder { color:var(--text-muted); }

    .ss-options { max-height:220px; overflow-y:auto; padding:.35rem; }
    .ss-options::-webkit-scrollbar { width:4px; }
    .ss-options::-webkit-scrollbar-thumb { background:var(--border-color); border-radius:4px; }

    .ss-option {
        padding:.5rem .75rem; border-radius:8px; font-size:.83rem;
        color:var(--text-primary); cursor:pointer; transition:background .12s;
        white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
    }
    .ss-option:hover { background:rgba(99,102,241,.1); }
    .ss-option.selected {
        background:rgba(99,102,241,.15);
        color:var(--accent-blue); font-weight:600;
    }

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

    /* ══ تفاصيل الحجز — التصميم الجديد (rdv2) ══════════ */
    .rdv2-shell { display:flex; flex-direction:column; gap:0; font-family:inherit; }

    /* شريط الأدوات */
    .rdv2-toolbar { display:flex; justify-content:space-between; align-items:center;
                    padding:.6rem .2rem .8rem; gap:.5rem; flex-wrap:wrap; }
    .rdv2-toolbar-left,.rdv2-toolbar-right { display:flex; gap:.45rem; align-items:center; }
    .rdv2-tool-btn { display:inline-flex; align-items:center; gap:.45rem; padding:.42rem .9rem;
                     border-radius:8px; font-size:.8rem; font-weight:600; cursor:pointer;
                     border:1px solid var(--border-color); background:var(--bg-card);
                     color:var(--text-secondary); font-family:inherit; transition:.15s;
                     white-space:nowrap; }
    .rdv2-tool-btn:hover { border-color:var(--accent-blue); color:var(--accent-blue); background:rgba(99,102,241,.06); }
    .rdv2-print-btn { border-color:#0ea5e9; color:#0ea5e9; }
    .rdv2-print-btn:hover { background:#f0f9ff; }
    .rdv2-pdf-btn   { border-color:#ef4444; color:#ef4444; }
    .rdv2-pdf-btn:hover { background:#fef2f2; }
    .rdv2-review-btn { background:#10b981; border-color:#10b981; color:#fff; }
    .rdv2-review-btn:hover { background:#059669; border-color:#059669; color:#fff; }

    /* الوثيقة */
    .rdv2-doc { background:#fff; border:1px solid #e2e8f0; border-radius:14px; overflow:hidden;
                box-shadow:0 4px 24px rgba(0,0,0,.08); }

    /* رأس الوثيقة */
    .rdv2-doc-header { display:flex; justify-content:space-between; align-items:center;
                       padding:1.1rem 1.4rem; background:linear-gradient(135deg,#1e3a5f,#1e40af);
                       color:#fff; gap:1rem; }
    .rdv2-doc-logo  { display:flex; align-items:center; gap:.7rem; }
    .rdv2-logo-icon { font-size:1.6rem; width:44px; height:44px; background:rgba(255,255,255,.15);
                      border-radius:10px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
    .rdv2-org-name  { font-size:.95rem; font-weight:700; }
    .rdv2-org-sub   { font-size:.68rem; opacity:.65; margin-top:.1rem; }
    .rdv2-doc-id-block { display:flex; flex-direction:column; align-items:flex-start; gap:.3rem; }
    .rdv2-doc-num   { font-size:1.3rem; font-weight:800; font-family:monospace; letter-spacing:1px; }
    .rdv2-doc-date  { font-size:.73rem; opacity:.75; }
    .rdv2-doc-badges { display:flex; gap:.4rem; flex-wrap:wrap; }
    .rdv2-status-badge,.rdv2-prio-badge { font-size:.71rem; font-weight:700; padding:.18rem .6rem;
                        border-radius:20px; display:inline-flex; align-items:center; gap:.3rem; }

    /* قسم المعلومات الأساسية */
    .rdv2-divider   { height:1px; background:#f1f5f9; margin:0 1.25rem; }
    .rdv2-info-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:.6rem; padding:.85rem 1.25rem; }
    .rdv2-span2     { grid-column:span 2; }
    .rdv2-info-cell { background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:.55rem .8rem; }
    .rdv2-info-lbl  { font-size:.65rem; color:#64748b; font-weight:700; text-transform:uppercase;
                      letter-spacing:.5px; margin-bottom:.22rem; }
    .rdv2-info-val  { font-size:.86rem; font-weight:600; color:#1e293b; }
    .rdv2-info-val.rdv2-purpose { font-weight:500; line-height:1.5; font-size:.82rem; }
    .rdv2-mono      { font-family:monospace; }
    .rdv2-section-title { font-size:.7rem; font-weight:700; color:#64748b; text-transform:uppercase;
                          letter-spacing:.6px; display:flex; align-items:center; gap:.4rem;
                          padding:.1rem 1.25rem .4rem; }

    /* جدول الأصناف */
    .rdv2-items-tbl { width:100%; border-collapse:collapse; font-size:.81rem; }
    .rdv2-items-tbl thead tr { background:#1e40af; color:#fff; }
    .rdv2-items-tbl thead th { padding:.55rem 1rem; font-weight:600; font-size:.72rem; text-align:right; }
    .rdv2-items-tbl tbody tr:nth-child(even) { background:#f8fafc; }
    .rdv2-items-tbl tbody tr:hover { background:#eff6ff; transition:.1s; }
    .rdv2-items-tbl tbody td { padding:.5rem 1rem; border-bottom:1px solid #e2e8f0; color:#334155; }
    .rdv2-items-tbl tfoot tr { background:#dbeafe; }
    .rdv2-items-tbl tfoot td { border-top:2px solid #93c5fd; padding:.6rem 1rem; }

    /* الشبكة السفلية */
    .rdv2-lower-grid { display:grid; grid-template-columns:1fr 1fr; gap:.65rem; padding:.85rem 1.25rem 1.25rem; }
    .rdv2-panel { background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:.8rem 1rem; }
    .rdv2-panel-dispatch { border-color:#c4b5fd; background:#faf5ff; }
    .rdv2-panel-head { font-size:.69rem; font-weight:700; color:#64748b; text-transform:uppercase;
                       letter-spacing:.5px; margin-bottom:.55rem; padding-bottom:.4rem; border-bottom:1px solid #e2e8f0; }
    .rdv2-panel-rows { display:flex; flex-direction:column; gap:.3rem; }
    .rdv2-prow { display:flex; justify-content:space-between; align-items:baseline;
                 font-size:.8rem; padding:.2rem 0; border-bottom:1px dashed #e2e8f0; gap:.5rem; }
    .rdv2-prow:last-child { border-bottom:none; }
    .rdv2-prow span:first-child { color:#64748b; flex-shrink:0; }
    .rdv2-prow strong { color:#1e293b; text-align:left; }
    .rdv2-prow-full { flex-direction:column; gap:.15rem; }
    .rdv2-tx-tag { background:#dbeafe; color:#1e40af; font-size:.72rem; font-weight:700;
                   padding:.12rem .55rem; border-radius:5px; font-family:monospace; }
    .rdv2-rejection-bar { background:#fef2f2; color:#ef4444; font-size:.76rem; padding:.35rem .7rem;
                          border-radius:6px; border:1px solid #fecaca; margin-top:.3rem; }
    .rdv2-dispatch-badge-lg { font-size:.8rem; font-weight:600; padding:.3rem .85rem;
                               border-radius:8px; display:inline-block; margin-bottom:.45rem; }
    .rdv2-dispatch-empty { display:flex; flex-direction:column; align-items:center; justify-content:center;
                            gap:.45rem; color:#94a3b8; font-size:.8rem; padding:1.2rem; text-align:center; }
    .rdv2-paused-bar { background:#fffbeb; color:#92400e; font-size:.76rem; padding:.35rem .7rem;
                       border-radius:6px; border:1px solid #fcd34d; display:flex;
                       justify-content:space-between; align-items:center; gap:.4rem; margin-top:.3rem; }
    .rdv2-resume-btn { background:#f59e0b; color:#fff; border:none; border-radius:6px;
                       padding:.22rem .65rem; cursor:pointer; font-size:.72rem; font-family:inherit; }
    .rdv2-log-panel  { grid-column:span 2; }
    .rdv2-log-scroll { max-height:160px; overflow-y:auto; display:flex; flex-direction:column; gap:.5rem; }
    .rdv2-log-scroll::-webkit-scrollbar { width:3px; }
    .rdv2-log-scroll::-webkit-scrollbar-thumb { background:#e2e8f0; border-radius:3px; }
    .rdv2-log-row    { display:flex; gap:.55rem; align-items:flex-start; }
    .rdv2-log-dot    { width:7px; height:7px; border-radius:50%; flex-shrink:0; margin-top:.38rem; }
    .rdv2-log-body   { flex:1; font-size:.78rem; }
    .rdv2-log-act    { font-weight:600; color:#1e293b; }
    .rdv2-log-st     { font-size:.7rem; font-weight:500; margin-right:.3rem; }
    .rdv2-log-who    { color:#64748b; font-size:.75rem; margin-right:.25rem; }
    .rdv2-log-when   { color:#94a3b8; font-size:.7rem; }
    .rdv2-log-note   { color:#475569; font-size:.73rem; margin-top:.12rem;
                       background:#f1f5f9; padding:.18rem .45rem; border-radius:4px; }
    .rdv2-doc-footer { display:none; }
    .print-only { display:none !important; }

    /* مراجعة الموازنة */
    .res-review-wrap .res-form-grid { gap:.85rem; }
    .rev-code-display {
        min-height: 42px; padding: .55rem .85rem;
        background: rgba(30,64,175,.06); border: 1.5px solid rgba(30,64,175,.25);
        border-radius: 8px; font-family: monospace; font-size: .9rem;
        font-weight: 700; color: #1e40af; display: flex; align-items: center;
        letter-spacing: .5px;
    }
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