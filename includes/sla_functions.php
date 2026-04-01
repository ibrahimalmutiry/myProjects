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
    'creation'  => 'الإنشاء',
    'receiving' => 'الاستلام',
    'budget'    => 'الموازنة',
    'dispatch'  => 'التوجيه',
    'payment'   => 'الدفع',
    'invoice'   => 'الفوترة',
];

// ═══════════════════════════════════════════════════════════════
//  جلب السياسات
// ═══════════════════════════════════════════════════════════════

/**
 * جلب سياسة SLA المناسبة لنوع معاملة
 */
/**
 * جلب سياسة SLA المناسبة
 * الأولوية: فرعي → رئيسي → افتراضية
 */
function getSlaPolicy($transactionTypeId = null, $subTypeId = null) {
    $conn = db();
    $tid  = (int)($transactionTypeId ?? 0);
    $sid  = (int)($subTypeId ?? 0);

    // 1. سياسة خاصة بالتصنيف الفرعي
    if ($sid > 0) {
        $r = $conn->query("SELECT * FROM sla_policies WHERE transaction_type_id = $sid AND is_active = 1 LIMIT 1");
        if ($r && $r->num_rows > 0) return $r->fetch_assoc();
    }

    // 2. سياسة خاصة بالتصنيف الرئيسي
    if ($tid > 0) {
        $r = $conn->query("SELECT * FROM sla_policies WHERE transaction_type_id = $tid AND is_active = 1 LIMIT 1");
        if ($r && $r->num_rows > 0) return $r->fetch_assoc();
    }

    // 3. السياسة الافتراضية
    $r = $conn->query("SELECT * FROM sla_policies WHERE transaction_type_id IS NULL AND is_active = 1 ORDER BY id LIMIT 1");
    return ($r && $r->num_rows > 0) ? $r->fetch_assoc() : null;
}

/**
 * جلب كل سياسات SLA مع قواعد OLA التابعة
 */
function getAllSlaPolicies() {
    $conn     = db();
    $policies = [];

    $res = $conn->query("SELECT sp.*,
                              tt.name AS type_name,
                              tt.parent_id AS type_parent_id,
                              tp.name AS parent_type_name
                         FROM sla_policies sp
                         LEFT JOIN transaction_types tt ON sp.transaction_type_id = tt.id
                         LEFT JOIN transaction_types tp ON tt.parent_id = tp.id
                         ORDER BY sp.transaction_type_id IS NULL DESC, sp.id");
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

/**
 * حذف سياسة SLA — لا يُسمح بحذف السياسة الافتراضية (transaction_type_id IS NULL)
 */
function deleteSlaPolicy($id) {
    $conn = db();
    $id   = (int)$id;
    // منع حذف الافتراضية
    $r    = $conn->query("SELECT transaction_type_id FROM sla_policies WHERE id=$id LIMIT 1");
    if (!$r || !($row = $r->fetch_assoc())) return ['success'=>false,'error'=>'السياسة غير موجودة'];
    if ($row['transaction_type_id'] === null) return ['success'=>false,'error'=>'لا يمكن حذف السياسة الافتراضية'];
    // حذف قواعد OLA أولاً
    $conn->query("DELETE FROM ola_rules WHERE sla_policy_id=$id");
    $conn->query("DELETE FROM sla_policies WHERE id=$id");
    return ['success' => true];
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
//  فحص التجاوزات ← النواة الأساسية
// ═══════════════════════════════════════════════════════════════

/**
 * يفحص معاملة واحدة ويُسجّل التجاوزات / التصعيدات
 * يُستدعى عند كل تحديث وعند الفحص الدوري
 */
function checkTransactionSla($transactionId) {
    $conn = db();
    $txId = (int)$transactionId;
    $now  = new DateTime();

    $txRes = $conn->query("SELECT t.*, t.type_id, t.sub_type_id
                           FROM transactions t
                           WHERE t.id = $txId LIMIT 1");
    if (!$txRes || $txRes->num_rows === 0) return [];

    $tx     = $txRes->fetch_assoc();
    $policy = getSlaPolicy($tx['type_id'], $tx['sub_type_id'] ?? null);
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

        // المرحلة المكتملة أو المُصعَّدة → لا نفحص تجاوزات جديدة
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
 * يُسجّل  تجاوزاً واحداً إذا لم يكن مسجّلاً من قبل
 * يمنع التكرار بفحص سجل موجود خلال آخر ساعة
 */
function _recordBreach($conn, $txId, $stage, $type, $empId, $elapsed, $allowed, $pct, $supervisorId = null) {
    $empIdVal   = $empId ? (int)$empId : 'NULL';
    $escIdVal   = $supervisorId ? (int)$supervisorId : 'NULL';
    $stageEsc   = $conn->real_escape_string($stage);
    $typeEsc    = $conn->real_escape_string($type);

    // تحقق: هل يوجد نفس التجاوزخلال آخر ساعة؟
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

    $tx = $conn->query("SELECT t.*, t.type_id, t.sub_type_id FROM transactions t WHERE t.id = $txId LIMIT 1");
    if (!$tx || $tx->num_rows === 0) return null;

    $txRow   = $tx->fetch_assoc();
    $policy  = getSlaPolicy($txRow['type_id'], $txRow['sub_type_id'] ?? null);
    if (!$policy) return null;

    $olaRules     = getOlaRules($policy['id']);
    $stages       = [];
    $totalElapsed = 0;
    $now          = new DateTime();

    foreach (['receiving','budget','dispatch','payment','invoice'] as $stage) {
        $rule = $olaRules[$stage] ?? null;
        if (!$rule) continue;

        $allowedMin = (float)$rule['allowed_hours'] * 60;

        // مرحلة dispatch: إذا OLA معلّق → أضف كحالة paused وتخطَّ
        if ($stage === 'dispatch') {
            $ddCheck = $conn->query("SHOW TABLES LIKE 'dispatch_data'");
            if ($ddCheck && $ddCheck->num_rows > 0) {
                $ddRow = $conn->query("SELECT ola_active, dispatch_type, routed_to, status FROM dispatch_data WHERE transaction_id = $txId LIMIT 1");
                if ($ddRow && $ddRow->num_rows > 0) {
                    $dd = $ddRow->fetch_assoc();
                    if ((int)$dd['ola_active'] === 0) {
                        $stages[] = [
                            'stage'               => 'dispatch',
                            'label'               => $rule['stage_label'] ?? 'التوجيه',
                            'allowed_min'         => (int)$allowedMin,
                            'allowed_hrs'         => (float)$rule['allowed_hours'],
                            'waiting_min'         => 0,
                            'elapsed_min'         => 0,
                            'post_escalation_min' => null,
                            'pct'                 => 0,
                            'status'              => 'paused',
                            'employee'            => '—',
                            'employee_id'         => null,
                            'warn_pct'            => (int)$rule['warn_at_pct'],
                            'is_escalated'        => false,
                            'ola_paused'          => true,
                        ];
                        continue;
                    }
                }
            }
        }

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

$pct = $allowedMin > 0 ? min(9999.99, round($olaMin / $allowedMin * 100, 1)) : 0;

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

    // تجاوزات حسب موظف
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
 * سجل التجاوزات مع تفاصيل المعاملة والموظف
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
 * تعليم تجاوزكـ"محلول"
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
 * تسجيل تجاوزللمراسلة مع إطلاق الإشعارات
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
    $conn = db();
    $txId = (int)$transactionId;
    $stg  = $conn->real_escape_string($stage);
    $now  = date('Y-m-d H:i:s');

    // ── 1. جلب بيانات المرحلة ────────────────────────────────
    $st = $conn->query("SELECT * FROM stage_times
                        WHERE transaction_id=$txId AND stage='$stg'
                        LIMIT 1");
    if (!$st || $st->num_rows === 0)
        return ['success' => false, 'error' => 'المرحلة غير موجودة'];

    $row = $st->fetch_assoc();

    // ── 2. منع التكرار ───────────────────────────────────────
    if (!empty($row['escalated_at']))
        return ['success' => false, 'error' => 'تم التصعيد مسبقاً'];

    // ── 3. جلب بيانات المعاملة ───────────────────────────────
    $txRes = $conn->query("SELECT transaction_number, type_id, sub_type_id
                           FROM transactions WHERE id=$txId LIMIT 1");
    if (!$txRes || $txRes->num_rows === 0)
        return ['success' => false, 'error' => 'المعاملة غير موجودة'];

    $tx    = $txRes->fetch_assoc();
    $txNum = $tx['transaction_number'] ?? '';

    // ── 4. تحديد المشرف ──────────────────────────────────────
    $empId       = (int)($row['employee_id'] ?? 0);
    $supervisorId = _getSupervisor($conn, $empId);

    // جلب اسم المشرف
    $supervisorName = 'غير محدد';
    if ($supervisorId) {
        $supRes = $conn->query("SELECT name FROM employees WHERE id=$supervisorId LIMIT 1");
        if ($supRes && $supRes->num_rows > 0)
            $supervisorName = $supRes->fetch_assoc()['name'] ?? 'غير محدد';
    }

    // ── 5. حساب الوقت والنسبة ────────────────────────────────
    $policy  = getSlaPolicy((int)$tx['type_id'], (int)($tx['sub_type_id'] ?? 0) ?: null);
    $olaRule = null;
    if ($policy) {
        $rules   = getOlaRules($policy['id']);
        $olaRule = $rules[$stage] ?? null;
    }

    $allowedMin = $olaRule ? (float)$olaRule['allowed_hours'] * 60 : 0;
    $receivedAt = $row['received_at'] ?? $row['started_at'] ?? $now;
    $elapsedMin = (int)round((strtotime($now) - strtotime($receivedAt)) / 60);
    $pct        = $allowedMin > 0 ? round($elapsedMin / $allowedMin * 100, 1) : 0;

    $stageLabels = [
        'receiving' => 'الاستلام',
        'budget'    => 'الموازنة',
        'payment'   => 'الدفع',
        'invoice'   => 'الفوترة',
    ];
    $stageLabel = $stageLabels[$stage] ?? $stage;

    // ── 6. تسجيل escalated_at ────────────────────────────────
    $conn->query("UPDATE stage_times SET escalated_at='$now'
                  WHERE transaction_id=$txId AND stage='$stg'
                  AND escalated_at IS NULL");

    // ── 7. تسجيل في sla_breaches ─────────────────────────────
    $escIdVal = $supervisorId ? (int)$supervisorId : 'NULL';
    $empIdVal = $empId ?: 'NULL';

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
        $conn->query("UPDATE sla_breaches SET
            escalated_to=$escIdVal, notified_at='$now'
            WHERE transaction_id=$txId AND stage='$stg'
              AND breach_type='ola_breach' AND resolved_at IS NULL");
    }

    // ── 8. إشعار داخلي للمشرف (قناة أولى) ───────────────────
// ── 8. إشعار داخلي (قناة أولى) ───────────────────────────
$notificationSent = false;
if ($supervisorId) {
    $msg = $conn->real_escape_string(
        "تصعيد OLA: معاملة $txNum — مرحلة $stageLabel تجاوزت {$pct}%"
    );

    // إشعار للمشرف
    $notifExists = $conn->query("SELECT id FROM system_notifications
        WHERE employee_id=$supervisorId AND transaction_id=$txId
          AND category='escalation'
          AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
        LIMIT 1");

    if (!$notifExists || $notifExists->num_rows === 0) {
        $conn->query("INSERT INTO system_notifications
            (type, category, title, message, transaction_id, employee_id, is_read, created_at)
            VALUES ('urgent', 'escalation', 'تصعيد OLA', '$msg', $txId, $supervisorId, 0, '$now')");
        $notificationSent = ($conn->affected_rows > 0);
    } else {
        $notificationSent = true;
    }

    // إشعار للموظف الطالب أيضاً (يرى "تم التصعيد")
    $requesterMsg = $conn->real_escape_string(
        "تم تصعيد معاملة $txNum (مرحلة $stageLabel) إلى $supervisorName"
    );
    $requesterId = (int)$requesterId;
    if ($requesterId > 0 && $requesterId !== $supervisorId) {
        $conn->query("INSERT INTO system_notifications
            (type, category, title, message, transaction_id, employee_id, is_read, created_at)
            VALUES ('info', 'escalation', 'تم التصعيد', '$requesterMsg', $txId, $requesterId, 0, '$now')");
    }
}

    // ── 9. بريد إلكتروني للمشرف (قناة ثانية) — لا يوقف التصعيد ─
    $emailSent  = false;
    $emailError = null;
    if ($supervisorId) {
        try {
            $emailResult = sendSlaNotification(
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
            $emailSent = true;
        } catch (Throwable $e) {
            // فشل البريد لا يلغي التصعيد
            $emailError = $e->getMessage();
            error_log("[SLA Escalate] email failed for tx=$txId stage=$stage: $emailError");
        }
    }

    // ── 10. الرد ─────────────────────────────────────────────
    return [
        'success'            => true,
        'escalated_to_id'    => $supervisorId,
        'escalated_to_name'  => $supervisorName,   // ← للعرض في الواجهة
        'transaction_number' => $txNum,
        'stage_label'        => $stageLabel,
        'pct'                => $pct,
        'notification_sent'  => $notificationSent,
        'email_sent'         => $emailSent,
        'email_error'        => $emailError,        // null إذا نجح
    ];
}