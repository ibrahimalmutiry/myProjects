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
    <!-- في index.php في <head> -->
    <link rel="stylesheet" href="css/correspondence.css">
    <link rel="icon"
        href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚡</text></svg>">
</head>

<body>
    <!-- الخلفية -->
    <div class="bg-gradient"></div>
    <div class="bg-blob bg-blob-1"></div>
    <div class="bg-blob bg-blob-2"></div>

    <!-- شريط التنقل -->
    <nav class="navbar">
        <div class="navbar-container">
            <div class="logo">
                <div class="logo-icon">⚡</div>
                <div class="logo-text">
                    <h1 data-i18n="app_title">نظام إدارة معاملات القطاع المالي</h1>
                    <span data-i18n="app_subtitle">Workflow Management System</span>
                </div>
            </div>

            <!-- استبدل القسم الحالي بهذا -->
            <div class="nav-tabs">
                <button class="nav-tab active" data-tab="dashboard">📊 لوحة التحكم</button>
                <button class="nav-tab" data-tab="transactions">💰 المعاملات المالية</button>
                <button class="nav-tab" data-tab="correspondence">📨 الخطابات</button>
                <button class="nav-tab" data-tab="settings">⚙️ الإعدادات</button>
            </div>

            <div class="nav-actions">
                <div class="user-info">
                    <div class="user-avatar"><?= mb_substr($userName, 0, 1) ?></div>
                    <div class="user-details">
                        <span class="user-name"><?= htmlspecialchars($userName) ?></span>
                        <span class="user-role"><?= htmlspecialchars(getRoleName($userRole)) ?></span>
                        <span class="user-number"><?= htmlspecialchars($_SESSION['employee_number'] ?? '') ?></span>
                    </div>
                </div>
                <button class="theme-toggle" onclick="toggleTheme()" data-i18n-title="toggle_theme" title="تبديل الوضع">
                    <svg class="sun-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
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
                    <svg class="moon-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        stroke-width="2">
                        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                    </svg>
                </button>
                <!-- <button class="lang-toggle" onclick="toggleLanguage()" data-i18n-title="change_language"
                    title="تغيير اللغة">
                    <svg class="lang-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="2" y1="12" x2="22" y2="12"></line>
                        <path
                            d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z">
                        </path>
                    </svg>
                </button> -->
                <button class="notification-btn" data-i18n-title="notifications" title="التنبيهات">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                        <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                    </svg>
                    <span class="notification-badge" id="notification-badge"
                        style="<?= $stats['urgent'] > 0 ? '' : 'display:none' ?>">
                        <?= $stats['urgent'] ?>
                    </span>
                </button>
                <!-- زر دليل المستخدم -->
                <button class="guide-btn" onclick="openUserGuide()" title="دليل المستخدم 📚">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                    </svg>
                </button>
                <button class="logout-btn" onclick="logout()" data-i18n-title="logout" title="تسجيل الخروج">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                        <polyline points="16 17 21 12 16 7"></polyline>
                        <line x1="21" y1="12" x2="9" y2="12"></line>
                    </svg>
                </button>
            </div>
        </div>
    </nav>

    <!-- المحتوى الرئيسي -->
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

    <script src="js/app.js"></script>
    <script src="js/correspondence.js"></script>
    <script>
    // معلومات المستخدم الحالي
    var currentUser = {
        id: <?= $_SESSION['user_id'] ?? 0 ?>,
        name: '<?= addslashes($_SESSION['user_name'] ?? '') ?>',
        role: '<?= $_SESSION['user_role'] ?? '' ?>'
    };
    </script>
</body>

</html>