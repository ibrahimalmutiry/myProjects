# إعداد CRON Jobs

## SLA Checker — كل 15 دقيقة

### عبر crontab (SSH):
```bash
crontab -e
```
أضف السطر التالي (عدّل المسار):
```
*/15 * * * * php /home/your_user/public_html/cron/sla_checker.php >> /home/your_user/logs/cron.log 2>&1
```

### عبر cPanel:
1. Cron Jobs → Add New Cron Job
2. Common Settings: Every 15 Minutes
3. Command:
```
php /home/your_user/public_html/cron/sla_checker.php >> /home/your_user/logs/cron.log 2>&1
```

### اختبار يدوي:
```bash
php cron/sla_checker.php
```

### عبر HTTP (طارئ):
```
https://yourdomain.com/cron/sla_checker.php?cron_token=YOUR_CRON_TOKEN
```
أضف `CRON_TOKEN=your_secret` في `.env`
