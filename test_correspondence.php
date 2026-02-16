<?php
/**
 * ملف اختبار نظام الخطابات
 * Correspondence System Test File
 */

error_reporting(E_ALL);
ini_set('display_errors', 1);

echo "<h2>🔍 اختبار نظام الخطابات</h2>";
echo "<pre>";

// تحديد المسارات الممكنة
$possiblePaths = [
    __DIR__ . '/config.php',
    __DIR__ . '/../config.php',
    __DIR__ . '/includes/config.php',
    __DIR__ . '/../includes/config.php'
];

$configPath = null;

// 1. اختبار config.php
echo "1. البحث عن config.php...\n";
foreach ($possiblePaths as $path) {
    if (file_exists($path)) {
        $configPath = $path;
        echo "   ✅ config.php موجود في: " . $path . "\n";
        break;
    }
}

if ($configPath) {
    require_once $configPath;
    echo "   ✅ تم تحميل config.php\n";
} else {
    echo "   ❌ config.php غير موجود في أي من المسارات التالية:\n";
    foreach ($possiblePaths as $path) {
        echo "      - " . $path . "\n";
    }
    echo "\n   💡 تأكد من أن ملف config.php موجود في مجلد المشروع\n";
    exit;
}

// 2. اختبار الاتصال بقاعدة البيانات
echo "\n2. اختبار الاتصال بقاعدة البيانات...\n";
try {
    if (function_exists('db')) {
        $conn = db();
        echo "   ✅ الاتصال ناجح\n";
    } else {
        $conn = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME);
        if ($conn->connect_error) {
            throw new Exception($conn->connect_error);
        }
        echo "   ✅ الاتصال ناجح\n";
    }
} catch (Exception $e) {
    echo "   ❌ فشل الاتصال: " . $e->getMessage() . "\n";
    exit;
}

// 3. اختبار جدول departments
echo "\n3. اختبار جدول departments...\n";
$result = $conn->query("SHOW TABLES LIKE 'departments'");
if ($result && $result->num_rows > 0) {
    echo "   ✅ جدول departments موجود\n";
    
    $count = $conn->query("SELECT COUNT(*) as count FROM departments")->fetch_assoc();
    echo "   📊 عدد الأقسام: " . $count['count'] . "\n";
    
    // عرض بعض الأقسام
    if ($count['count'] > 0) {
        echo "   📋 أمثلة على الأقسام:\n";
        $depts = $conn->query("SELECT name, code FROM departments LIMIT 3");
        while ($dept = $depts->fetch_assoc()) {
            echo "      • " . $dept['name'] . " (" . $dept['code'] . ")\n";
        }
    }
} else {
    echo "   ❌ جدول departments غير موجود!\n";
    echo "   💡 قم بتنفيذ ملف correspondence_system.sql\n";
}

// 4. اختبار جدول correspondence
echo "\n4. اختبار جدول correspondence...\n";
$result = $conn->query("SHOW TABLES LIKE 'correspondence'");
if ($result && $result->num_rows > 0) {
    echo "   ✅ جدول correspondence موجود\n";
    
    $count = $conn->query("SELECT COUNT(*) as count FROM correspondence")->fetch_assoc();
    echo "   📊 عدد الخطابات: " . $count['count'] . "\n";
} else {
    echo "   ❌ جدول correspondence غير موجود!\n";
    echo "   💡 قم بتنفيذ ملف correspondence_system.sql\n";
}

// 5. اختبار correspondence_functions.php
echo "\n5. اختبار correspondence_functions.php...\n";

$functionsPaths = [
    __DIR__ . '/correspondence_functions.php',
    __DIR__ . '/../correspondence_functions.php',
    __DIR__ . '/includes/correspondence_functions.php',
    __DIR__ . '/../includes/correspondence_functions.php'
];

$functionsPath = null;
foreach ($functionsPaths as $path) {
    if (file_exists($path)) {
        $functionsPath = $path;
        break;
    }
}

if ($functionsPath) {
    echo "   ✅ correspondence_functions.php موجود في: " . $functionsPath . "\n";
    require_once $functionsPath;
    echo "   ✅ تم تحميل correspondence_functions.php\n";
    
    // اختبار دالة
    if (function_exists('getAllDepartments')) {
        echo "   ✅ دالة getAllDepartments موجودة\n";
        try {
            $depts = getAllDepartments();
            echo "   ✅ تم تنفيذ getAllDepartments بنجاح\n";
            echo "   📊 عدد الأقسام المسترجعة: " . count($depts) . "\n";
        } catch (Exception $e) {
            echo "   ❌ خطأ في getAllDepartments: " . $e->getMessage() . "\n";
        }
    } else {
        echo "   ⚠️ دالة getAllDepartments غير موجودة\n";
    }
} else {
    echo "   ❌ correspondence_functions.php غير موجود!\n";
    echo "   💡 تأكد من نسخ الملف في:\n";
    foreach ($functionsPaths as $path) {
        echo "      - " . $path . "\n";
    }
}

// 6. اختبار مجلد المرفقات
echo "\n6. اختبار مجلد المرفقات...\n";

$uploadPaths = [
    __DIR__ . '/uploads/correspondence/',
    __DIR__ . '/../uploads/correspondence/',
];

$uploadDir = null;
foreach ($uploadPaths as $path) {
    if (is_dir($path)) {
        $uploadDir = $path;
        break;
    }
}

if ($uploadDir) {
    echo "   ✅ مجلد المرفقات موجود في: " . $uploadDir . "\n";
    if (is_writable($uploadDir)) {
        echo "   ✅ المجلد قابل للكتابة\n";
    } else {
        echo "   ⚠️  المجلد غير قابل للكتابة\n";
        echo "   💡 قم بتنفيذ: chmod 755 " . $uploadDir . "\n";
    }
} else {
    echo "   ❌ مجلد المرفقات غير موجود\n";
    echo "   💡 قم بإنشائه: mkdir -p uploads/correspondence\n";
}

// 7. اختبار الجلسة
echo "\n7. اختبار الجلسة...\n";
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

if (isset($_SESSION['user_id'])) {
    echo "   ✅ المستخدم مسجل الدخول\n";
    echo "      • User ID: " . $_SESSION['user_id'] . "\n";
    echo "      • User Name: " . ($_SESSION['user_name'] ?? 'غير محدد') . "\n";
    echo "      • User Role: " . ($_SESSION['user_role'] ?? 'غير محدد') . "\n";
} else {
    echo "   ⚠️  لا يوجد مستخدم مسجل دخول\n";
    echo "   💡 سجل الدخول أولاً لاختبار API الكامل\n";
}

echo "\n" . str_repeat("=", 60) . "\n";
echo "📊 ملخص الاختبار\n";
echo str_repeat("=", 60) . "\n";

// عرض الملفات الموجودة
echo "\n📁 الملفات:\n";

$requiredFiles = [
    'config.php' => $configPath ? '✅ موجود' : '❌ غير موجود',
    'correspondence_functions.php' => $functionsPath ? '✅ موجود' : '❌ غير موجود',
    'correspondence_api.php' => file_exists(__DIR__ . '/api/correspondence_api.php') ? '✅ موجود' : '❌ غير موجود',
    'correspondence.js' => file_exists(__DIR__ . '/js/correspondence.js') ? '✅ موجود' : '❌ غير موجود',
    'correspondence.css' => file_exists(__DIR__ . '/css/correspondence.css') ? '✅ موجود' : '❌ غير موجود'
];

foreach ($requiredFiles as $file => $status) {
    echo "   $status - $file\n";
}

// عرض الجداول الموجودة
echo "\n📊 الجداول:\n";

$requiredTables = [
    'departments',
    'correspondence',
    'correspondence_stages',
    'correspondence_workflow_templates',
    'correspondence_attachments',
    'correspondence_comments',
    'correspondence_audit_log',
    'correspondence_notifications',
    'correspondence_templates'
];

foreach ($requiredTables as $table) {
    $result = $conn->query("SHOW TABLES LIKE '$table'");
    $exists = ($result && $result->num_rows > 0);
    $icon = $exists ? '✅' : '❌';
    echo "   $icon - $table\n";
}

echo "\n</pre>";

// عرض تعليمات الإصلاح
$missingTables = 0;
foreach ($requiredTables as $table) {
    $result = $conn->query("SHOW TABLES LIKE '$table'");
    if (!$result || $result->num_rows == 0) {
        $missingTables++;
    }
}

if ($missingTables > 0) {
    echo "<div style='background: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;'>";
    echo "<h3 style='color: #856404; margin-top: 0;'>⚠️ تحذير: بعض الجداول غير موجودة</h3>";
    echo "<p style='color: #856404;'>عدد الجداول الناقصة: <strong>" . $missingTables . "</strong></p>";
    echo "<p style='color: #856404;'>قم بتنفيذ الأمر التالي لإنشاء الجداول:</p>";
    echo "<pre style='background: #000; color: #0f0; padding: 10px; border-radius: 4px;'>mysql -u root -p workflow_system < correspondence_system.sql</pre>";
    echo "</div>";
}

if (!$functionsPath) {
    echo "<div style='background: #f8d7da; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc3545;'>";
    echo "<h3 style='color: #721c24; margin-top: 0;'>❌ خطأ: ملفات PHP ناقصة</h3>";
    echo "<p style='color: #721c24;'>يجب نسخ الملفات التالية:</p>";
    echo "<ul style='color: #721c24;'>";
    echo "<li><strong>correspondence_functions.php</strong> - دوال نظام الخطابات</li>";
    echo "<li><strong>correspondence_api.php</strong> - API نظام الخطابات</li>";
    echo "</ul>";
    echo "</div>";
}

if (isset($_SESSION['user_id'])) {
    echo "<div style='background: #d4edda; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745;'>";
    echo "<h3 style='color: #155724; margin-top: 0;'>✅ الجلسة نشطة</h3>";
    echo "<p style='color: #155724;'>يمكنك الآن اختبار النظام:</p>";
    echo "<ol style='color: #155724;'>";
    echo "<li>اذهب إلى الصفحة الرئيسية</li>";
    echo "<li>اضغط على تبويب 'الخطابات'</li>";
    echo "<li>جرب إضافة خطاب جديد</li>";
    echo "</ol>";
    echo "</div>";
} else {
    echo "<div style='background: #d1ecf1; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #17a2b8;'>";
    echo "<h3 style='color: #0c5460; margin-top: 0;'>ℹ️ معلومة</h3>";
    echo "<p style='color: #0c5460;'>لاختبار النظام كاملاً، سجل الدخول أولاً:</p>";
    echo "<p><a href='login.php' style='color: #17a2b8; font-weight: bold;'>→ الذهاب لصفحة تسجيل الدخول</a></p>";
    echo "</div>";
}

// معلومات المسارات
echo "<div style='background: #e7f3ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2196F3;'>";
echo "<h3 style='color: #014361; margin-top: 0;'>📂 معلومات المسارات</h3>";
echo "<p style='color: #014361;'><strong>المجلد الحالي:</strong> " . __DIR__ . "</p>";
echo "<p style='color: #014361;'><strong>ملف config.php:</strong> " . ($configPath ?: 'غير موجود') . "</p>";
echo "<p style='color: #014361;'><strong>ملف correspondence_functions.php:</strong> " . ($functionsPath ?: 'غير موجود') . "</p>";
echo "</div>";

echo "<hr style='margin: 30px 0;'>";
echo "<p style='text-align: center; color: #666;'>انتهى الاختبار | اطبع هذه الصفحة أو التقط لها صورة للمراجعة</p>";
?>