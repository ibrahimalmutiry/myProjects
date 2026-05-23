<?php
/**
 * security_log_api.php
 * API سجل الأمان — تتبع نشاط الموظفين
 * الموقع: api/security_log_api.php
 */
ob_start();
session_start();
session_write_close();
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

require_once __DIR__ . '/../includes/functions.php';

function jsonOut(array $d, int $c = 200): void {
    http_response_code($c);
    if (ob_get_level()) ob_end_clean();
    echo json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

// مدير النظام فقط
if (!isset($_SESSION['user_id'])) jsonOut(['success'=>false,'message'=>'غير مصرح'], 401);
$level = $_SESSION['permission_level'] ?? '';
if ($level !== 'system_admin') jsonOut(['success'=>false,'message'=>'للمديرين فقط'], 403);

$action = $_GET['action'] ?? '';
$conn   = db();

// ── تأكد من وجود الجدول ──────────────────────────────────────
$conn->query("CREATE TABLE IF NOT EXISTS security_log (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    employee_id     INT           DEFAULT NULL,
    employee_number VARCHAR(20)   DEFAULT NULL,
    employee_name   VARCHAR(200)  DEFAULT NULL,
    event_type      VARCHAR(50)   NOT NULL,
    event_result    ENUM('success','failure','warning') NOT NULL DEFAULT 'success',
    ip_address      VARCHAR(45)   NOT NULL DEFAULT '',
    user_agent      VARCHAR(500)  DEFAULT NULL,
    session_id      VARCHAR(128)  DEFAULT NULL,
    page_url        VARCHAR(500)  DEFAULT NULL,
    action_detail   TEXT          DEFAULT NULL,
    extra_data      JSON          DEFAULT NULL,
    created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_emp   (employee_id),
    INDEX idx_type  (event_type),
    INDEX idx_time  (created_at),
    INDEX idx_ip    (ip_address)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

switch ($action) {

    // ── جلب السجلات مع فلترة ─────────────────────────────────
    case 'list':
        $page     = max(1, (int)($_GET['page']     ?? 1));
        $perPage  = min(100, max(10, (int)($_GET['per_page'] ?? 50)));
        $offset   = ($page - 1) * $perPage;

        $empId    = (int)($_GET['employee_id'] ?? 0);
        $eType    = $conn->real_escape_string($_GET['event_type'] ?? '');
        $eResult  = $conn->real_escape_string($_GET['result']     ?? '');
        $ip       = $conn->real_escape_string($_GET['ip']         ?? '');
        $search   = $conn->real_escape_string($_GET['search']     ?? '');
        $dateFrom = $conn->real_escape_string($_GET['date_from']  ?? '');
        $dateTo   = $conn->real_escape_string($_GET['date_to']    ?? '');

        $where = ['1=1'];
        if ($empId)    $where[] = "sl.employee_id = $empId";
        if ($eType)    $where[] = "sl.event_type = '$eType'";
        if ($eResult)  $where[] = "sl.event_result = '$eResult'";
        if ($ip)       $where[] = "sl.ip_address LIKE '%$ip%'";
        if ($dateFrom) $where[] = "DATE(sl.created_at) >= '$dateFrom'";
        if ($dateTo)   $where[] = "DATE(sl.created_at) <= '$dateTo'";
        if ($search)   $where[] = "(sl.employee_name LIKE '%$search%' OR sl.employee_number LIKE '%$search%' OR sl.action_detail LIKE '%$search%')";

        $whereStr = implode(' AND ', $where);

        $countR = $conn->query("SELECT COUNT(*) AS c FROM security_log sl WHERE $whereStr");
        $total  = (int)($countR->fetch_assoc()['c'] ?? 0);

        $r = $conn->query("
            SELECT sl.*,
                   e.name        AS emp_name_live,
                   d.name        AS dept_name,
                   e.role        AS emp_role
            FROM   security_log sl
            LEFT JOIN employees   e ON sl.employee_id = e.id
            LEFT JOIN departments d ON e.department_id = d.id
            WHERE  $whereStr
            ORDER  BY sl.created_at DESC
            LIMIT  $perPage OFFSET $offset
        ");

        $rows = [];
        while ($row = $r->fetch_assoc()) {
            $row['extra_data'] = $row['extra_data'] ? json_decode($row['extra_data'], true) : null;
            $rows[] = $row;
        }

        jsonOut([
            'success'     => true,
            'data'        => $rows,
            'total'       => $total,
            'page'        => $page,
            'per_page'    => $perPage,
            'total_pages' => (int)ceil($total / $perPage),
        ]);

    // ── إحصائيات سريعة ───────────────────────────────────────
    case 'stats':
        $days = max(1, min(90, (int)($_GET['days'] ?? 30)));

        $stats = [];

        // إجمالي الأحداث خلال الفترة
        $r = $conn->query("SELECT
            COUNT(*) AS total,
            SUM(event_result='success') AS successes,
            SUM(event_result='failure') AS failures,
            SUM(event_result='warning') AS warnings
            FROM security_log
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL $days DAY)");
        $stats['totals'] = $r->fetch_assoc();

        // أنواع الأحداث
        $r = $conn->query("SELECT event_type, COUNT(*) AS cnt
            FROM security_log
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL $days DAY)
            GROUP BY event_type ORDER BY cnt DESC");
        $stats['by_type'] = [];
        while ($row = $r->fetch_assoc()) $stats['by_type'][] = $row;

        // محاولات الدخول الفاشلة حسب IP
        $r = $conn->query("SELECT ip_address, COUNT(*) AS cnt
            FROM security_log
            WHERE event_result='failure' AND created_at >= DATE_SUB(NOW(), INTERVAL $days DAY)
            GROUP BY ip_address ORDER BY cnt DESC LIMIT 10");
        $stats['top_failed_ips'] = [];
        while ($row = $r->fetch_assoc()) $stats['top_failed_ips'][] = $row;

        // الموظفون الأكثر نشاطاً
        $r = $conn->query("SELECT employee_name, employee_number, COUNT(*) AS cnt
            FROM security_log
            WHERE employee_id IS NOT NULL AND created_at >= DATE_SUB(NOW(), INTERVAL $days DAY)
            GROUP BY employee_id ORDER BY cnt DESC LIMIT 10");
        $stats['top_users'] = [];
        while ($row = $r->fetch_assoc()) $stats['top_users'][] = $row;

        // آخر 30 يوم — نشاط يومي
        $r = $conn->query("SELECT DATE(created_at) AS day, COUNT(*) AS cnt,
            SUM(event_result='failure') AS failures
            FROM security_log
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            GROUP BY DATE(created_at) ORDER BY day ASC");
        $stats['daily'] = [];
        while ($row = $r->fetch_assoc()) $stats['daily'][] = $row;

        jsonOut(['success'=>true, 'data'=>$stats]);

    // ── تفاصيل موظف واحد ─────────────────────────────────────
    case 'employee_timeline':
        $empId = (int)($_GET['employee_id'] ?? 0);
        if (!$empId) jsonOut(['success'=>false,'message'=>'employee_id مطلوب'], 400);

        $r = $conn->query("SELECT sl.*, e.name, e.role, d.name AS dept_name
            FROM security_log sl
            LEFT JOIN employees e ON sl.employee_id = e.id
            LEFT JOIN departments d ON e.department_id = d.id
            WHERE sl.employee_id = $empId
            ORDER BY sl.created_at DESC LIMIT 200");

        $rows = [];
        while ($row = $r->fetch_assoc()) {
            $row['extra_data'] = $row['extra_data'] ? json_decode($row['extra_data'], true) : null;
            $rows[] = $row;
        }

        // ملخص الموظف
        $sumR = $conn->query("SELECT
            COUNT(*) AS total_events,
            SUM(event_result='failure') AS failed_logins,
            MAX(CASE WHEN event_type='login' AND event_result='success' THEN created_at END) AS last_login,
            MIN(created_at) AS first_seen,
            COUNT(DISTINCT ip_address) AS unique_ips,
            COUNT(DISTINCT DATE(created_at)) AS active_days
            FROM security_log WHERE employee_id = $empId");
        $summary = $sumR->fetch_assoc();

        jsonOut(['success'=>true, 'data'=>$rows, 'summary'=>$summary]);

    // ── مخططات النشاط — ساعي وأسبوعي ────────────────────────
    case 'activity_chart':
        $days = max(1, min(90, (int)($_GET['days'] ?? 30)));

        // توزيع النشاط حسب الساعة (0-23)
        $r = $conn->query("SELECT HOUR(created_at) AS hour, COUNT(*) AS cnt,
            SUM(event_result='failure') AS failures
            FROM security_log
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL $days DAY)
            GROUP BY HOUR(created_at) ORDER BY hour ASC");
        $byHour = array_fill(0, 24, ['total'=>0,'failures'=>0]);
        while ($row = $r->fetch_assoc()) {
            $h = (int)$row['hour'];
            $byHour[$h] = ['total'=>(int)$row['cnt'], 'failures'=>(int)$row['failures']];
        }

        // توزيع النشاط حسب اليوم (1=الأحد .. 7=السبت)
        $r = $conn->query("SELECT DAYOFWEEK(created_at) AS dow,
            DAYNAME(created_at) AS dayname,
            COUNT(*) AS cnt,
            SUM(event_result='failure') AS failures
            FROM security_log
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL $days DAY)
            GROUP BY DAYOFWEEK(created_at), DAYNAME(created_at) ORDER BY dow ASC");
        $byDay = [];
        $dayMap = [1=>'الأحد',2=>'الاثنين',3=>'الثلاثاء',4=>'الأربعاء',5=>'الخميس',6=>'الجمعة',7=>'السبت'];
        $rawDays = [];
        while ($row = $r->fetch_assoc()) {
            $rawDays[(int)$row['dow']] = ['total'=>(int)$row['cnt'],'failures'=>(int)$row['failures']];
        }
        for ($d = 1; $d <= 7; $d++) {
            $byDay[] = [
                'day'      => $dayMap[$d],
                'dow'      => $d,
                'total'    => $rawDays[$d]['total']    ?? 0,
                'failures' => $rawDays[$d]['failures'] ?? 0,
            ];
        }

        // أنواع الأحداث خلال الفترة
        $r = $conn->query("SELECT event_type, COUNT(*) AS cnt
            FROM security_log
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL $days DAY)
            GROUP BY event_type ORDER BY cnt DESC LIMIT 10");
        $byType = [];
        while ($row = $r->fetch_assoc()) $byType[] = $row;

        // ساعات الذروة (أعلى 3 ساعات)
        $hourTotals = array_map(fn($h) => $h['total'], $byHour);
        arsort($hourTotals);
        $peakHours = array_slice(array_keys($hourTotals), 0, 3, true);

        // يوم الذروة
        $dayTotals = array_column($byDay, 'total');
        $peakDayIdx = array_search(max($dayTotals ?: [0]), $dayTotals);

        jsonOut([
            'success'    => true,
            'by_hour'    => $byHour,
            'by_day'     => $byDay,
            'by_type'    => $byType,
            'peak_hours' => $peakHours,
            'peak_day'   => $byDay[$peakDayIdx] ?? null,
            'days'       => $days,
        ]);

    // ── حذف سجلات قديمة ──────────────────────────────────────
    case 'purge':
        $days = max(30, (int)($_GET['days'] ?? 90));
        $conn->query("DELETE FROM security_log WHERE created_at < DATE_SUB(NOW(), INTERVAL $days DAY)");
        jsonOut(['success'=>true, 'deleted'=>$conn->affected_rows]);

    // ── تسجيل حدث من الـ frontend (مثل تبديل تبويب) ─────────
    case 'log_event':
        $input = json_decode(file_get_contents('php://input'), true) ?? [];
        $eType  = $conn->real_escape_string($input['event_type'] ?? 'page_view');
        $detail = $conn->real_escape_string(substr($input['detail'] ?? '', 0, 490));
        $extra  = isset($input['extra']) ? $conn->real_escape_string(json_encode($input['extra'], JSON_UNESCAPED_UNICODE)) : null;

        $userId  = (int)$_SESSION['user_id'];
        $empNum  = $conn->real_escape_string($_SESSION['employee_number'] ?? '');
        $empName = $conn->real_escape_string($_SESSION['user_name']       ?? '');
        $ip      = $conn->real_escape_string($_SERVER['REMOTE_ADDR']      ?? '');
        $ua      = $conn->real_escape_string(substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 490));
        $sessId  = $conn->real_escape_string(session_id());
        $extraSql = $extra ? "'$extra'" : 'NULL';

        $conn->query("INSERT INTO security_log
            (employee_id, employee_number, employee_name, event_type, event_result,
             ip_address, user_agent, session_id, action_detail, extra_data)
            VALUES ($userId, '$empNum', '$empName', '$eType', 'success',
            '$ip', '$ua', '$sessId', '$detail', $extraSql)");

        jsonOut(['success'=>true]);

    default:
        jsonOut(['success'=>false,'message'=>'action غير معروف'], 400);
}