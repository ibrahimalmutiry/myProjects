<?php
/**
 * أداة تشخيص قاعدة البيانات - نظام إدارة المعاملات
 * Database Diagnostic Tool - Workflow Management System
 * 
 * ضع هذا الملف في مجلد المشروع وافتحه في المتصفح
 * http://localhost/your-project/db_check.php
 */

// إعدادات قاعدة البيانات (من config.php)
define('DB_HOST', 'localhost');
define('DB_NAME', 'workflow_system');
define('DB_USER', 'root');
define('DB_PASS', '');
define('DB_CHARSET', 'utf8mb4');

// الجداول المطلوبة
$REQUIRED_TABLES = [
    // نظام المعاملات
    'employees' => [
        'id', 'employee_number', 'name', 'email', 'phone', 'role', 
        'password', 'is_registered', 'is_active', 'last_login', 'created_at', 'updated_at'
    ],
    'transaction_types' => [
        'id', 'name', 'description', 'is_active', 'created_at'
    ],
    'transactions' => [
        'id', 'transaction_number', 'transaction_date', 'type_id', 'description',
        'amount', 'attachment', 'attachment_name', 'created_by', 'created_at', 'updated_at'
    ],
    'receiving_data' => [
        'id', 'transaction_id', 'employee_id', 'receive_date', 'status', 'notes', 'created_at', 'updated_at'
    ],
    'budget_data' => [
        'id', 'transaction_id', 'employee_id', 'review_date', 'budget_status', 'budget_code', 'notes', 'created_at', 'updated_at'
    ],
    'payment_data' => [
        'id', 'transaction_id', 'employee_id', 'payment_date', 'payment_method', 'status', 'reference_number', 'notes', 'created_at', 'updated_at'
    ],
    'invoice_data' => [
        'id', 'transaction_id', 'employee_id', 'invoice_number', 'invoice_date', 'status', 'alert_type', 'notes', 'created_at', 'updated_at'
    ],
    'activity_log' => [
        'id', 'transaction_id', 'action', 'details', 'created_at'
    ],
    'stage_times' => [
        'id', 'transaction_id', 'stage', 'employee_id', 'started_at', 'completed_at', 'duration_minutes', 'status', 'created_at', 'updated_at'
    ],
    'transaction_events' => [
        'id', 'transaction_id', 'stage', 'action', 'old_value', 'new_value', 'notes', 'employee_id', 'created_at'
    ],
    // نظام المراسلات
    'departments' => [
        'id', 'name', 'code', 'description', 'manager_id', 'parent_id', 'is_active', 'created_at', 'updated_at'
    ],
    'correspondence' => [
        'id', 'correspondence_number', 'correspondence_date', 'type', 'category', 'subject', 'content',
        'from_department_id', 'to_department_id', 'from_external', 'to_external', 'priority',
        'deadline_date', 'is_draft', 'current_stage', 'created_by', 'created_at', 'updated_at'
    ],
    'correspondence_stages' => [
        'id', 'correspondence_id', 'stage_name', 'stage_order', 'status', 'assigned_to', 'started_at', 'completed_at', 'notes', 'created_at'
    ],
    'correspondence_workflow_templates' => [
        'id', 'correspondence_type', 'stage_name', 'stage_order', 'required_role', 'is_active', 'created_at'
    ],
    'correspondence_attachments' => [
        'id', 'correspondence_id', 'file_name', 'original_name', 'file_path', 'file_type', 'file_size', 'uploaded_by', 'uploaded_at'
    ],
    'correspondence_templates' => [
        'id', 'template_name', 'correspondence_type', 'subject_template', 'content_template', 'is_public', 'usage_count', 'created_by', 'created_at'
    ],
    'correspondence_audit_log' => [
        'id', 'correspondence_id', 'employee_id', 'action', 'old_value', 'new_value', 'description', 'ip_address', 'user_agent', 'created_at'
    ]
];

$REQUIRED_VIEWS = ['v_full_transactions'];

?>
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>تشخيص قاعدة البيانات - نظام إدارة المعاملات</title>
    <style>
        * { box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            color: #eee;
            margin: 0;
            padding: 20px;
            min-height: 100vh;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        h1 {
            text-align: center;
            color: #00d4ff;
            margin-bottom: 30px;
            font-size: 2em;
            text-shadow: 0 0 10px rgba(0,212,255,0.3);
        }
        .card {
            background: rgba(255,255,255,0.05);
            border-radius: 15px;
            padding: 25px;
            margin-bottom: 25px;
            border: 1px solid rgba(255,255,255,0.1);
            backdrop-filter: blur(10px);
        }
        .card-title {
            color: #00d4ff;
            font-size: 1.3em;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 2px solid rgba(0,212,255,0.3);
        }
        .status-box {
            display: inline-flex;
            align-items: center;
            padding: 8px 15px;
            border-radius: 8px;
            margin: 5px;
            font-weight: bold;
        }
        .status-success { background: rgba(0,200,83,0.2); color: #00c853; border: 1px solid #00c853; }
        .status-error { background: rgba(255,82,82,0.2); color: #ff5252; border: 1px solid #ff5252; }
        .status-warning { background: rgba(255,193,7,0.2); color: #ffc107; border: 1px solid #ffc107; }
        .status-info { background: rgba(33,150,243,0.2); color: #2196f3; border: 1px solid #2196f3; }
        
        .table-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
            gap: 15px;
        }
        .table-item {
            background: rgba(0,0,0,0.3);
            border-radius: 10px;
            padding: 15px;
            border: 1px solid rgba(255,255,255,0.1);
        }
        .table-name {
            font-size: 1.1em;
            font-weight: bold;
            margin-bottom: 10px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .table-name .icon { font-size: 1.2em; }
        .columns-list {
            font-size: 0.85em;
            color: #aaa;
            line-height: 1.6;
        }
        .col-exists { color: #00c853; }
        .col-missing { color: #ff5252; font-weight: bold; }
        
        .summary {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 15px;
            text-align: center;
        }
        .summary-item {
            padding: 20px;
            border-radius: 10px;
            background: rgba(0,0,0,0.3);
        }
        .summary-number {
            font-size: 2.5em;
            font-weight: bold;
            margin-bottom: 5px;
        }
        .summary-label {
            font-size: 0.9em;
            color: #aaa;
        }
        
        .sql-box {
            background: #0d1117;
            border-radius: 10px;
            padding: 20px;
            font-family: 'Courier New', monospace;
            font-size: 0.85em;
            overflow-x: auto;
            white-space: pre-wrap;
            word-wrap: break-word;
            border: 1px solid #30363d;
            max-height: 400px;
            overflow-y: auto;
        }
        .sql-keyword { color: #ff7b72; }
        .sql-string { color: #a5d6ff; }
        .sql-comment { color: #8b949e; }
        
        .btn {
            display: inline-block;
            padding: 12px 25px;
            background: linear-gradient(135deg, #00d4ff, #0066cc);
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 1em;
            text-decoration: none;
            transition: all 0.3s;
        }
        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 20px rgba(0,212,255,0.4);
        }
        
        .progress-bar {
            height: 8px;
            background: rgba(255,255,255,0.1);
            border-radius: 4px;
            overflow: hidden;
            margin-top: 10px;
        }
        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #00c853, #00d4ff);
            transition: width 0.5s;
        }
        
        .alert {
            padding: 15px 20px;
            border-radius: 10px;
            margin-bottom: 20px;
        }
        .alert-danger {
            background: rgba(255,82,82,0.2);
            border: 1px solid #ff5252;
            color: #ff8a80;
        }
        .alert-success {
            background: rgba(0,200,83,0.2);
            border: 1px solid #00c853;
            color: #69f0ae;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔍 تشخيص قاعدة البيانات</h1>
        
        <?php
        // محاولة الاتصال
        $conn = @new mysqli(DB_HOST, DB_USER, DB_PASS);
        
        if ($conn->connect_error) {
            echo '<div class="alert alert-danger">❌ فشل الاتصال بـ MySQL: ' . $conn->connect_error . '</div>';
            echo '<div class="card"><div class="card-title">💡 الحل</div>';
            echo '<p>تأكد من أن خدمة MySQL تعمل وأن بيانات الاتصال صحيحة في أعلى هذا الملف.</p></div>';
            exit;
        }
        
        $conn->set_charset(DB_CHARSET);
        
        // التحقق من قاعدة البيانات
        $dbResult = $conn->query("SHOW DATABASES LIKE '" . DB_NAME . "'");
        $dbExists = ($dbResult && $dbResult->num_rows > 0);
        
        $issues = [];
        $fixes = [];
        $stats = [
            'tables_total' => count($REQUIRED_TABLES),
            'tables_exist' => 0,
            'tables_missing' => 0,
            'columns_missing' => 0,
            'views_missing' => 0,
            'data_empty' => 0
        ];
        
        if (!$dbExists) {
            $issues[] = ['type' => 'critical', 'msg' => 'قاعدة البيانات ' . DB_NAME . ' غير موجودة'];
            $fixes[] = "CREATE DATABASE IF NOT EXISTS `" . DB_NAME . "` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;";
        } else {
            $conn->select_db(DB_NAME);
            
            // فحص الجداول
            foreach ($REQUIRED_TABLES as $tableName => $columns) {
                $tableResult = $conn->query("SHOW TABLES LIKE '$tableName'");
                if (!$tableResult || $tableResult->num_rows == 0) {
                    $stats['tables_missing']++;
                    $issues[] = ['type' => 'critical', 'msg' => "الجدول $tableName غير موجود"];
                } else {
                    $stats['tables_exist']++;
                    
                    // فحص الأعمدة
                    $colResult = $conn->query("SHOW COLUMNS FROM `$tableName`");
                    $existingCols = [];
                    while ($row = $colResult->fetch_assoc()) {
                        $existingCols[] = $row['Field'];
                    }
                    
                    foreach ($columns as $col) {
                        if (!in_array($col, $existingCols)) {
                            $stats['columns_missing']++;
                            $issues[] = ['type' => 'warning', 'msg' => "العمود $col غير موجود في جدول $tableName"];
                        }
                    }
                    
                    // فحص البيانات
                    $countResult = $conn->query("SELECT COUNT(*) as c FROM `$tableName`");
                    $count = $countResult->fetch_assoc()['c'];
                    if ($count == 0 && in_array($tableName, ['employees', 'transaction_types', 'departments'])) {
                        $stats['data_empty']++;
                        $issues[] = ['type' => 'info', 'msg' => "جدول $tableName فارغ - يحتاج بيانات أساسية"];
                    }
                }
            }
            
            // فحص Views
            foreach ($REQUIRED_VIEWS as $viewName) {
                $viewResult = $conn->query("SHOW FULL TABLES WHERE Table_Type = 'VIEW' AND Tables_in_" . DB_NAME . " = '$viewName'");
                if (!$viewResult || $viewResult->num_rows == 0) {
                    $stats['views_missing']++;
                    $issues[] = ['type' => 'warning', 'msg' => "View $viewName غير موجود"];
                }
            }
        }
        
        $healthPercent = $dbExists ? round(($stats['tables_exist'] / $stats['tables_total']) * 100) : 0;
        ?>
        
        <!-- ملخص الحالة -->
        <div class="card">
            <div class="card-title">📊 ملخص الحالة</div>
            <div class="summary">
                <div class="summary-item">
                    <div class="summary-number" style="color: <?= $dbExists ? '#00c853' : '#ff5252' ?>">
                        <?= $dbExists ? '✓' : '✗' ?>
                    </div>
                    <div class="summary-label">قاعدة البيانات</div>
                </div>
                <div class="summary-item">
                    <div class="summary-number" style="color: #00c853"><?= $stats['tables_exist'] ?></div>
                    <div class="summary-label">جداول موجودة</div>
                </div>
                <div class="summary-item">
                    <div class="summary-number" style="color: #ff5252"><?= $stats['tables_missing'] ?></div>
                    <div class="summary-label">جداول ناقصة</div>
                </div>
                <div class="summary-item">
                    <div class="summary-number" style="color: #ffc107"><?= $stats['columns_missing'] ?></div>
                    <div class="summary-label">أعمدة ناقصة</div>
                </div>
                <div class="summary-item">
                    <div class="summary-number" style="color: #2196f3"><?= count($issues) ?></div>
                    <div class="summary-label">إجمالي المشاكل</div>
                </div>
            </div>
            <div class="progress-bar">
                <div class="progress-fill" style="width: <?= $healthPercent ?>%"></div>
            </div>
            <p style="text-align: center; margin-top: 10px; color: #aaa;">
                صحة قاعدة البيانات: <?= $healthPercent ?>%
            </p>
        </div>
        
        <?php if (empty($issues)): ?>
        <div class="alert alert-success">
            ✅ ممتاز! قاعدة البيانات متوافقة تماماً مع النظام.
        </div>
        <?php else: ?>
        
        <!-- قائمة المشاكل -->
        <div class="card">
            <div class="card-title">⚠️ المشاكل المكتشفة (<?= count($issues) ?>)</div>
            <?php foreach ($issues as $issue): ?>
            <div class="status-box status-<?= $issue['type'] === 'critical' ? 'error' : ($issue['type'] === 'warning' ? 'warning' : 'info') ?>">
                <?= $issue['type'] === 'critical' ? '🔴' : ($issue['type'] === 'warning' ? '🟡' : '🔵') ?>
                <?= $issue['msg'] ?>
            </div>
            <?php endforeach; ?>
        </div>
        
        <?php endif; ?>
        
        <!-- تفاصيل الجداول -->
        <div class="card">
            <div class="card-title">📋 تفاصيل الجداول</div>
            <div class="table-grid">
                <?php 
                if ($dbExists) {
                    $conn->select_db(DB_NAME);
                }
                foreach ($REQUIRED_TABLES as $tableName => $requiredColumns): 
                    $tableExists = false;
                    $existingCols = [];
                    $rowCount = 0;
                    
                    if ($dbExists) {
                        $tableResult = $conn->query("SHOW TABLES LIKE '$tableName'");
                        $tableExists = ($tableResult && $tableResult->num_rows > 0);
                        
                        if ($tableExists) {
                            $colResult = $conn->query("SHOW COLUMNS FROM `$tableName`");
                            while ($row = $colResult->fetch_assoc()) {
                                $existingCols[] = $row['Field'];
                            }
                            $countResult = $conn->query("SELECT COUNT(*) as c FROM `$tableName`");
                            $rowCount = $countResult->fetch_assoc()['c'];
                        }
                    }
                ?>
                <div class="table-item">
                    <div class="table-name">
                        <span class="icon"><?= $tableExists ? '✅' : '❌' ?></span>
                        <?= $tableName ?>
                        <?php if ($tableExists): ?>
                        <span style="color: #aaa; font-size: 0.8em; font-weight: normal;">(<?= $rowCount ?> صف)</span>
                        <?php endif; ?>
                    </div>
                    <div class="columns-list">
                        <?php foreach ($requiredColumns as $col): ?>
                        <span class="<?= in_array($col, $existingCols) ? 'col-exists' : 'col-missing' ?>">
                            <?= $col ?><?= in_array($col, $existingCols) ? '' : ' ⚠' ?>
                        </span>
                        <?php if ($col !== end($requiredColumns)): ?>, <?php endif; ?>
                        <?php endforeach; ?>
                    </div>
                </div>
                <?php endforeach; ?>
            </div>
        </div>
        
        <!-- ملف SQL للإصلاح -->
        <div class="card">
            <div class="card-title">🔧 ملف SQL للإصلاح الكامل</div>
            <p style="color: #aaa; margin-bottom: 15px;">
                انسخ الكود التالي وألصقه في phpMyAdmin أو احفظه كملف .sql ونفذه
            </p>
            <a href="?download=1" class="btn" style="margin-bottom: 15px;">📥 تحميل ملف SQL</a>
            <div class="sql-box" id="sqlCode">
-- استورد ملف workflow_db_complete.sql
-- أو استخدم هذا الرابط لتحميله

<?php
// عرض جزء من ملف SQL
echo "-- ═══════════════════════════════════════════════════════════════\n";
echo "-- لإصلاح قاعدة البيانات، نفذ ملف: workflow_db_complete.sql\n";
echo "-- ═══════════════════════════════════════════════════════════════\n\n";

if (!$dbExists) {
    echo "CREATE DATABASE IF NOT EXISTS `" . DB_NAME . "` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\n";
    echo "USE `" . DB_NAME . "`;\n\n";
}

// توليد أوامر إنشاء الجداول الناقصة
foreach ($REQUIRED_TABLES as $tableName => $columns) {
    $tableResult = $dbExists ? $conn->query("SHOW TABLES LIKE '$tableName'") : false;
    if (!$tableResult || $tableResult->num_rows == 0) {
        echo "-- جدول $tableName غير موجود - راجع ملف workflow_db_complete.sql\n";
    }
}
?>
            </div>
        </div>
        
        <!-- معلومات الاتصال -->
        <div class="card">
            <div class="card-title">ℹ️ معلومات الاتصال</div>
            <table style="width: 100%; color: #aaa;">
                <tr><td>Host:</td><td><?= DB_HOST ?></td></tr>
                <tr><td>Database:</td><td><?= DB_NAME ?></td></tr>
                <tr><td>User:</td><td><?= DB_USER ?></td></tr>
                <tr><td>Charset:</td><td><?= DB_CHARSET ?></td></tr>
                <tr><td>PHP Version:</td><td><?= phpversion() ?></td></tr>
                <tr><td>MySQL Version:</td><td><?= $conn->server_info ?></td></tr>
            </table>
        </div>
        
    </div>
</body>
</html>
<?php
// تحميل ملف SQL
if (isset($_GET['download'])) {
    header('Content-Type: application/sql');
    header('Content-Disposition: attachment; filename="workflow_db_fix_' . date('Y-m-d') . '.sql"');
    
    // قراءة ملف SQL الكامل إذا كان موجوداً
    $sqlFile = __DIR__ . '/workflow_db_complete.sql';
    if (file_exists($sqlFile)) {
        readfile($sqlFile);
    } else {
        echo "-- الملف غير موجود. استخدم الملف المرفق workflow_db_complete.sql";
    }
    exit;
}

$conn->close();
?>
