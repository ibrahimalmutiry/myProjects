<?php
/**
 * ملف اختبار نظام تتبع الأحداث
 * Transaction Events Tracking Test - V3
 */
session_start();
error_reporting(E_ALL);
ini_set('display_errors', 1);

require_once __DIR__ . '/includes/config.php';
require_once __DIR__ . '/includes/functions.php';

$conn = db();

// التأكد من وجود الجداول
ensureStageTimesTable();
ensureEventsTable();
ensureCreatorColumns();

echo "<!DOCTYPE html>
<html dir='rtl' lang='ar'>
<head>
    <meta charset='UTF-8'>
    <title>اختبار تتبع الأحداث</title>
    <style>
        body { font-family: Tahoma, sans-serif; background: #1a1a2e; color: #eee; padding: 20px; }
        .container { max-width: 1400px; margin: 0 auto; }
        h1 { color: #4dabf7; }
        h2 { color: #69db7c; margin-top: 30px; }
        .card { background: #16213e; border-radius: 10px; padding: 20px; margin: 15px 0; }
        .success { border-right: 4px solid #69db7c; }
        .error { border-right: 4px solid #ff6b6b; }
        .warning { border-right: 4px solid #ffa94d; }
        .info { border-right: 4px solid #4dabf7; }
        table { width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 0.9rem; }
        th, td { padding: 10px; text-align: right; border: 1px solid #333; }
        th { background: #1a1a2e; color: #4dabf7; }
        tr:hover { background: #1f3460; }
        .btn { padding: 10px 20px; border-radius: 6px; border: none; cursor: pointer; margin: 5px; text-decoration: none; display: inline-block; color: #000; }
        .btn-primary { background: #4dabf7; }
        .btn-success { background: #69db7c; }
        .btn-danger { background: #ff6b6b; color: #fff; }
        .btn-warning { background: #ffa94d; }
        .stage-badge { padding: 3px 10px; border-radius: 10px; font-size: 0.8rem; display: inline-block; }
        .stage-creation { background: #4dabf7; color: #000; }
        .stage-receiving { background: #69db7c; color: #000; }
        .stage-budget { background: #3bc9db; color: #000; }
        .stage-payment { background: #ffa94d; color: #000; }
        .stage-invoice { background: #b197fc; color: #000; }
        code { background: #0f0f23; padding: 2px 8px; border-radius: 4px; }
        .highlight { background: #2d4a3e; padding: 15px; border-radius: 8px; margin: 10px 0; }
        .timeline { border-right: 3px solid #4dabf7; padding-right: 20px; margin-right: 10px; }
        .event-item { margin-bottom: 15px; padding: 10px; background: #0f0f23; border-radius: 8px; position: relative; }
        .event-item::before { content: ''; position: absolute; right: -26px; top: 15px; width: 10px; height: 10px; border-radius: 50%; background: #4dabf7; }
        .status-change { display: flex; align-items: center; gap: 10px; }
        .old-status { color: #888; text-decoration: line-through; }
        .arrow { color: #69db7c; font-weight: bold; }
        .new-status { color: #fff; font-weight: bold; }
        .duration-badge { background: #ffa94d; color: #000; padding: 2px 8px; border-radius: 4px; font-size: 0.8rem; }
    </style>
</head>
<body>
<div class='container'>";

echo "<h1>📋 نظام تتبع أحداث المعاملات V3</h1>";

// معلومات الجلسة
echo "<div class='card info'>";
echo "<strong>👤 معلومات الجلسة:</strong> ";
if (isset($_SESSION['user_id'])) {
    echo $_SESSION['user_name'] . " (" . ($_SESSION['user_role'] ?? '') . ")";
} else {
    echo "<span style='color:#ff6b6b'>غير مسجل - يرجى تسجيل الدخول</span>";
}
echo "</div>";

// ========== شرح النظام ==========
echo "<h2>📖 كيف يعمل النظام</h2>";
echo "<div class='highlight'>";
echo "<strong>✅ كل تعديل على المعاملة يُسجل كحدث منفصل:</strong><br><br>";
echo "1️⃣ <strong>تغيير الحالة:</strong> يسجل الحالة القديمة والجديدة<br>";
echo "2️⃣ <strong>الوقت:</strong> يحفظ الوقت الفعلي للتعديل<br>";
echo "3️⃣ <strong>المدة:</strong> يحسب الوقت من الحدث السابق<br>";
echo "4️⃣ <strong>الملاحظات:</strong> يحفظ سبب التعديل (مثل سبب الرفض)<br>";
echo "5️⃣ <strong>الموظف:</strong> يسجل من قام بالتعديل<br><br>";
echo "<strong>مثال:</strong> قيد المراجعة ← مرفوض (السبب: نقص مستندات) ← معتمد";
echo "</div>";

// ========== الإحصائيات ==========
echo "<h2>📊 الإحصائيات</h2>";
echo "<div class='card info'>";

$result = $conn->query("SELECT COUNT(*) as c FROM transaction_events"); 
$eventsCount = $result ? $result->fetch_assoc()['c'] : 0;

$result = $conn->query("SELECT COUNT(DISTINCT transaction_id) as c FROM transaction_events"); 
$txWithEvents = $result ? $result->fetch_assoc()['c'] : 0;

$result = $conn->query("SELECT AVG(duration_from_previous) as avg FROM transaction_events WHERE duration_from_previous > 0"); 
$avgDuration = $result ? $result->fetch_assoc()['avg'] : 0;

echo "• إجمالي الأحداث: <strong>$eventsCount</strong> | ";
echo "معاملات لها أحداث: <strong>$txWithEvents</strong> | ";
echo "متوسط المدة بين الأحداث: <strong>" . ($avgDuration ? round($avgDuration, 1) . " دقيقة" : "-") . "</strong>";
echo "</div>";

// ========== آخر الأحداث ==========
echo "<h2>🕐 آخر الأحداث المسجلة</h2>";

$result = $conn->query("
    SELECT 
        te.*,
        t.transaction_number,
        e.name as employee_name
    FROM transaction_events te
    LEFT JOIN transactions t ON te.transaction_id = t.id
    LEFT JOIN employees e ON te.employee_id = e.id
    ORDER BY te.event_time DESC
    LIMIT 20
");

if ($result && $result->num_rows > 0) {
    echo "<table>
    <tr>
        <th>المعاملة</th>
        <th>المرحلة</th>
        <th>من</th>
        <th>إلى</th>
        <th>الملاحظات</th>
        <th>المدة</th>
        <th>الموظف</th>
        <th>الوقت</th>
    </tr>";
    
    $stageNames = [
        'creation' => ['name' => 'الإنشاء', 'class' => 'creation'],
        'receiving' => ['name' => 'الاستلام', 'class' => 'receiving'],
        'budget' => ['name' => 'الموازنة', 'class' => 'budget'],
        'payment' => ['name' => 'الدفع', 'class' => 'payment'],
        'invoice' => ['name' => 'الفوترة', 'class' => 'invoice']
    ];
    
    while ($row = $result->fetch_assoc()) {
        $s = $stageNames[$row['stage']] ?? ['name' => $row['stage'], 'class' => ''];
        $duration = $row['duration_from_previous'];
        
        echo "<tr>";
        echo "<td><code>" . ($row['transaction_number'] ?? '-') . "</code></td>";
        echo "<td><span class='stage-badge stage-{$s['class']}'>{$s['name']}</span></td>";
        echo "<td style='color:#888'>" . ($row['old_status'] ?? '-') . "</td>";
        echo "<td style='color:#69db7c;font-weight:bold'>" . ($row['new_status'] ?? '-') . "</td>";
        echo "<td style='max-width:200px;font-size:0.85rem'>" . ($row['notes'] ?? '-') . "</td>";
        echo "<td>" . ($duration !== null ? "<span class='duration-badge'>$duration د</span>" : '-') . "</td>";
        echo "<td>" . ($row['employee_name'] ?? '-') . "</td>";
        echo "<td style='font-size:0.8rem'>" . $row['event_time'] . "</td>";
        echo "</tr>";
    }
    echo "</table>";
} else {
    echo "<div class='card warning'>⚠️ لا توجد أحداث مسجلة بعد. جرب تعديل حالة معاملة!</div>";
}

// ========== عرض أحداث معاملة معينة ==========
echo "<h2>🔍 عرض أحداث معاملة</h2>";

// اختيار معاملة
$txResult = $conn->query("SELECT id, transaction_number FROM transactions ORDER BY id DESC LIMIT 10");
echo "<form method='get' class='card' style='display:flex;gap:1rem;align-items:center;flex-wrap:wrap'>";
echo "<label>اختر معاملة:</label>";
echo "<select name='tx_id' style='padding:8px;border-radius:5px;background:#0f0f23;color:#fff;border:1px solid #333'>";
echo "<option value=''>-- اختر --</option>";
while ($tx = $txResult->fetch_assoc()) {
    $selected = (isset($_GET['tx_id']) && $_GET['tx_id'] == $tx['id']) ? 'selected' : '';
    echo "<option value='{$tx['id']}' $selected>{$tx['transaction_number']}</option>";
}
echo "</select>";
echo "<button type='submit' class='btn btn-primary'>عرض الأحداث</button>";
echo "</form>";

// عرض Timeline للمعاملة المختارة
if (isset($_GET['tx_id']) && $_GET['tx_id'] > 0) {
    $txId = (int)$_GET['tx_id'];
    $events = getTransactionEvents($txId);
    
    if (!empty($events)) {
        echo "<div class='card'>";
        echo "<h3>📅 Timeline للمعاملة</h3>";
        echo "<div class='timeline'>";
        
        foreach ($events as $event) {
            $s = $stageNames[$event['stage']] ?? ['name' => $event['stage'], 'class' => ''];
            $duration = $event['duration_from_previous'];
            
            echo "<div class='event-item'>";
            echo "<div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:8px'>";
            echo "<span class='stage-badge stage-{$s['class']}'>{$s['name']}</span>";
            if ($duration !== null) {
                echo "<span class='duration-badge'>بعد $duration دقيقة</span>";
            }
            echo "</div>";
            
            echo "<div class='status-change'>";
            if ($event['old_status']) {
                echo "<span class='old-status'>{$event['old_status']}</span>";
                echo "<span class='arrow'>←</span>";
            }
            echo "<span class='new-status'>" . ($event['new_status'] ?? '-') . "</span>";
            echo "</div>";
            
            if ($event['notes']) {
                echo "<div style='margin-top:8px;padding:8px;background:#2d2d1a;border-radius:5px;border-right:3px solid #ffa94d'>";
                echo "💬 " . $event['notes'];
                echo "</div>";
            }
            
            echo "<div style='margin-top:8px;font-size:0.8rem;color:#888'>";
            echo "👤 " . ($event['employee_name'] ?? 'النظام');
            echo " • " . $event['event_time'];
            echo "</div>";
            
            echo "</div>";
        }
        
        echo "</div>";
        echo "</div>";
    } else {
        echo "<div class='card warning'>لا توجد أحداث لهذه المعاملة</div>";
    }
}

// ========== الإجراءات ==========
echo "<h2>⚙️ الإجراءات</h2>";

if (isset($_GET['clear_events'])) {
    $conn->query("TRUNCATE TABLE transaction_events");
    echo "<div class='card success'>✅ تم حذف جميع الأحداث</div>";
}

echo "<div class='card'>";
echo "<a href='test_times.php?clear_events=1' class='btn btn-danger'>🗑️ حذف جميع الأحداث</a>";
echo "<a href='test_times.php' class='btn btn-primary'>🔄 تحديث</a>";
echo "<a href='index.php' class='btn btn-success'>🏠 الرئيسية</a>";
echo "</div>";

// ========== روابط API ==========
echo "<h2>🔗 روابط API</h2>";
echo "<div class='card'>";
echo "<a href='api/?action=transaction_events&transaction_id=1' target='_blank' class='btn btn-primary'>📋 أحداث معاملة #1</a>";
echo "<a href='api/?action=performance_summary' target='_blank' class='btn btn-primary'>📊 ملخص الأداء</a>";
echo "</div>";

echo "</div></body></html>";
