<?php
/**
 * bank_investment_functions.php
 * دوال الودائع الاستثمارية
 *
 * المفهوم:
 *  ① يختار المستخدم حساب تشغيل ومبلغاً
 *  ② يُخصم المبلغ من رصيد الحساب ويُسجَّل كوديعة استثمارية
 *  ③ عند الاستحقاق: يُعاد المبلغ الأصلي + الربح لحساب التشغيل
 *  ④ يمكن الإلغاء المبكر (يُعاد الأصل فقط)
 *
 * الأقسام:
 * ① إنشاء / تهيئة الجداول (auto-migrate)
 * ② قراءة الودائع (قائمة / وديعة واحدة / إحصاءات)
 * ③ إنشاء وديعة جديدة
 * ④ إغلاق الوديعة عند الاستحقاق
 * ⑤ إلغاء الوديعة قبل الاستحقاق
 * ⑥ سجل الحركات
 * ⑦ دوال مساعدة
 */


// ═══════════════════════════════════════════════════════════════
// ① إنشاء / تهيئة الجداول (auto-migrate)
// ═══════════════════════════════════════════════════════════════

function ensureInvestmentTables() {
    $conn = db();

    // إضافة الأعمدة الناقصة في bank_deposits_investment
    $columns = [
        'account_id'        => 'INT(11) DEFAULT NULL AFTER id',
        'deposit_name'      => 'VARCHAR(200) DEFAULT NULL AFTER account_id',
        'matured_at'        => 'DATETIME DEFAULT NULL',
        'matured_by'        => 'INT(11) DEFAULT NULL',
        'return_account_id' => 'INT(11) DEFAULT NULL',
        'created_by'        => 'INT(11) DEFAULT NULL',
    ];

    foreach ($columns as $col => $definition) {
        $check = $conn->query("SHOW COLUMNS FROM bank_deposits_investment LIKE '$col'");
        if ($check && $check->num_rows === 0) {
            $conn->query("ALTER TABLE bank_deposits_investment ADD COLUMN $col $definition");
        }
    }

    // جدول سجل الحركات
    $conn->query("CREATE TABLE IF NOT EXISTS investment_transactions (
        id               INT(11)       NOT NULL AUTO_INCREMENT,
        investment_id    INT(11)       NOT NULL,
        transaction_type ENUM('ربط_وديعة','إعادة_أصل','إضافة_ربح','إلغاء') NOT NULL,
        account_id       INT(11)       DEFAULT NULL,
        amount           DECIMAL(15,2) NOT NULL DEFAULT 0.00,
        notes            TEXT          DEFAULT NULL,
        created_by       INT(11)       DEFAULT NULL,
        created_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_investment_id (investment_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}


// ═══════════════════════════════════════════════════════════════
// ② قراءة الودائع
// ═══════════════════════════════════════════════════════════════

/**
 * جلب جميع الودائع الاستثمارية مع تفاصيل الحسابات
 */
function getAllInvestments($statusFilter = null) {
    $conn = db();
    ensureInvestmentTables();

    $where = '';
    if ($statusFilter) {
        $sf    = $conn->real_escape_string($statusFilter);
        $where = "WHERE i.status = '$sf'";
    }

    $sql = "SELECT
                i.*,
                a.account_name,
                a.bank_name,
                a.account_number,
                a.currency,
                ra.account_name AS return_account_name,
                ra.bank_name    AS return_bank_name,
                DATEDIFF(i.maturity_date, CURDATE())                                                              AS days_remaining,
                DATEDIFF(CURDATE(), i.start_date)                                                                 AS days_elapsed,
                ROUND(GREATEST(0, LEAST(100, DATEDIFF(CURDATE(), i.start_date) / i.days * 100)), 1)               AS completion_pct,
                ROUND(i.amount * i.interest_rate / 100 * LEAST(DATEDIFF(CURDATE(), i.start_date), i.days) / 360, 2) AS accrued_profit,
                CASE
                    WHEN i.status != 'نشط'                        THEN i.status
                    WHEN CURDATE() > i.maturity_date               THEN 'مستحق'
                    WHEN DATEDIFF(i.maturity_date, CURDATE()) <= 3 THEN 'قريب_الاستحقاق'
                    ELSE 'جارٍ'
                END AS maturity_status
            FROM bank_deposits_investment i
            LEFT JOIN bank_accounts a  ON i.account_id        = a.id
            LEFT JOIN bank_accounts ra ON i.return_account_id = ra.id
            $where
            ORDER BY
                CASE WHEN i.status = 'نشط' AND CURDATE() > i.maturity_date THEN 0 ELSE 1 END,
                i.maturity_date ASC";

    $result      = $conn->query($sql);
    $investments = [];
    if ($result && $result->num_rows > 0) {
        while ($row = $result->fetch_assoc()) $investments[] = $row;
    }
    return $investments;
}

/**
 * جلب وديعة واحدة بالتفصيل
 */
function getInvestment($id) {
    $conn = db();
    $id   = (int)$id;

    $sql = "SELECT
                i.*,
                a.account_name, a.bank_name, a.account_number, a.currency, a.current_balance,
                ra.account_name AS return_account_name,
                ra.bank_name    AS return_bank_name,
                DATEDIFF(i.maturity_date, CURDATE())  AS days_remaining,
                DATEDIFF(CURDATE(), i.start_date)     AS days_elapsed,
                ROUND(i.amount * i.interest_rate / 100 * LEAST(DATEDIFF(CURDATE(), i.start_date), i.days) / 360, 2) AS accrued_profit
            FROM bank_deposits_investment i
            LEFT JOIN bank_accounts a  ON i.account_id        = a.id
            LEFT JOIN bank_accounts ra ON i.return_account_id = ra.id
            WHERE i.id = $id";

    $result = $conn->query($sql);
    return ($result && $result->num_rows > 0) ? $result->fetch_assoc() : null;
}

/**
 * إحصائيات الودائع الاستثمارية
 */
function getInvestmentStats() {
    $conn = db();
    ensureInvestmentTables();

    $sql = "SELECT
                COUNT(*)                                                                            AS total_count,
                SUM(CASE WHEN status = 'نشط' THEN 1 ELSE 0 END)                                    AS active_count,
                COALESCE(SUM(CASE WHEN status = 'نشط' THEN amount ELSE 0 END), 0)                  AS total_invested,
                COALESCE(SUM(CASE WHEN status = 'نشط'
                    THEN ROUND(amount * interest_rate / 100 * LEAST(DATEDIFF(CURDATE(), start_date), days) / 360, 2)
                    ELSE 0 END), 0)                                                                 AS total_accrued_profit,
                COALESCE(SUM(CASE WHEN status = 'نشط' THEN expected_profit ELSE 0 END), 0)         AS total_expected_profit,
                COUNT(CASE WHEN status = 'نشط' AND CURDATE() > maturity_date THEN 1 END)           AS overdue_count,
                COUNT(CASE WHEN status = 'نشط' AND DATEDIFF(maturity_date, CURDATE()) <= 3
                    AND CURDATE() <= maturity_date THEN 1 END)                                      AS expiring_soon
            FROM bank_deposits_investment";

    $result = $conn->query($sql);
    return ($result && $result->num_rows > 0)
        ? $result->fetch_assoc()
        : ['total_count'=>0,'active_count'=>0,'total_invested'=>0,
           'total_accrued_profit'=>0,'total_expected_profit'=>0,
           'overdue_count'=>0,'expiring_soon'=>0];
}


// ═══════════════════════════════════════════════════════════════
// ③ إنشاء وديعة جديدة
// ═══════════════════════════════════════════════════════════════

/**
 * ربط وديعة استثمارية جديدة
 *
 *  ① التحقق من كفاية رصيد الحساب
 *  ② خصم المبلغ من رصيد حساب التشغيل
 *  ③ تسجيل الوديعة في bank_deposits_investment
 *  ④ تسجيل الحركة في investment_transactions
 */
function createInvestment($data) {
    $conn = db();
    ensureInvestmentTables();

    $accountId       = (int)($data['account_id']      ?? 0);
    $rawReturn       = $data['return_account_id']      ?? null;
    $returnAccountId = (!empty($rawReturn) && (int)$rawReturn > 0) ? (int)$rawReturn : $accountId;
    $depositName     = $conn->real_escape_string(trim($data['deposit_name']     ?? ''));
    $referenceNumber = $conn->real_escape_string(trim($data['reference_number'] ?? generateInvestmentNumber()));
    $amount          = (float)($data['amount']       ?? 0);
    $interestRate    = (float)($data['interest_rate'] ?? 0);
    $days            = (int)($data['days']           ?? 0);
    $startDate       = $conn->real_escape_string($data['start_date'] ?? date('Y-m-d'));
    $maturityDate    = $conn->real_escape_string($data['maturity_date'] ?? date('Y-m-d', strtotime("+{$days} days")));
    $notes           = $conn->real_escape_string($data['notes'] ?? '');
    $createdBy       = (int)($_SESSION['user_id'] ?? 0);

    if ($accountId <= 0)  return ['success' => false, 'message' => 'الحساب البنكي مطلوب'];
    if ($amount   <= 0)   return ['success' => false, 'message' => 'المبلغ يجب أن يكون أكبر من صفر'];
    if ($days     <= 0)   return ['success' => false, 'message' => 'مدة الوديعة مطلوبة'];

    // التحقق من رصيد الحساب
    $accResult = $conn->query("SELECT current_balance, account_name FROM bank_accounts WHERE id = $accountId");
    if (!$accResult || $accResult->num_rows === 0) {
        return ['success' => false, 'message' => 'الحساب البنكي غير موجود'];
    }
    $account = $accResult->fetch_assoc();
    if ((float)$account['current_balance'] < $amount) {
        return ['success' => false,
                'message' => "رصيد الحساب غير كافٍ. المتاح: " . number_format($account['current_balance'], 2)];
    }

  // بعد التعديل ✅
$expectedProfit = round($amount * $interestRate / 100 * $days / 360, 2);

// إدراج الوديعة — بدون expected_profit لأنه GENERATED COLUMN (MySQL يحسبه تلقائياً)
$conn->query("INSERT INTO bank_deposits_investment
                (account_id, return_account_id, deposit_name, reference_number,
                 amount, interest_rate, days, start_date, maturity_date,
                 notes, status, created_by)
              VALUES
                ($accountId, $returnAccountId, '$depositName', '$referenceNumber',
                 $amount, $interestRate, $days, '$startDate', '$maturityDate',
                 '$notes', 'نشط', $createdBy)");

    $investmentId = $conn->insert_id;

    // خصم المبلغ من الحساب
    $newBalance = (float)$account['current_balance'] - $amount;
    $conn->query("UPDATE bank_accounts SET current_balance = $newBalance WHERE id = $accountId");

    // تسجيل الحركة
    $accName = $conn->real_escape_string($account['account_name']);
    $conn->query("INSERT INTO investment_transactions
                    (investment_id, transaction_type, account_id, amount, notes, created_by)
                  VALUES
                    ($investmentId, 'ربط_وديعة', $accountId, $amount,
                     'خصم مبلغ الوديعة من حساب $accName', $createdBy)");

    return [
        'success'         => true,
        'id'              => $investmentId,
        'reference_number'=> $referenceNumber,
        'expected_profit' => $expectedProfit,
        'message'         => 'تم ربط الوديعة وخصم المبلغ من الحساب بنجاح',
    ];
}


// ═══════════════════════════════════════════════════════════════
// ④ إغلاق الوديعة عند الاستحقاق
// ═══════════════════════════════════════════════════════════════

/**
 * إغلاق الوديعة وإعادة المبلغ + الربح للحساب
 *
 *  ① قراءة المبلغ الأصلي والربح الفعلي
 *  ② إضافة (الأصل + الربح) لحساب العودة
 *  ③ تحديث حالة الوديعة إلى 'منتهي'
 *  ④ تسجيل حركتَي الإعادة في investment_transactions
 */
function matureInvestment($id, $actualProfit = null) {
    $conn     = db();
    $id       = (int)$id;
    $closedBy = (int)($_SESSION['user_id'] ?? 0);
    $now      = date('Y-m-d H:i:s');

    $inv = getInvestment($id);
    if (!$inv) return ['success' => false, 'message' => 'الوديعة غير موجودة'];
    if ($inv['status'] !== 'نشط') return ['success' => false, 'message' => 'الوديعة ليست نشطة'];

    $principal       = (float)$inv['amount'];
    $rawReturnId     = (int)($inv['return_account_id'] ?? 0);
    $returnAccountId = ($rawReturnId > 0) ? $rawReturnId : (int)$inv['account_id'];
    $profit          = ($actualProfit !== null && $actualProfit !== '') ? (float)$actualProfit : (float)$inv['expected_profit'];

    if ($returnAccountId <= 0) {
        return ['success' => false, 'message' => 'هذه الوديعة غير مرتبطة بحساب بنكي — يرجى تحديث الوديعة وربطها بحساب'];
    }

    $accResult = $conn->query("SELECT current_balance, account_name FROM bank_accounts WHERE id = $returnAccountId");
    if (!$accResult || $accResult->num_rows === 0) {
        return ['success' => false, 'message' => "الحساب البنكي المرتبط (id={$returnAccountId}) غير موجود في النظام"];
    }
    $returnAccount = $accResult->fetch_assoc();

    // إضافة الأصل + الربح للحساب
    $totalReturn = $principal + $profit;
    $newBalance  = (float)$returnAccount['current_balance'] + $totalReturn;
    $conn->query("UPDATE bank_accounts SET current_balance = $newBalance WHERE id = $returnAccountId");

    // تحديث الوديعة
    $profitEsc = number_format($profit, 2, '.', '');
    $conn->query("UPDATE bank_deposits_investment
                  SET status        = 'منتهي',
                      actual_profit = $profitEsc,
                      matured_at    = '$now',
                      matured_by    = $closedBy
                  WHERE id = $id");

    // تسجيل الحركات
    $accName = $conn->real_escape_string($returnAccount['account_name']);
    $conn->query("INSERT INTO investment_transactions
                    (investment_id, transaction_type, account_id, amount, notes, created_by)
                  VALUES
                    ($id, 'إعادة_أصل', $returnAccountId, $principal,
                     'إعادة أصل الوديعة لحساب $accName', $closedBy)");

    if ($profit > 0) {
        $conn->query("INSERT INTO investment_transactions
                        (investment_id, transaction_type, account_id, amount, notes, created_by)
                      VALUES
                        ($id, 'إضافة_ربح', $returnAccountId, $profit,
                         'إضافة ربح الوديعة لحساب $accName', $closedBy)");
    }

    return [
        'success'        => true,
        'principal'      => $principal,
        'profit'         => $profit,
        'total_returned' => $totalReturn,
        'new_balance'    => $newBalance,
        'message'        => "تم إغلاق الوديعة بنجاح. أُعيد " .
                            number_format($totalReturn, 2) . " ريال لحساب {$returnAccount['account_name']}",
    ];
}


// ═══════════════════════════════════════════════════════════════
// ⑤ إلغاء الوديعة قبل الاستحقاق
// ═══════════════════════════════════════════════════════════════

/**
 * إلغاء وديعة مبكراً (يُعاد الأصل فقط بدون ربح)
 */
function cancelInvestment($id, $notes = '') {
    $conn       = db();
    $id         = (int)$id;
    $canceledBy = (int)($_SESSION['user_id'] ?? 0);
    $now        = date('Y-m-d H:i:s');
    $notesEsc   = $conn->real_escape_string($notes);

    $inv = getInvestment($id);
    if (!$inv) return ['success' => false, 'message' => 'الوديعة غير موجودة'];
    if ($inv['status'] !== 'نشط') return ['success' => false, 'message' => 'الوديعة ليست نشطة'];

    $principal       = (float)$inv['amount'];
    $rawReturnId     = (int)($inv['return_account_id'] ?? 0);
    $returnAccountId = ($rawReturnId > 0) ? $rawReturnId : (int)$inv['account_id'];

    if ($returnAccountId <= 0) {
        return ['success' => false, 'message' => 'هذه الوديعة غير مرتبطة بحساب بنكي — يرجى تحديث الوديعة وربطها بحساب'];
    }

    $accResult = $conn->query("SELECT current_balance, account_name FROM bank_accounts WHERE id = $returnAccountId");
    if (!$accResult || $accResult->num_rows === 0) {
        return ['success' => false, 'message' => "الحساب البنكي المرتبط (id={$returnAccountId}) غير موجود في النظام"];
    }
    $returnAccount = $accResult->fetch_assoc();

    // إعادة الأصل فقط
    $newBalance = (float)$returnAccount['current_balance'] + $principal;
    $conn->query("UPDATE bank_accounts SET current_balance = $newBalance WHERE id = $returnAccountId");

    // تحديث الوديعة
    $conn->query("UPDATE bank_deposits_investment
                  SET status        = 'ملغي',
                      actual_profit = 0,
                      matured_at    = '$now',
                      matured_by    = $canceledBy
                  WHERE id = $id");

    // تسجيل الحركة
    $accName = $conn->real_escape_string($returnAccount['account_name']);
    $conn->query("INSERT INTO investment_transactions
                    (investment_id, transaction_type, account_id, amount, notes, created_by)
                  VALUES
                    ($id, 'إلغاء', $returnAccountId, $principal,
                     'إلغاء مبكر — إعادة الأصل فقط لحساب $accName. $notesEsc', $canceledBy)");

    return [
        'success'   => true,
        'principal' => $principal,
        'message'   => "تم إلغاء الوديعة. أُعيد " . number_format($principal, 2) . " ريال لحساب {$returnAccount['account_name']}",
    ];
}


// ═══════════════════════════════════════════════════════════════
// ⑥ سجل الحركات
// ═══════════════════════════════════════════════════════════════

/**
 * جلب سجل حركات وديعة معينة
 */
function getInvestmentTransactions($investmentId) {
    $conn         = db();
    $investmentId = (int)$investmentId;

    $sql = "SELECT it.*, a.account_name, a.bank_name
            FROM investment_transactions it
            LEFT JOIN bank_accounts a ON it.account_id = a.id
            WHERE it.investment_id = $investmentId
            ORDER BY it.created_at ASC";

    $result = $conn->query($sql);
    $rows   = [];
    if ($result) {
        while ($row = $result->fetch_assoc()) $rows[] = $row;
    }
    return $rows;
}


// ═══════════════════════════════════════════════════════════════
// ⑦ دوال مساعدة
// ═══════════════════════════════════════════════════════════════

/**
 * توليد رقم مرجعي فريد للوديعة الاستثمارية
 */
function generateInvestmentNumber() {
    $conn   = db();
    $prefix = 'INV-' . date('Ymd') . '-';
    $result = $conn->query("SELECT COUNT(*) AS c FROM bank_deposits_investment WHERE reference_number LIKE '$prefix%'");
    $count  = ($result ? (int)$result->fetch_assoc()['c'] : 0) + 1;
    return $prefix . str_pad($count, 4, '0', STR_PAD_LEFT);
}