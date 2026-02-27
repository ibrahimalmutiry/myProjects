<?php
/**
 * notification_functions.php — النسخة المُصلحة
 *
 * السيناريو الصحيح:
 * 1. تحذير OLA (warn_pct%) → إشعار داخلي للموظف فقط
 * 2. خرق OLA (100%) → إشعار داخلي للمشرف + تسجيل على المعاملة + زر تصعيد
 * 3. كل إشعار مخصص برقم الموظف (recipient_id)
 */

// ═══════════════════════════════════════════════════════════════
// ① إعدادات النظام
// ═══════════════════════════════════════════════════════════════

function getNotificationSettings() {
    $conn   = db();
    $result = $conn->query("SELECT setting_key, setting_value FROM notification_settings");
    $config = [];
    if ($result) while ($row = $result->fetch_assoc()) $config[$row['setting_key']] = $row['setting_value'];
    return $config;
}

function saveNotificationSetting($key, $value) {
    $conn = db();
    $key  = $conn->real_escape_string($key);
    $val  = $conn->real_escape_string($value ?? '');
    $conn->query("UPDATE notification_settings SET setting_value='$val' WHERE setting_key='$key'");
    return ['success' => $conn->affected_rows >= 0];
}

function saveNotificationSettings($data) {
    $conn    = db();
    $allowed = [
        'smtp_host','smtp_port','smtp_user','smtp_pass','smtp_encryption','smtp_from_name',
        'ms_tenant_id','ms_client_id','ms_client_secret','ms_sender_email','ms_enabled',
        'notify_on_ola_warning','notify_on_ola_breach',
        'notify_on_sla_warning','notify_on_sla_breach',
    ];
    $ok = 0;
    foreach ($allowed as $key) {
        if (!isset($data[$key])) continue;
        $val = $conn->real_escape_string($data[$key]);
        $conn->query("UPDATE notification_settings SET setting_value='$val' WHERE setting_key='$key'");
        if ($conn->affected_rows >= 0) $ok++;
    }
    return ['success' => true, 'updated' => $ok];
}

// ═══════════════════════════════════════════════════════════════
// ② الإشعارات الداخلية
// ═══════════════════════════════════════════════════════════════

/**
 * إنشاء إشعار داخلي — يكتب في الأعمدة الحقيقية للجدول
 *
 * @param string $category     ola_warning | ola_breach | sla_warning | sla_breach
 * @param int    $recipientId  الموظف الذي سيرى الإشعار (by employee_id)
 * @param int    $txId         معرف المعاملة
 * @param string $txNumber     رقم المعاملة
 * @param string $title        عنوان الإشعار
 * @param string $message      نص الإشعار
 * @param string $severity     info | warning | critical
 * @param string $stage        المرحلة
 * @param int    $employeeId   موظف المرحلة (صاحب الحدث)
 */
function createSlaNotification($category, $recipientId, $txId, $txNumber, $title, $message, $severity, $stage, $employeeId = null) {
    $conn        = db();
    $category    = $conn->real_escape_string($category);
    $recipientId = (int)$recipientId;
    $txIdSql     = $txId ? (int)$txId : 'NULL';
    $txNumber    = $conn->real_escape_string($txNumber ?? '');
    $title       = $conn->real_escape_string($title);
    $message     = $conn->real_escape_string($message);
    $severity    = $conn->real_escape_string($severity);
    $stage       = $conn->real_escape_string($stage ?? '');
    $empIdSql    = $employeeId ? (int)$employeeId : 'NULL';

    // نوع الإشعار (يتوافق مع enum الجدول)
    $type = match($severity) {
        'critical' => 'urgent',
        'warning'  => 'warning',
        default    => 'info',
    };

    // منع التكرار — إشعار مماثل خلال آخر ساعة لنفس المستلم والمرحلة
    $dup = $conn->query("SELECT id FROM system_notifications
                         WHERE recipient_id = $recipientId
                         AND transaction_id = $txIdSql
                         AND category = '$category'
                         AND stage = '$stage'
                         AND is_read = 0
                         AND created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
                         LIMIT 1");
    if ($dup && $dup->num_rows > 0) return null;

    $conn->query("INSERT INTO system_notifications
                  (type, category, stage, title, message, transaction_id, ref_number,
                   employee_id, recipient_id, severity, is_read)
                  VALUES
                  ('$type','$category','$stage','$title','$message',$txIdSql,'$txNumber',
                   $empIdSql,$recipientId,'$severity',0)");

    return $conn->insert_id;
}

/**
 * جلب الإشعارات للمستخدم الحالي — مرتبة ومفلترة بـ recipient_id
 */
function getSlaNotificationsForUser($userId, $limit = 50) {
    $conn = db();
    $uid  = (int)$userId;

    $res = $conn->query("
        SELECT
            n.id,
            n.type,
            n.category,
            n.stage,
            n.title,
            n.message,
            n.severity,
            n.transaction_id,
            n.ref_number      AS transaction_number,
            n.employee_id,
            n.recipient_id,
            n.is_read,
            n.email_sent,
            n.created_at      AS update_time,
            t.transaction_number AS tx_number,
            tt.name           AS transaction_type,
            e.name            AS employee_name,
            CASE n.stage
                WHEN 'receiving' THEN 'الاستلام'
                WHEN 'budget'    THEN 'الموازنة'
                WHEN 'payment'   THEN 'الدفع'
                WHEN 'invoice'   THEN 'الفوترة'
                WHEN 'sla_total' THEN 'SLA الكلي'
                ELSE n.stage
            END AS stage_label,
            CASE n.category
                WHEN 'ola_warning' THEN '⚠️ تحذير OLA'
                WHEN 'ola_breach'  THEN '🔴 تجاوز OLA'
                WHEN 'sla_warning' THEN '⚠️ تحذير SLA'
                WHEN 'sla_breach'  THEN '🚨 تجاوز SLA'
                WHEN 'manual_escalation' THEN '🔔 تصعيد يدوي'
                ELSE n.category
            END AS category_label
        FROM system_notifications n
        LEFT JOIN transactions      t  ON n.transaction_id = t.id
        LEFT JOIN transaction_types tt ON t.type_id = tt.id
        LEFT JOIN employees         e  ON n.employee_id = e.id
        WHERE n.recipient_id = $uid
          AND n.category IN ('ola_warning','ola_breach','sla_warning','sla_breach','manual_escalation')
        ORDER BY n.created_at DESC
        LIMIT " . (int)$limit . "
    ");

    $rows = [];
    if ($res) while ($r = $res->fetch_assoc()) {
        // استخدم رقم المعاملة الفعلي
        $r['transaction_number'] = $r['tx_number'] ?? $r['transaction_number'] ?? '—';
        $rows[] = $r;
    }
    return $rows;
}

/**
 * عدد الإشعارات غير المقروءة للمستخدم
 */
function getSlaUnreadCount($userId) {
    $conn = db();
    $uid  = (int)$userId;
    $r    = $conn->query("SELECT COUNT(*) AS cnt FROM system_notifications
                          WHERE recipient_id = $uid AND is_read = 0
                          AND category IN ('ola_warning','ola_breach','sla_warning','sla_breach','manual_escalation')");
    return (int)($r ? $r->fetch_assoc()['cnt'] : 0);
}

/**
 * تعليم إشعار كمقروء
 */
function markNotificationRead($id, $userId = null) {
    $conn = db();
    $id   = (int)$id;
    $where = $userId ? "id = $id AND recipient_id = " . (int)$userId : "id = $id";
    $conn->query("UPDATE system_notifications SET is_read=1, read_at=NOW() WHERE $where");
    return ['success' => true];
}

/**
 * تعليم الكل كمقروء للمستخدم
 */
function markAllNotificationsRead($userId) {
    $conn = db();
    $uid  = (int)$userId;
    $conn->query("UPDATE system_notifications SET is_read=1, read_at=NOW()
                  WHERE recipient_id=$uid AND is_read=0");
    return ['success' => true];
}

// الدالة القديمة — تبقى للتوافق مع الكود القديم
function createInternalNotification($type, $scope, $refId, $refNumber, $title, $body, $severity, $recipientId = null) {
    if (!$recipientId) return null;
    return createSlaNotification(
        $type, $recipientId, $refId, $refNumber,
        $title, $body, $severity, '', null
    );
}

// الدالة القديمة — تبقى للتوافق
function getSystemNotifications($userId = null, $limit = 50, $unreadOnly = false) {
    if ($userId) return getSlaNotificationsForUser($userId, $limit);
    return [];
}

function getUnreadNotificationCount($userId = null) {
    return $userId ? getSlaUnreadCount($userId) : 0;
}

// ═══════════════════════════════════════════════════════════════
// ③ إرسال البريد SMTP
// ═══════════════════════════════════════════════════════════════

function sendSmtpEmail($toEmail, $toName, $subject, $htmlBody, $config) {
    if (empty($toEmail)) return ['success' => false, 'error' => 'لا يوجد بريد'];

    $host       = $config['smtp_host'] ?? '';
    $port       = (int)($config['smtp_port'] ?? 587);
    $user       = $config['smtp_user'] ?? '';
    $pass       = $config['smtp_pass'] ?? '';
    $enc        = $config['smtp_encryption'] ?? 'tls';
    $fromName   = $config['smtp_from_name'] ?? 'نظام SLA';

    if (!$host || !$user) return ['success' => false, 'error' => 'SMTP غير مُعدّ'];

    $boundary = md5(uniqid());
    $headers  = implode("\r\n", [
        "From: =?UTF-8?B?" . base64_encode($fromName) . "?= <$user>",
        "To: =?UTF-8?B?" . base64_encode($toName) . "?= <$toEmail>",
        "Subject: =?UTF-8?B?" . base64_encode($subject) . "?=",
        "MIME-Version: 1.0",
        "Content-Type: multipart/alternative; boundary=\"$boundary\"",
    ]);

    $body = "--$boundary\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"
          . chunk_split(base64_encode($htmlBody)) . "\r\n--$boundary--";

    $ctx = stream_context_create(['ssl' => ['verify_peer' => false, 'verify_peer_name' => false]]);
    $transport = $enc === 'ssl' ? "ssl://$host" : $host;

    try {
        $sock = stream_socket_client("$transport:$port", $errno, $errstr, 15, STREAM_CLIENT_CONNECT, $ctx);
        if (!$sock) return ['success' => false, 'error' => "اتصال فاشل: $errstr"];

        $_r = function($s) use ($sock) { return fgets($sock, 515); };
        $_w = function($s) use ($sock) { fputs($sock, $s . "\r\n"); };

        $_r($sock);
        $_w("EHLO " . gethostname());
        while (($line = fgets($sock, 515)) && substr($line, 3, 1) === '-') {}

        if ($enc === 'tls') {
            $_w("STARTTLS");
            fgets($sock, 515);
            stream_socket_enable_crypto($sock, true, STREAM_CRYPTO_METHOD_TLS_CLIENT);
            $_w("EHLO " . gethostname());
            while (($line = fgets($sock, 515)) && substr($line, 3, 1) === '-') {}
        }

        $_w("AUTH LOGIN");
        fgets($sock, 515);
        $_w(base64_encode($user));
        fgets($sock, 515);
        $_w(base64_encode($pass));
        $authRes = fgets($sock, 515);
        if (substr($authRes, 0, 3) !== '235') {
            fclose($sock);
            return ['success' => false, 'error' => 'فشل المصادقة SMTP'];
        }

        $_w("MAIL FROM: <$user>");
        fgets($sock, 515);
        $_w("RCPT TO: <$toEmail>");
        fgets($sock, 515);
        $_w("DATA");
        fgets($sock, 515);
        fputs($sock, $headers . "\r\n\r\n" . $body . "\r\n.\r\n");
        $sent = fgets($sock, 515);
        $_w("QUIT");
        fclose($sock);

        return ['success' => substr($sent, 0, 3) === '250', 'to' => $toEmail];
    } catch (Exception $e) {
        return ['success' => false, 'error' => $e->getMessage()];
    }
}

// ═══════════════════════════════════════════════════════════════
// ④ Microsoft Exchange (Graph API)
// ═══════════════════════════════════════════════════════════════

function sendExchangeEmail($toEmail, $toName, $subject, $htmlBody, $config) {
    $tenantId = $config['ms_tenant_id']     ?? '';
    $clientId = $config['ms_client_id']     ?? '';
    $secret   = $config['ms_client_secret'] ?? '';
    $sender   = $config['ms_sender_email']  ?? '';

    if (!$tenantId || !$clientId || !$secret || !$sender)
        return ['success' => false, 'error' => 'إعدادات Exchange غير مكتملة'];

    // الحصول على Access Token
    $tokenUrl  = "https://login.microsoftonline.com/$tenantId/oauth2/v2.0/token";
    $tokenData = http_build_query([
        'client_id'     => $clientId,
        'client_secret' => $secret,
        'scope'         => 'https://graph.microsoft.com/.default',
        'grant_type'    => 'client_credentials',
    ]);

    $ctx = stream_context_create(['http' => [
        'method'  => 'POST',
        'header'  => "Content-Type: application/x-www-form-urlencoded\r\n",
        'content' => $tokenData,
        'timeout' => 15,
    ]]);

    $tokenResponse = @file_get_contents($tokenUrl, false, $ctx);
    if (!$tokenResponse) return ['success' => false, 'error' => 'فشل جلب Token'];

    $token = json_decode($tokenResponse, true);
    if (empty($token['access_token'])) return ['success' => false, 'error' => 'Token فارغ'];

    // إرسال البريد عبر Graph API
    $payload = json_encode([
        'message' => [
            'subject' => $subject,
            'body'    => ['contentType' => 'HTML', 'content' => $htmlBody],
            'toRecipients' => [[
                'emailAddress' => ['address' => $toEmail, 'name' => $toName]
            ]],
        ],
        'saveToSentItems' => false,
    ], JSON_UNESCAPED_UNICODE);

    $sendCtx = stream_context_create(['http' => [
        'method'  => 'POST',
        'header'  => implode("\r\n", [
            "Authorization: Bearer " . $token['access_token'],
            "Content-Type: application/json",
            "Content-Length: " . strlen($payload),
        ]),
        'content' => $payload,
        'timeout' => 15,
        'ignore_errors' => true,
    ]]);

    $sendUrl      = "https://graph.microsoft.com/v1.0/users/$sender/sendMail";
    $sendResponse = @file_get_contents($sendUrl, false, $sendCtx);
    $statusLine   = $http_response_header[0] ?? '';
    $statusCode   = (int)substr($statusLine, 9, 3);

    return ['success' => $statusCode === 202, 'to' => $toEmail, 'status' => $statusCode];
}

// ═══════════════════════════════════════════════════════════════
// ⑤ دالة الإرسال الموحدة — SLA/OLA
// ═══════════════════════════════════════════════════════════════

/**
 * يُرسل الإشعار المناسب حسب نوع الحدث:
 *
 *  ola_warning → للموظف فقط (تحذير: اقتربت المدة)
 *  ola_breach  → للمشرف فقط (خرق: تم التجاوز + تسجيل تصعيد)
 *  sla_warning → للموظف فقط
 *  sla_breach  → للمشرف + الموظف
 */
function sendSlaNotification($breachType, $scope, $refId, $refNumber, $employeeId, $escalateTo, $extra = []) {
    $conn   = db();
    $config = getNotificationSettings();

    $scopeLabel = $scope === 'correspondence' ? 'مراسلة' : 'معاملة';
    $stageLabel = $extra['stage_label'] ?? $extra['stage'] ?? '—';
    $stage      = $extra['stage'] ?? '';
    $elapsed    = _formatMinutes((int)($extra['elapsed'] ?? 0));
    $allowed    = _formatMinutes((int)($extra['allowed'] ?? 0));
    $pct        = number_format((float)($extra['pct'] ?? 0), 1);
    $isManual   = !empty($extra['manual']);

    // ─── بناء النصوص ────────────────────────────────────────────
    [$severity, $empTitle, $supTitle, $icon] = match($breachType) {
        'ola_warning' => [
            'warning',
            "⚠️ تحذير OLA — {$scopeLabel} {$refNumber}",
            null,
            '⚠️'
        ],
        'ola_breach' => [
            'critical',
            "🔴 تجاوز OLA — {$scopeLabel} {$refNumber} — تم التصعيد",
            "🔴 تصعيد OLA — {$scopeLabel} {$refNumber}",
            '🔴'
        ],
        'sla_warning' => [
            'warning',
            "⚠️ تحذير SLA — {$scopeLabel} {$refNumber}",
            null,
            '⚠️'
        ],
        'sla_breach' => [
            'critical',
            "🚨 تجاوز SLA — {$scopeLabel} {$refNumber}",
            "🚨 تصعيد SLA — {$scopeLabel} {$refNumber}",
            '🚨'
        ],
        default => ['info', "إشعار — {$scopeLabel} {$refNumber}", null, 'ℹ️'],
    };

    $msgBody = "المرحلة: {$stageLabel} | الوقت: {$elapsed} ({$pct}% من {$allowed})";
    $category = $isManual ? 'manual_escalation' : $breachType;

    $results = [];

    // ─── 1. إشعار للموظف (تحذير OLA/SLA) ───────────────────────
    if ($employeeId && in_array($breachType, ['ola_warning','sla_warning','sla_breach'])) {
        $notifId = createSlaNotification(
            $category, $employeeId, $refId, $refNumber,
            $empTitle, $msgBody, $severity, $stage, $employeeId
        );
        $results['employee_notif'] = $notifId;
    }

    // ─── 2. إشعار للمشرف (خرق OLA/SLA) ────────────────────────
    if ($escalateTo && $supTitle && in_array($breachType, ['ola_breach','sla_breach'])) {
        $notifId = createSlaNotification(
            $category, $escalateTo, $refId, $refNumber,
            $supTitle, $msgBody, $severity, $stage, $employeeId
        );
        $results['supervisor_notif'] = $notifId;

        // ─── 3. تسجيل التصعيد على المعاملة ───────────────────
        if ($scope === 'transaction' && $refId) {
            _flagTransactionEscalated($conn, (int)$refId, $stage);
        }
    }

    // ─── 4. بريد إلكتروني ────────────────────────────────────────
    $shouldEmail = ($config["notify_on_{$breachType}"] ?? '0') === '1';
    if ($shouldEmail) {
        $bodyHtml = _buildEmailHtml($empTitle, $msgBody, $icon, $severity, $extra, $elapsed, $allowed, $pct);

        // للموظف
        if ($employeeId && in_array($breachType, ['ola_warning','sla_warning','sla_breach'])) {
            $emp = _getEmployeeEmail($conn, $employeeId);
            if ($emp['email']) {
                $r = sendSmtpEmail($emp['email'], $emp['name'], $empTitle, $bodyHtml, $config);
                if ($r['success']) {
                    $conn->query("UPDATE system_notifications SET email_sent=1
                                  WHERE recipient_id=$employeeId AND transaction_id=" . (int)$refId . "
                                  AND category='$category' ORDER BY id DESC LIMIT 1");
                }
                $results['smtp_employee'] = $r;
            }
        }

        // للمشرف
        if ($escalateTo && in_array($breachType, ['ola_breach','sla_breach'])) {
            $sup = _getEmployeeEmail($conn, $escalateTo);
            if ($sup['email']) {
                $r = sendSmtpEmail($sup['email'], $sup['name'], $supTitle ?? $empTitle, $bodyHtml, $config);
                $results['smtp_supervisor'] = $r;
            }
        }
    }

    // ─── 5. Exchange ─────────────────────────────────────────────
    $msEnabled = ($config['ms_enabled'] ?? '0') === '1';
    if ($msEnabled && $shouldEmail) {
        $bodyHtml = $bodyHtml ?? _buildEmailHtml($empTitle, $msgBody, $icon, $severity, $extra, $elapsed, $allowed, $pct);
        if ($employeeId && in_array($breachType, ['ola_warning','sla_warning','sla_breach'])) {
            $emp = _getEmployeeEmail($conn, $employeeId);
            if ($emp['email']) $results['exchange_employee'] = sendExchangeEmail($emp['email'], $emp['name'], $empTitle, $bodyHtml, $config);
        }
        if ($escalateTo && in_array($breachType, ['ola_breach','sla_breach'])) {
            $sup = _getEmployeeEmail($conn, $escalateTo);
            if ($sup['email']) $results['exchange_supervisor'] = sendExchangeEmail($sup['email'], $sup['name'], $supTitle ?? $empTitle, $bodyHtml, $config);
        }
    }

    return $results;
}

/**
 * يُسجّل علامة التصعيد على المعاملة
 */
function _flagTransactionEscalated($conn, $txId, $stage) {
    // تحقق وجود عمود is_escalated أو نستخدم metadata
    $col = $conn->query("SHOW COLUMNS FROM transactions LIKE 'is_escalated'");
    if ($col && $col->num_rows > 0) {
        $conn->query("UPDATE transactions SET is_escalated=1 WHERE id=$txId");
    }
    // سجّل في activity log
    $stageLabel = ['receiving'=>'الاستلام','budget'=>'الموازنة','payment'=>'الدفع','invoice'=>'الفوترة'][$stage] ?? $stage;
    $msg = $conn->real_escape_string("تم التصعيد: تجاوز OLA في مرحلة $stageLabel");
    $conn->query("INSERT IGNORE INTO activity_log (transaction_id, action, notes, created_at)
                  VALUES ($txId, 'تصعيد', '$msg', NOW())
                  ON DUPLICATE KEY UPDATE notes=notes");
}

// ═══════════════════════════════════════════════════════════════
// ⑥ دوال مساعدة
// ═══════════════════════════════════════════════════════════════

function _formatMinutes($min) {
    if ($min <= 0) return '—';
    if ($min < 60) return "{$min} دقيقة";
    $h = floor($min / 60);
    $m = $min % 60;
    return $m > 0 ? "{$h} ساعة و{$m} دقيقة" : "{$h} ساعة";
}

function _getEmployeeEmail($conn, $id) {
    $id = (int)$id;
    $r  = $conn->query("SELECT name, email FROM employees WHERE id = $id LIMIT 1");
    if (!$r || $r->num_rows === 0) return ['name' => '—', 'email' => null];
    return $r->fetch_assoc();
}

function _buildNotificationBody($icon, $title, $stageLabel, $elapsed, $allowed, $pct, $extra) {
    $scope = ($extra['scope'] ?? 'transaction') === 'correspondence' ? 'مراسلة' : 'معاملة';
    return "{$icon} {$title}\nالمرحلة: {$stageLabel}\nالوقت المنقضي: {$elapsed} ({$pct}% من الوقت المسموح)\nالوقت المسموح: {$allowed}";
}

function _buildEmailHtml($title, $body, $icon, $severity, $extra, $elapsed, $allowed, $pct) {
    $color      = $severity === 'critical' ? '#dc2626' : ($severity === 'warning' ? '#d97706' : '#2563eb');
    $bgLight    = $severity === 'critical' ? '#fef2f2' : ($severity === 'warning' ? '#fffbeb' : '#eff6ff');
    $stageLabel = $extra['stage_label'] ?? $extra['stage'] ?? '—';
    $refNumber  = $extra['ref_number'] ?? '';
    $scope      = ($extra['scope'] ?? 'transaction') === 'correspondence' ? 'مراسلة' : 'معاملة';
    $barWidth   = min((float)$pct, 100);
    $barColor   = (float)$pct >= 100 ? '#dc2626' : ($pct >= 80 ? '#d97706' : '#16a34a');
    return <<<HTML
<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">
<style>
  body{font-family:Arial,sans-serif;background:#f3f4f6;margin:0;padding:20px;direction:rtl}
  .card{background:#fff;border-radius:12px;max-width:560px;margin:auto;border-top:4px solid {$color};box-shadow:0 2px 12px rgba(0,0,0,.1);overflow:hidden}
  .header{background:{$color};color:#fff;padding:20px 24px}.header h1{margin:0;font-size:18px}.header .icon{font-size:28px;margin-bottom:8px}
  .body{padding:24px}.badge{display:inline-block;background:{$bgLight};color:{$color};border:1px solid {$color}40;border-radius:6px;padding:4px 12px;font-size:13px;font-weight:bold}
  .info-row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:14px}.info-row:last-child{border:none}
  .label{color:#6b7280}.value{font-weight:600;color:#111827}
  .bar-wrap{background:#e5e7eb;border-radius:6px;height:10px;overflow:hidden;margin:12px 0}
  .bar-fill{background:{$barColor};height:100%;width:{$barWidth}%}
  .footer{background:#f9fafb;padding:16px 24px;font-size:12px;color:#9ca3af;text-align:center}
  .pct{font-size:22px;font-weight:800;color:{$barColor}}
</style></head><body>
<div class="card">
  <div class="header"><div class="icon">{$icon}</div><h1>{$title}</h1></div>
  <div class="body">
    <p style="margin-top:0"><span class="badge">{$scope}: {$refNumber}</span></p>
    <div class="info-row"><span class="label">المرحلة</span><span class="value">{$stageLabel}</span></div>
    <div class="info-row"><span class="label">الوقت المنقضي</span><span class="value">{$elapsed}</span></div>
    <div class="info-row"><span class="label">الوقت المسموح (OLA)</span><span class="value">{$allowed}</span></div>
    <div style="margin:16px 0 4px">
      <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px">
        <span style="color:#6b7280">نسبة الاستهلاك</span><span class="pct">{$pct}%</span>
      </div>
      <div class="bar-wrap"><div class="bar-fill"></div></div>
    </div>
  </div>
  <div class="footer">هذا إشعار تلقائي من نظام متابعة SLA/OLA — لا تردّ على هذا البريد</div>
</div></body></html>
HTML;
}

// ═══════════════════════════════════════════════════════════════
// ⑦ اختبار الإعدادات
// ═══════════════════════════════════════════════════════════════

function testSmtpConnection($testEmail) {
    $config = getNotificationSettings();
    $html   = _buildEmailHtml('اختبار SMTP', '', '✅', 'info',
        ['scope'=>'system','ref_number'=>'TEST-001','stage_label'=>'اختبار'], '5 دقائق', '10 دقائق', '50.0');
    return sendSmtpEmail($testEmail, 'مسؤول النظام', 'اختبار SMTP — نظام SLA', $html, $config);
}

function testExchangeConnection($testEmail) {
    $config = getNotificationSettings();
    if (($config['ms_enabled'] ?? '0') !== '1')
        return ['success' => false, 'error' => 'Exchange غير مفعّل'];
    $html = _buildEmailHtml('اختبار Exchange', '', '✅', 'info',
        ['scope'=>'system','ref_number'=>'TEST-001','stage_label'=>'اختبار'], '5 دقائق', '10 دقائق', '50.0');
    return sendExchangeEmail($testEmail, 'مسؤول النظام', 'اختبار Exchange — نظام SLA', $html, $config);
}