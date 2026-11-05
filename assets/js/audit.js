/* ============================================================
   AUDIT LOG (admin) — records who did what, viewable by admins
   ============================================================ */
let auditFilters = {
  category: '',
  action: '',
  user: '',
  from: currentYearStartISO(),
  to: currentYearEndISO(),
  q: ''
};
let auditYearFilter = 'current';
let auditRows = [];

// Client-side in-memory deduplication cache (prevents duplicate dispatches within 3 seconds)
const _recentAuditSignatures = new Map();

function cleanAuditDisplayString(str) {
  if (!str) return '';
  let s = String(str);
  s = s.replace(/\s*\[\s*(?:PRD|SZ)-[A-Za-z0-9_-]+(?:\s*·\s*(?:PRD|SZ)-[A-Za-z0-9_-]+)*\s*\]/gi, '');
  s = s.replace(/\s*\(\s*(?:ID\s*:\s*)?(?:PRD|SZ)-[A-Za-z0-9_-]+\s*\)/gi, '');
  s = s.replace(/\s*\[\s*(?:p_[A-Za-z0-9_-]+|p\d+)\s*\]/gi, '');
  s = s.replace(/\s*\(\s*ID\s*:\s*(?:p_[A-Za-z0-9_-]+|p\d+)\s*\)/gi, '');
  return s.replace(/  +/g, ' ').trim();
}

function logAudit(action, entity, details, productIdOrMeta = null, extraMeta = null) {
  try {
    let productId = '';
    let metaObj = {};

    if (productIdOrMeta && typeof productIdOrMeta === 'object' && !Array.isArray(productIdOrMeta)) {
      metaObj = { ...productIdOrMeta };
      productId = metaObj.productId || '';
    } else {
      productId = productIdOrMeta ? String(productIdOrMeta) : '';
      if (extraMeta && typeof extraMeta === 'object') {
        metaObj = { ...extraMeta };
      }
    }

    const u = (metaObj.userOverride && typeof metaObj.userOverride === 'object')
      ? metaObj.userOverride
      : (typeof currentUser !== 'undefined' && currentUser ? currentUser : {});

    const cleanAction = String(action || '').trim().toUpperCase();
    const cleanEntity = String(entity || metaObj.entityName || '').trim();
    const cleanDetails = String(details || '').trim();
    const entityName = String(metaObj.entityName || cleanEntity || '').trim();
    const fieldChanged = String(metaObj.fieldChanged || '').trim();
    const oldValue = metaObj.oldValue !== undefined && metaObj.oldValue !== null ? String(metaObj.oldValue) : '';
    const newValue = metaObj.newValue !== undefined && metaObj.newValue !== null ? String(metaObj.newValue) : '';
    const referenceNo = String(metaObj.referenceNo || '').trim();
    const reason = String(metaObj.reason || '').trim();

    // Build client-side deduplication signature (3-second window)
    const nowMs = Date.now();
    for (const [k, ts] of _recentAuditSignatures.entries()) {
      if (nowMs - ts > 3500) _recentAuditSignatures.delete(k);
    }
    const sig = `${u.id || ''}|${cleanAction}|${cleanEntity}|${productId}|${oldValue}|${newValue}|${cleanDetails}`;
    if (!metaObj.allowDuplicate && _recentAuditSignatures.has(sig)) {
      const prevTs = _recentAuditSignatures.get(sig);
      if (nowMs - prevTs < 3000) {
        return; // Suppress duplicate event fired within 3 seconds
      }
    }
    _recentAuditSignatures.set(sig, nowMs);

    const timeBucket = Math.floor(nowMs / 3000);
    const eventKey = metaObj.eventKey || `${cleanAction}:${productId || entityName}:${oldValue}->${newValue}:${timeBucket}`.slice(0, 120);

    fetch('api/audit.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: u.id || '',
        userName: u.name || '',
        userRole: u.role || '',
        action: cleanAction,
        entity: cleanEntity,
        productId: productId || '',
        details: cleanDetails,
        entityName,
        fieldChanged,
        oldValue,
        newValue,
        referenceNo,
        reason,
        meta: metaObj.meta || null,
        eventKey
      }),
    }).catch(() => { });
  } catch (e) { }
}

const AUDIT_CATEGORIES = [
  { value: '', label: '📂 All Categories' },
  { value: 'login_logout', label: '🔐 Login / Logout' },
  { value: 'product_changes', label: '🎨 Product Changes' },
  { value: 'stock_movements', label: '📦 Stock Movements' },
  { value: 'purchase_orders', label: '🧾 Purchase Orders' },
  { value: 'sales_transactions', label: '💵 Sales Transactions' },
  { value: 'returns_refunds', label: '↩️ Returns & Refunds' },
  { value: 'user_management', label: '👥 User Management' },
  { value: 'security_events', label: '🛡️ Security Events' },
  { value: 'color_mixing', label: '🧪 Color Mixing' }
];

const AUDIT_ACTION_LABELS = {
  // Product Management
  PRODUCT_CREATE: 'Product Created',
  PRODUCT_UPDATE: 'Product Updated',
  PRODUCT_PRICE_CHANGE: 'Product Price Changed',
  PRODUCT_DEACTIVATE: 'Product Deactivated',
  PRODUCT_REACTIVATE: 'Product Reactivated',
  PRODUCT_DISCONTINUE: 'Product Discontinued',
  PRODUCT_DELETE: 'Product Deleted',
  PRODUCT_REQUEST: 'Product Request Submitted',
  PRODUCT_APPROVE: 'Product Approved',
  PRODUCT_REJECT: 'Product Rejected',
  PRODUCT_PRICE_REQUEST: 'Price Change Requested',
  PRODUCT_PRICE_APPROVE: 'Price Change Approved',
  PRODUCT_PRICE_REJECT: 'Price Change Rejected',
  PRODUCT_EDIT_REQUEST: 'Product Edit Requested',
  PRODUCT_EDIT_APPROVE: 'Product Edit Approved',
  PRODUCT_EDIT_REJECT: 'Product Edit Rejected',
  PRODUCT_EDIT_CANCEL: 'Product Edit Cancelled',
  PRODUCT_SIZE_REQUEST: 'Container Size Requested',
  PRODUCT_SIZE_APPROVE: 'Container Size Approved',
  PRODUCT_SIZE_REJECT: 'Container Size Rejected',
  PRODUCT_BATCH_APPROVE: 'Batch Products Approved',

  // Inventory / Stock Movements
  STOCK_RECEIVE: 'Stock Received',
  STOCK_ADJUST: 'Stock Adjusted',
  STOCK_INCREASE: 'Stock Increased',
  STOCK_DECREASE: 'Stock Decreased',
  STOCK_THRESHOLD_CHANGE: 'Stock Threshold Changed',
  CONTAINER_SIZE_ADD: 'Container Size Added',
  CONTAINER_SIZE_REMOVE: 'Container Size Removed',
  STOCK_DISPOSE: 'Opened Stock Disposed',
  ADJ_REQUEST: 'Adjustment Requested',
  ADJ_APPROVE: 'Adjustment Approved',
  ADJ_REJECT: 'Adjustment Rejected',
  ADJ_BATCH_APPROVE: 'Batch Adjustments Approved',

  // Purchase Orders
  PO_CREATE: 'Purchase Order Created',
  PO_SUBMIT: 'Purchase Order Submitted',
  PO_APPROVE: 'Purchase Order Approved',
  PO_REJECT: 'Purchase Order Rejected',
  PO_RECEIVE: 'Purchase Order Received',
  PO_CANCEL: 'Purchase Order Cancelled',
  PO_BATCH_APPROVE: 'Batch POs Authorized',

  // Sales & Returns
  SALE: 'Sale Completed',
  SALE_COMPLETE: 'Sale Completed',
  RECEIPT_GENERATED: 'Receipt Generated',
  SALE_VOID: 'Sale Voided',
  SALE_REFUND: 'Sale Refunded',
  PARTIAL_REFUND: 'Partial Refund Processed',

  // User & Supplier Management
  USER_CREATE: 'User Created',
  USER_UPDATE: 'User Updated',
  USER_DEACTIVATE: 'User Deactivated',
  USER_REACTIVATE: 'User Reactivated',
  USER_ROLE_CHANGE: 'User Role Changed',
  USER_STATUS: 'User Status Changed',
  SUPPLIER_CREATE: 'Supplier Created',
  SUPPLIER_UPDATE: 'Supplier Updated',
  SUPPLIER_STATUS: 'Supplier Status Changed',

  // Security Events
  LOGIN: 'User Login',
  LOGOUT: 'User Logout',
  LOGIN_FAILED: 'Failed Login Attempt',
  PASSWORD_CHANGE: 'Password Changed',
  UNAUTHORIZED_ACCESS: 'Unauthorized Access Attempt',

  // Color Mixing
  MIXING_START: 'Mixing Started',
  MIXING_COMPLETE: 'Mixing Completed',
  MIXING_CANCEL: 'Mixing Cancelled'
};

const AUDIT_ACTIONS = [
  // Security & Auth
  'LOGIN', 'LOGOUT', 'LOGIN_FAILED', 'PASSWORD_CHANGE', 'UNAUTHORIZED_ACCESS',
  // Product Management
  'PRODUCT_CREATE', 'PRODUCT_UPDATE', 'PRODUCT_PRICE_CHANGE', 'PRODUCT_DEACTIVATE', 'PRODUCT_REACTIVATE', 'PRODUCT_DISCONTINUE', 'PRODUCT_DELETE',
  'PRODUCT_REQUEST', 'PRODUCT_APPROVE', 'PRODUCT_REJECT', 'PRODUCT_PRICE_REQUEST', 'PRODUCT_PRICE_APPROVE', 'PRODUCT_PRICE_REJECT',
  // Inventory
  'STOCK_RECEIVE', 'STOCK_ADJUST', 'STOCK_INCREASE', 'STOCK_DECREASE', 'STOCK_THRESHOLD_CHANGE', 'CONTAINER_SIZE_ADD', 'CONTAINER_SIZE_REMOVE', 'STOCK_DISPOSE',
  'ADJ_REQUEST', 'ADJ_APPROVE', 'ADJ_REJECT',
  // Purchase Orders
  'PO_CREATE', 'PO_SUBMIT', 'PO_APPROVE', 'PO_REJECT', 'PO_RECEIVE', 'PO_CANCEL',
  // Sales & Refunds
  'SALE', 'RECEIPT_GENERATED', 'SALE_REFUND', 'PARTIAL_REFUND',
  // User & Supplier Management
  'USER_CREATE', 'USER_UPDATE', 'USER_DEACTIVATE', 'USER_REACTIVATE', 'USER_ROLE_CHANGE', 'USER_STATUS',
  'SUPPLIER_CREATE', 'SUPPLIER_UPDATE', 'SUPPLIER_STATUS',
  // Color Mixing
  'MIXING_START', 'MIXING_COMPLETE', 'MIXING_CANCEL'
];

function formatAuditActionLabel(action) {
  const a = String(action || '').toUpperCase();
  if (AUDIT_ACTION_LABELS[a]) return AUDIT_ACTION_LABELS[a];
  return a.replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
}

function formatAuditRoleBadge(role) {
  const r = String(role || '').toLowerCase();
  if (r === 'admin' || r === 'administrator') {
    return `<span class="audit-role-badge role-admin">Administrator</span>`;
  }
  if (r === 'cashier') {
    return `<span class="audit-role-badge role-cashier">Cashier</span>`;
  }
  if (r === 'staff' || r === 'inventory staff') {
    return `<span class="audit-role-badge role-staff">Inventory Staff</span>`;
  }
  if (r === 'unauthenticated' || !r) {
    return `<span class="audit-role-badge role-unauth">Unauthenticated</span>`;
  }
  return `<span class="audit-role-badge">${escapeHtml(role)}</span>`;
}

function auditActClass(a) {
  const act = String(a || '').toUpperCase();
  if (act === 'LOGIN' || act === 'LOGOUT') return 'auth';
  if (act === 'LOGIN_FAILED' || act === 'UNAUTHORIZED_ACCESS') return 'security-alert';
  if (act === 'PASSWORD_CHANGE' || act === 'USER_ROLE_CHANGE') return 'security';
  if (act.startsWith('MIXING_')) return act === 'MIXING_CANCEL' ? 'cancel' : 'mixing';
  if (act === 'SALE_REFUND' || act === 'PARTIAL_REFUND' || act === 'SALE_VOID') return 'refund';
  if (act === 'SALE' || act === 'SALE_COMPLETE' || act === 'RECEIPT_GENERATED') return 'sale';
  if (act.startsWith('PO_')) {
    if (act === 'PO_CANCEL' || act === 'PO_REJECT') return 'cancel';
    if (act === 'PO_APPROVE' || act === 'PO_RECEIVE' || act === 'PO_BATCH_APPROVE') return 'approve';
    return 'po';
  }
  if (act.startsWith('STOCK_') || act.startsWith('CONTAINER_SIZE_') || act.startsWith('ADJ_')) {
    if (act === 'STOCK_DECREASE' || act === 'CONTAINER_SIZE_REMOVE' || act === 'STOCK_DISPOSE' || act === 'ADJ_REJECT') return 'cancel';
    if (act === 'STOCK_RECEIVE' || act === 'STOCK_INCREASE' || act === 'CONTAINER_SIZE_ADD' || act === 'ADJ_APPROVE' || act === 'ADJ_BATCH_APPROVE') return 'create';
    return 'stock';
  }
  if (act === 'PRODUCT_DELETE' || act.endsWith('_DELETE') || act.endsWith('_REJECT')) return 'cancel';
  if (act === 'PRODUCT_PRICE_CHANGE' || act.endsWith('_UPDATE') || act === 'PRODUCT_UPDATE') return 'update';
  if (act.endsWith('_CREATE') || act === 'PRODUCT_CREATE' || act === 'PRODUCT_REACTIVATE' || act === 'USER_REACTIVATE' || act.endsWith('_APPROVE')) return 'create';
  if (act.endsWith('_STATUS') || act === 'PRODUCT_DEACTIVATE' || act === 'PRODUCT_DISCONTINUE' || act === 'USER_DEACTIVATE') return 'status';
  return '';
}

function thisMonthStartISO() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

function formatAuditDateReadable(iso) {
  if (!iso) return '';
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatAuditDateSummary() {
  return formatDateRangeSummary(auditFilters.from, auditFilters.to, 'Date filter:');
}

function getAuditDatePreset() {
  return getDateRangePreset(auditFilters.from, auditFilters.to);
}

function getAuditSelectedYear() {
  const curY = getCurrentYear();
  if (auditYearFilter === 'current' || !auditYearFilter) return curY;
  const y = parseInt(auditYearFilter, 10);
  if (!isNaN(y)) return y;
  if (auditFilters.from && auditFilters.from.length >= 4) {
    const yf = parseInt(auditFilters.from.slice(0, 4), 10);
    if (!isNaN(yf)) return yf;
  }
  return curY;
}

function openAuditCalendar(target, anchorEl, event) {
  openAppMonthDayPicker({
    target: target,
    anchorEl: anchorEl || document.getElementById(target === 'from' ? 'al-from-wrap' : 'al-to-wrap'),
    event: event,
    currentDate: (target === 'from' ? auditFilters.from : auditFilters.to),
    otherDate: (target === 'from' ? auditFilters.to : auditFilters.from),
    selectedYear: getAuditSelectedYear,
    onSelect: function (iso) {
      if (target === 'from') {
        auditFilters.from = iso;
        if (auditFilters.to && auditFilters.from > auditFilters.to) auditFilters.to = auditFilters.from;
      } else {
        auditFilters.to = iso;
        if (auditFilters.from && auditFilters.to < auditFilters.from) auditFilters.from = auditFilters.to;
      }
      resetPaginationPage('audit_log');
      syncAuditDateInputs();
      loadAuditLogs();
    }
  });
}

function onAuditYearChange(val) {
  closeAppMonthDayPicker();
  const curY = getCurrentYear();
  if (val === 'all') {
    auditFilters.from = '';
    auditFilters.to = '';
    auditYearFilter = 'all';
  } else {
    const targetYear = (val === 'current') ? curY : (parseInt(val, 10) || curY);
    auditYearFilter = (val === 'current') ? 'current' : String(targetYear);
    auditFilters.from = updateDateYearISO(auditFilters.from, targetYear, '01-01');
    auditFilters.to = updateDateYearISO(auditFilters.to, targetYear, (targetYear === curY ? todayISO().slice(5) : '12-31'));
    if (auditFilters.from && auditFilters.to && auditFilters.from > auditFilters.to) {
      auditFilters.from = auditFilters.to;
    }
  }
  resetPaginationPage('audit_log');
  syncAuditDateInputs();
  loadAuditLogs();
}

function toggleAuditHistoricalRecords() {
  if (isHistoricalView(auditFilters.from, auditFilters.to)) {
    setAuditDatePreset('year');
  } else {
    auditFilters.from = '';
    auditFilters.to = '';
    auditYearFilter = 'all';
    resetPaginationPage('audit_log');
    syncAuditDateInputs();
    loadAuditLogs();
  }
}

function updateAuditDatePresetsUI() {
  const activePreset = getAuditDatePreset();
  document.querySelectorAll('.audit-date-btn').forEach(btn => {
    const p = btn.getAttribute('data-preset');
    if (p === activePreset) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  const yearSelect = document.getElementById('al-year-select');
  if (yearSelect) {
    if (!auditFilters.from && !auditFilters.to) {
      yearSelect.value = 'all';
      auditYearFilter = 'all';
    } else if (auditYearFilter && auditYearFilter !== 'custom') {
      yearSelect.value = auditYearFilter;
    } else {
      yearSelect.value = 'current';
      auditYearFilter = 'current';
    }
  }

  const histBtn = document.getElementById('al-historical-btn');
  if (histBtn) {
    if (isHistoricalView(auditFilters.from, auditFilters.to)) {
      histBtn.classList.add('active');
    } else {
      histBtn.classList.remove('active');
    }
  }

  const summaryEl = document.getElementById('audit-date-summary');
  if (summaryEl) {
    summaryEl.innerHTML = formatAuditDateSummary();
  }
  const clearBtn = document.getElementById('audit-clear-date-btn');
  if (clearBtn) {
    clearBtn.style.display = (auditFilters.from || auditFilters.to) ? 'inline-flex' : 'none';
  }
}

function syncAuditDateInputs() {
  const fromEl = document.getElementById('al-from');
  const toEl = document.getElementById('al-to');
  if (fromEl) {
    fromEl.value = formatDateInputMMDDYYYY(auditFilters.from);
  }
  if (toEl) {
    toEl.value = formatDateInputMMDDYYYY(auditFilters.to);
  }
  updateAuditDatePresetsUI();
}

function setAuditDatePreset(preset) {
  const today = todayISO();
  const curY = getCurrentYear();
  if (preset === 'today') {
    auditFilters.from = today;
    auditFilters.to = today;
    auditYearFilter = 'current';
  } else if (preset === 'yesterday') {
    const yest = daysAgoISO(1);
    auditFilters.from = yest;
    auditFilters.to = yest;
    auditYearFilter = 'current';
  } else if (preset === '7d') {
    auditFilters.from = daysAgoISO(6);
    auditFilters.to = today;
    auditYearFilter = 'current';
  } else if (preset === '30d') {
    auditFilters.from = daysAgoISO(29);
    auditFilters.to = today;
    auditYearFilter = 'current';
  } else if (preset === 'month') {
    auditFilters.from = thisMonthStartISO();
    auditFilters.to = today;
    auditYearFilter = 'current';
  } else if (preset === 'year') {
    auditFilters.from = currentYearStartISO(curY);
    auditFilters.to = currentYearEndISO(curY);
    auditYearFilter = 'current';
  } else if (preset === 'all') {
    auditFilters.from = '';
    auditFilters.to = '';
    auditYearFilter = 'all';
  }
  resetPaginationPage('audit_log');
  syncAuditDateInputs();
  loadAuditLogs();
}

function onAuditDateChange() {
  const fromEl = document.getElementById('al-from');
  const toEl = document.getElementById('al-to');
  let f = fromEl ? fromEl.value : '';
  let t = toEl ? toEl.value : '';
  if (f && t && f > t) {
    const tmp = f;
    f = t;
    t = tmp;
    if (fromEl) fromEl.value = f;
    if (toEl) toEl.value = t;
  }
  auditFilters.from = f;
  auditFilters.to = t;
  resetPaginationPage('audit_log');
  updateAuditDatePresetsUI();
  loadAuditLogs();
}

function clearAuditDates() {
  setAuditDatePreset('all');
}

function resetAllAuditFilters() {
  const curY = getCurrentYear();
  auditFilters = {
    category: '',
    action: '',
    user: '',
    from: currentYearStartISO(curY),
    to: currentYearEndISO(curY),
    q: ''
  };
  auditYearFilter = 'current';
  resetPaginationPage('audit_log');
  renderPage();
}

function auditLogPage() {
  if (typeof currentUser === 'undefined' || !currentUser || currentUser.role !== 'admin') {
    logAudit(
      'UNAUTHORIZED_ACCESS',
      'Audit Log',
      `Unauthorized attempt to view Audit Log module by ${(currentUser && currentUser.name) || 'Unauthenticated User'}`,
      {
        entityName: 'Audit Log Module',
        fieldChanged: 'Security Access Control',
        oldValue: `Role: ${(currentUser && currentUser.role) || 'none'}`,
        newValue: 'Access Denied (Administrator Only)',
        reason: 'Non-administrator user attempted to view Audit Log'
      }
    );
    return `
      <div class="panel" style="padding:40px; text-align:center;">
        <h3>🔒 Access Restricted</h3>
        <p class="muted">Audit Log records are restricted to authorized Administrators only.</p>
      </div>`;
  }

  setTimeout(() => loadAuditLogs(), 0);
  const curY = getCurrentYear();
  const selectedYear = getAuditSelectedYear();
  const availableYears = getAvailableRecordYears();
  const f = auditFilters;
  const activePreset = getAuditDatePreset();
  const hasDates = Boolean(f.from || f.to);
  const isHistorical = isHistoricalView(f.from, f.to);

  return `
<div class="audit-stats" id="audit-stats">
  <div class="audit-stat"><div class="audit-stat-head"><span>Total Audit Entries</span><span class="audit-stat-icon">📋</span></div><b>…</b><small class="audit-stat-sub">Loading period count…</small></div>
  <div class="audit-stat"><div class="audit-stat-head"><span>Entries Today</span><span class="audit-stat-icon">📅</span></div><b>…</b><small class="audit-stat-sub">Recorded today</small></div>
  <div class="audit-stat"><div class="audit-stat-head"><span>Active Users</span><span class="audit-stat-icon">👥</span></div><b>…</b><small class="audit-stat-sub">Distinct users in period</small></div>
  <div class="audit-stat"><div class="audit-stat-head"><span>Total Sales Transactions</span><span class="audit-stat-icon">💵</span></div><b>…</b><small class="audit-stat-sub">Sales completed in period</small></div>
</div>
<div class="panel" id="audit-panel" style="padding:0; overflow:hidden;">
  <div class="panel-head row wrap" style="padding:14px 16px 0; gap:8px;">
    <div>
      <h3 style="margin:0;">Audit Log</h3>
      <span class="muted small">Append-only security &amp; operational activity trail across all system modules</span>
    </div>
    <div class="spacer"></div>
    <div class="row" style="gap:6px;">
      <button type="button" class="btn ghost small" onclick="exportAuditCsv()" title="Export all matching audit entries to CSV">⬇ Export CSV</button>
      <button type="button" class="btn secondary small" onclick="loadAuditLogs()" title="Refresh audit log entries">↻ Refresh</button>
    </div>
  </div>

  <div class="audit-filter-box">
    <!-- Primary Filter Row: Search, User, Category, Specific Action, Reset -->
    <div class="audit-filter-primary">
      <input id="al-q" class="audit-search" placeholder="🔍 Search by entity, activity details, user, reference…" value="${escapeHtml(f.q)}" oninput="debouncedAuditFilter()">
      <input id="al-user" class="audit-user-input" placeholder="👤 Filter by user" value="${escapeHtml(f.user)}" oninput="debouncedAuditFilter()">
      <select id="al-category" class="audit-category-select" onchange="setAuditFilter()" title="Filter by activity category">
        ${AUDIT_CATEGORIES.map(c => `<option value="${c.value}" ${f.category === c.value ? 'selected' : ''}>${c.label}</option>`).join('')}
      </select>
      <select id="al-action" class="audit-action-select" onchange="setAuditFilter()" title="Filter by specific action">
        <option value="">⚡ All Actions</option>
        ${AUDIT_ACTIONS.map(a => `<option value="${a}" ${f.action === a ? 'selected' : ''}>${escapeHtml(formatAuditActionLabel(a))} (${a})</option>`).join('')}
      </select>
      <button type="button" class="btn ghost small" onclick="resetAllAuditFilters()" title="Reset all search and filter fields to current year">Reset All</button>
    </div>

    <!-- Second Row: Dedicated Date Range Bar, Year Selector & Historical Records Option -->
    <div class="audit-date-bar">
      <div class="audit-date-group">
        <!-- Year Selector (Defaults to Current Year) -->
        <div class="audit-year-wrap">
          <label for="al-year-select" class="audit-date-label">📅 Year:</label>
          <select id="al-year-select" class="audit-year-select" onchange="onAuditYearChange(this.value)" title="Filter audit log by calendar year">
            <option value="current" ${auditYearFilter === 'current' ? 'selected' : ''}>${curY} (Current Year)</option>
            ${availableYears.filter(y => y !== curY).map(y => `<option value="${y}" ${auditYearFilter === String(y) ? 'selected' : ''}>${y}</option>`).join('')}
            <option value="all" ${auditYearFilter === 'all' ? 'selected' : ''}>All Recorded Years</option>
          </select>
        </div>

        <span class="audit-date-sep">|</span>

        <label class="audit-date-label">Date Range:</label>
        <div class="audit-date-field app-monthday-picker-field" id="al-from-wrap" title="Click to select Month and Day (Year: ${selectedYear})" onclick="openAuditCalendar('from', this, event)">
          <span class="field-tag">From</span>
          <input id="al-from"
            type="text"
            class="app-monthday-input"
            placeholder="MM/DD/YYYY"
            value="${formatDateInputMMDDYYYY(f.from)}"
            readonly
            onclick="openAuditCalendar('from', this, event)">
          <button type="button" class="app-cal-trigger-btn" onclick="openAuditCalendar('from', document.getElementById('al-from-wrap'), event)" title="Open calendar (Month and Day)">📅</button>
        </div>
        <span class="audit-date-sep">to</span>
        <div class="audit-date-field app-monthday-picker-field" id="al-to-wrap" title="Click to select Month and Day (Year: ${selectedYear})" onclick="openAuditCalendar('to', this, event)">
          <span class="field-tag">To</span>
          <input id="al-to"
            type="text"
            class="app-monthday-input"
            placeholder="MM/DD/YYYY"
            value="${formatDateInputMMDDYYYY(f.to)}"
            readonly
            onclick="openAuditCalendar('to', this, event)">
          <button type="button" class="app-cal-trigger-btn" onclick="openAuditCalendar('to', document.getElementById('al-to-wrap'), event)" title="Open calendar (Month and Day)">📅</button>
        </div>
        <button type="button" id="audit-clear-date-btn" class="audit-clear-date-btn" onclick="clearAuditDates()" title="Show all time" style="display:${hasDates ? 'inline-flex' : 'none'};">✕</button>
      </div>

      <div class="audit-date-shortcuts">
        <button type="button" class="audit-date-btn ${activePreset === 'today' ? 'active' : ''}" data-preset="today" onclick="setAuditDatePreset('today')" title="Events logged today">Today</button>
        <button type="button" class="audit-date-btn ${activePreset === 'yesterday' ? 'active' : ''}" data-preset="yesterday" onclick="setAuditDatePreset('yesterday')" title="Events logged yesterday">Yesterday</button>
        <button type="button" class="audit-date-btn ${activePreset === '7d' ? 'active' : ''}" data-preset="7d" onclick="setAuditDatePreset('7d')" title="Last 7 days">7D</button>
        <button type="button" class="audit-date-btn ${activePreset === '30d' ? 'active' : ''}" data-preset="30d" onclick="setAuditDatePreset('30d')" title="Last 30 days">30D</button>
        <button type="button" class="audit-date-btn ${activePreset === 'month' ? 'active' : ''}" data-preset="month" onclick="setAuditDatePreset('month')" title="This month to date">This Month</button>
        <button type="button" class="audit-date-btn ${activePreset === 'year' ? 'active' : ''}" data-preset="year" onclick="setAuditDatePreset('year')" title="Current year audit logs">This Year (${curY})</button>
        <button type="button" class="audit-date-btn ${activePreset === 'custom' ? 'active' : ''}" data-preset="custom" onclick="openAuditCalendar('from', document.getElementById('al-from-wrap'), event)" title="Custom date range">Custom Range</button>

        <!-- Separate Historical Records viewing option for authorized users -->
        <button type="button" id="al-historical-btn" class="audit-historical-btn ${isHistorical ? 'active' : ''}" onclick="toggleAuditHistoricalRecords()" title="View complete historical audit logs across all previous years">
          🏛️ Historical Records
        </button>
      </div>

      <div class="audit-date-info" id="audit-date-summary">
        ${formatAuditDateSummary()}
      </div>
    </div>
  </div>

  ${isHistorical ? `
    <div class="historical-records-banner">
      <div>
        🏛️ <b>Historical Audit Records:</b> Showing ${!f.from && !f.to ? 'All-Time' : (f.from.slice(0, 4) === f.to.slice(0, 4) ? `Year ${f.from.slice(0, 4)}` : `${formatDateReadable(f.from)} – ${formatDateReadable(f.to)}`)} events. All system audit trail events are permanently retained and cannot be overwritten.
      </div>
      <button type="button" class="btn ghost small" onclick="setAuditDatePreset('year')" style="color:#7B4F09; border-color:#D19A42; background:#fff;">Return to Current Year (${curY}) &rarr;</button>
    </div>
  ` : ''}

  <div class="audit-table-wrap" id="audit-table-wrap"><table>
    <thead>
      <tr>
        <th>Date &amp; Time</th>
        <th>User</th>
        <th>Role</th>
        <th>Action</th>
        <th>Entity</th>
        <th>Activity Details</th>
        <th class="right">Actions</th>
      </tr>
    </thead>
    <tbody id="audit-body"><tr><td colspan="7" class="audit-empty">Loading...</td></tr></tbody>
  </table></div>
  <div id="audit-pagination-wrap"></div>
</div>`;
}

let auditTimer = null;
let auditRequestSeq = 0;
function debouncedAuditFilter() { clearTimeout(auditTimer); auditTimer = setTimeout(setAuditFilter, 300); }

function setAuditFilter() {
  const v = id => (document.getElementById(id) || {}).value || '';
  auditFilters.q = v('al-q').trim();
  auditFilters.user = v('al-user').trim();
  auditFilters.category = v('al-category');
  auditFilters.action = v('al-action');
  resetPaginationPage('audit_log');
  loadAuditLogs();
}

async function exportAuditCsv() {
  let exportRows = auditRows;
  try {
    const params = Object.entries(auditFilters).filter(([, v]) => v);
    params.push(['export', '1'], ['limit', '50000'], ['page', '1']);
    if (typeof currentUser !== 'undefined' && currentUser && currentUser.id) {
      params.push(['userId', currentUser.id]);
    }
    const qs = new URLSearchParams(params).toString();
    const r = await fetch('api/audit.php?' + qs);
    if (r.ok) {
      const data = await r.json();
      if (Array.isArray(data.logs)) exportRows = data.logs;
    }
  } catch (e) { }

  if (!exportRows || !exportRows.length) {
    if (typeof showToast === 'function') showToast('No matching audit records to export.', 'warn');
    return;
  }

  const q = s => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
  const headers = [
    'Date & Time',
    'User',
    'Role',
    'Action Code',
    'Action Label',
    'Entity',
    'Field Changed',
    'Previous Value',
    'New Value',
    'Reference No',
    'Reason',
    'Activity Details'
  ];
  const csvLines = [headers.map(q).join(',')];

  exportRows.forEach(l => {
    const entityText = cleanAuditDisplayString(l.display_entity || l.entity_name || l.entity || '');
    const detailsText = cleanAuditDisplayString(l.display_details || l.details || '');
    csvLines.push([
      l.created_at || '',
      l.user_name || 'System',
      l.user_role || '',
      l.action || '',
      formatAuditActionLabel(l.action || ''),
      entityText,
      l.field_changed || '',
      l.old_value || '',
      l.new_value || '',
      l.reference_no || '',
      l.reason || '',
      detailsText
    ].map(q).join(','));
  });

  const csv = '\uFEFF' + csvLines.join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  let filename = 'mrgr-audit-log';
  if (auditFilters.category) filename += `_${auditFilters.category}`;
  if (auditFilters.action) filename += `_${auditFilters.action.toLowerCase()}`;
  if (auditFilters.from && auditFilters.to) {
    filename += `_${auditFilters.from}_to_${auditFilters.to}`;
  } else if (auditFilters.from) {
    filename += `_from_${auditFilters.from}`;
  } else if (auditFilters.to) {
    filename += `_to_${auditFilters.to}`;
  }
  a.download = `${filename}.csv`;
  a.click();
  if (typeof showToast === 'function') {
    showToast(`Exported ${exportRows.length.toLocaleString()} audit record(s) to CSV.`, 'ok');
  }
}

function renderAuditDiffChip(l) {
  const oldVal = l.old_value != null ? String(l.old_value).trim() : '';
  const newVal = l.new_value != null ? String(l.new_value).trim() : '';
  if (!oldVal && !newVal) return '';
  const fieldPrefix = l.field_changed ? `<span class="audit-diff-field">${escapeHtml(l.field_changed)}:</span> ` : '';
  if (oldVal && newVal && oldVal !== newVal) {
    return `<div class="audit-inline-diff">${fieldPrefix}<span class="audit-val-old">${escapeHtml(oldVal)}</span> <span class="audit-val-arrow">&rarr;</span> <span class="audit-val-new">${escapeHtml(newVal)}</span></div>`;
  }
  if (newVal) {
    return `<div class="audit-inline-diff">${fieldPrefix}<span class="audit-val-new">${escapeHtml(newVal)}</span></div>`;
  }
  return '';
}

function openAuditDetailModal(idx) {
  const l = auditRows[idx];
  if (!l) return;

  const d = new Date(String(l.created_at).replace(' ', 'T'));
  const dateFormatted = !isNaN(d.getTime())
    ? d.toLocaleDateString('en-PH', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })
    : String(l.created_at || '');
  const timeFormatted = !isNaN(d.getTime())
    ? d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '';

  const userName = l.user_name || 'Unknown User';
  const actionLabel = formatAuditActionLabel(l.action);
  const entityDisplay = cleanAuditDisplayString(l.display_entity || l.entity_name || l.entity || 'System');
  const detailsDisplay = cleanAuditDisplayString(l.display_details || l.details || '');
  const hasBeforeAfter = Boolean((l.old_value && String(l.old_value).trim()) || (l.new_value && String(l.new_value).trim()));
  const hasFieldChanged = Boolean(l.field_changed && String(l.field_changed).trim());
  const hasRef = Boolean(l.reference_no && String(l.reference_no).trim());
  const hasReason = Boolean(l.reason && String(l.reason).trim());

  const meta = (l.meta && typeof l.meta === 'object') ? l.meta : null;
  const changesList = (meta && Array.isArray(meta.changes) && meta.changes.length > 0) ? meta.changes : [];
  const saleItemsList = (meta && Array.isArray(meta.items) && meta.items.length > 0) ? meta.items : [];
  const returnedItemsList = (meta && Array.isArray(meta.returnedItems) && meta.returnedItems.length > 0) ? meta.returnedItems : [];

  const bodyHtml = `
    <div class="audit-detail-modal">
      <div class="audit-detail-banner">
        <div class="audit-detail-banner-left">
          <span class="audit-act ${auditActClass(l.action)}" style="font-size:12px; padding:4px 11px;">${escapeHtml(actionLabel)}</span>
          <code class="audit-detail-code">${escapeHtml(l.action || '')}</code>
        </div>
        <div class="audit-detail-timestamp">
          📅 <b>${escapeHtml(dateFormatted)}</b> ${timeFormatted ? `at <b>${escapeHtml(timeFormatted)}</b>` : ''}
        </div>
      </div>

      <div class="audit-detail-description-box">
        <div class="audit-detail-section-label">Complete Activity Description</div>
        <div class="audit-detail-description-text">${escapeHtml(detailsDisplay || actionLabel)}</div>
      </div>

      <div class="audit-detail-grid">
        <div class="audit-detail-card">
          <div class="audit-detail-label">Performed By</div>
          <div class="audit-detail-value" style="display:flex; align-items:center; gap:8px;">
            <span class="audit-avatar">${escapeHtml(userName.charAt(0).toUpperCase())}</span>
            <div>
              <div style="font-weight:700;">${escapeHtml(userName)}</div>
              <div style="margin-top:2px;">${formatAuditRoleBadge(l.user_role)}</div>
            </div>
          </div>
        </div>

        <div class="audit-detail-card">
          <div class="audit-detail-label">Entity Affected</div>
          <div class="audit-detail-value" style="font-weight:700; font-size:14px;">${escapeHtml(entityDisplay)}</div>
          ${l.entity && l.entity !== entityDisplay ? `<div class="muted small" style="margin-top:2px;">Module / Type: ${escapeHtml(l.entity)}</div>` : ''}
        </div>

        ${hasFieldChanged ? `
        <div class="audit-detail-card">
          <div class="audit-detail-label">Field / Attribute Changed</div>
          <div class="audit-detail-value" style="font-weight:600; color:var(--teal-dark);">${escapeHtml(l.field_changed)}</div>
        </div>
        ` : ''}

        ${hasRef ? `
        <div class="audit-detail-card">
          <div class="audit-detail-label">Transaction Reference</div>
          <div class="audit-detail-value">
            <span class="audit-ref-pill">${escapeHtml(l.reference_no)}</span>
          </div>
        </div>
        ` : ''}
      </div>

      ${hasBeforeAfter ? `
      <div class="audit-before-after-box">
        <div class="audit-detail-section-label" style="margin-bottom:8px;">Before &amp; After Value Tracking</div>
        <div class="audit-before-after-grid">
          <div class="audit-ba-pane audit-ba-old">
            <div class="audit-ba-header">Previous Value</div>
            <div class="audit-ba-content">${l.old_value ? escapeHtml(l.old_value) : '<span class="muted">None / Not Applicable</span>'}</div>
          </div>
          <div class="audit-ba-arrow-col">➔</div>
          <div class="audit-ba-pane audit-ba-new">
            <div class="audit-ba-header">New Value</div>
            <div class="audit-ba-content">${l.new_value ? escapeHtml(l.new_value) : '<span class="muted">None / Removed</span>'}</div>
          </div>
        </div>
      </div>
      ` : ''}

      ${changesList.length > 1 ? `
      <div style="margin-top:12px;">
        <div class="audit-detail-section-label" style="margin-bottom:6px;">Detailed Field Breakdown (${changesList.length} changes)</div>
        <div style="border:1px solid var(--line); border-radius:6px; overflow:hidden;">
          <table style="width:100%; font-size:12.5px;">
            <thead>
              <tr style="background:#F5F1E9;">
                <th style="padding:7px 10px;">Field / Item</th>
                <th style="padding:7px 10px;">Previous Value</th>
                <th style="padding:7px 10px;">New Value</th>
              </tr>
            </thead>
            <tbody>
              ${changesList.map(ch => `
                <tr>
                  <td style="padding:6px 10px; font-weight:600;">${escapeHtml(ch.field || '')}</td>
                  <td style="padding:6px 10px; color:#9B1C1C;">${escapeHtml(ch.oldValue != null ? String(ch.oldValue) : '—')}</td>
                  <td style="padding:6px 10px; color:#03543F; font-weight:600;">${escapeHtml(ch.newValue != null ? String(ch.newValue) : '—')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
      ` : ''}

      ${saleItemsList.length > 0 ? `
      <div style="margin-top:12px;">
        <div class="audit-detail-section-label" style="margin-bottom:6px;">Transaction Line Items (${saleItemsList.length})</div>
        <div style="border:1px solid var(--line); border-radius:6px; overflow:hidden;">
          <table style="width:100%; font-size:12.5px;">
            <thead>
              <tr style="background:#F5F1E9;">
                <th style="padding:7px 10px;">Item</th>
                <th style="padding:7px 10px;" class="right">Qty / Size</th>
                <th style="padding:7px 10px;" class="right">Unit Price</th>
                <th style="padding:7px 10px;" class="right">Line Total</th>
              </tr>
            </thead>
            <tbody>
              ${saleItemsList.map(it => `
                <tr>
                  <td style="padding:6px 10px; font-weight:600;">${escapeHtml(it.name || '')}</td>
                  <td style="padding:6px 10px;" class="right">${escapeHtml(String(it.qty || 0))}${it.size ? ` × ${escapeHtml(String(it.size))}L` : 'L'}</td>
                  <td style="padding:6px 10px;" class="right">${typeof peso === 'function' ? peso(it.unitPrice || 0) : it.unitPrice}</td>
                  <td style="padding:6px 10px; font-weight:600;" class="right">${typeof peso === 'function' ? peso(it.lineTotal || 0) : it.lineTotal}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
      ` : ''}

      ${returnedItemsList.length > 0 ? `
      <div style="margin-top:12px;">
        <div class="audit-detail-section-label" style="margin-bottom:6px;">Returned Items (${returnedItemsList.length})</div>
        <div style="border:1px solid var(--line); border-radius:6px; overflow:hidden;">
          <table style="width:100%; font-size:12.5px;">
            <thead>
              <tr style="background:#F5F1E9;">
                <th style="padding:7px 10px;">Returned Product</th>
                <th style="padding:7px 10px;" class="right">Returned Qty</th>
                <th style="padding:7px 10px;" class="right">Refund Credit</th>
              </tr>
            </thead>
            <tbody>
              ${returnedItemsList.map(it => `
                <tr>
                  <td style="padding:6px 10px; font-weight:600;">${escapeHtml(it.name || '')}</td>
                  <td style="padding:6px 10px;" class="right">${escapeHtml(String(it.qty || 0))}${it.size ? ` × ${escapeHtml(String(it.size))}L` : 'L'}</td>
                  <td style="padding:6px 10px; font-weight:600; color:var(--danger);" class="right">${typeof peso === 'function' ? peso(it.lineRefund || 0) : it.lineRefund}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
      ` : ''}

      ${hasReason ? `
      <div class="audit-reason-box">
        <div class="audit-detail-section-label">Reason / Remarks</div>
        <div style="font-size:13px; color:var(--ink); margin-top:3px;">${escapeHtml(l.reason)}</div>
      </div>
      ` : ''}
    </div>
  `;

  openModal(
    '🔎 Audit Activity Details',
    bodyHtml,
    `<button type="button" class="btn secondary" onclick="closeModal()">Close</button>`
  );
}

async function loadAuditLogs() {
  const reqId = ++auditRequestSeq;
  const pagState = getPaginationState('audit_log', 10);
  pagState.loading = true;
  pagState.onUpdate = loadAuditLogs;
  pagState.scrollTarget = '#audit-panel';
  pagState.recordLabel = 'entries';

  const pagWrap = document.getElementById('audit-pagination-wrap');
  if (pagWrap) {
    pagWrap.innerHTML = renderPaginationControls('audit_log', {
      loading: true,
      onUpdate: loadAuditLogs,
      scrollTarget: '#audit-panel',
      recordLabel: 'entries'
    });
  }

  const params = Object.entries(auditFilters).filter(([, v]) => v);
  params.push(['page', String(pagState.page)], ['limit', String(pagState.pageSize)]);
  if (typeof currentUser !== 'undefined' && currentUser && currentUser.id) {
    params.push(['userId', currentUser.id]);
  }
  const qs = new URLSearchParams(params).toString();

  let rows = [];
  let total = 0;
  let serverStats = null;
  try {
    const r = await fetch('api/audit.php?' + qs);
    const data = await r.json();
    if (reqId !== auditRequestSeq) return; // Discard stale overlapping response
    rows = data.logs || [];
    total = typeof data.total === 'number' ? data.total : rows.length;
    if (typeof data.page === 'number') pagState.page = data.page;
    if (data.stats) serverStats = data.stats;
  } catch (e) {
    if (reqId !== auditRequestSeq) return;
  }

  pagState.loading = false;
  auditRows = rows;

  const body = document.getElementById('audit-body');
  if (!body) return;

  const dbTotal = serverStats && typeof serverStats.dbTotal === 'number' ? serverStats.dbTotal : total;
  const todayCount = serverStats ? serverStats.today : rows.filter(l => String(l.created_at).slice(0, 10) === todayISO()).length;
  const usersCount = serverStats ? serverStats.users : new Set(rows.map(l => l.user_name).filter(Boolean)).size;
  const salesCount = serverStats ? serverStats.sales : rows.filter(l => l.action === 'SALE' || l.action === 'SALE_COMPLETE').length;

  const hasFilter = Boolean(auditFilters.category || auditFilters.action || auditFilters.user || auditFilters.q || auditFilters.from || auditFilters.to);
  const periodSub = hasFilter && dbTotal !== total
    ? `Matching period/filter (of ${Number(dbTotal).toLocaleString()} total in DB)`
    : `Total audit records in database`;

  const stats = document.getElementById('audit-stats');
  if (stats) {
    stats.innerHTML = `
      <div class="audit-stat">
        <div class="audit-stat-head"><span>Total Audit Entries</span><span class="audit-stat-icon">📋</span></div>
        <b>${Number(total).toLocaleString()}</b>
        <small class="audit-stat-sub">${escapeHtml(periodSub)}</small>
      </div>
      <div class="audit-stat">
        <div class="audit-stat-head"><span>Entries Today</span><span class="audit-stat-icon">📅</span></div>
        <b>${Number(todayCount).toLocaleString()}</b>
        <small class="audit-stat-sub">Activities logged today (${formatAuditDateReadable(todayISO())})</small>
      </div>
      <div class="audit-stat">
        <div class="audit-stat-head"><span>Active Users</span><span class="audit-stat-icon">👥</span></div>
        <b>${Number(usersCount).toLocaleString()}</b>
        <small class="audit-stat-sub">Distinct users active in selected period</small>
      </div>
      <div class="audit-stat">
        <div class="audit-stat-head"><span>Total Sales Transactions</span><span class="audit-stat-icon">💵</span></div>
        <b>${Number(salesCount).toLocaleString()}</b>
        <small class="audit-stat-sub">Sales completed in selected period</small>
      </div>`;
  }

  updateAuditDatePresetsUI();

  body.innerHTML = rows.length ? rows.map((l, idx) => {
    const d = new Date(String(l.created_at).replace(' ', 'T'));
    const dateStr = !isNaN(d.getTime())
      ? d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
      : String(l.created_at || '').slice(0, 10);
    const timeStr = !isNaN(d.getTime())
      ? d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      : String(l.created_at || '').slice(11);
    const nm = l.user_name || 'Unknown';
    const entityText = cleanAuditDisplayString(l.display_entity || l.entity_name || l.entity || '—');
    const detailsText = cleanAuditDisplayString(l.display_details || l.details || '');
    const actionLabel = formatAuditActionLabel(l.action);
    const diffChipHtml = renderAuditDiffChip(l);
    const refBadgeHtml = l.reference_no
      ? `<span class="audit-ref-pill" title="Transaction Reference">${escapeHtml(l.reference_no)}</span> `
      : '';

    return `<tr>
      <td class="audit-time">${escapeHtml(dateStr)}<small>${escapeHtml(timeStr)}</small></td>
      <td>
        <div class="audit-user">
          <span class="audit-avatar">${escapeHtml(nm.charAt(0).toUpperCase())}</span>
          <div class="audit-user-name">${escapeHtml(nm)}</div>
        </div>
      </td>
      <td>${formatAuditRoleBadge(l.user_role)}</td>
      <td>
        <span class="audit-act ${auditActClass(l.action)}" title="${escapeHtml(l.action || '')}">
          ${escapeHtml(actionLabel)}
        </span>
      </td>
      <td class="audit-entity-cell">
        <div class="audit-entity-title">${escapeHtml(entityText)}</div>
        ${l.entity && l.entity !== entityText ? `<div class="muted small" style="font-size:11px;">${escapeHtml(l.entity)}</div>` : ''}
      </td>
      <td class="audit-details-cell">
        <div class="audit-details-main">${refBadgeHtml}${escapeHtml(detailsText)}</div>
        ${diffChipHtml}
      </td>
      <td class="right" style="white-space:nowrap;">
        <button type="button" class="btn ghost small audit-view-btn" onclick="openAuditDetailModal(${idx})" title="View complete activity details and before/after values">
          👁️ View Details
        </button>
      </td>
    </tr>`;
  }).join('') : '<tr><td colspan="7" class="audit-empty">📭 No audit entries found matching your active filters.</td></tr>';

  const latestPagWrap = document.getElementById('audit-pagination-wrap');
  if (latestPagWrap) {
    latestPagWrap.innerHTML = renderPaginationControls('audit_log', {
      totalItems: total,
      page: pagState.page,
      pageSize: pagState.pageSize,
      loading: false,
      onUpdate: loadAuditLogs,
      scrollTarget: '#audit-panel',
      recordLabel: 'entries'
    });
  }
}
