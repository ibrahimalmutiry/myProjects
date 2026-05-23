// ════════════════════════════════════════════════════════════════════
//  app-samples.js — Sample Tracking Workflow System (نظام تتبع العينات)
//  API: api/samples_api.php
//  دورة الحياة: طلب جديد → عمليات → تخطيط → إنتاج → جودة → جاهز → إرسال → تسليم
// ════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  const API = 'api/samples_api.php';

  // ── الحالة العامة ──────────────────────────────────────────────────
  const S = {
    list: [], stats: {}, selected: null, events: [], attachments: [], timeline: [],
    canCreate: false,
    page: 1, totalPages: 1,
    filters: { search: '', stage: '', priority: '', overdue: '' },
  };

  // ── خريطة المراحل (مطابقة للـ Backend) ──────────────────────────────
  const STAGE = {
    new_request: { ar: 'طلب جديد', color: 'blue', icon: '📝' },
    operations_review: { ar: 'مراجعة وتخطيط العمليات', color: 'yellow', icon: '🔍' },
    production: { ar: 'الإنتاج', color: 'yellow', icon: '🏭' },
    quality_check: { ar: 'فحص الجودة', color: 'yellow', icon: '🧪' },
    ready_for_dispatch: { ar: 'جاهزة للإرسال', color: 'green', icon: '📦' },
    dispatched: { ar: 'تم الإرسال', color: 'green', icon: '🚚' },
    delivered: { ar: 'تم التسليم', color: 'green', icon: '✅' },
    need_modification: { ar: 'تحتاج تعديل', color: 'yellow', icon: '✏️' },
    rejected: { ar: 'مرفوضة', color: 'red', icon: '❌' },
  };
  const STAGE_ORDER = ['new_request', 'operations_review', 'production',
    'quality_check', 'ready_for_dispatch', 'dispatched', 'delivered'];

  const PRIORITY = {
    low: { ar: 'منخفضة', cls: 'smp-pr-low' },
    normal: { ar: 'عادية', cls: 'smp-pr-normal' },
    high: { ar: 'عالية', cls: 'smp-pr-high' },
    urgent: { ar: 'عاجلة', cls: 'smp-pr-urgent' },
  };

  const DEPT_AR = {
    commercial: 'القطاع التجاري', operations: 'قطاع العمليات',
    production: 'قطاع الإنتاج',
    quality: 'قطاع الجودة', samples: 'إدارة العينات',
  };

  // ── أدوات مساعدة ────────────────────────────────────────────────────
  const esc = (s) => (typeof window.escapeHtml === 'function'
    ? window.escapeHtml(String(s ?? ''))
    : String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])));
  const toast = (m, t = 'info') => (typeof window.showToast === 'function' ? window.showToast(m, t) : console.log(m));
  const fmtDate = (d) => d ? String(d).slice(0, 10) : '—';
  const fmtDateTime = (d) => d ? String(d).replace('T', ' ').slice(0, 16) : '—';

  function fmtDuration(hours) {
    hours = Number(hours) || 0;
    if (hours < 1) return 'أقل من ساعة';
    if (hours < 24) return `${Math.round(hours)} ساعة`;
    const days = Math.floor(hours / 24);
    return `${days} يوم`;
  }

  // جلب رمز CSRF من دالة النظام العامة (_getCsrfToken في app-common.js)
  // مع بدائل احتياطية: window.csrfToken / meta / طلب settings مباشرة
  async function getCsrf() {
    // 1) الدالة العامة في app-common.js (مجرّدة داخل الـ bundle أو على window)
    try {
      const fn = (typeof _getCsrfToken === 'function') ? _getCsrfToken
        : (typeof window !== 'undefined' && typeof window._getCsrfToken === 'function') ? window._getCsrfToken
          : null;
      if (fn) { const t = await fn(); if (t) return t; }
    } catch (_) { }
    // 2) متغيّرات/وسوم احتياطية
    if (window.csrfToken) return window.csrfToken;
    const meta = document.querySelector('meta[name="csrf-token"]')?.content;
    if (meta) return meta;
    // 3) طلب مباشر للسيرفر
    try {
      const r = await fetch('api/settings.php?action=get_csrf_token', { credentials: 'same-origin' });
      const d = await r.json();
      if (d.token) { window.csrfToken = d.token; return d.token; }
    } catch (_) { }
    return '';
  }

  async function api(qs, opts = {}) {
    const res = await fetch(`${API}?${qs}`, { credentials: 'same-origin', ...opts });
    const txt = await res.text();
    let data;
    try { data = JSON.parse(txt); }
    catch { throw new Error('استجابة غير صالحة من الخادم'); }
    if (!data.success) throw new Error(data.message || 'خطأ غير معروف');
    return data;
  }
  async function post(action, payload) {
    const token = await getCsrf();
    return api(`action=${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
      body: JSON.stringify({ ...payload, csrf_token: token }),
    });
  }

  // ── إدخال الأنماط المحلية الديناميكية مرة واحدة ──────────────────────
  function injectCSS() {
    if (document.getElementById('smp-wf-css')) return;
    const el = document.createElement('style');
    el.id = 'smp-wf-css';
    el.textContent = SMP_DYNAMIC_CSS;
    document.head.appendChild(el);
  }

  // ════════════════════════════════════════════════════════════════════
  //  نقطة الدخول
  // ════════════════════════════════════════════════════════════════════
  async function loadSamplesPage() {
    injectCSS();
    const main = document.getElementById('main-content') || document.querySelector('.main-content');
    if (!main) return;
    main.innerHTML = `<div id="smp-root" dir="rtl"><div class="smp-loading">جارٍ التحميل…</div></div>`;
    try {
      // جلب صلاحية الإنشاء (حسب قطاع المستخدم) مع الإحصاءات والقائمة
      try { const w = await api('action=whoami'); S.canCreate = !!(w.data && w.data.can_create); } catch (_) { S.canCreate = false; }
      await Promise.all([loadStats(), loadList()]);
      render();
      // فتح عينة مباشرة عند المسح عبر QR (?sample=N)
      const qs = new URLSearchParams(location.search);
      const sid = +qs.get('sample');
      if (sid) openDetail(sid);
    } catch (err) {
      console.error('Samples error:', err);
      document.getElementById('smp-root').innerHTML =
        `<div class="smp-error">تعذّر تحميل النظام: ${esc(err.message)}</div>`;
    }
  }

  async function loadStats() {
    const d = await api('action=stats');
    S.stats = d.data || {};
  }
  async function loadList() {
    const p = new URLSearchParams({ action: 'list', page: S.page });
    if (S.filters.search) p.set('search', S.filters.search);
    if (S.filters.stage) p.set('stage', S.filters.stage);
    if (S.filters.priority) p.set('priority', S.filters.priority);
    if (S.filters.overdue) p.set('overdue', '1');
    const d = await api(p.toString());
    S.list = d.data || [];
    S.totalPages = d.pages || 1;
  }

  // ════════════════════════════════════════════════════════════════════
  //  العرض الرئيسي
  // ════════════════════════════════════════════════════════════════════
  function render() {
    const root = document.getElementById('smp-root');
    root.innerHTML = `
      ${renderHeader()}
      ${renderStats()}
      ${renderFilters()}
      ${renderTable()}
      ${renderPagination()}
    `;
    bindEvents();
  }

  function renderHeader() {
    return `
      <div class="smp-head">
        <div>
          <h1 class="smp-title">نظام تتبع العينات</h1>
          <p class="smp-sub">إدارة دورة حياة العينة من الطلب حتى الإرسال</p>
        </div>
        ${S.canCreate ? '<button class="smp-btn smp-btn-primary" id="smp-new">＋ طلب عينة جديد</button>' : ''}
      </div>`;
  }

  function renderStats() {
    const s = S.stats;
    const cards = [
      { k: 'cnt_new', ar: 'طلبات جديدة', v: s.cnt_new || 0, cls: 'c-blue' },
      { k: 'cnt_production', ar: 'تحت الإنتاج', v: s.cnt_production || 0, cls: 'c-yellow' },
      { k: 'cnt_quality', ar: 'تحت الجودة', v: s.cnt_quality || 0, cls: 'c-yellow' },
      { k: 'cnt_overdue', ar: 'متأخرة', v: s.cnt_overdue || 0, cls: 'c-red' },
      { k: 'cnt_completed', ar: 'مكتملة', v: s.cnt_completed || 0, cls: 'c-green' },
    ];
    return `<div class="smp-stats">${cards.map(c => `
      <div class="smp-stat ${c.cls}" data-stat="${c.k}">
        <div class="smp-stat-v">${c.v}</div>
        <div class="smp-stat-l">${c.ar}</div>
      </div>`).join('')}</div>`;
  }

  function renderFilters() {
    const stageOpts = ['<option value="">كل المراحل</option>']
      .concat(STAGE_ORDER.concat(['need_modification', 'rejected'])
        .map(k => `<option value="${k}" ${S.filters.stage === k ? 'selected' : ''}>${STAGE[k].ar}</option>`))
      .join('');
    const prioOpts = ['<option value="">كل الأولويات</option>']
      .concat(Object.entries(PRIORITY)
        .map(([k, v]) => `<option value="${k}" ${S.filters.priority === k ? 'selected' : ''}>${v.ar}</option>`))
      .join('');
    return `
      <div class="smp-filters">
        <input type="search" id="smp-search" class="smp-input" placeholder="بحث (رقم الطلب، العميل، النوع…)" value="${esc(S.filters.search)}">
        <select id="smp-f-stage" class="smp-input">${stageOpts}</select>
        <select id="smp-f-prio" class="smp-input">${prioOpts}</select>
        <label class="smp-chk"><input type="checkbox" id="smp-f-over" ${S.filters.overdue ? 'checked' : ''}> المتأخرة فقط</label>
      </div>`;
  }

  function renderTable() {
    if (!S.list.length)
      return `<div class="smp-empty">لا توجد عينات مطابقة</div>`;
    const rows = S.list.map(r => {
      const st = STAGE[r.current_stage] || STAGE.new_request;
      const pr = PRIORITY[r.priority] || PRIORITY.normal;
      const slaDot = (r.sla_state && r.sla_state !== 'none')
        ? `<span class="smp-sla-dot sd-${r.sla_state}" title="حالة SLA"></span>` : '';
      return `
        <tr class="smp-row ${r.is_overdue || r.sla_state === 'breach' ? 'is-over' : ''}" data-id="${r.id}">
          <td class="smp-mono">${slaDot}${esc(r.request_number)}</td>
          <td>${esc(r.client_name)}</td>
          <td>${esc(r.sample_type)}</td>
          <td><span class="smp-badge bd-${st.color}">${st.icon} ${st.ar}</span></td>
          <td>${DEPT_AR[r.stage_dept] || '—'}</td>
          <td>${fmtDate(r.created_at)}</td>
          <td><span class="smp-prio ${pr.cls}">${pr.ar}</span></td>
          <td>${fmtDuration(r.age_hours)} ${r.sla_state === 'breach' ? '<span class="smp-over-tag">تجاوز SLA</span>' : (r.is_overdue ? '<span class="smp-over-tag">متأخرة</span>' : '')}</td>
        </tr>`;
    }).join('');
    return `
      <div class="smp-table-wrap">
        <table class="smp-table">
          <thead><tr>
            <th>رقم الطلب</th><th>العميل</th><th>النوع</th><th>الحالة</th>
            <th>الإدارة الحالية</th><th>تاريخ الإنشاء</th><th>الأولوية</th><th>المدة</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  function renderPagination() {
    if (S.totalPages <= 1) return '';
    return `
      <div class="smp-pager">
        <button class="smp-btn" id="smp-prev" ${S.page <= 1 ? 'disabled' : ''}>السابق</button>
        <span>صفحة ${S.page} من ${S.totalPages}</span>
        <button class="smp-btn" id="smp-next" ${S.page >= S.totalPages ? 'disabled' : ''}>التالي</button>
      </div>`;
  }

  // ── ربط الأحداث ──────────────────────────────────────────────────────
  function bindEvents() {
    document.getElementById('smp-new')?.addEventListener('click', openCreateModal);

    const search = document.getElementById('smp-search');
    let tmr;
    search?.addEventListener('input', e => {
      clearTimeout(tmr);
      tmr = setTimeout(async () => {
        S.filters.search = e.target.value.trim(); S.page = 1;
        await loadList(); render();
        const el = document.getElementById('smp-search'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
      }, 350);
    });
    document.getElementById('smp-f-stage')?.addEventListener('change', async e => {
      S.filters.stage = e.target.value; S.page = 1; await loadList(); render();
    });
    document.getElementById('smp-f-prio')?.addEventListener('change', async e => {
      S.filters.priority = e.target.value; S.page = 1; await loadList(); render();
    });
    document.getElementById('smp-f-over')?.addEventListener('change', async e => {
      S.filters.overdue = e.target.checked ? '1' : ''; S.page = 1; await loadList(); render();
    });
    document.querySelectorAll('.smp-row').forEach(tr =>
      tr.addEventListener('click', () => openDetail(+tr.dataset.id)));
    document.querySelectorAll('.smp-stat[data-stat]').forEach(c =>
      c.addEventListener('click', () => quickFilterByStat(c.dataset.stat)));
    document.getElementById('smp-prev')?.addEventListener('click', async () => { if (S.page > 1) { S.page--; await loadList(); render(); } });
    document.getElementById('smp-next')?.addEventListener('click', async () => { if (S.page < S.totalPages) { S.page++; await loadList(); render(); } });
  }

  async function quickFilterByStat(k) {
    const mapStage = { cnt_new: 'new_request', cnt_production: 'production', cnt_quality: 'quality_check', cnt_completed: 'delivered' };
    S.filters = { search: '', stage: '', priority: '', overdue: '' };
    if (k === 'cnt_overdue') S.filters.overdue = '1';
    else if (mapStage[k]) S.filters.stage = mapStage[k];
    S.page = 1; await loadList(); render();
  }

  // ════════════════════════════════════════════════════════════════════
  //  نافذة إنشاء طلب
  // ════════════════════════════════════════════════════════════════════
  async function openCreateModal() {
    // جلب بيانات المستخدم الحالي لتعبئة بطاقة الطالب تلقائياً
    let me = { name: '—', sector_name: '—', requester_side: 'commercial' };
    try { const d = await api('action=whoami'); me = d.data || me; } catch (_) { }
    const initials = (me.name || '?').trim().slice(0, 2);

    const TYPES = [
      { v: 'ملابس عسكرية', i: 'ti-shirt-sport' },
      { v: 'ملابس مدنية', i: 'ti-shirt' },
      { v: 'تجهيزات الجندي', i: 'ti-shield' },
      { v: 'منتجات جاهزة', i: 'ti-package' },
      { v: 'أخرى', i: 'ti-dots' },
    ];
    const typeOpts = TYPES.map(t => `<option value="${esc(t.v)}">${esc(t.v)}</option>`).join('');

    const html = `
      <div class="smp-modal-bg" id="smp-modal">
        <div class="smp-modal smp-modal-lg">
          <div class="smp-modal-h">
            <div class="smp-h-info">
              <div class="smp-h-title"><span class="smp-h-num">طلب عينة جديد</span></div>
              <div class="smp-h-sub">يُولّد رقم تلقائي عند الحفظ</div>
            </div>
            <button class="smp-x" data-close>✕</button>
          </div>
          <div class="smp-modal-b">
            <!-- بطاقة الطالب التلقائية -->
            <div class="smp-requester">
              <div class="smp-req-av">${esc(initials)}</div>
              <div class="smp-req-info">
                <div class="smp-req-name">${esc(me.name)}</div>
                <div class="smp-req-dept">${esc(me.sector_name)} · الجهة الطالبة</div>
              </div>
              <span class="smp-req-lock" title="تُحدّد تلقائياً">🔒</span>
            </div>

            <!-- طبيعة الطلب: عميل / مورد -->
            <div class="smp-fld"><span>طبيعة الطلب *</span></div>
            <div class="smp-kind-row">
              <button type="button" class="smp-kind active" data-kind="client">👤 عميل</button>
              <button type="button" class="smp-kind" data-kind="supplier">🚚 مورد</button>
            </div>

            <div class="smp-grid">
              <label class="smp-fld req"><span id="f-name-lbl">اسم العميل</span>
                <input id="f-client" class="smp-input" required></label>
              <label class="smp-fld req"><span>نوع العينة</span>
                <select id="f-type" class="smp-input">${typeOpts}</select></label>
            </div>
            <label class="smp-fld" id="f-other-wrap" style="display:none"><span>حدّد نوع العينة (أخرى) *</span>
              <input id="f-other" class="smp-input"></label>

            <!-- القسم الشرطي: عميل (عقد وخطاب) -->
            <div class="smp-cond" id="f-cond-client">
              <div class="smp-cond-h">📄 تفاصيل العقد والخطاب</div>
              <div class="smp-grid">
                <label class="smp-fld"><span>رقم العقد</span><input id="f-contract-no" class="smp-input"></label>
                <label class="smp-fld"><span>رقم الخطاب</span><input id="f-letter-no" class="smp-input"></label>
                <label class="smp-fld"><span>تاريخ العقد</span><input id="f-contract-date" type="date" class="smp-input"></label>
                <label class="smp-fld"><span>طرف العقد / الجهة</span><input id="f-contract-party" class="smp-input"></label>
              </div>
            </div>

            <!-- القسم الشرطي: مورد (مورد وتعاقد) -->
            <div class="smp-cond" id="f-cond-supplier" style="display:none">
              <div class="smp-cond-h">🏭 تفاصيل المورد والتعاقد</div>
              <div class="smp-grid">
                <label class="smp-fld"><span>السجل التجاري</span><input id="f-supplier-cr" class="smp-input"></label>
                <label class="smp-fld"><span>رقم أمر الشراء (PO)</span><input id="f-po" class="smp-input"></label>
                <label class="smp-fld"><span>رقم التعاقد</span><input id="f-contract-ref" class="smp-input"></label>
                <label class="smp-fld"><span>جهة التواصل بالمورد</span><input id="f-supplier-contact" class="smp-input"></label>
              </div>
            </div>

            <div class="smp-grid">
              <label class="smp-fld"><span>تاريخ الاحتياج</span>
                <input id="f-need" type="date" class="smp-input"></label>
              <label class="smp-fld"><span>الأولوية</span>
                <select id="f-prio" class="smp-input">
                  <option value="normal">عادية</option><option value="high">عالية</option>
                  <option value="urgent">عاجلة</option><option value="low">منخفضة</option>
                </select></label>
            </div>
            <label class="smp-fld"><span>وصف المنتج</span>
              <textarea id="f-desc" class="smp-input" rows="2"></textarea></label>
            <label class="smp-fld"><span>الغرض من العينة</span>
              <textarea id="f-purpose" class="smp-input" rows="2"></textarea></label>
            <label class="smp-fld"><span>المواصفات الفنية</span>
              <textarea id="f-specs" class="smp-input" rows="2"></textarea></label>

            <!-- إرفاق ملفات -->
            <div class="smp-fld"><span>المرفقات</span></div>
            <label class="smp-dropzone" for="f-files">
              <i class="ti-cloud-upload">⬆️</i>
              <div class="smp-dz-main">اضغط لإرفاق ملفات</div>
              <div class="smp-dz-sub">PDF · صور · Word · Excel (حتى 10MB لكل ملف)</div>
            </label>
            <input type="file" id="f-files" multiple hidden accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.docx,.doc">
            <div class="smp-files-list" id="f-files-list"></div>
          </div>
          <div class="smp-modal-f">
            <button class="smp-btn" data-close>إلغاء</button>
            <button class="smp-btn smp-btn-primary" id="f-save">حفظ الطلب</button>
          </div>
        </div>
      </div>`;
    mountModal(html);

    let kind = 'client';
    const pendingFiles = [];

    // تبديل عميل/مورد
    document.querySelectorAll('.smp-kind').forEach(b => b.addEventListener('click', () => {
      kind = b.dataset.kind;
      document.querySelectorAll('.smp-kind').forEach(x => x.classList.toggle('active', x === b));
      document.getElementById('f-cond-client').style.display = kind === 'client' ? '' : 'none';
      document.getElementById('f-cond-supplier').style.display = kind === 'supplier' ? '' : 'none';
      document.getElementById('f-name-lbl').textContent = kind === 'client' ? 'اسم العميل' : 'اسم المورد';
    }));

    // حقل «أخرى»
    document.getElementById('f-type').addEventListener('change', e => {
      document.getElementById('f-other-wrap').style.display = e.target.value === 'أخرى' ? '' : 'none';
    });

    // اختيار الملفات
    document.getElementById('f-files').addEventListener('change', e => {
      for (const f of e.target.files) pendingFiles.push(f);
      renderPendingFiles();
    });
    function renderPendingFiles() {
      const box = document.getElementById('f-files-list');
      box.innerHTML = pendingFiles.map((f, i) =>
        `<div class="smp-file-chip">📎 ${esc(f.name)} <button data-rm="${i}">✕</button></div>`).join('');
      box.querySelectorAll('[data-rm]').forEach(b =>
        b.addEventListener('click', () => { pendingFiles.splice(+b.dataset.rm, 1); renderPendingFiles(); }));
    }

    // حفظ
    document.getElementById('f-save').addEventListener('click', async () => {
      const typeVal = val('f-type');
      const payload = {
        request_kind: kind,
        client_name: val('f-client'),
        sample_type: typeVal,
        type_other: typeVal === 'أخرى' ? val('f-other') : '',
        priority: val('f-prio'), need_date: val('f-need'),
        product_desc: val('f-desc'), purpose: val('f-purpose'), specifications: val('f-specs'),
      };
      if (kind === 'client') {
        Object.assign(payload, {
          contract_number: val('f-contract-no'), letter_number: val('f-letter-no'),
          contract_date: val('f-contract-date'), contract_party: val('f-contract-party'),
        });
      } else {
        Object.assign(payload, {
          supplier_cr: val('f-supplier-cr'), po_code: val('f-po'),
          contract_ref: val('f-contract-ref'), supplier_contact: val('f-supplier-contact'),
        });
      }
      if (!payload.client_name || !payload.sample_type)
        return toast('الاسم ونوع العينة مطلوبان', 'error');
      if (typeVal === 'أخرى' && !payload.type_other)
        return toast('حدّد نوع العينة (أخرى)', 'error');
      try {
        const r = await post('create', payload);
        // رفع المرفقات تلقائياً بعد إنشاء العينة
        if (pendingFiles.length && r.id) {
          const token = await getCsrf();
          for (const file of pendingFiles) {
            const fd = new FormData();
            fd.append('id', r.id); fd.append('file', file); fd.append('csrf_token', token);
            try { await fetch(`${API}?action=upload_attachment`, { method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-Token': token }, body: fd }); } catch (_) { }
          }
        }
        toast(r.message, 'success'); closeModal();
        S.page = 1; await Promise.all([loadStats(), loadList()]); render();
      } catch (e) { toast(e.message, 'error'); }
    });
  }

  // ════════════════════════════════════════════════════════════════════
  //  نافذة التفاصيل + Timeline + إجراءات المرحلة
  // ════════════════════════════════════════════════════════════════════
  async function openDetail(id) {
    try {
      const d = await api(`action=get&id=${id}`);
      S.selected = d.data; S.events = d.events || [];
      S.attachments = d.attachments || []; S.timeline = d.timeline || [];
      renderDetail();
    } catch (e) { toast(e.message, 'error'); }
  }

  function renderDetail() {
    const s = S.selected;
    const st = STAGE[s.current_stage] || STAGE.new_request;
    const html = `
      <div class="smp-modal-bg" id="smp-modal">
        <div class="smp-modal smp-modal-lg">
          <div class="smp-modal-h">
            <div class="smp-h-info">
              <div class="smp-h-title">
                <span class="smp-h-num">${esc(s.request_number)}</span>
                <span class="smp-badge bd-${st.color}">${st.icon} ${st.ar}</span>
                ${s.is_overdue ? '<span class="smp-over-tag">متأخرة</span>' : ''}
              </div>
              <div class="smp-h-sub">${esc(s.client_name)} · ${esc(s.sample_type || '')}</div>
            </div>
            <div class="smp-h-actions">
              <button class="smp-btn smp-btn-ghost" data-act="print_card" title="طباعة بطاقة العينة">
                <i class="ti-printer">🖨️</i> بطاقة
              </button>
              <button class="smp-x" data-close>✕</button>
            </div>
          </div>
          <div class="smp-modal-b">
            ${renderStepper()}
            ${renderActions()}
            <div class="smp-cols">
              <div class="smp-col-main">
                ${renderInfo()}
                ${renderActivity()}
                ${renderAttachments()}
              </div>
              <div class="smp-col-side">
                ${renderVerticalTimeline()}
              </div>
            </div>
          </div>
        </div>
      </div>`;
    mountModal(html);
    bindDetailActions();
  }

  // ── المسار الأفقي الحكومي (Stepper) ─────────────────────────────────
  function renderStepper() {
    const s = S.selected;
    // المراحل الرئيسية الثمانية فقط (بدون need_modification/rejected)
    const steps = S.timeline;
    const arNum = ['١', '٢', '٣', '٤', '٥', '٦', '٧', '٨'];
    const cells = steps.map((t, i) => {
      const isDone = t.state === 'done';
      const isCur = t.state === 'current';
      const node = isDone
        ? `<div class="stp-node stp-done">✓</div>`
        : isCur
          ? `<div class="stp-node stp-current">${arNum[i] || (i + 1)}</div>`
          : `<div class="stp-node stp-pending">${arNum[i] || (i + 1)}</div>`;
      // شريط التقدّم بعد العقدة (إلا الأخيرة)
      let bar = '';
      if (i < steps.length - 1) {
        const next = steps[i + 1];
        const fill = isDone ? 'stp-bar-full' : (isCur ? 'stp-bar-half' : '');
        bar = `<div class="stp-bar ${fill}"></div>`;
      }
      const lblCls = isDone ? 'stp-lbl-done' : isCur ? 'stp-lbl-cur' : 'stp-lbl-pend';
      return `
        <div class="stp-step">
          ${node}
          <div class="stp-lbl ${lblCls}">${t.ar}</div>
          ${t.at ? `<div class="stp-at">${fmtDate(t.at)}</div>` : (isCur ? '<div class="stp-at stp-now">الحالية</div>' : '')}
          ${bar}
        </div>`;
    }).join('');

    let banner = '';
    if (s.current_stage === 'rejected')
      banner = `<div class="smp-reject-banner"><i>✕</i> مرفوضة — السبب: ${esc(s.reject_reason || '—')}</div>`;
    else if (s.current_stage === 'need_modification')
      banner = `<div class="smp-mod-banner"><i>✎</i> تحتاج تعديل — ${esc(s.quality_notes || '')}</div>`;
    return `<div class="smp-stepper-wrap"><div class="smp-stepper">${cells}</div></div>${banner}`;
  }

  // ── المسار العمودي التفصيلي (Audit Timeline) ────────────────────────
  function renderVerticalTimeline() {
    const items = S.timeline.map((t, i) => {
      const isDone = t.state === 'done', isCur = t.state === 'current';
      const dotCls = isDone ? 'vtl-done' : isCur ? 'vtl-cur' : 'vtl-pend';
      const badge = isDone
        ? '<span class="vtl-badge vtl-b-done">مكتملة</span>'
        : isCur ? '<span class="vtl-badge vtl-b-cur">جارية الآن</span>'
          : '<span class="vtl-badge vtl-b-pend">لم تبدأ</span>';
      const line = i < S.timeline.length - 1 ? `<div class="vtl-line ${isDone ? 'vtl-line-done' : ''}"></div>` : '';
      const icon = isDone ? '✓' : (i + 1);
      return `
        <div class="vtl-row">
          <div class="vtl-rail">
            <div class="vtl-dot ${dotCls}">${icon}</div>
            ${line}
          </div>
          <div class="vtl-body">
            <div class="vtl-head"><span class="vtl-name ${isCur ? 'vtl-name-cur' : ''}">${t.ar}</span>${badge}</div>
            <div class="vtl-dept">${DEPT_AR[t.dept] || '—'}</div>
            ${t.at ? `<div class="vtl-at">${fmtDateTime(t.at)}</div>` : ''}
          </div>
        </div>`;
    }).join('');
    return `<details class="smp-sec" open><summary>مسار العينة</summary><div class="smp-vtl">${items}</div></details>`;
  }

  // شريط: من ينفّذ المرحلة الحالية + حالة الـ SLA
  function renderStageMeta() {
    const s = S.selected;
    if (['delivered', 'rejected'].includes(s.current_stage)) return '';
    const sla = s.sla || {};
    let slaHtml = '';
    if (sla.state && sla.state !== 'none') {
      const map = {
        ok: ['smp-sla-ok', `ضمن المهلة (${sla.days} يوم)`],
        warn: ['smp-sla-warn', `يقترب من تجاوز المهلة (${sla.days} يوم)`],
        breach: ['smp-sla-breach', `تجاوز المهلة (${sla.days} يوم)`],
      };
      const [cls, txt] = map[sla.state] || ['', ''];
      slaHtml = `<span class="smp-sla ${cls}">⏱ ${txt}</span>`;
    }
    return `<div class="smp-stage-meta">
      <span class="smp-stage-owner">👤 المسؤول: ${DEPT_AR[s.stage_dept] || '—'}</span>
      ${slaHtml}
    </div>`;
  }

  function renderActions() {
    const s = S.selected;
    if (!s.can_act) return `
      ${renderStageMeta()}
      <div class="smp-act-note">العينة حالياً لدى: ${DEPT_AR[s.stage_dept] || '—'} — لا تملك صلاحية تنفيذ هذه المرحلة.</div>`;
    const stage = s.current_stage;
    let buttons = '';

    if (stage === 'ready_for_dispatch') {
      buttons = `<button class="smp-btn smp-btn-primary" data-act="dispatch">🚚 تسجيل الإرسال</button>`;
    } else if (stage === 'dispatched') {
      buttons = `<button class="smp-btn smp-btn-success" data-act="mark_delivered">✅ تأكيد التسليم</button>`;
    } else if (stage === 'quality_check') {
      buttons = `
        <button class="smp-btn smp-btn-success" data-act="advance">✅ اعتماد ← جاهزة للإرسال</button>
        <button class="smp-btn smp-btn-warn" data-act="need_modification">✏️ تحتاج تعديل (إرجاع للإنتاج)</button>
        <button class="smp-btn smp-btn-danger" data-act="reject">❌ رفض</button>`;
    } else if (['delivered', 'rejected'].includes(stage)) {
      buttons = `<div class="smp-act-note">انتهت دورة العينة.</div>`;
    } else {
      const next = STAGE[s.next_stage];
      buttons = `<button class="smp-btn smp-btn-primary" data-act="advance">↩ تقديم إلى: ${next ? next.ar : '—'}</button>`;
      if (stage === 'operations_review')
        buttons += `<button class="smp-btn smp-btn-danger" data-act="reject">❌ رفض</button>`;
    }
    // حقول المرحلة القابلة للتعبئة
    return `<div class="smp-actions">
      ${renderStageMeta()}
      ${renderStageFields(stage)}
      <div class="smp-act-row">${buttons}
        <button class="smp-btn" data-act="upload">📎 إرفاق ملف</button>
        <input type="file" id="smp-file" hidden>
      </div>
    </div>`;
  }

  // حقول إدخال خاصة بكل مرحلة تُحفظ عبر update قبل التقديم
  function renderStageFields(stage) {
    const s = S.selected;
    const f = (id, lbl, val = '', type = 'text') =>
      `<label class="smp-fld"><span>${lbl}</span><input id="${id}" type="${type}" class="smp-input" value="${esc(val)}"></label>`;
    const ta = (id, lbl, val = '') =>
      `<label class="smp-fld"><span>${lbl}</span><textarea id="${id}" class="smp-input" rows="2">${esc(val)}</textarea></label>`;
    let inner = '';
    if (stage === 'operations_review') {
      inner = `<div class="smp-grid">
        ${f('sf-po', 'رقم أمر الإنتاج', s.production_order_no)}
        ${f('sf-sched', 'تاريخ الجدولة', fmtDate(s.schedule_date) === '—' ? '' : s.schedule_date, 'date')}
        ${f('sf-exec', 'تاريخ التنفيذ المتوقع', fmtDate(s.expected_exec_date) === '—' ? '' : s.expected_exec_date, 'date')}
      </div>${ta('sf-raw', 'المواد الخام', s.raw_materials)}`;
    } else if (stage === 'production') {
      inner = `<div class="smp-grid">
        ${f('sf-batch', 'رقم التشغيلة', s.batch_number)}
        ${f('sf-pqty', 'الكمية المنتجة', s.produced_qty, 'number')}
        ${f('sf-pstart', 'بدء التصنيع', '', 'datetime-local')}
        ${f('sf-pend', 'انتهاء التصنيع', '', 'datetime-local')}
      </div>${ta('sf-pnotes', 'ملاحظات الإنتاج', s.production_notes)}`;
    } else if (stage === 'quality_check') {
      inner = `<div class="smp-grid">
        <label class="smp-fld"><span>نتيجة الفحص</span>
          <select id="sf-qres" class="smp-input">
            <option value="">—</option>
            <option value="pass" ${s.inspection_result === 'pass' ? 'selected' : ''}>مطابق</option>
            <option value="fail" ${s.inspection_result === 'fail' ? 'selected' : ''}>غير مطابق</option>
            <option value="conditional" ${s.inspection_result === 'conditional' ? 'selected' : ''}>مشروط</option>
          </select></label>
        ${f('sf-inspector', 'اسم الفاحص', s.inspector_name)}
        ${f('sf-idate', 'تاريخ الفحص', fmtDate(s.inspection_date) === '—' ? '' : s.inspection_date, 'date')}
      </div>${ta('sf-qnotes', 'ملاحظات الجودة', s.quality_notes)}`;
    } else if (stage === 'ready_for_dispatch') {
      inner = `<div class="smp-grid">
        ${f('sf-courier', 'اسم الموظف المندوب', s.dispatched_by_name)}
        ${f('sf-recipient', 'الجهة المستلمة', s.recipient_party)}
      </div>
      <div class="smp-date-note">📅 تاريخ ووقت الإرسال يُسجَّل تلقائياً من النظام عند التأكيد</div>`;
    }
    return inner ? `<div class="smp-stage-fields">${inner}</div>` : '';
  }

  function renderInfo() {
    const s = S.selected;
    const row = (l, v) => `<div class="smp-info-r"><span>${l}</span><b>${esc(v || '—')}</b></div>`;
    // قسم الإرسال يظهر فقط بعد الإرسال
    let dispatch = '';
    if (s.dispatched_by_name || s.dispatch_date) {
      dispatch = `
        ${row('الموظف المندوب', s.dispatched_by_name)}
        ${row('الجهة المستلمة', s.recipient_party)}
        ${row('تاريخ الإرسال', fmtDateTime(s.dispatch_date))}`;
    }
    if (s.delivered_at) {
      dispatch += `
        ${row('استلمها', s.received_by_name)}
        ${row('تاريخ التسليم', fmtDateTime(s.delivered_at))}`;
    }
    return `
      <details class="smp-sec" open>
        <summary>بيانات الطلب</summary>
        <div class="smp-info">
          ${row('الجهة الطالبة', DEPT_AR[s.requester_side] || s.requester_side)}
          ${row('طبيعة الطلب', s.request_kind === 'supplier' ? 'مورد' : 'عميل')}
          ${row(s.request_kind === 'supplier' ? 'اسم المورد' : 'اسم العميل', s.client_name)}
          ${row('نوع العينة', s.sample_type === 'أخرى' ? (s.type_other || 'أخرى') : s.sample_type)}
          ${row('تاريخ الاحتياج', fmtDate(s.need_date))}
          ${row('الوصف', s.product_desc)}
          ${row('الغرض', s.purpose)}
          ${row('المواصفات', s.specifications)}
          ${s.request_kind === 'supplier' ? `
            ${row('السجل التجاري', s.supplier_cr)}
            ${row('رقم أمر الشراء', s.po_code)}
            ${row('رقم التعاقد', s.contract_ref)}
            ${row('جهة التواصل', s.supplier_contact)}
          ` : `
            ${row('رقم العقد', s.contract_number)}
            ${row('رقم الخطاب', s.letter_number)}
            ${row('تاريخ العقد', fmtDate(s.contract_date))}
            ${row('طرف العقد', s.contract_party)}
          `}
          ${row('أنشأه', s.creator_name)}
          ${row('تاريخ الإنشاء', fmtDateTime(s.created_at))}
          ${dispatch}
        </div>
      </details>`;
  }

  function renderAttachments() {
    const items = S.attachments.map(a => `
      <a class="smp-att" href="${esc(a.file_path)}" target="_blank">
        📎 ${esc(a.file_name)} <small>(${STAGE[a.stage]?.ar || a.stage})</small>
      </a>`).join('') || '<div class="smp-muted">لا مرفقات</div>';
    return `<details class="smp-sec"><summary>المرفقات (${S.attachments.length})</summary><div class="smp-atts">${items}</div></details>`;
  }

  function renderActivity() {
    const items = S.events.map(e => {
      const fromTo = (e.from_stage && e.to_stage)
        ? `<small>${STAGE[e.from_stage]?.ar || e.from_stage} ← ${STAGE[e.to_stage]?.ar || e.to_stage}</small>` : '';
      return `
        <div class="smp-ev">
          <div class="smp-ev-dot"></div>
          <div class="smp-ev-body">
            <div class="smp-ev-desc">${esc(e.description)} ${fromTo}</div>
            <div class="smp-ev-meta">${esc(e.actor_name || '—')} · ${fmtDateTime(e.created_at)}</div>
          </div>
        </div>`;
    }).join('') || '<div class="smp-muted">لا أحداث</div>';
    return `<details class="smp-sec" open><summary>سجل النشاط (Audit Trail)</summary><div class="smp-activity">${items}</div></details>`;
  }

  // ── إجراءات نافذة التفاصيل ───────────────────────────────────────────
  function bindDetailActions() {
    const root = document.getElementById('smp-modal');
    root.querySelectorAll('[data-act]').forEach(btn =>
      btn.addEventListener('click', () => handleAction(btn.dataset.act)));
  }

  // حفظ حقول المرحلة الحالية قبل تنفيذ الإجراء
  async function saveStageFields() {
    const s = S.selected, stage = s.current_stage, payload = { id: s.id };
    const g = (id) => document.getElementById(id)?.value ?? '';
    if (stage === 'operations_review') {
      Object.assign(payload, {
        production_order_no: g('sf-po'), schedule_date: g('sf-sched'),
        expected_exec_date: g('sf-exec'), raw_materials: g('sf-raw')
      });
    } else if (stage === 'production') {
      Object.assign(payload, {
        batch_number: g('sf-batch'), produced_qty: g('sf-pqty'),
        prod_start: g('sf-pstart'), prod_end: g('sf-pend'), production_notes: g('sf-pnotes')
      });
    } else if (stage === 'quality_check') {
      Object.assign(payload, {
        inspection_result: g('sf-qres'), inspector_name: g('sf-inspector'),
        inspection_date: g('sf-idate'), quality_notes: g('sf-qnotes')
      });
    }
    if (Object.keys(payload).length > 1) await post('update', payload);
  }

  async function handleAction(act) {
    const s = S.selected;
    try {
      if (act === 'upload') { document.getElementById('smp-file').click(); bindUpload(); return; }
      if (act === 'print_card') { openPrintCard(); return; }

      if (act === 'advance') {
        await saveStageFields();
        await post('advance', { id: s.id });
        toast('تم التقديم للمرحلة التالية', 'success');
      } else if (act === 'reject') {
        const reason = prompt('سبب الرفض:');
        if (!reason) return;
        await post('reject', { id: s.id, reason });
        toast('تم تسجيل الرفض', 'success');
      } else if (act === 'need_modification') {
        const notes = prompt('ملاحظات الجودة (سبب طلب التعديل):');
        if (!notes) return;
        await post('need_modification', { id: s.id, notes });
        toast('تم إرجاع العينة للإنتاج', 'success');
      } else if (act === 'dispatch') {
        const courier = document.getElementById('sf-courier')?.value?.trim() || '';
        const recipient = document.getElementById('sf-recipient')?.value?.trim() || '';
        if (!courier) return toast('اسم الموظف المندوب مطلوب', 'error');
        if (!recipient) return toast('الجهة المستلمة مطلوبة', 'error');
        await post('dispatch', { id: s.id, dispatched_by_name: courier, recipient_party: recipient });
        toast('تم تسجيل الإرسال', 'success');
      } else if (act === 'mark_delivered') {
        const recv = prompt('اسم مستلم الجهة (اختياري):') || '';
        await post('mark_delivered', { id: s.id, received_by_name: recv });
        toast('تم تأكيد التسليم', 'success');
      }
      closeModal();
      await Promise.all([loadStats(), loadList()]); render();
    } catch (e) { toast(e.message, 'error'); }
  }

  function bindUpload() {
    const inp = document.getElementById('smp-file');
    if (inp._bound) return; inp._bound = true;
    inp.addEventListener('change', async () => {
      if (!inp.files.length) return;
      const token = await getCsrf();
      const fd = new FormData();
      fd.append('id', S.selected.id); fd.append('file', inp.files[0]); fd.append('csrf_token', token);
      try {
        const res = await fetch(`${API}?action=upload_attachment`, {
          method: 'POST', credentials: 'same-origin',
          headers: { 'X-CSRF-Token': token }, body: fd,
        });
        const d = await res.json();
        if (!d.success) throw new Error(d.message);
        toast('تم رفع المرفق', 'success');
        await openDetail(S.selected.id);
      } catch (e) { toast(e.message, 'error'); }
    });
  }

  // ── أدوات النوافذ ────────────────────────────────────────────────────
  function mountModal(html) {
    closeModal();
    document.body.insertAdjacentHTML('beforeend', html);
    const bg = document.getElementById('smp-modal');
    bg.addEventListener('click', e => { if (e.target === bg) closeModal(); });
    bg.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeModal));
  }
  function closeModal() { document.getElementById('smp-modal')?.remove(); }
  function val(id) { return document.getElementById(id)?.value?.trim() || ''; }

  // ── تصدير عام ────────────────────────────────────────────────────────
  // ════════════════════════════════════════════════════════════════════
  //  نظام طباعة بطاقة العينة — 3 مقاسات + باركود EAN-13 + QR
  // ════════════════════════════════════════════════════════════════════

  // ترميز EAN-13 → نمط أعرض/أضيق (يُنتج SVG حقيقياً قابلاً للمسح)
  const EAN_L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
  const EAN_G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
  const EAN_R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
  const EAN_PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

  function ean13ToBars(code) {
    code = String(code).replace(/\D/g, '');
    if (code.length !== 13) return null;
    const first = +code[0];
    const parity = EAN_PARITY[first];
    let bits = '101'; // حارس البداية
    for (let i = 1; i <= 6; i++) bits += (parity[i - 1] === 'L' ? EAN_L : EAN_G)[+code[i]];
    bits += '01010'; // الحارس الأوسط
    for (let i = 7; i <= 12; i++) bits += EAN_R[+code[i]];
    bits += '101'; // حارس النهاية
    return bits;
  }

  function barcodeSVG(code, w = 200, h = 56) {
    const bits = ean13ToBars(code);
    if (!bits) return '<div style="font-size:10px;color:#999">باركود غير صالح</div>';
    const n = bits.length, bw = w / n;
    let rects = '';
    for (let i = 0; i < n; i++) if (bits[i] === '1') rects += `<rect x="${(i * bw).toFixed(2)}" y="0" width="${bw.toFixed(2)}" height="${h - 14}" fill="#111"/>`;
    const txt = String(code).replace(/\D/g, '');
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">${rects}<text x="${w / 2}" y="${h - 2}" text-anchor="middle" font-family="monospace" font-size="10" letter-spacing="2" fill="#111">${txt}</text></svg>`;
  }

  // نافذة اختيار المقاس
  function openPrintCard() {
    const html = `
      <div class="smp-modal-bg" id="smp-print-pick">
        <div class="smp-modal" style="max-width:420px">
          <div class="smp-modal-h">
            <div class="smp-h-info"><div class="smp-h-title"><span class="smp-h-num">طباعة بطاقة العينة</span></div></div>
            <button class="smp-x" data-pclose>✕</button>
          </div>
          <div class="smp-modal-b">
            <p style="font-size:13px;color:var(--smp-muted);margin:0 0 14px">اختر المقاس المناسب:</p>
            <div class="smp-size-grid">
              <button class="smp-size-opt" data-size="a6"><b>كبير · A6</b><span>105×148mm — للأرشفة</span></button>
              <button class="smp-size-opt" data-size="card"><b>متوسط · بطاقة عمل</b><span>85×54mm — للملفات</span></button>
              <button class="smp-size-opt" data-size="label"><b>ملصق · صغير</b><span>40×30mm — للّصق</span></button>
            </div>
            <label class="smp-chk" style="margin-top:14px"><input type="checkbox" id="smp-qr-toggle" checked> تضمين رمز QR</label>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    const bg = document.getElementById('smp-print-pick');
    bg.addEventListener('click', e => { if (e.target === bg) bg.remove(); });
    bg.querySelectorAll('[data-pclose]').forEach(b => b.addEventListener('click', () => bg.remove()));
    bg.querySelectorAll('.smp-size-opt').forEach(b =>
      b.addEventListener('click', () => {
        const withQR = document.getElementById('smp-qr-toggle').checked;
        bg.remove();
        printCard(b.dataset.size, withQR);
      }));
  }

  function printCard(size, withQR) {
    const s = S.selected;
    const code = s.barcode || '';
    const bc = barcodeSVG(code, size === 'label' ? 150 : size === 'card' ? 130 : 220, size === 'label' ? 40 : 50);
    const qrData = `${location.origin}${location.pathname}?sample=${s.id}`;
    const stAr = (STAGE[s.current_stage] || STAGE.new_request).ar;

    // أبعاد كل مقاس (mm)
    const DIM = { a6: [105, 148], card: [85, 54], label: [40, 30] };
    const [pw, ph] = DIM[size];

    // قوالب البطاقات لكل مقاس
    let body = '';
    if (size === 'a6') {
      body = `
        <div class="card a6">
          <div class="hd"><div><div class="hd-t">بطاقة تعريف عينة</div><div class="hd-s">Sample Identification Card</div></div><div class="hd-ic">🧪</div></div>
          <div class="bd">
            <div class="row1">
              <div class="ph">${s.image_path ? `<img src="${esc(s.image_path)}">` : '🧪'}</div>
              <div class="meta"><div class="nm">${esc(s.sample_type || s.client_name)}</div><div class="sub">${esc(s.client_name)}</div><div class="bdg">${esc(stAr)}</div></div>
            </div>
            <div class="grid">
              <div><span>رقم الطلب:</span> ${esc(s.request_number)}</div>
              <div><span>الكمية:</span> ${esc(s.quantity || 0)} ${esc(s.unit || '')}</div>
              <div><span>الأولوية:</span> ${(PRIORITY[s.priority] || PRIORITY.normal).ar}</div>
              <div><span>التاريخ:</span> ${fmtDate(s.created_at)}</div>
            </div>
            <div class="codes">
              <div class="bc">${bc}</div>
              ${withQR ? `<div class="qr" id="qr-box"></div>` : ''}
            </div>
          </div>
        </div>`;
    } else if (size === 'card') {
      body = `
        <div class="card card-m">
          <div class="bar"></div>
          <div class="bd">
            <div class="top"><div><div class="nm">${esc(s.sample_type || s.client_name)}</div><div class="sub">${esc(s.client_name)}</div></div><div class="num">${esc(s.request_number)}</div></div>
            <div class="bot"><div class="info"><div>الكمية: ${esc(s.quantity || 0)} ${esc(s.unit || '')}</div><div>${fmtDate(s.created_at)}</div></div><div class="codes">${bc}${withQR ? '<div class="qr" id="qr-box"></div>' : ''}</div></div>
          </div>
        </div>`;
    } else {
      body = `
        <div class="card label">
          <div class="lh">${esc(s.request_number)}</div>
          <div class="ln">${esc(s.sample_type || s.client_name)}</div>
          <div class="codes">${bc}${withQR ? '<div class="qr" id="qr-box"></div>' : ''}</div>
        </div>`;
    }

    const css = `
      *{margin:0;padding:0;box-sizing:border-box;font-family:'IBM Plex Sans Arabic',-apple-system,sans-serif}
      body{direction:rtl;background:#eee;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:10mm}
      .card{background:#fff;border:1px solid #555;overflow:hidden}
      .a6{width:${pw}mm;min-height:${ph}mm;border-radius:3mm}
      .a6 .hd{background:#0F6E56;color:#fff;padding:4mm 5mm;display:flex;justify-content:space-between;align-items:center}
      .a6 .hd-t{font-size:14pt;font-weight:600}.a6 .hd-s{font-size:7pt;opacity:.85}
      .a6 .hd-ic{font-size:16pt}
      .a6 .bd{padding:5mm}
      .a6 .row1{display:flex;gap:4mm;margin-bottom:4mm}
      .a6 .ph{width:22mm;height:22mm;border:0.3mm solid #ccc;border-radius:2mm;display:flex;align-items:center;justify-content:center;font-size:18pt;overflow:hidden}
      .a6 .ph img{width:100%;height:100%;object-fit:cover}
      .a6 .nm{font-size:13pt;font-weight:600}.a6 .sub{font-size:8pt;color:#666;margin:1mm 0}
      .a6 .bdg{display:inline-block;background:#EAF3DE;color:#3B6D11;font-size:7pt;padding:0.5mm 3mm;border-radius:5mm}
      .a6 .grid{display:grid;grid-template-columns:1fr 1fr;gap:1.5mm 3mm;font-size:8pt;border-top:0.3mm solid #eee;padding-top:3mm}
      .a6 .grid span{color:#999}
      .a6 .codes{display:flex;align-items:center;justify-content:space-between;gap:4mm;border-top:0.3mm solid #eee;margin-top:3mm;padding-top:3mm}
      .a6 .qr{width:20mm;height:20mm}
      .card-m{width:${pw}mm;height:${ph}mm;border-radius:2mm;display:flex}
      .card-m .bar{width:3mm;background:#0F6E56}
      .card-m .bd{flex:1;padding:3mm;display:flex;flex-direction:column;justify-content:space-between}
      .card-m .top{display:flex;justify-content:space-between}
      .card-m .nm{font-size:10pt;font-weight:600}.card-m .sub{font-size:7pt;color:#666}
      .card-m .num{font-size:9pt;font-weight:600;color:#0F6E56;font-family:monospace}
      .card-m .bot{display:flex;justify-content:space-between;align-items:flex-end;gap:3mm}
      .card-m .info{font-size:7pt;color:#666;line-height:1.6}
      .card-m .codes,.label .codes,.a6 .codes{display:flex;align-items:center;gap:2mm}
      .card-m .qr{width:12mm;height:12mm}
      .label{width:${pw}mm;height:${ph}mm;padding:2mm;border-style:dashed}
      .label .lh{font-size:8pt;font-weight:600;border-bottom:0.3mm solid #ddd;padding-bottom:1mm;margin-bottom:1mm}
      .label .ln{font-size:7pt;margin-bottom:1mm}
      .label .qr{width:9mm;height:9mm}
      @media print{body{background:#fff;padding:0}.card{border:none}@page{size:${pw}mm ${ph}mm;margin:0}}
    `;

    const w = window.open('', '_blank', 'width=600,height=700');
    w.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><title>${esc(s.request_number)}</title>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600&display=swap" rel="stylesheet">
      <style>${css}</style></head><body>${body}
      ${withQR ? `<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"><\/script>` : ''}
      <script>
        function go(){
          ${withQR ? `try{var box=document.getElementById('qr-box');if(box&&window.QRCode){new QRCode(box,{text:${JSON.stringify(qrData)},width:box.offsetWidth||60,height:box.offsetHeight||60,correctLevel:QRCode.CorrectLevel.M});}}catch(e){}` : ''}
          setTimeout(function(){window.focus();window.print();},500);
        }
        window.onload=go;
      <\/script>
      </body></html>`);
    w.document.close();
  }

  window.loadSamplesPage = loadSamplesPage;
  window.loadSampleWarehousePage = loadSamplesPage; // توافق مع الاسم القديم

  // ════════════════════════════════════════════════════════════════════
  //  الأنماط الديناميكية (تكمّلها samples.css)
  // ════════════════════════════════════════════════════════════════════
  const SMP_DYNAMIC_CSS = `
#smp-root{font-family:var(--font-primary,'IBM Plex Sans Arabic',sans-serif);color:var(--text-primary,#1a1a1a)}
.smp-loading,.smp-error,.smp-empty{padding:40px;text-align:center;color:var(--text-muted,#888)}
.smp-error{color:#c0392b}
`;
})();