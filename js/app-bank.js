/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║     app-bank.js — الودائع البنكية والاستثمارية               ║
 * ║  يتطلب: app-common.js                                        ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * ── الودائع البنكية ─────────────────────────────────────────
 *  • تحميل صفحة الودائع البنكية (loadBankDepositsPage)
 *  • تبويبات: نظرة عامة / الودائع / الحسابات / الشهري
 *  • إضافة وديعة / وديعة شهرية / حساب بنكي
 *  • تأكيد وديعة (handleConfirmDeposit)
 *  • تسجيل الأرصدة وسجلها (openRecordBalanceModal, openBalanceHistoryModal)
 *  • تنبيهات مواعيد الإيداع (startDepositAlertChecker)
 *  • التقويم الشهري للودائع (renderDepositCalendar)
 *
 * ── الودائع الاستثمارية ──────────────────────────────────────
 *  • تحميل وعرض الاستثمارات (loadInvestments, renderInvestmentsTab)
 *  • إضافة استثمار جديد (openAddInvestmentModal, submitNewInvestment)
 *  • استحقاق استثمار (openMatureInvestmentModal, submitMatureInv)
 *  • إلغاء استثمار (openCancelInvestmentModal, submitCancelInv)
 *  • حساب ملخص واستحقاق (calcInvSummary, calcInvMaturity)
 *
 * المتغيرات العامة:
 *  bankAccounts    — قائمة الحسابات البنكية
 *  bankDeposits    — الودائع المحملة
 *  monthlyDeposits — ودائع الشهر الحالي المجدولة
 *  depositAlerts   — تنبيهات مواعيد الإيداع
 *  activeBankTab   — التبويب النشط حالياً
 *  investments     — قائمة الودائع الاستثمارية
 */

// ════════════════════════════════════════════════════════════
//  الودائع البنكية — Bank Deposits
// ════════════════════════════════════════════════════════════

// المتغيرات العامة — تُهيَّأ هنا لتجنب ReferenceError
var bankAccounts = [];
var bankDeposits = [];
var monthlyDeposits = [];
var depositAlerts = [];
var activeBankTab = 'overview';
var investments = [];

async function loadBankDepositsPage(targetTab) {
    const container = document.getElementById('main-content');
    if (!container) return;

    container.innerHTML = renderBankPageSkeleton();

    // تحميل البيانات بالتوازي
    await Promise.all([
        loadBankAccounts(),
        loadMonthlyDeposits(),
        loadInvestments(),
    ]);

    // الأولوية: المعامل المباشر → data-bank-sub القديم → overview
    const activeSubBtn = document.querySelector('.nav-child-btn[data-bank-sub].active');
    const startTab = targetTab || (activeSubBtn ? activeSubBtn.dataset.bankSub : 'overview');

    switchBankTab(startTab);
    startDepositAlertChecker();
}

// ─── هيكل الصفحة ─────────────────────────────────────────
function renderBankPageSkeleton() {
    const now = new Date();
    const monthName = now.toLocaleDateString('ar-SA', { month: 'long', year: 'numeric' });

    return `
    <div class="bank-page">

        <!-- رأس الصفحة -->
        <div class="bank-page-header">
            <div class="bank-page-title">
                <div class="bank-page-icon">🏦</div>
                <div>
                    <h1>${tr('نظام الودائع البنكية')}</h1>
                    <p class="bank-page-subtitle">${monthName}</p>
                </div>
            </div>

            <!-- شريط التنبيهات -->
            <div id="deposit-alerts-bar" class="deposit-alerts-bar" style="display:none"></div>

   
        </div>

        <!-- محتوى التبويبات -->
        <div class="bank-tab-panels">
            <div id="bank-tab-overview"     class="bank-tab-panel active"></div>
            <div id="bank-tab-deposits"     class="bank-tab-panel"></div>
            <div id="bank-tab-monthly"      class="bank-tab-panel"></div>
            <div id="bank-tab-accounts"     class="bank-tab-panel"></div>
            <div id="bank-tab-investments"  class="bank-tab-panel"></div>
        </div>

    </div>`;
}

// ─── تبديل التبويبات ────────────────────────────────────
function switchBankTab(tabName) {
    activeBankTab = tabName;

    // إخفاء جميع اللوحات وإظهار النشطة
    document.querySelectorAll('.bank-tab-panel').forEach(p => p.classList.remove('active'));
    const panel = document.getElementById(`bank-tab-${tabName}`);
    if (panel) panel.classList.add('active');

    // تحديث العنصر النشط في السايدبار
    document.querySelectorAll('.nav-child-btn[data-bank-sub]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.bankSub === tabName);
    });

    // تحديث عنوان الصفحة حسب التبويب
    const tabTitles = {
        overview: tr('نظرة عامة'),
        deposits: tr('الحسابات البنكية'),
        monthly: tr('ودائع الشهر'),
        accounts: tr('الحسابات البنكية'),
        investments: tr('الودائع الاستثمارية'),
    };
    const titleEl = document.querySelector('.bank-page-title h1');
    if (titleEl && tabTitles[tabName]) titleEl.textContent = tabTitles[tabName];

    // رسم المحتوى
    const renderers = {
        overview: renderOverviewTab,
        deposits: renderDepositsTab,
        monthly: renderMonthlyTab,
        accounts: renderAccountsTab,
        investments: renderInvestmentsTab,
    };
    if (renderers[tabName]) renderers[tabName]();
}

// ════════════════════════════════════════════════════════
//  التبويب 1: نظرة عامة — صفوف
// ════════════════════════════════════════════════════════
function renderOverviewTab() {
    const panel = document.getElementById('bank-tab-overview');
    if (!panel) return;

    // ── البيانات ──
    const totalBalance = bankAccounts.reduce((s, a) => s + parseFloat(a.current_balance || 0), 0);
    const thisMonth = getCurrentMonthDeposits();
    const activeInv = investments.filter(i => i.status === 'نشط');
    const doneInv = investments.filter(i => i.status === 'منتهي');
    const totalInvested = activeInv.reduce((s, i) => s + parseFloat(i.amount || 0), 0);
    const totalProfit = doneInv.reduce((s, i) => s + parseFloat(i.actual_profit || i.expected_profit || 0), 0);
    const today = new Date();

    // آخر 6 أشهر للرسم البياني — الودائع الاستثمارية
    const months = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date(); d.setMonth(d.getMonth() - i);
        months.push({
            label: d.toLocaleString('ar', { month: 'short' }),
            month: d.getMonth(), year: d.getFullYear(),
            isCurrent: i === 0
        });
    }
    const monthlyData = months.map(m => {
        const amt = investments.filter(inv => {
            const dd = new Date(inv.start_date || inv.created_at);
            return dd.getMonth() === m.month && dd.getFullYear() === m.year;
        }).reduce((s, inv) => s + parseFloat(inv.amount || 0), 0);
        return { ...m, amount: amt };
    });
    const maxAmt = Math.max(...monthlyData.map(m => m.amount), 1);

    // أقرب استثمارات للاستحقاق
    const upcoming = [...activeInv]
        .filter(i => i.maturity_date)
        .sort((a, b) => new Date(a.maturity_date) - new Date(b.maturity_date))
        .slice(0, 4);

    const daysLeft = d => Math.ceil((new Date(d) - today) / 86400000);
    const urgencyColor = days => days < 0 ? '#ef4444' : days <= 7 ? '#ef4444' : days <= 30 ? '#f59e0b' : '#22c55e';
    const urgencyLabel = days => days < 0 ? 'منتهي' : days === 0 ? 'اليوم' : `${days} يوم`;

    // Y-axis labels
    const ySteps = [0, 0.25, 0.5, 0.75, 1].reverse();
    const fmtY = v => {
        const val = v * maxAmt;
        if (val >= 1000000) return (val / 1000000).toFixed(1) + 'م';
        if (val >= 1000) return (val / 1000).toFixed(0) + 'ك';
        return val.toFixed(0);
    };

    updateQuickStats(totalBalance, thisMonth, activeInv.length, doneInv.length);

    panel.innerHTML = `
    <div class="bov2-page">

        <!-- ══ KPI Row ══ -->
        <div class="bov2-kpi-row">
            <div class="bov2-kpi" style="--kpi-accent:#4dabf7">
                <div class="bov2-kpi-top">
                    <div class="bov2-kpi-icon" style="background:rgba(77,171,247,.12);color:#4dabf7">🏦</div>
                    <span class="bov2-kpi-tag">${bankAccounts.length} حساب</span>
                </div>
                <div class="bov2-kpi-val">${formatMoneyWithSAR(totalBalance)}</div>
                <div class="bov2-kpi-lbl">${tr('إجمالي أرصدة الحسابات')}</div>
            </div>
            <div class="bov2-kpi" style="--kpi-accent:#a78bfa">
                <div class="bov2-kpi-top">
                    <div class="bov2-kpi-icon" style="background:rgba(167,139,250,.12);color:#a78bfa">📈</div>
                    <span class="bov2-kpi-tag">${activeInv.length} نشطة</span>
                </div>
                <div class="bov2-kpi-val">${formatMoneyWithSAR(totalInvested)}</div>
                <div class="bov2-kpi-lbl">${tr('إجمالي الاستثمارات النشطة')}</div>
            </div>
            <div class="bov2-kpi" style="--kpi-accent:#22c55e">
                <div class="bov2-kpi-top">
                    <div class="bov2-kpi-icon" style="background:rgba(34,197,94,.12);color:#22c55e">💰</div>
                    <span class="bov2-kpi-tag">${doneInv.length} منتهية</span>
                </div>
                <div class="bov2-kpi-val">${formatMoneyWithSAR(totalProfit)}</div>
                <div class="bov2-kpi-lbl">${tr('إجمالي الأرباح المحققة')}</div>
            </div>
            <div class="bov2-kpi" style="--kpi-accent:#f59e0b">
                <div class="bov2-kpi-top">
                    <div class="bov2-kpi-icon" style="background:rgba(245,158,11,.12);color:#f59e0b">📅</div>
                    <span class="bov2-kpi-tag" style="color:${upcoming[0] ? urgencyColor(daysLeft(upcoming[0].maturity_date)) : 'var(--text-muted)'}">
                        ${upcoming[0] ? urgencyLabel(daysLeft(upcoming[0].maturity_date)) : '—'}
                    </span>
                </div>
                <div class="bov2-kpi-val">${upcoming[0] ? formatMoneyWithSAR(upcoming[0].amount) : '—'}</div>
                <div class="bov2-kpi-lbl">${tr('أقرب استحقاق')}</div>
            </div>
        </div>

        <!-- ══ Mid Row: Chart + Upcoming ══ -->
        <div class="bov2-mid">

            <!-- الرسم البياني -->
            <div class="bov2-card bov2-chart-card">
                <div class="bov2-card-hdr">
                    <div>
                        <div class="bov2-card-title">${tr('نشاط الودائع الاستثمارية')}</div>
                        <div class="bov2-card-sub">آخر 6 أشهر · إجمالي ${formatMoneyWithSAR(monthlyData.reduce((s, m) => s + m.amount, 0))}</div>
                    </div>
                    <div class="bov2-legend">
                        <span class="bov2-legend-dot" style="background:#4dabf7"></span>
                        <span>${tr('الودائع الاستثمارية الشهرية')}</span>
                    </div>
                </div>
                <div class="bov2-chart-wrap">
                    <!-- Y axis -->
                    <div class="bov2-y-axis">
                        ${ySteps.map(v => `<span>${fmtY(v)}</span>`).join('')}
                    </div>
                    <!-- Bars -->
                    <div class="bov2-bars-area">
                        <div class="bov2-grid-lines">
                            ${ySteps.map(() => `<div class="bov2-grid-line"></div>`).join('')}
                        </div>
                        <div class="bov2-bars">
                            ${monthlyData.map(m => {
        const h = maxAmt > 0 ? Math.max(2, Math.round(m.amount / maxAmt * 100)) : 2;
        return `
                                <div class="bov2-bar-col">
                                    <div class="bov2-bar-hover">
                                        <div class="bov2-tooltip">${m.label}<br><strong>${formatMoneyWithSAR(m.amount)}</strong></div>
                                        <div class="bov2-bar-fill ${m.isCurrent ? 'bov2-bar-current' : ''}"
                                             style="height:${h}%"></div>
                                    </div>
                                    <div class="bov2-bar-lbl">${m.label}</div>
                                </div>`;
    }).join('')}
                        </div>
                    </div>
                </div>
            </div>

            <!-- الاستحقاقات -->
            <div class="bov2-card bov2-upcoming-card">
                <div class="bov2-card-hdr">
                    <div>
                        <div class="bov2-card-title">${tr('الاستحقاقات القادمة')}</div>
                        <div class="bov2-card-sub">${activeInv.length} ${tr('وديعة')} نشطة</div>
                    </div>
                    <button class="bov2-link" onclick="switchBankTab('investments')">${tr('عرض الكل')}</button>
                </div>
                <div class="bov2-upcoming-list">
                    ${upcoming.length ? upcoming.map(inv => {
        const days = daysLeft(inv.maturity_date);
        const col = urgencyColor(days);
        const pct = inv.profit_rate ? parseFloat(inv.profit_rate) : 0;
        const totalDays = inv.start_date ?
            Math.max(1, Math.ceil((new Date(inv.maturity_date) - new Date(inv.start_date)) / 86400000)) : 365;
        const elapsed = inv.start_date ?
            Math.ceil((today - new Date(inv.start_date)) / 86400000) : 0;
        const progress = Math.min(100, Math.max(0, Math.round(elapsed / totalDays * 100)));
        return `
                        <div class="bov2-up-item" onclick="switchBankTab('investments')">
                            <div class="bov2-up-accent" style="background:${col}"></div>
                            <div class="bov2-up-body">
                                <div class="bov2-up-top">
                                    <span class="bov2-up-num">${inv.investment_number || '#' + inv.id}</span>
                                    <span class="bov2-up-days" style="color:${col};background:${col}18">${urgencyLabel(days)}</span>
                                </div>
                                <div class="bov2-up-meta">${inv.bank_name || ''} · عائد ${pct}%</div>
                                <div class="bov2-up-progress">
                                    <div class="bov2-up-bar" style="width:${progress}%;background:${col}"></div>
                                </div>
                                <div class="bov2-up-footer">
                                    <span>${formatMoneyWithSAR(inv.amount)}</span>
                                    <span>${progress}% منقضي</span>
                                </div>
                            </div>
                        </div>`;
    }).join('') : `<div class="bov2-empty">لا توجد استثمارات نشطة</div>`}
                    ${activeInv.length > 4 ? `
                    <div class="bov2-more" onclick="switchBankTab('investments')">
                        + ${activeInv.length - 4} ودائع أخرى
                    </div>` : ''}
                </div>
            </div>
        </div>

        <!-- ══ Bottom Row: Accounts + Deposits ══ -->
        <div class="bov2-bot">

            <!-- بطاقات الحسابات البنكية -->
            <div class="bov2-card bov2-accounts-card">
                <div class="bov2-card-hdr">
                    <div>
                        <div class="bov2-card-title">${tr('الحسابات البنكية')}</div>
                        <div class="bov2-card-sub">${bankAccounts.length} حساب · ${formatMoneyWithSAR(totalBalance)} إجمالي</div>
                    </div>
                    <button class="bov2-link" onclick="switchBankTab('accounts')">${tr('عرض الكل')}</button>
                </div>
                <div class="bov2-acc-grid">
                    ${bankAccounts.length ? bankAccounts.slice(0, 4).map(acc => {
        const bal = parseFloat(acc.current_balance || 0);
        const init = parseFloat(acc.initial_balance || 0);
        const pct = totalBalance > 0 ? Math.round(bal / totalBalance * 100) : 0;
        const up = bal >= init;
        return `
                        <div class="bov2-acc-card" onclick="switchBankTab('accounts')">
                            <div class="bov2-acc-stripe" style="background:${up ? '#22c55e' : '#ef4444'}"></div>
                            <div class="bov2-acc-inner">
                                <div class="bov2-acc-bank">${acc.bank_name || ''}</div>
                                <div class="bov2-acc-name">${acc.account_name}</div>
                                <div class="bov2-acc-bal">${formatMoneyWithSAR(bal)}</div>
                                <div class="bov2-acc-bottom">
                                    <div class="bov2-acc-track">
                                        <div class="bov2-acc-fill" style="width:${pct}%;background:${up ? '#22c55e' : '#ef4444'}"></div>
                                    </div>
                                    <span class="bov2-acc-pct" style="color:${up ? '#22c55e' : '#ef4444'}">${pct}%</span>
                                </div>
                            </div>
                        </div>`;
    }).join('') : `<div class="bov2-empty" style="grid-column:1/-1">لا توجد حسابات</div>`}
                </div>
            </div>

            <!-- آخر الودائع -->
            <div class="bov2-card bov2-deps-card">
                <div class="bov2-card-hdr">
                    <div>
                        <div class="bov2-card-title">${tr('آخر الودائع')}</div>
                        <div class="bov2-card-sub">ودائع الشهر الحالي: ${formatMoneyWithSAR(thisMonth)}</div>
                    </div>
                </div>
                <div class="bov2-deps-list">
                    ${bankDeposits.length ? [...bankDeposits].slice(0, 6).map(dep => {
        const ok = dep.status === 'تم التأكيد';
        return `
                        <div class="bov2-dep-row">
                            <div class="bov2-dep-dot" style="background:${ok ? '#22c55e' : '#f59e0b'}"></div>
                            <div class="bov2-dep-info">
                                <div class="bov2-dep-num">${dep.deposit_number}</div>
                                <div class="bov2-dep-meta">${dep.account_name} · ${fmtDate(dep.deposit_date)}</div>
                            </div>
                            <div class="bov2-dep-right">
                                <div class="bov2-dep-amt">+${formatMoneyWithSAR(dep.amount)}</div>
                                <div class="bov2-dep-badge" style="color:${ok ? '#22c55e' : '#f59e0b'};background:${ok ? 'rgba(34,197,94,.1)' : 'rgba(245,158,11,.1)'}">${dep.status}</div>
                            </div>
                        </div>`;
    }).join('') : `<div class="bov2-empty">${tr('لا توجد ودائع')}</div>`}
                </div>
            </div>

        </div>
    </div>`;
}



// ─── renderAccountCards — تبقى للتوافق ──────────────────
function renderAccountCards() {
    return bankAccounts.map(acc => {
        const trend = parseFloat(acc.current_balance) >= parseFloat(acc.initial_balance || 0) ? 'up' : 'down';
        return `
        <div class="bank-row">
            <div class="br-indicator" style="background:${trend === 'up' ? 'var(--accent-green)' : 'var(--accent-red)'}"></div>
            <div class="br-icon">🏦</div>
            <div class="br-main">
                <span class="br-title">${acc.account_name}</span>
                <span class="br-sub">${acc.bank_name} · ${acc.account_number || ''}</span>
            </div>
            <div class="br-meta">
                <span class="br-amount">${formatMoneyWithSAR(acc.current_balance)}</span>
            </div>
        </div>`;
    }).join('');
}

// ─── قائمة آخر الودائع ──────────────────────────────────
function renderRecentDepositsList(deposits) {
    if (!deposits.length) {
        return `<div class="empty-state-sm">${tr('لا توجد ودائع مسجلة')}</div>`;
    }

    return `<div class="deposits-list">` +
        deposits.map(dep => `
        <div class="deposit-list-item status-${dep.status === 'تم التأكيد' ? 'confirmed' : 'pending'}">
            <div class="deposit-item-left">
                <div class="deposit-item-icon">${dep.status === 'تم التأكيد' ? '✅' : '⏳'}</div>
                <div class="deposit-item-info">
                    <div class="deposit-item-number">${dep.deposit_number}</div>
                    <div class="deposit-item-meta">
                        ${dep.account_name} · ${formatDate(dep.deposit_date)}
                    </div>
                </div>
            </div>
            <div class="deposit-item-right">
                <div class="deposit-item-amount">+${formatMoneyWithSAR(dep.amount)}</div>
                <div class="deposit-item-type">${dep.deposit_type}</div>
            </div>
        </div>`).join('') +
        `</div>`;
}

// ─── التايم لاين للودائع القادمة ─────────────────────────
function renderUpcomingDepositsTimeline() {
    const upcoming = monthlyDeposits
        .filter(d => d.status !== 'تم الإيداع')
        .sort((a, b) => new Date(a.expected_date) - new Date(b.expected_date))
        .slice(0, 6);

    if (!upcoming.length) {
        return `<div class="empty-state-sm">${tr('لا توجد ودائع مجدولة هذا الشهر')}</div>`;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return `<div class="deposit-timeline">` +
        upcoming.map(dep => {
            const depDate = new Date(dep.expected_date);
            depDate.setHours(0, 0, 0, 0);
            const diffDays = Math.round((depDate - today) / 86400000);
            const urgency = diffDays < 0 ? 'overdue' : diffDays === 0 ? 'today' : diffDays <= 3 ? 'soon' : 'normal';
            const label = diffDays < 0
                ? `متأخر ${Math.abs(diffDays)} يوم`
                : diffDays === 0 ? 'اليوم!'
                    : diffDays === 1 ? 'غداً'
                        : `خلال ${diffDays} أيام`;

            return `
            <div class="timeline-item urgency-${urgency}">
                <div class="timeline-date">
                    <div class="tl-day">${depDate.getDate()}</div>
                    <div class="tl-month">${depDate.toLocaleDateString('ar-SA', { month: 'short' })}</div>
                </div>
                <div class="timeline-connector"><div class="tl-dot urgency-${urgency}"></div></div>
                <div class="timeline-content">
                    <div class="tl-label ${urgency}">${label}</div>
                    <div class="tl-name">${dep.deposit_name}</div>
                    <div class="tl-amount">${formatMoneyWithSAR(dep.expected_amount)}</div>
                    <div class="tl-account">${dep.account_name || '—'}</div>
                </div>
                <div class="timeline-actions">
                    ${dep.status !== 'تم الإيداع' ? `<button class="btn-confirm-small" onclick="markMonthlyDepositDone(${dep.id})">✓ تأكيد الإيداع</button>` : ''}
                </div>
            </div>`;
        }).join('') +
        `</div>`;
}

// ════════════════════════════════════════════════════════
//  التبويب 2: الودائع — مع قسم ودائع هذا الشهر
// ════════════════════════════════════════════════════════
function renderDepositsTab() {
    const panel = document.getElementById('bank-tab-deposits');
    const now = new Date();
    const monthName = now.toLocaleDateString('ar-SA', { month: 'long', year: 'numeric' });

    // ── حساب ودائع الشهر الحالي من bank_deposits ──────────
    const month = now.getMonth();
    const year = now.getFullYear();
    const thisMonthDeps = bankDeposits.filter(d => {
        const dt = new Date(d.deposit_date);
        return dt.getMonth() === month && dt.getFullYear() === year;
    });
    const thisMonthConfirmed = thisMonthDeps.filter(d => d.status === 'تم التأكيد');
    const thisMonthPending = thisMonthDeps.filter(d => d.status === 'معلق');
    const totalThisMonth = thisMonthConfirmed.reduce((s, d) => s + parseFloat(d.amount || 0), 0);
    const totalPending = thisMonthPending.reduce((s, d) => s + parseFloat(d.amount || 0), 0);

    panel.innerHTML = `

        <!-- ═══ قسم: ودائع هذا الشهر ═══ -->
        <div class="section-block" style="margin-bottom:1.5rem">
            <div class="section-block-header">
                <h3>📅 ودائع ${monthName}</h3>
                <button class="btn-add" onclick="openAddDepositModal()" style="${showIf('bank.add_deposit')}">+ إيداع جديد</button>
            </div>

            <!-- بطاقات إحصاءات الشهر -->
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;margin-bottom:1.25rem">
                <div class="acc-daily-stat" style="border-right:3px solid var(--accent-green)">
                    <div style="font-size:.8rem;color:var(--text-muted)">إجمالي مُؤكَّد</div>
                    <div style="font-size:1.3rem;font-weight:700;color:var(--accent-green)">${formatMoneyWithSAR(totalThisMonth)}</div>
                    <div style="font-size:.78rem;color:var(--text-muted)">${thisMonthConfirmed.length} إيداع</div>
                </div>
                <div class="acc-daily-stat" style="border-right:3px solid var(--accent-orange)">
                    <div style="font-size:.8rem;color:var(--text-muted)">${tr('في الانتظار')}</div>
                    <div style="font-size:1.3rem;font-weight:700;color:var(--accent-orange)">${formatMoneyWithSAR(totalPending)}</div>
                    <div style="font-size:.78rem;color:var(--text-muted)">${thisMonthPending.length} إيداع</div>
                </div>
                <div class="acc-daily-stat" style="border-right:3px solid var(--accent-blue)">
                    <div style="font-size:.8rem;color:var(--text-muted)">إجمالي الشهر</div>
                    <div style="font-size:1.3rem;font-weight:700;color:var(--accent-blue)">${formatMoneyWithSAR(totalThisMonth + totalPending)}</div>
                    <div style="font-size:.78rem;color:var(--text-muted)">${thisMonthDeps.length} إيداع</div>
                </div>
                <div class="acc-daily-stat" style="border-right:3px solid var(--accent-cyan)">
                    <div style="font-size:.8rem;color:var(--text-muted)">آخر إيداع</div>
                    <div style="font-size:1rem;font-weight:700;color:var(--accent-cyan)">
                        ${thisMonthDeps.length > 0
            ? fmtDate(thisMonthDeps[0].deposit_date)
            : '—'}
                    </div>
                    <div style="font-size:.78rem;color:var(--text-muted)">
                        ${thisMonthDeps.length > 0 ? thisMonthDeps[0].deposit_type : ''}
                    </div>
                </div>
            </div>

            <!-- قائمة ودائع الشهر (مضغوطة) -->
            ${thisMonthDeps.length > 0 ? `
            <div class="table-wrapper" style="max-height:260px;overflow-y:auto">
                <table class="deposits-table">
                    <thead>
                        <tr>
                            <th>رقم الإيداع</th><th>التاريخ</th><th>الحساب</th>
                            <th>النوع</th><th>المبلغ</th><th>الحالة</th><th></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${thisMonthDeps.map(dep => `
                        <tr class="deposit-row ${dep.status === 'معلق' ? 'row-pending' : 'row-confirmed'}">
                            <td class="dep-number">${dep.deposit_number}</td>
                            <td>${fmtDate(dep.deposit_date)}</td>
                            <td>
                                <div class="dep-account-name">${dep.account_name}</div>
                                <div class="dep-bank-name">${dep.bank_name || ''}</div>
                            </td>
                            <td><span class="deposit-type-badge">${dep.deposit_type}</span></td>
                            <td class="dep-amount">+${formatMoneyWithSAR(dep.amount)}</td>
                            <td>${getDepositStatusBadge(dep.status)}</td>
                            <td class="dep-actions">
                                ${dep.status === 'معلق' && canDo('bank.confirm_deposit')
                    ? `<button class="btn-icon-sm btn-success" onclick="handleConfirmDeposit(${dep.id})" title="تأكيد">✓</button>`
                    : ''}
                                <button class="btn-icon-sm" onclick="viewDepositDetails(${dep.id})" title="تفاصيل">👁</button>
                            </td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>` : `<div class="empty-state-sm" style="padding:1.5rem;text-align:center;color:var(--text-muted)">
                لا توجد ودائع في ${monthName} — <button class="btn-add" onclick="openAddDepositModal()" style="display:inline">أضف إيداع</button>
            </div>`}
        </div>

        <!-- ═══ قسم: سجل الودائع الكامل ═══ -->
        <div class="section-block">
            <div class="section-block-header">
                <h3>📋 سجل جميع الودائع</h3>
                <button class="btn-add" onclick="openAddDepositModal()">+ إيداع جديد</button>
            </div>

            <div class="deposits-filters">
                <input type="text" class="filter-input" id="deposit-search"
                    placeholder="🔍 بحث برقم الإيداع أو اسم الحساب..."
                    oninput="filterDepositsList()">
                <select class="filter-select" id="deposit-status-filter" onchange="filterDepositsList()">
                    <option value="">كل الحالات</option>
                    <option value="معلق">معلق</option>
                    <option value="تم التأكيد">تم التأكيد</option>
                </select>
                <select class="filter-select" id="deposit-type-filter" onchange="filterDepositsList()">
                    <option value="">كل الأنواع</option>
                    <option value="إيداع نقدي">نقدي</option>
                    <option value="إيداع شيك">شيك</option>
                    <option value="تحويل بنكي">تحويل بنكي</option>
                    <option value="إيداع آلي">آلي</option>
                </select>
            </div>

            <div class="table-wrapper">
                <table class="deposits-table">
                    <thead>
                        <tr>
                            <th>رقم الإيداع</th><th>التاريخ</th><th>الحساب</th>
                            <th>النوع</th><th>المبلغ</th><th>الحالة</th><th>إجراءات</th>
                        </tr>
                    </thead>
                    <tbody id="deposits-tbody">
                        ${renderDepositsRows(bankDeposits)}
                    </tbody>
                </table>
            </div>
        </div>`;
}

function renderDepositsRows(deposits) {
    if (!deposits.length) {
        return `<tr><td colspan="7" class="empty-row">لا توجد ودائع</td></tr>`;
    }
    return deposits.map(dep => `
        <tr class="deposit-row ${dep.status === 'معلق' ? 'row-pending' : 'row-confirmed'}">
            <td class="dep-number">${dep.deposit_number}</td>
            <td>${fmtDate(dep.deposit_date)}</td>
            <td>
                <div class="dep-account-name">${dep.account_name}</div>
                <div class="dep-bank-name">${dep.bank_name || ''}</div>
            </td>
            <td><span class="deposit-type-badge">${dep.deposit_type}</span></td>
            <td class="dep-amount">+${formatMoneyWithSAR(dep.amount)}</td>
            <td>${getDepositStatusBadge(dep.status)}</td>
            <td class="dep-actions">
                ${dep.status === 'معلق' && canDo('bank.confirm_deposit')
            ? `<button class="btn-icon-sm btn-success" onclick="handleConfirmDeposit(${dep.id})" title="تأكيد الإيداع">✓</button>`
            : ''}
                <button class="btn-icon-sm" onclick="viewDepositDetails(${dep.id})" title="عرض التفاصيل">👁</button>
            </td>
        </tr>`).join('');
}

function filterDepositsList() {
    const search = document.getElementById('deposit-search')?.value.toLowerCase() || '';
    const status = document.getElementById('deposit-status-filter')?.value || '';
    const type = document.getElementById('deposit-type-filter')?.value || '';
    const filtered = bankDeposits.filter(dep => {
        const matchSearch = !search
            || dep.deposit_number.toLowerCase().includes(search)
            || (dep.account_name || '').toLowerCase().includes(search);
        const matchStatus = !status || dep.status === status;
        const matchType = !type || dep.deposit_type === type;
        return matchSearch && matchStatus && matchType;
    });
    const tbody = document.getElementById('deposits-tbody');
    if (tbody) tbody.innerHTML = renderDepositsRows(filtered);
}


// ════════════════════════════════════════════════════════
//  التبويب 4: الحسابات — صفوف
// ════════════════════════════════════════════════════════

let dailyBalances = [];

async function renderAccountsTab() {
    const panel = document.getElementById('bank-tab-accounts');

    try {
        const res = await fetch('api/?action=daily_balances&limit=60');
        const data = await res.json();
        if (data.success) dailyBalances = data.data || [];
    } catch { dailyBalances = []; }

    const today = new Date().toISOString().split('T')[0];

    panel.innerHTML = `
    <div class="bank-rows-page">

        <!-- ═══ الحسابات ═══ -->
        <div class="bank-section">
            <div class="bank-section-header">
                <div class="bsh-title"><span>🏦</span><h3>${tr('الحسابات البنكية')}</h3><span class="bsh-badge">${bankAccounts.length}</span></div>
                <div style="display:flex;gap:.5rem">
                    <button class="bsh-btn green" onclick="openRecordAllBalancesModal()">📊 ${tr('تسجيل رصيد اليوم')}</button>
                    <button class="bsh-btn" onclick="openAddAccountModal()" style="${showIf('bank.add_account')}">+ ${tr('إضافة حساب')}</button>
                </div>
            </div>
            <div class="bank-rows-list">
                ${bankAccounts.map(acc => {
        const todayBal = dailyBalances.find(b => b.account_id == acc.id && b.balance_date === today);
        const lastBal = dailyBalances.find(b => b.account_id == acc.id);
        const diff = lastBal ? parseFloat(acc.current_balance) - parseFloat(lastBal.closing_balance) : 0;
        const diffSign = diff >= 0 ? '+' : '';
        const diffColor = diff > 0 ? 'var(--accent-green)' : diff < 0 ? 'var(--accent-red)' : 'var(--text-muted)';
        const trend = diff >= 0 ? 'up' : 'dn';

        return `
                    <div class="bank-row account-row">
                        <div class="br-indicator" style="background:${trend === 'up' ? 'var(--accent-green)' : 'var(--accent-red)'}"></div>
                        <div class="br-icon">🏦</div>
                        <div class="br-main">
                            <span class="br-title">${acc.account_name}
                                <span class="br-inline-badge ${acc.is_active ? 'active' : 'inactive'}">${acc.is_active ? 'نشط' : 'غير نشط'}</span>
                            </span>
                            <span class="br-sub">${acc.bank_name} · <code style="font-size:.72rem">${acc.account_number || ''}</code> · ${acc.account_type || 'جاري'}</span>
                        </div>
                        <div class="br-meta">
                            <span class="br-amount blue">${formatMoneyWithSAR(acc.current_balance)}</span>
                            <span class="br-sub-meta">
                                ${lastBal && lastBal.balance_date !== today
                ? `<span style="color:${diffColor}">${diffSign}${formatMoneyWithSAR(Math.abs(diff))}</span>`
                : ''}
                                ${todayBal
                ? `<span style="color:var(--accent-green);font-size:.72rem">✅ مسجّل اليوم</span>`
                : `<span style="color:var(--accent-orange);font-size:.72rem">⏳ لم يُسجَّل</span>`}
                            </span>
                        </div>
                        <div class="br-trend ${trend}">${trend === 'up' ? '▲' : '▼'}</div>
                        <div class="br-actions">
                            <button class="br-btn green" onclick="openRecordBalanceModal(${acc.id})" title="تسجيل رصيد" style="${showIf('bank.record_balance')}">📊</button>
                            <button class="br-btn" onclick="openEditBalanceModal(${acc.id})" title="تعديل رصيد" style="${showIf('bank.edit_balance')}">✏️</button>
                            <button class="br-btn" onclick="openBalanceHistoryModal(${acc.id})" title="السجل">📜</button>
                            <button class="br-btn" onclick="editAccount(${acc.id})" title="إعدادات" style="${showIf('bank.edit_account')}">⚙️</button>
                        </div>
                    </div>`;
    }).join('') || `<div class="bank-empty">لا توجد حسابات — أضف حساباً جديداً</div>`}
            </div>
        </div>

        <!-- ═══ سجل الأرصدة اليومية — تصميم د ═══ -->
        <style id="dbl-css">
        .dbl-wrap{border:0.5px solid var(--border-color);border-radius:12px;overflow:hidden;background:var(--bg-card)}
        .dbl-header{display:flex;align-items:center;justify-content:space-between;padding:.8rem 1.1rem;border-bottom:0.5px solid var(--border-color);background:var(--bg-surface)}
        .dbl-title{font-size:13px;font-weight:600;color:var(--text-primary);display:flex;align-items:center;gap:.5rem}
        .dbl-title svg{color:var(--text-muted)}
        .dbl-add-btn{font-size:12px;color:#185FA5;background:#E6F1FB;border:none;border-radius:6px;padding:5px 12px;cursor:pointer;font-family:inherit;font-weight:600;display:inline-flex;align-items:center;gap:4px}
        .dbl-add-btn:hover{background:#B5D4F4}
        .dbl-date-divider{display:flex;align-items:center;gap:.75rem;padding:.4rem 1.1rem;background:var(--bg-surface);border-bottom:0.5px solid var(--border-color)}
        .dbl-date-chip{font-size:11px;font-weight:600;color:var(--text-muted);background:var(--bg-card);border:0.5px solid var(--border-color);border-radius:20px;padding:2px 10px;white-space:nowrap;display:flex;align-items:center;gap:4px}
        .dbl-date-line{flex:1;height:0.5px;background:var(--border-color)}
        .dbl-count{font-size:10.5px;color:var(--text-muted);white-space:nowrap}
        .dbl-row{display:flex;padding:1rem 1.05rem;align-items:stretch;border-bottom:0.5px solid var(--border-color)}
        .dbl-row:last-child{border-bottom:none}
        .dbl-row:hover{background:var(--bg-surface)}
        .dbl-accent{width:3px;flex-shrink:0;align-self:stretch;border-radius:0}
        .dbl-icon-col{width:44px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
        .dbl-icon{width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
        .dbl-icon-up{background:#EAF3DE;color:#3B6D11}
        .dbl-icon-dn{background:#FCEBEB;color:#791F1F}
        .dbl-icon-eq{background:var(--bg-surface);color:var(--text-muted);border:0.5px solid var(--border-color)}
        .dbl-main{flex:1;padding:.65rem .75rem .65rem 0;min-width:0;display:flex;flex-direction:column;gap:2px}
        .dbl-acc{font-size:13px;font-weight:600;color:var(--text-primary)}
        .dbl-bank{font-size:11.5px;color:var(--text-muted)}
        .dbl-note{font-size:11px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:1px}
        .dbl-nums{display:flex;flex-direction:column;align-items:flex-end;padding:.65rem 1rem .65rem 0;gap:3px;flex-shrink:0}
        .dbl-closing{font-size:14px;font-weight:600;color:#185FA5;font-variant-numeric:tabular-nums;direction:ltr;white-space:nowrap}
        .dbl-diff-up{font-size:11.5px;font-weight:600;color:#27500A;direction:ltr;white-space:nowrap}
        .dbl-diff-dn{font-size:11.5px;font-weight:600;color:#791F1F;direction:ltr;white-space:nowrap}
        .dbl-diff-eq{font-size:11.5px;color:var(--text-muted)}
        .dbl-opening{font-size:11px;color:var(--text-muted);direction:ltr;white-space:nowrap}
        .dbl-empty{padding:3rem 1rem;text-align:center;color:var(--text-muted);display:flex;flex-direction:column;align-items:center;gap:.75rem}
        .dbl-empty-icon{font-size:2rem;opacity:.25}
        .dbl-empty-text{font-size:13px}
        </style>

        <div class="dbl-wrap">
            <div class="dbl-header">
                <div class="dbl-title">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                    ${tr('سجل الأرصدة اليومية')}
                </div>
                <button class="dbl-add-btn" onclick="openRecordAllBalancesModal()">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
                    ${tr('سجل رصيد جديد')}
                </button>
            </div>

            ${(() => {
            const records = dailyBalances.slice(0, 30);
            if (!records.length) return `
                    <div class="dbl-empty">
                        <div class="dbl-empty-icon">📋</div>
                        <div class="dbl-empty-text">${tr('لم يتم تسجيل أي أرصدة يومية بعد')}</div>
                        <button class="dbl-add-btn" onclick="openRecordAllBalancesModal()">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
                            ${tr('سجل الرصيد الآن')}
                        </button>
                    </div>`;

            // تجميع السجلات حسب التاريخ
            const grouped = {};
            records.forEach(b => {
                const d = b.balance_date;
                if (!grouped[d]) grouped[d] = [];
                grouped[d].push(b);
            });

            const dayNames = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

            return Object.keys(grouped).sort((a, b) => b.localeCompare(a)).map(date => {
                const items = grouped[date];
                const dateObj = new Date(date);
                const dayName = dayNames[dateObj.getDay()];
                const dateLabel = dateObj.toLocaleDateString('ar-SA', { day: 'numeric', month: 'long', year: 'numeric' });

                const rows = items.map(b => {
                    const diff = parseFloat(b.closing_balance) - parseFloat(b.opening_balance);
                    const isUp = diff > 0, isDn = diff < 0;
                    const accentColor = isUp ? '#1D9E75' : isDn ? '#E24B4A' : 'var(--border-color)';
                    const iconCls = isUp ? 'dbl-icon-up' : isDn ? 'dbl-icon-dn' : 'dbl-icon-eq';
                    const iconSvg = isUp
                        ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`
                        : isDn
                            ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>`
                            : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
                    const diffHtml = isUp
                        ? `<div class="dbl-diff-up">▲ +${formatMoneyWithSAR(diff)}</div>`
                        : isDn
                            ? `<div class="dbl-diff-dn">▼ ${formatMoneyWithSAR(diff)}</div>`
                            : `<div class="dbl-diff-eq">لا تغيير</div>`;

                    return `
                        <div class="dbl-row">
                            <div class="dbl-accent" style="background:${accentColor}"></div>
                            <div class="dbl-icon-col">
                                <div class="dbl-icon ${iconCls}">${iconSvg}</div>
                            </div>
                            <div class="dbl-main">
                                <div class="dbl-acc">${b.account_name || '—'}</div>
                                <div class="dbl-bank">${b.bank_name || ''} · ${b.account_type || 'جاري'}</div>
                                ${b.notes ? `<div class="dbl-note">${b.notes}</div>` : ''}
                            </div>
                            <div class="dbl-nums">
                                <div class="dbl-closing">${formatMoneyWithSAR(b.closing_balance)} ﷼</div>
                                ${diffHtml}
                                <div class="dbl-opening">من: ${formatMoneyWithSAR(b.opening_balance)}</div>
                            </div>
                        </div>`;
                }).join('');

                return `
                    <div class="dbl-date-divider">
                        <div class="dbl-date-chip">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                            ${dayName} ${dateLabel}
                        </div>
                        <div class="dbl-date-line"></div>
                        <div class="dbl-count">${items.length} ${items.length === 1 ? 'سجل' : 'سجلات'}</div>
                    </div>
                    ${rows}`;
            }).join('');
        })()}
        </div>

    </div>`;
}



// ────────────────────────────────────────────────────────
//  مودال: تسجيل رصيد حساب واحد
// ────────────────────────────────────────────────────────
function openRecordBalanceModal(accountId) {
    const acc = bankAccounts.find(a => a.id == accountId);
    if (!acc) return;
    const today = new Date().toISOString().split('T')[0];
    const last = dailyBalances.find(b => b.account_id == accountId);

    DOM.modalTitle.textContent = `${tr('تسجيل رصيد اليوم')} — ${acc.bank_name} · ${acc.account_name}`;
    DOM.modalBody.innerHTML = `
        <style>
        .rb-modal-wrap{display:flex;flex-direction:column;gap:1rem;direction:rtl}
        .rb-header-card{background:var(--bg-surface,#F8F8F8);border:0.5px solid var(--border-color);border-radius:12px;padding:.9rem 1.1rem;display:flex;justify-content:space-between;align-items:center}
        .rb-hc-label{font-size:11px;color:var(--text-muted);margin-bottom:3px;font-weight:500}
        .rb-hc-value{font-size:17px;font-weight:600;color:var(--accent-blue);direction:ltr;text-align:right}
        .rb-hc-tag{font-size:10.5px;background:rgba(59,130,246,.1);color:var(--accent-blue);border-radius:4px;padding:2px 7px;display:inline-block;margin-top:4px}
        .rb-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:.75rem}
        .rb-form-group{display:flex;flex-direction:column;gap:4px}
        .rb-form-group.full{grid-column:1/-1}
        .rb-label{font-size:12px;font-weight:500;color:var(--text-muted)}
        .rb-label .req{color:#E24B4A}
        .rb-input{height:36px;border-radius:8px;border:0.5px solid var(--border-color);background:var(--bg-card,#fff);padding:0 10px;font-size:13px;color:var(--text-primary);width:100%;font-family:inherit;direction:ltr;text-align:right}
        .rb-input:focus{outline:none;border-color:var(--accent-blue);box-shadow:0 0 0 3px rgba(59,130,246,.1)}
        .rb-diff-badge{display:inline-flex;align-items:center;gap:4px;font-size:12px;margin-top:4px;padding:4px 9px;border-radius:6px}
        .rb-diff-up{background:rgba(16,185,129,.1);color:#059669}
        .rb-diff-down{background:rgba(239,68,68,.1);color:#DC2626}
        .rb-footer{display:flex;gap:.6rem;justify-content:flex-end;padding-top:.75rem;border-top:0.5px solid var(--border-color);margin-top:.25rem}
        .rb-btn{height:34px;padding:0 1rem;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;border:0.5px solid var(--border-color);background:transparent;color:var(--text-primary);font-family:inherit;display:inline-flex;align-items:center;gap:5px}
        .rb-btn:hover{background:var(--bg-surface)}
        .rb-btn-primary{background:var(--accent-blue,#2563EB);color:#fff;border-color:transparent}
        .rb-btn-primary:hover{opacity:.9}
        .rb-btn-success{background:#059669;color:#fff;border-color:transparent}
        .rb-btn-success:hover{opacity:.9}
        </style>
        <div class="rb-modal-wrap">
            <div class="rb-header-card">
                <div>
                    <div class="rb-hc-label">${tr('الرصيد الحالي في النظام')}</div>
                    <div class="rb-hc-value">${formatMoneyWithSAR(acc.current_balance)}</div>
                </div>
                ${last ? `<div style="text-align:left">
                    <div class="rb-hc-label">آخر تسجيل</div>
                    <div style="font-size:12.5px;font-weight:500;color:var(--text-primary)">${fmtDate(last.balance_date)}</div>
                    <span class="rb-hc-tag">${formatMoneyWithSAR(last.closing_balance)}</span>
                </div>` : ''}
            </div>

            <div class="rb-form-grid">
                <div class="rb-form-group">
                    <label class="rb-label">${tr('التاريخ')} <span class="req">*</span></label>
                    <input type="date" id="rb-date" class="rb-input" value="${today}">
                </div>
                <div class="rb-form-group">
                    <label class="rb-label">${tr('رصيد الافتتاح')}</label>
                    <input type="number" id="rb-opening" class="rb-input" step="0.01"
                        value="${last ? parseFloat(last.closing_balance).toFixed(2) : parseFloat(acc.current_balance).toFixed(2)}"
                        placeholder="0.00">
                </div>
                <div class="rb-form-group full">
                    <label class="rb-label">${tr('رصيد الإغلاق الفعلي')} <span class="req">*</span></label>
                    <input type="number" id="rb-closing" class="rb-input" step="0.01"
                        value="${parseFloat(acc.current_balance).toFixed(2)}"
                        placeholder="أدخل الرصيد الفعلي من كشف البنك"
                        oninput="calcBalanceDiff(${parseFloat(acc.current_balance)})">
                    <div id="rb-diff"></div>
                </div>
                <div class="rb-form-group full">
                    <label class="rb-label">ملاحظات</label>
                    <input type="text" id="rb-notes" class="rb-input" style="direction:rtl;text-align:right" placeholder="مثال: كشف البنك بتاريخ اليوم">
                </div>
            </div>

            <div class="rb-footer">
                <button class="rb-btn" onclick="closeModal()">إلغاء</button>
                <button class="rb-btn rb-btn-primary" onclick="submitRecordBalance(${accountId}, false)">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                    ${tr('حفظ الرصيد')}
                </button>
                <button class="rb-btn rb-btn-success" onclick="submitRecordBalance(${accountId}, true)">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.51"/></svg>
                    ${tr('حفظ وتحديث رصيد النظام')}
                </button>
            </div>
        </div>`;
    openModal();
}

function calcBalanceDiff(currentBalance) {
    const closing = parseFloat(document.getElementById('rb-closing')?.value || 0);
    const diff = closing - currentBalance;
    const el = document.getElementById('rb-diff');
    if (!el) return;
    if (isNaN(diff) || diff === 0) { el.textContent = ''; return; }
    const up = diff > 0;
    el.innerHTML = `<span class="rb-diff-badge ${up ? 'rb-diff-up' : 'rb-diff-down'}">
        ${up ? '▲' : '▼'} ${up ? 'زيادة' : 'نقص'} ${formatMoneyWithSAR(Math.abs(diff))} عن رصيد النظام
    </span>`;
}

async function submitRecordBalance(accountId, updateCurrent) {
    const payload = {
        account_id: accountId,
        balance_date: document.getElementById('rb-date')?.value,
        opening_balance: document.getElementById('rb-opening')?.value || '0',
        closing_balance: document.getElementById('rb-closing')?.value,
        notes: document.getElementById('rb-notes')?.value || '',
        update_current: updateCurrent ? '1' : '0',
    };
    if (!payload.balance_date || !payload.closing_balance) {
        return showToast('يرجى إدخال التاريخ والرصيد', 'error');
    }
    try {
        const res = await fetch('api/?action=record_daily_balance', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            showToast('تم تسجيل الرصيد بنجاح ✓', 'success');
            closeModal();
            await loadBankAccounts();
            renderAccountsTab();
        } else {
            showToast(data.message || 'فشل الحفظ', 'error');
        }
    } catch { showToast('خطأ في الاتصال', 'error'); }
}


// ────────────────────────────────────────────────────────
//  مودال: تسجيل أرصدة جميع الحسابات دفعة واحدة
// ────────────────────────────────────────────────────────
function openRecordAllBalancesModal() {
    const today = new Date().toISOString().split('T')[0];

    const rows = bankAccounts
        .filter(a => a.is_active)
        .map(acc => {
            const last = dailyBalances.find(b => b.account_id == acc.id);
            return `
            <div style="background:var(--bg-surface);border:1px solid var(--border-color);border-radius:10px;padding:1rem;margin-bottom:.75rem">
                <div style="display:flex;justify-content:space-between;margin-bottom:.5rem">
                    <div>
                        <span style="font-weight:700">${acc.bank_name}</span>
                        <span style="color:var(--text-muted);font-size:.85rem"> · ${acc.account_name}</span>
                    </div>
                    <span style="color:var(--accent-blue);font-weight:600">${formatMoneyWithSAR(acc.current_balance)}</span>
                </div>
                <div style="display:flex;gap:.75rem;align-items:center">
                    <input type="number" step="0.01"
                        class="form-input all-closing" data-id="${acc.id}"
                        data-opening="${last ? parseFloat(last.closing_balance).toFixed(2) : parseFloat(acc.current_balance).toFixed(2)}"
                        value="${parseFloat(acc.current_balance).toFixed(2)}"
                        placeholder="رصيد الإغلاق الفعلي"
                        style="flex:1">
                    <label style="display:flex;align-items:center;gap:.4rem;font-size:.83rem;white-space:nowrap">
                        <input type="checkbox" class="all-update" data-id="${acc.id}" checked>
                        ${tr('تحديث رصيد النظام')}
                    </label>
                </div>
            </div>`;
        }).join('');

    DOM.modalTitle.textContent = `📊 ${tr('تسجيل رصيد اليوم')} — ${tr('جميع الحسابات')}`;
    DOM.modalBody.innerHTML = `
        <div class="form-group" style="margin-bottom:1rem">
            <label class="form-label">التاريخ</label>
            <input type="date" id="all-date" class="form-input" value="${today}">
        </div>
        <div style="max-height:380px;overflow-y:auto;padding-left:2px">${rows}</div>
        <div class="form-group" style="margin-top:1rem">
            <label class="form-label">${tr('ملاحظة عامة')} (${tr('اختياري')})</label>
            <input type="text" id="all-notes" class="form-input" placeholder="مثال: مراجعة نهاية اليوم">
        </div>
        <div style="display:flex;gap:.75rem;margin-top:1.25rem;justify-content:flex-end">
            <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
            <button class="btn btn-primary" onclick="submitAllBalances()">
                💾 ${tr('حفظ جميع الأرصدة')}
            </button>
        </div>`;
    openModal();
}

async function submitAllBalances() {
    const date = document.getElementById('all-date')?.value;
    const notes = document.getElementById('all-notes')?.value || '';
    if (!date) return showToast('يرجى تحديد التاريخ', 'error');

    const inputs = document.querySelectorAll('.all-closing');
    const updates = document.querySelectorAll('.all-update');
    const records = [];

    inputs.forEach(inp => {
        const id = inp.dataset.id;
        const closing = inp.value;
        if (!closing) return;
        const updateEl = document.querySelector(`.all-update[data-id="${id}"]`);
        records.push({
            account_id: id,
            balance_date: date,
            opening_balance: inp.dataset.opening || closing,
            closing_balance: closing,
            notes: notes,
            update_current: updateEl?.checked ? '1' : '0',
        });
    });

    if (!records.length) return showToast('لا توجد بيانات للحفظ', 'error');

    let ok = 0, fail = 0;
    for (const rec of records) {
        try {
            const res = await fetch('api/?action=record_daily_balance', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rec)
            });
            const data = await res.json();
            data.success ? ok++ : fail++;
        } catch { fail++; }
    }

    showToast(`تم حفظ ${ok} حساب${fail > 0 ? ` · فشل ${fail}` : ''}`, ok > 0 ? 'success' : 'error');
    if (ok > 0) {
        closeModal();
        await loadBankAccounts();
        renderAccountsTab();
    }
}


// ────────────────────────────────────────────────────────
//  مودال: تعديل رصيد النظام مباشرة
// ────────────────────────────────────────────────────────
function openEditBalanceModal(accountId) {
    const acc = bankAccounts.find(a => a.id == accountId);
    if (!acc) return;

    DOM.modalTitle.textContent = `تعديل رصيد — ${acc.bank_name} · ${acc.account_name}`;
    DOM.modalBody.innerHTML = `
        <style>
        .eb-wrap{display:flex;flex-direction:column;gap:1rem;direction:rtl}
        .eb-warn{background:rgba(245,158,11,.08);border:0.5px solid rgba(245,158,11,.4);border-radius:10px;padding:.7rem 1rem;font-size:12.5px;color:#92400E;display:flex;align-items:flex-start;gap:.5rem;line-height:1.55}
        .eb-warn svg{flex-shrink:0;margin-top:1px}
        .eb-balance-card{background:var(--bg-surface,#F8F8F8);border:0.5px solid var(--border-color);border-radius:12px;padding:.9rem 1.1rem}
        .eb-bc-label{font-size:11px;color:var(--text-muted);margin-bottom:4px;font-weight:500}
        .eb-bc-amount{font-size:22px;font-weight:600;color:var(--accent-blue);direction:ltr}
        .eb-bc-date{font-size:11.5px;color:var(--text-muted);margin-top:4px;display:flex;align-items:center;gap:4px}
        .eb-form-group{display:flex;flex-direction:column;gap:4px}
        .eb-label{font-size:12px;font-weight:500;color:var(--text-muted)}
        .eb-label .req{color:#E24B4A}
        .eb-input{height:36px;border-radius:8px;border:0.5px solid var(--border-color);background:var(--bg-card,#fff);padding:0 10px;font-size:13px;color:var(--text-primary);width:100%;font-family:inherit;direction:ltr;text-align:right}
        .eb-input:focus{outline:none;border-color:var(--accent-blue);box-shadow:0 0 0 3px rgba(59,130,246,.1)}
        .eb-input-rtl{direction:rtl;text-align:right}
        .eb-footer{display:flex;gap:.6rem;justify-content:flex-end;padding-top:.75rem;border-top:0.5px solid var(--border-color);margin-top:.25rem}
        .eb-btn{height:34px;padding:0 1rem;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;border:0.5px solid var(--border-color);background:transparent;color:var(--text-primary);font-family:inherit;display:inline-flex;align-items:center;gap:5px}
        .eb-btn:hover{background:var(--bg-surface)}
        .eb-btn-primary{background:var(--accent-blue,#2563EB);color:#fff;border-color:transparent}
        .eb-btn-primary:hover{opacity:.9}
        </style>
        <div class="eb-wrap">
            <div class="eb-warn">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                <span>هذا الإجراء يُعدّل الرصيد الحالي في النظام مباشرة، وسيُسجَّل تلقائياً في سجل الأرصدة اليومية.</span>
            </div>

            <div class="eb-balance-card">
                <div class="eb-bc-label">الرصيد الحالي في النظام</div>
                <div class="eb-bc-amount">${formatMoneyWithSAR(acc.current_balance)}</div>
                <div class="eb-bc-date">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    آخر تحديث: اليوم
                </div>
            </div>

            <div class="eb-form-group">
                <label class="eb-label">الرصيد الجديد (ريال) <span class="req">*</span></label>
                <input type="number" id="eb-new-balance" class="eb-input" step="0.01"
                    value="${parseFloat(acc.current_balance).toFixed(2)}"
                    placeholder="0.00">
            </div>
            <div class="eb-form-group">
                <label class="eb-label">سبب التعديل <span class="req">*</span></label>
                <input type="text" id="eb-reason" class="eb-input eb-input-rtl"
                    placeholder="مثال: تصحيح بناءً على كشف البنك">
            </div>

            <div class="eb-footer">
                <button class="eb-btn" onclick="closeModal()">إلغاء</button>
                <button class="eb-btn eb-btn-primary" onclick="submitEditBalance(${accountId})">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    تحديث الرصيد
                </button>
            </div>
        </div>`;
    openModal();
}

async function submitEditBalance(accountId) {
    const newBalance = document.getElementById('eb-new-balance')?.value;
    const reason = document.getElementById('eb-reason')?.value;
    if (!newBalance) return showToast('يرجى إدخال الرصيد الجديد', 'error');
    if (!reason) return showToast('يرجى إدخال سبب التعديل', 'error');

    const acc = bankAccounts.find(a => a.id == accountId);
    const today = new Date().toISOString().split('T')[0];

    // تحديث الرصيد الحالي + تسجيل يومي
    try {
        const res = await fetch('api/?action=record_daily_balance', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                account_id: accountId,
                balance_date: today,
                opening_balance: acc ? parseFloat(acc.current_balance).toFixed(2) : '0',
                closing_balance: newBalance,
                notes: `تعديل يدوي: ${reason}`,
                update_current: '1',
            })
        });
        const data = await res.json();
        if (data.success) {
            showToast('تم تحديث الرصيد بنجاح ✓', 'success');
            closeModal();
            await loadBankAccounts();
            renderAccountsTab();
        } else {
            showToast(data.message || 'فشل التحديث', 'error');
        }
    } catch { showToast('خطأ في الاتصال', 'error'); }
}


// ────────────────────────────────────────────────────────
//  مودال: سجل الأرصدة لحساب محدد
// ────────────────────────────────────────────────────────
function openBalanceHistoryModal(accountId) {
    const acc = bankAccounts.find(a => a.id == accountId);
    const history = dailyBalances.filter(b => b.account_id == accountId);

    DOM.modalTitle.textContent = `سجل الأرصدة — ${acc?.bank_name} · ${acc?.account_name}`;
    DOM.modalBody.innerHTML = history.length > 0 ? `
        <style>
        .bh-wrap{direction:rtl}
        .bh-table-wrap{border-radius:10px;border:0.5px solid var(--border-color);overflow:hidden}
        .bh-table{width:100%;border-collapse:collapse;font-size:12.5px}
        .bh-table thead tr{background:var(--bg-surface,#F8F8F8)}
        .bh-table th{padding:.55rem .85rem;text-align:right;font-weight:500;font-size:11px;color:var(--text-muted);border-bottom:0.5px solid var(--border-color);white-space:nowrap}
        .bh-table td{padding:.6rem .85rem;border-bottom:0.5px solid var(--border-color);color:var(--text-primary);text-align:right}
        .bh-table tr:last-child td{border-bottom:none}
        .bh-table tr:hover td{background:var(--bg-surface)}
        .bh-td-date{font-weight:500;font-size:12.5px}
        .bh-td-mono{direction:ltr;text-align:left;font-variant-numeric:tabular-nums}
        .bh-td-green{color:#059669;font-weight:500;direction:ltr;text-align:left}
        .bh-td-bold{font-weight:600;direction:ltr;text-align:left}
        .bh-td-up{color:#059669;direction:ltr;text-align:left}
        .bh-td-down{color:#DC2626;direction:ltr;text-align:left}
        .bh-td-notes{color:var(--text-muted);font-size:11.5px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .bh-footer{display:flex;align-items:center;justify-content:space-between;padding-top:.75rem;border-top:0.5px solid var(--border-color);margin-top:.75rem}
        .bh-count{font-size:11.5px;color:var(--text-muted)}
        .bh-btn{height:34px;padding:0 1rem;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;border:0.5px solid var(--border-color);background:transparent;color:var(--text-primary);font-family:inherit}
        .bh-btn:hover{background:var(--bg-surface)}
        </style>
        <div class="bh-wrap">
            <div style="max-height:380px;overflow-y:auto;border-radius:10px">
                <div class="bh-table-wrap">
                    <table class="bh-table" role="table" aria-label="سجل الأرصدة اليومية">
                        <thead>
                            <tr>
                                <th>التاريخ</th>
                                <th>${tr('افتتاح')}</th>
                                <th>${tr('ودائع')}</th>
                                <th>${tr('إغلاق')}</th>
                                <th>${tr('الفرق')}</th>
                                <th>ملاحظات</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${history.map(b => {
        const diff = parseFloat(b.closing_balance) - parseFloat(b.opening_balance);
        const up = diff >= 0;
        return `<tr>
                                <td class="bh-td-date">${fmtDate(b.balance_date)}</td>
                                <td class="bh-td-mono">${formatMoneyWithSAR(b.opening_balance)}</td>
                                <td class="bh-td-green">+${formatMoneyWithSAR(b.total_deposits)}</td>
                                <td class="bh-td-bold">${formatMoneyWithSAR(b.closing_balance)}</td>
                                <td class="${up ? 'bh-td-up' : 'bh-td-down'}">${up ? '+' : ''}${formatMoneyWithSAR(diff)}</td>
                                <td class="bh-td-notes" title="${b.notes || ''}">${b.notes || '—'}</td>
                            </tr>`;
    }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
            <div class="bh-footer">
                <span class="bh-count">إجمالي ${history.length} سجل</span>
                <button class="bh-btn" onclick="closeModal()">إغلاق</button>
            </div>
        </div>` : `
        <div style="padding:2.5rem 1rem;text-align:center;color:var(--text-muted);direction:rtl">
            <div style="font-size:2rem;margin-bottom:.75rem;opacity:.4">📋</div>
            <div style="font-size:13.5px">${tr('لا يوجد سجل أرصدة لهذا الحساب بعد')}</div>
        </div>
        <div style="text-align:left;padding-top:.5rem;border-top:0.5px solid var(--border-color)">
            <button class="btn btn-secondary" onclick="closeModal()">إغلاق</button>
        </div>`;

    openModal();
}


// ────────────────────────────────────────────────────────
//  CSS المضمّن لبطاقات الحسابات
//  (يُضاف برمجياً إذا لم يكن في style.css)
// ────────────────────────────────────────────────────────
(function injectAccountStyles() {
    if (document.getElementById('acc-styles')) return;
    const s = document.createElement('style');
    s.id = 'acc-styles';
    s.textContent = `
        .account-detail-card {
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 14px;
            padding: 1.25rem;
            transition: box-shadow .2s;
        }
        .account-detail-card:hover { box-shadow: 0 4px 20px rgba(0,0,0,.1); }
        .adc-header { display:flex; justify-content:space-between; margin-bottom:1rem; }
        .adc-bank  { font-size:.82rem; color:var(--text-muted); }
        .adc-name  { font-size:1.05rem; font-weight:700; color:var(--text-primary); }
        .adc-balance-row {
            display:flex; justify-content:space-between; align-items:flex-end;
            padding:.75rem 0; border-top:1px solid var(--border-color);
            border-bottom:1px solid var(--border-color); margin-bottom:.75rem;
        }
        .adc-balance { font-size:1.4rem; font-weight:700; color:var(--accent-blue); }
        .adc-actions { display:flex; gap:.5rem; flex-wrap:wrap; }
        .adc-actions .btn { font-size:.8rem; padding:.35rem .65rem; }
        .acc-daily-stat {
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 1rem 1.25rem;
        }
    `;
    document.head.appendChild(s);
})();

function renderMonthlyTab() {
    const panel = document.getElementById('bank-tab-monthly');
    const now = new Date();
    const monthName = now.toLocaleDateString('ar-SA', { month: 'long', year: 'numeric' });

    // إحصاءات الشهر
    const totalExpected = monthlyDeposits.reduce((s, d) => s + parseFloat(d.expected_amount || 0), 0);
    const totalReceived = monthlyDeposits.filter(d => d.status === 'تم الإيداع').reduce((s, d) => s + parseFloat(d.expected_amount || 0), 0);
    const pending = monthlyDeposits.filter(d => d.status !== 'تم الإيداع').length;
    const doneCount = monthlyDeposits.filter(d => d.status === 'تم الإيداع').length;
    const progressPct = totalExpected > 0 ? Math.round((totalReceived / totalExpected) * 100) : 0;

    panel.innerHTML = `
        <div class="monthly-header">
            <div class="monthly-title">📅 ودائع ${monthName}</div>
            <button class="btn-add" onclick="openAddMonthlyDepositModal()">+ جدولة وديعة جديدة</button>
        </div>

        <!-- إحصاءات الشهر -->
        <div class="monthly-stats-row">
            <div class="monthly-stat">
                <div class="ms-value">${formatMoneyWithSAR(totalExpected)}</div>
                <div class="ms-label">المتوقع هذا الشهر</div>
            </div>
            <div class="monthly-stat ms-received">
                <div class="ms-value">${formatMoneyWithSAR(totalReceived)}</div>
                <div class="ms-label">تم استلامه</div>
            </div>
            <div class="monthly-stat">
                <div class="ms-value">${pending}</div>
                <div class="ms-label">وديعة قيد الانتظار</div>
            </div>
            <div class="monthly-stat ms-done">
                <div class="ms-value">${doneCount}</div>
                <div class="ms-label">تم إيداعها</div>
            </div>
        </div>

        <!-- شريط التقدم -->
        <div class="progress-section">
            <div class="progress-header">
                <span>نسبة الاكتمال</span>
                <span class="progress-pct">${progressPct}%</span>
            </div>
            <div class="progress-bar-track">
                <div class="progress-bar-fill" style="width:${progressPct}%"></div>
            </div>
        </div>

        <!-- تقويم الودائع -->
        <div class="section-block">
            <div class="section-block-header">
                <h3>📆 تقويم الإيداعات</h3>
            </div>
            ${renderDepositCalendar()}
        </div>

        <!-- قائمة الودائع المجدولة -->
        <div class="section-block">
            <div class="section-block-header">
                <h3>📋 قائمة الودائع المجدولة</h3>
            </div>
            <div class="bank-rows-list">
                ${renderMonthlyDepositCards()}
            </div>
        </div>`;

    // تحديث شارة التبويب
    const badge = document.getElementById('monthly-badge');
    if (badge) badge.textContent = pending;
}

// ─── تقويم الودائع ───────────────────────────────────────
function renderDepositCalendar() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const today = now.getDate();
    const firstDay = new Date(year, month, 1).getDay();      // 0=sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // تجميع الودائع حسب اليوم
    const depositsByDay = {};
    monthlyDeposits.forEach(dep => {
        const d = new Date(dep.expected_date);
        if (d.getMonth() === month && d.getFullYear() === year) {
            const day = d.getDate();
            if (!depositsByDay[day]) depositsByDay[day] = [];
            depositsByDay[day].push(dep);
        }
    });

    const dayNames = ['أح', 'إث', 'ث', 'أر', 'خ', 'ج', 'س'];
    let calHtml = `<div class="deposit-calendar"><div class="cal-header">`
        + dayNames.map(d => `<div class="cal-day-name">${d}</div>`).join('')
        + `</div><div class="cal-grid">`;

    // خلايا فارغة قبل اليوم الأول (الأسبوع يبدأ بالأحد)
    for (let i = 0; i < firstDay; i++) {
        calHtml += `<div class="cal-cell cal-empty"></div>`;
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const isToday = day === today;
        const hasDep = !!depositsByDay[day];
        const allDone = hasDep && depositsByDay[day].every(d => d.status === 'تم الإيداع');
        const hasPending = hasDep && depositsByDay[day].some(d => d.status !== 'تم الإيداع');

        let cls = 'cal-cell';
        if (isToday) cls += ' cal-today';
        if (allDone) cls += ' cal-done';
        else if (hasPending) cls += ' cal-has-deposit';

        const depCount = hasDep ? depositsByDay[day].length : 0;
        calHtml += `
        <div class="${cls}" onclick="${hasDep ? `showDayDeposits(${day})` : ''}">
            <span class="cal-day-num">${day}</span>
            ${hasDep ? `<span class="cal-dep-dot" title="${depCount} ${tr('وديعة')}">${depCount}</span>` : ''}
        </div>`;
    }

    calHtml += `</div></div>`;
    return calHtml;
}

// ─── صفوف الودائع المجدولة ──────────────────────────────
function renderMonthlyDepositCards() {
    if (!monthlyDeposits.length) {
        return `<div class="bank-empty">${tr('لا توجد ودائع مجدولة هذا الشهر')}</div>`;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return monthlyDeposits
        .sort((a, b) => new Date(a.expected_date) - new Date(b.expected_date))
        .map(dep => {
            const depDate = new Date(dep.expected_date);
            depDate.setHours(0, 0, 0, 0);
            const diffDays = Math.round((depDate - today) / 86400000);
            const isDone = dep.status === 'تم الإيداع';
            const isLate = !isDone && diffDays < 0;
            const isToday = !isDone && diffDays === 0;
            const isSoon = !isDone && diffDays > 0 && diffDays <= 3;

            let indColor = 'var(--text-muted)';
            let statusLabel = formatDate(dep.expected_date);
            let statusIcon = '📅';
            if (isDone) { indColor = 'var(--accent-green)'; statusLabel = 'تم الإيداع ✅'; statusIcon = '✅'; }
            else if (isLate) { indColor = 'var(--accent-red)'; statusLabel = `متأخر ${Math.abs(diffDays)} يوم`; statusIcon = '⚠️'; }
            else if (isToday) { indColor = 'var(--accent-orange)'; statusLabel = 'اليوم 🔔'; statusIcon = '🔔'; }
            else if (isSoon) { indColor = 'var(--accent-cyan)'; statusLabel = `خلال ${diffDays} أيام`; statusIcon = '⏰'; }

            return `
            <div class="bank-row">
                <div class="br-indicator" style="background:${indColor}"></div>
                <div class="br-icon">${statusIcon}</div>
                <div class="br-main">
                    <span class="br-title">${dep.deposit_name}</span>
                    <span class="br-sub">🏦 ${dep.account_name || '—'} ${dep.notes ? '· ' + dep.notes : ''}</span>
                </div>
                <div class="br-meta">
                    <span class="br-amount green">${formatMoneyWithSAR(dep.expected_amount)}</span>
                    <span class="br-tag" style="color:${indColor}">${statusLabel}</span>
                </div>
                <div class="br-actions">
                    ${!isDone
                    ? `<button class="br-btn green" onclick="markMonthlyDepositDone(${dep.id})">✓ تأكيد</button>`
                    : `<span class="br-done-label">✅</span>`}
                    <button class="br-btn danger" onclick="deleteMonthlyDeposit(${dep.id})">🗑</button>
                </div>
            </div>`;
        }).join('');
}

// ─── عرض ودائع يوم محدد ──────────────────────────────────
function showDayDeposits(day) {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();

    const dayDeposits = monthlyDeposits.filter(dep => {
        const d = new Date(dep.expected_date);
        return d.getDate() === day && d.getMonth() === month && d.getFullYear() === year;
    });

    if (!dayDeposits.length) return;

    const listHtml = dayDeposits.map(dep => `
        <div class="day-dep-item">
            <strong>${dep.deposit_name}</strong>
            <span>${formatMoneyWithSAR(dep.expected_amount)}</span>
            <span class="dep-status-sm">${dep.status}</span>
        </div>`).join('');

    DOM.modalTitle.textContent = `ودائع يوم ${day}`;
    DOM.modalBody.innerHTML = `<div class="day-deposits-list">${listHtml}</div>`;
    openModal();
}

// ════════════════════════════════════════════════════════
//  التبويب 4: الحسابات
// ════════════════════════════════════════════════════════
async function loadBankAccounts() {
    try {
        const res = await fetch('api/?action=bank_accounts');
        if (!res.ok) { bankAccounts = []; return; }
        const result = await res.json();
        if (result.success) bankAccounts = result.data || [];
        else bankAccounts = [];
    } catch (e) {
        bankAccounts = [];
        console.warn('loadBankAccounts:', e);
    }
}

async function loadDeposits() {
    try {
        const res = await fetch('api/?action=bank_deposits');
        if (!res.ok) { bankDeposits = []; return; }
        const result = await res.json();
        if (result.success) bankDeposits = result.data || [];
        else bankDeposits = [];
    } catch (e) {
        bankDeposits = [];
        console.warn('loadDeposits:', e);
    }
}

async function loadMonthlyDeposits() {
    try {
        const res = await fetch('api/?action=monthly_deposits');
        if (!res.ok) { monthlyDeposits = []; }
        else {
            const result = await res.json();
            monthlyDeposits = result.success ? (result.data || []) : [];
        }
    } catch (e) {
        monthlyDeposits = [];
    }
    await loadDeposits();
}

// ─── إحصاءات الشهر الحالي ───────────────────────────────
function getCurrentMonthDeposits() {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    return bankDeposits
        .filter(d => {
            const date = new Date(d.deposit_date);
            return date.getMonth() === month && date.getFullYear() === year && d.status === 'تم التأكيد';
        })
        .reduce((s, d) => s + parseFloat(d.amount || 0), 0);
}

// ─── تحديث الإحصاءات السريعة ─────────────────────────────
function updateQuickStats(totalBalance, thisMonth, pending, confirmed) {
    const container = document.getElementById('bank-quick-stats');
    if (!container) return;
    container.innerHTML = `
        <div class="quick-stat-card qsc-blue">
            <div class="qsc-icon">🏦</div>
            <div class="qsc-value">${formatMoneyWithSAR(totalBalance)}</div>
            <div class="qsc-label">${tr('إجمالي الأرصدة')}</div>
        </div>
        <div class="quick-stat-card qsc-green">
            <div class="qsc-icon">📈</div>
            <div class="qsc-value">${formatMoneyWithSAR(thisMonth)}</div>
            <div class="qsc-label">ودائع هذا الشهر</div>
        </div>
        <div class="quick-stat-card qsc-orange">
            <div class="qsc-icon">⏳</div>
            <div class="qsc-value">${pending}</div>
            <div class="qsc-label">ودائع معلقة</div>
        </div>
        <div class="quick-stat-card qsc-teal">
            <div class="qsc-icon">✅</div>
            <div class="qsc-value">${confirmed}</div>
            <div class="qsc-label">ودائع مؤكدة</div>
        </div>`;
}

// ════════════════════════════════════════════════════════
//  المودالات
// ════════════════════════════════════════════════════════

// ─── إضافة إيداع بنكي ────────────────────────────────────
function openAddDepositModal() {
    const accountsOptions = bankAccounts.map(acc =>
        `<option value="${acc.id}">${acc.account_name} — ${acc.bank_name}</option>`
    ).join('');

    DOM.modalTitle.textContent = `📥 ${tr('إضافة إيداع بنكي')}`;
    DOM.modalBody.innerHTML = `
        <form id="deposit-form" onsubmit="submitDeposit(event)">
            <div class="modal-form-grid">
                <div class="form-group">
                    <label class="form-label">${tr('الحساب البنكي')} *</label>
                    <select name="account_id" class="form-input" required>
                        <option value="">اختر الحساب</option>
                        ${accountsOptions}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">${tr('المبلغ')} *</label>
                    <input type="number" name="amount" step="0.01" min="0" class="form-input" placeholder="0.00" required>
                </div>
                <div class="form-group">
                    <label class="form-label">${tr('تاريخ الإيداع')} *</label>
                    <input type="date" name="deposit_date" class="form-input" value="${new Date().toISOString().split('T')[0]}" required>
                </div>
                <div class="form-group">
                    <label class="form-label">${tr('نوع الإيداع')} *</label>
                    <select name="deposit_type" class="form-input" required>
                        <option value="إيداع نقدي">إيداع نقدي</option>
                        <option value="إيداع شيك">إيداع شيك</option>
                        <option value="تحويل بنكي">تحويل بنكي</option>
                        <option value="إيداع آلي">إيداع آلي</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">اسم المودع</label>
                    <input type="text" name="depositor_name" class="form-input" placeholder="اسم المودع (اختياري)">
                </div>
                <div class="form-group">
                    <label class="form-label">رقم المرجع</label>
                    <input type="text" name="reference_number" class="form-input" placeholder="رقم العملية / الشيك">
                </div>
                <div class="form-group full-span">
                    <label class="form-label">ملاحظات</label>
                    <textarea name="notes" class="form-input" rows="2" placeholder="أي ملاحظات إضافية..."></textarea>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
                <button type="submit" class="btn btn-primary">💾 حفظ الإيداع</button>
            </div>
        </form>`;
    openModal();
}

// ─── جدولة وديعة شهرية ───────────────────────────────────
function openAddMonthlyDepositModal() {
    const accountsOptions = bankAccounts.map(acc =>
        `<option value="${acc.id}">${acc.account_name} — ${acc.bank_name}</option>`
    ).join('');

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();

    DOM.modalTitle.textContent = `📅 ${tr('جدولة وديعة شهرية')}`;
    DOM.modalBody.innerHTML = `
        <form id="monthly-deposit-form" onsubmit="submitMonthlyDeposit(event)">
            <div class="modal-form-grid">
                <div class="form-group full-span">
                    <label class="form-label">اسم / وصف الوديعة *</label>
                    <input type="text" name="deposit_name" class="form-input"
                        placeholder="مثال: مرتبات يناير، إيراد الفروع..." required>
                </div>
                <div class="form-group">
                    <label class="form-label">${tr('الحساب البنكي')} *</label>
                    <select name="account_id" class="form-input" required>
                        <option value="">اختر الحساب</option>
                        ${accountsOptions}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">المبلغ المتوقع *</label>
                    <input type="number" name="expected_amount" step="0.01" min="0" class="form-input" placeholder="0.00" required>
                </div>
                <div class="form-group">
                    <label class="form-label">تاريخ الإيداع المتوقع *</label>
                    <input type="date" name="expected_date" class="form-input"
                        min="${year}-${month}-01"
                        max="${year}-${month}-${lastDay}"
                        value="${year}-${month}-${lastDay}" required>
                </div>
                <div class="form-group">
                    <label class="form-label">نوع الوديعة</label>
                    <select name="deposit_type" class="form-input">
                        <option value="مرتبات">مرتبات</option>
                        <option value="إيرادات">إيرادات تشغيلية</option>
                        <option value="تحصيل">تحصيل من العملاء</option>
                        <option value="تحويل داخلي">تحويل داخلي</option>
                        <option value="أخرى">أخرى</option>
                    </select>
                </div>
                <div class="form-group full-span">
                    <label class="form-label">ملاحظات</label>
                    <textarea name="notes" class="form-input" rows="2" placeholder="تفاصيل إضافية..."></textarea>
                </div>
            </div>

            <!-- تنبيه ذكي -->
            <div class="smart-alert-box">
                <div class="alert-box-icon">🔔</div>
                <div>
                    <strong>تنبيه تلقائي</strong>
                    <p>سيتم إرسال تنبيه قبل موعد الإيداع بـ 3 أيام، وفي اليوم المحدد، وإذا تأخر الإيداع.</p>
                </div>
            </div>

            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
                <button type="submit" class="btn btn-primary">📅 جدولة الوديعة</button>
            </div>
        </form>`;
    openModal();
}

// ─── إضافة حساب بنكي ─────────────────────────────────────
function openAddAccountModal() {
    DOM.modalTitle.textContent = `🏛️ ${tr('إضافة حساب بنكي')}`;
    DOM.modalBody.innerHTML = `
        <form id="account-form" onsubmit="submitAccount(event)">
            <div class="modal-form-grid">
                <div class="form-group">
                    <label class="form-label">${tr('اسم الحساب')} *</label>
                    <input type="text" name="account_name" class="form-input" required>
                </div>
                <div class="form-group">
                    <label class="form-label">${tr('رقم الحساب')} *</label>
                    <input type="text" name="account_number" class="form-input" required>
                </div>
                <div class="form-group">
                    <label class="form-label">${tr('اسم البنك')} *</label>
                    <input type="text" name="bank_name" class="form-input" required>
                </div>
                <div class="form-group">
                    <label class="form-label">نوع الحساب</label>
                    <select name="account_type" class="form-input">
                        <option value="جاري">${tr('جاري')}</option>
                        <option value="توفير">${tr('توفير')}</option>
                        <option value="استثماري">استثماري</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">${tr('الرصيد الافتتاحي')}</label>
                    <input type="number" name="initial_balance" step="0.01" value="0" class="form-input">
                </div>
                <div class="form-group">
                    <label class="form-label">IBAN</label>
                    <input type="text" name="iban" class="form-input" placeholder="SA00 0000 0000 0000">
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
                <button type="submit" class="btn btn-primary">💾 حفظ الحساب</button>
            </div>
        </form>`;
    openModal();
}

// ════════════════════════════════════════════════════════
//  دوال Submit
// ════════════════════════════════════════════════════════

async function submitDeposit(e) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    try {
        const res = await fetch('api/?action=add_deposit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await res.json();
        if (result.success) {
            showToast('تم إضافة الإيداع بنجاح ✓', 'success');
            closeModal();
            await loadMonthlyDeposits();
            await loadBankAccounts();
            switchBankTab(activeBankTab);
        } else {
            showToast(result.message || 'حدث خطأ أثناء الحفظ', 'error');
        }
    } catch (e) {
        showToast('تعذّر الاتصال بالخادم', 'error');
    }
}

async function submitMonthlyDeposit(e) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    try {
        const res = await fetch('api/?action=add_monthly_deposit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await res.json();
        if (result.success) {
            showToast('تمت جدولة الوديعة بنجاح ✓', 'success');
            closeModal();
            await loadMonthlyDeposits();
            switchBankTab('monthly');
        } else {
            showToast(result.message || 'حدث خطأ', 'error');
        }
    } catch (e) {
        showToast('تعذّر الاتصال بالخادم', 'error');
    }
}

async function submitAccount(e) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    try {
        const res = await fetch('api/?action=add_bank_account', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await res.json();
        if (result.success) {
            showToast('تم إضافة الحساب بنجاح ✓', 'success');
            closeModal();
            await loadBankAccounts();
            switchBankTab('accounts');
        } else {
            showToast(result.message || 'حدث خطأ', 'error');
        }
    } catch (e) {
        showToast('تعذّر الاتصال بالخادم', 'error');
    }
}

// ═══ تأكيد الإيداع ───────────────────────────────────────
async function handleConfirmDeposit(id) {
    if (!confirm('تأكيد استلام هذا الإيداع؟')) return;
    try {
        const res = await fetch('api/?action=confirm_deposit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        const result = await res.json();
        if (result.success) {
            showToast('تم تأكيد الإيداع ✓', 'success');
            await loadMonthlyDeposits();
            await loadBankAccounts();
            switchBankTab(activeBankTab);
        } else {
            showToast(result.message || 'حدث خطأ', 'error');
        }
    } catch (e) {
        showToast('تعذّر الاتصال بالخادم', 'error');
    }
}

// ─── تأكيد إتمام وديعة مجدولة ────────────────────────────
async function markMonthlyDepositDone(id) {
    if (!confirm('تأكيد أنه تم إيداع هذا المبلغ في الحساب؟')) return;
    try {
        const res = await fetch('api/?action=confirm_monthly_deposit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        const result = await res.json();
        if (result.success) {
            showToast('تم تأكيد الوديعة ✓', 'success');
            await loadMonthlyDeposits();
            switchBankTab(activeBankTab);
        } else {
            showToast(result.message || 'حدث خطأ', 'error');
        }
    } catch (e) {
        showToast('تعذّر الاتصال بالخادم', 'error');
    }
}

// ─── حذف وديعة مجدولة ────────────────────────────────────
async function deleteMonthlyDeposit(id) {
    if (!confirm('حذف هذه الوديعة المجدولة؟')) return;
    try {
        const res = await fetch('api/?action=delete_monthly_deposit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        const result = await res.json();
        if (result.success) {
            showToast('تم الحذف', 'info');
            await loadMonthlyDeposits();
            switchBankTab(activeBankTab);
        } else {
            showToast(result.message || 'حدث خطأ', 'error');
        }
    } catch (e) {
        showToast('تعذّر الاتصال بالخادم', 'error');
    }
}

// ─── تفاصيل الإيداع ──────────────────────────────────────
function viewDepositDetails(id) {
    const dep = bankDeposits.find(d => d.id == id);
    if (!dep) return;

    DOM.modalTitle.textContent = `تفاصيل الإيداع — ${dep.deposit_number}`;
    DOM.modalBody.innerHTML = `
        <div class="deposit-details-view">
            <div class="ddv-row"><span>رقم الإيداع</span><strong>${dep.deposit_number}</strong></div>
            <div class="ddv-row"><span>${tr('الحساب')}</span><strong>${dep.account_name}</strong></div>
            <div class="ddv-row"><span>${tr('البنك')}</span><strong>${dep.bank_name || '—'}</strong></div>
            <div class="ddv-row"><span>التاريخ</span><strong>${formatDate(dep.deposit_date)}</strong></div>
            <div class="ddv-row"><span>النوع</span><strong>${dep.deposit_type}</strong></div>
            <div class="ddv-row"><span>المبلغ</span><strong class="dep-amount-lg">+${formatMoneyWithSAR(dep.amount)}</strong></div>
            <div class="ddv-row"><span>الحالة</span>${getDepositStatusBadge(dep.status)}</div>
            ${dep.depositor_name ? `<div class="ddv-row"><span>المودع</span><strong>${dep.depositor_name}</strong></div>` : ''}
            ${dep.reference_number ? `<div class="ddv-row"><span>${tr('المرجع')}</span><strong>${dep.reference_number}</strong></div>` : ''}
            ${dep.notes ? `<div class="ddv-row full"><span>ملاحظات</span><p>${dep.notes}</p></div>` : ''}
        </div>
        <div class="modal-footer">
            <button class="btn btn-secondary" onclick="closeModal()">إغلاق</button>
            ${dep.status === 'معلق' ? `<button class="btn btn-primary" onclick="handleConfirmDeposit(${dep.id}); closeModal()">✓ تأكيد الإيداع</button>` : ''}
        </div>`;
    openModal();
}

// ════════════════════════════════════════════════════════
//  نظام التنبيهات التلقائية
// ════════════════════════════════════════════════════════
function startDepositAlertChecker() {
    checkDepositAlerts();
    // إعادة الفحص كل 10 دقائق
    setInterval(checkDepositAlerts, 600000);
}

function checkDepositAlerts() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const alerts = [];

    monthlyDeposits.forEach(dep => {
        if (dep.status === 'تم الإيداع') return;

        const depDate = new Date(dep.expected_date);
        depDate.setHours(0, 0, 0, 0);
        const diffDays = Math.round((depDate - today) / 86400000);

        if (diffDays < 0) {
            alerts.push({ type: 'overdue', msg: `⚠️ وديعة متأخرة: ${dep.deposit_name} (${Math.abs(diffDays)} يوم تأخير)`, dep });
        } else if (diffDays === 0) {
            alerts.push({ type: 'today', msg: `🔔 وديعة اليوم: ${dep.deposit_name} — ${formatMoneyWithSAR(dep.expected_amount)}`, dep });
        } else if (diffDays <= 3) {
            alerts.push({ type: 'soon', msg: `📅 وديعة قريبة: ${dep.deposit_name} خلال ${diffDays} أيام`, dep });
        }
    });

    depositAlerts = alerts;
    renderAlertsBar(alerts);
}

function renderAlertsBar(alerts) {
    const bar = document.getElementById('deposit-alerts-bar');
    if (!bar) return;

    if (!alerts.length) {
        bar.style.display = 'none';
        return;
    }

    bar.style.display = 'flex';
    bar.innerHTML = alerts.map(a =>
        `<div class="alert-item alert-${a.type}">${a.msg}</div>`
    ).join('');
}

// ════════════════════════════════════════════════════════
//  دوال مساعدة
// ════════════════════════════════════════════════════════
function getDepositStatusBadge(status) {
    const map = {
        'معلق': '<span class="status-badge status-pending">⏳ معلق</span>',
        'تم التأكيد': '<span class="status-badge status-confirmed">✅ تم التأكيد</span>',
        'ملغي': '<span class="status-badge status-cancelled">✖ ملغي</span>',
    };
    return map[status] || `<span class="status-badge">${status}</span>`;
}

// ========== Modal Functions ==========

function showModal(content) {
    // إنشاء Modal إذا لم يكن موجود
    let modal = document.getElementById('bank-modal');
    let overlay = document.getElementById('bank-modal-overlay');

    if (!modal) {
        // إنشاء Overlay
        overlay = document.createElement('div');
        overlay.id = 'bank-modal-overlay';
        overlay.className = 'modal-overlay';
        overlay.onclick = closeModal;
        document.body.appendChild(overlay);

        // إنشاء Modal
        modal = document.createElement('div');
        modal.id = 'bank-modal';
        modal.className = 'modal';
        document.body.appendChild(modal);
    }

    // محتوى Modal
    modal.innerHTML = `
        <div class="modal-content">
            <button class="modal-close" onclick="closeModal()">&times;</button>
            <div class="modal-body">
                ${content}
            </div>
        </div>
    `;

    // إظهار Modal
    setTimeout(() => {
        overlay.classList.add('active');
        modal.classList.add('active');
    }, 10);
}


// دوال فارغة للتوافق
function viewDeposit(id) { console.log('View deposit:', id); }
function viewWithdrawal(id) { console.log('View withdrawal:', id); }
function viewAccount(id) { console.log('View account:', id); }
function editAccount(id) {
    const acc = bankAccounts.find(a => a.id == id);
    if (!acc) return;

    DOM.modalTitle.textContent = `⚙️ تعديل الحساب — ${acc.account_name}`;
    DOM.modalBody.innerHTML = `
        <form id="edit-account-form" onsubmit="submitEditAccount(event, ${id})">
            <div class="modal-form-grid">
                <div class="form-group">
                    <label class="form-label">${tr('اسم الحساب')} *</label>
                    <input type="text" name="account_name" class="form-input" value="${acc.account_name}" required>
                </div>
                <div class="form-group">
                    <label class="form-label">${tr('رقم الحساب')} *</label>
                    <input type="text" name="account_number" class="form-input" value="${acc.account_number}" required>
                </div>
                <div class="form-group">
                    <label class="form-label">${tr('اسم البنك')} *</label>
                    <input type="text" name="bank_name" class="form-input" value="${acc.bank_name}" required>
                </div>
                <div class="form-group">
                    <label class="form-label">نوع الحساب</label>
                    <select name="account_type" class="form-input">
                        <option value="جاري" ${acc.account_type === 'جاري' ? 'selected' : ''}>${tr('جاري')}</option>
                        <option value="توفير" ${acc.account_type === 'توفير' ? 'selected' : ''}>${tr('توفير')}</option>
                        <option value="استثماري" ${acc.account_type === 'استثماري' ? 'selected' : ''}>استثماري</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">IBAN</label>
                    <input type="text" name="iban" class="form-input" value="${acc.iban || ''}" placeholder="SA00 0000 0000 0000">
                </div>
                <div class="form-group">
                    <label class="form-label">الحالة</label>
                    <select name="is_active" class="form-input">
                        <option value="1" ${acc.is_active ? 'selected' : ''}>نشط</option>
                        <option value="0" ${!acc.is_active ? 'selected' : ''}>غير نشط</option>
                    </select>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
                <button type="submit" class="btn btn-primary">💾 حفظ التغييرات</button>
            </div>
        </form>`;
    openModal();
}

async function submitEditAccount(e, id) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    try {
        const res = await fetch('api/?action=update_bank_account', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...data, id })
        });
        const result = await res.json();
        if (result.success) {
            showToast('تم تحديث الحساب ✓', 'success');
            closeModal();
            await loadBankAccounts();
            renderAccountsTab();
        } else {
            showToast(result.message || 'فشل التحديث', 'error');
        }
    } catch { showToast('خطأ في الاتصال', 'error'); }
}
function viewBalanceDetails(id) { console.log('View balance:', id); }
function openDepositModal(accountId) { openAddDepositModal(); }
function openWithdrawalModal(accountId) { openAddWithdrawalModal(); }


// ===== أدوات مساعدة =====
function formatDateAr(dateStr) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('ar-SA', {
        year: 'numeric', month: 'long', day: 'numeric'
    });
}





// ═══════════════════════════════════════════════════════════════


// ════════════════════════════════════════════════════════════
//  الودائع الاستثمارية — Investment Deposits
// ════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
//  نظام الودائع الاستثمارية — Investment Deposits Module
//  يُضاف هذا الملف لـ app.js أو يُضاف في نهاية الملف
// ═══════════════════════════════════════════════════════════════

// ─── متغيرات عامة ──────────────────────────────────────────
// investments مُعرَّف في أعلى الملف



// ════════════════════════════════════════════════════════════
//  تحميل البيانات
// ════════════════════════════════════════════════════════════

async function loadInvestments() {
    try {
        const res = await fetch('api/?action=investments');
        const data = await res.json();
        if (data.success) {
            investments = data.data;
            // تحديث badge التنبيه
            const overdue = investments.filter(i =>
                i.maturity_status === 'مستحق' || i.maturity_status === 'قريب_الاستحقاق'
            ).length;
            const badge = document.getElementById('investments-badge');
            if (badge) {
                badge.textContent = overdue;
                badge.style.display = overdue > 0 ? 'inline-flex' : 'none';
            }
        }
    } catch (e) {
        console.error('Investment load error:', e);
    }
}



// ════════════════════════════════════════════════════════════
//  تبويب الودائع الاستثمارية — نمط المعاملات (expand inline)
// ════════════════════════════════════════════════════════════

let expandedInvestment = null;


function renderInvestmentsTab() {
    const panel = document.getElementById('bank-tab-investments');
    if (!panel) return;

    const active = investments.filter(i => i.status === 'نشط');
    const done = investments.filter(i => i.status === 'منتهي');
    const cancelled = investments.filter(i => i.status === 'ملغي');

    const activeSort = [...active].sort((a, b) => {
        const ord = { 'مستحق': 0, 'قريب_الاستحقاق': 1, 'نشط': 2 };
        const ao = ord[a.maturity_status] ?? 2, bo = ord[b.maturity_status] ?? 2;
        if (ao !== bo) return ao - bo;
        return new Date(a.maturity_date) - new Date(b.maturity_date);
    });

    const totalInv = active.reduce((s, i) => s + parseFloat(i.amount || 0), 0);
    const totalPro = active.reduce((s, i) => s + parseFloat(i.accrued_profit || 0), 0);
    const overdue = active.filter(i => i.maturity_status === 'مستحق').length;
    const expiring = active.filter(i => i.maturity_status === 'قريب_الاستحقاق').length;
    const totalDoneProfit = done.reduce((s, i) => s + parseFloat(i.actual_profit || 0), 0);

    panel.innerHTML = `
        <style id="inv-redesign-css">
        /* ══ صفحة الودائع الاستثمارية — تصميم محترف ══ */
        .inv-page{display:flex;flex-direction:column;gap:1.5rem;padding:.25rem 0}

        /* بطاقات الإحصاء */
        .inv-kpi-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:.75rem}
        .inv-kpi{background:var(--bg-card);border:.5px solid var(--border-color);border-radius:12px;padding:.9rem 1rem;display:flex;flex-direction:column;gap:.4rem;position:relative;overflow:hidden}
        .inv-kpi::before{content:'';position:absolute;inset:0;opacity:.04;pointer-events:none}
        .inv-kpi-blue::before{background:var(--accent-blue)}
        .inv-kpi-green::before{background:var(--accent-green)}
        .inv-kpi-red::before{background:#E24B4A}
        .inv-kpi-orange::before{background:#F59E0B}
        .inv-kpi-teal::before{background:#0F9B8E}
        .inv-kpi-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:.1rem}
        .inv-kpi-icon{width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:15px}
        .inv-kpi-icon-blue{background:rgba(24,95,165,.1);color:#185FA5}
        .inv-kpi-icon-green{background:rgba(15,110,86,.1);color:#0F6E56}
        .inv-kpi-icon-red{background:rgba(226,75,74,.1);color:#A32D2D}
        .inv-kpi-icon-orange{background:rgba(245,158,11,.1);color:#854F0B}
        .inv-kpi-icon-teal{background:rgba(15,155,142,.1);color:#0F9B8E}
        .inv-kpi-tag{font-size:10px;font-weight:500;border-radius:4px;padding:2px 7px}
        .inv-kpi-tag-blue{background:#E6F1FB;color:#185FA5}
        .inv-kpi-tag-green{background:#E1F5EE;color:#0F6E56}
        .inv-kpi-tag-red{background:#FCEBEB;color:#A32D2D}
        .inv-kpi-tag-orange{background:#FAEEDA;color:#854F0B}
        .inv-kpi-tag-teal{background:#E1F5EE;color:#0F6E56}
        .inv-kpi-value{font-size:17px;font-weight:600;color:var(--text-primary);direction:ltr;line-height:1.2}
        .inv-kpi-label{font-size:11px;color:var(--text-muted);font-weight:500}

        /* شريط الأدوات */
        .inv-bar{display:flex;align-items:center;justify-content:space-between;gap:1rem}
        .inv-search-wrap{position:relative;display:flex;align-items:center}
        .inv-search-wrap svg{position:absolute;right:10px;color:var(--text-muted);pointer-events:none}
        .inv-search-input{height:34px;border:.5px solid var(--border-color);border-radius:8px;background:var(--bg-card);padding:0 34px 0 10px;font-size:13px;color:var(--text-primary);width:260px;font-family:inherit;direction:rtl}
        .inv-search-input:focus{outline:none;border-color:var(--accent-blue);box-shadow:0 0 0 3px rgba(59,130,246,.08)}
        .inv-add-btn{height:34px;padding:0 1rem;background:#185FA5;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;display:inline-flex;align-items:center;gap:5px;font-family:inherit}
        .inv-add-btn:hover{background:#0C447C}

        /* الجدول */
        .inv-table-wrap{border:.5px solid var(--border-color);border-radius:12px;overflow:hidden}
        .inv-table{width:100%;border-collapse:collapse;font-size:13px}
        .inv-table thead tr{background:var(--bg-surface)}
        .inv-table th{padding:.6rem 1rem;text-align:right;font-size:11px;font-weight:600;color:var(--text-muted);border-bottom:.5px solid var(--border-color);white-space:nowrap;letter-spacing:.02em}
        .inv-table td{padding:.7rem 1rem;border-bottom:.5px solid var(--border-color);vertical-align:middle}
        .inv-table tr:last-child td{border-bottom:none}
        .inv-table tr:hover td{background:var(--bg-surface);cursor:pointer}
        .inv-table tr.row-selected td{background:rgba(24,95,165,.05);border-bottom:.5px solid rgba(24,95,165,.15)}

        /* فاصل المجموعات */
        .inv-grp-sep td{padding:.35rem 1rem;background:var(--bg-surface);border-bottom:.5px solid var(--border-color)}
        .inv-grp-label{font-size:10.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;display:inline-flex;align-items:center;gap:.4rem}
        .inv-grp-active{color:#0F6E56}
        .inv-grp-done{color:#185FA5}
        .inv-grp-cancelled{color:var(--text-muted)}

        /* حالات الصفوف */
        .inv-row-overdue td:first-child{border-right:3px solid #E24B4A}
        .inv-row-expiring td:first-child{border-right:3px solid #F59E0B}
        .inv-row-active td:first-child{border-right:3px solid #1D9E75}
        .inv-row-done td:first-child{border-right:3px solid #185FA5}
        .inv-row-cancelled{opacity:.6}

        /* badge الحالة */
        .inv-badge{display:inline-flex;align-items:center;gap:3px;font-size:10.5px;font-weight:600;border-radius:5px;padding:2px 8px;white-space:nowrap}
        .inv-badge-overdue{background:#FCEBEB;color:#A32D2D}
        .inv-badge-expiring{background:#FAEEDA;color:#854F0B}
        .inv-badge-active{background:#E1F5EE;color:#0F6E56}
        .inv-badge-done{background:#E6F1FB;color:#185FA5}
        .inv-badge-cancelled{background:var(--bg-surface);color:var(--text-muted);border:.5px solid var(--border-color)}

        /* حالة فارغة */
        .inv-empty{padding:3.5rem 1rem;text-align:center;color:var(--text-muted)}
        .inv-empty-icon{font-size:2.5rem;opacity:.25;margin-bottom:.75rem}
        .inv-empty-text{font-size:13.5px;margin-bottom:1.25rem}
        </style>

        <div class="inv-page">

            <div class="inv-kpi-grid">
                <div class="inv-kpi inv-kpi-blue">
                    <div class="inv-kpi-top">
                        <div class="inv-kpi-icon inv-kpi-icon-blue">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-4 0v2"/></svg>
                        </div>
                        <span class="inv-kpi-tag inv-kpi-tag-blue">${active.length} ${tr('وديعة')}</span>
                    </div>
                    <div class="inv-kpi-value">${formatMoneyWithSAR(totalInv)}</div>
                    <div class="inv-kpi-label">${tr('إجمالي مُستثمر')}</div>
                </div>
                <div class="inv-kpi inv-kpi-green">
                    <div class="inv-kpi-top">
                        <div class="inv-kpi-icon inv-kpi-icon-green">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                        </div>
                        <span class="inv-kpi-tag inv-kpi-tag-green">${tr('حتى اليوم')}</span>
                    </div>
                    <div class="inv-kpi-value">${formatMoneyWithSAR(totalPro)}</div>
                    <div class="inv-kpi-label">${tr('ربح متراكم')}</div>
                </div>
                <div class="inv-kpi ${overdue > 0 ? 'inv-kpi-red' : ''}">
                    <div class="inv-kpi-top">
                        <div class="inv-kpi-icon ${overdue > 0 ? 'inv-kpi-icon-red' : ''}">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        </div>
                        <span class="inv-kpi-tag ${overdue > 0 ? 'inv-kpi-tag-red' : ''}">${overdue > 0 ? tr('تنتظر إغلاق') : tr('لا شيء')}</span>
                    </div>
                    <div class="inv-kpi-value">${overdue}</div>
                    <div class="inv-kpi-label">${tr('مستحقة الإغلاق')}</div>
                </div>
                <div class="inv-kpi ${expiring > 0 ? 'inv-kpi-orange' : ''}">
                    <div class="inv-kpi-top">
                        <div class="inv-kpi-icon ${expiring > 0 ? 'inv-kpi-icon-orange' : ''}">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                        </div>
                        <span class="inv-kpi-tag ${expiring > 0 ? 'inv-kpi-tag-orange' : ''}">${expiring > 0 ? tr('خلال 3 أيام') : tr('لا شيء')}</span>
                    </div>
                    <div class="inv-kpi-value">${expiring}</div>
                    <div class="inv-kpi-label">${tr('قريبة الاستحقاق')}</div>
                </div>
                <div class="inv-kpi inv-kpi-teal">
                    <div class="inv-kpi-top">
                        <div class="inv-kpi-icon inv-kpi-icon-teal">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                        </div>
                        <span class="inv-kpi-tag inv-kpi-tag-teal">${done.length} ${tr('وديعة')}</span>
                    </div>
                    <div class="inv-kpi-value">${formatMoneyWithSAR(totalDoneProfit)}</div>
                    <div class="inv-kpi-label">${tr('أرباح محققة')}</div>
                </div>
            </div>

            <div class="inv-bar">
                <div class="inv-search-wrap">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                    <input type="text" id="inv-search" class="inv-search-input" placeholder="${tr('بحث في الودائع')}..." oninput="filterInvestmentTables()">
                </div>
                <button class="inv-add-btn" onclick="openAddInvestmentModal()">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
                    ربط وديعة جديدة
                </button>
            </div>

            <div class="inv-table-wrap">
                <table class="inv-table" role="table" aria-label="الودائع الاستثمارية">
                    <thead><tr>
                        <th>الاسم</th>
                        <th>الحساب</th>
                        <th>المبلغ</th>
                        <th>الفائدة</th>
                        <th>الاستحقاق</th>
                        <th>الربح</th>
                        <th>الحالة</th>
                    </tr></thead>
                    <tbody id="inv-tbody">${renderInvestmentRows([...activeSort, ...done, ...cancelled])}</tbody>
                </table>
            </div>

        </div>
    `;
}

function filterInvestmentTables() {
    const q = (document.getElementById('inv-search')?.value || '').toLowerCase();

    const activeSort = [...investments.filter(i => i.status === 'نشط')].sort((a, b) => {
        const ord = { 'مستحق': 0, 'قريب_الاستحقاق': 1, 'نشط': 2 };
        const ao = ord[a.maturity_status] ?? 2, bo = ord[b.maturity_status] ?? 2;
        if (ao !== bo) return ao - bo;
        return new Date(a.maturity_date) - new Date(b.maturity_date);
    });
    const done = investments.filter(i => i.status === 'منتهي');
    const cancelled = investments.filter(i => i.status === 'ملغي');
    const all = [...activeSort, ...done, ...cancelled];

    const filtered = !q ? all : all.filter(i =>
        (i.reference_number || '').toLowerCase().includes(q) ||
        (i.deposit_name || '').toLowerCase().includes(q) ||
        (i.bank_name || '').toLowerCase().includes(q) ||
        (i.account_name || '').toLowerCase().includes(q)
    );

    const el = document.getElementById('inv-tbody');
    if (el) el.innerHTML = renderInvestmentRows(filtered);
}

function renderInvestmentRows(list) {
    if (!list || !list.length) {
        return `<tr><td colspan="7">
            <div class="inv-empty">
                <div class="inv-empty-icon">📋</div>
                <div class="inv-empty-text">لا توجد ودائع مسجلة</div>
                <button class="inv-add-btn" onclick="openAddInvestmentModal()">ربط وديعة جديدة</button>
            </div>
        </td></tr>`;
    }

    let html = '';
    let lastStatus = null;

    list.forEach(inv => {
        const status = inv.status;
        const ms = inv.maturity_status;

        // ── فاصل المجموعة ──
        if (status !== lastStatus) {
            const sepConfig = {
                'نشط': { cls: 'inv-grp-active', dot: '●', label: tr('● النشطة') },
                'منتهي': { cls: 'inv-grp-done', dot: '✔', label: tr('✔ المنتهية') },
                'ملغي': { cls: 'inv-grp-cancelled', dot: '✖', label: tr('✖ الملغاة') },
            };
            const sc = sepConfig[status] || { cls: 'inv-grp-cancelled', label: status };
            html += `<tr class="inv-grp-sep">
                <td colspan="7">
                    <span class="inv-grp-label ${sc.cls}">${sc.label}</span>
                </td>
            </tr>`;
            lastStatus = status;
        }

        // ── class الصف ──
        let rowCls = '';
        if (status === 'منتهي') rowCls = 'inv-row-done';
        else if (status === 'ملغي') rowCls = 'inv-row-cancelled';
        else if (ms === 'مستحق') rowCls = 'inv-row-overdue';
        else if (ms === 'قريب_الاستحقاق') rowCls = 'inv-row-expiring';
        else rowCls = 'inv-row-active';

        if (expandedInvestment == inv.id) rowCls += ' row-selected';

        // ── badge الحالة ──
        const badge =
            ms === 'مستحق'
                ? `<span class="inv-badge inv-badge-overdue">⏰ مستحقة</span>` :
                ms === 'قريب_الاستحقاق'
                    ? `<span class="inv-badge inv-badge-expiring">🔔 قريبة</span>` :
                    status === 'نشط'
                        ? `<span class="inv-badge inv-badge-active">● نشطة</span>` :
                        status === 'منتهي'
                            ? `<span class="inv-badge inv-badge-done">✔ منتهية</span>` :
                            `<span class="inv-badge inv-badge-cancelled">✖ ملغاة</span>`;

        // ── المتبقي ──
        const sub =
            status === 'نشط' && ms === 'مستحق'
                ? `<div style="color:#A32D2D;font-size:11px;margin-top:2px">متأخر ${Math.abs(inv.days_remaining)} يوم</div>`
                : status === 'نشط'
                    ? `<div style="color:var(--text-muted);font-size:11px;margin-top:2px">بعد ${inv.days_remaining} يوم</div>`
                    : '';

        // ── الربح ──
        const profitVal = status === 'منتهي' && inv.actual_profit != null
            ? formatMoneyWithSAR(inv.actual_profit)
            : formatMoneyWithSAR(inv.expected_profit);

        html += `<tr class="${rowCls}" data-inv-id="${inv.id}" onclick="toggleInvestment(${inv.id})">
            <td>
                <div style="font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px">${inv.deposit_name || inv.reference_number}</div>
                <div style="font-size:11px;color:var(--text-muted);margin-top:2px;font-family:monospace">${inv.reference_number}</div>
            </td>
            <td>
                <div style="font-size:12.5px;font-weight:500">${inv.bank_name || '—'}</div>
                <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${inv.account_name || ''}</div>
            </td>
            <td style="font-weight:600;color:#185FA5;font-variant-numeric:tabular-nums;direction:ltr;text-align:left;white-space:nowrap">${formatMoneyWithSAR(inv.amount)}</td>
            <td style="font-weight:600;color:#0F6E56;text-align:center">${parseFloat(inv.interest_rate)}%</td>
            <td>
                <div style="font-size:12.5px">${fmtDate(inv.maturity_date)}</div>
                ${sub}
            </td>
            <td style="color:#0F6E56;font-weight:600;font-variant-numeric:tabular-nums;direction:ltr;text-align:left;white-space:nowrap">+${profitVal}</td>
            <td style="text-align:center">${badge}</td>
        </tr>`;
    });

    return html;
}


function toggleInvestment(id) {
    // إزالة تمييز الصف السابق
    document.querySelectorAll('#inv-tbody tr.row-selected').forEach(r => r.classList.remove('row-selected'));

    const inv = investments.find(i => i.id == id);
    if (!inv) return;

    // تمييز الصف المختار
    const row = document.querySelector(`#inv-tbody tr[data-inv-id="${id}"]`);
    if (row) row.classList.add('row-selected');

    // افتح الـ modal
    openInvDetailModal(inv);
}

function openInvDetailModal(inv) {
    // أزل modal قديم إن وُجد
    document.getElementById('inv-detail-modal')?.remove();

    const ms = inv.maturity_status;
    const isActive = inv.status === 'نشط';
    const expected = parseFloat(inv.expected_profit || 0);
    const accrued = parseFloat(inv.accrued_profit || 0);
    const actual = inv.actual_profit != null ? parseFloat(inv.actual_profit) : null;
    const progress = Math.min(100, Math.max(0, parseFloat(inv.completion_pct || 0)));
    const pColor = ms === 'مستحق' ? '#ff6b6b' : ms === 'قريب_الاستحقاق' ? '#ffa94d' : '#40c057';

    const statusPill =
        ms === 'مستحق' ? `<span class="idm-status-pill idm-pill-overdue">⏰ ${tr('مستحقة الإغلاق')}</span>` :
            ms === 'قريب_الاستحقاق' ? `<span class="idm-status-pill idm-pill-expiring">🔔 ${tr('قريبة الاستحقاق')}</span>` :
                inv.status === 'نشط' ? `<span class="idm-status-pill idm-pill-active">● ${tr('نشطة')}</span>` :
                    inv.status === 'منتهي' ? `<span class="idm-status-pill idm-pill-done">✔ ${tr('منتهية')}</span>` :
                        `<span class="idm-status-pill idm-pill-muted">✖ ${tr('ملغاة')}</span>`;

    const overlay = document.createElement('div');
    overlay.id = 'inv-detail-modal';
    overlay.className = 'idm-overlay';
    overlay.onclick = e => { if (e.target === overlay) closeInvDetailModal(); };

    overlay.innerHTML = `
        <style id="idm-css">
        .idm-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:9999;opacity:0;transition:opacity .2s}
        .idm-overlay.idm-visible{opacity:1}
        .idm-overlay.idm-closing{opacity:0}
        .idm-box{background:var(--bg-card);border-radius:16px;width:540px;max-width:96vw;max-height:90vh;overflow-y:auto;display:flex;flex-direction:column;border:.5px solid var(--border-color);box-shadow:0 8px 40px rgba(0,0,0,.18);transform:translateY(8px);transition:transform .2s}
        .idm-overlay.idm-visible .idm-box{transform:translateY(0)}

        /* header */
        .idm-hd{padding:1.1rem 1.25rem .9rem;border-bottom:.5px solid var(--border-color);display:flex;justify-content:space-between;align-items:flex-start;gap:1rem}
        .idm-hd-left{display:flex;flex-direction:column;gap:.35rem;flex:1;min-width:0}
        .idm-status-pill{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;border-radius:5px;padding:3px 9px;width:fit-content}
        .idm-pill-overdue{background:#FCEBEB;color:#A32D2D}
        .idm-pill-expiring{background:#FAEEDA;color:#854F0B}
        .idm-pill-active{background:#E1F5EE;color:#0F6E56}
        .idm-pill-done{background:#E6F1FB;color:#185FA5}
        .idm-pill-muted{background:var(--bg-surface);color:var(--text-muted);border:.5px solid var(--border-color)}
        .idm-dep-name{font-size:16px;font-weight:600;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .idm-dep-ref{font-size:11.5px;color:var(--text-muted);font-family:monospace}
        .idm-hd-amount{font-size:22px;font-weight:700;color:#185FA5;direction:ltr;white-space:nowrap;margin-top:.15rem}
        .idm-close-btn{width:30px;height:30px;border-radius:8px;border:.5px solid var(--border-color);background:transparent;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--text-muted);flex-shrink:0;margin-top:2px}
        .idm-close-btn:hover{background:var(--bg-surface)}

        /* progress */
        .idm-prog-wrap{padding:.85rem 1.25rem;border-bottom:.5px solid var(--border-color);background:var(--bg-surface)}
        .idm-prog-meta{display:flex;justify-content:space-between;font-size:11.5px;color:var(--text-muted);margin-bottom:.5rem}
        .idm-prog-pct{font-weight:600}
        .idm-prog-track{height:5px;background:var(--border-color);border-radius:99px;overflow:hidden}
        .idm-prog-fill{height:100%;border-radius:99px;transition:width .4s ease}
        .idm-prog-days{text-align:center;font-size:11px;margin-top:.4rem}

        /* body */
        .idm-body{padding:1rem 1.25rem;display:grid;grid-template-columns:1fr 1fr;gap:.75rem 1.25rem}
        .idm-section{display:flex;flex-direction:column;gap:.35rem}
        .idm-section-full{grid-column:1/-1}
        .idm-sec-title{font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted);margin-bottom:.1rem;padding-bottom:.3rem;border-bottom:.5px solid var(--border-color)}
        .idm-row{display:flex;justify-content:space-between;align-items:baseline;gap:.5rem;padding:.22rem 0}
        .idm-row span{font-size:12px;color:var(--text-muted);white-space:nowrap}
        .idm-row strong{font-size:12.5px;font-weight:600;color:var(--text-primary);text-align:left;direction:ltr}

        /* amounts grid */
        .idm-amounts-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:.5rem}
        .idm-amt-card{background:var(--bg-surface);border:.5px solid var(--border-color);border-radius:9px;padding:.6rem .75rem}
        .idm-amt-label{font-size:10.5px;color:var(--text-muted);margin-bottom:3px;font-weight:500}
        .idm-amt-val{font-size:14px;font-weight:700;direction:ltr}
        .idm-amt-total{border:.5px solid var(--border-color);background:var(--bg-card)}

        /* notes */
        .idm-notes{font-size:13px;color:var(--text-primary);line-height:1.6;margin:0}

        /* footer */
        .idm-foot{display:flex;gap:.5rem;padding:.9rem 1.25rem;border-top:.5px solid var(--border-color);background:var(--bg-surface)}
        .idm-foot-end{margin-right:auto}
        .idm-btn{height:34px;padding:0 .9rem;border-radius:8px;font-size:12.5px;font-weight:500;cursor:pointer;border:.5px solid var(--border-color);background:transparent;color:var(--text-primary);font-family:inherit;display:inline-flex;align-items:center;gap:4px}
        .idm-btn:hover{background:var(--bg-surface)}
        .idm-btn-green{background:#1D9E75;color:#fff;border-color:transparent}
        .idm-btn-green:hover{background:#0F6E56}
        .idm-btn-blue{background:#185FA5;color:#fff;border-color:transparent}
        .idm-btn-blue:hover{background:#0C447C}
        .idm-btn-danger{background:transparent;color:#A32D2D;border-color:#F7C1C1}
        .idm-btn-danger:hover{background:#FCEBEB}
        </style>

        <div class="idm-box">
            <div class="idm-hd">
                <div class="idm-hd-left">
                    ${statusPill}
                    <div class="idm-dep-name">${inv.deposit_name || inv.reference_number}</div>
                    <div class="idm-dep-ref">${inv.reference_number}</div>
                    <div class="idm-hd-amount">${formatMoneyWithSAR(inv.amount)} ﷼</div>
                </div>
                <button class="idm-close-btn" onclick="closeInvDetailModal()" aria-label="إغلاق">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>

            ${isActive ? `
            <div class="idm-prog-wrap">
                <div class="idm-prog-meta">
                    <span>${fmtDate(inv.start_date)}</span>
                    <span class="idm-prog-pct" style="color:${pColor}">${progress}% مكتمل</span>
                    <span>${fmtDate(inv.maturity_date)}</span>
                </div>
                <div class="idm-prog-track">
                    <div class="idm-prog-fill" style="width:${progress}%;background:${pColor}"></div>
                </div>
                <div class="idm-prog-days" style="color:${ms === 'مستحق' ? '#A32D2D' : 'var(--text-muted)'}">
                    ${ms === 'مستحق' ? `⚠ متأخرة ${Math.abs(inv.days_remaining)} يوم` : `متبقٍ ${inv.days_remaining} يوم`}
                </div>
            </div>` : ''}

            <div class="idm-body">
                <div class="idm-section">
                    <div class="idm-sec-title">التواريخ</div>
                    <div class="idm-row"><span>البداية</span><strong>${fmtDate(inv.start_date)}</strong></div>
                    <div class="idm-row"><span>الاستحقاق</span><strong>${fmtDate(inv.maturity_date)}</strong></div>
                    <div class="idm-row"><span>المدة</span><strong>${inv.days} يوم</strong></div>
                    ${inv.matured_at ? `<div class="idm-row"><span>تاريخ الإغلاق</span><strong>${fmtDate(inv.matured_at)}</strong></div>` : ''}
                </div>

                <div class="idm-section">
                    <div class="idm-sec-title">الحساب</div>
                    <div class="idm-row"><span>البنك</span><strong>${inv.bank_name || '—'}</strong></div>
                    <div class="idm-row"><span>الحساب</span><strong>${inv.account_name || '—'}</strong></div>
                    <div class="idm-row"><span>الرقم</span><strong style="color:#185FA5;font-family:monospace;font-size:11.5px">${inv.account_number || '—'}</strong></div>
                    ${inv.return_account_name && inv.return_account_name !== inv.account_name
            ? `<div class="idm-row"><span>إعادة لـ</span><strong>${inv.return_account_name}</strong></div>` : ''}
                </div>

                <div class="idm-section idm-section-full">
                    <div class="idm-sec-title">المبالغ والربح</div>
                    <div class="idm-amounts-grid">
                        <div class="idm-amt-card">
                            <div class="idm-amt-label">المبلغ الأصلي</div>
                            <div class="idm-amt-val" style="color:#185FA5">${formatMoneyWithSAR(inv.amount)}</div>
                        </div>
                        <div class="idm-amt-card">
                            <div class="idm-amt-label">معدل الفائدة</div>
                            <div class="idm-amt-val" style="color:#0F6E56">${parseFloat(inv.interest_rate)}%</div>
                        </div>
                        <div class="idm-amt-card">
                            <div class="idm-amt-label">الربح المتوقع</div>
                            <div class="idm-amt-val" style="color:#0F6E56">+${formatMoneyWithSAR(expected)}</div>
                        </div>
                        ${isActive ? `<div class="idm-amt-card">
                            <div class="idm-amt-label">الربح المتراكم</div>
                            <div class="idm-amt-val" style="color:#185FA5">+${formatMoneyWithSAR(accrued)}</div>
                        </div>` : ''}
                        ${actual !== null ? `<div class="idm-amt-card">
                            <div class="idm-amt-label">الربح الفعلي</div>
                            <div class="idm-amt-val" style="color:#0F6E56;font-size:15px">+${formatMoneyWithSAR(actual)}</div>
                        </div>` : ''}
                        <div class="idm-amt-card idm-amt-total">
                            <div class="idm-amt-label">الإجمالي</div>
                            <div class="idm-amt-val" style="color:var(--text-primary)">${formatMoneyWithSAR(parseFloat(inv.amount) + (actual !== null ? actual : expected))}</div>
                        </div>
                    </div>
                </div>

                ${inv.notes ? `<div class="idm-section idm-section-full">
                    <div class="idm-sec-title">ملاحظات</div>
                    <p class="idm-notes">${inv.notes}</p>
                </div>` : ''}
            </div>

            ${isActive ? `<div class="idm-foot">
                ${(ms === 'مستحق' || ms === 'قريب_الاستحقاق') ? `
                <button class="idm-btn idm-btn-green" onclick="closeInvDetailModal();openMatureInvestmentModal(${inv.id})">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                    إغلاق واسترداد
                </button>` : ''}
                <button class="idm-btn idm-btn-blue" onclick="closeInvDetailModal();openEditInvestmentModal(${inv.id})">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    تعديل
                </button>
                <button class="idm-btn idm-btn-danger idm-foot-end" onclick="closeInvDetailModal();openCancelInvestmentModal(${inv.id})">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                    إلغاء مبكر
                </button>
            </div>` : `<div class="idm-foot">
                <button class="idm-btn" onclick="closeInvDetailModal()">إغلاق</button>
            </div>`}
        </div>
    `;

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('idm-visible'));

    // إغلاق بـ Escape
    const onKey = e => { if (e.key === 'Escape') { closeInvDetailModal(); document.removeEventListener('keydown', onKey); } };
    document.addEventListener('keydown', onKey);
}

function closeInvDetailModal() {
    const overlay = document.getElementById('inv-detail-modal');
    if (!overlay) return;
    overlay.classList.remove('idm-visible');
    overlay.classList.add('idm-closing');
    setTimeout(() => overlay.remove(), 220);
    document.querySelectorAll('#inv-tbody tr.row-selected').forEach(r => r.classList.remove('row-selected'));
}


// ════════════════════════════════════════════════════════════
//  مودال: ربط وديعة جديدة
// ════════════════════════════════════════════════════════════

function openAddInvestmentModal() {
    const opts = bankAccounts
        .filter(a => a.is_active == 1)
        .map(a => `<option value="${a.id}">${a.bank_name} — ${a.account_name} (${formatMoneyWithSAR(a.current_balance)})</option>`)
        .join('');

    if (!opts) { showToast('لا توجد حسابات بنكية نشطة', 'error'); return; }

    DOM.modalTitle.textContent = `💰 ${tr('ربط وديعة استثمارية جديدة')}`;
    DOM.modalBody.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
            <div class="form-group" style="grid-column:1/-1">
                <label class="form-label">اسم الوديعة</label>
                <input id="ni-name" class="form-input" type="text" placeholder="مثال: وديعة الرواتب Q1">
            </div>
            <div class="form-group" style="grid-column:1/-1">
                <label class="form-label">الحساب المصدر <span style="color:var(--accent-red)">*</span></label>
                <select id="ni-account" class="form-input">${opts}</select>
            </div>
            <div class="form-group">
                <label class="form-label">المبلغ (<span class="sar-symbol"></span>) <span style="color:var(--accent-red)">*</span></label>
                <input id="ni-amount" class="form-input" type="number" min="1" step="0.01" placeholder="0.00" oninput="calcNewInvProfit()">
            </div>
            <div class="form-group">
                <label class="form-label">معدل الفائدة (%) <span style="color:var(--accent-red)">*</span></label>
                <input id="ni-rate" class="form-input" type="number" min="0" step="0.001" placeholder="0.000" oninput="calcNewInvProfit()">
            </div>
            <div class="form-group">
                <label class="form-label">المدة (أيام) <span style="color:var(--accent-red)">*</span></label>
                <input id="ni-days" class="form-input" type="number" min="1" placeholder="90" oninput="calcNewInvProfit();calcNewInvMaturity()">
            </div>
            <div class="form-group">
                <label class="form-label">تاريخ البداية <span style="color:var(--accent-red)">*</span></label>
                <input id="ni-start" class="form-input" type="date" value="${new Date().toISOString().split('T')[0]}" oninput="calcNewInvMaturity()">
            </div>
            <div class="form-group" style="grid-column:1/-1">
                <label class="form-label">تاريخ الاستحقاق</label>
                <input id="ni-maturity" class="form-input" type="date" readonly style="opacity:.7">
            </div>
            <div class="form-group" style="grid-column:1/-1">
                <label class="form-label">حساب الإعادة (اختياري — الافتراضي نفس الحساب)</label>
                <select id="ni-return" class="form-input">
                    <option value="">— نفس حساب الوديعة —</option>
                    ${opts}
                </select>
            </div>
            <div class="form-group" style="grid-column:1/-1">
                <label class="form-label">الرقم المرجعي (اختياري — يُولَّد تلقائياً)</label>
                <input id="ni-ref" class="form-input" type="text" placeholder="INV-YYYYMMDD-XXXX">
            </div>
            <div class="form-group" style="grid-column:1/-1">
                <label class="form-label">ملاحظات</label>
                <textarea id="ni-notes" class="form-input" rows="2"></textarea>
            </div>
            <div id="ni-profit-preview" style="grid-column:1/-1;background:rgba(74,171,247,.07);border:1px solid rgba(74,171,247,.2);border-radius:10px;padding:.75rem 1rem;font-size:.85rem;color:var(--text-primary)">
                الربح المتوقع: <strong style="color:var(--accent-green)" id="ni-profit-val">—</strong>
            </div>
        </div>
        <div style="display:flex;gap:.75rem;margin-top:1.25rem;justify-content:flex-end">
            <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
            <button class="btn btn-primary" onclick="submitNewInvestment()">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
                ربط الوديعة
            </button>
        </div>`;

    calcNewInvMaturity();
    openModal();
}

function calcNewInvProfit() {
    const amount = parseFloat(document.getElementById('ni-amount')?.value) || 0;
    const rate = parseFloat(document.getElementById('ni-rate')?.value) || 0;
    const days = parseInt(document.getElementById('ni-days')?.value) || 0;
    const profit = Math.round(amount * rate / 100 * days / 360 * 100) / 100;
    const el = document.getElementById('ni-profit-val');
    if (el) el.textContent = profit > 0 ? '+' + formatMoneyWithSAR(profit) : '—';
}

function calcNewInvMaturity() {
    const startEl = document.getElementById('ni-start');
    const daysEl = document.getElementById('ni-days');
    const maturityEl = document.getElementById('ni-maturity');
    if (!startEl || !daysEl || !maturityEl) return;
    const start = new Date(startEl.value);
    const days = parseInt(daysEl.value) || 0;
    if (isNaN(start.getTime()) || days <= 0) return;
    start.setDate(start.getDate() + days);
    maturityEl.value = start.toISOString().split('T')[0];
}

async function submitNewInvestment() {
    const payload = {
        deposit_name: document.getElementById('ni-name')?.value?.trim() || '',
        account_id: parseInt(document.getElementById('ni-account')?.value) || 0,
        amount: parseFloat(document.getElementById('ni-amount')?.value) || 0,
        interest_rate: parseFloat(document.getElementById('ni-rate')?.value) || 0,
        days: parseInt(document.getElementById('ni-days')?.value) || 0,
        start_date: document.getElementById('ni-start')?.value || '',
        maturity_date: document.getElementById('ni-maturity')?.value || '',
        return_account_id: document.getElementById('ni-return')?.value || '',
        reference_number: document.getElementById('ni-ref')?.value?.trim() || '',
        notes: document.getElementById('ni-notes')?.value || '',
    };

    if (!payload.account_id || payload.amount <= 0 || payload.interest_rate <= 0 || payload.days <= 0) {
        showToast('يرجى تعبئة جميع الحقول المطلوبة', 'error');
        return;
    }

    try {
        const res = await fetch('api/?action=create_investment', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            showToast('تم ربط الوديعة بنجاح ✅', 'success');
            closeModal();
            await Promise.all([loadInvestments(), loadBankAccounts()]);
            renderInvestmentsTab();
        } else {
            showToast(data.message || 'فشل ربط الوديعة', 'error');
        }
    } catch (e) {
        showToast('خطأ في الاتصال', 'error');
    }
}

// ════════════════════════════════════════════════════════════
//  مودال: إغلاق الوديعة (استحقاق)
// ════════════════════════════════════════════════════════════

function openMatureInvestmentModal(id) {
    const inv = investments.find(i => i.id == id);
    if (!inv) return;

    const expected = parseFloat(inv.expected_profit || 0);

    DOM.modalTitle.textContent = `🏁 ${tr('إغلاق الوديعة واسترداد المبلغ')}`;
    DOM.modalBody.innerHTML = `
        <div style="background:rgba(105,219,124,.08);border:1px solid rgba(105,219,124,.25);border-radius:10px;padding:1rem;margin-bottom:1rem">
            <div style="font-size:.9rem;color:var(--text-primary);line-height:1.7">
                <strong>${inv.deposit_name || inv.reference_number}</strong><br>
                الأصل: <strong style="color:var(--accent-blue)">${formatMoneyWithSAR(inv.amount)}</strong> |
                الربح المتوقع: <strong style="color:var(--accent-green)">+${formatMoneyWithSAR(expected)}</strong>
            </div>
        </div>
        <div class="form-group">
            <label class="form-label">الربح الفعلي (<span class="sar-symbol"></span>)</label>
            <input id="mature-profit" class="form-input" type="number" min="0" step="0.01"
                value="${expected}" placeholder="${expected}">
            <small style="color:var(--text-muted);font-size:.78rem">اتركه كما هو إذا مطابق للمتوقع</small>
        </div>
        <div style="display:flex;gap:.75rem;margin-top:1.25rem;justify-content:flex-end">
            <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
            <button class="btn" style="background:var(--accent-green);color:#fff" onclick="submitMatureInv(${id})">
                🏁 تأكيد الإغلاق والاسترداد
            </button>
        </div>`;
    openModal();
}

async function submitMatureInv(id) {
    const actualProfit = parseFloat(document.getElementById('mature-profit')?.value);
    try {
        const res = await fetch('api/?action=mature_investment', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, actual_profit: isNaN(actualProfit) ? null : actualProfit })
        });
        const data = await res.json();
        if (data.success) {
            showToast(data.message || 'تم إغلاق الوديعة بنجاح', 'success');
            closeModal();
            expandedInvestment = null;
            document.getElementById('inv-root')?.classList.remove('has-panel');
            await Promise.all([loadInvestments(), loadBankAccounts()]);
            renderInvestmentsTab();
        } else {
            showToast(data.message || 'فشل الإغلاق', 'error');
        }
    } catch (e) {
        showToast('خطأ في الاتصال', 'error');
    }
}

// ════════════════════════════════════════════════════════════
//  مودال: إلغاء الوديعة مبكراً
// ════════════════════════════════════════════════════════════

function openCancelInvestmentModal(id) {
    const inv = investments.find(i => i.id == id);
    if (!inv) return;

    DOM.modalTitle.textContent = `⚠️ ${tr('إلغاء الوديعة مبكراً')}`;
    DOM.modalBody.innerHTML = `
        <div style="display:flex;gap:1rem;align-items:flex-start;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);border-radius:10px;padding:1rem;margin-bottom:1rem">
            <span style="font-size:1.75rem">⚠️</span>
            <div style="color:var(--text-primary);font-size:.95rem;line-height:1.6">
                <strong>تحذير:</strong> الإلغاء المبكر — المبلغ الأصلي
                (<strong style="color:var(--accent-blue)">${formatMoneyWithSAR(inv.amount)}</strong>)
                سيُعاد للحساب. يمكنك إضافة ربح جزئي إن وُجد.
            </div>
        </div>
        <div class="form-group">
            <label class="form-label">الربح الجزئي الفعلي (اختياري)</label>
            <div style="position:relative">
                <input type="number" id="cancel-partial-profit" class="form-input"
                    min="0" step="0.01" placeholder="0.00"
                    style="padding-left:2.5rem"
                    oninput="updateCancelTotal(${inv.amount})">
                <span style="position:absolute;left:.75rem;top:50%;transform:translateY(-50%);color:var(--text-muted);font-size:.85rem;pointer-events:none"><span class="sar-symbol"></span></span>
            </div>
            <div id="cancel-total-preview" style="margin-top:.5rem;font-size:.82rem;color:var(--text-muted)">
                إجمالي المُعاد: <strong style="color:var(--accent-blue)">${formatMoneyWithSAR(inv.amount)}</strong>
            </div>
        </div>
        <div class="form-group">
            <label class="form-label">سبب الإلغاء</label>
            <textarea id="cancel-notes" class="form-input" rows="3" placeholder="يرجى ذكر السبب..."></textarea>
        </div>
        <div style="display:flex;gap:12px;margin-top:20px;justify-content:flex-end">
            <button type="button" class="btn btn-secondary" onclick="closeModal()">تراجع</button>
            <button type="button" class="btn" style="background:var(--accent-red);color:#fff"
                onclick="submitCancelInv(${id})">
                إلغاء الوديعة
            </button>
        </div>`;
    openModal();
}

function updateCancelTotal(principal) {
    const profit = parseFloat(document.getElementById('cancel-partial-profit')?.value) || 0;
    const total = principal + profit;
    const preview = document.getElementById('cancel-total-preview');
    if (!preview) return;
    if (profit > 0) {
        preview.innerHTML =
            'إجمالي المُعاد: أصل <strong style="color:var(--accent-blue)">' + formatMoneyWithSAR(principal) + '</strong>' +
            ' + ربح جزئي <strong style="color:var(--accent-green)">' + formatMoneyWithSAR(profit) + '</strong>' +
            ' = <strong style="color:var(--text-primary)">' + formatMoneyWithSAR(total) + '</strong>';
    } else {
        preview.innerHTML = 'إجمالي المُعاد: <strong style="color:var(--accent-blue)">' + formatMoneyWithSAR(principal) + '</strong>';
    }
}

async function submitCancelInv(id) {
    const notes = document.getElementById('cancel-notes')?.value || '';
    const partialProfit = parseFloat(document.getElementById('cancel-partial-profit')?.value) || 0;
    try {
        const res = await fetch('api/?action=cancel_investment', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, notes, partial_profit: partialProfit })
        });
        const data = await res.json();
        if (data.success) {
            showToast(data.message, 'success');
            closeModal();
            expandedInvestment = null;
            document.getElementById('inv-root')?.classList.remove('has-panel');
            await Promise.all([loadInvestments(), loadBankAccounts()]);
            renderInvestmentsTab();
        } else { showToast(data.message || 'فشل', 'error'); }
    } catch { showToast('خطأ في الاتصال', 'error'); }
}

// ════════════════════════════════════════════════════════════
//  مودال: تعديل الوديعة
// ════════════════════════════════════════════════════════════

async function openEditInvestmentModal(id) {
    const inv = investments.find(i => i.id == id);
    if (!inv) return;

    let accounts = [];
    try {
        const res = await fetch('api/?action=bank_accounts');
        const d = await res.json();
        if (d.success) accounts = d.data;
    } catch (e) { }

    const accOptions = accounts.map(a =>
        `<option value="${a.id}" ${a.id == inv.account_id ? 'selected' : ''}>${a.bank_name} — ${a.account_name}</option>`
    ).join('');

    const retOptions = '<option value="">— نفس حساب الوديعة —</option>' +
        accounts.map(a =>
            `<option value="${a.id}" ${a.id == inv.return_account_id ? 'selected' : ''}>${a.bank_name} — ${a.account_name}</option>`
        ).join('');

    DOM.modalTitle.textContent = '✏️ تعديل الوديعة';
    DOM.modalBody.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
            <div class="form-group" style="grid-column:1/-1">
                <label class="form-label">اسم الوديعة</label>
                <input id="ei-name" class="form-input" type="text" value="${inv.deposit_name || ''}" placeholder="اسم أو وصف الوديعة">
            </div>
            <div class="form-group">
                <label class="form-label">الرقم المرجعي</label>
                <input id="ei-ref" class="form-input" type="text" value="${inv.reference_number || ''}">
            </div>
            <div class="form-group">
                <label class="form-label">المبلغ (<span class="sar-symbol"></span>)</label>
                <input id="ei-amount" class="form-input" type="number" min="1" step="0.01"
                    value="${inv.amount}" oninput="calcEditProfit()">
            </div>
            <div class="form-group">
                <label class="form-label">معدل الفائدة (%)</label>
                <input id="ei-rate" class="form-input" type="number" min="0" step="0.001"
                    value="${parseFloat(inv.interest_rate)}" oninput="calcEditProfit()">
            </div>
            <div class="form-group">
                <label class="form-label">المدة (يوم)</label>
                <input id="ei-days" class="form-input" type="number" min="1"
                    value="${inv.days}" oninput="calcEditProfit()">
            </div>
            <div class="form-group">
                <label class="form-label">تاريخ البداية</label>
                <input id="ei-start" class="form-input" type="date" value="${inv.start_date}"
                    oninput="calcEditMaturity()">
            </div>
            <div class="form-group">
                <label class="form-label">تاريخ الاستحقاق</label>
                <input id="ei-maturity" class="form-input" type="date" value="${inv.maturity_date}">
            </div>
            <div class="form-group" style="grid-column:1/-1">
                <label class="form-label">حساب الإعادة (عند الاستحقاق)</label>
                <select id="ei-return" class="form-input">${retOptions}</select>
            </div>
            <div class="form-group" style="grid-column:1/-1">
                <label class="form-label">ملاحظات</label>
                <textarea id="ei-notes" class="form-input" rows="2">${inv.notes || ''}</textarea>
            </div>
            <div id="ei-profit-preview" style="grid-column:1/-1;background:rgba(74,171,247,.07);border:1px solid rgba(74,171,247,.2);border-radius:10px;padding:.75rem 1rem;font-size:.85rem;color:var(--text-primary)">
                الربح المتوقع: <strong style="color:var(--accent-green)" id="ei-profit-val">+${formatMoneyWithSAR(inv.expected_profit)}</strong>
            </div>
        </div>
        <div style="display:flex;gap:.75rem;margin-top:1.25rem;justify-content:flex-end">
            <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
            <button class="btn btn-primary" onclick="submitEditInvestment(${id})">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                حفظ التعديلات
            </button>
        </div>`;
    openModal();
}

function calcEditProfit() {
    const amount = parseFloat(document.getElementById('ei-amount')?.value) || 0;
    const rate = parseFloat(document.getElementById('ei-rate')?.value) || 0;
    const days = parseInt(document.getElementById('ei-days')?.value) || 0;
    const profit = Math.round(amount * rate / 100 * days / 360 * 100) / 100;
    const el = document.getElementById('ei-profit-val');
    if (el) el.textContent = '+' + formatMoneyWithSAR(profit);
}

function calcEditMaturity() {
    const startEl = document.getElementById('ei-start');
    const daysEl = document.getElementById('ei-days');
    const maturityEl = document.getElementById('ei-maturity');
    if (!startEl || !daysEl || !maturityEl) return;
    const start = new Date(startEl.value);
    const days = parseInt(daysEl.value) || 0;
    if (isNaN(start.getTime()) || days <= 0) return;
    start.setDate(start.getDate() + days);
    maturityEl.value = start.toISOString().split('T')[0];
}

async function submitEditInvestment(id) {
    const payload = {
        id,
        deposit_name: document.getElementById('ei-name')?.value?.trim() || '',
        reference_number: document.getElementById('ei-ref')?.value?.trim() || '',
        amount: parseFloat(document.getElementById('ei-amount')?.value) || 0,
        interest_rate: parseFloat(document.getElementById('ei-rate')?.value) || 0,
        days: parseInt(document.getElementById('ei-days')?.value) || 0,
        start_date: document.getElementById('ei-start')?.value || '',
        maturity_date: document.getElementById('ei-maturity')?.value || '',
        return_account_id: document.getElementById('ei-return')?.value || '',
        notes: document.getElementById('ei-notes')?.value || '',
    };

    if (payload.amount <= 0) { showToast('المبلغ غير صالح', 'error'); return; }

    try {
        const res = await fetch('api/?action=update_investment', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            showToast('تم تحديث الوديعة بنجاح', 'success');
            closeModal();
            await loadInvestments();
            renderInvestmentsTab();
        } else {
            showToast(data.message || 'فشل التحديث', 'error');
        }
    } catch (e) {
        showToast('خطأ في الاتصال', 'error');
    }
}

// ─── دوال مساعدة ──────────────────────────────────────────────────────────────
function fmtDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' });
}