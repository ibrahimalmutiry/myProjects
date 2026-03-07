/**
 * صفحة الملف الشخصي للموظف
 * Employee Profile Page
 */

async function loadProfilePage() {
    DOM.mainContent.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;min-height:50vh">
            <div class="spinner"></div>
        </div>`;

    try {
        const [profileRes, statsRes, txRes, notifRes, corrRes] = await Promise.all([
            fetch('api/?action=employee_profile').then(r => r.json()).catch(() => ({ success: false, data: {} })),
            fetch('api/?action=employee_stats').then(r => r.json()).catch(() => ({ success: false, data: {} })),
            fetch('api/?action=employee_transactions&limit=10').then(r => r.json()).catch(() => ({ success: false, data: [] })),
            fetch('api/?action=notifications&limit=8').then(r => r.json()).catch(() => ({ success: false, data: [] })),
            fetch('api/correspondence_api.php?action=correspondence_list&limit=5').then(r => r.json()).catch(() => ({ success: false, data: {} })),
        ]);

        const emp = profileRes.success ? profileRes.data : {};
        const stats = statsRes.success ? statsRes.data : {};
        const txs = txRes.success ? txRes.data : [];
        const notifs = notifRes.success ? notifRes.data : [];
        const corrs = corrRes.success ? ((corrRes.data?.correspondence) || []) : [];

        renderProfilePage(emp, stats, txs, notifs, Array.isArray(corrs) ? corrs : []);
    } catch (e) {
        console.error(e);
        renderProfilePage({}, {}, [], [], []);
    }
}

function renderProfilePage(emp, stats, txs, notifs, corrs) {
    injectProfileStyles();

    // دمج بيانات الـ session مع بيانات الـ API
    const user = Object.assign({}, currentUser || {}, emp);

    const initials = getInitials(user.name || user.user_name || 'م');
    const roleName = getRoleLabel(user.role || user.user_role);
    const permLabel = getPermLabel(user.permission_level || user.permissionLevel);
    const joinDate = user.created_at ? formatProfileDate(user.created_at) : '—';
    const lastLogin = user.last_login ? formatTimeAgo(user.last_login) : '—';

    const totalTx = stats.total_transactions || txs.length || 0;
    const doneTx = stats.completed_transactions || 0;
    const pendingTx = stats.pending_transactions || 0;
    const escalations = stats.escalations || notifs.filter(n =>
        ['ola_breach', 'sla_breach', 'escalation', 'manual_escalation'].includes(n.category)).length;

    const PERSONAL_CATS = ['sla_warning', 'sla_breach', 'ola_breach', 'escalation', 'manual_escalation', 'direct'];
    const personalNotifs = notifs.filter(n =>
        PERSONAL_CATS.includes(n.category) ||
        (n.recipient_id && String(n.recipient_id) !== '0')
    ).slice(0, 5);

    const pagePerms = user.pagePermissions || {};
    const actionPerms = user.actionPermissions || {};
    const isAdmin = user.permissionLevel === 'system_admin' || user.permission_level === 'system_admin';
    const deptName = user.departmentName || user.department_name || '';

    DOM.mainContent.innerHTML = `
    <div class="prof-wrap">

        <!-- ══ Hero ══ -->
        <div class="prof-hero">
            <div class="prof-hero-bg"></div>
            <div class="prof-hero-content">
                <div class="prof-avatar-wrap">
                    <div class="prof-avatar">${initials}</div>
                    <div class="prof-status-dot active"></div>
                </div>
                <div class="prof-hero-info">
                    <h1 class="prof-name">${user.name || user.user_name || 'الموظف'}</h1>
                    <div class="prof-hero-meta">
                        <span class="prof-role-badge">${roleName}</span>
                        <span class="prof-perm-badge prof-perm--${user.permission_level || user.permissionLevel || 'employee'}">${permLabel}</span>
                        ${user.employee_number ? `<span class="prof-emp-num"># ${user.employee_number}</span>` : ''}
                        ${deptName ? `<span class="prof-dept">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                            ${deptName}
                        </span>` : ''}
                    </div>
                    <div class="prof-hero-sub">
                        ${user.email ? `<span><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>${user.email}</span>` : ''}
                        ${user.phone ? `<span><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.56 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>${user.phone}</span>` : ''}
                        <span><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>آخر دخول: ${lastLogin}</span>
                        <span><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>انضم: ${joinDate}</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- ══ إحصاءات ══ -->
        <div class="prof-stats-grid">
            ${[
            { n: totalTx, lbl: 'إجمالي المعاملات', cls: 'blue', icon: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>' },
            { n: doneTx, lbl: 'مكتملة', cls: 'green', icon: '<polyline points="20 6 9 17 4 12"/>' },
            { n: pendingTx, lbl: 'قيد الإنجاز', cls: 'orange', icon: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>' },
            { n: escalations, lbl: 'تصعيدات', cls: 'red', icon: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>' },
            { n: corrs.length, lbl: 'الخطابات', cls: 'purple', icon: '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>' },
            { n: notifs.filter(n => !n.is_read).length, lbl: 'تنبيهات غير مقروءة', cls: 'cyan', icon: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>' },
        ].map(s => `
                <div class="prof-stat-card prof-stat--${s.cls}">
                    <div class="prof-stat-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${s.icon}</svg></div>
                    <div class="prof-stat-body">
                        <div class="prof-stat-num">${s.n}</div>
                        <div class="prof-stat-lbl">${s.lbl}</div>
                    </div>
                </div>`).join('')}
        </div>

        <!-- ══ الجسم الرئيسي ══ -->
        <div class="prof-body prof-body--single">

            <!-- المحتوى -->
            <div class="prof-col-right">

                <!-- التصعيدات الشخصية -->
                <div class="prof-card">
                    <div class="prof-card-header">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                        التصعيدات والتنبيهات الخاصة
                        ${personalNotifs.filter(n => !n.is_read).length > 0
            ? `<span class="prof-badge-count">${personalNotifs.filter(n => !n.is_read).length}</span>` : ''}
                    </div>
                    ${personalNotifs.length === 0
            ? `<div class="prof-empty"><div>✅</div><div>لا توجد تصعيدات حالياً</div></div>`
            : personalNotifs.map(n => buildProfNotifRow(n)).join('')}
                    <div class="prof-card-footer" onclick="switchTab('notifications')">عرض كل التنبيهات ←</div>
                </div>

                <!-- آخر المعاملات -->
                <div class="prof-card">
                    <div class="prof-card-header">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                        آخر المعاملات ذات الصلة
                    </div>
                    ${txs.length === 0
            ? `<div class="prof-empty"><div>📂</div><div>لا توجد معاملات</div></div>`
            : txs.slice(0, 8).map(tx => buildProfTxRow(tx)).join('')}
                    <div class="prof-card-footer" onclick="switchTab('transactions')">عرض كل المعاملات ←</div>
                </div>

                <!-- آخر الخطابات -->
                ${corrs.length > 0 ? `
                <div class="prof-card">
                    <div class="prof-card-header">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                        آخر الخطابات
                    </div>
                    ${corrs.slice(0, 5).map(c => buildProfCorrRow(c)).join('')}
                    <div class="prof-card-footer" onclick="switchTab('correspondence')">عرض كل الخطابات ←</div>
                </div>` : ''}

            </div>
        </div>
    </div>`;
}

// ── helpers ──
function getInitials(name) {
    const parts = (name || '').trim().split(' ').filter(Boolean);
    if (parts.length >= 2) return parts[0][0] + parts[1][0];
    return (parts[0] || 'م').substring(0, 2);
}
function getRoleLabel(role) {
    return { admin: 'مدير النظام', receiver: 'الاستلام', budget: 'الموازنة', payment: 'الدفع', invoice: 'الفوترة', dispatch: 'الصرف' }[role] || role || '—';
}
function getPermLabel(level) {
    return { system_admin: 'مدير النظام', manager: 'مدير', employee: 'موظف' }[level] || level || 'موظف';
}
function formatProfileDate(dt) {
    if (!dt) return '—';
    try { return new Date(dt).toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' }); }
    catch (e) { return dt; }
}

function buildPagePermsHTML(perms, isAdmin) {
    const labels = {
        dashboard: 'لوحة التحكم', transactions: 'المعاملات', correspondence: 'الخطابات',
        'bank-deposits': 'الودائع', sla: 'SLA/OLA', performance: 'الأداء',
        settings: 'الإعدادات', notifications: 'التنبيهات', reservations: 'الحجوزات'
    };
    if (isAdmin || !Object.keys(perms).length) {
        return `<div class="prof-perm-item prof-perm-on" style="grid-column:1/-1;color:var(--accent-green)">
            ✅ صلاحية كاملة — مدير النظام
        </div>`;
    }
    return Object.entries(labels).map(([k, lbl]) => {
        const on = perms[k] === true || perms[k] === 1;
        return `<div class="prof-perm-item ${on ? 'prof-perm-on' : 'prof-perm-off'}">${on ? '✅' : '🔒'} ${lbl}</div>`;
    }).join('');
}

function buildActionPermsHTML(perms) {
    const labels = {
        'correspondence.add': 'إضافة خطاب', 'correspondence.edit': 'تعديل خطاب',
        'correspondence.delete': 'حذف خطاب', 'correspondence.stage_action': 'تعديل مراحل',
        'correspondence.stage_edit_completed': 'تعديل مكتمل', 'correspondence.add_comment': 'إضافة تعليق',
        'correspondence.view_all': 'عرض الكل',
    };
    return Object.entries(perms).map(([k, v]) => {
        const lbl = labels[k] || k.split('.').pop();
        const on = !!v;
        return `<div class="prof-perm-item ${on ? 'prof-perm-on' : 'prof-perm-off'}">${on ? '✅' : '🔒'} ${lbl}</div>`;
    }).join('');
}

function buildProfNotifRow(n) {
    const catMap = {
        'sla_warning': { icon: '⚠️', label: 'SLA تحذير', cls: 'orange' },
        'sla_breach': { icon: '🚨', label: 'SLA تجاوز', cls: 'red' },
        'ola_breach': { icon: '🔴', label: 'OLA تجاوز', cls: 'red' },
        'escalation': { icon: '📤', label: 'تصعيد', cls: 'purple' },
        'manual_escalation': { icon: '🔔', label: 'تصعيد يدوي', cls: 'blue' },
        'direct': { icon: '📩', label: 'مباشر', cls: 'cyan' },
    };
    const cat = catMap[n.category] || { icon: '🔔', label: 'تنبيه', cls: 'blue' };
    const time = typeof formatTimeAgo === 'function' ? formatTimeAgo(n.created_at || n.update_time) : '';
    return `
    <div class="prof-notif-row ${!n.is_read ? 'unread' : ''}">
        <div class="prof-notif-icon prof-ni--${cat.cls}">${cat.icon}</div>
        <div class="prof-notif-body">
            <div class="prof-notif-title">${n.title || cat.label}</div>
            <div class="prof-notif-desc">${(n.message || '').replace(/\n/g, ' ').substring(0, 90)}${(n.message || '').length > 90 ? '…' : ''}</div>
            <div class="prof-notif-meta">
                <span class="prof-notif-badge prof-nb--${cat.cls}">${cat.icon} ${cat.label}</span>
                ${time ? `<span class="prof-notif-time">${time}</span>` : ''}
            </div>
        </div>
        ${!n.is_read ? '<div class="prof-unread-dot"></div>' : ''}
    </div>`;
}

function buildProfTxRow(tx) {
    const stageMap = {
        receiving: { lbl: 'الاستلام', cls: 'green' }, budget: { lbl: 'الموازنة', cls: 'cyan' },
        payment: { lbl: 'الدفع', cls: 'orange' }, invoice: { lbl: 'الفوترة', cls: 'purple' },
        dispatch: { lbl: 'الصرف', cls: 'blue' },
    };
    const stage = stageMap[tx.stage] || { lbl: tx.stage || '—', cls: 'blue' };
    const time = typeof formatTimeAgo === 'function' && tx.update_time ? formatTimeAgo(tx.update_time) : '';
    return `
    <div class="prof-tx-row" onclick="switchTab('transactions')">
        <div class="prof-tx-num">${tx.transaction_number || tx.ref_number || '—'}</div>
        <div class="prof-tx-body">
            <div class="prof-tx-type">${tx.transaction_type || tx.type || '—'}</div>
            <div class="prof-tx-meta">
                <span class="prof-tx-stage prof-tx--${stage.cls}">${stage.lbl}</span>
                ${tx.status ? `<span class="prof-tx-status">${tx.status}</span>` : ''}
                ${time ? `<span class="prof-tx-time">${time}</span>` : ''}
            </div>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;color:var(--text-muted)"><polyline points="9 18 15 12 9 6"/></svg>
    </div>`;
}

function buildProfCorrRow(c) {
    const cls = { draft: 'orange', active: 'blue', completed: 'green', archived: 'cyan', cancelled: 'red' }[c.status] || 'blue';
    const statusLbl = { draft: 'مسودة', active: 'نشط', completed: 'مكتمل', archived: 'مؤرشف', cancelled: 'ملغي' }[c.status] || c.status || '—';
    return `
    <div class="prof-tx-row" onclick="switchTab('correspondence')">
        <div class="prof-tx-num" style="font-size:.74rem">${c.reference_number || '—'}</div>
        <div class="prof-tx-body">
            <div class="prof-tx-type">${(c.subject || '').substring(0, 40)}${(c.subject || '').length > 40 ? '…' : ''}</div>
            <div class="prof-tx-meta">
                <span class="prof-tx-stage prof-tx--${cls}">${statusLbl}</span>
                ${c.type ? `<span class="prof-tx-status">${c.type}</span>` : ''}
            </div>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;color:var(--text-muted)"><polyline points="9 18 15 12 9 6"/></svg>
    </div>`;
}

function injectProfileStyles() {
    if (document.getElementById('prof-styles')) return;
    const s = document.createElement('style');
    s.id = 'prof-styles';
    s.textContent = `
    .prof-wrap { display:flex;flex-direction:column;gap:1.25rem;width:100%;animation:profIn .35s ease; }
    @keyframes profIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }

    /* Hero */
    .prof-hero { position:relative;border-radius:16px;overflow:hidden;border:1px solid var(--border-color);background:var(--bg-card); }
    .prof-hero-bg { position:absolute;inset:0;background:linear-gradient(135deg,rgba(74,171,247,.1) 0%,rgba(177,151,252,.07) 50%,rgba(105,219,124,.05) 100%);pointer-events:none; }
    .prof-hero-content { position:relative;display:flex;align-items:flex-start;gap:1.5rem;padding:1.75rem; }
    .prof-avatar-wrap { position:relative;flex-shrink:0; }
    .prof-avatar { width:72px;height:72px;border-radius:18px;background:linear-gradient(135deg,var(--accent-blue),#b197fc);color:#fff;font-size:1.5rem;font-weight:800;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 18px rgba(74,171,247,.3); }
    .prof-status-dot { position:absolute;bottom:4px;left:4px;width:12px;height:12px;border-radius:50%;border:2px solid var(--bg-card); }
    .prof-status-dot.active { background:var(--accent-green); }
    .prof-status-dot.inactive { background:var(--text-muted); }
    .prof-hero-info { flex:1;min-width:0; }
    .prof-name { font-size:1.5rem;font-weight:800;color:var(--text-primary);margin:0 0 .5rem;letter-spacing:-.3px; }
    .prof-hero-meta { display:flex;align-items:center;flex-wrap:wrap;gap:.45rem;margin-bottom:.6rem; }
    .prof-hero-sub { display:flex;align-items:center;flex-wrap:wrap;gap:.8rem;font-size:.79rem;color:var(--text-muted); }
    .prof-hero-sub span { display:flex;align-items:center;gap:.3rem; }
    .prof-role-badge { padding:.25rem .7rem;background:rgba(74,171,247,.14);color:var(--accent-blue);border-radius:20px;font-size:.77rem;font-weight:700; }
    .prof-perm-badge { padding:.25rem .7rem;border-radius:20px;font-size:.77rem;font-weight:700; }
    .prof-perm--system_admin { background:rgba(255,107,107,.14);color:#ff6b6b; }
    .prof-perm--manager { background:rgba(177,151,252,.14);color:#b197fc; }
    .prof-perm--employee { background:rgba(105,219,124,.14);color:var(--accent-green); }
    .prof-emp-num { padding:.25rem .65rem;background:var(--bg-surface);border:1px solid var(--border-color);border-radius:20px;font-size:.75rem;color:var(--text-muted);font-family:monospace; }
    .prof-dept { display:inline-flex;align-items:center;gap:.3rem;font-size:.77rem;color:var(--text-muted); }

    /* Stats */
    .prof-stats-grid { display:grid;grid-template-columns:repeat(6,1fr);gap:.75rem; }
    .prof-stat-card { background:var(--bg-card);border:1px solid var(--border-color);border-radius:12px;padding:.9rem 1rem;display:flex;align-items:center;gap:.7rem;transition:transform .18s,box-shadow .18s; }
    .prof-stat-card:hover { transform:translateY(-2px);box-shadow:0 6px 20px rgba(0,0,0,.1); }
    .prof-stat-icon { width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0; }
    .prof-stat--blue   .prof-stat-icon { background:rgba(74,171,247,.13);  color:var(--accent-blue); }
    .prof-stat--green  .prof-stat-icon { background:rgba(105,219,124,.13); color:var(--accent-green); }
    .prof-stat--orange .prof-stat-icon { background:rgba(255,169,77,.13);  color:var(--accent-orange); }
    .prof-stat--red    .prof-stat-icon { background:rgba(255,107,107,.13); color:#ff6b6b; }
    .prof-stat--purple .prof-stat-icon { background:rgba(177,151,252,.13); color:#b197fc; }
    .prof-stat--cyan   .prof-stat-icon { background:rgba(59,201,219,.13);  color:var(--accent-cyan); }
    .prof-stat-num { font-size:1.35rem;font-weight:800;color:var(--text-primary);line-height:1; }
    .prof-stat-lbl { font-size:.7rem;color:var(--text-muted);margin-top:.25rem; }

    /* Body */
    .prof-body { display:grid;grid-template-columns:320px 1fr;gap:1.25rem;align-items:start; }
    .prof-body--single { grid-template-columns:1fr; }
    .prof-col-left,.prof-col-right { display:flex;flex-direction:column;gap:1.25rem; }

    /* Card */
    .prof-card { background:var(--bg-card);border:1px solid var(--border-color);border-radius:14px;overflow:hidden; }
    .prof-card-header { display:flex;align-items:center;gap:.5rem;padding:.8rem 1.2rem;font-size:.86rem;font-weight:700;color:var(--text-primary);border-bottom:1px solid var(--border-color);background:linear-gradient(135deg,rgba(74,171,247,.035) 0%,transparent 100%); }
    .prof-badge-count { display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 .4rem;background:#ff6b6b;color:#fff;border-radius:10px;font-size:.7rem;font-weight:800;margin-right:auto; }
    .prof-card-footer { padding:.7rem 1.2rem;font-size:.8rem;color:var(--accent-blue);border-top:1px solid var(--border-color);cursor:pointer;text-align:center;transition:background .15s;font-weight:600; }
    .prof-card-footer:hover { background:var(--bg-surface); }

    /* Info list */
    .prof-info-list { padding:.2rem 0; }
    .prof-info-row { display:flex;align-items:center;justify-content:space-between;padding:.55rem 1.2rem;border-bottom:1px solid var(--border-color);gap:1rem; }
    .prof-info-row:last-child { border-bottom:none; }
    .prof-info-key { font-size:.78rem;color:var(--text-muted);flex-shrink:0; }
    .prof-info-val { font-size:.8rem;font-weight:600;color:var(--text-primary); }
    .prof-status-tag { font-size:.78rem;font-weight:700; }
    .prof-status-tag.active { color:var(--accent-green); }
    .prof-status-tag.inactive { color:var(--text-muted); }

    /* Perms */
    .prof-perms-grid { display:grid;grid-template-columns:1fr 1fr;padding:.4rem 0; }
    .prof-perm-item { padding:.48rem 1.2rem;font-size:.79rem;display:flex;align-items:center;gap:.35rem;border-bottom:1px solid var(--border-color); }
    .prof-perm-item:nth-last-child(-n+2) { border-bottom:none; }
    .prof-perm-on { color:var(--text-secondary); }
    .prof-perm-off { color:var(--text-muted);opacity:.55; }

    /* Notif rows */
    .prof-notif-row { display:flex;align-items:flex-start;gap:.8rem;padding:.8rem 1.2rem;border-bottom:1px solid var(--border-color);position:relative;transition:background .15s; }
    .prof-notif-row:last-child { border-bottom:none; }
    .prof-notif-row.unread { background:rgba(74,171,247,.03); }
    .prof-notif-row.unread::before { content:'';position:absolute;right:0;top:0;bottom:0;width:3px;background:var(--accent-blue); }
    .prof-notif-icon { width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:.95rem;flex-shrink:0; }
    .prof-ni--orange { background:rgba(255,169,77,.13); }
    .prof-ni--red    { background:rgba(255,107,107,.13); }
    .prof-ni--purple { background:rgba(177,151,252,.13); }
    .prof-ni--blue   { background:rgba(74,171,247,.13); }
    .prof-ni--cyan   { background:rgba(59,201,219,.13); }
    .prof-notif-body { flex:1;min-width:0; }
    .prof-notif-title { font-size:.81rem;font-weight:700;color:var(--text-primary);margin-bottom:.12rem; }
    .prof-notif-desc  { font-size:.76rem;color:var(--text-secondary);margin-bottom:.3rem;line-height:1.5; }
    .prof-notif-meta  { display:flex;align-items:center;gap:.4rem; }
    .prof-notif-badge { padding:.13rem .48rem;border-radius:10px;font-size:.69rem;font-weight:700; }
    .prof-nb--orange { background:rgba(255,169,77,.13);color:var(--accent-orange); }
    .prof-nb--red    { background:rgba(255,107,107,.13);color:#ff6b6b; }
    .prof-nb--purple { background:rgba(177,151,252,.13);color:#b197fc; }
    .prof-nb--blue   { background:rgba(74,171,247,.13);color:var(--accent-blue); }
    .prof-nb--cyan   { background:rgba(59,201,219,.13);color:var(--accent-cyan); }
    .prof-notif-time  { font-size:.72rem;color:var(--text-muted);margin-right:auto; }
    .prof-unread-dot  { width:7px;height:7px;border-radius:50%;background:var(--accent-orange);flex-shrink:0;margin-top:5px; }

    /* TX rows */
    .prof-tx-row { display:flex;align-items:center;gap:.8rem;padding:.7rem 1.2rem;border-bottom:1px solid var(--border-color);cursor:pointer;transition:background .15s; }
    .prof-tx-row:last-child { border-bottom:none; }
    .prof-tx-row:hover { background:var(--bg-surface); }
    .prof-tx-num { font-family:monospace;font-size:.8rem;font-weight:800;color:var(--accent-blue);flex-shrink:0;min-width:70px; }
    .prof-tx-body { flex:1;min-width:0; }
    .prof-tx-type { font-size:.81rem;font-weight:600;color:var(--text-primary);margin-bottom:.18rem; }
    .prof-tx-meta { display:flex;align-items:center;gap:.35rem;flex-wrap:wrap; }
    .prof-tx-stage { padding:.13rem .45rem;border-radius:10px;font-size:.71rem;font-weight:700; }
    .prof-tx--green  { background:rgba(105,219,124,.14);color:var(--accent-green); }
    .prof-tx--cyan   { background:rgba(59,201,219,.14); color:var(--accent-cyan); }
    .prof-tx--orange { background:rgba(255,169,77,.14); color:var(--accent-orange); }
    .prof-tx--purple { background:rgba(177,151,252,.14);color:#b197fc; }
    .prof-tx--blue   { background:rgba(74,171,247,.14); color:var(--accent-blue); }
    .prof-tx--red    { background:rgba(255,107,107,.14);color:#ff6b6b; }
    .prof-tx-status  { font-size:.71rem;color:var(--text-muted); }
    .prof-tx-time    { font-size:.71rem;color:var(--text-muted);margin-right:auto; }

    /* Empty */
    .prof-empty { display:flex;flex-direction:column;align-items:center;gap:.5rem;padding:2rem 1rem;color:var(--text-muted);font-size:.84rem;text-align:center; }
    .prof-empty div:first-child { font-size:1.7rem; }

    /* Responsive */
    @media (max-width:1100px) { .prof-stats-grid{grid-template-columns:repeat(3,1fr);} .prof-body{grid-template-columns:1fr;} }
    @media (max-width:640px)  { .prof-stats-grid{grid-template-columns:repeat(2,1fr);} .prof-hero-content{flex-direction:column;} .prof-perms-grid{grid-template-columns:1fr;} }
    `;
    document.head.appendChild(s);
}