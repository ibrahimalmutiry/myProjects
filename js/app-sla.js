/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║           app-sla.js — نظام SLA / OLA                       ║
 * ║  يتطلب: app-common.js                                        ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * يحتوي هذا الملف على:
 *  • تحميل إحصائيات SLA (loadSlaStats)
 *  • لوحة SLA الكاملة (loadSlaDashboard, renderSlaDashboardTable)
 *  • سجل الخروقات (loadSlaBreaches, renderSlaBreachLog)
 *  • نافذة تفاصيل SLA لمعاملة (openSlaDetailModal, renderSlaDetailModal)
 *    └── يعرض: وقت الانتظار، وقت OLA، وقت ما بعد التصعيد لكل مرحلة
 *  • تشغيل فحص يدوي (runSlaCheck)
 *  • حل الخروقات (resolveBreach)
 *  • إعدادات SLA/OLA (openSlaSettingsModal, renderSlaSettingsForm, saveSlaSettings)
 *
 * ملاحظات المنطق:
 *  - OLA يُحسب من received_at (الاستلام الفعلي) وليس started_at
 *  - OLA يتوقف عند escalated_at إن وُجد
 *  - waiting_min = الوقت بين وصول المعاملة والاستلام الفعلي (لا يُحسب ضمن OLA)
 *  - post_escalation_min = الوقت من التصعيد حتى الإكمال
 */

// ═══════════════════════════════════════════════════════════
//  SLA / OLA — النسخة المحدثة
// ═══════════════════════════════════════════════════════════

/**
 * تحميل إحصائيات SLA السريعة
 * تعرض: عدد المعاملات ضمن المدة / تحذير / خرق
 */
async function loadSlaStats() {
    try {
        const res = await fetch('api/?action=sla_stats');
        const data = await res.json();
        if (!data.success) return;

        const s = data.data;
        const el = id => document.getElementById(id);

        if (el('slaBreachCount')) el('slaBreachCount').textContent = s.open_breaches;
        if (el('slaWarnCount')) el('slaWarnCount').textContent = s.open_warnings;
        if (el('slaBreachToday')) el('slaBreachToday').textContent = s.breaches_today;

        // شارة التبويب
        const badge = document.getElementById('slaBadge');
        if (badge) {
            const total = s.open_breaches;
            badge.textContent = total;
            badge.style.display = total > 0 ? '' : 'none';
        }
    } catch (e) { console.error('loadSlaStats', e); }
}

// ─── لوحة SLA — جدول المعاملات ──────────────────────────────
async function loadSlaDashboard() {
    const container = document.getElementById('slaDashboardTable');
    if (!container) return;
    container.innerHTML = '<div class="loading-placeholder">جارٍ التحميل...</div>';

    const filter = document.getElementById('slaStatusFilter')?.value || '';
    try {
        const res = await fetch(`api/?action=sla_dashboard&sla_status=${encodeURIComponent(filter)}`);
        const data = await res.json();
        if (!data.success || !data.data.length) {
            container.innerHTML = '<div class="empty-state-sm">لا توجد معاملات</div>';
            return;
        }
        container.innerHTML = renderSlaDashboardTable(data.data);
    } catch (e) {
        container.innerHTML = '<div class="empty-state-sm" style="color:var(--accent-red)">خطأ في التحميل</div>';
    }
}

function renderSlaDashboardTable(rows) {
    const statusBadge = s => {
        const map = {
            breached: ['🔴', 'خرق', 'var(--accent-red)'],
            warning: ['🟡', 'تحذير', 'var(--accent-orange)'],
            ok: ['🟢', 'ضمن المدة', 'var(--accent-green)'],
        };
        const [icon, label, color] = map[s] || ['⚪', s, 'var(--text-muted)'];
        return `<span style="color:${color};font-weight:600">${icon} ${label}</span>`;
    };

    const bar = (pct, status) => {
        const color = status === 'breached' ? 'var(--accent-red)'
            : status === 'warning' ? 'var(--accent-orange)'
                : 'var(--accent-green)';
        const w = Math.min(pct, 100);
        return `<div style="background:var(--bg-surface);border-radius:4px;height:8px;width:100%;min-width:80px;overflow:hidden">
            <div style="background:${color};height:100%;width:${w}%;transition:width .3s"></div>
        </div>
        <div style="font-size:.75rem;color:var(--text-muted);margin-top:2px">${pct}%</div>`;
    };

    const stagesHtml = row => row.stages.map(st => {
        const statusIcon = st.status === 'breached' ? '🔴'
            : st.status === 'warning' ? '🟡'
                : st.status === 'done' ? '✅'
                    : st.status === 'active' ? '🔵'
                        : '⚪';
        const hrs = st.elapsed_min > 0 ? `${(st.elapsed_min / 60).toFixed(1)}س` : '—';
        return `<div style="display:inline-flex;align-items:center;gap:4px;background:var(--bg-surface);
                    border-radius:6px;padding:2px 8px;font-size:.78rem;margin:2px" title="${st.label}: ${hrs} / ${st.allowed_hrs}س">
            ${statusIcon} ${st.label}: ${hrs}
        </div>`;
    }).join('');

    return `<div class="table-wrapper">
    <table class="deposits-table">
        <thead>
            <tr>
                <th>رقم المعاملة</th>
                <th>النوع</th>
                <th>SLA الكلي</th>
                <th>التقدم</th>
                <th>المراحل</th>
                <th>إجراء</th>
            </tr>
        </thead>
        <tbody>
            ${rows.map(r => `
            <tr class="${r.sla_status === 'breached' ? 'row-breach' : r.sla_status === 'warning' ? 'row-warn' : ''}">
                <td class="dep-number">${r.transaction_number}</td>
                <td style="color:var(--text-muted);font-size:.85rem">${r.type_name || '—'}</td>
                <td>${statusBadge(r.sla_status)}</td>
                <td style="min-width:100px">${bar(r.sla_pct, r.sla_status)}</td>
                <td style="max-width:320px">${stagesHtml(r)}</td>
                <td>
                    <button class="btn-icon-sm" onclick="openSlaDetailModal(${r.id})" title="تفاصيل SLA">🔍</button>
                </td>
            </tr>`).join('')}
        </tbody>
    </table></div>`;
}

// ─── سجل الخروقات ────────────────────────────────────────────
async function loadSlaBreaches() {
    const container = document.getElementById('slaBreachLog');
    if (!container) return;
    container.innerHTML = '<div class="loading-placeholder">جارٍ التحميل...</div>';

    const type = document.getElementById('slaBreachTypeFilter')?.value || '';
    const resolved = document.getElementById('slaResolvedFilter')?.value || '';

    try {
        const res = await fetch(`api/?action=sla_breaches&type=${encodeURIComponent(type)}&resolved=${encodeURIComponent(resolved)}&limit=50`);
        const data = await res.json();
        if (!data.success || !data.data.length) {
            container.innerHTML = '<div class="empty-state-sm">لا توجد خروقات</div>';
            return;
        }
        container.innerHTML = renderSlaBreachLog(data.data);
    } catch (e) {
        container.innerHTML = '<div class="empty-state-sm" style="color:var(--accent-red)">خطأ في التحميل</div>';
    }
}

function renderSlaBreachLog(rows) {
    const typeStyle = t => {
        if (t === 'ola_breach' || t === 'sla_breach')
            return 'color:var(--accent-red);font-weight:700';
        return 'color:var(--accent-orange);font-weight:600';
    };

    return `<div class="table-wrapper">
    <table class="deposits-table">
        <thead>
            <tr>
                <th>المعاملة</th>
                <th>نوع الخرق</th>
                <th>المرحلة</th>
                <th>الموظف</th>
                <th>الوقت المنقضي</th>
                <th>الوقت المسموح</th>
                <th>التجاوز</th>
                <th>مُصعَّد إلى</th>
                <th>الحالة</th>
                <th></th>
            </tr>
        </thead>
        <tbody>
            ${rows.map(r => {
        const elapsed = r.elapsed_minutes >= 60
            ? `${(r.elapsed_minutes / 60).toFixed(1)} س`
            : `${r.elapsed_minutes} د`;
        const allowed = r.allowed_minutes >= 60
            ? `${(r.allowed_minutes / 60).toFixed(1)} س`
            : `${r.allowed_minutes} د`;
        const pctColor = r.breach_pct >= 150 ? 'var(--accent-red)'
            : r.breach_pct >= 100 ? 'var(--accent-orange)'
                : 'var(--text-muted)';
        const isResolved = !!r.resolved_at;
        return `
                <tr style="${isResolved ? 'opacity:.6' : ''}">
                    <td class="dep-number">${r.transaction_number || '—'}</td>
                    <td style="${typeStyle(r.breach_type)}">${SLA_TYPE_LABELS[r.breach_type] || r.breach_type}</td>
                    <td>${SLA_STAGE_LABELS[r.stage] || r.stage}</td>
                    <td>${r.employee_name || '—'}</td>
                    <td style="font-weight:600">${elapsed}</td>
                    <td style="color:var(--text-muted)">${allowed}</td>
                    <td style="color:${pctColor};font-weight:700">${r.breach_pct}%</td>
                    <td style="color:var(--accent-blue)">${r.escalated_to_name || '—'}</td>
                    <td>${isResolved
                ? `<span style="color:var(--accent-green)">✅ محلول</span>`
                : `<span style="color:var(--accent-red)">🔴 مفتوح</span>`}
                    </td>
                    <td>
                        ${!isResolved
                ? `<button class="btn-icon-sm btn-success" onclick="resolveBreach(${r.id})" title="تعليم كمحلول">✓</button>`
                : ''}
                    </td>
                </tr>`;
    }).join('')}
        </tbody>
    </table></div>`;
}


// ─── تفاصيل SLA لمعاملة ──────────────────────────────────────
async function openSlaDetailModal(txId) {
    DOM.modalTitle.textContent = 'تفاصيل SLA / OLA';
    DOM.modalBody.innerHTML = '<div class="loading-placeholder" style="padding:2rem;text-align:center">جارٍ التحميل...</div>';
    openModal();
    try {
        const res = await fetch(`api/?action=sla_transaction&id=${txId}`);
        const data = await res.json();
        if (!data.success || !data.data) {
            DOM.modalBody.innerHTML = '<div class="empty-state-sm">لا توجد بيانات SLA لهذه المعاملة</div>';
            return;
        }
        DOM.modalBody.innerHTML = renderSlaDetailModal(data.data);
    } catch (e) {
        DOM.modalBody.innerHTML = '<div style="color:var(--accent-red);padding:1rem">خطأ في التحميل</div>';
    }
}

// ─── تصعيد يدوي لمرحلة (global — تُستدعى من HTML) ─────────────
async function escalateStage(txId, stage, stageLabel, btn) {
    btn.disabled = true;
    btn.textContent = '⏳ جارٍ...';
    btn.style.opacity = '0.6';
    try {
        const res = await fetch('api/?action=sla_manual_escalate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transaction_id: txId, stage })
        });
        const data = await res.json();
        if (data.success) {
            btn.style.display = 'none';
            const wrap = btn.closest('.sla-breach-actions') || btn.parentElement;
            const ok = document.createElement('div');
            ok.className = 'sla-escalated-ok';
            ok.textContent = '✅ تم التصعيد للمشرف';
            wrap.replaceWith(ok);
            showToast(`✅ تم تصعيد "${stageLabel}" للمشرف`, 'success');
        } else {
            btn.disabled = false;
            btn.textContent = '🔔 تصعيد للمشرف';
            btn.style.opacity = '1';
            if (data.error === 'تم التصعيد مسبقاً') {
                btn.textContent = '✅ مُصعَّد';
                btn.style.background = 'var(--accent-green)';
                btn.disabled = true;
            } else {
                showToast('خطأ: ' + (data.error || 'فشل التصعيد'), 'error');
            }
        }
    } catch (e) {
        btn.disabled = false;
        btn.textContent = '🔔 تصعيد للمشرف';
        btn.style.opacity = '1';
        showToast('خطأ في الاتصال', 'error');
    }
}

// ─── عرض تفاصيل SLA / OLA ────────────────────────────────────
function renderSlaDetailModal(d) {
    const SC = { ok: 'var(--accent-green)', warning: 'var(--accent-orange)', breached: 'var(--accent-red)' };
    const SL = { ok: '✅ ضمن المدة', warning: '⚠️ تحذير', breached: '🔴 خرق' };
    const slaColor = SC[d.sla_status] || 'var(--text-muted)';
    const slaBarW = Math.min(d.sla_pct, 100);

    const fmtMin = m => {
        if (!m && m !== 0) return '—';
        if (m === 0) return 'أقل من دقيقة';
        if (m < 60) return m + ' د';
        const dy = Math.floor(m / 1440), hr = Math.floor((m % 1440) / 60), mn = m % 60;
        if (dy > 0) return dy + ' يوم' + (hr > 0 ? ' و' + hr + 'س' : '');
        return hr + 'س' + (mn > 0 ? ' و' + mn + 'د' : '');
    };

    // ── خط التقدم الكلي ───────────────────────────────────────
    const totalHtml = `
    <div class="sla-total-bar">
        <div class="sla-total-header">
            <span class="sla-total-label">⏱ SLA الكلي</span>
            <span class="sla-total-status" style="color:${slaColor}">${SL[d.sla_status] || d.sla_status}</span>
        </div>
        <div class="sla-progress-track">
            <div class="sla-progress-fill" style="width:${slaBarW}%;background:${slaColor}"></div>
        </div>
        <div class="sla-progress-labels">
            <span style="color:${slaColor};font-weight:700">${fmtMin(d.total_elapsed)} (${d.sla_pct}%)</span>
            <span style="color:var(--text-muted)">من ${fmtMin(d.sla_total_min)} مسموح</span>
        </div>
    </div>`;

    // ── مراحل OLA كـ timeline ─────────────────────────────────
    const stagesHtml = (d.stages || []).map((st, idx) => {
        const isLast = idx === (d.stages.length - 1);

        // معلّق
        if (st.status === 'paused' || st.ola_paused) {
            return `
            <div class="sla-stage-item sla-stage-paused">
                <div class="sla-stage-dot-col">
                    <div class="sla-stage-dot" style="background:var(--accent-amber);border-color:var(--accent-amber)">⏸</div>
                    ${!isLast ? '<div class="sla-stage-line sla-stage-line-muted"></div>' : ''}
                </div>
                <div class="sla-stage-body">
                    <div class="sla-stage-title">
                        <span>${st.label}</span>
                        <span class="sla-badge" style="background:rgba(234,179,8,.15);color:#b45309">OLA معلّق</span>
                    </div>
                    <div class="sla-stage-note">بانتظار عودة أمر الشراء — لا يُحتسب في OLA</div>
                </div>
            </div>`;
        }

        const pct = Math.min(st.pct, 150);
        const barW = Math.min(st.pct, 100);
        const isDone = st.status === 'done' || st.status === 'breached_done';
        const color = st.status === 'breached' ? 'var(--accent-red)'
            : st.status === 'warning' ? 'var(--accent-orange)'
                : isDone ? 'var(--accent-green)'
                    : st.status === 'active' ? 'var(--accent-blue)'
                        : st.status === 'escalated' ? 'var(--accent-red)'
                            : 'var(--border-color)';

        const dotIcon = isDone ? '✓'
            : st.status === 'escalated' ? '🔔'
                : st.status === 'breached' ? '✗'
                    : st.status === 'warning' ? '!'
                        : st.status === 'active' ? '●'
                            : st.status === 'waiting' ? '○'
                                : '○';

        const statusBadge = isDone ? `<span class="sla-badge sla-badge-done">✓ مكتملة</span>`
            : st.status === 'escalated' ? `<span class="sla-badge sla-badge-esc">🔔 مُصعَّدة</span>`
                : st.status === 'breached' ? `<span class="sla-badge sla-badge-breach">🔴 خرق OLA</span>`
                    : st.status === 'warning' ? `<span class="sla-badge sla-badge-warn">⚠️ تحذير</span>`
                        : st.status === 'active' ? `<span class="sla-badge sla-badge-active">🔵 جارية</span>`
                            : st.status === 'waiting' ? `<span class="sla-badge" style="color:var(--text-muted)">⏳ انتظار</span>`
                                : `<span class="sla-badge" style="color:var(--text-muted)">لم تبدأ</span>`;

        // صفوف الأوقات
        let timeCells = '';
        if (st.waiting_min > 0) {
            timeCells += `<div class="sla-time-cell"><div class="sla-time-label">⏳ انتظار قبل الاستلام</div><div class="sla-time-val" style="color:var(--text-muted)">${fmtMin(st.waiting_min)}</div></div>`;
        }
        if (st.elapsed_min > 0 || st.status === 'active') {
            timeCells += `<div class="sla-time-cell"><div class="sla-time-label">⚙️ وقت المعالجة OLA</div><div class="sla-time-val" style="color:${color}">${fmtMin(st.elapsed_min)}</div></div>`;
        }
        if (st.post_escalation_min != null && st.post_escalation_min > 0) {
            timeCells += `<div class="sla-time-cell"><div class="sla-time-label">🔔 بعد التصعيد</div><div class="sla-time-val" style="color:var(--accent-orange)">${fmtMin(st.post_escalation_min)}</div></div>`;
        }

        // شريط التقدم — فقط للمراحل ذات بيانات
        const showBar = st.status !== 'pending' && st.status !== 'waiting' && st.elapsed_min >= 0 && st.pct > 0;
        const barHtml = showBar ? `
            <div class="sla-mini-bar">
                <div class="sla-mini-fill" style="width:${barW}%;background:${color}"></div>
                ${pct > 100 ? `<div class="sla-mini-overflow" style="width:${Math.min(pct - 100, 50)}%"></div>` : ''}
            </div>
            <div class="sla-bar-labels">
                <span style="color:${color};font-weight:600">${pct}%</span>
                <span style="color:var(--text-muted)">من ${st.allowed_hrs}س مسموح</span>
            </div>` : '';

        // زر التصعيد
        const escBtn = (st.status === 'breached' && !st.is_escalated)
            ? `<div class="sla-breach-actions">
                <button class="sla-esc-btn" id="esc-btn-${st.stage}"
                    onclick="escalateStage(${d.transaction_id},'${st.stage}','${st.label}',this)">
                    🔔 تصعيد للمشرف
                </button>
               </div>`
            : st.is_escalated
                ? `<div class="sla-escalated-ok">✅ تم التصعيد للمشرف</div>`
                : '';

        return `
        <div class="sla-stage-item ${isDone ? 'sla-stage-done' : ''} ${st.status === 'active' ? 'sla-stage-active' : ''}">
            <div class="sla-stage-dot-col">
                <div class="sla-stage-dot" style="background:${color};border-color:${color};color:${isDone || st.status === 'active' ? '#fff' : '#fff'}">${dotIcon}</div>
                ${!isLast ? `<div class="sla-stage-line" style="background:${isDone ? color : 'var(--border-color)'}"></div>` : ''}
            </div>
            <div class="sla-stage-body">
                <div class="sla-stage-title">
                    <span style="font-weight:700;color:var(--text-primary)">${st.label}</span>
                    <div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap">
                        ${st.employee !== '—' ? `<span class="sla-employee-tag">👤 ${st.employee}</span>` : ''}
                        ${statusBadge}
                    </div>
                </div>
                ${timeCells ? `<div class="sla-time-grid">${timeCells}</div>` : ''}
                ${barHtml}
                ${escBtn}
            </div>
        </div>`;
    }).join('');

    const elapsed = fmtMin(d.total_elapsed);
    const allowed = fmtMin(d.sla_total_min);

    return `
    <div class="sla-detail-wrap">
        ${totalHtml}
        <div class="sla-stages-title">📊 تفاصيل OLA لكل مرحلة</div>
        <div class="sla-stages-timeline">
            ${stagesHtml}
        </div>
        <div style="margin-top:1rem;display:flex;justify-content:flex-end">
            <button class="btn btn-secondary" onclick="closeModal()">إغلاق</button>
        </div>
    </div>`;
}

// ─── تشغيل فحص يدوي ──────────────────────────────────────────
async function runSlaCheck() {
    showToast('جارٍ فحص المعاملات...', 'info');
    try {
        const res = await fetch('api/?action=sla_run_check');
        const data = await res.json();
        if (data.success) {
            showToast(`تم فحص ${data.data.checked} معاملة — ${data.data.new_breaches} خرق جديد`, 'success');
            loadSlaStats(); loadSlaDashboard(); loadSlaBreaches();
        }
    } catch (e) { showToast('خطأ في الفحص', 'error'); }
}

// ─── حل خرق ──────────────────────────────────────────────────
async function resolveBreach(id) {
    if (!confirm('تعليم هذا الخرق كمحلول؟')) return;
    try {
        const res = await fetch('api/?action=sla_resolve_breach', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        const data = await res.json();
        if (data.success) { showToast('تم تعليم الخرق كمحلول ✓', 'success'); loadSlaBreaches(); }
        else showToast('فشل تحديث الخرق', 'error');
    } catch (e) { showToast('خطأ في الاتصال', 'error'); }
}

// ─── إعدادات SLA/OLA ─────────────────────────────────────────
async function openSlaSettingsModal() {
    DOM.modalTitle.textContent = '⚙️ إعدادات SLA / OLA';
    DOM.modalBody.innerHTML = '<div class="loading-placeholder" style="padding:2rem;text-align:center">جارٍ التحميل...</div>';
    openModal();
    try {
        const res = await fetch('api/?action=sla_policies');
        const data = await res.json();
        if (!data.success || !data.data.length) {
            DOM.modalBody.innerHTML = '<div class="empty-state-sm">لا توجد سياسات SLA. يرجى إضافة سياسة أولاً.</div>';
            return;
        }
        DOM.modalBody.innerHTML = renderSlaSettingsForm(data.data[0]);
    } catch (e) {
        DOM.modalBody.innerHTML = '<div style="color:var(--accent-red);padding:1rem">خطأ في تحميل الإعدادات</div>';
    }
}

function renderSlaSettingsForm(policy) {
    const stageOrder = ['receiving', 'budget', 'dispatch', 'payment', 'invoice'];
    const stageLabels = { receiving: 'الاستلام', budget: 'الموازنة', dispatch: 'التوجيه', payment: 'الدفع', invoice: 'الفوترة' };
    const olaByStage = {};
    (policy.ola_rules || []).forEach(r => olaByStage[r.stage] = r);

    const olaRows = stageOrder.map(stage => {
        const r = olaByStage[stage] || {};
        return `
        <tr>
            <td style="font-weight:600">${stageLabels[stage]}</td>
            <td>
                <input type="number" step="0.5" min="0.5" class="form-input ola-hours"
                    data-stage="${stage}" value="${r.allowed_hours || 4}" style="width:80px">
                <span style="font-size:.82rem;color:var(--text-muted)"> ساعة</span>
            </td>
            <td>
                <input type="number" min="10" max="90" class="form-input ola-warn"
                    data-stage="${stage}" value="${r.warn_at_pct || 50}" style="width:65px">
                <span style="font-size:.82rem;color:var(--text-muted)"> %</span>
            </td>
            <td>
                <input type="number" min="50" max="200" class="form-input ola-esc"
                    data-stage="${stage}" value="${r.escalate_pct || 100}" style="width:65px">
                <span style="font-size:.82rem;color:var(--text-muted)"> %</span>
            </td>
        </tr>`;
    }).join('');

    return `
    <div style="margin-bottom:1.25rem">
        <div style="background:rgba(59,130,246,.08);border-radius:10px;padding:.85rem 1rem;font-size:.87rem;color:var(--text-muted);margin-bottom:1rem">
            <strong>SLA:</strong> الوقت الكلي لإنجاز المعاملة من البداية للنهاية.<br>
            <strong>OLA:</strong> الوقت المسموح لكل موظف في مرحلته.
        </div>
        <div class="modal-form-grid">
            <div class="form-group">
                <label class="form-label">⏱ SLA الكلي (ساعة)</label>
                <input type="number" id="slaTotalHours" class="form-input" step="1" min="1"
                    value="${policy.total_hours}" placeholder="24">
            </div>
            <div class="form-group">
                <label class="form-label">⚠️ تحذير SLA عند (%)</label>
                <input type="number" id="slaWarnPct" class="form-input" min="50" max="95"
                    value="${policy.warning_pct}" placeholder="80">
            </div>
        </div>
    </div>
    <div style="font-weight:700;margin-bottom:.75rem">📊 أوقات OLA لكل مرحلة</div>
    <table class="deposits-table" style="margin-bottom:1.25rem">
        <thead><tr><th>المرحلة</th><th>الوقت</th><th>تحذير %</th><th>تصعيد %</th></tr></thead>
        <tbody>${olaRows}</tbody>
    </table>
    <div style="display:flex;gap:.75rem;justify-content:flex-end">
        <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
        <button class="btn btn-primary" onclick="saveSlaSettings(${policy.id})">💾 حفظ الإعدادات</button>
    </div>`;
}

async function saveSlaSettings(policyId) {
    const totalHours = parseFloat(document.getElementById('slaTotalHours')?.value || 24);
    const warnPct = parseInt(document.getElementById('slaWarnPct')?.value || 80);

    const slaRes = await fetch('api/?action=sla_save_policy', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: policyId, total_hours: totalHours, warning_pct: warnPct, name: 'السياسة الافتراضية' })
    });
    const slaData = await slaRes.json();
    if (!slaData.success) return showToast('خطأ في حفظ SLA', 'error');

    const stageLabels = { receiving: 'الاستلام', budget: 'الموازنة', dispatch: 'التوجيه', payment: 'الدفع', invoice: 'الفوترة' };
    const olaHours = document.querySelectorAll('.ola-hours');
    let ok = 0;
    for (const inp of olaHours) {
        const stage = inp.dataset.stage;
        const hours = parseFloat(inp.value);
        const warn = parseInt(document.querySelector(`.ola-warn[data-stage="${stage}"]`)?.value || 50);
        const esc = parseInt(document.querySelector(`.ola-esc[data-stage="${stage}"]`)?.value || 100);
        const r = await fetch('api/?action=sla_save_ola_rule', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sla_policy_id: policyId, stage, stage_label: stageLabels[stage] || stage, allowed_hours: hours, warn_at_pct: warn, escalate_pct: esc })
        });
        const rd = await r.json();
        if (rd.success) ok++;
    }
    showToast(`تم الحفظ — SLA + ${ok} قاعدة OLA ✓`, 'success');
    closeModal();
    loadSlaStats();
}

// ─── صفحة SLA/OLA المستقلة ───────────────────────────────────
async function loadSlaPage() {
    showLoading();
    DOM.mainContent.innerHTML = `
    <div class="performance-page">
        <div class="perf-header">
            <div class="perf-header-content">
                <div class="perf-title">
                    <div class="perf-icon" style="background:linear-gradient(135deg,#ef4444,#f97316)">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                        </svg>
                    </div>
                    <div>
                        <h1>نظام SLA / OLA</h1>
                        <p>متابعة مستويات الخدمة والاتفاقيات التشغيلية</p>
                    </div>
                </div>
                <div class="perf-header-stats">
                    <div class="header-stat">
                        <span class="stat-number" id="slaBreachCount" style="color:var(--accent-red)">—</span>
                        <span class="stat-label">خروقات مفتوحة</span>
                    </div>
                    <div class="header-stat">
                        <span class="stat-number" id="slaWarnCount" style="color:var(--accent-orange)">—</span>
                        <span class="stat-label">تحذيرات نشطة</span>
                    </div>
                    <div class="header-stat">
                        <span class="stat-number" id="slaBreachToday" style="color:var(--accent-blue)">—</span>
                        <span class="stat-label">خروقات اليوم</span>
                    </div>
                </div>
            </div>
        </div>

        <div style="display:flex;gap:.75rem;margin-bottom:1.25rem;flex-wrap:wrap;align-items:center">
            <button class="btn btn-primary"   onclick="runSlaCheck()">🔄 فحص SLA الآن</button>
            <button class="btn btn-secondary" onclick="openSlaSettingsModal()">⚙️ إعدادات SLA/OLA</button>
            <button class="btn btn-secondary" onclick="openNotifSettingsModal()">📧 إعدادات الإشعارات</button>
        </div>

        <div class="perf-tabs">
            <button class="perf-tab active" onclick="switchSlaPageTab('dashboard',this)">📋 حالة المعاملات</button>
            <button class="perf-tab"        onclick="switchSlaPageTab('breaches',this)">⚠️ سجل الخروقات</button>
            <button class="perf-tab"        onclick="switchSlaPageTab('escalations',this)">📧 التصعيدات البريدية</button>
        </div>

        <div class="perf-filters" style="margin-top:.75rem">
            <div class="filter-group" id="slaDashFilterGroup">
                <label>النطاق</label>
                <select id="slaScopeFilter" onchange="loadSlaDashboard()">
                    <option value="all">الكل</option>
                    <option value="transaction">معاملات</option>
                    <option value="correspondence">مراسلات</option>
                </select>
            </div>
            <div class="filter-group" id="slaStatusFilterGroup">
                <label>حالة SLA</label>
                <select id="slaStatusFilter" onchange="loadSlaDashboard()">
                    <option value="">الكل</option>
                    <option value="breached">خرق ✗</option>
                    <option value="warning">تحذير ⚠</option>
                    <option value="ok">ضمن المدة ✓</option>
                </select>
            </div>
            <div class="filter-group" id="slaBreachTypeFilterGroup">
                <label>نوع الخرق</label>
                <select id="slaBreachTypeFilter" onchange="loadSlaBreaches()">
                    <option value="">الكل</option>
                    <option value="ola_breach">خرق OLA</option>
                    <option value="sla_breach">خرق SLA</option>
                    <option value="ola_warning">تحذير OLA</option>
                    <option value="sla_warning">تحذير SLA</option>
                </select>
            </div>
            <div class="filter-group" id="slaResolvedFilterGroup">
                <label>الحالة</label>
                <select id="slaResolvedFilter" onchange="loadSlaBreaches()">
                    <option value="">الكل</option>
                    <option value="no">غير محلول</option>
                    <option value="yes">محلول</option>
                </select>
            </div>
        </div>

        <div id="slaPageTabDashboard" class="perf-tab-content active" style="display:block">
            <div class="perf-section">
                <div class="section-header"><h3>📋 حالة SLA للمعاملات النشطة</h3></div>
                <div id="slaDashboardTable" class="perf-table-container"><div class="loading-placeholder">جارٍ التحميل...</div></div>
            </div>
        </div>
        <div id="slaPageTabBreaches" class="perf-tab-content" style="display:none">
            <div class="perf-section">
                <div class="section-header"><h3>⚠️ سجل الخروقات والتصعيد</h3></div>
                <div id="slaBreachLog" class="perf-table-container"><div class="loading-placeholder">جارٍ التحميل...</div></div>
            </div>
        </div>
        <div id="slaPageTabEscalations" class="perf-tab-content" style="display:none">
            <div class="perf-section">
                <div class="section-header">
                    <h3>📧 التصعيدات المُرسلة عبر البريد</h3>
                    <button class="btn btn-sm btn-primary" onclick="loadSlaEmailEscalations()">🔄 تحديث</button>
                </div>
                <div class="perf-filters" style="margin-bottom:1rem">
                    <div class="filter-group">
                        <label>نوع التصعيد</label>
                        <select id="escalationTypeFilter" onchange="loadSlaEmailEscalations()">
                            <option value="">الكل</option>
                            <option value="ola_breach">خرق OLA</option>
                            <option value="sla_breach">خرق SLA</option>
                            <option value="ola_warning">تحذير OLA</option>
                            <option value="sla_warning">تحذير SLA</option>
                        </select>
                    </div>
                    <div class="filter-group">
                        <label>من تاريخ</label>
                        <input type="date" id="escalationDateFrom" onchange="loadSlaEmailEscalations()">
                    </div>
                    <div class="filter-group">
                        <label>إلى تاريخ</label>
                        <input type="date" id="escalationDateTo" onchange="loadSlaEmailEscalations()">
                    </div>
                </div>
                <div id="slaEmailEscalationsTable" class="perf-table-container"><div class="loading-placeholder">جارٍ التحميل...</div></div>
            </div>
        </div>
    </div>`;

    loadSlaStats(); loadSlaDashboard(); loadSlaBreaches(); loadSlaEmailEscalations();
}

function switchSlaPageTab(tab, btn) {
    document.querySelectorAll('#slaPageTabDashboard,#slaPageTabBreaches,#slaPageTabEscalations')
        .forEach(el => el.style.display = 'none');
    document.querySelectorAll('.perf-tabs .perf-tab').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    const el = document.getElementById('slaPageTab' + tab.charAt(0).toUpperCase() + tab.slice(1));
    if (el) el.style.display = 'block';
    if (tab === 'escalations') loadSlaEmailEscalations();
    else if (tab === 'breaches') loadSlaBreaches();
    else if (tab === 'dashboard') loadSlaDashboard();
}

async function loadSlaEmailEscalations() {
    const container = document.getElementById('slaEmailEscalationsTable');
    if (!container) return;
    container.innerHTML = '<div class="loading-placeholder">جارٍ التحميل...</div>';

    const type = document.getElementById('escalationTypeFilter')?.value || '';
    const dateFrom = document.getElementById('escalationDateFrom')?.value || '';
    const dateTo = document.getElementById('escalationDateTo')?.value || '';
    try {
        let url = `api/?action=sla_email_escalations&limit=100`;
        if (type) url += `&type=${encodeURIComponent(type)}`;
        if (dateFrom) url += `&date_from=${encodeURIComponent(dateFrom)}`;
        if (dateTo) url += `&date_to=${encodeURIComponent(dateTo)}`;
        const res = await fetch(url);
        const data = await res.json();
        if (!data.success || !data.data?.length) {
            container.innerHTML = `<div class="empty-state-sm" style="text-align:center;padding:3rem;color:var(--text-muted)">
                <div style="font-size:3rem;margin-bottom:1rem">📭</div>
                <h4>لا توجد تصعيدات بريدية</h4>
            </div>`;
            return;
        }
        container.innerHTML = renderSlaEmailEscalationsTable(data.data);
    } catch (e) {
        container.innerHTML = `<div class="empty-state-sm" style="text-align:center;padding:3rem;color:var(--text-muted)">
            <div style="font-size:3rem">📧</div>
            <h4>سجل التصعيدات البريدية</h4>
            <p style="color:var(--accent-orange);font-size:.8rem;margin-top:.5rem">⚠ تأكد من endpoint: sla_email_escalations في API</p>
        </div>`;
    }
}

function renderSlaEmailEscalationsTable(rows) {
    const typeLabels = {
        'ola_breach': ['🔴', 'خرق OLA'], 'sla_breach': ['🔴', 'خرق SLA'],
        'ola_warning': ['🟡', 'تحذير OLA'], 'sla_warning': ['🟡', 'تحذير SLA'],
    };
    const statusIcon = s => s ? '<span style="color:var(--accent-green)">✅ مُرسل</span>'
        : '<span style="color:var(--accent-red)">❌ فشل</span>';
    return `<div class="table-wrapper"><table class="deposits-table">
        <thead><tr><th>#</th><th>المعاملة</th><th>نوع التصعيد</th><th>المرحلة</th>
            <th>المُرسَل إليه</th><th>الموضوع</th><th>وقت الإرسال</th><th>الحالة</th></tr></thead>
        <tbody>${rows.map((r, i) => {
        const [icon, label] = typeLabels[r.escalation_type] || ['⚪', r.escalation_type || '—'];
        const sentTime = r.sent_at ? new Date(r.sent_at).toLocaleString('ar-SA') : '—';
        return `<tr>
                <td style="color:var(--text-muted);font-size:.82rem">${i + 1}</td>
                <td class="dep-number">${r.transaction_number || '—'}</td>
                <td><span style="font-weight:700">${icon} ${label}</span></td>
                <td>${r.stage_label || r.stage || '—'}</td>
                <td style="font-size:.85rem">${r.recipient_email || r.recipient_name || '—'}</td>
                <td style="font-size:.82rem;color:var(--text-muted);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
                    title="${r.email_subject || ''}">${r.email_subject || '—'}</td>
                <td style="font-size:.82rem;color:var(--text-muted)">${sentTime}</td>
                <td>${statusIcon(r.sent_successfully !== false && r.sent_successfully !== 0)}</td>
            </tr>`;
    }).join('')}</tbody>
    </table></div>`;
}

// ─── CSS مضمّن ────────────────────────────────────────────────
(function injectSlaStyles() {
    if (document.getElementById('sla-styles')) return;
    const s = document.createElement('style');
    s.id = 'sla-styles';
    s.textContent = `
    .sla-stats-bar { display:flex; gap:1rem; align-items:center; flex-wrap:wrap;
        background:var(--bg-card); border:1px solid var(--border-color);
        border-radius:12px; padding:1rem 1.25rem; }
    .sla-stat { text-align:center; min-width:90px; }
    .sla-stat-num { font-size:1.6rem; font-weight:800; line-height:1; }
    .sla-stat-label { font-size:.78rem; color:var(--text-muted); margin-top:4px; }
    .sla-stat-breach .sla-stat-num { color:var(--accent-red); }
    .sla-stat-warn .sla-stat-num   { color:var(--accent-orange); }
    .sla-stat-today .sla-stat-num  { color:var(--accent-blue); }
    .sla-stat-action { margin-right:auto; display:flex; gap:.5rem; flex-wrap:wrap; }
    .sla-tab-btn .tab-badge { background:var(--accent-red); color:#fff;
        border-radius:10px; padding:1px 6px; font-size:.72rem; font-weight:700; margin-right:4px; }
    tr.row-breach { background:rgba(239,68,68,.05); }
    tr.row-warn   { background:rgba(245,158,11,.05); }

    /* ── modal تفاصيل SLA ── */
    .sla-detail-wrap { direction:rtl; }

    .sla-total-bar { background:var(--bg-surface); border-radius:12px; padding:1rem 1.25rem;
        margin-bottom:1.25rem; border:1px solid var(--border-color); }
    .sla-total-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:.75rem; }
    .sla-total-label  { font-weight:700; font-size:1rem; }
    .sla-total-status { font-weight:700; font-size:1rem; }
    .sla-progress-track { height:12px; border-radius:6px; background:var(--bg-card);
        overflow:hidden; margin-bottom:.4rem; }
    .sla-progress-fill  { height:100%; border-radius:6px; transition:width .5s; }
    .sla-progress-labels{ display:flex; justify-content:space-between; font-size:.82rem; }

    .sla-stages-title { font-weight:700; color:var(--text-primary);
        margin-bottom:1rem; font-size:.9rem; }

    /* timeline */
    .sla-stages-timeline { display:flex; flex-direction:column; gap:0; }

    .sla-stage-item { display:flex; gap:.875rem; }
    .sla-stage-dot-col { display:flex; flex-direction:column; align-items:center; flex-shrink:0; }
    .sla-stage-dot { width:28px; height:28px; border-radius:50%; border:2px solid;
        display:flex; align-items:center; justify-content:center;
        font-size:.72rem; font-weight:900; flex-shrink:0; }
    .sla-stage-line { width:2px; flex:1; min-height:16px; margin:2px 0; }
    .sla-stage-line-muted { background:var(--border-color) !important; }

    .sla-stage-body { flex:1; padding-bottom:1.25rem; }
    .sla-stage-item:last-child .sla-stage-body { padding-bottom:.25rem; }

    .sla-stage-title { display:flex; justify-content:space-between; align-items:center;
        flex-wrap:wrap; gap:.4rem; margin-bottom:.5rem; }

    .sla-employee-tag { font-size:.78rem; color:var(--text-muted);
        background:var(--bg-surface); border-radius:4px; padding:1px 6px; }

    .sla-badge { font-size:.74rem; font-weight:700; padding:2px 8px; border-radius:4px; }
    .sla-badge-done   { background:rgba(64,192,87,.15);  color:#40c057; }
    .sla-badge-esc    { background:rgba(239,68,68,.12);  color:var(--accent-red); }
    .sla-badge-breach { background:rgba(239,68,68,.12);  color:var(--accent-red); }
    .sla-badge-warn   { background:rgba(245,158,11,.12); color:var(--accent-orange); }
    .sla-badge-active { background:rgba(77,171,247,.12); color:var(--accent-blue); }

    .sla-time-grid { display:flex; gap:.5rem; flex-wrap:wrap; margin-bottom:.5rem; }
    .sla-time-cell { background:var(--bg-surface); border-radius:7px;
        padding:.4rem .65rem; min-width:90px; }
    .sla-time-label { font-size:.72rem; color:var(--text-muted); margin-bottom:.1rem; }
    .sla-time-val   { font-size:.88rem; font-weight:700; }

    .sla-mini-bar { height:7px; border-radius:4px; background:var(--bg-card);
        overflow:hidden; margin-bottom:.25rem; position:relative; }
    .sla-mini-fill    { height:100%; border-radius:4px; transition:width .5s; }
    .sla-mini-overflow{ position:absolute; right:0; top:0; height:100%;
        background:repeating-linear-gradient(90deg,rgba(239,68,68,.4) 0,rgba(239,68,68,.4) 4px,transparent 4px,transparent 8px); }
    .sla-bar-labels { display:flex; justify-content:space-between; font-size:.75rem; margin-bottom:.5rem; }

    .sla-breach-actions { margin-top:.4rem; }
    .sla-esc-btn { background:var(--accent-red); color:#fff; border:none; border-radius:6px;
        padding:.3rem .8rem; font-size:.78rem; font-family:inherit; cursor:pointer;
        font-weight:600; transition:opacity .2s; }
    .sla-esc-btn:hover { opacity:.85; }
    .sla-escalated-ok { font-size:.78rem; color:var(--accent-green);
        background:#16a34a18; padding:3px 8px; border-radius:4px; margin-top:.3rem; display:inline-block; }

    .sla-stage-paused .sla-stage-body { opacity:.8; }
    .sla-stage-note { font-size:.8rem; color:var(--text-muted); margin-top:.15rem; }
    `;
    document.head.appendChild(s);
})();