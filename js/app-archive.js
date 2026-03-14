/**
 * app-archive.js — الأرشيف المالي
 * تصميم مطابق لـ financial-archive.html
 */
'use strict';

/* ── openArchiveSub: تُستدعى من السايدبار ─────────────── */
window.openArchiveSub = function (sub) {
    // تحديث الأزرار النشطة في السايدبار
    document.querySelectorAll('#nav-children-archive .nav-child-btn').forEach(b => b.classList.remove('active'));
    const btns = document.querySelectorAll('#nav-children-archive .nav-child-btn');
    const subIndex = ['all', 'operational', 'financial', 'reports', 'official', 'renewals'];
    const idx = subIndex.indexOf(sub);
    if (btns[idx]) btns[idx].classList.add('active');

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
        all: { label: 'جميع المستندات', crumb: 'الكل', icon: '📂' },
        operational: { label: 'مستندات تشغيلية', crumb: 'تشغيلية', icon: '📋' },
        financial: { label: 'مستندات مالية', crumb: 'مالية', icon: '💰' },
        reports: { label: 'تقارير وموازنة', crumb: 'تقارير', icon: '📊' },
        official: { label: 'وثائق رسمية', crumb: 'رسمية', icon: '🏛️' },
        renewals: { label: 'التجديد والصلاحيات', crumb: 'الصلاحيات', icon: '🔄' },
    };

    /* التصنيفات الفرعية لكل قسم */
    const SUB_TABS = {
        operational: [
            { key: 'all_op', label: 'الكل' },
            { key: 'contract', label: 'العقود والاتفاقيات' },
            { key: 'mandate', label: 'التعميدات والتفويضات' },
            { key: 'letter', label: 'الخطابات والمراسلات' },
        ],
        financial: [
            { key: 'all_fin', label: 'الكل' },
            { key: 'invoice_sales', label: 'فواتير مبيعات' },
            { key: 'invoice_supplier', label: 'فواتير موردين' },
            { key: 'journal', label: 'قيود يومية' },
            { key: 'bank', label: 'مستندات بنكية' },
            { key: 'tax', label: 'ضرائب وزكاة' },
        ],
        reports: [
            { key: 'all_rep', label: 'الكل' },
            { key: 'report', label: 'تقارير مالية' },
            { key: 'budget', label: 'موازنة وتخطيط' },
        ],
        official: [
            { key: 'all_off', label: 'الكل' },
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

            <!-- شريط العنوان -->
            <div class="arch-topbar">
                <div class="arch-topbar-left">
                    <h2 id="arch-title">${SUBS[S.sub]?.label || 'الأرشيف المالي'}</h2>
                    <div class="arch-breadcrumb">
                        <span>الأرشيف</span><span class="sep">›</span>
                        <span class="cur" id="arch-crumb">${SUBS[S.sub]?.crumb || 'الكل'}</span>
                    </div>
                </div>
                <div class="arch-topbar-right">
                    <!-- شريط البحث -->
                    <div class="arch-search-wrap" id="arch-search-wrap">
                        <button class="arch-search-toggle" id="arch-search-toggle" onclick="ArchiveModule.toggleSearch()" title="بحث">
                            <svg viewBox="0 0 20 20" fill="none"><circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" stroke-width="1.8"/><path d="M13 13 L17 17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
                        </button>
                        <div class="arch-search-panel" id="arch-search-panel">
                            <svg class="asp-icon" viewBox="0 0 20 20" fill="none"><circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" stroke-width="1.8"/><path d="M13 13 L17 17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
                            <input class="asp-input" id="arch-search-input" type="text" placeholder="ابحث باسم الملف أو التصنيف أو المصدر…"
                                oninput="ArchiveModule.onSearch(this.value)"
                                onkeydown="if(event.key==='Escape')ArchiveModule.toggleSearch()">
                            <button class="asp-clear" id="asp-clear" onclick="ArchiveModule.clearSearch()" style="display:none">✕</button>
                            <div class="asp-filters" id="asp-filters">
                                <span class="asp-filter-label">فلتر:</span>
                                <button class="asp-filter active" data-ext="" onclick="ArchiveModule.setExtFilter('',this)">الكل</button>
                                <button class="asp-filter" data-ext="pdf" onclick="ArchiveModule.setExtFilter('pdf',this)">PDF</button>
                                <button class="asp-filter" data-ext="doc" onclick="ArchiveModule.setExtFilter('doc',this)">Word</button>
                                <button class="asp-filter" data-ext="xls" onclick="ArchiveModule.setExtFilter('xls',this)">Excel</button>
                                <button class="asp-filter" data-ext="img" onclick="ArchiveModule.setExtFilter('img',this)">صور</button>
                            </div>
                        </div>
                    </div>
                    <div class="arch-view-toggle">
                        <button class="arch-vt-btn active" id="vt-grid" onclick="ArchiveModule.setView('grid')" title="شبكي">⊞</button>
                        <button class="arch-vt-btn"        id="vt-list" onclick="ArchiveModule.setView('list')" title="قائمة">☰</button>
                    </div>
                    <button class="arch-btn arch-btn-ghost" onclick="ArchiveModule.openUpload()">⬆ رفع</button>
                    <button class="arch-btn arch-btn-primary" onclick="ArchiveModule.openAdd()">＋ إضافة</button>
                </div>
            </div>

            <!-- المحتوى -->
            <div class="arch-content">

                <!-- لوحة المستندات -->
                <div class="arch-doc-panel" id="arch-doc-panel">

                    <!-- إحصائيات -->
                    <div class="arch-stats" id="arch-stats">
                        <div class="arch-stat gold"><div style="height:54px;background:var(--bg-secondary);border-radius:8px;animation:archPulse 1.2s infinite"></div></div>
                        <div class="arch-stat blue"><div style="height:54px;background:var(--bg-secondary);border-radius:8px;animation:archPulse 1.2s infinite .1s"></div></div>
                        <div class="arch-stat green"><div style="height:54px;background:var(--bg-secondary);border-radius:8px;animation:archPulse 1.2s infinite .2s"></div></div>
                        <div class="arch-stat orng"><div style="height:54px;background:var(--bg-secondary);border-radius:8px;animation:archPulse 1.2s infinite .3s"></div></div>
                    </div>

                    <!-- محتوى القسم -->
                    <div id="arch-section-content">
                        <div style="text-align:center;padding:60px;color:var(--text-secondary)">جارٍ التحميل…</div>
                    </div>

                </div>

                <!-- لوحة المعاينة -->
                <aside class="arch-preview" id="arch-preview">
                    <div class="arch-preview-hdr">
                        <h3>معاينة المستند</h3>
                        <div class="arch-close-btn" onclick="ArchiveModule.closePreview()">✕</div>
                    </div>
                    <div class="arch-preview-body">
                        <div class="arch-preview-thumb">
                            <span id="prev-icon" style="font-size:56px">📄</span>
                            <div class="ovl" id="prev-type">PDF</div>
                        </div>
                        <div class="arch-preview-info">
                            <div class="arch-info-row"><span class="arch-info-label">اسم الملف</span><span class="arch-info-val" id="prev-name">—</span></div>
                            <div class="arch-info-row"><span class="arch-info-label">التصنيف</span><span class="arch-info-val" id="prev-cat">—</span></div>
                            <div class="arch-info-row"><span class="arch-info-label">الحجم</span><span class="arch-info-val" id="prev-size">—</span></div>
                            <div class="arch-info-row"><span class="arch-info-label">تاريخ الرفع</span><span class="arch-info-val" id="prev-date">—</span></div>
                            <div class="arch-info-row"><span class="arch-info-label">رفع بواسطة</span><span class="arch-info-val" id="prev-user">—</span></div>
                            <div class="arch-info-row"><span class="arch-info-label">الحالة</span><span class="arch-info-val" id="prev-status" style="color:var(--accent-green)">✓ نشط</span></div>
                        </div>
                    </div>
                    <div class="arch-preview-actions">
                        <button class="arch-btn arch-btn-primary" onclick="ArchiveModule.openViewer()">👁 استعراض</button>
                        <a class="arch-btn arch-btn-ghost" id="prev-dl" href="#" download>⬇ تحميل</a>
                    </div>
                </aside>

            </div>
        </div>

        <!-- مودال استعراض المستند -->
        <div class="arch-viewer-overlay" id="arch-viewer-overlay" onclick="ArchiveModule.closeViewer(event)">
            <div class="arch-viewer-modal" onclick="event.stopPropagation()">
                <div class="arch-viewer-hdr">
                    <div style="display:flex;align-items:center;gap:12px">
                        <span id="vwr-icon" style="font-size:22px">📄</span>
                        <div>
                            <h3 id="vwr-title">—</h3>
                            <div style="font-size:.7rem;color:var(--text-muted);font-family:'IBM Plex Mono',monospace;margin-top:2px" id="vwr-sub">—</div>
                        </div>
                    </div>
                    <div style="display:flex;gap:8px;align-items:center">
                        <a class="arch-btn arch-btn-ghost" id="vwr-dl" href="#" download style="font-size:.75rem">⬇ تحميل</a>
                        <button class="arch-btn arch-btn-ghost" style="font-size:.75rem" onclick="window.print()">🖨 طباعة</button>
                        <div class="arch-close-btn" onclick="ArchiveModule.closeViewer()">✕</div>
                    </div>
                </div>
                <div class="arch-viewer-body" id="vwr-body">
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
                <div class="arch-viewer-ftr">
                    <div style="font-size:.75rem;color:var(--text-muted);font-family:'IBM Plex Mono',monospace">صفحة 1 / 1</div>
                    <div style="display:flex;gap:8px">
                        <button class="arch-btn arch-btn-ghost" style="font-size:.75rem">🔍 −</button>
                        <span style="font-size:.75rem;color:var(--text-muted);font-family:'IBM Plex Mono',monospace;padding:0 8px">100%</span>
                        <button class="arch-btn arch-btn-ghost" style="font-size:.75rem">🔍 +</button>
                    </div>
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
                                <label>التصنيف</label>
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

        <!-- ══ مودال إضافة وثيقة (حقول ديناميكية) ══════════════ -->
        <div class="arch-viewer-overlay" id="arch-add-overlay" onclick="ArchiveModule.closeAdd(event)">
            <div class="arch-viewer-modal aad-modal" onclick="event.stopPropagation()">
                <div class="arch-viewer-hdr">
                    <div style="display:flex;align-items:center;gap:10px">
                        <span style="font-size:1.2rem">＋</span>
                        <h3>إضافة وثيقة</h3>
                    </div>
                    <div class="arch-close-btn" onclick="ArchiveModule.closeAdd()">✕</div>
                </div>
                <div class="aad-body">
                    <!-- اختيار نوع الوثيقة -->
                    <div class="aad-type-row">
                        <!-- مستندات تشغيلية -->
                        <div class="aad-type-group"><span class="aad-tg-label">📋 تشغيلية</span>
                        <div class="aad-type-btn active" data-type="عقد_اتفاقية"   onclick="ArchiveModule._setAddType('عقد_اتفاقية',this)">📜<span>عقد</span></div>
                        <div class="aad-type-btn" data-type="تعميد_تفويض"          onclick="ArchiveModule._setAddType('تعميد_تفويض',this)">✍️<span>تعميد</span></div>
                        <div class="aad-type-btn" data-type="خطاب_مراسلة"          onclick="ArchiveModule._setAddType('خطاب_مراسلة',this)">✉️<span>خطاب</span></div></div>
                        <!-- مستندات مالية -->
                        <div class="aad-type-group"><span class="aad-tg-label">💰 مالية</span>
                        <div class="aad-type-btn" data-type="فاتورة_مبيعات"        onclick="ArchiveModule._setAddType('فاتورة_مبيعات',this)">🧾<span>مبيعات</span></div>
                        <div class="aad-type-btn" data-type="فاتورة_موردين"        onclick="ArchiveModule._setAddType('فاتورة_موردين',this)">🛒<span>موردين</span></div>
                        <div class="aad-type-btn" data-type="قيد_يومي"             onclick="ArchiveModule._setAddType('قيد_يومي',this)">📒<span>قيد يومي</span></div>
                        <div class="aad-type-btn" data-type="مستند_بنكي"           onclick="ArchiveModule._setAddType('مستند_بنكي',this)">🏦<span>بنكي</span></div>
                        <div class="aad-type-btn" data-type="ضريبة_زكاة"           onclick="ArchiveModule._setAddType('ضريبة_زكاة',this)">🏛️<span>ضريبة</span></div></div>
                        <!-- تقارير -->
                        <div class="aad-type-group"><span class="aad-tg-label">📊 تقارير</span>
                        <div class="aad-type-btn" data-type="تقرير_مالي"           onclick="ArchiveModule._setAddType('تقرير_مالي',this)">📊<span>تقرير</span></div>
                        <div class="aad-type-btn" data-type="موازنة_تخطيط"         onclick="ArchiveModule._setAddType('موازنة_تخطيط',this)">📈<span>موازنة</span></div></div>
                        <!-- وثائق رسمية -->
                        <div class="aad-type-group"><span class="aad-tg-label">🏛️ رسمية</span>
                        <div class="aad-type-btn" data-type="وثيقة_حكومية"         onclick="ArchiveModule._setAddType('وثيقة_حكومية',this)">🏛️<span>حكومية</span></div>
                        <div class="aad-type-btn" data-type="سجل_تجاري"            onclick="ArchiveModule._setAddType('سجل_تجاري',this)">🏢<span>تجاري</span></div>
                        <div class="aad-type-btn" data-type="أخرى"                 onclick="ArchiveModule._setAddType('أخرى',this)">📁<span>أخرى</span></div></div>
                    </div>
                    <!-- الحقول الديناميكية -->
                    <div class="aad-fields" id="aad-fields"></div>
                    <!-- منطقة رفع الملف -->
                    <div class="aad-file-zone" id="aad-dropzone" onclick="document.getElementById('aad-file-inp').click()">
                        <span id="aad-file-label">📎 انقر لإرفاق ملف (اختياري)</span>
                        <input type="file" id="aad-file-inp" style="display:none" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png">
                    </div>
                </div>
                <div class="arch-viewer-ftr" style="justify-content:flex-end;gap:8px">
                    <button class="arch-btn arch-btn-ghost" onclick="ArchiveModule.closeAdd()">إلغاء</button>
                    <button class="arch-btn arch-btn-primary" id="aad-save-btn" onclick="ArchiveModule.submitAdd()">＋ حفظ الوثيقة</button>
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

        // add modal file input
        const aadFi = document.getElementById('aad-file-inp');
        if (aadFi) aadFi.addEventListener('change', e => {
            _addFile = e.target.files[0] || null;
            const lbl = document.getElementById('aad-file-label');
            if (lbl) lbl.textContent = _addFile ? `📎 ${_addFile.name}` : '📎 انقر لإرفاق ملف (اختياري)';
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
        const subIndex = ['all', 'operational', 'financial', 'reports', 'official', 'renewals'];
        const btns = document.querySelectorAll('#nav-children-archive .nav-child-btn');
        btns.forEach(b => b.classList.remove('active'));
        const idx = subIndex.indexOf(S.sub);
        if (btns[idx]) btns[idx].classList.add('active');
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
        el.innerHTML = `
            <div class="arch-stat gold">
                <div class="arch-stat-label">إجمالي المستندات</div>
                <div class="arch-stat-val">${s.total_files ?? 0}</div>
                <div class="arch-stat-sub">↑ ${s.last_30_days ?? 0} هذا الشهر</div>
            </div>
            <div class="arch-stat blue">
                <div class="arch-stat-label">المصادر المرتبطة</div>
                <div class="arch-stat-val">${s.total_expiry_docs ?? 0}</div>
                <div class="arch-stat-sub">${s.total_size ?? '—'} إجمالي الحجم</div>
            </div>
            <div class="arch-stat green">
                <div class="arch-stat-label">وثائق تحت المتابعة</div>
                <div class="arch-stat-val">${s.total_expiry_docs ?? 0}</div>
                <div class="arch-stat-sub">آخر تحديث: اليوم</div>
            </div>
            <div class="arch-stat orng">
                <div class="arch-stat-label">تنتهي خلال 30 يوم</div>
                <div class="arch-stat-val" ${(s.expiring_soon > 0) ? 'style="color:var(--accent-red)"' : ''}>${s.expiring_soon ?? 0}</div>
                <div class="arch-stat-sub">${s.expired_docs > 0 ? `⚠ ${s.expired_docs} منتهية` : 'تتطلب مراجعة'}</div>
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

        // تحديث العنوان
        const info = SUBS[S.sub] || SUBS.all;
        const title = document.getElementById('arch-title');
        const crumb = document.getElementById('arch-crumb');
        if (title) title.textContent = info.label;
        if (crumb) crumb.textContent = info.crumb;

        let html = '';

        if (S.sub === 'all') {
            html += _renderRenewal(3);
            html += _renderGroup('operational', '📋 مستندات تشغيلية', 'ab-blue');
            html += _renderGroup('financial', '💰 مستندات مالية', 'ab-green');
            html += _renderGroup('reports', '📊 تقارير وموازنة', 'ab-gold');
            html += _renderGroup('official', '🏛️ وثائق رسمية', 'ab-red');
        } else if (S.sub === 'renewals') {
            html += _renderRenewalPage();
        } else if (SUB_TABS[S.sub]) {
            html += _renderSubTabs();
            const files = _filterFilesBySub();
            if (S.search || S.extFilter) {
                html += _renderSearchResults(files);
            } else if (!files.length) {
                html += _renderEmpty('لا توجد مستندات في هذا القسم');
            } else {
                html += _renderGrid(files) + _renderList(files);
            }
        } else {
            const files = _filterFiles(S.sub);
            html += _renderGrid(files) + _renderList(files);
            if (!files.length) html = _renderEmpty('لا توجد مستندات في هذا القسم');
        }

        c.innerHTML = html;
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
            let color = 'var(--accent-green)', dotCls = 'dot-green', pct = 90, label = `${days} يوماً متبقية`;
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
    <div class="aer-title">لا توجد مستندات للتجديد</div>
    <div class="aer-sub">ستظهر هنا المستندات التي تقترب صلاحيتها</div>
</div>`;

        return `<div class="arch-renewal">
            <div class="arch-sec-hdr">
                <h3>🔄 مستندات التجديد السنوي <span class="arch-badge ab-orange">${docs.length} مستندات</span></h3>
                <button class="arch-btn arch-btn-ghost" style="font-size:.75rem" onclick="openArchiveSub('renewals')">عرض الكل</button>
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
                <div class="aes-title aes-title--sm">لا توجد مستندات</div>
              </div>`
            : '';
        const _cardHtml = (f, i) => {
            const emoji = _emoji(f.file_extension);
            const cls = _iconCls(f.file_extension);
            return `<div class="arch-doc-card" style="animation-delay:${i * .03}s" data-id="${f.id}" onclick="ArchiveModule.selectFile(${f.id})">
                <div class="arch-card-top">
                    <div class="arch-file-icon ${cls}">${emoji}</div>
                    <div class="arch-doc-menu" onclick="event.stopPropagation()">⋮</div>
                </div>
                <div class="arch-doc-name" title="${_e(f.display_name)}">${_e(f.display_name)}</div>
                <div class="arch-doc-meta">
                    <span>${(f.file_extension || '?').toUpperCase()}</span>
                    <span>${f.file_size_formatted || '—'}</span>
                </div>
                <div class="arch-doc-tags">${_tags(f)}</div>
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
                <a class="arch-btn arch-btn-ghost" href="${API}?action=download&id=${f.id}" download style="font-size:.72rem;padding:4px 10px">⬇</a>
            </div>
        </div>`;
        const gridHtml = preview.length
            ? `<div class="arch-doc-grid arch-doc-grid--compact">${preview.map(_cardHtml).join('')}</div>
               <div class="arch-doc-list">${preview.map(_listHtml).join('')}</div>` : '';
        return `
        <div class="arch-group-section">
            <div class="arch-cat-hdr">
                <h3>${label} <span class="arch-badge ${badgeCls}">${files.length} ملف</span></h3>
                ${hasMore ? `<button class="arch-btn arch-btn-ghost arch-btn--sm" onclick="openArchiveSub('${sub}')">عرض الكل ←</button>` : ''}
            </div>
            ${emptyHtml}${gridHtml}
        </div>`;
    }

    /* ── شبكة الكروت ────────────────────────────────────── */
    function _renderGrid(files) {
        if (!files.length) return '';
        return `<div class="arch-doc-grid">
            ${files.map((f, i) => {
            const emoji = _emoji(f.file_extension);
            const cls = _iconCls(f.file_extension);
            return `<div class="arch-doc-card" style="animation-delay:${i * .03}s" data-id="${f.id}" onclick="ArchiveModule.selectFile(${f.id})">
                    <div class="arch-card-top">
                        <div class="arch-file-icon ${cls}">${emoji}</div>
                        <div class="arch-doc-menu" onclick="event.stopPropagation()">⋮</div>
                    </div>
                    <div class="arch-doc-name" title="${_e(f.display_name)}">${_e(f.display_name)}</div>
                    <div class="arch-doc-meta">
                        <span>${(f.file_extension || '?').toUpperCase()}</span>
                        <span>${f.file_size_formatted || '—'}</span>
                    </div>
                    <div class="arch-doc-tags">${_tags(f)}</div>
                </div>`;
        }).join('')}
        </div>`;
    }

    /* ── عرض القائمة ────────────────────────────────────── */
    function _renderList(files) {
        return `<div class="arch-doc-list">
            ${files.map(f => `<div class="arch-list-item" data-id="${f.id}" onclick="ArchiveModule.selectFile(${f.id})">
                <div class="li-icon">${_emoji(f.file_extension)}</div>
                <div class="li-info">
                    <div class="li-name">${_e(f.display_name)}</div>
                    <div class="li-meta">${(f.file_extension || '?').toUpperCase()} • ${f.file_size_formatted || '—'} • ${_fmtDate(f.created_at)}</div>
                </div>
                <div class="li-tags">${_tags(f)}</div>
                <div class="li-actions" onclick="event.stopPropagation()">
                    <a class="arch-btn arch-btn-ghost" href="${API}?action=download&id=${f.id}" download style="font-size:.72rem;padding:4px 10px">⬇</a>
                </div>
            </div>`).join('')}
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
        const f = S.files.find(x => x.id == id);
        if (!f) return;
        S.viewingFile = f;
        document.querySelectorAll('.arch-doc-card,.arch-list-item').forEach(c => c.classList.toggle('selected', c.dataset.id == id));
        document.getElementById('prev-icon').textContent = _emoji(f.file_extension);
        document.getElementById('prev-type').textContent = (f.file_extension || '?').toUpperCase();
        document.getElementById('prev-name').textContent = f.display_name;
        document.getElementById('prev-cat').textContent = f.category_label || f.category || '—';
        document.getElementById('prev-size').textContent = f.file_size_formatted || '—';
        document.getElementById('prev-date').textContent = _fmtDate(f.created_at);
        document.getElementById('prev-user').textContent = f.uploader_name || '—';
        document.getElementById('prev-dl').href = `${API}?action=download&id=${id}`;
        document.getElementById('arch-preview').classList.add('open');
    }

    function closePreview() {
        document.getElementById('arch-preview')?.classList.remove('open');
        document.querySelectorAll('.arch-doc-card,.arch-list-item').forEach(c => c.classList.remove('selected'));
        S.viewingFile = null;
    }

    /* ══ استعراض الملف ══════════════════════════════════════ */
    function openViewer() {
        const f = S.viewingFile;
        if (!f) return;
        const ext = (f.file_extension || '').toLowerCase();
        const url = `${API}?action=view&id=${f.id}`;

        // عناصر الهيدر — دائماً موجودة
        const _s = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        const _h = (id, val) => { const el = document.getElementById(id); if (el) el.href = val; };
        _s('vwr-icon', _emoji(ext));
        _s('vwr-title', f.display_name);
        _s('vwr-sub', `${(ext || '?').toUpperCase()} • ${f.file_size_formatted || '—'} • ${_fmtDate(f.created_at)}`);
        _h('vwr-dl', `${API}?action=download&id=${f.id}`);

        // جدول بيانات الـ mock doc
        const rows = [
            ['اسم الملف', f.display_name, '—'],
            ['المصدر', f.source_label || f.source_module || '—', f.source_ref || '—'],
            ['التصنيف', f.category_label || f.category || '—', '—'],
            ['الحجم', f.file_size_formatted || '—', '—'],
            ['رُفع بواسطة', f.uploader_name || '—', '—'],
            ['تاريخ الرفع', _fmtDate(f.created_at), '—'],
        ];
        const tbodyRows = rows.map((r, i) =>
            `<tr ${i === rows.length - 1 ? 'class="total-row"' : ''}>${r.map(c => `<td>${_e(c)}</td>`).join('')}</tr>`
        ).join('');

        const body = document.getElementById('vwr-body');
        if (!body) return;

        if (ext === 'pdf') {
            body.innerHTML = `<iframe style="width:100%;height:100%;min-height:480px;border:none" src="${url}"></iframe>`;
        } else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
            body.innerHTML = `<img style="max-width:100%;max-height:100%;object-fit:contain;padding:20px" src="${url}" alt="${_e(f.display_name)}">`;
        } else {
            // mock doc — نبنيه مباشرة بدون الاعتماد على عناصر قديمة
            body.innerHTML = `
                <div class="arch-mock-doc">
                    <div class="arch-mock-page">
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
                            <tbody>${tbodyRows}</tbody>
                        </table>
                        <div class="arch-mock-ftr">
                            <span>نظام الأرشيف المالي</span>
                            <span>التاريخ: ${_fmtDate(f.created_at)}</span>
                            <span>سري وخاص</span>
                        </div>
                    </div>
                </div>`;
        }

        document.getElementById('arch-viewer-overlay').classList.add('active');
    }

    function closeViewer(e) {
        if (e && e.target.id !== 'arch-viewer-overlay') return;
        document.getElementById('arch-viewer-overlay')?.classList.remove('active');
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
        document.querySelectorAll('.arch-subtab').forEach(b =>
            b.classList.toggle('active', b.getAttribute('onclick').includes(`'${key}'`))
        );
        // أعد رسم المحتوى فقط (بدون إعادة تحميل)
        const c = document.getElementById('arch-section-content');
        if (!c) return;
        let html = _renderSubTabs();
        const files = _filterFilesBySub();
        if (S.search || S.extFilter) {
            html += _renderSearchResults(files);
        } else {
            html += _renderGrid(files) + _renderList(files);
            if (!files.length) html += _renderEmpty('لا توجد مستندات في هذا القسم');
        }
        c.innerHTML = html;
    }

    /* ══ البحث ══════════════════════════════════════════════ */
    let _searchTimeout = null;
    function toggleSearch() {
        const wrap = document.getElementById('arch-search-wrap');
        const panel = document.getElementById('arch-search-panel');
        const input = document.getElementById('arch-search-input');
        if (!wrap) return;
        const isOpen = wrap.classList.toggle('search-open');
        if (isOpen) { panel?.classList.add('open'); setTimeout(() => input?.focus(), 150); }
        else { panel?.classList.remove('open'); clearSearch(); }
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
        document.querySelectorAll('.asp-filter').forEach(b =>
            b.classList.toggle('active', b.dataset.ext === '')
        );
        _renderContent();
    }

    function setExtFilter(ext, btn) {
        S.extFilter = ext;
        document.querySelectorAll('.asp-filter').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');
        _renderContent();
    }

    function setView(mode) {
        S.viewMode = mode;
        document.getElementById('vt-grid')?.classList.toggle('active', mode === 'grid');
        document.getElementById('vt-list')?.classList.toggle('active', mode === 'list');
        document.body.classList.toggle('arch-list-view', mode === 'list');
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

    function openAdd() {
        _addType = 'عقد_اتفاقية';
        _addFile = null;
        _renderAddFields();
        document.getElementById('aad-file-label').textContent = '📎 انقر لإرفاق ملف (اختياري)';
        document.getElementById('arch-add-overlay')?.classList.add('active');
    }

    function closeAdd(e) {
        if (e && e.target.id !== 'arch-add-overlay') return;
        document.getElementById('arch-add-overlay')?.classList.remove('active');
        _addFile = null;
    }

    function _setAddType(type, btn) {
        _addType = type;
        document.querySelectorAll('.aad-type-btn').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');
        _renderAddFields();
    }

    function _renderAddFields() {
        const el = document.getElementById('aad-fields');
        if (!el) return;
        const fields = ADD_FIELDS[_addType] || ADD_FIELDS['أخرى'];
        el.innerHTML = `<div class="aad-fields-grid">${fields.map(f => `
            <div class="aad-field ${f.type === 'textarea' ? 'aad-field--wide' : ''}">
                <label>${f.label}</label>
                ${f.type === 'textarea'
                ? `<textarea id="${f.id}" placeholder="${f.ph || ''}" rows="2"></textarea>`
                : `<input type="${f.type}" id="${f.id}" placeholder="${f.ph || ''}">`
            }
            </div>`).join('')}</div>`;
    }

    async function submitAdd() {
        const nameEl = document.getElementById('aad-f-name');
        if (!nameEl || !nameEl.value.trim()) { nameEl?.focus(); return; }

        const btn = document.getElementById('aad-save-btn');
        btn.disabled = true; btn.textContent = '⏳ جارٍ الحفظ…';

        const fd = new FormData();
        fd.append('display_name', nameEl.value.trim());
        fd.append('category', _addType);

        // إضافة كل حقول النموذج
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
                closeAdd();
                await loadFiles();
                await loadStats();
            } else {
                alert(d.message || 'فشل الحفظ');
            }
        } catch (e) { alert('خطأ في الاتصال'); }
        finally { btn.disabled = false; btn.textContent = '＋ حفظ الوثيقة'; }
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

    return { init, switchSub, setView, setSubTab, _setRenewalTab, toggleSearch, onSearch, clearSearch, setExtFilter, selectFile, openViewer, closeViewer, closePreview, openUpload, closeUpload, submitMultiUpload, closeProgressModal, openAdd, closeAdd, _setAddType, submitAdd, loadFiles, loadStats };
})();