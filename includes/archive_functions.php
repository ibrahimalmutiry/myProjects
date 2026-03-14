<?php
/**
 * archive_functions.php
 * دوال نظام الأرشيف المالي
 *
 * الأقسام:
 * ① تهيئة الجداول
 * ② جلب الملفات المؤرشفة
 * ③ رفع وتسجيل الملفات
 * ④ وثائق الصلاحية
 * ⑤ الإحصائيات
 * ⑥ المساعدات
 */

// البحث عن config.php في المجلد الرئيسي أو الأب
$_archiveConfigPaths = [
    __DIR__ . '/../config.php',       // includes/../config.php  ✅
    __DIR__ . '/config.php',
    dirname(__DIR__) . '/config.php',
];
foreach ($_archiveConfigPaths as $_archiveConfigPath) {
    if (file_exists($_archiveConfigPath)) {
        require_once $_archiveConfigPath;
        break;
    }
}
unset($_archiveConfigPaths, $_archiveConfigPath);

// ═══════════════════════════════════════════════════════════════
// ① تهيئة الجداول
// ═══════════════════════════════════════════════════════════════

function ensureArchiveTables() {
    $conn = db();

    // الجدول الرئيسي
    $conn->query("CREATE TABLE IF NOT EXISTS financial_archive (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        file_name       VARCHAR(500) NOT NULL,
        display_name    VARCHAR(500) NOT NULL,
        file_path       VARCHAR(500) NOT NULL,
        file_size       BIGINT DEFAULT 0,
        file_type       VARCHAR(100) DEFAULT NULL,
        file_extension  VARCHAR(20) DEFAULT NULL,
        source_module   ENUM('transactions','correspondence','bank','budget','archive') NOT NULL DEFAULT 'archive',
        source_id       INT DEFAULT NULL,
        source_ref      VARCHAR(255) DEFAULT NULL,
        category        ENUM('معاملة_مالية','خطاب_مراسلة','إيداع_بنكي','موازنة_تخطيط','سجل_تجاري','عقد_اتفاقية','تعميد_تفويض','وثيقة_حكومية','أخرى') NOT NULL DEFAULT 'أخرى',
        tags            TEXT DEFAULT NULL,
        description     TEXT DEFAULT NULL,
        has_expiry      TINYINT(1) DEFAULT 0,
        expiry_date     DATE DEFAULT NULL,
        uploaded_by     INT DEFAULT NULL,
        department_id   INT DEFAULT NULL,
        is_active       TINYINT(1) DEFAULT 1,
        is_manual       TINYINT(1) DEFAULT 0,
        created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_source   (source_module, source_id),
        INDEX idx_category (category),
        INDEX idx_uploader (uploaded_by),
        INDEX idx_dept     (department_id),
        INDEX idx_expiry   (expiry_date),
        INDEX idx_active   (is_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    // جدول وثائق الصلاحية
    $conn->query("CREATE TABLE IF NOT EXISTS archive_expiry_docs (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        archive_id      INT DEFAULT NULL,
        doc_name        VARCHAR(500) NOT NULL,
        doc_number      VARCHAR(255) DEFAULT NULL,
        doc_type        ENUM('سجل_تجاري','عقد_اتفاقية','تعميد_تفويض','وثيقة_حكومية') NOT NULL,
        issuer          VARCHAR(255) DEFAULT NULL,
        issue_date      DATE DEFAULT NULL,
        expiry_date     DATE NOT NULL,
        notify_30       TINYINT(1) DEFAULT 0,
        notify_7        TINYINT(1) DEFAULT 0,
        notify_expired  TINYINT(1) DEFAULT 0,
        notes           TEXT DEFAULT NULL,
        created_by      INT DEFAULT NULL,
        department_id   INT DEFAULT NULL,
        is_active       TINYINT(1) DEFAULT 1,
        created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_expiry   (expiry_date),
        INDEX idx_type     (doc_type),
        INDEX idx_dept     (department_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    // مزامنة المرفقات الموجودة (مرة واحدة فقط)
    syncExistingAttachments();
}

/**
 * مزامنة المرفقات الحالية من الجداول الأخرى
 */
function syncExistingAttachments() {
    $conn = db();

    // مزامنة مرفقات المعاملات
    $checkTx = $conn->query("SHOW TABLES LIKE 'transaction_attachments'");
    if ($checkTx && $checkTx->num_rows > 0) {
        $conn->query("
            INSERT IGNORE INTO financial_archive 
                (file_name, display_name, file_path, file_size, file_extension,
                 source_module, source_id, source_ref, category, uploaded_by, created_at)
            SELECT 
                ta.file_name,
                COALESCE(ta.display_name, ta.file_name),
                ta.file_path,
                COALESCE(ta.file_size, 0),
                LOWER(SUBSTRING_INDEX(ta.file_name, '.', -1)),
                'transactions',
                ta.transaction_id,
                t.transaction_number,
                'معاملة_مالية',
                ta.uploaded_by,
                ta.created_at
            FROM transaction_attachments ta
            LEFT JOIN transactions t ON ta.transaction_id = t.id
            WHERE ta.file_path IS NOT NULL AND ta.file_path != ''
            AND NOT EXISTS (
                SELECT 1 FROM financial_archive fa 
                WHERE fa.source_module = 'transactions' AND fa.file_path = ta.file_path
            )
        ");
    }

    // مزامنة مرفقات الخطابات
    $checkCorr = $conn->query("SHOW TABLES LIKE 'correspondence_attachments'");
    if ($checkCorr && $checkCorr->num_rows > 0) {
        $conn->query("
            INSERT IGNORE INTO financial_archive 
                (file_name, display_name, file_path, file_size, file_type, file_extension,
                 source_module, source_id, source_ref, category, uploaded_by, created_at)
            SELECT 
                ca.file_name,
                COALESCE(ca.original_name, ca.file_name),
                ca.file_path,
                COALESCE(ca.file_size, 0),
                ca.file_type,
                LOWER(SUBSTRING_INDEX(ca.file_name, '.', -1)),
                'correspondence',
                ca.correspondence_id,
                c.correspondence_number,
                'خطاب_مراسلة',
                ca.uploaded_by,
                ca.uploaded_at
            FROM correspondence_attachments ca
            LEFT JOIN correspondence c ON ca.correspondence_id = c.id
            WHERE ca.file_path IS NOT NULL AND ca.file_path != ''
            AND NOT EXISTS (
                SELECT 1 FROM financial_archive fa 
                WHERE fa.source_module = 'correspondence' AND fa.file_path = ca.file_path
            )
        ");
    }
}


// ═══════════════════════════════════════════════════════════════
// ② جلب الملفات المؤرشفة
// ═══════════════════════════════════════════════════════════════

/**
 * جلب الملفات من الأرشيف مع الفلاتر
 */
function getArchiveFiles($filters = [], $userId = null, $userRole = null, $departmentId = null) {
    $conn   = db();
    $where  = ["fa.is_active = 1"];
    $params = [];

    // فلتر الصلاحيات
    if ($userRole !== 'admin' && $userRole !== 'manager') {
        if ($departmentId) {
            $deptId  = (int)$departmentId;
            $where[] = "(fa.department_id = $deptId OR fa.department_id IS NULL)";
        }
    }

    // فلتر البحث
    if (!empty($filters['search'])) {
        $s       = $conn->real_escape_string($filters['search']);
        $where[] = "(fa.display_name LIKE '%$s%' OR fa.source_ref LIKE '%$s%' OR fa.description LIKE '%$s%')";
    }

    // فلتر المصدر
    if (!empty($filters['source_module'])) {
        $sm      = $conn->real_escape_string($filters['source_module']);
        $where[] = "fa.source_module = '$sm'";
    }

    // فلتر التصنيف
    if (!empty($filters['category'])) {
        $cat     = $conn->real_escape_string($filters['category']);
        $where[] = "fa.category = '$cat'";
    }

    // فلتر نوع الملف
    if (!empty($filters['file_extension'])) {
        $ext     = $conn->real_escape_string($filters['file_extension']);
        $where[] = "fa.file_extension = '$ext'";
    }

    // فلتر التاريخ
    if (!empty($filters['date_from'])) {
        $df      = $conn->real_escape_string($filters['date_from']);
        $where[] = "DATE(fa.created_at) >= '$df'";
    }
    if (!empty($filters['date_to'])) {
        $dt      = $conn->real_escape_string($filters['date_to']);
        $where[] = "DATE(fa.created_at) <= '$dt'";
    }

    $whereSQL = implode(' AND ', $where);

    // الترتيب
    $orderMap = [
        'date_desc'  => 'fa.created_at DESC',
        'date_asc'   => 'fa.created_at ASC',
        'name_asc'   => 'fa.display_name ASC',
        'size_desc'  => 'fa.file_size DESC',
    ];
    $order = $orderMap[$filters['order'] ?? ''] ?? 'fa.created_at DESC';

    // الصفحات
    $page    = max(1, (int)($filters['page'] ?? 1));
    $limit   = (int)($filters['limit'] ?? 20);
    $offset  = ($page - 1) * $limit;

    // العدد الكلي
    $countRes = $conn->query("SELECT COUNT(*) as cnt FROM financial_archive fa WHERE $whereSQL");
    $total    = ($countRes) ? $countRes->fetch_assoc()['cnt'] : 0;

    // الجلب
    $sql = "
        SELECT fa.*,
               e.name AS uploader_name,
               d.name AS department_name
        FROM financial_archive fa
        LEFT JOIN employees e ON fa.uploaded_by = e.id
        LEFT JOIN departments d ON fa.department_id = d.id
        WHERE $whereSQL
        ORDER BY $order
        LIMIT $limit OFFSET $offset
    ";

    $result = $conn->query($sql);
    $files  = [];
    if ($result && $result->num_rows > 0) {
        while ($row = $result->fetch_assoc()) {
            $row['file_size_formatted'] = formatFileSize($row['file_size']);
            $row['file_icon']           = getFileIcon($row['file_extension']);
            $row['file_color']          = getFileColor($row['file_extension']);
            $row['source_label']        = getSourceLabel($row['source_module']);
            $row['category_label']      = getCategoryLabel($row['category']);
            $files[] = $row;
        }
    }

    return [
        'files' => $files,
        'total' => (int)$total,
        'page'  => $page,
        'limit' => $limit,
        'pages' => ceil($total / $limit),
    ];
}

/**
 * جلب ملف واحد بالـ ID
 */
function getArchiveFile($id) {
    $conn = db();
    $id   = (int)$id;

    $result = $conn->query("
        SELECT fa.*,
               e.name AS uploader_name,
               d.name AS department_name
        FROM financial_archive fa
        LEFT JOIN employees e ON fa.uploaded_by = e.id
        LEFT JOIN departments d ON fa.department_id = d.id
        WHERE fa.id = $id AND fa.is_active = 1
        LIMIT 1
    ");

    if (!$result || $result->num_rows === 0) return null;
    $row = $result->fetch_assoc();
    $row['file_size_formatted'] = formatFileSize($row['file_size']);
    $row['file_icon']           = getFileIcon($row['file_extension']);
    $row['source_label']        = getSourceLabel($row['source_module']);
    return $row;
}


// ═══════════════════════════════════════════════════════════════
// ③ رفع وتسجيل الملفات
// ═══════════════════════════════════════════════════════════════

/**
 * رفع ملف جديد مباشرة للأرشيف
 */
function uploadToArchive($file, $data, $userId, $departmentId) {
    $conn = db();

    $allowedExt = ['pdf','doc','docx','xls','xlsx','jpg','jpeg','png','gif','txt','csv','zip','rar'];
    $ext        = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));

    if (!in_array($ext, $allowedExt)) {
        return ['success' => false, 'message' => 'نوع الملف غير مسموح به'];
    }

    if ($file['size'] > 50 * 1024 * 1024) {
        return ['success' => false, 'message' => 'حجم الملف يتجاوز الحد المسموح (50 ميجابايت)'];
    }

    // مجلد الأرشيف
    $uploadDir = __DIR__ . '/../uploads/archive/';
    if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);

    $newName  = 'arch_' . time() . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
    $fullPath = $uploadDir . $newName;
    $filePath = 'uploads/archive/' . $newName;

    if (!move_uploaded_file($file['tmp_name'], $fullPath)) {
        return ['success' => false, 'message' => 'فشل في رفع الملف'];
    }

    $displayName  = $conn->real_escape_string($data['display_name'] ?? $file['name']);
    $category     = $conn->real_escape_string($data['category'] ?? 'أخرى');
    $description  = $conn->real_escape_string($data['description'] ?? '');
    $hasExpiry    = !empty($data['expiry_date']) ? 1 : 0;
    $expiryDate   = !empty($data['expiry_date']) ? "'" . $conn->real_escape_string($data['expiry_date']) . "'" : 'NULL';
    $filePathEsc  = $conn->real_escape_string($filePath);
    $fileNameEsc  = $conn->real_escape_string($file['name']);
    $fileSize     = (int)$file['size'];
    $fileType     = $conn->real_escape_string($file['type'] ?? '');
    $extEsc       = $conn->real_escape_string($ext);
    $userId       = (int)$userId;
    $deptId       = $departmentId ? (int)$departmentId : 'NULL';

    $conn->query("
        INSERT INTO financial_archive 
            (file_name, display_name, file_path, file_size, file_type, file_extension,
             source_module, category, description, has_expiry, expiry_date,
             uploaded_by, department_id, is_manual)
        VALUES 
            ('$fileNameEsc', '$displayName', '$filePathEsc', $fileSize, '$fileType', '$extEsc',
             'archive', '$category', '$description', $hasExpiry, $expiryDate,
             $userId, $deptId, 1)
    ");

    $archiveId = $conn->insert_id;

    // إذا كانت وثيقة صلاحية، أضفها لجدول الصلاحيات
    if ($hasExpiry && !empty($data['doc_type'])) {
        addExpiryDoc([
            'archive_id'  => $archiveId,
            'doc_name'    => $data['display_name'] ?? $file['name'],
            'doc_number'  => $data['doc_number'] ?? '',
            'doc_type'    => $data['doc_type'],
            'issuer'      => $data['issuer'] ?? '',
            'issue_date'  => $data['issue_date'] ?? null,
            'expiry_date' => $data['expiry_date'],
            'notes'       => $data['description'] ?? '',
        ], $userId, $departmentId);
    }

    return ['success' => true, 'id' => $archiveId, 'path' => $filePath];
}

/**
 * تسجيل ملف موجود في الأرشيف (من قسم آخر)
 */
function registerToArchive($filePath, $fileName, $displayName, $fileSize, $sourceModule, $sourceId, $sourceRef, $category, $userId, $departmentId) {
    $conn = db();

    // تجنب التكرار
    $fp = $conn->real_escape_string($filePath);
    $check = $conn->query("SELECT id FROM financial_archive WHERE file_path = '$fp' LIMIT 1");
    if ($check && $check->num_rows > 0) return $check->fetch_assoc()['id'];

    $displayName  = $conn->real_escape_string($displayName ?: $fileName);
    $fileName     = $conn->real_escape_string($fileName);
    $sourceModule = $conn->real_escape_string($sourceModule);
    $sourceRef    = $conn->real_escape_string($sourceRef ?? '');
    $category     = $conn->real_escape_string($category);
    $ext          = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
    $extEsc       = $conn->real_escape_string($ext);
    $sourceId     = $sourceId ? (int)$sourceId : 'NULL';
    $fileSize     = (int)$fileSize;
    $userId       = $userId ? (int)$userId : 'NULL';
    $deptId       = $departmentId ? (int)$departmentId : 'NULL';

    $conn->query("
        INSERT INTO financial_archive 
            (file_name, display_name, file_path, file_size, file_extension,
             source_module, source_id, source_ref, category, uploaded_by, department_id)
        VALUES 
            ('$fileName', '$displayName', '$fp', $fileSize, '$extEsc',
             '$sourceModule', $sourceId, '$sourceRef', '$category', $userId, $deptId)
    ");

    return $conn->insert_id;
}

/**
 * حذف ملف من الأرشيف (soft delete)
 */
function deleteArchiveFile($id, $userId) {
    $conn = db();
    $id   = (int)$id;

    $result = $conn->query("SELECT * FROM financial_archive WHERE id = $id LIMIT 1");
    if (!$result || $result->num_rows === 0) return false;
    $file = $result->fetch_assoc();

    // حذف الملف الفعلي فقط إذا رُفع مباشرة للأرشيف
    if ($file['is_manual'] && $file['file_path']) {
        $fullPath = __DIR__ . '/../' . $file['file_path'];
        if (file_exists($fullPath)) @unlink($fullPath);
    }

    $conn->query("UPDATE financial_archive SET is_active = 0 WHERE id = $id");
    return true;
}


// ═══════════════════════════════════════════════════════════════
// ④ وثائق الصلاحية
// ═══════════════════════════════════════════════════════════════

/**
 * جلب وثائق الصلاحية
 */
function getExpiryDocs($filters = [], $userId = null, $userRole = null, $departmentId = null) {
    $conn  = db();
    $where = ["aed.is_active = 1"];

    // فلتر الصلاحيات
    if ($userRole !== 'admin' && $userRole !== 'manager') {
        if ($departmentId) {
            $deptId  = (int)$departmentId;
            $where[] = "(aed.department_id = $deptId OR aed.department_id IS NULL)";
        }
    }

    // فلتر النوع
    if (!empty($filters['doc_type'])) {
        $dt      = $conn->real_escape_string($filters['doc_type']);
        $where[] = "aed.doc_type = '$dt'";
    }

    // فلتر الحالة
    if (!empty($filters['status'])) {
        $today = date('Y-m-d');
        switch ($filters['status']) {
            case 'expired':
                $where[] = "aed.expiry_date < '$today'";
                break;
            case 'soon_7':
                $where[] = "aed.expiry_date >= '$today' AND aed.expiry_date <= DATE_ADD('$today', INTERVAL 7 DAY)";
                break;
            case 'soon_30':
                $where[] = "aed.expiry_date >= '$today' AND aed.expiry_date <= DATE_ADD('$today', INTERVAL 30 DAY)";
                break;
            case 'valid':
                $where[] = "aed.expiry_date > DATE_ADD('$today', INTERVAL 30 DAY)";
                break;
        }
    }

    $whereSQL = implode(' AND ', $where);

    $result = $conn->query("
        SELECT aed.*,
               e.name AS created_by_name,
               d.name AS department_name,
               fa.file_path AS attached_file_path,
               fa.display_name AS attached_file_name,
               DATEDIFF(aed.expiry_date, CURDATE()) AS days_remaining
        FROM archive_expiry_docs aed
        LEFT JOIN employees e ON aed.created_by = e.id
        LEFT JOIN departments d ON aed.department_id = d.id
        LEFT JOIN financial_archive fa ON aed.archive_id = fa.id
        WHERE $whereSQL
        ORDER BY aed.expiry_date ASC
    ");

    $docs = [];
    if ($result && $result->num_rows > 0) {
        while ($row = $result->fetch_assoc()) {
            $row['status']       = getExpiryStatus($row['days_remaining']);
            $row['status_label'] = getExpiryStatusLabel($row['status']);
            $row['status_color'] = getExpiryStatusColor($row['status']);
            $docs[] = $row;
        }
    }
    return $docs;
}

/**
 * إضافة وثيقة صلاحية
 */
function addExpiryDoc($data, $userId, $departmentId) {
    $conn = db();

    $docName    = $conn->real_escape_string($data['doc_name']);
    $docNumber  = $conn->real_escape_string($data['doc_number'] ?? '');
    $docType    = $conn->real_escape_string($data['doc_type']);
    $issuer     = $conn->real_escape_string($data['issuer'] ?? '');
    $issueDate  = !empty($data['issue_date']) ? "'" . $conn->real_escape_string($data['issue_date']) . "'" : 'NULL';
    $expiryDate = $conn->real_escape_string($data['expiry_date']);
    $notes      = $conn->real_escape_string($data['notes'] ?? '');
    $archiveId  = !empty($data['archive_id']) ? (int)$data['archive_id'] : 'NULL';
    $userId     = $userId ? (int)$userId : 'NULL';
    $deptId     = $departmentId ? (int)$departmentId : 'NULL';

    $conn->query("
        INSERT INTO archive_expiry_docs 
            (archive_id, doc_name, doc_number, doc_type, issuer, issue_date, expiry_date, notes, created_by, department_id)
        VALUES 
            ($archiveId, '$docName', '$docNumber', '$docType', '$issuer', $issueDate, '$expiryDate', '$notes', $userId, $deptId)
    ");

    return $conn->insert_id;
}

/**
 * تحديث وثيقة صلاحية
 */
function updateExpiryDoc($id, $data) {
    $conn = db();
    $id   = (int)$id;

    $docName    = $conn->real_escape_string($data['doc_name']);
    $docNumber  = $conn->real_escape_string($data['doc_number'] ?? '');
    $docType    = $conn->real_escape_string($data['doc_type']);
    $issuer     = $conn->real_escape_string($data['issuer'] ?? '');
    $issueDate  = !empty($data['issue_date']) ? "'" . $conn->real_escape_string($data['issue_date']) . "'" : 'NULL';
    $expiryDate = $conn->real_escape_string($data['expiry_date']);
    $notes      = $conn->real_escape_string($data['notes'] ?? '');

    $conn->query("
        UPDATE archive_expiry_docs SET
            doc_name    = '$docName',
            doc_number  = '$docNumber',
            doc_type    = '$docType',
            issuer      = '$issuer',
            issue_date  = $issueDate,
            expiry_date = '$expiryDate',
            notes       = '$notes',
            notify_30   = 0,
            notify_7    = 0,
            notify_expired = 0
        WHERE id = $id
    ");

    return $conn->affected_rows > 0;
}

/**
 * حذف وثيقة صلاحية
 */
function deleteExpiryDoc($id) {
    $conn = db();
    $id   = (int)$id;
    $conn->query("UPDATE archive_expiry_docs SET is_active = 0 WHERE id = $id");
    return $conn->affected_rows > 0;
}


// ═══════════════════════════════════════════════════════════════
// ⑤ الإحصائيات
// ═══════════════════════════════════════════════════════════════

/**
 * إحصائيات الأرشيف
 */
function getArchiveStats($userRole = null, $departmentId = null) {
    $conn  = db();
    $where = "fa.is_active = 1";

    if ($userRole !== 'admin' && $userRole !== 'manager' && $departmentId) {
        $deptId = (int)$departmentId;
        $where .= " AND (fa.department_id = $deptId OR fa.department_id IS NULL)";
    }

    $stats = [];

    // إجمالي الملفات
    $r = $conn->query("SELECT COUNT(*) as cnt, COALESCE(SUM(file_size), 0) as total_size FROM financial_archive fa WHERE $where");
    if ($r) {
        $row = $r->fetch_assoc();
        $stats['total_files']    = (int)$row['cnt'];
        $stats['total_size']     = formatFileSize($row['total_size']);
        $stats['total_size_raw'] = (int)$row['total_size'];
    }

    // توزيع حسب المصدر
    $r = $conn->query("SELECT source_module, COUNT(*) as cnt FROM financial_archive fa WHERE $where GROUP BY source_module");
    $stats['by_source'] = [];
    if ($r) while ($row = $r->fetch_assoc()) $stats['by_source'][$row['source_module']] = (int)$row['cnt'];

    // توزيع حسب نوع الملف
    $r = $conn->query("SELECT COALESCE(file_extension, 'unknown') as ext, COUNT(*) as cnt FROM financial_archive fa WHERE $where GROUP BY file_extension ORDER BY cnt DESC LIMIT 5");
    $stats['by_type'] = [];
    if ($r) while ($row = $r->fetch_assoc()) $stats['by_type'][$row['ext']] = (int)$row['cnt'];

    // إحصائيات الصلاحيات
    $today    = date('Y-m-d');
    $deptWhere = '';
    if ($userRole !== 'admin' && $userRole !== 'manager' && $departmentId) {
        $deptId    = (int)$departmentId;
        $deptWhere = " AND (department_id = $deptId OR department_id IS NULL)";
    }

    $r = $conn->query("SELECT COUNT(*) as cnt FROM archive_expiry_docs WHERE is_active = 1 AND expiry_date < '$today'$deptWhere");
    $stats['expired_docs'] = $r ? (int)$r->fetch_assoc()['cnt'] : 0;

    $r = $conn->query("SELECT COUNT(*) as cnt FROM archive_expiry_docs WHERE is_active = 1 AND expiry_date >= '$today' AND expiry_date <= DATE_ADD('$today', INTERVAL 30 DAY)$deptWhere");
    $stats['expiring_soon'] = $r ? (int)$r->fetch_assoc()['cnt'] : 0;

    $r = $conn->query("SELECT COUNT(*) as cnt FROM archive_expiry_docs WHERE is_active = 1$deptWhere");
    $stats['total_expiry_docs'] = $r ? (int)$r->fetch_assoc()['cnt'] : 0;

    // آخر 30 يوم
    $r = $conn->query("SELECT COUNT(*) as cnt FROM financial_archive fa WHERE $where AND fa.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)");
    $stats['last_30_days'] = $r ? (int)$r->fetch_assoc()['cnt'] : 0;

    return $stats;
}


// ═══════════════════════════════════════════════════════════════
// ⑥ المساعدات
// ═══════════════════════════════════════════════════════════════

function formatFileSize($bytes) {
    if (!$bytes) return '0 ب';
    $units = ['ب', 'ك.ب', 'م.ب', 'ج.ب'];
    $i     = floor(log($bytes, 1024));
    $i     = min($i, count($units) - 1);
    return round($bytes / pow(1024, $i), 1) . ' ' . $units[$i];
}

function getFileIcon($ext) {
    $icons = [
        'pdf'  => 'pdf',
        'doc'  => 'word', 'docx' => 'word',
        'xls'  => 'excel', 'xlsx' => 'excel', 'csv' => 'excel',
        'jpg'  => 'image', 'jpeg' => 'image', 'png' => 'image', 'gif' => 'image', 'webp' => 'image',
        'zip'  => 'archive', 'rar' => 'archive',
        'txt'  => 'text',
        'ppt'  => 'ppt', 'pptx' => 'ppt',
    ];
    return $icons[strtolower($ext)] ?? 'file';
}

function getFileColor($ext) {
    $colors = [
        'pdf'  => '#ff6b6b',
        'doc'  => '#4dabf7', 'docx' => '#4dabf7',
        'xls'  => '#69db7c', 'xlsx' => '#69db7c', 'csv' => '#69db7c',
        'jpg'  => '#ffa94d', 'jpeg' => '#ffa94d', 'png' => '#ffa94d', 'gif' => '#ffa94d',
        'zip'  => '#b197fc', 'rar' => '#b197fc',
        'txt'  => '#948979',
        'ppt'  => '#ff8c42', 'pptx' => '#ff8c42',
    ];
    return $colors[strtolower($ext)] ?? '#948979';
}

function getSourceLabel($module) {
    $labels = [
        'transactions'   => 'معاملة مالية',
        'correspondence' => 'خطاب / مراسلة',
        'bank'           => 'إيداع بنكي',
        'budget'         => 'موازنة / تخطيط',
        'archive'        => 'أرشيف مباشر',
    ];
    return $labels[$module] ?? $module;
}

function getSourceIcon($module) {
    $icons = [
        'transactions'   => '💰',
        'correspondence' => '✉️',
        'bank'           => '🏦',
        'budget'         => '📊',
        'archive'        => '🗂️',
    ];
    return $icons[$module] ?? '📄';
}

function getCategoryLabel($cat) {
    $labels = [
        'معاملة_مالية'  => 'معاملة مالية',
        'خطاب_مراسلة'  => 'خطاب / مراسلة',
        'إيداع_بنكي'   => 'إيداع بنكي',
        'موازنة_تخطيط' => 'موازنة / تخطيط',
        'سجل_تجاري'    => 'سجل تجاري',
        'عقد_اتفاقية'  => 'عقد / اتفاقية',
        'تعميد_تفويض'  => 'تعميد / تفويض',
        'وثيقة_حكومية' => 'وثيقة حكومية',
        'أخرى'         => 'أخرى',
    ];
    return $labels[$cat] ?? $cat;
}

function getExpiryStatus($daysRemaining) {
    if ($daysRemaining === null) return 'unknown';
    $days = (int)$daysRemaining;
    if ($days < 0)   return 'expired';
    if ($days <= 7)  return 'critical';
    if ($days <= 30) return 'warning';
    return 'valid';
}

function getExpiryStatusLabel($status) {
    $labels = [
        'expired'  => 'منتهية الصلاحية',
        'critical' => 'تنتهي خلال 7 أيام',
        'warning'  => 'تنتهي خلال 30 يوم',
        'valid'    => 'سارية المفعول',
        'unknown'  => 'غير محدد',
    ];
    return $labels[$status] ?? $status;
}

function getExpiryStatusColor($status) {
    $colors = [
        'expired'  => 'red',
        'critical' => 'orange',
        'warning'  => 'amber',
        'valid'    => 'green',
        'unknown'  => 'gray',
    ];
    return $colors[$status] ?? 'gray';
}