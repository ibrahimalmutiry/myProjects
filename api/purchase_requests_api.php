<?php
/**
 * purchase_requests_api.php
 * API نظام المعاملات (طلبات الشراء)
 * الموقع: api/purchase_requests_api.php
 */

ob_start();
session_start();
session_write_close();
header('Content-Type: application/json; charset=utf-8');

// معالج الاستثناءات غير المتوقعة
set_exception_handler(function($e) {
    if (ob_get_level()) ob_end_clean();
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'success' => false,
        'message' => 'خطأ في الخادم: ' . $e->getMessage(),
        'file'    => basename($e->getFile()),
        'line'    => $e->getLine(),
    ], JSON_UNESCAPED_UNICODE);
    exit;
});

// ── تحميل التبعيات (نفس نمط ceo_approvals_api.php) ─────────
require_once __DIR__ . '/../includes/functions.php';

if (!function_exists('db')) {
    ob_end_clean();
    echo json_encode(['success'=>false,'message'=>'functions.php غير موجود'], JSON_UNESCAPED_UNICODE);
    exit;
}

// ── تحقق من تسجيل الدخول ────────────────────────────────────
if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    ob_end_clean();
    echo json_encode(['success'=>false,'message'=>'يجب تسجيل الدخول أولاً'], JSON_UNESCAPED_UNICODE);
    exit;
}

// ── بيانات المستخدم ──────────────────────────────────────────
$currentUserId   = (int)$_SESSION['user_id'];
$permissionLevel = $_SESSION['permission_level'] ?? 'employee';
$userDeptId      = (int)($_SESSION['department_id'] ?? 0);
$userDeptCode    = $_SESSION['department_code'] ?? '';

// جلب كود الإدارة من DB إن لم يكن في الجلسة
if (empty($userDeptCode) && $userDeptId) {
    $conn = db();
    $dr   = $conn->query("SELECT code FROM departments WHERE id=$userDeptId LIMIT 1");
    if ($dr && $dr->num_rows) $userDeptCode = $dr->fetch_assoc()['code'] ?? '';
}

$action = $_GET['action'] ?? $_POST['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

try {

    // ════════════════════════════════════════════════════════
    // GET Endpoints
    // ════════════════════════════════════════════════════════
    if ($method === 'GET') {

        // ── فحص صلاحية المستخدم ──────────────────────────────
        if ($action === 'my_access') {
            $conn   = db();
            $isSC   = prIsUserSupplyChain($conn, $currentUserId);
            $roleR  = (($_qrA1_ = $conn->query("SELECT role FROM employees WHERE id=$currentUserId LIMIT 1")) ? $_qrA1_->fetch_assoc() : null);
            $role   = $roleR['role'] ?? '';
            $viewAll= in_array($role, ['budget','payment','dispatch','treasury_manager','CEO','admin'])
                   || $permissionLevel === 'system_admin';
            jsonOut([
                'success'         => true,
                'is_supply_chain' => $isSC,
                'is_view_all'     => $viewAll,
                'role'            => $role,
                'permission_level'=> $permissionLevel,
            ]);
        }

        // ── قائمة الطلبات ────────────────────────────────────
        elseif ($action === 'list') {
            $filters = [
                'stage'     => $_GET['stage']     ?? '',
                'priority'  => $_GET['priority']  ?? '',
                'date_from' => $_GET['date_from'] ?? '',
                'date_to'   => $_GET['date_to']   ?? '',
                'search'    => $_GET['search']    ?? '',
            ];
            $requests = prGetRequests($currentUserId, $permissionLevel, $userDeptId, $userDeptCode, $filters);
            jsonOut(['success'=>true,'data'=>$requests]);
        }

        // ── تفاصيل طلب واحد ──────────────────────────────────
        elseif ($action === 'get') {
            $id  = (int)($_GET['id'] ?? 0);
            $req = prGetRequest($id);
            if (!$req) jsonOut(['success'=>false,'message'=>'الطلب غير موجود'], 404);

            if (!prCanViewRequest($req, $currentUserId, $permissionLevel, $userDeptId, $userDeptCode))
                jsonOut(['success'=>false,'message'=>'ليس لديك صلاحية لعرض هذا الطلب'], 403);

            $req['events']          = prGetEvents($id);
            $req['workflow_stages'] = prGetWorkflowStages($id);
            $req['attachments']     = prGetAttachments($id);
            $req['stage_approvals'] = prGetStageApprovals($id);
            $req['sla_status']      = prGetRequestSlaStatus($id);
            jsonOut(['success'=>true,'data'=>$req]);
        }

        // ── سجل الأحداث ──────────────────────────────────────
        elseif ($action === 'events') {
            $id = (int)($_GET['id'] ?? 0);
            jsonOut(['success'=>true,'data'=>prGetEvents($id)]);
        }

        // ── المرفقات ─────────────────────────────────────────
        elseif ($action === 'attachments') {
            $id = (int)($_GET['id'] ?? 0);
            jsonOut(['success'=>true,'data'=>prGetAttachments($id)]);
        }

        // ── طلبات الدفع لـ daily-payments ─────────────────────
        elseif ($action === 'payment_queue') {
            if ($userDeptCode !== 'FIN' && $permissionLevel !== 'system_admin')
                jsonOut(['success'=>false,'message'=>'غير مصرح'], 403);
            jsonOut(['success'=>true,'data'=>prGetPaymentRequests()]);
        }

        // ── حالة SLA ─────────────────────────────────────────
        elseif ($action === 'sla_status') {
            $id = (int)($_GET['id'] ?? 0);
            jsonOut(['success'=>true,'data'=>prGetRequestSlaStatus($id)]);
        }

        // ── موظفو إدارة للإسناد ───────────────────────────────
        elseif ($action === 'dept_employees') {
            $deptId = (int)($_GET['dept_id'] ?? $userDeptId);
            if ($permissionLevel !== 'system_admin' && $deptId !== $userDeptId)
                jsonOut(['success'=>false,'message'=>'غير مصرح'], 403);

            $conn = db();
            $r    = $conn->query("
                SELECT id, name, role, permission_level
                FROM employees
                WHERE department_id=$deptId AND is_active=1 AND id!=$currentUserId
                ORDER BY name
            ");
            $emps = [];
            if ($r) while ($row = $r->fetch_assoc()) $emps[] = $row;
            jsonOut(['success'=>true,'data'=>$emps]);
        }

        // ── خيارات نموذج الإنشاء ─────────────────────────────
        elseif ($action === 'form_options') {
            $conn = db();

            // الموردون
            $suppliers = [];
            $r = $conn->query("SELECT id, name, category FROM suppliers WHERE is_active=1 ORDER BY name");
            if ($r) while ($row = $r->fetch_assoc()) $suppliers[] = $row;

            // مراكز التكلفة
            $costCenters = [];
            $r = $conn->query("SELECT id, code, name FROM cost_centers WHERE is_active=1 ORDER BY code LIMIT 200");
            if ($r) while ($row = $r->fetch_assoc()) $costCenters[] = $row;

            // بنود الميزانية
            $budgetCategories = [];
            $chkCode = $conn->query("SHOW COLUMNS FROM budget_categories LIKE 'code'");
            $hasCode = $chkCode && $chkCode->num_rows > 0;
            $catSql  = $hasCode
                ? "SELECT id, code, name FROM budget_categories WHERE is_active=1 ORDER BY code"
                : "SELECT id, '' AS code, name FROM budget_categories WHERE is_active=1 ORDER BY name";
            $r = $conn->query($catSql);
            if ($r) while ($row = $r->fetch_assoc()) $budgetCategories[] = $row;

            // العملات
            $currencies = [['code'=>'SAR','name_ar'=>'ريال سعودي','symbol'=>'ر.س','rate_to_sar'=>1]];
            $chkEx = $conn->query("SHOW TABLES LIKE 'exchange_rates'");
            if ($chkEx && $chkEx->num_rows > 0) {
                $r = $conn->query("SELECT code, name_ar, symbol, rate_to_sar FROM exchange_rates WHERE is_active=1 ORDER BY code");
                if ($r && $r->num_rows > 0) {
                    $currencies = [];
                    while ($row = $r->fetch_assoc()) $currencies[] = $row;
                }
            }

            // أنواع المعاملات — الأنواع الرئيسية مع أبنائها
            $txTypes = [];
            $r = $conn->query("
                SELECT id, name, description, parent_id, sort_order
                FROM transaction_types
                WHERE is_active=1
                ORDER BY COALESCE(parent_id,id), sort_order, id
            ");
            if ($r) while ($row = $r->fetch_assoc()) $txTypes[] = $row;

            $threshold = prGetAmountThreshold();

            jsonOut(['success'=>true,'data'=>compact('suppliers','costCenters','budgetCategories','currencies','threshold','txTypes')]);
        }

        else {
            jsonOut(['success'=>false,'message'=>'إجراء غير معروف: '.$action], 400);
        }
    }

    // ════════════════════════════════════════════════════════
    // POST Endpoints
    // ════════════════════════════════════════════════════════
    elseif ($method === 'POST') {
        $body = json_decode(file_get_contents('php://input'), true) ?: $_POST;

        // ── إنشاء طلب ────────────────────────────────────────
        if ($action === 'create') {
            $data                  = $body;
            $data['created_by']    = $currentUserId;
            $data['department_id'] = $data['department_id'] ?? $userDeptId;
            $result = prCreateRequest($data);
            jsonOut($result, $result['success'] ? 200 : 400);
        }

        // ── موافقة ────────────────────────────────────────────
        elseif ($action === 'approve') {
            $requestId = (int)($body['request_id'] ?? 0);
            $stage     = $body['stage'] ?? '';
            $notes     = $body['notes'] ?? '';
            if (!$requestId || !$stage) jsonOut(['success'=>false,'message'=>'البيانات ناقصة'], 400);
            $result = prApproveStage($requestId, $currentUserId, $stage, $notes);
            jsonOut($result, $result['success'] ? 200 : 400);
        }

        // ── رفض ──────────────────────────────────────────────
        elseif ($action === 'reject') {
            $requestId = (int)($body['request_id'] ?? 0);
            $stage     = $body['stage'] ?? '';
            $reason    = trim($body['reason'] ?? '');
            if (!$requestId || !$reason) jsonOut(['success'=>false,'message'=>'سبب الرفض مطلوب'], 400);
            $result = prRejectRequest($requestId, $currentUserId, $stage, $reason);
            jsonOut($result, $result['success'] ? 200 : 400);
        }

        // ── إعادة تقديم طلب مرجَع ───────────────────────────
        elseif ($action === 'resubmit') {
            if ($permissionLevel === 'employee')
                jsonOut(['success'=>false,'message'=>'فقط مدير الإدارة يستطيع إعادة التقديم'], 403);
            $requestId = (int)($body['request_id'] ?? 0);
            $notes     = trim($body['notes'] ?? '');
            if (!$requestId) jsonOut(['success'=>false,'message'=>'معرّف الطلب مطلوب'], 400);
            $result = prResubmitRequest($requestId, $currentUserId, $notes);
            jsonOut($result, $result['success'] ? 200 : 400);
        }

        // ── إصدار أمر الشراء ─────────────────────────────────
        elseif ($action === 'issue_po') {
            // يُتحقق من قطاع سلاسل الإمداد مباشرةً من DB
            $conn = $conn ?? db();
            $isSupplyChain = prIsUserSupplyChain($conn, $currentUserId) || $permissionLevel === 'system_admin';
            if (!$isSupplyChain)
                jsonOut(['success'=>false,'message'=>'فقط موظفو قطاع سلاسل الإمداد والمشتريات'], 403);
            $requestId = (int)($body['request_id'] ?? 0);
            $poData = [
                'po_number'           => $body['po_number']           ?? '',
                'final_supplier_id'   => $body['final_supplier_id']   ?? null,
                'final_supplier_name' => $body['final_supplier_name'] ?? '',
                'final_amount'        => $body['final_amount']        ?? 0,
            ];
            $result = prIssuePurchaseOrder($requestId, $currentUserId, $poData);
            jsonOut($result, $result['success'] ? 200 : 400);
        }

        // ── طلب موافقة CEO من المشتريات (الطلب يتجاوز الحد) ──
        elseif ($action === 'request_ceo_approval') {
            // فقط موظفو سلاسل الإمداد
            $isSupplyChain = $userDeptCode === 'PUR'
                          || (strpos($userDeptCode, '41') === 0)
                          || $permissionLevel === 'system_admin';
            if (!$isSupplyChain)
                jsonOut(['success'=>false,'message'=>'فقط موظفو سلاسل الإمداد'], 403);

            $requestId = (int)($body['request_id'] ?? 0);
            $notes     = trim($body['notes'] ?? '');
            if (!$requestId) jsonOut(['success'=>false,'message'=>'معرّف الطلب مطلوب'], 400);

            $req = prGetRequest($requestId);
            if (!$req) jsonOut(['success'=>false,'message'=>'الطلب غير موجود'], 404);
            if ($req['current_stage'] !== 'purchasing')
                jsonOut(['success'=>false,'message'=>'الطلب ليس في مرحلة المشتريات'], 400);

            $conn = db();
            $esc  = $conn->real_escape_string($notes);
            $empName = prGetEmployeeName($currentUserId);

            // نقل الطلب لمرحلة ceo_approval
            $conn->begin_transaction();
            try {
                $conn->query("
                    UPDATE purchase_requests
                    SET current_stage = 'ceo_approval', updated_at = NOW()
                    WHERE id = $requestId
                ");
                $conn->query("
                    UPDATE pr_workflow_stages
                    SET status='pending', arrived_at=NOW(), started_at=NOW(), notes='$esc'
                    WHERE request_id=$requestId AND stage_name='ceo_approval'
                ");
                // إيقاف SLA مرحلة المشتريات وبدء SLA للـ CEO
                prEndSlaTracking($requestId, 'purchasing');
                prStartSlaTracking($requestId, 'ceo_approval');
                // إشعار CEO
                prNotifyStageRecipients($requestId, 'ceo_approval', $req['request_number']);
                prLogEvent($requestId, 'stage_changed', $currentUserId, [
                    'stage'       => 'ceo_approval',
                    'description' => "$empName طلب موافقة الرئيس التنفيذي على الطلب" . ($notes ? ". السبب: $notes" : ''),
                    'old_value'   => 'purchasing',
                    'new_value'   => 'ceo_approval',
                ]);
                $conn->commit();
                jsonOut(['success'=>true,'message'=>'تم إرسال الطلب لاعتماد الرئيس التنفيذي']);
            } catch (Exception $e) {
                $conn->rollback();
                jsonOut(['success'=>false,'message'=>'فشل الإرسال: '.$e->getMessage()], 500);
            }
        }

        // ── اعتماد حجز الموازنة ──────────────────────────────
        elseif ($action === 'approve_reservation') {
            $reservationId = (int)($body['reservation_id'] ?? 0);
            $result = prBudgetEmployeeApproveReservation($reservationId, $currentUserId, $body['notes'] ?? '');
            jsonOut($result, $result['success'] ? 200 : 400);
        }

        // ── اعتماد CEO ───────────────────────────────────────
        elseif ($action === 'ceo_approve_reservation') {
            if ($permissionLevel !== 'system_admin' && !in_array($_SESSION['user_role'] ?? '', ['admin','ceo']))
                jsonOut(['success'=>false,'message'=>'غير مصرح'], 403);
            $reservationId = (int)($body['reservation_id'] ?? 0);
            $result = prCeoApproveReservation($reservationId, $currentUserId, $body['notes'] ?? '');
            jsonOut($result, $result['success'] ? 200 : 400);
        }

        // ── إحالة ────────────────────────────────────────────
        elseif ($action === 'refer') {
            $requestId = (int)($body['request_id'] ?? 0);
            $reason    = trim($body['reason'] ?? '');
            if (!$requestId || !$reason) jsonOut(['success'=>false,'message'=>'سبب الإحالة مطلوب'], 400);
            $referralData = [
                'to_employee_id'    => $body['to_employee_id']   ?? null,
                'to_department_id'  => $body['to_department_id'] ?? null,
                'type'              => $body['type']             ?? 'internal',
                'reason'            => $reason,
            ];
            $result = prReferRequest($requestId, $currentUserId, $referralData);
            jsonOut($result, $result['success'] ? 200 : 400);
        }

        // ── إسناد داخلي ──────────────────────────────────────
        elseif ($action === 'assign') {
            if ($permissionLevel === 'employee')
                jsonOut(['success'=>false,'message'=>'فقط مدير الإدارة يستطيع الإسناد'], 403);
            $requestId          = (int)($body['request_id']          ?? 0);
            $assignedEmployeeId = (int)($body['assigned_employee_id'] ?? 0);
            if (!$requestId || !$assignedEmployeeId)
                jsonOut(['success'=>false,'message'=>'البيانات ناقصة'], 400);
            $result = prAssignRequest($requestId, $currentUserId, $assignedEmployeeId, $body['notes'] ?? '');
            jsonOut($result, $result['success'] ? 200 : 400);
        }

        // ── رفع مرفق ─────────────────────────────────────────
        elseif ($action === 'upload_attachment') {
            $requestId = (int)($_POST['request_id'] ?? 0);
            if (!$requestId || empty($_FILES['file']))
                jsonOut(['success'=>false,'message'=>'الملف ورقم الطلب مطلوبان'], 400);
            $result = prUploadAttachment($requestId, $currentUserId, $_FILES['file']);
            jsonOut($result, $result['success'] ? 200 : 400);
        }

        else {
            jsonOut(['success'=>false,'message'=>'إجراء غير معروف: '.$action], 400);
        }
    }

    else {
        jsonOut(['success'=>false,'message'=>'طريقة غير مدعومة'], 405);
    }

} catch (Throwable $e) {
    ob_end_clean();
    jsonOut(['success'=>false,'message'=>'خطأ: '.$e->getMessage(),'line'=>$e->getLine()], 500);
}


// ════════════════════════════════════════════════════════════
// دوال مساعدة للـ API
// ════════════════════════════════════════════════════════════

function jsonOut(array $data, int $status = 200): void {
    http_response_code($status);
    ob_end_clean();
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function prCanViewRequest(array $req, int $userId, string $level, int $deptId, string $deptCode): bool {
    if ($level === 'system_admin') return true;

    $conn = db();
    // جلب بيانات الموظف من DB مباشرةً
    $empRow = (($_qrA2_ = $conn->query("
        SELECT e.role, e.department_id,
               d.code  AS dept_code,
               ds.code AS sector_code,
               dd.code AS division_code
        FROM employees e
        LEFT JOIN departments d  ON d.id = e.department_id
        LEFT JOIN departments ds ON ds.id = e.sector_id
        LEFT JOIN departments dd ON dd.id = e.division_id
        WHERE e.id = $userId LIMIT 1
    ")) ? $_qrA2_->fetch_assoc() : null);

    $role        = $empRow['role']         ?? '';
    $deptCodeDB  = $empRow['dept_code']    ?? '';
    $sectorCode  = $empRow['sector_code']  ?? '';
    $divCode     = $empRow['division_code']?? '';

    // الأدوار التي ترى الكل
    $rolesViewAll = ['budget', 'payment', 'dispatch', 'treasury_manager', 'CEO', 'admin', 'purchasing'];
    if (in_array($role, $rolesViewAll)) return true;
    if (in_array($deptCodeDB, ['FIN']) || in_array($sectorCode, ['FIN'])) return true;

    // سلاسل الإمداد — أي كود في التسلسل الهرمي يبدأ بـ 41 أو = PUR
    $allCodes = [$deptCodeDB, $sectorCode, $divCode, $deptCode];
    foreach ($allCodes as $c) {
        if ($c === 'PUR' || (strpos((string)$c, '41') === 0)) {
            if (in_array($req['current_stage'], ['purchasing','waiting_budget_approval'])) return true;
            break;
        }
    }

    if ((int)$req['created_by'] === $userId) return true;
    if ((int)$req['department_id'] === (int)($empRow['department_id'] ?? $deptId)) return true;
    return false;
}

function prGetWorkflowStages(int $requestId): array {
    $conn = db();
    // نجلب اسم الموظف المعيّن للمرحلة + اسم من أتمّها (approved_by)
    $conn->query("ALTER TABLE pr_workflow_stages ADD COLUMN IF NOT EXISTS approved_by INT DEFAULT NULL");
    $r = $conn->query("
        SELECT pws.*,
               e.name  AS employee_name,
               ab.name AS approved_by_name
        FROM pr_workflow_stages pws
        LEFT JOIN employees e  ON e.id  = pws.employee_id
        LEFT JOIN employees ab ON ab.id = pws.approved_by
        WHERE pws.request_id=$requestId
        ORDER BY pws.stage_order ASC
    ");
    $rows = [];
    if ($r) while ($row = $r->fetch_assoc()) $rows[] = $row;
    return $rows;
}

function prGetAttachments(int $requestId): array {
    $conn = db();
    $r    = $conn->query("
        SELECT pa.*, e.name AS uploader_name
        FROM pr_attachments pa
        LEFT JOIN employees e ON pa.uploaded_by = e.id
        WHERE pa.request_id=$requestId
        ORDER BY pa.uploaded_at DESC
    ");
    $rows = [];
    if ($r) while ($row = $r->fetch_assoc()) $rows[] = $row;
    return $rows;
}

function prGetStageApprovals(int $requestId): array {
    $conn = db();
    $r    = $conn->query("
        SELECT psa.*, e.name AS employee_name
        FROM pr_stage_approvals psa
        LEFT JOIN employees e ON psa.employee_id = e.id
        WHERE psa.request_id=$requestId
        ORDER BY psa.created_at ASC
    ");
    $rows = [];
    if ($r) while ($row = $r->fetch_assoc()) $rows[] = $row;
    return $rows;
}

function prGetRequestSlaStatus(int $requestId): array {
    $conn = db();
    $r    = $conn->query("
        SELECT pst.*, psp.allowed_hours, psp.warning_pct, psp.escalate_pct, psp.name AS policy_name
        FROM pr_sla_tracking pst
        LEFT JOIN pr_sla_policies psp ON pst.policy_id = psp.id
        WHERE pst.request_id=$requestId
        ORDER BY pst.created_at ASC
    ");
    $rows = [];
    if ($r) while ($row = $r->fetch_assoc()) $rows[] = $row;
    return $rows;
}

function prUploadAttachment(int $requestId, int $uploadedBy, array $file): array {
    if ($file['error'] !== UPLOAD_ERR_OK) return ['success'=>false,'message'=>'فشل رفع الملف'];
    if ($file['size'] > 10*1024*1024) return ['success'=>false,'message'=>'الحجم يتجاوز 10 ميجابايت'];

    // التحقق من حالة الطلب — لا رفع على طلبات منتهية
    $reqCheck = prGetRequest($requestId);
    if (!$reqCheck) return ['success'=>false,'message'=>'الطلب غير موجود'];
    if (in_array($reqCheck['status'] ?? '', ['مرفوض', 'مكتمل', 'ملغي'])) {
        return ['success'=>false,'message'=>'لا يمكن إضافة مرفقات لطلب في حالة: ' . $reqCheck['status']];
    }

    // التحقق من الامتداد
    $allowed = ['pdf','jpg','jpeg','png','xlsx','xls','docx','doc'];
    $ext     = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    if (!in_array($ext, $allowed)) return ['success'=>false,'message'=>'نوع الملف غير مدعوم'];

    // التحقق من MIME الحقيقي (يمنع رفع PHP باسم PDF)
    $allowedMimes = [
        'application/pdf',
        'image/jpeg', 'image/png',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
    ];
    $finfo    = finfo_open(FILEINFO_MIME_TYPE);
    $realMime = finfo_file($finfo, $file['tmp_name']);
    finfo_close($finfo);
    if (!in_array($realMime, $allowedMimes)) {
        return ['success'=>false,'message'=>'محتوى الملف لا يطابق نوعه — الرفع مرفوض'];
    }

    $uploadDir = dirname(__DIR__) . '/uploads/purchase_requests/';
    if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);

    $fileName = 'pr_'.$requestId.'_'.time().'_'.uniqid().'.'.$ext;
    if (!move_uploaded_file($file['tmp_name'], $uploadDir.$fileName))
        return ['success'=>false,'message'=>'فشل حفظ الملف'];

    $conn     = db();
    $req      = prGetRequest($requestId);
    $stage    = $conn->real_escape_string($req['current_stage'] ?? '');
    $orig     = $conn->real_escape_string($file['name']);
    $fName    = $conn->real_escape_string($fileName);
    $fPath    = $conn->real_escape_string('uploads/purchase_requests/'.$fileName);
    $fType    = $conn->real_escape_string($file['type'] ?? '');
    $fSize    = (int)$file['size'];

    $conn->query("
        INSERT INTO pr_attachments (request_id,file_name,original_name,file_path,file_type,file_size,uploaded_by,stage,uploaded_at)
        VALUES ($requestId,'$fName','$orig','$fPath','$fType',$fSize,$uploadedBy,'$stage',NOW())
    ");

    prLogEvent($requestId, 'attachment_added', $uploadedBy, [
        'stage'       => $stage,
        'description' => 'تم رفع مرفق: '.$file['name'],
        'new_value'   => $fileName,
    ]);

    return ['success'=>true,'message'=>'تم رفع الملف','file_path'=>'uploads/purchase_requests/'.$fileName,'original_name'=>$file['name']];
}