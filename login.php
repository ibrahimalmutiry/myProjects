<?php
/**
 * صفحة تسجيل الدخول
 * Login Page
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
    <title>تسجيل الدخول | نظام إدارة معاملات القطاع المالي</title>
    <link rel="icon"
        href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚡</text></svg>">
    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@300;400;500;600;700&display=swap"
        rel="stylesheet">
    <style>
    * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
    }

    /* 🌙 الوضع الليلي */
    :root {
        --bg-primary: #222831;
        --bg-secondary: #393E46;
        --bg-surface: #1B2026;
        --bg-card: #2d343c;
        --text-primary: #DFD0B8;
        --text-secondary: #948979;
        --text-muted: #7A6F63;
        --border-color: #4A4F57;
        --btn-primary-bg: #948979;
        --btn-primary-text: #222831;
        --accent-green: #69db7c;
        --accent-red: #ff6b6b;
        --accent-blue: #4dabf7;
    }

    /* ☀️ الوضع النهاري (الافتراضي) */
    [data-theme="light"] {
        --bg-primary: #F5F1EB;
        --bg-secondary: #DFD0B8;
        --bg-surface: #E6DED3;
        --bg-card: #FFFFFF;
        --text-primary: #222831;
        --text-secondary: #393E46;
        --text-muted: #948979;
        --border-color: #CFC6B8;
        --btn-primary-bg: #222831;
        --btn-primary-text: #DFD0B8;
        --accent-green: #40c057;
        --accent-red: #fa5252;
        --accent-blue: #228be6;
    }

    body {
        font-family: 'Noto Sans Arabic', sans-serif;
        background: var(--bg-primary);
        color: var(--text-primary);
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.3s ease, color 0.3s ease;
    }

    /* البطاقة الرئيسية */
    .login-container {
        width: 100%;
        max-width: 440px;
        padding: 20px;
    }

    .login-card {
        background: var(--bg-card);
        border: 1px solid var(--border-color);
        border-radius: 24px;
        padding: 2.5rem;
        box-shadow: 0 10px 40px -10px rgba(0, 0, 0, 0.1);
        transition: all 0.3s ease;
    }

    [data-theme="light"] .login-card {
        box-shadow: 0 10px 40px -10px rgba(0, 0, 0, 0.08);
    }

    /* الشعار */
    .logo {
        text-align: center;
        margin-bottom: 2rem;
    }

    .logo-icon {
        width: 60px;
        height: 60px;
        background: var(--btn-primary-bg);
        border-radius: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 2.5rem;
        margin: 0 auto;
        color: var(--btn-primary-text);
        box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.2);
    }

    .logo h1 {
        font-size: 1.4rem;
        font-weight: 700;
        color: var(--text-primary);
        margin-bottom: 0.5rem;
    }

    .logo p {
        color: var(--text-muted);
        font-size: 0.9rem;
    }

    /* زر تبديل الوضع */
    .theme-toggle {
        position: fixed;
        top: 20px;
        left: 20px;
        width: 44px;
        height: 44px;
        border-radius: 12px;
        background: var(--bg-card);
        border: 1px solid var(--border-color);
        color: var(--text-secondary);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.3s ease;
        z-index: 100;
    }

    .theme-toggle:hover {
        background: var(--bg-surface);
        color: var(--text-primary);
    }

    .theme-toggle .sun-icon {
        display: block;
    }

    .theme-toggle .moon-icon {
        display: none;
    }

    :root .theme-toggle .sun-icon {
        display: none;
    }

    :root .theme-toggle .moon-icon {
        display: block;
    }

    [data-theme="light"] .theme-toggle .sun-icon {
        display: block;
    }

    [data-theme="light"] .theme-toggle .moon-icon {
        display: none;
    }

    /* بطاقة الموظف */
    .employee-card {
        display: none;
        align-items: center;
        gap: 1rem;
        background: rgba(64, 192, 87, 0.1);
        border: 1px solid rgba(64, 192, 87, 0.3);
        border-radius: 12px;
        padding: 0.5rem;
        margin-bottom: 1.5rem;
        animation: slideIn 0.3s ease;
    }

    :root .employee-card {
        background: rgba(105, 219, 124, 0.1);
        border-color: rgba(105, 219, 124, 0.3);
    }

    .employee-card.show {
        display: flex;
    }

    @keyframes slideIn {
        from {
            opacity: 0;
            transform: translateY(-10px);
        }

        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    .emp-avatar {
        width: 50px;
        height: 50px;
        background: var(--btn-primary-bg);
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.25rem;
        font-weight: 700;
        color: var(--btn-primary-text);
        flex-shrink: 0;
    }

    .emp-info h4 {
        color: var(--text-primary);
        font-size: 1rem;
        margin-bottom: 0.25rem;
    }

    .emp-info p {
        color: var(--text-muted);
        font-size: 0.8rem;
        margin: 0;
    }

    /* رسائل التنبيه */
    .message {
        display: none;
        align-items: center;
        gap: 0.75rem;
        padding: 1rem;
        border-radius: 12px;
        margin-bottom: 1.5rem;
        font-size: 0.9rem;
        animation: slideIn 0.3s ease;
    }

    .message.show {
        display: flex;
    }

    .message.error {
        background: rgba(250, 82, 82, 0.1);
        border: 1px solid rgba(250, 82, 82, 0.3);
        color: var(--accent-red);
    }

    .message.success {
        background: rgba(64, 192, 87, 0.1);
        border: 1px solid rgba(64, 192, 87, 0.3);
        color: var(--accent-green);
    }

    .message.info {
        background: rgba(34, 139, 230, 0.1);
        border: 1px solid rgba(34, 139, 230, 0.3);
        color: var(--accent-blue);
    }

    /* النموذج */
    .form-group {
        margin-bottom: 1.5rem;
    }

    .form-label {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        color: var(--text-secondary);
        font-size: 0.9rem;
        margin-bottom: 0.75rem;
        font-weight: 500;
    }

    .input-wrapper {
        position: relative;
    }

    .form-input {
        width: 100%;
        padding: 1rem 1.25rem;
        background: var(--bg-surface);
        border: 2px solid var(--border-color);
        border-radius: 12px;
        color: var(--text-primary);
        font-size: 1rem;
        font-family: inherit;
        transition: all 0.3s ease;
    }

    .form-input::placeholder {
        color: var(--text-muted);
    }

    .form-input:focus {
        outline: none;
        border-color: var(--btn-primary-bg);
        background: var(--bg-card);
    }

    .form-input.locked {
        background: var(--bg-surface);
        opacity: 0.7;
    }

    .password-toggle {
        position: absolute;
        left: 12px;
        top: 50%;
        transform: translateY(-50%);
        background: none;
        border: none;
        color: var(--text-muted);
        cursor: pointer;
        padding: 5px;
        transition: color 0.3s ease;
    }

    .password-toggle:hover {
        color: var(--text-primary);
    }

    /* الأزرار */
    .btn {
        width: 100%;
        padding: 1rem 2rem;
        border-radius: 12px;
        border: none;
        font-family: inherit;
        font-size: 1rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.75rem;
    }

    .btn-primary {
        background: var(--btn-primary-bg);
        color: var(--btn-primary-text);
    }

    .btn-primary:hover {
        opacity: 0.9;
        transform: translateY(-2px);
        box-shadow: 0 10px 20px -10px rgba(0, 0, 0, 0.3);
    }

    .btn-primary:disabled {
        opacity: 0.6;
        cursor: not-allowed;
        transform: none;
    }

    .btn-loader {
        display: none;
        width: 20px;
        height: 20px;
        border: 2px solid transparent;
        border-top-color: currentColor;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }

    /* التذييل */
    .login-footer {
        text-align: center;
        margin-top: 1.5rem;
        color: var(--text-muted);
        font-size: 0.85rem;
    }

    .features {
        display: flex;
        justify-content: center;
        gap: 2rem;
        margin-top: 1.5rem;
        color: var(--text-muted);
        font-size: 0.8rem;
    }

    .feature {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .feature svg {
        color: var(--accent-green);
    }

    /* Responsive */
    @media (max-width: 480px) {
        .login-card {
            padding: 2rem 1.5rem;
        }

        .features {
            flex-direction: column;
            gap: 0.75rem;
            align-items: center;
        }

        .theme-toggle {
            top: 10px;
            left: 10px;
        }
    }
    </style>
</head>

<body>
    <!-- زر تبديل الوضع -->
    <button class="theme-toggle" onclick="toggleTheme()" title="تبديل الوضع">
        <svg class="sun-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2">
            <circle cx="12" cy="12" r="5"></circle>
            <line x1="12" y1="1" x2="12" y2="3"></line>
            <line x1="12" y1="21" x2="12" y2="23"></line>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
            <line x1="1" y1="12" x2="3" y2="12"></line>
            <line x1="21" y1="12" x2="23" y2="12"></line>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
        </svg>
        <svg class="moon-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
        </svg>
    </button>

    <div class="login-container">
        <div class="login-card">
            <div class="logo">
                <div class="logo-icon">⚡</div>
                <h1>نظام إدارة معاملات القطاع المالي</h1>
                <p>سجّل دخولك للمتابعة</p>
            </div>

            <div class="employee-card" id="employeeCard">
                <div class="emp-avatar" id="empAvatar">م</div>
                <div class="emp-info">
                    <h4 id="empName">الاسم</h4>
                    <p id="empRole">القسم</p>

                </div>
            </div>

            <div class="message" id="message"></div>

            <form id="loginForm">
                <div class="form-group">
                    <label class="form-label">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            stroke-width="2">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                            <circle cx="12" cy="7" r="4"></circle>
                        </svg>
                        الرقم الوظيفي
                    </label>
                    <input type="text" class="form-input" id="employeeNumber" placeholder="أدخل رقمك الوظيفي"
                        autocomplete="off" required>
                </div>

                <div class="form-group" id="passwordGroup" style="display: none;">
                    <label class="form-label">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            stroke-width="2">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                        </svg>
                        كلمة المرور
                    </label>
                    <div class="input-wrapper">
                        <input type="password" class="form-input" id="password" placeholder="أدخل كلمة المرور">
                        <button type="button" class="password-toggle" onclick="togglePassword()">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                stroke-width="2" id="eyeIcon">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                <circle cx="12" cy="12" r="3"></circle>
                            </svg>
                        </button>
                    </div>
                </div>

                <button type="submit" class="btn btn-primary" id="submitBtn">
                    <span id="btnText">التحقق من الرقم الوظيفي</span>
                    <div class="btn-loader" id="btnLoader"></div>
                </button>
            </form>

            <div class="login-footer">أول مرة؟ سيتم توجيهك لإنشاء كلمة المرور</div>
        </div>

        <div class="features">
            <div class="feature">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                </svg>
                آمن ومشفر
            </div>
            <div class="feature">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                متاح 24/7
            </div>
        </div>
    </div>

    <script>
    let step = 'check';

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

    // تبديل الوضع
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

    // تحميل الوضع عند بدء الصفحة
    loadSavedTheme();

    document.getElementById('loginForm').addEventListener('submit', async function(e) {
        e.preventDefault();

        const empNumber = document.getElementById('employeeNumber').value.trim();
        const password = document.getElementById('password').value;
        const btn = document.getElementById('submitBtn');
        const loader = document.getElementById('btnLoader');
        const btnText = document.getElementById('btnText');

        if (!empNumber) {
            showMessage('الرجاء إدخال الرقم الوظيفي', 'error');
            return;
        }

        btn.disabled = true;
        loader.style.display = 'block';

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
                        btnText.textContent = 'تسجيل الدخول';
                        hideMessage();
                    } else {
                        showMessage('مرحباً ' + data.data.name + '! جاري التوجيه للتسجيل...', 'info');
                        setTimeout(() => {
                            window.location.href = 'register.php?emp=' + encodeURIComponent(
                                empNumber);
                        }, 1500);
                        return;
                    }
                } else {
                    showMessage(data.message || 'الرقم الوظيفي غير موجود', 'error');
                }
            } else if (step === 'login') {
                if (!password) {
                    showMessage('الرجاء إدخال كلمة المرور', 'error');
                    btn.disabled = false;
                    loader.style.display = 'none';
                    return;
                }

                const res = await fetch('api/auth.php?action=login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        employee_number: empNumber,
                        password: password
                    })
                });
                const data = await res.json();

                if (data.success) {
                    showMessage('تم تسجيل الدخول بنجاح!', 'success');
                    setTimeout(() => {
                        window.location.href = 'index.php';
                    }, 1000);
                    return;
                } else {
                    showMessage(data.message || 'كلمة المرور غير صحيحة', 'error');
                }
            }
        } catch (e) {
            showMessage('حدث خطأ في الاتصال', 'error');
        }

        btn.disabled = false;
        loader.style.display = 'none';
    });

    function showMessage(text, type) {
        const msg = document.getElementById('message');
        const icons = {
            error: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
            success: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
            info: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>'
        };
        msg.innerHTML = icons[type] + '<span>' + text + '</span>';
        msg.className = 'message show ' + type;
    }

    function hideMessage() {
        document.getElementById('message').className = 'message';
    }

    function togglePassword() {
        const input = document.getElementById('password');
        input.type = input.type === 'password' ? 'text' : 'password';
    }

    function getRoleName(role) {
        return {
            'admin': 'مدير النظام',
            'receiver': 'قسم الاستلام',
            'budget': 'قسم الموازنة',
            'payment': 'قسم الدفع',
            'invoice': 'قسم الفوترة'
        } [role] || role;
    }
    </script>
</body>

</html>