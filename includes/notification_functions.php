<?php
/**
 * notification_functions.php
 * نظام الإشعارات الثلاثي: داخلي + SMTP + Microsoft Exchange (Graph API)
 *
 * الأقسام:
 * ① إعدادات النظام
 * ② الإشعارات الداخلية (قراءة / إنشاء / تعليم كمقروء)
 * ③ إرسال البريد عبر SMTP
 * ④ إرسال البريد عبر Microsoft Exchange (Graph API)
 * ⑤ دالة الإرسال الموحدة (SLA/OLA)
 * ⑥ دوال مساعدة خاصة (private helpers)
 * ⑦ اختبار الإعدادات
 */


// ═══════════════════════════════════════════════════════════════
// ① إعدادات النظام
// ═══════════════════════════════════════════════════════════════

/**
 * جلب جميع إعدادات الإشعارات من قاعدة البيانات
 */
function getNotificationSettings() {
    $conn   = db();
    $result = $conn->query("SELECT setting_key, setting_value FROM notification_settings");
    $config = [];
    while ($row = $result->fetch_assoc()) {
        $config[$row['setting_key']] = $row['setting_value'];
    }
    return $config;
}

/**
 * حفظ إعداد واحد
 */
function saveNotificationSetting($key, $value) {
    $conn = db();
    $key  = $conn->real_escape_string($key);
    $val  = $conn->real_escape_string($value ?? '');
    $conn->query("UPDATE notification_settings SET setting_value = '$val'
                  WHERE setting_key = '$key'");
    return ['success' => $conn->affected_rows >= 0];
}

/**
 * حفظ مجموعة إعدادات دفعة واحدة
 */
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
 * إنشاء إشعار داخلي
 */
function createInternalNotification($type, $scope, $refId, $refNumber, $title, $body, $severity, $recipientId = null) {
    $conn        = db();
    $type        = $conn->real_escape_string($type);
    $scope       = $conn->real_escape_string($scope);
    $refId       = $refId ? (int)$refId : 'NULL';
    $refNumber   = $conn->real_escape_string($refNumber ?? '');
    $title       = $conn->real_escape_string($title);
    $body        = $conn->real_escape_string($body ?? '');
    $severity    = $conn->real_escape_string($severity);
    $recipientId = $recipientId ? (int)$recipientId : 'NULL';

    $conn->query("INSERT INTO system_notifications
                  (type, scope, ref_id, ref_number, title, body, severity, recipient_id)
                  VALUES ('$type','$scope',$refId,'$refNumber','$title','$body','$severity',$recipientId)");

    return $conn->insert_id;
}

/**
 * جلب الإشعارات للمستخدم الحالي
 */
function getSystemNotifications($userId = null, $limit = 50, $unreadOnly = false) {
    $conn  = db();
    $uid   = $userId ? (int)$userId : 0;
    $where = $uid > 0
        ? "(recipient_id = $uid OR recipient_id IS NULL)"
        : "1=1";
    if ($unreadOnly) $where .= " AND is_read = 0";

    $res  = $conn->query("SELECT * FROM system_notifications
                          WHERE $where
                          ORDER BY created_at DESC
                          LIMIT " . (int)$limit);
    $rows = [];
    while ($r = $res->fetch_assoc()) $rows[] = $r;
    return $rows;
}

/**
 * عدد الإشعارات غير المقروءة
 */
function getUnreadNotificationCount($userId = null) {
    $conn  = db();
    $uid   = $userId ? (int)$userId : 0;
    $where = $uid > 0 ? "(recipient_id = $uid OR recipient_id IS NULL)" : "1=1";
    $r = $conn->query("SELECT COUNT(*) AS cnt FROM system_notifications
                       WHERE $where AND is_read = 0");
    return (int)($r->fetch_assoc()['cnt'] ?? 0);
}

/**
 * تعليم إشعار كمقروء
 */
function markNotificationRead($id, $userId = null) {
    $conn = db();
    $id   = (int)$id;
    $conn->query("UPDATE system_notifications
                  SET is_read=1, read_at=NOW()
                  WHERE id=$id");
    return ['success' => true];
}

/**
 * تعليم جميع الإشعارات كمقروءة
 */
function markAllNotificationsRead($userId = null) {
    $conn  = db();
    $uid   = $userId ? (int)$userId : 0;
    $where = $uid > 0 ? "(recipient_id=$uid OR recipient_id IS NULL)" : "1=1";
    $conn->query("UPDATE system_notifications SET is_read=1, read_at=NOW() WHERE $where AND is_read=0");
    return ['success' => true];
}


// ═══════════════════════════════════════════════════════════════
// ③ إرسال البريد عبر SMTP
// ═══════════════════════════════════════════════════════════════

/**
 * إرسال بريد عبر SMTP باستخدام PHP Sockets (بدون مكتبة خارجية)
 * تدعم: TLS (STARTTLS على 587)، SSL (465)، بدون تشفير (25/587)
 */
function sendSmtpEmail($to, $toName, $subject, $bodyHtml, $config = null) {
    if (!$config) $config = getNotificationSettings();

    $host      = $config['smtp_host']       ?? '';
    $port      = (int)($config['smtp_port'] ?? 587);
    $user      = $config['smtp_user']       ?? '';
    $pass      = $config['smtp_pass']       ?? '';
    $enc       = $config['smtp_encryption'] ?? 'tls';
    $fromName  = $config['smtp_from_name']  ?? 'نظام الإدارة';
    $fromEmail = $user;

    if (empty($host) || empty($user) || empty($pass)) {
        return ['success' => false, 'error' => 'إعدادات SMTP غير مكتملة'];
    }

    // استخدام mail() إذا كان الخادم لا يدعم التشفير
    if (function_exists('mail') && $enc === 'none') {
        $headers  = "MIME-Version: 1.0\r\n";
        $headers .= "Content-Type: text/html; charset=UTF-8\r\n";
        $headers .= "From: =?UTF-8?B?" . base64_encode($fromName) . "?= <{$fromEmail}>\r\n";
        $headers .= "Reply-To: {$fromEmail}\r\n";
        $sent = mail($to, '=?UTF-8?B?' . base64_encode($subject) . '?=', $bodyHtml, $headers);
        return $sent
            ? ['success' => true, 'method' => 'mail()']
            : ['success' => false, 'error' => 'mail() فشل'];
    }

    // SMTP عبر fsockopen / stream_socket_client
    try {
        $errno = 0; $errstr = '';
        $context = stream_context_create([
            'ssl' => [
                'verify_peer'       => false,
                'verify_peer_name'  => false,
                'allow_self_signed' => true,
            ]
        ]);

        $prefix = ($enc === 'ssl') ? 'ssl://' : '';
        $socket = stream_socket_client(
            "{$prefix}{$host}:{$port}", $errno, $errstr, 15,
            STREAM_CLIENT_CONNECT, $context
        );

        if (!$socket) {
            return ['success' => false, 'error' => "فشل الاتصال بـ SMTP: $errstr ($errno)"];
        }

        stream_set_timeout($socket, 15);

        $read = function() use ($socket) {
            $r = '';
            while ($line = fgets($socket, 515)) {
                $r .= $line;
                if ($line[3] === ' ') break;
            }
            return $r;
        };
        $send = function($cmd) use ($socket) { fwrite($socket, $cmd . "\r\n"); };

        $read(); // 220 greeting

        // EHLO
        $send("EHLO " . gethostname());
        $read();

        // STARTTLS إذا كان TLS
        if ($enc === 'tls') {
            $send("STARTTLS");
            $read();
            stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT);
            $send("EHLO " . gethostname());
            $read();
        }

        // AUTH LOGIN
        $send("AUTH LOGIN");
        $read();
        $send(base64_encode($user));
        $read();
        $send(base64_encode($pass));
        $authRes = $read();
        if (strpos($authRes, '235') === false) {
            fclose($socket);
            return ['success' => false, 'error' => 'فشل المصادقة SMTP: ' . trim($authRes)];
        }

        // MAIL FROM
        $send("MAIL FROM:<{$fromEmail}>");
        $read();

        // RCPT TO
        $send("RCPT TO:<{$to}>");
        $read();

        // DATA
        $send("DATA");
        $read();

        $message  = "From: =?UTF-8?B?" . base64_encode($fromName) . "?= <{$fromEmail}>\r\n";
        $message .= "To: =?UTF-8?B?" . base64_encode($toName) . "?= <{$to}>\r\n";
        $message .= "Subject: =?UTF-8?B?" . base64_encode($subject) . "?=\r\n";
        $message .= "MIME-Version: 1.0\r\n";
        $message .= "Content-Type: text/html; charset=UTF-8\r\n";
        $message .= "Content-Transfer-Encoding: base64\r\n";
        $message .= "\r\n";
        $message .= chunk_split(base64_encode($bodyHtml));
        $message .= "\r\n.";

        $send($message);
        $dataRes = $read();

        $send("QUIT");
        fclose($socket);

        $success = strpos($dataRes, '250') !== false;
        return $success
            ? ['success' => true, 'method' => 'SMTP']
            : ['success' => false, 'error' => 'SMTP رفض الرسالة: ' . trim($dataRes)];

    } catch (Exception $e) {
        return ['success' => false, 'error' => $e->getMessage()];
    }
}


// ═══════════════════════════════════════════════════════════════
// ④ Microsoft Exchange عبر Graph API
// ═══════════════════════════════════════════════════════════════

/**
 * الحصول على Access Token من Azure AD
 */
function getMsGraphToken($config = null) {
    if (!$config) $config = getNotificationSettings();

    $tenantId     = $config['ms_tenant_id']     ?? '';
    $clientId     = $config['ms_client_id']     ?? '';
    $clientSecret = $config['ms_client_secret'] ?? '';

    if (empty($tenantId) || empty($clientId) || empty($clientSecret)) {
        return ['success' => false, 'error' => 'إعدادات Exchange غير مكتملة'];
    }

    $url      = "https://login.microsoftonline.com/{$tenantId}/oauth2/v2.0/token";
    $postData = http_build_query([
        'grant_type'    => 'client_credentials',
        'client_id'     => $clientId,
        'client_secret' => $clientSecret,
        'scope'         => 'https://graph.microsoft.com/.default',
    ]);

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $postData,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_HTTPHEADER     => ['Content-Type: application/x-www-form-urlencoded'],
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error    = curl_error($ch);
    curl_close($ch);

    if ($error) return ['success' => false, 'error' => "cURL: $error"];

    $data = json_decode($response, true);
    if (!isset($data['access_token'])) {
        $msg = $data['error_description'] ?? $data['error'] ?? 'فشل الحصول على Token';
        return ['success' => false, 'error' => $msg];
    }

    return ['success' => true, 'token' => $data['access_token']];
}

/**
 * إرسال بريد عبر Microsoft Graph API (Exchange)
 */
function sendExchangeEmail($to, $toName, $subject, $bodyHtml, $config = null) {
    if (!$config) $config = getNotificationSettings();

    if (($config['ms_enabled'] ?? '0') !== '1') {
        return ['success' => false, 'error' => 'Exchange غير مفعّل'];
    }

    $senderEmail = $config['ms_sender_email'] ?? '';
    if (empty($senderEmail)) {
        return ['success' => false, 'error' => 'بريد المُرسِل غير محدد'];
    }

    $tokenResult = getMsGraphToken($config);
    if (!$tokenResult['success']) return $tokenResult;

    $token = $tokenResult['token'];

    $payload = json_encode([
        'message' => [
            'subject' => $subject,
            'body'    => ['contentType' => 'HTML', 'content' => $bodyHtml],
            'toRecipients' => [[
                'emailAddress' => ['address' => $to, 'name' => $toName]
            ]],
        ],
        'saveToSentItems' => true,
    ], JSON_UNESCAPED_UNICODE);

    $url = "https://graph.microsoft.com/v1.0/users/{$senderEmail}/sendMail";

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $payload,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_TIMEOUT        => 20,
        CURLOPT_HTTPHEADER     => [
            "Authorization: Bearer {$token}",
            'Content-Type: application/json',
            'Accept: application/json',
        ],
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr  = curl_error($ch);
    curl_close($ch);

    if ($curlErr) return ['success' => false, 'error' => "cURL: $curlErr"];

    if ($httpCode === 202) {
        return ['success' => true, 'method' => 'Exchange Graph API'];
    }

    $errData = json_decode($response, true);
    $msg     = $errData['error']['message'] ?? "HTTP {$httpCode}";
    return ['success' => false, 'error' => "Graph API: $msg"];
}


// ═══════════════════════════════════════════════════════════════
// ⑤ دالة الإرسال الموحدة (SLA/OLA عبر القنوات الثلاث)
// ═══════════════════════════════════════════════════════════════

/**
 * إرسال إشعار SLA/OLA عبر القنوات الثلاث
 *
 * @param string $breachType  ola_warning | ola_breach | sla_warning | sla_breach
 * @param string $scope       transaction | correspondence
 * @param int    $refId       id المعاملة أو المراسلة
 * @param string $refNumber   الرقم المرجعي
 * @param int    $employeeId  الموظف المسؤول
 * @param int    $escalateTo  الموظف المُصعَّد إليه
 * @param array  $extra       بيانات إضافية: stage, elapsed, allowed, pct
 */
function sendSlaNotification($breachType, $scope, $refId, $refNumber, $employeeId, $escalateTo, $extra = []) {
    $conn   = db();
    $config = getNotificationSettings();

    // بناء محتوى الإشعار
    $scopeLabel = $scope === 'correspondence' ? 'مراسلة' : 'معاملة';
    $stageLabel = $extra['stage_label'] ?? $extra['stage'] ?? '—';
    $elapsed    = _formatMinutes((int)($extra['elapsed'] ?? 0));
    $allowed    = _formatMinutes((int)($extra['allowed'] ?? 0));
    $pct        = number_format((float)($extra['pct'] ?? 0), 1);

    [$severity, $titleTpl, $icon] = match($breachType) {
        'ola_warning' => ['warning', 'تحذير OLA — {scope} {ref}', '⚠️'],
        'ola_breach'  => ['critical', 'تجاوزOLA — {scope} {ref} — تصعيد', '🔴'],
        'sla_warning' => ['warning', 'تحذير SLA — {scope} {ref}', '⚠️'],
        'sla_breach'  => ['critical', 'تجاوزSLA — {scope} {ref}', '🚨'],
        default       => ['info', 'إشعار — {scope} {ref}', 'ℹ️'],
    };

    $title    = str_replace(['{scope}','{ref}'], [$scopeLabel, $refNumber], $titleTpl);
    $body     = _buildNotificationBody($icon, $title, $stageLabel, $elapsed, $allowed, $pct, $extra);
    $bodyHtml = _buildEmailHtml($title, $body, $icon, $severity, $extra, $elapsed, $allowed, $pct);

    // ─── 1. إشعار داخلي ─────────────────────────────────────
    $notifIdEmployee   = null;
    $notifIdSupervisor = null;

    if ($employeeId) {
        $notifIdEmployee = createInternalNotification(
            $breachType, $scope, $refId, $refNumber,
            $title, $body, $severity, $employeeId
        );
    }
    if ($escalateTo && in_array($breachType, ['ola_breach','sla_breach'])) {
        $notifIdSupervisor = createInternalNotification(
            $breachType, $scope, $refId, $refNumber,
            "تصعيد: $title", $body, $severity, $escalateTo
        );
    }

    $results = ['internal' => 'ok'];

    // ─── 2. بريد SMTP ────────────────────────────────────────
    $shouldEmail = ($config["notify_on_{$breachType}"] ?? '0') === '1';
    if ($shouldEmail) {
        $emailsSent = [];

        if ($employeeId) {
            $emp = _getEmployeeEmail($conn, $employeeId);
            if ($emp['email']) {
                $emailsSent[] = sendSmtpEmail($emp['email'], $emp['name'], $title, $bodyHtml, $config);
            }
        }
        if ($escalateTo && in_array($breachType, ['ola_breach','sla_breach'])) {
            $sup = _getEmployeeEmail($conn, $escalateTo);
            if ($sup['email']) {
                $emailsSent[] = sendSmtpEmail($sup['email'], $sup['name'], "تصعيد: $title", $bodyHtml, $config);
            }
        }
        $results['smtp'] = $emailsSent;
    }

    // ─── 3. Exchange (Graph API) ─────────────────────────────
    $msEnabled = ($config['ms_enabled'] ?? '0') === '1';
    if ($msEnabled && $shouldEmail) {
        $exchSent = [];

        if ($employeeId) {
            $emp = _getEmployeeEmail($conn, $employeeId);
            if ($emp['email']) {
                $r = sendExchangeEmail($emp['email'], $emp['name'], $title, $bodyHtml, $config);
                $exchSent[] = $r;
                if ($r['success'] && $notifIdEmployee) {
                    $conn->query("UPDATE system_notifications
                                  SET exchange_sent=1, email_sent=1
                                  WHERE id=" . (int)$notifIdEmployee);
                }
            }
        }
        if ($escalateTo && in_array($breachType, ['ola_breach','sla_breach'])) {
            $sup = _getEmployeeEmail($conn, $escalateTo);
            if ($sup['email']) {
                $r = sendExchangeEmail($sup['email'], $sup['name'], "تصعيد: $title", $bodyHtml, $config);
                $exchSent[] = $r;
                if ($r['success'] && $notifIdSupervisor) {
                    $conn->query("UPDATE system_notifications
                                  SET exchange_sent=1, email_sent=1
                                  WHERE id=" . (int)$notifIdSupervisor);
                }
            }
        }
        $results['exchange'] = $exchSent;
    }

    return $results;
}


// ═══════════════════════════════════════════════════════════════
// ⑥ دوال مساعدة خاصة (private helpers)
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
    return "{$icon} {$title}\n"
        . "المرحلة: {$stageLabel}\n"
        . "الوقت المنقضي: {$elapsed} ({$pct}% من الوقت المسموح)\n"
        . "الوقت المسموح: {$allowed}";
}

function _buildEmailHtml($title, $body, $icon, $severity, $extra, $elapsed, $allowed, $pct) {
    $color      = $severity === 'critical' ? '#dc2626' : ($severity === 'warning' ? '#d97706' : '#2563eb');
    $bgLight    = $severity === 'critical' ? '#fef2f2' : ($severity === 'warning' ? '#fffbeb' : '#eff6ff');
    $stageLabel = $extra['stage_label'] ?? $extra['stage'] ?? '—';
    $refNumber  = $extra['ref_number'] ?? '';
    $scope      = ($extra['scope'] ?? 'transaction') === 'correspondence' ? 'مراسلة' : 'معاملة';

    $barWidth = min((float)$pct, 100);
    $barColor = (float)$pct >= 100 ? '#dc2626' : ($pct >= 80 ? '#d97706' : '#16a34a');

    return <<<HTML
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; background:#f3f4f6; margin:0; padding:20px; direction:rtl }
  .card { background:#fff; border-radius:12px; max-width:560px; margin:auto;
          border-top:4px solid {$color}; box-shadow:0 2px 12px rgba(0,0,0,.1); overflow:hidden }
  .header { background:{$color}; color:#fff; padding:20px 24px }
  .header h1 { margin:0; font-size:18px }
  .header .icon { font-size:28px; margin-bottom:8px }
  .body { padding:24px }
  .badge { display:inline-block; background:{$bgLight}; color:{$color};
           border:1px solid {$color}40; border-radius:6px; padding:4px 12px; font-size:13px; font-weight:bold }
  .info-row { display:flex; justify-content:space-between; padding:10px 0;
              border-bottom:1px solid #e5e7eb; font-size:14px }
  .info-row:last-child { border:none }
  .label { color:#6b7280 }
  .value { font-weight:600; color:#111827 }
  .bar-wrap { background:#e5e7eb; border-radius:6px; height:10px; overflow:hidden; margin:12px 0 }
  .bar-fill { background:{$barColor}; height:100%; width:{$barWidth}% }
  .footer { background:#f9fafb; padding:16px 24px; font-size:12px; color:#9ca3af; text-align:center }
  .pct { font-size:22px; font-weight:800; color:{$barColor} }
</style>
</head>
<body>
<div class="card">
  <div class="header">
    <div class="icon">{$icon}</div>
    <h1>{$title}</h1>
  </div>
  <div class="body">
    <p style="margin-top:0">
      <span class="badge">{$scope}: {$refNumber}</span>
    </p>
    <div class="info-row">
      <span class="label">المرحلة</span>
      <span class="value">{$stageLabel}</span>
    </div>
    <div class="info-row">
      <span class="label">الوقت المنقضي</span>
      <span class="value">{$elapsed}</span>
    </div>
    <div class="info-row">
      <span class="label">الوقت المسموح (OLA)</span>
      <span class="value">{$allowed}</span>
    </div>
    <div style="margin:16px 0 4px">
      <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px">
        <span style="color:#6b7280">نسبة الاستهلاك</span>
        <span class="pct">{$pct}%</span>
      </div>
      <div class="bar-wrap"><div class="bar-fill"></div></div>
    </div>
  </div>
  <div class="footer">
    هذا إشعار تلقائي من نظام متابعة SLA/OLA — لا تردّ على هذا البريد
  </div>
</div>
</body>
</html>
HTML;
}


// ═══════════════════════════════════════════════════════════════
// ⑦ اختبار الإعدادات
// ═══════════════════════════════════════════════════════════════

/**
 * اختبار SMTP بإرسال رسالة تجريبية
 */
function testSmtpConnection($testEmail) {
    $config = getNotificationSettings();
    $html   = _buildEmailHtml(
        'اختبار إعدادات SMTP', '', '✅', 'info',
        ['scope' => 'system', 'ref_number' => 'TEST-001', 'stage_label' => 'اختبار'],
        '5 دقائق', '10 دقائق', '50.0'
    );
    return sendSmtpEmail($testEmail, 'مسؤول النظام', 'اختبار SMTP — نظام SLA', $html, $config);
}

/**
 * اختبار Exchange بإرسال رسالة تجريبية
 */
function testExchangeConnection($testEmail) {
    $config = getNotificationSettings();
    if (($config['ms_enabled'] ?? '0') !== '1') {
        return ['success' => false, 'error' => 'Exchange غير مفعّل في الإعدادات'];
    }
    $html = _buildEmailHtml(
        'اختبار Exchange Graph API', '', '✅', 'info',
        ['scope' => 'system', 'ref_number' => 'TEST-001', 'stage_label' => 'اختبار'],
        '5 دقائق', '10 دقائق', '50.0'
    );
    return sendExchangeEmail($testEmail, 'مسؤول النظام', 'اختبار Exchange — نظام SLA', $html, $config);
}