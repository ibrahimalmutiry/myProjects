/**
 * نظام إدارة المعاملات - JavaScript
 * Workflow Management System
 */

// الحالة العامة للتطبيق
const App = {
    currentTab: 'dashboard',
    transactions: [],
    stats: {},
    chartData: [],
    expandedRow: null,
    editingTransaction: null
};

// عناصر DOM
const DOM = {};

// تهيئة التطبيق
document.addEventListener('DOMContentLoaded', () => {
    initDOM();
    initEventListeners();
    loadDashboard();
});

// تهيئة عناصر DOM
function initDOM() {
    DOM.mainContent = document.getElementById('main-content');
    DOM.navTabs = document.querySelectorAll('.nav-tab');
    DOM.notificationBadge = document.getElementById('notification-badge');
    DOM.modal = document.getElementById('modal');
    DOM.modalTitle = document.getElementById('modal-title');
    DOM.modalBody = document.getElementById('modal-body');
    DOM.toast = document.getElementById('toast');
}

// تهيئة مستمعات الأحداث
function initEventListeners() {
    DOM.navTabs.forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });
    
    document.querySelector('.modal-close')?.addEventListener('click', closeModal);
    document.querySelector('.modal-overlay')?.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-overlay')) closeModal();
    });
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });
}

// تبديل التبويبات
function switchTab(tab) {
    App.currentTab = tab;
    App.expandedRow = null;
    
    DOM.navTabs.forEach(t => {
        t.classList.toggle('active', t.dataset.tab === tab);
    });
    
    if (tab === 'dashboard') {
        loadDashboard();
    } else if (tab === 'transactions') {
        loadTransactions();
    } else if (tab === 'settings') {
        loadSettingsPage();
    }
}

// تحميل لوحة التحكم
async function loadDashboard() {
    showLoading();
    
    try {
        const [statsRes, chartRes, urgentRes] = await Promise.all([
            fetch('api/?action=stats'),
            fetch('api/?action=chart'),
            fetch('api/?action=urgent')
        ]);
        
        const stats = await statsRes.json();
        const chart = await chartRes.json();
        const urgent = await urgentRes.json();
        
        if (stats.success) App.stats = stats.data;
        if (chart.success) App.chartData = chart.data;
        
        renderDashboard(urgent.success ? urgent.data : []);
        
    } catch (error) {
        showToast('خطأ في تحميل البيانات', 'error');
        console.error(error);
    }
}

// عرض لوحة التحكم
function renderDashboard(urgentTransactions) {
    const html = `
        <div class="stats-overview-card">
            <div class="stats-header">
                <h3>📊 نظرة عامة على النظام</h3>
                <span class="stats-date">${new Date().toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
            </div>
            <div class="stats-content">
                <div class="stat-item">
                    <div class="stat-icon-sm blue">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                            <line x1="16" y1="13" x2="8" y2="13"></line>
                            <line x1="16" y1="17" x2="8" y2="17"></line>
                        </svg>
                    </div>
                    <div class="stat-details">
                        <span class="stat-number">${App.stats.total || 0}</span>
                        <span class="stat-text">إجمالي المعاملات</span>
                    </div>
                </div>
                <div class="stat-divider"></div>
                <div class="stat-item">
                    <div class="stat-icon-sm green">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                            <polyline points="22 4 12 14.01 9 11.01"></polyline>
                        </svg>
                    </div>
                    <div class="stat-details">
                        <span class="stat-number">${App.stats.paid || 0}</span>
                        <span class="stat-text">المكتملة</span>
                    </div>
                </div>
                <div class="stat-divider"></div>
                <div class="stat-item">
                    <div class="stat-icon-sm orange">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="8" x2="12" y2="12"></line>
                            <line x1="12" y1="16" x2="12.01" y2="16"></line>
                        </svg>
                    </div>
                    <div class="stat-details">
                        <span class="stat-number urgent">${App.stats.urgent || 0}</span>
                        <span class="stat-text">تحتاج متابعة</span>
                    </div>
                </div>
                <div class="stat-divider"></div>
                <div class="stat-item">
                    <div class="stat-icon-sm purple">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="12" y1="1" x2="12" y2="23"></line>
                            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                        </svg>
                    </div>
                    <div class="stat-details">
                        <span class="stat-number">${formatMoney(App.stats.total_amount || 0)}</span>
                        <span class="stat-text">إجمالي المبالغ</span>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="urgent-section">
            <div class="urgent-header">
                <div class="urgent-title">
                    <span class="urgent-icon">⚠️</span>
                    <h3>المعاملات العاجلة</h3>
                    <span class="urgent-count">${urgentTransactions.length}</span>
                </div>
                <div class="urgent-filters">
                    <button class="urgent-filter-btn active" onclick="filterUrgent('all', this)">الكل</button>
                    <button class="urgent-filter-btn" onclick="filterUrgent('عاجل', this)">🔴 عاجل</button>
                    <button class="urgent-filter-btn" onclick="filterUrgent('متابعة', this)">⚠️ متابعة</button>
                </div>
            </div>
            <div class="urgent-table-container">
                ${urgentTransactions.length > 0 ? `
                <table class="urgent-table">
                    <thead>
                        <tr>
                            <th>الحالة</th>
                            <th>رقم المعاملة</th>
                            <th>الوصف</th>
                            <th>التاريخ</th>
                            <th>المبلغ</th>
                            <th>الإجراءات</th>
                        </tr>
                    </thead>
                    <tbody id="urgentTableBody">
                        ${urgentTransactions.map(tx => `
                        <tr class="urgent-row" data-type="${tx.alert_type || 'عاجل'}">
                            <td>
                                <span class="alert-badge alert-${tx.alert_type === 'عاجل' ? 'danger' : tx.alert_type === 'متابعة' ? 'warning' : 'info'}">
                                    ${tx.alert_type === 'عاجل' ? '🔴' : tx.alert_type === 'متابعة' ? '⚠️' : '⏳'} ${tx.alert_type || 'انتظار'}
                                </span>
                            </td>
                            <td>
                                <span class="tx-number">${tx.transaction_number}</span>
                            </td>
                            <td>
                                <div class="tx-desc">
                                    <span class="tx-desc-text">${tx.description}</span>
                                    <span class="tx-type">${tx.type_name || ''}</span>
                                </div>
                            </td>
                            <td>
                                <span class="tx-date">${tx.transaction_date}</span>
                            </td>
                            <td>
                                <span class="tx-amount">${formatMoney(tx.amount)}</span>
                            </td>
                            <td>
                                <div class="tx-actions">
                                    <button class="btn-action btn-view" onclick="viewTransaction(${tx.id})" title="عرض">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                            <circle cx="12" cy="12" r="3"></circle>
                                        </svg>
                                    </button>
                                    <button class="btn-action btn-edit" onclick="editTransaction(${tx.id})" title="تعديل">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                        </svg>
                                    </button>
                                </div>
                            </td>
                        </tr>
                        `).join('')}
                    </tbody>
                </table>
                ` : `
                <div class="urgent-empty">
                    <div class="empty-icon">✅</div>
                    <h4>لا توجد معاملات عاجلة</h4>
                    <p>جميع المعاملات تسير بشكل طبيعي</p>
                </div>
                `}
            </div>
        </div>
    `;
    
    DOM.mainContent.innerHTML = html;
    
    if (DOM.notificationBadge) {
        DOM.notificationBadge.textContent = App.stats.urgent || 0;
        DOM.notificationBadge.style.display = App.stats.urgent > 0 ? 'flex' : 'none';
    }
}

// فلترة المعاملات العاجلة
function filterUrgent(type, btn) {
    document.querySelectorAll('.urgent-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    document.querySelectorAll('.urgent-row').forEach(row => {
        if (type === 'all' || row.dataset.type === type) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
}

// رسم الرسم البياني الخطي
function renderLineChart() {
    const canvas = document.getElementById('lineChart');
    if (!canvas || !App.chartData.length) return;
    
    const ctx = canvas.getContext('2d');
    const data = App.chartData;
    
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height - 20;
    
    const padding = { top: 20, right: 20, bottom: 40, left: 60 };
    const width = canvas.width - padding.left - padding.right;
    const height = canvas.height - padding.top - padding.bottom;
    
    const maxCount = Math.max(...data.map(d => d.count), 1);
    
    ctx.strokeStyle = 'rgba(71, 85, 105, 0.3)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = padding.top + (height / 4) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(canvas.width - padding.right, y);
        ctx.stroke();
    }
    
    ctx.strokeStyle = '#0ea5e9';
    ctx.lineWidth = 3;
    ctx.beginPath();
    data.forEach((d, i) => {
        const x = padding.left + (width / (data.length - 1 || 1)) * i;
        const y = padding.top + height - (d.count / maxCount) * height;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();
    
    ctx.fillStyle = '#0ea5e9';
    data.forEach((d, i) => {
        const x = padding.left + (width / (data.length - 1 || 1)) * i;
        const y = padding.top + height - (d.count / maxCount) * height;
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();
    });
    
    ctx.fillStyle = '#64748b';
    ctx.font = '12px Noto Sans Arabic';
    ctx.textAlign = 'center';
    data.forEach((d, i) => {
        const x = padding.left + (width / (data.length - 1 || 1)) * i;
        ctx.fillText(d.month, x, canvas.height - 10);
    });
}

// رسم الرسم الدائري
function renderPieChart() {
    const canvas = document.getElementById('pieChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height - 60;
    
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(centerX, centerY) - 20;
    const innerRadius = radius * 0.6;
    
    const data = [
        { value: App.stats.paid || 0, color: '#10b981' },
        { value: (App.stats.total || 0) - (App.stats.paid || 0) - (App.stats.urgent || 0), color: '#0ea5e9' },
        { value: App.stats.urgent || 0, color: '#ef4444' }
    ];
    
    const total = data.reduce((sum, d) => sum + d.value, 0) || 1;
    let startAngle = -Math.PI / 2;
    
    data.forEach(d => {
        const sliceAngle = (d.value / total) * Math.PI * 2;
        
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
        ctx.closePath();
        ctx.fillStyle = d.color;
        ctx.fill();
        
        ctx.beginPath();
        ctx.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#1e293b';
        ctx.fill();
        
        startAngle += sliceAngle;
    });
    
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 24px Noto Sans Arabic';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(App.stats.total || 0, centerX, centerY - 10);
    ctx.font = '12px Noto Sans Arabic';
    ctx.fillStyle = '#64748b';
    ctx.fillText('معاملة', centerX, centerY + 15);
}

// تحميل المعاملات
async function loadTransactions() {
    showLoading();
    
    try {
        const res = await fetch('api/?action=transactions');
        const data = await res.json();
        
        if (data.success) {
            App.transactions = data.data;
            renderTransactions();
        } else {
            showToast('خطأ في تحميل المعاملات', 'error');
        }
    } catch (error) {
        showToast('خطأ في الاتصال', 'error');
        console.error(error);
    }
}

// عرض المعاملات
function renderTransactions() {
    const html = `
        <div class="toolbar">
            <div class="toolbar-search">
                <div class="search-input">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="8"></circle>
                        <path d="m21 21-4.35-4.35"></path>
                    </svg>
                    <input type="text" id="searchInput" placeholder="بحث في المعاملات..." oninput="filterTransactions()">
                </div>
                <select id="statusFilter" class="filter-select" onchange="filterTransactions()">
                    <option value="">جميع الحالات</option>
                    <option value="عاجل">عاجل</option>
                    <option value="متابعة">يحتاج متابعة</option>
                    <option value="مكتمل">مكتمل</option>
                    <option value="تم الدفع">تم الدفع</option>
                    <option value="معلق">معلق</option>
                </select>
            </div>
            <button class="btn btn-primary" onclick="openAddModal()">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 5v14M5 12h14"></path>
                </svg>
                معاملة جديدة
            </button>
        </div>
        
        <div class="card">
            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>رقم المعاملة</th>
                            <th>التاريخ</th>
                            <th>النوع</th>
                            <th>الوصف</th>
                            <th>المبلغ</th>
                            <th class="th-green">الاستلام</th>
                            <th class="th-cyan">الموازنة</th>
                            <th class="th-orange">الدفع</th>
                            <th class="th-purple">الفوترة</th>
                            <th>التنبيه</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody id="transactionsBody">
                        ${renderTransactionRows(App.transactions)}
                    </tbody>
                </table>
            </div>
        </div>
    `;
    
    DOM.mainContent.innerHTML = html;
}

// ========== دالة عرض صفوف المعاملات ==========
function renderTransactionRows(transactions) {
    if (!transactions || !transactions.length) {
        return '<tr><td colspan="11" style="text-align: center; padding: 3rem; color: var(--text-muted);">لا توجد معاملات</td></tr>';
    }
    
    let html = '';
    
    for (let i = 0; i < transactions.length; i++) {
        const tx = transactions[i];
        const isExpanded = (App.expandedRow == tx.id);
        
        // صف المعاملة الرئيسي
        html += '<tr class="transaction-row ' + (isExpanded ? 'expanded' : '') + '" data-id="' + tx.id + '" onclick="toggleRow(' + tx.id + ')">';
        html += '<td><span class="tx-number">' + tx.transaction_number + '</span></td>';
        html += '<td>' + tx.transaction_date + '</td>';
        html += '<td><span class="tx-type">' + (tx.transaction_type || '—') + '</span></td>';
        html += '<td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + tx.description + '</td>';
        html += '<td><span class="tx-amount">' + formatNumber(tx.amount) + '<small>ر.س</small></span></td>';
        html += '<td>' + getStatusBadge(tx.receive_status) + '</td>';
        html += '<td>' + getStatusBadge(tx.budget_status) + '</td>';
        html += '<td>' + getStatusBadge(tx.payment_status) + '</td>';
        html += '<td>' + getStatusBadge(tx.invoice_status) + '</td>';
        html += '<td>' + getAlertBadge(tx.alert_type) + '</td>';
        html += '<td>';
        html += '<div style="display: flex; align-items: center; gap: 0.5rem;">';
        
        // زر استعراض PDF
        if (tx.attachment) {
            html += '<button class="btn-icon btn-pdf" onclick="event.stopPropagation(); openPDF(\'' + tx.attachment + '\')" title="استعراض PDF">';
            html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><line x1="10" y1="9" x2="8" y2="9"></line></svg>';
            html += '</button>';
        }
        
        html += '<button class="btn-icon" onclick="event.stopPropagation(); editTransaction(' + tx.id + ')" title="تعديل">';
        html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';
        html += '</button>';
        html += '<svg class="expand-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--text-muted); transition: transform 0.3s; ' + (isExpanded ? 'transform: rotate(180deg);' : '') + '">';
        html += '<polyline points="6 9 12 15 18 9"></polyline>';
        html += '</svg>';
        html += '</div>';
        html += '</td>';
        html += '</tr>';
        
        // صف التفاصيل الموسع
        if (isExpanded) {
            html += '<tr class="expanded-row">';
            html += '<td colspan="11" style="padding: 0;">';
            html += '<div class="expanded-content four-columns">';
            
            // قسم الاستلام
            html += '<div class="detail-section receiving">';
            html += '<div class="detail-header green">';
            html += '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle></svg>';
            html += ' موظف الاستلام';
            html += '</div>';
            html += '<div class="detail-row"><span class="detail-label">الموظف:</span><span class="detail-value">' + (tx.receiver_name || '—') + '</span></div>';
            html += '<div class="detail-row"><span class="detail-label">التاريخ:</span><span class="detail-value">' + (tx.receive_date || '—') + '</span></div>';
            html += '<div class="detail-row"><span class="detail-label">الحالة:</span><span class="detail-value">' + getStatusBadge(tx.receive_status) + '</span></div>';
            html += '<div class="detail-row"><span class="detail-label">ملاحظات:</span><span class="detail-value">' + (tx.receive_notes || '—') + '</span></div>';
            html += '</div>';
            
            // قسم الموازنة (جديد)
            html += '<div class="detail-section budget">';
            html += '<div class="detail-header cyan">';
            html += '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>';
            html += ' موظف الموازنة';
            html += '</div>';
            html += '<div class="detail-row"><span class="detail-label">الموظف:</span><span class="detail-value">' + (tx.budget_employee_name || '—') + '</span></div>';
            html += '<div class="detail-row"><span class="detail-label">التاريخ:</span><span class="detail-value">' + (tx.budget_date || '—') + '</span></div>';
            html += '<div class="detail-row"><span class="detail-label">رمز الموازنة:</span><span class="detail-value" style="color: var(--accent-cyan); font-family: monospace;">' + (tx.budget_code || '—') + '</span></div>';
            html += '<div class="detail-row"><span class="detail-label">الحالة:</span><span class="detail-value">' + getStatusBadge(tx.budget_status) + '</span></div>';
            html += '<div class="detail-row"><span class="detail-label">ملاحظات:</span><span class="detail-value">' + (tx.budget_notes || '—') + '</span></div>';
            html += '</div>';
            
            // قسم الدفع
            html += '<div class="detail-section payment">';
            html += '<div class="detail-header orange">';
            html += '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>';
            html += ' موظف الدفع';
            html += '</div>';
            html += '<div class="detail-row"><span class="detail-label">الموظف:</span><span class="detail-value">' + (tx.payment_employee_name || '—') + '</span></div>';
            html += '<div class="detail-row"><span class="detail-label">التاريخ:</span><span class="detail-value">' + (tx.payment_date || '—') + '</span></div>';
            html += '<div class="detail-row"><span class="detail-label">الطريقة:</span><span class="detail-value">' + (tx.payment_method || '—') + '</span></div>';
            html += '<div class="detail-row"><span class="detail-label">الحالة:</span><span class="detail-value">' + getStatusBadge(tx.payment_status) + '</span></div>';
            html += '<div class="detail-row"><span class="detail-label">المرجع:</span><span class="detail-value" style="color: var(--accent-blue); font-family: monospace;">' + (tx.reference_number || '—') + '</span></div>';
            html += '<div class="detail-row"><span class="detail-label">ملاحظات:</span><span class="detail-value">' + (tx.payment_notes || '—') + '</span></div>';
            html += '</div>';
            
            // قسم الفوترة
            html += '<div class="detail-section invoice">';
            html += '<div class="detail-header purple">';
            html += '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>';
            html += ' موظف الفوترة';
            html += '</div>';
            html += '<div class="detail-row"><span class="detail-label">الموظف:</span><span class="detail-value">' + (tx.invoice_employee_name || '—') + '</span></div>';
            html += '<div class="detail-row"><span class="detail-label">رقم الفاتورة:</span><span class="detail-value" style="color: var(--accent-blue); font-family: monospace;">' + (tx.invoice_number || '—') + '</span></div>';
            html += '<div class="detail-row"><span class="detail-label">التاريخ:</span><span class="detail-value">' + (tx.invoice_date || '—') + '</span></div>';
            html += '<div class="detail-row"><span class="detail-label">الحالة:</span><span class="detail-value">' + getStatusBadge(tx.invoice_status) + '</span></div>';
            html += '<div class="detail-row"><span class="detail-label">التنبيه:</span><span class="detail-value">' + getAlertBadge(tx.alert_type) + '</span></div>';
            html += '<div class="detail-row"><span class="detail-label">ملاحظات:</span><span class="detail-value">' + (tx.invoice_notes || '—') + '</span></div>';
            html += '</div>';
            
            html += '</div>';
            
            // قسم المرفقات
            html += '<div class="attachment-section">';
            html += '<div class="attachment-header">';
            html += '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>';
            html += ' المرفقات';
            html += '</div>';
            
            if (tx.attachment) {
                html += '<div class="attachment-file">';
                html += '<div class="attachment-info">';
                html += '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>';
                html += '<span>' + (tx.attachment_name || 'مستند.pdf') + '</span>';
                html += '</div>';
                html += '<div class="attachment-actions">';
                html += '<button class="btn btn-sm btn-primary" onclick="event.stopPropagation(); openPDF(\'' + tx.attachment + '\')">';
                html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
                html += ' استعراض';
                html += '</button>';
                html += '<button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); deleteAttachment(' + tx.id + ')">';
                html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
                html += ' حذف';
                html += '</button>';
                html += '</div>';
                html += '</div>';
            } else {
                html += '<div class="no-attachment">';
                html += '<p>لا يوجد مرفق</p>';
                html += '<button class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); uploadAttachment(' + tx.id + ')">';
                html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>';
                html += ' رفع ملف PDF';
                html += '</button>';
                html += '</div>';
            }
            
            html += '</div>';
            
            html += '</td>';
            html += '</tr>';
        }
    }
    
    return html;
}

// ========== دالة تبديل الصف الموسع ==========
function toggleRow(id) {
    if (App.expandedRow == id) {
        App.expandedRow = null;
    } else {
        App.expandedRow = id;
    }
    
    const tbody = document.getElementById('transactionsBody');
    if (tbody) {
        tbody.innerHTML = renderTransactionRows(App.transactions);
    }
}

// فلترة المعاملات
function filterTransactions() {
    const search = document.getElementById('searchInput')?.value.toLowerCase() || '';
    const status = document.getElementById('statusFilter')?.value || '';
    
    const filtered = App.transactions.filter(tx => {
        const matchSearch = !search || 
            tx.transaction_number.toLowerCase().includes(search) ||
            tx.description.toLowerCase().includes(search) ||
            (tx.transaction_type && tx.transaction_type.toLowerCase().includes(search));
        
        const matchStatus = !status ||
            tx.alert_type === status ||
            tx.payment_status === status ||
            tx.receive_status === status;
        
        return matchSearch && matchStatus;
    });
    
    App.expandedRow = null;
    document.getElementById('transactionsBody').innerHTML = renderTransactionRows(filtered);
}

// فتح مودال إضافة معاملة
async function openAddModal() {
    try {
        const [typesRes, employeesRes] = await Promise.all([
            fetch('api/?action=types'),
            fetch('api/?action=employees')
        ]);
        
        const types = await typesRes.json();
        
        let typeOptions = '';
        if (types.success) {
            types.data.forEach(t => {
                typeOptions += '<option value="' + t.id + '">' + t.name + '</option>';
            });
        }
        
        DOM.modalTitle.textContent = 'إضافة معاملة جديدة';
        DOM.modalBody.innerHTML = `
            <form id="addForm" onsubmit="submitAddForm(event)" enctype="multipart/form-data">
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">التاريخ</label>
                        <input type="date" class="form-input" name="date" value="${new Date().toISOString().split('T')[0]}" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">نوع المعاملة</label>
                        <select class="form-select" name="type_id" required>
                            <option value="">اختر النوع</option>
                            ${typeOptions}
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">الوصف</label>
                    <textarea class="form-textarea" name="description" placeholder="وصف المعاملة..." required></textarea>
                </div>
                <div class="form-group">
                    <label class="form-label">المبلغ (ر.س)</label>
                    <input type="number" class="form-input" name="amount" step="0.01" min="0" placeholder="0.00" required>
                </div>
                <div class="form-group">
                    <label class="form-label">إرفاق ملف PDF (اختياري)</label>
                    <div class="file-upload-wrapper">
                        <input type="file" class="file-input" name="attachment" id="attachmentInput" accept=".pdf,application/pdf" onchange="handleFileSelect(this)">
                        <label for="attachmentInput" class="file-upload-label">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                <polyline points="14 2 14 8 20 8"></polyline>
                                <line x1="12" y1="18" x2="12" y2="12"></line>
                                <line x1="9" y1="15" x2="15" y2="15"></line>
                            </svg>
                            <span id="fileName">اختر ملف PDF أو اسحبه هنا</span>
                        </label>
                    </div>
                    <p class="file-hint">الحد الأقصى: 10 ميجابايت</p>
                </div>
                <div class="modal-footer" style="padding: 0; border: none; margin-top: 1.5rem;">
                    <button type="button" class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
                    <button type="submit" class="btn btn-primary">إضافة المعاملة</button>
                </div>
            </form>
        `;
        
        openModal();
    } catch (error) {
        showToast('خطأ في تحميل البيانات', 'error');
    }
}

// معالجة اختيار الملف
function handleFileSelect(input) {
    const fileName = document.getElementById('fileName');
    if (input.files && input.files[0]) {
        const file = input.files[0];
        if (file.type !== 'application/pdf') {
            showToast('يرجى اختيار ملف PDF فقط', 'error');
            input.value = '';
            fileName.textContent = 'اختر ملف PDF أو اسحبه هنا';
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            showToast('حجم الملف كبير جداً. الحد الأقصى 10 ميجابايت', 'error');
            input.value = '';
            fileName.textContent = 'اختر ملف PDF أو اسحبه هنا';
            return;
        }
        fileName.textContent = file.name;
    } else {
        fileName.textContent = 'اختر ملف PDF أو اسحبه هنا';
    }
}

// إرسال نموذج الإضافة
async function submitAddForm(e) {
    e.preventDefault();
    
    const form = e.target;
    const formData = new FormData(form);
    
    try {
        const res = await fetch('api/?action=add', {
            method: 'POST',
            body: formData
        });
        
        const result = await res.json();
        
        if (result.success) {
            showToast('تم إضافة المعاملة بنجاح', 'success');
            closeModal();
            loadTransactions();
        } else {
            showToast(result.message || 'خطأ في الإضافة', 'error');
        }
    } catch (error) {
        showToast('خطأ في الاتصال', 'error');
    }
}

// فتح ملف PDF
function openPDF(path) {
    if (path) {
        window.open(path, '_blank');
    }
}

// رفع مرفق لمعاملة موجودة
async function uploadAttachment(transactionId) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,application/pdf';
    
    input.onchange = async function() {
        if (input.files && input.files[0]) {
            const file = input.files[0];
            
            if (file.type !== 'application/pdf') {
                showToast('يرجى اختيار ملف PDF فقط', 'error');
                return;
            }
            
            if (file.size > 10 * 1024 * 1024) {
                showToast('حجم الملف كبير جداً', 'error');
                return;
            }
            
            const formData = new FormData();
            formData.append('transaction_id', transactionId);
            formData.append('attachment', file);
            
            try {
                const res = await fetch('api/?action=upload_attachment', {
                    method: 'POST',
                    body: formData
                });
                
                const result = await res.json();
                
                if (result.success) {
                    showToast('تم رفع الملف بنجاح', 'success');
                    loadTransactions();
                } else {
                    showToast(result.message || 'خطأ في رفع الملف', 'error');
                }
            } catch (error) {
                showToast('خطأ في الاتصال', 'error');
            }
        }
    };
    
    input.click();
}

// حذف مرفق
async function deleteAttachment(transactionId) {
    if (!confirm('هل أنت متأكد من حذف المرفق؟')) return;
    
    try {
        const res = await fetch('api/?action=delete_attachment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transaction_id: transactionId })
        });
        
        const result = await res.json();
        
        if (result.success) {
            showToast('تم حذف المرفق', 'success');
            loadTransactions();
        } else {
            showToast(result.message || 'خطأ في الحذف', 'error');
        }
    } catch (error) {
        showToast('خطأ في الاتصال', 'error');
    }
}

// تعديل معاملة
async function editTransaction(id) {
    const tx = App.transactions.find(t => t.id == id);
    if (!tx) return;
    
    App.editingTransaction = tx;
    
    // الحصول على صلاحية المستخدم
    const userRole = (typeof currentUser !== 'undefined') ? currentUser.role : '';
    
    try {
        const employeesRes = await fetch('api/?action=employees');
        const employees = await employeesRes.json();
        
        let receiversOptions = '';
        let budgetOptions = '';
        let paymentOptions = '';
        let invoiceOptions = '';
        
        if (employees.success) {
            employees.data.forEach(e => {
                if (e.role === 'receiver') {
                    receiversOptions += '<option value="' + e.id + '" ' + (tx.receiver_name === e.name ? 'selected' : '') + '>' + e.name + '</option>';
                }
                if (e.role === 'budget') {
                    budgetOptions += '<option value="' + e.id + '" ' + (tx.budget_employee_name === e.name ? 'selected' : '') + '>' + e.name + '</option>';
                }
                if (e.role === 'payment') {
                    paymentOptions += '<option value="' + e.id + '" ' + (tx.payment_employee_name === e.name ? 'selected' : '') + '>' + e.name + '</option>';
                }
                if (e.role === 'invoice') {
                    invoiceOptions += '<option value="' + e.id + '" ' + (tx.invoice_employee_name === e.name ? 'selected' : '') + '>' + e.name + '</option>';
                }
            });
        }
        
        // تحديد التبويبات المرئية حسب الصلاحية
        const showReceiving = (userRole === 'receiver' || userRole === '' || userRole === 'admin');
        const showBudget = (userRole === 'budget' || userRole === '' || userRole === 'admin');
        const showPayment = (userRole === 'payment' || userRole === '' || userRole === 'admin');
        const showInvoice = (userRole === 'invoice' || userRole === '' || userRole === 'admin');
        
        // تحديد التبويب النشط الأول
        let activeTab = '';
        if (showReceiving) activeTab = 'receiving';
        else if (showBudget) activeTab = 'budget';
        else if (showPayment) activeTab = 'payment';
        else if (showInvoice) activeTab = 'invoice';
        
        DOM.modalTitle.textContent = 'تعديل المعاملة ' + tx.transaction_number;
        
        // بناء التبويبات
        let tabsHtml = '<div class="modal-tabs">';
        if (showReceiving) tabsHtml += '<button type="button" class="modal-tab green ' + (activeTab === 'receiving' ? 'active' : '') + '" onclick="switchModalTab(\'receiving\', this)">الاستلام</button>';
        if (showBudget) tabsHtml += '<button type="button" class="modal-tab cyan ' + (activeTab === 'budget' ? 'active' : '') + '" onclick="switchModalTab(\'budget\', this)">الموازنة</button>';
        if (showPayment) tabsHtml += '<button type="button" class="modal-tab orange ' + (activeTab === 'payment' ? 'active' : '') + '" onclick="switchModalTab(\'payment\', this)">الدفع</button>';
        if (showInvoice) tabsHtml += '<button type="button" class="modal-tab purple ' + (activeTab === 'invoice' ? 'active' : '') + '" onclick="switchModalTab(\'invoice\', this)">الفوترة</button>';
        tabsHtml += '</div>';
        
        // بناء المحتوى
        let contentHtml = '';
        
        // تبويب الاستلام
        if (showReceiving) {
            contentHtml += `
            <div id="tab-receiving" class="tab-content" style="${activeTab === 'receiving' ? '' : 'display: none;'}">
                <form id="receivingForm" onsubmit="submitUpdateForm(event, 'receiving')">
                    <input type="hidden" name="transaction_id" value="${tx.id}">
                    <div class="form-row">
                        <div class="form-group">
                            <label class="form-label">الموظف</label>
                            <select class="form-select" name="employee_id">
                                <option value="">اختر الموظف</option>
                                ${receiversOptions}
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label">تاريخ الاستلام</label>
                            <input type="date" class="form-input" name="date" value="${tx.receive_date || ''}">
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">الحالة</label>
                        <select class="form-select" name="status">
                            <option value="معلق" ${tx.receive_status === 'معلق' ? 'selected' : ''}>معلق</option>
                            <option value="مستلم" ${tx.receive_status === 'مستلم' ? 'selected' : ''}>مستلم</option>
                            <option value="قيد المراجعة" ${tx.receive_status === 'قيد المراجعة' ? 'selected' : ''}>قيد المراجعة</option>
                            <option value="مرفوض" ${tx.receive_status === 'مرفوض' ? 'selected' : ''}>مرفوض</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">ملاحظات</label>
                        <textarea class="form-textarea" name="notes">${tx.receive_notes || ''}</textarea>
                    </div>
                    <div class="modal-footer" style="padding: 0; border: none; margin-top: 1.5rem;">
                        <button type="button" class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
                        <button type="submit" class="btn btn-primary">حفظ التغييرات</button>
                    </div>
                </form>
            </div>`;
        }
        
        // تبويب الموازنة
        if (showBudget) {
            contentHtml += `
            <div id="tab-budget" class="tab-content" style="${activeTab === 'budget' ? '' : 'display: none;'}">
                <form id="budgetForm" onsubmit="submitUpdateForm(event, 'budget')">
                    <input type="hidden" name="transaction_id" value="${tx.id}">
                    <div class="form-row">
                        <div class="form-group">
                            <label class="form-label">الموظف</label>
                            <select class="form-select" name="employee_id">
                                <option value="">اختر الموظف</option>
                                ${budgetOptions}
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label">تاريخ المراجعة</label>
                            <input type="date" class="form-input" name="date" value="${tx.budget_date || ''}">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label class="form-label">رمز الموازنة</label>
                            <input type="text" class="form-input" name="budget_code" value="${tx.budget_code || ''}" placeholder="BUD-XXXX">
                        </div>
                        <div class="form-group">
                            <label class="form-label">الحالة</label>
                            <select class="form-select" name="status">
                                <option value="معلق" ${tx.budget_status === 'معلق' ? 'selected' : ''}>معلق</option>
                                <option value="قيد المراجعة" ${tx.budget_status === 'قيد المراجعة' ? 'selected' : ''}>قيد المراجعة</option>
                                <option value="معتمد" ${tx.budget_status === 'معتمد' ? 'selected' : ''}>معتمد</option>
                                <option value="مرفوض" ${tx.budget_status === 'مرفوض' ? 'selected' : ''}>مرفوض</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">ملاحظات</label>
                        <textarea class="form-textarea" name="notes">${tx.budget_notes || ''}</textarea>
                    </div>
                    <div class="modal-footer" style="padding: 0; border: none; margin-top: 1.5rem;">
                        <button type="button" class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
                        <button type="submit" class="btn btn-primary">حفظ التغييرات</button>
                    </div>
                </form>
            </div>`;
        }
        
        // تبويب الدفع
        if (showPayment) {
            contentHtml += `
            <div id="tab-payment" class="tab-content" style="${activeTab === 'payment' ? '' : 'display: none;'}">
                <form id="paymentForm" onsubmit="submitUpdateForm(event, 'payment')">
                    <input type="hidden" name="transaction_id" value="${tx.id}">
                    <div class="form-row">
                        <div class="form-group">
                            <label class="form-label">الموظف</label>
                            <select class="form-select" name="employee_id">
                                <option value="">اختر الموظف</option>
                                ${paymentOptions}
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label">تاريخ الدفع</label>
                            <input type="date" class="form-input" name="date" value="${tx.payment_date || ''}">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label class="form-label">طريقة الدفع</label>
                            <select class="form-select" name="method">
                                <option value="">اختر الطريقة</option>
                                <option value="تحويل بنكي" ${tx.payment_method === 'تحويل بنكي' ? 'selected' : ''}>تحويل بنكي</option>
                                <option value="شيك" ${tx.payment_method === 'شيك' ? 'selected' : ''}>شيك</option>
                                <option value="نقدي" ${tx.payment_method === 'نقدي' ? 'selected' : ''}>نقدي</option>
                                <option value="بطاقة ائتمان" ${tx.payment_method === 'بطاقة ائتمان' ? 'selected' : ''}>بطاقة ائتمان</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label">الحالة</label>
                            <select class="form-select" name="status">
                                <option value="معلق" ${tx.payment_status === 'معلق' ? 'selected' : ''}>معلق</option>
                                <option value="قيد المعالجة" ${tx.payment_status === 'قيد المعالجة' ? 'selected' : ''}>قيد المعالجة</option>
                                <option value="تم الدفع" ${tx.payment_status === 'تم الدفع' ? 'selected' : ''}>تم الدفع</option>
                                <option value="مرفوض" ${tx.payment_status === 'مرفوض' ? 'selected' : ''}>مرفوض</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">رقم المرجع</label>
                        <input type="text" class="form-input" name="reference" value="${tx.reference_number || ''}" placeholder="REF-XXXX">
                    </div>
                    <div class="form-group">
                        <label class="form-label">ملاحظات</label>
                        <textarea class="form-textarea" name="notes">${tx.payment_notes || ''}</textarea>
                    </div>
                    <div class="modal-footer" style="padding: 0; border: none; margin-top: 1.5rem;">
                        <button type="button" class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
                        <button type="submit" class="btn btn-primary">حفظ التغييرات</button>
                    </div>
                </form>
            </div>`;
        }
        
        // تبويب الفوترة
        if (showInvoice) {
            contentHtml += `
            <div id="tab-invoice" class="tab-content" style="${activeTab === 'invoice' ? '' : 'display: none;'}">
                <form id="invoiceForm" onsubmit="submitUpdateForm(event, 'invoice')">
                    <input type="hidden" name="transaction_id" value="${tx.id}">
                    <div class="form-row">
                        <div class="form-group">
                            <label class="form-label">الموظف</label>
                            <select class="form-select" name="employee_id">
                                <option value="">اختر الموظف</option>
                                ${invoiceOptions}
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label">رقم الفاتورة</label>
                            <input type="text" class="form-input" name="invoice_number" value="${tx.invoice_number || ''}" placeholder="INV-XXXX">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label class="form-label">تاريخ الفاتورة</label>
                            <input type="date" class="form-input" name="date" value="${tx.invoice_date || ''}">
                        </div>
                        <div class="form-group">
                            <label class="form-label">الحالة</label>
                            <select class="form-select" name="status">
                                <option value="">اختر الحالة</option>
                                <option value="صدرت الفاتورة" ${tx.invoice_status === 'صدرت الفاتورة' ? 'selected' : ''}>صدرت الفاتورة</option>
                                <option value="بدون فاتورة" ${tx.invoice_status === 'بدون فاتورة' ? 'selected' : ''}>بدون فاتورة</option>
                                <option value="قيد الإصدار" ${tx.invoice_status === 'قيد الإصدار' ? 'selected' : ''}>قيد الإصدار</option>
                                <option value="ملغاة" ${tx.invoice_status === 'ملغاة' ? 'selected' : ''}>ملغاة</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">نوع التنبيه</label>
                        <select class="form-select" name="alert_type">
                            <option value="انتظار" ${tx.alert_type === 'انتظار' ? 'selected' : ''}>⏳ انتظار</option>
                            <option value="متابعة" ${tx.alert_type === 'متابعة' ? 'selected' : ''}>⚠️ يحتاج متابعة</option>
                            <option value="عاجل" ${tx.alert_type === 'عاجل' ? 'selected' : ''}>🔴 عاجل</option>
                            <option value="مكتمل" ${tx.alert_type === 'مكتمل' ? 'selected' : ''}>✅ مكتمل</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">ملاحظات</label>
                        <textarea class="form-textarea" name="notes">${tx.invoice_notes || ''}</textarea>
                    </div>
                    <div class="modal-footer" style="padding: 0; border: none; margin-top: 1.5rem;">
                        <button type="button" class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
                        <button type="submit" class="btn btn-primary">حفظ التغييرات</button>
                    </div>
                </form>
            </div>`;
        }
        
        DOM.modalBody.innerHTML = tabsHtml + contentHtml;
        
        openModal();
    } catch (error) {
        showToast('خطأ في تحميل البيانات', 'error');
    }
}

// تبديل تبويبات المودال
function switchModalTab(tab, btn) {
    document.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
    
    btn.classList.add('active');
    document.getElementById('tab-' + tab).style.display = 'block';
}

// إرسال نموذج التحديث
async function submitUpdateForm(e, type) {
    e.preventDefault();
    
    const form = e.target;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    
    const actionMap = {
        'receiving': 'update_receiving',
        'budget': 'update_budget',
        'payment': 'update_payment',
        'invoice': 'update_invoice'
    };
    
    try {
        const res = await fetch('api/?action=' + actionMap[type], {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        const result = await res.json();
        
        if (result.success) {
            showToast('تم الحفظ بنجاح', 'success');
            closeModal();
            loadTransactions();
        } else {
            showToast(result.message || 'خطأ في الحفظ', 'error');
        }
    } catch (error) {
        showToast('خطأ في الاتصال', 'error');
    }
}

// عرض معاملة
function viewTransaction(id) {
    switchTab('transactions');
    setTimeout(function() {
        App.expandedRow = id;
        const tbody = document.getElementById('transactionsBody');
        if (tbody) {
            tbody.innerHTML = renderTransactionRows(App.transactions);
        }
    }, 300);
}

// ========== دوال مساعدة ==========
function getStatusBadge(status) {
    if (!status) return '<span class="badge badge-slate"><span class="badge-dot"></span>—</span>';
    
    let color = 'slate';
    if (status === 'مستلم' || status === 'تم الدفع' || status === 'صدرت الفاتورة' || status === 'معتمد') color = 'green';
    else if (status === 'قيد المراجعة' || status === 'بدون فاتورة') color = 'amber';
    else if (status === 'قيد المعالجة' || status === 'قيد الإصدار') color = 'blue';
    else if (status === 'مرفوض' || status === 'ملغاة') color = 'red';
    
    return '<span class="badge badge-' + color + '"><span class="badge-dot"></span>' + status + '</span>';
}

// تبديل الوضع الليلي/النهاري
function toggleTheme() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme');
    
    if (currentTheme === 'light') {
        html.removeAttribute('data-theme');
        localStorage.setItem('theme', 'dark');
    } else {
        html.setAttribute('data-theme', 'light');
        localStorage.setItem('theme', 'light');
    }
}

// تحميل الوضع المحفوظ
function loadSavedTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.documentElement.removeAttribute('data-theme');
    } else {
        // الوضع النهاري هو الافتراضي
        document.documentElement.setAttribute('data-theme', 'light');
    }
}

// تحميل الوضع عند بدء الصفحة
document.addEventListener('DOMContentLoaded', function() {
    loadSavedTheme();
});

// تسجيل الخروج
async function logout() {
    if (!confirm('هل تريد تسجيل الخروج؟')) return;
    
    try {
        await fetch('api/auth.php?action=logout', { method: 'POST' });
        window.location.href = 'login.php';
    } catch (e) {
        window.location.href = 'login.php';
    }
}

function getAlertBadge(alert) {
    if (!alert) return '<span class="badge badge-slate"><span class="badge-dot"></span>—</span>';
    
    let color = 'slate';
    let icon = '⏳';
    
    if (alert === 'عاجل') { color = 'red'; icon = '🔴'; }
    else if (alert === 'متابعة') { color = 'amber'; icon = '⚠️'; }
    else if (alert === 'مكتمل') { color = 'green'; icon = '✅'; }
    
    return '<span class="badge badge-' + color + '">' + icon + ' ' + alert + '</span>';
}

function formatMoney(amount) {
    return new Intl.NumberFormat('en-US').format(amount || 0) + ' ر.س';
}

function formatNumber(amount) {
    return new Intl.NumberFormat('en-US').format(amount || 0);
}

function showLoading() {
    DOM.mainContent.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
}

function openModal() {
    DOM.modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    DOM.modal.classList.remove('active');
    document.body.style.overflow = '';
    App.editingTransaction = null;
}

function showToast(message, type) {
    type = type || 'success';
    DOM.toast.textContent = message;
    DOM.toast.className = 'toast ' + type + ' show';
    
    setTimeout(function() {
        DOM.toast.classList.remove('show');
    }, 3000);
}

// ========== قسم الإعدادات ==========
var SettingsData = {
    employees: [],
    types: [],
    currentFilter: 'all'
};

// تحميل صفحة الإعدادات
async function loadSettingsPage() {
    DOM.mainContent.innerHTML = `
        <div class="settings-page">
            <div class="settings-sidebar">
                <button class="settings-nav-btn active" onclick="showSettingsSection('employees', this)">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                        <circle cx="9" cy="7" r="4"></circle>
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                        <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                    </svg>
                    الموظفين
                </button>
                <button class="settings-nav-btn" onclick="showSettingsSection('performance', this)">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                    أداء الموظفين
                </button>
                <button class="settings-nav-btn" onclick="showSettingsSection('types', this)">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="8" y1="6" x2="21" y2="6"></line>
                        <line x1="8" y1="12" x2="21" y2="12"></line>
                        <line x1="8" y1="18" x2="21" y2="18"></line>
                        <line x1="3" y1="6" x2="3.01" y2="6"></line>
                        <line x1="3" y1="12" x2="3.01" y2="12"></line>
                        <line x1="3" y1="18" x2="3.01" y2="18"></line>
                    </svg>
                    أنواع المعاملات
                </button>
                <button class="settings-nav-btn" onclick="showSettingsSection('all-transactions', this)">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                    </svg>
                    جميع المعاملات
                </button>
                <button class="settings-nav-btn" onclick="showSettingsSection('system', this)">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="3"></circle>
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                    </svg>
                    النظام
                </button>
            </div>
            <div class="settings-content" id="settingsContent">
                <!-- سيتم تحميل المحتوى هنا -->
            </div>
        </div>
    `;
    
    // تحميل الموظفين افتراضياً
    await loadSettingsEmployees();
    showSettingsSection('employees', document.querySelector('.settings-nav-btn'));
}

// عرض قسم في الإعدادات
function showSettingsSection(section, btn) {
    // تحديث الأزرار
    document.querySelectorAll('.settings-nav-btn').forEach(function(b) {
        b.classList.remove('active');
    });
    if (btn) btn.classList.add('active');
    
    var content = document.getElementById('settingsContent');
    
    if (section === 'employees') {
        renderEmployeesSection();
    } else if (section === 'performance') {
        renderPerformanceSection();
    } else if (section === 'types') {
        renderTypesSection();
    } else if (section === 'all-transactions') {
        renderAllTransactionsSection();
    } else if (section === 'system') {
        renderSystemSection();
    }
}

// ========== قسم الموظفين ==========
async function loadSettingsEmployees() {
    try {
        var res = await fetch('api/?action=employees');
        var data = await res.json();
        if (data.success) {
            SettingsData.employees = data.data;
        }
    } catch (e) {
        console.error(e);
    }
}

function renderEmployeesSection() {
    var content = document.getElementById('settingsContent');
    
    var html = '<div class="settings-section-header">';
    html += '<h2>إدارة الموظفين</h2>';
    html += '<button class="btn btn-primary" onclick="openAddEmployeeModal()">';
    html += '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>';
    html += ' إضافة موظف';
    html += '</button>';
    html += '</div>';
    
    // فلتر الأقسام
    html += '<div class="filter-tabs">';
    html += '<button class="filter-tab ' + (SettingsData.currentFilter === 'all' ? 'active' : '') + '" onclick="filterEmployees(\'all\', this)">الكل</button>';
    html += '<button class="filter-tab ' + (SettingsData.currentFilter === 'admin' ? 'active' : '') + '" onclick="filterEmployees(\'admin\', this)">المديرين</button>';
    html += '<button class="filter-tab ' + (SettingsData.currentFilter === 'receiver' ? 'active' : '') + '" onclick="filterEmployees(\'receiver\', this)">الاستلام</button>';
    html += '<button class="filter-tab ' + (SettingsData.currentFilter === 'budget' ? 'active' : '') + '" onclick="filterEmployees(\'budget\', this)">الموازنة</button>';
    html += '<button class="filter-tab ' + (SettingsData.currentFilter === 'payment' ? 'active' : '') + '" onclick="filterEmployees(\'payment\', this)">الدفع</button>';
    html += '<button class="filter-tab ' + (SettingsData.currentFilter === 'invoice' ? 'active' : '') + '" onclick="filterEmployees(\'invoice\', this)">الفوترة</button>';
    html += '</div>';
    
    // بطاقات الموظفين
    html += '<div class="employees-grid">';
    
    var filtered = SettingsData.employees;
    if (SettingsData.currentFilter !== 'all') {
        filtered = SettingsData.employees.filter(function(e) {
            return e.role === SettingsData.currentFilter;
        });
    }
    
    if (filtered.length === 0) {
        html += '<div class="empty-state">لا يوجد موظفين</div>';
    } else {
        for (var i = 0; i < filtered.length; i++) {
            var emp = filtered[i];
            html += '<div class="employee-card">';
            html += '<div class="employee-avatar">' + emp.name.charAt(0) + '</div>';
            html += '<div class="employee-info">';
            html += '<h4>' + emp.name + '</h4>';
            html += '<span class="role-badge role-' + emp.role + '">' + getRoleName(emp.role) + '</span>';
            html += '<p class="employee-contact">' + (emp.email || '—') + '</p>';
            html += '<p class="employee-contact">' + (emp.phone || '—') + '</p>';
            html += '</div>';
            html += '<div class="employee-actions">';
            html += '<button class="btn-icon-sm" onclick="editEmployee(' + emp.id + ')" title="تعديل"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>';
            html += '<button class="btn-icon-sm btn-danger-icon" onclick="deleteEmployee(' + emp.id + ', \'' + emp.name + '\')" title="حذف"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>';
            html += '</div>';
            html += '</div>';
        }
    }
    
    html += '</div>';
    content.innerHTML = html;
}

function getRoleName(role) {
    var roles = {
        'admin': 'مدير النظام',
        'receiver': 'الاستلام',
        'budget': 'الموازنة',
        'payment': 'الدفع',
        'invoice': 'الفوترة'
    };
    return roles[role] || role;
}

function filterEmployees(role, btn) {
    SettingsData.currentFilter = role;
    document.querySelectorAll('.filter-tab').forEach(function(t) {
        t.classList.remove('active');
    });
    btn.classList.add('active');
    renderEmployeesSection();
}

function openAddEmployeeModal() {
    DOM.modalTitle.textContent = 'إضافة موظف جديد';
    DOM.modalBody.innerHTML = `
        <form id="employeeForm" onsubmit="saveEmployee(event)">
            <input type="hidden" name="id" id="empId" value="">
            <div class="form-group">
                <label class="form-label">اسم الموظف</label>
                <input type="text" class="form-input" name="name" id="empName" required>
            </div>
            <div class="form-group">
                <label class="form-label">البريد الإلكتروني</label>
                <input type="email" class="form-input" name="email" id="empEmail">
            </div>
            <div class="form-group">
                <label class="form-label">رقم الهاتف</label>
                <input type="text" class="form-input" name="phone" id="empPhone">
            </div>
            <div class="form-group">
                <label class="form-label">القسم</label>
                <select class="form-select" name="role" id="empRole" required>
                    <option value="">اختر القسم</option>
                    <option value="admin">مدير النظام</option>
                    <option value="receiver">الاستلام</option>
                    <option value="budget">الموازنة</option>
                    <option value="payment">الدفع</option>
                    <option value="invoice">الفوترة</option>
                </select>
            </div>
            <div class="modal-footer" style="padding: 0; border: none; margin-top: 1.5rem;">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
                <button type="submit" class="btn btn-primary">حفظ</button>
            </div>
        </form>
    `;
    openModal();
}

function editEmployee(id) {
    var emp = SettingsData.employees.find(function(e) { return e.id == id; });
    if (!emp) return;
    
    DOM.modalTitle.textContent = 'تعديل موظف';
    DOM.modalBody.innerHTML = `
        <form id="employeeForm" onsubmit="saveEmployee(event)">
            <input type="hidden" name="id" id="empId" value="${emp.id}">
            <div class="form-group">
                <label class="form-label">اسم الموظف</label>
                <input type="text" class="form-input" name="name" id="empName" value="${emp.name}" required>
            </div>
            <div class="form-group">
                <label class="form-label">البريد الإلكتروني</label>
                <input type="email" class="form-input" name="email" id="empEmail" value="${emp.email || ''}">
            </div>
            <div class="form-group">
                <label class="form-label">رقم الهاتف</label>
                <input type="text" class="form-input" name="phone" id="empPhone" value="${emp.phone || ''}">
            </div>
            <div class="form-group">
                <label class="form-label">القسم</label>
                <select class="form-select" name="role" id="empRole" required>
                    <option value="admin" ${emp.role === 'admin' ? 'selected' : ''}>مدير النظام</option>
                    <option value="receiver" ${emp.role === 'receiver' ? 'selected' : ''}>الاستلام</option>
                    <option value="budget" ${emp.role === 'budget' ? 'selected' : ''}>الموازنة</option>
                    <option value="payment" ${emp.role === 'payment' ? 'selected' : ''}>الدفع</option>
                    <option value="invoice" ${emp.role === 'invoice' ? 'selected' : ''}>الفوترة</option>
                </select>
            </div>
            <div class="modal-footer" style="padding: 0; border: none; margin-top: 1.5rem;">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
                <button type="submit" class="btn btn-primary">حفظ</button>
            </div>
        </form>
    `;
    openModal();
}

async function saveEmployee(e) {
    e.preventDefault();
    
    var id = document.getElementById('empId').value;
    var data = {
        name: document.getElementById('empName').value,
        email: document.getElementById('empEmail').value,
        phone: document.getElementById('empPhone').value,
        role: document.getElementById('empRole').value
    };
    
    if (id) data.id = id;
    
    var action = id ? 'update_employee' : 'add_employee';
    
    try {
        var res = await fetch('api/settings.php?action=' + action, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        var result = await res.json();
        
        if (result.success) {
            showToast(id ? 'تم تحديث الموظف' : 'تم إضافة الموظف', 'success');
            closeModal();
            await loadSettingsEmployees();
            renderEmployeesSection();
        } else {
            showToast(result.message || 'خطأ', 'error');
        }
    } catch (err) {
        showToast('خطأ في الاتصال', 'error');
    }
}

async function deleteEmployee(id, name) {
    if (!confirm('هل أنت متأكد من حذف الموظف "' + name + '"؟')) return;
    
    try {
        var res = await fetch('api/settings.php?action=delete_employee', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id })
        });
        
        var result = await res.json();
        
        if (result.success) {
            showToast('تم حذف الموظف', 'success');
            await loadSettingsEmployees();
            renderEmployeesSection();
        } else {
            showToast(result.message || 'خطأ في الحذف', 'error');
        }
    } catch (err) {
        showToast('خطأ في الاتصال', 'error');
    }
}

// ========== قسم أنواع المعاملات ==========
async function loadSettingsTypes() {
    try {
        var res = await fetch('api/?action=types');
        var data = await res.json();
        if (data.success) {
            SettingsData.types = data.data;
        }
    } catch (e) {
        console.error(e);
    }
}

async function renderTypesSection() {
    await loadSettingsTypes();
    
    var content = document.getElementById('settingsContent');
    
    var html = '<div class="settings-section-header">';
    html += '<h2>أنواع المعاملات</h2>';
    html += '<button class="btn btn-primary" onclick="openAddTypeModal()">';
    html += '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>';
    html += ' إضافة نوع';
    html += '</button>';
    html += '</div>';
    
    html += '<div class="types-grid">';
    
    if (SettingsData.types.length === 0) {
        html += '<div class="empty-state">لا يوجد أنواع</div>';
    } else {
        for (var i = 0; i < SettingsData.types.length; i++) {
            var type = SettingsData.types[i];
            html += '<div class="type-card">';
            html += '<div class="type-icon">📄</div>';
            html += '<div class="type-info">';
            html += '<h4>' + type.name + '</h4>';
            html += '<p>' + (type.description || 'بدون وصف') + '</p>';
            html += '</div>';
            html += '<div class="type-actions">';
            html += '<button class="btn-icon-sm" onclick="editType(' + type.id + ')" title="تعديل"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>';
            html += '<button class="btn-icon-sm btn-danger-icon" onclick="deleteType(' + type.id + ', \'' + type.name + '\')" title="حذف"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>';
            html += '</div>';
            html += '</div>';
        }
    }
    
    html += '</div>';
    content.innerHTML = html;
}

function openAddTypeModal() {
    DOM.modalTitle.textContent = 'إضافة نوع معاملة';
    DOM.modalBody.innerHTML = `
        <form id="typeForm" onsubmit="saveType(event)">
            <input type="hidden" name="id" id="typeId" value="">
            <div class="form-group">
                <label class="form-label">اسم النوع</label>
                <input type="text" class="form-input" name="name" id="typeName" required>
            </div>
            <div class="form-group">
                <label class="form-label">الوصف</label>
                <textarea class="form-textarea" name="description" id="typeDesc"></textarea>
            </div>
            <div class="modal-footer" style="padding: 0; border: none; margin-top: 1.5rem;">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
                <button type="submit" class="btn btn-primary">حفظ</button>
            </div>
        </form>
    `;
    openModal();
}

function editType(id) {
    var type = SettingsData.types.find(function(t) { return t.id == id; });
    if (!type) return;
    
    DOM.modalTitle.textContent = 'تعديل نوع المعاملة';
    DOM.modalBody.innerHTML = `
        <form id="typeForm" onsubmit="saveType(event)">
            <input type="hidden" name="id" id="typeId" value="${type.id}">
            <div class="form-group">
                <label class="form-label">اسم النوع</label>
                <input type="text" class="form-input" name="name" id="typeName" value="${type.name}" required>
            </div>
            <div class="form-group">
                <label class="form-label">الوصف</label>
                <textarea class="form-textarea" name="description" id="typeDesc">${type.description || ''}</textarea>
            </div>
            <div class="modal-footer" style="padding: 0; border: none; margin-top: 1.5rem;">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
                <button type="submit" class="btn btn-primary">حفظ</button>
            </div>
        </form>
    `;
    openModal();
}

async function saveType(e) {
    e.preventDefault();
    
    var id = document.getElementById('typeId').value;
    var data = {
        name: document.getElementById('typeName').value,
        description: document.getElementById('typeDesc').value
    };
    
    if (id) data.id = id;
    
    var action = id ? 'update_type' : 'add_type';
    
    try {
        var res = await fetch('api/settings.php?action=' + action, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        var result = await res.json();
        
        if (result.success) {
            showToast(id ? 'تم تحديث النوع' : 'تم إضافة النوع', 'success');
            closeModal();
            renderTypesSection();
        } else {
            showToast(result.message || 'خطأ', 'error');
        }
    } catch (err) {
        showToast('خطأ في الاتصال', 'error');
    }
}

async function deleteType(id, name) {
    if (!confirm('هل أنت متأكد من حذف النوع "' + name + '"؟')) return;
    
    try {
        var res = await fetch('api/settings.php?action=delete_type', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id })
        });
        
        var result = await res.json();
        
        if (result.success) {
            showToast('تم حذف النوع', 'success');
            renderTypesSection();
        } else {
            showToast(result.message || 'خطأ في الحذف', 'error');
        }
    } catch (err) {
        showToast('خطأ في الاتصال', 'error');
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
            html += '<td>' + formatMoney(tx.amount) + '</td>';
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
    
    var filtered = App.transactions.filter(function(tx) {
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
            html += '<td>' + formatMoney(tx.amount) + '</td>';
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

// ========== قسم أداء الموظفين ==========
async function renderPerformanceSection() {
    var content = document.getElementById('settingsContent');
    
    var html = '<div class="settings-section-header">';
    html += '<h2>⏱️ أداء الموظفين</h2>';
    html += '<p style="color: var(--text-muted); margin-top: 0.5rem;">متابعة أوقات إنجاز المعاملات لكل موظف</p>';
    html += '</div>';
    
    // فلاتر
    html += '<div class="performance-filters card" style="padding: 1.5rem; margin-bottom: 1.5rem;">';
    html += '<div class="filter-row" style="display: flex; gap: 1rem; flex-wrap: wrap; align-items: flex-end;">';
    
    // فلتر الموظف
    html += '<div class="form-group" style="flex: 1; min-width: 200px; margin: 0;">';
    html += '<label class="form-label">الموظف</label>';
    html += '<select class="form-select" id="perfEmployeeFilter" onchange="loadPerformanceData()">';
    html += '<option value="">جميع الموظفين</option>';
    if (SettingsData.employees) {
        SettingsData.employees.forEach(function(emp) {
            html += '<option value="' + emp.id + '">' + emp.name + ' (' + getRoleName(emp.role) + ')</option>';
        });
    }
    html += '</select>';
    html += '</div>';
    
    // فلتر المرحلة
    html += '<div class="form-group" style="flex: 1; min-width: 150px; margin: 0;">';
    html += '<label class="form-label">المرحلة</label>';
    html += '<select class="form-select" id="perfStageFilter" onchange="loadPerformanceData()">';
    html += '<option value="">جميع المراحل</option>';
    html += '<option value="receiving">الاستلام</option>';
    html += '<option value="budget">الموازنة</option>';
    html += '<option value="payment">الدفع</option>';
    html += '<option value="invoice">الفوترة</option>';
    html += '</select>';
    html += '</div>';
    
    // فلتر التاريخ من
    html += '<div class="form-group" style="flex: 1; min-width: 150px; margin: 0;">';
    html += '<label class="form-label">من تاريخ</label>';
    html += '<input type="date" class="form-input" id="perfDateFrom" onchange="loadPerformanceData()">';
    html += '</div>';
    
    // فلتر التاريخ إلى
    html += '<div class="form-group" style="flex: 1; min-width: 150px; margin: 0;">';
    html += '<label class="form-label">إلى تاريخ</label>';
    html += '<input type="date" class="form-input" id="perfDateTo" onchange="loadPerformanceData()">';
    html += '</div>';
    
    html += '</div>';
    html += '</div>';
    
    // ملخص الأداء
    html += '<div id="performanceSummary" class="performance-summary" style="margin-bottom: 1.5rem;"></div>';
    
    // جدول التفاصيل
    html += '<div class="card">';
    html += '<div class="card-header">';
    html += '<span class="card-title">📋 تفاصيل الأوقات</span>';
    html += '</div>';
    html += '<div class="card-body" style="padding: 0;">';
    html += '<div id="performanceTable" style="overflow-x: auto;"></div>';
    html += '</div>';
    html += '</div>';
    
    content.innerHTML = html;
    
    // تحميل البيانات
    loadPerformanceData();
}

async function loadPerformanceData() {
    var employeeId = document.getElementById('perfEmployeeFilter')?.value || '';
    var stage = document.getElementById('perfStageFilter')?.value || '';
    var dateFrom = document.getElementById('perfDateFrom')?.value || '';
    var dateTo = document.getElementById('perfDateTo')?.value || '';
    
    // تحميل ملخص الأداء
    try {
        var params = new URLSearchParams();
        if (dateFrom) params.append('date_from', dateFrom);
        if (dateTo) params.append('date_to', dateTo);
        
        var summaryRes = await fetch('api/?action=performance_summary&' + params.toString());
        var summaryData = await summaryRes.json();
        
        if (summaryData.success) {
            renderPerformanceSummary(summaryData.data);
        }
    } catch (e) {
        console.error('Error loading performance summary:', e);
    }
    
    // تحميل التفاصيل
    try {
        var params = new URLSearchParams();
        if (employeeId) params.append('employee_id', employeeId);
        if (stage) params.append('stage', stage);
        if (dateFrom) params.append('date_from', dateFrom);
        if (dateTo) params.append('date_to', dateTo);
        
        var detailsRes = await fetch('api/?action=employee_times&' + params.toString());
        var detailsData = await detailsRes.json();
        
        if (detailsData.success) {
            renderPerformanceTable(detailsData.data);
        }
    } catch (e) {
        console.error('Error loading performance details:', e);
    }
}

function renderPerformanceSummary(data) {
    var container = document.getElementById('performanceSummary');
    if (!container) return;
    
    // تجميع البيانات حسب الموظف
    var employeeStats = {};
    data.forEach(function(item) {
        if (!employeeStats[item.employee_id]) {
            employeeStats[item.employee_id] = {
                name: item.employee_name,
                role: item.employee_role,
                total: 0,
                avgTime: 0,
                totalDuration: 0
            };
        }
        employeeStats[item.employee_id].total += parseInt(item.total_transactions) || 0;
        employeeStats[item.employee_id].totalDuration += parseInt(item.total_duration) || 0;
    });
    
    // حساب المتوسط
    Object.keys(employeeStats).forEach(function(id) {
        var emp = employeeStats[id];
        emp.avgTime = emp.total > 0 ? Math.round(emp.totalDuration / emp.total) : 0;
    });
    
    var html = '<div class="performance-cards" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem;">';
    
    Object.keys(employeeStats).forEach(function(id) {
        var emp = employeeStats[id];
        var avgClass = emp.avgTime <= 10 ? 'excellent' : (emp.avgTime <= 30 ? 'good' : 'slow');
        
        html += '<div class="card performance-card" style="padding: 1.25rem;">';
        html += '<div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem;">';
        html += '<div class="emp-avatar" style="width: 50px; height: 50px; border-radius: 12px; background: var(--btn-primary-bg); color: var(--btn-primary-text); display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 1.2rem;">' + (emp.name ? emp.name.charAt(0) : '؟') + '</div>';
        html += '<div>';
        html += '<h4 style="margin: 0; color: var(--text-primary);">' + emp.name + '</h4>';
        html += '<span class="role-badge role-' + emp.role + '" style="font-size: 0.75rem;">' + getRoleName(emp.role) + '</span>';
        html += '</div>';
        html += '</div>';
        
        html += '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">';
        html += '<div style="text-align: center; padding: 0.75rem; background: var(--bg-surface); border-radius: 8px;">';
        html += '<div style="font-size: 1.5rem; font-weight: 700; color: var(--accent-blue);">' + emp.total + '</div>';
        html += '<div style="font-size: 0.75rem; color: var(--text-muted);">معاملة منجزة</div>';
        html += '</div>';
        html += '<div style="text-align: center; padding: 0.75rem; background: var(--bg-surface); border-radius: 8px;">';
        html += '<div style="font-size: 1.5rem; font-weight: 700; color: ' + (avgClass === 'excellent' ? 'var(--accent-green)' : avgClass === 'good' ? 'var(--accent-orange)' : 'var(--accent-red)') + ';">' + formatDuration(emp.avgTime) + '</div>';
        html += '<div style="font-size: 0.75rem; color: var(--text-muted);">متوسط الوقت</div>';
        html += '</div>';
        html += '</div>';
        
        html += '</div>';
    });
    
    if (Object.keys(employeeStats).length === 0) {
        html += '<div class="empty-state" style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: var(--text-muted);">';
        html += '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 1rem; opacity: 0.5;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>';
        html += '<p>لا توجد بيانات أداء متاحة</p>';
        html += '</div>';
    }
    
    html += '</div>';
    container.innerHTML = html;
}

function renderPerformanceTable(data) {
    var container = document.getElementById('performanceTable');
    if (!container) return;
    
    if (!data || data.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 3rem; color: var(--text-muted);">لا توجد سجلات</div>';
        return;
    }
    
    var html = '<table class="table" style="width: 100%;">';
    html += '<thead><tr>';
    html += '<th>رقم المعاملة</th>';
    html += '<th>الموظف</th>';
    html += '<th>المرحلة</th>';
    html += '<th>وقت البدء</th>';
    html += '<th>وقت الانتهاء</th>';
    html += '<th>المدة</th>';
    html += '<th>الحالة</th>';
    html += '</tr></thead>';
    html += '<tbody>';
    
    data.forEach(function(item) {
        var durationClass = item.duration_minutes <= 10 ? 'excellent' : (item.duration_minutes <= 30 ? 'good' : 'slow');
        
        html += '<tr>';
        html += '<td><span style="color: var(--accent-blue); font-family: monospace;">' + (item.transaction_number || '-') + '</span></td>';
        html += '<td>' + (item.employee_name || '-') + '</td>';
        html += '<td>' + getStageName(item.stage) + '</td>';
        html += '<td style="font-size: 0.85rem;">' + formatDateTime(item.started_at) + '</td>';
        html += '<td style="font-size: 0.85rem;">' + formatDateTime(item.completed_at) + '</td>';
        html += '<td><span class="duration-badge ' + durationClass + '">' + formatDuration(item.duration_minutes) + '</span></td>';
        html += '<td>' + (item.status || '-') + '</td>';
        html += '</tr>';
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
}

function getStageName(stage) {
    var stages = {
        'receiving': 'الاستلام',
        'budget': 'الموازنة',
        'payment': 'الدفع',
        'invoice': 'الفوترة'
    };
    return stages[stage] || stage;
}

function formatDuration(minutes) {
    if (!minutes || minutes === 0) return '-';
    if (minutes < 60) return minutes + ' د';
    var hours = Math.floor(minutes / 60);
    var mins = minutes % 60;
    return hours + ' س ' + (mins > 0 ? mins + ' د' : '');
}

function formatDateTime(datetime) {
    if (!datetime) return '-';
    var date = new Date(datetime);
    return date.toLocaleDateString('ar-SA') + ' ' + date.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
}

// ========== قسم النظام ==========
async function renderSystemSection() {
    var content = document.getElementById('settingsContent');
    
    // جلب الإحصائيات
    var stats = { transactions: 0, employees: 0, types: 0, total_amount: 0 };
    try {
        var res = await fetch('api/settings.php?action=full_stats');
        var data = await res.json();
        if (data.success) stats = data.data;
    } catch (e) {}
    
    var html = '<div class="settings-section-header">';
    html += '<h2>إعدادات النظام</h2>';
    html += '</div>';
    
    html += '<div class="system-grid">';
    
    // إحصائيات
    html += '<div class="system-card">';
    html += '<h3>📊 إحصائيات النظام</h3>';
    html += '<div class="stats-grid">';
    html += '<div class="stat-item"><span class="stat-number">' + stats.transactions + '</span><span class="stat-label">معاملة</span></div>';
    html += '<div class="stat-item"><span class="stat-number">' + stats.employees + '</span><span class="stat-label">موظف</span></div>';
    html += '<div class="stat-item"><span class="stat-number">' + stats.types + '</span><span class="stat-label">نوع</span></div>';
    html += '<div class="stat-item"><span class="stat-number">' + formatMoney(stats.total_amount) + '</span><span class="stat-label">إجمالي المبالغ</span></div>';
    html += '</div>';
    html += '</div>';
    
    // معلومات النظام
    html += '<div class="system-card">';
    html += '<h3>ℹ️ معلومات النظام</h3>';
    html += '<div class="info-list">';
    html += '<div class="info-item"><span>اسم النظام:</span><span>نظام إدارة المعاملات</span></div>';
    html += '<div class="info-item"><span>الإصدار:</span><span>1.0.0</span></div>';
    html += '<div class="info-item"><span>قاعدة البيانات:</span><span>MySQL</span></div>';
    html += '</div>';
    html += '</div>';
    
    // منطقة الخطر
    html += '<div class="system-card danger-zone">';
    html += '<h3>⚠️ منطقة الخطر</h3>';
    html += '<p>هذه الإجراءات لا يمكن التراجع عنها</p>';
    html += '<div class="danger-buttons">';
    html += '<button class="btn btn-danger" onclick="clearAllTransactions()">حذف جميع المعاملات</button>';
    html += '</div>';
    html += '</div>';
    
    html += '</div>';
    content.innerHTML = html;
}

async function clearAllTransactions() {
    if (!confirm('⚠️ تحذير!\n\nسيتم حذف جميع المعاملات نهائياً.\nهذا الإجراء لا يمكن التراجع عنه.\n\nهل أنت متأكد؟')) return;
    if (!confirm('تأكيد نهائي: سيتم حذف كل شيء!')) return;
    
    try {
        var res = await fetch('api/settings.php?action=clear_all', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        var result = await res.json();
        
        if (result.success) {
            showToast('تم حذف جميع المعاملات', 'success');
            await loadTransactions();
            renderSystemSection();
        } else {
            showToast(result.message || 'خطأ', 'error');
        }
    } catch (err) {
        showToast('خطأ في الاتصال', 'error');
    }
}
