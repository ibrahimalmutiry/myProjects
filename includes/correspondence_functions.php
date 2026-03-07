<?php
/**
 * correspondence_functions.php
 * دوال نظام الخطابات والمراسلات
 *
 * الأقسام:
 * ① تهيئة وتحميل الإعدادات
 * ② الأقسام (Departments)
 * ③ المراسلات — قراءة (قائمة / مراسلة واحدة / مراحل / مرفقات / تعليقات)
 * ④ المراسلات — إنشاء وإدارة سير العمل
 * ⑤ المراسلات — تحديث المراحل والتعليقات
 * ⑥ إحصاءات ومعلومات للواجهة
 * ⑦ المرفقات
 * ⑧ القوالب
 * ⑨ سجل التدقيق
 */


// ═══════════════════════════════════════════════════════════════
// ① تهيئة وتحميل الإعدادات
// ═══════════════════════════════════════════════════════════════

$configPaths = [
    __DIR__ . '/config.php',
    __DIR__ . '/../config.php',
    __DIR__ . '/includes/config.php',
    __DIR__ . '/../includes/config.php',
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

/**
 * التأكد من وجود الجداول المطلوبة
 */
function ensureCorrespondenceTables() {
    $conn   = db();
    $result = $conn->query("SHOW TABLES LIKE 'correspondence'");
    if (!$result || $result->num_rows == 0) {
        throw new Exception('جدول correspondence غير موجود. يرجى تنفيذ ملف correspondence_system.sql');
    }
    return true;
}


// ═══════════════════════════════════════════════════════════════
// ② الأقسام (Departments)
// ═══════════════════════════════════════════════════════════════

/**
 * الحصول على جميع الأقسام
 */
function getAllDepartments($activeOnly = true) {
    $conn = db();

    $sql = "SELECT * FROM departments";
    if ($activeOnly) $sql .= " WHERE is_active = 1";
    $sql .= " ORDER BY name ASC";

    $result      = $conn->query($sql);
    $departments = [];
    if ($result && $result->num_rows > 0) {
        while ($row = $result->fetch_assoc()) $departments[] = $row;
    }
    return $departments;
}

/**
 * الحصول على قسم واحد مع اسم مديره
 */
function getDepartment($id) {
    $conn = db();
    $id   = (int)$id;

    $sql = "SELECT d.*, e.name AS manager_name
            FROM departments d
            LEFT JOIN employees e ON d.manager_id = e.id
            WHERE d.id = $id";

    $result = $conn->query($sql);
    return ($result && $result->num_rows > 0) ? $result->fetch_assoc() : null;
}


// ═══════════════════════════════════════════════════════════════
// ③ المراسلات — قراءة
// ═══════════════════════════════════════════════════════════════

/**
 * الحصول على جميع المراسلات (مع فلترة)
 */
function getAllCorrespondence($filters = []) {
    $conn = db();

    $viewCheck = $conn->query("SHOW FULL TABLES WHERE Table_type = 'VIEW' AND Tables_in_" . DB_NAME . " = 'v_correspondence_full'");

    if ($viewCheck && $viewCheck->num_rows > 0) {
        $sql = "SELECT * FROM v_correspondence_full WHERE 1=1";
    } else {
        $sql = "SELECT c.*,
                    df.name AS from_dept_name,
                    dt.name AS to_dept_name,
                    e.name  AS created_by_name,
                    (SELECT COUNT(*) FROM correspondence_attachments WHERE correspondence_id = c.id) AS attachments_count,
                    (SELECT COUNT(*) FROM correspondence_comments   WHERE correspondence_id = c.id) AS comments_count
                FROM correspondence c
                LEFT JOIN departments df ON c.from_department_id = df.id
                LEFT JOIN departments dt ON c.to_department_id   = dt.id
                LEFT JOIN employees e   ON c.created_by          = e.id
                WHERE 1=1";
    }

    if (!empty($filters['type'])) {
        $sql .= " AND type = '" . $conn->real_escape_string($filters['type']) . "'";
    }
    if (!empty($filters['search'])) {
        $s    = $conn->real_escape_string($filters['search']);
        $sql .= " AND (correspondence_number LIKE '%$s%' OR subject LIKE '%$s%' OR content LIKE '%$s%')";
    }
    if (!empty($filters['date_from'])) {
        $sql .= " AND correspondence_date >= '" . $conn->real_escape_string($filters['date_from']) . "'";
    }
    if (!empty($filters['date_to'])) {
        $sql .= " AND correspondence_date <= '" . $conn->real_escape_string($filters['date_to']) . "'";
    }
    if (!empty($filters['priority'])) {
        $sql .= " AND priority = '" . $conn->real_escape_string($filters['priority']) . "'";
    }
    if (!isset($filters['show_drafts']) || !$filters['show_drafts']) {
        $sql .= " AND is_draft = 0";
    }

    $sql .= " ORDER BY created_at DESC";

    if (!empty($filters['limit'])) {
        $limit  = (int)$filters['limit'];
        $offset = (int)($filters['offset'] ?? 0);
        $sql   .= " LIMIT $offset, $limit";
    }

    $result          = $conn->query($sql);
    $correspondence  = [];
    if ($result && $result->num_rows > 0) {
        while ($row = $result->fetch_assoc()) $correspondence[] = $row;
    }
    return $correspondence;
}

/**
 * الحصول على مراسلة واحدة مع مراحلها ومرفقاتها وتعليقاتها
 */
function getCorrespondence($id) {
    $conn = db();
    $id   = (int)$id;

    $sql = "SELECT c.*,
                df.name AS from_dept_name,
                dt.name AS to_dept_name,
                e.name  AS created_by_name
            FROM correspondence c
            LEFT JOIN departments df ON c.from_department_id = df.id
            LEFT JOIN departments dt ON c.to_department_id   = dt.id
            LEFT JOIN employees e   ON c.created_by          = e.id
            WHERE c.id = $id";

    $result = $conn->query($sql);
    if (!$result || $result->num_rows === 0) return null;

    $correspondence = $result->fetch_assoc();
    $correspondence['stages']           = getCorrespondenceStages($id);
    $correspondence['attachments']      = getCorrespondenceAttachments($id);
    $correspondence['comments']         = getCorrespondenceComments($id);
    $correspondence['attachments_count']= count($correspondence['attachments']);
    $correspondence['comments_count']   = count($correspondence['comments']);

    return $correspondence;
}

/**
 * جلب مراحل مراسلة
 */
function getCorrespondenceStages($correspondenceId) {
    $conn             = db();
    $correspondenceId = (int)$correspondenceId;

    $sql = "SELECT cs.*, e.name AS employee_name, e.role AS employee_role
            FROM correspondence_stages cs
            LEFT JOIN employees e ON cs.employee_id = e.id
            WHERE cs.correspondence_id = $correspondenceId
            ORDER BY cs.stage_order ASC";

    $result = $conn->query($sql);
    $stages = [];
    if ($result && $result->num_rows > 0) {
        while ($row = $result->fetch_assoc()) $stages[] = $row;
    }
    return $stages;
}

/**
 * جلب مرفقات مراسلة
 */
function getCorrespondenceAttachments($correspondenceId) {
    $conn             = db();
    $correspondenceId = (int)$correspondenceId;

    $sql = "SELECT ca.*, e.name AS uploaded_by_name
            FROM correspondence_attachments ca
            LEFT JOIN employees e ON ca.uploaded_by = e.id
            WHERE ca.correspondence_id = $correspondenceId
            ORDER BY ca.uploaded_at DESC";

    $result      = $conn->query($sql);
    $attachments = [];
    if ($result && $result->num_rows > 0) {
        while ($row = $result->fetch_assoc()) $attachments[] = $row;
    }
    return $attachments;
}

/**
 * جلب تعليقات مراسلة
 */
function getCorrespondenceComments($correspondenceId) {
    $conn             = db();
    $correspondenceId = (int)$correspondenceId;

    $sql = "SELECT cc.*, e.name AS employee_name, e.role AS employee_role
            FROM correspondence_comments cc
            LEFT JOIN employees e ON cc.employee_id = e.id
            WHERE cc.correspondence_id = $correspondenceId
            ORDER BY cc.created_at ASC";

    $result   = $conn->query($sql);
    $comments = [];
    if ($result && $result->num_rows > 0) {
        while ($row = $result->fetch_assoc()) $comments[] = $row;
    }
    return $comments;
}


// ═══════════════════════════════════════════════════════════════
// ④ المراسلات — إنشاء وإدارة سير العمل
// ═══════════════════════════════════════════════════════════════

/**
 * توليد رقم مراسلة جديد حسب النوع
 */
function generateCorrespondenceNumber($type) {
    $conn = db();
    $year = date('Y');

    $typePrefix = [
        'internal_finance' => 'KT-F',
        'internal_general' => 'KT-G',
        'incoming'         => 'KT-IN',
        'outgoing'         => 'KT-OUT',
    ];
    $prefix = $typePrefix[$type] ?? 'KT';

    $result = $conn->query("SELECT correspondence_number FROM correspondence
                            WHERE correspondence_number LIKE '$prefix-$year-%'
                            ORDER BY id DESC LIMIT 1");

    if ($result && $result->num_rows > 0) {
        $lastNumber = $result->fetch_assoc()['correspondence_number'];
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
    ensureCorrespondenceTables();

    $correspondenceNumber = generateCorrespondenceNumber($data['type']);

    $type               = $conn->real_escape_string($data['type']);
    $category           = $conn->real_escape_string($data['category']           ?? 'normal');
    $subject            = $conn->real_escape_string($data['subject']);
    $content            = $conn->real_escape_string($data['content']            ?? '');
    $priority           = $conn->real_escape_string($data['priority']           ?? 'normal');
    $correspondenceDate = $conn->real_escape_string($data['correspondence_date'] ?? date('Y-m-d'));
    $deadlineDate       = !empty($data['deadline_date'])
                            ? "'" . $conn->real_escape_string($data['deadline_date']) . "'"
                            : 'NULL';
    $isDraft    = (int)($data['is_draft']    ?? 0);
    $createdBy  = (int)($data['created_by']);
    $fromDeptId = !empty($data['from_department_id']) ? (int)$data['from_department_id'] : 'NULL';
    $toDeptId   = !empty($data['to_department_id'])   ? (int)$data['to_department_id']   : 'NULL';
    $fromExt    = !empty($data['from_external']) ? "'" . $conn->real_escape_string($data['from_external']) . "'" : 'NULL';
    $toExt      = !empty($data['to_external'])   ? "'" . $conn->real_escape_string($data['to_external'])   . "'" : 'NULL';

    $sql = "INSERT INTO correspondence (
                correspondence_number, correspondence_date, type, category, subject, content,
                from_department_id, to_department_id, from_external, to_external,
                priority, deadline_date, is_draft, current_stage, created_by
            ) VALUES (
                '$correspondenceNumber', '$correspondenceDate', '$type', '$category', '$subject', '$content',
                $fromDeptId, $toDeptId, $fromExt, $toExt,
                '$priority', $deadlineDate, $isDraft, 'new', $createdBy
            )";

    if ($conn->query($sql)) {
        $correspondenceId = $conn->insert_id;

        if (!$isDraft) {
            createWorkflowStages($correspondenceId, $type);
            startFirstStage($correspondenceId);
            logCorrespondenceAction($correspondenceId, $createdBy, 'created', null, $correspondenceNumber, 'تم إنشاء خطاب جديد');
        }

        return ['success' => true, 'id' => $correspondenceId, 'correspondence_number' => $correspondenceNumber];
    }

    return ['success' => false, 'message' => 'حدث خطأ في إضافة المراسلة: ' . $conn->error];
}

/**
 * إنشاء مراحل سير العمل من القوالب
 */
function createWorkflowStages($correspondenceId, $type) {
    $conn             = db();
    $correspondenceId = (int)$correspondenceId;
    $type             = $conn->real_escape_string($type);

    $result = $conn->query("SELECT * FROM correspondence_workflow_templates
                            WHERE correspondence_type = '$type' AND is_active = 1
                            ORDER BY stage_order ASC");

    if ($result && $result->num_rows > 0) {
        while ($row = $result->fetch_assoc()) {
            $stageName  = $conn->real_escape_string($row['stage_name']);
            $stageOrder = (int)$row['stage_order'];
            $stageKey   = 'stage_' . $stageOrder;
            $conn->query("INSERT INTO correspondence_stages (correspondence_id, stage, stage_name, stage_order, status)
                          VALUES ($correspondenceId, '$stageKey', '$stageName', $stageOrder, 'pending')");
        }
    }
}

/**
 * بدء المرحلة الأولى من سير العمل
 */
function startFirstStage($correspondenceId) {
    $conn             = db();
    $correspondenceId = (int)$correspondenceId;

    $result = $conn->query("SELECT * FROM correspondence_stages
                            WHERE correspondence_id = $correspondenceId
                            ORDER BY stage_order ASC LIMIT 1");

    if ($result && $result->num_rows > 0) {
        $stage   = $result->fetch_assoc();
        $stageId = $stage['id'];

        $conn->query("UPDATE correspondence_stages SET status = 'in_progress', started_at = NOW() WHERE id = $stageId");

        $stageName = $conn->real_escape_string($stage['stage_name']);
        $conn->query("UPDATE correspondence SET current_stage = '$stageName' WHERE id = $correspondenceId");
    }
}

/**
 * الانتقال للمرحلة التالية (أو وضع علامة اكتمال)
 */
function moveToNextStage($correspondenceId, $currentStageId) {
    $conn         = db();
    $currentStage = $conn->query("SELECT * FROM correspondence_stages WHERE id = $currentStageId")->fetch_assoc();
    if (!$currentStage) return false;

    $nextStageOrder = $currentStage['stage_order'] + 1;
    $result         = $conn->query("SELECT * FROM correspondence_stages
                                    WHERE correspondence_id = $correspondenceId
                                      AND stage_order = $nextStageOrder");

    if ($result && $result->num_rows > 0) {
        $nextStage = $result->fetch_assoc();
        $conn->query("UPDATE correspondence_stages SET status = 'in_progress', started_at = NOW() WHERE id = " . $nextStage['id']);
        $stageName = $conn->real_escape_string($nextStage['stage_name']);
        $conn->query("UPDATE correspondence SET current_stage = '$stageName' WHERE id = $correspondenceId");
        return true;
    }

    $conn->query("UPDATE correspondence SET current_stage = 'completed' WHERE id = $correspondenceId");
    return false;
}


// ═══════════════════════════════════════════════════════════════
// ⑤ المراسلات — تحديث المراحل والتعليقات
// ═══════════════════════════════════════════════════════════════

/**
 * تحديث مرحلة مراسلة
 */
function updateCorrespondenceStage($stageId, $data) {
    $conn    = db();
    $stageId = (int)$stageId;

    $currentStage = $conn->query("SELECT * FROM correspondence_stages WHERE id = $stageId")->fetch_assoc();
    if (!$currentStage) return ['success' => false, 'message' => 'المرحلة غير موجودة'];

    $updates = [];

    if (isset($data['status'])) {
        $status    = $conn->real_escape_string($data['status']);
        $updates[] = "status = '$status'";

        if ($status === 'completed') {
            $updates[] = "completed_at = NOW()";
            if ($currentStage['started_at']) {
                $durationMinutes = round((time() - strtotime($currentStage['started_at'])) / 60);
                $updates[] = "duration_minutes = $durationMinutes";
            }
        }
    }

    if (isset($data['employee_id'])) {
        $employeeId = (int)$data['employee_id'];
        $updates[]  = "employee_id = $employeeId";
        if ($currentStage['status'] === 'pending') {
            $updates[] = "status = 'in_progress'";
            $updates[] = "started_at = NOW()";
        }
    }

    if (isset($data['notes'])) {
        $updates[] = "notes = '" . $conn->real_escape_string($data['notes']) . "'";
    }

    if (isset($data['action_taken'])) {
        $updates[] = "action_type = '" . $conn->real_escape_string($data['action_taken']) . "'";
    }

    if (empty($updates)) return ['success' => false, 'message' => 'لا توجد بيانات للتحديث'];

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
 * إضافة تعليق على مراسلة
 */
function addCorrespondenceComment($correspondenceId, $employeeId, $comment, $isInternal = false) {
    $conn             = db();
    $correspondenceId = (int)$correspondenceId;
    $employeeId       = (int)$employeeId;
    $comment          = $conn->real_escape_string($comment);
    $isInternal       = (int)$isInternal;

    $sql = "INSERT INTO correspondence_comments (correspondence_id, employee_id, comment, is_internal)
            VALUES ($correspondenceId, $employeeId, '$comment', $isInternal)";

    if ($conn->query($sql)) return ['success' => true, 'id' => $conn->insert_id];
    return ['success' => false, 'message' => $conn->error];
}


// ═══════════════════════════════════════════════════════════════
// ⑥ إحصاءات ومعلومات للواجهة
// ═══════════════════════════════════════════════════════════════

/**
 * إحصاءات الخطابات
 */
function getCorrespondenceStats() {
    $conn  = db();
    $stats = [
        'total'            => 0, 'internal_finance' => 0,
        'internal_general' => 0, 'incoming'          => 0,
        'outgoing'         => 0, 'urgent'             => 0,
        'pending'          => 0, 'in_progress'        => 0,
        'completed'        => 0, 'overdue'            => 0,
    ];

    $r = $conn->query("SELECT COUNT(*) AS count FROM correspondence WHERE is_draft = 0");
    if ($row = $r->fetch_assoc()) $stats['total'] = (int)$row['count'];

    $r = $conn->query("SELECT type, COUNT(*) AS count FROM correspondence WHERE is_draft = 0 GROUP BY type");
    while ($row = $r->fetch_assoc()) $stats[$row['type']] = (int)$row['count'];

    $r = $conn->query("SELECT COUNT(*) AS count FROM correspondence WHERE priority IN ('high','urgent') AND is_draft = 0");
    if ($row = $r->fetch_assoc()) $stats['urgent'] = (int)$row['count'];

    $r = $conn->query("SELECT COUNT(*) AS count FROM correspondence WHERE current_stage != 'completed' AND is_draft = 0");
    if ($row = $r->fetch_assoc()) $stats['pending'] = (int)$row['count'];

    $r = $conn->query("SELECT COUNT(*) AS count FROM correspondence WHERE current_stage = 'completed' AND is_draft = 0");
    if ($row = $r->fetch_assoc()) $stats['completed'] = (int)$row['count'];

    $r = $conn->query("SELECT COUNT(*) AS count FROM correspondence
                       WHERE deadline_date < CURDATE() AND current_stage != 'completed' AND is_draft = 0");
    if ($row = $r->fetch_assoc()) $stats['overdue'] = (int)$row['count'];

    return $stats;
}

/**
 * الخطابات العاجلة (للعرض في لوحة التنبيهات)
 */
function getUrgentCorrespondence() {
    $conn = db();

    $sql = "SELECT c.*,
                df.name AS from_dept_name,
                dt.name AS to_dept_name
            FROM correspondence c
            LEFT JOIN departments df ON c.from_department_id = df.id
            LEFT JOIN departments dt ON c.to_department_id   = dt.id
            WHERE c.priority IN ('high','urgent')
              AND c.current_stage != 'completed'
              AND c.is_draft = 0
            ORDER BY
                CASE c.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 ELSE 3 END,
                c.deadline_date ASC,
                c.created_at DESC
            LIMIT 10";

    $result         = $conn->query($sql);
    $correspondence = [];
    if ($result && $result->num_rows > 0) {
        while ($row = $result->fetch_assoc()) $correspondence[] = $row;
    }
    return $correspondence;
}


// ═══════════════════════════════════════════════════════════════
// ⑦ المرفقات
// ═══════════════════════════════════════════════════════════════

/**
 * رفع مرفق لمراسلة
 */
function uploadCorrespondenceAttachment($correspondenceId, $file, $uploadedBy) {
    $conn = db();

    // المسار الصحيح بالنسبة لجذر المشروع
    $uploadDir = rtrim($_SERVER['DOCUMENT_ROOT'], '/') . '/workflow-system/uploads/correspondence/';

    // إنشاء المجلد لو غير موجود
    if (!is_dir($uploadDir)) {
        mkdir($uploadDir, 0755, true);
    }

    if (!is_writable($uploadDir)) {
        // محاولة أخيرة: مجلد بجانب correspondence_functions.php
        $uploadDir = dirname(__DIR__) . '/uploads/correspondence/';
        if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);
    }

    if (!is_writable($uploadDir)) {
        return ['success' => false, 'message' => 'مجلد الرفع غير قابل للكتابة: ' . $uploadDir];
    }

    $originalName = basename($file['name']);
    $extension    = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
    $fileName     = uniqid('corr_' . $correspondenceId . '_') . '.' . $extension;
    $filePath     = $uploadDir . $fileName;

    if (!move_uploaded_file($file['tmp_name'], $filePath)) {
        return ['success' => false, 'message' => 'فشل نقل الملف — tmp: ' . $file['tmp_name'] . ' → ' . $filePath . ' | error: ' . $file['error']];
    }

    $sql = "INSERT INTO correspondence_attachments
                (correspondence_id, file_name, original_name, file_path, file_type, file_size, uploaded_by)
            VALUES (
                $correspondenceId,
                '" . $conn->real_escape_string($fileName)       . "',
                '" . $conn->real_escape_string($originalName)   . "',
                '" . $conn->real_escape_string($filePath)       . "',
                '" . $conn->real_escape_string($file['type'])   . "',
                " . (int)$file['size'] . ",
                $uploadedBy
            )";

    if ($conn->query($sql)) {
        return ['success' => true, 'id' => $conn->insert_id, 'file_name' => $fileName, 'original_name' => $originalName];
    }

    return ['success' => false, 'message' => 'فشل حفظ المرفق في قاعدة البيانات: ' . $conn->error];
}


// ═══════════════════════════════════════════════════════════════
// ⑧ القوالب
// ═══════════════════════════════════════════════════════════════

/**
 * الحصول على قوالب المراسلات
 */
function getCorrespondenceTemplates($type = null) {
    $conn = db();

    $sql = "SELECT * FROM correspondence_templates WHERE is_public = 1";
    if ($type) {
        $sql .= " AND correspondence_type = '" . $conn->real_escape_string($type) . "'";
    }
    $sql .= " ORDER BY usage_count DESC, template_name ASC";

    $result    = $conn->query($sql);
    $templates = [];
    if ($result && $result->num_rows > 0) {
        while ($row = $result->fetch_assoc()) $templates[] = $row;
    }
    return $templates;
}


// ═══════════════════════════════════════════════════════════════
// ⑨ سجل التدقيق
// ═══════════════════════════════════════════════════════════════

/**
 * تسجيل إجراء في سجل التدقيق
 */
function logCorrespondenceAction($correspondenceId, $employeeId, $action, $oldValue = null, $newValue = null, $description = null) {
    $conn = db();

    $correspondenceId = (int)$correspondenceId;
    $employeeId       = (int)$employeeId;
    $action           = $conn->real_escape_string($action);
    $oldValue         = $oldValue    ? "'" . $conn->real_escape_string($oldValue)    . "'" : 'NULL';
    $newValue         = $newValue    ? "'" . $conn->real_escape_string($newValue)    . "'" : 'NULL';
    $description      = $description ? "'" . $conn->real_escape_string($description) . "'" : 'NULL';
    $ipAddress        = $conn->real_escape_string($_SERVER['REMOTE_ADDR']      ?? '');
    $userAgent        = $conn->real_escape_string($_SERVER['HTTP_USER_AGENT']  ?? '');

    $conn->query("INSERT INTO correspondence_audit_log
                    (correspondence_id, employee_id, action, old_value, new_value, description, ip_address, user_agent)
                  VALUES ($correspondenceId, $employeeId, '$action', $oldValue, $newValue, $description, '$ipAddress', '$userAgent')");
}