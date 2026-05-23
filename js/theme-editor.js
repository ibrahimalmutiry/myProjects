/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║   theme-editor.js — محرر الثيم الديناميكي                   ║
 * ║   يُضاف لصفحة الإعدادات كتبويب جديد "الهوية البصرية"        ║
 * ║   يحفظ الألوان في: system_settings (جدول موجود)             ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * الاستخدام:
 *   1. أضف زر التبويب في app-settings-core.js → loadSettingsPage()
 *   2. أضف case في showSettingsSection: 'theme' → ThemeEditor.render()
 *   3. أضف <link rel="stylesheet" href="theme-editor.css"> في index.php
 *   4. أضف <script src="theme-editor.js"></script> في index.php
 */

const ThemeEditor = (() => {

    /* ══════════════════════════════════════════════════════════
       1. تعريف المتغيرات القابلة للتعديل وتنظيمها في مجموعات
       ══════════════════════════════════════════════════════════ */
    const GROUPS = [
        {
            id: 'brand',
            icon: '🎨',
            label: 'الألوان الأساسية',
            vars: [
                {
                    key: 'theme_primary',
                    cssVar: '--primary',
                    label: 'اللون الرئيسي',
                    desc: 'Sidebar، هيدر الجداول، الأزرار الرئيسية',
                    default: '#3F5950',
                    affects: ['--btn-primary-bg', '--primary']
                },
                {
                    key: 'theme_primary_dark',
                    cssVar: '--primary-dark',
                    label: 'الرئيسي الداكن',
                    desc: 'Hover على الأزرار والعناصر التفاعلية',
                    default: '#2e4139'
                },
                {
                    key: 'theme_accent',
                    cssVar: '--accent',
                    label: 'لون التنبيه / الخطر',
                    desc: 'أزرار Danger، التحذيرات، شارات التنبيه',
                    default: '#F26F63',
                    affects: ['--accent-red', '--accent', '--color-danger']
                },
                {
                    key: 'theme_brand_dark',
                    cssVar: '--brand-dark',
                    label: 'لون النصوص الداكنة',
                    desc: 'عناوين الصفحات والنصوص البارزة',
                    default: '#402B29',
                    affects: ['--text-primary']
                },
            ]
        },
        {
            id: 'backgrounds',
            icon: '🖼️',
            label: 'الخلفيات',
            vars: [
                {
                    key: 'theme_bg_primary',
                    cssVar: '--bg-primary',
                    label: 'خلفية الصفحة',
                    desc: 'الخلفية العامة لجميع الصفحات',
                    default: '#ECE8E3'
                },
                {
                    key: 'theme_bg_card',
                    cssVar: '--bg-card',
                    label: 'خلفية البطاقات',
                    desc: 'Cards، نوافذ Modal، Sidebar',
                    default: '#F2EEEB',
                    affects: ['--secondary-bg2']
                },
                {
                    key: 'theme_bg_surface',
                    cssVar: '--bg-surface',
                    label: 'خلفية السطوح',
                    desc: 'رؤوس المجموعات، الخلفيات الثانوية',
                    default: '#E5E0DA'
                },
                {
                    key: 'theme_bg_secondary',
                    cssVar: '--bg-secondary',
                    label: 'الخلفية الثانوية',
                    desc: 'Sidebar background',
                    default: '#dedad4'
                },
            ]
        },
        {
            id: 'text',
            icon: '✍️',
            label: 'النصوص',
            vars: [
                {
                    key: 'theme_text_primary',
                    cssVar: '--text-primary',
                    label: 'النص الرئيسي',
                    desc: 'معظم النصوص في الصفحة',
                    default: '#402B29'
                },
                {
                    key: 'theme_text_secondary',
                    cssVar: '--text-secondary',
                    label: 'النص الثانوي',
                    desc: 'نصوص أقل أهمية، تسميات',
                    default: '#5a4240'
                },
                {
                    key: 'theme_text_muted',
                    cssVar: '--text-muted',
                    label: 'النص الخافت',
                    desc: 'Placeholders، تواريخ، ملاحظات',
                    default: '#9a8f8c'
                },
                {
                    key: 'theme_border',
                    cssVar: '--border-color',
                    label: 'لون الحدود',
                    desc: 'حدود الحقول والبطاقات والجداول',
                    default: '#cdc8c2'
                },
            ]
        },
        {
            id: 'sidebar',
            icon: '📌',
            label: 'الشريط الجانبي',
            vars: [
                {
                    key: 'theme_sidebar_header_bg',
                    cssVar: '--sidebar-header-bg',
                    label: 'خلفية هيدر Sidebar',
                    desc: 'الجزء العلوي الذي يحتوي الشعار',
                    default: '#3F5950',
                    customProp: true
                },
                {
                    key: 'theme_nav_active_bg',
                    cssVar: '--nav-active-bg',
                    label: 'خلفية العنصر النشط',
                    desc: 'لون الصفحة المختارة في القائمة',
                    default: '#3F5950',
                    customProp: true
                },
                {
                    key: 'theme_nav_hover_bg',
                    cssVar: '--nav-hover-bg',
                    label: 'Hover على القائمة',
                    desc: 'اللون عند مرور الماوس',
                    default: '#e8e4de',
                    customProp: true
                },
            ]
        },
        {
            id: 'status',
            icon: '🏷️',
            label: 'ألوان الحالات',
            vars: [
                {
                    key: 'theme_success',
                    cssVar: '--color-success',
                    label: 'النجاح / مكتمل',
                    desc: 'الحالات المكتملة، الموافقات',
                    default: '#2f7d52',
                    affects: ['--badge-green-text']
                },
                {
                    key: 'theme_warning',
                    cssVar: '--color-warning',
                    label: 'التحذير / قيد المراجعة',
                    desc: 'العمليات المعلقة والتحذيرات',
                    default: '#e8590c',
                    affects: ['--badge-amber-text']
                },
                {
                    key: 'theme_info',
                    cssVar: '--color-info',
                    label: 'المعلومات',
                    desc: 'الإشعارات المعلوماتية والروابط',
                    default: '#228be6',
                    affects: ['--accent-blue', '--badge-blue-text']
                },
            ]
        }
    ];

    /* ══════════════════════════════════════════════════════════
       2. Preset ثيمات جاهزة
       ══════════════════════════════════════════════════════════ */
    const PRESETS = [
        {
            id: 'masar',
            label: 'مسار MASAR',
            color: '#3F5950',
            values: {
                theme_primary: '#3F5950',
                theme_primary_dark: '#2e4139',
                theme_accent: '#F26F63',
                theme_brand_dark: '#402B29',
                theme_bg_primary: '#ECE8E3',
                theme_bg_card: '#F2EEEB',
                theme_bg_surface: '#E5E0DA',
                theme_bg_secondary: '#dedad4',
                theme_text_primary: '#402B29',
                theme_text_secondary: '#5a4240',
                theme_text_muted: '#9a8f8c',
                theme_border: '#cdc8c2',
                theme_sidebar_header_bg: '#3F5950',
                theme_nav_active_bg: '#3F5950',
                theme_nav_hover_bg: '#e8e4de',
                theme_success: '#2f7d52',
                theme_warning: '#e8590c',
                theme_info: '#228be6',
            }
        },
        {
            id: 'ocean',
            label: 'أزرق المحيط',
            color: '#1a5f7a',
            values: {
                theme_primary: '#1a5f7a',
                theme_primary_dark: '#124459',
                theme_accent: '#e05a2b',
                theme_brand_dark: '#1a2f3a',
                theme_bg_primary: '#e8f1f5',
                theme_bg_card: '#f0f6f9',
                theme_bg_surface: '#dceaf0',
                theme_bg_secondary: '#d4e4ec',
                theme_text_primary: '#1a2f3a',
                theme_text_secondary: '#2e4a58',
                theme_text_muted: '#7a9aaa',
                theme_border: '#c0d8e4',
                theme_sidebar_header_bg: '#1a5f7a',
                theme_nav_active_bg: '#1a5f7a',
                theme_nav_hover_bg: '#dceaf0',
                theme_success: '#2d8a5e',
                theme_warning: '#e05a2b',
                theme_info: '#1a5f7a',
            }
        },
        // {
        //     id: 'royal',
        //     label: 'البنفسجي الملكي',
        //     color: '#4a2c8a',
        //     values: {
        //         theme_primary: '#4a2c8a',
        //         theme_primary_dark: '#341f62',
        //         theme_accent: '#e85d9a',
        //         theme_brand_dark: '#2a1a4a',
        //         theme_bg_primary: '#f0ecf8',
        //         theme_bg_card: '#f6f3fb',
        //         theme_bg_surface: '#e8e2f4',
        //         theme_bg_secondary: '#ddd6ef',
        //         theme_text_primary: '#2a1a4a',
        //         theme_text_secondary: '#443270',
        //         theme_text_muted: '#8a7aaa',
        //         theme_border: '#c8c0e0',
        //         theme_sidebar_header_bg: '#4a2c8a',
        //         theme_nav_active_bg: '#4a2c8a',
        //         theme_nav_hover_bg: '#e8e2f4',
        //         theme_success: '#3a8a4a',
        //         theme_warning: '#c86a00',
        //         theme_info: '#2060c0',
        //     }
        // },
        {
            id: 'slate',
            label: 'الرمادي الأنيق',
            color: '#334155',
            values: {
                theme_primary: '#334155',
                theme_primary_dark: '#1e293b',
                theme_accent: '#f97316',
                theme_brand_dark: '#0f172a',
                theme_bg_primary: '#f1f5f9',
                theme_bg_card: '#f8fafc',
                theme_bg_surface: '#e2e8f0',
                theme_bg_secondary: '#dde3ea',
                theme_text_primary: '#0f172a',
                theme_text_secondary: '#334155',
                theme_text_muted: '#94a3b8',
                theme_border: '#cbd5e1',
                theme_sidebar_header_bg: '#334155',
                theme_nav_active_bg: '#334155',
                theme_nav_hover_bg: '#e2e8f0',
                theme_success: '#16a34a',
                theme_warning: '#d97706',
                theme_info: '#0ea5e9',
            }
        },
    ];

    /* ══════════════════════════════════════════════════════════
       3. State الداخلي
       ══════════════════════════════════════════════════════════ */
    let _currentValues = {};   // القيم الحالية
    let _savedValues = {};   // القيم المحفوظة في قاعدة البيانات
    let _styleEl = null; // عنصر <style> الديناميكي

    /* ══════════════════════════════════════════════════════════
       4. تطبيق الثيم على الصفحة فوراً (CSS Variables injection)
       ══════════════════════════════════════════════════════════ */
    function _injectStyle(values) {
        if (!_styleEl) {
            _styleEl = document.createElement('style');
            _styleEl.id = 'dynamic-theme-vars';
            document.head.appendChild(_styleEl);
        }

        const lines = [];

        // تطبيق كل متغير
        GROUPS.forEach(g => {
            g.vars.forEach(v => {
                const val = values[v.key];
                if (!val) return;

                // المتغير الأساسي
                lines.push(`  ${v.cssVar}: ${val};`);

                // المتغيرات المرتبطة (affects)
                if (v.affects) {
                    v.affects.forEach(a => lines.push(`  ${a}: ${val};`));
                }
            });
        });

        // متغيرات خاصة بالـ Sidebar
        const sp = values['theme_sidebar_header_bg'];
        const na = values['theme_nav_active_bg'];
        const nh = values['theme_nav_hover_bg'];
        const pr = values['theme_primary'];
        const ac = values['theme_accent'];
        const bp = values['theme_bg_primary'];
        const bc = values['theme_bg_card'];
        const bs = values['theme_bg_surface'];

        if (sp) lines.push(`  --sidebar-header-bg: ${sp};`);
        if (na) lines.push(`  --nav-active-bg: ${na};`);
        if (nh) lines.push(`  --nav-hover-bg: ${nh};`);

        // إعادة حساب المتغيرات المشتقة
        if (pr) {
            lines.push(`  --primary-subtle: ${_hexToRgba(pr, 0.1)};`);
            lines.push(`  --btn-primary-bg: ${pr};`);
            lines.push(`  --btn-secondary-text: ${pr};`);
            lines.push(`  --btn-secondary-border: ${pr};`);
        }
        if (ac) {
            lines.push(`  --accent-subtle: ${_hexToRgba(ac, 0.1)};`);
            lines.push(`  --accent-red: ${ac};`);
            lines.push(`  --color-danger: ${ac};`);
            // badge-red
            lines.push(`  --badge-red-bg: ${_hexToRgba(ac, 0.12)};`);
            lines.push(`  --badge-red-text: ${_darken(ac, 20)};`);
        }
        if (bp) {
            lines.push(`  --secondary-bg: ${bp};`);
        }
        if (bc) {
            lines.push(`  --secondary-bg2: ${bc};`);
        }
        if (bs) {
            lines.push(`  --bg-tertiary: ${_hexToRgba(bs, 0.8)};`);
        }

        // تطبيق على .sidebar-header مباشرة
        const sidebarHeaderRule = sp
            ? `.sidebar-header { background: ${sp} !important; }`
            : '';

        const navActiveRule = na
            ? `.nav-tab.active { background: ${na} !important; }`
            : '';

        const navHoverRule = nh
            ? `.nav-tab:hover { background: ${_hexToRgba(nh, 0.6)} !important; }`
            : '';

        _styleEl.textContent =
            `:root, [data-theme="light"] {\n${lines.join('\n')}\n}\n` +
            sidebarHeaderRule + '\n' +
            navActiveRule + '\n' +
            navHoverRule;
    }

    /* ── مساعدات تحويل الألوان ── */
    function _hexToRgba(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r},${g},${b},${alpha})`;
    }

    function _darken(hex, percent) {
        let r = parseInt(hex.slice(1, 3), 16);
        let g = parseInt(hex.slice(3, 5), 16);
        let b = parseInt(hex.slice(5, 7), 16);
        r = Math.max(0, Math.floor(r * (1 - percent / 100)));
        g = Math.max(0, Math.floor(g * (1 - percent / 100)));
        b = Math.max(0, Math.floor(b * (1 - percent / 100)));
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }

    /* ══════════════════════════════════════════════════════════
       5. الحفظ والتحميل من قاعدة البيانات
       ══════════════════════════════════════════════════════════ */
    async function _loadFromDB() {
        try {
            const res = await fetch('api/settings.php?action=get_system_settings');
            const data = await res.json();
            if (!data.success) return {};

            const values = {};
            (data.data || []).forEach(row => {
                if (row.setting_key && row.setting_key.startsWith('theme_')) {
                    values[row.setting_key] = row.setting_value;
                }
            });
            return values;
        } catch (e) {
            console.warn('ThemeEditor: failed to load from DB', e);
            return {};
        }
    }

    async function _saveToDB(values) {
        const entries = Object.entries(values);
        const results = await Promise.allSettled(
            entries.map(([key, value]) =>
                fetch('api/settings.php?action=save_system_setting', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ key, value })
                }).then(r => r.json())
            )
        );

        const failed = results.filter(r => r.status === 'rejected' || !r.value?.success);
        return failed.length === 0;
    }

    /* ══════════════════════════════════════════════════════════
       6. توليد HTML اللوحة
       ══════════════════════════════════════════════════════════ */
    function _buildRow(v, currentVal) {
        const val = currentVal || v.default;
        return `
        <div class="te-row" data-key="${v.key}">
            <div class="te-row-info">
                <div class="te-row-label">${v.label}</div>
                <div class="te-row-desc">${v.desc}</div>
            </div>
            <div class="te-color-input-wrap">
                <input
                    type="color"
                    class="te-color-picker"
                    value="${val}"
                    data-key="${v.key}"
                    data-cssvar="${v.cssVar}"
                    title="${v.label}"
                    oninput="ThemeEditor.onColorChange(this)"
                >
                <input
                    type="text"
                    class="te-color-hex"
                    value="${val.toUpperCase()}"
                    maxlength="7"
                    data-key="${v.key}"
                    data-cssvar="${v.cssVar}"
                    placeholder="#000000"
                    oninput="ThemeEditor.onHexChange(this)"
                    onblur="ThemeEditor.onHexBlur(this)"
                >
            </div>
        </div>`;
    }

    function _buildGroup(g, values) {
        return `
        <div class="te-group">
            <div class="te-group-head">
                <span class="te-group-icon">${g.icon}</span>
                <span class="te-group-title">${g.label}</span>
            </div>
            <div class="te-group-body">
                ${g.vars.map(v => _buildRow(v, values[v.key])).join('')}
            </div>
        </div>`;
    }

    function _buildPresets(activeId) {
        return `
        <div class="te-presets">
            <span class="te-preset-label">ثيمات جاهزة:</span>
            ${PRESETS.map(p => `
                <button
                    class="te-preset-btn ${activeId === p.id ? 'active' : ''}"
                    onclick="ThemeEditor.applyPreset('${p.id}')"
                    title="تطبيق ثيم ${p.label}"
                >
                    <span class="te-preset-swatch" style="background:${p.color}"></span>
                    ${p.label}
                </button>
            `).join('')}
        </div>`;
    }

    function _buildPreview() {
        return `
        <div class="te-preview-bar">
            <div class="te-preview-head">
                👁️ معاينة حية — Live Preview
            </div>
            <div class="te-preview-body">
                <button class="te-prev-btn-p">زر رئيسي</button>
                <button class="te-prev-btn-s">زر ثانوي</button>
                <button class="te-prev-btn-d">تنبيه / حذف</button>
                <span class="te-prev-badge-g">مكتمل</span>
                <span class="te-prev-badge-r">مرفوض</span>
                <div class="te-prev-table-wrap">
                    <table class="te-prev-table">
                        <thead>
                            <tr><th>الرقم</th><th>الوصف</th><th>المبلغ</th><th>الحالة</th></tr>
                        </thead>
                        <tbody>
                            <tr><td>001</td><td>مستلزمات مكتبية</td><td>٥٠٠ ر.س</td><td><span class="te-prev-badge-g">مكتمل</span></td></tr>
                            <tr><td>002</td><td>صيانة أجهزة</td><td>١٢٠٠ ر.س</td><td><span class="te-prev-badge-r">معلق</span></td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>`;
    }

    /* ══════════════════════════════════════════════════════════
       7. واجهة Render الرئيسية
       ══════════════════════════════════════════════════════════ */
    async function render(containerId) {
        const cont = document.getElementById(containerId || 'settingsContent');
        if (!cont) return;

        cont.innerHTML = `<div style="text-align:center;padding:3rem;color:var(--text-muted)">⏳ جاري تحميل إعدادات الثيم...</div>`;

        // تحميل من قاعدة البيانات
        const dbValues = await _loadFromDB();

        // دمج: قاعدة البيانات تأخذ الأولوية، ثم الافتراضيات
        _savedValues = {};
        _currentValues = {};
        GROUPS.forEach(g => {
            g.vars.forEach(v => {
                _currentValues[v.key] = dbValues[v.key] || v.default;
                _savedValues[v.key] = dbValues[v.key] || v.default;
            });
        });

        // تطبيق فوري
        _injectStyle(_currentValues);

        // تحديد الـ preset النشط
        const activePreset = _detectActivePreset(_currentValues);

        cont.innerHTML = `
        <div class="te-wrap">

            <!-- رأس اللوحة -->
            <div class="te-header">
                <div class="te-header-left">
                    <h2>🎨 محرر الهوية البصرية</h2>
                    <p>خصّص ألوان النظام وطبّق التغييرات فوراً على جميع الصفحات</p>
                </div>
                <div class="te-header-actions">
                    <button class="te-btn te-btn-reset" onclick="ThemeEditor.resetToDefault()" title="العودة لألوان MASAR الافتراضية">
                        ↺ إعادة الضبط
                    </button>
                    <button class="te-btn te-btn-export" onclick="ThemeEditor.exportCSS()" title="تصدير كملف CSS">
                        ⬇ تصدير CSS
                    </button>
                    <button class="te-btn te-btn-save" onclick="ThemeEditor.save()" id="te-save-btn">
                        💾 حفظ التغييرات
                    </button>
                </div>
            </div>

            <!-- ثيمات جاهزة -->
            ${_buildPresets(activePreset)}

            <!-- معاينة حية -->
            ${_buildPreview()}

            <!-- مجموعات الألوان -->
            <div class="te-groups">
                ${GROUPS.map(g => _buildGroup(g, _currentValues)).join('')}
            </div>

            <!-- ══ ① هوية المنظمة ══ -->
            <div class="te-group" style="margin-top:1.5rem">
                <div class="te-group-head">
                    <span class="te-group-icon">🏢</span>
                    <span class="te-group-title">هوية المنظمة</span>
                    <span style="font-size:.72rem;color:var(--text-muted)">اسم النظام والجهة</span>
                </div>
                <div class="te-group-body">
                    <div class="te-brand-grid" id="te-brand-fields">
                        <div class="te-loading">⏳ جاري التحميل...</div>
                    </div>
                    <div style="margin-top:.5rem;display:flex;justify-content:flex-end">
                        <button class="te-btn te-btn-save" onclick="ThemeEditor.saveBrand()">💾 حفظ الهوية</button>
                    </div>
                </div>
            </div>

            <!-- ══ ② الشعارات والأيقونات ══ -->
            <div class="te-group" style="margin-top:1rem">
                <div class="te-group-head">
                    <span class="te-group-icon">🖼</span>
                    <span class="te-group-title">الشعارات والأيقونات</span>
                    <span style="font-size:.72rem;color:var(--text-muted)">شعار السايدبار · Splash · Favicon</span>
                </div>
                <div class="te-group-body">
                <div class="te-logos-grid">
                    <div class="te-logo-item">
                        <div class="te-logo-preview" id="te-logo-main-preview">
                            <img src="images/logo.png" alt="الشعار" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" style="width:48px;height:48px;border-radius:50%;object-fit:cover">
                            <span style="display:none;font-size:1.5rem">🏢</span>
                        </div>
                        <div class="te-logo-info">
                            <strong>الشعار الرئيسي</strong>
                            <span>السايدبار والـ splash · PNG/SVG</span>
                            <label class="te-upload-btn">
                                📁 رفع صورة
                                <input type="file" accept="image/*" style="display:none" onchange="ThemeEditor.uploadLogo(this,'main')">
                            </label>
                        </div>
                    </div>
                    <div class="te-logo-item">
                        <div class="te-logo-preview" id="te-logo-secondary-preview">
                            <span style="font-size:1.5rem;opacity:.3">+</span>
                        </div>
                        <div class="te-logo-info">
                            <strong>الشعار الثانوي</strong>
                            <span>جانب الشعار الرئيسي في الـ splash</span>
                            <label class="te-upload-btn">
                                📁 رفع صورة
                                <input type="file" accept="image/*" style="display:none" onchange="ThemeEditor.uploadLogo(this,'secondary')">
                            </label>
                        </div>
                    </div>
                    <div class="te-logo-item">
                        <div class="te-logo-preview" style="width:36px;height:36px;border-radius:6px" id="te-favicon-preview">
                            <span style="font-size:1rem;opacity:.3">🌐</span>
                        </div>
                        <div class="te-logo-info">
                            <strong>Favicon</strong>
                            <span>أيقونة التبويب · ICO/PNG 32×32</span>
                            <label class="te-upload-btn">
                                📁 رفع
                                <input type="file" accept="image/x-icon,image/png" style="display:none" onchange="ThemeEditor.uploadLogo(this,'favicon')">
                            </label>
                        </div>
                    </div>
                </div>
                </div>
            </div>

            <!-- ══ ④ الخطوط والنصوص ══ -->
            <div class="te-group" style="margin-top:1rem">
                <div class="te-group-head">
                    <span class="te-group-icon">Aa</span>
                    <span class="te-group-title">الخطوط والنصوص</span>
                    <span style="font-size:.72rem;color:var(--text-muted)">خط النظام وحجمه</span>
                </div>
                <div class="te-group-body">
                <div class="te-font-grid">
                    <div class="te-var-row">
                        <label class="te-var-label">خط النظام</label>
                        <select id="te-font-family" class="te-font-select" onchange="ThemeEditor.previewFont(this.value)">
                            <option value="Cairo">Cairo</option>
                            <option value="Tajawal">Tajawal</option>
                            <option value="Noto Sans Arabic">Noto Sans Arabic</option>
                            <option value="IBM Plex Sans Arabic">IBM Plex Sans Arabic</option>
                            <option value="Almarai">Almarai</option>
                        </select>
                        <span class="te-var-preview-font" id="te-font-preview">نموذج النص</span>
                    </div>
                    <div class="te-var-row">
                        <label class="te-var-label">حجم الخط الأساسي</label>
                        <input type="range" min="12" max="18" step="1" value="14" id="te-font-size"
                            oninput="document.getElementById('te-font-size-val').textContent=this.value+'px'"
                            style="flex:1">
                        <span id="te-font-size-val" style="font-size:.78rem;min-width:36px;color:var(--text-muted)">14px</span>
                    </div>
                </div>
                <div style="margin-top:.5rem;display:flex;justify-content:flex-end">
                        <button class="te-btn te-btn-save" onclick="ThemeEditor.saveFont()">💾 حفظ الخط</button>
                    </div>
                </div>
            </div>

            <!-- ══ ⑤ الاقتباسات اليومية ══ -->
            <div class="te-group" style="margin-top:1rem">
                <div class="te-group-head">
                    <span class="te-group-icon">💬</span>
                    <span class="te-group-title">الاقتباسات اليومية</span>
                    <span style="font-size:.72rem;color:var(--text-muted)">تتغير تلقائياً في التوبار</span>
                </div>
                <div class="te-group-body">
                <div class="te-quotes-wrap">
                    <div id="te-quotes-list" class="te-quotes-list">
                        <div class="te-loading">⏳ جاري التحميل...</div>
                    </div>
                    <div class="te-quotes-add">
                        <input type="text" id="te-quote-input" class="te-quote-input"
                            placeholder="أضف اقتباساً جديداً..." maxlength="200"
                            onkeydown="if(event.key==='Enter') ThemeEditor.addQuote()">
                        <button class="te-btn te-btn-save" onclick="ThemeEditor.addQuote()" style="flex-shrink:0;white-space:nowrap">
                            + إضافة
                        </button>
                    </div>
                </div>
                </div>
            </div>

        </div>

        <!-- Toast -->
        <div class="te-toast" id="te-toast"></div>
        `;

        // تحميل البيانات بعد render
        _loadBrand();
        _loadQuotes();
    }

    /* ══════════════════════════════════════════════════════════
       8. معالجات الأحداث
       ══════════════════════════════════════════════════════════ */
    function onColorChange(input) {
        const key = input.dataset.key;
        const val = input.value;

        // تحديث الـ state
        _currentValues[key] = val;

        // تحديث حقل الـ hex المجاور
        const row = input.closest('.te-row');
        const hexEl = row.querySelector('.te-color-hex');
        if (hexEl) hexEl.value = val.toUpperCase();

        // تطبيق فوري
        _injectStyle(_currentValues);

        // تحديث الـ preset
        _highlightActivePreset(_detectActivePreset(_currentValues));
    }

    function onHexChange(input) {
        let val = input.value.trim();
        if (!val.startsWith('#')) val = '#' + val;

        // تحقق مبدئي (6 أرقام)
        if (!/^#[0-9A-Fa-f]{6}$/.test(val)) return;

        const key = input.dataset.key;
        _currentValues[key] = val;

        // تحديث color picker المجاور
        const row = input.closest('.te-row');
        const pickerEl = row.querySelector('.te-color-picker');
        if (pickerEl) pickerEl.value = val;

        _injectStyle(_currentValues);
        _highlightActivePreset(_detectActivePreset(_currentValues));
    }

    function onHexBlur(input) {
        let val = input.value.trim().toUpperCase();
        if (!val.startsWith('#')) val = '#' + val;
        // تصحيح إذا كان ناقصاً
        if (!/^#[0-9A-Fa-f]{6}$/.test(val)) {
            const key = input.dataset.key;
            input.value = (_currentValues[key] || '#000000').toUpperCase();
        } else {
            input.value = val;
        }
    }

    /* ══════════════════════════════════════════════════════════
       9. الثيمات الجاهزة
       ══════════════════════════════════════════════════════════ */
    function applyPreset(presetId) {
        const preset = PRESETS.find(p => p.id === presetId);
        if (!preset) return;

        // تحديث القيم
        Object.assign(_currentValues, preset.values);

        // تحديث واجهة المستخدم (color pickers + hex inputs)
        document.querySelectorAll('.te-color-picker, .te-color-hex').forEach(el => {
            const key = el.dataset.key;
            if (key && preset.values[key]) {
                el.value = preset.values[key].toUpperCase();
            }
        });

        // تطبيق
        _injectStyle(_currentValues);
        _highlightActivePreset(presetId);

        _toast(`تم تطبيق ثيم "${preset.label}" — اضغط حفظ لتثبيته`);
    }

    function _detectActivePreset(values) {
        return PRESETS.find(p =>
            Object.entries(p.values).every(([k, v]) =>
                (values[k] || '').toLowerCase() === v.toLowerCase()
            )
        )?.id || null;
    }

    function _highlightActivePreset(activeId) {
        document.querySelectorAll('.te-preset-btn').forEach(btn => {
            const isActive = btn.getAttribute('onclick')?.includes(`'${activeId}'`);
            btn.classList.toggle('active', !!isActive);
        });
    }

    /* ══════════════════════════════════════════════════════════
       10. الحفظ / إعادة الضبط / التصدير
       ══════════════════════════════════════════════════════════ */
    async function save() {
        const btn = document.getElementById('te-save-btn');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ جاري الحفظ...'; }

        const ok = await _saveToDB(_currentValues);

        if (btn) {
            btn.disabled = false;
            btn.innerHTML = ok
                ? '✅ تم الحفظ!'
                : '❌ فشل الحفظ';
            setTimeout(() => { btn.innerHTML = '💾 حفظ التغييرات'; }, 2500);
        }

        if (ok) {
            _savedValues = { ..._currentValues };
            _toast('✅ تم حفظ الثيم بنجاح — سيُطبّق على جميع الجلسات');
        } else {
            _toast('❌ فشل الحفظ — تحقق من الصلاحيات', true);
        }
    }

    function resetToDefault() {
        if (!confirm('هل تريد العودة إلى ألوان مسار MASAR الافتراضية؟')) return;
        applyPreset('masar');
    }

    function exportCSS() {
        const lines = [
            '/* ═══════════════════════════════════════════',
            '   مسار MASAR — ثيم مخصص',
            '   MASAR Custom Theme Export',
            '   ' + new Date().toLocaleString('ar-SA'),
            '   ═══════════════════════════════════════════ */',
            '',
            ':root, [data-theme="light"] {'
        ];

        GROUPS.forEach(g => {
            lines.push(`\n    /* ── ${g.label} ── */`);
            g.vars.forEach(v => {
                const val = _currentValues[v.key] || v.default;
                lines.push(`    ${v.cssVar}: ${val};  /* ${v.label} */`);
                if (v.affects) {
                    v.affects.forEach(a => lines.push(`    ${a}: ${val};`));
                }
            });
        });

        const pr = _currentValues['theme_primary'];
        if (pr) {
            lines.push(`\n    /* ── متغيرات مشتقة ── */`);
            lines.push(`    --primary-subtle: ${_hexToRgba(pr, 0.1)};`);
            lines.push(`    --btn-primary-bg: ${pr};`);
        }

        lines.push('}');

        const blob = new Blob([lines.join('\n')], { type: 'text/css' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'masar-custom-theme.css';
        a.click();
        URL.revokeObjectURL(a.href);

        _toast('⬇ تم تصدير ملف CSS');
    }

    /* ══════════════════════════════════════════════════════════
       11. تحميل الثيم عند بدء التطبيق (يُستدعى في app-common.js)
       ══════════════════════════════════════════════════════════ */
    /* ══════════════════════════════════════════════════════════
       الاقتباسات اليومية
       ══════════════════════════════════════════════════════════ */
    /* ══════════════════════════════════════════════════════════
       هوية المنظمة
       ══════════════════════════════════════════════════════════ */
    async function _loadBrand() {
        try {
            const res = await fetch('api/settings.php?action=get_brand_identity');
            const data = await res.json();
            const d = data.success ? (data.data || {}) : {};
            const el = document.getElementById('te-brand-fields');
            if (!el) return;
            el.innerHTML = `
            <div class="te-var-row">
                <label class="te-var-label">اسم النظام (عربي)</label>
                <input type="text" id="te-brand-ar" class="te-quote-input" value="${_escHtml(d.brand_name_ar || 'نظام مسار')}" placeholder="نظام مسار">
            </div>
            <div class="te-var-row">
                <label class="te-var-label">اسم النظام (إنجليزي)</label>
                <input type="text" id="te-brand-en" class="te-quote-input" value="${_escHtml(d.brand_name_en || 'MASAR System')}" placeholder="MASAR System">
            </div>
            <div class="te-var-row">
                <label class="te-var-label">اسم الجهة</label>
                <input type="text" id="te-org-name" class="te-quote-input" value="${_escHtml(d.org_name || '')}" placeholder="القطاع المالي">
            </div>`;
            // تحميل الخط المحفوظ
            const ff = document.getElementById('te-font-family');
            if (ff && d.font_family) ff.value = d.font_family;
            const fs = document.getElementById('te-font-size');
            const fv = document.getElementById('te-font-size-val');
            if (fs && d.font_size_base) { fs.value = parseInt(d.font_size_base); if (fv) fv.textContent = d.font_size_base + 'px'; }
        } catch (e) {
            const el = document.getElementById('te-brand-fields');
            if (el) el.innerHTML = '<div style="color:var(--accent-red);padding:.5rem">خطأ في التحميل</div>';
        }
    }

    async function _saveBrand() {
        const payload = {
            brand_name_ar: (document.getElementById('te-brand-ar')?.value || '').trim(),
            brand_name_en: (document.getElementById('te-brand-en')?.value || '').trim(),
            org_name: (document.getElementById('te-org-name')?.value || '').trim(),
        };
        try {
            const res = await fetch('api/settings.php?action=save_brand_identity', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
            });
            const data = await res.json();
            _toast(data.success ? '✅ تم حفظ هوية المنظمة' : (data.message || 'فشل'), !data.success);
        } catch (e) { _toast('خطأ في الاتصال', true); }
    }

    async function _saveFont() {
        const ff = document.getElementById('te-font-family')?.value || '';
        const fs = document.getElementById('te-font-size')?.value || '14';
        const payload = { font_family: ff, font_size_base: fs };
        try {
            const res = await fetch('api/settings.php?action=save_brand_identity', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) {
                document.documentElement.style.setProperty('--font-size-base', fs + 'px');
                if (ff) document.documentElement.style.setProperty('--font-family', ff + ', sans-serif');
                _toast('✅ تم حفظ إعدادات الخط');
            } else _toast(data.message || 'فشل', true);
        } catch (e) { _toast('خطأ في الاتصال', true); }
    }

    function _previewFont(family) {
        const el = document.getElementById('te-font-preview');
        if (el) el.style.fontFamily = family + ', sans-serif';
    }

    async function _uploadLogo(input, type) {
        const file = input.files[0];
        if (!file) return;
        const maxSize = 2 * 1024 * 1024;
        if (file.size > maxSize) { _toast('الحجم يتجاوز 2MB', true); return; }
        const fd = new FormData();
        fd.append('file', file);
        fd.append('type', type);
        try {
            const res = await fetch('api/settings.php?action=upload_logo', { method: 'POST', body: fd });
            const data = await res.json();
            if (data.success) {
                _toast('✅ تم رفع الشعار');
                const previewId = { main: 'te-logo-main-preview', secondary: 'te-logo-secondary-preview', favicon: 'te-favicon-preview' }[type];
                const prev = document.getElementById(previewId);
                if (prev) { const reader = new FileReader(); reader.onload = e => { prev.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:contain;border-radius:6px">`; }; reader.readAsDataURL(file); }
            } else _toast(data.message || 'فشل الرفع', true);
        } catch (e) { _toast('خطأ في الرفع', true); }
    }


    async function _loadQuotes() {
        const list = document.getElementById('te-quotes-list');
        if (!list) return;
        try {
            const res = await fetch('api/settings.php?action=get_quotes');
            const data = await res.json();
            const rows = data.success ? (data.data || []) : [];
            if (!rows.length) {
                list.innerHTML = '<div style="padding:1rem;color:var(--text-muted);text-align:center">لا توجد اقتباسات — أضف أولاً</div>';
                return;
            }
            list.innerHTML = rows.map((q, i) => `
                <div class="te-quote-row" data-id="${q.id}">
                    <span class="te-quote-num">${i + 1}</span>
                    <span class="te-quote-txt">${_escHtml(q.quote_text)}</span>
                    <button class="te-quote-del" onclick="ThemeEditor.deleteQuote(${q.id})" title="حذف">✕</button>
                </div>`).join('');
        } catch (e) {
            if (list) list.innerHTML = '<div style="padding:1rem;color:var(--accent-red)">خطأ في التحميل</div>';
        }
    }

    function _escHtml(str) {
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    async function _addQuote() {
        const input = document.getElementById('te-quote-input');
        if (!input) return;
        const text = input.value.trim();
        if (!text) { _toast('أدخل نص الاقتباس', true); return; }
        try {
            const res = await fetch('api/settings.php?action=save_quote', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ quote_text: text })
            });
            const data = await res.json();
            if (data.success) {
                input.value = '';
                _toast('✅ تمت الإضافة');
                _loadQuotes();
            } else {
                _toast(data.message || 'فشل الحفظ', true);
            }
        } catch (e) { _toast('خطأ في الاتصال', true); }
    }

    async function _deleteQuote(id) {
        if (!confirm('حذف هذا الاقتباس؟')) return;
        try {
            const res = await fetch('api/settings.php?action=delete_quote', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
            });
            const data = await res.json();
            if (data.success) { _toast('✅ تم الحذف'); _loadQuotes(); }
        } catch (e) { _toast('خطأ في الاتصال', true); }
    }


    async function init() {
        const dbValues = await _loadFromDB();
        if (Object.keys(dbValues).length === 0) return; // لا يوجد ثيم مخصص

        const values = {};
        GROUPS.forEach(g => {
            g.vars.forEach(v => {
                values[v.key] = dbValues[v.key] || v.default;
            });
        });
        _injectStyle(values);
    }

    /* ══════════════════════════════════════════════════════════
       12. Toast داخلي
       ══════════════════════════════════════════════════════════ */
    let _toastTimer = null;
    function _toast(msg, isError = false) {
        let el = document.getElementById('te-toast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'te-toast';
            el.className = 'te-toast';
            document.body.appendChild(el);
        }
        el.textContent = msg;
        el.style.background = isError ? 'var(--accent,#F26F63)' : 'var(--primary,#3F5950)';
        el.classList.add('show');
        clearTimeout(_toastTimer);
        _toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
    }

    /* ══════════════════════════════════════════════════════════
       Public API
       ══════════════════════════════════════════════════════════ */
    return {
        render,
        init,
        save,
        exportCSS,
        resetToDefault,
        applyPreset,
        onColorChange,
        onHexChange,
        onHexBlur,
        addQuote: _addQuote,
        deleteQuote: _deleteQuote,
        saveBrand: _saveBrand,
        saveFont: _saveFont,
        previewFont: _previewFont,
        uploadLogo: _uploadLogo,
    };

})();

/* ── تهيئة تلقائية عند تحميل الصفحة ── */
document.addEventListener('DOMContentLoaded', () => ThemeEditor.init());

