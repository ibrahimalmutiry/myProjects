/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║      app-settings-system.js — إعدادات النظام ولوحة التحكم   ║
 * ║  يتطلب: app-common.js, app-transactions.js                   ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

// ════════════════════════════════════════════════════════════
// قسم النظام — إعدادات فقط (بادئات + موقّعون + خطر)
// ════════════════════════════════════════════════════════════
async function renderSystemSection() {
    var cont = document.getElementById('settingsContent');
    cont.innerHTML = `
    <!-- ══ رأس الصفحة ══ -->
    <div class="sys-page-header">
        <div class="sys-page-title">
            <div class="sys-page-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
            </div>
            <div>
                <div class="sys-page-title-text">إعدادات النظام</div>
                <div class="sys-page-subtitle">إدارة البادئات والموقّعين وطلبات الشراء والأقسام</div>
            </div>
        </div>
    </div>

    <!-- ══ الصف الأول: بادئات + موقّعون ══ -->
    <div class="sys-row-2col">

        <!-- بادئات الأرقام -->
        <div class="sys-card">
            <div class="sys-card-head">
                <div class="sys-card-head-icon sys-icon-teal">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
                        <line x1="7" y1="7" x2="7.01" y2="7"/>
                    </svg>
                </div>
                <div>
                    <div class="sys-card-title">بادئات الأرقام التلقائية</div>
                    <div class="sys-card-sub">أحرف إنجليزية كبيرة فقط (1–10 محارف)</div>
                </div>
            </div>
            <div id="prefixes-list" class="sys-card-body">
                <div class="sys-loading">جاري التحميل...</div>
            </div>
        </div>

        <!-- موقّعو أوامر الدفع -->
        <div class="sys-card">
            <div class="sys-card-head">
                <div class="sys-card-head-icon sys-icon-purple">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                    </svg>
                </div>
                <div>
                    <div class="sys-card-title">موقّعو أوامر الدفع</div>
                    <div class="sys-card-sub">تظهر في مربعات التوقيع عند الطباعة</div>
                </div>
            </div>
            <div id="signers-list" class="sys-card-body">
                <div class="sys-loading">جاري التحميل...</div>
            </div>
        </div>

    </div>

    <!-- ══ إعدادات طلبات الشراء ══ -->
    <div class="sys-card sys-card-full">
        <div class="sys-card-head sys-card-head-bordered">
            <div class="sys-card-head-icon sys-icon-blue">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
            </div>
            <div style="flex:1">
                <div class="sys-card-title">إعدادات طلبات الشراء</div>
                <div class="sys-card-sub">حد المبلغ الفاصل بين المسارين ومدد SLA لكل مرحلة</div>
            </div>
            <button class="sys-save-btn" onclick="savePrSettings()">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <polyline points="20 6 9 17 4 12"/>
                </svg>
                حفظ الإعدادات
            </button>
        </div>

        <div class="sys-card-body">
            <!-- حد المبلغ -->
            <div class="sys-threshold-row">
                <div class="sys-threshold-info">
                    <div class="sys-threshold-label">حد المبلغ الفاصل</div>
                    <div class="sys-threshold-desc">
                        <span class="sys-path-pill sys-path-short">مسار قصير</span>
                        أقل من الحد
                        <span style="color:var(--text-muted);margin:0 .25rem">|</span>
                        <span class="sys-path-pill sys-path-long">مسار كامل</span>
                        أكبر منه أو يساوي
                    </div>
                </div>
                <div class="sys-threshold-input-wrap">
                    <input type="number" id="pr-threshold-input" class="sys-number-input"
                           placeholder="5000" min="0" step="500">
                    <span class="sys-input-unit">ر.س</span>
                </div>
            </div>

            <!-- جدول SLA -->
            <div class="sys-sla-section">
                <div class="sys-sla-label">مدد SLA لكل مرحلة</div>
                <div id="pr-sla-table"><div class="sys-loading">جاري التحميل...</div></div>
            </div>
        </div>
    </div>

    <!-- ══ الصف الثاني: خطر + أقسام ══ -->
    <div class="sys-row-danger">

        <!-- منطقة الخطر -->
        <div class="sys-card sys-danger-card">
            <div class="sys-card-head">
                <div class="sys-card-head-icon sys-icon-red">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                        <line x1="12" y1="9" x2="12" y2="13"/>
                        <line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                </div>
                <div>
                    <div class="sys-card-title sys-danger-title">منطقة الخطر</div>
                    <div class="sys-card-sub">هذه الإجراءات لا يمكن التراجع عنها</div>
                </div>
            </div>
            <div class="sys-card-body">
                <div class="sys-danger-item">
                    <div class="sys-danger-item-info">
                        <div class="sys-danger-item-name">حذف جميع المعاملات</div>
                        <div class="sys-danger-item-desc">يحذف كل المعاملات وبياناتها المرتبطة نهائياً</div>
                    </div>
                    <button class="sys-danger-btn" onclick="clearAllTransactions()">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                        حذف الكل
                    </button>
                </div>
            </div>
        </div>

    </div>

    <!-- ══ الأقسام التنظيمية ══ -->
    <div class="sys-card sys-card-full">
        <div class="sys-card-head sys-card-head-bordered">
            <div class="sys-card-head-icon sys-icon-amber">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                    <polyline points="9 22 9 12 15 12 15 22"/>
                </svg>
            </div>
            <div style="flex:1">
                <div class="sys-card-title">الأقسام التنظيمية</div>
                <div class="sys-card-sub">الوحدات الداخلية داخل كل قطاع — يُربط بها الموظفون</div>
            </div>
            <div class="sys-card-actions">
                <select id="div-sector-filter" class="sys-select" onchange="loadDivisionsSection()">
                    <option value="">كل القطاعات</option>
                </select>
                <button class="sys-outline-btn" onclick="openBulkImportModal()">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="7 10 12 15 17 10"/>
                        <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    استيراد دفعي
                </button>
                <button class="sys-save-btn" onclick="openAddDivisionModal()">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    إضافة قسم
                </button>
            </div>
        </div>
        <div id="divisions-list" class="sys-card-body sys-divisions-body">
            <div class="sys-loading">جاري التحميل...</div>
        </div>
    </div>
    `;

    _injectSysStyles();
    loadPrefixesSection();
    loadSignersSection();
    await loadDivisionsSection();
    await loadPrSettings();
}

function _injectSysStyles() {
    if (document.getElementById('sys-redesign-css')) return;
    const s = document.createElement('style');
    s.id = 'sys-redesign-css';
    s.textContent = `
/* ── رأس الصفحة ── */
.sys-page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1.5rem;
}
.sys-page-title {
    display: flex;
    align-items: center;
    gap: .75rem;
}
.sys-page-icon {
    width: 38px;
    height: 38px;
    border-radius: 10px;
    background: rgba(63,89,80,.12);
    border: 1px solid rgba(63,89,80,.2);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--btn-primary-bg, #3F5950);
    flex-shrink: 0;
}
.sys-page-title-text {
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--text-primary);
}
.sys-page-subtitle {
    font-size: .78rem;
    color: var(--text-muted);
    margin-top: 2px;
}

/* ── بطاقات ── */
.sys-row-2col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin-bottom: 1rem;
}
.sys-card-full { width: 100%; margin-bottom: 1rem; }
.sys-row-danger { margin-bottom: 1rem; }

.sys-card {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 14px;
    overflow: hidden;
}
.sys-card-head {
    display: flex;
    align-items: center;
    gap: .75rem;
    padding: .9rem 1.1rem;
    background: var(--bg-surface);
}
.sys-card-head-bordered {
    border-bottom: 1px solid var(--border-color);
}
.sys-card-head-icon {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}
.sys-icon-teal   { background: rgba(29,158,117,.1);  color: #1D9E75; border: 1px solid rgba(29,158,117,.2); }
.sys-icon-purple { background: rgba(83,74,183,.1);   color: #534AB7; border: 1px solid rgba(83,74,183,.2); }
.sys-icon-blue   { background: rgba(24,95,165,.1);   color: #185FA5; border: 1px solid rgba(24,95,165,.2); }
.sys-icon-amber  { background: rgba(186,117,23,.1);  color: #BA7517; border: 1px solid rgba(186,117,23,.2); }
.sys-icon-red    { background: rgba(163,45,45,.1);   color: #A32D2D; border: 1px solid rgba(163,45,45,.2); }
.sys-card-title  { font-size: .88rem; font-weight: 700; color: var(--text-primary); }
.sys-card-sub    { font-size: .74rem; color: var(--text-muted); margin-top: 2px; }
.sys-card-body   { padding: .85rem 1.1rem; }
.sys-card-actions {
    display: flex;
    align-items: center;
    gap: .5rem;
    flex-shrink: 0;
    flex-wrap: wrap;
}

/* ── حقل البادئات / الموقّعين (prefix-row يبقى كما هو) ── */
.sys-card-body .prefix-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: .55rem 0;
    border-bottom: 1px solid var(--border-color);
    gap: .75rem;
}
.sys-card-body .prefix-row:last-child { border-bottom: none; }
.sys-card-body .prefix-label {
    font-size: .82rem;
    color: var(--text-secondary);
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.sys-card-body .prefix-input-wrap {
    display: flex;
    align-items: center;
    gap: .4rem;
    flex-shrink: 0;
}
.sys-card-body .prefix-input {
    width: 90px;
    padding: .35rem .6rem;
    border-radius: 7px;
    border: 1px solid var(--border-color);
    background: var(--bg-card);
    color: var(--text-primary);
    font-size: .82rem;
    text-align: center;
    font-family: monospace;
    outline: none;
    transition: border-color .15s;
}
.sys-card-body .prefix-input:focus { border-color: var(--btn-primary-bg); }
.sys-card-body .prefix-save-btn {
    padding: .3rem .7rem;
    border-radius: 7px;
    border: 1px solid var(--btn-primary-bg);
    background: rgba(63,89,80,.1);
    color: var(--btn-primary-bg);
    font-size: .76rem;
    font-weight: 600;
    cursor: pointer;
    font-family: var(--font-primary);
    transition: all .15s;
}
.sys-card-body .prefix-save-btn:hover {
    background: var(--btn-primary-bg);
    color: var(--btn-primary-text, #fff);
}
.sys-card-body .prefix-save-btn:disabled { opacity: .45; cursor: not-allowed; }
.sys-card-body .prefix-status { font-size: .72rem; min-width: 60px; }

/* ── حد المبلغ ── */
.sys-threshold-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: .7rem .9rem;
    background: var(--bg-surface);
    border: 1px solid var(--border-color);
    border-radius: 10px;
    gap: 1rem;
    flex-wrap: wrap;
}
.sys-threshold-label { font-size: .88rem; font-weight: 600; color: var(--text-primary); margin-bottom: .2rem; }
.sys-threshold-desc  { font-size: .76rem; color: var(--text-muted); display: flex; align-items: center; gap: .3rem; flex-wrap: wrap; }
.sys-path-pill {
    font-size: .68rem;
    font-weight: 600;
    padding: 1px 7px;
    border-radius: 999px;
}
.sys-path-short { background: rgba(29,158,117,.1); color: #1D9E75; }
.sys-path-long  { background: rgba(186,117,23,.1); color: #BA7517; }

.sys-threshold-input-wrap { display: flex; align-items: center; gap: .4rem; flex-shrink: 0; }
.sys-number-input {
    width: 120px;
    padding: .45rem .75rem;
    border-radius: 8px;
    border: 1px solid var(--border-color);
    background: var(--bg-card);
    color: var(--text-primary);
    font-size: .88rem;
    text-align: center;
    font-family: var(--font-primary);
    outline: none;
    transition: border-color .15s;
}
.sys-number-input:focus { border-color: var(--btn-primary-bg); }
.sys-input-unit { font-size: .8rem; color: var(--text-muted); }

/* ── قسم SLA ── */
.sys-sla-section { margin-top: 1rem; }
.sys-sla-label {
    font-size: .74rem;
    font-weight: 700;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: .05em;
    margin-bottom: .5rem;
}

/* ── منطقة الخطر ── */
.sys-danger-card { border-color: rgba(163,45,45,.25); }
.sys-danger-title { color: #A32D2D !important; }
.sys-danger-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: .6rem .75rem;
    background: rgba(163,45,45,.04);
    border: 1px solid rgba(163,45,45,.15);
    border-radius: 9px;
    gap: 1rem;
    flex-wrap: wrap;
}
.sys-danger-item-name { font-size: .85rem; font-weight: 600; color: #A32D2D; }
.sys-danger-item-desc { font-size: .74rem; color: var(--text-muted); margin-top: 2px; }
.sys-danger-btn {
    display: flex;
    align-items: center;
    gap: .35rem;
    padding: .38rem .85rem;
    border-radius: 8px;
    border: 1px solid rgba(163,45,45,.4);
    background: rgba(163,45,45,.08);
    color: #A32D2D;
    font-size: .78rem;
    font-weight: 600;
    cursor: pointer;
    font-family: var(--font-primary);
    transition: all .15s;
    white-space: nowrap;
    flex-shrink: 0;
}
.sys-danger-btn:hover { background: #A32D2D; color: #fff; border-color: #A32D2D; }

/* ── أزرار مشتركة ── */
.sys-save-btn {
    display: inline-flex;
    align-items: center;
    gap: .35rem;
    padding: .42rem .9rem;
    border-radius: 8px;
    border: none;
    background: var(--btn-primary-bg, #3F5950);
    color: var(--btn-primary-text, #fff);
    font-size: .78rem;
    font-weight: 600;
    cursor: pointer;
    font-family: var(--font-primary);
    transition: opacity .15s;
    white-space: nowrap;
    flex-shrink: 0;
}
.sys-save-btn:hover { opacity: .87; }

.sys-outline-btn {
    display: inline-flex;
    align-items: center;
    gap: .35rem;
    padding: .4rem .85rem;
    border-radius: 8px;
    border: 1px solid var(--border-color);
    background: transparent;
    color: var(--text-secondary);
    font-size: .78rem;
    font-weight: 500;
    cursor: pointer;
    font-family: var(--font-primary);
    transition: all .15s;
    white-space: nowrap;
    flex-shrink: 0;
}
.sys-outline-btn:hover { background: var(--bg-card); color: var(--text-primary); }

.sys-select {
    padding: .38rem .7rem;
    border-radius: 8px;
    border: 1px solid var(--border-color);
    background: var(--bg-card);
    color: var(--text-secondary);
    font-size: .78rem;
    font-family: var(--font-primary);
    cursor: pointer;
    outline: none;
    min-width: 130px;
}
.sys-select:focus { border-color: var(--btn-primary-bg); }

/* ── الأقسام ── */
.sys-divisions-body { padding: 0; }
.sys-divisions-body .div-sector-group-label { padding: .6rem 1.1rem; }
.sys-divisions-body .div-row { padding: .6rem 1.1rem; }

/* ── loading ── */
.sys-loading {
    padding: 1rem;
    font-size: .8rem;
    color: var(--text-muted);
    text-align: center;
}

/* ── Responsive ── */
@media (max-width: 700px) {
    .sys-row-2col { grid-template-columns: 1fr; }
    .sys-card-actions { width: 100%; justify-content: flex-start; }
    .sys-card-head { flex-wrap: wrap; }
    .sys-threshold-row { flex-direction: column; align-items: flex-start; }
}
    `;
    document.head.appendChild(s);
}

// ════════════════════════════════════════════════════════════
// الأقسام التنظيمية — عرض وإدارة
// ════════════════════════════════════════════════════════════

/** بيانات مؤقتة لاستخدامها في المودالات */
const DivState = { sectors: [], employees: [], divisions: [] };

async function loadDivisionsSection() {
    const el = document.getElementById('divisions-list');
    if (!el) return;
    el.innerHTML = '<div class="loading-inline">⏳ جاري التحميل...</div>';

    try {
        // جلب الأقسام (sectors = dept_type='sector' أو parent_id IS NULL)
        const [depRes, empRes] = await Promise.all([
            fetch('api/settings.php?action=get_departments'),
            fetch('api/?action=employees'),
        ]);
        const depData = await depRes.json();
        const empData = await empRes.json();

        const allDepts = depData.success ? (depData.data || []) : [];
        DivState.employees = empData.success ? (empData.data || []) : [];

        // تصنيف: القطاعات = بدون parent أو dept_type=sector
        DivState.sectors = allDepts.filter(d => !d.parent_id || d.dept_type === 'sector');
        // الأقسام = لها parent أو dept_type=division/team
        DivState.divisions = allDepts.filter(d => d.parent_id || d.dept_type === 'division' || d.dept_type === 'team');

        // ملء فلتر القطاع
        const filterSel = document.getElementById('div-sector-filter');
        if (filterSel && filterSel.options.length <= 1) {
            DivState.sectors.forEach(s => {
                const opt = new Option(s.name, s.id);
                filterSel.add(opt);
            });
        }

        // فلترة الأقسام حسب القطاع المختار
        const selectedSector = filterSel?.value || '';
        let filtered = DivState.divisions;
        if (selectedSector) {
            filtered = filtered.filter(d =>
                String(d.sector_id) === selectedSector ||
                String(d.parent_id) === selectedSector
            );
        }

        if (!filtered.length) {
            const sectorName = selectedSector
                ? (DivState.sectors.find(s => String(s.id) === selectedSector)?.name || '')
                : '';
            el.innerHTML = `
                <div class="div-empty">
                    <div style="font-size:2.5rem;opacity:.35">🏢</div>
                    <p>${sectorName ? `لا توجد أقسام في قطاع "${sectorName}"` : 'لا توجد أقسام بعد'}</p>
                    <button class="btn btn-primary btn-sm" onclick="openAddDivisionModal()">أضف أول قسم</button>
                </div>`;
            return;
        }

        // تجميع حسب القطاع
        const bySector = {};
        filtered.forEach(d => {
            const sid = d.sector_id || d.parent_id || 0;
            if (!bySector[sid]) bySector[sid] = [];
            bySector[sid].push(d);
        });

        let html = '';
        for (const [sid, divs] of Object.entries(bySector)) {
            const sector = DivState.sectors.find(s => String(s.id) === sid);
            if (sector) {
                html += `<div class="div-sector-group-label">
                    <span class="div-sector-dot"></span>${sector.name}
                    <span class="div-sector-count">${divs.length} قسم</span>
                </div>`;
            }
            divs.forEach(d => {
                const empCount = parseInt(d.employee_count) || 0;
                const manager = d.manager_name || '—';
                const typeLabel = { division: 'قسم', team: 'فريق', sector: 'قطاع' }[d.dept_type] || d.dept_type;
                html += `
                <div class="div-row" data-id="${d.id}">
                    <div class="div-row-icon">🏢</div>
                    <div class="div-row-info">
                        <div class="div-row-name">
                            ${d.name}
                            ${d.code ? `<code class="div-code">${d.code}</code>` : ''}
                            <span class="div-type-badge div-type-${d.dept_type}">${typeLabel}</span>
                        </div>
                        <div class="div-row-meta">
                            <span title="مدير القسم">👤 ${manager}</span>
                            <span title="عدد الموظفين">👥 ${empCount} موظف</span>
                            ${d.description ? `<span title="الوصف">💬 ${d.description}</span>` : ''}
                        </div>
                    </div>
                    <div class="div-row-actions">
                        <button class="btn btn-sm btn-outline"
                            onclick="openEditDivisionModal(${JSON.stringify(d).split('"').join('&quot;')})">
                            ✏️ تعديل
                        </button>
                        <button class="btn btn-sm btn-danger-outline"
                            onclick="deleteDivision(${d.id},'${d.name}',${empCount})">
                            🗑 حذف
                        </button>
                    </div>
                </div>`;
            });
        }
        el.innerHTML = `<div class="div-list">${html}</div>`;

    } catch (e) {
        el.innerHTML = `<p style="color:red;padding:1rem">خطأ: ${e.message}</p>`;
    }
}

// ── المودال المشترك للإضافة والتعديل ─────────────────────────
function _divisionModalHTML(d = {}) {
    const sectors = DivState.sectors;
    const employees = DivState.employees;

    const sectorOpts = sectors.map(s =>
        `<option value="${s.id}" ${(d.sector_id || d.parent_id) == s.id ? 'selected' : ''}>${s.name}</option>`
    ).join('');

    const empOpts = employees.map(e =>
        `<option value="${e.id}" ${d.manager_id == e.id ? 'selected' : ''}>${e.name}</option>`
    ).join('');

    return `
    <div class="pr-form">
        ${d.id ? `<input type="hidden" id="dv-id" value="${d.id}">` : ''}

        <div class="form-group">
            <label class="form-label">القطاع التابع له *</label>
            <select id="dv-sector" class="form-select" required>
                <option value="">— اختر القطاع —</option>
                ${sectorOpts}
            </select>
        </div>

        <div class="modal-form-grid">
            <div class="form-group">
                <label class="form-label">اسم القسم *</label>
                <input type="text" id="dv-name" class="form-input"
                       value="${d.name || ''}" placeholder="مثال: المحاسبة" required>
            </div>
            <div class="form-group">
                <label class="form-label">الرمز
                    <span style="font-size:.72rem;color:var(--text-muted)">(اختياري)</span>
                </label>
                <input type="text" id="dv-code" class="form-input"
                       value="${d.code || ''}" placeholder="ACC" maxlength="10"
                       style="text-transform:uppercase">
            </div>
        </div>

        <div class="form-group">
            <label class="form-label">النوع</label>
            <select id="dv-type" class="form-select">
                <option value="division" ${'division' === (d.dept_type || 'division') ? 'selected' : ''}>قسم</option>
                <option value="team"     ${'team' === d.dept_type ? 'selected' : ''}>فريق</option>
            </select>
        </div>

        <div class="form-group">
            <label class="form-label">🧑‍💼 مدير / رئيس القسم
                <span style="font-size:.72rem;color:var(--text-muted)">(اختياري)</span>
            </label>
            <select id="dv-manager" class="form-select">
                <option value="">— بدون مدير —</option>
                ${empOpts}
            </select>
        </div>

        <div class="form-group">
            <label class="form-label">الوصف
                <span style="font-size:.72rem;color:var(--text-muted)">(اختياري)</span>
            </label>
            <input type="text" id="dv-desc" class="form-input"
                   value="${d.description || ''}" placeholder="وصف مختصر لمهام القسم...">
        </div>

        <div class="form-actions">
            <button class="btn btn-ghost" onclick="closeModal()">إلغاء</button>
            <button class="btn btn-primary" onclick="saveDivision(${d.id || 'null'})">
                ${d.id ? '💾 حفظ التعديلات' : '➕ إضافة القسم'}
            </button>
        </div>
    </div>`;
}

async function openAddDivisionModal() {
    // تأكد من تحميل البيانات
    if (!DivState.sectors.length) await loadDivisionsSection();
    DOM.modalTitle.textContent = '🏢 إضافة قسم تنظيمي';
    DOM.modalBody.innerHTML = _divisionModalHTML();
    openModal();
}

async function openEditDivisionModal(d) {
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch (_) { return; } }
    if (!DivState.sectors.length) await loadDivisionsSection();
    DOM.modalTitle.textContent = `✏️ تعديل: ${d.name}`;
    DOM.modalBody.innerHTML = _divisionModalHTML(d);
    openModal();
}

async function saveDivision(id) {
    const isNew = !id;
    const sectorId = document.getElementById('dv-sector')?.value;
    const name = document.getElementById('dv-name')?.value?.trim();
    const code = document.getElementById('dv-code')?.value?.trim().toUpperCase();
    const deptType = document.getElementById('dv-type')?.value || 'division';
    const managerId = document.getElementById('dv-manager')?.value || null;
    const desc = document.getElementById('dv-desc')?.value?.trim() || '';

    if (!sectorId) { showToast('يجب اختيار القطاع', 'error'); return; }
    if (!name) { showToast('اسم القسم مطلوب', 'error'); return; }

    const payload = {
        name, code, dept_type: deptType,
        sector_id: sectorId,
        parent_id: sectorId,
        manager_id: managerId,
        description: desc,
    };
    if (id) payload.id = id;

    const action = isNew ? 'add_division' : 'update_division';
    try {
        const res = await fetch(`api/settings.php?action=${action}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (data.success) {
            showToast(isNew ? '✅ تم إضافة القسم' : '✅ تم تحديث القسم', 'success');
            closeModal();
            // إعادة تعيين البيانات المؤقتة لإعادة التحميل
            DivState.sectors = [];
            await loadDivisionsSection();
            // تحديث قائمة الأقسام في نموذج الموظف إن كان مفتوحاً
            if (typeof loadSettingsEmployees === 'function') await loadSettingsEmployees();
        } else {
            showToast(data.message || 'فشل الحفظ', 'error');
        }
    } catch (e) {
        showToast('خطأ في الاتصال', 'error');
    }
}

async function deleteDivision(id, name, empCount) {
    if (empCount > 0) {
        showToast(`⚠️ لا يمكن الحذف — ${empCount} موظف مرتبط بهذا القسم`, 'error');
        return;
    }
    if (!confirm(`حذف قسم "${name}"؟`)) return;
    try {
        const res = await fetch('api/settings.php?action=delete_division', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id }),
        });
        const data = await res.json();
        if (data.success) {
            showToast('✅ تم الحذف', 'success');
            DivState.sectors = [];
            await loadDivisionsSection();
        } else {
            showToast(data.message || 'فشل الحذف', 'error');
        }
    } catch (e) {
        showToast('خطأ في الاتصال', 'error');
    }
}


// ════════════════════════════════════════════════════════════
// لوحة النظام — معلومات + إحصائيات + رسوم بيانية
// ════════════════════════════════════════════════════════════
async function renderSystemDashboard() {
    var el = document.getElementById('settingsContent');
    el.innerHTML = `
    <div class="settings-section-header"><h2>📊 لوحة النظام</h2></div>
    <div class="sysdash-wrap">

        <!-- معلومات النظام + صحة سريعة -->
        <div class="sysdash-top">
            <div class="sysdash-info-card">
                <div class="sysdash-info-title">ℹ️ معلومات النظام</div>
                <div class="sysdash-info-rows" id="sd-info-rows">
                    <div class="sd-skeleton"></div><div class="sd-skeleton"></div><div class="sd-skeleton"></div>
                </div>
            </div>
            <div class="sysdash-health-card" id="sd-health-card">
                <div class="sysdash-info-title">🩺 صحة النظام</div>
                <div class="sd-health-items" id="sd-health-items">
                    <div class="sd-skeleton"></div>
                </div>
            </div>
        </div>

        <!-- بطاقات الأرقام السريعة -->
        <div class="sysdash-kpi-row" id="sd-kpi-row">
            <div class="sd-kpi-card sd-kpi-loading"><div class="sd-skeleton"></div></div>
            <div class="sd-kpi-card sd-kpi-loading"><div class="sd-skeleton"></div></div>
            <div class="sd-kpi-card sd-kpi-loading"><div class="sd-skeleton"></div></div>
            <div class="sd-kpi-card sd-kpi-loading"><div class="sd-skeleton"></div></div>
        </div>

        <!-- الرسوم البيانية -->
        <div class="sysdash-charts">
            <div class="sysdash-chart-card">
                <div class="sysdash-chart-title">🧠 استهلاك الذاكرة</div>
                <div class="sysdash-chart-body"><canvas id="sd-mem-chart" height="180"></canvas></div>
            </div>
            <div class="sysdash-chart-card">
                <div class="sysdash-chart-title">🗄 أكبر الجداول (م.ب)</div>
                <div class="sysdash-chart-body"><canvas id="sd-tables-chart" height="180"></canvas></div>
            </div>
            <div class="sysdash-chart-card">
                <div class="sysdash-chart-title">⚙️ OPcache</div>
                <div class="sysdash-chart-body"><canvas id="sd-opcache-chart" height="180"></canvas></div>
            </div>
        </div>

        <!-- جدول الجداول الكاملة -->
        <div class="sysdash-table-card">
            <div class="sysdash-chart-title">📋 إحصائيات قاعدة البيانات — جميع الجداول</div>
            <div id="sd-tables-list"><div class="syshealth-loading"><span class="syshealth-spin">⚙️</span> جارٍ التحميل…</div></div>
        </div>

        <!-- زر التحديث + تفريغ الكاش -->
        <div class="sysdash-actions">
            <button class="sh-refresh-btn" onclick="renderSystemDashboard()">↻ تحديث الكل</button>
            <button class="sh-clear-btn" onclick="clearSystemCache()">🗑 تفريغ الذاكرة المؤقتة</button>
        </div>
    </div>`;

    // جلب البيانات
    let d = null, stats = null;
    try {
        const [r1, r2] = await Promise.all([
            fetch('api/settings.php?action=system_health'),
            fetch('api/settings.php?action=full_stats'),
        ]);
        const j1 = await r1.json(); if (j1.success) d = j1.data;
        const j2 = await r2.json(); if (j2.success) stats = j2.data;
    } catch (e) { }

    if (!d) {
        document.getElementById('sd-info-rows').innerHTML = '<div class="sh-error">⚠ تعذّر تحميل بيانات النظام</div>';
        return;
    }

    const h = d.health || {};

    // ── معلومات النظام ───────────────────────────────────────
    document.getElementById('sd-info-rows').innerHTML = [
        ['اسم النظام', 'نظام إدارة معاملات القطاع المالي'],
        ['الإصدار', '1.0.0'],
        ['PHP', d.php_version],
        ['MySQL', d.mysql_version],
        ['السيرفر', d.server_software?.split('/').slice(0, 2).join('/') || 'Unknown'],
        ['زمن الاستجابة', d.request_time + ' ms'],
    ].map(([k, v]) => `<div class="sysdash-info-row"><span>${k}</span><span class="sd-mono">${v}</span></div>`).join('');

    // ── صحة النظام ───────────────────────────────────────────
    const healthItems = [
        { label: 'قاعدة البيانات', status: h.db_connection },
        { label: 'مجلد الرفع', status: h.uploads_writable },
        { label: 'الذاكرة', status: h.memory_status, extra: h.memory_pct + '%' },
        { label: 'إصدار PHP', status: h.php_ok },
        { label: 'استعلامات بطيئة', status: h.slow_queries },
    ];
    document.getElementById('sd-health-items').innerHTML = healthItems.map(i => {
        const cls = i.status === 'ok' ? 'sdi-ok' : i.status === 'warning' ? 'sdi-warn' : 'sdi-err';
        const icon = i.status === 'ok' ? '✓' : '⚠';
        return `<div class="sdi ${cls}"><span class="sdi-icon">${icon}</span><span class="sdi-label">${i.label}</span>${i.extra ? `<span class="sdi-extra">${i.extra}</span>` : ''}</div>`;
    }).join('');

    // ── KPI Cards ────────────────────────────────────────────
    const memPct = d.memory_limit_bytes > 0 ? Math.round((d.memory_usage / d.memory_limit_bytes) * 100) : 0;
    const kpis = [
        { icon: '📁', label: 'ملفات مرفوعة', val: Number(d.uploads_count).toLocaleString('ar'), sub: _fmt(d.uploads_size), color: '#c9a84c' },
        { icon: '🗄', label: 'حجم قاعدة البيانات', val: _fmt(d.db_total_size), sub: d.db_table_count + ' جدول', color: '#6366f1' },
        { icon: '🧠', label: 'استهلاك الذاكرة', val: memPct + '%', sub: _fmt(d.memory_usage) + ' من ' + d.memory_limit, color: memPct > 80 ? '#ef4444' : '#22c55e' },
        { icon: '⚡', label: 'استعلامات DB', val: Number(d.db_queries_total).toLocaleString('ar'), sub: d.db_connections + ' اتصال نشط', color: '#14b8a6' },
    ];
    document.getElementById('sd-kpi-row').innerHTML = kpis.map(k => `
        <div class="sd-kpi-card">
            <div class="sd-kpi-icon" style="color:${k.color}">${k.icon}</div>
            <div class="sd-kpi-val" style="color:${k.color}">${k.val}</div>
            <div class="sd-kpi-label">${k.label}</div>
            <div class="sd-kpi-sub">${k.sub}</div>
        </div>`).join('');

    // ── الرسوم البيانية (Chart.js) ───────────────────────────
    await _sdLoadChartJS();

    // رسم الذاكرة — Doughnut
    _sdChart('sd-mem-chart', 'doughnut',
        ['مستخدم', 'حر'],
        [d.memory_usage, Math.max(0, d.memory_limit_bytes - d.memory_usage)],
        ['rgba(239,68,68,.8)', 'rgba(34,197,94,.8)']
    );

    // رسم الجداول — Bar
    const topT = (d.db_tables || []).slice(0, 8);
    _sdChart('sd-tables-chart', 'bar',
        topT.map(t => t.table_name),
        topT.map(t => +(t.data_length / 1024 / 1024).toFixed(3)),
        topT.map((_, i) => `hsl(${220 + i * 18},70%,55%)`)
    );

    // رسم OPcache — Doughnut
    const oc = d.opcache;
    if (oc) {
        _sdChart('sd-opcache-chart', 'doughnut',
            ['مستخدم', 'حر'],
            [oc.used_memory, oc.free_memory],
            ['rgba(99,102,241,.8)', 'rgba(30,41,59,.5)']
        );
    } else {
        const cv = document.getElementById('sd-opcache-chart');
        if (cv) cv.parentElement.innerHTML = '<div class="sh-muted" style="text-align:center;padding:40px">OPcache غير مفعّل</div>';
    }

    // ── جدول الجداول ────────────────────────────────────────
    const allTables = d.db_tables || [];
    document.getElementById('sd-tables-list').innerHTML = allTables.length ? `
        <table class="sh-table">
            <thead><tr><th>#</th><th>الجدول</th><th>السجلات</th><th>البيانات</th><th>الفهرس</th><th>الإجمالي</th></tr></thead>
            <tbody>${allTables.map((t, i) => `
                <tr>
                    <td style="color:var(--text-muted);font-size:.72rem">${i + 1}</td>
                    <td class="sh-td-mono">${t.table_name}</td>
                    <td>${Number(t.table_rows).toLocaleString('ar')}</td>
                    <td>${_fmt(t.data_length)}</td>
                    <td>${_fmt(t.index_length)}</td>
                    <td style="font-weight:700">${_fmt(t.total_size)}</td>
                </tr>`).join('')}
            </tbody>
        </table>` : '<div class="sh-muted">لا توجد بيانات</div>';
}

let _sdChartJSLoaded = false;
function _sdLoadChartJS() {
    if (_sdChartJSLoaded || window.Chart) { _sdChartJSLoaded = true; return Promise.resolve(); }
    return new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';
        s.onload = () => { _sdChartJSLoaded = true; res(); };
        s.onerror = rej;
        document.head.appendChild(s);
    });
}

function _sdChart(id, type, labels, data, colors) {
    const canvas = document.getElementById(id);
    if (!canvas || !window.Chart) return;
    const isDark = document.body.classList.contains('dark-mode') || document.documentElement.getAttribute('data-theme') === 'dark';
    const gridColor = isDark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.06)';
    const textColor = isDark ? '#94a3b8' : '#64748b';
    if (canvas._chartInst) canvas._chartInst.destroy();
    canvas._chartInst = new Chart(canvas, {
        type,
        data: {
            labels,
            datasets: [{ data, backgroundColor: colors, borderWidth: type === 'doughnut' ? 2 : 0, borderRadius: type === 'bar' ? 6 : 0, borderColor: isDark ? '#1e293b' : '#fff' }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: type === 'doughnut', position: 'right', labels: { color: textColor, font: { size: 11 }, boxWidth: 12 } },
                tooltip: { callbacks: { label: ctx => ' ' + ctx.label + ': ' + (type === 'bar' ? ctx.parsed.y + ' م.ب' : _fmt(ctx.parsed)) } }
            },
            scales: type === 'bar' ? {
                x: { ticks: { color: textColor, font: { size: 10 } }, grid: { color: gridColor } },
                y: { ticks: { color: textColor, font: { size: 10 } }, grid: { color: gridColor } }
            } : {},
        }
    });
}

/* ═══════════════════════════════════════════════════════════════
   📊 إحصائيات النظام التقنية
═══════════════════════════════════════════════════════════════ */
function _fmt(bytes) {
    if (!bytes || bytes < 0) return '0 ب';
    if (bytes < 1024) return bytes + ' ب';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' ك.ب';
    if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' م.ب';
    return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' ج.ب';
}
function _healthBadge(status) {
    if (status === 'ok') return '<span class="sh-badge sh-ok">✓ جيد</span>';
    if (status === 'warning') return '<span class="sh-badge sh-warn">⚠ تنبيه</span>';
    return '<span class="sh-badge sh-err">✗ خطأ</span>';
}
function _pct(used, total) {
    if (!total) return 0;
    return Math.min(100, Math.round((used / total) * 100));
}
function _bar(pct, color) {
    const c = pct > 80 ? '#ef4444' : pct > 60 ? '#f59e0b' : color || '#22c55e';
    return `<div class="sh-bar-wrap"><div class="sh-bar-fill" style="width:${pct}%;background:${c}"></div></div>`;
}

async function loadSystemHealth() {
    const card = document.getElementById('syshealth-card');
    if (!card) return;
    let d = null;
    try {
        const res = await fetch('api/settings.php?action=system_health');
        const json = await res.json();
        if (json.success) d = json.data;
    } catch (e) {
        card.innerHTML = '<div class="sh-error">⚠ تعذّر تحميل إحصائيات النظام</div>';
        return;
    }
    if (!d) { card.innerHTML = '<div class="sh-error">لا توجد بيانات</div>'; return; }

    const h = d.health || {};
    const oc = d.opcache || null;
    const memPct = _pct(d.memory_usage, d.memory_limit_bytes);
    const uploadsMB = _fmt(d.uploads_size);

    // حساب أكبر 5 جداول
    const topTables = (d.db_tables || []).slice(0, 5);

    card.innerHTML = `
    <div class="syshealth-wrap">

        <!-- هيدر -->
        <div class="sh-hdr">
            <div class="sh-hdr-title">
                <span class="sh-hdr-icon">📊</span>
                <div>
                    <h3>إحصائيات النظام</h3>
                    <span class="sh-hdr-sub">PHP ${d.php_version} · MySQL ${d.mysql_version}</span>
                </div>
            </div>
            <div class="sh-hdr-actions">
                <button class="sh-refresh-btn" onclick="loadSystemHealth()" title="تحديث">↻ تحديث</button>
                <button class="sh-clear-btn" onclick="clearSystemCache()">🗑 تفريغ الكاش</button>
            </div>
        </div>

        <!-- صحة النظام — شريط سريع -->
        <div class="sh-health-bar">
            <div class="sh-health-item">
                <span class="sh-hi-label">قاعدة البيانات</span>
                ${_healthBadge(h.db_connection)}
            </div>
            <div class="sh-health-item">
                <span class="sh-hi-label">مجلد الرفع</span>
                ${_healthBadge(h.uploads_writable)}
            </div>
            <div class="sh-health-item">
                <span class="sh-hi-label">الذاكرة</span>
                ${_healthBadge(h.memory_status)}
            </div>
            <div class="sh-health-item">
                <span class="sh-hi-label">إصدار PHP</span>
                ${_healthBadge(h.php_ok)}
            </div>
            <div class="sh-health-item">
                <span class="sh-hi-label">استعلامات بطيئة</span>
                ${_healthBadge(h.slow_queries)}
            </div>
        </div>

        <!-- الشبكة -->
        <div class="sh-grid">

            <!-- أداء النظام -->
            <div class="sh-section">
                <div class="sh-sec-title">⚡ أداء النظام</div>
                <div class="sh-rows">
                    <div class="sh-row"><span>زمن الاستجابة</span><span class="sh-val">${d.request_time} ms</span></div>
                    <div class="sh-row"><span>اتصالات DB نشطة</span><span class="sh-val">${d.db_connections}</span></div>
                    <div class="sh-row"><span>إجمالي الاستعلامات</span><span class="sh-val">${Number(d.db_queries_total).toLocaleString('ar')}</span></div>
                    <div class="sh-row"><span>استعلامات بطيئة</span><span class="sh-val ${parseInt(d.db_slow_queries) > 10 ? 'sh-warn-txt' : ''}">${d.db_slow_queries}</span></div>
                    ${d.load_avg ? `<div class="sh-row"><span>حمل المعالج (avg)</span><span class="sh-val">${d.load_avg[0]?.toFixed(2)} / ${d.load_avg[1]?.toFixed(2)} / ${d.load_avg[2]?.toFixed(2)}</span></div>` : ''}
                </div>
            </div>

            <!-- استهلاك الذاكرة -->
            <div class="sh-section">
                <div class="sh-sec-title">🧠 استهلاك الذاكرة</div>
                <div class="sh-rows">
                    <div class="sh-row"><span>الاستخدام الحالي</span><span class="sh-val">${_fmt(d.memory_usage)}</span></div>
                    <div class="sh-row"><span>ذروة الاستخدام</span><span class="sh-val">${_fmt(d.memory_peak)}</span></div>
                    <div class="sh-row"><span>الحد الأقصى</span><span class="sh-val">${d.memory_limit}</span></div>
                </div>
                <div class="sh-metric-label">${memPct}% مستخدم</div>
                ${_bar(memPct)}
            </div>

            <!-- حجم النظام -->
            <div class="sh-section">
                <div class="sh-sec-title">💾 حجم النظام</div>
                <div class="sh-rows">
                    <div class="sh-row"><span>ملفات مرفوعة</span><span class="sh-val">${uploadsMB}</span></div>
                    <div class="sh-row"><span>عدد الملفات</span><span class="sh-val">${Number(d.uploads_count).toLocaleString('ar')}</span></div>
                    <div class="sh-row"><span>حجم قاعدة البيانات</span><span class="sh-val">${_fmt(d.db_total_size)}</span></div>
                    <div class="sh-row"><span>عدد الجداول</span><span class="sh-val">${d.db_table_count}</span></div>
                    <div class="sh-row"><span>حجم الجلسات</span><span class="sh-val">${_fmt(d.session_size)}</span></div>
                </div>
            </div>

            <!-- قاعدة البيانات - أكبر الجداول -->
            <div class="sh-section sh-section--wide">
                <div class="sh-sec-title">🗄 إحصائيات قاعدة البيانات — أكبر الجداول</div>
                <table class="sh-table">
                    <thead><tr><th>الجدول</th><th>السجلات</th><th>الحجم</th><th>الفهرس</th></tr></thead>
                    <tbody>
                    ${topTables.map(t => `
                        <tr>
                            <td class="sh-td-mono">${t.table_name}</td>
                            <td>${Number(t.table_rows).toLocaleString('ar')}</td>
                            <td>${_fmt(t.data_length)}</td>
                            <td>${_fmt(t.index_length)}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>

            <!-- OPcache / الذاكرة المؤقتة -->
            <div class="sh-section">
                <div class="sh-sec-title">⚙️ الذاكرة المؤقتة (OPcache)</div>
                ${oc ? `
                <div class="sh-rows">
                    <div class="sh-row"><span>الحالة</span><span class="sh-val">${oc.enabled ? _healthBadge('ok') : _healthBadge('warning')}</span></div>
                    <div class="sh-row"><span>ملفات مخزّنة</span><span class="sh-val">${oc.cached_files}</span></div>
                    <div class="sh-row"><span>ذاكرة مستخدمة</span><span class="sh-val">${_fmt(oc.used_memory)}</span></div>
                    <div class="sh-row"><span>ذاكرة حرة</span><span class="sh-val">${_fmt(oc.free_memory)}</span></div>
                    <div class="sh-row"><span>نسبة الإصابة</span><span class="sh-val sh-ok-txt">${oc.hit_rate}%</span></div>
                </div>
                <div class="sh-metric-label">${oc.hit_rate}% hit rate</div>
                ${_bar(oc.hit_rate, '#6366f1')}
                ` : '<div class="sh-muted">OPcache غير مفعّل أو غير متاح</div>'}
                <button class="sh-clear-btn sh-clear-sm" onclick="clearSystemCache()" style="margin-top:12px">🗑 تفريغ الذاكرة المؤقتة</button>
            </div>

        </div>
    </div>`;
}

async function clearSystemCache() {
    const btn = event.target;
    const orig = btn.textContent;
    btn.disabled = true; btn.textContent = '⏳ جارٍ التفريغ…';
    try {
        const res = await fetch('api/settings.php?action=clear_cache', { method: 'POST' });
        const d = await res.json();
        if (d.success) {
            btn.textContent = '✓ تم التفريغ';
            btn.style.background = 'rgba(34,197,94,.15)';
            setTimeout(() => loadSystemHealth(), 800);
        } else {
            btn.textContent = '✗ فشل';
        }
    } catch (e) {
        btn.textContent = '✗ خطأ';
    } finally {
        btn.disabled = false;
        setTimeout(() => { btn.textContent = orig; btn.style.background = ''; }, 2500);
    }
}

async function loadSignersSection() {
    const el = document.getElementById('signers-list');
    if (!el) return;
    try {
        const res = await fetch('api/?action=get_system_settings');
        const data = await res.json();
        if (!data.success) throw new Error(data.message);
        const signers = (data.data || []).filter(s => s.setting_group === 'payment_order');
        el.innerHTML = signers.map(s => `
            <div class="prefix-row" id="prefix-row-${s.setting_key}">
                <div class="prefix-label">${s.setting_label}</div>
                <div class="prefix-input-wrap">
                    <input type="text" class="prefix-input" id="prefix-input-${s.setting_key}"
                        value="${s.setting_value}" maxlength="100" placeholder="اسم الموظف"
                        onkeydown="if(event.key==='Enter') saveSigner('${s.setting_key}')">
                    <button class="prefix-save-btn" onclick="saveSigner('${s.setting_key}')">حفظ</button>
                    <span class="prefix-status" id="prefix-status-${s.setting_key}"></span>
                </div>
            </div>
        `).join('') || '<div style="color:var(--text-muted);padding:.5rem">لا توجد إعدادات</div>';
    } catch (e) {
        if (el) el.innerHTML = `<div style="color:#ff6b6b;padding:.5rem">خطأ: ${e.message}</div>`;
    }
}

async function saveSigner(key) {
    const input = document.getElementById('prefix-input-' + key);
    const status = document.getElementById('prefix-status-' + key);
    const btn = document.querySelector(`#prefix-row-${key} .prefix-save-btn`);
    if (!input) return;
    const val = input.value.trim();
    if (btn) { btn.disabled = true; btn.textContent = '...'; }
    try {
        const res = await fetch('api/?action=save_system_setting', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key, value: val }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message);
        if (status) { status.textContent = '✓ تم الحفظ'; status.style.color = '#69db7c'; }
        setTimeout(() => { if (status) status.textContent = ''; }, 2500);
    } catch (e) {
        if (status) { status.textContent = '✗ ' + e.message; status.style.color = '#ff6b6b'; }
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'حفظ'; }
    }
}

async function loadPrefixesSection() {
    const el = document.getElementById('prefixes-list');
    if (!el) return;
    try {
        const res = await fetch('api/?action=get_system_settings');
        const data = await res.json();
        if (!data.success) throw new Error(data.message);
        const prefixes = (data.data || []).filter(s => s.setting_group === 'prefixes');
        el.innerHTML = prefixes.map(s => `
            <div class="prefix-row" id="prefix-row-${s.setting_key}">
                <div class="prefix-label">${s.setting_label}</div>
                <div class="prefix-input-wrap">
                    <input type="text" class="prefix-input" id="prefix-input-${s.setting_key}"
                        value="${s.setting_value}" maxlength="10" placeholder="مثال: TR"
                        onkeydown="if(event.key==='Enter') savePrefix('${s.setting_key}')">
                    <button class="prefix-save-btn" onclick="savePrefix('${s.setting_key}')">حفظ</button>
                    <span class="prefix-status" id="prefix-status-${s.setting_key}"></span>
                </div>
            </div>
        `).join('');
    } catch (e) {
        if (el) el.innerHTML = `<div style="color:#ff6b6b;padding:.5rem">خطأ: ${e.message}</div>`;
    }
}

async function savePrefix(key) {
    const input = document.getElementById('prefix-input-' + key);
    const status = document.getElementById('prefix-status-' + key);
    const btn = document.querySelector(`#prefix-row-${key} .prefix-save-btn`);
    if (!input) return;

    const val = input.value.trim().toUpperCase();
    input.value = val;

    if (!val || !/^[A-Z0-9]{1,10}$/.test(val)) {
        if (status) { status.textContent = '⚠️ أحرف إنجليزية كبيرة أو أرقام فقط'; status.style.color = '#ffa94d'; }
        return;
    }
    if (btn) { btn.disabled = true; btn.textContent = '...'; }
    try {
        const res = await fetch('api/?action=save_system_setting', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key, value: val }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message);
        if (status) { status.textContent = '✓ تم الحفظ'; status.style.color = '#69db7c'; }
        setTimeout(() => { if (status) status.textContent = ''; }, 2500);
    } catch (e) {
        if (status) { status.textContent = '✗ ' + e.message; status.style.color = '#ff6b6b'; }
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'حفظ'; }
    }
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


// ════════════════════════════════════════════════════════════
// الاستيراد الدفعي للأقسام
// ════════════════════════════════════════════════════════════

async function openBulkImportModal() {
    if (!DivState.sectors.length) await loadDivisionsSection();
    const secOpts = DivState.sectors.map(s =>
        `<option value="${s.id}">${s.name} (${s.code || '—'})</option>`
    ).join('');

    DOM.modalTitle.textContent = '📥 إدراج أقسام دفعي';
    DOM.modalBody.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:1rem">
        <p style="margin:0;font-size:.84rem;color:var(--text-muted);background:var(--bg-secondary);
                  padding:.65rem .85rem;border-radius:6px;line-height:1.7">
            اختر القطاع ثم أدخل الأقسام — <strong>سطر لكل قسم</strong>.<br>
            الصيغة: <code>اسم القسم</code> أو <code>اسم القسم | الرمز</code>
            مثال: <code style="color:var(--primary,#3b82f6)">الحسابات | ACC</code>
        </p>
        <div class="modal-form-grid">
            <div class="form-group">
                <label class="form-label">القطاع *</label>
                <select id="bi-sector" class="form-select" onchange="onBiSectorChange(this)">
                    <option value="">— اختر —</option>
                    ${secOpts}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">النوع</label>
                <select id="bi-type" class="form-select">
                    <option value="division">قسم</option>
                    <option value="team">فريق</option>
                </select>
            </div>
        </div>
        <div class="form-group">
            <label class="form-label">
                الأقسام *
                <span id="bi-count" style="color:var(--text-muted);font-weight:400;font-size:.78rem"></span>
            </label>
            <textarea id="bi-lines" class="form-control" rows="7" dir="rtl"
                style="font-family:monospace;font-size:.84rem;resize:vertical"
                placeholder="الحسابات&#10;الخزينة&#10;الموازنة | BDG&#10;السكرتارية | SEC&#10;المبيعات | SAL"
                oninput="onBiLinesInput(this)"></textarea>
        </div>
        <div id="bi-preview" style="display:none">
            <div style="font-size:.75rem;font-weight:700;color:var(--text-muted);
                        text-transform:uppercase;margin-bottom:.35rem;letter-spacing:.04em">
                معاينة
            </div>
            <div id="bi-preview-list"
                 style="display:flex;flex-direction:column;gap:.3rem;max-height:160px;overflow-y:auto"></div>
        </div>
        <div class="form-actions">
            <button class="btn btn-ghost" onclick="closeModal()">إلغاء</button>
            <button class="btn btn-primary" id="bi-submit-btn" onclick="submitBulkImport()" disabled>
                📥 إدراج الأقسام
            </button>
        </div>
    </div>`;
    openModal('large');
}

function onBiLinesInput(ta) {
    const lines = ta.value.split('\n').map(l => l.trim()).filter(l => l);
    const countEl = document.getElementById('bi-count');
    const prevEl = document.getElementById('bi-preview');
    const listEl = document.getElementById('bi-preview-list');
    const btnEl = document.getElementById('bi-submit-btn');
    const secId = document.getElementById('bi-sector')?.value;
    if (countEl) countEl.textContent = lines.length ? `(${lines.length} قسم)` : '';
    if (!lines.length) {
        if (prevEl) prevEl.style.display = 'none';
        if (btnEl) btnEl.disabled = true;
        return;
    }
    if (prevEl) prevEl.style.display = '';
    if (btnEl) btnEl.disabled = !secId;
    if (listEl) {
        listEl.innerHTML = lines.map((line, i) => {
            const [name, code] = line.split('|').map(p => p.trim());
            return `<div style="display:flex;align-items:center;gap:.5rem;padding:.3rem .6rem;
                         border-radius:5px;background:var(--bg-secondary);font-size:.82rem">
                <span style="color:var(--text-muted);min-width:18px;text-align:center">${i + 1}</span>
                <span style="flex:1;font-weight:600">${name || ''}</span>
                ${code ? `<code style="font-size:.7rem;background:var(--bg-card);padding:.1rem .35rem;border-radius:3px;color:var(--text-muted)">${code}</code>` : ''}
                <span style="color:#22c55e">✓</span>
            </div>`;
        }).join('');
    }
}

function onBiSectorChange(sel) {
    const btn = document.getElementById('bi-submit-btn');
    const lines = (document.getElementById('bi-lines')?.value || '').split('\n').map(l => l.trim()).filter(l => l);
    if (btn) btn.disabled = !sel.value || !lines.length;
}

async function submitBulkImport() {
    const sectorId = document.getElementById('bi-sector')?.value;
    const deptType = document.getElementById('bi-type')?.value || 'division';
    const rawLines = document.getElementById('bi-lines')?.value || '';
    const lines = rawLines.split('\n').map(l => l.trim()).filter(l => l);
    if (!sectorId) { showToast('يجب اختيار القطاع', 'error'); return; }
    if (!lines.length) { showToast('أدخل أسماء الأقسام', 'error'); return; }

    const btn = document.getElementById('bi-submit-btn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ جارٍ الإدراج...'; }

    let ok = 0, fail = 0, errs = [];
    for (const line of lines) {
        const [name, code = ''] = line.split('|').map(p => p.trim());
        if (!name) continue;
        try {
            const res = await fetch('api/settings.php?action=add_division', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, code, dept_type: deptType, sector_id: sectorId, parent_id: sectorId }),
            });
            const data = await res.json();
            if (data.success) ok++;
            else { fail++; errs.push(`"${name}": ${data.message}`); }
        } catch (e) { fail++; errs.push(`"${name}": خطأ`); }
    }

    if (!fail) {
        showToast(`✅ تم إدراج ${ok} قسم بنجاح`, 'success');
        closeModal();
    } else {
        showToast(`✅ ${ok} ناجح  ❌ ${fail} فشل`, fail > ok ? 'error' : 'warning');
        if (errs.length) console.warn('أخطاء:', errs);
    }
    DivState.sectors = [];
    await loadDivisionsSection();
    if (typeof loadSettingsEmployees === 'function') loadSettingsEmployees();
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
// ══════════════════════════════════════════════════════════════
// إعدادات طلبات الشراء — حد المبلغ + SLA
// ══════════════════════════════════════════════════════════════

var _prSlaData = [];

async function loadPrSettings() {
    try {
        // جلب حد المبلغ
        var r1 = await fetch('api/settings.php?action=get_setting&key=pr_amount_threshold');
        var d1 = await r1.json();
        var inp = document.getElementById('pr-threshold-input');
        if (inp) inp.value = d1.value || '5000';

        // جلب سياسات SLA
        var r2 = await fetch('api/settings.php?action=get_pr_sla_policies');
        var d2 = await r2.json();
        _prSlaData = d2.success ? d2.data : [];
        renderPrSlaTable(_prSlaData);
    } catch (e) {
        var el = document.getElementById('pr-sla-table');
        if (el) el.innerHTML = '<div style="color:var(--accent-red);font-size:.82rem">خطأ في التحميل</div>';
    }
}

function renderPrSlaTable(policies) {
    var el = document.getElementById('pr-sla-table');
    if (!el) return;

    var stageLabels = {
        reception: 'الاستلام والتحقق',
        budget_review: 'مراجعة الموازنة',
        treasury_review: 'مراجعة مدير الخزينة',
        finance_review: 'مراجعة رئيس القطاع المالي',
        ceo_approval: 'موافقة CEO — مبدئية',
        purchasing: 'المشتريات — إنشاء حجز',
        waiting_budget_approval: 'اعتماد حجز الموازنة',
        accounts_review: 'الحسابات — مراجعة وتوزيع',
        po_issuance: 'إصدار أمر الشراء (PO)',
        payment: 'المالية — الدفع',
        referral: 'الإحالة',
    };

    var stagePaths = {
        reception: 'كلا المسارين',
        budget_review: 'قصير',
        treasury_review: 'طويل',
        finance_review: 'طويل',
        ceo_approval: 'طويل',
        purchasing: 'كلا المسارين',
        waiting_budget_approval: 'كلا المسارين',
        accounts_review: 'كلا المسارين',
        po_issuance: 'كلا المسارين (مسار PO)',
        payment: 'كلا المسارين',
        referral: 'عند الإحالة',
    };

    // دمج مع البيانات المحفوظة
    var rows = Object.keys(stageLabels).map(function (stage) {
        var saved = (policies || []).find(function (p) { return p.stage_name === stage; });
        return {
            stage: stage,
            label: stageLabels[stage],
            path: stagePaths[stage] || '—',
            hours: saved ? saved.allowed_hours : (stage === 'po_issuance' ? 72 : stage === 'ceo_approval' ? 72 : 24),
            warn: saved ? saved.warning_pct : 70,
            esc: saved ? saved.escalate_pct : 100,
            id: saved ? saved.id : null,
        };
    });

    var html = '<table class="pr-sla-tbl">'
        + '<thead><tr>'
        + '<th>المرحلة</th>'
        + '<th>المسار</th>'
        + '<th style="width:110px">المدة المسموحة</th>'
        + '<th style="width:90px">تحذير %</th>'
        + '<th style="width:90px">تصعيد %</th>'
        + '</tr></thead><tbody>';

    rows.forEach(function (r) {
        html += '<tr data-stage="' + r.stage + '" data-id="' + (r.id || '') + '">'
            + '<td><span class="pr-sla-stage-name">' + r.label + '</span></td>'
            + '<td><span class="pr-sla-path-badge">' + r.path + '</span></td>'
            + '<td><div style="display:flex;align-items:center;gap:4px">'
            + '<input type="number" class="pr-sla-inp" data-field="hours" value="' + r.hours + '" min="0" step="0.5" style="width:65px">'
            + '<span style="font-size:.75rem;color:var(--text-muted)">ساعة</span></div></td>'
            + '<td><input type="number" class="pr-sla-inp" data-field="warn" value="' + r.warn + '" min="0" max="100" style="width:60px">'
            + '<span style="font-size:.75rem;color:var(--text-muted)"> %</span></td>'
            + '<td><input type="number" class="pr-sla-inp" data-field="esc" value="' + r.esc + '" min="0" max="100" style="width:60px">'
            + '<span style="font-size:.75rem;color:var(--text-muted)"> %</span></td>'
            + '</tr>';
    });

    html += '</tbody></table>'
        + '<div style="margin-top:.6rem;font-size:.76rem;color:var(--text-muted)">'
        + '⏱ عند تجاوز نسبة التحذير يُرسل تنبيه للمسؤول — عند تجاوز نسبة التصعيد يُرسل تنبيه عاجل لرئيس القطاع'
        + '</div>';

    el.innerHTML = html;
    injectPrSettingsStyles();
}

async function savePrSettings() {
    // جمع حد المبلغ
    var threshold = document.getElementById('pr-threshold-input')?.value?.trim();
    if (!threshold || isNaN(threshold) || parseFloat(threshold) < 0) {
        showToast('أدخل حد مبلغ صحيح', 'error'); return;
    }

    // جمع بيانات SLA
    var slaRows = [];
    document.querySelectorAll('#pr-sla-table tr[data-stage]').forEach(function (row) {
        var stage = row.dataset.stage;
        var id = row.dataset.id || '';
        var inps = row.querySelectorAll('.pr-sla-inp');
        var hours = 0, warn = 70, esc = 100;
        inps.forEach(function (inp) {
            if (inp.dataset.field === 'hours') hours = parseFloat(inp.value) || 0;
            if (inp.dataset.field === 'warn') warn = parseInt(inp.value) || 70;
            if (inp.dataset.field === 'esc') esc = parseInt(inp.value) || 100;
        });
        slaRows.push({ stage: stage, id: id, hours: hours, warn: warn, esc: esc });
    });

    try {
        // حفظ حد المبلغ
        var r1 = await fetch('api/settings.php?action=save_setting', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: 'pr_amount_threshold', value: threshold })
        });
        var d1 = await r1.json();
        if (!d1.success) { showToast('خطأ في حفظ حد المبلغ', 'error'); return; }

        // حفظ SLA
        var r2 = await fetch('api/settings.php?action=save_pr_sla_policies', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ policies: slaRows })
        });
        var d2 = await r2.json();
        if (!d2.success) { showToast('خطأ في حفظ سياسات SLA', 'error'); return; }

        showToast('✅ تم حفظ الإعدادات', 'success');
    } catch (e) {
        showToast('خطأ في الاتصال', 'error');
    }
}

function injectPrSettingsStyles() {
    if (document.getElementById('pr-set-css')) return;
    var s = document.createElement('style'); s.id = 'pr-set-css';
    s.textContent = [
        '.pr-set-amount-row{display:flex;align-items:center;justify-content:space-between;padding:.75rem 1rem;background:var(--bg-surface);border-radius:10px;border:1px solid var(--border-color)}',
        '.pr-sla-tbl{width:100%;border-collapse:collapse;font-size:.82rem}',
        '.pr-sla-tbl th{text-align:right;padding:.5rem .75rem;background:var(--bg-surface);color:var(--text-muted);font-weight:600;font-size:.75rem;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid var(--border-color)}',
        '.pr-sla-tbl td{padding:.5rem .75rem;border-bottom:1px solid var(--border-color);vertical-align:middle}',
        '.pr-sla-tbl tr:last-child td{border-bottom:none}',
        '.pr-sla-tbl tr:hover td{background:var(--bg-surface)}',
        '.pr-sla-stage-name{font-weight:500;color:var(--text-primary)}',
        '.pr-sla-path-badge{font-size:.72rem;padding:2px 7px;border-radius:6px;background:var(--bg-surface);border:1px solid var(--border-color);color:var(--text-muted)}',
        '.pr-sla-inp{padding:4px 7px;border-radius:6px;border:1px solid var(--border-color);background:var(--bg-card);color:var(--text-primary);font-family:inherit;font-size:.82rem;text-align:center;outline:none}',
        '.pr-sla-inp:focus{border-color:var(--btn-primary-bg)}',
    ].join('');
    document.head.appendChild(s);
}