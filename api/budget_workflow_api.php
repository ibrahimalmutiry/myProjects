<?php
/**
 * ══════════════════════════════════════════════════════════════════
 *  budget_workflow_api.php
 *  نظام Workflow الموازنة المتكامل
 *  ─────────────────────────────────────────────────────────────────
 *  الدورة: مسودة → قيد المراجعة → معتمد مبدئياً → معتمد نهائياً
 *  المراحل: إنشاء → موظف الموازنة → الرئيس التنفيذي → تنفيذ
 *  الميزات:
 *    - إنشاء معاملة مالية تلقائياً عند إنشاء الحجز
 *    - ترقيم تلقائي فريد (حجز + معاملة)
 *    - اعتماد ثنائي المرحلة (Budget → CEO)
 *    - توجيه مع خيارات محددة
 *    - إعادة مراجعة بعد الرفض
 *    - تتبع SLA/OLA لكل مرحلة
 *    - سجل تدقيق كامل (Audit Trail)
 * ══════════════════════════════════════════════════════════════════
 */

ob_start();
session_start();
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../includes/functions.php';

if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'غير مصرح — يجب تسجيل الدخول'], JSON_UNESCAPED_UNICODE);
    exit;
}

$userId       = (int)$_SESSION['user_id'];
$userName     = $_SESSION['user_name']        ?? 'مستخدم';
$userRole     = $_SESSION['user_role']        ?? 'employee';
$permLevel    = $_SESSION['permission_level'] ?? 'employee';
$departmentId = $_SESSION['department_id']    ?? null;

$conn   = db();
$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

// ══════════════════════════════════════════════════════════════
//  تهيئة الهيكل — يُنفَّذ مرة واحدة في كل طلب
// ══════════════════════════════════════════════════════════════
_ensureWorkflowSchema($conn);

// ══════════════════════════════════════════════════════════════
//  مساعدات الصلاحية
// ══════════════════════════════════════════════════════════════
// ✅ الطبقة الجديدة: بناءً على القطاع والقسم بدلاً من role
$_empSectorR = $conn->query("
    SELECT e.department_id,
           COALESCE(d.sector_id, IF(d.dept_type='sector', d.id, d.parent_id)) AS sector_id
    FROM employees e
    LEFT JOIN departments d ON d.id = e.department_id
    WHERE e.id = $userId LIMIT 1
");
$_empSector = $_empSectorR ? $_empSectorR->fetch_assoc() : [];
$_sectorId  = (int)($_empSector['sector_id'] ?? 0);
$_deptId    = (int)($_empSector['department_id'] ?? 0);

$isBudgetOfficer = $permLevel === 'system_admin'
    || ($_sectorId === 4 && in_array($_deptId, [33, 34]));

$isCEO = $permLevel === 'system_admin'
      || in_array($permLevel, ['CEO']);

// ══════════════════════════════════════════════════════════════
//  Router
// ══════════════════════════════════════════════════════════════
try {
    switch ($action) {

        // ── إنشاء حجز جديد مع معاملة مالية مرتبطة ──────────────
        case 'create':
            _requirePost();
            $body = _json();

            $purpose     = _esc($conn, $body['purpose']         ?? '');
            $itemsDesc   = _esc($conn, $body['items_description'] ?? '');
            if (!$purpose || !$itemsDesc) {
                _fail('الغرض وبنود الحجز إلزامية', 400);
            }

            // تحديد القسم
            $deptId = _resolveDept($conn, $userId, (int)($body['department_id'] ?? 0));

            // بيانات الحجز
            $resNumber   = _generateResNumber($conn);
            $fiscalYear  = (int)date('y');
            $priority    = _esc($conn, $body['priority']             ?? 'عادي');
            $budgetCat   = _esc($conn, $body['budget_category']      ?? '');
            $costCenter  = _esc($conn, $body['cost_center']          ?? '');
            $suppId      = (!empty($body['supplier_id']) && $body['supplier_id'] !== 'manual')
                            ? (int)$body['supplier_id'] : 'NULL';
            $suppManual  = _esc($conn, $body['supplier_name_manual'] ?? '');
            $quotNo      = _esc($conn, $body['quotation_number']     ?? '');
            $quotDate    = !empty($body['quotation_date'])
                            ? "'" . _esc($conn, $body['quotation_date']) . "'" : 'NULL';
            $currency    = strtoupper(_esc($conn, $body['currency']  ?? 'SAR'));
            $reqDate     = _esc($conn, $body['request_date']         ?? date('Y-m-d'));
            $budgetPlanId = !empty($body['budget_plan_id']) ? (int)$body['budget_plan_id'] : 'NULL';

            // حساب الإجماليات من الأصناف
            $itemsArr   = is_array($body['items'] ?? null) ? $body['items'] : [];
            $grandTotal = 0;
            foreach ($itemsArr as $it) {
                $grandTotal += round((float)($it['qty'] ?? 1) * (float)($it['price'] ?? $it['unit_price'] ?? 0), 2);
            }
            if (!$grandTotal) $grandTotal = (float)($body['total_amount'] ?? 0);

            // سعر الصرف
            $exchangeRate = 1.0;
            if ($currency !== 'SAR') {
                $manRate = (float)($body['exchange_rate'] ?? 0);
                $exchangeRate = $manRate > 0 ? $manRate : _getExchangeRate($conn, $currency);
            }
            $grandTotalSar = round($grandTotal * $exchangeRate, 2);

            // ── المعاملة المالية المرتبطة ────────────────────────
            $txNumber = _generateTxNumber($conn);
            $txDesc   = _esc($conn, "حجز موازنة: {$purpose}");
            $txTypeId = _getOrCreateBudgetTxType($conn);

            $conn->begin_transaction();
            try {
                // إدراج المعاملة المالية
                $conn->query("
                    INSERT INTO transactions
                        (transaction_number, type_id, description, amount, currency,
                         exchange_rate, amount_sar, priority, created_by, created_at)
                    VALUES
                        ('$txNumber', $txTypeId, '$txDesc', $grandTotal, '$currency',
                         $exchangeRate, $grandTotalSar, 'normal', $userId, NOW())
                ");
                $txId = $conn->insert_id;
                if (!$txId) throw new Exception('فشل إنشاء المعاملة المالية: ' . $conn->error);

                // إدراج الحجز مع ربطه بالمعاملة
                $conn->query("
                    INSERT INTO budget_reservations
                        (reservation_number, fiscal_year, department_id, requested_by,
                         request_date, purpose, priority, budget_category, cost_center,
                         supplier_id, supplier_name_manual, quotation_number, quotation_date,
                         items_description, grand_total, currency, exchange_rate,
                         exchange_rate_sar, grand_total_sar, amount_sar,
                         budget_plan_id, transaction_id,
                         status, workflow_stage, created_at)
                    VALUES
                        ('$resNumber', $fiscalYear, $deptId, $userId,
                         '$reqDate', '$purpose', '$priority', '$budgetCat', '$costCenter',
                         $suppId, '$suppManual', '$quotNo', $quotDate,
                         '$itemsDesc', $grandTotal, '$currency', $exchangeRate,
                         $exchangeRate, $grandTotalSar, $grandTotalSar,
                         $budgetPlanId, $txId,
                         'قيد المراجعة', 'budget_review', NOW())
                ");
                $resId = $conn->insert_id;
                if (!$resId) throw new Exception('فشل إنشاء الحجز: ' . $conn->error);

                // حفظ الأصناف
                foreach ($itemsArr as $i => $it) {
                    $iDesc  = _esc($conn, $it['description'] ?? '');
                    $iQty   = (float)($it['qty']   ?? 1);
                    $iPrice = (float)($it['price']  ?? $it['unit_price'] ?? 0);
                    $iUnit  = _esc($conn, $it['unit'] ?? '');
                    $iTotal = round($iQty * $iPrice, 2);
                    $iNotes = _esc($conn, $it['notes'] ?? '');
                    $conn->query("
                        INSERT INTO budget_reservation_items
                            (reservation_id, sort_order, description, qty, unit, unit_price, line_total, notes)
                        VALUES ($resId, $i, '$iDesc', $iQty, '$iUnit', $iPrice, $iTotal, '$iNotes')
                    ");
                }

                // تسجيل حدث الإنشاء في Workflow Log
                _logWorkflow($conn, [
                    'reservation_id' => $resId,
                    'transaction_id' => $txId,
                    'actor_id'       => $userId,
                    'actor_name'     => $userName,
                    'event_type'     => 'create',
                    'old_status'     => null,
                    'new_status'     => 'قيد المراجعة',
                    'notes'          => "إنشاء حجز جديد — معاملة مالية: $txNumber",
                    'workflow_stage' => 'budget_review',
                ]);

                // تسجيل SLA — بدء مرحلة Budget Review
                _recordSlaEvent($conn, $resId, $txId, 'budget_review', 'start', $userId);

                $conn->commit();
            } catch (Exception $e) {
                $conn->rollback();
                _fail($e->getMessage(), 500);
            }

            _ok([
                'reservation_id'     => $resId,
                'reservation_number' => $resNumber,
                'transaction_id'     => $txId,
                'transaction_number' => $txNumber,
                'message'            => 'تم إنشاء الحجز والمعاملة المالية بنجاح',
            ]);
            break;

        // ── الاعتماد المبدئي من موظف الموازنة ────────────────────
        case 'budget_preapprove':
            _requirePost();
            if (!$isBudgetOfficer) _fail('صلاحية موظف الموازنة فقط', 403);

            $body   = _json();
            $resId  = (int)($body['reservation_id'] ?? 0);
            $notes  = _esc($conn, $body['notes']    ?? '');
            if (!$resId) _fail('reservation_id مطلوب', 400);

            $res = _getReservation($conn, $resId);
            if (!$res) _fail('الحجز غير موجود', 404);

            $allowedStatuses = ['قيد المراجعة', 'مرفوض', 'موجّه'];
            if (!in_array($res['status'], $allowedStatuses)) {
                _fail("لا يمكن اعتماد حجز بحالة: {$res['status']}", 400);
            }

            $oldStatus = $res['status'];
            $txId      = (int)$res['transaction_id'];

            $conn->begin_transaction();
            try {
                $conn->query("
                    UPDATE budget_reservations SET
                        status             = 'معتمد مبدئياً',
                        workflow_stage     = 'ceo_review',
                        pre_approved_by    = $userId,
                        pre_approved_at    = NOW(),
                        pre_approval_notes = '$notes',
                        budget_employee_id = $userId,
                        budget_review_date = NOW(),
                        budget_code        = '{$res['reservation_number']}',
                        updated_at         = NOW()
                    WHERE id = $resId
                ");

                // تحديث حالة المعاملة إلى "معتمد مبدئياً"
                if ($txId) {
                    $conn->query("
                        UPDATE transactions SET
                            status     = 'معتمد مبدئياً',
                            updated_at = NOW()
                        WHERE id = $txId
                    ");

                    // ✅ تسجيل إكمال مرحلة budget في stage_times
                    recordStageTimeFromLastUpdate($txId, 'budget', $userId, 'معتمد مبدئياً');
                }

                // إنهاء SLA مرحلة Budget + بدء مرحلة CEO
                _recordSlaEvent($conn, $resId, $txId, 'budget_review', 'end', $userId);
                _recordSlaEvent($conn, $resId, $txId, 'ceo_review',    'start', $userId);

                _logWorkflow($conn, [
                    'reservation_id' => $resId,
                    'transaction_id' => $txId,
                    'actor_id'       => $userId,
                    'actor_name'     => $userName,
                    'event_type'     => 'budget_preapprove',
                    'old_status'     => $oldStatus,
                    'new_status'     => 'معتمد مبدئياً',
                    'notes'          => $notes,
                    'workflow_stage' => 'ceo_review',
                ]);

                // ✅ تسجيل في transaction_events و activity_log
                if ($txId) {
                    logTransactionEvent(
                        $txId, 'budget', 'اعتماد مبدئي',
                        $oldStatus, 'معتمد مبدئياً',
                        $notes ?: "اعتماد مبدئي من موظف الموازنة — تحويل للرئيس التنفيذي"
                    );
                    logActivity($txId, 'اعتماد مبدئي من موظف الموازنة',
                        "تم الاعتماد المبدئي بواسطة: $userName — تحويل للرئيس التنفيذي");
                }

                $conn->commit();
            } catch (Exception $e) {
                $conn->rollback();
                _fail($e->getMessage(), 500);
            }

            _ok(['message' => 'تم الاعتماد المبدئي — تحويل تلقائي إلى الرئيس التنفيذي']);
            break;

        // ── رفض من موظف الموازنة ────────────────────────────────
        case 'budget_reject':
            _requirePost();
            if (!$isBudgetOfficer) _fail('صلاحية موظف الموازنة فقط', 403);

            $body   = _json();
            $resId  = (int)($body['reservation_id'] ?? 0);
            $reason = _esc($conn, $body['rejection_reason'] ?? '');
            $notes  = _esc($conn, $body['notes']            ?? '');
            if (!$resId) _fail('reservation_id مطلوب', 400);

            $res = _getReservation($conn, $resId);
            if (!$res) _fail('الحجز غير موجود', 404);

            $oldStatus = $res['status'];
            $txId      = (int)$res['transaction_id'];

            $conn->begin_transaction();
            try {
                $conn->query("
                    UPDATE budget_reservations SET
                        status             = 'مرفوض',
                        workflow_stage     = 'rejected',
                        rejection_reason   = '$reason',
                        budget_employee_id = $userId,
                        budget_review_date = NOW(),
                        updated_at         = NOW()
                    WHERE id = $resId
                ");

                if ($txId) {
                    $conn->query("UPDATE transactions SET status='مرفوض', updated_at=NOW() WHERE id=$txId");
                }

                _recordSlaEvent($conn, $resId, $txId, 'budget_review', 'end', $userId);

                _logWorkflow($conn, [
                    'reservation_id' => $resId,
                    'transaction_id' => $txId,
                    'actor_id'       => $userId,
                    'actor_name'     => $userName,
                    'event_type'     => 'budget_reject',
                    'old_status'     => $oldStatus,
                    'new_status'     => 'مرفوض',
                    'notes'          => $reason ?: $notes,
                    'workflow_stage' => 'rejected',
                ]);

                // ✅ تسجيل في transaction_events و activity_log
                if ($txId) {
                    logTransactionEvent(
                        $txId, 'budget', 'رفض',
                        $oldStatus, 'مرفوض',
                        $reason ?: $notes ?: "رفض من موظف الموازنة"
                    );
                    logActivity($txId, 'رفض من موظف الموازنة',
                        "تم الرفض بواسطة: $userName" . ($reason ? " — السبب: $reason" : ''));
                }

                $conn->commit();
            } catch (Exception $e) {
                $conn->rollback();
                _fail($e->getMessage(), 500);
            }

            _ok(['message' => 'تم رفض الحجز — يمكن للمقدِّم تعديله وإعادة إرساله']);
            break;

        // ── الاعتماد النهائي من الرئيس التنفيذي ─────────────────
        case 'ceo_approve':
            _requirePost();
            if (!$isCEO) _fail('صلاحية الرئيس التنفيذي فقط', 403);

            $body  = _json();
            $resId = (int)($body['reservation_id'] ?? 0);
            $notes = _esc($conn, $body['notes']    ?? '');
            if (!$resId) _fail('reservation_id مطلوب', 400);

            $res = _getReservation($conn, $resId);
            if (!$res) _fail('الحجز غير موجود', 404);

            if ($res['status'] !== 'معتمد مبدئياً') {
                _fail("الحجز يجب أن يكون في مرحلة 'معتمد مبدئياً' — الحالة الحالية: {$res['status']}", 400);
            }

            $oldStatus = $res['status'];
            $txId      = (int)$res['transaction_id'];

            $conn->begin_transaction();
            try {
                $conn->query("
                    UPDATE budget_reservations SET
                        status          = 'معتمد نهائياً',
                        workflow_stage  = 'completed',
                        ceo_approved_by = $userId,
                        ceo_approved_at = NOW(),
                        ceo_notes       = '$notes',
                        approved_by     = $userId,
                        approved_at     = NOW(),
                        updated_at      = NOW()
                    WHERE id = $resId
                ");

                // تفعيل / ترحيل المعاملة المالية المرتبطة
                if ($txId) {
                    $conn->query("
                        UPDATE transactions SET
                            status     = 'معتمد نهائياً',
                            updated_at = NOW()
                        WHERE id = $txId
                    ");

                    // تحديث budget_data
                    $budCode = _esc($conn, $res['reservation_number']);
                    $conn->query("
                        INSERT INTO budget_data
                            (transaction_id, employee_id, budget_code, budget_status, notes, review_date)
                        VALUES ($txId, $userId, '$budCode', 'معتمد', '$notes', NOW())
                        ON DUPLICATE KEY UPDATE
                            budget_status = 'معتمد',
                            notes         = VALUES(notes),
                            review_date   = VALUES(review_date)
                    ");

                    recordStageTimeFromLastUpdate($txId, 'ceo', $userId, 'معتمد نهائياً');
                }

                _recordSlaEvent($conn, $resId, $txId, 'ceo_review', 'end', $userId);

                // تسجيل في ceo_approval_actions (للتوافق مع الصفحة الموجودة)
                $actorPos = _esc($conn, 'الرئيس التنفيذي');
                $conn->query("
                    INSERT INTO ceo_approval_actions
                        (reservation_id, action_type, action_by, actor_name, actor_position, notes)
                    VALUES ($resId, 'اعتماد', $userId, '$userName', '$actorPos', '$notes')
                ");

                _logWorkflow($conn, [
                    'reservation_id' => $resId,
                    'transaction_id' => $txId,
                    'actor_id'       => $userId,
                    'actor_name'     => $userName,
                    'event_type'     => 'ceo_approve',
                    'old_status'     => $oldStatus,
                    'new_status'     => 'معتمد نهائياً',
                    'notes'          => $notes,
                    'workflow_stage' => 'completed',
                ]);

                // ✅ تسجيل في transaction_events و activity_log
                if ($txId) {
                    logTransactionEvent(
                        $txId, 'budget', 'اعتماد نهائي من الرئيس التنفيذي',
                        $oldStatus, 'معتمد نهائياً',
                        $notes ?: "اعتماد نهائي من الرئيس التنفيذي"
                    );
                    logActivity($txId, 'اعتماد نهائي من الرئيس التنفيذي',
                        "تم الاعتماد النهائي بواسطة: $userName");
                }

                $conn->commit();
            } catch (Exception $e) {
                $conn->rollback();
                _fail($e->getMessage(), 500);
            }

            _ok(['message' => 'تم الاعتماد النهائي من الرئيس التنفيذي — المعاملة المالية مُفعَّلة']);
            break;

        // ── رفض من الرئيس التنفيذي ───────────────────────────────
        case 'ceo_reject':
            _requirePost();
            if (!$isCEO) _fail('صلاحية الرئيس التنفيذي فقط', 403);

            $body   = _json();
            $resId  = (int)($body['reservation_id'] ?? 0);
            $reason = _esc($conn, $body['rejection_reason'] ?? '');
            $notes  = _esc($conn, $body['notes']            ?? '');
            if (!$resId) _fail('reservation_id مطلوب', 400);

            $res = _getReservation($conn, $resId);
            if (!$res) _fail('الحجز غير موجود', 404);

            $oldStatus = $res['status'];
            $txId      = (int)$res['transaction_id'];

            $conn->begin_transaction();
            try {
                $conn->query("
                    UPDATE budget_reservations SET
                        status          = 'مرفوض',
                        workflow_stage  = 'rejected',
                        ceo_approved_by = $userId,
                        ceo_approved_at = NOW(),
                        ceo_notes       = '$reason',
                        rejection_reason= '$reason',
                        updated_at      = NOW()
                    WHERE id = $resId
                ");

                if ($txId) {
                    $conn->query("UPDATE transactions SET status='مرفوض', updated_at=NOW() WHERE id=$txId");
                }

                $actorPos = _esc($conn, 'الرئيس التنفيذي');
                $conn->query("
                    INSERT INTO ceo_approval_actions
                        (reservation_id, action_type, action_by, actor_name, actor_position, notes)
                    VALUES ($resId, 'رفض', $userId, '$userName', '$actorPos', '$reason')
                ");

                _recordSlaEvent($conn, $resId, $txId, 'ceo_review', 'end', $userId);

                _logWorkflow($conn, [
                    'reservation_id' => $resId,
                    'transaction_id' => $txId,
                    'actor_id'       => $userId,
                    'actor_name'     => $userName,
                    'event_type'     => 'ceo_reject',
                    'old_status'     => $oldStatus,
                    'new_status'     => 'مرفوض',
                    'notes'          => $reason,
                    'workflow_stage' => 'rejected',
                ]);

                // ✅ تسجيل في transaction_events و activity_log
                if ($txId) {
                    logTransactionEvent(
                        $txId, 'budget', 'رفض من الرئيس التنفيذي',
                        $oldStatus, 'مرفوض',
                        $reason ?: "رفض من الرئيس التنفيذي"
                    );
                    logActivity($txId, 'رفض من الرئيس التنفيذي',
                        "تم الرفض بواسطة: $userName" . ($reason ? " — السبب: $reason" : ''));
                }

                $conn->commit();
            } catch (Exception $e) {
                $conn->rollback();
                _fail($e->getMessage(), 500);
            }

            _ok(['message' => 'تم رفض الحجز من الرئيس التنفيذي — يمكن للمقدِّم تعديله وإعادة إرساله']);
            break;

        // ── توجيه الحجز ──────────────────────────────────────────
        case 'forward':
            _requirePost();
            $body           = _json();
            $resId          = (int)($body['reservation_id'] ?? 0);
            $forwardingType = _esc($conn, $body['forwarding_type'] ?? ''); // للدراسة / للمراجعة / للاستكمال
            $forwardedTo    = _esc($conn, $body['forwarded_to']    ?? ''); // جهة التوجيه أو user id
            $notes          = _esc($conn, $body['notes']           ?? '');

            $validTypes = ['للدراسة', 'للمراجعة', 'للاستكمال', 'للإعادة', 'للتحقق'];
            if (!$resId || !$forwardingType) _fail('reservation_id و forwarding_type مطلوبان', 400);
            if (!in_array($forwardingType, $validTypes)) _fail('نوع التوجيه غير صالح', 400);

            $res = _getReservation($conn, $resId);
            if (!$res) _fail('الحجز غير موجود', 404);

            $oldStatus = $res['status'];
            $txId      = (int)$res['transaction_id'];

            $conn->begin_transaction();
            try {
                $conn->query("
                    UPDATE budget_reservations SET
                        status         = 'موجّه',
                        workflow_stage = 'forwarded',
                        updated_at     = NOW()
                    WHERE id = $resId
                ");

                // تسجيل التوجيه في جدول مستقل
                $conn->query("
                    INSERT INTO budget_forwarding_records
                        (reservation_id, transaction_id, forwarding_type, forwarded_to,
                         forwarded_by, forwarded_by_name, notes, status, created_at)
                    VALUES
                        ($resId, " . ($txId ?: 'NULL') . ", '$forwardingType', '$forwardedTo',
                         $userId, '$userName', '$notes', 'مفتوح', NOW())
                ");
                $fwdId = $conn->insert_id;

                _logWorkflow($conn, [
                    'reservation_id'  => $resId,
                    'transaction_id'  => $txId,
                    'actor_id'        => $userId,
                    'actor_name'      => $userName,
                    'event_type'      => 'forward',
                    'old_status'      => $oldStatus,
                    'new_status'      => 'موجّه',
                    'notes'           => "$forwardingType → $forwardedTo: $notes",
                    'workflow_stage'  => 'forwarded',
                    'forwarding_id'   => $fwdId,
                    'forwarding_type' => $forwardingType,
                    'forwarding_to'   => $forwardedTo,
                ]);

                $conn->commit();
            } catch (Exception $e) {
                $conn->rollback();
                _fail($e->getMessage(), 500);
            }

            _ok(['message' => "تم توجيه الحجز ($forwardingType) إلى: $forwardedTo"]);
            break;

        // ── إعادة إرسال بعد الرفض / التعديل ─────────────────────
        case 'resubmit':
            _requirePost();
            $body    = _json();
            $resId   = (int)($body['reservation_id'] ?? 0);
            $notes   = _esc($conn, $body['notes']    ?? '');
            if (!$resId) _fail('reservation_id مطلوب', 400);

            $res = _getReservation($conn, $resId);
            if (!$res) _fail('الحجز غير موجود', 404);

            // السماح فقط للمقدِّم الأصلي أو الأدمن
            if ($res['requested_by'] != $userId && !$isBudgetOfficer) {
                _fail('يمكن فقط للمقدِّم الأصلي إعادة إرسال الحجز', 403);
            }

            $allowResubmit = ['مرفوض', 'موجّه'];
            if (!in_array($res['status'], $allowResubmit)) {
                _fail("لا يمكن إعادة إرسال حجز بحالة: {$res['status']}", 400);
            }

            $oldStatus = $res['status'];
            $txId      = (int)$res['transaction_id'];

            // تحديد المرحلة الصحيحة — إذا كان مرفوضاً بعد CEO نعود للبداية، وإلا للموازنة
            $wasAtCeo     = $res['ceo_approved_by'] || $res['workflow_stage'] === 'rejected_by_ceo';
            $newStage     = 'budget_review';
            $newStatus    = 'قيد المراجعة';

            $conn->begin_transaction();
            try {
                $conn->query("
                    UPDATE budget_reservations SET
                        status           = '$newStatus',
                        workflow_stage   = '$newStage',
                        rejection_reason = NULL,
                        ceo_notes        = NULL,
                        updated_at       = NOW()
                    WHERE id = $resId
                ");

                if ($txId) {
                    $conn->query("UPDATE transactions SET status='قيد المراجعة', updated_at=NOW() WHERE id=$txId");
                }

                _recordSlaEvent($conn, $resId, $txId, 'resubmit', 'event', $userId);
                _recordSlaEvent($conn, $resId, $txId, 'budget_review', 'start', $userId);

                _logWorkflow($conn, [
                    'reservation_id' => $resId,
                    'transaction_id' => $txId,
                    'actor_id'       => $userId,
                    'actor_name'     => $userName,
                    'event_type'     => 'resubmit',
                    'old_status'     => $oldStatus,
                    'new_status'     => $newStatus,
                    'notes'          => "إعادة إرسال: $notes",
                    'workflow_stage' => $newStage,
                ]);

                $conn->commit();
            } catch (Exception $e) {
                $conn->rollback();
                _fail($e->getMessage(), 500);
            }

            _ok(['message' => 'تمت إعادة الإرسال — الحجز في قائمة مراجعة موظف الموازنة']);
            break;

        // ── جلب Timeline / سجل الأحداث الكامل ──────────────────
        case 'timeline':
            $resId = (int)($_GET['reservation_id'] ?? 0);
            if (!$resId) _fail('reservation_id مطلوب', 400);

            $res = _getReservation($conn, $resId);
            if (!$res) _fail('الحجز غير موجود', 404);

            // أحداث Workflow
            $events = [];
            $evRes  = $conn->query("
                SELECT wl.*,
                       e.name AS actor_display_name,
                       e.role AS actor_role
                FROM budget_workflow_log wl
                LEFT JOIN employees e ON e.id = wl.actor_id
                WHERE wl.reservation_id = $resId
                ORDER BY wl.created_at ASC
            ");
            if ($evRes) while ($ev = $evRes->fetch_assoc()) $events[] = $ev;

            // SLA مراحل
            $sla = [];
            $slaRes = $conn->query("
                SELECT * FROM budget_sla_tracking
                WHERE reservation_id = $resId
                ORDER BY started_at ASC
            ");
            if ($slaRes) while ($s = $slaRes->fetch_assoc()) $sla[] = $s;

            // توجيهات
            $forwards = [];
            $fwdRes   = $conn->query("
                SELECT bf.*,
                       e.name AS forwarded_by_display
                FROM budget_forwarding_records bf
                LEFT JOIN employees e ON e.id = bf.forwarded_by
                WHERE bf.reservation_id = $resId
                ORDER BY bf.created_at ASC
            ");
            if ($fwdRes) while ($f = $fwdRes->fetch_assoc()) $forwards[] = $f;

            // حساب مدة كل مرحلة
            $stageDurations = _calcStageDurations($sla);

            _ok([
                'reservation'    => $res,
                'events'         => $events,
                'sla_tracking'   => $sla,
                'forwards'       => $forwards,
                'stage_durations'=> $stageDurations,
            ]);
            break;

        // ── قائمة الحجوزات مع حالة Workflow ─────────────────────
        case 'list':
            $where  = [];
            $stage  = _esc($conn, $_GET['workflow_stage'] ?? '');
            $status = _esc($conn, $_GET['status']         ?? '');
            $search = _esc($conn, $_GET['search']         ?? '');
            $year   = (int)($_GET['fiscal_year'] ?? 0);
            $page   = max(1, (int)($_GET['page']     ?? 1));
            $perPg  = max(1, min(200, (int)($_GET['per_page'] ?? 25)));

            // صلاحيات العرض
            $canViewAll = $isBudgetOfficer || $isCEO;
            if (!$canViewAll) {
                $myDept  = _esc($conn, getDepartmentByEmployee($conn, $userId));
                $where[] = $myDept
                    ? "(br.department_id = $myDept OR br.requested_by = $userId)"
                    : "br.requested_by = $userId";
            }

            if ($stage)  $where[] = "br.workflow_stage = '$stage'";
            if ($status) $where[] = "br.status = '$status'";
            if ($year)   $where[] = "br.fiscal_year = $year";
            if ($search) $where[] = "(br.reservation_number LIKE '%$search%' OR br.purpose LIKE '%$search%')";

            $wSql   = $where ? 'WHERE ' . implode(' AND ', $where) : '';
            $offset = ($page - 1) * $perPg;

            $countRes = $conn->query("SELECT COUNT(*) c FROM budget_reservations br $wSql");
            $total    = ($countRes && ($cr = $countRes->fetch_assoc())) ? (int)$cr['c'] : 0;

            $listRes = $conn->query("
                SELECT br.*,
                       d.name  AS department_name,
                       e.name  AS requested_by_name,
                       eb.name AS budget_officer_name,
                       ec.name AS ceo_approver_name,
                       t.transaction_number,
                       t.status AS transaction_status,
                       pr.request_number AS pr_request_number,
                       (SELECT COUNT(*) FROM budget_workflow_log wl WHERE wl.reservation_id = br.id) AS events_count,
                       (SELECT MAX(wl2.created_at) FROM budget_workflow_log wl2 WHERE wl2.reservation_id = br.id) AS last_event_at,
                       bst.stage_name AS current_sla_stage,
                       bst.started_at AS sla_started_at,
                       TIMESTAMPDIFF(HOUR, bst.started_at, NOW()) AS hours_in_stage
                FROM budget_reservations br
                LEFT JOIN departments d   ON br.department_id   = d.id
                LEFT JOIN employees   e   ON br.requested_by    = e.id
                LEFT JOIN employees   eb  ON br.pre_approved_by = eb.id
                LEFT JOIN employees   ec  ON br.ceo_approved_by = ec.id
                LEFT JOIN transactions t  ON br.transaction_id  = t.id
                LEFT JOIN purchase_requests pr ON br.purchase_request_id = pr.id
                LEFT JOIN budget_sla_tracking bst
                    ON bst.reservation_id = br.id
                    AND bst.ended_at IS NULL
                $wSql
                ORDER BY
                    FIELD(br.workflow_stage, 'budget_review', 'ceo_review', 'forwarded', 'completed', 'rejected') ASC,
                    br.created_at DESC
                LIMIT $perPg OFFSET $offset
            ");

            $rows = [];
            if ($listRes) while ($r = $listRes->fetch_assoc()) $rows[] = $r;

            // إحصائيات سريعة
            $stats = [];
            $stRes = $conn->query("
                SELECT workflow_stage, status, COUNT(*) c, SUM(grand_total_sar) total_sar
                FROM budget_reservations br $wSql
                GROUP BY workflow_stage, status
            ");
            if ($stRes) while ($st = $stRes->fetch_assoc()) $stats[] = $st;

            _ok([
                'data'       => $rows,
                'stats'      => $stats,
                'pagination' => [
                    'total'    => $total,
                    'page'     => $page,
                    'per_page' => $perPg,
                    'pages'    => (int)ceil($total / max(1, $perPg)),
                ],
            ]);
            break;

        // ── قائمة أنواع التوجيه (للـ Dropdown في الـ Modal) ──────
        case 'forwarding_types':
            _ok([
                'data' => [
                    ['value' => 'للدراسة',    'label' => 'للدراسة',    'description' => 'توجيه للدراسة والتقييم'],
                    ['value' => 'للمراجعة',   'label' => 'للمراجعة',   'description' => 'توجيه لإعادة المراجعة'],
                    ['value' => 'للاستكمال',  'label' => 'للاستكمال',  'description' => 'توجيه لاستكمال البيانات الناقصة'],
                    ['value' => 'للإعادة',    'label' => 'للإعادة',    'description' => 'إعادة الحجز لمرحلة سابقة'],
                    ['value' => 'للتحقق',     'label' => 'للتحقق',     'description' => 'توجيه للتحقق من صحة البيانات'],
                ],
            ]);
            break;

        // ── تفاصيل حجز مع Timeline كامل ─────────────────────────
        case 'get':
            $resId = (int)($_GET['reservation_id'] ?? $_GET['id'] ?? 0);
            if (!$resId) _fail('reservation_id مطلوب', 400);

            $res = _getReservation($conn, $resId);
            if (!$res) _fail('الحجز غير موجود', 404);

            // الأصناف
            $items = [];
            $iRes  = $conn->query("
                SELECT * FROM budget_reservation_items WHERE reservation_id=$resId ORDER BY sort_order, id
            ");
            if ($iRes) while ($it = $iRes->fetch_assoc()) $items[] = $it;
            $res['items'] = $items;

            // أحداث Workflow (مختصرة)
            $events = [];
            $evRes  = $conn->query("
                SELECT wl.event_type, wl.old_status, wl.new_status, wl.notes,
                       wl.workflow_stage, wl.created_at,
                       e.name AS actor_name, e.role AS actor_role
                FROM budget_workflow_log wl
                LEFT JOIN employees e ON e.id = wl.actor_id
                WHERE wl.reservation_id = $resId
                ORDER BY wl.created_at ASC
            ");
            if ($evRes) while ($ev = $evRes->fetch_assoc()) $events[] = $ev;
            $res['workflow_events'] = $events;

            _ok(['data' => $res]);
            break;

        // ── إحصائيات لوحة التحكم ─────────────────────────────────
        case 'dashboard_stats':
            $year = (int)($_GET['fiscal_year'] ?? date('y'));
            $st   = [];
            $stR  = $conn->query("
                SELECT
                    COUNT(*) AS total,
                    SUM(status='قيد المراجعة')    AS pending_budget,
                    SUM(status='معتمد مبدئياً')   AS pending_ceo,
                    SUM(status='معتمد نهائياً')   AS final_approved,
                    SUM(status='مرفوض')            AS rejected,
                    SUM(status='موجّه')            AS forwarded,
                    SUM(status='منفذ')             AS executed,
                    SUM(grand_total_sar)           AS total_sar,
                    SUM(CASE WHEN status='معتمد نهائياً' THEN grand_total_sar ELSE 0 END) AS approved_sar,
                    AVG(TIMESTAMPDIFF(HOUR, created_at, COALESCE(ceo_approved_at, NOW()))) AS avg_hours_to_final
                FROM budget_reservations
                WHERE fiscal_year = $year
            ");
            if ($stR) $st = $stR->fetch_assoc();

            // أداء SLA لكل مرحلة
            $slaPerf = [];
            $slaR    = $conn->query("
                SELECT stage_name,
                       COUNT(*)                         AS total_records,
                       AVG(TIMESTAMPDIFF(HOUR, started_at, ended_at)) AS avg_hours,
                       MAX(TIMESTAMPDIFF(HOUR, started_at, ended_at)) AS max_hours,
                       SUM(ended_at IS NULL)            AS still_open
                FROM budget_sla_tracking
                WHERE YEAR(started_at) = 2000 + $year
                GROUP BY stage_name
            ");
            if ($slaR) while ($s = $slaR->fetch_assoc()) $slaPerf[] = $s;

            _ok(['stats' => $st, 'sla_performance' => $slaPerf]);
            break;

        default:
            _fail("action غير معروف: $action", 404);
    }

} catch (Throwable $e) {
    _fail('خطأ داخلي: ' . $e->getMessage(), 500);
}

// ══════════════════════════════════════════════════════════════
//  دوال مساعدة Private
// ══════════════════════════════════════════════════════════════

function _ensureWorkflowSchema(\mysqli $conn): void {
    static $done = false;
    if ($done) return;
    $done = true;

    // ① أعمدة الـ Workflow في budget_reservations
    $newCols = [
        'workflow_stage'    => "VARCHAR(30) DEFAULT 'budget_review' COMMENT 'المرحلة الحالية'",
        'pre_approved_by'   => 'INT DEFAULT NULL COMMENT "موظف الموازنة المعتمِد المبدئي"',
        'pre_approved_at'   => 'DATETIME DEFAULT NULL',
        'pre_approval_notes'=> 'TEXT DEFAULT NULL',
        'ceo_approved_by'   => 'INT DEFAULT NULL COMMENT "الرئيس التنفيذي"',
        'ceo_approved_at'   => 'DATETIME DEFAULT NULL',
        'ceo_notes'         => 'TEXT DEFAULT NULL',
        'grand_total_sar'   => 'DECIMAL(15,2) DEFAULT 0',
        'amount_sar'        => 'DECIMAL(15,2) DEFAULT 0',
        'exchange_rate'     => 'DECIMAL(10,4) DEFAULT 1.0000',
        'budget_plan_id'    => 'INT DEFAULT NULL',
        'budget_plan_item_id'=> 'INT DEFAULT NULL',
        'exchange_rate_sar' => 'DECIMAL(10,4) DEFAULT 1.0000',
        'total_amount'      => 'DECIMAL(15,2) DEFAULT 0',
        'vat_amount'          => 'DECIMAL(15,2) DEFAULT 0',
        'purchase_request_id' => 'INT DEFAULT NULL COMMENT "ربط طلب الشراء — بديل transaction_id"',
    ];

    // تحديث ENUM للحالة ليدعم القيم الجديدة
    @$conn->query("ALTER TABLE budget_reservations MODIFY COLUMN status
        ENUM('مسودة','قيد المراجعة','معتمد مبدئياً','معتمد نهائياً','معتمد','مرفوض','ملغى','منفذ','موجّه')
        DEFAULT 'مسودة'");

    foreach ($newCols as $col => $def) {
        $chk = $conn->query("SHOW COLUMNS FROM budget_reservations LIKE '$col'");
        if (!$chk || $chk->num_rows === 0) {
            @$conn->query("ALTER TABLE budget_reservations ADD COLUMN $col $def");
        }
    }

    // عمود status لـ transactions
    $chk = $conn->query("SHOW COLUMNS FROM transactions LIKE 'status'");
    if (!$chk || $chk->num_rows === 0) {
        @$conn->query("ALTER TABLE transactions ADD COLUMN status VARCHAR(50) DEFAULT NULL");
    }

    // ② جدول سجل أحداث الـ Workflow
    $conn->query("CREATE TABLE IF NOT EXISTS budget_workflow_log (
        id               INT AUTO_INCREMENT PRIMARY KEY,
        reservation_id   INT NOT NULL,
        transaction_id   INT DEFAULT NULL,
        actor_id         INT NOT NULL,
        actor_name       VARCHAR(200) NOT NULL,
        event_type       VARCHAR(50)  NOT NULL
            COMMENT 'create|budget_preapprove|budget_reject|ceo_approve|ceo_reject|forward|resubmit|edit',
        old_status       VARCHAR(60) DEFAULT NULL,
        new_status       VARCHAR(60) DEFAULT NULL,
        notes            TEXT DEFAULT NULL,
        workflow_stage   VARCHAR(30) DEFAULT NULL,
        forwarding_id    INT DEFAULT NULL,
        forwarding_type  VARCHAR(50) DEFAULT NULL,
        forwarding_to    VARCHAR(200) DEFAULT NULL,
        created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_res    (reservation_id),
        INDEX idx_tx     (transaction_id),
        INDEX idx_actor  (actor_id),
        INDEX idx_type   (event_type),
        INDEX idx_created(created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      COMMENT='سجل أحداث Workflow الموازنة — Audit Trail كامل'");

    // ③ جدول SLA تتبع المراحل
    // ملاحظة: duration_hours عمود عادي (ليس GENERATED ALWAYS) لأن MySQL
    // لا يقبل NOW() في GENERATED ALWAYS AS — يُملأ بـ Trigger عند إغلاق المرحلة
    $conn->query("CREATE TABLE IF NOT EXISTS budget_sla_tracking (
        id             INT AUTO_INCREMENT PRIMARY KEY,
        reservation_id INT NOT NULL,
        transaction_id INT DEFAULT NULL,
        stage_name     VARCHAR(50) NOT NULL
            COMMENT 'budget_review|ceo_review|forwarded|resubmit',
        event_type     ENUM('start','end','event') DEFAULT 'start',
        actor_id       INT DEFAULT NULL,
        started_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ended_at       DATETIME DEFAULT NULL,
        duration_hours DECIMAL(10,2) DEFAULT NULL
            COMMENT 'يُملأ تلقائياً عند إغلاق المرحلة عبر Trigger',
        notes          VARCHAR(255) DEFAULT NULL,
        INDEX idx_res  (reservation_id),
        INDEX idx_stage(stage_name),
        INDEX idx_start(started_at),
        INDEX idx_open (ended_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      COMMENT='تتبع SLA/OLA لكل مرحلة من مراحل Workflow الموازنة'");

    // Trigger لحساب duration_hours تلقائياً عند إغلاق المرحلة
    $conn->query("DROP TRIGGER IF EXISTS trg_sla_calc_duration");
    $conn->query("CREATE TRIGGER trg_sla_calc_duration
        BEFORE UPDATE ON budget_sla_tracking
        FOR EACH ROW
        BEGIN
            IF NEW.ended_at IS NOT NULL AND OLD.ended_at IS NULL THEN
                SET NEW.duration_hours = ROUND(
                    TIMESTAMPDIFF(SECOND, NEW.started_at, NEW.ended_at) / 3600, 2
                );
            END IF;
        END");

    // ④ جدول سجلات التوجيه
    $conn->query("CREATE TABLE IF NOT EXISTS budget_forwarding_records (
        id                INT AUTO_INCREMENT PRIMARY KEY,
        reservation_id    INT NOT NULL,
        transaction_id    INT DEFAULT NULL,
        forwarding_type   VARCHAR(50) NOT NULL
            COMMENT 'للدراسة|للمراجعة|للاستكمال|للإعادة|للتحقق',
        forwarded_to      VARCHAR(200) DEFAULT NULL,
        forwarded_by      INT NOT NULL,
        forwarded_by_name VARCHAR(200) NOT NULL,
        notes             TEXT DEFAULT NULL,
        status            ENUM('مفتوح','مغلق','منجز') DEFAULT 'مفتوح',
        resolved_at       DATETIME DEFAULT NULL,
        resolved_by       INT DEFAULT NULL,
        created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_res     (reservation_id),
        INDEX idx_type    (forwarding_type),
        INDEX idx_status  (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      COMMENT='سجل توجيهات حجوزات الموازنة'");
}

// ── جلب بيانات حجز واحد ─────────────────────────────────────
function _getReservation(\mysqli $conn, int $id): ?array {
    $res = $conn->query("
        SELECT br.*,
               d.name  AS department_name,
               e.name  AS requested_by_name,
               eb.name AS pre_approver_name,
               ec.name AS ceo_approver_name,
               t.transaction_number, t.status AS transaction_status
        FROM budget_reservations br
        LEFT JOIN departments d  ON br.department_id   = d.id
        LEFT JOIN employees   e  ON br.requested_by    = e.id
        LEFT JOIN employees   eb ON br.pre_approved_by = eb.id
        LEFT JOIN employees   ec ON br.ceo_approved_by = ec.id
        LEFT JOIN transactions t ON br.transaction_id  = t.id
        WHERE br.id = $id LIMIT 1
    ");
    return ($res && ($row = $res->fetch_assoc())) ? $row : null;
}

// ── تسجيل حدث Workflow ──────────────────────────────────────
function _logWorkflow(\mysqli $conn, array $d): void {
    $resId   = (int)$d['reservation_id'];
    $txId    = isset($d['transaction_id']) && $d['transaction_id'] ? (int)$d['transaction_id'] : 'NULL';
    $actorId = (int)$d['actor_id'];
    $actor   = $conn->real_escape_string($d['actor_name']    ?? '');
    $type    = $conn->real_escape_string($d['event_type']    ?? '');
    $oldSt   = $d['old_status'] ? "'" . $conn->real_escape_string($d['old_status']) . "'" : 'NULL';
    $newSt   = $d['new_status'] ? "'" . $conn->real_escape_string($d['new_status']) . "'" : 'NULL';
    $notes   = $conn->real_escape_string($d['notes']         ?? '');
    $stage   = $conn->real_escape_string($d['workflow_stage'] ?? '');
    $fwdId   = isset($d['forwarding_id']) && $d['forwarding_id'] ? (int)$d['forwarding_id'] : 'NULL';
    $fwdType = $conn->real_escape_string($d['forwarding_type'] ?? '');
    $fwdTo   = $conn->real_escape_string($d['forwarding_to']   ?? '');

    $conn->query("
        INSERT INTO budget_workflow_log
            (reservation_id, transaction_id, actor_id, actor_name,
             event_type, old_status, new_status, notes,
             workflow_stage, forwarding_id, forwarding_type, forwarding_to)
        VALUES
            ($resId, $txId, $actorId, '$actor',
             '$type', $oldSt, $newSt, '$notes',
             '$stage', $fwdId, '$fwdType', '$fwdTo')
    ");

    // تسجيل في budget_reservation_log الموجود (للتوافق)
    $conn->query("
        INSERT INTO budget_reservation_log
            (reservation_id, employee_id, action, old_status, new_status, notes)
        VALUES ($resId, $actorId, '$type', $oldSt, $newSt, '$notes')
    ");
}

// ── تسجيل حدث SLA ───────────────────────────────────────────
function _recordSlaEvent(\mysqli $conn, int $resId, int $txId, string $stage, string $eventType, int $actorId): void {
    $txCol = $txId ? $txId : 'NULL';

    if ($eventType === 'start') {
        // أغلق أي مرحلة مفتوحة أولاً
        $conn->query("
            UPDATE budget_sla_tracking
            SET ended_at = NOW()
            WHERE reservation_id = $resId AND ended_at IS NULL
        ");
        $conn->query("
            INSERT INTO budget_sla_tracking
                (reservation_id, transaction_id, stage_name, event_type, actor_id, started_at)
            VALUES ($resId, $txCol, '$stage', 'start', $actorId, NOW())
        ");
    } elseif ($eventType === 'end') {
        $conn->query("
            UPDATE budget_sla_tracking
            SET ended_at = NOW()
            WHERE reservation_id = $resId AND stage_name = '$stage' AND ended_at IS NULL
        ");
    } else {
        // event
        $conn->query("
            INSERT INTO budget_sla_tracking
                (reservation_id, transaction_id, stage_name, event_type, actor_id, started_at, ended_at)
            VALUES ($resId, $txCol, '$stage', 'event', $actorId, NOW(), NOW())
        ");
    }
}

// ── حساب مدة كل مرحلة ───────────────────────────────────────
function _calcStageDurations(array $sla): array {
    $out = [];
    foreach ($sla as $s) {
        $name = $s['stage_name'];
        if (!isset($out[$name])) {
            $out[$name] = ['stage' => $name, 'total_hours' => 0, 'records' => 0];
        }
        // duration_hours = NULL لمراحل مفتوحة (GENERATED ALWAYS كان غير مدعوم)
        // نحسبها يدوياً من started_at إلى الآن
        if ($s['duration_hours'] !== null) {
            $hrs = (float)$s['duration_hours'];
        } elseif (!empty($s['started_at'])) {
            $hrs = round((time() - strtotime($s['started_at'])) / 3600, 2);
        } else {
            $hrs = 0;
        }
        $out[$name]['total_hours']  += $hrs;
        $out[$name]['records']++;
        $out[$name]['still_open']    = empty($s['ended_at']);
        $out[$name]['started_at']    = $s['started_at'];
        $out[$name]['ended_at']      = $s['ended_at'];
        $out[$name]['current_hours'] = $hrs;
    }
    return array_values($out);
}

// ── توليد رقم حجز فريد ──────────────────────────────────────
function _generateResNumber(\mysqli $conn): string {
    $year = date('y');
    for ($i = 0; $i < 10; $i++) {
        $r   = $conn->query("SELECT MAX(CAST(SUBSTRING(reservation_number,3) AS UNSIGNED)) s
                              FROM budget_reservations WHERE fiscal_year=$year");
        $seq = ((int)(($r ? $r->fetch_assoc() : [])['s'] ?? 0)) + 1 + $i;
        $num = $year . str_pad($seq, 5, '0', STR_PAD_LEFT);
        $chk = $conn->query("SELECT id FROM budget_reservations WHERE reservation_number='$num' LIMIT 1");
        if ($chk && $chk->num_rows === 0) return $num;
    }
    return $year . str_pad($seq ?? 1, 4, '0', STR_PAD_LEFT) . substr(time(), -3);
}

// ── توليد رقم معاملة مالية فريد ─────────────────────────────
function _generateTxNumber(\mysqli $conn): string {
    $prefix = 'BR'; // Budget Reservation
    $conn->begin_transaction();
    $r   = $conn->query("SELECT CAST(SUBSTRING_INDEX(transaction_number,'-',-1) AS UNSIGNED) seq
                          FROM transactions WHERE transaction_number REGEXP '^BR-[0-9]+$'
                          ORDER BY seq DESC LIMIT 1 FOR UPDATE");
    $row = $r ? $r->fetch_assoc() : null;
    $seq = ((int)($row['seq'] ?? 0)) + 1;
    $conn->commit();
    return $prefix . '-' . str_pad($seq, 5, '0', STR_PAD_LEFT);
}

// ── جلب / إنشاء نوع معاملة "حجز موازنة" ────────────────────
function _getOrCreateBudgetTxType(\mysqli $conn): int {
    $r = $conn->query("SELECT id FROM transaction_types WHERE name='حجز موازنة' LIMIT 1");
    if ($r && ($row = $r->fetch_assoc())) return (int)$row['id'];
    $conn->query("INSERT INTO transaction_types (name, sort_order) VALUES ('حجز موازنة', 99)");
    return $conn->insert_id ?: 1;
}

// ── جلب سعر الصرف ────────────────────────────────────────────
function _getExchangeRate(\mysqli $conn, string $currency): float {
    $r = $conn->query("SELECT rate_to_sar FROM exchange_rates WHERE code='$currency' OR currency='$currency' LIMIT 1");
    if ($r && ($row = $r->fetch_assoc())) return (float)$row['rate_to_sar'];
    return 1.0;
}

// ── تحديد معرّف القسم ────────────────────────────────────────
function _resolveDept(\mysqli $conn, int $userId, int $sent): int {
    if ($sent > 0 && $sent < 100000) {
        $c = $conn->query("SELECT id FROM departments WHERE id=$sent LIMIT 1");
        if ($c && $c->num_rows > 0) return $sent;
    }
    $dept = getDepartmentByEmployee($conn, $userId);
    if ($dept) return $dept;
    $r = $conn->query("SELECT id FROM departments WHERE is_active=1 LIMIT 1");
    return ($r && ($row = $r->fetch_assoc())) ? (int)$row['id'] : 1;
}

// ── Helpers بسيطة ────────────────────────────────────────────
function _requirePost(): void {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') _fail('POST فقط', 405);
}

function _json(): array {
    return json_decode(file_get_contents('php://input'), true) ?? [];
}

function _esc(\mysqli $conn, string $val): string {
    return $conn->real_escape_string($val);
}

function _ok(array $data = []): void {
    ob_end_clean();
    echo json_encode(array_merge(['success' => true], $data), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function _fail(string $msg, int $code = 400): void {
    http_response_code($code);
    ob_end_clean();
    echo json_encode(['success' => false, 'message' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}