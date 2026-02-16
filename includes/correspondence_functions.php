<?php
/**
 * دوال نظام الخطابات والمراسلات
 * Correspondence System Functions
 */

// البحث عن config.php في المسارات الممكنة
$configPaths = [
    __DIR__ . '/config.php',
    __DIR__ . '/../config.php',
    __DIR__ . '/includes/config.php',
    __DIR__ . '/../includes/config.php'
];

$configLoaded = false;
foreach ($configPaths as $path) {
    if (file_exists($path)) {
        require_once $path;
        $configLoaded = true;
        break;
    }
}

if (!$configLoaded) {
    die('Error: config.php not found. Please make sure config.php exists in the project directory.');
}

// =====================================================
// دوال الأقسام (Departments)
// =====================================================

/**
 * الحصول على جميع الأقسام
 */
function getAllDepartments($activeOnly = true) {
    $conn = db();
    
    $sql = "SELECT * FROM departments";
    if ($activeOnly) {
        $sql .= " WHERE is_active = 1";
    }
    $sql .= " ORDER BY name ASC";
    
    $result = $conn->query($sql);
    $departments = [];
    
    if ($result && $result->num_rows > 0) {
        while ($row = $result->fetch_assoc()) {
            $departments[] = $row;
        }
    }
    
    return $departments;
}

/**
 * الحصول على قسم واحد
 */
function getDepartment($id) {
    $conn = db();
    $id = (int)$id;
    
    $sql = "SELECT d.*, e.name as manager_name 
            FROM departments d
            LEFT JOIN employees e ON d.manager_id = e.id
            WHERE d.id = $id";
    
    $result = $conn->query($sql);
    
    if ($result && $result->num_rows > 0) {
        return $result->fetch_assoc();
    }
    
    return null;
}

// =====================================================
// دوال المراسلات (Correspondence)
// =====================================================

/**
 * التأكد من وجود الجداول المطلوبة
 */
function ensureCorrespondenceTables() {
    $conn = db();
    
    // التحقق من جدول correspondence
    $result = $conn->query("SHOW TABLES LIKE 'correspondence'");
    if (!$result || $result->num_rows == 0) {
        throw new Exception('جدول correspondence غير موجود. يرجى تنفيذ ملف correspondence_system.sql');
    }
    
    return true;
}

/**
 * توليد رقم مراسلة جديد
 */
function generateCorrespondenceNumber($type) {
    $conn = db();
    
    $year = date('Y');
    
    $typePrefix = [
        'internal_finance' => 'KT-F',
        'internal_general' => 'KT-G',
        'incoming' => 'KT-IN',
        'outgoing' => 'KT-OUT'
    ];
    
    $prefix = $typePrefix[$type] ?? 'KT';
    
    $sql = "SELECT correspondence_number FROM correspondence 
            WHERE correspondence_number LIKE '$prefix-$year-%' 
            ORDER BY id DESC LIMIT 1";
    
    $result = $conn->query($sql);
    
    if ($result && $result->num_rows > 0) {
        $row = $result->fetch_assoc();
        $lastNumber = $row['correspondence_number'];
        
        preg_match('/-(\d+)$/', $lastNumber, $matches);
        $nextNumber = isset($matches[1]) ? (int)$matches[1] + 1 : 1;
    } else {
        $nextNumber = 1;
    }
    
    return sprintf("%s-%s-%04d", $prefix, $year, $nextNumber);
}

/**
 * إضافة مراسلة جديدة
 */
function addCorrespondence($data) {
    $conn = db();
    
    // التأكد من وجود الجداول
    ensureCorrespondenceTables();
    
    // توليد رقم المراسلة
    $correspondenceNumber = generateCorrespondenceNumber($data['type']);
    
    $type = $conn->real_escape_string($data['type']);
    $category = $conn->real_escape_string($data['category'] ?? 'normal');
    $subject = $conn->real_escape_string($data['subject']);
    $content = $conn->real_escape_string($data['content'] ?? '');
    $priority = $conn->real_escape_string($data['priority'] ?? 'normal');
    $correspondenceDate = $conn->real_escape_string($data['correspondence_date'] ?? date('Y-m-d'));
    $deadlineDate = !empty($data['deadline_date']) ? "'" . $conn->real_escape_string($data['deadline_date']) . "'" : 'NULL';
    $isDraft = (int)($data['is_draft'] ?? 0);
    $createdBy = (int)($data['created_by']);
    
    $fromDeptId = !empty($data['from_department_id']) ? (int)$data['from_department_id'] : 'NULL';
    $toDeptId = !empty($data['to_department_id']) ? (int)$data['to_department_id'] : 'NULL';
    $fromExternal = !empty($data['from_external']) ? "'" . $conn->real_escape_string($data['from_external']) . "'" : 'NULL';
    $toExternal = !empty($data['to_external']) ? "'" . $conn->real_escape_string($data['to_external']) . "'" : 'NULL';
    
    $sql = "INSERT INTO correspondence (
        correspondence_number, correspondence_date, type, category, subject, content,
        from_department_id, to_department_id, from_external, to_external,
        priority, deadline_date, is_draft, current_stage, created_by
    ) VALUES (
        '$correspondenceNumber', '$correspondenceDate', '$type', '$category', '$subject', '$content',
        $fromDeptId, $toDeptId, $fromExternal, $toExternal,
        '$priority', $deadlineDate, $isDraft, 'new', $createdBy
    )";
    
    if ($conn->query($sql)) {
        $correspondenceId = $conn->insert_id;
        
        if (!$isDraft) {
            createWorkflowStages($correspondenceId, $type);
            startFirstStage($correspondenceId);
            logCorrespondenceAction($correspondenceId, $createdBy, 'created', null, $correspondenceNumber, 'تم إنشاء خطاب جديد');
        }
        
        return [
            'success' => true,
            'id' => $correspondenceId,
            'correspondence_number' => $correspondenceNumber
        ];
    }
    
    return [
        'success' => false,
        'message' => 'حدث خطأ في إضافة المراسلة: ' . $conn->error
    ];
}

/**
 * إنشاء مراحل سير العمل
 */
function createWorkflowStages($correspondenceId, $type) {
    $conn = db();
    $correspondenceId = (int)$correspondenceId;
    $type = $conn->real_escape_string($type);
    
    $sql = "SELECT * FROM correspondence_workflow_templates 
            WHERE correspondence_type = '$type' AND is_active = 1 
            ORDER BY stage_order ASC";
    
    $result = $conn->query($sql);
    
    if ($result && $result->num_rows > 0) {
        while ($row = $result->fetch_assoc()) {
            $stageName = $conn->real_escape_string($row['stage_name']);
            $stageOrder = (int)$row['stage_order'];
            
            $insertSql = "INSERT INTO correspondence_stages (
                correspondence_id, stage_name, stage_order, status
            ) VALUES (
                $correspondenceId, '$stageName', $stageOrder, 'pending'
            )";
            
            $conn->query($insertSql);
        }
    }
}

/**
 * بدء المرحلة الأولى
 */
function startFirstStage($correspondenceId) {
    $conn = db();
    $correspondenceId = (int)$correspondenceId;
    
    $sql = "SELECT * FROM correspondence_stages 
            WHERE correspondence_id = $correspondenceId 
            ORDER BY stage_order ASC LIMIT 1";
    
    $result = $conn->query($sql);
    
    if ($result && $result->num_rows > 0) {
        $stage = $result->fetch_assoc();
        $stageId = $stage['id'];
        
        $updateSql = "UPDATE correspondence_stages 
                     SET status = 'in_progress', started_at = NOW() 
                     WHERE id = $stageId";
        $conn->query($updateSql);
        
        $stageName = $conn->real_escape_string($stage['stage_name']);
        $updateCorr = "UPDATE correspondence 
                       SET current_stage = '$stageName' 
                       WHERE id = $correspondenceId";
        $conn->query($updateCorr);
    }
}

/**
 * الحصول على جميع المراسلات
 */
function getAllCorrespondence($filters = []) {
    $conn = db();
    
    // التأكد من وجود view
    $viewCheck = $conn->query("SHOW FULL TABLES WHERE Table_type = 'VIEW' AND Tables_in_" . DB_NAME . " = 'v_correspondence_full'");
    
    if ($viewCheck && $viewCheck->num_rows > 0) {
        $sql = "SELECT * FROM v_correspondence_full WHERE 1=1";
    } else {
        // استخدام استعلام مباشر إذا لم يكن VIEW موجوداً
        $sql = "SELECT c.*, 
                df.name as from_dept_name, 
                dt.name as to_dept_name,
                e.name as created_by_name,
                (SELECT COUNT(*) FROM correspondence_attachments WHERE correspondence_id = c.id) as attachments_count,
                (SELECT COUNT(*) FROM correspondence_comments WHERE correspondence_id = c.id) as comments_count
                FROM correspondence c
                LEFT JOIN departments df ON c.from_department_id = df.id
                LEFT JOIN departments dt ON c.to_department_id = dt.id
                LEFT JOIN employees e ON c.created_by = e.id
                WHERE 1=1";
    }
    
    if (!empty($filters['type'])) {
        $type = $conn->real_escape_string($filters['type']);
        $sql .= " AND type = '$type'";
    }
    
    if (!empty($filters['search'])) {
        $search = $conn->real_escape_string($filters['search']);
        $sql .= " AND (correspondence_number LIKE '%$search%' 
                  OR subject LIKE '%$search%' 
                  OR content LIKE '%$search%')";
    }
    
    if (!empty($filters['date_from'])) {
        $dateFrom = $conn->real_escape_string($filters['date_from']);
        $sql .= " AND correspondence_date >= '$dateFrom'";
    }
    
    if (!empty($filters['date_to'])) {
        $dateTo = $conn->real_escape_string($filters['date_to']);
        $sql .= " AND correspondence_date <= '$dateTo'";
    }
    
    if (!empty($filters['priority'])) {
        $priority = $conn->real_escape_string($filters['priority']);
        $sql .= " AND priority = '$priority'";
    }
    
    if (!isset($filters['show_drafts']) || !$filters['show_drafts']) {
        $sql .= " AND is_draft = 0";
    }
    
    $sql .= " ORDER BY created_at DESC";
    
    if (!empty($filters['limit'])) {
        $limit = (int)$filters['limit'];
        $offset = !empty($filters['offset']) ? (int)$filters['offset'] : 0;
        $sql .= " LIMIT $offset, $limit";
    }
    
    $result = $conn->query($sql);
    $correspondence = [];
    
    if ($result && $result->num_rows > 0) {
        while ($row = $result->fetch_assoc()) {
            $correspondence[] = $row;
        }
    }
    
    return $correspondence;
}

/**
 * الحصول على مراسلة واحدة
 */
function getCorrespondence($id) {
    $conn = db();
    $id = (int)$id;
    
    $sql = "SELECT c.*, 
            df.name as from_dept_name, 
            dt.name as to_dept_name,
            e.name as created_by_name
            FROM correspondence c
            LEFT JOIN departments df ON c.from_department_id = df.id
            LEFT JOIN departments dt ON c.to_department_id = dt.id
            LEFT JOIN employees e ON c.created_by = e.id
            WHERE c.id = $id";
    
    $result = $conn->query($sql);
    
    if ($result && $result->num_rows > 0) {
        $correspondence = $result->fetch_assoc();
        $correspondence['stages'] = getCorrespondenceStages($id);
        $correspondence['attachments'] = getCorrespondenceAttachments($id);
        $correspondence['comments'] = getCorrespondenceComments($id);
        $correspondence['attachments_count'] = count($correspondence['attachments']);
        $correspondence['comments_count'] = count($correspondence['comments']);
        
        return $correspondence;
    }
    
    return null;
}

/**
 * الحصول على مراحل المراسلة
 */
function getCorrespondenceStages($correspondenceId) {
    $conn = db();
    $correspondenceId = (int)$correspondenceId;
    
    $sql = "SELECT cs.*, e.name as employee_name, e.role as employee_role
            FROM correspondence_stages cs
            LEFT JOIN employees e ON cs.employee_id = e.id
            WHERE cs.correspondence_id = $correspondenceId
            ORDER BY cs.stage_order ASC";
    
    $result = $conn->query($sql);
    $stages = [];
    
    if ($result && $result->num_rows > 0) {
        while ($row = $result->fetch_assoc()) {
            $stages[] = $row;
        }
    }
    
    return $stages;
}

/**
 * الحصول على المرفقات
 */
function getCorrespondenceAttachments($correspondenceId) {
    $conn = db();
    $correspondenceId = (int)$correspondenceId;
    
    $sql = "SELECT ca.*, e.name as uploaded_by_name
            FROM correspondence_attachments ca
            LEFT JOIN employees e ON ca.uploaded_by = e.id
            WHERE ca.correspondence_id = $correspondenceId
            ORDER BY ca.uploaded_at DESC";
    
    $result = $conn->query($sql);
    $attachments = [];
    
    if ($result && $result->num_rows > 0) {
        while ($row = $result->fetch_assoc()) {
            $attachments[] = $row;
        }
    }
    
    return $attachments;
}

/**
 * الحصول على التعليقات
 */
function getCorrespondenceComments($correspondenceId) {
    $conn = db();
    $correspondenceId = (int)$correspondenceId;
    
    $sql = "SELECT cc.*, e.name as employee_name, e.role as employee_role
            FROM correspondence_comments cc
            LEFT JOIN employees e ON cc.employee_id = e.id
            WHERE cc.correspondence_id = $correspondenceId
            ORDER BY cc.created_at ASC";
    
    $result = $conn->query($sql);
    $comments = [];
    
    if ($result && $result->num_rows > 0) {
        while ($row = $result->fetch_assoc()) {
            $comments[] = $row;
        }
    }
    
    return $comments;
}

/**
 * إضافة تعليق
 */
function addCorrespondenceComment($correspondenceId, $employeeId, $comment, $isInternal = false) {
    $conn = db();
    
    $correspondenceId = (int)$correspondenceId;
    $employeeId = (int)$employeeId;
    $comment = $conn->real_escape_string($comment);
    $isInternal = (int)$isInternal;
    
    $sql = "INSERT INTO correspondence_comments (correspondence_id, employee_id, comment, is_internal)
            VALUES ($correspondenceId, $employeeId, '$comment', $isInternal)";
    
    if ($conn->query($sql)) {
        return ['success' => true, 'id' => $conn->insert_id];
    }
    
    return ['success' => false, 'message' => $conn->error];
}

/**
 * تحديث مرحلة
 */
function updateCorrespondenceStage($stageId, $data) {
    $conn = db();
    $stageId = (int)$stageId;
    
    $currentStage = $conn->query("SELECT * FROM correspondence_stages WHERE id = $stageId")->fetch_assoc();
    
    if (!$currentStage) {
        return ['success' => false, 'message' => 'المرحلة غير موجودة'];
    }
    
    $updates = [];
    
    if (isset($data['status'])) {
        $status = $conn->real_escape_string($data['status']);
        $updates[] = "status = '$status'";
        
        if ($status === 'completed') {
            $updates[] = "completed_at = NOW()";
            
            if ($currentStage['started_at']) {
                $startTime = strtotime($currentStage['started_at']);
                $endTime = time();
                $durationMinutes = round(($endTime - $startTime) / 60);
                $updates[] = "duration_minutes = $durationMinutes";
            }
        }
    }
    
    if (isset($data['employee_id'])) {
        $employeeId = (int)$data['employee_id'];
        $updates[] = "employee_id = $employeeId";
        
        if ($currentStage['status'] === 'pending') {
            $updates[] = "status = 'in_progress'";
            $updates[] = "started_at = NOW()";
        }
    }
    
    if (isset($data['notes'])) {
        $notes = $conn->real_escape_string($data['notes']);
        $updates[] = "notes = '$notes'";
    }
    
    if (isset($data['action_taken'])) {
        $action = $conn->real_escape_string($data['action_taken']);
        $updates[] = "action_taken = '$action'";
    }
    
    if (empty($updates)) {
        return ['success' => false, 'message' => 'لا توجد بيانات للتحديث'];
    }
    
    $sql = "UPDATE correspondence_stages SET " . implode(', ', $updates) . " WHERE id = $stageId";
    
    if ($conn->query($sql)) {
        if (isset($data['status']) && $data['status'] === 'completed') {
            moveToNextStage($currentStage['correspondence_id'], $stageId);
        }
        
        return ['success' => true];
    }
    
    return ['success' => false, 'message' => $conn->error];
}

/**
 * الانتقال للمرحلة التالية
 */
function moveToNextStage($correspondenceId, $currentStageId) {
    $conn = db();
    
    $currentStage = $conn->query("SELECT * FROM correspondence_stages WHERE id = $currentStageId")->fetch_assoc();
    
    if (!$currentStage) return false;
    
    $nextStageOrder = $currentStage['stage_order'] + 1;
    
    $sql = "SELECT * FROM correspondence_stages 
            WHERE correspondence_id = $correspondenceId 
            AND stage_order = $nextStageOrder";
    
    $result = $conn->query($sql);
    
    if ($result && $result->num_rows > 0) {
        $nextStage = $result->fetch_assoc();
        
        $conn->query("UPDATE correspondence_stages 
                     SET status = 'in_progress', started_at = NOW() 
                     WHERE id = " . $nextStage['id']);
        
        $stageName = $conn->real_escape_string($nextStage['stage_name']);
        $conn->query("UPDATE correspondence 
                     SET current_stage = '$stageName' 
                     WHERE id = $correspondenceId");
        
        return true;
    } else {
        $conn->query("UPDATE correspondence 
                     SET current_stage = 'completed' 
                     WHERE id = $correspondenceId");
    }
    
    return false;
}

/**
 * الحصول على إحصائيات الخطابات
 */
function getCorrespondenceStats() {
    $conn = db();
    
    $stats = [
        'total' => 0,
        'internal_finance' => 0,
        'internal_general' => 0,
        'incoming' => 0,
        'outgoing' => 0,
        'urgent' => 0,
        'pending' => 0,
        'in_progress' => 0,
        'completed' => 0,
        'overdue' => 0
    ];
    
    $result = $conn->query("SELECT COUNT(*) as count FROM correspondence WHERE is_draft = 0");
    if ($row = $result->fetch_assoc()) {
        $stats['total'] = (int)$row['count'];
    }
    
    $result = $conn->query("SELECT type, COUNT(*) as count FROM correspondence WHERE is_draft = 0 GROUP BY type");
    while ($row = $result->fetch_assoc()) {
        $stats[$row['type']] = (int)$row['count'];
    }
    
    $result = $conn->query("SELECT COUNT(*) as count FROM correspondence WHERE priority IN ('high', 'urgent') AND is_draft = 0");
    if ($row = $result->fetch_assoc()) {
        $stats['urgent'] = (int)$row['count'];
    }
    
    $result = $conn->query("SELECT COUNT(*) as count FROM correspondence WHERE current_stage != 'completed' AND is_draft = 0");
    if ($row = $result->fetch_assoc()) {
        $stats['pending'] = (int)$row['count'];
    }
    
    $result = $conn->query("SELECT COUNT(*) as count FROM correspondence WHERE current_stage = 'completed' AND is_draft = 0");
    if ($row = $result->fetch_assoc()) {
        $stats['completed'] = (int)$row['count'];
    }
    
    $result = $conn->query("SELECT COUNT(*) as count FROM correspondence 
                           WHERE deadline_date < CURDATE() 
                           AND current_stage != 'completed' 
                           AND is_draft = 0");
    if ($row = $result->fetch_assoc()) {
        $stats['overdue'] = (int)$row['count'];
    }
    
    return $stats;
}

/**
 * تسجيل إجراء في سجل التدقيق
 */
function logCorrespondenceAction($correspondenceId, $employeeId, $action, $oldValue = null, $newValue = null, $description = null) {
    $conn = db();
    
    $correspondenceId = (int)$correspondenceId;
    $employeeId = (int)$employeeId;
    $action = $conn->real_escape_string($action);
    $oldValue = $oldValue ? "'" . $conn->real_escape_string($oldValue) . "'" : 'NULL';
    $newValue = $newValue ? "'" . $conn->real_escape_string($newValue) . "'" : 'NULL';
    $description = $description ? "'" . $conn->real_escape_string($description) . "'" : 'NULL';
    
    $ipAddress = $_SERVER['REMOTE_ADDR'] ?? null;
    $userAgent = $_SERVER['HTTP_USER_AGENT'] ?? null;
    
    $sql = "INSERT INTO correspondence_audit_log 
            (correspondence_id, employee_id, action, old_value, new_value, description, ip_address, user_agent)
            VALUES ($correspondenceId, $employeeId, '$action', $oldValue, $newValue, $description, 
                    '" . $conn->real_escape_string($ipAddress) . "', 
                    '" . $conn->real_escape_string($userAgent) . "')";
    
    $conn->query($sql);
}

/**
 * الحصول على الخطابات العاجلة
 */
function getUrgentCorrespondence() {
    $conn = db();
    
    $sql = "SELECT c.*, 
            df.name as from_dept_name, 
            dt.name as to_dept_name
            FROM correspondence c
            LEFT JOIN departments df ON c.from_department_id = df.id
            LEFT JOIN departments dt ON c.to_department_id = dt.id
            WHERE c.priority IN ('high', 'urgent') 
            AND c.current_stage != 'completed'
            AND c.is_draft = 0
            ORDER BY 
                CASE c.priority 
                    WHEN 'urgent' THEN 1
                    WHEN 'high' THEN 2
                    ELSE 3
                END,
                c.deadline_date ASC,
                c.created_at DESC
            LIMIT 10";
    
    $result = $conn->query($sql);
    $correspondence = [];
    
    if ($result && $result->num_rows > 0) {
        while ($row = $result->fetch_assoc()) {
            $correspondence[] = $row;
        }
    }
    
    return $correspondence;
}

/**
 * الحصول على القوالب
 */
function getCorrespondenceTemplates($type = null) {
    $conn = db();
    
    $sql = "SELECT * FROM correspondence_templates WHERE is_public = 1";
    
    if ($type) {
        $type = $conn->real_escape_string($type);
        $sql .= " AND correspondence_type = '$type'";
    }
    
    $sql .= " ORDER BY usage_count DESC, template_name ASC";
    
    $result = $conn->query($sql);
    $templates = [];
    
    if ($result && $result->num_rows > 0) {
        while ($row = $result->fetch_assoc()) {
            $templates[] = $row;
        }
    }
    
    return $templates;
}

/**
 * رفع مرفق
 */
function uploadCorrespondenceAttachment($correspondenceId, $file, $uploadedBy) {
    $conn = db();
    
    // البحث عن مجلد المرفقات
    $uploadPaths = [
        __DIR__ . '/uploads/correspondence/',
        __DIR__ . '/../uploads/correspondence/',
    ];
    
    $uploadDir = null;
    foreach ($uploadPaths as $path) {
        if (is_dir($path)) {
            $uploadDir = $path;
            break;
        }
    }
    
    if (!$uploadDir) {
        // محاولة إنشاء المجلد
        $uploadDir = __DIR__ . '/uploads/correspondence/';
        if (!is_dir($uploadDir)) {
            mkdir($uploadDir, 0755, true);
        }
    }
    
    $originalName = basename($file['name']);
    $fileSize = $file['size'];
    $fileType = $file['type'];
    
    $extension = pathinfo($originalName, PATHINFO_EXTENSION);
    $fileName = uniqid('corr_' . $correspondenceId . '_') . '.' . $extension;
    $filePath = $uploadDir . $fileName;
    
    if (move_uploaded_file($file['tmp_name'], $filePath)) {
        $sql = "INSERT INTO correspondence_attachments 
                (correspondence_id, file_name, original_name, file_path, file_type, file_size, uploaded_by)
                VALUES (
                    $correspondenceId,
                    '" . $conn->real_escape_string($fileName) . "',
                    '" . $conn->real_escape_string($originalName) . "',
                    '" . $conn->real_escape_string($filePath) . "',
                    '" . $conn->real_escape_string($fileType) . "',
                    $fileSize,
                    $uploadedBy
                )";
        
        if ($conn->query($sql)) {
            return [
                'success' => true,
                'id' => $conn->insert_id,
                'file_name' => $fileName,
                'original_name' => $originalName
            ];
        }
    }
    
    return ['success' => false, 'message' => 'فشل رفع الملف'];
}