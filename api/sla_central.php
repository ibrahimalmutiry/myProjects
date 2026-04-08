<?php
/**
 * SLA Central API — النظام المركزي الموحد
 *
 * يُغطي ثلاثة أنظمة:
 *   transactions  — المعاملات المالية
 *   purchase      — طلبات الشراء
 *   reservations  — حجوزات الموازنة
 *
 * الجداول المركزية:
 *   sla_central_policies  — سياسات SLA لكل نظام/مرحلة
 *   sla_central_tracking  — تتبع SLA لكل معاملة/طلب/حجز
 *   sla_central_breaches  — سجل التجاوزات
 */

ob_start();
session_start();
session_write_close();

// إظهار أخطاء PHP في الـ JSON response للتشخيص
error_reporting(E_ALL);
ini_set('display_errors', 0);
set_error_handler(function($errno, $errstr, $errfile, $errline) {
    if (ob_get_level()) ob_end_clean();
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['success'=>false,'message'=>$errstr,'file'=>basename($errfile),'line'=>$errline,'errno'=>$errno], JSON_UNESCAPED_UNICODE);
    exit;
});
set_exception_handler(function($e) {
    if (ob_get_level()) ob_end_clean();
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['success'=>false,'message'=>$e->getMessage(),'file'=>basename($e->getFile()),'line'=>$e->getLine()], JSON_UNESCAPED_UNICODE);
    exit;
});

// محاولة إيجاد functions.php في عدة مسارات
$fnPaths = [
    __DIR__ . '/../includes/functions.php',
    __DIR__ . '/../functions.php',
    __DIR__ . '/functions.php',
    dirname(__DIR__) . '/includes/functions.php',
    dirname(__DIR__) . '/functions.php',
];
$fnLoaded = false;
foreach ($fnPaths as $fp) {
    if (file_exists($fp)) {
        require_once $fp;
        $fnLoaded = true;
        break;
    }
}
if (!$fnLoaded) {
    ob_end_clean();
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['success'=>false,'message'=>'functions.php not found. Tried: '.implode(', ',$fnPaths)], JSON_UNESCAPED_UNICODE);
    exit;
}

if (!function_exists('db')) {
    ob_end_clean();
    echo json_encode(['success'=>false,'message'=>'db() function not found after loading functions.php'], JSON_UNESCAPED_UNICODE);
    exit;
}

if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    ob_end_clean();
    echo json_encode(['success'=>false,'message'=>'يجب تسجيل الدخول أولاً'], JSON_UNESCAPED_UNICODE);
    exit;
}

// ── تهيئة الجداول المركزية ────────────────────────────────────
function slaCentralMigrate(): void {
    $conn = db();

    // جدول السياسات — ينشئ الجدول إن لم يكن موجوداً
    $conn->query("CREATE TABLE IF NOT EXISTS sla_central_policies (
        id               INT AUTO_INCREMENT PRIMARY KEY,
        system_type      ENUM('transactions','purchase','reservations') NOT NULL,
        stage_name       VARCHAR(80)  NOT NULL,
        stage_label      VARCHAR(120) NOT NULL DEFAULT '',
        sla_hours        DECIMAL(6,2) NOT NULL DEFAULT 24,
        sla_warning_pct  TINYINT      NOT NULL DEFAULT 70,
        sla_escalate_pct TINYINT      NOT NULL DEFAULT 100,
        ola_wait_hours   DECIMAL(6,2) NOT NULL DEFAULT 2,
        ola_process_hours DECIMAL(6,2) NOT NULL DEFAULT 22,
        ola_warning_pct  TINYINT      NOT NULL DEFAULT 70,
        ola_escalate_pct TINYINT      NOT NULL DEFAULT 100,
        is_active        TINYINT(1)   NOT NULL DEFAULT 1,
        updated_at       DATETIME     DEFAULT NOW() ON UPDATE NOW(),
        UNIQUE KEY uq_system_stage (system_type, stage_name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // ── Migration: إضافة أعمدة جديدة إن كانت غائبة (ترقية من نسخ قديمة) ──
    $alterCols = [
        'sla_hours        DECIMAL(6,2) NOT NULL DEFAULT 24',
        'sla_warning_pct  TINYINT      NOT NULL DEFAULT 70',
        'sla_escalate_pct TINYINT      NOT NULL DEFAULT 100',
        'ola_wait_hours   DECIMAL(6,2) NOT NULL DEFAULT 2',
        'ola_process_hours DECIMAL(6,2) NOT NULL DEFAULT 22',
        'ola_warning_pct  TINYINT      NOT NULL DEFAULT 70',
        'ola_escalate_pct TINYINT      NOT NULL DEFAULT 100',
    ];
    foreach ($alterCols as $col) {
        @$conn->query("ALTER TABLE sla_central_policies ADD COLUMN IF NOT EXISTS $col");
    }

    // (migration من نسخ قديمة محذوف — الجدول الجديد لا يحتوي على allowed_hours)

    // جدول التتبع الموحد — يفصل بين SLA و OLA
    $conn->query("CREATE TABLE IF NOT EXISTS sla_central_tracking (
        id                INT AUTO_INCREMENT PRIMARY KEY,
        system_type       ENUM('transactions','purchase','reservations') NOT NULL,
        entity_id         INT          NOT NULL,
        stage_name        VARCHAR(80)  NOT NULL,
        policy_id         INT          DEFAULT NULL,
        sla_started_at    DATETIME     NOT NULL,
        sla_ended_at      DATETIME     DEFAULT NULL,
        sla_allowed_min   INT          DEFAULT NULL,
        sla_elapsed_min   INT          NOT NULL DEFAULT 0,
        sla_elapsed_pct   DECIMAL(7,1) NOT NULL DEFAULT 0,
        sla_warn_sent     TINYINT(1)   NOT NULL DEFAULT 0,
        sla_esc_sent      TINYINT(1)   NOT NULL DEFAULT 0,
        ola_received_at   DATETIME     DEFAULT NULL,
        ola_wait_min      INT          DEFAULT NULL,
        ola_process_min   INT          DEFAULT NULL,
        ola_wait_elapsed  INT          NOT NULL DEFAULT 0,
        ola_process_elapsed INT        NOT NULL DEFAULT 0,
        ola_wait_pct      DECIMAL(7,1) NOT NULL DEFAULT 0,
        ola_process_pct   DECIMAL(7,1) NOT NULL DEFAULT 0,
        ola_warn_sent     TINYINT(1)   NOT NULL DEFAULT 0,
        ola_esc_sent      TINYINT(1)   NOT NULL DEFAULT 0,
        status            ENUM('active','paused','completed') NOT NULL DEFAULT 'active',
        UNIQUE KEY uq_entity_stage (system_type, entity_id, stage_name),
        INDEX idx_status (status),
        INDEX idx_system (system_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // جدول التجاوزات الموحد
    $conn->query("CREATE TABLE IF NOT EXISTS sla_central_breaches (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        system_type   ENUM('transactions','purchase','reservations') NOT NULL,
        entity_id     INT          NOT NULL,
        stage_name    VARCHAR(80)  NOT NULL,
        breach_type   ENUM('warning','escalation') NOT NULL DEFAULT 'warning',
        breach_scope  ENUM('sla','ola_wait','ola_proc') NOT NULL DEFAULT 'sla',
        elapsed_pct   DECIMAL(7,1) NOT NULL DEFAULT 0,
        notified_at   DATETIME     DEFAULT NOW(),
        INDEX idx_entity (system_type, entity_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    @$conn->query("ALTER TABLE sla_central_breaches ADD COLUMN IF NOT EXISTS breach_scope ENUM('sla','ola_wait','ola_proc') NOT NULL DEFAULT 'sla'");

    // بذر السياسات الافتراضية
    slaCentralSeedDefaults($conn);
}

function slaCentralSeedDefaults($conn): void {
    // sla_hours = الوقت الكلي المسموح
    // ola_wait  = مسموح للانتظار قبل الاستلام
    // ola_proc  = مسموح للمعالجة بعد الاستلام (يجب أن يكون ola_wait + ola_proc = sla_hours تقريباً)
    $defaults = [
        // ── المعاملات المالية ── [sys, stage, label, sla_h, warn%, esc%, ola_wait, ola_proc]
        ['transactions', 'creation',   'الإنشاء',           2,  70, 100, 0.5,  1.5],
        ['transactions', 'receiving',  'الاستلام',          24, 70, 100, 2,    22],
        ['transactions', 'budget',     'مراجعة الموازنة',   24, 70, 100, 1,    23],
        ['transactions', 'payment',    'الدفع',             48, 70, 100, 4,    44],

        // ── طلبات الشراء ──
        ['purchase', 'reception',               'الاستلام والتحقق',           24, 70, 100, 1,   23],
        ['purchase', 'budget_review',           'مراجعة الموازنة',            24, 70, 100, 2,   22],
        ['purchase', 'treasury_review',         'مراجعة مدير الخزينة',        48, 70, 100, 4,   44],
        ['purchase', 'finance_review',          'مراجعة رئيس القطاع المالي',  48, 70, 100, 4,   44],
        ['purchase', 'ceo_approval',            'موافقة CEO — مبدئية',         72, 70, 100, 8,   64],
        ['purchase', 'purchasing',              'المشتريات — إنشاء حجز',       48, 70, 100, 4,   44],
        ['purchase', 'waiting_budget_approval', 'اعتماد حجز الموازنة',        24, 70, 100, 2,   22],
        ['purchase', 'accounts_review',         'الحسابات — مراجعة وتوزيع',  24, 70, 100, 2,   22],
        ['purchase', 'po_issuance',             'إصدار أمر الشراء (PO)',       72, 70, 100, 8,   64],
        ['purchase', 'payment',                 'المالية — الدفع',             48, 70, 100, 4,   44],

        // ── حجوزات الموازنة ──
        ['reservations', 'draft',           'مسودة',               2,  70, 100, 0.5,  1.5],
        ['reservations', 'budget_review',   'مراجعة الموازنة',     24, 70, 100, 2,   22],
        ['reservations', 'sector_approval', 'اعتماد رئيس القطاع',  48, 70, 100, 4,   44],
    ];

    foreach ($defaults as [$sys, $stage, $label, $slaH, $warn, $esc, $olaWait, $olaProc]) {
        $s = $conn->real_escape_string($sys);
        $st = $conn->real_escape_string($stage);
        $l  = $conn->real_escape_string($label);
        // INSERT ... ON DUPLICATE KEY: يُنشئ أو يُحدّث القيم الافتراضية
        // لكن لا يتجاوز تعديلات المستخدم — يحدّث فقط إذا كانت القيم لا تزال 24/70/100
        $conn->query("INSERT INTO sla_central_policies
            (system_type, stage_name, stage_label, sla_hours, sla_warning_pct, sla_escalate_pct,
             ola_wait_hours, ola_process_hours, ola_warning_pct, ola_escalate_pct)
            VALUES ('$s','$st','$l',$slaH,$warn,$esc,$olaWait,$olaProc,$warn,$esc)
            ON DUPLICATE KEY UPDATE
                stage_label      = VALUES(stage_label),
                sla_hours        = IF(sla_hours IN (24,0),        VALUES(sla_hours),        sla_hours),
                sla_warning_pct  = IF(sla_warning_pct  IN (70,0), VALUES(sla_warning_pct),  sla_warning_pct),
                sla_escalate_pct = IF(sla_escalate_pct IN (100,0),VALUES(sla_escalate_pct), sla_escalate_pct),
                ola_wait_hours   = IF(ola_wait_hours   IN (2,0),  VALUES(ola_wait_hours),   ola_wait_hours),
                ola_process_hours= IF(ola_process_hours IN (22,0),VALUES(ola_process_hours),ola_process_hours),
                ola_warning_pct  = IF(ola_warning_pct  IN (70,0), VALUES(ola_warning_pct),  ola_warning_pct),
                ola_escalate_pct = IF(ola_escalate_pct IN (100,0),VALUES(ola_escalate_pct), ola_escalate_pct)");
    }
}

// ── بدء تتبع SLA+OLA لمرحلة ─────────────────────────────────
function slaCentralStart(string $system, int $entityId, string $stage): void {
    $conn = db();
    $policy = slaCentralGetPolicy($conn, $system, $stage);
    $policyId   = $policy ? (int)$policy['id'] : 'NULL';
    $slaMins    = $policy ? (int)round((float)($policy['sla_hours'] ?? $policy['allowed_hours'] ?? 24) * 60) : 'NULL';
    $olaWaitMin = $policy ? (int)round((float)($policy['ola_wait_hours'] ?? 2) * 60)    : 'NULL';
    $olaProcMin = $policy ? (int)round((float)($policy['ola_process_hours'] ?? 22) * 60) : 'NULL';

    $s  = $conn->real_escape_string($system);
    $st = $conn->real_escape_string($stage);

    $conn->query("INSERT INTO sla_central_tracking
        (system_type, entity_id, stage_name, policy_id,
         sla_started_at, sla_allowed_min, ola_wait_min, ola_process_min, status)
        VALUES ('$s', $entityId, '$st', $policyId,
                NOW(), $slaMins, $olaWaitMin, $olaProcMin, 'active')
        ON DUPLICATE KEY UPDATE
            sla_started_at=NOW(), status='active', sla_ended_at=NULL,
            sla_elapsed_min=0, sla_elapsed_pct=0, sla_warn_sent=0, sla_esc_sent=0,
            ola_received_at=NULL, ola_wait_elapsed=0, ola_process_elapsed=0,
            ola_wait_pct=0, ola_process_pct=0, ola_warn_sent=0, ola_esc_sent=0");
}

// ── تسجيل استلام المرحلة (يبدأ عداد OLA المعالجة) ──────────
function slaCentralReceived(string $system, int $entityId, string $stage): void {
    $conn = db();
    $s  = $conn->real_escape_string($system);
    $st = $conn->real_escape_string($stage);
    $conn->query("UPDATE sla_central_tracking
        SET ola_received_at = NOW()
        WHERE system_type='$s' AND entity_id=$entityId AND stage_name='$st'
          AND ola_received_at IS NULL");
}

// ── إنهاء تتبع SLA لمرحلة ──────────────────────────────────
function slaCentralEnd(string $system, int $entityId, string $stage): void {
    $conn = db();
    $s  = $conn->real_escape_string($system);
    $st = $conn->real_escape_string($stage);
    $conn->query("UPDATE sla_central_tracking
        SET status='completed', sla_ended_at=NOW()
        WHERE system_type='$s' AND entity_id=$entityId AND stage_name='$st' AND status='active'");
}

// ── جلب حالة SLA لكيان معين ─────────────────────────────────
function slaCentralStatus(string $system, int $entityId): array {
    $conn = db();
    $s    = $conn->real_escape_string($system);
    $r    = $conn->query("
        SELECT t.*,
               TIMESTAMPDIFF(MINUTE, t.sla_started_at, NOW()) AS live_sla_elapsed,
               CASE WHEN t.ola_received_at IS NULL
                    THEN TIMESTAMPDIFF(MINUTE, t.sla_started_at, NOW())
                    ELSE TIMESTAMPDIFF(MINUTE, t.sla_started_at, t.ola_received_at)
               END AS live_ola_wait,
               CASE WHEN t.ola_received_at IS NOT NULL
                    THEN TIMESTAMPDIFF(MINUTE, t.ola_received_at, NOW())
                    ELSE 0
               END AS live_ola_process,
               p.stage_label, p.sla_warning_pct, p.sla_escalate_pct,
               p.ola_warning_pct, p.ola_escalate_pct
        FROM sla_central_tracking t
        LEFT JOIN sla_central_policies p ON p.id = t.policy_id
        WHERE t.system_type='$s' AND t.entity_id=$entityId
        ORDER BY t.sla_started_at DESC
    ");
    $rows = [];
    if ($r) while ($row = $r->fetch_assoc()) {
        // SLA
        $slaElapsed = max(0, (int)($row['live_sla_elapsed'] ?? $row['sla_elapsed_min'] ?? 0));
        $slaAllowed = (int)($row['sla_allowed_min'] ?? 0);
        $slaPct     = $slaAllowed > 0 ? round($slaElapsed / $slaAllowed * 100, 1) : 0;
        $row['sla_elapsed_min'] = $slaElapsed;
        $row['sla_elapsed_pct'] = $slaPct;
        // OLA wait
        $waitElapsed = max(0, (int)($row['live_ola_wait'] ?? 0));
        $waitAllowed = (int)($row['ola_wait_min'] ?? 0);
        $row['ola_wait_elapsed'] = $waitElapsed;
        $row['ola_wait_pct'] = $waitAllowed > 0 ? round($waitElapsed / $waitAllowed * 100, 1) : 0;
        // OLA process
        $procElapsed = max(0, (int)($row['live_ola_process'] ?? 0));
        $procAllowed = (int)($row['ola_process_min'] ?? 0);
        $row['ola_process_elapsed'] = $procElapsed;
        $row['ola_process_pct'] = $procAllowed > 0 ? round($procElapsed / $procAllowed * 100, 1) : 0;
        $rows[] = $row;
    }
    return $rows;
}

// ── جلب سياسة مرحلة ─────────────────────────────────────────
function slaCentralGetPolicy($conn, string $system, string $stage): ?array {
    $s  = $conn->real_escape_string($system);
    $st = $conn->real_escape_string($stage);
    $r  = $conn->query("SELECT * FROM sla_central_policies
                        WHERE system_type='$s' AND stage_name='$st' AND is_active=1 LIMIT 1");
    return ($r && $row = $r->fetch_assoc()) ? $row : null;
}

// ── تشغيل CRON: تحديث SLA+OLA وإرسال التنبيهات ─────────────
function slaCentralCronTick(): array {
    $conn = db();
    $log  = [];

    $actives = $conn->query("
        SELECT t.*,
               p.sla_warning_pct, p.sla_escalate_pct,
               p.ola_warning_pct, p.ola_escalate_pct, p.stage_label
        FROM sla_central_tracking t
        LEFT JOIN sla_central_policies p ON p.id = t.policy_id
        WHERE t.status = 'active'
    ");
    if (!$actives) return $log;

    while ($row = $actives->fetch_assoc()) {
        $tid = (int)$row['id'];
        $sys = $row['system_type'];
        $eid = (int)$row['entity_id'];
        $st  = $row['stage_name'];
        $now = time();

        // ── SLA ──────────────────────────────────────────────
        $slaElapsed = max(0, (int)(($now - strtotime($row['sla_started_at'])) / 60));
        $slaAllowed = (int)($row['sla_allowed_min'] ?? 0);
        $slaPct     = $slaAllowed > 0 ? round($slaElapsed / $slaAllowed * 100, 1) : 0;

        // ── OLA: وقت الانتظار (قبل الاستلام) ─────────────────
        $receivedAt  = !empty($row['ola_received_at']) ? strtotime($row['ola_received_at']) : null;
        $waitElapsed = $receivedAt
            ? (int)(($receivedAt - strtotime($row['sla_started_at'])) / 60)
            : $slaElapsed;
        $waitAllowed = (int)($row['ola_wait_min'] ?? 0);
        $waitPct     = $waitAllowed > 0 ? round($waitElapsed / $waitAllowed * 100, 1) : 0;

        // ── OLA: وقت المعالجة (بعد الاستلام) ─────────────────
        $procElapsed = $receivedAt ? (int)(($now - $receivedAt) / 60) : 0;
        $procAllowed = (int)($row['ola_process_min'] ?? 0);
        $procPct     = $procAllowed > 0 ? round($procElapsed / $procAllowed * 100, 1) : 0;

        // حفظ القيم
        $conn->query("UPDATE sla_central_tracking SET
            sla_elapsed_min=$slaElapsed, sla_elapsed_pct=$slaPct,
            ola_wait_elapsed=$waitElapsed, ola_wait_pct=$waitPct,
            ola_process_elapsed=$procElapsed, ola_process_pct=$procPct
            WHERE id=$tid");

        $slaWarn = (int)($row['sla_warning_pct']  ?? 70);
        $slaEsc  = (int)($row['sla_escalate_pct'] ?? 100);
        $olaWarn = (int)($row['ola_warning_pct']  ?? 70);
        $olaEsc  = (int)($row['ola_escalate_pct'] ?? 100);

        // تنبيه SLA تحذير
        if ($slaPct >= $slaWarn && !$row['sla_warn_sent']) {
            $conn->query("UPDATE sla_central_tracking SET sla_warn_sent=1 WHERE id=$tid");
            $conn->query("INSERT INTO sla_central_breaches (system_type,entity_id,stage_name,breach_type,breach_scope,elapsed_pct)
                VALUES ('$sys',$eid,'$st','warning','sla',$slaPct)");
            $log[] = "SLA_WARN: $sys#$eid @ $st ({$slaPct}%)";
        }
        // تنبيه SLA تصعيد
        if ($slaPct >= $slaEsc && !$row['sla_esc_sent']) {
            $conn->query("UPDATE sla_central_tracking SET sla_esc_sent=1 WHERE id=$tid");
            $conn->query("INSERT INTO sla_central_breaches (system_type,entity_id,stage_name,breach_type,breach_scope,elapsed_pct)
                VALUES ('$sys',$eid,'$st','escalation','sla',$slaPct)");
            $log[] = "SLA_ESC: $sys#$eid @ $st ({$slaPct}%)";
        }
        // تنبيه OLA انتظار — فقط إذا لم يُستلم بعد
        if (!$receivedAt) {
            if ($waitPct >= $olaWarn && !$row['ola_warn_sent']) {
                $conn->query("UPDATE sla_central_tracking SET ola_warn_sent=1 WHERE id=$tid");
                $conn->query("INSERT INTO sla_central_breaches (system_type,entity_id,stage_name,breach_type,breach_scope,elapsed_pct)
                    VALUES ('$sys',$eid,'$st','warning','ola_wait',$waitPct)");
                $log[] = "OLA_WAIT_WARN: $sys#$eid @ $st ({$waitPct}%)";
            }
            if ($waitPct >= $olaEsc && !$row['ola_esc_sent']) {
                $conn->query("UPDATE sla_central_tracking SET ola_esc_sent=1 WHERE id=$tid");
                $conn->query("INSERT INTO sla_central_breaches (system_type,entity_id,stage_name,breach_type,breach_scope,elapsed_pct)
                    VALUES ('$sys',$eid,'$st','escalation','ola_wait',$waitPct)");
                $log[] = "OLA_WAIT_ESC: $sys#$eid @ $st ({$waitPct}%)";
            }
        }
        // تنبيه OLA معالجة — بعد الاستلام
        if ($receivedAt && $procPct >= $olaWarn) {
            $log[] = "OLA_PROC: $sys#$eid @ $st ({$procPct}%)";
        }
    }
    return $log;
}

// ════════════════════════════════════════════════════════════
// HTTP API
// ════════════════════════════════════════════════════════════
header('Content-Type: application/json; charset=utf-8');

try {
    if (ob_get_level()) ob_end_clean();
    $conn = db();
    slaCentralMigrate();

    $action = $_GET['action'] ?? '';
    $method = $_SERVER['REQUEST_METHOD'];

    // ── جلب سياسات نظام ─────────────────────────────────────
    if ($action === 'get_policies') {
        $system = $conn->real_escape_string($_GET['system'] ?? '');
        $where  = $system ? "WHERE system_type='$system'" : '';
        $r = $conn->query("SELECT * FROM sla_central_policies $where ORDER BY system_type, id");
        $rows = [];
        if ($r) while ($row = $r->fetch_assoc()) $rows[] = $row;
        echo json_encode(['success'=>true, 'data'=>$rows], JSON_UNESCAPED_UNICODE);
    }

    // ── حفظ سياسة ───────────────────────────────────────────
    elseif ($action === 'save_policy' && $method === 'POST') {
        $input = json_decode(file_get_contents('php://input'), true) ?? [];
        $id    = (int)($input['id'] ?? 0);
        $hours = (float)($input['allowed_hours'] ?? 24);
        $warn  = (int)($input['warning_pct']  ?? 70);
        $esc   = (int)($input['escalate_pct'] ?? 100);

        if ($id > 0) {
            $conn->query("UPDATE sla_central_policies
                SET allowed_hours=$hours, warning_pct=$warn, escalate_pct=$esc, updated_at=NOW()
                WHERE id=$id");
            echo json_encode(['success'=>true, 'message'=>'تم الحفظ'], JSON_UNESCAPED_UNICODE);
        } else {
            $sys   = $conn->real_escape_string($input['system_type'] ?? '');
            $stage = $conn->real_escape_string($input['stage_name']  ?? '');
            $label = $conn->real_escape_string($input['stage_label'] ?? $stage);
            if (!$sys || !$stage) {
                http_response_code(400);
                echo json_encode(['success'=>false, 'message'=>'بيانات ناقصة'], JSON_UNESCAPED_UNICODE);
            } else {
                $conn->query("INSERT INTO sla_central_policies
                    (system_type,stage_name,stage_label,allowed_hours,warning_pct,escalate_pct)
                    VALUES ('$sys','$stage','$label',$hours,$warn,$esc)
                    ON DUPLICATE KEY UPDATE allowed_hours=$hours, warning_pct=$warn, escalate_pct=$esc");
                echo json_encode(['success'=>true, 'message'=>'تم الحفظ'], JSON_UNESCAPED_UNICODE);
            }
        }
    }

    // ── حفظ جميع سياسات نظام (bulk) ────────────────────────
    elseif ($action === 'save_policies_bulk' && $method === 'POST') {
        $input    = json_decode(file_get_contents('php://input'), true) ?? [];
        $policies = $input['policies'] ?? [];
        foreach ($policies as $p) {
            $id      = (int)($p['id'] ?? 0);
            $slaH    = (float)($p['sla_hours']        ?? $p['allowed_hours'] ?? 24);
            $slaW    = (int)($p['sla_warning_pct']    ?? $p['warning_pct']   ?? 70);
            $slaE    = (int)($p['sla_escalate_pct']   ?? $p['escalate_pct']  ?? 100);
            $olaWH   = (float)($p['ola_wait_hours']    ?? 2);
            $olaPH   = (float)($p['ola_process_hours'] ?? ($slaH - $olaWH));
            $olaW    = (int)($p['ola_warning_pct']    ?? 70);
            $olaE    = (int)($p['ola_escalate_pct']   ?? 100);
            if ($id > 0) {
                $conn->query("UPDATE sla_central_policies SET
                    sla_hours=$slaH, sla_warning_pct=$slaW, sla_escalate_pct=$slaE,
                    ola_wait_hours=$olaWH, ola_process_hours=$olaPH,
                    ola_warning_pct=$olaW, ola_escalate_pct=$olaE,
                    updated_at=NOW()
                    WHERE id=$id");
            }
        }
        echo json_encode(['success'=>true, 'message'=>'تم حفظ جميع السياسات'], JSON_UNESCAPED_UNICODE);
    }

    // ── لوحة المراقبة: إحصائيات ─────────────────────────────
    elseif ($action === 'dashboard_stats') {
        $stats = [];
        foreach (['transactions','purchase','reservations'] as $sys) {
            $s = $conn->real_escape_string($sys);
            $total   = $conn->query("SELECT COUNT(*) c FROM sla_central_tracking WHERE system_type='$s' AND status='active'")->fetch_assoc()['c'] ?? 0;
            $warning = $conn->query("SELECT COUNT(*) c FROM sla_central_tracking t LEFT JOIN sla_central_policies p ON p.id=t.policy_id WHERE t.system_type='$s' AND t.status='active' AND t.sla_elapsed_pct>=p.sla_warning_pct AND t.sla_elapsed_pct<p.sla_escalate_pct")->fetch_assoc()['c'] ?? 0;
            $breach  = $conn->query("SELECT COUNT(*) c FROM sla_central_tracking t LEFT JOIN sla_central_policies p ON p.id=t.policy_id WHERE t.system_type='$s' AND t.status='active' AND t.sla_elapsed_pct>=p.sla_escalate_pct")->fetch_assoc()['c'] ?? 0;
            $stats[$sys] = ['active'=>(int)$total,'warning'=>(int)$warning,'breach'=>(int)$breach];
        }
        echo json_encode(['success'=>true,'data'=>$stats], JSON_UNESCAPED_UNICODE);
    }

    // ── سجل التجاوزات ────────────────────────────────────────
    elseif ($action === 'breaches') {
        $system = $conn->real_escape_string($_GET['system'] ?? '');
        $limit  = min((int)($_GET['limit'] ?? 50), 200);
        $where  = $system ? "WHERE system_type='$system'" : '';
        $r = $conn->query("SELECT * FROM sla_central_breaches $where ORDER BY notified_at DESC LIMIT $limit");
        $rows = [];
        if ($r) while ($row = $r->fetch_assoc()) $rows[] = $row;
        echo json_encode(['success'=>true,'data'=>$rows], JSON_UNESCAPED_UNICODE);
    }

    // ── تشغيل CRON يدوياً ────────────────────────────────────
    elseif ($action === 'cron_tick') {
        $log = slaCentralCronTick();
        echo json_encode(['success'=>true,'log'=>$log,'count'=>count($log)], JSON_UNESCAPED_UNICODE);
    }

    else {
        http_response_code(400);
        echo json_encode(['success'=>false,'message'=>'إجراء غير معروف: '.$action], JSON_UNESCAPED_UNICODE);
    }

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success'=>false,'message'=>$e->getMessage()], JSON_UNESCAPED_UNICODE);
}