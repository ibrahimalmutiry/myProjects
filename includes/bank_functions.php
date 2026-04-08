<?php
/**
 * bank_functions.php
 * دوال الحسابات البنكية
 *
 * الأقسام:
 * ① الحسابات البنكية (قراءة / إضافة / تعديل / تحديث الرصيد)
 * ② الإحصائيات
 */


// ═══════════════════════════════════════════════════════════════
// ① الحسابات البنكية
// ═══════════════════════════════════════════════════════════════

function getAllBankAccounts($activeOnly = false) {
    $conn = db();
    $sql  = "SELECT * FROM bank_accounts";
    if ($activeOnly) $sql .= " WHERE is_active = 1";
    $sql .= " ORDER BY id DESC";
    $result   = $conn->query($sql);
    $accounts = [];
    if ($result && $result->num_rows > 0)
        while ($row = $result->fetch_assoc()) $accounts[] = $row;
    return $accounts;
}

function getBankAccount($id) {
    $conn   = db();
    $id     = (int)$id;
    $result = $conn->query("SELECT * FROM bank_accounts WHERE id = $id");
    return ($result && $result->num_rows > 0) ? $result->fetch_assoc() : null;
}

function addBankAccount($data) {
    $conn           = db();
    $accountNumber  = $conn->real_escape_string($data['account_number']);
    $accountName    = $conn->real_escape_string($data['account_name']);
    $bankName       = $conn->real_escape_string($data['bank_name']);
    $bankBranch     = $conn->real_escape_string($data['bank_branch']    ?? '');
    $accountType    = $conn->real_escape_string($data['account_type']   ?? 'جاري');
    $currency       = $conn->real_escape_string($data['currency']       ?? 'SAR');
    $initialBalance = (float)($data['initial_balance'] ?? 0);
    $iban           = $conn->real_escape_string($data['iban']           ?? '');
    $swiftCode      = $conn->real_escape_string($data['swift_code']     ?? '');
    $notes          = $conn->real_escape_string($data['notes']          ?? '');

    $sql = "INSERT INTO bank_accounts (
                account_number, account_name, bank_name, bank_branch,
                account_type, currency, initial_balance, current_balance,
                iban, swift_code, notes
            ) VALUES (
                '$accountNumber', '$accountName', '$bankName', '$bankBranch',
                '$accountType', '$currency', $initialBalance, $initialBalance,
                '$iban', '$swiftCode', '$notes'
            )";

    return $conn->query($sql)
        ? ['success' => true, 'id' => $conn->insert_id]
        : ['success' => false, 'message' => $conn->error];
}

function updateBankAccount($id, $data) {
    $conn        = db();
    $id          = (int)$id;
    if ($id <= 0) return ['success' => false, 'message' => 'معرف الحساب غير صالح'];

    $accountName = $conn->real_escape_string(trim($data['account_name']   ?? ''));
    $accountNum  = $conn->real_escape_string(trim($data['account_number'] ?? ''));
    $bankName    = $conn->real_escape_string(trim($data['bank_name']      ?? ''));
    $accountType = $conn->real_escape_string($data['account_type']        ?? 'جاري');
    $iban        = $conn->real_escape_string(trim($data['iban']           ?? ''));
    $isActive    = (int)($data['is_active'] ?? 1);

    if (empty($accountName) || empty($bankName))
        return ['success' => false, 'message' => 'اسم الحساب والبنك مطلوبان'];

    $sql = "UPDATE bank_accounts SET
                account_name   = '$accountName',
                account_number = '$accountNum',
                bank_name      = '$bankName',
                account_type   = '$accountType',
                iban           = '$iban',
                is_active      = $isActive
            WHERE id = $id";

    return $conn->query($sql)
        ? ['success' => true, 'message' => 'تم تحديث الحساب بنجاح']
        : ['success' => false, 'message' => $conn->error];
}

function updateAccountBalance($accountId, $newBalance) {
    $conn      = db();
    $accountId = (int)$accountId;
    return $conn->query("UPDATE bank_accounts SET current_balance = " . (float)$newBalance . " WHERE id = $accountId");
}


// ═══════════════════════════════════════════════════════════════
// ② الأرصدة اليومية
// ═══════════════════════════════════════════════════════════════

/**
 * إنشاء جدول daily_balances إن لم يكن موجوداً
 */
function ensureDailyBalancesTable() {
    $conn = db();
    $conn->query("CREATE TABLE IF NOT EXISTS daily_balances (
        id                INT          NOT NULL AUTO_INCREMENT,
        account_id        INT          NOT NULL,
        balance_date      DATE         NOT NULL,
        opening_balance   DECIMAL(15,2) NOT NULL DEFAULT 0,
        closing_balance   DECIMAL(15,2) NOT NULL DEFAULT 0,
        total_deposits    DECIMAL(15,2) NOT NULL DEFAULT 0,
        total_withdrawals DECIMAL(15,2) NOT NULL DEFAULT 0,
        notes             TEXT,
        recorded_by       INT          DEFAULT 1,
        created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_account_date (account_id, balance_date),
        CONSTRAINT fk_db_account FOREIGN KEY (account_id)
            REFERENCES bank_accounts(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
}

/**
 * جلب سجل الأرصدة اليومية
 */
function getDailyBalances(int $limit = 30, ?int $accountId = null): array {
    $conn  = db();
    ensureDailyBalancesTable();
    $where = $accountId ? "WHERE db.account_id = " . (int)$accountId : '';
    $limit = max(1, min($limit, 500));

    $sql = "SELECT
                db.*,
                a.account_name,
                a.bank_name
            FROM daily_balances db
            LEFT JOIN bank_accounts a ON db.account_id = a.id
            $where
            ORDER BY db.balance_date DESC, db.id DESC
            LIMIT $limit";

    $result   = $conn->query($sql);
    $balances = [];
    if ($result && $result->num_rows > 0) {
        while ($row = $result->fetch_assoc()) $balances[] = $row;
    }
    return $balances;
}

/**
 * مجموع الودائع المؤكدة لحساب في يوم معين
 */
function _getTotalDepositsForDate(int $accountId, string $date): float {
    $conn = db();
    ensureBankDepositsTable();
    $date   = $conn->real_escape_string($date);
    $result = $conn->query(
        "SELECT COALESCE(SUM(amount), 0) AS total
         FROM bank_deposits
         WHERE account_id = $accountId
           AND deposit_date = '$date'
           AND status = 'مؤكد'"
    );
    return ($result) ? (float)$result->fetch_assoc()['total'] : 0.0;
}

/**
 * تسجيل رصيد يومي — يُنشئ سجلاً جديداً أو يُحدّث الموجود لنفس اليوم والحساب
 */
function recordDailyBalance(array $data): array {
    $conn = db();
    ensureDailyBalancesTable();

    $accountId      = (int)($data['account_id']      ?? 0);
    $balanceDate    = $conn->real_escape_string($data['balance_date']    ?? date('Y-m-d'));
    $openingBalance = (float)($data['opening_balance'] ?? 0);
    $closingBalance = (float)($data['closing_balance'] ?? 0);
    $notes          = $conn->real_escape_string(trim($data['notes']      ?? ''));
    $recordedBy     = (int)($_SESSION['user_id']      ?? 1);
    $updateCurrent  = (($data['update_current'] ?? '0') === '1');

    if ($accountId <= 0) {
        return ['success' => false, 'message' => 'معرّف الحساب مطلوب'];
    }

    // التحقق من وجود الحساب
    $accCheck = $conn->query("SELECT id FROM bank_accounts WHERE id = $accountId LIMIT 1");
    if (!$accCheck || $accCheck->num_rows === 0) {
        return ['success' => false, 'message' => 'الحساب البنكي غير موجود'];
    }

    $deposits    = _getTotalDepositsForDate($accountId, $balanceDate);
    $withdrawals = 0.0; // يمكن تفعيله لاحقاً من جدول المدفوعات

    $sql = "INSERT INTO daily_balances
                (account_id, balance_date, opening_balance, closing_balance,
                 total_deposits, total_withdrawals, notes, recorded_by)
            VALUES
                ($accountId, '$balanceDate', $openingBalance, $closingBalance,
                 $deposits, $withdrawals, '$notes', $recordedBy)
            ON DUPLICATE KEY UPDATE
                opening_balance   = $openingBalance,
                closing_balance   = $closingBalance,
                total_deposits    = $deposits,
                total_withdrawals = $withdrawals,
                notes             = '$notes',
                recorded_by       = $recordedBy,
                updated_at        = CURRENT_TIMESTAMP";

    if (!$conn->query($sql)) {
        return ['success' => false, 'message' => 'فشل تسجيل الرصيد: ' . $conn->error];
    }

    // تحديث الرصيد الحالي في bank_accounts إن طُلب ذلك
    if ($updateCurrent) {
        $conn->query("UPDATE bank_accounts SET current_balance = $closingBalance WHERE id = $accountId");
    }

    return [
        'success' => true,
        'message' => 'تم تسجيل الرصيد بنجاح',
        'date'    => $balanceDate,
        'closing' => $closingBalance,
    ];
}


// ═══════════════════════════════════════════════════════════════
// ③ الودائع البنكية (bank_deposits)
// ═══════════════════════════════════════════════════════════════

/**
 * إنشاء جدول bank_deposits إن لم يكن موجوداً
 */
function ensureBankDepositsTable() {
    $conn = db();
    $conn->query("CREATE TABLE IF NOT EXISTS bank_deposits (
        id               INT           NOT NULL AUTO_INCREMENT,
        account_id       INT           NOT NULL,
        amount           DECIMAL(15,2) NOT NULL DEFAULT 0,
        deposit_date     DATE          NOT NULL,
        deposit_type     VARCHAR(50)   NOT NULL DEFAULT 'إيداع',
        reference_number VARCHAR(100)  DEFAULT '',
        depositor_name   VARCHAR(200)  DEFAULT '',
        notes            TEXT,
        status           VARCHAR(30)   NOT NULL DEFAULT 'معلق',
        confirmed_by     INT           DEFAULT NULL,
        confirmed_at     TIMESTAMP     NULL DEFAULT NULL,
        created_by       INT           DEFAULT 1,
        created_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_account_date (account_id, deposit_date),
        KEY idx_status (status),
        CONSTRAINT fk_bd_account FOREIGN KEY (account_id)
            REFERENCES bank_accounts(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
}

/**
 * إنشاء جدول monthly_deposit_schedule إن لم يكن موجوداً
 */
function ensureMonthlyDepositsTable() {
    $conn = db();
    $conn->query("CREATE TABLE IF NOT EXISTS monthly_deposit_schedule (
        id               INT           NOT NULL AUTO_INCREMENT,
        account_id       INT           NOT NULL,
        amount           DECIMAL(15,2) NOT NULL DEFAULT 0,
        scheduled_date   DATE          NOT NULL,
        deposit_day      TINYINT       NOT NULL DEFAULT 1,
        notes            TEXT,
        status           VARCHAR(30)   NOT NULL DEFAULT 'مجدول',
        confirmed_by     INT           DEFAULT NULL,
        confirmed_at     TIMESTAMP     NULL DEFAULT NULL,
        created_by       INT           DEFAULT 1,
        created_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_mds_account (account_id),
        KEY idx_mds_date (scheduled_date),
        CONSTRAINT fk_mds_account FOREIGN KEY (account_id)
            REFERENCES bank_accounts(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
}

/**
 * جلب جميع الودائع البنكية
 */
function getAllDeposits(?int $limit = null): array {
    $conn = db();
    ensureBankDepositsTable();

    $sql = "SELECT
                d.*,
                a.account_name,
                a.account_number,
                a.bank_name,
                e1.name AS created_by_name,
                e2.name AS confirmed_by_name
            FROM bank_deposits d
            LEFT JOIN bank_accounts a  ON d.account_id  = a.id
            LEFT JOIN employees e1     ON d.created_by  = e1.id
            LEFT JOIN employees e2     ON d.confirmed_by = e2.id
            ORDER BY d.deposit_date DESC, d.id DESC";

    if ($limit) $sql .= " LIMIT " . (int)$limit;

    $result   = $conn->query($sql);
    $deposits = [];
    if ($result && $result->num_rows > 0)
        while ($row = $result->fetch_assoc()) $deposits[] = $row;
    return $deposits;
}

/**
 * إضافة إيداع بنكي
 */
function addDeposit(array $data): array {
    $conn = db();
    ensureBankDepositsTable();

    $accountId       = (int)($data['account_id']       ?? 0);
    $amount          = (float)($data['amount']         ?? 0);
    $depositDate     = $conn->real_escape_string($data['deposit_date']     ?? date('Y-m-d'));
    $depositType     = $conn->real_escape_string($data['deposit_type']     ?? 'إيداع');
    $referenceNumber = $conn->real_escape_string($data['reference_number'] ?? '');
    $depositorName   = $conn->real_escape_string($data['depositor_name']   ?? '');
    $notes           = $conn->real_escape_string($data['notes']            ?? '');
    $createdBy       = (int)($_SESSION['user_id']       ?? 1);

    if ($accountId <= 0 || $amount <= 0) {
        return ['success' => false, 'message' => 'الحساب والمبلغ مطلوبان'];
    }

    $sql = "INSERT INTO bank_deposits
                (account_id, amount, deposit_date, deposit_type,
                 reference_number, depositor_name, notes, status, created_by)
            VALUES
                ($accountId, $amount, '$depositDate', '$depositType',
                 '$referenceNumber', '$depositorName', '$notes', 'معلق', $createdBy)";

    if (!$conn->query($sql)) {
        return ['success' => false, 'message' => $conn->error];
    }
    return ['success' => true, 'id' => $conn->insert_id, 'message' => 'تم إضافة الإيداع بنجاح'];
}

/**
 * تأكيد وديعة بنكية وتحديث رصيد الحساب
 */
function confirmDeposit(int $id): array {
    $conn      = db();
    $id        = (int)$id;
    $confirmedBy = (int)($_SESSION['user_id'] ?? 1);

    ensureBankDepositsTable();

    $result = $conn->query("SELECT * FROM bank_deposits WHERE id = $id LIMIT 1");
    if (!$result || $result->num_rows === 0) {
        return ['success' => false, 'message' => 'الإيداع غير موجود'];
    }
    $deposit = $result->fetch_assoc();

    if ($deposit['status'] === 'مؤكد') {
        return ['success' => false, 'message' => 'الإيداع مؤكد مسبقاً'];
    }

    // تأكيد الوديعة
    $conn->query("UPDATE bank_deposits
                  SET status = 'مؤكد', confirmed_by = $confirmedBy, confirmed_at = NOW()
                  WHERE id = $id");

    // تحديث رصيد الحساب
    $conn->query("UPDATE bank_accounts
                  SET current_balance = current_balance + {$deposit['amount']}
                  WHERE id = {$deposit['account_id']}");

    return ['success' => true, 'message' => 'تم تأكيد الإيداع وتحديث الرصيد'];
}

// ═══════════════════════════════════════════════════════════════
// ④ الودائع الشهرية المجدولة (monthly_deposit_schedule)
// ═══════════════════════════════════════════════════════════════

/**
 * جلب ودائع الشهر الحالي أو فلتر بالشهر
 */
function getMonthlyDeposits(?string $month = null): array {
    $conn = db();
    ensureMonthlyDepositsTable();

    $monthFilter = $month
        ? "WHERE DATE_FORMAT(m.scheduled_date, '%Y-%m') = '" . $conn->real_escape_string($month) . "'"
        : "WHERE DATE_FORMAT(m.scheduled_date, '%Y-%m') = DATE_FORMAT(NOW(), '%Y-%m')";

    $sql = "SELECT
                m.*,
                a.account_name,
                a.bank_name,
                e.name AS confirmed_by_name
            FROM monthly_deposit_schedule m
            LEFT JOIN bank_accounts a ON m.account_id = a.id
            LEFT JOIN employees e     ON m.confirmed_by = e.id
            $monthFilter
            ORDER BY m.scheduled_date ASC, m.id ASC";

    $result   = $conn->query($sql);
    $deposits = [];
    if ($result && $result->num_rows > 0)
        while ($row = $result->fetch_assoc()) $deposits[] = $row;
    return $deposits;
}

/**
 * إضافة وديعة شهرية مجدولة
 */
function addMonthlyDeposit(array $data): array {
    $conn = db();
    ensureMonthlyDepositsTable();

    $accountId     = (int)($data['account_id']     ?? 0);
    $amount        = (float)($data['amount']       ?? 0);
    $scheduledDate = $conn->real_escape_string($data['scheduled_date'] ?? date('Y-m-01'));
    $depositDay    = (int)($data['deposit_day']    ?? 1);
    $notes         = $conn->real_escape_string($data['notes']          ?? '');
    $createdBy     = (int)($_SESSION['user_id']    ?? 1);

    if ($accountId <= 0 || $amount <= 0) {
        return ['success' => false, 'message' => 'الحساب والمبلغ مطلوبان'];
    }

    $sql = "INSERT INTO monthly_deposit_schedule
                (account_id, amount, scheduled_date, deposit_day, notes, status, created_by)
            VALUES
                ($accountId, $amount, '$scheduledDate', $depositDay, '$notes', 'مجدول', $createdBy)";

    if (!$conn->query($sql)) {
        return ['success' => false, 'message' => $conn->error];
    }
    return ['success' => true, 'id' => $conn->insert_id, 'message' => 'تمت جدولة الوديعة الشهرية'];
}

/**
 * تأكيد وديعة شهرية وإضافتها إلى bank_deposits
 */
function confirmMonthlyDeposit(int $id): array {
    $conn        = db();
    $id          = (int)$id;
    $confirmedBy = (int)($_SESSION['user_id'] ?? 1);

    ensureMonthlyDepositsTable();

    $result = $conn->query("SELECT * FROM monthly_deposit_schedule WHERE id = $id LIMIT 1");
    if (!$result || $result->num_rows === 0) {
        return ['success' => false, 'message' => 'الوديعة الشهرية غير موجودة'];
    }
    $deposit = $result->fetch_assoc();

    if ($deposit['status'] === 'مؤكد') {
        return ['success' => false, 'message' => 'الوديعة مؤكدة مسبقاً'];
    }

    // تأكيد الجدولة
    $conn->query("UPDATE monthly_deposit_schedule
                  SET status = 'مؤكد', confirmed_by = $confirmedBy, confirmed_at = NOW()
                  WHERE id = $id");

    // إضافة إيداع فعلي في bank_deposits وتحديث الرصيد
    $addResult = addDeposit([
        'account_id'   => $deposit['account_id'],
        'amount'       => $deposit['amount'],
        'deposit_date' => $deposit['scheduled_date'],
        'deposit_type' => 'وديعة شهرية',
        'notes'        => $deposit['notes'] ?? '',
    ]);

    if ($addResult['success']) {
        $depositId = $addResult['id'];
        confirmDeposit($depositId);
    }

    return ['success' => true, 'message' => 'تم تأكيد الوديعة الشهرية وتحديث الرصيد'];
}

/**
 * حذف وديعة شهرية مجدولة (فقط إن لم تكن مؤكدة)
 */
function deleteMonthlyDeposit(int $id): array {
    $conn = db();
    $id   = (int)$id;
    ensureMonthlyDepositsTable();

    $result = $conn->query("SELECT status FROM monthly_deposit_schedule WHERE id = $id LIMIT 1");
    if (!$result || $result->num_rows === 0) {
        return ['success' => false, 'message' => 'الوديعة غير موجودة'];
    }
    $row = $result->fetch_assoc();
    if ($row['status'] === 'مؤكد') {
        return ['success' => false, 'message' => 'لا يمكن حذف وديعة مؤكدة'];
    }

    $conn->query("DELETE FROM monthly_deposit_schedule WHERE id = $id");
    return ['success' => true, 'message' => 'تم حذف الوديعة الشهرية'];
}


// ═══════════════════════════════════════════════════════════════
// ⑤ الإحصائيات
// ═══════════════════════════════════════════════════════════════

function getBankStats() {
    $conn         = db();
    $r1           = $conn->query("SELECT COALESCE(SUM(current_balance),0) AS total FROM bank_accounts WHERE is_active=1");
    $totalBalance = $r1->fetch_assoc()['total'];
    $r2           = $conn->query("SELECT COUNT(*) AS active,(SELECT COUNT(*) FROM bank_accounts) AS total FROM bank_accounts WHERE is_active=1");
    $accounts     = $r2->fetch_assoc();
    return [
        'total_balance'   => $totalBalance,
        'active_accounts' => $accounts['active'],
        'total_accounts'  => $accounts['total'],
    ];
}