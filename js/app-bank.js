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

    // رسم الواجهة
    switchBankTab('overview');
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

        <!-- تبويبات البنوك -->
        <div class="bank-tabs-nav">
            <button class="bank-tab-btn active" data-bank-tab="overview"   onclick="switchBankTab('overview')">
                <span class="bank-tab-icon">📊</span> نظرة عامة
            </button>
    
            <button class="bank-tab-btn" data-bank-tab="accounts" onclick="switchBankTab('accounts')">
                <span class="bank-tab-icon">🏛️</span> الحسابات
            </button>
            <button class="bank-tab-btn" data-bank-tab="investments" onclick="switchBankTab('investments')">
                <span class="bank-tab-icon">📈</span> ودائع استثمارية
                <span class="tab-badge" id="investments-badge" style="display:none">0</span>
            </button>
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

    // تحديث أزرار التبويب
    document.querySelectorAll('.bank-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.bankTab === tabName);
    });

    // إخفاء جميع اللوحات
    document.querySelectorAll('.bank-tab-panel').forEach(p => p.classList.remove('active'));

    const panel = document.getElementById(`bank-tab-${tabName}`);
    if (panel) panel.classList.add('active');

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

    const totalBalance = bankAccounts.reduce((s, a) => s + parseFloat(a.current_balance || 0), 0);
    const thisMonth = getCurrentMonthDeposits();
    const pendingDeps = bankDeposits.filter(d => d.status === 'معلق');
    const confirmedDeps = bankDeposits.filter(d => d.status === 'تم التأكيد');

    updateQuickStats(totalBalance, thisMonth, pendingDeps.length, confirmedDeps.length);

    // ── ملخص الودائع الأخيرة ──
    const recentDeps = [...bankDeposits].slice(0, 5);

    panel.innerHTML = `
    <div class="bank-rows-page">

        <!-- ═══ الحسابات البنكية ═══ -->
        <div class="bank-section">
            <div class="bank-section-header">
                <div class="bsh-title"><span>🏦</span><h3>الحسابات البنكية</h3><span class="bsh-badge">${bankAccounts.length}</span></div>
                <div style="display:flex;gap:.5rem">
                    <button class="bsh-btn green" onclick="openRecordAllBalancesModal()">📊 تسجيل الأرصدة</button>
                    <button class="bsh-btn" onclick="switchBankTab('accounts')">إدارة الحسابات ←</button>
                </div>
            </div>

            <!-- صف ملخص الأرصدة -->
            <div class="bank-summary-bar">
                <div class="bsb-item"><span class="bsb-val">${fmtMoney(totalBalance)}</span><span class="bsb-lbl">إجمالي الأرصدة</span></div>
                <div class="bsb-sep"></div>
                <div class="bsb-item"><span class="bsb-val green">${fmtMoney(thisMonth)}</span><span class="bsb-lbl">ودائع الشهر</span></div>
                <div class="bsb-sep"></div>
                <div class="bsb-item"><span class="bsb-val orange">${pendingDeps.length}</span><span class="bsb-lbl">معلقة</span></div>
                <div class="bsb-sep"></div>
                <div class="bsb-item"><span class="bsb-val">${confirmedDeps.length}</span><span class="bsb-lbl">مؤكدة</span></div>
            </div>

            <!-- صفوف الحسابات -->
            <div class="bank-rows-list">
                ${bankAccounts.length ? bankAccounts.map(acc => {
        const trend = parseFloat(acc.current_balance) >= parseFloat(acc.initial_balance || 0) ? 'up' : 'down';
        return `
                    <div class="bank-row" onclick="switchBankTab('accounts')">
                        <div class="br-indicator" style="background:${trend === 'up' ? 'var(--accent-green)' : 'var(--accent-red)'}"></div>
                        <div class="br-icon">🏦</div>
                        <div class="br-main">
                            <span class="br-title">${acc.account_name}</span>
                            <span class="br-sub">${acc.bank_name} · ${acc.account_number || ''} · ${acc.account_type || 'جاري'}</span>
                        </div>
                        <div class="br-meta">
                            <span class="br-amount ${trend === 'up' ? 'green' : 'red'}">${fmtMoney(acc.current_balance)}</span>
                            <span class="br-tag">${acc.currency || 'SAR'}</span>
                        </div>
                        <div class="br-trend ${trend === 'up' ? 'up' : 'dn'}">${trend === 'up' ? '▲' : '▼'}</div>
                        <div class="br-actions">
                            <button class="br-btn" onclick="event.stopPropagation();openRecordBalanceModal(${acc.id})" title="تسجيل رصيد">📊</button>
                            <button class="br-btn" onclick="event.stopPropagation();openBalanceHistoryModal(${acc.id})" title="السجل">📜</button>
                        </div>
                    </div>`;
    }).join('') : `<div class="bank-empty">لا توجد حسابات بنكية مضافة بعد</div>`}
            </div>
        </div>

        <!-- ═══ آخر الودائع ═══ -->
        <div class="bank-section">
            <div class="bank-section-header">
                <div class="bsh-title"><span>📥</span><h3>آخر الودائع</h3></div>
                <button class="bsh-btn green" onclick="openAddDepositModal()" style="${showIf('bank.add_deposit')}">+ إيداع جديد</button>
            </div>
            <div class="bank-rows-list">
                ${recentDeps.length ? recentDeps.map(dep => {
        const confirmed = dep.status === 'تم التأكيد';
        return `
                    <div class="bank-row">
                        <div class="br-indicator" style="background:${confirmed ? 'var(--accent-green)' : 'var(--accent-orange)'}"></div>
                        <div class="br-icon">${confirmed ? '✅' : '⏳'}</div>
                        <div class="br-main">
                            <span class="br-title">${dep.deposit_number}</span>
                            <span class="br-sub">${dep.account_name} · ${fmtDate(dep.deposit_date)} · ${dep.deposit_type}</span>
                        </div>
                        <div class="br-meta">
                            <span class="br-amount green">+${fmtMoney(dep.amount)}</span>
                            <span class="br-badge ${confirmed ? 'confirmed' : 'pending'}">${dep.status}</span>
                        </div>
                        <div class="br-actions">
                            ${!confirmed && canDo('bank.confirm_deposit') ? `<button class="br-btn success" onclick="handleConfirmDeposit(${dep.id})" title="تأكيد">✓</button>` : ''}
                            <button class="br-btn" onclick="viewDepositDetails(${dep.id})" title="تفاصيل">👁</button>
                        </div>
                    </div>`;
    }).join('') : `<div class="bank-empty">لا توجد ودائع مسجلة</div>`}
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
                <span class="br-amount">${fmtMoney(acc.current_balance)}</span>
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
                <div class="deposit-item-amount">+${formatMoney(dep.amount)}</div>
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
                    <div class="tl-amount">${formatMoney(dep.expected_amount)}</div>
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
                    <div style="font-size:1.3rem;font-weight:700;color:var(--accent-green)">${fmtMoney(totalThisMonth)}</div>
                    <div style="font-size:.78rem;color:var(--text-muted)">${thisMonthConfirmed.length} إيداع</div>
                </div>
                <div class="acc-daily-stat" style="border-right:3px solid var(--accent-orange)">
                    <div style="font-size:.8rem;color:var(--text-muted)">في الانتظار</div>
                    <div style="font-size:1.3rem;font-weight:700;color:var(--accent-orange)">${fmtMoney(totalPending)}</div>
                    <div style="font-size:.78rem;color:var(--text-muted)">${thisMonthPending.length} إيداع</div>
                </div>
                <div class="acc-daily-stat" style="border-right:3px solid var(--accent-blue)">
                    <div style="font-size:.8rem;color:var(--text-muted)">إجمالي الشهر</div>
                    <div style="font-size:1.3rem;font-weight:700;color:var(--accent-blue)">${fmtMoney(totalThisMonth + totalPending)}</div>
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
                            <td class="dep-amount">+${fmtMoney(dep.amount)}</td>
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
            <td class="dep-amount">+${fmtMoney(dep.amount)}</td>
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
                            <span class="br-amount blue">${fmtMoney(acc.current_balance)}</span>
                            <span class="br-sub-meta">
                                ${lastBal && lastBal.balance_date !== today
                ? `<span style="color:${diffColor}">${diffSign}${fmtMoney(Math.abs(diff))}</span>`
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
                            <span class="br-amount">${fmtMoney(b.closing_balance)}</span>
                            <span class="br-sub-meta" style="color:${color}">${diff >= 0 ? '+' : ''}${fmtMoney(diff)}</span>
                        </div>
                        <div class="br-stat-group">
                            <div class="br-stat"><span>${fmtMoney(b.opening_balance)}</span><small>افتتاح</small></div>
                            <div class="br-stat green"><span>+${fmtMoney(b.total_deposits)}</span><small>ودائع</small></div>
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
                <div style="font-size:1.2rem;font-weight:700;color:var(--accent-blue)">${fmtMoney(acc.current_balance)}</div>
            </div>
            ${last ? `<div style="text-align:left">
                <div style="font-size:.8rem;color:var(--text-muted)">آخر تسجيل (${fmtDate(last.balance_date)})</div>
                <div style="font-size:1rem;font-weight:600">${fmtMoney(last.closing_balance)}</div>
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
        ${diff > 0 ? '▲ زيادة' : '▼ نقص'} ${fmtMoney(Math.abs(diff))} عن رصيد النظام
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
                    <span style="color:var(--accent-blue);font-weight:600">${fmtMoney(acc.current_balance)}</span>
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
                    ${fmtMoney(acc.current_balance)}
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
                            <td>${fmtMoney(b.opening_balance)}</td>
                            <td style="color:var(--accent-green)">+${fmtMoney(b.total_deposits)}</td>
                            <td style="font-weight:700">${fmtMoney(b.closing_balance)}</td>
                            <td style="color:${color};font-weight:600">${diff >= 0 ? '+' : ''}${fmtMoney(diff)}</td>
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
                <div class="ms-value">${formatMoney(totalExpected)}</div>
                <div class="ms-label">المتوقع هذا الشهر</div>
            </div>
            <div class="monthly-stat ms-received">
                <div class="ms-value">${formatMoney(totalReceived)}</div>
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
                    <span class="br-amount green">${formatMoney(dep.expected_amount)}</span>
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
            <span>${formatMoney(dep.expected_amount)}</span>
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
            <div class="qsc-value">${formatMoney(totalBalance)}</div>
            <div class="qsc-label">إجمالي الأرصدة</div>
        </div>
        <div class="quick-stat-card qsc-green">
            <div class="qsc-icon">📈</div>
            <div class="qsc-value">${formatMoney(thisMonth)}</div>
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
            <div class="ddv-row"><span>المبلغ</span><strong class="dep-amount-lg">+${formatMoney(dep.amount)}</strong></div>
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
            alerts.push({ type: 'today', msg: `🔔 وديعة اليوم: ${dep.deposit_name} — ${formatMoney(dep.expected_amount)}`, dep });
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
    const totalInv = active.reduce((s, i) => s + parseFloat(i.amount || 0), 0);
    const totalPro = active.reduce((s, i) => s + parseFloat(i.accrued_profit || 0), 0);
    const overdue = investments.filter(i => i.maturity_status === 'مستحق').length;
    const expiring = investments.filter(i => i.maturity_status === 'قريب_الاستحقاق').length;

    panel.innerHTML = `
        <!-- إحصاءات سريعة -->
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;margin-bottom:1.5rem">
            <div class="quick-stat-card" style="border-right:3px solid var(--accent-blue)">
                <div class="quick-stat-icon" style="background:rgba(74,171,247,0.1);color:var(--accent-blue)">💰</div>
                <div>
                    <div class="quick-stat-label">إجمالي مُستثمر</div>
                    <div class="quick-stat-value">${fmtMoney(totalInv)}</div>
                    <div class="quick-stat-change">${active.length} وديعة نشطة</div>
                </div>
            </div>
            <div class="quick-stat-card" style="border-right:3px solid var(--accent-green)">
                <div class="quick-stat-icon" style="background:rgba(105,219,124,0.1);color:var(--accent-green)">📈</div>
                <div>
                    <div class="quick-stat-label">ربح متراكم</div>
                    <div class="quick-stat-value">${fmtMoney(totalPro)}</div>
                    <div class="quick-stat-change">حتى اليوم</div>
                </div>
            </div>
            <div class="quick-stat-card" style="border-right:3px solid ${overdue > 0 ? 'var(--accent-red)' : 'var(--border-color)'}">
                <div class="quick-stat-icon" style="background:rgba(255,107,107,0.1);color:var(--accent-red)">⏰</div>
                <div>
                    <div class="quick-stat-label">مستحقة الإغلاق</div>
                    <div class="quick-stat-value">${overdue}</div>
                    <div class="quick-stat-change">تنتظر التأكيد</div>
                </div>
            </div>
            <div class="quick-stat-card" style="border-right:3px solid ${expiring > 0 ? 'var(--accent-orange)' : 'var(--border-color)'}">
                <div class="quick-stat-icon" style="background:rgba(255,169,77,0.1);color:var(--accent-orange)">🔔</div>
                <div>
                    <div class="quick-stat-label">تستحق خلال 3 أيام</div>
                    <div class="quick-stat-value">${expiring}</div>
                    <div class="quick-stat-change">تنبيه مبكر</div>
                </div>
            </div>
        </div>

        <!-- شريط الأدوات -->
        <div class="toolbar" style="margin-bottom:1rem">
            <div class="toolbar-search">
                <div class="search-input">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                    </svg>
                    <input type="text" id="inv-search" placeholder="بحث في الودائع..."
                        oninput="filterInvestmentRows()">
                </div>
                <select id="inv-status-filter" class="filter-select" onchange="filterInvestmentRows()">
                    <option value="">جميع الحالات</option>
                    <option value="نشط">نشطة</option>
                    <option value="مستحق">مستحقة</option>
                    <option value="قريب_الاستحقاق">قريبة الاستحقاق</option>
                    <option value="منتهي">منتهية</option>
                    <option value="ملغي">ملغاة</option>
                </select>
            </div>
            <button class="btn btn-primary" onclick="openAddInvestmentModal()">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 5v14M5 12h14"/>
                </svg>
                ربط وديعة جديدة
            </button>
        </div>

        <!-- الجدول -->
        <div class="card">
            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>رقم الوديعة</th>
                            <th>الاسم</th>
                            <th>الحساب</th>
                            <th>المبلغ</th>
                            <th>الفائدة</th>
                            <th>البداية</th>
                            <th>الاستحقاق</th>
                            <th>الربح المتوقع</th>
                            <th>الحالة</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody id="inv-tbody">
                        ${renderInvestmentRows(investments)}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// ─── رسم صفوف الجدول ────────────────────────────────────────

function renderInvestmentRows(list) {
    if (!list || !list.length) {
        return `<tr><td colspan="10" style="text-align:center;padding:3rem;color:var(--text-muted)">
            لا توجد ودائع استثمارية
            <br><br>
            <button class="btn btn-primary" onclick="openAddInvestmentModal()">ربط وديعة جديدة</button>
        </td></tr>`;
    }

    let html = '';
    list.forEach(inv => {
        const isExp = (expandedInvestment == inv.id);

        const ms = inv.maturity_status;
        const statusBadge =
            ms === 'مستحق' ? `<span class="status-badge" style="background:rgba(255,107,107,0.15);color:var(--accent-red)">⏰ مستحقة</span>` :
                ms === 'قريب_الاستحقاق' ? `<span class="status-badge" style="background:rgba(255,169,77,0.15);color:var(--accent-orange)">🔔 قريبة</span>` :
                    inv.status === 'نشط' ? `<span class="status-badge" style="background:rgba(105,219,124,0.15);color:var(--accent-green)">✅ نشطة</span>` :
                        inv.status === 'منتهي' ? `<span class="status-badge" style="background:rgba(74,171,247,0.15);color:var(--accent-blue)">✔ منتهية</span>` :
                            `<span class="status-badge" style="background:var(--bg-surface);color:var(--text-muted)">✖ ملغاة</span>`;

        const daysLeft = inv.status === 'نشط'
            ? (ms === 'مستحق'
                ? `<span style="color:var(--accent-red);font-size:.75rem">متأخرة ${Math.abs(inv.days_remaining)} يوم</span>`
                : `<span style="color:var(--text-muted);font-size:.75rem">بعد ${inv.days_remaining} يوم</span>`)
            : '';

        // لون الصف
        const rowStyle = ms === 'مستحق'
            ? 'background:rgba(255,107,107,0.04)'
            : ms === 'قريب_الاستحقاق'
                ? 'background:rgba(255,169,77,0.04)'
                : '';

        html += `<tr class="transaction-row ${isExp ? 'expanded' : ''}"
                     style="${rowStyle}"
                     onclick="toggleInvestment(${inv.id})">
            <td><span class="tx-number">${inv.reference_number}</span></td>
            <td style="font-weight:600">${inv.deposit_name || '—'}</td>
            <td>
                <span style="font-size:.85rem">${inv.bank_name || '—'}</span><br>
                <span style="font-size:.78rem;color:var(--text-muted)">${inv.account_name || '—'}</span>
            </td>
            <td><span class="tx-amount">${fmtMoney(inv.amount)}<small></small></span></td>
            <td style="font-weight:600;color:var(--accent-green)">${parseFloat(inv.interest_rate)}%</td>
            <td style="font-size:.85rem">${fmtDate(inv.start_date)}</td>
            <td style="font-size:.85rem">
                ${fmtDate(inv.maturity_date)}<br>${daysLeft}
            </td>
            <td style="color:var(--accent-green);font-weight:600">+${fmtMoney(inv.expected_profit)}</td>
            <td>${statusBadge}</td>
            <td>
                <div style="display:flex;align-items:center;gap:.5rem">
                    <svg class="expand-icon" width="16" height="16" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" stroke-width="2"
                         style="color:var(--text-muted);transition:transform .3s;${isExp ? 'transform:rotate(180deg)' : ''}">
                        <polyline points="6 9 12 15 18 9"/>
                    </svg>
                </div>
            </td>
        </tr>`;

        // ── الصف الموسع ──────────────────────────────────────
        if (isExp) {
            const progress = Math.min(100, Math.max(0, parseFloat(inv.completion_pct || 0)));
            const accrued = parseFloat(inv.accrued_profit || 0);
            const expected = parseFloat(inv.expected_profit || 0);
            const isActive = inv.status === 'نشط';
            const pColor = ms === 'مستحق' ? '#ef4444' : ms === 'قريب_الاستحقاق' ? '#f59e0b' : '#22c55e';

            html += `<tr class="expanded-row">
                <td colspan="10" style="padding:0">

                    <!-- شريط المعلومات العلوي -->
                    <div style="background:var(--bg-surface);padding:.75rem 1.5rem;border-bottom:1px solid var(--border-color);display:flex;align-items:center;gap:2rem;flex-wrap:wrap">
                        <div style="display:flex;align-items:center;gap:.5rem">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-blue)" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                            <span style="color:var(--text-muted);font-size:.85rem">الحساب:</span>
                            <span style="color:var(--text-primary);font-weight:600">${inv.bank_name} — ${inv.account_name}</span>
                        </div>
                        ${inv.return_account_name && inv.return_account_name !== inv.account_name ? `
                        <div style="display:flex;align-items:center;gap:.5rem">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-purple)" stroke-width="2"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>
                            <span style="color:var(--text-muted);font-size:.85rem">يُعاد لـ:</span>
                            <span style="color:var(--text-primary);font-weight:600">${inv.return_bank_name} — ${inv.return_account_name}</span>
                        </div>` : `
                        <div style="display:flex;align-items:center;gap:.5rem">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-purple)" stroke-width="2"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>
                            <span style="color:var(--text-muted);font-size:.85rem">يُعاد لنفس الحساب</span>
                        </div>`}
                        <div style="margin-right:auto;display:flex;gap:.5rem">
                            ${isActive && (ms === 'مستحق' || ms === 'قريب_الاستحقاق') ? `
                            <button class="btn btn-sm" style="background:var(--accent-green);color:#fff"
                                onclick="event.stopPropagation();openMatureInvestmentModal(${inv.id})">
                                🏁 إغلاق واسترداد
                            </button>` : ''}
                            ${isActive ? `
                            <button class="btn btn-sm btn-secondary"
                                onclick="event.stopPropagation();openCancelInvestmentModal(${inv.id})">
                                إلغاء مبكر
                            </button>` : ''}
                        </div>
                    </div>

                    <!-- تفاصيل 4 أقسام -->
                    <div class="expanded-content four-columns">

                        <!-- المبالغ -->
                        <div class="detail-section receiving">
                            <div class="detail-header green">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                                المبالغ والعائد
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">الأصل:</span>
                                <span class="detail-value" style="font-weight:700;color:var(--accent-blue)">${fmtMoney(inv.amount)}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">الفائدة:</span>
                                <span class="detail-value" style="font-weight:600">${parseFloat(inv.interest_rate)}% سنوي</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">الربح المتوقع:</span>
                                <span class="detail-value" style="color:var(--accent-green);font-weight:600">+${fmtMoney(expected)}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">الربح المتراكم:</span>
                                <span class="detail-value" style="color:var(--accent-cyan);font-weight:600">+${fmtMoney(accrued)}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">الإجمالي:</span>
                                <span class="detail-value" style="font-weight:700;font-size:1.05rem">${fmtMoney(parseFloat(inv.amount) + expected)}</span>
                            </div>
                        </div>

                        <!-- المدة والتواريخ -->
                        <div class="detail-section budget">
                            <div class="detail-header cyan">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                                المدة والتواريخ
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">المدة:</span>
                                <span class="detail-value" style="font-weight:600">${inv.days} يوم</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">البداية:</span>
                                <span class="detail-value">${fmtDate(inv.start_date)}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">الاستحقاق:</span>
                                <span class="detail-value" style="font-weight:600">${fmtDate(inv.maturity_date)}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">${ms === 'مستحق' ? 'متأخرة:' : 'متبقٍ:'}</span>
                                <span class="detail-value" style="color:${ms === 'مستحق' ? 'var(--accent-red)' : 'var(--text-primary)'};font-weight:600">
                                    ${Math.abs(inv.days_remaining)} يوم
                                </span>
                            </div>
                            ${isActive ? `
                            <div style="margin-top:.75rem">
                                <div style="font-size:.78rem;color:var(--text-muted);margin-bottom:.3rem">نسبة الاكتمال</div>
                                <div style="height:8px;background:var(--bg-surface);border-radius:4px;overflow:hidden">
                                    <div style="height:100%;width:${progress}%;background:${pColor};border-radius:4px;transition:width .5s"></div>
                                </div>
                                <div style="font-size:.78rem;color:var(--text-muted);margin-top:.2rem;text-align:left">${progress}%</div>
                            </div>` : ''}
                        </div>

                        <!-- الحساب والمرجع -->
                        <div class="detail-section payment">
                            <div class="detail-header orange">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                                الحساب والمرجع
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">البنك:</span>
                                <span class="detail-value" style="font-weight:600">${inv.bank_name || '—'}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">الحساب:</span>
                                <span class="detail-value">${inv.account_name || '—'}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">رقم الحساب:</span>
                                <span class="detail-value" style="font-family:monospace;color:var(--accent-blue)">${inv.account_number || '—'}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">المرجع:</span>
                                <span class="detail-value" style="font-family:monospace;color:var(--accent-orange)">${inv.reference_number}</span>
                            </div>
                            ${inv.notes ? `
                            <div class="detail-row">
                                <span class="detail-label">ملاحظات:</span>
                                <span class="detail-value">${inv.notes}</span>
                            </div>` : ''}
                        </div>

                        <!-- الحالة والإجراءات -->
                        <div class="detail-section invoice">
                            <div class="detail-header purple">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                                الحالة والإجراءات
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">الحالة:</span>
                                <span class="detail-value">${ms === 'مستحق' ? '<span style="color:var(--accent-red);font-weight:700">⏰ مستحقة الإغلاق</span>' :
                    ms === 'قريب_الاستحقاق' ? '<span style="color:var(--accent-orange);font-weight:700">🔔 قريبة الاستحقاق</span>' :
                        inv.status === 'نشط' ? '<span style="color:var(--accent-green);font-weight:700">✅ نشطة</span>' :
                            inv.status === 'منتهي' ? '<span style="color:var(--accent-blue);font-weight:700">✔ منتهية</span>' :
                                '<span style="color:var(--text-muted);font-weight:700">✖ ملغاة</span>'
                }</span>
                            </div>
                            ${inv.status === 'منتهي' ? `
                            <div class="detail-row">
                                <span class="detail-label">الربح الفعلي:</span>
                                <span class="detail-value" style="color:var(--accent-green);font-weight:700">+${fmtMoney(inv.actual_profit)}</span>
                            </div>` : ''}
                            ${inv.matured_at ? `
                            <div class="detail-row">
                                <span class="detail-label">تاريخ الإغلاق:</span>
                                <span class="detail-value">${fmtDate(inv.matured_at)}</span>
                            </div>` : ''}
                            <div style="margin-top:1rem;display:flex;flex-direction:column;gap:.5rem">
                                ${isActive && (ms === 'مستحق' || ms === 'قريب_الاستحقاق') ? `
                                <button class="btn btn-sm" style="background:var(--accent-green);color:#fff;width:100%"
                                    onclick="event.stopPropagation();openMatureInvestmentModal(${inv.id})">
                                    🏁 إغلاق واسترداد الأصل + الربح
                                </button>` : ''}
                                ${isActive ? `
                                <button class="btn btn-sm btn-secondary" style="width:100%"
                                    onclick="event.stopPropagation();openCancelInvestmentModal(${inv.id})">
                                    ⚠️ إلغاء مبكر
                                </button>` : ''}
                            </div>
                        </div>

                    </div>
                </td>
            </tr>`;
        }
    });

    return html;
}

// ─── تبديل الصف ─────────────────────────────────────────────

function toggleInvestment(id) {
    expandedInvestment = (expandedInvestment == id) ? null : id;
    const tbody = document.getElementById('inv-tbody');
    if (tbody) {
        const filter = document.getElementById('inv-status-filter')?.value || '';
        const search = (document.getElementById('inv-search')?.value || '').toLowerCase();
        const filtered = applyInvFilter(investments, filter, search);
        tbody.innerHTML = renderInvestmentRows(filtered);
    }
}

function filterInvestmentRows() {
    const filter = document.getElementById('inv-status-filter')?.value || '';
    const search = (document.getElementById('inv-search')?.value || '').toLowerCase();
    const filtered = applyInvFilter(investments, filter, search);
    const tbody = document.getElementById('inv-tbody');
    if (tbody) tbody.innerHTML = renderInvestmentRows(filtered);
}

function applyInvFilter(list, filter, search) {
    return list.filter(inv => {
        const matchFilter =
            !filter ? true :
                filter === 'مستحق' ? inv.maturity_status === 'مستحق' :
                    filter === 'قريب_الاستحقاق' ? inv.maturity_status === 'قريب_الاستحقاق' :
                        inv.status === filter;
        const matchSearch = !search ||
            (inv.reference_number || '').toLowerCase().includes(search) ||
            (inv.deposit_name || '').toLowerCase().includes(search) ||
            (inv.bank_name || '').toLowerCase().includes(search) ||
            (inv.account_name || '').toLowerCase().includes(search);
        return matchFilter && matchSearch;
    });
}


// ════════════════════════════════════════════════════════════
//  مودال: ربط وديعة جديدة
// ════════════════════════════════════════════════════════════

function openAddInvestmentModal() {
    const opts = bankAccounts
        .filter(a => a.is_active == 1)
        .map(a => `<option value="${a.id}" data-balance="${a.current_balance}">
            ${a.bank_name} — ${a.account_name} (${fmtMoney(a.current_balance)})
        </option>`).join('');

    DOM.modalTitle.textContent = '🏦 ربط وديعة استثمارية جديدة';
    DOM.modalBody.innerHTML = `
        <div class="modal-form-grid">

            <div class="form-group full-span">
                <label class="form-label">اسم الوديعة *</label>
                <input type="text" id="inv-name" class="form-input"
                    placeholder="مثال: وديعة الجزيرة Q1 2026" required>
            </div>

            <div class="form-group">
                <label class="form-label">حساب التشغيل (المصدر) *</label>
                <select id="inv-account" class="form-input" onchange="onInvAccChange(this)">
                    <option value="">-- اختر --</option>${opts}
                </select>
                <div id="inv-bal-hint" style="margin-top:4px;font-size:.82rem;color:var(--accent-green)"></div>
            </div>

            <div class="form-group">
                <label class="form-label">حساب الاسترداد</label>
                <select id="inv-return" class="form-input">
                    <option value="">-- نفس حساب المصدر --</option>${opts}
                </select>
            </div>

            <div class="form-group">
                <label class="form-label">المبلغ (ريال) *</label>
                <input type="number" id="inv-amount" class="form-input"
                    placeholder="1000000" min="1" step="0.01" oninput="calcInvSummary()">
            </div>

            <div class="form-group">
                <label class="form-label">نسبة الفائدة السنوية (%) *</label>
                <input type="number" id="inv-rate" class="form-input"
                    placeholder="5.00" min="0.001" step="0.001" oninput="calcInvSummary()">
            </div>

            <div class="form-group">
                <label class="form-label">المدة *</label>
                <div style="display:flex;gap:8px">
                    <input type="number" id="inv-days" class="form-input"
                        placeholder="90" min="1" step="1"
                        oninput="calcInvSummary();calcInvMaturity()">
                    <select class="form-input" style="max-width:140px" onchange="setInvDays(this.value)">
                        <option value="">اختر مدة</option>
                        <option value="30">شهر — 30</option>
                        <option value="60">شهرين — 60</option>
                        <option value="90">3 أشهر — 90</option>
                        <option value="180">6 أشهر — 180</option>
                        <option value="365">سنة — 365</option>
                    </select>
                </div>
            </div>

            <div class="form-group">
                <label class="form-label">تاريخ الربط *</label>
                <input type="date" id="inv-start" class="form-input"
                    value="${new Date().toISOString().split('T')[0]}"
                    oninput="calcInvMaturity()">
            </div>

            <div class="form-group">
                <label class="form-label">تاريخ الاستحقاق</label>
                <input type="text" id="inv-maturity" class="form-input" readonly
                    style="background:var(--bg-surface);color:var(--accent-blue)">
            </div>

            <div class="form-group">
                <label class="form-label">رقم المرجع</label>
                <input type="text" id="inv-ref" class="form-input"
                    placeholder="يُولَّد تلقائياً">
            </div>

            <div class="form-group">
                <label class="form-label">ملاحظات</label>
                <input type="text" id="inv-notes" class="form-input" placeholder="اختياري">
            </div>

            <div class="form-group full-span" id="inv-summary-box" style="display:none">
                <div style="background:var(--bg-surface);border:1px solid var(--border-color);border-radius:12px;padding:1rem;display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;text-align:center">
                    <div>
                        <div style="font-size:.78rem;color:var(--text-muted)">الربح المتوقع</div>
                        <div id="inv-s-profit" style="font-size:1.3rem;font-weight:700;color:var(--accent-green)">—</div>
                    </div>
                    <div>
                        <div style="font-size:.78rem;color:var(--text-muted)">إجمالي العائد</div>
                        <div id="inv-s-total" style="font-size:1.3rem;font-weight:700;color:var(--accent-blue)">—</div>
                    </div>
                    <div>
                        <div style="font-size:.78rem;color:var(--text-muted)">عائد يومي</div>
                        <div id="inv-s-daily" style="font-size:1rem;font-weight:600">—</div>
                    </div>
                </div>
            </div>

        </div>
        <div style="display:flex;gap:12px;margin-top:20px;justify-content:flex-end">
            <button type="button" class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
            <button type="button" class="btn btn-primary" onclick="submitNewInvestment()">
                🏦 ربط الوديعة
            </button>
        </div>`;
    openModal();
    calcInvMaturity();
}

function onInvAccChange(sel) {
    const bal = parseFloat(sel.options[sel.selectedIndex]?.dataset.balance || 0);
    const hint = document.getElementById('inv-bal-hint');
    if (hint) hint.textContent = bal > 0 ? `الرصيد الحالي: ${fmtMoney(bal)}` : '';
}

function setInvDays(v) {
    if (!v) return;
    const el = document.getElementById('inv-days');
    if (el) { el.value = v; calcInvSummary(); calcInvMaturity(); }
}

function calcInvSummary() {
    const amount = parseFloat(document.getElementById('inv-amount')?.value || 0);
    const rate = parseFloat(document.getElementById('inv-rate')?.value || 0);
    const days = parseInt(document.getElementById('inv-days')?.value || 0);
    const box = document.getElementById('inv-summary-box');
    if (!amount || !rate || !days) { if (box) box.style.display = 'none'; return; }
    const profit = amount * rate / 100 * days / 360;
    if (box) {
        box.style.display = 'block';
        document.getElementById('inv-s-profit').textContent = fmtMoney(profit);
        document.getElementById('inv-s-total').textContent = fmtMoney(amount + profit);
        document.getElementById('inv-s-daily').textContent = fmtMoney(amount * rate / 100 / 360) + ' / يوم';
    }
}

function calcInvMaturity() {
    const s = document.getElementById('inv-start')?.value;
    const d = parseInt(document.getElementById('inv-days')?.value || 0);
    const out = document.getElementById('inv-maturity');
    if (!out) return;
    if (!s || !d) { out.value = ''; return; }
    const dt = new Date(s);
    dt.setDate(dt.getDate() + d);
    out.value = dt.toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' });
    out.dataset.iso = dt.toISOString().split('T')[0];
}

async function submitNewInvestment() {
    const p = {
        account_id: document.getElementById('inv-account')?.value,
        return_account_id: document.getElementById('inv-return')?.value || null,
        deposit_name: document.getElementById('inv-name')?.value,
        amount: document.getElementById('inv-amount')?.value,
        interest_rate: document.getElementById('inv-rate')?.value,
        days: document.getElementById('inv-days')?.value,
        start_date: document.getElementById('inv-start')?.value,
        reference_number: document.getElementById('inv-ref')?.value,
        notes: document.getElementById('inv-notes')?.value,
    };
    if (!p.account_id) return showToast('يرجى اختيار الحساب', 'error');
    if (!p.deposit_name) return showToast('يرجى إدخال اسم الوديعة', 'error');
    if (!p.amount || p.amount <= 0) return showToast('يرجى إدخال المبلغ', 'error');
    if (!p.interest_rate) return showToast('يرجى إدخال نسبة الفائدة', 'error');
    if (!p.days) return showToast('يرجى إدخال المدة', 'error');

    try {
        const res = await fetch('api/?action=create_investment', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p)
        });
        const data = await res.json();
        if (data.success) {
            showToast(data.message || 'تم ربط الوديعة بنجاح', 'success');
            closeModal();
            await Promise.all([loadInvestments(), loadBankAccounts()]);
            renderInvestmentsTab();
        } else {
            showToast(data.message || 'فشل', 'error');
        }
    } catch { showToast('خطأ في الاتصال', 'error'); }
}


// ════════════════════════════════════════════════════════════
//  مودال: إغلاق الوديعة
// ════════════════════════════════════════════════════════════

function openMatureInvestmentModal(id) {
    const inv = investments.find(i => i.id == id);
    if (!inv) return;
    const exp = parseFloat(inv.expected_profit || 0);

    DOM.modalTitle.textContent = '🏁 إغلاق الوديعة واسترداد المبلغ';
    DOM.modalBody.innerHTML = `
        <div style="background:var(--bg-surface);border-radius:12px;padding:1.25rem;margin-bottom:1rem">
            <div style="display:flex;justify-content:space-between;padding:.5rem 0;border-bottom:1px solid var(--border-color)">
                <span style="color:var(--text-muted)">الوديعة</span>
                <strong>${inv.deposit_name || inv.reference_number}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;padding:.5rem 0;border-bottom:1px solid var(--border-color)">
                <span style="color:var(--text-muted)">المبلغ الأصلي</span>
                <strong style="color:var(--accent-blue)">${fmtMoney(inv.amount)}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;padding:.5rem 0;border-bottom:1px solid var(--border-color)">
                <span style="color:var(--text-muted)">الربح المتوقع</span>
                <strong style="color:var(--accent-green)">+${fmtMoney(exp)}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;padding:.75rem 0;font-size:1.1rem">
                <span style="color:var(--text-muted)">إجمالي الاسترداد</span>
                <strong>${fmtMoney(parseFloat(inv.amount) + exp)}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;padding:.5rem 0">
                <span style="color:var(--text-muted)">يُضاف إلى</span>
                <strong>🏦 ${inv.return_account_name || inv.account_name}</strong>
            </div>
        </div>
        <div class="form-group">
            <label class="form-label">الربح الفعلي (ريال)</label>
            <input type="number" id="mat-profit" class="form-input"
                value="${exp.toFixed(2)}" step="0.01">
            <div style="font-size:.8rem;color:var(--text-muted);margin-top:4px">عدّل إذا كان الربح الفعلي مختلفاً</div>
        </div>
        <div style="display:flex;gap:12px;margin-top:20px;justify-content:flex-end">
            <button type="button" class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
            <button type="button" class="btn" style="background:var(--accent-green);color:#fff"
                onclick="submitMatureInv(${id})">
                ✅ تأكيد الإغلاق والاسترداد
            </button>
        </div>`;
    openModal();
}

async function submitMatureInv(id) {
    const profit = document.getElementById('mat-profit')?.value;
    try {
        const res = await fetch('api/?action=mature_investment', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, actual_profit: profit })
        });
        const data = await res.json();
        if (data.success) {
            showToast(data.message, 'success');
            closeModal();
            await Promise.all([loadInvestments(), loadBankAccounts()]);
            renderInvestmentsTab();
        } else { showToast(data.message || 'فشل', 'error'); }
    } catch { showToast('خطأ في الاتصال', 'error'); }
}


// ════════════════════════════════════════════════════════════
//  مودال: إلغاء مبكر
// ════════════════════════════════════════════════════════════

function openCancelInvestmentModal(id) {
    const inv = investments.find(i => i.id == id);
    if (!inv) return;

    DOM.modalTitle.textContent = '⚠️ إلغاء الوديعة مبكراً';
    DOM.modalBody.innerHTML = `
        <div style="display:flex;gap:1rem;align-items:flex-start;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);border-radius:10px;padding:1rem;margin-bottom:1rem">
            <span style="font-size:1.75rem">⚠️</span>
            <div style="color:var(--text-primary);font-size:.95rem;line-height:1.6">
                <strong>تحذير:</strong> الإلغاء المبكر يعيد المبلغ الأصلي فقط
                (<strong style="color:var(--accent-blue)">${fmtMoney(inv.amount)}</strong>)
                بدون أي ربح.
            </div>
        </div>
        <div class="form-group">
            <label class="form-label">سبب الإلغاء</label>
            <textarea id="cancel-notes" class="form-input" rows="3"
                placeholder="يرجى ذكر السبب..."></textarea>
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

async function submitCancelInv(id) {
    const notes = document.getElementById('cancel-notes')?.value || '';
    try {
        const res = await fetch('api/?action=cancel_investment', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, notes })
        });
        const data = await res.json();
        if (data.success) {
            showToast(data.message, 'success');
            closeModal();
            await Promise.all([loadInvestments(), loadBankAccounts()]);
            renderInvestmentsTab();
        } else { showToast(data.message || 'فشل', 'error'); }
    } catch { showToast('خطأ في الاتصال', 'error'); }
}


// ─── دوال مساعدة ────────────────────────────────────────────
// fmtMoney مُعرَّفة في app-common.js وتُستخدم مباشرة هنا
function fmtDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' });
}