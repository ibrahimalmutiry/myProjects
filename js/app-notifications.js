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
let _lastNotifCount = 0; // لكشف الإشعارات الجديدة

/** طلب إذن إشعارات المتصفح (يُستدعى مرة واحدة) */
function requestBrowserNotifPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
        Notification.requestPermission().catch(() => { });
    }
}

/** إرسال إشعار للمتصفح */
function sendBrowserNotification(title, body, icon) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
        const n = new Notification(title, {
            body: body || '',
            icon: icon || '/favicon.ico',
            dir: 'rtl',
            lang: 'ar',
            tag: 'pr-system', // يُلغي الإشعار السابق بدلاً من التراكم
        });
        n.onclick = () => { window.focus(); n.close(); switchTab('notifications'); };
        setTimeout(() => n.close(), 8000);
    } catch (e) { }
}
/** مجموعة IDs الإشعارات المقروءة — تُخزن في localStorage */
let readNotifications = new Set();

// ═══════════════════════════════════════════════════════════
//  التنبيهات الفورية
// ═══════════════════════════════════════════════════════════

/**
 * تحميل حالة القراءة من localStorage عند بدء الصفحة
 */
function loadReadNotifications() {
    // لا نستخدم localStorage للقراءة — الحالة تأتي من قاعدة البيانات فقط
    // امسح أي بيانات localStorage قديمة قد تسبب مشاكل
    try { localStorage.removeItem('readNotifications'); } catch (e) { }
    readNotifications = new Set();
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
                is_read: !!n.is_read  // الحالة من قاعدة البيانات فقط
            }));

            const newCount = notificationsData.filter(n => !n.is_read).length;
            // اكتشاف إشعارات جديدة → إرسال browser notification
            if (newCount > _lastNotifCount && _lastNotifCount > 0) {
                const newest = notificationsData.find(n => !n.is_read);
                if (newest) {
                    sendBrowserNotification(
                        newest.title || 'إشعار جديد',
                        newest.message || '',
                    );
                }
            }
            _lastNotifCount = newCount;
            unreadNotificationsCount = newCount;
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
                is_read: !!n.is_read  // الحالة من قاعدة البيانات فقط
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
        // ── تجميع إشعارات نفس الطلب + النوع (grouped_id) ───────
        const grouped = new Map();
        unread.forEach(n => {
            const key = n.grouped_id || `${n.transaction_id}_${n.category}` || n.id;
            if (!grouped.has(key)) {
                grouped.set(key, { ...n, _count: 1, _ids: [n.id] });
            } else {
                const g = grouped.get(key);
                g._count++;
                g._ids.push(n.id);
                // احتفظ بالأحدث
                if (new Date(n.created_at) > new Date(g.created_at)) {
                    grouped.set(key, { ...n, _count: g._count, _ids: g._ids });
                }
            }
        });

        grouped.forEach(n => {
            const isSla = n.category && catIcon[n.category];
            const icon = isSla ? catIcon[n.category] : (n.category === 'purchase_request' ? '📋' : '🔔');
            const color = isSla ? (catColor[n.category] || 'var(--text-muted)') : 'var(--text-muted)';
            const time = formatTimeAgo(n.update_time || n.created_at);
            const txNum = n.transaction_number || n.ref_number || '—';
            const stage = n.stage || '';
            const stageLbl = n.stage_label || stageNames[stage] || stage;
            const catLbl = n.category_label || n.title || 'إشعار';
            const desc = n.message || (n.transaction_type ? `${n.transaction_type} — ${n.status || ''}` : '');
            const isEscalation = ['ola_breach', 'sla_breach', 'manual_escalation'].includes(n.category);
            const countBadge = n._count > 1
                ? `<span style="background:${color};color:#fff;border-radius:99px;font-size:.68rem;font-weight:700;padding:1px 6px;margin-right:4px">${n._count}×</span>`
                : '';

            // data-notif-ids لتعليم كلها مقروءة دفعة واحدة
            const idsAttr = JSON.stringify(n._ids || [n.id]);

            html += `
            <div class="notif-item unread" data-notif-id="${n.id}" data-notif-ids='${idsAttr}'
                 onclick="handleNotificationGroupClick(this)"
                 style="border-right:3px solid ${color};cursor:pointer">
                <div class="notif-card-content" style="display:flex;gap:10px;align-items:flex-start;padding:10px 12px">
                    <div style="background:${color}18;color:${color};font-size:1.1rem;
                         width:36px;height:36px;min-width:36px;display:flex;align-items:center;justify-content:center;
                         border-radius:8px;position:relative">
                        ${icon}
                        ${n._count > 1 ? `<span style="position:absolute;top:-5px;right:-5px;background:${color};color:#fff;border-radius:99px;font-size:.6rem;font-weight:700;padding:1px 5px;min-width:16px;text-align:center">${n._count}</span>` : ''}
                    </div>
                    <div style="flex:1;min-width:0">
                        <div style="color:${color};font-weight:700;font-size:.84rem;display:flex;align-items:center;gap:4px">
                            ${countBadge}${catLbl}
                        </div>
                        <div style="font-weight:600;font-size:.86rem;color:var(--text-primary);margin:.18rem 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                            ${txNum}${stageLbl ? ' · ' + stageLbl : ''}
                        </div>
                        ${desc ? `<div style="font-size:.77rem;color:var(--text-muted);margin-top:2px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${desc}</div>` : ''}
                        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:.3rem">
                            <span style="font-size:.72rem;color:var(--text-muted)">${time}</span>
                            ${isEscalation && n.transaction_id ? `<button onclick="event.stopPropagation();openSlaDetailModal(${n.transaction_id})" style="background:${color};color:#fff;border:none;border-radius:4px;padding:2px 8px;font-size:.72rem;cursor:pointer">📊 SLA</button>` : ''}
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

    // فتح المعاملة أو الصفحة المناسبة
    setTimeout(() => {
        if (notif?.action_url) {
            // action_url محدد: مثل "purchase-requests#123"
            const [tab, anchor] = notif.action_url.split('#');
            switchTab(tab || 'notifications');
            if (anchor) {
                // إذا كانت صفحة طلبات الشراء افتح التفاصيل
                if (tab === 'purchase-requests' && typeof prOpenDetail === 'function') {
                    prOpenDetail(parseInt(anchor));
                }
            }
        } else if (notif?.transaction_id && notif?.category === 'purchase_request') {
            switchTab('purchase-requests');
            if (typeof prOpenDetail === 'function') prOpenDetail(notif.transaction_id);
        } else {
            const transactionId = notif ? (notif.transaction_id || notif.id) : notifId;
            goToTransaction(transactionId);
        }
    }, 100);
}

/** معالجة النقر على بطاقة إشعار (مع دعم المجموعات) */
function handleNotificationGroupClick(el) {
    // جلب كل الـ IDs في المجموعة
    let ids;
    try { ids = JSON.parse(el.dataset.notifIds || '[]'); } catch { ids = []; }
    const mainId = parseInt(el.dataset.notifId);
    if (!ids.length) ids = [mainId];

    // تعليم المجموعة كلها كمقروءة
    ids.forEach(id => {
        if (!readNotifications.has(id)) {
            readNotifications.add(id);
            if (unreadNotificationsCount > 0) unreadNotificationsCount--;
        }
    });
    saveReadNotifications();
    updateNotificationBadge();

    // animation إزالة
    el.style.transition = 'opacity .25s, transform .25s';
    el.style.opacity = '0';
    el.style.transform = 'translateX(-16px)';
    setTimeout(() => {
        el.remove();
        if (!document.querySelectorAll('.notif-item').length) {
            renderNotifications(document.getElementById('notifications-dropdown'));
        }
    }, 250);

    // إرسال للخادم
    fetch('api/?action=mark_notifications_group_read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids })
    }).catch(() => { });

    // التوجيه
    const notif = notificationsData.find(n => n.id === mainId);
    setTimeout(() => {
        if (notif?.action_url) {
            const [tab, anchor] = notif.action_url.split('#');
            switchTab(tab || 'notifications');
            if (anchor && tab === 'purchase-requests' && typeof prOpenDetail === 'function') {
                prOpenDetail(parseInt(anchor));
            }
        } else if (notif?.transaction_id) {
            if (notif.category === 'purchase_request' && typeof prOpenDetail === 'function') {
                switchTab('purchase-requests');
                prOpenDetail(notif.transaction_id);
            } else {
                goToTransaction(notif.transaction_id);
            }
        }
    }, 100);

    document.getElementById('notifications-dropdown')?.classList.remove('show');
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
}, 10000); // polling كل 10 ثوانٍ

// طلب إذن إشعارات المتصفح عند أول تحميل
setTimeout(requestBrowserNotifPermission, 3000);

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
let notifPageFilter = 'all';

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
                is_read: !!n.is_read  // الحالة من قاعدة البيانات فقط
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
// ════════════════════════════════════════════════════════════
// تجميع التنبيهات المتكررة — نفس العنوان يُجمَّع في واحد
// ════════════════════════════════════════════════════════════
function _deduplicateNotifs(arr) {
    var seen = {};
    var result = [];
    arr.forEach(function (n) {
        var key = (n.title || '') + '|' + (n.category || '');
        if (!seen[key]) {
            seen[key] = { notif: Object.assign({}, n), count: 1 };
            result.push(seen[key]);
        } else {
            seen[key].count++;
            // احتفظ بالأحدث
            if (new Date(n.created_at) > new Date(seen[key].notif.created_at)) {
                seen[key].notif = Object.assign({}, n);
            }
        }
    });
    return result.map(function (s) {
        if (s.count > 1) {
            s.notif._groupCount = s.count;
            s.notif.title = (s.notif.title || s.notif.transaction_number || 'إشعار') + ' (' + s.count + ')';
        }
        return s.notif;
    });
}

function renderNotificationsPage() {
    const now = Date.now();
    const total = notificationsData.length;

    // ── تصنيف التنبيهات ──────────────────────────────────────
    const PERSONAL_CATS = ['sla_warning', 'sla_breach', 'ola_breach', 'ola_warning',
        'escalation', 'manual_escalation', 'direct', 'security',
        'purchase_request', 'pr_approval'];
    const isPersonal = n =>
        PERSONAL_CATS.includes(n.category) ||
        (n.recipient_id && String(n.recipient_id) !== '0') ||
        (n.category && (n.category.includes('brute') || n.category.includes('ip')));

    const personalAll = _deduplicateNotifs(notificationsData.filter(isPersonal));
    const generalAll = _deduplicateNotifs(notificationsData.filter(n => !isPersonal(n)));

    // فلترة حسب النوع المحدد
    const applyFilter = arr => {
        if (notifPageFilter === 'security')
            return arr.filter(n => (n.category || '').includes('security') || (n.category || '').includes('brute') || (n.category || '').includes('ip'));
        if (notifPageFilter === 'sla')
            return arr.filter(n => (n.category || '').includes('sla') || (n.category || '').includes('ola') || (n.category || '').includes('escalat'));
        if (notifPageFilter === 'pr')
            return arr.filter(n => (n.category || '').includes('purchase') || (n.category || '').startsWith('pr_'));
        return arr;
    };

    const personal = applyFilter(personalAll);
    const general = applyFilter(generalAll);

    // ── badge النوع ──────────────────────────────────────────
    function getBadge(n) {
        const cat = n.category || '';
        const badges = {
            'sla_warning': { label: 'SLA تحذير', bg: '#FAEEDA', color: '#633806' },
            'sla_breach': { label: 'SLA تجاوز', bg: '#FCEBEB', color: '#791F1F' },
            'ola_breach': { label: 'OLA تجاوز', bg: '#FCEBEB', color: '#791F1F' },
            'ola_warning': { label: 'OLA تحذير', bg: '#FAEEDA', color: '#633806' },
            'escalation': { label: 'تصعيد', bg: '#EEEDFE', color: '#3C3489' },
            'manual_escalation': { label: 'تصعيد يدوي', bg: '#EEEDFE', color: '#3C3489' },
            'security': { label: 'أمان', bg: '#FCEBEB', color: '#791F1F' },
            'status_change': { label: 'تحديث حالة', bg: '#EAF3DE', color: '#27500A' },
            'purchase_request': { label: 'طلب شراء', bg: '#E6F1FB', color: '#0C447C' },
            'correspondence': { label: 'خطاب', bg: '#E6F1FB', color: '#0C447C' },
            'bank': { label: 'بنك', bg: '#E1F5EE', color: '#085041' },
            'reservation': { label: 'حجز', bg: '#FAEEDA', color: '#412402' },
        };
        let key = cat;
        if (!badges[key]) {
            if (cat.includes('brute') || cat.includes('ip')) key = 'security';
            else if (cat.includes('sla')) key = 'sla_warning';
            else if (cat.includes('purchase') || cat.startsWith('pr_')) key = 'purchase_request';
            else if (cat.includes('corr')) key = 'correspondence';
            else if (cat.includes('bank') || cat.includes('deposit')) key = 'bank';
            else key = 'status_change';
        }
        const b = badges[key] || badges['status_change'];
        return '<span style="font-size:10px;padding:1px 7px;border-radius:99px;background:' + b.bg + ';color:' + b.color + '">' + b.label + '</span>';
    }

    // ── لون الخط الجانبي ──────────────────────────────────────
    function getBorderColor(n) {
        const cat = n.category || '';
        if (cat === 'security' || cat.includes('brute') || cat.includes('ip') || cat.includes('breach')) return '#E24B4A';
        if (cat.includes('sla') || cat.includes('ola') || cat.includes('escalat')) return '#EF9F27';
        if (cat.includes('purchase') || cat.startsWith('pr_') || cat === 'purchase_request') return '#378ADD';
        if (cat === 'correspondence') return '#534AB7';
        if (cat === 'bank') return '#1D9E75';
        return 'var(--color-border-tertiary)';
    }

    // ── أيقونة التنبيه ──────────────────────────────────────
    function getIcon(n) {
        const cat = n.category || '';
        if (cat.includes('breach') || cat.includes('brute') || cat.includes('ip') || cat === 'security')
            return { ico: 'ti-shield-lock', bg: '#FCEBEB', color: '#A32D2D' };
        if (cat.includes('sla') || cat.includes('ola'))
            return { ico: 'ti-clock-exclamation', bg: '#FAEEDA', color: '#854F0B' };
        if (cat.includes('escalat'))
            return { ico: 'ti-arrow-up-right', bg: '#EEEDFE', color: '#534AB7' };
        if (cat.includes('purchase') || cat.startsWith('pr_'))
            return { ico: 'ti-clipboard-list', bg: '#E6F1FB', color: '#185FA5' };
        if (cat === 'correspondence')
            return { ico: 'ti-mail', bg: '#EEEDFE', color: '#534AB7' };
        if (cat.includes('bank') || cat.includes('deposit'))
            return { ico: 'ti-building-bank', bg: '#E1F5EE', color: '#0F6E56' };
        if (cat.includes('approval') || cat.includes('approve'))
            return { ico: 'ti-circle-check', bg: '#EAF3DE', color: '#3B6D11' };
        if (cat.includes('reject'))
            return { ico: 'ti-circle-x', bg: '#FCEBEB', color: '#A32D2D' };
        return { ico: 'ti-bell', bg: 'var(--color-background-secondary)', color: 'var(--color-text-secondary)' };
    }

    // ── بناء صف تنبيه ────────────────────────────────────────
    function buildRow(n) {
        const timeAgo = formatTimeAgo(n.created_at || n.update_time);
        const title = n.title || n.transaction_number || 'إشعار';
        const desc = n.message || n.status || '';
        const isNew = n.created_at && (now - new Date(n.created_at).getTime()) < 86400000;
        const ico = getIcon(n);
        const bcolor = getBorderColor(n);
        const refNum = n.ref_number || n.transaction_number || '';
        const canApprove = n.category === 'purchase_request' || (n.category || '').includes('approval');

        return '<div class="np-row" style="border-right:3px solid ' + bcolor + '" data-notif-id="' + n.id + '" onclick="handleNotifPageClick(' + n.id + ')">'
            // نقطة "جديد"
            + '<div style="width:7px;height:7px;border-radius:50%;flex-shrink:0;margin-top:14px;background:' + (isNew ? '#378ADD' : 'transparent') + '"></div>'
            // أيقونة
            + '<div style="width:34px;height:34px;border-radius:var(--border-radius-md);display:flex;align-items:center;justify-content:center;flex-shrink:0;background:' + ico.bg + '">'
            + '<i class="ti ' + ico.ico + '" style="font-size:16px;color:' + ico.color + '" aria-hidden="true"></i>'
            + '</div>'
            // المحتوى
            + '<div style="flex:1;min-width:0">'
            + '<div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">'
            + '<span style="font-size:12px;font-weight:500;color:var(--color-text-primary)">' + title + '</span>'
            + (isNew ? '<span style="font-size:10px;padding:0 6px;border-radius:99px;background:#E6F1FB;color:#0C447C">جديد</span>' : '')
            + '</div>'
            + (desc ? '<div style="font-size:11px;color:var(--color-text-secondary);margin-top:2px;line-height:1.45">' + desc.substring(0, 110) + (desc.length > 110 ? '…' : '') + '</div>' : '')
            + '<div style="display:flex;align-items:center;gap:5px;margin-top:5px;flex-wrap:wrap">'
            + getBadge(n)
            + (refNum ? '<span style="font-size:10px;color:var(--color-text-tertiary)">' + refNum + '</span>' : '')
            + '<span style="font-size:10px;color:var(--color-text-tertiary)">' + timeAgo + '</span>'
            + '</div>'
            // أزرار الإجراء المباشر
            + (canApprove && n.transaction_id ? '<div style="display:flex;gap:5px;margin-top:6px">'
                + '<button style="font-size:11px;padding:3px 10px;border-radius:var(--border-radius-md);border:0.5px solid #C0DD97;background:#EAF3DE;color:#27500A;cursor:pointer" onclick="event.stopPropagation()">موافقة</button>'
                + '<button style="font-size:11px;padding:3px 10px;border-radius:var(--border-radius-md);border:0.5px solid #F7C1C1;background:#FCEBEB;color:#791F1F;cursor:pointer" onclick="event.stopPropagation()">رفض</button>'
                + '</div>' : '')
            + '</div>'
            // زر حذف
            + '<button class="np-btn np-btn-del" onclick="event.stopPropagation();deleteNotif(' + n.id + ')" title="حذف" style="opacity:.45;transition:opacity .15s" onmouseenter="this.style.opacity=1" onmouseleave="this.style.opacity=.45">'
            + '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>'
            + '</button>'
            + '</div>';
    }

    // ── بناء قسم ──────────────────────────────────────────────
    function buildSection(items, emptyMsg) {
        if (!items.length)
            return '<div style="padding:1.75rem;text-align:center;color:var(--color-text-tertiary);font-size:13px">'
                + '<i class="ti ti-circle-check" style="font-size:28px;display:block;margin-bottom:8px;opacity:.4" aria-hidden="true"></i>'
                + emptyMsg + '</div>';
        return items.map(buildRow).join('');
    }

    // ══════════════════════════════════════════════════════════
    // بناء HTML الصفحة
    // ══════════════════════════════════════════════════════════
    DOM.mainContent.innerHTML = `
    <div class="np-wrap">

        <!-- هيدر -->
        <div class="np-header">
            <div>
                <h2 class="np-main-title">التنبيهات</h2>
                <p class="np-main-sub">${total} تنبيه — ${notificationsData.filter(n => n.created_at && (now - new Date(n.created_at).getTime()) < 86400000).length} جديد اليوم</p>
            </div>
            <div style="display:flex;gap:.5rem;align-items:center">
                <button class="btn btn-secondary" onclick="toggleAnalyticsPanel()" id="np-analytics-toggle" style="font-size:.78rem">
                    <i class="ti ti-chart-bar" aria-hidden="true"></i> تحليل
                </button>
                <button class="btn" onclick="deleteAllNotifs()" style="font-size:.78rem;color:var(--color-text-danger,#A32D2D);border-color:var(--color-border-tertiary)">
                    <i class="ti ti-trash" aria-hidden="true"></i> حذف الكل
                </button>
            </div>
        </div>

        <!-- لوحة التحليل — مخفية بالافتراضي -->
        <div id="np-analytics-panel" style="display:none">
            ${_buildAnalyticsPanel(total, notificationsData, now)}
        </div>

        <!-- فلاتر النوع -->
        <div class="np-filter-bar">
            <button class="np-filter-btn ${notifPageFilter === 'all' ? 'active' : ''}" onclick="setNotifFilter('all')">الكل <span class="np-filter-count">${total}</span></button>
            <button class="np-filter-btn ${notifPageFilter === 'security' ? 'active' : ''}" onclick="setNotifFilter('security')">
                <i class="ti ti-shield-lock" style="font-size:13px" aria-hidden="true"></i> أمان
            </button>
            <button class="np-filter-btn ${notifPageFilter === 'sla' ? 'active' : ''}" onclick="setNotifFilter('sla')">
                <i class="ti ti-clock" style="font-size:13px" aria-hidden="true"></i> SLA
            </button>
            <button class="np-filter-btn ${notifPageFilter === 'pr' ? 'active' : ''}" onclick="setNotifFilter('pr')">
                <i class="ti ti-clipboard-list" style="font-size:13px" aria-hidden="true"></i> شراء
            </button>
        </div>

        <!-- القسم 1: تنبيهاتي الشخصية -->
        <div class="np-section-card">
            <div class="np-section-header" style="border-right:3px solid #378ADD">
                <i class="ti ti-user-circle" style="font-size:16px;color:#185FA5" aria-hidden="true"></i>
                <div style="flex:1">
                    <div style="font-size:13px;font-weight:500;color:var(--color-text-primary)">تنبيهاتي الشخصية</div>
                    <div style="font-size:11px;color:var(--color-text-secondary);margin-top:1px">موافقات مطلوبة · SLA · أمان · رسائل مباشرة</div>
                </div>
                <span style="font-size:11px;font-weight:500;color:var(--color-text-secondary)">${personal.length}</span>
            </div>
            <div>${buildSection(personal, 'لا توجد تنبيهات شخصية')}</div>
        </div>

        <!-- القسم 2: التنبيهات العامة -->
        <div class="np-section-card" style="margin-top:.75rem">
            <div class="np-section-header" style="border-right:3px solid var(--color-border-secondary)">
                <i class="ti ti-world" style="font-size:16px;color:var(--color-text-secondary)" aria-hidden="true"></i>
                <div style="flex:1">
                    <div style="font-size:13px;font-weight:500;color:var(--color-text-primary)">التنبيهات العامة</div>
                    <div style="font-size:11px;color:var(--color-text-secondary);margin-top:1px">تحديثات المعاملات · طلبات جديدة · تغييرات المراحل</div>
                </div>
                <span style="font-size:11px;font-weight:500;color:var(--color-text-secondary)">${general.length}</span>
            </div>
            <div>${buildSection(general, 'لا توجد تنبيهات عامة')}</div>
        </div>

    </div>`;

    injectNotifPageStyles();
}

// ════════════════════════════════════════════════════════════
// لوحة التحليل — دالة مساعدة منفصلة
// ════════════════════════════════════════════════════════════
function _buildAnalyticsPanel(total, data, now) {
    var secCount = data.filter(function (n) { return (n.category || '').includes('security') || (n.category || '').includes('brute') || (n.category || '').includes('ip'); }).length;
    var slaCount = data.filter(function (n) { return (n.category || '').includes('sla') || (n.category || '').includes('ola') || (n.category || '').includes('escalat'); }).length;
    var prCount = data.filter(function (n) { return (n.category || '').includes('purchase') || (n.category || '').startsWith('pr_'); }).length;
    var newCount = data.filter(function (n) { return n.created_at && (now - new Date(n.created_at).getTime()) < 86400000; }).length;

    function dayKey(d) { var dt = new Date(d); return dt.getFullYear() + '-' + (dt.getMonth() + 1) + '-' + dt.getDate(); }
    var dayMap = {};
    for (var d = 6; d >= 0; d--) { var dt = new Date(now - d * 86400000); dayMap[dayKey(dt)] = 0; }
    data.forEach(function (n) { if (n.created_at) { var k = dayKey(n.created_at); if (dayMap[k] !== undefined) dayMap[k]++; } });
    var dayVals = Object.values(dayMap);
    var dayLabels = Object.keys(dayMap).map(function (k) { var p = k.split('-'); return p[2] + '/' + p[1]; });
    var maxDay = Math.max.apply(null, dayVals) || 1;

    var html = '<div style="background:var(--color-background-secondary);border:0.5px solid var(--color-border-tertiary);border-radius:var(--border-radius-lg);padding:.85rem 1rem;margin-bottom:.75rem">';

    // KPIs
    html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:.6rem;margin-bottom:.85rem">';
    [{ label: 'الإجمالي', val: total, color: '#378ADD' }, { label: 'جديد اليوم', val: newCount, color: '#1D9E75' }, { label: 'SLA', val: slaCount, color: '#EF9F27' }, { label: 'أمان', val: secCount, color: '#E24B4A' }].forEach(function (k) {
        html += '<div style="background:var(--color-background-primary);border:0.5px solid var(--color-border-tertiary);border-radius:var(--border-radius-md);padding:.6rem .75rem;text-align:center">'
            + '<div style="font-size:1.4rem;font-weight:500;color:' + k.color + '">' + k.val + '</div>'
            + '<div style="font-size:.68rem;color:var(--color-text-secondary);margin-top:2px">' + k.label + '</div>'
            + '</div>';
    });
    html += '</div>';

    // Bar chart
    html += '<div style="font-size:.68rem;font-weight:500;color:var(--color-text-secondary);text-transform:uppercase;letter-spacing:.06em;margin-bottom:.5rem">النشاط — آخر 7 أيام</div>';
    html += '<div style="display:flex;align-items:flex-end;gap:4px;height:60px;margin-bottom:4px">';
    dayVals.forEach(function (v, i) {
        var h = maxDay > 0 ? Math.max(Math.round(v / maxDay * 100), v > 0 ? 4 : 0) : 0;
        var isToday = i === dayVals.length - 1;
        html += '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;height:100%;justify-content:flex-end" title="' + dayLabels[i] + ': ' + v + '">'
            + '<div style="font-size:9px;color:var(--color-text-tertiary)">' + (v > 0 ? v : '') + '</div>'
            + '<div style="width:100%;background:' + (isToday ? '#378ADD' : '#B5D4F4') + ';height:' + h + '%;border-radius:2px 2px 0 0;min-height:' + (v > 0 ? '3' : '0') + 'px"></div>'
            + '</div>';
    });
    html += '</div>';
    html += '<div style="display:flex;justify-content:space-between">';
    [0, 2, 4, 6].forEach(function (i) { html += '<span style="font-size:9px;color:var(--color-text-tertiary)">' + dayLabels[i] + '</span>'; });
    html += '</div>';
    html += '</div>';
    return html;
}

/** تغيير الفلتر وإعادة الرسم */

// ════════════════════════════════════════════════════════════
// حذف تنبيه واحد
// ════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════
// تبديل ظهور لوحة التحليل
// ════════════════════════════════════════════════════════════
var _analyticsPanelOpen = false;
function toggleAnalyticsPanel() {
    var panel = document.getElementById('np-analytics-panel');
    var btn = document.getElementById('np-analytics-toggle');
    if (!panel) return;
    _analyticsPanelOpen = !_analyticsPanelOpen;
    panel.style.display = _analyticsPanelOpen ? 'block' : 'none';
    if (btn) btn.style.opacity = _analyticsPanelOpen ? '1' : '0.6';
}

async function deleteNotif(notifId) {
    try {
        await fetch('api/?action=delete_notification', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: notifId })
        });
        notificationsData = notificationsData.filter(n => n.id !== notifId);
        unreadNotificationsCount = notificationsData.filter(n => !n.is_read).length; // ← أضف هذا
        renderNotificationsPage();
        updateNotificationBadge();
    } catch (e) { showToast('خطأ في الحذف', 'error'); }
}

// ════════════════════════════════════════════════════════════
// حذف كل التنبيهات
// ════════════════════════════════════════════════════════════
async function deleteAllNotifs() {
    if (!confirm('حذف كل التنبيهات؟ هذا الإجراء لا يمكن التراجع عنه.')) return;
    try {
        await fetch('api/?action=delete_all_notifications', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filter: notifPageFilter })
        });
        notificationsData = [];
        renderNotificationsPage();
        updateNotificationBadge();
        showToast('تم حذف التنبيهات', 'success');
    } catch (e) { showToast('خطأ في الحذف', 'error'); }
}

function setNotifFilter(filter) {
    notifPageFilter = filter;
    renderNotificationsPage();
}

/** معالجة النقر على سطر تنبيه */
function handleNotifPageClick(notifId) {
    markNotifRead(notifId);
    const n = notificationsData.find(x => x.id === notifId);
    if (n && n.transaction_id) goToTransaction(n.transaction_id);
}

/** تعيين تنبيه كمقروء مع تحديث الصفحة */
function markNotifRead(notifId) {
    // تأكد من النوع الصحيح — n.id من API قد يكون string أو number
    const id = parseInt(notifId, 10);

    // تحقق من القراءة المسبقة (تحقق بالنوعين)
    if (readNotifications.has(id) || readNotifications.has(String(id))) return;

    readNotifications.add(id);
    saveReadNotifications();

    // تحديث البيانات المحلية (مطابقة بالنوعين)
    const n = notificationsData.find(x => parseInt(x.id, 10) === id);
    if (n) n.is_read = true;

    unreadNotificationsCount = notificationsData.filter(x => x.is_read != 1 && x.is_read !== true).length;
    updateNotificationBadge();

    // تحديد نوع التنبيه: system_notification (له id حقيقي) أم tx notification
    const notifObj = notificationsData.find(x => parseInt(x.id, 10) === id);
    const payload = notifObj && notifObj.notif_key
        ? { transaction_id: id }          // تنبيه معاملة
        : { notification_id: id };        // تنبيه system_notifications

    fetch('api/?action=mark_notification_read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    }).catch(() => { });

    // تحديث الصفحة مباشرة
    renderNotificationsPage();

    // تحديث السطر في DOM
    const row = document.querySelector(`[data-notif-id="${id}"]`);
    if (row) {
        row.classList.remove('np-unread', 'unread');
        row.classList.add('np-read', 'read');
        // حذف النقطة البرتقالية
        row.querySelector('.np-dot')?.remove();
        // حذف زر "تعيين كمقروء" مع إبقاء زر الفتح
        row.querySelectorAll('.np-btn').forEach(btn => {
            if (!btn.classList.contains('np-btn-go')) btn.remove();
        });
        row.querySelector('.notif-action-btn:not(.goto-btn)')?.remove();
    }
}

/** حقن CSS صفحة التنبيهات */
function injectNotifPageStyles() {
    if (document.getElementById('notif-page-styles')) return;
    const s = document.createElement('style');
    s.id = 'notif-page-styles';
    s.textContent = `

    /* ════════════════════════════════
       صفحة التنبيهات — تصميم محسّن
    ════════════════════════════════ */

    .np-wrap {
        display: flex;
        flex-direction: column;
        gap: 1.25rem;
        width: 100%;
        max-width: 100%;
    }

    /* هيدر */
    .np-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 1rem;
        flex-wrap: wrap;
    }
    .np-main-title { font-size:1.3rem;font-weight:800;color:var(--text-primary);margin:0; }
    .np-main-sub   { font-size:.82rem;color:var(--text-muted);margin:.25rem 0 0; }

    /* إحصاءات */
    .np-stats {
        display: grid;
        grid-template-columns: repeat(4,1fr);
        gap: .75rem;
    }
    .np-stat {
        background: var(--bg-card);
        border: 1px solid var(--border-color);
        border-radius: 12px;
        padding: 1rem;
        text-align: center;
    }
    .np-stat-n { font-size:1.7rem;font-weight:800;color:var(--text-primary);line-height:1; }
    .np-stat-l { font-size:.74rem;color:var(--text-muted);margin-top:.3rem; }
    .np-stat--orange .np-stat-n { color:var(--accent-orange); }
    .np-stat--green  .np-stat-n { color:var(--accent-green);  }
    .np-stat--purple .np-stat-n { color:var(--accent-purple); }

    /* فلتر */
    .np-filter-bar {
        display: flex;
        gap: 4px;
        background: var(--bg-card);
        border: 1px solid var(--border-color);
        border-radius: 10px;
        padding: 4px;
    }
    .np-filter-btn {
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
    .np-filter-btn:hover { color:var(--text-primary);background:var(--bg-surface); }
    .np-filter-btn.active {
        background: var(--btn-primary-bg);
        color: var(--btn-primary-text);
        font-weight: 700;
        box-shadow: 0 1px 6px rgba(0,0,0,.12);
    }
    .np-filter-count {
        background: rgba(255,255,255,.15);
        border-radius: 10px;
        padding: 1px 7px;
        font-size: .72rem;
        font-weight: 700;
    }
    .np-filter-btn:not(.active) .np-filter-count {
        background: var(--bg-surface);
        color: var(--text-muted);
    }

    /* بطاقة القسم */
    .np-section-card {
        background: var(--bg-card);
        border: 1px solid var(--border-color);
        border-radius: 14px;
        overflow: hidden;
    }

    /* هيدر القسم */
    .np-section-header {
        display: flex;
        align-items: center;
        gap: .875rem;
        padding: 1rem 1.25rem;
        border-bottom: 1px solid var(--border-color);
    }
    .np-section-header--personal {
        background: linear-gradient(135deg, rgba(177,151,252,.08) 0%, rgba(74,171,247,.05) 100%);
        border-bottom-color: rgba(177,151,252,.25);
    }
    .np-section-header--general {
        background: linear-gradient(135deg, rgba(105,219,124,.06) 0%, rgba(59,201,219,.04) 100%);
        border-bottom-color: rgba(105,219,124,.2);
    }
    .np-section-icon {
        font-size: 1.4rem;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--bg-surface);
        border-radius: 10px;
        flex-shrink: 0;
    }
    .np-section-title { font-size:.95rem;font-weight:700;color:var(--text-primary); }
    .np-section-sub   { font-size:.76rem;color:var(--text-muted);margin-top:.15rem; }
    .np-section-badge { margin-right:auto; }
    .np-badge-count {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 24px;
        height: 24px;
        padding: 0 .5rem;
        background: var(--accent-red);
        color: white;
        border-radius: 12px;
        font-size: .76rem;
        font-weight: 700;
    }

    /* قائمة التنبيهات */
    .np-section-list { display:flex;flex-direction:column; }

    /* صف تنبيه */
    .np-row {
        display: flex;
        align-items: flex-start;
        gap: .75rem;
        padding: .85rem 1rem;
        border-bottom: 0.5px solid var(--color-border-tertiary);
        cursor: pointer;
        transition: background .12s;
    }
    .np-row:last-child  { border-bottom: none; }
        .np-analytics-panel { background:var(--bg-surface,var(--color-background-secondary)); border:1px solid var(--border-color,var(--color-border-tertiary)); border-radius:12px; padding:.85rem 1rem; margin-bottom:.85rem; }
        .np-analytics-kpis { display:grid; grid-template-columns:repeat(4,1fr); gap:.6rem; margin-bottom:.85rem; }
        .np-akpi { background:var(--bg-card,var(--color-background-primary)); border:0.5px solid var(--border-color,var(--color-border-tertiary)); border-radius:10px; padding:.65rem .85rem; text-align:center; }
        .np-akpi-val { font-size:1.5rem; font-weight:700; line-height:1; margin-bottom:.2rem; }
        .np-akpi-lbl { font-size:.68rem; color:var(--text-muted,var(--color-text-secondary)); }
        .np-analytics-charts { display:grid; grid-template-columns:2fr 1.5fr 1.5fr; gap:.75rem; }
        .np-chart-box { background:var(--bg-card,var(--color-background-primary)); border:0.5px solid var(--border-color,var(--color-border-tertiary)); border-radius:10px; padding:.75rem .85rem; }
        .np-chart-title { font-size:.7rem; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:var(--text-muted,var(--color-text-secondary)); margin-bottom:.65rem; }
        .np-bar-chart { display:flex; align-items:flex-end; gap:4px; height:70px; }
        .np-bar-col { flex:1; display:flex; flex-direction:column; align-items:center; gap:2px; height:100%; justify-content:flex-end; }
        .np-bar-val { font-size:9px; color:var(--text-muted,var(--color-text-secondary)); min-height:12px; }
        .np-bar { width:100%; border-radius:3px 3px 0 0; min-height:2px; transition:height .3s; }
        .np-bar-lbl { font-size:9px; color:var(--text-muted,var(--color-text-secondary)); text-align:center; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%; }
        .np-chart-note { font-size:.68rem; color:var(--text-muted,var(--color-text-secondary)); margin-top:.45rem; text-align:center; }
        .np-donut-wrap { display:flex; align-items:center; gap:.75rem; }
        .np-donut-legend { display:flex; flex-direction:column; gap:5px; flex:1; }
        .np-legend-row { display:flex; align-items:center; gap:5px; font-size:.7rem; }
        .np-legend-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
        .np-legend-lbl { flex:1; color:var(--text-secondary,var(--color-text-secondary)); }
        .np-legend-val { color:var(--text-primary,var(--color-text-primary)); font-weight:500; }
        .np-pulse-list { display:flex; flex-direction:column; gap:7px; }
        .np-pulse-row { display:flex; align-items:center; gap:6px; }
        .np-pulse-icon { font-size:.8rem; width:18px; text-align:center; }
        .np-pulse-lbl { font-size:.72rem; color:var(--text-secondary,var(--color-text-secondary)); min-width:70px; }
        .np-pulse-bar-wrap { flex:1; height:5px; border-radius:99px; background:var(--border-color,var(--color-border-tertiary)); overflow:hidden; }
        .np-pulse-bar { height:100%; border-radius:99px; transition:width .4s; }
        .np-pulse-num { font-size:.72rem; font-weight:700; min-width:20px; text-align:left; }
        @media (max-width:600px) { .np-analytics-kpis { grid-template-columns:repeat(2,1fr); } .np-analytics-charts { grid-template-columns:1fr; } }
    .np-row:hover { background: var(--color-background-secondary); }

    /* أيقونة */
    .np-icon {
        width: 40px;
        height: 40px;
        min-width: 40px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
    }

    /* جسم */
    .np-body   { flex:1;min-width:0; }
    .np-top    { display:flex;align-items:center;gap:.5rem;margin-bottom:.2rem; }
    .np-title  { font-size:.875rem;font-weight:700;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:300px; }
    .np-dot    { width:8px;height:8px;border-radius:50%;background:var(--accent-orange);flex-shrink:0;margin-right:auto; }
    .np-desc   { font-size:.8rem;color:var(--text-secondary);margin-bottom:.4rem;line-height:1.5; }
    .np-meta   { display:flex;align-items:center;flex-wrap:wrap;gap:.4rem; }
    .np-ref    { font-size:.75rem;font-weight:700;color:var(--accent-blue);font-family:var(--font-primary); }
    .np-emp    { font-size:.75rem;color:var(--text-muted); }
    .np-time   { font-size:.73rem;color:var(--text-muted);margin-right:auto; }

    /* badge النوع والمصدر */
    .notif-source-badge {
        display: inline-flex;
        align-items: center;
        gap: .25rem;
        padding: .18rem .55rem;
        border-radius: 20px;
        font-size: .72rem;
        font-weight: 700;
        white-space: nowrap;
    }

    /* أزرار الإجراءات */
    .np-actions {
        display: flex;
        gap: .3rem;
        flex-shrink: 0;
        opacity: 0;
        pointer-events: none;
        transition: opacity .15s;
        align-items: flex-start;
        padding-top: .1rem;
    }
    .np-row:hover .np-actions,
    .np-row:focus-within .np-actions { opacity:1;pointer-events:auto; }
    .np-btn {
        width: 28px;
        height: 28px;
        border-radius: 7px;
        border: 1px solid var(--border-color);
        background: var(--bg-surface);
        color: var(--text-muted);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all .18s;
        flex-shrink: 0;
    }
    .np-btn:hover     { background:var(--accent-green);color:white;border-color:var(--accent-green); }
    .np-btn-go:hover  { background:var(--accent-blue); color:white;border-color:var(--accent-blue);  }

    /* فارغ */
    .np-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: .5rem;
        padding: 2.5rem 1rem;
        color: var(--text-muted);
        font-size: .85rem;
    }
    .np-empty-icon { font-size:2rem; }

    /* موبايل */
    @media (max-width: 768px) {
        .np-stats { grid-template-columns: repeat(2,1fr); }
        .np-actions { opacity:1;pointer-events:auto; }
        .np-title { max-width:180px; }
    }
    @media (max-width: 480px) {
        .np-stats { grid-template-columns: repeat(2,1fr); gap:.5rem; }
        .np-stat-n { font-size:1.4rem; }
        .np-row { padding:.75rem 1rem;gap:.65rem; }
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
                    style="font-family:var(--font-primary);font-size:.85rem">
            </div>
            <div class="form-group">
                <label class="form-label">Client ID (Application ID)</label>
                <input type="text" id="ms_client_id" class="form-input" value="${val('ms_client_id')}"
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    style="font-family:var(--font-primary);font-size:.85rem">
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