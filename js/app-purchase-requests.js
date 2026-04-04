/**
 * app-purchase-requests.js
 * ════════════════════════════════════════════════════════════
 * نظام المعاملات (طلبات الشراء) — الواجهة الأمامية
 *
 * الأقسام:
 *  ① الحالة العامة والثوابت
 *  ② تحميل الصفحة الرئيسية
 *  ③ عرض القائمة والفلترة
 *  ④ تفاصيل الطلب + Timeline
 *  ⑤ نموذج إنشاء طلب جديد
 *  ⑥ الموافقة / الرفض
 *  ⑦ الإحالة والإسناد الداخلي
 *  ⑧ إصدار أمر الشراء (المشتريات)
 *  ⑨ اعتماد الحجز
 *  ⑩ دوال مساعدة ومشتركة
 * ════════════════════════════════════════════════════════════
 */

// ════════════════════════════════════════════════════════════
// ① الحالة العامة والثوابت
// ════════════════════════════════════════════════════════════

/** حالة صفحة المعاملات */
const PRState = {
    requests: [],
    currentRequest: null,
    formOptions: null,
    filters: { stage: '', priority: '', search: '', date_from: '', date_to: '' },
    loading: false,
    userAccess: null,   // يُجلب من API: { is_supply_chain, is_view_all, role }
};

/** أسماء المراحل بالعربية */
const PR_STAGE_NAMES = {
    draft: 'مسودة',
    budget_review: 'مراجعة موظف الموازنة',
    treasury_review: 'مراجعة مدير الخزينة',
    finance_review: 'مراجعة المدير المالي',
    treasury_finance_review: 'مراجعة الخزينة والمالية',
    ceo_approval: 'اعتماد الرئيس التنفيذي',
    purchasing: 'المشتريات',
    waiting_budget_approval: 'انتظار اعتماد الحجز',
    payment: 'المالية — الدفع',
    completed: 'مكتملة',
    rejected: 'مرفوضة',
    returned: 'مُرجَعة',
};

/** ألوان المراحل */
const PR_STAGE_COLORS = {
    draft: '#94a3b8',
    budget_review: '#3b82f6',
    treasury_review: '#8b5cf6',
    finance_review: '#7c3aed',
    treasury_finance_review: '#7c3aed',
    ceo_approval: '#dc2626',
    purchasing: '#f59e0b',
    waiting_budget_approval: '#f97316',
    payment: '#10b981',
    completed: '#22c55e',
    rejected: '#ef4444',
    returned: '#f97316',
};

/** أيقونات نوع الأحداث */
const PR_EVENT_ICONS = {
    created: '🆕',
    submitted: '📤',
    approved: '✅',
    rejected: '❌',
    returned: '↩️',
    referred: '🔀',
    assigned: '👤',
    unassigned: '🚫',
    stage_changed: '➡️',
    po_issued: '📋',
    budget_linked: '🔗',
    sent_to_payment: '💳',
    sla_paused: '⏸️',
    sla_resumed: '▶️',
    note_added: '📝',
    attachment_added: '📎',
    amount_changed: '💰',
    workflow_redirected: '🔄',
};

// ════════════════════════════════════════════════════════════
// ② تحميل الصفحة الرئيسية
// ════════════════════════════════════════════════════════════

/**
 * نقطة الدخول الرئيسية لصفحة المعاملات
 * تُستدعى من switchTab في app-common.js
 */
async function loadPurchaseRequestsPage() {
    showLoading();

    // تحميل صلاحية المستخدم من DB (مرة واحدة)
    if (!PRState.userAccess) {
        try {
            const r = await fetch('api/purchase_requests_api.php?action=my_access');
            const d = await r.json();
            if (d.success) PRState.userAccess = d;
        } catch (e) { console.warn('my_access fetch failed', e); }
    }

    // تحميل خيارات النموذج مرة واحدة
    if (!PRState.formOptions) {
        await prLoadFormOptions();
    }

    // تحميل القائمة الرئيسية
    await prLoadRequestsList();
}

/**
 * تحميل خيارات النموذج من الـ API
 * (موردون، مراكز تكلفة، بنود مصروف، عملات، حد المبلغ)
 */
async function prLoadFormOptions() {
    try {
        const res = await fetch('api/purchase_requests_api.php?action=form_options');
        const data = await res.json();
        if (data.success) PRState.formOptions = data.data;
    } catch (e) {
        console.error('خطأ في تحميل خيارات النموذج:', e);
    }
}

// ════════════════════════════════════════════════════════════
// ③ عرض القائمة والفلترة
// ════════════════════════════════════════════════════════════

/**
 * تحميل وعرض قائمة الطلبات
 */
async function prLoadRequestsList() {
    PRState.loading = true;

    // بناء معاملات الفلترة
    const params = new URLSearchParams({
        action: 'list',
        stage: PRState.filters.stage || '',
        priority: PRState.filters.priority || '',
        search: PRState.filters.search || '',
        date_from: PRState.filters.date_from || '',
        date_to: PRState.filters.date_to || '',
    });

    try {
        const res = await fetch('api/purchase_requests_api.php?' + params);
        const data = await res.json();

        if (!data.success) {
            showToast(data.message || 'خطأ في تحميل البيانات', 'error');
            return;
        }

        PRState.requests = data.data || [];
        prRenderPage();

    } catch (e) {
        showToast('خطأ في الاتصال بالخادم', 'error');
        console.error(e);
    } finally {
        PRState.loading = false;
    }
}

/**
 * رسم الصفحة الرئيسية كاملة
 */
function prRenderPage() {
    DOM.mainContent.innerHTML = `
        <div class="pr-page" id="pr-page">

            <!-- ═══ رأس الصفحة ═══ -->
            <div class="pr-header">
                <div class="pr-header-info">
                    <h2 class="pr-title">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                             stroke="currentColor" stroke-width="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/>
                            <line x1="16" y1="13" x2="8" y2="13"/>
                            <line x1="16" y1="17" x2="8" y2="17"/>
                        </svg>
                        المعاملات
                    </h2>
                    <span class="pr-count-badge">${PRState.requests.length} طلب</span>
                </div>
                <button class="btn btn-primary" onclick="prOpenCreateModal()">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="5" x2="12" y2="19"/>
                        <line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    طلب شراء جديد
                </button>
            </div>

            <!-- ═══ أدوات الفلترة ═══ -->
            <div class="pr-filters">
                <div class="pr-search-wrap">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="8"/>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                    <input type="text" id="pr-search" placeholder="بحث برقم الطلب أو العنوان..."
                           value="${PRState.filters.search}"
                           oninput="prFilterRequests()"
                           class="pr-search-input">
                </div>
                <select id="pr-filter-stage" onchange="prFilterRequests()" class="pr-select">
                    <option value="">كل المراحل</option>
                    ${Object.entries(PR_STAGE_NAMES).map(([v, l]) =>
        `<option value="${v}" ${PRState.filters.stage === v ? 'selected' : ''}>${l}</option>`
    ).join('')}
                </select>
                <select id="pr-filter-priority" onchange="prFilterRequests()" class="pr-select">
                    <option value="">كل الأولويات</option>
                    <option value="urgent"  ${PRState.filters.priority === 'urgent' ? 'selected' : ''}>⚡ عاجل</option>
                    <option value="normal"  ${PRState.filters.priority === 'normal' ? 'selected' : ''}>عادي</option>
                </select>
                <input type="date" id="pr-filter-date-from" class="pr-date-input"
                       value="${PRState.filters.date_from}"
                       onchange="prFilterRequests()" placeholder="من تاريخ">
                <input type="date" id="pr-filter-date-to" class="pr-date-input"
                       value="${PRState.filters.date_to}"
                       onchange="prFilterRequests()" placeholder="إلى تاريخ">
            </div>

            <!-- ═══ جدول الطلبات ═══ -->
            <div class="pr-table-wrap">
                <table class="pr-table" id="pr-table">
                    <thead>
                        <tr>
                            <th>رقم الطلب</th>
                            <th>العنوان</th>
                            <th>الإدارة</th>
                            <th>المورد</th>
                            <th>المبلغ</th>
                            <th>الأولوية</th>
                            <th>المرحلة</th>
                            <th>مُسند إلى</th>
                            <th>SLA</th>
                            <th>التاريخ</th>
                            <th>إجراءات</th>
                        </tr>
                    </thead>
                    <tbody id="pr-tbody">
                        ${prRenderRows(PRState.requests)}
                    </tbody>
                </table>
                ${PRState.requests.length === 0 ? prEmptyState() : ''}
            </div>
        </div>
    `;
}

/**
 * رسم صفوف الجدول
 * @param {Array} requests
 * @returns {string} HTML
 */
function prRenderRows(requests) {
    if (!requests.length) return '';

    return requests.map(req => {
        const slaPct = parseFloat(req.sla_pct) || 0;
        const slaClass = slaPct >= 100 ? 'sla-breach' : slaPct >= 70 ? 'sla-warn' : 'sla-ok';
        const stageName = PR_STAGE_NAMES[req.current_stage] || req.current_stage;
        const stageColor = PR_STAGE_COLORS[req.current_stage] || '#94a3b8';
        const supplier = req.supplier_name || req.supplier_name_manual || '—';
        const assigned = req.assigned_to_name
            ? `<span class="pr-assigned">${req.assigned_to_name}</span>`
            : '<span class="pr-not-assigned">غير مُسند</span>';

        return `
            <tr onclick="prOpenDetail(${req.id})" class="pr-row ${req.priority === 'urgent' ? 'pr-urgent-row' : ''}">
                <td>
                    <span class="pr-number">${req.request_number}</span>
                    ${req.priority === 'urgent' ? '<span class="pr-badge-urgent">⚡ عاجل</span>' : ''}
                </td>
                <td class="pr-title-cell" title="${req.title}">${req.title}</td>
                <td>${req.department_name || '—'}</td>
                <td class="pr-supplier">${supplier}</td>
                <td class="pr-amount">
                    ${prFormatAmount(req.final_amount || req.amount, req.currency)}
                </td>
                <td>
                    <span class="pr-priority-badge pr-priority-${req.priority}">
                        ${req.priority === 'urgent' ? '⚡ عاجل' : 'عادي'}
                    </span>
                </td>
                <td>
                    <span class="pr-stage-badge" style="background:${stageColor}20;color:${stageColor};border:1px solid ${stageColor}40">
                        ${stageName}
                    </span>
                </td>
                <td>${assigned}</td>
                <td>
                    <div class="pr-sla-cell ${slaClass}">
                        <div class="pr-sla-bar-wrap">
                            <div class="pr-sla-bar" style="width:${Math.min(slaPct, 100)}%"></div>
                        </div>
                        <span class="pr-sla-pct">${slaPct}%</span>
                    </div>
                </td>
                <td class="pr-date">${prFormatDate(req.created_at)}</td>
                <td onclick="event.stopPropagation()">
                    <button class="pr-btn-detail" onclick="prOpenDetail(${req.id})" title="التفاصيل">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                             stroke="currentColor" stroke-width="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                            <circle cx="12" cy="12" r="3"/>
                        </svg>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

/**
 * فلترة الطلبات محلياً
 */
function prFilterRequests() {
    PRState.filters.search = document.getElementById('pr-search')?.value || '';
    PRState.filters.stage = document.getElementById('pr-filter-stage')?.value || '';
    PRState.filters.priority = document.getElementById('pr-filter-priority')?.value || '';
    PRState.filters.date_from = document.getElementById('pr-filter-date-from')?.value || '';
    PRState.filters.date_to = document.getElementById('pr-filter-date-to')?.value || '';

    // فلترة محلية سريعة
    const q = PRState.filters.search.toLowerCase();
    const stage = PRState.filters.stage;
    const prio = PRState.filters.priority;

    const filtered = PRState.requests.filter(r => {
        const matchQ = !q || r.request_number.toLowerCase().includes(q)
            || (r.title || '').toLowerCase().includes(q)
            || (r.department_name || '').toLowerCase().includes(q);
        const matchStage = !stage || r.current_stage === stage;
        const matchPrio = !prio || r.priority === prio;
        return matchQ && matchStage && matchPrio;
    });

    const tbody = document.getElementById('pr-tbody');
    if (tbody) tbody.innerHTML = prRenderRows(filtered);
}

/** حالة فارغة عند عدم وجود طلبات */
function prEmptyState() {
    return `
        <div class="pr-empty">
            <div class="pr-empty-icon">📋</div>
            <p>لا توجد معاملات حالياً</p>
            <button class="btn btn-primary" onclick="prOpenCreateModal()">إنشاء طلب جديد</button>
        </div>
    `;
}


// ════════════════════════════════════════════════════════════
// ④ تفاصيل الطلب + Timeline
// ════════════════════════════════════════════════════════════

/**
 * فتح صفحة تفاصيل طلب
 * @param {number} requestId
 */
async function prOpenDetail(requestId) {
    showLoading();

    try {
        const res = await fetch(`api/purchase_requests_api.php?action=get&id=${requestId}`);
        const data = await res.json();

        if (!data.success) {
            showToast(data.message || 'خطأ في تحميل التفاصيل', 'error');
            prRenderPage();
            return;
        }

        PRState.currentRequest = data.data;
        prRenderDetail(data.data);

    } catch (e) {
        showToast('خطأ في الاتصال', 'error');
        console.error(e);
    }
}

/**
 * رسم صفحة تفاصيل الطلب
 * @param {Object} req بيانات الطلب مع الأحداث والمرفقات
 */
function prRenderDetail(req) {
    const stageName = PR_STAGE_NAMES[req.current_stage] || req.current_stage;
    const stageColor = PR_STAGE_COLORS[req.current_stage] || '#94a3b8';
    const canApprove = prCanApproveCurrentStage(req);
    const canAssign = currentUser.permissionLevel !== 'employee' &&
        req.department_id === currentUser.departmentId;

    // المعاملة مكتملة أو مرفوضة — بدون أزرار إجراءات
    const isClosed = ['completed', 'rejected', 'returned'].includes(req.current_stage);

    // ── أزرار الإجراءات ──────────────────────────────────────
    let actionBtns = '';
    if (isClosed) {
        // عرض شارة فقط بدل الأزرار
        const closedColor = req.current_stage === 'completed' ? '#22c55e'
            : req.current_stage === 'rejected' ? '#ef4444' : '#f97316';
        const closedLabel = req.current_stage === 'completed' ? '✅ مكتملة'
            : req.current_stage === 'rejected' ? '❌ مرفوضة' : '↩️ مُرجَعة';
        actionBtns = `<span class="d3-closed-badge" style="background:${closedColor}15;color:${closedColor};border:1.5px solid ${closedColor}30">${closedLabel} — لا تتوفر إجراءات</span>`;
    } else {
        actionBtns = `<button class="d3-btn d3-btn-ghost" onclick="prOpenReferModal(${req.id})">🔀 إحالة</button>`;
        if (canAssign)
            actionBtns += `<button class="d3-btn d3-btn-purple" onclick="prOpenAssignModal(${req.id})">👤 إسناد</button>`;
        if (canApprove) {
            actionBtns += `<button class="d3-btn d3-btn-green" onclick="prOpenApproveModal(${req.id},'${req.current_stage}')">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                موافقة</button>`;
            actionBtns += `<button class="d3-btn d3-btn-red" onclick="prOpenRejectModal(${req.id},'${req.current_stage}')">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                رفض</button>`;
        }
        if (req.current_stage === 'purchasing' && prIsPurchasingUser()) {
            actionBtns += `<button class="d3-btn d3-btn-amber" onclick="prOpenPOModal(${req.id})">📋 إصدار PO</button>`;
            actionBtns += `<button class="d3-btn d3-btn-blue" onclick="prRequestCeoApproval(${req.id})">🔼 موافقة CEO</button>`;
        }
    }

    // ── مسار المعاملة ─────────────────────────────────────────
    const stages = req.workflow_stages || [];
    const totalSteps = stages.length;
    const doneCount = stages.filter(s => ['approved', 'completed'].includes(s.status)).length;
    const pct = totalSteps > 1 ? Math.round(doneCount / (totalSteps - 1) * 100) : 100;

    const stepsHTML = stages.map((s, idx) => {
        const done = ['approved', 'completed'].includes(s.status);
        const current = s.stage_name === req.current_stage;
        const rejected = s.status === 'rejected';
        const name = PR_STAGE_NAMES[s.stage_name] || s.stage_name;
        const who = s.approved_by_name || s.employee_name || '';
        const date = s.completed_at ? prFormatDate(s.completed_at) : '';

        let state = done ? 'done' : current ? 'active' : rejected ? 'rejected' : 'pending';
        const clr = { done: '#22c55e', active: '#3b82f6', rejected: '#ef4444', pending: '#cbd5e1' }[state];

        let inner = '';
        if (done) inner = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5"><polyline points="20 6 9 17 4 12"/></svg>`;
        else if (rejected) inner = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
        else if (current) inner = `<span class="d3-pulse"></span>`;
        else inner = `<span style="font-size:.62rem;font-weight:700;color:#94a3b8">${idx + 1}</span>`;

        return `
        <div class="d3-step d3-step-${state}">
            <div class="d3-step-circle" style="background:${clr};border-color:${clr};${current ? 'box-shadow:0 0 0 5px rgba(59,130,246,.18)' : ''}">${inner}</div>
            <div class="d3-step-info">
                <span class="d3-step-name">${name}</span>
                ${who ? `<span class="d3-step-who">${who}</span>` : ''}
                ${date ? `<span class="d3-step-date">${date}</span>` : ''}
            </div>
        </div>
        ${idx < totalSteps - 1 ? `<div class="d3-step-line${done ? ' d3-step-line-done' : ''}"></div>` : ''}`;
    }).join('');

    // ── سجل الأحداث ──────────────────────────────────────────
    const eventsHTML = prRenderEvents(req.events);

    // ── جانب البيانات ─────────────────────────────────────────
    const kv = (k, v) => v && v !== '—' ? `
        <div class="d3-kv">
            <span class="d3-k">${k}</span>
            <span class="d3-v">${v}</span>
        </div>` : '';

    DOM.mainContent.innerHTML = `
    <div class="d3-root">

        <!-- ══ Header ══════════════════════════════════════════ -->
        <div class="d3-header">
            <div class="d3-header-right">
                <button class="d3-back" onclick="loadPurchaseRequestsPage()">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <div>
                    <div class="d3-header-num">${req.request_number}</div>
                    <div class="d3-header-title">${req.title}</div>
                </div>
            </div>
            <div class="d3-header-mid">
                <span class="d3-pill" style="background:${stageColor}18;color:${stageColor};border-color:${stageColor}35">${stageName}</span>
                ${req.priority === 'urgent' ? '<span class="d3-urgent">⚡ عاجل</span>' : ''}
            </div>
            <div class="d3-header-actions">${actionBtns}</div>
        </div>

        <!-- ══ Stepper ══════════════════════════════════════════ -->
        <div class="d3-stepper-card">
            <div class="d3-card-label">مسار المعاملة
                <span class="d3-pct-badge" style="${pct >= 100 ? 'background:#dcfce7;color:#16a34a' : 'background:#dbeafe;color:#1d4ed8'}">${pct}%</span>
                <span class="d3-steps-count">${doneCount} / ${totalSteps}</span>
            </div>
            <div class="d3-stepper">${stepsHTML}</div>
        </div>

        <!-- ══ Body ═════════════════════════════════════════════ -->
        <div class="d3-body">

            <!-- اليسار: الأحداث -->
            <div class="d3-events-col">
                <div class="d3-card">
                    <div class="d3-card-label">سجل النشاط
                        <span class="d3-cnt">${req.events?.length || 0}</span>
                    </div>
                    <div class="d3-events">${eventsHTML}</div>
                </div>
            </div>

            <!-- اليمين: البيانات -->
            <div class="d3-info-col">

                <!-- بيانات الطلب -->
                <div class="d3-card">
                    <div class="d3-card-label">بيانات الطلب</div>
                    <div class="d3-amount-hero">
                        <div class="d3-amount-main">${prFormatAmount(req.amount, req.currency)}</div>
                        <div class="d3-amount-lbl">المبلغ التقديري</div>
                        ${req.final_amount ? `
                        <div class="d3-amount-final">${prFormatAmount(req.final_amount, req.currency)}</div>
                        <div class="d3-amount-lbl">المبلغ النهائي</div>` : ''}
                    </div>
                    ${kv('الإدارة', req.department_name)}
                    ${kv('المنشئ', req.created_by_name)}
                    ${kv('المسار', req.workflow_path === 'short' ? '⚡ مختصر' : '📋 كامل')}
                    ${kv('تاريخ الإنشاء', prFormatDate(req.created_at))}
                    ${kv('تاريخ الحاجة', req.needed_date ? prFormatDate(req.needed_date) : '')}
                    ${kv('أمر الشراء', req.po_number || '')}
                    ${kv('الأولوية', req.priority === 'urgent' ? '⚡ عاجل' : 'عادي')}
                </div>

                <!-- المورد -->
                <div class="d3-card">
                    <div class="d3-card-label">المورد</div>
                    ${kv('المبدئي', req.supplier_name_resolved || req.supplier_name_manual || '—')}
                    ${kv('النهائي', req.final_supplier_name_resolved || req.final_supplier_name || '')}
                </div>

                <!-- الموازنة -->
                <div class="d3-card">
                    <div class="d3-card-label">الموازنة</div>
                    ${kv('مركز التكلفة', req.cost_center_code ? `${req.cost_center_code} — ${req.cost_center_name}` : '')}
                    ${kv('بند المصروف', req.budget_category_code ? `${req.budget_category_code} — ${req.budget_category_name}` : '')}
                    ${kv('كود الميزانية', req.budget_code || '')}
                    ${kv('رقم الحجز', req.budget_reservation_id ? `#${req.budget_reservation_id}` : '')}
                </div>

                <!-- SLA -->
                ${prRenderSlaCard(req.sla_status)}

                <!-- المرفقات -->
                <div class="d3-card">
                    <div class="d3-card-label">المرفقات <span class="d3-cnt">${req.attachments?.length || 0}</span></div>
                    ${prRenderAttachments(req.attachments)}
                    <label class="d3-attach-btn">
                        <input type="file" hidden onchange="prUploadFile(event,${req.id})">
                        + إضافة مرفق
                    </label>
                </div>

            </div>
        </div>
    </div>`;
}

/**
 * رسم مؤشر خطوات سير العمل
 * @param {Array}  stages       مراحل سير العمل
 * @param {string} currentStage المرحلة الحالية
 */
function prRenderStepsIndicator(stages, currentStage) {
    if (!stages || !stages.length) return '';

    const totalSteps = stages.length;

    // حساب نسبة التقدم
    const completedCount = stages.filter(s =>
        ['approved', 'completed'].includes(s.status)).length;
    const progressPct = totalSteps > 1
        ? Math.round((completedCount / (totalSteps - 1)) * 100) : 0;

    const stepsHTML = stages.map((stage, idx) => {
        const isCompleted = ['approved', 'completed'].includes(stage.status);
        const isCurrent = stage.stage_name === currentStage;
        const isRejected = stage.status === 'rejected';
        const name = PR_STAGE_NAMES[stage.stage_name] || stage.stage_name;

        // لون وحالة الخطوة
        let state = 'pending';
        if (isCompleted) state = 'done';
        else if (isCurrent) state = 'active';
        else if (isRejected) state = 'rejected';

        const colors = {
            done: { bg: '#22c55e', border: '#22c55e', text: '#fff', track: '#22c55e' },
            active: { bg: '#3b82f6', border: '#3b82f6', text: '#fff', track: '#3b82f6' },
            rejected: { bg: '#ef4444', border: '#ef4444', text: '#fff', track: '#ef4444' },
            pending: { bg: 'var(--bg-card,#fff)', border: 'var(--border-color,#e2e8f0)', text: 'var(--text-muted)', track: 'transparent' },
        };
        const c = colors[state];

        // أيقونة داخل الدائرة
        let icon = '';
        if (isCompleted) {
            icon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${c.text}" stroke-width="3.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>`;
        } else if (isRejected) {
            icon = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="${c.text}" stroke-width="3.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
        } else if (isCurrent) {
            icon = `<span class="pr-step-dot-pulse"></span>`;
        } else {
            icon = `<span style="font-size:.7rem;font-weight:700;color:${c.text}">${idx + 1}</span>`;
        }

        const dateStr = stage.completed_at ? prFormatDate(stage.completed_at) : '';
        const tooltip = name + (dateStr ? ' · ' + dateStr : '');

        return `
        <div class="pr-stp" data-state="${state}" title="${tooltip}">
            <div class="pr-stp-circle"
                 style="background:${c.bg};border-color:${c.border};
                        ${state === 'active' ? 'box-shadow:0 0 0 5px rgba(59,130,246,.18)' : ''}">
                ${icon}
            </div>
            <div class="pr-stp-label" style="${isCurrent ? 'color:var(--primary,#3b82f6);font-weight:700' : ''}">
                <span class="pr-stp-name">${name}</span>
                ${dateStr ? `<span class="pr-stp-date">${dateStr}</span>` : ''}
            </div>
        </div>`;
    }).join('');

    return `
    <div class="pr-stepper-wrap">
        <!-- شريط التقدم خلف الخطوات -->
        <div class="pr-stp-track">
            <div class="pr-stp-fill" style="width:${progressPct}%"></div>
        </div>
        <!-- الخطوات -->
        <div class="pr-stepper">${stepsHTML}</div>
        <!-- ملخص التقدم -->
        <div class="pr-stp-summary">
            <span class="pr-stp-done-badge">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                ${completedCount} مكتملة
            </span>
            <span class="pr-stp-total-badge">${totalSteps} مرحلة</span>
            <span class="pr-stp-pct">${progressPct}%</span>
        </div>

        <!-- ══ SLA Section ═══════════════════════════════════════ -->
        ${prRenderSlaSection(req.sla_status)}

    </div>`;
}

/**
 * رسم قائمة الأحداث (Timeline)
 * @param {Array} events
 */
function prRenderEvents(events) {
    if (!events || !events.length) {
        return '<div class="pr-no-events">لا توجد أحداث بعد</div>';
    }

    return events.map(ev => {
        const icon = PR_EVENT_ICONS[ev.event_type] || '📌';
        const empName = ev.employee_name_resolved || ev.employee_name || 'النظام';
        const stageName = PR_STAGE_NAMES[ev.stage] || ev.stage || '';
        let detail = ev.description || '';

        // تفاصيل إضافية حسب نوع الحدث
        if (ev.event_type === 'referred' && ev.referred_to_emp_name) {
            detail += ` → ${ev.referred_to_emp_name}`;
        }
        if (ev.event_type === 'referred' && ev.referred_to_dept_name) {
            detail += ` (${ev.referred_to_dept_name})`;
        }
        if (ev.event_type === 'assigned' && ev.assigned_to_name) {
            detail += ` → ${ev.assigned_to_name}`;
        }
        if (ev.referral_reason) {
            detail += `<br><small class="pr-event-reason">السبب: ${ev.referral_reason}</small>`;
        }

        return `
            <div class="pr-event-item pr-event-${ev.event_type}">
                <div class="pr-event-icon">${icon}</div>
                <div class="pr-event-body">
                    <div class="pr-event-header">
                        <strong class="pr-event-who">${empName}</strong>
                        ${stageName ? `<span class="pr-event-stage">${stageName}</span>` : ''}
                    </div>
                    <div class="pr-event-detail">${detail}</div>
                    <div class="pr-event-time">${prFormatDateTime(ev.created_at)}</div>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * رسم بطاقة SLA
 * @param {Array} slaStatus
 */
function prRenderSlaCard(slaStatus) {
    if (!slaStatus || !slaStatus.length) return '';

    // المرحلة النشطة أو الأخيرة
    const active = slaStatus.find(s => s.status === 'active' || s.status === 'paused');
    if (!active) return '';

    const pct = parseFloat(active.elapsed_pct) || 0;
    const elapsed = parseInt(active.elapsed_minutes) || 0;
    const allowed = parseInt(active.allowed_minutes) || 0;
    const remaining = Math.max(0, allowed - elapsed);
    const isPaused = active.status === 'paused';
    const isBreached = pct >= 100;
    const isWarn = pct >= 70 && !isBreached;

    const barColor = isBreached ? '#ef4444' : isWarn ? '#f59e0b' : '#22c55e';
    const bgColor = isBreached ? 'rgba(239,68,68,.06)' : isWarn ? 'rgba(245,158,11,.06)' : 'rgba(34,197,94,.06)';
    const bdColor = isBreached ? 'rgba(239,68,68,.25)' : isWarn ? 'rgba(245,158,11,.25)' : 'rgba(34,197,94,.2)';

    const fmtTime = (min) => {
        if (!min) return '0 د';
        const h = Math.floor(min / 60), m = min % 60;
        return h > 0 ? `${h}س ${m}د` : `${m} دقيقة`;
    };

    const statusLabel = isPaused ? '⏸️ موقوف مؤقتاً'
        : isBreached ? '🔴 تجاوز SLA'
            : isWarn ? '🟡 تحذير SLA'
                : '🟢 ضمن الوقت';

    return `
    <div class="d3-sla-wrap" style="border-color:${bdColor};background:${bgColor}">
        <div class="d3-sla-head">
            <span class="d3-sla-title">⏱️ مؤشر SLA</span>
            <span class="d3-sla-status" style="color:${barColor}">${statusLabel}</span>
        </div>
        ${isPaused ? `<div class="d3-sla-pause-note">⏸️ الوقت متوقف — انتظار اعتماد الحجز</div>` : ''}
        <div class="d3-sla-bar-wrap">
            <div class="d3-sla-bar" style="width:${Math.min(pct, 100)}%;background:${barColor}"></div>
        </div>
        <div class="d3-sla-pct-row">
            <span class="d3-sla-pct" style="color:${barColor}">${pct.toFixed(1)}%</span>
            <span class="d3-sla-of">من الوقت المسموح</span>
        </div>
        <div class="d3-sla-stats">
            <div class="d3-sla-stat">
                <div class="d3-sla-stat-v">${fmtTime(elapsed)}</div>
                <div class="d3-sla-stat-l">منقضي</div>
            </div>
            <div class="d3-sla-sep"></div>
            <div class="d3-sla-stat">
                <div class="d3-sla-stat-v" style="${isBreached ? 'color:#ef4444' : ''}">${isBreached ? 'تجاوز' : fmtTime(remaining)}</div>
                <div class="d3-sla-stat-l">متبقي</div>
            </div>
            <div class="d3-sla-sep"></div>
            <div class="d3-sla-stat">
                <div class="d3-sla-stat-v">${fmtTime(allowed)}</div>
                <div class="d3-sla-stat-l">مسموح</div>
            </div>
        </div>
        ${active.policy_name ? `<div class="d3-sla-policy">📋 ${active.policy_name}</div>` : ''}
    </div>`;
}

/** قسم SLA الشامل — كل مراحل المعاملة */
function prRenderSlaSection(slaStatus) {
    if (!slaStatus || !slaStatus.length) return '';

    const stageRows = slaStatus.map(s => {
        const pct = parseFloat(s.elapsed_pct) || 0;
        const elapsed = parseInt(s.elapsed_minutes) || 0;
        const allowed = parseInt(s.allowed_minutes) || 0;
        const name = PR_STAGE_NAMES[s.stage_name] || s.stage_name;
        const isActive = s.status === 'active' || s.status === 'paused';
        const isDone = s.status === 'completed';
        const color = pct >= 100 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#22c55e';

        const fmtMin = (m) => {
            if (!m) return '—';
            const h = Math.floor(m / 60), min = m % 60;
            return h > 0 ? `${h}س ${min}د` : `${min}د`;
        };

        let statusIcon = isDone
            ? `<span style="color:#22c55e">✅</span>`
            : isActive
                ? `<span class="d3-sla-active-dot" style="background:${color}"></span>`
                : `<span style="color:var(--text-muted)">○</span>`;

        return `
        <div class="d3-sla-row ${isActive ? 'd3-sla-row-active' : ''}">
            <div class="d3-sla-row-stage">
                ${statusIcon}
                <span class="d3-sla-row-name">${name}</span>
            </div>
            <div class="d3-sla-row-bar">
                <div class="d3-sla-row-fill" style="width:${Math.min(pct, 100)}%;background:${color}"></div>
            </div>
            <div class="d3-sla-row-nums">
                <span style="color:${color};font-weight:700">${pct.toFixed(0)}%</span>
                <span style="color:var(--text-muted)">${fmtMin(elapsed)} / ${fmtMin(allowed)}</span>
            </div>
        </div>`;
    }).join('');

    return `
    <div class="d3-card d3-sla-section">
        <div class="d3-card-label">⏱️ مؤشرات SLA
            <span class="d3-sla-legend">
                <span style="color:#22c55e">■</span> ضمن الوقت
                <span style="color:#f59e0b">■</span> تحذير
                <span style="color:#ef4444">■</span> تجاوز
            </span>
        </div>
        <div class="d3-sla-table">${stageRows}</div>
    </div>`;
}

/**
 * رسم المرفقات
 * @param {Array} attachments
 */
function prRenderAttachments(attachments) {
    if (!attachments || !attachments.length) {
        return '<div class="pr-no-attach">لا توجد مرفقات</div>';
    }
    return attachments.map(att => `
        <div class="pr-attach-item">
            <span class="pr-attach-icon">${prGetFileIcon(att.file_type)}</span>
            <a href="${att.file_path}" target="_blank" class="pr-attach-name">
                ${att.original_name}
            </a>
            <span class="pr-attach-stage">${PR_STAGE_NAMES[att.stage] || att.stage}</span>
            <span class="pr-attach-who">${att.uploader_name || ''}</span>
        </div>
    `).join('');
}

/** صف معلومات عام */
function prInfoRow(label, value) {
    return `
        <div class="pr-info-row">
            <span class="pr-info-label">${label}</span>
            <span class="pr-info-value">${value || '—'}</span>
        </div>
    `;
}


// ════════════════════════════════════════════════════════════
// ⑤ نموذج إنشاء طلب جديد
// ════════════════════════════════════════════════════════════

/**
 * فتح نافذة إنشاء طلب جديد
 */
function prOpenCreateModal() {
    const opts = PRState.formOptions || {};
    const threshold = opts.threshold || 5000;

    const supplierOpts = (opts.suppliers || []).map(s =>
        `<option value="${s.id}">${s.name}</option>`
    ).join('');

    const costCenterOpts = (opts.costCenters || []).map(c =>
        `<option value="${c.id}">${c.code} — ${c.name}</option>`
    ).join('');

    const budgetCatOpts = (opts.budgetCategories || []).map(b =>
        `<option value="${b.id}">${b.code ? b.code + ' — ' : ''}${b.name}</option>`
    ).join('');

    DOM.modalTitle.textContent = 'طلب شراء جديد';
    DOM.modalBody.innerHTML = `
    <div class="prf-root">

        <!-- ══ شريط الخطوات ══ -->
        <div class="prf-steps-bar">
            <div class="prf-step prf-step-active" id="prf-stp-1">
                <div class="prf-step-num">1</div>
                <span>بيانات الطلب</span>
            </div>
            <div class="prf-step-line"></div>
            <div class="prf-step prf-step-pending" id="prf-stp-2">
                <div class="prf-step-num">2</div>
                <span>الموازنة</span>
            </div>
            <div class="prf-step-line"></div>
            <div class="prf-step prf-step-pending" id="prf-stp-3">
                <div class="prf-step-num">3</div>
                <span>التأكيد</span>
            </div>
        </div>

        <!-- ══ الخطوة 1: بيانات الطلب ══ -->
        <div class="prf-page" id="prf-page-1">

            <!-- العنوان -->
            <div class="prf-field">
                <label class="prf-label">عنوان الطلب <span class="prf-req">*</span></label>
                <input type="text" id="prf-title" class="prf-input"
                       placeholder="مثال: شراء طوابع أمان — استعاضة سلفة — سداد فاتورة">
            </div>

            <!-- الوصف -->
            <div class="prf-field">
                <label class="prf-label">الغرض والوصف</label>
                <textarea id="prf-desc" class="prf-input prf-textarea" rows="3"
                          placeholder="اشرح الغرض من هذا الطلب..."></textarea>
            </div>

            <!-- المبلغ والعملة -->
            <div class="prf-field prf-cur-wrap" id="prf-amount-card">
                <label class="prf-label">المبلغ التقديري <span class="prf-req">*</span></label>
                <div class="prf-amount-box">
                    <input type="number" id="prf-amount" class="prf-amount-inp"
                           min="0" step="0.01" placeholder="0.00"
                           oninput="prPreviewWorkflowPath()">
                    <button type="button" class="prf-cur-btn" id="prf-cur-picker"
                            onclick="prToggleCurrencyMenu()">
                        <span id="prf-cur-flag">🇸🇦</span>
                        <span id="prf-cur-code" class="prf-cur-btn-code">SAR</span>
                        <svg id="prf-cur-chevron" width="14" height="14" viewBox="0 0 24 24"
                             fill="none" stroke="currentColor" stroke-width="2.5"
                             style="transition:transform .2s">
                            <polyline points="6 9 12 15 18 9"/>
                        </svg>
                        <input type="hidden" id="prf-currency" value="SAR">
                    </button>
                </div>
                <!-- Dropdown — داخل نفس الحاوي لضمان الموضع الصحيح -->
                <div class="prf-cur-drop" id="prf-cur-menu">
                    <div class="prf-cur-drop-search">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                             stroke="currentColor" stroke-width="2">
                            <circle cx="11" cy="11" r="8"/>
                            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                        </svg>
                        <input type="text" class="prf-cur-drop-inp"
                               placeholder="بحث عن عملة أو دولة..."
                               oninput="prFilterCurrencies(this.value)"
                               autocomplete="off">
                    </div>
                    <div class="prf-cur-drop-list" id="prf-cur-list">
                        ${Object.entries(typeof CURRENCY_MAP !== 'undefined' ? CURRENCY_MAP : { SAR: { symbol: 'ر.س', name: 'ريال سعودي', flag: '🇸🇦' } }).map(([code, c]) =>
        `<div class="prf-cur-opt ${code === 'SAR' ? 'prf-cur-opt-active' : ''}"
                                  data-code="${code}"
                                  onclick="prSelectCurrency('${code}','${c.symbol}','${c.flag || ''}')">
                                <span class="prf-cur-opt-flag">${c.flag || ''}</span>
                                <div class="prf-cur-opt-info">
                                    <span class="prf-cur-opt-name">${c.name}</span>
                                    <span class="prf-cur-opt-code">${code}</span>
                                </div>
                                <span class="prf-cur-opt-sym">${c.symbol}</span>
                            </div>`
    ).join('')}
                    </div>
                </div>
            </div>

            <!-- مؤشر المسار -->
            <div id="prf-path-indicator" style="display:none"></div>

            <!-- نوع الطلب — من transaction_types -->
            <div class="prf-field prf-sel-wrap" id="prf-type-wrap">
                <label class="prf-label">نوع الطلب <span class="prf-req">*</span></label>
                <div class="prf-sel-box" onclick="prToggleSel('type')">
                    <span class="prf-sel-val prf-sel-val-empty" id="prf-type-val">— اختر نوع الطلب —</span>
                    <svg class="prf-sel-chevron" width="14" height="14" viewBox="0 0 24 24"
                         fill="none" stroke="currentColor" stroke-width="2.5"
                         style="transition:transform .2s">
                        <polyline points="6 9 12 15 18 9"/>
                    </svg>
                    <input type="hidden" id="prf-request-type" value="">
                    <input type="hidden" id="prf-type-parent" value="">
                </div>
                <div class="prf-sel-drop" id="prf-type-drop">
                    <div class="prf-cur-drop-search">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="11" cy="11" r="8"/>
                            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                        </svg>
                        <input type="text" class="prf-cur-drop-inp" placeholder="بحث في أنواع الطلبات..."
                               oninput="prFilterSel('type', this.value)" autocomplete="off">
                    </div>
                    <div class="prf-cur-drop-list" id="prf-type-list">
                        ${prBuildTypeOptions(opts.txTypes || [])}
                    </div>
                </div>
            </div>

            <!-- حقل المورد — يتغير حسب النوع -->
            <div class="prf-field" id="prf-beneficiary-field">
                <!-- يُولَّد ديناميكياً بـ prSetRequestType -->
                <label class="prf-label" id="prf-ben-label">المورد <span class="prf-req">*</span></label>
                <select id="prf-supplier" class="prf-input" onchange="prToggleManualSupplier()">
                    <option value="">— اختر موردًا —</option>
                    ${supplierOpts}
                    <option value="manual">✏️ إدخال يدوي</option>
                </select>
                <div id="prf-supplier-manual-wrap" style="display:none;margin-top:.5rem">
                    <input type="text" id="prf-supplier-manual" class="prf-input"
                           placeholder="اكتب اسم المورد / الجهة...">
                </div>
            </div>

            <!-- الأولوية وتاريخ الحاجة -->
            <div class="prf-row">
                <div class="prf-field">
                    <label class="prf-label">الأولوية</label>
                    <div class="prf-priority-wrap">
                        <button type="button" class="prf-pri-btn prf-pri-active" id="prf-pri-normal"
                                onclick="prSetPriority('normal')">عادي</button>
                        <button type="button" class="prf-pri-btn prf-pri-urgent-btn" id="prf-pri-urgent"
                                onclick="prSetPriority('urgent')">⚡ عاجل</button>
                    </div>
                    <input type="hidden" id="prf-priority" value="normal">
                </div>
                <div class="prf-field">
                    <label class="prf-label">تاريخ الحاجة</label>
                    <input type="date" id="prf-needed-date" class="prf-input"
                           min="${new Date().toISOString().split('T')[0]}">
                </div>
            </div>

            <div class="prf-footer">
                <button class="prf-btn prf-btn-ghost" onclick="closeModal()">إلغاء</button>
                <button class="prf-btn prf-btn-primary" onclick="prFormNext(1)">
                    التالي
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
            </div>
        </div>

        <!-- ══ الخطوة 2: الموازنة ══ -->
        <div class="prf-page" id="prf-page-2" style="display:none">

            <!-- مركز التكلفة -->
            <div class="prf-field prf-sel-wrap" id="prf-cc-wrap">
                <label class="prf-label">مركز التكلفة</label>
                <div class="prf-sel-box" onclick="prToggleSel('cc')">
                    <span class="prf-sel-val" id="prf-cc-val">— اختر مركز التكلفة —</span>
                    <svg class="prf-sel-chevron" width="14" height="14" viewBox="0 0 24 24"
                         fill="none" stroke="currentColor" stroke-width="2.5"
                         style="transition:transform .2s">
                        <polyline points="6 9 12 15 18 9"/>
                    </svg>
                    <input type="hidden" id="prf-cost-center" value="">
                </div>
                <div class="prf-sel-drop" id="prf-cc-drop">
                    <div class="prf-cur-drop-search">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="11" cy="11" r="8"/>
                            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                        </svg>
                        <input type="text" class="prf-cur-drop-inp" placeholder="بحث في مراكز التكلفة..."
                               oninput="prFilterSel('cc', this.value)" autocomplete="off">
                    </div>
                    <div class="prf-cur-drop-list" id="prf-cc-list">
                        <div class="prf-sel-opt prf-sel-opt-empty" data-val="" onclick="prSelectSel('cc','','— اختر مركز التكلفة —')">
                            <span class="prf-sel-opt-label">— بدون تحديد —</span>
                        </div>
                        ${(opts.costCenters || []).map(c =>
        `<div class="prf-sel-opt" data-val="${c.id}" data-search="${(c.code || '') + ' ' + (c.name || '')}"
                                  onclick="prSelectSel('cc','${c.id}','${(c.code ? c.code + ' — ' : '') + c.name}')">
                                ${c.code ? `<span class="prf-sel-code-badge">${c.code}</span>` : ''}
                                <div class="prf-sel-opt-info">
                                    <span class="prf-sel-opt-label">${c.name}</span>
                                </div>
                            </div>`
    ).join('')}
                    </div>
                </div>
            </div>

            <!-- بند المصروف -->
            <div class="prf-field prf-sel-wrap" id="prf-bc-wrap">
                <label class="prf-label">بند المصروف</label>
                <div class="prf-sel-box" onclick="prToggleSel('bc')">
                    <span class="prf-sel-val" id="prf-bc-val">— اختر البند —</span>
                    <svg class="prf-sel-chevron" width="14" height="14" viewBox="0 0 24 24"
                         fill="none" stroke="currentColor" stroke-width="2.5"
                         style="transition:transform .2s">
                        <polyline points="6 9 12 15 18 9"/>
                    </svg>
                    <input type="hidden" id="prf-budget-cat" value="">
                </div>
                <div class="prf-sel-drop" id="prf-bc-drop">
                    <div class="prf-cur-drop-search">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="11" cy="11" r="8"/>
                            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                        </svg>
                        <input type="text" class="prf-cur-drop-inp" placeholder="بحث في بنود المصروف..."
                               oninput="prFilterSel('bc', this.value)" autocomplete="off">
                    </div>
                    <div class="prf-cur-drop-list" id="prf-bc-list">
                        <div class="prf-sel-opt prf-sel-opt-empty" data-val="" onclick="prSelectSel('bc','','— اختر البند —')">
                            <span class="prf-sel-opt-label">— بدون تحديد —</span>
                        </div>
                        ${(opts.budgetCategories || []).map(b =>
        `<div class="prf-sel-opt" data-val="${b.id}" data-search="${(b.code || '') + ' ' + (b.name || '')}"
                                  onclick="prSelectSel('bc','${b.id}','${(b.code ? b.code + ' — ' : '') + b.name}')">
                                ${b.code ? `<span class="prf-sel-code-badge">${b.code}</span>` : ''}
                                <div class="prf-sel-opt-info">
                                    <span class="prf-sel-opt-label">${b.name}</span>
                                </div>
                            </div>`
    ).join('')}
                    </div>
                </div>
            </div>

            <div class="prf-footer">
                <button class="prf-btn prf-btn-ghost" onclick="prFormBack(2)">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
                    السابق
                </button>
                <button class="prf-btn prf-btn-primary" onclick="prFormNext(2)">
                    التالي
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
            </div>
        </div>

        <!-- ══ الخطوة 3: ملخص التأكيد ══ -->
        <div class="prf-page" id="prf-page-3" style="display:none">
            <div class="prf-summary" id="prf-summary">
                <!-- يُولَّد ديناميكياً -->
            </div>
            <div class="prf-footer">
                <button class="prf-btn prf-btn-ghost" onclick="prFormBack(3)">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
                    تعديل
                </button>
                <button class="prf-btn prf-btn-submit" id="prf-submit-btn" onclick="prSubmitCreate()">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    إرسال الطلب
                </button>
            </div>
        </div>

    </div>`;

    openModal('large');
}

/** التالي */
function prFormNext(step) {
    if (step === 1) {
        const title = document.getElementById('prf-title')?.value?.trim();
        const amount = parseFloat(document.getElementById('prf-amount')?.value) || 0;
        const rtype = document.getElementById('prf-request-type')?.value || '';
        if (!title) { prFormShake('prf-title', 'عنوان الطلب مطلوب'); return; }
        if (amount <= 0) { prFormShake('prf-amount', 'المبلغ يجب أن يكون أكبر من صفر'); return; }
        if (!rtype) { prFormShake('prf-type-wrap', 'نوع الطلب مطلوب'); return; }

        // التحقق من المورد فقط إذا كان نوع شراء
        const suppSel = document.getElementById('prf-supplier')?.value;
        const suppVisible = document.getElementById('prf-supplier')?.style.display !== 'none';
        if (suppVisible && !suppSel) {
            prFormShake('prf-supplier', 'المورد مطلوب لهذا النوع'); return;
        }
    }
    prFormGoto(step + 1);
}

/** السابق */
function prFormBack(step) { prFormGoto(step - 1); }

/** الانتقال لخطوة */
function prFormGoto(step) {
    [1, 2, 3].forEach(i => {
        const pg = document.getElementById(`prf-page-${i}`);
        const stp = document.getElementById(`prf-stp-${i}`);
        if (!pg || !stp) return;
        pg.style.display = i === step ? 'flex' : 'none';
        stp.className = 'prf-step ' + (i < step ? 'prf-step-done' : i === step ? 'prf-step-active' : 'prf-step-pending');
        const num = stp.querySelector('.prf-step-num');
        if (num) num.innerHTML = i < step
            ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`
            : i;
    });
    if (step === 3) prBuildSummary();
}

/** ملخص التأكيد */
function prBuildSummary() {
    const opts = PRState.formOptions || {};
    const title = document.getElementById('prf-title')?.value?.trim() || '—';
    const desc = document.getElementById('prf-desc')?.value?.trim() || '';
    const rtype = document.getElementById('prf-request-type')?.value || '';
    const rtypeLabel = document.getElementById('prf-type-val')?.textContent || '—';
    const suppId = document.getElementById('prf-supplier')?.value;
    const suppName = (rtype !== 'supplier' || suppId === 'manual')
        ? document.getElementById('prf-supplier-manual')?.value || '—'
        : opts.suppliers?.find(s => String(s.id) === suppId)?.name || '—';
    const amount = parseFloat(document.getElementById('prf-amount')?.value) || 0;
    const currencyEl = document.getElementById('prf-currency');
    const currency = currencyEl?.value || 'SAR';
    const currencyInfo = (typeof CURRENCY_MAP !== 'undefined' && CURRENCY_MAP[currency])
        ? CURRENCY_MAP[currency]
        : { symbol: currency, name: currency, flag: '' };
    const currencyLabel = `${currencyInfo.flag} ${currency} — ${currencyInfo.name}`;
    const priority = document.getElementById('prf-priority')?.value || 'normal';
    const date = document.getElementById('prf-needed-date')?.value || '';
    const ccId = document.getElementById('prf-cost-center')?.value;
    const ccName = opts.costCenters?.find(c => String(c.id) === ccId)?.name || '—';
    const bcId = document.getElementById('prf-budget-cat')?.value;
    const bcName = opts.budgetCategories?.find(b => String(b.id) === bcId)?.name || '—';
    const budCode = document.getElementById('prf-budget-code')?.value?.trim() || '—';

    const threshold = opts.threshold || 5000;
    const isShort = amount < threshold;
    const pathLabel = isShort
        ? '⚡ مختصر — موظف الموازنة ← المشتريات ← المالية'
        : '📋 كامل — الخزينة + المالية ← CEO ← المشتريات ← المالية';
    const pathColor = isShort ? '#059669' : '#7c3aed';

    const fmtAmt = (a, c) => {
        const num = (parseFloat(a) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const sym = (typeof getCurrencySymbol === 'function') ? getCurrencySymbol(c) : c;
        return num + ' ' + sym;
    };

    const sumEl = document.getElementById('prf-summary');
    if (!sumEl) return;
    sumEl.innerHTML = `
        <!-- المسار -->
        <div class="prf-sum-path" style="background:${pathColor}10;border-color:${pathColor}30;color:${pathColor}">
            ${pathLabel}
        </div>

        <!-- بيانات رئيسية -->
        <div class="prf-sum-hero">
            <div class="prf-sum-hero-amount">${fmtAmt(amount, currency)}</div>
            <div class="prf-sum-hero-lbl">المبلغ التقديري</div>
        </div>

        <div class="prf-sum-grid">
            ${[
            ['العنوان', title],
            ['نوع الطلب', rtypeLabel],
            ['الجهة المستفيدة', suppName],
            ['الأولوية', priority === 'urgent' ? '⚡ عاجل' : 'عادي'],
            ['تاريخ الحاجة', date || '—'],
            ['مركز التكلفة', ccName],
            ['بند المصروف', bcName],
            ['كود الميزانية', budCode],
            ...(desc ? [['الوصف', desc]] : []),
        ].map(([k, v]) => `
            <div class="prf-sum-kv">
                <span class="prf-sum-k">${k}</span>
                <span class="prf-sum-v">${v}</span>
            </div>`).join('')}
        </div>`;
}

/** هزّ حقل خاطئ */
function prFormShake(fieldId, msg) {
    showToast(msg, 'error');
    const el = document.getElementById(fieldId);
    if (!el) return;
    el.style.borderColor = '#ef4444';
    el.style.animation = 'prShake .3s ease';
    setTimeout(() => { el.style.animation = ''; el.style.borderColor = ''; }, 1000);
    el.focus();
}

/** تبديل أولوية */
function prSetPriority(val) {
    document.getElementById('prf-priority').value = val;
    document.getElementById('prf-pri-normal').className = 'prf-pri-btn' + (val === 'normal' ? ' prf-pri-active' : '');
    document.getElementById('prf-pri-urgent').className = 'prf-pri-btn prf-pri-urgent-btn' + (val === 'urgent' ? ' prf-pri-active' : '');
}

/** تبديل ظهور حقل المورد اليدوي */
function prToggleManualSupplier() {
    const val = document.getElementById('prf-supplier')?.value;
    const wrap = document.getElementById('prf-supplier-manual-wrap');
    if (wrap) wrap.style.display = val === 'manual' ? 'block' : 'none';
}



/** فتح/إغلاق قائمة العملات */
function prToggleCurrencyMenu() {
    const menu = document.getElementById('prf-cur-menu');
    const wrap = document.getElementById('prf-amount-card');
    if (!menu) return;

    const isOpen = wrap?.classList.contains('prf-cur-wrap-open');
    if (isOpen) {
        wrap?.classList.remove('prf-cur-wrap-open');
        return;
    }
    wrap?.classList.add('prf-cur-wrap-open');

    const inp = menu.querySelector('.prf-cur-drop-inp');
    if (inp) { inp.value = ''; setTimeout(() => inp.focus(), 50); prFilterCurrencies(''); }
}

/** إغلاق قائمة العملات عند النقر خارجها */
document.addEventListener('click', function (e) {
    if (!e.target.closest('#prf-amount-card')) {
        document.getElementById('prf-amount-card')?.classList.remove('prf-cur-wrap-open');
    }
});

/** اختيار عملة */
function prSelectCurrency(code, sym, flag) {
    document.getElementById('prf-currency').value = code;
    const flagEl = document.getElementById('prf-cur-flag');
    const codeEl = document.getElementById('prf-cur-code');
    const symEl = document.getElementById('prf-cur-sym');
    if (flagEl) flagEl.textContent = flag;
    if (codeEl) codeEl.textContent = code;
    if (symEl) symEl.textContent = sym;
    // تظليل المختار
    document.querySelectorAll('.prf-cur-opt').forEach(el => {
        el.classList.toggle('prf-cur-opt-active', el.dataset.code === code);
    });
    // إغلاق القائمة
    document.getElementById('prf-amount-card')?.classList.remove('prf-cur-wrap-open');
    prPreviewWorkflowPath();
}

/** تصفية العملات بالبحث */
function prFilterCurrencies(q) {
    const lower = q.toLowerCase();
    document.querySelectorAll('#prf-cur-list .prf-cur-opt').forEach(el => {
        const text = el.textContent.toLowerCase();
        el.style.display = (!q || text.includes(lower)) ? '' : 'none';
    });
}

/** ═══ دوال القوائم المنسدلة العامة (مركز التكلفة، بند المصروف) ═══ */

const PRSelConfig = {
    cc: { wrap: 'prf-cc-wrap', drop: 'prf-cc-drop', val: 'prf-cc-val', list: 'prf-cc-list', input: 'prf-cost-center' },
    bc: { wrap: 'prf-bc-wrap', drop: 'prf-bc-drop', val: 'prf-bc-val', list: 'prf-bc-list', input: 'prf-budget-cat' },
    type: { wrap: 'prf-type-wrap', drop: 'prf-type-drop', val: 'prf-type-val', list: 'prf-type-list', input: 'prf-request-type' },
};

/** بناء خيارات أنواع الطلبات هرمياً */
function prBuildTypeOptions(types) {
    const parents = types.filter(t => !t.parent_id);
    const children = types.filter(t => t.parent_id);

    // أيقونات للأنواع الرئيسية
    const icons = {
        'أمر شراء': '🛒',
        'فاتورة مورد': '🧾',
        'سلفة': '💵',
        'تسوية': '⚖️',
        'مطالبة مالية': '📋',
        'صرف راتب': '💰',
        'أخرى': '📄',
    };

    return parents.map(p => {
        const kids = children.filter(c => String(c.parent_id) === String(p.id));
        const icon = icons[p.name] || '📌';

        if (kids.length === 0) {
            // نوع بسيط بدون أبناء
            return `<div class="prf-sel-opt" data-val="${p.id}" data-search="${p.name}"
                         onclick="prSelectType(${p.id}, '${p.name.replace(/'/g, "\'")}', null)">
                <span class="prf-type-icon">${icon}</span>
                <div class="prf-sel-opt-info">
                    <span class="prf-sel-opt-label">${p.name}</span>
                    ${p.description ? `<span class="prf-sel-opt-code">${p.description}</span>` : ''}
                </div>
            </div>`;
        }

        // نوع له أبناء — يعرض القسم ثم الأبناء
        const kidsHTML = kids.map(k =>
            `<div class="prf-sel-opt prf-sel-opt-child" data-val="${k.id}" data-search="${p.name} ${k.name}"
                  onclick="prSelectType(${k.id}, '${k.name.replace(/'/g, "\'")}', ${p.id})">
                <span class="prf-type-icon prf-type-icon-sm">↳</span>
                <div class="prf-sel-opt-info">
                    <span class="prf-sel-opt-label">${k.name}</span>
                </div>
            </div>`
        ).join('');

        return `<div class="prf-type-group">
            <div class="prf-type-group-head">${icon} ${p.name}</div>
            ${kidsHTML}
        </div>`;
    }).join('');
}

/** اختيار نوع الطلب مع تحديث حقل المورد حسب النوع */
function prSelectType(typeId, typeName, parentId) {
    // تحديث الـ hidden inputs
    const typeEl = document.getElementById('prf-request-type');
    const parentEl = document.getElementById('prf-type-parent');
    const labelEl = document.getElementById('prf-type-val');
    if (typeEl) typeEl.value = typeId;
    if (parentEl) parentEl.value = parentId || '';
    if (labelEl) {
        labelEl.textContent = typeName;
        labelEl.classList.remove('prf-sel-val-empty');
    }

    // تظليل المختار
    document.querySelectorAll('#prf-type-list .prf-sel-opt').forEach(el => {
        el.classList.toggle('prf-sel-opt-active', String(el.dataset.val) === String(typeId));
    });

    // إغلاق القائمة
    document.getElementById('prf-type-wrap')?.classList.remove('prf-sel-open');

    // تكيّف حقل المورد حسب نوع الطلب
    prAdaptBeneficiaryField(typeName, parentId);
}

/** تكيّف حقل الجهة المستفيدة حسب نوع الطلب */
function prAdaptBeneficiaryField(typeName, parentId) {
    const opts = PRState.formOptions || {};
    const name = typeName.toLowerCase();
    const sel = document.getElementById('prf-supplier');
    const wrap = document.getElementById('prf-supplier-manual-wrap');
    const man = document.getElementById('prf-supplier-manual');
    const label = document.getElementById('prf-ben-label');

    // هل نوع يستدعي مورداً من القائمة؟
    const needsSupplier = name.includes('شراء') || name.includes('فاتورة') || name.includes('مورد');
    // هل يستدعي موظفاً؟
    const needsEmployee = name.includes('سلفة') || name.includes('راتب') || name.includes('تسوية') || name.includes('مطالبة');

    if (needsSupplier) {
        if (sel) sel.style.display = '';
        if (wrap) wrap.style.display = 'none';
        if (label) label.innerHTML = 'المورد <span class="prf-req">*</span>';
    } else if (needsEmployee) {
        if (sel) { sel.style.display = 'none'; sel.value = 'manual'; }
        if (wrap) { wrap.style.display = 'block'; }
        if (man) { man.placeholder = 'اسم الموظف أو رقمه الوظيفي'; }
        if (label) label.innerHTML = 'الموظف المستفيد <span class="prf-hint">اختياري</span>';
    } else {
        if (sel) { sel.style.display = 'none'; sel.value = 'manual'; }
        if (wrap) { wrap.style.display = 'block'; }
        if (man) { man.placeholder = 'الجهة أو الوصف (اختياري)'; }
        if (label) label.innerHTML = 'الجهة / الوصف <span class="prf-hint">اختياري</span>';
    }
}

function prToggleSel(key) {
    const cfg = PRSelConfig[key];
    const wrap = document.getElementById(cfg.wrap);
    if (!wrap) return;

    // إغلاق أي قائمة أخرى مفتوحة
    Object.keys(PRSelConfig).forEach(k => {
        if (k !== key) document.getElementById(PRSelConfig[k].wrap)?.classList.remove('prf-sel-open');
    });

    const isOpen = wrap.classList.contains('prf-sel-open');
    wrap.classList.toggle('prf-sel-open', !isOpen);

    if (!isOpen) {
        const inp = document.querySelector(`#${cfg.drop} .prf-cur-drop-inp`);
        if (inp) { inp.value = ''; setTimeout(() => inp.focus(), 50); prFilterSel(key, ''); }
    }
}

function prSelectSel(key, val, label) {
    const cfg = PRSelConfig[key];
    const hiddenEl = document.getElementById(cfg.input);
    const labelEl = document.getElementById(cfg.val);
    if (hiddenEl) hiddenEl.value = val;
    if (labelEl) labelEl.textContent = label;
    labelEl?.classList.toggle('prf-sel-val-empty', !val);

    // تظليل المختار
    document.querySelectorAll(`#${cfg.list} .prf-sel-opt`).forEach(el => {
        el.classList.toggle('prf-sel-opt-active', el.dataset.val === String(val));
    });

    document.getElementById(cfg.wrap)?.classList.remove('prf-sel-open');
}

function prFilterSel(key, q) {
    const cfg = PRSelConfig[key];
    const lower = q.toLowerCase();
    const list = document.getElementById(cfg.list);
    if (!list) return;

    // تصفية العناصر
    list.querySelectorAll('.prf-sel-opt:not(.prf-sel-opt-empty)').forEach(el => {
        const txt = (el.dataset.search || el.textContent).toLowerCase();
        el.style.display = (!q || txt.includes(lower)) ? '' : 'none';
    });

    // إخفاء عناوين المجموعات التي لا تحتوي على نتائج ظاهرة
    list.querySelectorAll('.prf-type-group').forEach(group => {
        const hasVisible = Array.from(group.querySelectorAll('.prf-sel-opt:not(.prf-sel-opt-empty)'))
            .some(el => el.style.display !== 'none');
        group.style.display = hasVisible ? '' : 'none';
    });
}

// إغلاق عند النقر خارجاً
document.addEventListener('click', function (e) {
    if (!e.target.closest('.prf-sel-wrap')) {
        Object.values(PRSelConfig).forEach(cfg => {
            document.getElementById(cfg.wrap)?.classList.remove('prf-sel-open');
        });
    }
});

/** عرض مؤشر المسار */
function prPreviewWorkflowPath() {
    const amount = parseFloat(document.getElementById('prf-amount')?.value) || 0;
    const currency = document.getElementById('prf-currency')?.value || 'SAR';
    const threshold = PRState.formOptions?.threshold || 5000;
    const indicator = document.getElementById('prf-path-indicator');
    if (!indicator) return;
    if (amount <= 0) { indicator.style.display = 'none'; return; }
    indicator.style.display = 'block';
    const isShort = amount < threshold;
    indicator.innerHTML = isShort
        ? `<div class="prf-path-pill prf-path-short">⚡ مسار مختصر — أقل من ${threshold.toLocaleString()} ريال &nbsp;·&nbsp; موظف الموازنة ← المشتريات ← المالية</div>`
        : `<div class="prf-path-pill prf-path-long">📋 مسار كامل — أعلى من ${threshold.toLocaleString()} ريال &nbsp;·&nbsp; الخزينة + المالية ← CEO ← المشتريات ← المالية</div>`;
}

async function prSubmitCreate() {
    const title = document.getElementById('prf-title')?.value?.trim();
    const amount = parseFloat(document.getElementById('prf-amount')?.value) || 0;
    const rtype = document.getElementById('prf-request-type')?.value || 'supplier';
    const suppSel = document.getElementById('prf-supplier')?.value;
    const suppMan = document.getElementById('prf-supplier-manual')?.value?.trim();

    // تحديد supplier_id و supplier_name_manual حسب نوع الطلب
    const supplierId = (rtype === 'supplier' && suppSel && suppSel !== 'manual') ? suppSel : '';
    const supplierName = (rtype !== 'supplier' || suppSel === 'manual') ? suppMan : '';

    const body = {
        title: title,
        description: document.getElementById('prf-desc')?.value || '',
        type_id: rtype,
        parent_type_id: document.getElementById('prf-type-parent')?.value || '',
        supplier_id: supplierId,
        supplier_name_manual: supplierName,
        amount: amount,
        currency: document.getElementById('prf-currency')?.value || 'SAR',
        cost_center_id: document.getElementById('prf-cost-center')?.value || '',
        budget_category_id: document.getElementById('prf-budget-cat')?.value || '',
        priority: document.getElementById('prf-priority')?.value || 'normal',
        needed_date: document.getElementById('prf-needed-date')?.value || '',
    };

    const btn = document.getElementById('prf-submit-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'جارٍ الإرسال...'; }

    try {
        const res = await fetch('api/purchase_requests_api.php?action=create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await res.json();

        if (data.success) {
            showToast(`✅ تم إنشاء الطلب ${data.number} بنجاح`, 'success');
            closeModal();
            await prLoadRequestsList();
        } else {
            showToast(data.message || 'فشل إنشاء الطلب', 'error');
        }
    } catch (e) {
        showToast('خطأ في الاتصال', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'إرسال الطلب'; }
    }
}


// ════════════════════════════════════════════════════════════
// ⑥ الموافقة / الرفض
// ════════════════════════════════════════════════════════════

/**
 * فتح نافذة الموافقة
 * @param {number} requestId
 * @param {string} stage
 */
function prOpenApproveModal(requestId, stage) {
    DOM.modalTitle.textContent = `✅ موافقة — ${PR_STAGE_NAMES[stage] || stage}`;
    DOM.modalBody.innerHTML = `
        <div class="pr-form">
            <div class="form-group">
                <label class="form-label">ملاحظات (اختيارية)</label>
                <textarea id="approve-notes" class="form-control" rows="3"
                          placeholder="أضف ملاحظاتك..."></textarea>
            </div>
            <div class="form-actions">
                <button class="btn btn-ghost" onclick="closeModal()">إلغاء</button>
                <button class="btn btn-success" onclick="prSubmitApprove(${requestId}, '${stage}')">
                    ✅ تأكيد الموافقة
                </button>
            </div>
        </div>
    `;
    openModal();
}

/** إرسال الموافقة */
async function prSubmitApprove(requestId, stage) {
    const notes = document.getElementById('approve-notes')?.value || '';
    const result = await prPostAction('approve', { request_id: requestId, stage, notes });
    if (result?.success) {
        showToast('✅ تمت الموافقة بنجاح', 'success');
        closeModal();
        await prOpenDetail(requestId);
    }
}

/**
 * فتح نافذة الرفض
 * @param {number} requestId
 * @param {string} stage
 */
function prOpenRejectModal(requestId, stage) {
    DOM.modalTitle.textContent = `❌ رفض الطلب`;
    DOM.modalBody.innerHTML = `
        <div class="pr-form">
            <div class="form-group">
                <label class="form-label">سبب الرفض *</label>
                <textarea id="reject-reason" class="form-control" rows="4"
                          placeholder="اشرح سبب الرفض بوضوح..." required></textarea>
            </div>
            <p class="pr-reject-note">
                ⚠️ سيتم إرجاع الطلب لمدير الإدارة الطالبة مع سبب الرفض.
            </p>
            <div class="form-actions">
                <button class="btn btn-ghost" onclick="closeModal()">إلغاء</button>
                <button class="btn btn-danger" onclick="prSubmitReject(${requestId}, '${stage}')">
                    ❌ تأكيد الرفض
                </button>
            </div>
        </div>
    `;
    openModal();
}

/** إرسال الرفض */
async function prSubmitReject(requestId, stage) {
    const reason = document.getElementById('reject-reason')?.value?.trim();
    if (!reason) { showToast('سبب الرفض مطلوب', 'error'); return; }

    const result = await prPostAction('reject', { request_id: requestId, stage, reason });
    if (result?.success) {
        showToast('تم رفض الطلب وإرجاعه لمدير الإدارة', 'warning');
        closeModal();
        await prLoadRequestsList();
    }
}


// ════════════════════════════════════════════════════════════
// ⑦ الإحالة والإسناد الداخلي
// ════════════════════════════════════════════════════════════

/**
 * فتح نافذة الإحالة
 * @param {number} requestId
 */
async function prOpenReferModal(requestId) {
    const [deptRes, empRes] = await Promise.all([
        fetch('api/settings.php?action=get_departments'),
        fetch('api/purchase_requests_api.php?action=dept_employees'),
    ]);
    const deptData = await deptRes.json();
    const empData = await empRes.json();

    const allDepts = (deptData.data || []).filter(d => d.dept_type !== 'sector');
    const sectors = (deptData.data || []).filter(d => d.dept_type === 'sector');
    const emps = empData.data || [];

    function buildDeptOpts() {
        const grouped = {};
        allDepts.forEach(d => {
            const sKey = d.sector_id || 'other';
            if (!grouped[sKey]) grouped[sKey] = [];
            grouped[sKey].push(d);
        });
        return Object.entries(grouped).map(([sId, divs]) => {
            const sector = sectors.find(s => String(s.id) === String(sId));
            const sName = sector ? sector.name : 'أخرى';
            const items = divs.map(d => {
                const nameEn = d.name_en ? `<span class="prf-sel-opt-code">${d.name_en}</span>` : '';
                const badge = d.code ? `<span class="prf-sel-code-badge">${d.code}</span>` : '';
                return `<div class="prf-sel-opt" data-val="${d.id}"
                      data-search="${d.name} ${d.name_en || ''} ${d.code || ''}"
                      onclick="prSelectReferDept(${d.id},'${d.name.replace(/'/g, "\'")}')">
                    ${badge}
                    <div class="prf-sel-opt-info">
                        <span class="prf-sel-opt-label">${d.name}</span>
                        ${nameEn}
                    </div>
                </div>`;
            }).join('');
            return `<div class="prf-type-group"><div class="prf-type-group-head">🏛️ ${sName}</div>${items}</div>`;
        }).join('');
    }

    const empOptsHTML = emps.length
        ? emps.map(e => `<div class="prf-sel-opt" data-val="${e.id}"
                data-search="${e.name} ${e.employee_number || ''}"
                onclick="prSelectSel('refEmp','${e.id}','${e.name.replace(/'/g, "\'")}')">
            <div class="prf-sel-opt-info">
                <span class="prf-sel-opt-label">${e.name}</span>
                <span class="prf-sel-opt-code">${e.role || ''} ${e.employee_number ? '· #' + e.employee_number : ''}</span>
            </div></div>`).join('')
        : '<div style="padding:.75rem 1rem;color:var(--text-muted);font-size:.82rem">لا يوجد موظفون</div>';

    DOM.modalTitle.textContent = '🔀 إحالة المعاملة';
    DOM.modalBody.innerHTML = `
    <div class="pr-form">
        <div class="prf-field">
            <label class="prf-label">نوع الإحالة</label>
            <div class="prf-priority-wrap">
                <button type="button" class="prf-pri-btn prf-pri-active" id="ref-tab-int"
                        onclick="prToggleReferType('internal')">👤 داخلي</button>
                <button type="button" class="prf-pri-btn" id="ref-tab-ext"
                        onclick="prToggleReferType('external')">🏢 إلى قسم آخر</button>
            </div>
            <input type="hidden" id="ref-type" value="internal">
        </div>

        <div id="ref-internal-wrap" class="prf-field prf-sel-wrap">
            <label class="prf-label">الموظف المُحال إليه</label>
            <div class="prf-sel-box" onclick="prToggleSel('refEmp')">
                <span class="prf-sel-val prf-sel-val-empty" id="prf-ref-emp-val">— اختر موظفًا —</span>
                <svg class="prf-sel-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="2.5" style="transition:transform .2s">
                    <polyline points="6 9 12 15 18 9"/>
                </svg>
                <input type="hidden" id="ref-employee" value="">
            </div>
            <div class="prf-sel-drop" id="ref-emp-drop">
                <div class="prf-cur-drop-search">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                    <input type="text" class="prf-cur-drop-inp" placeholder="بحث..."
                           oninput="prFilterSel('refEmp',this.value)" autocomplete="off">
                </div>
                <div class="prf-cur-drop-list" id="ref-emp-list">${empOptsHTML}</div>
            </div>
        </div>

        <div id="ref-external-wrap" class="prf-field prf-sel-wrap" style="display:none">
            <label class="prf-label">القسم المُحال إليه <span class="prf-req">*</span></label>
            <div class="prf-sel-box" onclick="prToggleSel('refDept')">
                <span class="prf-sel-val prf-sel-val-empty" id="prf-ref-dept-val">— اختر القسم —</span>
                <svg class="prf-sel-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="2.5" style="transition:transform .2s">
                    <polyline points="6 9 12 15 18 9"/>
                </svg>
                <input type="hidden" id="ref-dept" value="">
            </div>
            <div class="prf-sel-drop" id="ref-dept-drop">
                <div class="prf-cur-drop-search">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                    <input type="text" class="prf-cur-drop-inp" placeholder="بحث في الأقسام..."
                           oninput="prFilterSel('refDept',this.value)" autocomplete="off">
                </div>
                <div class="prf-cur-drop-list" id="ref-dept-list">${buildDeptOpts()}</div>
            </div>
        </div>

        <div class="prf-field">
            <label class="prf-label">سبب الإحالة <span class="prf-req">*</span></label>
            <textarea id="ref-reason" class="prf-input prf-textarea" rows="3"
                      placeholder="اشرح سبب الإحالة..."></textarea>
        </div>

        <div class="prf-footer" style="margin-top:.5rem">
            <button class="prf-btn prf-btn-ghost" onclick="closeModal()">إلغاء</button>
            <button class="prf-btn prf-btn-primary" onclick="prSubmitRefer(${requestId})">
                🔀 تأكيد الإحالة
            </button>
        </div>
    </div>`;

    PRSelConfig.refEmp = { wrap: 'ref-internal-wrap', drop: 'ref-emp-drop', val: 'prf-ref-emp-val', list: 'ref-emp-list', input: 'ref-employee' };
    PRSelConfig.refDept = { wrap: 'ref-external-wrap', drop: 'ref-dept-drop', val: 'prf-ref-dept-val', list: 'ref-dept-list', input: 'ref-dept' };

    openModal('large');
}


/** دالة مساعدة لاختيار القسم المُحال إليه */
function prSelectReferDept(id, name) {
    document.getElementById('ref-dept').value = id;
    const lbl = document.getElementById('prf-ref-dept-val');
    if (lbl) { lbl.textContent = name; lbl.classList.remove('prf-sel-val-empty'); }
    document.querySelectorAll('#ref-dept-list .prf-sel-opt').forEach(el => {
        el.classList.toggle('prf-sel-opt-active', String(el.dataset.val) === String(id));
    });
    document.getElementById('ref-external-wrap')?.classList.remove('prf-sel-open');
}

function prToggleReferType(type) {
    document.getElementById('ref-type').value = type;
    const isInt = type === 'internal';
    document.getElementById('ref-internal-wrap').style.display = isInt ? '' : 'none';
    document.getElementById('ref-external-wrap').style.display = !isInt ? '' : 'none';
    // تبويبات
    document.getElementById('ref-tab-int').className = 'prf-pri-btn' + (isInt ? ' prf-pri-active' : '');
    document.getElementById('ref-tab-ext').className = 'prf-pri-btn' + (!isInt ? ' prf-pri-active' : '');
}

/** إرسال الإحالة */
async function prSubmitRefer(requestId) {
    const type = document.getElementById('ref-type')?.value;
    const reason = document.getElementById('ref-reason')?.value?.trim();
    if (!reason) { showToast('سبب الإحالة مطلوب', 'error'); return; }

    const body = {
        request_id: requestId,
        type,
        reason,
        to_employee_id: document.getElementById('ref-employee')?.value || null,
        to_department_id: document.getElementById('ref-dept')?.value || null,
    };

    const result = await prPostAction('refer', body);
    if (result?.success) {
        showToast('✅ تم تسجيل الإحالة بنجاح', 'success');
        closeModal();
        await prOpenDetail(requestId);
    }
}

/**
 * فتح نافذة الإسناد الداخلي
 * @param {number} requestId
 */
async function prOpenAssignModal(requestId) {
    const res = await fetch(`api/purchase_requests_api.php?action=dept_employees&dept_id=${currentUser.departmentId}`);
    const data = await res.json();
    const emps = data.data || [];

    DOM.modalTitle.textContent = '👤 إسناد داخلي';
    DOM.modalBody.innerHTML = `
        <div class="pr-form">
            <p class="pr-modal-note">
                يمكنك إسناد هذه المعاملة لأحد موظفي إدارتك للمتابعة الداخلية.
                لن يتأثر مسار الموافقات.
            </p>
            <div class="form-group">
                <label class="form-label">الموظف المُسند إليه *</label>
                <select id="assign-employee" class="form-control">
                    <option value="">-- اختر موظفًا --</option>
                    ${emps.map(e => `<option value="${e.id}">${e.name} (${e.role})</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">ملاحظات (اختيارية)</label>
                <textarea id="assign-notes" class="form-control" rows="2"
                          placeholder="توجيهات أو ملاحظات للموظف..."></textarea>
            </div>
            <div class="form-actions">
                <button class="btn btn-ghost" onclick="closeModal()">إلغاء</button>
                <button class="btn btn-primary" onclick="prSubmitAssign(${requestId})">
                    👤 تأكيد الإسناد
                </button>
            </div>
        </div>
    `;
    openModal();
}

/** إرسال الإسناد */
async function prSubmitAssign(requestId) {
    const empId = document.getElementById('assign-employee')?.value;
    if (!empId) { showToast('يجب اختيار موظف', 'error'); return; }

    const result = await prPostAction('assign', {
        request_id: requestId,
        assigned_employee_id: empId,
        notes: document.getElementById('assign-notes')?.value || '',
    });

    if (result?.success) {
        showToast(`✅ ${result.message}`, 'success');
        closeModal();
        await prOpenDetail(requestId);
    }
}


// ════════════════════════════════════════════════════════════
// ⑧ إصدار أمر الشراء (المشتريات)
// ════════════════════════════════════════════════════════════

/**
 * فتح نافذة إصدار أمر الشراء
 * @param {number} requestId
 */
function prOpenPOModal(requestId) {
    const req = PRState.currentRequest;
    const opts = PRState.formOptions || {};

    DOM.modalTitle.textContent = '📋 إصدار أمر الشراء';
    DOM.modalBody.innerHTML = `
        <div class="pr-form">
            <div class="pr-po-summary">
                <strong>الطلب:</strong> ${req?.request_number}<br>
                <strong>المبلغ التقديري:</strong> ${prFormatAmount(req?.amount, req?.currency)}
            </div>
            <div class="form-group">
                <label class="form-label">رقم أمر الشراء *</label>
                <input type="text" id="po-number" class="form-control"
                       placeholder="مثال: PO-2026-001" required>
            </div>
            <div class="form-group">
                <label class="form-label">المورد النهائي *</label>
                <select id="po-supplier" class="form-control" onchange="prTogglePOManualSupplier()">
                    <option value="">-- اختر موردًا --</option>
                    ${(opts.suppliers || []).map(s =>
        `<option value="${s.id}">${s.name}</option>`
    ).join('')}
                    <option value="manual">إدخال يدوي</option>
                </select>
            </div>
            <div class="form-group" id="po-supplier-manual-wrap" style="display:none">
                <input type="text" id="po-supplier-manual" class="form-control"
                       placeholder="اسم المورد النهائي">
            </div>
            <div class="form-group">
                <label class="form-label">المبلغ النهائي *</label>
                <input type="number" id="po-amount" class="form-control"
                       min="0" step="0.01" placeholder="0.00"
                       value="${req?.amount || ''}">
                <small class="form-hint">
                    ⚠️ إذا تجاوز المبلغ النهائي الحد (${(opts.threshold || 5000).toLocaleString()} ريال)
                    وكان الطلب في المسار المختصر، سيُعاد توجيهه تلقائياً للمسار الكامل.
                </small>
            </div>
            <div class="form-actions">
                <button class="btn btn-ghost" onclick="closeModal()">إلغاء</button>
                <button class="btn btn-primary" onclick="prSubmitPO(${requestId})">
                    📋 إصدار أمر الشراء
                </button>
            </div>
        </div>
    `;
    openModal('medium');
}

function prTogglePOManualSupplier() {
    const val = document.getElementById('po-supplier')?.value;
    const wrap = document.getElementById('po-supplier-manual-wrap');
    if (wrap) wrap.style.display = val === 'manual' ? 'block' : 'none';
}

/** إرسال أمر الشراء */
async function prSubmitPO(requestId) {
    const poNumber = document.getElementById('po-number')?.value?.trim();
    const suppSel = document.getElementById('po-supplier')?.value;
    const finalAmt = parseFloat(document.getElementById('po-amount')?.value) || 0;

    if (!poNumber) { showToast('رقم أمر الشراء مطلوب', 'error'); return; }
    if (!suppSel) { showToast('المورد النهائي مطلوب', 'error'); return; }
    if (finalAmt <= 0) { showToast('المبلغ النهائي مطلوب', 'error'); return; }

    const result = await prPostAction('issue_po', {
        request_id: requestId,
        po_number: poNumber,
        final_supplier_id: suppSel !== 'manual' ? suppSel : '',
        final_supplier_name: suppSel === 'manual'
            ? document.getElementById('po-supplier-manual')?.value || ''
            : '',
        final_amount: finalAmt,
    });

    if (result?.success) {
        let msg = '✅ تم إصدار أمر الشراء وإنشاء حجز الموازنة';
        if (result.redirected) {
            msg += '\n🔄 تم إعادة توجيه الطلب للمسار الكامل (المبلغ تجاوز الحد)';
        }
        showToast(msg, 'success');
        closeModal();
        await prOpenDetail(requestId);
    }
}


// ════════════════════════════════════════════════════════════
// ⑧-ب طلب موافقة الرئيس التنفيذي من المشتريات
// ════════════════════════════════════════════════════════════

/**
 * يُرسل الطلب لاعتماد CEO مباشرةً من مرحلة المشتريات
 * يُستخدم عندما يرى موظف المشتريات ضرورة الحصول على موافقة عليا
 */
async function prRequestCeoApproval(requestId) {
    const notes = prompt('ملاحظات طلب موافقة الرئيس التنفيذي (اختيارية):');
    if (notes === null) return; // ألغى المستخدم

    const btn = event?.target;
    if (btn) { btn.disabled = true; btn.textContent = '...جاري الإرسال'; }

    try {
        const result = await prPostAction('request_ceo_approval', {
            request_id: requestId,
            notes: notes || '',
        });

        if (result?.success) {
            showToast('✅ تم إرسال الطلب لاعتماد الرئيس التنفيذي', 'success');
            await prOpenDetail(requestId);
        } else {
            showToast(result?.message || 'حدث خطأ', 'error');
        }
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '🔼 موافقة CEO'; }
    }
}

// ════════════════════════════════════════════════════════════
// ⑨ رفع المرفقات
// ════════════════════════════════════════════════════════════

/**
 * رفع مرفق جديد للطلب
 * @param {Event}  event
 * @param {number} requestId
 */
async function prUploadFile(event, requestId) {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('action', 'upload_attachment');
    formData.append('request_id', requestId);
    formData.append('file', file);

    showToast('جارٍ رفع الملف...', 'info');

    try {
        const res = await fetch('api/purchase_requests_api.php?action=upload_attachment', {
            method: 'POST',
            body: formData,
        });
        const data = await res.json();

        if (data.success) {
            showToast('✅ تم رفع الملف بنجاح', 'success');
            await prOpenDetail(requestId);
        } else {
            showToast(data.message || 'فشل رفع الملف', 'error');
        }
    } catch (e) {
        showToast('خطأ في الاتصال', 'error');
    }
}


// ════════════════════════════════════════════════════════════
// ⑩ دوال مساعدة ومشتركة
// ════════════════════════════════════════════════════════════

/**
 * إرسال طلب POST للـ API
 * @param {string} action
 * @param {Object} body
 * @returns {Object|null}
 */
async function prPostAction(action, body) {
    try {
        const res = await fetch(`api/purchase_requests_api.php?action=${action}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!data.success) showToast(data.message || 'حدث خطأ', 'error');
        return data;
    } catch (e) {
        showToast('خطأ في الاتصال بالخادم', 'error');
        return null;
    }
}

/**
 * التحقق من صلاحية الموافقة للمستخدم الحالي في مرحلة معينة
 * @param {Object} req بيانات الطلب
 * @returns {boolean}
 */
function prCanApproveCurrentStage(req) {
    const stage = req.current_stage;
    const role = currentUser.role;
    const level = currentUser.permissionLevel;
    const dept = (currentUser.departmentId || 0).toString();

    if (level === 'system_admin') return true;

    const stagePermissions = {
        budget_review: ['budget'],
        treasury_review: ['dispatch', 'treasury_manager', 'manager'],
        finance_review: ['manager'],
        ceo_approval: ['admin', 'CEO'],
        purchasing: ['dispatch', 'purchasing'],   // سلاسل الإمداد والمشتريات
        payment: ['payment'],
    };

    const allowed = stagePermissions[stage] || [];
    if (allowed.includes(role) || allowed.includes(level)) return true;

    // موظفو سلاسل الإمداد — استخدم نتيجة DB إذا متاحة
    if (stage === 'purchasing') {
        if (PRState.userAccess?.is_supply_chain) return true;
        const deptCode = (currentUser.departmentCode || '').toString();
        if (deptCode === 'PUR' || deptCode.startsWith('41')) return true;
    }
    return false;
}

/** هل المستخدم الحالي من موظفي سلاسل الإمداد أو المشتريات */
function prIsPurchasingUser() {
    if (currentUser.permissionLevel === 'system_admin') return true;
    // استخدم النتيجة المجلوبة من DB إذا كانت متاحة
    if (PRState.userAccess) return PRState.userAccess.is_supply_chain === true;
    // fallback: فحص محلي
    if (['dispatch', 'purchasing'].includes(currentUser.role)) return true;
    const deptCode = (currentUser.departmentCode || '').toString();
    return deptCode === 'PUR' || deptCode.startsWith('41');
}

/** تنسيق المبلغ مع العملة */
function prFormatAmount(amount, currency) {
    if (!amount) return '—';
    const num = parseFloat(amount).toLocaleString('en-US', {
        minimumFractionDigits: 2, maximumFractionDigits: 2
    });
    return `${num} ${currency || 'SAR'}`;
}

/** تنسيق التاريخ */
function prFormatDate(dateStr) {
    if (!dateStr) return '—';
    try {
        return new Date(dateStr).toLocaleDateString('ar-SA', {
            year: 'numeric', month: 'short', day: 'numeric'
        });
    } catch { return dateStr; }
}

/** تنسيق التاريخ والوقت */
function prFormatDateTime(dateStr) {
    if (!dateStr) return '—';
    try {
        return new Date(dateStr).toLocaleString('ar-SA', {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    } catch { return dateStr; }
}

/** أيقونة نوع الملف */
function prGetFileIcon(fileType) {
    if (!fileType) return '📄';
    if (fileType.includes('pdf')) return '📕';
    if (fileType.includes('image')) return '🖼️';
    if (fileType.includes('sheet') || fileType.includes('excel')) return '📊';
    if (fileType.includes('word')) return '📝';
    return '📄';
}