<?php
/**
 * الدوال المساعدة للنظام
 * Workflow System Helper Functions
 */

require_once __DIR__ . '/config.php';

/**
 * التحقق من وجود View وإنشائه إذا لم يكن موجوداً
 */
function ensureViewExists() {
    $conn = db();
    
    // التحقق من وجود أعمدة المرفقات
    $result = $conn->query("SHOW COLUMNS FROM transactions LIKE 'attachment'");
    $hasAttachment = ($result && $result->num_rows > 0);
    
    // إضافة أعمدة المرفقات إذا لم تكن موجودة
    if (!$hasAttachment) {
        $conn->query("ALTER TABLE transactions ADD COLUMN attachment VARCHAR(255) DEFAULT NULL");
        $conn->query("ALTER TABLE transactions ADD COLUMN attachment_name VARCHAR(255) DEFAULT NULL");
    }
    
    // التحقق من وجود جدول الموازنة
    $result = $conn->query("SHOW TABLES LIKE 'budget_data'");
    if (!$result || $result->num_rows == 0) {
        // إنشاء جدول الموازنة
        $conn->query("
            CREATE TABLE IF NOT EXISTS budget_data (
                id INT PRIMARY KEY AUTO_INCREMENT,
                transaction_id INT UNIQUE NOT NULL,
                employee_id INT,
                review_date DATE,
                budget_status ENUM('معتمد', 'قيد المراجعة', 'مرفوض', 'معلق') DEFAULT 'معلق',
                budget_code VARCHAR(50),
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
            ) ENGINE=InnoDB
        ");
        
        // إضافة سجلات للمعاملات الموجودة
        $conn->query("INSERT IGNORE INTO budget_data (transaction_id) SELECT id FROM transactions");
    }
    
    // حذف View القديم وإنشاء جديد
    $conn->query("DROP VIEW IF EXISTS v_full_transactions");
    
    // التأكد من وجود أعمدة المنشئ
    ensureCreatorColumns();
    
    // إنشاء View مع الموازنة ومعلومات المنشئ
    $sql = "
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
    ";
    
    return $conn->query($sql);
}

/**
 * الحصول على جميع المعاملات
 */
function getAllTransactions($filters = []) {
    $conn = db();
    
    // التأكد من وجود View
    ensureViewExists();
    
    $sql = "SELECT * FROM v_full_transactions WHERE 1=1";
    
    // فلترة حسب الحالة
    if (!empty($filters['status'])) {
        $status = $conn->real_escape_string($filters['status']);
        $sql .= " AND (receive_status = '$status' OR payment_status = '$status' OR alert_type = '$status')";
    }
    
    // فلترة حسب البحث
    if (!empty($filters['search'])) {
        $search = $conn->real_escape_string($filters['search']);
        $sql .= " AND (transaction_number LIKE '%$search%' OR description LIKE '%$search%' OR transaction_type LIKE '%$search%')";
    }
    
    // فلترة حسب التاريخ
    if (!empty($filters['date_from'])) {
        $dateFrom = $conn->real_escape_string($filters['date_from']);
        $sql .= " AND transaction_date >= '$dateFrom'";
    }
    
    if (!empty($filters['date_to'])) {
        $dateTo = $conn->real_escape_string($filters['date_to']);
        $sql .= " AND transaction_date <= '$dateTo'";
    }
    
    $sql .= " ORDER BY transaction_date DESC, id DESC";
    
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
 */
function getUrgentTransactions() {
    $conn = db();
    
    $sql = "SELECT * FROM v_full_transactions WHERE alert_type IN ('عاجل', 'متابعة') ORDER BY 
            CASE alert_type 
                WHEN 'عاجل' THEN 1 
                WHEN 'متابعة' THEN 2 
            END, transaction_date DESC";
    
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
    
    $sql = "SELECT * FROM transaction_types WHERE is_active = 1 ORDER BY name";
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
 * إنشاء رقم معاملة جديد
 */
function generateTransactionNumber() {
    $conn = db();
    
    $year = date('Y');
    $result = $conn->query("SELECT MAX(id) as max_id FROM transactions");
    $row = $result->fetch_assoc();
    $nextId = ($row['max_id'] ?? 0) + 1;
    
    return 'TR-' . str_pad($nextId, 4, '0', STR_PAD_LEFT);
}

/**
 * إضافة معاملة جديدة
 */
function addTransaction($data, $file = null) {
    $conn = db();
    
    // التأكد من وجود أعمدة المنشئ
    ensureCreatorColumns();
    
    $transactionNumber = generateTransactionNumber();
    $typeId = (int)$data['type_id'];
    $description = $conn->real_escape_string($data['description']);
    $amount = (float)$data['amount'];
    
    // الحصول على معرف المستخدم الحالي من الجلسة
    $createdBy = isset($_SESSION['user_id']) ? (int)$_SESSION['user_id'] : 'NULL';
    
    // معالجة الملف المرفق
    $attachment = 'NULL';
    $attachmentName = 'NULL';
    
    if ($file && isset($file['tmp_name']) && $file['tmp_name']) {
        $uploadResult = uploadAttachment($file);
        if ($uploadResult['success']) {
            $attachment = "'" . $conn->real_escape_string($uploadResult['path']) . "'";
            $attachmentName = "'" . $conn->real_escape_string($uploadResult['name']) . "'";
        }
    }
    
    // التاريخ تلقائي (الآن)
    $sql = "INSERT INTO transactions (transaction_number, transaction_date, type_id, description, amount, attachment, attachment_name, created_by, created_at) 
            VALUES ('$transactionNumber', NOW(), $typeId, '$description', $amount, $attachment, $attachmentName, $createdBy, NOW())";
    
    if ($conn->query($sql)) {
        $transactionId = $conn->insert_id;
        
        // إنشاء سجلات فارغة للمراحل الأربع
        $conn->query("INSERT INTO receiving_data (transaction_id) VALUES ($transactionId)");
        $conn->query("INSERT INTO budget_data (transaction_id) VALUES ($transactionId)");
        $conn->query("INSERT INTO payment_data (transaction_id) VALUES ($transactionId)");
        $conn->query("INSERT INTO invoice_data (transaction_id) VALUES ($transactionId)");
        
        // تسجيل وقت الإنشاء في جدول الأوقات
        ensureStageTimesTable();
        $now = date('Y-m-d H:i:s');
        
        // تسجيل مرحلة الإنشاء (مكتملة فوراً)
        $conn->query("INSERT INTO stage_times (transaction_id, stage, employee_id, started_at, completed_at, duration_minutes, status) 
                      VALUES ($transactionId, 'creation', $createdBy, '$now', '$now', 0, 'تم الإنشاء')
                      ON DUPLICATE KEY UPDATE completed_at = '$now', status = 'تم الإنشاء'");
        
        // تسجيل بدء مرحلة الاستلام (في انتظار موظف الاستلام)
        $conn->query("INSERT INTO stage_times (transaction_id, stage, started_at, status) 
                      VALUES ($transactionId, 'receiving', '$now', 'في الانتظار')
                      ON DUPLICATE KEY UPDATE started_at = COALESCE(started_at, '$now')");
        
        // تسجيل النشاط
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
}

/**
 * رفع ملف مرفق
 */
function uploadAttachment($file) {
    $uploadDir = __DIR__ . '/../uploads/';
    
    // إنشاء مجلد الرفع إذا لم يكن موجوداً
    if (!is_dir($uploadDir)) {
        mkdir($uploadDir, 0755, true);
    }
    
    // التحقق من نوع الملف
    $allowedTypes = ['application/pdf'];
    $fileType = mime_content_type($file['tmp_name']);
    
    if (!in_array($fileType, $allowedTypes)) {
        return ['success' => false, 'message' => 'نوع الملف غير مسموح. يرجى رفع ملف PDF فقط.'];
    }
    
    // التحقق من حجم الملف (10 ميجا كحد أقصى)
    $maxSize = 10 * 1024 * 1024;
    if ($file['size'] > $maxSize) {
        return ['success' => false, 'message' => 'حجم الملف كبير جداً. الحد الأقصى 10 ميجابايت.'];
    }
    
    // إنشاء اسم فريد للملف
    $extension = pathinfo($file['name'], PATHINFO_EXTENSION);
    $newFileName = uniqid('doc_') . '_' . time() . '.' . $extension;
    $uploadPath = $uploadDir . $newFileName;
    
    if (move_uploaded_file($file['tmp_name'], $uploadPath)) {
        return [
            'success' => true,
            'path' => 'uploads/' . $newFileName,
            'name' => $file['name']
        ];
    }
    
    return ['success' => false, 'message' => 'فشل في رفع الملف.'];
}

/**
 * تحديث مرفق المعاملة
 */
function updateAttachment($transactionId, $file) {
    $conn = db();
    $transactionId = (int)$transactionId;
    
    // حذف الملف القديم إن وجد
    $result = $conn->query("SELECT attachment FROM transactions WHERE id = $transactionId");
    if ($row = $result->fetch_assoc()) {
        if ($row['attachment']) {
            $oldFile = __DIR__ . '/../' . $row['attachment'];
            if (file_exists($oldFile)) {
                unlink($oldFile);
            }
        }
    }
    
    // رفع الملف الجديد
    $uploadResult = uploadAttachment($file);
    if ($uploadResult['success']) {
        $path = $conn->real_escape_string($uploadResult['path']);
        $name = $conn->real_escape_string($uploadResult['name']);
        
        $sql = "UPDATE transactions SET attachment = '$path', attachment_name = '$name' WHERE id = $transactionId";
        if ($conn->query($sql)) {
            logActivity($transactionId, 'تحديث المرفق', 'تم تحديث الملف المرفق');
            return ['success' => true];
        }
    }
    
    return $uploadResult;
}

/**
 * حذف مرفق المعاملة
 */
function deleteAttachment($transactionId) {
    $conn = db();
    $transactionId = (int)$transactionId;
    
    // الحصول على مسار الملف
    $result = $conn->query("SELECT attachment FROM transactions WHERE id = $transactionId");
    if ($row = $result->fetch_assoc()) {
        if ($row['attachment']) {
            $filePath = __DIR__ . '/../' . $row['attachment'];
            if (file_exists($filePath)) {
                unlink($filePath);
            }
        }
    }
    
    // تحديث قاعدة البيانات
    $sql = "UPDATE transactions SET attachment = NULL, attachment_name = NULL WHERE id = $transactionId";
    if ($conn->query($sql)) {
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
    $budgetCode = $conn->real_escape_string($data['budget_code'] ?? '');
    $notes = $conn->real_escape_string($data['notes'] ?? '');
    
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
    
    $sql = "UPDATE payment_data SET 
            employee_id = $employeeId,
            payment_date = '$now',
            payment_method = $method,
            status = '$status',
            reference_number = '$reference',
            notes = '$notes'
            WHERE transaction_id = $transactionId";
    
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
                stage ENUM('creation', 'receiving', 'budget', 'payment', 'invoice') NOT NULL,
                employee_id INT,
                started_at DATETIME,
                completed_at DATETIME,
                duration_minutes INT DEFAULT NULL,
                status VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY unique_stage (transaction_id, stage)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ");
    } else {
        // التأكد من وجود قيمة 'creation' في ENUM
        $result = $conn->query("SHOW COLUMNS FROM stage_times WHERE Field = 'stage'");
        if ($result && $row = $result->fetch_assoc()) {
            if (strpos($row['Type'], 'creation') === false) {
                $conn->query("ALTER TABLE stage_times MODIFY COLUMN stage ENUM('creation', 'receiving', 'budget', 'payment', 'invoice') NOT NULL");
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
 * @param string|null $oldStatus الحالة السابقة
 * @param string|null $newStatus الحالة الجديدة
 * @param string|null $notes ملاحظات/سبب
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
 * @param int|null $employeeId معرف الموظف
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
 * تسجيل وقت المرحلة مع حساب المدة من آخر تحديث على المعاملة
 * يحسب الوقت بين التحديث السابق والتحديث الحالي
 */
function recordStageTimeFromLastUpdate($transactionId, $stage, $employeeId, $status) {
    $conn = db();
    ensureStageTimesTable();
    
    $transactionId = (int)$transactionId;
    $stage = $conn->real_escape_string($stage);
    $employeeId = $employeeId ? (int)$employeeId : 'NULL';
    $status = $conn->real_escape_string($status);
    $now = date('Y-m-d H:i:s');
    
    // الحصول على وقت بدء هذه المرحلة من stage_times
    $startedAt = null;
    $result = $conn->query("SELECT started_at FROM stage_times WHERE transaction_id = $transactionId AND stage = '$stage'");
    if ($result && $result->num_rows > 0 && $row = $result->fetch_assoc()) {
        $startedAt = $row['started_at'];
    }
    
    // حساب المدة من وقت بدء المرحلة
    $durationMinutes = 0;
    if ($startedAt) {
        $startTime = strtotime($startedAt);
        $currentTime = strtotime($now);
        $diffSeconds = $currentTime - $startTime;
        
        if ($diffSeconds > 0 && $diffSeconds < 60) {
            $durationMinutes = 1;
        } elseif ($diffSeconds >= 60) {
            $durationMinutes = round($diffSeconds / 60);
        }
    }
    
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
        
        // تحديث المدة دائماً (سواء مكتملة أو لا)
        $sql = "UPDATE stage_times SET 
                employee_id = $employeeId,
                started_at = COALESCE(started_at, '$now'),
                duration_minutes = $durationMinutes,
                status = '$status'";
        
        if ($isCompleted) {
            $sql .= ", completed_at = '$now'";
        }
        
        $sql .= " WHERE transaction_id = $transactionId AND stage = '$stage'";
        $conn->query($sql);
        
        // تسجيل وقت بدء المرحلة التالية
        if ($isCompleted) {
            $nextStage = getNextStage($stage);
            if ($nextStage) {
                startNextStage($transactionId, $nextStage, $now);
            }
        }
    } else {
        // إنشاء سجل جديد
        $completedAt = $isCompleted ? "'$now'" : "NULL";
        
        $sql = "INSERT INTO stage_times (transaction_id, stage, employee_id, started_at, completed_at, duration_minutes, status) 
                VALUES ($transactionId, '$stage', $employeeId, '$now', $completedAt, $durationMinutes, '$status')";
        $conn->query($sql);
        
        // إذا تم اكتمال المرحلة، سجل بدء المرحلة التالية
        if ($isCompleted) {
            $nextStage = getNextStage($stage);
            if ($nextStage) {
                startNextStage($transactionId, $nextStage, $now);
            }
        }
    }
    
    // تحديث وقت آخر تعديل على المعاملة
    $conn->query("UPDATE transactions SET updated_at = '$now' WHERE id = $transactionId");
    
    return true;
}

/**
 * الحصول على المرحلة التالية
 */
function getNextStage($currentStage) {
    $stages = [
        'creation' => 'receiving',
        'receiving' => 'budget', 
        'budget' => 'payment', 
        'payment' => 'invoice', 
        'invoice' => null
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
        $conn->query("UPDATE stage_times SET started_at = COALESCE(started_at, '$startTime') 
                      WHERE transaction_id = $transactionId AND stage = '$stage'");
    } else {
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
    
    ensureViewExists();
    
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

/*
 * أضف هذا في api/index.php داخل switch statement:
 
    case 'notifications':
        $limit = (int)($_GET['limit'] ?? 5);
        echo json_encode(['success' => true, 'data' => getRecentNotifications($limit)]);
        break;
*/