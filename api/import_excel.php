<?php
/**
 * api/import_excel.php — استيراد CSV لمراكز التكلفة وبنود الموازنة
 */
session_start();
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../includes/functions.php';

if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'غير مصرح']);
    exit;
}

$type = $_GET['type'] ?? '';
if (!in_array($type, ['cost_centers', 'budget_categories'])) {
    echo json_encode(['success' => false, 'error' => 'نوع غير معروف']);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST' || empty($_FILES['file'])) {
    echo json_encode(['success' => false, 'error' => 'يجب إرسال ملف']);
    exit;
}

$file = $_FILES['file'];
$ext  = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));

if ($ext !== 'csv') {
    echo json_encode(['success' => false, 'error' => 'يُقبل ملف CSV فقط — في Excel: ملف ← حفظ باسم ← CSV UTF-8']);
    exit;
}

if ($file['size'] > 5 * 1024 * 1024) {
    echo json_encode(['success' => false, 'error' => 'حجم الملف كبير (الحد الأقصى 5MB)']);
    exit;
}

// ══════════════════════════════════════════
//  قراءة CSV
// ══════════════════════════════════════════
$handle = fopen($file['tmp_name'], 'r');

// إزالة BOM إن وُجد
$bom = fread($handle, 3);
if ($bom !== "\xEF\xBB\xBF") rewind($handle);

$allLines = [];
while (($line = fgetcsv($handle)) !== false) {
    $allLines[] = $line;
}
fclose($handle);

// ابحث عن صف الرؤوس (يحتوي على name أو اسم)
$headerIdx = -1;
foreach ($allLines as $i => $line) {
    $joined = implode('|', array_map('mb_strtolower', $line));
    if (strpos($joined, 'name') !== false || strpos($joined, 'اسم') !== false) {
        $headerIdx = $i;
        break;
    }
}

if ($headerIdx === -1) {
    $headerRow = ['code', 'name', 'is_active'];
    $dataRows  = $allLines;
} else {
    $rawHeaders = $allLines[$headerIdx];
    $headerRow  = [];
    foreach ($rawHeaders as $h) {
        $h = mb_strtolower(trim($h));
        if (strpos($h, 'code') !== false || strpos($h, 'رقم') !== false || strpos($h, 'كود') !== false) {
            $headerRow[] = 'code';
        } elseif (strpos($h, 'name') !== false || strpos($h, 'اسم') !== false) {
            $headerRow[] = 'name';
        } elseif (strpos($h, 'active') !== false || strpos($h, 'حالة') !== false) {
            $headerRow[] = 'is_active';
        } else {
            $headerRow[] = 'col_' . count($headerRow);
        }
    }
    $dataRows = array_slice($allLines, $headerIdx + 1);
}

$rows = [];
foreach ($dataRows as $line) {
    if (!array_filter($line)) continue;
    $rows[] = array_combine(
        array_slice($headerRow, 0, count($line)),
        array_pad($line, count($headerRow), '')
    );
}

// ══════════════════════════════════════════
//  حفظ في قاعدة البيانات
// ══════════════════════════════════════════
$conn     = db();
$inserted = 0;
$updated  = 0;
$skipped  = 0;
$errors   = [];

foreach ($rows as $idx => $row) {
    $name   = trim($row['name'] ?? '');
    $code   = trim($row['code'] ?? '');
    $active = isset($row['is_active']) ? (int)$row['is_active'] : 1;

    if (!$name) { $skipped++; continue; }

    $name   = $conn->real_escape_string($name);
    $code   = $conn->real_escape_string($code);
    $active = ($active == 0) ? 0 : 1;

    if ($type === 'cost_centers') {
        if (!$code) {
            $errors[] = "الصف " . ($idx + 2) . ": رقم المركز مطلوب — تجاهل \"$name\"";
            $skipped++;
            continue;
        }
        $check = $conn->query("SELECT id FROM cost_centers WHERE code='$code' LIMIT 1");
        if ($check && $check->num_rows > 0) {
            $r = $check->fetch_assoc();
            $conn->query("UPDATE cost_centers SET name='$name', is_active=$active WHERE id={$r['id']}");
            $updated++;
        } else {
            $conn->query("INSERT INTO cost_centers (code, name, is_active) VALUES ('$code','$name',$active)");
            $inserted++;
        }
    } else {
        $codeVal = $code ? "'$code'" : 'NULL';
        $check = $conn->query("SELECT id FROM budget_categories WHERE name='$name' LIMIT 1");
        if ($check && $check->num_rows > 0) {
            $r = $check->fetch_assoc();
            $conn->query("UPDATE budget_categories SET code=$codeVal, is_active=$active WHERE id={$r['id']}");
            $updated++;
        } else {
            $conn->query("INSERT INTO budget_categories (name, code, is_active) VALUES ('$name',$codeVal,$active)");
            $inserted++;
        }
    }
}

echo json_encode([
    'success'  => true,
    'inserted' => $inserted,
    'updated'  => $updated,
    'skipped'  => $skipped,
    'errors'   => $errors,
    'message'  => "تم الاستيراد: {$inserted} جديد، {$updated} تحديث" . ($skipped ? "، {$skipped} متجاهَل" : ''),
]);