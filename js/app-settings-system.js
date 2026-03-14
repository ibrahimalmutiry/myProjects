/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║      app-settings-system.js — إعدادات النظام ولوحة التحكم   ║
 * ║  يتطلب: app-common.js, app-transactions.js                   ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

// ════════════════════════════════════════════════════════════
// قسم النظام — إعدادات فقط (بادئات + موقّعون + خطر)
// ════════════════════════════════════════════════════════════
async function renderSystemSection() {
    var content = document.getElementById('settingsContent');
    var html = '';
    html += '<div class="settings-section-header"><h2>⚙️ إعدادات النظام</h2></div>';
    html += '<div class="system-grid">';
    html += '<div class="system-card prefixes-card">';
    html += '<h3>🏷️ بادئات الأرقام التلقائية</h3>';
    html += '<p class="prefixes-desc">تُستخدم هذه البادئات في توليد أرقام المستندات تلقائياً — أحرف إنجليزية كبيرة فقط (1-10 محارف)</p>';
    html += '<div id="prefixes-list"><div class="loading-inline">⏳ جاري التحميل...</div></div>';
    html += '</div>';
    html += '<div class="system-card prefixes-card">';
    html += '<h3>✍️ موقّعو أوامر الدفع</h3>';
    html += '<p class="prefixes-desc">تظهر هذه الأسماء في مربعات التوقيع أسفل أمر الدفع عند الطباعة</p>';
    html += '<div id="signers-list"><div class="loading-inline">⏳ جاري التحميل...</div></div>';
    html += '</div>';
    html += '<div class="system-card danger-zone">';
    html += '<h3>⚠️ منطقة الخطر</h3>';
    html += '<p>هذه الإجراءات لا يمكن التراجع عنها</p>';
    html += '<div class="danger-buttons">';
    html += '<button class="btn btn-danger" onclick="clearAllTransactions()">حذف جميع المعاملات</button>';
    html += '</div></div></div>';
    content.innerHTML = html;
    loadPrefixesSection();
    loadSignersSection();
}

// ════════════════════════════════════════════════════════════
// لوحة النظام — معلومات + إحصائيات + رسوم بيانية
// ════════════════════════════════════════════════════════════
async function renderSystemDashboard() {
    var el = document.getElementById('settingsContent');
    el.innerHTML = `
    <div class="settings-section-header"><h2>📊 لوحة النظام</h2></div>
    <div class="sysdash-wrap">

        <!-- معلومات النظام + صحة سريعة -->
        <div class="sysdash-top">
            <div class="sysdash-info-card">
                <div class="sysdash-info-title">ℹ️ معلومات النظام</div>
                <div class="sysdash-info-rows" id="sd-info-rows">
                    <div class="sd-skeleton"></div><div class="sd-skeleton"></div><div class="sd-skeleton"></div>
                </div>
            </div>
            <div class="sysdash-health-card" id="sd-health-card">
                <div class="sysdash-info-title">🩺 صحة النظام</div>
                <div class="sd-health-items" id="sd-health-items">
                    <div class="sd-skeleton"></div>
                </div>
            </div>
        </div>

        <!-- بطاقات الأرقام السريعة -->
        <div class="sysdash-kpi-row" id="sd-kpi-row">
            <div class="sd-kpi-card sd-kpi-loading"><div class="sd-skeleton"></div></div>
            <div class="sd-kpi-card sd-kpi-loading"><div class="sd-skeleton"></div></div>
            <div class="sd-kpi-card sd-kpi-loading"><div class="sd-skeleton"></div></div>
            <div class="sd-kpi-card sd-kpi-loading"><div class="sd-skeleton"></div></div>
        </div>

        <!-- الرسوم البيانية -->
        <div class="sysdash-charts">
            <div class="sysdash-chart-card">
                <div class="sysdash-chart-title">🧠 استهلاك الذاكرة</div>
                <div class="sysdash-chart-body"><canvas id="sd-mem-chart" height="180"></canvas></div>
            </div>
            <div class="sysdash-chart-card">
                <div class="sysdash-chart-title">🗄 أكبر الجداول (م.ب)</div>
                <div class="sysdash-chart-body"><canvas id="sd-tables-chart" height="180"></canvas></div>
            </div>
            <div class="sysdash-chart-card">
                <div class="sysdash-chart-title">⚙️ OPcache</div>
                <div class="sysdash-chart-body"><canvas id="sd-opcache-chart" height="180"></canvas></div>
            </div>
        </div>

        <!-- جدول الجداول الكاملة -->
        <div class="sysdash-table-card">
            <div class="sysdash-chart-title">📋 إحصائيات قاعدة البيانات — جميع الجداول</div>
            <div id="sd-tables-list"><div class="syshealth-loading"><span class="syshealth-spin">⚙️</span> جارٍ التحميل…</div></div>
        </div>

        <!-- زر التحديث + تفريغ الكاش -->
        <div class="sysdash-actions">
            <button class="sh-refresh-btn" onclick="renderSystemDashboard()">↻ تحديث الكل</button>
            <button class="sh-clear-btn" onclick="clearSystemCache()">🗑 تفريغ الذاكرة المؤقتة</button>
        </div>
    </div>`;

    // جلب البيانات
    let d = null, stats = null;
    try {
        const [r1, r2] = await Promise.all([
            fetch('api/settings.php?action=system_health'),
            fetch('api/settings.php?action=full_stats'),
        ]);
        const j1 = await r1.json(); if (j1.success) d = j1.data;
        const j2 = await r2.json(); if (j2.success) stats = j2.data;
    } catch (e) { }

    if (!d) {
        document.getElementById('sd-info-rows').innerHTML = '<div class="sh-error">⚠ تعذّر تحميل بيانات النظام</div>';
        return;
    }

    const h = d.health || {};

    // ── معلومات النظام ───────────────────────────────────────
    document.getElementById('sd-info-rows').innerHTML = [
        ['اسم النظام', 'نظام إدارة معاملات القطاع المالي'],
        ['الإصدار', '1.0.0'],
        ['PHP', d.php_version],
        ['MySQL', d.mysql_version],
        ['السيرفر', d.server_software?.split('/').slice(0, 2).join('/') || 'Unknown'],
        ['زمن الاستجابة', d.request_time + ' ms'],
    ].map(([k, v]) => `<div class="sysdash-info-row"><span>${k}</span><span class="sd-mono">${v}</span></div>`).join('');

    // ── صحة النظام ───────────────────────────────────────────
    const healthItems = [
        { label: 'قاعدة البيانات', status: h.db_connection },
        { label: 'مجلد الرفع', status: h.uploads_writable },
        { label: 'الذاكرة', status: h.memory_status, extra: h.memory_pct + '%' },
        { label: 'إصدار PHP', status: h.php_ok },
        { label: 'استعلامات بطيئة', status: h.slow_queries },
    ];
    document.getElementById('sd-health-items').innerHTML = healthItems.map(i => {
        const cls = i.status === 'ok' ? 'sdi-ok' : i.status === 'warning' ? 'sdi-warn' : 'sdi-err';
        const icon = i.status === 'ok' ? '✓' : '⚠';
        return `<div class="sdi ${cls}"><span class="sdi-icon">${icon}</span><span class="sdi-label">${i.label}</span>${i.extra ? `<span class="sdi-extra">${i.extra}</span>` : ''}</div>`;
    }).join('');

    // ── KPI Cards ────────────────────────────────────────────
    const memPct = d.memory_limit_bytes > 0 ? Math.round((d.memory_usage / d.memory_limit_bytes) * 100) : 0;
    const kpis = [
        { icon: '📁', label: 'ملفات مرفوعة', val: Number(d.uploads_count).toLocaleString('ar'), sub: _fmt(d.uploads_size), color: '#c9a84c' },
        { icon: '🗄', label: 'حجم قاعدة البيانات', val: _fmt(d.db_total_size), sub: d.db_table_count + ' جدول', color: '#6366f1' },
        { icon: '🧠', label: 'استهلاك الذاكرة', val: memPct + '%', sub: _fmt(d.memory_usage) + ' من ' + d.memory_limit, color: memPct > 80 ? '#ef4444' : '#22c55e' },
        { icon: '⚡', label: 'استعلامات DB', val: Number(d.db_queries_total).toLocaleString('ar'), sub: d.db_connections + ' اتصال نشط', color: '#14b8a6' },
    ];
    document.getElementById('sd-kpi-row').innerHTML = kpis.map(k => `
        <div class="sd-kpi-card">
            <div class="sd-kpi-icon" style="color:${k.color}">${k.icon}</div>
            <div class="sd-kpi-val" style="color:${k.color}">${k.val}</div>
            <div class="sd-kpi-label">${k.label}</div>
            <div class="sd-kpi-sub">${k.sub}</div>
        </div>`).join('');

    // ── الرسوم البيانية (Chart.js) ───────────────────────────
    await _sdLoadChartJS();

    // رسم الذاكرة — Doughnut
    _sdChart('sd-mem-chart', 'doughnut',
        ['مستخدم', 'حر'],
        [d.memory_usage, Math.max(0, d.memory_limit_bytes - d.memory_usage)],
        ['rgba(239,68,68,.8)', 'rgba(34,197,94,.8)']
    );

    // رسم الجداول — Bar
    const topT = (d.db_tables || []).slice(0, 8);
    _sdChart('sd-tables-chart', 'bar',
        topT.map(t => t.table_name),
        topT.map(t => +(t.data_length / 1024 / 1024).toFixed(3)),
        topT.map((_, i) => `hsl(${220 + i * 18},70%,55%)`)
    );

    // رسم OPcache — Doughnut
    const oc = d.opcache;
    if (oc) {
        _sdChart('sd-opcache-chart', 'doughnut',
            ['مستخدم', 'حر'],
            [oc.used_memory, oc.free_memory],
            ['rgba(99,102,241,.8)', 'rgba(30,41,59,.5)']
        );
    } else {
        const cv = document.getElementById('sd-opcache-chart');
        if (cv) cv.parentElement.innerHTML = '<div class="sh-muted" style="text-align:center;padding:40px">OPcache غير مفعّل</div>';
    }

    // ── جدول الجداول ────────────────────────────────────────
    const allTables = d.db_tables || [];
    document.getElementById('sd-tables-list').innerHTML = allTables.length ? `
        <table class="sh-table">
            <thead><tr><th>#</th><th>الجدول</th><th>السجلات</th><th>البيانات</th><th>الفهرس</th><th>الإجمالي</th></tr></thead>
            <tbody>${allTables.map((t, i) => `
                <tr>
                    <td style="color:var(--text-muted);font-size:.72rem">${i + 1}</td>
                    <td class="sh-td-mono">${t.table_name}</td>
                    <td>${Number(t.table_rows).toLocaleString('ar')}</td>
                    <td>${_fmt(t.data_length)}</td>
                    <td>${_fmt(t.index_length)}</td>
                    <td style="font-weight:700">${_fmt(t.total_size)}</td>
                </tr>`).join('')}
            </tbody>
        </table>` : '<div class="sh-muted">لا توجد بيانات</div>';
}

let _sdChartJSLoaded = false;
function _sdLoadChartJS() {
    if (_sdChartJSLoaded || window.Chart) { _sdChartJSLoaded = true; return Promise.resolve(); }
    return new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';
        s.onload = () => { _sdChartJSLoaded = true; res(); };
        s.onerror = rej;
        document.head.appendChild(s);
    });
}

function _sdChart(id, type, labels, data, colors) {
    const canvas = document.getElementById(id);
    if (!canvas || !window.Chart) return;
    const isDark = document.body.classList.contains('dark-mode') || document.documentElement.getAttribute('data-theme') === 'dark';
    const gridColor = isDark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.06)';
    const textColor = isDark ? '#94a3b8' : '#64748b';
    if (canvas._chartInst) canvas._chartInst.destroy();
    canvas._chartInst = new Chart(canvas, {
        type,
        data: {
            labels,
            datasets: [{ data, backgroundColor: colors, borderWidth: type === 'doughnut' ? 2 : 0, borderRadius: type === 'bar' ? 6 : 0, borderColor: isDark ? '#1e293b' : '#fff' }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: type === 'doughnut', position: 'right', labels: { color: textColor, font: { size: 11 }, boxWidth: 12 } },
                tooltip: { callbacks: { label: ctx => ' ' + ctx.label + ': ' + (type === 'bar' ? ctx.parsed.y + ' م.ب' : _fmt(ctx.parsed)) } }
            },
            scales: type === 'bar' ? {
                x: { ticks: { color: textColor, font: { size: 10 } }, grid: { color: gridColor } },
                y: { ticks: { color: textColor, font: { size: 10 } }, grid: { color: gridColor } }
            } : {},
        }
    });
}

/* ═══════════════════════════════════════════════════════════════
   📊 إحصائيات النظام التقنية
═══════════════════════════════════════════════════════════════ */
function _fmt(bytes) {
    if (!bytes || bytes < 0) return '0 ب';
    if (bytes < 1024) return bytes + ' ب';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' ك.ب';
    if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' م.ب';
    return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' ج.ب';
}
function _healthBadge(status) {
    if (status === 'ok') return '<span class="sh-badge sh-ok">✓ جيد</span>';
    if (status === 'warning') return '<span class="sh-badge sh-warn">⚠ تنبيه</span>';
    return '<span class="sh-badge sh-err">✗ خطأ</span>';
}
function _pct(used, total) {
    if (!total) return 0;
    return Math.min(100, Math.round((used / total) * 100));
}
function _bar(pct, color) {
    const c = pct > 80 ? '#ef4444' : pct > 60 ? '#f59e0b' : color || '#22c55e';
    return `<div class="sh-bar-wrap"><div class="sh-bar-fill" style="width:${pct}%;background:${c}"></div></div>`;
}

async function loadSystemHealth() {
    const card = document.getElementById('syshealth-card');
    if (!card) return;
    let d = null;
    try {
        const res = await fetch('api/settings.php?action=system_health');
        const json = await res.json();
        if (json.success) d = json.data;
    } catch (e) {
        card.innerHTML = '<div class="sh-error">⚠ تعذّر تحميل إحصائيات النظام</div>';
        return;
    }
    if (!d) { card.innerHTML = '<div class="sh-error">لا توجد بيانات</div>'; return; }

    const h = d.health || {};
    const oc = d.opcache || null;
    const memPct = _pct(d.memory_usage, d.memory_limit_bytes);
    const uploadsMB = _fmt(d.uploads_size);

    // حساب أكبر 5 جداول
    const topTables = (d.db_tables || []).slice(0, 5);

    card.innerHTML = `
    <div class="syshealth-wrap">

        <!-- هيدر -->
        <div class="sh-hdr">
            <div class="sh-hdr-title">
                <span class="sh-hdr-icon">📊</span>
                <div>
                    <h3>إحصائيات النظام</h3>
                    <span class="sh-hdr-sub">PHP ${d.php_version} · MySQL ${d.mysql_version}</span>
                </div>
            </div>
            <div class="sh-hdr-actions">
                <button class="sh-refresh-btn" onclick="loadSystemHealth()" title="تحديث">↻ تحديث</button>
                <button class="sh-clear-btn" onclick="clearSystemCache()">🗑 تفريغ الكاش</button>
            </div>
        </div>

        <!-- صحة النظام — شريط سريع -->
        <div class="sh-health-bar">
            <div class="sh-health-item">
                <span class="sh-hi-label">قاعدة البيانات</span>
                ${_healthBadge(h.db_connection)}
            </div>
            <div class="sh-health-item">
                <span class="sh-hi-label">مجلد الرفع</span>
                ${_healthBadge(h.uploads_writable)}
            </div>
            <div class="sh-health-item">
                <span class="sh-hi-label">الذاكرة</span>
                ${_healthBadge(h.memory_status)}
            </div>
            <div class="sh-health-item">
                <span class="sh-hi-label">إصدار PHP</span>
                ${_healthBadge(h.php_ok)}
            </div>
            <div class="sh-health-item">
                <span class="sh-hi-label">استعلامات بطيئة</span>
                ${_healthBadge(h.slow_queries)}
            </div>
        </div>

        <!-- الشبكة -->
        <div class="sh-grid">

            <!-- أداء النظام -->
            <div class="sh-section">
                <div class="sh-sec-title">⚡ أداء النظام</div>
                <div class="sh-rows">
                    <div class="sh-row"><span>زمن الاستجابة</span><span class="sh-val">${d.request_time} ms</span></div>
                    <div class="sh-row"><span>اتصالات DB نشطة</span><span class="sh-val">${d.db_connections}</span></div>
                    <div class="sh-row"><span>إجمالي الاستعلامات</span><span class="sh-val">${Number(d.db_queries_total).toLocaleString('ar')}</span></div>
                    <div class="sh-row"><span>استعلامات بطيئة</span><span class="sh-val ${parseInt(d.db_slow_queries) > 10 ? 'sh-warn-txt' : ''}">${d.db_slow_queries}</span></div>
                    ${d.load_avg ? `<div class="sh-row"><span>حمل المعالج (avg)</span><span class="sh-val">${d.load_avg[0]?.toFixed(2)} / ${d.load_avg[1]?.toFixed(2)} / ${d.load_avg[2]?.toFixed(2)}</span></div>` : ''}
                </div>
            </div>

            <!-- استهلاك الذاكرة -->
            <div class="sh-section">
                <div class="sh-sec-title">🧠 استهلاك الذاكرة</div>
                <div class="sh-rows">
                    <div class="sh-row"><span>الاستخدام الحالي</span><span class="sh-val">${_fmt(d.memory_usage)}</span></div>
                    <div class="sh-row"><span>ذروة الاستخدام</span><span class="sh-val">${_fmt(d.memory_peak)}</span></div>
                    <div class="sh-row"><span>الحد الأقصى</span><span class="sh-val">${d.memory_limit}</span></div>
                </div>
                <div class="sh-metric-label">${memPct}% مستخدم</div>
                ${_bar(memPct)}
            </div>

            <!-- حجم النظام -->
            <div class="sh-section">
                <div class="sh-sec-title">💾 حجم النظام</div>
                <div class="sh-rows">
                    <div class="sh-row"><span>ملفات مرفوعة</span><span class="sh-val">${uploadsMB}</span></div>
                    <div class="sh-row"><span>عدد الملفات</span><span class="sh-val">${Number(d.uploads_count).toLocaleString('ar')}</span></div>
                    <div class="sh-row"><span>حجم قاعدة البيانات</span><span class="sh-val">${_fmt(d.db_total_size)}</span></div>
                    <div class="sh-row"><span>عدد الجداول</span><span class="sh-val">${d.db_table_count}</span></div>
                    <div class="sh-row"><span>حجم الجلسات</span><span class="sh-val">${_fmt(d.session_size)}</span></div>
                </div>
            </div>

            <!-- قاعدة البيانات - أكبر الجداول -->
            <div class="sh-section sh-section--wide">
                <div class="sh-sec-title">🗄 إحصائيات قاعدة البيانات — أكبر الجداول</div>
                <table class="sh-table">
                    <thead><tr><th>الجدول</th><th>السجلات</th><th>الحجم</th><th>الفهرس</th></tr></thead>
                    <tbody>
                    ${topTables.map(t => `
                        <tr>
                            <td class="sh-td-mono">${t.table_name}</td>
                            <td>${Number(t.table_rows).toLocaleString('ar')}</td>
                            <td>${_fmt(t.data_length)}</td>
                            <td>${_fmt(t.index_length)}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>

            <!-- OPcache / الذاكرة المؤقتة -->
            <div class="sh-section">
                <div class="sh-sec-title">⚙️ الذاكرة المؤقتة (OPcache)</div>
                ${oc ? `
                <div class="sh-rows">
                    <div class="sh-row"><span>الحالة</span><span class="sh-val">${oc.enabled ? _healthBadge('ok') : _healthBadge('warning')}</span></div>
                    <div class="sh-row"><span>ملفات مخزّنة</span><span class="sh-val">${oc.cached_files}</span></div>
                    <div class="sh-row"><span>ذاكرة مستخدمة</span><span class="sh-val">${_fmt(oc.used_memory)}</span></div>
                    <div class="sh-row"><span>ذاكرة حرة</span><span class="sh-val">${_fmt(oc.free_memory)}</span></div>
                    <div class="sh-row"><span>نسبة الإصابة</span><span class="sh-val sh-ok-txt">${oc.hit_rate}%</span></div>
                </div>
                <div class="sh-metric-label">${oc.hit_rate}% hit rate</div>
                ${_bar(oc.hit_rate, '#6366f1')}
                ` : '<div class="sh-muted">OPcache غير مفعّل أو غير متاح</div>'}
                <button class="sh-clear-btn sh-clear-sm" onclick="clearSystemCache()" style="margin-top:12px">🗑 تفريغ الذاكرة المؤقتة</button>
            </div>

        </div>
    </div>`;
}

async function clearSystemCache() {
    const btn = event.target;
    const orig = btn.textContent;
    btn.disabled = true; btn.textContent = '⏳ جارٍ التفريغ…';
    try {
        const res = await fetch('api/settings.php?action=clear_cache', { method: 'POST' });
        const d = await res.json();
        if (d.success) {
            btn.textContent = '✓ تم التفريغ';
            btn.style.background = 'rgba(34,197,94,.15)';
            setTimeout(() => loadSystemHealth(), 800);
        } else {
            btn.textContent = '✗ فشل';
        }
    } catch (e) {
        btn.textContent = '✗ خطأ';
    } finally {
        btn.disabled = false;
        setTimeout(() => { btn.textContent = orig; btn.style.background = ''; }, 2500);
    }
}

async function loadSignersSection() {
    const el = document.getElementById('signers-list');
    if (!el) return;
    try {
        const res = await fetch('api/?action=get_system_settings');
        const data = await res.json();
        if (!data.success) throw new Error(data.message);
        const signers = (data.data || []).filter(s => s.setting_group === 'payment_order');
        el.innerHTML = signers.map(s => `
            <div class="prefix-row" id="prefix-row-${s.setting_key}">
                <div class="prefix-label">${s.setting_label}</div>
                <div class="prefix-input-wrap">
                    <input type="text" class="prefix-input" id="prefix-input-${s.setting_key}"
                        value="${s.setting_value}" maxlength="100" placeholder="اسم الموظف"
                        onkeydown="if(event.key==='Enter') saveSigner('${s.setting_key}')">
                    <button class="prefix-save-btn" onclick="saveSigner('${s.setting_key}')">حفظ</button>
                    <span class="prefix-status" id="prefix-status-${s.setting_key}"></span>
                </div>
            </div>
        `).join('') || '<div style="color:var(--text-muted);padding:.5rem">لا توجد إعدادات</div>';
    } catch (e) {
        if (el) el.innerHTML = `<div style="color:#ff6b6b;padding:.5rem">خطأ: ${e.message}</div>`;
    }
}

async function saveSigner(key) {
    const input = document.getElementById('prefix-input-' + key);
    const status = document.getElementById('prefix-status-' + key);
    const btn = document.querySelector(`#prefix-row-${key} .prefix-save-btn`);
    if (!input) return;
    const val = input.value.trim();
    if (btn) { btn.disabled = true; btn.textContent = '...'; }
    try {
        const res = await fetch('api/?action=save_system_setting', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key, value: val }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message);
        if (status) { status.textContent = '✓ تم الحفظ'; status.style.color = '#69db7c'; }
        setTimeout(() => { if (status) status.textContent = ''; }, 2500);
    } catch (e) {
        if (status) { status.textContent = '✗ ' + e.message; status.style.color = '#ff6b6b'; }
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'حفظ'; }
    }
}

async function loadPrefixesSection() {
    const el = document.getElementById('prefixes-list');
    if (!el) return;
    try {
        const res = await fetch('api/?action=get_system_settings');
        const data = await res.json();
        if (!data.success) throw new Error(data.message);
        const prefixes = (data.data || []).filter(s => s.setting_group === 'prefixes');
        el.innerHTML = prefixes.map(s => `
            <div class="prefix-row" id="prefix-row-${s.setting_key}">
                <div class="prefix-label">${s.setting_label}</div>
                <div class="prefix-input-wrap">
                    <input type="text" class="prefix-input" id="prefix-input-${s.setting_key}"
                        value="${s.setting_value}" maxlength="10" placeholder="مثال: TR"
                        onkeydown="if(event.key==='Enter') savePrefix('${s.setting_key}')">
                    <button class="prefix-save-btn" onclick="savePrefix('${s.setting_key}')">حفظ</button>
                    <span class="prefix-status" id="prefix-status-${s.setting_key}"></span>
                </div>
            </div>
        `).join('');
    } catch (e) {
        if (el) el.innerHTML = `<div style="color:#ff6b6b;padding:.5rem">خطأ: ${e.message}</div>`;
    }
}

async function savePrefix(key) {
    const input = document.getElementById('prefix-input-' + key);
    const status = document.getElementById('prefix-status-' + key);
    const btn = document.querySelector(`#prefix-row-${key} .prefix-save-btn`);
    if (!input) return;

    const val = input.value.trim().toUpperCase();
    input.value = val;

    if (!val || !/^[A-Z0-9]{1,10}$/.test(val)) {
        if (status) { status.textContent = '⚠️ أحرف إنجليزية كبيرة أو أرقام فقط'; status.style.color = '#ffa94d'; }
        return;
    }
    if (btn) { btn.disabled = true; btn.textContent = '...'; }
    try {
        const res = await fetch('api/?action=save_system_setting', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key, value: val }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message);
        if (status) { status.textContent = '✓ تم الحفظ'; status.style.color = '#69db7c'; }
        setTimeout(() => { if (status) status.textContent = ''; }, 2500);
    } catch (e) {
        if (status) { status.textContent = '✗ ' + e.message; status.style.color = '#ff6b6b'; }
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'حفظ'; }
    }
}

async function clearAllTransactions() {
    if (!confirm('⚠️ تحذير!\n\nسيتم حذف جميع المعاملات نهائياً.\nهذا الإجراء لا يمكن التراجع عنه.\n\nهل أنت متأكد؟')) return;
    if (!confirm('تأكيد نهائي: سيتم حذف كل شيء!')) return;

    try {
        var res = await fetch('api/settings.php?action=clear_all', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        var result = await res.json();

        if (result.success) {
            showToast('تم حذف جميع المعاملات', 'success');
            await loadTransactions();
            renderSystemSection();
        } else {
            showToast(result.message || 'خطأ', 'error');
        }
    } catch (err) {
        showToast('خطأ في الاتصال', 'error');
    }
}


function openUserGuide() {
    window.open('User_Guide.html', '_blank', 'width=1200,height=800');
}


// ── CSS شريط التبويبات العلوي لصفحة الإعدادات ────────────────
(function injectSettingsTopbarStyles() {
    if (document.getElementById('settings-topbar-styles')) return;
    const s = document.createElement('style');
    s.id = 'settings-topbar-styles';
    s.textContent = `
        .settings-page-new {
            display: flex;
            flex-direction: column;
            gap: 1.5rem;
            min-height: calc(100vh - 200px);
        }
        .settings-topbar {
            display: flex;
            align-items: center;
            gap: 4px;
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 5px;
            flex-wrap: wrap;
        }
        .settings-tab-btn {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.55rem 1.1rem;
            background: transparent;
            border: 1px solid transparent;
            border-radius: 8px;
            color: var(--text-secondary);
            font-family: inherit;
            font-size: 0.85rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
            white-space: nowrap;
        }
        .settings-tab-btn:hover {
            background: var(--bg-surface);
            color: var(--text-primary);
        }
        .settings-tab-btn.active {
            background: var(--btn-primary-bg);
            color: var(--btn-primary-text);
            border-color: transparent;
            font-weight: 600;
            box-shadow: 0 2px 8px rgba(0,0,0,.15);
        }
        .settings-page-new .settings-content {
            flex: 1;
            min-width: 0;
        }
        @media (max-width: 600px) {
            .settings-tab-btn { font-size: 0.78rem; padding: 0.5rem 0.75rem; }
        }
    `;
    document.head.appendChild(s);
})();
