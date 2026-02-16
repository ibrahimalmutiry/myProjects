/**
 * نظام إدارة الخطابات والمراسلات - JavaScript
 * نفس تصميم المعاملات المالية
 */

// =====================================================
// تحميل صفحة الخطابات
// =====================================================

function loadCorrespondencePage() {
    const html = `
        <div class="toolbar">
            <div class="toolbar-search">
                <div class="search-input">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="8"></circle>
                        <path d="m21 21-4.35-4.35"></path>
                    </svg>
                    <input type="text" id="corrSearchInput" placeholder="بحث في الخطابات..." oninput="searchCorrespondence()">
                </div>
                <select id="corrTypeFilter" class="filter-select" onchange="filterCorrespondence()">
                    <option value="">جميع الأنواع</option>
                    <option value="internal_finance">داخلي - مالي</option>
                    <option value="internal_general">داخلي - عام</option>
                    <option value="incoming">وارد</option>
                    <option value="outgoing">صادر</option>
                </select>
                <select id="corrPriorityFilter" class="filter-select" onchange="filterCorrespondence()">
                    <option value="">جميع الأولويات</option>
                    <option value="normal">عادي</option>
                    <option value="high">مهم</option>
                    <option value="urgent">عاجل جداً</option>
                </select>
            </div>
            <button class="btn btn-primary" onclick="showAddCorrespondenceModal()">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 5v14M5 12h14"></path>
                </svg>
                خطاب جديد
            </button>
        </div>
        
        <div class="card">
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
                            <th>المرفقات</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody id="correspondenceBody">
                        <tr><td colspan="10" style="text-align: center; padding: 3rem;">
                            <div class="loading-spinner"></div>
                        </td></tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;

    DOM.mainContent.innerHTML = html;

    // تحميل البيانات
    loadCorrespondenceList();
}

// =====================================================
// تحميل قائمة الخطابات
// =====================================================

function loadCorrespondenceList(filters = {}) {
    const params = new URLSearchParams({
        action: 'correspondence_list',
        ...filters
    });

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
        tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; padding: 3rem; color: var(--text-muted);">لا توجد خطابات</td></tr>';
        return;
    }

    let html = '';

    correspondence.forEach(corr => {
        const isExpanded = (App.expandedRow == corr.id);

        // صف الخطاب الرئيسي
        html += `<tr class="transaction-row ${isExpanded ? 'expanded' : ''}" data-id="${corr.id}" onclick="toggleCorrespondenceRow(${corr.id})">`;
        html += `<td><span class="tx-number">${corr.correspondence_number}</span></td>`;
        html += `<td>${formatDate(corr.correspondence_date)}</td>`;
        html += `<td>${getCorrespondenceTypeBadge(corr.type)}</td>`;
        html += `<td style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${corr.subject}</td>`;
        html += `<td>${corr.from_dept_name || corr.from_external || '—'}</td>`;
        html += `<td>${corr.to_dept_name || corr.to_external || '—'}</td>`;
        html += `<td>${getPriorityBadge(corr.priority)}</td>`;
        html += `<td>${getCurrentStageBadge(corr.current_stage)}</td>`;
        html += `<td>${corr.attachments_count || 0}</td>`;
        html += `<td>`;
        html += `<div style="display: flex; align-items: center; gap: 0.5rem;">`;
        html += `<button class="btn-icon" onclick="event.stopPropagation(); editCorrespondence(${corr.id})" title="تعديل">`;
        html += `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;
        html += `</button>`;
        html += `<svg class="expand-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--text-muted); transition: transform 0.3s; ${isExpanded ? 'transform: rotate(180deg);' : ''}">`;
        html += `<polyline points="6 9 12 15 18 9"></polyline>`;
        html += `</svg>`;
        html += `</div>`;
        html += `</td>`;
        html += `</tr>`;

        // صف التفاصيل الموسع
        if (isExpanded) {
            html += `<tr class="expanded-row">`;
            html += `<td colspan="10" style="padding: 0;">`;
            html += `<div id="corr-details-${corr.id}">`;
            html += `<div class="loading-spinner" style="margin: 2rem;"></div>`;
            html += `</div>`;
            html += `</td>`;
            html += `</tr>`;
        }
    });

    tbody.innerHTML = html;

    // تحميل التفاصيل للخطابات الموسعة
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
    if (App.expandedRow === id) {
        App.expandedRow = null;
    } else {
        App.expandedRow = id;
    }

    // إعادة رسم الجدول
    const filters = {
        search: document.getElementById('corrSearchInput')?.value || '',
        type: document.getElementById('corrTypeFilter')?.value || '',
        priority: document.getElementById('corrPriorityFilter')?.value || ''
    };
    loadCorrespondenceList(filters);
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
// عرض تفاصيل الخطاب
// =====================================================

function displayCorrespondenceDetails(corr) {
    const container = document.getElementById(`corr-details-${corr.id}`);
    if (!container) return;

    let html = '';

    // معلومات الإنشاء
    html += `<div class="creation-info-bar" style="background: var(--bg-surface); padding: 0.75rem 1.5rem; border-bottom: 1px solid var(--border-color); display: flex; align-items: center; gap: 2rem; flex-wrap: wrap;">`;
    html += `<div style="display: flex; align-items: center; gap: 0.5rem;">`;
    html += `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-blue)" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle></svg>`;
    html += `<span style="color: var(--text-muted); font-size: 0.85rem;">أنشئت بواسطة:</span>`;
    html += `<span style="color: var(--text-primary); font-weight: 600;">${corr.created_by_name || 'النظام'}</span>`;
    html += `</div>`;
    html += `<div style="display: flex; align-items: center; gap: 0.5rem;">`;
    html += `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-green)" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`;
    html += `<span style="color: var(--text-muted); font-size: 0.85rem;">وقت الإنشاء:</span>`;
    html += `<span style="color: var(--text-primary); font-weight: 500;">${formatDateTime(corr.created_at)}</span>`;
    html += `</div>`;
    if (corr.deadline_date) {
        html += `<div style="display: flex; align-items: center; gap: 0.5rem;">`;
        html += `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-orange)" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`;
        html += `<span style="color: var(--text-muted); font-size: 0.85rem;">الموعد النهائي:</span>`;
        html += `<span style="color: var(--text-primary); font-weight: 500;">${formatDate(corr.deadline_date)}</span>`;
        html += `</div>`;
    }
    html += `</div>`;

    html += `<div class="expanded-content-correspondence">`;

    // قسم المحتوى
    html += `<div class="detail-section" style="grid-column: 1 / -1; background: rgba(74, 171, 247, 0.03); border-color: rgba(74, 171, 247, 0.2);">`;
    html += `<div class="detail-header" style="color: var(--accent-blue);">`;
    html += `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;
    html += ` محتوى الخطاب`;
    html += `</div>`;
    html += `<div class="detail-row"><span class="detail-label">الموضوع:</span><span class="detail-value" style="font-weight: 600; color: var(--text-primary);">${corr.subject}</span></div>`;
    if (corr.content) {
        html += `<div class="detail-row" style="display: block;"><span class="detail-label" style="margin-bottom: 0.5rem; display: block;">التفاصيل:</span><div style="padding: 1rem; background: var(--bg-surface); border-radius: 8px; line-height: 1.7; color: var(--text-primary); border-right: 3px solid var(--accent-blue);">${corr.content}</div></div>`;
    }
    html += `</div>`;

    // قسم سير العمل
    if (corr.stages && corr.stages.length > 0) {
        html += `<div class="detail-section" style="grid-column: 1 / -1; background: rgba(74, 171, 247, 0.03); border-color: rgba(74, 171, 247, 0.2);">`;
        html += `<div class="detail-header" style="color: var(--accent-cyan);">`;
        html += `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`;
        html += ` سير العمل`;
        html += `</div>`;

        html += `<div class="stages-timeline">`;
        corr.stages.forEach((stage, index) => {
            const statusIcon = getStageStatusIcon(stage.status);
            const statusClass = stage.status === 'completed' ? 'completed' : stage.status === 'in_progress' ? 'active' : '';

            html += `<div class="stage-item ${statusClass}">`;
            html += `<div class="stage-dot">${statusIcon}</div>`;
            html += `<div class="stage-line"></div>`;
            html += `<div class="stage-content">`;
            html += `<div class="stage-header">`;
            html += `<strong>${stage.stage_name}</strong>`;
            html += getStageBadge(stage.status);
            html += `</div>`;
            if (stage.employee_name) {
                html += `<div class="stage-info">`;
                html += `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;
                html += `${stage.employee_name}`;
                html += `</div>`;
            }
            if (stage.started_at) {
                html += `<div class="stage-info">`;
                html += `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`;
                html += `${formatDateTime(stage.started_at)}`;
                html += `</div>`;
            }
            if (stage.duration_minutes) {
                html += `<div class="stage-info">`;
                html += `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`;
                html += `المدة: ${stage.duration_minutes} دقيقة`;
                html += `</div>`;
            }
            if (stage.notes) {
                html += `<div class="stage-notes">${stage.notes}</div>`;
            }
            html += `</div>`;
            html += `</div>`;
        });
        html += `</div>`;
        html += `</div>`;
    }

    // قسم المرفقات
    if (corr.attachments && corr.attachments.length > 0) {
        html += `<div class="detail-section" style="background: rgba(255, 169, 77, 0.03); border-color: rgba(255, 169, 77, 0.2);">`;
        html += `<div class="detail-header" style="color: var(--accent-orange);">`;
        html += `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>`;
        html += ` المرفقات (${corr.attachments.length})`;
        html += `</div>`;
        corr.attachments.forEach(att => {
            html += `<div class="detail-row" style="align-items: center; padding: 0.5rem; background: var(--bg-surface); border-radius: 6px; margin-bottom: 0.5rem;">`;
            html += `<span class="detail-label" style="min-width: auto;">📎</span>`;
            html += `<span class="detail-value" style="flex: 1;">${att.original_name} <small style="color: var(--text-muted);">(${formatFileSize(att.file_size)})</small></span>`;
            html += `</div>`;
        });
        html += `</div>`;
    }

    // قسم التعليقات
    html += `<div class="detail-section" style="background: rgba(177, 151, 252, 0.03); border-color: rgba(177, 151, 252, 0.2);">`;
    html += `<div class="detail-header" style="color: var(--accent-purple);">`;
    html += `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`;
    html += ` التعليقات (${corr.comments_count || 0})`;
    html += `</div>`;

    if (corr.comments && corr.comments.length > 0) {
        corr.comments.forEach(comment => {
            html += `<div class="comment-item">`;
            html += `<div class="comment-header">`;
            html += `<strong>${comment.employee_name}</strong>`;
            html += `<small>${formatDateTime(comment.created_at)}</small>`;
            html += `</div>`;
            html += `<div class="comment-body">${comment.comment}</div>`;
            html += `</div>`;
        });
    } else {
        html += `<div style="text-align: center; padding: 1.5rem; color: var(--text-muted);">لا توجد تعليقات</div>`;
    }

    // نموذج إضافة تعليق
    html += `<div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border-color);">`;
    html += `<textarea id="new-comment-${corr.id}" placeholder="أضف تعليقاً..." rows="3" style="width: 100%; padding: 0.875rem; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-surface); color: var(--text-primary); font-family: inherit; resize: vertical; transition: border-color 0.2s;"></textarea>`;
    html += `<button class="btn btn-primary" onclick="addComment(${corr.id})" style="margin-top: 0.75rem;">`;
    html += `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"></path></svg>`;
    html += ` إضافة تعليق</button>`;
    html += `</div>`;
    html += `</div>`;

    html += `</div>`;

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
        body: JSON.stringify({
            correspondence_id: correspondenceId,
            comment: commentText
        })
    })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                showToast('تم إضافة التعليق', 'success');
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

function searchCorrespondence() {
    filterCorrespondence();
}

function filterCorrespondence() {
    const filters = {
        search: document.getElementById('corrSearchInput')?.value || '',
        type: document.getElementById('corrTypeFilter')?.value || '',
        priority: document.getElementById('corrPriorityFilter')?.value || ''
    };

    loadCorrespondenceList(filters);
}

// =====================================================
// إضافة خطاب جديد
// =====================================================

function showAddCorrespondenceModal() {
    // تحميل الأقسام أولاً
    fetch('api/correspondence_api.php?action=departments')
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                displayAddCorrespondenceForm(data.data);
            }
        });
}

function displayAddCorrespondenceForm(departments) {
    let deptOptions = '<option value="">اختر القسم</option>';
    departments.forEach(dept => {
        deptOptions += `<option value="${dept.id}">${dept.name}</option>`;
    });

    DOM.modalTitle.textContent = '➕ إضافة خطاب جديد';
    DOM.modalBody.innerHTML = `
        <form id="add-correspondence-form" onsubmit="submitCorrespondence(event)">
            <div class="form-grid">
                <div class="form-group">
                    <label>نوع الخطاب *</label>
                    <select name="type" required onchange="toggleExternalFields(this.value)">
                        <option value="">اختر النوع</option>
                        <option value="internal_finance">داخلي - قطاع مالي</option>
                        <option value="internal_general">داخلي - عام</option>
                        <option value="incoming">وارد</option>
                        <option value="outgoing">صادر</option>
                    </select>
                </div>

                <div class="form-group">
                    <label>الأولوية *</label>
                    <select name="priority" required>
                        <option value="normal">عادي</option>
                        <option value="high">مهم</option>
                        <option value="urgent">عاجل جداً</option>
                    </select>
                </div>

                <div class="form-group">
                    <label>التاريخ *</label>
                    <input type="date" name="correspondence_date" value="${new Date().toISOString().split('T')[0]}" required>
                </div>

                <div class="form-group">
                    <label>الموعد النهائي</label>
                    <input type="date" name="deadline_date">
                </div>
            </div>

            <div class="form-grid" id="internal-fields">
                <div class="form-group">
                    <label>من قسم *</label>
                    <select name="from_department_id">
                        ${deptOptions}
                    </select>
                </div>

                <div class="form-group">
                    <label>إلى قسم *</label>
                    <select name="to_department_id">
                        ${deptOptions}
                    </select>
                </div>
            </div>

            <div class="form-grid" id="external-fields" style="display: none;">
                <div class="form-group">
                    <label>من (جهة خارجية)</label>
                    <input type="text" name="from_external" placeholder="اسم الجهة أو الشخص">
                </div>

                <div class="form-group">
                    <label>إلى (جهة خارجية)</label>
                    <input type="text" name="to_external" placeholder="اسم الجهة أو الشخص">
                </div>
            </div>

            <div class="form-group">
                <label>الموضوع *</label>
                <input type="text" name="subject" required placeholder="موضوع الخطاب">
            </div>

            <div class="form-group">
                <label>المحتوى / التفاصيل</label>
                <textarea name="content" rows="5" placeholder="تفاصيل الخطاب..."></textarea>
            </div>

            <div class="form-group">
                <label>المرفقات</label>
                <input type="file" name="attachments[]" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png">
                <small class="form-text">يمكنك رفع حتى 5 ملفات (الحد الأقصى 10MB لكل ملف)</small>
            </div>

            <div class="form-actions">
                <button type="submit" class="btn btn-primary">
                    💾 حفظ وإرسال
                </button>
                <button type="button" class="btn btn-secondary" onclick="closeModal()">
                    إلغاء
                </button>
            </div>
        </form>
    `;

    openModal();
}

function toggleExternalFields(type) {
    const internalFields = document.getElementById('internal-fields');
    const externalFields = document.getElementById('external-fields');

    if (type === 'incoming' || type === 'outgoing') {
        internalFields.style.display = 'none';
        externalFields.style.display = 'grid';
    } else {
        internalFields.style.display = 'grid';
        externalFields.style.display = 'none';
    }
}

function submitCorrespondence(event) {
    event.preventDefault();

    const form = event.target;
    const formData = new FormData(form);

    fetch('api/correspondence_api.php?action=add', {
        method: 'POST',
        body: formData
    })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                showToast('تم إضافة الخطاب بنجاح', 'success');
                closeModal();
                loadCorrespondenceList();
            } else {
                showToast(data.message, 'error');
            }
        })
        .catch(err => {
            console.error('Error:', err);
            showToast('حدث خطأ في إضافة الخطاب', 'error');
        });
}

function editCorrespondence(id) {
    showToast('ميزة التعديل قيد التطوير', 'info');
}

// =====================================================
// دوال مساعدة
// =====================================================

function getCorrespondenceTypeBadge(type) {
    const types = {
        'internal_finance': '<span class="tx-type" style="background: linear-gradient(135deg, var(--accent-cyan) 0%, var(--accent-blue) 100%); color: white; padding: 0.25rem 0.75rem; border-radius: 4px; font-size: 0.85rem;">داخلي - مالي</span>',
        'internal_general': '<span class="tx-type" style="background: linear-gradient(135deg, var(--accent-green) 0%, var(--accent-cyan) 100%); color: white; padding: 0.25rem 0.75rem; border-radius: 4px; font-size: 0.85rem;">داخلي - عام</span>',
        'incoming': '<span class="tx-type" style="background: linear-gradient(135deg, var(--accent-orange) 0%, var(--accent-yellow) 100%); color: white; padding: 0.25rem 0.75rem; border-radius: 4px; font-size: 0.85rem;">وارد</span>',
        'outgoing': '<span class="tx-type" style="background: linear-gradient(135deg, var(--accent-purple) 0%, var(--accent-pink) 100%); color: white; padding: 0.25rem 0.75rem; border-radius: 4px; font-size: 0.85rem;">صادر</span>'
    };
    return types[type] || type;
}

function getPriorityBadge(priority) {
    const priorities = {
        'low': '<span class="badge badge-secondary">عادي</span>',
        'normal': '<span class="badge badge-info">متوسط</span>',
        'high': '<span class="badge badge-warning">مهم</span>',
        'urgent': '<span class="badge badge-danger">عاجل جداً</span>'
    };
    return priorities[priority] || priority;
}

function getCurrentStageBadge(stage) {
    return '<span class="badge badge-info">' + (stage || 'جديد') + '</span>';
}

function getStageBadge(status) {
    const statuses = {
        'pending': '<span class="badge badge-secondary">في الانتظار</span>',
        'in_progress': '<span class="badge badge-warning">قيد المعالجة</span>',
        'completed': '<span class="badge badge-success">مكتمل</span>',
        'rejected': '<span class="badge badge-danger">مرفوض</span>',
        'skipped': '<span class="badge badge-secondary">متخطى</span>'
    };
    return statuses[status] || status;
}

function getStageStatusIcon(status) {
    const icons = {
        'pending': '⏸️',
        'in_progress': '🟡',
        'completed': '✅',
        'rejected': '❌',
        'skipped': '⏭️'
    };
    return icons[status] || '⚪';
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function formatDate(date) {
    if (!date) return '—';
    const d = new Date(date);
    return d.toLocaleDateString('ar-SA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
}

function formatDateTime(datetime) {
    if (!datetime) return '—';
    const date = new Date(datetime);
    return date.toLocaleString('ar-SA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}




// في صفحة الإعدادات - إضافة قسم العملات

function loadCurrencySettings() {
    fetch('api/?action=currencies')
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                displayCurrencySettings(data.data);
            }
        });
}

function displayCurrencySettings(currencies) {
    const html = `
        <div class="settings-section">
            <h3 style="margin-bottom: 1.5rem; display: flex; align-items: center; gap: 0.75rem;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="12" y1="1" x2="12" y2="23"></line>
                    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                </svg>
                إدارة العملات وأسعار الصرف
            </h3>
            
            <div class="currencies-grid">
                ${currencies.map(currency => `
                    <div class="currency-settings-card ${!currency.is_active ? 'disabled' : ''}">
                        <div class="currency-header">
                            <div class="currency-info">
                                <span class="currency-symbol">${currency.symbol}</span>
                                <div>
                                    <div class="currency-code">${currency.code}</div>
                                    <div class="currency-name">${currency.name_ar}</div>
                                </div>
                            </div>
                            <label class="toggle-switch">
                                <input type="checkbox" ${currency.is_active ? 'checked' : ''} 
                                       onchange="toggleCurrency('${currency.code}', this.checked)">
                                <span class="toggle-slider"></span>
                            </label>
                        </div>
                        
                        <div class="exchange-rate-input">
                            <label>سعر الصرف مقابل الريال السعودي</label>
                            <div class="rate-input-group">
                                <span class="rate-prefix">1 ${currency.code} =</span>
                                <input type="number" 
                                       value="${currency.exchange_rate_to_sar}" 
                                       step="0.0001" 
                                       min="0"
                                       ${currency.code === 'SAR' ? 'readonly' : ''}
                                       id="rate-${currency.code}"
                                       onchange="updateExchangeRate('${currency.code}', this.value)">
                                <span class="rate-suffix">ر.س</span>
                            </div>
                            <div class="rate-example">
                                مثال: ${(100 * currency.exchange_rate_to_sar).toFixed(2)} ر.س = 100 ${currency.code}
                            </div>
                        </div>
                        
                        <div class="last-update">
                            آخر تحديث: ${new Date(currency.updated_at).toLocaleString('ar-SA')}
                        </div>
                    </div>
                `).join('')}
            </div>
            
            <div class="info-box" style="margin-top: 2rem;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="16" x2="12" y2="12"></line>
                    <line x1="12" y1="8" x2="12.01" y2="8"></line>
                </svg>
                <div>
                    <strong>ملاحظة هامة:</strong>
                    <p>• سعر الصرف يمثل كم ريال سعودي يساوي وحدة واحدة من العملة</p>
                    <p>• التغييرات تطبق على المعاملات الجديدة فقط</p>
                    <p>• المعاملات القديمة تحتفظ بسعر الصرف وقت إنشائها</p>
                </div>
            </div>
        </div>
    `;

    document.getElementById('currency-settings-container').innerHTML = html;
}

// تحديث سعر صرف عملة
function updateExchangeRate(currencyCode, newRate) {
    if (currencyCode === 'SAR') return;

    fetch('api/?action=update_currency_rate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            currency_code: currencyCode,
            exchange_rate: parseFloat(newRate)
        })
    })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                showToast(`تم تحديث سعر صرف ${currencyCode} ✅`, 'success');
                loadCurrencySettings();
            } else {
                showToast(data.message || 'فشل التحديث', 'error');
            }
        })
        .catch(err => {
            console.error('Error:', err);
            showToast('حدث خطأ', 'error');
        });
}

// تفعيل/تعطيل عملة
function toggleCurrency(currencyCode, isActive) {
    if (currencyCode === 'SAR') {
        showToast('لا يمكن تعطيل الريال السعودي', 'error');
        return;
    }

    fetch('api/?action=toggle_currency', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            currency_code: currencyCode,
            is_active: isActive
        })
    })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                showToast(isActive ? `تم تفعيل ${currencyCode}` : `تم تعطيل ${currencyCode}`, 'success');
                loadCurrencySettings();
            } else {
                showToast(data.message || 'فشل التحديث', 'error');
            }
        });
}
