<?php
/**
 * الدوال المساعدة للنظام
 * Workflow System Helper Functions
 */

require_once __DIR__ . '/config.php';

// ═══════════════════════════════════════════════════════════════
//  إصدار هيكل قاعدة البيانات
//  ⚠️  غيّر هذا الرقم عند أي تعديل على الجداول أو الأعمدة
//  هذا يجبر النظام على إعادة تشغيل الـ Migrations مرة واحدة
// ═══════════════════════════════════════════════════════════════
define('SCHEMA_VERSION', '1.3');

// ═══════════════════════════════════════════════════════════════
//  bootstrapSystem() — نقطة الدخول الوحيدة لضمان جاهزية الهيكل
//  تُستدعى من getAllTransactions() وأي دالة تحتاج التأكد من الهيكل
//  • تعمل مرة واحدة فقط في كل طلب HTTP (static flag)
//  • تشغّل الـ Migrations فقط عند تغيير SCHEMA_VERSION
//  • تضمن وجود الـ View بتكلفة استعلام واحد فقط
// ═══════════════════════════════════════════════════════════════
function bootstrapSystem(): void {
    static $booted = false;
    if ($booted) return;
    $booted = true;

    $conn = db();

    // هل أكملنا الـ Migration لهذا الإصدار من قبل؟
    $res           = $conn->query("SELECT setting_value FROM system_settings
                                   WHERE setting_key = 'schema_version' LIMIT 1");
    $storedVersion = ($res && ($row = $res->fetch_assoc())) ? $row['setting_value'] : '';

    if ($storedVersion !== SCHEMA_VERSION) {
        // إصدار جديد أو أول تشغيل → شغّل كل الـ Migrations
        _runSchemaMigrations($conn);
        // احفظ الإصدار الجديد حتى لا يتكرر
        $v = $conn->real_escape_string(SCHEMA_VERSION);
        $conn->query("INSERT INTO system_settings (setting_key, setting_value)
                      VALUES ('schema_version', '$v')
                      ON DUPLICATE KEY UPDATE setting_value = '$v'");
    }

    // تأكد من وجود الـ View — استعلام واحد للفحص فقط
    _ensureViewCreated($conn);
}

// ───────────────────────────────────────────────────────────────
//  _runSchemaMigrations — تعمل مرة واحدة فقط عند تغيير SCHEMA_VERSION
// ───────────────────────────────────────────────────────────────
function _runSchemaMigrations(\mysqli $conn): void {

    // ① عمود attachment
    $r = $conn->query("SHOW COLUMNS FROM transactions LIKE 'attachment'");
    if (!$r || $r->num_rows === 0) {
        $conn->query("ALTER TABLE transactions ADD COLUMN attachment VARCHAR(255) DEFAULT NULL");
        $conn->query("ALTER TABLE transactions ADD COLUMN attachment_name VARCHAR(255) DEFAULT NULL");
    }

    // ② جدول المرفقات المتعددة
    $conn->query("CREATE TABLE IF NOT EXISTS transaction_attachments (
        id             INT AUTO_INCREMENT PRIMARY KEY,
        transaction_id INT NOT NULL,
        file_path      VARCHAR(255) NOT NULL,
        file_name      VARCHAR(255) NOT NULL,
        display_name   VARCHAR(255) DEFAULT NULL COMMENT 'الاسم الذي أدخله المستخدم',
        file_size      INT DEFAULT NULL,
        uploaded_by    INT DEFAULT NULL,
        created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_tx (transaction_id),
        FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    // ③ جدول الموازنة
    $conn->query("CREATE TABLE IF NOT EXISTS budget_data (
        id             INT PRIMARY KEY AUTO_INCREMENT,
        transaction_id INT UNIQUE NOT NULL,
        employee_id    INT,
        review_date    DATE,
        budget_status  ENUM('معتمد','قيد المراجعة','مرفوض','معلق') DEFAULT 'معلق',
        budget_code    VARCHAR(50),
        notes          TEXT,
        created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
    ) ENGINE=InnoDB");
    $conn->query("INSERT IGNORE INTO budget_data (transaction_id) SELECT id FROM transactions");

    // ④ أعمدة العملة
    $r = $conn->query("SHOW COLUMNS FROM transactions LIKE 'currency'");
    if (!$r || $r->num_rows === 0) {
        $conn->query("ALTER TABLE transactions ADD COLUMN currency VARCHAR(10) NOT NULL DEFAULT 'SAR'");
        $conn->query("ALTER TABLE transactions ADD COLUMN exchange_rate DECIMAL(10,4) NOT NULL DEFAULT 1.0000");
        $conn->query("ALTER TABLE transactions ADD COLUMN amount_sar DECIMAL(15,2) DEFAULT NULL");
    }

    // ⑤ أعمدة المنشئ
    $r = $conn->query("SHOW COLUMNS FROM transactions LIKE 'created_by'");
    if (!$r || $r->num_rows === 0) {
        $conn->query("ALTER TABLE transactions ADD COLUMN created_by INT DEFAULT NULL");
        $conn->query("ALTER TABLE transactions ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP");
    }
    $r = $conn->query("SHOW COLUMNS FROM transactions LIKE 'updated_at'");
    if (!$r || $r->num_rows === 0) {
        $conn->query("ALTER TABLE transactions ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
    }

    // ⑥ sub_type_id
    $r = $conn->query("SHOW COLUMNS FROM transactions LIKE 'sub_type_id'");
    if (!$r || $r->num_rows === 0)
        $conn->query("ALTER TABLE transactions ADD COLUMN sub_type_id INT DEFAULT NULL");

    // ⑦ أعمدة الأنواع الهرمية
    $r = $conn->query("SHOW COLUMNS FROM transaction_types LIKE 'parent_id'");
    if (!$r || $r->num_rows === 0)
        $conn->query("ALTER TABLE transaction_types ADD COLUMN parent_id INT DEFAULT NULL");
    $r = $conn->query("SHOW COLUMNS FROM transaction_types LIKE 'sort_order'");
    if (!$r || $r->num_rows === 0)
        $conn->query("ALTER TABLE transaction_types ADD COLUMN sort_order INT DEFAULT 0");

    // ⑧ أعمدة الأولوية
    $r = $conn->query("SHOW COLUMNS FROM transactions LIKE 'priority'");
    if (!$r || $r->num_rows === 0) {
        $conn->query("ALTER TABLE transactions ADD COLUMN priority ENUM('normal','high','urgent') DEFAULT 'normal'");
        $conn->query("ALTER TABLE transactions ADD COLUMN priority_set_by INT DEFAULT NULL");
        $conn->query("ALTER TABLE transactions ADD COLUMN priority_set_at DATETIME DEFAULT NULL");
        $conn->query("ALTER TABLE transactions ADD COLUMN priority_note VARCHAR(255) DEFAULT NULL");
    }

    // ⑨ إصلاح الأرقام المكررة + UNIQUE KEY — مرة واحدة هنا فقط
    $idx = $conn->query("SHOW INDEX FROM transactions WHERE Key_name = 'uq_transaction_number'");
    if (!$idx || $idx->num_rows === 0) {
        fixDuplicateTransactionNumbers($conn);
    }
}

// ───────────────────────────────────────────────────────────────
//  _ensureViewCreated — استعلام واحد للفحص، ينشئ الـ View فقط إذا غاب
// ───────────────────────────────────────────────────────────────
function _ensureViewCreated(\mysqli $conn): void {
    $r = $conn->query("SELECT 1 FROM information_schema.VIEWS
                       WHERE TABLE_SCHEMA = DATABASE()
                         AND TABLE_NAME   = 'v_full_transactions'
                       LIMIT 1");
    if ($r && $r->num_rows > 0) return; // الـ View موجود ← لا شيء
    _createView($conn);
}

function _createView(\mysqli $conn): void {
    $conn->query("CREATE OR REPLACE VIEW v_full_transactions AS
    SELECT
        t.id, t.transaction_number, t.transaction_date,
        tt.name as transaction_type,
        ts.name as transaction_sub_type,
        t.description, t.amount,
        IFNULL(t.currency, 'SAR')         as currency,
        IFNULL(t.exchange_rate, 1)         as exchange_rate,
        IFNULL(t.amount_sar, t.amount)     as amount_sar,
        IFNULL(t.attachment, '')           as attachment,
        IFNULL(t.attachment_name, '')      as attachment_name,
        t.created_by,
        ec.name  as created_by_name,
        t.created_at as creation_time,
        r.status as receive_status,  r.receive_date,  r.notes as receive_notes,
        er.name  as receiver_name,
        b.budget_status, b.review_date as budget_date,
        b.budget_code,   b.notes as budget_notes,
        eb.name  as budget_employee_name,
        d.status         as dispatch_status, d.dispatch_type, d.routed_to,
        d.notes          as dispatch_notes,  d.ola_active as dispatch_ola_active,
        d.ola_paused_at  as dispatch_paused_at, d.dispatched_at,
        ed.name          as dispatch_employee_name,
        p.status         as payment_status,  p.payment_date,
        p.payment_method, p.reference_number, p.notes as payment_notes,
        ep.name          as payment_employee_name,
        i.status         as invoice_status,  i.invoice_number, i.invoice_date,
        i.alert_type,    i.notes as invoice_notes,
        ei.name          as invoice_employee_name,
        t.created_at,    t.updated_at
    FROM transactions t
    LEFT JOIN transaction_types tt ON t.type_id     = tt.id
    LEFT JOIN transaction_types ts ON t.sub_type_id = tt.id
    LEFT JOIN employees ec         ON t.created_by  = ec.id
    LEFT JOIN receiving_data r     ON t.id = r.transaction_id
    LEFT JOIN employees er         ON r.employee_id  = er.id
    LEFT JOIN budget_data b        ON t.id = b.transaction_id
    LEFT JOIN employees eb         ON b.employee_id  = eb.id
    LEFT JOIN dispatch_data d      ON t.id = d.transaction_id
    LEFT JOIN employees ed         ON d.employee_id  = ed.id
    LEFT JOIN payment_data p       ON t.id = p.transaction_id
    LEFT JOIN employees ep         ON p.employee_id  = ep.id
    LEFT JOIN invoice_data i       ON t.id = i.transaction_id
    LEFT JOIN employees ei         ON i.employee_id  = ei.id");
}

/**
 * الحصول على المعاملات — مع دعم Pagination اختياري
 *
 * الاستخدام الجديد (مع pagination):
 *   getAllTransactions(['page'=>1, 'per_page'=>25, 'search'=>'...'])
 *   → ['data'=>[...], 'pagination'=>['total'=>N,'page'=>1,'per_page'=>25,'pages'=>M]]
 *
 * الاستخدام القديم (بدون pagination) — متوافق تماماً:
 *   getAllTransactions(['search'=>'...'])
 *   → [...] ← مصفوفة مباشرة كما كانت
 */
function getAllTransactions($filters = []) {
    $conn = db();

    // ── جاهزية الهيكل (مرة واحدة لكل طلب HTTP) ──────────────
    bootstrapSystem();

    // ── بناء شرط WHERE ────────────────────────────────────────
    $where = "WHERE 1=1";

    if (!empty($filters['status'])) {
        $status = $conn->real_escape_string($filters['status']);
        $where .= " AND (receive_status = '$status' OR payment_status = '$status' OR alert_type = '$status')";
    }
    if (!empty($filters['search'])) {
        $search = $conn->real_escape_string($filters['search']);
        $where .= " AND (transaction_number LIKE '%$search%' OR description LIKE '%$search%' OR transaction_type LIKE '%$search%')";
    }
    if (!empty($filters['date_from'])) {
        $dateFrom = $conn->real_escape_string($filters['date_from']);
        $where .= " AND transaction_date >= '$dateFrom'";
    }
    if (!empty($filters['date_to'])) {
        $dateTo = $conn->real_escape_string($filters['date_to']);
        $where .= " AND transaction_date <= '$dateTo'";
    }

    $orderBy   = "ORDER BY CAST(SUBSTRING_INDEX(transaction_number, '-', -1) AS UNSIGNED) DESC";
    $paginated = isset($filters['page']);

    // ── Pagination ─────────────────────────────────────────────
    if ($paginated) {
        $perPage = max(1, min(200, (int)($filters['per_page'] ?? 25)));
        $page    = max(1, (int)$filters['page']);
        $offset  = ($page - 1) * $perPage;

        // عدد السجلات الكلي بشرط الفلتر (بدون LIMIT)
        $countRes = $conn->query("SELECT COUNT(*) AS total FROM v_full_transactions $where");
        $total    = ($countRes && ($cr = $countRes->fetch_assoc())) ? (int)$cr['total'] : 0;

        $sql = "SELECT * FROM v_full_transactions $where $orderBy LIMIT $perPage OFFSET $offset";
    } else {
        // ── سلوك قديم بدون تغيير ────────────────────────────────
        $sql = "SELECT * FROM v_full_transactions $where $orderBy";
    }
    // ──────────────────────────────────────────────────────────

    $result      = $conn->query($sql);
    $transactions = [];
    if ($result && $result->num_rows > 0) {
        while ($row = $result->fetch_assoc()) $transactions[] = $row;
    }

    // ── إضافة المرفقات دفعةً واحدة ────────────────────────────
    if (!empty($transactions)) {
        $ids    = implode(',', array_column($transactions, 'id'));
        $ar     = $conn->query("SELECT * FROM transaction_attachments WHERE transaction_id IN ($ids) ORDER BY created_at ASC");
        $attMap = [];
        if ($ar) while ($aRow = $ar->fetch_assoc()) $attMap[$aRow['transaction_id']][] = $aRow;
        foreach ($transactions as &$tx) $tx['attachments'] = $attMap[$tx['id']] ?? [];
        unset($tx);
    }

    // ── الإرجاع ────────────────────────────────────────────────
    if ($paginated) {
        return [
            'data'       => $transactions,
            'pagination' => [
                'total'    => $total,
                'page'     => $page,
                'per_page' => $perPage,
                'pages'    => (int)ceil($total / max(1, $perPage)),
            ],
        ];
    }

    return $transactions; // ← سلوك قديم بدون تغيير
}

/**
 * الحصول على معاملة واحدة
 */
function getTransaction($id) {
    $conn = db();
    $id = (int)$id;
    
    $sql = "SELECT * FROM v_full_transactions WHERE id = $id";
    $result = $conn->query($sql);
    
    if ($result && $result->num_rows > 0) {
        return $result->fetch_assoc();
    }
    
    return null;
}

/**
 * الحصول على الإحصائيات
 */
function getStats() {
    $conn = db();
    
    $stats = [
        'total' => 0,
        'received' => 0,
        'paid' => 0,
        'invoiced' => 0,
        'urgent' => 0,
        'pending' => 0,
        'total_amount' => 0,
        'paid_amount' => 0
    ];
    
    // إجمالي المعاملات
    $result = $conn->query("SELECT COUNT(*) as count FROM transactions");
    if ($row = $result->fetch_assoc()) {
        $stats['total'] = (int)$row['count'];
    }
    
    // المعاملات المستلمة
    $result = $conn->query("SELECT COUNT(*) as count FROM receiving_data WHERE status = 'مستلم'");
    if ($row = $result->fetch_assoc()) {
        $stats['received'] = (int)$row['count'];
    }
    
    // المعاملات المدفوعة
    $result = $conn->query("SELECT COUNT(*) as count FROM payment_data WHERE status = 'تم الدفع'");
    if ($row = $result->fetch_assoc()) {
        $stats['paid'] = (int)$row['count'];
    }
    
    // المعاملات المفوترة
    $result = $conn->query("SELECT COUNT(*) as count FROM invoice_data WHERE status = 'صدرت الفاتورة'");
    if ($row = $result->fetch_assoc()) {
        $stats['invoiced'] = (int)$row['count'];
    }
    
    // المعاملات العاجلة
    $result = $conn->query("SELECT COUNT(*) as count FROM invoice_data WHERE alert_type = 'عاجل'");
    if ($row = $result->fetch_assoc()) {
        $stats['urgent'] = (int)$row['count'];
    }
    
    // المعاملات المعلقة
    $result = $conn->query("SELECT COUNT(*) as count FROM payment_data WHERE status = 'معلق'");
    if ($row = $result->fetch_assoc()) {
        $stats['pending'] = (int)$row['count'];
    }
    
    // إجمالي المبالغ
    $result = $conn->query("SELECT SUM(amount) as total FROM transactions");
    if ($row = $result->fetch_assoc()) {
        $stats['total_amount'] = (float)$row['total'];
    }
    
    // المبالغ المدفوعة
    $result = $conn->query("
        SELECT SUM(t.amount) as total 
        FROM transactions t 
        JOIN payment_data p ON t.id = p.transaction_id 
        WHERE p.status = 'تم الدفع'
    ");
    if ($row = $result->fetch_assoc()) {
        $stats['paid_amount'] = (float)$row['total'];
    }
    
    return $stats;
}

/**
 * الحصول على بيانات الرسم البياني
 */
function getChartData() {
    $conn = db();
    
    $sql = "
        SELECT 
            DATE_FORMAT(transaction_date, '%Y-%m') as month,
            COUNT(*) as transactions_count,
            SUM(amount) as total_amount
        FROM transactions
        GROUP BY DATE_FORMAT(transaction_date, '%Y-%m')
        ORDER BY month DESC
        LIMIT 6
    ";
    
    $result = $conn->query($sql);
    $data = [];
    
    $months = [
        '01' => 'يناير', '02' => 'فبراير', '03' => 'مارس',
        '04' => 'أبريل', '05' => 'مايو', '06' => 'يونيو',
        '07' => 'يوليو', '08' => 'أغسطس', '09' => 'سبتمبر',
        '10' => 'أكتوبر', '11' => 'نوفمبر', '12' => 'ديسمبر'
    ];
    
    if ($result && $result->num_rows > 0) {
        while ($row = $result->fetch_assoc()) {
            $monthNum = substr($row['month'], 5, 2);
            $data[] = [
                'month' => $months[$monthNum] ?? $row['month'],
                'count' => (int)$row['transactions_count'],
                'amount' => (float)$row['total_amount']
            ];
        }
    }
    
    return array_reverse($data);
}

/**
 * الحصول على المعاملات العاجلة
 * تشمل: المعاملات ذات الأولوية المحددة يدوياً + المعاملات ذات alert_type
 */
function getUrgentTransactions() {
    $conn = db();

    // أعمدة priority مضمونة الوجود عبر bootstrapSystem() في _runSchemaMigrations()

    // جلب المعاملات العاجلة: join بين transactions (للأولوية اليدوية) والـ View (لبقية البيانات)
    $sql = "
        SELECT
            vft.*,
            t.priority,
            t.priority_set_by,
            t.priority_note,
            t.priority_set_at,
            CASE
                WHEN t.priority = 'urgent' THEN 'عاجل'
                WHEN t.priority = 'high'   THEN 'مهم'
                WHEN vft.alert_type = 'عاجل'    THEN 'عاجل'
                WHEN vft.alert_type = 'متابعة'  THEN 'متابعة'
                ELSE COALESCE(vft.alert_type, 'متابعة')
            END AS effective_priority,
            ep.name AS priority_set_by_name,
            CASE
                WHEN t.priority = 'urgent'       THEN 1
                WHEN t.priority = 'high'         THEN 2
                WHEN vft.alert_type = 'عاجل'    THEN 3
                WHEN vft.alert_type = 'متابعة'  THEN 4
                ELSE 5
            END AS sort_order
        FROM v_full_transactions vft
        JOIN transactions t ON t.id = vft.id
        LEFT JOIN employees ep ON t.priority_set_by = ep.id
        WHERE t.priority IN ('high','urgent')
           OR vft.alert_type IN ('عاجل','متابعة')
        ORDER BY sort_order ASC, vft.transaction_date DESC
    ";

    $result = $conn->query($sql);
    $transactions = [];

    if ($result && $result->num_rows > 0) {
        while ($row = $result->fetch_assoc()) {
            $transactions[] = $row;
        }
    }

    return $transactions;
}

/**
 * تحديد أولوية معاملة
 */
function setTransactionPriority($transactionId, $priority, $note = null) {
    $conn = db();

    // أعمدة priority مضمونة الوجود عبر bootstrapSystem() في _runSchemaMigrations()

    $transactionId = (int)$transactionId;
    $priority = $conn->real_escape_string($priority);
    $employeeId = isset($_SESSION['user_id']) ? (int)$_SESSION['user_id'] : 'NULL';
    $now = date('Y-m-d H:i:s');
    $noteSql = $note ? "'" . $conn->real_escape_string($note) . "'" : 'NULL';

    $sql = "UPDATE transactions SET 
                priority = '$priority',
                priority_set_by = $employeeId,
                priority_set_at = '$now',
                priority_note = $noteSql,
                updated_at = NOW()
            WHERE id = $transactionId";

    if ($conn->query($sql)) {
        return ['success' => true, 'message' => 'تم تحديث الأولوية بنجاح'];
    }
    return ['success' => false, 'message' => 'فشل تحديث الأولوية: ' . $conn->error];
}

/**
 * الحصول على الموظفين
 */
function getEmployees($role = null) {
    $conn = db();
    
    $sql = "SELECT * FROM employees WHERE is_active = 1";
    if ($role) {
        $role = $conn->real_escape_string($role);
        $sql .= " AND role = '$role'";
    }
    $sql .= " ORDER BY name";
    
    $result = $conn->query($sql);
    $employees = [];
    
    if ($result && $result->num_rows > 0) {
        while ($row = $result->fetch_assoc()) {
            $employees[] = $row;
        }
    }
    
    return $employees;
}

/**
 * الحصول على أنواع المعاملات
 */
function getTransactionTypes() {
    $conn = db();

    // ضمان وجود أعمدة التصنيف الهرمي
    $chkPar = $conn->query("SHOW COLUMNS FROM transaction_types LIKE 'parent_id'");
    if (!$chkPar || $chkPar->num_rows === 0)
        $conn->query("ALTER TABLE transaction_types ADD COLUMN parent_id INT DEFAULT NULL");
    $chkSort = $conn->query("SHOW COLUMNS FROM transaction_types LIKE 'sort_order'");
    if (!$chkSort || $chkSort->num_rows === 0)
        $conn->query("ALTER TABLE transaction_types ADD COLUMN sort_order INT DEFAULT 0");

    // نجلب الكل مرتبة: الرئيسية أولاً ثم الفرعية، وداخل كل مستوى حسب sort_order ثم الاسم
    $sql = "SELECT * FROM transaction_types WHERE is_active = 1
            ORDER BY COALESCE(parent_id, id), sort_order, name";
    $result = $conn->query($sql);
    $types = [];

    if ($result && $result->num_rows > 0) {
        while ($row = $result->fetch_assoc()) {
            $types[] = $row;
        }
    }

    return $types;
}


/**
 * جلب قيمة إعداد من system_settings
 */
function getSetting(string $key, string $default = ''): string {
    $conn = db();
    $conn->query(<<<'SQL'
        CREATE TABLE IF NOT EXISTS system_settings (
            id            INT          NOT NULL AUTO_INCREMENT,
            setting_key   VARCHAR(100) NOT NULL,
            setting_value VARCHAR(255) NOT NULL DEFAULT '',
            setting_label VARCHAR(200) DEFAULT NULL,
            setting_group VARCHAR(100) DEFAULT 'general',
            updated_by    INT          DEFAULT NULL,
            updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_key (setting_key)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
SQL);
    $val = $default;
    $stmt = $conn->prepare('SELECT setting_value FROM system_settings WHERE setting_key=? LIMIT 1');
    if ($stmt) {
        $stmt->bind_param('s', $key);
        $stmt->execute();
        $stmt->bind_result($val);
        if (!$stmt->fetch()) { $val = $default; }
        $stmt->close();
    }
    return (string)$val;
}

/**
 * حفظ قيمة إعداد
 */
function saveSetting(string $key, string $value, ?int $updatedBy = null): bool {
    $conn = db();
    $by   = $updatedBy ?? (int)($_SESSION['user_id'] ?? 0);
    $stmt = $conn->prepare('INSERT INTO system_settings (setting_key, setting_value, updated_by) VALUES (?,?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value), updated_by=VALUES(updated_by)');
    if (!$stmt) return false;
    $stmt->bind_param('ssi', $key, $value, $by);
    $ok = $stmt->execute();
    $stmt->close();
    return (bool)$ok;
}


/**
 * إنشاء رقم معاملة جديد
 */
function generateTransactionNumber() {
    $conn = db();

    // اجلب الـ prefix قبل أي transaction (لا يمكن الاستعلام داخل LOCK TABLES)
    $prefix = getSetting('prefix_transaction', 'TR');

    // استخدم transaction + SELECT FOR UPDATE بدل LOCK TABLES
    $conn->begin_transaction();

    $result = $conn->query("
        SELECT CAST(SUBSTRING_INDEX(transaction_number, '-', -1) AS UNSIGNED) AS seq
        FROM transactions
        WHERE transaction_number REGEXP '^[A-Za-z]+-[0-9]+$'
        ORDER BY seq DESC
        LIMIT 1
        FOR UPDATE
    ");
    $row = $result ? $result->fetch_assoc() : null;
    $nextSeq = (isset($row['seq']) ? (int)$row['seq'] : 0) + 1;

    $conn->commit();

    return $prefix . '-' . str_pad($nextSeq, 4, '0', STR_PAD_LEFT);
}

/**
 * إضافة معاملة جديدة
 */
function addTransaction($data, $file = null) {
    $conn = db();

    // كل الأعمدة مضمونة الوجود عبر bootstrapSystem() في _runSchemaMigrations()
    bootstrapSystem();

    $transactionNumber = generateTransactionNumber();

    // type_id هو id التصنيف المُختار (فرعي أو رئيسي)
    $typeId     = (int)$data['type_id'];

    // نحدد: هل هو فرعي؟ نجلب parent_id
    $subTypeId  = 'NULL';
    $parentType = $conn->query("SELECT parent_id FROM transaction_types WHERE id=$typeId LIMIT 1");
    if ($parentType && ($pRow = $parentType->fetch_assoc()) && $pRow['parent_id']) {
        $subTypeId = $typeId;
        $typeId    = (int)$pRow['parent_id'];
    }

    $description  = $conn->real_escape_string($data['description']);
    $amount       = (float)$data['amount'];
    $currency     = strtoupper($conn->real_escape_string($data['currency'] ?? 'SAR'));
    $exchangeRate = 1.0;
    if ($currency !== 'SAR') {
        $manualRate = (float)($data['exchange_rate'] ?? 0);
        if ($manualRate > 0) {
            $exchangeRate = $manualRate;
        } else {
            $rEx = $conn->query("SELECT rate_to_sar FROM exchange_rates WHERE currency='$currency' LIMIT 1");
            if ($rEx && ($exRow = $rEx->fetch_assoc())) $exchangeRate = (float)$exRow['rate_to_sar'];
        }
    }
    $amountSar = round($amount * $exchangeRate, 2);
    $createdBy = isset($_SESSION['user_id']) ? (int)$_SESSION['user_id'] : 'NULL';

    $sql = "INSERT INTO transactions
        (transaction_number, transaction_date, type_id, sub_type_id, description, amount, currency, exchange_rate, amount_sar, created_by, created_at)
        VALUES ('$transactionNumber', NOW(), $typeId, $subTypeId, '$description', $amount, '$currency', $exchangeRate, $amountSar, $createdBy, NOW())";
    
    if ($conn->query($sql)) {
        $transactionId = $conn->insert_id;
        
        // إنشاء سجلات فارغة للمراحل الأربع
        $conn->query("INSERT INTO receiving_data (transaction_id) VALUES ($transactionId)");
        $conn->query("INSERT INTO budget_data    (transaction_id) VALUES ($transactionId)");
        $conn->query("INSERT INTO payment_data   (transaction_id) VALUES ($transactionId)");
        $conn->query("INSERT INTO invoice_data   (transaction_id) VALUES ($transactionId)");
        
        // تسجيل أوقات المراحل
        ensureStageTimesTable();
        $now = date('Y-m-d H:i:s');
        $conn->query("INSERT INTO stage_times (transaction_id, stage, employee_id, started_at, completed_at, duration_minutes, status)
            VALUES ($transactionId, 'creation', $createdBy, '$now', '$now', 0, 'تم الإنشاء')
            ON DUPLICATE KEY UPDATE completed_at='$now', status='تم الإنشاء'");
        $conn->query("INSERT INTO stage_times (transaction_id, stage, started_at, status)
            VALUES ($transactionId, 'receiving', '$now', 'في الانتظار')
            ON DUPLICATE KEY UPDATE started_at=COALESCE(started_at,'$now')");
        
        // رفع المرفقات المتعددة
        if (!empty($_FILES['attachments']['name'][0])) {
            $displayNames = $data['attachment_labels'] ?? [];
            if (is_string($displayNames)) $displayNames = json_decode($displayNames, true) ?? [];
            addTransactionAttachments($transactionId, $_FILES['attachments'], $displayNames);
        } elseif ($file && isset($file['tmp_name']) && $file['tmp_name']) {
            // توافق مع الاستدعاء القديم
            addTransactionAttachments($transactionId, $file, []);
        }
        
        $creatorName = $_SESSION['user_name'] ?? 'النظام';
        logActivity($transactionId, 'إنشاء', "تم إنشاء المعاملة بواسطة: $creatorName في $now");
        return $transactionId;
    }
    return false;
}

/**
 * التأكد من وجود أعمدة المنشئ في جدول المعاملات
 */
function ensureCreatorColumns() {
    $conn = db();
    
    // التحقق من وجود عمود created_by
    $result = $conn->query("SHOW COLUMNS FROM transactions LIKE 'created_by'");
    if (!$result || $result->num_rows == 0) {
        $conn->query("ALTER TABLE transactions ADD COLUMN created_by INT DEFAULT NULL");
        $conn->query("ALTER TABLE transactions ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP");
    }
    
    // التحقق من وجود عمود updated_at
    $result = $conn->query("SHOW COLUMNS FROM transactions LIKE 'updated_at'");
    if (!$result || $result->num_rows == 0) {
        $conn->query("ALTER TABLE transactions ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
    }

    // ضمان وجود sub_type_id للتصنيف الفرعي
    $chkSub = $conn->query("SHOW COLUMNS FROM transactions LIKE 'sub_type_id'");
    if (!$chkSub || $chkSub->num_rows === 0)
        $conn->query("ALTER TABLE transactions ADD COLUMN sub_type_id INT DEFAULT NULL");

    // ضمان وجود أعمدة التصنيف الهرمي في transaction_types
    $_chk_par = $conn->query("SHOW COLUMNS FROM transaction_types LIKE 'parent_id'");
    if (!$_chk_par || $_chk_par->num_rows === 0)
        $conn->query("ALTER TABLE transaction_types ADD COLUMN parent_id INT DEFAULT NULL");
    $_chk_srt = $conn->query("SHOW COLUMNS FROM transaction_types LIKE 'sort_order'");
    if (!$_chk_srt || $_chk_srt->num_rows === 0)
        $conn->query("ALTER TABLE transaction_types ADD COLUMN sort_order INT DEFAULT 0");

    // ── إصلاح أرقام المعاملات المكررة وإضافة UNIQUE constraint ──
    fixDuplicateTransactionNumbers($conn);
}

function fixDuplicateTransactionNumbers($conn) {
    // أضف UNIQUE KEY إذا لم يكن موجوداً
    $idx = $conn->query("SHOW INDEX FROM transactions WHERE Key_name = 'uq_transaction_number'");
    if (!$idx || $idx->num_rows === 0) {
        // أصلح التكرارات أولاً قبل إضافة الـ constraint
        $prefix = 'TR';
        $res2 = $conn->query("SELECT setting_value FROM system_settings WHERE setting_key='prefix_transaction' LIMIT 1");
        if ($res2) {
            $row2 = $res2->fetch_assoc();
            if ($row2) $prefix = $row2['setting_value'];
        }

        // اجلب كل المعاملات مرتبة حسب ID
        $res = $conn->query("SELECT id, transaction_number FROM transactions ORDER BY id ASC");
        $seen = [];
        $seq  = 1;
        if ($res) {
            while ($r = $res->fetch_assoc()) {
                $num = $r['transaction_number'];
                if (in_array($num, $seen)) {
                    // رقم مكرر — أعد تسميته
                    $newNum = $prefix . '-' . str_pad($seq, 4, '0', STR_PAD_LEFT);
                    while (in_array($newNum, $seen)) {
                        $seq++;
                        $newNum = $prefix . '-' . str_pad($seq, 4, '0', STR_PAD_LEFT);
                    }
                    $newEsc = $conn->real_escape_string($newNum);
                    $conn->query("UPDATE transactions SET transaction_number='$newEsc' WHERE id=" . (int)$r['id']);
                    $seen[] = $newNum;
                } else {
                    $seen[] = $num;
                }
                $seq++;
            }
        }

        // الآن أضف الـ UNIQUE constraint بأمان
        $conn->query("ALTER TABLE transactions ADD UNIQUE KEY uq_transaction_number (transaction_number)");
    }
}

/**
 * رفع ملف مرفق (مساعدة داخلية)
 */
function uploadAttachment($file) {
    $uploadDir = __DIR__ . '/../uploads/';
    if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);

    $allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif',
                'application/msword',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'application/vnd.ms-excel',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
    $fileType = mime_content_type($file['tmp_name']);
    if (!in_array($fileType, $allowed))
        return ['success' => false, 'message' => 'نوع الملف غير مسموح به'];

    if ($file['size'] > 10 * 1024 * 1024)
        return ['success' => false, 'message' => 'حجم الملف يتجاوز 10 ميجابايت'];

    $ext      = pathinfo($file['name'], PATHINFO_EXTENSION);
    $newName  = uniqid('att_') . '_' . time() . '.' . $ext;
    $fullPath = $uploadDir . $newName;

    if (move_uploaded_file($file['tmp_name'], $fullPath))
        return ['success' => true, 'path' => 'uploads/' . $newName,
                'name' => $file['name'], 'size' => $file['size']];

    return ['success' => false, 'message' => 'فشل في رفع الملف'];
}

/**
 * إضافة مرفقات متعددة لمعاملة
 * يكتب في transaction_attachments (جديد) وفي attachment/attachment_name (للتوافق مع السجلات القديمة)
 */
function addTransactionAttachments($transactionId, $files, $displayNames = []) {
    $conn = db();
    $transactionId = (int)$transactionId;
    $uploadedBy = isset($_SESSION['user_id']) ? (int)$_SESSION['user_id'] : 'NULL';
    $results = [];

    // تطبيع مصفوفة $_FILES المتعددة
    $fileList = [];
    if (isset($files['name']) && is_array($files['name'])) {
        for ($i = 0; $i < count($files['name']); $i++) {
            if ($files['error'][$i] === UPLOAD_ERR_OK) {
                $fileList[] = [
                    'name'     => $files['name'][$i],
                    'type'     => $files['type'][$i],
                    'tmp_name' => $files['tmp_name'][$i],
                    'error'    => $files['error'][$i],
                    'size'     => $files['size'][$i],
                ];
            }
        }
    } elseif (isset($files['tmp_name']) && $files['error'] === UPLOAD_ERR_OK) {
        $fileList[] = $files; // ملف واحد
    }

    foreach ($fileList as $idx => $file) {
        $res = uploadAttachment($file);
        if ($res['success']) {
            $path    = $conn->real_escape_string($res['path']);
            $name    = $conn->real_escape_string($res['name']);
            $size    = (int)$res['size'];
            $display = $conn->real_escape_string($displayNames[$idx] ?? $res['name']);

            // ── جدول المرفقات الجديد ──────────────────────────────
            $conn->query("INSERT INTO transaction_attachments
                (transaction_id, file_path, file_name, display_name, file_size, uploaded_by)
                VALUES ($transactionId, '$path', '$name', '$display', $size, $uploadedBy)");

            // ── الأعمدة القديمة في transactions (للتوافق) ──────────
            // يُحدَّث فقط إذا كانت فارغة (أو للمرفق الأول دائماً)
            if ($idx === 0) {
                $conn->query("UPDATE transactions
                    SET attachment      = IF(attachment IS NULL OR attachment = '', '$path', attachment),
                        attachment_name = IF(attachment_name IS NULL OR attachment_name = '', '$display', attachment_name)
                    WHERE id = $transactionId");
            }
        }
        $results[] = $res;
    }
    return $results;
}

/**
 * جلب مرفقات معاملة
 */
function getTransactionAttachments($transactionId) {
    $conn = db();
    $transactionId = (int)$transactionId;
    $r = $conn->query("SELECT ta.*, e.name AS uploader_name
        FROM transaction_attachments ta
        LEFT JOIN employees e ON ta.uploaded_by = e.id
        WHERE ta.transaction_id = $transactionId
        ORDER BY ta.created_at ASC");
    $rows = [];
    if ($r) while ($row = $r->fetch_assoc()) $rows[] = $row;
    // دمج المرفق القديم (للتوافق)
    $old = $conn->query("SELECT attachment, attachment_name FROM transactions WHERE id=$transactionId LIMIT 1");
    if ($old && $ow = $old->fetch_assoc()) {
        if ($ow['attachment'] && !count($rows)) {
            $rows[] = [
                'id' => 'legacy',
                'file_path'    => $ow['attachment'],
                'file_name'    => $ow['attachment_name'] ?: 'مستند.pdf',
                'display_name' => $ow['attachment_name'] ?: 'مستند.pdf',
                'file_size'    => null,
                'created_at'   => null,
            ];
        }
    }
    return $rows;
}

/**
 * حذف مرفق واحد من معاملة
 */
function deleteTransactionAttachment($attachmentId, $transactionId) {
    $conn = db();
    $attachmentId  = (int)$attachmentId;
    $transactionId = (int)$transactionId;

    $r = $conn->query("SELECT file_path FROM transaction_attachments
        WHERE id=$attachmentId AND transaction_id=$transactionId LIMIT 1");
    if (!$r || !($row = $r->fetch_assoc())) return false;

    // حذف الملف الفعلي
    $fp = __DIR__ . '/../' . $row['file_path'];
    if (file_exists($fp)) unlink($fp);

    $conn->query("DELETE FROM transaction_attachments WHERE id=$attachmentId");

    // تحديث الأعمدة القديمة: اجعلها تشير للمرفق الأول المتبقي أو null
    $remaining = $conn->query("SELECT file_path, display_name FROM transaction_attachments
        WHERE transaction_id=$transactionId ORDER BY created_at ASC LIMIT 1");
    if ($remaining && $next = $remaining->fetch_assoc()) {
        $np = $conn->real_escape_string($next['file_path']);
        $nn = $conn->real_escape_string($next['display_name']);
        $conn->query("UPDATE transactions SET attachment='$np', attachment_name='$nn' WHERE id=$transactionId");
    } else {
        $conn->query("UPDATE transactions SET attachment=NULL, attachment_name=NULL WHERE id=$transactionId");
    }

    logActivity($transactionId, 'حذف مرفق', 'تم حذف الملف: ' . $row['file_path']);
    return true;
}

/**
 * تحديث مرفق المعاملة (قديم — للتوافق مع السجلات القديمة)
 * @deprecated استخدم addTransactionAttachments بدلاً منها
 */
function updateAttachment($transactionId, $file) {
    $conn = db();
    $transactionId = (int)$transactionId;
    $result = $conn->query("SELECT attachment FROM transactions WHERE id = $transactionId");
    if ($row = $result->fetch_assoc()) {
        if ($row['attachment']) {
            $oldFile = __DIR__ . '/../' . $row['attachment'];
            if (file_exists($oldFile)) unlink($oldFile);
        }
    }
    $uploadResult = uploadAttachment($file);
    if ($uploadResult['success']) {
        $path = $conn->real_escape_string($uploadResult['path']);
        $name = $conn->real_escape_string($uploadResult['name']);
        if ($conn->query("UPDATE transactions SET attachment='$path', attachment_name='$name' WHERE id=$transactionId")) {
            logActivity($transactionId, 'تحديث المرفق', 'تم تحديث الملف المرفق');
            return ['success' => true];
        }
    }
    return $uploadResult;
}

/**
 * حذف مرفق المعاملة (قديم — للتوافق مع السجلات القديمة)
 * @deprecated
 */
function deleteAttachment($transactionId) {
    $conn = db();
    $transactionId = (int)$transactionId;
    $result = $conn->query("SELECT attachment FROM transactions WHERE id = $transactionId");
    if ($row = $result->fetch_assoc()) {
        if ($row['attachment']) {
            $fp = __DIR__ . '/../' . $row['attachment'];
            if (file_exists($fp)) unlink($fp);
        }
    }
    if ($conn->query("UPDATE transactions SET attachment=NULL, attachment_name=NULL WHERE id=$transactionId")) {
        logActivity($transactionId, 'حذف المرفق', 'تم حذف الملف المرفق');
        return true;
    }
    return false;
}

/**
 * تحديث بيانات الاستلام
 */
function updateReceivingData($transactionId, $data) {
    $conn = db();
    
    $transactionId = (int)$transactionId;
    
    // الموظف من الجلسة تلقائياً
    $employeeId = isset($_SESSION['user_id']) ? (int)$_SESSION['user_id'] : 'NULL';
    
    // التاريخ تلقائي (الآن)
    $now = date('Y-m-d H:i:s');
    
    // الحصول على الحالة السابقة
    $oldStatus = getLastStageStatus($transactionId, 'receiving');
    
    $status = $conn->real_escape_string($data['status']);
    $notes = $conn->real_escape_string($data['notes'] ?? '');
    
    $sql = "UPDATE receiving_data SET 
            employee_id = $employeeId,
            receive_date = '$now',
            status = '$status',
            notes = '$notes'
            WHERE transaction_id = $transactionId";
    
    if ($conn->query($sql)) {
        // تسجيل الحدث
        logTransactionEvent(
            $transactionId,
            'receiving',
            'تغيير الحالة',
            $oldStatus,
            $status,
            $notes ?: null
        );
        
        // تسجيل وقت المرحلة مع حساب المدة من آخر تحديث
        $empId = isset($_SESSION['user_id']) ? (int)$_SESSION['user_id'] : null;
        recordStageTimeFromLastUpdate($transactionId, 'receiving', $empId, $status);
        
        $employeeName = $_SESSION['user_name'] ?? 'النظام';
        logActivity($transactionId, 'تحديث الاستلام', "تم تحديث حالة الاستلام إلى: $status بواسطة: $employeeName");
        return true;
    }
    
    return false;
}

/**
 * تحديث بيانات الموازنة
 */
function updateBudgetData($transactionId, $data) {
    $conn = db();
    
    $transactionId = (int)$transactionId;
    
    // الموظف من الجلسة تلقائياً
    $employeeId = isset($_SESSION['user_id']) ? (int)$_SESSION['user_id'] : 'NULL';
    
    // التاريخ تلقائي (الآن)
    $now = date('Y-m-d H:i:s');
    
    // الحصول على الحالة السابقة
    $oldStatus = getLastStageStatus($transactionId, 'budget');
    
    $status = $conn->real_escape_string($data['status'] ?? 'معلق');
    $notes  = $conn->real_escape_string($data['notes'] ?? '');

    // ── رمز الموازنة = رقم الحجز المرتبط بهذه المعاملة ────────
    $budgetCode = '';
    $rRes = $conn->query("SELECT reservation_number FROM budget_reservations
                          WHERE transaction_id = $transactionId
                          ORDER BY id DESC LIMIT 1");
    if ($rRes && ($rRow = $rRes->fetch_assoc())) {
        $budgetCode = $conn->real_escape_string($rRow['reservation_number']);
    }
    // fallback: ما أُرسل من الواجهة إذا لم يوجد حجز مرتبط
    if (!$budgetCode) {
        $sent = rtrim($data['budget_code'] ?? '', '/');
        $budgetCode = $conn->real_escape_string($sent);
    }
    
    $sql = "UPDATE budget_data SET 
            employee_id = $employeeId,
            review_date = '$now',
            budget_status = '$status',
            budget_code = '$budgetCode',
            notes = '$notes'
            WHERE transaction_id = $transactionId";
    
    if ($conn->query($sql)) {
        // تسجيل الحدث
        logTransactionEvent(
            $transactionId,
            'budget',
            'تغيير الحالة',
            $oldStatus,
            $status,
            $notes ?: null
        );
        
        // تسجيل وقت المرحلة مع حساب المدة من آخر تحديث
        $empId = isset($_SESSION['user_id']) ? (int)$_SESSION['user_id'] : null;
        recordStageTimeFromLastUpdate($transactionId, 'budget', $empId, $status);
        
        $employeeName = $_SESSION['user_name'] ?? 'النظام';
        logActivity($transactionId, 'تحديث الموازنة', "تم تحديث حالة الموازنة إلى: $status بواسطة: $employeeName");
        return true;
    }
    
    return false;
}

/**
 * تحديث بيانات الدفع
 */
function updatePaymentData($transactionId, $data) {
    $conn = db();
    
    $transactionId = (int)$transactionId;
    
    // الموظف من الجلسة تلقائياً
    $employeeId = isset($_SESSION['user_id']) ? (int)$_SESSION['user_id'] : 'NULL';
    
    // التاريخ تلقائي (الآن)
    $now = date('Y-m-d H:i:s');
    
    // الحصول على الحالة السابقة
    $oldStatus = getLastStageStatus($transactionId, 'payment');
    
    $method = !empty($data['method']) ? "'" . $conn->real_escape_string($data['method']) . "'" : 'NULL';
    $status = $conn->real_escape_string($data['status']);
    $reference = $conn->real_escape_string($data['reference'] ?? '');
    $notes = $conn->real_escape_string($data['notes'] ?? '');
    
    // INSERT إذا لم يكن السجل موجوداً، UPDATE إذا كان موجوداً
    $sql = "INSERT INTO payment_data (transaction_id, employee_id, payment_date, payment_method, status, reference_number, notes)
            VALUES ($transactionId, $employeeId, '$now', $method, '$status', '$reference', '$notes')
            ON DUPLICATE KEY UPDATE
            employee_id      = VALUES(employee_id),
            payment_date     = VALUES(payment_date),
            payment_method   = VALUES(payment_method),
            status           = VALUES(status),
            reference_number = VALUES(reference_number),
            notes            = VALUES(notes)";
    
    if ($conn->query($sql)) {
        // تسجيل الحدث
        logTransactionEvent(
            $transactionId,
            'payment',
            'تغيير الحالة',
            $oldStatus,
            $status,
            $notes ?: null
        );
        
        // تسجيل وقت المرحلة مع حساب المدة من آخر تحديث
        $empId = isset($_SESSION['user_id']) ? (int)$_SESSION['user_id'] : null;
        recordStageTimeFromLastUpdate($transactionId, 'payment', $empId, $status);
        
        $employeeName = $_SESSION['user_name'] ?? 'النظام';
        logActivity($transactionId, 'تحديث الدفع', "تم تحديث حالة الدفع إلى: $status بواسطة: $employeeName");
        return true;
    }
    
    return false;
}

/**
 * تحديث بيانات الفوترة
 */
function updateInvoiceData($transactionId, $data) {
    $conn = db();
    
    $transactionId = (int)$transactionId;
    
    // الموظف من الجلسة تلقائياً
    $employeeId = isset($_SESSION['user_id']) ? (int)$_SESSION['user_id'] : 'NULL';
    
    // التاريخ تلقائي (الآن)
    $now = date('Y-m-d H:i:s');
    
    // الحصول على الحالة السابقة
    $oldStatus = getLastStageStatus($transactionId, 'invoice');
    
    $invoiceNumber = $conn->real_escape_string($data['invoice_number'] ?? '');
    $status = !empty($data['status']) ? "'" . $conn->real_escape_string($data['status']) . "'" : 'NULL';
    $statusText = !empty($data['status']) ? $data['status'] : ($data['alert_type'] ?? 'انتظار');
    $alertType = $conn->real_escape_string($data['alert_type'] ?? 'انتظار');
    $notes = $conn->real_escape_string($data['notes'] ?? '');
    
    $sql = "UPDATE invoice_data SET 
            employee_id = $employeeId,
            invoice_number = '$invoiceNumber',
            invoice_date = '$now',
            status = $status,
            alert_type = '$alertType',
            notes = '$notes'
            WHERE transaction_id = $transactionId";
    
    if ($conn->query($sql)) {
        // تسجيل الحدث
        logTransactionEvent(
            $transactionId,
            'invoice',
            'تغيير الحالة',
            $oldStatus,
            $statusText,
            $notes ?: null
        );
        
        // تسجيل وقت المرحلة مع حساب المدة من آخر تحديث
        $empId = isset($_SESSION['user_id']) ? (int)$_SESSION['user_id'] : null;
        recordStageTimeFromLastUpdate($transactionId, 'invoice', $empId, $statusText);
        
        $employeeName = $_SESSION['user_name'] ?? 'النظام';
        logActivity($transactionId, 'تحديث الفوترة', "تم تحديث حالة الفوترة، التنبيه: $alertType بواسطة: $employeeName");
        return true;
    }
    
    return false;
}

/**
 * حذف معاملة
 */
function deleteTransaction($id) {
    $conn = db();
    $id = (int)$id;
    
    $sql = "DELETE FROM transactions WHERE id = $id";
    return $conn->query($sql);
}

/**
 * تسجيل النشاط
 */
function logActivity($transactionId, $action, $details = '') {
    $conn = db();
    
    $transactionId = (int)$transactionId;
    $action = $conn->real_escape_string($action);
    $details = $conn->real_escape_string($details);
    
    $sql = "INSERT INTO activity_log (transaction_id, action, details) 
            VALUES ($transactionId, '$action', '$details')";
    
    return $conn->query($sql);
}

/**
 * الحصول على سجل النشاطات
 */
function getActivityLog($transactionId = null, $limit = 50) {
    $conn = db();
    
    $sql = "SELECT al.*, t.transaction_number 
            FROM activity_log al 
            LEFT JOIN transactions t ON al.transaction_id = t.id";
    
    if ($transactionId) {
        $transactionId = (int)$transactionId;
        $sql .= " WHERE al.transaction_id = $transactionId";
    }
    
    $sql .= " ORDER BY al.created_at DESC LIMIT $limit";
    
    $result = $conn->query($sql);
    $logs = [];
    
    if ($result && $result->num_rows > 0) {
        while ($row = $result->fetch_assoc()) {
            $logs[] = $row;
        }
    }
    
    return $logs;
}

/**
 * الحصول على اسم الدور بالعربي
 */
function getRoleName($role) {
    $roles = [
        'admin' => 'مدير النظام',
        'receiver' => 'الاستلام',
        'budget' => 'الموازنة',
        'payment' => 'الدفع',
        'invoice' => 'الفوترة'
    ];
    return $roles[$role] ?? $role;
}

/**
 * التأكد من وجود جدول تتبع الأوقات
 */
function ensureStageTimesTable() {
    $conn = db();
    
    $result = $conn->query("SHOW TABLES LIKE 'stage_times'");
    if (!$result || $result->num_rows == 0) {
        $conn->query("
            CREATE TABLE IF NOT EXISTS stage_times (
                id INT PRIMARY KEY AUTO_INCREMENT,
                transaction_id INT NOT NULL,
                stage ENUM('creation', 'receiving', 'budget', 'dispatch', 'payment', 'invoice') NOT NULL,
                employee_id INT,
                started_at DATETIME COMMENT 'وقت وصول المعاملة للمرحلة (بداية الانتظار)',
                received_at DATETIME DEFAULT NULL COMMENT 'وقت الاستلام الفعلي (بداية OLA)',
                completed_at DATETIME,
                waiting_minutes INT DEFAULT NULL COMMENT 'مدة الانتظار قبل الاستلام الفعلي',
                ola_minutes INT DEFAULT NULL COMMENT 'مدة العمل الفعلي (OLA)',
                duration_minutes INT DEFAULT NULL COMMENT 'إجمالي المدة (للتوافق)',
                escalated_at DATETIME DEFAULT NULL COMMENT 'وقت التصعيد (يوقف OLA)',
                post_escalation_minutes INT DEFAULT NULL COMMENT 'مدة ما بعد التصعيد حتى الإكمال',
                status VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY unique_stage (transaction_id, stage)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ");
    } else {
        // التأكد من وجود dispatch في ENUM
        $result = $conn->query("SHOW COLUMNS FROM stage_times WHERE Field = 'stage'");
        if ($result && $row = $result->fetch_assoc()) {
            if (strpos($row['Type'], 'dispatch') === false) {
                $conn->query("ALTER TABLE stage_times MODIFY COLUMN stage ENUM('creation', 'receiving', 'budget', 'dispatch', 'payment', 'invoice') NOT NULL");
            }
        }
        // إضافة الأعمدة الجديدة إن لم تكن موجودة
        $newCols = [
            'received_at'            => "ALTER TABLE stage_times ADD COLUMN received_at DATETIME DEFAULT NULL AFTER started_at",
            'waiting_minutes'        => "ALTER TABLE stage_times ADD COLUMN waiting_minutes INT DEFAULT NULL AFTER received_at",
            'ola_minutes'            => "ALTER TABLE stage_times ADD COLUMN ola_minutes INT DEFAULT NULL AFTER waiting_minutes",
            'escalated_at'           => "ALTER TABLE stage_times ADD COLUMN escalated_at DATETIME DEFAULT NULL AFTER ola_minutes",
            'post_escalation_minutes'=> "ALTER TABLE stage_times ADD COLUMN post_escalation_minutes INT DEFAULT NULL AFTER escalated_at",
        ];
        foreach ($newCols as $col => $sql) {
            $check = $conn->query("SHOW COLUMNS FROM stage_times LIKE '$col'");
            if (!$check || $check->num_rows == 0) {
                $conn->query($sql);
            }
        }
    }
}

/**
 * التأكد من وجود جدول أحداث المعاملات
 */
function ensureEventsTable() {
    $conn = db();
    
    $result = $conn->query("SHOW TABLES LIKE 'transaction_events'");
    if (!$result || $result->num_rows == 0) {
        $conn->query("
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
        ");
    }
}

/**
 * تسجيل حدث على المعاملة
 * @param int $transactionId معرف المعاملة
 * @param string $stage المرحلة
 * @param string $action نوع الإجراء
 * @param ?string $oldStatus الحالة السابقة
 * @param ?string $newStatus الحالة الجديدة
 * @param ?string $notes ملاحظات/سبب
 */
function logTransactionEvent($transactionId, $stage, $action, $oldStatus = null, $newStatus = null, $notes = null) {
    $conn = db();
    ensureEventsTable();
    
    $transactionId = (int)$transactionId;
    $stage = $conn->real_escape_string($stage);
    $action = $conn->real_escape_string($action);
    $employeeId = isset($_SESSION['user_id']) ? (int)$_SESSION['user_id'] : 'NULL';
    $now = date('Y-m-d H:i:s');
    
    // الحصول على وقت بدء هذه المرحلة من stage_times
    $startedAt = null;
    $result = $conn->query("SELECT started_at FROM stage_times WHERE transaction_id = $transactionId AND stage = '$stage'");
    if ($result && $result->num_rows > 0 && $row = $result->fetch_assoc()) {
        $startedAt = $row['started_at'];
    }
    
    // إذا لم نجد started_at، نبحث عن آخر حدث
    if (!$startedAt) {
        $result = $conn->query("
            SELECT event_time FROM transaction_events 
            WHERE transaction_id = $transactionId 
            ORDER BY event_time DESC LIMIT 1
        ");
        if ($result && $result->num_rows > 0 && $row = $result->fetch_assoc()) {
            $startedAt = $row['event_time'];
        }
    }
    
    // حساب المدة
    $durationFromPrevious = 0;
    if ($startedAt) {
        $startTime = strtotime($startedAt);
        $currentTime = strtotime($now);
        $diffSeconds = $currentTime - $startTime;
        
        if ($diffSeconds > 0 && $diffSeconds < 60) {
            $durationFromPrevious = 1;
        } elseif ($diffSeconds >= 60) {
            $durationFromPrevious = round($diffSeconds / 60);
        }
    }
    
    // تجهيز القيم
    $oldStatusSql = $oldStatus ? "'" . $conn->real_escape_string($oldStatus) . "'" : 'NULL';
    $newStatusSql = $newStatus ? "'" . $conn->real_escape_string($newStatus) . "'" : 'NULL';
    $notesSql = $notes ? "'" . $conn->real_escape_string($notes) . "'" : 'NULL';
    
    // إدراج الحدث
    $sql = "INSERT INTO transaction_events 
            (transaction_id, stage, employee_id, action, old_status, new_status, notes, event_time, duration_from_previous)
            VALUES ($transactionId, '$stage', $employeeId, '$action', $oldStatusSql, $newStatusSql, $notesSql, '$now', $durationFromPrevious)";
    
    $conn->query($sql);
    
    // تحديث وقت آخر تعديل على المعاملة
    $conn->query("UPDATE transactions SET updated_at = '$now' WHERE id = $transactionId");
    
    return $conn->insert_id;
}

/**
 * الحصول على أحداث معاملة معينة
 */
function getTransactionEvents($transactionId, $stage = null) {
    $conn = db();
    ensureEventsTable();
    
    $transactionId = (int)$transactionId;
    
    $sql = "
        SELECT te.*, e.name as employee_name
        FROM transaction_events te
        LEFT JOIN employees e ON te.employee_id = e.id
        WHERE te.transaction_id = $transactionId
    ";
    
    if ($stage) {
        $stage = $conn->real_escape_string($stage);
        $sql .= " AND te.stage = '$stage'";
    }
    
    $sql .= " ORDER BY te.event_time ASC";
    
    $result = $conn->query($sql);
    $events = [];
    
    if ($result && $result->num_rows > 0) {
        while ($row = $result->fetch_assoc()) {
            $events[] = $row;
        }
    }
    
    return $events;
}

/**
 * الحصول على جميع الأحداث
 */
function getAllEvents($limit = 50, $stage = null, $employeeId = null) {
    $conn = db();
    ensureEventsTable();
    
    $limit = (int)$limit;
    
    $sql = "
        SELECT te.*, e.name as employee_name, t.transaction_number
        FROM transaction_events te
        LEFT JOIN employees e ON te.employee_id = e.id
        LEFT JOIN transactions t ON te.transaction_id = t.id
        WHERE 1=1
    ";
    
    if ($stage) {
        $stage = $conn->real_escape_string($stage);
        $sql .= " AND te.stage = '$stage'";
    }
    
    if ($employeeId) {
        $employeeId = (int)$employeeId;
        $sql .= " AND te.employee_id = $employeeId";
    }
    
    $sql .= " ORDER BY te.event_time DESC LIMIT $limit";
    
    $result = $conn->query($sql);
    $events = [];
    
    if ($result && $result->num_rows > 0) {
        while ($row = $result->fetch_assoc()) {
            $events[] = $row;
        }
    }
    
    return $events;
}

/**
 * الحصول على آخر حالة لمرحلة معينة
 */
function getLastStageStatus($transactionId, $stage) {
    $conn = db();
    $transactionId = (int)$transactionId;
    $stage = $conn->real_escape_string($stage);
    
    // البحث في جدول الأحداث
    $result = $conn->query("
        SELECT new_status FROM transaction_events 
        WHERE transaction_id = $transactionId AND stage = '$stage' AND new_status IS NOT NULL
        ORDER BY event_time DESC LIMIT 1
    ");
    
    if ($result && $row = $result->fetch_assoc()) {
        return $row['new_status'];
    }
    
    // البحث في الجدول الأصلي
    $tableMap = [
        'receiving' => ['table' => 'receiving_data', 'column' => 'status'],
        'budget' => ['table' => 'budget_data', 'column' => 'budget_status'],
        'payment' => ['table' => 'payment_data', 'column' => 'status'],
        'invoice' => ['table' => 'invoice_data', 'column' => 'status']
    ];
    
    if (isset($tableMap[$stage])) {
        $table = $tableMap[$stage]['table'];
        $column = $tableMap[$stage]['column'];
        $result = $conn->query("SELECT $column as status FROM $table WHERE transaction_id = $transactionId");
        if ($result && $row = $result->fetch_assoc()) {
            return $row['status'];
        }
    }
    
    return null;
}

/**
 * تسجيل وقت بدء/انتهاء مرحلة
 * @param int $transactionId معرف المعاملة
 * @param string $stage المرحلة (creation, receiving, budget, payment, invoice)
 * @param ?int $employeeId معرف الموظف
 * @param string $status الحالة الجديدة
 * @param bool $isStart هل هذا وقت البدء؟
 */
function recordStageTime($transactionId, $stage, $employeeId, $status, $isStart = false) {
    $conn = db();
    ensureStageTimesTable();
    
    $transactionId = (int)$transactionId;
    $stage = $conn->real_escape_string($stage);
    $employeeId = $employeeId ? (int)$employeeId : 'NULL';
    $status = $conn->real_escape_string($status);
    $now = date('Y-m-d H:i:s');
    
    // الحالات التي تعني اكتمال المرحلة
    $completedStatuses = [
        'creation' => ['تم الإنشاء'],
        'receiving' => ['مستلم'],
        'budget' => ['معتمد'],
        'payment' => ['تم الدفع'],
        'invoice' => ['صدرت الفاتورة', 'مكتمل']
    ];
    
    $isCompleted = in_array($status, $completedStatuses[$stage] ?? []);
    
    // التحقق من وجود سجل
    $result = $conn->query("SELECT * FROM stage_times WHERE transaction_id = $transactionId AND stage = '$stage'");
    
    if ($result && $result->num_rows > 0) {
        $row = $result->fetch_assoc();
        
        if ($isCompleted && empty($row['completed_at'])) {
            // اكتمال المرحلة - تسجيل وقت الانتهاء وحساب المدة
            $startedAt = $row['started_at'] ?? $now;
            
            // حساب المدة بالدقائق (الحد الأدنى 1 إذا كان أكبر من 0 ثواني)
            $diffSeconds = strtotime($now) - strtotime($startedAt);
            $durationCalc = $diffSeconds > 0 && $diffSeconds < 60 ? 1 : max(0, round($diffSeconds / 60));
            
            $sql = "UPDATE stage_times SET 
                    employee_id = $employeeId,
                    completed_at = '$now',
                    duration_minutes = $durationCalc,
                    status = '$status'
                    WHERE transaction_id = $transactionId AND stage = '$stage'";
                    
            $conn->query($sql);
            
            // تسجيل وقت بدء المرحلة التالية
            $nextStage = getNextStage($stage);
            if ($nextStage) {
                startNextStage($transactionId, $nextStage, $now);
            }
            
        } else if (empty($row['started_at'])) {
            // تسجيل وقت البدء إذا لم يكن موجوداً
            $sql = "UPDATE stage_times SET 
                    employee_id = $employeeId,
                    started_at = '$now',
                    status = '$status'
                    WHERE transaction_id = $transactionId AND stage = '$stage'";
            $conn->query($sql);
        } else {
            // تحديث الموظف والحالة فقط
            $sql = "UPDATE stage_times SET 
                    employee_id = $employeeId,
                    status = '$status'
                    WHERE transaction_id = $transactionId AND stage = '$stage'";
            $conn->query($sql);
        }
    } else {
        // إنشاء سجل جديد
        $completedAt = $isCompleted ? "'$now'" : "NULL";
        $duration = $isCompleted ? "0" : "NULL";
        
        $sql = "INSERT INTO stage_times (transaction_id, stage, employee_id, started_at, completed_at, duration_minutes, status) 
                VALUES ($transactionId, '$stage', $employeeId, '$now', $completedAt, $duration, '$status')";
        $conn->query($sql);
        
        // إذا تم اكتمال المرحلة، سجل بدء المرحلة التالية
        if ($isCompleted) {
            $nextStage = getNextStage($stage);
            if ($nextStage) {
                startNextStage($transactionId, $nextStage, $now);
            }
        }
    }
    
    return true;
}

/**
 * تسجيل وقت المرحلة مع الفصل بين وقت الانتظار و OLA
 *
 * المنطق:
 *   - started_at   = وقت وصول المعاملة للمرحلة (بداية الانتظار)
 *   - received_at  = لحظة الاستلام الفعلي (بداية OLA)
 *   - completed_at = لحظة الاكتمال (نهاية OLA)
 *   - waiting_minutes       = received_at - started_at
 *   - ola_minutes           = (escalated_at أو completed_at) - received_at
 *   - post_escalation_minutes = completed_at - escalated_at (إن وُجد)
 *
 * حالات "الاستلام الفعلي" حسب كل مرحلة:
 *   receiving → مستلم  (لحظية: الاستلام = الاكتمال)
 *   budget    → قيد المراجعة
 *   payment   → قيد المراجعة
 *   invoice   → قيد الإصدار
 */
function recordStageTimeFromLastUpdate($transactionId, $stage, $employeeId, $status) {
    $conn = db();
    ensureStageTimesTable();
    
    $transactionId = (int)$transactionId;
    $stageSafe     = $conn->real_escape_string($stage);
    $employeeIdSql = $employeeId ? (int)$employeeId : 'NULL';
    $statusSafe    = $conn->real_escape_string($status);
    $now           = date('Y-m-d H:i:s');

    // ── تعريف الحالات ──────────────────────────────────────────
    // حالة "استلام فعلي" (بداية OLA) لكل مرحلة
    $receivedStatuses = [
        'receiving' => ['مستلم'],
        'budget'    => ['قيد المراجعة'],
        'dispatch'  => ['قيد المراجعة'],
        'payment'   => ['قيد المعالجة'],
        'invoice'   => ['قيد الإصدار'],
    ];
    // حالة "اكتمال" لكل مرحلة
    $completedStatuses = [
        'creation'  => ['تم الإنشاء'],
        'receiving' => ['مستلم'],
        'budget'    => ['معتمد'],
        'dispatch'  => ['تم التوجيه', 'مكتمل'],
        'payment'   => ['تم الدفع'],
        'invoice'   => ['صدرت الفاتورة', 'مكتمل'],
    ];

    $isReceived  = in_array($status, $receivedStatuses[$stage]  ?? []);
    $isCompleted = in_array($status, $completedStatuses[$stage] ?? []);

    // ── جلب السجل الحالي ──────────────────────────────────────
    $res = $conn->query("SELECT * FROM stage_times WHERE transaction_id = $transactionId AND stage = '$stageSafe'");
    $row = ($res && $res->num_rows > 0) ? $res->fetch_assoc() : null;

    if (!$row) {
        // إنشاء سجل جديد (حالة نادرة)
        $conn->query("INSERT INTO stage_times (transaction_id, stage, employee_id, started_at, status)
                      VALUES ($transactionId, '$stageSafe', $employeeIdSql, '$now', '$statusSafe')");
        $row = ['started_at' => $now, 'received_at' => null, 'escalated_at' => null, 'completed_at' => null];
    }

    $startedAt   = $row['started_at']   ?? $now;
    $receivedAt  = $row['received_at']  ?? null;
    $escalatedAt = $row['escalated_at'] ?? null;

    // ── دالة مساعدة لحساب الفرق بالدقائق ─────────────────────
    $diffMin = function($from, $to) {
        if (!$from || !$to) return null;
        $diff = strtotime($to) - strtotime($from);
        if ($diff <= 0) return 0;
        return $diff < 60 ? 1 : (int)round($diff / 60);
    };

    // ── بناء جملة UPDATE ───────────────────────────────────────
    $sets = ["employee_id = $employeeIdSql", "status = '$statusSafe'"];

    // 1) استلام فعلي → سجّل received_at وحساب waiting_minutes
    if ($isReceived && !$receivedAt) {
        $sets[] = "received_at = '$now'";
        $wMin   = $diffMin($startedAt, $now);
        if ($wMin !== null) $sets[] = "waiting_minutes = $wMin";
        $receivedAt = $now; // للحساب التالي
    }

    // 2) اكتمال → سجّل completed_at وحساب ola_minutes و post_escalation_minutes
    if ($isCompleted && !$row['completed_at']) {
        $sets[] = "completed_at = '$now'";

        // إذا لم يُسجَّل received_at بعد (مثل receiving اللحظية) → سجّله الآن
        if (!$receivedAt) {
            $sets[] = "received_at = '$now'";
            $wMin   = $diffMin($startedAt, $now);
            if ($wMin !== null) $sets[] = "waiting_minutes = $wMin";
            $receivedAt = $now;
        }

        // ola_minutes = من received_at حتى (escalated_at إن وُجد، وإلا now)
        $olaEnd  = $escalatedAt ?? $now;
        $olaMin  = $diffMin($receivedAt, $olaEnd);
        if ($olaMin !== null) $sets[] = "ola_minutes = $olaMin";

        // post_escalation_minutes = من escalated_at حتى now
        if ($escalatedAt) {
            $postMin = $diffMin($escalatedAt, $now);
            if ($postMin !== null) $sets[] = "post_escalation_minutes = $postMin";
        }

        // duration_minutes للتوافق مع الكود القديم = ola_minutes
        if ($olaMin !== null) $sets[] = "duration_minutes = $olaMin";
    }

    // تنفيذ التحديث
    $conn->query("UPDATE stage_times SET " . implode(', ', $sets) . "
                  WHERE transaction_id = $transactionId AND stage = '$stageSafe'");

    // ── إن اكتملت: ابدأ المرحلة التالية ──────────────────────
    if ($isCompleted) {
        $nextStage = getNextStage($stage);
        if ($nextStage) {
            startNextStage($transactionId, $nextStage, $now);
        }
    }

    // تحديث updated_at على المعاملة
    $conn->query("UPDATE transactions SET updated_at = '$now' WHERE id = $transactionId");

    return true;
}

/**
 * الحصول على المرحلة التالية
 */
function getNextStage($currentStage) {
    $stages = [
        'creation'  => 'receiving',
        'receiving' => 'budget',
        'budget'    => 'dispatch',   // بعد الموازنة → فرز مدير الحسابات
        'dispatch'  => 'payment',    // بعد الفرز المباشر → دفع
        'payment'   => 'invoice',
        'invoice'   => null
    ];
    return $stages[$currentStage] ?? null;
}

/**
 * تسجيل وقت بدء المرحلة التالية
 */
function startNextStage($transactionId, $stage, $startTime) {
    $conn = db();
    $transactionId = (int)$transactionId;
    $stage = $conn->real_escape_string($stage);
    
    // التحقق من وجود سجل
    $result = $conn->query("SELECT id FROM stage_times WHERE transaction_id = $transactionId AND stage = '$stage'");
    
    if ($result && $result->num_rows > 0) {
        // سجّل started_at فقط — received_at يُسجَّل لاحقاً عندما يستلم الموظف فعلياً
        $conn->query("UPDATE stage_times
                      SET started_at = COALESCE(started_at, '$startTime'),
                          status     = COALESCE(NULLIF(status,''), 'في الانتظار')
                      WHERE transaction_id = $transactionId AND stage = '$stage'");
    } else {
        // سجّل المرحلة الجديدة بدون received_at — OLA لم يبدأ بعد
        $conn->query("INSERT INTO stage_times (transaction_id, stage, started_at, status)
                      VALUES ($transactionId, '$stage', '$startTime', 'في الانتظار')");
    }
}

/**
 * الحصول على أوقات مرحلة معينة لمعاملة
 */
function getStageTime($transactionId, $stage) {
    $conn = db();
    ensureStageTimesTable();
    
    $transactionId = (int)$transactionId;
    $stage = $conn->real_escape_string($stage);
    
    $result = $conn->query("
        SELECT st.*, e.name as employee_name 
        FROM stage_times st 
        LEFT JOIN employees e ON st.employee_id = e.id
        WHERE st.transaction_id = $transactionId AND st.stage = '$stage'
    ");
    
    if ($result && $result->num_rows > 0) {
        return $result->fetch_assoc();
    }
    
    return null;
}

/**
 * الحصول على تقرير أوقات الموظفين
 */
function getEmployeeTimeReport($employeeId = null, $stage = null, $dateFrom = null, $dateTo = null) {
    $conn = db();
    ensureStageTimesTable();
    
    $where = ["st.completed_at IS NOT NULL"];
    
    if ($employeeId) {
        $where[] = "st.employee_id = " . (int)$employeeId;
    }
    if ($stage) {
        $where[] = "st.stage = '" . $conn->real_escape_string($stage) . "'";
    }
    if ($dateFrom) {
        $where[] = "DATE(st.completed_at) >= '" . $conn->real_escape_string($dateFrom) . "'";
    }
    if ($dateTo) {
        $where[] = "DATE(st.completed_at) <= '" . $conn->real_escape_string($dateTo) . "'";
    }
    
    $whereClause = implode(' AND ', $where);
    
    $sql = "
        SELECT 
            st.*,
            t.transaction_number,
            t.description as transaction_description,
            e.name as employee_name,
            e.role as employee_role
        FROM stage_times st
        JOIN transactions t ON st.transaction_id = t.id
        LEFT JOIN employees e ON st.employee_id = e.id
        WHERE $whereClause
        ORDER BY st.completed_at DESC
    ";
    
    $result = $conn->query($sql);
    $data = [];
    
    if ($result) {
        while ($row = $result->fetch_assoc()) {
            $data[] = $row;
        }
    }
    
    return $data;
}

/**
 * الحصول على ملخص أداء الموظفين
 */
function getEmployeePerformanceSummary($dateFrom = null, $dateTo = null) {
    $conn = db();
    ensureStageTimesTable();
    
    $where = ["st.completed_at IS NOT NULL", "st.employee_id IS NOT NULL"];
    
    if ($dateFrom) {
        $where[] = "DATE(st.completed_at) >= '" . $conn->real_escape_string($dateFrom) . "'";
    }
    if ($dateTo) {
        $where[] = "DATE(st.completed_at) <= '" . $conn->real_escape_string($dateTo) . "'";
    }
    
    $whereClause = implode(' AND ', $where);
    
    $sql = "
        SELECT 
            e.id as employee_id,
            e.name as employee_name,
            e.role as employee_role,
            st.stage,
            COUNT(*) as total_transactions,
            AVG(st.duration_minutes) as avg_duration,
            MIN(st.duration_minutes) as min_duration,
            MAX(st.duration_minutes) as max_duration,
            SUM(st.duration_minutes) as total_duration
        FROM stage_times st
        JOIN employees e ON st.employee_id = e.id
        WHERE $whereClause
        GROUP BY e.id, st.stage
        ORDER BY e.name, st.stage
    ";
    
    $result = $conn->query($sql);
    $data = [];
    
    if ($result) {
        while ($row = $result->fetch_assoc()) {
            $data[] = $row;
        }
    }
    
    return $data;
}

/**
 * الحصول على تفاصيل أداء موظف معين
 */
function getEmployeePerformanceDetails($employeeId, $dateFrom = null, $dateTo = null) {
    $conn = db();
    ensureStageTimesTable();
    
    $employeeId = (int)$employeeId;
    $where = ["st.employee_id = $employeeId", "st.completed_at IS NOT NULL"];
    
    if ($dateFrom) {
        $where[] = "DATE(st.completed_at) >= '" . $conn->real_escape_string($dateFrom) . "'";
    }
    if ($dateTo) {
        $where[] = "DATE(st.completed_at) <= '" . $conn->real_escape_string($dateTo) . "'";
    }
    
    $whereClause = implode(' AND ', $where);
    
    // ملخص الأداء
    $summaryResult = $conn->query("
        SELECT 
            COUNT(*) as total_transactions,
            AVG(st.duration_minutes) as avg_duration,
            MIN(st.duration_minutes) as min_duration,
            MAX(st.duration_minutes) as max_duration,
            SUM(st.duration_minutes) as total_duration
        FROM stage_times st
        WHERE $whereClause
    ");
    
    $summary = $summaryResult ? $summaryResult->fetch_assoc() : null;
    
    // تفاصيل المعاملات
    $detailsResult = $conn->query("
        SELECT 
            st.*,
            t.transaction_number,
            t.description as transaction_description,
            t.amount
        FROM stage_times st
        JOIN transactions t ON st.transaction_id = t.id
        WHERE $whereClause
        ORDER BY st.completed_at DESC
        LIMIT 50
    ");
    
    $details = [];
    if ($detailsResult) {
        while ($row = $detailsResult->fetch_assoc()) {
            $details[] = $row;
        }
    }
    
    // معلومات الموظف
    $empResult = $conn->query("SELECT * FROM employees WHERE id = $employeeId");
    $employee = $empResult ? $empResult->fetch_assoc() : null;
    
    return [
        'employee' => $employee,
        'summary' => $summary,
        'details' => $details
    ];
}

/**
 * الحصول على آخر التنبيهات (آخر تحديث لكل معاملة في كل قسم)
 * أضف هذه الدالة في نهاية ملف functions.php
 */
function getRecentNotifications($limit = 5) {
    $conn = db();
    
    bootstrapSystem();
    
    $notifications = [];
    
    $sql = "
        SELECT 
            t.id,
            t.transaction_number,
            tt.name as transaction_type,
            t.amount,
            'receiving' as stage,
            r.status,
            r.updated_at as update_time,
            er.name as employee_name,
            r.notes
        FROM transactions t
        LEFT JOIN transaction_types tt ON t.type_id = tt.id
        LEFT JOIN receiving_data r ON t.id = r.transaction_id
        LEFT JOIN employees er ON r.employee_id = er.id
        WHERE r.status IS NOT NULL AND r.status != 'معلق' AND r.updated_at IS NOT NULL
        
        UNION ALL
        
        SELECT 
            t.id,
            t.transaction_number,
            tt.name as transaction_type,
            t.amount,
            'budget' as stage,
            b.budget_status as status,
            b.updated_at as update_time,
            eb.name as employee_name,
            b.notes
        FROM transactions t
        LEFT JOIN transaction_types tt ON t.type_id = tt.id
        LEFT JOIN budget_data b ON t.id = b.transaction_id
        LEFT JOIN employees eb ON b.employee_id = eb.id
        WHERE b.budget_status IS NOT NULL AND b.budget_status != 'معلق' AND b.updated_at IS NOT NULL
        
        UNION ALL
        
        SELECT 
            t.id,
            t.transaction_number,
            tt.name as transaction_type,
            t.amount,
            'payment' as stage,
            p.status,
            p.updated_at as update_time,
            ep.name as employee_name,
            p.notes
        FROM transactions t
        LEFT JOIN transaction_types tt ON t.type_id = tt.id
        LEFT JOIN payment_data p ON t.id = p.transaction_id
        LEFT JOIN employees ep ON p.employee_id = ep.id
        WHERE p.status IS NOT NULL AND p.status != 'معلق' AND p.updated_at IS NOT NULL
        
        UNION ALL
        
        SELECT 
            t.id,
            t.transaction_number,
            tt.name as transaction_type,
            t.amount,
            'invoice' as stage,
            i.status,
            i.updated_at as update_time,
            ei.name as employee_name,
            i.notes
        FROM transactions t
        LEFT JOIN transaction_types tt ON t.type_id = tt.id
        LEFT JOIN invoice_data i ON t.id = i.transaction_id
        LEFT JOIN employees ei ON i.employee_id = ei.id
        WHERE i.status IS NOT NULL AND i.status != '' AND i.updated_at IS NOT NULL
        
        ORDER BY update_time DESC
        LIMIT $limit
    ";
    
    $result = $conn->query($sql);
    
    if ($result && $result->num_rows > 0) {
        while ($row = $result->fetch_assoc()) {
            $notifications[] = $row;
        }
    }
    
    return $notifications;
}

// ── صلاحيات الجلسة (مُحوَّلة من index.php) ─────────────────
if (!function_exists('loadPermissionsForSession')) {
function loadPermissionsForSession($userId) {
    $conn = db();
    $userId = (int)$userId;
    
    $chk = $conn->query("SHOW COLUMNS FROM employees LIKE 'permission_level'");
    if (!$chk || $chk->num_rows === 0) {
        $r = $conn->query("SELECT role FROM employees WHERE id=$userId LIMIT 1");
        $row = $r ? $r->fetch_assoc() : null;
        if ($row && $row['role'] === 'admin') {
            $_SESSION['permission_level'] = 'system_admin';
            $_SESSION['can_delete'] = true;
        } else {
            $_SESSION['permission_level'] = 'employee';
            $_SESSION['can_delete'] = false;
        }
        $allPages = ['dashboard','transactions','correspondence','bank-overview','bank-accounts','bank-investments','daily-payments','sla','performance','settings','notifications','reservations','budget-plans','archive','ceo-approvals','purchase-requests'];
    }
    
    // ── self-healing: توسيع ENUM + إضافة permission_level_code ──
    @$conn->query("ALTER TABLE employees ADD COLUMN IF NOT EXISTS permission_level_code VARCHAR(50) DEFAULT NULL");
    @$conn->query("ALTER TABLE employees MODIFY COLUMN permission_level ENUM('system_admin','CEO','sector_head','division_manager','employee_l1','employee') NOT NULL DEFAULT 'employee'");
    // تصحيح تلقائي: أي موظف بدور CEO → permission_level = 'CEO'
    @$conn->query("UPDATE employees SET permission_level='CEO', permission_level_code='CEO' WHERE role='CEO' AND permission_level NOT IN ('system_admin','CEO')");
    $r = $conn->query("SELECT role, permission_level, permission_level_code, can_delete FROM employees WHERE id=$userId LIMIT 1");
    if (!$r || !($row = $r->fetch_assoc())) return;
    
    if ($row['role'] === 'admin' && $row['permission_level'] !== 'system_admin') {
        $conn->query("UPDATE employees SET permission_level='system_admin', can_delete=1 WHERE id=$userId");
        $row['permission_level'] = 'system_admin';
        $row['can_delete'] = 1;
    }
    // تصحيح تلقائي: CEO يحصل على permission_level = 'CEO'
    if ($row['role'] === 'CEO' && !in_array($row['permission_level'], ['system_admin','CEO'])) {
        $conn->query("UPDATE employees SET permission_level='CEO', permission_level_code='CEO' WHERE id=$userId");
        $row['permission_level'] = 'CEO';
        $row['permission_level_code'] = 'CEO';
    }
    
    $_SESSION['permission_level']      = $row['permission_level'];
    $_SESSION['permission_level_code'] = $row['permission_level_code'] ?? $row['permission_level'];
    $_SESSION['can_delete'] = (bool)$row['can_delete'];
    
    $allPages = ['dashboard','transactions','correspondence','bank-overview','bank-accounts','bank-investments','daily-payments','sla','performance','settings','notifications','reservations','budget-plans','archive','ceo-approvals','purchase-requests'];
    
    if ($row['permission_level'] === 'system_admin' || $row['permission_level'] === 'CEO') {
        $_SESSION['page_permissions']   = array_fill_keys($allPages, true);
        $_SESSION['action_permissions'] = [];
    } else {
        $chkTbl = $conn->query("SHOW TABLES LIKE 'employee_page_permissions'");
        $stored = [];
        if ($chkTbl && $chkTbl->num_rows > 0) {
            $r2 = $conn->query("SELECT page, can_access FROM employee_page_permissions WHERE employee_id=$userId");
            if ($r2) while ($pr = $r2->fetch_assoc()) $stored[$pr['page']] = (bool)$pr['can_access'];
        }
        // قواعد الصلاحيات الافتراضية للمستويات
        // الأدوار الستة — نطاق الرؤية حسب الخطة
        $defaults = [
            'system_admin'     => array_fill_keys($allPages, true),
            'CEO'              => ['dashboard'=>1,'transactions'=>1,'correspondence'=>1,'bank-overview'=>1,'bank-accounts'=>0,'bank-investments'=>0,'daily-payments'=>1,'sla'=>1,'performance'=>1,'settings'=>0,'notifications'=>1,'reservations'=>1,'budget-plans'=>1,'archive'=>1,'ceo-approvals'=>1,'purchase-requests'=>1],
            'sector_head'      => ['dashboard'=>1,'transactions'=>1,'correspondence'=>1,'bank-overview'=>1,'bank-accounts'=>1,'bank-investments'=>1,'daily-payments'=>1,'sla'=>1,'performance'=>1,'settings'=>0,'notifications'=>1,'reservations'=>1,'budget-plans'=>1,'archive'=>1,'ceo-approvals'=>1,'purchase-requests'=>1],
            'division_manager' => ['dashboard'=>1,'transactions'=>1,'correspondence'=>1,'bank-overview'=>0,'bank-accounts'=>0,'bank-investments'=>0,'daily-payments'=>1,'sla'=>1,'performance'=>1,'settings'=>0,'notifications'=>1,'reservations'=>1,'budget-plans'=>1,'archive'=>1,'ceo-approvals'=>0,'purchase-requests'=>1],
            'employee_l1'      => ['dashboard'=>0,'transactions'=>1,'correspondence'=>1,'bank-overview'=>0,'bank-accounts'=>0,'bank-investments'=>0,'daily-payments'=>1,'sla'=>0,'performance'=>1,'settings'=>0,'notifications'=>1,'reservations'=>1,'budget-plans'=>0,'archive'=>0,'ceo-approvals'=>0,'purchase-requests'=>1],
            'employee'         => ['dashboard'=>0,'transactions'=>1,'correspondence'=>1,'bank-overview'=>0,'bank-accounts'=>0,'bank-investments'=>0,'daily-payments'=>0,'sla'=>0,'performance'=>0,'settings'=>0,'notifications'=>1,'reservations'=>0,'budget-plans'=>0,'archive'=>0,'ceo-approvals'=>0,'purchase-requests'=>1],
        ];
        $def = $defaults[$row['permission_level']] ?? $defaults['employee'];
        $pagePerms = [];
        foreach ($allPages as $p) {
            $pagePerms[$p] = isset($stored[$p]) ? $stored[$p] : (bool)($def[$p] ?? false);
        }
        $_SESSION['page_permissions'] = $pagePerms;

        $actionPerms = [];
        $chkAct = $conn->query("SHOW TABLES LIKE 'employee_action_permissions'");
        if ($chkAct && $chkAct->num_rows > 0) {
            $ra = $conn->query("SELECT action, can_do FROM employee_action_permissions WHERE employee_id=$userId");
            if ($ra) while ($ar = $ra->fetch_assoc()) $actionPerms[$ar['action']] = (bool)$ar['can_do'];
        }
        $_SESSION['action_permissions'] = $actionPerms;
    }
}

} // end function_exists

// ── نظام المعاملات (طلبات الشراء) — خارج if(!function_exists) ──
// يُحمَّل دائماً بغض النظر عن حالة الجلسة
$_prFunctionsPath = __DIR__ . '/pr_functions.php';
if (file_exists($_prFunctionsPath)) {
    require_once $_prFunctionsPath;
}