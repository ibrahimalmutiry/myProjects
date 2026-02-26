<?php
/**
 * bank_monthly_functions.php
 * دوال الودائع الشهرية المجدولة
 *
 * الأقسام:
 * ① إنشاء الجدول (auto-migrate)
 * ② قراءة الودائع الشهرية
 * ③ إضافة وديعة شهرية
 * ④ تأكيد وديعة شهرية (يُنشئ إيداعاً فعلياً ويُحدِّث الرصيد)
 * ⑤ حذف وديعة شهرية
 * ⑥ إحصاءات الودائع الشهرية
 *
 * ─────────────────────────────────────────────────────────────
 * CREATE TABLE monthly_deposits (
 *     id              INT PRIMARY KEY AUTO_INCREMENT,
 *     deposit_name    VARCHAR(255) NOT NULL,
 *     account_id      INT NOT NULL,
 *     expected_amount DECIMAL(15,2) NOT NULL,
 *     expected_date   DATE NOT NULL,
 *     deposit_type    VARCHAR(100) DEFAULT 'أخرى',
 *     status          ENUM('قيد الانتظار','تم الإيداع','متأخر') DEFAULT 'قيد الانتظار',
 *     notes           TEXT,
 *     confirmed_at    DATETIME DEFAULT NULL,
 *     confirmed_by    INT DEFAULT NULL,
 *     created_by      INT DEFAULT NULL,
 *     created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
 *     FOREIGN KEY (account_id) REFERENCES bank_accounts(id) ON DELETE CASCADE
 * ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
 * ─────────────────────────────────────────────────────────────
 */


// ═══════════════════════════════════════════════════════════════
// ① إنشاء الجدول (auto-migrate)
// ═══════════════════════════════════════════════════════════════

/**
 * إنشاء جدول الودائع الشهرية إذا لم يكن موجوداً
 */
function ensureMonthlyDepositsTable() {
    $conn = db();
    $conn->query("CREATE TABLE IF NOT EXISTS monthly_deposits (
        id              INT PRIMARY KEY AUTO_INCREMENT,
        deposit_name    VARCHAR(255) NOT NULL,
        account_id      INT NOT NULL,
        expected_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
        expected_date   DATE NOT NULL,
        deposit_type    VARCHAR(100) DEFAULT 'أخرى',
        status          ENUM('قيد الانتظار','تم الإيداع','متأخر') DEFAULT 'قيد الانتظار',
        notes           TEXT,
        confirmed_at    DATETIME DEFAULT NULL,
        confirmed_by    INT DEFAULT NULL,
        created_by      INT DEFAULT NULL,
        created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (account_id) REFERENCES bank_accounts(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}


// ═══════════════════════════════════════════════════════════════
// ② قراءة الودائع الشهرية
// ═══════════════════════════════════════════════════════════════

/**
 * الحصول على ودائع شهر محدد (افتراضي: الشهر الحالي)
 * يُحدِّث تلقائياً حالة الودائع المتأخرة
 */
function getMonthlyDeposits($month = null, $year = null) {
    $conn  = db();
    ensureMonthlyDepositsTable();

    $month = (int)($month ?? date('m'));
    $year  = (int)($year  ?? date('Y'));

    // تحديث الودائع المتأخرة تلقائياً
    $today = date('Y-m-d');
    $conn->query("UPDATE monthly_deposits
                  SET status = 'متأخر'
                  WHERE expected_date < '$today'
                    AND status = 'قيد الانتظار'");

    $sql = "SELECT
                md.*,
                ba.account_name,
                ba.bank_name,
                ba.account_number,
                ba.currency
            FROM monthly_deposits md
            LEFT JOIN bank_accounts ba ON md.account_id = ba.id
            WHERE MONTH(md.expected_date) = $month
              AND YEAR(md.expected_date)  = $year
            ORDER BY md.expected_date ASC, md.id DESC";

    $result   = $conn->query($sql);
    $deposits = [];
    if ($result && $result->num_rows > 0) {
        while ($row = $result->fetch_assoc()) $deposits[] = $row;
    }
    return $deposits;
}


// ═══════════════════════════════════════════════════════════════
// ③ إضافة وديعة شهرية
// ═══════════════════════════════════════════════════════════════

/**
 * إضافة وديعة شهرية مجدولة
 */
function addMonthlyDeposit($data) {
    $conn = db();
    ensureMonthlyDepositsTable();

    $depositName    = $conn->real_escape_string(trim($data['deposit_name']  ?? ''));
    $accountId      = (int)($data['account_id']      ?? 0);
    $expectedAmount = (float)($data['expected_amount'] ?? 0);
    $expectedDate   = $conn->real_escape_string($data['expected_date'] ?? date('Y-m-d'));
    $depositType    = $conn->real_escape_string($data['deposit_type']  ?? 'أخرى');
    $notes          = $conn->real_escape_string($data['notes']         ?? '');
    $createdBy      = (int)($_SESSION['user_id'] ?? 0);

    if (empty($depositName))   return ['success' => false, 'message' => 'اسم الوديعة مطلوب'];
    if ($accountId <= 0)       return ['success' => false, 'message' => 'الحساب البنكي مطلوب'];
    if ($expectedAmount <= 0)  return ['success' => false, 'message' => 'المبلغ يجب أن يكون أكبر من صفر'];

    $sql = "INSERT INTO monthly_deposits
                (deposit_name, account_id, expected_amount, expected_date, deposit_type, notes, created_by)
            VALUES
                ('$depositName', $accountId, $expectedAmount, '$expectedDate', '$depositType', '$notes', $createdBy)";

    if ($conn->query($sql)) {
        return ['success' => true, 'id' => $conn->insert_id, 'message' => 'تمت جدولة الوديعة بنجاح'];
    }
    return ['success' => false, 'message' => $conn->error];
}


// ═══════════════════════════════════════════════════════════════
// ④ تأكيد وديعة شهرية
// ═══════════════════════════════════════════════════════════════

/**
 * تأكيد إتمام وديعة شهرية:
 *  ① تحديث الحالة إلى "تم الإيداع"
 *  ② تسجيل إيداع فعلي في bank_deposits
 *  ③ تحديث رصيد الحساب البنكي
 */
function confirmMonthlyDeposit($id) {
    $conn        = db();
    $id          = (int)$id;
    $confirmedBy = (int)($_SESSION['user_id'] ?? 0);
    $now         = date('Y-m-d H:i:s');

    $result = $conn->query("SELECT * FROM monthly_deposits WHERE id = $id");
    if (!$result || $result->num_rows === 0) {
        return ['success' => false, 'message' => 'الوديعة غير موجودة'];
    }
    $deposit = $result->fetch_assoc();

    if ($deposit['status'] === 'تم الإيداع') {
        return ['success' => false, 'message' => 'الوديعة مؤكدة مسبقاً'];
    }

    // تحديث الحالة
    $sql = "UPDATE monthly_deposits
            SET status       = 'تم الإيداع',
                confirmed_at = '$now',
                confirmed_by = $confirmedBy
            WHERE id = $id";

    if ($conn->query($sql)) {
        // تسجيل الإيداع الفعلي في bank_deposits
        $depositNumber = generateDepositNumber();
        $accountId     = (int)$deposit['account_id'];
        $amount        = (float)$deposit['expected_amount'];
        $depositDate   = date('Y-m-d');
        $depositName   = $conn->real_escape_string($deposit['deposit_name']);
        $depositType   = $conn->real_escape_string($deposit['deposit_type']);

        $conn->query("INSERT INTO bank_deposits
                        (deposit_number, account_id, deposit_date, amount, deposit_type,
                         depositor_name, notes, status, created_by, confirmed_by, confirmed_at)
                      VALUES
                        ('$depositNumber', $accountId, '$depositDate', $amount, '$depositType',
                         '$depositName', 'وديعة مجدولة شهرياً', 'تم التأكيد',
                         $confirmedBy, $confirmedBy, '$now')");

        // تحديث رصيد الحساب
        $accountResult = $conn->query("SELECT current_balance FROM bank_accounts WHERE id = $accountId");
        if ($accountResult && $accountResult->num_rows > 0) {
            $account    = $accountResult->fetch_assoc();
            $newBalance = (float)$account['current_balance'] + $amount;
            $conn->query("UPDATE bank_accounts SET current_balance = $newBalance WHERE id = $accountId");
        }

        return ['success' => true, 'message' => 'تم تأكيد الوديعة وإضافتها للحساب'];
    }

    return ['success' => false, 'message' => $conn->error];
}


// ═══════════════════════════════════════════════════════════════
// ⑤ حذف وديعة شهرية
// ═══════════════════════════════════════════════════════════════

/**
 * حذف وديعة شهرية (لا يمكن حذف المؤكَّدة)
 */
function deleteMonthlyDeposit($id) {
    $conn = db();
    $id   = (int)$id;

    $result = $conn->query("SELECT status FROM monthly_deposits WHERE id = $id");
    if (!$result || $result->num_rows === 0) {
        return ['success' => false, 'message' => 'الوديعة غير موجودة'];
    }

    if ($result->fetch_assoc()['status'] === 'تم الإيداع') {
        return ['success' => false, 'message' => 'لا يمكن حذف وديعة تم تأكيدها'];
    }

    if ($conn->query("DELETE FROM monthly_deposits WHERE id = $id")) {
        return ['success' => true];
    }
    return ['success' => false, 'message' => $conn->error];
}


// ═══════════════════════════════════════════════════════════════
// ⑥ إحصاءات الودائع الشهرية
// ═══════════════════════════════════════════════════════════════

/**
 * إحصاءات الودائع الشهرية لشهر محدد
 */
function getMonthlyDepositStats($month = null, $year = null) {
    $conn  = db();
    $month = (int)($month ?? date('m'));
    $year  = (int)($year  ?? date('Y'));
    ensureMonthlyDepositsTable();

    $sql = "SELECT
                COUNT(*)                                                                              AS total_count,
                COALESCE(SUM(expected_amount), 0)                                                    AS total_expected,
                COALESCE(SUM(CASE WHEN status='تم الإيداع' THEN expected_amount ELSE 0 END), 0)      AS total_received,
                SUM(CASE WHEN status='قيد الانتظار' THEN 1 ELSE 0 END)                               AS pending_count,
                SUM(CASE WHEN status='تم الإيداع'   THEN 1 ELSE 0 END)                               AS done_count,
                SUM(CASE WHEN status='متأخر'         THEN 1 ELSE 0 END)                               AS late_count
            FROM monthly_deposits
            WHERE MONTH(expected_date) = $month
              AND YEAR(expected_date)  = $year";

    $result = $conn->query($sql);
    if ($result && $result->num_rows > 0) {
        return $result->fetch_assoc();
    }
    return [
        'total_count'    => 0,
        'total_expected' => 0,
        'total_received' => 0,
        'pending_count'  => 0,
        'done_count'     => 0,
        'late_count'     => 0,
    ];
}