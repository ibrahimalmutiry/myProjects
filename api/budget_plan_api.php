<?php
/**
 * API الموازنة التقديرية
 * budget_plan_api.php
 */

ob_start();
session_start();
error_reporting(E_ALL);
ini_set('display_errors', 0);

require_once __DIR__ . '/../includes/functions.php';

if (!isset($_SESSION['user_id'])) {
    jsonResponse(['success' => false, 'message' => 'يجب تسجيل الدخول'], 401);
}

$userId = (int)$_SESSION['user_id'];
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$conn   = db();

try {
    switch ($action) {

        // ══════════════════════════════════════════
        //  جلب الخطط حسب السنة
        // ══════════════════════════════════════════
        case 'list':
            $yearRaw = (int)($_GET['year'] ?? date('Y'));
            $year    = $yearRaw < 100 ? 2000 + $yearRaw : $yearRaw;
            $sql  = "
                SELECT
                    bp.id, bp.fiscal_year, bp.total_budget, bp.notes,
                    bc.id   AS category_id,
                    bc.name AS category_name,
                    bc.code AS category_code,
                    COALESCE(alloc.total_allocated, 0)  AS total_allocated,
                    COALESCE(res.total_reserved,   0)   AS total_reserved
                FROM budget_plans bp
                JOIN budget_categories bc ON bc.id = bp.category_id
                LEFT JOIN (
                    SELECT plan_id, SUM(allocated) AS total_allocated
                    FROM budget_plan_cost_centers
                    GROUP BY plan_id
                ) alloc ON alloc.plan_id = bp.id
                LEFT JOIN (
                    SELECT br.budget_plan_id, bc2.id AS cat_id,
                           SUM(CASE WHEN br.currency='SAR' THEN br.grand_total
                                    ELSE br.grand_total * COALESCE(br.exchange_rate,1) END) AS total_reserved
                    FROM budget_reservations br
                    LEFT JOIN budget_categories bc2
                        ON bc2.name = br.budget_category OR bc2.code = br.budget_category
                    WHERE (br.fiscal_year = $year OR br.fiscal_year = $year % 100)
                      AND br.status NOT IN ('مسودة','مرفوض','ملغى')
                    GROUP BY br.budget_plan_id, bc2.id
                ) res ON (res.budget_plan_id = bp.id OR (res.budget_plan_id IS NULL AND res.cat_id = bp.category_id))
                WHERE bp.fiscal_year = $year
                ORDER BY bc.code ASC
            ";
            $r    = $conn->query($sql);
            $rows = [];
            if ($r) while ($row = $r->fetch_assoc()) $rows[] = $row;
            jsonResponse(['success' => true, 'data' => $rows]);

        // ══════════════════════════════════════════
        //  تفاصيل خطة واحدة (مع مراكز التكلفة)
        // ══════════════════════════════════════════
        case 'detail':
            $id  = (int)($_GET['id'] ?? 0);
            if (!$id) jsonResponse(['success' => false, 'message' => 'id مطلوب'], 400);

            $planR = $conn->query("
                SELECT bp.*, bc.name AS category_name, bc.code AS category_code
                FROM budget_plans bp
                JOIN budget_categories bc ON bc.id = bp.category_id
                WHERE bp.id = $id LIMIT 1
            ");
            if (!$planR || $planR->num_rows === 0)
                jsonResponse(['success' => false, 'message' => 'الخطة غير موجودة'], 404);

            $plan = $planR->fetch_assoc();

            // مراكز التكلفة المخصصة
            $ccR = $conn->query("
                SELECT
                    bpcc.id, bpcc.cost_center_id, bpcc.allocated,
                    cc.code AS cc_code, cc.name AS cc_name,
                    COALESCE(res.reserved, 0) AS reserved
                FROM budget_plan_cost_centers bpcc
                JOIN cost_centers cc ON cc.id = bpcc.cost_center_id
                LEFT JOIN (
                    SELECT cost_center,
                           SUM(CASE WHEN currency='SAR' THEN grand_total
                                    ELSE grand_total * COALESCE(exchange_rate,1) END) AS reserved
                    FROM budget_reservations
                    WHERE budget_plan_id = $id
                      AND status NOT IN ('مسودة','مرفوض','ملغى')
                    GROUP BY cost_center
                ) res ON res.cost_center = cc.code
                WHERE bpcc.plan_id = $id
                ORDER BY cc.code ASC
            ");
            $ccs = [];
            if ($ccR) while ($row = $ccR->fetch_assoc()) {
                $row['remaining'] = (float)$row['allocated'] - (float)$row['reserved'];
                $ccs[] = $row;
            }
            $plan['cost_centers'] = $ccs;

            jsonResponse(['success' => true, 'data' => $plan]);

        // ══════════════════════════════════════════
        //  إنشاء / تحديث خطة
        // ══════════════════════════════════════════
        case 'save':
            if ($method !== 'POST') jsonResponse(['success' => false, 'message' => 'POST فقط'], 405);
            $body = json_decode(file_get_contents('php://input'), true) ?? [];

            $year       = (int)($body['fiscal_year']  ?? 0);
            $categoryId = (int)($body['category_id']  ?? 0);
            $totalBudget = (float)($body['total_budget'] ?? 0);
            $notes      = $conn->real_escape_string($body['notes'] ?? '');
            $planId     = (int)($body['id'] ?? 0);

            if (!$year || !$categoryId || $totalBudget < 0)
                jsonResponse(['success' => false, 'message' => 'بيانات ناقصة'], 400);

            if ($planId) {
                // تحديث
                $conn->query("UPDATE budget_plans SET
                    fiscal_year=$year, category_id=$categoryId,
                    total_budget=$totalBudget, notes='$notes'
                    WHERE id=$planId");
            } else {
                // إنشاء جديد
                $conn->query("INSERT INTO budget_plans
                    (fiscal_year, category_id, total_budget, notes, created_by)
                    VALUES ($year, $categoryId, $totalBudget, '$notes', $userId)");
                $planId = $conn->insert_id;
            }

            // حفظ مراكز التكلفة
            if (isset($body['cost_centers']) && is_array($body['cost_centers'])) {
                $conn->query("DELETE FROM budget_plan_cost_centers WHERE plan_id=$planId");
                foreach ($body['cost_centers'] as $cc) {
                    $ccId      = (int)($cc['cost_center_id'] ?? 0);
                    $allocated = (float)($cc['allocated'] ?? 0);
                    if ($ccId && $allocated >= 0) {
                        $conn->query("INSERT INTO budget_plan_cost_centers
                            (plan_id, cost_center_id, allocated)
                            VALUES ($planId, $ccId, $allocated)");
                    }
                }
            }

            jsonResponse(['success' => true, 'id' => $planId]);

        // ══════════════════════════════════════════
        //  حذف خطة
        // ══════════════════════════════════════════
        case 'delete':
            if ($method !== 'POST') jsonResponse(['success' => false, 'message' => 'POST فقط'], 405);
            $body = json_decode(file_get_contents('php://input'), true) ?? [];
            $id   = (int)($body['id'] ?? 0);
            if (!$id) jsonResponse(['success' => false, 'message' => 'id مطلوب'], 400);
            $conn->query("DELETE FROM budget_plans WHERE id=$id");
            jsonResponse(['success' => true]);

        // ══════════════════════════════════════════
        //  بيانات مساعدة: بنود + مراكز التكلفة
        // ══════════════════════════════════════════
        case 'meta':
            $year = (int)($_GET['year'] ?? date('Y'));
            $cats = [];
            $r    = $conn->query("SELECT id, name, code FROM budget_categories WHERE is_active=1 ORDER BY code ASC");
            if ($r) while ($row = $r->fetch_assoc()) $cats[] = $row;

            $ccs  = [];
            $r    = $conn->query("SELECT id, code, name FROM cost_centers WHERE is_active=1 ORDER BY code ASC");
            if ($r) while ($row = $r->fetch_assoc()) $ccs[] = $row;

            // السنوات التي فيها بنود فعلية
            $yearsWithData = [];
            $r = $conn->query("SELECT DISTINCT fiscal_year FROM budget_plans ORDER BY fiscal_year DESC");
            if ($r) while ($row = $r->fetch_assoc()) $yearsWithData[] = (int)$row['fiscal_year'];

            // كل السنوات في الـ dropdown (فعلية + حالية + قادمة)
            $years    = $yearsWithData;
            $thisYear = (int)date('Y');
            $nextYear = $thisYear + 1;
            if (!in_array($thisYear, $years)) $years[] = $thisYear;
            if (!in_array($nextYear, $years)) $years[] = $nextYear;
            rsort($years);

            jsonResponse(['success' => true, 'data' => [
                'categories'    => $cats,
                'cost_centers'  => $ccs,
                'years'         => $years,
                'years_with_data' => $yearsWithData,
            ]]);

        // ══════════════════════════════════════════
        //  ملخص بند لمركز تكلفة معين (للحجوزات)
        // ══════════════════════════════════════════
        case 'cc_budget_by_category':
            $catCode   = $conn->real_escape_string($_GET['cat_code']    ?? '');
            $ccCode2   = $conn->real_escape_string($_GET['cc_code']     ?? '');
            $fyearRaw  = (int)($_GET['fiscal_year'] ?? date('Y'));
            // توحيد السنة: 26 → 2026
            $fyear     = $fyearRaw < 100 ? 2000 + $fyearRaw : $fyearRaw;
            // استثناء الحجز الحالي من حساب المحجوز (حتى لا يحسب نفسه)
            $excludeId = (int)($_GET['exclude_id'] ?? 0);
            $excludeSql = $excludeId > 0 ? "AND id != $excludeId" : '';
            if (!$catCode || !$ccCode2)
                jsonResponse(['success' => false, 'message' => 'cat_code و cc_code مطلوبان'], 400);

            // يبحث بالكود أولاً ثم بالاسم (للتوافق مع البيانات القديمة)
            $planRow = $conn->query("
                SELECT bp.id AS plan_id, bc.name AS cat_name, bc.code AS cat_code, bp.fiscal_year
                FROM budget_plans bp
                JOIN budget_categories bc ON bc.id = bp.category_id
                WHERE (bc.code = '$catCode' OR bc.name = '$catCode')
                  AND bp.fiscal_year = $fyear
                LIMIT 1
            ");
            if (!$planRow || $planRow->num_rows === 0) {
                jsonResponse(['success' => true, 'data' => null]);
                break;
            }
            $planData    = $planRow->fetch_assoc();
            $autoPlanId  = (int)$planData['plan_id'];

            // لو __all__ أو cc غير محدد — اذهب مباشرة للإجمالي
            if ($ccCode2 !== '__all__') {
                $r2 = $conn->query("
                    SELECT
                        bpcc.allocated,
                        COALESCE(res.reserved, 0)                      AS reserved,
                        bpcc.allocated - COALESCE(res.reserved, 0)     AS remaining,
                        '{$planData['cat_name']}'                      AS category_name,
                        $autoPlanId                                    AS plan_id,
                        'cc'                                           AS scope
                    FROM budget_plan_cost_centers bpcc
                    JOIN cost_centers cc ON cc.id = bpcc.cost_center_id AND cc.code = '$ccCode2'
                    LEFT JOIN (
                        SELECT cost_center,
                               SUM(CASE WHEN currency='SAR' THEN grand_total
                                        ELSE grand_total * COALESCE(exchange_rate,1) END) AS reserved
                        FROM budget_reservations
                        WHERE (budget_plan_id = $autoPlanId OR (budget_plan_id IS NULL AND (budget_category = (SELECT name FROM budget_categories WHERE code='$catCode' LIMIT 1) OR budget_category = '$catCode')))
                          AND cost_center    = '$ccCode2'
                          AND (fiscal_year = $fyear OR fiscal_year = $fyear % 100)
                          AND status NOT IN ('مسودة','مرفوض','ملغى')
                          $excludeSql
                        GROUP BY cost_center
                    ) res ON res.cost_center = cc.code
                    WHERE bpcc.plan_id = $autoPlanId
                    LIMIT 1
                ");
                if ($r2 && $r2->num_rows > 0) {
                    jsonResponse(['success' => true, 'data' => $r2->fetch_assoc()]);
                    break;
                }
            }
            // مركز التكلفة غير مخصص له ميزانية في الخطة — اعرض إجمالي البند مع فلتر CC
            // نحدد شرط CC: إذا __all__ نجمع الكل، وإلا نفلتر
            $ccFilter = ($ccCode2 && $ccCode2 !== '__all__') ? "AND cost_center = '$ccCode2'" : '';
            $r3 = $conn->query("
                SELECT
                    COALESCE(SUM(bpcc.allocated), 0) AS allocated,
                    COALESCE((
                        SELECT SUM(CASE WHEN currency='SAR' THEN grand_total ELSE grand_total * COALESCE(exchange_rate,1) END)
                        FROM budget_reservations
                        WHERE (budget_plan_id = $autoPlanId
                               OR (budget_plan_id IS NULL AND (fiscal_year = $fyear OR fiscal_year = $fyear % 100)
                                   AND (budget_category = '{$planData['cat_name']}' OR budget_category = '$catCode')))
                          AND status NOT IN ('مسودة','مرفوض','ملغى')
                          $ccFilter $excludeSql
                    ), 0) AS reserved,
                    COALESCE(SUM(bpcc.allocated), 0)
                    - COALESCE((
                        SELECT SUM(CASE WHEN currency='SAR' THEN grand_total ELSE grand_total * COALESCE(exchange_rate,1) END)
                        FROM budget_reservations
                        WHERE (budget_plan_id = $autoPlanId
                               OR (budget_plan_id IS NULL AND (fiscal_year = $fyear OR fiscal_year = $fyear % 100)
                                   AND (budget_category = '{$planData['cat_name']}' OR budget_category = '$catCode')))
                          AND status NOT IN ('مسودة','مرفوض','ملغى')
                          $ccFilter $excludeSql
                    ), 0) AS remaining,
                    'category_total' AS scope
                FROM budget_plan_cost_centers bpcc
                WHERE bpcc.plan_id = $autoPlanId
            ");
            $totals = ($r3 && $r3->num_rows > 0) ? $r3->fetch_assoc() : ['allocated'=>0,'reserved'=>0,'remaining'=>0,'scope'=>'category_total'];
            $totals['plan_id']       = $autoPlanId;
            $totals['category_name'] = $planData['cat_name'];
            $totals['fiscal_year']   = $fyear;
            jsonResponse(['success' => true, 'data' => $totals]);
            break;

        case 'cc_budget':
            $planId    = (int)($_GET['plan_id']        ?? 0);
            $ccCode    = $conn->real_escape_string($_GET['cc_code'] ?? '');
            if (!$planId || !$ccCode)
                jsonResponse(['success' => false, 'message' => 'plan_id و cc_code مطلوبان'], 400);

            $r = $conn->query("
                SELECT
                    bpcc.allocated,
                    COALESCE(res.reserved, 0) AS reserved,
                    bpcc.allocated - COALESCE(res.reserved, 0) AS remaining
                FROM budget_plan_cost_centers bpcc
                JOIN cost_centers cc ON cc.id = bpcc.cost_center_id AND cc.code = '$ccCode'
                LEFT JOIN (
                    SELECT cost_center,
                           SUM(CASE WHEN currency='SAR' THEN grand_total
                                    ELSE grand_total * COALESCE(exchange_rate,1) END) AS reserved
                    FROM budget_reservations
                    WHERE budget_plan_id = $planId
                      AND cost_center    = '$ccCode'
                      AND status NOT IN ('مسودة','مرفوض','ملغى')
                ) res ON 1=1
                WHERE bpcc.plan_id = $planId
                LIMIT 1
            ");
            if ($r && $r->num_rows > 0) {
                jsonResponse(['success' => true, 'data' => $r->fetch_assoc()]);
            } else {
                jsonResponse(['success' => true, 'data' => ['allocated' => 0, 'reserved' => 0, 'remaining' => 0]]);
            }

        default:
            jsonResponse(['success' => false, 'message' => 'action غير معروف'], 404);
    }
} catch (Throwable $e) {
    jsonResponse(['success' => false, 'message' => $e->getMessage()], 500);
}