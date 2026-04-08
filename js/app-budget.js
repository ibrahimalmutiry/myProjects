/**
 * app-budget.js — شاشة الحجوزات المالية والموازنة التقديرية
 * ════════════════════════════════════════════════════════════
 * الإصلاحات المطبّقة:
 *  1. إضافة DOM.modalFooter في initDOM + HTML
 *  2. إزالة تكرار CSS (bp-year-picker-styles مدمج في injectBudgetStyles)
 *  3. إصلاح سلاسل tr() المختلطة مع template literals
 *  4. إضافة try/catch لـ fetchPlans و fetchPlanMeta
 *  5. تحويل window._planDistMode و _planCCIndex إلى متغيرات مغلقة
 *  6. openPlanModal يُضاف modal-footer للـ DOM إن لم يكن موجوداً
 */

// ── حالة الشاشة ────────────────────────────────────────────
const BudgetState = {
    reservations: [],
    meta: { departments: [], suppliers: [], transactions: [], cost_centers: [], budget_categories: [] },
    filter: { status: '', department_id: '', fiscal_year: '', search: '' },
    currentStep: 1,
    loaded: false,
    activeTab: 'reservations',
};

const BudgetPagState = {
    page: 1,
    perPage: 25,
    total: 0,
    pages: 0,
};

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
    openCategories: new Set(),
    pendingChanges: {},
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

let _rfCurrency = 'SAR';
let _rfItems = [];

// ── متغيرات مودال الخطة (مغلقة) ────────────────────────────
let _planDistMode = 'pct';
let _planCCIndex = 0;

// ═══════════════════════════════════════════════════════════════
//  تهيئة DOM — يجب استدعاؤها من initDOM() في app-common.js
// ═══════════════════════════════════════════════════════════════
function initBudgetDOM() {
    // يُستدعى بعد DOMContentLoaded — يُضاف هنا لأن initDOM() في app-common قد لا تشمل modalFooter
    if (!DOM.modalFooter) {
        DOM.modalFooter = document.getElementById('modal-footer');
    }
}

// ── ضمان وجود modal-footer في DOM ──────────────────────────
function _ensureModalFooter() {
    if (DOM.modalFooter) return;
    const modal = document.querySelector('.modal');
    if (!modal) return;
    let footer = document.getElementById('modal-footer');
    if (!footer) {
        footer = document.createElement('div');
        footer.id = 'modal-footer';
        footer.className = 'modal-footer';
        modal.appendChild(footer);
    }
    DOM.modalFooter = footer;
}

// ═══════════════════════════════════════════════════════════════
//  نقطة الدخول
// ═══════════════════════════════════════════════════════════════
async function loadBudgetReservationsPage() {
    DOM.mainContent.innerHTML = `
        <div class="budget-page-wrap">
            <div style="text-align:center;padding:3rem">
                <div class="spinner"></div>
                <p style="margin-top:1rem;color:var(--text-muted)">جاري التحميل...</p>
            </div>
        </div>`;

    injectBudgetStyles();

    await Promise.all([
        fetchReservations(),
        fetchBudgetMeta(),
    ]);

    if (!PlanState.plans.length) {
        try {
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
        } catch (e) { console.error('fetchPlans on load:', e); }
    }

    BudgetState.loaded = true;

    if (BudgetState.activeTab === 'plans') {
        await loadBudgetPlansTab();
    } else {
        renderBudgetPage();
    }
}

async function switchBudgetMainTab(tab) {
    BudgetState.activeTab = tab;
    if (!BudgetState.loaded) return;
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

    const isAdmin = (typeof currentUser !== 'undefined') &&
        (currentUser.permissionLevel === 'system_admin' || currentUser.role === 'admin' || currentUser.role === 'budget');
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

// ── Pagination ──────────────────────────────────────────────
function renderBudgetPagination() {
    const { page, pages, total, perPage } = BudgetPagState;
    if (!total) return '';

    const from = Math.min(total, (page - 1) * perPage + 1);
    const to = Math.min(total, page * perPage);
    const isFirst = page === 1;
    const isLast = page === pages;

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
            : `<button class="tx-pag-btn ${n === page ? 'tx-pag-btn--active' : ''}" onclick="budgetGoToPage(${n})">${n}</button>`
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
    BudgetPagState.page = 1;
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
    _rfCurrency = 'SAR';
    _rfItems = Array.from({ length: 5 }, () => ({ description: '', qty: 1, unit: 'قطعة', price: 0 }));
    Object.keys(_budgetFormData).forEach(k => delete _budgetFormData[k]);
    DOM.modalTitle.textContent = '📋 حجز جديد';
    DOM.modalBody.innerHTML = renderReservationForm();
    document.querySelector('.modal')?.classList.add('budget-modal-wide');
    openModal();
    requestAnimationFrame(() => {
        initSearchableSelects();
        initCurrencySelectListener();
    });
}

function openAddReservationModalWithData(prData) {
    BudgetState.currentStep = 1;
    _rfCurrency = prData.currency || 'SAR';
    _rfItems = [{ description: prData.title || prData.items_description || '', qty: 1, unit: 'قطعة', price: parseFloat(prData.total_amount) || 0 }];
    while (_rfItems.length < 5) _rfItems.push({ description: '', qty: 1, unit: 'قطعة', price: 0 });

    Object.keys(_budgetFormData).forEach(k => delete _budgetFormData[k]);
    _budgetFormData['rf_purpose'] = prData.title || '';
    _budgetFormData['rf_notes'] = `مرتبط بطلب الشراء ${prData.request_number}`;
    _budgetFormData['rf_priority'] = prData.priority === 'urgent' ? 'عاجل' : 'عادي';
    _budgetFormData['rf_currency'] = _rfCurrency;
    _budgetFormData['rf_exchange_rate'] = 1;
    _budgetFormData['rf_request_date'] = new Date().toISOString().split('T')[0];
    _budgetFormData['source_pr_id'] = prData.id;
    _budgetFormData['source_pr_number'] = prData.request_number;
    if (prData.department_id) _budgetFormData['rf_department_id'] = prData.department_id;

    DOM.modalTitle.textContent = `📋 حجز جديد — ${prData.request_number}`;
    DOM.modalBody.innerHTML = renderReservationForm();
    document.querySelector('.modal')?.classList.add('budget-modal-wide');
    openModal();
    requestAnimationFrame(() => {
        initSearchableSelects();
        initCurrencySelectListener();
    });
}

async function editReservation(id) {
    // جلب بيانات الحجز الحالي
    const res = await fetch(`api/budget.php?action=get&id=${id}`);
    const data = await res.json();
    if (!data.success) { showToast('❌ تعذّر تحميل بيانات الحجز', 'error'); return; }
    const r = data.data;

    // تهيئة الحالة بنفس بيانات الحجز
    BudgetState.currentStep = 1;
    BudgetState.editingId = id;   // علامة أننا في وضع التعديل
    _rfCurrency = r.currency || 'SAR';

    // تحميل الأصناف من جدول budget_reservation_items
    _rfItems = (r.items && r.items.length)
        ? r.items.map(it => ({
            description: it.description || '',
            qty: parseFloat(it.qty) || 1,
            unit: it.unit || 'قطعة',
            price: parseFloat(it.unit_price) || 0,
        }))
        : Array.from({ length: 5 }, () => ({ description: '', qty: 1, unit: 'قطعة', price: 0 }));
    while (_rfItems.length < 5) _rfItems.push({ description: '', qty: 1, unit: 'قطعة', price: 0 });

    // تعبئة _budgetFormData ببيانات الحجز الحالية
    Object.keys(_budgetFormData).forEach(k => delete _budgetFormData[k]);
    _budgetFormData['rf_purpose'] = r.purpose || '';
    _budgetFormData['rf_priority'] = r.priority || 'عادي';
    _budgetFormData['rf_budget_category'] = r.budget_category || '';
    _budgetFormData['rf_cost_center'] = r.cost_center || '';
    _budgetFormData['rf_supplier_id'] = r.supplier_id || '';
    _budgetFormData['rf_supplier_name_manual'] = r.supplier_name_manual || '';
    _budgetFormData['rf_quotation_number'] = r.quotation_number || '';
    _budgetFormData['rf_quotation_date'] = r.quotation_date || '';
    _budgetFormData['rf_currency'] = _rfCurrency;
    _budgetFormData['rf_exchange_rate'] = r.exchange_rate || 1;
    _budgetFormData['rf_request_date'] = (r.request_date || '').slice(0, 10);
    _budgetFormData['rf_department_id'] = r.department_id || '';

    DOM.modalTitle.textContent = `✏️ تعديل الحجز — ${r.reservation_number}`;
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

    if (step === 1) {
        const savedCC = _budgetFormData['rf_cost_center'] || '';
        const savedDept = savedCC ? (ccList.find(c => c.code === savedCC)?.name || '') : '';
        formBody = `
            <div class="res-form-grid">
                <div class="res-form-group">
                    <label>مركز التكلفة <span class="req">*</span></label>
                    ${searchableSelect({
            id: 'rf_cost_center', placeholder: 'ابحث بالرقم أو الاسم...', value: savedCC,
            options: [{ value: '', label: '-- اختر مركز التكلفة --' }, ...ccList.map(c => ({ value: c.code, label: `${c.code} — ${c.name}` }))]
        })}
                </div>
                <div class="res-form-group">
                    <label>القسم الطالب</label>
                    <div class="dept-auto-field" id="rf_department_display">
                        ${savedDept
                ? `<span class="dept-auto-value">${savedDept}</span>`
                : `<span class="dept-auto-placeholder">يتعبّأ تلقائياً عند اختيار مركز التكلفة</span>`}
                    </div>
                    <input type="hidden" id="rf_department_id"   value="${_budgetFormData['rf_department_id'] || ''}">
                    <input type="hidden" id="rf_department_name" value="${savedDept}">
                </div>
                <div class="res-form-group">
                    <label>بند الموازنة</label>
                    ${searchableSelect({
                    id: 'rf_budget_category', placeholder: 'ابحث عن البند...', value: _budgetFormData['rf_budget_category'] || '',
                    options: [{ value: '', label: '-- اختر البند --' },
                    ...catList.map(c => ({ value: c.code || c.name, label: c.code ? `${c.code} — ${c.name}` : c.name }))]
                })}
                </div>
                <div class="res-form-group">
                    <label>خطة الموازنة التقديرية</label>
                    ${searchableSelect({
                    id: 'rf_budget_plan_id', placeholder: 'ابحث عن خطة الموازنة...', value: String(_budgetFormData['rf_budget_plan_id'] || ''),
                    options: [{ value: '', label: '-- بدون ربط بخطة --' },
                    ...(PlanState.plans || []).map(p => ({ value: String(p.id), label: (p.category_code ? p.category_code + ' — ' : '') + p.category_name + ' (' + p.fiscal_year + ')' }))]
                })}
                </div>
                <div class="res-form-group full" id="rf_budget_info_wrap"></div>
                <div class="res-form-group">
                    <label>الأولوية</label>
                    ${searchableSelect({
                    id: 'rf_priority', placeholder: 'اختر الأولوية', value: _budgetFormData['rf_priority'] || 'عادي',
                    options: [{ value: 'عادي', label: 'عادي' }, { value: 'عاجل', label: 'عاجل ⚡' }, { value: 'حرج', label: 'حرج 🔴' }]
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

    if (step === 2) {
        formBody = `
            <div class="res-form-grid">
                <div class="res-form-group full">
                    <label>المورد</label>
                    ${searchableSelect({
            id: 'rf_supplier_id', placeholder: 'ابحث عن المورد...', value: _budgetFormData['rf_supplier_id'] || '',
            options: [{ value: '', label: '-- اختر من القائمة أو أدخل يدوياً --' },
            ...suppliers.map(s => ({ value: String(s.id), label: `${s.name} (${s.cr_number || '—'})` })),
            { value: 'manual', label: '➕ مورد غير موجود في القائمة' }]
        })}
                </div>
                <div class="res-form-group full" id="rf_manual_supplier_wrap" style="display:none">
                    <label>اسم المورد <span class="req">*</span></label>
                    <input type="text" class="form-input" id="rf_supplier_name_manual" placeholder="أدخل اسم المورد">
                    <small style="color:var(--text-muted);font-size:.74rem">💡 سيتم إضافة هذا المورد لقاعدة البيانات عند حفظ الحجز</small>
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
            <input class="form-input" style="flex:3;min-width:140px" placeholder="وصف الصنف…"
                value="${item.description || ''}" oninput="updateItem(${i},'description',this.value)">
            <input class="form-input" type="number" min="1" style="flex:.7;min-width:55px;text-align:center"
                value="${item.qty || 1}" oninput="updateItem(${i},'qty',+this.value);refreshTotals()">
            <select class="form-select" style="flex:1;min-width:80px" onchange="updateItem(${i},'unit',this.value)">
                ${units.map(u => `<option ${item.unit === u ? 'selected' : ''}>${u}</option>`).join('')}
            </select>
            <input class="form-input" type="number" min="0" step="0.01"
                style="flex:1.1;min-width:85px;text-align:center;direction:ltr"
                value="${item.price || 0}" oninput="updateItem(${i},'price',+this.value);refreshTotals()">
            <div class="rf-item-line-total" id="rf_line_${i}"
                 style="flex:1;min-width:80px;font-weight:600;font-size:.84rem;color:var(--accent-blue);text-align:center;direction:ltr">
                ${fmtMoneyCur(calcLineTotal(item), _rfCurrency)}
            </div>
            <button class="rf-del-row" onclick="removeItemRow(${i})" title="حذف الصف">✕</button>
        </div>`;
}

function calcLineTotal(item) { return ((item.qty || 0) * (item.price || 0)).toFixed(2); }

function renderTotalsBox() {
    let total = 0;
    _rfItems.forEach(it => { total += (it.qty || 0) * (it.price || 0); });
    return `<div class="rf-total-row grand">
        <span>الإجمالي الكلي</span>
        <span>${fmtMoneyCur(total, _rfCurrency)} <span class="rf-cur-badge">${_rfCurrency}</span></span>
    </div>`;
}

function _onCurrencyChange(val) {
    if (val && typeof val === 'object') val = val.target?.value || val.value || 'SAR';
    _rfCurrency = val || 'SAR';
    _budgetFormData['rf_currency'] = _rfCurrency;
    refreshTotals();
    document.querySelectorAll('.rf-currency-live').forEach(el => {
        el.textContent = getCurrencySymbol(val) + ' ' + val;
    });
    const wrap = document.getElementById('rf_exchange_rate_wrap');
    if (wrap) wrap.style.display = val !== 'SAR' ? '' : 'none';
    refreshBudgetInfoBar();
}

function initCurrencySelectListener() {
    const el = document.getElementById('rf_currency');
    if (el) {
        el.addEventListener('change', e => _onCurrencyChange(e.target.value));
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
    if (_rfItems.length <= 1) { showToast('⚠️ يجب الإبقاء على صف واحد على الأقل', 'warning'); return; }
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
    const suppEl = document.getElementById('rf_supplier_id');
    if (suppEl) suppEl.addEventListener('change', () => onSupplierChange(suppEl));
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

async function autoLinkBudgetPlan() {
    const catCode = document.getElementById('rf_budget_category')?._selectedValue || _budgetFormData['rf_budget_category'] || '';
    const ccCode = document.getElementById('rf_cost_center')?._selectedValue || _budgetFormData['rf_cost_center'] || '';
    const planSelect = document.getElementById('rf_budget_plan_id');
    if (!catCode) { await refreshBudgetInfoBar(); return; }

    const plans = PlanState.plans || [];
    const match = plans.find(p =>
        p.category_code === catCode || p.category_name === catCode ||
        p.category_code === catCode.split(' — ')[0]
    );
    if (match) {
        _budgetFormData['rf_budget_plan_id'] = String(match.id);
        if (planSelect) {
            planSelect.value = String(match.id);
            const trigger = planSelect.closest('.ss-wrap')?.querySelector('.ss-display');
            if (trigger) {
                trigger.textContent = (match.category_code ? match.category_code + ' — ' : '') + match.category_name + ' (' + match.fiscal_year + ')';
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
    const ccCode = document.getElementById('rf_cost_center')?._selectedValue || _budgetFormData['rf_cost_center'];
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
        source_pr_id: _budgetFormData['source_pr_id'] || null,
        source_pr_number: _budgetFormData['source_pr_number'] || null,
    };

    // وضع التعديل: نرسل لـ edit بدل add
    const isEditing = !!BudgetState.editingId;
    if (isEditing) body.id = BudgetState.editingId;

    try {
        const action = isEditing ? 'edit' : 'add';
        const res = await fetch(`api/budget.php?action=${action}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await res.json();
        if (data.success) {
            BudgetState.editingId = null;
            showToast(isEditing ? `✅ تم حفظ التعديلات وإعادة تقديم الحجز` : `✅ تم إنشاء الحجز رقم ${data.number}`, 'success');
            if (_budgetFormData['source_pr_id'] && data.id) {
                await fetch('api/purchase_requests_api.php?action=link_reservation', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ request_id: _budgetFormData['source_pr_id'], reservation_id: data.id, reservation_number: data.number }),
                }).catch(() => { });
                delete _budgetFormData['source_pr_id'];
                delete _budgetFormData['source_pr_number'];
            }
            if (data.new_supplier_id) {
                BudgetState.meta.suppliers.push({ id: data.new_supplier_id, name: body.supplier_name_manual });
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
//  تفاصيل الحجز
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

        let rawItems = null;
        if (Array.isArray(r.items) && r.items.length) {
            rawItems = r.items;
        } else if (r.items_json) {
            try { rawItems = JSON.parse(r.items_json); } catch { rawItems = null; }
        }
        if (!rawItems || !rawItems.length) {
            const descText = (r.items_description || '').trim();
            if (descText) {
                rawItems = descText.split(/\n/).map(line => {
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
            itemsRows = `<tr class="rv-item-row">
                <td class="rv-item-num">1</td>
                <td class="rv-item-desc" colspan="4">${r.items_description || r.purpose || '—'}</td>
                <td class="rv-item-total">${fmtMoneyCur(parseFloat(r.grand_total || 0), r.currency)}</td>
            </tr>`;
        }

        const logColors = { create: '#3b82f6', review: '#f59e0b', approve: '#10b981', reject: '#ef4444' };
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

        const dtLabels = { 'to_payment': 'دفع مباشر', 'to_purchase_order': 'أمر شراء / تعميد', 'to_requester': 'إعادة لجهة طالبة' };
        const dtColors = { 'to_payment': '#10b981', 'to_purchase_order': '#f59e0b' };

        const actionBtns = [];
        if (canDo('reservation.review') && r.status === 'قيد المراجعة') {
            actionBtns.push(`<button class="rdv2-tool-btn rdv2-review-btn" onclick="closeModal();openReviewModal(${id})">✅ مراجعة وإجراء</button>`);
        }
        if (canDo('reservation.add') && (r.status === 'مسودة' || r.status === 'مرفوض')) {
            actionBtns.push(`<button class="rdv2-tool-btn" onclick="closeModal();editReservation(${id})">✏️ تعديل</button>`);
        }

        DOM.modalBody.innerHTML = `
        <div class="rdv2-shell">
            <div class="rdv2-toolbar">
                <div class="rdv2-toolbar-left">
                    <button class="rdv2-tool-btn rdv2-print-btn" onclick="window.print()">🖨 طباعة</button>
                </div>
                <div class="rdv2-toolbar-right">${actionBtns.join('')}</div>
            </div>
            <div class="rdv2-doc">
                <div class="rdv2-doc-header">
                    <div class="rdv2-doc-logo">
                        <div class="rdv2-org-name">نظام إدارة المعاملات</div>
                        <div class="rdv2-org-sub">إدارة الحجوزات المالية</div>
                    </div>
                    <div class="rdv2-doc-id-block">
                        <div class="rdv2-doc-num">${r.reservation_number}</div>
                        <div class="rdv2-doc-date">${(r.request_date || '').slice(0, 10)}</div>
                        <div class="rdv2-doc-badges">
                            <span class="rdv2-status-badge" style="background:${st.bg};color:${st.color}">${st.icon} ${r.status}</span>
                            <span class="rdv2-prio-badge" style="background:${prio.bg};color:${prio.color}">${prio.icon} ${prio.label}</span>
                        </div>
                    </div>
                </div>
                <div id="rdv2_budget_bar_wrap"></div>
                <div class="rdv2-divider"></div>
                <div class="rdv2-info-grid">
                    <div class="rdv2-info-cell rdv2-span2">
                        <div class="rdv2-info-lbl">الغرض من الشراء</div>
                        <div class="rdv2-info-val rdv2-purpose">${r.purpose}</div>
                    </div>
                    <div class="rdv2-info-cell">
                        <div class="rdv2-info-lbl">القسم الطالب</div>
                        <div class="rdv2-info-val">${r.department_name || '—'}</div>
                    </div>
                    <div class="rdv2-info-cell">
                        <div class="rdv2-info-lbl">مركز التكلفة</div>
                        <div class="rdv2-info-val rdv2-mono">${r.cost_center || '—'}</div>
                    </div>
                    <div class="rdv2-info-cell">
                        <div class="rdv2-info-lbl">المورد</div>
                        <div class="rdv2-info-val">${r.supplier_name || '—'}</div>
                    </div>
                    <div class="rdv2-info-cell">
                        <div class="rdv2-info-lbl">رقم عرض السعر</div>
                        <div class="rdv2-info-val rdv2-mono">${r.quotation_number || '—'}</div>
                    </div>
                    ${r.budget_category ? `
                    <div class="rdv2-info-cell">
                        <div class="rdv2-info-lbl">بند الموازنة</div>
                        <div class="rdv2-info-val rdv2-mono">${r.budget_category}</div>
                    </div>` : ''}
                    ${r.transaction_number ? `
                    <div class="rdv2-info-cell">
                        <div class="rdv2-info-lbl">المعاملة المرتبطة</div>
                        <div class="rdv2-info-val"><span class="rdv2-tx-tag">${r.transaction_number}</span></div>
                    </div>` : ''}
                </div>
                <div class="rdv2-divider"></div>
                <div class="rdv2-section-title">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
                    الأصناف والمبالغ
                </div>
                <table class="rdv2-items-tbl">
                    <thead><tr>
                        <th>#</th><th>الوصف</th><th>الكمية</th><th>الوحدة</th><th>سعر الوحدة</th><th>الإجمالي</th>
                    </tr></thead>
                    <tbody>${itemsRows}</tbody>
                    <tfoot><tr>
                        <td colspan="4"></td>
                        <td style="font-weight:700;font-size:.8rem;text-align:right">الإجمالي الكلي</td>
                        <td style="font-weight:800;color:#1e40af;text-align:right;direction:ltr">
                            ${fmtMoneyCur(parseFloat(r.grand_total || grandTotalFromItems || 0), r.currency)}
                            ${r.currency !== 'SAR' ? `<div style="font-size:.7rem;color:#64748b">${formatMoneyWithSAR(r.grand_total_sar || 0)}</div>` : ''}
                        </td>
                    </tr></tfoot>
                </table>
                <div class="rdv2-lower-grid">
                    <div class="rdv2-panel rdv2-panel-dispatch">
                        <div class="rdv2-panel-head">التوجيه والتنفيذ</div>
                        ${r.dispatch_type
                ? `<span class="rdv2-dispatch-badge-lg" style="background:${(dtColors[r.dispatch_type] || '#6b7280') + '20'};color:${dtColors[r.dispatch_type] || '#6b7280'}">${dtLabels[r.dispatch_type] || r.dispatch_type}</span>`
                : `<div class="rdv2-dispatch-empty"><span>⏳</span><span>لم يُحدَّد بعد</span></div>`}
                        ${r.budget_notes ? `<div style="font-size:.78rem;color:#475569;margin-top:.5rem">${r.budget_notes}</div>` : ''}
                        ${r.rejection_reason ? `<div class="rdv2-rejection-bar">سبب الرفض: ${r.rejection_reason}</div>` : ''}
                    </div>
                    <div class="rdv2-panel rdv2-log-panel">
                        <div class="rdv2-panel-head">سجل الأحداث</div>
                        <div class="rdv2-log-scroll">${logHtml}</div>
                    </div>
                </div>
            </div>
        </div>`;

        loadReservationBudgetBar(r);
    } catch (e) {
        DOM.modalBody.innerHTML = '<p style="color:var(--accent-red);padding:2rem;text-align:center">خطأ في تحميل البيانات</p>';
        console.error(e);
    }
}

// ── مودال المراجعة ──────────────────────────────────────────
async function openReviewModal(id) {
    _ensureModalFooter();
    DOM.modalTitle.textContent = '✅ مراجعة الحجز';
    DOM.modalBody.innerHTML = '<div style="text-align:center;padding:2rem"><div class="spinner"></div></div>';
    document.querySelector('.modal')?.classList.add('budget-modal-wide');
    openModal();

    try {
        const res = await fetch(`api/budget.php?action=get&id=${id}`);
        const data = await res.json();
        if (!data.success) return;
        const r = data.data;

        const reservationNumber = r.reservation_number;
        const autoCode = reservationNumber;
        const transactions = BudgetState.meta.transactions || [];

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
            `<option value="${t.id}" data-num="${t.transaction_number}">${t.transaction_number} — ${fmtMoneyCurText(parseFloat(t.amount), t.currency)}${t.budget_status ? ' (' + t.budget_status + ')' : ''}</option>`
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
                        <option value="قيد المراجعة">🔍 قيد المراجعة</option>
                    </select>
                </div>
                <div class="res-form-group full" id="rev_rejection_wrap" style="display:none">
                    <label>سبب الرفض <span class="req">*</span></label>
                    <textarea class="form-textarea" id="rev_rejection_reason" rows="2" placeholder="اذكر سبب الرفض بوضوح"></textarea>
                </div>
                <div class="res-form-group full">
                    <label>ملاحظات الموازنة</label>
                    <textarea class="form-textarea" id="rev_budget_notes" rows="2" placeholder="ملاحظات إضافية…"></textarea>
                </div>
            </div>
            <div class="res-form-nav">
                <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
                <button class="btn btn-primary" onclick="submitReview(${id})">حفظ المراجعة</button>
            </div>
        </div>`;

        document.getElementById('rev_status').addEventListener('change', function () {
            document.getElementById('rev_rejection_wrap').style.display = this.value === 'مرفوض' ? 'block' : 'none';
        });
    } catch (e) { console.error(e); }
}

function updateBudgetCode(reservationNumber) {
    const display = document.getElementById('rev_budget_code_display');
    const hidden = document.getElementById('rev_budget_code');
    if (!display || !hidden) return;
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
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, status, budget_code: code, budget_notes: notes, transaction_id: txId, rejection_reason: rejReason }),
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
    } catch (e) { showToast('❌ خطأ في الاتصال', 'error'); }
}

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
        create: 'إنشاء الحجز', review: 'مراجعة الموازنة',
        approve: 'اعتماد', reject: 'رفض',
        link_transaction: 'ربط بمعاملة', update: 'تعديل',
    }[action] || action;
}

// ═══════════════════════════════════════════════════════════════
//  Searchable Select
// ═══════════════════════════════════════════════════════════════
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

function selectSSOption(opt) { _ssSelectOption(opt); }

// ═══════════════════════════════════════════════════════════════
//  الموازنة التقديرية — التاب
// ═══════════════════════════════════════════════════════════════
async function loadBudgetPlansTab() {
    injectBudgetStyles(); // CSS موحّد — لا تكرار
    DOM.mainContent.innerHTML = `
        <div class="budget-page-wrap">
            <div class="budget-page-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.75rem">
                <div>
                    <h2 class="budget-page-title">📊 الموازنة التقديرية</h2>
                    <p class="budget-page-sub">تخصيص الميزانيات السنوية على البنود ومراكز التكلفة</p>
                </div>
                <button class="btn btn-primary" style="display:flex;align-items:center;gap:.4rem;font-size:.88rem;padding:.5rem 1.1rem"
                    onclick="openNewBudgetModal()">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    إضافة ميزانية جديدة
                </button>
            </div>
            <div id="plans-body"><div class="spinner" style="margin:3rem auto;display:block"></div></div>
        </div>`;

    if (!PlanState.meta.categories.length) {
        await fetchPlanMeta();
    }
    await fetchPlans();
    renderPlansPage();
}

async function fetchPlans() {
    try {
        const r = await fetch(`api/budget_plan_api.php?action=list&year=${PlanState.selectedYear}`).then(r => r.json());
        if (r.success) PlanState.plans = r.data;
    } catch (e) { console.error('fetchPlans:', e); }
}

async function fetchPlanMeta(forceYear = false) {
    try {
        const m = await fetch('api/budget_plan_api.php?action=meta').then(r => r.json());
        if (m.success) {
            PlanState.meta = m.data;
            if (forceYear) {
                const curYear = new Date().getFullYear();
                const allYears = [curYear - 1, curYear, curYear + 1];
                if (!allYears.includes(PlanState.selectedYear)) PlanState.selectedYear = curYear;
            }
        }
    } catch (e) { console.error('fetchPlanMeta:', e); }
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
                    title="${locked ? '🔒 يتطلب صلاحية مدير النظام' : ''}">${y}${locked ? ' 🔒' : ''}</button>`;
    }).join('');

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

    const categoriesHtml = meta.categories.map(cat => {
        const plan = plans.find(p => p.category_id == cat.id);
        const budget = plan ? parseFloat(plan.total_budget || 0) : 0;
        const reserved = plan ? parseFloat(plan.total_reserved || 0) : 0;
        const remaining = budget - reserved;
        const pctReal = budget > 0 ? Math.round(reserved / budget * 100) : 0;
        const pct = Math.min(100, pctReal);
        const barColor = pctReal >= 100 ? '#ef4444' : pctReal >= 90 ? '#ef4444' : pctReal >= 70 ? '#f59e0b' : '#22c55e';
        const hasPlan = !!plan;
        const isOpen = PlanState.openCategories?.has(cat.id);

        return `
        <div class="bp-cat-row ${hasPlan ? 'has-plan' : 'no-plan'}" id="bp-cat-${cat.id}">
            <div class="bp-cat-header" onclick="togglePlanCategory(${cat.id})">
                <div style="width:22px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2.5"
                         style="transition:transform .2s;transform:rotate(${isOpen ? '90' : '0'}deg)">
                        <polyline points="9 18 15 12 9 6"/>
                    </svg>
                </div>
                <div style="display:flex;flex-direction:column;gap:.1rem;overflow:hidden;flex:1">
                    <div style="display:flex;align-items:center;gap:.5rem">
                        <span style="font-size:.68rem;color:var(--text-muted);font-family:monospace;background:var(--bg-surface);padding:1px 6px;border-radius:4px;border:1px solid var(--border-color);flex-shrink:0">${cat.code}</span>
                        <span style="font-size:.86rem;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${cat.name}</span>
                    </div>
                    ${hasPlan && budget > 0 ? `
                    <div style="display:flex;align-items:center;gap:.4rem;margin-top:2px">
                        <div style="flex:1;max-width:160px;height:3px;background:var(--bg-surface);border-radius:2px;overflow:hidden">
                            <div style="height:100%;width:${pct}%;background:${barColor};border-radius:2px"></div>
                        </div>
                        <span style="font-size:.65rem;color:${barColor};font-weight:600">${pctReal}%</span>
                    </div>` : ''}
                </div>
                <div style="display:flex;align-items:center;gap:.3rem;flex-shrink:0;width:190px">
                    ${hasPlan
                ? `<input type="number" class="bp-budget-input" id="bp-total-${cat.id}" value="${budget}" min="0" step="0.01" onclick="event.stopPropagation()" onchange="onCatBudgetChange(${cat.id}, this.value)">`
                : `<input type="number" class="bp-budget-input bp-budget-new" id="bp-total-${cat.id}" placeholder="أضف ميزانية..." min="0" step="0.01" onclick="event.stopPropagation()" onchange="onCatBudgetChange(${cat.id}, this.value)">`}
                    <span class="bp-sar-label sar-symbol" style="flex-shrink:0"></span>
                </div>
                ${hasPlan && budget > 0 ? `
                <div style="display:flex;flex-direction:column;align-items:flex-end;flex-shrink:0;min-width:110px">
                    <div style="font-size:.72rem;color:#f59e0b;font-weight:600">${formatMoneyWithSAR(reserved)}</div>
                    <div style="font-size:.67rem;color:${remaining < 0 ? '#ef4444' : 'var(--text-muted)'};margin-top:1px">${remaining < 0 ? '⚠ ' : ''}${formatMoneyWithSAR(remaining)}</div>
                </div>` : '<div style="min-width:110px"></div>'}
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

    const _pb = document.getElementById('plans-body');
    if (!_pb) return;
    _pb.innerHTML = `
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
                    style="width:100%;padding:.45rem .75rem .45rem 2.2rem;border:1px solid var(--border-color);border-radius:9px;background:var(--bg-card);color:var(--text-primary);font-size:.82rem;direction:rtl"
                    oninput="filterPlanCategories(this.value)">
            </div>
            <div style="display:flex;gap:.35rem;margin-right:auto">
                <button onclick="expandAllPlanCategories()" style="padding:.4rem .75rem;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-card);color:var(--text-secondary);font-size:.78rem;cursor:pointer">توسيع الكل</button>
                <button onclick="collapseAllPlanCategories()" style="padding:.4rem .75rem;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-card);color:var(--text-secondary);font-size:.78rem;cursor:pointer">طي الكل</button>
            </div>
        </div>

        ${statsHtml}

        ${isLocked ? `
        <div style="display:flex;align-items:center;gap:.75rem;padding:.65rem 1rem;margin-bottom:1rem;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.3);border-radius:10px;color:#92400e;font-size:.82rem">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <span>سنة <strong>${selectedYear}</strong> مقفلة — يتطلب صلاحية <strong>مدير النظام</strong> للتعديل</span>
        </div>` : ''}

        <div class="bp-save-bar" id="bp-save-bar" style="display:none">
            <span id="bp-save-bar-msg">📝 يوجد تغييرات غير محفوظة</span>
            <button class="btn btn-primary" onclick="saveAllPlanChanges()">💾 حفظ الكل</button>
            <button class="btn btn-secondary" onclick="discardPlanChanges()">↩ تجاهل</button>
        </div>

        <div style="display:grid;grid-template-columns:22px 1fr 190px 110px 32px;gap:.75rem;padding:.4rem 1rem;font-size:.68rem;font-weight:700;color:var(--text-muted);border-bottom:1px solid var(--border-color);margin-bottom:.35rem">
            <div></div><div>البند</div><div style="text-align:center">الميزانية المخصصة</div><div style="text-align:left">المحجوز / المتبقي</div><div></div>
        </div>

        <div class="bp-categories-list" id="bp-categories-list" style="${isLocked ? 'pointer-events:none;opacity:.75;user-select:none' : ''}">
            ${categoriesHtml}
        </div>`;

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
    await fetchPlans();
    renderPlansPage();
}

// ── Accordion ─────────────────────────────────────────────────
async function togglePlanCategory(catId) {
    const panel = document.getElementById(`bp-cc-panel-${catId}`);
    if (!panel) return;
    if (PlanState.openCategories.has(catId)) {
        PlanState.openCategories.delete(catId);
        panel.style.display = 'none';
        const arrow = document.querySelector(`#bp-cat-${catId} svg`);
        if (arrow) arrow.style.transform = 'rotate(0deg)';
    } else {
        PlanState.openCategories.add(catId);
        panel.style.display = 'block';
        const arrow = document.querySelector(`#bp-cat-${catId} svg`);
        if (arrow) arrow.style.transform = 'rotate(90deg)';
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

    const plan = PlanState.plans.find(p => p.category_id == catId);
    const allCCs = PlanState.meta.cost_centers || [];
    let existingCCs = {};

    if (plan) {
        try {
            const r = await fetch(`api/budget_plan_api.php?action=detail&id=${plan.id}`).then(r => r.json());
            if (r.success) {
                (r.data.cost_centers || []).forEach(cc => {
                    existingCCs[cc.cost_center_id] = { allocated: parseFloat(cc.allocated || 0), reserved: parseFloat(cc.reserved || 0) };
                });
            }
        } catch (e) { console.error(e); }
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
            <span></span><span>مركز التكلفة</span><span>المخصص</span><span>محجوز / متبقي</span>
        </div>
        <div class="bp-cc-rows-wrap">${rows}</div>
        <div class="bp-cc-footer" id="bp-cc-footer-${catId}"></div>`;
    content.dataset.loaded = '1';
    if (loading) loading.style.display = 'none';
    content.style.display = 'block';
    updateCCFooter(catId);
}

function renderCCFooter(catId) {
    const budgetEl = document.getElementById(`bp-total-${catId}`);
    const total = parseFloat(budgetEl?.value || 0);
    const rows = document.querySelectorAll(`#bp-cc-content-${catId} .bp-cc-amount-input`);
    const alloc = Array.from(rows).reduce((s, el) => el.disabled ? s : s + parseFloat(el.value || 0), 0);
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
    if (!checked) amtInput.value = '';
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
    if (PlanState.selectedYear !== curYear && !isAdmin) return;
    const bar = document.getElementById('bp-save-bar');
    if (bar) bar.style.display = 'flex';
}

function filterPlanCategories(q) {
    const term = q.toLowerCase();
    document.querySelectorAll('.bp-cat-row').forEach(row => {
        const text = (row.querySelector('.bp-cat-name')?.textContent || '').toLowerCase() +
            (row.querySelector('.bp-cat-code')?.textContent || '').toLowerCase();
        row.style.display = text.includes(term) ? '' : 'none';
    });
}

function expandAllPlanCategories() {
    PlanState.meta.categories.forEach(cat => {
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

        const totalEl = document.getElementById(`bp-total-${catId}`);
        const total = change.total ?? parseFloat(totalEl?.value || 0);
        if (total <= 0 && !Object.values(change.ccs || {}).some(cc => cc.enabled)) continue;

        const ccs = Object.entries(change.ccs || {})
            .filter(([, v]) => v.enabled && v.amount > 0)
            .map(([ccId, v]) => ({ cost_center_id: parseInt(ccId), allocated: v.amount }));

        const existingPlan = PlanState.plans.find(p => p.category_id == catId);
        const payload = {
            id: existingPlan?.id || 0,
            fiscal_year: PlanState.selectedYear,
            category_id: catId, total_budget: total, notes: '', cost_centers: ccs,
        };

        try {
            const r = await fetch('api/budget_plan_api.php?action=save', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            }).then(r => r.json());
            if (!r.success) errors++;
        } catch (e) { errors++; }
    }

    if (errors) showToast(`فشل حفظ ${errors} بند`, 'error');
    else showToast('✅ تم حفظ جميع التغييرات', 'success');

    PlanState.pendingChanges = {};
    const openBefore = new Set(PlanState.openCategories);
    await fetchPlans();
    renderPlansPage();
    openBefore.forEach(id => togglePlanCategory(id));
    const bar = document.getElementById('bp-save-bar');
    if (bar) bar.style.display = 'none';
}

function discardPlanChanges() {
    PlanState.pendingChanges = {};
    const openBefore = new Set(PlanState.openCategories);
    PlanState.openCategories = new Set();
    renderPlansPage();
    openBefore.forEach(id => togglePlanCategory(id));
}

// ── فتح مودال "إضافة ميزانية جديدة" ───────────────────────
function openNewBudgetModal() { openPlanModal(0); }

// ── مساعدات تنسيق الأرقام ──────────────────────────────────
function _numFmt(v) {
    const n = parseFloat(String(v).replace(/,/g, '')) || 0;
    if (n === 0) return '';
    return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
function _numParse(v) { return parseFloat(String(v).replace(/,/g, '')) || 0; }
function _numInput(e) {
    const el = e.target || e;
    const raw = el.value.replace(/,/g, '');
    if (raw === '' || raw === '-') return;
    const n = parseFloat(raw);
    if (isNaN(n)) { el.value = el.value.slice(0, -1); return; }
    el.value = n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// ═══════════════════════════════════════════════════════════════
//  Modal إضافة/تعديل خطة — النموذج الجديد متعدد البنود
// ═══════════════════════════════════════════════════════════════

// ── helpers ─────────────────────────────────────────────────
function _fmt(n) {
    const num = parseFloat(n) || 0;
    return num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
function _pct(a, b) { return b > 0 ? parseFloat((a / b * 100).toFixed(1)) : 0; }

// ── setters — تحديث جزئي للـ DOM بدون re-render (يحل مشكلة فقدان الـ focus) ──
function _bpmSetYear(y) { window._bpmState.year = parseInt(y); }

function _bpmSetTotal(v) {
    const t = parseFloat(v) || 0;
    window._bpmState.totalBudget = t;
    const st = window._bpmState;
    if (st.distMode === 'pct') {
        st.items.forEach((it, idx) => {
            it.amount = t * (parseFloat(it.pct) || 0) / 100;
            const amtEl = document.getElementById(`bpm-item-amt-${idx}`);
            if (amtEl) amtEl.textContent = _fmt(it.amount);
        });
    }
    _bpmUpdateSummary();
}

function _bpmSetMode(m) {
    const st = window._bpmState;
    st.distMode = m;
    const t = st.totalBudget;
    if (m === 'pct') {
        st.items.forEach(it => { it.pct = t > 0 ? parseFloat((it.amount / t * 100).toFixed(2)) : 0; });
    }
    _bpmRender(); // تغيير الوضع يغيّر شكل الأعمدة — re-render ضروري هنا فقط
}

function _bpmEqualItems() {
    const st = window._bpmState;
    const n = st.items.length; if (!n) return;
    const t = st.totalBudget;
    const p = parseFloat((100 / n).toFixed(4));
    const a = parseFloat((t / n).toFixed(2));
    st.items.forEach(it => { it.pct = p; it.amount = a; });
    _bpmRender();
}

function _bpmSetItemPct(idx, v) {
    const st = window._bpmState;
    const pct = parseFloat(v) || 0;
    st.items[idx].pct = pct;
    st.items[idx].amount = st.totalBudget * pct / 100;
    const amtEl = document.getElementById(`bpm-item-amt-${idx}`);
    if (amtEl) amtEl.textContent = _fmt(st.items[idx].amount);
    _bpmUpdateSummary();
}

function _bpmSetItemAmt(idx, v) {
    const st = window._bpmState;
    const amt = parseFloat(v) || 0;
    st.items[idx].amount = amt;
    st.items[idx].pct = st.totalBudget > 0 ? parseFloat((amt / st.totalBudget * 100).toFixed(2)) : 0;
    const pctEl = document.getElementById(`bpm-item-pct-${idx}`);
    if (pctEl) pctEl.value = st.items[idx].pct;
    _bpmUpdateSummary();
}

function _bpmSetItemCat(idx, v) { window._bpmState.items[idx].catId = parseInt(v); }

function _bpmAddItem() {
    window._bpmState.items.push({ catId: PlanState.meta.categories[0]?.id || 0, pct: 0, amount: 0, ccs: [] });
    _bpmRender();
}
function _bpmRemoveItem(idx) {
    window._bpmState.items.splice(idx, 1);
    _bpmRender();
}
function _bpmAddCC(idx) {
    const ccId = PlanState.meta.cost_centers[0]?.id || 0;
    window._bpmState.items[idx].ccs.push({ ccId, pct: 0, amount: 0 });
    _bpmRender();
}
function _bpmRemoveCC(idx, ci) {
    window._bpmState.items[idx].ccs.splice(ci, 1);
    _bpmRender();
}
function _bpmEqualCC(idx) {
    const item = window._bpmState.items[idx];
    const n = item.ccs.length; if (!n) return;
    const amt = parseFloat(item.amount) || 0;
    const p = parseFloat((100 / n).toFixed(4));
    const a = parseFloat((amt / n).toFixed(2));
    item.ccs.forEach(cc => { cc.pct = p; cc.amount = a; });
    _bpmRender();
}

function _bpmSetCC(idx, ci, field, v) {
    const item = window._bpmState.items[idx];
    const cc = item.ccs[ci];
    const catAmt = parseFloat(item.amount) || 0;
    if (field === 'ccId') { cc.ccId = parseInt(v); }
    if (field === 'pct') {
        cc.pct = parseFloat(v) || 0;
        cc.amount = catAmt * cc.pct / 100;
        const aEl = document.getElementById(`bpm-cc-amt-${idx}-${ci}`);
        if (aEl) aEl.value = cc.amount.toFixed(2);
    }
    if (field === 'amount') {
        cc.amount = parseFloat(v) || 0;
        cc.pct = catAmt > 0 ? parseFloat((cc.amount / catAmt * 100).toFixed(2)) : 0;
        const pEl = document.getElementById(`bpm-cc-pct-${idx}-${ci}`);
        if (pEl) pEl.value = cc.pct;
    }
    _bpmUpdateCCSummary(idx);
    _bpmUpdateSummary();
}

// ── تحديث الملخص الإجمالي بدون re-render ───────────────────
function _bpmUpdateSummary() {
    const st = window._bpmState;
    const total = st.totalBudget;
    // الموزّع = مجموع مراكز التكلفة عبر كل البنود
    const totalAllocated = st.items.reduce((s, it) => {
        const ccSum = (it.ccs || []).reduce((cs, cc) => cs + (parseFloat(cc.amount) || 0), 0);
        // إذا لا يوجد مراكز تكلفة استخدم مبلغ البند نفسه
        return s + (it.ccs && it.ccs.length ? ccSum : (parseFloat(it.amount) || 0));
    }, 0);
    const remain = total - totalAllocated;
    const isOver = totalAllocated > total + 0.01;
    const isExact = Math.abs(remain) < 0.01;
    const pct = total > 0 ? Math.min(100, Math.round(totalAllocated / total * 100)) : 0;
    const clr = isOver ? '#ef4444' : isExact ? '#22c55e' : '#f59e0b';

    const bar = document.getElementById('bpm-total-bar');
    if (bar) { bar.style.width = pct + '%'; bar.style.background = clr; }

    const chips = document.getElementById('bpm-total-chips');
    if (chips) chips.innerHTML = `
        <div class="bpm-chip">الإجمالي: <b>${_fmt(total)} ر.س</b></div>
        <div class="bpm-chip">الموزّع: <b style="color:${isOver ? '#ef4444' : '#22c55e'}">${_fmt(totalAllocated)} ر.س</b></div>
        <div class="bpm-chip">${isOver ? '⚠ تجاوز' : 'المتبقي'}: <b style="color:${clr}">${_fmt(Math.abs(remain))} ر.س</b></div>
        <div class="bpm-chip">${pct}%</div>`;
}

// ── تحديث ملخص مراكز التكلفة لبند واحد بدون re-render ──────
function _bpmUpdateCCSummary(idx) {
    const item = window._bpmState.items[idx];
    const catAmt = parseFloat(item.amount) || 0;
    const ccTotal = (item.ccs || []).reduce((s, cc) => s + (parseFloat(cc.amount) || 0), 0);
    const pct = catAmt > 0 ? Math.min(100, Math.round(ccTotal / catAmt * 100)) : 0;
    const clr = ccTotal > catAmt + 0.01 ? '#ef4444' : Math.abs(ccTotal - catAmt) < 0.01 ? '#22c55e' : '#f59e0b';
    const el = document.getElementById(`bpm-cc-summary-${idx}`);
    if (el) el.innerHTML = `<span style="color:${clr};font-weight:600">${_fmt(ccTotal)} / ${_fmt(catAmt)} ر.س (${pct}%)</span>`;
}

// ── رسم المودال ─────────────────────────────────────────────
function _bpmRender() {
    const st = window._bpmState;
    const meta = PlanState.meta;
    const total = st.totalBudget;

    const yearOpts = (meta.years || [PlanState.selectedYear, PlanState.selectedYear + 1])
        .map(y => `<option value="${y}" ${y == st.year ? 'selected' : ''}>${y}</option>`).join('');

    const itemsHtml = st.items.map((item, idx) => _bpmRenderItem(item, idx, total)).join('');

    const totalAllocated = st.items.reduce((s, it) => s + (parseFloat(it.amount) || 0), 0);
    const totalPct = total > 0 ? Math.min(100, Math.round(totalAllocated / total * 100)) : 0;
    const remain = total - totalAllocated;
    const isOver = totalAllocated > total + 0.01;
    const isExact = Math.abs(remain) < 0.01;
    const barClr = isOver ? '#ef4444' : isExact ? '#22c55e' : '#f59e0b';

    DOM.modalBody.innerHTML = `
    <div style="display:grid;gap:.75rem">
        <div class="bpm-section">
            <div class="bpm-section-head">
                <span class="bpm-section-title">📅 السنة المالية والميزانية الإجمالية</span>
            </div>
            <div class="bpm-section-body">
                <div style="display:grid;grid-template-columns:160px 1fr;gap:.75rem;align-items:end">
                    <div>
                        <label style="font-size:.78rem;color:var(--text-muted);display:block;margin-bottom:.3rem">السنة المالية *</label>
                        <select class="form-select" style="font-size:.85rem" onchange="_bpmSetYear(this.value)">${yearOpts}</select>
                    </div>
                    <div>
                        <label style="font-size:.78rem;color:var(--text-muted);display:block;margin-bottom:.3rem">إجمالي الميزانية (ريال) *</label>
                        <input type="number" class="form-input" id="bpm-total"
                            value="${total || ''}" min="0" step="1000" placeholder="0.00"
                            style="font-size:.95rem;font-weight:700"
                            oninput="_bpmSetTotal(this.value)">
                    </div>
                </div>
            </div>
        </div>

        <div class="bpm-section">
            <div class="bpm-section-head">
                <span class="bpm-section-title">📋 توزيع البنود</span>
                <div class="bpm-dist-tabs">
                    <button class="bpm-tab ${st.distMode === 'pct' ? 'on' : ''}"    onclick="_bpmSetMode('pct')">% نسبة</button>
                    <button class="bpm-tab ${st.distMode === 'amount' ? 'on' : ''}" onclick="_bpmSetMode('amount')">﷼ مبلغ</button>
                    <button class="bpm-tab" onclick="_bpmEqualItems()">= متساوٍ</button>
                </div>
            </div>
            <div class="bpm-section-body" style="padding:.65rem .85rem">
                <div style="display:grid;grid-template-columns:1fr ${st.distMode === 'pct' ? '90px' : ''} 120px 28px;gap:.5rem;
                            padding:.25rem .6rem;font-size:.72rem;color:var(--text-muted);font-weight:600;margin-bottom:.3rem">
                    <span>بند المصاريف</span>
                    ${st.distMode === 'pct' ? `<span style="text-align:center">النسبة</span>` : ''}
                    <span style="text-align:left">المبلغ (ريال)</span>
                    <span></span>
                </div>
                <div id="bpm-items-wrap">${itemsHtml}</div>
                <div style="margin-top:.65rem;padding:.5rem .6rem;background:var(--bg-surface);border-radius:7px;border:1px solid var(--border-color)">
                    <div class="bpm-bar-wrap">
                        <div class="bpm-bar-bg">
                            <div class="bpm-bar-fill" id="bpm-total-bar" style="width:${totalPct}%;background:${barClr}"></div>
                        </div>
                    </div>
                    <div class="bpm-chips" id="bpm-total-chips">
                        <div class="bpm-chip">الإجمالي: <b>${_fmt(total)} ر.س</b></div>
                        <div class="bpm-chip">الموزّع: <b style="color:${isOver ? '#ef4444' : '#22c55e'}">${_fmt(totalAllocated)} ر.س</b></div>
                        <div class="bpm-chip">${isOver ? '⚠ تجاوز' : 'المتبقي'}: <b style="color:${barClr}">${_fmt(Math.abs(remain))} ر.س</b></div>
                        <div class="bpm-chip">${totalPct}%</div>
                    </div>
                </div>
                <button class="bpm-add-cat" onclick="_bpmAddItem()">＋ إضافة بند مصاريف</button>
            </div>
        </div>
    </div>`;
}

function _bpmRenderItem(item, idx, total) {
    const meta = PlanState.meta;
    const st = window._bpmState;
    const catAmt = parseFloat(item.amount) || 0;

    const catOpts = meta.categories.map(c =>
        `<option value="${c.id}" ${c.id == item.catId ? 'selected' : ''}>${c.code} — ${c.name}</option>`
    ).join('');

    const ccRows = (item.ccs || []).map((cc, ci) => {
        const ccAmt = parseFloat(cc.amount) || 0;
        const ccOpts = meta.cost_centers.map(c =>
            `<option value="${c.id}" ${c.id == cc.ccId ? 'selected' : ''}>${c.code} — ${c.name}</option>`
        ).join('');
        const isOver = ccAmt > catAmt + 0.01;
        return `
        <tr>
            <td><select class="bpm-input" style="font-size:.78rem" onchange="_bpmSetCC(${idx},${ci},'ccId',this.value)">${ccOpts}</select></td>
            <td style="text-align:center">
                <div class="bpm-cat-pct">
                    <input type="number" class="bpm-input" id="bpm-cc-pct-${idx}-${ci}"
                        style="width:60px;text-align:center"
                        value="${cc.pct || 0}" min="0" max="100" step="0.1"
                        oninput="_bpmSetCC(${idx},${ci},'pct',this.value)">
                    <span style="font-size:.75rem;color:var(--text-muted)">%</span>
                </div>
            </td>
            <td><input type="number" class="bpm-input" id="bpm-cc-amt-${idx}-${ci}"
                style="text-align:left;direction:ltr"
                value="${ccAmt || 0}" min="0" step="0.01"
                oninput="_bpmSetCC(${idx},${ci},'amount',this.value)"></td>
            <td class="bpm-cc-computed ${isOver ? 'bpm-cc-over' : ''}">${_pct(ccAmt, catAmt)}%</td>
            <td><button class="bpm-cat-del" onclick="_bpmRemoveCC(${idx},${ci})">🗑</button></td>
        </tr>`;
    }).join('');

    const ccTotal = (item.ccs || []).reduce((s, cc) => s + (parseFloat(cc.amount) || 0), 0);
    const ccPctBar = catAmt > 0 ? Math.min(100, Math.round(ccTotal / catAmt * 100)) : 0;
    const ccBarClr = ccTotal > catAmt + 0.01 ? '#ef4444' : Math.abs(ccTotal - catAmt) < 0.01 ? '#22c55e' : '#f59e0b';

    return `
    <div class="bpm-cat-block" id="bpm-item-${idx}">
        <div class="bpm-cat-head">
            <div>
                <select class="bpm-input" style="font-size:.82rem;font-weight:600" onchange="_bpmSetItemCat(${idx},this.value)">${catOpts}</select>
            </div>
            ${st.distMode === 'pct' ? `
            <div class="bpm-cat-pct">
                <input type="number" class="bpm-input" id="bpm-item-pct-${idx}"
                    style="width:68px;text-align:center"
                    value="${item.pct || 0}" min="0" max="100" step="0.01"
                    oninput="_bpmSetItemPct(${idx},this.value)">
                <span style="font-size:.75rem;color:var(--text-muted)">%</span>
            </div>` : `
            <div>
                <input type="number" class="bpm-input" id="bpm-item-pct-${idx}"
                    style="text-align:left;direction:ltr"
                    value="${catAmt || ''}" min="0" step="1000" placeholder="0"
                    oninput="_bpmSetItemAmt(${idx},this.value)">
            </div>`}
            <div class="bpm-cat-amt" id="bpm-item-amt-${idx}">${_fmt(catAmt)}</div>
            <button class="bpm-cat-del" onclick="_bpmRemoveItem(${idx})">✕</button>
        </div>
        <div style="padding:.5rem .75rem">
            <table class="bpm-cc-table">
                <thead><tr>
                    <th>مركز التكلفة</th>
                    <th style="text-align:center;width:90px">النسبة %</th>
                    <th style="text-align:left;width:110px">المبلغ ﷼</th>
                    <th style="width:55px">الحصة</th>
                    <th style="width:28px"></th>
                </tr></thead>
                <tbody>${ccRows}</tbody>
            </table>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-top:.4rem;flex-wrap:wrap;gap:.4rem">
                <button class="bpm-add-cc" onclick="_bpmAddCC(${idx})">＋ إضافة مركز تكلفة</button>
                <button class="bpm-add-cc" onclick="_bpmEqualCC(${idx})" style="color:#6366f1">= توزيع متساوٍ</button>
                <span id="bpm-cc-summary-${idx}" style="font-size:.75rem;font-weight:600">
                    <span style="color:${ccBarClr}">${_fmt(ccTotal)} / ${_fmt(catAmt)} ر.س (${ccPctBar}%)</span>
                </span>
            </div>
        </div>
    </div>`;
}

// ── حفظ الكل ────────────────────────────────────────────────
async function bpmSaveAll(editPlanId) {
    const st = window._bpmState;
    const year = parseInt(st.year);
    const total = parseFloat(st.totalBudget);

    if (!year || !total) { showToast('السنة المالية والميزانية الإجمالية مطلوبتان', 'error'); return; }
    if (!st.items.length) { showToast('أضف بنداً واحداً على الأقل', 'error'); return; }

    const btn = document.getElementById('bpm-save-btn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ جاري الحفظ...'; }

    let errors = 0;
    for (const item of st.items) {
        const catId = parseInt(item.catId);
        const catAmt = parseFloat(item.amount) || 0;
        if (!catId || catAmt <= 0) { errors++; continue; }

        const ccs = (item.ccs || [])
            .filter(cc => cc.ccId && parseFloat(cc.amount) > 0)
            .map(cc => ({ cost_center_id: parseInt(cc.ccId), allocated: parseFloat(parseFloat(cc.amount).toFixed(2)) }));

        const existing = PlanState.plans.find(p => p.category_id == catId && parseInt(p.fiscal_year) === year);
        const payload = {
            id: editPlanId && st.items.length === 1 ? editPlanId : (existing?.id || 0),
            fiscal_year: year,
            category_id: catId,
            total_budget: parseFloat(catAmt.toFixed(2)),
            notes: '',
            cost_centers: ccs,
        };

        try {
            const r = await fetch('api/budget_plan_api.php?action=save', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            }).then(r => r.json());
            if (!r.success) errors++;
        } catch (e) { errors++; }
    }

    if (btn) { btn.disabled = false; btn.textContent = '💾 حفظ الميزانية'; }

    if (errors) {
        showToast(`❌ فشل حفظ ${errors} بند`, 'error');
    } else {
        showToast('✅ تم حفظ الميزانية بنجاح', 'success');
        closeModal();
        await fetchPlans();
        renderPlansPage();
    }
}

// ── savePlan — توافق مع زر التعديل القديم ───────────────────
async function savePlan(planId) { await bpmSaveAll(planId); }

async function openPlanModal(planId) {
    _ensureModalFooter();
    if (!DOM.modalTitle || !DOM.modalBody || !DOM.modalFooter) {
        console.error('❌ عناصر المودال مفقودة');
        return;
    }

    // حقن CSS النموذج الجديد مرة واحدة
    if (!document.getElementById('bp-modal-styles')) {
        const s = document.createElement('style');
        s.id = 'bp-modal-styles';
        s.textContent = `
        .bpm-section        { border:1px solid var(--border-color);border-radius:10px;overflow:hidden;margin-bottom:.85rem; }
        .bpm-section-head   { padding:.6rem 1rem;background:var(--bg-surface);border-bottom:1px solid var(--border-color);
                              display:flex;align-items:center;justify-content:space-between;gap:.5rem;flex-wrap:wrap; }
        .bpm-section-title  { font-size:.88rem;font-weight:700;color:var(--text-primary); }
        .bpm-section-body   { padding:.85rem 1rem; }
        .bpm-dist-tabs      { display:flex;gap:.35rem; }
        .bpm-tab            { padding:.32rem .75rem;border:1.5px solid var(--border-color);border-radius:7px;
                              background:var(--bg-card);color:var(--text-secondary);
                              font-size:.78rem;font-weight:600;cursor:pointer;transition:all .15s; }
        .bpm-tab:hover      { border-color:#6366f1;color:#6366f1; }
        .bpm-tab.on         { background:#6366f1;color:#fff;border-color:#6366f1; }
        .bpm-cat-block      { border:1px solid var(--border-color);border-radius:8px;
                              margin-bottom:.65rem;overflow:hidden;background:var(--bg-card); }
        .bpm-cat-head       { display:grid;grid-template-columns:1fr 110px 110px 36px;
                              gap:.5rem;align-items:center;padding:.5rem .75rem;
                              background:var(--bg-surface);border-bottom:1px solid var(--border-color); }
        .bpm-cat-pct        { display:flex;align-items:center;gap:3px; }
        .bpm-cat-pct input  { width:68px;padding:.28rem .4rem;border:1px solid var(--border-color);
                              border-radius:6px;background:var(--bg-card);color:var(--text-primary);
                              font-size:.82rem;text-align:center; }
        .bpm-cat-amt        { font-size:.82rem;font-weight:600;color:#6366f1;text-align:left;direction:ltr; }
        .bpm-cat-del        { background:none;border:none;cursor:pointer;color:var(--text-muted);
                              font-size:.85rem;padding:.2rem;border-radius:4px;transition:color .15s; }
        .bpm-cat-del:hover  { color:#ef4444; }
        .bpm-cc-table       { width:100%;border-collapse:collapse;font-size:.8rem; }
        .bpm-cc-table th    { padding:.3rem .6rem;color:var(--text-muted);font-weight:600;font-size:.72rem;
                              border-bottom:1px solid var(--border-color);text-align:right; }
        .bpm-cc-table td    { padding:.3rem .6rem;border-bottom:1px solid rgba(0,0,0,.04); }
        .bpm-cc-table tr:last-child td { border-bottom:none; }
        .bpm-cc-computed    { font-size:.79rem;font-weight:600;color:#22c55e;direction:ltr;text-align:left; }
        .bpm-cc-over        { color:#ef4444; }
        .bpm-bar-wrap       { margin:.5rem 0 .35rem; }
        .bpm-bar-bg         { height:6px;background:var(--bg-surface);border-radius:4px;overflow:hidden;
                              border:1px solid var(--border-color); }
        .bpm-bar-fill       { height:100%;border-radius:4px;transition:width .3s,background .3s; }
        .bpm-chips          { display:flex;gap:.6rem;flex-wrap:wrap;font-size:.78rem; }
        .bpm-chip           { background:var(--bg-surface);border:1px solid var(--border-color);
                              border-radius:6px;padding:.22rem .55rem; }
        .bpm-chip b         { color:var(--text-primary); }
        .bpm-add-cat        { width:100%;padding:.45rem;border:1.5px dashed var(--border-color);
                              border-radius:8px;background:transparent;color:var(--text-muted);
                              font-size:.82rem;cursor:pointer;transition:all .15s;margin-top:.35rem; }
        .bpm-add-cat:hover  { border-color:#6366f1;color:#6366f1; }
        .bpm-add-cc         { background:none;border:none;color:var(--text-muted);font-size:.78rem;
                              cursor:pointer;padding:.25rem .6rem;transition:color .15s; }
        .bpm-add-cc:hover   { color:#6366f1; }
        .bpm-input          { width:100%;padding:.28rem .45rem;border:1px solid var(--border-color);
                              border-radius:6px;background:var(--bg-card);color:var(--text-primary);font-size:.82rem; }
        .bpm-input:focus    { outline:none;border-color:#6366f1; }
        `;
        document.head.appendChild(s);
    }

    // تهيئة الحالة
    window._bpmState = {
        totalBudget: 0,
        distMode: 'pct',
        year: PlanState.selectedYear,
        items: [],
    };

    // إذا تعديل — حمّل البيانات
    if (planId) {
        try {
            const r = await fetch(`api/budget_plan_api.php?action=detail&id=${planId}`).then(r => r.json());
            if (r.success) {
                const p = r.data;
                window._bpmState.year = p.fiscal_year;
                window._bpmState.totalBudget = parseFloat(p.total_budget || 0);
                window._bpmState.items = [{
                    catId: p.category_id,
                    pct: 100,
                    amount: parseFloat(p.total_budget || 0),
                    ccs: (p.cost_centers || []).map(cc => ({
                        ccId: cc.cost_center_id,
                        pct: window._bpmState.totalBudget > 0
                            ? parseFloat((cc.allocated / window._bpmState.totalBudget * 100).toFixed(2))
                            : 0,
                        amount: parseFloat(cc.allocated || 0),
                    })),
                }];
            }
        } catch (e) { console.error(e); }
    }

    DOM.modalTitle.innerHTML = planId ? `✏️ تعديل بند الموازنة` : `➕ إضافة ميزانية جديدة`;
    DOM.modalBody.innerHTML = '<div style="text-align:center;padding:2rem"><div class="spinner"></div></div>';
    DOM.modalFooter.innerHTML = '';
    document.querySelector('.modal')?.classList.add('budget-modal-wide');
    openModal();

    _bpmRender();

    DOM.modalFooter.innerHTML = `
        <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
        <button class="btn btn-primary" id="bpm-save-btn" onclick="bpmSaveAll(${planId || 0})">
            💾 حفظ الميزانية
        </button>`;
}

async function deletePlan(planId, name) {
    if (!confirm(`حذف بند "${name}" من الموازنة؟ سيتم حذف جميع التوزيعات.`)) return;
    try {
        const r = await fetch('api/budget_plan_api.php?action=delete', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: planId }),
        }).then(r => r.json());
        if (r.success) {
            showToast('تم الحذف', 'success');
            await fetchPlans();
            renderPlansPage();
        } else { showToast(r.message, 'error'); }
    } catch (e) { showToast('❌ خطأ في الاتصال', 'error'); }
}

async function openPlanDetail(planId) {
    _ensureModalFooter();
    try {
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
    } catch (e) { showToast('❌ خطأ في التحميل', 'error'); }
}

// ── ربط الحجز بخطة الموازنة ────────────────────────────────
async function loadPlanBudgetInfo(planId, ccCode, excludeId) {
    if (!planId || !ccCode) return null;
    try {
        const excl = excludeId ? `&exclude_id=${excludeId}` : '';
        const r = await fetch(`api/budget_plan_api.php?action=cc_budget&plan_id=${planId}&cc_code=${encodeURIComponent(ccCode)}${excl}`).then(r => r.json());
        return r.success ? r.data : null;
    } catch (e) { return null; }
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

async function loadReservationBudgetBar(r) {
    const wrap = document.getElementById('rdv2_budget_bar_wrap');
    if (!wrap) return;

    const rate = parseFloat(r.exchange_rate || 1);
    const catCode = r.budget_category || '';
    const ccCode = r.cost_center || '';
    let fiscalYear = parseInt(r.fiscal_year || new Date().getFullYear());
    if (fiscalYear < 100) fiscalYear = 2000 + fiscalYear;
    if (!catCode) return;

    wrap.innerHTML = `<div style="padding:.5rem 1.5rem;color:var(--text-muted);font-size:.8rem">⏳ جاري تحميل بيانات الموازنة...</div>`;

    let info = null;

    if (r.budget_plan_id && ccCode) {
        info = await loadPlanBudgetInfo(r.budget_plan_id, ccCode, r.id || 0);
    }
    if (!info && catCode && ccCode) {
        try {
            const res = await fetch(`api/budget_plan_api.php?action=cc_budget_by_category&cat_code=${encodeURIComponent(catCode)}&cc_code=${encodeURIComponent(ccCode)}&fiscal_year=${fiscalYear}&exclude_id=${r.id || 0}`).then(r => r.json());
            if (res && res.success && res.data) info = res.data;
        } catch (e) { }
    }
    if (!info && catCode) {
        try {
            const res = await fetch(`api/budget_plan_api.php?action=cc_budget_by_category&cat_code=${encodeURIComponent(catCode)}&cc_code=__all__&fiscal_year=${fiscalYear}&exclude_id=${r.id || 0}`).then(r => r.json());
            if (res && res.success && res.data) { info = res.data; info._allCC = true; }
        } catch (e) { }
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
    const pctReal = allocated > 0 ? Math.round(reserved / allocated * 100) : 0;
    const isOverflow = pctReal > 100;
    const pctLabel = isOverflow ? `${pctReal}% مُستخدم (تجاوز ${pctReal - 100}%)` : `${pctReal}% مُستخدم`;
    const pct = Math.min(100, pctReal);
    const othersPct = allocated > 0 ? Math.min(100, Math.round(othersReserved / allocated * 100)) : 0;
    const thisPct = allocated > 0 ? Math.min(100, Math.round(thisAmount / allocated * 100)) : 0;
    const barColor = isOverflow ? '#ef4444' : pctReal >= 90 ? '#ef4444' : pctReal >= 70 ? '#f59e0b' : '#22c55e';
    const isTotal = info.scope === 'category_total' || info._allCC;
    const scopeLabel = isTotal ? 'إجمالي البند' : 'مركز التكلفة ' + ccCode;

    wrap.innerHTML = `
    <div style="margin:.5rem 1.5rem 0">
        <div style="border:1px solid var(--border-color);border-radius:10px;padding:.9rem 1.1rem;background:var(--bg-surface);margin-bottom:.5rem">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.6rem">
                <span style="font-size:.82rem;font-weight:700;color:var(--text-secondary)">📊 ميزانية ${info.category_name || catCode} — ${scopeLabel}</span>
                <span style="font-size:.75rem;color:var(--text-muted)">سنة ${info.fiscal_year || fiscalYear}</span>
            </div>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:.5rem;margin-bottom:.7rem">
                <div style="text-align:center;padding:.5rem;background:var(--bg-card);border-radius:8px">
                    <div style="font-size:.72rem;color:var(--text-muted);margin-bottom:.2rem">الميزانية المخصصة</div>
                    <div style="font-size:.95rem;font-weight:700;color:var(--text-primary)">${formatMoneyWithSAR(allocated)}</div>
                </div>
                <div style="text-align:center;padding:.5rem;background:var(--bg-card);border-radius:8px">
                    <div style="font-size:.72rem;color:var(--text-muted);margin-bottom:.2rem">المحجوز</div>
                    <div style="font-size:.95rem;font-weight:700;color:#f59e0b">${formatMoneyWithSAR(reserved)}</div>
                    <div style="font-size:.7rem;color:var(--text-muted)">${pct}% من الميزانية</div>
                    ${othersReserved > 0 ? `
                    <div style="margin-top:5px">
                        <button onclick="toggleRelatedReservations(event,'${r.budget_category}','${r.cost_center}',${fiscalYear},${r.id || 0})"
                                style="display:inline-flex;align-items:center;gap:5px;background:rgba(99,102,241,.08);border:1px solid rgba(99,102,241,.25);border-radius:20px;padding:3px 10px;cursor:pointer;color:#6366f1;font-size:.67rem;font-weight:600;transition:background .15s,border-color .15s"
                                onmouseover="this.style.background='rgba(99,102,241,.15)'"
                                onmouseout="this.style.background='rgba(99,102,241,.08)'">
                            ${formatMoneyWithSAR(othersReserved)} — حجوزات أخرى
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="transition:transform .2s"><polyline points="6 9 12 15 18 9"/></svg>
                        </button>
                    </div>` : ''}
                </div>
                <div style="text-align:center;padding:.5rem;background:var(--bg-card);border-radius:8px">
                    <div style="font-size:.72rem;color:var(--text-muted);margin-bottom:.2rem">المتبقي</div>
                    <div style="font-size:.95rem;font-weight:700;color:${remaining < 0 ? '#ef4444' : '#22c55e'}">${formatMoneyWithSAR(remaining)}</div>
                    <div style="font-size:.7rem;color:${remaining < 0 ? '#ef4444' : 'var(--text-muted)'}">
                        ${remaining < 0 ? '⚠ تجاوز الميزانية' : 'متاح'}
                    </div>
                </div>
            </div>
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
            <div style="margin-top:.6rem;padding:.5rem .75rem;background:rgba(99,179,237,.1);border:1px solid rgba(99,179,237,.3);border-radius:7px;display:flex;justify-content:space-between;align-items:center;font-size:.8rem">
                <span style="color:var(--text-secondary)">💼 قيمة هذا الحجز:</span>
                <span style="font-weight:700;color:var(--accent-blue)">${formatMoneyWithSAR(thisAmount)}
                    <span style="font-weight:400;color:var(--text-muted)">(${thisPct}% من الميزانية)</span>
                </span>
            </div>` : ''}
            ${othersReserved > 0 ? `<div id="related_res_panel" style="display:none;margin-top:.6rem"></div>` : ''}
        </div>
    </div>`;
}

async function toggleRelatedReservations(event, catCode, ccCode, fiscalYear, excludeId) {
    event.stopPropagation();
    const panel = document.getElementById('related_res_panel');
    if (!panel) return;
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
        'معتمد': '#22c55e', 'قيد المراجعة': '#f59e0b', 'منفذ': '#8b5cf6',
        'مرفوض': '#ef4444', 'ملغى': '#6b7280', 'مسودة': '#94a3b8',
    };

    try {
        const res = await fetch(
            `api/budget_plan_api.php?action=related_reservations` +
            `&cat_code=${encodeURIComponent(catCode)}` +
            `&cc_code=${encodeURIComponent(ccCode || '__all__')}` +
            `&fiscal_year=${fiscalYear}&exclude_id=${excludeId}`
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
                <td style="padding:7px 10px"><span style="font-family:monospace;font-size:.78rem;font-weight:700;color:#6366f1">${row.reservation_number}</span></td>
                <td style="padding:7px 10px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.78rem;color:var(--text-primary)">${row.purpose}</td>
                <td style="padding:7px 10px;font-size:.75rem;color:var(--text-muted);white-space:nowrap">${row.department_name || '—'}</td>
                <td style="padding:7px 10px;font-size:.72rem;color:var(--text-muted);white-space:nowrap;font-family:monospace">${row.cost_center || '—'}</td>
                <td style="padding:7px 10px;font-size:.78rem;font-weight:600;direction:ltr;text-align:left;white-space:nowrap">${formatMoneyWithSAR(row.grand_total_sar || row.grand_total)}</td>
                <td style="padding:7px 10px">
                    <span style="display:inline-flex;align-items:center;gap:4px;font-size:.7rem;font-weight:500;padding:2px 8px;border-radius:20px;background:${color}18;color:${color};white-space:nowrap">
                        <span style="width:5px;height:5px;border-radius:50%;background:${color};flex-shrink:0"></span>
                        ${row.status}
                    </span>
                </td>
            </tr>`;
        }).join('');

        panel.innerHTML = `
        <div style="background:var(--bg-card);border-radius:8px;overflow:hidden;border:1px solid var(--border-color)">
            <div style="padding:6px 10px;background:var(--bg-surface);border-bottom:1px solid var(--border-color);display:flex;align-items:center;justify-content:space-between">
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

// ═══════════════════════════════════════════════════════════════
//  CSS — injectBudgetStyles (موحّد — بدون تكرار)
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

    /* ── بانر القسم ──────────────────────────────── */
    .budget-dept-banner { display:flex; align-items:center; gap:.85rem;
        background:linear-gradient(135deg,rgba(99,102,241,.1),rgba(139,92,246,.08));
        border:1px solid rgba(99,102,241,.25); border-radius:14px; padding:.85rem 1.2rem; }
    .budget-dept-banner-icon { font-size:1.6rem; width:44px; height:44px; border-radius:12px;
        background:rgba(99,102,241,.15); display:flex; align-items:center; justify-content:center; flex-shrink:0; }
    .budget-dept-banner-content { display:flex; flex-direction:column; gap:.18rem; }
    .budget-dept-banner-label   { font-size:.77rem; color:var(--text-muted); font-weight:500; }
    .budget-dept-banner-name    { font-size:1.05rem; font-weight:700;
        background:linear-gradient(135deg,#6366f1,#8b5cf6);
        -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; }

    /* ── حقل القسم التلقائي ─────────────────────────────── */
    .dept-auto-field { display:flex; align-items:center; min-height:42px; padding:.55rem .85rem;
        border-radius:10px; border:1px dashed var(--border-color); background:var(--bg-surface); }
    .dept-auto-value { font-size:.85rem; font-weight:600; color:var(--accent-blue);
        display:flex; align-items:center; gap:.4rem; }
    .dept-auto-value::before { content:'🏢'; font-size:.8rem; }
    .dept-auto-placeholder { font-size:.78rem; color:var(--text-muted); font-style:italic; }

    /* ── Searchable Select ───────────────────────────────── */
    .ss-wrap { position:relative; width:100%; }
    .ss-trigger { display:flex; align-items:center; justify-content:space-between;
        padding:.55rem .85rem; border-radius:10px; border:1px solid var(--border-color);
        background:var(--bg-card); cursor:pointer; min-height:42px;
        transition:border-color .15s,box-shadow .15s; user-select:none; }
    .ss-wrap.open .ss-trigger,
    .ss-trigger:hover { border-color:var(--accent-blue); }
    .ss-wrap.open .ss-trigger { box-shadow:0 0 0 3px rgba(99,102,241,.15); }
    .ss-display { font-size:.85rem; color:var(--text-primary); flex:1; min-width:0;
        overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .ss-ph { color:var(--text-muted); }
    .ss-arrow { color:var(--text-muted); flex-shrink:0; transition:transform .2s; }
    .ss-arrow.flipped { transform:rotate(180deg); }
    .ss-dropdown { display:none; position:absolute; top:calc(100% + 4px); right:0; left:0;
        background:var(--bg-card); border:1px solid var(--border-color); border-radius:12px;
        box-shadow:0 8px 32px rgba(0,0,0,.22); z-index:9999; overflow:hidden; animation:ssDrop .15s ease; }
    @keyframes ssDrop { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }
    .ss-wrap.open .ss-dropdown { display:block; }
    .ss-search-wrap { display:flex; align-items:center; gap:.5rem; padding:.6rem .8rem;
        border-bottom:1px solid var(--border-color); color:var(--text-muted); }
    .ss-search { flex:1; border:none; background:transparent; outline:none;
        font-size:.82rem; color:var(--text-primary); direction:rtl; }
    .ss-options { max-height:220px; overflow-y:auto; }
    .ss-option { padding:.5rem .85rem; font-size:.83rem; cursor:pointer;
        color:var(--text-primary); transition:background .1s; }
    .ss-option:hover    { background:var(--bg-surface); }
    .ss-option.selected { background:rgba(99,102,241,.1); color:#6366f1; font-weight:600; }

    /* ── إحصائيات ─────────────────────────────────── */
    .budget-stats-row  { display:grid; grid-template-columns:repeat(5,1fr); gap:.75rem; }
    .budget-stat-card  { background:var(--bg-card); border:1px solid var(--border-color);
        border-radius:12px; padding:.85rem 1rem; display:flex; align-items:center; gap:.75rem; }
    .budget-stat-card.wide { grid-column:span 1; }
    .bsc-icon  { width:40px; height:40px; border-radius:10px; display:flex;
        align-items:center; justify-content:center; font-size:1.1rem; flex-shrink:0; }
    .bsc-body  { display:flex; flex-direction:column; gap:.12rem; min-width:0; }
    .bsc-num   { font-size:1.25rem; font-weight:800; color:var(--text-primary); line-height:1; }
    .bsc-label { font-size:.73rem; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

    /* ── فلاتر ───────────────────────────────────── */
    .budget-filters-bar { display:flex; align-items:center; gap:.6rem; flex-wrap:wrap; }
    .filter-input  { padding:.48rem .85rem; border-radius:9px; border:1px solid var(--border-color);
        background:var(--bg-card); color:var(--text-primary); font-size:.83rem;
        min-width:200px; flex:1; }
    .filter-select { padding:.48rem .85rem; border-radius:9px; border:1px solid var(--border-color);
        background:var(--bg-card); color:var(--text-primary); font-size:.83rem; cursor:pointer; }

    /* ── جدول الحجوزات ──────────────────────────── */
    .budget-table-wrap   { background:var(--bg-card); border:1px solid var(--border-color);
        border-radius:14px; overflow:hidden; }
    .budget-table-legend { display:flex; align-items:center; gap:.75rem; flex-wrap:wrap;
        padding:.55rem 1rem; background:var(--bg-surface); border-bottom:1px solid var(--border-color); }
    .btl-title { font-size:.73rem; font-weight:600; color:var(--text-secondary); }
    .btl-item  { display:flex; align-items:center; gap:5px; font-size:.75rem; color:var(--text-secondary); white-space:nowrap; }
    .btl-dot   { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
    .budget-table      { width:100%; border-collapse:collapse; }
    .budget-table thead th { padding:.65rem 1rem; text-align:right; font-size:.75rem; font-weight:600;
        color:var(--text-secondary); background:var(--bg-surface); border-bottom:1px solid var(--border-color); }
    .res-row { cursor:pointer; transition:background .15s; }
    .res-row:hover td { background:var(--bg-surface); }
    .res-row td { padding:.75rem 1rem; border-bottom:1px solid var(--border-color);
        font-size:.83rem; vertical-align:middle; color:var(--text-primary); }
    .res-num    { font-weight:700; font-size:.88rem; color:var(--text-primary); font-family:monospace; }
    .res-date   { font-size:.74rem; color:var(--text-muted); margin-top:.15rem; }
    .res-purpose { font-weight:500; color:var(--text-primary); }
    .res-dept   { font-size:.74rem; color:var(--text-muted); }
    .res-amount { font-weight:600; color:var(--text-primary); text-align:left; direction:ltr; }
    .res-status-badge { display:inline-flex; align-items:center; gap:.3rem; padding:.3rem .7rem;
        border-radius:6px; font-size:.76rem; font-weight:600; white-space:nowrap; }
    .res-tx-badge { background:rgba(99,102,241,.12); color:#6366f1; padding:.2rem .55rem;
        border-radius:5px; font-size:.74rem; font-family:monospace; font-weight:600; }
    .res-tx-badge.unlinked { background:var(--bg-surface); color:var(--text-muted); }
    .budget-empty { text-align:center; padding:3rem; color:var(--text-muted); }
    .budget-empty h3 { margin:.75rem 0 .25rem; color:var(--text-secondary); }

    /* ── نموذج الحجز — خطوات ─────────────────── */
    .res-form-wrap  { display:flex; flex-direction:column; gap:1.25rem; }
    .res-form-body  { display:flex; flex-direction:column; gap:1rem; }
    .res-steps-bar  { display:flex; align-items:center; gap:0; }
    .res-step       { display:flex; align-items:center; gap:.5rem; }
    .res-step-circle { width:28px; height:28px; border-radius:50%; display:flex; align-items:center;
        justify-content:center; font-size:.78rem; font-weight:700; background:var(--bg-surface);
        color:var(--text-muted); border:2px solid var(--border-color); transition:all .2s; flex-shrink:0; }
    .res-step.active .res-step-circle { background:var(--btn-primary-bg); color:var(--btn-primary-text); border-color:var(--btn-primary-bg); }
    .res-step.done  .res-step-circle  { background:var(--accent-green); color:#fff; border-color:var(--accent-green); }
    .res-step-label { font-size:.78rem; color:var(--text-muted); white-space:nowrap; }
    .res-step.active .res-step-label  { color:var(--text-primary); font-weight:600; }
    .res-step-line  { flex:1; height:2px; background:var(--border-color); margin:0 .5rem; min-width:20px; }
    .res-form-grid  { display:grid; grid-template-columns:1fr 1fr; gap:.85rem; }
    .res-form-group { display:flex; flex-direction:column; gap:.35rem; }
    .res-form-group.full { grid-column:span 2; }
    .res-form-group label { font-size:.82rem; font-weight:600; color:var(--text-secondary); }
    .req { color:var(--accent-red); }
    .res-form-nav { display:flex; justify-content:space-between; padding-top:.5rem; border-top:1px solid var(--border-color); }

    /* ── جدول الأصناف ──────────────────────────── */
    .rf-items-wrap   { display:flex; flex-direction:column; gap:.4rem; }
    .rf-items-header { display:flex; align-items:center; gap:.5rem; padding:.4rem .6rem;
        background:var(--bg-surface); border-radius:8px; direction:rtl; font-size:.74rem; font-weight:700; color:var(--text-muted); }
    .rf-item-row     { display:flex; align-items:center; gap:.5rem; padding:.3rem 0;
        border-bottom:1px solid var(--border-color); direction:rtl; }
    .rf-item-row .form-input,
    .rf-item-row .form-select { padding:.42rem .6rem; font-size:.82rem; height:36px; }
    .rf-del-row { width:26px; height:26px; flex-shrink:0; border:none; background:transparent;
        cursor:pointer; color:var(--accent-red); font-size:.95rem; border-radius:4px;
        display:flex; align-items:center; justify-content:center; opacity:.5; transition:.15s; }
    .rf-del-row:hover { opacity:1; background:rgba(239,68,68,.1); }
    .rf-add-row-btn { display:flex; align-items:center; gap:.5rem; justify-content:center;
        width:100%; padding:.5rem; border:1.5px dashed var(--border-color); border-radius:8px;
        background:transparent; color:var(--text-muted); cursor:pointer; font-size:.82rem;
        font-family:inherit; transition:.15s; margin-top:.2rem; }
    .rf-add-row-btn:hover { border-color:var(--btn-primary-bg); color:var(--btn-primary-bg); background:rgba(99,102,241,.04); }
    .rf-totals-box { background:var(--bg-surface); border-radius:10px; padding:.7rem 1rem; display:flex; flex-direction:column; gap:.35rem; }
    .rf-total-row   { display:flex; justify-content:space-between; font-size:.82rem; color:var(--text-secondary); }
    .rf-total-row.grand { font-weight:700; font-size:.95rem; color:var(--accent-green);
        border-top:1px solid var(--border-color); padding-top:.35rem; margin-top:.15rem; }

    /* ── تفاصيل الحجز (rdv2) ─────────────────────── */
    .rdv2-shell      { display:flex; flex-direction:column; gap:0; }
    .rdv2-toolbar    { display:flex; justify-content:space-between; align-items:center;
        padding:.6rem .2rem .8rem; gap:.5rem; flex-wrap:wrap; }
    .rdv2-toolbar-left,.rdv2-toolbar-right { display:flex; gap:.45rem; align-items:center; }
    .rdv2-tool-btn   { display:inline-flex; align-items:center; gap:.45rem; padding:.42rem .9rem;
        border-radius:8px; font-size:.8rem; font-weight:600; cursor:pointer;
        border:1px solid var(--border-color); background:var(--bg-card); color:var(--text-secondary);
        font-family:inherit; transition:.15s; white-space:nowrap; }
    .rdv2-tool-btn:hover { border-color:var(--accent-blue); color:var(--accent-blue); background:rgba(99,102,241,.06); }
    .rdv2-review-btn { background:#10b981; border-color:#10b981; color:#fff; }
    .rdv2-review-btn:hover { background:#059669; border-color:#059669; color:#fff; }
    .rdv2-doc        { background:#fff; border:1px solid #e2e8f0; border-radius:14px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,.08); }
    .rdv2-doc-header { display:flex; justify-content:space-between; align-items:center;
        padding:1.1rem 1.4rem; background:linear-gradient(135deg,#1e3a5f,#1e40af); color:#fff; gap:1rem; }
    .rdv2-org-name   { font-size:.95rem; font-weight:700; }
    .rdv2-org-sub    { font-size:.68rem; opacity:.65; margin-top:.1rem; }
    .rdv2-doc-num    { font-size:1.3rem; font-weight:800; font-family:monospace; letter-spacing:1px; }
    .rdv2-doc-date   { font-size:.73rem; opacity:.75; }
    .rdv2-doc-badges { display:flex; gap:.4rem; flex-wrap:wrap; }
    .rdv2-status-badge,.rdv2-prio-badge { font-size:.71rem; font-weight:700; padding:.18rem .6rem;
        border-radius:20px; display:inline-flex; align-items:center; gap:.3rem; }
    .rdv2-divider    { height:1px; background:#f1f5f9; margin:0 1.25rem; }
    .rdv2-info-grid  { display:grid; grid-template-columns:repeat(4,1fr); gap:.6rem; padding:.85rem 1.25rem; }
    .rdv2-span2      { grid-column:span 2; }
    .rdv2-info-cell  { background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:.55rem .8rem; }
    .rdv2-info-lbl   { font-size:.65rem; color:#64748b; font-weight:700; text-transform:uppercase; letter-spacing:.5px; margin-bottom:.22rem; }
    .rdv2-info-val   { font-size:.86rem; font-weight:600; color:#1e293b; }
    .rdv2-info-val.rdv2-purpose { font-weight:500; line-height:1.5; font-size:.82rem; }
    .rdv2-mono       { font-family:monospace; }
    .rdv2-section-title { font-size:.7rem; font-weight:700; color:#64748b; text-transform:uppercase;
        letter-spacing:.6px; display:flex; align-items:center; gap:.4rem; padding:.1rem 1.25rem .4rem; }
    .rdv2-items-tbl  { width:100%; border-collapse:collapse; font-size:.81rem; }
    .rdv2-items-tbl thead tr { background:#1e40af; color:#fff; }
    .rdv2-items-tbl thead th { padding:.55rem 1rem; font-weight:600; font-size:.72rem; text-align:right; }
    .rdv2-items-tbl tbody tr:nth-child(even) { background:#f8fafc; }
    .rdv2-items-tbl tbody tr:hover { background:#eff6ff; transition:.1s; }
    .rdv2-items-tbl tbody td { padding:.5rem 1rem; border-bottom:1px solid #e2e8f0; color:#334155; }
    .rdv2-items-tbl tfoot tr { background:#dbeafe; }
    .rdv2-items-tbl tfoot td { border-top:2px solid #93c5fd; padding:.6rem 1rem; }
    .rdv2-lower-grid { display:grid; grid-template-columns:1fr 1fr; gap:.65rem; padding:.85rem 1.25rem 1.25rem; }
    .rdv2-panel      { background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:.8rem 1rem; }
    .rdv2-panel-dispatch { border-color:#c4b5fd; background:#faf5ff; }
    .rdv2-panel-head { font-size:.69rem; font-weight:700; color:#64748b; text-transform:uppercase;
        letter-spacing:.5px; margin-bottom:.55rem; padding-bottom:.4rem; border-bottom:1px solid #e2e8f0; }
    .rdv2-log-panel  { grid-column:span 2; }
    .rdv2-log-scroll { max-height:160px; overflow-y:auto; display:flex; flex-direction:column; gap:.5rem; }
    .rdv2-log-row    { display:flex; gap:.55rem; align-items:flex-start; }
    .rdv2-log-dot    { width:7px; height:7px; border-radius:50%; flex-shrink:0; margin-top:.38rem; }
    .rdv2-log-body   { flex:1; font-size:.78rem; }
    .rdv2-log-act    { font-weight:600; color:#1e293b; }
    .rdv2-log-st     { font-size:.7rem; font-weight:500; margin-right:.3rem; }
    .rdv2-log-who    { color:#64748b; font-size:.75rem; margin-right:.25rem; }
    .rdv2-log-when   { color:#94a3b8; font-size:.7rem; }
    .rdv2-log-note   { color:#475569; font-size:.73rem; margin-top:.12rem; background:#f1f5f9; padding:.18rem .45rem; border-radius:4px; }
    .rdv2-rejection-bar { background:#fef2f2; color:#ef4444; font-size:.76rem; padding:.35rem .7rem; border-radius:6px; border:1px solid #fecaca; margin-top:.3rem; }
    .rdv2-dispatch-badge-lg { font-size:.8rem; font-weight:600; padding:.3rem .85rem; border-radius:8px; display:inline-block; margin-bottom:.45rem; }
    .rdv2-dispatch-empty { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:.45rem; color:#94a3b8; font-size:.8rem; padding:1.2rem; text-align:center; }
    .rev-code-display { min-height:42px; padding:.55rem .85rem; background:rgba(30,64,175,.06);
        border:1.5px solid rgba(30,64,175,.25); border-radius:8px; font-family:monospace;
        font-size:.9rem; font-weight:700; color:#1e40af; display:flex; align-items:center; letter-spacing:.5px; }
    .res-details-footer { display:flex; justify-content:flex-start; gap:.625rem; padding-top:.75rem; border-top:1px solid var(--border-color); }

    /* ── modal footer ──────────────────────────────── */
    .modal-footer { display:flex; justify-content:flex-end; gap:.625rem;
        padding:.75rem 1.25rem; border-top:1px solid var(--border-color); background:var(--bg-surface); }

    /* ── الموازنة التقديرية ──────────────────────── */
    .bp-categories-list  { display:flex; flex-direction:column; gap:.4rem; }
    .bp-cat-row          { border:1px solid var(--border-color); border-radius:10px; overflow:hidden;
        background:var(--bg-card); transition:box-shadow .15s,border-color .15s; }
    .bp-cat-row:hover    { box-shadow:0 2px 10px rgba(0,0,0,.07); }
    .bp-cat-row.has-plan { border-color:rgba(99,102,241,.25); }
    .bp-cat-row.has-plan:hover { border-color:rgba(99,102,241,.45); }
    .bp-cat-header       { display:grid; grid-template-columns:22px 1fr 190px 110px 32px;
        align-items:center; gap:.75rem; padding:.6rem 1rem; cursor:pointer; user-select:none; }
    .bp-cat-header:hover { background:rgba(99,102,241,.02); }
    .bp-budget-input     { width:100%; padding:.35rem .6rem; border-radius:7px;
        border:1px solid var(--border-color); background:var(--bg-surface);
        color:var(--text-primary); font-size:.85rem; text-align:left; direction:ltr; }
    .bp-budget-input:focus      { outline:none; border-color:var(--accent-blue); box-shadow:0 0 0 2px rgba(77,171,247,.2); }
    .bp-budget-input.bp-budget-new { border-style:dashed; color:var(--text-muted); }
    .bp-sar-label        { font-size:1.75rem; color:var(--text-muted); white-space:nowrap; }
    .bp-cat-del          { background:none; border:none; cursor:pointer; color:var(--text-muted);
        font-size:.9rem; padding:.2rem; border-radius:4px; opacity:.5; transition:opacity .15s; }
    .bp-cat-del:hover    { opacity:1; color:#ef4444; }
    .bp-cat-del-hide     { visibility:hidden; }
    .bp-cc-panel         { border-top:1px solid var(--border-color); background:var(--bg-surface); }
    .bp-cc-header-row    { display:grid; grid-template-columns:36px 1fr 180px 1fr; gap:.5rem;
        padding:.4rem 1rem; font-size:.75rem; font-weight:700; color:var(--text-muted);
        border-bottom:1px solid var(--border-color); }
    .bp-cc-rows-wrap     { max-height:400px; overflow-y:auto; }
    .bp-cc-row           { display:grid; grid-template-columns:36px 1fr 180px 1fr; gap:.5rem;
        align-items:center; padding:.45rem 1rem; border-bottom:1px solid rgba(0,0,0,.04); transition:background .1s; }
    .bp-cc-row:hover     { background:var(--bg-card); }
    .bp-cc-row.active    { background:rgba(99,102,241,.05); }
    .bp-cc-toggle-wrap   { display:flex; align-items:center; justify-content:center; }
    .bp-cc-check         { width:16px; height:16px; cursor:pointer; accent-color:var(--accent-blue); }
    .bp-cc-name-wrap     { display:flex; flex-direction:column; gap:.05rem; overflow:hidden; }
    .bp-cc-code-sm       { font-size:.7rem; color:var(--text-muted); font-family:monospace; }
    .bp-cc-name-sm       { font-size:.82rem; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .bp-cc-amount-wrap   { display:flex; align-items:center; gap:.35rem; }
    .bp-cc-amount-input  { width:100%; padding:.3rem .5rem; border-radius:6px;
        border:1px solid var(--border-color); background:var(--bg-card);
        color:var(--text-primary); font-size:.83rem; text-align:left; direction:ltr; }
    .bp-cc-amount-input:disabled { opacity:.35; cursor:not-allowed; }
    .bp-cc-amount-input:focus    { outline:none; border-color:var(--accent-blue); }
    .bp-cc-reserved-wrap { display:flex; align-items:center; gap:.35rem; min-width:180px; }
    .bp-cc-stat          { display:flex; flex-direction:column; align-items:center; background:var(--bg-card);
        border-radius:6px; padding:.2rem .55rem; min-width:76px; flex:1; }
    .bp-cc-stat-lbl      { font-size:.68rem; color:var(--text-muted); line-height:1.2; }
    .bp-cc-stat-val      { font-size:.8rem; font-weight:700; line-height:1.4; }
    .bp-cc-stat-val.reserved { color:#f59e0b; }
    .bp-cc-stat-val.ok       { color:#22c55e; }
    .bp-cc-stat-val.over     { color:#ef4444; }
    .bp-cc-stat-sep      { width:1px; height:28px; background:var(--border-color); margin:0 .1rem; }
    .bp-cc-footer        { padding:.6rem 1rem; border-top:1px solid var(--border-color); background:var(--bg-card); }
    .bp-cc-footer-inner  { padding:.6rem .75rem; }
    .bp-cc-footer-cards  { display:flex; gap:.5rem; margin-bottom:.55rem; flex-wrap:wrap; }
    .bp-cc-footer-card   { flex:1; min-width:90px; background:var(--bg-card); border-radius:7px;
        padding:.35rem .6rem; border:1px solid var(--border-color); }
    .bp-cc-footer-card.over  { border-color:#ef444440; background:rgba(239,68,68,.06); }
    .bp-cc-footer-card.alloc { border-color:rgba(34,197,94,.3); background:rgba(34,197,94,.05); }
    .bp-cc-footer-card-lbl { display:block; font-size:.68rem; color:var(--text-muted); margin-bottom:.15rem; }
    .bp-cc-footer-card-val { font-size:.88rem; font-weight:700; color:var(--text-primary); }
    .bp-cc-footer-bar-wrap  { display:flex; align-items:center; gap:.5rem; }
    .bp-cc-footer-bar-track { flex:1; height:6px; background:var(--bg-surface); border-radius:4px;
        overflow:hidden; border:1px solid var(--border-color); }
    .bp-cc-footer-bar-fill  { height:100%; border-radius:4px; transition:width .4s; }
    .bp-cc-footer-bar-pct   { font-size:.75rem; font-weight:700; min-width:34px; text-align:left; }
    .bp-save-bar         { position:sticky; top:0; z-index:10; display:flex; align-items:center; gap:1rem;
        background:rgba(245,158,11,.12); border:1px solid rgba(245,158,11,.3);
        border-radius:10px; padding:.6rem 1.2rem; margin-bottom:1rem; flex-wrap:wrap; }
    #bp-save-bar-msg     { color:#b45309; font-weight:600; font-size:.85rem; flex:1; }

    /* year picker — مدمج بدون تكرار */
    .bp-year-picker      { display:flex; align-items:center; gap:.75rem; background:var(--bg-card);
        border:1px solid var(--border-color); border-radius:12px; padding:.45rem .85rem; }
    .bp-year-picker-label{ font-size:.78rem; font-weight:600; color:var(--text-muted); white-space:nowrap; }
    .bp-year-pills       { display:flex; gap:.35rem; }
    .bp-year-pill        { border:1.5px solid var(--border-color); background:transparent;
        color:var(--text-secondary); font-size:.85rem; font-weight:600; font-family:inherit;
        padding:.28rem .85rem; border-radius:8px; cursor:pointer; transition:all .18s; white-space:nowrap; }
    .bp-year-pill:hover  { border-color:#6366f1; color:#6366f1; background:rgba(99,102,241,.06); }
    .bp-year-pill.active { background:#6366f1; color:#fff; border-color:#6366f1; box-shadow:0 2px 8px rgba(99,102,241,.35); }

    /* مراجعة الموازنة */
    .res-review-wrap .res-form-grid { gap:.85rem; }

    /* budget-modal-wide */
    .budget-modal-wide { max-width:820px !important; width:95vw !important; }

    /* الـ Modal footer بدون تأثير على مودالات أخرى */
    #modal-footer:empty { display:none; }

    /* Responsive */
    @media (max-width:1100px) { .rdv2-info-grid { grid-template-columns:1fr 1fr; } }
    @media (max-width:700px) {
        .budget-stats-row { grid-template-columns:1fr 1fr; }
        .res-form-grid    { grid-template-columns:1fr; }
        .res-form-group.full { grid-column:span 1; }
        .rf-items-header  { display:none; }
        .rf-item-row      { flex-wrap:wrap; }
        .rdv2-lower-grid  { grid-template-columns:1fr; }
        .rdv2-log-panel   { grid-column:span 1; }
    }
    `;
    document.head.appendChild(s);

    // إزالة budget-modal-wide عند إغلاق المودال
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