<?php
/**
 * نظام إدارة معاملات القطاع المالي
 * Workflow Management System
 * الصفحة الرئيسية
 */

session_start();

// التحقق من تسجيل الدخول
if (!isset($_SESSION['user_id'])) {
    header('Location: login.php');
    exit;
}

require_once __DIR__ . '/includes/functions.php';

// الحصول على الإحصائيات للشارة
$stats = getStats();
$userName = $_SESSION['user_name'] ?? 'المستخدم';
$userRole = $_SESSION['user_role'] ?? '';
?>
<!DOCTYPE html>
<html lang="ar" dir="rtl" data-theme="light" data-lang="ar">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>نظام إدارة معاملات القطاع المالي</title>
    <link rel="stylesheet" href="css/style.css">
    <link rel="stylesheet" href="css/sidebar.css">
    <link rel="stylesheet" href="css/bank_deposits_new.css">
    <link rel="stylesheet" href="css/investment_styles.css">
    <link rel="stylesheet" href="css/correspondence.css">
    <link rel="stylesheet" href="css/dashboard-redesign.css">
    <link rel="stylesheet" href="css/bank-rows.css">
    <link rel="stylesheet" href="css/daily-payments.css">
    <link rel="stylesheet" href="css/ceo-approvals.css">
    <link rel="stylesheet" href="css/archive.css">
    <link rel="icon" href="images/logo.png">
</head>

<body>
    <!-- الخلفية -->
    <div class="bg-gradient"></div>
    <div class="bg-blob bg-blob-1"></div>
    <div class="bg-blob bg-blob-2"></div>

    <!-- زر القائمة للموبايل -->
    <button class="mobile-menu-btn" id="mobileMenuBtn" onclick="toggleMobileSidebar()" title="القائمة">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
        </svg>
    </button>

    <!-- خلفية موبايل -->
    <div class="sidebar-overlay" id="sidebarOverlay" onclick="toggleMobileSidebar()"></div>

    <!-- زر الطي المستقل — يظهر دائماً على حافة السايدبار -->
    <button class="sidebar-toggle" id="sidebarToggle" onclick="toggleSidebar()" title="طي/توسيع القائمة">
        <svg class="toggle-icon-close" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2.5">
            <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
        <svg class="toggle-icon-open" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2.5">
            <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
    </button>

    <!-- ═══════════════════════════════════════════════════════
         السايدبار الجانبي
    ═══════════════════════════════════════════════════════ -->
    <aside class="sidebar" id="sidebar">

        <!-- هيدر: اللوجو فقط -->
        <div class="sidebar-header">
            <div class="sidebar-logo-icon">
                <img src="images/logo.png" alt="الشعار"
                    style="width:38px;height:38px;border-radius:50%;object-fit:cover;display:block">
            </div>
            <div class="sidebar-logo-text">
                <h1>نظام إدارة المعاملات</h1>
                <span>Workflow Management</span>
            </div>
        </div>

        <!-- قائمة التنقل -->
        <nav class="sidebar-nav">

            <span class="nav-group-label">الرئيسية</span>

            <button class="nav-tab active" data-tab="dashboard" data-tooltip="لوحة التحكم">
                <span class="nav-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="3" width="7" height="7"></rect>
                        <rect x="14" y="3" width="7" height="7"></rect>
                        <rect x="14" y="14" width="7" height="7"></rect>
                        <rect x="3" y="14" width="7" height="7"></rect>
                    </svg>
                </span>
                <span class="nav-label">لوحة التحكم</span>
            </button>

            <button class="nav-tab" data-tab="notifications" data-tooltip="التنبيهات">
                <span class="nav-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                        <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                    </svg>
                </span>
                <span class="nav-label">التنبيهات</span>
                <span class="nav-badge" id="notification-badge" style="display:none">0</span>
            </button>

            <span class="nav-group-label">المعاملات</span>

            <button class="nav-tab" data-tab="transactions" data-tooltip="المعاملات المالية">
                <span class="nav-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="1" x2="12" y2="23"></line>
                        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                    </svg>
                </span>
                <span class="nav-label">المعاملات المالية</span>
            </button>

            <button class="nav-tab" data-tab="correspondence" data-tooltip="الخطابات">
                <span class="nav-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                        <polyline points="22,6 12,13 2,6"></polyline>
                    </svg>
                </span>
                <span class="nav-label">الخطابات</span>
            </button>


            <!-- ══ التخطيط المالي والموازنة (قابل للطي) ══ -->
            <div class="nav-parent" id="nav-parent-budget">
                <button class="nav-tab nav-parent-btn" onclick="toggleNavGroup('budget')" data-tooltip="التخطيط المالي">
                    <span class="nav-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            stroke-width="2">
                            <line x1="18" y1="20" x2="18" y2="10" />
                            <line x1="12" y1="20" x2="12" y2="4" />
                            <line x1="6" y1="20" x2="6" y2="14" />
                            <line x1="2" y1="20" x2="22" y2="20" />
                        </svg>
                    </span>
                    <span class="nav-label">التخطيط والموازنة</span>
                    <span class="nav-chevron" id="nav-chevron-budget">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            stroke-width="2.5">
                            <polyline points="6 9 12 15 18 9" />
                        </svg>
                    </span>
                </button>
                <div class="nav-children" id="nav-children-budget">
                    <button class="nav-tab nav-child-btn" data-tab="reservations" data-tooltip="حجوزات الموازنة"
                        onclick="openBudgetSubTab('reservations')">
                        <span class="nav-child-dot"></span>
                        <span class="nav-label">حجوزات الموازنة</span>
                    </button>
                    <button class="nav-tab nav-child-btn" data-tab="budget-plans" data-tooltip="الموازنة التقديرية"
                        onclick="openBudgetSubTab('plans')">
                        <span class="nav-child-dot"></span>
                        <span class="nav-label">الموازنة التقديرية</span>
                    </button>
                </div>
            </div>

            <!-- ══ الخزينة (قابل للطي) ══ -->
            <div class="nav-parent" id="nav-parent-treasury">
                <button class="nav-tab nav-parent-btn" onclick="toggleNavGroup('treasury')" data-tooltip="الخزينة">
                    <span class="nav-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            stroke-width="2">
                            <rect x="2" y="7" width="20" height="14" rx="2" />
                            <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
                            <line x1="12" y1="12" x2="12" y2="16" />
                            <circle cx="12" cy="17" r="1" fill="currentColor" />
                        </svg>
                    </span>
                    <span class="nav-label">الخزينة</span>
                    <span class="nav-chevron" id="nav-chevron-treasury">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            stroke-width="2.5">
                            <polyline points="6 9 12 15 18 9" />
                        </svg>
                    </span>
                </button>
                <div class="nav-children" id="nav-children-treasury">
                    <button class="nav-tab nav-child-btn" data-tab="bank-overview" data-tooltip="نظرة عامة"
                        onclick="openBankSubTab('overview','treasury')">
                        <span class="nav-child-dot"></span>
                        <span class="nav-label">نظرة عامة</span>
                    </button>
                    <button class="nav-tab nav-child-btn" data-tab="bank-accounts" data-tooltip="الحسابات البنكية"
                        onclick="openBankSubTab('accounts','treasury')">
                        <span class="nav-child-dot"></span>
                        <span class="nav-label">الحسابات البنكية</span>
                    </button>
                    <button class="nav-tab nav-child-btn" data-tab="bank-investments" data-tooltip="الودائع الاستثمارية"
                        onclick="openBankSubTab('investments','treasury')">
                        <span class="nav-child-dot"></span>
                        <span class="nav-label">الودائع الاستثمارية</span>
                    </button>
                    <button class="nav-tab nav-child-btn" data-tab="daily-payments" data-tooltip="المدفوعات اليومية"
                        onclick="openTab('daily-payments','treasury')">
                        <span class="nav-child-dot"></span>
                        <span class="nav-label">المدفوعات اليومية</span>
                    </button>
                </div>
            </div>


            <!-- ══ الأرشيف المالي (قابل للطي) ══ -->
            <div class="nav-parent" id="nav-parent-archive">
                <button class="nav-tab nav-parent-btn" onclick="toggleNavGroup('archive')"
                    data-tooltip="الأرشيف المالي">
                    <span class="nav-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            stroke-width="2">
                            <polyline points="21 8 21 21 3 21 3 8"></polyline>
                            <rect x="1" y="3" width="22" height="5"></rect>
                            <line x1="10" y1="12" x2="14" y2="12"></line>
                        </svg>
                    </span>
                    <span class="nav-label">الأرشيف المالي</span>
                    <span class="nav-badge" id="archive-expiry-badge" style="display:none">!</span>
                    <span class="nav-chevron" id="nav-chevron-archive">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            stroke-width="2.5">
                            <polyline points="6 9 12 15 18 9" />
                        </svg>
                    </span>
                </button>
                <div class="nav-children" id="nav-children-archive">
                    <button class="nav-tab nav-child-btn" data-tab="archive" data-tooltip="جميع المستندات"
                        onclick="openArchiveSub('all')">
                        <span class="nav-child-dot"></span>
                        <span class="nav-label">جميع المستندات</span>
                    </button>
                    <button class="nav-tab nav-child-btn" data-tab="archive" data-tooltip="📋 مستندات تشغيلية"
                        onclick="openArchiveSub('operational')">
                        <span class="nav-child-dot"></span>
                        <span class="nav-label">📋 مستندات تشغيلية</span>
                    </button>
                    <button class="nav-tab nav-child-btn" data-tab="archive" data-tooltip="💰 مستندات مالية"
                        onclick="openArchiveSub('financial')">
                        <span class="nav-child-dot"></span>
                        <span class="nav-label">💰 مستندات مالية</span>
                    </button>
                    <button class="nav-tab nav-child-btn" data-tab="archive" data-tooltip="📊 تقارير وموازنة"
                        onclick="openArchiveSub('reports')">
                        <span class="nav-child-dot"></span>
                        <span class="nav-label">📊 تقارير وموازنة</span>
                    </button>
                    <button class="nav-tab nav-child-btn" data-tab="archive" data-tooltip="🏛️ وثائق رسمية"
                        onclick="openArchiveSub('official')">
                        <span class="nav-child-dot"></span>
                        <span class="nav-label">🏛️ وثائق رسمية</span>
                    </button>
                    <button class="nav-tab nav-child-btn" data-tab="archive" data-tooltip="🔄 التجديد والصلاحيات"
                        onclick="openArchiveSub('renewals')">
                        <span class="nav-child-dot"></span>
                        <span class="nav-label">🔄 التجديد والصلاحيات</span>
                    </button>
                </div>
            </div>

            <span class="nav-group-label">المتابعة</span>

            <button class="nav-tab" data-tab="sla" data-tooltip="SLA / OLA">
                <span class="nav-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                </span>
                <span class="nav-label">SLA / OLA</span>
                <span class="nav-badge" id="slaBadge" style="display:none"><?= $stats['urgent'] ?? 0 ?></span>
            </button>

            <button class="nav-tab" data-tab="performance" data-tooltip="متابعة الأداء">
                <span class="nav-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                    </svg>
                </span>
                <span class="nav-label">متابعة الأداء</span>
            </button>
            <?php if (in_array($_SESSION['user_role'] ?? '', ['ceo','admin','system_admin'])): ?>
            <button class="nav-tab" data-tab="ceo-approvals" data-tooltip="اعتمادات الرئيس التنفيذي">
                <span class="nav-icon">🏛️</span>
                <span class="nav-label">اعتمادات الرئيس التنفيذي</span>
            </button>
            <?php endif; ?>
            <span class="nav-group-label">النظام</span>

            <button class="nav-tab" data-tab="settings" data-tooltip="الإعدادات">
                <span class="nav-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="3"></circle>
                        <path
                            d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z">
                        </path>
                    </svg>
                </span>
                <span class="nav-label">الإعدادات</span>
            </button>

        </nav>

        <!-- فوتر: المستخدم + الإجراءات -->
        <div class="sidebar-footer">
            <!-- بطاقة المستخدم -->
            <div class="sidebar-user" onclick="loadProfilePage()" style="cursor:pointer" title="ملفي الشخصي">
                <div class="user-avatar"><?= htmlspecialchars($_SESSION['employee_number']) ?></div>
                <div class="user-details">
                    <div class="user-top-row">
                        <span class="user-name"><?= htmlspecialchars($userName) ?></span>
                    </div>
                    <div class="user-top-row">
                        <span class="user-role"><?= htmlspecialchars(getRoleName($userRole)) ?></span>
                        <?php if (!empty($_SESSION['employee_number'])): ?>
                        <span class="user-badge"><?= htmlspecialchars($_SESSION['department_name']) ?></span>
                        <?php endif; ?>
                    </div>


                </div>
            </div>

            <!-- أزرار الإجراءات -->
            <div class="sidebar-actions">
                <!-- تبديل الوضع -->
                <button class="sidebar-action-btn theme-toggle" onclick="toggleTheme()" title="تبديل الوضع">
                    <svg class="sun-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        stroke-width="2">
                        <circle cx="12" cy="12" r="5"></circle>
                        <line x1="12" y1="1" x2="12" y2="3"></line>
                        <line x1="12" y1="21" x2="12" y2="23"></line>
                        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                        <line x1="1" y1="12" x2="3" y2="12"></line>
                        <line x1="21" y1="12" x2="23" y2="12"></line>
                        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                    </svg>
                    <svg class="moon-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        stroke-width="2">
                        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                    </svg>
                </button>

                <!-- تسجيل الخروج -->
                <button class="sidebar-action-btn logout-btn" onclick="logout()" title="تسجيل الخروج">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                        <polyline points="16 17 21 12 16 7"></polyline>
                        <line x1="21" y1="12" x2="9" y2="12"></line>
                    </svg>
                </button>
            </div>
        </div>

    </aside>

    <!-- ═══════════════════════════════════════════════════════
         المحتوى الرئيسي
    ═══════════════════════════════════════════════════════ -->
    <main class="main-content" id="main-content">
        <div class="loading">
            <div class="spinner"></div>
        </div>
    </main>

    <!-- المودال -->
    <div class="modal-overlay" id="modal">
        <div class="modal">
            <div class="modal-header">
                <h3 class="modal-title" id="modal-title">عنوان</h3>
                <button class="modal-close">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
            <div class="modal-body" id="modal-body">
                <!-- المحتوى الديناميكي -->
            </div>
        </div>
    </div>

    <!-- رسالة التنبيه -->
    <div class="toast" id="toast"></div>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
    <script src="js/pdf-engine.js"></script>
    <script src="js/app-common.js"></script>
    <script src="js/app-notifications.js"></script>
    <script src="js/app-dashboard.js"></script>
    <script src="js/app-transactions.js"></script>
    <script src="js/app-sla.js"></script>
    <script src="js/app-budget.js"></script>
    <script src="js/app-bank.js"></script>
    <script src="js/app-daily-payments.js"></script>
    <script src="js/app-ceo-approvals.js"></script>
    <script src="js/correspondence.js"></script>
    <script src="js/excel-import-ui.js"></script>
    <script src="js/app-archive.js"></script>
    <script src="js/app-performance.js"></script>
    <script src="js/app-settings-core.js"></script>
    <script src="js/app-settings-budget.js"></script>
    <script src="js/app-settings-employees.js"></script>
    <script src="js/app-settings-system.js"></script>
    <script src="js/app-settings-types.js"></script>
    <script>
    // معلومات المستخدم الحالي
    <?php
if (isset($_SESSION['user_id'])) {
    loadPermissionsForSession((int)$_SESSION['user_id']);
}
?>
    var currentUser = {
        id: <?= $_SESSION['user_id'] ?? 0 ?>,
        name: '<?= addslashes($_SESSION['user_name'] ?? '') ?>',
        role: '<?= $_SESSION['user_role'] ?? '' ?>',
        permissionLevel: '<?= $_SESSION['permission_level'] ?? 'employee' ?>',
        canDelete: <?= !empty($_SESSION['can_delete']) ? 'true' : 'false' ?>,
        pagePermissions: <?= json_encode($_SESSION['page_permissions'] ?? []) ?>,
        actionPermissions: <?= json_encode($_SESSION['action_permissions'] ?? []) ?>,
        departmentId: <?= isset($_SESSION['department_id']) && $_SESSION['department_id'] ? (int)$_SESSION['department_id'] : 'null' ?>,
        departmentName: '<?= addslashes($_SESSION['department_name'] ?? '') ?>'
    };

    // ── تطبيق صلاحيات الصفحات على السايدبار ──────────────────
    (function applyPagePermissions() {
        var perms = currentUser.pagePermissions || {};

        document.querySelectorAll('.nav-tab[data-tab]').forEach(function(btn) {
            var tab = btn.dataset.tab;
            if (tab && perms.hasOwnProperty(tab) && !perms[tab]) {
                btn.style.display = 'none';
            }
        });

        // أول تبويب مسموح به (يُستخدم عند التحميل الأولي)
        window._firstAllowedTab = function() {
            var order = ['dashboard', 'notifications', 'transactions', 'bank-deposits',
                'correspondence', 'reservations', 'sla', 'performance', 'settings'
            ];
            for (var i = 0; i < order.length; i++) {
                var t = order[i];
                if (!perms.hasOwnProperty(t) || perms[t]) return t;
            }
            return 'notifications';
        };
    })();
    </script>
    <script src="js/sidebar-init.js"></script>
    <script src="js/app-profile.js"></script>
</body>

</html>