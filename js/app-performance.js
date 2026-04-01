/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║      app-performance.js — متابعة الأداء وسجل الأحداث        ║
 * ║  يتطلب: app-common.js, app-transactions.js                   ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

// ========== قسم أداء الموظفين ==========
async function renderPerformanceSection() {
    var content = document.getElementById('settingsContent');

    var html = `
    <div class="performance-page">
        <!-- Header -->
        <div class="perf-header">
            <div class="perf-header-content">
                <div class="perf-title">
                    <div class="perf-icon">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"></circle>
                            <polyline points="12 6 12 12 16 14"></polyline>
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

        <!-- تبويبات -->
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

            <button class="perf-tab sla-tab-btn" onclick="switchPerfTab('sla')">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                SLA / OLA
                <span class="tab-badge sla-breach-badge" id="slaBadge" style="display:none">0</span>
            </button>
        </div>

        <!-- الفلاتر -->
        <div class="perf-filters">
            <div class="filter-group">
                <label>الموظف</label>
                <select id="perfEmployeeFilter" onchange="loadPerformanceData()">
                    <option value="">جميع الموظفين</option>
                    ${SettingsData.employees ? SettingsData.employees.map(emp =>
        `<option value="${emp.id}">${emp.name}</option>`
    ).join('') : ''}
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

        <!-- المحتوى -->
        <div class="perf-content">
            <!-- نظرة عامة -->
            <div id="perfTabOverview" class="perf-tab-content active">
                <!-- بطاقات الموظفين -->
                <div id="performanceSummary" class="employee-cards-grid"></div>

                <!-- جدول التفاصيل -->
                <div class="perf-section">
                    <div class="section-header">
                        <h3>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                <polyline points="14 2 14 8 20 8"></polyline>
                                <line x1="16" y1="13" x2="8" y2="13"></line>
                                <line x1="16" y1="17" x2="8" y2="17"></line>
                            </svg>
                            تفاصيل الأوقات
                        </h3>
                    </div>
                    <div id="performanceTable" class="perf-table-container"></div>
                </div>
            </div>

            <!-- سجل الأحداث -->
            <div id="perfTabTimeline" class="perf-tab-content">
                <div class="perf-section">
                    <div class="section-header">
                        <h3>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"></circle>
                                <polyline points="12 6 12 12 16 14"></polyline>
                            </svg>
                            سجل جميع الأحداث والتغييرات
                        </h3>
                        <span class="events-count" id="eventsCount">-</span>
                    </div>
                    <div id="eventsTimeline" class="events-timeline-container"></div>
                </div>
            </div>


            <!-- ═══ SLA / OLA ═══ -->
            <div id="perfTabSla" class="perf-tab-content">
                <!-- إحصاءات سريعة -->
                <div id="slaStats" class="sla-stats-bar">
                    <div class="sla-stat sla-stat-breach">
                        <div class="sla-stat-num" id="slaBreachCount">—</div>
                        <div class="sla-stat-label">تجاوزات مفتوحة</div>
                    </div>
                    <div class="sla-stat sla-stat-warn">
                        <div class="sla-stat-num" id="slaWarnCount">—</div>
                        <div class="sla-stat-label">تحذيرات نشطة</div>
                    </div>
                    <div class="sla-stat sla-stat-today">
                        <div class="sla-stat-num" id="slaBreachToday">—</div>
                        <div class="sla-stat-label">تجاوزات اليوم</div>
                    </div>
                    <div class="sla-stat sla-stat-action">
                        <button class="btn btn-sm btn-primary" onclick="runSlaCheck()">🔄 فحص الآن</button>
                        <button class="btn btn-sm btn-secondary" onclick="openSlaSettingsModal()">⚙️ OLA/SLA</button>
                        <button class="btn btn-sm btn-secondary" onclick="openNotifSettingsModal()">📧 إعدادات الإشعارات</button>
                    </div>
                </div>

                <!-- فلاتر -->
                <div class="perf-filters" style="margin-top:.75rem">
                    <div class="filter-group">
                        <label>النطاق</label>
                        <select id="slaScopeFilter" onchange="loadSlaDashboard()">
                            <option value="all">الكل</option>
                            <option value="transaction">معاملات</option>
                            <option value="correspondence">مراسلات</option>
                        </select>
                    </div>
                    <div class="filter-group">
                        <label>حالة SLA</label>
                        <select id="slaStatusFilter" onchange="loadSlaDashboard()">
                            <option value="">الكل</option>
                            <option value="breached">تجاوز✗</option>
                            <option value="warning">تحذير ⚠</option>
                            <option value="ok">ضمن المدة ✓</option>
                        </select>
                    </div>
                    <div class="filter-group">
                        <label>نوع الإشعار</label>
                        <select id="slaBreachTypeFilter" onchange="loadSlaBreaches()">
                            <option value="">الكل</option>
                            <option value="ola_breach">تجاوزOLA</option>
                            <option value="sla_breach">تجاوزSLA</option>
                            <option value="ola_warning">تحذير OLA</option>
                            <option value="sla_warning">تحذير SLA</option>
                        </select>
                    </div>
                    <div class="filter-group">
                        <label>الحالة</label>
                        <select id="slaResolvedFilter" onchange="loadSlaBreaches()">
                            <option value="">الكل</option>
                            <option value="no">غير محلول</option>
                            <option value="yes">محلول</option>
                        </select>
                    </div>
                </div>

                <!-- جدول المعاملات مع حالة SLA -->
                <div class="perf-section">
                    <div class="section-header">
                        <h3>📋 حالة SLA للمعاملات النشطة</h3>
                    </div>
                    <div id="slaDashboardTable" class="perf-table-container">
                        <div class="loading-placeholder">جارٍ التحميل...</div>
                    </div>
                </div>

                <!-- سجل التجاوزات -->
                <div class="perf-section" style="margin-top:1.5rem">
                    <div class="section-header">
                        <h3>⚠️ سجل التجاوزات والتصعيد</h3>
                    </div>
                    <div id="slaBreachLog" class="perf-table-container">
                        <div class="loading-placeholder">جارٍ التحميل...</div>
                    </div>
                </div>
            </div>

        </div>
    </div>`;

    content.innerHTML = html;

    // تحميل البيانات
    loadPerformanceData();
    loadEventsTimeline();
}

// تبديل التبويبات
function switchPerfTab(tab) {
    document.querySelectorAll('.perf-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.perf-tab-content').forEach(c => c.classList.remove('active'));

    event.target.closest('.perf-tab').classList.add('active');
    document.getElementById('perfTab' + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.add('active');

    if (tab === 'sla') {
        loadSlaStats();
        loadSlaDashboard();
        loadSlaBreaches();
        return;
    }
    if (tab === 'timeline') {
        loadEventsTimeline();
    } else if (tab === 'analytics') {
        loadAnalytics();
    }
}

// إعادة تعيين الفلاتر
function resetPerfFilters() {
    document.getElementById('perfEmployeeFilter').value = '';
    document.getElementById('perfStageFilter').value = '';
    document.getElementById('perfDateFrom').value = '';
    document.getElementById('perfDateTo').value = '';
    loadPerformanceData();
    loadEventsTimeline();
}

// تحميل سجل الأحداث
async function loadEventsTimeline() {
    var container = document.getElementById('eventsTimeline');
    var countEl = document.getElementById('eventsCount');
    if (!container) return;

    container.innerHTML = '<div class="loading-spinner">جاري التحميل...</div>';

    try {
        var employeeId = document.getElementById('perfEmployeeFilter')?.value || '';
        var stage = document.getElementById('perfStageFilter')?.value || '';

        var params = new URLSearchParams();
        params.append('limit', '100');
        if (employeeId) params.append('employee_id', employeeId);
        if (stage) params.append('stage', stage);

        var res = await fetch('api/?action=all_events&' + params.toString());
        var result = await res.json();

        if (result.success && result.data && result.data.length > 0) {
            if (countEl) countEl.textContent = result.data.length + ' حدث';

            var html = '<div class="timeline-list">';

            var stageInfo = {
                'creation': { name: 'الإنشاء', color: '#4dabf7', icon: '➕' },
                'receiving': { name: 'الاستلام', color: '#69db7c', icon: '📥' },
                'budget': { name: 'الموازنة', color: '#3bc9db', icon: '💰' },
                'payment': { name: 'الدفع', color: '#ffa94d', icon: '💳' },
                'invoice': { name: 'الفوترة', color: '#b197fc', icon: '🧾' }
            };

            result.data.forEach(function (event) {
                var info = stageInfo[event.stage] || { name: event.stage, color: '#888', icon: '📋' };
                var duration = event.duration_from_previous;
                var durationClass = duration <= 5 ? 'fast' : (duration <= 30 ? 'normal' : 'slow');

                html += `
                <div class="timeline-item">
                    <div class="timeline-dot" style="background: ${info.color};">${info.icon}</div>
                    <div class="timeline-content">
                        <div class="timeline-header">
                            <span class="timeline-tx">${event.transaction_number || '-'}</span>
                            <span class="timeline-stage" style="background: ${info.color}20; color: ${info.color}; border: 1px solid ${info.color}40;">${info.name}</span>
                            ${duration !== null ? `<span class="timeline-duration ${durationClass}">${duration} دقيقة</span>` : ''}
                        </div>
                        <div class="timeline-status">
                            ${event.old_status ? `<span class="status-old">${event.old_status}</span><span class="status-arrow">←</span>` : ''}
                            <span class="status-new">${event.new_status || '-'}</span>
                        </div>
                        ${event.notes ? `<div class="timeline-notes"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>${event.notes}</div>` : ''}
                        <div class="timeline-footer">
                            <span class="timeline-employee">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                                ${event.employee_name || 'النظام'}
                            </span>
                            <span class="timeline-time">${formatEventDateTime(event.event_time)}</span>
                        </div>
                    </div>
                </div>`;
            });

            html += '</div>';
            container.innerHTML = html;
        } else {
            if (countEl) countEl.textContent = '0 حدث';
            container.innerHTML = '<div class="empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg><p>لا توجد أحداث مسجلة</p></div>';
        }
    } catch (err) {
        container.innerHTML = '<div class="error-state">خطأ في تحميل الأحداث</div>';
    }
}

function formatEventDateTime(datetime) {
    if (!datetime) return '-';
    var date = new Date(datetime);
    var now = new Date();
    var diff = now - date;

    // إذا كان اليوم
    if (diff < 86400000 && date.getDate() === now.getDate()) {
        return 'اليوم ' + date.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
    }
    // إذا كان أمس
    if (diff < 172800000) {
        return 'أمس ' + date.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
    }

    return date.toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' }) + ' ' +
        date.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
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
    data.forEach(function (item) {
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
    Object.keys(employeeStats).forEach(function (id) {
        var emp = employeeStats[id];
        emp.avgTime = emp.total > 0 ? Math.round(emp.totalDuration / emp.total) : 0;
    });

    var roleColors = {
        'admin': '#667eea',
        'receiver': '#69db7c',
        'budget': '#3bc9db',
        'payment': '#ffa94d',
        'invoice': '#b197fc'
    };

    var html = '';

    Object.keys(employeeStats).forEach(function (id) {
        var emp = employeeStats[id];
        var avgClass = emp.avgTime <= 10 ? 'excellent' : (emp.avgTime <= 30 ? 'good' : 'slow');
        var color = roleColors[emp.role] || '#667eea';

        html += `
        <div class="emp-card">
            <div class="emp-card-header">
                <div class="emp-avatar" style="background: ${color}20; color: ${color};">
                    ${emp.name ? emp.name.charAt(0) : '؟'}
                </div>
                <div class="emp-info">
                    <h4>${emp.name}</h4>
                    <span class="emp-role" style="background: ${color}20; color: ${color};">${getRoleName(emp.role)}</span>
                </div>
            </div>
            <div class="emp-stats">
                <div class="emp-stat">
                    <span class="emp-stat-value">${emp.total}</span>
                    <span class="emp-stat-label">معاملة</span>
                </div>
                <div class="emp-stat">
                    <span class="emp-stat-value ${avgClass}">${emp.avgTime > 0 ? emp.avgTime + ' د' : '-'}</span>
                    <span class="emp-stat-label">متوسط الوقت</span>
                </div>
            </div>
        </div>`;
    });

    if (Object.keys(employeeStats).length === 0) {
        html = `
        <div class="empty-state" style="grid-column: 1 / -1;">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            <p>لا توجد بيانات أداء متاحة</p>
        </div>`;
    }

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

    data.forEach(function (item) {
        var durationClass = item.duration_minutes <= 10 ? 'excellent' : (item.duration_minutes <= 30 ? 'good' : 'slow');

        html += '<tr>';
        html += '<td><span style="color: var(--accent-blue); font-family:var(--font-primary);">' + (item.transaction_number || '-') + '</span></td>';
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
        'creation': 'الإنشاء',
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

// ========== دوال سجل الأحداث ==========
function toggleEventsLog() {
    var container = document.getElementById('eventsLogContainer');
    var icon = document.getElementById('eventsToggleIcon');

    if (container.style.display === 'none') {
        container.style.display = 'block';
        icon.textContent = '▲';
        loadEventsLog();
    } else {
        container.style.display = 'none';
        icon.textContent = '▼';
    }
}

async function loadEventsLog() {
    var container = document.getElementById('eventsLogTable');
    if (!container) return;

    container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-muted);">جاري التحميل...</div>';

    try {
        var res = await fetch('api/?action=all_events');
        var result = await res.json();

        if (result.success && result.data && result.data.length > 0) {
            var html = '<table class="table" style="width: 100%;">';
            html += '<thead><tr>';
            html += '<th>المعاملة</th>';
            html += '<th>المرحلة</th>';
            html += '<th>من</th>';
            html += '<th>إلى</th>';
            html += '<th>السبب/الملاحظات</th>';
            html += '<th>المدة</th>';
            html += '<th>الموظف</th>';
            html += '<th>الوقت</th>';
            html += '</tr></thead><tbody>';

            var stageNames = {
                'creation': 'الإنشاء',
                'receiving': 'الاستلام',
                'budget': 'الموازنة',
                'payment': 'الدفع',
                'invoice': 'الفوترة'
            };

            var stageColors = {
                'creation': '#4dabf7',
                'receiving': '#69db7c',
                'budget': '#3bc9db',
                'payment': '#ffa94d',
                'invoice': '#b197fc'
            };

            result.data.forEach(function (event) {
                var stageName = stageNames[event.stage] || event.stage;
                var stageColor = stageColors[event.stage] || '#888';
                var duration = event.duration_from_previous;

                html += '<tr>';
                html += '<td><span style="color: var(--accent-blue); font-family:var(--font-primary);">' + (event.transaction_number || '-') + '</span></td>';
                html += '<td><span style="background: ' + stageColor + '; color: #000; padding: 2px 8px; border-radius: 10px; font-size: 0.8rem;">' + stageName + '</span></td>';
                html += '<td style="color: var(--text-muted); text-decoration: line-through;">' + (event.old_status || '-') + '</td>';
                html += '<td style="color: var(--accent-green); font-weight: 600;">' + (event.new_status || '-') + '</td>';
                html += '<td style="max-width: 200px; font-size: 0.85rem;">' + (event.notes || '-') + '</td>';
                html += '<td>';
                if (duration !== null && duration !== undefined) {
                    var durationColor = duration <= 5 ? '#69db7c' : (duration <= 30 ? '#ffa94d' : '#ff6b6b');
                    html += '<span style="background: ' + durationColor + '; color: #000; padding: 2px 8px; border-radius: 10px; font-size: 0.8rem;">' + duration + ' د</span>';
                } else {
                    html += '-';
                }
                html += '</td>';
                html += '<td>' + (event.employee_name || '-') + '</td>';
                html += '<td style="font-size: 0.8rem; direction: ltr;">' + formatDateTime(event.event_time) + '</td>';
                html += '</tr>';
            });

            html += '</tbody></table>';
            container.innerHTML = html;
        } else {
            container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-muted);">لا توجد أحداث مسجلة</div>';
        }
    } catch (err) {
        container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--accent-red);">خطأ في تحميل الأحداث</div>';
    }
}
