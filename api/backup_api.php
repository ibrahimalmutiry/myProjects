<?php
/**
 * backup_api.php
 * API للنسخ الاحتياطي — يُستدعى من لوحة النظام
 * يتطلب: صلاحية system_admin فقط
 */

require_once __DIR__ . '/../includes/config.php';
setApiSecurityHeaders();
secureSession();

header('Content-Type: application/json; charset=utf-8');

// ── التحقق من الصلاحية ──────────────────────────────────────────
if (empty($_SESSION['user_id'])) {
    jsonResponse(['success' => false, 'message' => 'غير مصرح'], 401);
}
$permLevel = $_SESSION['permission_level'] ?? 'employee';
if ($permLevel !== 'system_admin') {
    jsonResponse(['success' => false, 'message' => 'هذه العملية تتطلب صلاحية مدير النظام'], 403);
}

// ── Rate Limiting — مرة واحدة كل 10 دقائق ──────────────────────
apiRateLimit('manual_backup', 3, 600);

$action = $_GET['action'] ?? '';

try {
    switch ($action) {

        // ── تشغيل نسخة يدوية ───────────────────────────────────
        case 'run':
            $backupScript = dirname(__DIR__) . '/backup.sh';
            if (!file_exists($backupScript)) {
                jsonResponse(['success' => false, 'message' => 'سكريبت backup.sh غير موجود'], 404);
            }

            // تشغيل في الخلفية بأقل أولوية ممكنة
            // 2>&1: دمج stderr مع stdout
            // &: تشغيل في الخلفية
            $logFile = dirname(__DIR__) . '/logs/manual_backup_' . date('Ymd_His') . '.log';
            $cmd = sprintf(
                'nice -n 19 ionice -c3 /bin/bash %s >> %s 2>&1 &',
                escapeshellarg($backupScript),
                escapeshellarg($logFile)
            );
            exec($cmd);

            // سجّل في audit log
            auditLog('manual_backup_triggered', 'system', 0, [
                'log_file' => basename($logFile),
            ]);

            jsonResponse([
                'success' => true,
                'message' => 'بدأت النسخة الاحتياطية في الخلفية',
                'log'     => basename($logFile),
                'note'    => 'قد تستغرق بضع دقائق حسب حجم البيانات',
            ]);
            break;

        // ── قائمة النسخ الموجودة ────────────────────────────────
        case 'list':
            $backupRoot = '/var/backups/workflow';
            $backups    = [];

            foreach (['daily', 'weekly', 'monthly'] as $type) {
                $dir = "$backupRoot/$type";
                if (!is_dir($dir)) continue;

                $files = glob("$dir/db_*.sql.gz") ?: [];
                rsort($files); // الأحدث أولاً

                foreach (array_slice($files, 0, 5) as $f) {
                    $backups[] = [
                        'type'    => $type,
                        'name'    => basename($f),
                        'size'    => _formatBytes(filesize($f)),
                        'date'    => date('Y-m-d H:i', filemtime($f)),
                        'age_hrs' => round((time() - filemtime($f)) / 3600, 1),
                    ];
                }
            }

            // إحصائيات المساحة
            $diskFree  = disk_free_space($backupRoot) ?: 0;
            $diskTotal = disk_total_space($backupRoot) ?: 0;

            jsonResponse([
                'success'    => true,
                'backups'    => $backups,
                'disk_free'  => _formatBytes($diskFree),
                'disk_total' => _formatBytes($diskTotal),
                'disk_pct'   => $diskTotal > 0 ? round((1 - $diskFree / $diskTotal) * 100) : 0,
            ]);
            break;

        // ── حالة آخر نسخة ──────────────────────────────────────
        case 'status':
            $backupRoot = '/var/backups/workflow';
            $lastBackup = null;
            $lastFile   = null;

            foreach (['daily', 'weekly', 'monthly'] as $type) {
                $dir   = "$backupRoot/$type";
                $files = glob("$dir/db_*.sql.gz") ?: [];
                if (empty($files)) continue;
                rsort($files);
                $mtime = filemtime($files[0]);
                if ($lastBackup === null || $mtime > $lastBackup) {
                    $lastBackup = $mtime;
                    $lastFile   = $files[0];
                }
            }

            if ($lastFile) {
                $hoursAgo = round((time() - $lastBackup) / 3600, 1);
                jsonResponse([
                    'success'         => true,
                    'last_backup'     => date('Y-m-d H:i', $lastBackup),
                    'last_file'       => basename($lastFile),
                    'last_size'       => _formatBytes(filesize($lastFile)),
                    'hours_ago'       => $hoursAgo,
                    'status'          => $hoursAgo < 25 ? 'ok' : 'warning',
                    'status_label'    => $hoursAgo < 25 ? 'محدّث' : 'قديم — تحقق من CRON',
                ]);
            } else {
                jsonResponse([
                    'success'      => true,
                    'last_backup'  => null,
                    'status'       => 'missing',
                    'status_label' => 'لا توجد نسخ — شغّل النسخة الأولى',
                ]);
            }
            break;

        default:
            jsonResponse(['success' => false, 'message' => 'action غير معروف'], 400);
    }

} catch (Exception $e) {
    error_log('Backup API Error: ' . $e->getMessage());
    jsonResponse(['success' => false, 'message' => 'خطأ داخلي'], 500);
}

function _formatBytes(int $bytes): string {
    if ($bytes <= 0)           return '0 ب';
    if ($bytes < 1024)         return $bytes . ' ب';
    if ($bytes < 1048576)      return round($bytes / 1024, 1)     . ' ك.ب';
    if ($bytes < 1073741824)   return round($bytes / 1048576, 1)  . ' م.ب';
    return round($bytes / 1073741824, 2) . ' ج.ب';
}
