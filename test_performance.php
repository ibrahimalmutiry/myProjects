<?php
/**
 * ملف اختبار نظام تتبع أوقات الموظفين
 * Performance Tracking Test File
 */

error_reporting(E_ALL);
ini_set('display_errors', 1);

echo "<html dir='rtl' lang='ar'><head><meta charset='UTF-8'>";
echo "<title>اختبار نظام تتبع الأوقات</title>";
echo "<style>
    body { font-family: 'Segoe UI', Tahoma, sans-serif; background: #1a1a2e; color: #eee; padding: 20px; line-height: 1.8; }
    .container { max-width: 1000px; margin: 0 auto; }
    h1 { color: #4dabf7; border-bottom: 2px solid #4dabf7; padding-bottom: 10px; }
    h2 { color: #69db7c; margin-top: 30px; }
    .success { background: #2d4a3e; padding: 15px; border-radius: 8px; margin: 10px 0; border-right: 4px solid #69db7c; }
    .error { background: #4a2d3e; padding: 15px; border-radius: 8px; margin: 10px 0; border-right: 4px solid #ff6b6b; }
    .warning { background: #4a4a2d; padding: 15px; border-radius: 8px; margin: 10px 0; border-right: 4px solid #ffa94d; }
    .info { background: #2d3a4a; padding: 15px; border-radius: 8px; margin: 10px 0; border-right: 4px solid #4dabf7; }
    table { width: 100%; border-collapse: collapse; margin: 15px 0; background: #16213e; }
    th, td { padding: 12px; text-align: right; border: 1px solid #333; }
    th { background: #1a1a2e; color: #4dabf7; }
    tr:hover { background: #1f3460; }
    code { background: #0f0f23; padding: 2px 8px; border-radius: 4px; font-family: monospace; }
    pre { background: #0f0f23; padding: 15px; border-radius: 8px; overflow-x: auto; }
    .btn { display: inline-block; padding: 10px 20px; background: #4dabf7; color: #000; text-decoration: none; border-radius: 6px; margin: 5px; border: none; cursor: pointer; font-size: 14px; }
    .btn:hover { background: #339af0; }
    .btn-danger { background: #ff6b6b; }
    .btn-success { background: #69db7c; }
</style></head><body><div class='container'>";

echo "<h1>🔧 اختبار نظام تتبع أوقات الموظفين</h1>";

// ========== 1. اختبار الاتصال بقاعدة البيانات ==========
echo "<h2>1️⃣ اختبار الاتصال بقاعدة البيانات</h2>";

try {
    require_once __DIR__ . '/includes/config.php';
    $conn = db();
    
    if ($conn->connect_error) {
        echo "<div class='error'>❌ فشل الاتصال: " . $conn->connect_error . "</div>";
        exit;
    }
    
    echo "<div class='success'>✅ تم الاتصال بقاعدة البيانات بنجاح</div>";
    echo "<div class='info'>📊 معلومات الاتصال: Server=" . $conn->host_info . "</div>";
    
} catch (Exception $e) {
    echo "<div class='error'>❌ خطأ: " . $e->getMessage() . "</div>";
    exit;
}

// ========== 2. التحقق من وجود الجداول ==========
echo "<h2>2️⃣ التحقق من وجود الجداول المطلوبة</h2>";

$requiredTables = ['transactions', 'employees', 'receiving_data', 'budget_data', 'payment_data', 'invoice_data', 'stage_times'];

foreach ($requiredTables as $table) {
    $result = $conn->query("SHOW TABLES LIKE '$table'");
    if ($result && $result->num_rows > 0) {
        $countResult = $conn->query("SELECT COUNT(*) as cnt FROM $table");
        $count = $countResult ? $countResult->fetch_assoc()['cnt'] : 0;
        echo "<div class='success'>✅ جدول <code>$table</code> موجود ($count سجل)</div>";
    } else {
        echo "<div class='error'>❌ جدول <code>$table</code> غير موجود!</div>";
        
        // محاولة إنشاء جدول stage_times
        if ($table === 'stage_times') {
            echo "<div class='warning'>⚠️ جاري إنشاء جدول stage_times...</div>";
            
            $createSQL = "
                CREATE TABLE IF NOT EXISTS stage_times (
                    id INT PRIMARY KEY AUTO_INCREMENT,
                    transaction_id INT NOT NULL,
                    stage ENUM('receiving', 'budget', 'payment', 'invoice') NOT NULL,
                    employee_id INT,
                    started_at DATETIME,
                    completed_at DATETIME,
                    duration_minutes INT DEFAULT NULL,
                    status VARCHAR(50),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY unique_stage (transaction_id, stage)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            ";
            
            if ($conn->query($createSQL)) {
                echo "<div class='success'>✅ تم إنشاء جدول stage_times بنجاح!</div>";
            } else {
                echo "<div class='error'>❌ فشل إنشاء الجدول: " . $conn->error . "</div>";
            }
        }
    }
}

// ========== 3. التحقق من هيكل جدول stage_times ==========
echo "<h2>3️⃣ هيكل جدول stage_times</h2>";

$result = $conn->query("DESCRIBE stage_times");
if ($result && $result->num_rows > 0) {
    echo "<table><tr><th>العمود</th><th>النوع</th><th>Null</th><th>Key</th><th>Default</th></tr>";
    while ($row = $result->fetch_assoc()) {
        echo "<tr>";
        echo "<td><code>" . $row['Field'] . "</code></td>";
        echo "<td>" . $row['Type'] . "</td>";
        echo "<td>" . $row['Null'] . "</td>";
        echo "<td>" . $row['Key'] . "</td>";
        echo "<td>" . ($row['Default'] ?? 'NULL') . "</td>";
        echo "</tr>";
    }
    echo "</table>";
} else {
    echo "<div class='error'>❌ لا يمكن قراءة هيكل الجدول: " . $conn->error . "</div>";
}

// ========== 4. فحص دوال PHP ==========
echo "<h2>4️⃣ فحص دوال PHP</h2>";

require_once __DIR__ . '/includes/functions.php';

$functions = ['recordStageTime', 'ensureStageTimesTable', 'getEmployeeTimeReport', 'getEmployeePerformanceSummary'];

foreach ($functions as $func) {
    if (function_exists($func)) {
        echo "<div class='success'>✅ دالة <code>$func()</code> موجودة</div>";
    } else {
        echo "<div class='error'>❌ دالة <code>$func()</code> غير موجودة!</div>";
    }
}

// ========== 5. اختبار دالة recordStageTime ==========
echo "<h2>5️⃣ اختبار دالة تسجيل الأوقات</h2>";

// الحصول على معاملة للاختبار
$txResult = $conn->query("SELECT id, transaction_number FROM transactions ORDER BY id DESC LIMIT 1");
if ($txResult && $txResult->num_rows > 0) {
    $tx = $txResult->fetch_assoc();
    echo "<div class='info'>📝 معاملة الاختبار: <code>" . $tx['transaction_number'] . "</code> (ID: " . $tx['id'] . ")</div>";
    
    // الحصول على موظف للاختبار
    $empResult = $conn->query("SELECT id, name FROM employees LIMIT 1");
    if ($empResult && $empResult->num_rows > 0) {
        $emp = $empResult->fetch_assoc();
        echo "<div class='info'>👤 موظف الاختبار: " . $emp['name'] . " (ID: " . $emp['id'] . ")</div>";
        
        // اختبار التسجيل
        echo "<div class='warning'>⏳ جاري اختبار تسجيل وقت...</div>";
        
        try {
            // تأكد من وجود الجدول أولاً
            ensureStageTimesTable();
            
            $testResult = recordStageTime($tx['id'], 'receiving', $emp['id'], 'اختبار_' . time());
            
            if ($testResult) {
                echo "<div class='success'>✅ تم تسجيل الوقت بنجاح!</div>";
            } else {
                echo "<div class='error'>❌ فشل تسجيل الوقت (الدالة أرجعت false)</div>";
                echo "<div class='error'>خطأ MySQL: " . $conn->error . "</div>";
            }
        } catch (Exception $e) {
            echo "<div class='error'>❌ خطأ في الدالة: " . $e->getMessage() . "</div>";
            echo "<div class='error'>ملف: " . $e->getFile() . " سطر: " . $e->getLine() . "</div>";
        } catch (Error $e) {
            echo "<div class='error'>❌ خطأ فادح: " . $e->getMessage() . "</div>";
            echo "<div class='error'>ملف: " . $e->getFile() . " سطر: " . $e->getLine() . "</div>";
        }
    } else {
        echo "<div class='error'>❌ لا يوجد موظفين للاختبار</div>";
    }
} else {
    echo "<div class='error'>❌ لا توجد معاملات للاختبار</div>";
}

// ========== 6. عرض بيانات stage_times ==========
echo "<h2>6️⃣ بيانات جدول stage_times</h2>";

$result = $conn->query("
    SELECT 
        st.*,
        t.transaction_number,
        e.name as employee_name
    FROM stage_times st
    LEFT JOIN transactions t ON st.transaction_id = t.id
    LEFT JOIN employees e ON st.employee_id = e.id
    ORDER BY st.id DESC
    LIMIT 20
");

if ($result && $result->num_rows > 0) {
    echo "<table><tr>
        <th>ID</th>
        <th>رقم المعاملة</th>
        <th>المرحلة</th>
        <th>الموظف</th>
        <th>وقت البدء</th>
        <th>وقت الانتهاء</th>
        <th>المدة (دقيقة)</th>
        <th>الحالة</th>
    </tr>";
    
    while ($row = $result->fetch_assoc()) {
        echo "<tr>";
        echo "<td>" . $row['id'] . "</td>";
        echo "<td><code>" . ($row['transaction_number'] ?? '-') . "</code></td>";
        echo "<td>" . $row['stage'] . "</td>";
        echo "<td>" . ($row['employee_name'] ?? '-') . "</td>";
        echo "<td style='font-size:12px;'>" . ($row['started_at'] ?? '-') . "</td>";
        echo "<td style='font-size:12px;'>" . ($row['completed_at'] ?? '-') . "</td>";
        echo "<td>" . ($row['duration_minutes'] ?? '-') . "</td>";
        echo "<td>" . ($row['status'] ?? '-') . "</td>";
        echo "</tr>";
    }
    echo "</table>";
} else {
    echo "<div class='warning'>⚠️ لا توجد بيانات في جدول stage_times</div>";
    if ($conn->error) {
        echo "<div class='error'>خطأ: " . $conn->error . "</div>";
    }
}

// ========== 7. إضافة بيانات اختبارية ==========
echo "<h2>7️⃣ إضافة بيانات اختبارية</h2>";

if (isset($_GET['add_test_data'])) {
    echo "<div class='info'>جاري إضافة بيانات اختبارية...</div>";
    
    // الحصول على معاملات
    $txResult = $conn->query("SELECT id FROM transactions LIMIT 5");
    $transactions = [];
    while ($row = $txResult->fetch_assoc()) {
        $transactions[] = $row['id'];
    }
    
    if (empty($transactions)) {
        echo "<div class='error'>❌ لا توجد معاملات!</div>";
    } else {
        // الحصول على موظفين
        $empResult = $conn->query("SELECT id, role FROM employees");
        $employees = [];
        $defaultEmp = null;
        while ($row = $empResult->fetch_assoc()) {
            $employees[$row['role']] = $row['id'];
            if (!$defaultEmp) $defaultEmp = $row['id'];
        }
        
        $stages = [
            'receiving' => 'receiver',
            'budget' => 'budget',
            'payment' => 'payment',
            'invoice' => 'invoice'
        ];
        
        $statuses = [
            'receiving' => 'مستلم',
            'budget' => 'معتمد',
            'payment' => 'تم الدفع',
            'invoice' => 'صدرت الفاتورة'
        ];
        
        $count = 0;
        $errors = [];
        
        foreach ($transactions as $txId) {
            foreach ($stages as $stage => $role) {
                $empId = $employees[$role] ?? ($employees['admin'] ?? $defaultEmp ?? 1);
                
                // وقت البدء عشوائي (خلال الأسبوع الماضي)
                $startOffset = rand(1, 7) * 24 * 60 * 60;
                $startTime = date('Y-m-d H:i:s', time() - $startOffset);
                
                // وقت الانتهاء (بعد 1-30 دقيقة)
                $duration = rand(1, 30);
                $endTime = date('Y-m-d H:i:s', strtotime($startTime) + ($duration * 60));
                
                $sql = "INSERT INTO stage_times 
                        (transaction_id, stage, employee_id, started_at, completed_at, duration_minutes, status)
                        VALUES ($txId, '$stage', $empId, '$startTime', '$endTime', $duration, '{$statuses[$stage]}')
                        ON DUPLICATE KEY UPDATE 
                        employee_id = $empId,
                        started_at = '$startTime',
                        completed_at = '$endTime',
                        duration_minutes = $duration,
                        status = '{$statuses[$stage]}'";
                
                if ($conn->query($sql)) {
                    $count++;
                } else {
                    $errors[] = $conn->error;
                }
            }
        }
        
        echo "<div class='success'>✅ تم إضافة/تحديث $count سجل اختباري</div>";
        
        if (!empty($errors)) {
            echo "<div class='error'>أخطاء: " . implode(', ', array_unique($errors)) . "</div>";
        }
    }
    
    echo "<a href='test_performance.php' class='btn'>🔄 تحديث الصفحة</a>";
} else {
    echo "<a href='test_performance.php?add_test_data=1' class='btn btn-success'>➕ إضافة بيانات اختبارية</a>";
}

// ========== 8. تنظيف البيانات ==========
if (isset($_GET['clear_test'])) {
    $conn->query("DELETE FROM stage_times WHERE status LIKE 'اختبار%'");
    echo "<div class='success'>✅ تم حذف البيانات الاختبارية</div>";
}

echo " <a href='test_performance.php?clear_test=1' class='btn btn-danger'>🗑️ حذف بيانات الاختبار</a>";

// ========== 9. اختبار يدوي ==========
echo "<h2>8️⃣ اختبار تسجيل يدوي</h2>";

if (isset($_POST['test_record'])) {
    $testTxId = (int)$_POST['tx_id'];
    $testStage = $conn->real_escape_string($_POST['stage']);
    $testEmpId = (int)$_POST['emp_id'];
    $testStatus = $conn->real_escape_string($_POST['status']);
    
    echo "<div class='info'>جاري تسجيل: TX=$testTxId, Stage=$testStage, Emp=$testEmpId, Status=$testStatus</div>";
    
    try {
        $result = recordStageTime($testTxId, $testStage, $testEmpId, $testStatus);
        if ($result) {
            echo "<div class='success'>✅ تم التسجيل بنجاح!</div>";
        } else {
            echo "<div class='error'>❌ فشل التسجيل - خطأ: " . $conn->error . "</div>";
        }
    } catch (Exception $e) {
        echo "<div class='error'>❌ خطأ: " . $e->getMessage() . "</div>";
    }
}

echo "<form method='POST' style='background: #16213e; padding: 20px; border-radius: 10px; margin-top: 15px;'>";
echo "<div style='display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px;'>";

// اختيار المعاملة
echo "<div><label>المعاملة:</label><br>";
echo "<select name='tx_id' style='width:100%; padding:8px; border-radius:5px; background:#0f0f23; color:#fff; border:1px solid #333;'>";
$txs = $conn->query("SELECT id, transaction_number FROM transactions ORDER BY id DESC LIMIT 10");
if ($txs) {
    while ($tx = $txs->fetch_assoc()) {
        echo "<option value='{$tx['id']}'>{$tx['transaction_number']}</option>";
    }
}
echo "</select></div>";

// اختيار المرحلة
echo "<div><label>المرحلة:</label><br>";
echo "<select name='stage' style='width:100%; padding:8px; border-radius:5px; background:#0f0f23; color:#fff; border:1px solid #333;'>";
echo "<option value='creation'>الإنشاء</option>";
echo "<option value='receiving'>الاستلام</option>";
echo "<option value='budget'>الموازنة</option>";
echo "<option value='payment'>الدفع</option>";
echo "<option value='invoice'>الفوترة</option>";
echo "</select></div>";

// اختيار الموظف
echo "<div><label>الموظف:</label><br>";
echo "<select name='emp_id' style='width:100%; padding:8px; border-radius:5px; background:#0f0f23; color:#fff; border:1px solid #333;'>";
$emps = $conn->query("SELECT id, name FROM employees");
if ($emps) {
    while ($emp = $emps->fetch_assoc()) {
        echo "<option value='{$emp['id']}'>{$emp['name']}</option>";
    }
}
echo "</select></div>";

// الحالة
echo "<div><label>الحالة:</label><br>";
echo "<select name='status' style='width:100%; padding:8px; border-radius:5px; background:#0f0f23; color:#fff; border:1px solid #333;'>";
echo "<option value='معلق'>معلق (بدء)</option>";
echo "<option value='مستلم'>مستلم (انتهاء)</option>";
echo "<option value='معتمد'>معتمد (انتهاء)</option>";
echo "<option value='تم الدفع'>تم الدفع (انتهاء)</option>";
echo "<option value='صدرت الفاتورة'>صدرت الفاتورة (انتهاء)</option>";
echo "</select></div>";

echo "</div>";
echo "<br><button type='submit' name='test_record' class='btn btn-success'>🧪 تنفيذ الاختبار</button>";
echo "</form>";

// ========== 10. اختبار API ==========
echo "<h2>9️⃣ اختبار API</h2>";

echo "<div class='info'>";
echo "<strong>روابط API للاختبار:</strong><br><br>";
echo "• <a href='api/?action=employee_times' target='_blank' style='color:#4dabf7;'>api/?action=employee_times</a> - أوقات الموظفين<br>";
echo "• <a href='api/?action=performance_summary' target='_blank' style='color:#4dabf7;'>api/?action=performance_summary</a> - ملخص الأداء<br>";
echo "• <a href='api/?action=employee_performance&employee_id=1' target='_blank' style='color:#4dabf7;'>api/?action=employee_performance&employee_id=1</a> - أداء موظف معين<br>";
echo "</div>";

// ========== روابط سريعة ==========
echo "<h2>🔗 روابط سريعة</h2>";
echo "<a href='index.php' class='btn'>🏠 الرئيسية</a> ";
echo "<a href='test_performance.php' class='btn'>🔄 تحديث</a> ";

echo "</div></body></html>";
?>
