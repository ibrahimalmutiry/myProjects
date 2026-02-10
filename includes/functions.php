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
    
    // إنشاء View مع الموازنة
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
    
    $transactionNumber = generateTransactionNumber();
    $date = $conn->real_escape_string($data['date']);
    $typeId = (int)$data['type_id'];
    $description = $conn->real_escape_string($data['description']);
    $amount = (float)$data['amount'];
    
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
    
    $sql = "INSERT INTO transactions (transaction_number, transaction_date, type_id, description, amount, attachment, attachment_name) 
            VALUES ('$transactionNumber', '$date', $typeId, '$description', $amount, $attachment, $attachmentName)";
    
    if ($conn->query($sql)) {
        $transactionId = $conn->insert_id;
        
        // إنشاء سجلات فارغة للمراحل الأربع
        $conn->query("INSERT INTO receiving_data (transaction_id) VALUES ($transactionId)");
        $conn->query("INSERT INTO budget_data (transaction_id) VALUES ($transactionId)");
        $conn->query("INSERT INTO payment_data (transaction_id) VALUES ($transactionId)");
        $conn->query("INSERT INTO invoice_data (transaction_id) VALUES ($transactionId)");
        
        // تسجيل النشاط
        logActivity($transactionId, 'إنشاء', 'تم إنشاء المعاملة');
        
        return $transactionId;
    }
    
    return false;
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
    $employeeId = !empty($data['employee_id']) ? (int)$data['employee_id'] : 'NULL';
    $date = !empty($data['date']) ? "'" . $conn->real_escape_string($data['date']) . "'" : 'NULL';
    $status = $conn->real_escape_string($data['status']);
    $notes = $conn->real_escape_string($data['notes'] ?? '');
    
    $sql = "UPDATE receiving_data SET 
            employee_id = $employeeId,
            receive_date = $date,
            status = '$status',
            notes = '$notes'
            WHERE transaction_id = $transactionId";
    
    if ($conn->query($sql)) {
        // تسجيل وقت المرحلة
        $empId = !empty($data['employee_id']) ? (int)$data['employee_id'] : null;
        recordStageTime($transactionId, 'receiving', $empId, $status);
        
        logActivity($transactionId, 'تحديث الاستلام', "تم تحديث حالة الاستلام إلى: $status");
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
    $employeeId = !empty($data['employee_id']) ? (int)$data['employee_id'] : 'NULL';
    $date = !empty($data['date']) ? "'" . $conn->real_escape_string($data['date']) . "'" : 'NULL';
    $status = $conn->real_escape_string($data['status'] ?? 'معلق');
    $budgetCode = $conn->real_escape_string($data['budget_code'] ?? '');
    $notes = $conn->real_escape_string($data['notes'] ?? '');
    
    $sql = "UPDATE budget_data SET 
            employee_id = $employeeId,
            review_date = $date,
            budget_status = '$status',
            budget_code = '$budgetCode',
            notes = '$notes'
            WHERE transaction_id = $transactionId";
    
    if ($conn->query($sql)) {
        // تسجيل وقت المرحلة
        $empId = !empty($data['employee_id']) ? (int)$data['employee_id'] : null;
        recordStageTime($transactionId, 'budget', $empId, $status);
        
        logActivity($transactionId, 'تحديث الموازنة', "تم تحديث حالة الموازنة إلى: $status");
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
    $employeeId = !empty($data['employee_id']) ? (int)$data['employee_id'] : 'NULL';
    $date = !empty($data['date']) ? "'" . $conn->real_escape_string($data['date']) . "'" : 'NULL';
    $method = !empty($data['method']) ? "'" . $conn->real_escape_string($data['method']) . "'" : 'NULL';
    $status = $conn->real_escape_string($data['status']);
    $reference = $conn->real_escape_string($data['reference'] ?? '');
    $notes = $conn->real_escape_string($data['notes'] ?? '');
    
    $sql = "UPDATE payment_data SET 
            employee_id = $employeeId,
            payment_date = $date,
            payment_method = $method,
            status = '$status',
            reference_number = '$reference',
            notes = '$notes'
            WHERE transaction_id = $transactionId";
    
    if ($conn->query($sql)) {
        // تسجيل وقت المرحلة
        $empId = !empty($data['employee_id']) ? (int)$data['employee_id'] : null;
        recordStageTime($transactionId, 'payment', $empId, $status);
        
        logActivity($transactionId, 'تحديث الدفع', "تم تحديث حالة الدفع إلى: $status");
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
    $employeeId = !empty($data['employee_id']) ? (int)$data['employee_id'] : 'NULL';
    $invoiceNumber = $conn->real_escape_string($data['invoice_number'] ?? '');
    $date = !empty($data['date']) ? "'" . $conn->real_escape_string($data['date']) . "'" : 'NULL';
    $status = !empty($data['status']) ? "'" . $conn->real_escape_string($data['status']) . "'" : 'NULL';
    $alertType = $conn->real_escape_string($data['alert_type'] ?? 'انتظار');
    $notes = $conn->real_escape_string($data['notes'] ?? '');
    
    $sql = "UPDATE invoice_data SET 
            employee_id = $employeeId,
            invoice_number = '$invoiceNumber',
            invoice_date = $date,
            status = $status,
            alert_type = '$alertType',
            notes = '$notes'
            WHERE transaction_id = $transactionId";
    
    if ($conn->query($sql)) {
        // تسجيل وقت المرحلة
        $empId = !empty($data['employee_id']) ? (int)$data['employee_id'] : null;
        $statusText = !empty($data['status']) ? $data['status'] : $alertType;
        recordStageTime($transactionId, 'invoice', $empId, $statusText);
        
        logActivity($transactionId, 'تحديث الفوترة', "تم تحديث حالة الفوترة، التنبيه: $alertType");
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
                stage ENUM('receiving', 'budget', 'payment', 'invoice') NOT NULL,
                employee_id INT,
                started_at DATETIME,
                completed_at DATETIME,
                duration_minutes INT DEFAULT NULL,
                status VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
                UNIQUE KEY unique_stage (transaction_id, stage)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ");
        
        // إضافة سجلات للمعاملات الموجودة
        $conn->query("
            INSERT IGNORE INTO stage_times (transaction_id, stage)
            SELECT t.id, s.stage
            FROM transactions t
            CROSS JOIN (
                SELECT 'receiving' as stage UNION ALL
                SELECT 'budget' UNION ALL
                SELECT 'payment' UNION ALL
                SELECT 'invoice'
            ) s
        ");
    }
}

/**
 * تسجيل وقت بدء/انتهاء مرحلة
 */
function recordStageTime($transactionId, $stage, $employeeId, $status) {
    $conn = db();
    ensureStageTimesTable();
    
    $transactionId = (int)$transactionId;
    $stage = $conn->real_escape_string($stage);
    $employeeId = $employeeId ? (int)$employeeId : 'NULL';
    $status = $conn->real_escape_string($status);
    $now = date('Y-m-d H:i:s');
    
    // التحقق من وجود سجل
    $result = $conn->query("SELECT * FROM stage_times WHERE transaction_id = $transactionId AND stage = '$stage'");
    
    if ($result && $result->num_rows > 0) {
        $row = $result->fetch_assoc();
        
        // تحديد ما إذا كانت المرحلة مكتملة
        $isCompleted = in_array($status, ['مستلم', 'معتمد', 'تم الدفع', 'صدرت الفاتورة', 'مكتمل']);
        
        if ($isCompleted && empty($row['completed_at'])) {
            // تسجيل وقت الانتهاء وحساب المدة
            $startedAt = $row['started_at'] ?? $now;
            $duration = "TIMESTAMPDIFF(MINUTE, '$startedAt', '$now')";
            
            $sql = "UPDATE stage_times SET 
                    employee_id = $employeeId,
                    completed_at = '$now',
                    duration_minutes = $duration,
                    status = '$status'
                    WHERE transaction_id = $transactionId AND stage = '$stage'";
        } else if (empty($row['started_at'])) {
            // تسجيل وقت البدء
            $sql = "UPDATE stage_times SET 
                    employee_id = $employeeId,
                    started_at = '$now',
                    status = '$status'
                    WHERE transaction_id = $transactionId AND stage = '$stage'";
        } else {
            // تحديث الحالة فقط
            $sql = "UPDATE stage_times SET 
                    employee_id = $employeeId,
                    status = '$status'
                    WHERE transaction_id = $transactionId AND stage = '$stage'";
        }
    } else {
        // إنشاء سجل جديد
        $sql = "INSERT INTO stage_times (transaction_id, stage, employee_id, started_at, status) 
                VALUES ($transactionId, '$stage', $employeeId, '$now', '$status')";
    }
    
    return $conn->query($sql);
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