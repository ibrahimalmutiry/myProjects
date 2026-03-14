/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║      app-settings-core.js — صفحة الإعدادات الأساسية         ║
 * ║  يتطلب: app-common.js, app-transactions.js                   ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

// ═══════════════════════════════════════════════════════════
//  صفحة الإعدادات — الهيكل والتنقل
// ═══════════════════════════════════════════════════════════

/**
 * تحميل صفحة الإعدادات الرئيسية
 * تعرض: الموظفون / الأداء / أنواع المعاملات / جميع المعاملات / النظام
 */
// تحميل صفحة الإعدادات
async function loadSettingsPage() {
    DOM.mainContent.innerHTML = `
        <div class="settings-page-new">

            <!-- شريط التبويبات العلوي -->
            <div class="settings-topbar">
                <button class="settings-tab-btn active" data-section="employees" onclick="showSettingsSection('employees', this)">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                        <circle cx="9" cy="7" r="4"></circle>
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                        <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                    </svg>
                    الموظفين
                </button>
                <button class="settings-tab-btn" data-section="types" onclick="showSettingsSection('types', this)">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="8" y1="6" x2="21" y2="6"></line>
                        <line x1="8" y1="12" x2="21" y2="12"></line>
                        <line x1="8" y1="18" x2="21" y2="18"></line>
                        <line x1="3" y1="6" x2="3.01" y2="6"></line>
                        <line x1="3" y1="12" x2="3.01" y2="12"></line>
                        <line x1="3" y1="18" x2="3.01" y2="18"></line>
                    </svg>
                    أنواع المعاملات
                </button>
                <button class="settings-tab-btn" data-section="all-transactions" onclick="showSettingsSection('all-transactions', this)">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                    </svg>
                    جميع المعاملات
                </button>
                <button class="settings-tab-btn" data-section="cost-centers" onclick="showSettingsSection('cost-centers', this)">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
                    </svg>
                    مراكز التكلفة
                </button>
                <button class="settings-tab-btn" data-section="budget-categories" onclick="showSettingsSection('budget-categories', this)">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
                    </svg>
                    بنود الموازنة
                </button>
                <button class="settings-tab-btn" data-section="departments" onclick="showSettingsSection('departments', this)">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
                        <line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/>
                    </svg>
                    الأقسام
                </button>
                <button class="settings-tab-btn" data-section="system" onclick="showSettingsSection('system', this)">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="3"></circle>
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                    </svg>
                    النظام
                </button>
                <button class="settings-tab-btn" data-section="system-dashboard" onclick="showSettingsSection('system-dashboard', this)">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
                    </svg>
                    لوحة النظام
                </button>
            </div>

            <!-- المحتوى -->
            <div class="settings-content" id="settingsContent"></div>
        </div>
    `;

    await loadSettingsEmployees();
    showSettingsSection('employees', document.querySelector('.settings-tab-btn'));
}

// عرض قسم في الإعدادات
function showSettingsSection(section, btn) {
    document.querySelectorAll('.settings-tab-btn, .settings-nav-btn').forEach(function (b) {
        b.classList.remove('active');
    });
    if (btn) btn.classList.add('active');

    if (section === 'employees') {
        renderEmployeesSection();
    } else if (section === 'types') {
        renderTypesSection();
    } else if (section === 'all-transactions') {
        renderAllTransactionsSection();
    } else if (section === 'departments') {
        renderDepartmentsSection();
    } else if (section === 'cost-centers') {
        renderCostCentersSection();
    } else if (section === 'budget-categories') {
        renderBudgetCategoriesSection();
    } else if (section === 'system') {
        renderSystemSection();
    } else if (section === 'system-dashboard') {
        renderSystemDashboard();
    }
}

// ========== قسم جميع المعاملات ==========
function renderAllTransactionsSection() {
    var content = document.getElementById('settingsContent');

    var html = '<div class="settings-section-header">';
    html += '<h2>جميع المعاملات</h2>';
    html += '<div class="header-actions">';
    html += '<input type="text" class="search-input-sm" id="txSearchInput" placeholder="بحث..." oninput="filterSettingsTransactions()">';
    html += '<button class="btn btn-secondary" onclick="exportTransactions()"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> تصدير</button>';
    html += '</div>';
    html += '</div>';

    html += '<div class="table-container"><table class="settings-table" id="settingsTxTable">';
    html += '<thead><tr>';
    html += '<th>رقم المعاملة</th>';
    html += '<th>التاريخ</th>';
    html += '<th>النوع</th>';
    html += '<th>الوصف</th>';
    html += '<th>المبلغ</th>';
    html += '<th>الحالة</th>';
    html += '<th>الإجراءات</th>';
    html += '</tr></thead>';
    html += '<tbody id="settingsTxBody">';

    if (App.transactions.length === 0) {
        html += '<tr><td colspan="7" style="text-align: center; padding: 2rem;">لا توجد معاملات</td></tr>';
    } else {
        for (var i = 0; i < App.transactions.length; i++) {
            var tx = App.transactions[i];
            html += '<tr>';
            html += '<td><strong>' + tx.transaction_number + '</strong></td>';
            html += '<td>' + tx.transaction_date + '</td>';
            html += '<td>' + (tx.transaction_type || '—') + '</td>';
            html += '<td class="truncate">' + tx.description + '</td>';
            html += '<td>' + fmtMoneyCur(tx.amount, tx.currency) + '</td>';
            html += '<td>' + getAlertBadge(tx.alert_type) + '</td>';
            html += '<td>';
            html += '<button class="btn-icon-sm" onclick="viewTransaction(' + tx.id + ')" title="عرض"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg></button>';
            html += '<button class="btn-icon-sm btn-danger-icon" onclick="deleteSettingsTransaction(' + tx.id + ', \'' + tx.transaction_number + '\')" title="حذف"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>';
            html += '</td>';
            html += '</tr>';
        }
    }

    html += '</tbody></table></div>';
    content.innerHTML = html;
}

function filterSettingsTransactions() {
    var search = document.getElementById('txSearchInput').value.toLowerCase();
    var tbody = document.getElementById('settingsTxBody');

    var filtered = App.transactions.filter(function (tx) {
        return tx.transaction_number.toLowerCase().indexOf(search) > -1 ||
            tx.description.toLowerCase().indexOf(search) > -1 ||
            (tx.transaction_type && tx.transaction_type.toLowerCase().indexOf(search) > -1);
    });

    var html = '';
    if (filtered.length === 0) {
        html = '<tr><td colspan="7" style="text-align: center; padding: 2rem;">لا توجد نتائج</td></tr>';
    } else {
        for (var i = 0; i < filtered.length; i++) {
            var tx = filtered[i];
            html += '<tr>';
            html += '<td><strong>' + tx.transaction_number + '</strong></td>';
            html += '<td>' + tx.transaction_date + '</td>';
            html += '<td>' + (tx.transaction_type || '—') + '</td>';
            html += '<td class="truncate">' + tx.description + '</td>';
            html += '<td>' + fmtMoneyCur(tx.amount, tx.currency) + '</td>';
            html += '<td>' + getAlertBadge(tx.alert_type) + '</td>';
            html += '<td>';
            html += '<button class="btn-icon-sm" onclick="viewTransaction(' + tx.id + ')" title="عرض"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg></button>';
            html += '<button class="btn-icon-sm btn-danger-icon" onclick="deleteSettingsTransaction(' + tx.id + ', \'' + tx.transaction_number + '\')" title="حذف"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>';
            html += '</td>';
            html += '</tr>';
        }
    }

    tbody.innerHTML = html;
}

async function deleteSettingsTransaction(id, number) {
    if (!confirm('هل أنت متأكد من حذف المعاملة "' + number + '"؟')) return;

    try {
        var res = await fetch('api/settings.php?action=delete_transaction', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id })
        });

        var result = await res.json();

        if (result.success) {
            showToast('تم حذف المعاملة', 'success');
            await loadTransactions();
            renderAllTransactionsSection();
        } else {
            showToast(result.message || 'خطأ في الحذف', 'error');
        }
    } catch (err) {
        showToast('خطأ في الاتصال', 'error');
    }
}

function exportTransactions() {
    window.location.href = 'api/settings.php?action=export';
}
