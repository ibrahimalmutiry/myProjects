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

// ── تهيئة جداول النظام ───────────────────────────────────────
if (function_exists('prBootstrap')) { prBootstrap(); }

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
            $roleR  = (($_qrA1_ = $conn->query("SELECT role, permission_level FROM employees WHERE id=$currentUserId LIMIT 1")) ? $_qrA1_->fetch_assoc() : null);
            $role   = $roleR['role'] ?? '';
            $pLevel = $roleR['permission_level'] ?? $permissionLevel;
            $viewAll= in_array($role, ['budget','payment','dispatch','treasury_manager','CEO','admin','receiver'])
                   || $permissionLevel === 'system_admin';
            // هل من القطاع المالي؟
            $finRow = (($_qrFin = $conn->query("
                SELECT d.code AS dc, ds.code AS sc, d.name AS dn, ds.name AS sn
                FROM employees e
                LEFT JOIN departments d  ON d.id = e.department_id
                LEFT JOIN departments ds ON ds.id = e.sector_id
                WHERE e.id=$currentUserId LIMIT 1
            ")) ? $_qrFin->fetch_assoc() : null);
            $isFinSector = ($finRow && (
                in_array($finRow['dc'] ?? '', ['FIN']) ||
                in_array($finRow['sc'] ?? '', ['FIN']) ||
                preg_match('/^31/', $finRow['dc'] ?? '') ||
                preg_match('/^31/', $finRow['sc'] ?? '') ||
                stripos($finRow['dn'] ?? '', 'مال') !== false ||
                stripos($finRow['sn'] ?? '', 'مال') !== false ||
                stripos($finRow['dn'] ?? '', 'financ') !== false ||
                stripos($finRow['sn'] ?? '', 'financ') !== false
            ));
            jsonOut([
                'success'           => true,
                'is_supply_chain'   => $isSC,
                'is_view_all'       => $viewAll,
                'is_finance_sector' => $isFinSector,
                'role'              => $role,
                'permission_level'  => $pLevel,
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

        // ── طلبات الدفع لـ daily-payments (legacy) ────────────
        elseif ($action === 'payment_queue') {
            if ($userDeptCode !== 'FIN' && $permissionLevel !== 'system_admin')
                jsonOut(['success'=>false,'message'=>'غير مصرح'], 403);
            jsonOut(['success'=>true,'data'=>prGetPaymentRequests()]);
        }

        // ── طلبات الدفع المحسّنة (v2) ─────────────────────────
        // المصدر الوحيد لصفحة المدفوعات اليومية
        elseif ($action === 'payment_queue_v2') {
            $conn2 = db();
            $isPaymentRole = in_array($permissionLevel, ['system_admin','sector_head','division_manager','CEO'])
                || (($_qrRole = $conn2->query("SELECT role FROM employees WHERE id=$currentUserId LIMIT 1"))
                    && in_array($_qrRole->fetch_assoc()['role'] ?? '', ['payment','treasury_manager','admin']));
            if (!$isPaymentRole)
                jsonOut(['success'=>false,'message'=>'غير مصرح لعرض المدفوعات'], 403);
            jsonOut(['success'=>true,'data'=>prGetPaymentQueue()]);
        }

        // ── التحقق من رصيد حساب بنكي ─────────────────────────
        elseif ($action === 'check_bank_balance') {
            $accountId   = (int)($_GET['account_id'] ?? 0);
            $totalNeeded = (float)($_GET['total'] ?? 0);
            if (!$accountId) {
                // إرجاع أول حساب تشغيلي نشط تلقائياً
                $conn2 = db();
                $defR  = $conn2->query("
                    SELECT id, account_name, current_balance
                    FROM bank_accounts
                    WHERE is_active = 1
                    ORDER BY account_type = 'جاري' DESC, id ASC
                    LIMIT 1
                ");
                if (!$defR || !$defR->num_rows)
                    jsonOut(['success'=>false,'message'=>'لا يوجد حساب بنكي نشط']);
                $row = $defR->fetch_assoc();
                $accountId = (int)$row['id'];
                $balance   = (float)$row['current_balance'];
                $accName   = $row['account_name'];
            } else {
                $conn2 = db();
                $balR  = $conn2->query("SELECT account_name, current_balance FROM bank_accounts WHERE id=$accountId AND is_active=1 LIMIT 1");
                if (!$balR || !$balR->num_rows)
                    jsonOut(['success'=>false,'message'=>'الحساب غير موجود أو غير نشط']);
                $row     = $balR->fetch_assoc();
                $balance = (float)$row['current_balance'];
                $accName = $row['account_name'];
            }
            jsonOut([
                'success'      => true,
                'account_id'   => $accountId,
                'account_name' => $accName,
                'balance'      => $balance,
                'total_needed' => $totalNeeded,
                'sufficient'   => $balance >= $totalNeeded,
                'deficit'      => max(0, round($totalNeeded - $balance, 2)),
            ]);
        }

        // ── تنفيذ الدفع لطلب شراء ────────────────────────────
        // يُغلق مرحلة payment → completed ويُنشئ معاملة مالية مرتبطة
        elseif ($action === 'execute_pr_payment' && $method === 'POST') {
            $input   = json_decode(file_get_contents('php://input'), true) ?? [];
            $prId    = (int)($input['pr_id'] ?? 0);
            $ref     = $conn->real_escape_string($input['reference']    ?? '');
            $meth    = $conn->real_escape_string($input['method']       ?? 'تحويل بنكي');
            $notes   = $conn->real_escape_string($input['notes']        ?? '');

            if (!$prId) jsonOut(['success'=>false,'message'=>'معرّف الطلب مطلوب'], 400);

            $pr = prGetRequest($prId);
            if (!$pr) jsonOut(['success'=>false,'message'=>'الطلب غير موجود'], 404);
            if ($pr['current_stage'] !== 'payment')
                jsonOut(['success'=>false,'message'=>'الطلب ليس في مرحلة الدفع'], 400);

            // ① تسجيل بيانات الدفع
            $conn->query("
                UPDATE purchase_requests SET
                    payment_status      = 'مدفوع',
                    payment_ref         = '$ref',
                    payment_method      = '$meth',
                    payment_notes       = '$notes',
                    payment_executed_by = $currentUserId,
                    payment_executed_at = NOW(),
                    updated_at          = NOW()
                WHERE id = $prId
            ");

            // ② إغلاق كامل — workflow_stages + current_stage + SLA
            prFinalizeRequest($prId, $currentUserId, $ref);

            // ③ إنشاء معاملة مالية مرتبطة
            $txId = prCreateLinkedTransaction($prId, $currentUserId, $ref, $meth, $notes);
            if ($txId) {
                $conn->query("UPDATE purchase_requests SET linked_transaction_id=$txId WHERE id=$prId");
            }

            // ④ تسجيل الحدث
            prLogEvent($prId, 'payment_executed', $currentUserId, [
                'stage'       => 'payment',
                'description' => 'تم تنفيذ الدفع بواسطة: ' . prGetEmployeeName($currentUserId),
                'new_value'   => $ref ?: 'بدون مرجع',
            ]);

            jsonOut([
                'success'        => true,
                'message'        => 'تم تنفيذ الدفع وإغلاق الطلب بنجاح',
                'transaction_id' => $txId,
                'pr_id'          => $prId,
            ]);
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

        // ── اختيار مسار الحسابات: PO أو دفع مباشر ──────────────
        elseif ($action === 'accounts_choose_route') {
            $requestId = (int)($body['request_id'] ?? 0);
            $route     = $body['route'] ?? ''; // 'po' | 'direct'
            $notes     = trim($body['notes'] ?? '');
            if (!$requestId || !in_array($route, ['po','direct']))
                jsonOut(['success'=>false,'message'=>'البيانات ناقصة أو المسار غير صحيح'], 400);

            $conn = db();
            $req  = prGetRequest($requestId);
            if (!$req) jsonOut(['success'=>false,'message'=>'الطلب غير موجود'], 404);
            if ($req['current_stage'] !== 'accounts_review')
                jsonOut(['success'=>false,'message'=>'الطلب ليس في مرحلة الحسابات'], 400);

            // حفظ المسار المختار في الطلب
            @$conn->query("ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS payment_route ENUM('po','direct') DEFAULT NULL");
            $conn->query("UPDATE purchase_requests SET payment_route='$route' WHERE id=$requestId");

            // تحديث مرحلة الحسابات كـ approved
            $conn->query("UPDATE pr_workflow_stages SET status='approved', employee_id=$currentUserId, completed_at=NOW()
                          WHERE request_id=$requestId AND stage_name='accounts_review'");

            // تحديد المرحلة التالية
            $nextStage = $route === 'po' ? 'po_issuance' : 'payment';

            // إضافة مرحلة po_issuance للـ workflow إذا اختار PO
            if ($route === 'po') {
                $maxOrder = $conn->query("SELECT MAX(stage_order) AS m FROM pr_workflow_stages WHERE request_id=$requestId");
                $maxRow   = $maxOrder ? $maxOrder->fetch_assoc() : ['m' => 10];
                $newOrder = (int)($maxRow['m'] ?? 10) + 1;
                $conn->query("INSERT IGNORE INTO pr_workflow_stages
                    (request_id, stage_name, stage_order, status, arrived_at)
                    VALUES ($requestId, 'po_issuance', $newOrder, 'pending', NOW())");
            }

            // تحديث current_stage
            $notesEsc = $conn->real_escape_string($notes ?: ($route === 'po' ? 'تم اختيار مسار إصدار أمر الشراء' : 'تم اختيار مسار الدفع المباشر'));
            $conn->query("UPDATE purchase_requests SET current_stage='$nextStage' WHERE id=$requestId");
            $conn->query("UPDATE pr_workflow_stages SET status='in_progress', arrived_at=NOW(), started_at=NOW()
                          WHERE request_id=$requestId AND stage_name='$nextStage'");

            prEndSlaTracking($requestId, 'accounts_review');
            prStartSlaTracking($requestId, $nextStage);
            prLogEvent($requestId, 'stage_changed', $currentUserId, [
                'stage'       => 'accounts_review',
                'description' => $notesEsc,
                'new_value'   => $nextStage,
            ]);
            prNotifyStageRecipients($requestId, $nextStage, $req['request_number']);

            // ✅ إذا كان الوجهة مباشرة للدفع — يُعيّن payment_status = 'في الانتظار'
            // حتى تظهر في صفحة المدفوعات اليومية
            if ($nextStage === 'payment') {
                prSendToPayment($requestId, $currentUserId);
            }

            jsonOut(['success'=>true,'message'=>'تم اختيار المسار وإرسال الطلب','next_stage'=>$nextStage]);
        }

        // ── دفع دفعة من طلبات الشراء (batch) ────────────────
        elseif ($action === 'execute_batch_payment') {
            // صلاحية: مدير النظام أو أدوار الدفع
            $conn2      = db();
            $roleR2     = $conn2->query("SELECT role FROM employees WHERE id=$currentUserId LIMIT 1");
            $empRole    = $roleR2 ? ($roleR2->fetch_assoc()['role'] ?? '') : '';
            $canPay     = in_array($permissionLevel, ['system_admin','sector_head','division_manager','CEO'])
                       || in_array($empRole, ['payment','treasury_manager','admin']);
            if (!$canPay)
                jsonOut(['success'=>false,'message'=>'ليس لديك صلاحية إصدار أوامر الدفع'], 403);

            $prIds         = array_map('intval', $body['pr_ids']        ?? []);
            $method        = trim($body['method']                        ?? 'تحويل بنكي');
            $ref           = trim($body['ref']                           ?? '');
            $notes         = trim($body['notes']                         ?? '');
            $bankAccountId = (int)($body['bank_account_id']             ?? 0);

            if (empty($prIds))
                jsonOut(['success'=>false,'message'=>'لم يتم تحديد أي طلبات'], 400);

            $result = prExecuteBatchPayment($prIds, $currentUserId, $method, $ref, $notes, $bankAccountId);
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
            $conn2 = db();
            $isSupplyChain = $userDeptCode === 'PUR'
                          || strpos($userDeptCode, '41')        === 0
                          || strpos($userDeptCode, 'SEC-06')    === 0
                          || strpos($userDeptCode, 'DIV-SEC06') === 0
                          || prIsUserSupplyChain($conn2, $currentUserId)
                          || $permissionLevel === 'system_admin';
            if (!$isSupplyChain)
                jsonOut(['success'=>false,'message'=>'فقط موظفو المشتريات'], 403);

            $requestId = (int)($body['request_id'] ?? 0);
            $notes     = trim($body['notes'] ?? '');
            if (!$requestId) jsonOut(['success'=>false,'message'=>'معرّف الطلب مطلوب'], 400);

            $req = prGetRequest($requestId);
            if (!$req)
                jsonOut(['success'=>false,'message'=>'الطلب غير موجود'], 404);
            if ($req['current_stage'] !== 'purchasing')
                jsonOut(['success'=>false,'message'=>'الطلب ليس في مرحلة المشتريات'], 400);

            // هذا الإجراء للمسار الطويل فقط
            if ($req['workflow_path'] !== 'long')
                jsonOut(['success'=>false,'message'=>'موافقة CEO المبدئية للمسار الطويل فقط'], 400);

            // التحقق من وجود مرحلة ceo_approval في workflow_stages
            $hasCeo = $conn->query("
                SELECT id FROM pr_workflow_stages
                WHERE request_id=$requestId AND stage_name='ceo_approval'
                LIMIT 1
            ");
            if (!$hasCeo || !$hasCeo->num_rows)
                jsonOut(['success'=>false,'message'=>'مرحلة CEO غير موجودة في مسار هذا الطلب'], 400);

            $empName = prGetEmployeeName($currentUserId);

            // إغلاق مرحلة purchasing والانتقال لـ ceo_approval
            $conn->query("
                UPDATE pr_workflow_stages SET
                    status       = 'approved',
                    employee_id  = $currentUserId,
                    action       = 'إرسال لموافقة الرئيس التنفيذي',
                    completed_at = NOW(),
                    duration_min = TIMESTAMPDIFF(MINUTE, COALESCE(started_at, arrived_at), NOW())
                WHERE request_id = $requestId AND stage_name = 'purchasing'
            ");

            prEndSlaTracking($requestId, 'purchasing');
            prTransitionToStage($requestId, 'ceo_approval', $currentUserId);

            prLogEvent($requestId, 'stage_changed', $currentUserId, [
                'stage'       => 'purchasing',
                'description' => "$empName أرسل الطلب لموافقة الرئيس التنفيذي" . ($notes ? " — $notes" : ''),
                'old_value'   => 'purchasing',
                'new_value'   => 'ceo_approval',
            ]);

            jsonOut(['success'=>true,'message'=>'تم إرسال الطلب للرئيس التنفيذي للموافقة المبدئية']);
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
            $label = trim($_POST['file_label'] ?? '');
            $result = prUploadAttachment($requestId, $currentUserId, $_FILES['file'], $label);
            jsonOut($result, $result['success'] ? 200 : 400);
        }

        // ── ربط حجز الموازنة بالطلب ───────────────────────────
        elseif ($action === 'link_reservation') {
            $conn = db();
            $body = json_decode(file_get_contents('php://input'), true) ?? [];
            $requestId       = (int)($body['request_id']       ?? 0);
            $reservationId   = (int)($body['reservation_id']   ?? 0);
            $reservationNumber = $conn->real_escape_string($body['reservation_number'] ?? '');
            if (!$requestId || !$reservationId)
                jsonOut(['success'=>false,'message'=>'بيانات ناقصة'], 400);

            @$conn->query("ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS reservation_id INT DEFAULT NULL");
            @$conn->query("ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS reservation_number VARCHAR(50) DEFAULT NULL");
            @$conn->query("ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS budget_reservation_id INT DEFAULT NULL");

            // ربط الحجز بالطلب — يُعيَّن الحقلان لضمان إيجاد الطلب لاحقاً
            $conn->query("
                UPDATE purchase_requests
                SET reservation_id        = $reservationId,
                    reservation_number    = '$reservationNumber',
                    budget_reservation_id = $reservationId,
                    updated_at            = NOW()
                WHERE id = $requestId
            ");

            // تحديث الحجز بمعرّف الطلب (لضمان الربط الثنائي)
            @$conn->query("ALTER TABLE budget_reservations ADD COLUMN IF NOT EXISTS source_pr_id INT DEFAULT NULL");
            $conn->query("UPDATE budget_reservations SET source_pr_id=$requestId WHERE id=$reservationId");

            // إغلاق مرحلة purchasing وانتقال الطلب لـ waiting_budget_approval
            $req = prGetRequest($requestId);
            if ($req && $req['current_stage'] === 'purchasing') {
                $conn->query("
                    UPDATE pr_workflow_stages SET
                        status       = 'approved',
                        employee_id  = $currentUserId,
                        action       = 'إنشاء حجز الموازنة',
                        completed_at = NOW(),
                        duration_min = TIMESTAMPDIFF(MINUTE, COALESCE(started_at, arrived_at), NOW())
                    WHERE request_id = $requestId AND stage_name = 'purchasing'
                ");
                prEndSlaTracking($requestId, 'purchasing');
                prTransitionToStage($requestId, 'waiting_budget_approval', $currentUserId);
            }

            prLogEvent($requestId, 'budget_linked', $currentUserId, [
                'stage'       => 'purchasing',
                'description' => "تم ربط حجز الموازنة رقم {$reservationNumber} وإرساله للاعتماد",
                'new_value'   => $reservationNumber,
            ]);

            jsonOut(['success'=>true,'message'=>"تم ربط الحجز {$reservationNumber} وإرسال الطلب للاعتماد"]);
        }

        // ── حفظ أمر الدفع كمرفق في طلب الشراء ───────────────
        elseif ($action === 'save_payment_attachment') {
            $prId      = (int)($body['pr_id']      ?? 0);
            $orderRef  = trim($body['order_ref']   ?? '');
            $htmlContent = $body['html_content']   ?? '';
            $amount    = (float)($body['amount']   ?? 0);

            if (!$prId || !$orderRef)
                jsonOut(['success'=>false,'message'=>'pr_id و order_ref مطلوبان'], 400);

            $result = prSavePaymentOrderAttachment($prId, $currentUserId, $orderRef, $htmlContent, $amount);
            jsonOut($result, $result['success'] ? 200 : 400);
        }

        else {
            jsonOut(['success'=>false,'message'=>'إجراء غير معروف: '.$action], 400);
        }
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
               d.code  AS dept_code,  d.name  AS dept_name,
               ds.code AS sector_code, ds.name AS sector_name,
               dd.code AS division_code, dd.name AS div_name
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

    // الأدوار التي ترى الكل (بما فيها receiver لمرحلة الاستلام)
    $rolesViewAll = ['budget', 'payment', 'dispatch', 'treasury_manager', 'CEO', 'admin', 'purchasing', 'receiver'];
    if (in_array($role, $rolesViewAll)) return true;

    // القطاع المالي (بالكود أو الاسم) → يرى الكل
    $isFinance = in_array($deptCodeDB, ['FIN']) || in_array($sectorCode, ['FIN'])
        || preg_match('/^31/i', $deptCodeDB) || preg_match('/^31/i', $sectorCode)
        || stripos($empRow['dept_name']   ?? '', 'مال') !== false
        || stripos($empRow['sector_name'] ?? '', 'مال') !== false
        || stripos($empRow['dept_name']   ?? '', 'financ') !== false
        || stripos($empRow['sector_name'] ?? '', 'financ') !== false;
    if ($isFinance) return true;

    // سلاسل الإمداد — بالكود أو الدور أو اسم القسم/القطاع
    $isSupplyChainRole = in_array($role, ['purchasing', 'dispatch', 'receiver']);
    $allCodes = [$deptCodeDB, $sectorCode, $divCode, $deptCode];
    $isSupplyChainCode = false;
    foreach ($allCodes as $c) {
        if ($c === 'PUR' || $c === 'SEC-06'
            || strpos((string)$c, '41')        === 0
            || strpos((string)$c, 'SEC-06')    === 0
            || strpos((string)$c, 'DIV-SEC06') === 0
        ) { $isSupplyChainCode = true; break; }
    }
    // sector_id = 6 (قطاع سلاسل الإمداد)
    if (!$isSupplyChainCode) {
        $deptIdCV = (int)($empRow['department_id'] ?? $deptId);
        if ($deptIdCV > 0) {
            $scr = $conn->query("SELECT sector_id, parent_id FROM departments WHERE id=$deptIdCV LIMIT 1");
            if ($scr && ($sd = $scr->fetch_assoc())) {
                if ((int)($sd['sector_id'] ?? 0) === 6 || (int)($sd['parent_id'] ?? 0) === 6)
                    $isSupplyChainCode = true;
            }
        }
    }
    // فحص الاسم
    $scKeywords = ['مشتريات', 'سلاسل', 'supply', 'procurement'];
    $allNames = [
        mb_strtolower($empRow['dept_name']    ?? ''),
        mb_strtolower($empRow['sector_name']  ?? ''),
        mb_strtolower($empRow['div_name']     ?? ''),
    ];
    $isSupplyChainName = false;
    foreach ($allNames as $_n) {
        foreach ($scKeywords as $_kw) {
            if (mb_strpos($_n, $_kw) !== false) { $isSupplyChainName = true; break 2; }
        }
    }
    if ($isSupplyChainRole || $isSupplyChainCode || $isSupplyChainName) {
        $purchasingStages = ['purchasing', 'waiting_budget_approval', 'ceo_approval'];
        if (in_array($req['current_stage'], $purchasingStages)) return true;
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

function prUploadAttachment(int $requestId, int $uploadedBy, array $file, string $label = ''): array {
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
    @$conn->query("ALTER TABLE pr_attachments ADD COLUMN IF NOT EXISTS file_label VARCHAR(200) DEFAULT NULL");
    $req      = prGetRequest($requestId);
    $stage    = $conn->real_escape_string($req['current_stage'] ?? '');
    $orig     = $conn->real_escape_string($file['name']);
    $fName    = $conn->real_escape_string($fileName);
    $fPath    = $conn->real_escape_string('uploads/purchase_requests/'.$fileName);
    $fType    = $conn->real_escape_string($file['type'] ?? '');
    $fSize    = (int)$file['size'];
    $fLabel   = $conn->real_escape_string($label ?: $file['name']);

    $conn->query("
        INSERT INTO pr_attachments (request_id,file_name,original_name,file_path,file_type,file_size,uploaded_by,stage,file_label,uploaded_at)
        VALUES ($requestId,'$fName','$orig','$fPath','$fType',$fSize,$uploadedBy,'$stage','$fLabel',NOW())
    ");

    prLogEvent($requestId, 'attachment_added', $uploadedBy, [
        'stage'       => $stage,
        'description' => 'تم رفع مرفق: '.$file['name'],
        'new_value'   => $fileName,
    ]);

    return ['success'=>true,'message'=>'تم رفع الملف','file_path'=>'uploads/purchase_requests/'.$fileName,'original_name'=>$file['name']];
}