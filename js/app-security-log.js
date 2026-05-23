/**
 * app-security-log.js
 * صفحة سجل الأمان — تتبع نشاط الموظفين
 */

const SEC_API = 'api/security_log_api.php';

// ════════════════════════════════════════════════════════════
// تحميل الصفحة
// ════════════════════════════════════════════════════════════
async function loadSecurityLogPage(containerId) {
    var container = containerId ? document.getElementById(containerId) : null;
    if (container) {
        container.innerHTML = secRenderShell();
    } else {
        showLoading();
        DOM.mainContent.innerHTML = secRenderShell();
    }
    await secLoadStats();
    await secLoadList();
    secInitFilters();
}

function secRenderShell() {
    return `
    <div class="sec-page" style="padding:var(--content-padding-v) var(--content-padding-h)">

        <!-- Header -->
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.25rem;flex-wrap:wrap;gap:.75rem">
            <div>
                <h2 style="font-size:1.1rem;font-weight:700;color:var(--text-primary);margin:0">
                    🔐 سجل الأمان
                </h2>
                <p style="font-size:.8rem;color:var(--text-muted);margin:.2rem 0 0">
                    تتبع كامل لتسجيل الدخول، الخروج، والأنشطة الحساسة
                </p>
            </div>
            <div style="display:flex;gap:.5rem">
                <button class="btn btn-secondary" onclick="secShowActivityChart()" style="font-size:.8rem">
                    📊 مخطط النشاط
                </button>
                <button class="btn btn-secondary" onclick="secExportCSV()" style="font-size:.8rem">
                    📥 تصدير CSV
                </button>
            </div>
        </div>

        <!-- KPI Cards -->
        <div id="sec-kpi" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:.75rem;margin-bottom:1.25rem">
            <div class="sec-kpi-skeleton"></div>
            <div class="sec-kpi-skeleton"></div>
            <div class="sec-kpi-skeleton"></div>
            <div class="sec-kpi-skeleton"></div>
        </div>

        <!-- Filters -->
        <div style="display:flex;flex-wrap:wrap;gap:.5rem;margin-bottom:1rem;background:var(--bg-surface);padding:.75rem;border-radius:10px;border:1px solid var(--border-color)">
            <input type="text" id="sec-search" placeholder="بحث باسم أو رقم موظف..." class="form-input" style="flex:1;min-width:160px;font-size:.82rem">
            <select id="sec-type" class="form-input" style="min-width:140px;font-size:.82rem">
                <option value="">كل الأحداث</option>
                <option value="login">تسجيل دخول</option>
                <option value="login_failed">دخول فاشل</option>
                <option value="logout">تسجيل خروج</option>
                <option value="brute_force_blocked">حجب Brute Force</option>
                <option value="page_view">زيارة صفحة</option>
                <option value="data_export">تصدير بيانات</option>
                <option value="new_ip_login">دخول من IP جديد</option>
                <option value="login_off_hours">دخول خارج الدوام</option>
                <option value="brute_force_warning">تحذير Brute Force</option>
                <option value="data_delete">حذف بيانات</option>
                <option value="settings_change">تغيير إعداد نظام</option>
                <option value="permissions_change">تغيير صلاحيات</option>
                <option value="pr_create">إنشاء طلب شراء</option>
                <option value="pr_approve">موافقة على طلب</option>
                <option value="pr_reject">رفض طلب</option>
                <option value="pr_refer">إحالة طلب</option>
                <option value="pr_assign">إسناد طلب</option>
                <option value="pr_po_issue">إصدار أمر شراء</option>
                <option value="pr_payment">إرسال للدفع</option>
                <option value="transaction_add">إضافة معاملة مالية</option>
                <option value="correspondence_send">إرسال خطاب</option>
                <option value="budget_reserve">حجز موازنة</option>
                <option value="payment_execute">تنفيذ دفع</option>
                <option value="settings_change">تغيير إعدادات</option>
            </select>
            <select id="sec-result" class="form-input" style="min-width:120px;font-size:.82rem">
                <option value="">كل النتائج</option>
                <option value="success">ناجح ✅</option>
                <option value="failure">فاشل ❌</option>
                <option value="warning">تحذير ⚠️</option>
            </select>
            <input type="date" id="sec-from" class="form-input" style="font-size:.82rem">
            <input type="date" id="sec-to" class="form-input" style="font-size:.82rem">
            <button class="btn btn-primary" onclick="secLoadList(1)" style="font-size:.82rem">🔍 بحث</button>
            <button class="btn btn-secondary" onclick="secResetFilters()" style="font-size:.82rem">↺ إعادة</button>
        </div>

        <!-- Table -->
        <div class="pr-table-wrap">
            <table class="pr-table" id="sec-table">
                <thead>
                    <tr>
                        <th>التاريخ والوقت</th>
                        <th>الموظف</th>
                        <th>الدور</th>
                        <th>الحدث</th>
                        <th>النتيجة</th>
                        <th>عنوان IP</th>
                        <th>التفاصيل</th>
                        <th>الجهاز</th>
                    </tr>
                </thead>
                <tbody id="sec-tbody">
                    <tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--text-muted)">جاري التحميل...</td></tr>
                </tbody>
            </table>
        </div>

        <!-- Pagination -->
        <div id="sec-pagination" style="display:flex;align-items:center;justify-content:space-between;margin-top:.75rem;flex-wrap:wrap;gap:.5rem"></div>

    </div>`;
}

// ════════════════════════════════════════════════════════════
// KPI Cards
// ════════════════════════════════════════════════════════════
async function secLoadStats() {
    try {
        const res = await fetch(SEC_API + '?action=stats&days=30');
        const data = await res.json();
        if (!data.success) return;

        const t = data.data.totals || {};
        const kpis = [
            { label: 'إجمالي الأحداث', val: Number(t.total || 0).toLocaleString('ar'), color: '#3b82f6', icon: '📋' },
            { label: 'دخول ناجح', val: Number(t.successes || 0).toLocaleString('ar'), color: '#22c55e', icon: '✅' },
            { label: 'محاولات فاشلة', val: Number(t.failures || 0).toLocaleString('ar'), color: '#ef4444', icon: '❌' },
            { label: 'تحذيرات', val: Number(t.warnings || 0).toLocaleString('ar'), color: '#f59e0b', icon: '⚠️' },
        ];

        document.getElementById('sec-kpi').innerHTML = kpis.map(k => `
            <div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:10px;padding:.85rem 1rem">
                <div style="font-size:1.4rem;margin-bottom:.3rem">${k.icon}</div>
                <div style="font-size:1.3rem;font-weight:700;color:${k.color}">${k.val}</div>
                <div style="font-size:.72rem;color:var(--text-muted)">${k.label} (30 يوم)</div>
            </div>`).join('');
    } catch (e) { }
}

// ════════════════════════════════════════════════════════════
// جلب وعرض السجلات
// ════════════════════════════════════════════════════════════
let secCurrentPage = 1;

async function secLoadList(page = secCurrentPage) {
    secCurrentPage = page;
    const tbody = document.getElementById('sec-tbody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:1.5rem;color:var(--text-muted)">جاري التحميل...</td></tr>`;

    const params = new URLSearchParams({
        action: 'list',
        page: page,
        per_page: 50,
        search: document.getElementById('sec-search')?.value || '',
        event_type: document.getElementById('sec-type')?.value || '',
        result: document.getElementById('sec-result')?.value || '',
        date_from: document.getElementById('sec-from')?.value || '',
        date_to: document.getElementById('sec-to')?.value || '',
    });

    try {
        const res = await fetch(SEC_API + '?' + params);
        const data = await res.json();
        if (!data.success) { tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:#ef4444">خطأ في التحميل</td></tr>`; return; }

        if (!data.data.length) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--text-muted)">لا توجد سجلات</td></tr>`;
            document.getElementById('sec-pagination').innerHTML = '';
            return;
        }

        tbody.innerHTML = data.data.map(row => {
            const resultBadge = {
                success: '<span style="background:#dcfce7;color:#16a34a;padding:2px 8px;border-radius:99px;font-size:.72rem;font-weight:600">✅ ناجح</span>',
                failure: '<span style="background:#fee2e2;color:#dc2626;padding:2px 8px;border-radius:99px;font-size:.72rem;font-weight:600">❌ فاشل</span>',
                warning: '<span style="background:#fef3c7;color:#d97706;padding:2px 8px;border-radius:99px;font-size:.72rem;font-weight:600">⚠️ تحذير</span>',
            }[row.event_result] || row.event_result;

            const eventLabels = {
                login: 'تسجيل دخول',
                login_failed: 'دخول فاشل',
                logout: 'تسجيل خروج',
                brute_force_blocked: 'حجب Brute Force',
                page_view: 'زيارة صفحة',
                data_export: 'تصدير بيانات',
                new_ip_login: '🌐 دخول من IP جديد',
                login_off_hours: '🕐 دخول خارج الدوام',
                brute_force_warning: '⚠️ تحذير Brute Force',
                data_delete: '🗑️ حذف بيانات',
                settings_change: '⚙️ تغيير إعداد',
                permissions_change: '🔑 تغيير صلاحيات',
                password_change: 'تغيير كلمة مرور',
                unauthorized_access: 'وصول غير مصرح',
                pr_create: '📋 إنشاء طلب شراء',
                pr_approve: '✅ موافقة على طلب',
                pr_reject: '❌ رفض طلب',
                pr_return: '↩️ إرجاع طلب',
                pr_refer: '🔀 إحالة طلب',
                pr_assign: '👤 إسناد طلب',
                pr_stage_change: '➡️ تغيير مرحلة',
                pr_po_issue: '📋 إصدار أمر شراء',
                pr_budget_link: '🔗 ربط موازنة',
                pr_payment: '💳 إرسال للدفع',
                pr_sla_pause: '⏸️ إيقاف SLA',
                pr_sla_resume: '▶️ استئناف SLA',
                pr_workflow_redirect: '🔄 تحويل مسار',
                pr_note: '📝 ملاحظة',
                pr_attachment: '📎 مرفق',
                pr_amount_change: '💰 تعديل مبلغ',
                transaction_add: '💵 إضافة معاملة مالية',
                transaction_edit: '✏️ تعديل معاملة',
                transaction_delete: '🗑️ حذف معاملة',
                correspondence_send: '✉️ إرسال خطاب',
                budget_reserve: '📌 حجز موازنة',
                budget_approve: '✅ اعتماد حجز',
                payment_execute: '💳 تنفيذ دفع',
                attachment_upload: '📎 رفع مرفق',
                settings_change: '⚙️ تغيير إعدادات',
            };
            const eventLabel = eventLabels[row.event_type] || row.event_type;

            const ua = row.user_agent || '';
            const browser = ua.includes('Chrome') ? '🌐 Chrome' :
                ua.includes('Firefox') ? '🦊 Firefox' :
                    ua.includes('Safari') ? '🧭 Safari' :
                        ua.includes('Edge') ? '🔷 Edge' : '💻 متصفح';

            const dt = new Date(row.created_at);
            const dateStr = dt.toLocaleDateString('ar-SA-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' });
            const timeStr = dt.toLocaleTimeString('ar-SA-u-nu-latn', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

            return `<tr style="cursor:pointer" onclick="secShowEmployeeLog(${row.employee_id || 0}, '${(row.employee_name || '').replace(/'/g, '')}')">
                <td>
                    <div style="font-size:.82rem;font-weight:600">${dateStr}</div>
                    <div style="font-size:.75rem;color:var(--text-muted);font-family:monospace">${timeStr}</div>
                </td>
                <td>
                    <div style="font-size:.85rem;font-weight:600">${row.employee_name || '<span style="color:var(--text-muted)">غير معروف</span>'}</div>
                    <div style="font-size:.72rem;color:var(--text-muted)">${row.employee_number || ''}</div>
                </td>
                <td style="font-size:.78rem;color:var(--text-muted)">${row.emp_role || '—'}</td>
                <td>
                    <span style="font-size:.78rem;background:var(--bg-surface);padding:2px 8px;border-radius:6px;border:1px solid var(--border-color)">${eventLabel}</span>
                </td>
                <td>${resultBadge}</td>
                <td style="font-family:monospace;font-size:.78rem">${row.ip_address || '—'}</td>
                <td style="font-size:.78rem;color:var(--text-secondary);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${row.action_detail || ''}">${row.action_detail || '—'}</td>
                <td style="font-size:.78rem">${browser}</td>
            </tr>`;
        }).join('');

        // Pagination
        secRenderPagination(data.page, data.total_pages, data.total);

    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:#ef4444">خطأ في الاتصال</td></tr>`;
    }
}

function secRenderPagination(page, totalPages, total) {
    const el = document.getElementById('sec-pagination');
    if (!el) return;
    el.innerHTML = `
        <span style="font-size:.8rem;color:var(--text-muted)">${total.toLocaleString('ar')} سجل</span>
        <div style="display:flex;gap:.4rem;align-items:center">
            <button class="btn btn-secondary" style="font-size:.78rem;padding:.3rem .75rem" onclick="secLoadList(${page - 1})" ${page <= 1 ? 'disabled' : ''}>‹ السابق</button>
            <span style="font-size:.82rem;color:var(--text-muted)">صفحة ${page} من ${totalPages}</span>
            <button class="btn btn-secondary" style="font-size:.78rem;padding:.3rem .75rem" onclick="secLoadList(${page + 1})" ${page >= totalPages ? 'disabled' : ''}>التالي ›</button>
        </div>`;
}

// ════════════════════════════════════════════════════════════
// تفاصيل موظف في Modal
// ════════════════════════════════════════════════════════════
async function secShowEmployeeLog(empId, empName) {
    if (!empId) return;
    DOM.modalTitle.textContent = 'سجل نشاط الموظف';
    DOM.modalBody.innerHTML = '<div style="padding:3rem;text-align:center;color:var(--text-muted)"><div class="spinner"></div></div>';
    openModal('large');

    try {
        const res = await fetch(SEC_API + '?action=employee_timeline&employee_id=' + empId);
        const data = await res.json();
        if (!data.success) { DOM.modalBody.innerHTML = '<div style="padding:1rem;color:#ef4444">خطأ في التحميل</div>'; return; }

        const s = data.summary || {};
        const rows = data.data || [];

        const eventLabels = {
            login: 'تسجيل دخول', login_failed: 'دخول فاشل', logout: 'تسجيل خروج',
            brute_force_blocked: 'حجب Brute Force', page_view: 'زيارة صفحة',
            pr_create: 'إنشاء طلب شراء', pr_approve: 'موافقة على طلب', pr_reject: 'رفض طلب',
            pr_refer: 'إحالة طلب', pr_assign: 'إسناد طلب', pr_po_issue: 'إصدار أمر شراء',
            pr_payment: 'إرسال للدفع', pr_stage_change: 'تغيير مرحلة',
            pr_budget_link: 'ربط موازنة', pr_attachment: 'رفع مرفق',
        };

        const resultConfig = {
            success: { bg: '#dcfce7', color: '#16a34a', icon: '✓', label: 'ناجح' },
            failure: { bg: '#fee2e2', color: '#dc2626', icon: '✕', label: 'فاشل' },
            warning: { bg: '#fef3c7', color: '#d97706', icon: '!', label: 'تحذير' },
        };

        const eventIcons = {
            login: '🔓', logout: '🔒', login_failed: '🚫', brute_force_blocked: '🛡',
            pr_create: '📋', pr_approve: '✅', pr_reject: '❌', pr_refer: '🔀',
            pr_assign: '👤', pr_po_issue: '📄', pr_payment: '💳', pr_stage_change: '➡',
            page_view: '👁', pr_attachment: '📎', pr_budget_link: '🔗',
        };

        // initials
        var initials = (empName || 'م').split(' ').map(function (w) { return w[0]; }).slice(0, 2).join('');

        var html = '';

        // ── Header الموظف ──────────────────────────────────────
        html += '<div style="display:flex;align-items:center;gap:1rem;padding:1.25rem 1.5rem;'
            + 'border-bottom:1px solid var(--border-color);background:var(--bg-surface);margin:-1rem -1rem 1.25rem">';
        html += '<div style="width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,#3b82f6,#6366f1);'
            + 'display:flex;align-items:center;justify-content:center;font-size:1.2rem;font-weight:700;color:#fff;flex-shrink:0">'
            + initials + '</div>';
        html += '<div style="flex:1">';
        html += '<div style="font-size:1rem;font-weight:700;color:var(--text-primary)">' + empName + '</div>';
        html += '<div style="font-size:.78rem;color:var(--text-muted);margin-top:2px">آخر نشاط: '
            + (s.last_login ? new Date(s.last_login).toLocaleDateString('ar-SA-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' }) : '—')
            + '</div></div>';
        // badge الحالة
        var failCnt = parseInt(s.failed_logins || 0);
        if (failCnt > 0) {
            html += '<div style="background:#fee2e2;color:#dc2626;padding:.3rem .85rem;border-radius:99px;font-size:.75rem;font-weight:600">'
                + '⚠ ' + failCnt + ' محاولة فاشلة</div>';
        } else {
            html += '<div style="background:#dcfce7;color:#16a34a;padding:.3rem .85rem;border-radius:99px;font-size:.75rem;font-weight:600">✓ حساب سليم</div>';
        }
        html += '</div>';

        // ── KPI Cards ───────────────────────────────────────────
        var kpis = [
            { label: 'إجمالي الأحداث', val: s.total_events || 0, color: '#3b82f6', icon: '📋' },
            { label: 'دخول فاشل', val: s.failed_logins || 0, color: '#ef4444', icon: '🚫' },
            { label: 'أيام نشطة', val: s.active_days || 0, color: '#22c55e', icon: '📅' },
            { label: 'IPs مختلفة', val: s.unique_ips || 0, color: '#f59e0b', icon: '🌐' },
        ];
        html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:.6rem;margin-bottom:1.25rem">';
        kpis.forEach(function (k) {
            html += '<div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:10px;padding:.8rem 1rem;text-align:center">';
            html += '<div style="font-size:1.3rem;margin-bottom:.2rem">' + k.icon + '</div>';
            html += '<div style="font-size:1.25rem;font-weight:700;color:' + k.color + '">' + Number(k.val).toLocaleString('ar') + '</div>';
            html += '<div style="font-size:.7rem;color:var(--text-muted);margin-top:2px">' + k.label + '</div>';
            html += '</div>';
        });
        html += '</div>';

        // ── تاريخ النشاط ─────────────────────────────────────
        html += '<div style="font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;'
            + 'color:var(--text-muted);margin-bottom:.65rem;padding:0 .25rem">سجل الأحداث</div>';
        html += '<div style="max-height:380px;overflow-y:auto;display:flex;flex-direction:column;gap:.4rem">';

        rows.forEach(function (row) {
            var rc = resultConfig[row.event_result] || resultConfig.success;
            var dt = new Date(row.created_at);
            var dateStr = dt.toLocaleDateString('ar-SA-u-nu-latn', { month: 'short', day: 'numeric', year: 'numeric' });
            var timeStr = dt.toLocaleTimeString('ar-SA-u-nu-latn', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
            var eIcon = eventIcons[row.event_type] || '📌';
            var eLabel = eventLabels[row.event_type] || row.event_type;
            var detail = row.action_detail || '';

            html += '<div style="display:flex;align-items:flex-start;gap:.75rem;padding:.7rem .9rem;'
                + 'background:var(--bg-card);border:1px solid var(--border-color);border-radius:10px;'
                + 'transition:background .15s" '
                + 'onmouseenter="this.style.background=\'var(--bg-surface)\'" '
                + 'onmouseleave="this.style.background=\'var(--bg-card)\'">';

            // أيقونة الحدث
            html += '<div style="width:34px;height:34px;border-radius:8px;background:' + rc.bg + ';'
                + 'display:flex;align-items:center;justify-content:center;font-size:.95rem;flex-shrink:0">'
                + eIcon + '</div>';

            // المحتوى
            html += '<div style="flex:1;min-width:0">';
            html += '<div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap">';
            html += '<span style="font-size:.82rem;font-weight:600;color:var(--text-primary)">' + eLabel + '</span>';
            html += '<span style="font-size:.7rem;padding:1px 7px;border-radius:99px;background:' + rc.bg + ';color:' + rc.color + ';font-weight:600">'
                + rc.icon + ' ' + rc.label + '</span>';
            html += '</div>';
            if (detail) {
                html += '<div style="font-size:.76rem;color:var(--text-muted);margin-top:3px;'
                    + 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="' + detail + '">'
                    + detail + '</div>';
            }
            html += '</div>';

            // التاريخ والـ IP
            html += '<div style="text-align:left;flex-shrink:0">';
            html += '<div style="font-size:.72rem;font-weight:600;color:var(--text-secondary);font-family:monospace">' + timeStr + '</div>';
            html += '<div style="font-size:.68rem;color:var(--text-muted);margin-top:2px">' + dateStr + '</div>';
            html += '<div style="font-size:.68rem;color:var(--text-muted);font-family:monospace;margin-top:2px">' + (row.ip_address || '') + '</div>';
            html += '</div>';

            html += '</div>';
        });

        if (!rows.length) {
            html += '<div style="text-align:center;padding:2rem;color:var(--text-muted)">لا توجد سجلات</div>';
        }
        html += '</div>';

        DOM.modalBody.innerHTML = html;
    } catch (e) {
        DOM.modalBody.innerHTML = '<div style="padding:1rem;color:#ef4444">خطأ في الاتصال</div>';
    }
}

// ════════════════════════════════════════════════════════════
// أدوات مساعدة
// ════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════
// مخطط النشاط اليومي / الأسبوعي
// ════════════════════════════════════════════════════════════
async function secShowActivityChart() {
    DOM.modalTitle.textContent = 'مخطط النشاط — ساعات الذروة والأنماط';
    DOM.modalBody.innerHTML = '<div style="padding:2rem;text-align:center"><div class="spinner"></div></div>';
    openModal('large');

    var days = 30;

    async function loadChart(d) {
        days = d;
        DOM.modalBody.innerHTML = '<div style="padding:2rem;text-align:center"><div class="spinner"></div></div>';
        try {
            var res = await fetch(SEC_API + '?action=activity_chart&days=' + d);
            var data = await res.json();
            if (!data.success) { DOM.modalBody.innerHTML = '<p style="color:red;padding:1rem">خطأ في التحميل</p>'; return; }
            renderChart(data);
        } catch (e) {
            DOM.modalBody.innerHTML = '<p style="color:red;padding:1rem">خطأ في الاتصال</p>';
        }
    }

    function renderChart(data) {
        var byHour = data.by_hour || [];
        var byDay = data.by_day || [];
        var byType = data.by_type || [];
        var peakDay = data.peak_day || {};
        var peakHrs = data.peak_hours || [];

        // أعلى قيمة للتطبيع
        var maxHour = Math.max.apply(null, byHour.map(function (h) { return h.total || 0; })) || 1;
        var maxDay = Math.max.apply(null, byDay.map(function (d) { return d.total || 0; })) || 1;
        var maxType = byType.length ? (byType[0].cnt || 1) : 1;

        var html = '';

        // ── فلتر الفترة ─────────────────────────────────────
        html += '<div style="display:flex;gap:.5rem;margin-bottom:1.25rem;flex-wrap:wrap;align-items:center">';
        html += '<span style="font-size:.8rem;color:var(--text-muted)">الفترة:</span>';
        [7, 14, 30, 60, 90].forEach(function (d) {
            var active = d === days;
            html += '<button onclick="secReloadChart(' + d + ')" style="font-size:.78rem;padding:.3rem .85rem;border-radius:99px;cursor:pointer;border:0.5px solid var(--border-color);background:' + (active ? 'var(--primary,#3b82f6)' : 'var(--bg-surface)') + ';color:' + (active ? '#fff' : 'var(--text-primary)') + '">' + d + ' يوم</button>';
        });
        html += '</div>';

        // ── KPIs ────────────────────────────────────────────
        var totalEvents = byHour.reduce(function (s, h) { return s + (h.total || 0); }, 0);
        var totalFailures = byHour.reduce(function (s, h) { return s + (h.failures || 0); }, 0);
        var peakHourVal = peakHrs.length ? byHour[peakHrs[0]].total : 0;
        var peakHourLbl = peakHrs.length ? (peakHrs[0] + ':00') : '—';

        var kpis = [
            { label: 'إجمالي الأحداث', val: totalEvents.toLocaleString('ar'), color: '#3b82f6', icon: 'ti-chart-bar' },
            { label: 'ساعة الذروة', val: peakHourLbl + ' (' + peakHourVal + ')', color: '#f59e0b', icon: 'ti-clock' },
            { label: 'يوم الذروة', val: (peakDay.day || '—') + ' (' + (peakDay.total || 0) + ')', color: '#8b5cf6', icon: 'ti-calendar' },
            { label: 'محاولات فاشلة', val: totalFailures.toLocaleString('ar'), color: '#ef4444', icon: 'ti-shield-x' },
        ];
        html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:.6rem;margin-bottom:1.25rem">';
        kpis.forEach(function (k) {
            html += '<div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:10px;padding:.75rem 1rem;text-align:center">';
            html += '<i class="ti ' + k.icon + '" style="font-size:18px;color:' + k.color + ';margin-bottom:.3rem;display:block" aria-hidden="true"></i>';
            html += '<div style="font-size:.95rem;font-weight:700;color:' + k.color + '">' + k.val + '</div>';
            html += '<div style="font-size:.68rem;color:var(--text-muted);margin-top:2px">' + k.label + '</div>';
            html += '</div>';
        });
        html += '</div>';

        // ── مخطط الساعات ────────────────────────────────────
        html += '<div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:10px;padding:1rem;margin-bottom:.75rem">';
        html += '<div style="font-size:.78rem;font-weight:600;color:var(--text-primary);margin-bottom:.75rem">⏰ النشاط حسب ساعة اليوم</div>';
        html += '<div style="display:flex;align-items:flex-end;gap:3px;height:90px">';
        byHour.forEach(function (h, i) {
            var pct = maxHour > 0 ? Math.round((h.total / maxHour) * 100) : 0;
            var fpct = maxHour > 0 ? Math.round((h.failures / maxHour) * 100) : 0;
            var isPeak = peakHrs.indexOf(i) !== -1;
            var isOff = i < 6 || i >= 22;
            var barColor = isPeak ? '#f59e0b' : isOff ? '#ef444450' : '#3b82f6';
            var barH = Math.max(pct, 2);
            html += '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:1px" title="' + i + ':00 — ' + h.total + ' حدث">';
            html += '<div style="width:100%;background:' + barColor + ';height:' + barH + '%;border-radius:2px 2px 0 0;min-height:2px;transition:height .3s"></div>';
            if (h.failures > 0) {
                html += '<div style="width:100%;background:#ef4444;height:' + Math.max(fpct, 1) + '%;border-radius:0;max-height:8px"></div>';
            }
            html += '</div>';
        });
        html += '</div>';
        // محاور الساعات
        html += '<div style="display:flex;justify-content:space-between;margin-top:4px">';
        [0, 3, 6, 9, 12, 15, 18, 21].forEach(function (h) {
            html += '<span style="font-size:.65rem;color:var(--text-muted);font-family:monospace">' + h + ':00</span>';
        });
        html += '</div>';
        html += '<div style="display:flex;gap:1rem;margin-top:.5rem;font-size:.68rem;color:var(--text-muted)">';
        html += '<span><span style="display:inline-block;width:8px;height:8px;background:#3b82f6;border-radius:2px;margin-left:3px"></span>نشاط عادي</span>';
        html += '<span><span style="display:inline-block;width:8px;height:8px;background:#f59e0b;border-radius:2px;margin-left:3px"></span>ذروة</span>';
        html += '<span><span style="display:inline-block;width:8px;height:8px;background:#ef444450;border-radius:2px;margin-left:3px"></span>خارج الدوام</span>';
        html += '<span><span style="display:inline-block;width:8px;height:8px;background:#ef4444;border-radius:2px;margin-left:3px"></span>محاولات فاشلة</span>';
        html += '</div></div>';

        // ── مخطط أيام الأسبوع ────────────────────────────────
        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;margin-bottom:.75rem">';

        // أيام الأسبوع
        html += '<div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:10px;padding:1rem">';
        html += '<div style="font-size:.78rem;font-weight:600;color:var(--text-primary);margin-bottom:.75rem">📅 النشاط حسب اليوم</div>';
        html += '<div style="display:flex;flex-direction:column;gap:6px">';
        byDay.forEach(function (d) {
            var pct = maxDay > 0 ? Math.round((d.total / maxDay) * 100) : 0;
            var isWeekend = d.dow === 6 || d.dow === 7;
            var isPeakD = peakDay && peakDay.day === d.day;
            var barColor = isPeakD ? '#8b5cf6' : isWeekend ? '#ef444430' : '#3b82f6';
            html += '<div style="display:flex;align-items:center;gap:.5rem">';
            html += '<span style="font-size:.72rem;color:var(--text-secondary);min-width:50px;text-align:right">' + d.day + '</span>';
            html += '<div style="flex:1;background:var(--bg-surface);border-radius:99px;height:10px;overflow:hidden">';
            html += '<div style="background:' + barColor + ';height:100%;width:' + Math.max(pct, 1) + '%;border-radius:99px;transition:width .4s"></div>';
            html += '</div>';
            html += '<span style="font-size:.7rem;color:var(--text-muted);min-width:28px;text-align:left">' + d.total + '</span>';
            if (isWeekend) html += '<span style="font-size:.6rem;color:#ef4444">عطلة</span>';
            html += '</div>';
        });
        html += '</div></div>';

        // أنواع الأحداث
        html += '<div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:10px;padding:1rem">';
        html += '<div style="font-size:.78rem;font-weight:600;color:var(--text-primary);margin-bottom:.75rem">📋 أكثر الأحداث تكراراً</div>';
        html += '<div style="display:flex;flex-direction:column;gap:6px">';
        var typeLabels = {
            login: 'تسجيل دخول', logout: 'تسجيل خروج', login_failed: 'دخول فاشل',
            pr_create: 'إنشاء طلب', pr_approve: 'موافقة', pr_reject: 'رفض طلب',
            brute_force_blocked: 'حجب Brute Force', new_ip_login: 'IP جديد',
            login_off_hours: 'خارج الدوام', settings_change: 'تغيير إعداد',
            permissions_change: 'تغيير صلاحيات', employee_delete: 'حذف موظف',
        };
        var typeColors = {
            login: '#22c55e', logout: '#64748b', login_failed: '#ef4444',
            pr_approve: '#22c55e', pr_reject: '#ef4444', pr_create: '#3b82f6',
            brute_force_blocked: '#dc2626', new_ip_login: '#f59e0b',
            login_off_hours: '#f97316', settings_change: '#8b5cf6',
            permissions_change: '#6366f1', employee_delete: '#be123c',
        };
        byType.slice(0, 8).forEach(function (t) {
            var pct = maxType > 0 ? Math.round((t.cnt / maxType) * 100) : 0;
            var lbl = typeLabels[t.event_type] || t.event_type;
            var color = typeColors[t.event_type] || '#3b82f6';
            html += '<div style="display:flex;align-items:center;gap:.5rem">';
            html += '<span style="font-size:.7rem;color:var(--text-secondary);min-width:88px;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + lbl + '</span>';
            html += '<div style="flex:1;background:var(--bg-surface);border-radius:99px;height:10px;overflow:hidden">';
            html += '<div style="background:' + color + ';height:100%;width:' + Math.max(pct, 1) + '%;border-radius:99px;transition:width .4s"></div>';
            html += '</div>';
            html += '<span style="font-size:.7rem;color:var(--text-muted);min-width:28px;text-align:left">' + t.cnt + '</span>';
            html += '</div>';
        });
        html += '</div></div>';
        html += '</div>'; // grid

        // ── تحذيرات الأنماط غير الطبيعية ─────────────────────
        var alerts = [];
        if (totalFailures > totalEvents * 0.2) alerts.push('⚠️ نسبة المحاولات الفاشلة مرتفعة (' + Math.round(totalFailures / totalEvents * 100) + '%)');
        if (peakHrs.some(function (h) { return h < 6 || h >= 22; })) alerts.push('🌙 يوجد نشاط ملحوظ في ساعات غير اعتيادية');
        var weekendTotal = byDay.filter(function (d) { return d.dow === 6 || d.dow === 7; }).reduce(function (s, d) { return s + d.total; }, 0);
        if (weekendTotal > totalEvents * 0.15) alerts.push('📅 نشاط في العطل يتجاوز 15% من الإجمالي');

        if (alerts.length) {
            html += '<div style="background:#fef3c7;border:1px solid #f59e0b40;border-radius:10px;padding:.85rem 1rem;margin-bottom:.75rem">';
            html += '<div style="font-size:.78rem;font-weight:600;color:#92400e;margin-bottom:.35rem">🔍 أنماط تستدعي المراجعة</div>';
            alerts.forEach(function (a) {
                html += '<div style="font-size:.75rem;color:#78350f;margin-top:.25rem">' + a + '</div>';
            });
            html += '</div>';
        }

        DOM.modalBody.innerHTML = html;
    }

    // حفظ مرجع للـ reload
    window.secReloadChart = function (d) { loadChart(d); };

    await loadChart(days);
}


function secInitFilters() {
    ['sec-search', 'sec-type', 'sec-result'].forEach(id => {
        document.getElementById(id)?.addEventListener('keydown', e => {
            if (e.key === 'Enter') secLoadList(1);
        });
    });
}

function secResetFilters() {
    ['sec-search', 'sec-type', 'sec-result', 'sec-from', 'sec-to'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    secLoadList(1);
}

async function secExportCSV() {
    const params = new URLSearchParams({
        action: 'list', page: 1, per_page: 1000,
        search: document.getElementById('sec-search')?.value || '',
        event_type: document.getElementById('sec-type')?.value || '',
        result: document.getElementById('sec-result')?.value || '',
        date_from: document.getElementById('sec-from')?.value || '',
        date_to: document.getElementById('sec-to')?.value || '',
    });

    try {
        const res = await fetch(SEC_API + '?' + params);
        const data = await res.json();
        if (!data.success) return;

        const headers = ['التاريخ', 'الموظف', 'الرقم الوظيفي', 'الدور', 'الحدث', 'النتيجة', 'IP', 'التفاصيل'];
        const eventLabels = { login: 'تسجيل دخول', login_failed: 'دخول فاشل', logout: 'تسجيل خروج', brute_force_blocked: 'حجب Brute Force' };

        const csv = [
            '\uFEFF' + headers.join(','),
            ...data.data.map(r => [
                new Date(r.created_at).toLocaleString('ar-SA'),
                r.employee_name || '',
                r.employee_number || '',
                r.emp_role || '',
                eventLabels[r.event_type] || r.event_type,
                r.event_result,
                r.ip_address,
                (r.action_detail || '').replace(/,/g, '؛'),
            ].map(v => `"${v}"`).join(','))
        ].join('\n');

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'security_log_' + new Date().toISOString().split('T')[0] + '.csv';
        a.click();
        URL.revokeObjectURL(url);
    } catch (e) {
        showToast('خطأ في التصدير', 'error');
    }
}

// ════════════════════════════════════════════════════════════
// تسجيل أحداث الـ Frontend تلقائياً
// ════════════════════════════════════════════════════════════
function secLogPageView(tabName) {
    fetch(SEC_API + '?action=log_event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            event_type: 'page_view',
            detail: 'فتح تبويب: ' + tabName,
            extra: { tab: tabName }
        })
    }).catch(() => { });
}