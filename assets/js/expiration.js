/* ============================================================
   20. EXPIRATION TRACKING MODULE
   MRGR Color Center — Sales & Inventory System

   Batch-level expiration monitoring on top of the centralized inventory.
   Data lives in MySQL (inventory_batches / batch_movements) and is served by
   api/batches.php. Stock quantities are never duplicated: the batch totals are a
   breakdown of inventory.sealed_quantity, maintained server-side by api/batch_lib.php
   (receiving -> new batch, POS/other deductions -> FIFO, returns -> restore).
   ============================================================ */

const EXP_SUMMARY_CACHE_KEY = 'mrgr_exp_summary_v1';

function expReadCachedSummary() {
  try {
    const raw = sessionStorage.getItem(EXP_SUMMARY_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (e) {
    return null;
  }
}

function expWriteCachedSummary(summary) {
  try {
    if (summary) sessionStorage.setItem(EXP_SUMMARY_CACHE_KEY, JSON.stringify(summary));
  } catch (e) { /* ignore storage quota/privacy errors */ }
}

const EXP = {
  loaded: false,
  loading: false,
  error: '',
  data: null,          // last /list payload
  summary: expReadCachedSummary(), // lightweight summary for nav badge / dashboards
  summaryTs: 0,
  detail: null,        // last /detail payload shown in modal
  detailTab: 'movements'
};

const EXP_STATUS_META = {
  good: { label: 'Good', icon: '✅' },
  soon: { label: 'Expiring Soon', icon: '🕒' },
  critical: { label: 'Critical', icon: '🔥' },
  expired: { label: 'Expired', icon: '⛔' },
  none: { label: 'Not Specified', icon: '❔' },
  depleted: { label: 'Depleted', icon: '▫️' }
};

const EXP_ADJ_TYPES = {
  remove_expired: { label: 'Remove — Expired / spoiled stock', sign: -1, reason: 'Expired / Spoiled' },
  remove_damaged: { label: 'Remove — Damaged / defective', sign: -1, reason: 'Damaged' },
  remove_correction: { label: 'Remove — Count correction', sign: -1, reason: 'Count Correction (remove)' },
  add_correction: { label: 'Add — Count correction', sign: 1, reason: 'Count Correction (add)' }
};

/* ---- filter / view state ---- */
let expStatusFilter = 'all';       // all | good | soon | critical | expired | none
let expSearchQuery = '';
let expCategoryFilter = 'all';
let expSupplierFilter = 'all';
let expDateFrom = '';
let expDateTo = '';
let expGroupBy = 'date';           // date | product | supplier | none
let expSortBy = 'recv_desc';       // recv_desc | recv_asc | exp_asc | exp_desc | product_asc
let expShowDepleted = false;
const expCollapsedGroups = new Set();
let _expSearchTimer = null;

const EXP_PAG_KEY = 'expiration_batches';

/* ------------------------------------------------------------
   Helpers
   ------------------------------------------------------------ */
function expIsAdmin() { return !!(currentUser && currentUser.role === 'admin'); }
function expIsStaff() { return !!(currentUser && currentUser.role === 'staff'); }

function expCanEdit() {
  return EXP.data && EXP.data.permissions ? !!EXP.data.permissions.canEdit : (expIsAdmin() || expIsStaff());
}

function expCanAdjust() {
  return EXP.data && EXP.data.permissions && EXP.data.permissions.canAdjust !== undefined
    ? !!EXP.data.permissions.canAdjust
    : expIsAdmin();
}

function expParseDate(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) { const d = new Date(s); return isNaN(d) ? null : d; }
  return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
}

function expFmtDate(s) {
  const d = expParseDate(s);
  if (!d) return '—';
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function expFmtDateTime(s) {
  const d = expParseDate(s);
  if (!d) return '—';
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) + ' · ' +
    d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
}

function expDaysText(b) {
  if (b.daysRemaining === null || b.daysRemaining === undefined) return '—';
  const d = b.daysRemaining;
  if (d < 0) return `${Math.abs(d)} day${Math.abs(d) === 1 ? '' : 's'} overdue`;
  if (d === 0) return 'Expires today';
  return `${d} day${d === 1 ? '' : 's'}`;
}

function expBadge(status, extraClass) {
  const m = EXP_STATUS_META[status] || EXP_STATUS_META.none;
  return `<span class="exp-badge ${status} ${extraClass || ''}">${m.icon} ${m.label}</span>`;
}

function expCostText(v) {
  return (v === null || v === undefined) ? '—' : peso(v);
}

function expApi(action, options = {}) {
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

/* ------------------------------------------------------------
   Lightweight summary (nav badge + dashboards), throttled
   ------------------------------------------------------------ */
function expBadgeCount() {
  const s = EXP.summary;
  if (!s) return 0;
  return (s.expired || 0) + (s.critical || 0);
}

function expSyncDashboardCards() {
  const s = EXP.summary;
  if (!s) return;
  const urgent = (s.expired || 0) + (s.critical || 0);

  const card = document.getElementById('exp-dash-stat-card');
  if (card) {
    card.classList.toggle('danger', urgent > 0);
    const valEl = card.querySelector('.value');
    if (valEl) valEl.textContent = `${urgent} Urgent`;
    const subEl = card.querySelector('.sub');
    if (subEl) subEl.innerHTML = `<b>${s.expired || 0}</b> expired · <b>${s.critical || 0}</b> critical · <b>${s.soon || 0}</b> soon`;
  }

  const adminQuickBtn = document.getElementById('exp-dash-quick-btn');
  if (adminQuickBtn) {
    adminQuickBtn.innerHTML = `🗓️ Expiration Tracking ${urgent > 0 ? `<span class="nav-badge" style="background:var(--danger);">${urgent}</span>` : ''}`;
  }

  const staffQuickBtn = document.getElementById('exp-staff-quick-btn');
  if (staffQuickBtn && typeof getModuleBadgeHtml === 'function') {
    staffQuickBtn.innerHTML = `<span>🗓️</span> Expiration Tracking ${getModuleBadgeHtml('expiration')}`;
  }
}

function expRefreshSummary(force) {
  if (!currentUser || !['admin', 'staff'].includes(currentUser.role)) return;
  const now = Date.now();
  if (!force && now - EXP.summaryTs < 15000) return;
  EXP.summaryTs = now;
  expApi('summary').then(json => {
    EXP.summary = Object.assign({}, json.summary, { attention: json.attention || [], thresholds: json.thresholds });
    expWriteCachedSummary(EXP.summary);
    const w = document.getElementById('exp-dash-widget');
    if (w) w.innerHTML = expDashboardWidgetInner();
    expSyncDashboardCards();
    if (typeof updateNavBadges === 'function') {
      // updateNavBadges re-enters expRefreshSummary but the throttle stamp above stops recursion
      updateNavBadges();
    }
  }).catch(() => { /* badge is best-effort */ });
}

/* ------------------------------------------------------------
   Data loading
   ------------------------------------------------------------ */
async function expLoad(silent) {
  EXP.loading = true;
  EXP.error = '';
  if (!silent) expRenderResults();
  try {
    const json = await expApi('list');
    EXP.data = json;
    EXP.loaded = true;
    EXP.summary = Object.assign({}, json.summary, { attention: EXP.summary ? EXP.summary.attention : [], thresholds: json.thresholds });
    EXP.summaryTs = Date.now();
    expWriteCachedSummary(EXP.summary);
    expSyncDashboardCards();
  } catch (e) {
    EXP.error = e.message || 'Could not load batches.';
  }
  EXP.loading = false;
  if (currentPage === 'expiration') {
    expRenderFilters();
    expRenderResults();
    if (typeof updateNavBadges === 'function') updateNavBadges();
  } else if ((currentPage === 'inventory' || currentPage === 'products') && typeof renderInventoryTable === 'function') {
    renderInventoryTable(true);
  }
}

function initExpirationPage() {
  expRenderFilters();
  expRenderResults();
  expLoad(EXP.loaded); // always refresh from DB when entering the module
}

/* ------------------------------------------------------------
   Filtering / sorting
   ------------------------------------------------------------ */
function expBaseList(ignoreStatus) {
  const all = (EXP.data && EXP.data.batches) || [];
  const q = expSearchQuery.trim().toLowerCase();
  return all.filter(b => {
    if (!expShowDepleted && b.depleted) return false;
    if (q) {
      const hay = `${b.productName} ${b.batchNumber} ${b.brand}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (expCategoryFilter !== 'all' && b.category !== expCategoryFilter) return false;
    if (expSupplierFilter !== 'all' && b.supplierName !== expSupplierFilter) return false;
    if (expDateFrom || expDateTo) {
      if (!b.expirationDate) return false;
      const e = String(b.expirationDate).slice(0, 10);
      if (expDateFrom && e < expDateFrom) return false;
      if (expDateTo && e > expDateTo) return false;
    }
    if (!ignoreStatus && expStatusFilter !== 'all' && b.expiryStatus !== expStatusFilter) return false;
    return true;
  });
}

function expSortList(list) {
  const arr = list.slice();
  const recv = b => (b.dateReceived || '');
  const expKey = (b, nullLast) => b.expirationDate ? String(b.expirationDate).slice(0, 10) : nullLast;
  arr.sort((a, b) => {
    let r = 0;
    switch (expSortBy) {
      case 'recv_asc': r = recv(a).localeCompare(recv(b)); break;
      case 'recv_desc': r = recv(b).localeCompare(recv(a)); break;
      case 'exp_desc': r = expKey(b, '').localeCompare(expKey(a, '')); if (!a.expirationDate && b.expirationDate) r = 1; if (a.expirationDate && !b.expirationDate) r = -1; break;
      case 'product_asc': r = String(a.productName).localeCompare(String(b.productName)) || ((a.containerSize || 0) - (b.containerSize || 0)); break;
      case 'exp_asc':
      default: r = expKey(a, '9999-99-99').localeCompare(expKey(b, '9999-99-99')); break;
    }
    if (r === 0) r = expKey(a, '9999-99-99').localeCompare(expKey(b, '9999-99-99'));
    if (r === 0) r = recv(b).localeCompare(recv(a)) || String(a.batchId).localeCompare(String(b.batchId));
    return r;
  });
  return arr;
}

function expReceiveDateKey(b) {
  const raw = String(b && b.dateReceived || '').trim();
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : 'unknown';
}

function expFormatGroupDateMeta(dateKey) {
  if (!dateKey || dateKey === 'unknown') return { title: 'Unknown Receiving Date', tag: '' };
  const d = expParseDate(dateKey);
  if (!d) return { title: dateKey, tag: '' };
  const title = d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
  const weekday = d.toLocaleDateString('en-PH', { weekday: 'short' });
  const today = expParseDate(todayISO());
  let tag = weekday;
  if (today) {
    const diffDays = Math.round((today.getTime() - d.getTime()) / 86400000);
    if (diffDays === 0) tag = `${weekday} · Today`;
    else if (diffDays === 1) tag = `${weekday} · Yesterday`;
  }
  return { title, tag };
}

function expGroupSummary(items) {
  let totalReceived = 0;
  let totalRemaining = 0;
  let expiredCount = 0;
  let criticalCount = 0;
  let soonCount = 0;
  let goodCount = 0;
  let depletedCount = 0;
  for (let i = 0; i < items.length; i++) {
    const b = items[i];
    totalReceived += Number(b.originalQty) || 0;
    totalRemaining += Number(b.remainingQty) || 0;
    if (b.depleted) {
      depletedCount++;
      continue;
    }
    if (b.expiryStatus === 'expired') expiredCount++;
    else if (b.expiryStatus === 'critical') criticalCount++;
    else if (b.expiryStatus === 'soon') soonCount++;
    else if (b.expiryStatus === 'good') goodCount++;
  }
  return {
    totalBatches: items.length,
    totalReceived,
    totalRemaining,
    expiredCount,
    criticalCount,
    soonCount,
    nearExpiryCount: criticalCount + soonCount,
    goodCount,
    depletedCount
  };
}

function expBuildGroups(list) {
  const sorted = expSortList(list);
  const map = new Map();

  for (let i = 0; i < sorted.length; i++) {
    const b = sorted[i];
    let key = '';
    let label = '';
    let sub = '';
    let colorHex = '';
    let sortKey = '';

    if (expGroupBy === 'product') {
      key = 'prod:' + (b.productId || b.productName || 'unknown');
      label = b.productName || '(Deleted Product)';
      sub = [b.brand, b.category].filter(Boolean).join(' · ');
      colorHex = b.colorHex || '';
      sortKey = label.toLowerCase();
    } else if (expGroupBy === 'supplier') {
      const sup = (b.supplierName || '').trim();
      key = 'sup:' + (sup ? sup.toLowerCase() : '__none__');
      label = sup || 'No Supplier';
      sub = '';
      sortKey = sup ? sup.toLowerCase() : '\uffff';
    } else {
      const dk = expReceiveDateKey(b);
      key = 'date:' + dk;
      const meta = expFormatGroupDateMeta(dk);
      label = meta.title;
      sub = meta.tag;
      sortKey = dk === 'unknown' ? '' : dk;
    }

    if (!map.has(key)) {
      map.set(key, { key, label, sub, colorHex, sortKey, items: [] });
    }
    map.get(key).items.push(b);
  }

  const groups = Array.from(map.values());
  if (expGroupBy === 'date') {
    const asc = expSortBy === 'recv_asc';
    groups.sort((a, b) => {
      if (!a.sortKey && !b.sortKey) return 0;
      if (!a.sortKey) return 1;
      if (!b.sortKey) return -1;
      return asc ? a.sortKey.localeCompare(b.sortKey) : b.sortKey.localeCompare(a.sortKey);
    });
  } else {
    groups.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }

  return groups.map(g => {
    g.summary = expGroupSummary(g.items);
    return g;
  });
}

function expHasActiveFilters() {
  return expStatusFilter !== 'all' || expSearchQuery || expCategoryFilter !== 'all' || expSupplierFilter !== 'all' ||
    expDateFrom || expDateTo || expGroupBy !== 'date' || expSortBy !== 'recv_desc' || expShowDepleted;
}

/* ---- setters (each re-renders only what changed) ---- */
function expSetStatus(s) {
  expStatusFilter = s || 'all';
  resetPaginationPage(EXP_PAG_KEY);
  expRenderResults();
  expSyncRoute();
}
function expSetSearch(v) {
  expSearchQuery = v || '';
  clearTimeout(_expSearchTimer);
  _expSearchTimer = setTimeout(() => {
    resetPaginationPage(EXP_PAG_KEY);
    expRenderResults();
    expSyncRoute();
  }, 160);
}
function expSetCategory(v) { expCategoryFilter = v || 'all'; resetPaginationPage(EXP_PAG_KEY); expRenderResults(); expSyncRoute(); }
function expSetSupplier(v) { expSupplierFilter = v || 'all'; resetPaginationPage(EXP_PAG_KEY); expRenderResults(); expSyncRoute(); }
function expSetDateFrom(v) {
  expDateFrom = v || '';
  if (expDateFrom && expDateTo && expDateFrom > expDateTo) { expDateTo = expDateFrom; const el = document.getElementById('exp-date-to'); if (el) el.value = expDateTo; }
  resetPaginationPage(EXP_PAG_KEY); expRenderResults(); expSyncRoute();
}
function expSetDateTo(v) {
  expDateTo = v || '';
  if (expDateFrom && expDateTo && expDateTo < expDateFrom) { expDateFrom = expDateTo; const el = document.getElementById('exp-date-from'); if (el) el.value = expDateFrom; }
  resetPaginationPage(EXP_PAG_KEY); expRenderResults(); expSyncRoute();
}
function expSetGroupBy(v) {
  expGroupBy = ['date', 'product', 'supplier', 'none'].includes(v) ? v : 'date';
  expCollapsedGroups.clear();
  resetPaginationPage(EXP_PAG_KEY);
  expRenderResults();
  expSyncRoute();
}
function expSetSort(v) { expSortBy = v || 'recv_desc'; resetPaginationPage(EXP_PAG_KEY); expRenderResults(); expSyncRoute(); }
function expToggleDepleted(on) { expShowDepleted = !!on; resetPaginationPage(EXP_PAG_KEY); expRenderResults(); expSyncRoute(); }

function expToggleGroup(key) {
  if (expCollapsedGroups.has(key)) expCollapsedGroups.delete(key);
  else expCollapsedGroups.add(key);
  expRenderTable();
}

function expSetAllGroupsCollapsed(collapsed) {
  const groups = expBuildGroups(expBaseList(false));
  expCollapsedGroups.clear();
  if (collapsed) {
    groups.forEach(g => expCollapsedGroups.add(g.key));
  }
  expRenderTable();
}

function expResetFilters() {
  expStatusFilter = 'all'; expSearchQuery = ''; expCategoryFilter = 'all'; expSupplierFilter = 'all';
  expDateFrom = ''; expDateTo = ''; expGroupBy = 'date'; expSortBy = 'recv_desc'; expShowDepleted = false;
  expCollapsedGroups.clear();
  resetPaginationPage(EXP_PAG_KEY);
  expRenderFilters();
  expRenderResults();
  expSyncRoute();
}

function expSyncRoute() {
  if (typeof syncRouteState === 'function') syncRouteState({ push: false });
}

/* URL state hooks used by shell.js routing */
function expRouteParams(params) {
  if (expStatusFilter !== 'all') params.set('status', expStatusFilter);
  if (expSearchQuery) params.set('q', expSearchQuery);
  if (expCategoryFilter !== 'all') params.set('category', expCategoryFilter);
  if (expSupplierFilter !== 'all') params.set('supplier', expSupplierFilter);
  if (expDateFrom) params.set('from', expDateFrom);
  if (expDateTo) params.set('to', expDateTo);
  if (expGroupBy !== 'date') params.set('group', expGroupBy);
  if (expSortBy !== 'recv_desc') params.set('sort', expSortBy);
  if (expShowDepleted) params.set('depleted', '1');
  const st = getPaginationState(EXP_PAG_KEY);
  if (st.page > 1) params.set('p', String(st.page));
  if (st.pageSize !== DEFAULT_PAGINATION_SIZE) params.set('ps', String(st.pageSize));
}

function expApplyRouteParams(params) {
  const st = params.get('status') || 'all';
  expStatusFilter = ['all', 'good', 'soon', 'critical', 'expired', 'none'].includes(st) ? st : 'all';
  expSearchQuery = params.get('q') || '';
  expCategoryFilter = params.get('category') || 'all';
  expSupplierFilter = params.get('supplier') || 'all';
  expDateFrom = params.get('from') || '';
  expDateTo = params.get('to') || '';
  const gr = params.get('group') || 'date';
  expGroupBy = ['date', 'product', 'supplier', 'none'].includes(gr) ? gr : 'date';
  const so = params.get('sort') || 'recv_desc';
  expSortBy = ['recv_desc', 'recv_asc', 'exp_asc', 'exp_desc', 'product_asc'].includes(so) ? so : 'recv_desc';
  expShowDepleted = params.get('depleted') === '1';
  const pst = getPaginationState(EXP_PAG_KEY);
  const sz = Number(params.get('ps'));
  if (PAGINATION_PAGE_SIZES.includes(sz)) pst.pageSize = sz;
  pst.page = Math.max(1, Number(params.get('p')) || 1);
}

/* Navigate here from elsewhere (dashboard cards) with a preset status filter */
function goToExpiration(status) {
  expStatusFilter = ['good', 'soon', 'critical', 'expired', 'none'].includes(status) ? status : 'all';
  expSearchQuery = ''; expCategoryFilter = 'all'; expSupplierFilter = 'all'; expDateFrom = ''; expDateTo = '';
  resetPaginationPage(EXP_PAG_KEY);
  if (typeof goTo === 'function') goTo('expiration');
}

/* ------------------------------------------------------------
   PAGE
   ------------------------------------------------------------ */
function expirationPage() {
  return `
  <div id="exp-root" class="exp-root">
    <div class="exp-header">
      <div>
        <div class="exp-title">🗓️ Expiration Tracking</div>
        <div class="exp-subtitle">Batch-level shelf-life monitoring. Quantities are the same centralized inventory — broken down by received batch and deducted FIFO (first received, first out).</div>
      </div>
      <div class="exp-header-actions">
        <button type="button" class="btn secondary small" onclick="expLoad(false)" title="Reload batches from the database">↻ Refresh</button>
        ${expIsAdmin() ? `<button type="button" class="btn secondary small" onclick="expOpenThresholds()" title="Change the Critical / Expiring Soon day thresholds">⚙ Thresholds</button>` : ''}
        ${expIsAdmin() ? `<button type="button" class="btn secondary small" onclick="expOpenDiscounts()" title="Configure near-expiry discount percentages for POS">🏷️ Near-Expiry Discounts</button>` : ''}
        <button type="button" class="btn small" onclick="expExportReport()" title="Export the filtered batches as a CSV report">⬇ Export Expiration Report</button>
      </div>
    </div>

    <div id="exp-cards" class="exp-cards"></div>
    <div id="exp-legend" class="exp-legend"></div>

    <div class="panel exp-panel" id="exp-table-panel">
      <div id="exp-tabs" class="exp-tabs"></div>
      <div id="exp-filters" class="exp-filters"></div>
      <div id="exp-table-wrap"></div>
    </div>
  </div>`;
}

function expRenderFilters() {
  const el = document.getElementById('exp-filters');
  if (!el) return;
  const cats = (EXP.data && EXP.data.categories) || [];
  const sups = (EXP.data && EXP.data.suppliers) || [];
  el.innerHTML = `
    <div class="exp-filter-field exp-search">
      <label for="exp-search-input">Search</label>
      <input type="search" id="exp-search-input" placeholder="Product name, brand or batch number…" value="${escapeAttr(expSearchQuery)}" oninput="expSetSearch(this.value)" autocomplete="off">
    </div>
    <div class="exp-filter-field">
      <label for="exp-category">Category</label>
      <select id="exp-category" onchange="expSetCategory(this.value)">
        <option value="all">All Categories</option>
        ${cats.map(c => `<option value="${escapeAttr(c)}" ${c === expCategoryFilter ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
      </select>
    </div>
    <div class="exp-filter-field">
      <label for="exp-supplier">Supplier</label>
      <select id="exp-supplier" onchange="expSetSupplier(this.value)">
        <option value="all">All Suppliers</option>
        ${sups.map(s => `<option value="${escapeAttr(s)}" ${s === expSupplierFilter ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('')}
      </select>
    </div>
    <div class="exp-filter-field">
      <label for="exp-date-from">Expires from</label>
      <input type="date" id="exp-date-from" value="${escapeAttr(expDateFrom)}" onchange="expSetDateFrom(this.value)">
    </div>
    <div class="exp-filter-field">
      <label for="exp-date-to">Expires to</label>
      <input type="date" id="exp-date-to" value="${escapeAttr(expDateTo)}" onchange="expSetDateTo(this.value)">
    </div>
    <div class="exp-filter-field">
      <label for="exp-group-by">Group by</label>
      <select id="exp-group-by" onchange="expSetGroupBy(this.value)">
        <option value="date" ${expGroupBy === 'date' ? 'selected' : ''}>Group by Receiving Date</option>
        <option value="product" ${expGroupBy === 'product' ? 'selected' : ''}>Group by Product</option>
        <option value="supplier" ${expGroupBy === 'supplier' ? 'selected' : ''}>Group by Supplier</option>
        <option value="none" ${expGroupBy === 'none' ? 'selected' : ''}>No Grouping (All Batches)</option>
      </select>
    </div>
    <div class="exp-filter-field">
      <label for="exp-sort">Sort by</label>
      <select id="exp-sort" onchange="expSetSort(this.value)">
        <option value="recv_desc" ${expSortBy === 'recv_desc' ? 'selected' : ''}>Latest Receiving Date First</option>
        <option value="recv_asc" ${expSortBy === 'recv_asc' ? 'selected' : ''}>Oldest Receiving Date First (FIFO)</option>
        <option value="exp_asc" ${expSortBy === 'exp_asc' ? 'selected' : ''}>Nearest Expiration Date (FEFO)</option>
        <option value="exp_desc" ${expSortBy === 'exp_desc' ? 'selected' : ''}>Furthest Expiration Date</option>
        <option value="product_asc" ${expSortBy === 'product_asc' ? 'selected' : ''}>Product Name (A–Z)</option>
      </select>
    </div>
    <div class="exp-filter-field exp-filter-check">
      <label class="exp-check"><input type="checkbox" id="exp-show-depleted" ${expShowDepleted ? 'checked' : ''} onchange="expToggleDepleted(this.checked)"> Show depleted batches</label>
      <button type="button" class="btn ghost small" id="exp-clear-btn" onclick="expResetFilters()" style="color:var(--danger);">✕ Clear filters</button>
    </div>`;
}

function expRenderResults() {
  expRenderCards();
  expRenderTabs();
  expRenderTable();
  const clr = document.getElementById('exp-clear-btn');
  if (clr) clr.style.visibility = expHasActiveFilters() ? 'visible' : 'hidden';
}

function expRenderCards() {
  const el = document.getElementById('exp-cards');
  const lg = document.getElementById('exp-legend');
  if (!el) return;
  const s = EXP.data ? EXP.data.summary : null;
  const t = EXP.data ? EXP.data.thresholds : { critical: 30, soon: 90 };
  const val = k => s ? s[k] : '–';
  const units = k => s ? `${s[k]} unit${s[k] === 1 ? '' : 's'}` : '';
  const card = (key, filter, icon, label, sub, cls, bg, fg) => `
    <div class="restock-card exp-card ${cls} ${expStatusFilter === filter ? 'active' : ''}" onclick="expSetStatus('${filter}')" title="Click to filter: ${label}">
      <div class="restock-card-icon" style="background:${bg}; color:${fg};">${icon}</div>
      <div class="restock-card-body">
        <div class="restock-card-val" style="color:${fg};">${val(key)}</div>
        <div class="restock-card-lbl">${label}</div>
        <div class="restock-card-sub">${sub}</div>
      </div>
    </div>`;
  el.innerHTML =
    card('total', 'all', '📦', 'Total Batches', s ? `${s.total === 1 ? 'batch' : 'batches'} with stock on hand` : 'Loading…', 'exp-card-total', 'var(--surface-3)', 'var(--ink)') +
    card('good', 'good', '✅', 'Good Stock', `${units('unitsGood')} · &gt; ${t.soon} days`, 'exp-card-good', 'var(--success-bg)', 'var(--success-text)') +
    card('soon', 'soon', '🕒', 'Expiring Soon', `${units('unitsSoon')} · ${t.critical + 1}–${t.soon} days`, 'exp-card-soon', 'var(--warning-bg)', 'var(--warning-text)') +
    card('critical', 'critical', '🔥', 'Critical', `${units('unitsCritical')} · 0–${t.critical} days`, 'exp-card-critical', 'var(--warning-bg)', 'var(--warning-text)') +
    card('expired', 'expired', '⛔', 'Expired', `${units('unitsExpired')} · past expiry`, 'exp-card-expired', 'var(--danger-bg)', 'var(--danger-text)') +
    card('none', 'none', '❔', 'Not Specified', `${units('unitsNone')} · no expiry date`, 'exp-card-none', 'var(--surface-3)', 'var(--ink-soft)');
  if (lg) {
    const risk = s && s.valueAtRisk > 0 ? ` · Stock value at risk (critical + expired, known cost): <b>${peso(s.valueAtRisk)}</b>` : '';
    lg.innerHTML = `Cards count batches that still have stock on hand. Good &gt; ${t.soon} days · Expiring Soon ${t.critical + 1}–${t.soon} days · Critical ≤ ${t.critical} days · Expired = past expiration date.${risk}`;
  }
}

function expRenderTabs() {
  const el = document.getElementById('exp-tabs');
  if (!el) return;
  const base = expBaseList(true);
  const count = k => k === 'all' ? base.length : base.filter(b => b.expiryStatus === k).length;
  const tabs = [
    ['all', '📋', 'All Batches'], ['good', '✅', 'Good'], ['soon', '🕒', 'Expiring Soon'],
    ['critical', '🔥', 'Critical'], ['expired', '⛔', 'Expired'], ['none', '❔', 'Not Specified']
  ];
  el.innerHTML = tabs.map(([k, icon, label]) => `
    <button type="button" class="report-toggle-btn exp-tab ${expStatusFilter === k ? 'active' : ''}" onclick="expSetStatus('${k}')">
      <span class="rt-icon">${icon}</span> ${label} <span class="exp-tab-count">${count(k)}</span>
    </button>`).join('');
}

function expTableHeadHtml() {
  return `
    <thead>
      <tr>
        <th>Product Name</th><th>Brand</th><th class="center">Container Size</th><th>Batch Number</th>
        <th>Supplier</th><th>Date Received</th><th>Expiration Date</th><th>Days Remaining</th>
        <th class="right">Remaining Qty</th><th class="right">Unit Cost</th><th>Expiration Status</th><th>Actions</th>
      </tr>
    </thead>`;
}

function expRenderBatchRow(b, canEdit) {
  const dep = b.depleted;
  const rowCls = `exp-row ${dep ? 'is-depleted' : 'st-' + b.expiryStatus}`;
  const daysCls = dep ? '' : `exp-days ${b.expiryStatus}`;
  const pct = b.originalQty > 0 ? Math.max(0, Math.min(100, Math.round(b.remainingQty / b.originalQty * 100))) : 0;
  const bid = escapeAttr(b.batchId);
  return `
  <tr class="${rowCls}" onclick="expOpenDetail('${bid}')" title="Click to view batch details">
    <td>
      <div class="exp-prod">
        <span class="exp-dot" style="background:${escapeAttr(b.colorHex || '#CCC')};"></span>
        <div><div class="exp-prod-name">${escapeHtml(b.productName)}</div>
        <div class="exp-sub">${escapeHtml(b.category || '')}${b.color ? ' · ' + escapeHtml(b.color) : ''}</div></div>
      </div>
    </td>
    <td>${escapeHtml(b.brand || '—')}</td>
    <td class="center"><span class="badge" style="background:var(--surface-3); color:var(--ink-soft); font-weight:700;">🥫 ${b.containerSize !== null ? fmtSize(b.containerSize) : '—'}</span></td>
    <td><code class="exp-code">${escapeHtml(b.batchNumber)}</code>${b.source === 'opening' ? '<div class="exp-sub">opening balance</div>' : (b.source === 'reconciliation' ? '<div class="exp-sub">auto-reconciled</div>' : '')}</td>
    <td>${escapeHtml(b.supplierName || '—')}</td>
    <td>${expFmtDate(b.dateReceived)}</td>
    <td>${b.expirationDate ? expFmtDate(b.expirationDate) : '<span class="muted">Not specified</span>'}</td>
    <td class="${daysCls}">${dep ? '—' : expDaysText(b)}</td>
    <td class="right">
      <div class="exp-qty"><b>${b.remainingQty}</b> <span class="muted">/ ${b.originalQty}</span></div>
      <div class="exp-qty-bar"><span style="width:${pct}%;"></span></div>
    </td>
    <td class="right">${expCostText(b.unitCost)}</td>
    <td>
      ${dep ? expBadge('depleted') : expBadge(b.expiryStatus)}
      ${(!dep && b.discountPct > 0 && b.pricePerCan !== null) ? `
        <div style="margin-top:4px; font-size:11px; line-height:1.3;">
          <span class="badge" style="background:var(--success-bg); color:var(--success-text); border:1px solid var(--success-border); font-size:10px; padding:1px 5px;">🏷️ -${b.discountPct}%</span>
          <span class="muted" style="text-decoration:line-through; margin-left:3px;">${peso(b.pricePerCan)}</span>
          <strong style="color:var(--success-text); margin-left:3px;">${peso(b.discountedPrice)}</strong>
        </div>
      ` : ''}
    </td>
    <td class="exp-actions" onclick="event.stopPropagation()">
      <button type="button" class="exp-act" title="View batch details" onclick="expOpenDetail('${bid}')">👁</button>
      <button type="button" class="exp-act" title="View stock movement history" onclick="expOpenDetail('${bid}', 'movements')">📜</button>
      <button type="button" class="exp-act ${canEdit ? '' : 'disabled'}" ${canEdit ? '' : 'disabled'} title="${canEdit ? 'Edit expiration date' : 'You do not have permission to edit expiration dates'}" onclick="expOpenEdit('${bid}')">✏️</button>
      <button type="button" class="exp-act ${expCanAdjust() ? '' : 'disabled'}" ${expCanAdjust() ? '' : 'disabled'} title="${expCanAdjust() ? 'Record stock adjustment' : 'Stock adjustments require Administrator authorization'}" onclick="expOpenAdjust('${bid}')">±</button>
    </td>
  </tr>`;
}

function expEmptyStateHtml() {
  return `<div class="exp-empty">${(EXP.data.batches || []).length === 0
    ? '📦 No batches yet. Batches are created automatically when stock is received.'
    : '🔍 No batches match the current filters.' + (expHasActiveFilters() ? ' <button class="btn ghost small" onclick="expResetFilters()">Clear filters</button>' : '')
    }</div>`;
}

function expRenderTable() {
  const wrap = document.getElementById('exp-table-wrap');
  if (!wrap) return;

  if (EXP.error && !EXP.data) {
    wrap.innerHTML = `<div class="exp-empty"><div style="font-size:30px;">⚠️</div><b>Could not load Expiration Tracking</b><div class="muted small" style="margin:6px 0 12px;">${escapeHtml(EXP.error)}</div><button class="btn small" onclick="expLoad(false)">↻ Retry</button></div>`;
    return;
  }
  if (!EXP.data) {
    wrap.innerHTML = `<div class="exp-empty"><div style="font-size:26px;">⏳</div>Loading batches…</div>`;
    return;
  }

  const filtered = expBaseList(false);
  const canEdit = expCanEdit();

  if (expGroupBy === 'none') {
    const list = expSortList(filtered);
    const pag = paginateArray(list, EXP_PAG_KEY, { onUpdate: expRenderTable, scrollTarget: '#exp-table-panel', recordLabel: 'batches' });
    const rows = pag.pagedItems.map(b => expRenderBatchRow(b, canEdit)).join('');
    wrap.innerHTML = `
      <div class="table-scroll">
        <table class="exp-table">
          ${expTableHeadHtml()}
          <tbody>${rows || `<tr><td colspan="12">${expEmptyStateHtml()}</td></tr>`}</tbody>
        </table>
      </div>
      ${pag.html}`;
    return;
  }

  const groups = expBuildGroups(filtered);
  if (!groups.length) {
    wrap.innerHTML = expEmptyStateHtml();
    return;
  }

  const groupLabel = expGroupBy === 'product' ? 'products' : (expGroupBy === 'supplier' ? 'suppliers' : 'receiving dates');
  const pag = paginateArray(groups, EXP_PAG_KEY, { onUpdate: expRenderTable, scrollTarget: '#exp-table-panel', recordLabel: groupLabel });

  const iconHtml = g => {
    if (expGroupBy === 'product') return `<span class="exp-dot" style="background:${escapeAttr(g.colorHex || '#CCC')};"></span>`;
    if (expGroupBy === 'supplier') return `<span class="exp-group-icon">🚚</span>`;
    return `<span class="exp-group-icon">📅</span>`;
  };

  const groupsHtml = pag.pagedItems.map(g => {
    const s = g.summary;
    const isCollapsed = expCollapsedGroups.has(g.key);
    const gKeyAttr = escapeAttr(g.key);
    const nearTitle = `${s.criticalCount} Critical, ${s.soonCount} Expiring Soon`;
    return `
      <section class="exp-group ${isCollapsed ? 'is-collapsed' : ''}" data-group-key="${gKeyAttr}">
        <button type="button" class="exp-group-head" aria-expanded="${isCollapsed ? 'false' : 'true'}" onclick="expToggleGroup('${gKeyAttr}')">
          <div class="exp-group-left">
            <span class="exp-group-chevron" aria-hidden="true">${isCollapsed ? '▸' : '▾'}</span>
            ${iconHtml(g)}
            <div class="exp-group-title-block">
              <div class="exp-group-title-row">
                <span class="exp-group-title">${escapeHtml(g.label)}</span>
                ${g.sub ? `<span class="exp-group-sub">${escapeHtml(g.sub)}</span>` : ''}
                <span class="exp-group-count">${s.totalBatches} ${s.totalBatches === 1 ? 'batch' : 'batches'}</span>
              </div>
            </div>
          </div>
          <div class="exp-group-summary">
            <span class="exp-gs-metric" title="Total quantity received across batches in this group">Received: <b>${s.totalReceived}</b></span>
            <span class="exp-gs-metric" title="Total remaining quantity across batches in this group">Remaining: <b>${s.totalRemaining}</b></span>
            <span class="exp-gs-pill good ${s.goodCount === 0 ? 'is-zero' : ''}" title="Good batches">✅ ${s.goodCount} Good</span>
            <span class="exp-gs-pill near ${s.nearExpiryCount === 0 ? 'is-zero' : ''}" title="Near-expiry batches (${nearTitle})">⏳ ${s.nearExpiryCount} Near-Expiry</span>
            <span class="exp-gs-pill expired ${s.expiredCount === 0 ? 'is-zero' : ''}" title="Expired batches">⛔ ${s.expiredCount} Expired</span>
          </div>
        </button>
        ${isCollapsed ? '' : `
          <div class="exp-group-body">
            <div class="table-scroll">
              <table class="exp-table">
                ${expTableHeadHtml()}
                <tbody>${g.items.map(b => expRenderBatchRow(b, canEdit)).join('')}</tbody>
              </table>
            </div>
          </div>
        `}
      </section>`;
  }).join('');

  wrap.innerHTML = `
    <div class="exp-group-toolbar">
      <div class="exp-group-toolbar-info">
        Showing <b>${groups.length}</b> ${groups.length === 1 ? groupLabel.replace(/s$/, '') : groupLabel} · <b>${filtered.length}</b> ${filtered.length === 1 ? 'batch' : 'batches'}
      </div>
      <div class="exp-group-toolbar-actions">
        <button type="button" class="btn secondary small" onclick="expSetAllGroupsCollapsed(false)">▾ Expand All</button>
        <button type="button" class="btn secondary small" onclick="expSetAllGroupsCollapsed(true)">▸ Collapse All</button>
      </div>
    </div>
    <div class="exp-groups-wrap">
      ${groupsHtml}
    </div>
    ${pag.html}`;
}

/* ------------------------------------------------------------
   BATCH DETAILS
   ------------------------------------------------------------ */
async function expOpenDetail(batchId, tab) {
  EXP.detailTab = tab || 'movements';
  openModal('Batch Details', `<div class="exp-empty"><div style="font-size:26px;">⏳</div>Loading batch…</div>`, `<button class="btn secondary" onclick="closeModal()">Close</button>`, 'wide');
  try {
    const json = await expApi('detail', { query: '&batch_id=' + encodeURIComponent(batchId) });
    EXP.detail = json;
    expRenderDetail();
  } catch (e) {
    openModal('Batch Details', `<div class="exp-empty"><div style="font-size:26px;">⚠️</div><b>${escapeHtml(e.message)}</b></div>`, `<button class="btn secondary" onclick="closeModal()">Close</button>`, 'wide');
  }
}

function expDetailTab(name) {
  EXP.detailTab = name;
  document.querySelectorAll('.exp-dtab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.exp-dpane').forEach(p => p.style.display = (p.dataset.tab === name) ? 'block' : 'none');
}

function expMovementTypeLabel(t) {
  return ({ sale: '🛒 POS Sale', receiving: '📥 Receiving', adjustment: '🛠 Adjustment', return: '↩️ Return', colormix: '🎨 Color Mix' })[t] || t;
}

function expLedgerTypeLabel(t) {
  return ({
    received: '📥 Received', opening: '📦 Opening balance', fifo_deduction: '➖ FIFO deduction', restore: '↩️ Restored (return / void)',
    adjustment: '🛠 Adjustment', reconciliation: '⚖️ Reconciliation', edit: '✏️ Batch info edited'
  })[t] || t;
}

function expRenderDetail() {
  const d = EXP.detail;
  if (!d) return;
  const b = d.batch, p = d.product || {};
  const status = b.depleted ? 'depleted' : b.expiryStatus;
  const deducted = b.originalQty - b.remainingQty;
  const pct = b.originalQty > 0 ? Math.round(b.remainingQty / b.originalQty * 100) : 0;
  const inSync = d.inventory.sealedQuantity === d.inventory.batchedQuantity;
  const canEdit = !!(d.permissions && d.permissions.canEdit);
  const kv = (k, v) => `<div class="exp-kv"><span>${k}</span><b>${v}</b></div>`;

  const banner = `
    <div class="exp-detail-banner ${status}">
      <div class="exp-detail-banner-main">${expBadge(status)} <span class="exp-detail-banner-text">${b.depleted ? 'This batch has been fully consumed.' :
      (b.expiryStatus === 'expired' ? `Expired ${Math.abs(b.daysRemaining)} day(s) ago — remove from sale.` :
        (b.expiryStatus === 'none' ? 'No expiration date recorded for this batch.' :
          (b.daysRemaining === 0 ? 'Expires today.' : `Expires in ${b.daysRemaining} day(s).`)))}</span></div>
      <div class="exp-detail-banner-qty"><b>${b.remainingQty}</b> of ${b.originalQty} unit(s) left</div>
    </div>`;

  const movRows = (d.stockMovements || []).map(m => `
    <tr><td>${expFmtDateTime(m.date)}</td><td>${expMovementTypeLabel(m.type)}</td>
    <td class="right ${m.qtyChange < 0 ? 'neg' : 'pos'}">${m.qtyChange > 0 ? '+' : ''}${formatStock(m.qtyChange)} L</td>
    <td>${escapeHtml(m.staff || '—')}</td><td class="exp-note">${escapeHtml(m.note || '')}</td></tr>`).join('');

  const fifoRows = (d.fifoDeductions || []).map(l => `
    <tr><td>${expFmtDateTime(l.date)}</td><td>${l.reference ? `<code class="exp-code">${escapeHtml(l.reference)}</code>` : '—'}</td>
    <td>${expMovementTypeLabel(l.movementType || '')}</td>
    <td class="right neg">${l.qtyChange}</td><td class="right">${l.balanceAfter}</td>
    <td>${escapeHtml(l.staff || '—')}</td><td class="exp-note">${escapeHtml(l.note || '')}</td></tr>`).join('');

  const ledgerRows = (d.ledger || []).map(l => `
    <tr><td>${expFmtDateTime(l.date)}</td><td>${expLedgerTypeLabel(l.type)}</td>
    <td class="right ${l.qtyChange < 0 ? 'neg' : (l.qtyChange > 0 ? 'pos' : '')}">${l.qtyChange > 0 ? '+' : ''}${l.qtyChange}</td>
    <td class="right">${l.balanceAfter}</td><td>${escapeHtml(l.staff || '—')}</td><td class="exp-note">${escapeHtml(l.note || '')}</td></tr>`).join('');

  const tabBtn = (k, label) => `<button type="button" class="exp-dtab ${EXP.detailTab === k ? 'active' : ''}" data-tab="${k}" onclick="expDetailTab('${k}')">${label}</button>`;
  const pane = (k, html) => `<div class="exp-dpane" data-tab="${k}" style="display:${EXP.detailTab === k ? 'block' : 'none'};">${html}</div>`;
  const empty = msg => `<div class="exp-empty small">${msg}</div>`;

  const body = `
    ${banner}
    <div class="exp-detail-grid">
      <div class="exp-detail-card">
        <h4>Product Information</h4>
        ${kv('Product', `<span class="exp-dot" style="background:${escapeAttr(p.colorHex || b.colorHex || '#CCC')};"></span> ${escapeHtml(p.name || b.productName)}`)}
        ${kv('Product ID', escapeHtml(p.productId || b.productId))}
        ${kv('Brand', escapeHtml(p.brand || b.brand || '—'))}
        ${kv('Category / Type', escapeHtml(p.category || b.category || '—') + (p.type && p.type !== p.category ? ' · ' + escapeHtml(p.type) : ''))}
        ${kv('Color', escapeHtml(p.color || b.color || '—'))}
        ${kv('Container Size', `${fmtSize(b.containerSize)} <span class="muted">(${escapeHtml(b.sizeId)})</span>`)}
        ${kv('Selling Price', p.pricePerCan !== undefined ? `${peso(p.pricePerCan)} / can · ${peso(p.pricePerLiter)} / L` : '—')}
        ${kv('Product Status', escapeHtml(p.status || '—'))}
      </div>
      <div class="exp-detail-card">
        <h4>Batch Information</h4>
        ${kv('Batch ID', escapeHtml(b.batchId))}
        ${kv('Batch Number', `<code class="exp-code">${escapeHtml(b.batchNumber)}</code>`)}
        ${kv('Supplier', escapeHtml(b.supplierName || '—'))}
        ${kv('Purchase Order', b.poNumber ? escapeHtml(b.poNumber) : '—')}
        ${kv('Unit Cost', expCostText(b.unitCost))}
        ${kv('Source', escapeHtml(({ receiving: 'Supplier delivery', opening: 'Opening balance', adjustment: 'Stock adjustment', return: 'Customer return', reconciliation: 'Auto reconciliation' })[b.source] || b.source))}
        ${kv('Created by', escapeHtml(b.createdBy || '—'))}
        ${kv('Last updated', b.updatedAt ? expFmtDateTime(b.updatedAt) + (b.updatedBy ? ' · ' + escapeHtml(b.updatedBy) : '') : '—')}
      </div>
      <div class="exp-detail-card">
        <h4>Quantity &amp; Dates</h4>
        ${kv('Original received quantity', `${b.originalQty} unit(s)`)}
        ${kv('Current remaining quantity', `<span style="color:var(--teal-dark);">${b.remainingQty} unit(s)</span>`)}
        ${kv('Deducted / consumed', `${deducted} unit(s) (FIFO: ${d.fifoTotal})`)}
        <div class="exp-qty-bar big"><span style="width:${pct}%;"></span></div>
        ${kv('Date received', expFmtDateTime(b.dateReceived))}
        ${kv('Expiration date', b.expirationDate ? expFmtDate(b.expirationDate) : 'Not specified')}
        ${kv('Days remaining', b.depleted ? '—' : expDaysText(b))}
        ${kv('Expiration status', expBadge(status))}
        ${kv('Central inventory (this size)', `${d.inventory.sealedQuantity} unit(s) in ${d.inventory.openBatches} batch(es) ${inSync ? '<span class="exp-sync ok">✓ in sync</span>' : '<span class="exp-sync warn">⚠ syncing</span>'}`)}
      </div>
    </div>
    ${b.notes ? `<div class="exp-note-box">📝 ${escapeHtml(b.notes)}</div>` : ''}

    <div class="exp-dtabs">
      ${tabBtn('movements', `📜 Stock Movement History (${(d.stockMovements || []).length})`)}
      ${tabBtn('fifo', `➖ FIFO Deduction History (${(d.fifoDeductions || []).length})`)}
      ${tabBtn('ledger', `🧾 Batch Ledger (${(d.ledger || []).length})`)}
    </div>
    ${pane('movements', (d.stockMovements || []).length
    ? `<div class="table-scroll exp-hist"><table class="exp-table small"><thead><tr><th>Date</th><th>Type</th><th class="right">Qty (liters)</th><th>Staff</th><th>Details</th></tr></thead><tbody>${movRows}</tbody></table></div><div class="muted small" style="margin-top:6px;">Central stock-movement log for this container size since this batch was received (all batches of ${fmtSize(b.containerSize)}).</div>`
    : empty('No stock movements recorded for this container size since the batch was received.'))}
    ${pane('fifo', (d.fifoDeductions || []).length
      ? `<div class="table-scroll exp-hist"><table class="exp-table small"><thead><tr><th>Date</th><th>Reference</th><th>Source</th><th class="right">Units deducted</th><th class="right">Batch balance</th><th>Staff</th><th>Details</th></tr></thead><tbody>${fifoRows}</tbody></table></div><div class="muted small" style="margin-top:6px;">Units taken from this batch by POS sales and other deductions, oldest batch first.</div>`
      : empty('No FIFO deductions have drawn from this batch yet.'))}
    ${pane('ledger', (d.ledger || []).length
        ? `<div class="table-scroll exp-hist"><table class="exp-table small"><thead><tr><th>Date</th><th>Event</th><th class="right">Change</th><th class="right">Balance</th><th>Staff</th><th>Details</th></tr></thead><tbody>${ledgerRows}</tbody></table></div>`
        : empty('No ledger entries.'))}`;

  const canAdjust = !!(d.permissions && d.permissions.canAdjust !== undefined ? d.permissions.canAdjust : expCanAdjust());
  const foot = `
    <button class="btn secondary" onclick="closeModal()">Close</button>
    ${canEdit ? `<button class="btn secondary" onclick="expOpenEdit('${escapeAttr(b.batchId)}')">✏️ Edit Expiration Date</button>` : ''}
    ${canAdjust ? `<button class="btn" onclick="expOpenAdjust('${escapeAttr(b.batchId)}')">± Record Adjustment</button>` : ''}`;
  openModal(`🗓️ Batch ${escapeHtml(b.batchNumber)} — ${escapeHtml(p.name || b.productName)} (${fmtSize(b.containerSize)})`, body, foot, 'wide');
}

/* ------------------------------------------------------------
   EDIT EXPIRATION DATE (admin & staff: expiration date only)
   ------------------------------------------------------------ */
let _expSavingEdit = false;

function expFindBatch(batchId) {
  return ((EXP.data && EXP.data.batches) || []).find(x => x.batchId === batchId) || (EXP.detail && EXP.detail.batch && EXP.detail.batch.batchId === batchId ? EXP.detail.batch : null);
}

function expClearExpirationInput() {
  const inp = document.getElementById('exp-e-exp');
  if (!inp) return;
  inp.value = '';
  const fe = document.getElementById('exp-e-err-exp');
  if (fe) fe.textContent = '';
  expEditPreviewExp();
}

function expEditPreviewExp() {
  const inp = document.getElementById('exp-e-exp');
  const slot = document.getElementById('exp-e-exp-preview');
  if (!inp || !slot) return;
  const val = (inp.value || '').trim();
  if (!val) {
    slot.innerHTML = expBadge('none') + ' <span class="muted small">Not Specified (no expiration tracking)</span>';
    return;
  }
  const d = expParseDate(val);
  if (!d) { slot.innerHTML = ''; return; }
  const t = (EXP.data && EXP.data.thresholds) || { critical: 30, soon: 90 };
  const today = expParseDate(todayISO());
  const days = today ? Math.round((d.getTime() - today.getTime()) / 86400000) : 0;
  let st = 'good';
  if (days < 0) st = 'expired';
  else if (days <= t.critical) st = 'critical';
  else if (days <= t.soon) st = 'soon';
  const txt = days < 0 ? `${Math.abs(days)}d overdue` : (days === 0 ? 'Expires today' : `${days}d remaining`);
  slot.innerHTML = `${expBadge(st)} <span class="muted small">${txt}</span>`;
}

function expOpenEdit(batchId) {
  if (!expCanEdit()) { showToast('You do not have permission to edit expiration dates.', 'error'); return; }
  const b = expFindBatch(batchId);
  if (!b) { showToast('Batch not found.', 'error'); return; }
  _expSavingEdit = false;
  const origRecv = String(b.dateReceived || '').slice(0, 10);
  const origExp = b.expirationDate ? String(b.expirationDate).slice(0, 10) : '';
  const origNotes = b.notes || '';

  const body = `
    <div class="exp-form-note">
      Update the <b>Expiration Date</b> for this batch. Clear the date to mark it as <b>Not Specified</b>. All other batch and inventory details are read-only for reference. Every change is logged in the Audit Log.
    </div>

    <div class="exp-edit-section">
      <div class="exp-edit-sec-title">1. Batch Reference Information</div>
      <div class="exp-form-grid">
        <div class="field">
          <label>Product &amp; Container Size <span class="exp-ro-tag">READ-ONLY</span></label>
          <input type="text" class="exp-readonly" value="${escapeAttr(b.productName + ' (' + (b.containerSize !== null ? fmtSize(b.containerSize) : '—') + ')')}" readonly tabindex="-1">
        </div>
        <div class="field">
          <label>Batch Number <span class="exp-ro-tag">READ-ONLY</span></label>
          <input type="text" class="exp-readonly" value="${escapeAttr(b.batchNumber)}" readonly tabindex="-1">
        </div>
        <div class="field">
          <label>Original Quantity Received <span class="exp-ro-tag">READ-ONLY</span></label>
          <input type="text" class="exp-readonly" value="${b.originalQty} unit(s)" readonly tabindex="-1">
        </div>
        <div class="field">
          <label>Current Remaining Quantity <span class="exp-ro-tag">READ-ONLY</span></label>
          <input type="text" class="exp-readonly" value="${b.remainingQty} unit(s)" readonly tabindex="-1">
        </div>
        <div class="field">
          <label>Supplier <span class="exp-ro-tag">READ-ONLY</span></label>
          <input type="text" class="exp-readonly" value="${escapeAttr(b.supplierName || '—')}" readonly tabindex="-1">
        </div>
        <div class="field">
          <label>Unit Cost <span class="exp-ro-tag">READ-ONLY</span></label>
          <input type="text" class="exp-readonly" value="${escapeAttr(expCostText(b.unitCost))}" readonly tabindex="-1">
        </div>
        <div class="field">
          <label>Date Received <span class="exp-ro-tag">READ-ONLY</span></label>
          <input type="text" class="exp-readonly" value="${escapeAttr(expFmtDate(b.dateReceived))}" readonly tabindex="-1">
        </div>
      </div>
      <div class="field" style="margin-top:10px;">
        <label>Restocking / Batch Notes <span class="exp-ro-tag">READ-ONLY</span></label>
        <textarea class="exp-readonly" rows="2" readonly tabindex="-1">${escapeHtml(origNotes || '—')}</textarea>
      </div>
    </div>

    <div class="exp-edit-section">
      <div class="exp-edit-sec-title">2. Expiration Date &amp; Audit Reason</div>
      <div class="field">
        <label for="exp-e-exp">Expiration Date <span class="muted">(empty = Not Specified)</span></label>
        <div class="exp-input-with-btn">
          <input type="date" id="exp-e-exp" value="${escapeAttr(origExp)}" ${origRecv ? `min="${escapeAttr(origRecv)}"` : ''} oninput="expEditPreviewExp()" onchange="expEditPreviewExp()">
          <button type="button" class="btn secondary small" onclick="expClearExpirationInput()" title="Clear expiration date and mark as Not Specified">✕ Clear</button>
        </div>
        <div id="exp-e-exp-preview" class="exp-exp-preview"></div>
        <div id="exp-e-err-exp" class="exp-field-err"></div>
      </div>
      <div class="field" style="margin-top:8px;">
        <label for="exp-e-reason">Reason for Change * <span class="muted">(required for Audit Log)</span></label>
        <textarea id="exp-e-reason" rows="2" maxlength="300" placeholder="e.g. Corrected expiration date from supplier delivery receipt"></textarea>
        <div id="exp-e-err-reason" class="exp-field-err"></div>
      </div>
    </div>

    <div id="exp-e-err" class="exp-form-err"></div>`;

  openModal(`✏️ Edit Expiration Date — ${escapeHtml(b.productName)} (${fmtSize(b.containerSize)})`, body,
    `<button class="btn secondary" onclick="closeModal()">Cancel</button><button class="btn" id="exp-e-save" onclick="expSaveEdit('${escapeAttr(batchId)}')">Save Changes</button>`, 'wide');
  expEditPreviewExp();
}

async function expSaveEdit(batchId) {
  if (_expSavingEdit) return;
  const err = document.getElementById('exp-e-err');
  const setFieldErr = (id, msg) => {
    const el = document.getElementById('exp-e-err-' + id);
    if (el) el.textContent = msg || '';
  };
  ['exp', 'reason'].forEach(k => setFieldErr(k, ''));
  if (err) err.textContent = '';

  const val = id => {
    const el = document.getElementById(id);
    return el ? el.value : '';
  };
  const b = expFindBatch(batchId);
  const origRecv = b ? String(b.dateReceived || '').slice(0, 10) : '';
  const exp = val('exp-e-exp').trim();
  const reason = val('exp-e-reason').trim();

  let hasErr = false;
  const fail = (field, msg) => {
    if (field) setFieldErr(field, msg);
    if (err && !err.textContent) err.textContent = msg;
    hasErr = true;
  };

  if (exp && origRecv && exp < origRecv) fail('exp', 'Expiration date cannot be earlier than the date received.');
  if (!reason || reason.length < 5) fail('reason', 'Please enter a reason for change (at least 5 characters).');
  if (hasErr) return;

  _expSavingEdit = true;
  const btn = document.getElementById('exp-e-save');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  const payload = { batchId, expirationDate: exp, reason };

  try {
    const res = await expApi('update_batch', { body: payload });
    closeModal();
    showToast(res.unchanged ? 'No changes to save.' : '✓ Expiration date updated.', res.unchanged ? 'info' : 'ok');
    EXP.summaryTs = 0;
    await expLoad(true);
    expRefreshSummary(true);
    if (typeof updateNavBadges === 'function') updateNavBadges();
  } catch (e) {
    if (err) err.textContent = e.message || 'Could not update expiration date.';
    if (btn) { btn.disabled = false; btn.textContent = 'Save Changes'; }
  } finally {
    _expSavingEdit = false;
  }
}

/* ------------------------------------------------------------
   RECORD STOCK ADJUSTMENT (admin) — goes through the normal inventory
   + movement pipeline so central stock, movement log, audit log and
   the batch ledger all stay in sync.
   ------------------------------------------------------------ */
function expOpenAdjust(batchId) {
  if (!expCanAdjust()) {
    showToast('Stock adjustments require Administrator authorization. Staff can submit an adjustment request under Stock Receiving / Adjust.', 'error');
    return;
  }
  const b = expFindBatch(batchId);
  if (!b) { showToast('Batch not found.', 'error'); return; }
  const defType = b.expiryStatus === 'expired' && !b.depleted ? 'remove_expired' : 'remove_damaged';
  const body = `
    <div class="exp-form-note">Adjusts the <b>central sealed inventory</b> for ${escapeHtml(b.productName)} (${fmtSize(b.containerSize)}) and the selected batch together. Recorded in the stock movement log and audit log.</div>
    <div class="exp-adj-summary">
      <div><span>Batch</span><b><code class="exp-code">${escapeHtml(b.batchNumber)}</code></b></div>
      <div><span>Remaining in batch</span><b>${b.remainingQty} unit(s)</b></div>
      <div><span>Expiry</span><b>${b.expirationDate ? expFmtDate(b.expirationDate) : 'Not specified'}</b></div>
      <div><span>Status</span><b>${expBadge(b.depleted ? 'depleted' : b.expiryStatus)}</b></div>
    </div>
    <div class="exp-form-grid">
      <div class="field"><label>Adjustment type *</label>
        <select id="exp-a-type" onchange="expAdjPreview('${escapeAttr(batchId)}')">
          ${Object.entries(EXP_ADJ_TYPES).map(([k, t]) => `<option value="${k}" ${k === defType ? 'selected' : ''}>${t.label}</option>`).join('')}
        </select></div>
      <div class="field"><label>Quantity (units / cans) *</label><input type="number" id="exp-a-qty" min="1" step="1" value="1" oninput="expAdjPreview('${escapeAttr(batchId)}')"></div>
    </div>
    <div class="field"><label>Reason / notes *</label><textarea id="exp-a-note" rows="2" placeholder="Explain why this adjustment is needed (min. 5 characters)"></textarea></div>
    <div id="exp-a-preview" class="exp-adj-preview"></div>
    <label class="exp-check" style="margin-top:8px;"><input type="checkbox" id="exp-a-auth"> I am an authorized Administrator and approve this stock adjustment.</label>
    <div id="exp-a-err" class="exp-form-err"></div>`;
  openModal(`± Record Stock Adjustment`, body,
    `<button class="btn secondary" onclick="closeModal()">Cancel</button><button class="btn" id="exp-a-save" onclick="expSaveAdjust('${escapeAttr(batchId)}')">Record Adjustment</button>`, '');
  expAdjPreview(batchId);
}

function expAdjPreview(batchId) {
  const b = expFindBatch(batchId);
  const el = document.getElementById('exp-a-preview');
  if (!b || !el) return;
  const t = EXP_ADJ_TYPES[document.getElementById('exp-a-type').value];
  const qty = Math.floor(Number(document.getElementById('exp-a-qty').value) || 0);
  const p = productById(b.productId);
  const curTotal = p ? productCanCount(p, b.containerSize) : 0;
  const delta = t.sign * qty;
  const newBatch = b.remainingQty + delta;
  const newTotal = curTotal + delta;
  const bad = qty < 1 || (t.sign < 0 && (qty > b.remainingQty || qty > curTotal));
  el.className = 'exp-adj-preview ' + (bad ? 'bad' : (t.sign < 0 ? 'neg' : 'pos'));
  el.innerHTML = bad
    ? (qty < 1 ? 'Enter a quantity of at least 1.' : `Cannot remove ${qty} unit(s): only ${Math.min(b.remainingQty, curTotal)} available in this batch.`)
    : `Batch: <b>${b.remainingQty} → ${newBatch}</b> unit(s) &nbsp;·&nbsp; Inventory (${fmtSize(b.containerSize)} sealed): <b>${curTotal} → ${newTotal}</b> unit(s) &nbsp;·&nbsp; ${t.sign < 0 ? '−' : '+'}${formatStock(qty * b.containerSize)} L`;
}

async function expSaveAdjust(batchId) {
  const err = document.getElementById('exp-a-err');
  const fail = m => { if (err) err.textContent = m; };
  const b = expFindBatch(batchId);
  if (!b) return fail('Batch not found.');
  if (!expIsAdmin()) return fail('Administrator authorization required.');
  const typeKey = document.getElementById('exp-a-type').value;
  const t = EXP_ADJ_TYPES[typeKey];
  const qty = Math.floor(Number(document.getElementById('exp-a-qty').value) || 0);
  const note = (document.getElementById('exp-a-note').value || '').trim();
  if (qty < 1) return fail('Enter a quantity of at least 1.');
  if (note.length < 5) return fail('A reason is required (at least 5 characters).');
  if (!document.getElementById('exp-a-auth').checked) return fail('Please confirm administrator authorization.');

  const p = productById(b.productId);
  if (!p) return fail('The product for this batch no longer exists.');
  const size = normalizeCanSize(b.containerSize);
  const beforeCans = productCanCount(p, size);
  if (t.sign < 0 && (qty > b.remainingQty || qty > beforeCans)) return fail(`Only ${Math.min(b.remainingQty, beforeCans)} unit(s) available to remove.`);

  const btn = document.getElementById('exp-a-save');
  if (btn) { btn.disabled = true; btn.textContent = 'Recording…'; }

  // Snapshot for rollback if saveDB() fails
  const prevCanStock = p.canStock ? JSON.parse(JSON.stringify(p.canStock)) : {};
  const prevStock = p.stock;
  const prevMovLen = Array.isArray(db.movements) ? db.movements.length : 0;

  // --- same central-inventory mutation used by Stock Receiving / Adjust (sealed stock) ---
  const isAdd = t.sign > 0;
  const liters = Number((qty * size).toFixed(2));
  const beforeStock = productHasCanBreakdown(p) ? canBreakdownLiters(p) : (Number(p.stock) || 0);
  const afterCans = isAdd ? beforeCans + qty : Math.max(0, beforeCans - qty);
  if (!p.canStock || Array.isArray(p.canStock) || typeof p.canStock !== 'object') p.canStock = {};
  p.canStock[size] = afterCans;
  p.canStock[String(size)] = afterCans;
  const variant = productSizeVariantBySize(p, size);
  if (variant) variant.sealedQuantity = afterCans;
  syncProductVariants(p);
  normalizeProductOpenedStock(p);
  p.stock = productHasCanBreakdown(p) ? canBreakdownLiters(p) : Math.max(0, Number((beforeStock + (isAdd ? liters : -liters)).toFixed(2)));
  syncProductVariants(p);

  const staff = (currentUser && currentUser.name) || 'Admin';
  const sizeId = b.sizeId || (variant ? variant.sizeId : null);
  db.movements.push({
    id: uid('mv'),
    date: nowISO(),
    type: 'adjustment',
    productId: p.productId || p.id,
    product_id: p.productId || p.id,
    sizeId, size_id: sizeId,
    container_size: size,
    productName: p.name,
    qtyChange: isAdd ? liters : -liters,
    batch: { batchId: b.batchId, batchNumber: b.batchNumber },
    note: `${t.reason} [${isAdd ? 'Added' : 'Deducted'} ${qty} × ${size}L (${isAdd ? '+' : '-'}${formatStock(liters)}L) · ${size}L Units: ${beforeCans}→${afterCans}, Stock: ${formatStock(beforeStock)}L→${formatStock(p.stock)}L] — Batch ${b.batchNumber} — ${note}`,
    staffName: staff
  });
  try {
    const savedOk = await saveDB();
    if (!savedOk) throw new Error('Database save failed');
    if (typeof logAudit === 'function') {
      logAudit(isAdd ? 'STOCK_INCREASE' : 'STOCK_DECREASE', 'Inventory',
        `${isAdd ? 'Increased' : 'Decreased'} stock for ${p.name} via Expiration Tracking (Batch ${b.batchNumber}: ${qty} × ${size}L = ${isAdd ? '+' : '-'}${formatStock(liters)}L) — Reason: ${t.reason}`, {
        productId: p.productId || p.id,
        entityName: p.name,
        fieldChanged: `Sealed Stock (${size}L Container) · Batch ${b.batchNumber}`,
        oldValue: `${beforeCans} units (${formatStock(beforeStock)} L total)`,
        newValue: `${afterCans} units (${formatStock(p.stock)} L total)`,
        referenceNo: b.batchNumber,
        reason: `${t.reason} — ${note}`
      });
    }
    closeModal();
    showToast(`✓ Adjustment recorded for batch ${b.batchNumber}.`, 'ok');
    EXP.summaryTs = 0;
    await expLoad(true);
    if (typeof updateNavBadges === 'function') updateNavBadges();
  } catch (e) {
    // Rollback in-memory mutations on save failure
    p.canStock = prevCanStock;
    p.stock = prevStock;
    if (variant) variant.sealedQuantity = beforeCans;
    syncProductVariants(p);
    if (Array.isArray(db.movements) && db.movements.length > prevMovLen) {
      db.movements.length = prevMovLen;
    }
    showToast('Adjustment could not be saved.', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Confirm Adjustment'; }
  }
}

/* ------------------------------------------------------------
   THRESHOLDS (admin)
   ------------------------------------------------------------ */
function expOpenThresholds() {
  if (!expIsAdmin()) return;
  const t = (EXP.data && EXP.data.thresholds) || { critical: 30, soon: 90 };
  openModal('⚙ Expiration Thresholds', `
    <div class="exp-form-note">Controls how remaining shelf-life maps to status. Status is recalculated from the expiration date every time you open the module.</div>
    <div class="exp-form-grid">
      <div class="field"><label>Critical when ≤ (days)</label><input type="number" id="exp-t-crit" min="1" max="365" step="1" value="${t.critical}"></div>
      <div class="field"><label>Expiring Soon when ≤ (days)</label><input type="number" id="exp-t-soon" min="2" max="730" step="1" value="${t.soon}"></div>
    </div>
    <div class="muted small">Good = more than the Expiring Soon limit · Expired = past the expiration date · Not Specified = no date on the batch.</div>
    <div id="exp-t-err" class="exp-form-err"></div>`,
    `<button class="btn secondary" onclick="closeModal()">Cancel</button><button class="btn" onclick="expSaveThresholds()">Save Thresholds</button>`, '');
}

async function expSaveThresholds() {
  const crit = Math.floor(Number(document.getElementById('exp-t-crit').value));
  const soon = Math.floor(Number(document.getElementById('exp-t-soon').value));
  const err = document.getElementById('exp-t-err');
  if (!(crit >= 1 && soon > crit)) { err.textContent = 'Expiring Soon must be greater than Critical (and Critical at least 1 day).'; return; }
  try {
    await expApi('save_thresholds', { body: { critical: crit, soon } });
    closeModal();
    showToast('✓ Thresholds updated.', 'ok');
    EXP.summaryTs = 0;
    await expLoad(true);
  } catch (e) { err.textContent = e.message; }
}

function expOpenDiscounts() {
  if (!expIsAdmin()) return;
  const d = (EXP.data && EXP.data.discountSettings) || { enabled: false, criticalPct: 0, soonPct: 0 };
  openModal('🏷️ Near-Expiry Discount Management', `
    <div class="exp-form-note">Configure automatic POS discounts for eligible near-expiry batches (FIFO). Discounts never apply to Good, Not Specified, or Expired stock. Expired stock is strictly blocked from sale.</div>
    <div class="field" style="margin-bottom:10px;">
      <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
        <input type="checkbox" id="exp-d-enabled" ${d.enabled ? 'checked' : ''} style="width:auto;">
        <span><b>Enable automatic near-expiry discounts in POS</b></span>
      </label>
    </div>
    <div class="exp-form-grid">
      <div class="field"><label>Critical Batch Discount (%)</label><input type="number" id="exp-d-crit" min="0" max="90" step="0.5" value="${Number(d.criticalPct || 0)}"></div>
      <div class="field"><label>Expiring Soon Batch Discount (%)</label><input type="number" id="exp-d-soon" min="0" max="90" step="0.5" value="${Number(d.soonPct || 0)}"></div>
    </div>
    <div id="exp-d-err" class="exp-form-err"></div>`,
    `<button class="btn secondary" onclick="closeModal()">Cancel</button><button class="btn" onclick="expSaveDiscounts()">Save Discount Policy</button>`, '');
}

async function expSaveDiscounts() {
  const enabled = !!(document.getElementById('exp-d-enabled') || {}).checked;
  const criticalPct = Number((document.getElementById('exp-d-crit') || {}).value);
  const soonPct = Number((document.getElementById('exp-d-soon') || {}).value);
  const err = document.getElementById('exp-d-err');
  if (isNaN(criticalPct) || criticalPct < 0 || criticalPct > 90 || isNaN(soonPct) || soonPct < 0 || soonPct > 90) {
    if (err) err.textContent = 'Discount percentages must be between 0% and 90%.';
    return;
  }
  const t = (EXP.data && EXP.data.thresholds) || { critical: 30, soon: 90 };
  const tiers = [
    { days: Number(t.soon || 90), pct: soonPct },
    { days: Number(t.critical || 30), pct: criticalPct }
  ];
  try {
    await expApi('save_discount_settings', { body: { enabled, criticalPct, soonPct, tiers } });
    if (typeof posBatchStatusLoadedAt !== 'undefined') posBatchStatusLoadedAt = 0;
    closeModal();
    showToast('✓ Near-expiry discount policy saved.', 'ok');
    await expLoad(true);
  } catch (e) { if (err) err.textContent = e.message; }
}

/* ------------------------------------------------------------
   EXPORT (CSV of the currently filtered / sorted view)
   ------------------------------------------------------------ */
function expCsvCell(v) {
  const s = (v === null || v === undefined) ? '' : String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function expExportReport() {
  if (!EXP.data) { showToast('Data is still loading — try again in a moment.', 'error'); return; }
  const list = expSortList(expBaseList(false));
  if (!list.length) { showToast('No batches to export for the current filters.', 'error'); return; }
  const head = ['Product Name', 'Brand', 'Category', 'Container Size (L)', 'Batch Number', 'Supplier', 'Date Received', 'Expiration Date',
    'Days Remaining', 'Original Qty', 'Remaining Qty', 'Unit Cost', 'Remaining Value', 'Expiration Status'];
  const lines = [head.map(expCsvCell).join(',')];
  list.forEach(b => {
    lines.push([
      b.productName, b.brand, b.category, b.containerSize, b.batchNumber, b.supplierName,
      String(b.dateReceived).slice(0, 10), b.expirationDate ? String(b.expirationDate).slice(0, 10) : 'Not specified',
      b.daysRemaining === null ? '' : b.daysRemaining, b.originalQty, b.remainingQty,
      b.unitCost === null ? '' : b.unitCost.toFixed(2), b.unitCost === null ? '' : (b.unitCost * b.remainingQty).toFixed(2),
      b.depleted ? 'Depleted' : (EXP_STATUS_META[b.expiryStatus] || EXP_STATUS_META.none).label
    ].map(expCsvCell).join(','));
  });
  const meta = [`MRGR Color Center — Expiration Report`, `Generated: ${new Date().toLocaleString('en-PH')}`,
    `Filter: ${expStatusFilter === 'all' ? 'All batches' : (EXP_STATUS_META[expStatusFilter] || { label: expStatusFilter }).label}${expSearchQuery ? ' · search "' + expSearchQuery + '"' : ''}${expCategoryFilter !== 'all' ? ' · ' + expCategoryFilter : ''}${expSupplierFilter !== 'all' ? ' · ' + expSupplierFilter : ''}`,
    `Thresholds: Critical ≤ ${EXP.data.thresholds.critical} days, Expiring Soon ≤ ${EXP.data.thresholds.soon} days`, ''];
  const csv = '\uFEFF' + meta.map(expCsvCell).join('\r\n') + '\r\n' + lines.join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `MRGR_Expiration_Report_${todayISO()}.csv`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
  showToast(`✓ Expiration report exported (${list.length} batch${list.length === 1 ? '' : 'es'}).`, 'ok');
  expApi('log_export', { body: { rows: list.length, filter: expStatusFilter + (expSearchQuery ? ' q=' + expSearchQuery : '') } }).catch(() => { });
}

/* ------------------------------------------------------------
   DASHBOARD WIDGET (used by admin & staff dashboards)
   ------------------------------------------------------------ */
function expDashboardWidgetInner() {
  const s = EXP.summary;
  if (!s) return `<div class="muted small" style="padding:6px 0;">Loading expiration data…</div>`;
  const t = s.thresholds || { critical: 30, soon: 90 };
  const pill = (k, label, cls) => `<button type="button" class="exp-mini ${cls}" onclick="goToExpiration('${k}')"><b>${s[k] || 0}</b><span>${label}</span></button>`;
  const att = (s.attention || []).map(b => `
    <div class="exp-att-row" onclick="goToExpiration('${b.expiryStatus}')">
      ${expBadge(b.expiryStatus)}
      <span class="exp-att-name">${escapeHtml(b.productName)} <span class="muted">${b.containerSize !== null ? fmtSize(b.containerSize) : ''} · ${escapeHtml(b.batchNumber)}</span></span>
      <span class="exp-att-days">${expDaysText(b)}</span>
    </div>`).join('');
  return `
    <div class="exp-mini-row">
      ${pill('good', 'Good', 'good')}${pill('soon', 'Expiring Soon', 'soon')}${pill('critical', 'Critical', 'critical')}${pill('expired', 'Expired', 'expired')}${pill('none', 'Not Specified', 'none')}
    </div>
    ${att ? `<div class="exp-att">${att}</div>` : `<div class="muted small" style="padding-top:6px;">${(s.expired || 0) + (s.critical || 0) + (s.soon || 0) === 0 ? '✓ No batches need attention.' : ''}</div>`}
    <div class="muted small" style="margin-top:6px;">${s.total || 0} batch(es) on hand · Critical ≤ ${t.critical}d · Soon ≤ ${t.soon}d</div>`;
}

function expDashboardWidget() {
  expRefreshSummary();
  return `
  <div class="panel exp-dash-panel">
    <div class="panel-head">
      <h3>🗓️ Expiration Tracking</h3>
      <div class="spacer"></div>
      <button type="button" class="btn secondary small" onclick="goToExpiration('all')">Open module →</button>
    </div>
    <div class="panel-body" id="exp-dash-widget">${expDashboardWidgetInner()}</div>
  </div>`;
}

/* ------------------------------------------------------------
   REPORTS INTEGRATION — compact expiration report block
   ------------------------------------------------------------ */
async function expReportSectionLoad(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  try {
    const json = await expApi('list');
    EXP.data = json;
    EXP.loaded = true;
    const open = json.batches.filter(b => !b.depleted && ['expired', 'critical', 'soon'].includes(b.expiryStatus))
      .sort((a, b) => a.daysRemaining - b.daysRemaining);
    const s = json.summary;
    el.innerHTML = `
      <div class="exp-mini-row" style="margin-bottom:10px;">
        <div class="exp-mini good"><b>${s.good}</b><span>Good</span></div>
        <div class="exp-mini soon"><b>${s.soon}</b><span>Expiring Soon</span></div>
        <div class="exp-mini critical"><b>${s.critical}</b><span>Critical</span></div>
        <div class="exp-mini expired"><b>${s.expired}</b><span>Expired</span></div>
        <div class="exp-mini none"><b>${s.none}</b><span>Not Specified</span></div>
      </div>
      ${open.length ? `<div class="table-scroll"><table class="exp-table small"><thead><tr><th>Product</th><th>Size</th><th>Batch</th><th>Supplier</th><th>Expiry</th><th>Days</th><th class="right">Qty</th><th>Status</th></tr></thead><tbody>
        ${open.slice(0, 25).map(b => `<tr><td>${escapeHtml(b.productName)}</td><td>${fmtSize(b.containerSize)}</td><td><code class="exp-code">${escapeHtml(b.batchNumber)}</code></td><td>${escapeHtml(b.supplierName || '—')}</td><td>${expFmtDate(b.expirationDate)}</td><td>${expDaysText(b)}</td><td class="right">${b.remainingQty}</td><td>${expBadge(b.expiryStatus)}</td></tr>`).join('')}
      </tbody></table></div>` : `<div class="muted small">✓ No expired, critical or expiring-soon batches with stock on hand.</div>`}
      <div style="margin-top:10px;"><button class="btn secondary small" onclick="goToExpiration('all')">Open Expiration Tracking →</button> <button class="btn small" onclick="expExportAllReport()">⬇ Export Expiration Report</button></div>`;
  } catch (e) {
    el.innerHTML = `<div class="muted small">Could not load expiration data: ${escapeHtml(e.message)}</div>`;
  }
}

function expExportAllReport() {
  expStatusFilter = 'all'; expSearchQuery = ''; expCategoryFilter = 'all'; expSupplierFilter = 'all'; expDateFrom = ''; expDateTo = ''; expShowDepleted = false;
  expExportReport();
}
