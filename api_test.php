<?php
// عرض جميع الأخطاء
error_reporting(E_ALL);
ini_set('display_errors', 1);

echo "<h2>تشخيص المشكلة</h2><pre>";

// 1. اختبار include config
echo "1. تحميل config.php...\n";
$configPath = __DIR__ . '/../includes/config.php';
echo "   المسار: $configPath\n";

if (file_exists($configPath)) {
    echo "   ✅ الملف موجود\n";
    require_once $configPath;
    echo "   ✅ تم تحميله\n";
} else {
    echo "   ❌ الملف غير موجود!\n";
    exit;
}

// 2. اختبار دالة db()
echo "\n2. اختبار دالة db()...\n";
if (function_exists('db')) {
    echo "   ✅ الدالة موجودة\n";
    try {
        $conn = db();
        echo "   ✅ الاتصال ناجح\n";
    } catch (Exception $e) {
        echo "   ❌ خطأ: " . $e->getMessage() . "\n";
    }
} else {
    echo "   ❌ الدالة غير موجودة!\n";
}

// 3. اختبار جدول employees
echo "\n3. اختبار جدول employees...\n";
$result = $conn->query("SELECT * FROM employees LIMIT 1");
if ($result) {
    echo "   ✅ الجدول يعمل\n";
    $row = $result->fetch_assoc();
    if ($row) {
        echo "   البيانات: " . print_r($row, true);
    }
} else {
    echo "   ❌ خطأ: " . $conn->error . "\n";
}

echo "\n</pre>";
?>
