#!/usr/bin/env node
/**
 * build.js — سكريبت البناء باستخدام esbuild
 * يدعم async/await بشكل كامل وأسرع بـ 100x من terser
 *
 * التثبيت (مرة واحدة):
 *   npm install --save-dev esbuild
 *
 * الاستخدام:
 *   node build.js          ← بناء عادي
 *   node build.js --watch  ← مراقبة تلقائية
 *   node build.js --clean  ← حذف الـ bundles القديمة
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PROJECT_ROOT = path.resolve(__dirname);

const JS_SRC = fs.existsSync(path.join(PROJECT_ROOT, 'js', 'pdf-engine.js'))
    ? path.join(PROJECT_ROOT, 'js')
    : PROJECT_ROOT;

const DIST_DIR = PROJECT_ROOT;
const MANIFEST = path.join(DIST_DIR, 'manifest.json');

const JS_FILES = [
    'pdf-engine.js',
    'app-common.js',
    'app-i18n.js',
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
    'app-settings-suppliers.js',
    'app-settings-system.js',
    'app-settings-types.js',
    'sidebar-init.js',
    'app-profile.js',
    'app-purchase-requests.js',
    'app-reports.js',
];

const C = { reset: '\x1b[0m', green: '\x1b[32m', cyan: '\x1b[36m', yellow: '\x1b[33m', red: '\x1b[31m', magenta: '\x1b[35m' };

function log(msg, type = 'info') {
    const map = { info: [C.cyan, '→'], success: [C.green, '✓'], warn: [C.yellow, '⚠'], error: [C.red, '✗'], title: [C.magenta, '═'] };
    const [color, icon] = map[type] || map.info;
    console.log(`${color}${icon} ${msg}${C.reset}`);
}

function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function contentHash(str) {
    return crypto.createHash('md5').update(str).digest('hex').slice(0, 8);
}

function checkEsbuild() {
    const localBin = path.join(PROJECT_ROOT, 'node_modules', '.bin', 'esbuild');
    if (fs.existsSync(localBin)) return localBin;
    const global = spawnSync('esbuild', ['--version'], { encoding: 'utf8' });
    if (global.status === 0) { log(`esbuild ${global.stdout.trim()} متوفر`, 'success'); return 'esbuild'; }
    log('esbuild غير مثبّت — جاري التثبيت...', 'warn');
    const install = spawnSync('npm', ['install', '--save-dev', 'esbuild'], { encoding: 'utf8', cwd: PROJECT_ROOT, stdio: 'inherit' });
    if (install.status !== 0) { log('فشل تثبيت esbuild', 'error'); process.exit(1); }
    log('تم تثبيت esbuild', 'success');
    return fs.existsSync(localBin) ? localBin : 'esbuild';
}

function cleanDist() {
    let removed = 0;
    fs.readdirSync(DIST_DIR).forEach(file => {
        if (/^app\.bundle\.v[a-f0-9]+\.min\.js$/.test(file)) {
            fs.unlinkSync(path.join(DIST_DIR, file));
            removed++;
            log(`  حُذف: ${file}`, 'info');
        }
    });
    if (removed > 0) log(`حُذف ${removed} bundle قديم`, 'info');
    else log('لا توجد bundles قديمة', 'info');
}

function combineFiles() {
    log('دمج الملفات من: ' + JS_SRC, 'info');
    const missing = [];
    const parts = [];
    JS_FILES.forEach(filename => {
        const filePath = path.join(JS_SRC, filename);
        if (!fs.existsSync(filePath)) { missing.push(filename); log(`  ✗ ${filename} — غير موجود`, 'warn'); return; }
        const content = fs.readFileSync(filePath, 'utf8');
        // فاصلة منقوطة بين كل ملف وآخر — تمنع مشاكل ASI
        parts.push(`;\n/* ══ ${filename} ══ */\n${content}\n;`);
        log(`  ✓ ${filename} (${formatBytes(content.length)})`, 'info');
    });
    if (missing.length > 0) log(`تحذير: ${missing.length} ملف غير موجود`, 'warn');
    return parts.join('\n');
}

function build() {
    const startTime = Date.now();
    log('═══════════════════════════════════════════', 'title');
    log('  بناء JS Bundle — نظام إدارة المعاملات   ', 'title');
    log('═══════════════════════════════════════════', 'title');

    const esbuild = checkEsbuild();
    cleanDist();

    const combined = combineFiles();
    const originalSize = Buffer.byteLength(combined, 'utf8');

    const tempIn = path.join(DIST_DIR, '_input.tmp.js');
    const tempOut = path.join(DIST_DIR, '_output.tmp.js');
    fs.writeFileSync(tempIn, combined, 'utf8');

    log('تصغير الكود (esbuild)...', 'info');

    const result = spawnSync(esbuild, [
        tempIn,
        '--bundle=false',
        '--minify',
        '--target=es2020',
        '--platform=browser',
        `--outfile=${tempOut}`,
    ], { encoding: 'utf8', maxBuffer: 100 * 1024 * 1024 });

    if (fs.existsSync(tempIn)) fs.unlinkSync(tempIn);

    let minified;
    if (result.status !== 0) {
        log(`esbuild فشل:\n${result.stderr}`, 'error');
        log('fallback: الكود بدون ضغط', 'warn');
        if (fs.existsSync(tempOut)) fs.unlinkSync(tempOut);
        minified = combined;
    } else {
        minified = fs.readFileSync(tempOut, 'utf8');
        if (fs.existsSync(tempOut)) fs.unlinkSync(tempOut);
    }

    const minifiedSize = Buffer.byteLength(minified, 'utf8');
    const hash = contentHash(minified);
    const bundleName = `app.bundle.v${hash}.min.js`;
    fs.writeFileSync(path.join(DIST_DIR, bundleName), minified, 'utf8');

    const savingPct = originalSize > 0 ? (((originalSize - minifiedSize) / originalSize) * 100).toFixed(1) : '0.0';
    fs.writeFileSync(MANIFEST, JSON.stringify({
        bundle: bundleName, hash, built_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
        files_count: JS_FILES.length, original_size: originalSize, bundle_size: minifiedSize,
        saving_percent: parseFloat(savingPct),
    }, null, 2), 'utf8');

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    log('═══════════════════════════════════════════', 'title');
    log(` اكتمل البناء في ${elapsed}s`, 'success');
    log(`الملف:         ${bundleName}`, 'success');
    log(`الحجم الأصلي:  ${formatBytes(originalSize)}`, 'info');
    log(`بعد التصغير:   ${formatBytes(minifiedSize)} (وفّر ${savingPct}%)`, 'success');
    log('═══════════════════════════════════════════', 'title');
}

function watch() {
    log('وضع المراقبة — ' + JS_SRC, 'info');
    log('اضغط Ctrl+C للإيقاف\n', 'info');
    build();
    let debounceTimer = null;
    fs.watch(JS_SRC, { recursive: false }, (eventType, filename) => {
        if (!filename || !filename.endsWith('.js')) return;
        if (/bundle|\.min\.js|\.tmp\.js/.test(filename)) return;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => { log(`\nتغيير في: ${filename}`, 'warn'); build(); }, 500);
    });
}

const args = process.argv.slice(2);
if (args.includes('--clean')) { cleanDist(); }
else if (args.includes('--watch')) { watch(); }
else { build(); }