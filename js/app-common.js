/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║           app-common.js — الدوال العامة والمشتركة            ║
 * ║  يجب تضمين هذا الملف أولاً قبل أي ملف آخر                    ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * يحتوي هذا الملف على:
 *  • حالة التطبيق العامة (App object)
 *  • تهيئة DOM والمستمعات
 *  • نظام الترجمة (i18n) — عربي/إنجليزي
 *  • دوال التنسيق: الأموال، التاريخ، الوقت، المدة
 *  • دوال الواجهة العامة: modal، toast، loading، theme
 *  • دوال التنقل: switchTab
 *  • دوال المصادقة: logout
 */

// ═══════════════════════════════════════════════════════════
//  حالة التطبيق العامة
// ═══════════════════════════════════════════════════════════

/** كائن الحالة الرئيسي للتطبيق — يُستخدم من جميع الملفات */
/**
 * نظام إدارة معاملات القطاع المالي - JavaScript
 * Workflow Management System
 */

// الحالة العامة للتطبيق
const App = {
    currentTab: 'dashboard',
    transactions: [],
    stats: {},
    chartData: [],
    expandedRow: null,
    editingTransaction: null
};

// عناصر DOM
const DOM = {};

// تهيئة التطبيق
document.addEventListener('DOMContentLoaded', () => {
    initDOM();
    initEventListeners();
    const tab = (typeof window._firstAllowedTab === 'function')
        ? (window._firstAllowedTab() || 'dashboard')
        : 'dashboard';
    switchTab(tab);
});


/**
 * التحقق من صلاحية الحذف — يُستخدم في كل مكان قبل أزرار الحذف
 */
function userCanDelete() {
    if (typeof currentUser === 'undefined') return false;
    return currentUser.permissionLevel === 'system_admin' || currentUser.canDelete === true;
}

/**
 * التحقق من مستوى الصلاحية
 */
function userHasLevel(level) {
    if (typeof currentUser === 'undefined') return false;
    var hierarchy = { system_admin: 3, manager: 2, employee: 1 };
    var userLevel = hierarchy[currentUser.permissionLevel] || 0;
    var reqLevel = hierarchy[level] || 0;
    return userLevel >= reqLevel;
}


// ═══════════════════════════════════════════════════════════════
//  صلاحيات الإجراءات — Action-Level Permissions
//  يُكمِّل صلاحيات الصفحات بتحكم دقيق على مستوى الأزرار
// ═══════════════════════════════════════════════════════════════

/**
 * تعريف كل الإجراءات المتاحة وافتراضياتها لكل مستوى
 *
 * البنية: 'scope.action' 
 *   scope  = القسم (bank / transaction / employee / system)
 *   action = الإجراء المحدد
 */
const ACTION_PERMISSIONS_DEFAULTS = {

    // ── البنك ──────────────────────────────────────────────────
    'bank.record_balance': { system_admin: 1, manager: 1, employee: 1 }, // تسجيل رصيد اليوم
    'bank.edit_balance': { system_admin: 1, manager: 1, employee: 0 }, // تعديل الرصيد
    'bank.view_history': { system_admin: 1, manager: 1, employee: 1 }, // عرض السجل
    'bank.edit_account': { system_admin: 1, manager: 0, employee: 0 }, // تعديل بيانات الحساب
    'bank.add_account': { system_admin: 1, manager: 0, employee: 0 }, // إضافة حساب
    'bank.add_deposit': { system_admin: 1, manager: 1, employee: 1 }, // تسجيل وديعة
    'bank.confirm_deposit': { system_admin: 1, manager: 1, employee: 0 }, // تأكيد وديعة
    'bank.delete_deposit': { system_admin: 1, manager: 0, employee: 0 }, // حذف وديعة

    // ── المعاملات ──────────────────────────────────────────────
    'transaction.add': { system_admin: 1, manager: 1, employee: 1 }, // إضافة معاملة
    'transaction.edit': { system_admin: 1, manager: 1, employee: 0 }, // تعديل معاملة
    'transaction.delete': { system_admin: 1, manager: 0, employee: 0 }, // حذف معاملة
    'transaction.export': { system_admin: 1, manager: 1, employee: 0 }, // تصدير

    // ── الموظفين ───────────────────────────────────────────────
    'employee.add': { system_admin: 1, manager: 0, employee: 0 }, // إضافة موظف
    'employee.edit': { system_admin: 1, manager: 0, employee: 0 }, // تعديل موظف
    'employee.delete': { system_admin: 1, manager: 0, employee: 0 }, // حذف موظف
    'employee.permissions': { system_admin: 1, manager: 0, employee: 0 }, // إدارة الصلاحيات

    // ── الموازنة ───────────────────────────────────────────────
    'budget.review': { system_admin: 1, manager: 0, employee: 0 }, // مراجعة واعتماد الموازنة
    'budget.link_transaction': { system_admin: 1, manager: 0, employee: 0 }, // ربط بمعاملة مالية
    'budget.edit_code': { system_admin: 1, manager: 0, employee: 0 }, // تعديل رمز الموازنة

    // ── الحجوزات ───────────────────────────────────────────────
    'reservation.add': { system_admin: 1, manager: 1, employee: 1 }, // إضافة حجز جديد
    'reservation.view_own': { system_admin: 1, manager: 1, employee: 1 }, // عرض حجوزات قسمه
    'reservation.view_all': { system_admin: 1, manager: 1, employee: 0 }, // عرض كل الحجوزات
    'reservation.review': { system_admin: 1, manager: 0, employee: 0 }, // مراجعة الحجوزات (موازنة)
    'reservation.approve': { system_admin: 1, manager: 0, employee: 0 }, // اعتماد / رفض حجز
    'reservation.delete': { system_admin: 1, manager: 0, employee: 0 }, // حذف حجز
};

/**
 * canDo(action) — التحقق من صلاحية إجراء معين
 *
 * الأولوية:
 *  1. override فردي من actionPermissions (من DB)
 *  2. مستوى الصلاحية العام (system_admin / manager / employee)
 *  3. الافتراضي من ACTION_PERMISSIONS_DEFAULTS
 *
 * @param {string} action  مثال: 'bank.edit_balance'
 * @returns {boolean}
 */
function canDo(action) {
    if (typeof currentUser === 'undefined') return false;

    // مدير النظام: دائماً true
    if (currentUser.permissionLevel === 'system_admin') return true;

    // تحقق من override فردي (يُحمَّل من DB)
    const overrides = currentUser.actionPermissions || {};
    if (overrides.hasOwnProperty(action)) return !!overrides[action];

    // تحقق من الافتراضي حسب المستوى
    const def = ACTION_PERMISSIONS_DEFAULTS[action];
    if (!def) return false;

    return !!(def[currentUser.permissionLevel] ?? 0);
}

/**
 * showIf(action) — إرجاع '' أو 'display:none'
 * يُستخدم مباشرة في template strings
 * 
 * مثال: `<button style="${showIf('bank.edit_balance')}">تعديل الرصيد</button>`
 */
function showIf(action) {
    return canDo(action) ? '' : 'display:none';
}

/**
 * hiddenIf(action) — عكس showIf
 */
function hiddenIf(action) {
    return canDo(action) ? 'display:none' : '';
}

// تهيئة عناصر DOM
function initDOM() {
    DOM.mainContent = document.getElementById('main-content');
    DOM.navTabs = document.querySelectorAll('.nav-tab');
    DOM.notificationBadge = document.getElementById('notification-badge');
    DOM.modal = document.getElementById('modal');
    DOM.modalTitle = document.getElementById('modal-title');
    DOM.modalBody = document.getElementById('modal-body');
    DOM.toast = document.getElementById('toast');
}

// تهيئة مستمعات الأحداث
function initEventListeners() {
    DOM.navTabs.forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    document.querySelector('.modal-close')?.addEventListener('click', closeModal);
    document.querySelector('.modal-overlay')?.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-overlay')) closeModal();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });
}


// ═══════════════════════════════════════════════════════════
//  نظام الترجمة (i18n)
//  الاستخدام: t('key') تُرجع النص بالغة الحالية
// ═══════════════════════════════════════════════════════════
/**
 * نظام إدارة معاملات القطاع المالي - JavaScript
 */

// ========== نظام الترجمة (i18n) البداية ==========

// قاموس الترجمة
const translations = {
    ar: {
        // العنوان
        app_title: "نظام إدارة معاملات القطاع المالي",
        app_subtitle: "Workflow Management System",

        // التنقل الرئيسي
        dashboard: "لوحة التحكم",
        transactions: "المعاملات",
        settings: "الإعدادات",

        // أزرار الشريط العلوي
        toggle_theme: "تبديل الوضع",
        change_language: "تغيير اللغة",
        notifications: "التنبيهات",
        logout: "تسجيل الخروج",

        // لوحة التحكم
        system_overview: "نظرة عامة على النظام",
        total_transactions: "إجمالي المعاملات",
        completed: "المكتملة",
        needs_followup: "تحتاج متابعة",
        total_amount: "إجمالي المبالغ",
        urgent_transactions: "المعاملات العاجلة",
        all: "الكل",
        urgent: "عاجل",
        followup: "متابعة",

        // جدول المعاملات
        transaction_number: "رقم المعاملة",
        transaction_type: "نوع المعاملة",
        amount: "المبلغ",
        status: "الحالة",
        date: "التاريخ",
        actions: "الإجراءات",

        // الحالات
        new_status: "جديد",
        received: "مستلم",
        in_budget: "في الموازنة",
        in_payment: "في الدفع",
        paid: "مدفوع",
        rejected: "مرفوض",

        // صفحة الإعدادات
        system_settings: "إعدادات النظام",
        manage_employees_transactions: "إدارة الموظفين والمعاملات وإعدادات النظام",
        resource_management: "إدارة الموارد",
        employees: "الموظفين",
        manage_employee_accounts: "إدارة حسابات الموظفين",
        employee_performance: "أداء الموظفين",
        reports_tracking: "تقارير ومتابعة الأداء",
        transactions_section: "المعاملات",
        transaction_types: "أنواع المعاملات",
        transaction_categories: "تصنيفات المعاملات",
        all_transactions: "جميع المعاملات",
        view_manage_transactions: "عرض وإدارة المعاملات",
        system_section: "النظام",
        system_settings_desc: "إعدادات النظام",
        system_info_tools: "معلومات وأدوات النظام",

        // إدارة الموظفين
        employee_management: "إدارة الموظفين",
        add_employee: "إضافة موظف",
        edit_employee: "تعديل موظف",
        delete_employee: "حذف موظف",
        employee_name: "اسم الموظف",
        email: "البريد الإلكتروني",
        phone: "رقم الهاتف",
        department: "القسم",

        // الأقسام/الأدوار
        admin: "مدير النظام",
        receiver: "الاستلام",
        budget: "الموازنة",
        payment: "الدفع",
        invoice: "الفوترة",

        // أزرار عامة
        save: "حفظ",
        cancel: "إلغاء",
        edit: "تعديل",
        delete: "حذف",
        add: "إضافة",
        search: "بحث",
        filter: "فلترة",
        export: "تصدير",
        print: "طباعة",
        close: "إغلاق",
        confirm: "تأكيد",

        // رسائل
        success: "نجاح",
        error: "خطأ",
        warning: "تحذير",
        info: "معلومة",
        loading: "جاري التحميل...",
        no_data: "لا توجد بيانات",
        no_employees: "لا يوجد موظفين",
        confirm_delete: "هل أنت متأكد من الحذف؟",
        saved_successfully: "تم الحفظ بنجاح",
        deleted_successfully: "تم الحذف بنجاح",
        error_occurred: "حدث خطأ",

        // إضافة معاملة
        add_transaction: "إضافة معاملة",
        transaction_details: "تفاصيل المعاملة",
        attachments: "المرفقات",
        notes: "ملاحظات",

        // إعدادات النظام
        system_info: "معلومات النظام",
        system_name: "اسم النظام",
        version: "الإصدار",
        database: "قاعدة البيانات",
        danger_zone: "منطقة الخطر",
        clear_all_transactions: "حذف جميع المعاملات",
        this_action_irreversible: "هذا الإجراء لا يمكن التراجع عنه",
        system_stats: "إحصائيات النظام",

        // العملة
        currency: "ر.س",

        // الوقت
        minutes: "دقيقة",
        hours: "ساعة",
        days: "يوم",
        avg: "متوسط"
    },

    en: {
        // Title
        app_title: "Workflow Management System",
        app_subtitle: "نظام إدارة معاملات القطاع المالي",

        // Main navigation
        dashboard: "Dashboard",
        transactions: "Transactions",
        settings: "Settings",

        // Top bar buttons
        toggle_theme: "Toggle Theme",
        change_language: "Change Language",
        notifications: "Notifications",
        logout: "Logout",

        // Dashboard
        system_overview: "System Overview",
        total_transactions: "Total Transactions",
        completed: "Completed",
        needs_followup: "Needs Follow-up",
        total_amount: "Total Amount",
        urgent_transactions: "Urgent Transactions",
        all: "All",
        urgent: "Urgent",
        followup: "Follow-up",

        // Transaction table
        transaction_number: "Transaction #",
        transaction_type: "Type",
        amount: "Amount",
        status: "Status",
        date: "Date",
        actions: "Actions",

        // Statuses
        new_status: "New",
        received: "Received",
        in_budget: "In Budget",
        in_payment: "In Payment",
        paid: "Paid",
        rejected: "Rejected",

        // Settings page
        system_settings: "System Settings",
        manage_employees_transactions: "Manage employees, transactions and system settings",
        resource_management: "Resource Management",
        employees: "Employees",
        manage_employee_accounts: "Manage employee accounts",
        employee_performance: "Employee Performance",
        reports_tracking: "Reports and performance tracking",
        transactions_section: "Transactions",
        transaction_types: "Transaction Types",
        transaction_categories: "Transaction categories",
        all_transactions: "All Transactions",
        view_manage_transactions: "View and manage transactions",
        system_section: "System",
        system_settings_desc: "System Settings",
        system_info_tools: "System info and tools",

        // Employee management
        employee_management: "Employee Management",
        add_employee: "Add Employee",
        edit_employee: "Edit Employee",
        delete_employee: "Delete Employee",
        employee_name: "Employee Name",
        email: "Email",
        phone: "Phone",
        department: "Department",

        // Departments/Roles
        admin: "System Admin",
        receiver: "Receiving",
        budget: "Budget",
        payment: "Payment",
        invoice: "Invoice",

        // General buttons
        save: "Save",
        cancel: "Cancel",
        edit: "Edit",
        delete: "Delete",
        add: "Add",
        search: "Search",
        filter: "Filter",
        export: "Export",
        print: "Print",
        close: "Close",
        confirm: "Confirm",

        // Messages
        success: "Success",
        error: "Error",
        warning: "Warning",
        info: "Info",
        loading: "Loading...",
        no_data: "No data available",
        no_employees: "No employees",
        confirm_delete: "Are you sure you want to delete?",
        saved_successfully: "Saved successfully",
        deleted_successfully: "Deleted successfully",
        error_occurred: "An error occurred",

        // Add transaction
        add_transaction: "Add Transaction",
        transaction_details: "Transaction Details",
        attachments: "Attachments",
        notes: "Notes",

        // System settings
        system_info: "System Info",
        system_name: "System Name",
        version: "Version",
        database: "Database",
        danger_zone: "Danger Zone",
        clear_all_transactions: "Clear All Transactions",
        this_action_irreversible: "This action is irreversible",
        system_stats: "System Statistics",

        // Currency
        currency: "SAR",

        // Time
        minutes: "min",
        hours: "hr",
        days: "day",
        avg: "avg"
    }
};

// اللغة الحالية
let currentLang = localStorage.getItem('app_language') || 'ar';

// دالة الحصول على الترجمة
function t(key) {
    return translations[currentLang][key] || translations['ar'][key] || key;
}

// دالة تبديل اللغة
function toggleLanguage() {
    currentLang = currentLang === 'ar' ? 'en' : 'ar';
    localStorage.setItem('app_language', currentLang);
    applyLanguage();
}

// دالة تطبيق اللغة
function applyLanguage() {
    const html = document.documentElement;

    // تغيير اتجاه الصفحة
    if (currentLang === 'ar') {
        html.setAttribute('dir', 'rtl');
        html.setAttribute('lang', 'ar');
    } else {
        html.setAttribute('dir', 'ltr');
        html.setAttribute('lang', 'en');
    }

    html.setAttribute('data-lang', currentLang);

    // تحديث نص زر اللغة
    // const langText = document.querySelector('.lang-text');
    // if (langText) {
    //     langText.textContent = currentLang === 'ar' ? 'EN' : 'ع';
    // }

    // تحديث جميع العناصر التي تحتوي على data-i18n
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (translations[currentLang][key]) {
            el.textContent = translations[currentLang][key];
        }
    });

    // تحديث العناصر التي تحتوي على data-i18n-title
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        if (translations[currentLang][key]) {
            el.setAttribute('title', translations[currentLang][key]);
        }
    });

    // تحديث العناصر التي تحتوي على data-i18n-placeholder
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (translations[currentLang][key]) {
            el.setAttribute('placeholder', translations[currentLang][key]);
        }
    });

    // إعادة تحميل المحتوى الحالي
    refreshCurrentContent();
}

// دالة إعادة تحميل المحتوى الحالي
function refreshCurrentContent() {
    if (typeof App !== 'undefined' && App.currentTab) {
        if (App.currentTab === 'dashboard') {
            if (typeof loadDashboard === 'function') loadDashboard();
        } else if (App.currentTab === 'transactions') {
            if (typeof loadTransactions === 'function') loadTransactions();
        } else if (App.currentTab === 'settings') {
            if (typeof loadSettingsPage === 'function') loadSettingsPage();
        } else if (App.currentTab === 'sla') {
            if (typeof loadSlaPage === 'function') loadSlaPage();
        } else if (App.currentTab === 'performance') {
            if (typeof loadPerformancePage === 'function') loadPerformancePage();
        }
    }
}

// تهيئة اللغة عند تحميل الصفحة
function initLanguage() {
    currentLang = localStorage.getItem('app_language') || 'ar';
    const html = document.documentElement;

    if (currentLang === 'en') {
        html.setAttribute('dir', 'ltr');
        html.setAttribute('lang', 'en');
    }

    html.setAttribute('data-lang', currentLang);

    // const langText = document.querySelector('.lang-text');
    // if (langText) {
    //     langText.textContent = currentLang === 'ar' ? 'EN' : 'ع';
    // }

    // تحديث العناصر الثابتة
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (translations[currentLang][key]) {
            el.textContent = translations[currentLang][key];
        }
    });

    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        if (translations[currentLang][key]) {
            el.setAttribute('title', translations[currentLang][key]);
        }
    });
}
// ========== نظام الترجمة (i18n) النهاية ==========

// تصدير الدوال للاستخدام العام
window.t = t;
window.toggleLanguage = toggleLanguage;
window.applyLanguage = applyLanguage;
window.initLanguage = initLanguage;



// ═══════════════════════════════════════════════════════════
//  دوال التنسيق المشتركة
// ═══════════════════════════════════════════════════════════

/**
 * تنسيق مبلغ مالي موحّد — الدالة المرجعية لكل الملفات
 * الناتج دائماً: "1,234.50 ر.س"  (أرقام إنجليزية، منزلتان عشريتان، فاصلة آلاف)
 * @param {number|string} amount - المبلغ
 * @returns {string}
 */
function formatMoney(amount) {
    return (parseFloat(amount) || 0)
        .toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        + ' ر.س';
}

/**
 * نفس formatMoney — اسم بديل للتوافق مع app-bank.js القديم
 */
var fmtMoney = formatMoney;

/**
 * تنسيق رقم بفواصل الآلاف
 * @param {number} amount - الرقم
 * @returns {string} مثال: "1,234"
 */
function formatNumber(amount) {
    return (parseFloat(amount) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * تنسيق وقت الإنشاء بالعربية
 * @param {string} datetime - تاريخ ISO
 * @returns {string} مثال: "١٥ يناير ٢٠٢٥ - ١٠:٣٠"
 */
function formatCreationTime(datetime) {
    if (!datetime) return '—';
    try {
        const date = new Date(datetime);
        const dateStr = date.toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' });
        const timeStr = date.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
        return dateStr + ' - ' + timeStr;
    } catch (e) {
        return datetime;
    }
}

/**
 * عرض مؤشر التحميل في المحتوى الرئيسي
 * تُستخدم قبل جلب البيانات من الخادم
 */
function showLoading() {
    DOM.mainContent.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
}

/**
 * فتح النافذة المنبثقة العامة
 * تمنع التمرير في body أثناء فتح النافذة
 */
function openModal() {
    DOM.modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

/**
 * إغلاق النافذة المنبثقة وإعادة حالة التطبيق
 */
function closeModal() {
    DOM.modal.classList.remove('active');
    document.body.style.overflow = '';
    App.editingTransaction = null;
}

/**
 * عرض رسالة Toast مؤقتة
 * @param {string} message - نص الرسالة
 * @param {string} type - نوع الرسالة: success|error|warning|info
 */
function showToast(message, type) {
    type = type || 'success';
    DOM.toast.textContent = message;
    DOM.toast.className = 'toast ' + type + ' show';

    setTimeout(function () {
        DOM.toast.classList.remove('show');
    }, 3000);
}

// ========== قسم الإعدادات ==========
var SettingsData = {
    employees: [],
    types: [],
    currentFilter: 'all'
};

// تحميل صفحة الإعدادات

// ═══════════════════════════════════════════════════════════
//  التنقل بين التبويبات
// ═══════════════════════════════════════════════════════════

/**
 * التنقل بين تبويبات التطبيق الرئيسية
 * @param {string} tab - اسم التبويب: dashboard|transactions|correspondence|bank-deposits|settings
 * تُحدّث App.currentTab وتُفعّل التبويب المحدد وتستدعي دالة التحميل المناسبة
 */
function switchTab(tab) {
    // ── فحص الصلاحية — يمنع التحميل ويعرض رسالة ────────────
    if (typeof currentUser !== 'undefined' && currentUser.permissionLevel !== 'system_admin') {
        const perms = currentUser.pagePermissions || {};
        if (perms.hasOwnProperty(tab) && !perms[tab]) {
            if (DOM.mainContent) {
                DOM.mainContent.innerHTML = `
                    <div style="display:flex;flex-direction:column;align-items:center;
                                justify-content:center;min-height:55vh;gap:.85rem;
                                color:var(--text-muted);text-align:center;padding:2rem">
                        <div style="font-size:3.5rem;opacity:.35">🔒</div>
                        <h2 style="margin:0;color:var(--text-primary);font-size:1.2rem">غير مصرح بالوصول</h2>
                        <p style="margin:0;font-size:.85rem;max-width:300px;line-height:1.6">
                            ليس لديك صلاحية لعرض هذه الصفحة.<br>تواصل مع مدير النظام.
                        </p>
                    </div>`;
            }
            showToast('🔒 ليس لديك صلاحية الوصول لهذه الصفحة', 'error');
            return;
        }
    }

    App.currentTab = tab;
    App.expandedRow = null;

    DOM.navTabs.forEach(t => {
        t.classList.toggle('active', t.dataset.tab === tab);
    });

    if (tab === 'dashboard') {
        loadDashboard();
    } else if (tab === 'transactions') {
        loadTransactions();
    } else if (tab === 'correspondence') {
        loadCorrespondencePage();
    } else if (tab === 'bank-deposits') {
        loadBankDepositsPage();
    } else if (tab === 'notifications') {
        if (typeof loadNotificationsPage === 'function') loadNotificationsPage();
    } else if (tab === 'sla') {
        if (typeof loadSlaPage === 'function') loadSlaPage();
    } else if (tab === 'performance') {
        if (typeof loadPerformancePage === 'function') loadPerformancePage();
    } else if (tab === 'reservations') {
        if (typeof loadBudgetReservationsPage === 'function') loadBudgetReservationsPage();
    } else if (tab === 'settings') {
        loadSettingsPage();
    }
}


// تبديل الوضع الليلي/النهاري
function toggleTheme() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme');

    if (currentTheme === 'light') {
        html.removeAttribute('data-theme');
        localStorage.setItem('theme', 'dark');
    } else {
        html.setAttribute('data-theme', 'light');
        localStorage.setItem('theme', 'light');
    }
}

// تحميل الوضع المحفوظ
function loadSavedTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.documentElement.removeAttribute('data-theme');
    } else {
        // الوضع النهاري هو الافتراضي
        document.documentElement.setAttribute('data-theme', 'light');
    }
}

// تسجيل الخروج
async function logout() {
    if (!confirm('هل تريد تسجيل الخروج؟')) return;

    try {
        await fetch('api/auth.php?action=logout', { method: 'POST' });
        window.location.href = 'login.php';
    } catch (e) {
        window.location.href = 'login.php';
    }
}
// تحميل الوضع عند بدء الصفحة
document.addEventListener('DOMContentLoaded', function () {
    loadSavedTheme();
});
// ═══════════════════════════════════════════════════════════
//  دوال الـ Badges (الحالات والتنبيهات)
// ═══════════════════════════════════════════════════════════

/**
 * إنشاء badge HTML لحالة معاملة
 * @param {string} status - حالة المعاملة (مستلم، معتمد، تم الدفع، قيد المراجعة...)
 * @returns {string} HTML للـ badge بالألوان المناسبة
 *   أخضر: مستلم / تم الدفع / صدرت الفاتورة / معتمد
 *   أصفر: قيد المراجعة / بدون فاتورة
 *   أزرق: قيد المعالجة / قيد الإصدار
 *   أحمر: مرفوض / ملغاة
 */
function getStatusBadge(status) {
    if (!status) return '<span class="badge badge-slate"><span class="badge-dot"></span>—</span>';

    let color = 'slate';
    if (status === 'مستلم' || status === 'تم الدفع' || status === 'صدرت الفاتورة' || status === 'معتمد') color = 'green';
    else if (status === 'قيد المراجعة' || status === 'بدون فاتورة') color = 'amber';
    else if (status === 'قيد المعالجة' || status === 'قيد الإصدار') color = 'blue';
    else if (status === 'مرفوض' || status === 'ملغاة') color = 'red';

    return '<span class="badge badge-' + color + '"><span class="badge-dot"></span>' + status + '</span>';
}

/**
 * إنشاء badge HTML لنوع التنبيه
 * @param {string} alert - نوع التنبيه (عاجل، متابعة، مكتمل)
 * @returns {string} HTML للـ badge مع أيقونة مناسبة
 */
function getAlertBadge(alert) {
    if (!alert) return '<span class="badge badge-slate"><span class="badge-dot"></span>—</span>';

    let color = 'slate';
    let icon = '⏳';

    if (alert === 'عاجل') { color = 'red'; icon = '🔴'; }
    else if (alert === 'متابعة') { color = 'amber'; icon = '⚠️'; }
    else if (alert === 'مكتمل') { color = 'green'; icon = '✅'; }

    return '<span class="badge badge-' + color + '">' + icon + ' ' + alert + '</span>';
}