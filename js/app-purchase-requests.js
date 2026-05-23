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

// ── أسماء المراحل الافتراضية ─────────────────────────────
function getPRStageNamesDefault() {
    return {
        draft: 'مسودة', reception: 'الاستلام والتحقق',
        budget_review: 'مراجعة موظف الموازنة', treasury_review: 'مراجعة مدير الخزينة',
        finance_review: 'مراجعة رئيس القطاع المالي', treasury_finance_review: 'مراجعة الخزينة والمالية',
        ceo_approval: 'موافقة الرئيس التنفيذي', purchasing: 'المشتريات — إنشاء حجز',
        waiting_budget_approval: 'اعتماد حجز الموازنة', accounts_review: 'الحسابات — مراجعة وتوزيع',
        po_issuance: 'إصدار أمر الشراء', payment: 'المالية — الدفع',
        completed: 'مكتملة', rejected: 'مرفوضة', returned: 'مُرجَعة للمنشئ',
    };
}

// ── تحميل أسماء المراحل من DB ────────────────────────────
if (!PRState.stageNamesCache) PRState.stageNamesCache = {};
async function prLoadStageNames() {
    try {
        const r = await fetch('api/purchase_requests_api.php?action=stage_names');
        const d = await r.json();
        if (d.success && d.names) Object.assign(PRState.stageNamesCache, d.names);
    } catch (e) { }
}



/** أسماء المراحل بالعربية */
function getPRStageNames() {
    return {
        draft: tr('مسودة'),
        reception: tr('الاستلام والتحقق'),
        budget_review: tr('مراجعة موظف الموازنة'),
        treasury_review: tr('مراجعة مدير الخزينة'),
        finance_review: tr('مراجعة رئيس القطاع المالي'),
        treasury_finance_review: tr('مراجمة الخزينة والمالية'),
        ceo_approval: tr('موافقة مبدئية — الرئيس التنفيذي'),
        purchasing: tr('المشتريات — إنشاء حجز'),
        waiting_budget_approval: tr('اعتماد حجز الموازنة'),
        accounts_review: tr('الحسابات — مراجعة وتوزيع'),
        po_issuance: tr('إصدار أمر الشراء (PO)'),
        payment: tr('المالية — الدفع'),
        completed: tr('مكتملة'),
        rejected: tr('مرفوضة'),
        returned: tr('مُرجَعة للمنشئ'),
    };
}
const PR_STAGE_NAMES = new Proxy({}, { get: (_, k) => getPRStageNames()[k] });

/** ألوان المراحل */
const PR_STAGE_COLORS = {
    draft: '#94a3b8',
    reception: '#0891b2',
    budget_review: '#3b82f6',
    treasury_review: '#8b5cf6',
    finance_review: '#7c3aed',
    treasury_finance_review: '#7c3aed',
    ceo_approval: '#dc2626',
    purchasing: '#f59e0b',
    waiting_budget_approval: '#f97316',
    accounts_review: '#ec4899',
    po_issuance: '#d97706',
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

    // تحميل أسماء المراحل الديناميكية
    prLoadStageNames();
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
            showToast(data.message || tr('خطأ في تحميل البيانات'), 'error');
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
                        طلبات الشراء
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
                            <th data-tr="رقم الطلب">رقم الطلب</th>
                            <th data-tr="العنوان">العنوان</th>
                            <th data-tr="الإدارة">الإدارة</th>
                            <th data-tr="المورد">المورد</th>
                            <th data-tr="المبلغ">المبلغ</th>
                            <th data-tr="الأولوية">الأولوية</th>
                            <th data-tr="المرحلة">المرحلة</th>
                            <th data-tr="مُسند إلى">مُسند إلى</th>
                            <th>SLA</th>
                            <th data-tr="التاريخ">التاريخ</th>
                            <th data-tr="الإجراءات">إجراءات</th>
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
                        ${req.priority === 'urgent' ? '⚡ ' + tr('عاجل') : tr('عادي')}
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
            <p>لا توجد طلبات شراء حالياً</p>
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
        showToast(tr('خطأ في الاتصال'), 'error');
        console.error(e);
    }
}

/**
 * رسم صفحة تفاصيل الطلب
 * @param {Object} req بيانات الطلب مع الأحداث والمرفقات
 */
function prRenderDetail(req) {
    _prCurrentReq = req;
    const stageName = PR_STAGE_NAMES[req.current_stage] || req.current_stage;
    const stageColor = PR_STAGE_COLORS[req.current_stage] || '#94a3b8';
    const canApprove = prCanApproveCurrentStage(req);
    const canAssign = currentUser.permissionLevel !== 'employee' && req.department_id === currentUser.departmentId;
    const alreadyActed = (req.stage_approvals || []).some(a =>
        a.stage === req.current_stage && parseInt(a.employee_id) === parseInt(currentUser.id) && ['approved', 'rejected'].includes(a.action));
    const isClosed = ['completed', 'rejected', 'returned'].includes(req.current_stage);

    // أزرار الإجراءات
    let actionBtns = '';
    if (isClosed) {
        const cc = req.current_stage === 'completed' ? '#22c55e' : req.current_stage === 'rejected' ? '#ef4444' : '#f97316';
        const cl = req.current_stage === 'completed' ? ('✅ ' + tr('مكتملة')) : req.current_stage === 'rejected' ? ('❌ ' + tr('مرفوضة')) : ('↩️ ' + tr('مُرجَعة للمنشئ'));
        actionBtns = `<span class="d3-closed-badge" style="background:${cc}15;color:${cc};border:1.5px solid ${cc}30">${cl}</span>`;
    } else {
        actionBtns = `<button class="d3-btn d3-btn-ghost" onclick="prOpenReferModal(${req.id})">🔀 ${tr('إحالة')}</button>`;
        if (canAssign) actionBtns += `<button class="d3-btn d3-btn-purple" onclick="prOpenAssignModal(${req.id})">👤 ${tr('إسناد')}</button>`;
        if (canApprove && !alreadyActed) {
            actionBtns += `<button class="d3-btn d3-btn-green" onclick="prOpenApproveModal(${req.id},'${req.current_stage}')"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> ${tr('موافقة')}</button>`;
            actionBtns += `<button class="d3-btn d3-btn-red" onclick="prOpenRejectModal(${req.id},'${req.current_stage}')"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> ${tr('رفض')}</button>`;
        } else if (alreadyActed) {
            actionBtns += `<span class="d3-closed-badge" style="background:#22c55e15;color:#22c55e;border:1.5px solid #22c55e30">✅ ${tr('تمت موافقتك')}</span>`;
        }
        if (req.current_stage === 'purchasing' && prIsPurchasingUser()) {
            if (!req.reservation_number) {
                actionBtns += `<button class="d3-btn d3-btn-amber" onclick="prApprovePurchasing(${req.id})" style="background:#f59e0b;color:#fff;border-color:#f59e0b">📌 ${tr('إنشاء حجز الموازنة')}</button>`;
            } else {
                actionBtns += `<span class="d3-closed-badge" style="background:#f59e0b15;color:#f59e0b;border:1.5px solid #f59e0b30">📌 ${tr('الحجز مُنشأ — بانتظار الاعتماد')}</span>`;
            }
        }
        if (req.current_stage === 'accounts_review' && canApprove) {
            actionBtns += `<button class="d3-btn" style="background:#d97706;color:#fff;border-color:#d97706" onclick="prChooseRoute(${req.id},'po')">📋 ${tr('مسار PO')}</button>`;
            actionBtns += `<button class="d3-btn d3-btn-green" onclick="prChooseRoute(${req.id},'direct')">💳 ${tr('دفع مباشر')}</button>`;
        }
        if (req.current_stage === 'po_issuance' && prIsPurchasingUser()) {
            actionBtns += `<button class="d3-btn d3-btn-amber" onclick="prOpenPOModal(${req.id})">📋 ${tr('إصدار أمر الشراء')}</button>`;
        }
    }

    // مسار المعاملة — التصميم الجديد
    const stepperHTML = prBuildStepperHTML(req);
    const doneCount = (req.workflow_stages || []).filter(s => ['approved', 'completed'].includes(s.status)).length;
    const totalSteps = (req.workflow_stages || []).length;
    const pct = totalSteps > 1 ? Math.round(doneCount / (totalSteps - 1) * 100) : 100;

    // SLA strip فوق المسار
    const slaStrip = prRenderSlaStrip(req.sla_status);

    // بناء بطاقات المعلومات الموحدة
    const kv = (k, v, opts) => v && v !== '—' ? `
        <div class="d3-kv2">
            <span class="d3-k2">${k}</span>
            <span class="d3-v2 ${opts || ''}">${v}</span>
        </div>` : '';

    // قسم المورد يظهر فقط إذا كان نوع الطلب يحتاج مورداً
    // أو إذا كانت بيانات المورد موجودة فعلاً (للطلبات القديمة)
    const typeRequiresSupplier = req.type_requires_supplier == 1 || req.type_requires_supplier === '1' || req.type_requires_supplier === true;
    const hasSupplierData = !!(req.supplier_name_resolved || req.supplier_name_manual || req.final_supplier_name || req.final_supplier_name_resolved);
    const hasSupplier = typeRequiresSupplier || hasSupplierData;

    const hasBudget = req.cost_center_code || req.budget_category_code || req.budget_code || req.reservation_number;

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
                ${!isClosed ? `<span class="d3-pill" style="background:${stageColor}18;color:${stageColor};border-color:${stageColor}35">${stageName}</span>` : ''}
                ${req.priority === 'urgent' ? `<span class="d3-urgent">⚡ ${tr('عاجل')}</span>` : ''}
            </div>
            <div class="d3-header-actions">
                ${actionBtns}
                <button class="d3-btn d3-btn-ghost" onclick="prExportPDF(${req.id})">${tr('PDF')}</button>
            </div>
        </div>

        <!-- ══ SLA Strip فوق المسار ══════════════════════════════ -->
        ${slaStrip}

        <!-- ══ Stepper ══════════════════════════════════════════ -->
        ${stepperHTML}

        <!-- ══ بيانات الطلب بين المسار وسجل النشاط ══════════════ -->
        <div class="d3-info-col">

                <!-- بطاقة الطلب الموحدة -->
                <div class="d3-card d3-info-card">
                    <!-- المبلغ hero -->
                    <div class="d3-amount-hero2">
                        <div>
                            <div class="d3-amount-main">${prFormatAmount(req.amount, req.currency)}</div>
                            <div class="d3-amount-lbl">${tr('المبلغ التقديري')}</div>
                        </div>
                        ${req.final_amount ? `<div class="d3-amount-divider"></div><div>
                            <div class="d3-amount-final">${prFormatAmount(req.final_amount, req.currency)}</div>
                            <div class="d3-amount-lbl">${tr('المبلغ النهائي')}</div>
                        </div>` : ''}
                    </div>

                    <!-- quick stats -->
                    <div class="pr-quick-stats">
                        <div class="pr-qs-item">
                            <span class="pr-qs-val">${req.amount ? prFormatAmount(req.amount, req.currency) : '—'}</span>
                            <span class="pr-qs-lbl">${tr('المبلغ التقديري')}</span>
                        </div>
                        <div class="pr-qs-item pr-qs-divider">
                            <span class="pr-qs-val">${(req.workflow_stages || []).filter(function (s) { return s.status === 'approved' || s.status === 'completed'; }).length} / ${(req.workflow_stages || []).length}</span>
                            <span class="pr-qs-lbl">${tr('مراحل')}</span>
                        </div>
                        <div class="pr-qs-item pr-qs-divider">
                            <span class="pr-qs-val">${(req.attachments || []).length}</span>
                            <span class="pr-qs-lbl">${tr('مرفقات')}</span>
                        </div>
                        <div class="pr-qs-item pr-qs-divider">
                            <span class="pr-qs-val">${req.created_at ? Math.floor((Date.now() - new Date(req.created_at)) / (86400000)) : '—'}</span>
                            <span class="pr-qs-lbl">${tr('يوم منذ الإنشاء')}</span>
                        </div>
                    </div>

                    <!-- sections grid -->
                    <div class="d3-info-sections-grid">
                    <div class="d3-info-section">
                        <div class="d3-info-section-title">${tr('بيانات الطلب')}</div>
                        <div class="d3-kv-grid">
                            ${kv(tr('الإدارة'), req.department_name)}
                            ${kv(tr('المنشئ'), req.created_by_name)}
                            ${kv(tr('نوع الطلب'), req.parent_type_name ? `${req.parent_type_name} — ${req.transaction_type_name}` : (req.transaction_type_name || ''))}
                            ${kv(tr('المسار'), req.workflow_path === 'short' ? '⚡ ' + tr('مختصر') : '📋 ' + tr('كامل'))}
                            ${kv(tr('الأولوية'), req.priority === 'urgent' ? '⚡ ' + tr('عاجل') : '• ' + tr('عادي'))}
                            ${kv(tr('تاريخ الإنشاء'), prFormatDate(req.created_at))}
                            ${kv(tr('تاريخ الحاجة'), req.needed_date ? prFormatDate(req.needed_date) : '')}
                            ${kv(tr('أمر الشراء'), req.po_number || '')}
                        </div>
                    </div>

                    <!-- المورد / الجهة المستفيدة -->
                    ${hasSupplier ? `
                    <div class="d3-info-section">
                        <div class="d3-info-section-title">🏢 ${typeRequiresSupplier ? tr('المورد') : tr('الجهة المستفيدة')}</div>
                        <div class="d3-kv-grid">
                            ${typeRequiresSupplier ? `
                                ${kv(tr('المورد المبدئي'), req.supplier_name_resolved || req.supplier_name_manual || '')}
                                ${kv(tr('المورد النهائي'), req.final_supplier_name_resolved || req.final_supplier_name || '')}
                            ` : `
                                ${kv(tr('الجهة / المستفيد'), req.beneficiary_name || req.supplier_name_manual || req.supplier_name_resolved || '')}
                            `}
                            ${req.transaction_type_name ? kv(tr('نوع الطلب'), req.parent_type_name ? `${req.parent_type_name} — ${req.transaction_type_name}` : req.transaction_type_name) : ''}
                        </div>
                    </div>` : ''}

                    <!-- الموازنة -->
                    ${hasBudget ? `
                    <div class="d3-info-section">
                        <div class="d3-info-section-title">💰 ${tr('الموازنة')}</div>
                        <div class="d3-kv-grid">
                            ${kv(tr('مركز التكلفة'), req.cost_center_code ? `${req.cost_center_code} — ${req.cost_center_name || ''}` : '')}
                            ${kv(tr('بند المصروف'), req.budget_category_code ? `${req.budget_category_code} — ${req.budget_category_name || ''}` : '')}
                            ${kv(tr('كود الميزانية'), req.budget_code || '')}
                            ${req.reservation_number
                ? `<div class="d3-kv2"><span class="d3-k2">${tr('رقم الحجز')}</span><span class="d3-v2" style="color:#f59e0b;font-weight:600;cursor:pointer" onclick="prOpenReservationFromPR(${req.reservation_id})">📌 ${req.reservation_number}</span></div>`
                : (req.budget_reservation_id ? kv(tr('رقم الحجز'), `#${req.budget_reservation_id}`) : '')}
                        </div>
                    </div>` : ''}

                    <!-- المرفقات — ملفات الطلب فقط (بدون إيصالات الدفع) -->
                    ${(() => {
            const regularAtts = req.attachments?.filter(a =>
                a.attachment_type !== 'payment_order' &&
                a.attachment_type !== 'payment_receipt'
            ) || [];
            return `
                    <div class="d3-info-section">
                        <div class="d3-info-section-title" style="display:flex;align-items:center;justify-content:space-between">
                            <span>📎 ${tr('المرفقات')} <span class="d3-cnt" style="font-size:10px;padding:1px 6px">${regularAtts.length}</span></span>
                            <label class="d3-attach-btn2"><input type="file" hidden onchange="prUploadFile(event,${req.id})">+ ${tr('إضافة')}</label>
                        </div>
                        ${prRenderAttachments(regularAtts)}
                    </div>`;
        })()}
                    </div><!-- /d3-info-sections-grid -->
                </div>
            </div><!-- /d3-info-col -->

        <!-- ══ بيانات الدفع ══════════════════════════════════════ -->
        ${(req.payment_ref || req.payment_executed_at || req.payment_method) ? (function () {
            var _d = req.payment_executed_at ? new Date(req.payment_executed_at) : null;
            var piDate = _d ? _d.toLocaleDateString('ar-SA-u-nu-latn', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
            var piTime = _d ? _d.toLocaleTimeString('ar-SA-u-nu-latn', { hour: '2-digit', minute: '2-digit', hour12: true }) : '';
            var piName = req.payment_executed_by_name || '';
            var piRole = req.payment_executed_by_role || '';
            var piTitle = req.payment_executed_by_title || '';
            var _roleMap2 = {
                'system_admin': 'مدير النظام', 'CEO': 'الرئيس التنفيذي', 'sector_head': 'رئيس القطاع',
                'division_manager': 'مدير القسم', 'budget': 'موظف الموازنة', 'payment': 'موظف الدفع',
                'purchasing': 'موظف المشتريات', 'receiver': 'موظف الاستلام', 'treasury_manager': 'مدير الخزينة',
            };
            var piLabel = piTitle || _roleMap2[piRole] || piRole || '';
            var piInit = piName ? piName.trim().charAt(0) : '';
            var receipts = (req.attachments || []).filter(function (a) {
                return a.attachment_type === 'payment_receipt' || a.attachment_type === 'payment_order';
            });

            var html = '<div class="d3-card pi-card" style="margin-top:.8rem">';

            // header
            html += '<div class="pi-header">';
            html += '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>';
            html += '<span class="pi-title">' + tr('بيانات الدفع') + '</span>';
            if (req.payment_ref) html += '<span class="pi-ref">' + req.payment_ref + '</span>';
            html += '</div>';

            // صف المعلومات
            html += '<div class="pi-meta-row">';
            if (req.payment_method) {
                html += '<div class="pi-meta-item"><span class="pi-meta-lbl">' + tr('طريقة الدفع') + '</span><span class="pi-meta-val">' + req.payment_method + '</span></div>';
            }
            if (piDate) {
                html += '<div class="pi-meta-item"><span class="pi-meta-lbl">' + tr('تاريخ الدفع') + '</span><span class="pi-meta-val">' + piDate + '</span></div>';
            }
            if (piTime) {
                html += '<div class="pi-meta-item"><span class="pi-meta-lbl">' + tr('وقت الدفع') + '</span><span class="pi-meta-val pi-time">' + piTime + '</span></div>';
            }
            if (piName) {
                html += '<div class="pi-meta-item pi-meta-item--executor">';
                html += '<span class="pi-meta-lbl">' + tr('نُفِّذ بواسطة') + '</span>';
                html += '<span class="pi-executor">';
                html += '<span class="pi-avatar">' + piInit + '</span>';
                html += '<span class="pi-executor-body">';
                html += '<span class="pi-executor-name">' + piName + '</span>';
                if (piLabel) html += '<span class="pi-executor-role">' + piLabel + '</span>';
                html += '</span></span></div>';
            }
            if (req.payment_notes) {
                html += '<div class="pi-meta-item pi-meta-item--full"><span class="pi-meta-lbl">' + tr('ملاحظات الدفع') + '</span><span class="pi-meta-val">' + req.payment_notes + '</span></div>';
            }
            html += '</div>';

            // إيصالات
            html += '<div class="pi-receipts">';
            html += '<div class="pi-receipts-title">';
            html += '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
            html += tr('إيصالات الدفع');
            html += '<span class="pi-cnt">' + receipts.length + '</span>';
            html += '</div>';
            html += receipts.length ? prRenderAttachments(receipts) : '<div class="pi-no-receipts">' + tr('لم يتم إرفاق إيصالات دفع بعد') + '</div>';
            html += '</div>';

            html += '</div>';
            return html;
        })() : ''}

        <!-- ══ سجل النشاط ════════════════════════════════════════ -->
        <div class="d3-card" style="margin-top:.8rem">
            <div class="d3-card-label">${tr('سجل النشاط')} <span class="d3-cnt">${req.events?.length || 0}</span></div>
            <div class="d3-events">${prRenderEvents(req.events)}</div>
        </div>

        <div class="d3-card pr-sub-card" style="margin-top:.8rem">
            <div class="pr-sub-row">
                <div class="pr-sub-info">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                    <span class="pr-sub-lbl">${tr('التنبيهات')}</span>
                    <span class="pr-sub-count" id="pr-sub-count-${req.id}">${req.subscription ? req.subscription.total : 0} ${tr('متابع')}</span>
                </div>
                <button class="pr-sub-btn ${req.subscription && req.subscription.subscribed ? 'pr-sub-btn--active' : ''}" id="pr-sub-btn-${req.id}" onclick="prToggleSubscription(${req.id})">
                    ${req.subscription && req.subscription.subscribed
            ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/><line x1="1" y1="1" x2="23" y2="23"/></svg> ' + tr('إلغاء الاشتراك')
            : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg> ' + tr('اشترك بالتنبيهات')
        }
                </button>
            </div>
        </div>

        <div class="d3-card pr-comments-card" style="margin-top:.8rem">
            <div class="pr-comments-header">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                <span>${tr('تعليقات داخلية')}</span>
                <span class="d3-cnt" id="pr-comments-cnt-${req.id}">${(req.comments || []).length}</span>
            </div>
            <div class="pr-comments-list" id="pr-comments-list-${req.id}">${prRenderComments(req.comments || [])}</div>
            <div class="pr-comment-input-row">
                <div class="pr-comment-avatar">${(currentUser.name || 'م').charAt(0)}</div>
                <input type="text" class="pr-comment-input" id="pr-comment-input-${req.id}" placeholder="${tr('أضف تعليقاً داخلياً...')}" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();prAddComment(${req.id})}">
                <button class="pr-comment-send" onclick="prAddComment(${req.id})">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                </button>
            </div>
        </div>

        ${(req.similar || []).length ? (function () {
            var rows = (req.similar || []).map(function (s) {
                return '<div class="pr-similar-row" onclick="prOpenDetailById(' + s.id + ')">'
                    + '<span class="pr-similar-num">' + s.request_number + '</span>'
                    + '<span class="pr-similar-title">' + (s.title || '—') + '</span>'
                    + '<span class="pr-similar-amt">' + parseFloat(s.amount || 0).toLocaleString('ar-SA-u-nu-latn', { maximumFractionDigits: 0 }) + ' ر.س</span>'
                    + '<span class="pr-stage-pill">' + (PR_STAGE_NAMES[s.current_stage] || s.current_stage) + '</span>'
                    + '</div>';
            }).join('');
            return '<div class="d3-card pr-similar-card" style="margin-top:.8rem">'
                + '<div class="pr-similar-header"><span>' + tr('طلبات مشابهة') + '</span><span class="d3-cnt">' + (req.similar || []).length + '</span></div>'
                + '<div class="pr-similar-list">' + rows + '</div>'
                + '</div>';
        })() : ''}

        <div class="d3-card pr-links-card" style="margin-top:.8rem">
            <div class="pr-links-header">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                <span>${tr('طلبات مرتبطة')}</span>
                <span class="d3-cnt" id="pr-links-cnt-${req.id}">${(req.links || []).length}</span>
                <button class="pr-links-add-btn" onclick="prOpenAddLinkModal(${req.id})">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    ${tr('ربط')}
                </button>
            </div>
            <div class="pr-links-list" id="pr-links-list-${req.id}">
                ${(function () {
            var links = req.links || [];
            if (!links.length) return '<div class="pr-links-empty">' + tr('لا توجد طلبات مرتبطة بعد') + '</div>';
            return links.map(function (l) {
                return '<div class="pr-links-row">'
                    + '<span class="pr-links-num" onclick="prOpenDetailById(' + (l.linked_pr_id || l.id) + ')" style="cursor:pointer;color:var(--primary)">' + l.request_number + '</span>'
                    + '<span class="pr-links-title">' + (l.title || '—') + '</span>'
                    + '<span class="pr-links-amt">' + parseFloat(l.amount || 0).toLocaleString('ar-SA-u-nu-latn', { maximumFractionDigits: 0 }) + ' ر.س</span>'
                    + '<span class="pr-stage-pill">' + (PR_STAGE_NAMES[l.current_stage] || l.current_stage || '—') + '</span>'
                    + '<button class="pr-links-remove" onclick="prRemoveLink(' + req.id + ',' + l.linked_pr_id + ')">'
                    + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
                    + '</button></div>';
            }).join('');
        })()}
            </div>
        </div>

    </div>`;
}

// ════════════════════════════════════════════
// دوال الميزات الجديدة
// ════════════════════════════════════════════

let _prCurrentReq = {};

function prRenderComments(comments) {
    if (!comments || !comments.length) {
        return '<div class="pr-comments-empty">' + (typeof tr === 'function' ? tr('لا توجد تعليقات بعد') : 'لا توجد تعليقات بعد') + '</div>';
    }
    var _roleMap = {
        'system_admin': 'مدير النظام', 'CEO': 'الرئيس التنفيذي', 'sector_head': 'رئيس القطاع',
        'division_manager': 'مدير القسم', 'budget': 'موظف الموازنة', 'payment': 'موظف الدفع',
        'purchasing': 'موظف المشتريات', 'receiver': 'موظف الاستلام', 'treasury_manager': 'مدير الخزينة',
    };
    return comments.map(function (c) {
        var isMe = parseInt(c.employee_id) === parseInt(currentUser.id);
        var init = (c.emp_name || 'م').charAt(0);
        var role = c.emp_title || _roleMap[c.emp_role] || c.emp_role || '';
        var d = new Date(c.created_at);
        var dateStr = d.toLocaleDateString('ar-SA-u-nu-latn', { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString('ar-SA-u-nu-latn', { hour: '2-digit', minute: '2-digit', hour12: true });
        var html = '<div class="pr-comment-item' + (isMe ? ' pr-comment-mine' : '') + '">';
        html += '<div class="pr-comment-av">' + init + '</div>';
        html += '<div class="pr-comment-body">';
        html += '<div class="pr-comment-meta">';
        html += '<span class="pr-comment-name">' + (c.emp_name || '—') + '</span>';
        if (role) html += '<span class="pr-comment-role">' + role + '</span>';
        html += '<span class="pr-comment-time">' + dateStr + '</span>';
        if (isMe) {
            html += '<button class="pr-comment-del" onclick="prDeleteComment(' + c.id + ',' + c.pr_id + ')" title="حذف">';
            html += '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>';
            html += '</button>';
        }
        html += '</div>';
        html += '<div class="pr-comment-text">' + c.body + '</div>';
        html += '</div></div>';
        return html;
    }).join('');
}

async function prAddComment(prId) {
    var inp = document.getElementById('pr-comment-input-' + prId);
    var body = inp && inp.value ? inp.value.trim() : '';
    if (!body) return;
    inp.disabled = true;
    try {
        var res = await fetch('api/purchase_requests_api.php?action=add_comment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pr_id: prId, body: body })
        });
        var data = await res.json();
        if (data.success) {
            inp.value = '';
            var list = document.getElementById('pr-comments-list-' + prId);
            var empty = list ? list.querySelector('.pr-comments-empty') : null;
            if (empty) empty.remove();
            var tmp = document.createElement('div');
            tmp.innerHTML = prRenderComments([data.comment]);
            if (list && tmp.firstElementChild) list.appendChild(tmp.firstElementChild);
            var cnt = document.getElementById('pr-comments-cnt-' + prId);
            if (cnt) cnt.textContent = parseInt(cnt.textContent || 0) + 1;
        } else {
            showToast(data.message || 'خطأ', 'error');
        }
    } catch (e) { showToast('خطأ في الاتصال', 'error'); }
    inp.disabled = false;
    inp.focus();
}

async function prDeleteComment(commentId, prId) {
    if (!confirm('حذف التعليق؟')) return;
    var res = await fetch('api/purchase_requests_api.php?action=delete_comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: commentId })
    });
    var data = await res.json();
    if (data.success) {
        var btn = document.querySelector('.pr-comment-del[onclick="prDeleteComment(' + commentId + ',' + prId + ')"]');
        if (btn) {
            var item = btn.closest('.pr-comment-item');
            if (item) item.remove();
        }
        var cnt = document.getElementById('pr-comments-cnt-' + prId);
        if (cnt) cnt.textContent = Math.max(0, parseInt(cnt.textContent || 0) - 1);
    }
}

function prExportPDF(prId) {
    window.open('pdf_generator.php?type=purchase_request&id=' + prId, '_blank');
}

async function prToggleSubscription(prId) {
    var btn = document.getElementById('pr-sub-btn-' + prId);
    if (btn) btn.disabled = true;
    try {
        var res = await fetch('api/purchase_requests_api.php?action=toggle_subscription', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pr_id: prId })
        });
        var data = await res.json();
        if (data.success) {
            var subscribed = data.subscribed;
            if (btn) {
                btn.className = 'pr-sub-btn' + (subscribed ? ' pr-sub-btn--active' : '');
                if (subscribed) {
                    btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/><line x1="1" y1="1" x2="23" y2="23"/></svg> ' + tr('إلغاء الاشتراك');
                } else {
                    btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg> ' + tr('اشترك بالتنبيهات');
                }
            }
            showToast(subscribed ? 'تم الاشتراك' : 'تم إلغاء الاشتراك', subscribed ? 'success' : 'info');
        }
    } catch (e) { showToast('خطأ', 'error'); }
    if (btn) btn.disabled = false;
}

function prOpenDetailById(prId) {
    prOpenDetail(prId);
}

function prOpenAddLinkModal(prId) {
    DOM.modalTitle.textContent = tr('ربط بطلب آخر');
    var html = '';
    html += '<div class="form-group">';
    html += '<label class="form-label">' + tr('رقم الطلب المراد ربطه') + '</label>';
    html += '<input type="text" id="link-pr-num" class="form-input" placeholder="PR-XXXX">';
    html += '</div>';
    html += '<div class="form-group">';
    html += '<label class="form-label">' + tr('ملاحظة') + ' (' + tr('اختياري') + ')</label>';
    html += '<input type="text" id="link-pr-note" class="form-input" placeholder="' + tr('سبب الربط...') + '">';
    html += '</div>';
    html += '<div style="display:flex;gap:.5rem;margin-top:1rem;justify-content:flex-end">';
    html += '<button class="btn btn-secondary" onclick="closeModal()">' + tr('إلغاء') + '</button>';
    html += '<button class="btn btn-primary" onclick="prSubmitAddLink(' + prId + ')">' + tr('ربط') + '</button>';
    html += '</div>';
    DOM.modalBody.innerHTML = html;
    openModal();
}

async function prSubmitAddLink(prId) {
    var numEl = document.getElementById('link-pr-num');
    var noteEl = document.getElementById('link-pr-note');
    var num = numEl ? numEl.value.trim() : '';
    var note = noteEl ? noteEl.value.trim() : '';
    if (!num) { showToast('أدخل رقم الطلب', 'error'); return; }
    var search = await fetch('api/purchase_requests_api.php?action=list&search=' + encodeURIComponent(num));
    var sData = await search.json();
    var list = sData.data || sData.requests || [];
    var found = null;
    for (var i = 0; i < list.length; i++) { if (list[i].request_number === num) { found = list[i]; break; } }
    if (!found) { showToast('الطلب غير موجود', 'error'); return; }
    var res = await fetch('api/purchase_requests_api.php?action=add_link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pr_id: prId, linked_pr_id: found.id, note: note })
    });
    var data = await res.json();
    if (data.success) {
        showToast('تم الربط بنجاح', 'success');
        closeModal();
        var linksRes = await fetch('api/purchase_requests_api.php?action=get_links&pr_id=' + prId);
        var linksData = await linksRes.json();
        _prCurrentReq.links = linksData.links || [];
        var cnt = document.getElementById('pr-links-cnt-' + prId);
        if (cnt) cnt.textContent = _prCurrentReq.links.length;
        prRefreshLinksList(prId);
    } else {
        showToast(data.message || 'خطأ', 'error');
    }
}

function prRefreshLinksList(prId) {
    var container = document.getElementById('pr-links-list-' + prId);
    if (!container) return;
    var links = _prCurrentReq.links || [];
    if (!links.length) {
        container.innerHTML = '<div class="pr-links-empty">' + tr('لا توجد طلبات مرتبطة بعد') + '</div>';
        return;
    }
    var html = '';
    for (var i = 0; i < links.length; i++) {
        var l = links[i];
        html += '<div class="pr-links-row">';
        html += '<span class="pr-links-num" onclick="prOpenDetailById(' + (l.linked_pr_id || l.id) + ')" style="cursor:pointer;color:var(--primary)">' + l.request_number + '</span>';
        html += '<span class="pr-links-title">' + (l.title || '—') + '</span>';
        html += '<span class="pr-links-amt">' + parseFloat(l.amount || 0).toLocaleString('ar-SA-u-nu-latn', { maximumFractionDigits: 0 }) + ' ر.س</span>';
        html += '<span class="pr-stage-pill">' + (PR_STAGE_NAMES[l.current_stage] || l.current_stage || '—') + '</span>';
        html += '<button class="pr-links-remove" onclick="prRemoveLink(' + prId + ',' + (l.linked_pr_id || l.id) + ')">';
        html += '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
        html += '</button></div>';
    }
    container.innerHTML = html;
}

async function prRemoveLink(prId, linkedId) {
    if (!confirm(tr('إزالة الربط بين الطلبين؟'))) return;
    var res = await fetch('api/purchase_requests_api.php?action=remove_link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pr_id: prId, linked_pr_id: linkedId })
    });
    var data = await res.json();
    if (data.success) {
        showToast(tr('تم إزالة الربط'), 'success');
        if (_prCurrentReq.links) {
            _prCurrentReq.links = _prCurrentReq.links.filter(function (l) {
                return (l.linked_pr_id || l.id) !== linkedId;
            });
        }
        prRefreshLinksList(prId);
        var cnt = document.getElementById('pr-links-cnt-' + prId);
        if (cnt) cnt.textContent = (_prCurrentReq.links || []).length;
    }
}


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
                ${completedCount} ${tr('مكتملة')}
            </span>
            <span class="pr-stp-total-badge">${totalSteps} ${tr('مرحلة')}</span>
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
    if (!events || !events.length) return '<div class="pr-no-events">' + tr('لا توجد أحداث بعد') + '</div>';

    const typeConfig = {
        created: { color: '#3b82f6', bg: 'rgba(59,130,246,.08)', label: tr('إنشاء'), icon: '🆕' },
        submitted: { color: '#8b5cf6', bg: 'rgba(139,92,246,.08)', label: tr('تقديم'), icon: '📤' },
        approved: { color: '#22c55e', bg: 'rgba(34,197,94,.08)', label: tr('موافقة'), icon: '✅' },
        rejected: { color: '#ef4444', bg: 'rgba(239,68,68,.08)', label: tr('رفض'), icon: '❌' },
        returned: { color: '#f97316', bg: 'rgba(249,115,22,.08)', label: tr('إرجاع'), icon: '↩️' },
        referred: { color: '#f59e0b', bg: 'rgba(245,158,11,.08)', label: tr('إحالة'), icon: '🔀' },
        assigned: { color: '#06b6d4', bg: 'rgba(6,182,212,.08)', label: tr('إسناد'), icon: '👤' },
        stage_changed: { color: '#64748b', bg: 'rgba(100,116,139,.08)', label: tr('تغيير مرحلة'), icon: '➡️' },
        po_issued: { color: '#0ea5e9', bg: 'rgba(14,165,233,.08)', label: tr('أمر شراء'), icon: '📋' },
        budget_linked: { color: '#10b981', bg: 'rgba(16,185,129,.08)', label: tr('ربط موازنة'), icon: '🔗' },
        sent_to_payment: { color: '#6366f1', bg: 'rgba(99,102,241,.08)', label: tr('للدفع'), icon: '💳' },
        workflow_redirected: { color: '#d97706', bg: 'rgba(217,119,6,.08)', label: tr('تحويل مسار'), icon: '🔄' },
        note_added: { color: '#94a3b8', bg: 'rgba(148,163,184,.08)', label: tr('ملاحظة'), icon: '📝' },
        attachment_added: { color: '#94a3b8', bg: 'rgba(148,163,184,.08)', label: tr('مرفق'), icon: '📎' },
    };

    return events.map(ev => {
        const cfg = typeConfig[ev.event_type] || { color: '#94a3b8', bg: 'rgba(148,163,184,.08)', label: ev.event_type, icon: '📌' };
        const empName = ev.employee_name_resolved || ev.employee_name || 'النظام';
        const stageName = PR_STAGE_NAMES[ev.stage] || ev.stage || '';
        const nextName = PR_STAGE_NAMES[ev.new_value] || ev.new_value || '';
        let detail = ev.description || '';

        // تفاصيل الإحالة
        const isRefer = ev.event_type === 'referred';
        const toEmp = ev.referred_to_emp_name || '';
        const toDept = ev.referred_to_dept_name || '';
        const reason = ev.referral_reason || '';
        const assignedTo = ev.assigned_to_name || '';

        let extraHtml = '';
        if (isRefer && (toEmp || toDept || reason)) {
            extraHtml = `<div class="pr-ev-refer-box">`;
            if (toEmp) extraHtml += `<div class="pr-ev-refer-row"><span class="pr-ev-refer-lbl">${tr('إلى')}</span><span class="pr-ev-refer-val">${toEmp}</span></div>`;
            if (toDept) extraHtml += `<div class="pr-ev-refer-row"><span class="pr-ev-refer-lbl">${tr('الجهة')}</span><span class="pr-ev-refer-val">${toDept}</span></div>`;
            if (reason) extraHtml += `<div class="pr-ev-refer-row"><span class="pr-ev-refer-lbl">${tr('السبب')}</span><span class="pr-ev-refer-val">${reason}</span></div>`;
            extraHtml += `</div>`;
        } else if (assignedTo) {
            extraHtml = `<div class="pr-ev-refer-box"><div class="pr-ev-refer-row"><span class="pr-ev-refer-lbl">${tr('إسناد إلى')}</span><span class="pr-ev-refer-val">${assignedTo}</span></div></div>`;
        }

        // بناء السطر الثاني: الوصف فقط بدون تكرار اسم المرحلة إذا كان في التفاصيل
        const showDetail = detail && detail !== empName;

        return `
        <div class="pr-ev-item">
            <div class="pr-ev-dot-wrap">
                <div class="pr-ev-dot" style="background:${cfg.color}"></div>
                <div class="pr-ev-line"></div>
            </div>
            <div class="pr-ev-content">
                <div class="pr-ev-top">
                    <span class="pr-ev-type-badge" style="background:${cfg.bg};color:${cfg.color}">${cfg.icon} ${cfg.label}</span>
                    ${stageName ? `<span class="pr-ev-stage-chip">${stageName}</span>` : ''}
                    ${nextName && nextName !== stageName && ev.event_type === 'approved' ? `<span class="pr-ev-arrow">←</span><span class="pr-ev-stage-chip" style="opacity:.7">${nextName}</span>` : ''}
                    <span class="pr-ev-time">${prFormatDateTime(ev.created_at)}</span>
                </div>
                <div class="pr-ev-actor">${empName}</div>
                ${showDetail ? `<div class="pr-ev-detail">${detail}</div>` : ''}
                ${extraHtml}
            </div>
        </div>`;
    }).join('');
}

/**
 * رسم بطاقة SLA
 * @param {Array} slaStatus
 */
function prRenderSlaStrip(slaStatus) {
    if (!slaStatus || !slaStatus.length) return '';
    const active = slaStatus.find(s => s.status === 'active' || s.status === 'paused');
    if (!active) return '';

    const pct = Math.min(parseFloat(active.elapsed_pct) || 0, 100);
    const elapsed = parseInt(active.elapsed_minutes) || 0;
    const allowed = parseInt(active.allowed_minutes) || 0;
    const remaining = Math.max(0, allowed - elapsed);
    const isPaused = active.status === 'paused';
    const isBreached = pct >= 100;
    const isWarn = pct >= 70 && !isBreached;

    const color = isBreached ? '#ef4444' : isWarn ? '#f59e0b' : '#22c55e';
    const bgColor = isBreached ? 'rgba(239,68,68,.06)' : isWarn ? 'rgba(245,158,11,.06)' : 'rgba(34,197,94,.06)';
    const bdColor = isBreached ? 'rgba(239,68,68,.3)' : isWarn ? 'rgba(245,158,11,.3)' : 'rgba(34,197,94,.25)';
    const statusLabel = isPaused ? `⏸️ ${tr('موقوف')}` : isBreached ? `🔴 ${tr('تجاوز SLA')}` : isWarn ? `🟡 ${tr('تحذير')}` : `🟢 ${tr('ضمن الوقت')}`;
    const fmt = m => { if (!m) return '0د'; const h = Math.floor(m / 60), mn = m % 60; return h > 0 ? `${h}س ${mn}د` : `${mn}د`; };

    return `
    <div class="d3-sla-strip" style="border-color:${bdColor};background:${bgColor}">
        <div class="d3-sla-strip-right">
            <span class="d3-sla-strip-label">⏱️ SLA</span>
            <span class="d3-sla-strip-status" style="color:${color}">${statusLabel}</span>
            ${isPaused ? `<span class="d3-sla-strip-pause">⏸️ ${tr('متوقف — انتظار اعتماد الحجز')}</span>` : ''}
        </div>
        <div class="d3-sla-strip-bar-wrap">
            <div class="d3-sla-strip-bar" style="width:${pct}%;background:${color}"></div>
        </div>
        <div class="d3-sla-strip-stats">
            <div class="d3-sla-strip-stat">
                <span class="d3-sla-strip-val" style="color:${color}">${pct.toFixed(0)}%</span>
                <span class="d3-sla-strip-key">${tr('مُنقضي')}</span>
            </div>
            <div class="d3-sla-strip-sep"></div>
            <div class="d3-sla-strip-stat">
                <span class="d3-sla-strip-val">${fmt(elapsed)}</span>
                <span class="d3-sla-strip-key">${tr('مضى')}</span>
            </div>
            <div class="d3-sla-strip-sep"></div>
            <div class="d3-sla-strip-stat">
                <span class="d3-sla-strip-val" style="${isBreached ? 'color:#ef4444' : ''}">${isBreached ? tr('تجاوز') : fmt(remaining)}</span>
                <span class="d3-sla-strip-key">${tr('متبقي')}</span>
            </div>
            <div class="d3-sla-strip-sep"></div>
            <div class="d3-sla-strip-stat">
                <span class="d3-sla-strip-val">${fmt(allowed)}</span>
                <span class="d3-sla-strip-key">${tr('مسموح')}</span>
            </div>
        </div>
    </div>`;
}

function prRenderSlaCard(slaStatus) { return prRenderSlaStrip(slaStatus); }

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
        <div class="d3-card-label">⏱️ ${tr('مؤشرات SLA')}
            <span class="d3-sla-legend">
                <span style="color:#22c55e">■</span> ${tr('ضمن الوقت')}
                <span style="color:#f59e0b">■</span> ${tr('تحذير')}
                <span style="color:#ef4444">■</span> ${tr('تجاوز')}
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
        return '<div class="pr-no-attach">' + tr('لا توجد مرفقات بعد') + '</div>';
    }
    const fmtSize = b => b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : b > 1024 ? (b / 1024).toFixed(0) + ' KB' : b + ' B';
    return `<div class="pr-attach-grid">`
        + attachments.map(att => {
            const label = att.file_label || att.original_name;
            const stage = PR_STAGE_NAMES[att.stage] || att.stage || '';
            const size = att.file_size ? fmtSize(parseInt(att.file_size)) : '';
            const ext = (att.original_name || '').split('.').pop().toUpperCase();
            const extColors = { PDF: '#ef4444', DOCX: '#3b82f6', DOC: '#3b82f6', XLSX: '#22c55e', XLS: '#22c55e', PNG: '#8b5cf6', JPG: '#f59e0b', JPEG: '#f59e0b' };
            const extColor = extColors[ext] || '#94a3b8';
            return `
            <div class="pr-att-card">
                <div class="pr-att-ext" style="background:${extColor}18;color:${extColor};border-color:${extColor}30">${ext}</div>
                <div class="pr-att-info">
                    <div class="pr-att-label">${label}</div>
                    <div class="pr-att-meta">
                        ${att.original_name !== label ? `<span class="pr-att-orig">${att.original_name}</span>` : ''}
                        ${stage ? `<span class="pr-att-stage">${stage}</span>` : ''}
                        ${att.uploader_name ? `<span class="pr-att-who">${att.uploader_name}</span>` : ''}
                        ${size ? `<span class="pr-att-size">${size}</span>` : ''}
                    </div>
                </div>
                <a href="${att.file_path}" target="_blank" class="pr-att-dl" title="تنزيل">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                </a>
            </div>`;
        }).join('')
        + `</div>`;
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

// ════════════════════════════════════════════════════════════
// بطاقة مسار المعاملة الجديدة
// ════════════════════════════════════════════════════════════
const WF_GROUPS = {
    reception: 'استلام',
    warehouse_manager_review: 'استلام',
    budget_review: 'موازنة ومالية',
    treasury_review: 'موازنة ومالية',
    finance_review: 'موازنة ومالية',
    ceo_approval: 'رئاسة',
    purchasing: 'مشتريات',
    waiting_budget_approval: 'مشتريات',
    accounts_review: 'مشتريات',
    payment: 'إغلاق',
    completed: 'إغلاق',
};

function wfGroup(key) {
    return WF_GROUPS[key] || PRState.stageNamesCache[key] && 'أخرى' || 'أخرى';
}

function wfInitials(name) {
    if (!name) return '';
    const p = name.trim().split(' ');
    return p.length >= 2 ? p[0][0] + p[1][0] : name.substring(0, 2);
}

function wfStageName(key) {
    return PRState.stageNamesCache[key]
        || getPRStageNamesDefault()[key]
        || key;
}

function prBuildStepperHTML(req) {
    const BLUE = '#1B4F8A';
    const GREEN = '#1B6A3E';
    const PURPLE = '#7c3aed';
    const RED = '#8A1B1B';

    const stages = req.workflow_stages || [];
    const total = stages.length;
    const doneCount = stages.filter(s => ['approved', 'completed'].includes(s.status)).length;
    const pct = total > 1 ? Math.round(doneCount / (total - 1) * 100) : 100;
    const curKey = req.current_stage || '';
    const isDone = curKey === 'completed';
    const isRejAll = curKey === 'rejected';
    const isClosed = isDone || isRejAll;

    // اللون الرئيسي حسب الحالة
    const accent = isDone ? GREEN : isRejAll ? RED : curKey === 'ceo_approval' ? PURPLE : BLUE;

    // بيانات المرحلة الحالية
    const curStageObj = stages.find(s => s.stage_name === curKey) || {};
    const curName = wfStageName(curKey);
    const curEmp = curStageObj.approved_by_name || curStageObj.employee_name || curStageObj.assigned_to_name || '';
    const curInitials = wfInitials(curEmp);

    // مسار العمل — مختصر أم طويل
    const pathLabel = req.workflow_path === 'short' ? '⚡ مختصر'
        : req.workflow_path === 'long' ? '📋 كامل'
            : req.workflow_path ? req.workflow_path : '—';

    // SLA
    const slaOk = req.sla_status?.status !== 'overdue';
    const slaLabel = slaOk ? '✓ ضمن المهلة' : '⚠ تجاوز المهلة';
    const slaColor = slaOk ? GREEN : '#8A1B1B';

    // ── ترتيب المراحل ─────────────────────────────────────
    const sortedStages = [...stages].sort((a, b) => {
        const aFin = ['completed', 'rejected'].includes(a.stage_name) ? 9999 : (a.stage_order || 0);
        const bFin = ['completed', 'rejected'].includes(b.stage_name) ? 9999 : (b.stage_order || 0);
        return aFin - bFin;
    });

    // حساب عرض الخط المكتمل
    const doneIdx = sortedStages.filter(s => ['approved', 'completed'].includes(s.status)).length;
    const lineWidth = total > 1 ? Math.round((doneIdx / (total - 1)) * 100) : 0;

    // ── بناء عقد المراحل ──────────────────────────────────
    const nodesHTML = sortedStages.map((s, idx) => {
        const done = ['approved', 'completed'].includes(s.status);
        const active = s.stage_name === curKey;
        const rej = s.status === 'rejected';
        const final = s.stage_name === 'completed';
        const sName = wfStageName(s.stage_name);
        const who = s.approved_by_name || s.employee_name || '';
        const date = s.completed_at ? prFormatDate(s.completed_at) : '—';
        const num = s.stage_order || (idx + 1);
        const isCeo = s.stage_name === 'ceo_approval';
        const nodeClr = isCeo ? PURPLE : BLUE;

        // شكل الدائرة
        let circleStyle = '', innerHTML;
        if (done) {
            circleStyle = `background:${nodeClr};border-color:${nodeClr};color:#fff`;
            innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`;
        } else if (rej) {
            circleStyle = `background:${RED};border-color:${RED};color:#fff`;
            innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
        } else if (active) {
            circleStyle = `background:#fff;border:2.5px solid ${nodeClr};color:${nodeClr}`;
            innerHTML = `<span style="width:10px;height:10px;border-radius:50%;background:${nodeClr};display:block;animation:govPulse 1.4s infinite"></span>`;
        } else if (final) {
            circleStyle = `border-style:dashed;color:var(--color-text-secondary)`;
            innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>`;
        } else {
            circleStyle = `color:var(--color-text-secondary)`;
            innerHTML = `<span style="font-size:13px;font-weight:500">${num}</span>`;
        }

        const nameCls = active ? `style="color:${nodeClr};font-weight:500"` : '';
        const dateCls = active ? `style="color:${nodeClr};font-weight:500"` : '';

        // Tooltip
        const tipStatus = done
            ? `<span class="gov2-ts gov2-ts-done">✓ مكتملة${s.completed_at ? ' — ' + prFormatDate(s.completed_at) : ''}</span>`
            : active
                ? `<span class="gov2-ts gov2-ts-act">● جارية الآن</span>`
                : rej
                    ? `<span class="gov2-ts gov2-ts-rej">✕ مرفوضة</span>`
                    : `<span class="gov2-ts gov2-ts-pend">في الانتظار</span>`;

        return `<div class="gov2-step">
            <div class="gov2-circle" style="${circleStyle}">${innerHTML}</div>
            <span class="gov2-step-name" ${nameCls}>${sName}</span>
            <span class="gov2-step-date" ${dateCls}>${active ? 'جارية' : date}</span>
            <div class="gov2-tip">
                <span class="gov2-tip-name">${sName}</span>
                ${who ? `<span class="gov2-tip-emp"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> ${who}</span>` : ''}
                ${tipStatus}
            </div>
        </div>`;
    }).join('');

    // ── رأس البطاقة ───────────────────────────────────────
    const empHTML = curEmp && !isClosed
        ? `<div class="gov2-vl"></div>
           <div class="gov2-emp">
               <div class="gov2-av" style="background:${accent}1a;color:${accent}">${curInitials || '—'}</div>
               <span>${curEmp}</span>
           </div>`
        : '';

    const headStatus = isClosed
        ? `<span class="gov2-closed-badge" style="background:${accent}1a;color:${accent};border-color:${accent}40">${curName}</span>`
        : `<span class="gov2-pulse-dot" style="background:${accent}"></span>
           <span class="gov2-stage">${curName}</span>
           ${empHTML}`;

    return `<div class="gov2-card">
        <div class="gov2-topbar" style="background:${accent}"></div>
        <div class="gov2-head">
            <div class="gov2-head-left">${headStatus}</div>
            <div class="gov2-head-right">
                <div class="gov2-meta-row">
                    <span class="gov2-mk">التقدم</span>
                    <span class="gov2-mv" style="color:${accent}">${pct}%</span>
                </div>
                <div class="gov2-meta-row">
                    <span class="gov2-mk">المراحل</span>
                    <span class="gov2-mv">${doneCount} / ${total}</span>
                </div>
            </div>
        </div>
        <div class="gov2-progress-row">
            <span class="gov2-pr-lbl">نسبة الإنجاز</span>
            <div class="gov2-bar"><div class="gov2-bar-fill" style="width:${pct}%;background:${accent}"></div></div>
            <span class="gov2-pr-pct" style="color:${accent}">${pct}%</span>
            <div class="gov2-vl" style="margin:0 6px"></div>
            <div class="gov2-sla-badge" style="background:${slaColor}14;border-color:${slaColor}30">
                <span class="gov2-sla-dot" style="background:${slaColor}"></span>
                <span style="color:${slaColor}">${slaLabel}</span>
            </div>
        </div>
        <div class="gov2-steps-wrap">
            <div class="gov2-steps-track">
                <div class="gov2-bg-line"></div>
                <div class="gov2-done-line" style="width:${lineWidth}%;background:${accent}"></div>
                <div class="gov2-nodes">${nodesHTML}</div>
            </div>
        </div>
        <div class="gov2-footer">
            <div class="gov2-fc"><div class="gov2-fk">رقم الطلب</div><div class="gov2-fv">${req.request_number || '—'}</div></div>
            <div class="gov2-fc"><div class="gov2-fk">المسار</div><div class="gov2-fv">${pathLabel}</div></div>
            <div class="gov2-fc"><div class="gov2-fk">المراحل المكتملة</div><div class="gov2-fv" style="color:${accent}">${doneCount} من ${total}</div></div>
            <div class="gov2-fc"><div class="gov2-fk">حالة SLA</div><div class="gov2-fv" style="color:${slaColor}">${slaLabel}</div></div>
        </div>
    </div>`;
}

function prGetInitials(n) { return wfInitials(n); }

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

// ════════════════════════════════════════════════════════════
// تعريف مجموعات المراحل للتصنيف البصري
// ════════════════════════════════════════════════════════════
const PR_STAGE_GROUPS = [
    {
        key: 'reception',
        label: 'الاستلام',
        labelEn: 'Reception',
        stages: ['reception', 'warehouse_manager_review'],
    },
    {
        key: 'finance',
        label: 'الموازنة والمالية',
        labelEn: 'Budget & Finance',
        stages: ['budget_review', 'treasury_review', 'finance_review'],
    },
    {
        key: 'ceo',
        label: 'الرئاسة',
        labelEn: 'Executive',
        stages: ['ceo_approval'],
        color: '#7c3aed',
    },
    {
        key: 'procurement',
        label: 'المشتريات والاعتماد',
        labelEn: 'Procurement',
        stages: ['purchasing', 'waiting_budget_approval', 'accounts_review', 'po_issuance'],
    },
    {
        key: 'closing',
        label: 'الإغلاق',
        labelEn: 'Closing',
        stages: ['payment', 'completed'],
    },
];

/**
 * إيجاد مجموعة مرحلة معينة
 * إذا لم تُعرَّف → تُضاف لمجموعة "أخرى"
 */
function prGetStageGroup(stageKey) {
    for (const g of PR_STAGE_GROUPS) {
        if (g.stages.includes(stageKey)) return g;
    }
    return null;
}

// ════════════════════════════════════════════════════════════
// بناء بطاقة مسار المعاملة — التصميم الجديد
// ════════════════════════════════════════════════════════════
function prBuildStepperCard(req) {
    const stages = req.workflow_stages || [];
    const totalSteps = stages.length;
    const doneStages = stages.filter(s => ['approved', 'completed'].includes(s.status));
    const doneCount = doneStages.length;
    const pct = totalSteps > 1 ? Math.round(doneCount / (totalSteps - 1) * 100) : 100;

    // ── بيانات المرحلة الحالية ────────────────────────────
    const curStage = stages.find(s => s.stage_name === req.current_stage) || {};
    const curName = PR_STAGE_NAMES[req.current_stage] || req.current_stage || '—';
    const curEmployee = curStage.employee_name || curStage.approved_by_name || '';
    const curInitials = curEmployee
        ? curEmployee.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('')
        : '';
    const isClosed = ['completed', 'rejected'].includes(req.current_stage);

    // ── تجميع المراحل في مجموعات ─────────────────────────
    // أولاً: جمع المراحل الغير معرَّفة في مجموعات
    const ungrouped = stages.filter(s => !prGetStageGroup(s.stage_name));
    const extraGroup = ungrouped.length ? [{
        key: 'extra', label: 'مراحل أخرى', labelEn: 'Other',
        stages: ungrouped.map(s => s.stage_name),
    }] : [];

    // بناء قائمة المجموعات الفعلية (التي لها مراحل في هذا الطلب)
    const allGroups = [...PR_STAGE_GROUPS, ...extraGroup];
    const activeGroups = allGroups
        .map(g => ({
            ...g,
            stageObjs: stages.filter(s => g.stages.includes(s.stage_name))
                .sort((a, b) => (a.stage_order || 0) - (b.stage_order || 0)),
        }))
        .filter(g => g.stageObjs.length > 0);

    // ── بناء HTML المجموعات ───────────────────────────────
    const groupsHTML = activeGroups.map((g, gi) => {
        const groupColor = g.color || null;

        const nodesHTML = g.stageObjs.map((s, si) => {
            const done = ['approved', 'completed'].includes(s.status);
            const current = s.stage_name === req.current_stage;
            const rejected = s.status === 'rejected';
            const name = PR_STAGE_NAMES[s.stage_name] || s.stage_name;
            const who = s.approved_by_name || s.employee_name || '';
            const date = s.completed_at ? prFormatDate(s.completed_at) : '';
            const num = s.stage_order || (si + 1);

            // حالة الدائرة
            let circleClass, circleStyle = '', innerHTML;
            if (done) {
                circleClass = 'wf2-c-done';
                innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5"><polyline points="20 6 9 17 4 12"/></svg>`;
            } else if (rejected) {
                circleClass = 'wf2-c-rejected';
                innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
            } else if (current) {
                circleClass = 'wf2-c-act';
                if (groupColor) circleStyle = `border-color:${groupColor};color:${groupColor}`;
                innerHTML = `<span class="wf2-pulse"${groupColor ? ` style="background:${groupColor}"` : ''}></span>`;
            } else if (s.stage_name === 'completed') {
                circleClass = 'wf2-c-final';
                innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>`;
            } else {
                circleClass = 'wf2-c-pend';
                innerHTML = `<span style="font-size:9px;font-weight:600;color:var(--color-text-secondary,#94a3b8)">${num}</span>`;
            }

            // الخط الرابط
            const isLast = si === g.stageObjs.length - 1;
            const divider = !isLast
                ? `<div class="wf2-divider${done ? ' wf2-div-done' : ''}"></div>`
                : '';

            // Tooltip
            const tipStatus = done
                ? `<span class="wf2-tip-s wf2-tip-done">✓ مكتملة${date ? ' — ' + date : ''}</span>`
                : current
                    ? `<span class="wf2-tip-s wf2-tip-act">● جارية الآن</span>`
                    : rejected
                        ? `<span class="wf2-tip-s wf2-tip-rej">✕ مرفوضة</span>`
                        : `<span class="wf2-tip-s wf2-tip-pend">في الانتظار</span>`;

            return `
            <div class="wf2-node">
                <div class="wf2-circle ${circleClass}" style="${circleStyle}">${innerHTML}</div>
                <span class="wf2-node-lbl${current ? ' wf2-lbl-act' : ''}"${groupColor && current ? ` style="color:${groupColor}"` : ''}>${name}</span>
                <div class="wf2-tip">
                    <span class="wf2-tip-name">${name}</span>
                    ${who ? `<span class="wf2-tip-emp"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> ${who}</span>` : ''}
                    ${tipStatus}
                </div>
            </div>
            ${divider}`;
        }).join('');

        const sepAfter = gi < activeGroups.length - 1 ? `
        <div class="wf2-group-sep">
            <div class="wf2-gsep-line"></div>
            <div class="wf2-gsep-dot"></div>
            <div class="wf2-gsep-line"></div>
        </div>` : '';

        return `
        <div class="wf2-group">
            <div class="wf2-group-lbl"${groupColor ? ` style="color:${groupColor}"` : ''}>${tr(g.label)}</div>
            <div class="wf2-group-row">${nodesHTML}</div>
        </div>
        ${sepAfter}`;
    }).join('');

    // ── الرأس ─────────────────────────────────────────────
    const headStatus = isClosed
        ? `<span class="wf2-badge-closed">${curName}</span>`
        : `<span class="wf2-pulse-dot"></span><span class="wf2-cur-name">${curName}</span>`;

    const empHTML = curEmployee && !isClosed ? `
        <div class="wf2-sep"></div>
        <div class="wf2-employee">
            <div class="wf2-avatar">${curInitials || '—'}</div>
            <span>${curEmployee}</span>
        </div>` : '';

    return `
    <div class="wf2-card">

        <!-- ── الرأس ── -->
        <div class="wf2-head">
            <div class="wf2-head-left">
                ${headStatus}
                ${empHTML}
            </div>
            <div class="wf2-spacer"></div>
            <span class="wf2-pct-pill">${pct}%</span>
            <span class="wf2-count">${doneCount} / ${totalSteps}</span>
        </div>

        <!-- ── شريط التقدم ── -->
        <div class="wf2-bar-track">
            <div class="wf2-bar-fill" style="width:${pct}%"></div>
        </div>

        <!-- ── المجموعات ── -->
        <div class="wf2-groups">
            ${groupsHTML}
        </div>

    </div>`;
}


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

// ── مفتاح حماية من التكرار (يُعاد ضبطه بعد كل نتيجة) ──────
let _prSubmitLock = false;

async function prSubmitCreate() {
    // ── حماية صارمة من التكرار ──────────────────────────────
    if (_prSubmitLock) return;
    _prSubmitLock = true;

    const title = document.getElementById('prf-title')?.value?.trim();
    const amount = parseFloat(document.getElementById('prf-amount')?.value) || 0;
    const rtype = document.getElementById('prf-request-type')?.value || '';
    const suppEl = document.getElementById('prf-supplier');
    const suppSel = suppEl?.value || '';
    const suppMan = document.getElementById('prf-supplier-manual')?.value?.trim() || '';

    const suppVisible = suppEl && suppEl.style.display !== 'none';
    const supplierId = (suppVisible && suppSel && suppSel !== 'manual') ? suppSel : '';
    const supplierName = (!supplierId) ? suppMan : '';

    const body = {
        title,
        description: document.getElementById('prf-desc')?.value || '',
        type_id: rtype,
        parent_type_id: document.getElementById('prf-type-parent')?.value || '',
        supplier_id: supplierId,
        supplier_name_manual: supplierName,
        amount,
        currency: document.getElementById('prf-currency')?.value || 'SAR',
        cost_center_id: document.getElementById('prf-cost-center')?.value || '',
        budget_category_id: document.getElementById('prf-budget-cat')?.value || '',
        priority: document.getElementById('prf-priority')?.value || 'normal',
        needed_date: document.getElementById('prf-needed-date')?.value || '',
        _idem: `PR-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    };

    // ── عرض شاشة التحميل ────────────────────────────────────
    prShowSubmitLoading();

    let success = false;
    let resultNumber = '';
    let errorMsg = '';

    const _abort = new AbortController();
    const _timer = setTimeout(() => _abort.abort(), 25000);

    try {
        const res = await fetch('api/purchase_requests_api.php?action=create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: _abort.signal,
        });

        clearTimeout(_timer);

        let data = {};
        try { data = await res.json(); } catch (_) { }

        if (res.ok && data.success) {
            success = true;
            resultNumber = data.number || '';
        } else {
            errorMsg = data.message || `خطأ ${res.status}: فشل إنشاء الطلب`;
        }
    } catch (e) {
        clearTimeout(_timer);
        if (e.name === 'AbortError') {
            errorMsg = 'انتهت مهلة الإرسال (25 ثانية). تحقق من الاتصال ثم حاول مجدداً.';
        } else {
            errorMsg = 'تعذّر الاتصال بالخادم. تحقق من الاتصال بالإنترنت.';
        }
    }

    // ── عرض نتيجة واضحة بدلاً من Toast ─────────────────────
    prShowSubmitResult(success, resultNumber, errorMsg, async () => {
        if (success) {
            closeModal();
            await prLoadRequestsList();
        }
        // عند الخطأ: أبقِ النموذج مفتوحاً للتعديل
        _prSubmitLock = false;
    });
}

/** عرض overlay التحميل داخل النافذة */
function prShowSubmitLoading() {
    // إخفاء footer النموذج وتعطيل الأزرار
    const footer = document.querySelector('#prf-page-3 .prf-footer');
    if (footer) footer.style.display = 'none';

    // إزالة overlay قديم إن وُجد
    document.getElementById('prf-loading-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'prf-loading-overlay';
    overlay.className = 'prf-loading-overlay';
    overlay.innerHTML = `
        <div class="prf-loading-box">
            <div class="prf-spinner">
                <svg viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="22" cy="22" r="17" fill="none"
                            stroke="currentColor" stroke-width="3"
                            stroke-dasharray="72 28"
                            stroke-linecap="round"/>
                </svg>
            </div>
            <p class="prf-loading-text">جارٍ إرسال الطلب</p>
            <p class="prf-loading-sub">يُرجى الانتظار، لا تغلق النافذة</p>
            <div class="prf-loading-dots">
                <span></span><span></span><span></span>
            </div>
        </div>
    `;

    // إضافة داخل modal body
    const page3 = document.getElementById('prf-page-3');
    if (page3) page3.appendChild(overlay);
}

/** عرض نتيجة الإرسال داخل النافذة */
function prShowSubmitResult(success, number, errorMsg, onClose) {
    // إزالة overlay التحميل
    document.getElementById('prf-loading-overlay')?.remove();

    const page3 = document.getElementById('prf-page-3');
    if (!page3) { onClose?.(); return; }

    // إزالة نتيجة قديمة
    document.getElementById('prf-result-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'prf-result-overlay';
    overlay.className = 'prf-result-overlay';

    if (success) {
        overlay.innerHTML = `
            <div class="prf-result-box prf-result-success">
                <div class="prf-result-header">
                    <div class="prf-result-icon-wrap">
                        <svg viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="26" cy="26" r="22" stroke="currentColor" stroke-width="2.5" class="prf-check-circle"/>
                            <polyline points="15,27 22,34 37,18" stroke="currentColor" stroke-width="3"
                                      stroke-linecap="round" stroke-linejoin="round" class="prf-check-path"/>
                        </svg>
                    </div>
                    <h3 class="prf-result-title">تم إنشاء الطلب بنجاح</h3>
                </div>
                <div class="prf-result-body">
                    <span class="prf-result-num">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                        ${number}
                    </span>
                    <p class="prf-result-sub">سيُحال الطلب للمرحلة التالية تلقائياً<br>ويمكنك متابعته من قائمة الطلبات</p>
                    <div class="prf-result-divider"></div>
                    <div class="prf-result-actions">
                        <button class="prf-result-btn prf-result-btn-ok" onclick="prCloseResult()">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                            حسناً
                        </button>
                    </div>
                </div>
            </div>
        `;
    } else {
        overlay.innerHTML = `
            <div class="prf-result-box prf-result-error">
                <div class="prf-result-header">
                    <div class="prf-result-icon-wrap">
                        <svg viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="26" cy="26" r="22" stroke="currentColor" stroke-width="2.5" class="prf-err-circle"/>
                            <line x1="17" y1="17" x2="35" y2="35" stroke="currentColor" stroke-width="3" stroke-linecap="round" class="prf-err-x1"/>
                            <line x1="35" y1="17" x2="17" y2="35" stroke="currentColor" stroke-width="3" stroke-linecap="round" class="prf-err-x2"/>
                        </svg>
                    </div>
                    <h3 class="prf-result-title">تعذّر إنشاء الطلب</h3>
                </div>
                <div class="prf-result-body">
                    <p class="prf-result-errmsg">${errorMsg}</p>
                    <p class="prf-result-hint">راجع البيانات المُدخلة ثم أعد المحاولة</p>
                    <div class="prf-result-actions">
                        <button class="prf-result-btn prf-result-btn-retry" onclick="prCloseResult(true)">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.9"/></svg>
                            تعديل وإعادة الإرسال
                        </button>
                        <button class="prf-result-btn prf-result-btn-ok" onclick="prCloseResult()">
                            إغلاق
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    page3.appendChild(overlay);

    // تخزين الـ callback
    window._prResultCallback = onClose;
    window._prResultSuccess = success;
}

/** إغلاق نافذة النتيجة */
function prCloseResult(keepForm = false) {
    document.getElementById('prf-result-overlay')?.remove();

    if (!keepForm && window._prResultSuccess) {
        // نجاح: تنفيذ الـ callback (إغلاق modal + تحديث القائمة)
        window._prResultCallback?.();
    } else {
        // خطأ أو تعديل: أظهر footer النموذج مجدداً
        const footer = document.querySelector('#prf-page-3 .prf-footer');
        if (footer) footer.style.display = '';
        window._prResultCallback?.();
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

        // إعادة تحميل الطلب لتحديث الأزرار
        await prOpenDetail(requestId);

        // بعد الموافقة على مرحلة انتظار اعتماد الحجز → اسأل عن إنشاء حجز
        if (stage === 'waiting_budget_approval') {
            setTimeout(() => prShowCreateReservationModal(requestId), 400);
        }
    }
}

/** modal سؤال إنشاء حجز موازنة بعد الموافقة */
function prShowCreateReservationModal(requestId) {
    DOM.modalTitle.textContent = '📌 إنشاء حجز موازنة';
    DOM.modalBody.innerHTML = `
        <div class="pr-form">
            <p style="margin-bottom:1rem;color:var(--color-text-primary);line-height:1.7">
                تمت الموافقة على الطلب بنجاح.<br>
                هل تريد إنشاء <strong>حجز موازنة</strong> لهذا الطلب الآن؟
            </p>
            <div class="form-actions">
                <button class="btn btn-ghost" onclick="closeModal()">لاحقاً</button>
                <button class="btn btn-primary" onclick="closeModal(); prCreateBudgetReservation(${requestId})" style="background:#f59e0b;border-color:#f59e0b">
                    📌 نعم، إنشاء حجز الآن
                </button>
            </div>
        </div>
    `;
    openModal();
}

/**
 * فتح نافذة الرفض
 * @param {number} requestId
 * @param {string} stage
 */
function prOpenRejectModal(requestId, stage) {
    const isReception = stage === 'reception';
    DOM.modalTitle.textContent = isReception ? '↩️ إرجاع للتصحيح' : '❌ رفض الطلب';
    DOM.modalBody.innerHTML = `
        <div class="pr-form">
            <div class="form-group">
                <label class="form-label">${isReception ? 'سبب الإرجاع وما يلزم تصحيحه *' : 'سبب الرفض *'}</label>
                <textarea id="reject-reason" class="form-control" rows="4"
                          placeholder="${isReception ? 'وضّح البيانات الناقصة أو الخاطئة التي تحتاج تصحيحاً...' : 'اشرح سبب الرفض بوضوح...'}" required></textarea>
            </div>
            <p class="pr-reject-note">
                ${isReception
            ? '↩️ سيُرجَع الطلب للمنشئ مع توضيح ما يلزم تصحيحه.'
            : '⚠️ سيتم إرجاع الطلب لمدير الإدارة الطالبة مع سبب الرفض.'
        }
            </p>
            <div class="form-actions">
                <button class="btn btn-ghost" onclick="closeModal()">إلغاء</button>
                <button class="btn btn-danger" onclick="prSubmitReject(${requestId}, '${stage}')">
                    ${isReception ? '↩️ إرجاع للتصحيح' : '❌ تأكيد الرفض'}
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
// ⑧-ب مرحلة المشتريات — المسار الطويل والقصير
// ════════════════════════════════════════════════════════════

/**
 * المسار الطويل: موظف المشتريات يطلب موافقة CEO المبدئية
 */
async function prRequestCeoApproval(requestId) {
    DOM.modalTitle.textContent = 'طلب موافقة الرئيس التنفيذي';
    DOM.modalBody.innerHTML = `
        <div class="pr-form" style="padding:1.25rem">
            <div style="padding:.85rem 1rem;background:var(--bg-surface);border-radius:10px;border:1px solid var(--border-color);margin-bottom:1rem">
                <div style="font-size:.95rem;font-weight:600;margin-bottom:.25rem">🔼 طلب موافقة مبدئية</div>
                <div style="font-size:.82rem;color:var(--text-muted)">سيُرسل الطلب للرئيس التنفيذي للاعتماد المبدئي قبل إنشاء حجز الموازنة</div>
            </div>
            <div class="form-group">
                <label class="form-label">ملاحظات (اختيارية)</label>
                <textarea id="pr-ceo-notes" class="form-input" rows="3" placeholder="أي ملاحظات للرئيس التنفيذي..."></textarea>
            </div>
            <div class="modal-footer" style="padding:0;border:none;margin-top:1rem">
                <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
                <button class="btn btn-primary" onclick="prSubmitCeoApproval(${requestId})" style="background:#f59e0b;border-color:#f59e0b">
                    إرسال للرئيس التنفيذي
                </button>
            </div>
        </div>`;
    openModal();
}

async function prSubmitCeoApproval(requestId) {
    const notes = document.getElementById('pr-ceo-notes')?.value?.trim() || '';
    closeModal();
    try {
        const result = await prPostAction('request_ceo_approval', { request_id: requestId, notes });
        if (result?.success) {
            showToast('✅ تم إرسال الطلب للرئيس التنفيذي', 'success');
            await prOpenDetail(requestId);
        } else {
            showToast(result?.message || 'حدث خطأ', 'error');
        }
    } catch (e) {
        showToast('خطأ في الاتصال', 'error');
    }
}

/**
 * المسار القصير: موظف المشتريات ينتقل مباشرة لإنشاء حجز الموازنة
 */
async function prApprovePurchasing(requestId) {
    showToast('جارٍ فتح صفحة الحجوزات...', 'info');
    try {
        const res = await fetch(`api/purchase_requests_api.php?action=get&id=${requestId}`);
        const data = await res.json();
        if (!data.success) { showToast('خطأ في جلب بيانات الطلب', 'error'); return; }

        BudgetState.activeTab = 'reservations';
        await loadBudgetReservationsPage();
        setTimeout(() => {
            if (typeof openAddReservationModalWithData === 'function') {
                openAddReservationModalWithData(data.data);
            } else if (typeof openAddReservationModal === 'function') {
                openAddReservationModal();
            }
        }, 900);
    } catch (err) {
        showToast('خطأ في فتح صفحة الحجوزات', 'error');
        console.error(err);
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
function prUploadFile(event, requestId) {
    const file = event.target.files[0];
    if (!file) return;
    // إعادة ضبط الـ input حتى يمكن اختيار نفس الملف مجدداً
    event.target.value = '';

    // فتح modal التسمية
    const suggestedLabel = file.name.replace(/\.[^/.]+$/, '');
    DOM.modalTitle.textContent = 'رفع مرفق';
    DOM.modalBody.innerHTML = `
    <div style="padding:1.25rem;display:flex;flex-direction:column;gap:1rem">
        <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--bg-surface);border-radius:8px;border:1px solid var(--border-color)">
            <span style="font-size:1.5rem">${prGetFileIcon(file.type)}</span>
            <div>
                <div style="font-size:13px;font-weight:600;color:var(--text-primary)">${file.name}</div>
                <div style="font-size:11px;color:var(--text-muted)">${(file.size / 1024).toFixed(0)} KB</div>
            </div>
        </div>
        <div class="form-group">
            <label class="form-label">تسمية المرفق *</label>
            <input class="form-input" id="pr-attach-label" value="${suggestedLabel}"
                   placeholder="مثال: عرض أسعار، فاتورة، اعتماد..." style="font-size:13px">
            <div style="font-size:11px;color:var(--text-muted);margin-top:4px">اسم واضح يُسهّل التعرف على المرفق لاحقاً</div>
        </div>
        <div class="modal-footer" style="padding:0;border:none;margin-top:.25rem">
            <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
            <button class="btn btn-primary" onclick="prDoUpload(${requestId})">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                رفع الملف
            </button>
        </div>
    </div>`;
    openModal();
    // حفظ الملف مؤقتاً
    window._prPendingFile = file;
    window._prPendingRequestId = requestId;
    setTimeout(() => document.getElementById('pr-attach-label')?.focus(), 100);
}

async function prDoUpload(requestId) {
    const file = window._prPendingFile;
    const label = document.getElementById('pr-attach-label')?.value?.trim() || file?.name || '';
    if (!file) return;
    if (!label) { showToast('أدخل تسمية للمرفق', 'error'); return; }

    closeModal();
    const formData = new FormData();
    formData.append('action', 'upload_attachment');
    formData.append('request_id', requestId);
    formData.append('file', file);
    formData.append('file_label', label);

    showToast('جارٍ رفع الملف...', 'info');
    try {
        const res = await fetch('api/purchase_requests_api.php?action=upload_attachment', {
            method: 'POST', body: formData,
        });
        const data = await res.json();
        if (data.success) {
            showToast('✅ تم رفع الملف بنجاح', 'success');
            await prOpenDetail(requestId);
        } else {
            showToast(data.message || 'فشل رفع الملف', 'error');
        }
    } catch (e) {
        showToast(tr('خطأ في الاتصال'), 'error');
    }
    window._prPendingFile = null;
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
        reception: ['receiver', 'employee_l1', 'division_manager', 'sector_head', 'system_admin'],
        budget_review: ['budget', 'division_manager', 'sector_head'],
        treasury_review: ['dispatch', 'treasury_manager', 'division_manager', 'sector_head'],
        finance_review: ['division_manager', 'sector_head'],
        waiting_budget_approval: ['budget', 'CEO', 'admin', 'sector_head'],
        ceo_approval: ['admin', 'CEO'],
        purchasing: ['dispatch', 'purchasing'],
        accounts_review: ['accountant', 'division_manager', 'sector_head'],
        po_issuance: ['dispatch', 'purchasing'],
        payment: ['payment', 'division_manager'],
    };

    const allowed = stagePermissions[stage] || [];
    if (allowed.includes(role) || allowed.includes(level)) return true;

    // مرحلة الاستلام — القطاع المالي فقط
    if (stage === 'reception') {
        const isFinance = PRState.userAccess?.is_finance_sector
            || (currentUser.departmentCode || '').startsWith('31')
            || (currentUser.sectorCode || '') === 'FIN';
        if (isFinance) return true;
    }

    // القطاع المالي بمستوى division_manager أو أعلى → يعتمد مرحلة انتظار الحجز
    if (stage === 'waiting_budget_approval') {
        const isFinance = PRState.userAccess?.is_finance_sector
            || (currentUser.departmentCode || '').startsWith('31')
            || (currentUser.sectorCode || '') === 'FIN';
        if (isFinance && ['division_manager', 'sector_head', 'CEO', 'system_admin'].includes(level)) return true;
    }

    // موظفو سلاسل الإمداد
    if (stage === 'purchasing') {
        if (PRState.userAccess?.is_supply_chain) return true;
        const deptCode = (currentUser.departmentCode || '').toString();
        if (deptCode === 'PUR' || deptCode.startsWith('41')) return true;
    }
    return false;
}

/** فتح تفاصيل الحجز من صفحة الطلب */
async function prOpenReservationFromPR(reservationId) {
    if (!reservationId) return;
    BudgetState.activeTab = 'reservations';
    await loadBudgetReservationsPage();
    setTimeout(() => {
        if (typeof openReservationDetails === 'function') {
            openReservationDetails(reservationId);
        }
    }, 900);
}

/** اختيار مسار الحسابات: PO أو دفع مباشر */
async function prChooseRoute(requestId, route) {
    const label = route === 'po' ? 'إصدار أمر الشراء (PO)' : 'الدفع المباشر';
    DOM.modalTitle.textContent = 'اختيار مسار الصرف';
    DOM.modalBody.innerHTML = `
        <div class="pr-form" style="padding:1.25rem">
            <div style="padding:.85rem 1rem;background:var(--bg-surface);border-radius:10px;border:1px solid var(--border-color);margin-bottom:1rem">
                <div style="font-size:.95rem;font-weight:600;color:var(--text-primary);margin-bottom:.25rem">
                    ${route === 'po' ? '📋 مسار إصدار أمر الشراء' : '💳 مسار الدفع المباشر'}
                </div>
                <div style="font-size:.82rem;color:var(--text-muted)">
                    ${route === 'po' ? 'سيُرسل الطلب للمشتريات لإصدار أمر الشراء ثم للمالية للدفع' : 'سيُرسل الطلب مباشرة للمالية للدفع'}
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">ملاحظات (اختياري)</label>
                <textarea id="pr-route-notes" class="form-input" rows="2" placeholder="أي ملاحظات..."></textarea>
            </div>
            <div class="modal-footer" style="padding:0;border:none;margin-top:1rem">
                <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
                <button class="btn btn-primary" onclick="prSubmitRoute(${requestId},'${route}')">
                    تأكيد — ${label}
                </button>
            </div>
        </div>`;
    openModal();
}

async function prSubmitRoute(requestId, route) {
    const notes = document.getElementById('pr-route-notes')?.value?.trim() || '';
    closeModal();
    try {
        const res = await prPostAction('accounts_choose_route', { request_id: requestId, route, notes });
        if (res?.success) {
            showToast('✅ تم إرسال الطلب: ' + (route === 'po' ? 'مسار PO' : 'دفع مباشر'), 'success');
            await prOpenDetail(requestId);
        } else {
            showToast('❌ ' + (res?.message || 'خطأ'), 'error');
        }
    } catch (e) {
        showToast('❌ خطأ في الاتصال', 'error');
    }
}

/** إنشاء حجز موازنة من طلب الشراء */
async function prCreateBudgetReservation(requestId) {
    try {
        // جلب بيانات الطلب
        const res = await fetch(`api/purchase_requests_api.php?action=get&id=${requestId}`);
        const data = await res.json();
        if (!data.success) { showToast('خطأ في جلب بيانات الطلب', 'error'); return; }
        const req = data.data;

        showToast('جارٍ فتح صفحة الحجوزات...', 'info');

        // الانتقال لصفحة حجوزات الموازنة
        BudgetState.activeTab = 'reservations';
        await loadBudgetReservationsPage();

        // فتح نموذج الحجز مع البيانات المعبأة مسبقاً
        setTimeout(() => {
            if (typeof openAddReservationModalWithData === 'function') {
                openAddReservationModalWithData(req);
            } else if (typeof openAddReservationModal === 'function') {
                openAddReservationModal();
            }
        }, 900);

    } catch (err) {
        showToast('خطأ في إنشاء الحجز', 'error');
        console.error(err);
    }
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