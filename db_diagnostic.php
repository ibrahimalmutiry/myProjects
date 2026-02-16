<?php
/**
 * أداة تشخيص قاعدة البيانات
 * Database Diagnostic Tool
 * 
 * هذا الملف يفحص قاعدة البيانات ويقارنها مع متطلبات النظام الحالي
 * ويولد تقرير بالنواقص + أكواد SQL لإصلاحها
 */

// إعدادات قاعدة البيانات
define('DB_HOST', 'localhost');
define('DB_NAME', 'workflow_system');
define('DB_USER', 'root');
define('DB_PASS', '');
define('DB_CHARSET', 'utf8mb4');

// الجداول المطلوبة للنظام مع أعمدتها
$REQUIRED_TABLES = [
    // =====================================================
    // جداول نظام المعاملات الأساسية
    // =====================================================
    'employees' => [
        'columns' => [
            'id' => 'INT PRIMARY KEY AUTO_INCREMENT',
            'employee_number' => 'VARCHAR(20)',
            'name' => 'VARCHAR(100) NOT NULL',
            'email' => 'VARCHAR(100)',
            'phone' => 'VARCHAR(20)',
            'role' => "ENUM('admin','receiver','budget','payment','invoice') DEFAULT 'receiver'",
            'password' => 'VARCHAR(255)',
            'is_registered' => 'TINYINT(1) DEFAULT 0',
            'is_active' => 'TINYINT(1) DEFAULT 1',
            'last_login' => 'DATETIME',
            'created_at' => 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
            'updated_at' => 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
        ],
        'indexes' => [
            'idx_employee_number' => 'employee_number',
            'idx_role' => 'role'
        ]
    ],
    
    'transaction_types' => [
        'columns' => [
            'id' => 'INT PRIMARY KEY AUTO_INCREMENT',
            'name' => 'VARCHAR(100) NOT NULL',
            'description' => 'TEXT',
            'is_active' => 'TINYINT(1) DEFAULT 1',
            'created_at' => 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
        ]
    ],
    
    'transactions' => [
        'columns' => [
            'id' => 'INT PRIMARY KEY AUTO_INCREMENT',
            'transaction_number' => 'VARCHAR(20) NOT NULL',
            'transaction_date' => 'DATETIME NOT NULL',
            'type_id' => 'INT',
            'description' => 'TEXT',
            'amount' => 'DECIMAL(15,2) DEFAULT 0.00',
            'attachment' => 'VARCHAR(255)',
            'attachment_name' => 'VARCHAR(255)',
            'created_by' => 'INT',
            'created_at' => 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
            'updated_at' => 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
        ],
        'indexes' => [
            'idx_transaction_number' => 'transaction_number',
            'idx_transaction_date' => 'transaction_date',
            'idx_type_id' => 'type_id'
        ],
        'foreign_keys' => [
            'fk_transactions_type' => 'type_id REFERENCES transaction_types(id)',
            'fk_transactions_creator' => 'created_by REFERENCES employees(id)'
        ]
    ],
    
    'receiving_data' => [
        'columns' => [
            'id' => 'INT PRIMARY KEY AUTO_INCREMENT',
            'transaction_id' => 'INT UNIQUE NOT NULL',
            'employee_id' => 'INT',
            'receive_date' => 'DATETIME',
            'status' => "ENUM('معلق','مستلم','مرفوض') DEFAULT 'معلق'",
            'notes' => 'TEXT',
            'created_at' => 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
            'updated_at' => 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
        ],
        'foreign_keys' => [
            'fk_receiving_transaction' => 'transaction_id REFERENCES transactions(id) ON DELETE CASCADE',
            'fk_receiving_employee' => 'employee_id REFERENCES employees(id)'
        ]
    ],
    
    'budget_data' => [
        'columns' => [
            'id' => 'INT PRIMARY KEY AUTO_INCREMENT',
            'transaction_id' => 'INT UNIQUE NOT NULL',
            'employee_id' => 'INT',
            'review_date' => 'DATETIME',
            'budget_status' => "ENUM('معتمد','قيد المراجعة','مرفوض','معلق') DEFAULT 'معلق'",
            'budget_code' => 'VARCHAR(50)',
            'notes' => 'TEXT',
            'created_at' => 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
            'updated_at' => 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
        ],
        'foreign_keys' => [
            'fk_budget_transaction' => 'transaction_id REFERENCES transactions(id) ON DELETE CASCADE',
            'fk_budget_employee' => 'employee_id REFERENCES employees(id)'
        ]
    ],
    
    'payment_data' => [
        'columns' => [
            'id' => 'INT PRIMARY KEY AUTO_INCREMENT',
            'transaction_id' => 'INT UNIQUE NOT NULL',
            'employee_id' => 'INT',
            'payment_date' => 'DATETIME',
            'payment_method' => "ENUM('نقدي','تحويل بنكي','شيك')",
            'status' => "ENUM('معلق','تم الدفع','ملغي') DEFAULT 'معلق'",
            'reference_number' => 'VARCHAR(50)',
            'notes' => 'TEXT',
            'created_at' => 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
            'updated_at' => 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
        ],
        'foreign_keys' => [
            'fk_payment_transaction' => 'transaction_id REFERENCES transactions(id) ON DELETE CASCADE',
            'fk_payment_employee' => 'employee_id REFERENCES employees(id)'
        ]
    ],
    
    'invoice_data' => [
        'columns' => [
            'id' => 'INT PRIMARY KEY AUTO_INCREMENT',
            'transaction_id' => 'INT UNIQUE NOT NULL',
            'employee_id' => 'INT',
            'invoice_number' => 'VARCHAR(50)',
            'invoice_date' => 'DATETIME',
            'status' => "ENUM('صدرت الفاتورة','قيد الإصدار','ملغاة')",
            'alert_type' => "ENUM('انتظار','عاجل','متابعة') DEFAULT 'انتظار'",
            'notes' => 'TEXT',
            'created_at' => 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
            'updated_at' => 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
        ],
        'foreign_keys' => [
            'fk_invoice_transaction' => 'transaction_id REFERENCES transactions(id) ON DELETE CASCADE',
            'fk_invoice_employee' => 'employee_id REFERENCES employees(id)'
        ]
    ],
    
    'activity_log' => [
        'columns' => [
            'id' => 'INT PRIMARY KEY AUTO_INCREMENT',
            'transaction_id' => 'INT',
            'action' => 'VARCHAR(100)',
            'details' => 'TEXT',
            'created_at' => 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
        ],
        'indexes' => [
            'idx_activity_transaction' => 'transaction_id',
            'idx_activity_created' => 'created_at'
        ]
    ],
    
    'stage_times' => [
        'columns' => [
            'id' => 'INT PRIMARY KEY AUTO_INCREMENT',
            'transaction_id' => 'INT NOT NULL',
            'stage' => "ENUM('creation','receiving','budget','payment','invoice') NOT NULL",
            'employee_id' => 'INT',
            'started_at' => 'DATETIME',
            'completed_at' => 'DATETIME',
            'duration_minutes' => 'INT',
            'status' => 'VARCHAR(50)',
            'created_at' => 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
            'updated_at' => 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
        ],
        'indexes' => [
            'unique_stage' => 'transaction_id, stage (UNIQUE)'
        ]
    ],
    
    'transaction_events' => [
        'columns' => [
            'id' => 'INT PRIMARY KEY AUTO_INCREMENT',
            'transaction_id' => 'INT NOT NULL',
            'stage' => 'VARCHAR(50) NOT NULL',
            'action' => 'VARCHAR(100) NOT NULL',
            'old_value' => 'VARCHAR(255)',
            'new_value' => 'VARCHAR(255)',
            'notes' => 'TEXT',
            'employee_id' => 'INT',
            'created_at' => 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
        ],
        'indexes' => [
            'idx_events_transaction' => 'transaction_id',
            'idx_events_stage' => 'stage'
        ]
    ],
    
    // =====================================================
    // جداول نظام المراسلات
    // =====================================================
    'departments' => [
        'columns' => [
            'id' => 'INT PRIMARY KEY AUTO_INCREMENT',
            'name' => 'VARCHAR(100) NOT NULL',
            'code' => 'VARCHAR(20)',
            'description' => 'TEXT',
            'manager_id' => 'INT',
            'parent_id' => 'INT',
            'is_active' => 'TINYINT(1) DEFAULT 1',
            'created_at' => 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
            'updated_at' => 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
        ]
    ],
    
    'correspondence' => [
        'columns' => [
            'id' => 'INT PRIMARY KEY AUTO_INCREMENT',
            'correspondence_number' => 'VARCHAR(50) NOT NULL',
            'correspondence_date' => 'DATE NOT NULL',
            'type' => "ENUM('internal_finance','internal_general','incoming','outgoing') NOT NULL",
            'category' => "VARCHAR(50) DEFAULT 'normal'",
            'subject' => 'VARCHAR(500) NOT NULL',
            'content' => 'TEXT',
            'from_department_id' => 'INT',
            'to_department_id' => 'INT',
            'from_external' => 'VARCHAR(255)',
            'to_external' => 'VARCHAR(255)',
            'priority' => "ENUM('low','normal','high','urgent') DEFAULT 'normal'",
            'deadline_date' => 'DATE',
            'is_draft' => 'TINYINT(1) DEFAULT 0',
            'current_stage' => 'VARCHAR(50)',
            'created_by' => 'INT NOT NULL',
            'created_at' => 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
            'updated_at' => 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
        ],
        'indexes' => [
            'idx_corr_number' => 'correspondence_number',
            'idx_corr_type' => 'type',
            'idx_corr_date' => 'correspondence_date'
        ]
    ],
    
    'correspondence_stages' => [
        'columns' => [
            'id' => 'INT PRIMARY KEY AUTO_INCREMENT',
            'correspondence_id' => 'INT NOT NULL',
            'stage_name' => 'VARCHAR(100) NOT NULL',
            'stage_order' => 'INT NOT NULL',
            'status' => "ENUM('pending','in_progress','completed','rejected') DEFAULT 'pending'",
            'assigned_to' => 'INT',
            'started_at' => 'DATETIME',
            'completed_at' => 'DATETIME',
            'notes' => 'TEXT',
            'created_at' => 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
        ],
        'foreign_keys' => [
            'fk_stages_corr' => 'correspondence_id REFERENCES correspondence(id) ON DELETE CASCADE'
        ]
    ],
    
    'correspondence_workflow_templates' => [
        'columns' => [
            'id' => 'INT PRIMARY KEY AUTO_INCREMENT',
            'correspondence_type' => "ENUM('internal_finance','internal_general','incoming','outgoing') NOT NULL",
            'stage_name' => 'VARCHAR(100) NOT NULL',
            'stage_order' => 'INT NOT NULL',
            'required_role' => 'VARCHAR(50)',
            'is_active' => 'TINYINT(1) DEFAULT 1',
            'created_at' => 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
        ]
    ],
    
    'correspondence_attachments' => [
        'columns' => [
            'id' => 'INT PRIMARY KEY AUTO_INCREMENT',
            'correspondence_id' => 'INT NOT NULL',
            'file_name' => 'VARCHAR(255) NOT NULL',
            'original_name' => 'VARCHAR(255) NOT NULL',
            'file_path' => 'VARCHAR(500) NOT NULL',
            'file_type' => 'VARCHAR(100)',
            'file_size' => 'INT',
            'uploaded_by' => 'INT',
            'uploaded_at' => 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
        ],
        'foreign_keys' => [
            'fk_attachments_corr' => 'correspondence_id REFERENCES correspondence(id) ON DELETE CASCADE'
        ]
    ],
    
    'correspondence_templates' => [
        'columns' => [
            'id' => 'INT PRIMARY KEY AUTO_INCREMENT',
            'template_name' => 'VARCHAR(200) NOT NULL',
            'correspondence_type' => "ENUM('internal_finance','internal_general','incoming','outgoing')",
            'subject_template' => 'VARCHAR(500)',
            'content_template' => 'TEXT',
            'is_public' => 'TINYINT(1) DEFAULT 1',
            'usage_count' => 'INT DEFAULT 0',
            'created_by' => 'INT',
            'created_at' => 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
        ]
    ],
    
    'correspondence_audit_log' => [
        'columns' => [
            'id' => 'INT PRIMARY KEY AUTO_INCREMENT',
            'correspondence_id' => 'INT NOT NULL',
            'employee_id' => 'INT NOT NULL',
            'action' => 'VARCHAR(100) NOT NULL',
            'old_value' => 'TEXT',
            'new_value' => 'TEXT',
            'description' => 'TEXT',
            'ip_address' => 'VARCHAR(45)',
            'user_agent' => 'TEXT',
            'created_at' => 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
        ],
        'indexes' => [
            'idx_audit_corr' => 'correspondence_id',
            'idx_audit_employee' => 'employee_id'
        ]
    ]
];

// الـ Views المطلوبة
$REQUIRED_VIEWS = [
    'v_full_transactions' => "
        CREATE VIEW v_full_transactions AS
        SELECT 
            t.id,
            t.transaction_number,
            t.transaction_date,
            tt.name as transaction_type,
            t.description,
            t.amount,
            IFNULL(t.attachment, '') as attachment,
            IFNULL(t.attachment_name, '') as attachment_name,
            
            t.created_by,
            ec.name as created_by_name,
            t.created_at as creation_time,
            
            r.status as receive_status,
            r.receive_date,
            r.notes as receive_notes,
            er.name as receiver_name,
            
            b.budget_status,
            b.review_date as budget_date,
            b.budget_code,
            b.notes as budget_notes,
            eb.name as budget_employee_name,
            
            p.status as payment_status,
            p.payment_date,
            p.payment_method,
            p.reference_number,
            p.notes as payment_notes,
            ep.name as payment_employee_name,
            
            i.status as invoice_status,
            i.invoice_number,
            i.invoice_date,
            i.alert_type,
            i.notes as invoice_notes,
            ei.name as invoice_employee_name,
            
            t.created_at,
            t.updated_at
        FROM transactions t
        LEFT JOIN transaction_types tt ON t.type_id = tt.id
        LEFT JOIN employees ec ON t.created_by = ec.id
        LEFT JOIN receiving_data r ON t.id = r.transaction_id
        LEFT JOIN employees er ON r.employee_id = er.id
        LEFT JOIN budget_data b ON t.id = b.transaction_id
        LEFT JOIN employees eb ON b.employee_id = eb.id
        LEFT JOIN payment_data p ON t.id = p.transaction_id
        LEFT JOIN employees ep ON p.employee_id = ep.id
        LEFT JOIN invoice_data i ON t.id = i.transaction_id
        LEFT JOIN employees ei ON i.employee_id = ei.id
    "
];

// البيانات الأساسية المطلوبة
$REQUIRED_DATA = [
    'transaction_types' => [
        ['name' => 'أمر شراء', 'description' => 'أوامر الشراء والتوريد'],
        ['name' => 'فاتورة مورد', 'description' => 'فواتير الموردين'],
        ['name' => 'مستخلص', 'description' => 'المستخلصات الشهرية'],
        ['name' => 'سلفة', 'description' => 'السلف والعهد'],
        ['name' => 'تسوية', 'description' => 'التسويات المالية'],
        ['name' => 'مطالبة مالية', 'description' => 'المطالبات المالية'],
        ['name' => 'صرف راتب', 'description' => 'صرف الرواتب'],
        ['name' => 'أخرى', 'description' => 'معاملات أخرى']
    ],
    'employees' => [
        ['employee_number' => 'EMP0001', 'name' => 'مدير النظام', 'role' => 'admin', 'is_active' => 1],
        ['employee_number' => 'EMP0002', 'name' => 'موظف الاستلام', 'role' => 'receiver', 'is_active' => 1],
        ['employee_number' => 'EMP0003', 'name' => 'موظف الموازنة', 'role' => 'budget', 'is_active' => 1],
        ['employee_number' => 'EMP0004', 'name' => 'موظف الدفع', 'role' => 'payment', 'is_active' => 1],
        ['employee_number' => 'EMP0005', 'name' => 'موظف الفوترة', 'role' => 'invoice', 'is_active' => 1]
    ],
    'departments' => [
        ['name' => 'القطاع المالي', 'code' => 'FIN', 'is_active' => 1],
        ['name' => 'الشؤون الإدارية', 'code' => 'ADM', 'is_active' => 1],
        ['name' => 'المشتريات', 'code' => 'PUR', 'is_active' => 1],
        ['name' => 'الموارد البشرية', 'code' => 'HR', 'is_active' => 1],
        ['name' => 'تقنية المعلومات', 'code' => 'IT', 'is_active' => 1]
    ],
    'correspondence_workflow_templates' => [
        // خطاب مالي داخلي
        ['correspondence_type' => 'internal_finance', 'stage_name' => 'إنشاء', 'stage_order' => 1],
        ['correspondence_type' => 'internal_finance', 'stage_name' => 'مراجعة', 'stage_order' => 2],
        ['correspondence_type' => 'internal_finance', 'stage_name' => 'اعتماد', 'stage_order' => 3],
        ['correspondence_type' => 'internal_finance', 'stage_name' => 'تسليم', 'stage_order' => 4],
        // خطاب عام داخلي
        ['correspondence_type' => 'internal_general', 'stage_name' => 'إنشاء', 'stage_order' => 1],
        ['correspondence_type' => 'internal_general', 'stage_name' => 'اعتماد', 'stage_order' => 2],
        ['correspondence_type' => 'internal_general', 'stage_name' => 'تسليم', 'stage_order' => 3],
        // خطاب وارد
        ['correspondence_type' => 'incoming', 'stage_name' => 'استلام', 'stage_order' => 1],
        ['correspondence_type' => 'incoming', 'stage_name' => 'توجيه', 'stage_order' => 2],
        ['correspondence_type' => 'incoming', 'stage_name' => 'معالجة', 'stage_order' => 3],
        ['correspondence_type' => 'incoming', 'stage_name' => 'أرشفة', 'stage_order' => 4],
        // خطاب صادر
        ['correspondence_type' => 'outgoing', 'stage_name' => 'إنشاء', 'stage_order' => 1],
        ['correspondence_type' => 'outgoing', 'stage_name' => 'مراجعة', 'stage_order' => 2],
        ['correspondence_type' => 'outgoing', 'stage_name' => 'اعتماد', 'stage_order' => 3],
        ['correspondence_type' => 'outgoing', 'stage_name' => 'إرسال', 'stage_order' => 4]
    ]
];

// =====================================================
// فئة التشخيص
// =====================================================
class DatabaseDiagnostic {
    private $conn;
    private $issues = [];
    private $fixes = [];
    
    public function __construct() {
        $this->connect();
    }
    
    private function connect() {
        $this->conn = new mysqli(DB_HOST, DB_USER, DB_PASS);
        
        if ($this->conn->connect_error) {
            die("❌ فشل الاتصال بـ MySQL: " . $this->conn->connect_error . "\n");
        }
        
        $this->conn->set_charset(DB_CHARSET);
    }
    
    public function run() {
        echo "╔════════════════════════════════════════════════════════════╗\n";
        echo "║     أداة تشخيص قاعدة البيانات - نظام إدارة المعاملات        ║\n";
        echo "╚════════════════════════════════════════════════════════════╝\n\n";
        
        // 1. فحص قاعدة البيانات
        $this->checkDatabase();
        
        // 2. فحص الجداول
        $this->checkTables();
        
        // 3. فحص Views
        $this->checkViews();
        
        // 4. فحص البيانات الأساسية
        $this->checkRequiredData();
        
        // 5. طباعة التقرير
        $this->printReport();
        
        // 6. توليد ملف SQL للإصلاح
        $this->generateFixSQL();
    }
    
    private function checkDatabase() {
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
        echo "【1】 فحص قاعدة البيانات: " . DB_NAME . "\n";
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
        
        $result = $this->conn->query("SHOW DATABASES LIKE '" . DB_NAME . "'");
        
        if ($result && $result->num_rows > 0) {
            echo "✅ قاعدة البيانات موجودة\n";
            $this->conn->select_db(DB_NAME);
        } else {
            echo "❌ قاعدة البيانات غير موجودة!\n";
            $this->issues[] = [
                'type' => 'database',
                'severity' => 'critical',
                'message' => 'قاعدة البيانات ' . DB_NAME . ' غير موجودة'
            ];
            $this->fixes[] = "CREATE DATABASE IF NOT EXISTS `" . DB_NAME . "` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;";
            $this->fixes[] = "USE `" . DB_NAME . "`;";
            
            // إنشاء قاعدة البيانات للمتابعة
            $this->conn->query("CREATE DATABASE IF NOT EXISTS `" . DB_NAME . "` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
            $this->conn->select_db(DB_NAME);
        }
        echo "\n";
    }
    
    private function checkTables() {
        global $REQUIRED_TABLES;
        
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
        echo "【2】 فحص الجداول المطلوبة\n";
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
        
        foreach ($REQUIRED_TABLES as $tableName => $tableConfig) {
            echo "\n📋 جدول: $tableName\n";
            
            $result = $this->conn->query("SHOW TABLES LIKE '$tableName'");
            
            if (!$result || $result->num_rows == 0) {
                echo "   ❌ غير موجود - يحتاج إنشاء\n";
                $this->issues[] = [
                    'type' => 'table',
                    'severity' => 'critical',
                    'table' => $tableName,
                    'message' => "الجدول $tableName غير موجود"
                ];
                $this->generateCreateTableSQL($tableName, $tableConfig);
            } else {
                echo "   ✅ موجود\n";
                $this->checkColumns($tableName, $tableConfig['columns']);
            }
        }
        echo "\n";
    }
    
    private function checkColumns($tableName, $requiredColumns) {
        // الحصول على الأعمدة الموجودة
        $result = $this->conn->query("SHOW COLUMNS FROM `$tableName`");
        $existingColumns = [];
        
        if ($result) {
            while ($row = $result->fetch_assoc()) {
                $existingColumns[$row['Field']] = $row;
            }
        }
        
        $missingColumns = [];
        foreach ($requiredColumns as $colName => $colDef) {
            if (!isset($existingColumns[$colName])) {
                $missingColumns[] = $colName;
                echo "      ⚠️  عمود ناقص: $colName\n";
                $this->issues[] = [
                    'type' => 'column',
                    'severity' => 'warning',
                    'table' => $tableName,
                    'column' => $colName,
                    'message' => "العمود $colName غير موجود في جدول $tableName"
                ];
                
                // توليد أمر إضافة العمود
                $alterSQL = $this->generateAddColumnSQL($tableName, $colName, $colDef);
                $this->fixes[] = $alterSQL;
            }
        }
        
        if (empty($missingColumns)) {
            echo "      ✅ جميع الأعمدة موجودة\n";
        }
    }
    
    private function generateCreateTableSQL($tableName, $tableConfig) {
        $columns = $tableConfig['columns'];
        $sql = "CREATE TABLE IF NOT EXISTS `$tableName` (\n";
        
        $colDefs = [];
        foreach ($columns as $colName => $colDef) {
            $colDefs[] = "    `$colName` $colDef";
        }
        
        $sql .= implode(",\n", $colDefs);
        $sql .= "\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
        
        $this->fixes[] = $sql;
    }
    
    private function generateAddColumnSQL($tableName, $colName, $colDef) {
        return "ALTER TABLE `$tableName` ADD COLUMN `$colName` $colDef;";
    }
    
    private function checkViews() {
        global $REQUIRED_VIEWS;
        
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
        echo "【3】 فحص Views المطلوبة\n";
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
        
        foreach ($REQUIRED_VIEWS as $viewName => $viewSQL) {
            echo "\n👁️  View: $viewName\n";
            
            $result = $this->conn->query("SHOW FULL TABLES WHERE Table_Type = 'VIEW' AND Tables_in_" . DB_NAME . " = '$viewName'");
            
            if (!$result || $result->num_rows == 0) {
                echo "   ❌ غير موجود\n";
                $this->issues[] = [
                    'type' => 'view',
                    'severity' => 'warning',
                    'view' => $viewName,
                    'message' => "View $viewName غير موجود"
                ];
                $this->fixes[] = "DROP VIEW IF EXISTS `$viewName`;";
                $this->fixes[] = $viewSQL . ";";
            } else {
                echo "   ✅ موجود\n";
            }
        }
        echo "\n";
    }
    
    private function checkRequiredData() {
        global $REQUIRED_DATA;
        
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
        echo "【4】 فحص البيانات الأساسية\n";
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
        
        foreach ($REQUIRED_DATA as $tableName => $records) {
            echo "\n📊 جدول: $tableName\n";
            
            // التحقق من وجود الجدول أولاً
            $tableExists = $this->conn->query("SHOW TABLES LIKE '$tableName'");
            if (!$tableExists || $tableExists->num_rows == 0) {
                echo "   ⏭️  الجدول غير موجود (سيتم إنشاؤه أولاً)\n";
                continue;
            }
            
            $result = $this->conn->query("SELECT COUNT(*) as count FROM `$tableName`");
            $row = $result->fetch_assoc();
            $count = (int)$row['count'];
            
            if ($count == 0) {
                echo "   ⚠️  لا توجد بيانات - يحتاج إدخال البيانات الأساسية\n";
                $this->issues[] = [
                    'type' => 'data',
                    'severity' => 'info',
                    'table' => $tableName,
                    'message' => "جدول $tableName فارغ"
                ];
                
                // توليد أوامر INSERT
                $this->generateInsertSQL($tableName, $records);
            } else {
                echo "   ✅ يحتوي على $count سجل\n";
            }
        }
        echo "\n";
    }
    
    private function generateInsertSQL($tableName, $records) {
        foreach ($records as $record) {
            $columns = array_keys($record);
            $values = array_map(function($val) {
                if (is_null($val)) return 'NULL';
                if (is_int($val)) return $val;
                return "'" . $this->conn->real_escape_string($val) . "'";
            }, array_values($record));
            
            $sql = "INSERT INTO `$tableName` (`" . implode("`, `", $columns) . "`) VALUES (" . implode(", ", $values) . ");";
            $this->fixes[] = $sql;
        }
    }
    
    private function printReport() {
        echo "╔════════════════════════════════════════════════════════════╗\n";
        echo "║                    📊 تقرير التشخيص                        ║\n";
        echo "╚════════════════════════════════════════════════════════════╝\n\n";
        
        $critical = array_filter($this->issues, fn($i) => $i['severity'] === 'critical');
        $warnings = array_filter($this->issues, fn($i) => $i['severity'] === 'warning');
        $info = array_filter($this->issues, fn($i) => $i['severity'] === 'info');
        
        echo "📈 ملخص المشاكل:\n";
        echo "   🔴 مشاكل حرجة: " . count($critical) . "\n";
        echo "   🟡 تحذيرات: " . count($warnings) . "\n";
        echo "   🔵 معلومات: " . count($info) . "\n";
        echo "   📝 إجمالي الإصلاحات المطلوبة: " . count($this->fixes) . "\n\n";
        
        if (!empty($this->issues)) {
            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
            echo "📋 قائمة المشاكل:\n";
            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
            
            foreach ($this->issues as $issue) {
                $icon = match($issue['severity']) {
                    'critical' => '🔴',
                    'warning' => '🟡',
                    'info' => '🔵',
                    default => '⚪'
                };
                echo "$icon [{$issue['type']}] {$issue['message']}\n";
            }
        } else {
            echo "✅ ممتاز! لا توجد مشاكل. قاعدة البيانات متوافقة مع النظام.\n";
        }
        echo "\n";
    }
    
    private function generateFixSQL() {
        if (empty($this->fixes)) {
            echo "✅ لا حاجة لإنشاء ملف إصلاح - كل شيء متوافق!\n";
            return;
        }
        
        $filename = 'db_fix_' . date('Y-m-d_His') . '.sql';
        $filepath = '/home/claude/' . $filename;
        
        $content = "-- ═══════════════════════════════════════════════════════════════\n";
        $content .= "-- ملف إصلاح قاعدة البيانات\n";
        $content .= "-- تم إنشاؤه في: " . date('Y-m-d H:i:s') . "\n";
        $content .= "-- ═══════════════════════════════════════════════════════════════\n\n";
        $content .= "SET NAMES utf8mb4;\n";
        $content .= "SET FOREIGN_KEY_CHECKS = 0;\n\n";
        
        $content .= "-- إنشاء قاعدة البيانات إذا لم تكن موجودة\n";
        $content .= "CREATE DATABASE IF NOT EXISTS `" . DB_NAME . "` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\n";
        $content .= "USE `" . DB_NAME . "`;\n\n";
        
        $content .= "-- ═══════════════════════════════════════════════════════════════\n";
        $content .= "-- أوامر الإصلاح\n";
        $content .= "-- ═══════════════════════════════════════════════════════════════\n\n";
        
        foreach ($this->fixes as $fix) {
            $content .= $fix . "\n\n";
        }
        
        $content .= "\nSET FOREIGN_KEY_CHECKS = 1;\n";
        $content .= "\n-- ═══════════════════════════════════════════════════════════════\n";
        $content .= "-- تم الانتهاء من ملف الإصلاح\n";
        $content .= "-- ═══════════════════════════════════════════════════════════════\n";
        
        file_put_contents($filepath, $content);
        
        echo "╔════════════════════════════════════════════════════════════╗\n";
        echo "║                 📄 تم إنشاء ملف SQL للإصلاح                 ║\n";
        echo "╚════════════════════════════════════════════════════════════╝\n\n";
        echo "📁 الملف: $filepath\n\n";
        echo "⚡ لتطبيق الإصلاحات، نفذ الأمر التالي:\n";
        echo "   mysql -u root -p < $filepath\n\n";
        echo "أو انسخ المحتوى وألصقه في phpMyAdmin\n\n";
        
        // طباعة المحتوى
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
        echo "📝 محتوى ملف الإصلاح:\n";
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n";
        echo $content;
    }
    
    public function __destruct() {
        if ($this->conn) {
            $this->conn->close();
        }
    }
}

// =====================================================
// تشغيل التشخيص
// =====================================================
echo "\n";
$diagnostic = new DatabaseDiagnostic();
$diagnostic->run();
