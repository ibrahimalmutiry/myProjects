/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║         app-dashboard.js — لوحة التحكم الرئيسية v4          ║
 * ║         دعم كامل للغتين: العربية والإنجليزية                 ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

// ═══════════════════════════════════════════════════════════
//  تحميل لوحة التحكم
// ═══════════════════════════════════════════════════════════
async function loadDashboard() {
    showLoading();
    try {
        const [statsRes, chartRes, urgentRes, quotesRes] = await Promise.all([
            fetch('api/?action=stats'),
            fetch('api/?action=chart'),
            fetch('api/?action=urgent'),
            fetch('api/settings.php?action=get_quotes'),
        ]);
        const stats = await statsRes.json();
        const chart = await chartRes.json();
        const urgent = await urgentRes.json();
        const quotesData = await quotesRes.json();

        if (stats.success) App.stats = stats.data;
        if (chart.success) App.chartData = chart.data;

        // حفظ الاقتباسات في App لاستخدامها في renderDashboard
        App.quotes = (quotesData.success && quotesData.data?.length)
            ? quotesData.data.map(q => q.quote_text)
            : ['التنظيم الجيد يجعل الأشياء الصعبة ممكنة.'];

        renderDashboard(urgent.success ? urgent.data : []);
    } catch (error) {
        showToast(t('error_data'), 'error');
        console.error(error);
    }
}

// ═══════════════════════════════════════════════════════════
//  عرض لوحة التحكم
// ═══════════════════════════════════════════════════════════
function renderDashboard(urgentTransactions) {
    const s = App.stats || {};
    const isEn = (typeof currentLang !== 'undefined' ? currentLang : 'ar') === 'en';

    // تنسيق التاريخ الميلادي والهجري
    const dateLocale = isEn ? 'en-US' : 'ar-SA';
    const dateStr = new Date().toLocaleDateString(dateLocale, {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
    const hijriStr = new Date().toLocaleDateString('ar-SA-u-ca-islamic', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    // جلب الاقتباسات من قاعدة البيانات
    // الاقتباسات — تُجلب في loadDashboard وتُخزن في App.quotes
    const _quotes = App.quotes || ['التنظيم الجيد يجعل الأشياء الصعبة ممكنة.'];
    const _todayQuote = _quotes[new Date().getDay() % _quotes.length];

    // سهم عرض الكل حسب الاتجاه
    const arrowPoints = isEn ? '9 18 15 12 9 6' : '15 18 9 12 15 6';

    const html = `
    <div class="dash-wrapper">

        <!-- ══ شريط الترحيب ══ -->
        <div class="dash-topbar">

            <!-- الترحيب + التواريخ -->
            <div style="flex-shrink:0">
                <div class="dash-greeting-text">${getGreetingIcon()} ${getGreeting()}، ${(currentUser?.name || '').split(' ')[0]}</div>
                <div class="dash-dates-row">
                    <span class="dash-date-item">${dateStr}</span>
                    <div class="dash-date-sep"></div>
                    <span class="dash-date-item">${hijriStr}</span>
                </div>
            </div>

            <div class="dash-topbar-sep"></div>

            <!-- الاقتباس اليومي -->
            <div class="dash-quote-wrap">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#854F0B" stroke-width="2" style="flex-shrink:0"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/></svg>
                <span class="dash-quote-text">${_todayQuote}</span>
            </div>

            <div class="dash-topbar-sep"></div>

            <!-- البحث السريع -->
            <div class="dash-search-box" onclick="document.dispatchEvent(new KeyboardEvent('keydown',{key:'k',metaKey:true}))">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <span class="dash-search-ph">بحث سريع...</span>
                <span class="dash-search-kbd">⌘K</span>
            </div>

            <div class="dash-topbar-sep"></div>

            <!-- تحديث -->
            <button class="dash-qa-btn secondary" onclick="loadDashboard()">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                ${t('refresh')}
            </button>

        </div>

        <!-- ══ KPI Cards ══ -->
        <div class="dash-kpi-grid">
            <div class="dash-kpi-card blue" onclick="switchTab('transactions')">
                <div class="dash-kpi-icon">📄</div>
                <div class="dash-kpi-body">
                    <span class="dash-kpi-value">${s.total || 0}</span>
                    <span class="dash-kpi-label">${t('total_transactions_label')}</span>
                </div>
            </div>
            <div class="dash-kpi-card green" onclick="switchTab('transactions')">
                <div class="dash-kpi-icon">✅</div>
                <div class="dash-kpi-body">
                    <span class="dash-kpi-value">${s.paid || 0}</span>
                    <span class="dash-kpi-label">${t('completed_transactions')}</span>
                </div>
            </div>
            <div class="dash-kpi-card orange" onclick="switchTab('transactions')">
                <div class="dash-kpi-icon">⚠️</div>
                <div class="dash-kpi-body">
                    <span class="dash-kpi-value" style="color:var(--accent-red)">${s.urgent || 0}</span>
                    <span class="dash-kpi-label">${t('needs_followup_label')}</span>
                </div>
                ${(s.urgent || 0) > 0 ? '<div class="dash-kpi-pulse"></div>' : ''}
            </div>
            <div class="dash-kpi-card purple">
                <div class="dash-kpi-icon">💰</div>
                <div class="dash-kpi-body">
                    <span class="dash-kpi-value" style="font-size:1.05rem">${formatMoneyWithSAR(s.total_amount || 0)}</span>
                    <span class="dash-kpi-label">${t('total_amounts')}</span>
                </div>
            </div>
        </div>

        <!-- ══ الصف الرئيسي ══ -->
        <div class="dash-main-grid">

            <!-- المعاملات العاجلة -->
            <div class="dash-panel">
                <div class="dash-panel-header">
                    <div class="dash-panel-title">
                        <span>⚠️</span>
                        <h3>${t('urgent_transactions_title')}</h3>
                        <span class="panel-badge red">${urgentTransactions.length}</span>
                    </div>
                    <div class="urgent-filters">
                        <button class="uf-btn active" onclick="filterUrgent('all',this)">${t('filter_all')}</button>
                        <button class="uf-btn" onclick="filterUrgent('عاجل',this)">${t('filter_urgent')}</button>
                        <button class="uf-btn" onclick="filterUrgent('مهم',this)">${t('filter_important')}</button>
                        <button class="uf-btn" onclick="filterUrgent('متابعة',this)">${t('filter_followup')}</button>
                    </div>
                </div>
                <div class="dash-rows-container">
                    ${urgentTransactions.length > 0
            ? renderUrgentRows(urgentTransactions)
            : `<div class="dash-empty"><div class="dash-empty-icon">✅</div><h4>${t('no_urgent')}</h4><p>${t('all_normal')}</p></div>`}
                </div>
            </div>

            <!-- آخر الحجوزات -->
            <div class="dash-panel">
                <div class="dash-panel-header">
                    <div class="dash-panel-title">
                        <span>📋</span>
                        <h3>${t('last_reservations')}</h3>
                    </div>
                    <button class="dash-panel-link" onclick="switchTab('reservations')">
                        ${t('view_all')}
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="${arrowPoints}"/></svg>
                    </button>
                </div>
                <div id="reservationsContainer" class="dash-rows-container">
                    <div class="dash-loading-row">${t('loading_row')}</div>
                </div>
            </div>

            <!-- نظرة عامة -->
            <div class="dash-panel">
                <div class="dash-panel-header">
                    <div class="dash-panel-title">
                        <span>📊</span>
                        <h3>${t('system_overview_title')}</h3>
                    </div>
                </div>
                <div class="dash-rows-container" id="overviewRowsContainer">
                    ${renderSystemRows(s)}
                </div>
            </div>

            <!-- الرصيد البنكي -->
            <div class="dash-panel">
                <div class="dash-panel-header">
                    <div class="dash-panel-title">
                        <span>🏦</span>
                        <h3>${t('bank_balance_today')}</h3>
                    </div>
                    <button class="dash-panel-link" onclick="switchTab('bank-accounts')">
                        ${t('view_all')}
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="${arrowPoints}"/></svg>
                    </button>
                </div>
                <div id="bankBalanceContainer" class="dash-rows-container">
                    <div class="dash-loading-row">${t('loading_row')}</div>
                </div>
            </div>
        </div>

        <!-- ══ الصف الثاني ══ -->
        <div class="dash-mid-grid">
            <!-- معدل الإنجاز -->
            <div class="dash-panel">
                <div class="dash-panel-header">
                    <div class="dash-panel-title">
                        <span>⏱️</span>
                        <h3>${t('completion_rate')}</h3>
                    </div>
                </div>
                <div id="avgTimeContainer" class="dash-rows-container">
                    <div class="dash-loading-row">${t('loading_row')}</div>
                </div>
            </div>

            <!-- الودائع الاستثمارية -->
            <div class="dash-panel">
                <div class="dash-panel-header">
                    <div class="dash-panel-title">
                        <span>💎</span>
                        <h3>${t('investments_this_month')}</h3>
                        <span class="panel-badge" id="invDashBadge" style="display:none;background:var(--accent-red)">!</span>
                    </div>
                    <button class="dash-panel-link" onclick="switchTab('bank-investments')">
                        ${t('view_all')}
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="${arrowPoints}"/></svg>
                    </button>
                </div>
                <div id="investmentsSummaryContainer" class="dash-rows-container">
                    <div class="dash-loading-row">${t('loading_row')}</div>
                </div>
            </div>
        </div>

        <!-- ══ الصف الثالث ══ -->
        <div class="dash-bottom-grid">
            <div class="dash-panel">
                <div class="dash-panel-header">
                    <div class="dash-panel-title">
                        <span>🕐</span>
                        <h3>${t('last_events')}</h3>
                        <span class="panel-badge blue" id="eventsCountBadge">...</span>
                    </div>
                    <button class="dash-panel-link" onclick="switchTab('performance')">
                        ${t('view_all')}
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="${arrowPoints}"/></svg>
                    </button>
                </div>
                <div id="dashEventsTimeline" class="dash-rows-container">
                    <div class="dash-loading-row">${t('loading_row')}</div>
                </div>
            </div>
        </div>

    </div>`;

    DOM.mainContent.innerHTML = html;

    if (DOM.notificationBadge) {
        DOM.notificationBadge.textContent = s.urgent || 0;
        DOM.notificationBadge.style.display = (s.urgent || 0) > 0 ? 'flex' : 'none';
    }

    _injectTopbarStyles();
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
    const isEn = (typeof currentLang !== 'undefined' ? currentLang : 'ar') === 'en';
    const arrowPoints = isEn ? '9 18 15 12 9 6' : '15 18 9 12 15 6';

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
                <button class="dr-btn" onclick="viewTransaction(${tx.id})" title="${isEn ? 'View' : 'عرض'}">👁</button>
                <button class="dr-btn" onclick="showSetPriorityModal(${tx.id},'${tx.transaction_number}')" title="${isEn ? 'Set Priority' : 'تحديد أولوية'}">⭐</button>
            </div>
        </div>`;
    }).join('') + (transactions.length > 8 ? `
        <div class="dash-row-more" onclick="switchTab('transactions')">+ ${transactions.length - 8} ${t('more_transactions')}</div>` : '');
}

// ═══════════════════════════════════════════════════════════
//  نظرة عامة — صفوف
// ═══════════════════════════════════════════════════════════
function renderSystemRows(s) {
    const rows = [
        { icon: '💼', key: 'row_transactions', tab: 'transactions', cols: [{ v: s.total || 0, k: 'col_all' }, { v: s.paid || 0, k: 'col_completed', c: 'green' }, { v: s.pending || 0, k: 'col_pending', c: 'orange' }, { v: s.urgent || 0, k: 'col_urgent_col', c: 'red' }] },
        { icon: '📥', key: 'row_receiving', tab: 'transactions', cols: [{ v: s.received || 0, k: 'col_received', c: 'green' }, { v: Math.max(0, (s.total || 0) - (s.received || 0)), k: 'col_waiting', c: 'orange' }] },
        { icon: '💰', key: 'row_budget_dept', tab: 'transactions', cols: [{ v: s.total || 0, k: 'col_total' }, { v: formatMoneyWithSAR(s.total_amount || 0), k: 'col_amounts' }] },
        { icon: '💳', key: 'row_payment_dept', tab: 'transactions', cols: [{ v: s.paid || 0, k: 'col_paid', c: 'green' }, { v: s.pending || 0, k: 'col_pending', c: 'orange' }, { v: formatMoneyWithSAR(s.paid_amount || 0), k: 'col_payments' }] },
        { icon: '🧾', key: 'row_invoice_dept', tab: 'transactions', cols: [{ v: s.invoiced || 0, k: 'col_invoiced', c: 'green' }, { v: Math.max(0, (s.total || 0) - (s.invoiced || 0)), k: 'col_in_progress', c: 'orange' }] },
        { icon: '📨', key: 'row_correspondence', tab: 'correspondence', cols: [], id: 'corrRowCols' },
        { icon: '🏦', key: 'row_bank_accounts', tab: 'bank-deposits', cols: [], id: 'bankRowCols' },
        { icon: '📑', key: 'row_reservations_dept', tab: 'reservations', cols: [], id: 'resRowCols' },
        { icon: '⏱️', key: 'row_sla', tab: 'sla', cols: [] },
    ];

    const isEn = (typeof currentLang !== 'undefined' ? currentLang : 'ar') === 'en';
    const arrowPoints = isEn ? '9 18 15 12 9 6' : '15 18 9 12 15 6';

    return rows.map(r => `
    <div class="dash-row system-row" onclick="switchTab('${r.tab}')">
        <div class="dash-row-icon">${r.icon}</div>
        <div class="dash-row-main">
            <span class="dash-row-title">${t(r.key)}</span>
        </div>
        <div class="dash-row-cols" ${r.id ? `id="${r.id}"` : ''}>
            ${r.cols.map(c => `<div class="dash-col-stat"><span class="dcs-val ${c.c || ''}">${c.v}</span><span class="dcs-lbl">${t(c.k)}</span></div>`).join('')}
            ${!r.cols.length && !r.id ? `<span class="dash-row-tag">${t('click_to_view')}</span>` : ''}
        </div>
        <svg class="dash-row-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="${arrowPoints}"/></svg>
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
            container.innerHTML = `<div class="dash-empty-sm">${t('no_bank_accounts')}</div>`;
            return;
        }
        let totalBalance = 0;
        let html = result.data.map(acc => {
            const bal = parseFloat(acc.current_balance || 0);
            totalBalance += bal;
            return `
            <div class="dash-row bank-row" onclick="switchTab('bank-accounts')">
                <div class="dash-row-icon">🏦</div>
                <div class="dash-row-main">
                    <span class="dash-row-title">${acc.account_name}</span>
                    <span class="dash-row-sub">${acc.bank_name} • ${acc.account_number || ''}</span>
                </div>
                <div class="dash-row-meta">
                    <span class="dash-row-amount">${formatMoneyWithSAR(bal)}</span>
                    <span class="dash-row-tag">${acc.currency || 'SAR'}</span>
                </div>
            </div>`;
        }).join('');

        html += `
        <div class="dash-row total-row">
            <div class="dash-row-icon">💰</div>
            <div class="dash-row-main"><span class="dash-row-title" style="font-weight:800">${t('total_balances')}</span></div>
            <div class="dash-row-meta"><span class="dash-row-amount" style="font-size:1.05rem;font-weight:800">${formatMoneyWithSAR(totalBalance)}</span></div>
        </div>`;

        container.innerHTML = html;

        const bankCols = document.getElementById('bankRowCols');
        if (bankCols) bankCols.innerHTML = `
            <div class="dash-col-stat"><span class="dcs-val">${result.data.length}</span><span class="dcs-lbl">${t('col_account')}</span></div>
            <div class="dash-col-stat"><span class="dcs-val green">${formatMoneyWithSAR(totalBalance)}</span><span class="dcs-lbl">${t('col_total')}</span></div>`;

    } catch (e) {
        if (container) container.innerHTML = `<div class="dash-empty-sm">${t('error_load')}</div>`;
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
            container.innerHTML = `<div class="dash-empty-sm">${t('no_performance_data')}</div>`;
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
            creation: { k: 'stage_creation', i: '➕', c: '#4dabf7' },
            receiving: { k: 'stage_receiving', i: '📥', c: '#69db7c' },
            budget: { k: 'stage_budget', i: '💰', c: '#3bc9db' },
            payment: { k: 'stage_payment', i: '💳', c: '#ffa94d' },
            invoice: { k: 'stage_invoice', i: '🧾', c: '#b197fc' },
        };

        let totalMin = 0, totalCount = 0;
        Object.values(stageMap).forEach(v => { totalMin += v.sum; totalCount += v.count; });
        const overallAvg = totalCount > 0 ? totalMin / totalCount : 0;

        let html = `
        <div class="dash-row avg-summary-row">
            <div class="dash-row-icon">📊</div>
            <div class="dash-row-main">
                <span class="dash-row-title">${t('avg_completion')}</span>
                <span class="dash-row-sub">${totalCount} ${t('analyzed_transactions')}</span>
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
                    <span class="dash-row-title">${t(info.k)}</span>
                    <div class="perf-bar-wrap"><div class="perf-bar" style="width:${pct}%;background:${info.c}"></div></div>
                </div>
                <div class="dash-row-meta">
                    <span class="dash-row-amount">${formatMinutes(avg)}</span>
                    <span class="dash-row-tag">${data.count} ${t('analyzed_transactions')}</span>
                </div>
            </div>`;
        });

        container.innerHTML = html;
    } catch (e) {
        if (container) container.innerHTML = `<div class="dash-empty-sm">${t('error_load')}</div>`;
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
            container.innerHTML = `<div class="dash-empty-sm">${t('no_reservations')}</div>`;
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

        // ترجمة حالات الحجوزات
        const statusI18n = {
            'مسودة': t('status_draft'), 'قيد المراجعة': t('status_reviewing'),
            'معتمد': t('status_approved'), 'مرفوض': t('status_rejected'), 'مكتمل': t('status_done'),
        };

        let html = `
        <div class="dash-row res-summary-row">
            <div class="dash-row-icon">📊</div>
            <div class="dash-row-main"><span class="dash-row-title">${t('total_reservations')}</span></div>
            <div class="dash-row-cols">
                <div class="dash-col-stat"><span class="dcs-val">${allData.length}</span><span class="dcs-lbl">${t('col_all')}</span></div>
                <div class="dash-col-stat"><span class="dcs-val green">${approved}</span><span class="dcs-lbl">${t('col_approved')}</span></div>
                <div class="dash-col-stat"><span class="dcs-val orange">${pending}</span><span class="dcs-lbl">${t('col_waiting')}</span></div>
                <div class="dash-col-stat"><span class="dcs-val">${formatMoneyWithSAR(totalAmt)}</span><span class="dcs-lbl">${t('col_total')}</span></div>
            </div>
        </div>`;

        html += allData.slice(0, 3).map(r => {
            const color = statusColors[r.status] || '#9ca3af';
            const statusLabel = statusI18n[r.status] || r.status;
            return `
            <div class="dash-row res-row" onclick="switchTab('reservations')">
                <div class="dash-row-indicator" style="background:${color}"></div>
                <div class="dash-row-icon">📋</div>
                <div class="dash-row-main">
                    <span class="dash-row-title">${r.reservation_number || r.purpose || 'Reservation'}</span>
                    <span class="dash-row-sub">${r.department_name || ''}${r.requested_by_name ? ' • ' + r.requested_by_name : ''}</span>
                </div>
                <div class="dash-row-meta">
                    <span class="dash-row-amount">${fmtMoneyCur(parseFloat(r.grand_total || 0), r.currency)}</span>
                    <span class="dash-row-tag" style="color:${color}">${statusLabel}</span>
                </div>
            </div>`;
        }).join('');

        container.innerHTML = html;

        const resCols = document.getElementById('resRowCols');
        if (resCols) resCols.innerHTML = `
            <div class="dash-col-stat"><span class="dcs-val">${allData.length}</span><span class="dcs-lbl">${t('col_all')}</span></div>
            <div class="dash-col-stat"><span class="dcs-val green">${approved}</span><span class="dcs-lbl">${t('col_approved')}</span></div>
            <div class="dash-col-stat"><span class="dcs-val orange">${pending}</span><span class="dcs-lbl">${t('col_waiting')}</span></div>`;

    } catch (e) {
        if (container) container.innerHTML = `<div class="dash-empty-sm">${t('error_load')}</div>`;
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
            container.innerHTML = `<div class="dash-empty-sm">${t('no_events')}</div>`;
            return;
        }
        const badge = document.getElementById('eventsCountBadge');
        if (badge) badge.textContent = result.data.length;

        const si = {
            creation: { k: 'stage_creation', c: '#4dabf7', i: '➕' },
            receiving: { k: 'stage_receiving', c: '#69db7c', i: '📥' },
            budget: { k: 'stage_budget', c: '#3bc9db', i: '💰' },
            payment: { k: 'stage_payment', c: '#ffa94d', i: '💳' },
            invoice: { k: 'stage_invoice', c: '#b197fc', i: '🧾' },
        };

        container.innerHTML = result.data.map(e => {
            const info = si[e.stage] || { k: null, n: e.stage, c: '#888', i: '📋' };
            const stageName = info.k ? t(info.k) : (info.n || e.stage);
            return `
            <div class="dash-row event-row">
                <div class="dash-row-icon" style="color:${info.c}">${info.i}</div>
                <div class="dash-row-main">
                    <span class="dash-row-title">${e.transaction_number || '-'}</span>
                    <span class="dash-row-sub">${e.old_status ? `<s style="color:var(--text-muted)">${e.old_status}</s> → ` : ''}<strong>${e.new_status || e.action || ''}</strong></span>
                </div>
                <div class="dash-row-meta">
                    <span class="dash-row-tag" style="background:${info.c}18;color:${info.c}">${stageName}</span>
                    <span class="dash-row-time">${formatTimeAgo(e.event_time)}</span>
                </div>
            </div>`;
        }).join('');

        loadCorrStats();
    } catch (e) {
        if (container) container.innerHTML = `<div class="dash-empty-sm">${t('error_load')}</div>`;
    }
}

async function loadCorrStats() {
    try {
        const res = await fetch('api/correspondence_api.php?action=stats');
        const r = await res.json();
        if (!r.success) return;
        const el = document.getElementById('corrRowCols');
        if (el) el.innerHTML = `
            <div class="dash-col-stat"><span class="dcs-val">${r.data.total || 0}</span><span class="dcs-lbl">${t('col_all')}</span></div>
            <div class="dash-col-stat"><span class="dcs-val orange">${r.data.pending || 0}</span><span class="dcs-lbl">${t('col_processing')}</span></div>
            <div class="dash-col-stat"><span class="dcs-val red">${r.data.urgent || 0}</span><span class="dcs-lbl">${t('col_urgent_count')}</span></div>`;
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
            datasets: [{ label: t('transactions'), data: data.map(d => d.count), borderColor: '#667eea', backgroundColor: 'rgba(102,126,234,0.1)', borderWidth: 2.5, pointBackgroundColor: '#667eea', pointRadius: 5, pointHoverRadius: 7, fill: true, tension: 0.4 }]
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
    DOM.modalTitle.textContent = `📌 ${t('priority_modal_title')} — ${txNumber}`;
    DOM.modalBody.innerHTML = `
    <div class="priority-modal">
        <p style="font-size:.875rem;color:var(--text-secondary);margin:0 0 1.25rem">${t('priority_choose')}</p>
        <div class="priority-options">
            <label class="priority-option urgent-opt"><input type="radio" name="priority" value="urgent">
                <div class="priority-opt-content"><span style="font-size:1.4rem">🔴</span><div><strong>${t('priority_urgent')}</strong><p>${t('priority_urgent_desc')}</p></div></div></label>
            <label class="priority-option high-opt"><input type="radio" name="priority" value="high">
                <div class="priority-opt-content"><span style="font-size:1.4rem">🟠</span><div><strong>${t('priority_high')}</strong><p>${t('priority_high_desc')}</p></div></div></label>
            <label class="priority-option normal-opt"><input type="radio" name="priority" value="normal" checked>
                <div class="priority-opt-content"><span style="font-size:1.4rem">🟢</span><div><strong>${t('priority_normal')}</strong><p>${t('priority_normal_desc')}</p></div></div></label>
        </div>
        <div class="form-group" style="margin-top:1rem">
            <label>${t('priority_note')}</label>
            <input type="text" id="priorityNote" class="form-control" placeholder="${t('priority_note_ph')}">
        </div>
        <div style="display:flex;gap:.75rem;margin-top:1.5rem;justify-content:flex-end">
            <button class="btn btn-primary" onclick="submitSetPriority(${txId})">${t('save')}</button>
            <button class="btn btn-ghost" onclick="closeModal()">${t('cancel')}</button>
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
        if (r.success) { showToast(t('priority_saved'), 'success'); closeModal(); loadDashboard(); }
        else showToast(r.message || t('priority_failed'), 'error');
    } catch (e) { showToast(t('error_connection'), 'error'); }
}

// ═══════════════════════════════════════════════════════════
//  دوال مساعدة
// ═══════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════
// CSS dash-topbar الجديد
// ════════════════════════════════════════════════════════════
function _injectTopbarStyles() {
    if (document.getElementById('_dash-topbar-css')) return;
    const s = document.createElement('style');
    s.id = '_dash-topbar-css';
    s.textContent = `
    .dash-topbar {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 1rem;
        background: var(--bg-card, var(--color-background-primary));
        border: 1px solid var(--border-color, var(--color-border-tertiary));
        border-radius: 12px;
        margin-bottom: .85rem;
        flex-wrap: wrap;
    }
    .dash-topbar-sep {
        width: 1px;
        height: 24px;
        background: var(--border-color, var(--color-border-tertiary));
        flex-shrink: 0;
    }
    .dash-greeting-text {
        font-size: .85rem;
        font-weight: 600;
        color: var(--text-primary, var(--color-text-primary));
    }
    .dash-dates-row {
        display: flex;
        align-items: center;
        gap: 5px;
        margin-top: 2px;
    }
    .dash-date-item {
        font-size: .7rem;
        color: var(--text-muted, var(--color-text-secondary));
    }
    .dash-date-sep {
        width: 1px;
        height: 10px;
        background: var(--border-color, var(--color-border-tertiary));
    }
    .dash-quote-wrap {
        display: flex;
        align-items: center;
        gap: 6px;
        flex: 1;
        min-width: 0;
        overflow: hidden;
    }
    .dash-quote-text {
        font-size: .72rem;
        color: var(--text-muted, var(--color-text-secondary));
        font-style: italic;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .dash-search-box {
        display: flex;
        align-items: center;
        gap: 6px;
        background: var(--bg-surface, var(--color-background-secondary));
        border: 0.5px solid var(--border-color, var(--color-border-tertiary));
        border-radius: 8px;
        padding: 5px 10px;
        cursor: pointer;
        flex-shrink: 0;
        min-width: 160px;
        max-width: 220px;
        color: var(--text-muted, var(--color-text-secondary));
        transition: border-color .15s;
    }
    .dash-search-box:hover {
        border-color: var(--primary, #3F5950);
    }
    .dash-search-ph {
        font-size: .72rem;
        color: var(--text-muted, var(--color-text-tertiary));
        flex: 1;
    }
    .dash-search-kbd {
        font-size: .65rem;
        padding: 1px 5px;
        border-radius: 4px;
        background: var(--bg-card, var(--color-background-primary));
        border: 0.5px solid var(--border-color, var(--color-border-tertiary));
        color: var(--text-muted, var(--color-text-secondary));
        flex-shrink: 0;
    }
    @media (max-width: 900px) {
        .dash-quote-wrap { display: none; }
        .dash-topbar-sep:nth-child(3),
        .dash-topbar-sep:nth-child(4) { display: none; }
    }
    @media (max-width: 640px) {
        .dash-search-box { display: none; }
    }
    `;
    document.head.appendChild(s);
}


function getGreeting() {
    const h = new Date().getHours();
    return h < 12 ? t('greeting_morning') : h < 17 ? t('greeting_afternoon') : t('greeting_evening');
}
function getGreetingIcon() {
    const h = new Date().getHours();
    return h < 12 ? '🌅' : h < 17 ? '☀️' : '🌙';
}
function formatMinutes(min) {
    if (!min || min <= 0) return '—';
    min = Math.round(min);
    if (min < 60) return `${min} ${t('unit_minute')}`;
    if (min < 1440) return `${Math.round(min / 60)} ${t('unit_hour')}`;
    return `${Math.round(min / 1440)} ${t('unit_day')}`;
}
function formatDuration(minutes) {
    if (!minutes || minutes <= 0) return t('unit_now');
    const d = Math.floor(minutes / 1440), h = Math.floor((minutes % 1440) / 60), m = minutes % 60;
    const p = [];
    if (d > 0) p.push(`${d}${t('unit_days_short')}`);
    if (h > 0) p.push(`${h}${t('unit_hours_short')}`);
    if (m > 0 && d === 0) p.push(`${m}${t('unit_mins_short')}`);
    return p.join(' ');
}
function formatTimeAgo(datetime) {
    if (!datetime) return '';
    const diff = Math.floor((new Date() - new Date(datetime)) / 1000);
    if (diff < 60) return t('unit_now');
    if (diff < 3600) return Math.floor(diff / 60) + ' ' + t('unit_mins_short');
    if (diff < 86400) return Math.floor(diff / 3600) + ' ' + t('unit_hours_short');
    return Math.floor(diff / 86400) + ' ' + t('unit_days_short');
}

// ═══════════════════════════════════════════════════════════
//  صفحة متابعة الأداء
// ═══════════════════════════════════════════════════════════
async function loadPerformancePage() {
    showLoading();
    DOM.mainContent.innerHTML = `
    <div class="performance-page">
        <div class="perf-header">
            <div class="perf-header-content">
                <div class="perf-title">
                    <div class="perf-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div>
                    <div><h1>${t('perf_title')}</h1><p>${t('perf_subtitle')}</p></div>
                </div>
                <div class="perf-header-stats">
                    <div class="header-stat"><span class="stat-number" id="totalEventsToday">-</span><span class="stat-label">${t('perf_events_today')}</span></div>
                    <div class="header-stat"><span class="stat-number" id="avgTimeToday">-</span><span class="stat-label">${t('perf_avg_time')}</span></div>
                </div>
            </div>
        </div>
        <div class="perf-filters">
            <div class="filter-group"><label>${t('perf_stage_filter')}</label>
                <select id="perfStageFilter" onchange="loadEventsTimeline()">
                    <option value="">${t('perf_all_stages')}</option>
                    <option value="creation">${t('stage_creation')}</option>
                    <option value="receiving">${t('stage_receiving')}</option>
                    <option value="budget">${t('stage_budget')}</option>
                    <option value="payment">${t('stage_payment')}</option>
                    <option value="invoice">${t('stage_invoice')}</option>
                </select>
            </div>
            <div class="filter-group"><label>${t('perf_date_from')}</label>
                <input type="date" id="perfDateFrom" onchange="loadEventsTimeline()">
            </div>
            <div class="filter-group"><label>${t('perf_date_to')}</label>
                <input type="date" id="perfDateTo" onchange="loadEventsTimeline()">
            </div>
            <button class="filter-reset" onclick="resetPerfFilters()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                ${t('perf_reset')}
            </button>
        </div>
        <div class="perf-content">
            <div class="perf-section">
                <div class="section-header"><h3>${t('perf_all_events')}</h3><span class="events-count" id="eventsCount">-</span></div>
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
//  ملخص الودائع الاستثمارية
// ═══════════════════════════════════════════════════════════
async function loadInvestmentsSummary() {
    const container = document.getElementById('investmentsSummaryContainer');
    if (!container) return;

    try {
        const res = await fetch('api/?action=investments');
        const result = await res.json();

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

        const badge = document.getElementById('invDashBadge');
        if (badge) {
            badge.textContent = overdueCount;
            badge.style.display = overdueCount > 0 ? 'inline-flex' : 'none';
        }

        if (thisMonthMaturities.length === 0) {
            container.innerHTML = `
            <div style="padding:0.75rem 1rem;border-bottom:1px solid var(--border-color)">
                <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:0.75rem">
                    <div style="text-align:center">
                        <div style="font-size:1.25rem;font-weight:700;color:var(--accent-blue)">${active.length}</div>
                        <div style="font-size:0.75rem;color:var(--text-muted)">${t('active_deposits')}</div>
                    </div>
                    <div style="text-align:center">
                        <div style="font-size:1rem;font-weight:700;color:${overdueCount > 0 ? 'var(--accent-red)' : 'var(--text-muted)'}">${overdueCount}</div>
                        <div style="font-size:0.75rem;color:var(--text-muted)">${t('overdue_close')}</div>
                    </div>
                </div>
            </div>
            <div class="dash-empty-sm">${t('no_investments_month')}</div>`;
            return;
        }

        let html = `
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0.75rem;padding:0.75rem 1rem;border-bottom:1px solid var(--border-color)">
            <div style="text-align:center">
                <div style="font-size:1.25rem;font-weight:700;color:var(--accent-blue)">${thisMonthMaturities.length}</div>
                <div style="font-size:0.75rem;color:var(--text-muted)">${t('matures_this_month')}</div>
            </div>
            <div style="text-align:center">
                <div style="font-size:1rem;font-weight:700;color:var(--accent-green)">${formatMoneyWithSAR(thisMonthTotal)}</div>
                <div style="font-size:0.75rem;color:var(--text-muted)">${t('col_amounts')}</div>
            </div>
            <div style="text-align:center">
                <div style="font-size:1rem;font-weight:700;color:var(--accent-cyan)">${formatMoneyWithSAR(thisMonthProfit)}</div>
                <div style="font-size:0.75rem;color:var(--text-muted)">${t('expected_profit')}</div>
            </div>
            <div style="text-align:center">
                <div style="font-size:1.25rem;font-weight:700;color:${thisMonthPending > 0 ? 'var(--accent-orange)' : 'var(--accent-green)'}">
                    ${thisMonthDone}/${thisMonthMaturities.length}
                </div>
                <div style="font-size:0.75rem;color:var(--text-muted)">${t('closed_count')}</div>
            </div>
        </div>`;

        html += thisMonthMaturities
            .sort((a, b) => new Date(a.maturity_date) - new Date(b.maturity_date))
            .slice(0, 4)
            .map(inv => {
                const matDate = new Date(inv.maturity_date);
                const diff = Math.ceil((matDate - now) / (1000 * 60 * 60 * 24));
                const isDone = inv.status === 'منتهي';

                let color = 'var(--accent-blue)';
                let tag = `${diff} ${t('unit_day')}`;
                if (isDone) { color = 'var(--accent-green)'; tag = t('closed_ok'); }
                else if (diff <= 0) { color = 'var(--accent-red)'; tag = t('due_now'); }
                else if (diff <= 7) { color = 'var(--accent-orange)'; tag = `${t('within_days')} ${diff} ${t('days_alarm')}`; }

                return `
                <div class="dash-row" onclick="switchTab('bank-investments')" style="cursor:pointer;${isDone ? 'opacity:0.65' : ''}">
                    <div class="dash-row-icon">${isDone ? '✅' : '💰'}</div>
                    <div class="dash-row-main">
                        <span class="dash-row-title">${inv.deposit_name || (typeof currentLang !== 'undefined' && currentLang === 'en' ? 'Deposit' : 'وديعة')}</span>
                        <span class="dash-row-sub">${inv.account_name || ''} — ${inv.interest_rate || 0}% ${t('annual_rate')}</span>
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
        if (container) container.innerHTML = `<div class="dash-empty-sm">${t('error_load')}</div>`;
    }
}