/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║       app-notifications.js — نظام التنبيهات                 ║
 * ║  يتطلب: app-common.js                                        ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * يحتوي هذا الملف على:
 *
 * — التنبيهات الفورية (Dropdown):
 *  • تحميل وعرض الإشعارات (loadNotifications, renderNotifications)
 *  • فتح/إغلاق القائمة المنسدلة (toggleNotificationsDropdown)
 *  • معالجة النقر والقراءة (handleNotificationClick, markAllAsRead)
 *  • شارة العدد (updateNotificationBadge)
 *  • تحديث دوري كل 30 ثانية
 *
 * — إعدادات التنبيهات:
 *  • إعدادات البريد الإلكتروني SMTP (openNotifSettingsModal)
 *  • إعدادات Exchange Server
 *  • إعدادات التنبيهات الداخلية
 *  • اختبار الاتصال (testSmtp, testExchange)
 *  • حفظ الإعدادات (saveNotifSettings, saveNotifSettingsSilent)
 *  • لوحة التنبيهات الداخلية (openInternalNotificationsPanel)
 */

// ═══════════════════════════════════════════════════════════
//  متغيرات النظام
// ═══════════════════════════════════════════════════════════

/** مخزن بيانات الإشعارات المحملة من الخادم */
let notificationsData = [];
/** عدد الإشعارات غير المقروءة — يُحدّث شارة الرأس */
let unreadNotificationsCount = 0;
/** مجموعة IDs الإشعارات المقروءة — تُخزن في localStorage */
let readNotifications = new Set();

// ═══════════════════════════════════════════════════════════
//  التنبيهات الفورية
// ═══════════════════════════════════════════════════════════

/**
 * تحميل حالة القراءة من localStorage عند بدء الصفحة
 */
function loadReadNotifications() {
    try {
        const saved = localStorage.getItem('readNotifications');
        if (saved) readNotifications = new Set(JSON.parse(saved));
    } catch (e) {
        console.error('Error loading read notifications:', e);
    }
}

/**
 * حفظ حالة القراءة في localStorage
 */
function saveReadNotifications() {
    try {
        localStorage.setItem('readNotifications', JSON.stringify([...readNotifications]));
    } catch (e) {
        console.error('Error saving read notifications:', e);
    }
}

// ========== نظام الإشعارات - إصلاح التكرار ==========

let isProcessingClick = false; // منع النقرات المتعددة



// تحميل عدد الإشعارات عند بداية التشغيل
async function loadInitialNotificationCount() {
    try {
        const res = await fetch('api/?action=notifications&limit=50');
        const result = await res.json();

        if (result.success && result.data) {
            notificationsData = result.data.map(n => ({
                ...n,
                is_read: readNotifications.has(n.id) || n.is_read
            }));

            unreadNotificationsCount = notificationsData.filter(n => !n.is_read).length;
            updateNotificationBadge();
        }
    } catch (error) {
        console.error('Error loading notification count:', error);
    }
}

// فتح/إغلاق قائمة التنبيهات
function toggleNotificationsDropdown(e) {
    e.stopPropagation();

    let dropdown = document.getElementById('notifications-dropdown');

    if (!dropdown) {
        dropdown = document.createElement('div');
        dropdown.id = 'notifications-dropdown';
        dropdown.className = 'notifications-dropdown';
        document.querySelector('.notification-btn').appendChild(dropdown);

        // إضافة event listener مرة واحدة فقط
        dropdown.addEventListener('click', handleDropdownClick);
    }

    if (dropdown.classList.contains('show')) {
        dropdown.classList.remove('show');
        return;
    }

    dropdown.innerHTML = '<div class="notif-loading"><div class="spinner-small"></div><span>جاري التحميل...</span></div>';
    dropdown.classList.add('show');

    loadNotifications(dropdown);
}

// معالجة النقر داخل القائمة (Event Delegation)
function handleDropdownClick(e) {
    e.stopPropagation();

    // البحث عن الإشعار المنقور
    const notifItem = e.target.closest('.notif-item');
    if (notifItem && !isProcessingClick) {
        const notifId = parseInt(notifItem.dataset.notifId);
        if (notifId) {
            handleNotificationClick(notifId);
        }
    }

    // التحقق من زر "تعيين الكل كمقروء"
    if (e.target.classList.contains('mark-all-read') || e.target.closest('.mark-all-read')) {
        markAllAsRead();
    }
}

// تحميل التنبيهات
async function loadNotifications(dropdown) {
    try {
        const res = await fetch('api/?action=notifications&limit=50');
        const result = await res.json();

        if (result.success && result.data) {
            notificationsData = result.data.map(n => ({
                ...n,
                is_read: readNotifications.has(n.id) || n.is_read
            }));

            unreadNotificationsCount = notificationsData.filter(n => !n.is_read).length;
            updateNotificationBadge();
            renderNotifications(dropdown);
        } else {
            dropdown.innerHTML = '<div class="notif-error">خطأ في تحميل الإشعارات</div>';
        }
    } catch (error) {
        console.error('Error loading notifications:', error);
        dropdown.innerHTML = '<div class="notif-error">خطأ في تحميل الإشعارات</div>';
    }
}

// عرض الإشعارات — SLA/OLA مخصصة لكل موظف
function renderNotifications(dropdown) {
    const unread = notificationsData.filter(n => !n.is_read);

    // أيقونات حسب نوع الإشعار
    const catIcon = {
        'ola_warning': '⚠️', 'ola_breach': '🔴',
        'sla_warning': '⚠️', 'sla_breach': '🚨',
        'manual_escalation': '🔔',
    };
    const catColor = {
        'ola_warning': 'var(--accent-orange)', 'ola_breach': 'var(--accent-red)',
        'sla_warning': 'var(--accent-orange)', 'sla_breach': 'var(--accent-red)',
        'manual_escalation': 'var(--accent-blue)',
    };
    const stageNames = { receiving: 'الاستلام', budget: 'الموازنة', payment: 'الدفع', invoice: 'الفوترة', sla_total: 'SLA الكلي' };

    let html = `<div class="notif-header">
        <h4>الإشعارات <span style="font-size:.8rem;color:var(--text-muted);font-weight:400">(${unread.length} غير مقروء)</span></h4>
        <button class="mark-all-read">تعيين الكل كمقروء</button>
    </div><div class="notif-list">`;

    if (unread.length > 0) {
        unread.forEach(n => {
            const isSla = n.category && catIcon[n.category];
            const icon = isSla ? catIcon[n.category] : '📋';
            const color = isSla ? (catColor[n.category] || 'var(--text-muted)') : 'var(--text-muted)';
            const time = formatTimeAgo(n.update_time || n.created_at);
            const txNum = n.transaction_number || n.ref_number || '—';
            const stage = n.stage || '';
            const stageLbl = n.stage_label || stageNames[stage] || stage;
            const catLbl = n.category_label || n.title || 'إشعار';
            const desc = n.message || (n.transaction_type ? `${n.transaction_type} — ${n.status || ''}` : '');
            const empName = n.employee_name ? `👤 ${n.employee_name}` : '';
            const isEscalation = ['ola_breach', 'sla_breach', 'manual_escalation'].includes(n.category);

            html += `
            <div class="notif-item unread" data-notif-id="${n.id}"
                 style="border-right:3px solid ${color}">
                <div class="notif-card-content">
                    <div class="notif-icon" style="background:${color}18;color:${color};font-size:1.1rem;
                         width:36px;height:36px;display:flex;align-items:center;justify-content:center;
                         border-radius:8px;flex-shrink:0">${icon}</div>
                    <div class="notif-content">
                        <div class="notif-title" style="color:${color};font-weight:700;font-size:.85rem">${catLbl}</div>
                        <div style="font-weight:600;font-size:.88rem;color:var(--text-primary);margin:.2rem 0">
                            معاملة: ${txNum}${stageLbl ? ' — ' + stageLbl : ''}
                        </div>
                        ${desc ? `<div class="notif-desc" style="font-size:.78rem">${desc}</div>` : ''}
                        ${empName ? `<div style="font-size:.75rem;color:var(--text-muted);margin-top:.2rem">${empName}</div>` : ''}
                        ${isEscalation && n.transaction_id ? `
                        <button onclick="event.stopPropagation();openSlaDetailModal(${n.transaction_id})"
                            style="margin-top:.4rem;background:${color};color:#fff;border:none;
                                   border-radius:5px;padding:.25rem .6rem;font-size:.75rem;
                                   cursor:pointer;font-family:inherit">
                            📊 عرض تفاصيل SLA
                        </button>` : ''}
                        <div class="notif-meta" style="margin-top:.35rem">
                            <div class="notif-time">${time}</div>
                        </div>
                    </div>
                </div>
            </div>`;
        });
    } else {
        html += `<div class="notif-empty">
            <div class="empty-icon">✓</div>
            <p>لا توجد إشعارات جديدة</p>
            <small>جميع الإشعارات قد تم قراءتها</small>
        </div>`;
    }

    html += `</div><div class="notif-footer">
        <a href="#" class="view-all-link">عرض كل الإشعارات <span class="arrow">‹</span></a>
    </div>`;

    dropdown.innerHTML = html;

    dropdown.querySelector('.view-all-link')?.addEventListener('click', (e) => {
        e.preventDefault();
        viewAllNotifications();
    });
}

// الحصول على أيقونة SVG حسب المرحلة
function getStageIconSVG(stage) {
    const icons = {
        'receiving': '<path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>',
        'budget': '<path stroke-linecap="round" stroke-linejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>',
        'payment': '<path stroke-linecap="round" stroke-linejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/>',
        'invoice': '<path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>'
    };
    return icons[stage] || icons['receiving'];
}

// معالجة الضغط على الإشعار
function handleNotificationClick(notifId) {
    // منع النقرات المتعددة
    if (isProcessingClick) {
        console.log('Already processing, ignoring click');
        return;
    }

    isProcessingClick = true;
    console.log('Processing notification:', notifId);

    // التحقق إذا كان مقروء مسبقاً
    if (readNotifications.has(notifId)) {
        console.log('Already read, ignoring');
        isProcessingClick = false;
        return;
    }

    // إضافة للمقروءة محلياً
    readNotifications.add(notifId);
    saveReadNotifications();

    // تحديث البيانات المحلية
    const notif = notificationsData.find(n => n.id === notifId);
    if (notif) {
        notif.is_read = true;
    }

    // تقليل العدد فوراً
    if (unreadNotificationsCount > 0) {
        unreadNotificationsCount--;
        updateNotificationBadge();
        console.log('Updated count to:', unreadNotificationsCount);
    }

    // إزالة الإشعار من القائمة بـ animation
    const clickedItem = document.querySelector(`[data-notif-id="${notifId}"]`);
    if (clickedItem) {
        clickedItem.style.transition = 'all 0.3s ease';
        clickedItem.style.opacity = '0';
        clickedItem.style.transform = 'translateX(-20px)';

        setTimeout(() => {
            clickedItem.remove();

            // تحديث العرض إذا لم يتبق إشعارات
            const remainingItems = document.querySelectorAll('.notif-item');
            if (remainingItems.length === 0) {
                const dropdown = document.getElementById('notifications-dropdown');
                if (dropdown) {
                    renderNotifications(dropdown);
                }
            }

            isProcessingClick = false;
        }, 300);
    } else {
        isProcessingClick = false;
    }

    // إرسال للخادم في الخلفية (اختياري)
    fetch('api/?action=mark_notification_read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notification_id: notifId })
    }).catch(err => console.error('Error syncing:', err));

    // إغلاق القائمة
    setTimeout(() => {
        document.getElementById('notifications-dropdown')?.classList.remove('show');
    }, 400);

    // فتح المعاملة
    const transactionId = notif ? (notif.transaction_id || notif.id) : notifId;
    setTimeout(() => {
        goToTransaction(transactionId);
    }, 100);
}

// الانتقال للمعاملة
function goToTransaction(id) {
    viewTransaction(id);
}

// عرض كل الإشعارات — ينتقل لصفحة التنبيهات
function viewAllNotifications() {
    document.getElementById('notifications-dropdown')?.classList.remove('show');
    switchTab('notifications');
    document.querySelectorAll('.nav-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === 'notifications');
    });
}

// تعيين الكل كمقروء
function markAllAsRead() {
    if (isProcessingClick) return;
    isProcessingClick = true;

    // إضافة كل الإشعارات للمقروءة
    notificationsData.forEach(n => {
        if (!n.is_read) {
            readNotifications.add(n.id);
            n.is_read = true;
        }
    });

    saveReadNotifications();

    // تصفير العدد فوراً
    unreadNotificationsCount = 0;
    updateNotificationBadge();

    // تحديث العرض
    const dropdown = document.getElementById('notifications-dropdown');
    if (dropdown && dropdown.classList.contains('show')) {
        renderNotifications(dropdown);
    }

    showToast('تم تعيين جميع الإشعارات كمقروءة ✓', 'success');

    // إرسال للخادم في الخلفية
    fetch('api/?action=mark_all_notifications_read', {
        method: 'POST'
    }).catch(err => console.error('Error:', err));

    setTimeout(() => {
        isProcessingClick = false;
    }, 500);
}

// تحديث شارة العدد على زر التنبيهات في السايدبار
function updateNotificationBadge() {
    const badge = document.getElementById('notification-badge');
    if (!badge) return;

    if (unreadNotificationsCount > 0) {
        badge.textContent = unreadNotificationsCount > 99 ? '99+' : unreadNotificationsCount;
        badge.style.display = 'inline-block';
    } else {
        badge.style.display = 'none';
    }
}

// تنسيق الوقت
function formatTimeAgo(dateString) {
    if (!dateString) return 'الآن';

    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'الآن';
    if (seconds < 3600) return `منذ ${Math.floor(seconds / 60)} دقيقة`;
    if (seconds < 86400) return `منذ ${Math.floor(seconds / 3600)} ساعة`;
    if (seconds < 2592000) return `منذ ${Math.floor(seconds / 86400)} يوم`;

    return date.toLocaleDateString('ar-SA', {
        month: 'short',
        day: 'numeric'
    });
}

// تحديث دوري كل 30 ثانية
setInterval(() => {
    const dropdown = document.getElementById('notifications-dropdown');

    if (!dropdown || !dropdown.classList.contains('show')) {
        loadInitialNotificationCount();
    }
}, 30000);

// إغلاق القائمة عند النقر خارجها
document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('notifications-dropdown');
    const btn = document.querySelector('.notification-btn');
    if (dropdown && !dropdown.contains(e.target) && !btn.contains(e.target)) {
        dropdown.classList.remove('show');
    }
});


// ═══════════════════════════════════════════════════════════
//  صفحة التنبيهات المستقلة
// ═══════════════════════════════════════════════════════════

/** فلتر عرض الصفحة: 'all' | 'unread' | 'read' */
let notifPageFilter = 'unread';

/**
 * تحميل صفحة التنبيهات كاملة في main-content
 */
async function loadNotificationsPage() {
    showLoading();

    try {
        const res = await fetch('api/?action=notifications&limit=100');
        const result = await res.json();

        if (result.success && result.data) {
            notificationsData = result.data.map(n => ({
                ...n,
                is_read: readNotifications.has(n.id) || n.is_read
            }));
            unreadNotificationsCount = notificationsData.filter(n => !n.is_read).length;
            updateNotificationBadge();
        }
    } catch (e) {
        console.error(e);
    }

    renderNotificationsPage();
}

/**
 * رسم صفحة التنبيهات الكاملة
 */
function renderNotificationsPage() {
    const total = notificationsData.length;
    const unread = notificationsData.filter(n => !n.is_read).length;
    const read = total - unread;

    const stageNames = { receiving: 'الاستلام', budget: 'الموازنة', payment: 'الدفع', invoice: 'الفوترة' };
    const stageBorderColor = {
        receiving: 'var(--accent-green)',
        budget: 'var(--accent-cyan)',
        payment: 'var(--accent-orange)',
        invoice: 'var(--accent-purple)'
    };

    const filtered = notificationsData.filter(n => {
        if (notifPageFilter === 'unread') return !n.is_read;
        if (notifPageFilter === 'read') return n.is_read;
        return true;
    });

    // بناء صفوف التنبيهات
    let rowsHtml = '';
    if (filtered.length === 0) {
        rowsHtml = `
        <div style="text-align:center;padding:4rem 2rem;color:var(--text-muted)">
            <div style="font-size:3rem;margin-bottom:1rem">
                ${notifPageFilter === 'unread' ? '✅' : '🔔'}
            </div>
            <div style="font-size:1rem;font-weight:600;margin-bottom:.5rem;color:var(--text-primary)">
                ${notifPageFilter === 'unread' ? 'لا توجد إشعارات غير مقروءة' : 'لا توجد إشعارات'}
            </div>
            <div style="font-size:.85rem">جميع الإشعارات تمت قراءتها</div>
        </div>`;
    } else {
        filtered.forEach(n => {
            const stage = n.stage || 'receiving';
            const stageName = stageNames[stage] || stage;
            const border = stageBorderColor[stage] || 'var(--border-color)';
            const timeAgo = formatTimeAgo(n.update_time);
            const isUnread = !n.is_read;

            rowsHtml += `
            <div class="notif-page-row ${isUnread ? 'unread' : 'read'}"
                 data-notif-id="${n.id}"
                 style="border-right-color:${border}"
                 onclick="handleNotifPageClick(${n.id})">

                <div class="notif-page-icon ${stage}">
                    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                        ${getStageIconSVG(stage)}
                    </svg>
                </div>

                <div class="notif-page-body">
                    <div class="notif-page-top">
                        <span class="notif-page-txnum">${n.transaction_number || 'TX-0000'}</span>
                        <span class="notif-page-type">${n.transaction_type || 'معاملة'}</span>
                        ${isUnread ? '<span class="notif-page-dot"></span>' : ''}
                    </div>
                    <div class="notif-page-desc">
                        ${n.status || 'تحديث حالة'}
                        ${n.employee_name ? ` — <span style="color:var(--text-muted)">👤 ${n.employee_name}</span>` : ''}
                    </div>
                    <div class="notif-page-meta">
                        <span class="stage-badge ${stage}">${stageName}</span>
                        <span class="notif-page-time">${timeAgo}</span>
                    </div>
                </div>

                <div class="notif-page-actions">
                    ${isUnread ? `<button class="notif-action-btn" onclick="event.stopPropagation();markNotifRead(${n.id})" title="تعيين كمقروء">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                    </button>` : ''}
                    <button class="notif-action-btn goto-btn" onclick="event.stopPropagation();goToTransaction(${n.transaction_id || n.id})" title="فتح المعاملة">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <polyline points="9 18 15 12 9 6"></polyline>
                        </svg>
                    </button>
                </div>
            </div>`;
        });
    }

    DOM.mainContent.innerHTML = `
    <div class="notif-page-wrap">

        <!-- هيدر الصفحة -->
        <div class="notif-page-header">
            <div>
                <h2 style="font-size:1.3rem;font-weight:700;color:var(--text-primary);margin:0">🔔 التنبيهات</h2>
                <p style="font-size:.85rem;color:var(--text-muted);margin:.25rem 0 0">
                    إشعارات المعاملات والتحديثات
                </p>
            </div>
            <button class="btn btn-secondary" onclick="markAllAsRead()" style="font-size:.82rem">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                تعيين الكل كمقروء
            </button>
        </div>

        <!-- بطاقات الإحصاء -->
        <div class="notif-stats-row">
            <div class="notif-stat-card">
                <div class="notif-stat-num">${total}</div>
                <div class="notif-stat-label">إجمالي التنبيهات</div>
            </div>
            <div class="notif-stat-card unread">
                <div class="notif-stat-num" style="color:var(--accent-orange)">${unread}</div>
                <div class="notif-stat-label">غير مقروء</div>
            </div>
            <div class="notif-stat-card read">
                <div class="notif-stat-num" style="color:var(--accent-green)">${read}</div>
                <div class="notif-stat-label">مقروء</div>
            </div>
        </div>

        <!-- فلاتر التبويبات -->
        <div class="notif-filter-bar">
            <button class="notif-filter-btn ${notifPageFilter === 'unread' ? 'active' : ''}"
                    onclick="setNotifFilter('unread')">
                غير مقروء
                ${unread > 0 ? `<span class="notif-filter-count">${unread}</span>` : ''}
            </button>
            <button class="notif-filter-btn ${notifPageFilter === 'all' ? 'active' : ''}"
                    onclick="setNotifFilter('all')">
                الكل
                <span class="notif-filter-count">${total}</span>
            </button>
            <button class="notif-filter-btn ${notifPageFilter === 'read' ? 'active' : ''}"
                    onclick="setNotifFilter('read')">
                مقروء
                ${read > 0 ? `<span class="notif-filter-count">${read}</span>` : ''}
            </button>
        </div>

        <!-- قائمة التنبيهات -->
        <div class="notif-page-list card" id="notifPageList">
            ${rowsHtml}
        </div>

    </div>`;

    injectNotifPageStyles();
}

/** تغيير الفلتر وإعادة الرسم */
function setNotifFilter(filter) {
    notifPageFilter = filter;
    renderNotificationsPage();
}

/** معالجة النقر على سطر تنبيه */
function handleNotifPageClick(notifId) {
    markNotifRead(notifId);
    const n = notificationsData.find(x => x.id === notifId);
    if (n) goToTransaction(n.transaction_id || n.id);
}

/** تعيين تنبيه كمقروء مع تحديث الصفحة */
function markNotifRead(notifId) {
    if (readNotifications.has(notifId)) return;
    readNotifications.add(notifId);
    saveReadNotifications();

    const n = notificationsData.find(x => x.id === notifId);
    if (n) n.is_read = true;

    unreadNotificationsCount = notificationsData.filter(x => !x.is_read).length;
    updateNotificationBadge();

    fetch('api/?action=mark_notification_read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notification_id: notifId })
    }).catch(() => { });

    // تحديث السطر بدون إعادة رسم كاملة
    const row = document.querySelector(`[data-notif-id="${notifId}"]`);
    if (row) {
        row.classList.remove('unread');
        row.classList.add('read');
        row.querySelector('.notif-page-dot')?.remove();
        row.querySelector('.notif-action-btn:not(.goto-btn)')?.remove();
    }
}

/** حقن CSS صفحة التنبيهات */
function injectNotifPageStyles() {
    if (document.getElementById('notif-page-styles')) return;
    const s = document.createElement('style');
    s.id = 'notif-page-styles';
    s.textContent = `
        /* ── Wrapper ── */
        .notif-page-wrap {
            display: flex;
            flex-direction: column;
            gap: 1.25rem;
        }

        /* ── Header ── */
        .notif-page-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 1rem;
            flex-wrap: wrap;
        }

        /* ── Stats row ── */
        .notif-stats-row {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 1rem;
        }
        .notif-stat-card {
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 1.1rem 1.25rem;
            text-align: center;
        }
        .notif-stat-num {
            font-size: 1.8rem;
            font-weight: 800;
            color: var(--text-primary);
            line-height: 1;
        }
        .notif-stat-label {
            font-size: .78rem;
            color: var(--text-muted);
            margin-top: .35rem;
        }

        /* ── Filter bar ── */
        .notif-filter-bar {
            display: flex;
            gap: 4px;
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 10px;
            padding: 4px;
        }
        .notif-filter-btn {
            flex: 1;
            padding: .45rem 1rem;
            border: none;
            border-radius: 7px;
            background: transparent;
            color: var(--text-muted);
            font-family: inherit;
            font-size: .82rem;
            font-weight: 500;
            cursor: pointer;
            transition: all .2s;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: .4rem;
        }
        .notif-filter-btn:hover { color: var(--text-primary); background: var(--bg-surface); }
        .notif-filter-btn.active {
            background: var(--btn-primary-bg);
            color: var(--btn-primary-text);
            font-weight: 600;
            box-shadow: 0 1px 6px rgba(0,0,0,.12);
        }
        .notif-filter-count {
            background: rgba(255,255,255,.15);
            border-radius: 10px;
            padding: 1px 7px;
            font-size: .72rem;
            font-weight: 700;
        }
        .notif-filter-btn:not(.active) .notif-filter-count {
            background: var(--bg-surface);
            color: var(--text-muted);
        }

        /* ── List ── */
        .notif-page-list {
            display: flex;
            flex-direction: column;
            gap: 0;
            overflow: hidden;
            padding: 0 !important;
        }

        /* ── Row ── */
        .notif-page-row {
            display: flex;
            align-items: center;
            gap: 1rem;
            padding: 1rem 1.25rem;
            border-right: 3px solid transparent;
            border-bottom: 1px solid var(--border-color);
            cursor: pointer;
            transition: background .15s;
            position: relative;
        }
        .notif-page-row:last-child { border-bottom: none; }
        .notif-page-row:hover { background: var(--bg-surface); }
        .notif-page-row.unread { background: var(--bg-card); }
        .notif-page-row.read   { opacity: .72; }

        /* ── Icon ── */
        .notif-page-icon {
            width: 42px;
            height: 42px;
            min-width: 42px;
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }
        .notif-page-icon.receiving { background: rgba(105,219,124,.12); color: var(--accent-green); }
        .notif-page-icon.budget    { background: rgba(59,201,219,.12);  color: var(--accent-cyan);  }
        .notif-page-icon.payment   { background: rgba(255,169,77,.12);  color: var(--accent-orange);}
        .notif-page-icon.invoice   { background: rgba(177,151,252,.12); color: var(--accent-purple);}

        /* ── Body ── */
        .notif-page-body { flex: 1; min-width: 0; }
        .notif-page-top {
            display: flex;
            align-items: center;
            gap: .5rem;
            margin-bottom: .2rem;
        }
        .notif-page-txnum {
            font-size: .88rem;
            font-weight: 700;
            color: var(--text-primary);
        }
        .notif-page-type {
            font-size: .78rem;
            color: var(--text-muted);
        }
        .notif-page-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: var(--accent-orange);
            flex-shrink: 0;
            margin-right: auto;
        }
        .notif-page-desc {
            font-size: .82rem;
            color: var(--text-secondary);
            margin-bottom: .35rem;
        }
        .notif-page-meta {
            display: flex;
            align-items: center;
            gap: .6rem;
        }
        .notif-page-time {
            font-size: .75rem;
            color: var(--text-muted);
        }

        /* ── Actions ── */
        .notif-page-actions {
            display: flex;
            gap: .375rem;
            flex-shrink: 0;
            opacity: 0;
            pointer-events: none;
            transition: opacity .15s;
        }
        .notif-page-row:hover .notif-page-actions,
        .notif-page-row:focus-within .notif-page-actions {
            opacity: 1;
            pointer-events: auto;
        }
        /* موبايل: الأزرار دائماً ظاهرة */
        @media (max-width: 768px) {
            .notif-page-actions {
                opacity: 1;
                pointer-events: auto;
            }
        }
        .notif-action-btn {
            width: 30px;
            height: 30px;
            border-radius: 7px;
            border: 1px solid var(--border-color);
            background: var(--bg-surface);
            color: var(--text-muted);
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all .2s;
        }
        .notif-action-btn:hover {
            background: var(--btn-primary-bg);
            color: var(--btn-primary-text);
            border-color: var(--btn-primary-bg);
        }

        @media (max-width: 600px) {
            .notif-stats-row { grid-template-columns: repeat(3, 1fr); gap: .5rem; }
            .notif-stat-num  { font-size: 1.4rem; }
            .notif-page-row  { padding: .75rem 1rem; gap: .75rem; }
        }
    `;
    document.head.appendChild(s);
}

// تهيئة عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
    loadReadNotifications();
    loadInitialNotificationCount();
    document.querySelector('.notification-btn')?.addEventListener('click', toggleNotificationsDropdown);
});

// ═══════════════════════════════════════════════════════════
//  إعدادات التنبيهات (SMTP / Exchange / داخلي)
// ═══════════════════════════════════════════════════════════

/**
 * فتح نافذة إعدادات التنبيهات
 * يجلب الإعدادات الحالية من الخادم ثم يعرض النموذج
 */
async function openNotifSettingsModal() {
    DOM.modalTitle.textContent = '📧 إعدادات الإشعارات';
    DOM.modalBody.innerHTML = '<div class="loading-placeholder" style="padding:2rem;text-align:center">جارٍ التحميل...</div>';
    openModal();

    try {
        const res = await fetch('api/?action=notification_settings');
        const data = await res.json();
        const cfg = data.success ? data.data : {};
        DOM.modalBody.innerHTML = renderNotifSettingsForm(cfg);
    } catch (e) {
        DOM.modalBody.innerHTML = '<div style="color:var(--accent-red);padding:1rem">خطأ في التحميل</div>';
    }
}

function renderNotifSettingsForm(cfg) {
    const val = (k, def = '') => cfg[k] || def;
    const chk = (k) => val(k, '0') === '1' ? 'checked' : '';

    return `
    <!-- تبويبات الإعدادات -->
    <div style="display:flex;gap:.5rem;border-bottom:2px solid var(--border-color);margin-bottom:1.25rem;flex-wrap:wrap">
        <button class="notif-tab active" onclick="switchNotifTab('triggers',this)">🔔 متى تُرسَل؟</button>
        <button class="notif-tab" onclick="switchNotifTab('smtp',this)">📬 SMTP</button>
        <button class="notif-tab" onclick="switchNotifTab('exchange',this)">🏢 Exchange</button>
    </div>

    <!-- تبويب: متى تُرسَل ────────────────────── -->
    <div id="notifTab-triggers" class="notif-tab-panel" style="display:block">
        <p style="font-size:.87rem;color:var(--text-muted);margin-bottom:1rem">
            اختر متى يُرسَل الإشعار — سيصل للموظف المسؤول وللمشرف عند التجاوز.
        </p>
        <div style="display:flex;flex-direction:column;gap:.85rem">
            ${[
            ['notify_on_ola_warning', '⚠️ تحذير OLA', 'عند اقتراب الموظف من نهاية وقته'],
            ['notify_on_ola_breach', '🔴 تجاوزOLA', 'عند تجاوز الموظف وقته — يُصعَّد للمشرف'],
            ['notify_on_sla_warning', '⚠️ تحذير SLA', 'عند اقتراب المعاملة من نهاية وقتها الكلي'],
            ['notify_on_sla_breach', '🚨 تجاوزSLA', 'عند تجاوز المعاملة وقتها الكلي'],
        ].map(([k, label, desc]) => `
            <label style="display:flex;align-items:center;gap:.85rem;cursor:pointer;
                          background:var(--bg-surface);border-radius:8px;padding:.75rem 1rem">
                <input type="checkbox" id="${k}" ${chk(k)} style="width:18px;height:18px;cursor:pointer">
                <div>
                    <div style="font-weight:600;font-size:.9rem">${label}</div>
                    <div style="font-size:.8rem;color:var(--text-muted)">${desc}</div>
                </div>
            </label>`).join('')}
        </div>
    </div>

    <!-- تبويب: SMTP ─────────────────────────── -->
    <div id="notifTab-smtp" class="notif-tab-panel" style="display:none">
        <div style="background:rgba(59,130,246,.08);border-radius:8px;padding:.75rem 1rem;
                    font-size:.83rem;color:var(--text-muted);margin-bottom:1rem">
            <strong>ملاحظة:</strong> يمكن استخدام Gmail (smtp.gmail.com:587) أو Outlook (smtp.office365.com:587) أو أي SMTP آخر.
            إذا كنت تستخدم Exchange يمكنك التخطي لتبويب Exchange.
        </div>
        <div class="modal-form-grid">
            <div class="form-group">
                <label class="form-label">خادم SMTP</label>
                <input type="text" id="smtp_host" class="form-input" value="${val('smtp_host')}"
                    placeholder="smtp.office365.com">
            </div>
            <div class="form-group">
                <label class="form-label">المنفذ</label>
                <input type="number" id="smtp_port" class="form-input" value="${val('smtp_port', '587')}"
                    placeholder="587">
            </div>
            <div class="form-group">
                <label class="form-label">البريد المُرسِل</label>
                <input type="email" id="smtp_user" class="form-input" value="${val('smtp_user')}"
                    placeholder="notifications@company.com">
            </div>
            <div class="form-group">
                <label class="form-label">كلمة المرور</label>
                <input type="password" id="smtp_pass" class="form-input" value="${val('smtp_pass')}"
                    placeholder="••••••••">
            </div>
            <div class="form-group">
                <label class="form-label">التشفير</label>
                <select id="smtp_encryption" class="form-input">
                    ${['tls', 'ssl', 'none'].map(t =>
            `<option value="${t}" ${val('smtp_encryption', 'tls') === t ? 'selected' : ''}>${t.toUpperCase()}</option>`
        ).join('')}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">اسم المُرسِل</label>
                <input type="text" id="smtp_from_name" class="form-input" value="${val('smtp_from_name', 'نظام الإدارة')}"
                    placeholder="نظام متابعة المعاملات">
            </div>
        </div>
        <!-- اختبار SMTP -->
        <div style="display:flex;align-items:center;gap:.75rem;margin-top:1rem;flex-wrap:wrap">
            <input type="email" id="smtpTestEmail" class="form-input" style="flex:1;min-width:200px"
                placeholder="أدخل بريد للاختبار">
            <button class="btn btn-secondary" onclick="testSmtp()">📤 إرسال رسالة اختبار</button>
        </div>
        <div id="smtpTestResult" style="margin-top:.5rem;font-size:.85rem"></div>
    </div>

    <!-- تبويب: Exchange ─────────────────────── -->
    <div id="notifTab-exchange" class="notif-tab-panel" style="display:none">
        <div style="background:rgba(59,130,246,.08);border-radius:8px;padding:.85rem 1rem;
                    font-size:.83rem;color:var(--text-muted);margin-bottom:1rem">
            <strong>Microsoft Exchange عبر Graph API</strong><br>
            يتطلب تسجيل تطبيق في Azure AD بصلاحية <code>Mail.Send</code> (Application permission).<br>
            <a href="https://portal.azure.com" target="_blank" style="color:var(--accent-blue)">→ Azure Portal</a>
        </div>

        <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1rem">
            <label style="display:flex;align-items:center;gap:.5rem;cursor:pointer">
                <input type="checkbox" id="ms_enabled" ${chk('ms_enabled')} style="width:18px;height:18px">
                <span style="font-weight:600">تفعيل Exchange</span>
            </label>
            <span style="font-size:.8rem;color:var(--text-muted)">(إذا كان مفعلاً سيُستخدم بدلاً من SMTP)</span>
        </div>

        <div class="modal-form-grid">
            <div class="form-group" style="grid-column:1/-1">
                <label class="form-label">Tenant ID (Directory ID)</label>
                <input type="text" id="ms_tenant_id" class="form-input" value="${val('ms_tenant_id')}"
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    style="font-family:monospace;font-size:.85rem">
            </div>
            <div class="form-group">
                <label class="form-label">Client ID (Application ID)</label>
                <input type="text" id="ms_client_id" class="form-input" value="${val('ms_client_id')}"
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    style="font-family:monospace;font-size:.85rem">
            </div>
            <div class="form-group">
                <label class="form-label">Client Secret</label>
                <input type="password" id="ms_client_secret" class="form-input"
                    value="${val('ms_client_secret')}" placeholder="••••••••">
            </div>
            <div class="form-group" style="grid-column:1/-1">
                <label class="form-label">البريد المُرسِل (Exchange mailbox)</label>
                <input type="email" id="ms_sender_email" class="form-input"
                    value="${val('ms_sender_email')}"
                    placeholder="notifications@company.onmicrosoft.com">
            </div>
        </div>

        <!-- خطوات الإعداد -->
        <details style="margin-top:1rem;background:var(--bg-surface);border-radius:8px;padding:.75rem 1rem">
            <summary style="cursor:pointer;font-weight:600;font-size:.88rem">
                🔧 خطوات إعداد Azure AD
            </summary>
            <ol style="margin:.75rem 0 0;padding-right:1.25rem;font-size:.83rem;
                       color:var(--text-muted);line-height:1.9">
                <li>اذهب إلى <strong>Azure Portal → App registrations → New registration</strong></li>
                <li>سمِّ التطبيق (مثلاً: SLA-Notifier) واختر <em>Accounts in this organizational directory only</em></li>
                <li>بعد الإنشاء انسخ <strong>Application (client) ID</strong> و <strong>Directory (tenant) ID</strong></li>
                <li>اذهب إلى <strong>Certificates & secrets → New client secret</strong> وانسخ القيمة فوراً</li>
                <li>اذهب إلى <strong>API permissions → Add → Microsoft Graph → Application permissions</strong></li>
                <li>أضف <strong>Mail.Send</strong> ثم انقر <strong>Grant admin consent</strong></li>
                <li>أدخل البيانات أعلاه وانقر اختبار الاتصال</li>
            </ol>
        </details>

        <!-- اختبار Exchange -->
        <div style="display:flex;align-items:center;gap:.75rem;margin-top:1rem;flex-wrap:wrap">
            <input type="email" id="exchangeTestEmail" class="form-input" style="flex:1;min-width:200px"
                placeholder="أدخل بريد للاختبار">
            <button class="btn btn-secondary" onclick="testExchange()">📤 اختبار Exchange</button>
        </div>
        <div id="exchangeTestResult" style="margin-top:.5rem;font-size:.85rem"></div>
    </div>

    <!-- أزرار الحفظ -->
    <div style="display:flex;gap:.75rem;justify-content:flex-end;margin-top:1.5rem;
                padding-top:1rem;border-top:1px solid var(--border-color)">
        <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
        <button class="btn btn-primary" onclick="saveNotifSettings()">
            💾 حفظ الإعدادات
        </button>
    </div>`;
}

// ─── تبديل تبويبات الإشعارات ─────────────────────────────────
function switchNotifTab(tab, btn) {
    document.querySelectorAll('.notif-tab-panel').forEach(p => p.style.display = 'none');
    document.querySelectorAll('.notif-tab').forEach(b => b.classList.remove('active'));
    const panel = document.getElementById(`notifTab-${tab}`);
    if (panel) panel.style.display = 'block';
    if (btn) btn.classList.add('active');
}

// ─── حفظ إعدادات الإشعارات ───────────────────────────────────
async function saveNotifSettings() {
    const get = id => document.getElementById(id)?.value || '';
    const chk = id => document.getElementById(id)?.checked ? '1' : '0';

    const payload = {
        // Triggers
        notify_on_ola_warning: chk('notify_on_ola_warning'),
        notify_on_ola_breach: chk('notify_on_ola_breach'),
        notify_on_sla_warning: chk('notify_on_sla_warning'),
        notify_on_sla_breach: chk('notify_on_sla_breach'),
        // SMTP
        smtp_host: get('smtp_host'),
        smtp_port: get('smtp_port'),
        smtp_user: get('smtp_user'),
        smtp_pass: get('smtp_pass'),
        smtp_encryption: get('smtp_encryption'),
        smtp_from_name: get('smtp_from_name'),
        // Exchange
        ms_tenant_id: get('ms_tenant_id'),
        ms_client_id: get('ms_client_id'),
        ms_client_secret: get('ms_client_secret'),
        ms_sender_email: get('ms_sender_email'),
        ms_enabled: chk('ms_enabled'),
    };

    try {
        const res = await fetch('api/?action=save_notification_settings', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            showToast('تم حفظ إعدادات الإشعارات ✓', 'success');
            closeModal();
        } else {
            showToast('خطأ في الحفظ', 'error');
        }
    } catch (e) { showToast('خطأ في الاتصال', 'error'); }
}

// ─── اختبار SMTP ─────────────────────────────────────────────
async function testSmtp() {
    const email = document.getElementById('smtpTestEmail')?.value?.trim();
    if (!email) { showToast('أدخل بريداً للاختبار', 'warning'); return; }

    const resultEl = document.getElementById('smtpTestResult');
    if (resultEl) resultEl.innerHTML = '<span style="color:var(--text-muted)">جارٍ الإرسال...</span>';

    // حفظ الإعدادات أولاً ثم الاختبار
    await saveNotifSettingsSilent();

    try {
        const res = await fetch('api/?action=test_smtp', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ test_email: email })
        });
        const data = await res.json();
        if (resultEl) {
            resultEl.innerHTML = data.success
                ? `<span style="color:var(--accent-green)">✅ تم الإرسال بنجاح عبر ${data.method || 'SMTP'}</span>`
                : `<span style="color:var(--accent-red)">❌ ${data.error || 'فشل الإرسال'}</span>`;
        }
    } catch (e) {
        if (resultEl) resultEl.innerHTML = `<span style="color:var(--accent-red)">❌ خطأ: ${e.message}</span>`;
    }
}

// ─── اختبار Exchange ─────────────────────────────────────────
async function testExchange() {
    const email = document.getElementById('exchangeTestEmail')?.value?.trim();
    if (!email) { showToast('أدخل بريداً للاختبار', 'warning'); return; }

    const resultEl = document.getElementById('exchangeTestResult');
    if (resultEl) resultEl.innerHTML = '<span style="color:var(--text-muted)">جارٍ الاتصال بـ Azure AD...</span>';

    await saveNotifSettingsSilent();

    try {
        const res = await fetch('api/?action=test_exchange', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ test_email: email })
        });
        const data = await res.json();
        if (resultEl) {
            resultEl.innerHTML = data.success
                ? `<span style="color:var(--accent-green)">✅ تم الإرسال عبر Exchange Graph API</span>`
                : `<span style="color:var(--accent-red)">❌ ${data.error || 'فشل الاتصال'}</span>`;
        }
    } catch (e) {
        if (resultEl) resultEl.innerHTML = `<span style="color:var(--accent-red)">❌ خطأ: ${e.message}</span>`;
    }
}

// حفظ صامت (للاختبار)
async function saveNotifSettingsSilent() {
    const get = id => document.getElementById(id)?.value || '';
    const chk = id => document.getElementById(id)?.checked ? '1' : '0';
    const payload = {
        smtp_host: get('smtp_host'), smtp_port: get('smtp_port'),
        smtp_user: get('smtp_user'), smtp_pass: get('smtp_pass'),
        smtp_encryption: get('smtp_encryption'), smtp_from_name: get('smtp_from_name'),
        ms_tenant_id: get('ms_tenant_id'), ms_client_id: get('ms_client_id'),
        ms_client_secret: get('ms_client_secret'), ms_sender_email: get('ms_sender_email'),
        ms_enabled: chk('ms_enabled'),
        notify_on_ola_warning: chk('notify_on_ola_warning'),
        notify_on_ola_breach: chk('notify_on_ola_breach'),
        notify_on_sla_warning: chk('notify_on_sla_warning'),
        notify_on_sla_breach: chk('notify_on_sla_breach'),
    };
    await fetch('api/?action=save_notification_settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
}

// ─── لوحة الإشعارات الداخلية ─────────────────────────────────
async function openInternalNotificationsPanel() {
    DOM.modalTitle.textContent = '🔔 الإشعارات الداخلية';
    DOM.modalBody.innerHTML = '<div class="loading-placeholder" style="padding:1.5rem;text-align:center">جارٍ التحميل...</div>';
    openModal();

    try {
        const res = await fetch('api/?action=system_notifications&limit=50');
        const data = await res.json();
        if (!data.success) {
            DOM.modalBody.innerHTML = '<div style="color:var(--accent-red);padding:1rem">خطأ في التحميل</div>';
            return;
        }
        DOM.modalBody.innerHTML = renderInternalNotifications(data.data);
        // Mark all as read
        await fetch('api/?action=read_all_notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    } catch (e) {
        DOM.modalBody.innerHTML = '<div style="color:var(--accent-red);padding:1rem">خطأ</div>';
    }
}

function renderInternalNotifications(notifications) {
    if (!notifications.length) {
        return '<div class="empty-state-sm" style="padding:2rem">لا توجد إشعارات</div>';
    }

    const severityIcon = { critical: '🔴', warning: '⚠️', info: 'ℹ️' };
    const scopeLabel = { transaction: 'معاملة', correspondence: 'مراسلة', system: 'النظام' };

    return `<div style="display:flex;flex-direction:column;gap:.5rem;max-height:60vh;overflow-y:auto">
        ${notifications.map(n => `
        <div style="background:var(--bg-surface);border-radius:8px;padding:.85rem 1rem;
                    border-right:3px solid ${n.severity === 'critical' ? 'var(--accent-red)' : n.severity === 'warning' ? 'var(--accent-orange)' : 'var(--accent-blue)'};
                    ${!n.is_read ? 'background:var(--bg-card)' : 'opacity:.75'}">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:.5rem">
                <div>
                    <div style="font-weight:600;font-size:.9rem">
                        ${severityIcon[n.severity] || 'ℹ️'} ${n.title}
                    </div>
                    ${n.ref_number ? `<div style="font-size:.8rem;color:var(--accent-blue);margin-top:2px">
                        ${scopeLabel[n.scope] || n.scope}: ${n.ref_number}
                    </div>` : ''}
                </div>
                <div style="font-size:.75rem;color:var(--text-muted);white-space:nowrap">
                    ${n.created_at?.slice(5, 16).replace('T', ' ') || ''}
                </div>
            </div>
            <div style="display:flex;gap:.5rem;margin-top:.4rem">
                ${n.email_sent ? '<span style="font-size:.75rem;color:var(--accent-green)">📧 بريد ✓</span>' : ''}
                ${n.exchange_sent ? '<span style="font-size:.75rem;color:var(--accent-blue)">🏢 Exchange ✓</span>' : ''}
            </div>
        </div>`).join('')}
    </div>
    <div style="margin-top:1rem;text-align:left">
        <button class="btn btn-secondary" onclick="closeModal()">إغلاق</button>
    </div>`;
}

// ─── CSS إضافي للإشعارات ─────────────────────────────────────
(function injectNotifStyles() {
    if (document.getElementById('notif-settings-styles')) return;
    const s = document.createElement('style');
    s.id = 'notif-settings-styles';
    s.textContent = `
        .notif-tab {
            background: none;
            border: none;
            padding: .5rem 1rem;
            cursor: pointer;
            font-size: .88rem;
            color: var(--text-muted);
            border-bottom: 2px solid transparent;
            margin-bottom: -2px;
            transition: all .2s;
            font-weight: 500;
        }
        .notif-tab.active {
            color: var(--accent-blue);
            border-bottom-color: var(--accent-blue);
            font-weight: 700;
        }
        .notif-tab:hover { color: var(--text-primary); }
        code {
            background: var(--bg-surface);
            border-radius: 4px;
            padding: 1px 5px;
            font-size: .82em;
            color: var(--accent-blue);
        }
    `;
    document.head.appendChild(s);
})();