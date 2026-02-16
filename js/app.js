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
    loadDashboard();
});

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
// ========== نظام التنبيهات (قائمة منسدلة) ==========

// أضف هذا في initEventListeners()
document.querySelector('.notification-btn')?.addEventListener('click', toggleNotificationsDropdown);

// إغلاق القائمة عند النقر خارجها
document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('notifications-dropdown');
    const btn = document.querySelector('.notification-btn');
    if (dropdown && !dropdown.contains(e.target) && !btn.contains(e.target)) {
        dropdown.classList.remove('show');
    }
});

// فتح/إغلاق قائمة التنبيهات
function toggleNotificationsDropdown(e) {
    e.stopPropagation();

    let dropdown = document.getElementById('notifications-dropdown');

    // إنشاء القائمة إذا لم تكن موجودة
    if (!dropdown) {
        dropdown = document.createElement('div');
        dropdown.id = 'notifications-dropdown';
        dropdown.className = 'notifications-dropdown';
        document.querySelector('.notification-btn').appendChild(dropdown);
    }

    // إذا كانت مفتوحة، أغلقها
    if (dropdown.classList.contains('show')) {
        dropdown.classList.remove('show');
        return;
    }

    // تحميل التنبيهات
    dropdown.innerHTML = '<div class="notif-loading"><div class="spinner-small"></div> جاري التحميل...</div>';
    dropdown.classList.add('show');

    loadNotifications(dropdown);
}

// تحميل التنبيهات
async function loadNotifications(dropdown) {
    try {
        const res = await fetch('api/?action=notifications&limit=5');
        const result = await res.json();

        let html = '<div class="notif-header">';
        html += '<h4>الإشعارات</h4>';
        html += '<button class="mark-all-read" onclick="markAllAsRead()">تعيين الكل كمقروء</button>';
        html += '</div>';

        html += '<div class="notif-list">';

        if (result.success && result.data && result.data.length > 0) {
            const stageNames = {
                'receiving': 'الاستلام',
                'budget': 'الموازنة',
                'payment': 'الدفع',
                'invoice': 'الفوترة'
            };

            const stageIcons = {
                'receiving': '📥',
                'budget': '💰',
                'payment': '💳',
                'invoice': '📄'
            };

            result.data.forEach(notification => {
                const stageName = stageNames[notification.stage] || notification.stage;
                const stageIcon = stageIcons[notification.stage] || '📋';
                const timeAgo = formatTimeAgo(notification.update_time);

                html += `
                <div class="notif-item" onclick="goToTransaction(${notification.id})">
                    <div class="notif-icon">${stageIcon}</div>
                    <div class="notif-content">
                        <div class="notif-title">${notification.status || stageName} - ${notification.transaction_number}</div>
                        <div class="notif-desc">${notification.transaction_type || ''} ${notification.employee_name ? '• ' + notification.employee_name : ''}</div>
                        <div class="notif-time">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"></circle>
                                <polyline points="12 6 12 12 16 14"></polyline>
                            </svg>
                            ${timeAgo}
                        </div>
                    </div>
                </div>`;
            });
        } else {
            html += '<div class="notif-empty"><div class="empty-icon">🔔</div><p>لا توجد إشعارات جديدة</p></div>';
        }

        html += '</div>';

        html += '<div class="notif-footer">';
        html += '<a href="#" onclick="viewAllNotifications(); return false;">عرض كل الإشعارات <span class="arrow">‹</span></a>';
        html += '</div>';

        dropdown.innerHTML = html;

    } catch (error) {
        dropdown.innerHTML = '<div class="notif-error">خطأ في تحميل الإشعارات</div>';
    }
}

// الانتقال للمعاملة
function goToTransaction(id) {
    document.getElementById('notifications-dropdown')?.classList.remove('show');
    viewTransaction(id);
}

// عرض كل الإشعارات
function viewAllNotifications() {
    document.getElementById('notifications-dropdown')?.classList.remove('show');
    // يمكنك إضافة صفحة كاملة للإشعارات هنا
    showToast('قريباً - صفحة كل الإشعارات', 'info');
}

// تعيين الكل كمقروء
function markAllAsRead() {
    const badge = document.getElementById('notification-badge');
    if (badge) {
        badge.style.display = 'none';
        badge.textContent = '0';
    }
    showToast('تم تعيين جميع الإشعارات كمقروءة', 'success');
}

// دالة حساب الوقت المنقضي
function formatTimeAgo(datetime) {
    if (!datetime) return '';

    const now = new Date();
    const past = new Date(datetime);
    const diffMs = now - past;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'الآن';
    if (diffMins < 60) return `منذ ${diffMins} دقيقة`;
    if (diffHours < 24) return `منذ ${diffHours} ساعة`;
    if (diffDays === 1) return 'أمس';
    if (diffDays < 7) return `منذ ${diffDays} أيام`;

    // تنسيق التاريخ
    const day = past.getDate().toString().padStart(2, '0');
    const month = (past.getMonth() + 1).toString().padStart(2, '0');
    const year = past.getFullYear();
    const hours = past.getHours().toString().padStart(2, '0');
    const mins = past.getMinutes().toString().padStart(2, '0');
    const ampm = past.getHours() >= 12 ? 'م' : 'ص';

    return `${hours}:${mins} ${ampm} , ${year}/${month}/${day}`;
}

// دالة حساب الوقت المنقضي
function formatTimeAgo(datetime) {
    if (!datetime) return '';

    const now = new Date();
    const past = new Date(datetime);
    const diffMs = now - past;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'الآن';
    if (diffMins < 60) return `منذ ${diffMins} دقيقة`;
    if (diffHours < 24) return `منذ ${diffHours} ساعة`;
    if (diffDays < 7) return `منذ ${diffDays} يوم`;

    return past.toLocaleDateString('ar-SA');
}
// تبديل التبويبات
function switchTab(tab) {
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
        loadCorrespondencePage(); // ← إضافة هذا السطر
    } else if (tab === 'settings') {
        loadSettingsPage();
    }
}
/**
 * نظام إدارة معاملات القطاع المالي - JavaScript
 * Workflow Management System
 * 
 * ملاحظة: هذا الملف يحتوي على التعديلات المطلوبة
 * يجب دمجه مع ملف app.js الأصلي
 */

// ========== نظام الترجمة (i18n) ==========

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

// تصدير الدوال للاستخدام العام
window.t = t;
window.toggleLanguage = toggleLanguage;
window.applyLanguage = applyLanguage;
window.initLanguage = initLanguage;

// ========== نهاية نظام الترجمة ==========


// ========== دالة loadSettingsPage المحدثة ==========

async function loadSettingsPage() {
    DOM.mainContent.innerHTML = `
        <div class="settings-page-wrapper">
            <!-- رأس صفحة الإعدادات -->
            <div class="settings-page-header">
                <div class="settings-header-info">
                    <div class="settings-header-icon">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="3"></circle>
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                        </svg>
                    </div>
                    <div>
                        <h1>${t('system_settings')}</h1>
                        <p>${t('manage_employees_transactions')}</p>
                    </div>
                </div>
            </div>
            
            <!-- محتوى الإعدادات -->
            <div class="settings-page">
                <div class="settings-sidebar">
                    <div class="settings-sidebar-card">
                        <div class="settings-nav-group">
                            <span class="settings-nav-label">${t('resource_management')}</span>
                            <button class="settings-nav-btn active" onclick="showSettingsSection('employees', this)">
                                <div class="nav-btn-icon blue">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                                        <circle cx="9" cy="7" r="4"></circle>
                                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                                        <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                                    </svg>
                                </div>
                                <div class="nav-btn-text">
                                    <span class="nav-btn-title">${t('employees')}</span>
                                    <span class="nav-btn-desc">${t('manage_employee_accounts')}</span>
                                </div>
                            </button>
                            <button class="settings-nav-btn" onclick="showSettingsSection('performance', this)">
                                <div class="nav-btn-icon green">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <line x1="18" y1="20" x2="18" y2="10"></line>
                                        <line x1="12" y1="20" x2="12" y2="4"></line>
                                        <line x1="6" y1="20" x2="6" y2="14"></line>
                                    </svg>
                                </div>
                                <div class="nav-btn-text">
                                    <span class="nav-btn-title">${t('employee_performance')}</span>
                                    <span class="nav-btn-desc">${t('reports_tracking')}</span>
                                </div>
                            </button>
                        </div>
                        
                        <div class="settings-nav-divider"></div>
                        
                        <div class="settings-nav-group">
                            <span class="settings-nav-label">${t('transactions_section')}</span>
                            <button class="settings-nav-btn" onclick="showSettingsSection('types', this)">
                                <div class="nav-btn-icon cyan">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                                        <polyline points="2 17 12 22 22 17"></polyline>
                                        <polyline points="2 12 12 17 22 12"></polyline>
                                    </svg>
                                </div>
                                <div class="nav-btn-text">
                                    <span class="nav-btn-title">${t('transaction_types')}</span>
                                    <span class="nav-btn-desc">${t('transaction_categories')}</span>
                                </div>
                            </button>
                            <button class="settings-nav-btn" onclick="showSettingsSection('all-transactions', this)">
                                <div class="nav-btn-icon orange">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                        <polyline points="14 2 14 8 20 8"></polyline>
                                        <line x1="16" y1="13" x2="8" y2="13"></line>
                                        <line x1="16" y1="17" x2="8" y2="17"></line>
                                    </svg>
                                </div>
                                <div class="nav-btn-text">
                                    <span class="nav-btn-title">${t('all_transactions')}</span>
                                    <span class="nav-btn-desc">${t('view_manage_transactions')}</span>
                                </div>
                            </button>
                        </div>
                        
                        <div class="settings-nav-divider"></div>
                        
                        <div class="settings-nav-group">
                            <span class="settings-nav-label">${t('system_section')}</span>
                            <button class="settings-nav-btn" onclick="showSettingsSection('system', this)">
                                <div class="nav-btn-icon purple">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                                        <line x1="8" y1="21" x2="16" y2="21"></line>
                                        <line x1="12" y1="17" x2="12" y2="21"></line>
                                    </svg>
                                </div>
                                <div class="nav-btn-text">
                                    <span class="nav-btn-title">${t('system_settings_desc')}</span>
                                    <span class="nav-btn-desc">${t('system_info_tools')}</span>
                                </div>
                            </button>
                        </div>
                    </div>
                </div>
                <div class="settings-content" id="settingsContent">
                    <!-- سيتم تحميل المحتوى هنا -->
                </div>
            </div>
        </div>
    `;

    // تحميل الموظفين افتراضياً
    await loadSettingsEmployees();
    showSettingsSection('employees', document.querySelector('.settings-nav-btn'));
}

// ========== نهاية دالة loadSettingsPage ==========


// ========== تعديل تهيئة التطبيق ==========
// أضف هذا في دالة DOMContentLoaded أو في initDOM

// تهيئة اللغة عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', function () {
    initLanguage();
});

// تحميل لوحة التحكم
async function loadDashboard() {
    showLoading();

    try {
        const [statsRes, chartRes, urgentRes] = await Promise.all([
            fetch('api/?action=stats'),
            fetch('api/?action=chart'),
            fetch('api/?action=urgent')
        ]);

        const stats = await statsRes.json();
        const chart = await chartRes.json();
        const urgent = await urgentRes.json();

        if (stats.success) App.stats = stats.data;
        if (chart.success) App.chartData = chart.data;

        renderDashboard(urgent.success ? urgent.data : []);

    } catch (error) {
        showToast('خطأ في تحميل البيانات', 'error');
        console.error(error);
    }
}

// عرض لوحة التحكم
function renderDashboard(urgentTransactions) {
    const html = `
        <div class="dashboard-split">
            <!-- القسم الأيمن: نظرة عامة + المعاملات العاجلة -->
            <div class="dashboard-right">
                <div class="urgent-section">
                    <div class="urgent-header">
                        <div class="urgent-title">
                            <span class="urgent-icon">⚠️</span>
                            <h3>المعاملات العاجلة</h3>
                            <span class="urgent-count">${urgentTransactions.length}</span>
                        </div>
                        <div class="urgent-filters">
                            <button class="urgent-filter-btn active" onclick="filterUrgent('all', this)">الكل</button>
                            <button class="urgent-filter-btn" onclick="filterUrgent('عاجل', this)">🔴 عاجل</button>
                            <button class="urgent-filter-btn" onclick="filterUrgent('متابعة', this)">⚠️ متابعة</button>
                        </div>
                    </div>
                    <div class="urgent-table-container">
                        ${urgentTransactions.length > 0 ? `
                        <table class="urgent-table">
                            <thead>
                                <tr>
                                    <th>الحالة</th>
                                    <th>رقم المعاملة</th>
                                    <th>الوصف</th>
                                    <th>المبلغ</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody id="urgentTableBody">
                                ${urgentTransactions.slice(0, 8).map(tx => `
                                <tr class="urgent-row" data-type="${tx.alert_type || 'عاجل'}">
                                    <td>
                                        <span class="alert-badge alert-${tx.alert_type === 'عاجل' ? 'danger' : tx.alert_type === 'متابعة' ? 'warning' : 'info'}">
                                            ${tx.alert_type === 'عاجل' ? '🔴' : tx.alert_type === 'متابعة' ? '⚠️' : '⏳'}
                                        </span>
                                    </td>
                                    <td><span class="tx-number">${tx.transaction_number}</span></td>
                                    <td><span class="tx-desc-text">${tx.description?.substring(0, 30) || ''}${tx.description?.length > 30 ? '...' : ''}</span></td>
                                    <td><span class="tx-amount">${formatMoney(tx.amount)}</span></td>
                                    <td>
                                        <button class="btn-action btn-view" onclick="viewTransaction(${tx.id})" title="عرض">
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                                <circle cx="12" cy="12" r="3"></circle>
                                            </svg>
                                        </button>
                                    </td>
                                </tr>
                                `).join('')}
                            </tbody>
                        </table>
                        ${urgentTransactions.length > 8 ? `<div class="urgent-more">و ${urgentTransactions.length - 8} معاملات أخرى...</div>` : ''}
                        ` : `
                        <div class="urgent-empty">
                            <div class="empty-icon">✅</div>
                            <h4>لا توجد معاملات عاجلة</h4>
                            <p>جميع المعاملات تسير بشكل طبيعي</p>
                        </div>
                        `}
                    </div>
                </div>
                <div class="stats-overview-card">
                    <div class="stats-header">
                        <h3>📊 نظرة عامة على النظام</h3>
                        <span class="stats-date">${new Date().toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
                    </div>
                    <div class="stats-content">
                        <div class="stat-item">
                            <div class="stat-icon-sm blue">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                    <polyline points="14 2 14 8 20 8"></polyline>
                                    <line x1="16" y1="13" x2="8" y2="13"></line>
                                    <line x1="16" y1="17" x2="8" y2="17"></line>
                                </svg>
                            </div>
                            <div class="stat-details">
                                <span class="stat-number">${App.stats.total || 0}</span>
                                <span class="stat-text">إجمالي المعاملات</span>
                            </div>
                        </div>
                        <div class="stat-divider"></div>
                        <div class="stat-item">
                            <div class="stat-icon-sm green">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                                    <polyline points="22 4 12 14.01 9 11.01"></polyline>
                                </svg>
                            </div>
                            <div class="stat-details">
                                <span class="stat-number">${App.stats.paid || 0}</span>
                                <span class="stat-text">المكتملة</span>
                            </div>
                        </div>
                        <div class="stat-divider"></div>
                        <div class="stat-item">
                            <div class="stat-icon-sm orange">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <circle cx="12" cy="12" r="10"></circle>
                                    <line x1="12" y1="8" x2="12" y2="12"></line>
                                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                                </svg>
                            </div>
                            <div class="stat-details">
                                <span class="stat-number urgent">${App.stats.urgent || 0}</span>
                                <span class="stat-text">تحتاج متابعة</span>
                            </div>
                        </div>
                        <div class="stat-divider"></div>
                        <div class="stat-item">
                            <div class="stat-icon-sm purple">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="12" y1="1" x2="12" y2="23"></line>
                                    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                                </svg>
                            </div>
                            <div class="stat-details">
                                <span class="stat-number">${formatMoney(App.stats.total_amount || 0)}</span>
                                <span class="stat-text">إجمالي المبالغ</span>
                            </div>
                        </div>
                    </div>
                </div>
                
                
            </div>
            
            <!-- القسم الأيسر: متابعة الأداء -->
            <div class="dashboard-left">
                <div class="performance-dashboard-section">
                    <div class="perf-dash-header">
                        <div class="perf-dash-title">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"></circle>
                                <polyline points="12 6 12 12 16 14"></polyline>
                            </svg>
                            <h3>متابعة الأداء</h3>
                        </div>
                        <div class="perf-dash-tabs">
                            <button class="perf-dash-tab active" onclick="switchDashPerfTab('employees', this)">الموظفين</button>
                            <button class="perf-dash-tab" onclick="switchDashPerfTab('events', this)">الأحداث</button>
                        </div>
                    </div>
                    
                    <!-- قسم الموظفين -->
                    <div id="dashPerfEmployees" class="perf-dash-content active">
                        <div id="dashEmployeeCards" class="dash-employee-cards">
                            <div class="loading-placeholder">جاري التحميل...</div>
                        </div>
                    </div>
                    
                    <!-- قسم الأحداث -->
                    <div id="dashPerfEvents" class="perf-dash-content">
                        <div id="dashEventsTimeline" class="dash-events-timeline">
                            <div class="loading-placeholder">جاري التحميل...</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    DOM.mainContent.innerHTML = html;

    // تحميل بيانات الأداء
    loadDashboardPerformance();

    if (DOM.notificationBadge) {
        DOM.notificationBadge.textContent = App.stats.urgent || 0;
        DOM.notificationBadge.style.display = App.stats.urgent > 0 ? 'flex' : 'none';
    }
}

// تبديل تبويبات الأداء في لوحة التحكم
function switchDashPerfTab(tab, btn) {
    document.querySelectorAll('.perf-dash-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.perf-dash-content').forEach(c => c.classList.remove('active'));

    btn.classList.add('active');

    if (tab === 'employees') {
        document.getElementById('dashPerfEmployees').classList.add('active');
    } else {
        document.getElementById('dashPerfEvents').classList.add('active');
        loadDashboardEvents();
    }
}

// تحميل بيانات الأداء في لوحة التحكم
async function loadDashboardPerformance() {
    try {
        const res = await fetch('api/?action=performance_summary');
        const result = await res.json();

        if (result.success) {
            renderDashboardEmployees(result.data);
        }
    } catch (e) {
        console.error('Error loading performance:', e);
    }


    // إضافة إحصائيات الخطابات
    fetch('api/correspondence_api.php?action=stats')
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                displayCorrespondenceStatsInDashboard(data.data);
            }
        });
}

function displayCorrespondenceStatsInDashboard(stats) {
    // إضافة قسم جديد في لوحة التحكم
    const corrSection = `
        <div class="dashboard-section">
            <h3>📨 الخطابات والمراسلات</h3>
            <div class="mini-stats">
                <div class="mini-stat">
                    <span class="mini-stat-value">${stats.total}</span>
                    <span class="mini-stat-label">إجمالي الخطابات</span>
                </div>
                <div class="mini-stat">
                    <span class="mini-stat-value">${stats.pending}</span>
                    <span class="mini-stat-label">قيد المعالجة</span>
                </div>
                <div class="mini-stat">
                    <span class="mini-stat-value">${stats.urgent}</span>
                    <span class="mini-stat-label">عاجلة</span>
                </div>
            </div>
        </div>
    `;

    // إدراجه في المكان المناسب
}
// عرض بطاقات الموظفين في لوحة التحكم
function renderDashboardEmployees(data) {
    const container = document.getElementById('dashEmployeeCards');
    if (!container) return;

    // تجميع البيانات حسب الموظف
    const employeeStats = {};
    data.forEach(item => {
        if (!employeeStats[item.employee_id]) {
            employeeStats[item.employee_id] = {
                name: item.employee_name,
                role: item.employee_role,
                total: 0,
                totalDuration: 0
            };
        }
        employeeStats[item.employee_id].total += parseInt(item.total_transactions) || 0;
        employeeStats[item.employee_id].totalDuration += parseInt(item.total_duration) || 0;
    });

    const roleColors = {
        'admin': '#667eea',
        'receiver': '#69db7c',
        'budget': '#3bc9db',
        'payment': '#ffa94d',
        'invoice': '#b197fc'
    };

    const roleNames = {
        'admin': 'مدير',
        'receiver': 'استلام',
        'budget': 'موازنة',
        'payment': 'دفع',
        'invoice': 'فوترة'
    };

    let html = '';

    Object.values(employeeStats).forEach(emp => {
        const avgTime = emp.total > 0 ? Math.round(emp.totalDuration / emp.total) : 0;
        const color = roleColors[emp.role] || '#667eea';
        const roleName = roleNames[emp.role] || emp.role;

        html += `
        <div class="dash-emp-card">
            <div class="dash-emp-avatar" style="background: ${color}20; color: ${color};">
                ${emp.name ? emp.name.charAt(0) : '؟'}
            </div>
            <div class="dash-emp-info">
                <span class="dash-emp-name">${emp.name}</span>
                <span class="dash-emp-role" style="color: ${color};">${roleName}</span>
            </div>
            <div class="dash-emp-stats">
                <span class="dash-emp-count">${emp.total}</span>
                <span class="dash-emp-time">${avgTime > 0 ? avgTime + ' د' : '-'}</span>
            </div>
        </div>`;
    });

    if (Object.keys(employeeStats).length === 0) {
        html = '<div class="empty-placeholder">لا توجد بيانات</div>';
    }

    container.innerHTML = html;
}

// تحميل أحداث لوحة التحكم
async function loadDashboardEvents() {
    const container = document.getElementById('dashEventsTimeline');
    if (!container) return;

    container.innerHTML = '<div class="loading-placeholder">جاري التحميل...</div>';

    try {
        const res = await fetch('api/?action=all_events&limit=15');
        const result = await res.json();

        if (result.success && result.data && result.data.length > 0) {
            const stageInfo = {
                'creation': { name: 'إنشاء', color: '#4dabf7', icon: '➕' },
                'receiving': { name: 'استلام', color: '#69db7c', icon: '📥' },
                'budget': { name: 'موازنة', color: '#3bc9db', icon: '💰' },
                'payment': { name: 'دفع', color: '#ffa94d', icon: '💳' },
                'invoice': { name: 'فوترة', color: '#b197fc', icon: '🧾' }
            };

            let html = '<div class="dash-timeline">';

            result.data.forEach(event => {
                const info = stageInfo[event.stage] || { name: event.stage, color: '#888', icon: '📋' };
                const duration = event.duration_from_previous;

                html += `
                <div class="dash-event-item">
                    <div class="dash-event-icon" style="background: ${info.color}20; color: ${info.color};">${info.icon}</div>
                    <div class="dash-event-content">
                        <div class="dash-event-header">
                            <span class="dash-event-tx">${event.transaction_number || '-'}</span>
                            <span class="dash-event-tx">${event.transaction_date || '-'}</span>
                            <span class="dash-event-stage" style="color: ${info.color};">${info.name}</span>
                        </div>
                        <div class="dash-event-status">
                            ${event.old_status ? `<span class="old">${event.old_status}</span> ← ` : ''}
                            <span class="new">${event.new_status || '-'}</span>
                            ${duration > 0 ? `<span class="duration">${formatDuration(duration)} </span>` : ''}
                        </div>
                        <div class="dash-event-footer">
                            <span>${event.employee_name || 'النظام'}</span>
                            <span>${formatTimeAgo(event.event_time)}</span>
                        </div>
                    </div>
                </div>`;
            });

            html += '</div>';
            container.innerHTML = html;
        } else {
            container.innerHTML = '<div class="empty-placeholder">لا توجد أحداث</div>';
        }
    } catch (e) {
        container.innerHTML = '<div class="empty-placeholder">خطأ في التحميل</div>';
    }
}

function formatDuration(minutes) {
    if (!minutes || minutes <= 0) return 'الآن';

    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    const mins = minutes % 60;

    let parts = [];

    if (days > 0) parts.push(`${days} يوم`);
    if (hours > 0) parts.push(`${hours} ساعة`);
    if (mins > 0 && days === 0) parts.push(`${mins} دقيقة`);

    return 'منذ ' + parts.join(' و ');
}


// تنسيق الوقت النسبي
function formatTimeAgo(datetime) {
    if (!datetime) return '';
    const date = new Date(datetime);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);

    if (diff < 60) return 'الآن';
    if (diff < 3600) return Math.floor(diff / 60) + ' د';
    if (diff < 86400) return Math.floor(diff / 3600) + ' س';
    return Math.floor(diff / 86400) + ' ي';
}

// فلترة المعاملات العاجلة
function filterUrgent(type, btn) {
    document.querySelectorAll('.urgent-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    document.querySelectorAll('.urgent-row').forEach(row => {
        if (type === 'all' || row.dataset.type === type) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
}

// رسم الرسم البياني الخطي
function renderLineChart() {
    const canvas = document.getElementById('lineChart');
    if (!canvas || !App.chartData.length) return;

    const ctx = canvas.getContext('2d');
    const data = App.chartData;

    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height - 20;

    const padding = { top: 20, right: 20, bottom: 40, left: 60 };
    const width = canvas.width - padding.left - padding.right;
    const height = canvas.height - padding.top - padding.bottom;

    const maxCount = Math.max(...data.map(d => d.count), 1);

    ctx.strokeStyle = 'rgba(71, 85, 105, 0.3)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = padding.top + (height / 4) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(canvas.width - padding.right, y);
        ctx.stroke();
    }

    ctx.strokeStyle = '#0ea5e9';
    ctx.lineWidth = 3;
    ctx.beginPath();
    data.forEach((d, i) => {
        const x = padding.left + (width / (data.length - 1 || 1)) * i;
        const y = padding.top + height - (d.count / maxCount) * height;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.fillStyle = '#0ea5e9';
    data.forEach((d, i) => {
        const x = padding.left + (width / (data.length - 1 || 1)) * i;
        const y = padding.top + height - (d.count / maxCount) * height;
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();
    });

    ctx.fillStyle = '#64748b';
    ctx.font = '12px Noto Sans Arabic';
    ctx.textAlign = 'center';
    data.forEach((d, i) => {
        const x = padding.left + (width / (data.length - 1 || 1)) * i;
        ctx.fillText(d.month, x, canvas.height - 10);
    });
}

// رسم الرسم الدائري
function renderPieChart() {
    const canvas = document.getElementById('pieChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height - 60;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(centerX, centerY) - 20;
    const innerRadius = radius * 0.6;

    const data = [
        { value: App.stats.paid || 0, color: '#10b981' },
        { value: (App.stats.total || 0) - (App.stats.paid || 0) - (App.stats.urgent || 0), color: '#0ea5e9' },
        { value: App.stats.urgent || 0, color: '#ef4444' }
    ];

    const total = data.reduce((sum, d) => sum + d.value, 0) || 1;
    let startAngle = -Math.PI / 2;

    data.forEach(d => {
        const sliceAngle = (d.value / total) * Math.PI * 2;

        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
        ctx.closePath();
        ctx.fillStyle = d.color;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#1e293b';
        ctx.fill();

        startAngle += sliceAngle;
    });

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 24px Noto Sans Arabic';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(App.stats.total || 0, centerX, centerY - 10);
    ctx.font = '12px Noto Sans Arabic';
    ctx.fillStyle = '#64748b';
    ctx.fillText('معاملة', centerX, centerY + 15);
}

// تحميل المعاملات
async function loadTransactions() {
    showLoading();

    try {
        const res = await fetch('api/?action=transactions');
        const data = await res.json();

        if (data.success) {
            App.transactions = data.data;
            renderTransactions();
        } else {
            showToast('خطأ في تحميل المعاملات', 'error');
        }
    } catch (error) {
        showToast('خطأ في الاتصال', 'error');
        console.error(error);
    }
}

// عرض المعاملات
function renderTransactions() {
    const html = `
        <div class="toolbar">
            <div class="toolbar-search">
                <div class="search-input">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="8"></circle>
                        <path d="m21 21-4.35-4.35"></path>
                    </svg>
                    <input type="text" id="searchInput" placeholder="بحث في المعاملات..." oninput="filterTransactions()">
                </div>
                <select id="statusFilter" class="filter-select" onchange="filterTransactions()">
                    <option value="">جميع الحالات</option>
                    <option value="عاجل">عاجل</option>
                    <option value="متابعة">يحتاج متابعة</option>
                    <option value="مكتمل">مكتمل</option>
                    <option value="تم الدفع">تم الدفع</option>
                    <option value="معلق">معلق</option>
                </select>
            </div>
            <button class="btn btn-primary" onclick="openAddModal()">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 5v14M5 12h14"></path>
                </svg>
                معاملة جديدة
            </button>
        </div>
        
        <div class="card">
            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>رقم المعاملة</th>
                            <th>التاريخ</th>
                            <th>النوع</th>
                            <th>الوصف</th>
                            <th>المبلغ</th>
                            <th class="th-green">الاستلام</th>
                            <th class="th-cyan">الموازنة</th>
                            <th class="th-orange">الدفع</th>
                            <th class="th-purple">الفوترة</th>
                            <th>التنبيه</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody id="transactionsBody">
                        ${renderTransactionRows(App.transactions)}
                    </tbody>
                </table>
            </div>
        </div>
    `;

    DOM.mainContent.innerHTML = html;
}

// ========== دالة عرض صفوف المعاملات ==========
function renderTransactionRows(transactions) {
    if (!transactions || !transactions.length) {
        return '<tr><td colspan="11" style="text-align: center; padding: 3rem; color: var(--text-muted);">لا توجد معاملات</td></tr>';
    }

    let html = '';

    for (let i = 0; i < transactions.length; i++) {
        const tx = transactions[i];
        const isExpanded = (App.expandedRow == tx.id);

        // صف المعاملة الرئيسي
        html += '<tr class="transaction-row ' + (isExpanded ? 'expanded' : '') + '" data-id="' + tx.id + '" onclick="toggleRow(' + tx.id + ')">';
        html += '<td><span class="tx-number">' + tx.transaction_number + '</span></td>';
        html += '<td>' + tx.transaction_date + '</td>';
        html += '<td><span class="tx-type">' + (tx.transaction_type || '—') + '</span></td>';
        html += '<td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + tx.description + '</td>';
        html += '<td><span class="tx-amount">' + formatNumber(tx.amount) + '<small>ر.س</small></span></td>';
        html += '<td>' + getStatusBadge(tx.receive_status) + '</td>';
        html += '<td>' + getStatusBadge(tx.budget_status) + '</td>';
        html += '<td>' + getStatusBadge(tx.payment_status) + '</td>';
        html += '<td>' + getStatusBadge(tx.invoice_status) + '</td>';
        html += '<td>' + getAlertBadge(tx.alert_type) + '</td>';
        html += '<td>';
        html += '<div style="display: flex; align-items: center; gap: 0.5rem;">';

        // زر استعراض PDF
        if (tx.attachment) {
            html += '<button class="btn-icon btn-pdf" onclick="event.stopPropagation(); openPDF(\'' + tx.attachment + '\')" title="استعراض PDF">';
            html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><line x1="10" y1="9" x2="8" y2="9"></line></svg>';
            html += '</button>';
        }

        html += '<button class="btn-icon" onclick="event.stopPropagation(); editTransaction(' + tx.id + ')" title="تعديل">';
        html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';
        html += '</button>';
        html += '<svg class="expand-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--text-muted); transition: transform 0.3s; ' + (isExpanded ? 'transform: rotate(180deg);' : '') + '">';
        html += '<polyline points="6 9 12 15 18 9"></polyline>';
        html += '</svg>';
        html += '</div>';
        html += '</td>';
        html += '</tr>';

        // صف التفاصيل الموسع
        if (isExpanded) {
            html += '<tr class="expanded-row">';
            html += '<td colspan="11" style="padding: 0;">';

            // معلومات الإنشاء
            html += '<div class="creation-info-bar" style="background: var(--bg-surface); padding: 0.75rem 1.5rem; border-bottom: 1px solid var(--border-color); display: flex; align-items: center; gap: 2rem; flex-wrap: wrap;">';
            html += '<div style="display: flex; align-items: center; gap: 0.5rem;">';
            html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-blue)" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg>';
            html += '<span style="color: var(--text-muted); font-size: 0.85rem;">أنشئت بواسطة:</span>';
            html += '<span style="color: var(--text-primary); font-weight: 600;">' + (tx.created_by_name || 'النظام') + '</span>';
            html += '</div>';
            html += '<div style="display: flex; align-items: center; gap: 0.5rem;">';
            html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-green)" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>';
            html += '<span style="color: var(--text-muted); font-size: 0.85rem;">وقت الإنشاء:</span>';
            html += '<span style="color: var(--text-primary); font-weight: 500;">' + formatCreationTime(tx.creation_time) + '</span>';
            html += '</div>';
            html += '</div>';

            html += '<div class="expanded-content four-columns">';

            // قسم الاستلام
            html += '<div class="detail-section receiving">';
            html += '<div class="detail-header green">';
            html += '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle></svg>';
            html += ' موظف الاستلام';
            html += '</div>';
            html += '<div class="detail-row"><span class="detail-label">الموظف:</span><span class="detail-value">' + (tx.receiver_name || '—') + '</span></div>';
            html += '<div class="detail-row"><span class="detail-label">التاريخ:</span><span class="detail-value">' + (tx.receive_date || '—') + '</span></div>';
            html += '<div class="detail-row"><span class="detail-label">الحالة:</span><span class="detail-value">' + getStatusBadge(tx.receive_status) + '</span></div>';
            html += '<div class="detail-row"><span class="detail-label">ملاحظات:</span><span class="detail-value">' + (tx.receive_notes || '—') + '</span></div>';
            html += '</div>';

            // قسم الموازنة (جديد)
            html += '<div class="detail-section budget">';
            html += '<div class="detail-header cyan">';
            html += '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>';
            html += ' موظف الموازنة';
            html += '</div>';
            html += '<div class="detail-row"><span class="detail-label">الموظف:</span><span class="detail-value">' + (tx.budget_employee_name || '—') + '</span></div>';
            html += '<div class="detail-row"><span class="detail-label">التاريخ:</span><span class="detail-value">' + (tx.budget_date || '—') + '</span></div>';
            html += '<div class="detail-row"><span class="detail-label">رمز الموازنة:</span><span class="detail-value" style="color: var(--accent-cyan); font-family: monospace;">' + (tx.budget_code || '—') + '</span></div>';
            html += '<div class="detail-row"><span class="detail-label">الحالة:</span><span class="detail-value">' + getStatusBadge(tx.budget_status) + '</span></div>';
            html += '<div class="detail-row"><span class="detail-label">ملاحظات:</span><span class="detail-value">' + (tx.budget_notes || '—') + '</span></div>';
            html += '</div>';

            // قسم الدفع
            html += '<div class="detail-section payment">';
            html += '<div class="detail-header orange">';
            html += '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>';
            html += ' موظف الدفع';
            html += '</div>';
            html += '<div class="detail-row"><span class="detail-label">الموظف:</span><span class="detail-value">' + (tx.payment_employee_name || '—') + '</span></div>';
            html += '<div class="detail-row"><span class="detail-label">التاريخ:</span><span class="detail-value">' + (tx.payment_date || '—') + '</span></div>';
            html += '<div class="detail-row"><span class="detail-label">الطريقة:</span><span class="detail-value">' + (tx.payment_method || '—') + '</span></div>';
            html += '<div class="detail-row"><span class="detail-label">الحالة:</span><span class="detail-value">' + getStatusBadge(tx.payment_status) + '</span></div>';
            html += '<div class="detail-row"><span class="detail-label">المرجع:</span><span class="detail-value" style="color: var(--accent-blue); font-family: monospace;">' + (tx.reference_number || '—') + '</span></div>';
            html += '<div class="detail-row"><span class="detail-label">ملاحظات:</span><span class="detail-value">' + (tx.payment_notes || '—') + '</span></div>';
            html += '</div>';

            // قسم الفوترة
            html += '<div class="detail-section invoice">';
            html += '<div class="detail-header purple">';
            html += '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>';
            html += ' موظف الفوترة';
            html += '</div>';
            html += '<div class="detail-row"><span class="detail-label">الموظف:</span><span class="detail-value">' + (tx.invoice_employee_name || '—') + '</span></div>';
            html += '<div class="detail-row"><span class="detail-label">رقم الفاتورة:</span><span class="detail-value" style="color: var(--accent-blue); font-family: monospace;">' + (tx.invoice_number || '—') + '</span></div>';
            html += '<div class="detail-row"><span class="detail-label">التاريخ:</span><span class="detail-value">' + (tx.invoice_date || '—') + '</span></div>';
            html += '<div class="detail-row"><span class="detail-label">الحالة:</span><span class="detail-value">' + getStatusBadge(tx.invoice_status) + '</span></div>';
            html += '<div class="detail-row"><span class="detail-label">التنبيه:</span><span class="detail-value">' + getAlertBadge(tx.alert_type) + '</span></div>';
            html += '<div class="detail-row"><span class="detail-label">ملاحظات:</span><span class="detail-value">' + (tx.invoice_notes || '—') + '</span></div>';
            html += '</div>';

            html += '</div>';

            // قسم سجل الأحداث (Timeline)
            html += '<div class="events-timeline-section">';
            html += '<div class="events-header" onclick="loadTransactionEvents(' + tx.id + ')">';
            html += '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>';
            html += ' سجل الأحداث والتغييرات';
            html += '<span class="events-toggle-icon">▼</span>';
            html += '</div>';
            html += '<div id="events-container-' + tx.id + '" class="events-container" style="display: none;"></div>';
            html += '</div>';

            // قسم المرفقات
            html += '<div class="attachment-section">';
            html += '<div class="attachment-header">';
            html += '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>';
            html += ' المرفقات';
            html += '</div>';

            if (tx.attachment) {
                html += '<div class="attachment-file">';
                html += '<div class="attachment-info">';
                html += '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>';
                html += '<span>' + (tx.attachment_name || 'مستند.pdf') + '</span>';
                html += '</div>';
                html += '<div class="attachment-actions">';
                html += '<button class="btn btn-sm btn-primary" onclick="event.stopPropagation(); openPDF(\'' + tx.attachment + '\')">';
                html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
                html += ' استعراض';
                html += '</button>';
                html += '<button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); deleteAttachment(' + tx.id + ')">';
                html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
                html += ' حذف';
                html += '</button>';
                html += '</div>';
                html += '</div>';
            } else {
                html += '<div class="no-attachment">';
                html += '<p>لا يوجد مرفق</p>';
                html += '<button class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); uploadAttachment(' + tx.id + ')">';
                html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>';
                html += ' رفع ملف PDF';
                html += '</button>';
                html += '</div>';
            }

            html += '</div>';

            html += '</td>';
            html += '</tr>';
        }
    }

    return html;
}

// ========== دالة تبديل الصف الموسع ==========
function toggleRow(id) {
    if (App.expandedRow == id) {
        App.expandedRow = null;
    } else {
        App.expandedRow = id;
    }

    const tbody = document.getElementById('transactionsBody');
    if (tbody) {
        tbody.innerHTML = renderTransactionRows(App.transactions);
    }
}

// فلترة المعاملات
function filterTransactions() {
    const search = document.getElementById('searchInput')?.value.toLowerCase() || '';
    const status = document.getElementById('statusFilter')?.value || '';

    const filtered = App.transactions.filter(tx => {
        const matchSearch = !search ||
            tx.transaction_number.toLowerCase().includes(search) ||
            tx.description.toLowerCase().includes(search) ||
            (tx.transaction_type && tx.transaction_type.toLowerCase().includes(search));

        const matchStatus = !status ||
            tx.alert_type === status ||
            tx.payment_status === status ||
            tx.receive_status === status;

        return matchSearch && matchStatus;
    });

    App.expandedRow = null;
    document.getElementById('transactionsBody').innerHTML = renderTransactionRows(filtered);
}

// فتح مودال إضافة معاملة
async function openAddModal() {
    try {
        const [typesRes, employeesRes] = await Promise.all([
            fetch('api/?action=types'),
            fetch('api/?action=employees')
        ]);

        const types = await typesRes.json();

        let typeOptions = '';
        if (types.success) {
            types.data.forEach(t => {
                typeOptions += '<option value="' + t.id + '">' + t.name + '</option>';
            });
        }

        // التاريخ والوقت الحالي
        const now = new Date();
        const dateStr = now.toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const timeStr = now.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });

        DOM.modalTitle.textContent = 'إضافة معاملة جديدة';
        DOM.modalBody.innerHTML = `
            <form id="addForm" onsubmit="submitAddForm(event)" enctype="multipart/form-data">
                <div class="auto-date-info" style="background: var(--bg-surface); padding: 1rem; border-radius: 10px; margin-bottom: 1.5rem; display: flex; align-items: center; gap: 1rem;">
                    <div style="width: 45px; height: 45px; background: var(--btn-primary-bg); border-radius: 10px; display: flex; align-items: center; justify-content: center;">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--btn-primary-text)" stroke-width="2">
                            <circle cx="12" cy="12" r="10"></circle>
                            <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                    </div>
                    <div>
                        <div style="font-size: 0.8rem; color: var(--text-muted);">تاريخ ووقت الإنشاء</div>
                        <div style="font-weight: 600; color: var(--text-primary);">${dateStr} - ${timeStr}</div>
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">نوع المعاملة</label>
                    <select class="form-select" name="type_id" required>
                        <option value="">اختر النوع</option>
                        ${typeOptions}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">الوصف</label>
                    <textarea class="form-textarea" name="description" placeholder="وصف المعاملة..." required></textarea>
                </div>
                <div class="form-group">
                    <label class="form-label">المبلغ (ر.س)</label>
                    <input type="number" class="form-input" name="amount" step="0.01" min="0" placeholder="0.00" required>
                </div>
                <div class="form-group">
                    <label class="form-label">إرفاق ملف PDF (اختياري)</label>
                    <div class="file-upload-wrapper">
                        <input type="file" class="file-input" name="attachment" id="attachmentInput" accept=".pdf,application/pdf" onchange="handleFileSelect(this)">
                        <label for="attachmentInput" class="file-upload-label">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                <polyline points="14 2 14 8 20 8"></polyline>
                                <line x1="12" y1="18" x2="12" y2="12"></line>
                                <line x1="9" y1="15" x2="15" y2="15"></line>
                            </svg>
                            <span id="fileName">اختر ملف PDF أو اسحبه هنا</span>
                        </label>
                    </div>
                    <p class="file-hint">الحد الأقصى: 10 ميجابايت</p>
                </div>
                <div class="modal-footer" style="padding: 0; border: none; margin-top: 1.5rem;">
                    <button type="button" class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
                    <button type="submit" class="btn btn-primary">إضافة المعاملة</button>
                </div>
            </form>
        `;

        openModal();
    } catch (error) {
        showToast('خطأ في تحميل البيانات', 'error');
    }
}

// معالجة اختيار الملف
function handleFileSelect(input) {
    const fileName = document.getElementById('fileName');
    if (input.files && input.files[0]) {
        const file = input.files[0];
        if (file.type !== 'application/pdf') {
            showToast('يرجى اختيار ملف PDF فقط', 'error');
            input.value = '';
            fileName.textContent = 'اختر ملف PDF أو اسحبه هنا';
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            showToast('حجم الملف كبير جداً. الحد الأقصى 10 ميجابايت', 'error');
            input.value = '';
            fileName.textContent = 'اختر ملف PDF أو اسحبه هنا';
            return;
        }
        fileName.textContent = file.name;
    } else {
        fileName.textContent = 'اختر ملف PDF أو اسحبه هنا';
    }
}

// إرسال نموذج الإضافة
async function submitAddForm(e) {
    e.preventDefault();

    const form = e.target;
    const formData = new FormData(form);

    try {
        const res = await fetch('api/?action=add', {
            method: 'POST',
            body: formData
        });

        const result = await res.json();

        if (result.success) {
            showToast('تم إضافة المعاملة بنجاح', 'success');
            closeModal();
            loadTransactions();
        } else {
            showToast(result.message || 'خطأ في الإضافة', 'error');
        }
    } catch (error) {
        showToast('خطأ في الاتصال', 'error');
    }
}

// فتح ملف PDF
function openPDF(path) {
    if (path) {
        window.open(path, '_blank');
    }
}

// تحميل وعرض أحداث المعاملة
async function loadTransactionEvents(transactionId) {
    const container = document.getElementById('events-container-' + transactionId);
    if (!container) return;

    // Toggle visibility
    if (container.style.display === 'none') {
        container.style.display = 'block';
        container.innerHTML = '<div class="loading-events">جاري التحميل...</div>';

        try {
            const res = await fetch('api/?action=transaction_events&transaction_id=' + transactionId);
            const result = await res.json();

            if (result.success && result.data.length > 0) {
                let html = '<div class="events-timeline">';

                const stageNames = {
                    'creation': 'الإنشاء',
                    'receiving': 'الاستلام',
                    'budget': 'الموازنة',
                    'payment': 'الدفع',
                    'invoice': 'الفوترة'
                };

                const stageColors = {
                    'creation': '#4dabf7',
                    'receiving': '#69db7c',
                    'budget': '#3bc9db',
                    'payment': '#ffa94d',
                    'invoice': '#b197fc'
                };

                result.data.forEach((event, index) => {
                    const stageName = stageNames[event.stage] || event.stage;
                    const stageColor = stageColors[event.stage] || '#888';
                    const duration = event.duration_from_previous;
                    const durationText = duration !== null ? formatEventDuration(duration) : '';

                    html += '<div class="event-item">';
                    html += '<div class="event-dot" style="background: ' + stageColor + ';"></div>';
                    html += '<div class="event-line"></div>';
                    html += '<div class="event-content">';

                    // Header
                    html += '<div class="event-header">';
                    html += '<span class="event-stage" style="background: ' + stageColor + ';">' + stageName + '</span>';
                    if (durationText) {
                        html += '<span class="event-duration">' + durationText + '</span>';
                    }
                    html += '</div>';

                    // Status change
                    html += '<div class="event-status-change">';
                    if (event.old_status && event.new_status) {
                        html += '<span class="old-status">' + event.old_status + '</span>';
                        html += '<span class="status-arrow">←</span>';
                        html += '<span class="new-status">' + event.new_status + '</span>';
                    } else if (event.new_status) {
                        html += '<span class="new-status">' + event.new_status + '</span>';
                    }
                    html += '</div>';

                    // Notes (reason)
                    if (event.notes) {
                        html += '<div class="event-notes">';
                        html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';
                        html += '<span>' + event.notes + '</span>';
                        html += '</div>';
                    }

                    // Footer (employee & time)
                    html += '<div class="event-footer">';
                    html += '<span class="event-employee">';
                    html += '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>';
                    html += ' ' + (event.employee_name || 'النظام');
                    html += '</span>';
                    html += '<span class="event-time">' + formatEventTime(event.event_time) + '</span>';
                    html += '</div>';

                    html += '</div>'; // event-content
                    html += '</div>'; // event-item
                });

                html += '</div>';
                container.innerHTML = html;
            } else {
                container.innerHTML = '<div class="no-events">لا توجد أحداث مسجلة</div>';
            }
        } catch (error) {
            container.innerHTML = '<div class="error-events">خطأ في تحميل الأحداث</div>';
        }
    } else {
        container.style.display = 'none';
    }
}

// تنسيق مدة الحدث
function formatEventDuration(minutes) {
    if (minutes === null || minutes === undefined) return '';
    if (minutes === 0) return 'فوري';
    if (minutes < 60) return minutes + ' دقيقة';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours < 24) {
        return hours + ' ساعة' + (mins > 0 ? ' و ' + mins + ' دقيقة' : '');
    }
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return days + ' يوم' + (remainingHours > 0 ? ' و ' + remainingHours + ' ساعة' : '');
}

// تنسيق وقت الحدث
function formatEventTime(datetime) {
    if (!datetime) return '';
    const date = new Date(datetime);
    const options = {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    };
    return date.toLocaleDateString('ar-SA', options);
}

// رفع مرفق لمعاملة موجودة
async function uploadAttachment(transactionId) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,application/pdf';

    input.onchange = async function () {
        if (input.files && input.files[0]) {
            const file = input.files[0];

            if (file.type !== 'application/pdf') {
                showToast('يرجى اختيار ملف PDF فقط', 'error');
                return;
            }

            if (file.size > 10 * 1024 * 1024) {
                showToast('حجم الملف كبير جداً', 'error');
                return;
            }

            const formData = new FormData();
            formData.append('transaction_id', transactionId);
            formData.append('attachment', file);

            try {
                const res = await fetch('api/?action=upload_attachment', {
                    method: 'POST',
                    body: formData
                });

                const result = await res.json();

                if (result.success) {
                    showToast('تم رفع الملف بنجاح', 'success');
                    loadTransactions();
                } else {
                    showToast(result.message || 'خطأ في رفع الملف', 'error');
                }
            } catch (error) {
                showToast('خطأ في الاتصال', 'error');
            }
        }
    };

    input.click();
}

// حذف مرفق
async function deleteAttachment(transactionId) {
    if (!confirm('هل أنت متأكد من حذف المرفق؟')) return;

    try {
        const res = await fetch('api/?action=delete_attachment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transaction_id: transactionId })
        });

        const result = await res.json();

        if (result.success) {
            showToast('تم حذف المرفق', 'success');
            loadTransactions();
        } else {
            showToast(result.message || 'خطأ في الحذف', 'error');
        }
    } catch (error) {
        showToast('خطأ في الاتصال', 'error');
    }
}

// تعديل معاملة
async function editTransaction(id) {
    const tx = App.transactions.find(t => t.id == id);
    if (!tx) return;

    App.editingTransaction = tx;

    // الحصول على صلاحية المستخدم
    const userRole = (typeof currentUser !== 'undefined') ? currentUser.role : '';

    try {
        const employeesRes = await fetch('api/?action=employees');
        const employees = await employeesRes.json();

        let receiversOptions = '';
        let budgetOptions = '';
        let paymentOptions = '';
        let invoiceOptions = '';

        if (employees.success) {
            employees.data.forEach(e => {
                if (e.role === 'receiver') {
                    receiversOptions += '<option value="' + e.id + '" ' + (tx.receiver_name === e.name ? 'selected' : '') + '>' + e.name + '</option>';
                }
                if (e.role === 'budget') {
                    budgetOptions += '<option value="' + e.id + '" ' + (tx.budget_employee_name === e.name ? 'selected' : '') + '>' + e.name + '</option>';
                }
                if (e.role === 'payment') {
                    paymentOptions += '<option value="' + e.id + '" ' + (tx.payment_employee_name === e.name ? 'selected' : '') + '>' + e.name + '</option>';
                }
                if (e.role === 'invoice') {
                    invoiceOptions += '<option value="' + e.id + '" ' + (tx.invoice_employee_name === e.name ? 'selected' : '') + '>' + e.name + '</option>';
                }
            });
        }

        // تحديد التبويبات المرئية حسب الصلاحية
        const showReceiving = (userRole === 'receiver' || userRole === '' || userRole === 'admin');
        const showBudget = (userRole === 'budget' || userRole === '' || userRole === 'admin');
        const showPayment = (userRole === 'payment' || userRole === '' || userRole === 'admin');
        const showInvoice = (userRole === 'invoice' || userRole === '' || userRole === 'admin');

        // تحديد التبويب النشط الأول
        let activeTab = '';
        if (showReceiving) activeTab = 'receiving';
        else if (showBudget) activeTab = 'budget';
        else if (showPayment) activeTab = 'payment';
        else if (showInvoice) activeTab = 'invoice';

        DOM.modalTitle.textContent = 'تعديل المعاملة ' + tx.transaction_number;

        // بناء التبويبات
        let tabsHtml = '<div class="modal-tabs">';
        if (showReceiving) tabsHtml += '<button type="button" class="modal-tab green ' + (activeTab === 'receiving' ? 'active' : '') + '" onclick="switchModalTab(\'receiving\', this)">الاستلام</button>';
        if (showBudget) tabsHtml += '<button type="button" class="modal-tab cyan ' + (activeTab === 'budget' ? 'active' : '') + '" onclick="switchModalTab(\'budget\', this)">الموازنة</button>';
        if (showPayment) tabsHtml += '<button type="button" class="modal-tab orange ' + (activeTab === 'payment' ? 'active' : '') + '" onclick="switchModalTab(\'payment\', this)">الدفع</button>';
        if (showInvoice) tabsHtml += '<button type="button" class="modal-tab purple ' + (activeTab === 'invoice' ? 'active' : '') + '" onclick="switchModalTab(\'invoice\', this)">الفوترة</button>';
        tabsHtml += '</div>';

        // بناء المحتوى
        let contentHtml = '';

        // تبويب الاستلام
        if (showReceiving) {
            contentHtml += `
            <div id="tab-receiving" class="tab-content" style="${activeTab === 'receiving' ? '' : 'display: none;'}">
                <form id="receivingForm" onsubmit="submitUpdateForm(event, 'receiving')">
                    <input type="hidden" name="transaction_id" value="${tx.id}">
                    <div class="auto-employee-info">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                        <span>سيتم تسجيل التحديث باسمك وبالوقت الحالي تلقائياً</span>
                    </div>
                    <div class="form-group">
                        <label class="form-label">الحالة</label>
                        <select class="form-select" name="status">
                            <option value="معلق" ${tx.receive_status === 'معلق' ? 'selected' : ''}>معلق</option>
                            <option value="مستلم" ${tx.receive_status === 'مستلم' ? 'selected' : ''}>مستلم</option>
                            <option value="قيد المراجعة" ${tx.receive_status === 'قيد المراجعة' ? 'selected' : ''}>قيد المراجعة</option>
                            <option value="مرفوض" ${tx.receive_status === 'مرفوض' ? 'selected' : ''}>مرفوض</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">ملاحظات</label>
                        <textarea class="form-textarea" name="notes">${tx.receive_notes || ''}</textarea>
                    </div>
                    <div class="modal-footer" style="padding: 0; border: none; margin-top: 1.5rem;">
                        <button type="button" class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
                        <button type="submit" class="btn btn-primary">حفظ التغييرات</button>
                    </div>
                </form>
            </div>`;
        }

        // تبويب الموازنة
        if (showBudget) {
            contentHtml += `
            <div id="tab-budget" class="tab-content" style="${activeTab === 'budget' ? '' : 'display: none;'}">
                <form id="budgetForm" onsubmit="submitUpdateForm(event, 'budget')">
                    <input type="hidden" name="transaction_id" value="${tx.id}">
                    <div class="auto-employee-info">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                        <span>سيتم تسجيل التحديث باسمك وبالوقت الحالي تلقائياً</span>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label class="form-label">رمز الموازنة</label>
                            <input type="text" class="form-input" name="budget_code" value="${tx.budget_code || ''}" placeholder="BUD-XXXX">
                        </div>
                        <div class="form-group">
                            <label class="form-label">الحالة</label>
                            <select class="form-select" name="status">
                                <option value="معلق" ${tx.budget_status === 'معلق' ? 'selected' : ''}>معلق</option>
                                <option value="قيد المراجعة" ${tx.budget_status === 'قيد المراجعة' ? 'selected' : ''}>قيد المراجعة</option>
                                <option value="معتمد" ${tx.budget_status === 'معتمد' ? 'selected' : ''}>معتمد</option>
                                <option value="مرفوض" ${tx.budget_status === 'مرفوض' ? 'selected' : ''}>مرفوض</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">ملاحظات</label>
                        <textarea class="form-textarea" name="notes">${tx.budget_notes || ''}</textarea>
                    </div>
                    <div class="modal-footer" style="padding: 0; border: none; margin-top: 1.5rem;">
                        <button type="button" class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
                        <button type="submit" class="btn btn-primary">حفظ التغييرات</button>
                    </div>
                </form>
            </div>`;
        }

        // تبويب الدفع
        // تبويب الدفع
        if (showPayment) {
            contentHtml += `
    <div id="tab-payment" class="tab-content" style="${activeTab === 'payment' ? '' : 'display: none;'}">
        <form id="paymentForm" onsubmit="submitUpdateForm(event, 'payment')">
            <input type="hidden" name="transaction_id" value="${tx.id}">
            <div class="auto-employee-info">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                <span>سيتم تسجيل التحديث باسمك وبالوقت الحالي تلقائياً</span>
            </div>
            <div class="payment-method-info" style="background: linear-gradient(135deg, var(--accent-orange), #ff8c00); color: #000; padding: 0.75rem 1rem; border-radius: 8px; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 4H3a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"></path><path d="M1 10h22"></path></svg>
                <span><strong>طريقة الدفع:</strong> تحويل بنكي</span>
            </div>
            <div class="form-group">
                <label class="form-label">الحالة</label>
                <select class="form-select" name="status">
                    <option value="معلق" ${tx.payment_status === 'معلق' ? 'selected' : ''}>معلق</option>
                    <option value="قيد المعالجة" ${tx.payment_status === 'قيد المعالجة' ? 'selected' : ''}>قيد المعالجة</option>
                    <option value="تم الدفع" ${tx.payment_status === 'تم الدفع' ? 'selected' : ''}>تم الدفع</option>
                    <option value="مرفوض" ${tx.payment_status === 'مرفوض' ? 'selected' : ''}>مرفوض</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">رقم المرجع</label>
                <input type="text" class="form-input" name="reference" value="${tx.reference_number || ''}" placeholder="REF-XXXX">
            </div>
            <div class="form-group">
                <label class="form-label">ملاحظات</label>
                <textarea class="form-textarea" name="notes">${tx.payment_notes || ''}</textarea>
            </div>
            <div class="modal-footer" style="padding: 0; border: none; margin-top: 1.5rem;">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
                <button type="submit" class="btn btn-primary">حفظ التغييرات</button>
            </div>
        </form>
    </div>`;
        }

        // تبويب الفوترة
        if (showInvoice) {
            contentHtml += `
            <div id="tab-invoice" class="tab-content" style="${activeTab === 'invoice' ? '' : 'display: none;'}">
                <form id="invoiceForm" onsubmit="submitUpdateForm(event, 'invoice')">
                    <input type="hidden" name="transaction_id" value="${tx.id}">
                    <div class="auto-employee-info">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                        <span>سيتم تسجيل التحديث باسمك وبالوقت الحالي تلقائياً</span>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label class="form-label">رقم الفاتورة</label>
                            <input type="text" class="form-input" name="invoice_number" value="${tx.invoice_number || ''}" placeholder="INV-XXXX">
                        </div>
                        <div class="form-group">
                            <label class="form-label">الحالة</label>
                            <select class="form-select" name="status">
                                <option value="">اختر الحالة</option>
                                <option value="صدرت الفاتورة" ${tx.invoice_status === 'صدرت الفاتورة' ? 'selected' : ''}>صدرت الفاتورة</option>
                                <option value="بدون فاتورة" ${tx.invoice_status === 'بدون فاتورة' ? 'selected' : ''}>بدون فاتورة</option>
                                <option value="قيد الإصدار" ${tx.invoice_status === 'قيد الإصدار' ? 'selected' : ''}>قيد الإصدار</option>
                                <option value="ملغاة" ${tx.invoice_status === 'ملغاة' ? 'selected' : ''}>ملغاة</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">نوع التنبيه</label>
                        <select class="form-select" name="alert_type">
                            <option value="انتظار" ${tx.alert_type === 'انتظار' ? 'selected' : ''}>⏳ انتظار</option>
                            <option value="متابعة" ${tx.alert_type === 'متابعة' ? 'selected' : ''}>⚠️ يحتاج متابعة</option>
                            <option value="عاجل" ${tx.alert_type === 'عاجل' ? 'selected' : ''}>🔴 عاجل</option>
                            <option value="مكتمل" ${tx.alert_type === 'مكتمل' ? 'selected' : ''}>✅ مكتمل</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">ملاحظات</label>
                        <textarea class="form-textarea" name="notes">${tx.invoice_notes || ''}</textarea>
                    </div>
                    <div class="modal-footer" style="padding: 0; border: none; margin-top: 1.5rem;">
                        <button type="button" class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
                        <button type="submit" class="btn btn-primary">حفظ التغييرات</button>
                    </div>
                </form>
            </div>`;
        }

        DOM.modalBody.innerHTML = tabsHtml + contentHtml;

        openModal();
    } catch (error) {
        showToast('خطأ في تحميل البيانات', 'error');
    }
}

// تبديل تبويبات المودال
function switchModalTab(tab, btn) {
    document.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');

    btn.classList.add('active');
    document.getElementById('tab-' + tab).style.display = 'block';
}

// إرسال نموذج التحديث
async function submitUpdateForm(e, type) {
    e.preventDefault();

    const form = e.target;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    const actionMap = {
        'receiving': 'update_receiving',
        'budget': 'update_budget',
        'payment': 'update_payment',
        'invoice': 'update_invoice'
    };

    try {
        const res = await fetch('api/?action=' + actionMap[type], {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        const result = await res.json();

        if (result.success) {
            showToast('تم الحفظ بنجاح', 'success');
            closeModal();
            loadTransactions();
        } else {
            showToast(result.message || 'خطأ في الحفظ', 'error');
        }
    } catch (error) {
        showToast('خطأ في الاتصال', 'error');
    }
}

// عرض معاملة
function viewTransaction(id) {
    switchTab('transactions');
    setTimeout(function () {
        App.expandedRow = id;
        const tbody = document.getElementById('transactionsBody');
        if (tbody) {
            tbody.innerHTML = renderTransactionRows(App.transactions);
        }
    }, 300);
}

// ========== دوال مساعدة ==========
function getStatusBadge(status) {
    if (!status) return '<span class="badge badge-slate"><span class="badge-dot"></span>—</span>';

    let color = 'slate';
    if (status === 'مستلم' || status === 'تم الدفع' || status === 'صدرت الفاتورة' || status === 'معتمد') color = 'green';
    else if (status === 'قيد المراجعة' || status === 'بدون فاتورة') color = 'amber';
    else if (status === 'قيد المعالجة' || status === 'قيد الإصدار') color = 'blue';
    else if (status === 'مرفوض' || status === 'ملغاة') color = 'red';

    return '<span class="badge badge-' + color + '"><span class="badge-dot"></span>' + status + '</span>';
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

// تحميل الوضع عند بدء الصفحة
document.addEventListener('DOMContentLoaded', function () {
    loadSavedTheme();
});

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

function getAlertBadge(alert) {
    if (!alert) return '<span class="badge badge-slate"><span class="badge-dot"></span>—</span>';

    let color = 'slate';
    let icon = '⏳';

    if (alert === 'عاجل') { color = 'red'; icon = '🔴'; }
    else if (alert === 'متابعة') { color = 'amber'; icon = '⚠️'; }
    else if (alert === 'مكتمل') { color = 'green'; icon = '✅'; }

    return '<span class="badge badge-' + color + '">' + icon + ' ' + alert + '</span>';
}

function formatMoney(amount) {
    return new Intl.NumberFormat('en-US').format(amount || 0) + ' ر.س';
}

function formatNumber(amount) {
    return new Intl.NumberFormat('en-US').format(amount || 0);
}

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

function showLoading() {
    DOM.mainContent.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
}

function openModal() {
    DOM.modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    DOM.modal.classList.remove('active');
    document.body.style.overflow = '';
    App.editingTransaction = null;
}

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
async function loadSettingsPage() {
    DOM.mainContent.innerHTML = `
        <div class="settings-page">
            <div class="settings-sidebar">
                <button class="settings-nav-btn active" onclick="showSettingsSection('employees', this)">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                        <circle cx="9" cy="7" r="4"></circle>
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                        <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                    </svg>
                    الموظفين
                </button>
                <button class="settings-nav-btn" onclick="showSettingsSection('performance', this)">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                    أداء الموظفين
                </button>
                <button class="settings-nav-btn" onclick="showSettingsSection('types', this)">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="8" y1="6" x2="21" y2="6"></line>
                        <line x1="8" y1="12" x2="21" y2="12"></line>
                        <line x1="8" y1="18" x2="21" y2="18"></line>
                        <line x1="3" y1="6" x2="3.01" y2="6"></line>
                        <line x1="3" y1="12" x2="3.01" y2="12"></line>
                        <line x1="3" y1="18" x2="3.01" y2="18"></line>
                    </svg>
                    أنواع المعاملات
                </button>
                <button class="settings-nav-btn" onclick="showSettingsSection('all-transactions', this)">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                    </svg>
                    جميع المعاملات
                </button>
                <button class="settings-nav-btn" onclick="showSettingsSection('system', this)">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="3"></circle>
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                    </svg>
                    النظام
                </button>
            </div>
            <div class="settings-content" id="settingsContent">
                <!-- سيتم تحميل المحتوى هنا -->
            </div>
        </div>
    `;

    // تحميل الموظفين افتراضياً
    await loadSettingsEmployees();
    showSettingsSection('employees', document.querySelector('.settings-nav-btn'));
}

// عرض قسم في الإعدادات
function showSettingsSection(section, btn) {
    // تحديث الأزرار
    document.querySelectorAll('.settings-nav-btn').forEach(function (b) {
        b.classList.remove('active');
    });
    if (btn) btn.classList.add('active');

    var content = document.getElementById('settingsContent');

    if (section === 'employees') {
        renderEmployeesSection();
    } else if (section === 'performance') {
        renderPerformanceSection();
    } else if (section === 'types') {
        renderTypesSection();
    } else if (section === 'all-transactions') {
        renderAllTransactionsSection();
    } else if (section === 'system') {
        renderSystemSection();
    }
}

// ========== قسم الموظفين ==========
async function loadSettingsEmployees() {
    try {
        var res = await fetch('api/?action=employees');
        var data = await res.json();
        if (data.success) {
            SettingsData.employees = data.data;
        }
    } catch (e) {
        console.error(e);
    }
}

function renderEmployeesSection() {
    var content = document.getElementById('settingsContent');

    var html = '<div class="settings-section-header">';
    html += '<h2>إدارة الموظفين</h2>';
    html += '<button class="btn btn-primary" onclick="openAddEmployeeModal()">';
    html += '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>';
    html += ' إضافة موظف';
    html += '</button>';
    html += '</div>';

    // فلتر الأقسام
    html += '<div class="filter-tabs">';
    html += '<button class="filter-tab ' + (SettingsData.currentFilter === 'all' ? 'active' : '') + '" onclick="filterEmployees(\'all\', this)">الكل</button>';
    html += '<button class="filter-tab ' + (SettingsData.currentFilter === 'admin' ? 'active' : '') + '" onclick="filterEmployees(\'admin\', this)">المديرين</button>';
    html += '<button class="filter-tab ' + (SettingsData.currentFilter === 'receiver' ? 'active' : '') + '" onclick="filterEmployees(\'receiver\', this)">الاستلام</button>';
    html += '<button class="filter-tab ' + (SettingsData.currentFilter === 'budget' ? 'active' : '') + '" onclick="filterEmployees(\'budget\', this)">الموازنة</button>';
    html += '<button class="filter-tab ' + (SettingsData.currentFilter === 'payment' ? 'active' : '') + '" onclick="filterEmployees(\'payment\', this)">الدفع</button>';
    html += '<button class="filter-tab ' + (SettingsData.currentFilter === 'invoice' ? 'active' : '') + '" onclick="filterEmployees(\'invoice\', this)">الفوترة</button>';
    html += '</div>';

    // بطاقات الموظفين
    html += '<div class="employees-grid">';

    var filtered = SettingsData.employees;
    if (SettingsData.currentFilter !== 'all') {
        filtered = SettingsData.employees.filter(function (e) {
            return e.role === SettingsData.currentFilter;
        });
    }

    if (filtered.length === 0) {
        html += '<div class="empty-state">لا يوجد موظفين</div>';
    } else {
        for (var i = 0; i < filtered.length; i++) {
            var emp = filtered[i];
            html += '<div class="employee-card">';
            html += '<div class="employee-avatar">' + emp.name.charAt(0) + '</div>';
            html += '<div class="employee-info">';
            html += '<h4>' + emp.name + '</h4>';
            html += '<span class="role-badge role-' + emp.role + '">' + getRoleName(emp.role) + '</span>';
            html += '<p class="employee-contact">' + (emp.employee_number || '—') + '</p>';
            html += '<p class="employee-contact">' + (emp.phone || '—') + '</p>';
            html += '</div>';
            html += '<div class="employee-actions">';
            html += '<button class="btn-icon-sm" onclick="editEmployee(' + emp.id + ')" title="تعديل"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>';
            html += '<button class="btn-icon-sm btn-danger-icon" onclick="deleteEmployee(' + emp.id + ', \'' + emp.name + '\')" title="حذف"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>';
            html += '</div>';
            html += '</div>';
        }
    }

    html += '</div>';
    content.innerHTML = html;
}

function getRoleName(role) {
    var roles = {
        'admin': 'مدير النظام',
        'receiver': 'الاستلام',
        'budget': 'الموازنة',
        'payment': 'الدفع',
        'invoice': 'الفوترة'
    };
    return roles[role] || role;
}

function filterEmployees(role, btn) {
    SettingsData.currentFilter = role;
    document.querySelectorAll('.filter-tab').forEach(function (t) {
        t.classList.remove('active');
    });
    btn.classList.add('active');
    renderEmployeesSection();
}

function openAddEmployeeModal() {
    DOM.modalTitle.textContent = 'إضافة موظف جديد';
    DOM.modalBody.innerHTML = `
        <form id="employeeForm" onsubmit="saveEmployee(event)">
            <input type="hidden" name="id" id="empId" value="">
            <div class="form-group">
                <label class="form-label">اسم الموظف</label>
                <input type="text" class="form-input" name="name" id="empName" required>
            </div>
            <div class="form-group">
                <label class="form-label">البريد الإلكتروني</label>
                <input type="email" class="form-input" name="email" id="empEmail">
            </div>
            <div class="form-group">
                <label class="form-label">رقم الهاتف</label>
                <input type="text" class="form-input" name="phone" id="empPhone">
            </div>
            <div class="form-group">
                <label class="form-label">القسم</label>
                <select class="form-select" name="role" id="empRole" required>
                    <option value="">اختر القسم</option>
                    <option value="admin">مدير النظام</option>
                    <option value="receiver">الاستلام</option>
                    <option value="budget">الموازنة</option>
                    <option value="payment">الدفع</option>
                    <option value="invoice">الفوترة</option>
                </select>
            </div>
            <div class="modal-footer" style="padding: 0; border: none; margin-top: 1.5rem;">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
                <button type="submit" class="btn btn-primary">حفظ</button>
            </div>
        </form>
    `;
    openModal();
}

function editEmployee(id) {
    var emp = SettingsData.employees.find(function (e) { return e.id == id; });
    if (!emp) return;

    DOM.modalTitle.textContent = 'تعديل موظف';
    DOM.modalBody.innerHTML = `
        <form id="employeeForm" onsubmit="saveEmployee(event)">
            <input type="hidden" name="id" id="empId" value="${emp.id}">
            <div class="form-group">
                <label class="form-label">اسم الموظف</label>
                <input type="text" class="form-input" name="name" id="empName" value="${emp.name}" required>
            </div>
            <div class="form-group">
                <label class="form-label">البريد الإلكتروني</label>
                <input type="email" class="form-input" name="email" id="empEmail" value="${emp.email || ''}">
            </div>
            <div class="form-group">
                <label class="form-label">رقم الهاتف</label>
                <input type="text" class="form-input" name="phone" id="empPhone" value="${emp.phone || ''}">
            </div>
            <div class="form-group">
                <label class="form-label">القسم</label>
                <select class="form-select" name="role" id="empRole" required>
                    <option value="admin" ${emp.role === 'admin' ? 'selected' : ''}>مدير النظام</option>
                    <option value="receiver" ${emp.role === 'receiver' ? 'selected' : ''}>الاستلام</option>
                    <option value="budget" ${emp.role === 'budget' ? 'selected' : ''}>الموازنة</option>
                    <option value="payment" ${emp.role === 'payment' ? 'selected' : ''}>الدفع</option>
                    <option value="invoice" ${emp.role === 'invoice' ? 'selected' : ''}>الفوترة</option>
                </select>
            </div>
            <div class="modal-footer" style="padding: 0; border: none; margin-top: 1.5rem;">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
                <button type="submit" class="btn btn-primary">حفظ</button>
            </div>
        </form>
    `;
    openModal();
}

async function saveEmployee(e) {
    e.preventDefault();

    var id = document.getElementById('empId').value;
    var data = {
        name: document.getElementById('empName').value,
        email: document.getElementById('empEmail').value,
        phone: document.getElementById('empPhone').value,
        role: document.getElementById('empRole').value
    };

    if (id) data.id = id;

    var action = id ? 'update_employee' : 'add_employee';

    try {
        var res = await fetch('api/settings.php?action=' + action, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        var result = await res.json();

        if (result.success) {
            showToast(id ? 'تم تحديث الموظف' : 'تم إضافة الموظف', 'success');
            closeModal();
            await loadSettingsEmployees();
            renderEmployeesSection();
        } else {
            showToast(result.message || 'خطأ', 'error');
        }
    } catch (err) {
        showToast('خطأ في الاتصال', 'error');
    }
}

async function deleteEmployee(id, name) {
    if (!confirm('هل أنت متأكد من حذف الموظف "' + name + '"؟')) return;

    try {
        var res = await fetch('api/settings.php?action=delete_employee', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id })
        });

        var result = await res.json();

        if (result.success) {
            showToast('تم حذف الموظف', 'success');
            await loadSettingsEmployees();
            renderEmployeesSection();
        } else {
            showToast(result.message || 'خطأ في الحذف', 'error');
        }
    } catch (err) {
        showToast('خطأ في الاتصال', 'error');
    }
}

// ========== قسم أنواع المعاملات ==========
async function loadSettingsTypes() {
    try {
        var res = await fetch('api/?action=types');
        var data = await res.json();
        if (data.success) {
            SettingsData.types = data.data;
        }
    } catch (e) {
        console.error(e);
    }
}

async function renderTypesSection() {
    await loadSettingsTypes();

    var content = document.getElementById('settingsContent');

    var html = '<div class="settings-section-header">';
    html += '<h2>أنواع المعاملات</h2>';
    html += '<button class="btn btn-primary" onclick="openAddTypeModal()">';
    html += '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>';
    html += ' إضافة نوع';
    html += '</button>';
    html += '</div>';

    html += '<div class="types-grid">';

    if (SettingsData.types.length === 0) {
        html += '<div class="empty-state">لا يوجد أنواع</div>';
    } else {
        for (var i = 0; i < SettingsData.types.length; i++) {
            var type = SettingsData.types[i];
            html += '<div class="type-card">';
            html += '<div class="type-icon">📄</div>';
            html += '<div class="type-info">';
            html += '<h4>' + type.name + '</h4>';
            html += '<p>' + (type.description || 'بدون وصف') + '</p>';
            html += '</div>';
            html += '<div class="type-actions">';
            html += '<button class="btn-icon-sm" onclick="editType(' + type.id + ')" title="تعديل"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>';
            html += '<button class="btn-icon-sm btn-danger-icon" onclick="deleteType(' + type.id + ', \'' + type.name + '\')" title="حذف"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>';
            html += '</div>';
            html += '</div>';
        }
    }

    html += '</div>';
    content.innerHTML = html;
}

function openAddTypeModal() {
    DOM.modalTitle.textContent = 'إضافة نوع معاملة';
    DOM.modalBody.innerHTML = `
        <form id="typeForm" onsubmit="saveType(event)">
            <input type="hidden" name="id" id="typeId" value="">
            <div class="form-group">
                <label class="form-label">اسم النوع</label>
                <input type="text" class="form-input" name="name" id="typeName" required>
            </div>
            <div class="form-group">
                <label class="form-label">الوصف</label>
                <textarea class="form-textarea" name="description" id="typeDesc"></textarea>
            </div>
            <div class="modal-footer" style="padding: 0; border: none; margin-top: 1.5rem;">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
                <button type="submit" class="btn btn-primary">حفظ</button>
            </div>
        </form>
    `;
    openModal();
}

function editType(id) {
    var type = SettingsData.types.find(function (t) { return t.id == id; });
    if (!type) return;

    DOM.modalTitle.textContent = 'تعديل نوع المعاملة';
    DOM.modalBody.innerHTML = `
        <form id="typeForm" onsubmit="saveType(event)">
            <input type="hidden" name="id" id="typeId" value="${type.id}">
            <div class="form-group">
                <label class="form-label">اسم النوع</label>
                <input type="text" class="form-input" name="name" id="typeName" value="${type.name}" required>
            </div>
            <div class="form-group">
                <label class="form-label">الوصف</label>
                <textarea class="form-textarea" name="description" id="typeDesc">${type.description || ''}</textarea>
            </div>
            <div class="modal-footer" style="padding: 0; border: none; margin-top: 1.5rem;">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
                <button type="submit" class="btn btn-primary">حفظ</button>
            </div>
        </form>
    `;
    openModal();
}

async function saveType(e) {
    e.preventDefault();

    var id = document.getElementById('typeId').value;
    var data = {
        name: document.getElementById('typeName').value,
        description: document.getElementById('typeDesc').value
    };

    if (id) data.id = id;

    var action = id ? 'update_type' : 'add_type';

    try {
        var res = await fetch('api/settings.php?action=' + action, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        var result = await res.json();

        if (result.success) {
            showToast(id ? 'تم تحديث النوع' : 'تم إضافة النوع', 'success');
            closeModal();
            renderTypesSection();
        } else {
            showToast(result.message || 'خطأ', 'error');
        }
    } catch (err) {
        showToast('خطأ في الاتصال', 'error');
    }
}

async function deleteType(id, name) {
    if (!confirm('هل أنت متأكد من حذف النوع "' + name + '"؟')) return;

    try {
        var res = await fetch('api/settings.php?action=delete_type', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id })
        });

        var result = await res.json();

        if (result.success) {
            showToast('تم حذف النوع', 'success');
            renderTypesSection();
        } else {
            showToast(result.message || 'خطأ في الحذف', 'error');
        }
    } catch (err) {
        showToast('خطأ في الاتصال', 'error');
    }
}

// ========== قسم جميع المعاملات ==========
function renderAllTransactionsSection() {
    var content = document.getElementById('settingsContent');

    var html = '<div class="settings-section-header">';
    html += '<h2>جميع المعاملات</h2>';
    html += '<div class="header-actions">';
    html += '<input type="text" class="search-input-sm" id="txSearchInput" placeholder="بحث..." oninput="filterSettingsTransactions()">';
    html += '<button class="btn btn-secondary" onclick="exportTransactions()"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> تصدير</button>';
    html += '</div>';
    html += '</div>';

    html += '<div class="table-container"><table class="settings-table" id="settingsTxTable">';
    html += '<thead><tr>';
    html += '<th>رقم المعاملة</th>';
    html += '<th>التاريخ</th>';
    html += '<th>النوع</th>';
    html += '<th>الوصف</th>';
    html += '<th>المبلغ</th>';
    html += '<th>الحالة</th>';
    html += '<th>الإجراءات</th>';
    html += '</tr></thead>';
    html += '<tbody id="settingsTxBody">';

    if (App.transactions.length === 0) {
        html += '<tr><td colspan="7" style="text-align: center; padding: 2rem;">لا توجد معاملات</td></tr>';
    } else {
        for (var i = 0; i < App.transactions.length; i++) {
            var tx = App.transactions[i];
            html += '<tr>';
            html += '<td><strong>' + tx.transaction_number + '</strong></td>';
            html += '<td>' + tx.transaction_date + '</td>';
            html += '<td>' + (tx.transaction_type || '—') + '</td>';
            html += '<td class="truncate">' + tx.description + '</td>';
            html += '<td>' + formatMoney(tx.amount) + '</td>';
            html += '<td>' + getAlertBadge(tx.alert_type) + '</td>';
            html += '<td>';
            html += '<button class="btn-icon-sm" onclick="viewTransaction(' + tx.id + ')" title="عرض"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg></button>';
            html += '<button class="btn-icon-sm btn-danger-icon" onclick="deleteSettingsTransaction(' + tx.id + ', \'' + tx.transaction_number + '\')" title="حذف"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>';
            html += '</td>';
            html += '</tr>';
        }
    }

    html += '</tbody></table></div>';
    content.innerHTML = html;
}

function filterSettingsTransactions() {
    var search = document.getElementById('txSearchInput').value.toLowerCase();
    var tbody = document.getElementById('settingsTxBody');

    var filtered = App.transactions.filter(function (tx) {
        return tx.transaction_number.toLowerCase().indexOf(search) > -1 ||
            tx.description.toLowerCase().indexOf(search) > -1 ||
            (tx.transaction_type && tx.transaction_type.toLowerCase().indexOf(search) > -1);
    });

    var html = '';
    if (filtered.length === 0) {
        html = '<tr><td colspan="7" style="text-align: center; padding: 2rem;">لا توجد نتائج</td></tr>';
    } else {
        for (var i = 0; i < filtered.length; i++) {
            var tx = filtered[i];
            html += '<tr>';
            html += '<td><strong>' + tx.transaction_number + '</strong></td>';
            html += '<td>' + tx.transaction_date + '</td>';
            html += '<td>' + (tx.transaction_type || '—') + '</td>';
            html += '<td class="truncate">' + tx.description + '</td>';
            html += '<td>' + formatMoney(tx.amount) + '</td>';
            html += '<td>' + getAlertBadge(tx.alert_type) + '</td>';
            html += '<td>';
            html += '<button class="btn-icon-sm" onclick="viewTransaction(' + tx.id + ')" title="عرض"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg></button>';
            html += '<button class="btn-icon-sm btn-danger-icon" onclick="deleteSettingsTransaction(' + tx.id + ', \'' + tx.transaction_number + '\')" title="حذف"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>';
            html += '</td>';
            html += '</tr>';
        }
    }

    tbody.innerHTML = html;
}

async function deleteSettingsTransaction(id, number) {
    if (!confirm('هل أنت متأكد من حذف المعاملة "' + number + '"؟')) return;

    try {
        var res = await fetch('api/settings.php?action=delete_transaction', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id })
        });

        var result = await res.json();

        if (result.success) {
            showToast('تم حذف المعاملة', 'success');
            await loadTransactions();
            renderAllTransactionsSection();
        } else {
            showToast(result.message || 'خطأ في الحذف', 'error');
        }
    } catch (err) {
        showToast('خطأ في الاتصال', 'error');
    }
}

function exportTransactions() {
    window.location.href = 'api/settings.php?action=export';
}

// ========== قسم أداء الموظفين ==========
async function renderPerformanceSection() {
    var content = document.getElementById('settingsContent');

    var html = `
    <div class="performance-page">
        <!-- Header -->
        <div class="perf-header">
            <div class="perf-header-content">
                <div class="perf-title">
                    <div class="perf-icon">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"></circle>
                            <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                    </div>
                    <div>
                        <h1>متابعة الأداء</h1>
                        <p>تحليل أوقات إنجاز المعاملات وأداء الموظفين</p>
                    </div>
                </div>
                <div class="perf-header-stats" id="perfHeaderStats">
                    <div class="header-stat">
                        <span class="stat-number" id="totalEventsToday">-</span>
                        <span class="stat-label">أحداث اليوم</span>
                    </div>
                    <div class="header-stat">
                        <span class="stat-number" id="avgTimeToday">-</span>
                        <span class="stat-label">متوسط الوقت</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- تبويبات -->
        <div class="perf-tabs">
            <button class="perf-tab active" onclick="switchPerfTab('overview')">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="7" height="7"></rect>
                    <rect x="14" y="3" width="7" height="7"></rect>
                    <rect x="14" y="14" width="7" height="7"></rect>
                    <rect x="3" y="14" width="7" height="7"></rect>
                </svg>
                نظرة عامة
            </button>
            <button class="perf-tab" onclick="switchPerfTab('timeline')">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="12" y1="20" x2="12" y2="10"></line>
                    <line x1="18" y1="20" x2="18" y2="4"></line>
                    <line x1="6" y1="20" x2="6" y2="16"></line>
                </svg>
                سجل الأحداث
            </button>
            <button class="perf-tab" onclick="switchPerfTab('analytics')">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="20" x2="18" y2="10"></line>
                    <line x1="12" y1="20" x2="12" y2="4"></line>
                    <line x1="6" y1="20" x2="6" y2="14"></line>
                </svg>
                تحليلات
            </button>
        </div>

        <!-- الفلاتر -->
        <div class="perf-filters">
            <div class="filter-group">
                <label>الموظف</label>
                <select id="perfEmployeeFilter" onchange="loadPerformanceData()">
                    <option value="">جميع الموظفين</option>
                    ${SettingsData.employees ? SettingsData.employees.map(emp =>
        `<option value="${emp.id}">${emp.name}</option>`
    ).join('') : ''}
                </select>
            </div>
            <div class="filter-group">
                <label>المرحلة</label>
                <select id="perfStageFilter" onchange="loadPerformanceData()">
                    <option value="">جميع المراحل</option>
                    <option value="creation">الإنشاء</option>
                    <option value="receiving">الاستلام</option>
                    <option value="budget">الموازنة</option>
                    <option value="payment">الدفع</option>
                    <option value="invoice">الفوترة</option>
                </select>
            </div>
            <div class="filter-group">
                <label>من تاريخ</label>
                <input type="date" id="perfDateFrom" onchange="loadPerformanceData()">
            </div>
            <div class="filter-group">
                <label>إلى تاريخ</label>
                <input type="date" id="perfDateTo" onchange="loadPerformanceData()">
            </div>
            <button class="filter-reset" onclick="resetPerfFilters()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
                    <path d="M3 3v5h5"></path>
                </svg>
                إعادة تعيين
            </button>
        </div>

        <!-- المحتوى -->
        <div class="perf-content">
            <!-- نظرة عامة -->
            <div id="perfTabOverview" class="perf-tab-content active">
                <!-- بطاقات الموظفين -->
                <div id="performanceSummary" class="employee-cards-grid"></div>
                
                <!-- جدول التفاصيل -->
                <div class="perf-section">
                    <div class="section-header">
                        <h3>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                <polyline points="14 2 14 8 20 8"></polyline>
                                <line x1="16" y1="13" x2="8" y2="13"></line>
                                <line x1="16" y1="17" x2="8" y2="17"></line>
                            </svg>
                            تفاصيل الأوقات
                        </h3>
                    </div>
                    <div id="performanceTable" class="perf-table-container"></div>
                </div>
            </div>

            <!-- سجل الأحداث -->
            <div id="perfTabTimeline" class="perf-tab-content">
                <div class="perf-section">
                    <div class="section-header">
                        <h3>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"></circle>
                                <polyline points="12 6 12 12 16 14"></polyline>
                            </svg>
                            سجل جميع الأحداث والتغييرات
                        </h3>
                        <span class="events-count" id="eventsCount">-</span>
                    </div>
                    <div id="eventsTimeline" class="events-timeline-container"></div>
                </div>
            </div>

            <!-- تحليلات -->
            <div id="perfTabAnalytics" class="perf-tab-content">
                <div class="analytics-grid">
                    <div class="analytics-card">
                        <h4>توزيع الأحداث حسب المرحلة</h4>
                        <div id="stageDistribution" class="chart-container"></div>
                    </div>
                    <div class="analytics-card">
                        <h4>أداء الموظفين</h4>
                        <div id="employeeRanking" class="ranking-list"></div>
                    </div>
                </div>
            </div>
        </div>
    </div>`;

    content.innerHTML = html;

    // تحميل البيانات
    loadPerformanceData();
    loadEventsTimeline();
}

// تبديل التبويبات
function switchPerfTab(tab) {
    // إزالة active من جميع التبويبات
    document.querySelectorAll('.perf-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.perf-tab-content').forEach(c => c.classList.remove('active'));

    // تفعيل التبويب المطلوب
    event.target.closest('.perf-tab').classList.add('active');
    document.getElementById('perfTab' + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.add('active');

    // تحميل البيانات حسب التبويب
    if (tab === 'timeline') {
        loadEventsTimeline();
    } else if (tab === 'analytics') {
        loadAnalytics();
    }
}

// إعادة تعيين الفلاتر
function resetPerfFilters() {
    document.getElementById('perfEmployeeFilter').value = '';
    document.getElementById('perfStageFilter').value = '';
    document.getElementById('perfDateFrom').value = '';
    document.getElementById('perfDateTo').value = '';
    loadPerformanceData();
    loadEventsTimeline();
}

// تحميل سجل الأحداث
async function loadEventsTimeline() {
    var container = document.getElementById('eventsTimeline');
    var countEl = document.getElementById('eventsCount');
    if (!container) return;

    container.innerHTML = '<div class="loading-spinner">جاري التحميل...</div>';

    try {
        var employeeId = document.getElementById('perfEmployeeFilter')?.value || '';
        var stage = document.getElementById('perfStageFilter')?.value || '';

        var params = new URLSearchParams();
        params.append('limit', '100');
        if (employeeId) params.append('employee_id', employeeId);
        if (stage) params.append('stage', stage);

        var res = await fetch('api/?action=all_events&' + params.toString());
        var result = await res.json();

        if (result.success && result.data && result.data.length > 0) {
            if (countEl) countEl.textContent = result.data.length + ' حدث';

            var html = '<div class="timeline-list">';

            var stageInfo = {
                'creation': { name: 'الإنشاء', color: '#4dabf7', icon: '➕' },
                'receiving': { name: 'الاستلام', color: '#69db7c', icon: '📥' },
                'budget': { name: 'الموازنة', color: '#3bc9db', icon: '💰' },
                'payment': { name: 'الدفع', color: '#ffa94d', icon: '💳' },
                'invoice': { name: 'الفوترة', color: '#b197fc', icon: '🧾' }
            };

            result.data.forEach(function (event) {
                var info = stageInfo[event.stage] || { name: event.stage, color: '#888', icon: '📋' };
                var duration = event.duration_from_previous;
                var durationClass = duration <= 5 ? 'fast' : (duration <= 30 ? 'normal' : 'slow');

                html += `
                <div class="timeline-item">
                    <div class="timeline-dot" style="background: ${info.color};">${info.icon}</div>
                    <div class="timeline-content">
                        <div class="timeline-header">
                            <span class="timeline-tx">${event.transaction_number || '-'}</span>
                            <span class="timeline-stage" style="background: ${info.color}20; color: ${info.color}; border: 1px solid ${info.color}40;">${info.name}</span>
                            ${duration !== null ? `<span class="timeline-duration ${durationClass}">${duration} دقيقة</span>` : ''}
                        </div>
                        <div class="timeline-status">
                            ${event.old_status ? `<span class="status-old">${event.old_status}</span><span class="status-arrow">←</span>` : ''}
                            <span class="status-new">${event.new_status || '-'}</span>
                        </div>
                        ${event.notes ? `<div class="timeline-notes"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>${event.notes}</div>` : ''}
                        <div class="timeline-footer">
                            <span class="timeline-employee">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                                ${event.employee_name || 'النظام'}
                            </span>
                            <span class="timeline-time">${formatEventDateTime(event.event_time)}</span>
                        </div>
                    </div>
                </div>`;
            });

            html += '</div>';
            container.innerHTML = html;
        } else {
            if (countEl) countEl.textContent = '0 حدث';
            container.innerHTML = '<div class="empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg><p>لا توجد أحداث مسجلة</p></div>';
        }
    } catch (err) {
        container.innerHTML = '<div class="error-state">خطأ في تحميل الأحداث</div>';
    }
}

// تحميل التحليلات
async function loadAnalytics() {
    var stageContainer = document.getElementById('stageDistribution');
    var rankingContainer = document.getElementById('employeeRanking');

    if (!stageContainer || !rankingContainer) return;

    try {
        var res = await fetch('api/?action=all_events&limit=500');
        var result = await res.json();

        if (result.success && result.data) {
            // توزيع حسب المرحلة
            var stageCounts = {};
            var employeeStats = {};

            result.data.forEach(function (event) {
                // عدد حسب المرحلة
                stageCounts[event.stage] = (stageCounts[event.stage] || 0) + 1;

                // إحصائيات الموظفين
                if (event.employee_name) {
                    if (!employeeStats[event.employee_name]) {
                        employeeStats[event.employee_name] = { count: 0, totalTime: 0 };
                    }
                    employeeStats[event.employee_name].count++;
                    if (event.duration_from_previous) {
                        employeeStats[event.employee_name].totalTime += event.duration_from_previous;
                    }
                }
            });

            // عرض توزيع المراحل
            var stageInfo = {
                'creation': { name: 'الإنشاء', color: '#4dabf7' },
                'receiving': { name: 'الاستلام', color: '#69db7c' },
                'budget': { name: 'الموازنة', color: '#3bc9db' },
                'payment': { name: 'الدفع', color: '#ffa94d' },
                'invoice': { name: 'الفوترة', color: '#b197fc' }
            };

            var total = Object.values(stageCounts).reduce((a, b) => a + b, 0);
            var stageHtml = '<div class="stage-bars">';

            Object.keys(stageInfo).forEach(function (stage) {
                var count = stageCounts[stage] || 0;
                var percent = total > 0 ? Math.round((count / total) * 100) : 0;
                var info = stageInfo[stage];

                stageHtml += `
                <div class="stage-bar-item">
                    <div class="stage-bar-label">
                        <span style="color: ${info.color};">${info.name}</span>
                        <span>${count} (${percent}%)</span>
                    </div>
                    <div class="stage-bar-track">
                        <div class="stage-bar-fill" style="width: ${percent}%; background: ${info.color};"></div>
                    </div>
                </div>`;
            });

            stageHtml += '</div>';
            stageContainer.innerHTML = stageHtml;

            // ترتيب الموظفين
            var employees = Object.entries(employeeStats)
                .map(([name, stats]) => ({
                    name,
                    count: stats.count,
                    avgTime: stats.count > 0 ? Math.round(stats.totalTime / stats.count) : 0
                }))
                .sort((a, b) => b.count - a.count);

            var rankHtml = '<div class="ranking-items">';
            employees.slice(0, 5).forEach(function (emp, index) {
                var medal = index === 0 ? '🥇' : (index === 1 ? '🥈' : (index === 2 ? '🥉' : ''));
                rankHtml += `
                <div class="ranking-item">
                    <span class="rank-number">${medal || (index + 1)}</span>
                    <span class="rank-name">${emp.name}</span>
                    <span class="rank-count">${emp.count} معاملة</span>
                    <span class="rank-time">${emp.avgTime} د متوسط</span>
                </div>`;
            });
            rankHtml += '</div>';
            rankingContainer.innerHTML = rankHtml;
        }
    } catch (err) {
        stageContainer.innerHTML = '<div class="error-state">خطأ</div>';
    }
}

function formatEventDateTime(datetime) {
    if (!datetime) return '-';
    var date = new Date(datetime);
    var now = new Date();
    var diff = now - date;

    // إذا كان اليوم
    if (diff < 86400000 && date.getDate() === now.getDate()) {
        return 'اليوم ' + date.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
    }
    // إذا كان أمس
    if (diff < 172800000) {
        return 'أمس ' + date.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
    }

    return date.toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' }) + ' ' +
        date.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
}

async function loadPerformanceData() {
    var employeeId = document.getElementById('perfEmployeeFilter')?.value || '';
    var stage = document.getElementById('perfStageFilter')?.value || '';
    var dateFrom = document.getElementById('perfDateFrom')?.value || '';
    var dateTo = document.getElementById('perfDateTo')?.value || '';

    // تحميل ملخص الأداء
    try {
        var params = new URLSearchParams();
        if (dateFrom) params.append('date_from', dateFrom);
        if (dateTo) params.append('date_to', dateTo);

        var summaryRes = await fetch('api/?action=performance_summary&' + params.toString());
        var summaryData = await summaryRes.json();

        if (summaryData.success) {
            renderPerformanceSummary(summaryData.data);
        }
    } catch (e) {
        console.error('Error loading performance summary:', e);
    }

    // تحميل التفاصيل
    try {
        var params = new URLSearchParams();
        if (employeeId) params.append('employee_id', employeeId);
        if (stage) params.append('stage', stage);
        if (dateFrom) params.append('date_from', dateFrom);
        if (dateTo) params.append('date_to', dateTo);

        var detailsRes = await fetch('api/?action=employee_times&' + params.toString());
        var detailsData = await detailsRes.json();

        if (detailsData.success) {
            renderPerformanceTable(detailsData.data);
        }
    } catch (e) {
        console.error('Error loading performance details:', e);
    }
}

function renderPerformanceSummary(data) {
    var container = document.getElementById('performanceSummary');
    if (!container) return;

    // تجميع البيانات حسب الموظف
    var employeeStats = {};
    data.forEach(function (item) {
        if (!employeeStats[item.employee_id]) {
            employeeStats[item.employee_id] = {
                name: item.employee_name,
                role: item.employee_role,
                total: 0,
                avgTime: 0,
                totalDuration: 0
            };
        }
        employeeStats[item.employee_id].total += parseInt(item.total_transactions) || 0;
        employeeStats[item.employee_id].totalDuration += parseInt(item.total_duration) || 0;
    });

    // حساب المتوسط
    Object.keys(employeeStats).forEach(function (id) {
        var emp = employeeStats[id];
        emp.avgTime = emp.total > 0 ? Math.round(emp.totalDuration / emp.total) : 0;
    });

    var roleColors = {
        'admin': '#667eea',
        'receiver': '#69db7c',
        'budget': '#3bc9db',
        'payment': '#ffa94d',
        'invoice': '#b197fc'
    };

    var html = '';

    Object.keys(employeeStats).forEach(function (id) {
        var emp = employeeStats[id];
        var avgClass = emp.avgTime <= 10 ? 'excellent' : (emp.avgTime <= 30 ? 'good' : 'slow');
        var color = roleColors[emp.role] || '#667eea';

        html += `
        <div class="emp-card">
            <div class="emp-card-header">
                <div class="emp-avatar" style="background: ${color}20; color: ${color};">
                    ${emp.name ? emp.name.charAt(0) : '؟'}
                </div>
                <div class="emp-info">
                    <h4>${emp.name}</h4>
                    <span class="emp-role" style="background: ${color}20; color: ${color};">${getRoleName(emp.role)}</span>
                </div>
            </div>
            <div class="emp-stats">
                <div class="emp-stat">
                    <span class="emp-stat-value">${emp.total}</span>
                    <span class="emp-stat-label">معاملة</span>
                </div>
                <div class="emp-stat">
                    <span class="emp-stat-value ${avgClass}">${emp.avgTime > 0 ? emp.avgTime + ' د' : '-'}</span>
                    <span class="emp-stat-label">متوسط الوقت</span>
                </div>
            </div>
        </div>`;
    });

    if (Object.keys(employeeStats).length === 0) {
        html = `
        <div class="empty-state" style="grid-column: 1 / -1;">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            <p>لا توجد بيانات أداء متاحة</p>
        </div>`;
    }

    container.innerHTML = html;
}

function renderPerformanceTable(data) {
    var container = document.getElementById('performanceTable');
    if (!container) return;

    if (!data || data.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 3rem; color: var(--text-muted);">لا توجد سجلات</div>';
        return;
    }

    var html = '<table class="table" style="width: 100%;">';
    html += '<thead><tr>';
    html += '<th>رقم المعاملة</th>';
    html += '<th>الموظف</th>';
    html += '<th>المرحلة</th>';
    html += '<th>وقت البدء</th>';
    html += '<th>وقت الانتهاء</th>';
    html += '<th>المدة</th>';
    html += '<th>الحالة</th>';
    html += '</tr></thead>';
    html += '<tbody>';

    data.forEach(function (item) {
        var durationClass = item.duration_minutes <= 10 ? 'excellent' : (item.duration_minutes <= 30 ? 'good' : 'slow');

        html += '<tr>';
        html += '<td><span style="color: var(--accent-blue); font-family: monospace;">' + (item.transaction_number || '-') + '</span></td>';
        html += '<td>' + (item.employee_name || '-') + '</td>';
        html += '<td>' + getStageName(item.stage) + '</td>';
        html += '<td style="font-size: 0.85rem;">' + formatDateTime(item.started_at) + '</td>';
        html += '<td style="font-size: 0.85rem;">' + formatDateTime(item.completed_at) + '</td>';
        html += '<td><span class="duration-badge ' + durationClass + '">' + formatDuration(item.duration_minutes) + '</span></td>';
        html += '<td>' + (item.status || '-') + '</td>';
        html += '</tr>';
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}

function getStageName(stage) {
    var stages = {
        'creation': 'الإنشاء',
        'receiving': 'الاستلام',
        'budget': 'الموازنة',
        'payment': 'الدفع',
        'invoice': 'الفوترة'
    };
    return stages[stage] || stage;
}

function formatDuration(minutes) {
    if (!minutes || minutes === 0) return '-';
    if (minutes < 60) return minutes + ' د';
    var hours = Math.floor(minutes / 60);
    var mins = minutes % 60;
    return hours + ' س ' + (mins > 0 ? mins + ' د' : '');
}

function formatDateTime(datetime) {
    if (!datetime) return '-';
    var date = new Date(datetime);
    return date.toLocaleDateString('ar-SA') + ' ' + date.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
}

// ========== دوال سجل الأحداث ==========
function toggleEventsLog() {
    var container = document.getElementById('eventsLogContainer');
    var icon = document.getElementById('eventsToggleIcon');

    if (container.style.display === 'none') {
        container.style.display = 'block';
        icon.textContent = '▲';
        loadEventsLog();
    } else {
        container.style.display = 'none';
        icon.textContent = '▼';
    }
}

async function loadEventsLog() {
    var container = document.getElementById('eventsLogTable');
    if (!container) return;

    container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-muted);">جاري التحميل...</div>';

    try {
        var res = await fetch('api/?action=all_events');
        var result = await res.json();

        if (result.success && result.data && result.data.length > 0) {
            var html = '<table class="table" style="width: 100%;">';
            html += '<thead><tr>';
            html += '<th>المعاملة</th>';
            html += '<th>المرحلة</th>';
            html += '<th>من</th>';
            html += '<th>إلى</th>';
            html += '<th>السبب/الملاحظات</th>';
            html += '<th>المدة</th>';
            html += '<th>الموظف</th>';
            html += '<th>الوقت</th>';
            html += '</tr></thead><tbody>';

            var stageNames = {
                'creation': 'الإنشاء',
                'receiving': 'الاستلام',
                'budget': 'الموازنة',
                'payment': 'الدفع',
                'invoice': 'الفوترة'
            };

            var stageColors = {
                'creation': '#4dabf7',
                'receiving': '#69db7c',
                'budget': '#3bc9db',
                'payment': '#ffa94d',
                'invoice': '#b197fc'
            };

            result.data.forEach(function (event) {
                var stageName = stageNames[event.stage] || event.stage;
                var stageColor = stageColors[event.stage] || '#888';
                var duration = event.duration_from_previous;

                html += '<tr>';
                html += '<td><span style="color: var(--accent-blue); font-family: monospace;">' + (event.transaction_number || '-') + '</span></td>';
                html += '<td><span style="background: ' + stageColor + '; color: #000; padding: 2px 8px; border-radius: 10px; font-size: 0.8rem;">' + stageName + '</span></td>';
                html += '<td style="color: var(--text-muted); text-decoration: line-through;">' + (event.old_status || '-') + '</td>';
                html += '<td style="color: var(--accent-green); font-weight: 600;">' + (event.new_status || '-') + '</td>';
                html += '<td style="max-width: 200px; font-size: 0.85rem;">' + (event.notes || '-') + '</td>';
                html += '<td>';
                if (duration !== null && duration !== undefined) {
                    var durationColor = duration <= 5 ? '#69db7c' : (duration <= 30 ? '#ffa94d' : '#ff6b6b');
                    html += '<span style="background: ' + durationColor + '; color: #000; padding: 2px 8px; border-radius: 10px; font-size: 0.8rem;">' + duration + ' د</span>';
                } else {
                    html += '-';
                }
                html += '</td>';
                html += '<td>' + (event.employee_name || '-') + '</td>';
                html += '<td style="font-size: 0.8rem; direction: ltr;">' + formatDateTime(event.event_time) + '</td>';
                html += '</tr>';
            });

            html += '</tbody></table>';
            container.innerHTML = html;
        } else {
            container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-muted);">لا توجد أحداث مسجلة</div>';
        }
    } catch (err) {
        container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--accent-red);">خطأ في تحميل الأحداث</div>';
    }
}

// ========== قسم النظام ==========
async function renderSystemSection() {
    var content = document.getElementById('settingsContent');

    // جلب الإحصائيات
    var stats = { transactions: 0, employees: 0, types: 0, total_amount: 0 };
    try {
        var res = await fetch('api/settings.php?action=full_stats');
        var data = await res.json();
        if (data.success) stats = data.data;
    } catch (e) { }

    var html = '<div class="settings-section-header">';
    html += '<h2>إعدادات النظام</h2>';
    html += '</div>';

    html += '<div class="system-grid">';

    // إحصائيات
    html += '<div class="system-card">';
    html += '<h3>📊 إحصائيات النظام</h3>';
    html += '<div class="stats-grid">';
    html += '<div class="stat-item"><span class="stat-number">' + stats.transactions + '</span><span class="stat-label">معاملة</span></div>';
    html += '<div class="stat-item"><span class="stat-number">' + stats.employees + '</span><span class="stat-label">موظف</span></div>';
    html += '<div class="stat-item"><span class="stat-number">' + stats.types + '</span><span class="stat-label">نوع</span></div>';
    html += '<div class="stat-item"><span class="stat-number">' + formatMoney(stats.total_amount) + '</span><span class="stat-label">إجمالي المبالغ</span></div>';
    html += '</div>';
    html += '</div>';

    // معلومات النظام
    html += '<div class="system-card">';
    html += '<h3>ℹ️ معلومات النظام</h3>';
    html += '<div class="info-list">';
    html += '<div class="info-item"><span>اسم النظام:</span><span>نظام إدارة معاملات القطاع المالي</span></div>';
    html += '<div class="info-item"><span>الإصدار:</span><span>1.0.0</span></div>';
    html += '<div class="info-item"><span>قاعدة البيانات:</span><span>MySQL</span></div>';
    html += '</div>';
    html += '</div>';

    // منطقة الخطر
    html += '<div class="system-card danger-zone">';
    html += '<h3>⚠️ منطقة الخطر</h3>';
    html += '<p>هذه الإجراءات لا يمكن التراجع عنها</p>';
    html += '<div class="danger-buttons">';
    html += '<button class="btn btn-danger" onclick="clearAllTransactions()">حذف جميع المعاملات</button>';
    html += '</div>';
    html += '</div>';

    html += '</div>';
    content.innerHTML = html;
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