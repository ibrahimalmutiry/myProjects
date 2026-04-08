// ══════════════════════════════════════════════════════
//  إدارة السايدبار — sidebar-init.js
// ══════════════════════════════════════════════════════
(function () {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const COLLAPSED_KEY = 'sidebar_collapsed';

    (function initSidebar() {
        const saved = localStorage.getItem(COLLAPSED_KEY);
        if (saved === '1') sidebar.classList.add('collapsed');
        if (window.innerWidth <= 1100 && window.innerWidth > 768) {
            sidebar.classList.remove('collapsed');
            sidebar.classList.remove('expanded');
        }
    })();

    window.toggleSidebar = function () {
        if (window.innerWidth <= 768) return;
        if (window.innerWidth <= 1100) { sidebar.classList.toggle('expanded'); return; }
        sidebar.classList.toggle('collapsed');
        localStorage.setItem(COLLAPSED_KEY, sidebar.classList.contains('collapsed') ? '1' : '0');
        window.updateTogglePosition && window.updateTogglePosition();
    };

    window.updateTogglePosition = function () {
        const toggle = document.getElementById('sidebarToggle');
        if (!toggle) return;
        const isCollapsed = sidebar.classList.contains('collapsed');
        const isEn = document.documentElement.getAttribute('data-lang') === 'en';
        const width = isCollapsed
            ? getComputedStyle(document.documentElement).getPropertyValue('--sidebar-collapsed').trim()
            : getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width').trim();
        if (isEn) {
            toggle.style.right = '';
            toggle.style.left = 'calc(' + width + ' - 14px)';
        } else {
            toggle.style.left = '';
            toggle.style.right = 'calc(' + width + ' - 14px)';
        }
    };

    window.toggleMobileSidebar = function () {
        sidebar.classList.toggle('mobile-open');
        overlay.classList.toggle('active');
        document.body.style.overflow = sidebar.classList.contains('mobile-open') ? 'hidden' : '';
    };

    document.querySelectorAll('.nav-tab').forEach(function (tab) {
        tab.addEventListener('click', function () {
            if (window.innerWidth <= 768) {
                sidebar.classList.remove('mobile-open');
                overlay.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    });

    window.addEventListener('resize', function () {
        if (window.innerWidth > 768) {
            sidebar.classList.remove('mobile-open');
            overlay.classList.remove('active');
            document.body.style.overflow = '';
        }
    });
})();