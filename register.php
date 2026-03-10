<?php
/**
 * صفحة التسجيل لمرة واحدة
 * One-time Registration Page
 */
session_start();

if (isset($_SESSION['user_id'])) {
    header('Location: index.php');
    exit;
}

$empNumber = $_GET['emp'] ?? '';
if (empty($empNumber)) {
    header('Location: login.php');
    exit;
}
?>
<!DOCTYPE html>
<html lang="ar" dir="rtl" data-theme="light">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>إنشاء كلمة المرور | نظام إدارة معاملات القطاع المالي</title>
    <link rel="icon" href="images/logo.png">
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
        --accent-orange: #ffa94d;
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
        --accent-orange: #fd7e14;
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
    .register-container {
        width: 100%;
        max-width: 460px;
        padding: 20px;
    }

    .register-card {
        background: var(--bg-card);
        border: 1px solid var(--border-color);
        border-radius: 24px;
        padding: 2.5rem;
        box-shadow: 0 10px 40px -10px rgba(0, 0, 0, 0.1);
        transition: all 0.3s ease;
    }

    [data-theme="light"] .register-card {
        box-shadow: 0 10px 40px -10px rgba(0, 0, 0, 0.08);
    }

    /* الشعار */
    .logo {
        text-align: center;
        margin-bottom: 2rem;
    }

    .logo-icon {
        width: 80px;
        height: 80px;
        background: var(--btn-primary-bg);
        border-radius: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 2.5rem;
        margin: 0 auto 1rem;
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

    /* حالة التحميل */
    .loading-state {
        text-align: center;
        padding: 2rem;
    }

    .loading-spinner {
        width: 50px;
        height: 50px;
        border: 3px solid var(--border-color);
        border-top-color: var(--btn-primary-bg);
        border-radius: 50%;
        margin: 0 auto 1rem;
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }

    .loading-state p {
        color: var(--text-muted);
    }

    /* حالة الخطأ */
    .error-state {
        text-align: center;
        padding: 2rem;
    }

    .error-state svg {
        color: var(--accent-red);
        margin-bottom: 1rem;
    }

    .error-state h3 {
        color: var(--text-primary);
        margin-bottom: 0.5rem;
    }

    .error-state p {
        color: var(--text-muted);
        margin-bottom: 1.5rem;
    }

    /* بطاقة الموظف */
    .employee-card {
        display: flex;
        align-items: center;
        gap: 1rem;
        background: rgba(64, 192, 87, 0.1);
        border: 1px solid rgba(64, 192, 87, 0.3);
        border-radius: 12px;
        padding: 1rem;
        margin-bottom: 1.5rem;
    }

    :root .employee-card {
        background: rgba(105, 219, 124, 0.1);
        border-color: rgba(105, 219, 124, 0.3);
    }

    .emp-avatar {
        width: 55px;
        height: 55px;
        background: var(--btn-primary-bg);
        border-radius: 14px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.5rem;
        font-weight: 700;
        color: var(--btn-primary-text);
        flex-shrink: 0;
    }

    .emp-info {
        flex: 1;
    }

    .emp-info h4 {
        color: var(--text-primary);
        font-size: 1.1rem;
        margin-bottom: 0.25rem;
    }

    .emp-info p {
        color: var(--text-muted);
        font-size: 0.85rem;
        margin: 0;
    }

    .emp-info .emp-number {
        color: var(--accent-blue);
        font-family: monospace;
        font-size: 0.9rem;
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
        padding-left: 3rem;
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

    /* مؤشر قوة كلمة المرور */
    .password-strength {
        margin-top: 0.75rem;
    }

    .strength-bar {
        height: 6px;
        background: var(--border-color);
        border-radius: 3px;
        overflow: hidden;
        margin-bottom: 0.5rem;
    }

    .strength-fill {
        height: 100%;
        border-radius: 3px;
        transition: all 0.3s ease;
    }

    .strength-text {
        font-size: 0.8rem;
        text-align: left;
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
        text-decoration: none;
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

    .btn-secondary {
        background: var(--bg-surface);
        color: var(--text-primary);
        border: 1px solid var(--border-color);
    }

    .btn-secondary:hover {
        background: var(--bg-secondary);
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

    /* رابط العودة */
    .back-link {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        margin-top: 1.5rem;
        color: var(--text-muted);
        text-decoration: none;
        font-size: 0.9rem;
        transition: color 0.3s ease;
    }

    .back-link:hover {
        color: var(--text-primary);
    }

    /* الميزات */
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
        .register-card {
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

    <div class="register-container">
        <div class="register-card">
            <div class="logo">
                <div class="logo-icon">🔐</div>
                <h1>إنشاء كلمة المرور</h1>
                <p>أنشئ كلمة مرور لحسابك</p>
            </div>

            <!-- حالة التحميل -->
            <div id="loadingState" class="loading-state">
                <div class="loading-spinner"></div>
                <p>جاري التحقق من البيانات...</p>
            </div>

            <!-- حالة الخطأ -->
            <div id="errorState" class="error-state" style="display: none;">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                <h3>الرقم الوظيفي غير موجود</h3>
                <p>تأكد من الرقم أو تواصل مع الإدارة</p>
                <a href="login.php" class="btn btn-secondary">العودة لتسجيل الدخول</a>
            </div>

            <!-- نموذج التسجيل -->
            <div id="registerContent" style="display: none;">
                <div class="employee-card" id="employeeCard">
                    <div class="emp-avatar" id="empAvatar">م</div>
                    <div class="emp-info">
                        <h4 id="empName">الاسم</h4>
                        <p class="emp-number" id="empNumber"><?= htmlspecialchars($empNumber) ?></p>
                        <p id="empRole">القسم</p>
                    </div>
                </div>

                <div class="message" id="message"></div>

                <form id="registerForm">
                    <div class="form-group">
                        <label class="form-label">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                stroke-width="2">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                            كلمة المرور الجديدة
                        </label>
                        <div class="input-wrapper">
                            <input type="password" class="form-input" id="password" placeholder="أدخل كلمة المرور"
                                required minlength="6">
                            <button type="button" class="password-toggle" onclick="togglePassword('password')">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                    stroke-width="2">
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                    <circle cx="12" cy="12" r="3" />
                                </svg>
                            </button>
                        </div>
                        <div class="password-strength" id="passwordStrength"></div>
                    </div>

                    <div class="form-group">
                        <label class="form-label">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                stroke-width="2">
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                            </svg>
                            تأكيد كلمة المرور
                        </label>
                        <div class="input-wrapper">
                            <input type="password" class="form-input" id="confirmPassword"
                                placeholder="أعد إدخال كلمة المرور" required>
                            <button type="button" class="password-toggle" onclick="togglePassword('confirmPassword')">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                    stroke-width="2">
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                    <circle cx="12" cy="12" r="3" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    <button type="submit" class="btn btn-primary" id="submitBtn">
                        <span id="btnText">تسجيل وتفعيل الحساب</span>
                        <div class="btn-loader" id="btnLoader"></div>
                    </button>
                </form>

                <a href="login.php" class="back-link">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M19 12H5M12 19l-7-7 7-7" />
                    </svg>
                    العودة لتسجيل الدخول
                </a>
            </div>
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
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                تسجيل لمرة واحدة
            </div>
        </div>
    </div>

    <script>
    const empNumber = '<?= htmlspecialchars($empNumber) ?>';

    // تحميل الوضع المحفوظ
    function loadSavedTheme() {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') {
            document.documentElement.removeAttribute('data-theme');
        } else {
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

    document.addEventListener('DOMContentLoaded', async function() {
        try {
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

            document.getElementById('loadingState').style.display = 'none';

            if (data.success) {
                if (data.data.is_registered == 1) {
                    window.location.href = 'login.php';
                    return;
                }

                document.getElementById('empAvatar').textContent = data.data.name.charAt(0);
                document.getElementById('empName').textContent = data.data.name;
                document.getElementById('empRole').textContent = getRoleName(data.data.role);
                document.getElementById('registerContent').style.display = 'block';
            } else {
                document.getElementById('errorState').style.display = 'block';
            }
        } catch (e) {
            document.getElementById('loadingState').innerHTML =
                '<p style="color: var(--accent-red);">خطأ في الاتصال</p>';
        }
    });

    document.getElementById('registerForm').addEventListener('submit', async function(e) {
        e.preventDefault();

        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        const btn = document.getElementById('submitBtn');
        const loader = document.getElementById('btnLoader');

        if (password.length < 6) {
            showMessage('كلمة المرور يجب أن تكون 6 أحرف على الأقل', 'error');
            return;
        }
        if (password !== confirmPassword) {
            showMessage('كلمتا المرور غير متطابقتين', 'error');
            return;
        }

        btn.disabled = true;
        loader.style.display = 'block';

        try {
            const res = await fetch('api/auth.php?action=register', {
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
                showMessage('تم التسجيل بنجاح! جاري التوجيه...', 'success');
                setTimeout(() => {
                    window.location.href = 'index.php';
                }, 1500);
            } else {
                showMessage(data.message || 'حدث خطأ', 'error');
                btn.disabled = false;
                loader.style.display = 'none';
            }
        } catch (e) {
            showMessage('خطأ في الاتصال', 'error');
            btn.disabled = false;
            loader.style.display = 'none';
        }
    });

    document.getElementById('password').addEventListener('input', function() {
        const password = this.value;
        const strengthDiv = document.getElementById('passwordStrength');

        let strength = 0;
        if (password.length >= 6) strength++;
        if (password.length >= 8) strength++;
        if (/[A-Z]/.test(password)) strength++;
        if (/[0-9]/.test(password)) strength++;
        if (/[^A-Za-z0-9]/.test(password)) strength++;

        const levels = ['ضعيفة جداً', 'ضعيفة', 'متوسطة', 'قوية', 'قوية جداً'];
        const colors = ['#fa5252', '#fd7e14', '#fab005', '#40c057', '#2b8a3e'];

        if (password.length > 0) {
            const level = Math.min(strength, 5) - 1;
            strengthDiv.innerHTML = `
                <div class="strength-bar"><div class="strength-fill" style="width: ${strength * 20}%; background: ${colors[level >= 0 ? level : 0]};"></div></div>
                <div class="strength-text"><span style="color: ${colors[level >= 0 ? level : 0]};">${levels[level >= 0 ? level : 0]}</span></div>
            `;
        } else {
            strengthDiv.innerHTML = '';
        }
    });

    function showMessage(text, type) {
        const msg = document.getElementById('message');
        const icons = {
            error: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
            success: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
        };
        msg.innerHTML = icons[type] + '<span>' + text + '</span>';
        msg.className = 'message show ' + type;
    }

    function togglePassword(id) {
        const input = document.getElementById(id);
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