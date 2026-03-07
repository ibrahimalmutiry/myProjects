<?php
/**
 * bank_functions.php
 * دوال الودائع البنكية والأرصدة والحسابات
 *
 * الأقسام:
 * ① الحسابات البنكية (قراءة / إضافة / تعديل / تحديث الرصيد)
 * ② الودائع البنكية (قراءة / إضافة / تأكيد / توليد رقم)
 * ③ الأرصدة اليومية (قراءة / تسجيل)
 * ④ دوال مساعدة للودائع والسحوبات اليومية
 * ⑤ الإحصائيات
 */


// ═══════════════════════════════════════════════════════════════
// ① الحسابات البنكية
// ═══════════════════════════════════════════════════════════════

/**
 * الحصول على جميع الحسابات البنكية
 */
function getAllBankAccounts($activeOnly = false) {
    $conn = db();

    $sql = "SELECT * FROM bank_accounts";
    if ($activeOnly) $sql .= " WHERE is_active = 1";
    $sql .= " ORDER BY id DESC";

    $result   = $conn->query($sql);
    $accounts = [];
    if ($result && $result->num_rows > 0) {
        while ($row = $result->fetch_assoc()) $accounts[] = $row;
    }
    return $accounts;
}

/**
 * الحصول على حساب بنكي واحد
 */
function getBankAccount($id) {
    $conn = db();
    $id   = (int)$id;

    $result = $conn->query("SELECT * FROM bank_accounts WHERE id = $id");
    return ($result && $result->num_rows > 0) ? $result->fetch_assoc() : null;
}

/**
 * إضافة حساب بنكي جديد
 */
function addBankAccount($data) {
    $conn = db();

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

    if ($conn->query($sql)) {
        return ['success' => true, 'id' => $conn->insert_id];
    }
    return ['success' => false, 'message' => $conn->error];
}

/**
 * تحديث بيانات حساب بنكي
 */
function updateBankAccount($id, $data) {
    $conn = db();
    $id   = (int)$id;
    if ($id <= 0) return ['success' => false, 'message' => 'معرف الحساب غير صالح'];

    $accountName = $conn->real_escape_string(trim($data['account_name']   ?? ''));
    $accountNum  = $conn->real_escape_string(trim($data['account_number'] ?? ''));
    $bankName    = $conn->real_escape_string(trim($data['bank_name']      ?? ''));
    $accountType = $conn->real_escape_string($data['account_type']        ?? 'جاري');
    $iban        = $conn->real_escape_string(trim($data['iban']           ?? ''));
    $isActive    = (int)($data['is_active'] ?? 1);

    if (empty($accountName) || empty($bankName)) {
        return ['success' => false, 'message' => 'اسم الحساب والبنك مطلوبان'];
    }

    $sql = "UPDATE bank_accounts SET
                account_name   = '$accountName',
                account_number = '$accountNum',
                bank_name      = '$bankName',
                account_type   = '$accountType',
                iban           = '$iban',
                is_active      = $isActive
            WHERE id = $id";

    if ($conn->query($sql)) {
        return ['success' => true, 'message' => 'تم تحديث الحساب بنجاح'];
    }
    return ['success' => false, 'message' => $conn->error];
}

/**
 * تحديث الرصيد الحالي لحساب بنكي
 */
function updateAccountBalance($accountId, $newBalance) {
    $conn       = db();
    $accountId  = (int)$accountId;
    $newBalance = (float)$newBalance;

    return $conn->query("UPDATE bank_accounts SET current_balance = $newBalance WHERE id = $accountId");
}


// ═══════════════════════════════════════════════════════════════
// ② الودائع البنكية
// ═══════════════════════════════════════════════════════════════

/**
 * الحصول على جميع الودائع
 */
function getAllDeposits($limit = null) {
    $conn = db();

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
    if ($result && $result->num_rows > 0) {
        while ($row = $result->fetch_assoc()) $deposits[] = $row;
    }
    return $deposits;
}

/**
 * إضافة إيداع بنكي
 */
function addDeposit($data) {
    $conn = db();

    $accountId       = (int)$data['account_id'];
    $amount          = (float)$data['amount'];
    $depositDate     = $conn->real_escape_string($data['deposit_date']);
    $depositType     = $conn->real_escape_string($data['deposit_type']);
    $referenceNumber = $conn->real_escape_string($data['reference_number'] ?? '');
    $depositorName   = $conn->real_escape_string($data['depositor_name']   ?? '');
    $notes           = $conn->real_escape_string($data['notes']            ?? '');
    $createdBy       = $_SESSION['user_id'] ?? 1;
    $depositNumber   = generateDepositNumber();

    $sql = "INSERT INTO bank_deposits (
                deposit_number, account_id, deposit_date, amount,
                deposit_type, reference_number, depositor_name, notes,
                status, created_by
            ) VALUES (
                '$depositNumber', $accountId, '$depositDate', $amount,
                '$depositType', '$referenceNumber', '$depositorName', '$notes',
                'معلق', $createdBy
            )";

    if ($conn->query($sql)) {
        return ['success' => true, 'id' => $conn->insert_id, 'deposit_number' => $depositNumber];
    }
    return ['success' => false, 'message' => $conn->error];
}

/**
 * تأكيد الإيداع وتحديث رصيد الحساب
 */
function confirmDeposit($id) {
    $conn        = db();
    $id          = (int)$id;
    $confirmedBy = $_SESSION['user_id'] ?? 1;

    $result = $conn->query("SELECT * FROM bank_deposits WHERE id = $id");
    if (!$result || $result->num_rows === 0) {
        return ['success' => false, 'message' => 'الإيداع غير موجود'];
    }

    $deposit = $result->fetch_assoc();
    if ($deposit['status'] === 'تم التأكيد') {
        return ['success' => false, 'message' => 'الإيداع مؤكد مسبقاً'];
    }

    $accountResult = $conn->query("SELECT current_balance FROM bank_accounts WHERE id = " . (int)$deposit['account_id']);
    if (!$accountResult || $accountResult->num_rows === 0) {
        return ['success' => false, 'message' => 'الحساب البنكي غير موجود'];
    }
    $account = $accountResult->fetch_assoc();

    $sql = "UPDATE bank_deposits SET
                status       = 'تم التأكيد',
                confirmed_by = $confirmedBy,
                confirmed_at = NOW()
            WHERE id = $id";

    if ($conn->query($sql)) {
        $newBalance = (float)$account['current_balance'] + (float)$deposit['amount'];
        updateAccountBalance($deposit['account_id'], $newBalance);
        return ['success' => true];
    }
    return ['success' => false, 'message' => $conn->error];
}

/**
 * توليد رقم إيداع فريد
 */
function generateDepositNumber() {
    $conn   = db();
    $prefix = getSetting('prefix_deposit', 'DEP') . '-';
    $date   = date('Ymd');

    $result = $conn->query("SELECT COUNT(*) AS count FROM bank_deposits WHERE deposit_number LIKE '$prefix$date%'");
    $count  = $result->fetch_assoc()['count'] + 1;

    return $prefix . $date . '-' . str_pad($count, 4, '0', STR_PAD_LEFT);
}


// ═══════════════════════════════════════════════════════════════
// ③ الأرصدة اليومية
// ═══════════════════════════════════════════════════════════════

/**
 * الحصول على الأرصدة اليومية
 */
function getDailyBalances($limit = 30, $accountId = null) {
    $conn  = db();
    $where = $accountId ? "WHERE db.account_id = " . (int)$accountId : "";

    $sql = "SELECT
                db.*,
                a.account_name,
                a.bank_name
            FROM daily_balances db
            LEFT JOIN bank_accounts a ON db.account_id = a.id
            $where
            ORDER BY db.balance_date DESC, db.id DESC
            LIMIT " . (int)$limit;

    $result   = $conn->query($sql);
    $balances = [];
    if ($result && $result->num_rows > 0) {
        while ($row = $result->fetch_assoc()) $balances[] = $row;
    }
    return $balances;
}

/**
 * تسجيل رصيد يومي
 */
function recordDailyBalance($data) {
    $conn = db();

    $accountId      = (int)$data['account_id'];
    $balanceDate    = $conn->real_escape_string($data['balance_date']);
    $openingBalance = (float)$data['opening_balance'];
    $closingBalance = (float)$data['closing_balance'];
    $notes          = $conn->real_escape_string($data['notes'] ?? '');
    $recordedBy     = $_SESSION['user_id'] ?? 1;

    $deposits    = getTotalDepositsForDate($accountId, $balanceDate);
    $withdrawals = getTotalWithdrawalsForDate($accountId, $balanceDate);

    $sql = "INSERT INTO daily_balances (
                account_id, balance_date, opening_balance, closing_balance,
                total_deposits, total_withdrawals, notes, recorded_by
            ) VALUES (
                $accountId, '$balanceDate', $openingBalance, $closingBalance,
                $deposits, $withdrawals, '$notes', $recordedBy
            ) ON DUPLICATE KEY UPDATE
                opening_balance  = $openingBalance,
                closing_balance  = $closingBalance,
                total_deposits   = $deposits,
                total_withdrawals = $withdrawals,
                notes = '$notes'";

    if (!$conn->query($sql)) {
        return ['success' => false, 'message' => $conn->error];
    }

    // تحديث الرصيد الحالي في bank_accounts إذا طُلب ذلك
    $updateCurrent = ($data['update_current'] ?? '0') === '1';
    if ($updateCurrent && $accountId > 0) {
        $conn->query("UPDATE bank_accounts SET current_balance = $closingBalance WHERE id = $accountId");
    }

    return ['success' => true, 'message' => 'تم تسجيل الرصيد بنجاح'];
}


// ═══════════════════════════════════════════════════════════════
// ④ دوال مساعدة للودائع والسحوبات اليومية
// ═══════════════════════════════════════════════════════════════

/**
 * إجمالي الودائع المؤكدة لتاريخ ومعرف حساب محددَين
 */
function getTotalDepositsForDate($accountId, $date) {
    $conn      = db();
    $accountId = (int)$accountId;
    $date      = $conn->real_escape_string($date);

    $result = $conn->query("SELECT COALESCE(SUM(amount), 0) AS total
                            FROM bank_deposits
                            WHERE account_id  = $accountId
                              AND deposit_date = '$date'
                              AND status       = 'تم التأكيد'");
    return (float)$result->fetch_assoc()['total'];
}

/**
 * إجمالي السحوبات المؤكدة لتاريخ ومعرف حساب محددَين
 */
function getTotalWithdrawalsForDate($accountId, $date) {
    $conn      = db();
    $accountId = (int)$accountId;
    $date      = $conn->real_escape_string($date);

    $result = $conn->query("SELECT COALESCE(SUM(amount), 0) AS total
                            FROM bank_withdrawals
                            WHERE account_id      = $accountId
                              AND withdrawal_date  = '$date'
                              AND status           = 'تم التأكيد'");
    return (float)$result->fetch_assoc()['total'];
}


// ═══════════════════════════════════════════════════════════════
// ⑤ الإحصائيات
// ═══════════════════════════════════════════════════════════════

/**
 * الحصول على إحصائيات البنوك
 */
function getBankStats() {
    $conn  = db();
    $today = date('Y-m-d');

    // إجمالي الأرصدة النشطة
    $result      = $conn->query("SELECT COALESCE(SUM(current_balance), 0) AS total FROM bank_accounts WHERE is_active = 1");
    $totalBalance = $result->fetch_assoc()['total'];

    // الودائع اليوم
    $result       = $conn->query("SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total
                                  FROM bank_deposits WHERE deposit_date = '$today'");
    $depositsToday = $result->fetch_assoc();

    // السحوبات اليوم
    $result           = $conn->query("SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total
                                      FROM bank_withdrawals WHERE withdrawal_date = '$today'");
    $withdrawalsToday = $result->fetch_assoc();

    // عدد الحسابات
    $result   = $conn->query("SELECT COUNT(*) AS active,
                               (SELECT COUNT(*) FROM bank_accounts) AS total
                               FROM bank_accounts WHERE is_active = 1");
    $accounts = $result->fetch_assoc();

    return [
        'total_balance'           => $totalBalance,
        'today_deposits_count'    => $depositsToday['count'],
        'today_deposits_amount'   => $depositsToday['total'],
        'today_withdrawals_count' => $withdrawalsToday['count'],
        'today_withdrawals_amount'=> $withdrawalsToday['total'],
        'active_accounts'         => $accounts['active'],
        'total_accounts'          => $accounts['total'],
    ];
}