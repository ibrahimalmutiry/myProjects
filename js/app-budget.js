/**
 * app-budget.js — شاشة الحجوزات المالية والموازنة التقديرية
 * ════════════════════════════════════════════════════════════
 */

// ── حالة الشاشة ────────────────────────────────────────────
const BudgetState = {
    reservations: [],
    meta: { departments: [], suppliers: [], transactions: [], cost_centers: [], budget_categories: [] },
    filter: { status: '', department_id: '', fiscal_year: '', search: '' },
    currentStep: 1,
    loaded: false,
    activeTab: 'reservations', // 'reservations' | 'plans'
};

// ── حالة الـ Pagination للحجوزات ───────────────────────────
const BudgetPagState = {
    page: 1,
    perPage: 25,
    total: 0,
    pages: 0,
};

// ── إحصائيات إجمالية (تأتي من الـ API — لا تتأثر بالصفحة الحالية) ──
const BudgetSummary = {
    total_all: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    total_amount: 0,
    loaded: false,
};


const PlanState = {
    plans: [],
    meta: { categories: [], cost_centers: [], years: [] },
    selectedYear: new Date().getFullYear(),
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

// ── العملة النشطة في فورم الحجز الحالي ──────────────────────
// CURRENCY_MAP و getCurrencySymbol و fmtMoneyCur مُعرَّفة في app-common.js
let _rfCurrency = 'SAR';

// ── ثوابت نموذج الحجز ───────────────────────────────────────

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

    // حمّل خطط الموازنة للسنة الحالية لاستخدامها في نموذج الحجز
    if (!PlanState.plans.length) {
        const metaR = await fetch('api/budget_plan_api.php?action=meta').then(r => r.json());
        if (metaR.success) {
            PlanState.meta = metaR.data;
            const years = metaR.data.years || [];
            const dataYears = metaR.data.years_with_data || [];
            const curYear = new Date().getFullYear();
            if (!years.includes(PlanState.selectedYear)) {
                if (dataYears.length) PlanState.selectedYear = dataYears[0];
                else if (years.includes(curYear)) PlanState.selectedYear = curYear;
                else if (years.length) PlanState.selectedYear = years[years.length - 1];
            }
        }
        const plansR = await fetch(`api/budget_plan_api.php?action=list&year=${PlanState.selectedYear}`).then(r => r.json());
        if (plansR.success) PlanState.plans = plansR.data;
    }

    BudgetState.loaded = true;

    // لو طُلب تاب معيّن من السايدبار قبل التحميل
    if (BudgetState.activeTab === 'plans') {
        await loadBudgetPlansTab();
    } else {
        renderBudgetPage();
    }
}

async function switchBudgetMainTab(tab) {
    BudgetState.activeTab = tab;
    if (!BudgetState.loaded) {
        // الصفحة لم تُحمَّل بعد — loadBudgetReservationsPage ستأخذ activeTab بعين الاعتبار
        return;
    }
    if (tab === 'reservations') {
        renderBudgetPage();
    } else {
        await loadBudgetPlansTab();
    }
}


// ── جلب البيانات ────────────────────────────────────────────
async function fetchReservations(page) {
    if (page != null) BudgetPagState.page = page;
    try {
        const params = new URLSearchParams(
            Object.fromEntries(Object.entries(BudgetState.filter).filter(([, v]) => v))
        );
        // ── صلاحيات العرض ──────────────────────────────────
        const canViewAll = canDo('reservation.view_all');
        const canViewOwn = canDo('reservation.view_own');
        if (!canViewAll && !canViewOwn) { BudgetState.reservations = []; return; }
        if (!canViewAll) params.set('scope', 'own');

        params.set('page', BudgetPagState.page);
        params.set('per_page', BudgetPagState.perPage);

        const res = await fetch(`api/budget.php?action=list&${params}`);
        const data = await res.json();
        if (data.success) {
            BudgetState.reservations = data.data;
            if (data.pagination) {
                BudgetPagState.total = data.pagination.total;
                BudgetPagState.pages = data.pagination.pages;
                BudgetPagState.page = data.pagination.page;
            }
            // ── إحصائيات إجمالية من الـ API ──────────────────
            if (data.summary) {
                BudgetSummary.total_all = parseInt(data.summary.total_all || 0);
                BudgetSummary.pending = parseInt(data.summary.pending || 0);
                BudgetSummary.approved = parseInt(data.summary.approved || 0);
                BudgetSummary.rejected = parseInt(data.summary.rejected || 0);
                BudgetSummary.total_amount = parseFloat(data.summary.total_amount || 0);
                BudgetSummary.loaded = true;
            }
        }
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

    // ── إحصائيات إجمالية — من الـ API (صحيحة بغض النظر عن الصفحة الحالية) ──
    const total = BudgetSummary.loaded ? BudgetSummary.total_all : reservations.length;
    const pending = BudgetSummary.loaded ? BudgetSummary.pending : reservations.filter(r => r.status === 'قيد المراجعة').length;
    const approved = BudgetSummary.loaded ? BudgetSummary.approved : reservations.filter(r => r.status === 'معتمد').length;
    const rejected = BudgetSummary.loaded ? BudgetSummary.rejected : reservations.filter(r => r.status === 'مرفوض').length;
    const totalAmt = BudgetSummary.loaded ? BudgetSummary.total_amount : reservations.reduce((s, r) => s + parseFloat(r.grand_total_sar || r.grand_total || 0), 0);

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
                    <div class="bsc-num">${formatMoneyWithSAR(totalAmt)}</div>
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
                    <h2 class="budget-page-title">📑 حجوزات الموازنة</h2>
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
        const txBadge = r.transaction_number
            ? `<span class="res-tx-badge" title="مرتبط بمعاملة">${r.transaction_number}</span>`
            : `<span class="res-tx-badge unlinked">غير مرتبط</span>`;

        return `
            <tr class="res-row" onclick="openReservationDetails(${r.id})">
                <td>
                    <div class="res-num">${r.reservation_number}</div>
                    <div class="res-date">${r.request_date ? r.request_date.slice(0, 10) : '—'}</div>
                </td>
                <td>
                    <div class="res-purpose">${r.purpose}</div>
                    <div class="res-dept">${r.department_name || '—'}</div>
                </td>
                <td>
                    <div style="font-weight:500;font-size:.83rem">${r.supplier_name || '—'}</div>
                    ${r.quotation_number ? `<div class="res-date">عرض سعر: ${r.quotation_number}</div>` : ''}
                </td>
                <td class="res-amount">
                    <div>${fmtMoneyCur(parseFloat(r.grand_total || 0), r.currency)}</div>
                </td>
                <td>
                    <span class="res-status-badge" style="color:${st.color};background:${st.bg}">
                        ${r.status}
                    </span>
                </td>
                <td>
                    <span style="color:${prColor};font-weight:500;font-size:.78rem">${r.priority}</span>
                </td>
                <td>${txBadge}</td>
                <td onclick="event.stopPropagation()">
                    <div style="display:flex;gap:.35rem;justify-content:center">
                        <button class="btn-icon-sm" onclick="openReservationDetails(${r.id})" title="تفاصيل">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                            </svg>
                        </button>
                        ${canDo('reservation.review') && r.status === 'قيد المراجعة'
                ? `<button class="btn-icon-sm btn-success" onclick="event.stopPropagation();openReviewModal(${r.id})" title="مراجعة">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="20 6 9 17 4 12"/>
                        </svg>
                    </button>`
                : ''}
                    </div>
                </td>
            </tr>`;
    }).join('');

    return `
        <div class="budget-table-wrap">
            <div class="budget-table-legend">
                <span class="btl-title">الحالة:</span>
                ${Object.entries(RES_STATUS).map(([k, v]) =>
        `<span class="btl-item"><span class="btl-dot" style="background:${v.color}"></span>${k}</span>`
    ).join('')}
            </div>
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
            ${renderBudgetPagination()}
        </div>`;
}

// ── Pagination الحجوزات ──────────────────────────────────────
function renderBudgetPagination() {
    const { page, pages, total, perPage } = BudgetPagState;
    if (!total) return '';

    const from = Math.min(total, (page - 1) * perPage + 1);
    const to = Math.min(total, page * perPage);
    const isFirst = page === 1;
    const isLast = page === pages;
    const dis = 'opacity:.35;cursor:not-allowed;pointer-events:none;';

    // أرقام الصفحات
    function pageNums() {
        if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
        const nums = [1];
        const left = Math.max(2, page - 2), right = Math.min(pages - 1, page + 2);
        if (left > 2) nums.push('...');
        for (let i = left; i <= right; i++) nums.push(i);
        if (right < pages - 1) nums.push('...');
        nums.push(pages);
        return nums;
    }

    const btns = pageNums().map(n =>
        n === '...'
            ? `<span class="tx-pag-dots">…</span>`
            : `<button class="tx-pag-btn ${n === page ? 'tx-pag-btn--active' : ''}"
                       onclick="budgetGoToPage(${n})">${n}</button>`
    ).join('');

    const perOpts = [10, 25, 50, 100].map(n =>
        `<option value="${n}" ${n === perPage ? 'selected' : ''}>${n}</option>`
    ).join('');

    return `
    <div class="tx-pagination">
        <span class="tx-pag-info">عرض ${from}–${to} من ${total}</span>
        <div class="tx-pag-nav">
            <button class="tx-pag-btn tx-pag-arrow ${isFirst ? 'tx-pag-disabled' : ''}" onclick="${isFirst ? '' : 'budgetGoToPage(1)'}">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/></svg>
            </button>
            <button class="tx-pag-btn tx-pag-arrow ${isFirst ? 'tx-pag-disabled' : ''}" onclick="${isFirst ? '' : `budgetGoToPage(${page - 1})`}">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            ${btns}
            <button class="tx-pag-btn tx-pag-arrow ${isLast ? 'tx-pag-disabled' : ''}" onclick="${isLast ? '' : `budgetGoToPage(${page + 1})`}">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
            <button class="tx-pag-btn tx-pag-arrow ${isLast ? 'tx-pag-disabled' : ''}" onclick="${isLast ? '' : `budgetGoToPage(${pages})`}">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>
            </button>
        </div>
        <div class="tx-pag-perpage">
            <span>صفوف في الصفحة:</span>
            <div class="tx-pag-perpage-wrap">
                <select onchange="budgetChangePerPage(this.value)">${perOpts}</select>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
        </div>
    </div>`;
}

async function budgetGoToPage(p) {
    await fetchReservations(Math.max(1, Math.min(BudgetPagState.pages, p)));
    renderBudgetPage();
}

async function budgetChangePerPage(val) {
    BudgetPagState.perPage = parseInt(val) || 25;
    BudgetPagState.page = 1;
    await fetchReservations(1);
    renderBudgetPage();
}

// ── فلترة ────────────────────────────────────────────────────
let budgetSearchTimer;
function budgetFilterChange(key, value) {
    BudgetState.filter[key] = value;
    BudgetPagState.page = 1; // ← إعادة للصفحة الأولى عند تغيير الفلتر
    clearTimeout(budgetSearchTimer);
    budgetSearchTimer = setTimeout(async () => {
        await fetchReservations(1);
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
    requestAnimationFrame(() => {
        initSearchableSelects();
        initCurrencySelectListener();
    });
}

function renderReservationForm(step = BudgetState.currentStep) {
    const { departments, suppliers, cost_centers, budget_categories } = BudgetState.meta;
    const today = new Date().toISOString().split('T')[0];

    // القوائم من قاعدة البيانات فقط (النشطة)
    const ccList = (cost_centers || []).filter(c => c.is_active != 0);
    const catList = (budget_categories || []).filter(c => c.is_active != 0);

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
        const savedDept = savedCC ? (ccList.find(c => c.code === savedCC)?.name || '') : '';
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
                    ...catList.map(c => ({ value: c.code || c.name, label: c.code ? `${c.code} — ${c.name}` : c.name }))]
                })}
                </div>
                <div class="res-form-group">
                    <label>خطة الموازنة التقديرية</label>
                ${searchableSelect({
                    id: 'rf_budget_plan_id',
                    placeholder: 'ابحث عن خطة الموازنة...',
                    value: String(_budgetFormData['rf_budget_plan_id'] || ''),
                    options: [{ value: '', label: '-- بدون ربط بخطة --' },
                    ...(PlanState.plans || []).map(p => ({
                        value: String(p.id),
                        label: (p.category_code ? p.category_code + ' \u2014 ' : '') + p.category_name + ' (' + p.fiscal_year + ')'
                    }))]
                })}
                </div>
                <div class="res-form-group full" id="rf_budget_info_wrap"></div>
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
                ${renderCurrencySelect('rf_currency', _budgetFormData['rf_currency'] || 'SAR', '_onCurrencyChange')}
            </div>
            <div class="res-form-group" id="rf_exchange_rate_wrap" style="margin-top:.25rem;${(_budgetFormData['rf_currency'] && _budgetFormData['rf_currency'] !== 'SAR') ? '' : 'display:none'}">
                <label>سعر الصرف (1 وحدة = ؟ ريال) <span class="req">*</span></label>
                <input type="number" class="form-input" id="rf_exchange_rate" style="max-width:220px"
                    value="${_budgetFormData['rf_exchange_rate'] || 3.75}" min="0.0001" step="0.0001"
                    placeholder="مثال: 3.75 للدولار"
                    oninput="onExchangeRateChange(this.value)">
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
    // قد تُستدعى مباشرةً أو من listener على hidden input
    if (val && typeof val === 'object') val = val.target?.value || val.value || 'SAR';
    _rfCurrency = val || 'SAR';
    _budgetFormData['rf_currency'] = _rfCurrency;
    // تحديث رمز العملة في كل الأرقام
    refreshTotals();
    // تحديث الشارة في العنوان
    document.querySelectorAll('.rf-currency-live').forEach(el => {
        el.textContent = getCurrencySymbol(val) + ' ' + val;
    });
    // إظهار / إخفاء حقل سعر الصرف
    const wrap = document.getElementById('rf_exchange_rate_wrap');
    if (wrap) wrap.style.display = val !== 'SAR' ? '' : 'none';
    // تحديث شريط الميزانية
    refreshBudgetInfoBar();
}

/** يُشغَّل بعد إدراج نموذج الحجز في DOM لربط قائمة العملة */
function initCurrencySelectListener() {
    const el = document.getElementById('rf_currency');
    if (el) {
        el.addEventListener('change', e => _onCurrencyChange(e.target.value));
        // ضبط القيمة الأولية
        if (el.value) _onCurrencyChange(el.value);
    }
}

function onExchangeRateChange(val) {
    _budgetFormData['rf_exchange_rate'] = val;
    refreshBudgetInfoBar();
}


function updateItem(i, field, value) {
    if (_rfItems[i]) _rfItems[i][field] = value;
}

function refreshTotals() {
    _rfItems.forEach((it, i) => {
        const el = document.getElementById(`rf_line_${i}`);
        if (el) el.innerHTML = fmtMoneyCur(calcLineTotal(it), _rfCurrency);
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
    requestAnimationFrame(() => {
        initSearchableSelects();
        initCurrencySelectListener();
    });
}

const _budgetFormData = {};
function saveBudgetFormData() {
    const fields = [
        'rf_purpose', 'rf_department_id', 'rf_department_name', 'rf_request_date', 'rf_priority',
        'rf_budget_category', 'rf_cost_center',
        'rf_supplier_id', 'rf_supplier_name_manual', 'rf_quotation_number', 'rf_quotation_date',
        'rf_currency', 'rf_budget_plan_id', 'rf_exchange_rate',
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
    // تطبيق العملة المحفوظة على الإجمالي وحقل سعر الصرف
    const savedCurrency = _budgetFormData['rf_currency'] || 'SAR';
    _rfCurrency = savedCurrency;
    const wrap2 = document.getElementById('rf_exchange_rate_wrap');
    if (wrap2) wrap2.style.display = savedCurrency !== 'SAR' ? '' : 'none';
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
    const ccList = (BudgetState.meta.cost_centers || []).filter(c => c.is_active != 0);
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
    autoLinkBudgetPlan();
}

// ── ربط تلقائي لخطة الموازنة عند اختيار البند أو مركز التكلفة ──
async function autoLinkBudgetPlan() {
    const catCode = document.getElementById('rf_budget_category')?._selectedValue
        || _budgetFormData['rf_budget_category'] || '';
    const ccCode = document.getElementById('rf_cost_center')?._selectedValue
        || _budgetFormData['rf_cost_center'] || '';
    const planSelect = document.getElementById('rf_budget_plan_id');

    if (!catCode) {
        await refreshBudgetInfoBar();
        return;
    }

    // البحث عن خطة مطابقة في PlanState.plans
    const plans = PlanState.plans || [];
    const match = plans.find(p =>
        p.category_code === catCode ||
        p.category_name === catCode ||
        p.category_code === catCode.split(' — ')[0]
    );

    if (match) {
        _budgetFormData['rf_budget_plan_id'] = String(match.id);
        if (planSelect) {
            planSelect.value = String(match.id);
            // تحديث الـ searchableSelect display
            const trigger = planSelect.closest('.ss-wrap')?.querySelector('.ss-display');
            if (trigger) {
                const label = (match.category_code ? match.category_code + ' — ' : '') +
                    match.category_name + ' (' + match.fiscal_year + ')';
                trigger.textContent = label;
                trigger.classList.remove('ss-ph');
            }
        }
        showToast('تم ربط خطة الموازنة تلقائياً', 'success');
    }

    await refreshBudgetInfoBar();
}

async function onBudgetPlanChange(planId) {
    _budgetFormData['rf_budget_plan_id'] = planId;
    await refreshBudgetInfoBar();
}

async function refreshBudgetInfoBar() {
    const wrap = document.getElementById('rf_budget_info_wrap');
    if (!wrap) return;
    const planId = document.getElementById('rf_budget_plan_id')?.value || _budgetFormData['rf_budget_plan_id'];
    const ccCode = document.getElementById('rf_cost_center')?._selectedValue
        || _budgetFormData['rf_cost_center'];
    const currency = document.getElementById('rf_currency')?.value || 'SAR';
    const rate = parseFloat(document.getElementById('rf_exchange_rate')?.value || 1);
    if (!planId || !ccCode) { wrap.innerHTML = ''; return; }
    const info = await loadPlanBudgetInfo(planId, ccCode);
    wrap.innerHTML = renderBudgetInfoBar(info, currency, rate);
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
        budget_plan_id: _budgetFormData['rf_budget_plan_id'] || null,
        exchange_rate: parseFloat(_budgetFormData['rf_exchange_rate'] || 1),
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
                        <div class="rdv2-logo-icon"><img src="data:image/png;base64,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" alt="شعار" style="width:100%;height:100%;object-fit:contain;display:block"></div>
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

                <!-- ══ ميزانية البند التقديرية ══ -->
                <div id="rdv2_budget_bar_wrap"></div>

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
                        <tr style="border-top:2px solid var(--border-color)">
                            <td colspan="5" style="text-align:right;font-weight:700;padding:.65rem 1rem;color:var(--text-primary)">الإجمالي الكلي</td>
                            <td style="text-align:left;direction:ltr;font-family:monospace;font-size:1.05rem;font-weight:800;color:#1e40af;padding:.65rem 1rem">
                                ${fmtMoneyCur(parseFloat(r.grand_total || 0), r.currency)}
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

        // ── تحميل ميزانية البند التقديرية ─────────────────
        loadReservationBudgetBar(r);

    } catch (e) {
        DOM.modalBody.innerHTML = '<p style="color:var(--accent-red);padding:2rem;text-align:center">خطأ في تحميل البيانات</p>';
    }
}

// ── طباعة الحجز ─────────────────────────────────────────────
function printReservation() {
    const content = document.getElementById('rdv2_printable');
    if (!content) return;
    PdfEngine.fromHTML(content.innerHTML, 'وثيقة-حجز-ميزانية.pdf', getRdv2PrintCSS());
}

// ── تنزيل PDF ───────────────────────────────────────────────
async function downloadReservationPDF(id) {
    const btn = document.querySelector('.rdv2-pdf-btn');
    const origHTML = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '⏳ جاري التحضير...'; }
    try {
        const el = document.getElementById('rdv2_printable');
        if (!el) return;
        const ok = PdfEngine.fromHTML(el.innerHTML, 'حجز-ميزانية-' + id + '.pdf', getRdv2PrintCSS());
        if (btn && ok) {
            btn.innerHTML = '✅ تم فتح نافذة الطباعة';
            setTimeout(() => { btn.innerHTML = origHTML; btn.disabled = false; }, 2500);
        } else if (btn) {
            btn.innerHTML = origHTML; btn.disabled = false;
        }
    } catch (e) {
        console.error('[budget] downloadReservationPDF:', e);
        if (btn) { btn.innerHTML = origHTML; btn.disabled = false; }
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
        .rdv2-logo-icon { width:28px; height:28px; background:transparent; overflow:hidden; padding:1px;
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
        `<option value="${t.id}" data-num="${t.transaction_number}">${t.transaction_number} — ${fmtMoneyCurText(parseFloat(t.amount), t.currency)}
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
        <input type="hidden" id="${id}" name="${id}" value="${value}">
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
                <input class="ss-search" type="text" placeholder="ابحث..." oninput="_ssFilterOptions(this)" autocomplete="off">
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
    // يُفوَّض إلى الدالة المركزية في app-common.js
    _ssSelectOption(opt);
}

// delegate listener موجود في app-common.js عبر initSearchableSelects()

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

    /* ── تابز رئيسية ────────────────────────────── */
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

    .budget-table-wrap { background:var(--bg-card); border:1px solid var(--border-color);
                         border-radius:12px; overflow:hidden; }
    .budget-table-legend { display:flex; align-items:center; gap:14px; padding:7px 14px;
                           background:var(--bg-surface); border-bottom:1px solid var(--border-color);
                           flex-wrap:wrap; direction:rtl; }
    .btl-title { font-size:.75rem; font-weight:600; color:var(--text-secondary); white-space:nowrap; }
    .btl-item  { display:flex; align-items:center; gap:5px; font-size:.75rem; color:var(--text-secondary); white-space:nowrap; }
    .btl-dot   { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
    .budget-table { width:100%; border-collapse:collapse; }
    .budget-table thead th { padding:.65rem 1rem; text-align:right; font-size:.75rem;
                              font-weight:600; color:var(--text-secondary);
                              background:var(--bg-surface); border-bottom:1px solid var(--border-color);
                              letter-spacing:.02em; }
    .res-row { cursor:pointer; transition:background .15s; }
    .res-row:hover td { background:var(--bg-surface); }
    .res-row td { padding:.75rem 1rem; border-bottom:1px solid var(--border-color);
                  font-size:.83rem; vertical-align:middle; color:var(--text-primary); }
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
    .rdv2-logo-icon { width:44px; height:44px; background:transparent; overflow:hidden; padding:2px;
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

    /* ── الموازنة التقديرية — accordion ─────────────── */
    .bp-categories-list  { display:flex; flex-direction:column; gap:.4rem; }

    .bp-cat-row          { border:1px solid var(--border-color); border-radius:10px;
                           overflow:hidden; background:var(--bg-card);
                           transition:box-shadow .15s,border-color .15s; }
    .bp-cat-row:hover    { box-shadow:0 2px 10px rgba(0,0,0,.07); }
    .bp-cat-row.has-plan { border-color:rgba(99,102,241,.25); }
    .bp-cat-row.has-plan:hover { border-color:rgba(99,102,241,.45); }

    .bp-cat-header       { display:grid;
                           grid-template-columns: 22px 1fr 190px 110px 32px;
                           align-items:center; gap:.75rem;
                           padding:.6rem 1rem; cursor:pointer;
                           user-select:none; }
    .bp-cat-header:hover { background:rgba(99,102,241,.02); }

    .bp-cat-toggle       { font-size:1rem; color:var(--text-muted); width:20px; text-align:center; }
    .bp-cat-info         { display:flex; flex-direction:column; gap:.1rem; overflow:hidden; }
    .bp-cat-code         { font-size:.73rem; color:var(--text-muted); font-family:monospace; }
    .bp-cat-name         { font-size:.87rem; font-weight:600; color:var(--text-primary);
                           white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

    .bp-budget-input     { width:100%; padding:.35rem .6rem; border-radius:7px;
                           border:1px solid var(--border-color); background:var(--bg-surface);
                           color:var(--text-primary); font-size:.85rem; text-align:left;
                           direction:ltr; }
    .bp-budget-input:focus     { outline:none; border-color:var(--accent-blue); box-shadow:0 0 0 2px rgba(77,171,247,.2); }
    .bp-budget-input.bp-budget-new { border-style:dashed; color:var(--text-muted); }

    .bp-sar-label        { font-size:1.75rem; color:var(--text-muted); white-space:nowrap; }

    .bp-cat-bar-wrap     { display:flex; align-items:center; gap:.4rem; }
    .bp-cat-bar-bg       { flex:1; height:6px; background:var(--bg-surface); border-radius:3px; min-width:50px; }
    .bp-cat-bar-fill     { height:6px; border-radius:3px; transition:width .3s; }
    .bp-cat-pct          { font-size:.72rem; font-weight:700; width:32px; text-align:left; }

    .bp-cat-remaining    { font-size:.8rem; font-weight:600; text-align:left; direction:ltr; }
    .bp-cat-del          { background:none; border:none; cursor:pointer; color:var(--text-muted);
                           font-size:.9rem; padding:.2rem; border-radius:4px; opacity:.5;
                           transition:opacity .15s; }
    .bp-cat-del:hover    { opacity:1; color:#ef4444; }
    .bp-cat-del-hide     { visibility:hidden; }

    /* panel مراكز التكلفة */
    .bp-cc-panel         { border-top:1px solid var(--border-color); background:var(--bg-surface); }
    .bp-cc-header-row    { display:grid; grid-template-columns:36px 1fr 180px 1fr;
                           gap:.5rem; padding:.4rem 1rem;
                           font-size:.75rem; font-weight:700; color:var(--text-muted);
                           border-bottom:1px solid var(--border-color); }
    .bp-cc-rows-wrap     { max-height:400px; overflow-y:auto; }
    .bp-cc-row           { display:grid; grid-template-columns:36px 1fr 180px 1fr;
                           gap:.5rem; align-items:center; padding:.45rem 1rem;
                           border-bottom:1px solid rgba(0,0,0,.04);
                           transition:background .1s; }
    .bp-cc-row:hover     { background:var(--bg-card); }
    .bp-cc-row.active    { background:rgba(99,102,241,.05); }

    .bp-cc-toggle-wrap   { display:flex; align-items:center; justify-content:center; }
    .bp-cc-check         { width:16px; height:16px; cursor:pointer; accent-color:var(--accent-blue); }
    .bp-cc-name-wrap     { display:flex; flex-direction:column; gap:.05rem; overflow:hidden; }
    .bp-cc-code-sm       { font-size:.7rem; color:var(--text-muted); font-family:monospace; }
    .bp-cc-name-sm       { font-size:.82rem; color:var(--text-primary);
                           white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .bp-cc-amount-wrap   { display:flex; align-items:center; gap:.35rem; }
    .bp-cc-amount-input  { width:100%; padding:.3rem .5rem; border-radius:6px;
                           border:1px solid var(--border-color); background:var(--bg-card);
                           color:var(--text-primary); font-size:.83rem;
                           text-align:left; direction:ltr; }
    .bp-cc-amount-input:disabled { opacity:.35; cursor:not-allowed; }
    .bp-cc-amount-input:focus    { outline:none; border-color:var(--accent-blue); }

    /* CC row reserved/remaining */
    .bp-cc-reserved-wrap     { display:flex; align-items:center; gap:.35rem; min-width:180px; }
    .bp-cc-stat              { display:flex; flex-direction:column; align-items:center;
                               background:var(--bg-card); border-radius:6px;
                               padding:.2rem .55rem; min-width:76px; flex:1; }
    .bp-cc-stat-lbl          { font-size:.68rem; color:var(--text-muted); line-height:1.2; }
    .bp-cc-stat-val          { font-size:.8rem; font-weight:700; line-height:1.4; }
    .bp-cc-stat-val.reserved { color:#f59e0b; }
    .bp-cc-stat-val.ok       { color:#22c55e; }
    .bp-cc-stat-val.over     { color:#ef4444; }
    .bp-cc-stat-sep          { width:1px; height:28px; background:var(--border-color); margin:0 .1rem; }
    /* Footer */
    .bp-cc-footer-inner      { padding:.6rem .75rem; }
    .bp-cc-footer-cards      { display:flex; gap:.5rem; margin-bottom:.55rem; flex-wrap:wrap; }
    .bp-cc-footer-card       { flex:1; min-width:90px; background:var(--bg-card);
                               border-radius:7px; padding:.35rem .6rem;
                               border:1px solid var(--border-color); }
    .bp-cc-footer-card.over  { border-color:#ef444440; background:rgba(239,68,68,.06); }
    .bp-cc-footer-card.alloc { border-color:rgba(34,197,94,.3); background:rgba(34,197,94,.05); }
    .bp-cc-footer-card-lbl   { display:block; font-size:.68rem; color:var(--text-muted); margin-bottom:.15rem; }
    .bp-cc-footer-card-val   { font-size:.88rem; font-weight:700; color:var(--text-primary); }
    .bp-cc-footer-card-val small { font-size:.68rem; font-weight:400; color:var(--text-muted); }
    .bp-cc-footer-bar-wrap   { display:flex; align-items:center; gap:.5rem; }
    .bp-cc-footer-bar-track  { flex:1; height:6px; background:var(--bg-surface);
                               border-radius:4px; overflow:hidden;
                               border:1px solid var(--border-color); }
    .bp-cc-footer-bar-fill   { height:100%; border-radius:4px; transition:width .4s; }
    .bp-cc-footer-bar-pct    { font-size:.75rem; font-weight:700; min-width:34px; text-align:left; }
    .bp-cc-remaining-val { font-weight:600; }

    .bp-cc-footer        { padding:.6rem 1rem; border-top:1px solid var(--border-color);
                           background:var(--bg-card); }

    /* شريط الحفظ */
    .bp-save-bar         { position:sticky; top:0; z-index:10;
                           display:flex; align-items:center; gap:1rem;
                           background:rgba(245,158,11,.12); border:1px solid rgba(245,158,11,.3);
                           border-radius:10px; padding:.6rem 1.2rem;
                           margin-bottom:1rem; flex-wrap:wrap; }
    #bp-save-bar-msg     { color:#b45309; font-weight:600; font-size:.85rem; flex:1; }

    /* year picker */
    .bp-year-picker      { display:flex; align-items:center; gap:.75rem;
                           background:var(--bg-card); border:1px solid var(--border-color);
                           border-radius:12px; padding:.45rem .85rem; }
    .bp-year-picker-label{ font-size:.78rem; font-weight:600;
                           color:var(--text-muted); white-space:nowrap; }
    .bp-year-pills       { display:flex; gap:.35rem; }
    .bp-year-pill        { border:1.5px solid var(--border-color);
                           background:transparent; color:var(--text-secondary);
                           font-size:.85rem; font-weight:600; font-family:inherit;
                           padding:.28rem .85rem; border-radius:8px;
                           cursor:pointer; transition:all .18s; white-space:nowrap; }
    .bp-year-pill:hover  { border-color:#6366f1; color:#6366f1;
                           background:rgba(99,102,241,.06); }
    .bp-year-pill.active { background:#6366f1; color:#fff;
                           border-color:#6366f1; box-shadow:0 2px 8px rgba(99,102,241,.35); }
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

// ════════════════════════════════════════════════════════════
//  الموازنة التقديرية
// ════════════════════════════════════════════════════════════

async function loadBudgetPlansTab() {
    injectBudgetStyles();
    // تأكد من وجود CSS الـ year picker (يُضاف مرة واحدة فقط)
    if (!document.getElementById('bp-year-picker-styles')) {
        const ys = document.createElement('style');
        ys.id = 'bp-year-picker-styles';
        ys.textContent = `
            .bp-year-picker      { display:flex; align-items:center; gap:.75rem;
                                   background:var(--bg-card); border:1px solid var(--border-color);
                                   border-radius:12px; padding:.45rem .85rem; }
            .bp-year-picker-label{ font-size:.78rem; font-weight:600;
                                   color:var(--text-muted); white-space:nowrap; }
            .bp-year-pills       { display:flex; gap:.35rem; }
            .bp-year-pill        { border:1.5px solid var(--border-color);
                                   background:transparent; color:var(--text-secondary);
                                   font-size:.85rem; font-weight:600; font-family:inherit;
                                   padding:.28rem .85rem; border-radius:8px;
                                   cursor:pointer; transition:all .18s; white-space:nowrap; }
            .bp-year-pill:hover  { border-color:#6366f1; color:#6366f1;
                                   background:rgba(99,102,241,.06); }
            .bp-year-pill.active { background:#6366f1; color:#fff;
                                   border-color:#6366f1; box-shadow:0 2px 8px rgba(99,102,241,.35); }
        `;
        document.head.appendChild(ys);
    }
    DOM.mainContent.innerHTML = `
        <div class="budget-page-wrap">
            <div class="budget-page-header">
                <div>
                    <h2 class="budget-page-title">📊 الموازنة التقديرية</h2>
                    <p class="budget-page-sub">تخصيص الميزانيات السنوية على البنود ومراكز التكلفة</p>
                </div>
            </div>
            <div id="plans-body"><div class="spinner" style="margin:3rem auto;display:block"></div></div>
        </div>`;

    if (!PlanState.meta.categories.length) {
        const m = await fetch('api/budget_plan_api.php?action=meta').then(r => r.json());
        if (m.success) PlanState.meta = m.data;
    }

    await fetchPlans();
    renderPlansPage();
}

async function fetchPlans() {
    const r = await fetch(`api/budget_plan_api.php?action=list&year=${PlanState.selectedYear}`).then(r => r.json());
    if (r.success) PlanState.plans = r.data;
}

async function fetchPlanMeta(forceYear = false) {
    const m = await fetch('api/budget_plan_api.php?action=meta').then(r => r.json());
    if (m.success) {
        PlanState.meta = m.data;
        if (forceYear) {
            // فقط عند التحميل الأول — لا نتجاوز اختيار المستخدم
            const dataYears = m.data.years_with_data || [];
            const curYear = new Date().getFullYear();
            const allYears = [curYear - 1, curYear, curYear + 1];
            if (!allYears.includes(PlanState.selectedYear)) {
                PlanState.selectedYear = curYear;
            }
        }
    }
}

function renderPlansPage() {
    const { plans, selectedYear, meta } = PlanState;
    const totalBudget = plans.reduce((s, p) => s + parseFloat(p.total_budget || 0), 0);
    const totalReserved = plans.reduce((s, p) => s + parseFloat(p.total_reserved || 0), 0);
    const totalRemaining = totalBudget - totalReserved;
    const totalPct = totalBudget > 0 ? Math.min(100, Math.round(totalReserved / totalBudget * 100)) : 0;
    const activePlans = plans.filter(p => parseFloat(p.total_budget || 0) > 0).length;

    const curYear = new Date().getFullYear();
    const isAdmin = typeof currentUser !== 'undefined' &&
        (currentUser.permissionLevel === 'system_admin' || currentUser.role === 'admin');
    const isLocked = selectedYear !== curYear && !isAdmin;

    const allYears = [curYear - 1, curYear, curYear + 1];
    const yearPills = allYears.map(y => {
        const locked = y !== curYear && !isAdmin;
        return `<button class="bp-year-pill ${y == selectedYear ? 'active' : ''}"
                    onclick="changePlanYear(${y})"
                    style="${locked ? 'opacity:.75' : ''}"
                    title="${locked ? '🔒 يتطلب صلاحية مدير النظام' : ''}">
                    ${y}${locked ? ' 🔒' : ''}
                </button>`;
    }).join('');

    // ── إحصاءات ──────────────────────────────────────────────
    const usedPct = totalBudget > 0 ? Math.round(totalReserved / totalBudget * 100) : 0;
    const barClr = usedPct >= 90 ? '#ef4444' : usedPct >= 70 ? '#f59e0b' : '#22c55e';

    const statsHtml = `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1.8fr;gap:.75rem;margin-bottom:1.25rem">

        <div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:12px;padding:.85rem 1rem">
            <div style="font-size:.7rem;color:var(--text-muted);margin-bottom:.3rem;font-weight:500">عدد البنود النشطة</div>
            <div style="font-size:1.6rem;font-weight:800;color:#6366f1;line-height:1">${activePlans}</div>
            <div style="font-size:.68rem;color:var(--text-muted);margin-top:.3rem">من أصل ${meta.categories.length} بند</div>
        </div>

        <div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:12px;padding:.85rem 1rem">
            <div style="font-size:.7rem;color:var(--text-muted);margin-bottom:.3rem;font-weight:500">إجمالي الميزانية</div>
            <div style="font-size:1rem;font-weight:800;color:var(--text-primary);line-height:1.3">${formatMoneyWithSAR(totalBudget)}</div>
            <div style="font-size:.68rem;color:var(--text-muted);margin-top:.3rem">سنة ${selectedYear}</div>
        </div>

        <div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:12px;padding:.85rem 1rem">
            <div style="font-size:.7rem;color:var(--text-muted);margin-bottom:.3rem;font-weight:500">المتبقي</div>
            <div style="font-size:1rem;font-weight:800;color:${totalRemaining < 0 ? '#ef4444' : '#22c55e'};line-height:1.3">${formatMoneyWithSAR(totalRemaining)}</div>
            <div style="font-size:.68rem;color:${totalRemaining < 0 ? '#ef4444' : 'var(--text-muted)'};margin-top:.3rem">${totalRemaining < 0 ? '⚠ تجاوز الميزانية' : 'متاح للحجز'}</div>
        </div>

        <div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:12px;padding:.85rem 1rem">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">
                <div style="font-size:.7rem;color:var(--text-muted);font-weight:500">نسبة الاستخدام الإجمالية</div>
                <div style="font-size:.85rem;font-weight:800;color:${barClr}">${usedPct}%</div>
            </div>
            <div style="background:var(--bg-surface);border-radius:4px;height:8px;overflow:hidden;margin-bottom:.4rem">
                <div style="height:100%;width:${Math.min(100, usedPct)}%;background:${barClr};border-radius:4px;transition:width .4s"></div>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:.67rem;color:var(--text-muted)">
                <span>المحجوز: ${formatMoneyWithSAR(totalReserved)}</span>
                <span>الإجمالي: ${formatMoneyWithSAR(totalBudget)}</span>
            </div>
        </div>

    </div>`;

    // ── بنود accordion ────────────────────────────────────────
    const categoriesHtml = meta.categories.map(cat => {
        const plan = plans.find(p => p.category_id == cat.id);
        const budget = plan ? parseFloat(plan.total_budget || 0) : 0;
        const reserved = plan ? parseFloat(plan.total_reserved || 0) : 0;
        const remaining = budget - reserved;
        const pct = budget > 0 ? Math.min(100, Math.round(reserved / budget * 100)) : 0;
        const pctReal = budget > 0 ? Math.round(reserved / budget * 100) : 0;
        const barColor = pctReal >= 100 ? '#ef4444' : pctReal >= 90 ? '#ef4444' : pctReal >= 70 ? '#f59e0b' : '#22c55e';
        const hasPlan = !!plan;
        const isOpen = PlanState.openCategories?.has(cat.id);

        return `
        <div class="bp-cat-row ${hasPlan ? 'has-plan' : 'no-plan'}" id="bp-cat-${cat.id}">
            <div class="bp-cat-header" onclick="togglePlanCategory(${cat.id})">

                <!-- زر التوسيع -->
                <div style="width:22px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2.5"
                         style="transition:transform .2s;transform:rotate(${isOpen ? '90' : '0'}deg)">
                        <polyline points="9 18 15 12 9 6"/>
                    </svg>
                </div>

                <!-- اسم البند -->
                <div style="display:flex;flex-direction:column;gap:.1rem;overflow:hidden;flex:1">
                    <div style="display:flex;align-items:center;gap:.5rem">
                        <span style="font-size:.68rem;color:var(--text-muted);font-family:monospace;
                                     background:var(--bg-surface);padding:1px 6px;border-radius:4px;
                                     border:1px solid var(--border-color);flex-shrink:0">${cat.code}</span>
                        <span style="font-size:.86rem;font-weight:600;color:var(--text-primary);
                                     white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${cat.name}</span>
                    </div>
                    ${hasPlan && budget > 0 ? `
                    <div style="display:flex;align-items:center;gap:.4rem;margin-top:2px">
                        <div style="flex:1;max-width:160px;height:3px;background:var(--bg-surface);border-radius:2px;overflow:hidden">
                            <div style="height:100%;width:${Math.min(100, pct)}%;background:${barColor};border-radius:2px"></div>
                        </div>
                        <span style="font-size:.65rem;color:${barColor};font-weight:600">${pctReal}%</span>
                    </div>` : ''}
                </div>

                <!-- حقل الميزانية -->
                <div style="display:flex;align-items:center;gap:.3rem;flex-shrink:0;width:190px">
                    ${hasPlan
                ? `<input type="number" class="bp-budget-input" id="bp-total-${cat.id}"
                                value="${budget}" min="0" step="0.01"
                                onclick="event.stopPropagation()"
                                onchange="onCatBudgetChange(${cat.id}, this.value)">`
                : `<input type="number" class="bp-budget-input bp-budget-new" id="bp-total-${cat.id}"
                                placeholder="أضف ميزانية..." min="0" step="0.01"
                                onclick="event.stopPropagation()"
                                onchange="onCatBudgetChange(${cat.id}, this.value)">`
            }
                    <span class="bp-sar-label sar-symbol" style="flex-shrink:0"></span>
                </div>

                <!-- المحجوز / المتبقي -->
                ${hasPlan && budget > 0 ? `
                <div style="display:flex;flex-direction:column;align-items:flex-end;flex-shrink:0;min-width:110px">
                    <div style="font-size:.72rem;color:#f59e0b;font-weight:600">${formatMoneyWithSAR(reserved)}</div>
                    <div style="font-size:.67rem;color:${remaining < 0 ? '#ef4444' : 'var(--text-muted)'};margin-top:1px">
                        ${remaining < 0 ? '⚠ ' : ''}${formatMoneyWithSAR(remaining)}
                    </div>
                </div>` : '<div style="min-width:110px"></div>'}

                <!-- حذف -->
                <button class="bp-cat-del ${hasPlan ? '' : 'bp-cat-del-hide'}"
                    onclick="event.stopPropagation();deletePlan(${plan?.id || 0},'${cat.name.replace(/'/g, "\\'")}',${cat.id})"
                    title="حذف البند" style="flex-shrink:0">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                        <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                    </svg>
                </button>
            </div>

            <div class="bp-cc-panel" id="bp-cc-panel-${cat.id}" style="display:${isOpen ? 'block' : 'none'}">
                <div class="bp-cc-loading" id="bp-cc-loading-${cat.id}">
                    <div class="spinner" style="width:20px;height:20px;margin:1rem auto;display:block"></div>
                </div>
                <div class="bp-cc-content" id="bp-cc-content-${cat.id}" style="display:none"></div>
            </div>
        </div>`;
    }).join('');

    document.getElementById('plans-body').innerHTML = `
        <!-- Toolbar -->
        <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1rem;flex-wrap:wrap">
            <div class="bp-year-picker">
                <span class="bp-year-picker-label">📅 السنة المالية</span>
                <div class="bp-year-pills">${yearPills}</div>
            </div>
            <div style="position:relative;flex:1;min-width:180px;max-width:260px">
                <svg style="position:absolute;right:10px;top:50%;transform:translateY(-50%);pointer-events:none"
                     width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input type="text" id="bp-search" placeholder="بحث في البنود..."
                    style="width:100%;padding:.45rem .75rem .45rem 2.2rem;border:1px solid var(--border-color);
                           border-radius:9px;background:var(--bg-card);color:var(--text-primary);
                           font-size:.82rem;direction:rtl"
                    oninput="filterPlanCategories(this.value)">
            </div>
            <div style="display:flex;gap:.35rem;margin-right:auto">
                <button onclick="expandAllPlanCategories()"
                    style="padding:.4rem .75rem;border:1px solid var(--border-color);border-radius:8px;
                           background:var(--bg-card);color:var(--text-secondary);font-size:.78rem;cursor:pointer"
                    title="توسيع الكل">توسيع الكل</button>
                <button onclick="collapseAllPlanCategories()"
                    style="padding:.4rem .75rem;border:1px solid var(--border-color);border-radius:8px;
                           background:var(--bg-card);color:var(--text-secondary);font-size:.78rem;cursor:pointer"
                    title="طي الكل">طي الكل</button>
            </div>
        </div>

        ${statsHtml}

        ${isLocked ? `
        <div style="display:flex;align-items:center;gap:.75rem;padding:.65rem 1rem;margin-bottom:1rem;
                    background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.3);
                    border-radius:10px;color:#92400e;font-size:.82rem">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <span>سنة <strong>${selectedYear}</strong> مقفلة — يتطلب صلاحية <strong>مدير النظام</strong> للتعديل</span>
        </div>` : ''}

        <div class="bp-save-bar" id="bp-save-bar" style="display:none">
            <span id="bp-save-bar-msg">📝 يوجد تغييرات غير محفوظة</span>
            <button class="btn btn-primary" onclick="saveAllPlanChanges()">💾 حفظ الكل</button>
            <button class="btn btn-secondary" onclick="discardPlanChanges()">↩ تجاهل</button>
        </div>

        <!-- رأس الجدول -->
        <div style="display:grid;grid-template-columns:22px 1fr 190px 110px 32px;gap:.75rem;
                    padding:.4rem 1rem;font-size:.68rem;font-weight:700;color:var(--text-muted);
                    border-bottom:1px solid var(--border-color);margin-bottom:.35rem">
            <div></div>
            <div>البند</div>
            <div style="text-align:center">الميزانية المخصصة</div>
            <div style="text-align:left">المحجوز / المتبقي</div>
            <div></div>
        </div>

        <div class="bp-categories-list" id="bp-categories-list"
             style="${isLocked ? 'pointer-events:none;opacity:.75;user-select:none' : ''}">
            ${categoriesHtml}
        </div>`;

    // إعادة فتح الأقسام المفتوحة سابقاً (مع تحميل مراكزها)
    if (PlanState.openCategories?.size) {
        PlanState.openCategories.forEach(catId => loadCCPanel(catId));
    }
}
async function changePlanYear(year) {
    PlanState.selectedYear = parseInt(year);
    PlanState.openCategories = new Set();
    PlanState.pendingChanges = {};
    const pb = document.getElementById('plans-body');
    if (pb) pb.innerHTML = '<div class="spinner" style="margin:2rem auto;display:block"></div>';
    // نجلب الخطط فقط — لا نستدعي fetchPlanMeta لأنها تُعيد تعيين selectedYear
    await fetchPlans();
    renderPlansPage();
}

// ── Accordion: فتح / إغلاق بند ─────────────────────────────
if (!PlanState.openCategories) PlanState.openCategories = new Set();
if (!PlanState.pendingChanges) PlanState.pendingChanges = {};

async function togglePlanCategory(catId) {
    const panel = document.getElementById(`bp-cc-panel-${catId}`);
    const toggle = document.querySelector(`#bp-cat-${catId} .bp-cat-toggle`);
    if (!panel) return;

    if (PlanState.openCategories.has(catId)) {
        // إغلاق
        PlanState.openCategories.delete(catId);
        panel.style.display = 'none';
        if (toggle) toggle.textContent = '▸';
    } else {
        // فتح
        PlanState.openCategories.add(catId);
        panel.style.display = 'block';
        if (toggle) toggle.textContent = '▾';
        await loadCCPanel(catId);
    }
}

async function loadCCPanel(catId) {
    const loading = document.getElementById(`bp-cc-loading-${catId}`);
    const content = document.getElementById(`bp-cc-content-${catId}`);
    if (!content || content.dataset.loaded === '1') {
        if (loading) loading.style.display = 'none';
        if (content) content.style.display = 'block';
        return;
    }

    // جلب مراكز التكلفة الكاملة + الحالية للخطة إن وجدت
    const plan = PlanState.plans.find(p => p.category_id == catId);
    const allCCs = PlanState.meta.cost_centers || [];

    let existingCCs = {}; // cost_center_id → allocated
    if (plan) {
        const r = await fetch(`api/budget_plan_api.php?action=detail&id=${plan.id}`).then(r => r.json());
        if (r.success) {
            (r.data.cost_centers || []).forEach(cc => {
                existingCCs[cc.cost_center_id] = { allocated: parseFloat(cc.allocated || 0), reserved: parseFloat(cc.reserved || 0) };
            });
        }
    }

    const rows = allCCs.map(cc => {
        const ex = existingCCs[cc.id] || null;
        const allocated = ex ? ex.allocated : 0;
        const reserved = ex ? ex.reserved : 0;
        const remaining = allocated - reserved;
        const isActive = !!ex && allocated > 0;

        return `
        <div class="bp-cc-row ${isActive ? 'active' : ''}" id="bp-cc-row-${catId}-${cc.id}">
            <label class="bp-cc-toggle-wrap">
                <input type="checkbox" class="bp-cc-check" ${isActive ? 'checked' : ''}
                    onchange="onCCToggle(${catId}, ${cc.id}, this.checked)">
            </label>
            <div class="bp-cc-name-wrap">
                <span class="bp-cc-code-sm">${cc.code}</span>
                <span class="bp-cc-name-sm">${cc.name}</span>
            </div>
            <div class="bp-cc-amount-wrap">
                <input type="number" class="bp-cc-amount-input" id="bp-cc-amt-${catId}-${cc.id}"
                    value="${isActive ? allocated : ''}" placeholder="0.00" min="0" step="0.01"
                    ${isActive ? '' : 'disabled'}
                    onchange="onCCAmountChange(${catId}, ${cc.id}, this.value)">
                <span class="bp-sar-label sar-symbol"></span>
            </div>
            ${isActive ? `
            <div class="bp-cc-reserved-wrap">
                <div class="bp-cc-stat">
                    <span class="bp-cc-stat-lbl">محجوز</span>
                    <span class="bp-cc-stat-val reserved">${formatMoneyWithSAR(reserved)}</span>
                </div>
                <div class="bp-cc-stat-sep"></div>
                <div class="bp-cc-stat">
                    <span class="bp-cc-stat-lbl">متبقي</span>
                    <span class="bp-cc-stat-val ${remaining < 0 ? 'over' : 'ok'}">${formatMoneyWithSAR(remaining)}</span>
                </div>
            </div>` : '<div class="bp-cc-reserved-wrap"></div>'}
        </div>`;
    }).join('');

    content.innerHTML = `
        <div class="bp-cc-header-row">
            <span></span>
            <span>مركز التكلفة</span>
            <span>المخصص</span>
            <span>محجوز / متبقي</span>
        </div>
        <div class="bp-cc-rows-wrap">${rows}</div>
        <div class="bp-cc-footer" id="bp-cc-footer-${catId}">
        </div>`;
    content.dataset.loaded = '1';

    if (loading) loading.style.display = 'none';
    content.style.display = 'block';

    // احسب الـ footer بعد ما الـ DOM يكون جاهز
    updateCCFooter(catId);
}

function renderCCFooter(catId) {
    const budgetEl = document.getElementById(`bp-total-${catId}`);
    const total = parseFloat(budgetEl?.value || 0);
    const rows = document.querySelectorAll(`#bp-cc-content-${catId} .bp-cc-amount-input`);
    const alloc = Array.from(rows).reduce((s, el) => {
        const v = parseFloat(el.value || 0);
        return el.disabled ? s : s + v;
    }, 0);
    const pctReal = total > 0 ? Math.round(alloc / total * 100) : 0;
    const isOver = pctReal > 100;
    const pct = Math.min(100, pctReal);
    const diff = total - alloc;
    const barColor = isOver ? '#ef4444' : pct >= 80 ? '#f59e0b' : '#22c55e';
    return `
        <div class="bp-cc-footer-inner">
            <div class="bp-cc-footer-cards">
                <div class="bp-cc-footer-card">
                    <span class="bp-cc-footer-card-lbl">الميزانية الكلية</span>
                    <span class="bp-cc-footer-card-val">${formatMoneyWithSAR(total)}</span>
                </div>
                <div class="bp-cc-footer-card alloc">
                    <span class="bp-cc-footer-card-lbl">الموزع على المراكز</span>
                    <span class="bp-cc-footer-card-val" style="color:${alloc > total ? '#ef4444' : '#22c55e'}">${formatMoneyWithSAR(alloc)}</span>
                </div>
                <div class="bp-cc-footer-card ${diff < 0 ? 'over' : ''}">
                    <span class="bp-cc-footer-card-lbl">${diff < 0 ? '⚠ تجاوز' : 'غير موزع'}</span>
                    <span class="bp-cc-footer-card-val" style="color:${diff < 0 ? '#ef4444' : 'var(--text-muted)'}">${formatMoneyWithSAR(Math.abs(diff))}</span>
                </div>
            </div>
            <div class="bp-cc-footer-bar-wrap">
                <div class="bp-cc-footer-bar-track">
                    <div class="bp-cc-footer-bar-fill" style="width:${pct}%;background:${barColor}"></div>
                </div>
                <span class="bp-cc-footer-bar-pct" style="color:${barColor}">${pctReal}%${isOver ? ' ⚠' : ''}</span>
            </div>
        </div>`;
}

function onCCToggle(catId, ccId, checked) {
    const amtInput = document.getElementById(`bp-cc-amt-${catId}-${ccId}`);
    const row = document.getElementById(`bp-cc-row-${catId}-${ccId}`);
    if (!amtInput) return;
    amtInput.disabled = !checked;
    if (!checked) { amtInput.value = ''; }
    row?.classList.toggle('active', checked);
    markPendingChange(catId, ccId, checked ? parseFloat(amtInput.value || 0) : 0, checked);
    updateCCFooter(catId);
    showSaveBar();
}

function onCCAmountChange(catId, ccId, val) {
    const checked = !document.getElementById(`bp-cc-amt-${catId}-${ccId}`)?.disabled;
    markPendingChange(catId, ccId, parseFloat(val || 0), checked);
    updateCCFooter(catId);
    showSaveBar();
}

function onCatBudgetChange(catId, val) {
    if (!PlanState.pendingChanges[catId]) PlanState.pendingChanges[catId] = { total: 0, ccs: {} };
    PlanState.pendingChanges[catId].total = parseFloat(val || 0);
    updateCCFooter(catId);
    showSaveBar();
}

function markPendingChange(catId, ccId, amount, enabled) {
    if (!PlanState.pendingChanges[catId]) PlanState.pendingChanges[catId] = { total: null, ccs: {} };
    PlanState.pendingChanges[catId].ccs[ccId] = { amount, enabled };
}

function updateCCFooter(catId) {
    const el = document.getElementById(`bp-cc-footer-${catId}`);
    if (el) el.innerHTML = renderCCFooter(catId);
}

function showSaveBar() {
    const curYear = new Date().getFullYear();
    const isAdmin = typeof currentUser !== 'undefined' &&
        (currentUser.permissionLevel === 'system_admin' || currentUser.role === 'admin');
    const isLocked = PlanState.selectedYear !== curYear && !isAdmin;
    if (isLocked) return; // لا تظهر شريط الحفظ للسنوات المقفلة
    const bar = document.getElementById('bp-save-bar');
    if (bar) bar.style.display = 'flex';
}

function filterPlanCategories(q) {
    const term = q.toLowerCase();
    document.querySelectorAll('.bp-cat-row').forEach(row => {
        const text = row.querySelector('.bp-cat-name')?.textContent.toLowerCase() +
            row.querySelector('.bp-cat-code')?.textContent.toLowerCase();
        row.style.display = text.includes(term) ? '' : 'none';
    });
}

function expandAllPlanCategories() {
    const { meta } = PlanState;
    meta.categories.forEach(cat => {
        if (!PlanState.openCategories.has(cat.id)) togglePlanCategory(cat.id);
    });
}

function collapseAllPlanCategories() {
    [...PlanState.openCategories].forEach(id => togglePlanCategory(id));
}

async function saveAllPlanChanges() {
    const curYear = new Date().getFullYear();
    const isAdmin = typeof currentUser !== 'undefined' &&
        (currentUser.permissionLevel === 'system_admin' || currentUser.role === 'admin');
    if (PlanState.selectedYear !== curYear && !isAdmin) {
        showToast('🔒 سنة ' + PlanState.selectedYear + ' مقفلة — يتطلب صلاحية مدير النظام', 'warning');
        return;
    }
    const changes = PlanState.pendingChanges;
    if (!Object.keys(changes).length) return;

    const saveBtn = document.querySelector('#bp-save-bar .btn-primary');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '⏳ جاري الحفظ...'; }

    let errors = 0;
    for (const [catIdStr, change] of Object.entries(changes)) {
        const catId = parseInt(catIdStr);
        const cat = PlanState.meta.categories.find(c => c.id == catId);
        if (!cat) continue;

        // إجمالي الميزانية
        const totalEl = document.getElementById(`bp-total-${catId}`);
        const total = change.total ?? parseFloat(totalEl?.value || 0);
        if (total <= 0 && !Object.values(change.ccs || {}).some(cc => cc.enabled)) continue; // لا شيء

        // مراكز التكلفة المفعّلة
        const ccs = Object.entries(change.ccs || {})
            .filter(([, v]) => v.enabled && v.amount > 0)
            .map(([ccId, v]) => ({ cost_center_id: parseInt(ccId), allocated: v.amount }));

        // هل الخطة موجودة؟
        const existingPlan = PlanState.plans.find(p => p.category_id == catId);

        const payload = {
            id: existingPlan?.id || 0,
            fiscal_year: PlanState.selectedYear,
            category_id: catId,
            total_budget: total,
            notes: '',
            cost_centers: ccs,
        };

        const r = await fetch('api/budget_plan_api.php?action=save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        }).then(r => r.json());

        if (!r.success) errors++;
    }

    if (errors) {
        showToast(`فشل حفظ ${errors} بند`, 'error');
    } else {
        showToast('✅ تم حفظ جميع التغييرات', 'success');
    }

    // إعادة تحميل
    PlanState.pendingChanges = {};
    const openBefore = new Set(PlanState.openCategories);
    await fetchPlans();
    renderPlansPage();
    // إعادة فتح الأقسام
    openBefore.forEach(id => togglePlanCategory(id));
    document.getElementById('bp-save-bar')?.style && (document.getElementById('bp-save-bar').style.display = 'none');
}

function discardPlanChanges() {
    PlanState.pendingChanges = {};
    const openBefore = new Set(PlanState.openCategories);
    PlanState.openCategories = new Set();
    // إعادة رسم بدون إعادة تحميل
    renderPlansPage();
    openBefore.forEach(id => togglePlanCategory(id));
}

// ── Modal إضافة/تعديل خطة ──────────────────────────────────
async function openPlanModal(planId) {
    const { meta } = PlanState;
    let plan = null;
    let existingCCs = [];

    if (planId) {
        const r = await fetch(`api/budget_plan_api.php?action=detail&id=${planId}`).then(r => r.json());
        if (r.success) { plan = r.data; existingCCs = r.data.cost_centers || []; }
    }

    const catOpts = meta.categories
        .filter(c => !planId ? true : true) // كل البنود متاحة للتعديل
        .map(c => `<option value="${c.id}" ${plan && plan.category_id == c.id ? 'selected' : ''}>${c.code} — ${c.name}</option>`)
        .join('');

    // بناء صفوف مراكز التكلفة المخصصة
    const buildCCRows = (ccs) => ccs.map((cc, i) => renderPlanCCRow(cc, i)).join('');

    DOM.modalTitle.innerHTML = planId ? `✏️ تعديل بند الموازنة` : `➕ إضافة بند للموازنة`;
    DOM.modalBody.innerHTML = `
        <div style="display:grid;gap:1rem">
            <div class="form-row-2">
                <div>
                    <label class="form-label">السنة المالية *</label>
                    <input type="number" id="pl_year" class="form-input" value="${plan ? plan.fiscal_year : PlanState.selectedYear}" min="2020" max="2099">
                </div>
                <div>
                    <label class="form-label">البند *</label>
                    <select id="pl_category" class="form-select">${catOpts}</select>
                </div>
            </div>
            <div>
                <label class="form-label">إجمالي ميزانية البند (ريال) *</label>
                <input type="number" id="pl_total" class="form-input" value="${plan ? plan.total_budget : ''}" min="0" step="0.01" placeholder="0.00"
                    oninput="updatePlanAllocSummary()">
            </div>
            <div>
                <label class="form-label">ملاحظات</label>
                <textarea id="pl_notes" class="form-textarea" rows="2">${plan ? (plan.notes || '') : ''}</textarea>
            </div>

            <!-- مراكز التكلفة -->
            <div style="border:1px solid var(--border-color);border-radius:8px;padding:1rem">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem">
                    <strong>توزيع الميزانية على مراكز التكلفة</strong>
                    <button class="btn btn-ghost-sm" onclick="addPlanCCRow()">➕ إضافة مركز</button>
                </div>
                <div id="plan-cc-rows">
                    ${buildCCRows(existingCCs)}
                </div>
                <div id="plan-alloc-summary" style="margin-top:.75rem;font-size:.85rem;color:var(--text-muted)"></div>
            </div>
        </div>`;

    DOM.modalFooter.innerHTML = `
        <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
        <button class="btn btn-primary" onclick="savePlan(${planId || 0})">💾 حفظ</button>`;

    openModal();
    updatePlanAllocSummary();
}

let _planCCIndex = 0;
function renderPlanCCRow(cc, i) {
    _planCCIndex = Math.max(_planCCIndex, i + 1);
    const { meta } = PlanState;
    const ccOpts = meta.cost_centers.map(c =>
        `<option value="${c.id}" data-code="${c.code}" ${cc.cost_center_id == c.id ? 'selected' : ''}>${c.code} — ${c.name}</option>`
    ).join('');
    return `
    <div class="plan-cc-row" id="plan-cc-row-${i}" style="display:grid;grid-template-columns:1fr 160px auto;gap:.5rem;align-items:center;margin-bottom:.5rem">
        <select class="form-select plan-cc-select" data-row="${i}" onchange="updatePlanAllocSummary()">${ccOpts}</select>
        <input type="number" class="form-input plan-cc-amount" data-row="${i}" value="${cc.allocated || 0}"
            min="0" step="0.01" placeholder="المبلغ بالريال" oninput="updatePlanAllocSummary()">
        <button class="btn btn-ghost-sm" style="color:#ef4444" onclick="removePlanCCRow(${i})">🗑</button>
    </div>`;
}

function addPlanCCRow() {
    const container = document.getElementById('plan-cc-rows');
    const i = _planCCIndex++;
    const { meta } = PlanState;
    const ccOpts = meta.cost_centers.map(c =>
        `<option value="${c.id}" data-code="${c.code}">${c.code} — ${c.name}</option>`
    ).join('');
    container.insertAdjacentHTML('beforeend', `
    <div class="plan-cc-row" id="plan-cc-row-${i}" style="display:grid;grid-template-columns:1fr 160px auto;gap:.5rem;align-items:center;margin-bottom:.5rem">
        <select class="form-select plan-cc-select" data-row="${i}" onchange="updatePlanAllocSummary()">${ccOpts}</select>
        <input type="number" class="form-input plan-cc-amount" data-row="${i}" value="0"
            min="0" step="0.01" placeholder="المبلغ بالريال" oninput="updatePlanAllocSummary()">
        <button class="btn btn-ghost-sm" style="color:#ef4444" onclick="removePlanCCRow(${i})">🗑</button>
    </div>`);
    updatePlanAllocSummary();
}

function removePlanCCRow(i) {
    document.getElementById(`plan-cc-row-${i}`)?.remove();
    updatePlanAllocSummary();
}

function updatePlanAllocSummary() {
    const total = parseFloat(document.getElementById('pl_total')?.value || 0);
    const rows = document.querySelectorAll('.plan-cc-amount');
    const alloc = Array.from(rows).reduce((s, el) => s + parseFloat(el.value || 0), 0);
    const remain = total - alloc;
    const el = document.getElementById('plan-alloc-summary');
    if (!el) return;
    el.innerHTML = `
        إجمالي الميزانية: <strong>${formatMoneyWithSAR(total)}</strong> |
        الموزع: <strong style="color:${alloc > total ? '#ef4444' : '#22c55e'}">${formatMoneyWithSAR(alloc)}</strong> |
        غير الموزع: <strong style="color:${remain < 0 ? '#ef4444' : 'var(--text-muted)'}">${formatMoneyWithSAR(remain)}</strong>
        ${alloc > total ? '<span style="color:#ef4444">⚠ المبالغ الموزعة تتجاوز إجمالي الميزانية</span>' : ''}`;
}

async function savePlan(planId) {
    const year = parseInt(document.getElementById('pl_year')?.value || 0);
    const catId = parseInt(document.getElementById('pl_category')?.value || 0);
    const total = parseFloat(document.getElementById('pl_total')?.value || 0);
    const notes = document.getElementById('pl_notes')?.value || '';

    if (!year || !catId) { showToast('السنة والبند مطلوبان', 'error'); return; }

    // جمع مراكز التكلفة
    const ccRows = [];
    document.querySelectorAll('.plan-cc-row').forEach(row => {
        const sel = row.querySelector('.plan-cc-select');
        const amount = row.querySelector('.plan-cc-amount');
        if (sel && amount && parseFloat(amount.value) > 0) {
            ccRows.push({ cost_center_id: parseInt(sel.value), allocated: parseFloat(amount.value) });
        }
    });

    const payload = { id: planId, fiscal_year: year, category_id: catId, total_budget: total, notes, cost_centers: ccRows };
    const r = await fetch('api/budget_plan_api.php?action=save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    }).then(r => r.json());

    if (r.success) {
        showToast('تم الحفظ بنجاح', 'success');
        closeModal();
        await fetchPlans();
        renderPlansPage();
    } else {
        showToast(r.message || 'فشل الحفظ', 'error');
    }
}

async function deletePlan(planId, name) {
    if (!confirm(`حذف بند "${name}" من الموازنة؟ سيتم حذف جميع التوزيعات.`)) return;
    const r = await fetch('api/budget_plan_api.php?action=delete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: planId })
    }).then(r => r.json());
    if (r.success) {
        showToast('تم الحذف', 'success');
        await fetchPlans();
        renderPlansPage();
    } else {
        showToast(r.message, 'error');
    }
}

// ── تفاصيل البند ───────────────────────────────────────────
async function openPlanDetail(planId) {
    const r = await fetch(`api/budget_plan_api.php?action=detail&id=${planId}`).then(r => r.json());
    if (!r.success) { showToast('فشل تحميل البيانات', 'error'); return; }
    const plan = r.data;
    const ccs = plan.cost_centers || [];

    const ccRows = ccs.map(cc => {
        const pct = cc.allocated > 0 ? Math.min(100, Math.round(cc.reserved / cc.allocated * 100)) : 0;
        const barColor = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#22c55e';
        return `<tr>
            <td><span style="font-size:.78rem;color:var(--text-muted)">${cc.cc_code}</span><br>${cc.cc_name}</td>
            <td style="text-align:left">${formatMoneyWithSAR(cc.allocated)}</td>
            <td style="text-align:left">${formatMoneyWithSAR(cc.reserved)}</td>
            <td style="text-align:left;color:${cc.remaining < 0 ? '#ef4444' : 'inherit'}">${formatMoneyWithSAR(cc.remaining)}</td>
            <td>
                <div style="background:var(--bg-surface);border-radius:4px;height:6px;min-width:60px">
                    <div style="background:${barColor};height:6px;border-radius:4px;width:${pct}%"></div>
                </div>
                <span style="font-size:.72rem;color:var(--text-muted)">${pct}%</span>
            </td>
        </tr>`;
    }).join('');

    DOM.modalTitle.innerHTML = `📊 ${plan.category_code} — ${plan.category_name} (${plan.fiscal_year})`;
    DOM.modalBody.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;margin-bottom:1rem">
            <div class="budget-stat-card">
                <div class="bsc-body"><div class="bsc-num">${formatMoneyWithSAR(plan.total_budget)}</div><div class="bsc-label">إجمالي الميزانية</div></div>
            </div>
            <div class="budget-stat-card">
                <div class="bsc-body"><div class="bsc-num" style="color:#f59e0b">${formatMoneyWithSAR(plan.total_reserved)}</div><div class="bsc-label">المحجوز</div></div>
            </div>
            <div class="budget-stat-card">
                <div class="bsc-body"><div class="bsc-num" style="color:${(plan.total_budget - plan.total_reserved) < 0 ? '#ef4444' : '#22c55e'}">${formatMoneyWithSAR(plan.total_budget - plan.total_reserved)}</div><div class="bsc-label">المتبقي</div></div>
            </div>
        </div>
        ${ccs.length ? `
        <div class="table-wrapper" style="max-height:50vh;overflow-y:auto">
            <table class="data-table">
                <thead><tr>
                    <th>مركز التكلفة</th><th>المخصص</th><th>المحجوز</th><th>المتبقي</th><th>الاستهلاك</th>
                </tr></thead>
                <tbody>${ccRows}</tbody>
            </table>
        </div>` : '<p style="text-align:center;color:var(--text-muted)">لا توجد مراكز تكلفة مخصصة</p>'}`;
    DOM.modalFooter.innerHTML = `
        <button class="btn btn-secondary" onclick="closeModal()">إغلاق</button>
        <button class="btn btn-primary" onclick="closeModal();openPlanModal(${planId})">✏️ تعديل</button>`;
    openModal();
}

// ── ربط الحجز بخطة الموازنة ────────────────────────────────
async function loadPlanBudgetInfo(planId, ccCode, excludeId) {
    if (!planId || !ccCode) return null;
    const excl = excludeId ? `&exclude_id=${excludeId}` : '';
    const r = await fetch(`api/budget_plan_api.php?action=cc_budget&plan_id=${planId}&cc_code=${encodeURIComponent(ccCode)}${excl}`).then(r => r.json());
    return r.success ? r.data : null;
}

function renderBudgetInfoBar(info, currency, exchangeRate) {
    if (!info) return '';
    const rate = parseFloat(exchangeRate || 1);
    const allocated = parseFloat(info.allocated);
    const reserved = parseFloat(info.reserved);
    const remaining = parseFloat(info.remaining);
    const pct = allocated > 0 ? Math.min(100, Math.round(reserved / allocated * 100)) : 0;
    const barColor = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#22c55e';

    return `
    <div class="budget-info-bar" style="border:1px solid var(--border-color);border-radius:8px;padding:.75rem 1rem;margin:.75rem 0;background:var(--bg-surface)">
        <div style="font-size:.8rem;font-weight:700;margin-bottom:.5rem;color:var(--text-secondary)">📊 ميزانية البند لهذا المركز</div>
        <div style="display:flex;gap:1.5rem;flex-wrap:wrap;font-size:.82rem">
            <span>الميزانية: <strong>${formatMoneyWithSAR(allocated)}</strong></span>
            <span>المحجوز: <strong style="color:#f59e0b">${formatMoneyWithSAR(reserved)}</strong></span>
            <span>المتبقي: <strong style="color:${remaining < 0 ? '#ef4444' : '#22c55e'}">${formatMoneyWithSAR(remaining)}</strong></span>
            ${currency !== 'SAR' ? `<span style="color:var(--text-muted)">سعر الصرف: <strong>${rate}</strong> ريال</span>` : ''}
        </div>
        <div style="margin-top:.4rem;background:var(--bg-card);border-radius:4px;height:6px">
            <div style="background:${barColor};height:6px;border-radius:4px;width:${pct}%;transition:.3s"></div>
        </div>
        ${remaining < 0 ? `<div style="color:#ef4444;font-size:.78rem;margin-top:.3rem">⚠ تجاوز الميزانية بمقدار ${formatMoneyWithSAR(Math.abs(remaining))}</div>` : ''}
    </div>`;
}


// ═══════════════════════════════════════════════════════════
//  تحميل وعرض بار ميزانية الحجز (يعمل بـ plan_id أو budget_category)
// ═══════════════════════════════════════════════════════════
async function loadReservationBudgetBar(r) {
    const wrap = document.getElementById('rdv2_budget_bar_wrap');
    if (!wrap) return;

    const rate = parseFloat(r.exchange_rate || 1)
    const catCode = r.budget_category || '';
    const ccCode = r.cost_center || '';
    // fiscal_year قد يأتي كـ 26 (2 رقم) أو 2026 (4 أرقام) — نوحّده
    let fiscalYear = parseInt(r.fiscal_year || new Date().getFullYear());
    if (fiscalYear < 100) fiscalYear = 2000 + fiscalYear;

    if (!catCode) return; // لا يوجد بند موازنة

    wrap.innerHTML = `<div style="padding:.5rem 1.5rem;color:var(--text-muted);font-size:.8rem">⏳ جاري تحميل بيانات الموازنة...</div>`;

    let info = null;

    // الحالة 1: الحجز مرتبط مباشرة بـ plan_id + cost_center
    if (r.budget_plan_id && ccCode) {
        info = await loadPlanBudgetInfo(r.budget_plan_id, ccCode, r.id || 0);
    }

    // الحالة 2: لا يوجد plan_id — ابحث تلقائياً من cat_code + cc_code + fiscal_year
    if (!info && catCode && ccCode) {
        const res = await fetch(
            `api/budget_plan_api.php?action=cc_budget_by_category` +
            `&cat_code=${encodeURIComponent(catCode)}` +
            `&cc_code=${encodeURIComponent(ccCode)}` +
            `&fiscal_year=${fiscalYear}` +
            `&exclude_id=${r.id || 0}`
        ).then(r => r.json()).catch(() => null);
        if (res && res.success && res.data) info = res.data;
    }

    // الحالة 3: لا يوجد cost_center — اعرض إجمالي البند فقط
    if (!info && catCode) {
        const res = await fetch(
            `api/budget_plan_api.php?action=cc_budget_by_category` +
            `&cat_code=${encodeURIComponent(catCode)}` +
            `&cc_code=__all__` +
            `&fiscal_year=${fiscalYear}` +
            `&exclude_id=${r.id || 0}`
        ).then(r => r.json()).catch(() => null);
        if (res && res.success && res.data) {
            info = res.data;
            info._allCC = true;
        }
    }

    if (!info) {
        wrap.innerHTML = `<div style="padding:.4rem 1.5rem;font-size:.8rem;color:var(--text-muted)">⚠ لا توجد خطة موازنة لهذا البند في سنة ${fiscalYear}</div>`;
        return;
    }

    const allocated = parseFloat(info.allocated || 0);
    const othersReserved = parseFloat(info.reserved || 0);
    const thisAmount = parseFloat(r.grand_total_sar || (r.currency === 'SAR' ? r.grand_total : (r.grand_total * rate))) || 0;
    const reserved = othersReserved + thisAmount;
    const remaining = allocated - reserved;
    // النسبة الحقيقية بدون تحديد 100
    const pctReal = allocated > 0 ? Math.round(reserved / allocated * 100) : 0;
    const isOverflow = pctReal > 100;
    const pctLabel = isOverflow ? `${pctReal}% مُستخدم (تجاوز ${pctReal - 100}%)` : `${pctReal}% مُستخدم`;
    // للشريط نحدد بـ 100
    const pct = Math.min(100, pctReal);
    const othersPct = allocated > 0 ? Math.min(100, Math.round(othersReserved / allocated * 100)) : 0;
    const thisPct = allocated > 0 ? Math.min(100, Math.round(thisAmount / allocated * 100)) : 0;
    const barColor = isOverflow ? '#ef4444' : pctReal >= 90 ? '#ef4444' : pctReal >= 70 ? '#f59e0b' : '#22c55e';
    const isTotal = info.scope === 'category_total' || info._allCC;
    const scopeLabel = isTotal ? 'إجمالي البند' : 'مركز التكلفة ' + ccCode;

    wrap.innerHTML = `
    <div style="margin:.5rem 1.5rem 0">
        <div style="border:1px solid var(--border-color);border-radius:10px;padding:.9rem 1.1rem;
                    background:var(--bg-surface);margin-bottom:.5rem">

            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.6rem">
                <span style="font-size:.82rem;font-weight:700;color:var(--text-secondary)">
                    📊 ميزانية ${info.category_name || catCode} — ${scopeLabel}
                </span>
                <span style="font-size:.75rem;color:var(--text-muted)">
                    سنة ${info.fiscal_year || fiscalYear}
                </span>
            </div>

            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:.5rem;margin-bottom:.7rem">
                <div style="text-align:center;padding:.5rem;background:var(--bg-card);border-radius:8px">
                    <div style="font-size:.72rem;color:var(--text-muted);margin-bottom:.2rem">الميزانية المخصصة</div>
                    <div style="font-size:.95rem;font-weight:700;color:var(--text-primary)">${formatMoneyWithSAR(allocated)}</div>
                    <div style="font-size:.7rem;color:var(--text-muted)" class="sar-symbol"></div>
                </div>
                <div style="text-align:center;padding:.5rem;background:var(--bg-card);border-radius:8px">
                    <div style="font-size:.72rem;color:var(--text-muted);margin-bottom:.2rem">المحجوز</div>
                    <div style="font-size:.95rem;font-weight:700;color:#f59e0b">${formatMoneyWithSAR(reserved)}</div>
                    <div style="font-size:.7rem;color:var(--text-muted)">${pct}% من الميزانية</div>
                    ${othersReserved > 0 ? `
                    <div style="margin-top:5px">
                        <button onclick="toggleRelatedReservations(event,'${r.budget_category}','${r.cost_center}',${fiscalYear},${r.id || 0})"
                                style="display:inline-flex;align-items:center;gap:5px;
                                       background:rgba(99,102,241,.08);border:1px solid rgba(99,102,241,.25);
                                       border-radius:20px;padding:3px 10px;cursor:pointer;
                                       color:#6366f1;font-size:.67rem;font-weight:600;
                                       transition:background .15s,border-color .15s"
                                onmouseover="this.style.background='rgba(99,102,241,.15)'"
                                onmouseout="this.style.background='rgba(99,102,241,.08)'">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                                <circle cx="9" cy="7" r="4"/>
                                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                            </svg>
                            ${formatMoneyWithSAR(othersReserved)} — ${othersReserved > 0 ? 'حجوزات أخرى' : ''}
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
                                 style="transition:transform .2s">
                                <polyline points="6 9 12 15 18 9"/>
                            </svg>
                        </button>
                    </div>
                    ` : ''}
                </div>
                <div style="text-align:center;padding:.5rem;background:var(--bg-card);border-radius:8px">
                    <div style="font-size:.72rem;color:var(--text-muted);margin-bottom:.2rem">المتبقي</div>
                    <div style="font-size:.95rem;font-weight:700;color:${remaining < 0 ? '#ef4444' : '#22c55e'}">${formatMoneyWithSAR(remaining)}</div>
                    <div style="font-size:.7rem;color:${remaining < 0 ? '#ef4444' : 'var(--text-muted)'}">
                        ${remaining < 0 ? '⚠ تجاوز الميزانية' : 'متاح'}
                    </div>
                </div>
            </div>

            <!-- شريط نسبة الاستخدام -->
            <div style="background:var(--bg-card);border-radius:6px;height:10px;overflow:hidden;margin-bottom:.3rem;display:flex;position:relative">
                <div style="background:#f59e0b;height:100%;width:${othersPct}%;transition:.4s" title="محجوز من حجوزات أخرى"></div>
                <div style="background:${barColor};height:100%;width:${Math.min(thisPct, 100 - othersPct)}%;transition:.4s" title="هذا الحجز"></div>
                ${isOverflow ? `<div style="position:absolute;right:0;top:0;height:100%;width:8px;background:repeating-linear-gradient(45deg,#ef4444,#ef4444 2px,transparent 2px,transparent 6px)" title="تجاوز الميزانية"></div>` : ''}
            </div>
            <div style="display:flex;justify-content:space-between;font-size:.72rem;color:var(--text-muted)">
                <span>${formatMoneyWithSAR(allocated)}</span>
                <span style="color:${barColor};font-weight:600">${pctLabel}</span>
                <span>${reserved > 0 ? formatMoneyWithSAR(reserved) : '0'}</span>
            </div>

            ${thisAmount > 0 ? `
            <!-- حصة هذا الحجز -->
            <div style="margin-top:.6rem;padding:.5rem .75rem;background:rgba(99,179,237,.1);
                        border:1px solid rgba(99,179,237,.3);border-radius:7px;
                        display:flex;justify-content:space-between;align-items:center;font-size:.8rem">
                <span style="color:var(--text-secondary)">💼 قيمة هذا الحجز:</span>
                <span style="font-weight:700;color:var(--accent-blue)">${formatMoneyWithSAR(thisAmount)}
                    <span style="font-weight:400;color:var(--text-muted)">(${thisPct}% من الميزانية)</span>
                </span>
            </div>` : ''}

            ${othersReserved > 0 ? `<div id="related_res_panel" style="display:none;margin-top:.6rem"></div>` : ''}
        </div>
    </div>`;
}

// ══════════════════════════════════════════════════════════════
//  الحجوزات المرتبطة بنفس البند
// ══════════════════════════════════════════════════════════════
async function toggleRelatedReservations(event, catCode, ccCode, fiscalYear, excludeId) {
    event.stopPropagation();
    const panel = document.getElementById('related_res_panel');
    if (!panel) return;

    // الزر دائماً هو closest button
    const btn = event.target.closest('button');
    const arrow = btn?.querySelector('svg:last-child');

    if (panel.style.display !== 'none') {
        panel.style.display = 'none';
        if (arrow) arrow.style.transform = '';
        return;
    }

    if (arrow) arrow.style.transform = 'rotate(180deg)';
    panel.style.display = 'block';
    panel.innerHTML = '<div style="padding:.5rem 0;font-size:.75rem;color:var(--text-muted)">⏳ جاري التحميل...</div>';

    const statusColors = {
        'معتمد': '#22c55e',
        'قيد المراجعة': '#f59e0b',
        'منفذ': '#8b5cf6',
        'مرفوض': '#ef4444',
        'ملغى': '#6b7280',
        'مسودة': '#94a3b8',
    };

    try {
        const res = await fetch(
            `api/budget_plan_api.php?action=related_reservations` +
            `&cat_code=${encodeURIComponent(catCode)}` +
            `&cc_code=${encodeURIComponent(ccCode || '__all__')}` +
            `&fiscal_year=${fiscalYear}` +
            `&exclude_id=${excludeId}`
        ).then(r => r.json());

        if (!res.success || !res.data.length) {
            panel.innerHTML = '<div style="padding:.4rem 0;font-size:.75rem;color:var(--text-muted)">لا توجد حجوزات أخرى</div>';
            return;
        }

        const rows = res.data.map(row => {
            const color = statusColors[row.status] || '#94a3b8';
            return `
            <tr onclick="openReservationDetails(${row.id})"
                style="cursor:pointer;border-bottom:1px solid var(--border-color);transition:background .12s"
                onmouseover="this.style.background='var(--bg-surface)'"
                onmouseout="this.style.background='transparent'">
                <td style="padding:7px 10px">
                    <span style="font-family:monospace;font-size:.78rem;font-weight:700;color:#6366f1">${row.reservation_number}</span>
                </td>
                <td style="padding:7px 10px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.78rem;color:var(--text-primary)">${row.purpose}</td>
                <td style="padding:7px 10px;font-size:.75rem;color:var(--text-muted);white-space:nowrap">${row.department_name || '—'}</td>
                <td style="padding:7px 10px;font-size:.72rem;color:var(--text-muted);white-space:nowrap;font-family:monospace">${row.cost_center || '—'}</td>
                <td style="padding:7px 10px;font-size:.78rem;font-weight:600;direction:ltr;text-align:left;white-space:nowrap">${formatMoneyWithSAR(row.grand_total_sar || row.grand_total)}</td>
                <td style="padding:7px 10px">
                    <span style="display:inline-flex;align-items:center;gap:4px;font-size:.7rem;font-weight:500;
                                 padding:2px 8px;border-radius:20px;background:${color}18;color:${color};white-space:nowrap">
                        <span style="width:5px;height:5px;border-radius:50%;background:${color};flex-shrink:0"></span>
                        ${row.status}
                    </span>
                </td>
            </tr>`;
        }).join('');

        panel.innerHTML = `
        <div style="background:var(--bg-card);border-radius:8px;overflow:hidden;border:1px solid var(--border-color)">
            <div style="padding:6px 10px;background:var(--bg-surface);border-bottom:1px solid var(--border-color);
                        display:flex;align-items:center;justify-content:space-between">
                <span style="font-size:.72rem;font-weight:600;color:var(--text-secondary)">حجوزات أخرى على نفس البند</span>
                <span style="font-size:.68rem;color:var(--text-muted)">${res.data.length} حجز</span>
            </div>
            <div style="overflow-x:auto">
                <table style="width:100%;border-collapse:collapse;direction:rtl">
                    <thead>
                        <tr style="background:var(--bg-surface);border-bottom:1px solid var(--border-color)">
                            <th style="padding:6px 10px;font-size:.68rem;font-weight:600;color:var(--text-secondary);text-align:right;white-space:nowrap">رقم الحجز</th>
                            <th style="padding:6px 10px;font-size:.68rem;font-weight:600;color:var(--text-secondary);text-align:right">الغرض</th>
                            <th style="padding:6px 10px;font-size:.68rem;font-weight:600;color:var(--text-secondary);text-align:right;white-space:nowrap">القسم</th>
                            <th style="padding:6px 10px;font-size:.68rem;font-weight:600;color:var(--text-secondary);text-align:right;white-space:nowrap">مركز التكلفة</th>
                            <th style="padding:6px 10px;font-size:.68rem;font-weight:600;color:var(--text-secondary);text-align:right;white-space:nowrap">المبلغ</th>
                            <th style="padding:6px 10px;font-size:.68rem;font-weight:600;color:var(--text-secondary);text-align:right;white-space:nowrap">الحالة</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        </div>`;
    } catch (e) {
        panel.innerHTML = '<div style="color:#ef4444;font-size:.75rem;padding:.4rem 0">خطأ في التحميل</div>';
    }
}