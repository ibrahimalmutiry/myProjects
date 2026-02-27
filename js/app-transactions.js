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
    currentFilter: 'all'
};

// ═══════════════════════════════════════════════════════════
//  تحميل وعرض المعاملات
// ═══════════════════════════════════════════════════════════

/**
 * تحميل قائمة المعاملات من الخادم
 * تُنشئ الجدول الرئيسي للمعاملات مع الفلاتر
 */
async function loadTransactions() {
    showLoading();

    try {
        const res = await fetch('api/?action=transactions');
        const data = await res.json();

        if (data.success) {
            App.transactions = data.data;
            renderTransactions();
        } else {
            showToast('خطأ في تحميل المعاملات', 'error');
        }
    } catch (error) {
        showToast('خطأ في الاتصال', 'error');
        console.error(error);
    }
}

// عرض المعاملات
function renderTransactions() {
    const html = `
        <div class="toolbar">
            <div class="toolbar-search">
                <div class="search-input">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="8"></circle>
                        <path d="m21 21-4.35-4.35"></path>
                    </svg>
                    <input type="text" id="searchInput" placeholder="بحث في المعاملات..." oninput="filterTransactions()">
                </div>
                <select id="statusFilter" class="filter-select" onchange="filterTransactions()">
                    <option value="">جميع الحالات</option>
                    <option value="عاجل">عاجل</option>
                    <option value="متابعة">يحتاج متابعة</option>
                    <option value="مكتمل">مكتمل</option>
                    <option value="تم الدفع">تم الدفع</option>
                    <option value="معلق">معلق</option>
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
            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>رقم المعاملة</th>
                            <th>التاريخ</th>
                            <th>النوع</th>
                            <th>الوصف</th>
                            <th>المبلغ</th>
                            <th class="th-green">الاستلام</th>
                            <th class="th-cyan">الموازنة</th>
                            <th class="th-orange">الدفع</th>
                            <th class="th-purple">الفوترة</th>
                            <th>التنبيه</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody id="transactionsBody">
                        ${renderTransactionRows(App.transactions)}
                    </tbody>
                </table>
            </div>
        </div>
    `;

    DOM.mainContent.innerHTML = html;
}

// ========== دالة عرض صفوف المعاملات ==========
function renderTransactionRows(transactions) {
    if (!transactions || !transactions.length) {
        return '<tr><td colspan="11" style="text-align: center; padding: 3rem; color: var(--text-muted);">لا توجد معاملات</td></tr>';
    }

    let html = '';

    for (let i = 0; i < transactions.length; i++) {
        const tx = transactions[i];
        const isExpanded = (App.expandedRow == tx.id);

        // صف المعاملة الرئيسي
        html += '<tr class="transaction-row ' + (isExpanded ? 'expanded' : '') + '" data-id="' + tx.id + '" onclick="toggleRow(' + tx.id + ')">';
        html += '<td><span class="tx-number">' + tx.transaction_number + '</span></td>';
        html += '<td>' + tx.transaction_date + '</td>';
        html += '<td><span class="tx-type">' + (tx.transaction_type || '—') + '</span></td>';
        html += '<td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + tx.description + '</td>';
        html += '<td><span class="tx-amount">' + formatNumber(tx.amount) + '<small>ر.س</small></span></td>';
        html += '<td>' + getStatusBadge(tx.receive_status) + '</td>';
        html += '<td>' + getStatusBadge(tx.budget_status) + '</td>';
        html += '<td>' + getStatusBadge(tx.payment_status) + '</td>';
        html += '<td>' + getStatusBadge(tx.invoice_status) + '</td>';
        html += '<td>' + getAlertBadge(tx.alert_type) + '</td>';
        html += '<td>';
        html += '<div style="display: flex; align-items: center; gap: 0.5rem;">';

        // زر استعراض PDF
        if (tx.attachment) {
            html += '<button class="btn-icon btn-pdf" onclick="event.stopPropagation(); openPDF(\'' + tx.attachment + '\')" title="استعراض PDF">';
            html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><line x1="10" y1="9" x2="8" y2="9"></line></svg>';
            html += '</button>';
        }

        html += '<button class="btn-icon" onclick="event.stopPropagation(); editTransaction(' + tx.id + ')" title="تعديل">';
        html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';
        html += '</button>';
        html += '<svg class="expand-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--text-muted); transition: transform 0.3s; ' + (isExpanded ? 'transform: rotate(180deg);' : '') + '">';
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
            html += `<tr class="expanded-row"><td colspan="11" style="padding:0">`;
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
                    ${tx.budget_code ? drow('رمز الموازنة', tx.budget_code, 'font-family:monospace;color:var(--accent-cyan)') : ''}
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
                    ${tx.reference_number ? drow('المرجع', tx.reference_number, 'font-family:monospace;color:var(--accent-blue)') : ''}
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
                    ${tx.invoice_number ? drow('رقم الفاتورة', tx.invoice_number, 'font-family:monospace;color:var(--accent-blue)') : ''}
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
            html += `<div class="attachment-section">
                <div class="attachment-header">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                    </svg>
                    المرفقات
                </div>`;
            if (tx.attachment) {
                html += `<div class="attachment-file">
                    <div class="attachment-info">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/>
                        </svg>
                        <span>${tx.attachment_name || 'مستند.pdf'}</span>
                    </div>
                    <div class="attachment-actions">
                        <button class="btn btn-sm btn-primary" onclick="event.stopPropagation();openPDF('${tx.attachment}')">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                                <circle cx="12" cy="12" r="3"/>
                            </svg> استعراض
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="event.stopPropagation();deleteAttachment(${tx.id})">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"/>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg> حذف
                        </button>
                    </div>
                </div>`;
            } else {
                html += `<div class="no-attachment">
                    <p>لا يوجد مرفق</p>
                    <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation();uploadAttachment(${tx.id})">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="17 8 12 3 7 8"/>
                            <line x1="12" y1="3" x2="12" y2="15"/>
                        </svg> رفع ملف PDF
                    </button>
                </div>`;
            }
            html += `</div>`; // end attachment-section
            html += `</td></tr>`;
        }
    }

    return html;
}

// ========== دالة تبديل الصف الموسع ==========
function toggleRow(id) {
    if (App.expandedRow == id) {
        App.expandedRow = null;
    } else {
        App.expandedRow = id;
    }

    const tbody = document.getElementById('transactionsBody');
    if (tbody) {
        tbody.innerHTML = renderTransactionRows(App.transactions);
    }
}

// فلترة المعاملات
function filterTransactions() {
    const search = document.getElementById('searchInput')?.value.toLowerCase() || '';
    const status = document.getElementById('statusFilter')?.value || '';

    const filtered = App.transactions.filter(tx => {
        const matchSearch = !search ||
            tx.transaction_number.toLowerCase().includes(search) ||
            tx.description.toLowerCase().includes(search) ||
            (tx.transaction_type && tx.transaction_type.toLowerCase().includes(search));

        const matchStatus = !status ||
            tx.alert_type === status ||
            tx.payment_status === status ||
            tx.receive_status === status;

        return matchSearch && matchStatus;
    });

    App.expandedRow = null;
    document.getElementById('transactionsBody').innerHTML = renderTransactionRows(filtered);
}

// فتح مودال إضافة معاملة
async function openAddModal() {
    try {
        const [typesRes, employeesRes] = await Promise.all([
            fetch('api/?action=types'),
            fetch('api/?action=employees')
        ]);

        const types = await typesRes.json();

        let typeOptions = '';
        if (types.success) {
            types.data.forEach(t => {
                typeOptions += '<option value="' + t.id + '">' + t.name + '</option>';
            });
        }

        // التاريخ والوقت الحالي
        const now = new Date();
        const dateStr = now.toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const timeStr = now.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });

        DOM.modalTitle.textContent = 'إضافة معاملة جديدة';
        DOM.modalBody.innerHTML = `
            <form id="addForm" onsubmit="submitAddForm(event)" enctype="multipart/form-data">
                <div class="auto-date-info" style="background: var(--bg-surface); padding: 1rem; border-radius: 10px; margin-bottom: 1.5rem; display: flex; align-items: center; gap: 1rem;">
                    <div style="width: 45px; height: 45px; background: var(--btn-primary-bg); border-radius: 10px; display: flex; align-items: center; justify-content: center;">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--btn-primary-text)" stroke-width="2">
                            <circle cx="12" cy="12" r="10"></circle>
                            <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                    </div>
                    <div>
                        <div style="font-size: 0.8rem; color: var(--text-muted);">تاريخ ووقت الإنشاء</div>
                        <div style="font-weight: 600; color: var(--text-primary);">${dateStr} - ${timeStr}</div>
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">نوع المعاملة</label>
                    <select class="form-select" name="type_id" required>
                        <option value="">اختر النوع</option>
                        ${typeOptions}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">الوصف</label>
                    <textarea class="form-textarea" name="description" placeholder="وصف المعاملة..." required></textarea>
                </div>
                <div class="form-group">
                    <label class="form-label">المبلغ (ر.س)</label>
                    <input type="number" class="form-input" name="amount" step="0.01" min="0" placeholder="0.00" required>
                </div>
                <div class="form-group">
                    <label class="form-label">إرفاق ملف PDF (اختياري)</label>
                    <div class="file-upload-wrapper">
                        <input type="file" class="file-input" name="attachment" id="attachmentInput" accept=".pdf,application/pdf" onchange="handleFileSelect(this)">
                        <label for="attachmentInput" class="file-upload-label">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                <polyline points="14 2 14 8 20 8"></polyline>
                                <line x1="12" y1="18" x2="12" y2="12"></line>
                                <line x1="9" y1="15" x2="15" y2="15"></line>
                            </svg>
                            <span id="fileName">اختر ملف PDF أو اسحبه هنا</span>
                        </label>
                    </div>
                    <p class="file-hint">الحد الأقصى: 10 ميجابايت</p>
                </div>
                <div class="modal-footer" style="padding: 0; border: none; margin-top: 1.5rem;">
                    <button type="button" class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
                    <button type="submit" class="btn btn-primary">إضافة المعاملة</button>
                </div>
            </form>
        `;

        openModal();
    } catch (error) {
        showToast('خطأ في تحميل البيانات', 'error');
    }
}

// معالجة اختيار الملف
function handleFileSelect(input) {
    const fileName = document.getElementById('fileName');
    if (input.files && input.files[0]) {
        const file = input.files[0];
        if (file.type !== 'application/pdf') {
            showToast('يرجى اختيار ملف PDF فقط', 'error');
            input.value = '';
            fileName.textContent = 'اختر ملف PDF أو اسحبه هنا';
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            showToast('حجم الملف كبير جداً. الحد الأقصى 10 ميجابايت', 'error');
            input.value = '';
            fileName.textContent = 'اختر ملف PDF أو اسحبه هنا';
            return;
        }
        fileName.textContent = file.name;
    } else {
        fileName.textContent = 'اختر ملف PDF أو اسحبه هنا';
    }
}

// إرسال نموذج الإضافة
async function submitAddForm(e) {
    e.preventDefault();

    const form = e.target;
    const formData = new FormData(form);

    try {
        const res = await fetch('api/?action=add', {
            method: 'POST',
            body: formData
        });

        const result = await res.json();

        if (result.success) {
            showToast('تم إضافة المعاملة بنجاح', 'success');
            closeModal();
            loadTransactions();
        } else {
            showToast(result.message || 'خطأ في الإضافة', 'error');
        }
    } catch (error) {
        showToast('خطأ في الاتصال', 'error');
    }
}

// فتح ملف PDF
function openPDF(path) {
    if (path) {
        window.open(path, '_blank');
    }
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

// رفع مرفق لمعاملة موجودة
async function uploadAttachment(transactionId) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,application/pdf';

    input.onchange = async function () {
        if (input.files && input.files[0]) {
            const file = input.files[0];

            if (file.type !== 'application/pdf') {
                showToast('يرجى اختيار ملف PDF فقط', 'error');
                return;
            }

            if (file.size > 10 * 1024 * 1024) {
                showToast('حجم الملف كبير جداً', 'error');
                return;
            }

            const formData = new FormData();
            formData.append('transaction_id', transactionId);
            formData.append('attachment', file);

            try {
                const res = await fetch('api/?action=upload_attachment', {
                    method: 'POST',
                    body: formData
                });

                const result = await res.json();

                if (result.success) {
                    showToast('تم رفع الملف بنجاح', 'success');
                    loadTransactions();
                } else {
                    showToast(result.message || 'خطأ في رفع الملف', 'error');
                }
            } catch (error) {
                showToast('خطأ في الاتصال', 'error');
            }
        }
    };

    input.click();
}

// حذف مرفق
async function deleteAttachment(transactionId) {
    if (!confirm('هل أنت متأكد من حذف المرفق؟')) return;

    try {
        const res = await fetch('api/?action=delete_attachment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transaction_id: transactionId })
        });

        const result = await res.json();

        if (result.success) {
            showToast('تم حذف المرفق', 'success');
            loadTransactions();
        } else {
            showToast(result.message || 'خطأ في الحذف', 'error');
        }
    } catch (error) {
        showToast('خطأ في الاتصال', 'error');
    }
}

// تعديل معاملة — تصميم محترف
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

        const firstTab = showReceive ? 'receiving'
            : showBudget ? 'budget'
                : showDispatch ? 'dispatch'
                    : showPayment ? 'payment'
                        : 'invoice';

        const esc = v => (v || '').toString()
            .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
            .replace(/</g, '&lt;').replace(/>/g, '&gt;');

        const amount = tx.amount
            ? Number(tx.amount).toLocaleString('ar-SA', { minimumFractionDigits: 2 }) + ' ر.س'
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
              <form onsubmit="submitUpdateForm(event,'receiving')">
                <input type="hidden" name="transaction_id" value="${tx.id}">
                <div class="edit-auto-badge" style="--c:var(--accent-green)">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 10-16 0"/>
                  </svg>يُسجَّل التحديث باسمك تلقائياً
                </div>
                <div class="edit-field-group">
                  <label class="edit-field-label">الحالة</label>
                  <select class="edit-field-select" name="status">
                    <option value="معلق"         ${tx.receive_status === 'معلق' ? 'selected' : ''}>⏸ معلق</option>
                    <option value="مستلم"        ${tx.receive_status === 'مستلم' ? 'selected' : ''}>✅ مستلم</option>
                    <option value="قيد المراجعة" ${tx.receive_status === 'قيد المراجعة' ? 'selected' : ''}>🔄 قيد المراجعة</option>
                    <option value="مرفوض"        ${tx.receive_status === 'مرفوض' ? 'selected' : ''}>❌ مرفوض</option>
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
              <form onsubmit="submitUpdateForm(event,'budget')">
                <input type="hidden" name="transaction_id" value="${tx.id}">
                <div class="edit-auto-badge" style="--c:var(--accent-cyan)">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 10-16 0"/>
                  </svg>يُسجَّل التحديث باسمك تلقائياً
                </div>
                <div class="edit-field-row">
                  <div class="edit-field-group">
                    <label class="edit-field-label">رمز الموازنة</label>
                    <input class="edit-field-input" name="budget_code" value="${esc(tx.budget_code)}" placeholder="BUD-XXXX">
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
              <form onsubmit="submitDispatch(event,${tx.id})">
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
              <form onsubmit="submitUpdateForm(event,'payment')">
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
              <form onsubmit="submitUpdateForm(event,'invoice')">
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



// ═══════════════════════════════════════════════════════════
//  صفحة الإعدادات — الهيكل والتنقل
// ═══════════════════════════════════════════════════════════

/**
 * تحميل صفحة الإعدادات الرئيسية
 * تعرض: الموظفون / الأداء / أنواع المعاملات / جميع المعاملات / النظام
 */
// تحميل صفحة الإعدادات
async function loadSettingsPage() {
    DOM.mainContent.innerHTML = `
        <div class="settings-page-new">

            <!-- شريط التبويبات العلوي -->
            <div class="settings-topbar">
                <button class="settings-tab-btn active" data-section="employees" onclick="showSettingsSection('employees', this)">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                        <circle cx="9" cy="7" r="4"></circle>
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                        <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                    </svg>
                    الموظفين
                </button>
                <button class="settings-tab-btn" data-section="types" onclick="showSettingsSection('types', this)">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="8" y1="6" x2="21" y2="6"></line>
                        <line x1="8" y1="12" x2="21" y2="12"></line>
                        <line x1="8" y1="18" x2="21" y2="18"></line>
                        <line x1="3" y1="6" x2="3.01" y2="6"></line>
                        <line x1="3" y1="12" x2="3.01" y2="12"></line>
                        <line x1="3" y1="18" x2="3.01" y2="18"></line>
                    </svg>
                    أنواع المعاملات
                </button>
                <button class="settings-tab-btn" data-section="all-transactions" onclick="showSettingsSection('all-transactions', this)">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                    </svg>
                    جميع المعاملات
                </button>
                <button class="settings-tab-btn" data-section="system" onclick="showSettingsSection('system', this)">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="3"></circle>
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                    </svg>
                    النظام
                </button>
            </div>

            <!-- المحتوى -->
            <div class="settings-content" id="settingsContent"></div>
        </div>
    `;

    await loadSettingsEmployees();
    showSettingsSection('employees', document.querySelector('.settings-tab-btn'));
}

// عرض قسم في الإعدادات
function showSettingsSection(section, btn) {
    document.querySelectorAll('.settings-tab-btn, .settings-nav-btn').forEach(function (b) {
        b.classList.remove('active');
    });
    if (btn) btn.classList.add('active');

    if (section === 'employees') {
        renderEmployeesSection();
    } else if (section === 'types') {
        renderTypesSection();
    } else if (section === 'all-transactions') {
        renderAllTransactionsSection();
    } else if (section === 'system') {
        renderSystemSection();
    }
}

// ========== قسم الموظفين ==========
async function loadSettingsEmployees() {
    try {
        var res = await fetch('api/?action=employees');
        var data = await res.json();
        if (data.success) {
            SettingsData.employees = data.data;
        }
    } catch (e) {
        console.error(e);
    }
}

function renderEmployeesSection() {
    var content = document.getElementById('settingsContent');

    var html = '<div class="settings-section-header">';
    html += '<h2>إدارة الموظفين</h2>';
    html += '<button class="btn btn-primary" onclick="openAddEmployeeModal()">';
    html += '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>';
    html += ' إضافة موظف';
    html += '</button>';
    html += '</div>';

    // فلتر الأقسام
    html += '<div class="filter-tabs">';
    html += '<button class="filter-tab ' + (SettingsData.currentFilter === 'all' ? 'active' : '') + '" onclick="filterEmployees(\'all\', this)">الكل</button>';
    html += '<button class="filter-tab ' + (SettingsData.currentFilter === 'admin' ? 'active' : '') + '" onclick="filterEmployees(\'admin\', this)">المديرين</button>';
    html += '<button class="filter-tab ' + (SettingsData.currentFilter === 'receiver' ? 'active' : '') + '" onclick="filterEmployees(\'receiver\', this)">الاستلام</button>';
    html += '<button class="filter-tab ' + (SettingsData.currentFilter === 'budget' ? 'active' : '') + '" onclick="filterEmployees(\'budget\', this)">الموازنة</button>';
    html += '<button class="filter-tab ' + (SettingsData.currentFilter === 'payment' ? 'active' : '') + '" onclick="filterEmployees(\'payment\', this)">الدفع</button>';
    html += '<button class="filter-tab ' + (SettingsData.currentFilter === 'invoice' ? 'active' : '') + '" onclick="filterEmployees(\'invoice\', this)">الفوترة</button>';
    html += '</div>';

    // بطاقات الموظفين
    html += '<div class="employees-grid">';

    var filtered = SettingsData.employees;
    if (SettingsData.currentFilter !== 'all') {
        filtered = SettingsData.employees.filter(function (e) {
            return e.role === SettingsData.currentFilter;
        });
    }

    if (filtered.length === 0) {
        html += '<div class="empty-state">لا يوجد موظفين</div>';
    } else {
        for (var i = 0; i < filtered.length; i++) {
            var emp = filtered[i];
            // جلب اسم المشرف
            var supervisorName = '';
            if (emp.supervisor_id) {
                var sup = SettingsData.employees.find(function (e) { return e.id == emp.supervisor_id; });
                supervisorName = sup ? sup.name : '';
            }

            html += '<div class="employee-card">';
            html += '<div class="employee-avatar">' + emp.employee_number + '</div>';
            html += '<div class="employee-info">';
            html += '<h4>' + emp.name + '</h4>';
            html += '<span class="role-badge role-' + emp.role + '">' + getRoleName(emp.role) + '</span>';
            html += '<p class="employee-contact">' + (emp.email || '—') + '</p>';
            html += '<p class="employee-contact">' + (emp.phone || '—') + '</p>';
            if (supervisorName) {
                html += '<p class="employee-contact" style="color:var(--accent-blue);font-size:.8rem">';
                html += '👤 المشرف: ' + supervisorName;
                html += '</p>';
            } else {
                html += '<p class="employee-contact" style="color:var(--text-muted);font-size:.78rem">';
                html += '👤 المشرف: مدير النظام (افتراضي)';
                html += '</p>';
            }
            html += '</div>';
            html += '<div class="employee-actions">';
            if (canDo('employee.permissions')) {
                html += '<button class="btn-icon-sm perm-btn" onclick="openPermissionsModal(' + emp.id + ', \'' + emp.name + '\')" title="إدارة الصلاحيات" style="color:var(--accent-blue);border-color:var(--accent-blue)">';
                html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>';
                html += '</button>';
            }
            if (canDo('employee.edit')) {
                html += '<button class="btn-icon-sm" onclick="editEmployee(' + emp.id + ')" title="تعديل"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>';
            }
            if (canDo('employee.delete')) {
                html += '<button class="btn-icon-sm btn-danger-icon" onclick="deleteEmployee(' + emp.id + ', \'' + emp.name + '\')" title="حذف"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>';
            }
            html += '</div>';
            html += '</div>';
        }
    }

    html += '</div>';
    content.innerHTML = html;
}

function getRoleName(role) {
    var roles = {
        'admin': 'مدير النظام',
        'receiver': 'الاستلام',
        'budget': 'الموازنة',
        'payment': 'الدفع',
        'invoice': 'الفوترة'
    };
    return roles[role] || role;
}

function filterEmployees(role, btn) {
    SettingsData.currentFilter = role;
    document.querySelectorAll('.filter-tab').forEach(function (t) {
        t.classList.remove('active');
    });
    btn.classList.add('active');
    renderEmployeesSection();
}

function _roleLabel(role) {
    return { admin: 'مدير', receiver: 'استلام', budget: 'موازنة', payment: 'دفع', invoice: 'فوترة' }[role] || role;
}

function openAddEmployeeModal() {
    const supervisorOptions = (SettingsData.employees || [])
        .filter(e => e.is_active != 0)
        .map(e => `<option value="${e.id}">${e.name} (${_roleLabel(e.role)})</option>`)
        .join('');

    DOM.modalTitle.textContent = 'إضافة موظف جديد';
    DOM.modalBody.innerHTML = `
        <form id="employeeForm" onsubmit="saveEmployee(event)">
            <input type="hidden" name="id" id="empId" value="">
            <div class="modal-form-grid">
                <div class="form-group">
                    <label class="form-label">اسم الموظف</label>
                    <input type="text" class="form-input" name="name" id="empName" required>
                </div>
                <div class="form-group">
                    <label class="form-label">البريد الإلكتروني</label>
                    <input type="email" class="form-input" name="email" id="empEmail">
                </div>
                <div class="form-group">
                    <label class="form-label">رقم الهاتف</label>
                    <input type="text" class="form-input" name="phone" id="empPhone">
                </div>
                <div class="form-group">
                    <label class="form-label">القسم / الدور</label>
                    <select class="form-select" name="role" id="empRole" required>
                        <option value="">اختر القسم</option>
                        <option value="admin">مدير النظام</option>
                        <option value="receiver">الاستلام</option>
                        <option value="budget">الموازنة</option>
                        <option value="payment">الدفع</option>
                        <option value="invoice">الفوترة</option>
                    </select>
                </div>
            </div>
            <div class="form-group" style="margin-top:.5rem">
                <label class="form-label">
                    👤 المشرف المباشر
                    <span style="font-size:.78rem;color:var(--text-muted);font-weight:400">
                        (يُصعَّد إليه عند تجاوزOLA/SLA)
                    </span>
                </label>
                <select class="form-select" name="supervisor_id" id="empSupervisor">
                    <option value="">— بدون مشرف (يُصعَّد لمدير النظام) —</option>
                    ${supervisorOptions}
                </select>
            </div>
            <div class="modal-footer" style="padding: 0; border: none; margin-top: 1.5rem;">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
                <button type="submit" class="btn btn-primary">حفظ</button>
            </div>
        </form>
    `;
    openModal();
}

function editEmployee(id) {
    var emp = SettingsData.employees.find(function (e) { return e.id == id; });
    if (!emp) return;

    const supervisorOptions = (SettingsData.employees || [])
        .filter(e => e.is_active != 0 && e.id != emp.id)
        .map(e => `<option value="${e.id}" ${emp.supervisor_id == e.id ? 'selected' : ''}>${e.name} (${_roleLabel(e.role)})</option>`)
        .join('');

    DOM.modalTitle.textContent = 'تعديل موظف';
    DOM.modalBody.innerHTML = `
        <form id="employeeForm" onsubmit="saveEmployee(event)">
            <input type="hidden" name="id" id="empId" value="${emp.id}">
            <div class="modal-form-grid">
                <div class="form-group">
                    <label class="form-label">اسم الموظف</label>
                    <input type="text" class="form-input" name="name" id="empName" value="${emp.name}" required>
                </div>
                <div class="form-group">
                    <label class="form-label">البريد الإلكتروني</label>
                    <input type="email" class="form-input" name="email" id="empEmail" value="${emp.email || ''}">
                </div>
                <div class="form-group">
                    <label class="form-label">رقم الهاتف</label>
                    <input type="text" class="form-input" name="phone" id="empPhone" value="${emp.phone || ''}">
                </div>
                <div class="form-group">
                    <label class="form-label">القسم / الدور</label>
                    <select class="form-select" name="role" id="empRole" required>
                        <option value="admin" ${emp.role === 'admin' ? 'selected' : ''}>مدير النظام</option>
                        <option value="receiver" ${emp.role === 'receiver' ? 'selected' : ''}>الاستلام</option>
                        <option value="budget" ${emp.role === 'budget' ? 'selected' : ''}>الموازنة</option>
                        <option value="payment" ${emp.role === 'payment' ? 'selected' : ''}>الدفع</option>
                        <option value="invoice" ${emp.role === 'invoice' ? 'selected' : ''}>الفوترة</option>
                    </select>
                </div>
            </div>
            <div class="form-group" style="margin-top:.5rem">
                <label class="form-label">
                    👤 المشرف المباشر
                    <span style="font-size:.78rem;color:var(--text-muted);font-weight:400">
                        (يُصعَّد إليه عند تجاوزOLA/SLA)
                    </span>
                </label>
                <select class="form-select" name="supervisor_id" id="empSupervisor">
                    <option value="">— بدون مشرف (يُصعَّد لمدير النظام) —</option>
                    ${supervisorOptions}
                </select>
            </div>
            <div class="modal-footer" style="padding: 0; border: none; margin-top: 1.5rem;">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
                <button type="submit" class="btn btn-primary">حفظ</button>
            </div>
        </form>
    `;
    openModal();
}

async function saveEmployee(e) {
    e.preventDefault();

    var id = document.getElementById('empId').value;
    var supervisorEl = document.getElementById('empSupervisor');
    var data = {
        name: document.getElementById('empName').value,
        email: document.getElementById('empEmail').value,
        phone: document.getElementById('empPhone').value,
        role: document.getElementById('empRole').value,
        supervisor_id: supervisorEl ? (supervisorEl.value || null) : null
    };

    if (id) data.id = id;

    var action = id ? 'update_employee' : 'add_employee';

    try {
        var res = await fetch('api/settings.php?action=' + action, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        var result = await res.json();

        if (result.success) {
            showToast(id ? 'تم تحديث الموظف' : 'تم إضافة الموظف', 'success');
            closeModal();
            await loadSettingsEmployees();
            renderEmployeesSection();
        } else {
            showToast(result.message || 'خطأ', 'error');
        }
    } catch (err) {
        showToast('خطأ في الاتصال', 'error');
    }
}

async function deleteEmployee(id, name) {
    if (!confirm('هل أنت متأكد من حذف الموظف "' + name + '"؟')) return;

    try {
        var res = await fetch('api/settings.php?action=delete_employee', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id })
        });

        var result = await res.json();

        if (result.success) {
            showToast('تم حذف الموظف', 'success');
            await loadSettingsEmployees();
            renderEmployeesSection();
        } else {
            showToast(result.message || 'خطأ في الحذف', 'error');
        }
    } catch (err) {
        showToast('خطأ في الاتصال', 'error');
    }
}

// ========== قسم أنواع المعاملات ==========
async function loadSettingsTypes() {
    try {
        var res = await fetch('api/?action=types');
        var data = await res.json();
        if (data.success) {
            SettingsData.types = data.data;
        }
    } catch (e) {
        console.error(e);
    }
}

async function renderTypesSection() {
    await loadSettingsTypes();

    var content = document.getElementById('settingsContent');

    var html = '<div class="settings-section-header">';
    html += '<h2>أنواع المعاملات</h2>';
    html += '<button class="btn btn-primary" onclick="openAddTypeModal()">';
    html += '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>';
    html += ' إضافة نوع';
    html += '</button>';
    html += '</div>';

    html += '<div class="types-grid">';

    if (SettingsData.types.length === 0) {
        html += '<div class="empty-state">لا يوجد أنواع</div>';
    } else {
        for (var i = 0; i < SettingsData.types.length; i++) {
            var type = SettingsData.types[i];
            html += '<div class="type-card">';
            html += '<div class="type-icon">📄</div>';
            html += '<div class="type-info">';
            html += '<h4>' + type.name + '</h4>';
            html += '<p>' + (type.description || 'بدون وصف') + '</p>';
            html += '</div>';
            html += '<div class="type-actions">';
            html += '<button class="btn-icon-sm" onclick="editType(' + type.id + ')" title="تعديل"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>';
            html += '<button class="btn-icon-sm btn-danger-icon" onclick="deleteType(' + type.id + ', \'' + type.name + '\')" title="حذف"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>';
            html += '</div>';
            html += '</div>';
        }
    }

    html += '</div>';
    content.innerHTML = html;
}

function openAddTypeModal() {
    DOM.modalTitle.textContent = 'إضافة نوع معاملة';
    DOM.modalBody.innerHTML = `
        <form id="typeForm" onsubmit="saveType(event)">
            <input type="hidden" name="id" id="typeId" value="">
            <div class="form-group">
                <label class="form-label">اسم النوع</label>
                <input type="text" class="form-input" name="name" id="typeName" required>
            </div>
            <div class="form-group">
                <label class="form-label">الوصف</label>
                <textarea class="form-textarea" name="description" id="typeDesc"></textarea>
            </div>
            <div class="modal-footer" style="padding: 0; border: none; margin-top: 1.5rem;">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
                <button type="submit" class="btn btn-primary">حفظ</button>
            </div>
        </form>
    `;
    openModal();
}

function editType(id) {
    var type = SettingsData.types.find(function (t) { return t.id == id; });
    if (!type) return;

    DOM.modalTitle.textContent = 'تعديل نوع المعاملة';
    DOM.modalBody.innerHTML = `
        <form id="typeForm" onsubmit="saveType(event)">
            <input type="hidden" name="id" id="typeId" value="${type.id}">
            <div class="form-group">
                <label class="form-label">اسم النوع</label>
                <input type="text" class="form-input" name="name" id="typeName" value="${type.name}" required>
            </div>
            <div class="form-group">
                <label class="form-label">الوصف</label>
                <textarea class="form-textarea" name="description" id="typeDesc">${type.description || ''}</textarea>
            </div>
            <div class="modal-footer" style="padding: 0; border: none; margin-top: 1.5rem;">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
                <button type="submit" class="btn btn-primary">حفظ</button>
            </div>
        </form>
    `;
    openModal();
}

async function saveType(e) {
    e.preventDefault();

    var id = document.getElementById('typeId').value;
    var data = {
        name: document.getElementById('typeName').value,
        description: document.getElementById('typeDesc').value
    };

    if (id) data.id = id;

    var action = id ? 'update_type' : 'add_type';

    try {
        var res = await fetch('api/settings.php?action=' + action, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        var result = await res.json();

        if (result.success) {
            showToast(id ? 'تم تحديث النوع' : 'تم إضافة النوع', 'success');
            closeModal();
            renderTypesSection();
        } else {
            showToast(result.message || 'خطأ', 'error');
        }
    } catch (err) {
        showToast('خطأ في الاتصال', 'error');
    }
}

async function deleteType(id, name) {
    if (!confirm('هل أنت متأكد من حذف النوع "' + name + '"؟')) return;

    try {
        var res = await fetch('api/settings.php?action=delete_type', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id })
        });

        var result = await res.json();

        if (result.success) {
            showToast('تم حذف النوع', 'success');
            renderTypesSection();
        } else {
            showToast(result.message || 'خطأ في الحذف', 'error');
        }
    } catch (err) {
        showToast('خطأ في الاتصال', 'error');
    }
}

// ========== قسم جميع المعاملات ==========
function renderAllTransactionsSection() {
    var content = document.getElementById('settingsContent');

    var html = '<div class="settings-section-header">';
    html += '<h2>جميع المعاملات</h2>';
    html += '<div class="header-actions">';
    html += '<input type="text" class="search-input-sm" id="txSearchInput" placeholder="بحث..." oninput="filterSettingsTransactions()">';
    html += '<button class="btn btn-secondary" onclick="exportTransactions()"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> تصدير</button>';
    html += '</div>';
    html += '</div>';

    html += '<div class="table-container"><table class="settings-table" id="settingsTxTable">';
    html += '<thead><tr>';
    html += '<th>رقم المعاملة</th>';
    html += '<th>التاريخ</th>';
    html += '<th>النوع</th>';
    html += '<th>الوصف</th>';
    html += '<th>المبلغ</th>';
    html += '<th>الحالة</th>';
    html += '<th>الإجراءات</th>';
    html += '</tr></thead>';
    html += '<tbody id="settingsTxBody">';

    if (App.transactions.length === 0) {
        html += '<tr><td colspan="7" style="text-align: center; padding: 2rem;">لا توجد معاملات</td></tr>';
    } else {
        for (var i = 0; i < App.transactions.length; i++) {
            var tx = App.transactions[i];
            html += '<tr>';
            html += '<td><strong>' + tx.transaction_number + '</strong></td>';
            html += '<td>' + tx.transaction_date + '</td>';
            html += '<td>' + (tx.transaction_type || '—') + '</td>';
            html += '<td class="truncate">' + tx.description + '</td>';
            html += '<td>' + formatMoney(tx.amount) + '</td>';
            html += '<td>' + getAlertBadge(tx.alert_type) + '</td>';
            html += '<td>';
            html += '<button class="btn-icon-sm" onclick="viewTransaction(' + tx.id + ')" title="عرض"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg></button>';
            html += '<button class="btn-icon-sm btn-danger-icon" onclick="deleteSettingsTransaction(' + tx.id + ', \'' + tx.transaction_number + '\')" title="حذف"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>';
            html += '</td>';
            html += '</tr>';
        }
    }

    html += '</tbody></table></div>';
    content.innerHTML = html;
}

function filterSettingsTransactions() {
    var search = document.getElementById('txSearchInput').value.toLowerCase();
    var tbody = document.getElementById('settingsTxBody');

    var filtered = App.transactions.filter(function (tx) {
        return tx.transaction_number.toLowerCase().indexOf(search) > -1 ||
            tx.description.toLowerCase().indexOf(search) > -1 ||
            (tx.transaction_type && tx.transaction_type.toLowerCase().indexOf(search) > -1);
    });

    var html = '';
    if (filtered.length === 0) {
        html = '<tr><td colspan="7" style="text-align: center; padding: 2rem;">لا توجد نتائج</td></tr>';
    } else {
        for (var i = 0; i < filtered.length; i++) {
            var tx = filtered[i];
            html += '<tr>';
            html += '<td><strong>' + tx.transaction_number + '</strong></td>';
            html += '<td>' + tx.transaction_date + '</td>';
            html += '<td>' + (tx.transaction_type || '—') + '</td>';
            html += '<td class="truncate">' + tx.description + '</td>';
            html += '<td>' + formatMoney(tx.amount) + '</td>';
            html += '<td>' + getAlertBadge(tx.alert_type) + '</td>';
            html += '<td>';
            html += '<button class="btn-icon-sm" onclick="viewTransaction(' + tx.id + ')" title="عرض"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg></button>';
            html += '<button class="btn-icon-sm btn-danger-icon" onclick="deleteSettingsTransaction(' + tx.id + ', \'' + tx.transaction_number + '\')" title="حذف"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>';
            html += '</td>';
            html += '</tr>';
        }
    }

    tbody.innerHTML = html;
}

async function deleteSettingsTransaction(id, number) {
    if (!confirm('هل أنت متأكد من حذف المعاملة "' + number + '"؟')) return;

    try {
        var res = await fetch('api/settings.php?action=delete_transaction', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id })
        });

        var result = await res.json();

        if (result.success) {
            showToast('تم حذف المعاملة', 'success');
            await loadTransactions();
            renderAllTransactionsSection();
        } else {
            showToast(result.message || 'خطأ في الحذف', 'error');
        }
    } catch (err) {
        showToast('خطأ في الاتصال', 'error');
    }
}

function exportTransactions() {
    window.location.href = 'api/settings.php?action=export';
}

// ========== قسم أداء الموظفين ==========
async function renderPerformanceSection() {
    var content = document.getElementById('settingsContent');

    var html = `
    <div class="performance-page">
        <!-- Header -->
        <div class="perf-header">
            <div class="perf-header-content">
                <div class="perf-title">
                    <div class="perf-icon">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"></circle>
                            <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                    </div>
                    <div>
                        <h1>متابعة الأداء</h1>
                        <p>تحليل أوقات إنجاز المعاملات وأداء الموظفين</p>
                    </div>
                </div>
                <div class="perf-header-stats" id="perfHeaderStats">
                    <div class="header-stat">
                        <span class="stat-number" id="totalEventsToday">-</span>
                        <span class="stat-label">أحداث اليوم</span>
                    </div>
                    <div class="header-stat">
                        <span class="stat-number" id="avgTimeToday">-</span>
                        <span class="stat-label">متوسط الوقت</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- تبويبات -->
        <div class="perf-tabs">
            <button class="perf-tab active" onclick="switchPerfTab('overview')">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="7" height="7"></rect>
                    <rect x="14" y="3" width="7" height="7"></rect>
                    <rect x="14" y="14" width="7" height="7"></rect>
                    <rect x="3" y="14" width="7" height="7"></rect>
                </svg>
                نظرة عامة
            </button>
            <button class="perf-tab" onclick="switchPerfTab('timeline')">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="12" y1="20" x2="12" y2="10"></line>
                    <line x1="18" y1="20" x2="18" y2="4"></line>
                    <line x1="6" y1="20" x2="6" y2="16"></line>
                </svg>
                سجل الأحداث
            </button>
            <button class="perf-tab" onclick="switchPerfTab('analytics')">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="20" x2="18" y2="10"></line>
                    <line x1="12" y1="20" x2="12" y2="4"></line>
                    <line x1="6" y1="20" x2="6" y2="14"></line>
                </svg>
                تحليلات
            </button>
            <button class="perf-tab sla-tab-btn" onclick="switchPerfTab('sla')">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                SLA / OLA
                <span class="tab-badge sla-breach-badge" id="slaBadge" style="display:none">0</span>
            </button>
        </div>

        <!-- الفلاتر -->
        <div class="perf-filters">
            <div class="filter-group">
                <label>الموظف</label>
                <select id="perfEmployeeFilter" onchange="loadPerformanceData()">
                    <option value="">جميع الموظفين</option>
                    ${SettingsData.employees ? SettingsData.employees.map(emp =>
        `<option value="${emp.id}">${emp.name}</option>`
    ).join('') : ''}
                </select>
            </div>
            <div class="filter-group">
                <label>المرحلة</label>
                <select id="perfStageFilter" onchange="loadPerformanceData()">
                    <option value="">جميع المراحل</option>
                    <option value="creation">الإنشاء</option>
                    <option value="receiving">الاستلام</option>
                    <option value="budget">الموازنة</option>
                    <option value="payment">الدفع</option>
                    <option value="invoice">الفوترة</option>
                </select>
            </div>
            <div class="filter-group">
                <label>من تاريخ</label>
                <input type="date" id="perfDateFrom" onchange="loadPerformanceData()">
            </div>
            <div class="filter-group">
                <label>إلى تاريخ</label>
                <input type="date" id="perfDateTo" onchange="loadPerformanceData()">
            </div>
            <button class="filter-reset" onclick="resetPerfFilters()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
                    <path d="M3 3v5h5"></path>
                </svg>
                إعادة تعيين
            </button>
        </div>

        <!-- المحتوى -->
        <div class="perf-content">
            <!-- نظرة عامة -->
            <div id="perfTabOverview" class="perf-tab-content active">
                <!-- بطاقات الموظفين -->
                <div id="performanceSummary" class="employee-cards-grid"></div>
                
                <!-- جدول التفاصيل -->
                <div class="perf-section">
                    <div class="section-header">
                        <h3>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                <polyline points="14 2 14 8 20 8"></polyline>
                                <line x1="16" y1="13" x2="8" y2="13"></line>
                                <line x1="16" y1="17" x2="8" y2="17"></line>
                            </svg>
                            تفاصيل الأوقات
                        </h3>
                    </div>
                    <div id="performanceTable" class="perf-table-container"></div>
                </div>
            </div>

            <!-- سجل الأحداث -->
            <div id="perfTabTimeline" class="perf-tab-content">
                <div class="perf-section">
                    <div class="section-header">
                        <h3>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"></circle>
                                <polyline points="12 6 12 12 16 14"></polyline>
                            </svg>
                            سجل جميع الأحداث والتغييرات
                        </h3>
                        <span class="events-count" id="eventsCount">-</span>
                    </div>
                    <div id="eventsTimeline" class="events-timeline-container"></div>
                </div>
            </div>

            <!-- تحليلات -->
            <div id="perfTabAnalytics" class="perf-tab-content">
                <div class="analytics-grid">
                    <div class="analytics-card">
                        <h4>توزيع الأحداث حسب المرحلة</h4>
                        <div id="stageDistribution" class="chart-container"></div>
                    </div>
                    <div class="analytics-card">
                        <h4>أداء الموظفين</h4>
                        <div id="employeeRanking" class="ranking-list"></div>
                    </div>
                </div>
            </div>

            <!-- ═══ SLA / OLA ═══ -->
            <div id="perfTabSla" class="perf-tab-content">
                <!-- إحصاءات سريعة -->
                <div id="slaStats" class="sla-stats-bar">
                    <div class="sla-stat sla-stat-breach">
                        <div class="sla-stat-num" id="slaBreachCount">—</div>
                        <div class="sla-stat-label">تجاوزات مفتوحة</div>
                    </div>
                    <div class="sla-stat sla-stat-warn">
                        <div class="sla-stat-num" id="slaWarnCount">—</div>
                        <div class="sla-stat-label">تحذيرات نشطة</div>
                    </div>
                    <div class="sla-stat sla-stat-today">
                        <div class="sla-stat-num" id="slaBreachToday">—</div>
                        <div class="sla-stat-label">تجاوزات اليوم</div>
                    </div>
                    <div class="sla-stat sla-stat-action">
                        <button class="btn btn-sm btn-primary" onclick="runSlaCheck()">🔄 فحص الآن</button>
                        <button class="btn btn-sm btn-secondary" onclick="openSlaSettingsModal()">⚙️ OLA/SLA</button>
                        <button class="btn btn-sm btn-secondary" onclick="openNotifSettingsModal()">📧 إعدادات الإشعارات</button>
                    </div>
                </div>

                <!-- فلاتر -->
                <div class="perf-filters" style="margin-top:.75rem">
                    <div class="filter-group">
                        <label>النطاق</label>
                        <select id="slaScopeFilter" onchange="loadSlaDashboard()">
                            <option value="all">الكل</option>
                            <option value="transaction">معاملات</option>
                            <option value="correspondence">مراسلات</option>
                        </select>
                    </div>
                    <div class="filter-group">
                        <label>حالة SLA</label>
                        <select id="slaStatusFilter" onchange="loadSlaDashboard()">
                            <option value="">الكل</option>
                            <option value="breached">تجاوز✗</option>
                            <option value="warning">تحذير ⚠</option>
                            <option value="ok">ضمن المدة ✓</option>
                        </select>
                    </div>
                    <div class="filter-group">
                        <label>نوع الإشعار</label>
                        <select id="slaBreachTypeFilter" onchange="loadSlaBreaches()">
                            <option value="">الكل</option>
                            <option value="ola_breach">تجاوزOLA</option>
                            <option value="sla_breach">تجاوزSLA</option>
                            <option value="ola_warning">تحذير OLA</option>
                            <option value="sla_warning">تحذير SLA</option>
                        </select>
                    </div>
                    <div class="filter-group">
                        <label>الحالة</label>
                        <select id="slaResolvedFilter" onchange="loadSlaBreaches()">
                            <option value="">الكل</option>
                            <option value="no">غير محلول</option>
                            <option value="yes">محلول</option>
                        </select>
                    </div>
                </div>

                <!-- جدول المعاملات مع حالة SLA -->
                <div class="perf-section">
                    <div class="section-header">
                        <h3>📋 حالة SLA للمعاملات النشطة</h3>
                    </div>
                    <div id="slaDashboardTable" class="perf-table-container">
                        <div class="loading-placeholder">جارٍ التحميل...</div>
                    </div>
                </div>

                <!-- سجل التجاوزات -->
                <div class="perf-section" style="margin-top:1.5rem">
                    <div class="section-header">
                        <h3>⚠️ سجل التجاوزات والتصعيد</h3>
                    </div>
                    <div id="slaBreachLog" class="perf-table-container">
                        <div class="loading-placeholder">جارٍ التحميل...</div>
                    </div>
                </div>
            </div>

        </div>
    </div>`;

    content.innerHTML = html;

    // تحميل البيانات
    loadPerformanceData();
    loadEventsTimeline();
}

// تبديل التبويبات
function switchPerfTab(tab) {
    document.querySelectorAll('.perf-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.perf-tab-content').forEach(c => c.classList.remove('active'));

    event.target.closest('.perf-tab').classList.add('active');
    document.getElementById('perfTab' + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.add('active');

    if (tab === 'sla') {
        loadSlaStats();
        loadSlaDashboard();
        loadSlaBreaches();
        return;
    }
    if (tab === 'timeline') {
        loadEventsTimeline();
    } else if (tab === 'analytics') {
        loadAnalytics();
    }
}

// إعادة تعيين الفلاتر
function resetPerfFilters() {
    document.getElementById('perfEmployeeFilter').value = '';
    document.getElementById('perfStageFilter').value = '';
    document.getElementById('perfDateFrom').value = '';
    document.getElementById('perfDateTo').value = '';
    loadPerformanceData();
    loadEventsTimeline();
}

// تحميل سجل الأحداث
async function loadEventsTimeline() {
    var container = document.getElementById('eventsTimeline');
    var countEl = document.getElementById('eventsCount');
    if (!container) return;

    container.innerHTML = '<div class="loading-spinner">جاري التحميل...</div>';

    try {
        var employeeId = document.getElementById('perfEmployeeFilter')?.value || '';
        var stage = document.getElementById('perfStageFilter')?.value || '';

        var params = new URLSearchParams();
        params.append('limit', '100');
        if (employeeId) params.append('employee_id', employeeId);
        if (stage) params.append('stage', stage);

        var res = await fetch('api/?action=all_events&' + params.toString());
        var result = await res.json();

        if (result.success && result.data && result.data.length > 0) {
            if (countEl) countEl.textContent = result.data.length + ' حدث';

            var html = '<div class="timeline-list">';

            var stageInfo = {
                'creation': { name: 'الإنشاء', color: '#4dabf7', icon: '➕' },
                'receiving': { name: 'الاستلام', color: '#69db7c', icon: '📥' },
                'budget': { name: 'الموازنة', color: '#3bc9db', icon: '💰' },
                'payment': { name: 'الدفع', color: '#ffa94d', icon: '💳' },
                'invoice': { name: 'الفوترة', color: '#b197fc', icon: '🧾' }
            };

            result.data.forEach(function (event) {
                var info = stageInfo[event.stage] || { name: event.stage, color: '#888', icon: '📋' };
                var duration = event.duration_from_previous;
                var durationClass = duration <= 5 ? 'fast' : (duration <= 30 ? 'normal' : 'slow');

                html += `
                <div class="timeline-item">
                    <div class="timeline-dot" style="background: ${info.color};">${info.icon}</div>
                    <div class="timeline-content">
                        <div class="timeline-header">
                            <span class="timeline-tx">${event.transaction_number || '-'}</span>
                            <span class="timeline-stage" style="background: ${info.color}20; color: ${info.color}; border: 1px solid ${info.color}40;">${info.name}</span>
                            ${duration !== null ? `<span class="timeline-duration ${durationClass}">${duration} دقيقة</span>` : ''}
                        </div>
                        <div class="timeline-status">
                            ${event.old_status ? `<span class="status-old">${event.old_status}</span><span class="status-arrow">←</span>` : ''}
                            <span class="status-new">${event.new_status || '-'}</span>
                        </div>
                        ${event.notes ? `<div class="timeline-notes"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>${event.notes}</div>` : ''}
                        <div class="timeline-footer">
                            <span class="timeline-employee">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                                ${event.employee_name || 'النظام'}
                            </span>
                            <span class="timeline-time">${formatEventDateTime(event.event_time)}</span>
                        </div>
                    </div>
                </div>`;
            });

            html += '</div>';
            container.innerHTML = html;
        } else {
            if (countEl) countEl.textContent = '0 حدث';
            container.innerHTML = '<div class="empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg><p>لا توجد أحداث مسجلة</p></div>';
        }
    } catch (err) {
        container.innerHTML = '<div class="error-state">خطأ في تحميل الأحداث</div>';
    }
}

// تحميل التحليلات
async function loadAnalytics() {
    var stageContainer = document.getElementById('stageDistribution');
    var rankingContainer = document.getElementById('employeeRanking');

    if (!stageContainer || !rankingContainer) return;

    try {
        var res = await fetch('api/?action=all_events&limit=500');
        var result = await res.json();

        if (result.success && result.data) {
            // توزيع حسب المرحلة
            var stageCounts = {};
            var employeeStats = {};

            result.data.forEach(function (event) {
                // عدد حسب المرحلة
                stageCounts[event.stage] = (stageCounts[event.stage] || 0) + 1;

                // إحصائيات الموظفين
                if (event.employee_name) {
                    if (!employeeStats[event.employee_name]) {
                        employeeStats[event.employee_name] = { count: 0, totalTime: 0 };
                    }
                    employeeStats[event.employee_name].count++;
                    if (event.duration_from_previous) {
                        employeeStats[event.employee_name].totalTime += event.duration_from_previous;
                    }
                }
            });

            // عرض توزيع المراحل
            var stageInfo = {
                'creation': { name: 'الإنشاء', color: '#4dabf7' },
                'receiving': { name: 'الاستلام', color: '#69db7c' },
                'budget': { name: 'الموازنة', color: '#3bc9db' },
                'payment': { name: 'الدفع', color: '#ffa94d' },
                'invoice': { name: 'الفوترة', color: '#b197fc' }
            };

            var total = Object.values(stageCounts).reduce((a, b) => a + b, 0);
            var stageHtml = '<div class="stage-bars">';

            Object.keys(stageInfo).forEach(function (stage) {
                var count = stageCounts[stage] || 0;
                var percent = total > 0 ? Math.round((count / total) * 100) : 0;
                var info = stageInfo[stage];

                stageHtml += `
                <div class="stage-bar-item">
                    <div class="stage-bar-label">
                        <span style="color: ${info.color};">${info.name}</span>
                        <span>${count} (${percent}%)</span>
                    </div>
                    <div class="stage-bar-track">
                        <div class="stage-bar-fill" style="width: ${percent}%; background: ${info.color};"></div>
                    </div>
                </div>`;
            });

            stageHtml += '</div>';
            stageContainer.innerHTML = stageHtml;

            // ترتيب الموظفين
            var employees = Object.entries(employeeStats)
                .map(([name, stats]) => ({
                    name,
                    count: stats.count,
                    avgTime: stats.count > 0 ? Math.round(stats.totalTime / stats.count) : 0
                }))
                .sort((a, b) => b.count - a.count);

            var rankHtml = '<div class="ranking-items">';
            employees.slice(0, 5).forEach(function (emp, index) {
                var medal = index === 0 ? '🥇' : (index === 1 ? '🥈' : (index === 2 ? '🥉' : ''));
                rankHtml += `
                <div class="ranking-item">
                    <span class="rank-number">${medal || (index + 1)}</span>
                    <span class="rank-name">${emp.name}</span>
                    <span class="rank-count">${emp.count} معاملة</span>
                    <span class="rank-time">${emp.avgTime} د متوسط</span>
                </div>`;
            });
            rankHtml += '</div>';
            rankingContainer.innerHTML = rankHtml;
        }
    } catch (err) {
        stageContainer.innerHTML = '<div class="error-state">خطأ</div>';
    }
}

function formatEventDateTime(datetime) {
    if (!datetime) return '-';
    var date = new Date(datetime);
    var now = new Date();
    var diff = now - date;

    // إذا كان اليوم
    if (diff < 86400000 && date.getDate() === now.getDate()) {
        return 'اليوم ' + date.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
    }
    // إذا كان أمس
    if (diff < 172800000) {
        return 'أمس ' + date.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
    }

    return date.toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' }) + ' ' +
        date.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
}

async function loadPerformanceData() {
    var employeeId = document.getElementById('perfEmployeeFilter')?.value || '';
    var stage = document.getElementById('perfStageFilter')?.value || '';
    var dateFrom = document.getElementById('perfDateFrom')?.value || '';
    var dateTo = document.getElementById('perfDateTo')?.value || '';

    // تحميل ملخص الأداء
    try {
        var params = new URLSearchParams();
        if (dateFrom) params.append('date_from', dateFrom);
        if (dateTo) params.append('date_to', dateTo);

        var summaryRes = await fetch('api/?action=performance_summary&' + params.toString());
        var summaryData = await summaryRes.json();

        if (summaryData.success) {
            renderPerformanceSummary(summaryData.data);
        }
    } catch (e) {
        console.error('Error loading performance summary:', e);
    }

    // تحميل التفاصيل
    try {
        var params = new URLSearchParams();
        if (employeeId) params.append('employee_id', employeeId);
        if (stage) params.append('stage', stage);
        if (dateFrom) params.append('date_from', dateFrom);
        if (dateTo) params.append('date_to', dateTo);

        var detailsRes = await fetch('api/?action=employee_times&' + params.toString());
        var detailsData = await detailsRes.json();

        if (detailsData.success) {
            renderPerformanceTable(detailsData.data);
        }
    } catch (e) {
        console.error('Error loading performance details:', e);
    }
}

function renderPerformanceSummary(data) {
    var container = document.getElementById('performanceSummary');
    if (!container) return;

    // تجميع البيانات حسب الموظف
    var employeeStats = {};
    data.forEach(function (item) {
        if (!employeeStats[item.employee_id]) {
            employeeStats[item.employee_id] = {
                name: item.employee_name,
                role: item.employee_role,
                total: 0,
                avgTime: 0,
                totalDuration: 0
            };
        }
        employeeStats[item.employee_id].total += parseInt(item.total_transactions) || 0;
        employeeStats[item.employee_id].totalDuration += parseInt(item.total_duration) || 0;
    });

    // حساب المتوسط
    Object.keys(employeeStats).forEach(function (id) {
        var emp = employeeStats[id];
        emp.avgTime = emp.total > 0 ? Math.round(emp.totalDuration / emp.total) : 0;
    });

    var roleColors = {
        'admin': '#667eea',
        'receiver': '#69db7c',
        'budget': '#3bc9db',
        'payment': '#ffa94d',
        'invoice': '#b197fc'
    };

    var html = '';

    Object.keys(employeeStats).forEach(function (id) {
        var emp = employeeStats[id];
        var avgClass = emp.avgTime <= 10 ? 'excellent' : (emp.avgTime <= 30 ? 'good' : 'slow');
        var color = roleColors[emp.role] || '#667eea';

        html += `
        <div class="emp-card">
            <div class="emp-card-header">
                <div class="emp-avatar" style="background: ${color}20; color: ${color};">
                    ${emp.name ? emp.name.charAt(0) : '؟'}
                </div>
                <div class="emp-info">
                    <h4>${emp.name}</h4>
                    <span class="emp-role" style="background: ${color}20; color: ${color};">${getRoleName(emp.role)}</span>
                </div>
            </div>
            <div class="emp-stats">
                <div class="emp-stat">
                    <span class="emp-stat-value">${emp.total}</span>
                    <span class="emp-stat-label">معاملة</span>
                </div>
                <div class="emp-stat">
                    <span class="emp-stat-value ${avgClass}">${emp.avgTime > 0 ? emp.avgTime + ' د' : '-'}</span>
                    <span class="emp-stat-label">متوسط الوقت</span>
                </div>
            </div>
        </div>`;
    });

    if (Object.keys(employeeStats).length === 0) {
        html = `
        <div class="empty-state" style="grid-column: 1 / -1;">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            <p>لا توجد بيانات أداء متاحة</p>
        </div>`;
    }

    container.innerHTML = html;
}

function renderPerformanceTable(data) {
    var container = document.getElementById('performanceTable');
    if (!container) return;

    if (!data || data.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 3rem; color: var(--text-muted);">لا توجد سجلات</div>';
        return;
    }

    var html = '<table class="table" style="width: 100%;">';
    html += '<thead><tr>';
    html += '<th>رقم المعاملة</th>';
    html += '<th>الموظف</th>';
    html += '<th>المرحلة</th>';
    html += '<th>وقت البدء</th>';
    html += '<th>وقت الانتهاء</th>';
    html += '<th>المدة</th>';
    html += '<th>الحالة</th>';
    html += '</tr></thead>';
    html += '<tbody>';

    data.forEach(function (item) {
        var durationClass = item.duration_minutes <= 10 ? 'excellent' : (item.duration_minutes <= 30 ? 'good' : 'slow');

        html += '<tr>';
        html += '<td><span style="color: var(--accent-blue); font-family: monospace;">' + (item.transaction_number || '-') + '</span></td>';
        html += '<td>' + (item.employee_name || '-') + '</td>';
        html += '<td>' + getStageName(item.stage) + '</td>';
        html += '<td style="font-size: 0.85rem;">' + formatDateTime(item.started_at) + '</td>';
        html += '<td style="font-size: 0.85rem;">' + formatDateTime(item.completed_at) + '</td>';
        html += '<td><span class="duration-badge ' + durationClass + '">' + formatDuration(item.duration_minutes) + '</span></td>';
        html += '<td>' + (item.status || '-') + '</td>';
        html += '</tr>';
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}

function getStageName(stage) {
    var stages = {
        'creation': 'الإنشاء',
        'receiving': 'الاستلام',
        'budget': 'الموازنة',
        'payment': 'الدفع',
        'invoice': 'الفوترة'
    };
    return stages[stage] || stage;
}

function formatDuration(minutes) {
    if (!minutes || minutes === 0) return '-';
    if (minutes < 60) return minutes + ' د';
    var hours = Math.floor(minutes / 60);
    var mins = minutes % 60;
    return hours + ' س ' + (mins > 0 ? mins + ' د' : '');
}

function formatDateTime(datetime) {
    if (!datetime) return '-';
    var date = new Date(datetime);
    return date.toLocaleDateString('ar-SA') + ' ' + date.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
}

// ========== دوال سجل الأحداث ==========
function toggleEventsLog() {
    var container = document.getElementById('eventsLogContainer');
    var icon = document.getElementById('eventsToggleIcon');

    if (container.style.display === 'none') {
        container.style.display = 'block';
        icon.textContent = '▲';
        loadEventsLog();
    } else {
        container.style.display = 'none';
        icon.textContent = '▼';
    }
}

async function loadEventsLog() {
    var container = document.getElementById('eventsLogTable');
    if (!container) return;

    container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-muted);">جاري التحميل...</div>';

    try {
        var res = await fetch('api/?action=all_events');
        var result = await res.json();

        if (result.success && result.data && result.data.length > 0) {
            var html = '<table class="table" style="width: 100%;">';
            html += '<thead><tr>';
            html += '<th>المعاملة</th>';
            html += '<th>المرحلة</th>';
            html += '<th>من</th>';
            html += '<th>إلى</th>';
            html += '<th>السبب/الملاحظات</th>';
            html += '<th>المدة</th>';
            html += '<th>الموظف</th>';
            html += '<th>الوقت</th>';
            html += '</tr></thead><tbody>';

            var stageNames = {
                'creation': 'الإنشاء',
                'receiving': 'الاستلام',
                'budget': 'الموازنة',
                'payment': 'الدفع',
                'invoice': 'الفوترة'
            };

            var stageColors = {
                'creation': '#4dabf7',
                'receiving': '#69db7c',
                'budget': '#3bc9db',
                'payment': '#ffa94d',
                'invoice': '#b197fc'
            };

            result.data.forEach(function (event) {
                var stageName = stageNames[event.stage] || event.stage;
                var stageColor = stageColors[event.stage] || '#888';
                var duration = event.duration_from_previous;

                html += '<tr>';
                html += '<td><span style="color: var(--accent-blue); font-family: monospace;">' + (event.transaction_number || '-') + '</span></td>';
                html += '<td><span style="background: ' + stageColor + '; color: #000; padding: 2px 8px; border-radius: 10px; font-size: 0.8rem;">' + stageName + '</span></td>';
                html += '<td style="color: var(--text-muted); text-decoration: line-through;">' + (event.old_status || '-') + '</td>';
                html += '<td style="color: var(--accent-green); font-weight: 600;">' + (event.new_status || '-') + '</td>';
                html += '<td style="max-width: 200px; font-size: 0.85rem;">' + (event.notes || '-') + '</td>';
                html += '<td>';
                if (duration !== null && duration !== undefined) {
                    var durationColor = duration <= 5 ? '#69db7c' : (duration <= 30 ? '#ffa94d' : '#ff6b6b');
                    html += '<span style="background: ' + durationColor + '; color: #000; padding: 2px 8px; border-radius: 10px; font-size: 0.8rem;">' + duration + ' د</span>';
                } else {
                    html += '-';
                }
                html += '</td>';
                html += '<td>' + (event.employee_name || '-') + '</td>';
                html += '<td style="font-size: 0.8rem; direction: ltr;">' + formatDateTime(event.event_time) + '</td>';
                html += '</tr>';
            });

            html += '</tbody></table>';
            container.innerHTML = html;
        } else {
            container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-muted);">لا توجد أحداث مسجلة</div>';
        }
    } catch (err) {
        container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--accent-red);">خطأ في تحميل الأحداث</div>';
    }
}

// ========== قسم النظام ==========


// ═══════════════════════════════════════════════════════════
//  قسم النظام
// ═══════════════════════════════════════════════════════════

/**
 * عرض إعدادات النظام والإحصائيات ومنطقة الخطر
 */
// ========== قسم النظام ==========
async function renderSystemSection() {
    var content = document.getElementById('settingsContent');

    // جلب الإحصائيات
    var stats = { transactions: 0, employees: 0, types: 0, total_amount: 0 };
    try {
        var res = await fetch('api/settings.php?action=full_stats');
        var data = await res.json();
        if (data.success) stats = data.data;
    } catch (e) { }

    var html = '<div class="settings-section-header">';
    html += '<h2>إعدادات النظام</h2>';
    html += '</div>';

    html += '<div class="system-grid">';

    // إحصائيات
    html += '<div class="system-card">';
    html += '<h3>📊 إحصائيات النظام</h3>';
    html += '<div class="stats-grid">';
    html += '<div class="stat-item"><span class="stat-number">' + stats.transactions + '</span><span class="stat-label">معاملة</span></div>';
    html += '<div class="stat-item"><span class="stat-number">' + stats.employees + '</span><span class="stat-label">موظف</span></div>';
    html += '<div class="stat-item"><span class="stat-number">' + stats.types + '</span><span class="stat-label">نوع</span></div>';
    html += '<div class="stat-item"><span class="stat-number">' + formatMoney(stats.total_amount) + '</span><span class="stat-label">إجمالي المبالغ</span></div>';
    html += '</div>';
    html += '</div>';

    // معلومات النظام
    html += '<div class="system-card">';
    html += '<h3>ℹ️ معلومات النظام</h3>';
    html += '<div class="info-list">';
    html += '<div class="info-item"><span>اسم النظام:</span><span>نظام إدارة معاملات القطاع المالي</span></div>';
    html += '<div class="info-item"><span>الإصدار:</span><span>1.0.0</span></div>';
    html += '<div class="info-item"><span>قاعدة البيانات:</span><span>MySQL</span></div>';
    html += '</div>';
    html += '</div>';

    // منطقة الخطر
    html += '<div class="system-card danger-zone">';
    html += '<h3>⚠️ منطقة الخطر</h3>';
    html += '<p>هذه الإجراءات لا يمكن التراجع عنها</p>';
    html += '<div class="danger-buttons">';
    html += '<button class="btn btn-danger" onclick="clearAllTransactions()">حذف جميع المعاملات</button>';
    html += '</div>';
    html += '</div>';

    html += '</div>';
    content.innerHTML = html;
}

async function clearAllTransactions() {
    if (!confirm('⚠️ تحذير!\n\nسيتم حذف جميع المعاملات نهائياً.\nهذا الإجراء لا يمكن التراجع عنه.\n\nهل أنت متأكد؟')) return;
    if (!confirm('تأكيد نهائي: سيتم حذف كل شيء!')) return;

    try {
        var res = await fetch('api/settings.php?action=clear_all', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        var result = await res.json();

        if (result.success) {
            showToast('تم حذف جميع المعاملات', 'success');
            await loadTransactions();
            renderSystemSection();
        } else {
            showToast(result.message || 'خطأ', 'error');
        }
    } catch (err) {
        showToast('خطأ في الاتصال', 'error');
    }
}


function openUserGuide() {
    window.open('User_Guide.html', '_blank', 'width=1200,height=800');
}
// ═══════════════════════════════════════════════════════════════
//  نظام إدارة الصلاحيات — Permissions Management
// ═══════════════════════════════════════════════════════════════

var ACTIONS_CONFIG = [
    { key: 'bank.record_balance', label: 'تسجيل رصيد اليوم', icon: '📊', group: 'البنك' },
    { key: 'bank.edit_balance', label: 'تعديل الرصيد', icon: '✏️', group: 'البنك' },
    { key: 'bank.edit_account', label: 'تعديل بيانات الحساب', icon: '⚙️', group: 'البنك' },
    { key: 'bank.add_account', label: 'إضافة حساب بنكي', icon: '🏦', group: 'البنك' },
    { key: 'bank.add_deposit', label: 'إضافة وديعة', icon: '💵', group: 'البنك' },
    { key: 'bank.confirm_deposit', label: 'تأكيد الوديعة', icon: '✅', group: 'البنك' },
    { key: 'bank.delete_deposit', label: 'حذف وديعة', icon: '🗑', group: 'البنك' },
    { key: 'transaction.add', label: 'إضافة معاملة', icon: '➕', group: 'المعاملات' },
    { key: 'transaction.edit', label: 'تعديل معاملة', icon: '✏️', group: 'المعاملات' },
    { key: 'transaction.delete', label: 'حذف معاملة', icon: '🗑', group: 'المعاملات' },
    { key: 'transaction.export', label: 'تصدير البيانات', icon: '📤', group: 'المعاملات' },
    { key: 'employee.add', label: 'إضافة موظف', icon: '👤', group: 'الموظفين' },
    { key: 'employee.edit', label: 'تعديل موظف', icon: '✏️', group: 'الموظفين' },
    { key: 'employee.delete', label: 'حذف موظف', icon: '🗑', group: 'الموظفين' },
    { key: 'employee.permissions', label: 'إدارة الصلاحيات', icon: '🔒', group: 'الموظفين' },
    { key: 'budget.review', label: 'مراجعة واعتماد الموازنة', icon: '⚖️', group: 'الموازنة' },
    { key: 'budget.link_transaction', label: 'ربط بمعاملة مالية', icon: '🔗', group: 'الموازنة' },
    { key: 'budget.edit_code', label: 'تعديل رمز الموازنة', icon: '🏷️', group: 'الموازنة' },
    { key: 'reservation.add', label: 'إضافة حجز جديد', icon: '📋', group: 'الحجوزات' },
    { key: 'reservation.view_own', label: 'عرض حجوزات القسم', icon: '👁', group: 'الحجوزات' },
    { key: 'reservation.view_all', label: 'عرض كل الحجوزات', icon: '📑', group: 'الحجوزات' },
    { key: 'reservation.review', label: 'مراجعة الحجوزات', icon: '🔍', group: 'الحجوزات' },
    { key: 'reservation.approve', label: 'اعتماد / رفض حجز', icon: '✅', group: 'الحجوزات' },
    { key: 'reservation.delete', label: 'حذف حجز', icon: '🗑', group: 'الحجوزات' },
];

var PAGES_CONFIG = [
    { key: 'dashboard', label: 'لوحة التحكم', icon: '📊', group: 'رئيسية' },
    { key: 'notifications', label: 'التنبيهات', icon: '🔔', group: 'رئيسية' },
    { key: 'transactions', label: 'المعاملات المالية', icon: '💰', group: 'معاملات' },
    { key: 'bank-deposits', label: 'الودائع البنكية', icon: '🏦', group: 'معاملات' },
    { key: 'correspondence', label: 'الخطابات', icon: '📨', group: 'معاملات' },
    { key: 'sla', label: 'SLA / OLA', icon: '⏱', group: 'متابعة' },
    { key: 'performance', label: 'متابعة الأداء', icon: '📈', group: 'متابعة' },
    { key: 'settings', label: 'الإعدادات', icon: '⚙️', group: 'نظام' },
];

var PERMISSION_LEVELS = [
    { value: 'system_admin', label: 'مدير النظام', desc: 'صلاحية كاملة على كل شيء بما فيها الحذف', color: 'var(--accent-red)' },
    { value: 'manager', label: 'مدير', desc: 'وصول موسع للتقارير والمتابعة', color: 'var(--accent-blue)' },
    { value: 'employee', label: 'موظف', desc: 'وصول محدود لصفحته الوظيفية', color: 'var(--accent-green)' },
];

var DEFAULT_PAGES = {
    system_admin: { dashboard: 1, notifications: 1, transactions: 1, 'bank-deposits': 1, correspondence: 1, sla: 1, performance: 1, settings: 1, reservations: 1 },
    manager: { dashboard: 1, notifications: 1, transactions: 1, 'bank-deposits': 1, correspondence: 1, sla: 1, performance: 1, settings: 0, reservations: 1 },
    employee: { dashboard: 0, notifications: 1, transactions: 1, 'bank-deposits': 1, correspondence: 1, sla: 0, performance: 0, settings: 0, reservations: 1 },
};

/** فتح modal صلاحيات الموظف */
async function openPermissionsModal(empId, empName) {
    DOM.modalTitle.textContent = '🔒 صلاحيات: ' + empName;
    DOM.modalBody.innerHTML = '<div style="text-align:center;padding:2rem"><div class="spinner"></div></div>';
    openModal();

    // تهيئة الجداول تلقائياً إذا لم تكن موجودة
    await fetch('api/settings.php?action=init_permissions').catch(() => { });

    try {
        var res = await fetch('api/settings.php?action=get_employee_permissions&employee_id=' + empId);
        var data = await res.json();
        var perms = data.success ? data.data : { permission_level: 'employee', can_delete: false, pages: {} };
        DOM.modalBody.innerHTML = renderPermissionsForm(empId, empName, perms);
        injectPermissionsStyles();
    } catch (e) {
        DOM.modalBody.innerHTML = '<div style="color:var(--accent-red);padding:1rem">خطأ في تحميل الصلاحيات</div>';
    }
}

/** رسم نموذج الصلاحيات */
function renderPermissionsForm(empId, empName, perms) {
    var level = perms.permission_level || 'employee';
    var pages = perms.pages || {};
    var isSystemAdmin = (level === 'system_admin');

    // مستويات الصلاحية
    var levelsHtml = PERMISSION_LEVELS.map(function (l) {
        var checked = (level === l.value) ? 'checked' : '';
        return '<label class="perm-level-card ' + (level === l.value ? 'selected' : '') + '" data-level="' + l.value + '">' +
            '<input type="radio" name="permLevel" value="' + l.value + '" ' + checked + ' onchange="onPermLevelChange(this,' + empId + ')" hidden>' +
            '<div class="perm-level-dot" style="background:' + l.color + '"></div>' +
            '<div>' +
            '<div style="font-weight:700;font-size:.88rem">' + l.label + '</div>' +
            '<div style="font-size:.76rem;color:var(--text-muted)">' + l.desc + '</div>' +
            '</div>' +
            '</label>';
    }).join('');

    // صلاحية الحذف
    var canDelChecked = perms.can_delete ? 'checked' : '';

    // الصفحات مجمعة بحسب المجموعة
    var groups = {};
    PAGES_CONFIG.forEach(function (p) {
        if (!groups[p.group]) groups[p.group] = [];
        groups[p.group].push(p);
    });

    var pagesHtml = '';
    Object.keys(groups).forEach(function (g) {
        pagesHtml += '<div class="perm-group">';
        pagesHtml += '<div class="perm-group-label">' + g + '</div>';
        pagesHtml += '<div class="perm-pages-grid">';

        groups[g].forEach(function (pg) {
            var hasAccess = isSystemAdmin ? true : !!(pages[pg.key]);
            var toggleCls = hasAccess ? 'on' : 'off';
            var disabled = isSystemAdmin ? 'disabled' : '';

            pagesHtml += '<div class="perm-page-item" data-page="' + pg.key + '">' +
                '<span class="perm-page-icon">' + pg.icon + '</span>' +
                '<span class="perm-page-name">' + pg.label + '</span>' +
                '<button class="perm-toggle ' + toggleCls + '" ' + disabled + ' ' +
                'onclick="togglePagePerm(this,\'' + pg.key + '\')" ' +
                'title="' + (hasAccess ? 'محجوب حالياً — اضغط للحجب' : 'محجوب — اضغط للسماح') + '">' +
                (hasAccess ?
                    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>' :
                    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>'
                ) +
                '</button>' +
                '</div>';
        });

        pagesHtml += '</div></div>';
    });

    return '<div class="perms-modal-body">' +

        // القسم 1: مستوى الصلاحية
        '<div class="perm-section">' +
        '<h4 class="perm-section-title">🏅 مستوى الصلاحية</h4>' +
        '<div class="perm-levels">' + levelsHtml + '</div>' +
        '</div>' +

        // القسم 2: صلاحية الحذف
        '<div class="perm-section">' +
        '<h4 class="perm-section-title">🗑️ إجراءات خاصة</h4>' +
        '<label class="perm-special-row">' +
        '<input type="checkbox" id="perm_can_delete" ' + canDelChecked + ' ' + (isSystemAdmin ? 'disabled' : '') + '>' +
        '<div>' +
        '<div style="font-weight:600;font-size:.88rem">صلاحية الحذف</div>' +
        '<div style="font-size:.76rem;color:var(--text-muted)">يمكنه حذف المعاملات والموظفين والودائع</div>' +
        '</div>' +
        (isSystemAdmin ? '<span style="font-size:.75rem;color:var(--accent-red);font-weight:600">دائمة لمدير النظام</span>' : '') +
        '</label>' +
        '</div>' +

        // القسم 3: صلاحيات الصفحات
        '<div class="perm-section">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem">' +
        '<h4 class="perm-section-title" style="margin:0">📑 صلاحيات الصفحات</h4>' +
        (!isSystemAdmin ?
            '<div style="display:flex;gap:.5rem">' +
            '<button class="btn btn-ghost-sm" onclick="setAllPages(true)">تحديد الكل</button>' +
            '<button class="btn btn-ghost-sm" onclick="setAllPages(false)">إلغاء الكل</button>' +
            '</div>' : '') +
        '</div>' +
        (isSystemAdmin ?
            '<div style="padding:.75rem;background:rgba(239,68,68,.08);border-radius:8px;font-size:.82rem;color:var(--accent-red)">' +
            '🔓 مدير النظام يملك صلاحية وصول كاملة لا يمكن تقييدها</div>' :
            '<div id="permsPagesContainer">' + pagesHtml + '</div>') +
        '</div>' +

        // القسم 4: صلاحيات الإجراءات
        '<div class="perm-section">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem">' +
        '<h4 class="perm-section-title" style="margin:0">🎛️ صلاحيات الإجراءات</h4>' +
        (!isSystemAdmin ? '<div style="display:flex;gap:.5rem"><button class="btn btn-ghost-sm" onclick="setAllActions(true)">تحديد الكل</button><button class="btn btn-ghost-sm" onclick="setAllActions(false)">إلغاء الكل</button></div>' : '') +
        '</div>' +
        (isSystemAdmin ?
            '<div style="padding:.75rem;background:rgba(239,68,68,.08);border-radius:8px;font-size:.82rem;color:var(--accent-red)">🔓 مدير النظام يملك صلاحية تنفيذ جميع الإجراءات</div>' :
            '<div id="permsActionsContainer">' + buildActionsGrid(perms.action_permissions || {}, level) + '</div>') +
        '</div>' +

        // أزرار الحفظ
        '<div class="perm-footer">' +
        '<button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>' +
        '<button class="btn btn-primary" onclick="savePermissions(' + empId + ', \'' + empName + '\')">' +
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>' +
        ' حفظ الصلاحيات</button>' +
        '</div>' +

        '</div>';
}

/** بناء grid صلاحيات الإجراءات */
function buildActionsGrid(overrides, level) {
    var defaults = {
        system_admin: {},  // كلها true دائماً
        manager: { 'bank.edit_balance': 1, 'bank.view_history': 1, 'bank.record_balance': 1, 'bank.add_deposit': 1, 'bank.confirm_deposit': 1, 'transaction.add': 1, 'transaction.edit': 1, 'transaction.export': 1 },
        employee: { 'bank.record_balance': 1, 'bank.view_history': 1, 'bank.add_deposit': 1, 'transaction.add': 1 },
    };
    var def = defaults[level] || {};

    var groups = {};
    ACTIONS_CONFIG.forEach(function (a) {
        if (!groups[a.group]) groups[a.group] = [];
        groups[a.group].push(a);
    });

    var html = '';
    Object.keys(groups).forEach(function (g) {
        html += '<div class="perm-group"><div class="perm-group-label">' + g + '</div>';
        html += '<div class="perm-pages-grid">';
        groups[g].forEach(function (act) {
            var isOn = overrides.hasOwnProperty(act.key) ? !!overrides[act.key] : !!(def[act.key]);
            var cls = isOn ? 'on' : 'off';
            html += '<div class="perm-page-item" data-action="' + act.key + '">' +
                '<span class="perm-page-icon">' + act.icon + '</span>' +
                '<span class="perm-page-name">' + act.label + '</span>' +
                '<button class="perm-toggle ' + cls + '" onclick="toggleActionPerm(this,\'' + act.key + '\')">' +
                (isOn
                    ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>'
                    : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>') +
                '</button></div>';
        });
        html += '</div></div>';
    });
    return html;
}

/** تبديل حالة إجراء */
function toggleActionPerm(btn, actionKey) {
    var isOn = btn.classList.contains('on');
    btn.classList.toggle('on', !isOn);
    btn.classList.toggle('off', isOn);
    btn.innerHTML = !isOn
        ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>'
        : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
}

/** تحديد/إلغاء كل الإجراءات */
function setAllActions(state) {
    document.querySelectorAll('#permsActionsContainer .perm-toggle').forEach(function (btn) {
        btn.classList.toggle('on', state);
        btn.classList.toggle('off', !state);
        btn.innerHTML = state
            ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>'
            : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    });
}

/** تبديل حالة صفحة */
function togglePagePerm(btn, pageKey) {
    var isOn = btn.classList.contains('on');
    btn.classList.toggle('on', !isOn);
    btn.classList.toggle('off', isOn);
    btn.title = !isOn ? 'مسموح — اضغط للحجب' : 'محجوب — اضغط للسماح';
    btn.innerHTML = !isOn
        ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>'
        : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
}

/** تحديد/إلغاء كل الصفحات */
function setAllPages(state) {
    document.querySelectorAll('.perm-toggle:not([disabled])').forEach(function (btn) {
        btn.classList.toggle('on', state);
        btn.classList.toggle('off', !state);
        btn.innerHTML = state
            ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>'
            : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    });
}

/** عند تغيير مستوى الصلاحية → تطبيق الافتراضيات */
function onPermLevelChange(input, empId) {
    var level = input.value;

    // تحديث تصميم الكارد المختار
    document.querySelectorAll('.perm-level-card').forEach(function (c) {
        c.classList.toggle('selected', c.dataset.level === level);
    });

    // تطبيق إجراءات افتراضية حسب المستوى
    var actionDefaults = {
        manager: [
            'bank.edit_balance', 'bank.view_history', 'bank.record_balance',
            'bank.add_deposit', 'bank.confirm_deposit',
            'transaction.add', 'transaction.edit', 'transaction.export',
            'reservation.add', 'reservation.view_own', 'reservation.view_all',
        ],
        employee: [
            'bank.record_balance', 'bank.view_history', 'bank.add_deposit',
            'transaction.add',
            'reservation.add', 'reservation.view_own',
        ],
    };
    var actDef = actionDefaults[level] || [];
    document.querySelectorAll('[data-action]').forEach(function (item) {
        var key = item.dataset.action;
        var btn = item.querySelector('.perm-toggle');
        if (!btn) return;
        var isOn = actDef.includes(key);
        btn.classList.toggle('on', isOn);
        btn.classList.toggle('off', !isOn);
        btn.innerHTML = isOn
            ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>'
            : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    });

    // تطبيق الصفحات الافتراضية
    var defaults = DEFAULT_PAGES[level] || {};
    document.querySelectorAll('.perm-page-item').forEach(function (item) {
        var key = item.dataset.page;
        var btn = item.querySelector('.perm-toggle');
        if (!btn || btn.disabled) return;
        var isOn = !!(defaults[key]);
        btn.classList.toggle('on', isOn);
        btn.classList.toggle('off', !isOn);
        btn.innerHTML = isOn
            ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>'
            : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    });

    // إظهار/إخفاء صلاحية الحذف
    var delChk = document.getElementById('perm_can_delete');
    if (delChk) {
        delChk.disabled = (level === 'system_admin');
        if (level === 'system_admin') delChk.checked = true;
    }
}

/** جمع وحفظ الصلاحيات */
async function savePermissions(empId, empName) {
    var level = document.querySelector('input[name="permLevel"]:checked')?.value || 'employee';
    var canDel = !!(document.getElementById('perm_can_delete')?.checked);

    var pages = {};
    document.querySelectorAll('.perm-page-item').forEach(function (item) {
        var key = item.dataset.page;
        var btn = item.querySelector('.perm-toggle');
        pages[key] = btn ? btn.classList.contains('on') : false;
    });

    var actionPerms = {};
    document.querySelectorAll('[data-action]').forEach(function (item) {
        var key = item.dataset.action;
        var btn = item.querySelector('.perm-toggle');
        actionPerms[key] = btn ? btn.classList.contains('on') : false;
    });

    try {
        var res = await fetch('api/settings.php?action=save_employee_permissions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                employee_id: empId,
                permission_level: level,
                can_delete: canDel,
                pages: pages,
                action_permissions: actionPerms
            })
        });
        var data = await res.json();

        if (data.success) {
            showToast('✅ تم حفظ صلاحيات ' + empName, 'success');
            closeModal();
        } else {
            showToast('❌ ' + (data.error || 'خطأ في الحفظ'), 'error');
        }
    } catch (e) {
        showToast('❌ خطأ في الاتصال', 'error');
    }
}

/** حقن CSS الصلاحيات */
function injectPermissionsStyles() {
    if (document.getElementById('perms-styles')) return;
    var s = document.createElement('style');
    s.id = 'perms-styles';
    s.textContent = `
        /* ── Modal Body ── */
        .perms-modal-body { display:flex; flex-direction:column; gap:1.25rem; }

        /* ── Sections ── */
        .perm-section { background:var(--bg-surface); border-radius:12px; padding:1rem 1.1rem; }
        .perm-section-title { font-size:.88rem; font-weight:700; color:var(--text-primary); margin:0 0 .75rem; }

        /* ── Level Cards ── */
        .perm-levels { display:flex; flex-direction:column; gap:.5rem; }
        .perm-level-card {
            display:flex; align-items:center; gap:.75rem;
            padding:.7rem 1rem; border-radius:9px;
            border:1.5px solid var(--border-color);
            cursor:pointer; transition:all .2s;
            background: var(--bg-card);
        }
        .perm-level-card:hover { border-color:var(--btn-primary-bg); }
        .perm-level-card.selected {
            border-color:var(--btn-primary-bg);
            background:var(--bg-secondary);
            box-shadow:0 1px 8px rgba(0,0,0,.12);
        }
        .perm-level-dot { width:10px; height:10px; border-radius:50%; flex-shrink:0; }

        /* ── Special Row (delete) ── */
        .perm-special-row {
            display:flex; align-items:center; gap:.85rem;
            padding:.65rem 1rem; border-radius:8px;
            background:var(--bg-card); cursor:pointer;
        }
        .perm-special-row input[type=checkbox] { width:18px; height:18px; cursor:pointer; flex-shrink:0; }

        /* ── Pages Grid ── */
        .perm-group { margin-bottom:.85rem; }
        .perm-group:last-child { margin-bottom:0; }
        .perm-group-label { font-size:.72rem; font-weight:700; text-transform:uppercase;
                            letter-spacing:.07em; color:var(--text-muted); margin-bottom:.4rem; }
        .perm-pages-grid {
            display:grid; grid-template-columns:repeat(auto-fill, minmax(190px, 1fr));
            gap:.4rem;
        }
        .perm-page-item {
            display:flex; align-items:center; gap:.6rem;
            padding:.55rem .85rem; border-radius:8px;
            background:var(--bg-card); border:1px solid var(--border-color);
        }
        .perm-page-icon { font-size:.95rem; flex-shrink:0; }
        .perm-page-name { flex:1; font-size:.82rem; font-weight:500; color:var(--text-secondary); }

        /* ── Toggle ── */
        .perm-toggle {
            width:26px; height:26px; border-radius:6px; border:none; cursor:pointer;
            display:flex; align-items:center; justify-content:center;
            flex-shrink:0; transition:all .18s; font-size:.8rem;
        }
        .perm-toggle.on {
            background:rgba(105,219,124,.18); color:var(--accent-green);
        }
        .perm-toggle.on:hover { background:rgba(105,219,124,.32); }
        .perm-toggle.off {
            background:rgba(239,68,68,.12); color:var(--accent-red);
        }
        .perm-toggle.off:hover { background:rgba(239,68,68,.22); }
        .perm-toggle[disabled] { opacity:.45; cursor:not-allowed; }

        /* ── Footer ── */
        .perm-footer { display:flex; justify-content:flex-start; gap:.625rem; padding-top:.25rem; }

        /* ── Ghost SM Button ── */
        .btn-ghost-sm {
            padding:.3rem .75rem; font-size:.76rem; border-radius:6px;
            border:1px solid var(--border-color); background:transparent;
            color:var(--text-muted); cursor:pointer; transition:all .15s;
            font-family:inherit;
        }
        .btn-ghost-sm:hover { background:var(--bg-surface); color:var(--text-primary); }

        @media (max-width:560px) {
            .perm-pages-grid { grid-template-columns:1fr 1fr; }
        }
    `;
    document.head.appendChild(s);
}

// ── CSS شريط التبويبات العلوي لصفحة الإعدادات ────────────────
(function injectSettingsTopbarStyles() {
    if (document.getElementById('settings-topbar-styles')) return;
    const s = document.createElement('style');
    s.id = 'settings-topbar-styles';
    s.textContent = `
        .settings-page-new {
            display: flex;
            flex-direction: column;
            gap: 1.5rem;
            min-height: calc(100vh - 200px);
        }
        .settings-topbar {
            display: flex;
            align-items: center;
            gap: 4px;
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 5px;
            flex-wrap: wrap;
        }
        .settings-tab-btn {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.55rem 1.1rem;
            background: transparent;
            border: 1px solid transparent;
            border-radius: 8px;
            color: var(--text-secondary);
            font-family: inherit;
            font-size: 0.85rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
            white-space: nowrap;
        }
        .settings-tab-btn:hover {
            background: var(--bg-surface);
            color: var(--text-primary);
        }
        .settings-tab-btn.active {
            background: var(--btn-primary-bg);
            color: var(--btn-primary-text);
            border-color: transparent;
            font-weight: 600;
            box-shadow: 0 2px 8px rgba(0,0,0,.15);
        }
        .settings-page-new .settings-content {
            flex: 1;
            min-width: 0;
        }
        @media (max-width: 600px) {
            .settings-tab-btn { font-size: 0.78rem; padding: 0.5rem 0.75rem; }
        }
    `;
    document.head.appendChild(s);
})();