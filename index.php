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

// ── كشف Bundle JS المضغوط ──────────────────────────────────
// يبحث أولاً في الجذر، ثم في js/dist/
$jsBundleFile = null;

// المسارات المحتملة لـ manifest.json
$_manifestPaths = [
    ['manifest' => __DIR__ . '/manifest.json',        'prefix' => ''],
    ['manifest' => __DIR__ . '/js/dist/manifest.json', 'prefix' => 'js/dist/'],
];

foreach ($_manifestPaths as $_mp) {
    if (file_exists($_mp['manifest'])) {
        $_manifest = json_decode(file_get_contents($_mp['manifest']), true);
        if (!empty($_manifest['bundle'])) {
            $_bundleFull = __DIR__ . '/' . $_mp['prefix'] . $_manifest['bundle'];
            if (file_exists($_bundleFull)) {
                $jsBundleFile = $_mp['prefix'] . $_manifest['bundle'];
                break;
            }
        }
    }
}
// ──────────────────────────────────────────────────────────

// الحصول على الإحصائيات للشارة
$stats = getStats();
$userName = $_SESSION['user_name'] ?? 'المستخدم';
$userRole = $_SESSION['user_role'] ?? '';

// ── اللغة: اقرأ من Cookie أو localStorage عبر PHP ──────────
// localStorage لا يُقرأ من PHP، لذا نستخدم Cookie كمزامن
$appLang = 'ar';
if (!empty($_COOKIE['app_language']) && in_array($_COOKIE['app_language'], ['ar', 'en'])) {
    $appLang = $_COOKIE['app_language'];
}
$htmlDir  = $appLang === 'en' ? 'ltr' : 'rtl';
?>
<!DOCTYPE html>
<html lang="<?= $appLang ?>" dir="<?= $htmlDir ?>" data-theme="light" data-lang="<?= $appLang ?>">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>نظام إدارة معاملات القطاع المالي</title>
    <link rel="stylesheet" href="css/style.css">
    <link rel="stylesheet" href="css/sidebar.css">
    <link rel="stylesheet" href="css/bank_combined.css">
    <link rel="stylesheet" href="css/db-admin.css">
    <link rel="stylesheet" href="css/rtl-ltr.css">
    <link rel="stylesheet" href="css/investment_styles.css">
    <link rel="stylesheet" href="css/correspondence.css">
    <link rel="stylesheet" href="css/dashboard-redesign.css">
    <link rel="stylesheet" href="css/bank-rows.css">
    <link rel="stylesheet" href="css/daily-payments.css">
    <link rel="stylesheet" href="css/ceo-approvals.css">
    <link rel="stylesheet" href="css/archive.css">
    <link rel="stylesheet" href="css/purchase-requests.css">
    <link rel="stylesheet" href="css/reports.css">
    <link rel="icon" href="images/logo.png">
    <!-- خطوط متعددة اللغات -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link
        href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&family=Inter:wght@300;400;500;600;700&display=swap"
        rel="stylesheet">
    <style>
    /* ── الخطوط حسب اللغة ── */
    :root {
        --font-ar: 'IBM Plex Sans Arabic', 'Segoe UI', sans-serif;
        --font-en: 'Inter', 'Segoe UI', sans-serif;
    }

    html[lang="ar"],
    html[data-lang="ar"] {
        font-family: var(--font-ar) !important;
    }

    html[lang="en"],
    html[data-lang="en"] {
        font-family: var(--font-en) !important;
    }

    html[lang="ar"] *,
    html[data-lang="ar"] * {
        font-family: var(--font-ar) !important;
    }

    html[lang="en"] *,
    html[data-lang="en"] * {
        font-family: var(--font-en) !important;
    }

    /* استثناء الأيقونات والرموز */
    html .sar-symbol {
        font-family: 'saudi_riyal' !important;
    }
    </style>
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

            <span class="nav-group-label" data-i18n="nav_main">الرئيسية</span>

            <button class="nav-tab active" data-tab="dashboard" data-tooltip="لوحة التحكم" data-i18n-title="dashboard">
                <span class="nav-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="3" width="7" height="7"></rect>
                        <rect x="14" y="3" width="7" height="7"></rect>
                        <rect x="14" y="14" width="7" height="7"></rect>
                        <rect x="3" y="14" width="7" height="7"></rect>
                    </svg>
                </span>
                <span class="nav-label" data-i18n="dashboard">لوحة التحكم</span>
            </button>

            <button class="nav-tab" data-tab="notifications" data-tooltip="التنبيهات" data-i18n-title="notifications">
                <span class="nav-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                        <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                    </svg>
                </span>
                <span class="nav-label" data-i18n="notifications">التنبيهات</span>
                <span class="nav-badge" id="notification-badge" style="display:none">0</span>
            </button>

            <span class="nav-group-label" data-i18n="transactions">المعاملات</span>

            <button class="nav-tab" data-tab="transactions" data-tooltip="المعاملات المالية">
                <span class="nav-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="1" x2="12" y2="23"></line>
                        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                    </svg>
                </span>
                <span class="nav-label" data-tr="المعاملات المالية">المعاملات المالية</span>
            </button>

            <button class="nav-tab" data-tab="correspondence" data-tooltip="الخطابات">
                <span class="nav-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                        <polyline points="22,6 12,13 2,6"></polyline>
                    </svg>
                </span>
                <span class="nav-label" data-tr="الخطابات">الخطابات</span>
            </button>

            <button class="nav-tab" data-tab="purchase-requests" data-tooltip="المعاملات">
                <span class="nav-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                    </svg>
                </span>
                <span class="nav-label" data-tr="المعاملات">المعاملات</span>
                <span class="nav-badge" id="pr-badge" style="display:none">0</span>
            </button>


            <!-- ══ التخطيط والموازنة ══ -->
            <span class="nav-group-label" data-tr="التخطيط والموازنة">التخطيط والموازنة</span>

            <button class="nav-tab" data-tab="reservations" data-tooltip="حجوزات الموازنة"
                onclick="openBudgetSubTab('reservations')">
                <span class="nav-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                        <polyline points="17 21 17 13 7 13 7 21" />
                        <polyline points="7 3 7 8 15 8" />
                    </svg>
                </span>
                <span class="nav-label" data-tr="حجوزات الموازنة">حجوزات الموازنة</span>
            </button>

            <button class="nav-tab" data-tab="budget-plans" data-tooltip="الموازنة التقديرية"
                onclick="openBudgetSubTab('plans')">
                <span class="nav-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="20" x2="18" y2="10" />
                        <line x1="12" y1="20" x2="12" y2="4" />
                        <line x1="6" y1="20" x2="6" y2="14" />
                        <line x1="2" y1="20" x2="22" y2="20" />
                    </svg>
                </span>
                <span class="nav-label" data-tr="الموازنة التقديرية">الموازنة التقديرية</span>
            </button>

            <!-- ══ الخزينة ══ -->
            <span class="nav-group-label" data-tr="الخزينة">الخزينة</span>

            <button class="nav-tab" data-tab="bank-overview" data-tooltip="نظرة عامة"
                onclick="openBankSubTab('overview','treasury')">
                <span class="nav-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                    </svg>
                </span>
                <span class="nav-label" data-tr="نظرة عامة">نظرة عامة</span>
            </button>

            <button class="nav-tab" data-tab="bank-accounts" data-tooltip="الحسابات البنكية"
                onclick="openBankSubTab('accounts','treasury')">
                <span class="nav-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="2" y="7" width="20" height="14" rx="2" />
                        <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
                        <line x1="12" y1="12" x2="12" y2="16" />
                        <circle cx="12" cy="17" r="1" fill="currentColor" />
                    </svg>
                </span>
                <span class="nav-label" data-tr="الحسابات البنكية">الحسابات البنكية</span>
            </button>

            <button class="nav-tab" data-tab="bank-investments" data-tooltip="الودائع الاستثمارية"
                onclick="openBankSubTab('investments','treasury')">
                <span class="nav-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                        <polyline points="17 6 23 6 23 12" />
                    </svg>
                </span>
                <span class="nav-label" data-tr="الودائع الاستثمارية">الودائع الاستثمارية</span>
            </button>

            <button class="nav-tab" data-tab="daily-payments" data-tooltip="المدفوعات اليومية"
                onclick="openTab('daily-payments','treasury')">
                <span class="nav-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                        <line x1="1" y1="10" x2="23" y2="10" />
                    </svg>
                </span>
                <span class="nav-label" data-tr="المدفوعات اليومية">المدفوعات اليومية</span>
            </button>

            <!-- ══ الأرشيف المالي ══ -->
            <span class="nav-group-label" data-tr="الأرشيف المالي">الأرشيف المالي</span>

            <button class="nav-tab" data-tab="archive-all" data-tooltip="جميع المستندات"
                onclick="openArchiveSub('all')">
                <span class="nav-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="21 8 21 21 3 21 3 8" />
                        <rect x="1" y="3" width="22" height="5" />
                        <line x1="10" y1="12" x2="14" y2="12" />
                    </svg>
                </span>
                <span class="nav-label" data-tr="جميع المستندات">جميع المستندات</span>
                <span class="nav-badge" id="archive-expiry-badge" style="display:none">!</span>
            </button>

            <button class="nav-tab" data-tab="archive-operational" data-tooltip="مستندات تشغيلية"
                onclick="openArchiveSub('operational')">
                <span class="nav-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                        <polyline points="10 9 9 9 8 9" />
                    </svg>
                </span>
                <span class="nav-label" data-tr="مستندات تشغيلية">مستندات تشغيلية</span>
            </button>

            <button class="nav-tab" data-tab="archive-financial" data-tooltip="مستندات مالية"
                onclick="openArchiveSub('financial')">
                <span class="nav-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="1" x2="12" y2="23" />
                        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                    </svg>
                </span>
                <span class="nav-label" data-tr="مستندات مالية">مستندات مالية</span>
            </button>

            <button class="nav-tab" data-tab="archive-reports" data-tooltip="تقارير وموازنة"
                onclick="openArchiveSub('reports')">
                <span class="nav-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
                        <path d="M22 12A10 10 0 0 0 12 2v10z" />
                    </svg>
                </span>
                <span class="nav-label" data-tr="تقارير وموازنة">تقارير وموازنة</span>
            </button>

            <button class="nav-tab" data-tab="archive-official" data-tooltip="وثائق رسمية"
                onclick="openArchiveSub('official')">
                <span class="nav-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                        <polyline points="9 22 9 12 15 12 15 22" />
                    </svg>
                </span>
                <span class="nav-label" data-tr="وثائق رسمية">وثائق رسمية</span>
            </button>

            <button class="nav-tab" data-tab="archive-renewals" data-tooltip="التجديد والصلاحيات"
                onclick="openArchiveSub('renewals')">
                <span class="nav-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="23 4 23 10 17 10" />
                        <polyline points="1 20 1 14 7 14" />
                        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                    </svg>
                </span>
                <span class="nav-label" data-tr="التجديد والصلاحيات">التجديد والصلاحيات</span>
            </button>

            <span class="nav-group-label" data-tr="المتابعة">المتابعة</span>

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
                <span class="nav-label" data-tr="متابعة الأداء">متابعة الأداء</span>
            </button>
            <?php if (in_array($_SESSION['user_role'] ?? '', ['ceo','admin','system_admin'])): ?>
            <button class="nav-tab" data-tab="ceo-approvals" data-tooltip="اعتمادات الرئيس التنفيذي">
                <span class="nav-icon">🏛️</span>
                <span class="nav-label" data-tr="اعتمادات الرئيس التنفيذي">اعتمادات الرئيس التنفيذي</span>
            </button>
            <?php endif; ?>
            <!-- ══ التقارير ══ -->
            <?php
            $userRole2  = $_SESSION['user_role']        ?? '';
            $userPerm2  = $_SESSION['permission_level'] ?? '';
            $financialRoles = ['admin','system_admin','CEO','sector_head','division_manager',
                               'budget','treasury_manager','payment','invoice','purchasing'];
            $showReports = in_array($userRole2, $financialRoles)
                        || in_array($userPerm2, ['system_admin','CEO','sector_head','division_manager','employee_l1']);
            if ($showReports):
            ?>
            <span class="nav-group-label" data-tr="التقارير">التقارير</span>

            <button class="nav-tab" data-tab="reports" data-tooltip="مركز التقارير">
                <span class="nav-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                        <line x1="10" y1="9" x2="8" y2="9" />
                    </svg>
                </span>
                <span class="nav-label" data-tr="مركز التقارير">مركز التقارير</span>
            </button>
            <?php endif; ?>

            <span class="nav-group-label" data-tr="النظام">النظام</span>

            <button class="nav-tab" data-tab="settings" data-tooltip="الإعدادات">
                <span class="nav-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="3"></circle>
                        <path
                            d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z">
                        </path>
                    </svg>
                </span>
                <span class="nav-label" data-tr="الإعدادات">الإعدادات</span>
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
                <button class="sidebar-action-btn theme-toggle" onclick="toggleTheme()" title="تبديل الوضع"
                    data-i18n-title="toggle_theme">
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

                <!-- زر تبديل اللغة -->
                <button class="sidebar-action-btn lang-toggle-btn" id="langToggleBtn" onclick="toggleLanguage()"
                    title="تغيير اللغة" aria-label="Toggle Language" data-i18n-title="change_language">
                    <span class="lang-toggle-inner">
                        <span class="lang-flag lang-flag-ar" aria-hidden="true">🇸🇦</span>
                        <span class="lang-flag lang-flag-en" aria-hidden="true">🇬🇧</span>
                        <span class="lang-code" id="langCode">EN</span>
                    </span>
                </button>

                <!-- تسجيل الخروج -->
                <button class="sidebar-action-btn logout-btn" onclick="logout()" title="تسجيل الخروج"
                    data-i18n-title="logout">
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
            <!-- ✅ أضف هذا السطر -->
            <div class="modal-footer" id="modal-footer"></div>
        </div>
    </div>

    <!-- رسالة التنبيه -->
    <div class="toast" id="toast"></div>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
    <?php
        // كشف مسار الملفات الفردية: في js/ أو في الجذر
        $_jsPrefix = file_exists(__DIR__ . '/js/pdf-engine.js') ? 'js/' : '';
    ?>
    <?php if ($jsBundleFile): ?>
    <!-- ✅ Bundle مضغوط — أُنشئ بـ: node build.js -->
    <script src="<?= htmlspecialchars($jsBundleFile) ?>"></script>
    <!-- theme-editor خارج الـ bundle لأنه يُحمَّل منفصلاً -->
    <script src="<?= $_jsPrefix ?>theme-editor.js"></script>
    <?php else: ?>
    <!-- ⚡ Fallback: الملفات الفردية -->
    <script src="<?= $_jsPrefix ?>pdf-engine.js"></script>
    <script src="<?= $_jsPrefix ?>app-common.js"></script>
    <script src="<?= $_jsPrefix ?>app-i18n.js"></script>
    <script src="<?= $_jsPrefix ?>app-notifications.js"></script>
    <script src="<?= $_jsPrefix ?>app-dashboard.js"></script>
    <script src="<?= $_jsPrefix ?>app-transactions.js"></script>
    <script src="<?= $_jsPrefix ?>app-sla.js"></script>
    <script src="<?= $_jsPrefix ?>app-budget.js"></script>
    <script src="<?= $_jsPrefix ?>app-bank.js"></script>
    <script src="<?= $_jsPrefix ?>app-daily-payments.js"></script>
    <script src="<?= $_jsPrefix ?>app-ceo-approvals.js"></script>
    <script src="<?= $_jsPrefix ?>correspondence.js"></script>
    <script src="<?= $_jsPrefix ?>excel-import-ui.js"></script>
    <script src="<?= $_jsPrefix ?>app-archive.js"></script>
    <script src="<?= $_jsPrefix ?>app-performance.js"></script>
    <script src="<?= $_jsPrefix ?>app-settings-core.js"></script>
    <script src="<?= $_jsPrefix ?>app-settings-budget.js"></script>
    <script src="<?= $_jsPrefix ?>app-settings-employees.js"></script>
    <script src="<?= $_jsPrefix ?>app-settings-system.js"></script>
    <script src="<?= $_jsPrefix ?>app-settings-suppliers.js"></script>
    <script src="<?= $_jsPrefix ?>app-settings-types.js"></script>
    <script src="<?= $_jsPrefix ?>sidebar-init.js"></script>
    <script src="<?= $_jsPrefix ?>app-profile.js"></script>
    <script src="<?= $_jsPrefix ?>app-purchase-requests.js"></script>
    <script src="<?= $_jsPrefix ?>app-reports.js"></script>
    <script src="<?= $_jsPrefix ?>theme-editor.js"></script>
    <?php endif; ?>

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
        permissionLevelCode: '<?= $_SESSION['permission_level_code'] ?? $_SESSION['permission_level'] ?? 'employee' ?>',
        canDelete: <?= !empty($_SESSION['can_delete']) ? 'true' : 'false' ?>,
        pagePermissions: <?= json_encode($_SESSION['page_permissions'] ?? []) ?>,
        actionPermissions: <?= json_encode($_SESSION['action_permissions'] ?? []) ?>,
        departmentId: <?= isset($_SESSION['department_id']) && $_SESSION['department_id'] ? (int)$_SESSION['department_id'] : 'null' ?>,
        departmentName: '<?= addslashes($_SESSION['department_name'] ?? '') ?>',
        departmentCode: '<?= addslashes($_SESSION['department_code'] ?? '') ?>'
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
            var order = ['dashboard', 'notifications', 'transactions', 'purchase-requests', 'bank-deposits',
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
</body>

</html>