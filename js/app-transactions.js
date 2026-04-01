/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║      app-transactions.js — المعاملات المالية                 ║
 * ║  يتطلب: app-common.js                                        ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * يحتوي هذا الملف على:
 *  • تحميل وعرض قائمة المعاملات (loadTransactions, renderTransactions)
 *  • عرض صفوف المعاملات مع تفاصيل كل مرحلة
 *  • نافذة إضافة معاملة جديدة (openAddModal, submitAddForm)
 *  • نافذة تعديل معاملة (editTransaction, submitUpdateForm)
 *  • إدارة المرفقات: رفع، حذف (uploadAttachment, deleteAttachment)
 *  • سجل أحداث المعاملة (loadTransactionEvents)
 *  • فلترة وبحث المعاملات (filterTransactions)
 *  • عرض تفاصيل معاملة (viewTransaction)
 *  • قسم الإعدادات — الموظفون وأنواع المعاملات والنظام
 */

// ═══════════════════════════════════════════════════════════
//  بيانات الإعدادات
// ═══════════════════════════════════════════════════════════

/** بيانات قسم الإعدادات — الموظفون وأنواع المعاملات */
var SettingsData = {
    employees: [],
    types: [],
    departments: [],
    currentFilter: 'all'
};

// ═══════════════════════════════════════════════════════════
//  حالة الـ Pagination
// ═══════════════════════════════════════════════════════════
var TxState = {
    page: 1,
    perPage: 10,
    total: 0,
    pages: 0,
    search: '',
    status: ''
};

// ═══════════════════════════════════════════════════════════
//  تحميل وعرض المعاملات
// ═══════════════════════════════════════════════════════════

/**
 * تحميل المعاملات من الخادم مع دعم Pagination
 * @param {number|null} page — رقم الصفحة (null = الصفحة الحالية)
 */
async function loadTransactions(page) {
    if (page != null) TxState.page = page;
    showLoading();

    try {
        const params = new URLSearchParams({
            action: 'transactions',
            page: TxState.page,
            per_page: TxState.perPage,
            search: TxState.search,
            status: TxState.status,
        });

        const res = await fetch('api/?' + params);
        const data = await res.json();

        if (data.success) {
            App.transactions = data.data ?? data.data;

            // إذا رجع pagination من الـ API استخدمه، وإلا احسب من المصفوفة
            if (data.pagination) {
                TxState.total = data.pagination.total;
                TxState.pages = data.pagination.pages;
                TxState.page = data.pagination.page;
            } else {
                // fallback: الـ API لم يدعم pagination بعد — حساب محلي
                const allTx = Array.isArray(data.data) ? data.data : [];
                // ترتيب تنازلي حسب id (الأحدث أولاً)
                allTx.sort((a, b) => (parseInt(b.id) || 0) - (parseInt(a.id) || 0));
                TxState.total = allTx.length;
                TxState.pages = Math.max(1, Math.ceil(allTx.length / TxState.perPage));
                const from = (TxState.page - 1) * TxState.perPage;
                App.transactions = allTx.slice(from, from + TxState.perPage);
            }

            renderTransactions();
        } else {
            showToast('خطأ في تحميل المعاملات', 'error');
        }
    } catch (error) {
        showToast('خطأ في الاتصال', 'error');
        console.error(error);
    }
}

// ─── عرض المعاملات ──────────────────────────────────────────
function renderTransactions() {
    const html = `
        <div class="toolbar">
            <div class="toolbar-search">
                <div class="search-input">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="8"></circle>
                        <path d="m21 21-4.35-4.35"></path>
                    </svg>
                    <input type="text" id="searchInput" placeholder="بحث في المعاملات..."
                           value="${TxState.search}"
                           oninput="filterTransactions()">
                </div>
                <select id="statusFilter" class="filter-select" onchange="filterTransactions()">
                    <option value="">جميع الحالات</option>
                    <option value="عاجل"    ${TxState.status === 'عاجل' ? 'selected' : ''}>عاجل</option>
                    <option value="متابعة"  ${TxState.status === 'متابعة' ? 'selected' : ''}>يحتاج متابعة</option>
                    <option value="مكتمل"   ${TxState.status === 'مكتمل' ? 'selected' : ''}>مكتمل</option>
                    <option value="تم الدفع"${TxState.status === 'تم الدفع' ? 'selected' : ''}>تم الدفع</option>
                    <option value="معلق"    ${TxState.status === 'معلق' ? 'selected' : ''}>معلق</option>
                </select>
            </div>
            <button class="btn btn-primary" onclick="openAddModal()">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 5v14M5 12h14"></path>
                </svg>
                معاملة جديدة
            </button>
        </div>

        <div class="card">
            <div class="tx-pipeline-legend">
                <span class="tx-legend-title">مسار المعاملة:</span>
                <span class="tx-legend-item">
                    <span class="tx-legend-dot tx-legend-done"></span>مكتملة
                </span>
                <span class="tx-legend-item">
                    <span class="tx-legend-dot tx-legend-active"></span>جارية
                </span>
                <span class="tx-legend-item">
                    <span class="tx-legend-dot tx-legend-pending"></span>لم تبدأ
                </span>
                <span class="tx-legend-item">
                    <span class="tx-legend-dot tx-legend-rejected"></span>مرفوضة
                </span>
            </div>
            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>رقم المعاملة</th>
                            <th>التاريخ</th>
                            <th>النوع</th>
                            <th>الوصف</th>
                            <th>المبلغ</th>
                            <th>مسار المعاملة</th>
                            <th>التنبيه</th>
                            <th>المرفقات</th>
                            <th>تعديل</th>
                        </tr>
                    </thead>
                    <tbody id="transactionsBody">
                        ${renderTransactionRows(App.transactions)}
                    </tbody>
                </table>
            </div>
            ${renderPagination()}
        </div>
    `;

    DOM.mainContent.innerHTML = html;
}

// ─── شريط Pagination ────────────────────────────────────────
function renderPagination() {
    if (!TxState.total) return '';

    const p = TxState.page;
    const total = TxState.pages;
    const perPage = TxState.perPage;
    const from = Math.min(TxState.total, (p - 1) * perPage + 1);
    const to = Math.min(TxState.total, p * perPage);
    const isFirst = p === 1;
    const isLast = p === total;

    // ── بناء أرقام الصفحات مع ... ──────────────────────────────
    // المنطق: أول صفحة، آخر صفحة، والصفحات المحيطة بالحالية (window=2)
    function buildPageNumbers() {
        if (total <= 7) {
            // قليلة — اعرضها كلها
            return Array.from({ length: total }, (_, i) => i + 1);
        }
        const pages = [];
        const left = Math.max(2, p - 2);
        const right = Math.min(total - 1, p + 2);

        pages.push(1);
        if (left > 2) pages.push('...');
        for (let i = left; i <= right; i++) pages.push(i);
        if (right < total - 1) pages.push('...');
        pages.push(total);
        return pages;
    }

    const pageNums = buildPageNumbers();

    const pageButtons = pageNums.map(n => {
        if (n === '...') {
            return `<span class="tx-pag-dots">…</span>`;
        }
        const isActive = n === p;
        return `<button class="tx-pag-btn ${isActive ? 'tx-pag-btn--active' : ''}"
                        onclick="loadTransactions(${n})">${n}</button>`;
    }).join('');

    // ── خيارات عدد الصفوف ─────────────────────────────────────
    const perPageOptions = [10, 20, 30, 40].map(n =>
        `<option value="${n}" ${n === perPage ? 'selected' : ''}>${n}</option>`
    ).join('');

    return `
    <div class="tx-pagination">

        <!-- يمين: عرض X-Y من Z -->
        <span class="tx-pag-info">عرض ${from}–${to} من ${TxState.total}</span>

        <!-- وسط: أزرار التنقل + أرقام الصفحات -->
        <div class="tx-pag-nav">

            <!-- أول صفحة «« -->
            <button class="tx-pag-btn tx-pag-arrow ${isFirst ? 'tx-pag-disabled' : ''}"
                    onclick="${isFirst ? '' : 'loadTransactions(1)'}" title="الأولى">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/>
                </svg>
            </button>

            <!-- السابقة ‹ -->
            <button class="tx-pag-btn tx-pag-arrow ${isFirst ? 'tx-pag-disabled' : ''}"
                    onclick="${isFirst ? '' : `loadTransactions(${p - 1})`}" title="السابقة">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <polyline points="15 18 9 12 15 6"/>
                </svg>
            </button>

            <!-- أرقام الصفحات -->
            ${pageButtons}

            <!-- التالية › -->
            <button class="tx-pag-btn tx-pag-arrow ${isLast ? 'tx-pag-disabled' : ''}"
                    onclick="${isLast ? '' : `loadTransactions(${p + 1})`}" title="التالية">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <polyline points="9 18 15 12 9 6"/>
                </svg>
            </button>

            <!-- آخر صفحة »» -->
            <button class="tx-pag-btn tx-pag-arrow ${isLast ? 'tx-pag-disabled' : ''}"
                    onclick="${isLast ? '' : `loadTransactions(${total})`}" title="الأخيرة">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/>
                </svg>
            </button>

        </div>

        <!-- يسار: عدد الصفوف -->
        <div class="tx-pag-perpage">
            <span>صفوف في الصفحة:</span>
            <div class="tx-pag-perpage-wrap">
                <select onchange="txChangePerPage(this.value)">${perPageOptions}</select>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <polyline points="6 9 12 15 18 9"/>
                </svg>
            </div>
        </div>

    </div>`;
}

// الانتقال لصفحة محددة عبر حقل الإدخال
function txGoToPage(val) {
    const p = Math.max(1, Math.min(TxState.pages, parseInt(val) || 1));
    loadTransactions(p);
}

// تغيير عدد الصفوف لكل صفحة
function txChangePerPage(val) {
    TxState.perPage = parseInt(val) || 10;
    TxState.page = 1;
    loadTransactions(1);
}

// ─── فلترة — ترسل للسيرفر (أو تفلتر محلياً كـ fallback) ─────
function filterTransactions() {
    TxState.search = document.getElementById('searchInput')?.value || '';
    TxState.status = document.getElementById('statusFilter')?.value || '';
    TxState.page = 1;
    loadTransactions(1);
}

// ========== مسار المعاملة — عمود موحد للمراحل الأربع ==========
function renderStagePipeline(tx) {
    // تحديد حالة كل مرحلة: done | active | pending
    function stageState(status, doneValues) {
        if (!status) return 'pending';
        if (doneValues.includes(status)) return 'done';
        if (['مرفوض', 'ملغاة'].includes(status)) return 'rejected';
        return 'active';
    }

    const states = [
        stageState(tx.receive_status, ['مستلم']),
        stageState(tx.budget_status, ['معتمد']),
        stageState(tx.payment_status, ['تم الدفع']),
        stageState(tx.invoice_status, ['صدرت الفاتورة']),
    ];

    const labels = ['استلام', 'موازنة', 'دفع', 'فوترة'];

    const colorMap = {
        done: { dot: 'var(--accent-green)', line: 'var(--accent-green)' },
        active: { dot: 'var(--accent-blue)', line: 'var(--border-color)' },
        pending: { dot: 'var(--border-color)', line: 'var(--border-color)' },
        rejected: { dot: '#ff6b6b', line: 'var(--border-color)' },
    };

    let html = '<div class="tx-pipeline">';

    for (let i = 0; i < 4; i++) {
        const s = states[i];
        const c = colorMap[s];
        const isLast = i === 3;

        // الخط الواصل بين النقاط
        const lineColor = (states[i] === 'done' && !isLast) ? colorMap.done.line : colorMap.pending.line;

        // أيقونة النقطة
        let dotInner = '';
        if (s === 'done') dotInner = '<svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="2 6 5 9 10 3"/></svg>';
        else if (s === 'rejected') dotInner = '✕';

        html += '<div class="tx-pip-step">';

        // النقطة
        html += `<div class="tx-pip-dot tx-pip-${s}" title="${labels[i]}: ${tx[['receive_status', 'budget_status', 'payment_status', 'invoice_status'][i]] || '—'}">${dotInner}</div>`;

        // التسمية
        html += `<span class="tx-pip-label">${labels[i]}</span>`;

        // الخط الواصل (ما عدا الأخير)
        if (!isLast) {
            html += `<div class="tx-pip-line" style="background:${lineColor}"></div>`;
        }

        html += '</div>';
    }

    html += '</div>';
    return html;
}

// ========== دالة عرض صفوف المعاملات ==========
function renderTransactionRows(transactions) {
    if (!transactions || !transactions.length) {
        return '<tr><td colspan="8" style="text-align: center; padding: 3rem; color: var(--text-muted);">لا توجد معاملات</td></tr>';
    }

    let html = '';

    for (let i = 0; i < transactions.length; i++) {
        const tx = transactions[i];
        const isExpanded = (App.expandedRow == tx.id);

        // صف المعاملة الرئيسي
        html += '<tr class="transaction-row ' + (isExpanded ? 'expanded' : '') + '" data-id="' + tx.id + '" onclick="toggleRow(' + tx.id + ')">';
        html += '<td><span class="tx-number">' + tx.transaction_number + '</span></td>';
        html += '<td><span class="tx-date-cell">' + (tx.transaction_date ? tx.transaction_date.slice(0, 10) : '—') + '</span></td>';
        html += '<td>'
            + '<span class="tx-type">' + (tx.transaction_type || '—') + '</span>'
            + (tx.transaction_sub_type ? '<br><span class="tx-sub-type-tag">' + tx.transaction_sub_type + '</span>' : '')
            + '</td>';
        html += '<td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-secondary);font-size:.82rem">' + (tx.description || '—') + '</td>';
        html += '<td><span class="tx-amount">' + fmtMoneyCur(tx.amount, tx.currency) + '</span></td>';
        html += '<td>' + renderStagePipeline(tx) + '</td>';
        html += '<td>' + getAlertBadge(tx.alert_type) + '</td>';

        // ── عمود المرفقات ──
        var atts = tx.attachments || (tx.attachment ? [{ file_path: tx.attachment, display_name: tx.attachment_name || 'مستند' }] : []);
        html += '<td style="text-align:center">';
        if (atts.length > 0) {
            html += '<button class="btn-icon btn-pdf" onclick="event.stopPropagation(); openPDF(\'' + atts[0].file_path + '\')" title="' + atts.length + ' مرفق" style="position:relative">';
            html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>';
            if (atts.length > 1) html += '<span style="position:absolute;top:-4px;left:-4px;background:var(--accent-blue);color:#fff;font-size:.55rem;font-weight:700;width:14px;height:14px;border-radius:50%;display:flex;align-items:center;justify-content:center">' + atts.length + '</span>';
            html += '</button>';
        } else {
            html += '<span class="btn-icon" style="cursor:default;opacity:.35;pointer-events:none">';
            html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>';
            html += '</span>';
        }
        html += '</td>';

        // ── عمود التعديل والتوسيع ──
        html += '<td style="text-align:center">';
        html += '<div style="display:flex;align-items:center;justify-content:center;gap:.4rem">';
        html += '<button class="btn-icon" onclick="event.stopPropagation(); editTransaction(' + tx.id + ')" title="تعديل">';
        html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';
        html += '</button>';
        html += '<svg class="expand-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--text-muted);transition:transform 0.3s;' + (isExpanded ? 'transform:rotate(180deg);' : '') + '">';
        html += '<polyline points="6 9 12 15 18 9"></polyline>';
        html += '</svg>';
        html += '</div>';
        html += '</td>';
        html += '</tr>';

        // صف التفاصيل الموسع
        if (isExpanded) {
            const dtLabels = { 'to_payment': '⚡ دفع مباشر', 'to_purchase_order': '📋 أمر شراء', 'to_requester': '↩️ جهة طالبة' };
            const dtColors = { 'to_payment': 'var(--accent-green)', 'to_purchase_order': 'var(--accent-amber)', 'to_requester': 'var(--accent-purple)' };

            // ── دالة مساعدة: صف بيانات ─────────────────────────────
            const drow = (label, value, style = '') =>
                `<div class="xrow"><span class="xrow-lbl">${label}</span><span class="xrow-val" ${style ? `style="${style}"` : ''}>${value || '—'}</span></div>`;

            // ── معلومات الإنشاء ─────────────────────────────────────
            html += `<tr class="expanded-row"><td colspan="12" style="padding:0">`;
            html += `<div class="xmeta-bar">
                <span class="xmeta-item">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-blue)" stroke-width="2">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                        <circle cx="8.5" cy="7" r="4"/>
                        <line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>
                    </svg>
                    أنشئت بواسطة <strong>${tx.created_by_name || 'النظام'}</strong>
                </span>
                <span class="xmeta-sep">·</span>
                <span class="xmeta-item">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-green)" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                    </svg>
                    ${formatCreationTime(tx.creation_time)}
                </span>
            </div>`;

            // ── pipeline المراحل ────────────────────────────────────
            html += `<div class="xpipeline">`;

            // مرحلة: الاستلام
            html += `<div class="xstage xstage-receive">
                <div class="xstage-head xstage-head-green">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                    </svg>
                    الاستلام
                    <span class="xstage-badge">${getStatusBadge(tx.receive_status)}</span>
                </div>
                <div class="xstage-body">
                    ${drow('الموظف', tx.receiver_name)}
                    ${drow('التاريخ', tx.receive_date)}
                    ${tx.receive_notes ? drow('ملاحظات', tx.receive_notes) : ''}
                </div>
            </div>`;

            // مرحلة: الموازنة
            html += `<div class="xstage xstage-budget">
                <div class="xstage-head xstage-head-cyan">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                    </svg>
                    الموازنة
                    <span class="xstage-badge">${getStatusBadge(tx.budget_status)}</span>
                </div>
                <div class="xstage-body">
                    ${drow('الموظف', tx.budget_employee_name)}
                    ${tx.budget_code ? drow('رمز الموازنة', tx.budget_code, 'font-family:var(--font-primary);color:var(--accent-cyan)') : ''}
                    ${drow('التاريخ', tx.budget_date)}
                    ${tx.budget_notes ? drow('ملاحظات', tx.budget_notes) : ''}
                </div>
            </div>`;

            // مرحلة: التوجيه
            const hasDispatch = !!tx.dispatch_type;
            const dispatchPaused = tx.dispatch_ola_active == 0;
            html += `<div class="xstage xstage-dispatch ${dispatchPaused ? 'xstage-paused' : ''}">
                <div class="xstage-head xstage-head-indigo">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="17 1 21 5 17 9"/>
                        <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                        <polyline points="7 23 3 19 7 15"/>
                        <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                    </svg>
                    التوجيه
                    ${hasDispatch ? `<span class="xstage-badge">${getStatusBadge(tx.dispatch_status)}</span>` : ''}
                </div>
                <div class="xstage-body">
                    ${hasDispatch ? `
                        ${drow('الموظف', tx.dispatch_employee_name)}
                        <div class="xrow"><span class="xrow-lbl">المسار</span>
                            <span class="xrow-val" style="color:${dtColors[tx.dispatch_type] || 'var(--text-muted)'};font-weight:700">
                                ${dtLabels[tx.dispatch_type] || tx.dispatch_type}
                            </span>
                        </div>
                        ${tx.routed_to ? drow('الجهة', tx.routed_to) : ''}
                        ${dispatchPaused ? '<div class="xstage-paused-badge">⏸ OLA معلّق</div>' : ''}
                        ${tx.dispatch_notes ? drow('ملاحظات', tx.dispatch_notes) : ''}
                    ` : '<div class="xstage-empty">لم يتم التوجيه بعد</div>'}
                </div>
            </div>`;

            // مرحلة: الدفع
            html += `<div class="xstage xstage-payment">
                <div class="xstage-head xstage-head-orange">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="1" y="4" width="22" height="16" rx="2"/>
                        <line x1="1" y1="10" x2="23" y2="10"/>
                    </svg>
                    الدفع
                    <span class="xstage-badge">${getStatusBadge(tx.payment_status)}</span>
                </div>
                <div class="xstage-body">
                    ${drow('الموظف', tx.payment_employee_name)}
                    ${tx.reference_number ? drow('المرجع', tx.reference_number, 'font-family:var(--font-primary);color:var(--accent-blue)') : ''}
                    ${drow('التاريخ', tx.payment_date)}
                    ${tx.payment_notes ? drow('ملاحظات', tx.payment_notes) : ''}
                </div>
            </div>`;

            // مرحلة: الفوترة
            html += `<div class="xstage xstage-invoice">
                <div class="xstage-head xstage-head-purple">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                    </svg>
                    الفوترة
                    <span class="xstage-badge">${getStatusBadge(tx.invoice_status)}</span>
                </div>
                <div class="xstage-body">
                    ${drow('الموظف', tx.invoice_employee_name)}
                    ${tx.invoice_number ? drow('رقم الفاتورة', tx.invoice_number, 'font-family:var(--font-primary);color:var(--accent-blue)') : ''}
                    ${drow('التاريخ', tx.invoice_date)}
                    ${tx.alert_type ? `<div class="xrow"><span class="xrow-lbl">التنبيه</span><span class="xrow-val">${getAlertBadge(tx.alert_type)}</span></div>` : ''}
                    ${tx.invoice_notes ? drow('ملاحظات', tx.invoice_notes) : ''}
                </div>
            </div>`;

            html += `</div>`; // end xpipeline

            // ── سجل الأحداث ─────────────────────────────────────────
            html += `<div class="events-timeline-section">
                <div class="events-header" onclick="loadTransactionEvents(${tx.id})">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                    </svg>
                    سجل الأحداث والتغييرات
                    <span class="events-toggle-icon">▼</span>
                </div>
                <div id="events-container-${tx.id}" class="events-container" style="display:none"></div>
            </div>`;

            // ── المرفقات ─────────────────────────────────────────────
            var txAtts = tx.attachments || (tx.attachment ? [{ id: 'legacy', file_path: tx.attachment, display_name: tx.attachment_name || 'مستند', file_name: tx.attachment_name || 'مستند.pdf', file_size: null, created_at: null }] : []);
            html += renderAttachmentsSection(tx.id, txAtts);
            html += `</td></tr>`;
        }

    }

    return html;
}

// ========== دالة تبديل الصف — تفتح مودال التفاصيل ==========
function toggleRow(id) {
    const tx = App.transactions && App.transactions.find(function (t) { return t.id == id; });
    if (tx) { openTxDetailModal(tx); }
}

// فتح مودال إضافة معاملة
async function openAddModal() {
    try {
        const [typesRes] = await Promise.all([
            fetch('api/settings.php?action=get_types'),
        ]);

        const typesData = await typesRes.json();
        const allTypes = typesData.success ? typesData.data : [];

        // فصل الرئيسية عن الفرعية
        const parents = allTypes.filter(t => !t.parent_id || t.parent_id == 0);
        // كل type_id يُرسل هو id الفرعي (أو الرئيسي لو لا يوجد فرعي)
        window._txAllTypes = allTypes;

        const now = new Date();
        const dateStr = now.toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const timeStr = now.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });

        DOM.modalTitle.textContent = 'إضافة معاملة جديدة';
        DOM.modalBody.innerHTML = `
            <form id="addForm" onsubmit="submitAddForm(event)" enctype="multipart/form-data">
                <input type="hidden" name="type_id" id="tx_type_id_hidden" value="">

                <div class="auto-date-info" style="background:var(--bg-surface);padding:1rem;border-radius:10px;margin-bottom:1.5rem;display:flex;align-items:center;gap:1rem;">
                    <div style="width:45px;height:45px;background:var(--btn-primary-bg);border-radius:10px;display:flex;align-items:center;justify-content:center;">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--btn-primary-text)" stroke-width="2">
                            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                        </svg>
                    </div>
                    <div>
                        <div style="font-size:.8rem;color:var(--text-muted);">تاريخ ووقت الإنشاء</div>
                        <div style="font-weight:600;color:var(--text-primary);">${dateStr} - ${timeStr}</div>
                    </div>
                </div>

                <div class="form-group">
                    <label class="form-label">نوع المعاملة</label>
                    <select class="form-select" id="tx_parent_select" onchange="onTxParentChange(this.value)" required>
                        <option value="">اختر التصنيف الرئيسي</option>
                        ${parents.map(p => `<option value="${p.id}">${getTypeIcon(p.name)} ${p.name}</option>`).join('')}
                    </select>
                </div>

                <div id="tx_sub_wrap" style="display:none;" class="form-group">
                    <div class="tx-sub-wrap">
                        <div class="tx-sub-wrap-label">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                                <polyline points="9 18 15 12 9 6"/>
                            </svg>
                            اختر التصنيف الفرعي
                        </div>
                        <div id="tx_sub_btns" class="tx-sub-btns"></div>
                    </div>
                </div>

                <div class="form-group">
                    <label class="form-label">الوصف</label>
                    <textarea class="form-textarea" name="description" placeholder="وصف المعاملة..." required></textarea>
                </div>
                <div class="form-group">
                    <label class="form-label">المبلغ</label>
                    <input type="number" class="form-input" name="amount" step="0.01" min="0" placeholder="0.00" required>
                </div>
                <div class="form-group">
                    <label class="form-label">العملة</label>
                    ${renderCurrencySelect('tx_currency', 'SAR')}
                </div>
                <div class="form-group" id="tx_exchange_rate_wrap" style="display:none">
                    <label class="form-label">سعر الصرف (1 وحدة = ؟ ريال) <span style="color:var(--danger,#ef4444)">*</span></label>
                    <input type="number" class="form-input" name="exchange_rate" id="tx_exchange_rate"
                        step="0.0001" min="0.0001" placeholder="مثال: 3.75 للدولار" value="1">
                </div>
                <div class="form-group">
                    <label class="form-label">المرفقات (اختياري)</label>
                    ${buildAttachmentUploader()}
                </div>
                <div class="modal-footer" style="padding:0;border:none;margin-top:1.5rem;">
                    <button type="button" class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
                    <button type="submit" class="btn btn-primary">إضافة المعاملة</button>
                </div>
            </form>
        `;

        openModal();
        requestAnimationFrame(() => {
            initSearchableSelects();
            const curEl = document.getElementById('tx_currency');
            if (curEl) curEl.addEventListener('change', e => _onTxCurrencyChange(e.target.value));
        });
    } catch (error) {
        showToast('خطأ في تحميل البيانات', 'error');
    }
}

/** يُعالج تغيير العملة في نموذج المعاملة */
function _onTxCurrencyChange(val) {
    const wrap = document.getElementById('tx_exchange_rate_wrap');
    if (wrap) wrap.style.display = val && val !== 'SAR' ? '' : 'none';
}

function onTxParentChange(parentId) {
    const allTypes = window._txAllTypes || [];
    const subs = allTypes.filter(t => t.parent_id == parentId);
    const wrap = document.getElementById('tx_sub_wrap');
    const btnsDiv = document.getElementById('tx_sub_btns');
    const hidden = document.getElementById('tx_type_id_hidden');

    if (subs.length === 0) {
        // لا يوجد فرعي — الرئيسي هو النوع النهائي
        wrap.style.display = 'none';
        hidden.value = parentId;
        return;
    }

    // يوجد فرعي — أظهر الأزرار وأفرغ الاختيار
    hidden.value = '';
    wrap.style.display = 'block';
    btnsDiv.innerHTML = subs.map(s => `
        <button type="button" class="tx-sub-btn" data-id="${s.id}"
            onclick="selectTxSubType(${s.id}, this)">
            ${s.name}
        </button>`).join('');
}

function selectTxSubType(subId, btn) {
    document.getElementById('tx_type_id_hidden').value = subId;
    document.querySelectorAll('.tx-sub-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}






// ══════════════════════════════════════════════════════════════
//  نظام المرفقات المتعددة
// ══════════════════════════════════════════════════════════════

// حالة المرفقات في نموذج الإضافة/التعديل
var _pendingAttachments = [];  // [{file, displayName}]

/** بناء واجهة رفع المرفقات المتعددة */
function buildAttachmentUploader() {
    return `
    <div class="att-uploader" id="attUploader">
        <div class="att-drop-zone" id="attDropZone" onclick="document.getElementById('attFileInput').click()"
             ondragover="event.preventDefault();this.classList.add('dragging')"
             ondragleave="this.classList.remove('dragging')"
             ondrop="event.preventDefault();this.classList.remove('dragging');handleAttachmentDrop(event)">
            <div class="att-drop-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                </svg>
            </div>
            <p class="att-drop-text">اسحب الملفات هنا أو <span class="att-drop-link">اضغط للاختيار</span></p>
            <p class="att-drop-hint">PDF · صورة · Word · Excel — بحد أقصى 10 ميجابايت للملف</p>
        </div>
        <input type="file" id="attFileInput" multiple accept=".pdf,.jpg,.jpeg,.png,.gif,.doc,.docx,.xls,.xlsx"
               style="display:none" onchange="handleAttachmentFiles(this.files)">
        <div class="att-list" id="attList"></div>
    </div>`;
}

function getFileIcon(name) {
    var ext = (name || '').split('.').pop().toLowerCase();
    var icons = {
        pdf: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/></svg>',
        doc: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
        xls: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
        img: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
    };
    if (['jpg', 'jpeg', 'png', 'gif'].includes(ext)) return icons.img;
    if (['doc', 'docx'].includes(ext)) return icons.doc;
    if (['xls', 'xlsx'].includes(ext)) return icons.xls;
    return icons.pdf;
}

function fmtFileSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function handleAttachmentDrop(e) {
    handleAttachmentFiles(e.dataTransfer.files);
}

function handleAttachmentFiles(fileList) {
    Array.from(fileList).forEach(function (file) {
        if (file.size > 10 * 1024 * 1024) {
            showToast('الملف "' + file.name + '" يتجاوز 10 ميجابايت', 'error');
            return;
        }
        _pendingAttachments.push({ file: file, displayName: '' });
    });
    renderPendingAttachments();
}

function renderPendingAttachments() {
    var list = document.getElementById('attList');
    if (!list) return;
    if (!_pendingAttachments.length) { list.innerHTML = ''; return; }

    list.innerHTML = _pendingAttachments.map(function (att, i) {
        return `<div class="att-item" id="attItem${i}">
            <div class="att-item-icon">${getFileIcon(att.file.name)}</div>
            <div class="att-item-body">
                <div class="att-item-filename">${att.file.name}</div>
                <div class="att-item-size">${fmtFileSize(att.file.size)}</div>
                <input class="att-item-label" type="text" placeholder="اسم المرفق (اختياري)"
                       value="${att.displayName}"
                       oninput="_pendingAttachments[${i}].displayName = this.value">
            </div>
            <button class="att-item-remove" onclick="_pendingAttachments.splice(${i},1);renderPendingAttachments()" title="إزالة">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>
        </div>`;
    }).join('');
}

/** تجميع FormData مع المرفقات */
function appendAttachmentsToFormData(fd) {
    _pendingAttachments.forEach(function (att, i) {
        fd.append('attachments[]', att.file);
        fd.append('attachment_labels[]', att.displayName || att.file.name);
    });
}

/** عرض المرفقات في التفاصيل الموسعة */
function renderAttachmentsSection(txId, atts) {
    var canEdit = canDo('transaction.add') || canDo('transaction.edit');
    var items = atts.map(function (a) {
        var ext = (a.file_name || a.display_name || '').split('.').pop().toLowerCase();
        var isImg = ['jpg', 'jpeg', 'png', 'gif'].includes(ext);
        return `<div class="att-card">
            <div class="att-card-icon">${getFileIcon(a.file_name || a.display_name)}</div>
            <div class="att-card-body">
                <div class="att-card-name">${a.display_name || a.file_name || 'مستند'}</div>
                ${a.file_size ? '<div class="att-card-meta">' + fmtFileSize(a.file_size) + '</div>' : ''}
                ${a.created_at ? '<div class="att-card-meta">' + (a.created_at || '').split(' ')[0] + '</div>' : ''}
            </div>
            <div class="att-card-actions">
                <button class="att-card-btn view" onclick="event.stopPropagation();openPDF('${a.file_path}')" title="استعراض">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                    </svg> استعراض
                </button>
                ${canEdit && a.id && a.id !== 'legacy' ? `<button class="att-card-btn del" onclick="event.stopPropagation();deleteOneAttachment(${a.id},${txId})" title="حذف">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg> حذف
                </button>` : ''}
            </div>
        </div>`;
    }).join('');

    return `<div class="attachment-section">
        <div class="attachment-header">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
            </svg>
            المرفقات ${atts.length ? '<span class="att-count-badge">' + atts.length + '</span>' : ''}
            ${canEdit ? `<button class="att-add-inline" onclick="event.stopPropagation();openUploadModal(${txId})" title="إضافة مرفق">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg> إضافة
            </button>` : ''}
        </div>
        ${atts.length ? '<div class="att-cards-grid">' + items + '</div>'
            : '<div class="no-attachment"><p>لا توجد مرفقات</p></div>'}
    </div>`;
}

/** مودال رفع مرفق لمعاملة موجودة */
function openUploadModal(txId) {
    _pendingAttachments = [];
    DOM.modalTitle.textContent = 'إضافة مرفقات';
    DOM.modalBody.innerHTML = `
        <div style="margin-bottom:1.2rem">
            <p style="font-size:.85rem;color:var(--text-muted);margin-bottom:1rem">أضف مرفقات للمعاملة. يمكنك إضافة عدة ملفات دفعة واحدة وتسمية كل منها.</p>
            ${buildAttachmentUploader()}
        </div>
        <div class="modal-footer" style="padding:0;border:none;margin-top:1rem">
            <button type="button" class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
            <button type="button" class="btn btn-primary" onclick="saveUploadedAttachments(${txId})">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                </svg> رفع الملفات
            </button>
        </div>`;
    openModal();
}

async function saveUploadedAttachments(txId) {
    if (!_pendingAttachments.length) { showToast('اختر ملفاً على الأقل', 'error'); return; }
    var fd = new FormData();
    fd.append('transaction_id', txId);
    appendAttachmentsToFormData(fd);
    try {
        var res = await fetch('api/?action=upload_attachment', { method: 'POST', body: fd });
        var data = await res.json();
        if (data.success) {
            showToast('تم رفع المرفقات بنجاح', 'success');
            closeModal();
            loadTransactions();
        } else { showToast(data.message || 'خطأ في الرفع', 'error'); }
    } catch { showToast('خطأ في الاتصال', 'error'); }
}

async function deleteOneAttachment(attId, txId) {
    if (!confirm('هل أنت متأكد من حذف هذا المرفق؟')) return;
    try {
        var res = await fetch('api/?action=delete_attachment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ attachment_id: attId, transaction_id: txId })
        });
        var data = await res.json();
        if (data.success) { showToast('تم حذف المرفق', 'success'); loadTransactions(); }
        else showToast(data.message || 'خطأ', 'error');
    } catch { showToast('خطأ في الاتصال', 'error'); }
}

// --- توافق مع الكود القديم ---
function uploadAttachment(txId) { openUploadModal(txId); }
function deleteAttachment(txId) { deleteOneAttachment('legacy', txId); }

// إرسال نموذج الإضافة
async function submitAddForm(e) {
    e.preventDefault();
    const form = e.target;
    const typeId = document.getElementById('tx_type_id_hidden')?.value;
    if (!typeId) {
        showToast('⚠️ اختر نوع المعاملة', 'warning');
        return;
    }
    const formData = new FormData(form);
    // إضافة العملة من searchableSelect (اسمه tx_currency في الـ hidden input)
    const txCurrency = document.getElementById('tx_currency')?.value || 'SAR';
    formData.set('currency', txCurrency);
    const txRate = document.getElementById('tx_exchange_rate')?.value;
    if (txRate) formData.set('exchange_rate', txRate);
    formData.delete('attachment');
    appendAttachmentsToFormData(formData);
    try {
        const res = await fetch('api/?action=add', { method: 'POST', body: formData });
        const result = await res.json();
        if (result.success) {
            _pendingAttachments = [];
            showToast('تم إضافة المعاملة بنجاح', 'success');
            closeModal();
            loadTransactions();
        } else { showToast(result.message || 'خطأ في الإضافة', 'error'); }
    } catch { showToast('خطأ في الاتصال', 'error'); }
}

// فتح ملف
function openPDF(path) {
    if (path) window.open(path, '_blank');
}

// تحميل وعرض أحداث المعاملة
async function loadTransactionEvents(transactionId) {
    const container = document.getElementById('events-container-' + transactionId);
    if (!container) return;

    // Toggle visibility
    if (container.style.display === 'none') {
        container.style.display = 'block';
        container.innerHTML = '<div class="loading-events">جاري التحميل...</div>';

        try {
            const res = await fetch('api/?action=transaction_events&transaction_id=' + transactionId);
            const result = await res.json();

            if (result.success && result.data.length > 0) {
                let html = '<div class="events-timeline">';

                const stageNames = {
                    'creation': 'الإنشاء',
                    'receiving': 'الاستلام',
                    'budget': 'الموازنة',
                    'payment': 'الدفع',
                    'invoice': 'الفوترة'
                };

                const stageColors = {
                    'creation': '#4dabf7',
                    'receiving': '#69db7c',
                    'budget': '#3bc9db',
                    'payment': '#ffa94d',
                    'invoice': '#b197fc'
                };

                result.data.forEach((event, index) => {
                    const stageName = stageNames[event.stage] || event.stage;
                    const stageColor = stageColors[event.stage] || '#888';
                    const duration = event.duration_from_previous;
                    const durationText = duration !== null ? formatEventDuration(duration) : '';

                    html += '<div class="event-item">';
                    html += '<div class="event-dot" style="background: ' + stageColor + ';"></div>';
                    html += '<div class="event-line"></div>';
                    html += '<div class="event-content">';

                    // Header
                    html += '<div class="event-header">';
                    html += '<span class="event-stage" style="background: ' + stageColor + ';">' + stageName + '</span>';
                    if (durationText) {
                        html += '<span class="event-duration">' + durationText + '</span>';
                    }
                    html += '</div>';

                    // Status change
                    html += '<div class="event-status-change">';
                    if (event.old_status && event.new_status) {
                        html += '<span class="old-status">' + event.old_status + '</span>';
                        html += '<span class="status-arrow">←</span>';
                        html += '<span class="new-status">' + event.new_status + '</span>';
                    } else if (event.new_status) {
                        html += '<span class="new-status">' + event.new_status + '</span>';
                    }
                    html += '</div>';

                    // Notes (reason)
                    if (event.notes) {
                        html += '<div class="event-notes">';
                        html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';
                        html += '<span>' + event.notes + '</span>';
                        html += '</div>';
                    }

                    // Footer (employee & time)
                    html += '<div class="event-footer">';
                    html += '<span class="event-employee">';
                    html += '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>';
                    html += ' ' + (event.employee_name || 'النظام');
                    html += '</span>';
                    html += '<span class="event-time">' + formatEventTime(event.event_time) + '</span>';
                    html += '</div>';

                    html += '</div>'; // event-content
                    html += '</div>'; // event-item
                });

                html += '</div>';
                container.innerHTML = html;
            } else {
                container.innerHTML = '<div class="no-events">لا توجد أحداث مسجلة</div>';
            }
        } catch (error) {
            container.innerHTML = '<div class="error-events">خطأ في تحميل الأحداث</div>';
        }
    } else {
        container.style.display = 'none';
    }
}

// تنسيق مدة الحدث
function formatEventDuration(minutes) {
    if (minutes === null || minutes === undefined) return '';
    if (minutes === 0) return 'فوري';
    if (minutes < 60) return minutes + ' دقيقة';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours < 24) {
        return hours + ' ساعة' + (mins > 0 ? ' و ' + mins + ' دقيقة' : '');
    }
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return days + ' يوم' + (remainingHours > 0 ? ' و ' + remainingHours + ' ساعة' : '');
}

// تنسيق وقت الحدث
function formatEventTime(datetime) {
    if (!datetime) return '';
    const date = new Date(datetime);
    const options = {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    };
    return date.toLocaleDateString('ar-SA', options);
}

// openUploadModal مُعرَّفة في قسم نظام المرفقات المتعددة أعلاه

// تعديل معاملة — تصميم محترف

// banner قفل المرحلة للموظف
function _stageLockBanner(stageName, color) {
    return `<div style="
        display:flex;align-items:center;gap:.75rem;
        padding:1rem 1.25rem;
        background:rgba(239,68,68,.07);
        border:1.5px solid rgba(239,68,68,.25);
        border-radius:12px;margin-bottom:.5rem;color:#ef4444">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
        <div>
          <div style="font-weight:700;font-size:.9rem">مرحلة ${stageName} مُقفلة</div>
          <div style="font-size:.78rem;color:var(--text-muted);margin-top:.2rem">
            تم اعتماد هذه المرحلة — التعديل متاح لمدير النظام فقط
          </div>
        </div>
    </div>`;
}

async function editTransaction(id) {
    const tx = App.transactions.find(t => t.id == id);
    if (!tx) return;
    App.editingTransaction = tx;
    const userRole = (typeof currentUser !== 'undefined') ? currentUser.role : '';

    try {
        // تحديد الصلاحيات
        const isAdmin = userRole === 'admin';
        const showReceive = isAdmin || userRole === 'receiver' || userRole === '';
        const showBudget = isAdmin || userRole === 'budget' || userRole === '';
        const showDispatch = isAdmin || userRole === 'dispatch';
        const showPayment = isAdmin || userRole === 'payment' || userRole === '';
        const showInvoice = isAdmin || userRole === 'invoice' || userRole === '';

        // ═══ قفل المراحل المكتملة/المعتمدة للموظفين (Admin يتجاوزها) ═══
        const lockedReceive = !isAdmin && (tx.receive_status === 'مستلم');
        const lockedBudget = !isAdmin && (tx.budget_status === 'معتمد');
        const lockedDispatch = !isAdmin && (tx.dispatch_data?.status === 'تم التوجيه' || tx.dispatch_data?.status === 'مكتمل');
        const lockedPayment = !isAdmin && (tx.payment_status === 'تم الدفع');
        const lockedInvoice = !isAdmin && (tx.invoice_status === 'صدرت الفاتورة');

        const firstTab = showReceive ? 'receiving'
            : showBudget ? 'budget'
                : showDispatch ? 'dispatch'
                    : showPayment ? 'payment'
                        : 'invoice';

        const esc = v => (v || '').toString()
            .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
            .replace(/</g, '&lt;').replace(/>/g, '&gt;');

        const amount = tx.amount
            ? fmtMoneyCur(tx.amount, tx.currency)
            : '—';

        // تعريف التبويبات النشطة
        const tabs = [];
        if (showReceive) tabs.push({ id: 'receiving', label: 'استلام', icon: '📥', color: 'var(--accent-green)' });
        if (showBudget) tabs.push({ id: 'budget', label: 'موازنة', icon: '🏦', color: 'var(--accent-cyan)' });
        if (showDispatch) tabs.push({ id: 'dispatch', label: 'توجيه', icon: '🔀', color: '#818cf8' });
        if (showPayment) tabs.push({ id: 'payment', label: 'دفع', icon: '💳', color: 'var(--accent-orange)' });
        if (showInvoice) tabs.push({ id: 'invoice', label: 'فوترة', icon: '🧾', color: 'var(--accent-amber)' });

        DOM.modalTitle.innerHTML = `<span style="font-size:.85rem;font-weight:500;color:var(--text-muted)">تعديل المعاملة</span>`;

        DOM.modalBody.innerHTML = `
        <div class="edit-modal-wrap">

          <!-- رأس المعاملة -->
          <div class="edit-tx-header">
            <div class="edit-tx-meta">
              <div class="edit-tx-num">${esc(tx.transaction_number)}</div>
              <div class="edit-tx-desc">${esc(tx.description || tx.transaction_type || '—')}</div>
            </div>
            <div class="edit-tx-amount">${amount}</div>
          </div>

          <!-- شريط مراحل التقدم -->
          <div class="edit-stages-bar">
            ${tabs.map((t, i) => `
              <div class="edit-stage-step ${t.id === firstTab ? 'active' : ''}"
                   onclick="editModalSwitchTab('${t.id}')" style="--clr:${t.color}">
                <div class="edit-stage-dot">${t.icon}</div>
                <div class="edit-stage-lbl">${t.label}</div>
              </div>
              ${i < tabs.length - 1 ? '<div class="edit-stage-line"></div>' : ''}
            `).join('')}
          </div>

          <!-- لوحة التبويبات -->
          <div class="edit-tabs-body">

            ${showReceive ? `
            <div class="edit-tab-panel ${firstTab === 'receiving' ? 'active' : ''}" data-tab="receiving">
              ${lockedReceive ? _stageLockBanner('الاستلام', 'var(--accent-green)') : ''}
              <form onsubmit="submitUpdateForm(event,'receiving')" style="${lockedReceive ? 'pointer-events:none;opacity:.55;user-select:none' : ''}">
                <input type="hidden" name="transaction_id" value="${tx.id}">
                <div class="edit-auto-badge" style="--c:var(--accent-green)">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 10-16 0"/>
                  </svg>يُسجَّل التحديث باسمك تلقائياً
                </div>
                <div class="edit-field-group">
                  <label class="edit-field-label">الحالة</label>
                  <select class="edit-field-select" name="status">
                    <option value="تم الإنشاء"   ${(!tx.receive_status || tx.receive_status === 'تم الإنشاء' || tx.receive_status === 'في الانتظار') ? 'selected' : ''} disabled>📋 تم الإنشاء</option>
                    <option value="مستلم"        ${tx.receive_status === 'مستلم' ? 'selected' : ''}>✅ مستلم</option>
                  </select>
                </div>
                <div class="edit-field-group">
                  <label class="edit-field-label">ملاحظات</label>
                  <textarea class="edit-field-textarea" name="notes" placeholder="أضف ملاحظاتك...">${esc(tx.receive_notes)}</textarea>
                </div>
                <div class="edit-form-actions">
                  <button type="button" class="edit-btn-cancel" onclick="closeModal()">إلغاء</button>
                  <button type="submit" class="edit-btn-save" style="--c:var(--accent-green)">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    حفظ
                  </button>
                </div>
              </form>
            </div>` : ''}

            ${showBudget ? `
            <div class="edit-tab-panel ${firstTab === 'budget' ? 'active' : ''}" data-tab="budget">
              ${lockedBudget ? _stageLockBanner('الموازنة', 'var(--accent-cyan)') : ''}
              <form onsubmit="submitUpdateForm(event,'budget')" style="${lockedBudget ? 'pointer-events:none;opacity:.55;user-select:none' : ''}">
                <input type="hidden" name="transaction_id" value="${tx.id}">
                <div class="edit-auto-badge" style="--c:var(--accent-cyan)">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 10-16 0"/>
                  </svg>يُسجَّل التحديث باسمك تلقائياً
                </div>
                <div class="edit-field-row">
                  <div class="edit-field-group">
                    <label class="edit-field-label">رمز الموازنة</label>
                    ${tx.budget_code
                    ? `<div style="min-height:38px;padding:.45rem .75rem;background:rgba(30,64,175,.06);
                              border:1.5px solid rgba(30,64,175,.25);border-radius:8px;
                              font-family:var(--font-primary);font-weight:700;color:#1e40af;font-size:.88rem;
                              display:flex;align-items:center;letter-spacing:.5px">
                              ${esc(tx.budget_code)}
                           </div>
                           <input type="hidden" name="budget_code" value="${esc(tx.budget_code)}">`
                    : `<input class="edit-field-input" name="budget_code" value="" placeholder="يُعبَّأ تلقائياً عند ربط الحجز"
                              style="color:var(--text-muted)" readonly>`
                }
                  </div>
                  <div class="edit-field-group">
                    <label class="edit-field-label">الحالة</label>
                    <select class="edit-field-select" name="status">
                      <option value="معلق"         ${tx.budget_status === 'معلق' ? 'selected' : ''}>⏸ معلق</option>
                      <option value="قيد المراجعة" ${tx.budget_status === 'قيد المراجعة' ? 'selected' : ''}>🔄 قيد المراجعة</option>
                      <option value="معتمد"        ${tx.budget_status === 'معتمد' ? 'selected' : ''}>✅ معتمد</option>
                      <option value="مرفوض"        ${tx.budget_status === 'مرفوض' ? 'selected' : ''}>❌ مرفوض</option>
                    </select>
                  </div>
                </div>
                <div class="edit-field-group">
                  <label class="edit-field-label">ملاحظات</label>
                  <textarea class="edit-field-textarea" name="notes" placeholder="ملاحظات الموازنة...">${esc(tx.budget_notes)}</textarea>
                </div>
                <div class="edit-form-actions">
                  <button type="button" class="edit-btn-cancel" onclick="closeModal()">إلغاء</button>
                  <button type="submit" class="edit-btn-save" style="--c:var(--accent-cyan)">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    حفظ
                  </button>
                </div>
              </form>
            </div>` : ''}

            ${showDispatch ? (() => {
                const dd = tx.dispatch_data || {};
                const isRouted = dd.status === 'تم التوجيه' || dd.status === 'مكتمل';
                const isPaused = dd.ola_active == 0;
                const dtMap = { 'to_payment': '⚡ دفع مباشر', 'to_purchase_order': '📋 أمر شراء', 'to_requester': '↩️ جهة طالبة' };
                return `
            <div class="edit-tab-panel ${firstTab === 'dispatch' ? 'active' : ''}" data-tab="dispatch">
              ${isRouted ? `<div class="edit-dispatch-done">
                <span style="font-size:1.4rem">✅</span>
                <div>
                  <div style="font-weight:700;color:#818cf8">تم التوجيه</div>
                  <div style="font-size:.82rem;color:var(--text-muted);margin-top:.15rem">
                    ${dtMap[dd.dispatch_type] || '—'}${dd.routed_to ? ' — ' + esc(dd.routed_to) : ''}
                  </div>
                </div>
                ${isPaused ? `<button onclick="openResumeDispatchModal(${tx.id})" class="edit-btn-resume">▶️ استئناف</button>` : ''}
              </div>
              ${isPaused ? `<div class="edit-ola-paused-banner">⏸️ OLA معلّق — بانتظار عودة أمر الشراء</div>` : ''}` : ''}
              ${lockedDispatch ? _stageLockBanner('التوجيه', '#818cf8') : ''}
              <form onsubmit="submitDispatch(event,${tx.id})" style="${lockedDispatch ? 'pointer-events:none;opacity:.55;user-select:none' : ''}">
                <input type="hidden" name="transaction_id" value="${tx.id}">
                <div class="edit-field-group" style="margin-bottom:1.2rem">
                  <label class="edit-field-label" style="font-weight:700;margin-bottom:.7rem">اختر المسار</label>
                  <div class="edit-dispatch-options">
                    <label class="edit-dispatch-opt">
                      <input type="radio" name="dispatch_type" value="to_payment"
                        ${(!dd.dispatch_type || dd.dispatch_type === 'to_payment') ? 'checked' : ''}>
                      <div class="edit-dispatch-card" style="--oc:#818cf8">
                        <span class="edit-dispatch-emoji">⚡</span>
                        <strong>دفع مباشر</strong>
                        <span class="edit-dispatch-sub">OLA يستمر</span>
                      </div>
                    </label>
                    <label class="edit-dispatch-opt">
                      <input type="radio" name="dispatch_type" value="to_purchase_order"
                        ${dd.dispatch_type === 'to_purchase_order' ? 'checked' : ''}>
                      <div class="edit-dispatch-card" style="--oc:#f59e0b">
                        <span class="edit-dispatch-emoji">📋</span>
                        <strong>أمر شراء</strong>
                        <span class="edit-dispatch-sub">OLA يُعلَّق</span>
                      </div>
                    </label>
                    <label class="edit-dispatch-opt">
                      <input type="radio" name="dispatch_type" value="to_requester"
                        ${dd.dispatch_type === 'to_requester' ? 'checked' : ''}>
                      <div class="edit-dispatch-card" style="--oc:#ec4899">
                        <span class="edit-dispatch-emoji">↩️</span>
                        <strong>جهة طالبة</strong>
                        <span class="edit-dispatch-sub">OLA يُعلَّق</span>
                      </div>
                    </label>
                  </div>
                </div>
                <div class="edit-field-group">
                  <label class="edit-field-label">الجهة <span style="font-weight:400;color:var(--text-muted)">(اختياري)</span></label>
                  <input class="edit-field-input" name="routed_to" value="${esc(dd.routed_to)}" placeholder="سلاسل الإمداد — قسم المشتريات">
                </div>
                <div class="edit-field-group">
                  <label class="edit-field-label">ملاحظات</label>
                  <textarea class="edit-field-textarea" name="notes" rows="2" placeholder="تعليمات...">${esc(dd.notes)}</textarea>
                </div>
                <div class="edit-form-actions">
                  <button type="button" class="edit-btn-cancel" onclick="closeModal()">إلغاء</button>
                  <button type="submit" class="edit-btn-save" style="--c:#818cf8">🔀 توجيه</button>
                </div>
              </form>
            </div>`;
            })() : ''}

            ${showPayment ? `
            <div class="edit-tab-panel ${firstTab === 'payment' ? 'active' : ''}" data-tab="payment">
              ${lockedPayment ? _stageLockBanner('الدفع', 'var(--accent-orange)') : ''}
              <form onsubmit="submitUpdateForm(event,'payment')" style="${lockedPayment ? 'pointer-events:none;opacity:.55;user-select:none' : ''}">
                <input type="hidden" name="transaction_id" value="${tx.id}">
                <div class="edit-auto-badge" style="--c:var(--accent-orange)">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 10-16 0"/>
                  </svg>يُسجَّل التحديث باسمك تلقائياً
                </div>
                <div class="edit-payment-method-tag">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>
                  </svg>طريقة الدفع: تحويل بنكي
                </div>
                <div class="edit-field-row">
                  <div class="edit-field-group">
                    <label class="edit-field-label">الحالة</label>
                    <select class="edit-field-select" name="status">
                      <option value="معلق"         ${tx.payment_status === 'معلق' ? 'selected' : ''}>⏸ معلق</option>
                      <option value="قيد المعالجة" ${tx.payment_status === 'قيد المعالجة' ? 'selected' : ''}>🔄 قيد المعالجة</option>
                      <option value="تم الدفع"     ${tx.payment_status === 'تم الدفع' ? 'selected' : ''}>✅ تم الدفع</option>
                      <option value="مرفوض"        ${tx.payment_status === 'مرفوض' ? 'selected' : ''}>❌ مرفوض</option>
                    </select>
                  </div>
                  <div class="edit-field-group">
                    <label class="edit-field-label">رقم المرجع</label>
                    <input class="edit-field-input" name="reference" value="${esc(tx.reference_number)}" placeholder="REF-XXXX">
                  </div>
                </div>
                <div class="edit-field-group">
                  <label class="edit-field-label">ملاحظات</label>
                  <textarea class="edit-field-textarea" name="notes" placeholder="ملاحظات الدفع...">${esc(tx.payment_notes)}</textarea>
                </div>
                <div class="edit-form-actions">
                  <button type="button" class="edit-btn-cancel" onclick="closeModal()">إلغاء</button>
                  <button type="submit" class="edit-btn-save" style="--c:var(--accent-orange)">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    حفظ
                  </button>
                </div>
              </form>
            </div>` : ''}

            ${showInvoice ? `
            <div class="edit-tab-panel ${firstTab === 'invoice' ? 'active' : ''}" data-tab="invoice">
              ${lockedInvoice ? _stageLockBanner('الفوترة', 'var(--accent-amber)') : ''}
              <form onsubmit="submitUpdateForm(event,'invoice')" style="${lockedInvoice ? 'pointer-events:none;opacity:.55;user-select:none' : ''}">
                <input type="hidden" name="transaction_id" value="${tx.id}">
                <div class="edit-auto-badge" style="--c:var(--accent-amber)">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 10-16 0"/>
                  </svg>يُسجَّل التحديث باسمك تلقائياً
                </div>
                <div class="edit-field-row">
                  <div class="edit-field-group">
                    <label class="edit-field-label">رقم الفاتورة</label>
                    <input class="edit-field-input" name="invoice_number" value="${esc(tx.invoice_number)}" placeholder="INV-XXXX">
                  </div>
                  <div class="edit-field-group">
                    <label class="edit-field-label">الحالة</label>
                    <select class="edit-field-select" name="status">
                      <option value="">— اختر —</option>
                      <option value="قيد الإصدار"   ${tx.invoice_status === 'قيد الإصدار' ? 'selected' : ''}>🔄 قيد الإصدار</option>
                      <option value="صدرت الفاتورة" ${tx.invoice_status === 'صدرت الفاتورة' ? 'selected' : ''}>✅ صدرت الفاتورة</option>
                      <option value="بدون فاتورة"  ${tx.invoice_status === 'بدون فاتورة' ? 'selected' : ''}>➖ بدون فاتورة</option>
                      <option value="ملغاة"         ${tx.invoice_status === 'ملغاة' ? 'selected' : ''}>❌ ملغاة</option>
                    </select>
                  </div>
                </div>
                <div class="edit-field-group">
                  <label class="edit-field-label">نوع التنبيه</label>
                  <div class="edit-alert-chips">
                    <label class="edit-alert-chip" style="--cc:#64748b">
                      <input type="radio" name="alert_type" value="انتظار"  ${tx.alert_type === 'انتظار' ? 'checked' : ''}>
                      <span>⏳ انتظار</span>
                    </label>
                    <label class="edit-alert-chip" style="--cc:var(--accent-amber)">
                      <input type="radio" name="alert_type" value="متابعة" ${tx.alert_type === 'متابعة' ? 'checked' : ''}>
                      <span>⚠️ متابعة</span>
                    </label>
                    <label class="edit-alert-chip" style="--cc:var(--accent-red)">
                      <input type="radio" name="alert_type" value="عاجل"   ${tx.alert_type === 'عاجل' ? 'checked' : ''}>
                      <span>🔴 عاجل</span>
                    </label>
                    <label class="edit-alert-chip" style="--cc:var(--accent-green)">
                      <input type="radio" name="alert_type" value="مكتمل"  ${tx.alert_type === 'مكتمل' ? 'checked' : ''}>
                      <span>✅ مكتمل</span>
                    </label>
                  </div>
                </div>
                <div class="edit-field-group">
                  <label class="edit-field-label">ملاحظات</label>
                  <textarea class="edit-field-textarea" name="notes" placeholder="ملاحظات الفوترة...">${esc(tx.invoice_notes)}</textarea>
                </div>
                <div class="edit-form-actions">
                  <button type="button" class="edit-btn-cancel" onclick="closeModal()">إلغاء</button>
                  <button type="submit" class="edit-btn-save" style="--c:var(--accent-amber)">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    حفظ
                  </button>
                </div>
              </form>
            </div>` : ''}

          </div>
        </div>`;

        // ربط dispatch cards
        document.querySelectorAll('.edit-dispatch-opt input[type=radio]').forEach(r => {
            const upd = () => {
                document.querySelectorAll('.edit-dispatch-card').forEach(c => c.classList.remove('selected'));
                document.querySelectorAll('.edit-dispatch-opt input:checked').forEach(x =>
                    x.closest('.edit-dispatch-opt').querySelector('.edit-dispatch-card').classList.add('selected'));
            };
            r.addEventListener('change', upd);
            if (r.checked) upd();
        });

        openModal();
    } catch (err) {
        showToast('خطأ في تحميل البيانات', 'error');
        console.error(err);
    }
}

// تبديل تبويبات النموذج
window.editModalSwitchTab = function (tabId) {
    document.querySelectorAll('.edit-tab-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.edit-stage-step').forEach(s => s.classList.remove('active'));
    const panel = document.querySelector(`.edit-tab-panel[data-tab="${tabId}"]`);
    const step = document.querySelector(`.edit-stage-step[onclick*="${tabId}"]`);
    if (panel) panel.classList.add('active');
    if (step) step.classList.add('active');
};

function switchModalTab(tab, btn) {
    if (typeof editModalSwitchTab === 'function') { editModalSwitchTab(tab); return; }
}

// إرسال نموذج التحديث
async function submitUpdateForm(e, type) {
    e.preventDefault();

    // ── فحص القفل: لا يُرسل إذا كانت المرحلة مقفلة للموظف ──
    const tx = App.editingTransaction;
    const userRole = (typeof currentUser !== 'undefined') ? currentUser.role : '';
    const isAdmin = userRole === 'admin';
    if (!isAdmin && tx) {
        const lockMap = {
            receiving: tx.receive_status === 'مستلم',
            budget: tx.budget_status === 'معتمد',
            payment: tx.payment_status === 'تم الدفع',
            invoice: tx.invoice_status === 'صدرت الفاتورة',
        };
        if (lockMap[type]) {
            showToast('هذه المرحلة مُقفلة — التعديل متاح لمدير النظام فقط', 'error');
            return;
        }
    }

    const form = e.target;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    const actionMap = {
        'receiving': 'update_receiving',
        'budget': 'update_budget',
        'payment': 'update_payment',
        'invoice': 'update_invoice'
    };

    try {
        const res = await fetch('api/?action=' + actionMap[type], {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        const result = await res.json();

        if (result.success) {
            showToast('تم الحفظ بنجاح', 'success');
            closeModal();
            loadTransactions();
        } else {
            showToast(result.message || 'خطأ في الحفظ', 'error');
        }
    } catch (error) {
        showToast('خطأ في الاتصال', 'error');
    }
}

// ─── إرسال قرار الفرز ─────────────────────────────────────────
async function submitDispatch(e, txId) {
    e.preventDefault();
    // فحص قفل مرحلة التوجيه
    const _tx = App.editingTransaction;
    const _role = (typeof currentUser !== 'undefined') ? currentUser.role : '';
    if (_role !== 'admin' && _tx) {
        const _dd = _tx.dispatch_data || {};
        if (_dd.status === 'تم التوجيه' || _dd.status === 'مكتمل') {
            showToast('مرحلة التوجيه مُقفلة — التعديل متاح لمدير النظام فقط', 'error');
            return;
        }
    }
    const form = e.target;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    data.transaction_id = txId;

    const btn = form.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ جارٍ التوجيه...'; }

    try {
        const res = await fetch('api/?action=dispatch_save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await res.json();

        if (result.success) {
            const typeLabels = {
                'to_payment': '⚡ تم التوجيه للدفع المباشر',
                'to_purchase_order': '📋 تم الإرسال لإصدار أمر الشراء — OLA معلّق',
                'to_requester': '↩️ تم الإرسال للجهة الطالبة — OLA معلّق',
            };
            showToast(typeLabels[result.dispatch_type] || 'تم التوجيه بنجاح', 'success');
            closeModal();
            loadTransactions();
        } else {
            showToast(result.message || 'خطأ في التوجيه', 'error');
            if (btn) { btn.disabled = false; btn.textContent = '🔀 توجيه المعاملة'; }
        }
    } catch (err) {
        showToast('خطأ في الاتصال', 'error');
        if (btn) { btn.disabled = false; btn.textContent = '🔀 توجيه المعاملة'; }
    }
}

// ─── استئناف للدفع بعد عودة أمر الشراء ───────────────────────
function openResumeDispatchModal(txId) {
    // Modal بسيط لتأكيد الاستئناف
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem';
    overlay.innerHTML = `
        <div style="background:var(--bg-card);border-radius:14px;padding:1.5rem;max-width:420px;width:100%;
                    border:1px solid var(--border);box-shadow:0 20px 60px rgba(0,0,0,.3)">
            <h3 style="margin:0 0 1rem;font-size:1.05rem">▶️ استئناف المعاملة للدفع</h3>
            <p style="font-size:.88rem;color:var(--text-muted);margin-bottom:1rem">
                عند الاستئناف سيُعاد تشغيل OLA وتنتقل المعاملة لمرحلة الدفع
            </p>
            <div class="form-group" style="margin-bottom:1rem">
                <label class="form-label">ملاحظات الاستئناف</label>
                <textarea id="resumeNotes" class="form-textarea" rows="2"
                          placeholder="مثال: وصل أمر الشراء رقم PO-2025-001"></textarea>
            </div>
            <div style="display:flex;gap:.5rem;justify-content:flex-end">
                <button onclick="this.closest('[style*=fixed]').remove()"
                        class="btn btn-secondary">إلغاء</button>
                <button onclick="confirmResumeDispatch(${txId}, this)"
                        class="btn btn-primary" style="background:#6366f1;border-color:#6366f1">
                    ▶️ استئناف
                </button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
}

async function confirmResumeDispatch(txId, btn) {
    const notes = document.getElementById('resumeNotes')?.value || '';
    btn.disabled = true;
    btn.textContent = '⏳...';
    try {
        const res = await fetch('api/?action=dispatch_resume', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transaction_id: txId, notes })
        });
        const result = await res.json();
        if (result.success) {
            btn.closest('[style*="position:fixed"]')?.remove();
            showToast('✅ تم استئناف المعاملة للدفع', 'success');
            closeModal();
            loadTransactions();
        } else {
            showToast(result.message || 'خطأ', 'error');
            btn.disabled = false;
            btn.textContent = '▶️ استئناف';
        }
    } catch (err) {
        showToast('خطأ في الاتصال', 'error');
        btn.disabled = false;
        btn.textContent = '▶️ استئناف';
    }
}

// عرض معاملة
function viewTransaction(id) {
    switchTab('transactions');

    // ننتظر حتى يكتمل تحميل الجدول ثم نفتح الصف
    let attempts = 0;
    const tryExpand = setInterval(function () {
        const tbody = document.getElementById('transactionsBody');
        attempts++;
        if (tbody && (App.transactions?.length || attempts > 10)) {
            clearInterval(tryExpand);
            App.expandedRow = id;
            tbody.innerHTML = renderTransactionRows(App.transactions);
            // تمرير الصفحة للصف المفتوح
            setTimeout(function () {
                const row = document.querySelector(`[data-id="${id}"]`);
                if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
        }
    }, 150);
}
// ═══════════════════════════════════════════════════════════════
//  مودال تفاصيل المعاملة الاحترافي
// ═══════════════════════════════════════════════════════════════

function openTxDetailModal(tx) {
    // إزالة أي مودال سابق
    var old = document.getElementById('tx-detail-overlay');
    if (old) old.remove();

    var esc = function (v) { return (v || '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
    var drow = function (lbl, val, style) {
        return '<div class="tdm-row"><span class="tdm-lbl">' + lbl + '</span><span class="tdm-val"' + (style ? ' style="' + style + '"' : '') + '>' + (val || '—') + '</span></div>';
    };

    // حالة المعاملة الكلية
    var overallStatus = 'لم تبدأ';
    var statusCls = 'tdm-badge-pending';
    if (tx.invoice_status === 'صدرت الفاتورة') { overallStatus = 'مكتملة'; statusCls = 'tdm-badge-done'; }
    else if (tx.payment_status === 'تم الدفع') { overallStatus = 'جارية'; statusCls = 'tdm-badge-active'; }
    else if (tx.budget_status === 'معتمد') { overallStatus = 'جارية'; statusCls = 'tdm-badge-active'; }
    else if (tx.receive_status === 'مستلم') { overallStatus = 'جارية'; statusCls = 'tdm-badge-active'; }
    else if (tx.receive_status === 'تم الإنشاء' || tx.receive_status === 'في الانتظار' || !tx.receive_status) { overallStatus = 'لم تبدأ'; statusCls = 'tdm-badge-pending'; }

    // أيقونة النوع
    var typeIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>';

    // مراحل pipeline
    var dtLabels = { 'to_payment': 'دفع مباشر', 'to_purchase_order': 'أمر شراء', 'to_requester': 'جهة طالبة' };
    var dtColors = { 'to_payment': 'var(--accent-green)', 'to_purchase_order': 'var(--accent-amber)', 'to_requester': 'var(--accent-purple)' };
    var hasDispatch = !!tx.dispatch_type;
    var dispatchPaused = tx.dispatch_ola_active == 0;

    var pipelineHtml = [
        {
            cls: 'tdm-stage-green', color: 'var(--accent-green)',
            icon: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>',
            label: 'الاستلام', badge: getStatusBadge(tx.receive_status),
            body: drow('الموظف', tx.receiver_name) + drow('التاريخ', tx.receive_date) + (tx.receive_notes ? drow('ملاحظات', tx.receive_notes) : '')
        },
        {
            cls: 'tdm-stage-cyan', color: 'var(--accent-cyan)',
            icon: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
            label: 'الموازنة', badge: getStatusBadge(tx.budget_status),
            body: drow('الموظف', tx.budget_employee_name) + (tx.budget_code ? drow('الرمز', tx.budget_code, 'color:var(--accent-cyan)') : drow('الرمز', '')) + drow('التاريخ', tx.budget_date) + (tx.budget_notes ? drow('ملاحظات', tx.budget_notes) : '')
        },
        {
            cls: 'tdm-stage-indigo', color: '#818cf8',
            icon: '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
            label: 'التوجيه', badge: hasDispatch ? getStatusBadge(tx.dispatch_status) : '',
            body: hasDispatch ? (drow('الموظف', tx.dispatch_employee_name) + '<div class="tdm-row"><span class="tdm-lbl">المسار</span><span class="tdm-val" style="color:' + (dtColors[tx.dispatch_type] || 'var(--text-muted)') + ';font-weight:600">' + (dtLabels[tx.dispatch_type] || tx.dispatch_type || '—') + '</span></div>' + (tx.routed_to ? drow('الجهة', tx.routed_to) : '') + (dispatchPaused ? '<div class="tdm-paused-badge">⏸ OLA معلّق</div>' : '') + (tx.dispatch_notes ? drow('ملاحظات', tx.dispatch_notes) : '')) : '<div class="tdm-empty">لم يتم بعد</div>'
        },
        {
            cls: 'tdm-stage-orange', color: 'var(--accent-orange)',
            icon: '<rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>',
            label: 'الدفع', badge: getStatusBadge(tx.payment_status),
            body: drow('الموظف', tx.payment_employee_name) + (tx.reference_number ? drow('المرجع', tx.reference_number, 'color:var(--accent-blue)') : '') + drow('التاريخ', tx.payment_date) + (tx.payment_notes ? drow('ملاحظات', tx.payment_notes) : '')
        },
        {
            cls: 'tdm-stage-purple', color: 'var(--accent-purple)',
            icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
            label: 'الفوترة', badge: getStatusBadge(tx.invoice_status),
            body: drow('الموظف', tx.invoice_employee_name) + (tx.invoice_number ? drow('رقم الفاتورة', tx.invoice_number, 'color:var(--accent-blue)') : '') + drow('التاريخ', tx.invoice_date) + (tx.alert_type ? '<div class="tdm-row"><span class="tdm-lbl">التنبيه</span><span class="tdm-val">' + getAlertBadge(tx.alert_type) + '</span></div>' : '') + (tx.invoice_notes ? drow('ملاحظات', tx.invoice_notes) : '')
        }
    ].map(function (s) {
        return '<div class="tdm-stage ' + s.cls + '">' +
            '<div class="tdm-stage-head">' +
            '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' + s.icon + '</svg>' +
            '<span class="tdm-stage-label">' + s.label + '</span>' +
            (s.badge ? '<span class="tdm-stage-badge-wrap">' + s.badge + '</span>' : '') +
            '</div>' +
            '<div class="tdm-stage-body">' + s.body + '</div>' +
            '</div>';
    }).join('');

    // المرفقات
    var txAtts = tx.attachments || (tx.attachment ? [{ id: 'legacy', file_path: tx.attachment, display_name: tx.attachment_name || 'مستند', file_size: null, created_at: null }] : []);
    var attsHtml = txAtts.length === 0
        ? '<div class="tdm-empty">لا توجد مرفقات</div>'
        : txAtts.map(function (a) {
            return '<div class="tdm-att-item">' +
                '<div class="tdm-att-icon"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#e53935" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>' +
                '<div class="tdm-att-info"><div class="tdm-att-name">' + esc(a.display_name || a.file_name || 'مستند') + '</div>' +
                '<div class="tdm-att-size">' + (a.file_size ? Math.round(a.file_size / 1024) + ' KB' : '') + (a.created_at ? ' — ' + a.created_at.slice(0, 10) : '') + '</div></div>' +
                '<button class="tdm-att-btn" onclick="openPDF(\'' + esc(a.file_path) + '\')" title="فتح">' +
                '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>' +
                '</button></div>';
        }).join('');

    var attTabLabel = 'المرفقات' + (txAtts.length ? ' (' + txAtts.length + ')' : '');

    // الهيكل الكامل للمودال
    var html = '<div id="tx-detail-overlay" class="tdm-overlay" onclick="closeTxDetailModal(event)">' +
        '<div class="tdm-modal" onclick="event.stopPropagation()">' +

        // Header
        '<div class="tdm-head">' +
        '<div class="tdm-head-icon">' + typeIcon + '</div>' +
        '<div class="tdm-head-info">' +
        '<div class="tdm-head-num">' + esc(tx.transaction_number) + '</div>' +
        '<div class="tdm-head-desc">' + esc(tx.transaction_type || '') + (tx.transaction_sub_type ? ' — ' + esc(tx.transaction_sub_type) : '') + (tx.description ? ' • ' + esc(tx.description) : '') + '</div>' +
        '</div>' +
        '<div class="tdm-head-right">' +
        '<span class="tdm-amount">' + fmtMoneyCur(tx.amount, tx.currency) + '</span>' +
        '<span class="tdm-overall-badge ' + statusCls + '">' + overallStatus + '</span>' +
        '</div>' +
        '<button class="tdm-close" onclick="closeTxDetailModal(null)" title="إغلاق">✕</button>' +
        '</div>' +

        // Meta bar
        '<div class="tdm-meta-bar">' +
        '<div class="tdm-meta-item"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/></svg>أنشأ بواسطة <strong>' + esc(tx.created_by_name || 'النظام') + '</strong></div>' +
        '<div class="tdm-meta-dot"></div>' +
        '<div class="tdm-meta-item"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' + formatCreationTime(tx.creation_time) + '</div>' +
        '<div class="tdm-meta-dot"></div>' +
        '<div class="tdm-meta-item"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 10c-.83 0-1.5-.67-1.5-1.5v-5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5z"/><path d="M20.5 10H19V8.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>أولوية <strong>' + (tx.priority === 'urgent' ? 'عاجلة' : tx.priority === 'high' ? 'مرتفعة' : 'عادية') + '</strong></div>' +
        '</div>' +

        // Pipeline
        '<div class="tdm-pipeline">' + pipelineHtml + '</div>' +

        // Tabs
        '<div class="tdm-tabs">' +
        '<button class="tdm-tab tdm-tab-active" onclick="tdmSwitchTab(this,\'tdm-events\')">سجل الأحداث</button>' +
        '<button class="tdm-tab" onclick="tdmSwitchTab(this,\'tdm-atts\')">' + attTabLabel + '</button>' +
        '</div>' +

        // Tab: سجل الأحداث
        '<div id="tdm-events" class="tdm-tab-body">' +
        '<div id="tdm-events-inner" class="tdm-events-list">' +
        '<div class="tdm-events-loading">جاري تحميل الأحداث...</div>' +
        '</div></div>' +

        // Tab: المرفقات
        '<div id="tdm-atts" class="tdm-tab-body" style="display:none">' +
        '<div class="tdm-att-grid">' + attsHtml + '</div>' +
        '</div>' +

        // Footer
        '<div class="tdm-footer">' +
        '<div class="tdm-footer-left">' +
        '<button class="tdm-btn" onclick="event.stopPropagation();editTransaction(' + tx.id + ');closeTxDetailModal(null)">' +
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>تعديل' +
        '</button>' +
        '</div>' +
        '<button class="tdm-btn tdm-btn-primary" onclick="closeTxDetailModal(null)">إغلاق</button>' +
        '</div>' +

        '</div></div>';

    document.body.insertAdjacentHTML('beforeend', html);

    // أنيميشن فتح
    setTimeout(function () {
        var el = document.getElementById('tx-detail-overlay');
        if (el) el.classList.add('tdm-active');
    }, 10);

    // تحميل الأحداث
    loadTxDetailEvents(tx.id);
}

function closeTxDetailModal(event) {
    if (event && event.target && !event.target.classList.contains('tdm-overlay')) return;
    var el = document.getElementById('tx-detail-overlay');
    if (!el) return;
    el.classList.remove('tdm-active');
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 280);
}

function tdmSwitchTab(btn, tabId) {
    var modal = document.getElementById('tx-detail-overlay');
    if (!modal) return;
    modal.querySelectorAll('.tdm-tab').forEach(function (t) { t.classList.remove('tdm-tab-active'); });
    modal.querySelectorAll('.tdm-tab-body').forEach(function (t) { t.style.display = 'none'; });
    btn.classList.add('tdm-tab-active');
    var panel = document.getElementById(tabId);
    if (panel) panel.style.display = 'block';
}

async function loadTxDetailEvents(txId) {
    var container = document.getElementById('tdm-events-inner');
    if (!container) return;
    try {
        var res = await fetch('api/?action=transaction_events&transaction_id=' + txId);
        var result = await res.json();
        if (!result.success || !result.data || !result.data.length) {
            container.innerHTML = '<div class="tdm-empty">لا توجد أحداث مسجلة</div>';
            return;
        }
        var stageNames = { creation: 'الإنشاء', receiving: 'الاستلام', budget: 'الموازنة', dispatch: 'التوجيه', payment: 'الدفع', invoice: 'الفوترة' };
        var stageColors = { creation: 'var(--text-muted)', receiving: 'var(--accent-green)', budget: 'var(--accent-cyan)', dispatch: '#818cf8', payment: 'var(--accent-orange)', invoice: 'var(--accent-purple)' };
        var stageBg = { creation: 'rgba(148,163,184,.08)', receiving: 'rgba(105,219,124,.1)', budget: 'rgba(59,201,219,.1)', dispatch: 'rgba(129,140,248,.1)', payment: 'rgba(255,169,77,.1)', invoice: 'rgba(177,151,252,.1)' };

        var html = result.data.map(function (ev, idx) {
            var isLast = idx === result.data.length - 1;
            var color = stageColors[ev.stage] || 'var(--text-muted)';
            var bg = stageBg[ev.stage] || 'rgba(148,163,184,.08)';
            var name = stageNames[ev.stage] || ev.stage;
            var changeHtml = '';
            if (ev.old_status && ev.new_status) {
                changeHtml = '<div class="tdm-ev-change">' +
                    '<span class="tdm-ev-old">' + ev.old_status + '</span>' +
                    '<span class="tdm-ev-arr">←</span>' +
                    '<span class="tdm-ev-new">' + ev.new_status + '</span>' +
                    '</div>';
            } else if (ev.new_status) {
                changeHtml = '<div class="tdm-ev-change"><span class="tdm-ev-new">' + ev.new_status + '</span></div>';
            }
            if (ev.notes) changeHtml += '<div class="tdm-ev-notes">' + ev.notes + '</div>';
            var duration = ev.duration_from_previous ? formatEventDuration(ev.duration_from_previous) : '';

            return '<div class="tdm-ev-item">' +
                '<div class="tdm-ev-dot-wrap">' +
                '<div class="tdm-ev-dot" style="background:' + bg + '">' +
                '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' +
                '</div>' +
                (!isLast ? '<div class="tdm-ev-line"></div>' : '') +
                '</div>' +
                '<div class="tdm-ev-content">' +
                '<div class="tdm-ev-header">' +
                '<span class="tdm-ev-tag" style="background:' + bg + ';color:' + color + '">' + name + '</span>' +
                '<span class="tdm-ev-action">' + (ev.action || '') + '</span>' +
                (duration ? '<span class="tdm-ev-dur">' + duration + '</span>' : '') +
                '<span class="tdm-ev-time">' + (ev.event_time || '').slice(0, 16).replace('T', ' ') + '</span>' +
                '</div>' +
                changeHtml +
                '</div></div>';
        }).join('');

        container.innerHTML = html;
    } catch (e) {
        container.innerHTML = '<div class="tdm-empty">تعذر تحميل الأحداث</div>';
    }
}