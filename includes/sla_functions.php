<?php
/**
 * sla_functions.php
 * نظام SLA / OLA — دوال الحساب والتصعيد والتقارير
 */
require_once __DIR__ . '/notification_functions.php';

// ═══════════════════════════════════════════════════════════════
//  أسماء المراحل بالعربي
// ═══════════════════════════════════════════════════════════════
const STAGE_LABELS = [
    'creation' => 'الإنشاء',
    'receiving' => 'الاستلام',
    'budget'   => 'الموازنة',
    'payment'  => 'الدفع',
    'invoice'  => 'الفوترة',
];

// ═══════════════════════════════════════════════════════════════
//  جلب السياسات
// ═══════════════════════════════════════════════════════════════

/**
 * جلب سياسة SLA المناسبة لنوع معاملة
 */
function getSlaPolicy($transactionTypeId = null) {
    $conn = db();
    $tid  = (int)($transactionTypeId ?? 0);

    // ابحث أولاً عن سياسة خاصة بهذا النوع
    if ($tid > 0) {
        $r = $conn->query("SELECT * FROM sla_policies
                           WHERE transaction_type_id = $tid AND is_active = 1 LIMIT 1");
        if ($r && $r->num_rows > 0) return $r->fetch_assoc();
    }

    // ارجع للسياسة العامة
    $r = $conn->query("SELECT * FROM sla_policies
                       WHERE transaction_type_id IS NULL AND is_active = 1 LIMIT 1");
    return ($r && $r->num_rows > 0) ? $r->fetch_assoc() : null;
}

/**
 * جلب كل سياسات SLA مع قواعد OLA التابعة
 */
function getAllSlaPolicies() {
    $conn     = db();
    $policies = [];

    $res = $conn->query("SELECT sp.*, tt.name AS type_name
                         FROM sla_policies sp
                         LEFT JOIN transaction_types tt ON sp.transaction_type_id = tt.id
                         ORDER BY sp.id");
    if (!$res) return [];

    while ($p = $res->fetch_assoc()) {
        $pid = (int)$p['id'];
        $ola = $conn->query("SELECT * FROM ola_rules WHERE sla_policy_id = $pid ORDER BY FIELD(stage,'creation','receiving','budget','payment','invoice')");
        $p['ola_rules'] = [];
        while ($r = $ola->fetch_assoc()) $p['ola_rules'][] = $r;
        $policies[] = $p;
    }
    return $policies;
}

/**
 * جلب قواعد OLA لسياسة معينة — مفهرسة حسب المرحلة
 */
function getOlaRules($policyId) {
    $conn  = db();
    $pid   = (int)$policyId;
    $rules = [];

    $res = $conn->query("SELECT * FROM ola_rules WHERE sla_policy_id = $pid");
    while ($r = $res->fetch_assoc()) $rules[$r['stage']] = $r;
    return $rules;
}

// ═══════════════════════════════════════════════════════════════
//  حفظ / تعديل السياسات
// ═══════════════════════════════════════════════════════════════

function saveSlaPolicy($data) {
    $conn  = db();
    $name  = $conn->real_escape_string($data['name'] ?? 'سياسة جديدة');
    $tid   = !empty($data['transaction_type_id']) ? (int)$data['transaction_type_id'] : 'NULL';
    $hours = (float)($data['total_hours'] ?? 24);
    $warn  = (int)($data['warning_pct'] ?? 80);
    $id    = (int)($data['id'] ?? 0);

    if ($id > 0) {
        $conn->query("UPDATE sla_policies SET name='$name', transaction_type_id=$tid,
                      total_hours=$hours, warning_pct=$warn WHERE id=$id");
        return ['success' => true, 'id' => $id];
    }
    $conn->query("INSERT INTO sla_policies (name,transaction_type_id,total_hours,warning_pct)
                  VALUES ('$name',$tid,$hours,$warn)");
    return ['success' => true, 'id' => $conn->insert_id];
}

function saveOlaRule($data) {
    $conn    = db();
    $pid     = (int)($data['sla_policy_id'] ?? 0);
    $stage   = $conn->real_escape_string($data['stage'] ?? '');
    $label   = $conn->real_escape_string($data['stage_label'] ?? STAGE_LABELS[$stage] ?? $stage);
    $hours   = (float)($data['allowed_hours'] ?? 4);
    $warnPct = (int)($data['warn_at_pct'] ?? 50);
    $escPct  = (int)($data['escalate_pct'] ?? 100);
    $id      = (int)($data['id'] ?? 0);

    if ($id > 0) {
        $conn->query("UPDATE ola_rules SET stage='$stage', stage_label='$label',
                      allowed_hours=$hours, warn_at_pct=$warnPct, escalate_pct=$escPct
                      WHERE id=$id AND sla_policy_id=$pid");
        return ['success' => true];
    }
    $conn->query("INSERT INTO ola_rules (sla_policy_id,stage,stage_label,allowed_hours,warn_at_pct,escalate_pct)
                  VALUES ($pid,'$stage','$label',$hours,$warnPct,$escPct)
                  ON DUPLICATE KEY UPDATE
                    stage_label='$label', allowed_hours=$hours,
                    warn_at_pct=$warnPct, escalate_pct=$escPct");
    return ['success' => true];
}

// ═══════════════════════════════════════════════════════════════
//  فحص الخروقات ← النواة الأساسية
// ═══════════════════════════════════════════════════════════════

/**
 * يفحص معاملة واحدة ويُسجّل الخروقات / التصعيدات
 * يُستدعى عند كل تحديث وعند الفحص الدوري
 */
function checkTransactionSla($transactionId) {
    $conn = db();
    $txId = (int)$transactionId;
    $now  = new DateTime();

    $txRes = $conn->query("SELECT t.*, tt.id AS type_id
                           FROM transactions t
                           LEFT JOIN transaction_types tt ON t.type_id = tt.id
                           WHERE t.id = $txId LIMIT 1");
    if (!$txRes || $txRes->num_rows === 0) return [];

    $tx     = $txRes->fetch_assoc();
    $policy = getSlaPolicy($tx['type_id']);
    if (!$policy) return [];

    $olaRules     = getOlaRules($policy['id']);
    $breaches     = [];
    $totalElapsed = 0;

    $stages = ['receiving','budget','payment','invoice'];

    foreach ($stages as $stage) {
        if (!isset($olaRules[$stage])) continue;

        $rule       = $olaRules[$stage];
        $allowedMin = (float)$rule['allowed_hours'] * 60;

        $stRes = $conn->query("SELECT * FROM stage_times
                               WHERE transaction_id = $txId AND stage = '$stage'
                               ORDER BY id DESC LIMIT 1");
        if (!$stRes || $stRes->num_rows === 0) continue;

        $st = $stRes->fetch_assoc();

        // ── OLA يبدأ من received_at، وإذا فارغ → started_at كبديل ──
        if (!empty($st['received_at'])) {
            $olaStart = $st['received_at'];
        } elseif (!empty($st['started_at'])) {
            $olaStart = $st['started_at'];
            // سجّل received_at = started_at لمنع تكرار الحسبة ولا تعطي فرصة ثانية
            $conn->query("UPDATE stage_times SET received_at = '{$st['started_at']}'
                          WHERE transaction_id = $txId AND stage = '$stage'
                          AND received_at IS NULL");
        } else {
            continue; // لا يوجد وقت بداية → تخطَّ
        }

        $isCompleted = !empty($st['completed_at']);
        $isEscalated = !empty($st['escalated_at']);

        $olaStartDt = new DateTime($olaStart);

        // OLA ينتهي عند: escalated_at إن وُجد، أو completed_at، أو الآن
        if ($isEscalated) {
            $olaEnd = new DateTime($st['escalated_at']);
        } elseif ($isCompleted) {
            $olaEnd = new DateTime($st['completed_at']);
        } else {
            $olaEnd = $now;
        }

        $elapsedMin = (int)round(($olaEnd->getTimestamp() - $olaStartDt->getTimestamp()) / 60);
        $pct        = $allowedMin > 0 ? round(($elapsedMin / $allowedMin) * 100, 1) : 0;
        $empId      = (int)($st['employee_id'] ?? 0);

        // نضيف للوقت الكلي فقط ola_minutes
        $totalElapsed += $elapsedMin;

        // المرحلة المكتملة أو المُصعَّدة → لا نفحص خروقات جديدة
        if ($isCompleted || $isEscalated) continue;

        // ─── OLA warning ────────────────────────────────────────
        $warnMin = $allowedMin * ($rule['warn_at_pct'] / 100);
        if ($elapsedMin >= $warnMin) {
            $breach = _recordBreach($conn, $txId, $stage, 'ola_warning',
                                    $empId, $elapsedMin, (int)$allowedMin, $pct);
            if ($breach) $breaches[] = $breach;
        }

        // ─── OLA breach (تصعيد) ─────────────────────────────────
        $escMin = $allowedMin * ($rule['escalate_pct'] / 100);
        if ($elapsedMin >= $escMin) {
            $supervisorId = _getSupervisor($conn, $empId);
            $breach = _recordBreach($conn, $txId, $stage, 'ola_breach',
                                    $empId, $elapsedMin, (int)$allowedMin, $pct, $supervisorId);
            if ($breach) {
                $breaches[] = $breach;
                // ── تسجيل escalated_at لوقف الساعة ────────────
                $nowStr = $now->format('Y-m-d H:i:s');
                $conn->query("UPDATE stage_times
                              SET escalated_at = '$nowStr'
                              WHERE transaction_id = $txId AND stage = '$stage'
                              AND escalated_at IS NULL");
            }
        }
    }

    // ─── فحص SLA الكلي ──────────────────────────────────────────
    $slaTotal   = (float)$policy['total_hours'] * 60;
    $slaPct     = $slaTotal > 0 ? round(($totalElapsed / $slaTotal) * 100, 1) : 0;
    $slaWarnMin = $slaTotal * ($policy['warning_pct'] / 100);

    if ($totalElapsed >= $slaWarnMin && $slaPct < 100) {
        $breach = _recordBreach($conn, $txId, 'sla_total', 'sla_warning',
                                null, $totalElapsed, (int)$slaTotal, $slaPct);
        if ($breach) $breaches[] = $breach;
    }

    if ($totalElapsed >= $slaTotal && $slaTotal > 0) {
        $breach = _recordBreach($conn, $txId, 'sla_total', 'sla_breach',
                                null, $totalElapsed, (int)$slaTotal, $slaPct);
        if ($breach) $breaches[] = $breach;
    }

    return $breaches;
}

/**
 * يُسجّل خرقاً واحداً إذا لم يكن مسجّلاً من قبل
 * يمنع التكرار بفحص سجل موجود خلال آخر ساعة
 */
function _recordBreach($conn, $txId, $stage, $type, $empId, $elapsed, $allowed, $pct, $supervisorId = null) {
    $empIdVal   = $empId ? (int)$empId : 'NULL';
    $escIdVal   = $supervisorId ? (int)$supervisorId : 'NULL';
    $stageEsc   = $conn->real_escape_string($stage);
    $typeEsc    = $conn->real_escape_string($type);

    // تحقق: هل يوجد نفس الخرق خلال آخر ساعة؟
    $existing = $conn->query("SELECT id FROM sla_breaches
                              WHERE transaction_id = $txId
                                AND stage = '$stageEsc'
                                AND breach_type = '$typeEsc'
                                AND resolved_at IS NULL
                                AND created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
                              LIMIT 1");
    if ($existing && $existing->num_rows > 0) return null;

    $conn->query("INSERT INTO sla_breaches
                  (scope, transaction_id, stage, breach_type, employee_id,
                   elapsed_minutes, allowed_minutes, breach_pct, escalated_to, notified_at)
                  VALUES
                  ('transaction', $txId, '$stageEsc', '$typeEsc', $empIdVal,
                   $elapsed, $allowed, $pct, $escIdVal, NOW())");

    $breachId = $conn->insert_id;

    // ─── إطلاق الإشعارات (داخلي + بريد + Exchange) ────────
    // جلب رقم المعاملة
    $txNum = '';
    $txRes = $conn->query("SELECT transaction_number FROM transactions WHERE id = $txId LIMIT 1");
    if ($txRes && $txRes->num_rows > 0) $txNum = $txRes->fetch_assoc()['transaction_number'];

    sendSlaNotification(
        $type, 'transaction', $txId, $txNum,
        $empId, $supervisorId,
        [
            'stage'       => $stage,
            'stage_label' => STAGE_LABELS[$stage] ?? $stage,
            'elapsed'     => $elapsed,
            'allowed'     => $allowed,
            'pct'         => $pct,
            'ref_number'  => $txNum,
            'scope'       => 'transaction',
        ]
    );

    return [
        'id'             => $breachId,
        'transaction_id' => $txId,
        'stage'          => $stage,
        'breach_type'    => $type,
        'employee_id'    => $empId,
        'elapsed'        => $elapsed,
        'allowed'        => $allowed,
        'pct'            => $pct,
        'escalated_to'   => $supervisorId,
    ];
}

/**
 * جلب المشرف المباشر للموظف
 */
function _getSupervisor($conn, $empId) {
    // ─── 1. الموظف محدد ولديه مشرف → استخدمه
    if ($empId) {
        $r = $conn->query("SELECT supervisor_id FROM employees WHERE id = " . (int)$empId . " AND is_active=1 LIMIT 1");
        if ($r && $r->num_rows > 0) {
            $row = $r->fetch_assoc();
            if (!empty($row['supervisor_id'])) {
                return (int)$row['supervisor_id'];
            }
        }
    }

    // ─── 2. لا يوجد مشرف محدد → أول admin في النظام (fallback مؤقت)
    $a = $conn->query("SELECT id FROM employees WHERE role = 'admin' AND is_active = 1 ORDER BY id LIMIT 1");
    if ($a && $a->num_rows > 0) {
        return (int)$a->fetch_assoc()['id'];
    }

    return null; // لا يوجد admin في النظام
}

// ═══════════════════════════════════════════════════════════════
//  فحص دوري لكل المعاملات المفتوحة
// ═══════════════════════════════════════════════════════════════

function runSlaBatchCheck() {
    $conn = db();

    // معاملات نشطة (لم تكتمل الفوترة)
    $res = $conn->query("
        SELECT DISTINCT t.id
        FROM transactions t
        LEFT JOIN invoice_data i ON t.id = i.transaction_id
        WHERE (i.status IS NULL OR i.status NOT IN ('تم الإصدار','ملغاة'))
        ORDER BY t.id DESC
        LIMIT 200
    ");

    $total = 0;
    $newBreaches = 0;

    if ($res) {
        while ($row = $res->fetch_assoc()) {
            $found = checkTransactionSla((int)$row['id']);
            $total++;
            $newBreaches += count($found);
        }
    }

    return ['checked' => $total, 'new_breaches' => $newBreaches];
}

// ═══════════════════════════════════════════════════════════════
//  سجل التصعيدات البريدية
// ═══════════════════════════════════════════════════════════════

/**
 * جلب سجل التصعيدات المُرسَلة (من sla_breaches حيث notified_at IS NOT NULL)
 */
function getSlaEmailEscalations($params = []) {
    $conn  = db();
    $where = ["sb.notified_at IS NOT NULL"];

    // فلتر النوع
    if (!empty($params['type'])) {
        $t = $conn->real_escape_string($params['type']);
        $where[] = "sb.breach_type = '$t'";
    }

    // فلتر التاريخ
    if (!empty($params['date_from'])) {
        $df = $conn->real_escape_string($params['date_from']);
        $where[] = "DATE(sb.notified_at) >= '$df'";
    }
    if (!empty($params['date_to'])) {
        $dt = $conn->real_escape_string($params['date_to']);
        $where[] = "DATE(sb.notified_at) <= '$dt'";
    }

    $limit  = max(1, min(500, (int)($params['limit'] ?? 100)));
    $wSql   = implode(' AND ', $where);

    $res = $conn->query("
        SELECT
            sb.id,
            sb.breach_type       AS escalation_type,
            sb.stage,
            CASE sb.stage
                WHEN 'receiving'  THEN 'الاستلام'
                WHEN 'budget'     THEN 'الموازنة'
                WHEN 'payment'    THEN 'الدفع'
                WHEN 'invoice'    THEN 'الفوترة'
                WHEN 'sla_total'  THEN 'SLA الكلي'
                ELSE sb.stage
            END                  AS stage_label,
            sb.elapsed_minutes,
            sb.allowed_minutes,
            sb.breach_pct,
            sb.notified_at       AS sent_at,
            sb.resolved_at,
            1                    AS sent_successfully,
            t.transaction_number,
            t.id                 AS transaction_id,
            emp.name             AS employee_name,
            emp.email            AS recipient_email,
            sup.name             AS recipient_name,
            sup.email            AS supervisor_email,
            CONCAT(
                CASE sb.breach_type
                    WHEN 'ola_breach'  THEN 'تجاوز OLA — '
                    WHEN 'sla_breach'  THEN 'تجاوز SLA — '
                    WHEN 'ola_warning' THEN 'تحذير OLA — '
                    WHEN 'sla_warning' THEN 'تحذير SLA — '
                    ELSE sb.breach_type
                END,
                COALESCE(t.transaction_number, ''),
                ' (',
                CAST(sb.breach_pct AS CHAR),
                '%)'
            )                    AS email_subject,
            NULL                 AS notes
        FROM sla_breaches sb
        LEFT JOIN transactions t   ON sb.transaction_id = t.id
        LEFT JOIN employees    emp ON sb.employee_id    = emp.id
        LEFT JOIN employees    sup ON sb.escalated_to   = sup.id
        WHERE $wSql
        ORDER BY sb.notified_at DESC
        LIMIT $limit
    ");

    $rows = [];
    if ($res) while ($row = $res->fetch_assoc()) $rows[] = $row;
    return $rows;
}

// ═══════════════════════════════════════════════════════════════
//  قراءة بيانات SLA لعرضها في الواجهة
// ═══════════════════════════════════════════════════════════════

/**
 * حالة SLA لمعاملة واحدة (للعرض في تفاصيل المعاملة)
 */
function getTransactionSlaStatus($transactionId) {
    $conn = db();
    $txId = (int)$transactionId;

    $tx = $conn->query("SELECT t.*, tt.id AS type_id
                        FROM transactions t
                        LEFT JOIN transaction_types tt ON t.type_id = tt.id
                        WHERE t.id = $txId LIMIT 1");
    if (!$tx || $tx->num_rows === 0) return null;

    $txRow   = $tx->fetch_assoc();
    $policy  = getSlaPolicy($txRow['type_id']);
    if (!$policy) return null;

    $olaRules     = getOlaRules($policy['id']);
    $stages       = [];
    $totalElapsed = 0;
    $now          = new DateTime();

    foreach (['receiving','budget','payment','invoice'] as $stage) {
        $rule = $olaRules[$stage] ?? null;
        if (!$rule) continue;

        $allowedMin = (float)$rule['allowed_hours'] * 60;

        $stRes = $conn->query("SELECT * FROM stage_times
                               WHERE transaction_id = $txId AND stage = '$stage'
                               ORDER BY id DESC LIMIT 1");

        $olaMin         = 0;
        $waitMin        = 0;
        $postEscMin     = null;
        $status         = 'pending';
        $pct            = 0;
        $empName        = '—';
        $isEscalated    = false;

        if ($stRes && $stRes->num_rows > 0) {
            $st = $stRes->fetch_assoc();

            $startedAt   = !empty($st['started_at'])   ? new DateTime($st['started_at'])   : null;
            $receivedAt  = !empty($st['received_at'])  ? new DateTime($st['received_at'])  : null;
            $completedAt = !empty($st['completed_at']) ? new DateTime($st['completed_at']) : null;
            $escalatedAt = !empty($st['escalated_at']) ? new DateTime($st['escalated_at']) : null;

            $isEscalated = $escalatedAt !== null;
            $isCompleted = $completedAt !== null;

            // وقت الانتظار = started_at → received_at
            if ($startedAt && $receivedAt) {
                $waitMin = (int)round(($receivedAt->getTimestamp() - $startedAt->getTimestamp()) / 60);
                $waitMin = max(0, $waitMin);
            }

            // وقت OLA = received_at → (escalated_at أو completed_at أو now)
            if ($receivedAt) {
                if ($escalatedAt) {
                    $olaEnd = $escalatedAt;
                } elseif ($completedAt) {
                    $olaEnd = $completedAt;
                } else {
                    $olaEnd = $now;
                }
                $olaMin = (int)round(($olaEnd->getTimestamp() - $receivedAt->getTimestamp()) / 60);
                $olaMin = max(0, $olaMin);
            } elseif ($startedAt && $stage === 'receiving' && $completedAt) {
                // receiving لحظية: OLA = started_at → completed_at
                $olaMin = (int)round(($completedAt->getTimestamp() - $startedAt->getTimestamp()) / 60);
                $olaMin = max(0, $olaMin);
            }

            // مدة ما بعد التصعيد
            if ($escalatedAt && $completedAt) {
                $postEscMin = (int)round(($completedAt->getTimestamp() - $escalatedAt->getTimestamp()) / 60);
                $postEscMin = max(0, $postEscMin);
            } elseif ($escalatedAt && !$completedAt) {
                $postEscMin = (int)round(($now->getTimestamp() - $escalatedAt->getTimestamp()) / 60);
                $postEscMin = max(0, $postEscMin);
            }

            // اسم الموظف
            if ($st['employee_id']) {
                $eRes = $conn->query("SELECT name FROM employees WHERE id = " . (int)$st['employee_id']);
                if ($eRes && $eRes->num_rows) $empName = $eRes->fetch_assoc()['name'];
            }

            $pct = $allowedMin > 0 ? round(($olaMin / $allowedMin) * 100, 1) : 0;

            $totalElapsed += $olaMin;

            if ($isCompleted) {
                $status = $pct > 100 ? 'breached' : 'done';
            } elseif ($isEscalated) {
                $status = 'escalated';
            } elseif (!$receivedAt) {
                $status = 'waiting'; // في الانتظار — لم يُستلم بعد
            } elseif ($pct >= 100) {
                $status = 'breached';
            } elseif ($pct >= $rule['warn_at_pct']) {
                $status = 'warning';
            } else {
                $status = 'active';
            }
        }

        $stages[] = [
            'stage'            => $stage,
            'label'            => $rule['stage_label'],
            'allowed_min'      => (int)$allowedMin,
            'allowed_hrs'      => (float)$rule['allowed_hours'],
            'waiting_min'      => $waitMin,
            'elapsed_min'      => $olaMin,   // OLA فقط
            'post_escalation_min' => $postEscMin,
            'pct'              => $pct,
            'status'           => $status,
            'employee'         => $empName,
            'employee_id'      => isset($st['employee_id']) ? (int)$st['employee_id'] : null,
            'warn_pct'         => (int)$rule['warn_at_pct'],
            'is_escalated'     => $isEscalated,
        ];
    }

    $slaTotalMin = (float)$policy['total_hours'] * 60;
    $slaPct      = $slaTotalMin > 0 ? round(($totalElapsed / $slaTotalMin) * 100, 1) : 0;
    $slaStatus   = $slaPct >= 100 ? 'breached'
                 : ($slaPct >= $policy['warning_pct'] ? 'warning' : 'ok');

    return [
        'transaction_id' => $txId,
        'policy'        => $policy,
        'stages'        => $stages,
        'total_elapsed' => $totalElapsed,
        'sla_total_min' => (int)$slaTotalMin,
        'sla_pct'       => $slaPct,
        'sla_status'    => $slaStatus,
    ];
}

/**
 * لوحة SLA الكاملة — قائمة المعاملات مع حالة SLA
 */
function getSlaDashboard($filters = []) {
    $conn  = db();
    $where = ["(i.status IS NULL OR i.status NOT IN ('تم الإصدار','ملغاة'))"];
    $now   = new DateTime();

    if (!empty($filters['status'])) {
        // سيُطبَّق لاحقاً بعد الحساب
    }

    $res = $conn->query("
        SELECT t.id, t.transaction_number, t.amount, t.transaction_date,
               tt.name AS type_name,
               t.type_id,
               COALESCE(i.status,'معلق') AS current_status
        FROM transactions t
        LEFT JOIN transaction_types tt ON t.type_id = tt.id
        LEFT JOIN invoice_data i ON t.id = i.transaction_id
        WHERE " . implode(' AND ', $where) . "
        ORDER BY t.transaction_date DESC
        LIMIT 100
    ");

    $rows = [];
    while ($tx = $res->fetch_assoc()) {
        $sla = getTransactionSlaStatus($tx['id']);
        if (!$sla) continue;

        // فلتر الحالة
        if (!empty($filters['sla_status']) && $sla['sla_status'] !== $filters['sla_status']) continue;

        $rows[] = array_merge($tx, [
            'sla_pct'       => $sla['sla_pct'],
            'sla_status'    => $sla['sla_status'],
            'total_elapsed' => $sla['total_elapsed'],
            'sla_total_min' => $sla['sla_total_min'],
            'stages'        => $sla['stages'],
        ]);
    }

    return $rows;
}

/**
 * إحصاءات SLA للوحة الرئيسية
 */
function getSlaStats() {
    $conn = db();

    $breachesToday = $conn->query("
        SELECT COUNT(*) AS cnt FROM sla_breaches
        WHERE DATE(created_at) = CURDATE()
          AND breach_type IN ('ola_breach','sla_breach')
    ")->fetch_assoc()['cnt'] ?? 0;

    $openBreaches = $conn->query("
        SELECT COUNT(*) AS cnt FROM sla_breaches
        WHERE resolved_at IS NULL
          AND breach_type IN ('ola_breach','sla_breach')
    ")->fetch_assoc()['cnt'] ?? 0;

    $warnings = $conn->query("
        SELECT COUNT(*) AS cnt FROM sla_breaches
        WHERE resolved_at IS NULL
          AND breach_type IN ('ola_warning','sla_warning')
    ")->fetch_assoc()['cnt'] ?? 0;

    // خروقات حسب موظف
    $byEmp = $conn->query("
        SELECT e.name, COUNT(*) AS total
        FROM sla_breaches sb
        LEFT JOIN employees e ON sb.employee_id = e.id
        WHERE sb.breach_type = 'ola_breach'
          AND sb.resolved_at IS NULL
          AND sb.employee_id IS NOT NULL
        GROUP BY sb.employee_id
        ORDER BY total DESC
        LIMIT 5
    ");
    $topBreaching = [];
    while ($r = $byEmp->fetch_assoc()) $topBreaching[] = $r;

    return [
        'breaches_today' => (int)$breachesToday,
        'open_breaches'  => (int)$openBreaches,
        'open_warnings'  => (int)$warnings,
        'top_breaching'  => $topBreaching,
    ];
}

/**
 * سجل الخروقات مع تفاصيل المعاملة والموظف
 */
function getSlaBreachLog($limit = 50, $filters = []) {
    $conn  = db();
    $where = ['1=1'];

    if (!empty($filters['type']))
        $where[] = "sb.breach_type = '" . $conn->real_escape_string($filters['type']) . "'";
    if (!empty($filters['employee_id']))
        $where[] = "sb.employee_id = " . (int)$filters['employee_id'];
    if (!empty($filters['resolved'])) {
        $where[] = $filters['resolved'] === 'yes' ? 'sb.resolved_at IS NOT NULL' : 'sb.resolved_at IS NULL';
    }

    $res = $conn->query("
        SELECT sb.*,
               t.transaction_number,
               e.name  AS employee_name,
               e.role  AS employee_role,
               es.name AS escalated_to_name
        FROM sla_breaches sb
        LEFT JOIN transactions t  ON sb.transaction_id = t.id
        LEFT JOIN employees e     ON sb.employee_id = e.id
        LEFT JOIN employees es    ON sb.escalated_to = es.id
        WHERE " . implode(' AND ', $where) . "
        ORDER BY sb.created_at DESC
        LIMIT " . (int)$limit
    );

    $rows = [];
    if ($res) while ($r = $res->fetch_assoc()) $rows[] = $r;
    return $rows;
}

/**
 * تعليم خرق كـ"محلول"
 */
function resolveSlaBreachById($id) {
    $conn = db();
    $id   = (int)$id;
    $conn->query("UPDATE sla_breaches SET resolved_at = NOW() WHERE id = $id");
    return ['success' => true];
}


// ═══════════════════════════════════════════════════════════════
//  SLA للمراسلات
// ═══════════════════════════════════════════════════════════════

/**
 * فحص SLA لمراسلة واحدة
 */
function checkCorrespondenceSla($correspondenceId) {
    $conn   = db();
    $corrId = (int)$correspondenceId;
    $now    = new DateTime();

    // جلب بيانات المراسلة
    $corrRes = $conn->query("SELECT c.*, d.name AS dept_name
                             FROM correspondence c
                             LEFT JOIN departments d ON c.from_department_id = d.id
                             WHERE c.id = $corrId AND c.is_draft = 0 LIMIT 1");
    if (!$corrRes || $corrRes->num_rows === 0) return [];

    $corr   = $corrRes->fetch_assoc();

    // جلب سياسة المراسلات (scope='correspondence' أو 'all')
    $polRes = $conn->query("SELECT * FROM sla_policies
                            WHERE scope IN ('correspondence','all')
                            AND is_active=1 ORDER BY scope DESC LIMIT 1");
    if (!$polRes || $polRes->num_rows === 0) return [];

    $policy   = $polRes->fetch_assoc();
    $olaRules = getOlaRules($policy['id']);
    $breaches = [];
    $totalElapsed = 0;

    // المراحل من correspondence_stages
    $stgRes = $conn->query("SELECT cs.*, e.name AS emp_name
                             FROM correspondence_stages cs
                             LEFT JOIN employees e ON cs.employee_id = e.id
                             WHERE cs.correspondence_id = $corrId
                             ORDER BY cs.stage_order ASC");
    if (!$stgRes) return [];

    $stageMap = ['creation'=>'creation','مراجعة'=>'receiving','اعتماد'=>'budget','إرسال'=>'payment'];

    while ($st = $stgRes->fetch_assoc()) {
        // تحويل اسم المرحلة لـ OLA key
        $olaKey = $stageMap[$st['stage']] ?? null;
        if (!$olaKey || !isset($olaRules[$olaKey])) continue;

        $rule = $olaRules[$olaKey];
        if (empty($st['started_at'])) continue;

        $allowedMin = (float)$rule['allowed_hours'] * 60;
        $start      = new DateTime($st['started_at']);
        $end        = !empty($st['completed_at']) ? new DateTime($st['completed_at']) : $now;
        $elapsedMin = (int)round(($end->getTimestamp() - $start->getTimestamp()) / 60);
        $pct        = $allowedMin > 0 ? round(($elapsedMin / $allowedMin) * 100, 1) : 0;
        $empId      = (int)($st['employee_id'] ?? 0);

        $totalElapsed += $elapsedMin;

        // OLA warning
        $warnMin = $allowedMin * ($rule['warn_at_pct'] / 100);
        if ($elapsedMin >= $warnMin && $pct < 100) {
            $breach = _recordCorrespondenceBreach($conn, $corrId, $st['stage'], 'ola_warning',
                                                   $empId, $elapsedMin, (int)$allowedMin, $pct,
                                                   null, $corr['correspondence_number']);
            if ($breach) $breaches[] = $breach;
        }

        // OLA breach
        if ($elapsedMin >= $allowedMin) {
            $supervisorId = _getSupervisor($conn, $empId);
            $breach = _recordCorrespondenceBreach($conn, $corrId, $st['stage'], 'ola_breach',
                                                   $empId, $elapsedMin, (int)$allowedMin, $pct,
                                                   $supervisorId, $corr['correspondence_number']);
            if ($breach) $breaches[] = $breach;
        }
    }

    // SLA الكلي للمراسلة
    $slaTotal   = (float)$policy['total_hours'] * 60;
    $slaPct     = $slaTotal > 0 ? round(($totalElapsed / $slaTotal) * 100, 1) : 0;
    $slaWarnMin = $slaTotal * ($policy['warning_pct'] / 100);

    if ($totalElapsed >= $slaWarnMin && $slaPct < 100) {
        _recordCorrespondenceBreach($conn, $corrId, 'sla_total', 'sla_warning',
                                     null, $totalElapsed, (int)$slaTotal, $slaPct,
                                     null, $corr['correspondence_number']);
    }
    if ($totalElapsed >= $slaTotal && $slaTotal > 0) {
        _recordCorrespondenceBreach($conn, $corrId, 'sla_total', 'sla_breach',
                                     null, $totalElapsed, (int)$slaTotal, $slaPct,
                                     null, $corr['correspondence_number']);
    }

    return $breaches;
}

/**
 * تسجيل خرق للمراسلة مع إطلاق الإشعارات
 */
function _recordCorrespondenceBreach($conn, $corrId, $stage, $type, $empId, $elapsed, $allowed, $pct, $supervisorId = null, $corrNumber = '') {
    $empIdVal   = $empId ? (int)$empId : 'NULL';
    $escIdVal   = $supervisorId ? (int)$supervisorId : 'NULL';
    $stageEsc   = $conn->real_escape_string($stage);
    $typeEsc    = $conn->real_escape_string($type);
    $corrNumber = $conn->real_escape_string($corrNumber);

    $existing = $conn->query("SELECT id FROM sla_breaches
                              WHERE correspondence_id = $corrId AND scope='correspondence'
                                AND stage = '$stageEsc' AND breach_type = '$typeEsc'
                                AND resolved_at IS NULL
                                AND created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
                              LIMIT 1");
    if ($existing && $existing->num_rows > 0) return null;

    $conn->query("INSERT INTO sla_breaches
                  (scope, correspondence_id, stage, breach_type, employee_id,
                   elapsed_minutes, allowed_minutes, breach_pct, escalated_to, notified_at)
                  VALUES
                  ('correspondence', $corrId, '$stageEsc', '$typeEsc', $empIdVal,
                   $elapsed, $allowed, $pct, $escIdVal, NOW())");

    $breachId = $conn->insert_id;

    // إطلاق الإشعارات
    $stageLabels = ['creation'=>'الإنشاء','مراجعة'=>'المراجعة','اعتماد'=>'الاعتماد',
                    'إرسال'=>'الإرسال','sla_total'=>'SLA الكلي'];

    sendSlaNotification(
        $type, 'correspondence', $corrId, $corrNumber,
        $empId, $supervisorId,
        [
            'stage'       => $stage,
            'stage_label' => $stageLabels[$stage] ?? $stage,
            'elapsed'     => $elapsed,
            'allowed'     => $allowed,
            'pct'         => $pct,
            'ref_number'  => $corrNumber,
            'scope'       => 'correspondence',
        ]
    );

    return ['id' => $breachId, 'correspondence_id' => $corrId, 'breach_type' => $type];
}

/**
 * الفحص الدوري يشمل الآن المراسلات
 */
function runSlaBatchCheckFull() {
    $conn = db();

    // معاملات نشطة
    $txRes = $conn->query("
        SELECT DISTINCT t.id FROM transactions t
        LEFT JOIN invoice_data i ON t.id = i.transaction_id
        WHERE (i.status IS NULL OR i.status NOT IN ('تم الإصدار','ملغاة'))
        ORDER BY t.id DESC LIMIT 200
    ");
    $txTotal = 0; $txBreaches = 0;
    if ($txRes) {
        while ($row = $txRes->fetch_assoc()) {
            $found = checkTransactionSla((int)$row['id']);
            $txTotal++;
            $txBreaches += count($found);
        }
    }

    // مراسلات نشطة
    $corrRes = $conn->query("
        SELECT id FROM correspondence
        WHERE is_draft=0 AND current_stage NOT IN ('مكتمل','مرفوض','ملغاة')
        ORDER BY id DESC LIMIT 100
    ");
    $corrTotal = 0; $corrBreaches = 0;
    if ($corrRes) {
        while ($row = $corrRes->fetch_assoc()) {
            $found = checkCorrespondenceSla((int)$row['id']);
            $corrTotal++;
            $corrBreaches += count($found);
        }
    }

    return [
        'transactions'        => ['checked' => $txTotal,   'new_breaches' => $txBreaches],
        'correspondence'      => ['checked' => $corrTotal, 'new_breaches' => $corrBreaches],
        'total_new_breaches'  => $txBreaches + $corrBreaches,
    ];
}

// ═══════════════════════════════════════════════════════════════
//  تصعيد يدوي — يُستدعى مرة واحدة عند الضغط على زر التصعيد
// ═══════════════════════════════════════════════════════════════

function manualEscalateStage($transactionId, $stage, $requesterId) {
    $conn  = db();
    $txId  = (int)$transactionId;
    $stg   = $conn->real_escape_string($stage);
    $now   = date('Y-m-d H:i:s');

    // ── 1. جلب بيانات stage_times ────────────────────────────
    $st = $conn->query("SELECT * FROM stage_times
                        WHERE transaction_id=$txId AND stage='$stg'
                        LIMIT 1");
    if (!$st || $st->num_rows === 0)
        return ['success' => false, 'error' => 'المرحلة غير موجودة'];

    $row = $st->fetch_assoc();

    // ── 2. مُصعَّد مسبقاً؟ منع التكرار ──────────────────────
    if (!empty($row['escalated_at']))
        return ['success' => false, 'error' => 'تم التصعيد مسبقاً'];

    // ── 3. تسجيل escalated_at ────────────────────────────────
    $conn->query("UPDATE stage_times SET escalated_at='$now'
                  WHERE transaction_id=$txId AND stage='$stg'
                  AND escalated_at IS NULL");

    $empId       = (int)($row['employee_id'] ?? 0);
    $supervisorId = _getSupervisor($conn, $empId);

    // جلب بيانات المعاملة للإشعار
    $txRes = $conn->query("SELECT transaction_number FROM transactions WHERE id=$txId LIMIT 1");
    $txNum = $txRes ? ($txRes->fetch_assoc()['transaction_number'] ?? '') : '';

    $olaRule    = null;
    $policy     = null;
    $txTypeRes  = $conn->query("SELECT type_id FROM transactions WHERE id=$txId LIMIT 1");
    if ($txTypeRes) {
        $typeId  = (int)($txTypeRes->fetch_assoc()['type_id'] ?? 0);
        $policy  = getSlaPolicy($typeId);
        if ($policy) {
            $rules  = getOlaRules($policy['id']);
            $olaRule = $rules[$stage] ?? null;
        }
    }

    $allowedMin = $olaRule ? (float)$olaRule['allowed_hours'] * 60 : 0;
    $receivedAt = $row['received_at'] ?? $row['started_at'] ?? $now;
    $elapsedMin = $receivedAt
        ? (int)round((strtotime($now) - strtotime($receivedAt)) / 60)
        : 0;
    $pct = $allowedMin > 0 ? round($elapsedMin / $allowedMin * 100, 1) : 0;

    $stageLabels = [
        'receiving' => 'الاستلام',
        'budget'    => 'الموازنة',
        'payment'   => 'الدفع',
        'invoice'   => 'الفوترة',
    ];
    $stageLabel = $stageLabels[$stage] ?? $stage;

    // ── 4. تسجيل في sla_breaches ─────────────────────────────
    $escIdVal = $supervisorId ? (int)$supervisorId : 'NULL';
    $empIdVal = $empId ?: 'NULL';

    // تحقق: هل يوجد خرق مسجّل بالفعل لهذه المرحلة؟
    $existing = $conn->query("SELECT id FROM sla_breaches
        WHERE transaction_id=$txId AND stage='$stg'
          AND breach_type='ola_breach' AND resolved_at IS NULL
        LIMIT 1");

    if (!$existing || $existing->num_rows === 0) {
        $conn->query("INSERT INTO sla_breaches
            (scope, transaction_id, stage, breach_type, employee_id,
             elapsed_minutes, allowed_minutes, breach_pct, escalated_to, notified_at)
            VALUES
            ('transaction', $txId, '$stg', 'ola_breach', $empIdVal,
             $elapsedMin, " . (int)$allowedMin . ", $pct, $escIdVal, '$now')");
    } else {
        // حدّث المسجّل ليضم المشرف والتوقيت
        $conn->query("UPDATE sla_breaches SET
            escalated_to=$escIdVal, notified_at='$now'
            WHERE transaction_id=$txId AND stage='$stg'
              AND breach_type='ola_breach' AND resolved_at IS NULL");
    }

    // ── 5. إشعار داخلي للمشرف (مرة واحدة) ──────────────────
    if ($supervisorId) {
        $msg = $conn->real_escape_string("تصعيد OLA: معاملة $txNum — مرحلة $stageLabel تجاوزت {$pct}%");
        // تحقق من عدم وجود إشعار سابق لنفس المعاملة والمرحلة
        $notifExists = $conn->query("SELECT id FROM system_notifications
            WHERE user_id=$supervisorId
              AND transaction_id=$txId
              AND message LIKE '%$stg%'
              AND message LIKE '%تصعيد OLA%'
              AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
            LIMIT 1");

        if (!$notifExists || $notifExists->num_rows === 0) {
            $conn->query("INSERT INTO system_notifications
                (user_id, transaction_id, type, title, message, is_read, created_at)
                VALUES
                ($supervisorId, $txId, 'escalation',
                 'تصعيد OLA',
                 '$msg', 0, '$now')");
        }
    }

    // ── 6. إرسال بريد إلكتروني للمشرف ──────────────────────
    if ($supervisorId) {
        sendSlaNotification(
            'ola_breach', 'transaction', $txId, $txNum,
            $empId, $supervisorId,
            [
                'stage'       => $stage,
                'stage_label' => $stageLabel,
                'elapsed'     => $elapsedMin,
                'allowed'     => (int)$allowedMin,
                'pct'         => $pct,
                'ref_number'  => $txNum,
                'scope'       => 'transaction',
                'manual'      => true,
            ]
        );
    }

    return [
        'success'       => true,
        'escalated_to'  => $supervisorId,
        'transaction_number' => $txNum,
        'stage_label'   => $stageLabel,
        'pct'           => $pct,
    ];
}




/**
 * ═══════════════════════════════════════════════════════════════
 *  SLA/OLA — النظام المحسّن للدقة الاحترافية في احتساب الوقت
 * ═══════════════════════════════════════════════════════════════
 *
 *  نموذج الوقت الجديد لكل مرحلة:
 *
 *  ┌──────────┬───────────┬────────────┬──────────────┬──────────────┐
 *  │ arrived_at│queue_time │ received_at│  OLA (عمل)  │ completed_at │
 *  │ وصل       │ انتظار    │ بدأ العمل  │ قد يُوقف    │  سلّم        │
 *  └──────────┴───────────┴────────────┴──────────────┴──────────────┘
 *                                         ↕ pause_log
 *
 *  بين كل مرحلتين:
 *  ┌──────────────┬──────────────────────────┬──────────────┐
 *  │ completed_at │     handoff_gap           │  arrived_at  │
 *  │ المرحلة (ن)  │ (وقت خارج الموظفين)      │ المرحلة (ن+1)│
 *  └──────────────┴──────────────────────────┴──────────────┘
 */

// ════════════════════════════════════════════════════════════════
//  تسجيل الأحداث على المرحلة
// ════════════════════════════════════════════════════════════════

/**
 * الحالات لكل مرحلة:
 *
 * receiving: في الانتظار → مستلم (arrived=received=completed لحظياً)
 * budget:    في الانتظار → قيد المراجعة (received) → معتمد|مرفوض (completed)
 * payment:   في الانتظار → قيد المراجعة (received) → تم الدفع|مرفوض (completed)
 * invoice:   في الانتظار → قيد الإصدار (received)  → صدرت الفاتورة|مرفوض (completed)
 */
function recordStageTiming($transactionId, $stage, $employeeId, $newStatus) {
    $conn          = db();
    $txId          = (int)$transactionId;
    $stageSafe     = $conn->real_escape_string($stage);
    $empSql        = $employeeId ? (int)$employeeId : 'NULL';
    $statusSafe    = $conn->real_escape_string($newStatus);
    $now           = date('Y-m-d H:i:s');

    // ── تعريف نقاط الوقت لكل مرحلة ──────────────────────────────
    $arrivedStatuses  = []; // كل مرحلة تصل مرة واحدة (عبر startNextStage)

    $receivedStatuses = [
        'receiving' => ['مستلم'],
        'budget'    => ['قيد المراجعة'],
        'payment'   => ['قيد المراجعة'],
        'invoice'   => ['قيد الإصدار'],
    ];

    $completedStatuses = [
        'creation'  => ['تم الإنشاء'],
        'receiving' => ['مستلم'],
        'budget'    => ['معتمد', 'مرفوض'],
        'payment'   => ['تم الدفع', 'مرفوض'],
        'invoice'   => ['صدرت الفاتورة', 'مرفوض', 'مكتمل'],
    ];

    $returnedStatuses = ['مرفوض']; // حالات الإعادة للمرحلة السابقة

    $isReceived  = in_array($newStatus, $receivedStatuses[$stage]  ?? []);
    $isCompleted = in_array($newStatus, $completedStatuses[$stage] ?? []);
    $isReturned  = in_array($newStatus, $returnedStatuses);

    // ── جلب السجل الحالي ─────────────────────────────────────────
    $res = $conn->query("SELECT * FROM stage_times
                         WHERE transaction_id=$txId AND stage='$stageSafe' LIMIT 1");
    $row = ($res && $res->num_rows > 0) ? $res->fetch_assoc() : null;

    if (!$row) {
        // إنشاء سجل (حالة استثنائية)
        $conn->query("INSERT INTO stage_times
                      (transaction_id, stage, employee_id, arrived_at, started_at, status)
                      VALUES ($txId, '$stageSafe', $empSql, '$now', '$now', '$statusSafe')");
        $row = ['arrived_at'=>$now,'received_at'=>null,'escalated_at'=>null,'completed_at'=>null,'pause_minutes'=>0,'return_count'=>0];
    }

    $arrivedAt   = $row['arrived_at']   ?? $row['started_at'] ?? $now;
    $receivedAt  = $row['received_at']  ?? null;
    $escalatedAt = $row['escalated_at'] ?? null;
    $pausedMin   = (int)($row['pause_minutes'] ?? 0);
    $returnCount = (int)($row['return_count']  ?? 0);

    $diffMin = function($from, $to) {
        if (!$from || !$to) return null;
        $d = strtotime($to) - strtotime($from);
        return $d <= 0 ? 0 : (int)round($d / 60);
    };

    $sets = ["employee_id=$empSql", "status='$statusSafe'"];

    // ── 1. بدء العمل الفعلي (received) ───────────────────────────
    if ($isReceived && !$receivedAt) {
        $sets[]    = "received_at='$now'";
        $queueMin  = $diffMin($arrivedAt, $now);
        if ($queueMin !== null) $sets[] = "waiting_minutes=$queueMin";
        $receivedAt = $now;

        // تحديث جدول الانتقالات — قم بتسجيل queue_minutes
        $conn->query("UPDATE stage_transitions
                      SET to_received_at='$now', queue_minutes=$queueMin
                      WHERE transaction_id=$txId AND to_stage='$stageSafe'
                      ORDER BY id DESC LIMIT 1");
    }

    // ── 2. اكتمال المرحلة ─────────────────────────────────────────
    if ($isCompleted && !$row['completed_at']) {
        $sets[] = "completed_at='$now'";

        // إذا receiving لم يُسجَّل received بعد (لحظية) → سجّله الآن
        if (!$receivedAt) {
            $sets[]    = "received_at='$now'";
            $qMin      = $diffMin($arrivedAt, $now);
            if ($qMin !== null) $sets[] = "waiting_minutes=$qMin";
            $receivedAt = $now;
        }

        // OLA = من received_at إلى (escalated_at إن وُجد، وإلا now)
        $olaEnd = $escalatedAt ?? $now;
        $olaMin = $diffMin($receivedAt, $olaEnd);
        if ($olaMin !== null) {
            $sets[]              = "ola_minutes=$olaMin";
            $effectiveOla        = max(0, $olaMin - $pausedMin);
            $sets[]              = "effective_ola_min=$effectiveOla";
            $sets[]              = "duration_minutes=$effectiveOla";
        }

        if ($escalatedAt) {
            $postMin = $diffMin($escalatedAt, $now);
            if ($postMin !== null) $sets[] = "post_escalation_minutes=$postMin";
        }

        // حساب contribution_pct (نسبة هذه المرحلة من SLA الكلي)
        _updateSlaContribution($conn, $txId, $stageSafe, $olaMin ?? 0);
    }

    // ── 3. إعادة/رفض → زيادة return_count ───────────────────────
    if ($isReturned) {
        $sets[] = "return_count=" . ($returnCount + 1);
    }

    // تنفيذ التحديث
    $conn->query("UPDATE stage_times SET " . implode(',', $sets) . "
                  WHERE transaction_id=$txId AND stage='$stageSafe'");

    // ── 4. بدء المرحلة التالية عند الاكتمال (غير مرفوض) ──────────
    if ($isCompleted && !$isReturned) {
        $nextStage = _getNextStage($stage);
        if ($nextStage) {
            _startNextStageEnhanced($txId, $nextStage, $now, $stage, $employeeId);
        }
    }

    $conn->query("UPDATE transactions SET updated_at='$now' WHERE id=$txId");
    return true;
}


/**
 * بدء المرحلة التالية مع تسجيل الانتقال الكامل
 */
function _startNextStageEnhanced($txId, $nextStage, $fromCompletedAt, $fromStage, $fromEmpId) {
    $conn       = db();
    $txId       = (int)$txId;
    $stageSafe  = $conn->real_escape_string($nextStage);
    $fromStageSafe = $conn->real_escape_string($fromStage);
    $fromEmpSql = $fromEmpId ? (int)$fromEmpId : 'NULL';
    $now        = date('Y-m-d H:i:s');
    $handoffAt  = $conn->real_escape_string($fromCompletedAt);

    // ── سجّل arrived_at في stage_times ───────────────────────────
    $exists = $conn->query("SELECT id FROM stage_times
                            WHERE transaction_id=$txId AND stage='$stageSafe' LIMIT 1");

    if ($exists && $exists->num_rows > 0) {
        $conn->query("UPDATE stage_times
                      SET arrived_at     = COALESCE(arrived_at, '$now'),
                          started_at     = COALESCE(started_at, '$now'),
                          handoff_from_stage = '$fromStageSafe',
                          handoff_at     = '$handoffAt',
                          handoff_gap_min = GREATEST(0, TIMESTAMPDIFF(MINUTE, '$handoffAt', COALESCE(arrived_at, '$now')))
                      WHERE transaction_id=$txId AND stage='$stageSafe'");
    } else {
        $gapMin = max(0, (int)round((strtotime($now) - strtotime($fromCompletedAt)) / 60));
        $conn->query("INSERT INTO stage_times
                      (transaction_id, stage, arrived_at, started_at,
                       handoff_from_stage, handoff_at, handoff_gap_min, status)
                      VALUES ($txId, '$stageSafe', '$now', '$now',
                              '$fromStageSafe', '$handoffAt', $gapMin, 'في الانتظار')");
    }

    // ── سجّل في stage_transitions ─────────────────────────────────
    $gapMin = max(0, (int)round((strtotime($now) - strtotime($fromCompletedAt)) / 60));
    $conn->query("INSERT INTO stage_transitions
                  (transaction_id, from_stage, to_stage, from_employee_id,
                   transition_type, from_completed_at, to_arrived_at, gap_minutes)
                  VALUES ($txId, '$fromStageSafe', '$stageSafe', $fromEmpSql,
                          'forward', '$handoffAt', '$now', $gapMin)");
}


/**
 * إيقاف مؤقت لمرحلة (hold)
 */
function pauseStage($transactionId, $stage, $employeeId, $reason = '') {
    $conn      = db();
    $txId      = (int)$transactionId;
    $stageSafe = $conn->real_escape_string($stage);
    $empSql    = $employeeId ? (int)$employeeId : 'NULL';
    $reasonSafe= $conn->real_escape_string($reason);
    $now       = date('Y-m-d H:i:s');

    // تسجيل في pause_log
    $conn->query("INSERT INTO stage_pause_log
                  (transaction_id, stage, employee_id, paused_at, reason)
                  VALUES ($txId, '$stageSafe', $empSql, '$now', '$reasonSafe')");

    $conn->query("UPDATE stage_times
                  SET paused_at='$now', pause_reason='$reasonSafe',
                      status='موقوف مؤقتاً'
                  WHERE transaction_id=$txId AND stage='$stageSafe'");

    // سجّل في transitions
    $conn->query("INSERT INTO stage_transitions
                  (transaction_id, from_stage, to_stage, from_employee_id,
                   transition_type, from_completed_at, notes)
                  VALUES ($txId, '$stageSafe', '$stageSafe', $empSql,
                          'hold', '$now', '$reasonSafe')");

    return true;
}


/**
 * استئناف مرحلة موقوفة
 */
function resumeStage($transactionId, $stage, $employeeId) {
    $conn      = db();
    $txId      = (int)$transactionId;
    $stageSafe = $conn->real_escape_string($stage);
    $empSql    = $employeeId ? (int)$employeeId : 'NULL';
    $now       = date('Y-m-d H:i:s');

    // جلب آخر سجل إيقاف غير مُستأنَف
    $pauseRes = $conn->query("SELECT id, paused_at FROM stage_pause_log
                              WHERE transaction_id=$txId AND stage='$stageSafe'
                                AND resumed_at IS NULL
                              ORDER BY paused_at DESC LIMIT 1");
    if (!$pauseRes || $pauseRes->num_rows === 0) return false;

    $pauseRow  = $pauseRes->fetch_assoc();
    $pausedMin = (int)round((strtotime($now) - strtotime($pauseRow['paused_at'])) / 60);
    $pauseId   = (int)$pauseRow['id'];

    // حدّث pause_log
    $conn->query("UPDATE stage_pause_log
                  SET resumed_at='$now', pause_minutes=$pausedMin
                  WHERE id=$pauseId");

    // أضف pause_minutes إلى المرحلة
    $conn->query("UPDATE stage_times
                  SET pause_minutes = COALESCE(pause_minutes,0) + $pausedMin,
                      resumed_at    = '$now',
                      paused_at     = NULL,
                      status        = 'قيد المراجعة'
                  WHERE transaction_id=$txId AND stage='$stageSafe'");

    return ['paused_minutes' => $pausedMin];
}


// ════════════════════════════════════════════════════════════════
//  قراءة حالة SLA — الواجهة
// ════════════════════════════════════════════════════════════════

/**
 * حالة SLA كاملة لمعاملة — النسخة المحسّنة
 */
function getTransactionSlaStatusV2($transactionId) {
    $conn = db();
    $txId = (int)$transactionId;

    $txRes = $conn->query("SELECT t.*, tt.id AS type_id
                           FROM transactions t
                           LEFT JOIN transaction_types tt ON t.type_id = tt.id
                           WHERE t.id=$txId LIMIT 1");
    if (!$txRes || $txRes->num_rows === 0) return null;

    $txRow  = $txRes->fetch_assoc();
    $policy = getSlaPolicy($txRow['type_id']);
    if (!$policy) return null;

    $olaRules     = getOlaRules($policy['id']);
    $stages       = [];
    $totalOla     = 0;
    $totalQueue   = 0;
    $totalHandoff = 0;
    $now          = new DateTime();

    foreach (['creation','receiving','budget','payment','invoice'] as $stage) {
        $rule = $olaRules[$stage] ?? null;

        $stRes = $conn->query("SELECT st.*,
            e.name AS employee_name
            FROM stage_times st
            LEFT JOIN employees e ON st.employee_id = e.id
            WHERE st.transaction_id=$txId AND st.stage='$stage' LIMIT 1");

        if (!$stRes || $stRes->num_rows === 0) continue;
        $st = $stRes->fetch_assoc();

        $arrivedAt   = !empty($st['arrived_at'])   ? $st['arrived_at']   : $st['started_at'];
        $receivedAt  = !empty($st['received_at'])  ? $st['received_at']  : null;
        $completedAt = !empty($st['completed_at']) ? $st['completed_at'] : null;
        $escalatedAt = !empty($st['escalated_at']) ? $st['escalated_at'] : null;
        $pausedMin   = (int)($st['pause_minutes'] ?? 0);
        $isEscalated = !empty($escalatedAt);
        $isCompleted = !empty($completedAt);

        // ── وقت الطابور (arrived → received) ────────────────────
        $queueMin = null;
        if ($arrivedAt && $receivedAt) {
            $queueMin = max(0, (int)round(
                (strtotime($receivedAt) - strtotime($arrivedAt)) / 60
            ));
        } elseif ($arrivedAt && !$receivedAt && !$isCompleted) {
            // لا يزال ينتظر الاستلام
            $queueMin = max(0, (int)round(
                ($now->getTimestamp() - strtotime($arrivedAt)) / 60
            ));
        }

        // ── OLA الفعلي (received → completed/escalated/now) ──────
        $olaMin     = 0;
        $olaStatus  = 'pending';
        $pct        = 0;
        $allowedMin = $rule ? (float)$rule['allowed_hours'] * 60 : null;

        if ($receivedAt) {
            $olaEnd = $escalatedAt ? new DateTime($escalatedAt)
                    : ($completedAt ? new DateTime($completedAt) : $now);
            $raw    = max(0, (int)round(
                ($olaEnd->getTimestamp() - strtotime($receivedAt)) / 60
            ));
            $olaMin = max(0, $raw - $pausedMin); // OLA الفعلي بعد خصم الإيقاف

            if ($allowedMin && $allowedMin > 0) {
                $pct = round(($olaMin / $allowedMin) * 100, 1);
            }

            if ($isCompleted) {
                $olaStatus = $pct > 100 ? 'breached_done' : 'done';
            } elseif ($isEscalated) {
                $olaStatus = 'escalated';
            } elseif ($pct >= 100) {
                $olaStatus = 'breached';
            } elseif ($rule && $pct >= $rule['warn_at_pct']) {
                $olaStatus = 'warning';
            } else {
                $olaStatus = 'active';
            }

            $totalOla += $olaMin;
        } elseif ($arrivedAt) {
            $olaStatus = 'queued'; // وصلت لكن لم تُستلم بعد
        }

        if ($queueMin !== null) $totalQueue += $queueMin;
        $handoffGap = (int)($st['handoff_gap_min'] ?? 0);
        $totalHandoff += $handoffGap;

        $postEscMin = null;
        if ($escalatedAt && !$completedAt) {
            $postEscMin = max(0, (int)round(
                ($now->getTimestamp() - strtotime($escalatedAt)) / 60
            ));
        } elseif ($escalatedAt && $completedAt) {
            $postEscMin = max(0, (int)round(
                (strtotime($completedAt) - strtotime($escalatedAt)) / 60
            ));
        }

        $stages[] = [
            'stage'              => $stage,
            'label'              => $rule['stage_label'] ?? _stageLabel($stage),
            'employee'           => $st['employee_name'] ?? '—',
            'employee_id'        => (int)($st['employee_id'] ?? 0),

            // نقاط الوقت الأربع
            'arrived_at'         => $arrivedAt,
            'received_at'        => $receivedAt,
            'completed_at'       => $completedAt,
            'escalated_at'       => $escalatedAt,

            // الأوقات المحسوبة
            'queue_min'          => $queueMin,          // انتظار الطابور
            'ola_min'            => $olaMin,            // وقت العمل الفعلي
            'pause_min'          => $pausedMin,         // وقت الإيقاف
            'post_escalation_min'=> $postEscMin,        // بعد التصعيد
            'handoff_gap_min'    => $handoffGap,        // فجوة الانتقال من السابق

            // معطيات OLA
            'allowed_min'        => $allowedMin,
            'allowed_hrs'        => $rule ? (float)$rule['allowed_hours'] : null,
            'warn_pct'           => $rule['warn_at_pct'] ?? 80,
            'pct'                => $pct,
            'status'             => $olaStatus,

            // إضافات
            'is_escalated'       => $isEscalated,
            'return_count'       => (int)($st['return_count'] ?? 0),
            'sla_contribution'   => $st['sla_contribution_pct'],
        ];
    }

    // ── SLA الكلي ─────────────────────────────────────────────────
    $slaTotalMin = (float)$policy['total_hours'] * 60;
    $slaPct      = $slaTotalMin > 0 ? round(($totalOla / $slaTotalMin) * 100, 1) : 0;
    $slaStatus   = $slaPct >= 100 ? 'breached'
                 : ($slaPct >= $policy['warning_pct'] ? 'warning' : 'ok');

    return [
        'transaction_id'  => $txId,
        'policy'          => $policy,
        'stages'          => $stages,

        // ملخص الأوقات
        'total_ola_min'   => $totalOla,      // مجموع وقت العمل الفعلي
        'total_queue_min' => $totalQueue,    // مجموع وقت الطابور
        'total_handoff_min'=> $totalHandoff, // مجموع فجوات الانتقال
        'total_elapsed'   => $totalOla + $totalQueue + $totalHandoff, // الكلي منذ الإنشاء

        // SLA
        'sla_total_min'   => (int)$slaTotalMin,
        'sla_pct'         => $slaPct,
        'sla_status'      => $slaStatus,
    ];
}


/**
 * تقرير الانتقالات لمعاملة (Timeline كامل)
 */
function getTransactionTimeline($transactionId) {
    $conn = db();
    $txId = (int)$transactionId;

    $rows = [];
    $res  = $conn->query("
        SELECT
            t.id,
            t.transaction_id,
            t.from_stage,
            t.to_stage,
            t.transition_type,
            t.from_completed_at,
            t.to_arrived_at,
            t.to_received_at,
            t.gap_minutes,
            t.queue_minutes,
            t.notes,
            fe.name  AS from_employee,
            te.name  AS to_employee,
            CASE t.from_stage
                WHEN 'creation'  THEN 'الإنشاء'
                WHEN 'receiving' THEN 'الاستلام'
                WHEN 'budget'    THEN 'الموازنة'
                WHEN 'payment'   THEN 'الدفع'
                WHEN 'invoice'   THEN 'الفوترة'
                ELSE t.from_stage
            END AS from_label,
            CASE t.to_stage
                WHEN 'creation'  THEN 'الإنشاء'
                WHEN 'receiving' THEN 'الاستلام'
                WHEN 'budget'    THEN 'الموازنة'
                WHEN 'payment'   THEN 'الدفع'
                WHEN 'invoice'   THEN 'الفوترة'
                ELSE t.to_stage
            END AS to_label
        FROM stage_transitions t
        LEFT JOIN employees fe ON t.from_employee_id = fe.id
        LEFT JOIN employees te ON t.to_employee_id   = te.id
        WHERE t.transaction_id = $txId
        ORDER BY t.id ASC
    ");
    if ($res) while ($r = $res->fetch_assoc()) $rows[] = $r;

    return $rows;
}


/**
 * إحصائيات متقدمة لتقرير الأداء
 */
function getSlaAdvancedStats($filters = []) {
    $conn  = db();
    $where = ["st.completed_at IS NOT NULL"];
    if (!empty($filters['date_from']))
        $where[] = "DATE(st.completed_at) >= '" . $conn->real_escape_string($filters['date_from']) . "'";
    if (!empty($filters['date_to']))
        $where[] = "DATE(st.completed_at) <= '" . $conn->real_escape_string($filters['date_to']) . "'";
    if (!empty($filters['stage']))
        $where[] = "st.stage = '" . $conn->real_escape_string($filters['stage']) . "'";

    $wSql = implode(' AND ', $where);

    // متوسطات لكل مرحلة
    $byStage = [];
    $res = $conn->query("
        SELECT
            st.stage,
            COUNT(*)                                    AS total_count,
            ROUND(AVG(st.waiting_minutes),1)            AS avg_queue_min,
            ROUND(AVG(COALESCE(st.effective_ola_min, st.ola_minutes)),1) AS avg_ola_min,
            ROUND(AVG(st.handoff_gap_min),1)            AS avg_handoff_min,
            ROUND(AVG(st.pause_minutes),1)              AS avg_pause_min,
            MAX(COALESCE(st.effective_ola_min,st.ola_minutes)) AS max_ola_min,
            MIN(COALESCE(st.effective_ola_min,st.ola_minutes)) AS min_ola_min,
            SUM(CASE WHEN st.return_count > 0 THEN 1 ELSE 0 END) AS returned_count,
            SUM(CASE WHEN st.escalated_at IS NOT NULL THEN 1 ELSE 0 END) AS escalated_count,
            ROUND(
                SUM(CASE WHEN st.escalated_at IS NOT NULL THEN 1 ELSE 0 END) * 100.0 / COUNT(*),
                1
            ) AS escalation_rate_pct
        FROM stage_times st
        WHERE $wSql
        GROUP BY st.stage
        ORDER BY FIELD(st.stage,'creation','receiving','budget','payment','invoice')
    ");
    if ($res) while ($r = $res->fetch_assoc()) $byStage[$r['stage']] = $r;

    // أبطأ الموظفين
    $slowest = [];
    $res2 = $conn->query("
        SELECT
            e.name,
            e.id AS employee_id,
            st.stage,
            ROUND(AVG(COALESCE(st.effective_ola_min, st.ola_minutes)),1) AS avg_ola,
            COUNT(*) AS count
        FROM stage_times st
        JOIN employees e ON st.employee_id = e.id
        WHERE $wSql AND st.employee_id IS NOT NULL
        GROUP BY e.id, st.stage
        HAVING avg_ola IS NOT NULL
        ORDER BY avg_ola DESC
        LIMIT 10
    ");
    if ($res2) while ($r = $res2->fetch_assoc()) $slowest[] = $r;

    // المعاملات الأكثر تأخيراً
    $delayed = [];
    $res3 = $conn->query("
        SELECT
            t.id, t.transaction_number,
            SUM(COALESCE(st.effective_ola_min, st.ola_minutes, 0)) AS total_ola,
            SUM(COALESCE(st.waiting_minutes, 0))                    AS total_queue,
            SUM(COALESCE(st.handoff_gap_min, 0))                    AS total_handoff,
            SUM(COALESCE(st.return_count, 0))                       AS total_returns,
            COUNT(CASE WHEN st.escalated_at IS NOT NULL THEN 1 END) AS escalations
        FROM transactions t
        JOIN stage_times st ON t.id = st.transaction_id
        WHERE $wSql
        GROUP BY t.id
        ORDER BY total_ola DESC
        LIMIT 10
    ");
    if ($res3) while ($r = $res3->fetch_assoc()) $delayed[] = $r;

    return [
        'by_stage'       => $byStage,
        'slowest_employees' => $slowest,
        'most_delayed'   => $delayed,
    ];
}


// ════════════════════════════════════════════════════════════════
//  دوال مساعدة
// ════════════════════════════════════════════════════════════════

function _getNextStage($stage) {
    return ['creation'=>'receiving','receiving'=>'budget',
            'budget'=>'payment','payment'=>'invoice'][$stage] ?? null;
}

function _stageLabel($stage) {
    return ['creation'=>'الإنشاء','receiving'=>'الاستلام',
            'budget'=>'الموازنة','payment'=>'الدفع',
            'invoice'=>'الفوترة'][$stage] ?? $stage;
}

function _updateSlaContribution($conn, $txId, $stage, $olaMin) {
    // احسب نسبة مساهمة هذه المرحلة من مجموع OLA الكلي
    $res = $conn->query("SELECT SUM(COALESCE(effective_ola_min,ola_minutes,0)) AS total
                         FROM stage_times WHERE transaction_id=$txId");
    $total = $res ? (float)$res->fetch_assoc()['total'] : 0;
    if ($total > 0) {
        $pct = round(($olaMin / $total) * 100, 1);
        $stageSafe = $conn->real_escape_string($stage);
        $conn->query("UPDATE stage_times SET sla_contribution_pct=$pct
                      WHERE transaction_id=$txId AND stage='$stageSafe'");
    }
}