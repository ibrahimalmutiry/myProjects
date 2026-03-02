/**
 * نظام إدارة الخطابات والمراسلات - JavaScript
 * النسخة المحسّنة مع صفحة التعديل الكاملة
 */

// =====================================================
// تحميل صفحة الخطابات
// =====================================================

function loadCorrespondencePage() {
    const html = `
        <div class="corr-page-header">
            <div class="corr-page-title">
                <div class="corr-page-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                        <polyline points="22,6 12,13 2,6"></polyline>
                    </svg>
                </div>
                <div>
                    <h2>نظام الخطابات</h2>
                    <p>إدارة وتتبع الخطابات والمراسلات</p>
                </div>
            </div>
            <button class="btn btn-primary corr-new-btn" onclick="showAddCorrespondenceModal()">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 5v14M5 12h14"></path>
                </svg>
                خطاب جديد
            </button>
        </div>

        <div class="corr-stats-row">
            <div class="corr-stat-card">
                <div class="corr-stat-icon" style="background:rgba(74,171,247,0.15);color:var(--accent-blue);">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                </div>
                <div class="corr-stat-info">
                    <span class="corr-stat-num" id="statTotal">—</span>
                    <span class="corr-stat-label">إجمالي الخطابات</span>
                </div>
            </div>
            <div class="corr-stat-card">
                <div class="corr-stat-icon" style="background:rgba(255,169,77,0.15);color:var(--accent-orange);">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                </div>
                <div class="corr-stat-info">
                    <span class="corr-stat-num" id="statInProgress">—</span>
                    <span class="corr-stat-label">قيد المعالجة</span>
                </div>
            </div>
            <div class="corr-stat-card">
                <div class="corr-stat-icon" style="background:rgba(255,107,107,0.15);color:var(--accent-red);">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                </div>
                <div class="corr-stat-info">
                    <span class="corr-stat-num" id="statUrgent">—</span>
                    <span class="corr-stat-label">عاجل</span>
                </div>
            </div>
            <div class="corr-stat-card">
                <div class="corr-stat-icon" style="background:rgba(105,219,124,0.15);color:var(--accent-green);">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </div>
                <div class="corr-stat-info">
                    <span class="corr-stat-num" id="statCompleted">—</span>
                    <span class="corr-stat-label">مكتمل</span>
                </div>
            </div>
        </div>

        <div class="card">
            <div class="corr-toolbar">
                <div class="corr-search-wrapper">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path></svg>
                    <input type="text" id="corrSearchInput" class="corr-search-input" placeholder="بحث في الخطابات..." oninput="filterCorrespondence()">
                </div>
                <div class="corr-filters">
                    <select id="corrTypeFilter" class="corr-filter-select" onchange="filterCorrespondence()">
                        <option value="">جميع الأنواع</option>
                        <option value="internal_finance">داخلي - مالي</option>
                        <option value="internal_general">داخلي - عام</option>
                        <option value="incoming">وارد</option>
                        <option value="outgoing">صادر</option>
                    </select>
                    <select id="corrPriorityFilter" class="corr-filter-select" onchange="filterCorrespondence()">
                        <option value="">جميع الأولويات</option>
                        <option value="low">منخفض</option>
                        <option value="normal">عادي</option>
                        <option value="high">مهم</option>
                        <option value="urgent">عاجل جداً</option>
                    </select>
                    <button class="corr-filter-clear" onclick="clearCorrFilters()" title="مسح الفلاتر">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
            </div>

            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>رقم الخطاب</th>
                            <th>التاريخ</th>
                            <th>النوع</th>
                            <th>الموضوع</th>
                            <th>من</th>
                            <th>إلى</th>
                            <th>الأولوية</th>
                            <th>المرحلة</th>
                            <th>مرفقات</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody id="correspondenceBody">
                        <tr><td colspan="10" style="text-align:center;padding:3rem;"><div class="loading-spinner"></div></td></tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;

    DOM.mainContent.innerHTML = html;
    loadCorrespondenceStats();
    loadCorrespondenceList();
}

// =====================================================
// تحميل الإحصاءات
// =====================================================

function loadCorrespondenceStats() {
    fetch('api/correspondence_api.php?action=stats')
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                const s = data.data;
                const el = id => document.getElementById(id);
                if (el('statTotal')) el('statTotal').textContent = s.total || 0;
                if (el('statInProgress')) el('statInProgress').textContent = s.in_progress || 0;
                if (el('statUrgent')) el('statUrgent').textContent = s.urgent || 0;
                if (el('statCompleted')) el('statCompleted').textContent = s.completed || 0;
            }
        })
        .catch(() => { });
}

// =====================================================
// تحميل قائمة الخطابات
// =====================================================

function loadCorrespondenceList(filters = {}) {
    const params = new URLSearchParams({ action: 'correspondence_list', ...filters });

    fetch(`api/correspondence_api.php?${params}`)
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                displayCorrespondenceList(data.data);
            } else {
                showToast(data.message, 'error');
            }
        })
        .catch(err => {
            console.error('Error loading correspondence:', err);
            showToast('حدث خطأ في تحميل الخطابات', 'error');
        });
}

// =====================================================
// عرض قائمة الخطابات
// =====================================================

function displayCorrespondenceList(correspondence) {
    const tbody = document.getElementById('correspondenceBody');

    if (!correspondence || correspondence.length === 0) {
        tbody.innerHTML = `
            <tr><td colspan="10">
                <div class="corr-empty-state">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                        <polyline points="22,6 12,13 2,6"></polyline>
                    </svg>
                    <p>لا توجد خطابات</p>
                </div>
            </td></tr>`;
        return;
    }

    let html = '';

    correspondence.forEach(corr => {
        const isExpanded = (App.expandedRow == corr.id);
        const urgentClass = corr.priority === 'urgent' ? 'corr-row-urgent' : '';

        html += `<tr class="transaction-row ${isExpanded ? 'expanded' : ''} ${urgentClass}" data-id="${corr.id}" onclick="toggleCorrespondenceRow(${corr.id})">`;
        html += `<td><span class="tx-number">${corr.correspondence_number}</span></td>`;
        html += `<td style="white-space:nowrap;color:var(--text-secondary);">${formatDate(corr.correspondence_date)}</td>`;
        html += `<td>${getCorrespondenceTypeBadge(corr.type)}</td>`;
        html += `<td class="corr-subject-cell">${corr.subject}</td>`;
        html += `<td style="color:var(--text-secondary);">${corr.from_dept_name || corr.from_external || '<span style="color:var(--text-muted)">—</span>'}</td>`;
        html += `<td style="color:var(--text-secondary);">${corr.to_dept_name || corr.to_external || '<span style="color:var(--text-muted)">—</span>'}</td>`;
        html += `<td>${getPriorityBadge(corr.priority)}</td>`;
        html += `<td>${getCurrentStageBadge(corr.current_stage)}</td>`;
        html += `<td>`;
        if (corr.attachments_count > 0) {
            html += `<span class="corr-attach-badge">📎 ${corr.attachments_count}</span>`;
        } else {
            html += `<span style="color:var(--text-muted)">—</span>`;
        }
        html += `</td>`;
        html += `<td><div class="corr-row-actions">`;
        html += `<button class="btn-icon" onclick="event.stopPropagation();editCorrespondence(${corr.id})" title="تعديل">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
        </button>`;
        html += `<button class="btn-icon btn-icon-danger" onclick="event.stopPropagation();deleteCorrespondence(${corr.id})" title="حذف">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>`;
        html += `<svg class="expand-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--text-muted);transition:transform 0.3s;${isExpanded ? 'transform:rotate(180deg);' : ''}"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
        html += `</div></td>`;
        html += `</tr>`;

        if (isExpanded) {
            html += `<tr class="expanded-row"><td colspan="10" style="padding:0;">
                <div id="corr-details-${corr.id}" class="corr-details-loading"><div class="loading-spinner"></div></div>
            </td></tr>`;
        }
    });

    tbody.innerHTML = html;

    correspondence.forEach(corr => {
        if (App.expandedRow == corr.id) {
            loadCorrespondenceDetails(corr.id);
        }
    });
}

// =====================================================
// توسيع/طي صف الخطاب
// =====================================================

function toggleCorrespondenceRow(id) {
    App.expandedRow = (App.expandedRow === id) ? null : id;
    loadCorrespondenceList(getCorrFilters());
}

// =====================================================
// تحميل تفاصيل الخطاب
// =====================================================

function loadCorrespondenceDetails(id) {
    fetch(`api/correspondence_api.php?action=correspondence&id=${id}`)
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                displayCorrespondenceDetails(data.data);
            } else {
                showToast(data.message, 'error');
            }
        })
        .catch(err => {
            console.error('Error:', err);
            showToast('حدث خطأ في تحميل التفاصيل', 'error');
        });
}

// =====================================================
// عرض تفاصيل الخطاب (المحسّن)
// =====================================================

function displayCorrespondenceDetails(corr) {
    const container = document.getElementById(`corr-details-${corr.id}`);
    if (!container) return;

    let html = `
    <div class="corr-detail-wrapper">
        <div class="corr-meta-bar">
            <div class="corr-meta-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-blue)" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle></svg>
                <span class="corr-meta-key">أنشئت بواسطة</span>
                <span class="corr-meta-val">${corr.created_by_name || 'النظام'}</span>
            </div>
            <div class="corr-meta-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-green)" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                <span class="corr-meta-key">تاريخ الإنشاء</span>
                <span class="corr-meta-val">${formatDateTime(corr.created_at)}</span>
            </div>
            ${corr.deadline_date ? `
            <div class="corr-meta-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-orange)" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                <span class="corr-meta-key">الموعد النهائي</span>
                <span class="corr-meta-val" style="color:var(--accent-orange);font-weight:600;">${formatDate(corr.deadline_date)}</span>
            </div>` : ''}
            <div style="margin-right:auto;">
                <button class="corr-action-btn corr-btn-edit" onclick="editCorrespondence(${corr.id})">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    تعديل الخطاب
                </button>
            </div>
        </div>

        <div class="corr-detail-grid">

            <div class="corr-detail-section corr-section-full">
                <div class="corr-section-header corr-section-blue">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                    محتوى الخطاب
                </div>
                <div class="corr-section-body">
                    <div class="corr-detail-row">
                        <span class="corr-detail-label">الموضوع</span>
                        <span class="corr-detail-value" style="font-weight:600;color:var(--text-primary);font-size:1.05rem;">${corr.subject}</span>
                    </div>
                    ${corr.content ? `
                    <div class="corr-detail-row corr-detail-block">
                        <span class="corr-detail-label">التفاصيل</span>
                        <div class="corr-content-box">${corr.content}</div>
                    </div>` : ''}
                </div>
            </div>`;

    // سير العمل
    if (corr.stages && corr.stages.length > 0) {
        html += `
            <div class="corr-detail-section corr-section-full">
                <div class="corr-section-header corr-section-cyan">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                    سير العمل
                    <span class="corr-section-count">${corr.stages.length} مراحل</span>
                </div>
                <div class="corr-section-body">
                    <div class="corr-workflow-timeline">`;

        corr.stages.forEach((stage, index) => {
            const statusIcon = getStageStatusIcon(stage.status);
            const statusClass = stage.status === 'completed' ? 'corr-stage-done' :
                stage.status === 'in_progress' ? 'corr-stage-active' : 'corr-stage-pending';

            html += `
                        <div class="corr-stage-item ${statusClass}">
                            <div class="corr-stage-indicator">
                                <div class="corr-stage-dot">${statusIcon}</div>
                                ${index < corr.stages.length - 1 ? '<div class="corr-stage-connector"></div>' : ''}
                            </div>
                            <div class="corr-stage-content">
                                <div class="corr-stage-title-row">
                                    <strong>${stage.stage_name}</strong>
                                    ${getStageBadge(stage.status)}
                                    <button class="corr-stage-edit-btn" onclick="showEditStageModal(${stage.id}, ${corr.id})" title="تعديل المرحلة">
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                        تعديل
                                    </button>
                                </div>
                                ${stage.employee_name ? `<div class="corr-stage-meta"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>${stage.employee_name}</div>` : ''}
                                ${stage.started_at ? `<div class="corr-stage-meta"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>بدأت: ${formatDateTime(stage.started_at)}</div>` : ''}
                                ${stage.completed_at ? `<div class="corr-stage-meta" style="color:var(--accent-green);"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>اكتملت: ${formatDateTime(stage.completed_at)}</div>` : ''}
                                ${stage.duration_minutes ? `<div class="corr-stage-meta"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>المدة: ${stage.duration_minutes} دقيقة</div>` : ''}
                                ${stage.notes ? `<div class="corr-stage-notes">${stage.notes}</div>` : ''}
                            </div>
                        </div>`;
        });

        html += `</div></div></div>`;
    }

    // المرفقات
    if (corr.attachments && corr.attachments.length > 0) {
        html += `
            <div class="corr-detail-section">
                <div class="corr-section-header corr-section-orange">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
                    المرفقات
                    <span class="corr-section-count">${corr.attachments.length}</span>
                </div>
                <div class="corr-section-body">
                    <div class="corr-attachments-list">`;

        corr.attachments.forEach(att => {
            const ext = att.original_name.split('.').pop().toUpperCase();
            const extColors = { PDF: '#e53e3e', DOCX: '#2b6cb0', DOC: '#2b6cb0', XLSX: '#276749', XLS: '#276749', JPG: '#dd6b20', JPEG: '#dd6b20', PNG: '#805ad5' };
            const extColor = extColors[ext] || '#718096';

            html += `
                        <div class="corr-attach-item">
                            <div class="corr-attach-icon" style="background:${extColor}20;color:${extColor};">${ext}</div>
                            <div class="corr-attach-info">
                                <span class="corr-attach-name">${att.original_name}</span>
                                <span class="corr-attach-size">${formatFileSize(att.file_size)}</span>
                            </div>
                        </div>`;
        });

        html += `</div></div></div>`;
    }

    // التعليقات
    const commentsSectionClass = (corr.attachments && corr.attachments.length > 0) ? '' : 'corr-section-full';
    html += `
            <div class="corr-detail-section ${commentsSectionClass}">
                <div class="corr-section-header corr-section-purple">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                    التعليقات
                    <span class="corr-section-count">${corr.comments_count || 0}</span>
                </div>
                <div class="corr-section-body">`;

    if (corr.comments && corr.comments.length > 0) {
        html += `<div class="corr-comments-list">`;
        corr.comments.forEach(comment => {
            const initials = (comment.employee_name || 'م').substring(0, 1).toUpperCase();
            html += `
                    <div class="corr-comment-item">
                        <div class="corr-comment-avatar">${initials}</div>
                        <div class="corr-comment-body">
                            <div class="corr-comment-meta">
                                <strong>${comment.employee_name || 'مجهول'}</strong>
                                <span>${formatDateTime(comment.created_at)}</span>
                            </div>
                            <p>${comment.comment}</p>
                        </div>
                    </div>`;
        });
        html += `</div>`;
    } else {
        html += `<div class="corr-no-comments">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
            <p>لا توجد تعليقات بعد</p>
        </div>`;
    }

    html += `
                    <div class="corr-add-comment">
                        <textarea id="new-comment-${corr.id}" placeholder="اكتب تعليقاً..." rows="2"></textarea>
                        <button class="btn btn-primary corr-comment-submit" onclick="addComment(${corr.id})">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                            إرسال
                        </button>
                    </div>
                </div>
            </div>

        </div>
    </div>`;

    container.innerHTML = html;
}

// =====================================================
// إضافة تعليق
// =====================================================

function addComment(correspondenceId) {
    const textarea = document.getElementById(`new-comment-${correspondenceId}`);
    const commentText = textarea.value.trim();

    if (!commentText) {
        showToast('الرجاء إدخال تعليق', 'error');
        return;
    }

    fetch('api/correspondence_api.php?action=add_comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correspondence_id: correspondenceId, comment: commentText })
    })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                showToast('تم إضافة التعليق ✅', 'success');
                textarea.value = '';
                loadCorrespondenceDetails(correspondenceId);
            } else {
                showToast(data.message, 'error');
            }
        })
        .catch(err => {
            console.error('Error:', err);
            showToast('حدث خطأ', 'error');
        });
}

// =====================================================
// البحث والفلترة
// =====================================================

function getCorrFilters() {
    return {
        search: document.getElementById('corrSearchInput')?.value || '',
        type: document.getElementById('corrTypeFilter')?.value || '',
        priority: document.getElementById('corrPriorityFilter')?.value || ''
    };
}

function filterCorrespondence() {
    loadCorrespondenceList(getCorrFilters());
}

function searchCorrespondence() {
    filterCorrespondence();
}

function clearCorrFilters() {
    const els = ['corrSearchInput', 'corrTypeFilter', 'corrPriorityFilter'];
    els.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    loadCorrespondenceList();
}

// =====================================================
// إضافة خطاب جديد
// =====================================================

function showAddCorrespondenceModal() {
    fetch('api/correspondence_api.php?action=departments')
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                displayCorrespondenceForm(null, data.data);
            }
        });
}

// =====================================================
// تعديل خطاب
// =====================================================

function editCorrespondence(id) {
    Promise.all([
        fetch(`api/correspondence_api.php?action=correspondence&id=${id}`).then(r => r.json()),
        fetch('api/correspondence_api.php?action=departments').then(r => r.json())
    ])
        .then(([corrData, deptData]) => {
            if (corrData.success && deptData.success) {
                displayCorrespondenceForm(corrData.data, deptData.data);
            } else {
                showToast(corrData.message || 'فشل تحميل البيانات', 'error');
            }
        })
        .catch(err => {
            console.error('Error:', err);
            showToast('حدث خطأ في تحميل البيانات', 'error');
        });
}

// =====================================================
// نموذج الإضافة/التعديل الموحّد
// =====================================================

function displayCorrespondenceForm(corr, departments) {
    const isEdit = !!corr;
    const isExternal = isEdit && (corr.type === 'incoming' || corr.type === 'outgoing');

    const deptOpts = departments.map(d =>
        `<option value="${d.id}">${d.name}</option>`
    ).join('');

    DOM.modalTitle.innerHTML = isEdit
        ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg> تعديل الخطاب`
        : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"></path></svg> إضافة خطاب جديد`;

    const buildDeptSelect = (name, selectedId) => {
        let opts = `<option value="">اختر القسم</option>`;
        departments.forEach(d => {
            opts += `<option value="${d.id}" ${selectedId == d.id ? 'selected' : ''}>${d.name}</option>`;
        });
        return `<select name="${name}">${opts}</select>`;
    };

    DOM.modalBody.innerHTML = `
        <form id="corr-form" onsubmit="${isEdit ? `submitEditCorrespondence(event,${corr.id})` : 'submitCorrespondence(event)'}">

            ${isEdit ? `
            <div class="corr-edit-info-bar">
                <div class="corr-edit-badge">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path></svg>
                    ${corr.correspondence_number}
                </div>
                ${getCorrespondenceTypeBadge(corr.type)}
                <small style="margin-right:auto;color:var(--text-muted);">آخر تحديث: ${formatDateTime(corr.updated_at)}</small>
            </div>` : ''}

            <div class="corr-form-section">
                <div class="corr-form-section-title">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                    المعلومات الأساسية
                </div>
                <div class="corr-form-grid">
                    <div class="form-group">
                        <label>نوع الخطاب <span class="required">*</span></label>
                        <select name="type" required onchange="toggleExternalFields(this.value)" ${isEdit ? 'disabled' : ''}>
                            <option value="">اختر النوع</option>
                            <option value="internal_finance" ${isEdit && corr.type === 'internal_finance' ? 'selected' : ''}>💼 داخلي - مالي</option>
                            <option value="internal_general" ${isEdit && corr.type === 'internal_general' ? 'selected' : ''}>📋 داخلي - عام</option>
                            <option value="incoming" ${isEdit && corr.type === 'incoming' ? 'selected' : ''}>📥 وارد</option>
                            <option value="outgoing" ${isEdit && corr.type === 'outgoing' ? 'selected' : ''}>📤 صادر</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>الأولوية <span class="required">*</span></label>
                        <select name="priority" required>
                            <option value="low" ${isEdit && corr.priority === 'low' ? 'selected' : ''}>⚪ منخفض</option>
                            <option value="normal" ${(!isEdit || corr.priority === 'normal') ? 'selected' : ''}>🔵 عادي</option>
                            <option value="high" ${isEdit && corr.priority === 'high' ? 'selected' : ''}>🟠 مهم</option>
                            <option value="urgent" ${isEdit && corr.priority === 'urgent' ? 'selected' : ''}>🔴 عاجل جداً</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>التاريخ <span class="required">*</span></label>
                        <input type="date" name="correspondence_date" value="${isEdit ? corr.correspondence_date : new Date().toISOString().split('T')[0]}" required ${isEdit ? 'readonly' : ''}>
                    </div>
                    <div class="form-group">
                        <label>الموعد النهائي</label>
                        <input type="date" name="deadline_date" value="${isEdit && corr.deadline_date ? corr.deadline_date : ''}">
                    </div>
                </div>
            </div>

            <div class="corr-form-section">
                <div class="corr-form-section-title">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                    الأطراف
                </div>
                <div class="corr-form-grid" id="internal-fields" style="${isExternal ? 'display:none;' : ''}">
                    <div class="form-group">
                        <label>من قسم</label>
                        ${buildDeptSelect('from_department_id', isEdit ? corr.from_department_id : '')}
                    </div>
                    <div class="form-group">
                        <label>إلى قسم</label>
                        ${buildDeptSelect('to_department_id', isEdit ? corr.to_department_id : '')}
                    </div>
                </div>
                <div class="corr-form-grid" id="external-fields" style="${isExternal ? '' : 'display:none;'}">
                    <div class="form-group">
                        <label>من (جهة خارجية)</label>
                        <input type="text" name="from_external" placeholder="اسم الجهة أو الشخص" value="${isEdit && corr.from_external ? corr.from_external : ''}">
                    </div>
                    <div class="form-group">
                        <label>إلى (جهة خارجية)</label>
                        <input type="text" name="to_external" placeholder="اسم الجهة أو الشخص" value="${isEdit && corr.to_external ? corr.to_external : ''}">
                    </div>
                </div>
            </div>

            <div class="corr-form-section">
                <div class="corr-form-section-title">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                    محتوى الخطاب
                </div>
                <div class="form-group">
                    <label>الموضوع <span class="required">*</span></label>
                    <input type="text" name="subject" required placeholder="موضوع الخطاب" value="${isEdit ? corr.subject : ''}">
                </div>
                <div class="form-group">
                    <label>المحتوى / التفاصيل</label>
                    <textarea name="content" rows="5" placeholder="تفاصيل الخطاب...">${isEdit && corr.content ? corr.content : ''}</textarea>
                </div>
                ${!isEdit ? `
                <div class="form-group">
                    <label>المرفقات</label>
                    <div class="corr-file-upload">
                        <input type="file" name="attachments[]" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png" id="corrFileInput" style="display:none;" onchange="updateFileList(this)">
                        <label for="corrFileInput" class="corr-file-label">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
                            <span>انقر لرفع الملفات أو اسحبها هنا</span>
                            <small>PDF, Word, Excel, JPG — الحد الأقصى 10MB لكل ملف</small>
                        </label>
                        <div id="fileListPreview"></div>
                    </div>
                </div>` : ''}
            </div>

            <div class="corr-form-actions">
                <button type="submit" class="btn btn-primary">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v14a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline></svg>
                    ${isEdit ? 'حفظ التعديلات' : 'حفظ وإرسال'}
                </button>
                <button type="button" class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
            </div>
        </form>
    `;

    openModal();
}

function updateFileList(input) {
    const preview = document.getElementById('fileListPreview');
    if (!preview) return;
    const files = Array.from(input.files);
    if (files.length === 0) { preview.innerHTML = ''; return; }
    preview.innerHTML = `<div class="corr-file-chips">${files.map(f =>
        `<div class="corr-file-chip">📎 ${f.name} <small>(${formatFileSize(f.size)})</small></div>`
    ).join('')}</div>`;
}

function toggleExternalFields(type) {
    const internalFields = document.getElementById('internal-fields');
    const externalFields = document.getElementById('external-fields');
    if (type === 'incoming' || type === 'outgoing') {
        if (internalFields) internalFields.style.display = 'none';
        if (externalFields) externalFields.style.display = 'grid';
    } else {
        if (internalFields) internalFields.style.display = 'grid';
        if (externalFields) externalFields.style.display = 'none';
    }
}

// =====================================================
// حفظ خطاب جديد
// =====================================================

function submitCorrespondence(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    const btn = form.querySelector('button[type=submit]');

    btn.disabled = true;
    btn.innerHTML = '<div class="loading-spinner" style="width:15px;height:15px;border-width:2px;display:inline-block;"></div> جارٍ الحفظ...';

    fetch('api/correspondence_api.php?action=add', { method: 'POST', body: formData })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                showToast('✅ تم إضافة الخطاب بنجاح', 'success');
                closeModal();
                loadCorrespondenceList();
                loadCorrespondenceStats();
            } else {
                showToast(data.message, 'error');
                btn.disabled = false;
                btn.innerHTML = '💾 حفظ وإرسال';
            }
        })
        .catch(err => {
            console.error('Error:', err);
            showToast('حدث خطأ في إضافة الخطاب', 'error');
            btn.disabled = false;
            btn.innerHTML = '💾 حفظ وإرسال';
        });
}

// =====================================================
// حفظ تعديل خطاب
// =====================================================

function submitEditCorrespondence(event, id) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);

    const data = {
        id: id,
        subject: formData.get('subject'),
        content: formData.get('content'),
        priority: formData.get('priority'),
        deadline_date: formData.get('deadline_date') || '',
    };

    const fromDept = formData.get('from_department_id');
    const toDept = formData.get('to_department_id');
    const fromExternal = formData.get('from_external');
    const toExternal = formData.get('to_external');

    if (fromDept) data.from_department_id = fromDept;
    if (toDept) data.to_department_id = toDept;
    if (fromExternal !== null) data.from_external = fromExternal;
    if (toExternal !== null) data.to_external = toExternal;

    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.innerHTML = '<div class="loading-spinner" style="width:15px;height:15px;border-width:2px;display:inline-block;"></div> جارٍ الحفظ...';

    fetch('api/correspondence_api.php?action=update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
        .then(res => res.json())
        .then(result => {
            if (result.success) {
                showToast('✅ تم تحديث الخطاب بنجاح', 'success');
                closeModal();
                if (App.expandedRow == id) {
                    loadCorrespondenceDetails(id);
                }
                loadCorrespondenceList(getCorrFilters());
            } else {
                showToast(result.message || 'فشل التحديث', 'error');
                btn.disabled = false;
                btn.innerHTML = '💾 حفظ التعديلات';
            }
        })
        .catch(err => {
            console.error('Error:', err);
            showToast('حدث خطأ في التحديث', 'error');
            btn.disabled = false;
            btn.innerHTML = '💾 حفظ التعديلات';
        });
}

// =====================================================
// حذف خطاب
// =====================================================

function deleteCorrespondence(id) {
    if (!confirm('هل أنت متأكد من حذف هذا الخطاب؟\nلا يمكن التراجع عن هذا الإجراء.')) return;

    fetch('api/correspondence_api.php?action=delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
    })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                showToast('🗑️ تم حذف الخطاب', 'success');
                if (App.expandedRow == id) App.expandedRow = null;
                loadCorrespondenceList(getCorrFilters());
                loadCorrespondenceStats();
            } else {
                showToast(data.message || 'فشل الحذف', 'error');
            }
        })
        .catch(() => showToast('حدث خطأ', 'error'));
}

// =====================================================
// دوال مساعدة للعرض
// =====================================================

function getCorrespondenceTypeBadge(type) {
    const types = {
        'internal_finance': `<span class="corr-type-badge corr-type-finance">💼 داخلي - مالي</span>`,
        'internal_general': `<span class="corr-type-badge corr-type-general">📋 داخلي - عام</span>`,
        'incoming': `<span class="corr-type-badge corr-type-incoming">📥 وارد</span>`,
        'outgoing': `<span class="corr-type-badge corr-type-outgoing">📤 صادر</span>`
    };
    return types[type] || `<span class="corr-type-badge">${type}</span>`;
}

function getPriorityBadge(priority) {
    const p = {
        'low': `<span class="badge badge-secondary">منخفض</span>`,
        'normal': `<span class="badge badge-info">عادي</span>`,
        'high': `<span class="badge badge-warning">مهم</span>`,
        'urgent': `<span class="badge badge-danger">عاجل</span>`
    };
    return p[priority] || priority;
}

function getCurrentStageBadge(stage) {
    return `<span class="badge badge-info">${stage || 'جديد'}</span>`;
}

function getStageBadge(status) {
    const s = {
        'pending': `<span class="badge badge-secondary">انتظار</span>`,
        'in_progress': `<span class="badge badge-warning">جارٍ</span>`,
        'completed': `<span class="badge badge-success">مكتمل</span>`,
        'rejected': `<span class="badge badge-danger">مرفوض</span>`,
        'skipped': `<span class="badge badge-secondary">متخطى</span>`
    };
    return s[status] || status;
}

function getStageStatusIcon(status) {
    const icons = { 'pending': '⏸️', 'in_progress': '⚙️', 'completed': '✅', 'rejected': '❌', 'skipped': '⏭️' };
    return icons[status] || '⚪';
}

function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function formatDate(date) {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('ar-SA', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function formatDateTime(datetime) {
    if (!datetime) return '—';
    return new Date(datetime).toLocaleString('ar-SA', {
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
    });
}

// =====================================================
// تعديل مرحلة الخطاب
// =====================================================

function showEditStageModal(stageId, correspondenceId) {
    // تحميل بيانات المرحلة والموظفين بشكل متوازٍ
    Promise.all([
        fetch(`api/correspondence_api.php?action=stage&id=${stageId}`).then(r => r.json()),
        fetch('api/correspondence_api.php?action=employees').then(r => r.json())
    ])
        .then(([stageData, empData]) => {
            if (stageData.success && empData.success) {
                displayEditStageModal(stageData.data, empData.data, correspondenceId);
            } else {
                showToast(stageData.message || 'فشل تحميل بيانات المرحلة', 'error');
            }
        })
        .catch(err => {
            console.error('Error:', err);
            showToast('حدث خطأ في تحميل البيانات', 'error');
        });
}

function displayEditStageModal(stage, employees, correspondenceId) {
    const statusOptions = [
        { value: 'pending', label: '⏸ في الانتظار', color: 'var(--text-secondary)' },
        { value: 'in_progress', label: '⚙️ قيد المعالجة', color: 'var(--accent-orange)' },
        { value: 'completed', label: '✅ مكتمل', color: 'var(--accent-green)' },
        { value: 'rejected', label: '❌ مرفوض', color: 'var(--accent-red)' },
        { value: 'skipped', label: '⏭ متخطى', color: 'var(--text-muted)' },
    ];

    const empOptions = employees.map(e =>
        `<option value="${e.id}" ${stage.employee_id == e.id ? 'selected' : ''}>${e.name}${e.role ? ` — ${e.role}` : ''}</option>`
    ).join('');

    DOM.modalTitle.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>
        </svg>
        تعديل مرحلة: ${stage.stage_name}`;

    DOM.modalBody.innerHTML = `
        <form id="edit-stage-form" onsubmit="submitEditStage(event, ${stage.id}, ${correspondenceId})">

            <!-- معلومات المرحلة -->
            <div class="stage-modal-info">
                <div class="stage-modal-info-item">
                    <span class="stage-modal-info-label">رقم الترتيب</span>
                    <span class="stage-modal-info-val">مرحلة ${stage.stage_order}</span>
                </div>
                <div class="stage-modal-info-item">
                    <span class="stage-modal-info-label">الحالة الحالية</span>
                    <span>${getStageBadge(stage.status)}</span>
                </div>
                ${stage.started_at ? `
                <div class="stage-modal-info-item">
                    <span class="stage-modal-info-label">تاريخ البدء</span>
                    <span class="stage-modal-info-val">${formatDateTime(stage.started_at)}</span>
                </div>` : ''}
                ${stage.completed_at ? `
                <div class="stage-modal-info-item">
                    <span class="stage-modal-info-label">تاريخ الاكتمال</span>
                    <span class="stage-modal-info-val" style="color:var(--accent-green);">${formatDateTime(stage.completed_at)}</span>
                </div>` : ''}
            </div>

            <!-- تغيير الحالة -->
            <div class="corr-form-section">
                <div class="corr-form-section-title">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                    حالة المرحلة
                </div>

                <div class="stage-status-grid">
                    ${statusOptions.map(opt => `
                        <label class="stage-status-option ${stage.status === opt.value ? 'selected' : ''}">
                            <input type="radio" name="status" value="${opt.value}" ${stage.status === opt.value ? 'checked' : ''}
                                onchange="document.querySelectorAll('.stage-status-option').forEach(el=>el.classList.remove('selected')); this.closest('.stage-status-option').classList.add('selected');">
                            <span>${opt.label}</span>
                        </label>
                    `).join('')}
                </div>
            </div>

            <!-- المسؤول -->
            <div class="corr-form-section">
                <div class="corr-form-section-title">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                    المسؤول عن المرحلة
                </div>
                <div class="form-group" style="margin:0;">
                    <select name="employee_id">
                        <option value="">— لا يوجد مسؤول محدد —</option>
                        ${empOptions}
                    </select>
                </div>
            </div>

            <!-- الإجراء المتخذ والملاحظات -->
            <div class="corr-form-section">
                <div class="corr-form-section-title">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                    تفاصيل الإجراء
                </div>

                <div class="corr-form-grid">
                    <div class="form-group">
                        <label>نوع الإجراء</label>
                        <select name="action_type">
                            <option value="" ${!stage.action_type ? 'selected' : ''}>— اختر الإجراء —</option>
                            <option value="approved"   ${stage.action_type === 'approved' ? 'selected' : ''}>✅ موافقة</option>
                            <option value="rejected"   ${stage.action_type === 'rejected' ? 'selected' : ''}>❌ رفض</option>
                            <option value="returned"   ${stage.action_type === 'returned' ? 'selected' : ''}>↩ إعادة</option>
                            <option value="forwarded"  ${stage.action_type === 'forwarded' ? 'selected' : ''}>➡ إحالة</option>
                            <option value="reviewed"   ${stage.action_type === 'reviewed' ? 'selected' : ''}>👁 مراجعة</option>
                            <option value="signed"     ${stage.action_type === 'signed' ? 'selected' : ''}>✍ توقيع</option>
                            <option value="archived"   ${stage.action_type === 'archived' ? 'selected' : ''}>📁 أرشفة</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>اسم المرحلة</label>
                        <input type="text" name="stage_name" value="${stage.stage_name || ''}" placeholder="اسم المرحلة">
                    </div>
                </div>

                <div class="form-group" style="margin-top:0.75rem;">
                    <label>الملاحظات</label>
                    <textarea name="notes" rows="4" placeholder="أضف ملاحظاتك أو تفاصيل الإجراء المتخذ...">${stage.notes || ''}</textarea>
                </div>
            </div>

            <!-- أزرار سريعة -->
            <div class="stage-quick-actions">
                <button type="button" class="stage-quick-btn stage-quick-approve"
                    onclick="quickStageAction(${stage.id}, ${correspondenceId}, 'completed', 'approved')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    موافقة سريعة
                </button>
                <button type="button" class="stage-quick-btn stage-quick-reject"
                    onclick="quickStageAction(${stage.id}, ${correspondenceId}, 'rejected', 'rejected')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    رفض سريع
                </button>
                <button type="button" class="stage-quick-btn stage-quick-return"
                    onclick="quickStageAction(${stage.id}, ${correspondenceId}, 'pending', 'returned')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 .49-3.51"></path></svg>
                    إعادة للانتظار
                </button>
            </div>

            <div class="corr-form-actions" style="margin-top:1rem;">
                <button type="submit" class="btn btn-primary">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v14a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline></svg>
                    حفظ التعديلات
                </button>
                <button type="button" class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
            </div>
        </form>
    `;

    openModal();
}

function submitEditStage(event, stageId, correspondenceId) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);

    const data = {
        stage_id: stageId,
        status: formData.get('status'),
        notes: formData.get('notes') || '',
        action_type: formData.get('action_type') || '',
        stage_name: formData.get('stage_name') || '',
    };

    const employeeId = formData.get('employee_id');
    if (employeeId) data.employee_id = parseInt(employeeId);

    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.innerHTML = '<div class="loading-spinner" style="width:15px;height:15px;border-width:2px;display:inline-block;"></div> جارٍ الحفظ...';

    fetch('api/correspondence_api.php?action=update_stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
        .then(res => res.json())
        .then(result => {
            if (result.success) {
                showToast('✅ تم تحديث المرحلة بنجاح', 'success');
                closeModal();
                loadCorrespondenceDetails(correspondenceId);
                loadCorrespondenceStats();
                // تحديث الجدول الرئيسي لتحديث عمود المرحلة
                loadCorrespondenceList(getCorrFilters());
            } else {
                showToast(result.message || 'فشل التحديث', 'error');
                btn.disabled = false;
                btn.innerHTML = '💾 حفظ التعديلات';
            }
        })
        .catch(err => {
            console.error('Error:', err);
            showToast('حدث خطأ في التحديث', 'error');
            btn.disabled = false;
            btn.innerHTML = '💾 حفظ التعديلات';
        });
}

// إجراء سريع على المرحلة (موافقة/رفض/إعادة)
function quickStageAction(stageId, correspondenceId, status, actionType) {
    const labels = { completed: 'الموافقة', rejected: 'الرفض', pending: 'الإعادة للانتظار' };
    if (!confirm(`هل تريد تأكيد ${labels[status] || status}؟`)) return;

    fetch('api/correspondence_api.php?action=update_stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage_id: stageId, status, action_type: actionType })
    })
        .then(res => res.json())
        .then(result => {
            if (result.success) {
                showToast(`✅ تم ${labels[status]} بنجاح`, 'success');
                closeModal();
                loadCorrespondenceDetails(correspondenceId);
                loadCorrespondenceList(getCorrFilters());
                loadCorrespondenceStats();
            } else {
                showToast(result.message || 'فشل الإجراء', 'error');
            }
        })
        .catch(() => showToast('حدث خطأ', 'error'));
}