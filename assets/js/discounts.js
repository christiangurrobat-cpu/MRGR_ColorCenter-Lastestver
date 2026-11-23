/* ============================================================
   21. NEAR-EXPIRY DISCOUNT MANAGEMENT MODULE
   MRGR Color Center — Sales & Inventory System

   Batch-specific near-expiry discount management on top of
   inventory_batches & batch_discounts (api/batches.php).
   All authorized roles (admin, staff, cashier) may view;
   ONLY Administrators may configure, activate, deactivate, or delete.
   ============================================================ */

const DISC = {
  loaded: false,
  loading: false,
  error: '',
  data: null
};

const DISC_STATUS_META = {
  active: { label: 'Active', icon: '🏷️' },
  inactive: { label: 'Inactive', icon: '⏸️' },
  scheduled: { label: 'Scheduled', icon: '🕒' },
  expired: { label: 'Expired (Blocked)', icon: '⛔' },
  depleted: { label: 'Depleted', icon: '▫️' },
  ineligible: { label: 'No Expiry Date', icon: '❔' },
  none: { label: 'No Discount', icon: '—' }
};

let discTabFilter = 'all';         // all | active | inactive | scheduled
let discStatusFilter = 'all';      // all | active | inactive | scheduled | none | expired | depleted | ineligible
let discSearchQuery = '';
let discCategoryFilter = 'all';
let discSizeFilter = 'all';
let discSupplierFilter = 'all';
let discDateFrom = '';
let discDateTo = '';
let discShowUnavailable = false;   // show expired / depleted / no-expiry
let _discSearchTimer = null;
let _discSaving = false;

const DISC_PAG_KEY = 'near_expiry_discounts';

function discIsAdmin() {
  return !!(currentUser && currentUser.role === 'admin');
}

function discCanManage() {
  return DISC.data && DISC.data.permissions
    ? !!DISC.data.permissions.canManageDiscounts
    : discIsAdmin();
}

function discStatusBadge(status) {
  const m = DISC_STATUS_META[status] || DISC_STATUS_META.none;
  return `<span class="disc-badge ${escapeAttr(status)}">${m.icon} ${escapeHtml(m.label)}</span>`;
}

function discApi(action, options = {}) {
  const url = `api/batches.php?action=${encodeURIComponent(action)}` + (options.query || '') + `&_=${Date.now()}`;
  const init = {
    method: options.body ? 'POST' : 'GET',
    headers: { 'X-User-Id': (currentUser && currentUser.id) || '' },
    credentials: 'same-origin'
  };
  if (options.body) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }
  return fetch(url, init).then(async res => {
    let json = null;
    try { json = await res.json(); } catch (e) { /* non-JSON */ }
    if (!res.ok || !json || json.success === false) {
      throw new Error((json && json.error) || `Request failed (HTTP ${res.status})`);
    }
    return json;
  });
}

function goToDiscounts(tab) {
  discTabFilter = ['all', 'active', 'inactive', 'scheduled'].includes(tab) ? tab : 'all';
  discStatusFilter = 'all';
  resetPaginationPage(DISC_PAG_KEY);
  if (typeof goTo === 'function') goTo('discounts');
}

async function discLoad(silent) {
  DISC.loading = true;
  DISC.error = '';
  if (!silent) discRenderResults();
  try {
    const json = await discApi('discounts_list');
    DISC.data = json;
    DISC.loaded = true;
  } catch (e) {
    DISC.error = e.message || 'Could not load near-expiry discounts.';
  }
  DISC.loading = false;
  if (currentPage === 'discounts') {
    discRenderFilters();
    discRenderResults();
  }
}

function initDiscountsPage() {
  discRenderFilters();
  discRenderResults();
  discLoad(DISC.loaded);
}

/* ------------------------------------------------------------
   Filtering & Helpers
   ------------------------------------------------------------ */
function discBaseList(ignoreTabAndStatus) {
  const all = (DISC.data && DISC.data.batches) || [];
  const q = discSearchQuery.trim().toLowerCase();
  return all.filter(b => {
    const isUnavailable = b.depleted || b.expiryStatus === 'expired' || !b.expirationDate;
    const explicitUnavailFilter = !ignoreTabAndStatus && ['expired', 'depleted', 'ineligible'].includes(discStatusFilter);
    if (!discShowUnavailable && !explicitUnavailFilter && isUnavailable) return false;
    if (q) {
      const hay = `${b.productName} ${b.brand} ${b.color} ${b.batchNumber} ${b.supplierName}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (discCategoryFilter !== 'all' && b.category !== discCategoryFilter) return false;
    if (discSizeFilter !== 'all' && String(b.containerSize) !== String(discSizeFilter)) return false;
    if (discSupplierFilter !== 'all' && b.supplierName !== discSupplierFilter) return false;
    if (discDateFrom || discDateTo) {
      if (!b.expirationDate) return false;
      const e = String(b.expirationDate).slice(0, 10);
      if (discDateFrom && e < discDateFrom) return false;
      if (discDateTo && e > discDateTo) return false;
    }
    if (!ignoreTabAndStatus) {
      if (discTabFilter === 'active' && b.discountStatus !== 'active') return false;
      if (discTabFilter === 'inactive' && !['inactive', 'none'].includes(b.discountStatus)) return false;
      if (discTabFilter === 'scheduled' && b.discountStatus !== 'scheduled') return false;
      if (discStatusFilter !== 'all' && b.discountStatus !== discStatusFilter) return false;
    }
    return true;
  });
}

function discHasActiveFilters() {
  return discTabFilter !== 'all' || discStatusFilter !== 'all' || discSearchQuery ||
    discCategoryFilter !== 'all' || discSizeFilter !== 'all' || discSupplierFilter !== 'all' ||
    discDateFrom || discDateTo || discShowUnavailable;
}

function discSetTab(tab) {
  discTabFilter = tab || 'all';
  resetPaginationPage(DISC_PAG_KEY);
  discRenderResults();
}
function discSetStatusFilter(v) { discStatusFilter = v || 'all'; resetPaginationPage(DISC_PAG_KEY); discRenderResults(); }
function discSetSearch(v) {
  discSearchQuery = v || '';
  clearTimeout(_discSearchTimer);
  _discSearchTimer = setTimeout(() => { resetPaginationPage(DISC_PAG_KEY); discRenderResults(); }, 160);
}
function discSetCategory(v) { discCategoryFilter = v || 'all'; resetPaginationPage(DISC_PAG_KEY); discRenderResults(); }
function discSetSize(v) { discSizeFilter = v || 'all'; resetPaginationPage(DISC_PAG_KEY); discRenderResults(); }
function discSetSupplier(v) { discSupplierFilter = v || 'all'; resetPaginationPage(DISC_PAG_KEY); discRenderResults(); }
function discSetDateFrom(v) { discDateFrom = v || ''; resetPaginationPage(DISC_PAG_KEY); discRenderResults(); }
function discSetDateTo(v) { discDateTo = v || ''; resetPaginationPage(DISC_PAG_KEY); discRenderResults(); }
function discToggleUnavailable(on) { discShowUnavailable = !!on; resetPaginationPage(DISC_PAG_KEY); discRenderResults(); }

function discResetFilters() {
  discTabFilter = 'all'; discStatusFilter = 'all'; discSearchQuery = '';
  discCategoryFilter = 'all'; discSizeFilter = 'all'; discSupplierFilter = 'all';
  discDateFrom = ''; discDateTo = ''; discShowUnavailable = false;
  resetPaginationPage(DISC_PAG_KEY);
  discRenderFilters();
  discRenderResults();
}

/* ------------------------------------------------------------
   Page Rendering
   ------------------------------------------------------------ */
function discountsPage() {
  const canManage = discIsAdmin();
  return `
  <div id="disc-root" class="exp-root">
    <div class="exp-header">
      <div>
        <div class="exp-title">🏷️ Near-Expiry Discount Management</div>
        <div class="exp-subtitle">Batch-specific promotional discounts for near-expiry inventory. Discounts apply per batch &amp; container size without modifying stock quantities or base product prices.</div>
      </div>
      <div class="exp-header-actions">
        <button type="button" class="btn secondary small" onclick="goTo('inventory')">← Back to Inventory</button>
        <button type="button" class="btn secondary small" onclick="discLoad(false)" title="Reload discount data">↻ Refresh</button>
        ${canManage ? `<button type="button" class="btn small" onclick="discOpenScheduleModal()" title="Configure global days-before-expiration discount tiers">⚙ Discount Schedule</button>` : ''}
      </div>
    </div>

    <div id="disc-cards" class="disc-cards"></div>
    <div id="disc-schedule-banner" class="disc-schedule-banner"></div>

    <div class="panel exp-panel" id="disc-table-panel">
      <div id="disc-tabs" class="exp-tabs"></div>
      <div id="disc-filters" class="disc-filters"></div>
      <div id="disc-table-wrap"></div>
    </div>
  </div>`;
}

function discRenderFilters() {
  const el = document.getElementById('disc-filters');
  if (!el) return;
  const cats = (DISC.data && DISC.data.categories) || [];
  const sups = (DISC.data && DISC.data.suppliers) || [];
  const sizes = (DISC.data && DISC.data.sizes) || [];
  el.innerHTML = `
    <div class="exp-filter-field exp-search">
      <label for="disc-search-input">Search</label>
      <input type="search" id="disc-search-input" placeholder="Product, brand, color, batch # or supplier…" value="${escapeAttr(discSearchQuery)}" oninput="discSetSearch(this.value)" autocomplete="off">
    </div>
    <div class="exp-filter-field">
      <label for="disc-category">Category</label>
      <select id="disc-category" onchange="discSetCategory(this.value)">
        <option value="all">All Categories</option>
        ${cats.map(c => `<option value="${escapeAttr(c)}" ${c === discCategoryFilter ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
      </select>
    </div>
    <div class="exp-filter-field">
      <label for="disc-size">Size</label>
      <select id="disc-size" onchange="discSetSize(this.value)">
        <option value="all">All Sizes</option>
        ${sizes.map(s => `<option value="${escapeAttr(s)}" ${String(s) === String(discSizeFilter) ? 'selected' : ''}>${fmtSize(s)}</option>`).join('')}
      </select>
    </div>
    <div class="exp-filter-field">
      <label for="disc-supplier">Supplier</label>
      <select id="disc-supplier" onchange="discSetSupplier(this.value)">
        <option value="all">All Suppliers</option>
        ${sups.map(s => `<option value="${escapeAttr(s)}" ${s === discSupplierFilter ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('')}
      </select>
    </div>
    <div class="exp-filter-field">
      <label for="disc-date-from">Expires from</label>
      <input type="date" id="disc-date-from" value="${escapeAttr(discDateFrom)}" onchange="discSetDateFrom(this.value)">
    </div>
    <div class="exp-filter-field">
      <label for="disc-date-to">Expires to</label>
      <input type="date" id="disc-date-to" value="${escapeAttr(discDateTo)}" onchange="discSetDateTo(this.value)">
    </div>
    <div class="exp-filter-field">
      <label for="disc-status">Discount Status</label>
      <select id="disc-status" onchange="discSetStatusFilter(this.value)">
        <option value="all" ${discStatusFilter === 'all' ? 'selected' : ''}>All Statuses</option>
        <option value="active" ${discStatusFilter === 'active' ? 'selected' : ''}>Active</option>
        <option value="scheduled" ${discStatusFilter === 'scheduled' ? 'selected' : ''}>Scheduled</option>
        <option value="inactive" ${discStatusFilter === 'inactive' ? 'selected' : ''}>Inactive</option>
        <option value="none" ${discStatusFilter === 'none' ? 'selected' : ''}>No Discount</option>
        <option value="expired" ${discStatusFilter === 'expired' ? 'selected' : ''}>Expired (Blocked)</option>
        <option value="depleted" ${discStatusFilter === 'depleted' ? 'selected' : ''}>Depleted</option>
        <option value="ineligible" ${discStatusFilter === 'ineligible' ? 'selected' : ''}>No Expiry Date</option>
      </select>
    </div>
    <div class="exp-filter-field exp-filter-check">
      <label class="exp-check"><input type="checkbox" id="disc-show-unavail" ${discShowUnavailable ? 'checked' : ''} onchange="discToggleUnavailable(this.checked)"> Show expired, depleted &amp; no-expiry batches</label>
      <button type="button" class="btn ghost small" id="disc-clear-btn" onclick="discResetFilters()" style="color:var(--danger);">✕ Clear filters</button>
    </div>`;
}

function discRenderResults() {
  discRenderCards();
  discRenderTabs();
  discRenderTable();
  const clr = document.getElementById('disc-clear-btn');
  if (clr) clr.style.visibility = discHasActiveFilters() ? 'visible' : 'hidden';
}

function discRenderCards() {
  const el = document.getElementById('disc-cards');
  const ban = document.getElementById('disc-schedule-banner');
  if (!el) return;
  const all = (DISC.data && DISC.data.batches) || [];
  const eligible = all.filter(b => !b.depleted && b.expiryStatus !== 'expired' && !!b.expirationDate);
  const active = eligible.filter(b => b.discountStatus === 'active');
  const scheduled = eligible.filter(b => b.discountStatus === 'scheduled');
  const inactive = eligible.filter(b => b.discountStatus === 'inactive' || b.discountStatus === 'none');
  const unitsDiscounted = active.reduce((s, b) => s + (Number(b.remainingQty) || 0), 0);

  const card = (val, tab, icon, label, sub, cls, bg, fg) => `
    <div class="restock-card exp-card ${cls} ${discTabFilter === tab ? 'active' : ''}" onclick="discSetTab('${tab}')" title="Click to filter: ${label}">
      <div class="restock-card-icon" style="background:${bg}; color:${fg};">${icon}</div>
      <div class="restock-card-body">
        <div class="restock-card-val" style="color:${fg};">${DISC.data ? val : '–'}</div>
        <div class="restock-card-lbl">${label}</div>
        <div class="restock-card-sub">${sub}</div>
      </div>
    </div>`;

  el.innerHTML =
    card(eligible.length, 'all', '📦', 'Eligible Batches', 'In-stock with expiration date', 'exp-card-total', 'var(--surface-3)', 'var(--ink)') +
    card(active.length, 'active', '🏷️', 'Active Discounts', `${unitsDiscounted} unit(s) discounted in POS`, 'exp-card-good', 'var(--success-bg)', 'var(--success-text)') +
    card(scheduled.length, 'scheduled', '🕒', 'Scheduled', 'Waiting for threshold window', 'exp-card-soon', 'var(--warning-bg)', 'var(--warning-text)') +
    card(inactive.length, 'inactive', '⏸️', 'Inactive / None', 'No active discount applied', 'exp-card-none', 'var(--surface-3)', 'var(--ink-soft)');

  if (ban && DISC.data) {
    const ds = DISC.data.discountSettings || { enabled: false, tiers: [] };
    const tiersTxt = (ds.tiers || []).map(t => `≤ ${t.days}d: <b>${t.pct}%</b>`).join(' · ');
    ban.innerHTML = `
      <div>
        <strong>Auto Schedule:</strong>
        <span class="disc-badge ${ds.enabled ? 'active' : 'inactive'}" style="margin-left:4px;">${ds.enabled ? '🏷️ Enabled' : '⏸️ Disabled'}</span>
        ${tiersTxt ? `<span class="muted small" style="margin-left:8px;">${tiersTxt}</span>` : ''}
      </div>
      ${discCanManage()
        ? `<button type="button" class="btn secondary small" onclick="discOpenScheduleModal()">⚙ Configure Schedule</button>`
        : `<span class="muted small">View-only mode (${escapeHtml((currentUser && currentUser.role) || 'staff')})</span>`}`;
  }
}

function discRenderTabs() {
  const el = document.getElementById('disc-tabs');
  if (!el) return;
  const base = discBaseList(true);
  const cnt = {
    all: base.length,
    active: base.filter(b => b.discountStatus === 'active').length,
    inactive: base.filter(b => b.discountStatus === 'inactive' || b.discountStatus === 'none').length,
    scheduled: base.filter(b => b.discountStatus === 'scheduled').length
  };
  const tabs = [
    ['all', '📋', 'All Batches'],
    ['active', '🏷️', 'Active Discounts'],
    ['inactive', '⏸️', 'Inactive / No Discount'],
    ['scheduled', '🕒', 'Scheduled']
  ];
  el.innerHTML = tabs.map(([k, icon, label]) => `
    <button type="button" class="report-toggle-btn exp-tab ${discTabFilter === k ? 'active' : ''}" onclick="discSetTab('${k}')">
      <span class="rt-icon">${icon}</span> ${label} <span class="exp-tab-count">${cnt[k]}</span>
    </button>`).join('');
}

function discRenderTable() {
  const wrap = document.getElementById('disc-table-wrap');
  if (!wrap) return;

  if (DISC.error && !DISC.data) {
    wrap.innerHTML = `<div class="exp-empty"><div style="font-size:30px;">⚠️</div><b>Could not load Near-Expiry Discounts</b><div class="muted small" style="margin:6px 0 12px;">${escapeHtml(DISC.error)}</div><button class="btn small" onclick="discLoad(false)">↻ Retry</button></div>`;
    return;
  }
  if (!DISC.data) {
    wrap.innerHTML = `<div class="exp-empty"><div style="font-size:26px;">⏳</div>Loading batches…</div>`;
    return;
  }

  const list = discBaseList(false).slice().sort((a, b) => {
    const da = a.daysRemaining === null ? 999999 : a.daysRemaining;
    const dbv = b.daysRemaining === null ? 999999 : b.daysRemaining;
    return da - dbv || String(a.dateReceived).localeCompare(String(b.dateReceived));
  });
  const pag = paginateArray(list, DISC_PAG_KEY, { onUpdate: discRenderTable, scrollTarget: '#disc-table-panel', recordLabel: 'batches' });
  const canManage = discCanManage();

  const rows = pag.pagedItems.map(b => {
    const bid = escapeAttr(b.batchId);
    const eligible = !b.depleted && b.expiryStatus !== 'expired' && !!b.expirationDate;
    const hasCustomRule = !!b.discountRule;
    const origPrice = b.pricePerCan !== null ? peso(b.pricePerCan) : '—';
    const discPrice = b.discountedPrice !== null ? peso(b.discountedPrice) : '—';
    const pctHtml = b.discountPct > 0
      ? `<strong style="color:var(--success-text);">${b.discountPct}%</strong>${b.discountAmount > 0 ? `<div class="exp-sub">-${peso(b.discountAmount)}</div>` : ''}`
      : `<span class="muted">0%</span>`;

    const actionsHtml = canManage
      ? `<button type="button" class="exp-act" title="${eligible ? 'Configure / edit batch discount' : 'Ineligible batch (view only)'}" onclick="${eligible ? `discOpenRuleModal('${bid}')` : `discOpenViewModal('${bid}')`}">${eligible ? '✏️' : '👁'}</button>
         ${eligible ? `<button type="button" class="exp-act" title="${b.discountStatus === 'active' ? 'Deactivate discount' : 'Activate discount'}" onclick="discConfirmToggle('${bid}')">${b.discountStatus === 'active' ? '⏸' : '▶'}</button>` : ''}
         ${hasCustomRule ? `<button type="button" class="exp-act" title="Delete custom discount rule" onclick="discConfirmDelete('${bid}')">🗑️</button>` : ''}`
      : `<button type="button" class="exp-act" title="View discount details" onclick="discOpenViewModal('${bid}')">👁</button>`;

    return `
      <tr class="exp-row ${b.depleted ? 'is-depleted' : ''}" onclick="discOpenViewModal('${bid}')">
        <td><div class="exp-prod"><span class="exp-dot" style="background:${escapeAttr(b.colorHex || '#CCC')};"></span><div><div class="exp-prod-name">${escapeHtml(b.productName)}</div><div class="exp-sub">${escapeHtml(b.category || '')}</div></div></div></td>
        <td>${escapeHtml(b.brand || '—')}</td>
        <td>${escapeHtml(b.color || '—')}</td>
        <td class="center"><span class="badge" style="background:var(--surface-3); color:var(--ink-soft); font-weight:700;">🥫 ${b.containerSize !== null ? fmtSize(b.containerSize) : '—'}</span></td>
        <td><code class="exp-code">${escapeHtml(b.batchNumber)}</code>${hasCustomRule ? '<div class="exp-sub">custom rule</div>' : ''}</td>
        <td>${escapeHtml(b.supplierName || '—')}</td>
        <td>${expFmtDate(b.dateReceived)}</td>
        <td>${b.expirationDate ? expFmtDate(b.expirationDate) : '<span class="muted">Not specified</span>'}</td>
        <td class="exp-days ${b.depleted ? '' : b.expiryStatus}">${b.depleted ? '—' : expDaysText(b)}</td>
        <td class="right"><b>${b.remainingQty}</b></td>
        <td class="right">${origPrice}</td>
        <td class="right">${pctHtml}</td>
        <td class="right">${b.discountPct > 0 ? `<strong style="color:var(--success-text);">${discPrice}</strong>` : origPrice}</td>
        <td>${discStatusBadge(b.discountStatus)}</td>
        <td class="exp-actions" onclick="event.stopPropagation()">${actionsHtml}</td>
      </tr>`;
  }).join('');

  wrap.innerHTML = `
    <div class="table-scroll">
      <table class="exp-table">
        <thead>
          <tr>
            <th>Product Name</th><th>Brand</th><th>Color</th><th class="center">Container Size</th>
            <th>Batch Number</th><th>Supplier</th><th>Date Received</th><th>Expiration Date</th>
            <th>Days Remaining</th><th class="right">Remaining Qty</th><th class="right">Original Unit Price</th>
            <th class="right">Discount %</th><th class="right">Discounted Price</th><th>Discount Status</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="15"><div class="exp-empty">🔍 No batches match the current filters.</div></td></tr>`}
        </tbody>
      </table>
    </div>
    ${pag.html}`;
}

/* ------------------------------------------------------------
   Modals: View, Rule Config (Admin), Toggle, Delete, Schedule
   ------------------------------------------------------------ */
function discFindBatch(batchId) {
  return ((DISC.data && DISC.data.batches) || []).find(b => b.batchId === batchId) || null;
}

function discOpenViewModal(batchId) {
  const b = discFindBatch(batchId);
  if (!b) return;
  const kv = (k, v) => `<div class="exp-kv"><span>${k}</span><b>${v}</b></div>`;
  const body = `
    <div class="exp-detail-grid" style="grid-template-columns:repeat(2, minmax(0, 1fr));">
      <div class="exp-detail-card">
        <h4>Batch &amp; Product</h4>
        ${kv('Product', escapeHtml(b.productName))}
        ${kv('Brand / Color', `${escapeHtml(b.brand || '—')} · ${escapeHtml(b.color || '—')}`)}
        ${kv('Container Size', b.containerSize !== null ? fmtSize(b.containerSize) : '—')}
        ${kv('Batch Number', `<code class="exp-code">${escapeHtml(b.batchNumber)}</code>`)}
        ${kv('Supplier', escapeHtml(b.supplierName || '—'))}
        ${kv('Date Received', expFmtDate(b.dateReceived))}
        ${kv('Expiration Date', b.expirationDate ? expFmtDate(b.expirationDate) : 'Not specified')}
        ${kv('Days Remaining', b.depleted ? '—' : expDaysText(b))}
        ${kv('Remaining Qty', `${b.remainingQty} unit(s)`)}
      </div>
      <div class="exp-detail-card">
        <h4>Discount Calculation</h4>
        ${kv('Original Unit Price', b.pricePerCan !== null ? peso(b.pricePerCan) : '—')}
        ${kv('Discount Percentage', `${b.discountPct}%`)}
        ${kv('Discount Amount', peso(b.discountAmount || 0))}
        ${kv('Discounted Unit Price', b.discountedPrice !== null ? `<span style="color:var(--success-text);">${peso(b.discountedPrice)}</span>` : '—')}
        ${kv('Discount Status', discStatusBadge(b.discountStatus))}
        ${kv('Rule Source', b.discountSource === 'batch' ? 'Batch-specific rule' : (b.discountSource === 'schedule' ? 'Global expiration schedule' : 'None'))}
        ${b.discountRule && b.discountRule.daysBeforeExpiry !== null ? kv('Starts At', `≤ ${b.discountRule.daysBeforeExpiry} days before expiry`) : ''}
        ${b.discountRule && b.discountRule.notes ? `<div class="exp-note-box">📝 ${escapeHtml(b.discountRule.notes)}</div>` : ''}
      </div>
    </div>`;
  const foot = `<button class="btn secondary" onclick="closeModal()">Close</button>` +
    (discCanManage() && !b.depleted && b.expiryStatus !== 'expired' && b.expirationDate
      ? `<button class="btn" onclick="discOpenRuleModal('${escapeAttr(b.batchId)}')">✏️ Configure Discount</button>`
      : '');
  openModal(`🏷️ Batch Discount Details — ${escapeHtml(b.batchNumber)}`, body, foot, 'wide');
}

function discRulePreview(origPrice) {
  const pct = Number((document.getElementById('disc-r-pct') || {}).value);
  const el = document.getElementById('disc-r-preview');
  if (!el) return;
  if (origPrice === null || origPrice === undefined || isNaN(pct) || pct < 0 || pct > 90) {
    el.innerHTML = '<span class="muted small">Enter a valid discount percentage (0–90%) to preview pricing.</span>';
    return;
  }
  const amt = Number((origPrice * (pct / 100)).toFixed(2));
  const fin = Number(Math.max(0, origPrice - amt).toFixed(2));
  el.innerHTML = `Original: <b>${peso(origPrice)}</b> &nbsp;−&nbsp; Discount (${pct}%): <b style="color:var(--danger);">${peso(amt)}</b> &nbsp;=&nbsp; Discounted Price: <b style="color:var(--success-text);">${peso(fin)}</b>`;
}

function discOpenRuleModal(batchId) {
  if (!discCanManage()) { showToast('Only Administrators can configure discounts.', 'error'); return; }
  const b = discFindBatch(batchId);
  if (!b) return;
  const r = b.discountRule || null;
  const initPct = r ? r.discountPct : (b.discountPct || 0);
  const initDays = r && r.daysBeforeExpiry !== null ? r.daysBeforeExpiry : '';
  const initActive = r ? r.isActive : true;
  const initNotes = r ? (r.notes || '') : '';

  const body = `
    <div class="exp-form-note">Configure a batch-specific near-expiry discount for <b>${escapeHtml(b.productName)}</b> (${fmtSize(b.containerSize)}) · Batch <code class="exp-code">${escapeHtml(b.batchNumber)}</code>. Does not affect other batches or stock quantities.</div>
    <div class="exp-adj-summary">
      <div><span>Original Price</span><b>${b.pricePerCan !== null ? peso(b.pricePerCan) : '—'}</b></div>
      <div><span>Remaining Qty</span><b>${b.remainingQty} unit(s)</b></div>
      <div><span>Expiration</span><b>${expFmtDate(b.expirationDate)}</b></div>
      <div><span>Days Left</span><b>${expDaysText(b)}</b></div>
    </div>
    <div class="exp-form-grid">
      <div class="field">
        <label for="disc-r-pct">Discount Percentage (%) *</label>
        <input type="number" id="disc-r-pct" min="0" max="90" step="0.5" value="${initPct}" oninput="discRulePreview(${b.pricePerCan !== null ? b.pricePerCan : 'null'})">
      </div>
      <div class="field">
        <label for="disc-r-days">Starts ≤ Days Before Expiry <span class="muted">(optional)</span></label>
        <input type="number" id="disc-r-days" min="0" max="730" step="1" value="${escapeAttr(initDays)}" placeholder="Immediate when active">
      </div>
    </div>
    <div class="field" style="margin-top:8px;">
      <label class="exp-check"><input type="checkbox" id="disc-r-active" ${initActive ? 'checked' : ''}> Discount rule is Active</label>
    </div>
    <div id="disc-r-preview" class="exp-adj-preview pos" style="margin-top:8px;"></div>
    <div class="field" style="margin-top:8px;">
      <label for="disc-r-notes">Discount Notes <span class="muted">(optional)</span></label>
      <textarea id="disc-r-notes" rows="2" maxlength="500" placeholder="e.g. Promotional clearance for batch expiring next month">${escapeHtml(initNotes)}</textarea>
    </div>
    <div class="field" style="margin-top:8px;">
      <label for="disc-r-reason">Reason for Change * <span class="muted">(recorded in Audit Log)</span></label>
      <textarea id="disc-r-reason" rows="2" maxlength="300" placeholder="e.g. Approved 15% near-expiry markdown for fast clearance"></textarea>
    </div>
    <div id="disc-r-err" class="exp-form-err"></div>`;

  openModal(`🏷️ Configure Batch Discount — ${escapeHtml(b.batchNumber)}`, body,
    `<button class="btn secondary" onclick="closeModal()">Cancel</button><button class="btn" id="disc-r-save" onclick="discSaveRule('${escapeAttr(batchId)}')">Save Discount Rule</button>`, '');
  discRulePreview(b.pricePerCan);
}

async function discSaveRule(batchId) {
  if (_discSaving) return;
  const err = document.getElementById('disc-r-err');
  const fail = m => { if (err) err.textContent = m; };
  const pct = Number((document.getElementById('disc-r-pct') || {}).value);
  const daysRaw = ((document.getElementById('disc-r-days') || {}).value || '').trim();
  const isActive = !!(document.getElementById('disc-r-active') || {}).checked;
  const notes = ((document.getElementById('disc-r-notes') || {}).value || '').trim();
  const reason = ((document.getElementById('disc-r-reason') || {}).value || '').trim();

  if (isNaN(pct) || pct < 0 || pct > 90) return fail('Discount percentage must be between 0% and 90%.');
  if (daysRaw !== '' && (isNaN(Number(daysRaw)) || Number(daysRaw) < 0 || Number(daysRaw) > 730)) {
    return fail('Days before expiration must be between 0 and 730.');
  }
  if (reason.length < 5) return fail('Please enter a reason for change (at least 5 characters).');

  _discSaving = true;
  const btn = document.getElementById('disc-r-save');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  try {
    await discApi('save_discount_rule', {
      body: {
        batchId,
        discountPct: pct,
        daysBeforeExpiry: daysRaw === '' ? null : Number(daysRaw),
        isActive,
        notes,
        reason
      }
    });
    closeModal();
    if (typeof posBatchStatusLoadedAt !== 'undefined') posBatchStatusLoadedAt = 0;
    showToast('✓ Batch discount rule saved.', 'ok');
    await discLoad(true);
  } catch (e) {
    fail(e.message);
    if (btn) { btn.disabled = false; btn.textContent = 'Save Discount Rule'; }
  } finally {
    _discSaving = false;
  }
}

function discConfirmToggle(batchId) {
  if (!discCanManage()) return;
  const b = discFindBatch(batchId);
  if (!b) return;
  const willActivate = b.discountStatus !== 'active';
  const existingPct = b.discountRule ? Number(b.discountRule.discountPct || 0) : Number(b.discountPct || 0);
  if (willActivate && existingPct <= 0) {
    discOpenRuleModal(batchId);
    return;
  }
  const verb = willActivate ? 'Activate' : 'Deactivate';
  const body = `
    <div class="exp-form-note">Are you sure you want to <b>${verb.toLowerCase()}</b> the near-expiry discount for <b>${escapeHtml(b.productName)}</b> · Batch <code class="exp-code">${escapeHtml(b.batchNumber)}</code>?</div>
    <div class="field">
      <label for="disc-t-reason">Reason for ${verb} *</label>
      <textarea id="disc-t-reason" rows="2" maxlength="300" placeholder="Enter reason for ${verb.toLowerCase()}ing this batch discount"></textarea>
    </div>
    <div id="disc-t-err" class="exp-form-err"></div>`;
  openModal(`${willActivate ? '▶' : '⏸'} ${verb} Batch Discount`, body,
    `<button class="btn secondary" onclick="closeModal()">Cancel</button><button class="btn" id="disc-t-btn" onclick="discExecToggle('${escapeAttr(batchId)}', ${willActivate ? 'true' : 'false'})">${verb} Discount</button>`, '');
}

async function discExecToggle(batchId, isActive) {
  const err = document.getElementById('disc-t-err');
  const reason = ((document.getElementById('disc-t-reason') || {}).value || '').trim();
  if (reason.length < 5) { if (err) err.textContent = 'Please enter a reason (at least 5 characters).'; return; }
  const btn = document.getElementById('disc-t-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Updating…'; }
  try {
    await discApi('toggle_discount_rule', { body: { batchId, isActive, reason } });
    if (typeof posBatchStatusLoadedAt !== 'undefined') posBatchStatusLoadedAt = 0;
    closeModal();
    showToast(`✓ Batch discount ${isActive ? 'activated' : 'deactivated'}.`, 'ok');
    await discLoad(true);
  } catch (e) {
    if (err) err.textContent = e.message;
    if (btn) { btn.disabled = false; btn.textContent = isActive ? 'Activate Discount' : 'Deactivate Discount'; }
  }
}

function discConfirmDelete(batchId) {
  if (!discCanManage()) return;
  const b = discFindBatch(batchId);
  if (!b) return;
  const body = `
    <div class="exp-form-note">Delete the custom discount rule for Batch <code class="exp-code">${escapeHtml(b.batchNumber)}</code>? The batch will revert to the global expiration schedule (if enabled).</div>
    <div class="field">
      <label for="disc-del-reason">Reason for Deletion *</label>
      <textarea id="disc-del-reason" rows="2" maxlength="300" placeholder="Explain why this custom discount rule is being removed"></textarea>
    </div>
    <div id="disc-del-err" class="exp-form-err"></div>`;
  openModal('🗑️ Delete Batch Discount Rule', body,
    `<button class="btn secondary" onclick="closeModal()">Cancel</button><button class="btn danger" id="disc-del-btn" onclick="discExecDelete('${escapeAttr(batchId)}')">Delete Rule</button>`, '');
}

async function discExecDelete(batchId) {
  const err = document.getElementById('disc-del-err');
  const reason = ((document.getElementById('disc-del-reason') || {}).value || '').trim();
  if (reason.length < 5) { if (err) err.textContent = 'Please enter a reason (at least 5 characters).'; return; }
  const btn = document.getElementById('disc-del-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Deleting…'; }
  try {
    await discApi('delete_discount_rule', { body: { batchId, reason } });
    if (typeof posBatchStatusLoadedAt !== 'undefined') posBatchStatusLoadedAt = 0;
    closeModal();
    showToast('✓ Custom discount rule deleted.', 'ok');
    await discLoad(true);
  } catch (e) {
    if (err) err.textContent = e.message;
    if (btn) { btn.disabled = false; btn.textContent = 'Delete Rule'; }
  }
}

/* ------------------------------------------------------------
   Global Schedule Tiers Modal (Admin Only)
   ------------------------------------------------------------ */
function discScheduleRowHtml(days, pct) {
  return `
    <div class="disc-tier-row">
      <input type="number" class="disc-tier-days" min="0" max="730" step="1" value="${days}" placeholder="Days">
      <span class="muted small">days before expiry →</span>
      <input type="number" class="disc-tier-pct" min="0" max="90" step="0.5" value="${pct}" placeholder="%">
      <span class="muted small">%</span>
      <button type="button" class="btn ghost small" style="color:var(--danger);" onclick="this.parentElement.remove()" title="Remove tier">✕</button>
    </div>`;
}

function discAddTierRow() {
  const wrap = document.getElementById('disc-tiers-list');
  if (wrap) wrap.insertAdjacentHTML('beforeend', discScheduleRowHtml(14, 15));
}

function discOpenScheduleModal() {
  if (!discCanManage()) { showToast('Only Administrators can configure discount schedules.', 'error'); return; }
  const ds = (DISC.data && DISC.data.discountSettings) || {
    enabled: false,
    tiers: [{ days: 90, pct: 0 }, { days: 60, pct: 5 }, { days: 30, pct: 10 }, { days: 15, pct: 20 }, { days: 7, pct: 30 }]
  };
  const body = `
    <div class="exp-form-note">Configure automatic discount tiers based on days remaining before expiration. Batches without an expiration date, expired batches, and depleted batches never receive discounts.</div>
    <div class="field" style="margin-bottom:10px;">
      <label class="exp-check"><input type="checkbox" id="disc-s-enabled" ${ds.enabled ? 'checked' : ''}> <b>Enable automatic near-expiry discount schedule</b></label>
    </div>
    <div class="disc-tiers-box">
      <div class="disc-tiers-head">
        <b>Expiration Tiers</b>
        <button type="button" class="btn secondary small" onclick="discAddTierRow()">+ Add Tier</button>
      </div>
      <div id="disc-tiers-list" class="disc-tiers-list">
        ${(ds.tiers || []).map(t => discScheduleRowHtml(t.days, t.pct)).join('')}
      </div>
    </div>
    <div class="field" style="margin-top:10px;">
      <label for="disc-s-reason">Reason for Schedule Change *</label>
      <textarea id="disc-s-reason" rows="2" maxlength="300" placeholder="e.g. Updated seasonal near-expiry discount schedule"></textarea>
    </div>
    <div id="disc-s-err" class="exp-form-err"></div>`;
  openModal('⚙ Near-Expiry Discount Schedule', body,
    `<button class="btn secondary" onclick="closeModal()">Cancel</button><button class="btn" id="disc-s-save" onclick="discSaveSchedule()">Save Schedule</button>`, '');
}

async function discSaveSchedule() {
  const err = document.getElementById('disc-s-err');
  const fail = m => { if (err) err.textContent = m; };
  const enabled = !!(document.getElementById('disc-s-enabled') || {}).checked;
  const reason = ((document.getElementById('disc-s-reason') || {}).value || '').trim();
  const rows = Array.from(document.querySelectorAll('#disc-tiers-list .disc-tier-row'));
  const tiers = [];
  for (const row of rows) {
    const days = Number(row.querySelector('.disc-tier-days').value);
    const pct = Number(row.querySelector('.disc-tier-pct').value);
    if (isNaN(days) || days < 0 || days > 730) return fail('Tier days must be between 0 and 730.');
    if (isNaN(pct) || pct < 0 || pct > 90) return fail('Tier discount percentages must be between 0% and 90%.');
    tiers.push({ days: Math.floor(days), pct });
  }
  if (!tiers.length) return fail('Add at least one discount tier.');
  if (reason.length < 5) return fail('Please enter a reason for change (at least 5 characters).');

  const btn = document.getElementById('disc-s-save');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  try {
    await discApi('save_discount_settings', { body: { enabled, tiers, reason } });
    if (typeof posBatchStatusLoadedAt !== 'undefined') posBatchStatusLoadedAt = 0;
    closeModal();
    showToast('✓ Near-expiry discount schedule saved.', 'ok');
    await discLoad(true);
  } catch (e) {
    fail(e.message);
    if (btn) { btn.disabled = false; btn.textContent = 'Save Schedule'; }
  }
}

