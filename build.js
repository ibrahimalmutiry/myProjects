#!/usr/bin/env node
/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║   build.js — سكريبت البناء والضغط لملفات JavaScript         ║
 * ║                                                              ║
 * ║  الاستخدام (من مجلد المشروع):                               ║
 * ║    node build.js            ← بناء عادي                     ║
 * ║    node build.js --watch    ← مراقبة التغييرات تلقائياً     ║
 * ║    node build.js --clean    ← حذف الملفات القديمة فقط       ║
 * ║                                                              ║
 * ║  المتطلبات: npm install -g terser                            ║
 * ║  المخرجات:  app.bundle.v{hash}.min.js  (في جذر المشروع)     ║
 * ║             manifest.json              (في جذر المشروع)     ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ═══════════════════════════════════════════════════════════
//  الإعدادات
// ═══════════════════════════════════════════════════════════

const PROJECT_ROOT = path.resolve(__dirname);

// كشف مكان الملفات: الجذر مباشرة أو داخل js/
const JS_SRC = fs.existsSync(path.join(PROJECT_ROOT, 'js', 'pdf-engine.js'))
    ? path.join(PROJECT_ROOT, 'js')
    : PROJECT_ROOT;

// مخرجات البناء: دائماً في الجذر (manifest.json + bundle)
const DIST_DIR = PROJECT_ROOT;
const MANIFEST = path.join(DIST_DIR, 'manifest.json');

/**
 * ترتيب الملفات مطابق تماماً لما في index.php
 * ⚠️  pdf-engine.js يجب أن يكون أولاً (يعرّف PdfEngine و downloadAsPDF)
 * ⚠️  app-common.js ثانياً (يعرّف App, DOM, switchTab)
 */
const JS_FILES = [
    'pdf-engine.js',
    'app-common.js',
    'app-notifications.js',
    'app-dashboard.js',
    'app-transactions.js',
    'app-sla.js',
    'app-budget.js',
    'app-bank.js',
    'app-daily-payments.js',
    'app-ceo-approvals.js',
    'correspondence.js',
    'excel-import-ui.js',
    'app-archive.js',
    'app-performance.js',
    'app-settings-core.js',
    'app-settings-budget.js',
    'app-settings-employees.js',
    'app-settings-system.js',
    'app-settings-types.js',
    'sidebar-init.js',
    'app-profile.js',
];

// ═══════════════════════════════════════════════════════════
//  دوال المساعدة
// ═══════════════════════════════════════════════════════════

function log(msg, type = 'info') {
    const icons = { info: '→', success: '✓', warn: '⚠', error: '✗', title: '═' };
    const colors = {
        info: '\x1b[36m',
        success: '\x1b[32m',
        warn: '\x1b[33m',
        error: '\x1b[31m',
        title: '\x1b[35m',
        reset: '\x1b[0m',
    };
    console.log(`${colors[type] || colors.info}${icons[type] || '•'} ${msg}${colors.reset}`);
}

function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function contentHash(str) {
    return crypto.createHash('md5').update(str).digest('hex').slice(0, 8);
}

// ═══════════════════════════════════════════════════════════
//  تحقق من وجود terser
// ═══════════════════════════════════════════════════════════

function checkTerser() {
    const result = spawnSync('terser', ['--version'], { encoding: 'utf8' });
    if (result.status !== 0) {
        log('terser غير مثبّت. شغّل: npm install -g terser', 'error');
        process.exit(1);
    }
    log(`Terser ${result.stdout.trim()} متوفر`, 'success');
}

// ═══════════════════════════════════════════════════════════
//  حذف ملفات bundle القديمة من الجذر
// ═══════════════════════════════════════════════════════════

function cleanDist() {
    let removed = 0;
    // حذف bundles القديمة من الجذر (app.bundle.v*.min.js)
    fs.readdirSync(DIST_DIR).forEach(file => {
        if (/^app\.bundle\.v[a-f0-9]+\.min\.js$/.test(file) ||
            /^app_bundle_v[a-f0-9]+_min\.js$/.test(file)) {
            fs.unlinkSync(path.join(DIST_DIR, file));
            removed++;
            log(`  حُذف: ${file}`, 'info');
        }
    });
    if (removed > 0) log(`حُذف ${removed} bundle قديم`, 'info');
    else log('لا توجد bundles قديمة', 'info');
}

// ═══════════════════════════════════════════════════════════
//  دمج الملفات
// ═══════════════════════════════════════════════════════════

function combineFiles() {
    log('دمج الملفات من: ' + JS_SRC, 'info');
    const missing = [];
    const parts = [];

    JS_FILES.forEach(filename => {
        const filePath = path.join(JS_SRC, filename);
        if (!fs.existsSync(filePath)) {
            missing.push(filename);
            log(`  ✗ ${filename} — غير موجود`, 'warn');
            return;
        }
        const content = fs.readFileSync(filePath, 'utf8');
        parts.push(`\n/* ══ ${filename} ══ */\n${content}`);
        log(`  ✓ ${filename} (${formatBytes(content.length)})`, 'info');
    });

    if (missing.length > 0) {
        log(`تحذير: ${missing.length} ملف غير موجود`, 'warn');
    }

    return parts.join('\n');
}

// ═══════════════════════════════════════════════════════════
//  تصغير الكود عبر terser
// ═══════════════════════════════════════════════════════════

function minify(combinedCode) {
    log('تصغير الكود (terser)...', 'info');

    const tempIn = path.join(DIST_DIR, '_input.tmp.js');
    const tempOut = path.join(DIST_DIR, '_output.tmp.js');

    fs.writeFileSync(tempIn, combinedCode, 'utf8');

    const result = spawnSync('terser', [
        tempIn,
        '--compress',
        '--output', tempOut,
    ], { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });

    if (fs.existsSync(tempIn)) fs.unlinkSync(tempIn);

    if (result.status !== 0) {
        log(`فشل terser:\n${result.stderr}`, 'error');
        if (fs.existsSync(tempOut)) fs.unlinkSync(tempOut);
        process.exit(1);
    }

    const minified = fs.readFileSync(tempOut, 'utf8');
    fs.unlinkSync(tempOut);
    return minified;
}

// ═══════════════════════════════════════════════════════════
//  البناء الكامل
// ═══════════════════════════════════════════════════════════

function build() {
    const startTime = Date.now();

    log('═══════════════════════════════════════════', 'title');
    log('  بناء JS Bundle — نظام إدارة المعاملات   ', 'title');
    log('═══════════════════════════════════════════', 'title');

    checkTerser();
    cleanDist();

    // دمج
    const combined = combineFiles();
    const originalSize = Buffer.byteLength(combined, 'utf8');

    // تصغير
    const minified = minify(combined);
    const minifiedSize = Buffer.byteLength(minified, 'utf8');

    // اسم الملف مع Hash
    const hash = contentHash(minified);
    const bundleName = `app.bundle.v${hash}.min.js`;
    const bundlePath = path.join(DIST_DIR, bundleName);

    fs.writeFileSync(bundlePath, minified, 'utf8');

    // manifest.json في الجذر
    const savingPct = (((originalSize - minifiedSize) / originalSize) * 100).toFixed(1);
    const manifest = {
        bundle: bundleName,
        hash: hash,
        built_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
        files_count: JS_FILES.length,
        original_size: originalSize,
        bundle_size: minifiedSize,
        saving_percent: parseFloat(savingPct),
    };
    fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2), 'utf8');

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    log('═══════════════════════════════════════════', 'title');
    log(` اكتمل البناء في ${elapsed}s`, 'success');
    log('═══════════════════════════════════════════', 'title');
    log(`الملف:         ${bundleName}`, 'success');
    log(`الملفات:       ${JS_FILES.length} ملف → 1 ملف`, 'success');
    log(`الحجم الأصلي:  ${formatBytes(originalSize)}`, 'info');
    log(`بعد التصغير:   ${formatBytes(minifiedSize)} (وفّر ${savingPct}%)`, 'success');
    log(`طلبات HTTP:    22 طلب → 1 طلب`, 'success');
    log('═══════════════════════════════════════════', 'title');
}

// ═══════════════════════════════════════════════════════════
//  وضع المراقبة --watch
// ═══════════════════════════════════════════════════════════

function watch() {
    log('وضع المراقبة — يراقب تغييرات: ' + JS_SRC, 'info');
    log('اضغط Ctrl+C للإيقاف\n', 'info');

    build(); // بناء أولي

    let debounceTimer = null;

    fs.watch(JS_SRC, { recursive: false }, (eventType, filename) => {
        if (!filename || !filename.endsWith('.js')) return;
        // تجاهل bundles والملفات المؤقتة
        if (/bundle|\.min\.js|\.tmp\.js/.test(filename)) return;

        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            log(`\nتغيير في: ${filename}`, 'warn');
            build();
        }, 500);
    });
}

// ═══════════════════════════════════════════════════════════
//  نقطة الدخول
// ═══════════════════════════════════════════════════════════

const args = process.argv.slice(2);

if (args.includes('--clean')) {
    cleanDist();
    log('تم حذف dist/ ← سيعود النظام للملفات الفردية', 'success');
} else if (args.includes('--watch')) {
    watch();
} else {
    build();
}