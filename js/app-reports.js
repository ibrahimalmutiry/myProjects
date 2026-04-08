/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║          app-reports.js — مركز التقارير الموحد v2.0                 ║
 * ║          نظام إدارة معاملات القطاع المالي                           ║
 * ║          إصلاحات: أرقام غربية • أعمدة صحيحة • APIs صحيحة           ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */

/* ═══════════════════════════════════════════════════════════════════════
   أدوات التنسيق — أرقام غربية (1,234.56) مع نص عربي
   ═══════════════════════════════════════════════════════════════════════ */
function fmtNum(n, dec) {
    const num = parseFloat(n) || 0;
    return dec !== undefined
        ? num.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })
        : num.toLocaleString('en-US');
}
function fmtMoney(n) { return fmtNum(n, 2) + ' ر.س'; }
function fmtDate(val) {
    if (!val) return '—';
    try {
        const d = new Date(val);
        if (isNaN(d)) return String(val);
        return d.toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (e) { return String(val); }
}

/* ═══════════════════════════════════════════════════════════════════════
   0. حالة الوحدة
   ═══════════════════════════════════════════════════════════════════════ */
const ReportsModule = {
    activeReport: null,
    filters: { dateFrom: '', dateTo: '', status: '', search: '', columns: [] },
    data: { rows: [] },
    pagination: { page: 1, perPage: 50, total: 0 },
    _sortDir: null
};

/* ═══════════════════════════════════════════════════════════════════════
   1. تعريف التقارير
   ═══════════════════════════════════════════════════════════════════════ */
const REPORT_DEFINITIONS = [
    {
        id: 'transactions_summary',
        category: 'financial', icon: '📊', color: '#228be6',
        gradient: 'linear-gradient(135deg,#228be6,#15aabf)',
        title: 'ملخص المعاملات المالية',
        description: 'تقرير شامل بجميع المعاملات المالية مع حالاتها ومبالغها',
        apiEndpoint: 'api/?action=transactions&per_page=200',
        dataPath: 'data',
        columns: [
            { key: 'transaction_number', label: 'رقم المعاملة', width: '14%' },
            { key: 'transaction_type', label: 'النوع', width: '18%' },
            { key: 'amount', label: 'المبلغ', width: '14%', format: 'money' },
            { key: 'receive_status', label: 'الحالة', width: '14%', format: 'badge' },
            { key: 'description', label: 'الوصف', width: '22%' },
            { key: 'created_by_name', label: 'المنشئ', width: '10%' },
            { key: 'transaction_date', label: 'التاريخ', width: '10%', format: 'date' }
        ],
        defaultColumns: ['transaction_number', 'transaction_type', 'amount', 'receive_status', 'created_by_name', 'transaction_date'],
        hasChart: true, hasSummaryCards: true, filters: ['date', 'status', 'search']
    },
    {
        id: 'purchase_requests',
        category: 'operations', icon: '📋', color: '#7950f2',
        gradient: 'linear-gradient(135deg,#7950f2,#ae3ec9)',
        title: 'تقرير طلبات الشراء',
        description: 'متابعة طلبات الشراء وحالاتها ومراحل الاعتماد',
        apiEndpoint: 'api/purchase_requests_api.php?action=list',
        dataPath: 'data',
        columns: [
            { key: 'id', label: 'رقم الطلب', width: '8%' },
            { key: 'title', label: 'عنوان الطلب', width: '24%' },
            { key: 'total_amount', label: 'المبلغ الكلي', width: '14%', format: 'money' },
            { key: 'current_stage', label: 'الحالة', width: '15%', format: 'badge' },
            { key: 'priority', label: 'الأولوية', width: '10%', format: 'badge' },
            { key: 'requester_name', label: 'مقدم الطلب', width: '14%' },
            { key: 'department_name', label: 'الإدارة', width: '10%' },
            { key: 'created_at', label: 'التاريخ', width: '12%', format: 'date' }
        ],
        defaultColumns: ['id', 'title', 'total_amount', 'current_stage', 'priority', 'requester_name', 'department_name', 'created_at'],
        hasChart: false, hasSummaryCards: true, filters: ['date', 'status', 'priority', 'search']
    },
    {
        id: 'bank_accounts',
        category: 'financial', icon: '🏦', color: '#2f9e44',
        gradient: 'linear-gradient(135deg,#2f9e44,#20c997)',
        title: 'تقرير الحسابات البنكية',
        description: 'نظرة شاملة على الحسابات والأرصدة والودائع',
        apiEndpoint: 'api/?action=bank_accounts',
        dataPath: 'data',
        columns: [
            { key: 'bank_name', label: 'اسم البنك', width: '20%' },
            { key: 'account_name', label: 'اسم الحساب', width: '18%' },
            { key: 'account_number', label: 'رقم الحساب', width: '18%' },
            { key: 'account_type', label: 'نوع الحساب', width: '12%' },
            { key: 'currency', label: 'العملة', width: '8%' },
            { key: 'current_balance', label: 'الرصيد الحالي', width: '14%', format: 'money' },
            { key: 'is_active', label: 'الحالة', width: '10%', format: 'badge' }
        ],
        defaultColumns: ['bank_name', 'account_name', 'account_number', 'account_type', 'currency', 'current_balance', 'is_active'],
        hasChart: true, hasSummaryCards: true, filters: ['search']
    },
    {
        id: 'daily_payments',
        category: 'financial', icon: '💳', color: '#e67700',
        gradient: 'linear-gradient(135deg,#e67700,#f59f00)',
        title: 'تقرير المدفوعات اليومية',
        description: 'سجل المعاملات المالية المعلّقة في صف الدفع',
        apiEndpoint: 'api/daily_payments_api.php?action=get_pending_payments',
        dataPath: 'data',
        columns: [
            { key: 'transaction_number', label: 'رقم المعاملة', width: '16%' },
            { key: 'description', label: 'الوصف', width: '24%' },
            { key: 'amount', label: 'المبلغ', width: '14%', format: 'money' },
            { key: 'payment_method', label: 'طريقة الدفع', width: '14%' },
            { key: 'payment_status', label: 'الحالة', width: '13%', format: 'badge' },
            { key: 'transaction_date', label: 'التاريخ', width: '14%', format: 'date' }
        ],
        defaultColumns: ['transaction_number', 'description', 'amount', 'payment_method', 'payment_status', 'transaction_date'],
        hasChart: true, hasSummaryCards: true, filters: ['date', 'search']
    },
    {
        id: 'employees_performance',
        category: 'hr', icon: '👥', color: '#c2255c',
        gradient: 'linear-gradient(135deg,#c2255c,#e64980)',
        title: 'تقرير الموظفين',
        description: 'بيانات الموظفين ومستويات صلاحياتهم',
        apiEndpoint: 'api/settings.php?action=get_employees',
        dataPath: 'data',
        columns: [
            { key: 'name', label: 'اسم الموظف', width: '22%' },
            { key: 'employee_number', label: 'رقم الموظف', width: '13%' },
            { key: 'role', label: 'الدور', width: '15%' },
            { key: 'permission_level', label: 'مستوى الصلاحية', width: '18%', format: 'badge' },
            { key: 'supervisor_name', label: 'المشرف المباشر', width: '17%' },
            { key: 'is_active', label: 'الحالة', width: '10%', format: 'badge' }
        ],
        defaultColumns: ['name', 'employee_number', 'role', 'permission_level', 'supervisor_name', 'is_active'],
        hasChart: false, hasSummaryCards: false, filters: ['search']
    },
    {
        id: 'budget_reservations',
        category: 'financial', icon: '📁', color: '#3b82f6',
        gradient: 'linear-gradient(135deg,#3b82f6,#6366f1)',
        title: 'تقرير حجوزات الموازنة',
        description: 'حالة حجوزات الموازنة والمبالغ المخصصة',
        apiEndpoint: 'api/budget.php?action=list',
        dataPath: 'data',
        columns: [
            { key: 'reservation_number', label: 'رقم الحجز', width: '14%' },
            { key: 'purpose', label: 'الغرض', width: '24%' },
            { key: 'items_description', label: 'الوصف', width: '18%' },
            { key: 'grand_total_sar', label: 'المبلغ (ر.س)', width: '14%', format: 'money' },
            { key: 'status', label: 'الحالة', width: '12%', format: 'badge' },
            { key: 'department_name', label: 'الإدارة', width: '10%' },
            { key: 'request_date', label: 'التاريخ', width: '12%', format: 'date' }
        ],
        defaultColumns: ['reservation_number', 'purpose', 'grand_total_sar', 'status', 'department_name', 'request_date'],
        hasChart: true, hasSummaryCards: true, filters: ['date', 'status', 'search']
    },
    {
        id: 'correspondence',
        category: 'operations', icon: '📨', color: '#0ea5e9',
        gradient: 'linear-gradient(135deg,#0ea5e9,#06b6d4)',
        title: 'تقرير الخطابات والمراسلات',
        description: 'سجل الخطابات الواردة والصادرة وحالة المتابعة',
        apiEndpoint: 'api/correspondence_api.php?action=list',
        dataPath: 'data',
        columns: [
            { key: 'correspondence_number', label: 'رقم الخطاب', width: '15%' },
            { key: 'subject', label: 'الموضوع', width: '28%' },
            { key: 'type', label: 'النوع', width: '12%', format: 'badge' },
            { key: 'status', label: 'الحالة', width: '13%', format: 'badge' },
            { key: 'priority', label: 'الأولوية', width: '10%', format: 'badge' },
            { key: 'employee_name', label: 'المسؤول', width: '12%' },
            { key: 'created_at', label: 'التاريخ', width: '13%', format: 'date' }
        ],
        defaultColumns: ['correspondence_number', 'subject', 'type', 'status', 'priority', 'employee_name', 'created_at'],
        hasChart: false, hasSummaryCards: true, filters: ['date', 'type', 'status', 'search']
    },
    {
        id: 'sla_compliance',
        category: 'operations', icon: '⏱️', color: '#f59f00',
        gradient: 'linear-gradient(135deg,#f59f00,#e67700)',
        title: 'تقرير تجاوزات SLA',
        description: 'سجل تجاوزات SLA وتفاصيل المعاملات المتأخرة',
        apiEndpoint: 'api/?action=sla_breaches&limit=200&resolved=all',
        dataPath: 'data',
        columns: [
            { key: 'transaction_number', label: 'رقم المعاملة', width: '16%' },
            { key: 'employee_name', label: 'الموظف', width: '18%' },
            { key: 'employee_role', label: 'الدور', width: '13%' },
            { key: 'breach_type', label: 'نوع التجاوز', width: '16%', format: 'badge' },
            { key: 'stage', label: 'المرحلة', width: '13%' },
            { key: 'escalated_to_name', label: 'تم التصعيد إلى', width: '14%' },
            { key: 'resolved_at', label: 'تاريخ الحل', width: '13%', format: 'date' }
        ],
        defaultColumns: ['transaction_number', 'employee_name', 'breach_type', 'stage', 'escalated_to_name', 'resolved_at'],
        hasChart: true, hasSummaryCards: true, filters: ['date', 'search']
    }
];

/* ═══════════════════════════════════════════════════════════════════════
   2. تحميل الصفحة
   ═══════════════════════════════════════════════════════════════════════ */
function loadReportsPage() {
    showLoading();
    setTimeout(() => {
        DOM.mainContent.innerHTML = _renderHub();
        _initPage();
    }, 120);
}

function _initPage() {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    ReportsModule.filters.dateFrom = first.toISOString().split('T')[0];
    ReportsModule.filters.dateTo = now.toISOString().split('T')[0];
    const df = document.getElementById('rpt-date-from');
    const dt = document.getElementById('rpt-date-to');
    if (df) df.value = ReportsModule.filters.dateFrom;
    if (dt) dt.value = ReportsModule.filters.dateTo;
    loadReportsDashboardStats();
}

/* ═══════════════════════════════════════════════════════════════════════
   3. Hub الرئيسي
   ═══════════════════════════════════════════════════════════════════════ */
function _renderHub() {
    const cats = [
        { id: 'financial', label: 'مالي', icon: '💰' },
        { id: 'operations', label: 'عمليات', icon: '⚙️' },
        { id: 'hr', label: 'موارد بشرية', icon: '👥' }
    ];
    return `
    <div class="rpt-wrapper">
        <div class="rpt-topbar">
            <div class="rpt-topbar-right">
                <div class="rpt-topbar-icon">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                        <line x1="16" y1="13" x2="8" y2="13"/>
                        <line x1="16" y1="17" x2="8" y2="17"/>
                        <line x1="10" y1="9"  x2="8" y2="9"/>
                    </svg>
                </div>
                <div>
                    <h1 class="rpt-topbar-title">مركز التقارير</h1>
                    <p class="rpt-topbar-sub">إنشاء وتصدير جميع تقارير النظام من مكان واحد</p>
                </div>
            </div>
            <div class="rpt-topbar-left">
                <div class="rpt-global-filter">
                    <div class="rpt-filter-group">
                        <label>من تاريخ</label>
                        <input type="date" id="rpt-date-from" class="rpt-input"
                               onchange="ReportsModule.filters.dateFrom=this.value">
                    </div>
                    <div class="rpt-filter-group">
                        <label>إلى تاريخ</label>
                        <input type="date" id="rpt-date-to" class="rpt-input"
                               onchange="ReportsModule.filters.dateTo=this.value">
                    </div>
                    <button class="rpt-btn rpt-btn-secondary" onclick="loadReportsDashboardStats()">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
                            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                        </svg>
                        تحديث
                    </button>
                </div>
            </div>
        </div>

        <div class="rpt-stats-grid" id="rpt-global-stats">
            ${[1, 2, 3, 4].map(() => '<div class="rpt-stat-card skeleton"></div>').join('')}
        </div>

        <div class="rpt-search-bar">
            <div class="rpt-search-wrap">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input type="text" id="rpt-search-reports" class="rpt-search-input"
                       placeholder="ابحث عن تقرير..."
                       oninput="filterReportCards(this.value)">
            </div>
            <div class="rpt-category-tabs">
                <button class="rpt-cat-tab active" onclick="filterByCategory('all',this)">الكل</button>
                ${cats.map(c =>
        `<button class="rpt-cat-tab" onclick="filterByCategory('${c.id}',this)">${c.icon} ${c.label}</button>`
    ).join('')}
            </div>
        </div>

        <div class="rpt-cards-grid" id="rpt-cards-grid">
            ${REPORT_DEFINITIONS.map(r => _renderCard(r)).join('')}
        </div>

        <div class="rpt-viewer" id="rpt-viewer" style="display:none"></div>
    </div>`;
}

function _renderCard(r) {
    const catLabel = { financial: 'مالي', operations: 'تشغيلي', hr: 'موارد بشرية' }[r.category] || r.category;
    return `
    <div class="rpt-card" data-category="${r.category}" data-id="${r.id}" onclick="openReport('${r.id}')">
        <div class="rpt-card-header" style="background:${r.gradient}">
            <span class="rpt-card-icon">${r.icon}</span>
            <div class="rpt-card-badge">${catLabel}</div>
        </div>
        <div class="rpt-card-body">
            <h3 class="rpt-card-title">${r.title}</h3>
            <p class="rpt-card-desc">${r.description}</p>
            <div class="rpt-card-meta">
                <span class="rpt-col-count">${r.columns.length} أعمدة</span>
                ${r.hasChart ? '<span class="rpt-has-chart">📈 يتضمن رسوم</span>' : ''}
            </div>
        </div>
        <div class="rpt-card-footer">
            <button class="rpt-btn rpt-btn-primary"
                    onclick="event.stopPropagation(); openReport('${r.id}')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                </svg>
                عرض التقرير
            </button>
            <div class="rpt-quick-export">
                <button class="rpt-qe-btn" onclick="event.stopPropagation(); quickExport('${r.id}','excel')">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                    </svg> XLS
                </button>
                <button class="rpt-qe-btn" onclick="event.stopPropagation(); quickExport('${r.id}','pdf')">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                        <line x1="16" y1="13" x2="8" y2="13"/>
                    </svg> PDF
                </button>
            </div>
        </div>
    </div>`;
}

function filterByCategory(cat, btn) {
    document.querySelectorAll('.rpt-cat-tab').forEach(t => t.classList.remove('active'));
    if (btn) btn.classList.add('active');
    document.querySelectorAll('.rpt-card').forEach(card => {
        card.style.display = (cat === 'all' || card.dataset.category === cat) ? '' : 'none';
    });
}
function filterReportCards(q) {
    document.querySelectorAll('.rpt-card').forEach(card => {
        const def = REPORT_DEFINITIONS.find(r => r.id === card.dataset.id);
        card.style.display = (!q || (def && (def.title.includes(q) || def.description.includes(q)))) ? '' : 'none';
    });
}

/* ═══════════════════════════════════════════════════════════════════════
   4. إحصائيات الداشبورد
   ═══════════════════════════════════════════════════════════════════════ */
async function loadReportsDashboardStats() {
    try {
        const j = await fetch('api/?action=stats').then(r => r.json());
        const s = j.success ? (j.data || {}) : {};
        const cards = [
            { icon: '📄', label: 'إجمالي المعاملات', value: s.total || 0, color: '#228be6' },
            { icon: '✅', label: 'مكتملة', value: s.completed || 0, color: '#2f9e44' },
            { icon: '⏳', label: 'قيد المعالجة', value: s.pending || 0, color: '#e67700' },
            { icon: '🚨', label: 'عاجلة', value: s.urgent || 0, color: '#c92a2a' }
        ];
        const container = document.getElementById('rpt-global-stats');
        if (!container) return;
        container.innerHTML = cards.map(c => `
            <div class="rpt-stat-card" style="--card-accent:${c.color}">
                <div class="rpt-stat-icon" style="background:${c.color}20;color:${c.color}">${c.icon}</div>
                <div class="rpt-stat-body">
                    <span class="rpt-stat-value">${fmtNum(c.value)}</span>
                    <span class="rpt-stat-label">${c.label}</span>
                </div>
            </div>`).join('');
    } catch (e) { console.warn('Reports stats failed:', e); }
}

/* ═══════════════════════════════════════════════════════════════════════
   5. فتح تقرير
   ═══════════════════════════════════════════════════════════════════════ */
async function openReport(reportId) {
    const def = REPORT_DEFINITIONS.find(r => r.id === reportId);
    if (!def) return;

    ReportsModule.activeReport = def;
    ReportsModule.pagination.page = 1;
    ReportsModule._sortDir = null;
    ReportsModule.filters.columns = [...def.defaultColumns];

    const grid = document.getElementById('rpt-cards-grid');
    const viewer = document.getElementById('rpt-viewer');
    const search = document.querySelector('.rpt-search-bar');
    const stats = document.getElementById('rpt-global-stats');

    if (grid) grid.style.display = 'none';
    if (search) search.style.display = 'none';
    if (stats) stats.style.display = 'none';
    if (viewer) { viewer.style.display = 'block'; viewer.innerHTML = _renderViewer(def); }

    _initViewer(def);
    await fetchReportData(def);
}

/* ═══════════════════════════════════════════════════════════════════════
   6. مشاهد التقرير
   ═══════════════════════════════════════════════════════════════════════ */
function _renderViewer(def) {
    return `
    <div class="rpt-viewer-wrap">

        <div class="rpt-viewer-topbar">
            <button class="rpt-back-btn" onclick="closeReportViewer()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <polyline points="15 18 9 12 15 6"/>
                </svg>
                العودة للتقارير
            </button>
            <div class="rpt-viewer-title">
                <span class="rpt-viewer-icon" style="background:${def.gradient}">${def.icon}</span>
                <div><h2>${def.title}</h2><p>${def.description}</p></div>
            </div>
            <div class="rpt-viewer-actions">
                <button class="rpt-btn rpt-btn-outline" onclick="showPrintPreview()">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="6 9 6 2 18 2 18 9"/>
                        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                        <rect x="6" y="14" width="12" height="8"/>
                    </svg>
                    طباعة
                </button>
                <button class="rpt-btn rpt-btn-secondary" onclick="showExportModal('${def.id}')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="7 10 12 15 17 10"/>
                        <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    تصدير
                </button>
            </div>
        </div>

        <div class="rpt-filters-panel">
            <div class="rpt-filters-row">
                ${def.filters.includes('date') ? `
                <div class="rpt-filter-item">
                    <label>من تاريخ</label>
                    <input type="date" class="rpt-input" id="rv-date-from"
                           value="${ReportsModule.filters.dateFrom}"
                           onchange="ReportsModule.filters.dateFrom=this.value">
                </div>
                <div class="rpt-filter-item">
                    <label>إلى تاريخ</label>
                    <input type="date" class="rpt-input" id="rv-date-to"
                           value="${ReportsModule.filters.dateTo}"
                           onchange="ReportsModule.filters.dateTo=this.value">
                </div>` : ''}
                ${def.filters.includes('status') ? `
                <div class="rpt-filter-item">
                    <label>الحالة</label>
                    <select class="rpt-input" onchange="ReportsModule.filters.status=this.value">
                        <option value="">الكل</option>
                        <option>جديد</option><option>قيد المراجعة</option>
                        <option>معتمد</option><option>مرفوض</option><option>مكتمل</option>
                    </select>
                </div>` : ''}
                ${def.filters.includes('priority') ? `
                <div class="rpt-filter-item">
                    <label>الأولوية</label>
                    <select class="rpt-input" onchange="ReportsModule.filters.priority=this.value">
                        <option value="">الكل</option>
                        <option value="urgent">عاجل</option>
                        <option value="high">مرتفع</option>
                        <option value="normal">عادي</option>
                        <option value="low">منخفض</option>
                    </select>
                </div>` : ''}
                ${def.filters.includes('type') ? `
                <div class="rpt-filter-item">
                    <label>النوع</label>
                    <select class="rpt-input" onchange="ReportsModule.filters.type=this.value">
                        <option value="">الكل</option>
                        <option>وارد</option><option>صادر</option><option>داخلي</option>
                    </select>
                </div>` : ''}
                ${def.filters.includes('search') ? `
                <div class="rpt-filter-item rpt-filter-search">
                    <label>بحث</label>
                    <div class="rpt-search-wrap">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                        </svg>
                        <input type="text" class="rpt-search-input" placeholder="ابحث في البيانات..."
                               oninput="ReportsModule.filters.search=this.value; debouncedFetch()">
                    </div>
                </div>` : ''}
                <div class="rpt-filter-actions">
                    <button class="rpt-btn rpt-btn-primary"
                            onclick="fetchReportData(ReportsModule.activeReport)">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
                        </svg>
                        تطبيق
                    </button>
                    <button class="rpt-btn rpt-btn-ghost" onclick="resetReportFilters()">إعادة تعيين</button>
                </div>
            </div>
            <div class="rpt-columns-selector">
                <span class="rpt-cs-label">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
                        <line x1="8" y1="18" x2="21" y2="18"/>
                        <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/>
                        <line x1="3" y1="18" x2="3.01" y2="18"/>
                    </svg>
                    الأعمدة:
                </span>
                <div class="rpt-cs-pills">
                    ${def.columns.map(col => `
                    <label class="rpt-cs-pill ${def.defaultColumns.includes(col.key) ? 'active' : ''}">
                        <input type="checkbox" ${def.defaultColumns.includes(col.key) ? 'checked' : ''}
                               onchange="toggleReportColumn('${col.key}',this.checked)"
                               style="display:none">
                        ${col.label}
                    </label>`).join('')}
                </div>
            </div>
        </div>

        <div class="rpt-report-stats" id="rv-report-stats" style="display:none"></div>

        <div class="rpt-table-section">
            <div class="rpt-table-header">
                <span id="rv-row-count" class="rpt-row-count">جاري التحميل...</span>
                <div class="rpt-sort-wrap">
                    <label>ترتيب:</label>
                    <select class="rpt-input" id="rv-sort"
                            onchange="ReportsModule.filters.sort=this.value; fetchReportData(ReportsModule.activeReport)">
                        <option value="date_desc">الأحدث أولاً</option>
                        <option value="date_asc">الأقدم أولاً</option>
                        <option value="amount_desc">الأعلى مبلغاً</option>
                        <option value="amount_asc">الأقل مبلغاً</option>
                    </select>
                </div>
            </div>
            <div class="rpt-table-wrapper" id="rv-table-wrapper">
                <div class="rpt-loading-state">
                    <div class="rpt-spinner"></div>
                    <p>جاري تحميل البيانات...</p>
                </div>
            </div>
            <div class="rpt-pagination" id="rv-pagination" style="display:none"></div>

            <!-- زر إظهار الرسم البياني — أسفل الجدول دائماً -->
            <div class="rpt-chart-toggle-bar">
                <button class="rpt-chart-toggle-btn" id="rv-chart-toggle"
                        onclick="toggleReportChart()">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="20" x2="18" y2="10"/>
                        <line x1="12" y1="20" x2="12" y2="4"/>
                        <line x1="6"  y1="20" x2="6"  y2="14"/>
                        <line x1="2"  y1="20" x2="22" y2="20"/>
                    </svg>
                    عرض التمثيل البياني
                </button>
            </div>
        </div>

        <!-- قسم الرسم البياني — مخفي افتراضياً -->
        <div class="rpt-chart-section" id="rv-chart-section" style="display:none">
            <div class="rpt-chart-header">
                <h3>التمثيل البياني</h3>
                <div style="display:flex;gap:.5rem;align-items:center">
                    <div class="rpt-chart-types">
                        <button class="rpt-ct-btn active" onclick="switchChartType('bar',this)">أعمدة</button>
                        <button class="rpt-ct-btn" onclick="switchChartType('line',this)">خطي</button>
                        <button class="rpt-ct-btn" onclick="switchChartType('pie',this)">دائري</button>
                    </div>
                    <button class="rpt-btn rpt-btn-ghost" style="font-size:.76rem;padding:.3rem .7rem"
                            onclick="toggleReportChart()">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                        إخفاء
                    </button>
                </div>
            </div>
            <canvas id="rv-chart" height="260"></canvas>
        </div>

    </div>

    <div class="rpt-modal-overlay" id="rpt-export-modal" style="display:none"
         onclick="if(event.target===this) closeExportModal()">
        <div class="rpt-modal">
            <div class="rpt-modal-header">
                <h3>خيارات التصدير</h3>
                <button class="rpt-modal-close" onclick="closeExportModal()">✕</button>
            </div>
            <div class="rpt-modal-body" id="rpt-modal-body"></div>
        </div>
    </div>`;
}

function toggleReportChart() {
    const section = document.getElementById('rv-chart-section');
    const btn = document.getElementById('rv-chart-toggle');
    if (!section) return;

    const isHidden = section.style.display === 'none';
    section.style.display = isHidden ? 'block' : 'none';

    if (btn) {
        btn.innerHTML = isHidden
            ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                   <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
               </svg> إخفاء التمثيل البياني`
            : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                   <line x1="18" y1="20" x2="18" y2="10"/>
                   <line x1="12" y1="20" x2="12" y2="4"/>
                   <line x1="6"  y1="20" x2="6"  y2="14"/>
                   <line x1="2"  y1="20" x2="22" y2="20"/>
               </svg> عرض التمثيل البياني`;
        btn.classList.toggle('active', isHidden);
    }

    // ارسم الرسم عند أول ظهور
    if (isHidden && ReportsModule.data.rows?.length) {
        renderReportChart(ReportsModule.activeReport, ReportsModule.data.rows);
    }
    // مرر للرسم
    if (isHidden) setTimeout(() => section.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
}

function _initViewer(def) {
    let debTimer;
    window.debouncedFetch = function () {
        clearTimeout(debTimer);
        debTimer = setTimeout(() => fetchReportData(def), 450);
    };
}

function toggleReportColumn(key, checked) {
    const cols = ReportsModule.filters.columns;
    if (checked && !cols.includes(key)) cols.push(key);
    else if (!checked) { const i = cols.indexOf(key); if (i > -1) cols.splice(i, 1); }
    if (ReportsModule.data.rows) renderReportTable(ReportsModule.activeReport, ReportsModule.data.rows);
}

function resetReportFilters() {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    ReportsModule.filters.dateFrom = first.toISOString().split('T')[0];
    ReportsModule.filters.dateTo = now.toISOString().split('T')[0];
    ReportsModule.filters.status = '';
    ReportsModule.filters.search = '';
    const df = document.getElementById('rv-date-from');
    const dt = document.getElementById('rv-date-to');
    if (df) df.value = ReportsModule.filters.dateFrom;
    if (dt) dt.value = ReportsModule.filters.dateTo;
    fetchReportData(ReportsModule.activeReport);
}

/* ═══════════════════════════════════════════════════════════════════════
   7. جلب البيانات
   ═══════════════════════════════════════════════════════════════════════ */
async function fetchReportData(def) {
    const wrapper = document.getElementById('rv-table-wrapper');
    if (wrapper) wrapper.innerHTML = `
        <div class="rpt-loading-state">
            <div class="rpt-spinner"></div><p>جاري تحميل البيانات...</p>
        </div>`;

    try {
        const sep = def.apiEndpoint.includes('?') ? '&' : '?';
        const params = new URLSearchParams();
        if (ReportsModule.filters.dateFrom) params.set('date_from', ReportsModule.filters.dateFrom);
        if (ReportsModule.filters.dateTo) params.set('date_to', ReportsModule.filters.dateTo);
        if (ReportsModule.filters.status) params.set('status', ReportsModule.filters.status);
        if (ReportsModule.filters.search) params.set('search', ReportsModule.filters.search);
        const paramStr = params.toString();
        const url = def.apiEndpoint + (paramStr ? sep + paramStr : '');

        const res = await fetch(url);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const j = await res.json();

        let rows = [];
        if (j.success) {
            const raw = j[def.dataPath || 'data'];
            if (Array.isArray(raw)) rows = raw;
            else if (raw && typeof raw === 'object') {
                const inner = raw.items || raw.rows || raw.data;
                rows = Array.isArray(inner) ? inner : [];
            }
        }

        ReportsModule.data = { rows };
        ReportsModule.pagination.total = rows.length;

        renderReportSummaryCards(def, rows);
        renderReportTable(def, rows);
        renderPagination();

        const cnt = document.getElementById('rv-row-count');
        if (cnt) cnt.textContent = fmtNum(rows.length) + ' سجل';

    } catch (e) {
        console.error('Report fetch error [' + def.id + ']:', e);
        if (wrapper) wrapper.innerHTML = `
            <div class="rpt-empty-state">
                <div class="rpt-empty-icon">⚠️</div>
                <h4>تعذّر تحميل البيانات</h4>
                <p>${e.message || 'تحقق من الاتصال بالخادم'}</p>
                <button class="rpt-btn rpt-btn-primary"
                        onclick="fetchReportData(ReportsModule.activeReport)">
                    إعادة المحاولة
                </button>
            </div>`;
    }
}

/* ═══════════════════════════════════════════════════════════════════════
   8. بطاقات الملخص
   ═══════════════════════════════════════════════════════════════════════ */
function renderReportSummaryCards(def, rows) {
    if (!def.hasSummaryCards) return;
    const section = document.getElementById('rv-report-stats');
    if (!section) return;
    section.style.display = 'grid';

    const moneyCol = def.columns.find(c => c.format === 'money');
    const totalAmt = moneyCol ? rows.reduce((s, r) => s + (parseFloat(r[moneyCol.key]) || 0), 0) : null;
    const statusCol = def.columns.find(c => c.format === 'badge' && c.key === 'status');

    const isOk = v => ['مكتمل', 'معتمد', 'paid', 'completed', 'approved', 'resolved'].some(x => String(v).toLowerCase().includes(x));
    const isPen = v => ['قيد', 'pending', 'processing', 'معلق'].some(x => String(v).toLowerCase().includes(x));

    const cards = [
        { icon: '📊', label: 'إجمالي السجلات', value: fmtNum(rows.length), color: '#228be6' }
    ];
    if (totalAmt !== null)
        cards.push({ icon: '💰', label: `إجمالي ${moneyCol.label}`, value: fmtMoney(totalAmt), color: '#2f9e44' });
    if (statusCol) {
        const done = rows.filter(r => isOk(r[statusCol.key])).length;
        const pend = rows.filter(r => isPen(r[statusCol.key])).length;
        cards.push({ icon: '✅', label: 'مكتمل / معتمد', value: fmtNum(done), color: '#20c997' });
        cards.push({ icon: '⏳', label: 'قيد المعالجة', value: fmtNum(pend), color: '#e67700' });
    }

    section.innerHTML = cards.map(c => `
        <div class="rpt-stat-card" style="--card-accent:${c.color}">
            <div class="rpt-stat-icon" style="background:${c.color}20;color:${c.color}">${c.icon}</div>
            <div class="rpt-stat-body">
                <span class="rpt-stat-value">${c.value}</span>
                <span class="rpt-stat-label">${c.label}</span>
            </div>
        </div>`).join('');
}

/* ═══════════════════════════════════════════════════════════════════════
   9. الجدول
   ═══════════════════════════════════════════════════════════════════════ */
function renderReportTable(def, rows) {
    const wrapper = document.getElementById('rv-table-wrapper');
    if (!wrapper) return;

    const activeCols = def.columns.filter(c => ReportsModule.filters.columns.includes(c.key));

    if (!rows || rows.length === 0) {
        wrapper.innerHTML = `
            <div class="rpt-empty-state">
                <div class="rpt-empty-icon">📭</div>
                <h4>لا توجد بيانات</h4>
                <p>لم يتم العثور على سجلات تطابق الفلاتر المحددة</p>
            </div>`;
        return;
    }

    const moneyCols = activeCols.filter(c => c.format === 'money');
    const totalsPart = moneyCols.map(c => {
        const total = rows.reduce((s, r) => s + (parseFloat(r[c.key]) || 0), 0);
        return `&nbsp;|&nbsp; ${c.label}: <strong>${fmtMoney(total)}</strong>`;
    }).join('');

    wrapper.innerHTML = `
        <div class="rpt-table-scroll">
            <table class="rpt-table" id="rv-main-table">
                <thead>
                    <tr>
                        <th class="rpt-th-num">#</th>
                        ${activeCols.map(c =>
        `<th style="width:${c.width || 'auto'}" onclick="sortReportBy('${c.key}')">
                                ${c.label} <span class="rpt-sort-icon">↕</span>
                            </th>`
    ).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${rows.map((row, i) => `
                    <tr>
                        <td class="rpt-td-num">${i + 1}</td>
                        ${activeCols.map(c =>
        `<td>${_cellVal(row[c.key], c.format, c.key)}</td>`
    ).join('')}
                    </tr>`).join('')}
                </tbody>
                <tfoot>
                    <tr class="rpt-tfoot">
                        <td colspan="${activeCols.length + 1}">
                            إجمالي السجلات: <strong>${fmtNum(rows.length)}</strong>
                            ${totalsPart}
                        </td>
                    </tr>
                </tfoot>
            </table>
        </div>`;
}

/* ═══════════════════════════════════════════════════════════════════════
   10. تنسيق الخلايا
   ═══════════════════════════════════════════════════════════════════════ */
function _cellVal(val, format, key) {
    if (val === null || val === undefined || val === '')
        return '<span class="rpt-null">—</span>';

    // is_active → نشط / غير نشط
    if (key === 'is_active') {
        const ok = (val == 1 || val === true || val === 'نشط');
        return ok
            ? '<span class="rpt-badge rpt-badge-success">نشط</span>'
            : '<span class="rpt-badge rpt-badge-secondary">غير نشط</span>';
    }

    switch (format) {
        case 'money':
            return `<span class="rpt-money">${fmtMoney(val)}</span>`;
        case 'badge':
            return `<span class="rpt-badge rpt-badge-${_statusClass(val)}">${val}</span>`;
        case 'date':
            return fmtDate(val);
        case 'percent':
            return `<span class="rpt-percent">${fmtNum(val, 1)}%</span>`;
        default: {
            const str = String(val);
            return str.length > 70 ? str.substring(0, 70) + '...' : str;
        }
    }
}

// دالة قديمة للتوافق مع أي كود خارجي يستدعيها
function formatCellValue(val, format, key) { return _cellVal(val, format, key); }

function _statusClass(status) {
    const s = String(status).toLowerCase();
    if (['مكتمل', 'معتمد', 'paid', 'completed', 'approved', 'resolved', 'تم الدفع', 'مدفوع'].some(x => s.includes(x))) return 'success';
    if (['مرفوض', 'rejected', 'cancelled', 'ملغي', 'sla_breach', 'ola_breach'].some(x => s.includes(x))) return 'danger';
    if (['عاجل', 'urgent', 'متأخر', 'تحذير', 'sla_warning', 'ola_warning'].some(x => s.includes(x))) return 'warning';
    if (['جديد', 'new', 'pending', 'معلق', 'قيد', 'processing'].some(x => s.includes(x))) return 'info';
    return 'secondary';
}
function getStatusClass(s) { return _statusClass(s); } // توافق

function sortReportBy(key) {
    const rows = [...(ReportsModule.data.rows || [])];
    const col = ReportsModule.activeReport?.columns.find(c => c.key === key);
    const dir = ReportsModule._sortDir === key ? -1 : 1;
    ReportsModule._sortDir = dir === 1 ? key : null;
    rows.sort((a, b) => {
        if (col?.format === 'money') return (parseFloat(a[key] || 0) - parseFloat(b[key] || 0)) * dir;
        if (col?.format === 'date') return (new Date(a[key] || 0) - new Date(b[key] || 0)) * dir;
        return String(a[key] || '').localeCompare(String(b[key] || ''), 'ar') * dir;
    });
    ReportsModule.data.rows = rows;
    renderReportTable(ReportsModule.activeReport, rows);
}

/* ═══════════════════════════════════════════════════════════════════════
   11. الرسم البياني
   ═══════════════════════════════════════════════════════════════════════ */
let _reportChart = null;
let _chartType = 'bar';

function renderReportChart(def, rows) {
    const section = document.getElementById('rv-chart-section');
    if (!section) return;
    section.style.display = 'block';
    const canvas = document.getElementById('rv-chart');
    if (!canvas || typeof Chart === 'undefined') return;
    if (_reportChart) { _reportChart.destroy(); _reportChart = null; }

    const COLORS = ['#228be6', '#2f9e44', '#e67700', '#c2255c', '#7950f2', '#20c997', '#f59f00', '#0ea5e9'];
    let labels = [], data = [], colors = [];

    // أفضل عمود للرسم: الحالة أو نوع التجاوز
    const badgeCol = def.columns.find(c => c.format === 'badge' && ['status', 'breach_type', 'current_stage'].includes(c.key))
        || def.columns.find(c => c.format === 'badge');

    if (badgeCol && rows.length) {
        const counts = {};
        rows.forEach(r => { const v = r[badgeCol.key] || 'غير محدد'; counts[v] = (counts[v] || 0) + 1; });
        labels = Object.keys(counts);
        data = Object.values(counts);
        colors = labels.map((_, i) => COLORS[i % COLORS.length]);
    } else {
        // توزيع شهري للمبالغ
        const moneyCol = def.columns.find(c => c.format === 'money');
        const dateCol = def.columns.find(c => c.format === 'date');
        if (moneyCol && dateCol && rows.length) {
            const monthly = {};
            rows.forEach(r => {
                const d = new Date(r[dateCol.key] || '');
                if (!isNaN(d)) {
                    const k = d.toLocaleDateString('ar-SA', { month: 'short', year: '2-digit' });
                    monthly[k] = (monthly[k] || 0) + (parseFloat(r[moneyCol.key]) || 0);
                }
            });
            const keys = Object.keys(monthly).slice(-6);
            labels = keys;
            data = keys.map(k => monthly[k]);
            colors = keys.map((_, i) => COLORS[i % COLORS.length]);
        }
    }

    if (!labels.length) { section.style.display = 'none'; return; }

    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
    const textColor = isDark ? '#b5b0aa' : '#5a4240';

    _reportChart = new Chart(canvas, {
        type: _chartType,
        data: {
            labels,
            datasets: [{
                label: def.title,
                data,
                backgroundColor: _chartType === 'pie' ? colors : colors.map(c => c + 'bb'),
                borderColor: colors,
                borderWidth: 2,
                borderRadius: _chartType === 'bar' ? 6 : 0
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { labels: { color: textColor, font: { family: "'IBM Plex Sans Arabic'" } } }
            },
            scales: _chartType === 'pie' ? {} : {
                x: { ticks: { color: textColor }, grid: { color: gridColor } },
                y: { ticks: { color: textColor, callback: v => fmtNum(v) }, grid: { color: gridColor } }
            }
        }
    });
}

function switchChartType(type, btn) {
    _chartType = type;
    document.querySelectorAll('.rpt-ct-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    if (ReportsModule.data.rows) renderReportChart(ReportsModule.activeReport, ReportsModule.data.rows);
}

/* ═══════════════════════════════════════════════════════════════════════
   12. Pagination
   ═══════════════════════════════════════════════════════════════════════ */
function renderPagination() {
    const pag = document.getElementById('rv-pagination');
    if (!pag) return;
    const { page, perPage, total } = ReportsModule.pagination;
    const totalPages = Math.ceil(total / perPage);
    if (totalPages <= 1) { pag.style.display = 'none'; return; }
    pag.style.display = 'flex';
    const pages = [];
    for (let p = Math.max(1, page - 2); p <= Math.min(totalPages, page + 2); p++) pages.push(p);
    pag.innerHTML = `
        <button class="rpt-pag-btn" ${page <= 1 ? 'disabled' : ''} onclick="goToPage(${page - 1})">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="15 18 9 12 15 6"/></svg>
        </button>
        ${pages.map(p => `<button class="rpt-pag-btn ${p === page ? 'active' : ''}" onclick="goToPage(${p})">${p}</button>`).join('')}
        <button class="rpt-pag-btn" ${page >= totalPages ? 'disabled' : ''} onclick="goToPage(${page + 1})">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="9 18 15 12 9 6"/></svg>
        </button>
        <span class="rpt-pag-info">${page} / ${totalPages}</span>`;
}
function goToPage(p) { ReportsModule.pagination.page = p; fetchReportData(ReportsModule.activeReport); }

/* ═══════════════════════════════════════════════════════════════════════
   13. نافذة التصدير
   ═══════════════════════════════════════════════════════════════════════ */
function showExportModal(reportId) {
    const modal = document.getElementById('rpt-export-modal');
    const body = document.getElementById('rpt-modal-body');
    if (!modal || !body) return;
    body.innerHTML = `
        <div class="rpt-export-options">
            <h4>اختر صيغة التصدير</h4>
            <div class="rpt-export-types">
                <label class="rpt-export-type active" onclick="selectExportType('excel',this)">
                    <div class="rpt-et-icon" style="background:#16a34a20;color:#16a34a">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/>
                            <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                        </svg>
                    </div>
                    <span class="rpt-et-label">Excel (.xlsx)</span>
                    <span class="rpt-et-desc">جدول بيانات قابل للتعديل</span>
                    <input type="radio" name="export_type" value="excel" checked style="display:none">
                </label>
                <label class="rpt-export-type" onclick="selectExportType('pdf',this)">
                    <div class="rpt-et-icon" style="background:#dc262620;color:#dc2626">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/>
                        </svg>
                    </div>
                    <span class="rpt-et-label">PDF (.pdf)</span>
                    <span class="rpt-et-desc">مستند جاهز للطباعة</span>
                    <input type="radio" name="export_type" value="pdf" style="display:none">
                </label>
            </div>
            <div class="rpt-export-opts">
                <label class="rpt-opt-check"><input type="checkbox" id="exp-header" checked> <span>تضمين هيدر التقرير</span></label>
                <label class="rpt-opt-check"><input type="checkbox" id="exp-footer" checked> <span>تضمين فوتر الصفحة</span></label>
                <label class="rpt-opt-check"><input type="checkbox" id="exp-stats"  checked> <span>تضمين الإحصائيات</span></label>
            </div>
            <div class="rpt-export-footer">
                <button class="rpt-btn rpt-btn-primary" onclick="executeExport('${reportId}')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="7 10 12 15 17 10"/>
                        <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    تصدير الآن
                </button>
                <button class="rpt-btn rpt-btn-ghost" onclick="closeExportModal()">إلغاء</button>
            </div>
        </div>`;
    modal.style.display = 'flex';
}
function selectExportType(type, el) {
    document.querySelectorAll('.rpt-export-type').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    el.querySelector('input').checked = true;
}
function closeExportModal() {
    const m = document.getElementById('rpt-export-modal');
    if (m) m.style.display = 'none';
}
function quickExport(reportId, format) {
    const def = REPORT_DEFINITIONS.find(r => r.id === reportId);
    if (!def) return;
    if (ReportsModule.activeReport?.id === reportId && ReportsModule.data.rows?.length) {
        if (format === 'excel') exportToExcel(def, ReportsModule.data.rows);
        else exportToPDF(def, ReportsModule.data.rows);
        return;
    }
    showToast('⏳ جاري تجهيز بيانات التصدير...', 'info');
    fetch(def.apiEndpoint).then(r => r.json()).then(j => {
        const raw = j[def.dataPath || 'data'];
        const rows = Array.isArray(raw) ? raw : [];
        if (format === 'excel') exportToExcel(def, rows);
        else exportToPDF(def, rows);
    }).catch(() => showToast('❌ فشل تجهيز البيانات', 'error'));
}
function executeExport(reportId) {
    const def = REPORT_DEFINITIONS.find(r => r.id === reportId);
    if (!def) return;
    const type = document.querySelector('input[name="export_type"]:checked')?.value || 'excel';
    closeExportModal();
    if (type === 'excel') exportToExcel(def, ReportsModule.data.rows || []);
    else exportToPDF(def, ReportsModule.data.rows || []);
}

/* ═══════════════════════════════════════════════════════════════════════
   14. تصدير Excel (CSV + BOM)
   ═══════════════════════════════════════════════════════════════════════ */
function exportToExcel(def, rows) {
    try {
        showToast('⏳ جاري إنشاء ملف Excel...', 'info');
        const cols = def.columns.filter(c => ReportsModule.filters.columns.includes(c.key));
        const allC = cols.length ? cols : def.columns;

        let csv = '\uFEFF';
        csv += `"${def.title}"\n`;
        csv += `"تاريخ الإصدار: ${new Date().toLocaleDateString('ar-SA')}"\n`;
        csv += `"نظام إدارة معاملات القطاع المالي"\n\n`;
        csv += allC.map(c => `"${c.label}"`).join(',') + '\n';

        rows.forEach(row => {
            csv += allC.map(c => {
                let v = row[c.key] ?? '';
                if (c.key === 'is_active') v = (v == 1 || v === true) ? 'نشط' : 'غير نشط';
                else if (c.format === 'money') v = parseFloat(v) || 0;
                else if (c.format === 'date') v = fmtDate(v);
                return `"${String(v).replace(/"/g, '""')}"`;
            }).join(',') + '\n';
        });

        const moneyCols = allC.filter(c => c.format === 'money');
        if (moneyCols.length) {
            csv += '\n"الإجماليات"\n';
            moneyCols.forEach(c => {
                const t = rows.reduce((s, r) => s + (parseFloat(r[c.key]) || 0), 0);
                csv += `"${c.label}","${fmtMoney(t)}"\n`;
            });
        }

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${def.id}_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('✅ تم تصدير الملف بنجاح', 'success');
    } catch (e) {
        console.error('Excel export error:', e);
        showToast('❌ فشل تصدير Excel', 'error');
    }
}

/* ═══════════════════════════════════════════════════════════════════════
   15. تصدير PDF
   ═══════════════════════════════════════════════════════════════════════ */
function exportToPDF(def, rows) {
    showToast('⏳ جاري إنشاء PDF...', 'info');
    const selectedCols = def.columns.filter(c =>
        !ReportsModule.filters.columns.length || ReportsModule.filters.columns.includes(c.key)
    );
    const cols = (selectedCols.length ? selectedCols : def.columns).slice(0, 8);

    const now = new Date();
    const dateStr = now.toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr = now.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
    const userName = (typeof currentUser !== 'undefined' ? currentUser.name : '') || 'المستخدم';
    const moneyCols = cols.filter(c => c.format === 'money');
    const totalAmt = moneyCols.reduce((s, c) => s + rows.reduce((ss, r) => ss + (parseFloat(r[c.key]) || 0), 0), 0);

    const tableRows = rows.map((row, i) => {
        const cells = cols.map(c => {
            const val = row[c.key];
            if (val === null || val === undefined || val === '') return '<td>—</td>';
            if (c.key === 'is_active') {
                const ok = (val == 1 || val === true);
                return `<td><span class="badge ${ok ? 'badge-success' : 'badge-secondary'}">${ok ? 'نشط' : 'غير نشط'}</span></td>`;
            }
            if (c.format === 'money') return `<td><span class="money">${fmtMoney(val)}</span></td>`;
            if (c.format === 'badge') return `<td><span class="badge badge-${_statusClass(val)}">${val}</span></td>`;
            if (c.format === 'date') return `<td>${fmtDate(val)}</td>`;
            return `<td>${String(val).substring(0, 60)}</td>`;
        }).join('');
        return `<tr><td class="rn">${i + 1}</td>${cells}</tr>`;
    }).join('');

    const totalRow = `<tr><td colspan="${cols.length + 1}">
        الإجمالي: ${fmtNum(rows.length)} سجل
        ${moneyCols.map(c => {
        const t = rows.reduce((s, r) => s + (parseFloat(r[c.key]) || 0), 0);
        return ` | ${c.label}: ${fmtMoney(t)}`;
    }).join('')}
    </td></tr>`;

    const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8"><title>${def.title}</title>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'IBM Plex Sans Arabic',Arial,sans-serif;font-size:10.5px;color:#1a1a1a;direction:rtl;background:#fff}
@page{size:A4 landscape;margin:12mm 10mm}
@media print{thead{display:table-header-group}tfoot{display:table-footer-group}tr{page-break-inside:avoid}}
.hdr{display:flex;align-items:center;justify-content:space-between;padding-bottom:10px;border-bottom:3px solid #3F5950;margin-bottom:14px}
.hdr-r{display:flex;align-items:center;gap:10px}
.logo{width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#3F5950,#20c997);display:flex;align-items:center;justify-content:center;font-size:18px}
.sys{font-size:13px;font-weight:700;color:#3F5950}.sys-s{font-size:9px;color:#666;margin-top:1px}
.hdr-l{text-align:left}.rn2{font-size:15px;font-weight:700}.meta{font-size:8.5px;color:#555;margin-top:3px}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-bottom:12px}
.stat{background:#f8f9fa;border-radius:5px;padding:7px 9px;border-right:3px solid var(--c,#228be6)}
.stat-val{font-size:13px;font-weight:700;color:var(--c,#228be6)}.stat-lbl{font-size:8px;color:#666;margin-top:1px}
table{width:100%;border-collapse:collapse;font-size:9.5px}
thead th{background:#3F5950;color:#fff;padding:6px 7px;text-align:right;font-weight:600;border:1px solid #2a3f38;white-space:nowrap}
tbody tr:nth-child(even){background:#f9f9f9}
tbody td{padding:5px 7px;border:1px solid #e0e0e0;text-align:right;vertical-align:middle}
tfoot td{background:#3F5950;color:#fff;padding:6px 7px;font-weight:600;border:1px solid #2a3f38}
.badge{display:inline-block;padding:2px 6px;border-radius:3px;font-size:8px;font-weight:600}
.badge-success{background:#dcfce7;color:#166534}.badge-danger{background:#fee2e2;color:#991b1b}
.badge-warning{background:#fef3c7;color:#92400e}.badge-info{background:#dbeafe;color:#1d4ed8}
.badge-secondary{background:#f3f4f6;color:#374151}
.money{font-weight:600;color:#166534}.rn{color:#999;text-align:center;width:28px}
.ftr{margin-top:14px;padding-top:8px;border-top:1px solid #ddd;display:flex;justify-content:space-between;font-size:8.5px;color:#888}
</style>
</head>
<body>
<div class="hdr">
    <div class="hdr-r">
        <div class="logo">📊</div>
        <div>
            <div class="sys">نظام إدارة معاملات القطاع المالي</div>
            <div class="sys-s">Workflow Management System</div>
        </div>
    </div>
    <div class="hdr-l">
        <div class="rn2">${def.title}</div>
        <div class="meta">تاريخ الإصدار: ${dateStr} | الوقت: ${timeStr} | أعده: ${userName}</div>
    </div>
</div>
<div class="stats">
    <div class="stat" style="--c:#228be6">
        <div class="stat-val">${fmtNum(rows.length)}</div>
        <div class="stat-lbl">إجمالي السجلات</div>
    </div>
    ${moneyCols.length ? `
    <div class="stat" style="--c:#2f9e44">
        <div class="stat-val">${fmtMoney(totalAmt)}</div>
        <div class="stat-lbl">إجمالي المبالغ</div>
    </div>` : ''}
    <div class="stat" style="--c:#e67700">
        <div class="stat-val">${ReportsModule.filters.dateFrom || '—'}</div>
        <div class="stat-lbl">من تاريخ</div>
    </div>
    <div class="stat" style="--c:#7950f2">
        <div class="stat-val">${ReportsModule.filters.dateTo || '—'}</div>
        <div class="stat-lbl">إلى تاريخ</div>
    </div>
</div>
<table>
    <thead>
        <tr>
            <th class="rn">#</th>
            ${cols.map(c => `<th>${c.label}</th>`).join('')}
        </tr>
    </thead>
    <tbody>${tableRows}</tbody>
    <tfoot>${totalRow}</tfoot>
</table>
<div class="ftr">
    <span>نظام إدارة معاملات القطاع المالي © ${now.getFullYear()}</span>
    <span>تاريخ الطباعة: ${dateStr} ${timeStr}</span>
    <span>الصفحة 1 من 1</span>
</div>
</body></html>`;

    const win = window.open('', '_blank', 'width=1200,height=800');
    if (!win) { showToast('⚠️ يرجى السماح بالنوافذ المنبثقة', 'warning'); return; }
    win.document.write(html);
    win.document.close();
    setTimeout(() => { win.print(); showToast('✅ تم فتح نافذة الطباعة', 'success'); }, 900);
}

/* ═══════════════════════════════════════════════════════════════════════
   16. معاينة الطباعة والعودة
   ═══════════════════════════════════════════════════════════════════════ */
function showPrintPreview() {
    if (!ReportsModule.activeReport) return;
    exportToPDF(ReportsModule.activeReport, ReportsModule.data.rows || []);
}

function closeReportViewer() {
    const grid = document.getElementById('rpt-cards-grid');
    const viewer = document.getElementById('rpt-viewer');
    const search = document.querySelector('.rpt-search-bar');
    const stats = document.getElementById('rpt-global-stats');

    if (grid) grid.style.display = '';
    if (search) search.style.display = '';
    if (viewer) { viewer.style.display = 'none'; viewer.innerHTML = ''; }
    if (stats) stats.style.display = 'grid';

    if (_reportChart) { _reportChart.destroy(); _reportChart = null; }
    _chartType = 'bar';
    ReportsModule.activeReport = null;
    ReportsModule.data = { rows: [] };
    ReportsModule._sortDir = null;
}