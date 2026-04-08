<?php
/**
 * صفحة تسجيل الدخول — مسار MASAR
 * Login Page — MASAR Brand
 */
session_start();
if (isset($_SESSION['user_id'])) {
    header('Location: index.php');
    exit;
}
?>
<!DOCTYPE html>
<html lang="ar" dir="rtl" data-theme="light">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>تسجيل الدخول | مسار MASAR</title>
    <link rel="icon"
        href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='20' fill='%233F5950'/><text y='.85em' font-size='60' x='50%' text-anchor='middle' fill='white'>م</text></svg>">
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;500;600;700;800;900&display=swap"
        rel="stylesheet">

    <!-- ① تطبيق الثيم قبل رسم أي شيء — يمنع الوميض -->
    <script>
    (function() {
        var MAP = {
            theme_primary: '--primary',
            theme_primary_dark: '--primary-dark',
            theme_accent: '--accent',
            theme_brand_dark: '--brand-dark',
            theme_bg_primary: '--bg',
            theme_bg_card: '--bg-card',
            theme_bg_surface: '--bg-surface',
            theme_bg_secondary: '--bg-secondary',
            theme_text_primary: '--text-primary',
            theme_text_secondary: '--text-secondary',
            theme_text_muted: '--text-muted',
            theme_border: '--border',
        };
        var root = document.documentElement;
        try {
            for (var k in MAP) {
                var v = localStorage.getItem(k);
                if (v) root.style.setProperty(MAP[k], v);
            }
            var p = localStorage.getItem('theme_primary');
            if (p) {
                var r = parseInt(p.slice(1, 3), 16),
                    g = parseInt(p.slice(3, 5), 16),
                    b = parseInt(p.slice(5, 7), 16);
                root.style.setProperty('--primary-subtle', 'rgba(' + r + ',' + g + ',' + b + ',.12)');
                root.style.setProperty('--primary-dark-subtle', 'rgba(' + r + ',' + g + ',' + b + ',.08)');
            }
        } catch (e) {}
    })();
    </script>

    <style>
    *,
    *::before,
    *::after {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
    }

    :root {
        /* الافتراضي — يُستبدل بواسطة الثيم المحفوظ */
        --primary: #3F5950;
        --primary-dark: #2e4139;
        --primary-subtle: rgba(63, 89, 80, .12);
        --accent: #F26F63;
        --accent-dark: #d4574b;
        --bg: #ECE8E3;
        --bg-card: #F2EEEB;
        --bg-surface: #E5E0DA;
        --text-primary: #402B29;
        --text-secondary: #5a4240;
        --text-muted: #9a8f8c;
        --border: #cdc8c2;
        --font: 'Cairo', sans-serif;
    }

    [data-theme="dark"] {
        --primary: #3F5950;
        --primary-dark: #2e4139;
        --primary-subtle: rgba(63, 89, 80, .15);
        --accent: #F26F63;
        --bg: #1e2c28;
        --bg-card: #2a3830;
        --bg-surface: #253029;
        --text-primary: #ECE8E3;
        --text-secondary: #b5b0aa;
        --text-muted: #7a7570;
        --border: #3a4f47;
    }

    body {
        font-family: var(--font);
        background: var(--bg);
        color: var(--text-primary);
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background .3s, color .3s;
        position: relative;
        overflow: hidden;
    }

    /* خلفية هندسية */
    body::before {
        content: '';
        position: fixed;
        inset: 0;
        background:
            radial-gradient(circle at 15% 15%, rgba(var(--primary-rgb, 63, 89, 80), .1) 0%, transparent 50%),
            radial-gradient(circle at 85% 85%, rgba(var(--accent-rgb, 242, 111, 99), .07) 0%, transparent 50%);
        pointer-events: none;
    }

    /* زر الثيم */
    .theme-btn {
        position: fixed;
        top: 1.25rem;
        left: 1.25rem;
        width: 38px;
        height: 38px;
        border-radius: 10px;
        background: var(--bg-card);
        border: 1px solid var(--border);
        color: var(--text-muted);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all .2s;
        font-size: 1.1rem;
        z-index: 10;
    }

    .theme-btn:hover {
        border-color: var(--primary);
        color: var(--primary);
        background: var(--primary-subtle);
    }

    /* البطاقة */
    .wrap {
        width: 100%;
        max-width: 440px;
        padding: 1.25rem;
        position: relative;
        z-index: 1;
    }

    .card {
        background: var(--bg-card);
        border: 1px solid var(--border);
        border-radius: 24px;
        padding: 2.5rem 2.25rem;
        box-shadow: 0 20px 60px rgba(0, 0, 0, .1);
    }

    /* ── الشعارات ── */
    .logos-section {
        text-align: center;
        margin-bottom: 1.75rem;
    }

    .logos-row {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 1rem;
        margin-bottom: 1.1rem;
    }

    /* شعار المنظمة — خلفية بيضاء دائماً */
    .logo-box {
        width: 56px;
        height: 56px;
        border-radius: 14px;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        flex-shrink: 0;
    }

    .logo-box.org-logo {
        background: #ffffff !important;
        border: 1.5px solid var(--border);
        box-shadow: 0 4px 14px rgba(0, 0, 0, .1);
    }

    /* شعار مسار — خلفية primary */
    .logo-box.masar-logo {
        background: var(--primary);
        box-shadow: 0 6px 20px rgba(0, 0, 0, .2);
    }

    .logo-box img {
        width: 46px;
        height: 46px;
        object-fit: contain;
        display: block;
    }

    .logo-masar-inner {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
        font-size: .58rem;
        font-weight: 900;
        color: #fff;
        line-height: 1.3;
        letter-spacing: .03em;
        text-align: center;
    }

    .logos-sep {
        width: 1px;
        height: 36px;
        background: var(--border);
    }

    .sys-name h1 {
        font-size: 2.55rem;
        font-weight: 900;
        color: var(--primary);
        letter-spacing: -.02em;
        line-height: 1.1;
        margin-bottom: .2rem;
    }

    .sys-name p {
        font-size: .8rem;
        color: var(--text-muted);
    }

    /* ── بطاقة الموظف ── */
    .emp-card {
        display: none;
        align-items: center;
        gap: .875rem;
        padding: .875rem 1rem;
        background: var(--bg-surface);
        border: 1px solid var(--border);
        border-radius: 12px;
        margin-bottom: 1rem;
        transition: all .3s;
    }

    .emp-card.show {
        display: flex;
        animation: slideIn .25s ease;
    }

    @keyframes slideIn {
        from {
            opacity: 0;
            transform: translateY(-8px)
        }

        to {
            opacity: 1;
            transform: none
        }
    }

    .emp-avatar {
        width: 40px;
        height: 40px;
        border-radius: 10px;
        background: var(--primary);
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.1rem;
        font-weight: 800;
        flex-shrink: 0;
    }

    .emp-name {
        font-size: .88rem;
        font-weight: 800;
        color: var(--text-primary);
    }

    .emp-role {
        font-size: .72rem;
        color: var(--primary);
        font-weight: 600;
        margin-top: 1px;
    }

    /* ── النموذج ── */
    .form-group {
        margin-bottom: 1rem;
    }

    .form-label {
        display: block;
        font-size: .82rem;
        font-weight: 700;
        color: var(--text-secondary);
        margin-bottom: .375rem;
    }

    .input-wrap {
        position: relative;
    }

    .form-input {
        width: 100%;
        padding: .68rem .875rem .68rem 2.5rem;
        border: 1.5px solid var(--border);
        border-radius: 10px;
        background: var(--bg-card);
        color: var(--text-primary);
        font-family: var(--font);
        font-size: .875rem;
        transition: border-color .2s, box-shadow .2s;
        outline: none;
    }

    .form-input:focus {
        border-color: var(--primary);
        box-shadow: 0 0 0 3px var(--primary-subtle);
    }

    .form-input::placeholder {
        color: var(--text-muted);
    }

    .form-input.locked {
        opacity: .75;
        cursor: default;
    }

    .input-icon {
        position: absolute;
        right: .875rem;
        top: 50%;
        transform: translateY(-50%);
        color: var(--text-muted);
        pointer-events: none;
        transition: color .2s;
    }

    .input-wrap:focus-within .input-icon {
        color: var(--primary);
    }

    .pw-toggle {
        position: absolute;
        left: .875rem;
        top: 50%;
        transform: translateY(-50%);
        background: none;
        border: none;
        color: var(--text-muted);
        cursor: pointer;
        padding: 0;
        display: flex;
        align-items: center;
        transition: color .2s;
    }

    .pw-toggle:hover {
        color: var(--primary);
    }

    /* ── رسائل ── */
    .message {
        display: none;
        align-items: center;
        gap: .5rem;
        padding: .65rem .875rem;
        border-radius: 9px;
        font-size: .82rem;
        font-weight: 600;
        margin-bottom: .875rem;
    }

    .message.show {
        display: flex;
        animation: slideIn .2s ease;
    }

    .message.error {
        background: rgba(242, 111, 99, .1);
        color: var(--accent-dark);
        border: 1px solid rgba(242, 111, 99, .25);
    }

    .message.success {
        background: var(--primary-subtle);
        color: var(--primary);
        border: 1px solid rgba(0, 0, 0, .08);
    }

    .message.info {
        background: rgba(34, 139, 230, .1);
        color: #1864ab;
        border: 1px solid rgba(34, 139, 230, .2);
    }

    /* ── زر الدخول ── */
    .btn-login {
        width: 100%;
        padding: .78rem;
        background: var(--primary);
        color: #fff;
        border: none;
        border-radius: 12px;
        font-family: var(--font);
        font-size: .95rem;
        font-weight: 700;
        cursor: pointer;
        transition: all .2s;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: .5rem;
        box-shadow: 0 4px 14px rgba(0, 0, 0, .2);
        margin-top: 1.1rem;
    }

    .btn-login:hover:not(:disabled) {
        background: var(--primary-dark);
        transform: translateY(-1px);
        box-shadow: 0 6px 20px rgba(0, 0, 0, .25);
    }

    .btn-login:disabled {
        opacity: .7;
        cursor: not-allowed;
        transform: none;
    }

    .btn-loader {
        display: none;
    }

    @keyframes spin {
        to {
            transform: rotate(360deg)
        }
    }

    .spin {
        animation: spin .9s linear infinite;
    }

    .register-link {
        text-align: center;
        margin-top: 1rem;
        font-size: .78rem;
        color: var(--text-muted);
    }

    .register-link a {
        color: var(--primary);
        font-weight: 700;
        text-decoration: none;
    }

    .register-link a:hover {
        text-decoration: underline;
    }

    .login-footer {
        text-align: center;
        margin-top: 1.5rem;
        font-size: .72rem;
        color: var(--text-muted);
    }

    .login-footer strong {
        color: var(--primary);
    }
    </style>
</head>

<body>

    <button class="theme-btn" onclick="toggleTheme()" id="themeBtn" title="تغيير المظهر">🌙</button>

    <div class="wrap">
        <div class="card">

            <!-- الشعارات -->
            <div class="logos-section">
                <!-- <div class="logos-row">

                    <div class="logo-box org-logo">
                        <img src="images/logo.png" alt="الشعار"
                            onerror="this.style.display='none';this.parentElement.innerHTML+='<svg width=\'32\' height=\'32\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23334155\' stroke-width=\'1.5\'><path d=\'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z\'></path></svg>'">
                    </div>

                    <div class="logos-sep"></div>
                    <div class="logo-box masar-logo" id="masarLogoBox">
                        <img src="images/logo-masar.png" alt="مسار MASAR"
                            onerror="this.style.display='none'; document.getElementById('masarFallback').style.display='flex'">
                        <div class="logo-masar-inner" id="masarFallback" style="display:none">
                            مسار<br><span style="font-size:.5rem;letter-spacing:.1em;opacity:.8">MASAR</span>
                        </div>
                    </div>
                </div> -->

                <div class="sys-name">
                    <h1>مسار MASAR</h1>
                    <p>نظام إدارة المعاملات المالية</p>
                </div>
            </div>

            <!-- بطاقة الموظف -->
            <div class="emp-card" id="employeeCard">
                <div class="emp-avatar" id="empAvatar">م</div>
                <div class="emp-info">
                    <div class="emp-name" id="empName"></div>
                    <div class="emp-role" id="empRole"></div>
                </div>
            </div>

            <!-- رسائل -->
            <div class="message" id="message"></div>

            <!-- النموذج -->
            <form id="loginForm" onsubmit="return false">
                <div class="form-group">
                    <label class="form-label" for="employeeNumber">الرقم الوظيفي</label>
                    <div class="input-wrap">
                        <input type="text" id="employeeNumber" class="form-input" placeholder="أدخل رقمك الوظيفي"
                            autocomplete="username" inputmode="text" required>

                    </div>
                </div>

                <div class="form-group" id="passwordGroup" style="display:none">
                    <label class="form-label" for="password">كلمة المرور</label>
                    <div class="input-wrap">
                        <input type="password" id="password" class="form-input" placeholder="أدخل كلمة المرور"
                            autocomplete="current-password">

                        <button type="button" class="pw-toggle" onclick="togglePw()" title="إظهار/إخفاء كلمة المرور">
                            <svg id="eyeIcon" width="35" height="35" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" stroke-width="2">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                <circle cx="12" cy="12" r="3" />
                            </svg>
                        </button>
                    </div>
                </div>

                <button class="btn-login" id="submitBtn" onclick="handleSubmit()">
                    <svg class="btn-loader spin" id="btnLoader" width="18" height="18" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" stroke-width="2.5">
                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                    <span id="btnText">التالي</span>
                </button>
            </form>

            <div class="register-link">
                أول مرة؟ <a href="register.php">سجّل حسابك</a>
            </div>
            <div class="login-footer">
                <strong>مسار MASAR</strong> · نظام إدارة المعاملات
            </div>
        </div>
    </div>

    <script>
    let step = 'check';

    /* ════════════════════════════════════════════════
       تطبيق الثيم الكامل من localStorage
    ════════════════════════════════════════════════ */
    function applyFullTheme() {
        const root = document.documentElement;
        const MAP = {
            theme_primary: '--primary',
            theme_primary_dark: '--primary-dark',
            theme_accent: '--accent',
            theme_brand_dark: '--brand-dark',
            theme_bg_primary: '--bg',
            theme_bg_card: '--bg-card',
            theme_bg_surface: '--bg-surface',
            theme_bg_secondary: '--bg-secondary',
            theme_text_primary: '--text-primary',
            theme_text_secondary: '--text-secondary',
            theme_text_muted: '--text-muted',
            theme_border: '--border',
        };
        try {
            for (const [k, v] of Object.entries(MAP)) {
                const val = localStorage.getItem(k);
                if (val) root.style.setProperty(v, val);
            }
            // primary-subtle
            const p = localStorage.getItem('theme_primary');
            if (p) {
                const r = parseInt(p.slice(1, 3), 16),
                    g = parseInt(p.slice(3, 5), 16),
                    b = parseInt(p.slice(5, 7), 16);
                root.style.setProperty('--primary-subtle', `rgba(${r},${g},${b},.12)`);
            }
            // accent-dark مشتق
            const a = localStorage.getItem('theme_accent');
            if (a) root.style.setProperty('--accent-dark', a);
        } catch (e) {}
    }

    function loadSavedTheme() {
        const saved = localStorage.getItem('theme');
        const html = document.documentElement;
        if (saved === 'dark') {
            html.setAttribute('data-theme', 'dark');
            document.getElementById('themeBtn').textContent = '☀️';
        } else {
            html.setAttribute('data-theme', 'light');
        }
        applyFullTheme();
    }

    function toggleTheme() {
        const html = document.documentElement;
        const btn = document.getElementById('themeBtn');
        if (html.getAttribute('data-theme') === 'light') {
            html.setAttribute('data-theme', 'dark');
            btn.textContent = '☀️';
            localStorage.setItem('theme', 'dark');
        } else {
            html.setAttribute('data-theme', 'light');
            btn.textContent = '🌙';
            localStorage.setItem('theme', 'light');
        }
    }

    loadSavedTheme();

    /* ── إظهار/إخفاء كلمة المرور ── */
    function togglePw() {
        const inp = document.getElementById('password');
        const icon = document.getElementById('eyeIcon');
        if (inp.type === 'password') {
            inp.type = 'text';
            icon.innerHTML =
                `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>`;
        } else {
            inp.type = 'password';
            icon.innerHTML = `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`;
        }
    }

    /* ── أسماء الأدوار ── */
    function getRoleName(role) {
        const map = {
            admin: 'مدير النظام',
            manager: 'مدير',
            employee: 'موظف',
            receiving: 'استلام',
            budget: 'موازنة',
            payment: 'دفع',
            invoice: 'فواتير',
            sector_head: 'رئيس قطاع',
            division_manager: 'مدير قسم',
            employee_l1: 'موظف',
            ceo: 'الرئيس التنفيذي'
        };
        return map[role] || role || 'موظف';
    }

    /* ── رسائل ── */
    function showMsg(text, type) {
        const el = document.getElementById('message');
        const icons = {
            error: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
            success: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
            info: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>`
        };
        el.innerHTML = (icons[type] || '') + `<span>${text}</span>`;
        el.className = `message show ${type}`;
    }

    function hideMsg() {
        document.getElementById('message').className = 'message';
    }

    /* ── loading ── */
    function setLoading(on) {
        const btn = document.getElementById('submitBtn');
        const loader = document.getElementById('btnLoader');
        btn.disabled = on;
        loader.style.display = on ? 'block' : 'none';
    }

    /* ── المنطق الرئيسي ── */
    async function handleSubmit() {
        const empNumber = document.getElementById('employeeNumber').value.trim();
        const password = document.getElementById('password').value;
        if (!empNumber) {
            showMsg('الرجاء إدخال الرقم الوظيفي', 'error');
            return;
        }
        setLoading(true);
        hideMsg();
        try {
            if (step === 'check') {
                const res = await fetch('api/auth.php?action=check', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        employee_number: empNumber
                    })
                });
                const data = await res.json();
                if (data.success) {
                    document.getElementById('empAvatar').textContent = data.data.name.charAt(0);
                    document.getElementById('empName').textContent = data.data.name;
                    document.getElementById('empRole').textContent = getRoleName(data.data.role);
                    document.getElementById('employeeCard').classList.add('show');
                    if (data.data.is_registered == 1) {
                        step = 'login';
                        document.getElementById('passwordGroup').style.display = 'block';
                        document.getElementById('password').focus();
                        document.getElementById('employeeNumber').readOnly = true;
                        document.getElementById('employeeNumber').classList.add('locked');
                        document.getElementById('btnText').textContent = 'تسجيل الدخول';
                        hideMsg();
                    } else {
                        showMsg('مرحباً ' + data.data.name + '! جاري توجيهك للتسجيل...', 'info');
                        setTimeout(() => {
                            window.location.href = 'register.php?emp=' + encodeURIComponent(empNumber);
                        }, 1500);
                        return;
                    }
                } else {
                    showMsg(data.message || 'الرقم الوظيفي غير موجود', 'error');
                }
            } else if (step === 'login') {
                if (!password) {
                    showMsg('الرجاء إدخال كلمة المرور', 'error');
                    setLoading(false);
                    return;
                }
                const res = await fetch('api/auth.php?action=login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        employee_number: empNumber,
                        password
                    })
                });
                const data = await res.json();
                if (data.success) {
                    showMsg('تم تسجيل الدخول بنجاح!', 'success');
                    setTimeout(() => {
                        window.location.href = 'splash.php';
                    }, 900);
                    return;
                } else {
                    showMsg(data.message || 'كلمة المرور غير صحيحة', 'error');
                }
            }
        } catch (err) {
            showMsg('حدث خطأ في الاتصال بالخادم', 'error');
        }
        setLoading(false);
    }

    document.addEventListener('keydown', e => {
        if (e.key === 'Enter') handleSubmit();
    });
    </script>
</body>

</html>