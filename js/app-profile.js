/**
 * app-profile.js — صفحة الملف الشخصي
 * التصميم: سايدبار ثابت + محتوى رئيسي بتبويبات
 */

// ══════════════════════════════════════════════════════════
//  تحميل البيانات
// ══════════════════════════════════════════════════════════
async function loadProfilePage() {
    DOM.mainContent.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;min-height:60vh">
            <div class="spinner"></div>
        </div>`;
    try {
        const [profileRes, statsRes, txRes, notifRes, corrRes, prRes] = await Promise.all([
            fetch('api/?action=employee_profile').then(r => r.json()).catch(() => ({ success: false, data: {} })),
            fetch('api/?action=employee_stats').then(r => r.json()).catch(() => ({ success: false, data: {} })),
            fetch('api/?action=employee_transactions&limit=10').then(r => r.json()).catch(() => ({ success: false, data: [] })),
            fetch('api/?action=notifications&limit=10').then(r => r.json()).catch(() => ({ success: false, data: [] })),
            fetch('api/correspondence_api.php?action=correspondence_list&limit=8').then(r => r.json()).catch(() => ({ success: false, data: {} })),
            fetch('api/purchase_requests_api.php?action=list&limit=8').then(r => r.json()).catch(() => ({ success: false, data: [] })),
        ]);
        const emp = profileRes.success ? profileRes.data : {};
        const stats = statsRes.success ? statsRes.data : {};
        const txs = txRes.success ? (Array.isArray(txRes.data) ? txRes.data : []) : [];
        const notifs = notifRes.success ? (Array.isArray(notifRes.data) ? notifRes.data : []) : [];
        const corrs = corrRes.success ? (corrRes.data?.correspondence || corrRes.data || []) : [];
        const prs = prRes.success ? (Array.isArray(prRes.data?.requests) ? prRes.data.requests : (Array.isArray(prRes.data) ? prRes.data : [])) : [];
        renderProfilePage(emp, stats, txs, notifs, Array.isArray(corrs) ? corrs : [], prs);
    } catch (e) {
        console.error('loadProfilePage:', e);
        renderProfilePage({}, {}, {}, [], [], []);
    }
}

// ══════════════════════════════════════════════════════════
//  الرسم الرئيسي
// ══════════════════════════════════════════════════════════
function renderProfilePage(emp, stats, txs, notifs, corrs, prs) {
    injectProfileStyles();

    const user = Object.assign({}, currentUser || {}, emp);
    const initials = _pGetInitials(user.name || user.user_name || 'م');
    const roleName = _pGetRoleLabel(user.role || user.user_role);
    const permLabel = _pGetPermLabel(user.permission_level || user.permissionLevel);
    const joinDate = user.created_at ? _pFmtDate(user.created_at) : '—';
    const lastLogin = user.last_login ? (typeof formatTimeAgo === 'function' ? formatTimeAgo(user.last_login) : user.last_login) : '—';
    const deptName = user.departmentName || user.department_name || user.sector_name || '';
    const isAdmin = (user.permissionLevel || user.permission_level) === 'system_admin';

    const totalTx = stats.total_transactions || txs.length || 0;
    const doneTx = stats.completed_transactions || 0;
    const pendingTx = stats.pending_transactions || 0;
    const escalations = stats.escalations || notifs.filter(n => ['ola_breach', 'sla_breach', 'escalation', 'manual_escalation'].includes(n.category)).length;
    const unread = notifs.filter(n => !n.is_read).length;

    const permLevel = user.permission_level || user.permissionLevel || 'employee';
    const permColors = {
        system_admin: { bg: '#FCEBEB', tx: '#A32D2D', bdr: '#F09595' },
        CEO: { bg: '#EEEDFE', tx: '#3C3489', bdr: '#AFA9EC' },
        sector_head: { bg: '#E6F1FB', tx: '#0C447C', bdr: '#85B7EB' },
        division_manager: { bg: '#E1F5EE', tx: '#085041', bdr: '#5DCAA5' },
        employee_l1: { bg: '#FAEEDA', tx: '#633806', bdr: '#EF9F27' },
        employee: { bg: '#F1EFE8', tx: '#444441', bdr: '#B4B2A9' },
    };
    const pc = permColors[permLevel] || permColors.employee;

    DOM.mainContent.innerHTML = `
    <div class="prf-page">

      <!-- ══ الشريط الجانبي ══ -->
      <aside class="prf-aside">

        <!-- بطاقة الهوية -->
        <div class="prf-card prf-id-card">
          <div class="prf-id-top">
            <div class="prf-avatar-wrap">
              <div class="prf-avatar">${initials}</div>
              <div class="prf-dot-online" title="نشط الآن"></div>
            </div>
            <div class="prf-id-info">
              <div class="prf-id-name">${user.name || user.user_name || 'الموظف'}</div>
              <div class="prf-id-chips">
                <span class="prf-chip" style="background:${pc.bg};color:${pc.tx};border-color:${pc.bdr}">${permLabel}</span>
                ${user.employee_number ? `<span class="prf-chip prf-chip--num"># ${user.employee_number}</span>` : ''}
              </div>
            </div>
          </div>
          ${deptName ? `
          <div class="prf-id-dept">
            <i class="ti ti-building" aria-hidden="true"></i>
            <span>${deptName}</span>
          </div>`: ''}
          <div class="prf-id-contact">
            ${user.email ? `<div class="prf-id-contact-row"><i class="ti ti-mail" aria-hidden="true"></i><span>${user.email}</span></div>` : ''}
            ${user.phone ? `<div class="prf-id-contact-row"><i class="ti ti-phone" aria-hidden="true"></i><span>${user.phone}</span></div>` : ''}
            <div class="prf-id-contact-row"><i class="ti ti-clock" aria-hidden="true"></i><span>آخر دخول: ${lastLogin}</span></div>
            <div class="prf-id-contact-row"><i class="ti ti-calendar" aria-hidden="true"></i><span>انضم: ${joinDate}</span></div>
          </div>
        </div>

        <!-- بطاقة معلومات الحساب -->
        <div class="prf-card">
          <div class="prf-card-hdr">
            <i class="ti ti-user-circle" aria-hidden="true"></i>
            <span>معلومات الحساب</span>
          </div>
          <div class="prf-info-list">
            <div class="prf-info-row"><span class="prf-ik">الدور</span><span class="prf-iv">${roleName}</span></div>
            <div class="prf-info-row"><span class="prf-ik">مستوى الصلاحية</span><span class="prf-iv">${permLabel}</span></div>
            <div class="prf-info-row"><span class="prf-ik">المشرف المباشر</span><span class="prf-iv">${user.supervisor_name || '—'}</span></div>
            <div class="prf-info-row"><span class="prf-ik">القسم</span><span class="prf-iv">${user.division_name || deptName || '—'}</span></div>
            <div class="prf-info-row"><span class="prf-ik">تاريخ الانضمام</span><span class="prf-iv">${joinDate}</span></div>
            <div class="prf-info-row"><span class="prf-ik">الحالة</span><span class="prf-iv prf-iv--active">● نشط</span></div>
          </div>
        </div>

        <!-- بطاقة الصلاحيات -->
        <div class="prf-card">
          <div class="prf-card-hdr">
            <i class="ti ti-shield-check" aria-hidden="true"></i>
            <span>الصلاحيات الممنوحة</span>
          </div>
          <div class="prf-perms">${_pBuildPerms(user)}</div>
        </div>

        <!-- بطاقة تغيير كلمة المرور -->
        <div class="prf-card">
          <div class="prf-card-hdr">
            <i class="ti ti-lock" aria-hidden="true"></i>
            <span>تغيير كلمة المرور</span>
          </div>
          <div class="prf-pw-body">
            <div class="prf-pw-field">
              <label>كلمة المرور الحالية</label>
              <input type="password" id="prf-pw-old" placeholder="••••••••">
            </div>
            <div class="prf-pw-field">
              <label>كلمة المرور الجديدة</label>
              <input type="password" id="prf-pw-new" placeholder="••••••••">
            </div>
            <div class="prf-pw-field">
              <label>تأكيد كلمة المرور</label>
              <input type="password" id="prf-pw-confirm" placeholder="••••••••">
            </div>
            <button class="prf-pw-btn" onclick="profileChangePassword()">
              <i class="ti ti-check" aria-hidden="true"></i> حفظ كلمة المرور
            </button>
          </div>
        </div>

      </aside>

      <!-- ══ المحتوى الرئيسي ══ -->
      <main class="prf-main">

        <!-- شريط الإحصاء -->
        <div class="prf-stats">
          ${[
            { n: totalTx, lbl: 'إجمالي المعاملات', icon: 'ti-receipt', c: '#378ADD', bg: '#E6F1FB' },
            { n: doneTx, lbl: 'مكتملة', icon: 'ti-circle-check', c: '#1D9E75', bg: '#E1F5EE' },
            { n: pendingTx, lbl: 'قيد الإنجاز', icon: 'ti-clock', c: '#BA7517', bg: '#FAEEDA' },
            { n: corrs.length, lbl: 'الخطابات', icon: 'ti-mail', c: '#534AB7', bg: '#EEEDFE' },
            { n: prs.length, lbl: 'طلبات الشراء', icon: 'ti-shopping-cart', c: '#0F6E56', bg: '#E1F5EE' },
            { n: escalations, lbl: 'تصعيدات', icon: 'ti-alert-triangle', c: '#A32D2D', bg: '#FCEBEB' },
        ].map(s => `
          <div class="prf-stat">
            <div class="prf-stat-icon" style="background:${s.bg};color:${s.c}">
              <i class="ti ${s.icon}" aria-hidden="true"></i>
            </div>
            <div>
              <div class="prf-stat-n" style="color:${s.c}">${s.n}</div>
              <div class="prf-stat-l">${s.lbl}</div>
            </div>
          </div>`).join('')}
        </div>

        <!-- بطاقة التبويبات -->
        <div class="prf-card prf-tabs-card">
          <div class="prf-tabs-bar">
            <button class="prf-tab prf-tab--active" data-ptab="alerts" onclick="profileSwitchTab(this)">
              <i class="ti ti-bell" aria-hidden="true"></i>
              التنبيهات والتصعيدات
              ${unread > 0 ? `<span class="prf-badge">${unread}</span>` : ''}
            </button>
            <button class="prf-tab" data-ptab="transactions" onclick="profileSwitchTab(this)">
              <i class="ti ti-receipt" aria-hidden="true"></i>
              المعاملات
              ${totalTx > 0 ? `<span class="prf-badge prf-badge--blue">${totalTx}</span>` : ''}
            </button>
            <button class="prf-tab" data-ptab="correspondence" onclick="profileSwitchTab(this)">
              <i class="ti ti-mail" aria-hidden="true"></i>
              الخطابات
              ${corrs.length > 0 ? `<span class="prf-badge prf-badge--purple">${corrs.length}</span>` : ''}
            </button>
            <button class="prf-tab" data-ptab="purchases" onclick="profileSwitchTab(this)">
              <i class="ti ti-shopping-cart" aria-hidden="true"></i>
              طلبات الشراء
              ${prs.length > 0 ? `<span class="prf-badge prf-badge--teal">${prs.length}</span>` : ''}
            </button>
          </div>

          <div id="ptab-alerts"  class="prf-panel">
            ${_pBuildNotifs(notifs)}
            <div class="prf-see-all" onclick="switchTab('notifications')">
              عرض كل التنبيهات <i class="ti ti-arrow-left" aria-hidden="true"></i>
            </div>
          </div>
          <div id="ptab-transactions" class="prf-panel" style="display:none">
            ${_pBuildTxs(txs)}
            <div class="prf-see-all" onclick="switchTab('transactions')">
              عرض كل المعاملات <i class="ti ti-arrow-left" aria-hidden="true"></i>
            </div>
          </div>
          <div id="ptab-correspondence" class="prf-panel" style="display:none">
            ${_pBuildCorrs(corrs)}
            <div class="prf-see-all" onclick="switchTab('correspondence')">
              عرض كل الخطابات <i class="ti ti-arrow-left" aria-hidden="true"></i>
            </div>
          </div>
          <div id="ptab-purchases" class="prf-panel" style="display:none">
            ${_pBuildPRs(prs)}
            <div class="prf-see-all" onclick="switchTab('purchase-requests')">
              عرض كل الطلبات <i class="ti ti-arrow-left" aria-hidden="true"></i>
            </div>
          </div>
        </div>

      </main>
    </div>`;
}

// ══════════════════════════════════════════════════════════
//  تبديل التبويبات
// ══════════════════════════════════════════════════════════
function profileSwitchTab(btn) {
    document.querySelectorAll('.prf-tab').forEach(t => t.classList.remove('prf-tab--active'));
    document.querySelectorAll('.prf-panel').forEach(p => p.style.display = 'none');
    btn.classList.add('prf-tab--active');
    const el = document.getElementById('ptab-' + btn.dataset.ptab);
    if (el) el.style.display = 'block';
}

// ══════════════════════════════════════════════════════════
//  تغيير كلمة المرور
// ══════════════════════════════════════════════════════════
async function profileChangePassword() {
    const o = document.getElementById('prf-pw-old')?.value?.trim();
    const n = document.getElementById('prf-pw-new')?.value?.trim();
    const c = document.getElementById('prf-pw-confirm')?.value?.trim();
    if (!o || !n || !c) { showToast('يرجى ملء جميع الحقول', 'error'); return; }
    if (n !== c) { showToast('كلمة المرور الجديدة غير متطابقة', 'error'); return; }
    if (n.length < 6) { showToast('كلمة المرور يجب أن تكون 6 أحرف على الأقل', 'error'); return; }
    try {
        const res = await fetch('api/?action=change_password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ old_password: o, new_password: n }) });
        const data = await res.json();
        if (data.success) {
            showToast('✅ تم تغيير كلمة المرور بنجاح', 'success');
            ['prf-pw-old', 'prf-pw-new', 'prf-pw-confirm'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        } else { showToast('❌ ' + (data.message || 'خطأ في تغيير كلمة المرور'), 'error'); }
    } catch (e) { showToast('❌ خطأ في الاتصال', 'error'); }
}

// ══════════════════════════════════════════════════════════
//  بناء محتوى التبويبات
// ══════════════════════════════════════════════════════════
function _pBuildNotifs(notifs) {
    if (!notifs.length) return `<div class="prf-empty"><i class="ti ti-circle-check" style="font-size:28px;color:#1D9E75"></i><div>لا توجد تنبيهات حالياً</div></div>`;
    const catMap = {
        sla_warning: { icon: 'ti-alert-triangle', label: 'SLA تحذير', bgc: '#FAEEDA', txc: '#854F0B' },
        sla_breach: { icon: 'ti-alert-circle', label: 'SLA تجاوز', bgc: '#FCEBEB', txc: '#A32D2D' },
        ola_breach: { icon: 'ti-alarm', label: 'OLA تجاوز', bgc: '#FCEBEB', txc: '#A32D2D' },
        escalation: { icon: 'ti-arrow-up', label: 'تصعيد', bgc: '#EEEDFE', txc: '#3C3489' },
        manual_escalation: { icon: 'ti-bell', label: 'تصعيد يدوي', bgc: '#E6F1FB', txc: '#0C447C' },
        direct: { icon: 'ti-mail', label: 'مباشر', bgc: '#E1F5EE', txc: '#085041' },
    };
    return notifs.map(n => {
        const cat = catMap[n.category] || { icon: 'ti-bell', label: 'تنبيه', bgc: '#E6F1FB', txc: '#0C447C' };
        const time = typeof formatTimeAgo === 'function' ? formatTimeAgo(n.created_at || n.update_time) : '';
        return `
        <div class="prf-row ${!n.is_read ? 'prf-row--unread' : ''}">
          <div class="prf-row-icon" style="background:${cat.bgc};color:${cat.txc}">
            <i class="ti ${cat.icon}" aria-hidden="true"></i>
          </div>
          <div class="prf-row-body">
            <div class="prf-row-title">${n.title || cat.label}</div>
            <div class="prf-row-desc">${(n.message || '').substring(0, 100)}${(n.message || '').length > 100 ? '…' : ''}</div>
            <div class="prf-row-meta">
              <span class="prf-pill" style="background:${cat.bgc};color:${cat.txc}">${cat.label}</span>
              ${time ? `<span class="prf-time">${time}</span>` : ''}
            </div>
          </div>
          ${!n.is_read ? '<div class="prf-unread-dot"></div>' : ''}
        </div>`;
    }).join('');
}

function _pBuildTxs(txs) {
    if (!txs.length) return `<div class="prf-empty"><i class="ti ti-file-off" style="font-size:28px;color:var(--text-muted)"></i><div>لا توجد معاملات</div></div>`;
    const stMap = { receiving: { lbl: 'الاستلام', bgc: '#E1F5EE', txc: '#0F6E56' }, budget: { lbl: 'الموازنة', bgc: '#E6F1FB', txc: '#0C447C' }, payment: { lbl: 'الدفع', bgc: '#FAEEDA', txc: '#854F0B' }, invoice: { lbl: 'الفوترة', bgc: '#EEEDFE', txc: '#3C3489' }, dispatch: { lbl: 'الصرف', bgc: '#E6F1FB', txc: '#0C447C' }, completed: { lbl: 'مكتملة', bgc: '#E1F5EE', txc: '#0F6E56' } };
    return txs.map(tx => {
        const st = stMap[tx.stage || tx.status] || { lbl: tx.stage || tx.status || '—', bgc: '#F1EFE8', txc: '#444441' };
        const time = typeof formatTimeAgo === 'function' && tx.update_time ? formatTimeAgo(tx.update_time) : '';
        return `
        <div class="prf-row prf-row--click" onclick="switchTab('transactions')">
          <div class="prf-row-icon" style="background:#E6F1FB;color:#0C447C"><i class="ti ti-receipt" aria-hidden="true"></i></div>
          <div class="prf-row-body">
            <div class="prf-row-title">${tx.transaction_type || tx.type || '—'}</div>
            <div class="prf-row-meta">
              <span class="prf-ref">${tx.transaction_number || tx.ref_number || '—'}</span>
              <span class="prf-pill" style="background:${st.bgc};color:${st.txc}">${st.lbl}</span>
              ${time ? `<span class="prf-time">${time}</span>` : ''}
            </div>
          </div>
          <i class="ti ti-chevron-left prf-chev" aria-hidden="true"></i>
        </div>`;
    }).join('');
}

function _pBuildCorrs(corrs) {
    if (!corrs.length) return `<div class="prf-empty"><i class="ti ti-mail-off" style="font-size:28px;color:var(--text-muted)"></i><div>لا توجد خطابات</div></div>`;
    const stMap = { draft: { bgc: '#FAEEDA', txc: '#854F0B', lbl: 'مسودة' }, active: { bgc: '#E6F1FB', txc: '#0C447C', lbl: 'نشط' }, completed: { bgc: '#E1F5EE', txc: '#0F6E56', lbl: 'مكتمل' }, archived: { bgc: '#E6F1FB', txc: '#185FA5', lbl: 'مؤرشف' }, cancelled: { bgc: '#FCEBEB', txc: '#A32D2D', lbl: 'ملغي' } };
    return corrs.map(c => {
        const st = stMap[c.status] || { bgc: '#F1EFE8', txc: '#444441', lbl: c.status || '—' };
        return `
        <div class="prf-row prf-row--click" onclick="switchTab('correspondence')">
          <div class="prf-row-icon" style="background:#EEEDFE;color:#3C3489"><i class="ti ti-mail" aria-hidden="true"></i></div>
          <div class="prf-row-body">
            <div class="prf-row-title">${(c.subject || c.title || '—').substring(0, 55)}</div>
            <div class="prf-row-meta">
              <span class="prf-ref">${c.reference_number || '—'}</span>
              <span class="prf-pill" style="background:${st.bgc};color:${st.txc}">${st.lbl}</span>
              ${c.type ? `<span class="prf-pill" style="background:#F1EFE8;color:#5F5E5A">${c.type}</span>` : ''}
            </div>
          </div>
          <i class="ti ti-chevron-left prf-chev" aria-hidden="true"></i>
        </div>`;
    }).join('');
}

function _pBuildPRs(prs) {
    if (!prs.length) return `<div class="prf-empty"><i class="ti ti-shopping-cart-off" style="font-size:28px;color:var(--text-muted)"></i><div>لا توجد طلبات شراء</div></div>`;
    const stMap = { draft: { bgc: '#F1EFE8', txc: '#5F5E5A', lbl: 'مسودة' }, reception: { bgc: '#E6F1FB', txc: '#0C447C', lbl: 'الاستلام' }, budget_review: { bgc: '#FAEEDA', txc: '#854F0B', lbl: 'الموازنة' }, treasury_review: { bgc: '#EEEDFE', txc: '#3C3489', lbl: 'الخزينة' }, finance_review: { bgc: '#E1F5EE', txc: '#085041', lbl: 'المالية' }, ceo_approval: { bgc: '#FCEBEB', txc: '#A32D2D', lbl: 'CEO' }, payment: { bgc: '#E1F5EE', txc: '#0F6E56', lbl: 'الدفع' }, completed: { bgc: '#E1F5EE', txc: '#0F6E56', lbl: 'مكتمل' } };
    return prs.map(pr => {
        const st = stMap[pr.current_stage || pr.status] || { bgc: '#F1EFE8', txc: '#5F5E5A', lbl: pr.current_stage || '—' };
        const amt = pr.total_amount ? Number(pr.total_amount).toLocaleString('ar-SA') + ' ر.س' : '';
        return `
        <div class="prf-row prf-row--click" onclick="switchTab('purchase-requests')">
          <div class="prf-row-icon" style="background:#E1F5EE;color:#0F6E56"><i class="ti ti-shopping-cart" aria-hidden="true"></i></div>
          <div class="prf-row-body">
            <div class="prf-row-title">${(pr.purpose || pr.title || pr.items_description || '—').substring(0, 55)}</div>
            <div class="prf-row-meta">
              <span class="prf-ref">${pr.request_number || '—'}</span>
              <span class="prf-pill" style="background:${st.bgc};color:${st.txc}">${st.lbl}</span>
              ${amt ? `<span class="prf-time">${amt}</span>` : ''}
            </div>
          </div>
          <i class="ti ti-chevron-left prf-chev" aria-hidden="true"></i>
        </div>`;
    }).join('');
}

function _pBuildPerms(user) {
    const level = user.permissionLevel || user.permission_level || 'employee';
    if (level === 'system_admin') return `<div class="prf-perm-admin"><i class="ti ti-shield-check" aria-hidden="true"></i>صلاحية كاملة — مدير النظام</div>`;
    const pagePerms = user.pagePermissions || {};
    const hasPerms = Object.keys(pagePerms).length > 0;
    const pages = [
        { k: 'dashboard', lbl: 'لوحة التحكم' },
        { k: 'transactions', lbl: 'المعاملات' },
        { k: 'correspondence', lbl: 'الخطابات' },
        { k: 'purchase-requests', lbl: 'طلبات الشراء' },
        { k: 'bank-overview', lbl: 'الخزينة' },
        { k: 'daily-payments', lbl: 'المدفوعات اليومية' },
        { k: 'reservations', lbl: 'حجوزات الموازنة' },
        { k: 'archive', lbl: 'الأرشيف المالي' },
        { k: 'sla', lbl: 'SLA / OLA' },
        { k: 'performance', lbl: 'متابعة الأداء' },
        { k: 'ceo-approvals', lbl: 'اعتمادات CEO' },
        { k: 'budget-plans', lbl: 'الموازنة التقديرية' },
    ];
    return pages.map(p => {
        const on = hasPerms ? (pagePerms[p.k] === true || pagePerms[p.k] === 1) : false;
        return `<div class="prf-perm-row ${on ? 'on' : 'off'}">
            <i class="ti ${on ? 'ti-circle-check' : 'ti-circle-x'}" aria-hidden="true"></i>
            <span>${p.lbl}</span>
        </div>`;
    }).join('');
}

// ══════════════════════════════════════════════════════════
//  مساعدات
// ══════════════════════════════════════════════════════════
function _pGetInitials(name) {
    const p = (name || '').trim().split(' ').filter(Boolean);
    return p.length >= 2 ? p[0][0] + p[1][0] : (p[0] || 'م').substring(0, 2);
}
function _pGetRoleLabel(role) {
    return { admin: 'مدير النظام', CEO: 'الرئيس التنفيذي', sector_head: 'رئيس القطاع', division_manager: 'مدير القسم', employee_l1: 'موظف مستوى أول', employee: 'موظف', receiver: 'الاستلام', budget: 'الموازنة', payment: 'الدفع', invoice: 'الفوترة', dispatch: 'الصرف', purchasing: 'المشتريات' }[role] || role || '—';
}
function _pGetPermLabel(level) {
    return { system_admin: 'مدير النظام', CEO: 'الرئيس التنفيذي', sector_head: 'رئيس القطاع', division_manager: 'مدير القسم', employee_l1: 'موظف مستوى أول', employee: 'موظف' }[level] || level || 'موظف';
}
function _pFmtDate(dt) {
    if (!dt) return '—';
    try { return new Date(dt).toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' }); } catch (e) { return dt; }
}

// ══════════════════════════════════════════════════════════
//  CSS
// ══════════════════════════════════════════════════════════
function injectProfileStyles() {
    if (document.getElementById('prf-styles')) return;
    const s = document.createElement('style'); s.id = 'prf-styles';
    s.textContent = `
/* ── layout ── */
.prf-page{display:grid;grid-template-columns:260px 1fr;gap:1.25rem;padding:var(--pr-gap,1.25rem);align-items:start;animation:prfIn .3s ease}
@keyframes prfIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}

/* ── aside ── */
.prf-aside{display:flex;flex-direction:column;gap:1rem;position:sticky;top:1rem}

/* ── card ── */
.prf-card{background:var(--bg-card);border:1px solid var(--border-color);border-radius:14px;overflow:hidden}
.prf-card-hdr{display:flex;align-items:center;gap:.45rem;padding:.7rem 1rem;font-size:.83rem;font-weight:700;color:var(--text-primary);border-bottom:1px solid var(--border-color);background:var(--bg-surface)}
.prf-card-hdr .ti{font-size:15px;color:var(--text-muted)}

/* ── id card ── */
.prf-id-card{padding:0}
.prf-id-top{display:flex;align-items:flex-start;gap:.9rem;padding:1rem}
.prf-avatar-wrap{position:relative;flex-shrink:0}
.prf-avatar{width:52px;height:52px;border-radius:14px;background:linear-gradient(135deg,#378ADD,#7F77DD);color:#fff;font-size:1.1rem;font-weight:700;display:flex;align-items:center;justify-content:center}
.prf-dot-online{position:absolute;bottom:2px;left:2px;width:10px;height:10px;border-radius:50%;background:#1D9E75;border:2px solid var(--bg-card)}
.prf-id-info{flex:1;min-width:0}
.prf-id-name{font-size:.95rem;font-weight:700;color:var(--text-primary);margin-bottom:.4rem;line-height:1.3;word-break:break-word}
.prf-id-chips{display:flex;flex-wrap:wrap;gap:.3rem}
.prf-chip{display:inline-block;padding:.18rem .6rem;border-radius:20px;font-size:.72rem;font-weight:600;border:.5px solid transparent}
.prf-chip--num{background:var(--bg-surface);border-color:var(--border-color);color:var(--text-muted)}
.prf-id-dept{display:flex;align-items:center;gap:.4rem;padding:.4rem 1rem;font-size:.77rem;color:var(--text-secondary);border-top:1px solid var(--border-color);background:var(--bg-surface)}
.prf-id-dept .ti{font-size:14px;color:var(--text-muted)}
.prf-id-contact{padding:.5rem 1rem .7rem;display:flex;flex-direction:column;gap:.3rem;border-top:1px solid var(--border-color)}
.prf-id-contact-row{display:flex;align-items:center;gap:.4rem;font-size:.76rem;color:var(--text-muted)}
.prf-id-contact-row .ti{font-size:13px;flex-shrink:0}

/* ── info list ── */
.prf-info-list{}
.prf-info-row{display:flex;align-items:center;justify-content:space-between;padding:.48rem 1rem;border-bottom:.5px solid var(--border-color);gap:.5rem}
.prf-info-row:last-child{border-bottom:none}
.prf-ik{font-size:.74rem;color:var(--text-muted);flex-shrink:0}
.prf-iv{font-size:.77rem;font-weight:600;color:var(--text-primary);text-align:left}
.prf-iv--active{color:#1D9E75}

/* ── perms ── */
.prf-perms{padding:.25rem 0}
.prf-perm-row{display:flex;align-items:center;gap:.4rem;padding:.36rem 1rem;font-size:.77rem}
.prf-perm-row .ti{font-size:13px;flex-shrink:0}
.prf-perm-row.on{color:var(--text-secondary)}.prf-perm-row.on .ti{color:#1D9E75}
.prf-perm-row.off{color:var(--text-muted);opacity:.5}.prf-perm-row.off .ti{color:var(--text-muted)}
.prf-perm-admin{display:flex;align-items:center;gap:.5rem;padding:.85rem 1rem;font-size:.82rem;font-weight:700;color:#1D9E75}
.prf-perm-admin .ti{font-size:16px}

/* ── password ── */
.prf-pw-body{padding:12px 14px 14px;display:flex;flex-direction:column;gap:8px}
.prf-pw-field{display:flex;flex-direction:column;gap:3px}
.prf-pw-field label{font-size:.72rem;color:var(--text-muted)}
.prf-pw-field input{height:30px;border:.5px solid var(--border-color);border-radius:8px;background:var(--bg-primary);color:var(--text-primary);font-size:.8rem;padding:0 8px;outline:none;transition:border-color .15s;font-family:inherit}
.prf-pw-field input:focus{border-color:var(--btn-primary-bg)}
.prf-pw-btn{display:flex;align-items:center;justify-content:center;gap:.35rem;height:30px;border-radius:8px;background:var(--btn-primary-bg);color:var(--btn-primary-text);border:none;font-size:.8rem;font-weight:600;cursor:pointer;transition:opacity .15s;font-family:inherit;margin-top:2px}
.prf-pw-btn:hover{opacity:.88}.prf-pw-btn .ti{font-size:14px}

/* ── main ── */
.prf-main{display:flex;flex-direction:column;gap:1rem}

/* ── stats bar ── */
.prf-stats{display:grid;grid-template-columns:repeat(6,1fr);gap:.6rem}
.prf-stat{background:var(--bg-card);border:1px solid var(--border-color);border-radius:12px;padding:.8rem .9rem;display:flex;align-items:center;gap:.65rem;transition:transform .15s,box-shadow .15s}
.prf-stat:hover{transform:translateY(-2px);box-shadow:0 4px 16px rgba(0,0,0,.08)}
.prf-stat-icon{width:34px;height:34px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.prf-stat-n{font-size:1.2rem;font-weight:700;line-height:1}
.prf-stat-l{font-size:.68rem;color:var(--text-muted);margin-top:.18rem}

/* ── tabs card ── */
.prf-tabs-card{overflow:visible}
.prf-tabs-bar{display:flex;border-bottom:1px solid var(--border-color);background:var(--bg-surface);padding:0 .5rem;overflow-x:auto}
.prf-tab{display:flex;align-items:center;gap:.4rem;padding:.75rem .9rem;font-size:.8rem;font-weight:600;color:var(--text-muted);border:none;background:transparent;cursor:pointer;border-bottom:2px solid transparent;transition:all .15s;font-family:inherit;white-space:nowrap;flex-shrink:0}
.prf-tab .ti{font-size:14px}
.prf-tab:hover{color:var(--text-primary)}
.prf-tab--active{color:var(--text-primary);border-bottom-color:var(--btn-primary-bg)}
.prf-badge{display:inline-flex;align-items:center;justify-content:center;min-width:17px;height:17px;padding:0 4px;border-radius:9px;font-size:.68rem;font-weight:700;background:#E24B4A;color:#fff}
.prf-badge--blue{background:#378ADD}.prf-badge--purple{background:#7F77DD}.prf-badge--teal{background:#1D9E75}

/* ── panel rows ── */
.prf-panel{min-height:200px}
.prf-row{display:flex;align-items:flex-start;gap:.8rem;padding:.75rem 1rem;border-bottom:.5px solid var(--border-color);position:relative;transition:background .12s}
.prf-row:last-of-type{border-bottom:none}
.prf-row--unread{background:rgba(55,138,221,.03)}
.prf-row--unread::after{content:'';position:absolute;inset-inline-end:0;inset-block:0;width:3px;background:#378ADD;border-radius:0 3px 3px 0}
.prf-row--click{cursor:pointer}.prf-row--click:hover{background:var(--bg-surface)}
.prf-row-icon{width:34px;height:34px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0;margin-top:1px}
.prf-row-body{flex:1;min-width:0}
.prf-row-title{font-size:.82rem;font-weight:600;color:var(--text-primary);margin-bottom:.22rem;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.prf-row-desc{font-size:.76rem;color:var(--text-secondary);line-height:1.4;margin-bottom:.28rem}
.prf-row-meta{display:flex;align-items:center;gap:.35rem;flex-wrap:wrap}
.prf-ref{font-size:.72rem;font-weight:700;color:#378ADD;font-family:monospace}
.prf-time{font-size:.71rem;color:var(--text-muted)}
.prf-chev{color:var(--text-muted);font-size:15px;flex-shrink:0;margin-top:2px}
.prf-unread-dot{width:7px;height:7px;border-radius:50%;background:#EF9F27;flex-shrink:0;margin-top:5px}
.prf-pill{padding:.14rem .44rem;border-radius:10px;font-size:.69rem;font-weight:600}
.prf-see-all{display:flex;align-items:center;justify-content:center;gap:.35rem;padding:.65rem 1rem;font-size:.8rem;font-weight:600;color:var(--accent-blue,#378ADD);cursor:pointer;border-top:1px solid var(--border-color);transition:background .12s}
.prf-see-all:hover{background:var(--bg-surface)}.prf-see-all .ti{font-size:13px}
.prf-empty{display:flex;flex-direction:column;align-items:center;gap:.6rem;padding:2.5rem 1rem;color:var(--text-muted);font-size:.83rem;text-align:center}

/* ── responsive ── */
@media(max-width:1100px){.prf-stats{grid-template-columns:repeat(3,1fr)}}
@media(max-width:900px){.prf-page{grid-template-columns:1fr}.prf-aside{position:static;display:grid;grid-template-columns:1fr 1fr;gap:1rem}}
@media(max-width:600px){.prf-stats{grid-template-columns:repeat(2,1fr)}.prf-aside{grid-template-columns:1fr}}
`;
    document.head.appendChild(s);
}