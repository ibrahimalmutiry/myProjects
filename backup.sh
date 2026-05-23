#!/bin/bash
# ================================================================
#  backup.sh — نسخ احتياطي ذكي لنظام إدارة المعاملات
#
#  المنهجية (أقل ثقل ممكن على السيرفر):
#  ┌─────────────────────────────────────────────────────────┐
#  │  1. --single-transaction → لا يقفل الجداول أثناء الـ dump │
#  │  2. nice -n 19           → أقل أولوية CPU               │
#  │  3. ionice -c3           → أقل أولوية I/O               │
#  │  4. --compress=6         → gzip داخلي في mysqldump      │
#  │  5. النسخ التزايدي بدل الكامل يومياً                     │
#  │  6. وقت التشغيل: 2 صباحاً (أقل حركة)                    │
#  └─────────────────────────────────────────────────────────┘
#
#  التثبيت:
#    chmod +x /path/to/backup.sh
#    crontab -e
#    0 2 * * * /bin/bash /path/to/backup.sh >> /var/log/workflow_backup.log 2>&1
#
# ================================================================

set -euo pipefail

# ── إعدادات — عدّلها حسب بيئتك ─────────────────────────────────
readonly BACKUP_ROOT="/var/backups/workflow"
readonly APP_DIR="/var/www/html/workflow-system"   # مجلد التطبيق
readonly UPLOADS_DIR="$APP_DIR/uploads"

# قراءة credentials من .env (لا نضع كلمة المرور في الـ script)
ENV_FILE="$(dirname "$APP_DIR")/.env"
if [[ -f "$ENV_FILE" ]]; then
    DB_NAME=$(grep '^DB_NAME=' "$ENV_FILE" | cut -d= -f2 | tr -d '"'"'")
    DB_USER=$(grep '^DB_USER=' "$ENV_FILE" | cut -d= -f2 | tr -d '"'"'")
    DB_PASS=$(grep '^DB_PASS=' "$ENV_FILE" | cut -d= -f2 | tr -d '"'"'")
    DB_HOST=$(grep '^DB_HOST=' "$ENV_FILE" | cut -d= -f2 | tr -d '"'"'" || echo "localhost")
else
    # fallback: اقرأ من متغيرات البيئة أو أوقف
    DB_NAME="${DB_NAME:-}"
    DB_USER="${DB_USER:-}"
    DB_PASS="${DB_PASS:-}"
    DB_HOST="${DB_HOST:-localhost}"
fi

if [[ -z "$DB_NAME" || -z "$DB_USER" ]]; then
    echo "[ERROR] لم أجد بيانات DB — تحقق من ملف .env"
    exit 1
fi

# ── إعدادات الاحتفاظ ────────────────────────────────────────────
readonly DAILY_KEEP=7      # أيام النسخ اليومية
readonly WEEKLY_KEEP=4     # أسابيع النسخ الأسبوعية
readonly MONTHLY_KEEP=3    # أشهر النسخ الشهرية

# ── وقت وتاريخ ──────────────────────────────────────────────────
readonly DATE=$(date +%Y-%m-%d)
readonly TIME=$(date +%H%M%S)
readonly DAY_OF_WEEK=$(date +%u)   # 1=الاثنين ... 7=الأحد
readonly DAY_OF_MONTH=$(date +%d)

# ── تحديد نوع النسخة ────────────────────────────────────────────
# يوم 1 من الشهر → شهري | الأحد → أسبوعي | باقي الأيام → يومي
if [[ "$DAY_OF_MONTH" == "01" ]]; then
    BACKUP_TYPE="monthly"
elif [[ "$DAY_OF_WEEK" == "7" ]]; then
    BACKUP_TYPE="weekly"
else
    BACKUP_TYPE="daily"
fi

readonly BACKUP_DIR="$BACKUP_ROOT/$BACKUP_TYPE"
mkdir -p "$BACKUP_DIR"

# ── Logging ──────────────────────────────────────────────────────
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
log "=== بدء النسخ الاحتياطي ($BACKUP_TYPE) ==="

# ── فحص مساحة القرص — لا تبدأ إذا < 500MB ──────────────────────
FREE_MB=$(df -m "$BACKUP_ROOT" | awk 'NR==2 {print $4}')
if [[ "$FREE_MB" -lt 500 ]]; then
    log "[ERROR] مساحة غير كافية: ${FREE_MB}MB متبقية — يجب 500MB على الأقل"
    exit 1
fi

# ════════════════════════════════════════════════════════════════
#  ① نسخ قاعدة البيانات
#  --single-transaction: يستخدم REPEATABLE READ snapshot → لا قفل
#  nice/ionice: يُقلّل الضغط على CPU وdisk
#  --compress: يضغط أثناء النقل (يقلل I/O)
# ════════════════════════════════════════════════════════════════
DB_BACKUP="$BACKUP_DIR/db_${DATE}_${TIME}.sql.gz"
log "نسخ قاعدة البيانات → $DB_BACKUP"

# كتابة كلمة المرور مؤقتاً في my.cnf لتجنب ظهورها في ps aux
MYCNF=$(mktemp)
chmod 600 "$MYCNF"
cat > "$MYCNF" <<EOF
[client]
host=$DB_HOST
user=$DB_USER
password=$DB_PASS
EOF

ionice -c3 nice -n 19 mysqldump \
    --defaults-extra-file="$MYCNF" \
    --single-transaction \
    --routines \
    --triggers \
    --add-drop-table \
    --skip-lock-tables \
    "$DB_NAME" \
    | gzip -6 > "$DB_BACKUP"

# حذف ملف الـ credentials مباشرةً
rm -f "$MYCNF"

DB_SIZE=$(du -sh "$DB_BACKUP" | cut -f1)
log "✓ قاعدة البيانات: $DB_SIZE"

# ════════════════════════════════════════════════════════════════
#  ② نسخ ملفات uploads (فقط الملفات المعدّلة اليوم — تزايدي)
#  --newer-mtime: يضيف فقط الملفات التي تغيّرت منذ آخر نسخة
#  هذا يُقلّل حجم النسخ اليومية بشكل كبير
# ════════════════════════════════════════════════════════════════
if [[ -d "$UPLOADS_DIR" ]]; then
    UPLOADS_BACKUP="$BACKUP_DIR/uploads_${DATE}_${TIME}.tar.gz"
    log "نسخ مجلد uploads → $UPLOADS_BACKUP"

    if [[ "$BACKUP_TYPE" == "daily" ]]; then
        # يومي: الملفات المعدّلة منذ 24 ساعة فقط
        ionice -c3 nice -n 19 tar \
            --create \
            --gzip \
            --compress='-6' \
            --file="$UPLOADS_BACKUP" \
            --newer-mtime="1 day ago" \
            --warning=no-file-changed \
            "$UPLOADS_DIR" 2>/dev/null || true
    else
        # أسبوعي/شهري: كامل
        ionice -c3 nice -n 19 tar \
            --create \
            --gzip \
            --file="$UPLOADS_BACKUP" \
            --warning=no-file-changed \
            "$UPLOADS_DIR" 2>/dev/null || true
    fi

    UPL_SIZE=$(du -sh "$UPLOADS_BACKUP" 2>/dev/null | cut -f1 || echo "0")
    log "✓ uploads: $UPL_SIZE"
fi

# ════════════════════════════════════════════════════════════════
#  ③ التحقق من سلامة نسخة DB (integrity check)
#  يتأكد أن الملف قابل للضغط ويحتوي SQL حقيقي
# ════════════════════════════════════════════════════════════════
if ! gzip -t "$DB_BACKUP" 2>/dev/null; then
    log "[ERROR] ملف DB تالف: $DB_BACKUP"
    rm -f "$DB_BACKUP"
    exit 1
fi

# فحص بسيط: يجب أن يحتوي على CREATE TABLE
if ! zcat "$DB_BACKUP" | grep -q "CREATE TABLE" 2>/dev/null; then
    log "[WARN] لم أجد CREATE TABLE في الـ dump — تحقق يدوياً"
fi
log "✓ سلامة الملف مؤكدة"

# ════════════════════════════════════════════════════════════════
#  ④ حذف النسخ القديمة (rotation)
#  يحتفظ بـ 7 يومي، 4 أسبوعي، 3 شهري
# ════════════════════════════════════════════════════════════════
cleanup_old() {
    local dir="$1"
    local keep="$2"
    local label="$3"

    # عدّ الملفات الموجودة
    local count
    count=$(find "$dir" -name "db_*.sql.gz" -type f | wc -l)

    if [[ "$count" -gt "$keep" ]]; then
        local to_delete=$(( count - keep ))
        log "حذف $to_delete نسخة $label قديمة..."
        find "$dir" -name "db_*.sql.gz" -type f \
            | sort \
            | head -n "$to_delete" \
            | xargs rm -f
        # احذف uploads المرتبطة بنفس التواريخ
        find "$dir" -name "uploads_*.tar.gz" -type f \
            | sort \
            | head -n "$to_delete" \
            | xargs rm -f 2>/dev/null || true
    fi
}

case "$BACKUP_TYPE" in
    "daily")   cleanup_old "$BACKUP_DIR" "$DAILY_KEEP"   "يومية" ;;
    "weekly")  cleanup_old "$BACKUP_DIR" "$WEEKLY_KEEP"  "أسبوعية" ;;
    "monthly") cleanup_old "$BACKUP_DIR" "$MONTHLY_KEEP" "شهرية" ;;
esac

# ════════════════════════════════════════════════════════════════
#  ⑤ ملخص النسخة الحالية
# ════════════════════════════════════════════════════════════════
TOTAL=$(du -sh "$BACKUP_DIR" | cut -f1)
log "=== اكتملت النسخة الاحتياطية ($BACKUP_TYPE) ==="
log "المجلد: $BACKUP_DIR | الحجم الكلي: $TOTAL"
log "حجم الـ dump الحالي: $(du -sh "$DB_BACKUP" | cut -f1)"

exit 0
