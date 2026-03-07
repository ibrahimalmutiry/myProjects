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

        <!-- Header -->
        <div class="dp-topbar">
            <div class="dp-topbar-left">
                <div class="dp-page-title">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="2" y="5" width="20" height="14" rx="2"/>
                        <line x1="2" y1="10" x2="22" y2="10"/>
                    </svg>
                    المدفوعات اليومية
                </div>
                <div class="dp-date-badge" id="dp-date-badge">
                    ${new Date().toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </div>
            </div>
            <div class="dp-topbar-right">
                <button class="dp-btn dp-btn-ghost" onclick="loadDailyPayments()" title="تحديث">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                    </svg>
                </button>
                <button class="dp-btn dp-btn-ghost" onclick="openPaymentHistory()" title="سجل أوامر الدفع السابقة">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                        <line x1="16" y1="13" x2="8" y2="13"/>
                        <line x1="16" y1="17" x2="8" y2="17"/>
                    </svg>
                    السجل السابق
                </button>
                <button class="dp-btn dp-btn-primary" id="dp-issue-btn" onclick="openIssuePaymentModal()" disabled>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 5v14M5 12h14"/>
                    </svg>
                    إصدار أمر الدفع
                    <span class="dp-sel-count" id="dp-sel-badge" style="display:none">0</span>
                </button>
            </div>
        </div>

        <!-- Stats Row -->
        <div class="dp-stats-row" id="dp-stats-row">
            <div class="dp-stat-card dp-stat-pending">
                <div class="dp-stat-icon">⏳</div>
                <div><div class="dp-stat-val" id="dps-pending">—</div><div class="dp-stat-lbl">في الانتظار</div></div>
            </div>
            <div class="dp-stat-card dp-stat-amount">
                <div class="dp-stat-icon">💰</div>
                <div><div class="dp-stat-val" id="dps-amount">—</div><div class="dp-stat-lbl">إجمالي المبالغ</div></div>
            </div>
            <div class="dp-stat-card dp-stat-breach">
                <div class="dp-stat-icon">🔴</div>
                <div><div class="dp-stat-val" id="dps-breach">—</div><div class="dp-stat-lbl">تجاوزت SLA</div></div>
            </div>
            <div class="dp-stat-card dp-stat-warn">
                <div class="dp-stat-icon">🟡</div>
                <div><div class="dp-stat-val" id="dps-warn">—</div><div class="dp-stat-lbl">تحذير SLA</div></div>
            </div>
            <div class="dp-stat-card dp-stat-ok">
                <div class="dp-stat-icon">🟢</div>
                <div><div class="dp-stat-val" id="dps-ok">—</div><div class="dp-stat-lbl">ضمن الوقت</div></div>
            </div>
        </div>

        <!-- Toolbar -->
        <div class="dp-toolbar">
            <div class="dp-toolbar-right">
                <div class="dp-search-wrap">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                    </svg>
                    <input type="text" id="dp-search" placeholder="بحث في المعاملات..." oninput="filterDailyPayments()">
                </div>
                <select class="dp-select" id="dp-filter-priority" onchange="filterDailyPayments()">
                    <option value="">كل الأولويات</option>
                    <option value="urgent">عاجل 🔴</option>
                    <option value="high">مرتفع 🟠</option>
                    <option value="normal">عادي</option>
                </select>
                <select class="dp-select" id="dp-filter-sla" onchange="filterDailyPayments()">
                    <option value="">كل الحالات</option>
                    <option value="breach">تجاوز SLA</option>
                    <option value="warn">تحذير</option>
                    <option value="ok">ضمن الوقت</option>
                </select>
            </div>
            <div class="dp-toolbar-left">
                <label class="dp-check-all-wrap">
                    <input type="checkbox" id="dp-check-all" onchange="toggleSelectAll(this.checked)">
                    <span>تحديد الكل</span>
                </label>
                <span class="dp-sel-label" id="dp-sel-label" style="display:none">
                    تم تحديد <strong id="dp-sel-count-txt">0</strong> معاملة
                </span>
            </div>
        </div>

        <!-- Table -->
        <div class="dp-table-wrap">
            <table class="dp-table">
                <thead>
                    <tr>
                        <th class="dp-th-check"></th>
                        <th>رقم المعاملة</th>
                        <th>الوصف</th>
                        <th>النوع</th>
                        <th>المبلغ</th>
                        <th>الأولوية</th>
                        <th>رمز الموازنة</th>
                        <th>SLA</th>
                        <th>OLA (مرحلة الدفع)</th>
                        <th>التاريخ</th>
                    </tr>
                </thead>
                <tbody id="dp-tbody">
                    <tr><td colspan="10" class="dp-empty-row">
                        <div class="dp-loading">
                            <div class="dp-spinner"></div>
                            <span>جاري التحميل...</span>
                        </div>
                    </td></tr>
                </tbody>
            </table>
        </div>

        <!-- Selected Summary Bar -->
        <div class="dp-sel-bar" id="dp-sel-bar" style="display:none">
            <div class="dp-sel-bar-info">
                <strong id="dp-sel-bar-count">0</strong> معاملة محددة
                &nbsp;|&nbsp;
                الإجمالي: <strong id="dp-sel-bar-amount">0</strong> ر.س
            </div>
            <div class="dp-sel-bar-actions">
                <button class="dp-btn dp-btn-ghost" onclick="clearSelection()">إلغاء التحديد</button>
                <button class="dp-btn dp-btn-primary" onclick="openIssuePaymentModal()">
                    إصدار أمر الدفع
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="m9 18 6-6-6-6"/>
                    </svg>
                </button>
            </div>
        </div>

    </div>

    <!-- Modal: إصدار أمر الدفع -->
    <div class="dp-modal-overlay" id="dp-issue-modal" style="display:none">
        <div class="dp-modal">
            <div class="dp-modal-header">
                <div>
                    <div class="dp-modal-title">إصدار أمر دفع</div>
                    <div class="dp-modal-sub" id="dp-modal-sub">—</div>
                </div>
                <button class="dp-modal-close" onclick="closeIssueModal()">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
            <div class="dp-modal-body">
                <div class="dp-form-group">
                    <label>طريقة الدفع</label>
                    <select class="dp-select dp-select-full" id="dp-method">
                        <option value="تحويل بنكي">🏦 تحويل بنكي</option>
                        <option value="شيك">📋 شيك</option>
                        <option value="نقد">💵 نقد</option>
                        <option value="أمر دفع إلكتروني">💻 أمر دفع إلكتروني</option>
                    </select>
                </div>
                <div class="dp-form-group">
                    <label>ملاحظات (اختياري)</label>
                    <textarea class="dp-textarea" id="dp-order-notes" placeholder="ملاحظة على أمر الدفع..."></textarea>
                </div>
                <div class="dp-preview-table" id="dp-preview-table"><!-- تُعبأ ديناميكياً --></div>
            </div>
            <div class="dp-modal-footer">
                <button class="dp-btn dp-btn-ghost" onclick="closeIssueModal()">إلغاء</button>
                <button class="dp-btn dp-btn-confirm" id="dp-confirm-btn" onclick="confirmPaymentOrder()">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                    تأكيد الإصدار
                </button>
            </div>
        </div>
    </div>


    <!-- Modal: سجل أوامر الدفع السابقة -->
    <div class="dp-modal-overlay" id="dp-history-modal" style="display:none">
        <div class="dp-modal dp-history-box">
            <div class="dp-modal-header">
                <div>
                    <div class="dp-modal-title">سجل أوامر الدفع</div>
                    <div class="dp-modal-sub">ابحث حسب التاريخ أو رقم الأمر</div>
                </div>
                <button class="dp-modal-close" onclick="closeHistoryModal()">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
            <div class="dp-modal-body">
                <div class="dp-hist-filters">
                    <div class="dp-form-group">
                        <label>من تاريخ</label>
                        <input type="date" class="dp-select" id="dp-hist-from" value="">
                    </div>
                    <div class="dp-form-group">
                        <label>إلى تاريخ</label>
                        <input type="date" class="dp-select" id="dp-hist-to" value="">
                    </div>
                    <div class="dp-form-group dp-hist-search-group">
                        <label>رقم الأمر</label>
                        <input type="text" class="dp-select" id="dp-hist-ref" placeholder="PO-...">
                    </div>
                    <button class="dp-btn dp-btn-primary" onclick="loadPaymentHistory()" style="align-self:flex-end">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                        </svg>
                        بحث
                    </button>
                </div>
                <div id="dp-hist-results">
                    <div class="dp-empty-row" style="padding:2rem;text-align:center;color:var(--text-muted)">
                        اضغط بحث لعرض النتائج
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Modal: أمر الدفع الصادر (قابل للطباعة) -->
    <div class="dp-modal-overlay" id="dp-order-modal" style="display:none">
        <div class="dp-order-box" id="dp-order-box">
            <!-- Header controls (لا تُطبع) -->
            <div class="dp-order-controls no-print">
                <button class="dp-btn dp-btn-ghost" onclick="closeOrderModal()">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                    إغلاق
                </button>
                <button class="dp-btn dp-btn-ghost" onclick="downloadOrderPDF()">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    تحميل PDF
                </button>
                <button class="dp-btn dp-btn-primary" onclick="printOrder()">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="6 9 6 2 18 2 18 9"/>
                        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                        <rect x="6" y="14" width="12" height="8"/>
                    </svg>
                    طباعة
                </button>
            </div>
            <!-- محتوى الأمر القابل للطباعة -->
            <div class="dp-printable" id="dp-printable-content">
                <!-- يُعبأ بعد الإصدار -->
            </div>
        </div>
    </div>
    `;
}

// ────────────────────────────────────────────
//  تحميل البيانات
// ────────────────────────────────────────────
async function loadDailyPayments() {
    try {
        const res = await fetch('api/?action=get_pending_payments');
        const data = await res.json();
        if (!data.success) throw new Error(data.message);
        dpTransactions = data.data || [];
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

    document.getElementById('dps-pending').textContent = total;
    document.getElementById('dps-amount').textContent = fmtMoney(amount) + ' ر.س';
    document.getElementById('dps-breach').textContent = breach;
    document.getElementById('dps-warn').textContent = warn;
    document.getElementById('dps-ok').textContent = ok;
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
                <span class="dp-amount">${fmtMoney(amount)}</span>
                <span class="dp-currency">ر.س</span>
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

    document.getElementById('dp-sel-bar-count').textContent = count;
    document.getElementById('dp-sel-bar-amount').textContent = fmtMoney(amount);

    // label
    const lbl = document.getElementById('dp-sel-label');
    if (lbl) {
        lbl.style.display = count > 0 ? '' : 'none';
        document.getElementById('dp-sel-count-txt').textContent = count;
    }
}

// ────────────────────────────────────────────
//  الفلترة
// ────────────────────────────────────────────
function filterDailyPayments() {
    const q = (document.getElementById('dp-search')?.value || '').toLowerCase();
    const pri = document.getElementById('dp-filter-priority')?.value || '';
    const sla = document.getElementById('dp-filter-sla')?.value || '';

    const list = dpTransactions.filter(t => {
        const matchQ = !q ||
            (t.transaction_number || '').toLowerCase().includes(q) ||
            (t.description || '').toLowerCase().includes(q) ||
            (t.transaction_type || '').toLowerCase().includes(q) ||
            (t.budget_code || '').toLowerCase().includes(q);

        const matchP = !pri || t.priority === pri;

        const pct = parseFloat(t.sla_pct) || 0;
        const matchS = !sla ||
            (sla === 'breach' && pct >= 100) ||
            (sla === 'warn' && pct >= 70 && pct < 100) ||
            (sla === 'ok' && pct < 70);

        return matchQ && matchP && matchS;
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
function openIssuePaymentModal() {
    if (dpSelected.size === 0) return;

    const selected = dpTransactions.filter(t => dpSelected.has(t.id));
    const total = selected.reduce((s, t) => s + parseFloat(t.amount || 0), 0);

    // ملخص
    document.getElementById('dp-modal-sub').textContent =
        `${selected.length} معاملة — إجمالي: ${fmtMoney(total)} ر.س`;

    // جدول المعاينة
    const rows = selected.map(t => `
        <tr>
            <td>${t.transaction_number || '#' + t.id}</td>
            <td>${truncate(t.description, 40)}</td>
            <td>${t.transaction_type || '—'}</td>
            <td style="text-align:left;font-variant-numeric:tabular-nums">${fmtMoney(parseFloat(t.amount || 0))} ر.س</td>
            <td>${getPriorityBadge(t.priority)}</td>
        </tr>
    `).join('');

    document.getElementById('dp-preview-table').innerHTML = `
        <div class="dp-preview-title">المعاملات المحددة</div>
        <table class="dp-preview-tbl">
            <thead><tr>
                <th>الرقم</th><th>الوصف</th><th>النوع</th><th>المبلغ</th><th>الأولوية</th>
            </tr></thead>
            <tbody>${rows}</tbody>
            <tfoot><tr>
                <td colspan="3" style="font-weight:700;text-align:right">الإجمالي</td>
                <td style="font-weight:800;color:var(--accent-green);text-align:left">${fmtMoney(total)} ر.س</td>
                <td></td>
            </tr></tfoot>
        </table>
    `;

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
//  تأكيد إصدار أمر الدفع
// ────────────────────────────────────────────
async function confirmPaymentOrder() {
    const btn = document.getElementById('dp-confirm-btn');
    const method = document.getElementById('dp-method').value;
    const notes = document.getElementById('dp-order-notes').value;

    btn.disabled = true;
    btn.textContent = '⏳ جاري الإصدار...';

    try {
        const res = await fetch('api/?action=issue_payment_order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ids: [...dpSelected],
                method,
                notes,
            })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message);

        dpLastOrder = data;
        closeIssueModal();
        showPaymentOrderModal(data);
        await loadDailyPayments();

    } catch (e) {
        alert('خطأ: ' + e.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> تأكيد الإصدار`;
    }
}

// ────────────────────────────────────────────
//  Modal: أمر الدفع الصادر
// ────────────────────────────────────────────
function showPaymentOrderModal(data) {
    const rows = (data.details || []).map((t, i) => `
        <tr>
            <td>${i + 1}</td>
            <td>${t.transaction_number || '#' + t.id}</td>
            <td>${t.description || '—'}</td>
            <td>${t.transaction_type || '—'}</td>
            <td>${t.budget_code || '—'}</td>
            <td class="po-amount">${fmtMoney(parseFloat(t.amount || 0))} ر.س</td>
        </tr>
    `).join('');

    const now = new Date(data.issued_at || Date.now());
    const dateStr = now.toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr = now.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });

    document.getElementById('dp-printable-content').innerHTML = `
        <!-- ═══ رأس أمر الدفع ═══ -->
        <div class="po-header">
            <div class="po-header-logo">
                <div class="po-logo-icon">⚡</div>
                <div class="po-org-name">نظام إدارة المعاملات المالية</div>
            </div>
            <div class="po-header-title">
                <div class="po-doc-type">أمر دفع يومي</div>
                <div class="po-doc-ref">${data.order_ref}</div>
            </div>
        </div>

        <!-- ═══ بيانات الأمر ═══ -->
        <div class="po-meta-grid">
            <div class="po-meta-item">
                <div class="po-meta-label">تاريخ الإصدار</div>
                <div class="po-meta-val">${dateStr}</div>
            </div>
            <div class="po-meta-item">
                <div class="po-meta-label">وقت الإصدار</div>
                <div class="po-meta-val">${timeStr}</div>
            </div>
            <div class="po-meta-item">
                <div class="po-meta-label">طريقة الدفع</div>
                <div class="po-meta-val">${data.method}</div>
            </div>
            <div class="po-meta-item">
                <div class="po-meta-label">صادر بواسطة</div>
                <div class="po-meta-val">${data.issued_by}</div>
            </div>
            <div class="po-meta-item">
                <div class="po-meta-label">عدد المعاملات</div>
                <div class="po-meta-val">${data.updated} معاملة</div>
            </div>
            <div class="po-meta-item po-meta-total">
                <div class="po-meta-label">إجمالي المبلغ</div>
                <div class="po-meta-val po-total-val">${fmtMoney(data.total_amount)} ر.س</div>
            </div>
        </div>

        <!-- ═══ جدول المعاملات ═══ -->
        <table class="po-table">
            <thead>
                <tr>
                    <th>#</th>
                    <th>رقم المعاملة</th>
                    <th>الوصف</th>
                    <th>النوع</th>
                    <th>رمز الموازنة</th>
                    <th>المبلغ</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
            <tfoot>
                <tr class="po-total-row">
                    <td colspan="5" style="text-align:right;font-weight:700">الإجمالي الكلي</td>
                    <td class="po-amount po-grand-total">${fmtMoney(data.total_amount)} ر.س</td>
                </tr>
            </tfoot>
        </table>

        <!-- ═══ توقيعات ═══ -->
        <div class="po-signatures">
            <div class="po-sig-box">
                <div class="po-sig-line"></div>
                <div class="po-sig-label">محضّر الأمر</div>
                <div class="po-sig-name">${data.issued_by}</div>
            </div>
            <div class="po-sig-box">
                <div class="po-sig-line"></div>
                <div class="po-sig-label">المراجع</div>
                <div class="po-sig-name"></div>
            </div>
            <div class="po-sig-box">
                <div class="po-sig-line"></div>
                <div class="po-sig-label">المعتمد</div>
                <div class="po-sig-name"></div>
            </div>
        </div>

        <!-- ═══ تذييل ═══ -->
        <div class="po-footer">
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

function printOrder() {
    const content = document.getElementById('dp-printable-content').innerHTML;
    const win = window.open('', '_blank');
    win.document.write(`
        <!DOCTYPE html><html dir="rtl" lang="ar">
        <head><meta charset="UTF-8"><title>أمر دفع</title>
        <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; font-size: 12px; color: #111; padding: 24px; }
            .po-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:20px; padding-bottom:16px; border-bottom:2px solid #111; }
            .po-doc-type { font-size:1.5rem; font-weight:800; }
            .po-doc-ref { font-size:.85rem; color:#555; margin-top:4px; }
            .po-logo-icon { font-size:2rem; }
            .po-org-name { font-weight:700; font-size:.9rem; margin-top:4px; }
            .po-meta-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:20px; }
            .po-meta-item { padding:8px 12px; border:1px solid #ddd; border-radius:8px; }
            .po-meta-label { font-size:.72rem; color:#666; margin-bottom:2px; }
            .po-meta-val { font-weight:700; font-size:.9rem; }
            .po-meta-total { background:#f0f9f0; border-color:#40c057; }
            .po-total-val { color:#2b8a3e; font-size:1rem; }
            .po-table { width:100%; border-collapse:collapse; margin-bottom:24px; }
            .po-table th,td { border:1px solid #ddd; padding:7px 10px; text-align:right; }
            .po-table th { background:#f5f5f5; font-weight:700; font-size:.78rem; }
            .po-table td { font-size:.82rem; }
            .po-amount { text-align:left; font-variant-numeric:tabular-nums; direction:ltr; }
            .po-total-row td { background:#f5f5f5; font-weight:700; }
            .po-grand-total { color:#2b8a3e; font-size:1rem; }
            .po-signatures { display:flex; gap:24px; margin-bottom:20px; }
            .po-sig-box { flex:1; text-align:center; }
            .po-sig-line { height:60px; border-bottom:1px solid #999; margin-bottom:6px; }
            .po-sig-label { font-size:.75rem; color:#555; }
            .po-footer { display:flex; justify-content:space-between; font-size:.7rem; color:#888; border-top:1px solid #ddd; padding-top:8px; margin-top:8px; }
        </style>
        </head><body>${content}</body></html>
    `);
    win.document.close();
    win.focus();
    win.print();
    win.close();
}

async function downloadOrderPDF() {
    const btn = document.querySelector('.dp-order-controls .dp-btn-ghost:nth-child(2)');
    if (btn) { btn.disabled = true; btn.innerHTML = '⏳ جاري التحضير...'; }
    try {
        const today = new Date().toISOString().slice(0, 10);
        await downloadAsPDF('dp-printable-content', `امر-دفع-${today}.pdf`);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> تحميل PDF';
        }
    }
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

// fmtMoney — تُستخدم من app-common.js أو نعرفها هنا
if (typeof fmtMoney === 'undefined') {
    window.fmtMoney = n => {
        const num = parseFloat(n) || 0;
        return num.toLocaleString('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };
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
                    <td><span class="dp-amount">${fmtMoney(o.total_amount)}</span> <span class="dp-currency">ر.س</span></td>
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
            ${orders.length} نتيجة — إجمالي: ${fmtMoney(orders.reduce((s, o) => s + parseFloat(o.total_amount || 0), 0))} ر.س
        </div>
    `;
}

async function viewHistoryOrder(ref) {
    try {
        const res = await fetch(`api/?action=get_payment_order_details&ref=${encodeURIComponent(ref)}`);
        const data = await res.json();
        if (!data.success) throw new Error(data.message);
        const rows = data.data || [];
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