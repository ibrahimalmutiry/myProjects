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
        const data = await res.json();
        if (data.success) CeoState.reservations = data.data || [];
    } catch (e) {
        console.error('[CEO] fetchReservations:', e);
        CeoState.reservations = [];
    }
}

async function fetchCeoStampSettings() {
    try {
        const res = await fetch('api/ceo_approvals_api.php?action=get_stamp');
        const data = await res.json();
        if (data.success) CeoState.stampSettings = data.data;
    } catch (e) { console.error('[CEO] fetchStamp:', e); }
}

async function fetchCeoSignatureImage() {
    try {
        const res = await fetch('api/ceo_approvals_api.php?action=get_signature_image');
        const data = await res.json();
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
        <input type="text" placeholder="🔍 بحث برقم أو غرض الحجز…"
               value="${CeoState.filter.search}"
               onInput="debounce(()=>{ CeoState.filter.search=this.value; refreshCeoList(); }, 350)()"
               style="flex:1;min-width:200px">
        <select onchange="CeoState.filter.status=this.value; refreshCeoList()">
            <option value=""             ${!CeoState.filter.status ? 'selected' : ''}>جميع الحالات</option>
            <option value="قيد المراجعة" ${CeoState.filter.status === 'قيد المراجعة' ? 'selected' : ''}>⏳ قيد المراجعة</option>
            <option value="معتمد"        ${CeoState.filter.status === 'معتمد' ? 'selected' : ''}>✅ معتمد</option>
            <option value="مرفوض"        ${CeoState.filter.status === 'مرفوض' ? 'selected' : ''}>❌ مرفوض</option>
            <option value="منفذ"         ${CeoState.filter.status === 'منفذ' ? 'selected' : ''}>🏁 منفذ</option>
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
                <p>لا توجد حجوزات — تأكد من وجود حجوزات بحالة «قيد المراجعة» أو «معتمد»</p>
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
            <strong>${fmtMoney(amt)}</strong>
            ${cur !== 'SAR' ? `<br><small style="color:var(--text-muted)">${fmtMoney(r.grand_total || 0)} ${cur}</small>` : ''}
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

// ── لوحة الختم الكاملة ──────────────────────────────────────────
function renderCeoStampPanel() {
    const s = CeoState.stampSettings || {};

    const chk = (key, def = true) =>
        (s[key] === undefined ? def : s[key] == 1) ? 'checked' : '';

    const sel = (id, val, def) =>
        `<option value="${val}" ${(s[id] || def) === val ? 'selected' : ''}>${val}</option>`;

    return `
    <div class="ceo-stamp-panel">
        <div class="ceo-stamp-panel-header">
            <span style="font-size:1.3rem">⚙️</span>
            <h3>إعدادات الختم والتوقيع
                <small style="font-weight:400;color:var(--text-muted);font-size:.78rem">(مدير النظام فقط)</small>
            </h3>
        </div>

        <div class="ceo-stamp-panel-body">

            <!-- ── العمود الأيمن: إعدادات النصوص ── -->
            <div class="ceo-stamp-col">
                <div class="ceo-form-section-title">📝 النصوص</div>

                <div class="ceo-form-group">
                    <label>النص الرئيسي للختم</label>
                    <input id="ceoStampText" type="text"
                           value="${escHtml(s.stamp_text || 'معتمد')}"
                           oninput="updateCeoStampPreview()">
                </div>

                <div class="ceo-form-group">
                    <div style="display:flex;align-items:center;justify-content:space-between">
                        <label>النص الثانوي</label>
                        <label class="ceo-toggle-label">
                            <input type="checkbox" id="ceoShowSubText" ${chk('show_sub_text')}
                                   onchange="updateCeoStampPreview()">
                            <span>إظهار</span>
                        </label>
                    </div>
                    <input id="ceoStampSubText" type="text"
                           value="${escHtml(s.stamp_sub_text || 'معتمد رسمياً')}"
                           oninput="updateCeoStampPreview()">
                </div>

                <div class="ceo-form-group">
                    <div style="display:flex;align-items:center;justify-content:space-between">
                        <label>اسم المؤسسة / الجهة</label>
                        <label class="ceo-toggle-label">
                            <input type="checkbox" id="ceoShowOrgName" ${chk('show_org_name', false)}
                                   onchange="updateCeoStampPreview()">
                            <span>إظهار</span>
                        </label>
                    </div>
                    <input id="ceoStampOrgName" type="text"
                           value="${escHtml(s.stamp_org_name || '')}"
                           placeholder="مثال: شركة الأفق للتقنية"
                           oninput="updateCeoStampPreview()">
                </div>

                <div class="ceo-form-group">
                    <label class="ceo-toggle-label" style="width:100%;justify-content:space-between">
                        <span>إظهار التاريخ داخل الختم</span>
                        <input type="checkbox" id="ceoShowDateInStamp" ${chk('show_date_in_stamp', false)}
                               onchange="updateCeoStampPreview()">
                    </label>
                </div>

                <div class="ceo-form-section-title" style="margin-top:1rem">✍️ التوقيع</div>

                <div class="ceo-form-group">
                    <label>اسم صاحب التوقيع</label>
                    <input id="ceoSigName" type="text"
                           value="${escHtml(s.signature_name || '')}"
                           placeholder="مثال: أ. محمد السعيد — الرئيس التنفيذي">
                </div>

                <!-- رفع صورة التوقيع -->
                <div class="ceo-sig-upload-area" id="ceoSigUploadArea">
                    <input type="file" accept="image/*" id="ceoSigFile"
                           onchange="handleCeoSignatureUpload(this)">
                    <div id="ceoSigUploadContent">
                        ${CeoState.signatureDataUrl
            ? `<img src="${CeoState.signatureDataUrl}" class="ceo-sig-preview" id="ceoSigPreviewImg">
                               <p style="font-size:.75rem;color:var(--text-muted);margin:.5rem 0 0">انقر لتغيير الصورة</p>`
            : `<span style="font-size:2rem">✍️</span>
                               <p style="font-size:.82rem;color:var(--text-muted);margin:.35rem 0 0">اسحب أو انقر لرفع صورة التوقيع</p>
                               <p style="font-size:.72rem;color:var(--text-muted);margin:.2rem 0 0">سيتم استخراج التوقيع بخلفية شفافة تلقائياً</p>`
        }
                    </div>
                    <div id="ceoSigProcessing" style="display:none" class="ceo-sig-processing">
                        <div class="ceo-sig-spinner"></div>
                        <span>يجري تحليل واستخراج التوقيع…</span>
                    </div>
                </div>

                <!-- زر حذف التوقيع -->
                <button id="ceoDeleteSigBtn" onclick="deleteCeoSignature()"
                        style="
                            display:${CeoState.signatureDataUrl ? 'flex' : 'none'};
                            align-items:center;gap:6px;
                            margin-top:8px;width:100%;
                            padding:8px 12px;border-radius:8px;cursor:pointer;
                            border:1px solid #fca5a5;background:#fff5f5;
                            color:#dc2626;font-size:.82rem;font-weight:600;
                            transition:all .18s;
                        "
                        onmouseover="this.style.background='#fee2e2'"
                        onmouseout="this.style.background='#fff5f5'">
                    🗑️ حذف صورة التوقيع
                </button>
            </div>

            <!-- ── العمود الأيسر: إعدادات الشكل ── -->
            <div class="ceo-stamp-col">
                <div class="ceo-form-section-title">🎨 المظهر</div>

                <div class="ceo-form-group">
                    <label>لون الختم</label>
                    <div style="display:flex;gap:.5rem;align-items:center">
                        <input id="ceoStampColor" type="color"
                               value="${s.stamp_color || '#1e40af'}"
                               oninput="syncColorHex();updateCeoStampPreview()"
                               style="width:48px;height:36px;padding:2px;cursor:pointer;border-radius:6px">
                        <input id="ceoStampColorHex" type="text"
                               value="${s.stamp_color || '#1e40af'}"
                               style="flex:1"
                               oninput="document.getElementById('ceoStampColor').value=this.value;updateCeoStampPreview()">
                    </div>
                </div>

                <div class="ceo-form-group">
                    <label>شكل الختم</label>
                    <select id="ceoStampShape" onchange="updateCeoStampPreview()">
                        <option value="circle"  ${(s.stamp_shape || 'circle') === 'circle' ? 'selected' : ''}>⭕ دائري</option>
                        <option value="oval"    ${(s.stamp_shape || '') === 'oval' ? 'selected' : ''}>🔵 بيضاوي</option>
                        <option value="square"  ${(s.stamp_shape || '') === 'square' ? 'selected' : ''}>⬜ مربع</option>
                        <option value="hexagon" ${(s.stamp_shape || '') === 'hexagon' ? 'selected' : ''}>⬡ سداسي</option>
                    </select>
                </div>

                <div class="ceo-form-group">
                    <label>حجم الختم</label>
                    <div style="display:flex;gap:.5rem">
                        ${['small', 'medium', 'large'].map(sz => `
                        <label style="flex:1;text-align:center;cursor:pointer">
                            <input type="radio" name="ceoStampSize" value="${sz}"
                                   ${(s.stamp_size || 'medium') === sz ? 'checked' : ''}
                                   onchange="updateCeoStampPreview()" style="display:none">
                            <div class="ceo-size-btn ${(s.stamp_size || 'medium') === sz ? 'active' : ''}"
                                 onclick="this.previousElementSibling.checked=true;document.querySelectorAll('.ceo-size-btn').forEach(b=>b.classList.remove('active'));this.classList.add('active');updateCeoStampPreview()">
                                ${{ small: 'صغير', medium: 'متوسط', large: 'كبير' }[sz]}
                            </div>
                        </label>`).join('')}
                    </div>
                </div>

                <div class="ceo-form-group">
                    <label>سمك الحدود: <span id="borderWidthVal">${s.stamp_border_width || 3}</span>px</label>
                    <input id="ceoStampBorderWidth" type="range" min="1" max="8"
                           value="${s.stamp_border_width || 3}"
                           oninput="document.getElementById('borderWidthVal').textContent=this.value;updateCeoStampPreview()"
                           style="width:100%;accent-color:var(--ceo-navy,#1e3a5f)">
                </div>

                <div class="ceo-form-group" style="display:flex;gap:1rem;flex-wrap:wrap">
                    <label class="ceo-toggle-label">
                        <input type="checkbox" id="ceoShowInnerRing" ${chk('show_inner_ring')}
                               onchange="updateCeoStampPreview()">
                        <span>الدائرة الداخلية المتقطعة</span>
                    </label>
                </div>

                <!-- معاينة الختم الحية -->
                <div class="ceo-stamp-preview-wrap" style="margin-top:1rem">
                    <p style="font-size:.8rem;font-weight:600;margin-bottom:.5rem;color:var(--text-muted)">معاينة مباشرة</p>
                    <div id="ceoStampLivePreview" style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap">
                        ${buildCeoStampHtml(s)}
                    </div>
                    ${CeoState.signatureDataUrl
            ? `<img src="${CeoState.signatureDataUrl}" class="ceo-sig-in-preview"
                                style="max-height:55px;max-width:140px;object-fit:contain;margin-top:.5rem;display:block">`
            : ''}
                </div>
            </div>
        </div>

        <button class="ceo-save-btn" onclick="saveCeoStampSettings()">
            💾 حفظ جميع إعدادات الختم والتوقيع
        </button>
    </div>`;
}

function syncColorHex() {
    const c = document.getElementById('ceoStampColor')?.value;
    const h = document.getElementById('ceoStampColorHex');
    if (h && c) h.value = c;
}

// ── بناء HTML الختم — يقرأ كل الإعدادات ──────────────────────────
function buildCeoStampHtml(settings, small = false) {
    const s = settings || CeoState.stampSettings || {};

    const color = s.stamp_color || '#1e40af';
    const bgColor = s.stamp_bg_color || `rgba(30,64,175,.06)`;
    const shape = s.stamp_shape || 'circle';
    const mainText = s.stamp_text || 'معتمد';
    const subText = s.stamp_sub_text || 'معتمد رسمياً';
    const showSub = s.show_sub_text != 0;
    const showRing = s.show_inner_ring != 0;
    const showDate = s.show_date_in_stamp == 1;
    const orgName = s.stamp_org_name || '';
    const showOrg = s.show_org_name == 1 && orgName;
    const borderW = Math.max(1, Math.min(8, parseInt(s.stamp_border_width) || 3));

    // حجم الختم
    const sizeMap = { small: 80, medium: 110, large: 145 };
    const baseSize = sizeMap[s.stamp_size || 'medium'] || 110;
    const size = small ? Math.round(baseSize * 0.82) : baseSize;

    // الشكل
    const radiusMap = { circle: '50%', square: '12px', hexagon: '8px', oval: '50%' };
    const radius = radiusMap[shape] || '50%';
    const w = shape === 'oval' ? Math.round(size * 1.4) : size;

    // الخط
    const fMain = small ? '.72rem' : (size >= 130 ? '1.05rem' : '.88rem');
    const fSub = small ? '.55rem' : (size >= 130 ? '.68rem' : '.6rem');
    const fOrg = small ? '.5rem' : '.58rem';
    const fDate = small ? '.48rem' : '.55rem';

    const nowDate = showDate ? new Date().toLocaleDateString('ar-SA') : '';

    return `<div style="
        width:${w}px;height:${size}px;
        border:${borderW}px solid ${color};
        border-radius:${radius};
        background:${bgColor};
        color:${color};
        display:flex;flex-direction:column;
        align-items:center;justify-content:center;
        font-weight:800;text-align:center;
        line-height:1.3;padding:.3rem;
        position:relative;box-sizing:border-box;
        flex-shrink:0;
    ">
        ${showRing ? `<div style="position:absolute;inset:${borderW + 2}px;border:1.5px dashed ${color};border-radius:inherit;opacity:.35;pointer-events:none"></div>` : ''}
        ${showOrg ? `<div style="font-size:${fOrg};font-weight:700;opacity:.8;margin-bottom:1px">${escHtml(orgName)}</div>` : ''}
        <div style="font-size:${fMain};font-weight:900;letter-spacing:.03em">${escHtml(mainText)}</div>
        ${showSub ? `<div style="font-size:${fSub};opacity:.75;margin-top:1px">${escHtml(subText)}</div>` : ''}
        ${showDate ? `<div style="font-size:${fDate};opacity:.65;margin-top:2px">${nowDate}</div>` : ''}
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

    body.innerHTML = `
    <!-- هيدر الحجز -->
    <div class="ceo-res-header">
        <div>
            <div class="ceo-res-number">${res.reservation_number || '#' + res.id}</div>
            <div class="ceo-res-purpose">${escHtml(res.purpose || '')}</div>
            <div style="margin-top:.5rem;display:flex;gap:.5rem;flex-wrap:wrap">
                <span class="ceo-badge ${res.status === 'معتمد' ? 'approved' : 'pending'}">${res.status || '—'}</span>
                <span class="ceo-badge new">${res.fiscal_year || '—'} | ${res.priority || 'عادي'}</span>
            </div>
        </div>
        <div class="ceo-res-amount">
            ${fmtMoney(res.grand_total_sar || res.grand_total || 0)}
            ${res.currency && res.currency !== 'SAR'
            ? `<span>${fmtMoney(res.grand_total || 0)} ${res.currency}</span>` : ''}
        </div>
    </div>

    <!-- معلومات تفصيلية -->
    <div class="ceo-info-grid">
        <div class="ceo-info-item">
            <label>القسم</label>
            <span>${escHtml(res.department_name || '—')}</span>
        </div>
        <div class="ceo-info-item">
            <label>مقدّم الطلب</label>
            <span>${escHtml(res.requested_by_name || '—')}</span>
        </div>
        <div class="ceo-info-item">
            <label>تاريخ الطلب</label>
            <span>${fmtDate(res.request_date)}</span>
        </div>
        <div class="ceo-info-item">
            <label>المورد</label>
            <span>${escHtml(res.supplier_name || '—')}</span>
        </div>
        <div class="ceo-info-item">
            <label>بند الموازنة</label>
            <span>${escHtml(res.budget_category || '—')}</span>
        </div>
        <div class="ceo-info-item">
            <label>مركز التكلفة</label>
            <span>${escHtml(res.cost_center || '—')}</span>
        </div>
    </div>

    <!-- بنود الحجز -->
    ${res.items && res.items.length ? `
    <div class="ceo-items-section">
        <div class="ceo-section-title">📦 بنود وأصناف الحجز</div>
        <table class="ceo-items-table">
            <thead>
                <tr>
                    <th>#</th>
                    <th>الوصف</th>
                    <th>الكمية</th>
                    <th>الوحدة</th>
                    <th>سعر الوحدة</th>
                    <th>الإجمالي</th>
                </tr>
            </thead>
            <tbody>
                ${res.items.map((it, i) => `
                <tr>
                    <td>${i + 1}</td>
                    <td>${escHtml(it.description || '')}</td>
                    <td>${it.qty || '—'}</td>
                    <td>${escHtml(it.unit || '—')}</td>
                    <td>${fmtMoney(it.unit_price || 0)}</td>
                    <td><strong>${fmtMoney(it.line_total || 0)}</strong></td>
                </tr>`).join('')}
            </tbody>
        </table>
    </div>` : ''}

    <!-- الختم + التوقيع (يظهر فقط بعد الاعتماد) -->
    ${lastAction && lastAction.action_type === 'اعتماد' ? `
    <div class="ceo-stamp-wrap" id="ceoStampWrap">
        ${buildCeoStampHtml(CeoState.stampSettings)}
        <div class="ceo-stamp-info">
            <p><strong>✅ معتمد رسمياً</strong></p>
            <p>بواسطة: <strong>${escHtml(lastAction.actor_name)}</strong></p>
            <p>المنصب: ${escHtml(lastAction.actor_position || '—')}</p>
            <p>التاريخ: ${fmtDateTime(lastAction.action_date)}</p>
        </div>
        ${CeoState.signatureDataUrl
                ? `<img src="${CeoState.signatureDataUrl}" class="ceo-signature-img"
                    alt="توقيع" title="${escHtml(CeoState.stampSettings?.signature_name || '')}">`
                : ''
            }
    </div>` : ''}

    <!-- أزرار الإجراءات -->
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

    <!-- سجل الإجراءات السابقة -->
    ${hasCeoAction ? `
    <div class="ceo-section-title" style="margin-top:1rem">📋 سجل الإجراءات</div>
    <div class="ceo-history-timeline">
        ${res.ceo_actions.map(a => `
        <div class="ceo-history-item ${ACTION_HISTORY_CLASSES[a.action_type] || ''}">
            <div class="ceo-history-icon">${CEO_ACTIONS.find(x => x.key === a.action_type)?.icon || '📌'}</div>
            <div class="ceo-history-info">
                <strong>${escHtml(a.action_type)} — ${escHtml(a.actor_name)}</strong>
                <p>${escHtml(a.actor_position || '')} &nbsp;|&nbsp; ${fmtDateTime(a.action_date)}</p>
                ${a.notes ? `<p style="margin-top:.2rem;font-style:italic">${escHtml(a.notes)}</p>` : ''}
            </div>
        </div>`).join('')}
    </div>` : ''}

    <!-- زر PDF -->
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
        const res = await fetch('api/ceo_approvals_api.php?action=do_action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reservation_id: reservationId, action_type: actionType, notes }),
        });
        const data = await res.json();

        if (data.success) {
            showToast(`✅ ${data.message}`, 'success');

            // وضع علامة على الزر النشط
            if (btn) { btn.classList.remove('used'); btn.classList.add('active-action'); }

            // إذا كان اعتماداً → أنشئ PDF تلقائياً بعد تحديث البيانات
            if (actionType === 'اعتماد') {
                setTimeout(() => exportCeoApprovalPdf(reservationId), 1200);
            }

            // إعادة تحميل القائمة في الخلفية
            await fetchCeoReservations();
            renderCeoListOnly();
        } else {
            showToast(`❌ ${data.message}`, 'error');
            // إعادة تفعيل الأزرار عند الفشل
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
async function exportCeoApprovalPdf(reservationId) {
    if (typeof html2pdf === 'undefined') {
        showToast('مكتبة PDF غير محمّلة', 'error');
        return;
    }

    showToast('⏳ جاري تجهيز وثيقة PDF…', 'info');

    // جلب أحدث بيانات من الخادم دائماً
    let res = null;
    try { res = await fetchCeoReservationDetail(reservationId); } catch (e) { }
    if (!res) res = CeoState.currentRes;
    if (!res) { showToast('تعذّر جلب بيانات الحجز', 'error'); return; }
    CeoState.currentRes = res;

    const lastAction = res.ceo_actions && res.ceo_actions.length
        ? res.ceo_actions[res.ceo_actions.length - 1] : null;

    // ── بناء محتوى الطباعة ──────────────────────────────────────
    const s = CeoState.stampSettings || {};
    const stampColor = s.stamp_color || '#1e3a5f';
    const fileName = `CEO_Approval_${res.reservation_number || res.id}_${Date.now()}.pdf`;
    const nowStr = new Date().toLocaleString('ar-SA');

    // صف جدول بنود
    const itemsRows = (res.items || []).map((it, i) => `
        <tr style="background:${i % 2 === 1 ? '#f8fafc' : '#fff'}">
            <td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:center">${i + 1}</td>
            <td style="padding:6px 8px;border:1px solid #e2e8f0">${escHtml(it.description || '')}</td>
            <td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:center">${it.qty || ''}</td>
            <td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:center">${escHtml(it.unit || '')}</td>
            <td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:left">${fmtMoney(it.unit_price || 0)}</td>
            <td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:left;font-weight:700">${fmtMoney(it.line_total || 0)}</td>
        </tr>`).join('');

    // منطقة الختم + التوقيع
    const stampArea = lastAction ? `
        <div style="margin-top:32px;padding-top:20px;border-top:2px solid #e2e8f0;
                    display:flex;align-items:flex-start;justify-content:flex-end;gap:24px;flex-wrap:wrap">
            <!-- معلومات الاعتماد -->
            <div style="font-size:11px;line-height:1.9;color:#334155;text-align:right">
                <div style="font-weight:700;font-size:13px;color:${stampColor};margin-bottom:6px">
                    ${lastAction.action_type === 'اعتماد' ? '✅ معتمد رسمياً' : lastAction.action_type}
                </div>
                <div><strong>بواسطة:</strong> ${escHtml(lastAction.actor_name || '')}</div>
                <div><strong>المنصب:</strong> ${escHtml(lastAction.actor_position || '—')}</div>
                <div><strong>التاريخ:</strong> ${fmtDateTime(lastAction.action_date)}</div>
            </div>
            <!-- التوقيع -->
            ${CeoState.signatureDataUrl && lastAction.action_type === 'اعتماد' ? `
            <div style="text-align:center;min-width:130px">
                <div style="border-bottom:1px solid #94a3b8;padding-bottom:4px;margin-bottom:4px">
                    <img src="${CeoState.signatureDataUrl}"
                         style="max-height:60px;max-width:130px;object-fit:contain;display:block;margin:0 auto">
                </div>
                <div style="font-size:10px;color:#64748b">${escHtml(s.signature_name || 'التوقيع')}</div>
            </div>` : ''}
            <!-- الختم الدائري -->
            <div style="
                width:110px;height:110px;border-radius:50%;
                border:3px solid ${stampColor};
                background:rgba(30,64,175,.05);
                display:flex;flex-direction:column;
                align-items:center;justify-content:center;
                position:relative;flex-shrink:0
            ">
                <div style="position:absolute;inset:6px;border:1.5px dashed ${stampColor};
                            border-radius:50%;opacity:.35"></div>
                <div style="font-size:13px;font-weight:900;color:${stampColor};text-align:center;
                            line-height:1.3;padding:0 8px">
                    ${escHtml(s.stamp_text || 'معتمد')}
                </div>
                <div style="font-size:9px;color:${stampColor};opacity:.7;margin-top:3px">معتمد رسمياً</div>
            </div>
        </div>` : '';

    // ── إنشاء عنصر الطباعة ──────────────────────────────────────
    const printEl = document.createElement('div');
    printEl.style.cssText = `
        position:absolute;top:-9999px;left:-9999px;
        width:190mm;font-family:'Cairo','Segoe UI',sans-serif;
        direction:rtl;color:#1e293b;background:#fff;
        padding:20mm 15mm;box-sizing:border-box;font-size:12px;line-height:1.6
    `;

    printEl.innerHTML = `
    <!-- رأس الوثيقة -->
    <div style="display:flex;justify-content:space-between;align-items:flex-start;
                border-bottom:3px solid ${stampColor};padding-bottom:14px;margin-bottom:18px">
        <div>
            <div style="font-size:18px;font-weight:800;color:${stampColor}">
                وثيقة اعتماد — ${escHtml(res.reservation_number || '#' + res.id)}
            </div>
            <div style="font-size:12px;color:#64748b;margin-top:4px">
                اعتمادات الرئيس التنفيذي
            </div>
        </div>
        <div style="font-size:11px;color:#64748b;text-align:left">
            <div>${nowStr}</div>
            <div>السنة المالية: ${res.fiscal_year || '—'}</div>
        </div>
    </div>

    <!-- معلومات الحجز -->
    <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:16px">
        <tr>
            <td style="padding:7px 10px;border:1px solid #e2e8f0;background:#f1f5f9;font-weight:700;width:22%">الغرض</td>
            <td style="padding:7px 10px;border:1px solid #e2e8f0" colspan="3">${escHtml(res.purpose || '—')}</td>
        </tr>
        <tr>
            <td style="padding:7px 10px;border:1px solid #e2e8f0;background:#f1f5f9;font-weight:700">القسم</td>
            <td style="padding:7px 10px;border:1px solid #e2e8f0">${escHtml(res.department_name || '—')}</td>
            <td style="padding:7px 10px;border:1px solid #e2e8f0;background:#f1f5f9;font-weight:700">مقدّم الطلب</td>
            <td style="padding:7px 10px;border:1px solid #e2e8f0">${escHtml(res.requested_by_name || '—')}</td>
        </tr>
        <tr>
            <td style="padding:7px 10px;border:1px solid #e2e8f0;background:#f1f5f9;font-weight:700">المورد</td>
            <td style="padding:7px 10px;border:1px solid #e2e8f0">${escHtml(res.supplier_name || '—')}</td>
            <td style="padding:7px 10px;border:1px solid #e2e8f0;background:#f1f5f9;font-weight:700">بند الموازنة</td>
            <td style="padding:7px 10px;border:1px solid #e2e8f0">${escHtml(res.budget_category || '—')}</td>
        </tr>
        <tr>
            <td style="padding:7px 10px;border:1px solid #e2e8f0;background:#f1f5f9;font-weight:700">المبلغ الإجمالي</td>
            <td style="padding:7px 10px;border:1px solid #e2e8f0;font-weight:800;font-size:13px;color:${stampColor}"
                colspan="3">${fmtMoney(res.grand_total_sar || res.grand_total || 0)} ${res.currency || 'SAR'}</td>
        </tr>
    </table>

    <!-- بنود الحجز -->
    ${res.items && res.items.length ? `
    <div style="font-size:12px;font-weight:700;color:${stampColor};margin-bottom:8px">بنود وأصناف الحجز</div>
    <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:16px">
        <thead>
            <tr style="background:${stampColor};color:#fff">
                <th style="padding:7px 8px;text-align:center;width:6%">#</th>
                <th style="padding:7px 8px;text-align:right">الوصف</th>
                <th style="padding:7px 8px;text-align:center;width:10%">الكمية</th>
                <th style="padding:7px 8px;text-align:center;width:12%">الوحدة</th>
                <th style="padding:7px 8px;text-align:left;width:15%">سعر الوحدة</th>
                <th style="padding:7px 8px;text-align:left;width:15%">الإجمالي</th>
            </tr>
        </thead>
        <tbody>${itemsRows}</tbody>
        <tfoot>
            <tr style="background:#f1f5f9">
                <td colspan="5" style="padding:8px 10px;border:1px solid #e2e8f0;font-weight:700;text-align:right">
                    الإجمالي الكلي
                </td>
                <td style="padding:8px 10px;border:1px solid #e2e8f0;font-weight:800;color:${stampColor};text-align:left">
                    ${fmtMoney(res.grand_total_sar || res.grand_total || 0)}
                </td>
            </tr>
        </tfoot>
    </table>` : ''}

    <!-- الختم والتوقيع -->
    ${stampArea}

    <!-- تذييل -->
    <div style="margin-top:24px;font-size:9px;color:#94a3b8;text-align:center;border-top:1px solid #e2e8f0;padding-top:8px">
        تم إنشاء هذا المستند إلكترونياً من نظام إدارة معاملات القطاع المالي — ${nowStr}
    </div>`;

    document.body.appendChild(printEl);

    try {
        // ── توليد PDF كـ blob ────────────────────────────────────
        const pdfBlob = await html2pdf().set({
            margin: [8, 8, 8, 8],
            filename: fileName,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, logging: false },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        }).from(printEl).outputPdf('blob');

        // ── تحميل الملف للمستخدم ─────────────────────────────────
        const blobUrl = URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = blobUrl; a.download = fileName; a.click();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 3000);

        showToast('⏳ جاري الأرشفة…', 'info');

        // ── رفع الملف كـ base64 عبر JSON بسيط — بدون FormData بدون تعارض Session ──
        const pdfBase64 = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result.split(',')[1]); // base64 فقط بدون prefix
            reader.readAsDataURL(pdfBlob);
        });

        const archRes = await fetch('api/ceo_approvals_api.php?action=upload_to_archive', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                pdf_base64: pdfBase64,
                file_name: fileName,
                display_name: `اعتماد الرئيس التنفيذي — ${res.reservation_number || res.id}`,
                category: 'موازنة_تخطيط',
                description: `وثيقة اعتماد الرئيس التنفيذي لحجز الموازنة ${res.reservation_number || ''} — ${lastAction?.action_type || ''} بتاريخ ${nowStr}`,
                source_module: 'budget',
                source_id: res.id,
                tags: `اعتمادات الرئيس التنفيذي,${res.reservation_number || ''},${res.department_name || ''}`,
            })
        });

        // تحقق من أن الرد JSON وليس HTML خطأ
        const archText = await archRes.text();
        let archData;
        try {
            archData = JSON.parse(archText);
        } catch (parseErr) {
            console.error('[CEO] Archive non-JSON response:', archText.substring(0, 300));
            showToast(`⚠️ تم التحميل لكن فشلت الأرشفة: رد غير متوقع من الخادم`, 'warning');
            return;
        }

        if (archData.success) {
            showToast('✅ تم حفظ الوثيقة في الأرشيف المالي', 'success');
            // تحديث مسار الأرشيف في جدول ceo_approval_actions
            await fetch('api/ceo_approvals_api.php?action=save_archive_path', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    reservation_id: reservationId,
                    file_path: archData.path || '',
                }),
            });
        } else {
            showToast(`⚠️ تم التحميل لكن فشلت الأرشفة: ${archData.message}`, 'warning');
        }

    } catch (e) {
        console.error('[CEO] PDF export:', e);
        showToast('تعذّر تصدير PDF: ' + e.message, 'error');
    } finally {
        document.body.removeChild(printEl);
    }
}

// ═══════════════════════════════════════════════════════════════
//  إدارة الختم والتوقيع
// ═══════════════════════════════════════════════════════════════
function updateCeoStampPreview() {
    const getVal = id => document.getElementById(id)?.value || '';
    const getChk = id => document.getElementById(id)?.checked;
    const getRadio = name => document.querySelector(`input[name="${name}"]:checked`)?.value || 'medium';

    const color = getVal('ceoStampColor') || '#1e40af';
    syncColorHex();

    const previewSettings = {
        stamp_text: getVal('ceoStampText') || 'معتمد',
        stamp_sub_text: getVal('ceoStampSubText') || 'معتمد رسمياً',
        show_sub_text: getChk('ceoShowSubText') ? 1 : 0,
        stamp_color: color,
        stamp_bg_color: color + '14',
        stamp_shape: getVal('ceoStampShape') || 'circle',
        stamp_size: getRadio('ceoStampSize'),
        stamp_border_width: parseInt(getVal('ceoStampBorderWidth')) || 3,
        show_inner_ring: getChk('ceoShowInnerRing') ? 1 : 0,
        show_date_in_stamp: getChk('ceoShowDateInStamp') ? 1 : 0,
        stamp_org_name: getVal('ceoStampOrgName'),
        show_org_name: getChk('ceoShowOrgName') ? 1 : 0,
    };

    const preview = document.getElementById('ceoStampLivePreview');
    if (preview) preview.innerHTML = buildCeoStampHtml(previewSettings);
}

// ═══════════════════════════════════════════════════════════════
//  نظام رفع ومعالجة الختم / التوقيع — احترافي مع modal مراجعة
// ═══════════════════════════════════════════════════════════════

// حالة معالجة الصورة
const SigProcessor = {
    originalFile: null,   // الملف الأصلي
    originalUrl: null,   // dataURL الأصلي
    processedUrl: null,   // dataURL بعد إزالة الخلفية
    threshold: 45,     // حساسية إزالة الخلفية (0-100)
    brightness: 0,      // تعديل السطوع (-100 → +100)
    contrast: 0,      // تعديل التباين (-100 → +100)
    canvas: null,   // canvas العمل
    ctx: null,
    imageData: null,   // pixels الأصلية (قبل المعالجة)
    W: 0, H: 0,
};

// ── نقطة دخول رفع الصورة ───────────────────────────────────────
function handleCeoSignatureUpload(input) {
    const file = input.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        showToast('❌ يجب اختيار ملف صورة (PNG, JPG, WEBP)', 'error');
        return;
    }

    SigProcessor.originalFile = file;

    // قراءة الملف مباشرة كـ ObjectURL — أسرع وأكثر موثوقية
    const objectUrl = URL.createObjectURL(file);
    SigProcessor.originalUrl = objectUrl;

    openSignatureProcessorModal(objectUrl);
}

// ── فتح نافذة المعالجة ──────────────────────────────────────────
function openSignatureProcessorModal(imgSrc) {
    // إزالة أي modal سابق
    document.getElementById('sigProcessorModal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'sigProcessorModal';
    modal.style.cssText = `
        position:fixed;inset:0;background:rgba(0,0,0,.7);
        backdrop-filter:blur(6px);z-index:99999;
        display:flex;align-items:center;justify-content:center;padding:16px;
        animation:fadeIn .2s ease
    `;

    modal.innerHTML = `
    <div style="
        background:var(--card-bg,#fff);border-radius:20px;
        width:100%;max-width:820px;max-height:92vh;
        display:flex;flex-direction:column;overflow:hidden;
        box-shadow:0 24px 80px rgba(0,0,0,.35);
        direction:rtl
    ">
        <!-- Header -->
        <div style="
            padding:18px 24px;border-bottom:1px solid var(--border-color,#e2e8f0);
            display:flex;align-items:center;justify-content:space-between;
            background:linear-gradient(135deg,#1e3a5f,#2c5282);color:#fff;
            border-radius:20px 20px 0 0;flex-shrink:0
        ">
            <div style="display:flex;align-items:center;gap:12px">
                <span style="font-size:22px">✍️</span>
                <div>
                    <div style="font-weight:700;font-size:1rem">معالج الختم والتوقيع</div>
                    <div style="font-size:.75rem;opacity:.75">اضبط الإعدادات واستخرج التوقيع بخلفية شفافة</div>
                </div>
            </div>
            <button onclick="closeSignatureModal()" style="
                background:rgba(255,255,255,.15);border:none;color:#fff;
                width:32px;height:32px;border-radius:50%;cursor:pointer;
                font-size:16px;display:flex;align-items:center;justify-content:center
            ">✕</button>
        </div>

        <!-- Body -->
        <div style="display:flex;gap:0;flex:1;overflow:hidden;min-height:0">

            <!-- يسار: المعاينة -->
            <div style="flex:1;padding:20px;display:flex;flex-direction:column;gap:12px;overflow:auto;border-left:1px solid var(--border-color,#e2e8f0)">
                <div style="font-size:.8rem;font-weight:600;color:var(--text-secondary,#666);margin-bottom:2px">
                    📷 الصورة الأصلية
                </div>
                <div style="
                    background:repeating-conic-gradient(#e0e0e0 0% 25%,#f5f5f5 0% 50%) 0 0/20px 20px;
                    border-radius:10px;overflow:hidden;display:flex;align-items:center;
                    justify-content:center;min-height:140px;border:1px solid var(--border-color,#ddd)
                ">
                    <img id="sigOrigPreview" src="${imgSrc}"
                         style="max-width:100%;max-height:160px;object-fit:contain;display:block">
                </div>

                <div style="font-size:.8rem;font-weight:600;color:var(--text-secondary,#666);margin-top:4px">
                    ✨ النتيجة بعد المعالجة
                </div>
                <div style="
                    background:repeating-conic-gradient(#e0e0e0 0% 25%,#f5f5f5 0% 50%) 0 0/20px 20px;
                    border-radius:10px;overflow:hidden;display:flex;align-items:center;
                    justify-content:center;min-height:140px;border:1px solid var(--border-color,#ddd);
                    position:relative
                ">
                    <canvas id="sigResultCanvas"
                            style="max-width:100%;max-height:160px;object-fit:contain;display:block"></canvas>
                    <div id="sigProcessingOverlay" style="
                        position:absolute;inset:0;background:rgba(255,255,255,.85);
                        display:flex;flex-direction:column;align-items:center;justify-content:center;
                        gap:8px;font-size:.82rem;color:#1e3a5f
                    ">
                        <div style="
                            width:28px;height:28px;border:3px solid #e2e8f0;
                            border-top-color:#1e3a5f;border-radius:50%;
                            animation:ceo-spin .7s linear infinite
                        "></div>
                        جاري التحليل…
                    </div>
                </div>
            </div>

            <!-- يمين: أدوات الضبط -->
            <div style="width:240px;padding:20px;display:flex;flex-direction:column;gap:14px;overflow:auto;flex-shrink:0">

                <div style="font-size:.82rem;font-weight:700;color:#1e3a5f">🎛️ أدوات الضبط</div>

                <!-- حساسية إزالة الخلفية -->
                <div>
                    <div style="display:flex;justify-content:space-between;margin-bottom:5px">
                        <label style="font-size:.78rem;font-weight:600;color:var(--text-secondary,#555)">حساسية الإزالة</label>
                        <span id="thresholdVal" style="font-size:.78rem;font-weight:700;color:#1e3a5f">45</span>
                    </div>
                    <input type="range" id="sigThreshold" min="10" max="120" value="45"
                           oninput="sigUpdateThreshold(this.value)"
                           style="width:100%;accent-color:#1e3a5f">
                    <div style="display:flex;justify-content:space-between;font-size:.68rem;color:#94a3b8;margin-top:2px">
                        <span>دقيق</span><span>واسع</span>
                    </div>
                </div>

                <!-- السطوع -->
                <div>
                    <div style="display:flex;justify-content:space-between;margin-bottom:5px">
                        <label style="font-size:.78rem;font-weight:600;color:var(--text-secondary,#555)">السطوع</label>
                        <span id="brightnessVal" style="font-size:.78rem;font-weight:700;color:#1e3a5f">0</span>
                    </div>
                    <input type="range" id="sigBrightness" min="-80" max="80" value="0"
                           oninput="sigUpdateBrightness(this.value)"
                           style="width:100%;accent-color:#1e3a5f">
                </div>

                <!-- التباين -->
                <div>
                    <div style="display:flex;justify-content:space-between;margin-bottom:5px">
                        <label style="font-size:.78rem;font-weight:600;color:var(--text-secondary,#555)">التباين</label>
                        <span id="contrastVal" style="font-size:.78rem;font-weight:700;color:#1e3a5f">0</span>
                    </div>
                    <input type="range" id="sigContrast" min="-80" max="80" value="0"
                           oninput="sigUpdateContrast(this.value)"
                           style="width:100%;accent-color:#1e3a5f">
                </div>

                <!-- زر إعادة ضبط -->
                <button onclick="sigResetSettings()" style="
                    padding:7px;border:1px solid var(--border-color,#ddd);
                    border-radius:8px;background:transparent;cursor:pointer;
                    font-size:.78rem;color:var(--text-secondary,#666);
                    transition:all .15s
                " onmouseover="this.style.background='var(--bg-secondary,#f5f5f5)'"
                   onmouseout="this.style.background='transparent'">
                    🔄 إعادة ضبط
                </button>

                <!-- فاصل -->
                <div style="border-top:1px solid var(--border-color,#e2e8f0);padding-top:12px">
                    <div style="font-size:.78rem;font-weight:600;color:var(--text-secondary,#555);margin-bottom:8px">
                        💡 نصائح
                    </div>
                    <div style="font-size:.72rem;color:var(--text-secondary,#888);line-height:1.7">
                        • زد الحساسية إذا بقيت بقع من الخلفية<br>
                        • قللها إذا اختفى جزء من الختم<br>
                        • PNG بخلفية بيضاء نظيفة يعطي أفضل نتيجة
                    </div>
                </div>
            </div>
        </div>

        <!-- Footer: أزرار القرار -->
        <div style="
            padding:16px 24px;border-top:1px solid var(--border-color,#e2e8f0);
            display:flex;gap:10px;justify-content:flex-end;flex-shrink:0;
            background:var(--bg-secondary,#f8f9fa);border-radius:0 0 20px 20px
        ">
            <button onclick="closeSignatureModal()" style="
                padding:10px 20px;border:1px solid var(--border-color,#ddd);
                border-radius:10px;background:transparent;cursor:pointer;
                font-size:.88rem;color:var(--text-secondary,#666)
            ">إلغاء</button>
            <button onclick="sigApproveAndSave()" id="sigApproveBtn" style="
                padding:10px 24px;border:none;border-radius:10px;cursor:pointer;
                font-size:.88rem;font-weight:700;
                background:linear-gradient(135deg,#15803d,#16a34a);color:#fff;
                display:flex;align-items:center;gap:8px;transition:all .2s;
                box-shadow:0 2px 8px rgba(21,128,61,.3)
            " disabled>
                <span>✅</span> موافق — اعتماد الختم
            </button>
        </div>
    </div>`;

    document.body.appendChild(modal);

    // بدء المعالجة بـ Python/OpenCV
    sigProcessWithOpenCV();
}

// ── معالجة الصورة عبر Python/OpenCV على السيرفر ─────────────────
async function sigProcessWithOpenCV() {
    const overlay = document.getElementById('sigProcessingOverlay');
    const resultImg = document.getElementById('sigResultImg');
    const approveBtn = document.getElementById('sigApproveBtn');
    const reprocessBtn = document.getElementById('sigReprocessBtn');
    const statusBox = document.getElementById('sigStatusBox');

    // إظهار loading
    if (overlay) {
        overlay.style.display = 'flex'; overlay.innerHTML = `
        <div style="font-size:2rem">⏳</div>
        <div style="font-size:.82rem;color:#1e3a5f;font-weight:600">جاري التحليل بـ OpenCV…</div>
        <div style="font-size:.72rem;color:#64748b">إزالة خطوط الدفتر واستخراج التوقيع</div>`;
    }
    if (resultImg) resultImg.style.display = 'none';
    if (approveBtn) { approveBtn.disabled = true; approveBtn.style.opacity = '.5'; }
    if (reprocessBtn) { reprocessBtn.disabled = true; reprocessBtn.style.opacity = '.5'; }

    try {
        const file = SigProcessor.originalFile;
        if (!file) throw new Error('لم يُحدَّد ملف');

        const crop = document.getElementById('sigCropOption')?.checked;

        // تحويل الملف لـ base64
        const b64 = await new Promise((res, rej) => {
            const reader = new FileReader();
            reader.onload = e => res(e.target.result);
            reader.onerror = rej;
            reader.readAsDataURL(file);
        });

        // إرسال لـ PHP → Python/OpenCV
        const resp = await fetch('api/process_signature.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image_base64: b64, crop: !!crop })
        });
        const data = await resp.json();

        if (!data.success) {
            // fallback Canvas
            console.warn('[CEO] OpenCV unavailable, using Canvas fallback:', data.message);
            await _sigFallbackCanvas();
            return;
        }

        // عرض النتيجة
        SigProcessor.processedUrl = data.image_base64;
        if (resultImg) { resultImg.src = data.image_base64; resultImg.style.display = 'block'; }
        if (overlay) overlay.style.display = 'none';
        if (approveBtn) { approveBtn.disabled = false; approveBtn.style.opacity = '1'; }
        if (reprocessBtn) { reprocessBtn.disabled = false; reprocessBtn.style.opacity = '1'; }
        if (statusBox) {
            statusBox.style.cssText = 'display:block;background:#f0fdf4;color:#15803d;padding:10px 12px;border-radius:8px;font-size:.78rem;line-height:1.6';
            statusBox.innerHTML = `✅ OpenCV — تم الاستخراج<br>الحجم: ${data.size?.width ?? '—'}×${data.size?.height ?? '—'} px`;
        }

    } catch (e) {
        console.error('[CEO] sigProcessWithOpenCV:', e);
        await _sigFallbackCanvas();
    }
}

// ── Fallback: Canvas (إذا Python غير متاح) ──────────────────────
async function _sigFallbackCanvas() {
    const overlay = document.getElementById('sigProcessingOverlay');
    const approveBtn = document.getElementById('sigApproveBtn');
    const statusBox = document.getElementById('sigStatusBox');

    if (overlay) overlay.innerHTML = `<div style="font-size:.82rem;color:#92400e">⚠️ جاري الرفع…</div>`;

    try {
        const file = SigProcessor.originalFile;
        if (!file) throw new Error('لا يوجد ملف');

        // FileReader → dataURL (يعمل دائماً بدون استثناء)
        const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = () => reject(new Error('فشل قراءة الملف'));
            reader.readAsDataURL(file);
        });

        // حفظ مباشرة — Canvas محظور في XAMPP على localhost
        SigProcessor.processedUrl = dataUrl;

        // عرض الصورة بـ <img> مباشرة بدون Canvas
        const resultWrap = document.getElementById('sigResultCanvas')?.parentElement;
        if (resultWrap) {
            const canvas = document.getElementById('sigResultCanvas');
            if (canvas) canvas.style.display = 'none';
            let previewImg = resultWrap.querySelector('img.sig-result-preview');
            if (!previewImg) {
                previewImg = document.createElement('img');
                previewImg.className = 'sig-result-preview';
                previewImg.style.cssText = 'max-width:100%;max-height:160px;object-fit:contain;display:block';
                resultWrap.appendChild(previewImg);
            }
            previewImg.src = dataUrl;
        }

        if (overlay) overlay.style.display = 'none';
        if (approveBtn) { approveBtn.disabled = false; approveBtn.style.opacity = '1'; }
        if (statusBox) {
            statusBox.style.cssText = 'display:block;background:#fef3c7;color:#92400e;padding:10px 12px;border-radius:8px;font-size:.78rem;line-height:1.6';
            statusBox.innerHTML = '⚠️ تم رفع الصورة بدون إزالة خلفية<br>للحصول على خلفية شفافة: ثبّت python3 + opencv-python';
        }

    } catch (e) {
        console.error('[CEO] _sigFallbackCanvas error:', e);
        if (overlay) overlay.innerHTML =
            `<span style="color:#dc2626;font-size:.82rem">❌ ${e.message}</span>`;
    }
}
// ── إعادة المعالجة ───────────────────────────────────────────────
function sigReprocess() {
    SigProcessor.processedUrl = null;
    sigProcessWithOpenCV();
}

// ── موافقة واعتماد الختم ────────────────────────────────────────
function sigApproveAndSave() {
    if (!SigProcessor.processedUrl) {
        showToast('❌ لم تكتمل المعالجة بعد', 'error');
        return;
    }

    // حفظ في الحالة العامة
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
                ✅ تم اعتماد الختم — انقر لتغييره
            </p>`;
    }

    // تحديث معاينة في لوحة الإعدادات
    const previewWrap = document.querySelector('.ceo-stamp-preview-wrap');
    if (previewWrap) {
        let prevImg = previewWrap.querySelector('img.ceo-sig-in-preview');
        if (!prevImg) {
            prevImg = document.createElement('img');
            prevImg.className = 'ceo-sig-in-preview';
            prevImg.style.cssText = 'max-height:55px;max-width:140px;object-fit:contain;margin-top:.5rem;display:block';
            previewWrap.appendChild(prevImg);
        }
        prevImg.src = SigProcessor.processedUrl;
    }

    closeSignatureModal();
    showToast('✅ تم اعتماد الختم — احفظ الإعدادات لتطبيقه', 'success');

    // إظهار زر الحذف
    const delBtn = document.getElementById('ceoDeleteSigBtn');
    if (delBtn) delBtn.style.display = 'flex';

    // تحرير الـ ObjectURL
    if (SigProcessor.originalUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(SigProcessor.originalUrl);
    }
}

// ── حذف صورة التوقيع ────────────────────────────────────────────
async function deleteCeoSignature() {
    if (!confirm('هل تريد حذف صورة التوقيع؟')) return;

    try {
        const r = await fetch('api/ceo_approvals_api.php?action=delete_signature', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }
        });
        const d = await r.json();
        if (!d.success) throw new Error(d.message);

        // مسح من الذاكرة
        CeoState.signatureDataUrl = null;

        // تحديث منطقة الرفع
        const content = document.getElementById('ceoSigUploadContent');
        if (content) {
            content.style.display = '';
            content.innerHTML = `
                <span style="font-size:2rem">✍️</span>
                <p style="font-size:.82rem;color:var(--text-muted);margin:.35rem 0 0">اسحب أو انقر لرفع صورة التوقيع</p>
                <p style="font-size:.72rem;color:var(--text-muted);margin:.2rem 0 0">سيتم استخراج التوقيع بخلفية شفافة تلقائياً</p>`;
        }

        // إخفاء زر الحذف
        const btn = document.getElementById('ceoDeleteSigBtn');
        if (btn) btn.style.display = 'none';

        // إزالة صورة التوقيع من المعاينة
        document.querySelector('.ceo-sig-in-preview')?.remove();

        // إعادة تعيين input الملف
        const fileInput = document.getElementById('ceoSigFile');
        if (fileInput) fileInput.value = '';

        showToast('✅ تم حذف صورة التوقيع', 'success');

    } catch (e) {
        showToast('❌ فشل الحذف: ' + e.message, 'error');
    }
}

// ── إغلاق المودال ───────────────────────────────────────────────
function closeSignatureModal() {
    const modal = document.getElementById('sigProcessorModal');
    if (modal) {
        modal.style.animation = 'fadeOut .15s ease forwards';
        setTimeout(() => modal.remove(), 150);
    }
}

// ── حفظ إعدادات الختم ───────────────────────────────────────────
async function saveCeoStampSettings() {
    const getVal = id => document.getElementById(id)?.value || '';
    const getChk = id => document.getElementById(id)?.checked ? 1 : 0;
    const getRadio = name => document.querySelector(`input[name="${name}"]:checked`)?.value || 'medium';

    const color = getVal('ceoStampColor') || '#1e40af';

    const payload = {
        stamp_text: getVal('ceoStampText') || 'معتمد',
        stamp_sub_text: getVal('ceoStampSubText') || 'معتمد رسمياً',
        show_sub_text: getChk('ceoShowSubText'),
        stamp_color: color,
        stamp_bg_color: color + '14',
        stamp_shape: getVal('ceoStampShape') || 'circle',
        stamp_size: getRadio('ceoStampSize'),
        stamp_border_width: parseInt(getVal('ceoStampBorderWidth')) || 3,
        show_inner_ring: getChk('ceoShowInnerRing'),
        show_date_in_stamp: getChk('ceoShowDateInStamp'),
        stamp_org_name: getVal('ceoStampOrgName'),
        show_org_name: getChk('ceoShowOrgName'),
        signature_name: getVal('ceoSigName'),
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
            // تحديث الذاكرة
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
function fmtMoney(v) {
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