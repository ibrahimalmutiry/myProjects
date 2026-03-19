/**
 * app-ceo-approvals.js
 * صفحة اعتمادات الرئيس التنفيذي
 * ═══════════════════════════════════════════════════════════
 */

// ── حالة الصفحة ─────────────────────────────────────────────
const CeoState = {
    reservations: [],
    filter: { status: '', search: '', year: '' },
    currentRes: null,         // الحجز المفتوح حاليًا
    stampSettings: null,      // إعدادات الختم
    signatureDataUrl: null,   // صورة التوقيع (base64)
    loaded: false,
};

// ── ثوابت الإجراءات ─────────────────────────────────────────
const CEO_ACTIONS = [
    { key: 'اعتماد', cls: 'approve', icon: '✅', label: 'اعتماد' },
    { key: 'مراجعة', cls: 'review', icon: '🔍', label: 'مراجعة' },
    { key: 'توجيه', cls: 'route', icon: '↪️', label: 'توجيه' },
    { key: 'رفض', cls: 'reject', icon: '❌', label: 'رفض' },
];

const ACTION_HISTORY_CLASSES = { 'اعتماد': 'approve', 'مراجعة': 'review', 'توجيه': 'route', 'رفض': 'reject' };

// ═══════════════════════════════════════════════════════════════
//  نقطة الدخول
// ═══════════════════════════════════════════════════════════════
async function loadCeoApprovalsPage() {
    // التحقق من الصلاحية على مستوى JS (الـ API تتحقق أيضاً)
    const role = (currentUser.role || '').toLowerCase();
    const level = (currentUser.permissionLevel || '').toLowerCase();
    const allowed = level === 'system_admin'
        || ['ceo', 'admin', 'الرئيس التنفيذي'].includes(currentUser.role);

    if (!allowed) {
        DOM.mainContent.innerHTML = `
        <div style="text-align:center;padding:4rem;color:var(--text-muted)">
            <div style="font-size:3rem;margin-bottom:1rem">🔒</div>
            <h2>صفحة مقيّدة</h2>
            <p>هذه الصفحة متاحة للرئيس التنفيذي ومدير النظام فقط.</p>
        </div>`;
        return;
    }

    DOM.mainContent.innerHTML = `
        <div class="ceo-page-wrap" id="ceo-page">
            <div class="ceo-loading">
                <div class="ceo-spinner"></div>
                <p>جارٍ تحميل بيانات الاعتمادات…</p>
            </div>
        </div>`;

    injectCeoStyles();

    await Promise.all([
        fetchCeoReservations(),
        fetchCeoStampSettings(),
        fetchCeoSignatureImage(),
    ]);

    CeoState.loaded = true;
    renderCeoPage();
}

// ═══════════════════════════════════════════════════════════════
//  جلب البيانات
// ═══════════════════════════════════════════════════════════════
async function fetchCeoReservations() {
    try {
        const p = new URLSearchParams();
        if (CeoState.filter.status) p.set('status', CeoState.filter.status);
        if (CeoState.filter.search) p.set('search', CeoState.filter.search);
        if (CeoState.filter.year) p.set('year', CeoState.filter.year);

        const res = await fetch(`api/ceo_approvals_api.php?action=list&${p}`);
        const raw = await res.text();
        let data; try { data = JSON.parse(raw); } catch (e) { console.error('[CEO] fetchReservations raw:', raw); CeoState.reservations = []; return; }
        if (data.success) CeoState.reservations = data.data || [];
    } catch (e) {
        console.error('[CEO] fetchReservations:', e);
        CeoState.reservations = [];
    }
}

async function fetchCeoStampSettings() {
    try {
        const res = await fetch('api/ceo_approvals_api.php?action=get_stamp');
        const raw = await res.text();
        let data; try { data = JSON.parse(raw); } catch (e) { console.error('[CEO] fetchStamp raw:', raw); return; }
        if (data.success) CeoState.stampSettings = data.data;
    } catch (e) { console.error('[CEO] fetchStamp:', e); }
}

async function fetchCeoSignatureImage() {
    try {
        const res = await fetch('api/ceo_approvals_api.php?action=get_signature_image');
        const raw = await res.text();
        let data; try { data = JSON.parse(raw); } catch (e) { console.error('[CEO] fetchSignature raw:', raw); return; }
        if (data.success && data.image) CeoState.signatureDataUrl = data.image;
    } catch (e) { console.error('[CEO] fetchSignature:', e); }
}

async function fetchCeoReservationDetail(id) {
    const res = await fetch(`api/ceo_approvals_api.php?action=get&id=${id}`);
    const data = await res.json();
    return data.success ? data.data : null;
}

// ═══════════════════════════════════════════════════════════════
//  رسم الصفحة
// ═══════════════════════════════════════════════════════════════
function renderCeoPage() {
    const wrap = document.getElementById('ceo-page');
    if (!wrap) return;

    const isAdmin = (currentUser.permissionLevel || '') === 'system_admin';
    const rows = CeoState.reservations;

    // إحصاء
    const stats = {
        total: rows.length,
        pending: rows.filter(r => !r.ceo_action).length,
        approved: rows.filter(r => r.ceo_action === 'اعتماد').length,
        rejected: rows.filter(r => r.ceo_action === 'رفض').length,
        review: rows.filter(r => r.ceo_action === 'مراجعة' || r.ceo_action === 'توجيه').length,
    };

    wrap.innerHTML = `
    <!-- هيدر الصفحة -->
    <div class="ceo-page-header">
        <div class="ceo-header-title">
            <div class="ceo-header-icon">🏛️</div>
            <div>
                <h1>صفحة الاعتمادات</h1>
                <p>اعتمادات الرئيس التنفيذي — حجوزات الموازنة</p>
            </div>
        </div>
        <div class="ceo-header-badge">
            <span>⏳</span>
            <strong>${stats.pending}</strong> بانتظار القرار
        </div>
    </div>

    <!-- إحصاءات -->
    <div class="ceo-stats-grid">
        <div class="ceo-stat-card">
            <span class="ceo-stat-label">إجمالي الحجوزات</span>
            <span class="ceo-stat-value">${stats.total}</span>
        </div>
        <div class="ceo-stat-card pending">
            <span class="ceo-stat-label">بانتظار القرار</span>
            <span class="ceo-stat-value">${stats.pending}</span>
        </div>
        <div class="ceo-stat-card approved">
            <span class="ceo-stat-label">معتمد</span>
            <span class="ceo-stat-value">${stats.approved}</span>
        </div>
        <div class="ceo-stat-card rejected">
            <span class="ceo-stat-label">مرفوض</span>
            <span class="ceo-stat-value">${stats.rejected}</span>
        </div>
        <div class="ceo-stat-card">
            <span class="ceo-stat-label">مراجعة / توجيه</span>
            <span class="ceo-stat-value">${stats.review}</span>
        </div>
    </div>

    <!-- شريط الفلترة -->
    <div class="ceo-filter-bar">
        <input type="text" id="ceoSearchInput" aria-label="بحث برقم أو غرض الحجز" placeholder="🔍 بحث برقم أو غرض الحجز…"
               value="${CeoState.filter.search}"
               onInput="debounce(()=>{ CeoState.filter.search=this.value; refreshCeoList(); }, 350)()"
               style="flex:1;min-width:200px">
        <select id="ceoStatusFilter" aria-label="فلترة حسب الحالة" onchange="CeoState.filter.status=this.value; refreshCeoList()">
            <option value="" ${!CeoState.filter.status ? 'selected' : ''}>جميع الحالات</option>
            <option value="معتمد"        ${CeoState.filter.status === 'معتمد' ? 'selected' : ''}>معتمد</option>
            <option value="قيد المراجعة" ${CeoState.filter.status === 'قيد المراجعة' ? 'selected' : ''}>قيد المراجعة</option>
        </select>
        <button onclick="refreshCeoList()" style="padding:.5rem 1rem;background:var(--ceo-navy,#1e3a5f);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:.83rem;">
            🔄 تحديث
        </button>
    </div>

    <!-- الجدول -->
    <div class="ceo-table-wrap">
        ${rows.length === 0
            ? `<div class="ceo-empty-state">
                <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                </svg>
                <p>لا توجد حجوزات معتمدة حتى الآن</p>
               </div>`
            : `<table class="ceo-table">
                <thead>
                    <tr>
                        <th>رقم الحجز</th>
                        <th>الغرض</th>
                        <th>القسم</th>
                        <th>المبلغ</th>
                        <th>الأولوية</th>
                        <th>حالة النظام</th>
                        <th>قرار الرئيس</th>
                        <th>الإجراء</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.map(r => renderCeoRow(r)).join('')}
                </tbody>
               </table>`
        }
    </div>

    <!-- لوحة إعدادات الختم (مدير النظام فقط) -->
    ${isAdmin ? renderCeoStampPanel() : ''}

    <!-- مودال التفاصيل -->
    <div class="ceo-modal-overlay" id="ceoModalOverlay" onclick="closeCeoModal(event)">
        <div class="ceo-modal" id="ceoModal">
            <div class="ceo-modal-head">
                <h2 id="ceoModalTitle">تفاصيل الحجز</h2>
                <button class="ceo-modal-close-btn" onclick="closeCeoModal()">✕</button>
            </div>
            <div class="ceo-modal-body" id="ceoModalBody">
                <!-- يُملأ ديناميكياً -->
            </div>
        </div>
    </div>
    `;
}

function renderCeoRow(r) {
    const hasCeoAction = !!r.ceo_action;
    const prioClass = r.priority === 'عاجل' ? 'urgent' : r.priority === 'حرج' ? 'critical' : 'normal';
    const statusCls = r.status === 'معتمد' ? 'approved' : r.status === 'مرفوض' ? 'rejected' : 'pending';
    const ceoCls = r.ceo_action
        ? (r.ceo_action === 'اعتماد' ? 'approved' : r.ceo_action === 'رفض' ? 'rejected' : 'review')
        : 'new';

    const amt = r.grand_total_sar || r.grand_total || 0;
    const cur = r.currency || 'SAR';

    return `<tr onclick="openCeoReservation(${r.id})">
        <td data-label="رقم الحجز">
            <strong style="color:var(--ceo-navy)">${r.reservation_number || '#' + r.id}</strong>
        </td>
        <td data-label="الغرض" style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
            ${escHtml(r.purpose || '—')}
        </td>
        <td data-label="القسم">${escHtml(r.department_name || '—')}</td>
        <td data-label="المبلغ">
            <strong>${fmtMoney(amt, cur)}</strong>
            ${cur !== 'SAR' ? `<br><small style="color:var(--text-muted)">${fmtMoney(r.grand_total || 0, cur)}</small>` : ''}
        </td>
        <td data-label="الأولوية">
            <span class="ceo-priority-dot ${prioClass}"></span>${r.priority || 'عادي'}
        </td>
        <td data-label="الحالة النظام">
            <span class="ceo-badge ${statusCls}">${r.status || '—'}</span>
        </td>
        <td data-label="قرار الرئيس">
            ${hasCeoAction
            ? `<span class="ceo-badge ${ceoCls}">${r.ceo_action}</span>
                   <br><small style="color:var(--text-muted);font-size:.7rem">${fmtDateTime(r.ceo_action_date)}</small>`
            : `<span class="ceo-badge new">⏳ لم يُتخذ</span>`
        }
        </td>
        <td data-label="الإجراء" onclick="event.stopPropagation()">
            <button class="ceo-open-btn" onclick="openCeoReservation(${r.id})">فتح ▸</button>
        </td>
    </tr>`;
}

// ── لوحة الختم (HTML) ──────────────────────────────────────────
function renderCeoStampPanel() {
    const s = CeoState.stampSettings || {};
    const shapeOpts = ['circle', 'square', 'hexagon', 'oval'];
    const shapeLabels = { circle: 'دائرة', square: 'مربع', hexagon: 'سداسي', oval: 'بيضاوي' };

    return `
    <div class="ceo-stamp-panel">
        <div class="ceo-stamp-panel-header">
            <span style="font-size:1.3rem">⚙️</span>
            <h3>إعدادات الختم والتوقيع <small style="font-weight:400;color:var(--text-muted);font-size:.78rem">(مدير النظام فقط)</small></h3>
        </div>
        <div class="ceo-stamp-panel-body">
            <div class="ceo-stamp-col">
                <div class="ceo-form-group">
                    <label for="ceoStampText">نص الختم</label>
                    <input id="ceoStampText" type="text" value="${escHtml(s.stamp_text || 'معتمد')}"
                           oninput="updateCeoStampPreview()">
                </div>
                <div class="ceo-form-group">
                    <label for="ceoStampColor">لون الختم</label>
                    <div style="display:flex;gap:.5rem;align-items:center">
                        <input id="ceoStampColor" type="color" value="${s.stamp_color || '#1e40af'}"
                               oninput="updateCeoStampPreview()"
                               style="width:48px;height:36px;padding:2px;cursor:pointer">
                        <input id="ceoStampColorHex" type="text" value="${s.stamp_color || '#1e40af'}"
                               style="flex:1"
                               oninput="document.getElementById('ceoStampColor').value=this.value; updateCeoStampPreview()">
                    </div>
                </div>
                <div class="ceo-form-group">
                    <label for="ceoStampShape">شكل الختم</label>
                    <select id="ceoStampShape" onchange="updateCeoStampPreview()">
                        ${shapeOpts.map(sh => `<option value="${sh}" ${(s.stamp_shape || 'circle') === sh ? 'selected' : ''}>${shapeLabels[sh]}</option>`).join('')}
                    </select>
                </div>
                <div class="ceo-form-group">
                    <label for="ceoSigName">اسم صاحب التوقيع (يظهر أسفل التوقيع)</label>
                    <input id="ceoSigName" type="text" value="${escHtml(s.signature_name || '')}"
                           placeholder="مثال: المدير التنفيذي - أ. محمد السعيد">
                </div>
            </div>

            <div class="ceo-stamp-col">
                <!-- حجم التوقيع في PDF -->
                <div class="ceo-form-group">
                    <label for="ceoSigPdfSize">حجم التوقيع في PDF: <span id="sigPdfSizeVal">${CeoState.stampSettings?.sig_pdf_size || 130}</span>px</label>
                    <input id="ceoSigPdfSize" type="range" min="60" max="250"
                           value="${CeoState.stampSettings?.sig_pdf_size || 130}"
                           oninput="
                             const v = parseInt(this.value);
                             document.getElementById('sigPdfSizeVal').textContent = v;
                             CeoState.sigPosition = Object.assign(CeoState.sigPosition||{}, {width:v});
                             const previewImg = document.querySelector('.ceo-sig-in-preview');
                             if (previewImg) previewImg.style.maxWidth = v + 'px';
                           "
                           style="width:100%;accent-color:var(--ceo-navy,#1e3a5f)">
                    <div style="display:flex;justify-content:space-between;font-size:.68rem;color:#94a3b8;margin-top:2px">
                        <span>صغير</span><span>كبير</span>
                    </div>
                </div>

                <!-- منطقة رفع التوقيع -->
                <div class="ceo-form-group">
                    <label for="ceoSigFile">صورة التوقيع اليدوي (PNG / JPG)</label>
                    <div class="ceo-sig-upload-area" id="ceoSigUploadArea">
                        <input type="file" accept="image/*" id="ceoSigFile" onchange="handleCeoSignatureUpload(this)">
                        <div id="ceoSigUploadContent">
                            ${CeoState.signatureDataUrl
            ? `<img src="${CeoState.signatureDataUrl}" class="ceo-sig-preview" id="ceoSigPreviewImg">
                                   <p style="font-size:.75rem;color:var(--text-muted);margin:.5rem 0 0">انقر لتغيير الصورة</p>`
            : `<span style="font-size:2rem">✍️</span>
                                   <p style="font-size:.82rem;color:var(--text-muted);margin:.35rem 0 0">
                                     اسحب وأفلت أو انقر لرفع صورة التوقيع
                                   </p>
                                   <p style="font-size:.75rem;color:var(--text-muted);margin:.2rem 0 0">
                                     سيتم استخراج التوقيع بخلفية شفافة تلقائياً
                                   </p>`
        }
                        </div>
                        <div id="ceoSigProcessing" style="display:none" class="ceo-sig-processing">
                            <div class="ceo-sig-spinner"></div>
                            <span>يجري تحليل الصورة واستخراج التوقيع بخلفية شفافة…</span>
                        </div>
                    </div>
                </div>

                <!-- معاينة الختم -->
                <div class="ceo-stamp-preview-wrap">
                    <p>معاينة الختم</p>
                    <div id="ceoStampLivePreview">
                        ${buildCeoStampHtml(s)}
                    </div>
                    ${CeoState.signatureDataUrl
            ? `<img src="${CeoState.signatureDataUrl}" style="max-height:55px;max-width:140px;object-fit:contain;margin-top:.35rem;">`
            : ''
        }
                </div>

                <button class="ceo-save-btn" onclick="saveCeoStampSettings()">
                    💾 حفظ الإعدادات
                </button>
            </div>
        </div>
    </div>`;
}

// ── بناء HTML الختم ────────────────────────────────────────────
function buildCeoStampHtml(settings, small = false) {
    const s = settings || CeoState.stampSettings || {};
    const color = s.stamp_color || '#1e40af';
    const bgColor = s.stamp_bg_color || `rgba(30,64,175,.06)`;
    const shape = s.stamp_shape || 'circle';
    const text = s.stamp_text || 'معتمد';
    const size = small ? 90 : 110;

    const radiusMap = { circle: '50%', square: '12px', hexagon: '8px', oval: '50%' };
    const radius = radiusMap[shape] || '50%';
    const widthMap = { circle: size, square: size, hexagon: size, oval: size * 1.4 };
    const w = widthMap[shape] || size;

    return `<div style="
        width:${w}px; height:${size}px;
        border: 3px solid ${color};
        border-radius: ${radius};
        background: ${bgColor};
        color: ${color};
        display:flex; flex-direction:column;
        align-items:center; justify-content:center;
        font-size:${small ? '.7rem' : '.82rem'};
        font-weight:800;
        text-align:center;
        line-height:1.3;
        padding:.4rem;
        position:relative;
        ">
        <div style="position:absolute;inset:5px;border:1.5px dashed ${color};border-radius:inherit;opacity:.4;"></div>
        <div style="font-size:${small ? '.85rem' : '1rem'};font-weight:900;letter-spacing:.04em;">${escHtml(text)}</div>
        <div style="font-size:${small ? '.58rem' : '.65rem'};opacity:.75;">معتمد رسمياً</div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════
//  مودال تفاصيل الحجز
// ═══════════════════════════════════════════════════════════════
async function openCeoReservation(id) {
    const overlay = document.getElementById('ceoModalOverlay');
    const body = document.getElementById('ceoModalBody');
    const title = document.getElementById('ceoModalTitle');
    if (!overlay || !body) return;

    body.innerHTML = `<div class="ceo-loading"><div class="ceo-spinner"></div><p>جارٍ التحميل…</p></div>`;
    overlay.classList.add('open');

    const res = await fetchCeoReservationDetail(id);
    if (!res) {
        body.innerHTML = `<p style="text-align:center;color:var(--ceo-reject)">تعذّر تحميل بيانات الحجز.</p>`;
        return;
    }

    CeoState.currentRes = res;
    title.textContent = `تفاصيل الحجز — ${res.reservation_number || '#' + res.id}`;

    const hasCeoAction = res.ceo_actions && res.ceo_actions.length > 0;
    const lastAction = hasCeoAction ? res.ceo_actions[res.ceo_actions.length - 1] : null;

    // ألوان badges
    const scModal = {
        'معتمد': { bg: '#dcfce7', color: '#15803d' }, 'مرفوض': { bg: '#fee2e2', color: '#dc2626' },
        'قيد المراجعة': { bg: '#fef3c7', color: '#92400e' }
    };
    const sc = scModal[res.status] || { bg: '#e2e8f0', color: '#475569' };
    const pcModal = { 'عاجل': { bg: '#fee2e2', color: '#dc2626' }, 'حرج': { bg: '#fef3c7', color: '#92400e' } };
    const pc = pcModal[res.priority] || { bg: '#e0f2fe', color: '#0369a1' };
    const grandTotal = res.grand_total_sar || res.grand_total || 0;
    const actionDotMap = { 'اعتماد': 'approve', 'مراجعة': 'review', 'توجيه': 'route', 'رفض': 'reject' };

    body.innerHTML = `
    <!-- ── هيدر الحجز بتصميم rdv2 ── -->
    <div style="
        display:flex; justify-content:space-between; align-items:center;
        padding:.6rem .85rem;
        background:linear-gradient(135deg,#1e3a5f,#1e40af);
        color:#fff; border-radius:10px; margin-bottom:.75rem;
    ">
      <div style="display:flex;align-items:center;gap:.55rem">
        <div style="width:34px;height:34px;background:rgba(255,255,255,.15);border-radius:8px;
                    display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">📋</div>
        <div>
          <div style="font-size:1rem;font-weight:800;font-family:monospace;letter-spacing:.5px">
            ${escHtml(res.reservation_number || '#' + res.id)}
          </div>
          <div style="font-size:.68rem;opacity:.8;margin-top:.1rem">${escHtml(res.purpose || '')}</div>
        </div>
      </div>
      <div style="text-align:left;display:flex;flex-direction:column;align-items:flex-start;gap:.25rem">
        <div style="font-size:1.1rem;font-weight:800">${fmtMoney(grandTotal, res.currency)}</div>
        <div style="display:flex;gap:.3rem;flex-wrap:wrap">
          <span style="font-size:.62rem;font-weight:700;padding:.1rem .42rem;border-radius:20px;
                       background:${sc.bg};color:${sc.color}">${escHtml(res.status || '—')}</span>
          <span style="font-size:.62rem;font-weight:700;padding:.1rem .42rem;border-radius:20px;
                       background:${pc.bg};color:${pc.color}">${escHtml(res.priority || 'عادي')}</span>
        </div>
      </div>
    </div>

    <!-- ── شبكة المعلومات rdv2 ── -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:.3rem;margin-bottom:.75rem">
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;padding:.3rem .48rem;grid-column:span 2">
        <div style="font-size:.58rem;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.3px;margin-bottom:.08rem">الغرض / الوصف</div>
        <div style="font-size:.72rem;font-weight:500;color:#1e293b;line-height:1.4">${escHtml(res.purpose || '—')}</div>
      </div>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;padding:.3rem .48rem">
        <div style="font-size:.58rem;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.3px;margin-bottom:.08rem">تاريخ الطلب</div>
        <div style="font-size:.72rem;font-weight:600;color:#1e293b">${fmtDate(res.request_date)}</div>
      </div>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;padding:.3rem .48rem">
        <div style="font-size:.58rem;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.3px;margin-bottom:.08rem">السنة المالية</div>
        <div style="font-size:.72rem;font-weight:600;color:#1e293b;font-family:monospace">${res.fiscal_year || '—'}</div>
      </div>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;padding:.3rem .48rem">
        <div style="font-size:.58rem;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.3px;margin-bottom:.08rem">القسم</div>
        <div style="font-size:.72rem;font-weight:600;color:#1e293b">${escHtml(res.department_name || '—')}</div>
      </div>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;padding:.3rem .48rem">
        <div style="font-size:.58rem;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.3px;margin-bottom:.08rem">مقدّم الطلب</div>
        <div style="font-size:.72rem;font-weight:600;color:#1e293b">${escHtml(res.requested_by_name || '—')}</div>
      </div>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;padding:.3rem .48rem">
        <div style="font-size:.58rem;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.3px;margin-bottom:.08rem">المورد</div>
        <div style="font-size:.72rem;font-weight:600;color:#1e293b">${escHtml(res.supplier_name || '—')}</div>
      </div>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;padding:.3rem .48rem">
        <div style="font-size:.58rem;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.3px;margin-bottom:.08rem">بند الموازنة</div>
        <div style="font-size:.72rem;font-weight:600;color:#1e293b">${escHtml(res.budget_category || '—')}</div>
      </div>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;padding:.3rem .48rem">
        <div style="font-size:.58rem;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.3px;margin-bottom:.08rem">مركز التكلفة</div>
        <div style="font-size:.72rem;font-weight:600;color:#1e293b">${escHtml(res.cost_center || '—')}</div>
      </div>
      <div style="background:linear-gradient(135deg,#eff6ff,#dbeafe);border:1px solid #93c5fd;border-radius:4px;padding:.3rem .48rem">
        <div style="font-size:.58rem;color:#1d4ed8;font-weight:700;text-transform:uppercase;letter-spacing:.3px;margin-bottom:.08rem">المبلغ الإجمالي</div>
        <div style="font-size:.86rem;font-weight:800;color:#1e3a5f">${fmtMoney(grandTotal, res.currency)}</div>
        ${res.currency && res.currency !== 'SAR'
            ? `<div style="font-size:.62rem;color:#64748b">${fmtMoney(res.grand_total || 0, res.currency)}</div>` : ''}
      </div>
    </div>

    <!-- ── جدول الأصناف بتصميم rdv2 ── -->
    ${res.items && res.items.length ? `
    <div style="font-size:.6rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.4px;
                display:flex;align-items:center;gap:.25rem;padding:.1rem 0 .2rem;margin-bottom:.2rem;
                border-bottom:1px solid #e2e8f0">
      📦 بنود وأصناف الحجز
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:.82rem;margin-bottom:.75rem">
      <thead>
        <tr style="background:#1e3a8a !important;color:#fff !important">
          <th style="padding:.5rem .6rem;font-weight:700;font-size:.75rem;text-align:center;width:32px">#</th>
          <th style="padding:.5rem .6rem;font-weight:700;font-size:.75rem;text-align:right;width:35%">الوصف</th>
          <th style="padding:.5rem .6rem;font-weight:700;font-size:.75rem;text-align:center;width:60px">الكمية</th>
          <th style="padding:.5rem .6rem;font-weight:700;font-size:.75rem;text-align:center;width:60px">الوحدة</th>
          <th style="padding:.5rem .6rem;font-weight:700;font-size:.75rem;text-align:left;width:100px">سعر الوحدة</th>
          <th style="padding:.5rem .6rem;font-weight:700;font-size:.75rem;text-align:left;width:110px">الإجمالي</th>
        </tr>
      </thead>
      <tbody>
        ${res.items.map((it, i) => `
        <tr style="${i % 2 === 1 ? 'background:#f8fafc' : ''}">
          <td style="padding:.5rem .6rem;border-bottom:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:.75rem">${i + 1}</td>
          <td style="padding:.5rem .6rem;border-bottom:1px solid #e2e8f0;font-weight:500">${escHtml(it.description || '')}</td>
          <td style="padding:.5rem .6rem;border-bottom:1px solid #e2e8f0;text-align:center;color:#475569">${it.qty || '—'}</td>
          <td style="padding:.5rem .6rem;border-bottom:1px solid #e2e8f0;text-align:center;color:#64748b;font-size:.78rem">${escHtml(it.unit || '—')}</td>
          <td style="padding:.5rem .6rem;border-bottom:1px solid #e2e8f0;text-align:left;direction:ltr;font-family:monospace;color:#475569">${fmtMoney(it.unit_price || 0, res.currency)}</td>
          <td style="padding:.5rem .6rem;border-bottom:1px solid #e2e8f0;text-align:left;direction:ltr;font-family:monospace;font-weight:700;color:#1d4ed8">${fmtMoney(it.line_total || 0, res.currency)}</td>
        </tr>`).join('')}
      </tbody>
      <tfoot>
        <tr style="background:#dbeafe !important">
          <td colspan="5" style="padding:.45rem .6rem;border-top:2px solid #93c5fd;font-size:.82rem;font-weight:700;text-align:right">الإجمالي الكلي</td>
          <td style="padding:.45rem .6rem;border-top:2px solid #93c5fd;font-size:.88rem;font-weight:800;text-align:left;direction:ltr;font-family:monospace;color:#1d4ed8">${fmtMoney(grandTotal, res.currency)}</td>
        </tr>
      </tfoot>
    </table>` : ''}

    <!-- ── بطاقة الاعتماد rdv2 (تظهر بعد الاعتماد) ── -->
    ${lastAction && lastAction.action_type === 'اعتماد' ? `
    <div id="ceoStampWrap" style="
        border:1.5px solid #86efac;
        background:linear-gradient(135deg,#f0fdf4,#dcfce7);
        border-radius:8px; padding:.5rem .75rem; margin-bottom:.75rem;
        display:flex; justify-content:space-between; align-items:center; gap:16px;
    ">
      <!-- التوقيع + الختم على اليمين -->
      <div style="display:flex;align-items:center;gap:14px;flex-shrink:0">
        <div>
          ${buildCeoStampHtml(CeoState.stampSettings)}
        </div>
        ${CeoState.signatureDataUrl ? `
        <div style="display:flex;flex-direction:column;align-items:center;gap:4px">
          <div style="padding-bottom:4px;border-bottom:1px solid #86efac">
            <img src="${CeoState.signatureDataUrl}"
                 style="width:${CeoState.stampSettings?.sig_pdf_size || 100}px;height:auto;display:block;object-fit:contain">
          </div>
          ${CeoState.stampSettings?.signature_name
                    ? `<div style="font-size:.65rem;color:#15803d;font-weight:600">${escHtml(CeoState.stampSettings.signature_name)}</div>`
                    : ''}
        </div>` : ''}
      </div>
      <!-- بيانات الاعتماد على اليسار -->
      <div style="font-size:.78rem;line-height:1.85;color:#166534;text-align:right;flex:1">
        <div style="font-weight:800;font-size:.85rem;color:#14532d;margin-bottom:4px">✅ معتمد رسمياً</div>
        <div><strong>بواسطة:</strong> ${escHtml(lastAction.actor_name)}</div>
        <div><strong>المنصب:</strong> ${escHtml(lastAction.actor_position || '—')}</div>
        <div><strong>التاريخ:</strong> ${fmtDateTime(lastAction.action_date)}</div>
        ${lastAction.notes ? `<div style="margin-top:3px;font-style:italic">${escHtml(lastAction.notes)}</div>` : ''}
      </div>
    </div>` : ''}

    <!-- ── أزرار الإجراءات ── -->
    <div class="ceo-section-title">⚡ الإجراء</div>
    <textarea class="ceo-notes-field" id="ceoActionNotes"
              placeholder="ملاحظات إضافية (اختياري)…" rows="2"></textarea>
    <div class="ceo-action-buttons" id="ceoActionButtons">
        ${CEO_ACTIONS.map(a => {
                        const isUsed = hasCeoAction;
                        const isActive = lastAction && lastAction.action_type === a.key;
                        return `<button
                class="ceo-action-btn ${a.cls}${isUsed && !isActive ? ' used' : ''}${isActive ? ' active-action' : ''}"
                id="ceoBtn_${a.key}"
                onclick="executeCeoAction('${a.key}', ${res.id})"
                ${isUsed && !isActive ? 'disabled title="تم تنفيذ إجراء على هذا الحجز مسبقاً"' : ''}>
                <span class="btn-icon">${a.icon}</span>
                <span>${a.label}</span>
                ${isActive ? '<span style="font-size:.65rem;opacity:.8">✔ تم التنفيذ</span>' : ''}
            </button>`;
                    }).join('')}
    </div>

    <!-- ── سجل الإجراءات بتصميم rdv2 ── -->
    ${hasCeoAction ? `
    <div class="ceo-section-title" style="margin-top:1rem">📋 سجل الإجراءات</div>
    <div style="display:flex;flex-direction:column;gap:.28rem;margin-top:.35rem">
      ${res.ceo_actions.map(a => `
      <div style="display:flex;gap:.38rem;align-items:flex-start">
        <div style="width:7px;height:7px;border-radius:50%;flex-shrink:0;margin-top:.3rem;
                    background:${{ 'اعتماد': '#22c55e', 'رفض': '#ef4444', 'مراجعة': '#f59e0b', 'توجيه': '#6366f1' }[a.action_type] || '#94a3b8'}">
        </div>
        <div style="flex:1;font-size:.74rem">
          <span style="font-weight:600;color:#1e293b">${escHtml(a.action_type)}</span>
          <span style="color:#64748b;margin-right:.15rem"> — ${escHtml(a.actor_name)}</span>
          <span style="color:#94a3b8;font-size:.68rem">${fmtDateTime(a.action_date)}</span>
          ${a.notes ? `<div style="color:#475569;font-size:.68rem;margin-top:.05rem;
                                   background:#f1f5f9;padding:.08rem .32rem;border-radius:3px">
                         ${escHtml(a.notes)}</div>` : ''}
        </div>
      </div>`).join('')}
    </div>` : ''}

    <!-- ── زر PDF ── -->
    ${lastAction && lastAction.action_type === 'اعتماد' ? `
    <div style="margin-top:1.25rem;display:flex;gap:.75rem;flex-wrap:wrap">
        <button class="ceo-pdf-btn" onclick="exportCeoApprovalPdf(${res.id})">
            📄 تصدير PDF وأرشفة
        </button>
    </div>` : ''}
    `;
}

function closeCeoModal(e) {
    if (e && e.target !== document.getElementById('ceoModalOverlay')) return;
    document.getElementById('ceoModalOverlay')?.classList.remove('open');
    document.getElementById('draggableSig')?.remove(); // احذف التوقيع الطافي
    CeoState.currentRes = null;
}

// ═══════════════════════════════════════════════════════════════
//  تنفيذ الإجراء
// ═══════════════════════════════════════════════════════════════
async function executeCeoAction(actionType, reservationId) {
    const notes = document.getElementById('ceoActionNotes')?.value || '';
    const btn = document.getElementById(`ceoBtn_${actionType}`);

    if (!confirm(`هل تريد تنفيذ إجراء "${actionType}" على هذا الحجز؟\nلا يمكن التراجع عن هذا الإجراء.`)) return;

    // تعطيل جميع الأزرار
    CEO_ACTIONS.forEach(a => {
        const b = document.getElementById(`ceoBtn_${a.key}`);
        if (b) { b.disabled = true; b.classList.add('used'); }
    });

    try {
        const httpRes = await fetch('api/ceo_approvals_api.php?action=do_action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reservation_id: reservationId, action_type: actionType, notes }),
        });

        const rawText = await httpRes.text();
        let data;
        try {
            data = JSON.parse(rawText);
        } catch (parseErr) {
            console.error('[CEO] do_action raw response:', rawText);
            showToast('خطأ في الخادم — راجع Console للتفاصيل', 'error');
            CEO_ACTIONS.forEach(a => {
                const b = document.getElementById(`ceoBtn_${a.key}`);
                if (b) { b.disabled = false; b.classList.remove('used'); }
            });
            return;
        }

        if (data.success) {
            showToast(`✅ ${data.message}`, 'success');
            if (btn) { btn.classList.remove('used'); btn.classList.add('active-action'); }
            if (actionType === 'اعتماد') {
                setTimeout(() => exportCeoApprovalPdf(reservationId), 600);
            }
            await fetchCeoReservations();
            renderCeoListOnly();
        } else {
            showToast(`❌ ${data.message}`, 'error');
            CEO_ACTIONS.forEach(a => {
                const b = document.getElementById(`ceoBtn_${a.key}`);
                if (b) { b.disabled = false; b.classList.remove('used'); }
            });
        }
    } catch (e) {
        showToast('خطأ في الاتصال بالخادم', 'error');
        console.error('[CEO] executeCeoAction:', e);
    }
}

// ── إعادة رسم القائمة فقط بدون إغلاق المودال ──────────────────
function renderCeoListOnly() {
    const tableWrap = document.querySelector('.ceo-table-wrap');
    if (!tableWrap) return;

    const rows = CeoState.reservations;
    if (rows.length === 0) {
        tableWrap.innerHTML = `<div class="ceo-empty-state"><p>لا توجد حجوزات</p></div>`;
    } else {
        tableWrap.innerHTML = `<table class="ceo-table">
            <thead><tr>
                <th>رقم الحجز</th><th>الغرض</th><th>القسم</th><th>المبلغ</th>
                <th>الأولوية</th><th>حالة النظام</th><th>قرار الرئيس</th><th>الإجراء</th>
            </tr></thead>
            <tbody>${rows.map(r => renderCeoRow(r)).join('')}</tbody>
        </table>`;
    }

    // تحديث الإحصاءات
    const statCards = document.querySelectorAll('.ceo-stat-value');
    if (statCards.length >= 5) {
        statCards[0].textContent = rows.length;
        statCards[1].textContent = rows.filter(r => !r.ceo_action).length;
        statCards[2].textContent = rows.filter(r => r.ceo_action === 'اعتماد').length;
        statCards[3].textContent = rows.filter(r => r.ceo_action === 'رفض').length;
        statCards[4].textContent = rows.filter(r => ['مراجعة', 'توجيه'].includes(r.ceo_action)).length;
    }
}

// ═══════════════════════════════════════════════════════════════
//  تصدير PDF وأرشفة
// ═══════════════════════════════════════════════════════════════

// ── ختم SVG للـ PDF (يتجنب مشاكل RTL في html2pdf) ──────────────
function buildCeoStampSvg(settings) {
    const s = settings || CeoState.stampSettings || {};
    const color = s.stamp_color || '#1e40af';
    const text = s.stamp_text || 'معتمد';
    const size = 100;

    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
        <circle cx="50" cy="50" r="47" fill="rgba(30,64,175,0.05)" stroke="${color}" stroke-width="3"/>
        <circle cx="50" cy="50" r="40" fill="none" stroke="${color}" stroke-width="1" stroke-dasharray="4,3" opacity="0.4"/>
        <text x="50" y="48" text-anchor="middle" font-family="Arial,Tahoma" font-size="14"
              font-weight="bold" fill="${color}" direction="rtl">${escHtml(text)}</text>
        <text x="50" y="63" text-anchor="middle" font-family="Arial,Tahoma" font-size="8"
              fill="${color}" opacity="0.7" direction="rtl">معتمد رسمياً</text>
    </svg>`;
}

// ── CSS تصميم rdv2 للـ PDF ────────────────────────────────────
function getCeoRdv2PrintCSS() {
    return `

        @page { size: A4 portrait; margin: 7mm 8mm; }
        * {font-variant-ligatures: none; text-rendering: geometricPrecision; -webkit-font-smoothing: antialiased; box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact;  direction: rtl;   unicode-bidi: embed; }
        html, body { margin:0; padding:0; background:#fff; }
        body { font-size:10.5px; font-family:Tahoma,Arial,sans-serif; color:#1e293b; }

        .rdv2-shell { width:100%; padding: 6mm 8mm; }
        .rdv2-doc   { background:#fff; border:none; box-shadow:none; border-radius:0; }

        /* رأس الوثيقة */
        .rdv2-doc-header {
            display:flex; justify-content:space-between; align-items:center;
            padding:.55rem .85rem;
            background:linear-gradient(135deg,#1e3a5f,#1e40af) !important;
            color:#fff;
        }
        .rdv2-doc-logo  { display:flex; align-items:center; gap:.5rem; }
        .rdv2-logo-icon { width:32px; height:32px; background:rgba(255,255,255,.15);
            border-radius:8px; display:flex; align-items:center; justify-content:center;
            flex-shrink:0; font-size:18px; }
        .rdv2-org-name  { font-size:.82rem; font-weight:700; }
        .rdv2-org-sub   { font-size:.6rem; opacity:.75; margin-top:.05rem; }
        .rdv2-doc-id-block { display:flex; flex-direction:column; align-items:flex-start; gap:.15rem; }
        .rdv2-doc-num   { font-size:1rem; font-weight:800; font-family:monospace; letter-spacing:.5px; }
        .rdv2-doc-date  { font-size:.62rem; opacity:.8; }
        .rdv2-doc-badges { display:flex; gap:.35rem; margin-top:.2rem; }
        .rdv2-status-badge, .rdv2-prio-badge {
            font-size:.62rem; font-weight:700; padding:.1rem .45rem;
            border-radius:20px; display:inline-flex; align-items:center; gap:.2rem; background:#fff;
        }

        /* فاصل وشبكة المعلومات */
        .rdv2-divider   { height:1px; background:#e2e8f0; margin:.28rem 0; }
        .rdv2-info-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:.3rem; padding:.3rem 0; }
        .rdv2-span2     { grid-column:span 2; }
        .rdv2-info-cell { background:#f8fafc; border:1px solid #e2e8f0; border-radius:4px; padding:.3rem .48rem; }
        .rdv2-info-lbl  { font-size:.72rem; color:#64748b; font-weight:700;
            text-transform:uppercase; letter-spacing:.3px; margin-bottom:.1rem; }
        .rdv2-info-val  { font-size:.74rem; font-weight:600; color:#1e293b; line-height:1.35; }
        .rdv2-info-val.rdv2-purpose { font-weight:500; font-size:.7rem; line-height:1.45; }
        .rdv2-mono      { font-family:monospace; }
        .rdv2-total-val { font-size:.88rem; font-weight:800; color:#1e3a5f; }

        /* عنوان القسم */
        .rdv2-section-title {
            font-size:.62rem; font-weight:700; color:#64748b; text-transform:uppercase;
            letter-spacing:.4px; display:flex; align-items:center; gap:.25rem;
            padding:.12rem 0 .2rem; margin-top:.25rem;
            border-bottom:1px solid #e2e8f0;
        }

        /* جدول الأصناف */
        .rdv2-items-tbl { width:100%; border-collapse:collapse; font-size:.82rem; }
        .rdv2-items-tbl thead tr { background:#1e3a8a !important; color:#fff !important; }
        .rdv2-items-tbl thead th {
            padding:.5rem .7rem; font-weight:700; font-size:.76rem;
            text-align:right; white-space:nowrap;
        }
        .rdv2-items-tbl tbody tr { border-bottom:1px solid #e2e8f0; }
        .rdv2-items-tbl tbody tr:nth-child(even) { background:#f8fafc !important; }
        .rdv2-items-tbl tbody td { padding:.55rem .7rem; color:#1e293b; vertical-align:middle; }
        .rv-item-num   { text-align:center; color:#94a3b8; font-size:.75rem; width:32px; }
        .rv-item-desc  { font-weight:500; min-width:160px; }
        .rv-item-qty   { text-align:center; color:#475569; width:55px; }
        .rv-item-unit  { text-align:center; color:#64748b; font-size:.78rem; width:55px; }
        .rv-item-price { text-align:left; direction:ltr; font-family:monospace; color:#475569; width:90px; }
        .rv-item-total { text-align:left; direction:ltr; font-family:monospace; font-weight:700; color:#1d4ed8; width:100px; }
        .rdv2-items-tbl tfoot tr { background:#dbeafe !important; }
        .rdv2-items-tbl tfoot td {
            border-top:2px solid #93c5fd; padding:.45rem .7rem;
            font-size:.84rem; font-weight:800;
        }

        /* شبكة سفلية */
        .rdv2-lower-grid { display:grid; grid-template-columns:1fr 1fr; gap:.38rem; margin-top:.45rem; }
        .rdv2-panel { background:#f8fafc !important; border:1px solid #e2e8f0; border-radius:5px; padding:.38rem .52rem; }
        .rdv2-panel-head {
            font-size:.6rem; font-weight:700; color:#64748b; text-transform:uppercase;
            letter-spacing:.4px; margin-bottom:.28rem; padding-bottom:.2rem; border-bottom:1px solid #e2e8f0;
        }
        .rdv2-panel-rows { display:flex; flex-direction:column; gap:.14rem; }
        .rdv2-prow {
            display:flex; justify-content:space-between; align-items:baseline;
            font-size:.68rem; padding:.1rem 0; border-bottom:1px dashed #e2e8f0; gap:.25rem;
        }
        .rdv2-prow:last-child { border-bottom:none; }
        .rdv2-prow span:first-child { color:#64748b; flex-shrink:0; }
        .rdv2-prow strong { color:#1e293b; text-align:left; }

        /* لوحة الاعتماد (CEO) */
        .rdv2-ceo-approval-panel {
            grid-column:span 2;
            border:1.5px solid #86efac !important;
            background:linear-gradient(135deg,#f0fdf4,#dcfce7) !important;
            border-radius:6px; padding:.45rem .65rem;
        }
        .rdv2-ceo-panel-inner {
            display:flex; justify-content:space-between; align-items:center; gap:16px;
        }
        .rdv2-ceo-sig-box {
            display:flex; flex-direction:column; align-items:center; gap:4px; min-width:120px;
        }
        .rdv2-ceo-sig-line {
            width:100%; border-bottom:1px solid #86efac; padding-bottom:4px; margin-bottom:4px;
        }
        .rdv2-ceo-sig-name { font-size:.65rem; color:#15803d; text-align:center; font-weight:600; }
        .rdv2-ceo-info { font-size:.72rem; line-height:1.85; color:#166534; }
        .rdv2-ceo-info strong { color:#14532d; }
        .rdv2-ceo-stamp-box { flex-shrink:0; }

        /* سجل الإجراءات */
        .rdv2-log-panel  { grid-column:span 2; }
        .rdv2-log-scroll { max-height:none; overflow:visible; display:flex; flex-direction:column; gap:.28rem; }
        .rdv2-log-row    { display:flex; gap:.38rem; align-items:flex-start; }
        .rdv2-log-dot    { width:7px; height:7px; border-radius:50%; flex-shrink:0; margin-top:.25rem; }
        .rdv2-log-body   { flex:1; font-size:.65rem; }
        .rdv2-log-act    { font-weight:600; color:#1e293b; }
        .rdv2-log-who    { color:#64748b; margin-right:.15rem; }
        .rdv2-log-when   { color:#94a3b8; font-size:.62rem; }
        .rdv2-log-note   {
            color:#475569; font-size:.62rem; margin-top:.07rem;
            background:#f1f5f9 !important; padding:.08rem .32rem; border-radius:3px;
        }

        /* ألوان نقاط السجل */
        .rdv2-log-dot.approve { background:#22c55e; }
        .rdv2-log-dot.reject  { background:#ef4444; }
        .rdv2-log-dot.review  { background:#f59e0b; }
        .rdv2-log-dot.route   { background:#6366f1; }
        .rdv2-log-dot.default { background:#94a3b8; }

        /* التذييل */
        .rdv2-doc-footer {
            display:flex !important; justify-content:space-between;
            font-size:.6rem; color:#94a3b8; margin-top:.45rem;
            padding-top:.28rem; border-top:1px solid #e2e8f0;
        }
        .no-print { display:none !important; }
    `;
}

async function exportCeoApprovalPdf(reservationId) {
    if (typeof html2pdf === 'undefined') {
        showToast('مكتبة PDF غير محمّلة', 'error');
        return;
    }

    let res = CeoState.currentRes;
    if (!res || res.id !== reservationId) {
        try { res = await fetchCeoReservationDetail(reservationId); if (res) CeoState.currentRes = res; } catch (e) { }
    }
    if (!res) { showToast('تعذّر جلب بيانات الحجز', 'error'); return; }

    const lastAction = res.ceo_actions && res.ceo_actions.length
        ? res.ceo_actions[res.ceo_actions.length - 1] : null;

    // إعداد التوقيع كـ data URL محسوب
    let sigInlineUrl = null;
    if (CeoState.signatureDataUrl) {
        sigInlineUrl = await new Promise(resolve => {
            const tmpImg = new Image();
            tmpImg.onload = () => {
                try {
                    const sigW = (CeoState.sigPosition?.width || CeoState.stampSettings?.sig_pdf_size || 130);
                    const cv = document.createElement('canvas');
                    const ratio = tmpImg.naturalHeight / (tmpImg.naturalWidth || 1);
                    cv.width = sigW * 2;
                    cv.height = Math.round(cv.width * ratio);
                    cv.getContext('2d').drawImage(tmpImg, 0, 0, cv.width, cv.height);
                    resolve(cv.toDataURL('image/png'));
                } catch (e) { resolve(tmpImg.src); }
            };
            tmpImg.onerror = () => resolve(CeoState.signatureDataUrl);
            tmpImg.src = CeoState.signatureDataUrl;
        });
    }

    const sigW = CeoState.sigPosition?.width || CeoState.stampSettings?.sig_pdf_size || 130;
    const sigName = CeoState.stampSettings?.signature_name || '';

    // ── حساب الإجمالي ──
    const grandTotal = res.grand_total_sar || res.grand_total || 0;
    const cur = res.currency || 'SAR';
    const itemsTotal = res.items ? res.items.reduce((s, it) => s + (parseFloat(it.line_total) || 0), 0) : grandTotal;

    // ── ألوان badges الحالة ──
    const statusColors = {
        'معتمد': { bg: '#dcfce7', color: '#15803d' },
        'مرفوض': { bg: '#fee2e2', color: '#dc2626' },
        'قيد المراجعة': { bg: '#fef3c7', color: '#92400e' },
    };
    const sc = statusColors[res.status] || { bg: '#e2e8f0', color: '#475569' };
    const prioColors = { 'عاجل': { bg: '#fee2e2', color: '#dc2626' }, 'حرج': { bg: '#fef3c7', color: '#92400e' } };
    const pc = prioColors[res.priority] || { bg: '#e0f2fe', color: '#0369a1' };

    // ── ACTION dot class map ──
    const actionDotMap = { 'اعتماد': 'approve', 'مراجعة': 'review', 'توجيه': 'route', 'رفض': 'reject' };

    // ── بناء HTML الوثيقة بتصميم rdv2 ──
    // لا نحتاج style هنا — PdfEngine.fromElement يبني wrapper مرئي خاص به
    const printEl = document.createElement('div');
    printEl.style.cssText = 'direction:rtl;width:794px;background:#fff;';

    // نضع الـ CSS داخل العنصر نفسه حتى يراه html2canvas
    const styleTag = `<style>${getCeoRdv2PrintCSS()}</style>`;

    printEl.innerHTML = styleTag + `
    <div class="rdv2-shell">
      <div class="rdv2-doc">

        <!-- رأس الوثيقة -->
        <div class="rdv2-doc-header">
          <div class="rdv2-doc-logo">
            <div class="rdv2-logo-icon">🏛️</div>
            <div>
              <div class="rdv2-org-name">نظام إدارة الموازنة</div>
              <div class="rdv2-org-sub">وثيقة اعتماد الرئيس التنفيذي</div>
            </div>
          </div>
          <div class="rdv2-doc-id-block">
            <div class="rdv2-doc-num">${escHtml(res.reservation_number || '#' + res.id)}</div>
            <div class="rdv2-doc-date">${fmtDate(res.request_date)} &nbsp;|&nbsp; السنة المالية: ${res.fiscal_year || '—'}</div>
            <div class="rdv2-doc-badges">
              <span class="rdv2-status-badge" style="color:${sc.color};background:${sc.bg}">${escHtml(res.status || '—')}</span>
              <span class="rdv2-prio-badge" style="color:${pc.color};background:${pc.bg}">${escHtml(res.priority || 'عادي')}</span>
            </div>
          </div>
        </div>

        <!-- شبكة المعلومات الأساسية -->
        <div class="rdv2-info-grid" style="margin-top:.3rem">
          <div class="rdv2-info-cell rdv2-span2">
            <div class="rdv2-info-lbl">الغرض / الوصف</div>
            <div class="rdv2-info-val rdv2-purpose">${escHtml(res.purpose || '—')}</div>
          </div>
          <div class="rdv2-info-cell">
            <div class="rdv2-info-lbl">رقم الحجز</div>
            <div class="rdv2-info-val rdv2-mono">${escHtml(res.reservation_number || '#' + res.id)}</div>
          </div>
          <div class="rdv2-info-cell">
            <div class="rdv2-info-lbl">المبلغ الإجمالي</div>
            <div class="rdv2-info-val rdv2-total-val">${fmtMoney(grandTotal, cur)}</div>
          </div>
          <div class="rdv2-info-cell">
            <div class="rdv2-info-lbl">القسم</div>
            <div class="rdv2-info-val">${escHtml(res.department_name || '—')}</div>
          </div>
          <div class="rdv2-info-cell">
            <div class="rdv2-info-lbl">مقدّم الطلب</div>
            <div class="rdv2-info-val">${escHtml(res.requested_by_name || '—')}</div>
          </div>
          <div class="rdv2-info-cell">
            <div class="rdv2-info-lbl">المورد</div>
            <div class="rdv2-info-val">${escHtml(res.supplier_name || '—')}</div>
          </div>
          <div class="rdv2-info-cell">
            <div class="rdv2-info-lbl">العملة</div>
            <div class="rdv2-info-val rdv2-mono">${cur}</div>
          </div>
          <div class="rdv2-info-cell">
            <div class="rdv2-info-lbl">بند الموازنة</div>
            <div class="rdv2-info-val">${escHtml(res.budget_category || '—')}</div>
          </div>
          <div class="rdv2-info-cell">
            <div class="rdv2-info-lbl">مركز التكلفة</div>
            <div class="rdv2-info-val">${escHtml(res.cost_center || '—')}</div>
          </div>
        </div>

        <div class="rdv2-divider"></div>

        <!-- جدول الأصناف -->
        ${res.items && res.items.length ? `
        <div class="rdv2-section-title">📦 بنود وأصناف الحجز</div>
        <table class="rdv2-items-tbl" style="margin-top:.2rem">
          <thead>
            <tr>
              <th class="rv-item-num">#</th>
              <th class="rv-item-desc">الوصف</th>
              <th class="rv-item-qty">الكمية</th>
              <th class="rv-item-unit">الوحدة</th>
              <th class="rv-item-price">سعر الوحدة</th>
              <th class="rv-item-total">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            ${res.items.map((it, i) => `
            <tr>
              <td class="rv-item-num">${i + 1}</td>
              <td class="rv-item-desc">${escHtml(it.description || '')}</td>
              <td class="rv-item-qty">${it.qty || '—'}</td>
              <td class="rv-item-unit">${escHtml(it.unit || '—')}</td>
              <td class="rv-item-price">${fmtMoney(it.unit_price || 0, cur)}</td>
              <td class="rv-item-total">${fmtMoney(it.line_total || 0, cur)}</td>
            </tr>`).join('')}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="5" style="text-align:right;padding-left:.5rem">الإجمالي الكلي</td>
              <td class="rv-item-total" style="font-size:.9rem">${fmtMoney(grandTotal, cur)}</td>
            </tr>
          </tfoot>
        </table>` : ''}

        <div class="rdv2-divider" style="margin-top:.35rem"></div>

        <!-- الشبكة السفلية -->
        <div class="rdv2-lower-grid">

          <!-- لوحة الاعتماد الرئيسية -->
          ${lastAction ? `
          <div class="rdv2-ceo-approval-panel">
            <div class="rdv2-panel-head" style="color:#15803d;border-color:#86efac">✅ قرار الرئيس التنفيذي</div>
            <div class="rdv2-ceo-panel-inner">
              <!-- التوقيع على اليسار -->
              <div class="rdv2-ceo-sig-box" id="ceo-sig-inject">
                ${sigInlineUrl ? `
                <div class="rdv2-ceo-sig-line">
                  <img src="${sigInlineUrl}" style="width:${sigW}px;height:auto;display:block;margin:0 auto">
                </div>
                ${sigName ? `<div class="rdv2-ceo-sig-name">${escHtml(sigName)}</div>` : ''}
                ` : '<div style="width:120px;height:40px;border-bottom:1px dashed #86efac"></div>'}
              </div>
              <!-- بيانات الاعتماد في الوسط -->
              <div class="rdv2-ceo-info" style="flex:1;padding:0 12px">
                <div style="font-weight:800;font-size:.78rem;color:#14532d;margin-bottom:4px">
                  ${escHtml(lastAction.action_type)}
                </div>
                <div><strong>بواسطة:</strong> ${escHtml(lastAction.actor_name)}</div>
                <div><strong>المنصب:</strong> ${escHtml(lastAction.actor_position || '—')}</div>
                <div><strong>التاريخ:</strong> ${fmtDateTime(lastAction.action_date)}</div>
                ${lastAction.notes ? `<div style="margin-top:3px;font-style:italic;color:#166534">${escHtml(lastAction.notes)}</div>` : ''}
              </div>
              <!-- الختم على اليمين -->
              <div class="rdv2-ceo-stamp-box">
                ${buildCeoStampSvg(CeoState.stampSettings)}
              </div>
            </div>
          </div>` : `
          <div class="rdv2-panel">
            <div class="rdv2-panel-head">قرار الرئيس التنفيذي</div>
            <div style="font-size:.72rem;color:#94a3b8;padding:.5rem 0">لم يُتخذ قرار بعد</div>
          </div>`}

          <!-- لوحة ملخص المعلومات -->
          <div class="rdv2-panel">
            <div class="rdv2-panel-head">ملخص الحجز</div>
            <div class="rdv2-panel-rows">
              <div class="rdv2-prow">
                <span>رقم الحجز</span>
                <strong class="rdv2-mono">${escHtml(res.reservation_number || '#' + res.id)}</strong>
              </div>
              <div class="rdv2-prow">
                <span>القسم</span>
                <strong>${escHtml(res.department_name || '—')}</strong>
              </div>
              <div class="rdv2-prow">
                <span>الأولوية</span>
                <strong style="color:${pc.color}">${escHtml(res.priority || 'عادي')}</strong>
              </div>
              <div class="rdv2-prow">
                <span>حالة النظام</span>
                <strong style="color:${sc.color}">${escHtml(res.status || '—')}</strong>
              </div>
              <div class="rdv2-prow">
                <span>المبلغ</span>
                <strong style="color:#1e3a5f">${fmtMoney(grandTotal, cur)}</strong>
              </div>
              ${res.currency && res.currency !== 'SAR' ? `
              <div class="rdv2-prow">
                <span>بالعملة الأصلية</span>
                <strong>${fmtMoney(res.grand_total || 0, cur)}</strong>
              </div>` : ''}
            </div>
          </div>

          <!-- سجل الإجراءات -->
          ${res.ceo_actions && res.ceo_actions.length ? `
          <div class="rdv2-panel rdv2-log-panel">
            <div class="rdv2-panel-head">📋 سجل إجراءات الرئيس التنفيذي</div>
            <div class="rdv2-log-scroll">
              ${res.ceo_actions.map(a => `
              <div class="rdv2-log-row">
                <div class="rdv2-log-dot ${actionDotMap[a.action_type] || 'default'}"></div>
                <div class="rdv2-log-body">
                  <span class="rdv2-log-act">${escHtml(a.action_type)}</span>
                  <span class="rdv2-log-who">— ${escHtml(a.actor_name)}</span>
                  <span class="rdv2-log-when">${fmtDateTime(a.action_date)}</span>
                  ${a.notes ? `<div class="rdv2-log-note">${escHtml(a.notes)}</div>` : ''}
                </div>
              </div>`).join('')}
            </div>
          </div>` : ''}

        </div><!-- /rdv2-lower-grid -->

        <!-- التذييل -->
        <div class="rdv2-doc-footer">
          <span>نظام إدارة معاملات القطاع المالي</span>
          <span>${new Date().toLocaleString('ar-SA')}</span>
        </div>

      </div><!-- /rdv2-doc -->
    </div><!-- /rdv2-shell -->
    `;

    const fileName = `CEO_Approval_${res.reservation_number || res.id}_${Date.now()}.pdf`;

    try {
        // PdfEngine.fromElement يقبل أي عنصر HTML حتى لو مو في الـ DOM
        // يبني wrapper مرئي داخلياً → html2canvas يرسمه صح → PDF غير فارغ
        await PdfEngine.fromElement(printEl, fileName, {
            margin: [7, 8, 7, 8],
            image: { type: 'jpeg', quality: 0.97 },
        });

        showToast('✅ تم تصدير وحفظ PDF بنجاح', 'success');

        await fetch('api/ceo_approvals_api.php?action=save_archive_path', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                reservation_id: reservationId,
                file_path: `archive/ceo_approvals/${fileName}`,
            }),
        });
    } catch (e) {
        console.error('[CEO] PDF export:', e);
        showToast('تعذّر تصدير PDF', 'error');
    }
}

// ═══════════════════════════════════════════════════════════════
//  إدارة الختم والتوقيع
// ═══════════════════════════════════════════════════════════════
function updateCeoStampPreview() {
    const text = document.getElementById('ceoStampText')?.value || 'معتمد';
    const color = document.getElementById('ceoStampColor')?.value || '#1e40af';
    const shape = document.getElementById('ceoStampShape')?.value || 'circle';

    // مزامنة حقل الـ hex
    const hexField = document.getElementById('ceoStampColorHex');
    if (hexField) hexField.value = color;

    const preview = document.getElementById('ceoStampLivePreview');
    if (preview) {
        preview.innerHTML = buildCeoStampHtml({
            stamp_text: text, stamp_color: color, stamp_shape: shape,
            stamp_bg_color: color + '18',
        });
    }
}

// ══════════════════════════════════════════════════════════════
//  نظام التوقيع الجديد — رفع + سحب + تحجيم
// ══════════════════════════════════════════════════════════════

// ── حالة التوقيع ───────────────────────────────────────────────
if (typeof SigProcessor === 'undefined') {
    var SigProcessor = {};
}
SigProcessor.originalFile = null;
SigProcessor.processedUrl = null;

// ── رفع الصورة ─────────────────────────────────────────────────
function handleCeoSignatureUpload(input) {
    const file = input.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
        showToast('❌ يجب اختيار ملف صورة', 'error'); return;
    }
    SigProcessor.originalFile = file;

    const reader = new FileReader();
    reader.onload = e => _openSigModal(e.target.result);
    reader.readAsDataURL(file);
}

// ── Modal رفع الصورة ───────────────────────────────────────────
function _openSigModal(dataUrl) {
    document.getElementById('sigProcessorModal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'sigProcessorModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);backdrop-filter:blur(6px);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px';

    modal.innerHTML = `
    <div style="background:var(--card-bg,#fff);border-radius:20px;width:100%;max-width:760px;max-height:90vh;
                display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,.35);direction:rtl">
      <!-- Header -->
      <div style="padding:16px 22px;display:flex;align-items:center;justify-content:space-between;
                  background:linear-gradient(135deg,#1e3a5f,#2c5282);color:#fff;border-radius:20px 20px 0 0;flex-shrink:0">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:20px">✍️</span>
          <div>
            <div style="font-weight:700">معالج التوقيع</div>
            <div style="font-size:.72rem;opacity:.75">الصورة ستُرفع وتُعالج بـ OpenCV</div>
          </div>
        </div>
        <button onclick="document.getElementById('sigProcessorModal').remove()"
                style="background:rgba(255,255,255,.15);border:none;color:#fff;width:30px;height:30px;border-radius:50%;cursor:pointer;font-size:15px">✕</button>
      </div>

      <!-- Body -->
      <div style="display:flex;gap:0;flex:1;overflow:hidden;min-height:0">
        <!-- معاينة -->
        <div style="flex:1;padding:18px;display:flex;flex-direction:column;gap:12px;overflow:auto">
          <div style="font-size:.8rem;font-weight:600;color:#666;margin-bottom:4px">📷 الصورة الأصلية</div>
          <div style="background:repeating-conic-gradient(#e0e0e0 0% 25%,#f5f5f5 0% 50%) 0 0/20px 20px;
                      border-radius:10px;display:flex;align-items:center;justify-content:center;min-height:120px;border:1px solid #ddd;overflow:hidden">
            <img src="${dataUrl}" style="max-width:100%;max-height:140px;object-fit:contain">
          </div>
          <div style="font-size:.8rem;font-weight:600;color:#666">✨ بعد المعالجة</div>
          <div style="background:repeating-conic-gradient(#e0e0e0 0% 25%,#f5f5f5 0% 50%) 0 0/20px 20px;
                      border-radius:10px;display:flex;align-items:center;justify-content:center;min-height:120px;border:1px solid #ddd;overflow:hidden;position:relative">
            <img id="sigResultPreview" src="${dataUrl}" style="max-width:100%;max-height:140px;object-fit:contain">
            <div id="sigProcessOverlay" style="position:absolute;inset:0;background:rgba(255,255,255,.9);
                 display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px">
              <div style="width:26px;height:26px;border:3px solid #e2e8f0;border-top-color:#1e3a5f;
                          border-radius:50%;animation:ceo-spin .7s linear infinite"></div>
              <div style="font-size:.8rem;color:#1e3a5f;font-weight:600">جاري المعالجة…</div>
            </div>
          </div>
          <div id="sigStatusMsg" style="display:none;padding:8px 12px;border-radius:8px;font-size:.76rem;line-height:1.6"></div>
        </div>
        <!-- نصائح -->
        <div style="width:190px;padding:18px;border-right:1px solid var(--border-color,#e2e8f0);flex-shrink:0;overflow:auto">
          <div style="font-size:.78rem;font-weight:700;color:#1e3a5f;margin-bottom:10px">💡 نصائح</div>
          <div style="font-size:.72rem;color:#888;line-height:1.9">
            • PNG بخلفية بيضاء = أفضل نتيجة<br>
            • صورة واضحة وعالية الدقة<br>
            • تجنب الظلال<br><br>
            بعد الاعتماد يمكنك:<br>
            • <strong>سحب</strong> التوقيع لأي مكان<br>
            • <strong>تحجيم</strong> التوقيع بحرية
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div style="padding:14px 22px;border-top:1px solid #e2e8f0;display:flex;gap:10px;justify-content:flex-end;
                  background:var(--bg-secondary,#f8f9fa);border-radius:0 0 20px 20px;flex-shrink:0">
        <button onclick="document.getElementById('sigProcessorModal').remove()"
                style="padding:9px 18px;border:1px solid #ddd;border-radius:10px;background:transparent;cursor:pointer;font-size:.86rem;color:#666">إلغاء</button>
        <button onclick="_sigConfirm()" id="sigApproveBtn" disabled
                style="padding:9px 22px;border:none;border-radius:10px;cursor:pointer;font-size:.86rem;font-weight:700;
                       background:linear-gradient(135deg,#15803d,#16a34a);color:#fff;opacity:.5;transition:all .2s">
          ✅ موافق — اعتماد التوقيع
        </button>
      </div>
    </div>`;

    document.body.appendChild(modal);
    _processSigImage(dataUrl);
}

// ── معالجة الصورة ──────────────────────────────────────────────
async function _processSigImage(dataUrl) {
    const overlay = document.getElementById('sigProcessOverlay');
    const approveBtn = document.getElementById('sigApproveBtn');
    const statusMsg = document.getElementById('sigStatusMsg');
    const resultImg = document.getElementById('sigResultPreview');

    try {
        const resp = await fetch('api/process_signature.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image_base64: dataUrl, crop: true })
        });
        const data = await resp.json();

        if (data.success && data.image_base64) {
            SigProcessor.processedUrl = data.image_base64;
            if (resultImg) resultImg.src = data.image_base64;
            if (overlay) overlay.style.display = 'none';
            if (approveBtn) { approveBtn.disabled = false; approveBtn.style.opacity = '1'; }
            if (statusMsg) {
                statusMsg.style.cssText = 'display:block;background:#f0fdf4;color:#15803d;padding:8px 12px;border-radius:8px;font-size:.76rem';
                statusMsg.innerHTML = `✅ تم استخراج التوقيع بـ OpenCV — ${data.size?.width ?? '—'}×${data.size?.height ?? '—'} px`;
            }
            return;
        }
    } catch (e) { }

    // Fallback: الصورة كما هي
    SigProcessor.processedUrl = dataUrl;
    if (resultImg) resultImg.src = dataUrl;
    if (overlay) overlay.style.display = 'none';
    if (approveBtn) { approveBtn.disabled = false; approveBtn.style.opacity = '1'; }
    if (statusMsg) {
        statusMsg.style.cssText = 'display:block;background:#fef3c7;color:#92400e;padding:8px 12px;border-radius:8px;font-size:.76rem';
        statusMsg.innerHTML = '⚠️ تم الرفع بدون إزالة خلفية (OpenCV غير متاح)';
    }
}

// ── اعتماد التوقيع ─────────────────────────────────────────────
function _sigConfirm() {
    if (!SigProcessor.processedUrl) return;
    CeoState.signatureDataUrl = SigProcessor.processedUrl;

    // تحديث منطقة الرفع
    const content = document.getElementById('ceoSigUploadContent');
    if (content) {
        content.style.display = '';
        content.innerHTML = `
            <img src="${SigProcessor.processedUrl}"
                 style="max-height:80px;max-width:200px;object-fit:contain;display:block;margin:0 auto;
                        background:repeating-conic-gradient(#e0e0e0 0% 25%,#f5f5f5 0% 50%) 0 0/12px 12px;
                        border-radius:6px;padding:4px">
            <p style="font-size:.75rem;color:#15803d;margin:.4rem 0 0;font-weight:600">
                ✅ تم اعتماد التوقيع — انقر لتغييره
            </p>`;
    }

    // تحديث معاينة الختم
    const previewWrap = document.querySelector('.ceo-stamp-preview-wrap');
    if (previewWrap) {
        let img = previewWrap.querySelector('img.ceo-sig-in-preview');
        if (!img) {
            img = document.createElement('img');
            img.className = 'ceo-sig-in-preview';
            img.style.cssText = 'max-height:55px;max-width:140px;object-fit:contain;margin-top:.5rem;display:block';
            previewWrap.appendChild(img);
        }
        img.src = SigProcessor.processedUrl;
    }

    const delBtn = document.getElementById('ceoDeleteSigBtn');
    if (delBtn) delBtn.style.display = 'flex';

    document.getElementById('sigProcessorModal')?.remove();
    showToast('✅ تم اعتماد التوقيع — احفظ الإعدادات لتطبيقه', 'success');
}

// ══════════════════════════════════════════════════════════════
//  (محفوظة للتوافق — لم تعد مستخدمة بعد تصميم rdv2)
// ══════════════════════════════════════════════════════════════
function initDraggableSignature() {
    const sigUrl = CeoState.signatureDataUrl;
    if (!sigUrl) return;

    document.getElementById('draggableSig')?.remove();

    // الهدف: ceoModalBody — هو الذي يتسكرل، التوقيع يثبت معه
    const container = document.getElementById('ceoModalBody');
    if (!container) return;

    container.style.position = 'relative';

    // موقع ابتدائي فوق منطقة الختم
    const stampWrap = document.getElementById('ceoStampWrap');
    const containerRect = container.getBoundingClientRect();
    const stampRect = stampWrap ? stampWrap.getBoundingClientRect() : containerRect;

    // الموقع نسبة للـ container مع حساب الـ scroll
    const initLeft = stampRect.left - containerRect.left + container.scrollLeft + 10;
    const initTop = stampRect.top - containerRect.top + container.scrollTop + 10;

    const sigEl = document.createElement('div');
    sigEl.id = 'draggableSig';
    sigEl.style.cssText = `
        position:absolute;
        left:${initLeft}px;
        top:${initTop}px;
        width:130px;
        cursor:move;
        user-select:none;
        z-index:999;
        border:2px dashed transparent;
        border-radius:8px;
        padding:4px;
        transition:border-color .15s;
    `;

    sigEl.innerHTML = `
        <img src="${sigUrl}" style="width:100%;height:auto;display:block;object-fit:contain;pointer-events:none">
        <div id="sigResizeHandle" style="
            position:absolute;bottom:-7px;right:-7px;
            width:16px;height:16px;
            background:#1e3a5f;border-radius:50%;
            cursor:se-resize;border:2px solid #fff;
            box-shadow:0 1px 4px rgba(0,0,0,.4);
            opacity:0;transition:opacity .2s;
        "></div>
    `;

    container.appendChild(sigEl);

    // Hover
    sigEl.addEventListener('mouseenter', () => {
        sigEl.style.borderColor = '#1e3a5f55';
        const h = document.getElementById('sigResizeHandle');
        if (h) h.style.opacity = '1';
    });
    sigEl.addEventListener('mouseleave', () => {
        if (!isDragging && !isResizing) {
            sigEl.style.borderColor = 'transparent';
            const h = document.getElementById('sigResizeHandle');
            if (h) h.style.opacity = '0';
        }
    });

    // السحب
    let isDragging = false, startX, startY, startLeft, startTop;

    sigEl.addEventListener('mousedown', function (e) {
        if (e.target.id === 'sigResizeHandle') return;
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        startLeft = parseInt(sigEl.style.left) || 0;
        startTop = parseInt(sigEl.style.top) || 0;
        sigEl.style.borderColor = '#1e3a5f55';
        e.preventDefault();
    });

    document.addEventListener('mousemove', function (e) {
        if (isDragging) {
            // الموقع الجديد = الموقع القديم + الفرق في الماوس
            sigEl.style.left = (startLeft + e.clientX - startX) + 'px';
            sigEl.style.top = (startTop + e.clientY - startY) + 'px';
        }
        if (isResizing) {
            const newW = Math.max(60, Math.min(300, resizeStartWidth + (e.clientX - resizeStartX)));
            sigEl.style.width = newW + 'px';
        }
    });

    document.addEventListener('mouseup', () => {
        if (isDragging || isResizing) {
            // حفظ الموقع كنسبة مئوية من container
            const containerRect = container.getBoundingClientRect();
            const left = parseInt(sigEl.style.left) || 0;
            const top = parseInt(sigEl.style.top) || 0;
            CeoState.sigPosition = {
                leftPct: Math.round(left / containerRect.width * 1000) / 10,
                topPct: Math.round(top / containerRect.height * 1000) / 10,
                widthPct: Math.round(sigEl.offsetWidth / containerRect.width * 1000) / 10,
                left: left,
                top: top,
                width: sigEl.offsetWidth,
            };
        }
        isDragging = false;
        isResizing = false;
        sigEl.style.borderColor = 'transparent';
        const h = document.getElementById('sigResizeHandle');
        if (h) h.style.opacity = '0';
    });

    // التحجيم
    let isResizing = false, resizeStartX, resizeStartWidth;
    const resizeHandle = document.getElementById('sigResizeHandle');

    resizeHandle.addEventListener('mousedown', function (e) {
        isResizing = true;
        resizeStartX = e.clientX;
        resizeStartWidth = sigEl.offsetWidth;
        e.preventDefault();
        e.stopPropagation();
    });
}


// ── حفظ إعدادات الختم ───────────────────────────────────────────
async function saveCeoStampSettings() {
    const payload = {
        stamp_text: document.getElementById('ceoStampText')?.value || 'معتمد',
        stamp_color: document.getElementById('ceoStampColor')?.value || '#1e40af',
        stamp_bg_color: (document.getElementById('ceoStampColor')?.value || '#1e40af') + '14',
        stamp_shape: document.getElementById('ceoStampShape')?.value || 'circle',
        signature_name: document.getElementById('ceoSigName')?.value || '',
        sig_pdf_size: parseInt(document.getElementById('ceoSigPdfSize')?.value) || 130,
    };

    if (CeoState.signatureDataUrl) {
        payload.signature_image = CeoState.signatureDataUrl;
    }

    try {
        const res = await fetch('api/ceo_approvals_api.php?action=save_stamp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const data = await res.json();

        if (data.success) {
            showToast('✅ ' + data.message, 'success');
            CeoState.stampSettings = { ...CeoState.stampSettings, ...payload };
        } else {
            showToast('❌ ' + data.message, 'error');
        }
    } catch (e) {
        showToast('خطأ في الاتصال', 'error');
        console.error('[CEO] saveStamp:', e);
    }
}

// ═══════════════════════════════════════════════════════════════
//  تحديث القائمة (مع الفلاتر)
// ═══════════════════════════════════════════════════════════════
async function refreshCeoList() {
    await fetchCeoReservations();
    renderCeoListOnly();
}

// ═══════════════════════════════════════════════════════════════
//  دوال مساعدة
// ═══════════════════════════════════════════════════════════════
function fmtMoney(v, currency) {
    const cur = currency || 'SAR';
    if (typeof fmtMoneyCur === 'function') return fmtMoneyCur(parseFloat(v) || 0, cur);
    if (typeof fmtMoneyVal === 'function') return fmtMoneyVal(v);
    return new Intl.NumberFormat('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0) + ' ر.س';
}

function fmtDate(d) {
    if (!d) return '—';
    try {
        return new Date(d).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch { return d; }
}

function fmtDateTime(d) {
    if (!d) return '—';
    try {
        return new Date(d).toLocaleString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return d; }
}

function escHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// debounce بسيط إذا لم يكن معرّفاً
if (typeof debounce !== 'function') {
    function debounce(fn, delay) {
        let t;
        return function (...args) {
            clearTimeout(t);
            t = setTimeout(() => fn.apply(this, args), delay);
        };
    }
}

// ── حقن الـ CSS ─────────────────────────────────────────────────
function injectCeoStyles() {
    if (document.getElementById('ceo-approvals-css')) return;
    const link = document.createElement('link');
    link.id = 'ceo-approvals-css';
    link.rel = 'stylesheet';
    link.href = 'css/ceo-approvals.css';
    document.head.appendChild(link);
}