<?php
/**
 * API نظام الخطابات والمراسلات
 * Correspondence System API
 */

// بدء الجلسة
session_start();

// إيقاف عرض الأخطاء في الناتج (غيّر إلى 1 للتشخيص)
error_reporting(E_ALL);
ini_set('display_errors', 1); // ✅ تفعيل عرض الأخطاء مؤقتاً

// تعيين Headers قبل أي output
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE');
header('Access-Control-Allow-Headers: Content-Type');

// التعامل مع طلبات OPTIONS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// ملاحظة: دالة jsonResponse موجودة في config.php

// محاولة تحميل الملفات المطلوبة
try {
    // البحث عن correspondence_functions.php في عدة مسارات
    $possiblePaths = [
        __DIR__ . '/../includes/correspondence_functions.php',
        dirname(__DIR__) . '/includes/correspondence_functions.php',
        __DIR__ . '/includes/correspondence_functions.php',
        '/Applications/XAMPP/xamppfiles/htdocs/workflow-system/includes/correspondence_functions.php'
    ];
    
    $functionsPath = null;
    foreach ($possiblePaths as $path) {
        if (file_exists($path)) {
            $functionsPath = $path;
            break;
        }
    }
    
    if (!$functionsPath) {
        jsonResponse([
            'success' => false, 
            'message' => 'ملف correspondence_functions.php غير موجود. بحثت في: ' . implode(', ', $possiblePaths)
        ], 500);
    }
    
    require_once $functionsPath;
    
} catch (Exception $e) {
    jsonResponse([
        'success' => false,
        'message' => 'خطأ في تحميل الملفات: ' . $e->getMessage()
    ], 500);
}

// التحقق من تسجيل الدخول
if (!isset($_SESSION['user_id'])) {
    jsonResponse(['success' => false, 'message' => 'يجب تسجيل الدخول أولاً'], 401);
}

$userId = $_SESSION['user_id'];
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

try {
    switch ($action) {
        
        // ===== الأقسام =====
        case 'departments':
            $departments = getAllDepartments();
            jsonResponse(['success' => true, 'data' => $departments]);
            break;
        
        // ===== الإحصائيات =====
        case 'stats':
            $stats = getCorrespondenceStats();
            jsonResponse(['success' => true, 'data' => $stats]);
            break;
        
        // ===== جميع الخطابات =====
        case 'correspondence_list':
            $filters = [
                'search' => $_GET['search'] ?? '',
                'type' => $_GET['type'] ?? '',
                'status' => $_GET['status'] ?? '',
                'priority' => $_GET['priority'] ?? '',
                'department_id' => $_GET['department_id'] ?? '',
                'date_from' => $_GET['date_from'] ?? '',
                'date_to' => $_GET['date_to'] ?? '',
                'show_drafts' => isset($_GET['show_drafts']) ? (bool)$_GET['show_drafts'] : false,
                'limit' => $_GET['limit'] ?? null,
                'offset' => $_GET['offset'] ?? null
            ];
            
            $correspondence = getAllCorrespondence($filters);
            jsonResponse(['success' => true, 'data' => $correspondence]);
            break;
        
        // ===== خطاب واحد =====
        case 'correspondence':
            $id = (int)($_GET['id'] ?? 0);
            if ($id <= 0) {
                jsonResponse(['success' => false, 'message' => 'معرف غير صالح'], 400);
            }
            
            $correspondence = getCorrespondence($id);
            if ($correspondence) {
                jsonResponse(['success' => true, 'data' => $correspondence]);
            } else {
                jsonResponse(['success' => false, 'message' => 'الخطاب غير موجود'], 404);
            }
            break;
        
        // ===== الخطابات العاجلة =====
        case 'urgent':
            $urgent = getUrgentCorrespondence();
            jsonResponse(['success' => true, 'data' => $urgent]);
            break;
        
        // ===== القوالب =====
        case 'templates':
            $type = $_GET['type'] ?? null;
            $templates = getCorrespondenceTemplates($type);
            jsonResponse(['success' => true, 'data' => $templates]);
            break;
        
        // ===== إضافة خطاب جديد =====
        case 'add':
            if ($method !== 'POST') {
                jsonResponse(['success' => false, 'message' => 'طريقة الطلب غير صحيحة'], 405);
            }
            
            $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
            
            if (strpos($contentType, 'multipart/form-data') !== false) {
                $input = $_POST;
            } else {
                $input = json_decode(file_get_contents('php://input'), true);
            }
            
            if (!$input) {
                jsonResponse(['success' => false, 'message' => 'لا توجد بيانات'], 400);
            }
            
            // التحقق من الحقول المطلوبة
            $required = ['type', 'subject'];
            foreach ($required as $field) {
                if (empty($input[$field])) {
                    jsonResponse(['success' => false, 'message' => "الحقل $field مطلوب"], 400);
                }
            }
            
            $input['created_by'] = $userId;
            
            $result = addCorrespondence($input);
            
            if ($result['success']) {
                // رفع المرفقات إن وجدت
                if (!empty($_FILES['attachments'])) {
                    $correspondenceId = $result['id'];
                    $files = $_FILES['attachments'];
                    
                    // معالجة رفع ملفات متعددة
                    if (is_array($files['name'])) {
                        for ($i = 0; $i < count($files['name']); $i++) {
                            if ($files['error'][$i] === UPLOAD_ERR_OK) {
                                $file = [
                                    'name' => $files['name'][$i],
                                    'type' => $files['type'][$i],
                                    'tmp_name' => $files['tmp_name'][$i],
                                    'error' => $files['error'][$i],
                                    'size' => $files['size'][$i]
                                ];
                                uploadCorrespondenceAttachment($correspondenceId, $file, $userId);
                            }
                        }
                    } else {
                        uploadCorrespondenceAttachment($correspondenceId, $files, $userId);
                    }
                }
                
                jsonResponse(['success' => true, 'data' => $result]);
            } else {
                jsonResponse($result, 400);
            }
            break;
        
        // ===== تحديث مرحلة =====
        case 'update_stage':
            if ($method !== 'POST') {
                jsonResponse(['success' => false, 'message' => 'طريقة الطلب غير صحيحة'], 405);
            }
            
            $input = json_decode(file_get_contents('php://input'), true);
            
            if (!$input || empty($input['stage_id'])) {
                jsonResponse(['success' => false, 'message' => 'معرف المرحلة مطلوب'], 400);
            }
            
            $stageId = (int)$input['stage_id'];
            unset($input['stage_id']);
            
            $result = updateCorrespondenceStage($stageId, $input);
            
            if ($result['success']) {
                jsonResponse(['success' => true, 'message' => 'تم تحديث المرحلة بنجاح']);
            } else {
                jsonResponse($result, 400);
            }
            break;
        
        // ===== إضافة تعليق =====
        case 'add_comment':
            if ($method !== 'POST') {
                jsonResponse(['success' => false, 'message' => 'طريقة الطلب غير صحيحة'], 405);
            }
            
            $input = json_decode(file_get_contents('php://input'), true);
            
            if (!$input || empty($input['correspondence_id']) || empty($input['comment'])) {
                jsonResponse(['success' => false, 'message' => 'معرف الخطاب والتعليق مطلوبان'], 400);
            }
            
            $correspondenceId = (int)$input['correspondence_id'];
            $comment = $input['comment'];
            $isInternal = (bool)($input['is_internal'] ?? false);
            
            $result = addCorrespondenceComment($correspondenceId, $userId, $comment, $isInternal);
            
            if ($result['success']) {
                jsonResponse(['success' => true, 'data' => $result]);
            } else {
                jsonResponse($result, 400);
            }
            break;
        
        // ===== رفع مرفق =====
        case 'upload_attachment':
            if ($method !== 'POST') {
                jsonResponse(['success' => false, 'message' => 'طريقة الطلب غير صحيحة'], 405);
            }
            
            if (empty($_POST['correspondence_id']) || empty($_FILES['file'])) {
                jsonResponse(['success' => false, 'message' => 'معرف الخطاب والملف مطلوبان'], 400);
            }
            
            $correspondenceId = (int)$_POST['correspondence_id'];
            $file = $_FILES['file'];
            
            $result = uploadCorrespondenceAttachment($correspondenceId, $file, $userId);
            
            if ($result['success']) {
                jsonResponse(['success' => true, 'data' => $result]);
            } else {
                jsonResponse($result, 400);
            }
            break;
        
        // ===== تحديث خطاب =====
        case 'update':
            if ($method !== 'POST') {
                jsonResponse(['success' => false, 'message' => 'طريقة الطلب غير صحيحة'], 405);
            }
            
            $input = json_decode(file_get_contents('php://input'), true);
            
            if (!$input || empty($input['id'])) {
                jsonResponse(['success' => false, 'message' => 'معرف الخطاب مطلوب'], 400);
            }
            
            $conn = db();
            $id = (int)$input['id'];
            
            $updates = [];
            
            if (isset($input['subject'])) {
                $subject = $conn->real_escape_string($input['subject']);
                $updates[] = "subject = '$subject'";
            }
            
            if (isset($input['content'])) {
                $content = $conn->real_escape_string($input['content']);
                $updates[] = "content = '$content'";
            }
            
            if (isset($input['priority'])) {
                $priority = $conn->real_escape_string($input['priority']);
                $updates[] = "priority = '$priority'";
            }
            
            if (isset($input['deadline_date'])) {
                $deadline = $conn->real_escape_string($input['deadline_date']);
                $updates[] = "deadline_date = '$deadline'";
            }
            
            if (isset($input['category'])) {
                $category = $conn->real_escape_string($input['category']);
                $updates[] = "category = '$category'";
            }
            
            if (empty($updates)) {
                jsonResponse(['success' => false, 'message' => 'لا توجد بيانات للتحديث'], 400);
            }
            
            $sql = "UPDATE correspondence SET " . implode(', ', $updates) . " WHERE id = $id";
            
            if ($conn->query($sql)) {
                logCorrespondenceAction($id, $userId, 'updated', null, null, 'تم تحديث بيانات الخطاب');
                jsonResponse(['success' => true, 'message' => 'تم التحديث بنجاح']);
            } else {
                jsonResponse(['success' => false, 'message' => $conn->error], 400);
            }
            break;
        
        // ===== حذف خطاب =====
        case 'delete':
            if ($method !== 'POST') {
                jsonResponse(['success' => false, 'message' => 'طريقة الطلب غير صحيحة'], 405);
            }
            
            $input = json_decode(file_get_contents('php://input'), true);
            
            if (!$input || empty($input['id'])) {
                jsonResponse(['success' => false, 'message' => 'معرف الخطاب مطلوب'], 400);
            }
            
            $conn = db();
            $id = (int)$input['id'];
            
            // التحقق من الصلاحية
            $userRole = $_SESSION['user_role'] ?? '';
            $checkSql = "SELECT created_by FROM correspondence WHERE id = $id";
            $result = $conn->query($checkSql);
            
            if ($result && $result->num_rows > 0) {
                $row = $result->fetch_assoc();
                
                if ($row['created_by'] != $userId && $userRole !== 'admin') {
                    jsonResponse(['success' => false, 'message' => 'ليس لديك صلاحية حذف هذا الخطاب'], 403);
                }
                
                $sql = "DELETE FROM correspondence WHERE id = $id";
                
                if ($conn->query($sql)) {
                    jsonResponse(['success' => true, 'message' => 'تم حذف الخطاب بنجاح']);
                } else {
                    jsonResponse(['success' => false, 'message' => $conn->error], 400);
                }
            } else {
                jsonResponse(['success' => false, 'message' => 'الخطاب غير موجود'], 404);
            }
            break;
        
        // ===== الموافقة على خطاب =====
        case 'approve':
            if ($method !== 'POST') {
                jsonResponse(['success' => false, 'message' => 'طريقة الطلب غير صحيحة'], 405);
            }
            
            $input = json_decode(file_get_contents('php://input'), true);
            
            if (!$input || empty($input['stage_id'])) {
                jsonResponse(['success' => false, 'message' => 'معرف المرحلة مطلوب'], 400);
            }
            
            $stageId = (int)$input['stage_id'];
            $notes = $input['notes'] ?? '';
            
            $result = updateCorrespondenceStage($stageId, [
                'status' => 'completed',
                'action_taken' => 'approved',
                'notes' => $notes,
                'employee_id' => $userId
            ]);
            
            if ($result['success']) {
                jsonResponse(['success' => true, 'message' => 'تمت الموافقة بنجاح']);
            } else {
                jsonResponse($result, 400);
            }
            break;
        
        // ===== رفض خطاب =====
        case 'reject':
            if ($method !== 'POST') {
                jsonResponse(['success' => false, 'message' => 'طريقة الطلب غير صحيحة'], 405);
            }
            
            $input = json_decode(file_get_contents('php://input'), true);
            
            if (!$input || empty($input['stage_id']) || empty($input['notes'])) {
                jsonResponse(['success' => false, 'message' => 'معرف المرحلة وسبب الرفض مطلوبان'], 400);
            }
            
            $stageId = (int)$input['stage_id'];
            $notes = $input['notes'];
            
            $result = updateCorrespondenceStage($stageId, [
                'status' => 'rejected',
                'action_taken' => 'rejected',
                'notes' => $notes,
                'employee_id' => $userId
            ]);
            
            if ($result['success']) {
                // تحديث حالة الخطاب
                $conn = db();
                $stageSql = "SELECT correspondence_id FROM correspondence_stages WHERE id = $stageId";
                $stageResult = $conn->query($stageSql);
                
                if ($stageResult && $row = $stageResult->fetch_assoc()) {
                    $corrId = $row['correspondence_id'];
                    $conn->query("UPDATE correspondence SET current_stage = 'rejected' WHERE id = $corrId");
                }
                
                jsonResponse(['success' => true, 'message' => 'تم رفض الخطاب']);
            } else {
                jsonResponse($result, 400);
            }
            break;
        
        default:
            jsonResponse(['success' => false, 'message' => 'إجراء غير معروف: ' . $action], 400);
    }
    
} catch (Exception $e) {
    jsonResponse([
        'success' => false, 
        'message' => 'خطأ: ' . $e->getMessage(),
        'file' => $e->getFile(),
        'line' => $e->getLine()
    ], 500);
} catch (Error $e) {
    jsonResponse([
        'success' => false, 
        'message' => 'خطأ فادح: ' . $e->getMessage(),
        'file' => $e->getFile(),
        'line' => $e->getLine()
    ], 500);
}