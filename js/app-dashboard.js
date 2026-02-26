/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║         app-dashboard.js — لوحة التحكم الرئيسية             ║
 * ║  يتطلب: app-common.js                                        ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * يحتوي هذا الملف على:
 *  • تحميل وعرض لوحة التحكم الرئيسية (loadDashboard)
 *  • بطاقات الإحصائيات والرسوم البيانية
 *  • تبويب الأداء: أداء الموظفين، سجل الأحداث، التحليلات
 *  • المعاملات العاجلة ومرشحاتها
 *  • الرسوم البيانية: خطي ودائري (renderLineChart, renderPieChart)
 *  • عرض إحصائيات المراسلات في لوحة التحكم
 */

// ═══════════════════════════════════════════════════════════
//  تحميل لوحة التحكم
// ═══════════════════════════════════════════════════════════

/**
 * تحميل لوحة التحكم الرئيسية
 * تجلب: الإحصائيات، بيانات الرسوم البيانية، المعاملات العاجلة
 */
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
        <div class="dashboard-split">
            <!-- القسم الأيمن: نظرة عامة + المعاملات العاجلة -->
            <div class="dashboard-right">
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
                                    <th>المبلغ</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody id="urgentTableBody">
                                ${urgentTransactions.slice(0, 8).map(tx => `
                                <tr class="urgent-row" data-type="${tx.alert_type || 'عاجل'}">
                                    <td>
                                        <span class="alert-badge alert-${tx.alert_type === 'عاجل' ? 'danger' : tx.alert_type === 'متابعة' ? 'warning' : 'info'}">
                                            ${tx.alert_type === 'عاجل' ? '🔴' : tx.alert_type === 'متابعة' ? '⚠️' : '⏳'}
                                        </span>
                                    </td>
                                    <td><span class="tx-number">${tx.transaction_number}</span></td>
                                    <td><span class="tx-desc-text">${tx.description?.substring(0, 30) || ''}${tx.description?.length > 30 ? '...' : ''}</span></td>
                                    <td><span class="tx-amount">${formatMoney(tx.amount)}</span></td>
                                    <td>
                                        <button class="btn-action btn-view" onclick="viewTransaction(${tx.id})" title="عرض">
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                                <circle cx="12" cy="12" r="3"></circle>
                                            </svg>
                                        </button>
                                    </td>
                                </tr>
                                `).join('')}
                            </tbody>
                        </table>
                        ${urgentTransactions.length > 8 ? `<div class="urgent-more">و ${urgentTransactions.length - 8} معاملات أخرى...</div>` : ''}
                        ` : `
                        <div class="urgent-empty">
                            <div class="empty-icon">✅</div>
                            <h4>لا توجد معاملات عاجلة</h4>
                            <p>جميع المعاملات تسير بشكل طبيعي</p>
                        </div>
                        `}
                    </div>
                </div>
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
                
                
            </div>
            
            <!-- القسم الأيسر: متابعة الأداء -->
            <div class="dashboard-left">
                <div class="performance-dashboard-section">
                    <div class="perf-dash-header">
                        <div class="perf-dash-title">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"></circle>
                                <polyline points="12 6 12 12 16 14"></polyline>
                            </svg>
                            <h3>متابعة الأداء</h3>
                        </div>
                        <div class="perf-dash-tabs">
                            <button class="perf-dash-tab active" onclick="switchDashPerfTab('employees', this)">الموظفين</button>
                            <button class="perf-dash-tab" onclick="switchDashPerfTab('events', this)">الأحداث</button>
                        </div>
                    </div>
                    
                    <!-- قسم الموظفين -->
                    <div id="dashPerfEmployees" class="perf-dash-content active">
                        <div id="dashEmployeeCards" class="dash-employee-cards">
                            <div class="loading-placeholder">جاري التحميل...</div>
                        </div>
                    </div>
                    
                    <!-- قسم الأحداث -->
                    <div id="dashPerfEvents" class="perf-dash-content">
                        <div id="dashEventsTimeline" class="dash-events-timeline">
                            <div class="loading-placeholder">جاري التحميل...</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    DOM.mainContent.innerHTML = html;

    // تحميل بيانات الأداء
    loadDashboardPerformance();

    if (DOM.notificationBadge) {
        DOM.notificationBadge.textContent = App.stats.urgent || 0;
        DOM.notificationBadge.style.display = App.stats.urgent > 0 ? 'flex' : 'none';
    }
}

// تبديل تبويبات الأداء في لوحة التحكم
function switchDashPerfTab(tab, btn) {
    document.querySelectorAll('.perf-dash-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.perf-dash-content').forEach(c => c.classList.remove('active'));

    btn.classList.add('active');

    if (tab === 'employees') {
        document.getElementById('dashPerfEmployees').classList.add('active');
    } else {
        document.getElementById('dashPerfEvents').classList.add('active');
        loadDashboardEvents();
    }
}

// تحميل بيانات الأداء في لوحة التحكم
async function loadDashboardPerformance() {
    try {
        const res = await fetch('api/?action=performance_summary');
        const result = await res.json();

        if (result.success) {
            renderDashboardEmployees(result.data);
        }
    } catch (e) {
        console.error('Error loading performance:', e);
    }


    // إضافة إحصائيات الخطابات
    fetch('api/correspondence_api.php?action=stats')
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                displayCorrespondenceStatsInDashboard(data.data);
            }
        });
}

function displayCorrespondenceStatsInDashboard(stats) {
    // إضافة قسم جديد في لوحة التحكم
    const corrSection = `
        <div class="dashboard-section">
            <h3>📨 الخطابات والمراسلات</h3>
            <div class="mini-stats">
                <div class="mini-stat">
                    <span class="mini-stat-value">${stats.total}</span>
                    <span class="mini-stat-label">إجمالي الخطابات</span>
                </div>
                <div class="mini-stat">
                    <span class="mini-stat-value">${stats.pending}</span>
                    <span class="mini-stat-label">قيد المعالجة</span>
                </div>
                <div class="mini-stat">
                    <span class="mini-stat-value">${stats.urgent}</span>
                    <span class="mini-stat-label">عاجلة</span>
                </div>
            </div>
        </div>
    `;

    // إدراجه في المكان المناسب
}
// عرض بطاقات الموظفين في لوحة التحكم
function renderDashboardEmployees(data) {
    const container = document.getElementById('dashEmployeeCards');
    if (!container) return;

    // تجميع البيانات حسب الموظف
    const employeeStats = {};
    data.forEach(item => {
        if (!employeeStats[item.employee_id]) {
            employeeStats[item.employee_id] = {
                name: item.employee_name,
                role: item.employee_role,
                total: 0,
                totalDuration: 0
            };
        }
        employeeStats[item.employee_id].total += parseInt(item.total_transactions) || 0;
        employeeStats[item.employee_id].totalDuration += parseInt(item.total_duration) || 0;
    });

    const roleColors = {
        'admin': '#667eea',
        'receiver': '#69db7c',
        'budget': '#3bc9db',
        'payment': '#ffa94d',
        'invoice': '#b197fc'
    };

    const roleNames = {
        'admin': 'مدير',
        'receiver': 'استلام',
        'budget': 'موازنة',
        'payment': 'دفع',
        'invoice': 'فوترة'
    };

    let html = '';

    Object.values(employeeStats).forEach(emp => {
        const avgTime = emp.total > 0 ? Math.round(emp.totalDuration / emp.total) : 0;
        const color = roleColors[emp.role] || '#667eea';
        const roleName = roleNames[emp.role] || emp.role;

        html += `
        <div class="dash-emp-card">
            <div class="dash-emp-avatar" style="background: ${color}20; color: ${color};">
                ${emp.name ? emp.name.charAt(0) : '؟'}
            </div>
            <div class="dash-emp-info">
                <span class="dash-emp-name">${emp.name}</span>
                <span class="dash-emp-role" style="color: ${color};">${roleName}</span>
            </div>
            <div class="dash-emp-stats">
                <span class="dash-emp-count">${emp.total}</span>
                <span class="dash-emp-time">${avgTime > 0 ? avgTime + ' د' : '-'}</span>
            </div>
        </div>`;
    });

    if (Object.keys(employeeStats).length === 0) {
        html = '<div class="empty-placeholder">لا توجد بيانات</div>';
    }

    container.innerHTML = html;
}

// تحميل أحداث لوحة التحكم
async function loadDashboardEvents() {
    const container = document.getElementById('dashEventsTimeline');
    if (!container) return;

    container.innerHTML = '<div class="loading-placeholder">جاري التحميل...</div>';

    try {
        const res = await fetch('api/?action=all_events&limit=15');
        const result = await res.json();

        if (result.success && result.data && result.data.length > 0) {
            const stageInfo = {
                'creation': { name: 'إنشاء', color: '#4dabf7', icon: '➕' },
                'receiving': { name: 'استلام', color: '#69db7c', icon: '📥' },
                'budget': { name: 'موازنة', color: '#3bc9db', icon: '💰' },
                'payment': { name: 'دفع', color: '#ffa94d', icon: '💳' },
                'invoice': { name: 'فوترة', color: '#b197fc', icon: '🧾' }
            };

            let html = '<div class="dash-timeline">';

            result.data.forEach(event => {
                const info = stageInfo[event.stage] || { name: event.stage, color: '#888', icon: '📋' };
                const duration = event.duration_from_previous;

                html += `
                <div class="dash-event-item">
                    <div class="dash-event-icon" style="background: ${info.color}20; color: ${info.color};">${info.icon}</div>
                    <div class="dash-event-content">
                        <div class="dash-event-header">
                            <span class="dash-event-tx">${event.transaction_number || '-'}</span>
                            <span class="dash-event-tx">${event.transaction_date || '-'}</span>
                            <span class="dash-event-stage" style="color: ${info.color};">${info.name}</span>
                        </div>
                        <div class="dash-event-status">
                            ${event.old_status ? `<span class="old">${event.old_status}</span> ← ` : ''}
                            <span class="new">${event.new_status || '-'}</span>
                            ${duration > 0 ? `<span class="duration">${formatDuration(duration)} </span>` : ''}
                        </div>
                        <div class="dash-event-footer">
                            <span>${event.employee_name || 'النظام'}</span>
                            <span>${formatTimeAgo(event.event_time)}</span>
                        </div>
                    </div>
                </div>`;
            });

            html += '</div>';
            container.innerHTML = html;
        } else {
            container.innerHTML = '<div class="empty-placeholder">لا توجد أحداث</div>';
        }
    } catch (e) {
        container.innerHTML = '<div class="empty-placeholder">خطأ في التحميل</div>';
    }
}

function formatDuration(minutes) {
    if (!minutes || minutes <= 0) return 'الآن';

    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    const mins = minutes % 60;

    let parts = [];

    if (days > 0) parts.push(`${days} يوم`);
    if (hours > 0) parts.push(`${hours} ساعة`);
    if (mins > 0 && days === 0) parts.push(`${mins} دقيقة`);

    return 'منذ ' + parts.join(' و ');
}


// تنسيق الوقت النسبي
function formatTimeAgo(datetime) {
    if (!datetime) return '';
    const date = new Date(datetime);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);

    if (diff < 60) return 'الآن';
    if (diff < 3600) return Math.floor(diff / 60) + ' د';
    if (diff < 86400) return Math.floor(diff / 3600) + ' س';
    return Math.floor(diff / 86400) + ' ي';
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


// تحميل المعاملات

// ═══════════════════════════════════════════════════════════
//  صفحة متابعة الأداء (مستقلة)
// ══════════════════════════════════

async function loadPerformancePage() {
    showLoading();

    // تحميل الموظفين إذا لم تكن محملة
    if (!SettingsData.employees || !SettingsData.employees.length) {
        try {
            const empRes = await fetch('api/?action=employees');
            const empData = await empRes.json();
            if (empData.success) SettingsData.employees = empData.data;
        } catch (e) { }
    }

    DOM.mainContent.innerHTML = `
    <div class="performance-page">
        <div class="perf-header">
            <div class="perf-header-content">
                <div class="perf-title">
                    <div class="perf-icon">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                        </svg>
                    </div>
                    <div>
                        <h1>متابعة الأداء</h1>
                        <p>تحليل أوقات إنجاز المعاملات وأداء الموظفين</p>
                    </div>
                </div>
                <div class="perf-header-stats" id="perfHeaderStats">
                    <div class="header-stat">
                        <span class="stat-number" id="totalEventsToday">-</span>
                        <span class="stat-label">أحداث اليوم</span>
                    </div>
                    <div class="header-stat">
                        <span class="stat-number" id="avgTimeToday">-</span>
                        <span class="stat-label">متوسط الوقت</span>
                    </div>
                </div>
            </div>
        </div>

        <div class="perf-tabs">
            <button class="perf-tab active" onclick="switchPerfTab('overview')">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="7" height="7"></rect>
                    <rect x="14" y="3" width="7" height="7"></rect>
                    <rect x="14" y="14" width="7" height="7"></rect>
                    <rect x="3" y="14" width="7" height="7"></rect>
                </svg>
                نظرة عامة
            </button>
            <button class="perf-tab" onclick="switchPerfTab('timeline')">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="12" y1="20" x2="12" y2="10"></line>
                    <line x1="18" y1="20" x2="18" y2="4"></line>
                    <line x1="6" y1="20" x2="6" y2="16"></line>
                </svg>
                سجل الأحداث
            </button>
            <button class="perf-tab" onclick="switchPerfTab('analytics')">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="20" x2="18" y2="10"></line>
                    <line x1="12" y1="20" x2="12" y2="4"></line>
                    <line x1="6" y1="20" x2="6" y2="14"></line>
                </svg>
                تحليلات
            </button>
        </div>

        <div class="perf-filters">
            <div class="filter-group">
                <label>الموظف</label>
                <select id="perfEmployeeFilter" onchange="loadPerformanceData()">
                    <option value="">جميع الموظفين</option>
                    ${(SettingsData.employees || []).map(emp =>
        '<option value="' + emp.id + '">' + emp.name + '</option>'
    ).join('')}
                </select>
            </div>
            <div class="filter-group">
                <label>المرحلة</label>
                <select id="perfStageFilter" onchange="loadPerformanceData()">
                    <option value="">جميع المراحل</option>
                    <option value="creation">الإنشاء</option>
                    <option value="receiving">الاستلام</option>
                    <option value="budget">الموازنة</option>
                    <option value="payment">الدفع</option>
                    <option value="invoice">الفوترة</option>
                </select>
            </div>
            <div class="filter-group">
                <label>من تاريخ</label>
                <input type="date" id="perfDateFrom" onchange="loadPerformanceData()">
            </div>
            <div class="filter-group">
                <label>إلى تاريخ</label>
                <input type="date" id="perfDateTo" onchange="loadPerformanceData()">
            </div>
            <button class="filter-reset" onclick="resetPerfFilters()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
                    <path d="M3 3v5h5"></path>
                </svg>
                إعادة تعيين
            </button>
        </div>

        <div class="perf-content">
            <div id="perfTabOverview" class="perf-tab-content active">
                <div id="performanceSummary" class="employee-cards-grid"></div>
                <div class="perf-section">
                    <div class="section-header">
                        <h3>تفاصيل الأوقات</h3>
                    </div>
                    <div id="performanceTable" class="perf-table-container"></div>
                </div>
            </div>

            <div id="perfTabTimeline" class="perf-tab-content">
                <div class="perf-section">
                    <div class="section-header">
                        <h3>سجل جميع الأحداث والتغييرات</h3>
                        <span class="events-count" id="eventsCount">-</span>
                    </div>
                    <div id="eventsTimeline" class="events-timeline-container"></div>
                </div>
            </div>

            <div id="perfTabAnalytics" class="perf-tab-content">
                <div class="analytics-grid">
                    <div class="analytics-card">
                        <h4>توزيع الأحداث حسب المرحلة</h4>
                        <div id="stageDistribution" class="chart-container"></div>
                    </div>
                    <div class="analytics-card">
                        <h4>أداء الموظفين</h4>
                        <div id="employeeRanking" class="ranking-list"></div>
                    </div>
                </div>
            </div>
        </div>
    </div>`;

    if (typeof loadPerformanceData === 'function') loadPerformanceData();
    if (typeof loadEventsTimeline === 'function') loadEventsTimeline();
}