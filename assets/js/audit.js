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

function formatAuditUnitsDisplay(str) {
  if (!str) return '';
  return String(str)
    .replace(/\bMin:\s*(\d+(?:\.\d+)?)\s*cans?\b/gi, 'Minimum: $1 units')
    .replace(/\b(\d+)\s*\/\s*(\d+)\s*cans\b/gi, '$1/$2 units')
    .replace(/\b1\s*\/\s*1\s*can\b/gi, '1/1 unit')
    .replace(/\b(\d+(?:\.\d+)?)\s*cans\b/gi, '$1 units')
    .replace(/\b1\s*can\b/gi, '1 unit')
    .replace(/\b(\d+(?:\.\d+)?)\s*can\b/gi, '$1 units')
    .replace(/\b(\d+(?:\.\d+)?L)\s+Cans:\b/gi, '$1 Units:');
}

function cleanAuditDisplayString(str) {
  if (!str) return '';
  let s = String(str);
  s = s.replace(/\s*\[\s*(?:PRD|SZ)-[A-Za-z0-9_-]+(?:\s*·\s*(?:PRD|SZ)-[A-Za-z0-9_-]+)*\s*\]/gi, '');
  s = s.replace(/\s*\(\s*(?:ID\s*:\s*)?(?:PRD|SZ)-[A-Za-z0-9_-]+\s*\)/gi, '');
  s = s.replace(/\s*\[\s*(?:p_[A-Za-z0-9_-]+|p\d+)\s*\]/gi, '');
  s = s.replace(/\s*\(\s*ID\s*:\s*(?:p_[A-Za-z0-9_-]+|p\d+)\s*\)/gi, '');
  s = formatAuditUnitsDisplay(s);
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

// Helper: Extract stock threshold information
function parseAuditThreshold(l) {
  const parseOne = str => {
    if (!str) return { total: '', breakdown: '' };
    const s = String(str).trim();
    const m = s.match(/^([^()]+?)(?:\s*\((.*)\))?$/);
    if (m) {
      return { total: m[1].trim(), breakdown: (m[2] || '').trim() };
    }
    return { total: s, breakdown: '' };
  };
  const o = parseOne(l.old_value);
  const n = parseOne(l.new_value);
  let prevTotal = o.total;
  let newTotal = n.total;
  let prevBreakdown = o.breakdown;
  let newBreakdown = n.breakdown;

  if (!prevTotal && l.details) {
    const mDet = l.details.match(/from\s+([\d\.]+\s*L)\s+to\s+([\d\.]+\s*L)/i);
    if (mDet) {
      prevTotal = mDet[1];
      newTotal = mDet[2];
    }
  }
  return {
    prevTotal: formatAuditUnitsDisplay(prevTotal),
    newTotal: formatAuditUnitsDisplay(newTotal),
    prevBreakdown: formatAuditUnitsDisplay(prevBreakdown),
    newBreakdown: formatAuditUnitsDisplay(newBreakdown)
  };
}

// Helper: Parse threshold breakdown pairs
function parseThresholdBreakdownPairs(breakdownStr) {
  if (!breakdownStr) return [];
  const parts = breakdownStr.split(',').map(s => s.trim()).filter(Boolean);
  const list = [];
  parts.forEach(p => {
    const idx = p.indexOf(':');
    if (idx > -1) {
      list.push({
        size: p.slice(0, idx).trim(),
        cans: formatAuditUnitsDisplay(p.slice(idx + 1).trim())
      });
    } else {
      list.push({ size: p, cans: '' });
    }
  });
  return list;
}

// Helper: Extract added container size(s) vs existing sizes
function parseAuditContainerSizes(l) {
  const oldVal = l.old_value || '';
  const newVal = l.new_value || '';
  const details = l.details || '';
  const oldList = oldVal.split(',').map(s => s.trim()).filter(Boolean);
  const newList = newVal.split(',').map(s => s.trim()).filter(Boolean);
  let addedList = newList.filter(s => !oldList.includes(s));
  if (!addedList.length && details) {
    const m = details.match(/size\(s\)\s+([A-Za-z0-9_,\s]+?)\s+to/i);
    if (m) addedList = m[1].split(',').map(s => s.trim()).filter(Boolean);
  }
  return {
    added: addedList.join(', ') || 'New Size',
    addedList: addedList,
    existingList: oldList,
    newList: newList.length ? newList : (addedList.length ? addedList : [])
  };
}

// Helper: Extract changed fields for product changes
function parseAuditProductChanges(l) {
  const meta = (l.meta && typeof l.meta === 'object') ? l.meta : null;
  const changes = [];

  if (meta && meta.changes) {
    if (Array.isArray(meta.changes)) {
      meta.changes.forEach(c => {
        const f = c.field || c.label || c.key || 'Attribute';
        const oldV = c.oldValue !== undefined ? c.oldValue : c.old;
        const newV = c.newValue !== undefined ? c.newValue : c.new;
        changes.push({ field: f, oldVal: formatAuditUnitsDisplay(oldV), newVal: formatAuditUnitsDisplay(newV) });
      });
    } else if (typeof meta.changes === 'object') {
      Object.entries(meta.changes).forEach(([k, v]) => {
        if (v && typeof v === 'object') {
          const f = v.label || v.field || k;
          const oldV = v.old !== undefined ? v.old : v.oldValue;
          const newV = v.new !== undefined ? v.new : v.newValue;
          changes.push({ field: f, oldVal: formatAuditUnitsDisplay(oldV), newVal: formatAuditUnitsDisplay(newV) });
        }
      });
    }
  }

  if (changes.length > 0) return changes;

  const oldStr = l.old_value != null ? String(l.old_value).trim() : '';
  const newStr = l.new_value != null ? String(l.new_value).trim() : '';

  // Check if multiple fields delimited by ' · '
  if (oldStr.includes(' · ') || newStr.includes(' · ')) {
    const parseKv = str => {
      const map = {};
      str.split(' · ').forEach(part => {
        const idx = part.indexOf(':');
        if (idx > -1) {
          map[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
        }
      });
      return map;
    };
    const oldMap = parseKv(oldStr);
    const newMap = parseKv(newStr);
    const allKeys = Array.from(new Set([...Object.keys(oldMap), ...Object.keys(newMap)]));
    allKeys.forEach(k => {
      changes.push({ field: k, oldVal: formatAuditUnitsDisplay(oldMap[k]) || '—', newVal: formatAuditUnitsDisplay(newMap[k]) || '—' });
    });
    if (changes.length > 0) return changes;
  }

  if (oldStr || newStr) {
    let fName = l.field_changed || 'Attribute';
    if (!l.field_changed && l.action === 'PRODUCT_PRICE_CHANGE') fName = 'Price per Liter';
    changes.push({ field: fName, oldVal: formatAuditUnitsDisplay(oldStr) || 'None', newVal: formatAuditUnitsDisplay(newStr) || 'None' });
  }

  return changes;
}

// Helper: Extract previous, adjusted, and final quantity for stock adjustments
function parseAuditStockAdjustment(l) {
  const oldStr = l.old_value != null ? String(l.old_value).trim() : '';
  const newStr = l.new_value != null ? String(l.new_value).trim() : '';
  const det = l.details != null ? String(l.details).trim() : '';
  const act = String(l.action || '').toUpperCase();

  let prevQty = oldStr || '0';
  let finalQty = newStr || '0';
  let adjQty = '';

  const mDet = det.match(/\(\s*([+-]?\d+(?:\.\d+)?\s*(?:×\s*\d+L)?\s*=\s*[+-]?\d+(?:\.\d+)?\s*L|[+-]?\d+(?:\.\d+)?\s*(?:cans?|units?|L|kg)?)\s*\)/i);
  if (mDet) {
    adjQty = mDet[1];
  } else if (det.match(/([+-]\d+(?:\.\d+)?\s*L)/)) {
    adjQty = det.match(/([+-]\d+(?:\.\d+)?\s*L)/)[1];
  } else if (newStr.match(/\(([+-]?\d+(?:\.\d+)?\s*(?:cans?|units?|L|kg)?)\)/i)) {
    adjQty = newStr.match(/\(([+-]?\d+(?:\.\d+)?\s*(?:cans?|units?|L|kg)?)\)/i)[1];
    finalQty = newStr.replace(/\s*\([^\)]*\)/, '').trim();
  }

  if (!adjQty) {
    if (act === 'STOCK_INCREASE') adjQty = '+Qty';
    else if (act === 'STOCK_DECREASE') adjQty = '-Qty';
    else adjQty = 'Adjusted';
  }

  const isNeg = act === 'STOCK_DECREASE' || adjQty.startsWith('-') || det.toLowerCase().includes('damaged') || det.toLowerCase().includes('decrease');

  return {
    prevQty: formatAuditUnitsDisplay(prevQty) || '—',
    adjQty: formatAuditUnitsDisplay(adjQty) || '—',
    finalQty: formatAuditUnitsDisplay(finalQty) || '—',
    isNeg,
    scope: formatAuditUnitsDisplay(l.field_changed || ''),
    reason: l.reason || (det.match(/Reason:\s*(.+)$/i) ? RegExp.$1 : '')
  };
}

// Render structured, clean Activity Details column
function renderAuditActivityDetails(l) {
  const act = String(l.action || '').toUpperCase();
  const refPill = l.reference_no
    ? `<span class="audit-ref-pill" title="Transaction Reference">${escapeHtml(l.reference_no)}</span>`
    : '';
  const detailsClean = cleanAuditDisplayString(l.display_details || l.details || '');

  // 1. Stock Threshold Changed
  if (act === 'STOCK_THRESHOLD_CHANGE') {
    const t = parseAuditThreshold(l);
    const prevPairs = parseThresholdBreakdownPairs(t.prevBreakdown);
    const nextPairs = parseThresholdBreakdownPairs(t.newBreakdown);
    const breakdownPairs = nextPairs.length ? nextPairs : prevPairs;

    let breakdownHtml = '';
    if (breakdownPairs.length > 0) {
      breakdownHtml = `
        <div class="audit-breakdown-section">
          <div class="audit-section-subhead">Size Breakdown</div>
          <table class="audit-size-table">
            <thead>
              <tr>
                <th>Container Size</th>
                <th>Minimum Stock Threshold</th>
              </tr>
            </thead>
            <tbody>
              ${breakdownPairs.map(p => {
        const isNewSize = prevPairs.length > 0 && !prevPairs.some(prev => prev.size === p.size);
        return `
                  <tr class="${isNewSize ? 'is-new-size' : ''}">
                    <td>
                      <span class="audit-size-pill ${isNewSize ? 'is-added' : ''}">${escapeHtml(p.size)}</span>
                      ${isNewSize ? '<span class="audit-pill-tag">NEW</span>' : ''}
                    </td>
                    <td>
                      <span class="${isNewSize ? 'audit-val-updated' : ''}">${escapeHtml(p.cans || '—')}</span>
                    </td>
                  </tr>`;
      }).join('')}
            </tbody>
          </table>
        </div>`;
    }

    return `
      <div class="audit-act-card">
        <div class="audit-card-pair">
          <div class="audit-val-card">
            <div class="audit-val-card-lbl">Previous Threshold</div>
            <div class="audit-val-card-num">${escapeHtml(t.prevTotal || '—')}</div>
          </div>
          <div class="audit-val-card is-updated">
            <div class="audit-val-card-lbl">New Threshold</div>
            <div class="audit-val-card-num">${escapeHtml(t.newTotal || '—')}</div>
          </div>
        </div>
        ${breakdownHtml}
      </div>`;
  }

  // 2. Container Size Added / Removed
  if (act === 'CONTAINER_SIZE_ADD' || act === 'CONTAINER_SIZE_REMOVE' || act === 'PRODUCT_SIZE_APPROVE') {
    const c = parseAuditContainerSizes(l);
    return `
      <div class="audit-act-card">
        <div class="audit-highlight-banner">
          <span class="audit-lbl">Newly Added Size:</span>
          <span class="audit-size-pill is-added">+ ${escapeHtml(c.added)}</span>
        </div>
        <div class="audit-size-group">
          <div class="audit-size-section-label">Existing Sizes</div>
          <div class="audit-badges-wrap">
            ${c.existingList.length ? c.existingList.map(sz => `<span class="audit-size-pill">${escapeHtml(sz)}</span>`).join('') : '<span class="muted small">None</span>'}
          </div>
        </div>
        <div class="audit-size-group">
          <div class="audit-size-section-label">Updated Size List</div>
          <div class="audit-badges-wrap">
            ${c.newList.map(sz => {
      const isAdded = c.addedList.includes(sz);
      return `<span class="audit-size-pill ${isAdded ? 'is-added' : ''}">${escapeHtml(sz)}${isAdded ? '<span class="audit-pill-tag">NEW</span>' : ''}</span>`;
    }).join('')}
          </div>
        </div>
      </div>`;
  }

  // 3. Product Updated / Price Changed / Edit Approved / Status Changed
  if (act === 'PRODUCT_UPDATE' || act === 'PRODUCT_PRICE_CHANGE' || act === 'PRODUCT_EDIT_APPROVE' ||
    act === 'PRODUCT_EDIT_REQUEST' || act === 'PRODUCT_DEACTIVATE' || act === 'PRODUCT_REACTIVATE' ||
    act === 'PRODUCT_DISCONTINUE' || act === 'PRODUCT_STATUS') {
    const changes = parseAuditProductChanges(l);
    if (changes.length > 0) {
      return `
        <div class="audit-act-card">
          ${changes.map(ch => `
            <div class="audit-field-card">
              <div class="audit-field-title">${escapeHtml(ch.field)}</div>
              <div class="audit-card-pair">
                <div class="audit-val-card">
                  <div class="audit-val-card-lbl">Previous Value</div>
                  <div class="audit-val-card-num">${escapeHtml(String(ch.oldVal || 'None'))}</div>
                </div>
                <div class="audit-val-card is-updated">
                  <div class="audit-val-card-lbl">New Value</div>
                  <div class="audit-val-card-num">${escapeHtml(String(ch.newVal || 'None'))}</div>
                </div>
              </div>
            </div>
          `).join('')}
          ${l.reason ? `<div class="audit-meta-footer"><span class="audit-lbl">Reason:</span> <span class="audit-meta-text">${escapeHtml(l.reason)}</span></div>` : ''}
        </div>`;
    }
  }

  // 4. User Login / Logout / Auth Events
  if (act === 'LOGIN' || act === 'LOGOUT' || act === 'LOGIN_FAILED' || act === 'PASSWORD_CHANGE' ||
    act === 'USER_LOGIN' || act === 'USER_LOGOUT') {
    const isLogin = act === 'LOGIN' || act === 'USER_LOGIN';
    const isLogout = act === 'LOGOUT' || act === 'USER_LOGOUT';
    const isFailed = act === 'LOGIN_FAILED';

    let icon = isLogin ? '🔑' : (isLogout ? '🚪' : (isFailed ? '⚠️' : '🛡️'));
    let actionDesc = isLogin ? 'User signed in successfully' :
      (isLogout ? 'User signed out' :
        (isFailed ? 'Failed sign-in attempt (Invalid credentials)' : 'Password updated successfully'));
    let pillClass = isLogin ? 'is-login' : (isLogout ? 'is-logout' : (isFailed ? 'is-failed' : 'is-security'));
    let statusLabel = isLogin ? 'Active Session' : (isLogout ? 'Signed Out' : (isFailed ? 'Authentication Blocked' : 'Updated'));

    return `
      <div class="audit-act-card">
        <div class="audit-session-row">
          <span class="audit-session-badge ${pillClass}">${icon} ${isLogin ? 'Sign-in' : (isLogout ? 'Sign-out' : (isFailed ? 'Auth Failed' : 'Security'))}</span>
          <span class="audit-session-text">${escapeHtml(actionDesc)}</span>
        </div>
        <div class="audit-meta-footer" style="margin-top:2px; border-top:none; padding-top:0;">
          <span class="audit-lbl">Session:</span> <strong style="color:var(--ink); font-weight:600;">${escapeHtml(statusLabel)}</strong>
        </div>
      </div>`;
  }

  // 5. Unauthorized Access Attempt
  if (act === 'UNAUTHORIZED_ACCESS') {
    const moduleName = l.entity_name || l.entity || 'Restricted Module';
    let attemptedRole = l.old_value ? l.old_value.replace(/^Role:\s*/i, '') : (l.user_role || 'Restricted Role');
    if (!attemptedRole && detailsClean.match(/\((staff|cashier|unauthenticated|[^\)]+)\)/i)) {
      attemptedRole = RegExp.$1;
    }
    return `
      <div class="audit-sec-card">
        <div class="audit-sec-header">
          <span class="audit-sec-alert-pill">🚫 Restricted Access Attempt</span>
          <span class="audit-sec-target"><span class="audit-lbl">Module:</span> <strong>${escapeHtml(moduleName)}</strong></span>
        </div>
        <div class="audit-card-pair" style="margin-top:2px;">
          <div class="audit-val-card">
            <div class="audit-val-card-lbl">Attempted Role</div>
            <div class="audit-val-card-num">${escapeHtml(attemptedRole)}</div>
          </div>
          <div class="audit-val-card is-blocked">
            <div class="audit-val-card-lbl">Access Result</div>
            <div class="audit-val-card-num">Blocked (Access Denied)</div>
          </div>
        </div>
      </div>`;
  }

  // 6. Stock Adjustments (Increase, Decrease, Adjust, Receive, Dispose)
  if (act === 'STOCK_ADJUST' || act === 'STOCK_INCREASE' || act === 'STOCK_DECREASE' ||
    act === 'STOCK_RECEIVE' || act === 'STOCK_DISPOSE') {
    const s = parseAuditStockAdjustment(l);
    return `
      <div class="audit-act-card">
        <div class="audit-card-trio">
          <div class="audit-val-card">
            <div class="audit-val-card-lbl">Previous Qty</div>
            <div class="audit-val-card-num">${escapeHtml(s.prevQty)}</div>
          </div>
          <div class="audit-val-card ${s.isNeg ? 'is-decreased' : 'is-updated'}">
            <div class="audit-val-card-lbl">Adjustment</div>
            <div class="audit-val-card-num">${escapeHtml(s.adjQty)}</div>
          </div>
          <div class="audit-val-card is-updated">
            <div class="audit-val-card-lbl">Final Qty</div>
            <div class="audit-val-card-num">${escapeHtml(s.finalQty)}</div>
          </div>
        </div>
        ${(s.scope || s.reason) ? `
        <div class="audit-meta-footer">
          ${s.scope ? `<span class="audit-lbl">Scope:</span> <span class="audit-meta-text">${escapeHtml(s.scope)}</span>` : ''}
          ${s.scope && s.reason ? ` <span class="audit-dot">·</span> ` : ''}
          ${s.reason ? `<span class="audit-lbl">Reason:</span> <span class="audit-meta-text">${escapeHtml(s.reason)}</span>` : ''}
        </div>` : ''}
      </div>`;
  }

  // 7. Purchase Orders
  if (act.startsWith('PO_')) {
    const hasStatusChange = Boolean(l.old_value || l.new_value);
    return `
      <div class="audit-act-card">
        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
          ${refPill}
          <span style="font-weight:600; color:var(--ink);">${escapeHtml(detailsClean || formatAuditActionLabel(act))}</span>
        </div>
        ${hasStatusChange ? `
        <div class="audit-card-pair" style="margin-top:2px;">
          <div class="audit-val-card">
            <div class="audit-val-card-lbl">Previous Status</div>
            <div class="audit-val-card-num">${escapeHtml(l.old_value || 'None')}</div>
          </div>
          <div class="audit-val-card is-updated">
            <div class="audit-val-card-lbl">New Status</div>
            <div class="audit-val-card-num">${escapeHtml(l.new_value || '—')}</div>
          </div>
        </div>` : ''}
        ${l.reason ? `<div class="audit-meta-footer"><span class="audit-lbl">Reason:</span> <span class="audit-meta-text">${escapeHtml(l.reason)}</span></div>` : ''}
      </div>`;
  }

  // 8. Sales Transactions & Refunds
  if (act === 'SALE' || act === 'SALE_COMPLETE' || act === 'RECEIPT_GENERATED' ||
    act === 'SALE_REFUND' || act === 'PARTIAL_REFUND' || act === 'SALE_VOID') {
    const hasStatus = Boolean(l.old_value || l.new_value);
    return `
      <div class="audit-act-card">
        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
          ${refPill}
          <span style="font-weight:600; color:var(--ink);">${escapeHtml(detailsClean || formatAuditActionLabel(act))}</span>
        </div>
        ${hasStatus ? `
        <div class="audit-card-pair" style="margin-top:2px;">
          <div class="audit-val-card">
            <div class="audit-val-card-lbl">Previous Value</div>
            <div class="audit-val-card-num">${escapeHtml(l.old_value || 'None')}</div>
          </div>
          <div class="audit-val-card is-updated">
            <div class="audit-val-card-lbl">New Value</div>
            <div class="audit-val-card-num">${escapeHtml(l.new_value || '—')}</div>
          </div>
        </div>` : ''}
      </div>`;
  }

  // 9. Other activities with Before & After values
  if (l.old_value || l.new_value) {
    return `
      <div class="audit-act-card">
        ${refPill ? `<div style="margin-bottom:2px;">${refPill}</div>` : ''}
        ${l.field_changed ? `<div class="audit-field-title">${escapeHtml(l.field_changed)}</div>` : ''}
        <div class="audit-card-pair">
          <div class="audit-val-card">
            <div class="audit-val-card-lbl">Previous Value</div>
            <div class="audit-val-card-num">${escapeHtml(String(l.old_value || 'None'))}</div>
          </div>
          <div class="audit-val-card is-updated">
            <div class="audit-val-card-lbl">New Value</div>
            <div class="audit-val-card-num">${escapeHtml(String(l.new_value || 'None'))}</div>
          </div>
        </div>
        ${l.reason ? `<div class="audit-meta-footer"><span class="audit-lbl">Reason:</span> <span class="audit-meta-text">${escapeHtml(l.reason)}</span></div>` : ''}
      </div>`;
  }

  // 10. Fallback / General activities
  return `
    <div class="audit-simple-desc">
      ${refPill}${escapeHtml(detailsClean || formatAuditActionLabel(act))}
    </div>`;
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
  let changesList = [];
  if (meta && meta.changes) {
    if (Array.isArray(meta.changes)) {
      changesList = meta.changes.map(ch => ({
        field: ch.field || ch.label || ch.key || 'Field',
        oldValue: ch.oldValue !== undefined ? ch.oldValue : ch.old,
        newValue: ch.newValue !== undefined ? ch.newValue : ch.new
      }));
    } else if (typeof meta.changes === 'object') {
      changesList = Object.entries(meta.changes).map(([k, v]) => ({
        field: v.label || v.field || k,
        oldValue: v.old !== undefined ? v.old : v.oldValue,
        newValue: v.new !== undefined ? v.new : v.newValue
      }));
    }
  }
  if (!changesList.length && (String(l.action).includes('PRODUCT_') || String(l.action).includes('USER_') || String(l.action).includes('PRICE_'))) {
    changesList = parseAuditProductChanges(l).map(c => ({
      field: c.field,
      oldValue: c.oldVal,
      newValue: c.newVal
    }));
  }

  const saleItemsList = (meta && Array.isArray(meta.items) && meta.items.length > 0) ? meta.items : [];
  const returnedItemsList = (meta && Array.isArray(meta.returnedItems) && meta.returnedItems.length > 0) ? meta.returnedItems : [];

  // Specialized activity layouts in modal
  let specializedSectionHtml = '';

  if (l.action === 'STOCK_THRESHOLD_CHANGE') {
    const t = parseAuditThreshold(l);
    const prevPairs = parseThresholdBreakdownPairs(t.prevBreakdown);
    const nextPairs = parseThresholdBreakdownPairs(t.newBreakdown);
    const breakdownPairs = nextPairs.length ? nextPairs : prevPairs;

    specializedSectionHtml = `
      <div style="margin-top:12px;">
        <div class="audit-detail-section-label" style="margin-bottom:8px;">📦 Minimum Stock Threshold Tracking</div>
        <div class="audit-card-pair" style="margin-bottom:12px;">
          <div class="audit-val-card" style="padding:10px 14px;">
            <div class="audit-val-card-lbl" style="font-size:11px;">Previous Threshold</div>
            <div class="audit-val-card-num" style="font-size:16px;">${escapeHtml(t.prevTotal || l.old_value || '—')}</div>
          </div>
          <div class="audit-val-card is-updated" style="padding:10px 14px;">
            <div class="audit-val-card-lbl" style="font-size:11px;">New Threshold</div>
            <div class="audit-val-card-num" style="font-size:16px;">${escapeHtml(t.newTotal || l.new_value || '—')}</div>
          </div>
        </div>
        ${breakdownPairs.length > 0 ? `
        <div class="audit-section-subhead" style="margin-bottom:6px;">Size Breakdown</div>
        <table class="audit-size-table">
          <thead>
            <tr>
              <th>Container Size</th>
              <th>Minimum Stock Threshold</th>
            </tr>
          </thead>
          <tbody>
            ${breakdownPairs.map(p => {
      const isNewSize = prevPairs.length > 0 && !prevPairs.some(prev => prev.size === p.size);
      return `
                <tr class="${isNewSize ? 'is-new-size' : ''}">
                  <td>
                    <span class="audit-size-pill ${isNewSize ? 'is-added' : ''}">${escapeHtml(p.size)}</span>
                    ${isNewSize ? '<span class="audit-pill-tag">NEW</span>' : ''}
                  </td>
                  <td>
                    <span class="${isNewSize ? 'audit-val-updated' : ''}">${escapeHtml(p.cans || '—')}</span>
                  </td>
                </tr>`;
    }).join('')}
          </tbody>
        </table>` : ''}
      </div>`;
  } else if (l.action === 'CONTAINER_SIZE_ADD' || l.action === 'CONTAINER_SIZE_REMOVE' || l.action === 'PRODUCT_SIZE_APPROVE') {
    const c = parseAuditContainerSizes(l);
    specializedSectionHtml = `
      <div style="margin-top:12px;">
        <div class="audit-detail-section-label" style="margin-bottom:8px;">🎨 Container Size Specification</div>
        <div class="audit-highlight-banner" style="margin-bottom:10px;">
          <span class="audit-lbl">Newly Added Size:</span>
          <span class="audit-size-pill is-added" style="font-size:12px; padding:3px 10px;">+ ${escapeHtml(c.added)}</span>
        </div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:10px;">
          <div class="audit-detail-card">
            <div class="audit-size-section-label" style="margin-bottom:6px;">Existing Sizes</div>
            <div class="audit-badges-wrap">
              ${c.existingList.length ? c.existingList.map(sz => `<span class="audit-size-pill">${escapeHtml(sz)}</span>`).join('') : '<span class="muted small">None</span>'}
            </div>
          </div>
          <div class="audit-detail-card" style="border-color:#A7F3D0; background:#F0FDF4;">
            <div class="audit-size-section-label" style="margin-bottom:6px; color:#065F46;">Updated Size List</div>
            <div class="audit-badges-wrap">
              ${c.newList.map(sz => {
      const isAdded = c.addedList.includes(sz);
      return `<span class="audit-size-pill ${isAdded ? 'is-added' : ''}">${escapeHtml(sz)}${isAdded ? '<span class="audit-pill-tag">NEW</span>' : ''}</span>`;
    }).join('')}
            </div>
          </div>
        </div>
      </div>`;
  } else if (l.action === 'STOCK_ADJUST' || l.action === 'STOCK_INCREASE' || l.action === 'STOCK_DECREASE' || l.action === 'STOCK_RECEIVE' || l.action === 'STOCK_DISPOSE') {
    const s = parseAuditStockAdjustment(l);
    specializedSectionHtml = `
      <div style="margin-top:12px;">
        <div class="audit-detail-section-label" style="margin-bottom:8px;">📦 Stock Quantity &amp; Movement Breakdown</div>
        <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:10px;">
          <div class="audit-ba-pane audit-ba-old">
            <div class="audit-ba-header">Previous Quantity</div>
            <div class="audit-ba-content">${escapeHtml(s.prevQty)}</div>
          </div>
          <div class="audit-ba-pane" style="background:${s.isNeg ? '#FEF2F2' : '#ECFDF5'}; border:1px solid ${s.isNeg ? '#FECACA' : '#A7F3D0'};">
            <div class="audit-ba-header" style="color:${s.isNeg ? '#991B1B' : '#065F46'};">Quantity Adjustment</div>
            <div class="audit-ba-content" style="color:${s.isNeg ? '#B91C1C' : '#047857'}; font-weight:700;">${escapeHtml(s.adjQty)}</div>
          </div>
          <div class="audit-ba-pane audit-ba-new">
            <div class="audit-ba-header">Final Quantity Balance</div>
            <div class="audit-ba-content">${escapeHtml(s.finalQty)}</div>
          </div>
        </div>
      </div>`;
  } else if (l.action === 'UNAUTHORIZED_ACCESS') {
    const moduleName = l.entity_name || l.entity || 'Restricted Module';
    let attemptedRole = l.old_value ? l.old_value.replace(/^Role:\s*/i, '') : (l.user_role || 'staff');
    if (!attemptedRole && detailsDisplay.match(/\((staff|cashier|unauthenticated|[^\)]+)\)/i)) {
      attemptedRole = RegExp.$1;
    }
    specializedSectionHtml = `
      <div style="margin-top:12px;">
        <div class="audit-detail-section-label" style="margin-bottom:8px;">🛡️ Security Access Control Resolution</div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:10px;">
          <div class="audit-detail-card" style="border-left:3px solid #DC2626; background:#FEF2F2;">
            <div class="audit-detail-label">Restricted Module Target</div>
            <div style="font-size:14px; font-weight:700; color:#991B1B;">${escapeHtml(moduleName)}</div>
          </div>
          <div class="audit-detail-card">
            <div class="audit-detail-label">Attempted Role / User</div>
            <div style="font-size:13px; font-weight:600;">${escapeHtml(userName)} (${escapeHtml(attemptedRole)})</div>
          </div>
          <div class="audit-detail-card" style="border-left:3px solid #DC2626; background:#FEF2F2;">
            <div class="audit-detail-label">Access Enforcement Result</div>
            <div style="font-size:14px; font-weight:700; color:#DC2626;">Access Denied (Blocked)</div>
          </div>
        </div>
      </div>`;
  }

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

      ${specializedSectionHtml}

      ${(hasBeforeAfter && !specializedSectionHtml && !changesList.length) ? `
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

      ${(changesList.length > 0 && !specializedSectionHtml) ? `
      <div style="margin-top:12px;">
        <div class="audit-detail-section-label" style="margin-bottom:6px;">Detailed Field Breakdown (${changesList.length} field change${changesList.length > 1 ? 's' : ''})</div>
        <div style="border:1px solid var(--line); border-radius:6px; overflow:hidden;">
          <table style="width:100%; font-size:12.5px;">
            <thead>
              <tr style="background:#F5F1E9;">
                <th style="padding:7px 10px;">Field / Attribute</th>
                <th style="padding:7px 10px;">Previous Value</th>
                <th style="padding:7px 10px;">New Value</th>
              </tr>
            </thead>
            <tbody>
              ${changesList.map(ch => `
                <tr>
                  <td style="padding:6px 10px; font-weight:600;">${escapeHtml(ch.field || '')}</td>
                  <td style="padding:6px 10px; color:var(--ink);">${escapeHtml(ch.oldValue != null ? String(ch.oldValue) : '—')}</td>
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
        ${renderAuditActivityDetails(l)}
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
