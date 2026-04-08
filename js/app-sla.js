/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║           app-sla.js — نظام SLA / OLA                       ║
 * ║  يتطلب: app-common.js                                        ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * يحتوي هذا الملف على:
 *  • تحميل إحصائيات SLA (loadSlaStats)
 *  • لوحة SLA الكاملة (loadSlaDashboard, renderSlaDashboardTable)
 *  • سجل التجاوزات (loadSlaBreaches, renderSlaBreachLog)
 *  • نافذة تفاصيل SLA لمعاملة (openSlaDetailModal, renderSlaDetailModal)
 *    └── يعرض: وقت الانتظار، وقت OLA، وقت ما بعد التصعيد لكل مرحلة
 *  • تشغيل فحص يدوي (runSlaCheck)
 *  • حل التجاوزات (resolveBreach)
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

const SLA_TYPE_LABELS = {
    'ola_warning': '⚠️ تحذير OLA',
    'ola_breach': '🔴 تجاوزOLA',
    'sla_warning': '⚠️ تحذير SLA',
    'sla_breach': '🚨 تجاوزSLA',
};

const SLA_STAGE_LABELS = {
    'creation': tr('إنشاء'),
    'receiving': tr('الاستلام'),
    'budget': tr('الموازنة'),
    'dispatch': tr('التوجيه'),
    'payment': tr('الدفع'),
    'invoice': tr('الفوترة'),
    'sla_total': 'SLA الكلي',
};

/**
 * تحميل إحصائيات SLA السريعة
 * تعرض: عدد المعاملات ضمن المدة / تحذير /  تجاوز
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
            breached: ['🔴', ' تجاوز', 'var(--accent-red)'],
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

// ─── سجل التجاوزات ────────────────────────────────────────────
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
            container.innerHTML = '<div class="empty-state-sm">لا توجد تجاوزات</div>';
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
                <th>نوع التجاوز</th>
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
            // إخفاء الزر واستبداله بـ "تم التصعيد"
            const wrap = btn.closest('.sla-breach-actions') || btn.parentElement;
            const ok = document.createElement('div');
            ok.className = 'sla-escalated-ok';
            ok.textContent = `✅ تم التصعيد لـ: ${data.escalated_to_name ?? 'المشرف'}`;
            wrap.replaceWith(ok);

            // toast يذكر اسم المشرف
            const channels = [];
            if (data.notification_sent) channels.push('إشعار النظام');
            if (data.email_sent) channels.push('البريد الإلكتروني');
            const via = channels.length ? ` عبر: ${channels.join(' و')}` : '';
            showToast(`✅ تم تصعيد "${stageLabel}" لـ ${data.escalated_to_name ?? 'المشرف'}${via}`, 'success');

        } else {
            btn.disabled = false;
            btn.style.opacity = '1';

            if (data.error === 'تم التصعيد مسبقاً') {
                btn.textContent = '✅ مُصعَّد';
                btn.style.background = 'var(--accent-green)';
                btn.disabled = true;
            } else {
                btn.textContent = '🔔 تصعيد للمشرف';
                showToast('خطأ: ' + (data.error || 'فشل التصعيد'), 'error');
            }
        }
    } catch (e) {
        btn.disabled = false;
        btn.textContent = '🔔 تصعيد للمشرف';
        btn.style.opacity = '1';
        showToast(tr('خطأ في الاتصال'), 'error');
    }
}

// ─── عرض تفاصيل SLA / OLA ────────────────────────────────────
function renderSlaDetailModal(d) {
    const SC = { ok: 'var(--accent-green)', warning: 'var(--accent-orange)', breached: 'var(--accent-red)' };
    const slaColor = SC[d.sla_status] || 'var(--text-muted)';
    const slaBarW = Math.min(d.sla_pct, 100);
    const cardCls = d.sla_status === 'ok' ? 'card-ok' : d.sla_status === 'warning' ? 'card-warn' : 'card-breach';
    const pillCls = d.sla_status === 'ok' ? 'pill-ok' : d.sla_status === 'warning' ? 'pill-warn' : 'pill-breach';
    const statusTxt = d.sla_status === 'ok' ? '✓ ضمن المدة' : d.sla_status === 'warning' ? '⚠ تحذير' : '✕ تجاوز';

    const fmtMin = m => {
        if (!m && m !== 0) return '—';
        if (m === 0) return '&lt; دقيقة';
        if (m < 60) return m + ' د';
        const dy = Math.floor(m / 1440), hr = Math.floor((m % 1440) / 60), mn = m % 60;
        if (dy > 0) return dy + ' يوم' + (hr > 0 ? ' و' + hr + 'س' : '');
        return hr + 'س' + (mn > 0 ? ' و' + mn + 'د' : '');
    };

    // ── بطاقة SLA الكلي ──────────────────────────────────────
    const totalHtml = `
    <div class="sla-total-card ${cardCls}">
        <div class="sla-total-row1">
            <span class="sla-total-lbl">⏱ SLA الكلي</span>
            <span class="sla-total-status-pill ${pillCls}">${statusTxt}</span>
        </div>
        <div class="sla-total-numbers">
            <span class="sla-total-elapsed" style="color:${slaColor}">${fmtMin(d.total_elapsed)}</span>
            <span class="sla-total-sep">/</span>
            <span class="sla-total-allowed">${fmtMin(d.sla_total_min)} مسموح</span>
            <span class="sla-total-pct-badge" style="color:${slaColor}">${d.sla_pct}%</span>
        </div>
        <div class="sla-progress-track">
            <div class="sla-progress-fill" style="width:${slaBarW}%;background:${slaColor}"></div>
        </div>
    </div>`;

    // ── مراحل OLA ────────────────────────────────────────────
    const stagesHtml = (d.stages || []).map((st, idx) => {
        const isLast = idx === (d.stages.length - 1);

        // معلّق
        if (st.status === 'paused' || st.ola_paused) {
            return `
            <div class="sla-stage-row">
                <div class="sla-dot-col">
                    <div class="sla-dot" style="background:rgba(234,179,8,.2);border-color:rgba(234,179,8,.5);color:#b45309">⏸</div>
                    ${!isLast ? '<div class="sla-connector" style="background:var(--border-color)"></div>' : ''}
                </div>
                <div class="sla-stage-card sla-stage-card-paused">
                    <div class="sla-card-head">
                        <span class="sla-card-name">${st.label}</span>
                        <span class="sla-badge sla-badge-paused">⏸ OLA معلّق</span>
                    </div>
                    <div class="sla-card-body">
                        <div class="sla-card-note">بانتظار عودة أمر الشراء — لا يُحتسب في OLA</div>
                    </div>
                </div>
            </div>`;
        }

        const pct = Math.min(st.pct, 150);
        const barW = Math.min(st.pct, 100);
        const isDone = st.status === 'done' || st.status === 'breached_done';
        const isAct = st.status === 'active';

        const dotColor = st.status === 'breached' ? '#e03131'
            : st.status === 'warning' ? '#c07a00'
                : isDone ? '#2e9e44'
                    : isAct ? '#1c7ed6'
                        : st.status === 'escalated' ? '#e03131'
                            : 'var(--border-color)';

        const dotBg = st.status === 'breached' ? 'rgba(239,68,68,.15)'
            : st.status === 'warning' ? 'rgba(245,158,11,.15)'
                : isDone ? 'rgba(64,192,87,.15)'
                    : isAct ? 'rgba(77,171,247,.15)'
                        : st.status === 'escalated' ? 'rgba(239,68,68,.15)'
                            : 'var(--bg-card)';

        const dotIcon = isDone ? '✓' : st.status === 'escalated' ? '!' : st.status === 'breached' ? '✕'
            : st.status === 'warning' ? '!' : isAct ? '●' : '○';

        const badgeCls = isDone ? 'sla-badge-done' : isAct ? 'sla-badge-active'
            : st.status === 'breached' ? 'sla-badge-breach'
                : st.status === 'warning' ? 'sla-badge-warn'
                    : st.status === 'escalated' ? 'sla-badge-esc'
                        : st.status === 'waiting' ? 'sla-badge-wait' : 'sla-badge-wait';

        const badgeTxt = isDone ? '✓ مكتملة' : isAct ? '● جارية'
            : st.status === 'breached' ? '✕ تجاوز OLA'
                : st.status === 'warning' ? '⚠ تحذير'
                    : st.status === 'escalated' ? '! مُصعَّدة'
                        : st.status === 'waiting' ? '○ انتظار' : '○ لم تبدأ';

        const cardCls2 = isAct ? 'sla-stage-card-active' : isDone ? 'sla-stage-card-done'
            : st.status === 'breached' ? 'sla-stage-card-breach' : '';

        // chips الأوقات
        let chipsHtml = '';
        if (st.waiting_min > 0)
            chipsHtml += `<div class="sla-time-chip"><span class="sla-time-chip-lbl">⏳ انتظار</span><span class="sla-time-chip-val" style="color:var(--text-muted)">${fmtMin(st.waiting_min)}</span></div>`;
        if (st.elapsed_min > 0 || isAct)
            chipsHtml += `<div class="sla-time-chip"><span class="sla-time-chip-lbl">⚙ OLA</span><span class="sla-time-chip-val" style="color:${dotColor}">${st.elapsed_min === 0 && isAct ? 'جارية' : fmtMin(st.elapsed_min)}</span></div>`;
        if (st.post_escalation_min > 0)
            chipsHtml += `<div class="sla-time-chip"><span class="sla-time-chip-lbl">🔔 بعد التصعيد</span><span class="sla-time-chip-val" style="color:var(--accent-orange)">${fmtMin(st.post_escalation_min)}</span></div>`;

        const showBar = st.status !== 'pending' && st.status !== 'waiting' && st.pct > 0;
        const barHtml = showBar ? `
            <div class="sla-ola-bar-wrap">
                <div class="sla-ola-bar-labels">
                    <span style="color:${dotColor};font-weight:700">${pct}%</span>
                    <span style="color:var(--text-muted);font-size:.68rem">من ${st.allowed_hrs}س مسموح</span>
                </div>
                <div class="sla-ola-bar-track">
                    <div class="sla-ola-bar-fill" style="width:${barW}%;background:${dotColor}"></div>
                </div>
            </div>` : '';

        const escHtml = (st.status === 'breached' && !st.is_escalated)
            ? `<div class="sla-esc-wrap">
                <button class="sla-esc-btn" id="esc-btn-${st.stage}"
                    onclick="escalateStage(${d.transaction_id},'${st.stage}','${st.label}',this)">
                    🔔 تصعيد للمشرف
                </button></div>`
            : st.is_escalated ? `<div class="sla-esc-wrap"><div class="sla-escalated-ok">✅ تم التصعيد للمشرف</div></div>` : '';

        const hasBody = chipsHtml || showBar || escHtml;

        return `
        <div class="sla-stage-row">
            <div class="sla-dot-col">
                <div class="sla-dot ${isAct ? 'sla-dot-active' : ''}"
                    style="background:${dotBg};border-color:${dotColor};color:${dotColor}">${dotIcon}</div>
                ${!isLast ? `<div class="sla-connector" style="background:${isDone ? dotColor : 'var(--border-color)'}"></div>` : ''}
            </div>
            <div class="sla-stage-card ${cardCls2}">
                <div class="sla-card-head">
                    <span class="sla-card-name">${st.label}</span>
                    <div class="sla-card-badges">
                        ${st.employee && st.employee !== '—' ? `<span class="sla-emp-badge">👤 ${st.employee}</span>` : ''}
                        <span class="sla-badge ${badgeCls}">${badgeTxt}</span>
                    </div>
                </div>
                ${hasBody ? `<div class="sla-card-body">
                    ${chipsHtml ? `<div class="sla-times-grid">${chipsHtml}</div>` : ''}
                    ${barHtml}${escHtml}
                </div>` : ''}
            </div>
        </div>`;
    }).join('');

    return `
    <div class="sla-detail-wrap">
        ${totalHtml}
        <div class="sla-phases-header">
            <div class="sla-phases-line" style="flex:1;height:1px;background:var(--border-color)"></div>
            <span class="sla-phases-title" style="font-size:.72rem;font-weight:700;color:var(--text-muted);letter-spacing:.06em;padding:0 .6rem;white-space:nowrap">تفاصيل OLA لكل مرحلة</span>
            <div class="sla-phases-line" style="flex:1;height:1px;background:var(--border-color)"></div>
        </div>
        <div class="sla-timeline">${stagesHtml}</div>
        <div style="margin-top:.75rem;display:flex;justify-content:flex-end">
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
            showToast(`تم فحص ${data.data.checked} معاملة — ${data.data.new_breaches} تجاوزجديد`, 'success');
            loadSlaStats(); loadSlaDashboard(); loadSlaBreaches();
        }
    } catch (e) { showToast('خطأ في الفحص', 'error'); }
}

// ─── حل تجاوز──────────────────────────────────────────────────
async function resolveBreach(id) {
    if (!confirm('تعليم هذا التجاوزكمحلول؟')) return;
    try {
        const res = await fetch('api/?action=sla_resolve_breach', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        const data = await res.json();
        if (data.success) { showToast('تم تعليم التجاوزكمحلول ✓', 'success'); loadSlaBreaches(); }
        else showToast('فشل تحديث التجاوز', 'error');
    } catch (e) { showToast(tr('خطأ في الاتصال'), 'error'); }
}

// ─── إعدادات SLA/OLA المتقدمة ────────────────────────────────

/**
 * فتح مدير السياسات — يعرض بطاقة لكل نوع معاملة رئيسي
 * + السياسة الافتراضية
 */
async function openSlaSettingsModal() {
    DOM.modalTitle.textContent = '⚙️ إدارة سياسات SLA / OLA';
    DOM.modalBody.innerHTML = `<div style="padding:2rem;text-align:center;color:var(--text-muted)">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin 1s linear infinite">
            <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
        </svg><br>جارٍ التحميل...
    </div>`;
    openModal('xl');
    await _renderSlaPoliciesManager();
}

async function _renderSlaPoliciesManager() {
    try {
        const [polRes, typesRes] = await Promise.all([
            fetch('api/?action=sla_policies'),
            fetch('api/settings.php?action=get_types')
        ]);
        const polData = await polRes.json();
        const typesData = await typesRes.json();

        const policies = polData.success ? polData.data : [];
        const allTypes = typesData.success ? typesData.data : [];

        // بناء الهيكل الهرمي
        const parents = allTypes.filter(t => !t.parent_id || t.parent_id == 0);
        const childOf = id => allTypes.filter(t => t.parent_id == id);

        // فهرسة: type_id → policy
        const policyByType = {};
        policies.forEach(p => { if (p.transaction_type_id) policyByType[p.transaction_type_id] = p; });

        const defaultPolicy = policies.find(p => !p.transaction_type_id) || null;
        const sumOlaHours = p => (p && p.ola_rules ? p.ola_rules.reduce((s, r) => s + parseFloat(r.allowed_hours || 0), 0) : 0);

        // ── السياسة الافتراضية ──
        const defHtml = _buildPolicyCard({
            icon: '🌐', name: 'السياسة الافتراضية',
            badge: 'تُطبَّق على كل نوع لا توجد له سياسة خاصة',
            badgeClass: 'sla-badge-default', policy: defaultPolicy,
            sumOla: sumOlaHours(defaultPolicy),
            typeId: null, hasOwn: true, canDelete: false
        });

        // ── لكل تصنيف رئيسي: بطاقته + أبنائه الفرعيين ──
        let sectionsHtml = '';
        parents.forEach(parent => {
            const subs = childOf(parent.id);
            const ownParent = policyByType[parent.id] || null;
            const dispParent = ownParent || defaultPolicy;
            const icon = typeof getTypeIcon === 'function' ? getTypeIcon(parent.name) : '📁';

            // بطاقة الرئيسي
            const parentCard = _buildPolicyCard({
                icon, name: parent.name,
                badge: ownParent ? '🎯 سياسة خاصة' : '🔄 يستخدم الافتراضية',
                badgeClass: ownParent ? 'sla-badge-own' : 'sla-badge-default',
                policy: dispParent, sumOla: sumOlaHours(dispParent),
                typeId: parent.id, hasOwn: !!ownParent,
                canDelete: !!ownParent, ownPolicyId: ownParent ? ownParent.id : null
            });

            // بطاقات التصنيفات الفرعية
            let subCardsHtml = '';
            if (subs.length > 0) {
                const subCards = subs.map(sub => {
                    const ownSub = policyByType[sub.id] || null;
                    // التصنيف الفرعي: يستخدم سياسته الخاصة أو سياسة الأب أو الافتراضية
                    const dispSub = ownSub || ownParent || defaultPolicy;
                    return _buildPolicyCard({
                        icon: '↳', name: sub.name,
                        badge: ownSub ? '🎯 سياسة خاصة' : (ownParent ? '↑ يرث من الرئيسي' : '🔄 يستخدم الافتراضية'),
                        badgeClass: ownSub ? 'sla-badge-own' : 'sla-badge-inherit',
                        policy: dispSub, sumOla: sumOlaHours(dispSub),
                        typeId: sub.id, hasOwn: !!ownSub,
                        canDelete: !!ownSub, ownPolicyId: ownSub ? ownSub.id : null,
                        isSub: true
                    });
                }).join('');
                subCardsHtml = `<div class="sla-sub-section">${subCards}</div>`;
            }

            sectionsHtml += `<div class="sla-parent-section">${parentCard}${subCardsHtml}</div>`;
        });

        DOM.modalBody.innerHTML = `
        <div class="sla-mgr-layout">

            <!-- الشريط الجانبي: الافتراضية + أولوية -->
            <div class="sla-sidebar">
                <div class="sla-priority-note">
                    <div class="sla-priority-title">ترتيب الأولوية</div>
                    <div class="sla-priority-chain">
                        <div class="sla-priority-item sla-p-sub">
                            <span class="sla-p-dot"></span>
                            <span>فرعي (الأعلى)</span>
                        </div>
                        <div class="sla-priority-arrow">↓</div>
                        <div class="sla-priority-item sla-p-parent">
                            <span class="sla-p-dot"></span>
                            <span>رئيسي</span>
                        </div>
                        <div class="sla-priority-arrow">↓</div>
                        <div class="sla-priority-item sla-p-default">
                            <span class="sla-p-dot"></span>
                            <span>افتراضية</span>
                        </div>
                    </div>
                </div>
                <div class="sla-default-wrap">${defHtml}</div>
            </div>

            <!-- المنطقة الرئيسية: التصنيفات -->
            <div class="sla-main-area">
                <div class="sla-main-label">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                        <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
                    </svg>
                    أنواع المعاملات
                </div>
                <div class="sla-sections-wrap">${sectionsHtml}</div>
            </div>
        </div>`;
    } catch (e) {
        DOM.modalBody.innerHTML = `<div style="color:var(--accent-red);padding:1rem">خطأ: ${e.message}</div>`;
    }
}

function _buildPolicyCard({ icon, name, badge, badgeClass, policy, sumOla, typeId, hasOwn, canDelete, ownPolicyId, isSub = false }) {
    const slaHours = policy ? parseFloat(policy.total_hours).toFixed(0) : '—';
    const warnPct = policy ? policy.warning_pct : '—';
    const olaSum = policy ? sumOla.toFixed(1) : '—';

    // OLA breakdown أعمدة
    const stages = ['receiving', 'budget', 'dispatch', 'payment', 'invoice'];
    const stageAr = { receiving: 'استلام', budget: 'موازنة', dispatch: 'توجيه', payment: 'دفع', invoice: 'فوترة' };
    let olaBreakdown = '';
    if (policy && policy.ola_rules && policy.ola_rules.length) {
        const byStage = {};
        policy.ola_rules.forEach(r => byStage[r.stage] = r);
        olaBreakdown = `<div class="sla-card-ola-row">${stages.map(s => byStage[s] ? `
            <div class="sla-ola-chip">
                <span class="sla-ola-chip-stage">${stageAr[s]}</span>
                <span class="sla-ola-chip-val">${parseFloat(byStage[s].allowed_hours).toFixed(1)}h</span>
            </div>` : '').join('')
            }</div>`;
    }

    // ── شريط OLA التفصيلي ──
    const stageColors = { receiving: '#6366f1', budget: '#f59e0b', dispatch: '#10b981', payment: '#3b82f6', invoice: '#ec4899' };
    let olaStripHtml = '';
    if (policy && policy.ola_rules && policy.ola_rules.length) {
        const byStage2 = {};
        policy.ola_rules.forEach(r => byStage2[r.stage] = r);
        const stages2 = ['receiving', 'budget', 'dispatch', 'payment', 'invoice'];
        const stageAr2 = { receiving: 'استلام', budget: 'موازنة', dispatch: 'توجيه', payment: 'دفع', invoice: 'فوترة' };
        olaStripHtml = `<div class="sla-card-ola-strip">${stages2.map(s => byStage2[s] ? `
            <div class="sla-ola-pill" style="--pill-color:${stageColors[s] || '#6366f1'}">
                <span class="sla-ola-pill-label">${stageAr2[s]}</span>
                <span class="sla-ola-pill-val">${parseFloat(byStage2[s].allowed_hours).toFixed(1)}h</span>
            </div>` : '').join('')
            }</div>`;
    }

    const editPolicyId = hasOwn && policy ? policy.id : null;
    const isCreate = typeId && !hasOwn;

    return `
    <div class="sla-policy-card ${isSub ? 'sla-card-sub' : 'sla-card-parent'} ${(typeId && hasOwn) ? 'sla-card-has-own' : ''}">
        <div class="sla-card-row1">
            <div class="sla-card-icon-wrap">${icon}</div>
            <div class="sla-card-title-wrap">
                <div class="sla-card-title-name">${name}</div>
                <span class="sla-policy-badge ${badgeClass}">${badge}</span>
            </div>
            <div class="sla-card-kpis">
                <div class="sla-kpi">
                    <div class="sla-kpi-val">${slaHours}<span class="sla-kpi-unit">h</span></div>
                    <div class="sla-kpi-lbl">SLA</div>
                </div>
                <div class="sla-kpi-sep"></div>
                <div class="sla-kpi">
                    <div class="sla-kpi-val">${olaSum}<span class="sla-kpi-unit">h</span></div>
                    <div class="sla-kpi-lbl">OLA</div>
                </div>
                <div class="sla-kpi-sep"></div>
                <div class="sla-kpi">
                    <div class="sla-kpi-val">${warnPct}<span class="sla-kpi-unit">%</span></div>
                    <div class="sla-kpi-lbl">تحذير</div>
                </div>
            </div>
            <div class="sla-card-btns">
                <button class="sla-action-btn ${isCreate ? 'sla-action-create' : 'sla-action-edit'}"
                    onclick="_openSlaTypeEditor(${typeId ? typeId : 'null'}, '${name.replace(/'/g, "\'")}', ${editPolicyId ? editPolicyId : 'null'})">
                    ${isCreate
            ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> إنشاء`
            : `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> تعديل`}
                </button>
                ${canDelete ? `
                <button class="sla-action-btn sla-action-del"
                    onclick="_deleteSlaTypePolicy(${typeId}, ${ownPolicyId}, '${name.replace(/'/g, "\'")}')">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>` : ''}
            </div>
        </div>
        ${olaStripHtml}
    </div>`;
}

/**
 * فتح محرر سياسة لنوع محدد أو الافتراضية
 * typeId=null → افتراضية
 */
async function _openSlaTypeEditor(typeId, typeName, policyId) {
    DOM.modalTitle.textContent = typeId
        ? `⚙️ سياسة SLA/OLA — ${typeName}`
        : '⚙️ السياسة الافتراضية — SLA/OLA';

    DOM.modalBody.innerHTML = `<div style="padding:2rem;text-align:center;color:var(--text-muted)">جارٍ التحميل...</div>`;

    let policy = null;
    if (policyId) {
        try {
            const res = await fetch('api/?action=sla_policies');
            const data = await res.json();
            if (data.success) policy = data.data.find(p => p.id == policyId) || null;
        } catch (e) { }
    }
    if (!policy) {
        policy = { id: null, transaction_type_id: typeId, total_hours: 24, warning_pct: 80, ola_rules: [] };
    }

    DOM.modalBody.innerHTML = _renderSlaEditor(policy, typeId, typeName);
    // ── تشغيل التحقق الحي بعد رسم الـ DOM ──
    requestAnimationFrame(() => requestAnimationFrame(_initOlaLiveValidation));
}

function _renderSlaEditor(policy, typeId, typeName) {
    const stages = ['receiving', 'budget', 'dispatch', 'payment', 'invoice'];
    const stageLabels = { receiving: tr('الاستلام'), budget: tr('الموازنة'), dispatch: tr('التوجيه'), payment: tr('الدفع'), invoice: tr('الفوترة') };
    const stageIcons = { receiving: '📥', budget: '🏛️', dispatch: '🚀', payment: '💳', invoice: '🧾' };
    const defaults = { receiving: 4, budget: 8, dispatch: 2, payment: 4, invoice: 2 };

    const byStage = {};
    (policy.ola_rules || []).forEach(r => byStage[r.stage] = r);

    const rows = stages.map(s => {
        const r = byStage[s] || {};
        const hours = r.allowed_hours || defaults[s];
        const warn = r.warn_at_pct || 75;
        const esc = r.escalate_pct || 100;
        return `
        <tr class="sla-ola-editor-row">
            <td class="sla-stage-cell">
                <span class="sla-stage-emoji">${stageIcons[s]}</span>
                <span class="sla-stage-name">${stageLabels[s]}</span>
            </td>
            <td>
                <div class="sla-input-pill">
                    <input type="number" step="0.5" min="0.5" class="sla-num-inp ola-hours"
                        data-stage="${s}" value="${hours}">
                    <span>ساعة</span>
                </div>
            </td>
            <td>
                <div class="sla-input-pill">
                    <input type="number" min="10" max="95" class="sla-num-inp ola-warn"
                        data-stage="${s}" value="${warn}">
                    <span>%</span>
                </div>
            </td>
            <td>
                <div class="sla-input-pill">
                    <input type="number" min="50" max="200" class="sla-num-inp ola-esc"
                        data-stage="${s}" value="${esc}">
                    <span>%</span>
                </div>
            </td>
        </tr>`;
    }).join('');

    return `
    <input type="hidden" id="slaEditTypeId"   value="${typeId || ''}">
    <input type="hidden" id="slaEditTypeName" value="${typeName || ''}">

    <div class="sla-editor-hint">
        <strong>SLA الكلي:</strong> أقصى وقت لإنجاز المعاملة من أولها لآخرها.&nbsp;
        <strong>OLA لكل مرحلة:</strong> أقصى وقت لكل موظف في مرحلته.
    </div>

    <div class="sla-editor-section">
        <div class="sla-editor-section-title">🎯 SLA الكلي للمعاملة</div>
        <div class="sla-editor-row2">
            <div class="form-group">
                <label class="form-label">⏱ المدة الكلية المسموحة (ساعة)</label>
                <input type="number" id="slaTotalHours" class="form-input" step="1" min="1"
                    value="${policy.total_hours || 24}">
            </div>
            <div class="form-group">
                <label class="form-label">⚠️ تحذير مبكر عند (%)</label>
                <input type="number" id="slaWarnPct" class="form-input" min="50" max="95"
                    value="${policy.warning_pct || 80}">
            </div>
        </div>
    </div>

    <div class="sla-editor-section">
        <div class="sla-editor-section-title" style="display:flex;align-items:center;justify-content:space-between;">
            <span>📊 أوقات OLA لكل مرحلة</span>
            <span class="sla-ola-sum-badge" id="olaSum">
                المجموع: <strong id="olaSumVal">0</strong> / <strong id="olaSumMax">${policy.total_hours || 24}</strong> ساعة
            </span>
        </div>
        <div id="olaOverflowAlert" class="sla-ola-overflow-alert" style="display:none">
            ⚠️ مجموع أوقات OLA (<span id="olaAlertSum"></span> ساعة) يتجاوز المدة الكلية المسموحة
            (<span id="olaAlertMax"></span> ساعة). يجب تقليل مجموع المراحل.
        </div>
        <table class="sla-ola-editor-table">
            <thead>
                <tr>
                    <th>المرحلة</th>
                    <th>الوقت المسموح</th>
                    <th>تحذير عند %</th>
                    <th>تصعيد عند %</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    </div>

    <div class="sla-editor-footer">
        <button class="btn btn-primary" id="slaSaveBtn" onclick="saveSlaSettings(${policy.id || 'null'})">
            💾 حفظ السياسة
        </button>
        <button class="btn btn-secondary" onclick="_renderSlaPoliciesManager()">
            ← رجوع للقائمة
        </button>
    </div>`;

}

// ── تحقق حي من مجموع OLA vs SLA الكلي ──
function _initOlaLiveValidation() {
    const totalInp = document.getElementById('slaTotalHours');
    if (!totalInp) return;
    const update = () => {
        const maxHours = parseFloat(totalInp.value) || 0;
        const inputs = document.querySelectorAll('.ola-hours');
        const sum = Array.from(inputs).reduce((t, i) => t + (parseFloat(i.value) || 0), 0);

        const sumEl = document.getElementById('olaSumVal');
        const maxEl = document.getElementById('olaSumMax');
        const badge = document.getElementById('olaSum');
        const alert = document.getElementById('olaOverflowAlert');
        const saveBtn = document.getElementById('slaSaveBtn');
        const alertSum = document.getElementById('olaAlertSum');
        const alertMax = document.getElementById('olaAlertMax');

        if (sumEl) sumEl.textContent = sum.toFixed(1);
        if (maxEl) maxEl.textContent = maxHours.toFixed(0);
        if (alertSum) alertSum.textContent = sum.toFixed(1);
        if (alertMax) alertMax.textContent = maxHours.toFixed(0);

        const overflow = maxHours > 0 && sum > maxHours;
        if (badge) {
            badge.className = 'sla-ola-sum-badge ' + (overflow ? 'sla-ola-sum-over' : sum > 0 ? 'sla-ola-sum-ok' : '');
        }
        if (alert) alert.style.display = overflow ? 'flex' : 'none';
        if (saveBtn) saveBtn.disabled = overflow;
        if (saveBtn) saveBtn.style.opacity = overflow ? '.5' : '1';
    };
    document.querySelectorAll('.ola-hours').forEach(i => i.addEventListener('input', update));
    totalInp.addEventListener('input', () => {
        const maxEl = document.getElementById('olaSumMax');
        if (maxEl) maxEl.textContent = (parseFloat(totalInp.value) || 0).toFixed(0);
        update();
    });
    update(); // initial
}

async function saveSlaSettings(policyId) {
    const totalHours = parseFloat(document.getElementById('slaTotalHours')?.value || 24);
    const warnPct = parseInt(document.getElementById('slaWarnPct')?.value || 80);
    const typeId = document.getElementById('slaEditTypeId')?.value || '';
    const typeName = document.getElementById('slaEditTypeName')?.value || 'السياسة الافتراضية';

    // ── تحقق نهائي: مجموع OLA لا يتجاوز SLA الكلي ──
    const inputs = document.querySelectorAll('.ola-hours');
    const olaSum = Array.from(inputs).reduce((t, i) => t + (parseFloat(i.value) || 0), 0);
    if (olaSum > totalHours) {
        showToast(`⚠️ مجموع OLA (${olaSum.toFixed(1)}h) يتجاوز SLA الكلي (${totalHours}h)`, 'error');
        return;
    }

    // ── حفظ SLA Policy ──
    const slaPayload = {
        id: policyId,
        total_hours: totalHours,
        warning_pct: warnPct,
        name: typeId ? `سياسة ${typeName}` : 'السياسة الافتراضية',
        transaction_type_id: typeId || null
    };
    const slaRes = await fetch('api/?action=sla_save_policy', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(slaPayload)
    });
    const slaData = await slaRes.json();
    if (!slaData.success) return showToast('خطأ في حفظ SLA', 'error');

    const realPolicyId = slaData.id || policyId;

    // ── حفظ قواعد OLA ──
    const stageLabels = { receiving: tr('الاستلام'), budget: tr('الموازنة'), dispatch: tr('التوجيه'), payment: tr('الدفع'), invoice: tr('الفوترة') };
    const olaInputs = document.querySelectorAll('.ola-hours');
    let saved = 0;
    for (const inp of olaInputs) {
        const s = inp.dataset.stage;
        const hours = parseFloat(inp.value);
        const warn = parseInt(document.querySelector(`.ola-warn[data-stage="${s}"]`)?.value || 75);
        const esc = parseInt(document.querySelector(`.ola-esc[data-stage="${s}"]`)?.value || 100);
        const r = await fetch('api/?action=sla_save_ola_rule', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sla_policy_id: realPolicyId,
                stage: s,
                stage_label: stageLabels[s] || s,
                allowed_hours: hours,
                warn_at_pct: warn,
                escalate_pct: esc
            })
        });
        if ((await r.json()).success) saved++;
    }

    showToast(`✅ تم الحفظ — SLA + ${saved} مرحلة OLA`, 'success');
    DOM.modalTitle.textContent = '⚙️ إدارة سياسات SLA / OLA';
    await _renderSlaPoliciesManager();
    loadSlaStats();
}

async function _deleteSlaTypePolicy(typeId, policyId, typeName) {
    if (!confirm(`حذف السياسة الخاصة بـ "${typeName}"؟\nسيعود النوع لاستخدام السياسة الافتراضية.`)) return;
    try {
        const res = await fetch('api/?action=sla_delete_policy', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: policyId })
        });
        const data = await res.json();
        if (data.success) {
            showToast(`✅ تم حذف سياسة "${typeName}"`, 'success');
            await _renderSlaPoliciesManager();
        } else {
            showToast(data.error || 'خطأ في الحذف', 'error');
        }
    } catch (e) { showToast(tr('خطأ في الاتصال'), 'error'); }
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
                        <span class="stat-label">تجاوزات مفتوحة</span>
                    </div>
                    <div class="header-stat">
                        <span class="stat-number" id="slaWarnCount" style="color:var(--accent-orange)">—</span>
                        <span class="stat-label">تحذيرات نشطة</span>
                    </div>
                    <div class="header-stat">
                        <span class="stat-number" id="slaBreachToday" style="color:var(--accent-blue)">—</span>
                        <span class="stat-label">تجاوزات اليوم</span>
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
            <button class="perf-tab"        onclick="switchSlaPageTab('breaches',this)">⚠️ سجل التجاوزات</button>
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
                    <option value="breached">تجاوز✗</option>
                    <option value="warning">تحذير ⚠</option>
                    <option value="ok">ضمن المدة ✓</option>
                </select>
            </div>
            <div class="filter-group" id="slaBreachTypeFilterGroup">
                <label>نوع التجاوز</label>
                <select id="slaBreachTypeFilter" onchange="loadSlaBreaches()">
                    <option value="">الكل</option>
                    <option value="ola_breach">تجاوزOLA</option>
                    <option value="sla_breach">تجاوزSLA</option>
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
                <div class="section-header"><h3>⚠️ سجل التجاوزات والتصعيد</h3></div>
                <div id="slaBreachLog" class="perf-table-container"><div class="loading-placeholder">جارٍ التحميل...</div></div>
            </div>
        </div>
        <div id="slaPageTabEscalations" class="perf-tab-content" style="display:none">
            <div class="perf-section">
                <div class="section-header">
                    <h3>📧 التصعيدات المُرسلة عبر البريد</h3>
                    <button class="btn btn btn-primary" onclick="loadSlaEmailEscalations()">🔄 تحديث</button>
                </div>
                <div class="perf-filters" style="margin-bottom:1rem">
                    <div class="filter-group">
                        <label>نوع التصعيد</label>
                        <select id="escalationTypeFilter" onchange="loadSlaEmailEscalations()">
                            <option value="">الكل</option>
                            <option value="ola_breach">تجاوزOLA</option>
                            <option value="sla_breach">تجاوزSLA</option>
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
        'ola_breach': ['🔴', 'تجاوزOLA'], 'sla_breach': ['🔴', 'تجاوزSLA'],
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

    /* ══════════════════════════════════
       إحصائيات SLA
       ══════════════════════════════════ */
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

    /* ══════════════════════════════════
       نافذة تفاصيل SLA — تصميم جديد
       ══════════════════════════════════ */

    /* ── Wrapper ── */
    .sla-detail-wrap {
        direction: rtl;
        font-family:var(--font-primary);
        padding: .25rem 0;
    }

    /* ── بطاقة SLA الكلي ── */
    .sla-total-card {
        border-radius: 14px;
        padding: 1.1rem 1.25rem 1rem;
        margin-bottom: 1.25rem;
        position: relative;
        overflow: hidden;
        border: 1px solid var(--border-color);
        background: var(--bg-surface);
    }
    .sla-total-card::before {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(135deg, rgba(255,255,255,.04) 0%, transparent 60%);
        pointer-events: none;
    }
    .sla-total-card.card-ok      { border-color: rgba(64,192,87,.35);  background: rgba(64,192,87,.06); }
    .sla-total-card.card-warn    { border-color: rgba(245,158,11,.35); background: rgba(245,158,11,.06); }
    .sla-total-card.card-breach  { border-color: rgba(239,68,68,.35);  background: rgba(239,68,68,.06); }

    .sla-total-row1 {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: .7rem;
    }
    .sla-total-lbl {
        font-size: .78rem;
        font-weight: 600;
        color: var(--text-muted);
        letter-spacing: .03em;
        text-transform: uppercase;
    }
    .sla-total-status-pill {
        display: inline-flex;
        align-items: center;
        gap: .3rem;
        font-size: .78rem;
        font-weight: 700;
        padding: .25rem .75rem;
        border-radius: 20px;
    }
    .pill-ok     { background: rgba(64,192,87,.15);  color: #2e9e44; }
    .pill-warn   { background: rgba(245,158,11,.15); color: #c07a00; }
    .pill-breach { background: rgba(239,68,68,.15);  color: #e03131; }

    .sla-total-numbers {
        display: flex;
        align-items: baseline;
        gap: .4rem;
        margin-bottom: .65rem;
    }
    .sla-total-elapsed {
        font-size: 1.55rem;
        font-weight: 800;
        line-height: 1;
        letter-spacing: -.02em;
    }
    .sla-total-sep { font-size: 1rem; color: var(--text-muted); font-weight: 300; }
    .sla-total-allowed { font-size: .88rem; color: var(--text-muted); }
    .sla-total-pct-badge {
        margin-right: auto;
        font-size: .8rem;
        font-weight: 700;
        padding: .15rem .55rem;
        border-radius: 6px;
        background: var(--bg-card);
    }

    .sla-progress-track {
        height: 8px;
        border-radius: 4px;
        background: var(--bg-card);
        overflow: hidden;
    }
    .sla-progress-fill {
        height: 100%;
        border-radius: 4px;
        transition: width .6s cubic-bezier(.4,0,.2,1);
    }

    /* ── عنوان المراحل ── */
    .sla-phases-header {
        display: flex;
        align-items: center;
        gap: .5rem;
        margin-bottom: .9rem;
    }
    .sla-phases-header-line {
        flex: 1;
        height: 1px;
        background: var(--border-color);
    }
    .sla-phases-title {
        font-size: .74rem;
        font-weight: 700;
        color: var(--text-muted);
        letter-spacing: .06em;
        text-transform: uppercase;
        white-space: nowrap;
    }

    /* ── Timeline ── */
    .sla-timeline { display: flex; flex-direction: column; }

    .sla-stage-row {
        display: flex;
        gap: .875rem;
        position: relative;
    }

    /* خط الـ timeline */
    .sla-dot-col {
        display: flex;
        flex-direction: column;
        align-items: center;
        flex-shrink: 0;
        width: 30px;
    }
    .sla-dot {
        width: 30px;
        height: 30px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: .72rem;
        font-weight: 900;
        flex-shrink: 0;
        border: 2.5px solid;
        transition: transform .2s;
        position: relative;
        z-index: 1;
    }
    .sla-dot-active { box-shadow: 0 0 0 4px rgba(77,171,247,.2); }
    .sla-connector {
        width: 2px;
        flex: 1;
        min-height: 12px;
        margin: 3px 0;
        border-radius: 2px;
    }

    /* بطاقة المرحلة */
    .sla-stage-card {
        flex: 1;
        margin-bottom: .875rem;
        border-radius: 10px;
        border: 1px solid var(--border-color);
        background: var(--bg-surface);
        overflow: hidden;
        transition: box-shadow .2s;
    }
    .sla-stage-card:hover { box-shadow: 0 2px 12px rgba(0,0,0,.08); }
    .sla-stage-card-active {
        border-color: rgba(77,171,247,.4);
        background: rgba(77,171,247,.04);
    }
    .sla-stage-card-done {
        opacity: .82;
    }
    .sla-stage-card-breach {
        border-color: rgba(239,68,68,.3);
        background: rgba(239,68,68,.04);
    }
    .sla-stage-card-paused {
        opacity: .7;
        border-style: dashed;
    }

    .sla-card-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: .6rem .85rem .5rem;
        gap: .5rem;
        flex-wrap: wrap;
    }
    .sla-card-name {
        font-size: .88rem;
        font-weight: 700;
        color: var(--text-primary);
    }
    .sla-card-badges {
        display: flex;
        align-items: center;
        gap: .35rem;
        flex-wrap: wrap;
    }

    .sla-badge {
        display: inline-flex;
        align-items: center;
        gap: .2rem;
        font-size: .7rem;
        font-weight: 700;
        padding: .18rem .55rem;
        border-radius: 5px;
    }
    .sla-badge-done    { background: rgba(64,192,87,.12);  color: #2e9e44; }
    .sla-badge-active  { background: rgba(77,171,247,.12); color: #1c7ed6; }
    .sla-badge-warn    { background: rgba(245,158,11,.12); color: #c07a00; }
    .sla-badge-breach  { background: rgba(239,68,68,.12);  color: #e03131; }
    .sla-badge-esc     { background: rgba(239,68,68,.12);  color: #e03131; }
    .sla-badge-paused  { background: rgba(234,179,8,.12);  color: #b45309; }
    .sla-badge-wait    { background: var(--bg-card);       color: var(--text-muted); }
    .sla-emp-badge {
        display: inline-flex;
        align-items: center;
        gap: .25rem;
        font-size: .7rem;
        color: var(--text-muted);
        background: var(--bg-card);
        border-radius: 4px;
        padding: .18rem .5rem;
    }

    /* body البطاقة */
    .sla-card-body {
        padding: 0 .85rem .65rem;
        border-top: 1px solid var(--border-color);
    }
    .sla-card-note {
        padding: .4rem 0;
        font-size: .78rem;
        color: var(--text-muted);
    }

    /* شبكة الأوقات */
    .sla-times-grid {
        display: flex;
        gap: .5rem;
        flex-wrap: wrap;
        padding: .45rem 0 .35rem;
    }
    .sla-time-chip {
        display: flex;
        flex-direction: column;
        background: var(--bg-card);
        border-radius: 7px;
        padding: .35rem .6rem;
        min-width: 80px;
    }
    .sla-time-chip-lbl {
        font-size: .65rem;
        color: var(--text-muted);
        margin-bottom: .1rem;
        font-weight: 500;
    }
    .sla-time-chip-val {
        font-size: .85rem;
        font-weight: 700;
    }

    /* شريط OLA */
    .sla-ola-bar-wrap { padding: .15rem 0 .4rem; }
    .sla-ola-bar-labels {
        display: flex;
        justify-content: space-between;
        font-size: .71rem;
        margin-bottom: .3rem;
    }
    .sla-ola-bar-track {
        height: 6px;
        border-radius: 3px;
        background: var(--bg-card);
        overflow: hidden;
    }
    .sla-ola-bar-fill {
        height: 100%;
        border-radius: 3px;
        transition: width .5s ease;
    }

    /* زر التصعيد */
    .sla-esc-wrap { padding: .4rem 0 .1rem; }
    .sla-esc-btn {
        display: inline-flex;
        align-items: center;
        gap: .35rem;
        background: #e03131;
        color: #fff;
        border: none;
        border-radius: 7px;
        padding: .35rem .85rem;
        font-size: .78rem;
        font-family: inherit;
        cursor: pointer;
        font-weight: 700;
        transition: opacity .2s, transform .1s;
    }
    .sla-esc-btn:hover { opacity: .88; transform: translateY(-1px); }
    .sla-esc-btn:active { transform: none; }
    .sla-escalated-ok {
        display: inline-flex;
        align-items: center;
        gap: .3rem;
        font-size: .78rem;
        color: #2e9e44;
        background: rgba(64,192,87,.12);
        padding: .3rem .7rem;
        border-radius: 6px;
        font-weight: 600;
    }



    /* ══════════════════════════════════════════════════
       مدير سياسات SLA/OLA — التصميم المُحسَّن
       ══════════════════════════════════════════════════ */

    /* Layout */
    .sla-mgr-layout {
        display: flow;
        grid-template-columns: 230px 1fr;
        gap: 1.25rem;
        align-items: start;
        direction: rtl;
    }
    @media (max-width: 720px) {
        .sla-mgr-layout { grid-template-columns: 1fr; }
    }

    /* ── Sidebar ── */
    .sla-sidebar { display:flex; flex-direction:column; gap:.85rem; }

    .sla-priority-note {
        background: var(--bg-surface);
        border: 1px solid var(--border-color);
        border-radius: 12px;
        padding: .85rem 1rem;
    }
    .sla-priority-title {
        font-size:.72rem; font-weight:800; color:var(--text-muted);
        text-transform:uppercase; letter-spacing:.5px; margin-bottom:.65rem;
    }
    .sla-priority-chain { display:flex; flex-direction:column; gap:.2rem; }
    .sla-priority-item {
        display:flex; align-items:center; gap:.5rem;
        font-size:.8rem; font-weight:600;
        padding:.22rem .3rem; border-radius:6px;
        transition: background .15s;
    }
    .sla-priority-item:hover { background: rgba(255,255,255,.04); }
    .sla-priority-arrow { font-size:.75rem; color:var(--text-muted); padding-right:1.1rem; opacity:.55; }
    .sla-p-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
    .sla-p-sub    .sla-p-dot { background:#818cf8; box-shadow:0 0 6px rgba(129,140,248,.5); }
    .sla-p-parent .sla-p-dot { background:#f59e0b; box-shadow:0 0 6px rgba(245,158,11,.4); }
    .sla-p-default .sla-p-dot { background:var(--text-muted); }
    .sla-p-sub    { color:#818cf8; }
    .sla-p-parent { color:#d97706; }
    .sla-p-default { color:var(--text-muted); }

    /* الافتراضية في السايدبار */
    .sla-default-wrap .sla-policy-card {
        border-color: rgba(99,102,241,.28);
        background: linear-gradient(135deg, var(--bg-card), rgba(99,102,241,.05));
    }
    .sla-default-wrap .sla-card-kpis { display:none; }
    .sla-default-wrap .sla-card-ola-strip { display:none; }

    /* ── Main area ── */
    .sla-main-label {
        display:flex; align-items:center; gap:.4rem;
        font-size:.72rem; font-weight:800; color:var(--text-muted);
        text-transform:uppercase; letter-spacing:.5px;
        margin-bottom:.65rem;
    }
    .sla-sections-wrap { display:flex; flex-direction:column; gap:.6rem; }

    /* ── Parent section block ── */
    .sla-parent-section {
        border: 1.5px solid var(--border-color);
        border-radius: 12px;
        overflow: hidden;
        transition: border-color .2s, box-shadow .2s;
    }
    .sla-parent-section:hover {
        border-color: rgba(148,137,121,.4);
        box-shadow: 0 2px 12px rgba(0,0,0,.1);
    }
    .sla-parent-section > .sla-policy-card.sla-card-parent {
        border: none; border-radius: 0;
        border-bottom: 1px solid var(--border-color);
        background: var(--bg-surface);
    }

    /* ── Sub cards ── */
    .sla-sub-section {
        padding: .4rem .65rem .5rem 1.25rem;
        display: flex; flex-direction: column; gap: .3rem;
        background: var(--bg-card);
    }
    .sla-card-sub {
        border: 1px solid var(--border-color) !important;
        border-radius: 9px !important;
        padding: .5rem .75rem !important;
        background: var(--bg-card) !important;
        transition: background .15s, border-color .15s;
    }
    .sla-card-sub:hover { background: var(--bg-surface) !important; }
    .sla-card-sub .sla-card-icon-wrap {
        width:26px; height:26px; font-size:.9rem;
        background:transparent; border:none; color:var(--text-muted);
    }
    .sla-card-sub .sla-card-title-name { font-size:.82rem; }
    .sla-card-sub .sla-kpi-val         { font-size:.86rem; }
    .sla-card-sub .sla-card-ola-strip  { display:none; }

    /* ── Policy card ── */
    .sla-policy-card {
        display: flex; flex-direction: column; gap: .5rem;
        padding: .85rem 1rem;
        border: 1.5px solid var(--border-color);
        border-radius: 12px;
        background: var(--bg-card);
        transition: box-shadow .2s;
    }
    .sla-policy-card:hover { box-shadow: 0 3px 14px rgba(0,0,0,.09); }
    .sla-card-has-own {
        border-color: rgba(99,102,241,.32) !important;
        background: linear-gradient(135deg, var(--bg-card), rgba(99,102,241,.04)) !important;
    }

    /* Card row 1 */
    .sla-card-row1 { display:flex; align-items:center; gap:.7rem; min-width:0; }
    .sla-card-icon-wrap {
        width:38px; height:38px; font-size:1.35rem;
        display:flex; align-items:center; justify-content:center;
        background:var(--bg-surface); border:1px solid var(--border-color);
        border-radius:9px; flex-shrink:0;
    }
    .sla-card-title-wrap { flex:1; min-width:0; }
    .sla-card-title-name {
        font-weight:700; font-size:.88rem; color:var(--text-primary);
        white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
    }
    .sla-policy-badge {
        display:inline-block; font-size:.66rem; font-weight:700;
        padding:.12rem .45rem; border-radius:20px; margin-top:.18rem;
    }
    .sla-badge-own     { background:rgba(99,102,241,.13); color:#818cf8; border:1px solid rgba(99,102,241,.25); }
    .sla-badge-default { background:var(--bg-surface); color:var(--text-muted); border:1px solid var(--border-color); }
    .sla-badge-inherit { background:rgba(16,185,129,.1); color:#34d399; border:1px solid rgba(16,185,129,.2); }

    /* KPI chips */
    .sla-card-kpis {
        display:flex; align-items:center; gap:.35rem; flex-shrink:0;
        background:var(--bg-surface); border:1px solid var(--border-color);
        border-radius:8px; padding:.28rem .55rem;
    }
    .sla-kpi { text-align:center; min-width:32px; }
    .sla-kpi-val { font-size:.92rem; font-weight:800; color:var(--text-primary); line-height:1; }
    .sla-kpi-unit { font-size:.58rem; font-weight:600; color:var(--text-muted); }
    .sla-kpi-lbl  { font-size:.58rem; color:var(--text-muted); margin-top:.1rem; }
    .sla-kpi-sep  { width:1px; height:26px; background:var(--border-color); }

    /* Action buttons */
    .sla-card-btns { display:flex; gap:.3rem; flex-shrink:0; }
    .sla-action-btn {
        display:inline-flex; align-items:center; gap:.3rem;
        padding:.3rem .68rem; border-radius:7px; font-size:.75rem; font-weight:700;
        border:1.5px solid; cursor:pointer; font-family:inherit; transition:all .15s;
        white-space:nowrap; line-height:1.4;
    }
    .sla-action-edit   { border-color:rgba(99,102,241,.3); color:#818cf8; background:rgba(99,102,241,.06); }
    .sla-action-edit:hover { background:rgba(99,102,241,.14); border-color:#818cf8; }
    .sla-action-create { border-color:rgba(16,185,129,.3); color:#34d399; background:rgba(16,185,129,.06); }
    .sla-action-create:hover { background:rgba(16,185,129,.13); border-color:#34d399; }
    .sla-action-del    { border-color:rgba(239,68,68,.25); color:var(--accent-red); background:transparent; padding:.3rem .5rem; }
    .sla-action-del:hover { background:rgba(239,68,68,.08); border-color:var(--accent-red); }

    /* OLA Pills strip */
    .sla-card-ola-strip {
        display:flex; flex-wrap:wrap; gap:.28rem;
        padding-top:.35rem;
        border-top:1px solid var(--border-color);
    }
    .sla-ola-pill {
        display:flex; align-items:center; gap:.28rem;
        background:var(--bg-surface); border:1px solid var(--border-color);
        border-radius:5px; padding:.16rem .45rem;
        transition: border-color .15s;
    }
    .sla-ola-pill:hover { border-color:var(--pill-color, var(--accent-blue)); }
    .sla-ola-pill-label { font-size:.62rem; color:var(--text-muted); }
    .sla-ola-pill-val   { font-size:.73rem; font-weight:800; color:var(--pill-color, var(--accent-blue)); }

    /* ══════════════════════════════════
       محرر السياسة
       ══════════════════════════════════ */
    .sla-editor-hint {
        background:rgba(59,130,246,.07); border:1px solid rgba(59,130,246,.15);
        border-radius:9px; padding:.65rem .9rem;
        font-size:.82rem; color:var(--text-secondary);
        margin-bottom:1rem; line-height:1.65;
    }
    .sla-editor-section { margin-bottom:1.1rem; }
    .sla-editor-section-title {
        font-weight:700; font-size:.88rem; margin-bottom:.65rem;
        color:var(--text-primary);
        display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:.4rem;
    }
    .sla-editor-row2 { display:grid; grid-template-columns:1fr 1fr; gap:.85rem; }

    .sla-ola-editor-table { width:100%; border-collapse:collapse; }
    .sla-ola-editor-table thead th {
        text-align:right; font-size:.74rem; font-weight:700; color:var(--text-muted);
        padding:.4rem .6rem; background:var(--bg-surface);
        border-bottom:1.5px solid var(--border-color); white-space:nowrap;
    }
    .sla-ola-editor-row td { padding:.44rem .6rem; border-bottom:1px solid var(--border-color); vertical-align:middle; }
    .sla-ola-editor-row:last-child td { border-bottom:none; }
    .sla-ola-editor-row:hover { background:var(--bg-surface); }

    .sla-stage-cell { display:flex; align-items:center; gap:.5rem; }
    .sla-stage-emoji { font-size:1rem; }
    .sla-stage-name  { font-weight:600; font-size:.84rem; color:var(--text-primary); }
    .sla-stage-color-dot { width:6px; height:6px; border-radius:50%; opacity:.85; }

    .sla-input-pill { display:flex; align-items:center; gap:.35rem; }
    .sla-input-pill span { font-size:.78rem; color:var(--text-muted); white-space:nowrap; }
    .sla-num-inp {
        width:70px !important; padding:.3rem .5rem !important;
        font-size:.85rem !important; text-align:center;
        border-radius:7px !important;
    }
    .sla-num-inp:focus { border-color:var(--accent-blue) !important; }

    .sla-editor-footer {
        display:flex; gap:.65rem; padding-top:.65rem;
        border-top:1px solid var(--border-color);
        flex-wrap:wrap;
    }

    /* ── OLA sum badge ── */
    .sla-ola-sum-badge {
        font-size:.75rem; font-weight:600; color:var(--text-muted);
        background:var(--bg-surface); border:1px solid var(--border-color);
        padding:.2rem .65rem; border-radius:20px; transition:all .2s;
    }
    .sla-ola-sum-ok   { background:rgba(16,185,129,.1); color:#34d399; border-color:rgba(16,185,129,.3); }
    .sla-ola-sum-over {
        background:rgba(239,68,68,.1); color:var(--accent-red); border-color:rgba(239,68,68,.32);
        animation: sla-pulse .6s ease infinite alternate;
    }
    @keyframes sla-pulse { from { opacity:.65; } to { opacity:1; } }

    .sla-ola-overflow-alert {
        display:flex; align-items:flex-start; gap:.5rem;
        background:rgba(239,68,68,.08); border:1.5px solid rgba(239,68,68,.3);
        border-radius:9px; padding:.65rem .9rem;
        font-size:.82rem; font-weight:600; color:var(--accent-red);
        margin:.5rem 0;
        animation: sla-slide-in .2s ease;
    }
    @keyframes sla-slide-in { from { opacity:0; transform:translateY(-4px); } to { opacity:1; transform:none; } }
    `;
    document.head.appendChild(s);
})();
// ══════════════════════════════════════════════════════════════
// نظام SLA المركزي الجديد — يغطي المعاملات + الشراء + الحجوزات
// ══════════════════════════════════════════════════════════════

var SlaC = {
    activeSystem: 'purchase',
    policies: {},  // { system: [policies] }
};

async function loadSlaCentralPage() {
    DOM.mainContent.innerHTML = `
    <div class="performance-page">
        <div class="perf-header">
            <div class="perf-header-content">
                <div class="perf-title">
                    <div class="perf-icon" style="background:var(--btn-primary-bg);display:flex;align-items:center;justify-content:center;width:48px;height:48px;border-radius:12px">
                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--btn-primary-text)" stroke-width="2">
                            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                        </svg>
                    </div>
                    <div>
                        <h1>نظام SLA المركزي</h1>
                        <p>إدارة مستويات الخدمة — المعاملات المالية، طلبات الشراء، حجوزات الموازنة</p>
                    </div>
                </div>
                <div class="perf-header-stats">
                    <div class="header-stat">
                        <span class="stat-number" id="slac-breach" style="color:var(--accent-red)">—</span>
                        <span class="stat-label">تجاوزات نشطة</span>
                    </div>
                    <div class="header-stat">
                        <span class="stat-number" id="slac-warn" style="color:#f59e0b">—</span>
                        <span class="stat-label">تحذيرات</span>
                    </div>
                    <div class="header-stat">
                        <span class="stat-number" id="slac-active" style="color:var(--accent-green)">—</span>
                        <span class="stat-label">نشطة ضمن المدة</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- تبويبات الأنظمة -->
        <div class="perf-tabs" id="slac-sys-tabs">
            <button class="perf-tab" onclick="slacSwitchSystem('transactions',this)">📊 المعاملات المالية</button>
            <button class="perf-tab active" onclick="slacSwitchSystem('purchase',this)">📋 طلبات الشراء</button>
            <button class="perf-tab" onclick="slacSwitchSystem('reservations',this)">📅 حجوزات الموازنة</button>
            <button class="perf-tab" onclick="slacSwitchSystem('breaches',this)">⚠️ سجل التجاوزات</button>
        </div>

        <!-- محتوى التبويب -->
        <div id="slac-content" style="margin-top:1rem"></div>
    </div>`;

    await slacLoadStats();
    await slacSwitchSystem('purchase', document.querySelector('#slac-sys-tabs .perf-tab.active'));
}

async function slacLoadStats() {
    try {
        var r = await fetch('api/sla_central.php?action=dashboard_stats');
        var d = await r.json();
        if (!d.success) return;
        var totalBreach = 0, totalWarn = 0, totalActive = 0;
        Object.values(d.data).forEach(function (s) {
            totalBreach += s.breach || 0;
            totalWarn += s.warning || 0;
            totalActive += Math.max(0, (s.active || 0) - (s.breach || 0) - (s.warning || 0));
        });
        var el = function (id) { return document.getElementById(id); };
        if (el('slac-breach')) el('slac-breach').textContent = totalBreach;
        if (el('slac-warn')) el('slac-warn').textContent = totalWarn;
        if (el('slac-active')) el('slac-active').textContent = totalActive;
    } catch (e) { }
}

async function slacSwitchSystem(system, btn) {
    SlaC.activeSystem = system;
    document.querySelectorAll('#slac-sys-tabs .perf-tab').forEach(function (t) { t.classList.remove('active'); });
    if (btn) btn.classList.add('active');

    var cont = document.getElementById('slac-content');
    if (!cont) return;

    if (system === 'breaches') {
        await slacLoadBreaches(cont);
        return;
    }

    cont.innerHTML = '<div class="loading-inline">⏳ جاري التحميل...</div>';
    try {
        var r = await fetch('api/sla_central.php?action=get_policies&system=' + system);
        var d = await r.json();
        if (!d.success) { cont.innerHTML = '<div style="color:var(--accent-red);padding:1rem">خطأ في التحميل</div>'; return; }
        SlaC.policies[system] = d.data;
        slacRenderPolicies(cont, system, d.data);
    } catch (e) {
        cont.innerHTML = '<div style="color:var(--accent-red);padding:1rem">خطأ في الاتصال</div>';
    }
}

function slacRenderPolicies(cont, system, policies) {
    var sysLabels = { transactions: tr('المعاملات المالية'), purchase: tr('طلبات الشراء'), reservations: tr('حجوزات الموازنة') };

    var html = '<div class="slac-wrap">'
        + '<div class="slac-header">'
        + '<div class="slac-header-title">⚙️ إعدادات SLA / OLA — ' + (sysLabels[system] || system) + '</div>'
        + '<button class="btn btn-primary btn-sm" onclick="slacSaveAll(\'' + system + '\')">'
        + '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>'
        + ' حفظ التعديلات</button>'
        + '</div>';

    // ── SLA ──────────────────────────────────────────────────
    html += '<div class="slac-section-title">⏱ SLA — الوقت الكلي المسموح لإنجاز المرحلة</div>'
        + '<table class="slac-table"><thead><tr>'
        + '<th>المرحلة</th>'
        + '<th style="width:140px">المدة الكلية</th>'
        + '<th style="width:95px">تحذير %</th>'
        + '<th style="width:95px">تصعيد %</th>'
        + '</tr></thead><tbody>';

    policies.forEach(function (p) {
        var slaH = p.sla_hours || p.allowed_hours || 24;
        var slaW = p.sla_warning_pct || p.warning_pct || 70;
        var slaE = p.sla_escalate_pct || p.escalate_pct || 100;
        html += '<tr data-id="' + p.id + '">'
            + '<td><span class="slac-stage-name">' + (p.stage_label || p.stage_name) + '</span>'
            + '<br><code class="slac-stage-code">' + p.stage_name + '</code></td>'
            + '<td><div style="display:flex;align-items:center;gap:5px">'
            + '<input type="number" class="slac-inp" data-field="sla_hours" value="' + slaH + '" min="0" step="0.5" style="width:65px">'
            + '<span class="slac-unit">ساعة</span></div></td>'
            + '<td><div style="display:flex;align-items:center;gap:3px">'
            + '<input type="number" class="slac-inp" data-field="sla_warning_pct" value="' + slaW + '" min="0" max="100" style="width:52px">'
            + '<span class="slac-unit">%</span></div></td>'
            + '<td><div style="display:flex;align-items:center;gap:3px">'
            + '<input type="number" class="slac-inp" data-field="sla_escalate_pct" value="' + slaE + '" min="0" max="100" style="width:52px">'
            + '<span class="slac-unit">%</span></div></td>'
            + '</tr>';
    });
    html += '</tbody></table>';

    // ── OLA ──────────────────────────────────────────────────
    html += '<div class="slac-section-title" style="border-top:1px solid var(--border-color)">'
        + '👁 OLA — وقت الانتظار قبل الاستلام · وقت المعالجة بعد الاستلام</div>'
        + '<table class="slac-table"><thead><tr>'
        + '<th>المرحلة</th>'
        + '<th style="width:130px">انتظار قبل الاستلام</th>'
        + '<th style="width:130px">معالجة بعد الاستلام</th>'
        + '<th style="width:95px">تحذير %</th>'
        + '<th style="width:95px">تصعيد %</th>'
        + '</tr></thead><tbody>';

    policies.forEach(function (p) {
        var olaW = p.ola_wait_hours || 2;
        var olaP = p.ola_process_hours || 22;
        var olaWP = p.ola_warning_pct || 70;
        var olaEP = p.ola_escalate_pct || 100;
        html += '<tr data-id-ola="' + p.id + '">'
            + '<td><span class="slac-stage-name">' + (p.stage_label || p.stage_name) + '</span></td>'
            + '<td><div style="display:flex;align-items:center;gap:5px">'
            + '<input type="number" class="slac-inp" data-field="ola_wait_hours" value="' + olaW + '" min="0" step="0.5" style="width:55px">'
            + '<span class="slac-unit">ساعة</span></div></td>'
            + '<td><div style="display:flex;align-items:center;gap:5px">'
            + '<input type="number" class="slac-inp" data-field="ola_process_hours" value="' + olaP + '" min="0" step="0.5" style="width:55px">'
            + '<span class="slac-unit">ساعة</span></div></td>'
            + '<td><div style="display:flex;align-items:center;gap:3px">'
            + '<input type="number" class="slac-inp" data-field="ola_warning_pct" value="' + olaWP + '" min="0" max="100" style="width:52px">'
            + '<span class="slac-unit">%</span></div></td>'
            + '<td><div style="display:flex;align-items:center;gap:3px">'
            + '<input type="number" class="slac-inp" data-field="ola_escalate_pct" value="' + olaEP + '" min="0" max="100" style="width:52px">'
            + '<span class="slac-unit">%</span></div></td>'
            + '</tr>';
    });

    html += '</tbody></table>'
        + '<div class="slac-hint" style="border-top:1px solid var(--border-color);border-bottom:none;border-radius:0 0 12px 12px">'
        + 'SLA: من وصول المرحلة · OLA انتظار: من الوصول حتى استلام المسؤول · OLA معالجة: من الاستلام حتى الإنجاز'
        + '</div></div>';

    cont.innerHTML = html;
    slacInjectStyles();
}


async function slacSaveAll(system) {
    // جمع صفوف SLA
    var slaRows = document.querySelectorAll('#slac-content .slac-table tbody tr[data-id]');
    // جمع صفوف OLA
    var olaRows = document.querySelectorAll('#slac-content .slac-table tbody tr[data-id-ola]');

    // بناء map: id -> policy object
    var pMap = {};

    slaRows.forEach(function (row) {
        var id = parseInt(row.dataset.id); if (!id) return;
        if (!pMap[id]) pMap[id] = { id: id };
        row.querySelectorAll('.slac-inp').forEach(function (inp) {
            var f = inp.dataset.field, v = parseFloat(inp.value) || 0;
            pMap[id][f] = v;
        });
    });

    olaRows.forEach(function (row) {
        var id = parseInt(row.dataset.idOla); if (!id) return;
        if (!pMap[id]) pMap[id] = { id: id };
        row.querySelectorAll('.slac-inp').forEach(function (inp) {
            var f = inp.dataset.field, v = parseFloat(inp.value) || 0;
            pMap[id][f] = v;
        });
    });

    var policies = Object.values(pMap);
    if (!policies.length) { showToast('لا توجد سياسات للحفظ', 'warning'); return; }

    try {
        var r = await fetch('api/sla_central.php?action=save_policies_bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ policies: policies })
        });
        var d = await r.json();
        if (d.success) {
            showToast('✅ تم حفظ إعدادات SLA', 'success');
        } else {
            showToast('❌ ' + (d.message || 'خطأ'), 'error');
        }
    } catch (e) {
        showToast('❌ خطأ في الاتصال', 'error');
    }
}

async function slacLoadBreaches(cont) {
    cont.innerHTML = '<div class="loading-inline">⏳</div>';
    try {
        var r = await fetch('api/sla_central.php?action=breaches&limit=100');
        var d = await r.json();
        if (!d.success || !d.data.length) {
            cont.innerHTML = '<div class="empty-state-sm" style="padding:2rem">لا توجد تجاوزات مسجلة</div>';
            return;
        }
        var sysLabels = { transactions: 'المعاملات', purchase: tr('طلبات الشراء'), reservations: 'الحجوزات' };
        var html = '<table class="slac-table"><thead><tr>'
            + '<th>النظام</th><th>المرحلة</th><th>النسبة</th><th>النوع</th><th>الوقت</th>'
            + '</tr></thead><tbody>';
        d.data.forEach(function (b) {
            var typeColor = b.breach_type === 'escalation' ? '#ef4444' : '#f59e0b';
            var typeLabel = b.breach_type === 'escalation' ? '🔴 تصعيد' : '⚠️ تحذير';
            html += '<tr>'
                + '<td><span class="slac-sys-badge">' + (sysLabels[b.system_type] || b.system_type) + '</span></td>'
                + '<td>' + b.stage_name + '</td>'
                + '<td><span style="color:' + typeColor + ';font-weight:600">' + parseFloat(b.elapsed_pct).toFixed(1) + '%</span></td>'
                + '<td><span style="color:' + typeColor + '">' + typeLabel + '</span></td>'
                + '<td style="font-size:.78rem;color:var(--text-muted)">' + (b.notified_at || '—') + '</td>'
                + '</tr>';
        });
        html += '</tbody></table>';
        cont.innerHTML = '<div class="slac-wrap">' + html + '</div>';
        slacInjectStyles();
    } catch (e) {
        cont.innerHTML = '<div style="color:var(--accent-red);padding:1rem">خطأ في التحميل</div>';
    }
}

function slacInjectStyles() {
    if (document.getElementById('slac-css')) return;
    var s = document.createElement('style'); s.id = 'slac-css';
    s.textContent = [
        '.slac-wrap{background:var(--bg-card);border:1px solid var(--border-color);border-radius:12px;overflow:hidden}',
        '.slac-header{display:flex;align-items:center;justify-content:space-between;padding:.85rem 1rem;border-bottom:1px solid var(--border-color);background:var(--bg-surface)}',
        '.slac-header-title{font-size:.9rem;font-weight:600;color:var(--text-primary)}',
        '.slac-hint{font-size:.75rem;color:var(--text-muted);padding:.5rem 1rem;background:var(--bg-surface);border-bottom:1px solid var(--border-color)}',
        '.slac-table{width:100%;border-collapse:collapse;font-size:.82rem}',
        '.slac-table th{text-align:right;padding:.55rem 1rem;background:var(--bg-surface);color:var(--text-muted);font-weight:600;font-size:.74rem;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid var(--border-color)}',
        '.slac-table td{padding:.55rem 1rem;border-bottom:1px solid var(--border-color);vertical-align:middle}',
        '.slac-table tbody tr:last-child td{border-bottom:none}',
        '.slac-table tbody tr:hover td{background:var(--bg-surface)}',
        '.slac-stage-name{font-weight:500;color:var(--text-primary);display:block}',
        '.slac-stage-code{font-size:.7rem;color:var(--text-muted);font-family:monospace}',
        '.slac-inp{padding:4px 8px;border-radius:6px;border:1px solid var(--border-color);background:var(--bg-card);color:var(--text-primary);font-family:inherit;font-size:.82rem;text-align:center;outline:none;transition:border-color .15s}',
        '.slac-inp:focus{border-color:var(--btn-primary-bg)}',
        '.slac-unit{font-size:.72rem;color:var(--text-muted);flex-shrink:0}',
        '.slac-status-dot{font-size:.72rem;padding:2px 8px;border-radius:8px;font-weight:600}',
        '.slac-status-dot.on{background:rgba(64,192,87,.12);color:#40c057}',
        '.slac-status-dot.off{background:rgba(239,68,68,.1);color:#ef4444}',
        '.slac-sys-badge{font-size:.72rem;padding:2px 8px;border-radius:8px;background:var(--bg-surface);border:1px solid var(--border-color);color:var(--text-muted)}',
        '.slac-section-title{font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);padding:.55rem 1rem;background:var(--bg-surface)}',
        'code.slac-stage-code{font-family:monospace;font-size:.68rem;color:var(--text-muted);display:inline-block;margin-top:2px}',
    ].join('');
    document.head.appendChild(s);
}