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
async function loadBankDepositsPage() {
    const container = document.getElementById('main-content');
    if (!container) return;

    container.innerHTML = renderBankPageSkeleton();

    // تحميل البيانات بالتوازي
    await Promise.all([
        loadBankAccounts(),
        loadMonthlyDeposits(),
        loadInvestments(),
    ]);

    // تحديد التبويب المطلوب من السايدبار (لو نقر عليه)
    const activeSubBtn = document.querySelector('.nav-child-btn[data-bank-sub].active');
    const startTab = activeSubBtn ? activeSubBtn.dataset.bankSub : 'overview';

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
                    <h1>نظام الودائع البنكية</h1>
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
        overview: 'نظرة عامة',
        deposits: 'الحسابات البنكية',
        monthly: 'ودائع الشهر',
        accounts: 'الحسابات البنكية',
        investments: 'الودائع الاستثمارية',
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
                <div class="bov2-kpi-lbl">إجمالي أرصدة الحسابات</div>
            </div>
            <div class="bov2-kpi" style="--kpi-accent:#a78bfa">
                <div class="bov2-kpi-top">
                    <div class="bov2-kpi-icon" style="background:rgba(167,139,250,.12);color:#a78bfa">📈</div>
                    <span class="bov2-kpi-tag">${activeInv.length} نشطة</span>
                </div>
                <div class="bov2-kpi-val">${formatMoneyWithSAR(totalInvested)}</div>
                <div class="bov2-kpi-lbl">إجمالي الاستثمارات النشطة</div>
            </div>
            <div class="bov2-kpi" style="--kpi-accent:#22c55e">
                <div class="bov2-kpi-top">
                    <div class="bov2-kpi-icon" style="background:rgba(34,197,94,.12);color:#22c55e">💰</div>
                    <span class="bov2-kpi-tag">${doneInv.length} منتهية</span>
                </div>
                <div class="bov2-kpi-val">${formatMoneyWithSAR(totalProfit)}</div>
                <div class="bov2-kpi-lbl">إجمالي الأرباح المحققة</div>
            </div>
            <div class="bov2-kpi" style="--kpi-accent:#f59e0b">
                <div class="bov2-kpi-top">
                    <div class="bov2-kpi-icon" style="background:rgba(245,158,11,.12);color:#f59e0b">📅</div>
                    <span class="bov2-kpi-tag" style="color:${upcoming[0] ? urgencyColor(daysLeft(upcoming[0].maturity_date)) : 'var(--text-muted)'}">
                        ${upcoming[0] ? urgencyLabel(daysLeft(upcoming[0].maturity_date)) : '—'}
                    </span>
                </div>
                <div class="bov2-kpi-val">${upcoming[0] ? formatMoneyWithSAR(upcoming[0].amount) : '—'}</div>
                <div class="bov2-kpi-lbl">أقرب استحقاق</div>
            </div>
        </div>

        <!-- ══ Mid Row: Chart + Upcoming ══ -->
        <div class="bov2-mid">

            <!-- الرسم البياني -->
            <div class="bov2-card bov2-chart-card">
                <div class="bov2-card-hdr">
                    <div>
                        <div class="bov2-card-title">نشاط الودائع الاستثمارية</div>
                        <div class="bov2-card-sub">آخر 6 أشهر · إجمالي ${formatMoneyWithSAR(monthlyData.reduce((s, m) => s + m.amount, 0))}</div>
                    </div>
                    <div class="bov2-legend">
                        <span class="bov2-legend-dot" style="background:#4dabf7"></span>
                        <span>الودائع الاستثمارية الشهرية</span>
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
                        <div class="bov2-card-title">الاستحقاقات القادمة</div>
                        <div class="bov2-card-sub">${activeInv.length} وديعة نشطة</div>
                    </div>
                    <button class="bov2-link" onclick="switchBankTab('investments')">عرض الكل ←</button>
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
                        <div class="bov2-card-title">الحسابات البنكية</div>
                        <div class="bov2-card-sub">${bankAccounts.length} حساب · ${formatMoneyWithSAR(totalBalance)} إجمالي</div>
                    </div>
                    <button class="bov2-link" onclick="switchBankTab('accounts')">إدارة ←</button>
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
                        <div class="bov2-card-title">آخر الودائع</div>
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
    }).join('') : `<div class="bov2-empty">لا توجد ودائع</div>`}
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
        return `<div class="empty-state-sm">لا توجد ودائع مسجلة</div>`;
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
        return `<div class="empty-state-sm">لا توجد ودائع مجدولة هذا الشهر</div>`;
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
                    <div style="font-size:.8rem;color:var(--text-muted)">في الانتظار</div>
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
                <div class="bsh-title"><span>🏦</span><h3>الحسابات البنكية</h3><span class="bsh-badge">${bankAccounts.length}</span></div>
                <div style="display:flex;gap:.5rem">
                    <button class="bsh-btn green" onclick="openRecordAllBalancesModal()">📊 تسجيل أرصدة اليوم</button>
                    <button class="bsh-btn" onclick="openAddAccountModal()" style="${showIf('bank.add_account')}">+ إضافة حساب</button>
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

        <!-- ═══ سجل الأرصدة اليومية ═══ -->
        <div class="bank-section">
            <div class="bank-section-header">
                <div class="bsh-title"><span>📈</span><h3>سجل الأرصدة اليومية</h3></div>
                <button class="bsh-btn green" onclick="openRecordAllBalancesModal()">+ تسجيل جديد</button>
            </div>
            <div class="bank-rows-list">
                ${dailyBalances.length ? dailyBalances.slice(0, 20).map(b => {
        const diff = parseFloat(b.closing_balance) - parseFloat(b.opening_balance);
        const color = diff >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';
        return `
                    <div class="bank-row">
                        <div class="br-indicator" style="background:${color}"></div>
                        <div class="br-icon">📅</div>
                        <div class="br-main">
                            <span class="br-title">${b.account_name}</span>
                            <span class="br-sub">${b.bank_name || ''} · ${fmtDate(b.balance_date)} ${b.notes ? '· ' + b.notes : ''}</span>
                        </div>
                        <div class="br-meta">
                            <span class="br-amount">${formatMoneyWithSAR(b.closing_balance)}</span>
                            <span class="br-sub-meta" style="color:${color}">${diff >= 0 ? '+' : ''}${formatMoneyWithSAR(diff)}</span>
                        </div>
                        <div class="br-stat-group">
                            <div class="br-stat"><span>${formatMoneyWithSAR(b.opening_balance)}</span><small>افتتاح</small></div>
                            <div class="br-stat green"><span>+${formatMoneyWithSAR(b.total_deposits)}</span><small>ودائع</small></div>
                        </div>
                    </div>`;
    }).join('') : `
                <div class="bank-empty" style="padding:2rem;text-align:center">
                    لم يتم تسجيل أي أرصدة يومية بعد<br><br>
                    <button class="bsh-btn green" onclick="openRecordAllBalancesModal()">📊 سجّل الرصيد الآن</button>
                </div>`}
            </div>
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

    DOM.modalTitle.textContent = `📊 تسجيل رصيد اليوم — ${acc.bank_name} · ${acc.account_name}`;
    DOM.modalBody.innerHTML = `
        <div style="background:var(--bg-surface);border-radius:10px;padding:1rem;margin-bottom:1rem;display:flex;justify-content:space-between">
            <div>
                <div style="font-size:.8rem;color:var(--text-muted)">الرصيد الحالي في النظام</div>
                <div style="font-size:1.2rem;font-weight:700;color:var(--accent-blue)">${formatMoneyWithSAR(acc.current_balance)}</div>
            </div>
            ${last ? `<div style="text-align:left">
                <div style="font-size:.8rem;color:var(--text-muted)">آخر تسجيل (${fmtDate(last.balance_date)})</div>
                <div style="font-size:1rem;font-weight:600">${formatMoneyWithSAR(last.closing_balance)}</div>
            </div>` : ''}
        </div>

        <div class="modal-form-grid">
            <div class="form-group">
                <label class="form-label">التاريخ *</label>
                <input type="date" id="rb-date" class="form-input" value="${today}">
            </div>
            <div class="form-group">
                <label class="form-label">رصيد الافتتاح</label>
                <input type="number" id="rb-opening" class="form-input" step="0.01"
                    value="${last ? parseFloat(last.closing_balance).toFixed(2) : parseFloat(acc.current_balance).toFixed(2)}"
                    placeholder="0.00">
            </div>
            <div class="form-group full-span">
                <label class="form-label">رصيد الإغلاق الفعلي *</label>
                <input type="number" id="rb-closing" class="form-input" step="0.01"
                    value="${parseFloat(acc.current_balance).toFixed(2)}"
                    placeholder="أدخل الرصيد الفعلي من كشف البنك"
                    oninput="calcBalanceDiff(${parseFloat(acc.current_balance)})">
                <div id="rb-diff" style="margin-top:6px;font-size:.85rem"></div>
            </div>
            <div class="form-group full-span">
                <label class="form-label">ملاحظات</label>
                <input type="text" id="rb-notes" class="form-input" placeholder="مثال: كشف البنك بتاريخ اليوم">
            </div>
        </div>

        <div style="display:flex;gap:.75rem;margin-top:1.25rem;justify-content:flex-end">
            <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
            <button class="btn btn-primary" onclick="submitRecordBalance(${accountId}, false)">
                💾 حفظ الرصيد
            </button>
            <button class="btn" style="background:var(--accent-green);color:#fff"
                onclick="submitRecordBalance(${accountId}, true)">
                💾 حفظ وتحديث رصيد النظام
            </button>
        </div>`;
    openModal();
}

function calcBalanceDiff(currentBalance) {
    const closing = parseFloat(document.getElementById('rb-closing')?.value || 0);
    const diff = closing - currentBalance;
    const el = document.getElementById('rb-diff');
    if (!el) return;
    if (isNaN(diff) || diff === 0) { el.textContent = ''; return; }
    el.innerHTML = `<span style="color:${diff > 0 ? 'var(--accent-green)' : 'var(--accent-red)'}">
        ${diff > 0 ? '▲ زيادة' : '▼ نقص'} ${formatMoneyWithSAR(Math.abs(diff))} عن رصيد النظام
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
                        تحديث رصيد النظام
                    </label>
                </div>
            </div>`;
        }).join('');

    DOM.modalTitle.textContent = '📊 تسجيل أرصدة اليوم — جميع الحسابات';
    DOM.modalBody.innerHTML = `
        <div class="form-group" style="margin-bottom:1rem">
            <label class="form-label">التاريخ</label>
            <input type="date" id="all-date" class="form-input" value="${today}">
        </div>
        <div style="max-height:380px;overflow-y:auto;padding-left:2px">${rows}</div>
        <div class="form-group" style="margin-top:1rem">
            <label class="form-label">ملاحظة عامة (اختياري)</label>
            <input type="text" id="all-notes" class="form-input" placeholder="مثال: مراجعة نهاية اليوم">
        </div>
        <div style="display:flex;gap:.75rem;margin-top:1.25rem;justify-content:flex-end">
            <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
            <button class="btn btn-primary" onclick="submitAllBalances()">
                💾 حفظ جميع الأرصدة
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

    DOM.modalTitle.textContent = `✏️ تعديل رصيد — ${acc.bank_name} · ${acc.account_name}`;
    DOM.modalBody.innerHTML = `
        <div style="background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.3);border-radius:10px;padding:.85rem 1rem;margin-bottom:1rem;font-size:.9rem">
            ⚠️ هذا يُعدّل الرصيد الحالي في النظام مباشرة، وسيُسجَّل في تاريخ الأرصدة اليومية تلقائياً.
        </div>
        <div class="modal-form-grid">
            <div class="form-group full-span">
                <label class="form-label">الرصيد الحالي</label>
                <div style="font-size:1.4rem;font-weight:700;color:var(--accent-blue);padding:.5rem 0">
                    ${formatMoneyWithSAR(acc.current_balance)}
                </div>
            </div>
            <div class="form-group full-span">
                <label class="form-label">الرصيد الجديد (ريال) *</label>
                <input type="number" id="eb-new-balance" class="form-input" step="0.01"
                    value="${parseFloat(acc.current_balance).toFixed(2)}"
                    placeholder="0.00">
            </div>
            <div class="form-group full-span">
                <label class="form-label">سبب التعديل *</label>
                <input type="text" id="eb-reason" class="form-input"
                    placeholder="مثال: تصحيح بناءً على كشف البنك">
            </div>
        </div>
        <div style="display:flex;gap:.75rem;margin-top:1.25rem;justify-content:flex-end">
            <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
            <button class="btn btn-primary" onclick="submitEditBalance(${accountId})">
                ✏️ تحديث الرصيد
            </button>
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

    DOM.modalTitle.textContent = `📜 سجل الأرصدة — ${acc?.bank_name} · ${acc?.account_name}`;
    DOM.modalBody.innerHTML = history.length > 0 ? `
        <div style="max-height:450px;overflow-y:auto">
            <table class="deposits-table">
                <thead>
                    <tr><th>التاريخ</th><th>افتتاح</th><th>ودائع</th><th>إغلاق</th><th>الفرق</th><th>ملاحظات</th></tr>
                </thead>
                <tbody>
                    ${history.map(b => {
        const diff = parseFloat(b.closing_balance) - parseFloat(b.opening_balance);
        const color = diff >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';
        return `<tr>
                            <td style="font-weight:600">${fmtDate(b.balance_date)}</td>
                            <td>${formatMoneyWithSAR(b.opening_balance)}</td>
                            <td style="color:var(--accent-green)">+${formatMoneyWithSAR(b.total_deposits)}</td>
                            <td style="font-weight:700">${formatMoneyWithSAR(b.closing_balance)}</td>
                            <td style="color:${color};font-weight:600">${diff >= 0 ? '+' : ''}${formatMoneyWithSAR(diff)}</td>
                            <td style="font-size:.82rem;color:var(--text-muted)">${b.notes || '—'}</td>
                        </tr>`;
    }).join('')}
                </tbody>
            </table>
        </div>` : `<div class="empty-state-sm" style="padding:2rem;text-align:center;color:var(--text-muted)">
            لا يوجد سجل أرصدة لهذا الحساب بعد
        </div>`;

    DOM.modalBody.innerHTML += `
        <div style="margin-top:1rem;text-align:left">
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
            ${hasDep ? `<span class="cal-dep-dot" title="${depCount} وديعة">${depCount}</span>` : ''}
        </div>`;
    }

    calHtml += `</div></div>`;
    return calHtml;
}

// ─── صفوف الودائع المجدولة ──────────────────────────────
function renderMonthlyDepositCards() {
    if (!monthlyDeposits.length) {
        return `<div class="bank-empty">لا توجد ودائع مجدولة لهذا الشهر — أضف وديعة جديدة</div>`;
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
        const result = await res.json();
        if (result.success) bankAccounts = result.data || [];
    } catch (e) {
        console.error('loadBankAccounts:', e);
    }
}

async function loadDeposits() {
    try {
        const res = await fetch('api/?action=bank_deposits');
        const result = await res.json();
        if (result.success) bankDeposits = result.data || [];
    } catch (e) {
        console.error('loadDeposits:', e);
    }
}

async function loadMonthlyDeposits() {
    try {
        const res = await fetch('api/?action=monthly_deposits');
        const result = await res.json();
        if (result.success) {
            monthlyDeposits = result.data || [];
        } else {
            // إذا لم يكن الـ API موجوداً بعد، نستخدم بيانات محلية مؤقتة
            monthlyDeposits = [];
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
            <div class="qsc-label">إجمالي الأرصدة</div>
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

    DOM.modalTitle.textContent = '📥 إضافة إيداع بنكي';
    DOM.modalBody.innerHTML = `
        <form id="deposit-form" onsubmit="submitDeposit(event)">
            <div class="modal-form-grid">
                <div class="form-group">
                    <label class="form-label">الحساب البنكي *</label>
                    <select name="account_id" class="form-input" required>
                        <option value="">اختر الحساب</option>
                        ${accountsOptions}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">المبلغ *</label>
                    <input type="number" name="amount" step="0.01" min="0" class="form-input" placeholder="0.00" required>
                </div>
                <div class="form-group">
                    <label class="form-label">تاريخ الإيداع *</label>
                    <input type="date" name="deposit_date" class="form-input" value="${new Date().toISOString().split('T')[0]}" required>
                </div>
                <div class="form-group">
                    <label class="form-label">نوع الإيداع *</label>
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

    DOM.modalTitle.textContent = '📅 جدولة وديعة شهرية';
    DOM.modalBody.innerHTML = `
        <form id="monthly-deposit-form" onsubmit="submitMonthlyDeposit(event)">
            <div class="modal-form-grid">
                <div class="form-group full-span">
                    <label class="form-label">اسم / وصف الوديعة *</label>
                    <input type="text" name="deposit_name" class="form-input"
                        placeholder="مثال: مرتبات يناير، إيراد الفروع..." required>
                </div>
                <div class="form-group">
                    <label class="form-label">الحساب البنكي *</label>
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
    DOM.modalTitle.textContent = '🏛️ إضافة حساب بنكي';
    DOM.modalBody.innerHTML = `
        <form id="account-form" onsubmit="submitAccount(event)">
            <div class="modal-form-grid">
                <div class="form-group">
                    <label class="form-label">اسم الحساب *</label>
                    <input type="text" name="account_name" class="form-input" required>
                </div>
                <div class="form-group">
                    <label class="form-label">رقم الحساب *</label>
                    <input type="text" name="account_number" class="form-input" required>
                </div>
                <div class="form-group">
                    <label class="form-label">اسم البنك *</label>
                    <input type="text" name="bank_name" class="form-input" required>
                </div>
                <div class="form-group">
                    <label class="form-label">نوع الحساب</label>
                    <select name="account_type" class="form-input">
                        <option value="جاري">جاري</option>
                        <option value="توفير">توفير</option>
                        <option value="استثماري">استثماري</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">الرصيد الافتتاحي</label>
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
            <div class="ddv-row"><span>الحساب</span><strong>${dep.account_name}</strong></div>
            <div class="ddv-row"><span>البنك</span><strong>${dep.bank_name || '—'}</strong></div>
            <div class="ddv-row"><span>التاريخ</span><strong>${formatDate(dep.deposit_date)}</strong></div>
            <div class="ddv-row"><span>النوع</span><strong>${dep.deposit_type}</strong></div>
            <div class="ddv-row"><span>المبلغ</span><strong class="dep-amount-lg">+${formatMoneyWithSAR(dep.amount)}</strong></div>
            <div class="ddv-row"><span>الحالة</span>${getDepositStatusBadge(dep.status)}</div>
            ${dep.depositor_name ? `<div class="ddv-row"><span>المودع</span><strong>${dep.depositor_name}</strong></div>` : ''}
            ${dep.reference_number ? `<div class="ddv-row"><span>المرجع</span><strong>${dep.reference_number}</strong></div>` : ''}
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
                    <label class="form-label">اسم الحساب *</label>
                    <input type="text" name="account_name" class="form-input" value="${acc.account_name}" required>
                </div>
                <div class="form-group">
                    <label class="form-label">رقم الحساب *</label>
                    <input type="text" name="account_number" class="form-input" value="${acc.account_number}" required>
                </div>
                <div class="form-group">
                    <label class="form-label">اسم البنك *</label>
                    <input type="text" name="bank_name" class="form-input" value="${acc.bank_name}" required>
                </div>
                <div class="form-group">
                    <label class="form-label">نوع الحساب</label>
                    <select name="account_type" class="form-input">
                        <option value="جاري" ${acc.account_type === 'جاري' ? 'selected' : ''}>جاري</option>
                        <option value="توفير" ${acc.account_type === 'توفير' ? 'selected' : ''}>توفير</option>
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
let investments = [];  // الودائع الاستثمارية المحملة



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
        <div class="inv-stats-grid">
            <div class="inv-stat-card inv-stat-blue">
                <div class="inv-stat-top">
                    <div class="inv-stat-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-4 0v2"/></svg></div>
                    <span class="inv-stat-badge">${active.length} وديعة</span>
                </div>
                <div class="inv-stat-value">${formatMoneyWithSAR(totalInv)}</div>
                <div class="inv-stat-label">إجمالي مُستثمر</div>
            </div>
            <div class="inv-stat-card inv-stat-green">
                <div class="inv-stat-top">
                    <div class="inv-stat-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg></div>
                    <span class="inv-stat-badge">حتى اليوم</span>
                </div>
                <div class="inv-stat-value">${formatMoneyWithSAR(totalPro)}</div>
                <div class="inv-stat-label">ربح متراكم</div>
            </div>
            <div class="inv-stat-card ${overdue > 0 ? 'inv-stat-red' : 'inv-stat-muted'}">
                <div class="inv-stat-top">
                    <div class="inv-stat-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
                    <span class="inv-stat-badge ${overdue > 0 ? 'inv-badge-red' : ''}">${overdue > 0 ? 'تنتظر إغلاق' : 'لا شيء'}</span>
                </div>
                <div class="inv-stat-value">${overdue}</div>
                <div class="inv-stat-label">مستحقة الإغلاق</div>
            </div>
            <div class="inv-stat-card ${expiring > 0 ? 'inv-stat-orange' : 'inv-stat-muted'}">
                <div class="inv-stat-top">
                    <div class="inv-stat-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg></div>
                    <span class="inv-stat-badge ${expiring > 0 ? 'inv-badge-orange' : ''}">${expiring > 0 ? 'خلال 3 أيام' : 'لا شيء'}</span>
                </div>
                <div class="inv-stat-value">${expiring}</div>
                <div class="inv-stat-label">قريبة الاستحقاق</div>
            </div>
            <div class="inv-stat-card inv-stat-teal">
                <div class="inv-stat-top">
                    <div class="inv-stat-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div>
                    <span class="inv-stat-badge">${done.length} وديعة</span>
                </div>
                <div class="inv-stat-value">${formatMoneyWithSAR(totalDoneProfit)}</div>
                <div class="inv-stat-label">أرباح محققة</div>
            </div>
        </div>

        <div class="inv-toolbar">
            <div class="search-input" style="max-width:280px">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                <input type="text" id="inv-search" placeholder="بحث في الودائع..." oninput="filterInvestmentTables()">
            </div>
            <button class="btn btn-primary" onclick="openAddInvestmentModal()">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
                ربط وديعة جديدة
            </button>
        </div>

        <div class="inv-root" id="inv-root">
            <div class="inv-table-col">
                <table class="data-table">
                    <colgroup>
                        <col/><col/><col/><col/><col/><col/><col/>
                    </colgroup>
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
        return `<tr><td colspan="7" style="text-align:center;padding:3rem;color:var(--text-muted)">
            لا توجد ودائع<br><br>
            <button class="btn btn-primary" onclick="openAddInvestmentModal()">ربط وديعة جديدة</button>
        </td></tr>`;
    }

    let html = '';
    let lastStatus = null;

    list.forEach(inv => {
        const status = inv.status;   // نشط / منتهي / ملغي
        const ms = inv.maturity_status;

        // ── فاصل مجموعة ──────────────────────────────────
        if (status !== lastStatus) {
            const sepConfig = {
                'نشط': { cls: 'spill-green', label: '● النشطة' },
                'منتهي': { cls: 'spill-blue', label: '✔ المنتهية' },
                'ملغي': { cls: 'spill-muted', label: '✖ الملغاة' },
            };
            const sc = sepConfig[status] || { cls: 'spill-muted', label: status };
            html += `<tr class="grp-sep">
                <td colspan="7">
                    <span class="spill ${sc.cls}">${sc.label}</span>
                </td>
            </tr>`;
            lastStatus = status;
        }

        // ── تحديد class الصف ──────────────────────────────
        let rowCls = '';
        if (status === 'منتهي') rowCls = 'inv-done';
        else if (status === 'ملغي') rowCls = 'inv-cancelled';
        else if (ms === 'مستحق') rowCls = 'inv-overdue';
        else if (ms === 'قريب_الاستحقاق') rowCls = 'inv-expiring';
        else rowCls = 'inv-active';

        if (expandedInvestment == inv.id) rowCls += ' row-selected';

        // ── badge الحالة ──────────────────────────────────
        const badge =
            ms === 'مستحق' ? '<span class="spill spill-red">⏰ مستحقة</span>' :
                ms === 'قريب_الاستحقاق' ? '<span class="spill spill-orange">🔔 قريبة</span>' :
                    status === 'نشط' ? '<span class="spill spill-green">نشطة</span>' :
                        status === 'منتهي' ? '<span class="spill spill-blue">منتهية</span>' :
                            '<span class="spill spill-muted">ملغاة</span>';

        // ── المتبقي / المنقضي ─────────────────────────────
        const sub =
            status === 'نشط' && ms === 'مستحق'
                ? `<br><span style="color:#ff6b6b;font-size:.7rem">متأخر ${Math.abs(inv.days_remaining)} يوم</span>`
                : status === 'نشط'
                    ? `<br><span style="color:var(--text-muted);font-size:.7rem">بعد ${inv.days_remaining} يوم</span>`
                    : '';

        // ── الربح المعروض ─────────────────────────────────
        const profitVal = status === 'منتهي' && inv.actual_profit != null
            ? formatMoneyWithSAR(inv.actual_profit)
            : formatMoneyWithSAR(inv.expected_profit);

        html += `<tr class="${rowCls}" data-inv-id="${inv.id}" onclick="toggleInvestment(${inv.id})">
            <td>
                <div style="font-weight:600;overflow:hidden;text-overflow:ellipsis">${inv.deposit_name || inv.reference_number}</div>
                <div style="font-size:.71rem;color:var(--text-muted);font-family:var(--font-primary)">${inv.reference_number}</div>
            </td>
            <td>
                <div style="font-size:.83rem;font-weight:500;overflow:hidden;text-overflow:ellipsis">${inv.bank_name || '—'}</div>
                <div style="font-size:.71rem;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis">${inv.account_name || ''}</div>
            </td>
            <td style="font-weight:700;color:var(--accent-blue);font-variant-numeric:tabular-nums;direction:ltr;text-align:left">${formatMoneyWithSAR(inv.amount)}</td>
            <td style="font-weight:600;color:var(--accent-green);text-align:center">${parseFloat(inv.interest_rate)}%</td>
            <td>
                <div style="font-size:.83rem">${fmtDate(inv.maturity_date)}</div>${sub}
            </td>
            <td style="color:var(--accent-green);font-weight:600;font-variant-numeric:tabular-nums;direction:ltr;text-align:left">+${profitVal}</td>
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
        ms === 'مستحق' ? '<span class="idm-pill idm-pill-red">⏰ مستحقة الإغلاق</span>' :
            ms === 'قريب_الاستحقاق' ? '<span class="idm-pill idm-pill-orange">🔔 قريبة الاستحقاق</span>' :
                inv.status === 'نشط' ? '<span class="idm-pill idm-pill-green">● نشطة</span>' :
                    inv.status === 'منتهي' ? '<span class="idm-pill idm-pill-blue">✔ منتهية</span>' :
                        '<span class="idm-pill idm-pill-muted">✖ ملغاة</span>';

    const overlay = document.createElement('div');
    overlay.id = 'inv-detail-modal';
    overlay.className = 'idm-overlay';
    overlay.onclick = e => { if (e.target === overlay) closeInvDetailModal(); };

    overlay.innerHTML = `
        <div class="idm-box">

            <!-- Header -->
            <div class="idm-header">
                <div class="idm-header-left">
                    ${statusPill}
                    <div class="idm-amount"><span class="sar-symbol"></span> ${formatMoneyWithSAR(inv.amount)}</div>
                    <div class="idm-dep-name">${inv.deposit_name || inv.reference_number}</div>
                </div>
                <button class="idm-close" onclick="closeInvDetailModal()">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>

            <!-- Progress bar (للنشطة فقط) -->
            ${isActive ? `
            <div class="idm-progress-wrap">
                <div class="idm-progress-meta">
                    <span>${fmtDate(inv.start_date)}</span>
                    <span style="font-weight:700;color:${pColor}">${progress}% مكتمل</span>
                    <span>${fmtDate(inv.maturity_date)}</span>
                </div>
                <div class="idm-progress-track">
                    <div class="idm-progress-fill" style="width:${progress}%;background:${pColor}"></div>
                </div>
                <div style="text-align:center;font-size:.75rem;color:${ms === 'مستحق' ? '#ff6b6b' : 'var(--text-muted)'};margin-top:.3rem">
                    ${ms === 'مستحق' ? `متأخرة ${Math.abs(inv.days_remaining)} يوم` : `متبقٍ ${inv.days_remaining} يوم`}
                </div>
            </div>` : ''}

            <!-- Grid التفاصيل -->
            <div class="idm-body">

                <div class="idm-section">
                    <div class="idm-section-title">التواريخ</div>
                    <div class="idm-row"><span>البداية</span><strong>${fmtDate(inv.start_date)}</strong></div>
                    <div class="idm-row"><span>الاستحقاق</span><strong>${fmtDate(inv.maturity_date)}</strong></div>
                    <div class="idm-row"><span>المدة</span><strong>${inv.days} يوم</strong></div>
                    ${inv.matured_at ? `<div class="idm-row"><span>تاريخ الإغلاق</span><strong>${fmtDate(inv.matured_at)}</strong></div>` : ''}
                </div>

                <div class="idm-section">
                    <div class="idm-section-title">الحساب</div>
                    <div class="idm-row"><span>البنك</span><strong>${inv.bank_name || '—'}</strong></div>
                    <div class="idm-row"><span>الحساب</span><strong>${inv.account_name || '—'}</strong></div>
                    <div class="idm-row"><span>الرقم</span><strong style="font-family:var(--font-primary);color:var(--accent-blue);font-size:.8rem">${inv.account_number || '—'}</strong></div>
                    <div class="idm-row"><span>المرجع</span><strong style="font-family:var(--font-primary);color:#ffa94d;font-size:.8rem">${inv.reference_number}</strong></div>
                    ${inv.return_account_name && inv.return_account_name !== inv.account_name
            ? `<div class="idm-row"><span>إعادة لـ</span><strong>${inv.return_account_name}</strong></div>` : ''}
                </div>

                <div class="idm-section idm-section-full">
                    <div class="idm-section-title">المبالغ والربح</div>
                    <div class="idm-amounts-grid">
                        <div class="idm-amount-card">
                            <div class="idm-amount-label">المبلغ الأصلي</div>
                            <div class="idm-amount-val" style="color:var(--accent-blue)">${formatMoneyWithSAR(inv.amount)}</div>
                        </div>
                        <div class="idm-amount-card">
                            <div class="idm-amount-label">معدل الفائدة</div>
                            <div class="idm-amount-val" style="color:var(--accent-green)">${parseFloat(inv.interest_rate)}%</div>
                        </div>
                        <div class="idm-amount-card">
                            <div class="idm-amount-label">الربح المتوقع</div>
                            <div class="idm-amount-val" style="color:var(--accent-green)">+${formatMoneyWithSAR(expected)}</div>
                        </div>
                        ${isActive ? `<div class="idm-amount-card">
                            <div class="idm-amount-label">الربح المتراكم</div>
                            <div class="idm-amount-val" style="color:var(--accent-blue)">+${formatMoneyWithSAR(accrued)}</div>
                        </div>` : ''}
                        ${actual !== null ? `<div class="idm-amount-card">
                            <div class="idm-amount-label">الربح الفعلي</div>
                            <div class="idm-amount-val" style="color:#40c057;font-size:1.1rem">+${formatMoneyWithSAR(actual)}</div>
                        </div>` : ''}
                        <div class="idm-amount-card idm-amount-total">
                            <div class="idm-amount-label">الإجمالي</div>
                            <div class="idm-amount-val">${formatMoneyWithSAR(parseFloat(inv.amount) + (actual !== null ? actual : expected))}</div>
                        </div>
                    </div>
                </div>

                ${inv.notes ? `<div class="idm-section idm-section-full">
                    <div class="idm-section-title">ملاحظات</div>
                    <p class="idm-notes">${inv.notes}</p>
                </div>` : ''}

            </div>

            <!-- Footer الأزرار -->
            ${isActive ? `<div class="idm-footer">
                ${(ms === 'مستحق' || ms === 'قريب_الاستحقاق') ? `
                <button class="idm-btn idm-btn-green" onclick="closeInvDetailModal();openMatureInvestmentModal(${inv.id})">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                    إغلاق واسترداد
                </button>` : ''}
                <button class="idm-btn idm-btn-blue" onclick="closeInvDetailModal();openEditInvestmentModal(${inv.id})">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    تعديل
                </button>
                <button class="idm-btn idm-btn-danger" onclick="closeInvDetailModal();openCancelInvestmentModal(${inv.id})">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                    إلغاء مبكر
                </button>
            </div>` : `<div class="idm-footer">
                <button class="idm-btn idm-btn-muted" onclick="closeInvDetailModal()">إغلاق</button>
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

    DOM.modalTitle.textContent = '💰 ربط وديعة استثمارية جديدة';
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

    DOM.modalTitle.textContent = '🏁 إغلاق الوديعة واسترداد المبلغ';
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

    DOM.modalTitle.textContent = '⚠️ إلغاء الوديعة مبكراً';
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