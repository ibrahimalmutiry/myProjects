<?php
session_start();
if (!isset($_SESSION['user_id'])) {
    header('Location: login.php');
    exit;
}
require_once __DIR__ . '/includes/functions.php';
$userName  = $_SESSION['user_name'] ?? 'المستخدم';
$userRole  = $_SESSION['user_role'] ?? '';
$roles = [
    'admin'      => 'مدير النظام',
    'ceo'        => 'الرئيس التنفيذي',
    'manager'    => 'مدير',
    'accountant' => 'محاسب',
    'employee'   => 'موظف',
    'viewer'     => 'مستعرض',
];
$roleLabel = $roles[$userRole] ?? $userRole;
?>
<!DOCTYPE html>
<html lang="ar" dir="rtl">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>مسار | جارٍ التحميل...</title>
    <link rel="icon"
        href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='20' fill='%233F5950'/><text y='.85em' font-size='60' x='50%' text-anchor='middle' fill='white'>م</text></svg>">
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;600;700;800;900&display=swap"
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
            theme_text_primary: '--text-primary',
            theme_text_secondary: '--text-secondary',
            theme_text_muted: '--text-muted',
            theme_border: '--border',
        };
        var root = document.documentElement;
        var isDark = false;
        try {
            // اكتشاف ما إذا كان الثيم فاتح أم داكن من bg_primary
            var bg = localStorage.getItem('theme_bg_primary');
            if (bg) {
                // حساب luminance تقريبي
                var r = parseInt(bg.slice(1, 3), 16),
                    g = parseInt(bg.slice(3, 5), 16),
                    b = parseInt(bg.slice(5, 7), 16);
                var lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
                isDark = lum < 0.4;
            }
            for (var k in MAP) {
                var v = localStorage.getItem(k);
                if (v) root.style.setProperty(MAP[k], v);
            }
            var p = localStorage.getItem('theme_primary');
            if (p) {
                var pr = parseInt(p.slice(1, 3), 16),
                    pg = parseInt(p.slice(3, 5), 16),
                    pb = parseInt(p.slice(5, 7), 16);
                root.style.setProperty('--primary-subtle', 'rgba(' + pr + ',' + pg + ',' + pb + ',.15)');
                // تخزين primary كـ RGB منفصل لاستخدامه في Canvas
                root.style.setProperty('--primary-r', pr);
                root.style.setProperty('--primary-g', pg);
                root.style.setProperty('--primary-b', pb);
            }
        } catch (e) {}
        // تخزين isDark
        window._splashDark = isDark;
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
        --primary: #3F5950;
        --primary-dark: #2e4139;
        --primary-light: #4f6e63;
        --primary-subtle: rgba(63, 89, 80, .15);
        --accent: #F26F63;
        --bg: #18231f;
        --bg-card: #243029;
        --border: #3a4f47;
        --text-primary: #ECE8E3;
        --text-secondary: #b5b0aa;
        --text-muted: #7a7570;
    }

    html,
    body {
        width: 100%;
        height: 100%;
        overflow: hidden;
        font-family: 'Cairo', sans-serif;
        background: var(--bg);
        color: var(--text-primary);
    }

    #bgCanvas {
        position: fixed;
        inset: 0;
        width: 100%;
        height: 100%;
        z-index: 0;
    }

    /* ── المحتوى ── */
    .splash {
        position: relative;
        z-index: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100vh;
        gap: 1.6rem;
        text-align: center;
        padding: 2rem;
    }

    /* ── الشعارات ── */
    .logos-row {
        display: flex;
        align-items: center;
        gap: 1.4rem;
        animation: fadeUp .5s .05s ease both;
    }

    .logo-card {
        width: 92px;
        height: 92px;
        border-radius: 22px;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        overflow: hidden;
        flex-shrink: 0;
    }

    /* شعار المنظمة — خلفية بيضاء دائماً بغض النظر عن الثيم */
    .logo-card.org {
        background: #ffffff !important;
        border: 1.5px solid rgba(0, 0, 0, .1);
        box-shadow: 0 8px 32px rgba(0, 0, 0, .25), inset 0 1px 0 rgba(255, 255, 255, .9);
    }

    /* شعار مسار — خلفية primary */
    .logo-card.masar {
        background: linear-gradient(145deg, var(--primary-light, #4f6e63) 0%, var(--primary-dark, #2e4139) 100%);
        border: 1px solid rgba(255, 255, 255, .1);
        box-shadow: 0 8px 32px rgba(0, 0, 0, .3), inset 0 1px 0 rgba(255, 255, 255, .1);
    }

    /* بريق داخلي للبطاقتين */
    .logo-card::before {
        content: '';
        position: absolute;
        top: -35%;
        right: -25%;
        width: 65%;
        height: 65%;
        background: radial-gradient(circle, rgba(255, 255, 255, .18) 0%, transparent 70%);
        border-radius: 50%;
        pointer-events: none;
    }

    /* لا بريق على البطاقة البيضاء */
    .logo-card.org::before {
        display: none;
    }

    .logo-card img {
        width: 66px;
        height: 66px;
        object-fit: contain;
        position: relative;
        z-index: 1;
    }

    /* شعار المنظمة إذا لم تكن الصورة — حرف داكن */
    .org-fallback {
        font-size: 2.4rem;
        font-weight: 900;
        color: #334155;
        position: relative;
        z-index: 1;
        display: none;
    }

    .logo-masar {
        display: flex;
        flex-direction: column;
        align-items: center;
        line-height: 1;
        position: relative;
        z-index: 1;
        gap: 2px;
    }

    .logo-masar .ar {
        font-size: 1.9rem;
        font-weight: 900;
        color: #fff;
        letter-spacing: -.02em;
    }

    .logo-masar .en {
        font-size: .52rem;
        font-weight: 700;
        color: rgba(255, 255, 255, .55);
        letter-spacing: .2em;
        text-transform: uppercase;
    }

    .logos-sep {
        width: 1px;
        height: 62px;
        background: linear-gradient(to bottom, transparent, var(--border, #3a4f47) 30%, var(--border, #3a4f47) 70%, transparent);
        flex-shrink: 0;
    }

    /* ── الترحيب ── */
    .welcome {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: .4rem;
        animation: fadeUp .5s .15s ease both;
    }

    .brand-tag {
        font-size: .7rem;
        font-weight: 600;
        color: var(--text-muted);
        letter-spacing: .14em;
        text-transform: uppercase;
    }

    .welcome-title {
        font-size: 1.9rem;
        font-weight: 800;
        color: var(--text-primary);
        line-height: 1.25;
    }

    .welcome-title span {
        color: var(--accent);
    }

    .welcome-sub {
        font-size: .88rem;
        color: var(--text-secondary);
        font-weight: 400;
    }

    /* ── بادج الدور ── */
    .role-badge {
        animation: fadeUp .5s .25s ease both;
        display: inline-flex;
        align-items: center;
        gap: .45rem;
        padding: .3rem .85rem;
        border-radius: 99px;
        background: var(--primary-subtle, rgba(63, 89, 80, .15));
        border: 1px solid var(--border);
        font-size: .75rem;
        color: var(--text-secondary);
    }

    .role-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--accent);
        animation: pulse 1.8s ease-in-out infinite;
    }

    @keyframes pulse {

        0%,
        100% {
            transform: scale(1);
            opacity: 1
        }

        50% {
            transform: scale(1.7);
            opacity: .45
        }
    }

    /* ── شريط التحميل ── */
    .progress-wrap {
        animation: fadeUp .5s .35s ease both;
        width: 230px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: .6rem;
    }

    .progress-track {
        width: 100%;
        height: 2px;
        background: rgba(255, 255, 255, .07);
        border-radius: 99px;
        overflow: hidden;
    }

    .progress-bar {
        height: 100%;
        width: 0;
        border-radius: 99px;
        background: linear-gradient(90deg, var(--primary), var(--accent));
        animation: loadBar 2.5s cubic-bezier(.4, 0, .2, 1) forwards;
    }

    @keyframes loadBar {
        0% {
            width: 0%
        }

        35% {
            width: 52%
        }

        65% {
            width: 76%
        }

        88% {
            width: 91%
        }

        100% {
            width: 100%
        }
    }

    .progress-label {
        font-size: .7rem;
        color: var(--text-muted);
        display: flex;
        align-items: center;
        gap: .35rem;
    }

    .dots span {
        display: inline-block;
        animation: dotAnim 1.2s ease-in-out infinite;
    }

    .dots span:nth-child(2) {
        animation-delay: .18s
    }

    .dots span:nth-child(3) {
        animation-delay: .36s
    }

    @keyframes dotAnim {

        0%,
        80%,
        100% {
            opacity: .2;
            transform: translateY(0)
        }

        40% {
            opacity: 1;
            transform: translateY(-3px)
        }
    }

    @keyframes fadeUp {
        from {
            opacity: 0;
            transform: translateY(18px)
        }

        to {
            opacity: 1;
            transform: translateY(0)
        }
    }

    .splash-footer {
        position: fixed;
        bottom: 1.25rem;
        left: 50%;
        transform: translateX(-50%);
        font-size: .62rem;
        color: var(--text-muted);
        letter-spacing: .06em;
        z-index: 1;
    }
    </style>
</head>

<body>

    <canvas id="bgCanvas"></canvas>

    <div class="splash">

        <div class="logos-row">

            <!-- شعار المنظمة — خلفية بيضاء دائماً -->
            <!-- <div class="logo-card org">
                <img src="images/logo.png" alt="الشعار"
                    onerror="this.style.display='none';document.getElementById('orgFb').style.display='block'">
                <span class="org-fallback" id="orgFb">م</span>
            </div> -->

            <div class="logos-sep"></div>

            <!-- شعار مسار -->
            <div class="logo-card masar">
                <div class="logo-masar">
                    <span class="ar">مسار</span>
                    <span class="en">MASAR</span>
                </div>
            </div>

        </div>

        <div class="welcome">
            <div class="brand-tag">نظام مسار · MASAR System</div>
            <h1 class="welcome-title">
                أهلاً بك، <span><?php echo htmlspecialchars($userName); ?></span>
            </h1>
            <p class="welcome-sub">نظام إدارة العمليات المالية والإدارية</p>
        </div>

        <?php if ($roleLabel): ?>
        <div class="role-badge">
            <span class="role-dot"></span>
            <?php echo htmlspecialchars($roleLabel); ?>
        </div>
        <?php endif; ?>

        <div class="progress-wrap">
            <div class="progress-track">
                <div class="progress-bar"></div>
            </div>
            <div class="progress-label">
                جارٍ تحميل النظام
                <span class="dots"><span>.</span><span>.</span><span>.</span></span>
            </div>
        </div>

    </div>

    <div class="splash-footer">MASAR v2 &nbsp;·&nbsp; &copy; <?php echo date('Y'); ?></div>

    <script>
    /* ════════════════════════════════════════════════════
   ② تطبيق الثيم الكامل بعد DOM
════════════════════════════════════════════════════ */
    (function applyFullTheme() {
        const root = document.documentElement;
        const MAP = {
            theme_primary: '--primary',
            theme_primary_dark: '--primary-dark',
            theme_accent: '--accent',
            theme_bg_primary: '--bg',
            theme_bg_card: '--bg-card',
            theme_bg_surface: '--bg-surface',
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
            const p = localStorage.getItem('theme_primary');
            if (p) {
                const r = parseInt(p.slice(1, 3), 16),
                    g = parseInt(p.slice(3, 5), 16),
                    b = parseInt(p.slice(5, 7), 16);
                root.style.setProperty('--primary-subtle', `rgba(${r},${g},${b},.15)`);
                root.style.setProperty('--primary-light', shiftColor(p, 20));
            }
        } catch (e) {}
    })();

    function shiftColor(hex, amount) {
        const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + amount);
        const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + amount);
        const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + amount);
        return `rgb(${r},${g},${b})`;
    }

    /* ════════════════════════════════════════════════════
       Canvas — خلفية متحركة تتكيف مع ألوان الثيم
    ════════════════════════════════════════════════════ */
    (function() {
        const canvas = document.getElementById('bgCanvas');
        const ctx = canvas.getContext('2d');

        // قراءة ألوان الثيم من CSS
        function getThemeColors() {
            const s = getComputedStyle(document.documentElement);
            const p = s.getPropertyValue('--primary').trim() || '#3F5950';
            const a = s.getPropertyValue('--accent').trim() || '#F26F63';
            const r1 = parseInt(p.replace('#', '').slice(0, 2), 16) || 63;
            const g1 = parseInt(p.replace('#', '').slice(2, 4), 16) || 89;
            const b1 = parseInt(p.replace('#', '').slice(4, 6), 16) || 80;
            const r2 = parseInt(a.replace('#', '').slice(0, 2), 16) || 242;
            const g2 = parseInt(a.replace('#', '').slice(2, 4), 16) || 111;
            const b2 = parseInt(a.replace('#', '').slice(4, 6), 16) || 99;
            // اكتشاف الوضع — bg luminance
            const bg = s.getPropertyValue('--bg').trim() || '#18231f';
            const br = parseInt(bg.replace('#', '').slice(0, 2), 16) || 24;
            const bg2 = parseInt(bg.replace('#', '').slice(2, 4), 16) || 35;
            const bb = parseInt(bg.replace('#', '').slice(4, 6), 16) || 31;
            const lum = (0.299 * br + 0.587 * bg2 + 0.114 * bb) / 255;
            const isDark = lum < 0.45;
            const bgRgb = `${br},${bg2},${bb}`;
            return {
                P: (a) => `rgba(${r1},${g1},${b1},${a})`,
                A: (a) => `rgba(${r2},${g2},${b2},${a})`,
                W: (a) => isDark ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`,
                isDark,
                bgRgb,
                vigStop: isDark ? `rgba(${bgRgb},` : `rgba(${bgRgb},`,
            };
        }

        let W, H, t = 0,
            raf;
        let particles = [],
            rings = [],
            diagonals = [],
            hexGrid = [];
        let C;

        function resize() {
            W = canvas.width = window.innerWidth;
            H = canvas.height = window.innerHeight;
            C = getThemeColors();
            buildScene();
        }

        function buildScene() {
            particles = Array.from({
                length: 55
            }, () => ({
                x: Math.random() * W,
                y: Math.random() * H,
                vx: (Math.random() - .5) * .35,
                vy: (Math.random() - .5) * .35,
                r: .8 + Math.random() * 1.5,
                a: .2 + Math.random() * .4,
            }));

            rings = [{
                    cx: .15,
                    cy: .2,
                    r: 90,
                    sp: .00055,
                    ph: 0,
                    ac: false
                },
                {
                    cx: .85,
                    cy: .18,
                    r: 140,
                    sp: .00040,
                    ph: 1.0,
                    ac: false
                },
                {
                    cx: .5,
                    cy: .88,
                    r: 110,
                    sp: .00048,
                    ph: 2.1,
                    ac: true
                },
                {
                    cx: .22,
                    cy: .75,
                    r: 70,
                    sp: .00070,
                    ph: .5,
                    ac: false
                },
                {
                    cx: .78,
                    cy: .65,
                    r: 160,
                    sp: .00035,
                    ph: 1.6,
                    ac: true
                },
                {
                    cx: .5,
                    cy: .5,
                    r: 200,
                    sp: .00028,
                    ph: 3.1,
                    ac: false
                },
            ];

            diagonals = Array.from({
                length: 10
            }, (_, i) => {
                const angle = (-35 + i * 18) * Math.PI / 180;
                return {
                    cx: W * (.1 + Math.random() * .8),
                    cy: H * (.1 + Math.random() * .8),
                    angle,
                    len: 150 + Math.random() * 250,
                    sp: .0006 + Math.random() * .001,
                    ph: Math.random() * Math.PI * 2
                };
            });

            hexGrid = [];
            const S = 80,
                cols = Math.ceil(W / S) + 3,
                rows = Math.ceil(H / (S * .866)) + 3;
            for (let r = 0; r < rows; r++)
                for (let c = 0; c < cols; c++)
                    hexGrid.push({
                        x: c * S + (r % 2) * S * .5 - S,
                        y: r * S * .866 - S,
                        s: S * .46,
                        a: .022 + Math.random() * .03
                    });
        }

        function drawHex(cx, cy, s) {
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const a = Math.PI / 3 * i - Math.PI / 6;
                i === 0 ? ctx.moveTo(cx + s * Math.cos(a), cy + s * Math.sin(a)) : ctx.lineTo(cx + s * Math.cos(a),
                    cy + s * Math.sin(a));
            }
            ctx.closePath();
        }

        function frame() {
            t++;
            ctx.clearRect(0, 0, W, H);

            // شبكة سداسية
            hexGrid.forEach(h => {
                drawHex(h.x, h.y, h.s);
                ctx.strokeStyle = C.P(h.a);
                ctx.lineWidth = .55;
                ctx.stroke();
            });

            // حلقات
            rings.forEach(rg => {
                const ph = t * rg.sp * 60 + rg.ph,
                    sc = 1 + .07 * Math.sin(ph),
                    r = rg.r * sc;
                const a = .032 + .025 * Math.abs(Math.sin(ph)),
                    col = rg.ac ? C.A : C.P;
                ctx.beginPath();
                ctx.arc(rg.cx * W, rg.cy * H, r, 0, Math.PI * 2);
                ctx.strokeStyle = col(a);
                ctx.lineWidth = 1;
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(rg.cx * W, rg.cy * H, r * .6, 0, Math.PI * 2);
                ctx.strokeStyle = col(a * .5);
                ctx.lineWidth = .6;
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(rg.cx * W, rg.cy * H, 2, 0, Math.PI * 2);
                ctx.fillStyle = col(a * 2.5);
                ctx.fill();
            });

            // خطوط قطرية
            diagonals.forEach(d => {
                const alpha = .035 + .055 * Math.abs(Math.sin(t * d.sp * 60 + d.ph));
                const dx = Math.cos(d.angle) * d.len,
                    dy = Math.sin(d.angle) * d.len;
                const mx = d.cx + Math.sin(t * .007 + d.ph) * 8,
                    my = d.cy + Math.cos(t * .006 + d.ph) * 8;
                const g = ctx.createLinearGradient(mx - dx, my - dy, mx + dx, my + dy);
                g.addColorStop(0, C.P(0));
                g.addColorStop(.35, C.P(alpha));
                g.addColorStop(.65, C.P(alpha));
                g.addColorStop(1, C.P(0));
                ctx.beginPath();
                ctx.moveTo(mx - dx, my - dy);
                ctx.lineTo(mx + dx, my + dy);
                ctx.strokeStyle = g;
                ctx.lineWidth = .9;
                ctx.stroke();
            });

            // نقاط + شبكة
            particles.forEach(p => {
                p.x += p.vx;
                p.y += p.vy;
                if (p.x < 0 || p.x > W) p.vx *= -1;
                if (p.y < 0 || p.y > H) p.vy *= -1;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fillStyle = C.W(p.a);
                ctx.fill();
            });
            const LINK = 105;
            for (let i = 0; i < particles.length; i++)
                for (let j = i + 1; j < particles.length; j++) {
                    const dx = particles[i].x - particles[j].x,
                        dy = particles[i].y - particles[j].y,
                        d = Math.sqrt(dx * dx + dy * dy);
                    if (d < LINK) {
                        ctx.beginPath();
                        ctx.moveTo(particles[i].x, particles[i].y);
                        ctx.lineTo(particles[j].x, particles[j].y);
                        ctx.strokeStyle = C.W(.12 * (1 - d / LINK));
                        ctx.lineWidth = .6;
                        ctx.stroke();
                    }
                }

            // vignette
            const vig = ctx.createRadialGradient(W / 2, H / 2, H * .08, W / 2, H / 2, H * .72);
            vig.addColorStop(0, `rgba(${C.bgRgb},0)`);
            vig.addColorStop(.65, `rgba(${C.bgRgb},0)`);
            vig.addColorStop(1, `rgba(${C.bgRgb},.72)`);
            ctx.fillStyle = vig;
            ctx.fillRect(0, 0, W, H);

            raf = requestAnimationFrame(frame);
        }

        window.addEventListener('resize', () => {
            cancelAnimationFrame(raf);
            resize();
            frame();
        });
        resize();
        frame();
    })();

    // انتقال تلقائي
    setTimeout(() => {
        window.location.href = 'index.php';
    }, 6000);
    </script>
</body>

</html>