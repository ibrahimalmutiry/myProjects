/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║       REPORTS_INTEGRATION_GUIDE.js — دليل التكامل الكامل            ║
 * ║       تعليمات إضافة صفحة التقارير لنظام إدارة المعاملات            ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * الملفات التي يجب نسخها إلى المشروع:
 * ┌──────────────────────────────────────────────────────────────────┐
 * │  app-reports.js   →  js/app-reports.js    (أو الجذر)            │
 * │  reports.css      →  css/reports.css                            │
 * │  reports_api.php  →  api/reports_api.php                        │
 * └──────────────────────────────────────────────────────────────────┘
 *
 * ══════════════════════════════════════════════════════════════════════
 * الخطوة 1: إضافة CSS في index.php
 * ══════════════════════════════════════════════════════════════════════
 * أضف السطر التالي في <head> بعد آخر link لـ CSS:
 *
 *   <link rel="stylesheet" href="css/reports.css">
 *
 * ══════════════════════════════════════════════════════════════════════
 * الخطوة 2: إضافة زر التقارير في الـ Sidebar (index.php)
 * ══════════════════════════════════════════════════════════════════════
 * ابحث عن المجموعة المناسبة في nav (مثلاً بعد "المتابعة") وأضف:
 *
 *   <span class="nav-group-label">التقارير</span>
 *
 *   <button class="nav-tab" data-tab="reports" data-tooltip="مركز التقارير">
 *       <span class="nav-icon">
 *           <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
 *                stroke="currentColor" stroke-width="2">
 *               <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12
 *                        a2 2 0 0 0 2-2V8z"/>
 *               <polyline points="14 2 14 8 20 8"/>
 *               <line x1="16" y1="13" x2="8" y2="13"/>
 *               <line x1="16" y1="17" x2="8" y2="17"/>
 *               <line x1="10" y1="9"  x2="8" y2="9"/>
 *           </svg>
 *       </span>
 *       <span class="nav-label">مركز التقارير</span>
 *   </button>
 *
 * ══════════════════════════════════════════════════════════════════════
 * الخطوة 3: تعديل switchTab في app-common.js
 * ══════════════════════════════════════════════════════════════════════
 * ابحث عن:
 *   } else if (tab === 'purchase-requests') {
 *       if (typeof loadPurchaseRequestsPage === 'function') loadPurchaseRequestsPage();
 *   }
 *
 * أضف بعدها:
 *   } else if (tab === 'reports') {
 *       if (typeof loadReportsPage === 'function') loadReportsPage();
 *   }
 *
 * ══════════════════════════════════════════════════════════════════════
 * الخطوة 4: إضافة السكريبت في index.php
 * ══════════════════════════════════════════════════════════════════════
 * أضف قبل إغلاق </body>:
 *
 *   <script src="js/app-reports.js"></script>
 *
 * (أو إذا كنت تستخدم الـ bundle: أضف app-reports.js في build.js)
 *
 * ══════════════════════════════════════════════════════════════════════
 * الخطوة 5: إضافة صلاحيات الصفحة (settings.php)
 * ══════════════════════════════════════════════════════════════════════
 * ابحث في ملف settings.php عن مصفوفة $allPages وأضف 'reports':
 *
 *   $allPages = ['dashboard','notifications','transactions',...,'reports'];
 *
 * وفي مصفوفة $defaults لكل مستوى:
 *   'system_admin' => [..., 'reports' => 1],
 *   'manager'      => [..., 'reports' => 1],
 *   'employee_l1'  => [..., 'reports' => 1],
 *   'employee'     => [..., 'reports' => 0],
 *
 * ══════════════════════════════════════════════════════════════════════
 * الخطوة 6: تحديث الـ build.js (اختياري)
 * ══════════════════════════════════════════════════════════════════════
 * إذا كنت تستخدم الـ bundle، أضف 'app-reports.js' في ملف build.js:
 *
 *   const files = [
 *       ...
 *       'app-reports.js',   // ← أضف هنا
 *       'theme-editor.js'
 *   ];
 *
 * ══════════════════════════════════════════════════════════════════════
 * ملاحظات للتطوير المستقبلي
 * ══════════════════════════════════════════════════════════════════════
 *
 * إضافة تقرير جديد:
 * ─────────────────
 * فقط أضف كائناً جديداً في مصفوفة REPORT_DEFINITIONS في app-reports.js:
 *
 *   {
 *       id:          'my_new_report',
 *       category:    'financial',           // financial | operations | hr
 *       icon:        '📈',
 *       color:       '#228be6',
 *       gradient:    'linear-gradient(135deg, #228be6, #15aabf)',
 *       title:       'عنوان التقرير',
 *       description: 'وصف مختصر للتقرير',
 *       apiEndpoint: 'api/reports_api.php?action=my_new_report',
 *       columns: [
 *           { key: 'id',     label: 'الرقم',  width: '10%' },
 *           { key: 'name',   label: 'الاسم',  width: '40%' },
 *           { key: 'amount', label: 'المبلغ', width: '25%', format: 'money' },
 *           { key: 'date',   label: 'التاريخ',width: '25%', format: 'date'  },
 *       ],
 *       defaultColumns: ['id', 'name', 'amount', 'date'],
 *       hasChart: true,
 *       hasSummaryCards: true,
 *       filters: ['date', 'status', 'search']
 *   }
 *
 * أنواع format المتاحة:
 *   'money'   → تنسيق مالي مع ر.س
 *   'badge'   → شارة ملونة حسب الحالة
 *   'date'    → تاريخ بالعربية
 *   'percent' → نسبة مئوية
 *   (بدون format) → نص عادي
 *
 * أنواع filters المتاحة:
 *   'date'       → من تاريخ / إلى تاريخ
 *   'status'     → فلتر الحالة
 *   'priority'   → فلتر الأولوية
 *   'search'     → بحث نصي
 *   'user'       → فلتر المستخدم
 *   'department' → فلتر الإدارة
 */

// ══════════════════════════════════════════════════════════════════════
// Patch جاهز لـ app-common.js — انسخ هذا الكود والصقه في المكان الصحيح
// ══════════════════════════════════════════════════════════════════════

/*
// في دالة switchTab، أضف هذا بعد آخر } else if:
} else if (tab === 'reports') {
    if (typeof loadReportsPage === 'function') loadReportsPage();
}
*/


// ══════════════════════════════════════════════════════════════════════
// HTML Snippet للـ Sidebar — انسخ والصق في index.php
// ══════════════════════════════════════════════════════════════════════

const SIDEBAR_SNIPPET = `
<!-- ══ التقارير ══ -->
<span class="nav-group-label" data-tr="التقارير">التقارير</span>

<button class="nav-tab" data-tab="reports" data-tooltip="مركز التقارير">
    <span class="nav-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <line x1="10" y1="9" x2="8" y2="9"/>
        </svg>
    </span>
    <span class="nav-label" data-tr="مركز التقارير">مركز التقارير</span>
</button>
`;

// ══════════════════════════════════════════════════════════════════════
// اختبار التحميل
// ══════════════════════════════════════════════════════════════════════
console.log('📊 دليل التكامل — مركز التقارير محمّل. اتبع التعليمات أعلاه.');
