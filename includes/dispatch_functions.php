<?php
/**
 * dispatch_functions.php
 * مرحلة الفرز (Dispatch) — بين الموازنة والدفع
 * يُضاف في includes/ ويُضمَّن في functions.php
 */

// ═══════════════════════════════════════════════════════════════
//  ضمان وجود الجدول
// ═══════════════════════════════════════════════════════════════

function ensureDispatchTable() {
    $conn = db();
    $conn->query("CREATE TABLE IF NOT EXISTS dispatch_data (
        id               INT(11)      NOT NULL AUTO_INCREMENT,
        transaction_id   INT(11)      NOT NULL,
        employee_id      INT(11)      DEFAULT NULL,
        dispatch_type    VARCHAR(50)  NOT NULL DEFAULT 'to_payment',
        routed_to        VARCHAR(200) DEFAULT NULL,
        notes            TEXT         DEFAULT NULL,
        status           VARCHAR(50)  NOT NULL DEFAULT 'في الانتظار',
        ola_active       TINYINT(1)   NOT NULL DEFAULT 1,
        ola_paused_at    DATETIME     DEFAULT NULL,
        dispatched_at    DATETIME     DEFAULT NULL,
        created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_tx (transaction_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
}

// ═══════════════════════════════════════════════════════════════
//  الحصول على بيانات dispatch لمعاملة
// ═══════════════════════════════════════════════════════════════

function getDispatchData($transactionId) {
    $conn = db();
    $txId = (int)$transactionId;
    $res  = $conn->query("
        SELECT dd.*, e.name AS employee_name
        FROM dispatch_data dd
        LEFT JOIN employees e ON dd.employee_id = e.id
        WHERE dd.transaction_id = $txId
        LIMIT 1
    ");
    return ($res && $res->num_rows > 0) ? $res->fetch_assoc() : null;
}

// ═══════════════════════════════════════════════════════════════
//  تنفيذ قرار الفرز
// ═══════════════════════════════════════════════════════════════

/**
 * يُسجَّل عند ضغط مدير الحسابات على زر "توجيه"
 *
 * @param int    $txId         معرف المعاملة
 * @param int    $employeeId   معرف مدير الحسابات
 * @param string $dispatchType to_payment | to_purchase_order | to_requester
 * @param string $routedTo     اسم الجهة (نص حر)
 * @param string $notes        ملاحظات
 */
function saveDispatch($txId, $employeeId, $dispatchType, $routedTo, $notes) {
    $conn          = db();
    ensureDispatchTable();
    $txId          = (int)$txId;
    $empSql        = $employeeId ? (int)$employeeId : 'NULL';
    $dispatchType  = $conn->real_escape_string($dispatchType);
    $routedTo      = $conn->real_escape_string($routedTo);
    $notes         = $conn->real_escape_string($notes);
    $now           = date('Y-m-d H:i:s');

    // ── تحديد ما إذا كان OLA يُعلَّق ───────────────────────────
    // مسار أمر الشراء / إعادة للجهة الطالبة → خارج OLA (ola_active=0)
    // مسار الدفع المباشر → داخل OLA (ola_active=1)
    $olaActive    = ($dispatchType === 'to_payment') ? 1 : 0;
    $olaPausedSql = $olaActive ? 'NULL' : "'$now'";
    $status       = 'تم التوجيه';

    $conn->query("INSERT INTO dispatch_data
                  (transaction_id, employee_id, dispatch_type, routed_to, notes,
                   status, ola_active, ola_paused_at, dispatched_at)
                  VALUES ($txId, $empSql, '$dispatchType', '$routedTo', '$notes',
                          '$status', $olaActive, $olaPausedSql, '$now')
                  ON DUPLICATE KEY UPDATE
                      employee_id    = VALUES(employee_id),
                      dispatch_type  = VALUES(dispatch_type),
                      routed_to      = VALUES(routed_to),
                      notes          = VALUES(notes),
                      status         = VALUES(status),
                      ola_active     = VALUES(ola_active),
                      ola_paused_at  = VALUES(ola_paused_at),
                      dispatched_at  = VALUES(dispatched_at),
                      updated_at     = NOW()");

    // ── تسجيل OLA: إتمام مرحلة dispatch ────────────────────────
    // received_at يُسجَّل عند فتح النموذج (استلام الموظف للمهمة)
    // completed_at = الآن (ضغط توجيه)
    recordStageTimeFromLastUpdate($txId, 'dispatch', $employeeId, $status);

    // ── إذا دفع مباشر → ابدأ مرحلة payment ─────────────────────
    if ($dispatchType === 'to_payment') {
        startNextStage($txId, 'payment', $now);
    }
    // إذا أمر شراء → لا تبدأ payment (المعاملة معلقة حتى يعود أمر الشراء)

    return [
        'success'       => true,
        'dispatch_type' => $dispatchType,
        'ola_active'    => $olaActive,
        'routed_to'     => $routedTo,
    ];
}

// ═══════════════════════════════════════════════════════════════
//  استئناف مرحلة payment بعد عودة أمر الشراء
// ═══════════════════════════════════════════════════════════════

/**
 * يُستدعى عندما يعود أمر الشراء وتصبح المعاملة جاهزة للدفع
 */
function resumeDispatchToPayment($txId, $employeeId, $notes = '') {
    $conn   = db();
    $txId   = (int)$txId;
    $empSql = $employeeId ? (int)$employeeId : 'NULL';
    $now    = date('Y-m-d H:i:s');
    $notes  = $conn->real_escape_string($notes);

    $conn->query("UPDATE dispatch_data
                  SET ola_active = 1, ola_paused_at = NULL,
                      status = 'مكتمل', notes = CONCAT(COALESCE(notes,''), ' | استئناف: $notes'),
                      updated_at = NOW()
                  WHERE transaction_id = $txId");

    // ابدأ مرحلة payment
    startNextStage($txId, 'payment', $now);

    return ['success' => true];
}

// ═══════════════════════════════════════════════════════════════
//  جلب قائمة المعاملات في مرحلة dispatch
// ═══════════════════════════════════════════════════════════════

function getDispatchQueue($filters = []) {
    $conn  = db();
    ensureDispatchTable();
    $where = ["(dd.status IS NULL OR dd.status = 'في الانتظار' OR dd.status = 'قيد المراجعة')"];

    if (!empty($filters['dispatch_type'])) {
        $dt = $conn->real_escape_string($filters['dispatch_type']);
        $where[] = "dd.dispatch_type = '$dt'";
    }

    $res = $conn->query("
        SELECT
            t.id, t.transaction_number, t.amount, t.transaction_date,
            tt.name                         AS type_name,
            bd.budget_status,
            bd.budget_code,
            COALESCE(dd.status,'في الانتظار') AS dispatch_status,
            dd.dispatch_type,
            dd.routed_to,
            dd.ola_active,
            dd.dispatched_at,
            e.name                          AS dispatch_employee,
            st.started_at,
            st.received_at,
            CASE WHEN st.received_at IS NOT NULL
                 THEN TIMESTAMPDIFF(MINUTE, st.received_at, NOW())
                 ELSE NULL
            END                             AS ola_elapsed_min
        FROM transactions t
        LEFT JOIN transaction_types tt  ON t.type_id   = tt.id
        LEFT JOIN budget_data       bd  ON t.id        = bd.transaction_id
        LEFT JOIN dispatch_data     dd  ON t.id        = dd.transaction_id
        LEFT JOIN employees         e   ON dd.employee_id = e.id
        LEFT JOIN stage_times       st  ON t.id        = st.transaction_id AND st.stage = 'dispatch'
        WHERE bd.budget_status = 'معتمد'
          AND (dd.status IS NULL OR dd.status NOT IN ('مكتمل'))
        ORDER BY t.transaction_date ASC
    ");

    $rows = [];
    if ($res) while ($r = $res->fetch_assoc()) $rows[] = $r;
    return $rows;
}
