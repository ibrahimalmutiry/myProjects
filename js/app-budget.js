/**
 * app-budget.js — شاشة الحجوزات المالية
 * ════════════════════════════════════════════════════════════
 */

// ── حالة الشاشة ────────────────────────────────────────────
const BudgetState = {
    reservations: [],
    meta: { departments: [], suppliers: [], transactions: [] },
    filter: { status: '', department_id: '', fiscal_year: '', search: '' },
    currentStep: 1,  // خطوات نموذج الإدخال
    loaded: false,
};

// ── تسميات الحالات ──────────────────────────────────────────
const RES_STATUS = {
    'مسودة': { color: '#94a3b8', bg: 'rgba(148,163,184,.15)', icon: '📝' },
    'قيد المراجعة': { color: '#f59e0b', bg: 'rgba(245,158,11,.12)', icon: '🔍' },
    'معتمد': { color: '#22c55e', bg: 'rgba(34,197,94,.12)', icon: '✅' },
    'مرفوض': { color: '#ef4444', bg: 'rgba(239,68,68,.12)', icon: '❌' },
    'ملغى': { color: '#6b7280', bg: 'rgba(107,114,128,.12)', icon: '🚫' },
    'منفذ': { color: '#8b5cf6', bg: 'rgba(139,92,246,.12)', icon: '🎯' },
};

const PRIORITY_COLOR = {
    'عادي': 'var(--text-muted)',
    'عاجل': '#f59e0b',
    'حرج': '#ef4444',
};

// ═══════════════════════════════════════════════════════════════
//  نقطة الدخول
// ═══════════════════════════════════════════════════════════════
async function loadBudgetReservationsPage() {
    DOM.mainContent.innerHTML = `
        <div class="budget-page-wrap">
            <div style="text-align:center;padding:3rem">
                <div class="spinner"></div>
                <p style="margin-top:1rem;color:var(--text-muted)">جاري التحميل…</p>
            </div>
        </div>`;

    injectBudgetStyles();

    await Promise.all([
        fetchReservations(),
        fetchBudgetMeta(),
    ]);

    renderBudgetPage();
}

// ── جلب البيانات ────────────────────────────────────────────
async function fetchReservations() {
    try {
        const params = new URLSearchParams(
            Object.fromEntries(Object.entries(BudgetState.filter).filter(([, v]) => v))
        );
        const res = await fetch(`api/budget.php?action=list&${params}`);
        const data = await res.json();
        if (data.success) BudgetState.reservations = data.data;
    } catch (e) { console.error(e); }
}

async function fetchBudgetMeta() {
    try {
        const res = await fetch('api/budget.php?action=meta');
        const data = await res.json();
        if (data.success) BudgetState.meta = data.data;
    } catch (e) { console.error(e); }
}

// ═══════════════════════════════════════════════════════════════
//  رسم الصفحة الرئيسية
// ═══════════════════════════════════════════════════════════════
function renderBudgetPage() {
    const { reservations, filter, meta } = BudgetState;

    // إحصائيات سريعة
    const total = reservations.length;
    const pending = reservations.filter(r => r.status === 'قيد المراجعة').length;
    const approved = reservations.filter(r => r.status === 'معتمد').length;
    const rejected = reservations.filter(r => r.status === 'مرفوض').length;
    const totalAmt = reservations.reduce((s, r) => s + parseFloat(r.grand_total || 0), 0);

    const statsHtml = `
        <div class="budget-stats-row">
            <div class="budget-stat-card">
                <div class="bsc-icon" style="background:rgba(99,102,241,.12);color:#6366f1">📋</div>
                <div class="bsc-body">
                    <div class="bsc-num">${total}</div>
                    <div class="bsc-label">إجمالي الحجوزات</div>
                </div>
            </div>
            <div class="budget-stat-card">
                <div class="bsc-icon" style="background:rgba(245,158,11,.12);color:#f59e0b">🔍</div>
                <div class="bsc-body">
                    <div class="bsc-num">${pending}</div>
                    <div class="bsc-label">قيد المراجعة</div>
                </div>
            </div>
            <div class="budget-stat-card">
                <div class="bsc-icon" style="background:rgba(34,197,94,.12);color:#22c55e">✅</div>
                <div class="bsc-body">
                    <div class="bsc-num">${approved}</div>
                    <div class="bsc-label">معتمدة</div>
                </div>
            </div>
            <div class="budget-stat-card">
                <div class="bsc-icon" style="background:rgba(239,68,68,.12);color:#ef4444">❌</div>
                <div class="bsc-body">
                    <div class="bsc-num">${rejected}</div>
                    <div class="bsc-label">مرفوضة</div>
                </div>
            </div>
            <div class="budget-stat-card wide">
                <div class="bsc-icon" style="background:rgba(139,92,246,.12);color:#8b5cf6">💰</div>
                <div class="bsc-body">
                    <div class="bsc-num">${fmtMoney ? fmtMoney(totalAmt) : totalAmt.toLocaleString('ar-SA')}</div>
                    <div class="bsc-label">إجمالي المبالغ المطلوبة</div>
                </div>
            </div>
        </div>`;

    // شريط الفلاتر
    const filtersHtml = `
        <div class="budget-filters-bar">
            <input type="text" class="filter-input" placeholder="🔍 بحث برقم الحجز أو الغرض…"
                value="${filter.search}" oninput="budgetFilterChange('search', this.value)">

            <select class="filter-select" onchange="budgetFilterChange('status', this.value)">
                <option value="">كل الحالات</option>
                ${Object.keys(RES_STATUS).map(s =>
        `<option value="${s}" ${filter.status === s ? 'selected' : ''}>${s}</option>`
    ).join('')}
            </select>

            <select class="filter-select" onchange="budgetFilterChange('department_id', this.value)">
                <option value="">كل الأقسام</option>
                ${meta.departments.map(d =>
        `<option value="${d.id}" ${filter.department_id == d.id ? 'selected' : ''}>${d.name}</option>`
    ).join('')}
            </select>

            <button class="btn btn-primary" onclick="openAddReservationModal()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                حجز جديد
            </button>
        </div>`;

    // الجدول
    const tableHtml = renderReservationsTable(reservations);

    DOM.mainContent.innerHTML = `
        <div class="budget-page-wrap">
            <div class="budget-page-header">
                <div>
                    <h2 class="budget-page-title">📑 شاشة الحجوزات</h2>
                    <p class="budget-page-sub">إدارة حجوزات الموازنة المالية لكافة الأقسام</p>
                </div>
            </div>
            ${statsHtml}
            ${filtersHtml}
            ${tableHtml}
        </div>`;
}

// ── الجدول ─────────────────────────────────────────────────
function renderReservationsTable(list) {
    if (!list.length) return `
        <div class="budget-empty">
            <div style="font-size:3rem">📋</div>
            <h3>لا توجد حجوزات</h3>
            <p>ابدأ بإضافة حجز جديد</p>
        </div>`;

    const rows = list.map(r => {
        const st = RES_STATUS[r.status] || RES_STATUS['مسودة'];
        const prColor = PRIORITY_COLOR[r.priority] || 'var(--text-muted)';
        const amt = parseFloat(r.grand_total || 0).toLocaleString('ar-SA', { minimumFractionDigits: 2 });
        const txBadge = r.transaction_number
            ? `<span class="res-tx-badge" title="مرتبط بمعاملة">${r.transaction_number}</span>`
            : `<span class="res-tx-badge unlinked">غير مرتبط</span>`;

        return `
            <tr class="res-row" onclick="openReservationDetails(${r.id})">
                <td>
                    <div class="res-num">${r.reservation_number}</div>
                    <div class="res-date">${r.request_date}</div>
                </td>
                <td>
                    <div class="res-purpose">${r.purpose}</div>
                    <div class="res-dept">${r.department_name || '—'}</div>
                </td>
                <td>
                    <div style="font-weight:600">${r.supplier_name || '—'}</div>
                    ${r.quotation_number ? `<div class="res-date">عرض سعر: ${r.quotation_number}</div>` : ''}
                </td>
                <td class="res-amount">
                    <div>${fmtMoney ? fmtMoney(parseFloat(r.grand_total || 0)) : amt} ${r.currency}</div>
                    ${r.vat_amount > 0 ? `<div class="res-date">+ ض.ق.م ${fmtMoney ? fmtMoney(parseFloat(r.vat_amount)) : parseFloat(r.vat_amount).toLocaleString('ar-SA')}</div>` : ''}
                </td>
                <td>
                    <span class="res-status-badge" style="color:${st.color};background:${st.bg}">
                        ${st.icon} ${r.status}
                    </span>
                </td>
                <td>
                    <span style="color:${prColor};font-weight:600;font-size:.78rem">${r.priority}</span>
                </td>
                <td>${txBadge}</td>
                <td onclick="event.stopPropagation()">
                    <div style="display:flex;gap:.35rem;justify-content:center">
                        <button class="btn-icon-sm" onclick="openReservationDetails(${r.id})" title="تفاصيل">👁</button>
                        ${(currentUser?.role === 'budget' || currentUser?.role === 'admin') && r.status === 'قيد المراجعة'
                ? `<button class="btn-icon-sm btn-success" onclick="event.stopPropagation();openReviewModal(${r.id})" title="مراجعة">✓</button>`
                : ''}
                    </div>
                </td>
            </tr>`;
    }).join('');

    return `
        <div class="budget-table-wrap">
            <table class="budget-table">
                <thead>
                    <tr>
                        <th>رقم الحجز</th>
                        <th>الغرض / القسم</th>
                        <th>المورد</th>
                        <th>المبلغ</th>
                        <th>الحالة</th>
                        <th>الأولوية</th>
                        <th>المعاملة</th>
                        <th>إجراءات</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;
}

// ── فلترة ────────────────────────────────────────────────────
let budgetSearchTimer;
function budgetFilterChange(key, value) {
    BudgetState.filter[key] = value;
    clearTimeout(budgetSearchTimer);
    budgetSearchTimer = setTimeout(async () => {
        await fetchReservations();
        renderBudgetPage();
    }, 300);
}

// ═══════════════════════════════════════════════════════════════
//  نموذج إضافة حجز — مراحل متتالية
// ═══════════════════════════════════════════════════════════════
function openAddReservationModal() {
    BudgetState.currentStep = 1;
    DOM.modalTitle.textContent = '📋 حجز جديد';
    DOM.modalBody.innerHTML = renderReservationForm();
    openModal();
}

function renderReservationForm(step = BudgetState.currentStep) {
    const { departments, suppliers } = BudgetState.meta;
    const today = new Date().toISOString().split('T')[0];

    const steps = [
        { n: 1, label: 'البيانات الأساسية', icon: '📌' },
        { n: 2, label: 'بيانات المورد', icon: '🏢' },
        { n: 3, label: 'بيانات الطلب', icon: '📦' },
    ];

    const stepsHtml = `
        <div class="res-steps-bar">
            ${steps.map(s => `
                <div class="res-step ${step === s.n ? 'active' : step > s.n ? 'done' : ''}">
                    <div class="res-step-circle">${step > s.n ? '✓' : s.n}</div>
                    <div class="res-step-label">${s.icon} ${s.label}</div>
                </div>
                ${s.n < 3 ? '<div class="res-step-line"></div>' : ''}
            `).join('')}
        </div>`;

    let formBody = '';

    // ── الخطوة 1: البيانات الأساسية ─────────────────────────
    if (step === 1) {
        formBody = `
            <div class="res-form-grid">
                <div class="res-form-group full">
                    <label>الغرض من الشراء <span class="req">*</span></label>
                    <input type="text" class="form-input" id="rf_purpose" placeholder="مثال: شراء أجهزة حاسوب لقسم تقنية المعلومات">
                </div>
                <div class="res-form-group">
                    <label>القسم الطالب <span class="req">*</span></label>
                    <select class="form-select" id="rf_department_id">
                        <option value="">-- اختر القسم --</option>
                        ${departments.map(d => `<option value="${d.id}">${d.name}</option>`).join('')}
                    </select>
                </div>
                <div class="res-form-group">
                    <label>تاريخ الطلب <span class="req">*</span></label>
                    <input type="date" class="form-input" id="rf_request_date" value="${today}">
                </div>
                <div class="res-form-group">
                    <label>الأولوية</label>
                    <select class="form-select" id="rf_priority">
                        <option value="عادي">عادي</option>
                        <option value="عاجل">عاجل ⚡</option>
                        <option value="حرج">حرج 🔴</option>
                    </select>
                </div>
                <div class="res-form-group">
                    <label>بند الموازنة</label>
                    <input type="text" class="form-input" id="rf_budget_category" placeholder="مثال: رأس المال / تشغيلي">
                </div>
                <div class="res-form-group">
                    <label>مركز التكلفة</label>
                    <input type="text" class="form-input" id="rf_cost_center" placeholder="مثال: CC-1001">
                </div>
            </div>`;
    }

    // ── الخطوة 2: بيانات المورد ─────────────────────────────
    if (step === 2) {
        formBody = `
            <div class="res-form-grid">
                <div class="res-form-group full">
                    <label>المورد</label>
                    <select class="form-select" id="rf_supplier_id" onchange="onSupplierChange(this)">
                        <option value="">-- اختر من القائمة أو أدخل يدوياً --</option>
                        ${suppliers.map(s => `<option value="${s.id}">${s.name} (${s.cr_number || '—'})</option>`).join('')}
                        <option value="manual">➕ مورد غير موجود في القائمة</option>
                    </select>
                </div>
                <div class="res-form-group full" id="rf_manual_supplier_wrap" style="display:none">
                    <label>اسم المورد <span class="req">*</span></label>
                    <input type="text" class="form-input" id="rf_supplier_name_manual" placeholder="أدخل اسم المورد">
                </div>
                <div class="res-form-group">
                    <label>رقم عرض السعر</label>
                    <input type="text" class="form-input" id="rf_quotation_number" placeholder="Q-2026-XXXX">
                </div>
                <div class="res-form-group">
                    <label>تاريخ عرض السعر</label>
                    <input type="date" class="form-input" id="rf_quotation_date">
                </div>
            </div>`;
    }

    // ── الخطوة 3: بيانات الطلب ──────────────────────────────
    if (step === 3) {
        formBody = `
            <div class="res-form-grid">
                <div class="res-form-group full">
                    <label>وصف البنود / الأصناف <span class="req">*</span></label>
                    <textarea class="form-textarea" id="rf_items_description" rows="3"
                        placeholder="اذكر الأصناف بالتفصيل: الكميات، المواصفات، الأوزان…"></textarea>
                </div>
                <div class="res-form-group">
                    <label>الكمية</label>
                    <input type="number" class="form-input" id="rf_quantity" value="1" min="1" oninput="calcReservationTotal()">
                </div>
                <div class="res-form-group">
                    <label>وحدة القياس</label>
                    <select class="form-select" id="rf_unit">
                        <option value="قطعة">قطعة</option>
                        <option value="طن">طن</option>
                        <option value="متر">متر</option>
                        <option value="لتر">لتر</option>
                        <option value="صندوق">صندوق</option>
                        <option value="خدمة">خدمة</option>
                        <option value="أخرى">أخرى</option>
                    </select>
                </div>
                <div class="res-form-group">
                    <label>سعر الوحدة (ريال)</label>
                    <input type="number" class="form-input" id="rf_unit_price" value="0" min="0" step="0.01" oninput="calcReservationTotal()">
                </div>
                <div class="res-form-group">
                    <label>الإجمالي قبل الضريبة</label>
                    <input type="number" class="form-input" id="rf_total_amount" value="0" step="0.01" oninput="calcVAT()">
                </div>
                <div class="res-form-group">
                    <label>ضريبة القيمة المضافة (15%)</label>
                    <input type="number" class="form-input" id="rf_vat_amount" value="0" step="0.01" readonly
                        style="background:var(--bg-surface);color:var(--text-muted)">
                </div>
                <div class="res-form-group full">
                    <label>الإجمالي الكلي شامل الضريبة</label>
                    <div class="res-grand-total" id="rf_grand_total_display">0.00 ريال</div>
                </div>
                <div class="res-form-group">
                    <label>العملة</label>
                    <select class="form-select" id="rf_currency">
                        <option value="SAR" selected>ريال سعودي (SAR)</option>
                        <option value="USD">دولار أمريكي (USD)</option>
                        <option value="EUR">يورو (EUR)</option>
                    </select>
                </div>
            </div>`;
    }

    const navHtml = `
        <div class="res-form-nav">
            ${step > 1
            ? `<button class="btn btn-secondary" onclick="budgetFormStep(${step - 1})">← السابق</button>`
            : `<button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>`}
            ${step < 3
            ? `<button class="btn btn-primary" onclick="budgetFormStep(${step + 1})">التالي ←</button>`
            : `<button class="btn btn-primary" onclick="submitReservation()">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    حفظ الحجز
                   </button>`}
        </div>`;

    return `<div class="res-form-wrap">${stepsHtml}<div class="res-form-body">${formBody}</div>${navHtml}</div>`;
}

// ── التنقل بين الخطوات ──────────────────────────────────────
function budgetFormStep(step) {
    if (step > BudgetState.currentStep) {
        // التحقق من الخطوة الحالية
        if (!validateBudgetStep(BudgetState.currentStep)) return;
    }

    // حفظ البيانات المُدخلة قبل تغيير الـ DOM
    saveBudgetFormData();
    BudgetState.currentStep = step;
    DOM.modalBody.innerHTML = renderReservationForm(step);

    // استعادة البيانات المحفوظة
    restoreBudgetFormData();
}

// حفظ بيانات النموذج في حالة الشاشة
const _budgetFormData = {};
function saveBudgetFormData() {
    const fields = [
        'rf_purpose', 'rf_department_id', 'rf_request_date', 'rf_priority', 'rf_budget_category', 'rf_cost_center',
        'rf_supplier_id', 'rf_supplier_name_manual', 'rf_quotation_number', 'rf_quotation_date',
        'rf_items_description', 'rf_quantity', 'rf_unit', 'rf_unit_price', 'rf_total_amount', 'rf_vat_amount', 'rf_currency',
    ];
    fields.forEach(id => {
        const el = document.getElementById(id);
        if (el) _budgetFormData[id] = el.value;
    });
}

function restoreBudgetFormData() {
    Object.entries(_budgetFormData).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el) el.value = val;
    });
    // إعادة حساب المجاميع
    if (document.getElementById('rf_grand_total_display')) calcReservationTotal();
    // إظهار حقل المورد اليدوي إن لزم
    if (_budgetFormData['rf_supplier_id'] === 'manual') {
        const wrap = document.getElementById('rf_manual_supplier_wrap');
        if (wrap) wrap.style.display = 'block';
    }
}

function validateBudgetStep(step) {
    if (step === 1) {
        const purpose = document.getElementById('rf_purpose')?.value.trim();
        const dept = document.getElementById('rf_department_id')?.value;
        if (!purpose) { showToast('⚠️ أدخل الغرض من الشراء', 'warning'); return false; }
        if (!dept) { showToast('⚠️ اختر القسم الطالب', 'warning'); return false; }
    }
    if (step === 3) {
        const items = document.getElementById('rf_items_description')?.value.trim();
        if (!items) { showToast('⚠️ أدخل وصف البنود', 'warning'); return false; }
    }
    saveBudgetFormData();
    return true;
}

function onSupplierChange(sel) {
    const wrap = document.getElementById('rf_manual_supplier_wrap');
    if (wrap) wrap.style.display = (sel.value === 'manual') ? 'block' : 'none';
}

function calcReservationTotal() {
    const qty = parseFloat(document.getElementById('rf_quantity')?.value || 0);
    const price = parseFloat(document.getElementById('rf_unit_price')?.value || 0);
    const total = qty * price;
    const totEl = document.getElementById('rf_total_amount');
    if (totEl) { totEl.value = total.toFixed(2); }
    calcVAT();
}

function calcVAT() {
    const total = parseFloat(document.getElementById('rf_total_amount')?.value || 0);
    const vat = total * 0.15;
    const grand = total + vat;
    const vatEl = document.getElementById('rf_vat_amount');
    const dispEl = document.getElementById('rf_grand_total_display');
    if (vatEl) vatEl.value = vat.toFixed(2);
    if (dispEl) dispEl.textContent = grand.toLocaleString('ar-SA', { minimumFractionDigits: 2 }) + ' ريال';
    _budgetFormData['rf_grand_total'] = grand.toFixed(2);
    _budgetFormData['rf_vat_amount'] = vat.toFixed(2);
}

// ── إرسال الحجز ─────────────────────────────────────────────
async function submitReservation() {
    if (!validateBudgetStep(3)) return;
    saveBudgetFormData();

    const suppId = _budgetFormData['rf_supplier_id'];
    const body = {
        purpose: _budgetFormData['rf_purpose'],
        department_id: _budgetFormData['rf_department_id'],
        request_date: _budgetFormData['rf_request_date'],
        priority: _budgetFormData['rf_priority'],
        budget_category: _budgetFormData['rf_budget_category'],
        cost_center: _budgetFormData['rf_cost_center'],
        supplier_id: suppId !== 'manual' ? suppId : '',
        supplier_name_manual: suppId === 'manual' ? _budgetFormData['rf_supplier_name_manual'] : '',
        quotation_number: _budgetFormData['rf_quotation_number'],
        quotation_date: _budgetFormData['rf_quotation_date'],
        items_description: _budgetFormData['rf_items_description'],
        quantity: _budgetFormData['rf_quantity'],
        unit: _budgetFormData['rf_unit'],
        unit_price: _budgetFormData['rf_unit_price'],
        total_amount: _budgetFormData['rf_total_amount'],
        vat_amount: _budgetFormData['rf_vat_amount'],
        grand_total: _budgetFormData['rf_grand_total'],
        currency: _budgetFormData['rf_currency'],
    };

    try {
        const res = await fetch('api/budget.php?action=add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await res.json();
        if (data.success) {
            showToast(`✅ تم إنشاء الحجز رقم ${data.number}`, 'success');
            closeModal();
            await fetchReservations();
            renderBudgetPage();
        } else {
            showToast('❌ ' + (data.error || 'خطأ في الحفظ'), 'error');
        }
    } catch (e) {
        showToast('❌ خطأ في الاتصال', 'error');
    }
}

// ═══════════════════════════════════════════════════════════════
//  تفاصيل الحجز + مراجعة موظف الموازنة
// ═══════════════════════════════════════════════════════════════
async function openReservationDetails(id) {
    DOM.modalTitle.textContent = '📋 تفاصيل الحجز';
    DOM.modalBody.innerHTML = '<div style="text-align:center;padding:2rem"><div class="spinner"></div></div>';
    openModal();

    try {
        const res = await fetch(`api/budget.php?action=get&id=${id}`);
        const data = await res.json();
        if (!data.success) { DOM.modalBody.innerHTML = '<p>خطأ في التحميل</p>'; return; }

        const r = data.data;
        const st = RES_STATUS[r.status] || RES_STATUS['مسودة'];
        const log = r.log || [];

        const logHtml = log.length ? log.map(l => `
            <div class="res-log-item">
                <div class="res-log-dot" style="background:var(--accent-blue)"></div>
                <div class="res-log-content">
                    <div class="res-log-action">${getLogActionLabel(l.action)}</div>
                    <div class="res-log-meta">${l.employee_name || '—'} • ${l.created_at}</div>
                    ${l.notes ? `<div class="res-log-notes">${l.notes}</div>` : ''}
                    ${l.new_status ? `<div>→ <strong>${l.new_status}</strong></div>` : ''}
                </div>
            </div>`).join('') : '<p style="color:var(--text-muted)">لا يوجد سجل أحداث</p>';

        DOM.modalTitle.textContent = `📋 حجز #${r.reservation_number}`;
        DOM.modalBody.innerHTML = `
            <div class="res-details-wrap">

                <!-- الحالة والرقم -->
                <div class="res-details-hero">
                    <div>
                        <div class="res-hero-num">${r.reservation_number}</div>
                        <div style="color:var(--text-muted);font-size:.82rem">${r.request_date} · ${r.department_name || '—'}</div>
                    </div>
                    <span class="res-status-badge lg" style="color:${st.color};background:${st.bg}">
                        ${st.icon} ${r.status}
                    </span>
                </div>

                <!-- معلومات أساسية -->
                <div class="res-details-grid">
                    <div class="res-detail-card">
                        <h4>📌 البيانات الأساسية</h4>
                        <div class="res-drow"><span>الغرض</span><span>${r.purpose}</span></div>
                        <div class="res-drow"><span>القسم</span><span>${r.department_name || '—'}</span></div>
                        <div class="res-drow"><span>مقدم الطلب</span><span>${r.requested_by_name || '—'}</span></div>
                        <div class="res-drow"><span>الأولوية</span>
                            <span style="color:${PRIORITY_COLOR[r.priority]};font-weight:600">${r.priority}</span></div>
                        <div class="res-drow"><span>بند الموازنة</span><span>${r.budget_category || '—'}</span></div>
                        <div class="res-drow"><span>مركز التكلفة</span><span>${r.cost_center || '—'}</span></div>
                    </div>

                    <div class="res-detail-card">
                        <h4>🏢 بيانات المورد</h4>
                        <div class="res-drow"><span>المورد</span><span>${r.supplier_name || '—'}</span></div>
                        <div class="res-drow"><span>رقم عرض السعر</span><span>${r.quotation_number || '—'}</span></div>
                        <div class="res-drow"><span>تاريخ عرض السعر</span><span>${r.quotation_date || '—'}</span></div>
                    </div>

                    <div class="res-detail-card">
                        <h4>📦 بيانات الطلب</h4>
                        <div class="res-drow"><span>الوصف</span><span>${r.items_description}</span></div>
                        <div class="res-drow"><span>الكمية</span><span>${r.quantity} ${r.unit || ''}</span></div>
                        <div class="res-drow"><span>سعر الوحدة</span><span>${r.unit_price} ${r.currency}</span></div>
                        <div class="res-drow"><span>الإجمالي</span><span>${r.total_amount} ${r.currency}</span></div>
                        <div class="res-drow"><span>ضريبة ق.م</span><span>${r.vat_amount} ${r.currency}</span></div>
                        <div class="res-drow accent"><span>الإجمالي الكلي</span>
                            <span style="font-weight:700;color:var(--accent-green)">${parseFloat(r.grand_total).toLocaleString('ar-SA')} ${r.currency}</span></div>
                    </div>

                    <div class="res-detail-card">
                        <h4>⚖️ مرحلة الموازنة</h4>
                        <div class="res-drow"><span>موظف الموازنة</span><span>${r.budget_employee_name || '—'}</span></div>
                        <div class="res-drow"><span>رمز الموازنة</span>
                            <span style="font-family:monospace;color:var(--accent-blue)">${r.budget_code || '—'}</span></div>
                        <div class="res-drow"><span>تاريخ المراجعة</span><span>${r.budget_review_date || '—'}</span></div>
                        <div class="res-drow"><span>المعاملة المرتبطة</span>
                            <span>${r.transaction_number ? `<span class="res-tx-badge">${r.transaction_number}</span>` : 'غير مرتبط'}</span></div>
                        ${r.budget_notes ? `<div class="res-drow"><span>ملاحظات</span><span>${r.budget_notes}</span></div>` : ''}
                        ${r.rejection_reason ? `<div class="res-drow" style="color:#ef4444"><span>سبب الرفض</span><span>${r.rejection_reason}</span></div>` : ''}
                    </div>

                    ${(() => {
                const dtLabels = { 'to_payment': '⚡ دفع مباشر', 'to_purchase_order': '📋 أمر شراء / تعميد', 'to_requester': '↩️ جهة طالبة' };
                const dtColors = { 'to_payment': 'var(--accent-green)', 'to_purchase_order': 'var(--accent-amber)', 'to_requester': 'var(--accent-purple)' };
                const hasDispatch = !!r.dispatch_type;
                const isPaused = r.dispatch_ola_active == 0;
                const label = dtLabels[r.dispatch_type] || '—';
                const color = dtColors[r.dispatch_type] || 'var(--text-muted)';
                return `
                        <div class="res-detail-card res-dispatch-card">
                            <h4 style="color:#818cf8">🔀 التوجيه</h4>
                            ${hasDispatch ? `
                                <div class="res-dispatch-route-badge" style="--rc:${color}">${label}</div>
                                <div class="res-drow"><span>الموظف</span><span>${r.dispatch_employee_name || '—'}</span></div>
                                ${r.routed_to ? `<div class="res-drow"><span>الجهة</span><span>${r.routed_to}</span></div>` : ''}
                                <div class="res-drow"><span>الحالة</span><span>${r.dispatch_status || '—'}</span></div>
                                ${r.dispatched_at ? `<div class="res-drow"><span>التاريخ</span><span>${r.dispatched_at.slice(0, 10)}</span></div>` : ''}
                                ${isPaused ? `<div class="res-dispatch-paused">
                                    ⏸ OLA معلّق — بانتظار عودة أمر الشراء
                                    ${(currentUser?.role === 'dispatch' || currentUser?.role === 'admin') ? `
                                    <button onclick="closeModal();openResumeDispatchModal(${r.transaction_id})"
                                            class="res-dispatch-resume-btn">▶ استئناف للدفع</button>` : ''}
                                </div>` : ''}
                                ${r.dispatch_notes ? `<div class="res-drow" style="margin-top:.35rem"><span>ملاحظات</span><span style="color:var(--text-muted);font-size:.82rem">${r.dispatch_notes}</span></div>` : ''}
                            ` : `
                                <div class="res-dispatch-pending">
                                    <div style="font-size:1.5rem">🔀</div>
                                    <div style="font-size:.82rem;color:var(--text-muted);margin-top:.3rem">
                                        ${r.transaction_number ? 'لم يتم التوجيه بعد' : 'لا توجد معاملة مرتبطة'}
                                    </div>
                                </div>
                            `}
                        </div>`;
            })()}

                </div>

                <!-- سجل الأحداث -->
                <div class="res-log-section">
                    <h4>📜 سجل الأحداث</h4>
                    <div class="res-log-list">${logHtml}</div>
                </div>

                <!-- أزرار الإجراءات -->
                <div class="res-details-footer">
                    <button class="btn btn-secondary" onclick="closeModal()">إغلاق</button>
                    ${(currentUser?.role === 'budget' || currentUser?.role === 'admin') && r.status === 'قيد المراجعة'
                ? `<button class="btn btn-primary" onclick="closeModal();openReviewModal(${r.id})">
                            ✓ مراجعة الحجز
                           </button>`
                : ''}
                </div>
            </div>`;
    } catch (e) {
        DOM.modalBody.innerHTML = '<p style="color:var(--accent-red)">خطأ في تحميل البيانات</p>';
    }
}

// ── نموذج مراجعة موظف الموازنة ──────────────────────────────
function openReviewModal(id) {
    const { transactions } = BudgetState.meta;
    const reservation = BudgetState.reservations.find(r => r.id === id);
    const reservationNumber = reservation?.reservation_number || '';

    DOM.modalTitle.textContent = '✅ مراجعة الحجز';
    DOM.modalBody.innerHTML = `
        <div class="res-review-wrap">
            <p style="color:var(--text-muted);margin-bottom:1.25rem;font-size:.88rem">
                قم بمراجعة الحجز وتحديد حالته وربطه بالمعاملة المالية المناسبة إذا وُجدت.
            </p>

            <div class="res-form-grid">
                <div class="res-form-group full">
                    <label>ربط بمعاملة مالية</label>
                    <select class="form-select" id="rev_transaction_id">
                        <option value="">-- بدون ربط --</option>
                        ${transactions.map(t =>
        `<option value="${t.id}">${t.transaction_number} — ${parseFloat(t.amount).toLocaleString('ar-SA')} ريال
                             ${t.budget_status ? `(${t.budget_status})` : ''}</option>`
    ).join('')}
                    </select>
                </div>
                <div class="res-form-group">
                    <label>رمز الموازنة <span class="req">*</span></label>
                    <input type="text" class="form-input" id="rev_budget_code" value="${reservationNumber}" placeholder="BUD-2026-XXXX">
                </div>
                <div class="res-form-group">
                    <label>الحالة الجديدة <span class="req">*</span></label>
                    <select class="form-select" id="rev_status">
                        <option value="معتمد">✅ معتمد</option>
                        <option value="مرفوض">❌ مرفوض</option>
                        <option value="قيد المراجعة">🔍 إعادة للمراجعة</option>
                    </select>
                </div>
                <div class="res-form-group full" id="rev_rejection_wrap" style="display:none">
                    <label>سبب الرفض <span class="req">*</span></label>
                    <textarea class="form-textarea" id="rev_rejection_reason" rows="2" placeholder="اذكر سبب الرفض بوضوح"></textarea>
                </div>
                <div class="res-form-group full">
                    <label>ملاحظات الموازنة</label>
                    <textarea class="form-textarea" id="rev_budget_notes" rows="2" placeholder="ملاحظات إضافية…"></textarea>
                </div>
            </div>

            <div class="res-form-nav">
                <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
                <button class="btn btn-primary" onclick="submitReview(${id})">حفظ المراجعة</button>
            </div>
        </div>`;

    // إظهار/إخفاء سبب الرفض
    document.getElementById('rev_status').addEventListener('change', function () {
        document.getElementById('rev_rejection_wrap').style.display =
            this.value === 'مرفوض' ? 'block' : 'none';
    });

    openModal();
}

async function submitReview(id) {
    const status = document.getElementById('rev_status').value;
    const txId = document.getElementById('rev_transaction_id').value;
    const code = document.getElementById('rev_budget_code').value.trim();
    const notes = document.getElementById('rev_budget_notes').value.trim();
    const rejReason = document.getElementById('rev_rejection_reason')?.value.trim();

    if (!code) { showToast('⚠️ أدخل رمز الموازنة', 'warning'); return; }
    if (status === 'مرفوض' && !rejReason) { showToast('⚠️ أدخل سبب الرفض', 'warning'); return; }

    try {
        const res = await fetch('api/budget.php?action=review', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id, status, budget_code: code,
                budget_notes: notes, transaction_id: txId,
                rejection_reason: rejReason
            }),
        });
        const data = await res.json();
        if (data.success) {
            showToast(`✅ تم تحديث الحجز — ${status}`, 'success');
            closeModal();
            await fetchReservations();
            await fetchBudgetMeta(); // تحديث قائمة المعاملات المتاحة
            renderBudgetPage();
        } else {
            showToast('❌ ' + (data.error || 'خطأ'), 'error');
        }
    } catch (e) {
        showToast('❌ خطأ في الاتصال', 'error');
    }
}

function getLogActionLabel(action) {
    return {
        create: 'إنشاء الحجز', review: 'مراجعة الموازنة', approve: 'اعتماد',
        reject: 'رفض', link_transaction: 'ربط بمعاملة', update: 'تعديل'
    }[action] || action;
}

// ═══════════════════════════════════════════════════════════════
//  CSS
// ═══════════════════════════════════════════════════════════════
function injectBudgetStyles() {
    if (document.getElementById('budget-styles')) return;
    const s = document.createElement('style');
    s.id = 'budget-styles';
    s.textContent = `
    /* ── الصفحة ─────────────────────────────────── */
    .budget-page-wrap { padding: .25rem 0; display:flex; flex-direction:column; gap:1.25rem; }
    .budget-page-header { display:flex; align-items:flex-end; justify-content:space-between; }
    .budget-page-title  { font-size:1.3rem; font-weight:700; color:var(--text-primary); margin:0; }
    .budget-page-sub    { color:var(--text-muted); font-size:.82rem; margin:.2rem 0 0; }

    /* ── الإحصائيات ─────────────────────────────── */
    .budget-stats-row { display:grid; grid-template-columns: repeat(4, 1fr) 1.5fr; gap:.75rem; }
    .budget-stat-card { background:var(--bg-card); border:1px solid var(--border-color);
                        border-radius:12px; padding:.85rem 1rem; display:flex; align-items:center; gap:.85rem; }
    .budget-stat-card.wide { grid-column: span 1; }
    .bsc-icon { width:40px; height:40px; border-radius:10px; display:flex; align-items:center;
                justify-content:center; font-size:1.1rem; flex-shrink:0; }
    .bsc-num  { font-size:1.4rem; font-weight:700; color:var(--text-primary); line-height:1; }
    .bsc-label{ font-size:.75rem; color:var(--text-muted); margin-top:.2rem; }

    /* ── الفلاتر ────────────────────────────────── */
    .budget-filters-bar { display:flex; gap:.625rem; align-items:center; flex-wrap:wrap; }
    .budget-filters-bar .filter-input { flex:1; min-width:200px; }

    /* ── الجدول ─────────────────────────────────── */
    .budget-table-wrap { background:var(--bg-card); border:1px solid var(--border-color);
                         border-radius:12px; overflow:hidden; }
    .budget-table { width:100%; border-collapse:collapse; }
    .budget-table thead th { padding:.75rem 1rem; text-align:right; font-size:.78rem;
                              font-weight:600; color:var(--text-muted);
                              background:var(--bg-surface); border-bottom:1px solid var(--border-color); }
    .res-row { cursor:pointer; transition:background .15s; }
    .res-row:hover { background:var(--bg-surface); }
    .res-row td { padding:.75rem 1rem; border-bottom:1px solid var(--border-color);
                  font-size:.83rem; vertical-align:middle; }
    .res-num  { font-weight:700; font-size:.88rem; color:var(--text-primary); font-family:monospace; }
    .res-date { font-size:.74rem; color:var(--text-muted); margin-top:.15rem; }
    .res-purpose { font-weight:500; color:var(--text-primary); }
    .res-dept { font-size:.74rem; color:var(--text-muted); }
    .res-amount { font-weight:600; color:var(--text-primary); text-align:left; direction:ltr; }
    .res-status-badge { display:inline-flex; align-items:center; gap:.3rem; padding:.3rem .7rem;
                        border-radius:6px; font-size:.76rem; font-weight:600; white-space:nowrap; }
    .res-status-badge.lg { font-size:.88rem; padding:.4rem .9rem; }
    .res-tx-badge { background:rgba(99,102,241,.12); color:#6366f1; padding:.2rem .55rem;
                    border-radius:5px; font-size:.74rem; font-family:monospace; font-weight:600; }
    .res-tx-badge.unlinked { background:var(--bg-surface); color:var(--text-muted); }
    .budget-empty { text-align:center; padding:3rem; color:var(--text-muted); }
    .budget-empty h3 { margin:.75rem 0 .25rem; color:var(--text-secondary); }

    /* ── نموذج الإدخال ───────────────────────────── */
    .res-form-wrap { display:flex; flex-direction:column; gap:1.25rem; }
    .res-steps-bar { display:flex; align-items:center; gap:0; }
    .res-step { display:flex; align-items:center; gap:.5rem; }
    .res-step-circle { width:28px; height:28px; border-radius:50%; display:flex; align-items:center;
                       justify-content:center; font-size:.78rem; font-weight:700;
                       background:var(--bg-surface); color:var(--text-muted);
                       border:2px solid var(--border-color); transition:all .2s; flex-shrink:0; }
    .res-step.active .res-step-circle { background:var(--btn-primary-bg); color:var(--btn-primary-text);
                                        border-color:var(--btn-primary-bg); }
    .res-step.done .res-step-circle   { background:var(--accent-green); color:#fff;
                                        border-color:var(--accent-green); }
    .res-step-label { font-size:.78rem; color:var(--text-muted); white-space:nowrap; }
    .res-step.active .res-step-label  { color:var(--text-primary); font-weight:600; }
    .res-step-line { flex:1; height:2px; background:var(--border-color); margin:0 .5rem; min-width:20px; }
    .res-form-grid { display:grid; grid-template-columns:1fr 1fr; gap:.85rem; }
    .res-form-group { display:flex; flex-direction:column; gap:.35rem; }
    .res-form-group.full { grid-column:span 2; }
    .res-form-group label { font-size:.82rem; font-weight:600; color:var(--text-secondary); }
    .req { color:var(--accent-red); }
    .res-grand-total { background:var(--btn-primary-bg); color:var(--btn-primary-text);
                       padding:.85rem 1.25rem; border-radius:10px; font-size:1.15rem;
                       font-weight:700; text-align:center; }
    .res-form-nav { display:flex; justify-content:space-between; padding-top:.5rem;
                    border-top:1px solid var(--border-color); }

    /* ── تفاصيل الحجز ───────────────────────────── */
    .res-details-wrap { display:flex; flex-direction:column; gap:1.25rem; }
    .res-details-hero { display:flex; align-items:flex-start; justify-content:space-between;
                        background:var(--bg-surface); padding:1rem; border-radius:10px; }
    .res-hero-num { font-size:1.5rem; font-weight:700; font-family:monospace; color:var(--text-primary); }
    .res-details-grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:.85rem; }
    .res-detail-card { background:var(--bg-surface); border-radius:10px; padding:.9rem 1rem; }
    .res-detail-card h4 { font-size:.82rem; font-weight:700; color:var(--text-secondary);
                          margin:0 0 .75rem; padding-bottom:.5rem; border-bottom:1px solid var(--border-color); }
    .res-drow { display:flex; justify-content:space-between; gap:.5rem;
                padding:.3rem 0; border-bottom:1px solid var(--border-color); font-size:.8rem; }
    .res-drow:last-child { border-bottom:none; }
    .res-drow span:first-child { color:var(--text-muted); flex-shrink:0; }
    .res-drow span:last-child  { color:var(--text-primary); font-weight:500; text-align:left; }

    /* ── بطاقة التوجيه ──────────────────────────── */
    .res-dispatch-card { border:1px solid rgba(129,140,248,.25) !important;
                         background:rgba(129,140,248,.04) !important; }
    .res-dispatch-route-badge { display:inline-block; padding:.3rem .8rem;
                                background:color-mix(in srgb, var(--rc) 12%, transparent);
                                color:var(--rc); border:1px solid color-mix(in srgb, var(--rc) 30%, transparent);
                                border-radius:20px; font-size:.78rem; font-weight:700;
                                margin-bottom:.65rem; }
    .res-dispatch-paused { background:rgba(234,179,8,.08); border:1px solid rgba(234,179,8,.25);
                           border-radius:7px; padding:.5rem .7rem; font-size:.78rem;
                           color:#b45309; margin-top:.6rem; display:flex;
                           align-items:center; justify-content:space-between; gap:.5rem; flex-wrap:wrap; }
    .res-dispatch-resume-btn { background:#818cf8; color:#fff; border:none; border-radius:6px;
                                padding:.25rem .65rem; font-size:.74rem; font-family:inherit;
                                cursor:pointer; white-space:nowrap; }
    .res-dispatch-pending { text-align:center; padding:.75rem 0; }

    /* ── سجل الأحداث ────────────────────────────── */
    .res-log-section { background:var(--bg-surface); border-radius:10px; padding:.9rem 1rem; }
    .res-log-section h4 { font-size:.82rem; font-weight:700; color:var(--text-secondary); margin:0 0 .85rem; }
    .res-log-list { display:flex; flex-direction:column; gap:.625rem; }
    .res-log-item { display:flex; gap:.75rem; align-items:flex-start; }
    .res-log-dot  { width:10px; height:10px; border-radius:50%; flex-shrink:0; margin-top:.3rem; }
    .res-log-action { font-size:.82rem; font-weight:600; color:var(--text-primary); }
    .res-log-meta   { font-size:.74rem; color:var(--text-muted); }
    .res-log-notes  { font-size:.78rem; color:var(--text-secondary); margin-top:.2rem; }

    .res-details-footer { display:flex; justify-content:flex-start; gap:.625rem;
                          padding-top:.75rem; border-top:1px solid var(--border-color); }

    /* ── مراجعة الموازنة ────────────────────────── */
    .res-review-wrap .res-form-grid { gap:.85rem; }

    @media (max-width:1100px) {
        .res-details-grid { grid-template-columns:1fr 1fr; }
    }
    @media (max-width:700px) {
        .budget-stats-row  { grid-template-columns:1fr 1fr; }
        .res-details-grid  { grid-template-columns:1fr; }
        .res-form-grid     { grid-template-columns:1fr; }
        .res-form-group.full { grid-column:span 1; }
    }
    `;
    document.head.appendChild(s);
}