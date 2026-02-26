<?php
/**
 * daily_register_functions.php
 * دوال السجل اليومي للأرصدة والمصروفات
 *
 * الأقسام:
 * ① السجل اليومي (قراءة / حفظ / سجل تاريخي)
 * ② المصروفات اليومية (قراءة / إضافة / حذف)
 * ③ الودائع الاستثمارية المرتبطة بالسجل (نظرة عامة)
 * ④ الإحصائيات الشاملة لليوم
 */


// ═══════════════════════════════════════════════════════════════
// ① السجل اليومي
// ═══════════════════════════════════════════════════════════════

/**
 * جلب سجل يوم محدد (افتراضي: اليوم)
 */
function getDailyRegister($date = null) {
    $conn = db();
    $date = $conn->real_escape_string($date ?? date('Y-m-d'));

    $sql = "SELECT dr.*,
                (dr.bank1_balance + dr.bank2_balance) AS total_operating,
                COALESCE((SELECT SUM(amount)  FROM daily_expenses WHERE register_date = '$date'), 0) AS total_expenses,
                COALESCE((SELECT COUNT(*)     FROM daily_expenses WHERE register_date = '$date'), 0) AS expenses_count
            FROM daily_register dr
            WHERE dr.register_date = '$date'";

    $result = $conn->query($sql);
    if ($result && $result->num_rows > 0) {
        return $result->fetch_assoc();
    }

    // بنية فارغة إذا لم يوجد سجل
    return [
        'register_date'   => $date,
        'bank1_balance'   => 0,
        'bank2_balance'   => 0,
        'total_operating' => 0,
        'total_expenses'  => 0,
        'expenses_count'  => 0,
        'notes'           => '',
    ];
}

/**
 * حفظ (أو تحديث) سجل يومي
 */
function saveDailyRegister($date, $bank1, $bank2, $notes = '') {
    $conn  = db();
    $date  = $conn->real_escape_string($date);
    $bank1 = (float)$bank1;
    $bank2 = (float)$bank2;
    $notes = $conn->real_escape_string($notes);
    $by    = (int)($_SESSION['user_id'] ?? 1);

    $sql = "INSERT INTO daily_register (register_date, bank1_balance, bank2_balance, notes, created_by)
            VALUES ('$date', $bank1, $bank2, '$notes', $by)
            ON DUPLICATE KEY UPDATE
                bank1_balance = $bank1,
                bank2_balance = $bank2,
                notes         = '$notes'";

    return $conn->query($sql)
        ? ['success' => true]
        : ['success' => false, 'message' => $conn->error];
}

/**
 * جلب السجل التاريخي (آخر N يوم)
 * يُضمِّن مجاميع المصروفات + ملخص الودائع الاستثمارية
 */
function getDailyRegisterHistory($limit = 30) {
    $conn = db();

    $sql = "SELECT dr.*,
                (dr.bank1_balance + dr.bank2_balance) AS total_operating,
                COALESCE((SELECT SUM(amount) FROM daily_expenses de WHERE de.register_date = dr.register_date), 0) AS total_expenses,
                COALESCE((SELECT COUNT(*)    FROM daily_expenses de WHERE de.register_date = dr.register_date), 0) AS expenses_count,
                (SELECT SUM(amount)          FROM bank_deposits_investment WHERE status = 'نشط') AS total_deposits_amount,
                (SELECT SUM(expected_profit) FROM bank_deposits_investment WHERE status = 'نشط') AS total_deposits_profit
            FROM daily_register dr
            ORDER BY dr.register_date DESC
            LIMIT " . (int)$limit;

    $result = $conn->query($sql);
    $rows   = [];
    while ($row = $result->fetch_assoc()) {
        $row['available_balance'] = $row['total_operating'] - $row['total_expenses'];
        $rows[] = $row;
    }
    return $rows;
}


// ═══════════════════════════════════════════════════════════════
// ② المصروفات اليومية
// ═══════════════════════════════════════════════════════════════

/**
 * جلب مصروفات يوم محدد
 */
function getDailyExpenses($date) {
    $conn = db();
    $date = $conn->real_escape_string($date);

    $result = $conn->query("SELECT * FROM daily_expenses WHERE register_date = '$date' ORDER BY id DESC");
    $rows   = [];
    while ($row = $result->fetch_assoc()) $rows[] = $row;
    return $rows;
}

/**
 * إضافة مصروف يومي
 */
function addDailyExpense($date, $supplier, $amount, $description = '') {
    $conn        = db();
    $date        = $conn->real_escape_string($date);
    $supplier    = $conn->real_escape_string($supplier);
    $amount      = (float)$amount;
    $description = $conn->real_escape_string($description);
    $by          = (int)($_SESSION['user_id'] ?? 1);

    $sql = "INSERT INTO daily_expenses (register_date, supplier_name, amount, description, created_by)
            VALUES ('$date', '$supplier', $amount, '$description', $by)";

    return $conn->query($sql)
        ? ['success' => true, 'id' => $conn->insert_id]
        : ['success' => false, 'message' => $conn->error];
}

/**
 * حذف مصروف يومي
 */
function deleteDailyExpense($id) {
    $conn = db();
    $id   = (int)$id;

    return $conn->query("DELETE FROM daily_expenses WHERE id = $id")
        ? ['success' => true]
        : ['success' => false, 'message' => $conn->error];
}


// ═══════════════════════════════════════════════════════════════
// ③ الودائع الاستثمارية المرتبطة بالسجل
// ═══════════════════════════════════════════════════════════════

/**
 * جلب الودائع الاستثمارية النشطة مع بيانات الاستحقاق والربح المتراكم
 */
function getActiveDeposits() {
    $conn = db();

    $sql = "SELECT *,
                DATEDIFF(maturity_date, CURDATE())                                                                AS days_remaining,
                DATEDIFF(CURDATE(), start_date)                                                                   AS days_elapsed,
                ROUND(amount * interest_rate / 100 * DATEDIFF(CURDATE(), start_date) / 360, 2)                   AS accrued_profit,
                ROUND(DATEDIFF(CURDATE(), start_date) / days * 100, 1)                                           AS completion_pct
            FROM bank_deposits_investment
            WHERE status = 'نشط'
            ORDER BY maturity_date ASC";

    $result = $conn->query($sql);
    $rows   = [];
    while ($row = $result->fetch_assoc()) $rows[] = $row;
    return $rows;
}

/**
 * ملخص إحصائيات الودائع الاستثمارية النشطة
 */
function getDepositsStats() {
    $conn = db();

    $sql = "SELECT
                COUNT(*)                                                                                           AS total_count,
                SUM(amount)                                                                                        AS total_amount,
                SUM(expected_profit)                                                                               AS total_expected_profit,
                SUM(ROUND(amount * interest_rate / 100 * DATEDIFF(CURDATE(), start_date) / 360, 2))               AS total_accrued_profit,
                COUNT(CASE WHEN DATEDIFF(maturity_date, CURDATE()) <= 7 THEN 1 END)                               AS expiring_soon
            FROM bank_deposits_investment
            WHERE status = 'نشط'";

    $result = $conn->query($sql);
    return $result->fetch_assoc();
}


// ═══════════════════════════════════════════════════════════════
// ④ الإحصائيات الشاملة لليوم
// ═══════════════════════════════════════════════════════════════

/**
 * إحصائيات شاملة ليوم محدد (تجمع السجل + المصروفات + الودائع)
 */
function getTodayFullStats($date = null) {
    $date      = $date ?? date('Y-m-d');
    $register  = getDailyRegister($date);
    $expenses  = getDailyExpenses($date);
    $deposits  = getDepositsStats();

    $totalExpenses  = array_sum(array_column($expenses, 'amount'));
    $totalOperating = (float)$register['bank1_balance'] + (float)$register['bank2_balance'];

    return [
        'date'              => $date,
        'bank1_balance'     => (float)$register['bank1_balance'],
        'bank2_balance'     => (float)$register['bank2_balance'],
        'total_operating'   => $totalOperating,
        'total_expenses'    => $totalExpenses,
        'expenses_list'     => $expenses,
        'deposits_amount'   => (float)($deposits['total_amount']          ?? 0),
        'deposits_profit'   => (float)($deposits['total_accrued_profit']  ?? 0),
        'deposits_count'    => (int)($deposits['total_count']             ?? 0),
        'available_balance' => $totalOperating - $totalExpenses,
    ];
}