<?php
/**
 * اختبار نظام تسجيل الدخول
 */
error_reporting(E_ALL);
ini_set('display_errors', 1);

echo "<h2>اختبار نظام تسجيل الدخول</h2>";
echo "<pre style='background:#1e293b;color:#f1f5f9;padding:20px;border-radius:10px;direction:ltr;text-align:left;'>";

// 1. اختبار الاتصال بقاعدة البيانات
echo "1. اختبار الاتصال بقاعدة البيانات...\n";
require_once __DIR__ . '/../includes/config.php';



try {
    $conn = db();
    echo "   ✅ الاتصال ناجح!\n\n";
} catch (Exception $e) {
    echo "   ❌ فشل الاتصال: " . $e->getMessage() . "\n\n";
    exit;
}

// 2. التحقق من وجود جدول employees
echo "2. التحقق من جدول employees...\n";
$result = $conn->query("SHOW TABLES LIKE 'employees'");
if ($result && $result->num_rows > 0) {
    echo "   ✅ الجدول موجود\n\n";
} else {
    echo "   ❌ الجدول غير موجود!\n\n";
    exit;
}

// 3. التحقق من الأعمدة المطلوبة
echo "3. التحقق من الأعمدة المطلوبة...\n";

$requiredColumns = ['employee_number', 'password', 'is_registered'];
$result = $conn->query("SHOW COLUMNS FROM employees");
$existingColumns = [];

while ($row = $result->fetch_assoc()) {
    $existingColumns[] = $row['Field'];
}

$missingColumns = [];
foreach ($requiredColumns as $col) {
    if (in_array($col, $existingColumns)) {
        echo "   ✅ $col موجود\n";
    } else {
        echo "   ❌ $col غير موجود!\n";
        $missingColumns[] = $col;
    }
}

// 4. إضافة الأعمدة المفقودة
if (count($missingColumns) > 0) {
    echo "\n4. إضافة الأعمدة المفقودة...\n";
    
    foreach ($missingColumns as $col) {
        $sql = "";
        switch ($col) {
            case 'employee_number':
                $sql = "ALTER TABLE employees ADD COLUMN employee_number VARCHAR(20) UNIQUE AFTER id";
                break;
            case 'password':
                $sql = "ALTER TABLE employees ADD COLUMN password VARCHAR(255) DEFAULT NULL AFTER phone";
                break;
            case 'is_registered':
                $sql = "ALTER TABLE employees ADD COLUMN is_registered TINYINT(1) DEFAULT 0 AFTER password";
                break;
        }
        
        if ($conn->query($sql)) {
            echo "   ✅ تم إضافة $col\n";
        } else {
            echo "   ❌ فشل إضافة $col: " . $conn->error . "\n";
        }
    }
    
    // تحديث الأرقام الوظيفية
    echo "\n5. تحديث الأرقام الوظيفية...\n";
    $sql = "UPDATE employees SET employee_number = CONCAT('EMP', LPAD(id, 4, '0')) WHERE employee_number IS NULL";
    if ($conn->query($sql)) {
        echo "   ✅ تم تحديث الأرقام الوظيفية\n";
    }
}

// 5. عرض الموظفين
echo "\n" . str_repeat("=", 50) . "\n";
echo "الموظفين المتاحين:\n";
echo str_repeat("=", 50) . "\n";

$result = $conn->query("SELECT id, employee_number, name, role, is_registered FROM employees");

if ($result && $result->num_rows > 0) {
    echo sprintf("%-15s %-20s %-15s %-10s\n", "الرقم الوظيفي", "الاسم", "القسم", "مسجل؟");
    echo str_repeat("-", 60) . "\n";
    
    while ($row = $result->fetch_assoc()) {
        $registered = $row['is_registered'] ? '✅ نعم' : '❌ لا';
        echo sprintf("%-15s %-20s %-15s %-10s\n", 
            $row['employee_number'] ?? 'NULL', 
            $row['name'], 
            $row['role'],
            $registered
        );
    }
} else {
    echo "لا يوجد موظفين!\n";
}

echo "\n" . str_repeat("=", 50) . "\n";
echo "✅ الاختبار مكتمل!\n";
echo "يمكنك الآن تسجيل الدخول باستخدام أحد الأرقام الوظيفية أعلاه.\n";
echo str_repeat("=", 50) . "\n";

echo "</pre>";

echo "<br><a href='login.php' style='display:inline-block;padding:10px 20px;background:linear-gradient(135deg,#0ea5e9,#a855f7);color:white;text-decoration:none;border-radius:8px;font-family:Tajawal,sans-serif;'>الذهاب لصفحة تسجيل الدخول</a>";
?>