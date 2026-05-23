// ════════════════════════════════════════════════════════════
//  app-daily-payments.js  —  صفحة المدفوعات اليومية
// ════════════════════════════════════════════════════════════

let dpTransactions = [];   // كل المعاملات المنتظرة
let dpSelected = new Set(); // IDs المحددة
let dpLastOrder = null; // آخر أمر دفع صادر

// ────────────────────────────────────────────
//  تهيئة الصفحة
// ────────────────────────────────────────────
async function initDailyPayments() {
    renderDailyPaymentsPage();
    await loadDailyPayments();
}

function renderDailyPaymentsPage() {
    const page = document.getElementById('page-daily-payments');
    if (!page) return;

    page.innerHTML = `
    <div class="dp-root">

        <div class="dp-topbar">
            <div class="dp-topbar-left">
                <div class="dp-page-title">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="2" y="5" width="20" height="14" rx="2"/>
                        <line x1="2" y1="10" x2="22" y2="10"/>
                    </svg>
                    المدفوعات اليومية
                </div>
                <div class="dp-date-badge">
                    ${new Date().toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </div>
            </div>
            <div class="dp-topbar-right">
                <button class="dp-btn dp-btn-ghost" onclick="loadDailyPayments()" title="تحديث">↻</button>
                <button class="dp-btn dp-btn-primary" id="dp-issue-btn" onclick="openIssuePaymentModal()" disabled>
                    + إصدار أمر الدفع
                    <span class="dp-sel-count" id="dp-sel-badge" style="display:none">0</span>
                </button>
            </div>
        </div>

        <!-- تبويبان -->
        <div class="dp-tabs">
            <button class="dp-tab dp-tab-active" id="dp-tab-pending" onclick="dpSwitchTab('pending')">
                ⏳ في الانتظار
                <span class="dp-tab-badge" id="dp-tab-pending-badge">0</span>
            </button>
            <button class="dp-tab" id="dp-tab-history" onclick="dpSwitchTab('history')">
                📅 السجل اليومي
            </button>
        </div>

        <!-- إحصائيات -->
        <div class="dp-stats-row" id="dp-stats-row">
            <div class="dp-stat-card"><div class="dp-stat-icon">⏳</div>
                <div><div class="dp-stat-val" id="dps-pending">—</div><div class="dp-stat-lbl">في الانتظار</div></div>
            </div>
            <div class="dp-stat-card"><div class="dp-stat-icon">💰</div>
                <div><div class="dp-stat-val" id="dps-amount">—</div><div class="dp-stat-lbl">إجمالي المبالغ</div></div>
            </div>
            <div class="dp-stat-card"><div class="dp-stat-icon">🔴</div>
                <div><div class="dp-stat-val" id="dps-breach">—</div><div class="dp-stat-lbl">تجاوزت SLA</div></div>
            </div>
            <div class="dp-stat-card"><div class="dp-stat-icon">🟡</div>
                <div><div class="dp-stat-val" id="dps-warn">—</div><div class="dp-stat-lbl">تحذير SLA</div></div>
            </div>
        </div>

        <!-- قسم المعلقة -->
        <div id="dp-section-pending">
            <div class="dp-filters-bar">
                <!-- بحث -->
                <div class="dp-search-wrap">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                    </svg>
                    <input type="search" id="dp-search" placeholder="بحث في المعاملات..."
                           oninput="filterDailyPayments()">
                </div>

                <!-- فلاتر -->
                <div class="dp-filter-group">
                    <select class="dp-select" id="dp-filter-priority" onchange="filterDailyPayments()">
                        <option value="">كل الأولويات</option>
                        <option value="urgent">⚡ عاجل</option>
                        <option value="normal">عادي</option>
                    </select>
                    <select class="dp-select" id="dp-filter-sla" onchange="filterDailyPayments()">
                        <option value="">كل الحالات</option>
                        <option value="breach">🔴 تجاوز SLA</option>
                        <option value="warn">🟡 تحذير</option>
                        <option value="ok">🟢 ضمن الوقت</option>
                    </select>
                    <select class="dp-select" id="dp-filter-vendor" onchange="filterDailyPayments()">
                        <option value="">كل الجهات</option>
                    </select>
                </div>

                <!-- تحديد الكل -->
                <label class="dp-check-all">
                    <span class="dp-check-box">
                        <input type="checkbox" id="dp-check-all" onchange="toggleSelectAll(this.checked)">
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="white" stroke-width="2" stroke-linecap="round">
                            <polyline points="2 6 5 9 10 3"/>
                        </svg>
                    </span>
                    تحديد الكل
                </label>
            </div>
            <div class="dp-table-wrap">
                <table class="dp-table">
                    <thead><tr>
                        <th style="width:36px"></th>
                        <th>رقم المعاملة</th><th>الوصف</th><th>النوع</th>
                        <th>المبلغ</th><th>الأولوية</th><th>SLA</th>
                        <th>OLA (مرحلة الدفع)</th><th>التاريخ</th>
                    </tr></thead>
                    <tbody id="dp-tbody">
                        <tr><td colspan="9" class="dp-empty">
                            ⏳ لا توجد معاملات في انتظار الدفع
                        </td></tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- قسم السجل اليومي -->
        <div id="dp-section-history" style="display:none">
            <div id="dp-history-days" class="dp-history-days">
                <div class="dp-empty" style="padding:3rem">📅 اضغط على التبويب لعرض السجل</div>
            </div>
        </div>

    </div>
    `;

    // الـ modals خارج الصفحة لتجنب تعارض CSS
    if (!document.getElementById('dp-issue-modal')) {
        const wrap = document.createElement('div');
        wrap.id = 'dp-modals-root';
        document.body.appendChild(wrap);
        // تُعبأ لاحقاً عند أول فتح
    }
}


async function loadDailyPayments() {
    try {
        const res = await fetch('api/purchase_requests_api.php?action=payment_queue_v2');
        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'فشل تحميل المدفوعات');

        dpTransactions = (data.data || []).map(t => ({
            ...t,
            id: parseInt(t.id),
            pr_id: parseInt(t.pr_id || t.id),
            source: 'purchase_request',
        }));

        dpSelected.clear();
        renderDpRows(dpTransactions);
        updateDpStats();
        updateSelectionUI();
        _dpBuildVendorGroups();
    } catch (e) {
        const tbody = document.getElementById('dp-tbody');
        if (tbody) tbody.innerHTML = `<tr><td colspan="10" class="dp-empty">خطأ في التحميل: ${e.message}</td></tr>`;
    }
}

// ── بناء مجموعات الجهات المستفيدة ──────────
function _dpBuildVendorGroups() {
    const groups = {};
    dpTransactions.forEach(t => {
        const key = t.beneficiary || t.supplier_name || '—';
        if (!groups[key]) groups[key] = [];
        groups[key].push(t);
    });
    window._dpVendorGroups = groups;

    // تحديث فلتر الجهة إن وجد
    const sel = document.getElementById('dp-filter-vendor');
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="">كل الجهات</option>';
    Object.keys(groups).sort().forEach(k => {
        const opt = document.createElement('option');
        opt.value = k; opt.textContent = `${k} (${groups[k].length})`;
        if (k === cur) opt.selected = true;
        sel.appendChild(opt);
    });
}

// ── LEGACY stub: لا يُستخدم لكن لا يكسر الكود القديم ──
async function _legacyLoadDailyPayments_UNUSED() {
    try {
        // ── المعاملات التقليدية ──────────────────────────────
        const res = await fetch('api/daily_payments_api.php?action=get_pending_payments');
        const data = await res.json();
        if (!data.success) throw new Error(data.message);
        let txList = (data.data || []).map(t => ({ ...t, id: parseInt(t.id), source: 'transaction' }));

        // ── طلبات الشراء الجاهزة للدفع ───────────────────────
        try {
            const prRes = await fetch('api/purchase_requests_api.php?action=payment_queue');
            const prData = await prRes.json();
            if (prData.success && prData.data?.length) {
                const prItems = prData.data.map(pr => ({
                    id: pr.id + 1000000,
                    transaction_number: pr.request_number,
                    description: pr.title + (pr.po_number ? ' — PO: ' + pr.po_number : ''),
                    transaction_type: 'طلب شراء',
                    amount: parseFloat(pr.final_amount || pr.amount || 0),
                    currency: pr.currency || 'SAR',
                    amount_sar: parseFloat(pr.final_amount_sar || pr.amount_sar || 0),
                    supplier_name: pr.supplier_name,
                    department_name: pr.department_name,
                    priority: pr.priority || 'normal',
                    sla_pct: 0,
                    ola_pct: 0,
                    source: 'purchase_request',
                    pr_id: pr.id,
                    reservation_number: pr.reservation_number,
                }));
                txList = [...txList, ...prItems];
            }
        } catch (e) {
            console.warn('تعذّر تحميل طلبات الشراء للدفع:', e);
        }

        dpTransactions = txList;
        dpSelected.clear();
        updateDpStats();
        renderDpRows(dpTransactions);
        updateSelectionUI();
    } catch (e) {
        console.error('DP load error:', e);
        document.getElementById('dp-tbody').innerHTML =
            `<tr><td colspan="10" class="dp-empty-row"><span style="color:#ff6b6b">خطأ في التحميل: ${e.message}</span></td></tr>`;
    }
}

// ────────────────────────────────────────────
//  الإحصائيات
// ────────────────────────────────────────────
function updateDpStats() {
    const total = dpTransactions.length;
    const amount = dpTransactions.reduce((s, t) => s + parseFloat(t.amount || 0), 0);
    const breach = dpTransactions.filter(t => (t.sla_pct || 0) >= 100).length;
    const warn = dpTransactions.filter(t => (t.sla_pct || 0) >= 70 && (t.sla_pct || 0) < 100).length;
    const ok = total - breach - warn;

    const _sel = id => document.getElementById(id);
    if (_sel('dps-pending')) _sel('dps-pending').textContent = total;
    const allCurs = dpTransactions.map(t => t.currency || 'SAR');
    const uniqCur = [...new Set(allCurs)];
    const displayCur = uniqCur.length === 1 ? uniqCur[0] : 'SAR';
    if (_sel('dps-amount')) _sel('dps-amount').innerHTML = fmtMoneyCur(amount, displayCur);
    if (_sel('dps-breach')) _sel('dps-breach').textContent = breach;
    if (_sel('dps-warn')) _sel('dps-warn').textContent = warn;
    if (_sel('dps-ok')) _sel('dps-ok').textContent = ok;
    // تحديث badge التبويب
    if (_sel('dp-tab-pending-badge')) _sel('dp-tab-pending-badge').textContent = total;
}

// ────────────────────────────────────────────
//  رسم الصفوف
// ────────────────────────────────────────────
function renderDpRows(list) {
    const tbody = document.getElementById('dp-tbody');
    if (!tbody) return;

    if (!list || list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="dp-empty-row">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".3">
                <circle cx="12" cy="12" r="10"/><path d="M8 12h8M12 8v8"/>
            </svg>
            <span>لا توجد معاملات في انتظار الدفع</span>
        </td></tr>`;
        return;
    }

    tbody.innerHTML = list.map(t => {
        const slaClass = getSlaClass(t.sla_pct);
        const olaClass = getSlaClass(t.ola_pct);
        const checked = dpSelected.has(t.id) ? 'checked' : '';
        const rowClass = dpSelected.has(t.id) ? 'dp-row-selected' : '';
        const priorityBadge = getPriorityBadge(t.priority);
        const slaBadge = buildSlaBadge(t.sla_pct, t.total_elapsed_min, t.sla_allowed_min);
        const olaBadge = buildSlaBadge(t.ola_pct, t.ola_elapsed_min, t.ola_allowed_min, true);
        const amount = parseFloat(t.amount || 0);

        return `
        <tr class="dp-row ${rowClass}" data-id="${t.id}" onclick="toggleDpRow(event, ${t.id})">
            <td class="dp-td-check" onclick="event.stopPropagation()">
                <input type="checkbox" class="dp-checkbox" id="dp-chk-${t.id}"
                    ${checked} onchange="onDpCheckChange(${t.id}, this.checked)">
            </td>
            <td>
                <span class="dp-txn-num">${t.transaction_number || '#' + t.id}</span>
            </td>
            <td>
                <span class="dp-description" title="${t.description || ''}">${truncate(t.description, 45)}</span>
                <div class="dp-sub-info">${t.created_by_name || ''}</div>
            </td>
            <td>
                <span class="dp-type-badge">${t.transaction_type || '—'}${t.sub_type ? ` / ${t.sub_type}` : ''}</span>
            </td>
            <td>
                <span class="dp-amount">${fmtMoneyCur(amount, t.currency || 'SAR')}</span>
            </td>
            <td>${priorityBadge}</td>
            <td>
                <span class="dp-budget-code">${t.budget_code || '—'}</span>
            </td>
            <td>${slaBadge}</td>
            <td>${olaBadge}</td>
            <td>
                <span class="dp-date">${fmtDate(t.transaction_date)}</span>
            </td>
        </tr>`;
    }).join('');
}

// ────────────────────────────────────────────
//  SLA / OLA Helpers
// ────────────────────────────────────────────
function getSlaClass(pct) {
    pct = parseFloat(pct) || 0;
    if (pct >= 100) return 'sla-breach';
    if (pct >= 70) return 'sla-warn';
    return 'sla-ok';
}

function buildSlaBadge(pct, elapsed, allowed, isOla = false) {
    pct = parseFloat(pct) || 0;
    const cls = getSlaClass(pct);
    const label = isOla ? 'OLA' : 'SLA';
    const color = cls === 'sla-breach' ? '#ff6b6b' : cls === 'sla-warn' ? '#ffa94d' : '#69db7c';
    const elapsedH = Math.floor((elapsed || 0) / 60);
    const elapsedM = Math.round((elapsed || 0) % 60);
    const tip = `${elapsedH}س ${elapsedM}د / ${Math.round((allowed || 0) / 60)}س`;

    return `
    <div class="dp-sla-wrap" title="${tip}">
        <div class="dp-sla-bar-track">
            <div class="dp-sla-bar-fill ${cls}" style="width:${Math.min(100, pct)}%"></div>
        </div>
        <span class="dp-sla-pct" style="color:${color}">${pct}%</span>
    </div>`;
}

function getPriorityBadge(p) {
    const map = {
        urgent: '<span class="dp-priority dp-p-urgent">⬆ عاجل</span>',
        high: '<span class="dp-priority dp-p-high">↑ مرتفع</span>',
        normal: '<span class="dp-priority dp-p-normal">عادي</span>',
    };
    return map[p] || map.normal;
}

function truncate(str, n) {
    if (!str) return '—';
    return str.length > n ? str.slice(0, n) + '...' : str;
}

// ────────────────────────────────────────────
//  التحديد
// ────────────────────────────────────────────
function toggleDpRow(e, id) {
    if (e.target.type === 'checkbox') return;
    const chk = document.getElementById(`dp-chk-${id}`);
    if (chk) { chk.checked = !chk.checked; onDpCheckChange(id, chk.checked); }
}

function onDpCheckChange(id, checked) {
    id = parseInt(id);
    checked ? dpSelected.add(id) : dpSelected.delete(id);
    const row = document.querySelector(`tr[data-id="${id}"]`);
    if (row) row.classList.toggle('dp-row-selected', checked);
    updateSelectionUI();
}

function toggleSelectAll(checked) {
    const visible = getFilteredRows();
    visible.forEach(t => {
        checked ? dpSelected.add(t.id) : dpSelected.delete(t.id);
        const chk = document.getElementById(`dp-chk-${t.id}`);
        if (chk) chk.checked = checked;
        const row = document.querySelector(`tr[data-id="${t.id}"]`);
        if (row) row.classList.toggle('dp-row-selected', checked);
    });
    updateSelectionUI();
}

function clearSelection() {
    dpSelected.clear();
    document.querySelectorAll('.dp-checkbox').forEach(c => c.checked = false);
    document.querySelectorAll('.dp-row-selected').forEach(r => r.classList.remove('dp-row-selected'));
    document.getElementById('dp-check-all').checked = false;
    updateSelectionUI();
}

function updateSelectionUI() {
    const count = dpSelected.size;
    const amount = [...dpSelected].reduce((s, id) => {
        const t = dpTransactions.find(x => x.id == id);
        return s + parseFloat(t?.amount || 0);
    }, 0);

    // زر الإصدار الرئيسي
    const btn = document.getElementById('dp-issue-btn');
    if (btn) btn.disabled = count === 0;

    const badge = document.getElementById('dp-sel-badge');
    if (badge) {
        badge.textContent = count;
        badge.style.display = count > 0 ? '' : 'none';
    }

    // شريط الاختيار السفلي
    const bar = document.getElementById('dp-sel-bar');
    if (bar) bar.style.display = count > 0 ? 'flex' : 'none';

    const _sb = document.getElementById('dp-sel-bar-count');
    if (_sb) _sb.textContent = count;
    const selCurrencies = [...dpSelected].map(id => dpTransactions.find(x => x.id == id)?.currency || 'SAR');
    const selCurrency = selCurrencies.every(c => c === selCurrencies[0]) ? selCurrencies[0] : 'mixed';
    const _sba = document.getElementById('dp-sel-bar-amount');
    if (_sba) _sba.innerHTML = selCurrency === 'mixed' ? formatMoneyWithSAR(amount) : fmtMoneyCur(amount, selCurrency);
    const lbl = document.getElementById('dp-sel-label');
    if (lbl) {
        lbl.style.display = count > 0 ? '' : 'none';
        const _sct = document.getElementById('dp-sel-count-txt');
        if (_sct) _sct.textContent = count;
    }
}

// ────────────────────────────────────────────
//  الفلترة
// ────────────────────────────────────────────
function filterDailyPayments() {
    const q = (document.getElementById('dp-search')?.value || '').toLowerCase();
    const pri = document.getElementById('dp-filter-priority')?.value || '';
    const sla = document.getElementById('dp-filter-sla')?.value || '';
    const vendor = document.getElementById('dp-filter-vendor')?.value || '';

    const list = dpTransactions.filter(t => {
        const matchQ = !q ||
            (t.transaction_number || '').toLowerCase().includes(q) ||
            (t.description || '').toLowerCase().includes(q) ||
            (t.beneficiary || t.supplier_name || '').toLowerCase().includes(q) ||
            (t.department_name || '').toLowerCase().includes(q);

        const matchP = !pri || t.priority === pri;

        const pct = parseFloat(t.sla_pct) || 0;
        const matchS = !sla ||
            (sla === 'breach' && pct >= 100) ||
            (sla === 'warn' && pct >= 70 && pct < 100) ||
            (sla === 'ok' && pct < 70);

        const matchV = !vendor ||
            (t.beneficiary || t.supplier_name || '—') === vendor;

        return matchQ && matchP && matchS && matchV;
    });

    renderDpRows(list);
}

function getFilteredRows() {
    const q = (document.getElementById('dp-search')?.value || '').toLowerCase();
    const pri = document.getElementById('dp-filter-priority')?.value || '';
    const sla = document.getElementById('dp-filter-sla')?.value || '';

    return dpTransactions.filter(t => {
        const matchQ = !q ||
            (t.transaction_number || '').toLowerCase().includes(q) ||
            (t.description || '').toLowerCase().includes(q);
        const matchP = !pri || t.priority === pri;
        const pct = parseFloat(t.sla_pct) || 0;
        const matchS = !sla ||
            (sla === 'breach' && pct >= 100) ||
            (sla === 'warn' && pct >= 70 && pct < 100) ||
            (sla === 'ok' && pct < 70);
        return matchQ && matchP && matchS;
    });
}

// ────────────────────────────────────────────
//  Modal: إصدار أمر الدفع
// ────────────────────────────────────────────
async function openIssuePaymentModal() {
    if (dpSelected.size === 0) return;

    const selected = dpTransactions.filter(t => dpSelected.has(t.id));
    const total = selected.reduce((s, t) => s + parseFloat(t.amount_sar || t.amount || 0), 0);

    // ── ملخص ─────────────────────────────────────────────────
    document.getElementById('dp-modal-sub').innerHTML =
        `${selected.length} طلب — إجمالي: ${formatMoneyWithSAR(total)}`;

    // ── جدول معاينة مع تجميع بالجهة ─────────────────────────
    const byVendor = {};
    selected.forEach(t => {
        const v = t.beneficiary || t.supplier_name || '—';
        if (!byVendor[v]) byVendor[v] = [];
        byVendor[v].push(t);
    });

    let previewRows = '';
    Object.entries(byVendor).forEach(([vendor, items]) => {
        const vTotal = items.reduce((s, t) => s + parseFloat(t.amount_sar || t.amount || 0), 0);
        previewRows += `
            <tr style="background:var(--color-background-secondary)">
                <td colspan="4" style="font-weight:600;padding:6px 10px;font-size:.82rem">
                    🏢 ${vendor}
                    <span style="font-weight:400;color:var(--color-text-secondary);margin-right:8px">${items.length} طلب</span>
                </td>
                <td style="font-weight:700;text-align:left;padding:6px 10px;direction:ltr">${formatMoneyWithSAR(vTotal)}</td>
            </tr>`;
        items.forEach(t => {
            previewRows += `
                <tr>
                    <td style="padding:4px 10px 4px 24px;color:var(--color-text-secondary);font-size:.78rem">${t.transaction_number || '#' + t.id}</td>
                    <td style="font-size:.8rem">${truncate(t.description, 38)}</td>
                    <td style="font-size:.78rem">${t.department_name || '—'}</td>
                    <td>${getPriorityBadge(t.priority)}</td>
                    <td style="text-align:left;direction:ltr;font-size:.8rem">${fmtMoneyCur(parseFloat(t.amount || 0), t.currency || 'SAR')}</td>
                </tr>`;
        });
    });

    document.getElementById('dp-preview-table').innerHTML = `
        <div class="dp-preview-title">المعاملات المحددة — مجمّعة حسب الجهة</div>
        <table class="dp-preview-tbl">
            <thead><tr>
                <th>الرقم</th><th>الوصف</th><th>الإدارة</th><th>الأولوية</th><th>المبلغ</th>
            </tr></thead>
            <tbody>${previewRows}</tbody>
            <tfoot><tr>
                <td colspan="4" style="font-weight:700;text-align:right">الإجمالي الكلي</td>
                <td style="font-weight:800;color:var(--accent-green);text-align:left;direction:ltr">${formatMoneyWithSAR(total)}</td>
            </tr></tfoot>
        </table>`;

    // ── تحقق من الرصيد البنكي ────────────────────────────────
    const balanceBar = document.getElementById('dp-balance-bar');
    try {
        const bRes = await fetch(`api/purchase_requests_api.php?action=check_bank_balance&total=${encodeURIComponent(total)}`);
        const bData = await bRes.json();
        if (bData.success && balanceBar) {
            const sufficient = bData.sufficient;
            const deficit = bData.deficit;
            balanceBar.style.display = '';
            balanceBar.className = `dp-balance-bar ${sufficient ? 'dp-balance-ok' : 'dp-balance-warn'}`;
            balanceBar.innerHTML = sufficient
                ? `<span>✅ الرصيد كافٍ — حساب: <strong>${bData.account_name}</strong> | الرصيد: <strong>${formatMoneyWithSAR(bData.balance)}</strong> | المطلوب: <strong>${formatMoneyWithSAR(total)}</strong></span>`
                : `<span>⚠️ تحذير: رصيد <strong>${bData.account_name}</strong> غير كافٍ — العجز: <strong>${formatMoneyWithSAR(deficit)}</strong> | الرصيد الحالي: ${formatMoneyWithSAR(bData.balance)}</span>`;
            // حفظ account_id للاستخدام عند التأكيد
            document.getElementById('dp-issue-modal').dataset.bankAccountId = bData.account_id || 0;
        }
    } catch (_) {
        if (balanceBar) balanceBar.style.display = 'none';
    }

    const modal = document.getElementById('dp-issue-modal');
    modal.style.display = 'flex';
    requestAnimationFrame(() => modal.classList.add('dp-modal-visible'));
}

function closeIssueModal() {
    const modal = document.getElementById('dp-issue-modal');
    modal.classList.remove('dp-modal-visible');
    setTimeout(() => modal.style.display = 'none', 200);
}

// ────────────────────────────────────────────
//  تأكيد إصدار أمر الدفع — batch موحّد
// ────────────────────────────────────────────
async function confirmPaymentOrder() {
    const btn = document.getElementById('dp-confirm-btn');
    const notes = (document.getElementById('dp-order-notes') || {}).value || '';
    const ref = (document.getElementById('dp-order-ref') || {}).value || '';
    const method = (document.getElementById('dp-order-method') || {}).value || 'تحويل بنكي';
    const modal = document.getElementById('dp-issue-modal');
    const bankAccountId = parseInt(modal?.dataset?.bankAccountId || 0);

    const selected = dpTransactions.filter(t => dpSelected.has(t.id));
    if (!selected.length) return;

    btn.disabled = true;
    btn.textContent = '⏳ جاري التنفيذ...';

    try {
        const prIds = selected.map(t => t.pr_id || t.id);

        const res = await fetch('api/purchase_requests_api.php?action=execute_batch_payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pr_ids: prIds, method, ref, notes, bank_account_id: bankAccountId }),
        });
        const data = await res.json();

        if (!data.success) {
            if (data.balance_error) {
                const balBar = document.getElementById('dp-balance-bar');
                if (balBar) {
                    balBar.style.display = '';
                    balBar.className = 'dp-balance-bar dp-balance-warn';
                    balBar.innerHTML = `⚠️ رصيد غير كافٍ — العجز: <strong>${formatMoneyWithSAR(data.deficit)}</strong>`;
                }
                return;
            }
            throw new Error(data.message || 'فشل الإصدار');
        }

        // ── نجاح: تحديث الواجهة ──────────────────────────────
        const successIds = new Set(data.details.map(d => parseInt(d.id)));
        dpTransactions = dpTransactions.filter(t => !successIds.has(parseInt(t.pr_id || t.id)));
        dpSelected.clear();
        renderDpRows(dpTransactions);
        updateDpStats();
        updateSelectionUI();
        _dpBuildVendorGroups();
        closeIssueModal();

        dpLastOrder = data;
        showPaymentOrderModal(data);

        // ── حفظ أمر الدفع كمرفق لكل طلب (في الخلفية) ────────
        _dpSaveOrderAttachments(data);

        setTimeout(loadDailyPayments, 1500);

        if (data.failed > 0) {
            const failMsgs = (data.failed_details || []).map(f => `#${f.id}: ${f.reason}`).join('\n');
            alert(`اكتمل جزئياً — ${data.updated} ناجح، ${data.failed} فشل:\n${failMsgs}`);
        }

    } catch (e) {
        alert('خطأ: ' + e.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> تأكيد الإصدار`;
    }
}

// ────────────────────────────────────────────
//  حفظ أمر الدفع كمرفق لكل طلب (خلفية)
// ────────────────────────────────────────────
async function _dpSaveOrderAttachments(orderData) {
    if (!orderData?.details?.length) return;

    const htmlContent = document.getElementById('dp-printable-content')?.innerHTML || '';
    const orderRef = orderData.order_ref || '';

    for (const detail of orderData.details) {
        const prId = detail.id;
        const amount = parseFloat(detail.amount_sar || detail.amount || 0);

        try {
            await fetch('api/purchase_requests_api.php?action=save_payment_attachment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pr_id: prId,
                    order_ref: orderRef,
                    html_content: htmlContent,
                    amount: amount,
                }),
            });
        } catch (e) {
            console.warn(`تعذّر حفظ المرفق للطلب #${prId}:`, e.message);
        }
    }
}
function calcOrderTotal(details) {
    if (!details || !details.length) return { amount: 0, currency: 'SAR', isMixed: false };
    const currencies = [...new Set(details.map(t => t.currency || 'SAR'))];
    const isMixed = currencies.length > 1;
    if (isMixed) {
        // مجموع بالريال
        const total = details.reduce((s, t) => s + parseFloat(t.amount_sar || t.amount || 0), 0);
        return { amount: total, currency: 'SAR', isMixed: true };
    } else {
        const total = details.reduce((s, t) => s + parseFloat(t.amount || 0), 0);
        return { amount: total, currency: currencies[0], isMixed: false };
    }
}

function showPaymentOrderModal(data) {
    const rows = (data.details || []).map((t, i) => `
        <tr>
            <td style="text-align:center;color:#666;font-size:.8rem">${i + 1}</td>
            <td style="font-weight:600;color:#1a1a2e;white-space:nowrap">${t.transaction_number || '#' + t.id}</td>
            <td style="max-width:200px">${t.description || '—'}</td>
            <td><span style="background:#f0f4ff;color:#3b5bdb;padding:2px 8px;border-radius:4px;font-size:.78rem">${t.transaction_type || '—'}</span></td>
            <td style="font-family:monospace;color:#555">${t.budget_code || '—'}</td>
            <td style="text-align:left;font-weight:700;font-variant-numeric:tabular-nums;direction:ltr;white-space:nowrap;color:#2b8a3e">${fmtMoneyCur(parseFloat(t.amount || 0), t.currency || 'SAR')}</td>
        </tr>
    `).join('');

    const now = new Date(data.issued_at || Date.now());
    const dateStr = now.toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr = now.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });

    document.getElementById('dp-printable-content').innerHTML = `
        <!-- رأس الوثيقة -->
        <div style="display:flex;flex-direction:row;justify-content:space-between;align-items:center;padding-bottom:18px;margin-bottom:22px;border-bottom:3px solid #1a1a2e;direction:rtl;unicode-bidi:embed">
            <div style="direction:rtl">
                <div style="font-size:1.7rem;font-weight:900;color:#1a1a2e;direction:rtl">أمر دفع يومي</div>
                <div style="font-size:.85rem;color:#666;margin-top:3px;font-family:monospace;direction:ltr;text-align:right">${data.order_ref}</div>
            </div>
            <div style="text-align:left;direction:ltr">
                <div style="font-size:1.8rem">⚡</div>
                <div style="font-size:.8rem;font-weight:700;color:#444;margin-top:2px">نظام إدارة المعاملات المالية</div>
            </div>
        </div>

        <!-- بيانات الأمر — شبكة 3 × 2 -->
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:22px">
            <div style="padding:10px 14px;border:1px solid #e0e0e0;border-radius:8px;background:#fafafa">
                <div style="font-size:.68rem;color:#888;margin-bottom:3px">تاريخ الإصدار</div>
                <div style="font-weight:700;font-size:.92rem">${dateStr}</div>
            </div>
            <div style="padding:10px 14px;border:1px solid #e0e0e0;border-radius:8px;background:#fafafa">
                <div style="font-size:.68rem;color:#888;margin-bottom:3px">وقت الإصدار</div>
                <div style="font-weight:700;font-size:.92rem">${timeStr}</div>
            </div>
            <div style="padding:10px 14px;border:1px solid #e0e0e0;border-radius:8px;background:#fafafa">
                <div style="font-size:.68rem;color:#888;margin-bottom:3px">طريقة الدفع</div>
                <div style="font-weight:700;font-size:.92rem">${data.method || 'تحويل بنكي'}</div>
            </div>
            <div style="padding:10px 14px;border:1px solid #e0e0e0;border-radius:8px;background:#fafafa">
                <div style="font-size:.68rem;color:#888;margin-bottom:3px">صادر بواسطة</div>
                <div style="font-weight:700;font-size:.92rem">${data.issued_by || '—'}</div>
            </div>
            <div style="padding:10px 14px;border:1px solid #e0e0e0;border-radius:8px;background:#fafafa">
                <div style="font-size:.68rem;color:#888;margin-bottom:3px">عدد المعاملات</div>
                <div style="font-weight:700;font-size:.92rem">${data.updated || (data.details || []).length} معاملة</div>
            </div>
            <div style="padding:10px 14px;border:2px solid #40c057;border-radius:8px;background:#f0fdf4">
                <div style="font-size:.68rem;color:#2b8a3e;margin-bottom:3px">إجمالي المبلغ</div>
                <div style="font-weight:800;font-size:1rem;color:#2b8a3e;direction:ltr;text-align:left">${(() => { const o = calcOrderTotal(data.details); return fmtMoneyCur(o.amount, o.currency) + (o.isMixed ? ' <span style="font-size:.65rem;color:#888">(ريال)</span>' : ''); })()}</div>
            </div>
        </div>

        <!-- جدول المعاملات -->
        <table style="width:100%;border-collapse:collapse;margin-bottom:28px;font-size:.82rem">
            <thead>
                <tr style="background:#1a1a2e;color:#fff;direction:rtl">
                    <th style="padding:9px 10px;text-align:center;width:36px;font-weight:600;background:#1a1a2e;color:#fff">#</th>
                    <th style="padding:9px 10px;text-align:right;font-weight:600;background:#1a1a2e;color:#fff">رقم المعاملة</th>
                    <th style="padding:9px 10px;text-align:right;font-weight:600;background:#1a1a2e;color:#fff">الوصف</th>
                    <th style="padding:9px 10px;text-align:right;font-weight:600;background:#1a1a2e;color:#fff">النوع</th>
                    <th style="padding:9px 10px;text-align:right;font-weight:600;background:#1a1a2e;color:#fff">رمز الموازنة</th>
                    <th style="padding:9px 10px;text-align:left;font-weight:600;background:#1a1a2e;color:#fff">المبلغ</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
            <tfoot>
                <tr style="background:#f8f9fa;border-top:2px solid #1a1a2e">
                    <td colspan="5" style="padding:10px;text-align:right;font-weight:800;font-size:.88rem">الإجمالي الكلي</td>
                    <td style="padding:10px;text-align:left;font-weight:800;font-size:.95rem;color:#2b8a3e;direction:ltr">${(() => { const o = calcOrderTotal(data.details); return fmtMoneyCur(o.amount, o.currency); })()}</td>
                </tr>
            </tfoot>
        </table>

        <!-- التوقيعات -->
        <div style="display:flex;gap:20px;margin-bottom:28px">
            <div style="flex:1;text-align:center;border:1px solid #ddd;border-radius:8px;padding:14px 10px 10px">
                <div style="height:48px;border-bottom:1px solid #aaa;margin-bottom:8px"></div>
                <div style="font-size:.8rem;font-weight:700;color:#333">محضّر الأمر</div>
                <div style="font-size:.78rem;color:#555;margin-top:3px">${data.issued_by || ''}</div>
            </div>
            <div style="flex:1;text-align:center;border:1px solid #ddd;border-radius:8px;padding:14px 10px 10px">
                <div style="height:48px;border-bottom:1px solid #aaa;margin-bottom:8px"></div>
                <div style="font-size:.8rem;font-weight:700;color:#333">المراجع</div>
                <div style="font-size:.78rem;color:#555;margin-top:3px">${data.signer_reviewer || ''}</div>
            </div>
            <div style="flex:1;text-align:center;border:1px solid #ddd;border-radius:8px;padding:14px 10px 10px">
                <div style="height:48px;border-bottom:1px solid #aaa;margin-bottom:8px"></div>
                <div style="font-size:.8rem;font-weight:700;color:#333">المعتمد</div>
                <div style="font-size:.78rem;color:#555;margin-top:3px">${data.signer_approver || ''}</div>
            </div>
        </div>

        <!-- تذييل -->
        <div style="display:flex;justify-content:space-between;font-size:.68rem;color:#999;border-top:1px solid #eee;padding-top:8px">
            <span>رقم المرجع: ${data.order_ref}</span>
            <span>تم إصداره بتاريخ ${dateStr}</span>
            <span>نظام إدارة المعاملات المالية</span>
        </div>
    `;

    const modal = document.getElementById('dp-order-modal');
    modal.style.display = 'flex';
    requestAnimationFrame(() => modal.classList.add('dp-modal-visible'));
}

function closeOrderModal() {
    const modal = document.getElementById('dp-order-modal');
    modal.classList.remove('dp-modal-visible');
    setTimeout(() => modal.style.display = 'none', 200);
}


// ── CSS مشترك لأوامر الدفع ───────────────────────────────────
function _getDpPrintCSS() {
    return `
        @font-face {
            font-family: 'saudi_riyal';
            src: url('https://cdn.jsdelivr.net/npm/@emran-alhaddad/saudi-riyal-font/fonts/saudi_riyal.woff2') format('woff2');
        }
        .sar-symbol::before { content:"\\e900"; font-family:'saudi_riyal' !important; font-style:normal; }
        body { padding: 24px 28px; font-size: 12px; color: #111; }
        table { width:100%; border-collapse:collapse; }
        th, td { border:1px solid #ddd; padding:8px 10px; text-align:right; }
        th { background:#1a1a2e !important; color:#fff !important; font-weight:600; }
        td[style*="text-align:left"] { text-align:left; }
    `;
}

function printOrder() {
    const el = document.getElementById('dp-printable-content');
    if (!el || !el.innerHTML.trim()) return;
    PdfEngine.fromHTML(el.innerHTML, 'امر-دفع.pdf', _getDpPrintCSS());
}

function downloadOrderPDF() {
    const el = document.getElementById('dp-printable-content');
    if (!el || !el.innerHTML.trim()) {
        if (typeof showToast === 'function') showToast('لا يوجد محتوى للتحميل', 'error');
        return;
    }
    const orderRef = (typeof dpLastOrder !== 'undefined' && dpLastOrder && dpLastOrder.order_ref)
        ? dpLastOrder.order_ref : 'order';
    PdfEngine.fromHTML(el.innerHTML, 'امر-دفع-' + orderRef + '.pdf', _getDpPrintCSS());
}

// ────────────────────────────────────────────
//  fmtDate helper (إذا لم يكن معرفاً خارجياً)
// ────────────────────────────────────────────
function fmtDate(d) {
    if (!d) return '—';
    const dt = new Date(d);
    if (isNaN(dt)) return d;
    return dt.toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' });
}

// fmtMoney / formatMoneyWithSAR — fallback إذا لم تُحمّل app-common.js
if (typeof fmtMoney === 'undefined') {
    window.fmtMoney = n => (parseFloat(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
if (typeof formatMoneyWithSAR === 'undefined') {
    window.formatMoneyWithSAR = n => fmtMoney(n) + ' <span class="sar-symbol"></span>';
}

// ════════════════════════════════════════════════════════════
//  سجل أوامر الدفع السابقة
// ════════════════════════════════════════════════════════════
function openPaymentHistory() {
    const modal = document.getElementById('dp-history-modal');
    if (!modal) return;
    // تعيين التواريخ الافتراضية (أول الشهر → اليوم)
    const today = new Date().toISOString().slice(0, 10);
    const firstDay = today.slice(0, 8) + '01';
    document.getElementById('dp-hist-from').value = firstDay;
    document.getElementById('dp-hist-to').value = today;
    document.getElementById('dp-hist-ref').value = '';
    modal.style.display = 'flex';
    requestAnimationFrame(() => modal.classList.add('dp-modal-visible'));
}

function closeHistoryModal() {
    const modal = document.getElementById('dp-history-modal');
    modal.classList.remove('dp-modal-visible');
    setTimeout(() => modal.style.display = 'none', 200);
}

async function loadPaymentHistory() {
    const from = document.getElementById('dp-hist-from').value;
    const to = document.getElementById('dp-hist-to').value;
    const ref = document.getElementById('dp-hist-ref').value.trim();
    const el = document.getElementById('dp-hist-results');
    el.innerHTML = '<div class="dp-loading"><div class="dp-spinner"></div><span>جاري البحث...</span></div>';

    try {
        let url = `api/?action=get_payment_orders_history&date_from=${from}&date_to=${to}`;
        if (ref) url += `&order_ref=${encodeURIComponent(ref)}`;
        const res = await fetch(url);
        const data = await res.json();
        if (!data.success) throw new Error(data.message);
        renderHistoryResults(data.data || []);
    } catch (e) {
        el.innerHTML = `<div class="dp-empty-row" style="color:#ff6b6b">${e.message}</div>`;
    }
}

function renderHistoryResults(orders) {
    const el = document.getElementById('dp-hist-results');
    if (!orders.length) {
        el.innerHTML = '<div class="dp-empty-row" style="padding:2rem;text-align:center;color:var(--text-muted)">لا توجد نتائج</div>';
        return;
    }
    el.innerHTML = `
        <table class="dp-table" style="min-width:unset">
            <thead><tr>
                <th>رقم الأمر</th>
                <th>التاريخ</th>
                <th>طريقة الدفع</th>
                <th>عدد المعاملات</th>
                <th>إجمالي المبلغ</th>
                <th>صادر بواسطة</th>
                <th></th>
            </tr></thead>
            <tbody>
                ${orders.map(o => `
                <tr class="dp-row">
                    <td><span class="dp-txn-num">${o.order_ref}</span></td>
                    <td><span class="dp-date">${fmtDate(o.payment_date)}</span></td>
                    <td><span class="dp-type-badge">${o.payment_method || '—'}</span></td>
                    <td style="text-align:center;font-weight:700">${o.txn_count}</td>
                    <td><span class="dp-amount">
                        ${o.is_mixed_currency == 1
            ? formatMoneyWithSAR(o.total_amount_sar || o.total_amount_raw || 0) + ' <small style="color:var(--text-muted);font-size:.7rem">(متعدد)</small>'
            : fmtMoneyCur(o.total_amount_raw || o.total_amount_sar || 0, o.currency || 'SAR')
        }
                    </span></td>
                    <td><span style="font-size:.8rem;color:var(--text-muted)">${o.issued_by || '—'}</span></td>
                    <td>
                        <button class="dp-btn dp-btn-ghost" style="padding:.3rem .7rem;font-size:.75rem"
                            onclick="viewHistoryOrder('${o.order_ref}')">
                            عرض
                        </button>
                    </td>
                </tr>`).join('')}
            </tbody>
        </table>
        <div style="font-size:.75rem;color:var(--text-muted);padding:.5rem 0;text-align:left">
            ${orders.length} نتيجة — إجمالي: ${formatMoneyWithSAR(orders.reduce((s, o) => s + parseFloat(o.total_amount_sar || o.total_amount_raw || 0), 0))}
        </div>
    `;
}

async function viewHistoryOrder(ref) {
    try {
        const res = await fetch(`api/?action=get_payment_order_details&ref=${encodeURIComponent(ref)}`);
        const data = await res.json();
        if (!data.success) throw new Error(data.message);
        const rows = data.details || data.data || [];
        if (!rows.length) { alert('لا توجد بيانات'); return; }
        const first = rows[0];
        closeHistoryModal();
        // أعد استخدام modal أمر الدفع
        dpLastOrder = {
            order_ref: ref,
            updated: rows.length,
            failed: 0,
            details: rows,
            total_amount: data.total_amount,
            issued_by: first.issued_by || '—',
            issued_at: first.payment_date,
            method: first.payment_method || '—',
        };
        showPaymentOrderModal(dpLastOrder);
    } catch (e) {
        alert('خطأ: ' + e.message);
    }
}

// ══════════════════════════════════════════════════════════
//  التبويب + السجل اليومي + رفع الإيصالات
// ══════════════════════════════════════════════════════════

function dpSwitchTab(tab) {
    const p = tab === 'pending';
    ['dp-section-pending', 'dp-stats-row'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = p ? '' : 'none';
    });
    const sh = document.getElementById('dp-section-history');
    if (sh) sh.style.display = p ? 'none' : '';
    document.getElementById('dp-tab-pending')?.classList.toggle('dp-tab-active', p);
    document.getElementById('dp-tab-history')?.classList.toggle('dp-tab-active', !p);
    if (!p) dpLoadHistory();
}

async function dpLoadHistory() {
    const c = document.getElementById('dp-history-days');
    if (!c) return;
    c.innerHTML = '<div class="dp-empty" style="padding:3rem">📅 جارٍ التحميل...</div>';
    try {
        const res = await fetch('api/daily_payments_api.php?action=get_orders_by_day&days=30');
        const d = await res.json();
        if (!d.success) throw new Error(d.message);
        const byDay = d.data || {};
        const days = Object.keys(byDay);
        if (!days.length) {
            c.innerHTML = '<div class="dp-empty" style="padding:3rem">📅 لا توجد مدفوعات مسجّلة</div>';
            return;
        }
        const today = new Date().toISOString().slice(0, 10);
        const yest = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

        c.innerHTML = days.map(day => {
            const orders = byDay[day];
            const tot = orders.reduce((s, o) => s + parseFloat(o.total_amount || 0), 0);
            const lbl = day === today ? 'اليوم' : day === yest ? 'أمس' :
                new Date(day + 'T12:00').toLocaleDateString('ar-SA',
                    { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

            const ordH = orders.map(o => {
                const sid = _dpSafeId(o.order_ref);
                const amt = parseFloat(o.total_amount || 0);
                const fmtAmt = amt.toLocaleString('ar-SA', { minimumFractionDigits: 2 }) + ' <span class="sar-symbol" aria-label="ريال سعودي"></span>';
                return `<div class="dp-day-order">
                    <div class="dp-day-order-header">
                        <div class="dp-day-order-ref">🧾 ${o.order_ref || '—'}</div>
                        <div class="dp-day-order-meta">
                            <span>${o.txn_count || 0} طلب</span>
                            <span class="dp-meta-dot"></span>
                            <span>${o.payment_method || 'تحويل بنكي'}</span>
                            ${o.issued_by ? `<span class="dp-meta-dot"></span><span>${o.issued_by}</span>` : ''}
                            ${o.issued_at ? `<span class="dp-meta-dot"></span><span style="font-family:monospace;font-size:.74rem">${o.issued_at.slice(11, 16)}</span>` : ''}
                        </div>
                        <div class="dp-day-order-amount">${fmtAmt}</div>
                    </div>
                    <div class="dp-receipts-section" id="dp-receipts-${sid}"></div>
                    <div class="dp-receipt-upload">
                        <input type="text" class="dp-receipt-name" id="dp-rlabel-${sid}" placeholder="تسمية الإيصال">
                        <label class="dp-receipt-file-btn">
                            📎 رفع إيصال (أو أكثر)
                            <input type="file" hidden multiple accept=".pdf,.jpg,.jpeg,.png,.webp" onchange="dpUploadReceipt(this,'${o.order_ref}')">
                        </label>
                    </div>
                </div>`;
            }).join('');

            return `<div class="dp-day-block">
                <div class="dp-day-header">
                    <div class="dp-day-label">${lbl}</div>
                    <div class="dp-day-date">${day}</div>
                    <div class="dp-day-total">${tot.toLocaleString('ar-SA', { minimumFractionDigits: 2 })} <span class="sar-symbol" aria-label="ريال سعودي"></span></div>
                    <div class="dp-day-count">${orders.length} أمر</div>
                </div>
                ${ordH}
            </div>`;
        }).join('');

        // تحميل الإيصالات
        for (const day of days)
            for (const o of byDay[day])
                dpLoadReceipts(o.order_ref);

    } catch (e) {
        c.innerHTML = `<div class="dp-empty" style="padding:3rem">خطأ: ${e.message}</div>`;
    }
}

function _dpSafeId(r) { return (r || '').replace(/[^a-zA-Z0-9]/g, '_'); }

async function dpLoadReceipts(orderRef) {
    const c = document.getElementById('dp-receipts-' + _dpSafeId(orderRef));
    if (!c) return;
    try {
        const res = await fetch('api/daily_payments_api.php?action=get_order_attachments&order_ref=' + encodeURIComponent(orderRef));
        const d = await res.json();
        const atts = d.data || [];
        if (!atts.length) {
            c.innerHTML = '<div class="dp-receipts-empty">لا توجد إيصالات مرفقة</div>';
            return;
        }
        c.innerHTML = atts.map(a => `
            <div class="dp-receipt-item">
                <div class="dp-receipt-icon">${a.file_type && a.file_type.includes('pdf') ? '📕' : '🖼️'}</div>
                <div class="dp-receipt-info">
                    <div class="dp-receipt-name2">${a.file_label || a.original_name}</div>
                    <div class="dp-receipt-meta">${a.original_name} · ${a.file_size > 1048576 ? (a.file_size / 1048576).toFixed(1) + ' MB' : (a.file_size / 1024 | 0) + ' KB'} · ${a.uploader_name || ''}</div>
                </div>
                <div class="dp-receipt-actions">
                    <a href="${a.file_path}" target="_blank" class="dp-receipt-open">فتح</a>
                    ${parseInt(a.linked_count) > 0
                ? `<span class="dp-receipt-linked" title="مرتبط بـ ${a.linked_count} طلب">✅</span>`
                : `<button class="dp-receipt-link" onclick="dpLinkReceiptToPr(${a.id},'${orderRef}')" title="ربط بالطلب">🔗 ربط</button>`
            }
                    <button class="dp-receipt-del" onclick="dpDeleteReceipt(${a.id},'${_dpSafeId(orderRef)}','${orderRef.replace(/'/g, "\\'")}')">🗑</button>
                </div>
            </div>`).join('');
    } catch (e) { c.innerHTML = '<div class="dp-receipts-empty">خطأ في التحميل</div>'; }
}

async function dpUploadReceipt(input, orderRef) {
    const files = [...(input.files || [])];
    if (!files.length) return;

    const li = document.getElementById('dp-rlabel-' + _dpSafeId(orderRef));
    const label = li?.value?.trim() || '';
    const btn = input.closest('label');
    if (btn) btn.textContent = `⏳ جارٍ رفع ${files.length} ملف...`;
    input.disabled = true;

    let uploaded = 0, failed = 0;
    for (const file of files) {
        const fd = new FormData();
        fd.append('order_ref', orderRef);
        // اسم الملف يُعطى من حقل التسمية، أو يُترك فارغاً ليُولَّد تلقائياً من الـ API
        fd.append('label', label || file.name);
        fd.append('file', file);
        try {
            const res = await fetch('api/daily_payments_api.php?action=upload_order_attachment', { method: 'POST', body: fd });
            const d = await res.json();
            if (d.success) uploaded++;
            else { failed++; console.warn('فشل رفع ' + file.name + ':', d.message); }
        } catch (e) { failed++; }
    }

    if (li) li.value = '';
    input.value = '';
    input.disabled = false;
    if (btn) btn.innerHTML = '📎 رفع إيصال (أو أكثر)<input type="file" hidden multiple accept=".pdf,.jpg,.jpeg,.png,.webp" onchange="dpUploadReceipt(this,\'' + orderRef + '\'">';

    await dpLoadReceipts(orderRef);
    const msg = failed > 0
        ? `رُفع ${uploaded} — فشل ${failed}`
        : `✅ تم رفع ${uploaded} ملف`;
    if (typeof showToast === 'function') showToast(msg, failed > 0 ? 'warning' : 'success');
}

async function dpDeleteReceipt(attId, safeRef, orderRef) {
    if (!confirm('هل تريد حذف هذا الإيصال؟')) return;
    try {
        const res = await fetch('api/daily_payments_api.php?action=delete_order_attachment',
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: attId }) });
        const d = await res.json();
        if (d.success) await dpLoadReceipts(orderRef);
        else alert('خطأ: ' + d.message);
    } catch (e) { alert('خطأ: ' + e.message); }
}

async function dpLinkReceiptToPr(attId, orderRef) {
    try {
        const res = await fetch('api/daily_payments_api.php?action=link_receipt_to_pr', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ attachment_id: attId, order_ref: orderRef }),
        });
        const d = await res.json();
        if (d.success) {
            const msg = d.message || (d.linked_count > 0 ? `✅ تم الربط` : '⚠️ لم يُعثر على طلبات');
            if (typeof showToast === 'function') showToast(msg, d.linked_count > 0 ? 'success' : 'warning');
            else alert(msg);
        } else {
            alert('خطأ: ' + d.message);
        }
    } catch (e) { alert('خطأ: ' + e.message); }
}