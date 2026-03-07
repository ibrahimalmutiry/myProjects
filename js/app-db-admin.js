/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║      app-db-admin.js — إدارة قاعدة البيانات                 ║
 * ║  مخصص لمدير النظام (system_admin) فقط                        ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * التعديلات:
 *  • الجداول الفارغة (0 سجلات) تُرتَّب في نهاية القائمة
 *  • زر "جدول جديد" يفتح نافذة لإنشاء جدول بأعمدة مخصصة
 *    مع دعم اختياري لـ Foreign Keys (ربط بجداول أخرى)
 */

// ═══════════════════════════════════════════════════════════
//  مسار API — يُكتشف تلقائياً
// ═══════════════════════════════════════════════════════════
const DB_ADMIN_API = (() => {
    for (const s of document.querySelectorAll('script[src]')) {
        if (s.src.includes('app-db-admin')) {
            return s.src.replace(/js\/app-db-admin\.js.*/, '') + 'api/db_admin_api.php';
        }
    }
    return 'api/db_admin_api.php';
})();

// ═══════════════════════════════════════════════════════════
//  الحالة الداخلية
// ═══════════════════════════════════════════════════════════
const DbAdmin = {
    tables: [],   // [{name, count}] مُرتَّبة (الفارغة آخراً)
    activeTable: null,
    columns: {},
    currentPage: 1,
    searchTerm: '',
    // لإنشاء جدول جديد
    newTableCols: [], // [{name,type,notNull,default,pk,unique}]
    newTableFKs: [], // [{col,refTable,refCol,onDelete}]
};

// ═══════════════════════════════════════════════════════════
//  نقطة الدخول
// ═══════════════════════════════════════════════════════════
async function loadDbAdminPage() {
    if (typeof currentUser !== 'undefined' && currentUser.permissionLevel !== 'system_admin') {
        DOM.mainContent.innerHTML = `
            <div class="performance-page">
                <div class="perf-header" style="text-align:center">
                    <div class="perf-title" style="justify-content:center">
                        <div class="perf-icon" style="background:rgba(239,68,68,0.2)">🔒</div>
                        <div><h1>وصول مرفوض</h1><p>هذه الصفحة مخصصة لمدير النظام فقط.</p></div>
                    </div>
                </div>
            </div>`;
        return;
    }

    showLoading();

    try {
        const [tablesRes, statsRes] = await Promise.all([
            fetch(`${DB_ADMIN_API}?action=get_tables`),
            fetch(`${DB_ADMIN_API}?action=db_stats`)
        ]);

        const ct = tablesRes.headers.get('content-type') || '';
        if (!ct.includes('application/json')) {
            const raw = await tablesRes.text();
            throw new Error('الخادم لم يُرجع JSON. المسار: ' + DB_ADMIN_API + '\n' + raw.substring(0, 200));
        }

        const tablesData = await tablesRes.json();
        const statsData = await statsRes.json();
        if (!tablesData.success) throw new Error(tablesData.message);

        // ✅ ترتيب: الجداول التي تحوي بيانات أولاً، الفارغة آخراً
        DbAdmin.tables = _sortTables(tablesData.data);
        DbAdmin.activeTable = DbAdmin.tables[0]?.name || null;

        _renderPage(statsData.success ? statsData.data : null);
        if (DbAdmin.activeTable) await _loadTable(DbAdmin.activeTable, 1, '');

    } catch (err) {
        DOM.mainContent.innerHTML = `
            <div class="performance-page">
                <div class="perf-header">
                    <div class="perf-header-content">
                        <div class="perf-title">
                            <div class="perf-icon" style="background:rgba(239,68,68,0.2)">⚠️</div>
                            <div><h1>خطأ في التحميل</h1><p>${_esc(err.message)}</p></div>
                        </div>
                    </div>
                </div>
            </div>`;
        console.error('[DbAdmin]', err);
    }
}

// ترتيب الجداول: الممتلئة أولاً بترتيب تنازلي، الفارغة آخراً أبجدياً
function _sortTables(tables) {
    const withData = tables.filter(t => t.count > 0).sort((a, b) => b.count - a.count);
    const empty = tables.filter(t => t.count === 0).sort((a, b) => a.name.localeCompare(b.name));
    return [...withData, ...empty];
}

// ═══════════════════════════════════════════════════════════
//  رسم هيكل الصفحة
// ═══════════════════════════════════════════════════════════
function _renderPage(stats) {
    const total = DbAdmin.tables.reduce((s, t) => s + t.count, 0);
    const sizeMb = stats?.size_mb ?? '—';
    const tblCount = DbAdmin.tables.length;

    const headerHtml = `
    <div class="perf-header">
        <div class="perf-header-content">
            <div class="perf-title">
                <div class="perf-icon" style="background:linear-gradient(135deg,#6366f1,#8b5cf6)">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <ellipse cx="12" cy="5" rx="9" ry="3"/>
                        <path d="M21 12c0 1.66-4 3-9 3S3 13.66 3 12"/>
                        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
                    </svg>
                </div>
                <div>
                    <h1>إدارة قاعدة البيانات</h1>
                    <p>عرض وإدارة كافة الجداول — إضافة وتعديل وحذف</p>
                </div>
            </div>
            <div class="perf-header-stats">
                <div class="header-stat">
                    <span class="stat-number">${tblCount}</span>
                    <span class="stat-label">جدول</span>
                </div>
                <div class="header-stat">
                    <span class="stat-number">${total.toLocaleString('ar-SA')}</span>
                    <span class="stat-label">إجمالي السجلات</span>
                </div>
                <div class="header-stat">
                    <span class="stat-number">${sizeMb} MB</span>
                    <span class="stat-label">حجم قاعدة البيانات</span>
                </div>
            </div>
        </div>
    </div>`;

    // قسم "بدون بيانات" لوضع فاصل بصري بين الممتلئة والفارغة
    const withData = DbAdmin.tables.filter(t => t.count > 0);
    const emptyTbl = DbAdmin.tables.filter(t => t.count === 0);

    function navBtn(t) {
        return `<button class="db-table-nav-btn ${t.name === DbAdmin.activeTable ? 'active' : ''}"
                    data-table="${_esc(t.name)}"
                    onclick="dbSwitchTable('${_esc(t.name)}')">
                    <span class="db-nav-name">${_esc(_label(t.name))}</span>
                    <span class="db-nav-count ${t.count === 0 ? 'db-nav-count-zero' : ''}">${t.count}</span>
                </button>`;
    }

    let navItems = withData.map(navBtn).join('');
    if (emptyTbl.length) {
        navItems += `<div class="db-nav-divider">
                        <span>فارغة (${emptyTbl.length})</span>
                     </div>`;
        navItems += emptyTbl.map(navBtn).join('');
    }

    DOM.mainContent.innerHTML = `
        <div class="performance-page">
            ${headerHtml}

            <div class="db-manager-layout">
                <!-- قائمة الجداول -->
                <div class="db-tables-nav">
                    <div class="db-tables-nav-header">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <ellipse cx="12" cy="5" rx="9" ry="3"/>
                            <path d="M21 12c0 1.66-4 3-9 3S3 13.66 3 12"/>
                            <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
                        </svg>
                        الجداول
                    </div>

                    <!-- ✅ زر إنشاء جدول جديد -->
                    <button class="db-new-table-btn" onclick="dbOpenCreateTableModal()">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <line x1="12" y1="5" x2="12" y2="19"/>
                            <line x1="5" y1="12" x2="19" y2="12"/>
                        </svg>
                        جدول جديد
                    </button>

                    <div class="db-tables-list" id="dbTablesList">${navItems}</div>
                </div>

                <!-- منطقة محتوى الجدول -->
                <div class="db-table-area">
                    <div class="db-table-toolbar">
                        <div class="db-table-toolbar-right">
                            <h3 class="db-table-name" id="dbTableTitle">—</h3>
                            <span class="db-record-count" id="dbRecordCount"></span>
                        </div>
                        <div style="display:flex;align-items:center;gap:.5rem;flex-shrink:0">
                            <div class="db-search-wrap">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <circle cx="11" cy="11" r="8"/>
                                    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                                </svg>
                                <input type="text" id="dbSearchInput" placeholder="بحث..."
                                       oninput="dbSearchDebounce(this.value)">
                            </div>
                            <button class="btn btn-primary" onclick="dbOpenAddModal()">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="12" y1="5" x2="12" y2="19"/>
                                    <line x1="5" y1="12" x2="19" y2="12"/>
                                </svg>
                                إضافة سجل
                            </button>
                        </div>
                    </div>

                    <div class="db-data-wrap" id="dbDataWrap">
                        <div class="loading"><div class="spinner"></div></div>
                    </div>

                    <div class="db-pagination-bar" id="dbPagination"></div>
                </div>
            </div>
        </div>`;
}

// ═══════════════════════════════════════════════════════════
//  تبديل الجدول
// ═══════════════════════════════════════════════════════════
function dbSwitchTable(name) {
    DbAdmin.activeTable = name;
    DbAdmin.currentPage = 1;
    DbAdmin.searchTerm = '';

    document.querySelectorAll('.db-table-nav-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.table === name)
    );
    const si = document.getElementById('dbSearchInput');
    if (si) si.value = '';

    _loadTable(name, 1, '');
}

// بحث مع Debounce
let _searchTimer = null;
function dbSearchDebounce(v) {
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(() => {
        DbAdmin.searchTerm = v.trim();
        DbAdmin.currentPage = 1;
        _loadTable(DbAdmin.activeTable, 1, DbAdmin.searchTerm);
    }, 350);
}

// ═══════════════════════════════════════════════════════════
//  جلب وعرض بيانات جدول
// ═══════════════════════════════════════════════════════════
async function _loadTable(name, page = 1, search = '') {
    if (!name) return;
    DbAdmin.currentPage = page;

    const wrap = document.getElementById('dbDataWrap');
    if (wrap) wrap.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
        if (!DbAdmin.columns[name]) {
            const cr = await fetch(`${DB_ADMIN_API}?action=get_columns&table=${encodeURIComponent(name)}`);
            const cd = await cr.json();
            if (cd.success) DbAdmin.columns[name] = cd.data;
        }
        const cols = DbAdmin.columns[name] || [];
        const pk = _findPk(cols);

        const url = `${DB_ADMIN_API}?action=get_rows&table=${encodeURIComponent(name)}&page=${page}&limit=50&search=${encodeURIComponent(search)}`;
        const res = await fetch(url);
        const data = await res.json();
        if (!data.success) throw new Error(data.message);

        const titleEl = document.getElementById('dbTableTitle');
        const cntEl = document.getElementById('dbRecordCount');
        if (titleEl) titleEl.textContent = _label(name);
        if (cntEl) cntEl.textContent = `${data.meta.total.toLocaleString('ar-SA')} سجل`;

        _renderTable(cols, data.data, pk, name, wrap);
        _renderPagination(data.meta, name, search);

    } catch (err) {
        if (wrap) wrap.innerHTML = `<div class="db-error">⚠️ ${_esc(err.message)}</div>`;
        console.error('[DbAdmin]', err);
    }
}

// ═══════════════════════════════════════════════════════════
//  رسم جدول البيانات
// ═══════════════════════════════════════════════════════════
function _renderTable(cols, rows, pk, name, container) {
    if (!cols.length) { container.innerHTML = '<div class="db-empty">لا توجد أعمدة</div>'; return; }
    if (!rows.length) { container.innerHTML = '<div class="db-empty">🗂️ لا توجد سجلات في هذا الجدول</div>'; return; }

    const thead = cols.map(c => `
        <th class="${c.Key === 'PRI' ? 'pk-col' : ''}">
            ${c.Key === 'PRI' ? '🔑 ' : ''}${_esc(c.Field)}
            <span class="db-col-type-hint">${c.Type.split('(')[0]}</span>
        </th>`).join('') + '<th class="actions-col">إجراء</th>';

    const tbody = rows.map(row => {
        const pkVal = pk ? (row[pk] ?? '') : '';
        const pkSafe = String(pkVal).replace(/'/g, "\\'");

        const cells = cols.map(c => {
            let v = row[c.Field];
            if (v === null || v === undefined) return '<td><span class="db-null-val">NULL</span></td>';
            let s = String(v);
            if (s.length > 80) s = s.substring(0, 80) + '…';
            return `<td>${_esc(s)}</td>`;
        }).join('');

        return `<tr>
            ${cells}
            <td class="db-actions-cell">
                <div class="db-row-btns">
                    <button class="db-btn-edit" title="تعديل"
                        onclick="dbOpenEditModal('${_esc(name)}','${_esc(String(pk))}','${pkSafe}')">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                    <button class="db-btn-delete" title="حذف"
                        onclick="dbDeleteRow('${_esc(name)}','${_esc(String(pk))}','${pkSafe}')">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');

    container.innerHTML = `
        <table class="db-data-table">
            <thead><tr>${thead}</tr></thead>
            <tbody>${tbody}</tbody>
        </table>`;
}

// ═══════════════════════════════════════════════════════════
//  ترقيم الصفحات
// ═══════════════════════════════════════════════════════════
function _renderPagination(meta, name, search) {
    const el = document.getElementById('dbPagination');
    if (!el) return;
    if (meta.pages <= 1) { el.innerHTML = ''; return; }

    let btns = '';
    if (meta.page > 1) {
        btns += `<button class="db-page-btn" onclick="_loadTable('${_esc(name)}',1,'${_esc(search)}')">«</button>`;
        btns += `<button class="db-page-btn" onclick="_loadTable('${_esc(name)}',${meta.page - 1},'${_esc(search)}')">‹</button>`;
    }
    const from = Math.max(1, meta.page - 2), to = Math.min(meta.pages, meta.page + 2);
    for (let i = from; i <= to; i++)
        btns += `<button class="db-page-btn ${i === meta.page ? 'active' : ''}" onclick="_loadTable('${_esc(name)}',${i},'${_esc(search)}')">${i}</button>`;
    if (meta.page < meta.pages) {
        btns += `<button class="db-page-btn" onclick="_loadTable('${_esc(name)}',${meta.page + 1},'${_esc(search)}')">›</button>`;
        btns += `<button class="db-page-btn" onclick="_loadTable('${_esc(name)}',${meta.pages},'${_esc(search)}')">»</button>`;
    }

    el.innerHTML = `
        <span class="db-pagination-info">صفحة ${meta.page} من ${meta.pages} — ${meta.total.toLocaleString('ar-SA')} سجل</span>
        <div class="db-page-btns">${btns}</div>`;
}

// ═══════════════════════════════════════════════════════════
//  ✅ إنشاء جدول جديد — النافذة الكاملة
// ═══════════════════════════════════════════════════════════
function dbOpenCreateTableModal() {
    DbAdmin.newTableCols = [
        // عمود id تلقائي كبداية
        { name: 'id', type: 'INT', notNull: true, default: '', pk: true, unique: false, autoInc: true }
    ];
    DbAdmin.newTableFKs = [];

    _renderCreateTableModal();
    openModal();
}

const COL_TYPES = [
    'INT', 'BIGINT', 'TINYINT', 'SMALLINT',
    'VARCHAR(255)', 'VARCHAR(100)', 'VARCHAR(50)',
    'TEXT', 'LONGTEXT', 'MEDIUMTEXT',
    'DECIMAL(15,2)', 'DECIMAL(10,4)',
    'FLOAT', 'DOUBLE',
    'DATE', 'DATETIME', 'TIMESTAMP',
    'BOOLEAN', 'ENUM(...)', 'JSON'
];

const ON_DELETE_OPTIONS = ['RESTRICT', 'CASCADE', 'SET NULL', 'NO ACTION'];

function _renderCreateTableModal() {
    DOM.modalTitle.textContent = '🛠️ إنشاء جدول جديد';

    // قائمة الجداول المتاحة للـ FK
    const tableOptions = DbAdmin.tables.map(t =>
        `<option value="${_esc(t.name)}">${_esc(_label(t.name))} (${t.name})</option>`
    ).join('');

    // رسم صفوف الأعمدة
    const colRows = DbAdmin.newTableCols.map((c, i) => _renderColRow(c, i, tableOptions)).join('');

    // رسم صفوف FK
    const fkRows = DbAdmin.newTableFKs.map((fk, i) => _renderFKRow(fk, i, tableOptions)).join('');

    DOM.modalBody.innerHTML = `
        <!-- اسم الجدول -->
        <div class="db-ct-section">
            <div class="db-field">
                <label class="db-field-label">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <ellipse cx="12" cy="5" rx="9" ry="3"/>
                        <path d="M21 12c0 1.66-4 3-9 3S3 13.66 3 12"/>
                        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
                    </svg>
                    اسم الجدول <span class="db-req">*</span>
                    <span class="db-type-hint">بالإنجليزية مع _ (مثال: user_orders)</span>
                </label>
                <input type="text" id="ctTableName" class="db-input"
                       placeholder="my_new_table"
                       pattern="[a-zA-Z_][a-zA-Z0-9_]*"
                       oninput="this.value=this.value.toLowerCase().replace(/[^a-z0-9_]/g,'')">
            </div>
        </div>

        <!-- الأعمدة -->
        <div class="db-ct-section">
            <div class="db-ct-section-header">
                <span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="8" y1="6" x2="21" y2="6"/>
                        <line x1="8" y1="12" x2="21" y2="12"/>
                        <line x1="8" y1="18" x2="21" y2="18"/>
                        <line x1="3" y1="6" x2="3.01" y2="6"/>
                        <line x1="3" y1="12" x2="3.01" y2="12"/>
                        <line x1="3" y1="18" x2="3.01" y2="18"/>
                    </svg>
                    الأعمدة
                </span>
                <button class="db-ct-add-btn" onclick="_ctAddCol()">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <line x1="12" y1="5" x2="12" y2="19"/>
                        <line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    إضافة عمود
                </button>
            </div>

            <!-- رؤوس الجدول -->
            <div class="db-ct-cols-header">
                <span style="flex:1.2">اسم العمود</span>
                <span style="flex:1.4">النوع</span>
                <span style="width:54px;text-align:center">PK</span>
                <span style="width:54px;text-align:center">NN</span>
                <span style="width:54px;text-align:center">AI</span>
                <span style="width:54px;text-align:center">UQ</span>
                <span style="flex:1">القيمة الافتراضية</span>
                <span style="width:32px"></span>
            </div>

            <div id="ctColsContainer">${colRows}</div>
        </div>

        <!-- المفاتيح الخارجية (اختياري) -->
        <div class="db-ct-section">
            <div class="db-ct-section-header">
                <span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                    </svg>
                    المفاتيح الخارجية (Foreign Keys)
                    <span class="db-type-hint" style="font-weight:400"> — اختياري</span>
                </span>
                <button class="db-ct-add-btn" onclick="_ctAddFK('${tableOptions.replace(/'/g, "\\'")}')">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <line x1="12" y1="5" x2="12" y2="19"/>
                        <line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    إضافة FK
                </button>
            </div>

            <div id="ctFKsContainer">
                ${fkRows || `<div class="db-ct-empty-fk">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                    </svg>
                    لا توجد روابط — اضغط "إضافة FK" لربط هذا الجدول بجدول آخر
                </div>`}
            </div>
        </div>

        <!-- معاينة SQL -->
        <div class="db-ct-section">
            <div class="db-ct-section-header">
                <span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="16 18 22 12 16 6"/>
                        <polyline points="8 6 2 12 8 18"/>
                    </svg>
                    معاينة SQL
                </span>
                <button class="db-ct-add-btn" onclick="_ctRefreshSQL()">تحديث</button>
            </div>
            <pre id="ctSQLPreview" class="db-ct-sql-preview">— اكتب اسم الجدول وأضف الأعمدة لمعاينة SQL</pre>
        </div>

        <div class="modal-footer">
            <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
            <button class="btn btn-primary" onclick="_ctSubmit()">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <ellipse cx="12" cy="5" rx="9" ry="3"/>
                    <path d="M21 12c0 1.66-4 3-9 3S3 13.66 3 12"/>
                    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
                </svg>
                إنشاء الجدول
            </button>
        </div>`;

    _ctRefreshSQL();
}

// رسم صف عمود واحد
function _renderColRow(c, i, tableOptions) {
    const typeOpts = COL_TYPES.map(t =>
        `<option value="${t}" ${c.type === t || c.type.startsWith(t.split('(')[0]) && t.includes('...') ? '' : ''}
         ${c.type === t ? 'selected' : ''}>${t}</option>`
    ).join('');

    return `
    <div class="db-ct-col-row" id="ctCol_${i}">
        <input class="db-input db-ct-col-name" style="flex:1.2"
               value="${_esc(c.name)}" placeholder="col_name"
               oninput="DbAdmin.newTableCols[${i}].name=this.value.toLowerCase().replace(/[^a-z0-9_]/g,'');this.value=DbAdmin.newTableCols[${i}].name;_ctRefreshSQL()"
               ${c.pk && c.autoInc ? 'readonly' : ''}>

        <select class="db-input db-ct-col-type" style="flex:1.4"
                onchange="DbAdmin.newTableCols[${i}].type=this.value;_ctTypeChanged(${i});_ctRefreshSQL()">
            ${COL_TYPES.map(t => `<option value="${t}" ${c.type === t ? 'selected' : ''}>${t}</option>`).join('')}
        </select>

        <!-- إن كان ENUM: حقل القيم -->
        <input class="db-input db-ct-enum-vals" id="ctEnumVals_${i}"
               style="flex:1.2;display:${c.type.startsWith('ENUM') ? 'block' : 'none'}"
               value="${_esc(c.enumVals || '')}"
               placeholder="val1,val2,val3"
               oninput="DbAdmin.newTableCols[${i}].enumVals=this.value;_ctRefreshSQL()"
               title="قيم ENUM مفصولة بفاصلة">

        <!-- PK -->
        <label class="db-ct-check" title="Primary Key">
            <input type="checkbox" ${c.pk ? 'checked' : ''} ${i === 0 ? 'disabled' : ''}
                   onchange="DbAdmin.newTableCols[${i}].pk=this.checked;_ctRefreshSQL()">
            <span></span>
        </label>

        <!-- NOT NULL -->
        <label class="db-ct-check" title="Not Null">
            <input type="checkbox" ${c.notNull ? 'checked' : ''}
                   onchange="DbAdmin.newTableCols[${i}].notNull=this.checked;_ctRefreshSQL()">
            <span></span>
        </label>

        <!-- AUTO_INCREMENT -->
        <label class="db-ct-check" title="Auto Increment (INT فقط)">
            <input type="checkbox" ${c.autoInc ? 'checked' : ''} ${i === 0 ? 'disabled' : ''}
                   id="ctAI_${i}"
                   onchange="DbAdmin.newTableCols[${i}].autoInc=this.checked;_ctRefreshSQL()">
            <span></span>
        </label>

        <!-- UNIQUE -->
        <label class="db-ct-check" title="Unique">
            <input type="checkbox" ${c.unique ? 'checked' : ''}
                   onchange="DbAdmin.newTableCols[${i}].unique=this.checked;_ctRefreshSQL()">
            <span></span>
        </label>

        <!-- Default -->
        <input class="db-input" style="flex:1"
               value="${_esc(c.default || '')}" placeholder="افتراضي"
               oninput="DbAdmin.newTableCols[${i}].default=this.value;_ctRefreshSQL()">

        <!-- حذف -->
        <button class="db-ct-del-col" title="حذف العمود" onclick="_ctRemoveCol(${i})"
                ${i === 0 ? 'style="opacity:.25;pointer-events:none"' : ''}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
        </button>
    </div>`;
}

// رسم صف FK
function _renderFKRow(fk, i, tableOptions) {
    // جلب أعمدة الجدول المرجعي من الكاش
    const refCols = fk.refTable && DbAdmin.columns[fk.refTable]
        ? DbAdmin.columns[fk.refTable].map(c => c.Field)
        : [];

    const colOptions = DbAdmin.newTableCols.map(c =>
        `<option value="${_esc(c.name)}" ${fk.col === c.name ? 'selected' : ''}>${_esc(c.name)}</option>`
    ).join('');

    const refColOpts = refCols.map(c =>
        `<option value="${_esc(c)}" ${fk.refCol === c ? 'selected' : ''}>${_esc(c)}</option>`
    ).join('') || `<option value="">— اختر الجدول أولاً —</option>`;

    return `
    <div class="db-ct-fk-row" id="ctFK_${i}">
        <!-- عمود هذا الجدول -->
        <div class="db-ct-fk-field">
            <label class="db-ct-fk-label">عمود هذا الجدول</label>
            <select class="db-input" onchange="DbAdmin.newTableFKs[${i}].col=this.value;_ctRefreshSQL()">
                <option value="">— اختر —</option>
                ${colOptions}
            </select>
        </div>

        <!-- الجدول المرجعي -->
        <div class="db-ct-fk-field">
            <label class="db-ct-fk-label">يرتبط بجدول</label>
            <select class="db-input" onchange="DbAdmin.newTableFKs[${i}].refTable=this.value;_ctLoadFKRefCols(${i})">
                <option value="">— اختر جدول —</option>
                ${tableOptions}
            </select>
        </div>

        <!-- عمود الجدول المرجعي -->
        <div class="db-ct-fk-field" id="ctFKRefColWrap_${i}">
            <label class="db-ct-fk-label">عمود الربط</label>
            <select class="db-input" id="ctFKRefCol_${i}"
                    onchange="DbAdmin.newTableFKs[${i}].refCol=this.value;_ctRefreshSQL()">
                ${refColOpts}
            </select>
        </div>

        <!-- ON DELETE -->
        <div class="db-ct-fk-field">
            <label class="db-ct-fk-label">عند الحذف</label>
            <select class="db-input" onchange="DbAdmin.newTableFKs[${i}].onDelete=this.value;_ctRefreshSQL()">
                ${ON_DELETE_OPTIONS.map(o => `<option value="${o}" ${fk.onDelete === o ? 'selected' : ''}>${o}</option>`).join('')}
            </select>
        </div>

        <!-- حذف FK -->
        <button class="db-ct-del-col" onclick="_ctRemoveFK(${i})" title="حذف هذا الربط"
                style="align-self:flex-end;margin-bottom:2px">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
        </button>
    </div>`;
}

// إضافة عمود جديد
function _ctAddCol() {
    DbAdmin.newTableCols.push({ name: '', type: 'VARCHAR(255)', notNull: false, default: '', pk: false, unique: false, autoInc: false });
    _refreshColsUI();
    _ctRefreshSQL();
}

// حذف عمود
function _ctRemoveCol(i) {
    if (i === 0) return;
    DbAdmin.newTableCols.splice(i, 1);
    _refreshColsUI();
    _ctRefreshSQL();
}

// إعادة رسم الأعمدة
function _refreshColsUI() {
    const tOpts = DbAdmin.tables.map(t => `<option value="${_esc(t.name)}">${_esc(_label(t.name))} (${t.name})</option>`).join('');
    const c = document.getElementById('ctColsContainer');
    if (c) c.innerHTML = DbAdmin.newTableCols.map((col, i) => _renderColRow(col, i, tOpts)).join('');
}

// تغيير نوع العمود
function _ctTypeChanged(i) {
    const col = DbAdmin.newTableCols[i];
    const enumEl = document.getElementById(`ctEnumVals_${i}`);
    if (enumEl) enumEl.style.display = col.type.startsWith('ENUM') ? 'block' : 'none';
    // AI فقط للأرقام
    const aiEl = document.getElementById(`ctAI_${i}`);
    if (aiEl && !col.type.match(/INT|BIGINT|SMALLINT|TINYINT/i)) {
        aiEl.checked = false;
        col.autoInc = false;
    }
}

// إضافة FK
function _ctAddFK(tableOptions) {
    DbAdmin.newTableFKs.push({ col: '', refTable: '', refCol: '', onDelete: 'RESTRICT' });
    const tOpts = DbAdmin.tables.map(t => `<option value="${_esc(t.name)}">${_esc(_label(t.name))} (${t.name})</option>`).join('');
    _refreshFKsUI(tOpts);
    _ctRefreshSQL();
}

// حذف FK
function _ctRemoveFK(i) {
    DbAdmin.newTableFKs.splice(i, 1);
    const tOpts = DbAdmin.tables.map(t => `<option value="${_esc(t.name)}">${_esc(_label(t.name))} (${t.name})</option>`).join('');
    _refreshFKsUI(tOpts);
    _ctRefreshSQL();
}

// إعادة رسم FKs
function _refreshFKsUI(tableOptions) {
    const c = document.getElementById('ctFKsContainer');
    if (!c) return;
    if (!DbAdmin.newTableFKs.length) {
        c.innerHTML = `<div class="db-ct-empty-fk">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
            لا توجد روابط — اضغط "إضافة FK" لربط هذا الجدول بجدول آخر
        </div>`;
    } else {
        c.innerHTML = DbAdmin.newTableFKs.map((fk, i) => _renderFKRow(fk, i, tableOptions)).join('');
    }
}

// جلب أعمدة جدول مرجعي وتحديث select
async function _ctLoadFKRefCols(fkIdx) {
    const fk = DbAdmin.newTableFKs[fkIdx];
    if (!fk.refTable) return;

    const selectEl = document.getElementById(`ctFKRefCol_${fkIdx}`);
    if (!selectEl) return;

    if (!DbAdmin.columns[fk.refTable]) {
        selectEl.innerHTML = '<option>⏳ جارٍ التحميل...</option>';
        const r = await fetch(`${DB_ADMIN_API}?action=get_columns&table=${encodeURIComponent(fk.refTable)}`);
        const d = await r.json();
        if (d.success) DbAdmin.columns[fk.refTable] = d.data;
    }

    const cols = DbAdmin.columns[fk.refTable] || [];
    selectEl.innerHTML = cols.map(c =>
        `<option value="${_esc(c.Field)}">${_esc(c.Field)} (${c.Type.split('(')[0]})</option>`
    ).join('') || '<option>لا توجد أعمدة</option>';
    fk.refCol = cols[0]?.Field || '';
    _ctRefreshSQL();
}

// معاينة SQL
function _ctRefreshSQL() {
    const pre = document.getElementById('ctSQLPreview');
    if (!pre) return;

    const tName = (document.getElementById('ctTableName')?.value || '').trim();
    if (!tName || !DbAdmin.newTableCols.length) {
        pre.textContent = '— اكتب اسم الجدول وأضف الأعمدة لمعاينة SQL';
        return;
    }

    const cols = DbAdmin.newTableCols;
    const fks = DbAdmin.newTableFKs;

    const colDefs = cols.map(c => {
        if (!c.name) return null;
        let type = c.type;
        if (type.startsWith('ENUM') && c.enumVals) {
            type = `ENUM(${c.enumVals.split(',').map(v => `'${v.trim()}'`).join(',')})`;
        }
        let def = `  \`${c.name}\` ${type}`;
        if (c.notNull || c.pk) def += ' NOT NULL';
        if (c.autoInc) def += ' AUTO_INCREMENT';
        if (!c.pk && c.default !== '' && c.default !== null && c.default !== undefined)
            def += ` DEFAULT '${c.default}'`;
        return def;
    }).filter(Boolean);

    // PKs
    const pkCols = cols.filter(c => c.pk && c.name).map(c => `\`${c.name}\``);
    if (pkCols.length) colDefs.push(`  PRIMARY KEY (${pkCols.join(', ')})`);

    // Unique
    cols.filter(c => c.unique && c.name && !c.pk).forEach(c => {
        colDefs.push(`  UNIQUE KEY \`uq_${c.name}\` (\`${c.name}\`)`);
    });

    // FKs
    fks.filter(fk => fk.col && fk.refTable && fk.refCol).forEach((fk, i) => {
        colDefs.push(`  CONSTRAINT \`fk_${tName}_${fk.col}_${i}\`\n    FOREIGN KEY (\`${fk.col}\`) REFERENCES \`${fk.refTable}\` (\`${fk.refCol}\`)\n    ON DELETE ${fk.onDelete}`);
    });

    pre.textContent = `CREATE TABLE \`${tName}\` (\n${colDefs.join(',\n')}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`;
}

// إرسال إنشاء الجدول
async function _ctSubmit() {
    const tName = (document.getElementById('ctTableName')?.value || '').trim();
    if (!tName) { showToast('❌ أدخل اسم الجدول', 'error'); return; }
    if (!/^[a-z][a-z0-9_]*$/.test(tName)) { showToast('❌ اسم الجدول يجب أن يبدأ بحرف ويحتوي فقط على أحرف صغيرة وأرقام و _', 'error'); return; }

    const validCols = DbAdmin.newTableCols.filter(c => c.name.trim());
    if (!validCols.length) { showToast('❌ أضف عموداً واحداً على الأقل', 'error'); return; }

    const payload = {
        table_name: tName,
        columns: validCols,
        foreign_keys: DbAdmin.newTableFKs.filter(fk => fk.col && fk.refTable && fk.refCol)
    };

    try {
        const res = await fetch(`${DB_ADMIN_API}?action=create_table`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            showToast(`✅ تم إنشاء الجدول "${tName}" بنجاح`, 'success');
            closeModal();
            // إعادة تحميل الصفحة لتظهر الجدول الجديد
            await loadDbAdminPage();
            // الانتقال للجدول الجديد
            setTimeout(() => dbSwitchTable(tName), 300);
        } else {
            showToast('❌ ' + (data.message || 'فشل الإنشاء'), 'error');
        }
    } catch (e) {
        showToast('❌ خطأ: ' + e.message, 'error');
    }
}

// ═══════════════════════════════════════════════════════════
//  نافذة إضافة سجل
// ═══════════════════════════════════════════════════════════
async function dbOpenAddModal() {
    const name = DbAdmin.activeTable;
    if (!name) return;

    const cols = await _getCols(name);
    if (!cols) return;

    const editable = cols.filter(c => !(c.Extra || '').includes('auto_increment'));

    DOM.modalTitle.textContent = `إضافة سجل — ${_label(name)}`;
    DOM.modalBody.innerHTML = `
        <div class="db-form-grid">${editable.map(c => _buildField(c, null, false)).join('')}</div>
        <div class="modal-footer">
            <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
            <button class="btn btn-primary" onclick="_submitAdd('${_esc(name)}')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12"/>
                </svg>
                حفظ السجل
            </button>
        </div>`;
    openModal();
}

// ═══════════════════════════════════════════════════════════
//  نافذة تعديل سجل
// ═══════════════════════════════════════════════════════════
async function dbOpenEditModal(name, pk, pkVal) {
    const cols = await _getCols(name);
    if (!cols) return;

    const row = await _fetchRow(name, pk, pkVal);

    DOM.modalTitle.textContent = `تعديل سجل — ${_label(name)}`;
    DOM.modalBody.innerHTML = `
        <div class="db-form-grid">${cols.map(c => _buildField(c, row ? row[c.Field] : null, c.Key === 'PRI')).join('')}</div>
        <div class="modal-footer">
            <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
            <button class="btn btn-primary" onclick="_submitEdit('${_esc(name)}','${_esc(pk)}','${_esc(pkVal)}')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12"/>
                </svg>
                حفظ التعديلات
            </button>
        </div>`;
    openModal();
}

async function _fetchRow(name, pk, pkVal) {
    try {
        const r = await fetch(`${DB_ADMIN_API}?action=get_rows&table=${encodeURIComponent(name)}&limit=100`);
        const d = await r.json();
        return d.success ? (d.data.find(r => String(r[pk]) === String(pkVal)) || null) : null;
    } catch { return null; }
}

function _buildField(col, val, readonly = false) {
    const id = `dbf_${col.Field}`;
    const v = (val !== null && val !== undefined) ? String(val) : '';
    const t = col.Type.toLowerCase();

    let input = '';
    if (readonly) {
        input = `<input type="text" id="${id}" name="${col.Field}" value="${_esc(v)}" class="db-input" disabled readonly>`;
    } else if (t.match(/^enum\(/)) {
        const opts = t.match(/^enum\((.+)\)$/)[1].split(',').map(o => o.replace(/'/g, '').trim());
        const nullable = col.Null === 'YES';
        const optsHtml = (nullable ? [`<option value="">— اختياري —</option>`] : [])
            .concat(opts.map(o => `<option value="${_esc(o)}" ${v === o ? 'selected' : ''}>${_esc(o)}</option>`))
            .join('');
        input = `<select id="${id}" name="${col.Field}" class="db-input">${optsHtml}</select>`;
    } else if (t.includes('text')) {
        input = `<textarea id="${id}" name="${col.Field}" class="db-input db-textarea" rows="3">${_esc(v)}</textarea>`;
    } else if (t.includes('datetime') || t.includes('timestamp')) {
        input = `<input type="datetime-local" id="${id}" name="${col.Field}" value="${v.substring(0, 16)}" class="db-input">`;
    } else if (t.includes('date')) {
        input = `<input type="date" id="${id}" name="${col.Field}" value="${v.substring(0, 10)}" class="db-input">`;
    } else if (t.includes('int') || t.includes('float') || t.includes('decimal') || t.includes('double')) {
        input = `<input type="number" step="any" id="${id}" name="${col.Field}" value="${_esc(v)}" class="db-input">`;
    } else {
        input = `<input type="text" id="${id}" name="${col.Field}" value="${_esc(v)}" class="db-input">`;
    }

    return `
        <div class="db-field">
            <label class="db-field-label">
                ${_esc(col.Field)}
                ${col.Key === 'PRI' ? '<span class="db-pk-badge">PK</span>' : ''}
                ${col.Null === 'NO' && col.Default === null && !readonly ? '<span class="db-req">*</span>' : ''}
                <span class="db-type-hint">${col.Type.split('(')[0]}</span>
            </label>
            ${input}
        </div>`;
}

// ═══════════════════════════════════════════════════════════
//  إرسال الإضافة
// ═══════════════════════════════════════════════════════════
async function _submitAdd(name) {
    const cols = DbAdmin.columns[name] || [];
    const editable = cols.filter(c => !(c.Extra || '').includes('auto_increment'));
    const body = {};
    editable.forEach(c => {
        const el = document.getElementById(`dbf_${c.Field}`);
        if (!el) return;
        body[c.Field] = el.value.trim() === '' ? null : el.value.trim();
    });
    try {
        const res = await fetch(`${DB_ADMIN_API}?action=add_row&table=${encodeURIComponent(name)}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        });
        const data = await res.json();
        if (data.success) {
            showToast('✅ تمت الإضافة بنجاح', 'success');
            closeModal();
            _loadTable(name, DbAdmin.currentPage, DbAdmin.searchTerm);
            _refreshCounts();
        } else { showToast('❌ ' + data.message, 'error'); }
    } catch (e) { showToast('❌ خطأ: ' + e.message, 'error'); }
}

// ═══════════════════════════════════════════════════════════
//  إرسال التعديل
// ═══════════════════════════════════════════════════════════
async function _submitEdit(name, pk, pkVal) {
    const cols = DbAdmin.columns[name] || [];
    const body = {};
    cols.forEach(c => {
        if (c.Key === 'PRI') return;
        const el = document.getElementById(`dbf_${c.Field}`);
        if (!el || el.disabled) return;
        body[c.Field] = el.value.trim() === '' ? null : el.value.trim();
    });
    try {
        const res = await fetch(
            `${DB_ADMIN_API}?action=update_row&table=${encodeURIComponent(name)}&pk=${encodeURIComponent(pk)}&pk_val=${encodeURIComponent(pkVal)}`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
        );
        const data = await res.json();
        if (data.success) {
            showToast('✅ تم التعديل بنجاح', 'success');
            closeModal();
            _loadTable(name, DbAdmin.currentPage, DbAdmin.searchTerm);
        } else { showToast('❌ ' + data.message, 'error'); }
    } catch (e) { showToast('❌ خطأ: ' + e.message, 'error'); }
}

// ═══════════════════════════════════════════════════════════
//  حذف سجل
// ═══════════════════════════════════════════════════════════
async function dbDeleteRow(name, pk, pkVal) {
    const ok = await _confirm(
        '⚠️ تأكيد الحذف',
        `هل أنت متأكد من حذف السجل <strong>#${_esc(String(pkVal))}</strong>
         من جدول <strong>${_esc(_label(name))}</strong>؟<br>
         <span style="color:var(--accent-red);font-size:.84rem">لا يمكن التراجع عن هذا الإجراء.</span>`
    );
    if (!ok) return;

    try {
        const res = await fetch(
            `${DB_ADMIN_API}?action=delete_row&table=${encodeURIComponent(name)}&pk=${encodeURIComponent(pk)}&pk_val=${encodeURIComponent(pkVal)}`,
            { method: 'DELETE' }
        );
        const data = await res.json();
        if (data.success) {
            showToast('🗑️ تم الحذف بنجاح', 'success');
            _loadTable(name, DbAdmin.currentPage, DbAdmin.searchTerm);
            _refreshCounts();
        } else { showToast('❌ ' + data.message, 'error'); }
    } catch (e) { showToast('❌ خطأ: ' + e.message, 'error'); }
}

// ═══════════════════════════════════════════════════════════
//  نافذة تأكيد عامة
// ═══════════════════════════════════════════════════════════
function _confirm(title, msg) {
    return new Promise(resolve => {
        DOM.modalTitle.textContent = title;
        DOM.modalBody.innerHTML = `
            <div class="db-confirm-body">
                <div class="db-confirm-icon">⚠️</div>
                <p class="db-confirm-msg">${msg}</p>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" id="dbCfNo">لا، إلغاء</button>
                <button class="btn btn-danger btn" id="dbCfYes">نعم، احذف</button>
            </div>`;
        openModal();
        document.getElementById('dbCfYes').onclick = () => { closeModal(); resolve(true); };
        document.getElementById('dbCfNo').onclick = () => { closeModal(); resolve(false); };
    });
}

// ═══════════════════════════════════════════════════════════
//  دوال مساعدة
// ═══════════════════════════════════════════════════════════
function _findPk(cols) {
    return (cols.find(c => c.Key === 'PRI') || cols[0] || { Field: 'id' }).Field;
}

async function _getCols(name) {
    if (DbAdmin.columns[name]) return DbAdmin.columns[name];
    try {
        const r = await fetch(`${DB_ADMIN_API}?action=get_columns&table=${encodeURIComponent(name)}`);
        const d = await r.json();
        if (d.success) { DbAdmin.columns[name] = d.data; return d.data; }
    } catch (e) { console.error(e); }
    return null;
}

async function _refreshCounts() {
    try {
        const r = await fetch(`${DB_ADMIN_API}?action=get_tables`);
        const d = await r.json();
        if (!d.success) return;

        // تحديث العدادات وإعادة ترتيب القائمة
        d.data.forEach(t => {
            const existing = DbAdmin.tables.find(x => x.name === t.name);
            if (existing) existing.count = t.count;
        });
        DbAdmin.tables = _sortTables(DbAdmin.tables);

        // تحديث عناصر DOM فقط (بدون إعادة رسم كاملة)
        DbAdmin.tables.forEach(t => {
            const el = document.querySelector(`.db-table-nav-btn[data-table="${t.name}"] .db-nav-count`);
            if (el) {
                el.textContent = t.count;
                el.classList.toggle('db-nav-count-zero', t.count === 0);
            }
        });
    } catch { }
}

const TABLE_LABELS = {
    transactions: 'المعاملات', transaction_types: 'أنواع المعاملات',
    employees: 'الموظفين', receiving_data: 'بيانات الاستلام',
    budget_data: 'بيانات الموازنة', dispatch_data: 'بيانات التوجيه',
    payment_data: 'بيانات الدفع', invoice_data: 'بيانات الفواتير',
    bank_accounts: 'الحسابات البنكية', bank_balances: 'أرصدة البنوك',
    bank_investments: 'الاستثمارات', bank_monthly_data: 'البيانات الشهرية',
    bank_deposits: 'الحسابات البنكية', correspondence: 'الخطابات',
    correspondence_attachments: 'مرفقات الخطابات',
    employee_page_permissions: 'صلاحيات الصفحات',
    notifications: 'التنبيهات', activity_logs: 'سجل الأنشطة',
    sla_config: 'إعدادات SLA', ola_config: 'إعدادات OLA',
};

function _label(name) { return TABLE_LABELS[name] || name.replace(/_/g, ' '); }

function _esc(s) {
    if (s === null || s === undefined) return '';
    return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}