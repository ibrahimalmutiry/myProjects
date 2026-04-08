/**
 * app-archive.js — الأرشيف المالي
 * تصميم مطابق لـ financial-archive.html
 */
'use strict';

/* ── openArchiveSub: تُستدعى من السايدبار ─────────────── */
window.openArchiveSub = function (sub) {
    // تحديث الأزرار النشطة في السايدبار
    document.querySelectorAll('.nav-tab[data-tab^="archive-"]').forEach(b => b.classList.remove('active'));
    const activeBtn = document.querySelector(`.nav-tab[data-tab="archive-${sub}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    // إذا الصفحة غير محملة بعد → حمّلها أولاً
    const root = document.getElementById('archive-root');
    if (!root) {
        if (typeof switchTab === 'function') {
            window._archivePendingSub = sub;
            switchTab('archive', null, null, 'archive');
        }
        return;
    }
    // الصفحة محملة → بدّل القسم فقط
    if (window.ArchiveModule) ArchiveModule.switchSub(sub);
};

/* ══════════════════════════════════════════════════════════
   ArchiveModule — الوحدة الرئيسية
══════════════════════════════════════════════════════════ */
window.ArchiveModule = (function () {

    const API = 'api/archive_api.php';

    /* ── الحالة ─────────────────────────────────────────── */
    const S = {
        sub: window._archivePendingSub || 'all',
        activeSub: 'all',   // التبويب الفرعي النشط
        viewMode: 'grid',
        search: '',
        files: [],
        stats: {},
        expiryDocs: [],
        viewingFile: null,
        extFilter: '',       // فلتر نوع الملف
    };

    /* ── تعريف الأقسام ──────────────────────────────────── */
    /* ══ 4 أقسام رئيسية + سنوي + تنتهي ══════════════════ */
    const SUBS = {
        all: { label: tr('جميع المستندات'), crumb: tr('الكل'), icon: '📂' },
        operational: { label: tr('مستندات تشغيلية'), crumb: tr('تشغيلية'), icon: '📋' },
        financial: { label: tr('مستندات مالية'), crumb: tr('مالية'), icon: '💰' },
        reports: { label: tr('تقارير وموازنة'), crumb: tr('تقارير'), icon: '📊' },
        official: { label: tr('وثائق رسمية'), crumb: tr('رسمية'), icon: '🏛️' },
        renewals: { label: tr('التجديد والصلاحيات'), crumb: tr('الصلاحيات'), icon: '🔄' },
    };

    /* التصنيفات الفرعية لكل قسم */
    const SUB_TABS = {
        operational: [
            { key: 'all_op', label: tr('الكل') },
            { key: 'contract', label: tr('العقود والاتفاقيات') },
            { key: 'mandate', label: tr('التعميدات والتفويضات') },
            { key: 'letter', label: tr('الخطابات والمراسلات') },
        ],
        financial: [
            { key: 'all_fin', label: tr('الكل') },
            { key: 'invoice_sales', label: tr('فواتير مبيعات') },
            { key: 'invoice_supplier', label: tr('فواتير موردين') },
            { key: 'journal', label: tr('قيود يومية') },
            { key: 'bank', label: tr('مستندات بنكية') },
            { key: 'tax', label: tr('ضرائب وزكاة') },
        ],
        reports: [
            { key: 'all_rep', label: tr('الكل') },
            { key: 'report', label: tr('تقارير مالية') },
            { key: 'budget', label: tr('موازنة وتخطيط') },
        ],
        official: [
            { key: 'all_off', label: tr('الكل') },
            { key: 'gov', label: 'وثائق حكومية' },
            { key: 'commercial', label: 'سجلات تجارية' },
        ],
    };

    /* تصنيف DB → قسم رئيسي */
    const CAT_MAP = {
        'عقد_اتفاقية': 'operational',
        'تعميد_تفويض': 'operational',
        'خطاب_مراسلة': 'operational',
        'فاتورة_مبيعات': 'financial',
        'فاتورة_موردين': 'financial',
        'قيد_يومي': 'financial',
        'فاتورة_مدفوعات': 'financial',
        'معاملة_مالية': 'financial',
        'إيداع_بنكي': 'financial',
        'مستند_بنكي': 'financial',
        'ضريبة_زكاة': 'financial',
        'تقرير_مالي': 'reports',
        'موازنة_تخطيط': 'reports',
        'وثيقة_حكومية': 'official',
        'سجل_تجاري': 'official',
        'أخرى': 'all',
    };

    /* تصنيف DB → تبويب فرعي */
    const SUB_CAT_MAP = {
        'عقد_اتفاقية': 'contract',
        'تعميد_تفويض': 'mandate',
        'خطاب_مراسلة': 'letter',
        'فاتورة_مبيعات': 'invoice_sales',
        'فاتورة_موردين': 'invoice_supplier',
        'قيد_يومي': 'journal',
        'فاتورة_مدفوعات': 'invoice_supplier',
        'معاملة_مالية': 'invoice_sales',
        'إيداع_بنكي': 'bank',
        'مستند_بنكي': 'bank',
        'ضريبة_زكاة': 'tax',
        'تقرير_مالي': 'report',
        'موازنة_تخطيط': 'budget',
        'وثيقة_حكومية': 'gov',
        'سجل_تجاري': 'commercial',
    };

    const SRC_MAP = {
        transactions: 'financial',
        correspondence: 'operational',
        bank: 'financial',
        budget: 'reports',
        archive: 'all',
    };

    /* ══ init ══════════════════════════════════════════════ */
    function init() {
        const root = document.getElementById('archive-root');
        if (!root) return;

        // pending sub من السايدبار
        if (window._archivePendingSub) {
            S.sub = window._archivePendingSub;
            delete window._archivePendingSub;
        }

        root.innerHTML = buildPage();
        bindEvents();
        _syncSidebarActive();
        loadStats();
        loadFiles();
        loadExpiryDocs();
    }

    /* ══ HTML الصفحة ════════════════════════════════════════ */
    function buildPage() {
        return `
        <div class="archive-page">

            <!-- ══ الهيدر الاحترافي ══ -->
            <div class="arch-pro-hdr">
                <div class="arch-pro-hdr-left">
                    <div class="arch-pro-hdr-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
                    </div>
                    <div>
                        <h2 id="arch-title">${SUBS[S.sub]?.label || 'الأرشيف المالي'}</h2>
                        <div class="arch-breadcrumb">
                            <span>${tr('الأرشيف')}</span><span class="sep">›</span>
                            <span class="cur" id="arch-crumb">${SUBS[S.sub]?.crumb || 'الكل'}</span>
                        </div>
                    </div>
                </div>
                <div class="arch-pro-hdr-right">
                    <button class="arch-pro-btn-ghost" onclick="ArchiveModule.openUpload()">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                        ${tr('رفع')}
                    </button>
                    <button class="arch-pro-btn-primary" onclick="ArchiveModule.openAdd()">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        ${tr('إضافة وثيقة')}
                    </button>
                </div>
            </div>

            <!-- ══ الإحصائيات ══ -->
            <div class="arch-stats" id="arch-stats">
                <div class="arch-stat gold"><div style="height:62px;background:var(--bg-secondary);border-radius:8px;animation:archPulse 1.2s infinite"></div></div>
                <div class="arch-stat blue"><div style="height:62px;background:var(--bg-secondary);border-radius:8px;animation:archPulse 1.2s infinite .1s"></div></div>
                <div class="arch-stat green"><div style="height:62px;background:var(--bg-secondary);border-radius:8px;animation:archPulse 1.2s infinite .2s"></div></div>
                <div class="arch-stat orng"><div style="height:62px;background:var(--bg-secondary);border-radius:8px;animation:archPulse 1.2s infinite .3s"></div></div>
            </div>

            <!-- ══ منطقة التنبيهات الذكية ══ -->
            <div id="arch-alerts-zone"></div>

            <!-- ══ شريط الأدوات ══ -->
            <div class="arch-pro-toolbar">
                <div class="arch-pro-search">
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" stroke-width="1.8"/><path d="M13 13L17 17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
                    <input id="arch-search-input" type="text" placeholder="ابحث باسم الملف أو التصنيف أو المصدر…" oninput="ArchiveModule.onSearch(this.value)">
                    <button class="asp-clear" id="asp-clear" onclick="ArchiveModule.clearSearch()" style="display:none">✕</button>
                </div>
                <div class="arch-pro-filters" id="asp-filters">
                    <button class="arch-ext-btn active" data-ext="" onclick="ArchiveModule.setExtFilter(\'\',this)">الكل</button>
                    <button class="arch-ext-btn" data-ext="pdf" onclick="ArchiveModule.setExtFilter(\'pdf\',this)">PDF</button>
                    <button class="arch-ext-btn" data-ext="doc" onclick="ArchiveModule.setExtFilter(\'doc\',this)">Word</button>
                    <button class="arch-ext-btn" data-ext="xls" onclick="ArchiveModule.setExtFilter(\'xls\',this)">Excel</button>
                    <button class="arch-ext-btn" data-ext="img" onclick="ArchiveModule.setExtFilter(\'img\',this)">صور</button>
                </div>
                <div class="arch-pro-sort">
                    <select class="arch-sort-sel" id="arch-sort-sel" onchange="ArchiveModule.setSort(this.value)">
                        <option value="date_desc">${tr('الأحدث أولاً')}</option>
                        <option value="date_asc">${tr('الأقدم أولاً')}</option>
                        <option value="name_asc">${tr('الاسم أ-ي')}</option>
                        <option value="expiry_asc">${tr('الأقرب انتهاءً')}</option>
                    </select>
                </div>
                <div class="arch-view-toggle">
                    <button class="arch-vt-btn active" id="vt-grid" onclick="ArchiveModule.setView('grid')" title="بطاقات">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                    </button>
                    <button class="arch-vt-btn" id="vt-list" onclick="ArchiveModule.setView('list')" title="قائمة">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                    </button>
                    <button class="arch-vt-btn" id="vt-table" onclick="ArchiveModule.setView('table')" title="جدول">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
                    </button>
                </div>
            </div>

            <!-- ══ المحتوى ══ -->
            <div class="arch-content">
                <div class="arch-doc-panel" id="arch-doc-panel">
                    <div id="arch-section-content">
                        <div class="arch-loading-state">
                            <div class="arch-loading-spinner"></div>
                            <span>جارٍ التحميل…</span>
                        </div>
                    </div>
                </div>

                <!-- لوحة المعاينة -->
                <aside class="arch-preview" id="arch-preview">
                    <div class="arch-preview-hdr">
                        <h3>${tr('تفاصيل المستند')}</h3>
                        <div class="arch-close-btn" onclick="ArchiveModule.closePreview()">✕</div>
                    </div>
                    <div class="arch-preview-body">
                        <div class="arch-preview-thumb">
                            <span id="prev-icon" style="font-size:52px">📄</span>
                            <div class="ovl" id="prev-type">PDF</div>
                        </div>
                        <div class="arch-preview-info">
                            <div class="arch-info-row"><span class="arch-info-label">${tr('اسم الملف')}</span><span class="arch-info-val" id="prev-name">—</span></div>
                            <div class="arch-info-row"><span class="arch-info-label">${tr('التصنيف')}</span><span class="arch-info-val" id="prev-cat">—</span></div>
                            <div class="arch-info-row"><span class="arch-info-label">${tr('الحجم')}</span><span class="arch-info-val" id="prev-size">—</span></div>
                            <div class="arch-info-row"><span class="arch-info-label">${tr('تاريخ الرفع')}</span><span class="arch-info-val" id="prev-date">—</span></div>
                            <div class="arch-info-row"><span class="arch-info-label">${tr('رفع بواسطة')}</span><span class="arch-info-val" id="prev-user">—</span></div>
                            <div class="arch-info-row"><span class="arch-info-label">${tr('الصلاحية')}</span><span class="arch-info-val" id="prev-expiry">—</span></div>
                        </div>
                    </div>
                    <div class="arch-preview-actions">
                        <button class="arch-btn arch-btn-primary" onclick="ArchiveModule.openViewer()">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                            ${tr('استعراض')}
                        </button>
                        <button class="arch-btn arch-btn-ghost" onclick="ArchiveModule.openEdit()">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            ${tr('تعديل')}
                        </button>
                        <a class="arch-btn arch-btn-ghost" id="prev-dl" href="#" download>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                            ${tr('تحميل')}
                        </a>
                    </div>
                </aside>
            </div>
        </div>
        <!-- مودال استعراض المستند -->
        <div class="arch-viewer-overlay" id="arch-viewer-overlay" onclick="ArchiveModule.closeViewer(event)">
            <div class="arch-viewer-modal avw-modal" onclick="event.stopPropagation()">
                <div class="avw-hdr">
                    <div class="avw-hdr-left">
                        <span id="vwr-icon" style="font-size:22px">📄</span>
                        <div>
                            <div class="avw-title" id="vwr-title">—</div>
                            <div class="avw-sub" id="vwr-sub">—</div>
                        </div>
                    </div>
                    <div class="avw-hdr-actions">
                        <button class="avw-action-btn" onclick="ArchiveModule.openEdit()" title="تعديل">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <a class="avw-action-btn" id="vwr-dl" href="#" download title="تحميل">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        </a>
                        <button class="avw-action-btn" onclick="window.print()" title="طباعة">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                        </button>
                        <button class="avw-close-btn" onclick="ArchiveModule.closeViewer()">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                    </div>
                </div>
                <div class="avw-body" id="vwr-body">
                    <div class="arch-mock-doc">
                        <div class="arch-mock-page">
                            <div class="arch-watermark">أرشيف</div>
                            <div class="arch-mock-hdr">
                                <div class="arch-mock-co" id="vwr-co">—</div>
                                <div class="arch-mock-stm">✓</div>
                            </div>
                            <div class="arch-mock-title">
                                <h2 id="vwr-doc-title">—</h2>
                                <p id="vwr-doc-sub">—</p>
                            </div>
                            <table class="arch-mock-table">
                                <thead><tr><th>البند</th><th>القيمة</th><th>الملاحظات</th></tr></thead>
                                <tbody id="vwr-tbody"></tbody>
                            </table>
                            <div class="arch-mock-ftr">
                                <span>نظام الأرشيف المالي</span>
                                <span id="vwr-ftr-date">—</span>
                                <span>سري وخاص</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="avw-ftr">
                    <div class="avw-ftr-info" id="vwr-ftr-info">—</div>
                    <div class="avw-ftr-zoom">
                        <button class="avw-zoom-btn" onclick="ArchiveModule._zoom(-10)">−</button>
                        <span class="avw-zoom-val" id="vwr-zoom">100%</span>
                        <button class="avw-zoom-btn" onclick="ArchiveModule._zoom(10)">+</button>
                    </div>
                </div>
            </div>
        </div>

        <!-- مودال تعديل المستند -->
        <div class="arch-viewer-overlay" id="arch-edit-overlay" onclick="ArchiveModule.closeEdit(event)">
            <div class="aed-modal" onclick="event.stopPropagation()">
                <div class="aed-hdr">
                    <div class="aed-hdr-left">
                        <div class="aed-hdr-icon">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </div>
                        <div>
                            <div class="aed-hdr-main">تعديل المستند</div>
                            <div class="aed-hdr-sub" id="aed-file-name">—</div>
                        </div>
                    </div>
                    <button class="aad-pro-close" onclick="ArchiveModule.closeEdit()">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>
                <div class="aed-body">
                    <!-- البيانات الأساسية -->
                    <div class="aed-section-label">البيانات الأساسية</div>
                    <div class="aed-fields-grid">
                        <div class="aed-field aed-field--wide">
                            <label class="aed-label">اسم المستند *</label>
                            <input type="text" id="aed-f-name" class="aed-input" placeholder="اسم وصفي للمستند">
                        </div>
                        <div class="aed-field">
                            <label class="aed-label">تاريخ الانتهاء</label>
                            <input type="date" id="aed-f-expiry" class="aed-input">
                        </div>
                        <div class="aed-field">
                            <label class="aed-label">الجهة / المرجع</label>
                            <input type="text" id="aed-f-ref" class="aed-input" placeholder="اسم الجهة أو رقم المرجع">
                        </div>
                        <div class="aed-field aed-field--wide">
                            <label class="aed-label">ملاحظات</label>
                            <textarea id="aed-f-notes" class="aed-input" rows="3" placeholder="أي ملاحظات إضافية"></textarea>
                        </div>
                    </div>
                    <!-- استبدال الملف -->
                    <div class="aed-section-label" style="margin-top:16px">استبدال الملف <span class="aed-optional">(اختياري)</span></div>
                    <div class="aed-replace-zone" id="aed-dropzone" onclick="document.getElementById('aed-file-inp').click()">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                        <span id="aed-file-label">انقر لاختيار ملف جديد أو اسحبه هنا</span>
                        <input type="file" id="aed-file-inp" style="display:none" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png">
                    </div>
                    <div class="aed-file-chip" id="aed-file-chip" style="display:none">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        <span id="aed-chip-name">—</span>
                        <button onclick="ArchiveModule._clearEditFile()">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                    </div>
                </div>
                <div class="aed-ftr">
                    <button class="aad-pro-btn-ghost" onclick="ArchiveModule.closeEdit()">إلغاء</button>
                    <button class="aed-save-btn" id="aed-save-btn" onclick="ArchiveModule.submitEdit()">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                        حفظ التعديلات
                    </button>
                </div>
            </div>
        </div>

        <!-- ══ مودال رفع مستندات (متعدد) ═══════════════════════════ -->
        <div class="arch-viewer-overlay" id="arch-upload-overlay" onclick="ArchiveModule.closeUpload(event)">
            <div class="arch-viewer-modal aum-modal" onclick="event.stopPropagation()">
                <div class="arch-viewer-hdr">
                    <div style="display:flex;align-items:center;gap:10px">
                        <span style="font-size:1.2rem">⬆</span>
                        <div><h3>رفع مستندات</h3><div class="aum-sub" id="aum-count-label">اختر الملفات المراد رفعها</div></div>
                    </div>
                    <div class="arch-close-btn" onclick="ArchiveModule.closeUpload()">✕</div>
                </div>

                <!-- منطقة الإسقاط -->
                <div class="aum-body">
                    <div class="aum-dropzone" id="aum-dropzone" onclick="document.getElementById('aum-file-inp').click()">
                        <div class="aum-dz-icon">
                            <svg viewBox="0 0 48 48" fill="none"><path d="M24 8 L24 32 M14 18 L24 8 L34 18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 36 L8 40 L40 40 L40 36" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                        </div>
                        <div class="aum-dz-title">اسحب الملفات هنا</div>
                        <div class="aum-dz-sub">أو انقر للاختيار — PDF, Word, Excel, صور</div>
                        <input type="file" id="aum-file-inp" style="display:none" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.txt">
                    </div>

                    <!-- قائمة الملفات المختارة -->
                    <div class="aum-file-list" id="aum-file-list"></div>

                    <!-- تصنيف مشترك -->
                    <div class="aum-common-fields" id="aum-common-fields" style="display:none">
                        <div class="aum-cf-title">⚙️ إعدادات مشتركة لجميع الملفات</div>
                        <div class="aum-cf-row">
                            <div class="aum-cf-field">
                                <label>${tr('التصنيف')}</label>
                                <select id="aum-cat-global">
                                    <option value="">— مختلف لكل ملف —</option>
                                    <option value="عقد_اتفاقية">📜 عقد / اتفاقية</option>
                                    <option value="معاملة_مالية">💰 معاملة مالية</option>
                                    <option value="موازنة_تخطيط">📊 موازنة / تخطيط</option>
                                    <option value="وثيقة_حكومية">🏛️ وثيقة حكومية</option>
                                    <option value="سجل_تجاري">🏢 سجل تجاري</option>
                                    <option value="إيداع_بنكي">🏦 إيداع بنكي</option>
                                    <option value="خطاب_مراسلة">✉️ خطاب / مراسلة</option>
                                    <option value="أخرى">📁 أخرى</option>
                                </select>
                            </div>
                            <div class="aum-cf-field">
                                <label>تاريخ الانتهاء</label>
                                <input type="date" id="aum-expiry-global">
                            </div>
                        </div>
                    </div>
                </div>

                <div class="arch-viewer-ftr">
                    <div class="aum-ftr-info" id="aum-ftr-info">—</div>
                    <div style="display:flex;gap:8px">
                        <button class="arch-btn arch-btn-ghost" onclick="ArchiveModule.closeUpload()">إلغاء</button>
                        <button class="arch-btn arch-btn-primary" id="aum-upload-btn" onclick="ArchiveModule.submitMultiUpload()" disabled>⬆ رفع الملفات</button>
                    </div>
                </div>
            </div>
        </div>

        <!-- ══ مودال تقدم الرفع ══════════════════════════════════ -->
        <div class="arch-viewer-overlay" id="aum-progress-overlay">
            <div class="arch-viewer-modal aum-prog-modal" onclick="event.stopPropagation()">
                <div class="arch-viewer-hdr">
                    <div style="display:flex;align-items:center;gap:10px">
                        <span id="aum-prog-icon" style="font-size:1.2rem">⬆</span>
                        <h3 id="aum-prog-title">جارٍ رفع الملفات…</h3>
                    </div>
                </div>
                <div class="aum-prog-body" id="aum-prog-list"></div>
                <div class="arch-viewer-ftr" style="justify-content:flex-end">
                    <button class="arch-btn arch-btn-primary" id="aum-prog-close-btn" style="display:none" onclick="ArchiveModule.closeProgressModal()">✓ إغلاق</button>
                </div>
            </div>
        </div>

        <!-- ══ مودال إضافة وثيقة ══════════════════════════════ -->
        <div class="arch-viewer-overlay" id="arch-add-overlay" onclick="ArchiveModule.closeAdd(event)">
            <div class="aad-modal-pro" onclick="event.stopPropagation()">

                <!-- Header -->
                <div class="aad-pro-hdr">
                    <div class="aad-pro-hdr-title">
                        <div class="aad-pro-hdr-icon">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
                        </div>
                        <div>
                            <div class="aad-pro-hdr-main">إضافة وثيقة جديدة</div>
                            <div class="aad-pro-hdr-sub">اختر النوع ثم أدخل البيانات</div>
                        </div>
                    </div>
                    <button class="aad-pro-close" onclick="ArchiveModule.closeAdd()">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>

                <!-- Steps indicator -->
                <div class="aad-pro-steps">
                    <div class="aad-pro-step active" id="aad-step-ind-1">
                        <div class="aad-pro-step-num">1</div>
                        <div class="aad-pro-step-lbl">نوع الوثيقة</div>
                    </div>
                    <div class="aad-pro-step-line"></div>
                    <div class="aad-pro-step" id="aad-step-ind-2">
                        <div class="aad-pro-step-num">2</div>
                        <div class="aad-pro-step-lbl">البيانات</div>
                    </div>
                    <div class="aad-pro-step-line"></div>
                    <div class="aad-pro-step" id="aad-step-ind-3">
                        <div class="aad-pro-step-num">3</div>
                        <div class="aad-pro-step-lbl">الملف</div>
                    </div>
                </div>

                <!-- Body -->
                <div class="aad-pro-body">

                    <!-- Step 1: نوع الوثيقة -->
                    <div class="aad-pro-panel" id="aad-panel-1">
                        <div class="aad-cat-section">
                            <div class="aad-cat-label">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                                مستندات تشغيلية
                            </div>
                            <div class="aad-cat-grid">
                                <div class="aad-type-card active" data-type="عقد_اتفاقية" onclick="ArchiveModule._setAddType('عقد_اتفاقية',this)">
                                    <div class="aad-type-card-icon">📜</div>
                                    <div class="aad-type-card-name">عقد / اتفاقية</div>
                                </div>
                                <div class="aad-type-card" data-type="تعميد_تفويض" onclick="ArchiveModule._setAddType('تعميد_تفويض',this)">
                                    <div class="aad-type-card-icon">✍️</div>
                                    <div class="aad-type-card-name">تعميد / تفويض</div>
                                </div>
                                <div class="aad-type-card" data-type="خطاب_مراسلة" onclick="ArchiveModule._setAddType('خطاب_مراسلة',this)">
                                    <div class="aad-type-card-icon">✉️</div>
                                    <div class="aad-type-card-name">خطاب / مراسلة</div>
                                </div>
                            </div>
                        </div>

                        <div class="aad-cat-section">
                            <div class="aad-cat-label">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                                مستندات مالية
                            </div>
                            <div class="aad-cat-grid">
                                <div class="aad-type-card" data-type="فاتورة_مبيعات" onclick="ArchiveModule._setAddType('فاتورة_مبيعات',this)">
                                    <div class="aad-type-card-icon">🧾</div>
                                    <div class="aad-type-card-name">فاتورة مبيعات</div>
                                </div>
                                <div class="aad-type-card" data-type="فاتورة_موردين" onclick="ArchiveModule._setAddType('فاتورة_موردين',this)">
                                    <div class="aad-type-card-icon">🛒</div>
                                    <div class="aad-type-card-name">فاتورة موردين</div>
                                </div>
                                <div class="aad-type-card" data-type="قيد_يومي" onclick="ArchiveModule._setAddType('قيد_يومي',this)">
                                    <div class="aad-type-card-icon">📒</div>
                                    <div class="aad-type-card-name">قيد يومي</div>
                                </div>
                                <div class="aad-type-card" data-type="مستند_بنكي" onclick="ArchiveModule._setAddType('مستند_بنكي',this)">
                                    <div class="aad-type-card-icon">🏦</div>
                                    <div class="aad-type-card-name">مستند بنكي</div>
                                </div>
                                <div class="aad-type-card" data-type="ضريبة_زكاة" onclick="ArchiveModule._setAddType('ضريبة_زكاة',this)">
                                    <div class="aad-type-card-icon">🏛️</div>
                                    <div class="aad-type-card-name">ضريبة / زكاة</div>
                                </div>
                            </div>
                        </div>

                        <div class="aad-cat-section">
                            <div class="aad-cat-label">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>
                                تقارير وموازنة
                            </div>
                            <div class="aad-cat-grid">
                                <div class="aad-type-card" data-type="تقرير_مالي" onclick="ArchiveModule._setAddType('تقرير_مالي',this)">
                                    <div class="aad-type-card-icon">📊</div>
                                    <div class="aad-type-card-name">تقرير مالي</div>
                                </div>
                                <div class="aad-type-card" data-type="موازنة_تخطيط" onclick="ArchiveModule._setAddType('موازنة_تخطيط',this)">
                                    <div class="aad-type-card-icon">📈</div>
                                    <div class="aad-type-card-name">موازنة / تخطيط</div>
                                </div>
                            </div>
                        </div>

                        <div class="aad-cat-section">
                            <div class="aad-cat-label">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                                وثائق رسمية
                            </div>
                            <div class="aad-cat-grid">
                                <div class="aad-type-card" data-type="وثيقة_حكومية" onclick="ArchiveModule._setAddType('وثيقة_حكومية',this)">
                                    <div class="aad-type-card-icon">🏛️</div>
                                    <div class="aad-type-card-name">وثيقة حكومية</div>
                                </div>
                                <div class="aad-type-card" data-type="سجل_تجاري" onclick="ArchiveModule._setAddType('سجل_تجاري',this)">
                                    <div class="aad-type-card-icon">🏢</div>
                                    <div class="aad-type-card-name">سجل تجاري</div>
                                </div>
                                <div class="aad-type-card" data-type="أخرى" onclick="ArchiveModule._setAddType('أخرى',this)">
                                    <div class="aad-type-card-icon">📁</div>
                                    <div class="aad-type-card-name">أخرى</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Step 2: الحقول -->
                    <div class="aad-pro-panel" id="aad-panel-2" style="display:none">
                        <div class="aad-selected-type-bar" id="aad-selected-type-bar">
                            <span id="aad-selected-type-icon">📜</span>
                            <span id="aad-selected-type-name">عقد / اتفاقية</span>
                            <button class="aad-change-type-btn" onclick="ArchiveModule._goStep(1)">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
                                تغيير النوع
                            </button>
                        </div>
                        <div class="aad-fields" id="aad-fields"></div>
                    </div>

                    <!-- Step 3: الملف -->
                    <div class="aad-pro-panel" id="aad-panel-3" style="display:none">
                        <div class="aad-dropzone-pro" id="aad-dropzone"
                            onclick="document.getElementById('aad-file-inp').click()">
                            <div class="aad-dropzone-icon" id="aad-dropzone-icon">
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                            </div>
                            <div class="aad-dropzone-title" id="aad-file-label">اسحب الملف هنا أو انقر للاختيار</div>
                            <div class="aad-dropzone-sub">PDF, Word, Excel, صور — بحد أقصى 20 ميجابايت</div>
                            <div class="aad-dropzone-types">
                                <span>.pdf</span><span>.docx</span><span>.xlsx</span><span>.jpg</span><span>.png</span>
                            </div>
                            <input type="file" id="aad-file-inp" style="display:none" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png">
                        </div>
                        <div class="aad-file-selected" id="aad-file-selected" style="display:none">
                            <div class="aad-file-selected-icon">📎</div>
                            <div class="aad-file-selected-info">
                                <div class="aad-file-selected-name" id="aad-file-selected-name"></div>
                                <div class="aad-file-selected-size" id="aad-file-selected-size"></div>
                            </div>
                            <button class="aad-file-remove" onclick="ArchiveModule._clearFile()">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                        </div>
                        <p class="aad-file-optional">الملف اختياري — يمكنك الحفظ بدون رفع ملف</p>
                    </div>

                </div>

                <!-- Footer -->
                <div class="aad-pro-ftr">
                    <button class="aad-pro-btn-ghost" id="aad-btn-back" onclick="ArchiveModule._goStep(1)" style="display:none">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
                        رجوع
                    </button>
                    <button class="aad-pro-btn-ghost" onclick="ArchiveModule.closeAdd()">إلغاء</button>
                    <div style="display:flex;gap:8px;margin-right:auto">
                        <button class="aad-pro-btn-next" id="aad-btn-next" onclick="ArchiveModule._goStep(2)">
                            التالي
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                        </button>
                        <button class="aad-pro-btn-save" id="aad-save-btn" style="display:none" onclick="ArchiveModule.submitAdd()">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                            حفظ الوثيقة
                        </button>
                    </div>
                </div>

            </div>
        </div>`;
    }

    /* ══ ربط الأحداث ════════════════════════════════════════ */
    function bindEvents() {
        // multi-upload file input
        const aumFi = document.getElementById('aum-file-inp');
        if (aumFi) aumFi.addEventListener('change', e => _onFilesSelected(e.target.files));

        const aumDz = document.getElementById('aum-dropzone');
        if (aumDz) {
            aumDz.addEventListener('dragover', e => { e.preventDefault(); aumDz.classList.add('drag-over'); });
            aumDz.addEventListener('dragleave', () => aumDz.classList.remove('drag-over'));
            aumDz.addEventListener('drop', e => {
                e.preventDefault(); aumDz.classList.remove('drag-over');
                _onFilesSelected(e.dataTransfer.files);
            });
        }

        // استخدام event delegation للمودالات (تعمل حتى لو المودال لم يُفتح بعد)
        document.addEventListener('change', e => {
            if (e.target.id === 'aad-file-inp') {
                const file = e.target.files[0];
                if (file) ArchiveModule._onAddFileSelected(file);
            }
            if (e.target.id === 'aed-file-inp') {
                const file = e.target.files[0];
                if (!file) return;
                _editFile = file;
                const chip = document.getElementById('aed-file-chip');
                const dz = document.getElementById('aed-dropzone');
                const nm = document.getElementById('aed-chip-name');
                if (chip) chip.style.display = 'flex';
                if (dz) dz.style.display = 'none';
                if (nm) nm.textContent = file.name;
            }
        });

        document.addEventListener('dragover', e => {
            const dz = e.target.closest('#aad-dropzone, #aed-dropzone');
            if (dz) { e.preventDefault(); dz.classList.add('drag-over'); }
        });
        document.addEventListener('dragleave', e => {
            const dz = e.target.closest('#aad-dropzone, #aed-dropzone');
            if (dz) dz.classList.remove('drag-over');
        });
        document.addEventListener('drop', e => {
            const dz = e.target.closest('#aad-dropzone');
            if (dz) {
                e.preventDefault(); dz.classList.remove('drag-over');
                const file = e.dataTransfer.files[0];
                if (file) ArchiveModule._onAddFileSelected(file);
            }
            const edz = e.target.closest('#aed-dropzone');
            if (edz) {
                e.preventDefault(); edz.classList.remove('drag-over');
                const file = e.dataTransfer.files[0];
                if (!file) return;
                _editFile = file;
                const chip = document.getElementById('aed-file-chip');
                const nm = document.getElementById('aed-chip-name');
                if (chip) chip.style.display = 'flex';
                edz.style.display = 'none';
                if (nm) nm.textContent = file.name;
            }
        });
        const fi = document.getElementById('arch-file-inp');
        const dz = document.getElementById('arch-dropzone');
        if (fi) fi.addEventListener('change', () => { if (fi.files[0]) _setFile(fi.files[0]); });
        if (dz) {
            dz.addEventListener('dragover', e => { e.preventDefault(); dz.style.borderColor = 'var(--arch-gold)'; });
            dz.addEventListener('dragleave', () => dz.style.borderColor = '');
            dz.addEventListener('drop', e => {
                e.preventDefault(); dz.style.borderColor = '';
                if (e.dataTransfer.files[0]) _setFile(e.dataTransfer.files[0]);
            });
        }
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') { closeViewer(); closeUpload(); closePreview(); }
        }, { once: false });
    }

    /* ══ مزامنة السايدبار ═══════════════════════════════════ */
    function _syncSidebarActive() {
        document.querySelectorAll('.nav-tab[data-tab^="archive-"]').forEach(b => b.classList.remove('active'));
        const activeBtn = document.querySelector(`.nav-tab[data-tab="archive-${S.sub}"]`);
        if (activeBtn) activeBtn.classList.add('active');
    }

    /* ══ تحميل الإحصائيات ══════════════════════════════════ */
    async function loadStats() {
        try {
            const r = await fetch(`${API}?action=stats`);
            const d = await r.json();
            if (!d.success) return;
            S.stats = d.data || {};
            _renderStats();
        } catch (e) { console.warn('Archive stats error:', e); }
    }

    function _renderStats() {
        const el = document.getElementById('arch-stats');
        if (!el) return;
        const s = S.stats;
        const hasExpiring = (s.expiring_soon ?? 0) > 0 || (s.expired_docs ?? 0) > 0;
        el.innerHTML = `
            <div class="arch-stat gold">
                <div class="arch-stat-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/></svg>
                </div>
                <div class="arch-stat-label">${tr('إجمالي المستندات')}</div>
                <div class="arch-stat-val">${s.total_files ?? 0}</div>
                <div class="arch-stat-sub">↑ ${s.last_30_days ?? 0} ${tr('هذا الشهر')}</div>
            </div>
            <div class="arch-stat blue">
                <div class="arch-stat-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                </div>
                <div class="arch-stat-label">${tr('مصادر مرتبطة')}</div>
                <div class="arch-stat-val">${s.linked_docs ?? 0}</div>
                <div class="arch-stat-sub">${s.total_size ?? '—'} ${tr('إجمالي الحجم')}</div>
            </div>
            <div class="arch-stat green">
                <div class="arch-stat-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                </div>
                <div class="arch-stat-label">${tr('تحت المتابعة')}</div>
                <div class="arch-stat-val">${s.total_expiry_docs ?? 0}</div>
                <div class="arch-stat-sub">${tr('صلاحيات وعقود')}</div>
            </div>
            <div class="arch-stat orng ${hasExpiring ? 'arch-stat--alert' : ''}">
                <div class="arch-stat-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                </div>
                <div class="arch-stat-label">${tr('تنتهي خلال 30 يوم')}</div>
                <div class="arch-stat-val" ${hasExpiring ? 'style="color:var(--accent-red)"' : ''}>${s.expiring_soon ?? 0}</div>
                <div class="arch-stat-sub">${(s.expired_docs ?? 0) > 0 ? `⚠ ${s.expired_docs} ${tr('منتهية')}` : tr('لا تنبيهات')}</div>
            </div>`;

        // تحديث التنبيهات الذكية
        _renderAlerts();
    }

    function _renderAlerts() {
        const zone = document.getElementById('arch-alerts-zone');
        if (!zone) return;
        const expiring = S.files.filter(f => {
            if (!f.expiry_date) return false;
            const days = Math.ceil((new Date(f.expiry_date) - new Date()) / 86400000);
            return days <= 30;
        }).sort((a, b) => new Date(a.expiry_date) - new Date(b.expiry_date)).slice(0, 4);

        if (!expiring.length) { zone.innerHTML = ''; return; }

        zone.innerHTML = `<div class="arch-alerts-panel">
            ${expiring.map(f => {
            const days = Math.ceil((new Date(f.expiry_date) - new Date()) / 86400000);
            const isExpired = days < 0;
            const cls = isExpired ? 'arch-alert--red' : 'arch-alert--amber';
            const label = isExpired ? `انتهت منذ ${Math.abs(days)} يوم` : `ينتهي بعد ${days} يوم`;
            return `<div class="arch-alert-row ${cls}">
                    <div class="arch-alert-dot"></div>
                    <div class="arch-alert-name">${_e(f.display_name)}</div>
                    <div class="arch-alert-date">${label}</div>
                    <button class="arch-alert-action" onclick="ArchiveModule.selectFile(${f.id})">${tr('عرض الكل')}</button>
                </div>`;
        }).join('')}
        </div>`;
    }

    /* ══ تحميل الملفات ══════════════════════════════════════ */
    async function loadFiles() {
        try {
            const r = await fetch(`${API}?action=list&limit=200&search=${encodeURIComponent(S.search)}`);
            const d = await r.json();
            if (!d.success) { _renderContent(); return; }
            S.files = d.data.files || [];
            _renderContent();
        } catch (e) { _renderContent(); }
    }

    /* ══ تحميل وثائق الصلاحية ══════════════════════════════ */
    async function loadExpiryDocs() {
        try {
            const r = await fetch(`${API}?action=expiry_list`);
            const d = await r.json();
            if (d.success) { S.expiryDocs = d.data || []; _renderContent(); }
        } catch (e) { }
    }

    /* ══ تصيير المحتوى حسب القسم ════════════════════════════ */
    function _renderContent() {
        const c = document.getElementById('arch-section-content');
        if (!c) return;

        const info = SUBS[S.sub] || SUBS.all;
        const title = document.getElementById('arch-title');
        const crumb = document.getElementById('arch-crumb');
        if (title) title.textContent = info.label;
        if (crumb) crumb.textContent = info.crumb;

        let html = '';

        if (S.sub === 'all') {
            html += _renderRenewal(3);
            html += _renderGroup('operational', `📋 ${tr('مستندات تشغيلية')}`, 'ab-blue');
            html += _renderGroup('financial', `💰 ${tr('مستندات مالية')}`, 'ab-green');
            html += _renderGroup('reports', `📊 ${tr('تقارير وموازنة')}`, 'ab-gold');
            html += _renderGroup('official', `🏛️ ${tr('وثائق رسمية')}`, 'ab-red');
        } else if (S.sub === 'renewals') {
            html += _renderRenewalPage();
        } else if (SUB_TABS[S.sub]) {
            html += _renderSubTabs();
            let files = _applySortToFiles(_filterFilesBySub());
            if (S.search || S.extFilter) {
                html += _renderSearchResults(files);
            } else if (!files.length) {
                html += _renderEmpty('لا توجد مستندات في هذا القسم');
            } else {
                html += _renderViewMode(files);
            }
        } else {
            let files = _applySortToFiles(_filterFiles(S.sub));
            html += _renderViewMode(files);
            if (!files.length) html = _renderEmpty('لا توجد مستندات في هذا القسم');
        }

        c.innerHTML = html;
    }

    function _renderViewMode(files) {
        if (S.viewMode === 'table') return _renderTable(files);
        if (S.viewMode === 'list') return _renderList(files);
        return _renderGrid(files);
    }

    function _filterFiles(sub) {
        if (sub === 'all') return _applySearch(S.files);
        return _applySearch(S.files.filter(f => CAT_MAP[f.category] === sub || SRC_MAP[f.source_module] === sub));
    }

    function _filterFilesBySub() {
        // فلترة حسب القسم الرئيسي + التبويب الفرعي
        let files = S.files.filter(f =>
            CAT_MAP[f.category] === S.sub || SRC_MAP[f.source_module] === S.sub
        );
        const active = S.activeSub;
        if (active && !active.startsWith('all_')) {
            files = files.filter(f => SUB_CAT_MAP[f.category] === active);
        }
        return _applySearch(files);
    }

    function _applySearch(files) {
        let res = files;
        if (S.search) {
            const q = S.search.toLowerCase();
            res = res.filter(f =>
                (f.display_name || '').toLowerCase().includes(q) ||
                (f.category || '').toLowerCase().includes(q) ||
                (f.source_ref || '').toLowerCase().includes(q) ||
                (f.file_extension || '').toLowerCase().includes(q) ||
                (f.uploader_name || '').toLowerCase().includes(q)
            );
        }
        if (S.extFilter) {
            const imgExts = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
            res = res.filter(f => {
                const ext = (f.file_extension || '').toLowerCase();
                if (S.extFilter === 'img') return imgExts.includes(ext);
                if (S.extFilter === 'doc') return ext === 'doc' || ext === 'docx';
                if (S.extFilter === 'xls') return ext === 'xls' || ext === 'xlsx' || ext === 'csv';
                return ext === S.extFilter;
            });
        }
        return res;
    }

    function _renderSubTabs() {
        const tabs = SUB_TABS[S.sub] || [];
        if (!tabs.length) return '';
        const mainFiles = S.files.filter(f =>
            CAT_MAP[f.category] === S.sub || SRC_MAP[f.source_module] === S.sub
        );
        // تعيين التبويب النشط الافتراضي
        if (!S.activeSub || !tabs.find(t => t.key === S.activeSub)) {
            S.activeSub = tabs[0].key;
        }
        return `<div class="arch-subtabs-bar">
            ${tabs.map(t => {
            const count = t.key.startsWith('all_') ? mainFiles.length
                : mainFiles.filter(f => SUB_CAT_MAP[f.category] === t.key).length;
            const isActive = S.activeSub === t.key;
            const isEmpty = count === 0 && !t.key.startsWith('all_');
            return `<button
                    class="arch-stab ${isActive ? 'arch-stab--active' : ''} ${isEmpty ? 'arch-stab--empty' : ''}"
                    onclick="ArchiveModule.setSubTab('${t.key}')">
                    <span class="arch-stab-label">${t.label}</span>
                    <span class="arch-stab-count ${isActive ? 'arch-stab-count--active' : ''}">${count}</span>
                </button>`;
        }).join('')}
        </div>`;
    }

    function _renderSearchResults(files) {
        if (!files.length) return _renderEmpty(
            S.search ? `لا نتائج لـ "${S.search}"` : 'لا توجد مستندات',
            'جرّب كلمة أخرى أو غيّر الفلتر'
        );
        return `<div class="arch-search-results-hdr">
            <span>${files.length} نتيجة ${S.search ? `لـ "<strong>${S.search}</strong>"` : ''}</span>
        </div>` + _renderGrid(files) + _renderList(files);
    }

    /* ── صفحة التجديد والصلاحيات (تبويبان) ─────────────── */
    function _renderRenewalPage() {
        const activeTab = S._renewalTab || 'all';
        const expiring = S.expiryDocs.filter(d => parseInt(d.days_remaining) <= 30);
        const tabs = [
            { key: 'all', label: 'الكل', count: S.expiryDocs.length },
            { key: 'expiring', label: '⚠️ تنتهي قريباً', count: expiring.length, warn: expiring.length > 0 },
        ];
        const tabsHtml = `<div class="arch-subtabs-bar" style="margin-bottom:20px">
            ${tabs.map(t => `<button class="arch-stab ${activeTab === t.key ? 'arch-stab--active' : ''} ${t.warn ? 'arch-stab--warn' : ''}"
                onclick="ArchiveModule._setRenewalTab('${t.key}')">
                ${t.label}<span class="arch-subtab-count">${t.count}</span>
            </button>`).join('')}
        </div>`;
        const onlyExpiring = activeTab === 'expiring';
        return tabsHtml + _renderRenewal(999, onlyExpiring);
    }

    function _setRenewalTab(key) {
        S._renewalTab = key;
        _renderContent();
    }

    /* ── قسم التجديد السنوي ─────────────────────────────── */
    function _renderRenewal(max = 6, onlyExpiring = false) {
        let docs = S.expiryDocs.slice();
        if (onlyExpiring) docs = docs.filter(d => parseInt(d.days_remaining) <= 30);
        docs = docs.slice(0, max);

        const cards = docs.length ? docs.map(d => {
            const days = parseInt(d.days_remaining || 0);
            let color = 'var(--accent-green)', dotCls = 'dot-green', pct = 90, label = `${days} ${tr('أيام')}`;
            if (days < 0) { color = 'var(--accent-red)'; dotCls = 'dot-red'; pct = 5; label = 'منتهية'; }
            else if (days <= 9) { color = 'var(--accent-red)'; dotCls = 'dot-red'; pct = Math.max(5, days * 3); label = `⚠ ${days} أيام`; }
            else if (days <= 30) { color = 'var(--accent-orange)'; dotCls = 'dot-orange'; pct = Math.min(45, days * 1.2); }
            else if (days <= 90) { color = 'var(--accent-blue)'; dotCls = 'dot-orange'; pct = Math.min(70, days * .7); }
            const icon = { سجل_تجاري: '🏢', عقد_اتفاقية: '📜', تعميد_تفويض: '✍️', وثيقة_حكومية: '🏛️' }[d.doc_type] || '📋';
            return `<div class="arch-rc">
                <div class="arch-rc-top">
                    <div class="arch-rc-icon" style="background:${color}18">${icon}</div>
                    <div class="status-dot ${dotCls}"></div>
                </div>
                <div class="arch-rc-name">${_e(d.doc_name)}</div>
                <div class="arch-rc-date">ينتهي: ${_fmtDate(d.expiry_date)}</div>
                <div class="arch-rc-bar"><div class="arch-rc-fill" style="width:${pct}%;background:${color}"></div></div>
                <div class="arch-rc-days" style="color:${color}">${label}</div>
            </div>`;
        }).join('') : `<div class="arch-empty-renewal">
    <div class="aer-icon">
        <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="40" cy="40" r="36" stroke="currentColor" stroke-width="2" stroke-dasharray="6 4" opacity=".25"/>
            <path d="M40 22 C40 22 28 30 28 40 C28 50.5 33.5 56 40 56 C46.5 56 52 50.5 52 40 C52 30 40 22 40 22Z" stroke="currentColor" stroke-width="1.8" fill="none" opacity=".35"/>
            <path d="M33 40 C33 36 36 32 40 30" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity=".5"/>
            <circle cx="40" cy="40" r="4" fill="currentColor" opacity=".4"/>
            <path d="M54 26 L58 22 M58 22 L54 22 M58 22 L58 26" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" opacity=".5"/>
        </svg>
    </div>
    <div class="aer-title">${tr('لا توجد مستندات للتجديد')}</div>
    <div class="aer-sub">${tr('ستظهر هنا المستندات التي تقترب صلاحيتها')}</div>
</div>`;

        return `<div class="arch-renewal">
            <div class="arch-sec-hdr">
                <h3>🔄 ${tr('مستندات التجديد السنوي')} <span class="arch-badge ab-orange">${docs.length} مستندات</span></h3>
                <button class="arch-btn arch-btn-ghost" style="font-size:.75rem" onclick="openArchiveSub('renewals')">${tr('عرض الكل')}</button>
            </div>
            <div class="arch-renewal-grid">${cards}</div>
        </div>`;
    }

    /* ── مجموعة قسم ─────────────────────────────────────── */
    function _renderGroup(sub, label, badgeCls) {
        const files = _filterFiles(sub);
        const preview = files.slice(0, 4); // أظهر 4 فقط في الـ overview
        const hasMore = files.length > 4;
        const emptyHtml = files.length === 0
            ? `<div class="arch-empty-state arch-empty-state--sm">
                <div class="aes-art aes-art--sm">
                    <svg viewBox="0 0 60 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <ellipse cx="30" cy="44" rx="18" ry="3" fill="currentColor" opacity=".08"/>
                        <rect x="10" y="12" width="28" height="26" rx="4" fill="currentColor" opacity=".08" stroke="currentColor" stroke-width="1.3" stroke-opacity=".2"/>
                        <rect x="18" y="8" width="26" height="30" rx="4" fill="var(--bg-card)" stroke="currentColor" stroke-width="1.5" stroke-opacity=".25"/>
                        <path d="M24 18 L36 18 M24 24 L36 24 M24 30 L30 30" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" opacity=".2"/>
                        <circle cx="31" cy="35" r="7" fill="var(--bg-secondary)" stroke="currentColor" stroke-width="1.3" stroke-opacity=".3"/>
                        <path d="M28 32 L34 38 M34 32 L28 38" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity=".35"/>
                    </svg>
                </div>
                <div class="aes-title aes-title--sm">${tr('لا توجد مستندات')}</div>
              </div>`
            : '';
        const _cardHtml = (f, i) => {
            const ext = (f.file_extension || '').toLowerCase();
            const cls = _iconCls(ext);
            let expiryBadge = '';
            if (f.expiry_date) {
                const days = Math.ceil((new Date(f.expiry_date) - new Date()) / 86400000);
                if (days < 0) expiryBadge = `<span class="arch-card-badge arch-card-badge--red">منتهية</span>`;
                else if (days <= 30) expiryBadge = `<span class="arch-card-badge arch-card-badge--amber">⏳ ${days} يوم</span>`;
            }
            return `<div class="arch-doc-card" style="animation-delay:${i * .03}s" data-id="${f.id}" onclick="ArchiveModule.selectFile(${f.id})">
                <div class="arch-card-top">
                    <div class="arch-file-icon ${cls}">${_emoji(ext)}</div>
                    <div class="arch-card-badges">${expiryBadge}</div>
                    <button class="arch-doc-menu" title="استعراض"
                        onclick="event.stopPropagation();ArchiveModule.openViewer(${f.id})">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    </button>
                </div>
                <div class="arch-doc-name" title="${_e(f.display_name)}">${_e(f.display_name)}</div>
                <div class="arch-doc-meta">
                    <span class="arch-doc-ext">${(ext || '?').toUpperCase()}</span>
                    <span>${f.file_size_formatted || '—'}</span>
                </div>
            </div>`;
        };
        const _listHtml = (f) => `<div class="arch-list-item" data-id="${f.id}" onclick="ArchiveModule.selectFile(${f.id})">
            <div class="li-icon">${_emoji(f.file_extension)}</div>
            <div class="li-info">
                <div class="li-name">${_e(f.display_name)}</div>
                <div class="li-meta">${(f.file_extension || '?').toUpperCase()} • ${f.file_size_formatted || '—'} • ${_fmtDate(f.created_at)}</div>
            </div>
            <div class="li-tags">${_tags(f)}</div>
            <div class="li-actions" onclick="event.stopPropagation()">
                <button class="arch-tbl-action" title="استعراض"
                    onclick="ArchiveModule.openViewer(${f.id})">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                </button>
                <button class="arch-tbl-action" title="تعديل"
                    onclick="ArchiveModule.selectFile(${f.id});ArchiveModule.openEdit()">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <a class="arch-tbl-action" href="${API}?action=download&id=${f.id}" download title="تحميل">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                </a>
            </div>
        </div>`;
        const gridHtml = preview.length
            ? `<div class="arch-doc-grid arch-doc-grid--compact">${preview.map(_cardHtml).join('')}</div>
               <div class="arch-doc-list">${preview.map(_listHtml).join('')}</div>` : '';
        return `
        <div class="arch-group-section">
            <div class="arch-cat-hdr">
                <h3>${label} <span class="arch-badge ${badgeCls}">${files.length} ${tr('ملف')}</span></h3>
                ${hasMore ? `<button class="arch-btn arch-btn-ghost arch-btn--sm" onclick="openArchiveSub('${sub}')">${tr('عرض الكل')} ←</button>` : ''}
            </div>
            ${emptyHtml}${gridHtml}
        </div>`;
    }

    function _renderGrid(files) {
        if (!files.length) return '';
        return `<div class="arch-doc-grid">
            ${files.map((f, i) => {
            const ext = (f.file_extension || '').toLowerCase();
            const cls = _iconCls(ext);
            let expiryBadge = '';
            if (f.expiry_date) {
                const days = Math.ceil((new Date(f.expiry_date) - new Date()) / 86400000);
                if (days < 0) expiryBadge = `<span class="arch-card-badge arch-card-badge--red">منتهية</span>`;
                else if (days <= 30) expiryBadge = `<span class="arch-card-badge arch-card-badge--amber">⏳ ${days} يوم</span>`;
            }
            const srcBadge = f.source_module && f.source_module !== 'archive'
                ? `<span class="arch-card-badge arch-card-badge--blue">${f.source_label || f.source_module}</span>` : '';
            return `<div class="arch-doc-card" style="animation-delay:${i * .03}s" data-id="${f.id}" onclick="ArchiveModule.selectFile(${f.id})">
                    <div class="arch-card-top">
                        <div class="arch-file-icon ${cls}">${_emoji(ext)}</div>
                        <div class="arch-card-badges">${expiryBadge}${srcBadge}</div>
                        <button class="arch-doc-menu" onclick="event.stopPropagation();ArchiveModule.openViewer(${f.id})" title="استعراض">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        </button>
                    </div>
                    <div class="arch-doc-name" title="${_e(f.display_name)}">${_e(f.display_name)}</div>
                    <div class="arch-doc-meta">
                        <span class="arch-doc-ext">${(ext || '?').toUpperCase()}</span>
                        <span>${f.file_size_formatted || '—'}</span>
                        <span>${_fmtDate(f.created_at)}</span>
                    </div>
                </div>`;
        }).join('')}
        </div>`;
    }

    function _renderList(files) {
        if (!files.length) return '';
        return `<div class="arch-doc-list">
            ${files.map(f => {
            const ext = (f.file_extension || '').toLowerCase();
            let expiryHtml = '';
            if (f.expiry_date) {
                const days = Math.ceil((new Date(f.expiry_date) - new Date()) / 86400000);
                if (days < 0) expiryHtml = `<span class="arch-card-badge arch-card-badge--red">منتهية</span>`;
                else if (days <= 30) expiryHtml = `<span class="arch-card-badge arch-card-badge--amber">${days} يوم</span>`;
            }
            return `<div class="arch-list-item" data-id="${f.id}" onclick="ArchiveModule.selectFile(${f.id})">
                <div class="li-icon">${_emoji(ext)}</div>
                <div class="li-info">
                    <div class="li-name">${_e(f.display_name)}</div>
                    <div class="li-meta">${(ext || '?').toUpperCase()} • ${f.file_size_formatted || '—'} • ${_fmtDate(f.created_at)}</div>
                </div>
                <div class="li-tags">${expiryHtml}${_tags(f)}</div>
                <div class="li-actions" onclick="event.stopPropagation()">
                    <button class="arch-tbl-action" onclick="ArchiveModule.openViewer(${f.id})" title="استعراض">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    </button>
                    <a class="arch-tbl-action" href="${API}?action=download&id=${f.id}" download title="تحميل">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    </a>
                </div>
            </div>`;
        }).join('')}
        </div>`;
    }

    function _renderEmpty(msg, hint) {
        const sub = hint || 'جرّب تغيير القسم أو رفع مستند جديد';
        return `<div class="arch-empty-state">
            <div class="aes-art">
                <svg viewBox="0 0 100 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <!-- ظل -->
                    <ellipse cx="50" cy="72" rx="28" ry="5" fill="currentColor" opacity=".08"/>
                    <!-- مجلد خلفي -->
                    <rect x="18" y="28" width="44" height="34" rx="5" fill="currentColor" opacity=".1" stroke="currentColor" stroke-width="1.5" opacity=".2"/>
                    <path d="M18 36 L62 36" stroke="currentColor" stroke-width="1.2" opacity=".15"/>
                    <!-- ورقة 1 (مائلة) -->
                    <rect x="34" y="20" width="28" height="36" rx="4" fill="currentColor" opacity=".08" stroke="currentColor" stroke-width="1.5" stroke-opacity=".2" transform="rotate(-8 48 38)"/>
                    <!-- ورقة رئيسية -->
                    <rect x="30" y="18" width="32" height="42" rx="5" fill="var(--bg-card)" stroke="currentColor" stroke-width="1.8" stroke-opacity=".3"/>
                    <path d="M38 30 L54 30" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity=".25"/>
                    <path d="M38 37 L54 37" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity=".2"/>
                    <path d="M38 44 L48 44" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity=".15"/>
                    <!-- علامة X -->
                    <circle cx="50" cy="54" r="10" fill="var(--bg-secondary)" stroke="currentColor" stroke-width="1.5" stroke-opacity=".3"/>
                    <path d="M46 50 L54 58 M54 50 L46 58" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity=".4"/>
                </svg>
            </div>
            <div class="aes-title">${msg}</div>
            <div class="aes-sub">${sub}</div>
        </div>`;
    }

    /* ══ اختيار ملف → معاينة ════════════════════════════════ */
    function selectFile(id) {
        const file = S.files.find(f => f.id === id);
        if (!file) return;
        S.viewingFile = file;

        document.querySelectorAll('.arch-doc-card,.arch-list-item,.arch-table-row').forEach(c =>
            c.classList.toggle('selected', c.dataset.id == id));

        const ext = (file.file_extension || '').toLowerCase();
        const _s = (elId, val) => { const el = document.getElementById(elId); if (el) el.textContent = val; };
        _s('prev-icon', _emoji(ext));
        _s('prev-type', (ext || '?').toUpperCase());
        _s('prev-name', file.display_name);
        _s('prev-cat', file.category_label || file.category || '—');
        _s('prev-size', file.file_size_formatted || '—');
        _s('prev-date', _fmtDate(file.created_at));
        _s('prev-user', file.uploader_name || '—');

        // معلومة الصلاحية
        const expiryEl = document.getElementById('prev-expiry');
        if (expiryEl) {
            if (file.expiry_date) {
                const days = Math.ceil((new Date(file.expiry_date) - new Date()) / 86400000);
                if (days < 0) expiryEl.innerHTML = `<span style="color:var(--accent-red)">⚠ منتهية منذ ${Math.abs(days)} يوم</span>`;
                else if (days <= 30) expiryEl.innerHTML = `<span style="color:var(--accent-orange)">⏳ ${days} يوم متبقي</span>`;
                else expiryEl.textContent = _fmtDate(file.expiry_date);
            } else {
                expiryEl.textContent = '—';
            }
        }

        const dlBtn = document.getElementById('prev-dl');
        if (dlBtn) { dlBtn.href = `${API}?action=download&id=${file.id}`; dlBtn.download = file.display_name || 'document'; }

        document.getElementById('arch-preview').classList.add('open');
    }

    function closePreview() {
        document.getElementById('arch-preview')?.classList.remove('open');
        document.querySelectorAll('.arch-doc-card,.arch-list-item').forEach(c => c.classList.remove('selected'));
        S.viewingFile = null;
    }

    /* ══ استعراض الملف ══════════════════════════════════════ */
    let _viewerZoom = 100;

    function openViewer(id) {
        // إذا تم تمرير id مباشرة (من onclick في الكروت) نحدّث viewingFile أولاً
        if (id !== undefined) {
            const found = S.files.find(f => f.id == id);
            if (found) S.viewingFile = found;
        }
        const f = S.viewingFile;
        if (!f) return;
        const ext = (f.file_extension || '').toLowerCase();
        const url = `${API}?action=view&id=${f.id}`;
        _viewerZoom = 100;

        const _s = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        _s('vwr-icon', _emoji(ext));
        _s('vwr-title', f.display_name);
        _s('vwr-sub', `${(ext || '?').toUpperCase()} • ${f.file_size_formatted || '—'} • ${_fmtDate(f.created_at)}`);
        _s('vwr-zoom', '100%');
        _s('vwr-ftr-info', `رُفع بواسطة: ${f.uploader_name || '—'} — ${_fmtDate(f.created_at)}`);

        const dlEl = document.getElementById('vwr-dl');
        if (dlEl) { dlEl.href = `${API}?action=download&id=${f.id}`; dlEl.download = f.display_name || 'document'; }

        const body = document.getElementById('vwr-body');
        if (!body) return;

        if (ext === 'pdf') {
            body.innerHTML = `<iframe style="width:100%;height:100%;min-height:520px;border:none" src="${url}"></iframe>`;
        } else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
            body.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;padding:20px;background:var(--bg-surface)">
                <img id="vwr-img" style="max-width:100%;max-height:100%;object-fit:contain;border-radius:8px;border:1px solid var(--border-color)" src="${url}" alt="${_e(f.display_name)}">
            </div>`;
        } else {
            const rows = [
                ['اسم الملف', f.display_name, '—'],
                ['المصدر', f.source_label || f.source_module || '—', f.source_ref || '—'],
                ['التصنيف', f.category_label || f.category || '—', '—'],
                ['الحجم', f.file_size_formatted || '—', '—'],
                ['رُفع بواسطة', f.uploader_name || '—', '—'],
                ['تاريخ الرفع', _fmtDate(f.created_at), '—'],
                ['تاريخ الانتهاء', f.expiry_date ? _fmtDate(f.expiry_date) : '—', f.notes || '—'],
            ];
            body.innerHTML = `
                <div class="arch-mock-doc">
                    <div class="arch-mock-page" id="vwr-page">
                        <div class="arch-watermark">أرشيف</div>
                        <div class="arch-mock-hdr">
                            <div class="arch-mock-co">${_e(f.source_ref || 'النظام')}</div>
                            <div class="arch-mock-stm">✓</div>
                        </div>
                        <div class="arch-mock-title">
                            <h2>${_e(f.display_name)}</h2>
                            <p>${_e(f.category_label || '')} — ${_fmtDate(f.created_at)}</p>
                        </div>
                        <table class="arch-mock-table">
                            <thead><tr><th>البند</th><th>القيمة</th><th>الملاحظات</th></tr></thead>
                            <tbody>${rows.map((r, i) => `<tr ${i === rows.length - 1 ? 'class="total-row"' : ''}>${r.map(c => `<td>${_e(c)}</td>`).join('')}</tr>`).join('')}</tbody>
                        </table>
                        <div class="arch-mock-ftr">
                            <span>نظام الأرشيف المالي</span>
                            <span>${_fmtDate(f.created_at)}</span>
                            <span>سري وخاص</span>
                        </div>
                    </div>
                </div>`;
        }

        const overlay = document.getElementById('arch-viewer-overlay');
        if (!overlay) { console.error('[Archive] arch-viewer-overlay not found'); return; }
        overlay.classList.add('active');
    }

    function _zoom(delta) {
        _viewerZoom = Math.min(200, Math.max(50, _viewerZoom + delta));
        const el = document.getElementById('vwr-zoom');
        if (el) el.textContent = _viewerZoom + '%';
        const page = document.getElementById('vwr-page');
        if (page) page.style.transform = `scale(${_viewerZoom / 100})`;
        const img = document.getElementById('vwr-img');
        if (img) img.style.transform = `scale(${_viewerZoom / 100})`;
    }

    function closeViewer(e) {
        if (e && e.target.id !== 'arch-viewer-overlay') return;
        document.getElementById('arch-viewer-overlay')?.classList.remove('active');
    }

    /* ══ تعديل الملف ════════════════════════════════════════ */
    let _editFile = null;

    function openEdit() {
        const f = S.viewingFile;
        if (!f) return;
        _editFile = null;

        const _s = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
        const _t = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || '—'; };

        _t('aed-file-name', f.display_name);
        _s('aed-f-name', f.display_name);
        _s('aed-f-expiry', f.expiry_date || '');
        _s('aed-f-ref', f.source_ref || '');
        _s('aed-f-notes', f.notes || '');

        const chip = document.getElementById('aed-file-chip');
        const dz = document.getElementById('aed-dropzone');
        if (chip) chip.style.display = 'none';
        if (dz) dz.style.display = '';
        const lbl = document.getElementById('aed-file-label');
        if (lbl) lbl.textContent = 'انقر لاختيار ملف جديد أو اسحبه هنا';
        const inp = document.getElementById('aed-file-inp');
        if (inp) inp.value = '';

        document.getElementById('arch-edit-overlay')?.classList.add('active');
    }

    function closeEdit(e) {
        if (e && e.target.id !== 'arch-edit-overlay') return;
        document.getElementById('arch-edit-overlay')?.classList.remove('active');
        _editFile = null;
    }

    function _clearEditFile() {
        _editFile = null;
        const chip = document.getElementById('aed-file-chip');
        const dz = document.getElementById('aed-dropzone');
        if (chip) chip.style.display = 'none';
        if (dz) dz.style.display = '';
        const inp = document.getElementById('aed-file-inp');
        if (inp) inp.value = '';
    }

    async function submitEdit() {
        const f = S.viewingFile;
        if (!f) return;
        const nameEl = document.getElementById('aed-f-name');
        if (!nameEl || !nameEl.value.trim()) { nameEl?.focus(); return; }

        const btn = document.getElementById('aed-save-btn');
        btn.disabled = true;
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> جارٍ الحفظ…';

        const fd = new FormData();
        fd.append('id', f.id);
        fd.append('display_name', nameEl.value.trim());
        fd.append('expiry_date', document.getElementById('aed-f-expiry')?.value || '');
        fd.append('source_ref', document.getElementById('aed-f-ref')?.value || '');
        fd.append('notes', document.getElementById('aed-f-notes')?.value || '');
        if (_editFile) fd.append('file', _editFile);

        try {
            const r = await fetch(`${API}?action=update`, { method: 'POST', body: fd });
            const d = await r.json();
            if (d.success) {
                document.getElementById('arch-edit-overlay')?.classList.remove('active');
                document.getElementById('arch-viewer-overlay')?.classList.remove('active');
                _editFile = null;
                await loadFiles();
                await loadStats();
                if (typeof showToast === 'function') showToast('تم حفظ التعديلات بنجاح', 'success');
            } else {
                if (typeof showToast === 'function') showToast(d.message || 'فشل الحفظ', 'error');
                else alert(d.message || 'فشل الحفظ');
            }
        } catch (e) {
            if (typeof showToast === 'function') showToast('خطأ في الاتصال بالخادم', 'error');
            else alert('خطأ في الاتصال');
        }
        finally {
            btn.disabled = false;
            btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> حفظ التعديلات';
        }
    }

    /* ══ تبديل القسم ════════════════════════════════════════ */
    function switchSub(key) {
        S.sub = key;
        closePreview();
        _syncSidebarActive();
        _renderContent();
    }

    /* ══ وضع العرض ══════════════════════════════════════════ */
    /* ══ تبويب فرعي ════════════════════════════════════════ */
    function setSubTab(key) {
        S.activeSub = key;
        const c = document.getElementById('arch-section-content');
        if (!c) return;
        let html = _renderSubTabs();
        const files = _applySortToFiles(_filterFilesBySub());
        if (S.search || S.extFilter) {
            html += _renderSearchResults(files);
        } else {
            html += _renderViewMode(files);
            if (!files.length) html += _renderEmpty('لا توجد مستندات في هذا القسم');
        }
        c.innerHTML = html;
    }

    /* ══ البحث ══════════════════════════════════════════════ */
    let _searchTimeout = null;
    function toggleSearch() {
        const inp = document.getElementById('arch-search-input');
        if (inp) inp.focus();
    }

    function onSearch(val) {
        S.search = val.trim();
        const clearBtn = document.getElementById('asp-clear');
        if (clearBtn) clearBtn.style.display = val ? 'flex' : 'none';
        clearTimeout(_searchTimeout);
        _searchTimeout = setTimeout(() => _renderContent(), 220);
    }

    function clearSearch() {
        S.search = '';
        S.extFilter = '';
        const inp = document.getElementById('arch-search-input');
        if (inp) inp.value = '';
        const clearBtn = document.getElementById('asp-clear');
        if (clearBtn) clearBtn.style.display = 'none';
        document.querySelectorAll('.arch-ext-btn').forEach(b =>
            b.classList.toggle('active', b.dataset.ext === '')
        );
        _renderContent();
    }

    function setExtFilter(ext, btn) {
        S.extFilter = ext;
        document.querySelectorAll('.arch-ext-btn').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');
        _renderContent();
    }

    function setSort(val) {
        S.sort = val;
        _renderContent();
    }

    function _applySortToFiles(files) {
        const sort = S.sort || 'date_desc';
        return [...files].sort((a, b) => {
            if (sort === 'date_desc') return new Date(b.created_at) - new Date(a.created_at);
            if (sort === 'date_asc') return new Date(a.created_at) - new Date(b.created_at);
            if (sort === 'name_asc') return (a.display_name || '').localeCompare(b.display_name || '');
            if (sort === 'expiry_asc') {
                const da = a.expiry_date ? new Date(a.expiry_date) : new Date('9999');
                const db = b.expiry_date ? new Date(b.expiry_date) : new Date('9999');
                return da - db;
            }
            return 0;
        });
    }

    function setView(mode) {
        S.viewMode = mode;
        ['grid', 'list', 'table'].forEach(m => {
            document.getElementById(`vt-${m}`)?.classList.toggle('active', m === mode);
        });
        // تحكم CSS في حالة overview (تعرض grid+list معاً)
        document.body.classList.toggle('arch-list-view', mode === 'list');
        document.body.classList.toggle('arch-table-view', mode === 'table');
        // إعادة رسم فقط إذا table (overview لا تدعمه)
        if (mode === 'table' || S.sub !== 'all') _renderContent();
    }

    function _renderTable(files) {
        if (!files.length) return '';
        return `<div class="arch-table-wrap">
        <table class="arch-table">
            <thead>
                <tr>
                    <th>المستند</th>
                    <th>النوع</th>
                    <th>المصدر</th>
                    <th>${tr('الحجم')}</th>
                    <th>${tr('تاريخ الرفع')}</th>
                    <th>${tr('الصلاحية')}</th>
                    <th>الحالة</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
                ${files.map(f => {
            const ext = (f.file_extension || '').toUpperCase();
            let expiryHtml = '—';
            if (f.expiry_date) {
                const days = Math.ceil((new Date(f.expiry_date) - new Date()) / 86400000);
                if (days < 0) expiryHtml = `<span class="arch-tbl-badge arch-tbl-badge--red">منتهية</span>`;
                else if (days <= 30) expiryHtml = `<span class="arch-tbl-badge arch-tbl-badge--amber">${days} يوم</span>`;
                else expiryHtml = `<span style="font-size:12px;color:var(--text-muted)">${_fmtDate(f.expiry_date)}</span>`;
            }
            const statusDot = f.expiry_date && Math.ceil((new Date(f.expiry_date) - new Date()) / 86400000) < 0
                ? '<span class="arch-tbl-dot arch-tbl-dot--red"></span> منتهية'
                : '<span class="arch-tbl-dot arch-tbl-dot--green"></span> نشط';
            return `<tr class="arch-table-row" data-id="${f.id}" onclick="ArchiveModule.selectFile(${f.id})">
                        <td>
                            <div class="arch-tbl-name">${_emoji(f.file_extension)} ${_e(f.display_name)}</div>
                            <div class="arch-tbl-sub">${f.uploader_name || '—'}</div>
                        </td>
                        <td><span class="arch-tbl-badge arch-tbl-badge--gray">${ext}</span></td>
                        <td><span class="arch-tbl-badge arch-tbl-badge--blue">${f.source_label || f.source_module || 'أرشيف'}</span></td>
                        <td style="font-size:12px;color:var(--text-muted)">${f.file_size_formatted || '—'}</td>
                        <td style="font-size:12px;color:var(--text-muted)">${_fmtDate(f.created_at)}</td>
                        <td>${expiryHtml}</td>
                        <td style="font-size:12px">${statusDot}</td>
                        <td onclick="event.stopPropagation()">
                            <div style="display:flex;gap:4px">
                                <button class="arch-tbl-action" onclick="ArchiveModule.openViewer(${f.id})" title="استعراض">
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                </button>
                                <a class="arch-tbl-action" href="${API}?action=download&id=${f.id}" download title="تحميل">
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                                </a>
                            </div>
                        </td>
                    </tr>`;
        }).join('')}
            </tbody>
        </table>
        </div>`;
    }

    /* ══ رفع مستندات متعددة ════════════════════════════════ */
    let _uploadFiles = []; // [{file, name, cat, expiry}]

    function openUpload() {
        _uploadFiles = [];
        _renderFileList();
        document.getElementById('aum-upload-btn').disabled = true;
        document.getElementById('aum-common-fields').style.display = 'none';
        document.getElementById('aum-ftr-info').textContent = '—';
        document.getElementById('aum-count-label').textContent = 'اختر الملفات المراد رفعها';
        document.getElementById('arch-upload-overlay')?.classList.add('active');
    }

    function closeUpload(e) {
        if (e && e.target.id !== 'arch-upload-overlay') return;
        document.getElementById('arch-upload-overlay')?.classList.remove('active');
        _uploadFiles = [];
        const fi = document.getElementById('aum-file-inp');
        if (fi) fi.value = '';
    }

    function _onFilesSelected(fileList) {
        Array.from(fileList).forEach(f => {
            if (_uploadFiles.length >= 20) return; // حد أقصى 20 ملف
            _uploadFiles.push({ file: f, name: f.name.replace(/\.[^.]+$/, ''), cat: 'أخرى', expiry: '' });
        });
        _renderFileList();
        const btn = document.getElementById('aum-upload-btn');
        if (btn) btn.disabled = _uploadFiles.length === 0;
        const cf = document.getElementById('aum-common-fields');
        if (cf) cf.style.display = _uploadFiles.length > 1 ? 'block' : 'none';
        const lbl = document.getElementById('aum-count-label');
        if (lbl) lbl.textContent = _uploadFiles.length > 0 ? `${_uploadFiles.length} ملف مختار` : 'اختر الملفات المراد رفعها';
        const info = document.getElementById('aum-ftr-info');
        if (info) {
            const total = _uploadFiles.reduce((s, f) => s + f.file.size, 0);
            info.textContent = _uploadFiles.length > 0 ? `${_uploadFiles.length} ملف — ${_fmt(total)}` : '—';
        }
    }

    function _renderFileList() {
        const el = document.getElementById('aum-file-list');
        if (!el) return;
        if (!_uploadFiles.length) { el.innerHTML = ''; return; }
        el.innerHTML = _uploadFiles.map((item, i) => `
            <div class="aum-file-item" id="aum-fi-${i}">
                <div class="aum-fi-icon">${_emoji(item.file.name.split('.').pop())}</div>
                <div class="aum-fi-info">
                    <input class="aum-fi-name" value="${item.name}" oninput="_uploadFiles[${i}].name=this.value" placeholder="اسم الملف">
                    <div class="aum-fi-meta">${item.file.name} • ${_fmt(item.file.size)}</div>
                </div>
                <select class="aum-fi-cat" onchange="_uploadFiles[${i}].cat=this.value">
                    ${['عقد_اتفاقية', 'معاملة_مالية', 'موازنة_تخطيط', 'وثيقة_حكومية', 'سجل_تجاري', 'إيداع_بنكي', 'خطاب_مراسلة', 'أخرى']
                .map(c => `<option value="${c}" ${item.cat === c ? 'selected' : ''}>${c.replace('_', ' ')}</option>`).join('')}
                </select>
                <button class="aum-fi-del" onclick="_uploadFiles.splice(${i},1);_renderFileList();_onFilesSelected([])">✕</button>
            </div>`).join('');
    }

    async function submitMultiUpload() {
        if (!_uploadFiles.length) return;

        // تطبيق الإعدادات المشتركة
        const globalCat = document.getElementById('aum-cat-global')?.value;
        const globalExpiry = document.getElementById('aum-expiry-global')?.value;
        if (globalCat) _uploadFiles.forEach(f => f.cat = globalCat);
        if (globalExpiry) _uploadFiles.forEach(f => f.expiry = globalExpiry);

        // إغلاق مودال الاختيار وفتح مودال التقدم
        document.getElementById('arch-upload-overlay').classList.remove('active');
        document.getElementById('aum-progress-overlay').classList.add('active');

        const list = document.getElementById('aum-prog-list');
        const title = document.getElementById('aum-prog-title');
        const progIcon = document.getElementById('aum-prog-icon');

        // بناء قائمة الملفات في مودال التقدم
        list.innerHTML = _uploadFiles.map((item, i) => `
            <div class="aum-prog-item" id="aum-pi-${i}">
                <div class="aum-pi-icon">${_emoji(item.file.name.split('.').pop())}</div>
                <div class="aum-pi-info">
                    <div class="aum-pi-name">${item.name}</div>
                    <div class="aum-pi-bar-wrap"><div class="aum-pi-bar" id="aum-bar-${i}"></div></div>
                </div>
                <div class="aum-pi-status" id="aum-st-${i}">⏳</div>
            </div>`).join('');

        let done = 0, failed = 0;
        const total = _uploadFiles.length;
        const DELAY = 600; // ms بين كل ملف والآخر

        for (let i = 0; i < total; i++) {
            const item = _uploadFiles[i];
            const bar = document.getElementById(`aum-bar-${i}`);
            const st = document.getElementById(`aum-st-${i}`);
            const pi = document.getElementById(`aum-pi-${i}`);

            title.textContent = `جارٍ رفع الملف ${i + 1} من ${total}…`;

            // تحريك شريط التقدم للبدء
            if (bar) { bar.style.width = '0%'; bar.style.background = 'var(--accent-blue)'; }
            if (pi) pi.classList.add('aum-pi--active');

            // محاكاة تقدم (50% قبل الإرسال)
            await _animateBar(bar, 0, 50, 300);

            try {
                const fd = new FormData();
                fd.append('file', item.file);
                fd.append('display_name', item.name);
                fd.append('category', item.cat);
                fd.append('expiry_date', item.expiry || '');

                const r = await fetch(`${API}?action=upload`, { method: 'POST', body: fd });
                const d = await r.json();

                await _animateBar(bar, 50, 100, 250);

                if (d.success) {
                    done++;
                    if (bar) bar.style.background = 'var(--accent-green)';
                    if (st) st.textContent = '✓';
                    if (pi) { pi.classList.remove('aum-pi--active'); pi.classList.add('aum-pi--done'); }
                } else {
                    failed++;
                    if (bar) bar.style.background = 'var(--accent-red)';
                    if (st) st.innerHTML = '<span title="' + (d.message || 'فشل') + '">✗</span>';
                    if (pi) { pi.classList.remove('aum-pi--active'); pi.classList.add('aum-pi--fail'); }
                }
            } catch (e) {
                failed++;
                await _animateBar(bar, 50, 100, 200);
                if (bar) bar.style.background = 'var(--accent-red)';
                if (st) st.textContent = '✗';
                if (pi) { pi.classList.remove('aum-pi--active'); pi.classList.add('aum-pi--fail'); }
            }

            // فاصل زمني بين الملفات (إلا الأخير)
            if (i < total - 1) await new Promise(r => setTimeout(r, DELAY));
        }

        // اكتمل
        title.textContent = failed === 0
            ? `✓ تم رفع جميع الملفات (${done})`
            : `اكتمل الرفع — ${done} ناجح، ${failed} فاشل`;
        progIcon.textContent = failed === 0 ? '✅' : '⚠️';

        const closeBtn = document.getElementById('aum-prog-close-btn');
        if (closeBtn) closeBtn.style.display = 'inline-flex';

        await loadFiles();
        await loadStats();
    }

    function _animateBar(bar, from, to, ms) {
        return new Promise(res => {
            if (!bar) { setTimeout(res, ms); return; }
            const steps = 20, interval = ms / steps, step = (to - from) / steps;
            let cur = from, t = setInterval(() => {
                cur += step;
                bar.style.width = Math.min(to, cur) + '%';
                if (cur >= to) { clearInterval(t); res(); }
            }, interval);
        });
    }

    function closeProgressModal() {
        document.getElementById('aum-progress-overlay')?.classList.remove('active');
        _uploadFiles = [];
    }

    /* ══ إضافة وثيقة (حقول ديناميكية) ═════════════════════ */
    const ADD_FIELDS = {
        // ── contract ─────────────────────────────────────
        'عقد_اتفاقية': [
            { id: 'aad-f-name', label: 'اسم العقد *', type: 'text', ph: 'مثال: عقد صيانة المبنى' },
            { id: 'aad-f-party', label: 'الطرف الآخر', type: 'text', ph: 'اسم الشركة أو الجهة' },
            { id: 'aad-f-value', label: 'قيمة العقد (ريال)', type: 'number', ph: '0' },
            { id: 'aad-f-start', label: 'تاريخ البداية', type: 'date' },
            { id: 'aad-f-expiry', label: 'تاريخ الانتهاء', type: 'date' },
            { id: 'aad-f-notes', label: 'ملاحظات', type: 'textarea', ph: 'أي تفاصيل إضافية' },
        ],
        'وثيقة_حكومية': [
            { id: 'aad-f-name', label: 'اسم الوثيقة *', type: 'text', ph: 'مثال: رخصة البلدية' },
            { id: 'aad-f-issuer', label: 'الجهة المصدِرة', type: 'text', ph: 'مثال: وزارة التجارة' },
            { id: 'aad-f-num', label: 'رقم الوثيقة', type: 'text', ph: 'أدخل الرقم المرجعي' },
            { id: 'aad-f-issue', label: 'تاريخ الإصدار', type: 'date' },
            { id: 'aad-f-expiry', label: 'تاريخ الانتهاء', type: 'date' },
        ],
        'سجل_تجاري': [
            { id: 'aad-f-name', label: 'اسم السجل *', type: 'text', ph: 'مثال: سجل تجاري للشركة' },
            { id: 'aad-f-num', label: 'رقم السجل', type: 'text', ph: 'أدخل رقم السجل' },
            { id: 'aad-f-issue', label: 'تاريخ الإصدار', type: 'date' },
            { id: 'aad-f-expiry', label: 'تاريخ الانتهاء', type: 'date' },
            { id: 'aad-f-activity', label: 'النشاط التجاري', type: 'text', ph: 'مثال: مقاولات إنشائية' },
        ],
        'تعميد_تفويض': [
            { id: 'aad-f-name', label: 'عنوان التعميد *', type: 'text', ph: 'مثال: تفويض صرف مستحقات' },
            { id: 'aad-f-party', label: 'المفوَّض إليه', type: 'text', ph: 'اسم الشخص أو الجهة' },
            { id: 'aad-f-scope', label: 'نطاق الصلاحية', type: 'text', ph: 'مثال: توقيع عقود بحد أقصى 500k' },
            { id: 'aad-f-issue', label: 'تاريخ التعميد', type: 'date' },
            { id: 'aad-f-expiry', label: 'تاريخ الانتهاء', type: 'date' },
        ],
        'معاملة_مالية': [
            { id: 'aad-f-name', label: 'وصف المعاملة *', type: 'text', ph: 'مثال: فاتورة مورد' },
            { id: 'aad-f-ref', label: 'رقم المرجع', type: 'text', ph: 'رقم الفاتورة أو الأمر' },
            { id: 'aad-f-value', label: 'المبلغ (ريال)', type: 'number', ph: '0' },
            { id: 'aad-f-date', label: 'التاريخ', type: 'date' },
        ],
        'إيداع_بنكي': [
            { id: 'aad-f-name', label: 'وصف الإيداع *', type: 'text', ph: 'مثال: إيداع شهر مارس' },
            { id: 'aad-f-bank', label: 'اسم البنك', type: 'text', ph: 'مثال: البنك الأهلي' },
            { id: 'aad-f-value', label: 'المبلغ (ريال)', type: 'number', ph: '0' },
            { id: 'aad-f-date', label: 'تاريخ الإيداع', type: 'date' },
            { id: 'aad-f-ref', label: 'رقم الإيداع', type: 'text', ph: 'أدخل رقم الحوالة' },
        ],
        'خطاب_مراسلة': [
            { id: 'aad-f-name', label: 'عنوان الخطاب *', type: 'text', ph: 'مثال: خطاب طلب توريد' },
            { id: 'aad-f-party', label: 'الجهة المرسَل إليها', type: 'text', ph: 'اسم الجهة أو الشخص' },
            { id: 'aad-f-ref', label: 'رقم الخطاب', type: 'text', ph: 'أدخل رقم المرجع' },
            { id: 'aad-f-date', label: 'التاريخ', type: 'date' },
        ],
        // ── invoice ──────────────────────────────────────
        'فاتورة_مدفوعات': [
            { id: 'aad-f-name', label: 'وصف الفاتورة *', type: 'text', ph: 'مثال: فاتورة مورد مواد' },
            { id: 'aad-f-ref', label: 'رقم الفاتورة', type: 'text', ph: 'أدخل رقم الفاتورة' },
            { id: 'aad-f-party', label: 'المورد / الجهة', type: 'text', ph: 'اسم المورد أو الجهة' },
            { id: 'aad-f-value', label: 'المبلغ (ريال)', type: 'number', ph: '0' },
            { id: 'aad-f-date', label: 'تاريخ الفاتورة', type: 'date' },
            { id: 'aad-f-expiry', label: 'تاريخ الاستحقاق', type: 'date' },
        ],
        // ── report ───────────────────────────────────────
        'تقرير_مالي': [
            { id: 'aad-f-name', label: 'عنوان التقرير *', type: 'text', ph: 'مثال: تقرير الربع الثالث' },
            { id: 'aad-f-period', label: 'الفترة المالية', type: 'text', ph: 'مثال: Q3 2024' },
            { id: 'aad-f-date', label: 'تاريخ التقرير', type: 'date' },
            { id: 'aad-f-notes', label: 'ملاحظات', type: 'textarea', ph: 'ملخص أو أبرز النقاط' },
        ],
        // ── tax ──────────────────────────────────────────
        'ضريبة_زكاة': [
            { id: 'aad-f-name', label: 'نوع الإقرار *', type: 'text', ph: 'مثال: إقرار ضريبة القيمة المضافة' },
            { id: 'aad-f-period', label: 'الفترة الضريبية', type: 'text', ph: 'مثال: Q1 2024' },
            { id: 'aad-f-value', label: 'المبلغ (ريال)', type: 'number', ph: '0' },
            { id: 'aad-f-date', label: 'تاريخ التقديم', type: 'date' },
            { id: 'aad-f-expiry', label: 'الموعد النهائي', type: 'date' },
        ],
        // ── bank ─────────────────────────────────────────
        'مستند_بنكي': [
            { id: 'aad-f-name', label: 'وصف المستند *', type: 'text', ph: 'مثال: كشف حساب شهري' },
            { id: 'aad-f-bank', label: 'اسم البنك', type: 'text', ph: 'مثال: البنك الأهلي' },
            { id: 'aad-f-ref', label: 'رقم المرجع', type: 'text', ph: 'رقم الحساب أو الحوالة' },
            { id: 'aad-f-value', label: 'المبلغ (ريال)', type: 'number', ph: '0' },
            { id: 'aad-f-date', label: 'التاريخ', type: 'date' },
        ],
        // ── invoice_sales ─────────────────────────────────
        'فاتورة_مبيعات': [
            { id: 'aad-f-name', label: 'وصف الفاتورة *', type: 'text', ph: 'مثال: فاتورة بيع خدمات' },
            { id: 'aad-f-ref', label: 'رقم الفاتورة', type: 'text', ph: 'أدخل رقم الفاتورة' },
            { id: 'aad-f-party', label: 'اسم العميل', type: 'text', ph: 'اسم العميل أو الجهة' },
            { id: 'aad-f-value', label: 'المبلغ (ريال)', type: 'number', ph: '0' },
            { id: 'aad-f-date', label: 'تاريخ الفاتورة', type: 'date' },
            { id: 'aad-f-expiry', label: 'تاريخ الاستحقاق', type: 'date' },
        ],
        // ── invoice_supplier ──────────────────────────────
        'فاتورة_موردين': [
            { id: 'aad-f-name', label: 'وصف الفاتورة *', type: 'text', ph: 'مثال: فاتورة مورد مواد' },
            { id: 'aad-f-ref', label: 'رقم الفاتورة', type: 'text', ph: 'أدخل رقم الفاتورة' },
            { id: 'aad-f-party', label: 'اسم المورد', type: 'text', ph: 'اسم المورد أو الشركة' },
            { id: 'aad-f-value', label: 'المبلغ (ريال)', type: 'number', ph: '0' },
            { id: 'aad-f-date', label: 'تاريخ الفاتورة', type: 'date' },
            { id: 'aad-f-expiry', label: 'تاريخ الاستحقاق', type: 'date' },
        ],
        // ── journal ───────────────────────────────────────
        'قيد_يومي': [
            { id: 'aad-f-name', label: 'وصف القيد *', type: 'text', ph: 'مثال: قيد استلام دفعة' },
            { id: 'aad-f-ref', label: 'رقم القيد', type: 'text', ph: 'أدخل رقم القيد' },
            { id: 'aad-f-debit', label: 'المدين (ريال)', type: 'number', ph: '0' },
            { id: 'aad-f-credit', label: 'الدائن (ريال)', type: 'number', ph: '0' },
            { id: 'aad-f-date', label: 'التاريخ', type: 'date' },
            { id: 'aad-f-notes', label: 'البيان', type: 'textarea', ph: 'وصف العملية المحاسبية' },
        ],
        // ── budget ────────────────────────────────────────
        'موازنة_تخطيط': [
            { id: 'aad-f-name', label: 'عنوان الموازنة *', type: 'text', ph: 'مثال: موازنة 2025' },
            { id: 'aad-f-period', label: 'السنة المالية', type: 'text', ph: 'مثال: 2025' },
            { id: 'aad-f-value', label: 'إجمالي الموازنة', type: 'number', ph: '0' },
            { id: 'aad-f-date', label: 'تاريخ الاعتماد', type: 'date' },
            { id: 'aad-f-notes', label: 'ملاحظات', type: 'textarea', ph: 'أبرز بنود الموازنة' },
        ],
        // ── other ────────────────────────────────────────
        'أخرى': [
            { id: 'aad-f-name', label: 'اسم المستند *', type: 'text', ph: 'أدخل اسماً وصفياً' },
            { id: 'aad-f-notes', label: 'ملاحظات', type: 'textarea', ph: 'أي تفاصيل إضافية' },
            { id: 'aad-f-expiry', label: 'تاريخ الانتهاء', type: 'date' },
        ],
    };

    let _addType = 'عقد_اتفاقية';
    let _addFile = null;
    let _addStep = 1;

    const TYPE_META = {
        'عقد_اتفاقية': { icon: '📜', name: 'عقد / اتفاقية' },
        'تعميد_تفويض': { icon: '✍️', name: 'تعميد / تفويض' },
        'خطاب_مراسلة': { icon: '✉️', name: 'خطاب / مراسلة' },
        'فاتورة_مبيعات': { icon: '🧾', name: 'فاتورة مبيعات' },
        'فاتورة_موردين': { icon: '🛒', name: 'فاتورة موردين' },
        'قيد_يومي': { icon: '📒', name: 'قيد يومي' },
        'مستند_بنكي': { icon: '🏦', name: 'مستند بنكي' },
        'ضريبة_زكاة': { icon: '🏛️', name: 'ضريبة / زكاة' },
        'تقرير_مالي': { icon: '📊', name: 'تقرير مالي' },
        'موازنة_تخطيط': { icon: '📈', name: 'موازنة / تخطيط' },
        'وثيقة_حكومية': { icon: '🏛️', name: 'وثيقة حكومية' },
        'سجل_تجاري': { icon: '🏢', name: 'سجل تجاري' },
        'أخرى': { icon: '📁', name: 'أخرى' },
    };

    function openAdd() {
        _addType = 'عقد_اتفاقية';
        _addFile = null;
        _addStep = 1;
        _renderAddFields();
        _clearFile();
        _applyStep(1);
        document.getElementById('arch-add-overlay')?.classList.add('active');
    }

    function closeAdd(e) {
        if (e && e.target.id !== 'arch-add-overlay') return;
        document.getElementById('arch-add-overlay')?.classList.remove('active');
        _addFile = null;
    }

    function _goStep(step) {
        if (step === 2) {
            _renderAddFields();
            const meta = TYPE_META[_addType] || { icon: '📁', name: _addType };
            const ic = document.getElementById('aad-selected-type-icon');
            const nm = document.getElementById('aad-selected-type-name');
            if (ic) ic.textContent = meta.icon;
            if (nm) nm.textContent = meta.name;
        }
        _addStep = step;
        _applyStep(step);
    }

    function _applyStep(step) {
        [1, 2, 3].forEach(s => {
            const panel = document.getElementById(`aad-panel-${s}`);
            const ind = document.getElementById(`aad-step-ind-${s}`);
            if (panel) panel.style.display = s === step ? '' : 'none';
            if (ind) {
                ind.classList.toggle('active', s === step);
                ind.classList.toggle('done', s < step);
            }
        });
        const btnBack = document.getElementById('aad-btn-back');
        const btnNext = document.getElementById('aad-btn-next');
        const btnSave = document.getElementById('aad-save-btn');
        if (btnBack) btnBack.style.display = step > 1 ? '' : 'none';
        if (btnNext) {
            btnNext.style.display = step < 3 ? '' : 'none';
            btnNext.onclick = step === 1
                ? () => ArchiveModule._goStep(2)
                : () => ArchiveModule._goStep(3);
            btnNext.innerHTML = step === 2
                ? 'التالي <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>'
                : 'التالي <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>';
            if (btnBack) btnBack.onclick = step === 2
                ? () => ArchiveModule._goStep(1)
                : () => ArchiveModule._goStep(2);
        }
        if (btnSave) btnSave.style.display = step === 3 ? '' : 'none';
    }

    function _setAddType(type, btn) {
        _addType = type;
        document.querySelectorAll('.aad-type-card').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');
    }

    function _renderAddFields() {
        const el = document.getElementById('aad-fields');
        if (!el) return;
        const fields = ADD_FIELDS[_addType] || ADD_FIELDS['أخرى'];
        el.innerHTML = `<div class="aad-fields-grid">${fields.map(f => `
            <div class="aad-field ${f.type === 'textarea' ? 'aad-field--wide' : ''}">
                <label class="aad-field-label">${f.label}</label>
                ${f.type === 'textarea'
                ? `<textarea id="${f.id}" class="aad-field-input" placeholder="${f.ph || ''}" rows="3"></textarea>`
                : `<input type="${f.type}" id="${f.id}" class="aad-field-input" placeholder="${f.ph || ''}">`
            }
            </div>`).join('')}</div>`;
    }

    function _clearFile() {
        _addFile = null;
        const dz = document.getElementById('aad-dropzone');
        const sel = document.getElementById('aad-file-selected');
        if (dz) dz.style.display = '';
        if (sel) sel.style.display = 'none';
        const inp = document.getElementById('aad-file-inp');
        if (inp) inp.value = '';
    }

    async function submitAdd() {
        const nameEl = document.getElementById('aad-f-name');
        if (!nameEl || !nameEl.value.trim()) { nameEl?.focus(); return; }

        const btn = document.getElementById('aad-save-btn');
        btn.disabled = true;
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> جارٍ الحفظ…';

        const fd = new FormData();
        fd.append('display_name', nameEl.value.trim());
        fd.append('category', _addType);

        const fields = ADD_FIELDS[_addType] || [];
        fields.forEach(f => {
            const el = document.getElementById(f.id);
            if (el && el.value) fd.append(f.id.replace('aad-f-', ''), el.value);
        });

        if (_addFile) fd.append('file', _addFile);

        try {
            const r = await fetch(`${API}?action=upload`, { method: 'POST', body: fd });
            const d = await r.json();
            if (d.success) {
                document.getElementById('arch-add-overlay')?.classList.remove('active');
                _addFile = null;
                await loadFiles();
                await loadStats();
            } else {
                alert(d.message || 'فشل الحفظ');
            }
        } catch (e) { alert('خطأ في الاتصال'); }
        finally {
            btn.disabled = false;
            btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> حفظ الوثيقة';
        }
    }

    function _onAddFileSelected(file) {
        _addFile = file;
        const dz = document.getElementById('aad-dropzone');
        const sel = document.getElementById('aad-file-selected');
        const nm = document.getElementById('aad-file-selected-name');
        const sz = document.getElementById('aad-file-selected-size');
        if (dz) dz.style.display = 'none';
        if (sel) sel.style.display = 'flex';
        if (nm) nm.textContent = file.name;
        if (sz) sz.textContent = _fmtBytes(file.size);
    }

    /* ══ مساعدات ════════════════════════════════════════════ */
    function _tags(f) {
        let h = '';
        // بادج المصدر — من وين جاء الملف
        const srcMap = {
            transactions: { label: 'معاملة مالية', cls: 'tag-gold' },
            correspondence: { label: 'خطاب', cls: 'tag-blue' },
            bank: { label: 'بنكي', cls: 'tag-teal' },
            budget: { label: 'موازنة', cls: 'tag-purple' },
            archive: { label: 'أرشيف', cls: 'tag-muted' },
        };
        const src = srcMap[f.source_module];
        if (src) h += `<span class="arch-tag ${src.cls}">${src.label}</span>`;
        // بادج الصلاحية
        if (f.has_expiry && f.expiry_date) {
            const d = Math.ceil((new Date(f.expiry_date) - new Date()) / 86400000);
            if (d < 0) h += `<span class="arch-tag tag-red">منتهية</span>`;
            else if (d <= 30) h += `<span class="arch-tag tag-orange">⚠ ${d} يوم</span>`;
        }
        return h;
    }
    function _emoji(ext) {
        return { pdf: '📄', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊', csv: '📊', jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', txt: '📃', zip: '🗜️' }[(ext || '').toLowerCase()] || '📄';
    }
    function _emojiMime(m) {
        if (m.includes('pdf')) return '📄'; if (m.includes('image')) return '🖼️'; if (m.includes('word')) return '📝';
        if (m.includes('sheet') || m.includes('excel')) return '📊'; return '📄';
    }
    function _iconCls(ext) {
        return { pdf: 'file-pdf', doc: 'file-doc', docx: 'file-doc', xls: 'file-xls', xlsx: 'file-xls', csv: 'file-xls', jpg: 'file-img', jpeg: 'file-img', png: 'file-img', gif: 'file-img' }[(ext || '').toLowerCase()] || 'file-pdf';
    }
    function _fmtDate(d) {
        if (!d) return '—'; try { return new Date(d).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return d; }
    }
    function _fmtBytes(b) {
        if (!b) return '0 ب'; const u = ['ب', 'ك', 'م', 'ج'], i = Math.min(3, Math.floor(Math.log(b) / Math.log(1024)));
        return (b / Math.pow(1024, i)).toFixed(1) + ' ' + u[i];
    }
    function _e(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    return { init, switchSub, setView, setSort, setSubTab, _setRenewalTab, toggleSearch, onSearch, clearSearch, setExtFilter, selectFile, openViewer, closeViewer, _zoom, openEdit, closeEdit, _clearEditFile, submitEdit, closePreview, openUpload, closeUpload, submitMultiUpload, closeProgressModal, openAdd, closeAdd, _setAddType, _goStep, _clearFile, _onAddFileSelected, submitAdd, loadFiles, loadStats };
})();