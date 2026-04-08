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
    initSearchableSelects();
    injectSARSymbol(); // حقن خط رمز الريال السعودي الجديد
    initLanguage();    // تطبيق اللغة المحفوظة
    const tab = (typeof window._firstAllowedTab === 'function')
        ? (window._firstAllowedTab() || 'dashboard')
        : 'dashboard';
    switchTab(tab);
});

/** حقن خط رمز الريال السعودي الجديد + CSS */
function injectSARSymbol() {
    if (document.getElementById('sar-symbol-style')) return;

    // تحميل الخط من CDN
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdn.jsdelivr.net/npm/@emran-alhaddad/saudi-riyal-font/index.css';
    document.head.appendChild(link);

    // CSS الرمز
    const style = document.createElement('style');
    style.id = 'sar-symbol-style';
    style.textContent = `
        .sar-symbol {
          
            font-family: 'saudi_riyal', sans-serif !important;
            font-size: 2em;
            line-height: 1;
            vertical-align: middle;
        }
        .sar-symbol::before {
            content: "\\e900";
            font-family: 'saudi_riyal' !important;
            font-style: normal;
            font-weight: normal;
            font-variant: normal;
            text-transform: none;
            speak: none;
            -webkit-font-smoothing: antialiased;
        }
        .cur-symbol-text {
            font-size: 1.50em;
            vertical-align: middle;
        }
        /* تنسيق الرمز داخل المبالغ */
        .tx-amount .sar-symbol,
        .dp-currency .sar-symbol,
        .rf-cur-badge .sar-symbol,
        .rv-cur-badge .sar-symbol {
            font-size: 2em;
        }
    `;
    document.head.appendChild(style);
}


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
function initDOM() {
    DOM.mainContent = document.getElementById('main-content');
    DOM.navTabs = document.querySelectorAll('.nav-tab');
    DOM.notificationBadge = document.getElementById('notification-badge');
    DOM.modal = document.getElementById('modal');
    DOM.modalTitle = document.getElementById('modal-title');
    DOM.modalBody = document.getElementById('modal-body');
    DOM.modalFooter = document.getElementById('modal-footer'); // ✅ أضف هذا
    DOM.toast = document.getElementById('toast');
}

// تهيئة مستمعات الأحداث
function initEventListeners() {
    DOM.navTabs.forEach(tab => {
        // nav-parent-btn لها onclick خاص (toggleNavGroup) — لا نضيف لها listener
        if (tab.classList.contains('nav-parent-btn')) return;
        // nav-child-btn لها onclick خاص (openTab) — لا نضيف لها listener
        if (tab.classList.contains('nav-child-btn')) return;
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
        avg: "متوسط",

        // التنقل الجانبي
        nav_main: "الرئيسية",
        nav_transactions: "المعاملات",
        nav_financial: "التخطيط المالي",
        nav_admin: "الإدارة",
        nav_bank_deposits: "الإيداعات البنكية",
        nav_correspondence: "الخطابات",
        nav_purchase_requests: "طلبات الشراء",
        nav_sla: "مستوى الخدمة",
        nav_performance: "الأداء",
        nav_archive: "الأرشيف",
        nav_ceo_approvals: "موافقات الرئيس",
        nav_budget: "الموازنة",
        nav_budget_plan: "خطة الموازنة",
        nav_budget_workflow: "سير عمل الموازنة",

        // لوحة التحكم — نصوص ديناميكية
        refresh: "تحديث",
        total_transactions_label: "إجمالي المعاملات",
        completed_transactions: "معاملات مكتملة",
        needs_followup_label: "تحتاج متابعة",
        total_amounts: "إجمالي المبالغ",
        urgent_transactions_title: "المعاملات العاجلة",
        system_overview_title: "نظرة عامة على النظام",
        bank_balance_today: "الرصيد البنكي — اليوم",
        completion_rate: "معدل ساعات إنجاز المعاملات",
        investments_this_month: "الودائع الاستثمارية — هذا الشهر",
        last_events: "آخر الأحداث",
        last_reservations: "آخر الحجوزات",
        view_all: "عرض الكل",
        no_urgent: "لا توجد معاملات عاجلة",
        all_normal: "جميع المعاملات تسير بشكل طبيعي",
        no_bank_accounts: "لا توجد حسابات بنكية",
        no_performance_data: "لا توجد بيانات أداء بعد",
        no_reservations: "لا توجد حجوزات حديثة",
        no_events: "لا توجد أحداث",
        no_investments_month: "لا توجد ودائع تستحق هذا الشهر",
        loading_row: "جاري التحميل...",
        error_load: "خطأ في التحميل",
        error_data: "خطأ في تحميل البيانات",
        total_balances: "إجمالي الأرصدة",
        total_reservations: "إجمالي الحجوزات",
        avg_completion: "متوسط إنجاز المعاملة",
        analyzed_transactions: "معاملة محللة",
        more_transactions: "معاملات أخرى — عرض الكل",
        click_to_view: "اضغط للعرض",
        // فلاتر العاجلة
        filter_all: "الكل",
        filter_urgent: "🔴 عاجل",
        filter_important: "🟠 مهم",
        filter_followup: "⚠️ متابعة",
        // نظرة عامة صفوف
        row_transactions: "المعاملات المالية",
        row_receiving: "قسم الاستلام",
        row_budget_dept: "قسم الموازنة",
        row_payment_dept: "قسم الدفع",
        row_invoice_dept: "قسم الفوترة",
        row_correspondence: "الخطابات والمراسلات",
        row_bank_accounts: "الحسابات البنكية",
        row_reservations_dept: "الحجوزات",
        row_sla: "نظام SLA",
        // أعمدة الإحصاء
        col_all: "الكل",
        col_completed: "مكتملة",
        col_pending: "معلقة",
        col_urgent_col: "عاجلة",
        col_received: "مستلمة",
        col_waiting: "انتظار",
        col_total: "إجمالي",
        col_amounts: "المبالغ",
        col_paid: "مدفوع",
        col_payments: "المدفوعات",
        col_invoiced: "مفوترة",
        col_in_progress: "قيد الإجراء",
        col_account: "حساب",
        col_approved: "معتمد",
        col_processing: "معالجة",
        col_urgent_count: "عاجلة",
        // مراحل الأداء
        stage_creation: "الإنشاء",
        stage_receiving: "الاستلام",
        stage_budget: "الموازنة",
        stage_payment: "الدفع",
        stage_invoice: "الفوترة",
        // وحدات الوقت
        unit_minute: "دقيقة",
        unit_hour: "ساعة",
        unit_day: "يوم",
        unit_now: "الآن",
        unit_days_short: "ي",
        unit_hours_short: "س",
        unit_mins_short: "د",
        // الودائع
        active_deposits: "وديعة نشطة",
        overdue_close: "مستحقة الإغلاق",
        matures_this_month: "تستحق هذا الشهر",
        expected_profit: "ربح متوقع",
        closed_count: "تم إغلاقها",
        annual_rate: "سنوياً",
        closed_ok: "تم الإغلاق ✅",
        due_now: "مستحقة الآن 🔴",
        within_days: "خلال",
        days_alarm: "أيام ⏰",
        // حالات الحجوزات
        status_draft: "مسودة",
        status_reviewing: "قيد المراجعة",
        status_approved: "معتمد",
        status_rejected: "مرفوض",
        status_done: "مكتمل",
        // التحية
        greeting_morning: "صباح الخير",
        greeting_afternoon: "مساء الخير",
        greeting_evening: "مساء النور",
        // صفحة الأداء
        perf_title: "متابعة الأداء",
        perf_subtitle: "سجل أحداث وتغييرات المعاملات في النظام",
        perf_events_today: "أحداث اليوم",
        perf_avg_time: "متوسط الوقت",
        perf_stage_filter: "المرحلة",
        perf_all_stages: "جميع المراحل",
        perf_date_from: "من تاريخ",
        perf_date_to: "إلى تاريخ",
        perf_reset: "إعادة تعيين",
        perf_all_events: "سجل جميع الأحداث والتغييرات",
        // الأولوية
        priority_modal_title: "تحديد أولوية",
        priority_choose: "اختر مستوى الأولوية لهذه المعاملة",
        priority_urgent: "عاجل جداً",
        priority_urgent_desc: "يتطلب اهتماماً فورياً",
        priority_high: "مهم",
        priority_high_desc: "أولوية عالية تحتاج متابعة",
        priority_normal: "عادي",
        priority_normal_desc: "إزالة من قائمة العاجلة",
        priority_note: "ملاحظة (اختياري)",
        priority_note_ph: "سبب تحديد الأولوية...",
        priority_saved: "تم تحديث الأولوية",
        priority_failed: "فشل التحديث",
        error_connection: "خطأ في الاتصال"
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
        avg: "avg",

        // Sidebar navigation
        nav_main: "Main",
        nav_transactions: "Transactions",
        nav_financial: "Financial Planning",
        nav_admin: "Administration",
        nav_bank_deposits: "Bank Deposits",
        nav_correspondence: "Correspondence",
        nav_purchase_requests: "Purchase Requests",
        nav_sla: "Service Level",
        nav_performance: "Performance",
        nav_archive: "Archive",
        nav_ceo_approvals: "CEO Approvals",
        nav_budget: "Budget",
        nav_budget_plan: "Budget Plan",
        nav_budget_workflow: "Budget Workflow",

        // Dashboard — dynamic text
        refresh: "Refresh",
        total_transactions_label: "Total Transactions",
        completed_transactions: "Completed Transactions",
        needs_followup_label: "Needs Follow-up",
        total_amounts: "Total Amount",
        urgent_transactions_title: "Urgent Transactions",
        system_overview_title: "System Overview",
        bank_balance_today: "Bank Balance — Today",
        completion_rate: "Average Transaction Completion Time",
        investments_this_month: "Investment Deposits — This Month",
        last_events: "Recent Events",
        last_reservations: "Recent Reservations",
        view_all: "View All",
        no_urgent: "No Urgent Transactions",
        all_normal: "All transactions are proceeding normally",
        no_bank_accounts: "No bank accounts found",
        no_performance_data: "No performance data yet",
        no_reservations: "No recent reservations",
        no_events: "No events found",
        no_investments_month: "No deposits maturing this month",
        loading_row: "Loading...",
        error_load: "Error loading",
        error_data: "Error loading data",
        total_balances: "Total Balances",
        total_reservations: "Total Reservations",
        avg_completion: "Average Transaction Completion",
        analyzed_transactions: "transactions analyzed",
        more_transactions: "more transactions — View All",
        click_to_view: "Click to view",
        // Urgent filters
        filter_all: "All",
        filter_urgent: "🔴 Urgent",
        filter_important: "🟠 Important",
        filter_followup: "⚠️ Follow-up",
        // System overview rows
        row_transactions: "Financial Transactions",
        row_receiving: "Receiving Dept.",
        row_budget_dept: "Budget Dept.",
        row_payment_dept: "Payment Dept.",
        row_invoice_dept: "Invoice Dept.",
        row_correspondence: "Correspondence",
        row_bank_accounts: "Bank Accounts",
        row_reservations_dept: "Reservations",
        row_sla: "SLA System",
        // Stat columns
        col_all: "All",
        col_completed: "Completed",
        col_pending: "Pending",
        col_urgent_col: "Urgent",
        col_received: "Received",
        col_waiting: "Waiting",
        col_total: "Total",
        col_amounts: "Amounts",
        col_paid: "Paid",
        col_payments: "Payments",
        col_invoiced: "Invoiced",
        col_in_progress: "In Progress",
        col_account: "Account",
        col_approved: "Approved",
        col_processing: "Processing",
        col_urgent_count: "Urgent",
        // Performance stages
        stage_creation: "Creation",
        stage_receiving: "Receiving",
        stage_budget: "Budget",
        stage_payment: "Payment",
        stage_invoice: "Invoice",
        // Time units
        unit_minute: "minute",
        unit_hour: "hour",
        unit_day: "day",
        unit_now: "Now",
        unit_days_short: "d",
        unit_hours_short: "h",
        unit_mins_short: "m",
        // Investments
        active_deposits: "active deposits",
        overdue_close: "overdue closure",
        matures_this_month: "maturing this month",
        expected_profit: "Expected Profit",
        closed_count: "closed",
        annual_rate: "annually",
        closed_ok: "Closed ✅",
        due_now: "Due Now 🔴",
        within_days: "within",
        days_alarm: "days ⏰",
        // Reservation statuses
        status_draft: "Draft",
        status_reviewing: "Under Review",
        status_approved: "Approved",
        status_rejected: "Rejected",
        status_done: "Completed",
        // Greeting
        greeting_morning: "Good Morning",
        greeting_afternoon: "Good Afternoon",
        greeting_evening: "Good Evening",
        // Performance page
        perf_title: "Performance Tracking",
        perf_subtitle: "Event log and transaction changes in the system",
        perf_events_today: "Events Today",
        perf_avg_time: "Average Time",
        perf_stage_filter: "Stage",
        perf_all_stages: "All Stages",
        perf_date_from: "From Date",
        perf_date_to: "To Date",
        perf_reset: "Reset",
        perf_all_events: "All Events & Changes Log",
        // Priority modal
        priority_modal_title: "Set Priority",
        priority_choose: "Choose the priority level for this transaction",
        priority_urgent: "Very Urgent",
        priority_urgent_desc: "Requires immediate attention",
        priority_high: "Important",
        priority_high_desc: "High priority, needs follow-up",
        priority_normal: "Normal",
        priority_normal_desc: "Remove from urgent list",
        priority_note: "Note (optional)",
        priority_note_ph: "Reason for setting priority...",
        priority_saved: "Priority updated successfully",
        priority_failed: "Update failed",
        error_connection: "Connection error"
    }
};

// اللغة الحالية
let currentLang = localStorage.getItem('app_language') || 'ar';

// دالة الحصول على الترجمة
function t(key) {
    return translations[currentLang][key] || translations['ar'][key] || key;
}

// دالة تبديل اللغة — مع انيميشن
function toggleLanguage() {
    // انيميشن على الزر
    const btn = document.getElementById('langToggleBtn');
    if (btn) {
        btn.classList.add('switching');
        setTimeout(() => btn.classList.remove('switching'), 350);
    }
    currentLang = currentLang === 'ar' ? 'en' : 'ar';
    localStorage.setItem('app_language', currentLang);
    // حفظ في Cookie أيضاً حتى يقرأها PHP عند التحديث
    document.cookie = `app_language=${currentLang};path=/;max-age=31536000`;
    applyLanguage();
    // toast إشعار
    const msg = currentLang === 'ar' ? '🇸🇦 تم التحويل إلى العربية' : '🇬🇧 Switched to English';
    if (typeof showToast === 'function') showToast(msg, 'success');
}

// دالة تطبيق اللغة — كاملة
function applyLanguage() {
    const html = document.documentElement;
    const isAr = currentLang === 'ar';

    // ── 1. اتجاه الصفحة — نستخدم dir لأن rtl-ltr.css يعتمد عليه ──
    html.setAttribute('dir', isAr ? 'rtl' : 'ltr');
    html.setAttribute('lang', currentLang);
    html.setAttribute('data-lang', currentLang);

    // ── 2. إصلاح موضع زر الطي ──
    _fixSidebarToggleForLang();

    // ── 3. تحديث data-i18n نصوص ──
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const val = translations[currentLang]?.[key] || translations['ar']?.[key];
        if (val !== undefined) el.textContent = val;
    });

    // ── 4. تحديث title ──
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        const val = translations[currentLang]?.[key] || translations['ar']?.[key];
        if (val !== undefined) el.setAttribute('title', val);
    });

    // ── 5. تحديث placeholder ──
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        const val = translations[currentLang]?.[key] || translations['ar']?.[key];
        if (val !== undefined) el.setAttribute('placeholder', val);
    });

    // ── 6. تحديث aria-label ──
    document.querySelectorAll('[data-i18n-aria]').forEach(el => {
        const key = el.getAttribute('data-i18n-aria');
        const val = translations[currentLang]?.[key] || translations['ar']?.[key];
        if (val !== undefined) el.setAttribute('aria-label', val);
    });

    // ── 7. إعادة تحميل المحتوى الحالي ──
    refreshCurrentContent();
}

// إصلاح موضع زر الطي في وضع LTR
function _fixSidebarToggleForLang() {
    const toggle = document.getElementById('sidebarToggle');
    if (!toggle) return;
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    const isCollapsed = sidebar.classList.contains('collapsed');
    const isEn = currentLang === 'en';

    if (isEn) {
        const width = isCollapsed
            ? getComputedStyle(document.documentElement).getPropertyValue('--sidebar-collapsed').trim()
            : getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width').trim();
        toggle.style.right = '';
        toggle.style.left = 'calc(' + width + ' - 14px)';
    } else {
        const width = isCollapsed
            ? getComputedStyle(document.documentElement).getPropertyValue('--sidebar-collapsed').trim()
            : getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width').trim();
        toggle.style.left = '';
        toggle.style.right = 'calc(' + width + ' - 14px)';
    }

    // تحديث أيقونة السهم
    const closeIcon = toggle.querySelector('.toggle-icon-close polyline');
    const openIcon = toggle.querySelector('.toggle-icon-open polyline');
    if (closeIcon && openIcon) {
        if (isEn) {
            closeIcon.setAttribute('points', '9 18 15 12 9 6');
            openIcon.setAttribute('points', '15 18 9 12 15 6');
        } else {
            closeIcon.setAttribute('points', '15 18 9 12 15 6');
            openIcon.setAttribute('points', '9 18 15 12 9 6');
        }
    }
}

// دالة إعادة تحميل المحتوى الحالي بعد تغيير اللغة
function refreshCurrentContent() {
    if (typeof App === 'undefined' || !App.currentTab) return;
    const tab = App.currentTab;
    if (tab === 'dashboard' && typeof loadDashboard === 'function') loadDashboard();
    else if (tab === 'transactions' && typeof loadTransactions === 'function') loadTransactions();
    else if (tab === 'settings' && typeof loadSettingsPage === 'function') loadSettingsPage();
    else if (tab === 'sla' && typeof loadSlaCentralPage === 'function') loadSlaCentralPage();
    else if (tab === 'performance' && typeof loadPerformancePage === 'function') loadPerformancePage();
    else if (tab === 'notifications' && typeof loadNotificationsPage === 'function') loadNotificationsPage();
    else if (tab === 'correspondence' && typeof loadCorrespondencePage === 'function') loadCorrespondencePage();
    else if (tab === 'purchase-requests' && typeof loadPurchaseRequestsPage === 'function') loadPurchaseRequestsPage();
    else if (tab === 'archive' && typeof loadArchivePage === 'function') loadArchivePage();
    else if (tab === 'reservations' || tab === 'budget-plans') {
        if (typeof loadBudgetReservationsPage === 'function') loadBudgetReservationsPage();
    }
    else if (tab === 'bank-overview' || tab === 'bank-accounts' || tab === 'bank-investments') {
        if (typeof loadBankDepositsPage === 'function') loadBankDepositsPage();
    }
    else if (tab === 'daily-payments' && typeof loadDailyPaymentsPage === 'function') loadDailyPaymentsPage();
    else if (tab === 'ceo-approvals' && typeof loadCeoApprovalsPage === 'function') loadCeoApprovalsPage();
}

// تهيئة اللغة عند تحميل الصفحة
function initLanguage() {
    // اقرأ من localStorage أولاً، ثم من Cookie، ثم من html data-lang (الذي حدده PHP)
    const fromStorage = localStorage.getItem('app_language');
    const fromCookie = document.cookie.split(';').map(c => c.trim())
        .find(c => c.startsWith('app_language='))?.split('=')[1];
    const fromHTML = document.documentElement.getAttribute('data-lang');

    currentLang = fromStorage || fromCookie || fromHTML || 'ar';

    // مزامنة الكل
    localStorage.setItem('app_language', currentLang);
    document.cookie = `app_language=${currentLang};path=/;max-age=31536000`;

    const html = document.documentElement;
    html.setAttribute('dir', currentLang === 'ar' ? 'rtl' : 'ltr');
    html.setAttribute('lang', currentLang);
    html.setAttribute('data-lang', currentLang);

    // تحديث العناصر الثابتة
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const val = translations[currentLang]?.[key] || translations['ar']?.[key];
        if (val !== undefined) el.textContent = val;
    });

    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        const val = translations[currentLang]?.[key] || translations['ar']?.[key];
        if (val !== undefined) el.setAttribute('title', val);
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        const val = translations[currentLang]?.[key] || translations['ar']?.[key];
        if (val !== undefined) el.setAttribute('placeholder', val);
    });

    // إصلاح موضع زر الطي
    _fixSidebarToggleForLang();
}
// ========== نظام الترجمة (i18n) النهاية ==========

// تصدير الدوال للاستخدام العام
window.t = t;
window.toggleLanguage = toggleLanguage;
window.applyLanguage = applyLanguage;
window.initLanguage = initLanguage;
window._fixSidebarToggleForLang = _fixSidebarToggleForLang;



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
        .toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * formatMoney مع رمز SAR — للأماكن التي تعرض SAR فقط
 */
function formatMoneyWithSAR(amount) {
    return formatMoney(amount) + ' <span class="sar-symbol"></span>';
}

/**
 * نفس formatMoney — اسم بديل للتوافق مع app-bank.js القديم
 */
var fmtMoney = formatMoney;

// ═══════════════════════════════════════════════════════════
//  نظام العملات الموحّد — يُستخدم من جميع الملفات
// ═══════════════════════════════════════════════════════════

/** خريطة العملات: الرمز، الاسم العربي، العلم */
const CURRENCY_MAP = {
    SAR: { symbol: 'ر.س', name: 'ريال سعودي', flag: '🇸🇦' },
    USD: { symbol: '$', name: 'دولار أمريكي', flag: '🇺🇸' },
    EUR: { symbol: '€', name: 'يورو', flag: '🇪🇺' },
    GBP: { symbol: '£', name: 'جنيه إسترليني', flag: '🇬🇧' },
    AED: { symbol: 'د.إ', name: 'درهم إماراتي', flag: '🇦🇪' },
    KWD: { symbol: 'د.ك', name: 'دينار كويتي', flag: '🇰🇼' },
    QAR: { symbol: 'ر.ق', name: 'ريال قطري', flag: '🇶🇦' },
    BHD: { symbol: 'د.ب', name: 'دينار بحريني', flag: '🇧🇭' },
    OMR: { symbol: 'ر.ع', name: 'ريال عماني', flag: '🇴🇲' },
    JOD: { symbol: 'د.أ', name: 'دينار أردني', flag: '🇯🇴' },
    EGP: { symbol: 'ج.م', name: 'جنيه مصري', flag: '🇪🇬' },
    CNY: { symbol: '¥', name: 'يوان صيني', flag: '🇨🇳' },
    JPY: { symbol: '¥', name: 'ين ياباني', flag: '🇯🇵' },
    CHF: { symbol: 'Fr', name: 'فرنك سويسري', flag: '🇨🇭' },
    CAD: { symbol: 'C$', name: 'دولار كندي', flag: '🇨🇦' },
    AUD: { symbol: 'A$', name: 'دولار أسترالي', flag: '🇦🇺' },
    TRY: { symbol: '₺', name: 'ليرة تركية', flag: '🇹🇷' },
    INR: { symbol: '₹', name: 'روبية هندية', flag: '🇮🇳' },
};

/** قائمة العملات بصيغة options لـ searchableSelect */
const CURRENCY_OPTIONS = Object.entries(CURRENCY_MAP).map(([code, c]) => ({
    value: code,
    label: `${c.flag} ${code} — ${c.name} (${c.symbol})`
}));

/**
 * إرجاع رمز العملة
 * @param {string} code - كود العملة مثل 'SAR'
 * @returns {string} الرمز مثل 'ر.س'
 */
function getCurrencySymbol(code) {
    return (CURRENCY_MAP[code] || CURRENCY_MAP.SAR).symbol;
}

/**
 * إرجاع رمز العملة بصيغة HTML
 * SAR → رمز الريال الجديد بخط مخصص
 * غيره → النص العادي
 */
function getCurrencySymbolHTML(code) {
    if (!code || code === 'SAR') {
        return '<span class="sar-symbol" aria-label="ريال سعودي"></span>';
    }
    return `<span class="cur-symbol-text">${getCurrencySymbol(code)}</span>`;
}

/**
 * تنسيق مبلغ مالي بعملة محددة (HTML)
 * @param {number} amount
 * @param {string} currencyCode
 * @returns {string} مثال: "1,234.00 ﷼"
 */
function fmtMoneyCur(amount, currencyCode) {
    const code = currencyCode || 'SAR';
    const num = (parseFloat(amount) || 0).toLocaleString('en-US',
        { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${getCurrencySymbolHTML(code)} ${num}`;
}

/**
 * تنسيق مبلغ مالي — نص بحت بدون HTML (للـ title, placeholder, إلخ)
 */
function fmtMoneyCurText(amount, currencyCode) {
    const sym = getCurrencySymbol(currencyCode || 'SAR');
    const num = (parseFloat(amount) || 0).toLocaleString('en-US',
        { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return num + ' ' + sym;
}

/**
 * يُنتج HTML لقائمة العملات بتصميم searchableSelect الموحّد
 * @param {string} id - معرّف الحقل
 * @param {string} value - القيمة الافتراضية
 * @param {string} onchange - دالة JS تُنفَّذ عند التغيير (اسم الدالة فقط)
 * @returns {string} HTML
 */
function renderCurrencySelect(id, value = 'SAR', onchange = '') {
    const opts = [
        { value: '', label: '-- اختر العملة --' },
        ...CURRENCY_OPTIONS
    ];
    const html = searchableSelect({ id, options: opts, placeholder: 'ابحث عن العملة...', value });
    if (!onchange) return html;
    // نُضيف listener بعد إدراج DOM عبر data attribute
    return html.replace('class="ss-wrap"', `class="ss-wrap" data-onchange="${onchange}"`);
}

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
        const locale = (typeof currentLang !== 'undefined' && currentLang === 'en') ? 'en-US' : 'ar-SA';
        const date = new Date(datetime);
        const dateStr = date.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
        const timeStr = date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
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
function openModal(size) {
    DOM.modal.classList.add('active');
    // حجم المودل: xl للسياسات والشاشات الكبيرة
    DOM.modal.querySelector('.modal')?.classList.remove('modal-xl', 'modal-lg');
    if (size) DOM.modal.querySelector('.modal')?.classList.add('modal-' + size);
    document.body.style.overflow = 'hidden';
}

/**
 * إغلاق النافذة المنبثقة وإعادة حالة التطبيق
 */
function closeModal() {
    DOM.modal.classList.remove('active');
    DOM.modal.querySelector('.modal')?.classList.remove('modal-xl', 'modal-lg');
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
                const isEn = (typeof currentLang !== 'undefined' && currentLang === 'en');
                DOM.mainContent.innerHTML = `
                    <div style="display:flex;flex-direction:column;align-items:center;
                                justify-content:center;min-height:55vh;gap:.85rem;
                                color:var(--text-muted);text-align:center;padding:2rem">
                        <div style="font-size:3.5rem;opacity:.35">🔒</div>
                        <h2 style="margin:0;color:var(--text-primary);font-size:1.2rem">
                            ${isEn ? 'Access Denied' : 'غير مصرح بالوصول'}
                        </h2>
                        <p style="margin:0;font-size:.85rem;max-width:300px;line-height:1.6">
                            ${isEn
                        ? 'You do not have permission to view this page.<br>Contact the system administrator.'
                        : 'ليس لديك صلاحية لعرض هذه الصفحة.<br>تواصل مع مدير النظام.'}
                        </p>
                    </div>`;
            }
            showToast(
                (typeof currentLang !== 'undefined' && currentLang === 'en')
                    ? '🔒 Access denied'
                    : '🔒 ليس لديك صلاحية الوصول لهذه الصفحة',
                'error'
            );
            return;
        }
    }

    App.currentTab = tab;
    App.expandedRow = null;

    DOM.navTabs.forEach(t => {
        t.classList.toggle('active', t.dataset.tab === tab);
    });
    // فتح مجموعة الأب يتم عبر openTab() مباشرة

    if (tab === 'dashboard') {
        loadDashboard();
    } else if (tab === 'transactions') {
        loadTransactions();
    } else if (tab === 'correspondence') {
        loadCorrespondencePage();
    } else if (tab === 'bank-overview' || tab === 'bank-accounts' || tab === 'bank-investments') {
        // كل تبويبات الخزينة تمر عبر loadBankDepositsPage
        const subMap = { 'bank-overview': 'overview', 'bank-accounts': 'accounts', 'bank-investments': 'investments' };
        const sub = subMap[tab] || 'overview';
        if (typeof loadBankDepositsPage === 'function') {
            const result = loadBankDepositsPage();
            const doSwitch = () => { if (typeof switchBankTab === 'function') switchBankTab(sub); };
            if (result && typeof result.then === 'function') result.then(doSwitch);
            else setTimeout(doSwitch, 300);
        }
    } else if (tab === 'notifications') {
        if (typeof loadNotificationsPage === 'function') loadNotificationsPage();
    } else if (tab === 'sla') {
        if (typeof loadSlaCentralPage === 'function') loadSlaCentralPage(); else if (typeof loadSlaPage === 'function') loadSlaPage();
    } else if (tab === 'performance') {
        if (typeof loadPerformancePage === 'function') loadPerformancePage();
    } else if (tab === 'budget-plans') {
        // الموازنة التقديرية — تُستدعى عبر openBudgetSubTab عادةً
        if (typeof BudgetState !== 'undefined') BudgetState.activeTab = 'plans';
        if (typeof loadBudgetReservationsPage === 'function') loadBudgetReservationsPage();
    } else if (tab === 'reservations') {
        if (typeof BudgetState !== 'undefined') BudgetState.activeTab = 'reservations';
        if (typeof loadBudgetReservationsPage === 'function') loadBudgetReservationsPage();
    } else if (tab === 'archive') {
        DOM.mainContent.innerHTML = '<div id="archive-root"></div>';
        if (typeof ArchiveModule !== 'undefined') setTimeout(() => ArchiveModule.init(), 50);
    } else if (tab === 'settings') {
        loadSettingsPage();
    } else if (tab === 'profile') {
        if (typeof loadProfilePage === 'function') loadProfilePage();
    } else if (tab === 'daily-payments') {
        if (typeof initDailyPayments === 'function') {
            DOM.mainContent.innerHTML = '<div id="page-daily-payments"></div>';
            initDailyPayments();
        }
    } else if (tab === 'ceo-approvals') {
        if (typeof loadCeoApprovalsPage === 'function') loadCeoApprovalsPage();
    } else if (tab === 'purchase-requests') {
        if (typeof loadPurchaseRequestsPage === 'function') loadPurchaseRequestsPage();
    } else if (tab === 'reports') {
        if (typeof loadReportsPage === 'function') loadReportsPage();
    }
}



// ──────────────────────────────────────────
//  Nav Group — طي/فتح المجموعات
// ──────────────────────────────────────────

// خريطة: tab → groupId
const NAV_GROUP_MAP = {
    'reservations': 'budget',
    'budget-plans': 'budget',
    'bank-overview': 'treasury',
    'bank-accounts': 'treasury',
    'bank-investments': 'treasury',
    'daily-payments': 'treasury',
    'archive': 'archive',
};

// يُستدعى من onclick زر الطي/الفتح
function toggleNavGroup(id) {
    const parent = document.getElementById('nav-parent-' + id);
    if (!parent) return;
    const willOpen = !parent.classList.contains('open');
    // أغلق الكل
    document.querySelectorAll('.nav-parent').forEach(p => p.classList.remove('open'));
    // افتح المطلوب فقط
    if (willOpen) parent.classList.add('open');
}

// يُستدعى من onclick أزرار الأبناء
function openTab(tab, groupId) {
    // أغلق كل المجموعات
    document.querySelectorAll('.nav-parent').forEach(p => p.classList.remove('open'));
    // افتح المجموعة الأب
    const parent = document.getElementById('nav-parent-' + groupId);
    if (parent) parent.classList.add('open');
    // فعّل التبويب
    switchTab(tab);
}

// ── خاص بتبويبات الخزينة (bank-deposits sub-tabs) ──────────
function openBankSubTab(subTab, groupId) {
    // خريطة subTab → data-tab
    const dataTabMap = {
        overview: 'bank-overview',
        accounts: 'bank-accounts',
        investments: 'bank-investments',
    };
    const dataTab = dataTabMap[subTab] || 'bank-overview';

    // فعّل الزر الصحيح في السايدبار
    document.querySelectorAll('.nav-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === dataTab);
    });
    App.currentTab = dataTab;

    // إذا الصفحة محملة → بدّل التاب مباشرة
    if (typeof switchBankTab === 'function' && document.getElementById('bank-tab-overview')) {
        switchBankTab(subTab);
        return;
    }

    // الصفحة غير محملة → حمّلها مع تمرير التاب المطلوب
    if (typeof loadBankDepositsPage === 'function') {
        loadBankDepositsPage(subTab);
    }
}

// ── خاص بتبويبات الموازنة (حجوزات / موازنة تقديرية) ─────────
function openBudgetSubTab(subTab) {
    // فعّل الزر الصحيح بناءً على data-tab
    const targetDataTab = subTab === 'plans' ? 'budget-plans' : 'reservations';
    document.querySelectorAll('.nav-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === targetDataTab);
    });

    // حدّث App.currentTab
    App.currentTab = targetDataTab;

    // شغّل الصفحة
    if (subTab === 'plans') {
        // لو الصفحة محملة — انتقل مباشرة، لو لا — حمّلها ثم انتقل
        if (typeof BudgetState !== 'undefined' && BudgetState.loaded) {
            switchBudgetMainTab('plans');
        } else {
            if (typeof BudgetState !== 'undefined') BudgetState.activeTab = 'plans';
            if (typeof loadBudgetReservationsPage === 'function') loadBudgetReservationsPage();
        }
    } else {
        if (typeof BudgetState !== 'undefined') BudgetState.activeTab = 'reservations';
        if (typeof loadBudgetReservationsPage === 'function') loadBudgetReservationsPage();
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
    if (!status || status === 'null') {
        return '<span class="status-badge status-pending status-empty">—</span>';
    }

    let cls = 'status-pending';
    if (status === 'مستلم' || status === 'تم الدفع' || status === 'صدرت الفاتورة' || status === 'معتمد') {
        cls = 'status-completed';
    } else if (status === 'قيد المراجعة' || status === 'بدون فاتورة' || status === 'معلق') {
        cls = 'status-review';
    } else if (status === 'قيد المعالجة' || status === 'قيد الإصدار') {
        cls = 'status-processing';
    } else if (status === 'مرفوض' || status === 'ملغاة') {
        cls = 'status-cancelled';
    }

    return '<span class="status-badge ' + cls + '">' + status + '</span>';
}

/**
 * إنشاء badge HTML لنوع التنبيه
 * @param {string} alert - نوع التنبيه (عاجل، متابعة، مكتمل)
 * @returns {string} HTML للـ badge مع أيقونة مناسبة
 */
function getAlertBadge(alert) {
    if (!alert) return '<span class="status-badge status-pending status-empty">—</span>';

    const map = {
        'عاجل': ['status-cancelled', 'عاجل'],
        'متابعة': ['status-review', 'متابعة'],
        'مكتمل': ['status-completed', 'مكتمل'],
        'انتظار': ['status-pending', 'انتظار'],
    };

    const [cls, label] = map[alert] || ['status-pending', alert];
    return '<span class="status-badge ' + cls + '">' + label + '</span>';
}

// ════════════════════════════════════════════════════════════
//  downloadAsPDF — مُعرَّفة في pdf-engine.js (يُحمَّل أولاً)
//  هذا السطر للتوافق فقط في حال تغيّر ترتيب التحميل
// ════════════════════════════════════════════════════════════
if (typeof downloadAsPDF === 'undefined') {
    async function downloadAsPDF(elementId, filename, extraCSS) {
        return PdfEngine.print(elementId, filename, extraCSS);
    }
}

// ═══════════════════════════════════════════════════════════
//  نظام searchableSelect — CSS + Listeners (مشترك لجميع الملفات)
// ═══════════════════════════════════════════════════════════

function initSearchableSelects() {
    // حقن CSS مرة واحدة فقط
    if (!document.getElementById('ss-global-styles')) {
        const s = document.createElement('style');
        s.id = 'ss-global-styles';
        s.textContent = `
        .ss-wrap { position:relative; width:100%; }
        .ss-trigger {
            display:flex; align-items:center; justify-content:space-between;
            padding:.55rem .85rem; border-radius:10px;
            border:1px solid var(--border-color);
            background:var(--bg-card, #fff);
            cursor:pointer; min-height:42px;
            transition:border-color .15s, box-shadow .15s;
            user-select:none;
        }
        .ss-wrap.open .ss-trigger,
        .ss-trigger:hover { border-color:var(--accent-blue, #6366f1); }
        .ss-wrap.open .ss-trigger { box-shadow:0 0 0 3px rgba(99,102,241,.15); }
        .ss-display {
            font-size:.85rem; color:var(--text-primary, #111);
            flex:1; min-width:0; overflow:hidden;
            text-overflow:ellipsis; white-space:nowrap;
        }
        .ss-ph { color:var(--text-muted, #999); }
        .ss-arrow { color:var(--text-muted, #999); flex-shrink:0; transition:transform .2s; }
        .ss-arrow.flipped { transform:rotate(180deg); }
        .ss-dropdown {
            display:none; position:absolute; top:calc(100% + 4px); right:0; left:0;
            background:var(--bg-card, #fff); border:1px solid var(--border-color, #ddd);
            border-radius:12px; box-shadow:0 8px 32px rgba(0,0,0,.22);
            z-index:99999; overflow:hidden;
            animation:ssDrop .15s ease;
        }
        @keyframes ssDrop { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }
        .ss-wrap.open .ss-dropdown { display:block; }
        .ss-search-wrap {
            display:flex; align-items:center; gap:.5rem;
            padding:.6rem .8rem; border-bottom:1px solid var(--border-color, #ddd);
            color:var(--text-muted, #999);
        }
        .ss-search {
            flex:1; border:none; background:transparent; outline:none;
            font-size:.82rem; color:var(--text-primary, #111); direction:rtl;
        }
        .ss-search::placeholder { color:var(--text-muted, #999); }
        .ss-options { max-height:220px; overflow-y:auto; padding:.35rem; }
        .ss-options::-webkit-scrollbar { width:4px; }
        .ss-options::-webkit-scrollbar-thumb { background:var(--border-color, #ddd); border-radius:4px; }
        .ss-option {
            padding:.5rem .75rem; border-radius:8px; font-size:.83rem;
            color:var(--text-primary, #111); cursor:pointer; transition:background .12s;
            white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
        }
        .ss-option:hover { background:rgba(99,102,241,.1); }
        .ss-option.selected { background:rgba(99,102,241,.15); color:var(--accent-blue, #6366f1); font-weight:600; }
        `;
        document.head.appendChild(s);
    }

    // تفعيل delegate listener مرة واحدة فقط
    if (!window._ssListenerAttached) {
        document.addEventListener('click', e => {
            const opt = e.target.closest('.ss-option');
            if (opt) { _ssSelectOption(opt); return; }
            if (!e.target.closest('.ss-wrap')) {
                document.querySelectorAll('.ss-wrap.open').forEach(w => {
                    w.classList.remove('open');
                    w.querySelector('.ss-arrow')?.classList.remove('flipped');
                });
            }
        });
        window._ssListenerAttached = true;
    }
}

function _ssSelectOption(opt) {
    const wrap = opt.closest('.ss-wrap');
    const id = wrap.dataset.id;
    const val = opt.dataset.value;

    wrap.dataset.value = val;
    const hidden = wrap.querySelector(`#${id}`);
    if (hidden) hidden.value = val;
    wrap.querySelector('.ss-display').innerHTML = opt.textContent;
    wrap.querySelectorAll('.ss-option').forEach(o => o.classList.toggle('selected', o === opt));

    // إغلاق
    wrap.classList.remove('open');
    wrap.querySelector('.ss-arrow')?.classList.remove('flipped');
    const search = wrap.querySelector('.ss-search');
    if (search) { search.value = ''; _ssFilterOptions(search); }

    // إطلاق حدث change على hidden input
    if (hidden) hidden.dispatchEvent(new Event('change', { bubbles: true }));

    // callbacks مخصصة (budget)
    if (typeof selectSSOption === 'function') {
        // نتجاهل — نعتمد على dispatchEvent فقط
    }
    if (id === 'rf_cost_center' && typeof onCostCenterChange === 'function') onCostCenterChange(val);
    if (id === 'rf_budget_category' && typeof autoLinkBudgetPlan === 'function') { _budgetFormData['rf_budget_category'] = val; autoLinkBudgetPlan(); }
    if (id === 'rf_supplier_id' && typeof onSupplierChange === 'function') onSupplierChange(hidden);
    if (id === 'rf_budget_plan_id' && typeof onBudgetPlanChange === 'function') onBudgetPlanChange(val);
    if (id === 'rf_currency' && typeof _onCurrencyChange === 'function') _onCurrencyChange(val);
    if (id === 'tx_currency' && typeof _onTxCurrencyChange === 'function') _onTxCurrencyChange(val);
}

function _ssFilterOptions(input) {
    const q = input.value.trim().toLowerCase();
    input.closest('.ss-dropdown').querySelectorAll('.ss-option').forEach(opt => {
        opt.style.display = opt.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
}