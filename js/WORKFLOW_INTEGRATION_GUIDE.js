/**
 * ════════════════════════════════════════════════════════════
 * تعليمات التطبيق — دليل التعديلات على الملفات الموجودة
 * ════════════════════════════════════════════════════════════
 *
 * الملفات الجديدة (انسخها للمشروع):
 *   ① workflow_config_api.php        ← API إدارة القوالب
 *   ② app-settings-workflow.js       ← واجهة الإعدادات
 *   ③ workflow_pr_patch.php          ← دوال PHP المحدّثة
 *
 * الملفات التي تحتاج تعديل:
 *   ④ pr_functions.php               ← أضف require_once في نهايته
 *   ⑤ pr_create_request patch        ← استبدل سطر تحديد المسار
 *   ⑥ prApproveStage patch           ← استخدم prStageRequiresDualApproval
 *   ⑦ app-settings-core.js           ← أضف تبويب + case
 *   ⑧ build.js                       ← أضف الملف الجديد
 *   ⑨ index.php                      ← أضف <script>
 * ════════════════════════════════════════════════════════════
 */


// ════════════════════════════════════════════════════════════
// التعديل ④ — pr_functions.php
// في نهاية الملف، أضف:
// ════════════════════════════════════════════════════════════
/*
// ── تحميل دوال سير العمل الديناميكية ─────────────────────
require_once __DIR__ . '/workflow_pr_patch.php';
*/


// ════════════════════════════════════════════════════════════
// التعديل ⑤ — في دالة prCreateRequest() بـ pr_functions.php
// ابحث عن هذا السطر:
//   $workflowPath = $amountSar < $threshold ? 'short' : 'long';
// واستبدله بـ:
//   $workflowPath = prSelectWorkflowPath($amountSar);
// ════════════════════════════════════════════════════════════

// السطر الأصلي (ابحث عنه):
// $threshold    = prGetAmountThreshold();
// $workflowPath = $amountSar < $threshold ? 'short' : 'long';

// السطر البديل:
// $workflowPath = prSelectWorkflowPath($amountSar);


// ════════════════════════════════════════════════════════════
// التعديل ⑥ — في دالة prApproveStage() بـ pr_functions.php
// ابحث عن:
//   if (in_array($stage, ['treasury_review', 'finance_review'])) {
//       return prHandleDualApproval($requestId, $employeeId, $stage, $notes);
//   }
// واستبدل الشرط بـ:
//   $req2 = $req ?? prGetRequest($requestId);
//   if (prStageRequiresDualApproval($req2['workflow_path'] ?? 'short', $stage)) {
//       return prHandleDualApproval($requestId, $employeeId, $stage, $notes);
//   }
// ════════════════════════════════════════════════════════════


// ════════════════════════════════════════════════════════════
// التعديل ⑦ — app-settings-core.js
// ════════════════════════════════════════════════════════════

// أ) في دالة loadSettingsPage() — أضف زر تبويب جديد بعد زر "الهوية البصرية":
/*
<button class="settings-tab-btn" data-section="workflow" onclick="showSettingsSection('workflow', this)">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2L2 7l10 5 10-5-10-5z"/>
        <path d="M2 17l10 5 10-5"/>
        <path d="M2 12l10 5 10-5"/>
    </svg>
    مسارات الموافقة
</button>
*/

// ب) في دالة showSettingsSection() — أضف case جديد:
/*
case 'workflow':
    if (typeof renderWorkflowSection === 'function') renderWorkflowSection();
    else document.getElementById('settingsContent').innerHTML =
        '<p style="color:red;padding:2rem">⚠️ أضف app-settings-workflow.js في index.php</p>';
    break;
*/


// ════════════════════════════════════════════════════════════
// التعديل ⑧ — build.js
// في مصفوفة JS_FILES، أضف قبل 'app-purchase-requests.js':
//   'app-settings-workflow.js',
// ════════════════════════════════════════════════════════════
/*
const JS_FILES = [
    ...
    'app-settings-suppliers.js',
    'app-settings-workflow.js',   // ← أضف هذا السطر
    'app-settings-system.js',
    ...
];
*/


// ════════════════════════════════════════════════════════════
// التعديل ⑨ — index.php
// أضف بعد سكريبتات الإعدادات الأخرى:
// ════════════════════════════════════════════════════════════
/*
<!-- إعدادات مسارات الموافقة -->
<script src="app-settings-workflow.js?v=<?= filemtime('app-settings-workflow.js') ?>"></script>
*/
// ملاحظة: إذا كنت تستخدم Bundle فقط أعد تشغيل: node build.js


// ════════════════════════════════════════════════════════════
// ترتيب التطبيق الكامل (خطوة بخطوة)
// ════════════════════════════════════════════════════════════
/*
الخطوة 1: انسخ الملفات الجديدة للمشروع:
  - workflow_config_api.php     → مجلد المشروع (نفس مستوى functions.php)
  - app-settings-workflow.js    → مجلد المشروع
  - workflow_pr_patch.php       → مجلد المشروع (أو includes/)

الخطوة 2: عدّل pr_functions.php:
  - في نهاية الملف أضف: require_once __DIR__ . '/workflow_pr_patch.php';
  - ابحث عن السطر الذي يحتوي: $workflowPath = $amountSar < $threshold ? ...
    وعدّله إلى: $workflowPath = prSelectWorkflowPath($amountSar);
  - في prApproveStage(): عدّل شرط الموافقة المزدوجة كما هو موضح أعلاه

الخطوة 3: عدّل app-settings-core.js:
  - أضف زر تبويب "مسارات الموافقة"
  - أضف case 'workflow' في showSettingsSection()

الخطوة 4: أضف الملف لـ build.js ثم شغّل: node build.js

الخطوة 5: افتح النظام → الإعدادات → "مسارات الموافقة"
  الجداول تُنشأ تلقائياً في أول طلب
  بيانات المسار القصير والطويل تُدرج تلقائياً

الخطوة 6: أضف <script> في index.php إذا لم تستخدم Bundle
*/
