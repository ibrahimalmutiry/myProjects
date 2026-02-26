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
    DOM.modalTitle.textContent = '🕒 تفاصيل SLA / OLA للمعاملة';
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

function renderSlaDetailModal(d) {
    const statusColor = {
        ok: 'var(--accent-green)', warning: 'var(--accent-orange)', breached: 'var(--accent-red)'
    };
    const statusLabel = { ok: '✅ ضمن المدة', warning: '⚠️ تحذير', breached: '🔴 خرق' };

    const slaBarPct = Math.min(d.sla_pct, 100);
    const slaColor = statusColor[d.sla_status] || 'var(--text-muted)';

    const stagesHtml = (d.stages || []).map(st => {
        const isDone = st.status === 'done';
        const pct = Math.min(st.pct, 150);
        const barW = Math.min(st.pct, 100);
        const color = st.status === 'breached' ? 'var(--accent-red)'
            : st.status === 'warning' ? 'var(--accent-orange)'
                : isDone ? 'var(--accent-green)'
                    : st.status === 'active' ? 'var(--accent-blue)'
                        : 'var(--text-muted)';

        const elapsedLabel = st.elapsed_min >= 60
            ? `${(st.elapsed_min / 60).toFixed(1)} ساعة`
            : `${st.elapsed_min} دقيقة`;

        // ── مساعد: تنسيق الدقائق ───────────────────────────────
        const fmtMin = (m) => {
            if (!m && m !== 0) return '—';
            if (m === 0) return 'أقل من دقيقة';
            if (m < 60) return m + ' دقيقة';
            const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mn = m % 60;
            if (d > 0) return d + ' يوم' + (h > 0 ? ' و ' + h + ' س' : '');
            return h + ' س' + (mn > 0 ? ' و ' + mn + ' د' : '');
        };

        if (isDone) {
            return `
            <div style="position:relative;background:rgba(64,192,87,0.06);border-radius:10px;
                        padding:1rem;margin-bottom:.75rem;
                        border:1px solid rgba(64,192,87,0.3);overflow:hidden">
                <div style="position:absolute;left:14px;top:50%;transform:translateY(-50%) rotate(-12deg);
                            font-size:2rem;font-weight:900;color:rgba(64,192,87,0.1);
                            letter-spacing:1px;pointer-events:none;user-select:none">تمت ✓</div>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.6rem">
                    <div style="display:flex;align-items:center;gap:.5rem">
                        <span style="background:var(--accent-green);color:#fff;border-radius:6px;
                                     padding:2px 8px;font-size:.75rem;font-weight:700">✓ تمت</span>
                        <span style="font-weight:700;color:var(--text-primary)">${st.label}</span>
                    </div>
                    <div style="font-size:.82rem;color:var(--text-muted)">${st.employee !== '—' ? '👤 ' + st.employee : ''}</div>
                </div>
                <!-- أوقات التفصيل -->
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:.4rem;margin-bottom:.6rem;font-size:.8rem">
                    ${st.waiting_min > 0 ? `<div style="background:rgba(100,100,100,0.08);border-radius:6px;padding:.4rem .6rem">
                        <div style="color:var(--text-muted)">⏳ انتظار الاستلام</div>
                        <div style="font-weight:600;color:var(--text-secondary)">${fmtMin(st.waiting_min)}</div>
                    </div>` : ''}
                    <div style="background:rgba(64,192,87,0.1);border-radius:6px;padding:.4rem .6rem">
                        <div style="color:var(--text-muted)">⚙️ وقت المعالجة (OLA)</div>
                        <div style="font-weight:700;color:var(--accent-green)">${fmtMin(st.elapsed_min)}</div>
                    </div>
                </div>
                <div style="background:rgba(64,192,87,0.15);border-radius:4px;height:6px;overflow:hidden;margin-bottom:.4rem">
                    <div style="height:100%;width:100%;background:linear-gradient(90deg,#40c057,#69db7c)"></div>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:.78rem;color:var(--text-muted)">
                    <span>${pct}% من الوقت المسموح</span>
                    <span>مسموح: ${st.allowed_hrs} ساعة</span>
                </div>
            </div>`;
        }

        // ── في الانتظار (لم يُستلم بعد) ───────────────────────────
        if (st.status === 'waiting') {
            const waitLabel = fmtMin(st.waiting_min);
            return `
            <div style="background:var(--bg-surface);border-radius:10px;padding:1rem;margin-bottom:.75rem;
                        border-right:3px solid var(--text-muted);opacity:.75">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.4rem">
                    <div style="font-weight:600;color:var(--text-muted)">⏳ ${st.label}</div>
                    <span style="font-size:.78rem;color:var(--text-muted)">في الانتظار</span>
                </div>
                <div style="font-size:.8rem;color:var(--text-muted)">لم يُستلم بعد — انتظار: ${waitLabel}</div>
            </div>`;
        }

        // ── مُصعَّدة ──────────────────────────────────────────────
        if (st.status === 'escalated') {
            return `
            <div style="background:rgba(255,107,107,0.06);border-radius:10px;padding:1rem;margin-bottom:.75rem;
                        border:1px solid rgba(255,107,107,0.3)">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.6rem">
                    <div style="display:flex;align-items:center;gap:.5rem">
                        <span style="background:var(--accent-red);color:#fff;border-radius:6px;
                                     padding:2px 8px;font-size:.75rem;font-weight:700">🔴 مُصعَّد</span>
                        <span style="font-weight:700;color:var(--text-primary)">${st.label}</span>
                    </div>
                    <div style="font-size:.82rem;color:var(--text-muted)">${st.employee !== '—' ? '👤 ' + st.employee : ''}</div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:.4rem;margin-bottom:.6rem;font-size:.78rem">
                    ${st.waiting_min > 0 ? `<div style="background:rgba(100,100,100,0.08);border-radius:6px;padding:.4rem .5rem">
                        <div style="color:var(--text-muted)">⏳ انتظار</div>
                        <div style="font-weight:600">${fmtMin(st.waiting_min)}</div>
                    </div>` : '<div></div>'}
                    <div style="background:rgba(255,107,107,0.1);border-radius:6px;padding:.4rem .5rem">
                        <div style="color:var(--text-muted)">⚙️ وقت OLA</div>
                        <div style="font-weight:700;color:var(--accent-red)">${fmtMin(st.elapsed_min)}</div>
                    </div>
                    ${st.post_escalation_min != null ? `<div style="background:rgba(255,150,0,0.1);border-radius:6px;padding:.4rem .5rem">
                        <div style="color:var(--text-muted)">🔔 بعد التصعيد</div>
                        <div style="font-weight:700;color:var(--accent-orange)">${fmtMin(st.post_escalation_min)}</div>
                    </div>` : '<div></div>'}
                </div>
                <div style="font-size:.78rem;color:var(--accent-red)">تجاوز OLA (${pct}%) — تم التصعيد للمشرف</div>
            </div>`;
        }

        // ── نشطة أو تحذير أو تجاوز──────────────────────────────────
        const stageIcon = { breached: '🔴', warning: '⚠️', active: '🔵', pending: '⚪' }[st.status] || '⚪';
        return `
        <div style="background:var(--bg-surface);border-radius:10px;padding:1rem;margin-bottom:.75rem;
                    border-right:3px solid ${color}">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">
                <div style="font-weight:600">${stageIcon} ${st.label}</div>
                <div style="font-size:.85rem;color:var(--text-muted)">${st.employee !== '—' ? '👤 ' + st.employee : st.employee}</div>
            </div>
            <!-- وقت الانتظار إن وُجد -->
            ${st.waiting_min > 0 ? `<div style="font-size:.78rem;color:var(--text-muted);margin-bottom:.4rem;
                background:rgba(100,100,100,0.06);border-radius:5px;padding:3px 8px">
                ⏳ انتظار الاستلام: ${fmtMin(st.waiting_min)}
            </div>` : ''}
            <div style="background:var(--bg-card);border-radius:4px;height:10px;overflow:hidden;margin-bottom:.4rem">
                <div style="background:${color};height:100%;width:${barW}%;transition:width .5s"></div>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:.8rem">
                <span style="color:${color};font-weight:600">⚙️ ${elapsedLabel} (${pct}%)</span>
                <span style="color:var(--text-muted)">من ${st.allowed_hrs} ساعة مسموح</span>
            </div>
            ${st.pct >= st.warn_pct
                ? `<div style="margin-top:.4rem;font-size:.78rem;color:${color};background:${color}18;padding:3px 8px;border-radius:4px">
                    ${st.status === 'breached' ? '🔴 تجاوز OLA — سيُصعَّد قريباً' : '⚠️ قرب الانتهاء — سيُصعَّد قريباً'}
                  </div>` : ''}
        </div>`;
    }).join('');

    const elapsed = d.total_elapsed >= 60
        ? `${(d.total_elapsed / 60).toFixed(1)} ساعة`
        : `${d.total_elapsed} دقيقة`;
    const allowed = d.sla_total_min >= 60
        ? `${(d.sla_total_min / 60).toFixed(1)} ساعة`
        : `${d.sla_total_min} دقيقة`;

    return `
    <!-- SLA الكلي -->
    <div style="background:var(--bg-surface);border-radius:12px;padding:1.25rem;margin-bottom:1.25rem;
                border:2px solid ${slaColor}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem">
            <div style="font-size:1.05rem;font-weight:700">⏱ SLA الكلي</div>
            <div style="color:${slaColor};font-weight:700;font-size:1.1rem">${statusLabel[d.sla_status] || d.sla_status}</div>
        </div>
        <div style="background:var(--bg-card);border-radius:6px;height:14px;overflow:hidden;margin-bottom:.5rem">
            <div style="background:${slaColor};height:100%;width:${slaBarPct}%;transition:width .5s"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:.85rem">
            <span style="color:${slaColor};font-weight:600">${elapsed} منقضية (${d.sla_pct}%)</span>
            <span style="color:var(--text-muted)">${allowed} مسموح</span>
        </div>
    </div>

    <!-- مراحل OLA -->
    <div style="font-weight:700;margin-bottom:.75rem;color:var(--text-primary)">📊 تفاصيل OLA لكل مرحلة</div>
    ${stagesHtml}

    <div style="margin-top:1rem;text-align:left">
        <button class="btn btn-secondary" onclick="closeModal()">إغلاق</button>
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
            loadSlaStats();
            loadSlaDashboard();
            loadSlaBreaches();
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
        if (data.success) {
            showToast('تم تعليمه كمحلول ✓', 'success');
            loadSlaBreaches();
            loadSlaStats();
        }
    } catch (e) { showToast('خطأ', 'error'); }
}

// ─── مودال إعدادات SLA ───────────────────────────────────────
async function openSlaSettingsModal() {
    DOM.modalTitle.textContent = '⚙️ إعدادات SLA / OLA';
    DOM.modalBody.innerHTML = '<div class="loading-placeholder" style="padding:1.5rem;text-align:center">جارٍ التحميل...</div>';
    openModal();

    try {
        const res = await fetch('api/?action=sla_policies');
        const data = await res.json();
        if (!data.success) return;

        const policies = data.data;
        if (!policies.length) {
            DOM.modalBody.innerHTML = renderSlaSettingsEmpty();
            return;
        }

        // نعرض أول سياسة (يمكن توسيعه لاحقاً)
        const p = policies[0];
        DOM.modalBody.innerHTML = renderSlaSettingsForm(p);
    } catch (e) {
        DOM.modalBody.innerHTML = '<div style="color:var(--accent-red)">خطأ في التحميل</div>';
    }
}

function renderSlaSettingsForm(policy) {
    const stageOrder = ['receiving', 'budget', 'payment', 'invoice'];
    const stageLabels = { receiving: 'الاستلام', budget: 'الموازنة', payment: 'الدفع', invoice: 'الفوترة' };

    const olaByStage = {};
    (policy.ola_rules || []).forEach(r => olaByStage[r.stage] = r);

    const olaRows = stageOrder.map(stage => {
        const r = olaByStage[stage] || {};
        return `
        <tr>
            <td style="font-weight:600">${stageLabels[stage]}</td>
            <td>
                <input type="number" step="0.5" min="0.5"
                    class="form-input ola-hours" data-stage="${stage}"
                    value="${r.allowed_hours || 4}" style="width:80px">
                <span style="font-size:.82rem;color:var(--text-muted)"> ساعة</span>
            </td>
            <td>
                <input type="number" min="10" max="90"
                    class="form-input ola-warn" data-stage="${stage}"
                    value="${r.warn_at_pct || 50}" style="width:65px">
                <span style="font-size:.82rem;color:var(--text-muted)"> %</span>
            </td>
            <td>
                <input type="number" min="50" max="200"
                    class="form-input ola-esc" data-stage="${stage}"
                    value="${r.escalate_pct || 100}" style="width:65px">
                <span style="font-size:.82rem;color:var(--text-muted)"> %</span>
            </td>
        </tr>`;
    }).join('');

    return `
    <div style="margin-bottom:1.25rem">
        <div style="background:rgba(59,130,246,.08);border-radius:10px;padding:.85rem 1rem;font-size:.87rem;color:var(--text-muted);margin-bottom:1rem">
            <strong>SLA:</strong> الوقت الكلي لإنجاز المعاملة من البداية للنهاية.<br>
            <strong>OLA:</strong> الوقت المسموح لكل موظف في مرحلته — مجموعها يجب ألا يتجاوز SLA.
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
        <thead>
            <tr>
                <th>المرحلة</th>
                <th>الوقت المسموح</th>
                <th>تحذير عند %</th>
                <th>تصعيد عند %</th>
            </tr>
        </thead>
        <tbody>${olaRows}</tbody>
    </table>

    <div style="display:flex;gap:.75rem;justify-content:flex-end">
        <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
        <button class="btn btn-primary" onclick="saveSlaSettings(${policy.id})">
            💾 حفظ الإعدادات
        </button>
    </div>`;
}

async function saveSlaSettings(policyId) {
    const totalHours = parseFloat(document.getElementById('slaTotalHours')?.value || 24);
    const warnPct = parseInt(document.getElementById('slaWarnPct')?.value || 80);

    // حفظ SLA
    const slaRes = await fetch('api/?action=sla_save_policy', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            id: policyId, total_hours: totalHours, warning_pct: warnPct,
            name: 'السياسة الافتراضية'
        })
    });
    const slaData = await slaRes.json();
    if (!slaData.success) return showToast('خطأ في حفظ SLA', 'error');

    // حفظ OLA لكل مرحلة
    const olaHours = document.querySelectorAll('.ola-hours');
    let ok = 0;
    for (const inp of olaHours) {
        const stage = inp.dataset.stage;
        const hours = parseFloat(inp.value);
        const warnEl = document.querySelector(`.ola-warn[data-stage="${stage}"]`);
        const escEl = document.querySelector(`.ola-esc[data-stage="${stage}"]`);
        const warn = parseInt(warnEl?.value || 50);
        const esc = parseInt(escEl?.value || 100);

        const r = await fetch('api/?action=sla_save_ola_rule', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sla_policy_id: policyId, stage,
                stage_label: { receiving: 'الاستلام', budget: 'الموازنة', payment: 'الدفع', invoice: 'الفوترة' }[stage] || stage,
                allowed_hours: hours, warn_at_pct: warn, escalate_pct: esc
            })
        });
        const d = await r.json();
        if (d.success) ok++;
    }

    showToast(`تم الحفظ — SLA + ${ok} قاعدة OLA ✓`, 'success');
    closeModal();
    loadSlaStats();
}

// ─── CSS مضمّن للـ SLA ────────────────────────────────────────
(function injectSlaStyles() {
    if (document.getElementById('sla-styles')) return;
    const s = document.createElement('style');
    s.id = 'sla-styles';
    s.textContent = `
        .sla-stats-bar {
            display: flex;
            gap: 1rem;
            align-items: center;
            flex-wrap: wrap;
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 1rem 1.25rem;
        }
        .sla-stat { text-align: center; min-width: 90px; }
        .sla-stat-num {
            font-size: 1.6rem;
            font-weight: 800;
            line-height: 1;
        }
        .sla-stat-label {
            font-size: .78rem;
            color: var(--text-muted);
            margin-top: 4px;
        }
        .sla-stat-breach .sla-stat-num  { color: var(--accent-red); }
        .sla-stat-warn .sla-stat-num    { color: var(--accent-orange); }
        .sla-stat-today .sla-stat-num   { color: var(--accent-blue); }
        .sla-stat-action {
            margin-right: auto;
            display: flex;
            gap: .5rem;
            flex-wrap: wrap;
        }
        .sla-tab-btn .tab-badge {
            background: var(--accent-red);
            color: #fff;
            border-radius: 10px;
            padding: 1px 6px;
            font-size: .72rem;
            font-weight: 700;
            margin-right: 4px;
        }
        tr.row-breach { background: rgba(239,68,68,.05); }
        tr.row-warn   { background: rgba(245,158,11,.05); }
    `;
    document.head.appendChild(s);
})();

// ════════════════════════════════════════════════════════════════
//  نظام الإشعارات — JS
//  إعدادات SMTP + Exchange + الإشعارات الداخلية
// ════════════════════════════════════════════════════════════════

// ─── مودال إعدادات الإشعارات الكامل ────────────────────────────

// ═══════════════════════════════════════════════════════════
//  صفحة SLA / OLA المستقلة
// ═══════════════════════════════════════════════════════════

/**
 * تحميل صفحة SLA/OLA المستقلة
 * تحتوي على: لوحة حالة SLA + سجل التجاوزات + التصعيدات البريدية
 */
async function loadSlaPage() {
    showLoading();

    DOM.mainContent.innerHTML = `
    <div class="performance-page">

        <!-- Header -->
        <div class="perf-header">
            <div class="perf-header-content">
                <div class="perf-title">
                    <div class="perf-icon" style="background: linear-gradient(135deg,#ef4444,#f97316)">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"></circle>
                            <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                    </div>
                    <div>
                        <h1>نظام SLA / OLA</h1>
                        <p>متابعة مستويات الخدمة والاتفاقيات التشغيلية</p>
                    </div>
                </div>
                <!-- إحصاءات سريعة في الهيدر -->
                <div class="perf-header-stats">
                    <div class="header-stat">
                        <span class="stat-number sla-stat-breach" id="slaBreachCount" style="color:var(--accent-red)">—</span>
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

        <!-- أزرار الإجراءات -->
        <div style="display:flex;gap:.75rem;margin-bottom:1.25rem;flex-wrap:wrap;align-items:center">
            <button class="btn btn-primary" onclick="runSlaCheck()">🔄 فحص SLA الآن</button>
            <button class="btn btn-secondary" onclick="openSlaSettingsModal()">⚙️ إعدادات SLA/OLA</button>
            <button class="btn btn-secondary" onclick="openNotifSettingsModal()">📧 إعدادات الإشعارات</button>
        </div>

        <!-- تبويبات الصفحة -->
        <div class="perf-tabs">
            <button class="perf-tab active" onclick="switchSlaPageTab('dashboard', this)">
                📋 حالة المعاملات
            </button>
            <button class="perf-tab" onclick="switchSlaPageTab('breaches', this)">
                ⚠️ سجل التجاوزات
            </button>
            <button class="perf-tab" onclick="switchSlaPageTab('escalations', this)">
                📧 التصعيدات البريدية
            </button>
        </div>

        <!-- فلاتر SLA -->
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
                <label>نوع الخرق</label>
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

        <!-- محتوى تبويب: حالة المعاملات -->
        <div id="slaPageTabDashboard" class="perf-tab-content active" style="display:block">
            <div class="perf-section">
                <div class="section-header">
                    <h3>📋 حالة SLA للمعاملات النشطة</h3>
                </div>
                <div id="slaDashboardTable" class="perf-table-container">
                    <div class="loading-placeholder">جارٍ التحميل...</div>
                </div>
            </div>
        </div>

        <!-- محتوى تبويب: سجل التجاوزات -->
        <div id="slaPageTabBreaches" class="perf-tab-content" style="display:none">
            <div class="perf-section">
                <div class="section-header">
                    <h3>⚠️ سجل التجاوزات والتصعيد</h3>
                </div>
                <div id="slaBreachLog" class="perf-table-container">
                    <div class="loading-placeholder">جارٍ التحميل...</div>
                </div>
            </div>
        </div>

        <!-- محتوى تبويب: التصعيدات البريدية -->
        <div id="slaPageTabEscalations" class="perf-tab-content" style="display:none">
            <div class="perf-section">
                <div class="section-header">
                    <h3>📧 التصعيدات المُرسلة عبر البريد الإلكتروني</h3>
                    <button class="btn btn-sm btn-primary" onclick="loadSlaEmailEscalations()">🔄 تحديث</button>
                </div>

                <!-- فلاتر التصعيدات البريدية -->
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

                <div id="slaEmailEscalationsTable" class="perf-table-container">
                    <div class="loading-placeholder">جارٍ التحميل...</div>
                </div>
            </div>
        </div>

    </div>`;

    // تحميل البيانات
    loadSlaStats();
    loadSlaDashboard();
    loadSlaBreaches();
    loadSlaEmailEscalations();
}

/**
 * تبديل تبويبات صفحة SLA
 */
function switchSlaPageTab(tab, btn) {
    // تحديث الأزرار
    document.querySelectorAll('#slaPageTabDashboard, #slaPageTabBreaches, #slaPageTabEscalations').forEach(el => {
        el.style.display = 'none';
    });
    document.querySelectorAll('.perf-tabs .perf-tab').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');

    const el = document.getElementById('slaPageTab' + tab.charAt(0).toUpperCase() + tab.slice(1));
    if (el) el.style.display = 'block';

    // تحميل البيانات عند الحاجة
    if (tab === 'escalations') loadSlaEmailEscalations();
    else if (tab === 'breaches') loadSlaBreaches();
    else if (tab === 'dashboard') loadSlaDashboard();
}

/**
 * تحميل سجل التصعيدات البريدية
 * يعرض: المعاملة + نوع التصعيد + المرسل إليه + التاريخ + الحالة
 */
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

        if (!data.success || !data.data || !data.data.length) {
            container.innerHTML = `
            <div class="empty-state-sm" style="text-align:center;padding:3rem;color:var(--text-muted)">
                <div style="font-size:3rem;margin-bottom:1rem">📭</div>
                <h4>لا توجد تصعيدات بريدية</h4>
                <p style="margin-top:.5rem;font-size:.87rem">سيتم عرض التصعيدات المُرسلة عبر البريد الإلكتروني هنا</p>
            </div>`;
            return;
        }

        container.innerHTML = renderSlaEmailEscalationsTable(data.data);
    } catch (e) {
        // إذا لم يكن الـ endpoint موجوداً بعد، نعرض رسالة مناسبة
        container.innerHTML = `
        <div class="empty-state-sm" style="text-align:center;padding:3rem;color:var(--text-muted)">
            <div style="font-size:3rem;margin-bottom:1rem">📧</div>
            <h4>سجل التصعيدات البريدية</h4>
            <p style="margin-top:.5rem;font-size:.87rem">يتم تسجيل كل بريد إلكتروني مُرسل للتصعيد هنا تلقائياً</p>
            <p style="color:var(--accent-orange);font-size:.8rem;margin-top:.5rem">⚠ تأكد من إضافة endpoint: sla_email_escalations في API</p>
        </div>`;
    }
}

/**
 * عرض جدول التصعيدات البريدية
 */
function renderSlaEmailEscalationsTable(rows) {
    const typeLabels = {
        'ola_breach': ['🔴', 'تجاوزOLA'],
        'sla_breach': ['🔴', 'تجاوزSLA'],
        'ola_warning': ['🟡', 'تحذير OLA'],
        'sla_warning': ['🟡', 'تحذير SLA'],
    };

    const statusIcon = sent => sent ? '<span style="color:var(--accent-green)">✅ مُرسل</span>'
        : '<span style="color:var(--accent-red)">❌ فشل</span>';

    return `<div class="table-wrapper">
    <table class="deposits-table">
        <thead>
            <tr>
                <th>#</th>
                <th>رقم المعاملة</th>
                <th>نوع التصعيد</th>
                <th>المرحلة</th>
                <th>المُرسَل إليه</th>
                <th>موضوع الرسالة</th>
                <th>وقت الإرسال</th>
                <th>الحالة</th>
                <th>ملاحظات</th>
            </tr>
        </thead>
        <tbody>
            ${rows.map((r, i) => {
        const [icon, label] = typeLabels[r.escalation_type] || ['⚪', r.escalation_type || '—'];
        const sentTime = r.sent_at ? new Date(r.sent_at).toLocaleString('ar-SA') : '—';
        return `
                <tr>
                    <td style="color:var(--text-muted);font-size:.82rem">${i + 1}</td>
                    <td class="dep-number">${r.transaction_number || '—'}</td>
                    <td><span style="font-weight:700">${icon} ${label}</span></td>
                    <td>${r.stage_label || r.stage || '—'}</td>
                    <td style="font-size:.85rem">${r.recipient_email || r.recipient_name || '—'}</td>
                    <td style="font-size:.82rem;color:var(--text-muted);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.email_subject || ''}">${r.email_subject || '—'}</td>
                    <td style="font-size:.82rem;color:var(--text-muted)">${sentTime}</td>
                    <td>${statusIcon(r.sent_successfully !== false && r.sent_successfully !== 0)}</td>
                    <td style="font-size:.8rem;color:var(--text-muted)">${r.notes || '—'}</td>
                </tr>`;
    }).join('')}
        </tbody>
    </table></div>`;
}