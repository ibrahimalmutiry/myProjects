/**
 * ══════════════════════════════════════════════════════════════════
 *  app-budget-workflow.js
 *  نظام Workflow الموازنة — الواجهة الأمامية
 * ══════════════════════════════════════════════════════════════════
 *
 *  يُعالج:
 *   • عرض حالة الـ Workflow بـ Stepper مرئي
 *   • إجراءات: اعتماد مبدئي / اعتماد نهائي / رفض / توجيه / إعادة إرسال
 *   • Modal التوجيه مع Dropdown أنواع التوجيه
 *   • Timeline كامل لكل حجز
 *   • SLA dashboard في كل مرحلة
 *   • إحصائيات لوحة التحكم
 * ══════════════════════════════════════════════════════════════════
 */

'use strict';

const BudgetWorkflow = (() => {

  // ── نقطة نهاية الـ API ────────────────────────────────────────
  const API = 'api/budget_workflow_api.php';

  // ── مراحل الـ Workflow بالترتيب ───────────────────────────────
  const STAGES = [
    {
      key: 'budget_review',
      label: tr('مراجعة موظف الموازنة'),
      icon: '📋',
      color: '#f59e0b',
      description: 'يراجع موظف الموازنة الحجز ويتحقق من اكتمال البيانات واستيفاء الشروط',
    },
    {
      key: 'ceo_review',
      label: tr('اعتماد الرئيس التنفيذي'),
      icon: '👔',
      color: '#3b82f6',
      description: 'يعتمد الرئيس التنفيذي الحجز المعتمد مبدئياً من موظف الموازنة',
    },
    {
      key: 'completed',
      label: tr('مكتمل'),
      icon: '✅',
      color: '#10b981',
      description: 'تم الاعتماد النهائي وتفعيل المعاملة المالية المرتبطة',
    },
  ];

  const STATUS_CONFIG = {
    'مسودة': { color: '#6b7280', bg: '#f3f4f6', icon: '📝', next: 'قيد المراجعة' },
    'قيد المراجعة': { color: '#d97706', bg: '#fffbeb', icon: '⏳', next: 'معتمد مبدئياً' },
    'معتمد مبدئياً': { color: '#2563eb', bg: '#eff6ff', icon: '🔵', next: 'معتمد نهائياً' },
    'معتمد نهائياً': { color: '#059669', bg: '#ecfdf5', icon: '✅', next: null },
    'معتمد': { color: '#059669', bg: '#ecfdf5', icon: '✅', next: null },
    'مرفوض': { color: '#dc2626', bg: '#fef2f2', icon: '❌', next: 'قيد المراجعة' },
    'ملغى': { color: '#6b7280', bg: '#f3f4f6', icon: '🚫', next: null },
    'منفذ': { color: '#7c3aed', bg: '#f5f3ff', icon: '🎯', next: null },
    'موجّه': { color: '#0891b2', bg: '#ecfeff', icon: '↗️', next: null },
  };

  const FORWARDING_TYPES = [
    { value: 'للدراسة', label: 'للدراسة', desc: 'توجيه للدراسة والتقييم' },
    { value: 'للمراجعة', label: 'للمراجعة', desc: 'توجيه لإعادة المراجعة' },
    { value: 'للاستكمال', label: 'للاستكمال', desc: 'استكمال بيانات ناقصة' },
    { value: 'للإعادة', label: 'للإعادة', desc: 'إعادة الحجز لمرحلة سابقة' },
    { value: 'للتحقق', label: 'للتحقق', desc: 'التحقق من صحة البيانات' },
  ];

  // ── State ─────────────────────────────────────────────────────
  let state = {
    reservations: [],
    currentRes: null,
    userRole: null,
    isBudgetOfficer: false,
    isCEO: false,
    dashStats: null,
    filters: { page: 1, per_page: 25, status: '', workflow_stage: '' },
    pagination: { total: 0, pages: 0 },
  };

  // ══════════════════════════════════════════════════════════════
  //  PUBLIC API
  // ══════════════════════════════════════════════════════════════

  /**
   * تهيئة الـ Widget في عنصر DOM محدد
   * @param {HTMLElement|string} container - العنصر أو سيليكتور
   * @param {object}  opts - { userRole, isBudgetOfficer, isCEO }
   */
  function init(container, opts = {}) {
    const el = typeof container === 'string'
      ? document.querySelector(container)
      : container;
    if (!el) return console.error('BudgetWorkflow: container not found');

    state.userRole = opts.userRole || 'employee';
    state.isBudgetOfficer = opts.isBudgetOfficer || false;
    state.isCEO = opts.isCEO || false;

    el.innerHTML = _buildMainLayout();
    _attachEventListeners(el);
    loadDashboardStats();
    loadReservations();
  }

  /**
   * عرض تفاصيل + Timeline لحجز محدد
   */
  async function showDetail(resId) {
    try {
      const data = await _get(`${API}?action=get&reservation_id=${resId}`);
      if (!data.success) return _toast(data.message, 'error');
      state.currentRes = data.data;
      _renderDetailModal(data.data);
    } catch (e) {
      _toast('تعذّر جلب تفاصيل الحجز', 'error');
    }
  }

  /**
   * جلب + عرض إحصائيات لوحة التحكم
   */
  async function loadDashboardStats() {
    try {
      const year = new Date().getFullYear() % 100;
      const data = await _get(`${API}?action=dashboard_stats&fiscal_year=${year}`);
      if (data.success) {
        state.dashStats = data;
        _renderDashboardStats(data);
      }
    } catch (e) { /* تجاهل */ }
  }

  /**
   * جلب + عرض قائمة الحجوزات
   */
  async function loadReservations(extraFilters = {}) {
    const f = { ...state.filters, ...extraFilters };
    const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v !== '')).toString();
    try {
      _setLoading(true);
      const data = await _get(`${API}?action=list&${qs}`);
      if (!data.success) return _toast(data.message, 'error');
      state.reservations = data.data;
      state.pagination = data.pagination;
      _renderReservationsList(data.data, data.stats, data.pagination);
    } catch (e) {
      _toast('تعذّر جلب الحجوزات', 'error');
    } finally {
      _setLoading(false);
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  ACTIONS
  // ══════════════════════════════════════════════════════════════

  /** موظف الموازنة: اعتماد مبدئي */
  async function budgetPreApprove(resId, notes = '') {
    if (!confirm('هل تريد الاعتماد المبدئي وتحويل الحجز إلى الرئيس التنفيذي؟')) return;
    const res = await _post(`${API}?action=budget_preapprove`, { reservation_id: resId, notes });
    _handleActionResponse(res, 'تم الاعتماد المبدئي بنجاح ✅');
  }

  /** موظف الموازنة: رفض */
  async function budgetReject(resId) {
    const reason = await _promptModal('رفض الحجز', 'سبب الرفض', 'رفض');
    if (reason === null) return;
    const res = await _post(`${API}?action=budget_reject`, { reservation_id: resId, rejection_reason: reason });
    _handleActionResponse(res, 'تم رفض الحجز');
  }

  /** الرئيس التنفيذي: اعتماد نهائي */
  async function ceoApprove(resId, notes = '') {
    if (!confirm('هل تريد الاعتماد النهائي للحجز؟ سيتم تفعيل المعاملة المالية المرتبطة تلقائياً.')) return;
    const res = await _post(`${API}?action=ceo_approve`, { reservation_id: resId, notes });
    _handleActionResponse(res, 'تم الاعتماد النهائي ✅');
  }

  /** الرئيس التنفيذي: رفض */
  async function ceoReject(resId) {
    const reason = await _promptModal('رفض الرئيس التنفيذي', 'سبب الرفض', 'رفض');
    if (reason === null) return;
    const res = await _post(`${API}?action=ceo_reject`, { reservation_id: resId, rejection_reason: reason });
    _handleActionResponse(res, 'تم رفض الحجز من الرئيس التنفيذي');
  }

  /** توجيه الحجز */
  function showForwardModal(resId) {
    state.forwardingResId = resId;
    document.getElementById('bw-forward-modal')?.remove();
    document.body.insertAdjacentHTML('beforeend', _buildForwardModal(resId));
    document.getElementById('bw-forward-modal').classList.add('bw-modal-open');
  }

  async function submitForward() {
    const resId = state.forwardingResId;
    const type = document.getElementById('bw-fwd-type')?.value;
    const to = document.getElementById('bw-fwd-to')?.value.trim();
    const notes = document.getElementById('bw-fwd-notes')?.value.trim();
    if (!type) return _toast('اختر نوع التوجيه', 'warning');
    if (!to) return _toast('أدخل جهة التوجيه', 'warning');
    const res = await _post(`${API}?action=forward`, {
      reservation_id: resId, forwarding_type: type, forwarded_to: to, notes,
    });
    document.getElementById('bw-forward-modal')?.remove();
    _handleActionResponse(res, `تم التوجيه (${type}) بنجاح`);
  }

  /** إعادة إرسال بعد الرفض */
  async function resubmit(resId) {
    const notes = await _promptModal('إعادة إرسال الحجز', 'ملاحظات التعديل (اختياري)', 'إعادة إرسال');
    if (notes === null) return;
    const res = await _post(`${API}?action=resubmit`, { reservation_id: resId, notes });
    _handleActionResponse(res, 'تمت إعادة الإرسال بنجاح — الحجز في قائمة المراجعة');
  }

  /** عرض Timeline تفصيلي */
  async function showTimeline(resId) {
    try {
      const data = await _get(`${API}?action=timeline&reservation_id=${resId}`);
      if (!data.success) return _toast(data.message, 'error');
      _renderTimelineModal(data);
    } catch (e) {
      _toast('تعذّر جلب السجل الزمني', 'error');
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════════════════════════

  function _buildMainLayout() {
    return `
<div class="bw-wrapper" dir="rtl">
  <!-- ── إحصائيات لوحة التحكم ── -->
  <div class="bw-stats-row" id="bw-stats-row">
    <div class="bw-stat-card bw-stat-loading">جاري التحميل...</div>
  </div>

  <!-- ── شريط الأدوات ── -->
  <div class="bw-toolbar">
    <div class="bw-filters">
      <select id="bw-filter-status" class="bw-select" onchange="BudgetWorkflow.loadReservations({status:this.value,page:1})">
        <option value="">كل الحالات</option>
        <option value="قيد المراجعة">قيد المراجعة</option>
        <option value="معتمد مبدئياً">معتمد مبدئياً</option>
        <option value="معتمد نهائياً">معتمد نهائياً</option>
        <option value="مرفوض">مرفوض</option>
        <option value="موجّه">موجّه</option>
        <option value="منفذ">منفذ</option>
      </select>
      <select id="bw-filter-stage" class="bw-select" onchange="BudgetWorkflow.loadReservations({workflow_stage:this.value,page:1})">
        <option value="">كل المراحل</option>
        <option value="budget_review">مراجعة الموازنة</option>
        <option value="ceo_review">اعتماد الرئيس التنفيذي</option>
        <option value="completed">مكتمل</option>
        <option value="rejected">مرفوض</option>
        <option value="forwarded">موجّه</option>
      </select>
      <input id="bw-search" type="text" placeholder="بحث بالرقم أو الغرض..." class="bw-input"
             onkeyup="if(event.key==='Enter') BudgetWorkflow.loadReservations({search:this.value,page:1})">
    </div>
    <div class="bw-toolbar-right">
      <button class="bw-btn bw-btn-primary" onclick="BudgetWorkflow.showCreateModal()">
        ＋ حجز جديد
      </button>
    </div>
  </div>

  <!-- ── جدول الحجوزات ── -->
  <div class="bw-table-wrap" id="bw-table-wrap">
    <div class="bw-loading">جاري التحميل...</div>
  </div>

  <!-- ── Pagination ── -->
  <div class="bw-pagination" id="bw-pagination"></div>
</div>`;
  }

  function _renderDashboardStats(data) {
    const s = data.stats || {};
    const el = document.getElementById('bw-stats-row');
    if (!el) return;

    const cards = [
      { label: 'إجمالي الحجوزات', value: s.total || 0, icon: '📊', color: '#6366f1' },
      { label: 'قيد مراجعة الموازنة', value: s.pending_budget || 0, icon: '⏳', color: '#f59e0b' },
      { label: 'بانتظار الرئيس التنفيذي', value: s.pending_ceo || 0, icon: '👔', color: '#3b82f6' },
      { label: 'معتمد نهائياً', value: s.final_approved || 0, icon: '✅', color: '#10b981' },
      { label: 'مرفوض', value: s.rejected || 0, icon: '❌', color: '#ef4444' },
      { label: 'إجمالي المبالغ (ريال)', value: _fmtMoney(s.total_sar), icon: '💰', color: '#8b5cf6', wide: true },
    ];

    el.innerHTML = cards.map(c => `
            <div class="bw-stat-card ${c.wide ? 'bw-stat-wide' : ''}" style="--card-color:${c.color}">
                <span class="bw-stat-icon">${c.icon}</span>
                <span class="bw-stat-value">${c.value}</span>
                <span class="bw-stat-label">${c.label}</span>
            </div>
        `).join('');

    // SLA Performance
    const sla = data.sla_performance || [];
    if (sla.length) {
      el.insertAdjacentHTML('afterend', `
                <div class="bw-sla-bar">
                    <span class="bw-sla-title">⏱ أداء SLA:</span>
                    ${sla.map(s => `
                        <span class="bw-sla-item">
                            ${_stageLabel(s.stage_name)}:
                            <b>${(+s.avg_hours || 0).toFixed(1)} ساعة متوسط</b>
                            ${s.still_open > 0 ? `<em class="bw-sla-open">(${s.still_open} مفتوح)</em>` : ''}
                        </span>
                    `).join('')}
                </div>
            `);
    }
  }

  function _renderReservationsList(rows, stats, pagination) {
    const wrap = document.getElementById('bw-table-wrap');
    if (!wrap) return;

    if (!rows.length) {
      wrap.innerHTML = '<div class="bw-empty">لا توجد حجوزات تطابق البحث</div>';
      return;
    }

    wrap.innerHTML = `
        <table class="bw-table">
          <thead>
            <tr>
              <th>رقم الحجز</th>
              <th>المعاملة المالية</th>
              <th>الغرض</th>
              <th>القسم</th>
              <th>المرحلة</th>
              <th>الحالة</th>
              <th>المبلغ</th>
              <th>تاريخ الإنشاء</th>
              <th>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => _buildRow(r)).join('')}
          </tbody>
        </table>`;

    _renderPagination(pagination);
  }

  function _buildRow(r) {
    const sc = STATUS_CONFIG[r.status] || { color: '#6b7280', bg: '#f3f4f6', icon: '❓' };
    const stageEl = _buildStepperMini(r.workflow_stage);
    const actions = _buildRowActions(r);

    // SLA indicator
    const hours = parseInt(r.hours_in_stage) || 0;
    const slaWarn = hours > 48 ? 'bw-sla-overdue' : hours > 24 ? 'bw-sla-warning' : '';

    return `
        <tr class="bw-row ${slaWarn}" data-id="${r.id}">
          <td>
            <a class="bw-link" onclick="BudgetWorkflow.showDetail(${r.id})">
              ${_esc(r.reservation_number)}
            </a>
            ${hours > 24 ? `<span class="bw-sla-badge" title="${hours} ساعة في المرحلة الحالية">⏰ ${hours}h</span>` : ''}
          </td>
          <td>
            ${r.transaction_number
        ? `<span class="bw-tx-badge">${_esc(r.transaction_number)}</span>`
        : '<span class="bw-muted">—</span>'}
          </td>
          <td title="${_esc(r.purpose)}">${_trunc(r.purpose, 35)}</td>
          <td>${_esc(r.department_name || '—')}</td>
          <td>${stageEl}</td>
          <td>
            <span class="bw-status-badge"
                  style="color:${sc.color};background:${sc.bg}">
              ${sc.icon} ${_esc(r.status)}
            </span>
          </td>
          <td class="bw-money">${_fmtMoney(r.grand_total_sar)} ﷼</td>
          <td class="bw-muted">${_fmtDate(r.created_at)}</td>
          <td class="bw-actions">${actions}</td>
        </tr>`;
  }

  function _buildRowActions(r) {
    const btns = [];

    btns.push(`<button class="bw-btn-icon" title="التفاصيل"
            onclick="BudgetWorkflow.showDetail(${r.id})">🔍</button>`);

    btns.push(`<button class="bw-btn-icon" title="السجل الزمني"
            onclick="BudgetWorkflow.showTimeline(${r.id})">📅</button>`);

    // إجراءات موظف الموازنة
    if (state.isBudgetOfficer && r.status === 'قيد المراجعة') {
      btns.push(`<button class="bw-btn-action bw-btn-approve"
                onclick="BudgetWorkflow.budgetPreApprove(${r.id})">اعتماد مبدئي</button>`);
      btns.push(`<button class="bw-btn-action bw-btn-reject"
                onclick="BudgetWorkflow.budgetReject(${r.id})">رفض</button>`);
      btns.push(`<button class="bw-btn-action bw-btn-forward"
                onclick="BudgetWorkflow.showForwardModal(${r.id})">توجيه</button>`);
    }

    // إجراءات الرئيس التنفيذي
    if (state.isCEO && r.status === 'معتمد مبدئياً') {
      btns.push(`<button class="bw-btn-action bw-btn-final-approve"
                onclick="BudgetWorkflow.ceoApprove(${r.id})">اعتماد نهائي</button>`);
      btns.push(`<button class="bw-btn-action bw-btn-reject"
                onclick="BudgetWorkflow.ceoReject(${r.id})">رفض</button>`);
      btns.push(`<button class="bw-btn-action bw-btn-forward"
                onclick="BudgetWorkflow.showForwardModal(${r.id})">توجيه</button>`);
    }

    // إعادة إرسال للمرفوضة والموجّهة
    if (r.status === 'مرفوض' || r.status === 'موجّه') {
      btns.push(`<button class="bw-btn-action bw-btn-resubmit"
                onclick="BudgetWorkflow.resubmit(${r.id})">إعادة إرسال</button>`);
    }

    return btns.join('');
  }

  function _buildStepperMini(stage) {
    const map = { budget_review: 0, ceo_review: 1, completed: 2, rejected: -1, forwarded: -2 };
    const idx = map[stage] ?? -3;

    if (idx === -1) return '<span class="bw-stage-badge bw-stage-rejected">❌ مرفوض</span>';
    if (idx === -2) return '<span class="bw-stage-badge bw-stage-forwarded">↗️ موجّه</span>';

    return `<div class="bw-stepper-mini">
            ${STAGES.map((s, i) => `
                <span class="bw-step-dot ${i < idx ? 'done' : i === idx ? 'active' : ''}"
                      title="${s.label}" style="--step-color:${s.color}">${s.icon}</span>
                ${i < STAGES.length - 1 ? `<span class="bw-step-line ${i < idx ? 'done' : ''}"></span>` : ''}
            `).join('')}
        </div>`;
  }

  function _buildForwardModal(resId) {
    const opts = FORWARDING_TYPES.map(t =>
      `<option value="${t.value}">${t.label} — ${t.desc}</option>`
    ).join('');

    return `
        <div id="bw-forward-modal" class="bw-modal-overlay" onclick="if(this===event.target)this.remove()">
          <div class="bw-modal-box">
            <div class="bw-modal-header">
              <h3>↗️ توجيه الحجز</h3>
              <button class="bw-modal-close" onclick="document.getElementById('bw-forward-modal').remove()">✕</button>
            </div>
            <div class="bw-modal-body">
              <div class="bw-field">
                <label>نوع التوجيه <span class="bw-req">*</span></label>
                <select id="bw-fwd-type" class="bw-select">
                  <option value="">— اختر نوع التوجيه —</option>
                  ${opts}
                </select>
              </div>
              <div class="bw-field">
                <label>الجهة أو المستخدم <span class="bw-req">*</span></label>
                <input id="bw-fwd-to" type="text" class="bw-input" placeholder="اسم الجهة أو المستخدم الذي يُوجَّه إليه الحجز">
              </div>
              <div class="bw-field">
                <label>ملاحظات</label>
                <textarea id="bw-fwd-notes" class="bw-textarea" rows="3" placeholder="أي ملاحظات أو تعليمات إضافية..."></textarea>
              </div>
            </div>
            <div class="bw-modal-footer">
              <button class="bw-btn bw-btn-primary" onclick="BudgetWorkflow.submitForward()">تأكيد التوجيه</button>
              <button class="bw-btn bw-btn-ghost" onclick="document.getElementById('bw-forward-modal').remove()">إلغاء</button>
            </div>
          </div>
        </div>`;
  }

  function _renderDetailModal(res) {
    document.getElementById('bw-detail-modal')?.remove();

    const sc = STATUS_CONFIG[res.status] || { color: '#6b7280', bg: '#f3f4f6', icon: '❓' };
    const stepper = _buildFullStepper(res);
    const items = (res.items || []).map((it, i) => `
            <tr>
                <td>${i + 1}</td>
                <td>${_esc(it.description)}</td>
                <td>${+it.qty} ${_esc(it.unit || '')}</td>
                <td>${_fmtMoney(it.unit_price)}</td>
                <td class="bw-money">${_fmtMoney(it.line_total)}</td>
            </tr>
        `).join('');

    const events = (res.workflow_events || []).map(ev => `
            <div class="bw-ev-item bw-ev-${ev.event_type}">
              <span class="bw-ev-icon">${_eventIcon(ev.event_type)}</span>
              <div class="bw-ev-body">
                <span class="bw-ev-actor">${_esc(ev.actor_name || '—')}</span>
                <span class="bw-ev-label">${_eventLabel(ev.event_type)}</span>
                ${ev.new_status ? `<span class="bw-ev-status">→ ${ev.new_status}</span>` : ''}
                ${ev.notes ? `<p class="bw-ev-notes">${_esc(ev.notes)}</p>` : ''}
              </div>
              <span class="bw-ev-time">${_fmtDate(ev.created_at, true)}</span>
            </div>
        `).join('');

    const actions = _buildDetailActions(res);

    document.body.insertAdjacentHTML('beforeend', `
        <div id="bw-detail-modal" class="bw-modal-overlay" onclick="if(this===event.target)this.remove()">
          <div class="bw-modal-box bw-modal-large">
            <div class="bw-modal-header">
              <h3>📋 ${_esc(res.reservation_number)} — ${_esc(res.purpose)}</h3>
              <button class="bw-modal-close" onclick="document.getElementById('bw-detail-modal').remove()">✕</button>
            </div>
            <div class="bw-modal-body bw-detail-grid">

              <!-- ── Stepper ── -->
              <div class="bw-detail-stepper">
                ${stepper}
              </div>

              <!-- ── معلومات الحجز ── -->
              <div class="bw-detail-info">
                <div class="bw-info-grid">
                  ${_infoRow('الحالة', `<span class="bw-status-badge" style="color:${sc.color};background:${sc.bg}">${sc.icon} ${res.status}</span>`)}
                  ${_infoRow('رقم المعاملة', res.transaction_number ? `<span class="bw-tx-badge">${res.transaction_number}</span>` : '—')}
                  ${_infoRow('القسم', res.department_name)}
                  ${_infoRow('مقدِّم الطلب', res.requested_by_name)}
                  ${_infoRow('بند الموازنة', res.budget_category)}
                  ${_infoRow('مركز التكلفة', res.cost_center)}
                  ${_infoRow('الأولوية', res.priority)}
                  ${_infoRow('المبلغ الإجمالي', `${_fmtMoney(res.grand_total)} ${res.currency}`)}
                  ${_infoRow('بالريال السعودي', `${_fmtMoney(res.grand_total_sar)} ﷼`)}
                  ${_infoRow('تاريخ الطلب', _fmtDate(res.request_date))}
                  ${res.rejection_reason ? _infoRow('سبب الرفض', `<span class="bw-reject-reason">${_esc(res.rejection_reason)}</span>`) : ''}
                </div>
              </div>

              <!-- ── الأصناف ── -->
              <div class="bw-detail-items">
                <h4>بنود الحجز</h4>
                <table class="bw-table bw-items-table">
                  <thead><tr><th>#</th><th>الوصف</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead>
                  <tbody>${items || '<tr><td colspan="5" class="bw-empty">لا توجد بنود</td></tr>'}</tbody>
                </table>
              </div>

              <!-- ── سجل الأحداث ── -->
              <div class="bw-detail-events">
                <h4>📅 سجل الأحداث</h4>
                <div class="bw-events-list">
                  ${events || '<div class="bw-empty">لا توجد أحداث</div>'}
                </div>
              </div>
            </div>

            <!-- ── إجراءات ── -->
            <div class="bw-modal-footer bw-detail-footer">
              ${actions}
              <button class="bw-btn bw-btn-ghost"
                onclick="BudgetWorkflow.showTimeline(${res.id})">📅 Timeline كامل</button>
              <button class="bw-btn bw-btn-ghost"
                onclick="document.getElementById('bw-detail-modal').remove()">إغلاق</button>
            </div>
          </div>
        </div>`);
  }

  function _buildFullStepper(res) {
    const map = { budget_review: 0, ceo_review: 1, completed: 2 };
    const curr = map[res.workflow_stage] ?? -1;
    const isRej = res.status === 'مرفوض';
    const isFwd = res.status === 'موجّه';

    if (isRej) return `<div class="bw-stepper-full bw-stepper-rejected">
            <div class="bw-step-rejected">❌ الحجز مرفوض
            ${res.rejection_reason ? `<p class="bw-reject-note">${_esc(res.rejection_reason)}</p>` : ''}
            </div></div>`;

    return `<div class="bw-stepper-full">
            ${STAGES.map((s, i) => {
      const done = i < curr;
      const active = i === curr;
      const cls = done ? 'bw-step-done' : active ? 'bw-step-active' : 'bw-step-pending';
      return `
                <div class="bw-step-item ${cls}" style="--step-color:${s.color}">
                  <div class="bw-step-circle">${done ? '✓' : s.icon}</div>
                  <div class="bw-step-info">
                    <span class="bw-step-label">${s.label}</span>
                    <span class="bw-step-desc">${s.description}</span>
                    ${active && isFwd ? '<span class="bw-step-note">↗️ موجّه</span>' : ''}
                  </div>
                  ${i < STAGES.length - 1 ? '<div class="bw-step-connector"></div>' : ''}
                </div>`;
    }).join('')}
        </div>`;
  }

  function _renderTimelineModal(data) {
    document.getElementById('bw-timeline-modal')?.remove();
    const res = data.reservation || {};
    const evts = data.events || [];
    const sla = data.sla_tracking || [];
    const durs = data.stage_durations || [];
    const fwds = data.forwards || [];

    const slaHtml = durs.map(d => `
            <div class="bw-sla-row ${d.still_open ? 'bw-sla-open' : 'bw-sla-closed'}">
              <span class="bw-sla-stage">${_stageLabel(d.stage)}</span>
              <span class="bw-sla-hours">${(+d.total_hours || 0).toFixed(1)} ساعة</span>
              <span class="bw-sla-status">${d.still_open ? '🔵 جارية' : '✅ منتهية'}</span>
            </div>
        `).join('');

    const fwdHtml = fwds.map(f => `
            <div class="bw-fwd-row">
              <span class="bw-fwd-type">${f.forwarding_type}</span>
              <span class="bw-fwd-to">إلى: ${_esc(f.forwarded_to)}</span>
              <span class="bw-fwd-by">بواسطة: ${_esc(f.forwarded_by_name)}</span>
              <span class="bw-fwd-status bw-fwd-status-${f.status === 'مغلق' ? 'closed' : 'open'}">${f.status}</span>
              <span class="bw-fwd-date">${_fmtDate(f.created_at, true)}</span>
            </div>
        `).join('');

    document.body.insertAdjacentHTML('beforeend', `
        <div id="bw-timeline-modal" class="bw-modal-overlay" onclick="if(this===event.target)this.remove()">
          <div class="bw-modal-box bw-modal-large">
            <div class="bw-modal-header">
              <h3>📅 السجل الزمني — ${_esc(res.reservation_number || '')}</h3>
              <button class="bw-modal-close" onclick="document.getElementById('bw-timeline-modal').remove()">✕</button>
            </div>
            <div class="bw-modal-body">

              <!-- SLA Summary -->
              <div class="bw-sla-summary">
                <h4>⏱ مدة كل مرحلة (SLA)</h4>
                ${slaHtml || '<div class="bw-empty">لا يوجد تتبع SLA</div>'}
              </div>

              <!-- Timeline Events -->
              <div class="bw-timeline">
                <h4>📜 سجل الأحداث الكامل</h4>
                <div class="bw-timeline-list">
                  ${evts.map(ev => `
                    <div class="bw-tl-item bw-tl-${ev.event_type}">
                      <div class="bw-tl-dot">${_eventIcon(ev.event_type)}</div>
                      <div class="bw-tl-content">
                        <div class="bw-tl-header">
                          <span class="bw-tl-actor">${_esc(ev.actor_name || ev.actor_display_name || '—')}</span>
                          <span class="bw-tl-action">${_eventLabel(ev.event_type)}</span>
                          <span class="bw-tl-time">${_fmtDate(ev.created_at, true)}</span>
                        </div>
                        ${ev.old_status && ev.new_status ? `<div class="bw-tl-status-change">
                          <span class="bw-tl-old">${ev.old_status}</span>
                          <span>→</span>
                          <span class="bw-tl-new">${ev.new_status}</span>
                        </div>` : ''}
                        ${ev.notes ? `<p class="bw-tl-notes">${_esc(ev.notes)}</p>` : ''}
                        ${ev.forwarding_type ? `<div class="bw-tl-fwd">↗️ توجيه ${ev.forwarding_type} إلى: ${_esc(ev.forwarding_to || '')}</div>` : ''}
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>

              <!-- Forwarding Records -->
              ${fwds.length ? `<div class="bw-fwd-records">
                <h4>↗️ سجل التوجيهات</h4>
                ${fwdHtml}
              </div>` : ''}
            </div>
            <div class="bw-modal-footer">
              <button class="bw-btn bw-btn-ghost" onclick="document.getElementById('bw-timeline-modal').remove()">إغلاق</button>
            </div>
          </div>
        </div>`);
  }

  function _buildDetailActions(res) {
    const btns = [];

    if (state.isBudgetOfficer && res.status === 'قيد المراجعة') {
      btns.push(`<button class="bw-btn bw-btn-approve" onclick="BudgetWorkflow.budgetPreApprove(${res.id});document.getElementById('bw-detail-modal').remove()">✅ اعتماد مبدئي</button>`);
      btns.push(`<button class="bw-btn bw-btn-reject"  onclick="BudgetWorkflow.budgetReject(${res.id})">❌ رفض</button>`);
      btns.push(`<button class="bw-btn bw-btn-forward" onclick="BudgetWorkflow.showForwardModal(${res.id})">↗️ توجيه</button>`);
    }

    if (state.isCEO && res.status === 'معتمد مبدئياً') {
      btns.push(`<button class="bw-btn bw-btn-final-approve" onclick="BudgetWorkflow.ceoApprove(${res.id});document.getElementById('bw-detail-modal').remove()">🏆 اعتماد نهائي</button>`);
      btns.push(`<button class="bw-btn bw-btn-reject" onclick="BudgetWorkflow.ceoReject(${res.id})">❌ رفض</button>`);
      btns.push(`<button class="bw-btn bw-btn-forward" onclick="BudgetWorkflow.showForwardModal(${res.id})">↗️ توجيه</button>`);
    }

    if (res.status === 'مرفوض' || res.status === 'موجّه') {
      btns.push(`<button class="bw-btn bw-btn-resubmit" onclick="BudgetWorkflow.resubmit(${res.id})">🔄 إعادة إرسال</button>`);
    }

    return btns.join('');
  }

  function _renderPagination(pg) {
    const el = document.getElementById('bw-pagination');
    if (!el || !pg) return;
    if (pg.pages <= 1) { el.innerHTML = ''; return; }

    const curr = pg.page;
    const max = pg.pages;
    let html = `<div class="bw-pag">`;
    html += `<button class="bw-pag-btn" ${curr <= 1 ? 'disabled' : ''} onclick="BudgetWorkflow.loadReservations({page:${curr - 1}})">◀ السابق</button>`;
    for (let p = Math.max(1, curr - 2); p <= Math.min(max, curr + 2); p++) {
      html += `<button class="bw-pag-btn ${p === curr ? 'bw-pag-active' : ''}" onclick="BudgetWorkflow.loadReservations({page:${p}})">${p}</button>`;
    }
    html += `<button class="bw-pag-btn" ${curr >= max ? 'disabled' : ''} onclick="BudgetWorkflow.loadReservations({page:${curr + 1}})">التالي ▶</button>`;
    html += `<span class="bw-pag-info">${pg.total} سجل — صفحة ${curr} من ${max}</span>`;
    html += '</div>';
    el.innerHTML = html;
  }

  // ══════════════════════════════════════════════════════════════
  //  HELPERS
  // ══════════════════════════════════════════════════════════════

  async function _get(url) {
    const r = await fetch(url, { credentials: 'same-origin' });
    return r.json();
  }

  async function _post(url, body) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body),
    });
    return r.json();
  }

  function _handleActionResponse(res, successMsg) {
    if (res.success) {
      _toast(res.message || successMsg, 'success');
      loadReservations();
      loadDashboardStats();
    } else {
      _toast(res.message || 'حدث خطأ', 'error');
    }
  }

  function _promptModal(title, label, confirmLabel) {
    return new Promise(resolve => {
      document.getElementById('bw-prompt-modal')?.remove();
      const id = 'bw-prompt-modal';
      document.body.insertAdjacentHTML('beforeend', `
            <div id="${id}" class="bw-modal-overlay">
              <div class="bw-modal-box bw-modal-sm">
                <div class="bw-modal-header"><h4>${title}</h4></div>
                <div class="bw-modal-body">
                  <label>${label}</label>
                  <textarea id="bw-prompt-val" class="bw-textarea" rows="3" style="width:100%"></textarea>
                </div>
                <div class="bw-modal-footer">
                  <button class="bw-btn bw-btn-primary" id="bw-prompt-ok">${confirmLabel}</button>
                  <button class="bw-btn bw-btn-ghost" id="bw-prompt-cancel">إلغاء</button>
                </div>
              </div>
            </div>`);
      document.getElementById('bw-prompt-ok').onclick = () => {
        const val = document.getElementById('bw-prompt-val').value.trim();
        document.getElementById(id).remove();
        resolve(val);
      };
      document.getElementById('bw-prompt-cancel').onclick = () => {
        document.getElementById(id).remove();
        resolve(null);
      };
    });
  }

  function _attachEventListeners(el) {
    // الأحداث العامة مُرتبطة عبر onclick في الـ HTML المولَّد
  }

  function _setLoading(on) {
    const el = document.getElementById('bw-table-wrap');
    if (on && el) el.innerHTML = '<div class="bw-loading">⏳ جاري التحميل...</div>';
  }

  function _toast(msg, type = 'info') {
    const id = 'bw-toast-' + Date.now();
    const cls = { success: '#10b981', error: '#ef4444', warning: '#f59e0b', info: '#3b82f6' };
    const div = document.createElement('div');
    div.id = id;
    div.style.cssText = `
            position:fixed;bottom:1.5rem;left:1.5rem;z-index:9999;
            background:${cls[type] || cls.info};color:#fff;
            padding:.75rem 1.25rem;border-radius:.5rem;
            font-family:inherit;font-size:.9rem;direction:rtl;
            box-shadow:0 4px 12px rgba(0,0,0,.2);
            animation:bwToastIn .3s ease;`;
    div.textContent = msg;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 4000);
  }

  function _infoRow(label, value) {
    return `<div class="bw-info-row">
            <span class="bw-info-label">${label}:</span>
            <span class="bw-info-value">${value || '—'}</span>
        </div>`;
  }

  function _eventIcon(type) {
    const map = {
      create: '📝',
      budget_preapprove: '✅',
      budget_reject: '❌',
      ceo_approve: '🏆',
      ceo_reject: '🚫',
      forward: '↗️',
      resubmit: '🔄',
      edit: '✏️',
    };
    return map[type] || '📌';
  }

  function _eventLabel(type) {
    const map = {
      create: 'إنشاء الحجز',
      budget_preapprove: 'اعتماد مبدئي (موظف الموازنة)',
      budget_reject: 'رفض (موظف الموازنة)',
      ceo_approve: 'اعتماد نهائي (الرئيس التنفيذي)',
      ceo_reject: 'رفض (الرئيس التنفيذي)',
      forward: 'توجيه',
      resubmit: 'إعادة إرسال',
      edit: 'تعديل',
    };
    return map[type] || type;
  }

  function _stageLabel(stage) {
    const map = { budget_review: 'مراجعة الموازنة', ceo_review: 'اعتماد الرئيس', completed: 'مكتمل', rejected: 'مرفوض', forwarded: 'موجّه', resubmit: 'إعادة إرسال' };
    return map[stage] || stage;
  }

  function _fmtMoney(v) {
    const n = parseFloat(v) || 0;
    return n.toLocaleString('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function _fmtDate(d, withTime = false) {
    if (!d) return '—';
    const dt = new Date(d);
    if (isNaN(dt)) return d;
    const dateStr = dt.toLocaleDateString('ar-SA', { year: 'numeric', month: '2-digit', day: '2-digit' });
    if (!withTime) return dateStr;
    const timeStr = dt.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
    return `${dateStr} ${timeStr}`;
  }

  function _esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function _trunc(str, len) {
    if (!str) return '—';
    return str.length > len ? str.slice(0, len) + '...' : str;
  }

  // ══════════════════════════════════════════════════════════════
  //  CSS مُضمَّن
  // ══════════════════════════════════════════════════════════════
  function _injectCSS() {
    if (document.getElementById('bw-styles')) return;
    const s = document.createElement('style');
    s.id = 'bw-styles';
    s.textContent = `
/* ── Wrapper ── */
.bw-wrapper { font-family: var(--font-primary); direction: rtl; color: #1e293b; }

/* ── Stats Row ── */
.bw-stats-row { display: flex; gap: .75rem; flex-wrap: wrap; margin-bottom: 1.25rem; }
.bw-stat-card {
    flex: 1; min-width: 120px; padding: 1rem;
    background: #fff; border-radius: .75rem;
    box-shadow: 0 1px 4px rgba(0,0,0,.08);
    display: flex; flex-direction: column; align-items: center; gap: .25rem;
    border-top: 3px solid var(--card-color, #6366f1);
}
.bw-stat-wide { flex: 2; }
.bw-stat-icon  { font-size: 1.5rem; }
.bw-stat-value { font-size: 1.5rem; font-weight: 700; color: var(--card-color, #1e293b); }
.bw-stat-label { font-size: .75rem; color: #64748b; text-align: center; }
.bw-stat-loading { color: #94a3b8; justify-content: center; padding: 1.5rem; }

/* ── SLA Bar ── */
.bw-sla-bar {
    display: flex; gap: 1rem; flex-wrap: wrap; align-items: center;
    background: #f8fafc; border: 1px solid #e2e8f0; border-radius: .5rem;
    padding: .5rem 1rem; margin-bottom: 1rem; font-size: .8rem; color: #475569;
}
.bw-sla-title { font-weight: 600; color: #334155; }
.bw-sla-item  { display: flex; gap: .25rem; align-items: center; }
.bw-sla-open  { color: #f59e0b; font-style: normal; }

/* ── Toolbar ── */
.bw-toolbar {
    display: flex; align-items: center; justify-content: space-between;
    gap: .75rem; flex-wrap: wrap; margin-bottom: 1rem;
}
.bw-filters { display: flex; gap: .5rem; flex-wrap: wrap; }
.bw-select  { padding: .4rem .75rem; border: 1px solid #cbd5e1; border-radius: .5rem; font-size: .875rem; background: #fff; }
.bw-input   { padding: .4rem .75rem; border: 1px solid #cbd5e1; border-radius: .5rem; font-size: .875rem; min-width: 200px; }
.bw-textarea{ padding: .5rem .75rem; border: 1px solid #cbd5e1; border-radius: .5rem; font-size: .875rem; resize: vertical; }

/* ── Buttons ── */
.bw-btn { padding: .5rem 1rem; border: none; border-radius: .5rem; cursor: pointer; font-size: .875rem; font-family: inherit; transition: opacity .15s; }
.bw-btn:hover { opacity: .85; }
.bw-btn-primary      { background: #3b82f6; color: #fff; }
.bw-btn-approve      { background: #10b981; color: #fff; }
.bw-btn-final-approve{ background: #059669; color: #fff; font-weight: 700; }
.bw-btn-reject       { background: #ef4444; color: #fff; }
.bw-btn-forward      { background: #0891b2; color: #fff; }
.bw-btn-resubmit     { background: #7c3aed; color: #fff; }
.bw-btn-ghost        { background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; }
.bw-btn-icon { background: none; border: none; cursor: pointer; font-size: 1rem; padding: .25rem; }
.bw-btn-action { padding: .3rem .65rem; font-size: .75rem; border: none; border-radius: .375rem; cursor: pointer; margin: .1rem; }
.bw-btn-action.bw-btn-approve      { background: #d1fae5; color: #065f46; }
.bw-btn-action.bw-btn-final-approve{ background: #a7f3d0; color: #064e3b; font-weight: 600; }
.bw-btn-action.bw-btn-reject       { background: #fee2e2; color: #991b1b; }
.bw-btn-action.bw-btn-forward      { background: #cffafe; color: #155e75; }
.bw-btn-action.bw-btn-resubmit     { background: #ede9fe; color: #5b21b6; }

/* ── Table ── */
.bw-table-wrap { overflow-x: auto; border-radius: .75rem; box-shadow: 0 1px 4px rgba(0,0,0,.08); }
.bw-table { width: 100%; border-collapse: collapse; background: #fff; font-size: .875rem; }
.bw-table th { background: #f8fafc; padding: .75rem 1rem; text-align: right; font-weight: 600; color: #475569; border-bottom: 2px solid #e2e8f0; white-space: nowrap; }
.bw-table td { padding: .65rem 1rem; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
.bw-row:hover td { background: #f8fafc; }
.bw-row.bw-sla-warning td:first-child { border-right: 3px solid #f59e0b; }
.bw-row.bw-sla-overdue  td:first-child { border-right: 3px solid #ef4444; }
.bw-link { color: #3b82f6; cursor: pointer; text-decoration: none; font-weight: 500; }
.bw-link:hover { text-decoration: underline; }
.bw-money { font-variant-numeric: tabular-nums; text-align: right; font-weight: 500; }
.bw-muted { color: #94a3b8; font-size: .8rem; }
.bw-actions { white-space: nowrap; }

/* ── Status & Stage Badges ── */
.bw-status-badge { display: inline-flex; align-items: center; gap: .25rem; padding: .25rem .6rem; border-radius: 999px; font-size: .75rem; font-weight: 500; }
.bw-tx-badge { display: inline-block; background: #eff6ff; color: #1d4ed8; padding: .2rem .5rem; border-radius: .375rem; font-size: .75rem; font-family: var(--font-primary); }
.bw-sla-badge { display: inline-block; background: #fef3c7; color: #92400e; padding: .1rem .35rem; border-radius: .25rem; font-size: .7rem; margin-right: .25rem; }
.bw-stage-badge { display: inline-flex; align-items: center; gap: .25rem; font-size: .75rem; padding: .2rem .5rem; border-radius: .375rem; }
.bw-stage-rejected  { background: #fee2e2; color: #991b1b; }
.bw-stage-forwarded { background: #ecfeff; color: #155e75; }

/* ── Stepper Mini ── */
.bw-stepper-mini { display: flex; align-items: center; gap: .15rem; }
.bw-step-dot { font-size: .85rem; width: 1.5rem; height: 1.5rem; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: #f1f5f9; border: 2px solid #e2e8f0; }
.bw-step-dot.active { border-color: var(--step-color); background: color-mix(in srgb, var(--step-color) 10%, white); }
.bw-step-dot.done   { background: var(--step-color); border-color: var(--step-color); filter: brightness(1.1); }
.bw-step-line { flex: 1; height: 2px; background: #e2e8f0; min-width: 10px; }
.bw-step-line.done { background: var(--step-color, #10b981); }

/* ── Stepper Full ── */
.bw-stepper-full { display: flex; gap: 0; margin-bottom: 1.5rem; position: relative; }
.bw-step-item { display: flex; flex-direction: column; align-items: center; flex: 1; position: relative; }
.bw-step-circle {
    width: 2.5rem; height: 2.5rem; border-radius: 50%;
    display: flex; align-items: center; justify-content: center; font-size: 1.1rem;
    border: 3px solid #e2e8f0; background: #f8fafc; z-index: 1;
    transition: all .3s;
}
.bw-step-active .bw-step-circle { border-color: var(--step-color); background: color-mix(in srgb, var(--step-color) 15%, white); }
.bw-step-done   .bw-step-circle { border-color: var(--step-color); background: var(--step-color); color: #fff; }
.bw-step-info { text-align: center; margin-top: .5rem; padding: 0 .5rem; }
.bw-step-label { display: block; font-size: .8rem; font-weight: 600; color: #334155; }
.bw-step-desc  { display: block; font-size: .7rem; color: #94a3b8; margin-top: .2rem; }
.bw-step-note  { display: block; font-size: .7rem; color: #0891b2; }
.bw-step-connector {
    position: absolute; top: 1.25rem; right: 50%; width: 100%; height: 3px;
    background: #e2e8f0; z-index: 0;
}
.bw-step-done .bw-step-connector { background: var(--step-color, #10b981); }
.bw-stepper-rejected .bw-step-rejected { padding: 1rem; text-align: center; color: #dc2626; font-weight: 600; background: #fef2f2; border-radius: .75rem; width: 100%; }
.bw-reject-note { font-weight: 400; font-size: .85rem; margin-top: .5rem; color: #7f1d1d; }

/* ── Events ── */
.bw-events-list { display: flex; flex-direction: column; gap: .5rem; max-height: 300px; overflow-y: auto; }
.bw-ev-item { display: flex; gap: .75rem; align-items: flex-start; padding: .5rem .75rem; border-radius: .5rem; background: #f8fafc; }
.bw-ev-icon   { font-size: 1.1rem; flex-shrink: 0; }
.bw-ev-body   { flex: 1; }
.bw-ev-actor  { font-weight: 600; font-size: .85rem; }
.bw-ev-label  { font-size: .8rem; color: #64748b; margin-right: .4rem; }
.bw-ev-status { font-size: .75rem; background: #eff6ff; color: #1d4ed8; padding: .1rem .4rem; border-radius: .25rem; margin-right: .25rem; }
.bw-ev-notes  { font-size: .8rem; color: #64748b; margin: .25rem 0 0; }
.bw-ev-time   { font-size: .75rem; color: #94a3b8; white-space: nowrap; flex-shrink: 0; }

/* ── Timeline ── */
.bw-timeline-list { display: flex; flex-direction: column; gap: 0; position: relative; }
.bw-tl-item { display: flex; gap: 1rem; padding: .75rem 0; border-right: 2px solid #e2e8f0; margin-right: 1rem; }
.bw-tl-dot { width: 2rem; height: 2rem; border-radius: 50%; background: #f1f5f9; display: flex; align-items: center; justify-content: center; margin-right: -1.05rem; flex-shrink: 0; font-size: .9rem; border: 2px solid #e2e8f0; }
.bw-tl-content { flex: 1; padding: 0 .75rem; }
.bw-tl-header { display: flex; gap: .5rem; flex-wrap: wrap; align-items: center; margin-bottom: .25rem; }
.bw-tl-actor { font-weight: 600; font-size: .875rem; }
.bw-tl-action { color: #64748b; font-size: .8rem; }
.bw-tl-time  { color: #94a3b8; font-size: .75rem; margin-right: auto; }
.bw-tl-status-change { display: flex; gap: .5rem; align-items: center; font-size: .8rem; }
.bw-tl-old { color: #dc2626; text-decoration: line-through; }
.bw-tl-new { color: #059669; font-weight: 500; }
.bw-tl-notes { font-size: .8rem; color: #64748b; margin: .25rem 0 0; }
.bw-tl-fwd { font-size: .8rem; color: #0891b2; background: #ecfeff; padding: .2rem .5rem; border-radius: .25rem; display: inline-block; margin-top: .25rem; }

/* ── SLA Summary ── */
.bw-sla-summary { margin-bottom: 1.5rem; }
.bw-sla-row { display: flex; gap: 1rem; align-items: center; padding: .5rem .75rem; border-radius: .5rem; margin-bottom: .35rem; }
.bw-sla-open   { background: #fffbeb; border: 1px solid #fde68a; }
.bw-sla-closed { background: #ecfdf5; border: 1px solid #a7f3d0; }
.bw-sla-stage { font-weight: 600; font-size: .875rem; flex: 1; }
.bw-sla-hours { font-variant-numeric: tabular-nums; font-weight: 500; }
.bw-sla-status { font-size: .8rem; }

/* ── Forwarding Records ── */
.bw-fwd-records { margin-top: 1.5rem; }
.bw-fwd-row { display: flex; gap: 1rem; align-items: center; padding: .5rem .75rem; background: #f8fafc; border-radius: .5rem; margin-bottom: .35rem; font-size: .8rem; flex-wrap: wrap; }
.bw-fwd-type { background: #cffafe; color: #155e75; padding: .1rem .5rem; border-radius: .25rem; font-weight: 600; }
.bw-fwd-status-open   { color: #d97706; }
.bw-fwd-status-closed { color: #059669; }

/* ── Info Grid ── */
.bw-info-grid { display: grid; gap: .5rem; }
.bw-info-row  { display: flex; gap: .5rem; align-items: flex-start; font-size: .875rem; }
.bw-info-label { color: #64748b; min-width: 120px; flex-shrink: 0; }
.bw-info-value { font-weight: 500; }
.bw-reject-reason { color: #dc2626; background: #fef2f2; padding: .2rem .5rem; border-radius: .25rem; font-size: .8rem; }

/* ── Modal ── */
.bw-modal-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 9000;
    display: flex; align-items: center; justify-content: center; padding: 1rem;
    animation: bwFadeIn .2s ease;
}
.bw-modal-box {
    background: #fff; border-radius: 1rem; max-height: 90vh; overflow-y: auto;
    width: 100%; max-width: 500px; box-shadow: 0 20px 60px rgba(0,0,0,.2);
    animation: bwSlideUp .25s ease;
}
.bw-modal-large { max-width: 860px; }
.bw-modal-sm    { max-width: 400px; }
.bw-modal-header { display: flex; align-items: center; justify-content: space-between; padding: 1rem 1.25rem; border-bottom: 1px solid #f1f5f9; }
.bw-modal-header h3, .bw-modal-header h4 { margin: 0; font-size: 1rem; font-weight: 700; }
.bw-modal-close { background: none; border: none; font-size: 1.25rem; cursor: pointer; color: #94a3b8; }
.bw-modal-body { padding: 1.25rem; }
.bw-modal-footer { display: flex; gap: .75rem; flex-wrap: wrap; padding: 1rem 1.25rem; border-top: 1px solid #f1f5f9; background: #f8fafc; border-radius: 0 0 1rem 1rem; }

/* ── Detail Grid ── */
.bw-detail-grid { display: grid; gap: 1.25rem; }
.bw-detail-stepper { grid-column: 1 / -1; }
.bw-detail-info    {}
.bw-detail-items   {}
.bw-detail-events  {}
.bw-items-table    { font-size: .8rem; }
.bw-detail-footer  { flex-wrap: wrap; }

/* ── Field ── */
.bw-field { margin-bottom: 1rem; }
.bw-field label { display: block; font-size: .875rem; font-weight: 500; margin-bottom: .35rem; color: #374151; }
.bw-field .bw-select, .bw-field .bw-input, .bw-field .bw-textarea { width: 100%; }
.bw-req { color: #ef4444; }

/* ── Pagination ── */
.bw-pag { display: flex; gap: .4rem; align-items: center; justify-content: center; flex-wrap: wrap; padding: 1rem; }
.bw-pag-btn { padding: .4rem .75rem; border: 1px solid #e2e8f0; border-radius: .5rem; background: #fff; cursor: pointer; font-size: .85rem; }
.bw-pag-btn:disabled { opacity: .4; cursor: not-allowed; }
.bw-pag-active { background: #3b82f6; color: #fff; border-color: #3b82f6; }
.bw-pag-info { color: #64748b; font-size: .8rem; margin-right: .5rem; }

/* ── Loading / Empty ── */
.bw-loading { padding: 3rem; text-align: center; color: #94a3b8; font-size: 1rem; }
.bw-empty   { padding: 2rem; text-align: center; color: #94a3b8; }

/* ── Animations ── */
@keyframes bwFadeIn   { from { opacity: 0; } to { opacity: 1; } }
@keyframes bwSlideUp  { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
@keyframes bwToastIn  { from { transform: translateX(-20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        `;
    document.head.appendChild(s);
  }

  // إضافة CSS عند تحميل الملف
  _injectCSS();

  // ══════════════════════════════════════════════════════════════
  //  PUBLIC EXPORTS
  // ══════════════════════════════════════════════════════════════
  return {
    init,
    showDetail,
    showTimeline,
    showCreateModal: () => _toast('استخدام نموذج الإنشاء الرئيسي للنظام', 'info'),
    loadReservations: (f = {}) => {
      Object.assign(state.filters, f);
      return loadReservations();
    },
    loadDashboardStats,
    budgetPreApprove,
    budgetReject,
    ceoApprove,
    ceoReject,
    showForwardModal,
    submitForward,
    resubmit,
    getState: () => state,
  };
})();

// تعريض للـ global scope
window.BudgetWorkflow = BudgetWorkflow;