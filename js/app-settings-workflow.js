/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║   app-settings-workflow.js — إدارة قوالب سير العمل          ║
 * ║   الموافقات: إضافة / تعديل / حذف / ترتيب المراحل            ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

// ═══════════════════════════════════════════════════════════
//  حالة الوحدة
// ═══════════════════════════════════════════════════════════
const WF = {
    templates: [],          // قائمة القوالب
    activeTemplate: null,   // القالب المحدد حالياً
    stages: [],             // مراحل القالب الحالي
    roles: [],              // الأدوار المتاحة
    permRoles: [],          // مستويات الصلاحية
    departments: [],        // الأقسام
    dragSrc: null,          // عنصر السحب الحالي
    dragging: false,
};

// ═══════════════════════════════════════════════════════════
//  نقطة الدخول الرئيسية
// ═══════════════════════════════════════════════════════════
async function renderWorkflowSection() {
    const container = document.getElementById('settingsContent');
    if (!container) return;

    container.innerHTML = `
        <div class="wf-root" id="wfRoot">
            <div class="wf-loading">
                <div class="wf-spinner"></div>
                <span>جاري تحميل إعدادات سير العمل...</span>
            </div>
        </div>`;

    injectWorkflowStyles();

    try {
        await Promise.all([wfLoadTemplates(), wfLoadRoles()]);
        wfRender();
    } catch (err) {
        document.getElementById('wfRoot').innerHTML =
            `<div class="wf-error">⚠️ فشل تحميل إعدادات سير العمل: ${escapeHtml(err.message)}</div>`;
    }
}

// ═══════════════════════════════════════════════════════════
//  جلب البيانات من API
// ═══════════════════════════════════════════════════════════
async function wfLoadTemplates() {
    const res = await fetch('api/workflow_config_api.php?action=list_templates');
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'فشل جلب القوالب');
    WF.templates = data.data || [];
}

async function wfLoadRoles() {
    const res = await fetch('api/workflow_config_api.php?action=get_roles');
    const data = await res.json();
    if (data.success) {
        WF.roles = data.roles || [];
        WF.permRoles = data.perm_roles || [];
        WF.departments = data.departments || [];
    }
}

async function wfLoadStages(templateId) {
    const res = await fetch(`api/workflow_config_api.php?action=get_stages&template_id=${templateId}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'فشل جلب المراحل');
    WF.stages = data.data || [];
    WF.activeTemplate = data.template || null;
}

// ═══════════════════════════════════════════════════════════
//  الرسم الرئيسي
// ═══════════════════════════════════════════════════════════
function wfRender() {
    const root = document.getElementById('wfRoot');
    if (!root) return;

    root.innerHTML = `
        <div class="wf-layout">

            <!-- الشريط الجانبي: قائمة القوالب -->
            <div class="wf-sidebar">
                <div class="wf-sidebar-header">
                    <span class="wf-sidebar-title">مسارات الموافقة</span>
                    <button class="wf-btn wf-btn-sm wf-btn-primary" onclick="wfShowAddTemplate()">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        جديد
                    </button>
                </div>

                <div class="wf-template-list" id="wfTemplateList">
                    ${wfRenderTemplateList()}
                </div>

                <div class="wf-sidebar-info">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                    القوالب النظامية (قصير/طويل) لا يمكن حذفها
                </div>
            </div>

            <!-- المحتوى الرئيسي -->
            <div class="wf-main" id="wfMain">
                <div class="wf-empty-state">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" opacity=".3"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                    <p>اختر مسار موافقة من القائمة لعرض وتعديل مراحله</p>
                </div>
            </div>
        </div>`;

    // تحديد أول قالب تلقائياً إن وجد
    if (WF.templates.length > 0 && !WF.activeTemplate) {
        wfSelectTemplate(WF.templates[0].id);
    }
}

// ─────────────────────────────────────────────────────────────
function wfRenderTemplateList() {
    if (!WF.templates.length) return `<div class="wf-empty-list">لا توجد قوالب</div>`;

    return WF.templates.map(t => `
        <div class="wf-template-item ${WF.activeTemplate && WF.activeTemplate.id == t.id ? 'active' : ''}"
             onclick="wfSelectTemplate(${t.id})" data-id="${t.id}">
            <div class="wf-tpl-icon ${(int_or_zero(t.is_system)) ? 'wf-tpl-system' : 'wf-tpl-custom'}">
                ${(int_or_zero(t.is_system))
            ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>'
            : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>'
        }
            </div>
            <div class="wf-tpl-info">
                <span class="wf-tpl-name">${escapeHtml(t.name_ar)}</span>
                <span class="wf-tpl-meta">${t.stage_count} مراحل ${t.is_active == 0 ? '· <span style="color:var(--danger,.#e74c3c)">معطّل</span>' : ''}</span>
            </div>
            ${!int_or_zero(t.is_system) ? `
            <button class="wf-tpl-del" title="حذف" onclick="event.stopPropagation(); wfDeleteTemplate(${t.id},'${escapeHtml(t.name_ar)}')">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </button>` : ''}
        </div>`).join('');
}

function int_or_zero(v) { return parseInt(v) || 0; }

// ═══════════════════════════════════════════════════════════
//  تحديد قالب وعرض مراحله
// ═══════════════════════════════════════════════════════════
async function wfSelectTemplate(id) {
    // تحديث التحديد المرئي
    document.querySelectorAll('.wf-template-item').forEach(el => {
        el.classList.toggle('active', parseInt(el.dataset.id) === id);
    });

    const main = document.getElementById('wfMain');
    main.innerHTML = `<div class="wf-loading"><div class="wf-spinner"></div><span>جاري التحميل...</span></div>`;

    try {
        await wfLoadStages(id);
        wfRenderStagesPanel();
    } catch (e) {
        main.innerHTML = `<div class="wf-error">⚠️ ${escapeHtml(e.message)}</div>`;
    }
}

// ═══════════════════════════════════════════════════════════
//  عرض لوحة المراحل
// ═══════════════════════════════════════════════════════════
function wfRenderStagesPanel() {
    const main = document.getElementById('wfMain');
    const t = WF.activeTemplate;
    if (!t) return;

    const isSystem = int_or_zero(t.is_system);

    main.innerHTML = `
        <div class="wf-panel">

            <!-- رأس القالب -->
            <div class="wf-panel-header">
                <div class="wf-panel-title">
                    <div class="wf-panel-icon ${isSystem ? 'wf-tpl-system' : 'wf-tpl-custom'}">
                        ${isSystem
            ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>'
            : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>'
        }
                    </div>
                    <div>
                        <h2 class="wf-template-name">${escapeHtml(t.name_ar)}</h2>
                        <span class="wf-template-key">المفتاح: <code>${escapeHtml(t.template_key)}</code>
                            ${t.amount_min !== null || t.amount_max !== null ? `· نطاق المبلغ: ${wfFormatRange(t.amount_min, t.amount_max)}` : ''}
                        </span>
                    </div>
                </div>
                <div class="wf-panel-actions">
                    <button class="wf-btn wf-btn-sm wf-btn-ghost" onclick="wfShowEditTemplate(${t.id})" title="تعديل إعدادات القالب">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        تعديل
                    </button>
                    <button class="wf-btn wf-btn-sm wf-btn-ghost" onclick="wfCloneTemplate(${t.id},'${escapeHtml(t.name_ar)}')" title="نسخ القالب">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                        نسخ
                    </button>
                    <button class="wf-btn wf-btn-sm wf-btn-primary" onclick="wfShowAddStage()">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        إضافة مرحلة
                    </button>
                </div>
            </div>

            ${t.description ? `<p class="wf-tpl-desc">${escapeHtml(t.description)}</p>` : ''}

            <!-- تحذير إذا كان القالب مستخدماً في طلبات نشطة -->
            <div id="wfUsageWarning" style="display:none"></div>

            <!-- مراحل سير العمل -->
            <div class="wf-stages-wrap">
                <div class="wf-stages-hint">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
                    اسحب المراحل لإعادة ترتيبها. التغييرات تؤثر على الطلبات الجديدة فقط.
                </div>
                <div class="wf-stages-list" id="wfStagesList">
                    ${wfRenderStagesList()}
                </div>
            </div>
        </div>`;

    wfInitDragDrop();
    wfCheckUsage(t.id);
}

// ─────────────────────────────────────────────────────────────
function wfRenderStagesList() {
    if (!WF.stages.length) return `<div class="wf-empty-list" style="padding:2rem">لا توجد مراحل محددة</div>`;

    return WF.stages.map((s, idx) => {
        const isFirst = idx === 0;
        const isTerminal = int_or_zero(s.is_terminal);
        const isDual = int_or_zero(s.requires_dual_approval);
        const isLocked = isFirst || isTerminal;

        return `
        <div class="wf-stage-row ${isTerminal ? 'wf-stage-terminal' : ''} ${isLocked ? 'wf-stage-locked' : ''}"
             draggable="${isLocked ? 'false' : 'true'}"
             data-id="${s.id}"
             data-order="${s.stage_order}">

            <!-- مقبض السحب -->
            <div class="wf-drag-handle ${isLocked ? 'wf-handle-disabled' : ''}" title="${isLocked ? 'لا يمكن إعادة الترتيب' : 'اسحب لإعادة الترتيب'}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="5" r="1" fill="currentColor"/><circle cx="15" cy="5" r="1" fill="currentColor"/><circle cx="9" cy="12" r="1" fill="currentColor"/><circle cx="15" cy="12" r="1" fill="currentColor"/><circle cx="9" cy="19" r="1" fill="currentColor"/><circle cx="15" cy="19" r="1" fill="currentColor"/></svg>
            </div>

            <!-- رقم الترتيب -->
            <div class="wf-stage-num">${s.stage_order}</div>

            <!-- أيقونة المرحلة -->
            <div class="wf-stage-icon ${isTerminal ? 'wf-icon-done' : isDual ? 'wf-icon-dual' : 'wf-icon-normal'}">
                ${isTerminal
                ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>'
                : isDual
                    ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>'
                    : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
            }
            </div>

            <!-- معلومات المرحلة -->
            <div class="wf-stage-info">
                <span class="wf-stage-name">${escapeHtml(s.stage_name_ar)}</span>
                <div class="wf-stage-tags">
                    <span class="wf-tag wf-tag-key">${escapeHtml(s.stage_key)}</span>
                    ${s.responsible_role ? `<span class="wf-tag wf-tag-role">${escapeHtml(s.responsible_role)}</span>` : ''}
                    ${s.responsible_dept_code ? `<span class="wf-tag wf-tag-dept">${escapeHtml(s.responsible_dept_code)}</span>` : ''}
                    ${isDual ? '<span class="wf-tag wf-tag-dual">موافقة مزدوجة</span>' : ''}
                    ${!int_or_zero(s.is_mandatory) ? '<span class="wf-tag wf-tag-opt">اختياري</span>' : ''}
                    ${isTerminal ? '<span class="wf-tag wf-tag-final">نهائي</span>' : ''}
                </div>
            </div>

            <!-- الإجراءات -->
            <div class="wf-stage-actions">
                ${!isTerminal ? `
                <button class="wf-action-btn" title="تعديل" onclick="wfShowEditStage(${s.id})">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>` : ''}
                ${!isLocked && s.stage_key !== 'reception' ? `
                <button class="wf-action-btn wf-action-del" title="حذف" onclick="wfDeleteStage(${s.id},'${escapeHtml(s.stage_name_ar)}')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                </button>` : ''}
            </div>

        </div>

        <!-- سهم الانتقال بين المراحل (إلا بعد الأخيرة) -->
        ${idx < WF.stages.length - 1 ? `
        <div class="wf-stage-arrow">
            <svg width="14" height="20" viewBox="0 0 14 20" fill="none"><line x1="7" y1="0" x2="7" y2="14" stroke="var(--border-color,#e0e0e0)" stroke-width="2"/><polyline points="3,12 7,18 11,12" stroke="var(--border-color,#e0e0e0)" stroke-width="2" fill="none"/></svg>
        </div>` : ''}`;
    }).join('');
}

// ─────────────────────────────────────────────────────────────
function wfFormatRange(min, max) {
    const fmt = n => n !== null && n !== undefined
        ? parseFloat(n).toLocaleString('ar-SA') + ' ر.س'
        : '';
    if (min !== null && max !== null) return `${fmt(min)} — ${fmt(max)}`;
    if (min !== null) return `من ${fmt(min)}`;
    if (max !== null) return `حتى ${fmt(max)}`;
    return 'غير محدد';
}

// ═══════════════════════════════════════════════════════════
//  فحص الاستخدام الحالي
// ═══════════════════════════════════════════════════════════
async function wfCheckUsage(templateId) {
    try {
        const res = await fetch(`api/workflow_config_api.php?action=get_usage&template_id=${templateId}`);
        const data = await res.json();
        const warn = document.getElementById('wfUsageWarning');
        if (!warn) return;
        if (data.success && data.active_requests > 0) {
            warn.style.display = '';
            warn.innerHTML = `
                <div class="wf-usage-warn">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    يوجد <strong>${data.active_requests}</strong> طلب نشط يستخدم هذا المسار — أي تعديل سيؤثر على الطلبات الجديدة فقط.
                </div>`;
        } else {
            warn.style.display = 'none';
        }
    } catch (_) { }
}

// ═══════════════════════════════════════════════════════════
//  Drag & Drop لإعادة الترتيب
// ═══════════════════════════════════════════════════════════
function wfInitDragDrop() {
    const list = document.getElementById('wfStagesList');
    if (!list) return;

    list.querySelectorAll('.wf-stage-row[draggable="true"]').forEach(row => {
        row.addEventListener('dragstart', e => {
            WF.dragSrc = row;
            WF.dragging = true;
            row.classList.add('wf-dragging');
            e.dataTransfer.effectAllowed = 'move';
        });
        row.addEventListener('dragend', () => {
            row.classList.remove('wf-dragging');
            list.querySelectorAll('.wf-stage-row').forEach(r => r.classList.remove('wf-drag-over'));
            WF.dragging = false;
            wfSaveOrder();
        });
        row.addEventListener('dragover', e => {
            e.preventDefault();
            if (!WF.dragSrc || WF.dragSrc === row) return;
            // لا تسمح بالسحب فوق مرحلة مقفلة
            if (row.classList.contains('wf-stage-locked')) return;
            list.querySelectorAll('.wf-stage-row').forEach(r => r.classList.remove('wf-drag-over'));
            row.classList.add('wf-drag-over');
        });
        row.addEventListener('drop', e => {
            e.preventDefault();
            if (!WF.dragSrc || WF.dragSrc === row) return;
            if (row.classList.contains('wf-stage-locked')) return;
            // إعادة الترتيب في DOM
            const rows = [...list.querySelectorAll('.wf-stage-row')];
            const srcIdx = rows.indexOf(WF.dragSrc);
            const dstIdx = rows.indexOf(row);
            // نقل في DOM (مع الأسهم بينهم)
            const allChildren = [...list.children];
            // نجمع فقط .wf-stage-row و .wf-stage-arrow بالتبادل
            // أسهل: نعيد رسم القائمة بعد تغيير WF.stages
            const srcId = parseInt(WF.dragSrc.dataset.id);
            const dstId = parseInt(row.dataset.id);
            const srcStage = WF.stages.find(s => s.id == srcId);
            const dstStage = WF.stages.find(s => s.id == dstId);
            if (!srcStage || !dstStage) return;
            // لا يمكن نقل فوق أو تحت مراحل مقفلة
            if (int_or_zero(dstStage.is_terminal) || dstStage.stage_key === 'reception') return;
            // تبديل الترتيب
            const srcOrder = srcStage.stage_order;
            srcStage.stage_order = dstStage.stage_order;
            dstStage.stage_order = srcOrder;
            WF.stages.sort((a, b) => a.stage_order - b.stage_order);
            // إعادة ترقيم
            WF.stages.forEach((s, i) => { s.stage_order = i + 1; });
            document.getElementById('wfStagesList').innerHTML = wfRenderStagesList();
            wfInitDragDrop();
        });
    });
}

async function wfSaveOrder() {
    if (!WF.activeTemplate) return;
    const orders = WF.stages
        .filter(s => !int_or_zero(s.is_terminal) && s.stage_key !== 'reception')
        .map(s => ({ id: s.id, order: s.stage_order }));
    // إضافة completion
    const terminal = WF.stages.find(s => int_or_zero(s.is_terminal));
    if (terminal) orders.push({ id: terminal.id, order: WF.stages.length });

    try {
        const res = await fetch('api/workflow_config_api.php?action=reorder_stages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({

                template_id: WF.activeTemplate.id,
                orders
            })
        });
        const data = await res.json();
        if (!data.success) showToast(data.message || 'فشل حفظ الترتيب', 'error');
    } catch (e) {
        showToast('فشل حفظ الترتيب', 'error');
    }
}

// ═══════════════════════════════════════════════════════════
//  نوافذ الإضافة / التعديل — القوالب
// ═══════════════════════════════════════════════════════════
function wfShowAddTemplate() {
    wfOpenModal(`
        <h3 class="wf-modal-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
            إنشاء مسار موافقة جديد
        </h3>
        ${wfTemplateForm()}
        <div class="wf-modal-footer">
            <button class="wf-btn wf-btn-ghost" onclick="wfCloseModal()">إلغاء</button>
            <button class="wf-btn wf-btn-primary" onclick="wfSaveTemplate()">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                إنشاء المسار
            </button>
        </div>
    `);
}

function wfShowEditTemplate(id) {
    const t = WF.templates.find(x => x.id == id) || WF.activeTemplate;
    if (!t) return;
    wfOpenModal(`
        <h3 class="wf-modal-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            تعديل: ${escapeHtml(t.name_ar)}
        </h3>
        ${wfTemplateForm(t)}
        <div class="wf-modal-footer">
            <button class="wf-btn wf-btn-ghost" onclick="wfCloseModal()">إلغاء</button>
            <button class="wf-btn wf-btn-primary" onclick="wfSaveTemplate(${t.id})">حفظ التعديلات</button>
        </div>
    `);
}

function wfTemplateForm(t = null) {
    return `
    <div class="wf-form">
        <div class="wf-form-row">
            <label class="wf-label">الاسم بالعربية <span class="wf-req">*</span></label>
            <input class="wf-input" id="wfTplNameAr" type="text" placeholder="مثال: مسار المشتريات الكبيرة" value="${escapeHtml(t?.name_ar || '')}">
        </div>
        <div class="wf-form-row">
            <label class="wf-label">الاسم بالإنجليزية</label>
            <input class="wf-input" id="wfTplNameEn" type="text" placeholder="e.g. Large Procurement Path" value="${escapeHtml(t?.name_en || '')}">
        </div>
        ${!t ? `
        <div class="wf-form-row">
            <label class="wf-label">المفتاح البرمجي <span class="wf-req">*</span></label>
            <input class="wf-input wf-input-ltr" id="wfTplKey" type="text" placeholder="مثال: large_procurement" value="${escapeHtml(t?.template_key || '')}">
            <small class="wf-hint">حروف إنجليزية صغيرة وأرقام وشرطة سفلية فقط</small>
        </div>` : `<input type="hidden" id="wfTplKey" value="${escapeHtml(t?.template_key || '')}">`}
        <div class="wf-form-row">
            <label class="wf-label">وصف المسار</label>
            <textarea class="wf-input" id="wfTplDesc" rows="2" placeholder="متى يُستخدم هذا المسار؟">${escapeHtml(t?.description || '')}</textarea>
        </div>
        <div class="wf-form-row-2">
            <div>
                <label class="wf-label">الحد الأدنى للمبلغ (ر.س)</label>
                <input class="wf-input" id="wfTplMin" type="number" min="0" step="0.01" placeholder="0" value="${t?.amount_min ?? ''}">
            </div>
            <div>
                <label class="wf-label">الحد الأقصى للمبلغ (ر.س)</label>
                <input class="wf-input" id="wfTplMax" type="number" min="0" step="0.01" placeholder="بلا حد" value="${t?.amount_max ?? ''}">
            </div>
        </div>
        ${t ? `
        <div class="wf-form-row">
            <label class="wf-label wf-toggle-label">
                <input type="checkbox" id="wfTplActive" ${t.is_active == 1 ? 'checked' : ''}>
                <span>تفعيل هذا المسار</span>
            </label>
        </div>` : ''}
    </div>`;
}

async function wfSaveTemplate(id = null) {
    const nameAr = document.getElementById('wfTplNameAr')?.value.trim();
    const nameEn = document.getElementById('wfTplNameEn')?.value.trim() || '';
    const key = document.getElementById('wfTplKey')?.value.trim();
    const desc = document.getElementById('wfTplDesc')?.value.trim() || '';
    const min = document.getElementById('wfTplMin')?.value;
    const max = document.getElementById('wfTplMax')?.value;
    const active = document.getElementById('wfTplActive')?.checked ?? true;

    if (!nameAr) { showToast('اسم المسار مطلوب', 'error'); return; }
    if (!id && !key) { showToast('المفتاح البرمجي مطلوب', 'error'); return; }

    const action = id ? 'update_template' : 'create_template';
    const body = {

        name_ar: nameAr, name_en: nameEn,
        template_key: key, description: desc,
        amount_min: min || null, amount_max: max || null,
        is_active: active ? 1 : 0,
    };
    if (id) body.id = id;

    try {
        const res = await fetch(`api/workflow_config_api.php?action=${action}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        });
        const data = await res.json();
        if (!data.success) { showToast(data.message || 'فشل الحفظ', 'error'); return; }
        showToast(data.message || 'تم الحفظ', 'success');
        wfCloseModal();
        await wfLoadTemplates();
        if (data.id && !id) {
            wfRender();
            wfSelectTemplate(data.id);
        } else {
            wfRender();
            if (WF.activeTemplate) wfSelectTemplate(WF.activeTemplate.id);
        }
    } catch (e) {
        showToast('خطأ في الاتصال', 'error');
    }
}

async function wfDeleteTemplate(id, name) {
    if (!confirm(`هل تريد حذف المسار "${name}"؟\nلا يمكن حذف مسار يحتوي على طلبات نشطة.`)) return;
    try {
        const res = await fetch('api/workflow_config_api.php?action=delete_template', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        const data = await res.json();
        showToast(data.message || (data.success ? 'تم الحذف' : 'فشل الحذف'), data.success ? 'success' : 'error');
        if (data.success) {
            WF.activeTemplate = null;
            await wfLoadTemplates();
            wfRender();
        }
    } catch (e) {
        showToast('خطأ في الاتصال', 'error');
    }
}

async function wfCloneTemplate(id, name) {
    const newName = prompt(`اسم النسخة الجديدة:`, `${name} — نسخة`);
    if (!newName) return;
    const newKey = prompt('المفتاح البرمجي للنسخة (حروف إنجليزية وأرقام وشرطة سفلية):', `${WF.activeTemplate?.template_key || 'path'}_copy`);
    if (!newKey) return;
    try {
        const res = await fetch('api/workflow_config_api.php?action=clone_template', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, new_name: newName, new_key: newKey })
        });
        const data = await res.json();
        showToast(data.message || (data.success ? 'تم النسخ' : 'فشل'), data.success ? 'success' : 'error');
        if (data.success) {
            await wfLoadTemplates();
            wfRender();
            wfSelectTemplate(data.id);
        }
    } catch (e) {
        showToast('خطأ في الاتصال', 'error');
    }
}

// ═══════════════════════════════════════════════════════════
//  نوافذ الإضافة / التعديل — المراحل
// ═══════════════════════════════════════════════════════════
function wfShowAddStage() {
    if (!WF.activeTemplate) return;
    const stageOptions = WF.stages
        .filter(s => !int_or_zero(s.is_terminal))
        .map(s => `<option value="${escapeHtml(s.stage_key)}">${escapeHtml(s.stage_name_ar)}</option>`)
        .join('');

    wfOpenModal(`
        <h3 class="wf-modal-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            إضافة مرحلة جديدة — ${escapeHtml(WF.activeTemplate.name_ar)}
        </h3>
        ${wfStageForm()}
        <div class="wf-form-row">
            <label class="wf-label">إدراج بعد مرحلة</label>
            <select class="wf-input" id="wfAfterStage">
                <option value="">قبل مرحلة الإتمام مباشرةً</option>
                ${stageOptions}
            </select>
        </div>
        <div class="wf-modal-footer">
            <button class="wf-btn wf-btn-ghost" onclick="wfCloseModal()">إلغاء</button>
            <button class="wf-btn wf-btn-primary" onclick="wfSaveStage()">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                إضافة المرحلة
            </button>
        </div>
    `);
}

function wfShowEditStage(id) {
    const s = WF.stages.find(x => x.id == id);
    if (!s) return;
    wfOpenModal(`
        <h3 class="wf-modal-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            تعديل: ${escapeHtml(s.stage_name_ar)}
        </h3>
        ${wfStageForm(s)}
        <div class="wf-modal-footer">
            <button class="wf-btn wf-btn-ghost" onclick="wfCloseModal()">إلغاء</button>
            <button class="wf-btn wf-btn-primary" onclick="wfSaveStage(${s.id})">حفظ التعديلات</button>
        </div>
    `);
}

function wfStageForm(s = null) {
    const roleOpts = WF.roles.map(r =>
        `<option value="${escapeHtml(r.role)}" ${s?.responsible_role === r.role ? 'selected' : ''}>${escapeHtml(r.role)} (${r.emp_count} موظف)</option>`
    ).join('');

    const permOpts = WF.permRoles.map(p =>
        `<option value="${escapeHtml(p)}" ${s?.responsible_perm === p ? 'selected' : ''}>${escapeHtml(p)}</option>`
    ).join('');

    const deptOpts = WF.departments.map(d =>
        `<option value="${escapeHtml(d.code)}" ${s?.responsible_dept_code === d.code ? 'selected' : ''}>${escapeHtml(d.name)} (${escapeHtml(d.code)})</option>`
    ).join('');

    return `
    <div class="wf-form">
        <div class="wf-form-row">
            <label class="wf-label">اسم المرحلة بالعربية <span class="wf-req">*</span></label>
            <input class="wf-input" id="wfStageNameAr" type="text" placeholder="مثال: مراجعة مدير المشتريات" value="${escapeHtml(s?.stage_name_ar || '')}">
        </div>
        <div class="wf-form-row">
            <label class="wf-label">اسم المرحلة بالإنجليزية</label>
            <input class="wf-input" id="wfStageNameEn" type="text" placeholder="e.g. Procurement Manager Review" value="${escapeHtml(s?.stage_name_en || '')}">
        </div>
        ${!s ? `
        <div class="wf-form-row">
            <label class="wf-label">المفتاح البرمجي <span class="wf-req">*</span></label>
            <input class="wf-input wf-input-ltr" id="wfStageKey" type="text" placeholder="مثال: procurement_manager_review">
            <small class="wf-hint">حروف إنجليزية صغيرة وأرقام وشرطة سفلية — يجب أن يكون فريداً في هذا المسار</small>
        </div>` : `<input type="hidden" id="wfStageKey" value="${escapeHtml(s.stage_key)}">`}

        <div class="wf-section-title">المسؤول عن هذه المرحلة</div>
        <div class="wf-form-row">
            <label class="wf-label">الدور الوظيفي (role)</label>
            <select class="wf-input" id="wfStageRole">
                <option value="">— غير محدد —</option>
                ${roleOpts}
            </select>
        </div>
        <div class="wf-form-row">
            <label class="wf-label">مستوى الصلاحية (permission_level)</label>
            <select class="wf-input" id="wfStagePerm">
                <option value="">— غير محدد —</option>
                ${permOpts}
            </select>
        </div>
        <div class="wf-form-row">
            <label class="wf-label">القسم المسؤول</label>
            <select class="wf-input" id="wfStageDept">
                <option value="">— غير محدد —</option>
                ${deptOpts}
            </select>
        </div>

        <div class="wf-form-checkboxes">
            <label class="wf-check-label">
                <input type="checkbox" id="wfStageMandatory" ${s?.is_mandatory == 1 || !s ? 'checked' : ''}>
                <span>مرحلة إلزامية</span>
            </label>
            <label class="wf-check-label">
                <input type="checkbox" id="wfStageDual" ${s?.requires_dual_approval == 1 ? 'checked' : ''}>
                <span>تتطلب موافقة مزدوجة</span>
            </label>
            <label class="wf-check-label">
                <input type="checkbox" id="wfStageCanReject" ${s?.can_reject == 1 || !s ? 'checked' : ''}>
                <span>يمكن الرفض من هذه المرحلة</span>
            </label>
        </div>
        <div class="wf-form-row">
            <label class="wf-label">ملاحظات</label>
            <textarea class="wf-input" id="wfStageNotes" rows="2" placeholder="ملاحظات اختيارية...">${escapeHtml(s?.notes || '')}</textarea>
        </div>
    </div>`;
}

async function wfSaveStage(id = null) {
    const nameAr = document.getElementById('wfStageNameAr')?.value.trim();
    const nameEn = document.getElementById('wfStageNameEn')?.value.trim() || '';
    const key = document.getElementById('wfStageKey')?.value.trim();
    const role = document.getElementById('wfStageRole')?.value || '';
    const perm = document.getElementById('wfStagePerm')?.value || '';
    const dept = document.getElementById('wfStageDept')?.value || '';
    const mand = document.getElementById('wfStageMandatory')?.checked ? 1 : 0;
    const dual = document.getElementById('wfStageDual')?.checked ? 1 : 0;
    const canRej = document.getElementById('wfStageCanReject')?.checked ? 1 : 0;
    const notes = document.getElementById('wfStageNotes')?.value.trim() || '';
    const after = document.getElementById('wfAfterStage')?.value || '';

    if (!nameAr) { showToast('اسم المرحلة مطلوب', 'error'); return; }
    if (!id && !key) { showToast('المفتاح البرمجي مطلوب', 'error'); return; }

    const action = id ? 'update_stage' : 'add_stage';
    const body = {

        stage_name_ar: nameAr, stage_name_en: nameEn,
        stage_key: key,
        responsible_role: role, responsible_perm: perm, responsible_dept_code: dept,
        is_mandatory: mand, requires_dual_approval: dual, can_reject: canRej,
        notes,
    };
    if (id) body.id = id;
    else { body.template_id = WF.activeTemplate.id; body.after_stage = after; }

    try {
        const res = await fetch(`api/workflow_config_api.php?action=${action}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        });
        const data = await res.json();
        if (!data.success) { showToast(data.message || 'فشل الحفظ', 'error'); return; }
        showToast(data.message || 'تم', 'success');
        wfCloseModal();
        await wfLoadStages(WF.activeTemplate.id);
        wfRenderStagesPanel();
    } catch (e) {
        showToast('خطأ في الاتصال', 'error');
    }
}

async function wfDeleteStage(id, name) {
    if (!confirm(`هل تريد حذف المرحلة "${name}"؟\nلا يمكن حذف مرحلة الاستلام أو مرحلة الإتمام.`)) return;
    try {
        const res = await fetch('api/workflow_config_api.php?action=delete_stage', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        const data = await res.json();
        showToast(data.message || (data.success ? 'تم الحذف' : 'فشل'), data.success ? 'success' : 'error');
        if (data.success) {
            await wfLoadStages(WF.activeTemplate.id);
            wfRenderStagesPanel();
        }
    } catch (e) {
        showToast('خطأ في الاتصال', 'error');
    }
}

// ═══════════════════════════════════════════════════════════
//  مساعد النافذة المنبثقة
// ═══════════════════════════════════════════════════════════
function wfOpenModal(html) {
    let overlay = document.getElementById('wfModalOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'wfModalOverlay';
        overlay.className = 'wf-modal-overlay';
        overlay.addEventListener('click', e => { if (e.target === overlay) wfCloseModal(); });
        document.body.appendChild(overlay);
    }
    overlay.innerHTML = `<div class="wf-modal">${html}</div>`;
    overlay.style.display = 'flex';
    requestAnimationFrame(() => overlay.querySelector('.wf-modal')?.classList.add('wf-modal-in'));
}

function wfCloseModal() {
    const overlay = document.getElementById('wfModalOverlay');
    if (overlay) overlay.style.display = 'none';
}

// ═══════════════════════════════════════════════════════════
//  CSS مُدمج
// ═══════════════════════════════════════════════════════════
function injectWorkflowStyles() {
    if (document.getElementById('wf-styles')) return;
    const style = document.createElement('style');
    style.id = 'wf-styles';
    style.textContent = `
/* ── الهيكل العام ─────────────────────────────────────── */
.wf-root { height: 100%; min-height: 500px; }
.wf-layout { display: grid; grid-template-columns: 260px 1fr; gap: 0; height: 100%; min-height: 600px; border: 1px solid var(--border-color); border-radius: 12px; overflow: hidden; background: var(--bg-card); }

/* ── الشريط الجانبي ───────────────────────────────────── */
.wf-sidebar { border-inline-end: 1px solid var(--border-color); display: flex; flex-direction: column; background: var(--bg-surface,#f8f9fa); }
.wf-sidebar-header { display: flex; align-items: center; justify-content: space-between; padding: .85rem 1rem; border-bottom: 1px solid var(--border-color); }
.wf-sidebar-title { font-weight: 700; font-size: .9rem; color: var(--text-primary); }
.wf-template-list { flex: 1; overflow-y: auto; padding: .5rem; }
.wf-template-item { display: flex; align-items: center; gap: .6rem; padding: .65rem .75rem; border-radius: 8px; cursor: pointer; transition: background .15s; position: relative; margin-bottom: 2px; }
.wf-template-item:hover { background: var(--bg-hover,rgba(0,0,0,.05)); }
.wf-template-item.active { background: var(--btn-primary-bg,#3F5950); color: #fff; }
.wf-template-item.active .wf-tpl-name { color: #fff; }
.wf-template-item.active .wf-tpl-meta { color: rgba(255,255,255,.75); }
.wf-tpl-icon { width: 28px; height: 28px; border-radius: 7px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.wf-tpl-system { background: rgba(63,89,80,.15); color: var(--btn-primary-bg,#3F5950); }
.wf-tpl-custom { background: rgba(100,100,220,.12); color: #5050dd; }
.wf-template-item.active .wf-tpl-icon { background: rgba(255,255,255,.2); color: #fff; }
.wf-tpl-info { flex: 1; min-width: 0; }
.wf-tpl-name { display: block; font-size: .85rem; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wf-tpl-meta { font-size: .75rem; color: var(--text-muted); }
.wf-tpl-del { opacity: 0; background: none; border: none; cursor: pointer; color: var(--danger,#e74c3c); padding: .25rem; border-radius: 5px; transition: opacity .15s; }
.wf-template-item:hover .wf-tpl-del { opacity: 1; }
.wf-sidebar-info { padding: .75rem 1rem; font-size: .73rem; color: var(--text-muted); border-top: 1px solid var(--border-color); display: flex; gap: .4rem; align-items: flex-start; line-height: 1.5; }
.wf-empty-list { padding: 1.5rem; text-align: center; color: var(--text-muted); font-size: .85rem; }

/* ── اللوحة الرئيسية ──────────────────────────────────── */
.wf-main { overflow-y: auto; }
.wf-empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 1rem; color: var(--text-muted); font-size: .9rem; padding: 3rem; text-align: center; }
.wf-panel { padding: 1.5rem; }
.wf-panel-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; flex-wrap: wrap; }
.wf-panel-title { display: flex; align-items: center; gap: .75rem; }
.wf-panel-icon { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.wf-template-name { font-size: 1.15rem; font-weight: 700; color: var(--text-primary); margin: 0 0 .2rem; }
.wf-template-key { font-size: .78rem; color: var(--text-muted); }
.wf-template-key code { background: var(--bg-surface); padding: .1rem .35rem; border-radius: 4px; font-size: .75rem; direction: ltr; display: inline-block; }
.wf-panel-actions { display: flex; gap: .5rem; flex-wrap: wrap; }
.wf-tpl-desc { font-size: .85rem; color: var(--text-secondary); margin: 0 0 1rem; padding: .75rem 1rem; background: var(--bg-surface); border-radius: 8px; border-inline-start: 3px solid var(--btn-primary-bg,#3F5950); }

/* ── تحذير الاستخدام ──────────────────────────────────── */
.wf-usage-warn { display: flex; align-items: center; gap: .5rem; padding: .75rem 1rem; background: rgba(255,165,0,.1); border: 1px solid rgba(255,165,0,.3); border-radius: 8px; font-size: .83rem; color: var(--text-primary); margin-bottom: 1rem; }

/* ── قائمة المراحل ────────────────────────────────────── */
.wf-stages-wrap { background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 10px; overflow: hidden; }
.wf-stages-hint { padding: .6rem 1rem; font-size: .75rem; color: var(--text-muted); border-bottom: 1px solid var(--border-color); display: flex; align-items: center; gap: .4rem; background: var(--bg-card); }
.wf-stages-list { padding: 1rem; display: flex; flex-direction: column; gap: 0; }
.wf-stage-row { display: flex; align-items: center; gap: .75rem; padding: .85rem 1rem; border: 1px solid var(--border-color); border-radius: 10px; background: var(--bg-card); cursor: default; transition: box-shadow .15s, transform .15s; position: relative; }
.wf-stage-row[draggable="true"] { cursor: grab; }
.wf-stage-row[draggable="true"]:hover { box-shadow: 0 2px 12px rgba(0,0,0,.08); }
.wf-stage-row.wf-dragging { opacity: .5; transform: scale(.98); }
.wf-stage-row.wf-drag-over { box-shadow: 0 0 0 2px var(--btn-primary-bg,#3F5950); }
.wf-stage-row.wf-stage-locked { background: var(--bg-surface); }
.wf-stage-row.wf-stage-terminal { border-style: dashed; opacity: .8; }
.wf-drag-handle { color: var(--text-muted); flex-shrink: 0; cursor: grab; opacity: .5; }
.wf-drag-handle:hover { opacity: 1; }
.wf-handle-disabled { cursor: not-allowed; opacity: .25; }
.wf-stage-num { width: 24px; height: 24px; background: var(--btn-primary-bg,#3F5950); color: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: .72rem; font-weight: 700; flex-shrink: 0; }
.wf-stage-locked .wf-stage-num { background: var(--text-muted); }
.wf-stage-icon { width: 34px; height: 34px; border-radius: 9px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.wf-icon-normal { background: rgba(63,89,80,.1); color: var(--btn-primary-bg,#3F5950); }
.wf-icon-dual   { background: rgba(100,80,200,.1); color: #6450c8; }
.wf-icon-done   { background: rgba(40,167,69,.12); color: #28a745; }
.wf-stage-info { flex: 1; min-width: 0; }
.wf-stage-name { display: block; font-weight: 600; font-size: .88rem; color: var(--text-primary); margin-bottom: .3rem; }
.wf-stage-tags { display: flex; flex-wrap: wrap; gap: .3rem; }
.wf-tag { padding: .15rem .5rem; border-radius: 12px; font-size: .71rem; font-weight: 500; }
.wf-tag-key    { background: var(--bg-surface); color: var(--text-muted); font-family: monospace; direction: ltr; }
.wf-tag-role   { background: rgba(63,89,80,.1);  color: var(--btn-primary-bg,#3F5950); }
.wf-tag-dept   { background: rgba(0,120,215,.1); color: #0078d7; }
.wf-tag-dual   { background: rgba(100,80,200,.1); color: #6450c8; }
.wf-tag-opt    { background: rgba(255,165,0,.1);  color: #c47a00; }
.wf-tag-final  { background: rgba(40,167,69,.1);  color: #28a745; }
.wf-stage-actions { display: flex; gap: .4rem; flex-shrink: 0; }
.wf-action-btn { width: 30px; height: 30px; border: 1px solid var(--border-color); background: var(--bg-surface); border-radius: 7px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--text-secondary); transition: all .15s; }
.wf-action-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
.wf-action-del:hover { background: rgba(231,76,60,.1); color: #e74c3c; border-color: rgba(231,76,60,.3); }
.wf-stage-arrow { display: flex; justify-content: center; padding: .1rem 0; }

/* ── أزرار ──────────────────────────────────────────────── */
.wf-btn { display: inline-flex; align-items: center; gap: .4rem; padding: .5rem 1rem; border-radius: 8px; font-family: inherit; font-size: .83rem; font-weight: 600; cursor: pointer; transition: all .15s; border: 1px solid transparent; }
.wf-btn-sm { padding: .38rem .75rem; font-size: .8rem; }
.wf-btn-primary { background: var(--btn-primary-bg,#3F5950); color: var(--btn-primary-text,#fff); }
.wf-btn-primary:hover { filter: brightness(1.1); }
.wf-btn-ghost { background: transparent; color: var(--text-secondary); border-color: var(--border-color); }
.wf-btn-ghost:hover { background: var(--bg-surface); color: var(--text-primary); }

/* ── نافذة منبثقة ───────────────────────────────────────── */
.wf-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); display: flex; align-items: center; justify-content: center; z-index: 9999; padding: 1rem; }
.wf-modal { background: var(--bg-card); border-radius: 14px; width: 100%; max-width: 520px; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,.3); transform: scale(.95); opacity: 0; transition: transform .2s, opacity .2s; padding: 1.5rem; }
.wf-modal.wf-modal-in { transform: scale(1); opacity: 1; }
.wf-modal-title { display: flex; align-items: center; gap: .6rem; font-size: 1rem; font-weight: 700; color: var(--text-primary); margin: 0 0 1.25rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border-color); }
.wf-modal-footer { display: flex; gap: .5rem; justify-content: flex-end; padding-top: 1rem; border-top: 1px solid var(--border-color); margin-top: 1rem; }

/* ── نماذج ──────────────────────────────────────────────── */
.wf-form { display: flex; flex-direction: column; gap: 1rem; }
.wf-form-row { display: flex; flex-direction: column; gap: .4rem; }
.wf-form-row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
.wf-label { font-size: .82rem; font-weight: 600; color: var(--text-secondary); }
.wf-req { color: var(--danger,#e74c3c); }
.wf-input { padding: .55rem .75rem; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-surface); color: var(--text-primary); font-family: inherit; font-size: .87rem; width: 100%; transition: border-color .15s; }
.wf-input:focus { outline: none; border-color: var(--btn-primary-bg,#3F5950); }
.wf-input-ltr { direction: ltr; text-align: left; }
.wf-hint { font-size: .74rem; color: var(--text-muted); }
.wf-section-title { font-size: .8rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: .05em; padding-top: .5rem; border-top: 1px solid var(--border-color); }
.wf-form-checkboxes { display: flex; flex-wrap: wrap; gap: .75rem; }
.wf-check-label { display: flex; align-items: center; gap: .4rem; font-size: .83rem; color: var(--text-primary); cursor: pointer; }
.wf-toggle-label { display: flex; align-items: center; gap: .4rem; font-size: .83rem; color: var(--text-primary); cursor: pointer; }

/* ── تحميل / خطأ ────────────────────────────────────────── */
.wf-loading { display: flex; align-items: center; justify-content: center; gap: .75rem; padding: 3rem; color: var(--text-muted); }
.wf-spinner { width: 22px; height: 22px; border: 2px solid var(--border-color); border-top-color: var(--btn-primary-bg,#3F5950); border-radius: 50%; animation: wfSpin .7s linear infinite; }
@keyframes wfSpin { to { transform: rotate(360deg); } }
.wf-error { padding: 2rem; color: var(--danger,#e74c3c); text-align: center; }

/* ── استجابة الشاشات الصغيرة ────────────────────────────── */
@media (max-width: 700px) {
    .wf-layout { grid-template-columns: 1fr; }
    .wf-sidebar { border-inline-end: none; border-bottom: 1px solid var(--border-color); max-height: 200px; }
    .wf-form-row-2 { grid-template-columns: 1fr; }
}
    `;
    document.head.appendChild(style);
}