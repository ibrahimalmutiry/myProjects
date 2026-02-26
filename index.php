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
    <link rel="icon"
        href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚡</text></svg>">
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
            <div class="sidebar-logo-icon">⚡</div>
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

            <button class="nav-tab" data-tab="bank-deposits" data-tooltip="الودائع البنكية">
                <span class="nav-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="2" y="7" width="20" height="14" rx="2"></rect>
                        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
                    </svg>
                </span>
                <span class="nav-label">الودائع البنكية</span>
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

            <span class="nav-group-label">المتابعة</span>

            <button class="nav-tab" data-tab="reservations" data-tooltip="الحجوزات">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <line x1="10" y1="9" x2="8" y2="9" />
                </svg>
                <span class="nav-label">الحجوزات</span>
            </button>
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
            <div class="sidebar-user">
                <div class="user-avatar"><?= mb_substr($userName, 0, 1) ?></div>
                <div class="user-details">
                    <span class="user-name"><?= htmlspecialchars($userName) ?></span>
                    <span class="user-role"><?= htmlspecialchars(getRoleName($userRole)) ?></span>
                    <?php if (!empty($_SESSION['employee_number'])): ?>
                    <span class="user-number"><?= htmlspecialchars($_SESSION['employee_number']) ?></span>
                    <?php endif; ?>
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

    <script src="js/app-common.js"></script>
    <script src="js/app-notifications.js"></script>
    <script src="js/app-dashboard.js"></script>
    <script src="js/app-transactions.js"></script>
    <script src="js/app-sla.js"></script>
    <script src="js/app-budget.js"></script>
    <script src="js/app-bank.js"></script>
    <script src="js/correspondence.js"></script>

    <script>
    // معلومات المستخدم الحالي
    <?php
// تحميل صلاحيات الجلسة — يعمل حتى لو لم تُنفَّذ migration بعد
function loadPermissionsForSession($userId) {
    $conn = db();
    $userId = (int)$userId;
    
    // تحقق من وجود العمود أولاً
    $chk = $conn->query("SHOW COLUMNS FROM employees LIKE 'permission_level'");
    if (!$chk || $chk->num_rows === 0) {
        // العمود غير موجود → admin يحصل على system_admin
        $r = $conn->query("SELECT role FROM employees WHERE id=$userId LIMIT 1");
        $row = $r ? $r->fetch_assoc() : null;
        if ($row && $row['role'] === 'admin') {
            $_SESSION['permission_level'] = 'system_admin';
            $_SESSION['can_delete'] = true;
        } else {
            $_SESSION['permission_level'] = 'employee';
            $_SESSION['can_delete'] = false;
        }
        $allPages = ['dashboard','transactions','correspondence','bank-deposits','sla','performance','settings','notifications'];
        $_SESSION['page_permissions'] = array_fill_keys($allPages, ($_SESSION['permission_level'] === 'system_admin'));
        return;
    }
    
    $r = $conn->query("SELECT role, permission_level, can_delete FROM employees WHERE id=$userId LIMIT 1");
    if (!$r || !($row = $r->fetch_assoc())) return;
    
    // إصلاح: admin دائماً system_admin
    if ($row['role'] === 'admin' && $row['permission_level'] !== 'system_admin') {
        $conn->query("UPDATE employees SET permission_level='system_admin', can_delete=1 WHERE id=$userId");
        $row['permission_level'] = 'system_admin';
        $row['can_delete'] = 1;
    }
    
    $_SESSION['permission_level'] = $row['permission_level'];
    $_SESSION['can_delete'] = (bool)$row['can_delete'];
    
    $allPages = ['dashboard','transactions','correspondence','bank-deposits','sla','performance','settings','notifications'];
    
    if ($row['permission_level'] === 'system_admin') {
        $_SESSION['page_permissions'] = array_fill_keys($allPages, true);
    } else {
        // جلب من الجدول إن وجد
        $chkTbl = $conn->query("SHOW TABLES LIKE 'employee_page_permissions'");
        $stored = [];
        if ($chkTbl && $chkTbl->num_rows > 0) {
            $r2 = $conn->query("SELECT page, can_access FROM employee_page_permissions WHERE employee_id=$userId");
            if ($r2) while ($pr = $r2->fetch_assoc()) $stored[$pr['page']] = (bool)$pr['can_access'];
        }
        $defaults = [
            'manager'  => ['dashboard'=>1,'transactions'=>1,'correspondence'=>1,'bank-deposits'=>1,'sla'=>1,'performance'=>1,'settings'=>0,'notifications'=>1],
            'employee' => ['dashboard'=>0,'transactions'=>1,'correspondence'=>1,'bank-deposits'=>1,'sla'=>0,'performance'=>0,'settings'=>0,'notifications'=>1],
        ];
        $def = $defaults[$row['permission_level']] ?? [];
        $pagePerms = [];
        foreach ($allPages as $p) {
            $pagePerms[$p] = isset($stored[$p]) ? $stored[$p] : (bool)($def[$p] ?? false);
        }
        $_SESSION['page_permissions'] = $pagePerms;
    }
}

// تحميل الصلاحيات إذا لم تكن في الجلسة
if (!isset($_SESSION['permission_level']) && isset($_SESSION['user_id'])) {
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
        actionPermissions: <?= json_encode($_SESSION['action_permissions'] ?? []) ?>
    };

    // ── تطبيق صلاحيات الصفحات على السايدبار ──────────────────
    (function applyPagePermissions() {
        var perms = currentUser.pagePermissions || {};

        document.querySelectorAll('.nav-tab[data-tab]').forEach(function(btn) {
            var tab = btn.dataset.tab;
            if (tab && perms.hasOwnProperty(tab)) {
                if (!perms[tab]) {
                    btn.style.display = 'none'; // إخفاء كامل من السايدبار
                }
            }
        });
    })();

    // ══════════════════════════════════════════════════════
    //  إدارة السايدبار
    // ══════════════════════════════════════════════════════
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const COLLAPSED_KEY = 'sidebar_collapsed';

    // استعادة الحالة المحفوظة
    (function initSidebar() {
        const saved = localStorage.getItem(COLLAPSED_KEY);
        if (saved === '1') {
            sidebar.classList.add('collapsed');
        }
        // على الشاشات المتوسطة: collapsed افتراضي
        if (window.innerWidth <= 1100 && window.innerWidth > 768) {
            sidebar.classList.remove('collapsed');
            sidebar.classList.remove('expanded');
        }
    })();

    // طي/توسيع على الشاشات الكبيرة
    function toggleSidebar() {
        if (window.innerWidth <= 768) return;
        if (window.innerWidth <= 1100) {
            sidebar.classList.toggle('expanded');
            return;
        }
        sidebar.classList.toggle('collapsed');
        localStorage.setItem(COLLAPSED_KEY, sidebar.classList.contains('collapsed') ? '1' : '0');
        updateTogglePosition();
    }

    // تحديث موضع الزر حسب حالة السايدبار
    function updateTogglePosition() {
        const toggle = document.getElementById('sidebarToggle');
        if (!toggle) return;
        const isCollapsed = sidebar.classList.contains('collapsed');
        const width = isCollapsed ?
            getComputedStyle(document.documentElement).getPropertyValue('--sidebar-collapsed').trim() :
            getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width').trim();
        toggle.style.right = 'calc(' + width + ' - 14px)';
    }

    // فتح/إغلاق على الموبايل
    function toggleMobileSidebar() {
        sidebar.classList.toggle('mobile-open');
        overlay.classList.toggle('active');
        document.body.style.overflow = sidebar.classList.contains('mobile-open') ? 'hidden' : '';
    }

    // إغلاق الموبايل عند اختيار تبويب
    document.querySelectorAll('.nav-tab').forEach(function(tab) {
        tab.addEventListener('click', function() {
            if (window.innerWidth <= 768) {
                sidebar.classList.remove('mobile-open');
                overlay.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    });

    // ضبط عند تغيير حجم الشاشة
    window.addEventListener('resize', function() {
        if (window.innerWidth > 768) {
            sidebar.classList.remove('mobile-open');
            overlay.classList.remove('active');
            document.body.style.overflow = '';
        }
    });
    </script>
</body>

</html>