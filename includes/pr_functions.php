<?php

// ═══════════════════════════════════════════════════════════
// Self-Healing DB — يُضيف الأعمدة المفقودة عند تحميل الملف
// ═══════════════════════════════════════════════════════════
if (function_exists('db')) {
    $_prHealConn = db();
    // permission_level_code — عمود الصلاحيات الموسَّع
    @$_prHealConn->query(
        "ALTER TABLE employees ADD COLUMN IF NOT EXISTS permission_level_code VARCHAR(50) DEFAULT NULL"
    );
    // توسيع ENUM ليشمل المستويات الخمسة
    @$_prHealConn->query(
        "ALTER TABLE employees MODIFY COLUMN permission_level
         ENUM('system_admin','sector_head','division_manager','employee_l1','employee','manager')
         NOT NULL DEFAULT 'employee'"
    );
    // system_notifications — أعمدة الإشعارات الجديدة
    @$_prHealConn->query(
        "ALTER TABLE system_notifications ADD COLUMN IF NOT EXISTS action_url VARCHAR(500) DEFAULT NULL"
    );
    @$_prHealConn->query(
        "ALTER TABLE system_notifications ADD COLUMN IF NOT EXISTS grouped_id VARCHAR(100) DEFAULT NULL"
    );
    @$_prHealConn->query(
        "ALTER TABLE system_notifications ADD COLUMN IF NOT EXISTS expires_at DATETIME DEFAULT NULL"
    );
    @$_prHealConn->query(
        "ALTER TABLE system_notifications ADD COLUMN IF NOT EXISTS priority TINYINT NOT NULL DEFAULT 5"
    );
    unset($_prHealConn);
}


/**
 * Helper: نفذ استعلام وأعد fetch_assoc آمناً من PHP 7.4
 */
function _qfetch($conn, $sql) {
    $r = $conn->query($sql);
    return ($r && $r->num_rows > 0) ? $r->fetch_assoc() : null;
}
function _qval($conn, $sql, $field, $default = null) {
    $r = $conn->query($sql);
    if (!$r || !$r->num_rows) return $default;
    $row = $r->fetch_assoc();
    return $row[$field] ?? $default;
}


// ════════════════════════════════════════════════════════════
// Self-Healing: يُضيف الأعمدة المفقودة تلقائياً عند الحاجة
// يُنفَّذ مرة واحدة فقط خلال الطلب (static guard)
// ════════════════════════════════════════════════════════════
function prEnsureColumns(): void {
    static $done = false;
    if ($done) return;
    $done = true;

    $conn = db();

    // purchase_requests — الأعمدة الأكثر عرضة للغياب
    $prCols = [
        'assigned_to'           => "ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS assigned_to INT DEFAULT NULL",
        'rejection_reason'      => "ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS rejection_reason TEXT DEFAULT NULL",
        'rejected_at'           => "ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS rejected_at DATETIME DEFAULT NULL",
        'rejected_by'           => "ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS rejected_by INT DEFAULT NULL",
        'returned_to_manager'   => "ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS returned_to_manager INT DEFAULT NULL",
        'returned_at'           => "ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS returned_at DATETIME DEFAULT NULL",
        'workflow_path'         => "ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS workflow_path ENUM('short','long') NOT NULL DEFAULT 'short'",
        'current_stage'         => "ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS current_stage VARCHAR(60) NOT NULL DEFAULT 'budget_review'",
        'po_number'             => "ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS po_number VARCHAR(100) DEFAULT NULL",
        'final_supplier_id'     => "ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS final_supplier_id INT DEFAULT NULL",
        'final_supplier_name'   => "ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS final_supplier_name VARCHAR(255) DEFAULT NULL",
        'final_amount'          => "ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS final_amount DECIMAL(15,2) DEFAULT NULL",
        'final_amount_sar'      => "ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS final_amount_sar DECIMAL(15,2) DEFAULT NULL",
        'po_issued_at'          => "ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS po_issued_at DATETIME DEFAULT NULL",
        'po_issued_by'          => "ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS po_issued_by INT DEFAULT NULL",
        'budget_reservation_id' => "ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS budget_reservation_id INT DEFAULT NULL",
        'payment_status'        => "ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'في الانتظار'",
        'sent_to_payment_at'    => "ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS sent_to_payment_at DATETIME DEFAULT NULL",
        'sla_paused_at'         => "ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS sla_paused_at DATETIME DEFAULT NULL",
        'sla_paused_minutes'    => "ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS sla_paused_minutes INT NOT NULL DEFAULT 0",
        'amount_sar'            => "ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS amount_sar DECIMAL(15,2) DEFAULT NULL",
        'exchange_rate'         => "ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS exchange_rate DECIMAL(10,4) NOT NULL DEFAULT 1.0000",
        'needed_date'           => "ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS needed_date DATE DEFAULT NULL",
        'priority'              => "ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS priority ENUM('normal','urgent') NOT NULL DEFAULT 'normal'",
        'updated_at'            => "ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS updated_at DATETIME DEFAULT NULL ON UPDATE NOW()",
    ];
    foreach ($prCols as $sql) { @$conn->query($sql); }

    // pr_workflow_stages
    $wsCols = [
        "ALTER TABLE pr_workflow_stages ADD COLUMN IF NOT EXISTS assigned_to INT DEFAULT NULL",
        "ALTER TABLE pr_workflow_stages ADD COLUMN IF NOT EXISTS approved_by INT DEFAULT NULL",
        "ALTER TABLE pr_workflow_stages ADD COLUMN IF NOT EXISTS started_at DATETIME DEFAULT NULL",
        "ALTER TABLE pr_workflow_stages ADD COLUMN IF NOT EXISTS arrived_at DATETIME DEFAULT NULL",
        "ALTER TABLE pr_workflow_stages ADD COLUMN IF NOT EXISTS duration_min INT DEFAULT NULL",
        "ALTER TABLE pr_workflow_stages ADD COLUMN IF NOT EXISTS action VARCHAR(50) DEFAULT NULL",
        "ALTER TABLE pr_workflow_stages ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT NULL",
        "ALTER TABLE pr_workflow_stages ADD COLUMN IF NOT EXISTS employee_id INT DEFAULT NULL",
    ];
    foreach ($wsCols as $sql) { @$conn->query($sql); }
}

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
    prEnsureColumns();
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
    prEnsureColumns();
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

    // ── التحقق من صلاحية الموظف لهذه المرحلة ────────────────
    // آمن من غياب عمود assigned_to: نتحقق أولاً من وجوده
    $_qr1 = $conn->query("
        SELECT COUNT(*) AS c FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'pr_workflow_stages'
          AND COLUMN_NAME  = 'assigned_to'
    ");
    $_qr1row = $_qr1 ? $_qr1->fetch_assoc() : null;
    $hasAssignedTo = isset($_qr1row['c']) ? (int)$_qr1row['c'] : 0;

    if ((int)$hasAssignedTo > 0) {
        $_qrStageTmp_ = $conn->query("
            SELECT assigned_to FROM pr_workflow_stages
            WHERE request_id=$requestId AND stage_name='" . $conn->real_escape_string($stage) . "'
            LIMIT 1
        ");
        $stageRow = ($_qrStageTmp_) ? $_qrStageTmp_->fetch_assoc() : null;

        if (!empty($stageRow['assigned_to']) && (int)$stageRow['assigned_to'] !== $employeeId) {
            $levelRow = (($_qr2 = $conn->query("SELECT permission_level FROM employees WHERE id=$employeeId LIMIT 1")) ? $_qr2->fetch_assoc() : null);
            if (($levelRow['permission_level'] ?? '') !== 'system_admin') {
                return ['success' => false, 'message' => 'غير مخوّل باعتماد هذه المرحلة'];
            }
        }
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

    // ── منع نفس الشخص من الموافقة مرتين ─────────────────────
    $_qr3 = $conn->query("
        SELECT COUNT(*) AS c FROM pr_stage_approvals
        WHERE request_id=$requestId AND stage_name='$stage'
        AND employee_id=$employeeId AND status='approved'
    ");
    $_qr3row = $_qr3 ? $_qr3->fetch_assoc() : null;
    $alreadyApproved = isset($_qr3row['c']) ? (int)$_qr3row['c'] : 0;

    if ((int)$alreadyApproved > 0) {
        return ['success' => false, 'message' => 'لقد سبق أن وافقت على هذه المرحلة'];
    }

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

            // ── مسح مراحل المسار القصير القديمة قبل إضافة الطويل ──
            // يمنع ازدواج السجلات في pr_workflow_stages
            $conn->query("
                DELETE FROM pr_workflow_stages
                WHERE request_id=$requestId
                  AND stage_name IN (
                      'budget_review','purchasing',
                      'waiting_budget_approval','payment','completed'
                  )
            ");

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
        $_qr4 = $conn->query("SELECT role FROM employees WHERE id=$toEmpId LIMIT 1");
        $_qr4row = $_qr4 ? $_qr4->fetch_assoc() : null;
        $empRole = isset($_qr4row['role']) ? $_qr4row['role'] : '';
        if ($empRole === 'budget') {
            // نحوّل المرحلة الحالية لـ budget_review مؤقتاً
            $conn->query("UPDATE purchase_requests SET current_stage='budget_review' WHERE id=$requestId");
            // إذا لم تكن المرحلة موجودة في الـ workflow_stages — نُضيفها
            $_qrEx_ = $conn->query("SELECT id FROM pr_workflow_stages WHERE request_id=$requestId AND stage_name='budget_review' LIMIT 1"); $exists = ($_qrEx_ && $_qrEx_->num_rows) ? $_qrEx_->num_rows : 0;
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

    // ── بدء عداد SLA للإحالة إذا كانت لموظف محدد ────────────
    if ($toEmpId && !$stageChanged) {
        prStartReferralSlaTracking($requestId, $toEmpId);
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
    prEnsureColumns();
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
    prEnsureColumns();
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

    // ── قواعد الرؤية — تُجلب من DB مباشرةً لضمان الدقة ─────────
    // لا نعتمد على الجلسة لأن بيانات الإدارة قد تكون قديمة
    $empInfoRow = (($_qr5 = $conn->query("
        SELECT e.role, e.department_id, e.division_id, e.sector_id,
               d.code  AS dept_code,
               ds.code AS sector_code,
               dd.code AS division_code
        FROM employees e
        LEFT JOIN departments d  ON d.id = e.department_id
        LEFT JOIN departments ds ON ds.id = e.sector_id
        LEFT JOIN departments dd ON dd.id = e.division_id
        WHERE e.id = $userId
        LIMIT 1
    ")) ? $_qr5->fetch_assoc() : null);

    $userRole      = $empInfoRow['role']          ?? '';
    $empDeptId     = (int)($empInfoRow['department_id'] ?? 0);
    $empDeptCode   = $empInfoRow['dept_code']     ?? '';
    $empSectorCode = $empInfoRow['sector_code']   ?? '';
    $empDivCode    = $empInfoRow['division_code'] ?? '';

    // هل ينتمي لقطاع سلاسل الإمداد؟
    // يتحقق من كود الإدارة المباشرة + القسم + القطاع (أي منها يبدأ بـ 41 أو = PUR)
    $allCodes      = [$empDeptCode, $empSectorCode, $empDivCode];
    $isSupplyChain = false;
    foreach ($allCodes as $_c) {
        if ($_c === 'PUR' || (strpos((string)$_c, '41') === 0)) {
            $isSupplyChain = true;
            break;
        }
    }

    // الأدوار التي ترى جميع معاملات طلبات الشراء
    $rolesViewAll = ['budget', 'payment', 'dispatch', 'treasury_manager', 'CEO', 'admin', 'purchasing'];

    // هل إدارة المستخدم مالية؟
    $isFinanceDept = ($empDeptCode === 'FIN' || $empSectorCode === 'FIN' || $deptCode === 'FIN');

    // جلب مستوى الصلاحية الموسَّع من DB
    $permRow = (($_qr6 = $conn->query("
        SELECT permission_level, permission_level_code
        FROM employees WHERE id=$userId LIMIT 1
    ")) ? $_qr6->fetch_assoc() : null);
    $permLevelDB   = $permRow['permission_level']      ?? $permissionLevel;
    $permLevelCode = $permRow['permission_level_code'] ?? $permLevelDB;

    if ($permLevelDB === 'system_admin'
        || in_array($userRole, $rolesViewAll)
        || $isFinanceDept
    ) {
        // system_admin + أدوار مالية → يرون الكل
    } elseif ($permLevelCode === 'sector_head' || $permLevelDB === 'sector_head') {
        // رئيس القطاع → يرى جميع معاملات قطاعه
        // يُحدَّد القطاع من sector_id للموظف
        $sectorDeptIds = [];
        $sr = $conn->query("
            SELECT id FROM departments
            WHERE sector_id=$empDeptId
               OR id=$empDeptId
        ");
        if ($sr) while ($srow = $sr->fetch_assoc()) $sectorDeptIds[] = (int)$srow['id'];
        if (!empty($sectorDeptIds)) {
            $idsStr  = implode(',', $sectorDeptIds);
            $where[] = "pr.department_id IN ($idsStr)";
        } else {
            $where[] = "pr.department_id=$empDeptId";
        }
    } elseif ($isSupplyChain || $deptCode === 'PUR') {
        // سلاسل الإمداد → يرون مرحلة المشتريات فقط
        $where[] = "(pr.department_id=$empDeptId
                    OR pr.current_stage='purchasing'
                    OR pr.current_stage='waiting_budget_approval')";
    } elseif (in_array($permLevelCode, ['division_manager','manager']) || in_array($permLevelDB, ['division_manager','manager'])) {
        // مدير القسم → يرى قسمه فقط (الحالة الافتراضية)
        $where[] = "pr.department_id=" . ($empDeptId ?: $userDeptId);
    } elseif (in_array($permLevelCode, ['employee_l1','employee']) || in_array($permLevelDB, ['employee_l1','employee'])) {
        // موظف → يرى ما أنشأه هو فقط
        $where[] = "(pr.created_by=$userId OR pr.department_id=$empDeptId)";
    } else {
        // fallback
        $where[] = "pr.department_id=" . ($empDeptId ?: $userDeptId);
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
 * جلب حالة SLA لجميع مراحل الطلب
 * يُرجع مصفوفة بكل مراحل pr_sla_tracking مرتبة زمنياً
 * مع حساب الوقت المنقضي الحقيقي (مطروحاً منه وقت التوقف)
 *
 * الحقول المُرجَعة لكل مرحلة:
 *   stage_name, status, elapsed_minutes, allowed_minutes,
 *   elapsed_pct, pause_minutes, started_at, ended_at, policy_name
 *
 * @param int $requestId
 * @return array
 */
function prGetRequestSlaStatus(int $requestId): array {
    $conn = db();

    // تأكد أن الجداول موجودة
    $conn->query("
        CREATE TABLE IF NOT EXISTS pr_sla_tracking (
            id               INT AUTO_INCREMENT PRIMARY KEY,
            request_id       INT          NOT NULL,
            policy_id        INT          DEFAULT NULL,
            stage_name       VARCHAR(60)  NOT NULL,
            started_at       DATETIME     NOT NULL,
            paused_at        DATETIME     DEFAULT NULL,
            resume_at        DATETIME     DEFAULT NULL,
            ended_at         DATETIME     DEFAULT NULL,
            allowed_minutes  INT          DEFAULT NULL,
            pause_minutes    INT          NOT NULL DEFAULT 0,
            elapsed_minutes  INT          NOT NULL DEFAULT 0,
            elapsed_pct      DECIMAL(7,1) NOT NULL DEFAULT 0,
            warning_sent     TINYINT(1)   NOT NULL DEFAULT 0,
            escalation_sent  TINYINT(1)   NOT NULL DEFAULT 0,
            status           ENUM('active','paused','completed') NOT NULL DEFAULT 'active',
            UNIQUE KEY uq_req_stage (request_id, stage_name),
            INDEX idx_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    $r = $conn->query("
        SELECT
            pst.id,
            pst.stage_name,
            pst.status,
            pst.started_at,
            pst.ended_at,
            pst.paused_at,
            pst.allowed_minutes,
            pst.pause_minutes,
            -- الوقت المنقضي الفعلي: الفرق من البداية ناقص وقت التوقف
            GREATEST(0,
                TIMESTAMPDIFF(MINUTE, pst.started_at,
                    COALESCE(pst.ended_at, NOW())
                ) - COALESCE(pst.pause_minutes, 0)
            ) AS elapsed_minutes,
            -- النسبة المئوية المحسوبة لحظياً
            CASE
                WHEN pst.allowed_minutes > 0 THEN
                    ROUND(
                        GREATEST(0,
                            TIMESTAMPDIFF(MINUTE, pst.started_at,
                                COALESCE(pst.ended_at, NOW())
                            ) - COALESCE(pst.pause_minutes, 0)
                        ) / pst.allowed_minutes * 100, 1
                    )
                ELSE pst.elapsed_pct
            END AS elapsed_pct,
            psp.name AS policy_name,
            psp.warning_pct,
            psp.escalate_pct
        FROM pr_sla_tracking pst
        LEFT JOIN pr_sla_policies psp ON pst.policy_id = psp.id
        WHERE pst.request_id = $requestId
          AND pst.stage_name NOT LIKE 'referral_%'
        ORDER BY pst.started_at ASC
    ");

    $rows = [];
    if ($r) {
        while ($row = $r->fetch_assoc()) {
            $rows[] = [
                'id'              => (int)$row['id'],
                'stage_name'      => $row['stage_name'],
                'status'          => $row['status'],
                'started_at'      => $row['started_at'],
                'ended_at'        => $row['ended_at'],
                'paused_at'       => $row['paused_at'],
                'allowed_minutes' => (int)($row['allowed_minutes'] ?? 0),
                'pause_minutes'   => (int)($row['pause_minutes'] ?? 0),
                'elapsed_minutes' => (int)($row['elapsed_minutes'] ?? 0),
                'elapsed_pct'     => (float)($row['elapsed_pct'] ?? 0),
                'policy_name'     => $row['policy_name'] ?? null,
                'warning_pct'     => (int)($row['warning_pct'] ?? 70),
                'escalate_pct'    => (int)($row['escalate_pct'] ?? 100),
            ];
        }
    }

    // إذا لم يوجد سجل SLA بعد — أرجع سجلاً محسوباً من المرحلة الحالية
    if (empty($rows)) {
        $req = (($_qr7 = $conn->query("
            SELECT pr.current_stage, pr.created_at,
                   psp.name AS policy_name,
                   psp.allowed_hours, psp.warning_pct, psp.escalate_pct
            FROM purchase_requests pr
            LEFT JOIN pr_sla_policies psp ON psp.stage_name = pr.current_stage
              AND psp.is_active = 1
            WHERE pr.id = $requestId
            LIMIT 1
        ")) ? $_qr7->fetch_assoc() : null);

        if ($req) {
            $allowedMin = $req['allowed_hours'] ? (int)round((float)$req['allowed_hours'] * 60) : 0;
            $elapsed    = (int)((time() - strtotime($req['created_at'])) / 60);
            $pct        = $allowedMin > 0 ? round($elapsed / $allowedMin * 100, 1) : 0;
            $rows[]     = [
                'id'              => 0,
                'stage_name'      => $req['current_stage'],
                'status'          => 'active',
                'started_at'      => $req['created_at'],
                'ended_at'        => null,
                'paused_at'       => null,
                'allowed_minutes' => $allowedMin,
                'pause_minutes'   => 0,
                'elapsed_minutes' => $elapsed,
                'elapsed_pct'     => min(9999, $pct),
                'policy_name'     => $req['policy_name'] ?? null,
                'warning_pct'     => (int)($req['warning_pct'] ?? 70),
                'escalate_pct'    => (int)($req['escalate_pct'] ?? 100),
            ];
        }
    }

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

    // guard: لا توقف إذا كان العداد متوقفاً أو منتهياً أو غير موجود
    $check = $conn->query("
        SELECT status FROM pr_sla_tracking
        WHERE request_id=$requestId AND stage_name='$stageName'
        LIMIT 1
    ");
    if (!$check || $check->num_rows === 0) return;
    $row = $check->fetch_assoc();
    if ($row['status'] !== 'active') return;

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
 * @param ?int $employeeId
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

    // ── ضمان وجود الجدول والأعمدة المطلوبة ────────────────────
    static $tableChecked = false;
    if (!$tableChecked) {
        $conn->query("
            CREATE TABLE IF NOT EXISTS system_notifications (
                id             INT AUTO_INCREMENT PRIMARY KEY,
                type           VARCHAR(20)  NOT NULL DEFAULT 'info',
                category       VARCHAR(60)  DEFAULT NULL,
                title          VARCHAR(255) NOT NULL DEFAULT '',
                message        TEXT         DEFAULT NULL,
                transaction_id INT          DEFAULT NULL,
                employee_id    INT          DEFAULT NULL,
                recipient_id   INT          DEFAULT NULL,
                action_url     VARCHAR(500) DEFAULT NULL,
                priority       TINYINT      NOT NULL DEFAULT 5,
                is_read        TINYINT(1)   NOT NULL DEFAULT 0,
                read_at        DATETIME     DEFAULT NULL,
                email_sent     TINYINT(1)   NOT NULL DEFAULT 0,
                exchange_sent  TINYINT(1)   NOT NULL DEFAULT 0,
                grouped_id     VARCHAR(100) DEFAULT NULL,
                expires_at     DATETIME     DEFAULT NULL,
                created_at     DATETIME     NOT NULL DEFAULT NOW(),
                INDEX idx_recipient (recipient_id),
                INDEX idx_employee  (employee_id),
                INDEX idx_unread    (is_read, created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        ");
        // أضف الأعمدة الجديدة إن لم تكن موجودة
        foreach ([
            "ALTER TABLE system_notifications ADD COLUMN IF NOT EXISTS action_url  VARCHAR(500) DEFAULT NULL",
            "ALTER TABLE system_notifications ADD COLUMN IF NOT EXISTS priority    TINYINT NOT NULL DEFAULT 5",
            "ALTER TABLE system_notifications ADD COLUMN IF NOT EXISTS grouped_id  VARCHAR(100) DEFAULT NULL",
            "ALTER TABLE system_notifications ADD COLUMN IF NOT EXISTS expires_at  DATETIME DEFAULT NULL",
        ] as $sql) { @$conn->query($sql); }
        $tableChecked = true;
    }

    $type      = $conn->real_escape_string($notification['type'] ?? 'info');
    $title     = $conn->real_escape_string($notification['title'] ?? '');
    $message   = $conn->real_escape_string($notification['message'] ?? '');
    $priority  = (int)($notification['priority'] ?? 5);
    $expiresAt = !empty($notification['expires_days'])
        ? "DATE_ADD(NOW(), INTERVAL " . (int)$notification['expires_days'] . " DAY)"
        : 'DATE_ADD(NOW(), INTERVAL 30 DAY)';

    // action_url: رابط مباشر للطلب في النظام
    $actionUrl = "purchase-requests#{$requestId}";
    $actionUrl = $conn->real_escape_string($actionUrl);

    // grouped_id: يجمع إشعارات نفس الطلب + النوع معاً
    $groupedId = "pr_{$requestId}_{$type}";
    $groupedId = $conn->real_escape_string($groupedId);

    // كتابة في كلا العمودين لضمان الاسترجاع
    $conn->query("
        INSERT INTO system_notifications
            (type, category, title, message, transaction_id,
             employee_id, recipient_id, action_url, grouped_id,
             priority, expires_at, is_read, created_at)
        VALUES
            ('$type', 'purchase_request', '$title', '$message',
             $requestId, $recipientId, $recipientId, '$actionUrl', '$groupedId',
             $priority, $expiresAt, 0, NOW())
    ");

    // ── إرسال إيميل عند أحداث Workflow ──────────────────────────
    // نرسل فقط للحالات المهمة (ليس كل info صغير)
    $emailWorthy = in_array($type, ['warning', 'urgent'])
        || in_array($notification['send_email'] ?? '', ['1', true, 'yes'])
        || ($notification['type'] ?? '') === 'info'; // كل انتقال مرحلة يستحق إيميل

    if ($emailWorthy && function_exists('sendSmtpEmail')) {
        $empRow = (($_qr8 = $conn->query("SELECT name, email FROM employees WHERE id=$recipientId LIMIT 1")) ? $_qr8->fetch_assoc() : null);
        if (!empty($empRow['email'])) {
            $html = _prBuildWorkflowEmailHtml($title, $message, $type, $requestId);
            @sendSmtpEmail($empRow['email'], $empRow['name'], $title, $html);
        }
    }
}

/**
 * بناء قالب إيميل لأحداث Workflow
 */
function _prBuildWorkflowEmailHtml(string $title, string $message, string $type, int $requestId): string {
    if ($type === 'urgent') {
        $color = '#dc2626'; $icon = '🚨';
    } elseif ($type === 'warning') {
        $color = '#d97706'; $icon = '⚠️';
    } else {
        $color = '#2563eb'; $icon = '📋';
    }
    $msg = nl2br(htmlspecialchars($message));
    $appUrl = (isset($_SERVER['HTTP_HOST']) ? 'http://' . $_SERVER['HTTP_HOST'] : '');
    $link   = "{$appUrl}/index.php#purchase-requests";

    return <<<HTML
<!DOCTYPE html><html lang="ar" dir="rtl">
<head><meta charset="UTF-8">
<style>
body{font-family:Arial,sans-serif;background:#f3f4f6;margin:0;padding:20px;direction:rtl}
.card{background:#fff;border-radius:12px;max-width:520px;margin:auto;border-top:4px solid {$color};box-shadow:0 2px 12px rgba(0,0,0,.1)}
.hd{background:{$color};color:#fff;padding:18px 22px;border-radius:8px 8px 0 0}
.hd h1{margin:0;font-size:16px;font-weight:700}
.bd{padding:20px 22px;font-size:14px;color:#374151;line-height:1.7}
.btn{display:inline-block;background:{$color};color:#fff;padding:9px 20px;border-radius:7px;text-decoration:none;font-weight:700;font-size:13px;margin-top:14px}
.ft{background:#f9fafb;padding:12px 22px;font-size:11px;color:#9ca3af;text-align:center;border-radius:0 0 8px 8px}
</style></head>
<body>
<div class="card">
  <div class="hd"><h1>{$icon} {$title}</h1></div>
  <div class="bd">
    <p>{$msg}</p>
    <a href="{$link}" class="btn">فتح النظام ←</a>
  </div>
  <div class="ft">نظام إدارة طلبات الشراء — لا تردّ على هذا البريد</div>
</div>
</body></html>
HTML;
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
            // مدير الخزينة — الدور الصحيح هو treasury_manager
            // احتياطي: dispatch في قسم الخزينة إذا لم يوجد treasury_manager مسجّل
            $r = $conn->query("
                SELECT id FROM employees
                WHERE role='treasury_manager' AND is_active=1
                UNION
                SELECT e.id FROM employees e
                JOIN departments d ON d.id=e.department_id
                WHERE e.role='dispatch'
                  AND d.code IN ('TRES','TREASURY','FIN')
                  AND e.is_active=1
                  AND NOT EXISTS (SELECT 1 FROM employees WHERE role='treasury_manager' AND is_active=1)
                LIMIT 3
            ");
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
            // موظفو سلاسل الإمداد: دور purchasing/dispatch أو كود 41xxxx أو PUR
            $r = $conn->query("
                SELECT DISTINCT e.id FROM employees e
                LEFT JOIN departments d ON d.id = e.department_id
                WHERE e.is_active = 1
                  AND (
                    e.role IN ('purchasing', 'dispatch')
                    OR d.code = 'PUR'
                    OR d.code LIKE '41%'
                  )
            ");
            break;
        case 'payment':
            // موظفو المالية
            $r = $conn->query("SELECT id FROM employees WHERE role='payment' AND is_active=1");
            break;
        default:
            $r = null;
    }

    if ($r) while ($row = $r->fetch_assoc()) $ids[] = (int)$row['id'];

    // ── fallback: إذا لم يُعثَر على أحد → أرسل لـ system_admin ──
    if (empty($ids)) {
        $fb = $conn->query("SELECT id FROM employees WHERE role='admin' AND is_active=1 LIMIT 2");
        if ($fb) while ($row = $fb->fetch_assoc()) $ids[] = (int)$row['id'];
    }

    return array_unique($ids);
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

/**
 * هل الإدارة تابعة لقطاع سلاسل الإمداد؟
 * يتحقق من كود الإدارة (PUR أو يبدأ بـ 41)
 */
function prIsSupplyChainDept(mysqli $conn, int $deptId): bool {
    if ($deptId <= 0) return false;
    $r = $conn->query("SELECT code FROM departments WHERE id=$deptId LIMIT 1");
    if (!$r || $r->num_rows === 0) return false;
    $code = $r->fetch_assoc()['code'] ?? '';
    return $code === 'PUR' || (strpos((string)$code, '41') === 0);
}

/**
 * هل الموظف ينتمي لقطاع سلاسل الإمداد؟
 * يفحص department_id + sector_id + division_id في التسلسل الهرمي
 * لا يعتمد على بيانات الجلسة — يُجلب من DB مباشرةً
 *
 * @param mysqli $conn
 * @param int    $employeeId
 * @return bool
 */
function prIsUserSupplyChain(mysqli $conn, int $employeeId): bool {
    $r = $conn->query("
        SELECT e.role,
               d.code  AS dept_code,
               ds.code AS sector_code,
               dd.code AS division_code
        FROM employees e
        LEFT JOIN departments d  ON d.id  = e.department_id
        LEFT JOIN departments ds ON ds.id = e.sector_id
        LEFT JOIN departments dd ON dd.id = e.division_id
        WHERE e.id = $employeeId
        LIMIT 1
    ");
    if (!$r || $r->num_rows === 0) return false;
    $row  = $r->fetch_assoc();

    // الدور نفسه يدل على سلاسل الإمداد
    if (in_array($row['role'] ?? '', ['purchasing', 'dispatch'])) return true;

    // كود القسم أو القطاع أو التقسيم يبدأ بـ 41 أو = PUR
    $codes = [
        $row['dept_code']    ?? '',
        $row['sector_code']  ?? '',
        $row['division_code']?? '',
    ];
    foreach ($codes as $c) {
        if ($c === 'PUR' || (strpos((string)$c, '41') === 0)) return true;
    }
    return false;
}

// ════════════════════════════════════════════════════════════
// ⑩ إعادة تقديم الطلب المرجَع
// ════════════════════════════════════════════════════════════

/**
 * إعادة تقديم طلب مرجَع بعد مراجعته
 * المدير فقط من يملك هذه الصلاحية
 *
 * @param int    $requestId
 * @param int    $managerId   مدير الإدارة الطالبة
 * @param string $notes       ملاحظات إعادة التقديم (اختيارية)
 * @return array
 */
function prResubmitRequest(int $requestId, int $managerId, string $notes = ''): array {
    prEnsureColumns();
    $conn = db();

    $req = prGetRequest($requestId);
    if (!$req) return ['success' => false, 'message' => 'الطلب غير موجود'];

    // ── التحقق أن الطلب في حالة إرجاع ───────────────────────
    if ($req['current_stage'] !== 'returned') {
        return ['success' => false, 'message' => 'الطلب ليس في حالة إرجاع — لا يمكن إعادة تقديمه'];
    }

    // ── التحقق أن المُقدِّم مدير الإدارة الطالبة ────────────
    $permRow = (($_qr9 = $conn->query("
        SELECT permission_level FROM employees WHERE id=$managerId LIMIT 1
    ")) ? $_qr9->fetch_assoc() : null);
    $permLevel = $permRow['permission_level'] ?? 'employee';

    $canResubmit = !in_array($permLevel, ['employee', 'employee_l1']);
    if (!$canResubmit) {
        return ['success' => false, 'message' => 'فقط مدير الإدارة يستطيع إعادة تقديم الطلب'];
    }

    // ── تحديد المرحلة الأولى بحسب المسار ────────────────────
    $firstStage = $req['workflow_path'] === 'long' ? 'treasury_review' : 'budget_review';

    $esc         = $conn->real_escape_string($notes);
    $managerName = prGetEmployeeName($managerId);

    $conn->begin_transaction();
    try {
        // ── إعادة تعيين الطلب ─────────────────────────────────
        $conn->query("
            UPDATE purchase_requests
            SET current_stage       = '$firstStage',
                rejection_reason    = NULL,
                rejected_at         = NULL,
                rejected_by         = NULL,
                returned_to_manager = NULL,
                returned_at         = NULL,
                updated_at          = NOW()
            WHERE id=$requestId
        ");

        // ── إعادة تعيين مرحلة سير العمل الأولى ───────────────
        $conn->query("
            UPDATE pr_workflow_stages
            SET status       = 'pending',
                arrived_at   = NOW(),
                started_at   = NULL,
                completed_at = NULL,
                employee_id  = NULL,
                notes        = NULL
            WHERE request_id=$requestId AND stage_name='$firstStage'
        ");

        // ── تسجيل الحدث ──────────────────────────────────────
        prLogEvent($requestId, 'resubmitted', $managerId, [
            'stage'       => $firstStage,
            'description' => "$managerName أعاد تقديم الطلب للمرحلة: " . prStageName($firstStage)
                           . ($notes ? ". ملاحظة: $notes" : ''),
            'old_value'   => 'returned',
            'new_value'   => $firstStage,
        ]);

        // ── إعادة تشغيل SLA ───────────────────────────────────
        prStartSlaTracking($requestId, $firstStage);

        // ── إشعار المسؤولين عن المرحلة الجديدة ───────────────
        prNotifyStageRecipients($requestId, $firstStage, $req['request_number']);

        $conn->commit();
    } catch (Exception $e) {
        $conn->rollback();
        return ['success' => false, 'message' => 'فشل إعادة التقديم: ' . $e->getMessage()];
    }

    // ── إشعار صاحب الطلب بأن إعادة التقديم تمت ────────────────
    $createdBy = (int)($req['created_by'] ?? 0);
    if ($createdBy && $createdBy !== $managerId) {
        prSendNotification($createdBy, $requestId, [
            'type'    => 'info',
            'title'   => "✅ تمت إعادة تقديم طلبك — {$req['request_number']}",
            'message' => "أعاد {$managerName} تقديم طلبك إلى مرحلة " . prStageName($firstStage)
                       . ($notes ? ". ملاحظة: {$notes}" : ''),
        ]);
    }

    return [
        'success'     => true,
        'message'     => 'تمت إعادة تقديم الطلب بنجاح',
        'new_stage'   => $firstStage,
        'stage_label' => prStageName($firstStage),
    ];
}


// ════════════════════════════════════════════════════════════
// ⑪ SLA الإحالة — عداد منفصل لوقت الانتظار عند المُحال إليه
// ════════════════════════════════════════════════════════════

/**
 * بدء عداد SLA منفصل عند إحالة الطلب
 * يُسجَّل كمرحلة 'referral_N' حيث N = عدد الإحالات السابقة + 1
 *
 * @param int $requestId
 * @param int $toEmployeeId
 */
function prStartReferralSlaTracking(int $requestId, int $toEmployeeId): void {
    $conn = db();

    // عدد الإحالات السابقة لهذا الطلب
    $_qr10 = $conn->query("
        SELECT COUNT(*) AS c FROM pr_sla_tracking
        WHERE request_id=$requestId AND stage_name LIKE 'referral_%'
    ");
    $_qr10row = $_qr10 ? $_qr10->fetch_assoc() : null;
    $cnt = (int)($_qr10row['c'] ?? 0);

    $stageName = 'referral_' . ($cnt + 1);

    // جلب سياسة SLA للإحالة (stage_name='referral') إن وُجدت
    $policy    = prGetSlaPolicy('referral');
    $allowedMin = $policy ? (int)round((float)$policy['allowed_hours'] * 60) : null;
    $allowedStr = $allowedMin !== null ? $allowedMin : 'NULL';
    $policyId   = $policy ? $policy['id'] : 'NULL';

    $conn->query("
        INSERT INTO pr_sla_tracking
            (request_id, policy_id, stage_name, started_at, allowed_minutes, status)
        VALUES
            ($requestId, $policyId, '$stageName', NOW(), $allowedStr, 'active')
        ON DUPLICATE KEY UPDATE
            started_at=NOW(), status='active', elapsed_pct=0,
            warning_sent=0, escalation_sent=0
    ");
}

/**
 * إنهاء عداد SLA الإحالة (عند انتهاء الإحالة أو موافقة المُحال إليه)
 *
 * @param int $requestId
 */
function prEndReferralSlaTracking(int $requestId): void {
    $conn = db();
    // ننهي آخر سجل إحالة نشط
    $conn->query("
        UPDATE pr_sla_tracking
        SET ended_at=NOW(),
            elapsed_minutes=GREATEST(
                TIMESTAMPDIFF(MINUTE, started_at, NOW()) - COALESCE(pause_minutes,0), 0),
            status='completed'
        WHERE request_id=$requestId
          AND stage_name LIKE 'referral_%'
          AND status='active'
        ORDER BY id DESC
        LIMIT 1
    ");
}