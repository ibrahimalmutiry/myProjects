<?php
/**
 * Migration Script — شغّله مرة واحدة فقط على الخادم
 * يُنشئ جميع الأعمدة والجداول المطلوبة
 *
 * الاستخدام:
 *   php migrations/run_once.php
 *   أو: /migrations/run_once.php?token=YOUR_MIGRATION_TOKEN
 *
 * بعد التشغيل الناجح: احذف هذا الملف من الخادم
 */

if (PHP_SAPI !== 'cli') {
    $expected = $_ENV['MIGRATION_TOKEN'] ?? getenv('MIGRATION_TOKEN') ?? '';
    $provided = $_GET['token'] ?? '';
    if ($expected === '' || !hash_equals($expected, $provided)) {
        http_response_code(403);
        die(json_encode(['error' => 'Unauthorized'], JSON_UNESCAPED_UNICODE));
    }
}

require_once __DIR__ . '/../includes/config.php';
$conn = db();
$log  = [];

function runMigration(mysqli $conn, string $label, string $sql): void {
    global $log;
    $result = $conn->query($sql);
    $log[]  = ($result ? '✓' : '✗') . ' ' . $label;
    if (!$result) $log[] = '  Error: ' . $conn->error;
}

// ════════════════════════════════════════════════════════════
// ① employees — أعمدة المصادقة والصلاحيات
// ════════════════════════════════════════════════════════════
$empCols = [
    'employee_number'  => "ALTER TABLE employees ADD COLUMN IF NOT EXISTS employee_number VARCHAR(20) AFTER id",
    'password'         => "ALTER TABLE employees ADD COLUMN IF NOT EXISTS password VARCHAR(255) DEFAULT NULL",
    'is_registered'    => "ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_registered TINYINT(1) DEFAULT 0",
    'last_login'       => "ALTER TABLE employees ADD COLUMN IF NOT EXISTS last_login DATETIME DEFAULT NULL",
    'permission_level' => "ALTER TABLE employees ADD COLUMN IF NOT EXISTS permission_level ENUM('system_admin','manager','employee') NOT NULL DEFAULT 'employee'",
    'can_delete'       => "ALTER TABLE employees ADD COLUMN IF NOT EXISTS can_delete TINYINT(1) NOT NULL DEFAULT 0",
    'failed_attempts'  => "ALTER TABLE employees ADD COLUMN IF NOT EXISTS failed_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0",
];
foreach ($empCols as $name => $sql) {
    runMigration($conn, "employees.$name", $sql);
}
runMigration($conn, 'Set system_admin permission',
    "UPDATE employees SET permission_level='system_admin', can_delete=1 WHERE role='admin'"
);

// ════════════════════════════════════════════════════════════
// ② purchase_requests — أعمدة مفقودة
// ════════════════════════════════════════════════════════════
$prCols = [
    'assigned_to'          => "ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS assigned_to INT DEFAULT NULL AFTER department_id",
    'rejection_reason'     => "ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS rejection_reason TEXT DEFAULT NULL",
    'rejected_at'          => "ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS rejected_at DATETIME DEFAULT NULL",
    'rejected_by'          => "ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS rejected_by INT DEFAULT NULL",
    'returned_to_manager'  => "ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS returned_to_manager INT DEFAULT NULL",
    'returned_at'          => "ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS returned_at DATETIME DEFAULT NULL",
    'po_number'            => "ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS po_number VARCHAR(100) DEFAULT NULL",
    'final_supplier_id'    => "ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS final_supplier_id INT DEFAULT NULL",
    'final_supplier_name'  => "ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS final_supplier_name VARCHAR(255) DEFAULT NULL",
    'final_amount'         => "ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS final_amount DECIMAL(15,2) DEFAULT NULL",
    'final_amount_sar'     => "ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS final_amount_sar DECIMAL(15,2) DEFAULT NULL",
    'po_issued_at'         => "ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS po_issued_at DATETIME DEFAULT NULL",
    'po_issued_by'         => "ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS po_issued_by INT DEFAULT NULL",
    'budget_reservation_id'=> "ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS budget_reservation_id INT DEFAULT NULL",
    'payment_status'       => "ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'في الانتظار'",
    'sent_to_payment_at'   => "ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS sent_to_payment_at DATETIME DEFAULT NULL",
    'sla_paused_at'        => "ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS sla_paused_at DATETIME DEFAULT NULL",
    'sla_paused_minutes'   => "ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS sla_paused_minutes INT NOT NULL DEFAULT 0",
    'workflow_path'        => "ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS workflow_path ENUM('short','long') NOT NULL DEFAULT 'short'",
    'current_stage'        => "ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS current_stage VARCHAR(60) NOT NULL DEFAULT 'budget_review'",
    'amount_sar'           => "ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS amount_sar DECIMAL(15,2) DEFAULT NULL",
    'exchange_rate'        => "ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS exchange_rate DECIMAL(10,4) NOT NULL DEFAULT 1.0000",
    'needed_date'          => "ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS needed_date DATE DEFAULT NULL",
    'cost_center_id'       => "ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS cost_center_id INT DEFAULT NULL",
    'budget_category_id'   => "ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS budget_category_id INT DEFAULT NULL",
    'budget_code'          => "ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS budget_code VARCHAR(50) DEFAULT NULL",
    'priority'             => "ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS priority ENUM('normal','urgent') NOT NULL DEFAULT 'normal'",
    'updated_at'           => "ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS updated_at DATETIME DEFAULT NULL ON UPDATE NOW()",
];
foreach ($prCols as $name => $sql) {
    runMigration($conn, "purchase_requests.$name", $sql);
}

// ════════════════════════════════════════════════════════════
// ③ pr_workflow_stages — أعمدة مفقودة
// ════════════════════════════════════════════════════════════
$wsCols = [
    'assigned_to'  => "ALTER TABLE pr_workflow_stages ADD COLUMN IF NOT EXISTS assigned_to INT DEFAULT NULL",
    'approved_by'  => "ALTER TABLE pr_workflow_stages ADD COLUMN IF NOT EXISTS approved_by INT DEFAULT NULL",
    'started_at'   => "ALTER TABLE pr_workflow_stages ADD COLUMN IF NOT EXISTS started_at DATETIME DEFAULT NULL",
    'arrived_at'   => "ALTER TABLE pr_workflow_stages ADD COLUMN IF NOT EXISTS arrived_at DATETIME DEFAULT NULL",
    'duration_min' => "ALTER TABLE pr_workflow_stages ADD COLUMN IF NOT EXISTS duration_min INT DEFAULT NULL",
    'action'       => "ALTER TABLE pr_workflow_stages ADD COLUMN IF NOT EXISTS action VARCHAR(50) DEFAULT NULL",
    'notes'        => "ALTER TABLE pr_workflow_stages ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT NULL",
    'employee_id'  => "ALTER TABLE pr_workflow_stages ADD COLUMN IF NOT EXISTS employee_id INT DEFAULT NULL",
];
foreach ($wsCols as $name => $sql) {
    runMigration($conn, "pr_workflow_stages.$name", $sql);
}

// ════════════════════════════════════════════════════════════
// ④ جداول المصادقة والصلاحيات
// ════════════════════════════════════════════════════════════
runMigration($conn, 'CREATE login_attempts', "
    CREATE TABLE IF NOT EXISTS login_attempts (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        employee_number VARCHAR(20)  NOT NULL,
        ip              VARCHAR(45)  NOT NULL DEFAULT '',
        attempted_at    DATETIME     NOT NULL DEFAULT NOW(),
        INDEX idx_emp_time (employee_number, attempted_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
");

runMigration($conn, 'CREATE employee_page_permissions', "
    CREATE TABLE IF NOT EXISTS employee_page_permissions (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        employee_id INT NOT NULL,
        page        VARCHAR(50) NOT NULL,
        can_access  TINYINT(1)  NOT NULL DEFAULT 1,
        updated_at  TIMESTAMP   DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_emp_page (employee_id, page),
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
");

// ════════════════════════════════════════════════════════════
// ⑤ جداول CEO Approvals
// ════════════════════════════════════════════════════════════
runMigration($conn, 'CREATE ceo_approval_actions', "
    CREATE TABLE IF NOT EXISTS ceo_approval_actions (
        id                INT AUTO_INCREMENT PRIMARY KEY,
        reservation_id    INT NOT NULL,
        action            VARCHAR(50),
        notes             TEXT,
        performed_by      INT,
        archive_file_path VARCHAR(500),
        created_at        DATETIME DEFAULT NOW()
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
");

runMigration($conn, 'CREATE ceo_stamp_settings', "
    CREATE TABLE IF NOT EXISTS ceo_stamp_settings (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        stamp_text      VARCHAR(100) DEFAULT 'معتمد',
        stamp_color     VARCHAR(20)  DEFAULT '#1e40af',
        signature_image MEDIUMTEXT   DEFAULT NULL,
        updated_by      INT          DEFAULT NULL,
        updated_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
");
runMigration($conn, 'Seed ceo_stamp_settings',
    "INSERT IGNORE INTO ceo_stamp_settings (id, stamp_text, stamp_color) VALUES (1, 'معتمد', '#1e40af')"
);

// ════════════════════════════════════════════════════════════
// ⑥ جداول SLA
// ════════════════════════════════════════════════════════════
runMigration($conn, 'CREATE pr_sla_policies', "
    CREATE TABLE IF NOT EXISTS pr_sla_policies (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        stage_name    VARCHAR(60)  NOT NULL,
        name          VARCHAR(100) NOT NULL DEFAULT '',
        allowed_hours DECIMAL(6,2) NOT NULL DEFAULT 24,
        warning_pct   TINYINT      NOT NULL DEFAULT 70,
        escalate_pct  TINYINT      NOT NULL DEFAULT 100,
        department_id INT          DEFAULT NULL,
        is_active     TINYINT(1)   NOT NULL DEFAULT 1,
        created_at    DATETIME     DEFAULT NOW(),
        UNIQUE KEY uq_stage_dept (stage_name, department_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
");

// إضافة سياسات SLA الافتراضية لكل مرحلة
$slaDefaults = [
    ['budget_review',           'مراجعة الموازنة',              24, 70, 100],
    ['treasury_review',         'مراجعة مدير الخزينة',           48, 70, 100],
    ['finance_review',          'مراجعة المدير المالي',           48, 70, 100],
    ['ceo_approval',            'اعتماد الرئيس التنفيذي',         72, 70, 100],
    ['purchasing',              'المشتريات',                      48, 70, 100],
    ['waiting_budget_approval', 'انتظار اعتماد الحجز',            0,  70, 100],
    ['payment',                 'المالية — الدفع',                24, 70, 100],
    ['referral',                'وقت الانتظار عند الإحالة',       24, 70, 100],
];
foreach ($slaDefaults as [$stage, $name, $hours, $warn, $esc]) {
    runMigration($conn, "Seed SLA policy: $stage",
        "INSERT IGNORE INTO pr_sla_policies (stage_name, name, allowed_hours, warning_pct, escalate_pct)
         VALUES ('$stage', '$name', $hours, $warn, $esc)"
    );
}

runMigration($conn, 'CREATE pr_sla_tracking', "
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

runMigration($conn, 'CREATE pr_sla_breaches', "
    CREATE TABLE IF NOT EXISTS pr_sla_breaches (
        id               INT AUTO_INCREMENT PRIMARY KEY,
        request_id       INT          NOT NULL,
        tracking_id      INT          DEFAULT NULL,
        stage_name       VARCHAR(60)  NOT NULL,
        breach_type      ENUM('warning','breach') NOT NULL,
        elapsed_minutes  INT          NOT NULL DEFAULT 0,
        allowed_minutes  INT          NOT NULL DEFAULT 0,
        breach_pct       DECIMAL(7,1) NOT NULL DEFAULT 0,
        escalated_to_id  INT          DEFAULT NULL,
        notified_at      DATETIME     NOT NULL DEFAULT NOW(),
        INDEX idx_req (request_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
");

// ════════════════════════════════════════════════════════════
// ⑦ جداول طلبات الشراء المساعدة
// ════════════════════════════════════════════════════════════
runMigration($conn, 'CREATE pr_stage_approvals', "
    CREATE TABLE IF NOT EXISTS pr_stage_approvals (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        request_id    INT         NOT NULL,
        stage_name    VARCHAR(60) NOT NULL,
        employee_id   INT         NOT NULL,
        employee_role VARCHAR(60) DEFAULT NULL,
        status        ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
        action_notes  TEXT        DEFAULT NULL,
        actioned_at   DATETIME    DEFAULT NULL,
        UNIQUE KEY uq_req_stage_emp (request_id, stage_name, employee_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
");

runMigration($conn, 'CREATE pr_events', "
    CREATE TABLE IF NOT EXISTS pr_events (
        id                         INT AUTO_INCREMENT PRIMARY KEY,
        request_id                 INT         NOT NULL,
        event_type                 VARCHAR(60) NOT NULL,
        performed_by               INT         DEFAULT NULL,
        stage                      VARCHAR(60) DEFAULT NULL,
        description                TEXT        DEFAULT NULL,
        old_value                  TEXT        DEFAULT NULL,
        new_value                  TEXT        DEFAULT NULL,
        referred_to_employee_id    INT         DEFAULT NULL,
        referred_to_department_id  INT         DEFAULT NULL,
        referral_reason            TEXT        DEFAULT NULL,
        referral_type              VARCHAR(20) DEFAULT NULL,
        assigned_to_employee_id    INT         DEFAULT NULL,
        previous_assigned_id       INT         DEFAULT NULL,
        created_at                 DATETIME    DEFAULT NOW(),
        INDEX idx_req (request_id),
        INDEX idx_type (event_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
");

runMigration($conn, 'CREATE pr_attachments', "
    CREATE TABLE IF NOT EXISTS pr_attachments (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        request_id    INT          NOT NULL,
        file_name     VARCHAR(255) NOT NULL,
        original_name VARCHAR(255) DEFAULT NULL,
        file_path     VARCHAR(500) NOT NULL,
        file_type     VARCHAR(100) DEFAULT NULL,
        file_size     INT          DEFAULT NULL,
        uploaded_by   INT          DEFAULT NULL,
        stage         VARCHAR(60)  DEFAULT NULL,
        uploaded_at   DATETIME     DEFAULT NOW(),
        INDEX idx_req (request_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
");

// ════════════════════════════════════════════════════════════
// ⑧ ملاحظات يدوية مطلوبة
// ════════════════════════════════════════════════════════════
$log[] = '';
$log[] = str_repeat('═', 50);
$log[] = 'خطوات يدوية مطلوبة بعد تشغيل هذا الملف:';
$log[] = '';
$log[] = '1) عدّل دور مدير الخزينة:';
$log[] = "   UPDATE employees SET role='treasury_manager'";
$log[] = "   WHERE role='dispatch'";
$log[] = "   AND department_id=(SELECT id FROM departments WHERE code='TRES' LIMIT 1);";
$log[] = '';
$log[] = '2) أضف CRON كل 15 دقيقة:';
$log[] = '   */15 * * * * php /full/path/cron/sla_checker.php';
$log[] = '';
$log[] = '3) احذف هذا الملف من الخادم.';
$log[] = str_repeat('═', 50);

// ── توسيع ENUM permission_level للمستويات الخمسة ──────────────
runMigration($conn, 'ALTER employees.permission_level ENUM expand', "
    ALTER TABLE employees
    MODIFY COLUMN permission_level
    ENUM('system_admin','sector_head','division_manager','employee_l1','employee','manager')
    NOT NULL DEFAULT 'employee'
");

// ترحيل manager → division_manager (الافتراضي)
runMigration($conn, 'Migrate manager to division_manager', "
    UPDATE employees
    SET permission_level = 'division_manager'
    WHERE permission_level = 'manager'
");

// مزامنة permission_level مع permission_level_code المخزَّن
runMigration($conn, 'Sync permission_level from permission_level_code', "
    UPDATE employees
    SET permission_level = CASE permission_level_code
        WHEN 'system_admin'     THEN 'system_admin'
        WHEN 'sector_head'      THEN 'sector_head'
        WHEN 'division_manager' THEN 'division_manager'
        WHEN 'employee_l1'      THEN 'employee_l1'
        WHEN 'employee'         THEN 'employee'
        ELSE permission_level
    END
    WHERE permission_level_code IS NOT NULL AND permission_level_code != ''
");

// CEO → sector_head
runMigration($conn, 'Set CEO employees to sector_head', "
    UPDATE employees
    SET permission_level = 'sector_head', permission_level_code = 'sector_head'
    WHERE role = 'CEO' AND permission_level != 'system_admin'
");

// ── الإخراج ───────────────────────────────────────────────
$output = implode("\n", $log);
if (PHP_SAPI === 'cli') {
    echo $output . "\n";
} else {
    header('Content-Type: text/plain; charset=utf-8');
    echo "Migration Results:\n" . $output . "\n";
}