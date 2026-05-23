/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║      app-settings-core.js — صفحة الإعدادات + محرر الثيم     ║
 * ║  يتطلب: app-common.js, app-transactions.js, theme-editor.js  ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

// ═══════════════════════════════════════════════════════════
//  صفحة الإعدادات — الهيكل والتنقل
// ═══════════════════════════════════════════════════════════

async function loadSettingsPage() {
    DOM.mainContent.innerHTML = `
        <div class="settings-page-new">

            <!-- شريط التبويبات العلوي -->
            <div class="settings-topbar">
                <button class="settings-tab-btn active" data-section="employees" onclick="showSettingsSection('employees', this)">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                        <circle cx="9" cy="7" r="4"></circle>
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                        <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                    </svg>
                    الموظفين
                </button>

                <button class="settings-tab-btn" data-section="types" onclick="showSettingsSection('types', this)">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="8" y1="6" x2="21" y2="6"></line>
                        <line x1="8" y1="12" x2="21" y2="12"></line>
                        <line x1="8" y1="18" x2="21" y2="18"></line>
                        <line x1="3" y1="6" x2="3.01" y2="6"></line>
                        <line x1="3" y1="12" x2="3.01" y2="12"></line>
                        <line x1="3" y1="18" x2="3.01" y2="18"></line>
                    </svg>
                    أنواع المعاملات
                </button>

                <button class="settings-tab-btn" data-section="all-transactions" onclick="showSettingsSection('all-transactions', this)">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="1" x2="12" y2="23"></line>
                        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                    </svg>
                    جميع المعاملات
                </button>

                <button class="settings-tab-btn" data-section="cost-centers" onclick="showSettingsSection('cost-centers', this)">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                        <polyline points="9 22 9 12 15 12 15 22"></polyline>
                    </svg>
                    مراكز التكلفة
                </button>

                <button class="settings-tab-btn" data-section="departments" onclick="showSettingsSection('departments', this)">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="2" y="7" width="20" height="14" rx="2"/>
                        <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
                    </svg>
                    الأقسام
                </button>

                <button class="settings-tab-btn" data-section="system" onclick="showSettingsSection('system', this)">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="3"></circle>
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                    </svg>
                    النظام
                </button>

                <button class="settings-tab-btn" data-section="system-dashboard" onclick="showSettingsSection('system-dashboard', this)">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="2" y="3" width="20" height="14" rx="2"/>
                        <line x1="8" y1="21" x2="16" y2="21"/>
                        <line x1="12" y1="17" x2="12" y2="21"/>
                    </svg>
                    لوحة النظام
                </button>

                <button class="settings-tab-btn" data-section="budget-categories" onclick="showSettingsSection('budget-categories', this)">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="2" y="7" width="20" height="14" rx="2"/>
                        <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
                        <line x1="12" y1="12" x2="12" y2="16"/>
                        <line x1="10" y1="14" x2="14" y2="14"/>
                    </svg>
                    بنود الموازنة
                </button>

                <button class="settings-tab-btn" data-section="suppliers" onclick="showSettingsSection('suppliers', this)">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                        <polyline points="9 22 9 12 15 12 15 22"/>
                        <circle cx="12" cy="5" r="1" fill="currentColor"/>
                    </svg>
                     إدارة الموردين
                </button>

                <!-- ✅ تبويب محرر الثيم الجديد -->
                <button class="settings-tab-btn" data-section="security-log" onclick="showSettingsSection('security-log', this)">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    سجل الأمان
                </button>
                <button class="settings-tab-btn" data-section="theme" onclick="showSettingsSection('theme', this)">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8z"/>
                        <circle cx="6.5"  cy="11.5" r="1.5"/>
                        <circle cx="9.5"  cy="7.5"  r="1.5"/>
                        <circle cx="14.5" cy="7.5"  r="1.5"/>
                        <circle cx="17.5" cy="11.5" r="1.5"/>
                    </svg>
                    الهوية البصرية
                </button>
<button class="settings-tab-btn" data-section="workflow" onclick="showSettingsSection('workflow', this)">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2L2 7l10 5 10-5-10-5z"/>
        <path d="M2 17l10 5 10-5"/>
        <path d="M2 12l10 5 10-5"/>
    </svg>
    مسارات الموافقة
</button>
            </div>

            <!-- المحتوى -->
            <div class="settings-content" id="settingsContent"></div>
        </div>
    `;

    await loadSettingsEmployees();
    showSettingsSection('employees', document.querySelector('.settings-tab-btn'));
}

// ═══════════════════════════════════════════════════════════
//  عرض قسم في الإعدادات
// ═══════════════════════════════════════════════════════════
async function showSettingsSection(section, btn) {
    // تحديث الأزرار النشطة
    document.querySelectorAll('.settings-tab-btn, .settings-nav-btn').forEach(function (b) {
        b.classList.remove('active');
    });
    if (btn) btn.classList.add('active');

    // توجيه للقسم المطلوب
    switch (section) {
        case 'employees':
            renderEmployeesSection();
            break;

        case 'types':
            if (typeof renderTypesSection === 'function') renderTypesSection();
            break;

        case 'all-transactions':
            if (typeof renderAllTransactionsSection === 'function') renderAllTransactionsSection();
            break;

        case 'cost-centers':
            if (typeof renderCostCentersSection === 'function') renderCostCentersSection();
            else document.getElementById('settingsContent').innerHTML = '<p style="color:red;padding:2rem">⚠️ لم يتم تحميل ملف مراكز التكلفة</p>';
            break;

        case 'departments':
            if (typeof renderDepartmentsSection === 'function') renderDepartmentsSection();
            else document.getElementById('settingsContent').innerHTML = '<p style="color:red;padding:2rem">⚠️ لم يتم تحميل ملف الأقسام</p>';
            break;

        case 'system':
            if (typeof renderSystemSection === 'function') renderSystemSection();
            break;

        case 'system-dashboard':
            if (typeof renderSystemDashboard === 'function') renderSystemDashboard();
            break;

        case 'budget-categories':
            if (typeof renderBudgetCategoriesSection === 'function') renderBudgetCategoriesSection();
            else document.getElementById('settingsContent').innerHTML = '<p style="color:red;padding:2rem">⚠️ لم يتم تحميل ملف بنود الموازنة</p>';
            break;

        case 'suppliers':
            if (typeof renderSuppliersSection === 'function') renderSuppliersSection();
            else document.getElementById('settingsContent').innerHTML = '<p style="color:red;padding:2rem">⚠️ لم يتم تحميل ملف الموردين — أضف app-settings-suppliers.js في index.php</p>';
            break;

        case 'security-log':
            if (typeof loadSecurityLogPage === 'function') {
                loadSecurityLogPage('settingsContent');
            } else {
                document.getElementById('settingsContent').innerHTML =
                    '<p style="color:red;padding:2rem">⚠️ أضف app-security-log.js في index.php</p>';
            }
            break;
        case 'workflow':
            if (typeof renderWorkflowSection === 'function') renderWorkflowSection();
            else document.getElementById('settingsContent').innerHTML =
                '<p style="color:red;padding:2rem">⚠️ أضف app-settings-workflow.js في index.php</p>';
            break;
        // ✅ قسم محرر الثيم
        case 'theme':
            if (typeof ThemeEditor !== 'undefined') {
                ThemeEditor.render('settingsContent');
            } else {
                document.getElementById('settingsContent').innerHTML = `
                    <div style="text-align:center;padding:3rem;color:var(--accent,#F26F63);">
                        ⚠️ لم يتم تحميل محرر الثيم.<br>
                        <small style="color:var(--text-muted);font-size:.8rem;">
                            تأكد من إضافة &lt;script src="theme-editor.js"&gt; في index.php
                        </small>
                    </div>`;
            }
            break;

        default:
            break;
    }
}

// ═══════════════════════════════════════════════════════════
//  CSS شريط التبويبات العلوي — مدمج هنا لتجنب ملف خارجي
// ═══════════════════════════════════════════════════════════
(function injectSettingsTopbarStyles() {
    if (document.getElementById('settings-topbar-styles')) return;
    const s = document.createElement('style');
    s.id = 'settings-topbar-styles';
    s.textContent = `
        .settings-page-new {
            display: flex;
            flex-direction: column;
            gap: 1.5rem;
            min-height: calc(100vh - 200px);
        }
        .settings-topbar {
            display: flex;
            align-items: center;
            gap: 4px;
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 5px;
            flex-wrap: wrap;
        }
        .settings-tab-btn {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.55rem 1.1rem;
            background: transparent;
            border: 1px solid transparent;
            border-radius: 8px;
            color: var(--text-secondary);
            font-family: inherit;
            font-size: 0.85rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
            white-space: nowrap;
        }
        .settings-tab-btn:hover {
            background: var(--bg-surface);
            color: var(--text-primary);
        }
        .settings-tab-btn.active {
            background: var(--btn-primary-bg, #3F5950);
            color: var(--btn-primary-text, #fff);
            border-color: transparent;
            font-weight: 600;
            box-shadow: 0 2px 8px rgba(0,0,0,.15);
        }
        .settings-page-new .settings-content {
            flex: 1;
            min-width: 0;
        }
        @media (max-width: 600px) {
            .settings-tab-btn { font-size: 0.78rem; padding: 0.5rem 0.75rem; }
        }
    `;
    document.head.appendChild(s);
})();