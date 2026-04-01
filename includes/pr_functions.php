<?php
/**
 * pr_functions.php
 * ════════════════════════════════════════════════════════════
 * دوال نظام طلبات الشراء (المعاملات)
 *
 * الأقسام:
 *  ① تهيئة الجداول والإعدادات
 *  ② توليد الأرقام التسلسلية
 *  ③ إنشاء الطلب وسير العمل
 *  ④ الموافقات والرفض والإرجاع
 *  ⑤ المشتريات: إصدار أمر الشراء + إنشاء الحجز
 *  ⑥ الإحالة والإسناد الداخلي
 *  ⑦ قراءة البيانات والفلترة
 *  ⑧ SLA: التتبع والإشعارات
 *  ⑨ دوال مساعدة
 * ════════════════════════════════════════════════════════════
 *
 * يعتمد على:
 *   - config.php   → دالة db()
 *   - functions.php → getSetting(), sendNotification()
 */

// ── التأكد من تحميل config.php ──────────────────────────────
// pr_functions.php في includes/ → config.php في المجلد الأب
if (!function_exists('db')) {
    $configPaths = [
        __DIR__ . '/../config.php',   // includes/../config.php = الجذر
        __DIR__ . '/config.php',       // نفس المجلد احتياطي
    ];
    foreach ($configPaths as $p) {
        if (file_exists($p)) { require_once $p; break; }
    }
}


// ════════════════════════════════════════════════════════════
// ① تهيئة الجداول والإعدادات
// ════════════════════════════════════════════════════════════

/**
 * التأكد من وجود جداول نظام المعاملات
 * تُستدعى مرة واحدة عند أول استخدام
 */
function prBootstrap(): void {
    $conn = db();
    $check = $conn->query("SHOW TABLES LIKE 'purchase_requests'");
    if (!$check || $check->num_rows === 0) {
        // تنفيذ ملف SQL إذا لم تكن الجداول موجودة
        // البحث عن ملف SQL في عدة مسارات
        $sqlPaths = [
            __DIR__ . '/purchase_requests_schema.sql',
            __DIR__ . '/../purchase_requests_schema.sql',
            dirname(__DIR__) . '/purchase_requests_schema.sql',
        ];
        $sqlFile = null;
        foreach ($sqlPaths as $p) {
            if (file_exists($p)) { $sqlFile = $p; break; }
        }
        if (file_exists($sqlFile)) {
            $sql = file_get_contents($sqlFile);
            // تنفيذ كل عبارة على حدة
            foreach (array_filter(array_map('trim', explode(';', $sql))) as $stmt) {
                if ($stmt) $conn->query($stmt);
            }
        }
    }
}

/**
 * جلب قيمة إعداد من system_settings
 * @param string $key   مفتاح الإعداد
 * @param string $default القيمة الافتراضية
 */
function prGetSetting(string $key, string $default = ''): string {
    $conn = db();
    $key  = $conn->real_escape_string($key);
    $r    = $conn->query("SELECT setting_value FROM system_settings WHERE setting_key='$key' LIMIT 1");
    if ($r && $r->num_rows) return $r->fetch_assoc()['setting_value'];
    return $default;
}

/**
 * جلب حد المبلغ الفاصل بين المسار القصير والطويل
 * القيمة من system_settings.pr_amount_threshold (افتراضي 5000)
 */
function prGetAmountThreshold(): float {
    return (float) prGetSetting('pr_amount_threshold', '5000');
}


// ════════════════════════════════════════════════════════════
// ② توليد الأرقام التسلسلية
// ════════════════════════════════════════════════════════════

/**
 * توليد رقم طلب شراء جديد بالتسلسل
 * مثال: PR-0001, PR-0002 ...
 * @return string رقم الطلب
 */
function prGenerateRequestNumber(): string {
    $conn   = db();
    $prefix = prGetSetting('prefix_purchase_request', 'PR');

    $conn->begin_transaction();
    $r = $conn->query(
        "SELECT CAST(SUBSTRING_INDEX(request_number, '-', -1) AS UNSIGNED) AS seq
         FROM purchase_requests
         WHERE request_number REGEXP '^[A-Za-z]+-[0-9]+\$'
         ORDER BY seq DESC LIMIT 1 FOR UPDATE"
    );
    $row     = $r ? $r->fetch_assoc() : null;
    $nextSeq = (isset($row['seq']) ? (int)$row['seq'] : 0) + 1;
    $conn->commit();

    return $prefix . '-' . str_pad($nextSeq, 4, '0', STR_PAD_LEFT);
}


// ════════════════════════════════════════════════════════════
// ③ إنشاء الطلب وسير العمل
// ════════════════════════════════════════════════════════════

/**
 * إنشاء طلب شراء جديد
 *
 * @param array $data  بيانات الطلب من النموذج:
 *   - title, description, department_id, created_by
 *   - amount, currency, exchange_rate
 *   - supplier_id, supplier_name_manual
 *   - cost_center_id, budget_category_id, budget_code
 *   - priority, needed_date
 * @return array ['success'=>bool, 'id'=>int, 'number'=>string, 'message'=>string]
 */
function prCreateRequest(array $data): array {
    $conn = db();

    // ── التحقق من البيانات الإلزامية ────────────────────────
    $required = ['title', 'department_id', 'created_by', 'amount'];
    foreach ($required as $field) {
        if (empty($data[$field])) {
            return ['success' => false, 'message' => "الحقل '$field' مطلوب"];
        }
    }

    // ── التحقق من وجود مورد (إلزامي مبدئي) ──────────────────
    if (empty($data['supplier_id']) && empty($data['supplier_name_manual'])) {
        return ['success' => false, 'message' => 'يجب تحديد مورد مبدئي على الأقل'];
    }

    // ── حساب المبلغ بالريال ───────────────────────────────────
    $amount       = (float)$data['amount'];
    $currency     = strtoupper($conn->real_escape_string($data['currency'] ?? 'SAR'));
    $exchangeRate = 1.0;

    if ($currency !== 'SAR') {
        $manualRate = (float)($data['exchange_rate'] ?? 0);
        if ($manualRate > 0) {
            $exchangeRate = $manualRate;
        } else {
            // جلب سعر الصرف من الجدول الحالي
            $er = $conn->query(
                "SELECT rate_to_sar FROM exchange_rates WHERE currency='$currency' LIMIT 1"
            );
            if ($er && $erRow = $er->fetch_assoc()) {
                $exchangeRate = (float)$erRow['rate_to_sar'];
            }
        }
    }
    $amountSar = round($amount * $exchangeRate, 2);

    // ── تحديد المسار بناءً على المبلغ بالريال ─────────────────
    $threshold    = prGetAmountThreshold();
    $workflowPath = $amountSar < $threshold ? 'short' : 'long';
    $firstStage   = $workflowPath === 'short' ? 'budget_review' : 'treasury_review';

    // ── توليد رقم الطلب ───────────────────────────────────────
    $requestNumber = prGenerateRequestNumber();

    // ── إدخال الطلب ──────────────────────────────────────────
    $title              = $conn->real_escape_string($data['title']);
    $description        = $conn->real_escape_string($data['description'] ?? '');
    $deptId             = (int)$data['department_id'];
    $createdBy          = (int)$data['created_by'];
    $supplierId         = !empty($data['supplier_id']) ? (int)$data['supplier_id'] : 'NULL';
    $supplierManual     = $conn->real_escape_string($data['supplier_name_manual'] ?? '');
    $costCenterId       = !empty($data['cost_center_id']) ? (int)$data['cost_center_id'] : 'NULL';
    $budgetCategoryId   = !empty($data['budget_category_id']) ? (int)$data['budget_category_id'] : 'NULL';
    $budgetCode         = $conn->real_escape_string($data['budget_code'] ?? '');
    $priority           = in_array($data['priority'] ?? '', ['normal','urgent']) ? $data['priority'] : 'normal';
    $neededDate         = !empty($data['needed_date']) ? "'{$conn->real_escape_string($data['needed_date'])}'" : 'NULL';

    $conn->query("
        INSERT INTO purchase_requests
            (request_number, title, description, department_id, created_by,
             amount, currency, exchange_rate, amount_sar,
             supplier_id, supplier_name_manual,
             cost_center_id, budget_category_id, budget_code,
             priority, needed_date,
             workflow_path, current_stage, created_at)
        VALUES
            ('$requestNumber', '$title', '$description', $deptId, $createdBy,
             $amount, '$currency', $exchangeRate, $amountSar,
             $supplierId, '$supplierManual',
             $costCenterId, $budgetCategoryId, '$budgetCode',
             '$priority', $neededDate,
             '$workflowPath', '$firstStage', NOW())
    ");

    $requestId = $conn->insert_id;
    if (!$requestId) {
        return ['success' => false, 'message' => 'فشل إنشاء الطلب: ' . $conn->error];
    }

    // ── تسجيل مراحل سير العمل ────────────────────────────────
    prInitWorkflowStages($requestId, $workflowPath);

    // ── تسجيل حدث الإنشاء ────────────────────────────────────
    prLogEvent($requestId, 'created', $createdBy, [
        'stage'       => 'draft',
        'description' => "تم إنشاء الطلب '$requestNumber' وإرساله للمرحلة: " . prStageName($firstStage),
    ]);

    // ── بدء تتبع SLA للمرحلة الأولى ─────────────────────────
    prStartSlaTracking($requestId, $firstStage);

    // ── إرسال إشعار للجهة المختصة ────────────────────────────
    prNotifyStageRecipients($requestId, $firstStage, $requestNumber);

    return [
        'success' => true,
        'id'      => $requestId,
        'number'  => $requestNumber,
        'message' => 'تم إنشاء الطلب بنجاح',
    ];
}

/**
 * تهيئة مراحل سير العمل عند إنشاء الطلب
 * يُنشئ سجلاً لكل مرحلة بحالة pending
 *
 * @param int    $requestId    معرف الطلب
 * @param string $workflowPath 'short' أو 'long'
 */
function prInitWorkflowStages(int $requestId, string $workflowPath): void {
    $conn = db();

    // تعريف المراحل حسب المسار
    $stages = $workflowPath === 'short'
        ? [
            ['budget_review',           1],
            ['purchasing',              2],
            ['waiting_budget_approval', 3],
            ['payment',                 4],
            ['completed',               5],
        ]
        : [
            ['treasury_review',         1],
            ['finance_review',          2],
            ['ceo_approval',            3],
            ['purchasing',              4],
            ['waiting_budget_approval', 5],
            ['payment',                 6],
            ['completed',               7],
        ];

    foreach ($stages as [$stageName, $order]) {
        $arrived = $order === 1 ? "NOW()" : 'NULL';
        $conn->query("
            INSERT INTO pr_workflow_stages
                (request_id, stage_name, stage_order, status, arrived_at)
            VALUES
                ($requestId, '$stageName', $order, 'pending', $arrived)
        ");
    }
}


// ════════════════════════════════════════════════════════════
// ④ الموافقات والرفض والإرجاع
// ════════════════════════════════════════════════════════════

/**
 * تسجيل موافقة على مرحلة
 *
 * @param int    $requestId  معرف الطلب
 * @param int    $employeeId معرف الموظف الموافق
 * @param string $stage      اسم المرحلة
 * @param string $notes      ملاحظات الموافقة
 * @return array ['success'=>bool, 'message'=>string]
 */
function prApproveStage(int $requestId, int $employeeId, string $stage, string $notes = ''): array {
    $conn = db();

    // ── جلب بيانات الطلب ─────────────────────────────────────
    $req = prGetRequest($requestId);
    if (!$req) return ['success' => false, 'message' => 'الطلب غير موجود'];

    // ── التحقق أن المرحلة صحيحة ──────────────────────────────
    if ($req['current_stage'] !== $stage) {
        return [
            'success' => false,
            'message' => 'المرحلة الحالية للطلب هي: ' . prStageName($req['current_stage']),
        ];
    }

    // ── المرحلتان اللتان تحتاجان موافقة الاثنين ──────────────
    if (in_array($stage, ['treasury_review', 'finance_review'])) {
        return prHandleDualApproval($requestId, $employeeId, $stage, $notes);
    }

    // ── تحديث المرحلة الحالية ────────────────────────────────
    $esc   = $conn->real_escape_string($notes);
    $empName = prGetEmployeeName($employeeId);
    $conn->query("
        UPDATE pr_workflow_stages
        SET status='approved', employee_id=$employeeId,
            action='موافقة', notes='$esc', completed_at=NOW(),
            duration_min=TIMESTAMPDIFF(MINUTE, COALESCE(started_at, arrived_at), NOW())
        WHERE request_id=$requestId AND stage_name='$stage'
    ");

    // ── الانتقال للمرحلة التالية ──────────────────────────────
    $nextStage = prGetNextStage($req['workflow_path'], $stage);
    prTransitionToStage($requestId, $nextStage, $employeeId);

    // ── تسجيل الحدث ──────────────────────────────────────────
    // budget_review في المسار الطويل = موظف الموازنة راجع وأعاد لمدير الخزينة
    $desc = ($stage === 'budget_review' && $req['workflow_path'] === 'long')
        ? "$empName راجع الطلب وأعاده إلى: " . prStageName($nextStage)
        : "$empName وافق على مرحلة: " . prStageName($stage);

    prLogEvent($requestId, 'approved', $employeeId, [
        'stage'         => $stage,
        'description'   => $desc,
        'old_value'     => $stage,
        'new_value'     => $nextStage,
    ]);

    return ['success' => true, 'message' => 'تمت الموافقة بنجاح'];
}

/**
 * معالجة الموافقات المزدوجة (مدير الخزينة + المدير المالي)
 * يُنتقل للمرحلة التالية فقط عند موافقة الاثنين
 *
 * @param int    $requestId
 * @param int    $employeeId
 * @param string $stage      treasury_review | finance_review
 * @param string $notes
 */
function prHandleDualApproval(int $requestId, int $employeeId, string $stage, string $notes): array {
    $conn    = db();
    $esc     = $conn->real_escape_string($notes);
    $empName = prGetEmployeeName($employeeId);
    $roleMap = [
        'treasury_review' => 'treasury_manager',
        'finance_review'  => 'finance_manager',
    ];
    $role = $roleMap[$stage] ?? $stage;

    // ── تسجيل أو تحديث موافقة هذا الموظف ───────────────────
    $conn->query("
        INSERT INTO pr_stage_approvals
            (request_id, stage_name, employee_id, employee_role, status, action_notes, actioned_at)
        VALUES
            ($requestId, '$stage', $employeeId, '$role', 'approved', '$esc', NOW())
        ON DUPLICATE KEY UPDATE
            status='approved', action_notes='$esc', actioned_at=NOW()
    ");

    // ── فحص هل وافق الاثنان ──────────────────────────────────
    $pendingCount = $conn->query("
        SELECT COUNT(*) AS cnt FROM pr_stage_approvals
        WHERE request_id=$requestId AND stage_name='$stage' AND status='pending'
    ")->fetch_assoc()['cnt'] ?? 1;

    $req = prGetRequest($requestId);

    prLogEvent($requestId, 'approved', $employeeId, [
        'stage'       => $stage,
        'description' => "$empName وافق على: " . prStageName($stage),
    ]);

    // ── إذا لا يزال هناك من لم يوافق ──────────────────────────
    if ($pendingCount > 0) {
        return [
            'success' => true,
            'message' => 'تمت موافقتك. في انتظار موافقة الطرف الآخر',
        ];
    }

    // ── كلاهما وافق → الانتقال للمرحلة التالية ───────────────
    $conn->query("
        UPDATE pr_workflow_stages
        SET status='approved', completed_at=NOW(), approved_by=$employeeId
        WHERE request_id=$requestId AND stage_name='$stage'
    ");

    $nextStage = prGetNextStage($req['workflow_path'], $stage);
    prTransitionToStage($requestId, $nextStage, $employeeId);

    return ['success' => true, 'message' => 'وافق الاثنان — تم الانتقال للمرحلة التالية'];
}

/**
 * رفض طلب في أي مرحلة
 * يُرجع الطلب لمدير الإدارة الطالبة مع سبب الرفض
 *
 * @param int    $requestId
 * @param int    $employeeId
 * @param string $stage
 * @param string $reason    سبب الرفض (إلزامي)
 * @return array
 */
function prRejectRequest(int $requestId, int $employeeId, string $stage, string $reason): array {
    $conn = db();

    if (empty(trim($reason))) {
        return ['success' => false, 'message' => 'سبب الرفض مطلوب'];
    }

    $req = prGetRequest($requestId);
    if (!$req) return ['success' => false, 'message' => 'الطلب غير موجود'];

    $esc     = $conn->real_escape_string($reason);
    $empName = prGetEmployeeName($employeeId);

    // ── تحديد مدير الإدارة الطالبة ───────────────────────────
    $managerId = prGetDepartmentManager((int)$req['department_id']);

    // ── تحديث الطلب ──────────────────────────────────────────
    $managerRef = $managerId ? $managerId : 'NULL';
    $conn->query("
        UPDATE purchase_requests
        SET current_stage='returned',
            rejection_reason='$esc',
            rejected_at=NOW(),
            rejected_by=$employeeId,
            returned_to_manager=$managerRef,
            returned_at=NOW()
        WHERE id=$requestId
    ");

    // ── تحديث مرحلة سير العمل ────────────────────────────────
    $conn->query("
        UPDATE pr_workflow_stages
        SET status='rejected', employee_id=$employeeId,
            notes='$esc', completed_at=NOW()
        WHERE request_id=$requestId AND stage_name='$stage'
    ");

    // ── إيقاف SLA ─────────────────────────────────────────────
    prEndSlaTracking($requestId, $stage);

    // ── تسجيل الحدث ──────────────────────────────────────────
    prLogEvent($requestId, 'rejected', $employeeId, [
        'stage'       => $stage,
        'description' => "$empName رفض الطلب في مرحلة: " . prStageName($stage),
        'old_value'   => $stage,
        'new_value'   => 'returned',
    ]);

    // ── إشعار مدير الإدارة الطالبة ───────────────────────────
    if ($managerId) {
        prSendNotification($managerId, $requestId, [
            'type'    => 'warning',
            'title'   => 'طلب مرفوض — يتطلب إجراء',
            'message' => "تم رفض الطلب رقم {$req['request_number']} في مرحلة " . prStageName($stage) . ". السبب: $reason",
        ]);
    }

    return ['success' => true, 'message' => 'تم رفض الطلب وإرجاعه لمدير الإدارة الطالبة'];
}


// ════════════════════════════════════════════════════════════
// ⑤ المشتريات: إصدار أمر الشراء + إنشاء حجز الموازنة
// ════════════════════════════════════════════════════════════

/**
 * إصدار أمر الشراء من قِبَل المشتريات
 * يُنشئ حجز الموازنة تلقائياً كمسودة
 * يُعيد التوجيه للمسار الطويل إذا تجاوز المبلغ النهائي الحد
 *
 * @param int    $requestId
 * @param int    $employeeId   موظف المشتريات
 * @param array  $poData       بيانات أمر الشراء:
 *   - po_number, final_supplier_id, final_supplier_name, final_amount
 * @return array
 */
function prIssuePurchaseOrder(int $requestId, int $employeeId, array $poData): array {
    $conn = db();

    $req = prGetRequest($requestId);
    if (!$req) return ['success' => false, 'message' => 'الطلب غير موجود'];
    if ($req['current_stage'] !== 'purchasing') {
        return ['success' => false, 'message' => 'الطلب ليس في مرحلة المشتريات'];
    }

    $finalAmount = (float)($poData['final_amount'] ?? 0);
    if ($finalAmount <= 0) {
        return ['success' => false, 'message' => 'المبلغ النهائي مطلوب'];
    }

    // ── حساب المبلغ النهائي بالريال ──────────────────────────
    $currency     = $req['currency'];
    $exchangeRate = (float)$req['exchange_rate'];
    $finalAmountSar = round($finalAmount * $exchangeRate, 2);

    $poNumber       = $conn->real_escape_string($poData['po_number'] ?? '');
    $finalSuppId    = !empty($poData['final_supplier_id']) ? (int)$poData['final_supplier_id'] : 'NULL';
    $finalSuppName  = $conn->real_escape_string($poData['final_supplier_name'] ?? '');

    // ── فحص إذا تجاوز المبلغ النهائي الحد ───────────────────
    $threshold    = prGetAmountThreshold();
    $originalPath = $req['workflow_path'];
    $needsRedirect = ($originalPath === 'short' && $finalAmountSar >= $threshold);

    $conn->begin_transaction();
    try {
        // ── تحديث بيانات أمر الشراء ──────────────────────────
        $conn->query("
            UPDATE purchase_requests
            SET po_number='$poNumber',
                final_supplier_id=$finalSuppId,
                final_supplier_name='$finalSuppName',
                final_amount=$finalAmount,
                final_amount_sar=$finalAmountSar,
                po_issued_at=NOW(),
                po_issued_by=$employeeId
            WHERE id=$requestId
        ");

        // ── إنشاء حجز الموازنة تلقائياً كمسودة ──────────────
        $reservationId = prCreateBudgetReservationDraft($requestId, $req, $finalAmount, $finalAmountSar, $employeeId);

        // ── ربط الحجز بالطلب ─────────────────────────────────
        $conn->query("
            UPDATE purchase_requests
            SET budget_reservation_id=$reservationId
            WHERE id=$requestId
        ");

        // ── إذا تجاوز الحد → إعادة توجيه للمسار الطويل ───────
        if ($needsRedirect) {
            $conn->query("
                UPDATE purchase_requests
                SET workflow_path='long', current_stage='treasury_review'
                WHERE id=$requestId
            ");

            prLogEvent($requestId, 'workflow_redirected', $employeeId, [
                'stage'       => 'purchasing',
                'description' => "المبلغ النهائي ($finalAmountSar ريال) تجاوز الحد ($threshold ريال) — إعادة توجيه للمسار الطويل",
                'old_value'   => 'short',
                'new_value'   => 'long',
            ]);

            // إضافة مراحل الموافقة الإضافية
            prInitWorkflowStages($requestId, 'long');
            prTransitionToStage($requestId, 'treasury_review', $employeeId);
        } else {
            // ── الانتقال لمرحلة انتظار اعتماد الحجز ──────────
            prTransitionToStage($requestId, 'waiting_budget_approval', $employeeId);

            // ── توقف SLA أثناء الانتظار ───────────────────────
            prPauseSla($requestId, 'waiting_budget_approval');
        }

        // ── تسجيل حدث إصدار أمر الشراء ──────────────────────
        prLogEvent($requestId, 'po_issued', $employeeId, [
            'stage'       => 'purchasing',
            'description' => "تم إصدار أمر الشراء رقم $poNumber — إنشاء حجز موازنة تلقائي",
            'new_value'   => "PO: $poNumber | حجز: $reservationId",
        ]);

        // ── تسجيل حدث الحجز ──────────────────────────────────
        prLogEvent($requestId, 'budget_linked', $employeeId, [
            'stage'       => 'purchasing',
            'description' => "تم إنشاء حجز الموازنة تلقائياً كمسودة — رقم الحجز: $reservationId",
            'new_value'   => (string)$reservationId,
        ]);

        $conn->commit();
    } catch (Exception $e) {
        $conn->rollback();
        return ['success' => false, 'message' => 'فشل إصدار أمر الشراء: ' . $e->getMessage()];
    }

    return [
        'success'        => true,
        'message'        => 'تم إصدار أمر الشراء وإنشاء حجز الموازنة',
        'reservation_id' => $reservationId,
        'redirected'     => $needsRedirect,
    ];
}

/**
 * إنشاء حجز موازنة تلقائي كمسودة عند إصدار أمر الشراء
 * يأخذ بيانات الطلب ويُنشئ حجزاً في budget_reservations
 *
 * @param int   $requestId
 * @param array $req       بيانات الطلب
 * @param float $amount    المبلغ النهائي
 * @param float $amountSar المبلغ بالريال
 * @param int   $createdBy
 * @return int معرف الحجز المنشأ
 */
function prCreateBudgetReservationDraft(
    int $requestId, array $req,
    float $amount, float $amountSar,
    int $createdBy
): int {
    $conn = db();

    // توليد رقم الحجز
    $prefix = prGetSetting('prefix_reservation', 'RES');
    $year   = date('Y');
    $r      = $conn->query(
        "SELECT MAX(CAST(SUBSTRING_INDEX(reservation_number, '', -1) AS UNSIGNED)) AS mx
         FROM budget_reservations WHERE fiscal_year=$year"
    );
    $mx     = ($r && $row = $r->fetch_assoc()) ? (int)$row['mx'] : 0;
    $resNum = $year . str_pad($mx + 1, 4, '0', STR_PAD_LEFT);

    $suppId   = !empty($req['supplier_id'])   ? (int)$req['supplier_id']   : 'NULL';
    $suppName = $conn->real_escape_string($req['supplier_name_manual'] ?? '');
    $purpose  = $conn->real_escape_string($req['title']);
    $costCtr  = !empty($req['cost_center_id'])
                    ? (int)$req['cost_center_id'] : 'NULL';
    $budgCat  = !empty($req['budget_category_id'])
                    ? (int)$req['budget_category_id'] : 'NULL';
    $budgCode = $conn->real_escape_string($req['budget_code'] ?? '');
    $currency = $conn->real_escape_string($req['currency']);
    $exRate   = (float)$req['exchange_rate'];
    $priority = $req['priority'] === 'urgent' ? 'عاجل' : 'عادي';
    $deptId   = (int)$req['department_id'];

    $conn->query("
        INSERT INTO budget_reservations
            (reservation_number, fiscal_year, department_id, requested_by,
             request_date, purpose, priority,
             budget_category, cost_center,
             supplier_id, supplier_name_manual,
             grand_total, currency, exchange_rate, exchange_rate_sar,
             grand_total_sar, amount_sar,
             transaction_id, status, workflow_stage, created_at)
        VALUES
            ('$resNum', $year, $deptId, $createdBy,
             CURDATE(), '$purpose', '$priority',
             '$budgCode', " . ($costCtr !== 'NULL' ? "'$costCtr'" : 'NULL') . ",
             $suppId, '$suppName',
             $amount, '$currency', $exRate, $exRate,
             $amountSar, $amountSar,
             $requestId, 'مسودة', 'draft', NOW())
    ");

    return (int)$conn->insert_id;
}

/**
 * اعتماد حجز الموازنة من موظف الموازنة
 * بعد اعتماده يُرسل للرئيس التنفيذي للاعتماد النهائي
 *
 * @param int    $reservationId
 * @param int    $employeeId
 * @param string $notes
 * @return array
 */
function prBudgetEmployeeApproveReservation(int $reservationId, int $employeeId, string $notes = ''): array {
    $conn = db();
    $esc  = $conn->real_escape_string($notes);

    // ── تحديث حالة الحجز ──────────────────────────────────────
    $conn->query("
        UPDATE budget_reservations
        SET status='قيد المراجعة',
            workflow_stage='budget_approved',
            budget_employee_id=$employeeId,
            budget_review_date=NOW(),
            budget_notes='$esc'
        WHERE id=$reservationId
    ");

    // ── إيجاد الطلب المرتبط ──────────────────────────────────
    $r   = $conn->query("SELECT id, request_number, department_id FROM purchase_requests WHERE budget_reservation_id=$reservationId LIMIT 1");
    $req = $r ? $r->fetch_assoc() : null;

    if ($req) {
        prLogEvent((int)$req['id'], 'approved', $employeeId, [
            'stage'       => 'waiting_budget_approval',
            'description' => 'موظف الموازنة اعتمد الحجز — في انتظار اعتماد الرئيس التنفيذي',
        ]);
    }

    return ['success' => true, 'message' => 'تم اعتماد الحجز من موظف الموازنة'];
}

/**
 * اعتماد الرئيس التنفيذي للحجز (الاعتماد النهائي)
 * بعد اعتماده تنتقل المعاملة للمالية للدفع
 *
 * @param int    $reservationId
 * @param int    $employeeId
 * @param string $notes
 * @return array
 */
function prCeoApproveReservation(int $reservationId, int $employeeId, string $notes = ''): array {
    $conn = db();
    $esc  = $conn->real_escape_string($notes);

    $conn->query("
        UPDATE budget_reservations
        SET status='معتمد',
            workflow_stage='ceo_approved',
            approved_by=$employeeId,
            approved_at=NOW()
        WHERE id=$reservationId
    ");

    // ── إيجاد الطلب المرتبط ──────────────────────────────────
    $r   = $conn->query("SELECT * FROM purchase_requests WHERE budget_reservation_id=$reservationId LIMIT 1");
    $req = $r ? $r->fetch_assoc() : null;
    if (!$req) return ['success' => false, 'message' => 'لم يوجد طلب مرتبط بهذا الحجز'];

    $requestId = (int)$req['id'];

    // ── استئناف SLA ────────────────────────────────────────────
    prResumeSla($requestId, 'waiting_budget_approval');

    // ── الانتقال للمالية للدفع ────────────────────────────────
    prTransitionToStage($requestId, 'payment', $employeeId);

    // ── إرسال الطلب لصفحة daily-payments ─────────────────────
    prSendToPayment($requestId, $employeeId);

    prLogEvent($requestId, 'approved', $employeeId, [
        'stage'       => 'waiting_budget_approval',
        'description' => 'الرئيس التنفيذي اعتمد الحجز — تم إرسال الطلب للمالية للدفع',
        'new_value'   => 'payment',
    ]);

    return ['success' => true, 'message' => 'تم اعتماد الحجز وإرسال الطلب للمالية'];
}

/**
 * إرسال الطلب لصفحة المدفوعات اليومية (daily-payments)
 * يُضاف كمعاملة جديدة في النظام المالي
 *
 * @param int $requestId
 * @param int $employeeId
 */
function prSendToPayment(int $requestId, int $employeeId): void {
    $conn = db();

    // ── جلب بيانات الطلب كاملة ───────────────────────────────
    $r   = $conn->query("SELECT * FROM purchase_requests WHERE id=$requestId LIMIT 1");
    $req = $r ? $r->fetch_assoc() : null;
    if (!$req) return;

    // ── تحديث حالة الدفع في الطلب ────────────────────────────
    $conn->query("
        UPDATE purchase_requests
        SET payment_status='في الانتظار',
            sent_to_payment_at=NOW()
        WHERE id=$requestId
    ");

    // ── تسجيل حدث الإرسال ────────────────────────────────────
    prLogEvent($requestId, 'sent_to_payment', $employeeId, [
        'stage'       => 'payment',
        'description' => 'تم إرسال الطلب لصفحة المدفوعات اليومية',
    ]);

    // ── إشعار موظفي المالية ──────────────────────────────────
    prNotifyStageRecipients($requestId, 'payment', $req['request_number']);
}


// ════════════════════════════════════════════════════════════
// ⑥ الإحالة والإسناد الداخلي
// ════════════════════════════════════════════════════════════

/**
 * إحالة المعاملة لشخص أو إدارة أخرى
 * تُسجَّل في pr_events مع السبب الإلزامي
 *
 * @param int    $requestId
 * @param int    $fromEmployeeId    من يُحيل
 * @param array  $referralData:
 *   - to_employee_id   (داخلية)
 *   - to_department_id (خارجية)
 *   - type: internal | external
 *   - reason: سبب الإحالة (إلزامي)
 * @return array
 */
function prReferRequest(int $requestId, int $fromEmployeeId, array $referralData): array {
    $conn = db();

    if (empty($referralData['reason'])) {
        return ['success' => false, 'message' => 'سبب الإحالة مطلوب'];
    }

    $req = prGetRequest($requestId);
    if (!$req) return ['success' => false, 'message' => 'الطلب غير موجود'];

    $toEmpId  = !empty($referralData['to_employee_id'])   ? (int)$referralData['to_employee_id']   : null;
    $toDeptId = !empty($referralData['to_department_id']) ? (int)$referralData['to_department_id'] : null;
    $type     = $referralData['type'] === 'external' ? 'external' : 'internal';
    $reason   = $referralData['reason'];
    $empName  = prGetEmployeeName($fromEmployeeId);

    // ── تحديد المرحلة الجديدة بعد الإحالة ─────────────────────
    // الإحالة الداخلية: تُسجل فقط (لا تغيير للمرحلة)
    // الإحالة الخارجية لقسم/موظف خارج المسار: تُسجل فقط
    // الإحالة لموظف الموازنة في المسار الطويل: تُضيف budget_review مؤقت
    $stageChanged = false;

    // إذا كانت الإحالة لموظف محدد وكانت المرحلة الحالية في المسار الطويل
    // وكان المُحال إليه من دور 'budget' — نُضيف مرحلة budget_review مؤقتة
    if ($toEmpId && $req['workflow_path'] === 'long') {
        $empRole = $conn->query("SELECT role FROM employees WHERE id=$toEmpId LIMIT 1")?->fetch_assoc()['role'] ?? '';
        if ($empRole === 'budget') {
            // نحوّل المرحلة الحالية لـ budget_review مؤقتاً
            $conn->query("UPDATE purchase_requests SET current_stage='budget_review' WHERE id=$requestId");
            // إذا لم تكن المرحلة موجودة في الـ workflow_stages — نُضيفها
            $exists = $conn->query("SELECT id FROM pr_workflow_stages WHERE request_id=$requestId AND stage_name='budget_review' LIMIT 1")?->num_rows ?? 0;
            if (!$exists) {
                $conn->query("INSERT INTO pr_workflow_stages (request_id, stage_name, stage_order, status, arrived_at)
                    VALUES ($requestId, 'budget_review', 0, 'pending', NOW())");
            } else {
                $conn->query("UPDATE pr_workflow_stages SET status='pending', arrived_at=NOW(), completed_at=NULL
                    WHERE request_id=$requestId AND stage_name='budget_review'");
            }
            prStartSlaTracking($requestId, 'budget_review');
            $stageChanged = true;
        }
    }

    // ── تسجيل الحدث ──────────────────────────────────────────
    prLogEvent($requestId, 'referred', $fromEmployeeId, [
        'stage'                    => $req['current_stage'],
        'description'              => "$empName أحال الطلب. السبب: $reason",
        'referred_to_employee_id'  => $toEmpId,
        'referred_to_department_id'=> $toDeptId,
        'referral_reason'          => $reason,
        'referral_type'            => $type,
    ]);

    // ── إشعار المُحال إليه ────────────────────────────────────
    if ($toEmpId) {
        prSendNotification($toEmpId, $requestId, [
            'type'    => 'info',
            'title'   => 'إحالة طلب شراء للمراجعة',
            'message' => "تم إحالة الطلب {$req['request_number']} إليك للمراجعة. السبب: $reason",
        ]);
    }

    return ['success' => true, 'message' => 'تم تسجيل الإحالة بنجاح', 'stage_changed' => $stageChanged];
}

/**
 * إسناد المعاملة داخلياً لموظف في نفس الإدارة
 * يُنفَّذ من مدير الإدارة فقط
 * لا يغير مسار العمل — للمتابعة الداخلية فقط
 *
 * @param int    $requestId
 * @param int    $managerEmployeeId   مدير الإدارة (من يُسند)
 * @param int    $assignedEmployeeId  الموظف المُسند إليه
 * @param string $notes               ملاحظات اختيارية
 * @return array
 */
function prAssignRequest(int $requestId, int $managerEmployeeId, int $assignedEmployeeId, string $notes = ''): array {
    $conn = db();

    $req = prGetRequest($requestId);
    if (!$req) return ['success' => false, 'message' => 'الطلب غير موجود'];

    // ── التحقق أن مدير الإدارة لديه صلاحية الإسناد ──────────
    $managerDeptId  = prGetEmployeeDepartment($managerEmployeeId);
    $assigneeDeptId = prGetEmployeeDepartment($assignedEmployeeId);

    if ($managerDeptId !== $assigneeDeptId) {
        return ['success' => false, 'message' => 'يمكن إسناد الطلب لموظف في نفس الإدارة فقط'];
    }

    $prevAssigned = (int)($req['assigned_to'] ?? 0);

    // ── تحديث الموظف المُسند إليه ────────────────────────────
    $conn->query("
        UPDATE purchase_requests
        SET assigned_to=$assignedEmployeeId
        WHERE id=$requestId
    ");

    // ── تسجيل حدث الإسناد ────────────────────────────────────
    $managerName  = prGetEmployeeName($managerEmployeeId);
    $assigneeName = prGetEmployeeName($assignedEmployeeId);

    prLogEvent($requestId, 'assigned', $managerEmployeeId, [
        'stage'                   => $req['current_stage'],
        'description'             => "$managerName أسند الطلب إلى $assigneeName" . ($notes ? ". ملاحظة: $notes" : ''),
        'assigned_to_employee_id' => $assignedEmployeeId,
        'previous_assigned_id'    => $prevAssigned ?: null,
        'old_value'               => $prevAssigned ? prGetEmployeeName($prevAssigned) : 'غير مُسند',
        'new_value'               => $assigneeName,
    ]);

    // ── إشعار فوري للموظف المُسند إليه ──────────────────────
    prSendNotification($assignedEmployeeId, $requestId, [
        'type'    => 'info',
        'title'   => 'تم إسناد طلب شراء إليك',
        'message' => "أسند إليك {$managerName} الطلب رقم {$req['request_number']} للمتابعة" .
                     ($notes ? ". ملاحظة: $notes" : ''),
    ]);

    // ── إشعار للموظف السابق (إن وجد وتغيَّر) ────────────────
    if ($prevAssigned && $prevAssigned !== $assignedEmployeeId) {
        prSendNotification($prevAssigned, $requestId, [
            'type'    => 'info',
            'title'   => 'تم إعادة إسناد طلب شراء',
            'message' => "تم إعادة إسناد الطلب رقم {$req['request_number']} لموظف آخر",
        ]);
    }

    return [
        'success'       => true,
        'message'       => "تم إسناد الطلب إلى $assigneeName بنجاح",
        'assigned_to'   => $assignedEmployeeId,
        'assignee_name' => $assigneeName,
    ];
}


// ════════════════════════════════════════════════════════════
// ⑦ قراءة البيانات والفلترة
// ════════════════════════════════════════════════════════════

/**
 * جلب بيانات طلب واحد مع كل التفاصيل المرتبطة
 *
 * @param int $requestId
 * @return array|null بيانات الطلب أو null إن لم يوجد
 */
function prGetRequest(int $requestId): ?array {
    $conn = db();
    $r    = $conn->query("
        SELECT
            pr.*,
            d.name              AS department_name,
            d.code              AS department_code,
            e.name              AS created_by_name,
            e.department_id     AS creator_dept_id,
            ass.name            AS assigned_to_name,
            s.name              AS supplier_name_resolved,
            fs.name             AS final_supplier_name_resolved,
            cc.name             AS cost_center_name,
            cc.code             AS cost_center_code,
            bc.name             AS budget_category_name,
            bc.code             AS budget_category_code,
            dm.id               AS dept_manager_id,
            dm.name             AS dept_manager_name
        FROM purchase_requests pr
        LEFT JOIN departments   d   ON pr.department_id   = d.id
        LEFT JOIN employees     e   ON pr.created_by      = e.id
        LEFT JOIN employees     ass ON pr.assigned_to     = ass.id
        LEFT JOIN suppliers     s   ON pr.supplier_id     = s.id
        LEFT JOIN suppliers     fs  ON pr.final_supplier_id = fs.id
        LEFT JOIN cost_centers  cc  ON pr.cost_center_id  = cc.id
        LEFT JOIN budget_categories bc ON pr.budget_category_id = bc.id
        LEFT JOIN employees     dm  ON d.manager_id       = dm.id
        WHERE pr.id = $requestId
        LIMIT 1
    ");
    return $r && $r->num_rows ? $r->fetch_assoc() : null;
}

/**
 * جلب قائمة الطلبات مع فلترة حسب صلاحية المستخدم
 *
 * قواعد الرؤية:
 *   - المالية (FIN) → ترى كل الطلبات
 *   - المشتريات (PUR) → ترى الواردة لها + التي أنشأتها
 *   - system_admin  → يرى الكل
 *   - باقي الإدارات → يرون إدارتهم فقط
 *
 * @param int    $userId          معرف المستخدم الحالي
 * @param string $permissionLevel 'system_admin'|'manager'|'employee'
 * @param int    $userDeptId      معرف إدارة المستخدم
 * @param string $deptCode        كود الإدارة مثل FIN | PUR
 * @param array  $filters         فلاتر اختيارية: stage, priority, date_from, date_to, search
 * @return array قائمة الطلبات
 */
function prGetRequests(
    int $userId,
    string $permissionLevel,
    int $userDeptId,
    string $deptCode,
    array $filters = []
): array {
    $conn  = db();
    $where = ['1=1'];

    // ── قواعد الرؤية حسب الإدارة ────────────────────────────
    if ($permissionLevel !== 'system_admin') {
        if ($deptCode === 'FIN') {
            // المالية ترى الكل — لا قيد
        } elseif ($deptCode === 'PUR') {
            // المشتريات ترى الواردة لها (purchasing) + التي أنشأتها
            $where[] = "(pr.department_id=$userDeptId
                        OR pr.current_stage='purchasing'
                        OR pr.current_stage='waiting_budget_approval')";
        } else {
            // بقية الإدارات — إدارتهم فقط
            $where[] = "pr.department_id=$userDeptId";
        }
    }

    // ── الفلاتر ───────────────────────────────────────────────
    if (!empty($filters['stage'])) {
        $s       = $conn->real_escape_string($filters['stage']);
        $where[] = "pr.current_stage='$s'";
    }
    if (!empty($filters['priority'])) {
        $p       = $conn->real_escape_string($filters['priority']);
        $where[] = "pr.priority='$p'";
    }
    if (!empty($filters['date_from'])) {
        $df      = $conn->real_escape_string($filters['date_from']);
        $where[] = "pr.created_at >= '$df'";
    }
    if (!empty($filters['date_to'])) {
        $dt      = $conn->real_escape_string($filters['date_to']);
        $where[] = "pr.created_at <= '$dt 23:59:59'";
    }
    if (!empty($filters['search'])) {
        $q       = $conn->real_escape_string($filters['search']);
        $where[] = "(pr.request_number LIKE '%$q%'
                    OR pr.title        LIKE '%$q%'
                    OR d.name          LIKE '%$q%')";
    }

    $whereStr = implode(' AND ', $where);

    $r = $conn->query("
        SELECT
            pr.id, pr.request_number, pr.title, pr.current_stage,
            pr.workflow_path, pr.priority, pr.amount, pr.currency,
            pr.amount_sar, pr.final_amount, pr.po_number,
            pr.created_at, pr.updated_at,
            pr.assigned_to,
            d.name          AS department_name,
            e.name          AS created_by_name,
            ass.name        AS assigned_to_name,
            s.name          AS supplier_name,
            pr.supplier_name_manual,
            pr.sent_to_payment_at,
            -- SLA: نسبة الوقت المنقضي للمرحلة الحالية
            COALESCE(
                (SELECT ROUND(pst.elapsed_pct, 1)
                 FROM pr_sla_tracking pst
                 WHERE pst.request_id=pr.id AND pst.stage_name=pr.current_stage
                 ORDER BY pst.id DESC LIMIT 1),
            0) AS sla_pct
        FROM purchase_requests pr
        LEFT JOIN departments   d   ON pr.department_id = d.id
        LEFT JOIN employees     e   ON pr.created_by    = e.id
        LEFT JOIN employees     ass ON pr.assigned_to   = ass.id
        LEFT JOIN suppliers     s   ON pr.supplier_id   = s.id
        WHERE $whereStr
        ORDER BY
            FIELD(pr.priority,'urgent','normal'),
            pr.created_at DESC
    ");

    $rows = [];
    if ($r) while ($row = $r->fetch_assoc()) $rows[] = $row;
    return $rows;
}

/**
 * جلب سجل الأحداث لطلب معين (للـ Timeline)
 *
 * @param int $requestId
 * @return array قائمة الأحداث مرتبة تصاعدياً
 */
function prGetEvents(int $requestId): array {
    $conn = db();
    $r    = $conn->query("
        SELECT
            pe.*,
            e.name          AS employee_name_resolved,
            te.name         AS referred_to_emp_name,
            td.name         AS referred_to_dept_name,
            ae.name         AS assigned_to_name
        FROM pr_events pe
        LEFT JOIN employees     e   ON pe.employee_id              = e.id
        LEFT JOIN employees     te  ON pe.referred_to_employee_id  = te.id
        LEFT JOIN departments   td  ON pe.referred_to_department_id= td.id
        LEFT JOIN employees     ae  ON pe.assigned_to_employee_id  = ae.id
        WHERE pe.request_id=$requestId
        ORDER BY pe.created_at ASC
    ");
    $rows = [];
    if ($r) while ($row = $r->fetch_assoc()) $rows[] = $row;
    return $rows;
}

/**
 * جلب طلبات الدفع الجاهزة (لصفحة daily-payments)
 * يُعيد الطلبات في مرحلة payment مع تفاصيلها
 *
 * @return array
 */
function prGetPaymentRequests(): array {
    $conn = db();
    $r    = $conn->query("
        SELECT
            pr.id, pr.request_number, pr.title,
            pr.final_amount, pr.currency, pr.final_amount_sar,
            pr.po_number, pr.sent_to_payment_at,
            pr.priority, pr.payment_status,
            d.name          AS department_name,
            COALESCE(fs.name, pr.final_supplier_name) AS supplier_name,
            br.reservation_number, br.status AS reservation_status
        FROM purchase_requests pr
        LEFT JOIN departments       d   ON pr.department_id      = d.id
        LEFT JOIN suppliers         fs  ON pr.final_supplier_id  = fs.id
        LEFT JOIN budget_reservations br ON pr.budget_reservation_id = br.id
        WHERE pr.current_stage = 'payment'
          AND pr.payment_status IN ('في الانتظار', 'قيد المعالجة')
        ORDER BY pr.priority='urgent' DESC, pr.sent_to_payment_at ASC
    ");
    $rows = [];
    if ($r) while ($row = $r->fetch_assoc()) $rows[] = $row;
    return $rows;
}


// ════════════════════════════════════════════════════════════
// ⑧ SLA: التتبع والإشعارات
// ════════════════════════════════════════════════════════════

/**
 * بدء تتبع SLA لمرحلة معينة
 *
 * @param int    $requestId
 * @param string $stageName
 */
function prStartSlaTracking(int $requestId, string $stageName): void {
    $conn = db();

    // جلب سياسة SLA للمرحلة
    $policy      = prGetSlaPolicy($stageName);
    $allowedMin  = $policy ? (int)round((float)$policy['allowed_hours'] * 60) : null;
    $allowedStr  = $allowedMin !== null ? $allowedMin : 'NULL';

    $conn->query("
        INSERT INTO pr_sla_tracking
            (request_id, policy_id, stage_name, started_at, allowed_minutes, status)
        VALUES
            ($requestId,
             " . ($policy ? $policy['id'] : 'NULL') . ",
             '$stageName', NOW(), $allowedStr, 'active')
        ON DUPLICATE KEY UPDATE
            started_at=NOW(), status='active', elapsed_pct=0,
            warning_sent=0, escalation_sent=0
    ");
}

/**
 * إيقاف عداد SLA مؤقتاً (انتظار اعتماد الحجز)
 *
 * @param int    $requestId
 * @param string $stageName
 */
function prPauseSla(int $requestId, string $stageName): void {
    $conn = db();
    $conn->query("
        UPDATE pr_sla_tracking
        SET paused_at=NOW(), status='paused'
        WHERE request_id=$requestId AND stage_name='$stageName'
          AND status='active'
    ");
    $conn->query("
        UPDATE purchase_requests
        SET sla_paused_at=NOW()
        WHERE id=$requestId
    ");
    prLogEvent($requestId, 'sla_paused', null, [
        'stage'       => $stageName,
        'description' => 'تم إيقاف عداد SLA مؤقتاً — انتظار اعتماد حجز الموازنة',
    ]);
}

/**
 * استئناف عداد SLA بعد اعتماد الحجز
 *
 * @param int    $requestId
 * @param string $stageName
 */
function prResumeSla(int $requestId, string $stageName): void {
    $conn = db();

    // حساب دقائق التوقف وإضافتها للمجموع
    $conn->query("
        UPDATE pr_sla_tracking
        SET resume_at     = NOW(),
            pause_minutes = pause_minutes + TIMESTAMPDIFF(MINUTE, paused_at, NOW()),
            status        = 'active',
            paused_at     = NULL
        WHERE request_id=$requestId AND stage_name='$stageName'
          AND status='paused'
    ");

    // تحديث إجمالي دقائق التوقف في الطلب
    $conn->query("
        UPDATE purchase_requests pr
        JOIN pr_sla_tracking pst ON pst.request_id=pr.id AND pst.stage_name='$stageName'
        SET pr.sla_paused_minutes = pst.pause_minutes,
            pr.sla_paused_at     = NULL
        WHERE pr.id=$requestId
    ");

    prLogEvent($requestId, 'sla_resumed', null, [
        'stage'       => $stageName,
        'description' => 'تم استئناف عداد SLA — اعتمد الرئيس التنفيذي حجز الموازنة',
    ]);
}

/**
 * إنهاء تتبع SLA لمرحلة (عند الانتقال أو الرفض)
 *
 * @param int    $requestId
 * @param string $stageName
 */
function prEndSlaTracking(int $requestId, string $stageName): void {
    $conn = db();
    $conn->query("
        UPDATE pr_sla_tracking
        SET ended_at=NOW(),
            elapsed_minutes=GREATEST(
                TIMESTAMPDIFF(MINUTE, started_at, NOW()) - COALESCE(pause_minutes,0), 0),
            status='completed'
        WHERE request_id=$requestId AND stage_name='$stageName'
          AND status IN ('active','paused')
    ");
}

/**
 * تحديث نسب SLA لجميع الطلبات النشطة
 * تُستدعى من CRON كل 15 دقيقة
 */
function prUpdateAllSlaPercentages(): void {
    $conn = db();

    // جلب كل الطلبات النشطة
    $r = $conn->query("
        SELECT pst.id, pst.request_id, pst.stage_name,
               pst.started_at, pst.pause_minutes, pst.allowed_minutes,
               psp.warning_pct, psp.escalate_pct
        FROM pr_sla_tracking pst
        LEFT JOIN pr_sla_policies psp ON pst.policy_id=psp.id
        WHERE pst.status='active' AND pst.ended_at IS NULL
    ");
    if (!$r) return;

    while ($row = $r->fetch_assoc()) {
        $elapsed = max(0,
            (int)((time() - strtotime($row['started_at'])) / 60)
            - (int)($row['pause_minutes'] ?? 0)
        );
        $allowed = (int)$row['allowed_minutes'];
        $pct     = $allowed > 0 ? min(9999, round($elapsed / $allowed * 100, 1)) : 0;

        $trackId = (int)$row['id'];
        $conn->query("
            UPDATE pr_sla_tracking
            SET elapsed_minutes=$elapsed, elapsed_pct=$pct
            WHERE id=$trackId
        ");

        // ── إرسال التحذير ─────────────────────────────────────
        $warnPct = (int)($row['warning_pct'] ?? 70);
        if ($pct >= $warnPct && !$row['warning_sent']) {
            prHandleSlaWarning((int)$row['request_id'], $row['stage_name'], $elapsed, $allowed, $pct, $trackId);
        }

        // ── إرسال تنبيه التصعيد ───────────────────────────────
        $escalatePct = (int)($row['escalate_pct'] ?? 100);
        if ($pct >= $escalatePct && !$row['escalation_sent']) {
            prHandleSlaEscalation((int)$row['request_id'], $row['stage_name'], $elapsed, $allowed, $pct, $trackId);
        }
    }
}

/**
 * معالجة تحذير SLA
 * يُرسل إشعاراً للموظف المسؤول
 */
function prHandleSlaWarning(int $requestId, string $stage, int $elapsed, int $allowed, float $pct, int $trackId): void {
    $conn = db();
    $req  = prGetRequest($requestId);
    if (!$req) return;

    // تسجيل التجاوز
    $conn->query("
        INSERT INTO pr_sla_breaches
            (request_id, tracking_id, stage_name, breach_type,
             elapsed_minutes, allowed_minutes, breach_pct, notified_at)
        VALUES
            ($requestId, $trackId, '$stage', 'warning',
             $elapsed, $allowed, $pct, NOW())
    ");

    // تحديث علامة التحذير
    $conn->query("UPDATE pr_sla_tracking SET warning_sent=1 WHERE id=$trackId");

    // إشعار الموظف المسؤول
    prNotifyStageRecipients($requestId, $stage, $req['request_number'], 'warning', $pct);
}

/**
 * معالجة تصعيد SLA
 * يُرسل إشعاراً للموظف + مدير الإدارة
 */
function prHandleSlaEscalation(int $requestId, string $stage, int $elapsed, int $allowed, float $pct, int $trackId): void {
    $conn = db();
    $req  = prGetRequest($requestId);
    if (!$req) return;

    $managerId = prGetDepartmentManager((int)$req['department_id']);

    $conn->query("
        INSERT INTO pr_sla_breaches
            (request_id, tracking_id, stage_name, breach_type,
             elapsed_minutes, allowed_minutes, breach_pct,
             escalated_to_id, notified_at)
        VALUES
            ($requestId, $trackId, '$stage', 'breach',
             $elapsed, $allowed, $pct,
             " . ($managerId ?? 'NULL') . ", NOW())
    ");

    $conn->query("UPDATE pr_sla_tracking SET escalation_sent=1 WHERE id=$trackId");

    // إشعار الموظف المسؤول
    prNotifyStageRecipients($requestId, $stage, $req['request_number'], 'breach', $pct);

    // إشعار مدير الإدارة
    if ($managerId) {
        prSendNotification($managerId, $requestId, [
            'type'    => 'urgent',
            'title'   => "⚠️ تجاوز SLA — الطلب {$req['request_number']}",
            'message' => "تجاوز الطلب {$req['request_number']} وقت SLA بنسبة {$pct}% في مرحلة " . prStageName($stage),
        ]);
    }
}

/**
 * جلب سياسة SLA لمرحلة معينة
 *
 * @param string $stageName
 * @return array|null
 */
function prGetSlaPolicy(string $stageName): ?array {
    $conn = db();
    $r    = $conn->query("
        SELECT * FROM pr_sla_policies
        WHERE stage_name='$stageName' AND is_active=1
        ORDER BY department_id IS NOT NULL DESC
        LIMIT 1
    ");
    return $r && $r->num_rows ? $r->fetch_assoc() : null;
}


// ════════════════════════════════════════════════════════════
// ⑨ دوال مساعدة
// ════════════════════════════════════════════════════════════

/**
 * تسجيل حدث في سجل الأحداث
 *
 * @param int    $requestId
 * @param string $eventType  نوع الحدث من ENUM في الجدول
 * @param int|null $employeeId
 * @param array  $data       بيانات إضافية: stage, description, old_value, new_value...
 */
function prLogEvent(int $requestId, string $eventType, ?int $employeeId, array $data = []): void {
    $conn     = db();
    $empId    = $employeeId ?? 'NULL';
    $empName  = $employeeId ? prGetEmployeeName($employeeId) : '';
    $stage    = $conn->real_escape_string($data['stage'] ?? '');
    $desc     = $conn->real_escape_string($data['description'] ?? '');
    $oldVal   = $conn->real_escape_string($data['old_value'] ?? '');
    $newVal   = $conn->real_escape_string($data['new_value'] ?? '');
    $refEmpId = !empty($data['referred_to_employee_id'])
                    ? (int)$data['referred_to_employee_id'] : 'NULL';
    $refDeptId= !empty($data['referred_to_department_id'])
                    ? (int)$data['referred_to_department_id'] : 'NULL';
    $refReason= $conn->real_escape_string($data['referral_reason'] ?? '');
    $refType  = in_array($data['referral_type'] ?? '', ['internal','external'])
                    ? $data['referral_type'] : 'internal';
    $assEmpId = !empty($data['assigned_to_employee_id'])
                    ? (int)$data['assigned_to_employee_id'] : 'NULL';
    $prevAss  = !empty($data['previous_assigned_id'])
                    ? (int)$data['previous_assigned_id'] : 'NULL';

    $conn->query("
        INSERT INTO pr_events
            (request_id, event_type, employee_id, employee_name, stage,
             description, old_value, new_value,
             referred_to_employee_id, referred_to_department_id,
             referral_reason, referral_type,
             assigned_to_employee_id, previous_assigned_id,
             created_at)
        VALUES
            ($requestId, '$eventType', $empId, '$empName', '$stage',
             '$desc', '$oldVal', '$newVal',
             $refEmpId, $refDeptId,
             '$refReason', '$refType',
             $assEmpId, $prevAss,
             NOW())
    ");
}

/**
 * الانتقال من مرحلة لأخرى
 * يُحدِّث current_stage في الطلب ويُسجِّل وقت وصول المرحلة التالية
 *
 * @param int    $requestId
 * @param string $newStage
 * @param int    $byEmployeeId
 */
function prTransitionToStage(int $requestId, string $newStage, int $byEmployeeId): void {
    $conn = db();

    // ── إيقاف SLA للمرحلة الحالية ────────────────────────────
    $req = prGetRequest($requestId);
    if ($req && $req['current_stage']) {
        prEndSlaTracking($requestId, $req['current_stage']);
    }

    // ── تحديث المرحلة الحالية ────────────────────────────────
    $conn->query("
        UPDATE purchase_requests
        SET current_stage='$newStage', updated_at=NOW()
        WHERE id=$requestId
    ");

    // ── تحديث وقت وصول المرحلة الجديدة ──────────────────────
    $conn->query("
        UPDATE pr_workflow_stages
        SET arrived_at=NOW(), status='in_progress', started_at=NOW()
        WHERE request_id=$requestId AND stage_name='$newStage'
          AND arrived_at IS NULL
    ");

    // ── بدء SLA للمرحلة الجديدة ──────────────────────────────
    if (!in_array($newStage, ['completed', 'rejected', 'returned', 'waiting_budget_approval'])) {
        prStartSlaTracking($requestId, $newStage);
    }

    // ── إشعار المسؤولين عن المرحلة الجديدة ──────────────────
    if ($req) {
        prNotifyStageRecipients($requestId, $newStage, $req['request_number']);
        prLogEvent($requestId, 'stage_changed', $byEmployeeId, [
            'stage'       => $newStage,
            'description' => 'انتقل الطلب إلى: ' . prStageName($newStage),
            'old_value'   => $req['current_stage'],
            'new_value'   => $newStage,
        ]);
    }
}

/**
 * إرسال إشعار لموظف معين
 * يستخدم جدول system_notifications الحالي
 *
 * @param int    $recipientId
 * @param int    $requestId
 * @param array  $notification: type, title, message
 */
function prSendNotification(int $recipientId, int $requestId, array $notification): void {
    $conn    = db();
    $type    = $conn->real_escape_string($notification['type'] ?? 'info');
    $title   = $conn->real_escape_string($notification['title'] ?? '');
    $message = $conn->real_escape_string($notification['message'] ?? '');

    $conn->query("
        INSERT INTO system_notifications
            (type, category, title, message, transaction_id,
             recipient_id, is_read, created_at)
        VALUES
            ('$type', 'purchase_request', '$title', '$message',
             $requestId, $recipientId, 0, NOW())
    ");
}

/**
 * إشعار المسؤولين عن مرحلة معينة
 * يجلب الموظفين المناسبين ويرسل لهم إشعاراً
 *
 * @param int    $requestId
 * @param string $stage
 * @param string $requestNumber
 * @param string $notifType  'info'|'warning'|'breach'
 * @param float  $slaPct
 */
function prNotifyStageRecipients(
    int $requestId, string $stage,
    string $requestNumber,
    string $notifType = 'info',
    float $slaPct = 0
): void {
    $conn = db();
    $req  = prGetRequest($requestId);
    if (!$req) return;

    $stageLabel = prStageName($stage);
    $isSlaAlert = $slaPct > 0;

    if ($isSlaAlert) {
        $title   = $slaPct >= 100
            ? "⚠️ تجاوز SLA — الطلب $requestNumber"
            : "⏰ تحذير SLA — الطلب $requestNumber";
        $message = "الطلب $requestNumber بلغ {$slaPct}% من وقت SLA في مرحلة $stageLabel";
        $type    = $slaPct >= 100 ? 'urgent' : 'warning';
    } else {
        $title   = "طلب شراء جديد بانتظارك — $requestNumber";
        $message = "وصل إلى مرحلتك طلب شراء جديد: {$req['title']}";
        $type    = 'info';
    }

    // ── تحديد المستلمين حسب المرحلة ─────────────────────────
    $recipients = prGetStageRecipients($req['department_id'], $stage, $req['workflow_path']);

    foreach ($recipients as $empId) {
        prSendNotification($empId, $requestId, [
            'type'    => $type,
            'title'   => $title,
            'message' => $message,
        ]);
    }
}

/**
 * تحديد معرفات الموظفين المسؤولين عن مرحلة معينة
 *
 * @param int    $deptId     إدارة الطلب الأصلية
 * @param string $stage      المرحلة
 * @param string $workflowPath
 * @return array معرفات الموظفين
 */
function prGetStageRecipients(int $deptId, string $stage, string $workflowPath): array {
    $conn = db();
    $ids  = [];

    switch ($stage) {
        case 'budget_review':
            // موظفو الموازنة في إدارة التخطيط والميزانية
            $r = $conn->query("SELECT id FROM employees WHERE role='budget' AND is_active=1");
            break;
        case 'treasury_review':
            // مدير الخزينة — يُحدَّد من إعدادات النظام أو يجلب بالدور
            $r = $conn->query("SELECT id FROM employees WHERE role='dispatch' AND is_active=1 LIMIT 3");
            break;
        case 'finance_review':
            // المدير المالي
            $r = $conn->query("SELECT id FROM employees WHERE permission_level='manager' AND department_id IN
                               (SELECT id FROM departments WHERE code='FIN') AND is_active=1 LIMIT 2");
            break;
        case 'ceo_approval':
            // الرئيس التنفيذي
            $r = $conn->query("SELECT id FROM employees WHERE role='admin' AND permission_level='system_admin' AND is_active=1 LIMIT 2");
            break;
        case 'purchasing':
            // موظفو المشتريات
            $r = $conn->query("SELECT id FROM employees WHERE department_id IN
                               (SELECT id FROM departments WHERE code='PUR') AND is_active=1");
            break;
        case 'payment':
            // موظفو المالية
            $r = $conn->query("SELECT id FROM employees WHERE role='payment' AND is_active=1");
            break;
        default:
            $r = null;
    }

    if ($r) while ($row = $r->fetch_assoc()) $ids[] = (int)$row['id'];
    return $ids;
}

/**
 * تحديد المرحلة التالية في سير العمل
 *
 * @param string $workflowPath 'short' | 'long'
 * @param string $currentStage
 * @return string المرحلة التالية
 */
function prGetNextStage(string $workflowPath, string $currentStage): string {
    $shortFlow = [
        'budget_review'           => 'purchasing',
        'purchasing'              => 'waiting_budget_approval',
        'waiting_budget_approval' => 'payment',
        'payment'                 => 'completed',
    ];

    $longFlow = [
        'treasury_review'         => 'finance_review',
        'finance_review'          => 'ceo_approval',
        'ceo_approval'            => 'purchasing',
        'purchasing'              => 'waiting_budget_approval',
        'waiting_budget_approval' => 'payment',
        'payment'                 => 'completed',
        // budget_review كمرحلة وسيطة (إحالة لموظف الموازنة في المسار الطويل)
        // بعد موافقة موظف الموازنة → يعود للمرحلة الأصلية treasury_review
        'budget_review'           => 'treasury_review',
    ];

    $flow = $workflowPath === 'short' ? $shortFlow : $longFlow;
    return $flow[$currentStage] ?? 'completed';
}

/**
 * اسم المرحلة بالعربية للعرض
 *
 * @param string $stage
 * @return string
 */
function prStageName(string $stage): string {
    $names = [
        'draft'                   => 'مسودة',
        'budget_review'           => 'مراجعة موظف الموازنة',
        'treasury_review'         => 'مراجعة مدير الخزينة',
        'finance_review'          => 'مراجعة المدير المالي',
        'treasury_finance_review' => 'مراجعة الخزينة والمالية',
        'ceo_approval'            => 'اعتماد الرئيس التنفيذي',
        'purchasing'              => 'المشتريات',
        'waiting_budget_approval' => 'انتظار اعتماد الحجز',
        'payment'                 => 'المالية — الدفع',
        'completed'               => 'مكتملة',
        'rejected'                => 'مرفوضة',
        'returned'                => 'مُرجَعة لمدير الإدارة',
    ];
    return $names[$stage] ?? $stage;
}

/**
 * جلب اسم موظف بمعرفه
 *
 * @param int $employeeId
 * @return string
 */
function prGetEmployeeName(int $employeeId): string {
    $conn = db();
    $r    = $conn->query("SELECT name FROM employees WHERE id=$employeeId LIMIT 1");
    return ($r && $r->num_rows) ? $r->fetch_assoc()['name'] : "موظف#$employeeId";
}

/**
 * جلب معرف إدارة الموظف
 *
 * @param int $employeeId
 * @return int|null
 */
function prGetEmployeeDepartment(int $employeeId): ?int {
    $conn = db();
    $r    = $conn->query("SELECT department_id FROM employees WHERE id=$employeeId LIMIT 1");
    return ($r && $r->num_rows) ? (int)$r->fetch_assoc()['department_id'] : null;
}

/**
 * جلب معرف مدير إدارة معينة
 *
 * @param int $deptId
 * @return int|null
 */
function prGetDepartmentManager(int $deptId): ?int {
    $conn = db();
    $r    = $conn->query("SELECT manager_id FROM departments WHERE id=$deptId LIMIT 1");
    return ($r && $r->num_rows) ? (int)$r->fetch_assoc()['manager_id'] : null;
}