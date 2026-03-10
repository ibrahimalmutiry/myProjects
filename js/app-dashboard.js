/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║         app-dashboard.js — لوحة التحكم الرئيسية v3          ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

// ═══════════════════════════════════════════════════════════
//  تحميل لوحة التحكم
// ═══════════════════════════════════════════════════════════
async function loadDashboard() {
    showLoading();
    try {
        const [statsRes, chartRes, urgentRes] = await Promise.all([
            fetch('api/?action=stats'),
            fetch('api/?action=chart'),
            fetch('api/?action=urgent')
        ]);

        const stats = await statsRes.json();
        const chart = await chartRes.json();
        const urgent = await urgentRes.json();

        if (stats.success) App.stats = stats.data;
        if (chart.success) App.chartData = chart.data;

        renderDashboard(urgent.success ? urgent.data : []);

    } catch (error) {
        showToast('خطأ في تحميل البيانات', 'error');
        console.error(error);
    }
}

// ═══════════════════════════════════════════════════════════
//  عرض لوحة التحكم
// ═══════════════════════════════════════════════════════════
function renderDashboard(urgentTransactions) {
    const s = App.stats || {};

    const html = `
    <div class="dash-wrapper">

        <!-- ══ شريط الترحيب ══ -->
        <div class="dash-topbar">
            <div class="dash-greeting">
                <span class="dash-greeting-icon">${getGreetingIcon()}</span>
                <div>
                    <h2 class="dash-greeting-text">${getGreeting()}، ${(currentUser?.name || 'المستخدم').split(' ')[0]}</h2>
                    <p class="dash-greeting-sub">${new Date().toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                </div>
            </div>
            <div class="dash-quick-actions">
          
                <button class="dash-qa-btn secondary" onclick="loadDashboard()">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                    تحديث
                </button>
            </div>
        </div>

        <!-- ══ KPI Cards ══ -->
        <div class="dash-kpi-grid">
            <div class="dash-kpi-card blue" onclick="switchTab('transactions')">
                <div class="dash-kpi-icon">📄</div>
                <div class="dash-kpi-body">
                    <span class="dash-kpi-value">${s.total || 0}</span>
                    <span class="dash-kpi-label">إجمالي المعاملات</span>
                </div>
            </div>
            <div class="dash-kpi-card green" onclick="switchTab('transactions')">
                <div class="dash-kpi-icon">✅</div>
                <div class="dash-kpi-body">
                    <span class="dash-kpi-value">${s.paid || 0}</span>
                    <span class="dash-kpi-label">معاملات مكتملة</span>
                </div>
            </div>
            <div class="dash-kpi-card orange" onclick="switchTab('transactions')">
                <div class="dash-kpi-icon">⚠️</div>
                <div class="dash-kpi-body">
                    <span class="dash-kpi-value" style="color:var(--accent-red)">${s.urgent || 0}</span>
                    <span class="dash-kpi-label">تحتاج متابعة</span>
                </div>
                ${(s.urgent || 0) > 0 ? '<div class="dash-kpi-pulse"></div>' : ''}
            </div>
            <div class="dash-kpi-card purple">
                <div class="dash-kpi-icon">💰</div>
                <div class="dash-kpi-body">
                    <span class="dash-kpi-value" style="font-size:1.05rem">${formatMoneyWithSAR(s.total_amount || 0)}</span>
                    <span class="dash-kpi-label">إجمالي المبالغ</span>
                </div>
            </div>
        </div>

        <!-- ══ الصف الرئيسي: عاجلة + نظرة عامة ══ -->
        <div class="dash-main-grid">

            <!-- المعاملات العاجلة - صفوف -->
            <div class="dash-panel">
                <div class="dash-panel-header">
                    <div class="dash-panel-title">
                        <span>⚠️</span>
                        <h3>المعاملات العاجلة</h3>
                        <span class="panel-badge red">${urgentTransactions.length}</span>
                    </div>
                    <div class="urgent-filters">
                        <button class="uf-btn active" onclick="filterUrgent('all',this)">الكل</button>
                        <button class="uf-btn" onclick="filterUrgent('عاجل',this)">🔴 عاجل</button>
                        <button class="uf-btn" onclick="filterUrgent('مهم',this)">🟠 مهم</button>
                        <button class="uf-btn" onclick="filterUrgent('متابعة',this)">⚠️ متابعة</button>
                    </div>
                </div>
                <div class="dash-rows-container">
                    ${urgentTransactions.length > 0 ? renderUrgentRows(urgentTransactions) : `
                    <div class="dash-empty"><div class="dash-empty-icon">✅</div><h4>لا توجد معاملات عاجلة</h4><p>جميع المعاملات تسير بشكل طبيعي</p></div>`}
                </div>
            </div>

                   <!-- آخر الحجوزات -->
            <div class="dash-panel">
                <div class="dash-panel-header">
                    <div class="dash-panel-title">
                        <span>📋</span>
                        <h3>آخر الحجوزات</h3>
                    </div>
                    <button class="dash-panel-link" onclick="switchTab('reservations')">
                        عرض الكل <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
                    </button>
                </div>
                <div id="reservationsContainer" class="dash-rows-container">
                    <div class="dash-loading-row">جاري التحميل...</div>
                </div>
            </div>

            <!-- نظرة عامة - صفوف -->
            <div class="dash-panel">
                <div class="dash-panel-header">
                    <div class="dash-panel-title">
                        <span>📊</span>
                        <h3>نظرة عامة على النظام</h3>
                    </div>
                </div>
                <div class="dash-rows-container" id="overviewRowsContainer">
                    ${renderSystemRows(s)}
                </div>
            </div>
                    <!-- الرصيد البنكي اليوم -->
            <div class="dash-panel">
                <div class="dash-panel-header">
                    <div class="dash-panel-title">
                        <span>🏦</span>
                        <h3>الرصيد البنكي — اليوم</h3>
                    </div>
                    <button class="dash-panel-link" onclick="switchTab('bank-accounts')">
                        عرض الكل <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
                    </button>
                </div>
                <div id="bankBalanceContainer" class="dash-rows-container">
                    <div class="dash-loading-row">جاري التحميل...</div>
                </div>
            </div>
        </div>

        <!-- ══ الصف الثاني: معدل الإنجاز + رصيد البنوك ══ -->
        <div class="dash-mid-grid">

            <!-- معدل ساعات الإنجاز -->
            <div class="dash-panel">
                <div class="dash-panel-header">
                    <div class="dash-panel-title">
                        <span>⏱️</span>
                        <h3>معدل ساعات إنجاز المعاملات</h3>
                    </div>
                </div>
                <div id="avgTimeContainer" class="dash-rows-container">
                    <div class="dash-loading-row">جاري التحميل...</div>
                </div>
            </div>

    
            <!-- ══ ملخص الودائع الاستثمارية ══ -->
            <div class="dash-panel">
                <div class="dash-panel-header">
                    <div class="dash-panel-title">
                        <span>💎</span>
                        <h3>الودائع الاستثمارية — هذا الشهر</h3>
                        <span class="panel-badge" id="invDashBadge" style="display:none;background:var(--accent-red)">!</span>
                    </div>
                    <button class="dash-panel-link" onclick="switchTab('bank-investments')">
                        عرض الكل <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
                    </button>
                </div>
                <div id="investmentsSummaryContainer" class="dash-rows-container">
                    <div class="dash-loading-row">جاري التحميل...</div>
                </div>
            </div>
        </div>

        <!-- ══ الصف الثالث: الحجوزات + الأحداث ══ -->
        <div class="dash-bottom-grid">

     

            <!-- آخر الأحداث -->
            <div class="dash-panel">
                <div class="dash-panel-header">
                    <div class="dash-panel-title">
                        <span>🕐</span>
                        <h3>آخر الأحداث</h3>
                        <span class="panel-badge blue" id="eventsCountBadge">...</span>
                    </div>
                    <button class="dash-panel-link" onclick="switchTab('performance')">
                        عرض الكل <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
                    </button>
                </div>
                <div id="dashEventsTimeline" class="dash-rows-container">
                    <div class="dash-loading-row">جاري التحميل...</div>
                </div>
            </div>
        </div>



    </div>`;

    DOM.mainContent.innerHTML = html;

    if (DOM.notificationBadge) {
        DOM.notificationBadge.textContent = s.urgent || 0;
        DOM.notificationBadge.style.display = (s.urgent || 0) > 0 ? 'flex' : 'none';
    }

    loadDashboardEvents();
    loadBankBalances();
    loadAvgCompletionTime();
    loadRecentReservations();
    renderDashboardChart();
    loadInvestmentsSummary();
}

// ═══════════════════════════════════════════════════════════
//  المعاملات العاجلة — صفوف
// ═══════════════════════════════════════════════════════════
function renderUrgentRows(transactions) {
    return transactions.slice(0, 8).map(tx => {
        const priority = tx.effective_priority || tx.alert_type || 'متابعة';
        let dot = '#ffa94d', icon = '⚠️';
        if (priority === 'عاجل') { dot = '#ff6b6b'; icon = '🔴'; }
        else if (priority === 'مهم') { dot = '#f59e0b'; icon = '🟠'; }

        return `
        <div class="dash-row urgent-row" data-priority="${priority}">
            <div class="dash-row-indicator" style="background:${dot}"></div>
            <div class="dash-row-icon">${icon}</div>
            <div class="dash-row-main">
                <span class="dash-row-title">${tx.transaction_number}</span>
                <span class="dash-row-sub">${(tx.description || '').substring(0, 40)}${(tx.description || '').length > 40 ? '...' : ''}</span>
            </div>
            <div class="dash-row-meta">
                <span class="dash-row-amount">${fmtMoneyCur(tx.amount, tx.currency)}</span>
                ${tx.priority_set_by_name ? `<span class="dash-row-tag">📌 ${tx.priority_set_by_name}</span>` : ''}
            </div>
            <div class="dash-row-actions">
                <button class="dr-btn" onclick="viewTransaction(${tx.id})" title="عرض">👁</button>
                <button class="dr-btn" onclick="showSetPriorityModal(${tx.id},'${tx.transaction_number}')" title="تحديد أولوية">⭐</button>
            </div>
        </div>`;
    }).join('') + (transactions.length > 8 ? `
        <div class="dash-row-more" onclick="switchTab('transactions')">+ ${transactions.length - 8} معاملات أخرى — عرض الكل</div>` : '');
}

// ═══════════════════════════════════════════════════════════
//  نظرة عامة — صفوف
// ═══════════════════════════════════════════════════════════
function renderSystemRows(s) {
    const rows = [
        { icon: '💼', name: 'المعاملات المالية', tab: 'transactions', cols: [{ v: s.total || 0, l: 'الكل' }, { v: s.paid || 0, l: 'مكتملة', c: 'green' }, { v: s.pending || 0, l: 'معلقة', c: 'orange' }, { v: s.urgent || 0, l: 'عاجلة', c: 'red' }] },
        { icon: '📥', name: 'قسم الاستلام', tab: 'transactions', cols: [{ v: s.received || 0, l: 'مستلمة', c: 'green' }, { v: Math.max(0, (s.total || 0) - (s.received || 0)), l: 'انتظار', c: 'orange' }] },
        { icon: '💰', name: 'قسم الموازنة', tab: 'transactions', cols: [{ v: s.total || 0, l: 'إجمالي' }, { v: formatMoneyWithSAR(s.total_amount || 0), l: 'المبالغ' }] },
        { icon: '💳', name: 'قسم الدفع', tab: 'transactions', cols: [{ v: s.paid || 0, l: 'مدفوع', c: 'green' }, { v: s.pending || 0, l: 'معلق', c: 'orange' }, { v: formatMoneyWithSAR(s.paid_amount || 0), l: 'المدفوعات' }] },
        { icon: '🧾', name: 'قسم الفوترة', tab: 'transactions', cols: [{ v: s.invoiced || 0, l: 'مفوترة', c: 'green' }, { v: Math.max(0, (s.total || 0) - (s.invoiced || 0)), l: 'قيد الإجراء', c: 'orange' }] },
        { icon: '📨', name: 'الخطابات والمراسلات', tab: 'correspondence', cols: [], id: 'corrRowCols' },
        { icon: '🏦', name: 'الحسابات البنكية', tab: 'bank-deposits', cols: [], id: 'bankRowCols' },
        { icon: '📑', name: 'الحجوزات', tab: 'reservations', cols: [], id: 'resRowCols' },
        { icon: '⏱️', name: 'نظام SLA', tab: 'sla', cols: [] },
    ];

    return rows.map(r => `
    <div class="dash-row system-row" onclick="switchTab('${r.tab}')">
        <div class="dash-row-icon">${r.icon}</div>
        <div class="dash-row-main">
            <span class="dash-row-title">${r.name}</span>
        </div>
        <div class="dash-row-cols" ${r.id ? `id="${r.id}"` : ''}">
            ${r.cols.map(c => `<div class="dash-col-stat"><span class="dcs-val ${c.c || ''}">${c.v}</span><span class="dcs-lbl">${c.l}</span></div>`).join('')}
            ${!r.cols.length && !r.id ? '<span class="dash-row-tag">اضغط للعرض</span>' : ''}
        </div>
        <svg class="dash-row-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
    </div>`).join('');
}

// ═══════════════════════════════════════════════════════════
//  الرصيد البنكي
// ═══════════════════════════════════════════════════════════
async function loadBankBalances() {
    const container = document.getElementById('bankBalanceContainer');
    if (!container) return;
    try {
        const res = await fetch('api/?action=bank_accounts');
        const result = await res.json();
        if (!result.success || !result.data?.length) {
            container.innerHTML = '<div class="dash-empty-sm">لا توجد حسابات بنكية</div>';
            return;
        }
        let totalBalance = 0;
        let html = result.data.map(acc => {
            const bal = parseFloat(acc.current_balance || 0);
            totalBalance += bal;
            const trend = bal >= parseFloat(acc.initial_balance || 0) ? 'up' : 'down';
            return `
            <div class="dash-row bank-row" onclick="switchTab('bank-accounts')">
                <div class="dash-row-icon">🏦</div>
                <div class="dash-row-main">
                    <span class="dash-row-title">${acc.account_name}</span>
                    <span class="dash-row-sub">${acc.bank_name} • ${acc.account_number || ''}</span>
                </div>
                <div class="dash-row-meta">
                    <span class="dash-row-amount ">${formatMoneyWithSAR(bal)}</span>
                    <span class="dash-row-tag">${acc.currency || 'SAR'}</span>
                </div>
            </div>`;
        }).join('');

        html += `
        <div class="dash-row total-row">
            <div class="dash-row-icon">💰</div>
            <div class="dash-row-main"><span class="dash-row-title" style="font-weight:800">إجمالي الأرصدة</span></div>
            <div class="dash-row-meta"><span class="dash-row-amount" style="font-size:1.05rem;font-weight:800">${formatMoneyWithSAR(totalBalance)}</span></div>
        </div>`;

        container.innerHTML = html;

        const bankCols = document.getElementById('bankRowCols');
        if (bankCols) bankCols.innerHTML = `
            <div class="dash-col-stat"><span class="dcs-val">${result.data.length}</span><span class="dcs-lbl">حساب</span></div>
            <div class="dash-col-stat"><span class="dcs-val green">${formatMoneyWithSAR(totalBalance)}</span><span class="dcs-lbl">الإجمالي</span></div>`;

    } catch (e) {
        if (container) container.innerHTML = '<div class="dash-empty-sm">خطأ في تحميل الأرصدة</div>';
    }
}

// ═══════════════════════════════════════════════════════════
//  معدل ساعات الإنجاز
// ═══════════════════════════════════════════════════════════
async function loadAvgCompletionTime() {
    const container = document.getElementById('avgTimeContainer');
    if (!container) return;
    try {
        const res = await fetch('api/?action=performance_summary');
        const result = await res.json();
        if (!result.success || !result.data?.length) {
            container.innerHTML = '<div class="dash-empty-sm">لا توجد بيانات أداء بعد</div>';
            return;
        }

        const stageMap = {};
        result.data.forEach(row => {
            const stage = row.stage || 'unknown';
            if (!stageMap[stage]) stageMap[stage] = { count: 0, sum: 0 };
            const cnt = parseInt(row.total_transactions) || 0;
            const avg = parseFloat(row.avg_duration) || 0;
            stageMap[stage].count += cnt;
            stageMap[stage].sum += avg * cnt;
        });

        const stageNames = {
            creation: { n: 'الإنشاء', i: '➕', c: '#4dabf7' },
            receiving: { n: 'الاستلام', i: '📥', c: '#69db7c' },
            budget: { n: 'الموازنة', i: '💰', c: '#3bc9db' },
            payment: { n: 'الدفع', i: '💳', c: '#ffa94d' },
            invoice: { n: 'الفوترة', i: '🧾', c: '#b197fc' },
        };

        let totalMin = 0, totalCount = 0;
        Object.values(stageMap).forEach(v => { totalMin += v.sum; totalCount += v.count; });
        const overallAvg = totalCount > 0 ? totalMin / totalCount : 0;

        let html = `
        <div class="dash-row avg-summary-row">
            <div class="dash-row-icon">📊</div>
            <div class="dash-row-main">
                <span class="dash-row-title">متوسط إنجاز المعاملة</span>
                <span class="dash-row-sub">${totalCount} معاملة محللة</span>
            </div>
            <div class="dash-row-meta">
                <span class="dash-row-amount">${formatMinutes(overallAvg)}</span>
            </div>
        </div>`;

        Object.entries(stageNames).forEach(([key, info]) => {
            const data = stageMap[key];
            if (!data || data.count === 0) return;
            const avg = data.sum / data.count;
            const pct = overallAvg > 0 ? Math.min(100, (avg / overallAvg) * 100) : 50;

            html += `
            <div class="dash-row perf-row">
                <div class="dash-row-icon" style="color:${info.c}">${info.i}</div>
                <div class="dash-row-main">
                    <span class="dash-row-title">${info.n}</span>
                    <div class="perf-bar-wrap"><div class="perf-bar" style="width:${pct}%;background:${info.c}"></div></div>
                </div>
                <div class="dash-row-meta">
                    <span class="dash-row-amount">${formatMinutes(avg)}</span>
                    <span class="dash-row-tag">${data.count} معاملة</span>
                </div>
            </div>`;
        });

        container.innerHTML = html;
    } catch (e) {
        if (container) container.innerHTML = '<div class="dash-empty-sm">خطأ في تحميل بيانات الأداء</div>';
    }
}

// ═══════════════════════════════════════════════════════════
//  آخر الحجوزات
// ═══════════════════════════════════════════════════════════
async function loadRecentReservations() {
    const container = document.getElementById('reservationsContainer');
    if (!container) return;
    try {
        const res = await fetch('api/budget.php?action=list');
        const result = await res.json();
        if (!result.success || !result.data?.length) {
            container.innerHTML = '<div class="dash-empty-sm">لا توجد حجوزات حديثة</div>';
            return;
        }

        const allData = result.data;
        const approved = allData.filter(r => r.status === 'معتمد').length;
        const pending = allData.filter(r => r.status === 'قيد المراجعة').length;
        const totalAmt = allData.reduce((s, r) => s + parseFloat(r.grand_total || 0), 0);

        const statusColors = {
            'مسودة': '#9ca3af', 'قيد المراجعة': '#ffa94d',
            'معتمد': '#69db7c', 'مرفوض': '#ff6b6b', 'مكتمل': '#4dabf7',
        };

        let html = `
        <div class="dash-row res-summary-row">
            <div class="dash-row-icon">📊</div>
            <div class="dash-row-main"><span class="dash-row-title">إجمالي الحجوزات</span></div>
            <div class="dash-row-cols">
                <div class="dash-col-stat"><span class="dcs-val">${allData.length}</span><span class="dcs-lbl">الكل</span></div>
                <div class="dash-col-stat"><span class="dcs-val green">${approved}</span><span class="dcs-lbl">معتمد</span></div>
                <div class="dash-col-stat"><span class="dcs-val orange">${pending}</span><span class="dcs-lbl">انتظار</span></div>
                <div class="dash-col-stat"><span class="dcs-val">${formatMoneyWithSAR(totalAmt)}</span><span class="dcs-lbl">إجمالي</span></div>
            </div>
        </div>`;

        html += allData.slice(0, 3).map(r => {
            const color = statusColors[r.status] || '#9ca3af';
            return `
            <div class="dash-row res-row" onclick="switchTab('reservations')">
                <div class="dash-row-indicator" style="background:${color}"></div>
                <div class="dash-row-icon">📋</div>
                <div class="dash-row-main">
                    <span class="dash-row-title">${r.reservation_number || r.purpose || 'حجز'}</span>
                    <span class="dash-row-sub">${r.department_name || ''}${r.requested_by_name ? ' • ' + r.requested_by_name : ''}</span>
                </div>
                <div class="dash-row-meta">
                    <span class="dash-row-amount">${fmtMoneyCur(parseFloat(r.grand_total || 0), r.currency)}</span>
                    <span class="dash-row-tag" style="color:${color}">${r.status}</span>
                </div>
            </div>`;
        }).join('');

        container.innerHTML = html;

        const resCols = document.getElementById('resRowCols');
        if (resCols) resCols.innerHTML = `
            <div class="dash-col-stat"><span class="dcs-val">${allData.length}</span><span class="dcs-lbl">الكل</span></div>
            <div class="dash-col-stat"><span class="dcs-val green">${approved}</span><span class="dcs-lbl">معتمد</span></div>
            <div class="dash-col-stat"><span class="dcs-val orange">${pending}</span><span class="dcs-lbl">انتظار</span></div>`;

    } catch (e) {
        if (container) container.innerHTML = '<div class="dash-empty-sm">خطأ في تحميل الحجوزات</div>';
    }
}

// ═══════════════════════════════════════════════════════════
//  آخر الأحداث
// ═══════════════════════════════════════════════════════════
async function loadDashboardEvents() {
    const container = document.getElementById('dashEventsTimeline');
    if (!container) return;
    try {
        const res = await fetch('api/?action=all_events&limit=8');
        const result = await res.json();
        if (!result.success || !result.data?.length) {
            container.innerHTML = '<div class="dash-empty-sm">لا توجد أحداث</div>';
            return;
        }
        const badge = document.getElementById('eventsCountBadge');
        if (badge) badge.textContent = result.data.length;

        const si = {
            creation: { n: 'إنشاء', c: '#4dabf7', i: '➕' },
            receiving: { n: 'استلام', c: '#69db7c', i: '📥' },
            budget: { n: 'موازنة', c: '#3bc9db', i: '💰' },
            payment: { n: 'دفع', c: '#ffa94d', i: '💳' },
            invoice: { n: 'فوترة', c: '#b197fc', i: '🧾' },
        };

        container.innerHTML = result.data.map(e => {
            const info = si[e.stage] || { n: e.stage, c: '#888', i: '📋' };
            return `
            <div class="dash-row event-row">
                <div class="dash-row-icon" style="color:${info.c}">${info.i}</div>
                <div class="dash-row-main">
                    <span class="dash-row-title">${e.transaction_number || '-'}</span>
                    <span class="dash-row-sub">${e.old_status ? `<s style="color:var(--text-muted)">${e.old_status}</s> → ` : ''}<strong>${e.new_status || e.action || ''}</strong></span>
                </div>
                <div class="dash-row-meta">
                    <span class="dash-row-tag" style="background:${info.c}18;color:${info.c}">${info.n}</span>
                    <span class="dash-row-time">${formatTimeAgo(e.event_time)}</span>
                </div>
            </div>`;
        }).join('');

        loadCorrStats();
    } catch (e) {
        if (container) container.innerHTML = '<div class="dash-empty-sm">خطأ في التحميل</div>';
    }
}

async function loadCorrStats() {
    try {
        const res = await fetch('api/correspondence_api.php?action=stats');
        const r = await res.json();
        if (!r.success) return;
        const el = document.getElementById('corrRowCols');
        if (el) el.innerHTML = `
            <div class="dash-col-stat"><span class="dcs-val">${r.data.total || 0}</span><span class="dcs-lbl">الكل</span></div>
            <div class="dash-col-stat"><span class="dcs-val orange">${r.data.pending || 0}</span><span class="dcs-lbl">معالجة</span></div>
            <div class="dash-col-stat"><span class="dcs-val red">${r.data.urgent || 0}</span><span class="dcs-lbl">عاجلة</span></div>`;
    } catch (e) { }
}

// ═══════════════════════════════════════════════════════════
//  الرسم البياني
// ═══════════════════════════════════════════════════════════
function renderDashboardChart() {
    const data = App.chartData || [];
    const canvas = document.getElementById('dashLineChart');
    if (!canvas || !data.length) return;
    const ctx = canvas.getContext('2d');
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const tc = isDark ? '#9ca3af' : '#6b7280';
    const gc = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
    if (window._dashChart) window._dashChart.destroy();
    window._dashChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map(d => d.month),
            datasets: [{ label: 'المعاملات', data: data.map(d => d.count), borderColor: '#667eea', backgroundColor: 'rgba(102,126,234,0.1)', borderWidth: 2.5, pointBackgroundColor: '#667eea', pointRadius: 5, pointHoverRadius: 7, fill: true, tension: 0.4 }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { backgroundColor: isDark ? '#1f2937' : '#fff', titleColor: isDark ? '#f9fafb' : '#111', bodyColor: isDark ? '#d1d5db' : '#374151', borderColor: isDark ? '#374151' : '#e5e7eb', borderWidth: 1, padding: 10, cornerRadius: 8 } },
            scales: { x: { grid: { color: gc }, ticks: { color: tc, font: { size: 11 } } }, y: { beginAtZero: true, grid: { color: gc }, ticks: { color: tc, stepSize: 1, font: { size: 11 } } } }
        }
    });
}

// ═══════════════════════════════════════════════════════════
//  فلترة العاجلة
// ═══════════════════════════════════════════════════════════
function filterUrgent(type, btn) {
    document.querySelectorAll('.uf-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.urgent-row').forEach(row => {
        row.style.display = (type === 'all' || row.dataset.priority === type) ? '' : 'none';
    });
}

// ═══════════════════════════════════════════════════════════
//  نافذة تحديد الأولوية
// ═══════════════════════════════════════════════════════════
function showSetPriorityModal(txId, txNumber) {
    DOM.modalTitle.textContent = `📌 تحديد أولوية — ${txNumber}`;
    DOM.modalBody.innerHTML = `
    <div class="priority-modal">
        <p style="font-size:.875rem;color:var(--text-secondary);margin:0 0 1.25rem">اختر مستوى الأولوية لهذه المعاملة</p>
        <div class="priority-options">
            <label class="priority-option urgent-opt"><input type="radio" name="priority" value="urgent">
                <div class="priority-opt-content"><span style="font-size:1.4rem">🔴</span><div><strong>عاجل جداً</strong><p>يتطلب اهتماماً فورياً</p></div></div></label>
            <label class="priority-option high-opt"><input type="radio" name="priority" value="high">
                <div class="priority-opt-content"><span style="font-size:1.4rem">🟠</span><div><strong>مهم</strong><p>أولوية عالية تحتاج متابعة</p></div></div></label>
            <label class="priority-option normal-opt"><input type="radio" name="priority" value="normal" checked>
                <div class="priority-opt-content"><span style="font-size:1.4rem">🟢</span><div><strong>عادي</strong><p>إزالة من قائمة العاجلة</p></div></div></label>
        </div>
        <div class="form-group" style="margin-top:1rem">
            <label>ملاحظة (اختياري)</label>
            <input type="text" id="priorityNote" class="form-control" placeholder="سبب تحديد الأولوية...">
        </div>
        <div style="display:flex;gap:.75rem;margin-top:1.5rem;justify-content:flex-end">
            <button class="btn btn-primary" onclick="submitSetPriority(${txId})">حفظ</button>
            <button class="btn btn-ghost" onclick="closeModal()">إلغاء</button>
        </div>
    </div>`;
    openModal();
}

async function submitSetPriority(txId) {
    const priority = document.querySelector('input[name="priority"]:checked')?.value || 'normal';
    const note = document.getElementById('priorityNote')?.value || '';
    try {
        const res = await fetch('api/?action=set_priority', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: txId, priority, note }) });
        const r = await res.json();
        if (r.success) { showToast('تم تحديث الأولوية', 'success'); closeModal(); loadDashboard(); }
        else showToast(r.message || 'فشل التحديث', 'error');
    } catch (e) { showToast('خطأ في الاتصال', 'error'); }
}

// ═══════════════════════════════════════════════════════════
//  دوال مساعدة
// ═══════════════════════════════════════════════════════════
function getGreeting() {
    const h = new Date().getHours();
    return h < 12 ? 'صباح الخير' : h < 17 ? 'مساء الخير' : 'مساء النور';
}
function getGreetingIcon() {
    const h = new Date().getHours();
    return h < 12 ? '🌅' : h < 17 ? '☀️' : '🌙';
}
function formatMinutes(min) {
    if (!min || min <= 0) return '—';
    min = Math.round(min);
    if (min < 60) return `${min} دقيقة`;
    if (min < 1440) return `${Math.round(min / 60)} ساعة`;
    return `${Math.round(min / 1440)} يوم`;
}
function formatDuration(minutes) {
    if (!minutes || minutes <= 0) return 'الآن';
    const d = Math.floor(minutes / 1440), h = Math.floor((minutes % 1440) / 60), m = minutes % 60;
    const p = [];
    if (d > 0) p.push(`${d}ي`); if (h > 0) p.push(`${h}س`); if (m > 0 && d === 0) p.push(`${m}د`);
    return p.join(' ');
}
function formatTimeAgo(datetime) {
    if (!datetime) return '';
    const diff = Math.floor((new Date() - new Date(datetime)) / 1000);
    if (diff < 60) return 'الآن';
    if (diff < 3600) return Math.floor(diff / 60) + ' د';
    if (diff < 86400) return Math.floor(diff / 3600) + ' س';
    return Math.floor(diff / 86400) + ' ي';
}

// ═══════════════════════════════════════════════════════════
//  صفحة متابعة الأداء المستقلة
// ═══════════════════════════════════════════════════════════
async function loadPerformancePage() {
    showLoading();
    DOM.mainContent.innerHTML = `
    <div class="performance-page">
        <div class="perf-header">
            <div class="perf-header-content">
                <div class="perf-title">
                    <div class="perf-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div>
                    <div><h1>متابعة الأداء</h1><p>سجل أحداث وتغييرات المعاملات في النظام</p></div>
                </div>
                <div class="perf-header-stats">
                    <div class="header-stat"><span class="stat-number" id="totalEventsToday">-</span><span class="stat-label">أحداث اليوم</span></div>
                    <div class="header-stat"><span class="stat-number" id="avgTimeToday">-</span><span class="stat-label">متوسط الوقت</span></div>
                </div>
            </div>
        </div>
        <div class="perf-filters">
            <div class="filter-group"><label>المرحلة</label>
                <select id="perfStageFilter" onchange="loadEventsTimeline()">
                    <option value="">جميع المراحل</option>
                    <option value="creation">الإنشاء</option>
                    <option value="receiving">الاستلام</option>
                    <option value="budget">الموازنة</option>
                    <option value="payment">الدفع</option>
                    <option value="invoice">الفوترة</option>
                </select>
            </div>
            <div class="filter-group"><label>من تاريخ</label>
                <input type="date" id="perfDateFrom" onchange="loadEventsTimeline()">
            </div>
            <div class="filter-group"><label>إلى تاريخ</label>
                <input type="date" id="perfDateTo" onchange="loadEventsTimeline()">
            </div>
            <button class="filter-reset" onclick="resetPerfFilters()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                إعادة تعيين
            </button>
        </div>
        <div class="perf-content">
            <div class="perf-section">
                <div class="section-header"><h3>سجل جميع الأحداث والتغييرات</h3><span class="events-count" id="eventsCount">-</span></div>
                <div id="eventsTimeline" class="events-timeline-container"></div>
            </div>
        </div>
    </div>`;
    loadEventsTimeline();
}

function resetPerfFilters() {
    ['perfStageFilter', 'perfDateFrom', 'perfDateTo'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    loadEventsTimeline();
}



// ═══════════════════════════════════════════════════════════
//  ملخص الودائع الاستثمارية — لوحة التحكم
// ═══════════════════════════════════════════════════════════
async function loadInvestmentsSummary() {
    const container = document.getElementById('investmentsSummaryContainer');
    if (!container) return;

    try {
        const res = await fetch('api/?action=investments');
        const result = await res.json();

        // تعريف جميع المتغيرات أولاً بغض النظر عن النتيجة
        const investments = result.success ? (result.data || []) : [];
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        const active = investments.filter(i => i.status === 'نشط');

        const thisMonthMaturities = investments.filter(i => {
            if (!i.maturity_date) return false;
            const mat = new Date(i.maturity_date);
            return mat >= startOfMonth && mat <= endOfMonth;
        });

        const thisMonthTotal = thisMonthMaturities.reduce((s, i) => s + parseFloat(i.amount || 0), 0);
        const thisMonthProfit = thisMonthMaturities.reduce((s, i) => s + parseFloat(i.expected_profit || 0), 0);
        const thisMonthDone = thisMonthMaturities.filter(i => i.status === 'منتهي').length;
        const thisMonthPending = thisMonthMaturities.filter(i => i.status === 'نشط').length;
        const overdueCount = investments.filter(i => i.maturity_status === 'مستحق').length;

        // تحديث badge التنبيه
        const badge = document.getElementById('invDashBadge');
        if (badge) {
            badge.textContent = overdueCount;
            badge.style.display = overdueCount > 0 ? 'inline-flex' : 'none';
        }

        // لا توجد ودائع تستحق هذا الشهر
        if (thisMonthMaturities.length === 0) {
            container.innerHTML = `
            <div style="padding:0.75rem 1rem;border-bottom:1px solid var(--border-color)">
                <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:0.75rem">
                    <div style="text-align:center">
                        <div style="font-size:1.25rem;font-weight:700;color:var(--accent-blue)">${active.length}</div>
                        <div style="font-size:0.75rem;color:var(--text-muted)">وديعة نشطة</div>
                    </div>
                    <div style="text-align:center">
                        <div style="font-size:1rem;font-weight:700;color:${overdueCount > 0 ? 'var(--accent-red)' : 'var(--text-muted)'}">${overdueCount}</div>
                        <div style="font-size:0.75rem;color:var(--text-muted)">مستحقة الإغلاق</div>
                    </div>
                </div>
            </div>
            <div class="dash-empty-sm">لا توجد ودائع تستحق هذا الشهر</div>`;
            return;
        }

        // بطاقات الإحصاءات
        let html = `
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0.75rem;padding:0.75rem 1rem;border-bottom:1px solid var(--border-color)">
            <div style="text-align:center">
                <div style="font-size:1.25rem;font-weight:700;color:var(--accent-blue)">${thisMonthMaturities.length}</div>
                <div style="font-size:0.75rem;color:var(--text-muted)">تستحق هذا الشهر</div>
            </div>
            <div style="text-align:center">
                <div style="font-size:1rem;font-weight:700;color:var(--accent-green)">${formatMoneyWithSAR(thisMonthTotal)}</div>
                <div style="font-size:0.75rem;color:var(--text-muted)">إجمالي المبالغ</div>
            </div>
            <div style="text-align:center">
                <div style="font-size:1rem;font-weight:700;color:var(--accent-cyan)">${formatMoneyWithSAR(thisMonthProfit)}</div>
                <div style="font-size:0.75rem;color:var(--text-muted)">ربح متوقع</div>
            </div>
            <div style="text-align:center">
                <div style="font-size:1.25rem;font-weight:700;color:${thisMonthPending > 0 ? 'var(--accent-orange)' : 'var(--accent-green)'}">
                    ${thisMonthDone}/${thisMonthMaturities.length}
                </div>
                <div style="font-size:0.75rem;color:var(--text-muted)">تم إغلاقها</div>
            </div>
        </div>`;

        // قائمة الودائع مرتبة بالتاريخ
        html += thisMonthMaturities
            .sort((a, b) => new Date(a.maturity_date) - new Date(b.maturity_date))
            .slice(0, 4)
            .map(inv => {
                const matDate = new Date(inv.maturity_date);
                const diff = Math.ceil((matDate - now) / (1000 * 60 * 60 * 24));
                const isDone = inv.status === 'منتهي';

                let color = 'var(--accent-blue)';
                let tag = `${diff} يوم`;
                if (isDone) { color = 'var(--accent-green)'; tag = 'تم الإغلاق ✅'; }
                else if (diff <= 0) { color = 'var(--accent-red)'; tag = 'مستحقة الآن 🔴'; }
                else if (diff <= 7) { color = 'var(--accent-orange)'; tag = `خلال ${diff} أيام ⏰`; }

                return `
                <div class="dash-row" onclick="switchTab('bank-investments')" style="cursor:pointer;${isDone ? 'opacity:0.65' : ''}">
                    <div class="dash-row-icon">${isDone ? '✅' : '💰'}</div>
                    <div class="dash-row-main">
                        <span class="dash-row-title">${inv.deposit_name || 'وديعة'}</span>
                        <span class="dash-row-sub">${inv.account_name || ''} — ${inv.interest_rate || 0}% سنوياً</span>
                    </div>
                    <div class="dash-row-meta">
                        <span class="dash-row-amount">${formatMoneyWithSAR(parseFloat(inv.amount || 0))}</span>
                        <span class="dash-row-tag" style="color:${color}">${tag}</span>
                    </div>
                </div>`;
            }).join('');

        container.innerHTML = html;

    } catch (e) {
        console.error('Investment summary error:', e);
        if (container) container.innerHTML = '<div class="dash-empty-sm">خطأ في تحميل بيانات الودائع</div>';
    }
}