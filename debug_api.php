<?php
/**
 * فحص أخطاء correspondence_api.php
 */

// إظهار جميع الأخطاء
error_reporting(E_ALL);
ini_set('display_errors', 1);

echo "<h2>🔍 فحص correspondence_api.php</h2>";
echo "<pre>";

// 1. التحقق من وجود الملف
echo "1. التحقق من وجود correspondence_api.php...\n";
$apiPath = __DIR__ . '/api/correspondence_api.php';
if (file_exists($apiPath)) {
    echo "   ✅ الملف موجود في: $apiPath\n";
} else {
    echo "   ❌ الملف غير موجود!\n";
    exit;
}

// 2. اختبار تحميل الملف
echo "\n2. اختبار تحميل الملف...\n";
try {
    // محاكاة طلب GET
    $_GET['action'] = 'stats';
    
    // بدء buffer للحصول على الناتج
    ob_start();
    
    // تضمين الملف
    include $apiPath;
    
    // الحصول على الناتج
    $output = ob_get_clean();
    
    echo "   ✅ تم تحميل الملف بنجاح\n";
    echo "\n3. الناتج:\n";
    echo "───────────────────────────────────\n";
    
    // محاولة فك JSON
    $json = json_decode($output, true);
    if ($json) {
        echo "   ✅ الناتج JSON صحيح:\n";
        print_r($json);
    } else {
        echo "   ❌ الناتج ليس JSON:\n";
        echo $output;
    }
    
} catch (Exception $e) {
    echo "   ❌ خطأ: " . $e->getMessage() . "\n";
    echo "   الملف: " . $e->getFile() . "\n";
    echo "   السطر: " . $e->getLine() . "\n";
} catch (Error $e) {
    echo "   ❌ خطأ فادح: " . $e->getMessage() . "\n";
    echo "   الملف: " . $e->getFile() . "\n";
    echo "   السطر: " . $e->getLine() . "\n";
}

echo "\n</pre>";

// 4. اختبار مباشر لـ action=stats
echo "<hr>";
echo "<h3>🧪 اختبار مباشر:</h3>";
echo "<p>افتح هذا الرابط في تبويب جديد:</p>";
echo "<a href='api/correspondence_api.php?action=stats' target='_blank' style='font-size:18px; color: #0ea5e9;'>";
echo "→ api/correspondence_api.php?action=stats";
echo "</a>";

echo "<hr>";
echo "<h3>📊 معلومات النظام:</h3>";
echo "<ul>";
echo "<li><strong>PHP Version:</strong> " . phpversion() . "</li>";
echo "<li><strong>Session Active:</strong> " . (session_status() === PHP_SESSION_ACTIVE ? 'نعم' : 'لا') . "</li>";
if (isset($_SESSION['user_id'])) {
    echo "<li><strong>User ID:</strong> " . $_SESSION['user_id'] . "</li>";
    echo "<li><strong>User Name:</strong> " . ($_SESSION['user_name'] ?? 'غير محدد') . "</li>";
} else {
    echo "<li><strong>تسجيل الدخول:</strong> ❌ غير مسجل</li>";
}
echo "</ul>";
?>
