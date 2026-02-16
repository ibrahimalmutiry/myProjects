<?php
/**
 * صفحة الودائع البنكية ومتابعة الأرصدة
 * Bank Deposits & Balance Tracking Page
 */

session_start();
require_once 'includes/config.php';
require_once 'includes/functions.php';

// التحقق من تسجيل الدخول
if (!isset($_SESSION['user_id'])) {
    header('Location: login.php');
    exit;
}

$pageTitle = 'الودائع البنكية';
$currentPage = 'bank_deposits';
?>
<!DOCTYPE html>
<html lang="ar" dir="rtl" data-theme="light">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo $pageTitle; ?> - نظام إدارة المعاملات</title>
    <link rel="stylesheet" href="style.css">
    <link rel="stylesheet" href="bank_deposits.css">
</head>

<body>
    <!-- Sidebar -->
    <aside class="sidebar" id="sidebar">
        <div class="sidebar-header">
            <div class="logo">
                <svg class="logo-icon" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    stroke-width="2">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                    <polyline points="9 22 9 12 15 12 15 22"></polyline>
                </svg>
                <span class="logo-text">نظام المعاملات</span>
            </div>
            <button class="sidebar-toggle" onclick="toggleSidebar()">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="3" y1="12" x2="21" y2="12"></line>
                    <line x1="3" y1="6" x2="21" y2="6"></line>
                    <line x1="3" y1="18" x2="21" y2="18"></line>
                </svg>
            </button>
        </div>

        <nav class="sidebar-nav">
            <a href="index.php" class="nav-item">
                <svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    stroke-width="2">
                    <rect x="3" y="3" width="7" height="7"></rect>
                    <rect x="14" y="3" width="7" height="7"></rect>
                    <rect x="14" y="14" width="7" height="7"></rect>
                    <rect x="3" y="14" width="7" height="7"></rect>
                </svg>
                <span class="nav-text">لوحة التحكم</span>
            </a>

            <a href="index.php?page=transactions" class="nav-item">
                <svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    stroke-width="2">
                    <line x1="12" y1="1" x2="12" y2="23"></line>
                    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                </svg>
                <span class="nav-text">المعاملات المالية</span>
            </a>

            <a href="index.php?page=correspondence" class="nav-item">
                <svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    stroke-width="2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                    <polyline points="22,6 12,13 2,6"></polyline>
                </svg>
                <span class="nav-text">الخطابات</span>
            </a>

            <a href="bank_deposits.php" class="nav-item active">
                <svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    stroke-width="2">
                    <rect x="2" y="5" width="20" height="14" rx="2"></rect>
                    <path d="M2 10h20"></path>
                </svg>
                <span class="nav-text">الودائع البنكية</span>
            </a>

            <a href="settings.php" class="nav-item">
                <svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    stroke-width="2">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M12 1v6m0 6v6m-9-9h6m6 0h6"></path>
                </svg>
                <span class="nav-text">الإعدادات</span>
            </a>
        </nav>

        <div class="sidebar-footer">
            <div class="user-info">
                <div class="user-avatar">
                    <?php echo strtoupper(substr($_SESSION['user_name'] ?? 'U', 0, 1)); ?>
                </div>
                <div class="user-details">
                    <div class="user-name"><?php echo htmlspecialchars($_SESSION['user_name'] ?? 'مستخدم'); ?></div>
                    <div class="user-role"><?php echo htmlspecialchars($_SESSION['user_role'] ?? 'موظف'); ?></div>
                </div>
            </div>
            <button class="btn-logout" onclick="logout()">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                    <polyline points="16 17 21 12 16 7"></polyline>
                    <line x1="21" y1="12" x2="9" y2="12"></line>
                </svg>
                تسجيل خروج
            </button>
        </div>
    </aside>

    <!-- Main Content -->
    <main class="main-content">
        <!-- Top Bar -->
        <header class="top-bar">
            <div class="top-bar-left">
                <button class="mobile-menu-btn" onclick="toggleSidebar()">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="3" y1="12" x2="21" y2="12"></line>
                        <line x1="3" y1="6" x2="21" y2="6"></line>
                        <line x1="3" y1="18" x2="21" y2="18"></line>
                    </svg>
                </button>
                <h1 class="page-title">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="2" y="5" width="20" height="14" rx="2"></rect>
                        <path d="M2 10h20"></path>
                    </svg>
                    الودائع البنكية والأرصدة
                </h1>
            </div>
            <div class="top-bar-right">
                <div class="search-box">
                    <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="8"></circle>
                        <path d="m21 21-4.35-4.35"></path>
                    </svg>
                    <input type="text" placeholder="بحث..." id="search-input">
                </div>

                <button class="notification-btn" onclick="toggleNotificationsDropdown(event)">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                        <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                    </svg>
                </button>

                <button class="theme-toggle" onclick="toggleTheme()">
                    <svg class="sun-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
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
                    <svg class="moon-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        stroke-width="2" style="display: none;">
                        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                    </svg>
                </button>
            </div>
        </header>

        <!-- Page Content -->
        <div class="page-content">
            <!-- Tabs Navigation -->
            <div class="tabs-container">
                <div class="tabs">
                    <button class="tab-btn active" data-tab="balances">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            stroke-width="2">
                            <line x1="12" y1="1" x2="12" y2="23"></line>
                            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                        </svg>
                        الأرصدة اليومية
                    </button>
                    <button class="tab-btn" data-tab="deposits">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            stroke-width="2">
                            <polyline points="17 11 12 6 7 11"></polyline>
                            <line x1="12" y1="18" x2="12" y2="6"></line>
                        </svg>
                        الودائع البنكية
                    </button>

                    <button class="tab-btn" data-tab="accounts">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            stroke-width="2">
                            <rect x="2" y="5" width="20" height="14" rx="2"></rect>
                            <path d="M2 10h20"></path>
                        </svg>
                        الحسابات البنكية
                    </button>
                </div>
            </div>

            <!-- Tab: الأرصدة اليومية -->
            <div id="balances-tab" class="tab-content active">
                <div class="section-header">
                    <h2>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            stroke-width="2">
                            <line x1="12" y1="1" x2="12" y2="23"></line>
                            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                        </svg>
                        متابعة الأرصدة اليومية
                    </h2>
                    <button class="btn-primary" onclick="openRecordBalanceModal()">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            stroke-width="2">
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                        تسجيل رصيد يومي
                    </button>
                </div>

                <!-- Balance Cards Grid -->
                <div class="balance-cards-grid" id="balance-cards">
                    <!-- سيتم ملؤها ديناميكياً -->
                </div>

                <!-- Daily Balances Table -->
                <div class="card">
                    <div class="card-header">
                        <h3>📊 سجل الأرصدة اليومية</h3>
                        <div class="card-actions">
                            <button class="btn-icon" onclick="exportBalances()">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                    stroke-width="2">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                    <polyline points="7 10 12 15 17 10"></polyline>
                                    <line x1="12" y1="15" x2="12" y2="3"></line>
                                </svg>
                            </button>
                        </div>
                    </div>
                    <div class="card-body">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>التاريخ</th>
                                    <th>الحساب</th>
                                    <th>رصيد افتتاحي</th>
                                    <th>الودائع</th>
                                    <th>السحوبات</th>
                                    <th>رصيد ختامي</th>
                                    <th>الفرق</th>
                                    <th>إجراءات</th>
                                </tr>
                            </thead>
                            <tbody id="daily-balances-table">
                                <!-- سيتم ملؤها ديناميكياً -->
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Tab: الودائع البنكية -->
            <div id="deposits-tab" class="tab-content">
                <div class="section-header">
                    <h2>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            stroke-width="2">
                            <polyline points="17 11 12 6 7 11"></polyline>
                            <line x1="12" y1="18" x2="12" y2="6"></line>
                        </svg>
                        الودائع البنكية
                    </h2>
                    <button class="btn-primary" onclick="openAddDepositModal()">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            stroke-width="2">
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                        إضافة إيداع
                    </button>
                </div>

                <div class="card">
                    <div class="card-body">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>رقم الإيداع</th>
                                    <th>التاريخ</th>
                                    <th>الحساب</th>
                                    <th>المبلغ</th>
                                    <th>النوع</th>
                                    <th>الحالة</th>
                                    <th>إجراءات</th>
                                </tr>
                            </thead>
                            <tbody id="deposits-table">
                                <!-- سيتم ملؤها ديناميكياً -->
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Tab: الحسابات البنكية -->
            <div id="accounts-tab" class="tab-content">
                <div class="section-header">
                    <h2>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            stroke-width="2">
                            <rect x="2" y="5" width="20" height="14" rx="2"></rect>
                            <path d="M2 10h20"></path>
                        </svg>
                        الحسابات البنكية
                    </h2>
                    <button class="btn-primary" onclick="openAddAccountModal()">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            stroke-width="2">
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                        إضافة حساب
                    </button>
                </div>

                <div class="card">
                    <div class="card-body">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>رقم الحساب</th>
                                    <th>اسم الحساب</th>
                                    <th>البنك</th>
                                    <th>النوع</th>
                                    <th>الرصيد الحالي</th>
                                    <th>الحالة</th>
                                    <th>إجراءات</th>
                                </tr>
                            </thead>
                            <tbody id="accounts-table">
                                <!-- سيتم ملؤها ديناميكياً -->
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    </main>

    <!-- Modal Container -->
    <div id="modal-overlay" class="modal-overlay" onclick="closeModal()"></div>
    <div id="modal-container" class="modal-container">
        <!-- سيتم ملؤه ديناميكياً -->
    </div>

    <!-- Toast Container -->
    <div id="toast-container" class="toast-container"></div>

    <!-- Scripts -->
    <script src="app.js"></script>
    <script src="bank_deposits.js"></script>
</body>

</html>