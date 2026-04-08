<?php
error_reporting(0);
@ini_set('display_errors', 0);
/**
 * daily_payments_api.php
 * يُوضع في: api/daily_payments_api.php
 */

require_once __DIR__ . '/../includes/functions.php';

header('Content-Type: application/json; charset=utf-8');

if (!function_exists('jsonResponse')) {
    function jsonResponse(array $data, int $status = 200): void {
        http_response_code($status);
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }
}

try {
    if (session_status() === PHP_SESSION_NONE) session_start();
    $action  = $_GET['action'] ?? $_POST['action'] ?? '';
    $body    = json_decode(file_get_contents('php://input'), true) ?? [];

    switch ($action) {

        // ════════════════════════════════════════════════════════
        //  جلب المدفوعات المعلقة (legacy — للتوافق)
        // ════════════════════════════════════════════════════════
        case 'get_pending_payments':
            $conn = db();
            $r    = $conn->query("
                SELECT
                    t.id, t.transaction_number, t.description,
                    t.amount, IFNULL(t.currency,'SAR') AS currency,
                    IFNULL(t.exchange_rate,1) AS exchange_rate,
                    IFNULL(t.amount_sar, t.amount) AS amount_sar,
                    t.created_at,
                    tt.name AS transaction_type,
                    e.name  AS created_by_name,
                    b.budget_code,
                    IFNULL(t.priority,'normal') AS priority,
                    p.payment_date, p.reference_number, p.payment_method,
                    -- SLA
                    TIMESTAMPDIFF(MINUTE, t.created_at, NOW()) AS sla_elapsed_min,
                    120 AS sla_allowed_min,
                    ROUND(TIMESTAMPDIFF(MINUTE, t.created_at, NOW()) / 120 * 100, 1) AS sla_pct,
                    -- OLA مرحلة الدفع
                    TIMESTAMPDIFF(MINUTE,
                        IFNULL(p.created_at, t.created_at), NOW()) AS ola_elapsed_min
                FROM transactions t
                JOIN payment_data p ON p.transaction_id = t.id
                LEFT JOIN transaction_types tt ON t.type_id    = tt.id
                LEFT JOIN employees        e  ON t.created_by  = e.id
                LEFT JOIN budget_data      b  ON t.id          = b.transaction_id
                WHERE p.status IN ('معلق','قيد المعالجة','في الانتظار')
                  AND (t.status IS NULL OR t.status NOT IN ('مدفوع','مرفوض'))
                ORDER BY
                    t.priority = 'urgent' DESC,
                    sla_pct DESC,
                    t.created_at ASC
            ");
            $rows = [];
            if ($r) while ($row = $r->fetch_assoc()) {
                $row['source'] = 'transaction';
                $rows[] = $row;
            }
            jsonResponse(['success' => true, 'data' => $rows]);
            break;

        // ════════════════════════════════════════════════════════
        //  إصدار أمر دفع (legacy — للتوافق)
        // ════════════════════════════════════════════════════════
        case 'issue_payment_order':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST')
                jsonResponse(['success'=>false,'message'=>'POST فقط'], 405);

            $conn     = db();
            $ids      = array_map('intval', $body['ids'] ?? []);
            $notes    = $conn->real_escape_string($body['notes']  ?? '');
            $ref      = $conn->real_escape_string($body['ref']    ?? '');
            $method   = $conn->real_escape_string($body['method'] ?? 'تحويل بنكي');
            $empId    = (int)($_SESSION['user_id'] ?? 0);

            if (empty($ids)) jsonResponse(['success'=>false,'message'=>'لم يتم تحديد معاملات'], 400);

            $orderRef = $ref ?: ('PO-' . date('Ymd') . '-' . strtoupper(substr(uniqid(), -5)));
            $details  = [];
            $failed   = [];

            foreach ($ids as $txId) {
                $r = $conn->query("
                    UPDATE payment_data
                    SET status='تم الدفع', payment_date=NOW(),
                        payment_method='$method', reference_number='$orderRef',
                        notes='$notes', employee_id=$empId
                    WHERE transaction_id=$txId AND status IN ('معلق','قيد المعالجة','في الانتظار')
                ");
                if (!$r || !$conn->affected_rows) {
                    $failed[] = $txId;
                    continue;
                }
                $conn->query("UPDATE transactions SET status='مدفوع', updated_at=NOW() WHERE id=$txId");

                $tRow = $conn->query("
                    SELECT t.transaction_number, t.description, t.amount,
                           IFNULL(t.currency,'SAR') AS currency, b.budget_code
                    FROM transactions t LEFT JOIN budget_data b ON t.id=b.transaction_id
                    WHERE t.id=$txId LIMIT 1
                ")->fetch_assoc();
                if ($tRow) $details[] = array_merge($tRow, ['id'=>$txId,'order_ref'=>$orderRef,'payment_method'=>$method]);
            }

            jsonResponse([
                'success'         => true,
                'order_ref'       => $orderRef,
                'updated'         => count($details),
                'failed'          => count($failed),
                'details'         => $details,
                'total_amount'    => array_sum(array_column($details, 'amount')),
                'method'          => $method,
                'issued_by'       => function_exists('prGetEmployeeName') ? prGetEmployeeName($empId) : '',
                'issued_at'       => date('Y-m-d H:i:s'),
                'signer_reviewer' => getSystemSetting('signer_reviewer'),
                'signer_approver' => getSystemSetting('signer_approver'),
            ]);
            break;

        // ════════════════════════════════════════════════════════
        //  سجل أوامر الدفع
        // ════════════════════════════════════════════════════════
        case 'get_payment_orders_history':
            $conn     = db();
            $dateFrom = $conn->real_escape_string($_GET['date_from'] ?? date('Y-m-01'));
            $dateTo   = $conn->real_escape_string($_GET['date_to']   ?? date('Y-m-d'));
            $refQ     = $conn->real_escape_string($_GET['order_ref'] ?? '');

            $where = "p.status = 'تم الدفع' AND DATE(p.payment_date) BETWEEN '$dateFrom' AND '$dateTo'";
            if ($refQ) $where .= " AND p.reference_number LIKE '%$refQ%'";

            $sql = "
                SELECT
                    p.reference_number AS order_ref,
                    p.payment_date,
                    p.payment_method,
                    ep.name AS issued_by,
                    COUNT(t.id) AS txn_count,
                    SUM(IFNULL(t.amount_sar, t.amount)) AS total_amount_sar,
                    SUM(t.amount) AS total_amount_raw,
                    CASE WHEN COUNT(DISTINCT IFNULL(t.currency,'SAR'))=1
                         THEN MAX(IFNULL(t.currency,'SAR')) ELSE 'SAR' END AS currency,
                    CASE WHEN COUNT(DISTINCT IFNULL(t.currency,'SAR'))>1
                         THEN 1 ELSE 0 END AS is_mixed_currency,
                    GROUP_CONCAT(t.transaction_number ORDER BY t.transaction_number SEPARATOR ', ') AS txn_numbers
                FROM payment_data p
                JOIN transactions t ON t.id = p.transaction_id
                LEFT JOIN employees ep ON p.employee_id = ep.id
                WHERE $where
                GROUP BY p.reference_number, p.payment_date, p.payment_method, ep.name
                ORDER BY p.payment_date DESC
            ";
            $orders = [];
            $r      = $conn->query($sql);
            if ($r) while ($row = $r->fetch_assoc()) $orders[] = $row;
            jsonResponse(['success'=>true,'data'=>$orders,'orders'=>$orders]);
            break;

        // ════════════════════════════════════════════════════════
        //  تفاصيل أمر دفع
        // ════════════════════════════════════════════════════════
        case 'get_payment_order_details':
            $conn = db();
            $ref  = $conn->real_escape_string($_GET['ref'] ?? '');
            if (!$ref) jsonResponse(['success'=>false,'message'=>'رقم الأمر مطلوب'], 400);

            $r = $conn->query("
                SELECT t.id, t.transaction_number, t.description, t.amount,
                       IFNULL(t.currency,'SAR') AS currency,
                       IFNULL(t.exchange_rate,1) AS exchange_rate,
                       IFNULL(t.amount_sar,t.amount) AS amount_sar,
                       tt.name AS transaction_type, ec.name AS created_by_name,
                       b.budget_code, p.payment_date, p.payment_method,
                       p.reference_number AS order_ref, ep.name AS issued_by
                FROM payment_data p
                JOIN transactions t ON t.id=p.transaction_id
                LEFT JOIN transaction_types tt ON t.type_id=tt.id
                LEFT JOIN employees ec ON t.created_by=ec.id
                LEFT JOIN budget_data b ON t.id=b.transaction_id
                LEFT JOIN employees ep ON p.employee_id=ep.id
                WHERE p.reference_number='$ref'
                ORDER BY t.transaction_number
            ");
            $rows = [];
            if ($r) while ($row=$r->fetch_assoc()) $rows[]=$row;

            jsonResponse([
                'success'         => true,
                'details'         => $rows,
                'total_amount'    => array_sum(array_column($rows,'amount')),
                'order_ref'       => $ref,
                'signer_reviewer' => getSystemSetting('signer_reviewer'),
                'signer_approver' => getSystemSetting('signer_approver'),
                'method'          => !empty($rows)?($rows[0]['payment_method']??'تحويل بنكي'):'تحويل بنكي',
                'issued_by'       => !empty($rows)?($rows[0]['issued_by']??''):'',
                'issued_at'       => !empty($rows)?($rows[0]['payment_date']??''):'',
            ]);
            break;

        // ════════════════════════════════════════════════════════
        //  جلب الأوامر مجمّعة حسب اليوم (من purchase_requests)
        // ════════════════════════════════════════════════════════
        case 'get_orders_by_day':
            $conn = db();
            $days = max(1, min(30, (int)($_GET['days'] ?? 30)));

            // تأمين الأعمدة الضرورية أولاً
            @$conn->query("ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS payment_executed_at DATETIME DEFAULT NULL");
            @$conn->query("ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS payment_ref VARCHAR(200) DEFAULT NULL");
            @$conn->query("ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS payment_method VARCHAR(100) DEFAULT NULL");
            @$conn->query("ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS payment_executed_by INT DEFAULT NULL");
            @$conn->query("ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS final_amount_sar DECIMAL(15,2) DEFAULT NULL");

            $rPR = $conn->query("
                SELECT
                    DATE(pr.payment_executed_at)   AS day,
                    pr.payment_ref                 AS order_ref,
                    pr.payment_method,
                    pr.payment_executed_at         AS issued_at,
                    e.name                         AS issued_by,
                    COUNT(pr.id)                   AS txn_count,
                    SUM(COALESCE(pr.final_amount_sar, pr.final_amount, pr.amount)) AS total_amount
                FROM purchase_requests pr
                LEFT JOIN employees e ON pr.payment_executed_by = e.id
                WHERE pr.payment_status = 'مدفوع'
                  AND pr.payment_executed_at IS NOT NULL
                  AND pr.payment_executed_at >= DATE_SUB(CURDATE(), INTERVAL $days DAY)
                  AND pr.payment_ref IS NOT NULL AND pr.payment_ref != ''
                GROUP BY pr.payment_ref, DATE(pr.payment_executed_at),
                         pr.payment_method, pr.payment_executed_at, e.name
                ORDER BY pr.payment_executed_at DESC
            ");

            if (!$rPR) {
                jsonResponse(['success' => false, 'message' => 'خطأ في الاستعلام: ' . $conn->error]);
                break;
            }

            $byDay = [];
            while ($row = $rPR->fetch_assoc()) {
                $day = $row['day'];
                if (!isset($byDay[$day])) $byDay[$day] = [];
                $byDay[$day][] = $row;
            }
            krsort($byDay);
            jsonResponse(['success'=>true,'data'=>$byDay]);
            break;

        // ════════════════════════════════════════════════════════
        //  جلب مرفقات أمر دفع
        // ════════════════════════════════════════════════════════
        case 'get_order_attachments':
            $conn = db();
            $ref  = $conn->real_escape_string($_GET['order_ref'] ?? '');
            if (!$ref) jsonResponse(['success'=>false,'message'=>'order_ref مطلوب'], 400);

            $conn->query("CREATE TABLE IF NOT EXISTS `payment_order_attachments` (
                `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
                `order_ref` VARCHAR(100) NOT NULL,
                `pr_id` INT DEFAULT NULL,
                `file_name` VARCHAR(255) NOT NULL,
                `original_name` VARCHAR(255) NOT NULL,
                `file_path` VARCHAR(500) NOT NULL,
                `file_type` VARCHAR(100) DEFAULT NULL,
                `file_size` INT DEFAULT 0,
                `file_label` VARCHAR(200) DEFAULT NULL,
                `uploaded_by` INT NOT NULL,
                `uploaded_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (`id`),
                KEY `idx_order_ref` (`order_ref`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

            $r    = $conn->query("
                SELECT a.*, e.name AS uploader_name,
                       (SELECT COUNT(*) FROM pr_attachments pa
                        WHERE pa.file_name = a.file_name
                          AND pa.attachment_type = 'payment_receipt') AS linked_count
                FROM payment_order_attachments a
                LEFT JOIN employees e ON a.uploaded_by = e.id
                WHERE a.order_ref = '$ref'
                ORDER BY a.uploaded_at DESC
            ");
            $atts = [];
            if ($r) while ($row=$r->fetch_assoc()) $atts[]=$row;
            jsonResponse(['success'=>true,'data'=>$atts]);
            break;

        // ════════════════════════════════════════════════════════
        //  رفع إيصال لأمر دفع
        // ════════════════════════════════════════════════════════
        case 'upload_order_attachment':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST')
                jsonResponse(['success'=>false,'message'=>'POST فقط'], 405);

            $conn     = db();
            $orderRef = $conn->real_escape_string($_POST['order_ref'] ?? '');
            $prId     = (int)($_POST['pr_id'] ?? 0);
            $label    = $conn->real_escape_string(trim($_POST['label'] ?? ''));
            $empId    = (int)($_SESSION['user_id'] ?? 0);

            if (!$orderRef) jsonResponse(['success'=>false,'message'=>'order_ref مطلوب'], 400);
            if (empty($_FILES['file'])) jsonResponse(['success'=>false,'message'=>'الملف مطلوب'], 400);

            $file = $_FILES['file'];
            if ($file['error'] !== UPLOAD_ERR_OK)
                jsonResponse(['success'=>false,'message'=>'خطأ في رفع الملف: '.$file['error']], 400);
            if ($file['size'] > 20*1024*1024)
                jsonResponse(['success'=>false,'message'=>'الحجم يتجاوز 20 ميجابايت'], 400);

            $allowed = ['image/jpeg','image/png','image/gif','application/pdf',
                        'image/webp','application/msword',
                        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
            if (!in_array($file['type'], $allowed))
                jsonResponse(['success'=>false,'message'=>'نوع الملف غير مدعوم'], 400);

            $uploadDir = dirname(__DIR__) . '/uploads/payment_receipts/';
            if (!is_dir($uploadDir)) @mkdir($uploadDir, 0755, true);

            $ext      = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
            $safeRef  = preg_replace('/[^a-zA-Z0-9_-]/', '_', $orderRef);
            $fileName = $safeRef . '_' . time() . '_' . uniqid() . '.' . $ext;
            $filePath = $uploadDir . $fileName;
            $relPath  = 'uploads/payment_receipts/' . $fileName;

            if (!move_uploaded_file($file['tmp_name'], $filePath))
                jsonResponse(['success'=>false,'message'=>'فشل حفظ الملف على السيرفر'], 500);

            $origName = $conn->real_escape_string($file['name']);
            $fileType = $conn->real_escape_string($file['type']);
            $fileSize = (int)$file['size'];
            $fnEsc    = $conn->real_escape_string($fileName);
            $fpEsc    = $conn->real_escape_string($relPath);

            $conn->query("CREATE TABLE IF NOT EXISTS `payment_order_attachments` (
                `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
                `order_ref` VARCHAR(100) NOT NULL,
                `pr_id` INT DEFAULT NULL,
                `file_name` VARCHAR(255) NOT NULL,
                `original_name` VARCHAR(255) NOT NULL,
                `file_path` VARCHAR(500) NOT NULL,
                `file_type` VARCHAR(100) DEFAULT NULL,
                `file_size` INT DEFAULT 0,
                `file_label` VARCHAR(200) DEFAULT NULL,
                `uploaded_by` INT NOT NULL,
                `uploaded_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (`id`),
                KEY `idx_order_ref` (`order_ref`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

            $conn->query("
                INSERT INTO payment_order_attachments
                    (order_ref, pr_id, file_name, original_name, file_path,
                     file_type, file_size, file_label, uploaded_by, uploaded_at)
                VALUES
                    ('$orderRef', " . ($prId ?: 'NULL') . ", '$fnEsc', '$origName', '$fpEsc',
                     '$fileType', $fileSize, '$label', $empId, NOW())
            ");
            $attId = $conn->insert_id;

            // ── ربط تلقائي بالطلب عبر payment_ref ───────────────────
            // إيجاد كل الطلبات المرتبطة بهذا الأمر
            $prRows = $conn->query("
                SELECT id FROM purchase_requests
                WHERE payment_ref = '$orderRef' AND payment_ref != ''
            ");
            $linkedPrIds = [];
            if ($prRows) while ($pr = $prRows->fetch_assoc()) $linkedPrIds[] = (int)$pr['id'];

            // إذا pr_id مرسل مباشرة أضفه
            if ($prId && !in_array($prId, $linkedPrIds)) $linkedPrIds[] = $prId;

            // حفظ في pr_attachments لكل طلب مرتبط
            @$conn->query("ALTER TABLE pr_attachments ADD COLUMN IF NOT EXISTS attachment_type VARCHAR(50) DEFAULT 'manual'");
            @$conn->query("ALTER TABLE pr_attachments ADD COLUMN IF NOT EXISTS order_ref VARCHAR(100) DEFAULT NULL");
            @$conn->query("ALTER TABLE pr_attachments ADD COLUMN IF NOT EXISTS file_label VARCHAR(200) DEFAULT NULL");

            foreach ($linkedPrIds as $linkedId) {
                // جلب بيانات الطلب للاسم التلقائي
                $prInfo = $conn->query("
                    SELECT request_number,
                           COALESCE(final_amount_sar, final_amount, amount) AS amount,
                           COALESCE(currency,'SAR') AS currency
                    FROM purchase_requests WHERE id=$linkedId LIMIT 1
                ");
                $prNum = 'PR'; $amt = ''; $cur = 'SAR';
                if ($prInfo && $row = $prInfo->fetch_assoc()) {
                    $prNum = $row['request_number'] ?? 'PR';
                    $amt   = number_format((float)$row['amount'], 2);
                    $cur   = $row['currency'] ?? 'SAR';
                }
                $ext      = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
                $autoName = $conn->real_escape_string("{$prNum}_{$amt}_{$cur}.{$ext}");
                $autoOrig = $conn->real_escape_string("إيصال دفع {$prNum} — {$amt} {$cur}.{$ext}");

                // تجنب التكرار — بـ file_name فقط لنفس الطلب
                $exists = $conn->query("
                    SELECT id FROM pr_attachments
                    WHERE request_id=$linkedId
                      AND file_name='$fnEsc'
                    LIMIT 1
                ");
                if ($exists && $exists->num_rows) continue;

                $conn->query("
                    INSERT INTO pr_attachments
                        (request_id, file_name, original_name, file_path, file_type,
                         file_size, uploaded_by, stage, file_label, attachment_type, order_ref, uploaded_at)
                    VALUES
                        ($linkedId, '$autoName', '$autoOrig', '$fpEsc', '$fileType',
                         $fileSize, $empId, 'payment', '$autoOrig', 'payment_receipt', '$orderRef', NOW())
                ");
            }

            jsonResponse([
                'success'        => true,
                'message'        => 'تم رفع الملف' . (count($linkedPrIds) ? ' وربطه بـ '.count($linkedPrIds).' طلب' : ''),
                'id'             => $attId,
                'file_name'      => $fileName,
                'original_name'  => $file['name'],
                'file_path'      => $relPath,
                'file_label'     => $_POST['label'] ?? '',
                'linked_pr_ids'  => $linkedPrIds,
            ]);
            break;

        // ════════════════════════════════════════════════════════
        //  حذف إيصال
        // ════════════════════════════════════════════════════════
        case 'delete_order_attachment':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST')
                jsonResponse(['success'=>false,'message'=>'POST فقط'], 405);

            $conn  = db();
            $attId = (int)($body['id'] ?? 0);
            if (!$attId) jsonResponse(['success'=>false,'message'=>'id مطلوب'], 400);

            $r = $conn->query("SELECT * FROM payment_order_attachments WHERE id=$attId LIMIT 1");
            if (!$r || !$r->num_rows)
                jsonResponse(['success'=>false,'message'=>'المرفق غير موجود'], 404);

            $row      = $r->fetch_assoc();
            $fullPath = dirname(__DIR__) . '/' . $row['file_path'];
            $fnEsc    = $conn->real_escape_string($row['file_name']);
            $refEsc   = $conn->real_escape_string($row['order_ref'] ?? '');

            // ① حذف الملف من السيرفر
            if (file_exists($fullPath)) @unlink($fullPath);

            // ② حذف من payment_order_attachments
            $conn->query("DELETE FROM payment_order_attachments WHERE id=$attId");

            // ③ حذف من pr_attachments (كل الطلبات المرتبطة بنفس الملف والأمر)
            $conn->query("
                DELETE FROM pr_attachments
                WHERE file_name = '$fnEsc'
                  AND attachment_type = 'payment_receipt'
                  " . ($refEsc ? "AND order_ref = '$refEsc'" : "") . "
            ");

            $prDeleted = $conn->affected_rows;

            jsonResponse([
                'success'     => true,
                'message'     => 'تم حذف الملف' . ($prDeleted > 0 ? " وإزالته من {$prDeleted} طلب" : ''),
                'pr_deleted'  => $prDeleted,
            ]);
            break;

        // ════════════════════════════════════════════════════════
        //  ربط مرفق موجود بالطلبات عبر order_ref
        // ════════════════════════════════════════════════════════
        case 'link_receipt_to_pr':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST')
                jsonResponse(['success'=>false,'message'=>'POST فقط'], 405);

            $conn  = db();
            $attId = (int)($body['attachment_id'] ?? 0);
            $ref   = $conn->real_escape_string($body['order_ref'] ?? '');

            if (!$attId || !$ref)
                jsonResponse(['success'=>false,'message'=>'attachment_id و order_ref مطلوبان'], 400);

            // جلب بيانات المرفق
            $aRow = $conn->query("SELECT * FROM payment_order_attachments WHERE id=$attId LIMIT 1");
            if (!$aRow || !$aRow->num_rows)
                jsonResponse(['success'=>false,'message'=>'المرفق غير موجود'], 404);
            $att  = $aRow->fetch_assoc();

            $fnEsc  = $conn->real_escape_string($att['file_name']);
            $fpEsc  = $conn->real_escape_string($att['file_path']);
            $ftEsc  = $conn->real_escape_string($att['file_type'] ?? '');
            $fSize  = (int)($att['file_size'] ?? 0);
            $empId  = (int)($_SESSION['user_id'] ?? $att['uploaded_by'] ?? 0);

            @$conn->query("ALTER TABLE pr_attachments ADD COLUMN IF NOT EXISTS attachment_type VARCHAR(50) DEFAULT 'manual'");
            @$conn->query("ALTER TABLE pr_attachments ADD COLUMN IF NOT EXISTS order_ref VARCHAR(100) DEFAULT NULL");
            @$conn->query("ALTER TABLE pr_attachments ADD COLUMN IF NOT EXISTS file_label VARCHAR(200) DEFAULT NULL");

            // جلب الطلبات مع بياناتها للاسم التلقائي
            $prRows = $conn->query("
                SELECT pr.id, pr.request_number,
                       COALESCE(pr.final_amount_sar, pr.final_amount, pr.amount) AS amount,
                       COALESCE(pr.currency, 'SAR') AS currency
                FROM purchase_requests pr
                WHERE pr.payment_ref = '$ref' AND pr.payment_ref != ''
            ");

            $linked  = 0;
            $skipped = 0;
            $results = [];

            if ($prRows) {
                while ($pr = $prRows->fetch_assoc()) {
                    $prId  = (int)$pr['id'];
                    $prNum = $conn->real_escape_string($pr['request_number'] ?? 'PR');
                    $amt   = number_format((float)$pr['amount'], 2);
                    $cur   = $conn->real_escape_string($pr['currency'] ?? 'SAR');

                    // اسم الملف التلقائي: رقم_الطلب_المبلغ_العملة
                    $ext      = strtolower(pathinfo($att['file_name'], PATHINFO_EXTENSION));
                    $autoName = $conn->real_escape_string("{$prNum}_{$amt}_{$cur}." . $ext);
                    $autoOrig = $conn->real_escape_string("إيصال دفع {$prNum} — {$amt} {$cur}.{$ext}");

                    // تحقق من التكرار بـ file_name فقط (لنفس الطلب)
                    $exists = $conn->query("
                        SELECT id FROM pr_attachments
                        WHERE request_id = $prId
                          AND file_name = '$fnEsc'
                        LIMIT 1
                    ");

                    if ($exists && $exists->num_rows) {
                        $skipped++;
                        $results[] = ['id'=>$prId,'status'=>'مرتبط مسبقاً'];
                        continue;
                    }

                    $conn->query("
                        INSERT INTO pr_attachments
                            (request_id, file_name, original_name, file_path, file_type,
                             file_size, uploaded_by, stage, file_label, attachment_type, order_ref, uploaded_at)
                        VALUES
                            ($prId, '$autoName', '$autoOrig', '$fpEsc', '$ftEsc',
                             $fSize, $empId, 'payment', '$autoOrig', 'payment_receipt', '$ref', NOW())
                    ");
                    $linked++;
                    $results[] = ['id'=>$prId,'status'=>'تم الربط','name'=>$autoOrig];
                }
            }

            $msg = $linked > 0
                ? "✅ تم ربط الملف بـ {$linked} طلب" . ($skipped ? " ({$skipped} مرتبط مسبقاً)" : '')
                : ($skipped > 0 ? "مرتبط مسبقاً بكل الطلبات" : 'لم يُعثر على طلبات بهذا الأمر');

            jsonResponse([
                'success'       => true,
                'linked_count'  => $linked,
                'skipped_count' => $skipped,
                'results'       => $results,
                'message'       => $msg,
            ]);
            break;

        // ════════════════════════════════════════════════════════
        //  action غير معروف
        // ════════════════════════════════════════════════════════
        default:
            jsonResponse(['success'=>false,'message'=>'action غير معروف: '.$action], 400);
    }

} catch (Exception $e) {
    jsonResponse(['success'=>false,'message'=>'خطأ: '.$e->getMessage()], 500);
} catch (Error $e) {
    jsonResponse(['success'=>false,'message'=>'خطأ فادح: '.$e->getMessage()], 500);
}