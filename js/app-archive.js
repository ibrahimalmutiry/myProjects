/**
 * app-archive.js — الأرشيف المالي
 * هيكل جديد: صفحة رئيسية بأقسام + تصنيفات ديناميكية من DB
 */
'use strict';

/* ── openArchiveSub: تُستدعى من السايدبار ─────────────── */
window.openArchiveSub = function (sub) {
    document.querySelectorAll('.nav-tab[data-tab^="archive-"]').forEach(b => b.classList.remove('active'));
    const activeBtn = document.querySelector(`.nav-tab[data-tab="archive-${sub}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    const root = document.getElementById('archive-root');
    if (!root) {
        if (typeof switchTab === 'function') {
            window._archivePendingSub = sub;
            switchTab('archive', null, null, 'archive');
        }
        return;
    }
    if (window.ArchiveModule) ArchiveModule.switchSub(sub);
};

/* ══════════════════════════════════════════════════════════
   ArchiveModule — الوحدة الرئيسية
══════════════════════════════════════════════════════════ */
window.ArchiveModule = (function () {

    const API = 'api/archive_api.php';

    /* ── الحالة ─────────────────────────────────────────── */
    const S = {
        sub: 'home',
        activeSub: '',
        viewMode: 'grid',
        search: '',
        files: [],
        stats: {},
        expiryDocs: [],
        viewingFile: null,
        extFilter: '',
        sort: 'date_desc',
    };

    /* ── التصنيفات الديناميكية ──────────────────────────── */
    let SUBS = {
        home: { label: 'الأرشيف المالي', crumb: 'الرئيسية', icon: '🗄' },
        all: { label: 'جميع المستندات', crumb: 'الكل', icon: '📂' },
        financial: { label: 'مستندات مالية', crumb: 'مالية', icon: '💰' },
        letters: { label: 'خطابات', crumb: 'خطابات', icon: '✉️' },
        payments: { label: 'مدفوعات يومية', crumb: 'مدفوعات', icon: '💳' },
    };

    let CAT_MAP = {
        'فاتورة_موردين': 'financial',
        'فاتورة_عملاء': 'financial',
        'قيد_يومي': 'financial',
        'مستند_بنكي': 'financial',
        'ضريبة_زكاة': 'financial',
        'خطاب_صادر': 'letters',
        'خطاب_وارد': 'letters',
        'مراسلة_رسمية': 'letters',
        'إيصال_دفع': 'payments',
        'أمر_دفع': 'payments',
        // قديمة للتوافق
        'فاتورة_مبيعات': 'financial',
        'فاتورة_مدفوعات': 'financial',
        'معاملة_مالية': 'financial',
        'إيداع_بنكي': 'financial',
        'خطاب_مراسلة': 'letters',
        'عقد_اتفاقية': 'financial',
        'تعميد_تفويض': 'financial',
        'وثيقة_حكومية': 'financial',
        'سجل_تجاري': 'financial',
        'تقرير_مالي': 'financial',
        'موازنة_تخطيط': 'financial',
        'أخرى': 'all',
    };

    let SUB_TABS = {
        financial: [
            { key: 'all_fin', label: 'الكل' },
            { key: 'fin_supplier', label: 'فواتير موردين', cat: 'فاتورة_موردين' },
            { key: 'fin_customer', label: 'فواتير عملاء', cat: 'فاتورة_عملاء' },
            { key: 'fin_journal', label: 'قيود يومية', cat: 'قيد_يومي' },
            { key: 'fin_bank', label: 'مستندات بنكية', cat: 'مستند_بنكي' },
            { key: 'fin_tax', label: 'ضرائب وزكاة', cat: 'ضريبة_زكاة' },
        ],
        letters: [
            { key: 'all_let', label: 'الكل' },
            { key: 'let_outgoing', label: 'خطابات صادرة', cat: 'خطاب_صادر' },
            { key: 'let_incoming', label: 'خطابات واردة', cat: 'خطاب_وارد' },
            { key: 'let_official', label: 'مراسلات رسمية', cat: 'مراسلة_رسمية' },
        ],
        payments: [
            { key: 'all_pay', label: 'الكل' },
            { key: 'pay_receipt', label: 'إيصالات الدفع', cat: 'إيصال_دفع' },
            { key: 'pay_order', label: 'أوامر الدفع', cat: 'أمر_دفع' },
        ],
    };

    let SUB_CAT_MAP = {};

    const SRC_MAP = {
        transactions: 'financial',
        correspondence: 'letters',
        bank: 'financial',
        budget: 'financial',
        archive: 'all',
        payment: 'payments',
    };

    /* ── بناء الخرائط من التصنيفات الديناميكية ─────────── */
    function _buildMapsFromCategories(categories) {
        if (!categories || !categories.length) return;
        categories.forEach(function (section) {
            SUBS[section.key] = {
                label: section.label,
                crumb: section.label,
                icon: section.icon || '📂',
            };
            if (!SUB_TABS[section.key]) {
                SUB_TABS[section.key] = [{ key: 'all_' + section.key, label: 'الكل' }];
            }
            (section.subs || []).forEach(function (sub) {
                CAT_MAP[sub.category_tag] = section.key;
                SUB_CAT_MAP[sub.category_tag] = sub.key;
                const exists = SUB_TABS[section.key].find(t => t.key === sub.key);
                if (!exists) {
                    SUB_TABS[section.key].push({
                        key: sub.key,
                        label: sub.label,
                        cat: sub.category_tag,
                    });
                }
            });
        });
        // بناء SUB_CAT_MAP من SUB_TABS أيضاً
        Object.entries(SUB_TABS).forEach(([sec, tabs]) => {
            tabs.forEach(t => {
                if (t.cat) SUB_CAT_MAP[t.cat] = t.key;
            });
        });
    }

    /* ══ init ══════════════════════════════════════════════ */
    function init() {
        const root = document.getElementById('archive-root');
        if (!root) return;

        if (window._archivePendingSub) {
            S.sub = window._archivePendingSub;
            delete window._archivePendingSub;
        }

        // تحميل التصنيفات أولاً ثم بناء الصفحة
        fetch('api/archive_api.php?action=get_categories')
            .then(r => r.json())
            .then(d => { if (d.success && d.data && d.data.length) _buildMapsFromCategories(d.data); })
            .catch(() => { })
            .finally(() => {
                root.innerHTML = buildPage();
                bindEvents();
                _syncSidebarActive();
                loadStats();
                loadFiles();
                loadExpiryDocs();
            });
    }

    /* ══ HTML الصفحة ════════════════════════════════════════ */
    function buildPage() {
        return `
        <div class="archive-page">

            <!-- ══ الهيدر ══ -->
            <div class="arch-pro-hdr">
                <div class="arch-pro-hdr-left">
                    <div class="arch-pro-hdr-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
                    </div>
                    <div>
                        <h2 id="arch-title">${SUBS[S.sub]?.label || 'الأرشيف المالي'}</h2>
                        <div class="arch-breadcrumb">
                            <span class="arch-breadcrumb-home" onclick="ArchiveModule.switchSub('home')" style="cursor:pointer">الأرشيف</span>
                            <span class="sep">›</span>
                            <span class="cur" id="arch-crumb">${SUBS[S.sub]?.crumb || 'الرئيسية'}</span>
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

            <!-- ══ تنبيهات ══ -->
            <div id="arch-alerts-zone"></div>

            <!-- ══ شريط الأدوات — مخفي في صفحة home ══ -->
            <div class="arch-pro-toolbar" id="arch-toolbar" style="${S.sub === 'home' ? 'display:none' : ''}">
                <div class="arch-pro-search">
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" stroke-width="1.8"/><path d="M13 13L17 17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
                    <input id="arch-search-input" type="text" placeholder="ابحث باسم الملف أو التصنيف…" oninput="ArchiveModule.onSearch(this.value)">
                    <button class="asp-clear" id="asp-clear" onclick="ArchiveModule.clearSearch()" style="display:none">✕</button>
                </div>
                <div class="arch-pro-filters" id="asp-filters">
                    <button class="arch-ext-btn active" data-ext="" onclick="ArchiveModule.setExtFilter('',this)">الكل</button>
                    <button class="arch-ext-btn" data-ext="pdf" onclick="ArchiveModule.setExtFilter('pdf',this)">PDF</button>
                    <button class="arch-ext-btn" data-ext="doc" onclick="ArchiveModule.setExtFilter('doc',this)">Word</button>
                    <button class="arch-ext-btn" data-ext="xls" onclick="ArchiveModule.setExtFilter('xls',this)">Excel</button>
                    <button class="arch-ext-btn" data-ext="img" onclick="ArchiveModule.setExtFilter('img',this)">صور</button>
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
                <div class="avw-body" id="vwr-body"></div>
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

        <!-- مودال رفع مستندات -->
        <div class="arch-viewer-overlay" id="arch-upload-overlay" onclick="ArchiveModule.closeUpload(event)">
            <div class="arch-viewer-modal aum-modal" onclick="event.stopPropagation()">
                <div class="arch-viewer-hdr">
                    <div style="display:flex;align-items:center;gap:10px">
                        <span style="font-size:1.2rem">⬆</span>
                        <div><h3>رفع مستندات</h3><div class="aum-sub" id="aum-count-label">اختر الملفات المراد رفعها</div></div>
                    </div>
                    <div class="arch-close-btn" onclick="ArchiveModule.closeUpload()">✕</div>
                </div>
                <div class="aum-body">
                    <div class="aum-dropzone" id="aum-dropzone" onclick="document.getElementById('aum-file-inp').click()">
                        <div class="aum-dz-icon">
                            <svg viewBox="0 0 48 48" fill="none"><path d="M24 8 L24 32 M14 18 L24 8 L34 18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 36 L8 40 L40 40 L40 36" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                        </div>
                        <div class="aum-dz-title">اسحب الملفات هنا</div>
                        <div class="aum-dz-sub">أو انقر للاختيار — PDF, Word, Excel, صور</div>
                        <input type="file" id="aum-file-inp" style="display:none" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.txt">
                    </div>
                    <div class="aum-file-list" id="aum-file-list"></div>
                    <div class="aum-common-fields" id="aum-common-fields" style="display:none">
                        <div class="aum-cf-title">⚙️ إعدادات مشتركة لجميع الملفات</div>
                        <div class="aum-cf-row">
                            <div class="aum-cf-field">
                                <label>${tr('التصنيف')}</label>
                                <select id="aum-cat-global">
                                    <option value="">— مختلف لكل ملف —</option>
                                    <option value="فاتورة_موردين">🛒 فاتورة موردين</option>
                                    <option value="فاتورة_عملاء">🧾 فاتورة عملاء</option>
                                    <option value="خطاب_صادر">✉️ خطاب صادر</option>
                                    <option value="خطاب_وارد">📨 خطاب وارد</option>
                                    <option value="إيصال_دفع">💳 إيصال دفع</option>
                                    <option value="قيد_يومي">📒 قيد يومي</option>
                                    <option value="مستند_بنكي">🏦 مستند بنكي</option>
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

        <!-- مودال تقدم الرفع -->
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

        <!-- مودال إضافة وثيقة -->
        <div class="arch-viewer-overlay" id="arch-add-overlay" onclick="ArchiveModule.closeAdd(event)">
            <div class="aad-modal-pro" onclick="event.stopPropagation()">
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
                <div class="aad-pro-steps">
                    <div class="aad-pro-step active" id="aad-step-ind-1"><div class="aad-pro-step-num">1</div><div class="aad-pro-step-lbl">نوع الوثيقة</div></div>
                    <div class="aad-pro-step-line"></div>
                    <div class="aad-pro-step" id="aad-step-ind-2"><div class="aad-pro-step-num">2</div><div class="aad-pro-step-lbl">البيانات</div></div>
                    <div class="aad-pro-step-line"></div>
                    <div class="aad-pro-step" id="aad-step-ind-3"><div class="aad-pro-step-num">3</div><div class="aad-pro-step-lbl">الملف</div></div>
                </div>
                <div class="aad-pro-body">
                    <div class="aad-pro-panel" id="aad-panel-1">
                        <div class="aad-cat-section">
                            <div class="aad-cat-label">💰 مستندات مالية</div>
                            <div class="aad-cat-grid">
                                <div class="aad-type-card active" data-type="فاتورة_موردين" onclick="ArchiveModule._setAddType('فاتورة_موردين',this)"><div class="aad-type-card-icon">🛒</div><div class="aad-type-card-name">فاتورة موردين</div></div>
                                <div class="aad-type-card" data-type="فاتورة_عملاء" onclick="ArchiveModule._setAddType('فاتورة_عملاء',this)"><div class="aad-type-card-icon">🧾</div><div class="aad-type-card-name">فاتورة عملاء</div></div>
                                <div class="aad-type-card" data-type="قيد_يومي" onclick="ArchiveModule._setAddType('قيد_يومي',this)"><div class="aad-type-card-icon">📒</div><div class="aad-type-card-name">قيد يومي</div></div>
                                <div class="aad-type-card" data-type="مستند_بنكي" onclick="ArchiveModule._setAddType('مستند_بنكي',this)"><div class="aad-type-card-icon">🏦</div><div class="aad-type-card-name">مستند بنكي</div></div>
                                <div class="aad-type-card" data-type="ضريبة_زكاة" onclick="ArchiveModule._setAddType('ضريبة_زكاة',this)"><div class="aad-type-card-icon">🏛️</div><div class="aad-type-card-name">ضريبة / زكاة</div></div>
                            </div>
                        </div>
                        <div class="aad-cat-section">
                            <div class="aad-cat-label">✉️ خطابات</div>
                            <div class="aad-cat-grid">
                                <div class="aad-type-card" data-type="خطاب_صادر" onclick="ArchiveModule._setAddType('خطاب_صادر',this)"><div class="aad-type-card-icon">📤</div><div class="aad-type-card-name">خطاب صادر</div></div>
                                <div class="aad-type-card" data-type="خطاب_وارد" onclick="ArchiveModule._setAddType('خطاب_وارد',this)"><div class="aad-type-card-icon">📨</div><div class="aad-type-card-name">خطاب وارد</div></div>
                                <div class="aad-type-card" data-type="مراسلة_رسمية" onclick="ArchiveModule._setAddType('مراسلة_رسمية',this)"><div class="aad-type-card-icon">📋</div><div class="aad-type-card-name">مراسلة رسمية</div></div>
                            </div>
                        </div>
                        <div class="aad-cat-section">
                            <div class="aad-cat-label">💳 مدفوعات يومية</div>
                            <div class="aad-cat-grid">
                                <div class="aad-type-card" data-type="إيصال_دفع" onclick="ArchiveModule._setAddType('إيصال_دفع',this)"><div class="aad-type-card-icon">🧾</div><div class="aad-type-card-name">إيصال دفع</div></div>
                                <div class="aad-type-card" data-type="أمر_دفع" onclick="ArchiveModule._setAddType('أمر_دفع',this)"><div class="aad-type-card-icon">💸</div><div class="aad-type-card-name">أمر دفع</div></div>
                                <div class="aad-type-card" data-type="أخرى" onclick="ArchiveModule._setAddType('أخرى',this)"><div class="aad-type-card-icon">📁</div><div class="aad-type-card-name">أخرى</div></div>
                            </div>
                        </div>
                    </div>
                    <div class="aad-pro-panel" id="aad-panel-2" style="display:none">
                        <div class="aad-selected-type-bar" id="aad-selected-type-bar">
                            <span id="aad-selected-type-icon">🛒</span>
                            <span id="aad-selected-type-name">فاتورة موردين</span>
                            <button class="aad-change-type-btn" onclick="ArchiveModule._goStep(1)">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
                                تغيير النوع
                            </button>
                        </div>
                        <div class="aad-fields" id="aad-fields"></div>
                    </div>
                    <div class="aad-pro-panel" id="aad-panel-3" style="display:none">
                        <div class="aad-dropzone-pro" id="aad-dropzone" onclick="document.getElementById('aad-file-inp').click()">
                            <div class="aad-dropzone-icon" id="aad-dropzone-icon">
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                            </div>
                            <div class="aad-dropzone-title" id="aad-file-label">اسحب الملف هنا أو انقر للاختيار</div>
                            <div class="aad-dropzone-sub">PDF, Word, Excel, صور — بحد أقصى 20 ميجابايت</div>
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
                <div class="aad-pro-ftr">
                    <button class="aad-pro-btn-ghost" id="aad-btn-back" onclick="ArchiveModule._goStep(1)" style="display:none">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
                        رجوع
                    </button>
                    <button class="aad-pro-btn-ghost" onclick="ArchiveModule.closeAdd()">إلغاء</button>
                    <div style="display:flex;gap:8px;margin-right:auto">
                        <button class="aad-pro-btn-next" id="aad-btn-next" onclick="ArchiveModule._goStep(2)">
                            التالي <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
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
    }

    function _syncSidebarActive() {
        document.querySelectorAll('.nav-tab[data-tab^="archive-"]').forEach(b => b.classList.remove('active'));
        const activeBtn = document.querySelector(`.nav-tab[data-tab="archive-${S.sub}"]`) ||
            document.querySelector(`.nav-tab[data-tab="archive-all"]`);
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
                <div class="arch-stat-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/></svg></div>
                <div class="arch-stat-label">${tr('إجمالي المستندات')}</div>
                <div class="arch-stat-val">${s.total_files ?? 0}</div>
                <div class="arch-stat-sub">↑ ${s.last_30_days ?? 0} ${tr('هذا الشهر')}</div>
            </div>
            <div class="arch-stat blue">
                <div class="arch-stat-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></div>
                <div class="arch-stat-label">${tr('مصادر مرتبطة')}</div>
                <div class="arch-stat-val">${s.linked_docs ?? 0}</div>
                <div class="arch-stat-sub">${s.total_size ?? '—'} ${tr('إجمالي الحجم')}</div>
            </div>
            <div class="arch-stat green">
                <div class="arch-stat-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></div>
                <div class="arch-stat-label">${tr('تحت المتابعة')}</div>
                <div class="arch-stat-val">${s.total_expiry_docs ?? 0}</div>
                <div class="arch-stat-sub">${tr('صلاحيات وعقود')}</div>
            </div>
            <div class="arch-stat orng ${hasExpiring ? 'arch-stat--alert' : ''}">
                <div class="arch-stat-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div>
                <div class="arch-stat-label">${tr('تنتهي خلال 30 يوم')}</div>
                <div class="arch-stat-val" ${hasExpiring ? 'style="color:var(--accent-red)"' : ''}>${s.expiring_soon ?? 0}</div>
                <div class="arch-stat-sub">${(s.expired_docs ?? 0) > 0 ? `⚠ ${s.expired_docs} ${tr('منتهية')}` : tr('لا تنبيهات')}</div>
            </div>`;
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
                <button class="arch-alert-action" onclick="ArchiveModule.selectFile(${f.id})">${tr('عرض')}</button>
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
        const titleEl = document.getElementById('arch-title');
        const crumbEl = document.getElementById('arch-crumb');
        if (titleEl) titleEl.textContent = info.label;
        if (crumbEl) crumbEl.textContent = info.crumb;

        // إظهار/إخفاء شريط الأدوات
        const toolbar = document.getElementById('arch-toolbar');
        if (toolbar) toolbar.style.display = S.sub === 'home' ? 'none' : '';

        let html = '';

        if (S.sub === 'home') {
            html = _renderArchiveHome();
        } else if (S.sub === 'all') {
            html += _renderGroup('financial', '💰 مستندات مالية', 'ab-green');
            html += _renderGroup('letters', '✉️ خطابات', 'ab-blue');
            html += _renderGroup('payments', '💳 مدفوعات يومية', 'ab-gold');
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
            if (!files.length) html = _renderEmpty('لا توجد مستندات في هذا القسم');
            else html = _renderViewMode(files);
        }

        c.innerHTML = html;
    }

    /* ══ صفحة الأقسام الرئيسية ══════════════════════════════ */
    function _renderArchiveHome() {
        const sections = [
            { key: 'financial', icon: '💰', label: 'مستندات مالية', desc: 'فواتير موردين وعملاء، قيود يومية، مستندات بنكية', color: '#1D9E75', bg: '#E1F5EE' },
            { key: 'letters', icon: '✉️', label: 'خطابات', desc: 'خطابات صادرة وواردة، مراسلات رسمية', color: '#534AB7', bg: '#EEEDFE' },
            { key: 'payments', icon: '💳', label: 'مدفوعات يومية', desc: 'إيصالات الدفع، أوامر الدفع', color: '#854F0B', bg: '#FAEEDA' },
            { key: 'all', icon: '📂', label: 'جميع المستندات', desc: 'عرض كل الملفات بدون تصنيف', color: '#185FA5', bg: '#E6F1FB' },
        ];

        // إضافة أقسام ديناميكية إن وجدت
        const extraKeys = Object.keys(SUBS).filter(k => !['home', 'all', 'financial', 'letters', 'payments'].includes(k));

        let html = '<div class="arch-home-wrap">';
        html += '<div class="arch-home-header"><h2 class="arch-home-title">🗄 الأرشيف المالي</h2><p class="arch-home-sub">اختر القسم للتصفح</p></div>';
        html += '<div class="arch-home-grid">';

        sections.forEach(s => {
            const count = S.files.filter(f =>
                s.key === 'all' || CAT_MAP[f.category] === s.key || SRC_MAP[f.source_module] === s.key
            ).length;
            html += `<div class="arch-home-card" onclick="ArchiveModule.switchSub('${s.key}')" style="--card-color:${s.color};--card-bg:${s.bg}">
                <div class="arch-home-card-icon">${s.icon}</div>
                <div class="arch-home-card-body">
                    <div class="arch-home-card-title">${s.label}</div>
                    <div class="arch-home-card-desc">${s.desc}</div>
                </div>
                <div class="arch-home-card-count">${count}</div>
            </div>`;
        });

        html += '</div>';

        if (extraKeys.length) {
            html += '<div class="arch-home-grid" style="margin-top:.5rem">';
            extraKeys.forEach(k => {
                const s = SUBS[k];
                const count = S.files.filter(f => CAT_MAP[f.category] === k || SRC_MAP[f.source_module] === k).length;
                html += `<div class="arch-home-card" onclick="ArchiveModule.switchSub('${k}')" style="--card-color:#185FA5;--card-bg:#E6F1FB">
                    <div class="arch-home-card-icon">${s.icon}</div>
                    <div class="arch-home-card-body"><div class="arch-home-card-title">${s.label}</div></div>
                    <div class="arch-home-card-count">${count}</div>
                </div>`;
            });
            html += '</div>';
        }

        html += '</div>';
        return html;
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
        let files = S.files.filter(f =>
            CAT_MAP[f.category] === S.sub || SRC_MAP[f.source_module] === S.sub
        );
        const active = S.activeSub;
        if (active && !active.startsWith('all_')) {
            const tab = (SUB_TABS[S.sub] || []).find(t => t.key === active);
            if (tab && tab.cat) {
                files = files.filter(f => f.category === tab.cat);
            } else {
                files = files.filter(f => SUB_CAT_MAP[f.category] === active);
            }
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
        if (!S.activeSub || !tabs.find(t => t.key === S.activeSub)) {
            S.activeSub = tabs[0].key;
        }
        return `<div class="arch-subtabs-bar">
            ${tabs.map(t => {
            const count = t.key.startsWith('all_') ? mainFiles.length
                : t.cat ? mainFiles.filter(f => f.category === t.cat).length
                    : mainFiles.filter(f => SUB_CAT_MAP[f.category] === t.key).length;
            const isActive = S.activeSub === t.key;
            return `<button class="arch-stab ${isActive ? 'arch-stab--active' : ''} ${!count && !t.key.startsWith('all_') ? 'arch-stab--empty' : ''}"
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

    function _renderGroup(sub, label, badgeCls) {
        const files = _filterFiles(sub);
        const preview = files.slice(0, 4);
        const hasMore = files.length > 4;
        const emptyHtml = !files.length ? `<div class="arch-empty-state arch-empty-state--sm"><div class="aes-title aes-title--sm">${tr('لا توجد مستندات')}</div></div>` : '';
        const gridHtml = preview.length ? `<div class="arch-doc-grid arch-doc-grid--compact">${preview.map(_cardHtml).join('')}</div>` : '';
        return `<div class="arch-group-section">
            <div class="arch-cat-hdr">
                <h3>${label} <span class="arch-badge ${badgeCls}">${files.length} ${tr('ملف')}</span></h3>
                ${hasMore ? `<button class="arch-btn arch-btn-ghost arch-btn--sm" onclick="ArchiveModule.switchSub('${sub}')">${tr('عرض الكل')} ←</button>` : ''}
            </div>
            ${emptyHtml}${gridHtml}
        </div>`;
    }

    function _cardHtml(f, i) {
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
                <button class="arch-doc-menu" title="استعراض" onclick="event.stopPropagation();ArchiveModule.openViewer(${f.id})">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                </button>
            </div>
            <div class="arch-doc-name" title="${_e(f.display_name)}">${_e(f.display_name)}</div>
            <div class="arch-doc-meta">
                <span class="arch-doc-ext">${(ext || '?').toUpperCase()}</span>
                <span>${f.file_size_formatted || '—'}</span>
            </div>
        </div>`;
    }

    function _renderGrid(files) {
        if (!files.length) return '';
        return `<div class="arch-doc-grid">${files.map((f, i) => {
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
        }).join('')}</div>`;
    }

    function _renderList(files) {
        if (!files.length) return '';
        return `<div class="arch-doc-list">${files.map(f => {
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
        }).join('')}</div>`;
    }

    function _renderEmpty(msg, hint) {
        return `<div class="arch-empty-state">
            <div class="aes-art">
                <svg viewBox="0 0 100 80" fill="none">
                    <ellipse cx="50" cy="72" rx="28" ry="5" fill="currentColor" opacity=".08"/>
                    <rect x="30" y="18" width="32" height="42" rx="5" fill="var(--bg-card)" stroke="currentColor" stroke-width="1.8" stroke-opacity=".3"/>
                    <path d="M38 30 L54 30" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity=".25"/>
                    <path d="M38 37 L54 37" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity=".2"/>
                    <circle cx="50" cy="54" r="10" fill="var(--bg-secondary)" stroke="currentColor" stroke-width="1.5" stroke-opacity=".3"/>
                    <path d="M46 50 L54 58 M54 50 L46 58" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity=".4"/>
                </svg>
            </div>
            <div class="aes-title">${msg}</div>
            <div class="aes-sub">${hint || 'جرّب تغيير القسم أو رفع مستند جديد'}</div>
        </div>`;
    }

    function _renderTable(files) {
        if (!files.length) return '';
        return `<div class="arch-table-wrap"><table class="arch-table">
            <thead><tr>
                <th>المستند</th><th>النوع</th><th>المصدر</th>
                <th>${tr('الحجم')}</th><th>${tr('تاريخ الرفع')}</th>
                <th>${tr('الصلاحية')}</th><th>الحالة</th><th></th>
            </tr></thead>
            <tbody>${files.map(f => {
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
                <td><div class="arch-tbl-name">${_emoji(f.file_extension)} ${_e(f.display_name)}</div><div class="arch-tbl-sub">${f.uploader_name || '—'}</div></td>
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
        }).join('')}</tbody></table></div>`;
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
        _s('prev-expiry', file.expiry_date ? _fmtDate(file.expiry_date) : 'لا يوجد');

        const dlEl = document.getElementById('prev-dl');
        if (dlEl) { dlEl.href = `${API}?action=download&id=${file.id}`; dlEl.download = file.display_name || 'document'; }

        document.getElementById('arch-preview')?.classList.add('open');
    }

    function closePreview() {
        document.getElementById('arch-preview')?.classList.remove('open');
        document.querySelectorAll('.arch-doc-card,.arch-list-item').forEach(c => c.classList.remove('selected'));
        S.viewingFile = null;
    }

    /* ══ استعراض الملف ══════════════════════════════════════ */
    let _viewerZoom = 100;

    function openViewer(id) {
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
            body.innerHTML = `<div class="arch-mock-doc"><div class="arch-mock-page" id="vwr-page">
                <div class="arch-watermark">أرشيف</div>
                <div class="arch-mock-hdr"><div class="arch-mock-co">${_e(f.source_ref || 'النظام')}</div><div class="arch-mock-stm">✓</div></div>
                <div class="arch-mock-title"><h2>${_e(f.display_name)}</h2><p>${_e(f.category_label || '')} — ${_fmtDate(f.created_at)}</p></div>
                <table class="arch-mock-table">
                    <thead><tr><th>البند</th><th>القيمة</th><th>الملاحظات</th></tr></thead>
                    <tbody>${rows.map((r, i) => `<tr ${i === rows.length - 1 ? 'class="total-row"' : ''}>${r.map(c => `<td>${_e(c)}</td>`).join('')}</tr>`).join('')}</tbody>
                </table>
                <div class="arch-mock-ftr"><span>نظام الأرشيف المالي</span><span>${_fmtDate(f.created_at)}</span><span>سري وخاص</span></div>
            </div></div>`;
        }

        document.getElementById('arch-viewer-overlay')?.classList.add('active');
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
        btn.innerHTML = '⏳ جارٍ الحفظ…';

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
            }
        } catch (e) {
            if (typeof showToast === 'function') showToast('خطأ في الاتصال بالخادم', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> حفظ التعديلات';
        }
    }

    /* ══ تبديل القسم ════════════════════════════════════════ */
    function switchSub(key) {
        S.sub = key;
        S.activeSub = '';
        closePreview();
        _syncSidebarActive();
        _renderContent();
    }

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

    /* ══ البحث والفلاتر ══════════════════════════════════════ */
    let _searchTimeout = null;

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
        document.body.classList.toggle('arch-list-view', mode === 'list');
        document.body.classList.toggle('arch-table-view', mode === 'table');
        if (mode === 'table' || S.sub !== 'all') _renderContent();
    }

    /* ══ رفع مستندات متعددة ════════════════════════════════ */
    let _uploadFiles = [];

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
            if (_uploadFiles.length >= 20) return;
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
            info.textContent = _uploadFiles.length > 0 ? `${_uploadFiles.length} ملف — ${_fmtBytes(total)}` : '—';
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
                    <div class="aum-fi-meta">${item.file.name} • ${_fmtBytes(item.file.size)}</div>
                </div>
                <select class="aum-fi-cat" onchange="_uploadFiles[${i}].cat=this.value">
                    ${['فاتورة_موردين', 'فاتورة_عملاء', 'خطاب_صادر', 'خطاب_وارد', 'إيصال_دفع', 'قيد_يومي', 'مستند_بنكي', 'أخرى']
                .map(c => `<option value="${c}" ${item.cat === c ? 'selected' : ''}>${c.replace('_', ' ')}</option>`).join('')}
                </select>
                <button class="aum-fi-del" onclick="_uploadFiles.splice(${i},1);_renderFileList();_onFilesSelected([])">✕</button>
            </div>`).join('');
    }

    async function submitMultiUpload() {
        if (!_uploadFiles.length) return;

        const globalCat = document.getElementById('aum-cat-global')?.value;
        const globalExpiry = document.getElementById('aum-expiry-global')?.value;
        if (globalCat) _uploadFiles.forEach(f => f.cat = globalCat);
        if (globalExpiry) _uploadFiles.forEach(f => f.expiry = globalExpiry);

        document.getElementById('arch-upload-overlay').classList.remove('active');
        document.getElementById('aum-progress-overlay').classList.add('active');

        const list = document.getElementById('aum-prog-list');
        const title = document.getElementById('aum-prog-title');
        const progIcon = document.getElementById('aum-prog-icon');
        const total = _uploadFiles.length;

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

        for (let i = 0; i < total; i++) {
            const item = _uploadFiles[i];
            const bar = document.getElementById(`aum-bar-${i}`);
            const st = document.getElementById(`aum-st-${i}`);
            const pi = document.getElementById(`aum-pi-${i}`);

            title.textContent = `جارٍ رفع الملف ${i + 1} من ${total}…`;
            if (bar) { bar.style.width = '0%'; bar.style.background = 'var(--accent-blue)'; }
            if (pi) pi.classList.add('aum-pi--active');
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
                    if (st) st.innerHTML = `<span title="${d.message || 'فشل'}">✗</span>`;
                    if (pi) { pi.classList.remove('aum-pi--active'); pi.classList.add('aum-pi--fail'); }
                }
            } catch (e) {
                failed++;
                await _animateBar(bar, 50, 100, 200);
                if (bar) bar.style.background = 'var(--accent-red)';
                if (st) st.textContent = '✗';
                if (pi) { pi.classList.remove('aum-pi--active'); pi.classList.add('aum-pi--fail'); }
            }

            if (i < total - 1) await new Promise(r => setTimeout(r, 600));
        }

        title.textContent = failed === 0 ? `✓ تم رفع جميع الملفات (${done})` : `اكتمل الرفع — ${done} ناجح، ${failed} فاشل`;
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

    /* ══ إضافة وثيقة ════════════════════════════════════════ */
    const ADD_FIELDS = {
        'فاتورة_موردين': [
            { id: 'aad-f-name', label: 'اسم الفاتورة *', type: 'text', ph: 'مثال: فاتورة مورد مواد' },
            { id: 'aad-f-ref', label: 'رقم الفاتورة', type: 'text', ph: 'أدخل رقم الفاتورة' },
            { id: 'aad-f-party', label: 'المورد', type: 'text', ph: 'اسم المورد' },
            { id: 'aad-f-value', label: 'المبلغ (ريال)', type: 'number', ph: '0' },
            { id: 'aad-f-date', label: 'تاريخ الفاتورة', type: 'date' },
            { id: 'aad-f-expiry', label: 'تاريخ الاستحقاق', type: 'date' },
        ],
        'فاتورة_عملاء': [
            { id: 'aad-f-name', label: 'اسم الفاتورة *', type: 'text', ph: 'مثال: فاتورة خدمات' },
            { id: 'aad-f-ref', label: 'رقم الفاتورة', type: 'text', ph: 'أدخل رقم الفاتورة' },
            { id: 'aad-f-party', label: 'العميل', type: 'text', ph: 'اسم العميل' },
            { id: 'aad-f-value', label: 'المبلغ (ريال)', type: 'number', ph: '0' },
            { id: 'aad-f-date', label: 'تاريخ الفاتورة', type: 'date' },
        ],
        'قيد_يومي': [
            { id: 'aad-f-name', label: 'وصف القيد *', type: 'text', ph: 'مثال: قيد راتب شهر يناير' },
            { id: 'aad-f-ref', label: 'رقم القيد', type: 'text', ph: 'أدخل رقم القيد' },
            { id: 'aad-f-value', label: 'المبلغ (ريال)', type: 'number', ph: '0' },
            { id: 'aad-f-date', label: 'التاريخ', type: 'date' },
        ],
        'مستند_بنكي': [
            { id: 'aad-f-name', label: 'وصف المستند *', type: 'text', ph: 'مثال: كشف حساب شهري' },
            { id: 'aad-f-bank', label: 'اسم البنك', type: 'text', ph: 'مثال: البنك الأهلي' },
            { id: 'aad-f-ref', label: 'رقم المرجع', type: 'text', ph: 'رقم الحساب أو الحوالة' },
            { id: 'aad-f-value', label: 'المبلغ (ريال)', type: 'number', ph: '0' },
            { id: 'aad-f-date', label: 'التاريخ', type: 'date' },
        ],
        'ضريبة_زكاة': [
            { id: 'aad-f-name', label: 'نوع الإقرار *', type: 'text', ph: 'مثال: إقرار ضريبة القيمة المضافة' },
            { id: 'aad-f-period', label: 'الفترة الضريبية', type: 'text', ph: 'مثال: Q1 2024' },
            { id: 'aad-f-value', label: 'المبلغ (ريال)', type: 'number', ph: '0' },
            { id: 'aad-f-date', label: 'تاريخ التقديم', type: 'date' },
        ],
        'خطاب_صادر': [
            { id: 'aad-f-name', label: 'عنوان الخطاب *', type: 'text', ph: 'مثال: خطاب طلب توريد' },
            { id: 'aad-f-party', label: 'الجهة المرسَل إليها', type: 'text', ph: 'اسم الجهة' },
            { id: 'aad-f-ref', label: 'رقم الخطاب', type: 'text', ph: 'أدخل رقم المرجع' },
            { id: 'aad-f-date', label: 'التاريخ', type: 'date' },
        ],
        'خطاب_وارد': [
            { id: 'aad-f-name', label: 'عنوان الخطاب *', type: 'text', ph: 'مثال: رد على استفسار' },
            { id: 'aad-f-party', label: 'الجهة المُرسِلة', type: 'text', ph: 'اسم الجهة' },
            { id: 'aad-f-ref', label: 'رقم الخطاب', type: 'text', ph: 'أدخل رقم المرجع' },
            { id: 'aad-f-date', label: 'تاريخ الاستلام', type: 'date' },
        ],
        'مراسلة_رسمية': [
            { id: 'aad-f-name', label: 'عنوان المراسلة *', type: 'text', ph: 'مثال: مراسلة وزارة المالية' },
            { id: 'aad-f-party', label: 'الجهة', type: 'text', ph: 'اسم الجهة' },
            { id: 'aad-f-ref', label: 'الرقم المرجعي', type: 'text', ph: 'أدخل الرقم المرجعي' },
            { id: 'aad-f-date', label: 'التاريخ', type: 'date' },
        ],
        'إيصال_دفع': [
            { id: 'aad-f-name', label: 'وصف الإيصال *', type: 'text', ph: 'مثال: إيصال دفع فاتورة' },
            { id: 'aad-f-ref', label: 'رقم الإيصال', type: 'text', ph: 'أدخل رقم الإيصال' },
            { id: 'aad-f-party', label: 'المستفيد', type: 'text', ph: 'اسم المستفيد' },
            { id: 'aad-f-value', label: 'المبلغ (ريال)', type: 'number', ph: '0' },
            { id: 'aad-f-date', label: 'التاريخ', type: 'date' },
        ],
        'أمر_دفع': [
            { id: 'aad-f-name', label: 'وصف أمر الدفع *', type: 'text', ph: 'مثال: أمر دفع مستحقات' },
            { id: 'aad-f-ref', label: 'رقم الأمر', type: 'text', ph: 'أدخل رقم الأمر' },
            { id: 'aad-f-party', label: 'الجهة', type: 'text', ph: 'اسم الجهة' },
            { id: 'aad-f-value', label: 'المبلغ (ريال)', type: 'number', ph: '0' },
            { id: 'aad-f-date', label: 'التاريخ', type: 'date' },
        ],
        'أخرى': [
            { id: 'aad-f-name', label: 'اسم المستند *', type: 'text', ph: 'أدخل اسماً وصفياً' },
            { id: 'aad-f-ref', label: 'الرقم المرجعي', type: 'text', ph: 'اختياري' },
            { id: 'aad-f-date', label: 'التاريخ', type: 'date' },
            { id: 'aad-f-notes', label: 'ملاحظات', type: 'textarea', ph: 'أي تفاصيل إضافية' },
        ],
    };

    let _addType = 'فاتورة_موردين';
    let _addFile = null;

    function openAdd() {
        _addType = 'فاتورة_موردين';
        _addFile = null;
        _goStep(1);
        document.getElementById('arch-add-overlay')?.classList.add('active');
    }

    function closeAdd(e) {
        if (e && e.target.id !== 'arch-add-overlay') return;
        document.getElementById('arch-add-overlay')?.classList.remove('active');
        _addFile = null;
    }

    function _goStep(step) {
        [1, 2, 3].forEach(s => {
            const panel = document.getElementById(`aad-panel-${s}`);
            const ind = document.getElementById(`aad-step-ind-${s}`);
            if (panel) panel.style.display = s === step ? '' : 'none';
            if (ind) {
                ind.classList.toggle('active', s === step);
                ind.classList.toggle('done', s < step);
            }
        });
        if (step === 2) _renderAddFields();
        const btnBack = document.getElementById('aad-btn-back');
        const btnNext = document.getElementById('aad-btn-next');
        const btnSave = document.getElementById('aad-save-btn');
        if (btnBack) btnBack.style.display = step > 1 ? '' : 'none';
        if (btnNext) {
            btnNext.style.display = step < 3 ? '' : 'none';
            btnNext.onclick = () => ArchiveModule._goStep(step + 1);
            if (btnBack) btnBack.onclick = () => ArchiveModule._goStep(step - 1);
        }
        if (btnSave) btnSave.style.display = step === 3 ? '' : 'none';
    }

    function _setAddType(type, btn) {
        _addType = type;
        document.querySelectorAll('.aad-type-card').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');
        const iconEl = document.getElementById('aad-selected-type-icon');
        const nameEl = document.getElementById('aad-selected-type-name');
        if (iconEl) iconEl.textContent = btn?.querySelector('.aad-type-card-icon')?.textContent || '📄';
        if (nameEl) nameEl.textContent = btn?.querySelector('.aad-type-card-name')?.textContent || type;
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
                : `<input type="${f.type}" id="${f.id}" class="aad-field-input" placeholder="${f.ph || ''}">`}
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
        btn.innerHTML = '⏳ جارٍ الحفظ…';

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
                if (typeof showToast === 'function') showToast('تم حفظ الوثيقة', 'success');
            } else {
                if (typeof showToast === 'function') showToast(d.message || 'فشل الحفظ', 'error');
            }
        } catch (e) {
            if (typeof showToast === 'function') showToast('خطأ في الاتصال', 'error');
        } finally {
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

    /* ══ CSS الصفحة الرئيسية ════════════════════════════════ */
    (function _injectHomeStyles() {
        if (document.getElementById('arch-home-css')) return;
        const s = document.createElement('style');
        s.id = 'arch-home-css';
        s.textContent = `
        .arch-home-wrap { padding:1.5rem; }
        .arch-home-header { margin-bottom:1.5rem; }
        .arch-home-title { font-size:1.2rem; font-weight:600; color:var(--text-primary); margin-bottom:.25rem; }
        .arch-home-sub { font-size:.82rem; color:var(--text-muted); }
        .arch-home-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:.85rem; margin-bottom:.5rem; }
        .arch-home-card {
            display:flex; align-items:center; gap:1rem; padding:1.1rem 1.25rem;
            background:var(--bg-card); border:1px solid var(--border-color);
            border-right:4px solid var(--card-color); border-radius:12px;
            cursor:pointer; transition:transform .15s, background .15s;
        }
        [dir=rtl] .arch-home-card { border-right:4px solid var(--card-color); border-left:none; }
        .arch-home-card:hover { background:var(--card-bg); transform:translateY(-2px); }
        .arch-home-card-icon { font-size:1.75rem; flex-shrink:0; }
        .arch-home-card-body { flex:1; min-width:0; }
        .arch-home-card-title { font-size:.9rem; font-weight:600; color:var(--text-primary); margin-bottom:.2rem; }
        .arch-home-card-desc { font-size:.74rem; color:var(--text-muted); line-height:1.4; }
        .arch-home-card-count { font-size:1.4rem; font-weight:700; color:var(--card-color); flex-shrink:0; min-width:32px; text-align:left; }
        @media(max-width:640px) { .arch-home-grid { grid-template-columns:1fr; } }
        `;
        document.head.appendChild(s);
    })();

    /* ══ مساعدات ════════════════════════════════════════════ */
    function _tags(f) {
        let h = '';
        const srcMap = {
            transactions: { label: 'معاملة مالية', cls: 'tag-gold' },
            correspondence: { label: 'خطاب', cls: 'tag-blue' },
            bank: { label: 'بنكي', cls: 'tag-teal' },
            budget: { label: 'موازنة', cls: 'tag-purple' },
            archive: { label: 'أرشيف', cls: 'tag-muted' },
        };
        const src = srcMap[f.source_module];
        if (src) h += `<span class="arch-tag ${src.cls}">${src.label}</span>`;
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

    function _iconCls(ext) {
        return { pdf: 'file-pdf', doc: 'file-doc', docx: 'file-doc', xls: 'file-xls', xlsx: 'file-xls', csv: 'file-xls', jpg: 'file-img', jpeg: 'file-img', png: 'file-img', gif: 'file-img' }[(ext || '').toLowerCase()] || 'file-pdf';
    }

    function _fmtDate(d) {
        if (!d) return '—';
        try { return new Date(d).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }); }
        catch { return d; }
    }

    function _fmtBytes(b) {
        if (!b) return '0 ب';
        const u = ['ب', 'ك', 'م', 'ج'], i = Math.min(3, Math.floor(Math.log(b) / Math.log(1024)));
        return (b / Math.pow(1024, i)).toFixed(1) + ' ' + u[i];
    }

    function _e(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    return {
        init, switchSub, setView, setSort, setSubTab,
        toggleSearch: () => document.getElementById('arch-search-input')?.focus(),
        onSearch, clearSearch, setExtFilter,
        selectFile, openViewer, closeViewer, _zoom,
        openEdit, closeEdit, _clearEditFile, submitEdit,
        closePreview, openUpload, closeUpload,
        submitMultiUpload, closeProgressModal,
        openAdd, closeAdd, _setAddType, _goStep,
        _clearFile, _onAddFileSelected, submitAdd,
        loadFiles, loadStats,
        _buildMapsFromCategories,
    };
})();