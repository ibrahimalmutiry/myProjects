/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║         app-rtl.js — نظام RTL/LTR الديناميكي الشامل                    ║
 * ║         Dynamic Bidirectional Layout Engine                              ║
 * ╠══════════════════════════════════════════════════════════════════════════╣
 * ║  يعمل بالتنسيق مع style-rtl-ltr.css                                     ║
 * ║  Works alongside style-rtl-ltr.css                                       ║
 * ║  أضفه في index.php بعد app-common.js                                     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

// ══════════════════════════════════════════════════════════════════════════
//  RTL Engine — الكائن الرئيسي
// ══════════════════════════════════════════════════════════════════════════

const RTLEngine = {

    // ── الحالة ──────────────────────────────────────────────────────────
    currentLang: 'ar',
    isRTL:       true,

    // ── تهيئة ────────────────────────────────────────────────────────────
    init() {
        // اقرأ اللغة المحفوظة
        this.currentLang = this._readSavedLang();
        this.isRTL = this.currentLang === 'ar';

        // طبّق فوراً (قبل أي render)
        this._applyToHTML();
        this._injectFonts();
        this._fixSidebarPosition();
        this._fixToggleButton();

        // استمع لتغييرات اللغة
        document.addEventListener('langChanged', (e) => {
            this.currentLang = e.detail.lang;
            this.isRTL = this.currentLang === 'ar';
            this.apply();
        });

        console.log(`[RTL Engine] Initialized — lang: ${this.currentLang}, RTL: ${this.isRTL}`);
    },

    // ── تطبيق كامل ───────────────────────────────────────────────────────
    apply() {
        this._applyToHTML();
        this._fixSidebarPosition();
        this._fixToggleButton();
        this._fixTables();
        this._fixModals();
        this._fixDropdowns();
        this._fixTimelines();
        this._fixForms();
        this._fixToast();
        this._fixPagination();
        this._fixNotifications();
        this._fixPageHeaders();
        this._mirrorDirectionalIcons();
        this._fixSearchInputs();

        // إطلاق حدث للملفات الأخرى
        document.dispatchEvent(new CustomEvent('rtlApplied', { detail: { lang: this.currentLang, isRTL: this.isRTL } }));
    },

    // ── قراءة اللغة المحفوظة ────────────────────────────────────────────
    _readSavedLang() {
        return localStorage.getItem('app_language')
            || this._getCookie('app_language')
            || document.documentElement.getAttribute('data-lang')
            || 'ar';
    },

    _getCookie(name) {
        return document.cookie.split(';')
            .map(c => c.trim())
            .find(c => c.startsWith(name + '='))
            ?.split('=')[1] || null;
    },

    // ── تطبيق على <html> ─────────────────────────────────────────────────
    _applyToHTML() {
        const html = document.documentElement;
        html.setAttribute('dir',       this.isRTL ? 'rtl' : 'ltr');
        html.setAttribute('lang',      this.currentLang);
        html.setAttribute('data-lang', this.currentLang);
    },

    // ── حقن الخطوط ───────────────────────────────────────────────────────
    _injectFonts() {
        if (document.getElementById('rtl-fonts-style')) return;
        const style = document.createElement('style');
        style.id = 'rtl-fonts-style';
        style.textContent = `
            @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&family=Inter:wght@300;400;500;600;700&display=swap');
        `;
        document.head.prepend(style);
    },

    // ── إصلاح السايدبار ───────────────────────────────────────────────────
    _fixSidebarPosition() {
        const sidebar = document.getElementById('sidebar');
        const mainContent = document.getElementById('main-content');
        if (!sidebar) return;

        const isCollapsed = sidebar.classList.contains('collapsed');
        const sidebarW = getComputedStyle(document.documentElement)
            .getPropertyValue(isCollapsed ? '--sidebar-collapsed' : '--sidebar-width').trim();

        if (this.isRTL) {
            sidebar.style.right = '0';
            sidebar.style.left  = 'auto';
            if (mainContent) {
                mainContent.style.marginRight = sidebarW;
                mainContent.style.marginLeft  = '0';
            }
        } else {
            sidebar.style.left  = '0';
            sidebar.style.right = 'auto';
            if (mainContent) {
                mainContent.style.marginLeft  = sidebarW;
                mainContent.style.marginRight = '0';
            }
        }
    },

    // ── إصلاح زر الطي ────────────────────────────────────────────────────
    _fixToggleButton() {
        const toggle  = document.getElementById('sidebarToggle');
        const sidebar = document.getElementById('sidebar');
        if (!toggle || !sidebar) return;

        const isCollapsed = sidebar.classList.contains('collapsed');
        const sidebarW = getComputedStyle(document.documentElement)
            .getPropertyValue(isCollapsed ? '--sidebar-collapsed' : '--sidebar-width').trim();

        if (this.isRTL) {
            toggle.style.right = `calc(${sidebarW} - 14px)`;
            toggle.style.left  = 'auto';
        } else {
            toggle.style.left  = `calc(${sidebarW} - 14px)`;
            toggle.style.right = 'auto';
        }

        // تحديث اتجاه أسهم زر الطي
        const closeIcon = toggle.querySelector('.toggle-icon-close polyline');
        const openIcon  = toggle.querySelector('.toggle-icon-open polyline');
        if (closeIcon && openIcon) {
            if (this.isRTL) {
                closeIcon.setAttribute('points', '15 18 9 12 15 6');
                openIcon.setAttribute('points',  '9 18 15 12 9 6');
            } else {
                closeIcon.setAttribute('points', '9 18 15 12 9 6');
                openIcon.setAttribute('points',  '15 18 9 12 15 6');
            }
        }
    },

    // ── إصلاح الجداول ────────────────────────────────────────────────────
    _fixTables() {
        document.querySelectorAll('table').forEach(table => {
            table.style.direction  = this.isRTL ? 'rtl' : 'ltr';
            table.style.textAlign  = this.isRTL ? 'right' : 'left';
        });
        document.querySelectorAll('th, td').forEach(cell => {
            // آخر عمود (الإجراءات) يبقى centered
            if (cell.classList.contains('actions-col') || cell.classList.contains('td-actions')) return;
            cell.style.textAlign = this.isRTL ? 'right' : 'left';
        });
    },

    // ── إصلاح النوافذ المنبثقة ───────────────────────────────────────────
    _fixModals() {
        document.querySelectorAll('.modal, .modal-overlay > .modal').forEach(modal => {
            modal.style.direction  = this.isRTL ? 'rtl' : 'ltr';
            modal.style.textAlign  = this.isRTL ? 'right' : 'left';
        });

        // close button
        document.querySelectorAll('.modal-close').forEach(btn => {
            if (this.isRTL) {
                btn.style.marginRight = 'auto';
                btn.style.marginLeft  = '0';
            } else {
                btn.style.marginLeft  = 'auto';
                btn.style.marginRight = '0';
            }
        });
    },

    // ── إصلاح الـ dropdowns ──────────────────────────────────────────────
    _fixDropdowns() {
        document.querySelectorAll('.dropdown-menu, .ss-dropdown').forEach(dd => {
            dd.style.direction = this.isRTL ? 'rtl' : 'ltr';
            dd.style.textAlign = this.isRTL ? 'right' : 'left';
            if (this.isRTL) { dd.style.right = '0'; dd.style.left = 'auto'; }
            else             { dd.style.left  = '0'; dd.style.right = 'auto'; }
        });
    },

    // ── إصلاح الـ timelines ──────────────────────────────────────────────
    _fixTimelines() {
        // Workflow progress bars
        document.querySelectorAll('.wf-steps, .pr-timeline, .stage-bar, .timeline-steps').forEach(el => {
            el.style.direction = this.isRTL ? 'rtl' : 'ltr';
        });

        // Vertical event timelines
        document.querySelectorAll('.events-timeline, .event-timeline, .activity-log').forEach(el => {
            if (this.isRTL) {
                el.style.borderRight = '2px solid var(--border-color)';
                el.style.borderLeft  = 'none';
                el.style.paddingRight = '1.5rem';
                el.style.paddingLeft  = '0';
            } else {
                el.style.borderLeft  = '2px solid var(--border-color)';
                el.style.borderRight = 'none';
                el.style.paddingLeft  = '1.5rem';
                el.style.paddingRight = '0';
            }
        });

        // Timeline dots
        document.querySelectorAll('.event-dot, .timeline-dot').forEach(dot => {
            if (this.isRTL) { dot.style.right = '-0.6rem'; dot.style.left = 'auto'; }
            else             { dot.style.left  = '-0.6rem'; dot.style.right = 'auto'; }
        });
    },

    // ── إصلاح النماذج ────────────────────────────────────────────────────
    _fixForms() {
        document.querySelectorAll('input, select, textarea').forEach(input => {
            const type = input.getAttribute('type') || '';
            // الأرقام والبريد دائماً LTR
            if (['number', 'tel', 'email', 'date', 'time', 'datetime-local'].includes(type)) {
                input.style.direction  = 'ltr';
                input.style.textAlign  = this.isRTL ? 'right' : 'left';
                return;
            }
            if (type === 'checkbox' || type === 'radio') return;
            input.style.direction  = this.isRTL ? 'rtl' : 'ltr';
            input.style.textAlign  = this.isRTL ? 'right' : 'left';
        });

        document.querySelectorAll('label').forEach(label => {
            label.style.textAlign = this.isRTL ? 'right' : 'left';
            label.style.display   = 'block';
        });
    },

    // ── إصلاح الـ toast ──────────────────────────────────────────────────
    _fixToast() {
        const toast = document.getElementById('toast');
        if (!toast) return;
        if (this.isRTL) { toast.style.right = '1.5rem'; toast.style.left = 'auto'; }
        else             { toast.style.left  = '1.5rem'; toast.style.right = 'auto'; }
        toast.style.textAlign = this.isRTL ? 'right' : 'left';
    },

    // ── إصلاح الـ pagination ─────────────────────────────────────────────
    _fixPagination() {
        document.querySelectorAll('.pagination, .pager').forEach(pg => {
            pg.style.direction = this.isRTL ? 'rtl' : 'ltr';
        });
    },

    // ── إصلاح التنبيهات ──────────────────────────────────────────────────
    _fixNotifications() {
        document.querySelectorAll('.notification-item, .notif-row').forEach(notif => {
            notif.style.direction  = this.isRTL ? 'rtl' : 'ltr';
            notif.style.textAlign  = this.isRTL ? 'right' : 'left';
        });
    },

    // ── إصلاح رؤوس الصفحات ───────────────────────────────────────────────
    _fixPageHeaders() {
        document.querySelectorAll(
            '.page-title, .section-title, .card-title, .dash-panel-title, h1, h2, h3, h4'
        ).forEach(el => {
            el.style.textAlign = this.isRTL ? 'right' : 'left';
        });

        // action bars
        document.querySelectorAll('.page-actions, .header-actions, .action-bar').forEach(bar => {
            bar.style.justifyContent = this.isRTL ? 'flex-start' : 'flex-end';
        });
    },

    // ── عكس الأيقونات الاتجاهية ──────────────────────────────────────────
    _mirrorDirectionalIcons() {
        // أسهم "عرض الكل"
        document.querySelectorAll('.dash-panel-link svg, .card-link svg, .view-all-btn svg').forEach(svg => {
            svg.style.transform = this.isRTL ? 'scaleX(-1)' : 'scaleX(1)';
        });

        // أسهم الصفوف
        document.querySelectorAll('.dash-row-arrow').forEach(svg => {
            svg.style.transform = this.isRTL ? 'scaleX(-1)' : 'scaleX(1)';
        });

        // أيقونات الرجوع
        document.querySelectorAll('.btn-back svg, .back-btn svg').forEach(svg => {
            svg.style.transform = this.isRTL ? 'scaleX(1)' : 'scaleX(-1)';
        });
    },

    // ── إصلاح حقول البحث ─────────────────────────────────────────────────
    _fixSearchInputs() {
        document.querySelectorAll('input[type="search"], .search-input').forEach(inp => {
            inp.style.direction = this.isRTL ? 'rtl' : 'ltr';
            if (this.isRTL) {
                inp.style.paddingRight = '2.5rem';
                inp.style.paddingLeft  = '0.75rem';
            } else {
                inp.style.paddingLeft  = '2.5rem';
                inp.style.paddingRight = '0.75rem';
            }
        });
        // search icons
        document.querySelectorAll('.search-icon, .search-btn-icon').forEach(icon => {
            if (this.isRTL) { icon.style.right = '0.75rem'; icon.style.left = 'auto'; }
            else             { icon.style.left  = '0.75rem'; icon.style.right = 'auto'; }
        });
    },
};

// ══════════════════════════════════════════════════════════════════════════
//  تكامل مع app-common.js — Override toggleLanguage
// ══════════════════════════════════════════════════════════════════════════

/**
 * نُعيد تعريف applyLanguage لتشمل RTL Engine
 * بعد تحميل هذا الملف
 */
(function patchAppCommon() {
    // انتظر تحميل app-common.js
    const originalApply = window.applyLanguage;

    window.applyLanguage = function() {
        // استدعِ الأصلي أولاً
        if (typeof originalApply === 'function') originalApply();

        // حدّث RTL Engine
        RTLEngine.currentLang = (typeof currentLang !== 'undefined') ? currentLang : 'ar';
        RTLEngine.isRTL = RTLEngine.currentLang === 'ar';
        RTLEngine.apply();

        // أطلق حدث لأي ملفات تستمع
        document.dispatchEvent(new CustomEvent('langChanged', {
            detail: { lang: RTLEngine.currentLang, isRTL: RTLEngine.isRTL }
        }));
    };

    window.initLanguage = function() {
        // اقرأ اللغة المحفوظة
        const fromStorage = localStorage.getItem('app_language');
        const fromCookie  = document.cookie.split(';')
            .map(c => c.trim())
            .find(c => c.startsWith('app_language='))?.split('=')[1];
        const fromHTML    = document.documentElement.getAttribute('data-lang');

        if (typeof window.currentLang !== 'undefined') {
            window.currentLang = fromStorage || fromCookie || fromHTML || 'ar';
        }

        // مزامنة
        const lang = fromStorage || fromCookie || fromHTML || 'ar';
        localStorage.setItem('app_language', lang);
        document.cookie = `app_language=${lang};path=/;max-age=31536000`;

        // طبّق
        RTLEngine.currentLang = lang;
        RTLEngine.isRTL = lang === 'ar';
        RTLEngine.init();

        // ترجمة عناصر data-i18n
        if (typeof translations !== 'undefined') {
            document.querySelectorAll('[data-i18n]').forEach(el => {
                const key = el.getAttribute('data-i18n');
                const val = translations[lang]?.[key] || translations['ar']?.[key];
                if (val !== undefined) el.textContent = val;
            });
            document.querySelectorAll('[data-i18n-title]').forEach(el => {
                const key = el.getAttribute('data-i18n-title');
                const val = translations[lang]?.[key] || translations['ar']?.[key];
                if (val !== undefined) el.setAttribute('title', val);
            });
            document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
                const key = el.getAttribute('data-i18n-placeholder');
                const val = translations[lang]?.[key] || translations['ar']?.[key];
                if (val !== undefined) el.setAttribute('placeholder', val);
            });
        }
    };
})();

// ══════════════════════════════════════════════════════════════════════════
//  MutationObserver — يراقب التغييرات الديناميكية في DOM
//  يُصلح العناصر الجديدة تلقائياً بعد كل render
// ══════════════════════════════════════════════════════════════════════════

const _rtlObserver = new MutationObserver((mutations) => {
    let hasNewNodes = false;
    mutations.forEach(m => {
        if (m.addedNodes.length > 0) hasNewNodes = true;
    });
    if (hasNewNodes) {
        // debounce: تأخير 80ms لتجنب الاستدعاءات المتكررة
        clearTimeout(RTLEngine._observerTimer);
        RTLEngine._observerTimer = setTimeout(() => {
            RTLEngine._fixTables();
            RTLEngine._fixTimelines();
            RTLEngine._fixForms();
            RTLEngine._fixPagination();
            RTLEngine._mirrorDirectionalIcons();
            RTLEngine._fixSearchInputs();
            RTLEngine._fixModals();
            RTLEngine._fixDropdowns();
            RTLEngine._fixPageHeaders();
            RTLEngine._fixToast();
        }, 80);
    }
});

// ══════════════════════════════════════════════════════════════════════════
//  دالة ترجمة قيم DB المتكاملة مع محتوى الجداول
//  Translates DB status values in rendered tables
// ══════════════════════════════════════════════════════════════════════════

function translateTableDBValues() {
    if (typeof DB_VALUES_MAP === 'undefined') return;
    const lang = RTLEngine.currentLang;
    if (lang === 'ar') return; // القيم في DB عربية أصلاً

    document.querySelectorAll('.status-badge, .badge, [data-status], .tx-status, .pr-status').forEach(el => {
        const arText = el.getAttribute('data-ar') || el.textContent.trim();
        if (!el.getAttribute('data-ar')) el.setAttribute('data-ar', arText);
        const enText = DB_VALUES_MAP[arText];
        if (enText) el.textContent = enText;
    });
}

// استمع لتطبيق الترجمة بعد كل render
document.addEventListener('rtlApplied', translateTableDBValues);

// ══════════════════════════════════════════════════════════════════════════
//  تصدير
// ══════════════════════════════════════════════════════════════════════════
window.RTLEngine = RTLEngine;

// ── تشغيل عند جاهزية DOM ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // تهيئة RTL Engine
    RTLEngine.init();

    // تشغيل MutationObserver على المحتوى الرئيسي
    const mainContent = document.getElementById('main-content');
    if (mainContent) {
        _rtlObserver.observe(mainContent, { childList: true, subtree: true });
    }

    console.log('[RTL Engine] DOM ready — Observer active');
});
