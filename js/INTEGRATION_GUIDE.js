/**
 * ═══════════════════════════════════════════════════════════════
 * MASAR Theme Editor — دليل التكامل مع صفحة الإعدادات الموجودة
 * Integration Guide for app-settings-core.js
 * ═══════════════════════════════════════════════════════════════
 *
 * الخطوات:
 * 1. أضف هذا الكود في loadSettingsPage() لإضافة تبويب "الهوية البصرية"
 * 2. أضف case في showSettingsSection()
 * 3. أضف script/link في index.php
 * ═══════════════════════════════════════════════════════════════
 */


/* ════════════════════════════════════════════════
   الخطوة 1: في loadSettingsPage() — أضف الزر
   ════════════════════════════════════════════════

في الدالة loadSettingsPage() ابحث عن شريط التبويبات:
   <div class="settings-topbar">

وأضف هذا الزر بعد آخر تبويب موجود:

*/

const THEME_TAB_BTN = `
    <button class="settings-tab-btn" data-section="theme" onclick="showSettingsSection('theme', this)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="13.5" cy="6.5" r="2.5"/>
            <circle cx="6.5" cy="14.5" r="2.5"/>
            <circle cx="17.5" cy="15.5" r="2.5"/>
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" opacity="0.3"/>
        </svg>
        الهوية البصرية
    </button>
`;
/* أضف هذا النص ضمن innerHTML للـ settings-topbar */


/* ════════════════════════════════════════════════
   الخطوة 2: في showSettingsSection() — أضف الـ case
   ════════════════════════════════════════════════

ابحث عن الدالة showSettingsSection() في app-settings-core.js
وأضف هذا الـ case:

*/

/*
async function showSettingsSection(section, btn) {
    // ... الكود الموجود ...

    switch (section) {
        case 'employees': await renderEmployeesSection(); break;
        case 'types':     await renderTypesSection();     break;
        case 'system':    await renderSystemSection();    break;

        // ✅ أضف هذا السطر:
        case 'theme':     await ThemeEditor.render('settingsContent'); break;

        default: break;
    }
}
*/


/* ════════════════════════════════════════════════
   الخطوة 3: في index.php — أضف الملفات
   ════════════════════════════════════════════════

في قسم <head> أو قبل </body>:

*/

const INDEX_PHP_ADDITIONS = `
<!-- Theme Editor CSS — قبل </head> -->
<link rel="stylesheet" href="theme-editor.css">

<!-- Theme Editor JS — قبل </body> أو مع باقي scripts -->
<script src="theme-editor.js"><\/script>
`;


/* ════════════════════════════════════════════════
   الخطوة 4 (اختيارية): تشغيل الثيم المحفوظ فوراً
   ════════════════════════════════════════════════

ThemeEditor.init() يُستدعى تلقائياً عند DOMContentLoaded.
يقرأ الثيم المحفوظ من قاعدة البيانات ويطبقه مباشرة دون انتظار.

لا تحتاج أي كود إضافي — يعمل تلقائياً.

*/


/* ════════════════════════════════════════════════
   ملاحظة: API endpoint المستخدم
   ════════════════════════════════════════════════

يستخدم theme-editor.js نفس نقاط API الموجودة:

GET  api/settings.php?action=get_system_settings
     ← يجلب جميع إعدادات النظام بما فيها theme_*

POST api/settings.php?action=save_system_setting
     body: { key: "theme_primary", value: "#3F5950" }
     ← يحفظ إعداد واحد في جدول system_settings

هذان الـ endpoint موجودان بالفعل في المشروع ✅
لا يحتاج تعديل في الـ backend.

*/

console.log('ThemeEditor integration guide loaded.');
