<?php
/**
 * workflow_pr_patch.php
 * ════════════════════════════════════════════════════════════
 * ملف الترقية: يُستدعى مرة واحدة لتحديث دوال pr_functions.php
 * ببديل يقرأ المراحل من قاعدة البيانات بدلاً من الكود الصلب.
 *
 * تضمين هذا الملف في functions.php أو pr_functions.php
 * يُستبدل فيه:
 *   ① prInitWorkflowStages()  → يقرأ من workflow_stage_definitions
 *   ② prGetNextStage()        → يقرأ من workflow_stage_definitions
 *   ③ prStageName()           → يقرأ من workflow_stage_definitions أولاً ثم fallback
 *   ④ prSelectWorkflowPath()  → NEW: يختار القالب المناسب بناءً على المبلغ
 * ════════════════════════════════════════════════════════════
 */


// ════════════════════════════════════════════════════════════
// ① اختيار المسار المناسب بناءً على المبلغ بالريال
//    يبحث في workflow_templates عن أنسب قالب
//    يعود إلى 'short' / 'long' كـ fallback
// ════════════════════════════════════════════════════════════
function prSelectWorkflowPath(float $amountSar): string {
    $conn = db();

    // التأكد من وجود الجداول (قد تكون غير مُثبَّتة بعد)
    $check = $conn->query("SHOW TABLES LIKE 'workflow_templates'");
    if (!$check || $check->num_rows === 0) {
        // Fallback للكود القديم
        $threshold = (float) prGetSetting('pr_amount_threshold', '5000');
        return $amountSar < $threshold ? 'short' : 'long';
    }

    // جلب القوالب النشطة مرتبةً بـ sort_order
    $r = $conn->query("
        SELECT template_key, amount_min, amount_max
        FROM workflow_templates
        WHERE is_active = 1
        ORDER BY sort_order ASC, id ASC
    ");

    $matched = null;
    if ($r) {
        while ($row = $r->fetch_assoc()) {
            $min = $row['amount_min'] !== null ? (float)$row['amount_min'] : null;
            $max = $row['amount_max'] !== null ? (float)$row['amount_max'] : null;

            $minOk = ($min === null) || ($amountSar >= $min);
            $maxOk = ($max === null) || ($amountSar <= $max);

            if ($minOk && $maxOk) {
                $matched = $row['template_key'];
                break;
            }
        }
    }

    // إذا لم يُعثَر على قالب مطابق → استخدم الـ fallback
    if (!$matched) {
        $threshold = (float) prGetSetting('pr_amount_threshold', '5000');
        $matched = $amountSar < $threshold ? 'short' : 'long';
    }

    return $matched;
}


// ════════════════════════════════════════════════════════════
// ② تهيئة مراحل سير العمل عند إنشاء الطلب
//    يقرأ المراحل من workflow_stage_definitions
//    إذا لم تكن الجداول موجودة → يعود للكود الصلب
// ════════════════════════════════════════════════════════════
function prInitWorkflowStages(int $requestId, string $workflowPath): void {
    $conn = db();

    // هل جداول الإعداد الجديدة موجودة؟
    $check = $conn->query("SHOW TABLES LIKE 'workflow_stage_definitions'");
    $hasNewTables = ($check && $check->num_rows > 0);

    if ($hasNewTables) {
        $keyE = $conn->real_escape_string($workflowPath);

        // جلب معرف القالب
        $tplRow = $conn->query("
            SELECT id FROM workflow_templates
            WHERE template_key='$keyE' AND is_active=1
            LIMIT 1
        ")->fetch_assoc();

        if ($tplRow) {
            $tplId = (int)$tplRow['id'];

            // جلب المراحل مرتبةً
            $stagesR = $conn->query("
                SELECT stage_key, stage_order
                FROM workflow_stage_definitions
                WHERE template_id = $tplId
                ORDER BY stage_order ASC
            ");

            if ($stagesR && $stagesR->num_rows > 0) {
                $first = true;
                while ($row = $stagesR->fetch_assoc()) {
                    $stageName = $conn->real_escape_string($row['stage_key']);
                    $order     = (int)$row['stage_order'];
                    $arrived   = $first ? "NOW()" : 'NULL';
                    $first     = false;
                    $conn->query("
                        INSERT INTO pr_workflow_stages
                            (request_id, stage_name, stage_order, status, arrived_at)
                        VALUES
                            ($requestId, '$stageName', $order, 'pending', $arrived)
                    ");
                }
                return; // تم بنجاح من الجداول الجديدة
            }
        }
    }

    // ── Fallback: الكود الصلب الأصلي ─────────────────────────
    $stages = $workflowPath === 'short'
        ? [
            ['reception',               1],
            ['budget_review',           2],
            ['treasury_review',         3],
            ['finance_review',          4],
            ['purchasing',              5],
            ['waiting_budget_approval', 6],
            ['accounts_review',         7],
            ['payment',                 8],
            ['completed',               9],
        ]
        : [
            ['reception',               1],
            ['budget_review',           2],
            ['treasury_review',         3],
            ['finance_review',          4],
            ['ceo_approval',            5],
            ['purchasing',              6],
            ['waiting_budget_approval', 7],
            ['accounts_review',         8],
            ['payment',                 9],
            ['completed',              10],
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
// ③ الانتقال للمرحلة التالية — يقرأ من DB أو Fallback
// ════════════════════════════════════════════════════════════
function prGetNextStage(string $workflowPath, string $currentStage): string {
    $conn = db();

    // هل الجداول الجديدة موجودة؟
    $check = $conn->query("SHOW TABLES LIKE 'workflow_stage_definitions'");
    if ($check && $check->num_rows > 0) {
        $keyE   = $conn->real_escape_string($workflowPath);
        $stageE = $conn->real_escape_string($currentStage);

        $tplRow = $conn->query("
            SELECT id FROM workflow_templates
            WHERE template_key='$keyE' AND is_active=1
            LIMIT 1
        ")->fetch_assoc();

        if ($tplRow) {
            $tplId = (int)$tplRow['id'];

            // جلب ترتيب المرحلة الحالية
            $curR = $conn->query("
                SELECT stage_order FROM workflow_stage_definitions
                WHERE template_id=$tplId AND stage_key='$stageE'
                LIMIT 1
            ");
            if ($curR && $curR->num_rows) {
                $curOrder = (int)$curR->fetch_assoc()['stage_order'];

                // المرحلة التالية: أصغر stage_order أكبر من الحالي
                $nextR = $conn->query("
                    SELECT stage_key FROM workflow_stage_definitions
                    WHERE template_id=$tplId AND stage_order > $curOrder
                    ORDER BY stage_order ASC
                    LIMIT 1
                ");
                if ($nextR && $nextR->num_rows) {
                    return $nextR->fetch_assoc()['stage_key'];
                }
            }
        }
    }

    // ── Fallback: الخريطة الصلبة الأصلية ─────────────────────
    $shortFlow = [
        'reception'               => 'budget_review',
        'budget_review'           => 'treasury_review',
        'treasury_review'         => 'finance_review',
        'finance_review'          => 'purchasing',
        'purchasing'              => 'waiting_budget_approval',
        'waiting_budget_approval' => 'accounts_review',
        'accounts_review'         => 'payment',
        'po_issuance'             => 'payment',
        'payment'                 => 'completed',
    ];
    $longFlow = [
        'reception'               => 'budget_review',
        'budget_review'           => 'treasury_review',
        'treasury_review'         => 'finance_review',
        'finance_review'          => 'ceo_approval',
        'ceo_approval'            => 'purchasing',
        'purchasing'              => 'waiting_budget_approval',
        'waiting_budget_approval' => 'accounts_review',
        'accounts_review'         => 'payment',
        'po_issuance'             => 'payment',
        'payment'                 => 'completed',
    ];

    $flow = $workflowPath === 'short' ? $shortFlow : $longFlow;
    if (!isset($flow[$currentStage])) {
        error_log("prGetNextStage: مرحلة غير معروفة '$currentStage' في المسار '$workflowPath'");
        return $currentStage;
    }
    return $flow[$currentStage];
}


// ════════════════════════════════════════════════════════════
// ④ اسم المرحلة — يبحث في DB أولاً ثم fallback
// ════════════════════════════════════════════════════════════
function prStageName(string $stage): string {
    static $cache = [];

    if (isset($cache[$stage])) return $cache[$stage];

    $conn  = db();
    $stageE = $conn->real_escape_string($stage);

    // بحث في جداول جديدة (أي قالب — نعيد أول تطابق)
    $check = $conn->query("SHOW TABLES LIKE 'workflow_stage_definitions'");
    if ($check && $check->num_rows > 0) {
        $r = $conn->query("
            SELECT stage_name_ar FROM workflow_stage_definitions
            WHERE stage_key='$stageE'
            LIMIT 1
        ");
        if ($r && $r->num_rows) {
            $name = $r->fetch_assoc()['stage_name_ar'];
            $cache[$stage] = $name;
            return $name;
        }
    }

    // ── Fallback: القاموس الأصلي ──────────────────────────────
    $names = [
        'draft'                   => 'مسودة',
        'reception'               => 'الاستلام والتحقق',
        'budget_review'           => 'مراجعة موظف الموازنة',
        'treasury_review'         => 'مراجعة مدير الخزينة',
        'finance_review'          => 'مراجعة رئيس القطاع المالي',
        'treasury_finance_review' => 'مراجعة الخزينة والمالية',
        'ceo_approval'            => 'موافقة مبدئية — الرئيس التنفيذي',
        'purchasing'              => 'المشتريات — إنشاء حجز',
        'waiting_budget_approval' => 'اعتماد حجز الموازنة',
        'accounts_review'         => 'الحسابات — مراجعة وتوزيع',
        'po_issuance'             => 'إصدار أمر الشراء (PO)',
        'payment'                 => 'المالية — الدفع',
        'completed'               => 'مكتملة',
        'rejected'                => 'مرفوضة',
        'returned'                => 'مُرجَعة للمنشئ',
    ];
    $result = $names[$stage] ?? $stage;
    $cache[$stage] = $result;
    return $result;
}


// ════════════════════════════════════════════════════════════
// ⑤ الموافقة المزدوجة — يقرأ من DB إن توفرت
//    يُكمل prHandleDualApproval الأصلية بقراءة الإعداد
// ════════════════════════════════════════════════════════════

/**
 * هل المرحلة تتطلب موافقة مزدوجة؟
 * يبحث في workflow_stage_definitions ثم fallback للقائمة الصلبة
 */
function prStageRequiresDualApproval(string $workflowPath, string $stage): bool {
    $conn   = db();
    $check  = $conn->query("SHOW TABLES LIKE 'workflow_stage_definitions'");
    if ($check && $check->num_rows > 0) {
        $keyE   = $conn->real_escape_string($workflowPath);
        $stageE = $conn->real_escape_string($stage);

        $tplRow = $conn->query("
            SELECT wt.id FROM workflow_templates wt
            WHERE wt.template_key='$keyE' AND wt.is_active=1
            LIMIT 1
        ")->fetch_assoc();

        if ($tplRow) {
            $tplId = (int)$tplRow['id'];
            $r = $conn->query("
                SELECT requires_dual_approval
                FROM workflow_stage_definitions
                WHERE template_id=$tplId AND stage_key='$stageE'
                LIMIT 1
            ");
            if ($r && $r->num_rows) {
                return (bool)(int)$r->fetch_assoc()['requires_dual_approval'];
            }
        }
    }
    // Fallback
    return in_array($stage, ['treasury_review', 'finance_review']);
}


/**
 * جلب جميع مراحل مسار معين من DB (للعرض في الواجهة)
 * تُعيد مصفوفة مرتبة من [stage_key, stage_name_ar, stage_order, ...]
 */
function prGetWorkflowPathStages(string $workflowPath): array {
    $conn   = db();
    $check  = $conn->query("SHOW TABLES LIKE 'workflow_stage_definitions'");
    if (!$check || $check->num_rows === 0) return [];

    $keyE = $conn->real_escape_string($workflowPath);
    $r    = $conn->query("
        SELECT wsd.*
        FROM workflow_stage_definitions wsd
        JOIN workflow_templates wt ON wt.id = wsd.template_id
        WHERE wt.template_key='$keyE' AND wt.is_active=1
        ORDER BY wsd.stage_order ASC
    ");

    $rows = [];
    if ($r) while ($row = $r->fetch_assoc()) $rows[] = $row;
    return $rows;
}
