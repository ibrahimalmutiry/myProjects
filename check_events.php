<?php
/**
 * فحص نظام الأحداث
 */
session_start();
error_reporting(E_ALL);
ini_set('display_errors', 1);

require_once __DIR__ . '/includes/config.php';
require_once __DIR__ . '/includes/functions.php';

$conn = db();

echo "<h1 style='font-family:Tahoma;direction:rtl'>فحص نظام الأحداث</h1>";
echo "<pre style='direction:rtl;background:#f5f5f5;padding:20px;font-family:Tahoma'>";

// 1. فحص وجود دالة ensureEventsTable
echo "1️⃣ فحص دالة ensureEventsTable: ";
if (function_exists('ensureEventsTable')) {
    echo "✅ موجودة\n";
    
    // استدعاء الدالة
    echo "   جاري إنشاء/فحص الجدول...\n";
    ensureEventsTable();
    echo "   ✅ تم\n";
} else {
    echo "❌ غير موجودة!\n";
}

// 2. فحص وجود جدول transaction_events
echo "\n2️⃣ فحص جدول transaction_events: ";
$result = $conn->query("SHOW TABLES LIKE 'transaction_events'");
if ($result && $result->num_rows > 0) {
    echo "✅ موجود\n";
    
    // عدد السجلات
    $countResult = $conn->query("SELECT COUNT(*) as cnt FROM transaction_events");
    $count = $countResult ? $countResult->fetch_assoc()['cnt'] : 0;
    echo "   عدد الأحداث: $count\n";
} else {
    echo "❌ غير موجود!\n";
    
    // محاولة إنشائه
    echo "   جاري الإنشاء...\n";
    $sql = "
        CREATE TABLE IF NOT EXISTS transaction_events (
            id INT PRIMARY KEY AUTO_INCREMENT,
            transaction_id INT NOT NULL,
            stage ENUM('creation', 'receiving', 'budget', 'payment', 'invoice') NOT NULL,
            employee_id INT,
            action VARCHAR(100) NOT NULL,
            old_status VARCHAR(50),
            new_status VARCHAR(50),
            notes TEXT,
            event_time DATETIME NOT NULL,
            duration_from_previous INT DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_transaction (transaction_id),
            INDEX idx_stage (stage),
            INDEX idx_event_time (event_time)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ";
    
    if ($conn->query($sql)) {
        echo "   ✅ تم الإنشاء بنجاح!\n";
    } else {
        echo "   ❌ خطأ: " . $conn->error . "\n";
    }
}

// 3. فحص دالة logTransactionEvent
echo "\n3️⃣ فحص دالة logTransactionEvent: ";
if (function_exists('logTransactionEvent')) {
    echo "✅ موجودة\n";
} else {
    echo "❌ غير موجودة!\n";
}

// 4. فحص دالة getTransactionEvents
echo "\n4️⃣ فحص دالة getTransactionEvents: ";
if (function_exists('getTransactionEvents')) {
    echo "✅ موجودة\n";
} else {
    echo "❌ غير موجودة!\n";
}

// 5. فحص دالة getLastStageStatus
echo "\n5️⃣ فحص دالة getLastStageStatus: ";
if (function_exists('getLastStageStatus')) {
    echo "✅ موجودة\n";
} else {
    echo "❌ غير موجودة!\n";
}

// 6. اختبار تسجيل حدث
echo "\n6️⃣ اختبار تسجيل حدث: ";
$result = $conn->query("SELECT id FROM transactions LIMIT 1");
if ($result && $row = $result->fetch_assoc()) {
    $txId = $row['id'];
    
    if (function_exists('logTransactionEvent')) {
        try {
            $eventId = logTransactionEvent($txId, 'budget', 'اختبار', 'معلق', 'قيد المراجعة', 'هذا اختبار للنظام');
            if ($eventId) {
                echo "✅ تم تسجيل الحدث بنجاح (ID: $eventId)\n";
            } else {
                echo "⚠️ لم يُرجع ID\n";
            }
        } catch (Exception $e) {
            echo "❌ خطأ: " . $e->getMessage() . "\n";
        }
    }
} else {
    echo "⚠️ لا توجد معاملات للاختبار\n";
}

// 7. عرض آخر 5 أحداث
echo "\n7️⃣ آخر الأحداث:\n";
$result = $conn->query("SELECT * FROM transaction_events ORDER BY id DESC LIMIT 5");
if ($result && $result->num_rows > 0) {
    while ($row = $result->fetch_assoc()) {
        echo "   • [{$row['stage']}] {$row['old_status']} → {$row['new_status']} | {$row['event_time']}\n";
    }
} else {
    echo "   لا توجد أحداث\n";
    if ($conn->error) {
        echo "   خطأ: " . $conn->error . "\n";
    }
}

// 8. معلومات الجلسة
echo "\n8️⃣ معلومات الجلسة:\n";
echo "   user_id: " . ($_SESSION['user_id'] ?? 'غير موجود') . "\n";
echo "   user_name: " . ($_SESSION['user_name'] ?? 'غير موجود') . "\n";

echo "\n</pre>";

echo "<p style='font-family:Tahoma;direction:rtl'>";
echo "<a href='index.php' style='padding:10px 20px;background:#4dabf7;color:#fff;text-decoration:none;border-radius:5px'>← العودة للرئيسية</a> ";
echo "<a href='check_events.php' style='padding:10px 20px;background:#69db7c;color:#000;text-decoration:none;border-radius:5px'>🔄 تحديث</a>";
echo "</p>";
