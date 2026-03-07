<?php
/**
 * API شاشة الحجوزات — Budget Reservations API
 * المسار: api/budget.php
 */
session_start();
header('Content-Type: application/json; charset=utf-8');

// ✅ المسار الصحيح لهذا المشروع
require_once __DIR__ . '/../includes/functions.php';

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'غير مصرح']);
    exit;
}

$userId   = (int)$_SESSION['user_id'];
$userRole = $_SESSION['user_role'] ?? 'employee';

try {
    $conn = db();

        // ── جدول أصناف الحجز المستقل ──
        $conn->query("CREATE TABLE IF NOT EXISTS budget_reservation_items (
            id                INT AUTO_INCREMENT PRIMARY KEY,
            reservation_id    INT           NOT NULL,
            sort_order        TINYINT       DEFAULT 0,
            description       TEXT          NOT NULL,
            qty               DECIMAL(12,3) DEFAULT 1,
            unit              VARCHAR(30)   DEFAULT NULL,
            unit_price        DECIMAL(15,2) DEFAULT 0,
            line_total        DECIMAL(15,2) DEFAULT 0,
            notes             TEXT          DEFAULT NULL,
            created_at        TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (reservation_id) REFERENCES budget_reservations(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='أصناف وبنود حجوزات الموازنة'");

        // ── ترحيل البيانات القديمة من items_json إلى الجدول الجديد ──
        $migrRes = $conn->query("SELECT id, items_json, items_description, unit_price, grand_total, unit
                                  FROM budget_reservations
                                  WHERE items_json IS NOT NULL AND items_json != ''
                                  AND id NOT IN (SELECT DISTINCT reservation_id FROM budget_reservation_items)");
        if ($migrRes) {
            while ($mr = $migrRes->fetch_assoc()) {
                $rid   = (int)$mr['id'];
                $items = json_decode($mr['items_json'], true);
                if (is_array($items) && count($items)) {
                    foreach ($items as $i => $it) {
                        $desc  = $conn->real_escape_string($it['description'] ?? '');
                        $qty   = (float)($it['qty']   ?? 1);
                        $uprice= (float)($it['price']  ?? 0);
                        $unit  = $conn->real_escape_string($it['unit'] ?? '');
                        $ltotal= round($qty * $uprice, 2);
                        $conn->query("INSERT INTO budget_reservation_items
                            (reservation_id, sort_order, description, qty, unit, unit_price, line_total)
                            VALUES ($rid, $i, '$desc', $qty, '$unit', $uprice, $ltotal)");
                    }
                }
            }
        }

        // ── ترحيل البيانات القديمة من items_description فقط (بدون items_json) ──
        $oldRes = $conn->query("SELECT id, items_description, unit_price, grand_total, unit
                                 FROM budget_reservations
                                 WHERE (items_json IS NULL OR items_json = '')
                                 AND id NOT IN (SELECT DISTINCT reservation_id FROM budget_reservation_items)");
        if ($oldRes) {
            while ($or = $oldRes->fetch_assoc()) {
                $rid   = (int)$or['id'];
                $lines = array_filter(array_map('trim', preg_split('/\n|،/', $or['items_description'])));
                $i = 0;
                foreach ($lines as $line) {
                    if (!$line) continue;
                    // شكل: "وصف (qty وحدة)"
                    if (preg_match('/^(.+?)\s*\((\d+(?:\.\d+)?)\s*(.*)\)\s*$/', $line, $m)) {
                        $desc  = $conn->real_escape_string(trim($m[1]));
                        $qty   = (float)$m[2];
                        $unit  = $conn->real_escape_string(trim($m[3]));
                    } else {
                        $desc  = $conn->real_escape_string($line);
                        $qty   = 1;
                        $unit  = $conn->real_escape_string($or['unit'] ?? '');
                    }
                    $uprice = $i === 0 ? (float)($or['unit_price'] ?? 0) : 0;
                    $ltotal = round($qty * $uprice, 2);
                    $conn->query("INSERT INTO budget_reservation_items
                        (reservation_id, sort_order, description, qty, unit, unit_price, line_total)
                        VALUES ($rid, $i, '$desc', $qty, '$unit', $uprice, $ltotal)");
                    $i++;
                }
            }
        }
    ensureReservationsTables($conn);

    switch ($action) {

        // ── قائمة الحجوزات ──────────────────────────────────
        case 'list':
            $where = [];
            $permLevel = $_SESSION['permission_level']   ?? 'employee';
            $actPerms  = $_SESSION['action_permissions'] ?? [];

            $canViewAll = $permLevel === 'system_admin'
                       || in_array($userRole, ['admin','budget'])
                       || !empty($actPerms['reservation.view_all']);

            if (!$canViewAll) {
                $deptId = getDepartmentByEmployee($conn, $userId);
                $where[] = $deptId
                    ? "br.department_id = $deptId"
                    : "br.requested_by = $userId";
            }
            if (!empty($_GET['status']))
                $where[] = "br.status = '".$conn->real_escape_string($_GET['status'])."'";
            if (!empty($_GET['department_id']))
                $where[] = "br.department_id = ".(int)$_GET['department_id'];
            if (!empty($_GET['fiscal_year']))
                $where[] = "br.fiscal_year = ".(int)$_GET['fiscal_year'];
            if (!empty($_GET['search'])) {
                $q = $conn->real_escape_string($_GET['search']);
                $where[] = "(br.reservation_number LIKE '%$q%' OR br.purpose LIKE '%$q%' OR br.items_description LIKE '%$q%')";
            }

            $wSql = $where ? 'WHERE '.implode(' AND ', $where) : '';
            $result = $conn->query("
                SELECT br.*,
                       d.name  AS department_name,
                       e.name  AS requested_by_name,
                       eb.name AS budget_employee_name,
                       COALESCE(s.name, br.supplier_name_manual) AS supplier_name,
                       t.transaction_number,
                       (SELECT COUNT(*) FROM budget_reservation_items bri WHERE bri.reservation_id = br.id) AS items_count,
                       dd.dispatch_type,
                       dd.routed_to,
                       dd.status       AS dispatch_status,
                       dd.ola_active   AS dispatch_ola_active,
                       dd.dispatched_at,
                       dd.notes        AS dispatch_notes,
                       ed.name         AS dispatch_employee_name
                FROM budget_reservations br
                LEFT JOIN departments  d  ON br.department_id      = d.id
                LEFT JOIN employees    e  ON br.requested_by       = e.id
                LEFT JOIN employees    eb ON br.budget_employee_id = eb.id
                LEFT JOIN suppliers    s  ON br.supplier_id        = s.id
                LEFT JOIN transactions t  ON br.transaction_id     = t.id
                LEFT JOIN dispatch_data dd ON t.id = dd.transaction_id
                LEFT JOIN employees    ed ON dd.employee_id        = ed.id
                $wSql
                ORDER BY br.created_at DESC
                LIMIT 200
            ");
            $rows = [];
            if ($result) while ($r = $result->fetch_assoc()) $rows[] = $r;
            jsonResponse(['success' => true, 'data' => $rows]);
            break;

        // ── تفاصيل حجز ──────────────────────────────────────
        case 'get':
            $id  = (int)($_GET['id'] ?? 0);
            $res = $conn->query("
                SELECT br.*,
                       d.name  AS department_name,
                       e.name  AS requested_by_name,
                       eb.name AS budget_employee_name,
                       ea.name AS approved_by_name,
                       COALESCE(s.name, br.supplier_name_manual) AS supplier_name,
                       t.transaction_number, t.amount AS transaction_amount
                FROM budget_reservations br
                LEFT JOIN departments  d  ON br.department_id      = d.id
                LEFT JOIN employees    e  ON br.requested_by       = e.id
                LEFT JOIN employees    eb ON br.budget_employee_id = eb.id
                LEFT JOIN employees    ea ON br.approved_by        = ea.id
                LEFT JOIN suppliers    s  ON br.supplier_id        = s.id
                LEFT JOIN transactions t  ON br.transaction_id     = t.id
                WHERE br.id = $id LIMIT 1
            ");
            $row = $res ? $res->fetch_assoc() : null;
            if (!$row) { jsonResponse(['success' => false, 'error' => 'غير موجود']); break; }

            $logRes = $conn->query("
                SELECT l.*, e.name AS employee_name
                FROM budget_reservation_log l
                LEFT JOIN employees e ON l.employee_id = e.id
                WHERE l.reservation_id = $id
                ORDER BY l.created_at ASC
            ");
            $log = [];
            if ($logRes) while ($lr = $logRes->fetch_assoc()) $log[] = $lr;
            $row['log'] = $log;

            // ── جلب أصناف الحجز من الجدول المستقل ──
            $itemsRes = $conn->query("
                SELECT id, sort_order, description, qty, unit, unit_price, line_total, notes
                FROM budget_reservation_items
                WHERE reservation_id = $id
                ORDER BY sort_order ASC, id ASC
            ");
            $items = [];
            if ($itemsRes) while ($ir = $itemsRes->fetch_assoc()) $items[] = $ir;
            $row['items'] = $items;

            jsonResponse(['success' => true, 'data' => $row]);
            break;

        // ── إضافة حجز ───────────────────────────────────────
        case 'add':
            if ($method !== 'POST') { jsonResponse(['success'=>false,'error'=>'POST فقط']); break; }
            $body = json_decode(file_get_contents('php://input'), true) ?? [];

            $purpose  = $conn->real_escape_string($body['purpose'] ?? '');
            $itemsDesc    = $conn->real_escape_string($body['items_description'] ?? '');
            $itemsJsonRaw = is_array($body['items'] ?? null) ? $body['items'] : null;
            if (!$purpose || !$itemsDesc) {
                jsonResponse(['success' => false, 'error' => 'البيانات الأساسية مطلوبة']); break;
            }

            // ── تحديد department_id الصحيح ──────────────────
            // نأخذ أولاً من قسم الموظف المسجّل (foreign key صحيح)
            $deptId = getDepartmentByEmployee($conn, $userId);
            // إذا أُرسل department_id وهو رقم صغير (id حقيقي) نستخدمه
            $sentDeptId = (int)($body['department_id'] ?? 0);
            if ($sentDeptId > 0 && $sentDeptId < 100000) {
                // رقم صغير = id حقيقي من جدول departments
                $chk = $conn->query("SELECT id FROM departments WHERE id=$sentDeptId LIMIT 1");
                if ($chk && $chk->num_rows > 0) $deptId = $sentDeptId;
            }
            // إذا لم نجد قسماً، نأخذ أول قسم متاح
            if (!$deptId) {
                $r = $conn->query("SELECT id FROM departments WHERE is_active=1 LIMIT 1");
                if ($r && ($row = $r->fetch_assoc())) $deptId = (int)$row['id'];
            }

            $number      = generateReservationNumber($conn);
            $fiscalYear  = (int)date('Y');
            $priority    = $conn->real_escape_string($body['priority'] ?? 'عادي');
            $budgetCat   = $conn->real_escape_string($body['budget_category'] ?? '');
            $costCenter  = $conn->real_escape_string($body['cost_center'] ?? '');
            $suppId      = (!empty($body['supplier_id']) && $body['supplier_id'] !== 'manual')
                            ? (int)$body['supplier_id'] : 'NULL';
            $suppManual  = $conn->real_escape_string($body['supplier_name_manual'] ?? '');
            $quotNo      = $conn->real_escape_string($body['quotation_number'] ?? '');
            $quotDate    = !empty($body['quotation_date'])
                            ? "'".$conn->real_escape_string($body['quotation_date'])."'" : 'NULL';
            $qty         = (float)($body['quantity'] ?? 1);
            $unit        = $conn->real_escape_string($body['unit'] ?? '');
            $unitPrice   = (float)($body['unit_price'] ?? 0);
            $totalAmount = (float)($body['total_amount'] ?? 0);
            $vatAmount   = (float)($body['vat_amount'] ?? 0);
            $grandTotal  = (float)($body['grand_total'] ?? 0);
            $currency    = strtoupper($conn->real_escape_string($body['currency'] ?? 'SAR'));
            $reqDate     = $conn->real_escape_string($body['request_date'] ?? date('Y-m-d'));

            // ── سعر الصرف: يدوي من المستخدم أو من الجدول ────────
            $exchangeRate = 1.0;
            if ($currency !== 'SAR') {
                // أولوية: سعر الصرف اليدوي من الطلب
                $manualRate = (float)($body['exchange_rate'] ?? 0);
                if ($manualRate > 0) {
                    $exchangeRate = $manualRate;
                } else {
                    $rEx = $conn->query("SELECT rate_to_sar FROM exchange_rates WHERE currency='$currency' LIMIT 1");
                    if ($rEx && ($exRow = $rEx->fetch_assoc())) {
                        $exchangeRate = (float)$exRow['rate_to_sar'];
                    }
                }
            }
            $grandTotalSar = round($grandTotal * $exchangeRate, 2);

            // ── ربط بخطة الموازنة التقديرية ─────────────────────
            $budgetPlanId = 'NULL';
            if (!empty($body['budget_plan_id'])) {
                $budgetPlanId = (int)$body['budget_plan_id'];
            } elseif (!empty($body['budget_plan_item_id'])) {
                $budgetPlanId = (int)$body['budget_plan_item_id'];
            }

            $sql = "INSERT INTO budget_reservations
                (reservation_number, fiscal_year, department_id, requested_by, request_date,
                 purpose, priority, budget_category, cost_center,
                 supplier_id, supplier_name_manual, quotation_number, quotation_date,
                 items_description, quantity, unit, unit_price,
                 total_amount, vat_amount, grand_total, currency,
                 exchange_rate_sar, grand_total_sar, budget_plan_id, exchange_rate, amount_sar, status)
                VALUES
                ('$number', $fiscalYear, $deptId, $userId, '$reqDate',
                 '$purpose', '$priority', '$budgetCat', '$costCenter',
                 $suppId, '$suppManual', '$quotNo', $quotDate,
                 '$itemsDesc', $qty, '$unit', $unitPrice,
                 $totalAmount, $vatAmount, $grandTotal, '$currency',
                 $exchangeRate, $grandTotalSar, $budgetPlanId, $exchangeRate, $grandTotalSar, 'قيد المراجعة')";

            if ($conn->query($sql)) {
                $newId = $conn->insert_id;

                // ── حفظ الأصناف في جدول budget_reservation_items ──
                if ($itemsJsonRaw && count($itemsJsonRaw)) {
                    foreach ($itemsJsonRaw as $i => $it) {
                        $iDesc   = $conn->real_escape_string($it['description'] ?? '');
                        $iQty    = (float)($it['qty']   ?? 1);
                        $iPrice  = (float)($it['price']  ?? 0);
                        $iUnit   = $conn->real_escape_string($it['unit'] ?? '');
                        $iTotal  = round($iQty * $iPrice, 2);
                        $iNotes  = $conn->real_escape_string($it['notes'] ?? '');
                        $conn->query("INSERT INTO budget_reservation_items
                            (reservation_id, sort_order, description, qty, unit, unit_price, line_total, notes)
                            VALUES ($newId, $i, '$iDesc', $iQty, '$iUnit', $iPrice, $iTotal, '$iNotes')");
                    }
                }

                logReservation($conn, $newId, $userId, 'create', null, 'قيد المراجعة', 'تم إنشاء الحجز');
                jsonResponse(['success' => true, 'id' => $newId, 'number' => $number]);
            } else {
                jsonResponse(['success' => false, 'error' => $conn->error]);
            }
            break;

        // ── مراجعة موظف الموازنة ────────────────────────────
        // ── تحديث أصناف حجز موجود ─────────────────────────────
        case 'update_items':
            if ($method !== 'POST') { jsonResponse(['success'=>false,'error'=>'POST فقط']); break; }
            $body  = json_decode(file_get_contents('php://input'), true) ?? [];
            $rid   = (int)($body['reservation_id'] ?? 0);
            $items = is_array($body['items'] ?? null) ? $body['items'] : [];
            if (!$rid) { jsonResponse(['success'=>false,'error'=>'reservation_id مطلوب']); break; }

            // حذف الأصناف القديمة وإعادة الإدراج
            $conn->query("DELETE FROM budget_reservation_items WHERE reservation_id=$rid");
            $grand = 0;
            foreach ($items as $i => $it) {
                $iDesc  = $conn->real_escape_string($it['description'] ?? '');
                $iQty   = (float)($it['qty']   ?? 1);
                $iPrice = (float)($it['price']  ?? $it['unit_price'] ?? 0);
                $iUnit  = $conn->real_escape_string($it['unit'] ?? '');
                $iTotal = round($iQty * $iPrice, 2);
                $iNotes = $conn->real_escape_string($it['notes'] ?? '');
                $grand += $iTotal;
                $conn->query("INSERT INTO budget_reservation_items
                    (reservation_id, sort_order, description, qty, unit, unit_price, line_total, notes)
                    VALUES ($rid, $i, '$iDesc', $iQty, '$iUnit', $iPrice, $iTotal, '$iNotes')");
            }
            // تحديث الإجماليات في الحجز الرئيسي
            $iDescAll = $conn->real_escape_string(implode('\n', array_map(fn($it) =>
                ($it['description']??'') . ' (' . ($it['qty']??1) . ' ' . ($it['unit']??'') . ')', $items)));
            $conn->query("UPDATE budget_reservations
                SET items_description='$iDescAll', total_amount=$grand, grand_total=$grand,
                    quantity=" . count($items) . ", updated_at=NOW()
                WHERE id=$rid");
            jsonResponse(['success'=>true, 'grand_total'=>$grand]);
            break;

        case 'review':
            if ($method !== 'POST') { jsonResponse(['success'=>false,'error'=>'POST فقط']); break; }
            if (!in_array($userRole, ['admin','budget'])) {
                jsonResponse(['success'=>false,'error'=>'صلاحية موظف الموازنة فقط']); break;
            }
            $body       = json_decode(file_get_contents('php://input'), true) ?? [];
            $id         = (int)($body['id'] ?? 0);
            $newStatus  = $conn->real_escape_string($body['status'] ?? '');
            $budgetNotes= $conn->real_escape_string($body['budget_notes'] ?? '');
            $txId       = !empty($body['transaction_id']) ? (int)$body['transaction_id'] : 'NULL';
            $rejReason  = $conn->real_escape_string($body['rejection_reason'] ?? '');

            // ── رمز الموازنة = رقم الحجز دائماً ───────────────
            // نجلب reservation_number من قاعدة البيانات مباشرة
            $rRow = $conn->query("SELECT reservation_number FROM budget_reservations WHERE id=$id")->fetch_assoc();
            $budgetCode = $conn->real_escape_string($rRow['reservation_number'] ?? ($body['budget_code'] ?? ''));
            // تنظيف أي كود خاطئ (مثل TR-XXXX/ أو slash في النهاية)
            $budgetCode = rtrim($budgetCode, '/');

            $old   = $conn->query("SELECT status FROM budget_reservations WHERE id=$id")->fetch_assoc();
            $oldSt = $old['status'] ?? '';


            $approvedFields = ($newStatus === 'معتمد') ? ", approved_by=$userId, approved_at=NOW()" : '';

            $conn->query("UPDATE budget_reservations SET
                status             = '$newStatus',
                budget_code        = '$budgetCode',
                budget_notes       = '$budgetNotes',
                budget_employee_id = $userId,
                budget_review_date = NOW(),
                transaction_id     = $txId,
                rejection_reason   = '$rejReason'
                $approvedFields
                WHERE id = $id");

            // ✅ مزامنة مع budget_data — INSERT إن لم يكن موجوداً، UPDATE إن كان موجوداً
            if ($txId !== 'NULL' && $txId > 0) {
                $conn->query("INSERT INTO budget_data
                    (transaction_id, employee_id, budget_code, budget_status, notes, review_date)
                    VALUES ($txId, $userId, '$budgetCode', '$newStatus', '$budgetNotes', NOW())
                    ON DUPLICATE KEY UPDATE
                        employee_id   = VALUES(employee_id),
                        budget_code   = VALUES(budget_code),
                        budget_status = VALUES(budget_status),
                        notes         = VALUES(notes),
                        review_date   = VALUES(review_date)");

                // ✅ تحديث OLA — تسجيل وقت المرحلة حسب الحالة الجديدة
                // هذا يضمن أن اعتماد الحجز يُسجَّل في stage_times تماماً كما لو تم من صفحة المعاملات
                recordStageTimeFromLastUpdate($txId, 'budget', $userId, $newStatus);
            }

            logReservation($conn, $id, $userId, 'review', $oldSt, $newStatus, $budgetNotes);
            jsonResponse(['success' => true]);
            break;

        // ── البيانات المساعدة ────────────────────────────────
        case 'meta':
            // ── تصحيح تلقائي لأرقام الموازنة الخاطئة ──────────
            // يُصلح أي budget_code يحتوي slash أو لا يطابق رقم الحجز
            $conn->query("UPDATE budget_reservations br
                SET br.budget_code = br.reservation_number
                WHERE br.budget_code IS NOT NULL
                  AND br.budget_code != ''
                  AND (br.budget_code LIKE '%/%' OR br.budget_code != br.reservation_number)
                  AND br.reservation_number IS NOT NULL");
            // تصحيح في budget_data أيضاً
            $conn->query("UPDATE budget_data bd
                INNER JOIN budget_reservations br ON bd.transaction_id = br.transaction_id
                SET bd.budget_code = br.reservation_number
                WHERE bd.budget_code LIKE '%/%'
                   OR (br.reservation_number IS NOT NULL AND bd.budget_code != br.reservation_number)");

            $depts = [];
            // ✅ departments فيها is_active
            $r = $conn->query("SELECT id, name, code FROM departments WHERE is_active=1 ORDER BY name");
            if ($r) while ($row = $r->fetch_assoc()) $depts[] = $row;

            $suppliers = [];
            // ✅ suppliers أُنشئت بـ ensureReservationsTables بدون is_active
            $r = $conn->query("SELECT id, name, cr_number, category FROM suppliers ORDER BY name");
            if ($r) while ($row = $r->fetch_assoc()) $suppliers[] = $row;

            // ── مراكز التكلفة ─────────────────────────────────────
            $costCenters = [];
            $r = $conn->query("SELECT code, name FROM cost_centers WHERE is_active=1 ORDER BY code");
            if ($r) while ($row = $r->fetch_assoc()) $costCenters[] = $row;

            // ── بنود الموازنة ──────────────────────────────────────
            $budgetCategories = [];
            $r = $conn->query("SELECT id, name, code FROM budget_categories WHERE is_active=1 ORDER BY name");
            if ($r) while ($row = $r->fetch_assoc()) $budgetCategories[] = $row;

            $transactions = [];
            if (in_array($userRole, ['admin','budget'])) {
                $r = $conn->query("
                    SELECT t.id, t.transaction_number, t.amount, t.description,
                           bd.budget_status, bd.budget_code
                    FROM transactions t
                    LEFT JOIN budget_data bd ON t.id = bd.transaction_id
                    LEFT JOIN budget_reservations br ON t.id = br.transaction_id
                    WHERE br.id IS NULL
                    ORDER BY t.id DESC
                    LIMIT 100
                ");
                if ($r) while ($row = $r->fetch_assoc()) $transactions[] = $row;
            }
            jsonResponse(['success' => true, 'data' => [
                'departments'      => $depts,
                'suppliers'        => $suppliers,
                'cost_centers'     => $costCenters,
                'budget_categories'=> $budgetCategories,
                'transactions'     => $transactions,
            ]]);
            break;

        // ── إدارة مراكز التكلفة ───────────────────────────────
        case 'cost_centers_list':
            $rows = [];
            $r = $conn->query("SELECT * FROM cost_centers ORDER BY code");
            if ($r) while ($row = $r->fetch_assoc()) $rows[] = $row;
            jsonResponse(['success' => true, 'data' => $rows]);
            break;

        case 'cost_center_save':
            $b      = json_decode(file_get_contents('php://input'), true) ?? [];
            $code   = $conn->real_escape_string(trim($b['code'] ?? ''));
            $name   = $conn->real_escape_string(trim($b['name'] ?? ''));
            $active = isset($b['is_active']) ? (int)$b['is_active'] : 1;

            if (!empty($b['id'])) {
                // تحديث — إذا أُرسل code وname نحدث الكل، وإلا نحدث is_active فقط
                $id = (int)$b['id'];
                if ($code && $name) {
                    $conn->query("UPDATE cost_centers SET code='$code', name='$name', is_active=$active WHERE id=$id");
                } else {
                    $conn->query("UPDATE cost_centers SET is_active=$active WHERE id=$id");
                }
            } else {
                // إضافة جديدة — code وname مطلوبان
                if (!$code || !$name) jsonResponse(['success'=>false,'error'=>'الرقم والاسم مطلوبان'], 400);
                $conn->query("INSERT INTO cost_centers (code, name, is_active) VALUES ('$code','$name',$active)");
            }
            jsonResponse(['success' => true]);
            break;

        case 'cost_center_delete':
            $b  = json_decode(file_get_contents('php://input'), true) ?? [];
            $id = (int)($b['id'] ?? 0);
            if (!$id) jsonResponse(['success'=>false,'error'=>'id مطلوب'], 400);
            $conn->query("DELETE FROM cost_centers WHERE id=$id");
            jsonResponse(['success' => true]);
            break;

        // ── إدارة بنود الموازنة ───────────────────────────────
        case 'budget_categories_list':
            $rows = [];
            $r = $conn->query("SELECT * FROM budget_categories ORDER BY name");
            if ($r) while ($row = $r->fetch_assoc()) $rows[] = $row;
            jsonResponse(['success' => true, 'data' => $rows]);
            break;

        case 'budget_category_save':
            $b      = json_decode(file_get_contents('php://input'), true) ?? [];
            $name   = $conn->real_escape_string(trim($b['name'] ?? ''));
            $code   = $conn->real_escape_string(trim($b['code'] ?? ''));
            $active = isset($b['is_active']) ? (int)$b['is_active'] : 1;

            if (!empty($b['id'])) {
                // تحديث — إذا أُرسل name نحدث الكل، وإلا نحدث is_active فقط
                $id = (int)$b['id'];
                if ($name) {
                    $codeVal = $code ? "'$code'" : 'NULL';
                    $conn->query("UPDATE budget_categories SET name='$name', code=$codeVal, is_active=$active WHERE id=$id");
                } else {
                    $conn->query("UPDATE budget_categories SET is_active=$active WHERE id=$id");
                }
            } else {
                // إضافة جديدة — name مطلوب
                if (!$name) jsonResponse(['success'=>false,'error'=>'الاسم مطلوب'], 400);
                $codeVal = $code ? "'$code'" : 'NULL';
                $conn->query("INSERT INTO budget_categories (name, code, is_active) VALUES ('$name',$codeVal,$active)");
            }
            jsonResponse(['success' => true]);
            break;

        case 'budget_category_delete':
            $b  = json_decode(file_get_contents('php://input'), true) ?? [];
            $id = (int)($b['id'] ?? 0);
            if (!$id) jsonResponse(['success'=>false,'error'=>'id مطلوب'], 400);
            $conn->query("DELETE FROM budget_categories WHERE id=$id");
            jsonResponse(['success' => true]);
            break;

        // ══════════════════════════════════════════════════════
        //  الموازنة التقديرية — Budget Plans
        // ══════════════════════════════════════════════════════

        case 'plans_list':
            $rows = [];
            $r = $conn->query("
                SELECT bp.*,
                       e.name AS created_by_name,
                       COUNT(DISTINCT bpi.id) AS items_count,
                       COALESCE(SUM(bpi.allocated_sar),0) AS total_allocated
                FROM budget_plans bp
                LEFT JOIN employees e   ON e.id  = bp.created_by
                LEFT JOIN budget_plan_items bpi ON bpi.plan_id = bp.id
                GROUP BY bp.id ORDER BY bp.fiscal_year DESC
            ");
            if ($r) while ($row = $r->fetch_assoc()) $rows[] = $row;
            jsonResponse(['success' => true, 'data' => $rows]);
            break;

        case 'plan_save':
            $b = json_decode(file_get_contents('php://input'), true) ?? [];
            $id         = (int)($b['id'] ?? 0);
            $fiscalYear = (int)($b['fiscal_year'] ?? date('Y'));
            $name       = $conn->real_escape_string($b['name'] ?? '');
            $status     = $conn->real_escape_string($b['status'] ?? 'مسودة');
            $notes      = $conn->real_escape_string($b['notes'] ?? '');
            if (!$name) jsonResponse(['success' => false, 'error' => 'اسم الخطة مطلوب']);
            if ($id) {
                $conn->query("UPDATE budget_plans SET fiscal_year=$fiscalYear, name='$name', status='$status', notes='$notes' WHERE id=$id");
            } else {
                $conn->query("INSERT INTO budget_plans (fiscal_year,name,status,notes,created_by) VALUES ($fiscalYear,'$name','$status','$notes',$userId)");
                $id = $conn->insert_id;
            }
            jsonResponse(['success' => true, 'id' => $id]);
            break;

        case 'plan_get':
            $planId = (int)($_GET['id'] ?? 0);
            $plan = null;
            $r = $conn->query("SELECT * FROM budget_plans WHERE id=$planId LIMIT 1");
            if ($r) $plan = $r->fetch_assoc();
            if (!$plan) jsonResponse(['success' => false, 'error' => 'الخطة غير موجودة'], 404);

            // بنود الخطة مع الإحصاء
            $items = [];
            $r2 = $conn->query("
                SELECT bpi.*,
                       bc.name AS category_name, bc.code AS category_code,
                       cc.name AS cost_center_name, cc.code AS cost_center_code,
                       COALESCE(SUM(CASE WHEN br.status NOT IN ('مرفوض','ملغى','مسودة') THEN br.grand_total_sar ELSE 0 END),0) AS reserved_sar,
                       COALESCE(SUM(CASE WHEN br.status='منفذ' THEN br.grand_total_sar ELSE 0 END),0) AS spent_sar
                FROM budget_plan_items bpi
                JOIN budget_categories bc ON bc.id = bpi.category_id
                JOIN cost_centers      cc ON cc.id = bpi.cost_center_id
                LEFT JOIN budget_reservations br ON br.budget_plan_item_id = bpi.id
                WHERE bpi.plan_id = $planId
                GROUP BY bpi.id
                ORDER BY bc.code, cc.code
            ");
            if ($r2) while ($row = $r2->fetch_assoc()) $items[] = $row;
            jsonResponse(['success' => true, 'data' => $plan, 'items' => $items]);
            break;

        case 'plan_item_save':
            $b = json_decode(file_get_contents('php://input'), true) ?? [];
            // حفظ مجموعة بنود دفعة واحدة (upsert)
            $planId  = (int)($b['plan_id'] ?? 0);
            $itemsIn = $b['items'] ?? [];
            if (!$planId || !$itemsIn) jsonResponse(['success' => false, 'error' => 'بيانات ناقصة']);
            $saved = 0;
            foreach ($itemsIn as $item) {
                $catId  = (int)($item['category_id']    ?? 0);
                $ccId   = (int)($item['cost_center_id'] ?? 0);
                $amount = (float)($item['allocated_sar'] ?? 0);
                $notes  = $conn->real_escape_string($item['notes'] ?? '');
                if (!$catId || !$ccId || $amount < 0) continue;
                $conn->query("
                    INSERT INTO budget_plan_items (plan_id, category_id, cost_center_id, allocated_sar, notes)
                    VALUES ($planId, $catId, $ccId, $amount, '$notes')
                    ON DUPLICATE KEY UPDATE allocated_sar=$amount, notes='$notes'
                ");
                $saved++;
            }
            jsonResponse(['success' => true, 'saved' => $saved]);
            break;

        case 'plan_item_delete':
            $itemId = (int)($_GET['item_id'] ?? 0);
            $conn->query("DELETE FROM budget_plan_items WHERE id=$itemId");
            jsonResponse(['success' => true]);
            break;

        case 'exchange_rates':
            $rows = [];
            $r = $conn->query("SELECT * FROM exchange_rates ORDER BY currency");
            if ($r) while ($row = $r->fetch_assoc()) $rows[] = $row;
            jsonResponse(['success' => true, 'data' => $rows]);
            break;

        case 'exchange_rate_save':
            $b        = json_decode(file_get_contents('php://input'), true) ?? [];
            $currency = strtoupper($conn->real_escape_string($b['currency'] ?? ''));
            $rate     = (float)($b['rate_to_sar'] ?? 0);
            if (!$currency || $rate <= 0) jsonResponse(['success' => false, 'error' => 'بيانات غير صحيحة']);
            $conn->query("INSERT INTO exchange_rates (currency, rate_to_sar) VALUES ('$currency', $rate)
                          ON DUPLICATE KEY UPDATE rate_to_sar=$rate");
            jsonResponse(['success' => true]);
            break;

        case 'plan_budget_status':
            // يرجع ملخص الموازنة لبند + مركز تكلفة محدد (للحجوزات)
            $planItemId = (int)($_GET['plan_item_id'] ?? 0);
            if (!$planItemId) jsonResponse(['success' => false, 'error' => 'plan_item_id مطلوب']);
            $r = $conn->query("SELECT * FROM v_budget_plan_summary WHERE plan_item_id=$planItemId LIMIT 1");
            $row = $r ? $r->fetch_assoc() : null;
            if (!$row) jsonResponse(['success' => false, 'error' => 'البند غير موجود']);
            jsonResponse(['success' => true, 'data' => $row]);
            break;

        case 'find_plan_item':
            // يجد بند الموازنة بناءً على category_id + cost_center_code + fiscal_year
            $catId      = (int)($_GET['category_id'] ?? 0);
            $ccCode     = $conn->real_escape_string($_GET['cost_center_code'] ?? '');
            $fiscalYear = (int)($_GET['fiscal_year'] ?? date('Y'));
            $r = $conn->query("
                SELECT bpi.id AS plan_item_id, bpi.allocated_sar,
                       COALESCE(SUM(CASE WHEN br.status NOT IN ('مرفوض','ملغى','مسودة') THEN br.grand_total_sar ELSE 0 END),0) AS reserved_sar,
                       COALESCE(SUM(CASE WHEN br.status='منفذ' THEN br.grand_total_sar ELSE 0 END),0) AS spent_sar
                FROM budget_plan_items bpi
                JOIN budget_plans bp    ON bp.id = bpi.plan_id  AND bp.fiscal_year = $fiscalYear AND bp.status = 'معتمدة'
                JOIN cost_centers cc    ON cc.id = bpi.cost_center_id AND cc.code = '$ccCode'
                LEFT JOIN budget_reservations br ON br.budget_plan_item_id = bpi.id
                WHERE bpi.category_id = $catId
                GROUP BY bpi.id LIMIT 1
            ");
            $row = $r ? $r->fetch_assoc() : null;
            if ($row) {
                $row['remaining_sar'] = (float)$row['allocated_sar'] - (float)$row['reserved_sar'];
                jsonResponse(['success' => true, 'data' => $row]);
            } else {
                jsonResponse(['success' => false, 'error' => 'لا يوجد بند موازنة مخصص لهذا الاختيار']);
            }
            break;

        default:
            jsonResponse(['success' => false, 'error' => 'action غير معروف']);
    }

} catch (Exception $e) {
    jsonResponse(['success' => false, 'error' => $e->getMessage()]);
}

// ════════════════════════════════════════════════════════════
//  دوال مساعدة
// ════════════════════════════════════════════════════════════

function generateReservationNumber($conn) {
    $year2  = (int)date('y');   // 26
    $year4  = (int)date('Y');   // 2026
    $prefix = (string)$year2;   // "26"
    $result = $conn->query("
        SELECT MAX(CAST(SUBSTRING(reservation_number, 3) AS UNSIGNED)) AS maxSeq
        FROM budget_reservations
        WHERE fiscal_year = $year4
          AND reservation_number LIKE '{$prefix}%'
    ");
    $row = $result ? $result->fetch_assoc() : null;
    $seq = (int)($row['maxSeq'] ?? 0) + 1;
    return $prefix . str_pad($seq, 5, '0', STR_PAD_LEFT);
}

function getDepartmentByEmployee($conn, $empId) {
    $r = $conn->query("SELECT department_id FROM employees WHERE id=$empId LIMIT 1");
    if ($r && ($row = $r->fetch_assoc())) return (int)$row['department_id'];
    return 0;
}

function logReservation($conn, $reservationId, $empId, $action, $oldStatus, $newStatus, $notes = '') {
    $action    = $conn->real_escape_string($action);
    $oldStatus = $oldStatus ? "'".$conn->real_escape_string($oldStatus)."'" : 'NULL';
    $newStatus = $newStatus ? "'".$conn->real_escape_string($newStatus)."'" : 'NULL';
    $notes     = $conn->real_escape_string($notes);
    $conn->query("
        INSERT INTO budget_reservation_log (reservation_id, employee_id, action, old_status, new_status, notes)
        VALUES ($reservationId, $empId, '$action', $oldStatus, $newStatus, '$notes')
    ");
}

function ensureReservationsTables($conn) {
    // ── جدول مراكز التكلفة ────────────────────────────────────
    $conn->query("CREATE TABLE IF NOT EXISTS cost_centers (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        code       VARCHAR(30)  NOT NULL UNIQUE COMMENT 'رقم المركز مثل 102200001',
        name       VARCHAR(150) NOT NULL,
        is_active  TINYINT(1)   NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    // ── جدول بنود الموازنة ────────────────────────────────────
    $conn->query("CREATE TABLE IF NOT EXISTS budget_categories (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        name       VARCHAR(150) NOT NULL UNIQUE,
        code       VARCHAR(30)  DEFAULT NULL,
        is_active  TINYINT(1)   NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");


    // ✅ ينشئ الجداول تلقائياً بدل رمي exception
    $conn->query("CREATE TABLE IF NOT EXISTS suppliers (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        name         VARCHAR(150) NOT NULL,
        cr_number    VARCHAR(50)  DEFAULT NULL,
        vat_number   VARCHAR(50)  DEFAULT NULL,
        contact_name VARCHAR(100) DEFAULT NULL,
        phone        VARCHAR(30)  DEFAULT NULL,
        email        VARCHAR(100) DEFAULT NULL,
        category     VARCHAR(80)  DEFAULT NULL,
        created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");


    $conn->query("CREATE TABLE IF NOT EXISTS budget_reservations (
        id                   INT AUTO_INCREMENT PRIMARY KEY,
        reservation_number   VARCHAR(20)  NOT NULL,
        fiscal_year          SMALLINT(4)  NOT NULL,
        department_id        INT          NOT NULL,
        requested_by         INT          NOT NULL,
        request_date         DATE         NOT NULL,
        purpose              VARCHAR(255) NOT NULL,
        priority             ENUM('عادي','عاجل','حرج') NOT NULL DEFAULT 'عادي',
        budget_category      VARCHAR(100) DEFAULT NULL,
        cost_center          VARCHAR(50)  DEFAULT NULL,
        supplier_id          INT          DEFAULT NULL,
        supplier_name_manual VARCHAR(150) DEFAULT NULL,
        quotation_number     VARCHAR(50)  DEFAULT NULL,
        quotation_date       DATE         DEFAULT NULL,
        items_description    TEXT         NOT NULL,
        quantity             DECIMAL(12,2) DEFAULT 1,
        unit                 VARCHAR(30)  DEFAULT NULL,
        unit_price           DECIMAL(15,2) DEFAULT 0,
        total_amount         DECIMAL(15,2) DEFAULT 0,
        vat_amount           DECIMAL(15,2) DEFAULT 0,
        grand_total          DECIMAL(15,2) DEFAULT 0,
        currency             VARCHAR(10)  DEFAULT 'SAR',
        attachment           VARCHAR(255) DEFAULT NULL,
        transaction_id       INT          DEFAULT NULL,
        budget_employee_id   INT          DEFAULT NULL,
        budget_code          VARCHAR(50)  DEFAULT NULL,
        budget_review_date   DATETIME     DEFAULT NULL,
        budget_notes         TEXT         DEFAULT NULL,
        status               ENUM('مسودة','قيد المراجعة','معتمد','مرفوض','ملغى','منفذ') DEFAULT 'مسودة',
        rejection_reason     TEXT         DEFAULT NULL,
        approved_by          INT          DEFAULT NULL,
        approved_at          DATETIME     DEFAULT NULL,
        created_at           TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
        updated_at           TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_reservation_number (reservation_number)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $conn->query("CREATE TABLE IF NOT EXISTS budget_reservation_log (
        id             INT AUTO_INCREMENT PRIMARY KEY,
        reservation_id INT         NOT NULL,
        employee_id    INT         DEFAULT NULL,
        action         VARCHAR(80) NOT NULL,
        old_status     VARCHAR(50) DEFAULT NULL,
        new_status     VARCHAR(50) DEFAULT NULL,
        notes          TEXT        DEFAULT NULL,
        created_at     TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (reservation_id) REFERENCES budget_reservations(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // إضافة department_id لموظفين إن لم يكن موجوداً
    $chk = $conn->query("SHOW COLUMNS FROM employees LIKE 'department_id'");
    if (!$chk || $chk->num_rows === 0)
        $conn->query("ALTER TABLE employees ADD COLUMN department_id INT DEFAULT NULL");
}