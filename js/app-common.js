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

/** حقن رمز الريال السعودي — يحمّل CSS من ملف مستقل */
function injectSARSymbol() {
  // if (document.getElementById('sar-symbol-style')) return;
  // var l = document.createElement('link');
  // l.id = 'sar-symbol-style';
  // l.rel = 'stylesheet';
  // l.href = 'saudi-riyal.css';
  // document.head.appendChild(l);
}
var SAR_HTML = '<span class="sar-symbol" aria-label="ريال سعودي"></span>';











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
  } else if (tab === 'samples') {
    if (typeof window.loadSamplesPage === 'function') window.loadSamplesPage();
    else if (typeof window.loadSampleWarehousePage === 'function') window.loadSampleWarehousePage();
  } else if (tab === 'security-log') {
    if (typeof loadSecurityLogPage === 'function') loadSecurityLogPage();
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

// ═══════════════════════════════════════════════════════════
//  CSRF Protection — postApi()
//  استخدم هذه الدالة بدلاً من fetch() في كل طلبات POST
// ═══════════════════════════════════════════════════════════

let _csrfToken = null;

/** يجلب CSRF token من السيرفر مرة واحدة ثم يخزّنه */
async function _getCsrfToken() {
  if (_csrfToken) return _csrfToken;
  try {
    const r = await fetch('api/settings.php?action=get_csrf_token', { credentials: 'same-origin' });
    const d = await r.json();
    _csrfToken = d.token || null;
  } catch (_) {
    _csrfToken = null;
  }
  return _csrfToken;
}

/**
 * postApi(url, body)
 * دالة POST آمنة تُرسل CSRF token تلقائياً في كل طلب
 *
 * الاستخدام (بدلاً من fetch مباشرة):
 *   const d = await postApi('api/settings.php?action=add_employee', { name, email });
 */
async function postApi(url, body = {}) {
  const token = await _getCsrfToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['X-CSRF-Token'] = token;
  const r = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers,
    body: JSON.stringify(body),
  });
  return r.json();
}

/** يُفرغ الـ token المخزّن (استدعِه عند logout أو تجديد الجلسة) */
function invalidateCsrfToken() { _csrfToken = null; }


// ═══════════════════════════════════════════════════════════
//  نظام تتبع العينات — IIFE معزولة لمنع تعارض المتغيرات
// ═══════════════════════════════════════════════════════════
(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════
  //  نظام تتبع العينات — مدمج في app-common.js
  // ═══════════════════════════════════════════════════════════
  // ═══════════════════════════════════════════════════════════════════
  //  app-samples-combined.js
  //  يجمع وحدتين في ملف واحد:
  //
  //  ① نظام تتبع العينات (samples) — المسار الكامل:
  //     PO → تسجيل → استلام فيزيائي → تسليم/إرجاع → اختبارات → اعتماد/رفض
  //     نقطة الدخول: loadSamplesPage()
  //
  //  ② مستودع العينات مع الموردين (sample-warehouse) — المسار:
  //     الإدارة الفنية ↔ أقسام داخلية ↔ موردين ↔ إنتاج
  //     نقطة الدخول: loadSampleWarehousePage()
  //
  //  API:
  //     ① api/samples_api.php
  //     ② api/sample_warehouse_api.php
  // ═══════════════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════════
  //  app-samples.js — نظام تتبع العينات
  //  API: api/samples_api.php
  //
  //  المسار: PO → تسجيل → استلام فيزيائي → تسليم/إرجاع → اختبارات → اعتماد/رفض
  //  الميزات:
  //    - صورة العينة + Lightbox داخلي
  //    - إيصال تسليم قابل للطباعة (DEL-YYYY-NNNN)
  //    - تنبيهات تجاوز المدة (3 مستويات)
  //    - searchableSelect لجميع القوائم
  //    - مسار تتبع زمني كامل
  // ═══════════════════════════════════════════════════════════════

  // ── الحالة المركزية للوحدة ───────────────────────────────────
  var SMP = {
    list: [],
    selected: null,
    events: [],
    deliveries: [],
    tests: [],
    stats: {},
    page: 1,
    totalPages: 1,
    filters: { search: '', status: '', storage_loc: '' },
    // كاشات للـ searchableSelect
    cache: { depts: null, costCenters: null, suppliers: null, employees: {} },
  };

  // ── ثوابت الحالات ────────────────────────────────────────────
  var SMP_STATUS = {
    pending: { ar: 'تحت الإجراء', cls: 'smp-st-pending', icon: 'ti-clock' },
    received: { ar: 'مستلمة', cls: 'smp-st-received', icon: 'ti-package' },
    in_circulation: { ar: 'قيد التداول', cls: 'smp-st-circulation', icon: 'ti-arrows-exchange' },
    testing: { ar: 'قيد الاختبار', cls: 'smp-st-testing', icon: 'ti-test-pipe' },
    approved: { ar: 'معتمدة', cls: 'smp-st-approved', icon: 'ti-circle-check' },
    rejected: { ar: 'مرفوضة', cls: 'smp-st-rejected', icon: 'ti-circle-x' },
  };

  var SMP_STORAGE = {
    technical_mgmt: { ar: 'الإدارة الفنية — الخرج', icon: 'ti-building-factory' },
    specs_riyadh: { ar: 'المواصفات والمقاييس — الرياض', icon: 'ti-building' },
  };

  var SMP_EVENT_ICONS = {
    created: 'ti-plus', received: 'ti-package',
    updated: 'ti-edit', delivered: 'ti-arrow-up-right',
    returned: 'ti-arrow-down-left', test_added: 'ti-test-pipe',
    approved: 'ti-circle-check', rejected: 'ti-circle-x',
    overdue_reminder: 'ti-bell', overdue_alert: 'ti-alarm',
    escalated: 'ti-arrow-up', image_uploaded: 'ti-photo',
    archived: 'ti-archive',
  };

  var SMP_RESULT = {
    pass: { ar: 'مطابق', cls: 'smp-res-pass' },
    fail: { ar: 'غير مطابق', cls: 'smp-res-fail' },
    pending: { ar: 'قيد المتابعة', cls: 'smp-res-pending' },
  };

  // ── أدوات مساعدة ─────────────────────────────────────────────
  // ── دوال مساعدة — guard لمنع إعادة التعريف إن كانت محمّلة من ملف آخر ──
  if (typeof window._smpEsc === 'undefined')
    window._smpEsc = v => v == null ? '' : String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  if (typeof window._smpFmt === 'undefined')
    window._smpFmt = d => d ? new Date(d).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

  if (typeof window._smpFmtDT === 'undefined')
    window._smpFmtDT = d => d ? new Date(d).toLocaleString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

  if (typeof window._smpAgo === 'undefined')
    window._smpAgo = dt => { if (!dt) return '—'; const s = Math.floor((Date.now() - new Date(dt)) / 1000); if (s < 60) return 'الآن'; if (s < 3600) return `منذ ${Math.floor(s / 60)} د`; if (s < 86400) return `منذ ${Math.floor(s / 3600)} س`; return `منذ ${Math.floor(s / 86400)} يوم`; };

  // اختصارات محلية تشير لنفس الدوال العالمية
  var _smpEsc = window._smpEsc;
  var _smpFmt = window._smpFmt;
  var _smpFmtDT = window._smpFmtDT;
  var _smpAgo = window._smpAgo;

  /** GET مع error handling */
  async function _smpGet(url) {
    try {
      const r = await fetch(url, { credentials: 'same-origin' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) {
      console.error('smpGet:', url, e.message);
      return { success: false, message: e.message };
    }
  }

  /** POST مع CSRF تلقائي */
  async function _smpPost(url, body = {}) {
    const token = await _getCsrfToken();
    if (token) body.csrf_token = token;
    try {
      const r = await fetch(url, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return await r.json();
    } catch (e) {
      return { success: false, message: e.message };
    }
  }

  /** POST multipart (للصور والاختبارات مع مرفقات) */
  async function _smpPostFile(url, formData) {
    const token = await _getCsrfToken();
    if (token) formData.append('csrf_token', token);
    try {
      const r = await fetch(url, { method: 'POST', credentials: 'same-origin', body: formData });
      return await r.json();
    } catch (e) {
      return { success: false, message: e.message };
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  نقطة الدخول
  // ══════════════════════════════════════════════════════════════
  async function loadSamplesPage() {
    const mc = document.getElementById('main-content') || DOM?.mainContent;
    if (!mc) return;

    mc.innerHTML = `<div class="smp-skeleton"><div class="spinner"></div></div>`;

    // تحميل الإحصائيات أولاً
    const statsRes = await _smpGet('api/samples_api.php?action=stats');
    if (statsRes.success) SMP.stats = statsRes.data;

    // رسم الهيكل الأساسي
    _smpRenderShell(mc);

    // جلب القائمة
    await _smpLoadList();
  }

  // ══════════════════════════════════════════════════════════════
  //  رسم الهيكل الأساسي للصفحة
  // ══════════════════════════════════════════════════════════════
  function _smpRenderShell(mc) {
    const s = SMP.stats;
    const overdue = parseInt(s.overdue_deliveries || 0);

    mc.innerHTML = `
<div class="smp-page" id="smp-root">

  <!-- ══ الرأس ══ -->
  <div class="smp-header">
    <div class="smp-header-left">
      <h2 class="smp-title"><i class="ti ti-test-pipe" aria-hidden="true"></i> تتبع العينات</h2>
    </div>
    <div class="smp-header-right">
      ${overdue > 0 ? `
        <button class="btn btn-sm" style="background:rgba(242,111,99,.1);color:#A32D2D;border-color:rgba(242,111,99,.4)"
          onclick="_smpFilterBy('overdue')">
          <i class="ti ti-alarm" aria-hidden="true"></i> ${overdue} متأخرة
        </button>` : ''}
      <button class="btn btn-secondary btn-sm" onclick="_smpCheckOverdue()">
        <i class="ti ti-bell" aria-hidden="true"></i> فحص التنبيهات
      </button>
      <button class="btn btn-primary" onclick="_smpOpenReceiveModal()">
        <i class="ti ti-package" aria-hidden="true"></i> استلام عينة
      </button>
      <button class="btn btn-secondary" onclick="_smpOpenDeliverModal()">
        <i class="ti ti-arrow-up-right" aria-hidden="true"></i> تسليم عينة
      </button>
    </div>
  </div>

  <!-- ══ KPI ══ -->
  <div class="smp-kpi-row">
    ${[
        ['الكل', s.total || 0, 'ti-packages', ''],
        ['تحت الإجراء', s.cnt_pending || 0, 'ti-clock', 'pending'],
        ['مستلمة', s.cnt_received || 0, 'ti-package', 'received'],
        ['في التداول', s.cnt_circulation || 0, 'ti-arrows-exchange', 'in_circulation'],
        ['قيد الاختبار', s.cnt_testing || 0, 'ti-test-pipe', 'testing'],
        ['معتمدة', s.cnt_approved || 0, 'ti-circle-check', 'approved'],
        ['مرفوضة', s.cnt_rejected || 0, 'ti-circle-x', 'rejected'],
      ].map(([lbl, val, ic, st]) => `
      <div class="smp-kpi ${st ? 'smp-kpi-clickable' : ''}" ${st ? `onclick="_smpFilterBy('${st}')"` : ''}
           title="${st ? 'فلترة: ' + lbl : ''}">
        <i class="ti ${ic} smp-kpi-icon" aria-hidden="true"></i>
        <div class="smp-kpi-val">${val}</div>
        <div class="smp-kpi-lbl">${lbl}</div>
      </div>`).join('')}
  </div>

  <!-- ══ الفلاتر ══ -->
  <div class="smp-filters">
    <div class="smp-search-wrap">
      <i class="ti ti-search" aria-hidden="true"></i>
      <input type="text" class="smp-search pr-search-input" id="smp-search"
        placeholder="بحث برقم العينة أو الاسم أو رقم العقد..."
        value="${_smpEsc(SMP.filters.search)}" oninput="_smpDebounce(this.value)">
    </div>
    <select class="pr-select" id="smp-f-status" onchange="_smpFilterChange('status',this.value)">
      <option value="">كل الحالات</option>
      ${Object.entries(SMP_STATUS).map(([k, v]) => `
        <option value="${k}" ${SMP.filters.status === k ? 'selected' : ''}>${v.ar}</option>`).join('')}
    </select>
    <select class="pr-select" id="smp-f-storage" onchange="_smpFilterChange('storage_loc',this.value)">
      <option value="">كل المخازن</option>
      ${Object.entries(SMP_STORAGE).map(([k, v]) => `
        <option value="${k}" ${SMP.filters.storage_loc === k ? 'selected' : ''}>${v.ar}</option>`).join('')}
    </select>
  </div>

  <!-- ══ التخطيط الرئيسي: جدول + لوحة جانبية ══ -->
  <div class="smp-layout" id="smp-layout">
    <div id="smp-table-wrap">
      <div class="smp-loading"><div class="spinner"></div></div>
    </div>
    <aside id="smp-side" class="smp-side">
      <div class="smp-side-empty">
        <i class="ti ti-hand-click" aria-hidden="true"></i>
        <p>اختر عينة لعرض تفاصيلها</p>
      </div>
    </aside>
  </div>

</div>

<!-- المودال العام -->
<div id="smp-overlay" class="smp-overlay" style="display:none"
     onclick="if(event.target===this)_smpCloseModal()">
  <div id="smp-modal" class="smp-modal" onclick="event.stopPropagation()">
    <div id="smp-modal-inner"></div>
  </div>
</div>

<!-- Lightbox للصورة -->
<div id="smp-lightbox" class="smp-overlay" style="display:none"
     onclick="_smpCloseLightbox()">
  <div class="smp-lb-box" onclick="event.stopPropagation()">
    <div class="smp-lb-toolbar">
      <span id="smp-lb-title" style="color:#fff;font-weight:700;font-size:.9rem"></span>
      <div style="display:flex;gap:.5rem">
        <a id="smp-lb-download" class="smp-lb-btn" download><i class="ti ti-download" aria-hidden="true"></i></a>
        <button class="smp-lb-btn" onclick="_smpCloseLightbox()"><i class="ti ti-x" aria-hidden="true"></i></button>
      </div>
    </div>
    <div class="smp-lb-img-wrap">
      <img id="smp-lb-img" src="" alt="صورة العينة" style="max-width:100%;max-height:70vh;border-radius:8px;object-fit:contain">
    </div>
    <div id="smp-lb-meta" class="smp-lb-meta"></div>
  </div>
</div>`;
  }

  // ══════════════════════════════════════════════════════════════
  //  جلب قائمة العينات ورسم الجدول
  // ══════════════════════════════════════════════════════════════
  async function _smpLoadList() {
    const wrap = document.getElementById('smp-table-wrap');
    if (wrap) wrap.innerHTML = '<div class="smp-loading"><div class="spinner"></div></div>';

    const p = new URLSearchParams({
      action: 'list', page: SMP.page,
      search: SMP.filters.search,
      status: SMP.filters.status,
      storage_loc: SMP.filters.storage_loc,
    });
    const d = await _smpGet('api/samples_api.php?' + p);
    if (!d.success) { showToast(d.message || 'خطأ في جلب البيانات', 'error'); return; }

    SMP.list = d.data;
    SMP.totalPages = d.pages || 1;
    _smpRenderTable();
  }

  function _smpRenderTable() {
    const wrap = document.getElementById('smp-table-wrap');
    if (!wrap) return;

    if (!SMP.list.length) {
      wrap.innerHTML = `<div class="smp-table-wrap">
          <div class="smp-empty"><i class="ti ti-package-off" aria-hidden="true"></i>
          <p>لا توجد عينات بالفلاتر الحالية</p></div></div>`;
      return;
    }

    const rows = SMP.list.map(s => {
      const st = SMP_STATUS[s.status] || { ar: s.status, cls: '', icon: 'ti-circle' };
      const sel = SMP.selected?.id === s.id;
      const imgHTML = s.image_path
        ? `<div class="smp-thumb-wrap" onclick="event.stopPropagation();_smpOpenLightbox(${s.id})">
                 <img src="${_smpEsc(s.image_path)}" alt="" class="smp-thumb" loading="lazy">
                 <div class="smp-thumb-overlay"><i class="ti ti-zoom-in" aria-hidden="true"></i></div>
               </div>`
        : `<div class="smp-thumb-empty"><i class="ti ti-camera-off" aria-hidden="true"></i></div>`;

      return `<tr class="${sel ? 'smp-row-sel' : ''}" onclick="_smpSelectRow(${s.id})" data-id="${s.id}">
          <td>${imgHTML}</td>
          <td>
            <div class="smp-num">${_smpEsc(s.sample_number)}</div>
            ${s.pr_number ? `<div class="smp-sub"><i class="ti ti-file-text" style="font-size:.7rem" aria-hidden="true"></i> ${_smpEsc(s.pr_number)}</div>` : ''}
          </td>
          <td>
            <div class="smp-name">${_smpEsc(s.name)}</div>
            ${s.classification ? `<div class="smp-sub">${_smpEsc(s.classification)}</div>` : ''}
          </td>
          <td class="smp-td-m">${_smpEsc(s.supplier_name || '—')}</td>
          <td class="smp-td-m" style="text-align:center">
            <span class="smp-qty">${parseFloat(s.quantity || 0).toLocaleString('ar')}</span>
            <span class="smp-sub">${_smpEsc(s.unit)}</span>
          </td>
          <td>
            <span class="smp-badge ${st.cls}">
              <i class="ti ${st.icon}" style="font-size:.7rem" aria-hidden="true"></i>
              ${st.ar}
            </span>
            ${parseInt(s.active_deliveries || 0) > 0
          ? `<div class="smp-sub" style="color:var(--accent-amber)">${s.active_deliveries} تسليم نشط</div>` : ''}
          </td>
          <td class="smp-td-m">${_smpEsc(SMP_STORAGE[s.storage_location]?.ar?.split('—')[0]?.trim() || s.storage_location || '—')}</td>
          <td>
            <div style="display:flex;gap:.3rem;align-items:center">
              ${s.tests_count > 0 ? `<span style="font-size:.7rem;background:rgba(63,89,80,.1);color:var(--primary);padding:.1rem .4rem;border-radius:99px;font-weight:700">
                ${s.tests_pass}/${s.tests_count} اختبار
              </span>`: ''}
              <button class="smp-icon-btn" title="تعديل" onclick="event.stopPropagation();_smpOpenEditModal(${s.id})">
                <i class="ti ti-edit" aria-hidden="true"></i>
              </button>
            </div>
          </td>
        </tr>`;
    }).join('');

    wrap.innerHTML = `<div class="smp-table-wrap">
      <table class="pr-table smp-table">
        <thead><tr>
          <th style="width:60px">صورة</th>
          <th style="width:110px">رقم العينة</th>
          <th>الاسم والتصنيف</th>
          <th style="width:110px">المورد</th>
          <th style="width:80px;text-align:center">الكمية</th>
          <th style="width:120px">الحالة</th>
          <th style="width:90px">التخزين</th>
          <th style="width:100px">الاختبارات</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="smp-table-footer">
        <span class="smp-sub">${SMP.list.length} عينة — صفحة ${SMP.page} من ${SMP.totalPages}</span>
        <div style="display:flex;gap:.4rem">
          <button class="btn btn-secondary btn-sm" onclick="_smpPage(-1)" ${SMP.page <= 1 ? 'disabled' : ''}>
            <i class="ti ti-chevron-right" aria-hidden="true"></i>
          </button>
          <button class="btn btn-secondary btn-sm" onclick="_smpPage(1)" ${SMP.page >= SMP.totalPages ? 'disabled' : ''}>
            <i class="ti ti-chevron-left" aria-hidden="true"></i>
          </button>
        </div>
      </div>
    </div>`;
  }

  // ══════════════════════════════════════════════════════════════
  //  اللوحة الجانبية — تفاصيل العينة + الإجراءات
  // ══════════════════════════════════════════════════════════════
  async function _smpSelectRow(id) {
    // تمييز الصف المحدد
    document.querySelectorAll('#smp-table-wrap tbody tr').forEach(r =>
      r.classList.toggle('smp-row-sel', parseInt(r.dataset.id) === id));

    const d = await _smpGet(`api/samples_api.php?action=get&id=${id}`);
    if (!d.success) { showToast(d.message, 'error'); return; }

    SMP.selected = d.data;
    SMP.deliveries = d.deliveries || [];
    SMP.tests = d.tests || [];
    SMP.events = d.events || [];

    _smpRenderSide();
  }

  function _smpRenderSide() {
    const side = document.getElementById('smp-side');
    if (!side || !SMP.selected) return;
    const s = SMP.selected;
    const st = SMP_STATUS[s.status] || {};

    // حساب هل يمكن الاعتماد/الرفض
    const canDecide = s.received_date && SMP.tests.length > 0
      && !['approved', 'rejected'].includes(s.status);

    // عدد التسليمات النشطة
    const activeDeliveries = SMP.deliveries.filter(d => d.status === 'delivered');

    side.innerHTML = `
    <div class="smp-side-inner">

      <!-- ── صورة العينة ── -->
      <div class="smp-side-img-wrap" onclick="${s.image_path ? `_smpOpenLightbox(${s.id})` : ''}"
           style="${s.image_path ? 'cursor:pointer' : ''}">
        ${s.image_path
        ? `<img src="${_smpEsc(s.image_path)}" alt="صورة العينة" class="smp-side-img">
             <div class="smp-side-img-overlay"><i class="ti ti-zoom-in" aria-hidden="true"></i></div>`
        : `<div class="smp-side-img-ph">
               <i class="ti ti-camera-off" aria-hidden="true"></i>
               <span>لا توجد صورة</span>
             </div>`}
        <label class="smp-upload-btn" title="رفع/تغيير صورة العينة">
          <i class="ti ti-camera" aria-hidden="true"></i>
          <input type="file" accept="image/*" style="display:none"
            onchange="_smpUploadImage(${s.id}, this)">
        </label>
      </div>

      <!-- ── بطاقة المعلومات الأساسية ── -->
      <div class="smp-side-sec">
        <div class="smp-side-num">${_smpEsc(s.sample_number)}</div>
        <div class="smp-side-name">${_smpEsc(s.name)}</div>
        <div style="display:flex;gap:.4rem;flex-wrap:wrap;margin-top:.4rem">
          <span class="smp-badge ${st.cls}">
            <i class="ti ${st.icon || 'ti-circle'}" style="font-size:.7rem" aria-hidden="true"></i>
            ${st.ar || s.status}
          </span>
          ${s.storage_location
        ? `<span class="smp-badge" style="background:var(--bg-secondary);color:var(--text-muted)">
                <i class="ti ti-building" style="font-size:.7rem" aria-hidden="true"></i>
                ${_smpEsc(SMP_STORAGE[s.storage_location]?.ar?.split('—')[0]?.trim() || s.storage_location)}
               </span>`: ''}
        </div>
      </div>

      <!-- ── بيانات الربط ── -->
      <div class="smp-side-sec">
        <div class="smp-side-sec-hdr"><i class="ti ti-link" aria-hidden="true"></i> الربط والتوثيق</div>
        ${[
        ['رقم أمر الشراء', s.pr_number, 'monospace'],
        ['المورد', s.supplier_name, ''],
        ['رقم الخطاب', s.letter_number, 'monospace'],
        ['جهة العقد', s.contract_party, ''],
        ['رقم العقد', s.contract_number, 'monospace'],
        ['تاريخ العقد', _smpFmt(s.contract_date), ''],
        ['الكود العالمي', s.upc_code, 'monospace'],
      ].filter(([, v]) => v).map(([l, v, c]) => `
          <div class="smp-info-row">
            <span class="smp-info-lbl">${l}</span>
            <span class="smp-info-val" ${c ? `style="font-family:${c};color:var(--primary)"` : ''}>${_smpEsc(v)}</span>
          </div>`).join('')}
        <div class="smp-info-row">
          <span class="smp-info-lbl">الكمية</span>
          <span class="smp-info-val">${parseFloat(s.quantity || 0).toLocaleString('ar')} ${_smpEsc(s.unit)}</span>
        </div>
        <div class="smp-info-row">
          <span class="smp-info-lbl">تاريخ الاستلام</span>
          <span class="smp-info-val">${s.received_date ? _smpFmt(s.received_date) : '<span style="color:var(--accent-amber)">لم يُستلَم بعد</span>'}</span>
        </div>
      </div>

      <!-- ── أزرار الإجراءات ── -->
      <div class="smp-side-sec smp-actions">
        <div class="smp-side-sec-hdr"><i class="ti ti-bolt" aria-hidden="true"></i> الإجراءات</div>

        ${s.status === 'pending' ? `
          <button class="smp-action-btn" onclick="_smpOpenReceiveConfirm(${s.id})">
            <i class="ti ti-package smp-ai-green" aria-hidden="true"></i> تأكيد الاستلام الفيزيائي
          </button>` : ''}

        ${['received', 'in_circulation'].includes(s.status) ? `
          <button class="smp-action-btn" onclick="_smpOpenDeliverModal(${s.id})">
            <i class="ti ti-arrow-up-right smp-ai-amber" aria-hidden="true"></i> تسليم العينة لجهة
          </button>` : ''}

        ${activeDeliveries.length > 0 ? `
          <button class="smp-action-btn" onclick="_smpOpenReturnModal()">
            <i class="ti ti-arrow-down-left smp-ai-blue" aria-hidden="true"></i>
            استلام إرجاع (${activeDeliveries.length} تسليم نشط)
          </button>` : ''}

        <button class="smp-action-btn" onclick="_smpOpenTestModal(${s.id})">
          <i class="ti ti-test-pipe smp-ai-purple" aria-hidden="true"></i> تسجيل نتائج اختبار
        </button>

        ${canDecide ? `
          <button class="smp-action-btn smp-action-approve" onclick="_smpOpenApproveModal(${s.id})">
            <i class="ti ti-circle-check" aria-hidden="true"></i> اعتماد العينة
          </button>
          <button class="smp-action-btn smp-action-reject" onclick="_smpOpenRejectModal(${s.id})">
            <i class="ti ti-circle-x" aria-hidden="true"></i> رفض العينة
          </button>` : ''}

        ${['approved', 'rejected'].includes(s.status) ? `
          <div class="smp-decision-badge ${s.status === 'approved' ? 'approved' : 'rejected'}">
            <i class="ti ${s.status === 'approved' ? 'ti-circle-check' : 'ti-circle-x'}" aria-hidden="true"></i>
            ${s.status === 'approved' ? 'تم اعتماد هذه العينة' : 'تم رفض هذه العينة'}
          </div>` : ''}
      </div>

      <!-- ── التسليمات النشطة ── -->
      ${activeDeliveries.length ? `
      <div class="smp-side-sec">
        <div class="smp-side-sec-hdr"><i class="ti ti-arrows-exchange" aria-hidden="true"></i>
          التسليمات النشطة (${activeDeliveries.length})
        </div>
        ${activeDeliveries.map(d => {
        const isOverdue = d.expected_return_date && new Date(d.expected_return_date) < new Date();
        return `<div class="smp-del-card ${isOverdue ? 'smp-del-overdue' : ''}">
            <div class="smp-del-top">
              <span class="smp-del-num">${_smpEsc(d.delivery_number)}</span>
              <button class="smp-icon-btn" onclick="_smpPrintReceipt(${d.id})" title="طباعة الإيصال">
                <i class="ti ti-printer" aria-hidden="true"></i>
              </button>
            </div>
            <div class="smp-del-body">
              <div class="smp-info-row">
                <span class="smp-info-lbl">الجهة</span>
                <span class="smp-info-val">${_smpEsc(d.dept_name || '—')}</span>
              </div>
              <div class="smp-info-row">
                <span class="smp-info-lbl">المستلم</span>
                <span class="smp-info-val">${_smpEsc(d.receiver_name || '—')}</span>
              </div>
              <div class="smp-info-row">
                <span class="smp-info-lbl">التسليم</span>
                <span class="smp-info-val">${_smpFmtDT(d.delivered_at)}</span>
              </div>
              <div class="smp-info-row">
                <span class="smp-info-lbl">الإرجاع المتوقع</span>
                <span class="smp-info-val" ${isOverdue ? 'style="color:var(--accent-red);font-weight:700"' : ''}>
                  ${d.expected_return_date ? _smpFmt(d.expected_return_date) + (isOverdue ? ' ⚠ متأخر' : '') : '—'}
                </span>
              </div>
            </div>
          </div>`;
      }).join('')}
      </div>` : ''}

      <!-- ── الاختبارات ── -->
      ${SMP.tests.length ? `
      <div class="smp-side-sec">
        <div class="smp-side-sec-hdr"><i class="ti ti-test-pipe" aria-hidden="true"></i>
          الاختبارات (${SMP.tests.length})
        </div>
        ${SMP.tests.map(t => {
        const res = SMP_RESULT[t.result] || {};
        return `<div class="smp-test-card">
            <div class="smp-test-top">
              <span class="smp-test-type">${_smpEsc(t.test_type)}</span>
              <span class="smp-res-badge ${res.cls}">${res.ar || t.result}</span>
            </div>
            <div class="smp-sub">${_smpEsc(t.dept_name || '—')} · ${_smpEsc(t.tester_name || '—')} · ${_smpFmt(t.test_date)}</div>
            ${t.notes ? `<div class="smp-test-notes">${_smpEsc(t.notes)}</div>` : ''}
            ${t.attachment_path ? `
              <a href="${_smpEsc(t.attachment_path)}" target="_blank" class="smp-attach-link">
                <i class="ti ti-paperclip" aria-hidden="true"></i> ${_smpEsc(t.attachment_name || 'النتيجة')}
              </a>`: ''}</div>`;
      }).join('')}
      </div>` : ''}

      <!-- ── مسار التتبع ── -->
      <div class="smp-side-sec">
        <div class="smp-side-sec-hdr"><i class="ti ti-timeline" aria-hidden="true"></i> مسار العينة</div>
        <div class="smp-timeline">
          ${SMP.events.map((e, i) => {
        const isLast = i === SMP.events.length - 1;
        const icon = SMP_EVENT_ICONS[e.event_type] || 'ti-point';
        return `<div class="smp-tl-item">
              <div class="smp-tl-left">
                <div class="smp-tl-dot ${isLast ? 'active' : 'done'}">
                  <i class="ti ${icon}" style="font-size:.65rem" aria-hidden="true"></i>
                </div>
                ${!isLast ? '<div class="smp-tl-line"></div>' : ''}
              </div>
              <div class="smp-tl-right">
                <div class="smp-tl-desc">${_smpEsc(e.description)}</div>
                <div class="smp-tl-meta">${_smpEsc(e.actor_name || 'النظام')} · ${_smpAgo(e.created_at)}</div>
              </div>
            </div>`;
      }).join('')}
          ${!SMP.events.length ? '<div class="smp-sub" style="padding:.5rem 0">لا توجد أحداث بعد</div>' : ''}
        </div>
      </div>

    </div>`;
  }

  // ══════════════════════════════════════════════════════════════
  //  Lightbox الصورة
  // ══════════════════════════════════════════════════════════════
  function _smpOpenLightbox(sampleId) {
    const s = SMP.selected?.id === sampleId ? SMP.selected
      : SMP.list.find(x => x.id === sampleId);
    if (!s?.image_path) return;

    document.getElementById('smp-lb-title').textContent = s.sample_number + ' — ' + s.name;
    document.getElementById('smp-lb-img').src = s.image_path;
    document.getElementById('smp-lb-download').href = s.image_path;
    document.getElementById('smp-lb-download').download = s.sample_number + '.jpg';
    document.getElementById('smp-lb-meta').innerHTML = `
      <div class="smp-lb-meta-grid">
        <div><div class="smp-lb-lbl">الحالة</div>
             <div class="smp-lb-val"><span class="smp-badge ${SMP_STATUS[s.status]?.cls || ''}">${SMP_STATUS[s.status]?.ar || s.status}</span></div></div>
        <div><div class="smp-lb-lbl">المورد</div>
             <div class="smp-lb-val">${_smpEsc(s.supplier_name || '—')}</div></div>
        <div><div class="smp-lb-lbl">تاريخ الاستلام</div>
             <div class="smp-lb-val">${_smpFmt(s.received_date)}</div></div>
      </div>`;
    document.getElementById('smp-lightbox').style.display = 'flex';
  }
  function _smpCloseLightbox() {
    document.getElementById('smp-lightbox').style.display = 'none';
  }

  // ══════════════════════════════════════════════════════════════
  //  رفع الصورة
  // ══════════════════════════════════════════════════════════════
  async function _smpUploadImage(sampleId, input) {
    if (!input.files[0]) return;
    const fd = new FormData();
    fd.append('id', sampleId);
    fd.append('image', input.files[0]);
    showToast('جاري رفع الصورة...', 'info');
    const d = await _smpPostFile('api/samples_api.php?action=upload_image', fd);
    if (d.success) {
      showToast('تم رفع الصورة', 'success');
      // تحديث الصورة في الكاش المحلي
      if (SMP.selected?.id === sampleId) SMP.selected.image_path = d.image_path;
      const inList = SMP.list.find(x => x.id === sampleId);
      if (inList) inList.image_path = d.image_path;
      _smpRenderTable();
      _smpRenderSide();
    } else {
      showToast(d.message || 'فشل رفع الصورة', 'error');
    }
    input.value = '';
  }

  // ══════════════════════════════════════════════════════════════
  //  مودال استلام عينة جديدة
  // ══════════════════════════════════════════════════════════════
  async function _smpOpenReceiveModal() {
    await _smpLoadCacheIfNeeded();

    const suppSS = searchableSelect({
      id: 'smp-cr-sup', placeholder: 'اختر المورد...',
      options: [{ value: '', label: '— اختياري —' },
      ...(SMP.cache.suppliers || []).map(s => ({ value: String(s.id), label: s.name }))]
    });
    const storageSS = searchableSelect({
      id: 'smp-cr-storage', placeholder: 'موقع التخزين...',
      options: Object.entries(SMP_STORAGE).map(([k, v]) => ({ value: k, label: v.ar }))
    });

    _smpOpenModal(`
    <div class="smp-modal-hdr">
      <div class="smp-modal-title"><i class="ti ti-package" aria-hidden="true"></i> استلام عينة جديدة</div>
      <button class="smp-modal-x" onclick="_smpCloseModal()"><i class="ti ti-x" aria-hidden="true"></i></button>
    </div>
    <div class="smp-modal-body">

      <!-- معاينة الرقم التسلسلي -->
      <div class="smp-num-preview">
        <i class="ti ti-hash" aria-hidden="true"></i>
        <span>سيُولَّد الرقم تلقائياً:</span>
        <strong>SMP-${new Date().getFullYear()}-NNN</strong>
      </div>

      <div class="form-row">
        <div class="form-group" style="flex:2">
          <label class="form-label">اسم العينة <span class="req">*</span></label>
          <input type="text" id="smp-cr-name" class="form-input" placeholder="مثال: بريهي زيتي كاكي">
        </div>
        <div class="form-group">
          <label class="form-label">التصنيف</label>
          <input type="text" id="smp-cr-cls" class="form-input" placeholder="نوع المادة...">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">الكمية <span class="req">*</span></label>
          <input type="number" id="smp-cr-qty" class="form-input" min="0.001" step="0.001" value="1">
        </div>
        <div class="form-group">
          <label class="form-label">وحدة القياس</label>
          <select id="smp-cr-unit" class="form-select">
            ${['قطعة', 'متر', 'كيلوجرام', 'طقم', 'دزينة', 'رول', 'كرتون'].map(u => `<option>${u}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">المورد</label>
        ${suppSS}
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">رقم خطاب العينة</label>
          <input type="text" id="smp-cr-letter" class="form-input" placeholder="خطاب/2025/0045">
        </div>
        <div class="form-group">
          <label class="form-label">الكود العالمي (UPC)</label>
          <input type="text" id="smp-cr-upc" class="form-input" placeholder="4006381333931">
        </div>
      </div>
      <div class="smp-section-lbl">بيانات العقد</div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">الجهة (عقد القوات البرية...)</label>
          <input type="text" id="smp-cr-cparty" class="form-input" placeholder="القوات البرية">
        </div>
        <div class="form-group">
          <label class="form-label">رقم العقد</label>
          <input type="text" id="smp-cr-cnum" class="form-input" placeholder="33445">
        </div>
        <div class="form-group">
          <label class="form-label">تاريخ العقد</label>
          <input type="date" id="smp-cr-cdate" class="form-input">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">موقع التخزين</label>
        ${storageSS}
      </div>
      <div class="form-group">
        <label class="form-label">ملاحظات</label>
        <textarea id="smp-cr-notes" class="form-textarea" rows="2" placeholder="أي تفاصيل إضافية..."></textarea>
      </div>
    </div>
    <div class="smp-modal-footer">
      <button class="btn btn-secondary" onclick="_smpCloseModal()">إلغاء</button>
      <button class="btn btn-primary" onclick="_smpSubmitCreate()">
        <i class="ti ti-device-floppy" aria-hidden="true"></i> حفظ العينة
      </button>
    </div>`, 'lg');
    initSearchableSelects();
  }

  async function _smpSubmitCreate() {
    const name = document.getElementById('smp-cr-name')?.value?.trim();
    const qty = parseFloat(document.getElementById('smp-cr-qty')?.value || 0);
    if (!name) { showToast('اسم العينة مطلوب', 'error'); return; }
    if (qty <= 0) { showToast('الكمية يجب أن تكون أكبر من صفر', 'error'); return; }

    const suppEl = document.querySelector('[name="smp-cr-sup"]') || document.getElementById('smp-cr-sup');

    const d = await _smpPost('api/samples_api.php?action=create', {
      name,
      quantity: qty,
      unit: document.getElementById('smp-cr-unit')?.value || 'قطعة',
      classification: document.getElementById('smp-cr-cls')?.value?.trim() || '',
      supplier_id: parseInt(suppEl?.value || 0) || null,
      letter_number: document.getElementById('smp-cr-letter')?.value?.trim() || '',
      upc_code: document.getElementById('smp-cr-upc')?.value?.trim() || '',
      contract_party: document.getElementById('smp-cr-cparty')?.value?.trim() || '',
      contract_number: document.getElementById('smp-cr-cnum')?.value?.trim() || '',
      contract_date: document.getElementById('smp-cr-cdate')?.value || '',
      storage_location: document.querySelector('[name="smp-cr-storage"]')?.value || 'technical_mgmt',
      notes: document.getElementById('smp-cr-notes')?.value?.trim() || '',
    });

    if (d.success) {
      showToast(`✓ ${d.message}`, 'success');
      _smpCloseModal();
      await _smpRefresh();
    } else {
      showToast(d.message || 'حدث خطأ', 'error');
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  تأكيد الاستلام الفيزيائي
  // ══════════════════════════════════════════════════════════════
  function _smpOpenReceiveConfirm(sampleId) {
    const s = SMP.selected;
    _smpOpenModal(`
    <div class="smp-modal-hdr">
      <div class="smp-modal-title"><i class="ti ti-package" aria-hidden="true"></i> تأكيد الاستلام الفيزيائي</div>
      <button class="smp-modal-x" onclick="_smpCloseModal()"><i class="ti ti-x" aria-hidden="true"></i></button>
    </div>
    <div class="smp-modal-body">
      <div class="smp-confirm-info">
        <div class="smp-num">${_smpEsc(s?.sample_number)}</div>
        <div class="smp-name">${_smpEsc(s?.name)}</div>
      </div>
      <div class="form-group" style="margin-top:1rem">
        <label class="form-label">تاريخ الاستلام</label>
        <input type="date" id="smp-recv-date" class="form-input" value="${new Date().toISOString().slice(0, 10)}">
      </div>
      <div class="form-group">
        <label class="form-label">ملاحظة (اختياري)</label>
        <textarea id="smp-recv-notes" class="form-textarea" rows="2" placeholder="حالة العينة عند الاستلام..."></textarea>
      </div>
    </div>
    <div class="smp-modal-footer">
      <button class="btn btn-secondary" onclick="_smpCloseModal()">إلغاء</button>
      <button class="btn btn-primary" onclick="_smpSubmitReceive(${sampleId})">
        <i class="ti ti-check" aria-hidden="true"></i> تأكيد الاستلام
      </button>
    </div>`, 'sm');
  }

  async function _smpSubmitReceive(id) {
    const d = await _smpPost('api/samples_api.php?action=receive', {
      id,
      received_date: document.getElementById('smp-recv-date')?.value,
      notes: document.getElementById('smp-recv-notes')?.value?.trim() || '',
    });
    if (d.success) { showToast('تم تسجيل الاستلام الفيزيائي', 'success'); _smpCloseModal(); await _smpRefreshSelected(id); }
    else showToast(d.message, 'error');
  }

  // ══════════════════════════════════════════════════════════════
  //  مودال تسليم العينة — مع إيصال DEL-YYYY-NNNN
  // ══════════════════════════════════════════════════════════════
  async function _smpOpenDeliverModal(sampleId) {
    await _smpLoadCacheIfNeeded();
    const sid = sampleId || SMP.selected?.id;
    const s = SMP.selected;

    const deptSS = searchableSelect({
      id: 'smp-dl-dept', placeholder: 'الجهة الطالبة...',
      options: [{ value: '', label: '— اختر الجهة —' },
      ...(SMP.cache.depts || []).map(d => ({ value: String(d.id), label: d.name }))]
    });
    const ccSS = searchableSelect({
      id: 'smp-dl-cc', placeholder: 'مركز التكلفة...',
      options: [{ value: '', label: '— اختر مركز التكلفة —' },
      ...(SMP.cache.costCenters || []).map(c => ({ value: String(c.id), label: `${c.code} — ${c.name}` }))]
    });
    const empSS = searchableSelect({
      id: 'smp-dl-recv', placeholder: 'اسم المستلم...',
      options: [{ value: '', label: '— اختر الموظف أو أدخل يدوياً —' },
      ...(SMP.cache.employees['all'] || []).map(e => ({ value: String(e.id), label: e.name }))]
    });

    _smpOpenModal(`
    <div class="smp-modal-hdr">
      <div class="smp-modal-title"><i class="ti ti-arrow-up-right" aria-hidden="true"></i> تسليم العينة</div>
      <button class="smp-modal-x" onclick="_smpCloseModal()"><i class="ti ti-x" aria-hidden="true"></i></button>
    </div>
    <div class="smp-modal-body">

      <!-- بيانات العينة -->
      ${s ? `<div class="smp-mv-sample-bar">
        <span class="smp-num">${_smpEsc(s.sample_number)}</span>
        <span>${_smpEsc(s.name)}</span>
        <span class="smp-badge ${SMP_STATUS[s.status]?.cls || ''}">${SMP_STATUS[s.status]?.ar || s.status}</span>
      </div>` : ''}

      <!-- نوع الجهة -->
      <div class="form-group">
        <label class="form-label">نوع الجهة الطالبة</label>
        <div style="display:flex;gap:.6rem">
          <label class="smp-radio-lbl">
            <input type="radio" name="smp-dl-ext" value="0" checked> داخل القطاع
          </label>
          <label class="smp-radio-lbl">
            <input type="radio" name="smp-dl-ext" value="1"> قطاع آخر
          </label>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">الجهة الطالبة <span class="req">*</span></label>
        ${deptSS}
      </div>

      <div class="form-group">
        <label class="form-label">اسم المستلم <span class="req">*</span></label>
        ${empSS}
        <input type="text" id="smp-dl-recv-manual" class="form-input" style="margin-top:.35rem"
               placeholder="أو أدخل الاسم يدوياً إن لم يكن في القائمة">
      </div>

      <div class="form-group">
        <label class="form-label">الغرض من الطلب <span class="req">*</span></label>
        <textarea id="smp-dl-purpose" class="form-textarea" rows="2"
          placeholder="اختبارات مطابقة المواصفات / دراسة / عرض..."></textarea>
      </div>

      <div class="form-group">
        <label class="form-label">مركز التكلفة <span class="req">*</span></label>
        ${ccSS}
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">تاريخ التسليم</label>
          <input type="datetime-local" id="smp-dl-date" class="form-input"
                 value="${new Date().toISOString().slice(0, 16)}" readonly style="background:var(--bg-secondary);cursor:not-allowed">
          <div class="form-hint">يُملأ تلقائياً</div>
        </div>
        <div class="form-group">
          <label class="form-label">الإرجاع المتوقع</label>
          <input type="date" id="smp-dl-return" class="form-input">
        </div>
      </div>

    </div>
    <div class="smp-modal-footer">
      <button class="btn btn-secondary" onclick="_smpCloseModal()">إلغاء</button>
      <button class="btn btn-primary" onclick="_smpSubmitDeliver(${sid})">
        <i class="ti ti-arrow-up-right" aria-hidden="true"></i> تأكيد التسليم وطباعة الإيصال
      </button>
    </div>`, 'lg');
    initSearchableSelects();
  }

  async function _smpSubmitDeliver(sampleId) {
    const deptEl = document.querySelector('[name="smp-dl-dept"]');
    const ccEl = document.querySelector('[name="smp-dl-cc"]');
    const empEl = document.querySelector('[name="smp-dl-recv"]');
    const empManual = document.getElementById('smp-dl-recv-manual')?.value?.trim();
    const purpose = document.getElementById('smp-dl-purpose')?.value?.trim();
    const isExt = document.querySelector('input[name="smp-dl-ext"]:checked')?.value || '0';

    if (!deptEl?.value) { showToast('يجب اختيار الجهة الطالبة', 'error'); return; }
    if (!purpose) { showToast('الغرض مطلوب', 'error'); return; }
    if (!ccEl?.value) { showToast('مركز التكلفة مطلوب', 'error'); return; }

    const receiverName = empManual || (empEl?.options?.[empEl.selectedIndex]?.text) || '';
    if (!receiverName) { showToast('اسم المستلم مطلوب', 'error'); return; }

    const d = await _smpPost('api/samples_api.php?action=deliver', {
      sample_id: sampleId,
      dept_id: parseInt(deptEl.value),
      is_external: parseInt(isExt),
      receiver_id: parseInt(empEl?.value || 0) || null,
      receiver_name: receiverName,
      purpose,
      cost_center_id: parseInt(ccEl.value) || null,
      expected_return: document.getElementById('smp-dl-return')?.value || '',
    });

    if (d.success) {
      showToast(`✓ ${d.message}`, 'success');
      _smpCloseModal();
      // فتح الإيصال للطباعة تلقائياً
      _smpPrintReceipt(d.delivery_id);
      await _smpRefreshSelected(sampleId);
    } else {
      showToast(d.message || 'حدث خطأ', 'error');
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  إيصال التسليم — طباعة في نافذة جديدة
  // ══════════════════════════════════════════════════════════════
  async function _smpPrintReceipt(deliveryId) {
    const d = await _smpGet(`api/samples_api.php?action=get_delivery_receipt&delivery_id=${deliveryId}`);
    if (!d.success) { showToast(d.message, 'error'); return; }
    const r = d.data;

    const html = `<!DOCTYPE html><html dir="rtl" lang="ar">
<head><meta charset="utf-8"><title>إيصال تسليم ${_smpEsc(r.delivery_number)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#222;background:#fff;padding:24px}
  .receipt{border:1px solid #ccc;border-radius:10px;overflow:hidden;max-width:720px;margin:0 auto}
  .r-header{background:#1D9E75;color:#fff;padding:16px 20px;display:flex;justify-content:space-between;align-items:flex-start}
  .r-title{font-size:18px;font-weight:700}
  .r-num{font-family:monospace;font-size:12px;opacity:.8;margin-top:4px}
  .r-org{font-size:11px;opacity:.7;text-align:left}
  .r-body{padding:20px}
  .section-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#666;margin:16px 0 8px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px}
  .field{background:#f5f5f5;border-radius:6px;padding:8px 10px}
  .field-label{font-size:10px;color:#888;margin-bottom:2px}
  .field-value{font-size:13px;font-weight:600}
  .sig-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}
  .sig-box{border:1px dashed #ccc;border-radius:8px;padding:12px;text-align:center;min-height:80px}
  .sig-check{width:32px;height:32px;background:#1D9E75;border-radius:50%;color:#fff;font-size:16px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:6px}
  .sig-name{font-weight:700;font-size:13px;color:#085041}
  .sig-role{font-size:10px;color:#666;margin-top:2px}
  .sig-time{font-size:11px;color:#0F6E56;margin-top:2px}
  .hash-box{background:#f5f5f5;border-radius:6px;padding:10px;display:flex;align-items:center;gap:8px;font-size:11px}
  .r-footer{background:#f5f5f5;padding:10px 20px;font-size:11px;color:#888;display:flex;justify-content:space-between}
  @media print{body{padding:0}.r-footer button{display:none}}
</style></head><body>
<div class="receipt">
  <div class="r-header">
    <div>
      <div class="r-title">إيصال تسليم عينة</div>
      <div class="r-num">${_smpEsc(r.delivery_number)}</div>
    </div>
    <div class="r-org">
      الشركة السعودية لتصنيع الملابس والتجهيزات العسكرية<br>
      ${_smpFmtDT(r.delivered_at)}
    </div>
  </div>
  <div class="r-body">
    <div class="section-title">بيانات العينة</div>
    <div class="grid">
      <div class="field"><div class="field-label">رقم العينة</div><div class="field-value" style="color:#1D9E75;font-family:monospace">${_smpEsc(r.sample_number)}</div></div>
      <div class="field"><div class="field-label">اسم العينة</div><div class="field-value">${_smpEsc(r.sample_name)}</div></div>
      <div class="field"><div class="field-label">رقم أمر الشراء</div><div class="field-value" style="font-family:monospace">${_smpEsc(r.pr_number || '—')}</div></div>
      <div class="field"><div class="field-label">المورد</div><div class="field-value">${_smpEsc(r.supplier_name || '—')}</div></div>
    </div>
    <div class="section-title">بيانات التسليم</div>
    <div class="grid">
      <div class="field"><div class="field-label">الجهة الطالبة</div><div class="field-value">${_smpEsc(r.dept_name || '—')}</div></div>
      <div class="field"><div class="field-label">مركز التكلفة</div><div class="field-value" style="font-family:monospace">${_smpEsc(r.cc_code || '—')} ${_smpEsc(r.cc_name || '')}</div></div>
      <div class="field"><div class="field-label">الغرض</div><div class="field-value">${_smpEsc(r.purpose || '—')}</div></div>
      <div class="field"><div class="field-label">الإرجاع المتوقع</div><div class="field-value">${r.expected_return_date ? _smpFmt(r.expected_return_date) : '—'}</div></div>
    </div>
    <div class="section-title">التوقيعات والموافقات</div>
    <div class="sig-grid">
      <div class="sig-box">
        <div class="sig-check">✓</div>
        <div class="sig-name">${_smpEsc(r.delivered_by_name || '—')}</div>
        <div class="sig-role">المسلِّم — الإدارة الفنية</div>
        <div class="sig-time">${_smpFmtDT(r.delivered_at)}</div>
      </div>
      <div class="sig-box">
        <div class="sig-check">✓</div>
        <div class="sig-name">${_smpEsc(r.receiver_name || r.receiver_name_full || '—')}</div>
        <div class="sig-role">المستلم — ${_smpEsc(r.dept_name || '—')}</div>
        <div class="sig-time">${_smpFmtDT(r.delivered_at)}</div>
      </div>
    </div>
    <div class="hash-box">
      <span style="color:#1D9E75;font-size:16px">🔒</span>
      <div>
        <strong>موثَّق رقمياً بالنظام</strong><br>
        <span style="font-family:monospace">DEL: ${_smpEsc(r.delivery_number)} · ${_smpFmtDT(r.delivered_at)}</span>
      </div>
    </div>
  </div>
  <div class="r-footer">
    <span>يُعدّ هذا الإيصال وثيقة رسمية معتمدة من النظام</span>
    <button onclick="window.print()" style="padding:4px 12px;cursor:pointer;border-radius:5px;border:1px solid #ccc">طباعة</button>
  </div>
</div>
</body></html>`;

    const w = window.open('', '_blank', 'width=780,height=700');
    if (w) { w.document.write(html); w.document.close(); }
  }

  // ══════════════════════════════════════════════════════════════
  //  مودال إرجاع العينة
  // ══════════════════════════════════════════════════════════════
  function _smpOpenReturnModal() {
    const activeDels = SMP.deliveries.filter(d => d.status === 'delivered');
    if (!activeDels.length) { showToast('لا توجد تسليمات نشطة', 'info'); return; }

    _smpOpenModal(`
    <div class="smp-modal-hdr">
      <div class="smp-modal-title"><i class="ti ti-arrow-down-left" aria-hidden="true"></i> تسجيل إرجاع العينة</div>
      <button class="smp-modal-x" onclick="_smpCloseModal()"><i class="ti ti-x" aria-hidden="true"></i></button>
    </div>
    <div class="smp-modal-body">
      <div class="form-group">
        <label class="form-label">اختر التسليم المُرجَع <span class="req">*</span></label>
        <select id="smp-rt-del" class="pr-select">
          ${activeDels.map(d => `<option value="${d.id}">
            ${_smpEsc(d.delivery_number)} — ${_smpEsc(d.dept_name || '—')} (${_smpEsc(d.receiver_name || '—')})
          </option>`).join('')}
        </select>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">تاريخ الإرجاع</label>
          <input type="date" id="smp-rt-date" class="form-input" value="${new Date().toISOString().slice(0, 10)}">
        </div>
        <div class="form-group">
          <label class="form-label">حالة العينة عند الإرجاع</label>
          <select id="smp-rt-cond" class="pr-select">
            <option value="good">سليمة</option>
            <option value="damaged">تالفة</option>
            <option value="partial">جزئية</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">ملاحظة الإرجاع</label>
        <textarea id="smp-rt-notes" class="form-textarea" rows="2" placeholder="حالة العينة / سبب التأخر..."></textarea>
      </div>
    </div>
    <div class="smp-modal-footer">
      <button class="btn btn-secondary" onclick="_smpCloseModal()">إلغاء</button>
      <button class="btn btn-primary" onclick="_smpSubmitReturn()">
        <i class="ti ti-check" aria-hidden="true"></i> تأكيد الإرجاع
      </button>
    </div>`, 'sm');
  }

  async function _smpSubmitReturn() {
    const delId = parseInt(document.getElementById('smp-rt-del')?.value || 0);
    if (!delId) { showToast('اختر التسليم', 'error'); return; }
    const d = await _smpPost('api/samples_api.php?action=return_delivery', {
      delivery_id: delId,
      return_date: document.getElementById('smp-rt-date')?.value,
      condition: document.getElementById('smp-rt-cond')?.value,
      notes: document.getElementById('smp-rt-notes')?.value?.trim() || '',
    });
    if (d.success) {
      showToast('تم تسجيل الإرجاع', 'success');
      _smpCloseModal();
      await _smpRefreshSelected(SMP.selected?.id);
    } else {
      showToast(d.message, 'error');
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  مودال تسجيل الاختبار — مع رفع مرفق
  // ══════════════════════════════════════════════════════════════
  async function _smpOpenTestModal(sampleId) {
    await _smpLoadCacheIfNeeded();

    const deptSS = searchableSelect({
      id: 'smp-ts-dept', placeholder: 'الجهة المنفِّذة...',
      options: [{ value: '', label: '— اختر الجهة —' },
      ...(SMP.cache.depts || []).map(d => ({ value: String(d.id), label: d.name }))]
    });

    const testTypes = ['مطابقة المواصفات', 'مقاومة الحرارة', 'مقاومة الماء', 'الجودة العامة',
      'اختبار الخامة', 'اختبار اللون', 'اختبار المتانة', 'اختبار الأبعاد'];

    _smpOpenModal(`
    <div class="smp-modal-hdr">
      <div class="smp-modal-title"><i class="ti ti-test-pipe" aria-hidden="true"></i> تسجيل نتائج اختبار</div>
      <button class="smp-modal-x" onclick="_smpCloseModal()"><i class="ti ti-x" aria-hidden="true"></i></button>
    </div>
    <div class="smp-modal-body">

      <div class="smp-mv-sample-bar">
        <span class="smp-num">${_smpEsc(SMP.selected?.sample_number || '')}</span>
        <span>${_smpEsc(SMP.selected?.name || '')}</span>
      </div>

      <div class="form-row">
        <div class="form-group" style="flex:2">
          <label class="form-label">نوع الاختبار <span class="req">*</span></label>
          <input type="text" id="smp-ts-type" class="form-input" list="smp-ts-types-list"
                 placeholder="اختر أو أدخل نوع الاختبار...">
          <datalist id="smp-ts-types-list">
            ${testTypes.map(t => `<option value="${t}">`).join('')}
          </datalist>
        </div>
        <div class="form-group">
          <label class="form-label">تاريخ الاختبار</label>
          <input type="date" id="smp-ts-date" class="form-input" value="${new Date().toISOString().slice(0, 10)}">
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">الجهة المنفِّذة</label>
        ${deptSS}
      </div>

      <div class="form-group">
        <label class="form-label">النتيجة <span class="req">*</span></label>
        <div style="display:flex;gap:.75rem">
          ${[['pass', '✓ مطابق', '#27500A', '#E1F5EE'], ['fail', '✗ غير مطابق', '#791F1F', '#FCEBEB'], ['pending', '⏳ قيد المتابعة', '#633806', '#FAEEDA']].map(([v, l, tc, bg]) => `
          <label class="smp-res-radio" style="flex:1;text-align:center;padding:.55rem;border-radius:8px;border:1.5px solid transparent;cursor:pointer;transition:all .15s"
                 id="smp-res-lbl-${v}" onclick="_smpSelectResult('${v}')">
            <input type="radio" name="smp-ts-result" value="${v}" style="display:none"> ${l}
          </label>`).join('')}
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">الملاحظات</label>
        <textarea id="smp-ts-notes" class="form-textarea" rows="2" placeholder="ملخص نتيجة الاختبار..."></textarea>
      </div>
      <div class="form-group">
        <label class="form-label">تفاصيل تقنية (اختياري)</label>
        <textarea id="smp-ts-details" class="form-textarea" rows="2" placeholder="القيم المقيسة / المرجع المعياري..."></textarea>
      </div>

      <div class="form-group">
        <label class="form-label">مرفق نتيجة الاختبار (PDF أو صورة)</label>
        <label class="smp-file-drop" id="smp-ts-filedrop">
          <i class="ti ti-upload" aria-hidden="true"></i>
          <span id="smp-ts-filename">اسحب الملف هنا أو اضغط للاختيار</span>
          <input type="file" id="smp-ts-file" accept=".pdf,.jpg,.jpeg,.png,.xlsx,.docx"
                 style="display:none" onchange="_smpUpdateFileName(this)">
        </label>
      </div>

    </div>
    <div class="smp-modal-footer">
      <button class="btn btn-secondary" onclick="_smpCloseModal()">إلغاء</button>
      <button class="btn btn-primary" onclick="_smpSubmitTest(${sampleId})">
        <i class="ti ti-device-floppy" aria-hidden="true"></i> حفظ نتيجة الاختبار
      </button>
    </div>`, 'md');
    initSearchableSelects();
  }

  function _smpSelectResult(val) {
    const colors = { pass: ['#27500A', '#E1F5EE'], fail: ['#791F1F', '#FCEBEB'], pending: ['#633806', '#FAEEDA'] };
    ['pass', 'fail', 'pending'].forEach(v => {
      const el = document.getElementById('smp-res-lbl-' + v);
      if (!el) return;
      if (v === val) {
        el.style.borderColor = colors[v][0];
        el.style.background = colors[v][1];
        el.style.color = colors[v][0];
        el.style.fontWeight = '700';
        el.querySelector('input').checked = true;
      } else {
        el.style.borderColor = 'var(--border-color)';
        el.style.background = '';
        el.style.color = '';
        el.style.fontWeight = '';
      }
    });
  }

  function _smpUpdateFileName(input) {
    const span = document.getElementById('smp-ts-filename');
    if (span && input.files[0]) span.textContent = input.files[0].name;
  }

  async function _smpSubmitTest(sampleId) {
    const testType = document.getElementById('smp-ts-type')?.value?.trim();
    const result = document.querySelector('input[name="smp-ts-result"]:checked')?.value;
    if (!testType) { showToast('نوع الاختبار مطلوب', 'error'); return; }
    if (!result) { showToast('يجب اختيار النتيجة', 'error'); return; }

    const fd = new FormData();
    fd.append('sample_id', sampleId);
    fd.append('test_type', testType);
    fd.append('result', result);
    fd.append('test_date', document.getElementById('smp-ts-date')?.value);
    fd.append('notes', document.getElementById('smp-ts-notes')?.value?.trim() || '');
    fd.append('details', document.getElementById('smp-ts-details')?.value?.trim() || '');

    const deptEl = document.querySelector('[name="smp-ts-dept"]');
    if (deptEl?.value) fd.append('dept_id', deptEl.value);

    const fileEl = document.getElementById('smp-ts-file');
    if (fileEl?.files[0]) fd.append('result_file', fileEl.files[0]);

    const d = await _smpPostFile('api/samples_api.php?action=add_test', fd);
    if (d.success) {
      showToast(`✓ ${d.message}`, 'success');
      _smpCloseModal();
      await _smpRefreshSelected(sampleId);
    } else {
      showToast(d.message || 'حدث خطأ', 'error');
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  مودال الاعتماد والرفض
  // ══════════════════════════════════════════════════════════════
  function _smpOpenApproveModal(id) {
    _smpOpenModal(`
    <div class="smp-modal-hdr">
      <div class="smp-modal-title" style="color:#27500A"><i class="ti ti-circle-check" aria-hidden="true"></i> اعتماد العينة</div>
      <button class="smp-modal-x" onclick="_smpCloseModal()"><i class="ti ti-x" aria-hidden="true"></i></button>
    </div>
    <div class="smp-modal-body">
      <div class="smp-confirm-info">
        <div class="smp-num">${_smpEsc(SMP.selected?.sample_number)}</div>
        <div class="smp-name">${_smpEsc(SMP.selected?.name)}</div>
        <div style="margin-top:.5rem;font-size:.8rem;color:var(--text-muted)">
          الاختبارات: ${SMP.tests.length} · ناجح: ${SMP.tests.filter(t => t.result === 'pass').length}
        </div>
      </div>
      <div class="form-group" style="margin-top:1rem">
        <label class="form-label">ملاحظة قرار الاعتماد <span class="req">*</span></label>
        <textarea id="smp-ap-notes" class="form-textarea" rows="3"
          placeholder="مبررات الاعتماد / النتائج التي استُند إليها..." autofocus></textarea>
      </div>
    </div>
    <div class="smp-modal-footer">
      <button class="btn btn-secondary" onclick="_smpCloseModal()">إلغاء</button>
      <button class="btn btn-primary" style="background:#1D9E75;border-color:#1D9E75"
              onclick="_smpSubmitApprove(${id})">
        <i class="ti ti-circle-check" aria-hidden="true"></i> تأكيد الاعتماد
      </button>
    </div>`, 'sm');
    setTimeout(() => document.getElementById('smp-ap-notes')?.focus(), 100);
  }

  async function _smpSubmitApprove(id) {
    const notes = document.getElementById('smp-ap-notes')?.value?.trim();
    if (!notes) { showToast('الملاحظة مطلوبة', 'error'); return; }
    const d = await _smpPost('api/samples_api.php?action=approve', { id, notes });
    if (d.success) { showToast('✓ تم اعتماد العينة', 'success'); _smpCloseModal(); await _smpRefreshSelected(id); }
    else showToast(d.message, 'error');
  }

  function _smpOpenRejectModal(id) {
    _smpOpenModal(`
    <div class="smp-modal-hdr">
      <div class="smp-modal-title" style="color:#791F1F"><i class="ti ti-circle-x" aria-hidden="true"></i> رفض العينة</div>
      <button class="smp-modal-x" onclick="_smpCloseModal()"><i class="ti ti-x" aria-hidden="true"></i></button>
    </div>
    <div class="smp-modal-body">
      <div class="smp-confirm-info">
        <div class="smp-num">${_smpEsc(SMP.selected?.sample_number)}</div>
        <div class="smp-name">${_smpEsc(SMP.selected?.name)}</div>
      </div>
      <div style="background:rgba(242,111,99,.07);border:.5px solid rgba(242,111,99,.3);border-radius:8px;padding:.7rem .9rem;margin:1rem 0;font-size:.82rem;color:#791F1F">
        <i class="ti ti-alert-triangle" aria-hidden="true"></i>
        سيُسجَّل قرار الرفض في مسار العينة ولا يمكن التراجع عنه إلا بتغيير يدوي.
      </div>
      <div class="form-group">
        <label class="form-label">سبب الرفض <span class="req">*</span></label>
        <textarea id="smp-rj-reason" class="form-textarea" rows="3"
          placeholder="سبب الرفض / المواصفات التي لم تُستوفَ..." autofocus></textarea>
      </div>
    </div>
    <div class="smp-modal-footer">
      <button class="btn btn-secondary" onclick="_smpCloseModal()">إلغاء</button>
      <button class="btn btn-danger" onclick="_smpSubmitReject(${id})">
        <i class="ti ti-circle-x" aria-hidden="true"></i> تأكيد الرفض
      </button>
    </div>`, 'sm');
    setTimeout(() => document.getElementById('smp-rj-reason')?.focus(), 100);
  }

  async function _smpSubmitReject(id) {
    const reason = document.getElementById('smp-rj-reason')?.value?.trim();
    if (!reason) { showToast('سبب الرفض مطلوب', 'error'); return; }
    const d = await _smpPost('api/samples_api.php?action=reject', { id, reason });
    if (d.success) { showToast('تم رفض العينة وتسجيل القرار', 'warning'); _smpCloseModal(); await _smpRefreshSelected(id); }
    else showToast(d.message, 'error');
  }

  // ══════════════════════════════════════════════════════════════
  //  مودال تعديل العينة
  // ══════════════════════════════════════════════════════════════
  async function _smpOpenEditModal(id) {
    if (SMP.selected?.id !== id) await _smpSelectRow(id);
    const s = SMP.selected;
    if (!s) return;

    _smpOpenModal(`
    <div class="smp-modal-hdr">
      <div class="smp-modal-title"><i class="ti ti-edit" aria-hidden="true"></i> تعديل بيانات العينة</div>
      <button class="smp-modal-x" onclick="_smpCloseModal()"><i class="ti ti-x" aria-hidden="true"></i></button>
    </div>
    <div class="smp-modal-body">
      <div class="smp-num" style="margin-bottom:.75rem">${_smpEsc(s.sample_number)}</div>
      <div class="form-row">
        <div class="form-group" style="flex:2">
          <label class="form-label">الاسم</label>
          <input type="text" id="smp-ed-name" class="form-input" value="${_smpEsc(s.name)}">
        </div>
        <div class="form-group">
          <label class="form-label">التصنيف</label>
          <input type="text" id="smp-ed-cls" class="form-input" value="${_smpEsc(s.classification || '')}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">الكمية</label>
          <input type="number" id="smp-ed-qty" class="form-input" value="${parseFloat(s.quantity || 0)}" min="0.001" step="0.001">
        </div>
        <div class="form-group">
          <label class="form-label">الوحدة</label>
          <input type="text" id="smp-ed-unit" class="form-input" value="${_smpEsc(s.unit || 'قطعة')}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">رقم الخطاب</label>
          <input type="text" id="smp-ed-letter" class="form-input" value="${_smpEsc(s.letter_number || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">الكود العالمي</label>
          <input type="text" id="smp-ed-upc" class="form-input" value="${_smpEsc(s.upc_code || '')}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">جهة العقد</label>
          <input type="text" id="smp-ed-cparty" class="form-input" value="${_smpEsc(s.contract_party || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">رقم العقد</label>
          <input type="text" id="smp-ed-cnum" class="form-input" value="${_smpEsc(s.contract_number || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">تاريخ العقد</label>
          <input type="date" id="smp-ed-cdate" class="form-input" value="${s.contract_date || ''}">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">موقع التخزين</label>
        <select id="smp-ed-storage" class="pr-select">
          ${Object.entries(SMP_STORAGE).map(([k, v]) => `<option value="${k}" ${s.storage_location === k ? 'selected' : ''}>${v.ar}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="smp-modal-footer">
      <button class="btn btn-danger btn-sm" onclick="_smpDelete(${s.id})"><i class="ti ti-archive" aria-hidden="true"></i> أرشفة</button>
      <div style="flex:1"></div>
      <button class="btn btn-secondary" onclick="_smpCloseModal()">إلغاء</button>
      <button class="btn btn-primary" onclick="_smpSubmitEdit(${s.id})">
        <i class="ti ti-device-floppy" aria-hidden="true"></i> حفظ
      </button>
    </div>`, 'lg');
  }

  async function _smpSubmitEdit(id) {
    const d = await _smpPost('api/samples_api.php?action=update', {
      id,
      name: document.getElementById('smp-ed-name')?.value?.trim(),
      classification: document.getElementById('smp-ed-cls')?.value?.trim(),
      quantity: parseFloat(document.getElementById('smp-ed-qty')?.value || 0),
      unit: document.getElementById('smp-ed-unit')?.value?.trim(),
      letter_number: document.getElementById('smp-ed-letter')?.value?.trim(),
      upc_code: document.getElementById('smp-ed-upc')?.value?.trim(),
      contract_party: document.getElementById('smp-ed-cparty')?.value?.trim(),
      contract_number: document.getElementById('smp-ed-cnum')?.value?.trim(),
      contract_date: document.getElementById('smp-ed-cdate')?.value,
      storage_location: document.getElementById('smp-ed-storage')?.value,
    });
    if (d.success) { showToast('تم الحفظ', 'success'); _smpCloseModal(); await _smpRefreshSelected(id); }
    else showToast(d.message, 'error');
  }

  async function _smpDelete(id) {
    if (!confirm('هل تريد أرشفة هذه العينة؟')) return;
    const d = await _smpPost('api/samples_api.php?action=delete', { id });
    if (d.success) { showToast('تمت الأرشفة', 'success'); _smpCloseModal(); SMP.selected = null; await _smpRefresh(); }
    else showToast(d.message, 'error');
  }

  // ══════════════════════════════════════════════════════════════
  //  فحص التنبيهات يدوياً
  // ══════════════════════════════════════════════════════════════
  async function _smpCheckOverdue() {
    showToast('جاري فحص التسليمات المتأخرة...', 'info');
    const d = await _smpPost('api/samples_api.php?action=check_overdue', {});
    if (d.success) showToast(d.message, d.data?.notified > 0 ? 'warning' : 'success');
    else showToast(d.message, 'error');
  }

  // ══════════════════════════════════════════════════════════════
  //  تحميل الكاشات للقوائم المنسدلة
  // ══════════════════════════════════════════════════════════════
  async function _smpLoadCacheIfNeeded() {
    const toLoad = [];
    if (!SMP.cache.depts) toLoad.push('departments');
    if (!SMP.cache.costCenters) toLoad.push('cost_centers');
    if (!SMP.cache.suppliers) toLoad.push('suppliers');
    if (!SMP.cache.employees['all']) toLoad.push('employees');

    await Promise.all(toLoad.map(async type => {
      const d = await _smpGet(`api/samples_api.php?action=options&type=${type}`);
      if (d.success) {
        if (type === 'departments') SMP.cache.depts = d.data;
        if (type === 'cost_centers') SMP.cache.costCenters = d.data;
        if (type === 'suppliers') SMP.cache.suppliers = d.data;
        if (type === 'employees') SMP.cache.employees['all'] = d.data;
      }
    }));
  }

  // ══════════════════════════════════════════════════════════════
  //  أدوات مساعدة للواجهة
  // ══════════════════════════════════════════════════════════════
  function _smpOpenModal(html, size = 'md') {
    const overlay = document.getElementById('smp-overlay');
    const modal = document.getElementById('smp-modal');
    const inner = document.getElementById('smp-modal-inner');
    if (!overlay || !modal || !inner) return;
    inner.innerHTML = html;
    modal.className = `smp-modal ${size === 'lg' ? 'smp-modal-lg' : size === 'sm' ? 'smp-modal-sm' : ''}`;
    overlay.style.display = 'flex';
  }
  function _smpCloseModal() {
    const o = document.getElementById('smp-overlay');
    if (o) o.style.display = 'none';
  }

  async function _smpRefresh() {
    const statsRes = await _smpGet('api/samples_api.php?action=stats');
    if (statsRes.success) SMP.stats = statsRes.data;
    _smpRenderShell(document.getElementById('smp-root')?.parentElement || document.getElementById('main-content') || DOM?.mainContent);
    await _smpLoadList();
  }

  async function _smpRefreshSelected(id) {
    await _smpLoadList();
    if (id) await _smpSelectRow(id);
  }

  function _smpFilterChange(key, val) { SMP.filters[key] = val; SMP.page = 1; _smpLoadList(); }
  function _smpFilterBy(status) { SMP.filters.status = status === 'overdue' ? '' : status; SMP.page = 1; _smpLoadList(); }
  function _smpPage(dir) { SMP.page = Math.max(1, Math.min(SMP.totalPages, SMP.page + dir)); _smpLoadList(); }

  let _smpSearchTimer = null;
  function _smpDebounce(val) {
    clearTimeout(_smpSearchTimer);
    _smpSearchTimer = setTimeout(() => { SMP.filters.search = val; SMP.page = 1; _smpLoadList(); }, 380);
  }


  // ═══════════════════════════════════════════════════════════════════
  //  ② مستودع العينات مع الموردين — app-sample-warehouse
  // ═══════════════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════════════
  //  app-sample-warehouse.js — تتبع العينات مع الموردين
  //  المسارات: أقسام داخلية ↔ موردين ↔ إنتاج
  //  الميزات:
  //   - رقم تسلسلي SMP-YYYY-NNN-[F/A/R/S]
  //   - قوائم منسدلة بـ searchableSelect (طلبات الشراء + الموردين)
  //   - تغيير الحالة: زر خارجي يختفي بعد التغيير + نافذة تأكيد
  // ═══════════════════════════════════════════════════════════════════

  // ── XSS protection ───────────────────────────────────────────────
  function swEsc(v) {
    if (v == null) return '';
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  // guard — لا نُعيد تعريف escapeHtml إن كانت موجودة في ملف آخر
  if (typeof escapeHtml === 'undefined') window.escapeHtml = swEsc;

  // ── fetch helpers ─────────────────────────────────────────────────
  async function swPost(url, body = {}) {
    let token = null;
    if (typeof _getCsrfToken === 'function') token = await _getCsrfToken();
    if (token) body.csrf_token = token;
    try {
      const r = await fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const ct = r.headers.get('content-type') || '';
      if (!ct.includes('application/json')) { const t = await r.text(); console.error('swPost non-JSON', url, t.slice(0, 200)); return { success: false, message: 'خطأ في الاتصال بالخادم' }; }
      return r.json();
    } catch (e) { console.error('swPost err', e); return { success: false, message: e.message }; }
  }
  async function swGet(url) {
    try {
      const r = await fetch(url, { credentials: 'same-origin' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const ct = r.headers.get('content-type') || '';
      if (!ct.includes('application/json')) throw new Error('not JSON');
      return r.json();
    } catch (e) { console.error('swGet err:', url, e.message); return { success: false, message: e.message }; }
  }

  // ── حالة التطبيق ─────────────────────────────────────────────────
  var SWH = {
    samples: [], selected: null, inventory: null, variants: [],
    movements: [], stageLog: [], supplierTrips: [],
    activeTab: 'list',
    filters: { search: '', category: '', status: '', purpose: '', supplier_id: 0 },
    page: 1, totalPages: 1,
    stats: {}, alerts: { low_stock: [], expiring: [], overdue_supplier: [] },
    qualityCostCenters: null, suppliersCache: null, prListCache: null,
    userRole: { isQuality: false, isAdmin: false, isCEO: false, canManage: false },
  };

  // ── ثوابت دورة الحياة ────────────────────────────────────────────
  var SW_CAT = {
    raw_fabric: { ar: 'أقمشة وخامات', icon: 'ti-geometry', suffix: 'F' },
    accessories: { ar: 'إكسسوارات وملحقات', icon: 'ti-needle-thread', suffix: 'A' },
    ready_product: { ar: 'منتجات جاهزة', icon: 'ti-shirt', suffix: 'R' },
    soldier_gear: { ar: 'تجهيزات الجندي', icon: 'ti-military-award', suffix: 'S' },
  };
  var SW_UNIT = {
    meter: { ar: 'متر' }, kg: { ar: 'كيلو' }, piece: { ar: 'قطعة' },
    dozen: { ar: 'دزينة' }, set: { ar: 'طقم' }, roll: { ar: 'رول' }, box: { ar: 'كرتون' },
  };
  var SW_PURPOSE = {
    internal_test: { ar: 'اختبار داخلي', icon: 'ti-microscope' },
    supplier_qualification: { ar: 'تأهيل مورد', icon: 'ti-truck' },
    production: { ar: 'إنتاج', icon: 'ti-building-factory' },
  };

  /**
   * حالات العينة الكاملة — مع الانتقالات المتاحة من كل حالة
   * يُستخدم لعرض الأزرار الخارجية وتصميم مسار التتبع
   */
  var SW_STATUS = {
    new: {
      ar: 'جديدة', icon: 'ti-package', cls: 'sw-badge-new',
      transitions: ['sent_to_supplier', 'testing', 'archived'],
      btnLabel: { sent_to_supplier: 'إرسال للمورد', testing: 'بدء الاختبار', archived: 'أرشفة' },
    },
    sent_to_supplier: {
      ar: 'عند المورد', icon: 'ti-truck', cls: 'sw-badge-supplier',
      transitions: ['returned_from_supplier', 'archived'],
      btnLabel: { returned_from_supplier: 'تسجيل إرجاع المورد', archived: 'أرشفة' },
    },
    returned_from_supplier: {
      ar: 'أُرجعت من المورد', icon: 'ti-package-import', cls: 'sw-badge-returned',
      transitions: ['testing', 'rejected', 'archived'],
      btnLabel: { testing: 'بدء الاختبار', rejected: 'رفض', archived: 'أرشفة' },
    },
    testing: {
      ar: 'قيد الاختبار', icon: 'ti-test-pipe', cls: 'sw-badge-testing',
      transitions: ['approved', 'approved_for_production', 'rejected', 'archived'],
      btnLabel: { approved: 'اعتماد', approved_for_production: 'اعتماد للإنتاج', rejected: 'رفض', archived: 'أرشفة' },
    },
    approved: {
      ar: 'معتمدة', icon: 'ti-circle-check', cls: 'sw-badge-approved',
      transitions: ['approved_for_production', 'archived'],
      btnLabel: { approved_for_production: 'نقل للإنتاج', archived: 'أرشفة' },
    },
    approved_for_production: {
      ar: 'معتمدة للإنتاج', icon: 'ti-building-factory', cls: 'sw-badge-production',
      transitions: ['archived'],
      btnLabel: { archived: 'أرشفة' },
    },
    rejected: {
      ar: 'مرفوضة', icon: 'ti-circle-x', cls: 'sw-badge-rejected',
      transitions: ['new', 'archived'],
      btnLabel: { new: 'إعادة كجديدة', archived: 'أرشفة' },
    },
    archived: { ar: 'مؤرشفة', icon: 'ti-archive', cls: 'sw-badge-archived', transitions: [], btnLabel: {} },
  };

  // مسار التتبع — 8 نقاط ثابتة
  var SW_TRACK = [
    { id: 'new', label: 'استلام', icon: 'ti-package' },
    { id: 'sent_to_supplier', label: 'عند المورد', icon: 'ti-truck' },
    { id: 'returned_from_supplier', label: 'إرجاع المورد', icon: 'ti-package-import' },
    { id: 'testing', label: 'الاختبار', icon: 'ti-test-pipe' },
    { id: 'approved', label: 'الاعتماد', icon: 'ti-circle-check' },
    { id: 'approved_for_production', label: 'الإنتاج', icon: 'ti-building-factory' },
    { id: 'rejected', label: 'رفض', icon: 'ti-circle-x' },
  ];

  var SW_MOVE = {
    in: { ar: 'إدخال / استلام', icon: 'ti-package', cls: 'sw-mv-in' },
    out_dept: { ar: 'صرف لقسم', icon: 'ti-arrow-up-right', cls: 'sw-mv-out' },
    return_dept: { ar: 'إرجاع من قسم', icon: 'ti-arrow-down-left', cls: 'sw-mv-in' },
    out_test: { ar: 'صرف للاختبار', icon: 'ti-test-pipe', cls: 'sw-mv-out' },
    out_use: { ar: 'صرف للاستخدام', icon: 'ti-arrow-up-right', cls: 'sw-mv-out' },
    send_supplier: { ar: 'إرسال للمورد', icon: 'ti-truck', cls: 'sw-mv-supplier' },
    return_supplier: { ar: 'إرجاع من المورد', icon: 'ti-package-import', cls: 'sw-mv-in' },
    send_production: { ar: 'إرسال للإنتاج', icon: 'ti-building-factory', cls: 'sw-mv-production' },
    reserve: { ar: 'حجز', icon: 'ti-lock', cls: 'sw-mv-res' },
    release: { ar: 'تحرير حجز', icon: 'ti-lock-open', cls: 'sw-mv-in' },
    adjust: { ar: 'تعديل يدوي', icon: 'ti-adjustments', cls: 'sw-mv-adj' },
  };

  // دوال مساعدة
  function swUnitLabel(u) { return SW_UNIT[u]?.ar || u || 'وحدة'; }
  function swFmtDate(d) { if (!d) return '—'; return new Date(d).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }); }
  function swTimeAgo(dt) { if (!dt) return '—'; const s = Math.floor((Date.now() - new Date(dt)) / 1000); if (s < 60) return 'الآن'; if (s < 3600) return `منذ ${Math.floor(s / 60)}د`; if (s < 86400) return `منذ ${Math.floor(s / 3600)}س`; return `منذ ${Math.floor(s / 86400)} يوم`; }

  // ═══════════════════════════════════════════════════════════════════
  //  نقطة الدخول
  // ═══════════════════════════════════════════════════════════════════
  async function loadSampleWarehousePage() {
    const mc = document.getElementById('main-content') || DOM.mainContent;
    mc.innerHTML = '<div class="sw-loading"><div class="spinner"></div></div>';
    await swLoadUserRole();
    await Promise.all([swLoadStats(), swLoadAlerts()]);
    swRenderPage();
    await swLoadList();
  }

  async function swLoadUserRole() {
    const d = await swGet('api/samples_api.php?action=check_permission');
    if (d.success) SWH.userRole = {
      isQuality: d.data.is_quality, isAdmin: d.data.is_admin,
      isCEO: d.data.is_ceo, canManage: d.data.can_manage,
    };
  }
  async function swLoadStats() { const d = await swGet('api/samples_api.php?action=stats'); if (d.success) SWH.stats = d.data; }
  async function swLoadAlerts() { const d = await swGet('api/samples_api.php?action=alerts'); if (d.success) SWH.alerts = d; }

  async function swLoadList() {
    const p = new URLSearchParams({
      action: 'list', search: SWH.filters.search,
      category: SWH.filters.category, status: SWH.filters.status,
      purpose: SWH.filters.purpose, supplier_id: SWH.filters.supplier_id,
      page: SWH.page
    });
    const d = await swGet('api/samples_api.php?' + p);
    if (d.success) { SWH.samples = d.data; SWH.totalPages = d.pages; swRenderTable(); }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  الصفحة الرئيسية
  // ═══════════════════════════════════════════════════════════════════
  function swRenderPage() {
    const mc = document.getElementById('main-content') || DOM.mainContent;
    const st = SWH.stats || {};
    const low = (SWH.alerts.low_stock || []).length;
    const exp = (SWH.alerts.expiring || []).length;
    const ovd = (SWH.alerts.overdue_supplier || []).length;
    const totalAlerts = low + exp + ovd;

    mc.innerHTML = `
<div class="sw-page" id="sw-root">

  <!-- الرأس -->
  <div class="sw-header">
    <div class="sw-header-info">
      <h2 class="sw-title"><i class="ti ti-test-pipe" aria-hidden="true"></i> تتبع العينات مع الموردين</h2>
      <span class="sw-count-badge">${st.total_samples || 0} عينة</span>
      ${SWH.userRole.canManage ? '<span class="sw-role-badge sw-rb-quality"><i class="ti ti-microscope" aria-hidden="true"></i> قطاع الجودة</span>' : ''}
    </div>
    <div class="sw-header-actions">
      <button class="btn btn-secondary btn-sm" onclick="swExport()"><i class="ti ti-file-export" aria-hidden="true"></i> تصدير</button>
      ${SWH.userRole.canManage ? `<button class="btn btn-primary" onclick="swOpenCreateModal()"><i class="ti ti-plus" aria-hidden="true"></i> استلام عينة جديدة</button>` : ''}
    </div>
  </div>

  <!-- تنبيه متأخرة عند المورد -->
  ${ovd > 0 ? `<div class="sw-alert-bar"><i class="ti ti-truck" aria-hidden="true"></i><strong>${ovd} عينة تأخرت عن موعد الإرجاع من المورد</strong> &nbsp;<button class="btn btn-secondary btn-sm" onclick="swSwitchTab('alerts')" style="font-size:.75rem">عرض</button></div>` : ''}

  <!-- KPI -->
  <div class="sw-kpi-grid">
    <div class="sw-kpi"><div class="sw-kpi-label">الكل</div><div class="sw-kpi-val c-blue">${st.total_samples || 0}</div><div class="sw-kpi-sub"><i class="ti ti-package" aria-hidden="true"></i> عينة نشطة</div></div>
    <div class="sw-kpi"><div class="sw-kpi-label">جديدة</div><div class="sw-kpi-val c-blue">${st.cnt_new || 0}</div><div class="sw-kpi-sub"><i class="ti ti-package" aria-hidden="true"></i></div></div>
    <div class="sw-kpi"><div class="sw-kpi-label">عند المورد</div><div class="sw-kpi-val c-amber">${st.cnt_at_supplier || 0}</div><div class="sw-kpi-sub"><i class="ti ti-truck" aria-hidden="true"></i></div></div>
    <div class="sw-kpi"><div class="sw-kpi-label">قيد الاختبار</div><div class="sw-kpi-val c-purple">${st.cnt_testing || 0}</div><div class="sw-kpi-sub"><i class="ti ti-test-pipe" aria-hidden="true"></i></div></div>
    <div class="sw-kpi"><div class="sw-kpi-label">معتمدة</div><div class="sw-kpi-val c-green">${(parseInt(st.cnt_approved || 0) + parseInt(st.cnt_production || 0))}</div><div class="sw-kpi-sub"><i class="ti ti-circle-check" aria-hidden="true"></i></div></div>
    <div class="sw-kpi ${totalAlerts > 0 ? 'warn' : ''}"><div class="sw-kpi-label">تنبيهات</div><div class="sw-kpi-val ${totalAlerts > 0 ? 'c-red' : 'c-green'}">${totalAlerts}</div><div class="sw-kpi-sub"><i class="ti ti-bell" aria-hidden="true"></i></div></div>
  </div>

  <!-- تبويبات -->
  <div class="sw-tabs-bar">
    ${[
        ['list', 'ti-layout-list', 'المخزون', st.total_samples || 0, false],
        ['supplier', 'ti-truck', 'الموردون', st.cnt_at_supplier || 0, ovd > 0],
        ['movements', 'ti-arrows-exchange', 'الحركات', 0, false],
        ['reservations', 'ti-lock', 'الحجوزات', 0, false],
        ['report', 'ti-chart-bar', 'التقارير', 0, false],
        ['alerts', 'ti-bell', 'التنبيهات', totalAlerts, totalAlerts > 0],
      ].map(([t, ic, lb, cnt, red]) => `<button class="sw-tab-btn ${SWH.activeTab === t ? 'active' : ''}" onclick="swSwitchTab('${t}')"><i class="ti ${ic}" aria-hidden="true"></i> ${lb}${cnt > 0 ? `<span class="sw-tab-pill ${red ? 'red' : ''}">${cnt}</span>` : ''}</button>`).join('')}
  </div>

  <!-- فلاتر — pr-select مطابق للنظام -->
  <div class="sw-filters">
    <div class="sw-search-wrap">
      <i class="ti ti-search" aria-hidden="true"></i>
      <input type="text" class="sw-search-input pr-search-input" id="sw-search"
        placeholder="بحث بالكود أو الاسم أو المورد أو PO..."
        value="${swEsc(SWH.filters.search)}" oninput="swDebounceSearch(this.value)">
    </div>
    <select class="pr-select" onchange="swFilterChange('category',this.value)">
      <option value="">كل الفئات</option>
      ${Object.entries(SW_CAT).map(([k, v]) => `<option value="${k}" ${SWH.filters.category === k ? 'selected' : ''}>${v.ar} (${v.suffix})</option>`).join('')}
    </select>
    <select class="pr-select" onchange="swFilterChange('status',this.value)">
      <option value="">كل الحالات</option>
      ${Object.entries(SW_STATUS).filter(([k]) => k !== 'archived').map(([k, v]) => `<option value="${k}" ${SWH.filters.status === k ? 'selected' : ''}>${v.ar}</option>`).join('')}
    </select>
    <select class="pr-select" onchange="swFilterChange('purpose',this.value)">
      <option value="">كل الأغراض</option>
      ${Object.entries(SW_PURPOSE).map(([k, v]) => `<option value="${k}" ${SWH.filters.purpose === k ? 'selected' : ''}>${v.ar}</option>`).join('')}
    </select>
  </div>

  <!-- تخطيط: جدول + لوحة جانبية -->
  <div style="display:grid;grid-template-columns:1fr 295px;gap:1rem;align-items:start" id="sw-layout">
    <div id="sw-table-wrap"><div class="sw-loading"><div class="spinner"></div></div></div>
    <div id="sw-side-panel">
      <div class="sw-table-wrap" style="padding:1.25rem">
        <div class="sw-side-empty"><i class="ti ti-hand-click" aria-hidden="true"></i><p>اختر عينة لعرض التفاصيل والإجراءات</p></div>
      </div>
    </div>
  </div>

</div>
<!-- المودال -->
<div id="sw-modal-overlay" class="sw-overlay" style="display:none" onclick="if(event.target===this)swCloseModal()">
  <div class="sw-modal" id="sw-modal-box" onclick="event.stopPropagation()"><div id="sw-modal-content"></div></div>
</div>`;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  الجدول
  // ═══════════════════════════════════════════════════════════════════
  function swRenderTable() {
    const wrap = document.getElementById('sw-table-wrap');
    if (!wrap) return;
    if (!SWH.samples.length) {
      wrap.innerHTML = '<div class="sw-table-wrap"><div class="sw-empty"><i class="ti ti-package-off" aria-hidden="true"></i><p>لا توجد عينات</p></div></div>';
      return;
    }
    const rows = SWH.samples.map(s => {
      const avail = parseFloat(s.qty_available || 0), total = parseFloat(s.qty_total || 0), res = parseFloat(s.qty_reserved || 0);
      const atSupp = parseFloat(s.qty_sent_supplier || 0);
      const pct = total > 0 ? Math.round(avail / total * 100) : 0;
      const fillCls = pct > 50 ? 'ok' : pct > 20 ? 'mid' : 'low';
      const catInfo = SW_CAT[s.category] || {};
      const stInfo = SW_STATUS[s.status] || { ar: s.status, cls: '' };
      const purposeInfo = SW_PURPOSE[s.purpose] || {};
      const isLow = (parseFloat(s.min_qty_alert || 0) > 0) && (avail <= parseFloat(s.min_qty_alert || 0));
      const isExp = s.expiry_date && new Date(s.expiry_date) <= new Date(Date.now() + 30 * 86400000);
      const isOverdue = s.expected_return_date && s.status === 'sent_to_supplier' && new Date(s.expected_return_date) < new Date();
      const sel = SWH.selected && SWH.selected.id === s.id;
      const ul = swUnitLabel(s.unit);

      // الأزرار الخارجية لتغيير الحالة (تظهر في الجدول مباشرة)
      const transitions = stInfo.transitions || [];
      const quickBtns = transitions.slice(0, 2).map(t => {
        const stT = SW_STATUS[t] || {};
        const lbl = stInfo.btnLabel?.[t] || stT.ar;
        // زر واحد مضغوط في الجدول — زر تفصيلي في اللوحة
        const btnCls = t === 'rejected' || t === 'archived' ? 'sw-tbl-btn' : 'sw-tbl-btn sw-tbl-btn-action';
        if (t === 'archived') return ''; // لا نعرض أرشفة في الجدول
        return `<button class="${btnCls}" data-sid="${s.id}" data-from="${s.status}" data-to="${t}"
                title="${lbl}" onclick="event.stopPropagation();swOpenChangeStatusModal(${s.id},'${s.status}','${t}',this)">
                <i class="ti ${stT.icon || 'ti-circle'}" aria-hidden="true"></i>
            </button>`;
      }).join('');

      return `<tr class="${sel ? 'sw-selected' : ''} ${isLow || isOverdue ? 'sw-row-warn' : ''}"
            onclick="swSelectSample(${s.id})" data-id="${s.id}">
          <td><span class="sw-code">${swEsc(s.sample_code)}</span></td>
          <td style="max-width:160px">
            <div class="sw-sname">${swEsc(s.name)}</div>
            <div class="sw-ssub">
              <i class="ti ${catInfo.icon || 'ti-box'}" aria-hidden="true"></i> ${catInfo.ar || s.category}
              ${s.variant_count > 0 ? `<span class="sw-vbadge">+${s.variant_count}</span>` : ''}
              ${s.po_code ? `<span class="sw-vbadge" style="background:rgba(63,89,80,.08)">PO</span>` : ''}
            </div>
          </td>
          <td class="sw-td-muted" style="max-width:85px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${swEsc(s.supplier_name || '—')}</td>
          <td>
            <div class="sw-qty-wrap">
              <div class="sw-qty-bar"><div class="sw-qty-fill ${fillCls}" style="width:${pct}%"></div></div>
              <span class="sw-qty-num ${isLow ? 'warn' : ''}">${avail.toFixed(1)}<span style="font-size:.7rem;font-weight:400;color:var(--text-muted)"> ${ul}</span></span>
              ${isLow ? '<i class="ti ti-alert-triangle" style="color:var(--accent-red,#F26F63);font-size:.72rem" aria-hidden="true"></i>' : ''}
              ${atSupp > 0 ? `<span style="font-size:.7rem;color:var(--accent-amber,#e67700);background:rgba(245,158,11,.1);padding:.05rem .3rem;border-radius:4px;white-space:nowrap">${atSupp.toFixed(1)} عند المورد</span>` : ''}
            </div>
          </td>
          <td class="sw-td-muted" style="white-space:nowrap;${isExp ? 'color:var(--accent-red,#F26F63)!important;font-weight:600' : ''}">${s.expiry_date ? swFmtDate(s.expiry_date) : '—'}</td>
          <td>
            <span class="sw-badge ${stInfo.cls}">
              <i class="ti ${stInfo.icon || 'ti-circle'}" style="font-size:.7rem" aria-hidden="true"></i>
              ${stInfo.ar || s.status}
            </span>
            ${isOverdue ? '<br><span style="font-size:.7rem;color:var(--accent-red,#F26F63);font-weight:600">تأخر!</span>' : ''}
          </td>
          <td>
            <div style="display:flex;gap:.25rem;align-items:center">
              ${SWH.userRole.canManage ? quickBtns : ''}
              <button class="sw-tbl-btn" title="تعديل" onclick="event.stopPropagation();swOpenEditModal(${s.id})">
                <i class="ti ti-edit" aria-hidden="true"></i>
              </button>
            </div>
          </td>
        </tr>`;
    }).join('');

    wrap.innerHTML = `<div class="sw-table-wrap">
      <table class="pr-table sw-table">
        <thead><tr>
          <th style="width:105px">الكود</th>
          <th>العينة</th>
          <th style="width:80px">المورد</th>
          <th style="width:155px">الكمية المتاحة</th>
          <th style="width:90px">الصلاحية</th>
          <th style="width:110px">الحالة</th>
          <th style="width:90px">إجراءات</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="sw-table-footer">
        <span>${SWH.samples.length} عينة</span>
        <div class="sw-page-btns">
          <button class="btn btn-secondary btn-sm" onclick="swPrevPage()" ${SWH.page <= 1 ? 'disabled' : ''}><i class="ti ti-chevron-right" aria-hidden="true"></i></button>
          <span style="padding:0 .4rem;font-size:.78rem">صفحة ${SWH.page} / ${SWH.totalPages}</span>
          <button class="btn btn-secondary btn-sm" onclick="swNextPage()" ${SWH.page >= SWH.totalPages ? 'disabled' : ''}><i class="ti ti-chevron-left" aria-hidden="true"></i></button>
        </div>
      </div>
    </div>`;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  تغيير الحالة — زر خارجي يختفي بعد التغيير + نافذة تأكيد
  // ═══════════════════════════════════════════════════════════════════
  /**
   * يُستدعى من زر في الجدول أو اللوحة الجانبية
   * - triggerBtn: العنصر الذي ضُغط عليه (سيُخفى بعد النجاح)
   */
  function swOpenChangeStatusModal(sampleId, fromStatus, toStatus, triggerBtn) {
    const stFrom = SW_STATUS[fromStatus] || { ar: fromStatus };
    const stTo = SW_STATUS[toStatus] || { ar: toStatus };

    // ألوان حسب نوع الانتقال
    const isDangerous = ['rejected', 'archived'].includes(toStatus);
    const isPositive = ['approved', 'approved_for_production'].includes(toStatus);
    const accentCls = isDangerous ? 'danger' : isPositive ? 'success' : '';

    swOpenModal(`
    <div class="sw-modal-hdr">
      <div class="sw-modal-hdr-info">
        <div class="sw-modal-name" style="font-size:.95rem">
          <i class="ti ti-git-branch" aria-hidden="true"></i> تأكيد تغيير الحالة
        </div>
      </div>
      <button class="sw-modal-close" onclick="swCloseModal()"><i class="ti ti-x" aria-hidden="true"></i></button>
    </div>
    <div class="sw-modal-body" style="padding:1.25rem">

      <!-- مسار التغيير المرئي -->
      <div style="display:flex;align-items:center;gap:.75rem;padding:.85rem 1rem;background:var(--bg-secondary);border-radius:var(--radius-sm);margin-bottom:1rem">
        <div style="text-align:center">
          <span class="sw-badge ${stFrom.cls || 'sw-badge-new'}" style="font-size:.8rem;padding:.3rem .8rem">
            <i class="ti ${stFrom.icon || 'ti-circle'}" aria-hidden="true"></i> ${stFrom.ar}
          </span>
        </div>
        <div style="flex:1;display:flex;align-items:center;gap:4px">
          <div style="flex:1;height:2px;background:var(--border-color);border-radius:99px"></div>
          <i class="ti ti-arrow-left" style="color:var(--text-muted);font-size:.85rem" aria-hidden="true"></i>
        </div>
        <div style="text-align:center">
          <span class="sw-badge ${stTo.cls || 'sw-badge-new'}" style="font-size:.8rem;padding:.3rem .8rem">
            <i class="ti ${stTo.icon || 'ti-circle'}" aria-hidden="true"></i> ${stTo.ar}
          </span>
        </div>
      </div>

      <!-- ملاحظة إلزامية -->
      <div class="form-group">
        <label class="form-label">ملاحظة / سبب القرار <span style="color:var(--accent-red)">*</span></label>
        <textarea id="sw-cst-note" class="form-textarea" rows="3"
          placeholder="${toStatus === 'rejected' ? 'سبب الرفض...' : toStatus === 'approved_for_production' ? 'ملاحظة اعتماد الإنتاج...' : toStatus === 'testing' ? 'بدأ الاختبار — تفاصيل...' : 'ملاحظة تغيير الحالة...'}"
          autofocus></textarea>
        <div style="font-size:.74rem;color:var(--text-muted);margin-top:.3rem"><i class="ti ti-info-circle" aria-hidden="true"></i> مطلوب — تُسجَّل في الخط الزمني للعينة</div>
      </div>

      ${isDangerous ? `<div style="display:flex;align-items:flex-start;gap:.5rem;padding:.7rem .85rem;background:rgba(242,111,99,.06);border:1px solid rgba(242,111,99,.2);border-radius:var(--radius-sm);font-size:.8rem;color:var(--accent-red)">
        <i class="ti ti-alert-triangle" style="flex-shrink:0;font-size:1rem;margin-top:.05rem" aria-hidden="true"></i>
        <span>${toStatus === 'archived' ? 'ستُنقل العينة للأرشيف ولن تظهر في القوائم.' : 'سيُسجَّل قرار الرفض ولا يمكن التراجع عنه إلا بإعادة التغيير.'}</span>
      </div>`: ''}

    </div>
    <div class="sw-modal-footer">
      <button class="btn btn-secondary" onclick="swCloseModal()">إلغاء</button>
      <button class="btn btn-${isDangerous ? 'danger' : 'primary'}" id="sw-cst-confirm"
        onclick="swConfirmChangeStatus(${sampleId},'${fromStatus}','${toStatus}',this)">
        <i class="ti ${stTo.icon || 'ti-check'}" aria-hidden="true"></i>
        تأكيد: ${stTo.ar}
      </button>
    </div>`,
      'sm');

    // حفظ مرجع الزر المُشغِّل لإخفائه بعد النجاح
    document.getElementById('sw-cst-confirm')._triggerBtn = triggerBtn;
    // التركيز على الحقل
    setTimeout(() => document.getElementById('sw-cst-note')?.focus(), 150);
  }

  async function swConfirmChangeStatus(sampleId, fromStatus, toStatus, confirmBtn) {
    const note = document.getElementById('sw-cst-note')?.value?.trim();
    if (!note) {
      document.getElementById('sw-cst-note')?.classList.add('is-invalid');
      showToast('الملاحظة مطلوبة', 'error');
      return;
    }

    // تعطيل الزر لمنع الضغط المزدوج
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<i class="ti ti-loader" style="animation:spin 1s linear infinite" aria-hidden="true"></i> جاري التغيير...';

    const d = await swPost('api/samples_api.php?action=change_status', {
      id: sampleId, new_status: toStatus, notes: note
    });

    if (d.success) {
      showToast(`تم تغيير الحالة إلى: ${SW_STATUS[toStatus]?.ar || toStatus}`, 'success');
      swCloseModal();

      // إخفاء الزر المُشغِّل من الجدول / اللوحة
      const triggerBtn = confirmBtn._triggerBtn;
      if (triggerBtn) {
        triggerBtn.style.transform = 'scale(0)';
        triggerBtn.style.opacity = '0';
        triggerBtn.style.transition = 'all .25s ease';
        setTimeout(() => triggerBtn.remove(), 300);
      }

      // تحديث البيانات
      await Promise.all([swLoadList(), swLoadStats()]);
      if (SWH.selected?.id === sampleId) await swLoadSampleDetail(sampleId);
      swRenderPage();
    } else {
      showToast(d.message || 'حدث خطأ', 'error');
      confirmBtn.disabled = false;
      confirmBtn.innerHTML = `<i class="ti ${SW_STATUS[toStatus]?.icon || 'ti-check'}" aria-hidden="true"></i> تأكيد: ${SW_STATUS[toStatus]?.ar || toStatus}`;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  اللوحة الجانبية
  // ═══════════════════════════════════════════════════════════════════
  async function swLoadSampleDetail(id) {
    try {
      const r = await fetch(`api/samples_api.php?action=get&id=${id}`, { credentials: 'same-origin' });
      const d = await r.json();
      if (!d.success) return;
      SWH.selected = d.data; SWH.variants = d.variants || [];
      SWH.inventory = d.inventory || {}; SWH.supplierTrips = d.supplier_trips || [];
      swRenderDetailPanel();
      const [mv, sl] = await Promise.all([
        swGet(`api/samples_api.php?action=movements_list&sample_id=${id}&limit=15`),
        swGet(`api/samples_api.php?action=stage_log&sample_id=${id}`)
      ]);
      if (mv.success) SWH.movements = mv.data;
      if (sl.success) SWH.stageLog = sl.data;
      // تحديث قسم الحركات في اللوحة
      const mvEl = document.getElementById('sw-movements-mini');
      if (mvEl) swRenderMini(mvEl);
    } catch (e) { console.error('swLoadSampleDetail:', e); }
  }

  async function swSelectSample(id) {
    document.querySelectorAll('#sw-table-wrap tbody tr').forEach(r => r.classList.toggle('sw-selected', parseInt(r.dataset.id) === id));
    await swLoadSampleDetail(id);
  }

  function swRenderDetailPanel() {
    const panel = document.getElementById('sw-side-panel');
    if (!panel || !SWH.selected) return;
    const s = SWH.selected;
    const inv = SWH.inventory || {};
    const avail = parseFloat(inv.qty_available || 0), res = parseFloat(inv.qty_reserved || 0);
    const cons = parseFloat(inv.qty_consumed || 0), total = parseFloat(inv.qty_received || 0);
    const atSupp = parseFloat(inv.qty_sent_supplier || 0);
    const ul = swUnitLabel(s.unit);
    const catInfo = SW_CAT[s.category] || {};
    const stInfo = SW_STATUS[s.status] || {};
    const transitions = stInfo.transitions || [];

    // أزرار تغيير الحالة في اللوحة الجانبية (كاملة الاسم)
    const statusBtns = SWH.userRole.canManage && transitions.length
      ? transitions.filter(t => t !== 'archived').map(t => {
        const stT = SW_STATUS[t] || {};
        const lbl = stInfo.btnLabel?.[t] || stT.ar;
        const isDangerous = ['rejected'].includes(t);
        return `<button class="sw-action-btn ${isDangerous ? 'sw-a-danger' : ''}"
                data-sid="${s.id}" data-from="${s.status}" data-to="${t}"
                onclick="swOpenChangeStatusModal(${s.id},'${s.status}','${t}',this)">
                <i class="ti ${stT.icon || 'ti-circle'} ${isDangerous ? 'sw-ai-adj' : 'sw-ai-in'}" aria-hidden="true"></i> ${lbl}
            </button>`;
      }).join('')
      : '';

    // حساب النسب للشريط
    const pA = total > 0 ? Math.round(avail / total * 100) : 0;
    const pR = total > 0 ? Math.round(res / total * 100) : 0;
    const pC = total > 0 ? Math.round(cons / total * 100) : 0;

    panel.innerHTML = `<div class="sw-table-wrap" style="padding:0">
    <div class="sw-side-sec">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <div class="sw-code" style="margin-bottom:.2rem">${swEsc(s.sample_code)}</div>
          <div style="font-size:.9rem;font-weight:700;color:var(--text-primary)">${swEsc(s.name)}</div>
          <div style="font-size:.74rem;color:var(--text-muted);margin-top:.2rem;display:flex;align-items:center;gap:.35rem">
            <i class="ti ${catInfo.icon || 'ti-box'}" aria-hidden="true"></i> ${catInfo.ar || s.category}
            &nbsp;<span class="sw-badge ${stInfo.cls}" style="font-size:.68rem"><i class="ti ${stInfo.icon || 'ti-circle'}" style="font-size:.68rem" aria-hidden="true"></i> ${stInfo.ar || s.status}</span>
            ${s.purpose ? `<span class="sw-badge sw-badge-new" style="font-size:.66rem">${SW_PURPOSE[s.purpose]?.ar || s.purpose}</span>` : ''}
          </div>
        </div>
        <button class="sw-tbl-btn" onclick="swOpenEditModal(${s.id})"><i class="ti ti-edit" aria-hidden="true"></i></button>
      </div>
    </div>
    <!-- كميات -->
    <div class="sw-side-sec">
      <div style="font-size:1.8rem;font-weight:700;color:var(--text-primary);line-height:1">${avail.toFixed(1)}</div>
      <div style="font-size:.73rem;color:var(--text-muted);margin-bottom:.6rem">${ul} متاح من ${total.toFixed(1)} مستلم</div>
      <div style="display:grid;grid-template-columns:repeat(${atSupp > 0 ? 4 : 3},1fr);gap:.35rem;text-align:center;margin-bottom:.55rem">
        <div style="background:var(--bg-secondary);border-radius:6px;padding:.4rem .2rem"><div style="font-size:.92rem;font-weight:700;color:var(--accent-green)">${avail.toFixed(1)}</div><div style="font-size:.65rem;color:var(--text-muted)">متاح</div></div>
        <div style="background:var(--bg-secondary);border-radius:6px;padding:.4rem .2rem"><div style="font-size:.92rem;font-weight:700;color:#5b5ff0">${res.toFixed(1)}</div><div style="font-size:.65rem;color:var(--text-muted)">محجوز</div></div>
        <div style="background:var(--bg-secondary);border-radius:6px;padding:.4rem .2rem"><div style="font-size:.92rem;font-weight:700;color:var(--accent-amber)">${cons.toFixed(1)}</div><div style="font-size:.65rem;color:var(--text-muted)">مستهلك</div></div>
        ${atSupp > 0 ? `<div style="background:rgba(245,158,11,.08);border-radius:6px;padding:.4rem .2rem"><div style="font-size:.92rem;font-weight:700;color:var(--accent-amber)">${atSupp.toFixed(1)}</div><div style="font-size:.65rem;color:var(--text-muted)">عند المورد</div></div>` : ''}
      </div>
      <div class="sw-combo-bar">
        <div class="sw-combo-fill" style="width:${pA}%;background:var(--accent-green)"></div>
        <div class="sw-combo-fill" style="width:${pR}%;background:#5b5ff0"></div>
        <div class="sw-combo-fill" style="width:${pC}%;background:var(--accent-amber)"></div>
      </div>
    </div>
    <!-- تفاصيل -->
    <div class="sw-side-sec">
      <div class="sw-side-sec-hdr"><i class="ti ti-info-circle" aria-hidden="true"></i> التفاصيل</div>
      <div class="sw-info-row"><span class="sw-info-lbl">المورد</span><span class="sw-info-val">${swEsc(s.supplier_name || '—')}</span></div>
      <div class="sw-info-row"><span class="sw-info-lbl">كود الربط</span><span class="sw-info-val" style="font-family:monospace;color:var(--primary)">${swEsc(s.supplier_code || '—')}</span></div>
      ${s.po_code ? `<div class="sw-info-row"><span class="sw-info-lbl">PO</span><span class="sw-info-val" style="font-family:monospace">${swEsc(s.po_code)}</span></div>` : ''}
      <div class="sw-info-row"><span class="sw-info-lbl">الموقع</span><span class="sw-info-val">${swEsc(s.location || '—')}</span></div>
      <div class="sw-info-row"><span class="sw-info-lbl">الاستلام</span><span class="sw-info-val">${swFmtDate(s.received_date)}</span></div>
      <div class="sw-info-row"><span class="sw-info-lbl">الصلاحية</span><span class="sw-info-val" ${s.expiry_date && new Date(s.expiry_date) < new Date(Date.now() + 30 * 86400000) ? 'style="color:var(--accent-red)"' : ''}>${swFmtDate(s.expiry_date)}</span></div>
      ${s.expected_return_date ? `<div class="sw-info-row"><span class="sw-info-lbl">إرجاع متوقع</span><span class="sw-info-val" style="${new Date(s.expected_return_date) < new Date() ? 'color:var(--accent-red);font-weight:700' : ''}">${swFmtDate(s.expected_return_date)}</span></div>` : ''}
    </div>
    <!-- رحلات المورد إن وجدت -->
    ${SWH.supplierTrips.length ? `<div class="sw-side-sec">
      <div class="sw-side-sec-hdr"><i class="ti ti-truck" aria-hidden="true"></i> رحلات المورد</div>
      ${SWH.supplierTrips.map(t => {
      const isPending = t.status === 'pending';
      const isOverdue = t.expected_return_date && new Date(t.expected_return_date) < new Date() && isPending;
      return `<div class="sw-mv-item">
          <div class="sw-mv-dot ${isPending ? 'sw-mv-out' : 'sw-mv-in'}"><i class="ti ti-truck" aria-hidden="true"></i></div>
          <div style="flex:1;min-width:0">
            <div class="sw-mv-title">${swEsc(t.supplier_name || 'مورد')}</div>
            <div class="sw-mv-meta">${t.qty_sent} أُرسلت — ${t.qty_returned} أُرجعت</div>
            <div class="sw-mv-meta ${isOverdue ? 'style="color:var(--accent-red)"' : ''}">${isOverdue ? '<i class="ti ti-alarm" aria-hidden="true"></i> ' : ''}إرجاع: ${swFmtDate(t.expected_return_date) || '—'}</div>
          </div>
          ${isPending && SWH.userRole.canManage ? `<button class="sw-tbl-btn" title="تسجيل إرجاع" onclick="swOpenSupplierReturnModal(${t.id},${t.sample_id})"><i class="ti ti-package-import" aria-hidden="true"></i></button>` : ''}
        </div>`;
    }).join('')}
    </div>`: ''}
    <!-- آخر الحركات -->
    <div class="sw-side-sec">
      <div class="sw-side-sec-hdr"><i class="ti ti-arrows-exchange" aria-hidden="true"></i> آخر الحركات</div>
      <div id="sw-movements-mini"><div style="font-size:.78rem;color:var(--text-muted)">جاري التحميل...</div></div>
    </div>
    <!-- أزرار تغيير الحالة -->
    ${statusBtns ? `<div class="sw-side-sec">
      <div class="sw-side-sec-hdr"><i class="ti ti-git-branch" aria-hidden="true"></i> تغيير الحالة</div>
      ${statusBtns}
      <button class="sw-action-btn" style="margin-top:.3rem" onclick="swOpenMovementModal(${s.id})">
        <i class="ti ti-arrows-exchange sw-ai-in" aria-hidden="true"></i> تسجيل حركة مخزون
      </button>
      ${s.status === 'new' || s.status === 'returned_from_supplier' ? `<button class="sw-action-btn" onclick="swOpenSendToSupplierModal(${s.id})">
        <i class="ti ti-truck sw-ai-out" aria-hidden="true"></i> إرسال للمورد
      </button>`: ''}
    </div>`: `<div class="sw-side-sec">
      <button class="sw-action-btn" onclick="swOpenMovementModal(${s.id})">
        <i class="ti ti-arrows-exchange sw-ai-in" aria-hidden="true"></i> تسجيل حركة مخزون
      </button>
    </div>`}
    </div>`;
  }

  function swRenderMini(el) {
    if (!SWH.movements.length) { el.innerHTML = '<div style="font-size:.78rem;color:var(--text-muted)">لا توجد حركات بعد</div>'; return; }
    el.innerHTML = SWH.movements.slice(0, 5).map(m => {
      const mt = SW_MOVE[m.movement_type] || {};
      const qty = parseFloat(m.qty);
      const isIn = ['in', 'return_dept', 'return_supplier', 'release'].includes(m.movement_type);
      return `<div class="sw-mv-item">
          <div class="sw-mv-dot ${mt.cls || 'sw-mv-adj'}"><i class="ti ${mt.icon || 'ti-circle'}" aria-hidden="true"></i></div>
          <div style="flex:1;min-width:0">
            <div class="sw-mv-title">${mt.ar || m.movement_type}</div>
            <div class="sw-mv-meta">${swEsc(m.employee_name || '—')} · ${swTimeAgo(m.performed_at)}</div>
            ${m.ref_pr_code ? `<div class="sw-mv-meta" style="font-family:monospace;color:var(--primary)">${swEsc(m.ref_pr_code)}</div>` : ''}
          </div>
          <div class="sw-mv-qty ${isIn ? 'p' : 'n'}">${isIn ? '+' : '−'}${qty.toFixed(1)}</div>
        </div>`;
    }).join('') + `<button class="btn btn-secondary btn-sm" style="width:100%;justify-content:center;margin-top:.45rem;font-size:.75rem" onclick="swSwitchTab('movements')"><i class="ti ti-history" aria-hidden="true"></i> كل الحركات</button>`;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  مودال إرسال للمورد — يستخدم searchableSelect
  // ═══════════════════════════════════════════════════════════════════
  async function swOpenSendToSupplierModal(sampleId) {
    if (!SWH.selected || SWH.selected.id !== sampleId) await swLoadSampleDetail(sampleId);
    const s = SWH.selected; const inv = SWH.inventory || {};
    const avail = parseFloat(inv.qty_available || 0); const ul = swUnitLabel(s?.unit || 'piece');

    // تحميل قائمة الموردين للـ searchableSelect
    if (!SWH.suppliersCache) {
      const d = await swGet('api/samples_api.php?action=suppliers_list');
      SWH.suppliersCache = d.success ? (d.data || []) : [];
    }

    const suppSelectHtml = typeof searchableSelect === 'function'
      ? searchableSelect({
        id: 'sw-sup-id',
        placeholder: 'ابحث عن المورد...',
        value: String(s.supplier_id || ''),
        options: [{ value: '', label: '— اختر المورد —' },
        ...SWH.suppliersCache.map(sup => ({ value: String(sup.id), label: `${swEsc(sup.name)}${sup.cr_number ? ' (' + sup.cr_number + ')' : ''}` }))
        ]
      })
      : `<select id="sw-sup-id" class="form-select"><option value="">— اختر —</option>${SWH.suppliersCache.map(s => `<option value="${s.id}">${swEsc(s.name)}</option>`).join('')}</select>`;

    swOpenModal(`
    <div class="sw-modal-hdr">
      <div class="sw-modal-hdr-info">
        <div class="sw-modal-code">${swEsc(s?.sample_code || '')}</div>
        <div class="sw-modal-name"><i class="ti ti-truck" aria-hidden="true"></i> إرسال للمورد — تأهيل مورد</div>
      </div>
      <button class="sw-modal-close" onclick="swCloseModal()"><i class="ti ti-x" aria-hidden="true"></i></button>
    </div>
    <div class="sw-modal-body" style="padding:1rem 1.25rem">
      <div class="sw-mv-sample-bar">
        <span class="sw-code">${swEsc(s?.sample_code || '')}</span> ${swEsc(s?.name || '')}
        &nbsp;·&nbsp; متاح: <strong>${avail.toFixed(1)} ${ul}</strong>
      </div>
      <div class="form-group">
        <label class="form-label">المورد <span style="color:var(--accent-red)">*</span></label>
        ${suppSelectHtml}
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">الكمية المُرسَلة (${ul}) <span style="color:var(--accent-red)">*</span></label>
          <input type="number" id="sw-sup-qty" class="form-input" min="0.1" step="0.1" value="1" max="${avail}">
        </div>
        <div class="form-group">
          <label class="form-label">تاريخ الإرسال</label>
          <input type="date" id="sw-sup-send-date" class="form-input" value="${new Date().toISOString().slice(0, 10)}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">تاريخ الإرجاع المتوقع</label>
          <input type="date" id="sw-sup-ret-date" class="form-input">
        </div>
        <div class="form-group">
          <label class="form-label">الغرض</label>
          <select id="sw-sup-purpose" class="form-select">
            <option value="تأهيل مورد" selected>تأهيل مورد</option>
            <option value="عينة اعتماد">عينة اعتماد</option>
            <option value="عينة مضاهاة">عينة مضاهاة</option>
            <option value="اختبار مورد جديد">اختبار مورد جديد</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">ملاحظات</label>
        <textarea id="sw-sup-notes" class="form-textarea" rows="2" placeholder="شروط التسليم / التغليف / متطلبات خاصة..."></textarea>
      </div>
    </div>
    <div class="sw-modal-footer">
      <button class="btn btn-secondary" onclick="swCloseModal()">إلغاء</button>
      <button class="btn btn-primary" onclick="swSubmitSendToSupplier(${sampleId})"><i class="ti ti-truck" aria-hidden="true"></i> إرسال للمورد</button>
    </div>`, 'md');
    if (typeof initSearchableSelects === 'function') initSearchableSelects();
    if (typeof toggleSS === 'undefined' && typeof initSearchableSelects === 'function') initSearchableSelects();
  }

  async function swSubmitSendToSupplier(sampleId) {
    const suppEl = document.getElementById('sw-sup-id');
    const suppId = parseInt(suppEl?.value || 0) || null;
    const qty = parseFloat(document.getElementById('sw-sup-qty')?.value || 0);
    const sendDate = document.getElementById('sw-sup-send-date')?.value || new Date().toISOString().slice(0, 10);
    const retDate = document.getElementById('sw-sup-ret-date')?.value || '';
    const purpose = document.getElementById('sw-sup-purpose')?.value || 'تأهيل مورد';
    const notes = document.getElementById('sw-sup-notes')?.value?.trim() || '';
    if (!suppId) { showToast('يجب اختيار المورد', 'error'); return; }
    if (qty <= 0) { showToast('أدخل الكمية', 'error'); return; }
    const d = await swPost('api/samples_api.php?action=send_to_supplier', { sample_id: sampleId, supplier_id: suppId, qty, sent_date: sendDate, expected_return_date: retDate || null, purpose, notes });
    if (d.success) { showToast('تم إرسال العينة للمورد', 'success'); swCloseModal(); await swLoadSampleDetail(sampleId); swLoadStats().then(() => swRenderPage()); }
    else showToast(d.message || 'حدث خطأ', 'error');
  }

  // ═══════════════════════════════════════════════════════════════════
  //  مودال إرجاع من المورد
  // ═══════════════════════════════════════════════════════════════════
  async function swOpenSupplierReturnModal(tripId, sampleId) {
    swOpenModal(`
    <div class="sw-modal-hdr">
      <div class="sw-modal-hdr-info"><div class="sw-modal-name"><i class="ti ti-package-import" aria-hidden="true"></i> تسجيل إرجاع من المورد</div></div>
      <button class="sw-modal-close" onclick="swCloseModal()"><i class="ti ti-x" aria-hidden="true"></i></button>
    </div>
    <div class="sw-modal-body" style="padding:1rem 1.25rem">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">الكمية المُرجَعة</label>
          <input type="number" id="sw-ret-qty" class="form-input" min="0" step="0.1" value="0">
          <div style="font-size:.74rem;color:var(--text-muted);margin-top:.25rem">0 = لم تُرجَع العينة</div>
        </div>
        <div class="form-group">
          <label class="form-label">تاريخ الإرجاع</label>
          <input type="date" id="sw-ret-date" class="form-input" value="${new Date().toISOString().slice(0, 10)}">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">ملاحظة الإرجاع</label>
        <textarea id="sw-ret-notes" class="form-textarea" rows="2" placeholder="حالة العينة عند الإرجاع..."></textarea>
      </div>
      <div class="form-group">
        <label style="display:flex;align-items:center;gap:.5rem;cursor:pointer;font-size:.85rem;color:var(--text-secondary)">
          <input type="checkbox" id="sw-ret-full" style="width:16px;height:16px">
          إغلاق الرحلة (العينة أُرجعت أو لن تُرجَع نهائياً)
        </label>
      </div>
    </div>
    <div class="sw-modal-footer">
      <button class="btn btn-secondary" onclick="swCloseModal()">إلغاء</button>
      <button class="btn btn-primary" onclick="swSubmitSupplierReturn(${tripId},${sampleId})"><i class="ti ti-check" aria-hidden="true"></i> تأكيد الإرجاع</button>
    </div>`, 'sm');
  }

  async function swSubmitSupplierReturn(tripId, sampleId) {
    const qty = parseFloat(document.getElementById('sw-ret-qty')?.value || 0);
    const retDate = document.getElementById('sw-ret-date')?.value || new Date().toISOString().slice(0, 10);
    const notes = document.getElementById('sw-ret-notes')?.value?.trim() || '';
    const isFull = document.getElementById('sw-ret-full')?.checked || false;
    const d = await swPost('api/samples_api.php?action=supplier_return', { trip_id: tripId, qty_returned: qty, return_date: retDate, notes, is_full_return: isFull });
    if (d.success) { showToast('تم تسجيل إرجاع المورد', 'success'); swCloseModal(); await swLoadSampleDetail(sampleId); swLoadStats().then(() => swRenderPage()); }
    else showToast(d.message || 'حدث خطأ', 'error');
  }

  // ═══════════════════════════════════════════════════════════════════
  //  مودال حركة المخزون — يستخدم searchableSelect لطلبات الشراء
  // ═══════════════════════════════════════════════════════════════════
  async function swOpenMovementModal(sampleId, defaultType) {
    if (!SWH.selected || SWH.selected.id !== sampleId) await swLoadSampleDetail(sampleId);
    const s = SWH.selected; const inv = SWH.inventory || {};
    const avail = parseFloat(inv.qty_available || 0); const ul = swUnitLabel(s?.unit || 'piece');
    const defType = defaultType || 'in';

    if (!SWH.qualityCostCenters) {
      const cc = await swGet('api/samples_api.php?action=cost_centers_quality');
      SWH.qualityCostCenters = cc.success ? (cc.data || []) : [];
    }
    if (!SWH.prListCache) {
      const pr = await swGet('api/samples_api.php?action=get_pr_list&limit=50');
      SWH.prListCache = pr.success ? (pr.data || []) : [];
    }

    const typeButtons = Object.entries(SW_MOVE).filter(([k]) => !['send_supplier', 'return_supplier'].includes(k)).map(([k, v]) => `<div class="sw-mv-type ${k === defType ? 'selected' : ''}" onclick="swSelMvType('${k}',this)"><i class="ti ${v.icon}" aria-hidden="true"></i><span style="font-size:.7rem">${v.ar}</span></div>`).join('');

    // searchableSelect لطلبات الشراء
    const prOptions = [{ value: '', label: '— بدون ربط بطلبية —' },
    ...SWH.prListCache.map(pr => ({ value: pr.pr_number || String(pr.id), label: `${swEsc(pr.pr_number || '#' + pr.id)} — ${swEsc((pr.title || '').slice(0, 30))} | ${swEsc(pr.supplier_name || '')}` }))];
    const prSelectHtml = typeof searchableSelect === 'function'
      ? searchableSelect({ id: 'sw-mv-pr-code', placeholder: 'ابحث برقم الطلب أو المورد...', options: prOptions })
      : `<input type="text" id="sw-mv-pr-code" class="form-input" placeholder="PR-089">`;

    // searchableSelect لمراكز التكلفة
    const ccOptions = [{ value: '', label: '— اختر مركز التكلفة —' },
    ...SWH.qualityCostCenters.map(cc => ({ value: String(cc.id), label: `${swEsc(cc.code)} — ${swEsc(cc.name)}` }))];
    const ccSelectHtml = typeof searchableSelect === 'function'
      ? searchableSelect({ id: 'sw-mv-cc-id', placeholder: 'ابحث عن مركز التكلفة...', options: ccOptions })
      : `<select id="sw-mv-cc-id" class="form-select"><option value="">— اختر —</option>${SWH.qualityCostCenters.map(cc => `<option value="${cc.id}">${swEsc(cc.code)} — ${swEsc(cc.name)}</option>`).join('')}</select>`;

    swOpenModal(`
    <div class="sw-modal-hdr">
      <div class="sw-modal-hdr-info">
        <div class="sw-modal-code">${swEsc(s?.sample_code || '')}</div>
        <div class="sw-modal-name" style="font-size:.95rem"><i class="ti ti-arrows-exchange" aria-hidden="true"></i> تسجيل حركة مخزون</div>
      </div>
      <button class="sw-modal-close" onclick="swCloseModal()"><i class="ti ti-x" aria-hidden="true"></i></button>
    </div>
    <div class="sw-modal-body" style="padding:1rem 1.25rem">
      <div class="sw-mv-sample-bar">
        <span class="sw-code">${swEsc(s?.sample_code || '')}</span> ${swEsc(s?.name || '')}
        &nbsp;·&nbsp; متاح: <strong>${avail.toFixed(1)} ${ul}</strong>
      </div>
      <div class="form-group">
        <label class="form-label">نوع الحركة</label>
        <div class="sw-mv-type-grid">${typeButtons}</div>
        <input type="hidden" id="sw-move-type-val" value="${defType}">
      </div>
      <!-- ربط بطلب شراء — searchableSelect -->
      <div class="form-group">
        <label class="form-label">ربط بطلب شراء (اختياري)</label>
        ${prSelectHtml}
      </div>
      <!-- مركز التكلفة — يظهر عند الصرف للاختبار -->
      <div class="form-group" id="sw-cc-field" style="display:${defType === 'out_test' ? 'block' : 'none'}">
        <label class="form-label">مركز التكلفة — قطاع الجودة <span style="color:var(--accent-red)">*</span></label>
        ${ccSelectHtml}
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">الكمية (${ul}) <span style="color:var(--accent-red)">*</span></label>
          <input type="number" id="sw-mv-qty" class="form-input" min="0.1" step="0.1" value="1">
        </div>
        <div class="form-group">
          <label class="form-label">السبب / الملاحظة</label>
          <input type="text" id="sw-mv-reason" class="form-input" placeholder="وصف مختصر للحركة">
        </div>
      </div>
    </div>
    <div class="sw-modal-footer">
      <button class="btn btn-secondary" onclick="swCloseModal()">إلغاء</button>
      <button class="btn btn-primary" onclick="swSubmitMovement(${sampleId},${inv.id || 0})"><i class="ti ti-check" aria-hidden="true"></i> تأكيد الحركة</button>
    </div>`, 'md');
    if (typeof initSearchableSelects === 'function') initSearchableSelects();
  }

  function swSelMvType(type, el) {
    document.querySelectorAll('.sw-mv-type').forEach(b => b.classList.remove('selected'));
    el.classList.add('selected');
    document.getElementById('sw-move-type-val').value = type;
    const ccf = document.getElementById('sw-cc-field');
    if (ccf) ccf.style.display = type === 'out_test' ? 'block' : 'none';
  }

  async function swSubmitMovement(sampleId, inventoryId) {
    const type = document.getElementById('sw-move-type-val')?.value;
    const qty = parseFloat(document.getElementById('sw-mv-qty')?.value || 0);
    const reason = document.getElementById('sw-mv-reason')?.value?.trim() || '';
    // دعم searchableSelect وعنصر select وinput عادي
    const prEl = document.getElementById('sw-mv-pr-code');
    const prCode = prEl?.value?.trim() || '';
    const ccEl = document.getElementById('sw-mv-cc-id');
    const ccId = parseInt(ccEl?.value || 0) || null;
    if (!type || qty <= 0) { showToast('أدخل الكمية واختر نوع الحركة', 'error'); return; }
    const d = await swPost('api/samples_api.php?action=movement_add', {
      inventory_id: inventoryId, sample_id: sampleId,
      movement_type: type, qty, reason, ref_pr_code: prCode, cost_center_id: ccId
    });
    if (d.success) { showToast('تمت الحركة بنجاح', 'success'); swCloseModal(); await swLoadSampleDetail(sampleId); swLoadStats().then(() => swRenderPage()); }
    else showToast(d.message || 'حدث خطأ', 'error');
  }

  // ═══════════════════════════════════════════════════════════════════
  //  مودال إنشاء عينة — رقم تسلسلي SMP-YYYY-NNN-[F/A/R/S]
  // ═══════════════════════════════════════════════════════════════════
  async function swOpenCreateModal() {
    const catOpts = Object.entries(SW_CAT).map(([k, v]) => `<option value="${k}">${v.ar} — سينتهي الكود بـ (${v.suffix})</option>`).join('');
    const unitOpts = Object.entries(SW_UNIT).map(([k, v]) => `<option value="${k}">${v.ar}</option>`).join('');
    const yr = new Date().getFullYear();
    const suppOpts = typeof searchableSelect === 'function' && SWH.suppliersCache
      ? searchableSelect({ id: 'sw-cr-sup-id', placeholder: 'ابحث عن المورد...', options: [{ value: '', label: '— اختر المورد (اختياري) —' }, ...(SWH.suppliersCache || []).map(s => ({ value: String(s.id), label: swEsc(s.name) }))] })
      : '<select id="sw-cr-sup-id" class="form-select"><option value="">— اختياري —</option></select>';

    swOpenModal(`
    <div class="sw-modal-hdr">
      <div class="sw-modal-hdr-info">
        <div class="sw-modal-name"><i class="ti ti-package" aria-hidden="true"></i> استلام عينة جديدة</div>
      </div>
      <button class="sw-modal-close" onclick="swCloseModal()"><i class="ti ti-x" aria-hidden="true"></i></button>
    </div>
    <div class="sw-modal-body" style="padding:1rem 1.25rem">
      <!-- معاينة الكود التسلسلي -->
      <div style="display:flex;align-items:center;gap:.6rem;padding:.6rem .85rem;background:rgba(63,89,80,.06);border:1px solid rgba(63,89,80,.2);border-radius:var(--radius-sm);margin-bottom:.85rem">
        <i class="ti ti-hash" style="color:var(--primary,#3F5950)" aria-hidden="true"></i>
        <span style="font-size:.8rem;color:var(--text-secondary)">سيُولَّد الرقم التسلسلي تلقائياً:</span>
        <span class="sw-code" style="font-size:.9rem" id="sw-code-preview">SMP-${yr}-???-F</span>
      </div>
      <div class="form-group"><label class="form-label">اسم العينة <span style="color:var(--accent-red)">*</span></label><input type="text" id="sw-cr-name" class="form-input" placeholder="مثال: قماش كاكي مقاوم للحرارة ISO-11612"></div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">الفئة <span style="color:var(--accent-red)">*</span></label>
          <select id="sw-cr-cat" class="form-select" onchange="swUpdateCodePreview(this.value,'${yr}')">
            ${catOpts}
          </select>
        </div>
        <div class="form-group"><label class="form-label">وحدة القياس <span style="color:var(--accent-red)">*</span></label><select id="sw-cr-unit" class="form-select">${unitOpts}</select></div>
      </div>
      <div class="form-group"><label class="form-label">الغرض من العينة</label>
        <select id="sw-cr-purpose" class="form-select">
          ${Object.entries(SW_PURPOSE).map(([k, v]) => `<option value="${k}">${v.ar}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label class="form-label">المورد</label>${suppOpts}</div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">كود الربط مع المورد</label><input type="text" id="sw-cr-sup-code" class="form-input" placeholder="SUP-041-FAB"></div>
        <div class="form-group"><label class="form-label">رقم أمر الشراء (PO)</label><input type="text" id="sw-cr-po-code" class="form-input" placeholder="PO-2025-001"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">الكمية الابتدائية</label><input type="number" id="sw-cr-init-qty" class="form-input" min="0" step="0.1" value="0"></div>
        <div class="form-group"><label class="form-label">حد التنبيه للمخزون</label><input type="number" id="sw-cr-min-qty" class="form-input" min="0" step="0.1" value="0"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">موقع التخزين</label><input type="text" id="sw-cr-loc" class="form-input" placeholder="رف B-12 — غرفة العينات"></div>
        <div class="form-group"><label class="form-label">الأولوية</label>
          <select id="sw-cr-priority" class="form-select">
            <option value="high">عالية</option><option value="medium" selected>متوسطة</option><option value="low">منخفضة</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">تاريخ الاستلام</label><input type="date" id="sw-cr-rec-date" class="form-input" value="${new Date().toISOString().slice(0, 10)}"></div>
        <div class="form-group"><label class="form-label">تاريخ الصلاحية</label><input type="date" id="sw-cr-exp-date" class="form-input"></div>
      </div>
      <div class="form-group"><label class="form-label">المواصفات التقنية</label><textarea id="sw-cr-specs" class="form-textarea" rows="2" placeholder="ISO 11612 / تحمل حرارة 350°م / وزن 320 جم/م²..."></textarea></div>
      <div class="form-group"><label class="form-label">ملاحظات</label><textarea id="sw-cr-notes" class="form-textarea" rows="2"></textarea></div>
    </div>
    <div class="sw-modal-footer">
      <button class="btn btn-secondary" onclick="swCloseModal()">إلغاء</button>
      <button class="btn btn-primary" onclick="swSubmitCreate()"><i class="ti ti-device-floppy" aria-hidden="true"></i> حفظ العينة</button>
    </div>`, 'lg');
    if (typeof initSearchableSelects === 'function') initSearchableSelects();
  }

  // معاينة الكود حسب الفئة المختارة
  function swUpdateCodePreview(category, yr) {
    const suffix = SW_CAT[category]?.suffix || '?';
    const el = document.getElementById('sw-code-preview');
    if (el) el.textContent = `SMP-${yr}-???-${suffix}`;
  }

  async function swSubmitCreate() {
    const name = document.getElementById('sw-cr-name')?.value?.trim();
    if (!name) { showToast('اسم العينة مطلوب', 'error'); return; }
    const suppEl = document.getElementById('sw-cr-sup-id');
    const suppId = parseInt(suppEl?.value || 0) || null;
    const d = await swPost('api/samples_api.php?action=create', {
      name,
      category: document.getElementById('sw-cr-cat')?.value,
      unit: document.getElementById('sw-cr-unit')?.value,
      purpose: document.getElementById('sw-cr-purpose')?.value || 'internal_test',
      supplier_id: suppId,
      supplier_code: document.getElementById('sw-cr-sup-code')?.value?.trim() || '',
      po_code: document.getElementById('sw-cr-po-code')?.value?.trim() || '',
      initial_qty: parseFloat(document.getElementById('sw-cr-init-qty')?.value || 0),
      min_qty_alert: parseFloat(document.getElementById('sw-cr-min-qty')?.value || 0),
      location: document.getElementById('sw-cr-loc')?.value?.trim() || '',
      priority: document.getElementById('sw-cr-priority')?.value || 'medium',
      received_date: document.getElementById('sw-cr-rec-date')?.value || '',
      expiry_date: document.getElementById('sw-cr-exp-date')?.value || '',
      specs: document.getElementById('sw-cr-specs')?.value?.trim() || '',
      notes: document.getElementById('sw-cr-notes')?.value?.trim() || '',
    });
    if (d.success) {
      showToast(`✓ ${d.message}`, 'success');
      swCloseModal();
      SWH.page = 1;
      await swLoadStats(); swRenderPage(); swLoadList();
    } else showToast(d.message || 'حدث خطأ', 'error');
  }

  // ═══════════════════════════════════════════════════════════════════
  //  مودال تعديل العينة
  // ═══════════════════════════════════════════════════════════════════
  async function swOpenEditModal(id) {
    if (!SWH.selected || SWH.selected.id !== id) await swLoadSampleDetail(id);
    const s = SWH.selected;
    if (!s) { showToast('تعذّر تحميل البيانات', 'error'); return; }
    const catOpts = Object.entries(SW_CAT).map(([k, v]) => `<option value="${k}" ${s.category === k ? 'selected' : ''}>${v.ar} (${v.suffix})</option>`).join('');
    const unitOpts = Object.entries(SW_UNIT).map(([k, v]) => `<option value="${k}" ${s.unit === k ? 'selected' : ''}>${v.ar}</option>`).join('');
    const purpOpts = Object.entries(SW_PURPOSE).map(([k, v]) => `<option value="${k}" ${s.purpose === k ? 'selected' : ''}>${v.ar}</option>`).join('');
    const prioOpts = [['high', 'عالية'], ['medium', 'متوسطة'], ['low', 'منخفضة']].map(([k, v]) => `<option value="${k}" ${s.priority === k ? 'selected' : ''}>${v}</option>`).join('');

    swOpenModal(`
    <div class="sw-modal-hdr">
      <div class="sw-modal-hdr-info">
        <div class="sw-modal-code">${swEsc(s.sample_code)}</div>
        <div class="sw-modal-name">تعديل بيانات العينة</div>
      </div>
      <button class="sw-modal-close" onclick="swCloseModal()"><i class="ti ti-x" aria-hidden="true"></i></button>
    </div>
    <div class="sw-modal-body" style="padding:1rem 1.25rem">
      <div class="form-group"><label class="form-label">اسم العينة <span style="color:var(--accent-red)">*</span></label><input type="text" id="sw-ed-name" class="form-input" value="${swEsc(s.name || '')}"></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">الفئة</label><select id="sw-ed-cat" class="form-select">${catOpts}</select></div>
        <div class="form-group"><label class="form-label">وحدة القياس</label><select id="sw-ed-unit" class="form-select">${unitOpts}</select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">الغرض</label><select id="sw-ed-purpose" class="form-select">${purpOpts}</select></div>
        <div class="form-group"><label class="form-label">الأولوية</label><select id="sw-ed-priority" class="form-select">${prioOpts}</select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">موقع التخزين</label><input type="text" id="sw-ed-location" class="form-input" value="${swEsc(s.location || '')}" placeholder="رف B-12"></div>
        <div class="form-group"><label class="form-label">حد التنبيه</label><input type="number" id="sw-ed-min-qty" class="form-input" value="${parseFloat(s.min_qty_alert || 0).toFixed(1)}" min="0" step="0.1"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">كود الربط مع المورد</label><input type="text" id="sw-ed-sup-code" class="form-input" value="${swEsc(s.supplier_code || '')}" placeholder="SUP-041-FAB"></div>
        <div class="form-group"><label class="form-label">رقم PO</label><input type="text" id="sw-ed-po-code" class="form-input" value="${swEsc(s.po_code || '')}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">تاريخ الاستلام</label><input type="date" id="sw-ed-rec-date" class="form-input" value="${s.received_date || ''}"></div>
        <div class="form-group"><label class="form-label">تاريخ الصلاحية</label><input type="date" id="sw-ed-exp-date" class="form-input" value="${s.expiry_date || ''}"></div>
      </div>
      <div class="form-group"><label class="form-label">تاريخ الإرجاع المتوقع (للمورد)</label><input type="date" id="sw-ed-ret-date" class="form-input" value="${s.expected_return_date || ''}"></div>
      <div class="form-group"><label class="form-label">المواصفات التقنية</label><textarea id="sw-ed-specs" class="form-textarea" rows="3" placeholder="المعيار · الوزن · التركيب...">${swEsc(s.specs || '')}</textarea></div>
    </div>
    <div class="sw-modal-footer">
      <button class="btn btn-danger btn-sm" onclick="swArchiveSample(${s.id})"><i class="ti ti-archive" aria-hidden="true"></i> أرشفة</button>
      <div style="flex:1"></div>
      <button class="btn btn-secondary" onclick="swCloseModal()">إلغاء</button>
      <button class="btn btn-primary" onclick="swSubmitEdit(${s.id})"><i class="ti ti-device-floppy" aria-hidden="true"></i> حفظ</button>
    </div>`, 'lg');
  }

  async function swSubmitEdit(id) {
    const name = document.getElementById('sw-ed-name')?.value?.trim();
    if (!name) { showToast('الاسم مطلوب', 'error'); return; }
    const d = await swPost('api/samples_api.php?action=update', {
      id, name,
      category: document.getElementById('sw-ed-cat')?.value,
      unit: document.getElementById('sw-ed-unit')?.value,
      purpose: document.getElementById('sw-ed-purpose')?.value,
      priority: document.getElementById('sw-ed-priority')?.value,
      location: document.getElementById('sw-ed-location')?.value?.trim() || '',
      min_qty_alert: parseFloat(document.getElementById('sw-ed-min-qty')?.value || 0),
      supplier_code: document.getElementById('sw-ed-sup-code')?.value?.trim() || '',
      po_code: document.getElementById('sw-ed-po-code')?.value?.trim() || '',
      received_date: document.getElementById('sw-ed-rec-date')?.value || '',
      expiry_date: document.getElementById('sw-ed-exp-date')?.value || '',
      expected_return_date: document.getElementById('sw-ed-ret-date')?.value || '',
      specs: document.getElementById('sw-ed-specs')?.value?.trim() || '',
    });
    if (d.success) { showToast('تم حفظ التعديلات', 'success'); swCloseModal(); await swLoadSampleDetail(id); swLoadList(); swLoadStats().then(() => swRenderPage()); }
    else showToast(d.message || 'حدث خطأ', 'error');
  }

  async function swArchiveSample(id) {
    if (!confirm('هل تريد أرشفة هذه العينة؟')) return;
    const d = await swPost('api/samples_api.php?action=delete', { id });
    if (d.success) {
      showToast('تمت الأرشفة', 'success'); swCloseModal();
      SWH.selected = null;
      document.getElementById('sw-side-panel').innerHTML = '<div class="sw-table-wrap" style="padding:1.25rem"><div class="sw-side-empty"><p>تمت أرشفة العينة</p></div></div>';
      swLoadList(); swLoadStats().then(() => swRenderPage());
    } else showToast(d.message || 'حدث خطأ', 'error');
  }

  // ═══════════════════════════════════════════════════════════════════
  //  مسار التتبع البصري — 8 نقاط مع الخط الزمني
  // ═══════════════════════════════════════════════════════════════════
  function swBuildTimelineTab() {
    const s = SWH.selected;
    const log = SWH.stageLog || [];
    const sid = s?.id;
    const doneStatuses = new Set(log.map(l => l.new_status));
    const currentStatus = s?.status || 'new';
    const isRejected = currentStatus === 'rejected';
    const isProduction = currentStatus === 'approved_for_production';

    // شريط التقدم
    const progressHTML = `<div class="sw-tp-wrap">
      <div class="sw-tp-bar">
        ${SW_TRACK.map((st, i) => {
      const isDone = doneStatuses.has(st.id) && st.id !== currentStatus;
      const isActive = st.id === currentStatus;
      const skip = isRejected && ['approved', 'approved_for_production'].includes(st.id);
      const nodeCls = skip ? 'skip' : isDone ? 'done' : isActive ? 'active' : 'pending';
      const icon = isActive ? 'ti-loader' : isDone ? 'ti-check' : skip ? 'ti-minus' : st.icon;
      const lineHTML = i < SW_TRACK.length - 1 ? `<div class="sw-tp-line ${isDone ? 'done' : ''}"></div>` : '';
      return `<div class="sw-tp-step"><div class="sw-tp-node ${nodeCls}" title="${st.label}"><i class="ti ${icon}" style="font-size:.7rem" aria-hidden="true"></i></div>${lineHTML}</div>`;
    }).join('')}
      </div>
      <div class="sw-tp-labels">
        ${SW_TRACK.map(st => {
      const isDone = doneStatuses.has(st.id) && st.id !== currentStatus;
      const isActive = st.id === currentStatus;
      return `<div class="sw-tp-lbl ${isDone ? 'done' : isActive ? 'active' : ''}">${st.label}</div>`;
    }).join('')}
      </div>
    </div>`;

    // تفاصيل الخط الزمني
    const tlHTML = `<div class="sw-tl">
        ${SW_TRACK.map((stDef, i) => {
      const isDone = doneStatuses.has(stDef.id) && stDef.id !== currentStatus;
      const isActive = stDef.id === currentStatus;
      const isSkip = isRejected && ['approved', 'approved_for_production'].includes(stDef.id);
      const isPending = !isDone && !isActive && !isSkip;
      const isLast = i === SW_TRACK.length - 1;
      const logEntries = log.filter(l => l.new_status === stDef.id);
      const lastEntry = logEntries[logEntries.length - 1];
      const dotCls = isSkip ? 'skip' : isDone ? 'done' : isActive ? 'active' : 'pending';
      const icon = isActive ? 'ti-loader' : isDone ? 'ti-check' : isSkip ? 'ti-minus' : stDef.icon;
      const vlineCls = isLast ? 'last' : isDone ? 'done' : 'other';

      const statusInfo = SW_STATUS[stDef.id] || {};

      return `<div class="sw-tl-item">
              <div class="sw-tl-left">
                <div class="sw-tl-dot ${dotCls}"><i class="ti ${icon}" style="font-size:.72rem" aria-hidden="true"></i></div>
                ${!isLast ? `<div class="sw-tl-vline ${vlineCls}"></div>` : ''}
              </div>
              <div class="sw-tl-right">
                <div class="sw-tl-label ${isPending || isSkip ? 'muted' : ''}">
                  ${isActive ? '<span class="sw-now-badge">الآن</span>' : ''}
                  ${stDef.label}
                  ${stDef.id === currentStatus && isRejected ? '<span style="font-size:.67rem;background:rgba(242,111,99,.12);color:var(--accent-red);padding:.08rem .45rem;border-radius:99px;font-weight:700">مرفوضة</span>' : ''}
                  ${isProduction && stDef.id === 'approved_for_production' ? '<span style="font-size:.67rem;background:rgba(34,197,94,.12);color:var(--accent-green);padding:.08rem .45rem;border-radius:99px;font-weight:700">✓ معتمدة للإنتاج</span>' : ''}
                </div>
                ${lastEntry
          ? `<div class="sw-tl-meta">${swEsc(lastEntry.employee_name || '—')}${lastEntry.dept_name ? ' · ' + swEsc(lastEntry.dept_name) : ''} · ${swFmtDate(lastEntry.performed_at)}</div>
                    ${lastEntry.notes ? `<div class="sw-tl-note">${swEsc(lastEntry.notes)}</div>` : ''}`
          : isPending || isSkip ? '<div class="sw-tl-meta">لم تبدأ بعد</div>' : ''}
              </div>
            </div>`;
    }).join('')}
    </div>`;

    // مربع إضافة ملاحظة
    const stOpts = Object.entries(SW_STATUS).filter(([k]) => !['archived'].includes(k)).map(([k, v]) => `<option value="${k}" ${s?.status === k ? 'selected' : ''}>${v.ar}</option>`).join('');

    return `
    <div class="sw-modal-section">
      <div class="sw-sec-title"><i class="ti ti-map-pin" aria-hidden="true"></i> موقع العينة الحالي</div>
      ${progressHTML}
    </div>
    <div class="sw-modal-section">
      <div class="sw-sec-title"><i class="ti ti-timeline" aria-hidden="true"></i> تفاصيل المراحل</div>
      ${tlHTML}
    </div>
    <!-- رحلات المورد إن وجدت -->
    ${SWH.supplierTrips.length ? `<div class="sw-modal-section">
      <div class="sw-sec-title"><i class="ti ti-truck" aria-hidden="true"></i> رحلات المورد (${SWH.supplierTrips.length})</div>
      ${SWH.supplierTrips.map(t => {
      const statusMap = { pending: 'جارية', partial_return: 'إرجاع جزئي', returned: 'أُرجعت', not_returned: 'لم تُرجَع' };
      const isOverdue = t.expected_return_date && new Date(t.expected_return_date) < new Date() && t.status === 'pending';
      return `<div class="sw-mv-item">
          <div class="sw-mv-dot ${t.status === 'returned' ? 'sw-mv-in' : 'sw-mv-out'}"><i class="ti ti-truck" aria-hidden="true"></i></div>
          <div style="flex:1;min-width:0">
            <div class="sw-mv-title">${swEsc(t.supplier_name || 'مورد')}</div>
            <div class="sw-mv-meta">أُرسل: ${t.qty_sent} | أُرجع: ${t.qty_returned} | ${statusMap[t.status] || t.status}</div>
            <div class="sw-mv-meta ${isOverdue ? 'style="color:var(--accent-red)"' : ''}">${swFmtDate(t.sent_date)} → ${swFmtDate(t.expected_return_date) || 'غير محدد'} ${isOverdue ? '⚠ تأخر!' : ''}</div>
            ${t.purpose ? `<div class="sw-mv-meta">${swEsc(t.purpose)}</div>` : ''}
          </div>
        </div>`;
    }).join('')}
    </div>`: ''}
    <!-- إضافة ملاحظة -->
    <div class="sw-modal-section">
      <div class="sw-sec-title"><i class="ti ti-pencil" aria-hidden="true"></i> إضافة ملاحظة للخط الزمني</div>
      <div style="display:flex;gap:.75rem;align-items:flex-end">
        <select id="sw-tl-new-status" class="form-select" style="width:170px;flex-shrink:0">${stOpts}</select>
        <textarea id="sw-stage-note" class="form-textarea" rows="1" style="flex:1;min-height:38px;resize:none" placeholder="نتيجة اختبار / قرار اللجنة / ملاحظة تقنية..."></textarea>
        <button class="btn btn-primary" style="flex-shrink:0;align-self:flex-end" onclick="swSubmitStageNote(${sid})"><i class="ti ti-check" aria-hidden="true"></i></button>
      </div>
    </div>`;
  }

  async function swSubmitStageNote(sampleId) {
    const note = document.getElementById('sw-stage-note')?.value?.trim();
    const newStatus = document.getElementById('sw-tl-new-status')?.value;
    if (!note) { showToast('الملاحظة مطلوبة', 'error'); return; }
    const d = await swPost('api/samples_api.php?action=change_status', { id: sampleId, new_status: newStatus, notes: note });
    if (d.success) { showToast('تم التسجيل', 'success'); await swLoadSampleDetail(sampleId); }
    else showToast(d.message || 'حدث خطأ', 'error');
  }

  // ═══════════════════════════════════════════════════════════════════
  //  التبويبات الثانوية
  // ═══════════════════════════════════════════════════════════════════
  function swSwitchTab(tab) {
    SWH.activeTab = tab;
    document.querySelectorAll('.sw-tab-btn').forEach(t => t.classList.toggle('active', t.getAttribute('onclick')?.includes(`'${tab}'`)));
    ({
      list: swLoadList,
      alerts: swRenderAlertsTab,
      supplier: swRenderSupplierTab,
      movements: swRenderMovementsTab,
      report: swRenderReportTab,
      reservations: swRenderReservationsTab,
    }[tab] || swLoadList)();
  }

  function swRenderAlertsTab() {
    const wrap = document.getElementById('sw-table-wrap'); if (!wrap) return;
    const low = SWH.alerts.low_stock || []; const exp = SWH.alerts.expiring || []; const ovd = SWH.alerts.overdue_supplier || [];
    const card = (s, valHtml, sub, onclick = '') => `<div style="display:flex;align-items:center;justify-content:space-between;padding:.55rem .75rem;border-radius:7px;background:var(--bg-secondary);margin-bottom:.35rem;cursor:pointer" ${onclick ? 'onclick="' + onclick + '"' : ''}><div><div style="font-size:.83rem;font-weight:600">${swEsc(s.name)}</div><div style="font-size:.73rem;color:var(--text-muted)">${swEsc(s.sample_code || '')} ${sub}</div></div><div style="text-align:left">${valHtml}</div></div>`;
    wrap.innerHTML = `<div class="sw-table-wrap" style="padding:1rem">
      <div class="sw-panel-sec-hdr" style="margin-bottom:.6rem"><i class="ti ti-truck" style="color:var(--accent-amber)" aria-hidden="true"></i> تأخرت عند المورد (${ovd.length})</div>
      ${ovd.length ? ovd.map(s => card(s, `<div style="font-size:.88rem;font-weight:700;color:var(--accent-red)">${s.days_overdue} يوم</div><div style="font-size:.7rem;color:var(--text-muted)">كان ${swFmtDate(s.expected_return_date)}</div>`, `عند: ${swEsc(s.supplier_name || '—')}`, `swSelectSample(${s.id})`)).join('') : '<div style="font-size:.8rem;color:var(--text-muted)">لا توجد</div>'}
      <div class="sw-panel-sec-hdr" style="margin:1rem 0 .6rem"><i class="ti ti-alert-triangle" style="color:var(--accent-red)" aria-hidden="true"></i> مخزون منخفض (${low.length})</div>
      ${low.length ? low.map(s => card(s, `<div style="font-size:.88rem;font-weight:700;color:var(--accent-red)">${parseFloat(s.qty_available).toFixed(1)} ${swUnitLabel(s.unit)}</div><div style="font-size:.7rem;color:var(--text-muted)">الحد: ${parseFloat(s.min_qty_alert).toFixed(1)}</div>`, '', `swSelectSample(${s.id})`)).join('') : '<div style="font-size:.8rem;color:var(--text-muted)">لا توجد</div>'}
      <div class="sw-panel-sec-hdr" style="margin:1rem 0 .6rem"><i class="ti ti-calendar-x" style="color:var(--accent-amber)" aria-hidden="true"></i> تنتهي صلاحيتها (${exp.length})</div>
      ${exp.length ? exp.map(s => card(s, `<div style="font-size:.85rem;font-weight:700;color:var(--accent-amber)">${swFmtDate(s.expiry_date)}</div><div style="font-size:.7rem;color:var(--text-muted)">متبقي ${s.days_left} يوم</div>`, '')).join('') : '<div style="font-size:.8rem;color:var(--text-muted)">لا توجد</div>'}
    </div>`;
  }

  async function swRenderSupplierTab() {
    const wrap = document.getElementById('sw-table-wrap'); if (!wrap) return;
    wrap.innerHTML = '<div class="sw-loading"><div class="spinner"></div></div>';
    const d = await swGet('api/samples_api.php?action=supplier_qualification_report');
    if (!d.success || !d.data.length) { wrap.innerHTML = '<div class="sw-table-wrap"><div class="sw-empty"><i class="ti ti-truck" aria-hidden="true"></i><p>لا توجد رحلات موردين</p></div></div>'; return; }
    const stMap = { pending: '<span style="color:var(--accent-amber)">جارية</span>', partial_return: '<span style="color:var(--accent-amber)">إرجاع جزئي</span>', returned: '<span style="color:var(--accent-green)">أُرجعت</span>', not_returned: '<span style="color:var(--accent-red)">لم تُرجَع</span>' };
    const rows = d.data.map(t => `<tr onclick="swSelectSample(${t.sample_id})" style="cursor:pointer">
      <td><span class="sw-code">${swEsc(t.sample_code)}</span></td>
      <td style="font-size:.83rem">${swEsc(t.sample_name)}</td>
      <td class="sw-td-muted">${swEsc(t.supplier_name || '—')}</td>
      <td style="font-size:.83rem">${parseFloat(t.qty_sent).toFixed(1)} → ${parseFloat(t.qty_returned).toFixed(1)}</td>
      <td>${stMap[t.status] || t.status}</td>
      <td class="sw-td-muted">${swFmtDate(t.sent_date)}</td>
      <td class="sw-td-muted ${t.status === 'pending' && t.expected_return_date && new Date(t.expected_return_date) < new Date() ? 'style="color:var(--accent-red);font-weight:600"' : ''}">
        ${swFmtDate(t.expected_return_date) || '—'}
      </td>
      <td class="sw-td-muted">${t.days_elapsed} يوم</td>
      ${t.status === 'pending' && SWH.userRole.canManage ? `<td><button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();swOpenSupplierReturnModal(${t.id},${t.sample_id})"><i class="ti ti-package-import" aria-hidden="true"></i></button></td>` : '<td></td>'}
    </tr>`).join('');
    wrap.innerHTML = `<div class="sw-table-wrap"><table class="pr-table sw-table"><thead><tr><th>كود العينة</th><th>الاسم</th><th>المورد</th><th>أُرسل→أُرجع</th><th>الحالة</th><th>تاريخ الإرسال</th><th>إرجاع متوقع</th><th>المدة</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  async function swRenderMovementsTab() {
    const wrap = document.getElementById('sw-table-wrap'); if (!wrap) return;
    wrap.innerHTML = '<div class="sw-loading"><div class="spinner"></div></div>';
    const d = await swGet('api/samples_api.php?action=movements_list&limit=50'); if (!d.success) return;
    const rows = d.data.map(m => { const mt = SW_MOVE[m.movement_type] || {}; const qty = parseFloat(m.qty); const isIn = ['in', 'return_dept', 'return_supplier', 'release'].includes(m.movement_type); return `<tr><td><div class="sw-mv-dot ${mt.cls || 'sw-mv-adj'}"><i class="ti ${mt.icon || 'ti-circle'}" aria-hidden="true"></i></div></td><td style="font-size:.83rem">${mt.ar || m.movement_type}</td><td class="sw-td-muted">${swEsc(m.employee_name || '—')}</td><td style="font-size:.83rem;font-weight:700;color:${isIn ? 'var(--accent-green)' : 'var(--accent-red)'}">${isIn ? '+' : '−'}${qty.toFixed(1)}</td><td class="sw-td-muted">${swEsc((m.reason || '').slice(0, 40))}</td><td>${m.ref_pr_code ? `<span class="sw-code">${swEsc(m.ref_pr_code)}</span>` : '—'}</td><td class="sw-td-muted">${swTimeAgo(m.performed_at)}</td></tr>`; }).join('');
    wrap.innerHTML = `<div class="sw-table-wrap"><table class="pr-table sw-table"><thead><tr><th style="width:36px"></th><th>النوع</th><th>الموظف</th><th>الكمية</th><th>السبب</th><th>الطلبية</th><th>التاريخ</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  async function swRenderReservationsTab() {
    const wrap = document.getElementById('sw-table-wrap'); if (!wrap) return;
    wrap.innerHTML = '<div class="sw-loading"><div class="spinner"></div></div>';
    const d = await swGet('api/samples_api.php?action=reservations_list&status=active'); if (!d.success) return;
    if (!d.data.length) { wrap.innerHTML = '<div class="sw-table-wrap"><div class="sw-empty"><i class="ti ti-lock-open" aria-hidden="true"></i><p>لا توجد حجوزات نشطة</p></div></div>'; return; }
    const rows = d.data.map(r => `<tr><td><span class="sw-code">${swEsc(r.sample_code)}</span></td><td style="font-size:.83rem">${swEsc(r.sample_name)}</td><td style="font-size:.83rem;font-weight:700;color:#5b5ff0">${parseFloat(r.qty_reserved).toFixed(1)} ${swUnitLabel(r.unit)}</td><td>${r.pr_code ? `<span class="sw-code">${swEsc(r.pr_code)}</span>` : '—'}</td><td class="sw-td-muted">${swEsc(r.reserved_by_name || '—')}</td><td class="sw-td-muted">${swFmtDate(r.reserved_at)}</td><td><button class="btn btn-secondary btn-sm" onclick="swReleaseReservation(${r.id})"><i class="ti ti-lock-open" aria-hidden="true"></i> تحرير</button></td></tr>`).join('');
    wrap.innerHTML = `<div class="sw-table-wrap"><table class="pr-table sw-table"><thead><tr><th>الكود</th><th>الاسم</th><th>الكمية</th><th>الطلبية</th><th>محجوز بواسطة</th><th>تاريخ الحجز</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  async function swReleaseReservation(resId) {
    if (!confirm('تحرير هذا الحجز؟')) return;
    const d = await swPost('api/samples_api.php?action=release_reserve', { reservation_id: resId, reason: 'تحرير يدوي' });
    if (d.success) { showToast('تم تحرير الحجز', 'success'); swRenderReservationsTab(); }
    else showToast(d.message || 'حدث خطأ', 'error');
  }

  async function swRenderReportTab() {
    const wrap = document.getElementById('sw-table-wrap'); if (!wrap) return;
    wrap.innerHTML = '<div class="sw-loading"><div class="spinner"></div></div>';
    const d = await swGet('api/samples_api.php?action=consumption_report&days=30');
    if (!d.success || !d.data.length) { wrap.innerHTML = '<div class="sw-table-wrap"><div class="sw-empty"><i class="ti ti-chart-bar" aria-hidden="true"></i><p>لا توجد بيانات استهلاك</p></div></div>'; return; }
    const max = Math.max(...d.data.map(x => parseFloat(x.consumed)));
    const rows = d.data.map(row => { const cons = parseFloat(row.consumed), rec = parseFloat(row.received); const pct = max > 0 ? Math.round(cons / max * 100) : 0; const ul = swUnitLabel(row.unit); return `<tr><td><span class="sw-code">${swEsc(row.sample_code)}</span></td><td style="font-size:.83rem">${swEsc(row.name)}</td><td><div class="sw-qty-wrap"><div class="sw-qty-bar"><div class="sw-qty-fill mid" style="width:${pct}%"></div></div><span class="sw-qty-num">${cons.toFixed(1)} ${ul}</span></div></td><td style="font-size:.83rem;color:var(--accent-green);font-weight:700">+${rec.toFixed(1)} ${ul}</td><td class="sw-td-muted">${row.movement_count}</td></tr>`; }).join('');
    wrap.innerHTML = `<div class="sw-table-wrap"><div style="padding:.65rem 1rem;font-size:.82rem;font-weight:600;color:var(--text-muted);border-bottom:1px solid var(--border-color)">تقرير الاستهلاك — آخر 30 يوم</div><table class="pr-table sw-table"><thead><tr><th>الكود</th><th>العينة</th><th>الاستهلاك</th><th>الوارد</th><th>الحركات</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  مساعدات
  // ═══════════════════════════════════════════════════════════════════
  function swOpenModal(html, size) {
    const overlay = document.getElementById('sw-modal-overlay');
    const box = document.getElementById('sw-modal-box');
    const content = document.getElementById('sw-modal-content');
    if (!overlay || !box || !content) return;
    content.innerHTML = html;
    box.className = `sw-modal ${size === 'lg' ? 'sw-modal-lg' : size === 'sm' ? 'sw-modal-sm' : ''}`;
    overlay.style.display = 'flex';
  }
  function swCloseModal() { const o = document.getElementById('sw-modal-overlay'); if (o) o.style.display = 'none'; }
  function swPrevPage() { if (SWH.page > 1) { SWH.page--; swLoadList(); } }
  function swNextPage() { if (SWH.page < SWH.totalPages) { SWH.page++; swLoadList(); } }
  function swFilterChange(key, val) { SWH.filters[key] = val; SWH.page = 1; swLoadList(); }
  let _swSearchTimer = null;
  function swDebounceSearch(val) { clearTimeout(_swSearchTimer); _swSearchTimer = setTimeout(() => { SWH.filters.search = val; SWH.page = 1; swLoadList(); }, 400); }
  function swExport() {
    const p = new URLSearchParams({ action: 'export', category: SWH.filters.category || '', status: SWH.filters.status || '', search: SWH.filters.search || '' });
    const a = document.createElement('a');
    a.href = 'api/samples_api.php?' + p;
    a.download = 'عينات_' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    showToast('جاري تنزيل ملف العينات...', 'success');
  }


  // تعريض الدوال للـ global scope
  window.loadSamplesPage = typeof loadSamplesPage !== "undefined" ? loadSamplesPage : null;
  window.loadSampleWarehousePage = typeof loadSampleWarehousePage !== "undefined" ? loadSampleWarehousePage : null;
})();