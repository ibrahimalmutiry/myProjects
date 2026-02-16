<?php
/**
 * Bank Functions - دوال الودائع البنكية
 * Bank Deposits & Balance Tracking Functions
 */

// ========== الحسابات البنكية ==========

/**
 * الحصول على جميع الحسابات البنكية
 */
function getAllBankAccounts($activeOnly = false) {
    $conn = db();
    
    $sql = "SELECT * FROM bank_accounts";
    if ($activeOnly) {
        $sql .= " WHERE is_active = 1";
    }
    $sql .= " ORDER BY id DESC";
    
    $result = $conn->query($sql);
    
    $accounts = [];
    if ($result && $result->num_rows > 0) {
        while ($row = $result->fetch_assoc()) {
            $accounts[] = $row;
        }
    }
    
    return $accounts;
}

/**
 * الحصول على حساب بنكي واحد
 */
function getBankAccount($id) {
    $conn = db();
    $id = (int)$id;
    
    $sql = "SELECT * FROM bank_accounts WHERE id = $id";
    $result = $conn->query($sql);
    
    if ($result && $result->num_rows > 0) {
        return $result->fetch_assoc();
    }
    
    return null;
}

/**
 * إضافة حساب بنكي جديد
 */
function addBankAccount($data) {
    $conn = db();
    
    $accountNumber = $conn->real_escape_string($data['account_number']);
    $accountName = $conn->real_escape_string($data['account_name']);
    $bankName = $conn->real_escape_string($data['bank_name']);
    $bankBranch = $conn->real_escape_string($data['bank_branch'] ?? '');
    $accountType = $conn->real_escape_string($data['account_type'] ?? 'جاري');
    $currency = $conn->real_escape_string($data['currency'] ?? 'SAR');
    $initialBalance = (float)($data['initial_balance'] ?? 0);
    $iban = $conn->real_escape_string($data['iban'] ?? '');
    $swiftCode = $conn->real_escape_string($data['swift_code'] ?? '');
    $notes = $conn->real_escape_string($data['notes'] ?? '');
    
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
 * تحديث رصيد الحساب
 */
function updateAccountBalance($accountId, $newBalance) {
    $conn = db();
    $accountId = (int)$accountId;
    $newBalance = (float)$newBalance;
    
    $sql = "UPDATE bank_accounts SET current_balance = $newBalance WHERE id = $accountId";
    
    return $conn->query($sql);
}

// ========== الودائع البنكية ==========

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
        e1.name as created_by_name,
        e2.name as confirmed_by_name
    FROM bank_deposits d
    LEFT JOIN bank_accounts a ON d.account_id = a.id
    LEFT JOIN employees e1 ON d.created_by = e1.id
    LEFT JOIN employees e2 ON d.confirmed_by = e2.id
    ORDER BY d.deposit_date DESC, d.id DESC";
    
    if ($limit) {
        $sql .= " LIMIT " . (int)$limit;
    }
    
    $result = $conn->query($sql);
    
    $deposits = [];
    if ($result && $result->num_rows > 0) {
        while ($row = $result->fetch_assoc()) {
            $deposits[] = $row;
        }
    }
    
    return $deposits;
}

/**
 * إضافة إيداع بنكي
 */
function addDeposit($data) {
    $conn = db();
    
    $accountId = (int)$data['account_id'];
    $amount = (float)$data['amount'];
    $depositDate = $conn->real_escape_string($data['deposit_date']);
    $depositType = $conn->real_escape_string($data['deposit_type']);
    $referenceNumber = $conn->real_escape_string($data['reference_number'] ?? '');
    $depositorName = $conn->real_escape_string($data['depositor_name'] ?? '');
    $notes = $conn->real_escape_string($data['notes'] ?? '');
    $createdBy = $_SESSION['user_id'] ?? 1;
    
    // توليد رقم الإيداع
    $depositNumber = generateDepositNumber();
    
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
 * تأكيد الإيداع
 */
function confirmDeposit($id) {
    $conn = db();
    $id = (int)$id;
    $confirmedBy = $_SESSION['user_id'] ?? 1;
    
    // الحصول على بيانات الإيداع
    $sql = "SELECT * FROM bank_deposits WHERE id = $id";
    $result = $conn->query($sql);
    
    if (!$result || $result->num_rows === 0) {
        return ['success' => false, 'message' => 'الإيداع غير موجود'];
    }
    
    $deposit = $result->fetch_assoc();
    
    if ($deposit['status'] === 'تم التأكيد') {
        return ['success' => false, 'message' => 'الإيداع مؤكد مسبقاً'];
    }
    
    // تحديث حالة الإيداع
    $sql = "UPDATE bank_deposits SET 
        status = 'تم التأكيد',
        confirmed_by = $confirmedBy,
        confirmed_at = NOW()
    WHERE id = $id";
    
    if ($conn->query($sql)) {
        // تحديث رصيد الحساب
        $newBalance = (float)$deposit['current_balance'] + (float)$deposit['amount'];
        updateAccountBalance($deposit['account_id'], $newBalance);
        
        return ['success' => true];
    }
    
    return ['success' => false, 'message' => $conn->error];
}

/**
 * توليد رقم إيداع
 */
function generateDepositNumber() {
    $conn = db();
    $prefix = 'DEP-';
    $date = date('Ymd');
    
    $sql = "SELECT COUNT(*) as count FROM bank_deposits WHERE deposit_number LIKE '$prefix$date%'";
    $result = $conn->query($sql);
    $row = $result->fetch_assoc();
    $count = $row['count'] + 1;
    
    return $prefix . $date . '-' . str_pad($count, 4, '0', STR_PAD_LEFT);
}



// ========== الأرصدة اليومية ==========

/**
 * الحصول على الأرصدة اليومية
 */
function getDailyBalances($limit = 30) {
    $conn = db();
    
    $sql = "SELECT 
        db.*,
        a.account_name,
        a.bank_name
    FROM daily_balances db
    LEFT JOIN bank_accounts a ON db.account_id = a.id
    ORDER BY db.balance_date DESC, db.id DESC
    LIMIT " . (int)$limit;
    
    $result = $conn->query($sql);
    
    $balances = [];
    if ($result && $result->num_rows > 0) {
        while ($row = $result->fetch_assoc()) {
            $balances[] = $row;
        }
    }
    
    return $balances;
}

/**
 * تسجيل رصيد يومي
 */
function recordDailyBalance($data) {
    $conn = db();
    
    $accountId = (int)$data['account_id'];
    $balanceDate = $conn->real_escape_string($data['balance_date']);
    $openingBalance = (float)$data['opening_balance'];
    $closingBalance = (float)$data['closing_balance'];
    $notes = $conn->real_escape_string($data['notes'] ?? '');
    $recordedBy = $_SESSION['user_id'] ?? 1;
    
    // حساب الودائع والسحوبات لهذا اليوم
    $deposits = getTotalDepositsForDate($accountId, $balanceDate);
    $withdrawals = getTotalWithdrawalsForDate($accountId, $balanceDate);
    
    $sql = "INSERT INTO daily_balances (
        account_id, balance_date, opening_balance, closing_balance,
        total_deposits, total_withdrawals, notes, recorded_by
    ) VALUES (
        $accountId, '$balanceDate', $openingBalance, $closingBalance,
        $deposits, $withdrawals, '$notes', $recordedBy
    ) ON DUPLICATE KEY UPDATE
        opening_balance = $openingBalance,
        closing_balance = $closingBalance,
        total_deposits = $deposits,
        total_withdrawals = $withdrawals,
        notes = '$notes'";
    
    if ($conn->query($sql)) {
        return ['success' => true];
    }
    
    return ['success' => false, 'message' => $conn->error];
}

/**
 * الحصول على إجمالي الودائع لتاريخ معين
 */
function getTotalDepositsForDate($accountId, $date) {
    $conn = db();
    $accountId = (int)$accountId;
    $date = $conn->real_escape_string($date);
    
    $sql = "SELECT COALESCE(SUM(amount), 0) as total 
            FROM bank_deposits 
            WHERE account_id = $accountId 
            AND deposit_date = '$date' 
            AND status = 'تم التأكيد'";
    
    $result = $conn->query($sql);
    $row = $result->fetch_assoc();
    
    return (float)$row['total'];
}

/**
 * الحصول على إجمالي السحوبات لتاريخ معين
 */
function getTotalWithdrawalsForDate($accountId, $date) {
    $conn = db();
    $accountId = (int)$accountId;
    $date = $conn->real_escape_string($date);
    
    $sql = "SELECT COALESCE(SUM(amount), 0) as total 
            FROM bank_withdrawals 
            WHERE account_id = $accountId 
            AND withdrawal_date = '$date' 
            AND status = 'تم التأكيد'";
    
    $result = $conn->query($sql);
    $row = $result->fetch_assoc();
    
    return (float)$row['total'];
}

// ========== الإحصائيات ==========

/**
 * الحصول على إحصائيات البنوك
 */
function getBankStats() {
    $conn = db();
    $today = date('Y-m-d');
    
    // إجمالي الأرصدة
    $sql = "SELECT COALESCE(SUM(current_balance), 0) as total FROM bank_accounts WHERE is_active = 1";
    $result = $conn->query($sql);
    $totalBalance = $result->fetch_assoc()['total'];
    
    // الودائع اليوم
    $sql = "SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total 
            FROM bank_deposits 
            WHERE deposit_date = '$today'";
    $result = $conn->query($sql);
    $depositsToday = $result->fetch_assoc();
    
    // السحوبات اليوم
    $sql = "SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total 
            FROM bank_withdrawals 
            WHERE withdrawal_date = '$today'";
    $result = $conn->query($sql);
    $withdrawalsToday = $result->fetch_assoc();
    
    // عدد الحسابات
    $sql = "SELECT COUNT(*) as active, 
            (SELECT COUNT(*) FROM bank_accounts) as total 
            FROM bank_accounts WHERE is_active = 1";
    $result = $conn->query($sql);
    $accounts = $result->fetch_assoc();
    
    return [
        'total_balance' => $totalBalance,
        'today_deposits_count' => $depositsToday['count'],
        'today_deposits_amount' => $depositsToday['total'],
        'today_withdrawals_count' => $withdrawalsToday['count'],
        'today_withdrawals_amount' => $withdrawalsToday['total'],
        'active_accounts' => $accounts['active'],
        'total_accounts' => $accounts['total']
    ];
}