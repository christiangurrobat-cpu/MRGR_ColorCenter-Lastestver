/* ============================================================
   18. ALERTS (Low-Stock Restock Alerts & Size-Specific Purchase Ordering)
   MRGR Color Center — Sales & Inventory System
   ============================================================ */

let alertTab = 'needing_po'; // 'needing_po' | 'on_order' | 'all'
let alertSearchQuery = '';
let alertSupplierFilter = 'all'; // 'all' or supplier.id
let alertContainerSizeFilter = 'all'; // 'all' or numeric string
let alertStockStatusFilter = 'all'; // 'all' | 'low' | 'out' | 'ok'
let alertSizeFilter = 'low_only'; // 'low_only' | 'all'

// Backward-compatible references mapped to unified LowStockService
const selectedAlertSizeKeys = LowStockService.selectedKeys;
const selectedAlertProductIds = new Set();

function setAlertTab(tab) {
  alertTab = tab;
  resetPaginationPage('low_stock_alerts');
  renderPage();
}

function setAlertSearch(q) {
  alertSearchQuery = (q || '').trim();
  resetPaginationPage('low_stock_alerts');
  renderPage();
  const input = document.getElementById('alerts-search-input');
  if (input) {
    input.focus();
    const len = input.value.length;
    try { input.setSelectionRange(len, len); } catch (e) { }
  }
}

function setAlertSupplierFilter(supId) {
  alertSupplierFilter = supId || 'all';
  resetPaginationPage('low_stock_alerts');
  renderPage();
}

function setAlertContainerSizeFilter(sz) {
  alertContainerSizeFilter = sz || 'all';
  resetPaginationPage('low_stock_alerts');
  renderPage();
}

function setAlertStockStatusFilter(st) {
  alertStockStatusFilter = st || 'all';
  resetPaginationPage('low_stock_alerts');
  renderPage();
}

function setAlertSizeFilter(mode) {
  alertSizeFilter = mode || 'low_only';
  resetPaginationPage('low_stock_alerts');
  renderPage();
}

function resetAlertFilters() {
  alertTab = 'needing_po';
  alertSearchQuery = '';
  alertSupplierFilter = 'all';
  alertContainerSizeFilter = 'all';
  alertStockStatusFilter = 'all';
  alertSizeFilter = 'low_only';
  resetPaginationPage('low_stock_alerts');
  renderPage();
}

/**
 * Returns filtered and sorted products according to the active tab and advanced filters.
 */
function getAlertsList() {
  const baseProducts = alertStockStatusFilter === 'ok' ? activeProducts() : lowStockProducts();

  let list = baseProducts.sort((a, b) => {
    const aLow = productLowSizes(a).length;
    const bLow = productLowSizes(b).length;
    if (bLow !== aLow) return bLow - aLow;
    const aThresh = productTotalThresholdLiters(a) || Number(a.threshold) || 0;
    const bThresh = productTotalThresholdLiters(b) || Number(b.threshold) || 0;
    return (a.stock - aThresh) - (b.stock - bThresh);
  });

  // 1. Tab filter
  if (alertTab === 'needing_po') {
    list = list.filter(p => {
      const sizes = productSizes(p);
      return sizes.some(s => {
        const variant = productSizeVariantBySize(p, s);
        return LowStockService.isVariantEligible(p, s, variant ? variant.sizeId : null);
      });
    });
  } else if (alertTab === 'on_order') {
    list = list.filter(p => {
      const sizes = productSizes(p);
      return sizes.some(s => {
        const variant = productSizeVariantBySize(p, s);
        const poSt = LowStockService.getVariantPOStatus(p, s, variant ? variant.sizeId : null);
        return poSt.status === 'on_order';
      });
    });
  } else {
    // alertTab === 'all'
    list = list.filter(p => {
      const sizes = productSizes(p);
      return sizes.some(s => {
        const st = LowStockService.getVariantStockStatus(p, s);
        return st === 'low' || st === 'out';
      });
    });
  }

  // 2. Search query filter
  if (alertSearchQuery) {
    const q = alertSearchQuery.toLowerCase();
    list = list.filter(p => {
      const name = (p.name || '').toLowerCase();
      const brand = (p.brand || '').toLowerCase();
      const color = (p.color || '').toLowerCase();
      const prodId = (p.productId || p.id || '').toLowerCase();
      const suppliers = suppliersForProduct(p.id).map(s => (s.name || '').toLowerCase()).join(' ');
      const sizeIds = productSizeVariants(p).map(v => (v.sizeId || '').toLowerCase()).join(' ');
      return name.includes(q) || brand.includes(q) || color.includes(q) || prodId.includes(q) || suppliers.includes(q) || sizeIds.includes(q);
    });
  }

  // 3. Supplier filter
  if (alertSupplierFilter && alertSupplierFilter !== 'all') {
    list = list.filter(p => {
      const suppliers = suppliersForProduct(p.id);
      return suppliers.some(s => String(s.id) === String(alertSupplierFilter)) ||
             String(p.supplierId || p.supplier_id || '') === String(alertSupplierFilter);
    });
  }

  // 4. Container size filter
  if (alertContainerSizeFilter && alertContainerSizeFilter !== 'all') {
    const targetSz = normalizeCanSize(alertContainerSizeFilter);
    list = list.filter(p => {
      const sizes = productSizes(p);
      return sizes.some(s => normalizeCanSize(s) === targetSz);
    });
  }

  // 5. Stock status filter
  if (alertStockStatusFilter && alertStockStatusFilter !== 'all') {
    list = list.filter(p => {
      const sizes = productSizes(p);
      return sizes.some(s => LowStockService.getVariantStockStatus(p, s) === alertStockStatusFilter);
    });
  }

  return list;
}

function getProductEligibleSizes(p) {
  return LowStockService.getProductEligibleSizes(p);
}

function getAllEligibleAlertSizes(productsList) {
  return LowStockService.getAllEligibleSizes(productsList);
}

function toggleSelectAllAlerts(checked) {
  if (checked) {
    const list = getAlertsList();
    const eligibleSizes = LowStockService.getAllEligibleSizes(list);
    LowStockService.selectAll(eligibleSizes);
  } else {
    LowStockService.clear();
  }
}

function toggleSelectProductSizes(productId, forceState = null) {
  LowStockService.toggleProduct(productId, forceState);
}

function onAlertSizeCheck(checkbox, productId, size, sizeId) {
  LowStockService.toggleSize(productId, size, sizeId, checkbox.checked);
}

function updateAlertsSelectionUI() {
  LowStockService.syncUI();
}

function createPOForSingleSize(productId, size, sizeId = null) {
  LowStockService.createPOForSingleSize(productId, size, sizeId);
}

function createPOFromSelectedAlerts() {
  LowStockService.createPOFromSelected();
}

/**
 * Main Low-Stock Alerts Page View
 */
function alertsPage() {
  const summary = LowStockService.getRestockSummary();
  const currentList = getAlertsList();
  const pag = paginateArray(currentList, 'low_stock_alerts', {
    onUpdate: renderPage,
    scrollTarget: '#alerts-table-panel',
    recordLabel: 'products'
  });
  const pagedList = pag.pagedItems;
  const eligibleSizesAll = LowStockService.getAllEligibleSizes(currentList);
  const eligibleSizesPage = LowStockService.getAllEligibleSizes(pagedList);
  const selSummary = LowStockService.getSelectedSummary();
  const selectedCount = selSummary.sizeCount;
  const selectedProdCount = selSummary.productCount;
  const canOrder = currentUser && (currentUser.role === 'admin' || currentUser.role === 'staff');

  // All active suppliers for filter dropdown
  const activeSuppliers = (db.suppliers || []).filter(s => s.status === 'active');

  // Distinct container sizes across catalog for filter dropdown
  const distinctSizesSet = new Set();
  (db.products || []).forEach(p => {
    productSizes(p).forEach(s => distinctSizesSet.add(normalizeCanSize(s)));
  });
  const distinctSizes = Array.from(distinctSizesSet).sort((a, b) => a - b);

  // Count total qualifying sizes rendered in current view
  let totalVisibleSizes = 0;
  currentList.forEach(p => {
    const rawSizes = productSizes(p);
    rawSizes.forEach(s => {
      const st = LowStockService.getVariantStockStatus(p, s);
      const variant = productSizeVariantBySize(p, s);
      const poSt = LowStockService.getVariantPOStatus(p, s, variant ? variant.sizeId : null);

      if (alertContainerSizeFilter !== 'all' && normalizeCanSize(s) !== normalizeCanSize(alertContainerSizeFilter)) return;
      if (alertStockStatusFilter !== 'all' && st !== alertStockStatusFilter) return;

      if (alertSizeFilter === 'all') {
        totalVisibleSizes++;
      } else if (alertTab === 'needing_po') {
        if ((st === 'low' || st === 'out') && poSt.status !== 'on_order') totalVisibleSizes++;
      } else if (alertTab === 'on_order') {
        if (poSt.status === 'on_order') totalVisibleSizes++;
      } else {
        if (st === 'low' || st === 'out') totalVisibleSizes++;
      }
    });
  });

  const hasActiveFilters = alertSearchQuery || alertSupplierFilter !== 'all' || alertContainerSizeFilter !== 'all' || alertStockStatusFilter !== 'all' || alertSizeFilter !== 'low_only';

  return `
  <!-- 1. Top Restock Status Banner -->
  <div class="restock-summary-container">
    ${summary.needingPOSizes > 0 ? `
      <div class="alert-banner danger" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:0; box-shadow:var(--shadow-sm); border-radius:var(--radius-sm);">
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="font-size:22px; line-height:1;">⚠️</span>
          <div>
            <div style="font-weight:700; font-size:14px; color:#9B1C1C;">
              Attention Required: <b>${summary.needingPOSizes} container size(s)</b> across <b>${summary.needingPOProducts} product(s)</b> need purchase orders.
            </div>
            <div style="font-size:12px; color:#B91C1C; margin-top:2px; opacity:0.95;">
              ${summary.onOrderSizes > 0 ? `(${summary.onOrderSizes} other size(s) across ${summary.onOrderProducts} product(s) already have purchase orders awaiting delivery)` : 'No active purchase orders are currently placed for these low items.'}
            </div>
          </div>
        </div>
        ${canOrder ? `
          <div style="display:flex; align-items:center; gap:8px;">
            <button class="btn small" style="background:#1F6F6B; color:#fff; font-weight:700; box-shadow:0 2px 6px rgba(31,111,107,0.3);" onclick="${selectedCount === 0 ? 'toggleSelectAllAlerts(true); createPOFromSelectedAlerts();' : 'createPOFromSelectedAlerts()'}" ${summary.needingPOSizes === 0 ? 'disabled' : ''}>
              📋 ${selectedCount > 0 ? `Create PO for Selected (${selectedCount} Sizes)` : `Create PO for Needing PO (${summary.needingPOSizes} Sizes)`} &rarr;
            </button>
          </div>
        ` : ''}
      </div>
    ` : (summary.onOrderSizes > 0 ? `
      <div class="alert-banner" style="background:#EBF5FB; border-color:#AED6F1; color:#1B4F72; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:0; box-shadow:var(--shadow-sm); border-radius:var(--radius-sm);">
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="font-size:22px; line-height:1;">🚚</span>
          <div>
            <div style="font-weight:700; font-size:14px;">All low-stock items are covered and awaiting delivery!</div>
            <div style="font-size:12px; opacity:0.95; margin-top:2px;"><b>${summary.onOrderSizes} container size(s)</b> across <b>${summary.onOrderProducts} product(s)</b> currently have active purchase orders en route.</div>
          </div>
        </div>
        <button class="btn small secondary" onclick="setAlertTab('on_order')">View On-Order Items (${summary.onOrderSizes}) &rarr;</button>
      </div>
    ` : `
      <div class="alert-banner" style="background:#DEF7EC; border-color:#BCF0DA; color:#03543F; margin-bottom:0; box-shadow:var(--shadow-sm); border-radius:var(--radius-sm);">
        <span style="font-size:18px;">✅</span> <b>Healthy Inventory:</b> All products and container sizes are currently above their minimum reorder thresholds.
      </div>
    `)}

    <!-- PHASE 2.A: 5 Comprehensive Summary Cards -->
    <div class="restock-summary-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:12px;">
      <!-- Card 1: Needs Purchase Order -->
      <div class="restock-card restock-card-accent-danger ${alertTab === 'needing_po' ? 'active' : ''}" onclick="setAlertTab('needing_po')" title="Click to filter products needing purchase orders">
        <div class="restock-card-icon" style="background:#FDE8E8; color:#9B1C1C;">⚠️</div>
        <div class="restock-card-body">
          <div class="restock-card-val" style="color:#C1443D;">
            ${summary.needingPOSizes} <span style="font-size:12.5px; font-weight:600; color:var(--ink-soft);">Sizes</span>
          </div>
          <div class="restock-card-lbl">Needs Purchase Order</div>
          <div class="restock-card-sub">${summary.needingPOProducts} product(s) require reordering</div>
        </div>
      </div>

      <!-- Card 2: On Order / Awaiting Delivery -->
      <div class="restock-card restock-card-accent-info ${alertTab === 'on_order' ? 'active' : ''}" onclick="setAlertTab('on_order')" title="Click to filter items on order awaiting delivery">
        <div class="restock-card-icon" style="background:#EBF5FB; color:#1B4F72;">🚚</div>
        <div class="restock-card-body">
          <div class="restock-card-val" style="color:#1F6F6B;">
            ${summary.onOrderSizes} <span style="font-size:12.5px; font-weight:600; color:var(--ink-soft);">Sizes</span>
          </div>
          <div class="restock-card-lbl">On Order / Awaiting Delivery</div>
          <div class="restock-card-sub">${summary.onOrderProducts} product(s) awaiting delivery</div>
        </div>
      </div>

      <!-- Card 3: Total Low-Stock Items -->
      <div class="restock-card restock-card-accent-neutral ${alertTab === 'all' ? 'active' : ''}" onclick="setAlertTab('all')" title="Click to view all low-stock items">
        <div class="restock-card-icon" style="background:#F4EFE6; color:var(--ink);">📊</div>
        <div class="restock-card-body">
          <div class="restock-card-val" style="color:var(--ink);">
            ${summary.totalLowSizes} <span style="font-size:12.5px; font-weight:600; color:var(--ink-soft);">Sizes</span>
          </div>
          <div class="restock-card-lbl">Total Low-Stock Items</div>
          <div class="restock-card-sub">${summary.totalLowProducts} product(s) below threshold</div>
        </div>
      </div>

      <!-- Card 4: Total Products Affected -->
      <div class="restock-card" style="border-left:4px solid #8B5CF6;" title="Total unique active products with low stock">
        <div class="restock-card-icon" style="background:#F5F3FF; color:#6D28D9;">📦</div>
        <div class="restock-card-body">
          <div class="restock-card-val" style="color:#6D28D9;">
            ${summary.totalProductsAffected} <span style="font-size:12.5px; font-weight:600; color:var(--ink-soft);">Products</span>
          </div>
          <div class="restock-card-lbl">Total Products Affected</div>
          <div class="restock-card-sub">Active catalog products with low stock</div>
        </div>
      </div>

      <!-- Card 5: Total Container Sizes Affected -->
      <div class="restock-card" style="border-left:4px solid #F59E0B;" title="Total container sizes at or below threshold">
        <div class="restock-card-icon" style="background:#FEF3C7; color:#B45309;">🪣</div>
        <div class="restock-card-body">
          <div class="restock-card-val" style="color:#B45309;">
            ${summary.totalContainerSizesAffected} <span style="font-size:12.5px; font-weight:600; color:var(--ink-soft);">Variants</span>
          </div>
          <div class="restock-card-lbl">Total Container Sizes</div>
          <div class="restock-card-sub">Eligible &amp; on-order restock variants</div>
        </div>
      </div>
    </div>
  </div>

  <!-- PHASE 2.B: Tabs and Comprehensive Filters Bar -->
  <div class="report-toggle-bar" style="margin-bottom:14px; border-radius:var(--radius-sm); border:1px solid var(--line); background:#FAF7F2; padding:10px 14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
    <!-- Status Tabs -->
    <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
      <button type="button" class="report-toggle-btn ${alertTab === 'needing_po' ? 'active' : ''}" onclick="setAlertTab('needing_po')">
        <span class="rt-icon">⚠️</span> Needs Purchase Order
        <span class="restock-tab-pill danger">${summary.needingPOProducts}</span>
      </button>
      <button type="button" class="report-toggle-btn ${alertTab === 'on_order' ? 'active' : ''}" onclick="setAlertTab('on_order')">
        <span class="rt-icon">🚚</span> On Order / Awaiting Delivery
        <span class="restock-tab-pill info">${summary.onOrderProducts}</span>
      </button>
      <button type="button" class="report-toggle-btn ${alertTab === 'all' ? 'active' : ''}" onclick="setAlertTab('all')">
        <span class="rt-icon">📋</span> All Low-Stock
        <span class="restock-tab-pill neutral">${summary.totalLowProducts}</span>
      </button>
    </div>

    <!-- Advanced Real-time Dropdown Filters -->
    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
      <!-- Search Input -->
      <div style="position:relative; width:210px;">
        <input type="text"
               id="alerts-search-input"
               placeholder="Search product, brand, color..."
               value="${escapeHtml(alertSearchQuery)}"
               oninput="setAlertSearch(this.value)"
               style="width:100%; padding:5px 26px 5px 10px; font-size:12px; border-radius:var(--radius-sm); border:1px solid var(--line); background:#fff; color:var(--ink);">
        ${alertSearchQuery ? `
          <button type="button" onclick="setAlertSearch('');" style="position:absolute; right:6px; top:50%; transform:translateY(-50%); border:none; background:none; color:var(--ink-soft); cursor:pointer; font-size:12px;">✕</button>
        ` : ''}
      </div>

      <!-- Filter by Supplier -->
      <select id="alerts-supplier-filter" onchange="setAlertSupplierFilter(this.value)" style="padding:4px 8px; font-size:12px; border:1px solid var(--line); border-radius:var(--radius-sm); background:#fff; color:var(--ink); max-width:160px;" title="Filter by Supplier">
        <option value="all" ${alertSupplierFilter === 'all' ? 'selected' : ''}>All Suppliers</option>
        ${activeSuppliers.map(s => `<option value="${s.id}" ${alertSupplierFilter === s.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}
      </select>

      <!-- Filter by Container Size -->
      <select id="alerts-size-dropdown" onchange="setAlertContainerSizeFilter(this.value)" style="padding:4px 8px; font-size:12px; border:1px solid var(--line); border-radius:var(--radius-sm); background:#fff; color:var(--ink);" title="Filter by Container Size">
        <option value="all" ${alertContainerSizeFilter === 'all' ? 'selected' : ''}>All Sizes</option>
        ${distinctSizes.map(sz => `<option value="${sz}" ${String(alertContainerSizeFilter) === String(sz) ? 'selected' : ''}>${fmtSize(sz)}</option>`).join('')}
      </select>

      <!-- Filter by Stock Status -->
      <select id="alerts-status-dropdown" onchange="setAlertStockStatusFilter(this.value)" style="padding:4px 8px; font-size:12px; border:1px solid var(--line); border-radius:var(--radius-sm); background:#fff; color:var(--ink);" title="Filter by Stock Status">
        <option value="all" ${alertStockStatusFilter === 'all' ? 'selected' : ''}>All Stock Statuses</option>
        <option value="low" ${alertStockStatusFilter === 'low' ? 'selected' : ''}>Low Stock</option>
        <option value="out" ${alertStockStatusFilter === 'out' ? 'selected' : ''}>Out of Stock</option>
        <option value="ok" ${alertStockStatusFilter === 'ok' ? 'selected' : ''}>In Stock</option>
      </select>

      <!-- View Size Mode Toggle -->
      <div style="display:flex; align-items:center; gap:2px; background:#fff; border:1px solid var(--line); border-radius:var(--radius-sm); padding:2px;">
        <button type="button"
                class="btn ghost small"
                style="padding:3px 8px; font-size:11px; ${alertSizeFilter === 'low_only' ? 'background:var(--teal); color:#fff; font-weight:700;' : 'color:var(--ink-soft);'}"
                onclick="setAlertSizeFilter('low_only')"
                title="Show only qualifying low or out-of-stock sizes">
          Low Only
        </button>
        <button type="button"
                class="btn ghost small"
                style="padding:3px 8px; font-size:11px; ${alertSizeFilter === 'all' ? 'background:var(--teal); color:#fff; font-weight:700;' : 'color:var(--ink-soft);'}"
                onclick="setAlertSizeFilter('all')"
                title="Show all container sizes under low-stock products">
          All Sizes
        </button>
      </div>

      ${hasActiveFilters ? `
        <button type="button" class="btn ghost small" onclick="resetAlertFilters()" title="Reset all search filters" style="color:var(--danger); font-size:11.5px; padding:3px 8px;">
          ✕ Clear Filters
        </button>
      ` : ''}
    </div>
  </div>

  <!-- PHASE 2.C & PHASE 4: Product Table Panel with Unified Selection & Actions -->
  <div class="panel" id="alerts-table-panel">
    <div class="panel-head row wrap" style="gap:10px; padding:12px 18px; border-bottom:1px solid var(--line);">
      <div>
        <h3 style="margin:0; font-size:16px;">
          ${alertTab === 'needing_po'
            ? '⚠️ Products Needing Restock Purchase Order'
            : (alertTab === 'on_order'
              ? '🚚 Low-Stock Products with Active Purchase Orders'
              : '📋 All Low-Stock Products & Sizes')}
        </h3>
        <!-- PHASE 5: Accurate Selection Summary Display -->
        <div id="alerts-selection-summary" style="font-size:12px; color:var(--ink-soft); margin-top:3px;">
          Selected Products: <b>${selectedProdCount}</b> &nbsp;|&nbsp; Selected Container Sizes: <b>${selectedCount}</b>
        </div>
      </div>
      <div class="spacer"></div>
      <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
        ${canOrder && currentList.length && alertTab !== 'on_order' ? `
          <!-- PHASE 5: Create PO Button with exact size count & disabled state -->
          <button class="btn small ${selectedCount > 0 ? 'btn-primary-highlight' : 'btn-disabled'}"
                  id="btn-create-po-alerts"
                  onclick="createPOFromSelectedAlerts()"
                  ${selectedCount === 0 ? 'disabled' : ''}
                  title="Create purchase orders for selected container sizes"
                  style="font-weight:700;">
            📋 Create Purchase Order (${selectedCount === 1 ? '1 Size' : `${selectedCount} Sizes`})
          </button>

          <!-- Selection action buttons -->
          ${pag.totalPages > 1 ? `
            <button class="btn secondary small" onclick="LowStockService.selectCurrentPage(getAllEligibleAlertSizes(pag.pagedItems))" title="Select eligible sizes on current visible page">
              Select Current Page
            </button>
          ` : ''}
          <button class="btn secondary small" onclick="toggleSelectAllAlerts(true)" title="Select all eligible low-stock container sizes">
            Select All
          </button>
          <button class="btn ghost small" onclick="toggleSelectAllAlerts(false)" title="Clear all selections">
            Clear Selection
          </button>
        ` : ''}
        <span class="badge ${alertTab === 'on_order' ? 'ok' : (currentList.length ? 'low' : 'ok')}" style="padding:4px 10px; font-weight:700;">
          ${currentList.length} Product${currentList.length === 1 ? '' : 's'} (${totalVisibleSizes} Sizes)
        </span>
      </div>
    </div>

    <div class="panel-body tight table-scroll" style="overflow-x:auto;">
      <table class="table-grouped-product" style="min-width:1150px;">
        <thead>
          <tr>
            ${canOrder && currentList.length && alertTab !== 'on_order' ? `
              <th style="width:40px; text-align:center;">
                <input type="checkbox"
                       id="chk-all-alerts"
                       onchange="toggleSelectAllAlerts(this.checked)"
                       title="Select / deselect all eligible sizes in current filtered list"
                       ${eligibleSizesAll.length > 0 && selectedCount === eligibleSizesAll.length ? 'checked' : ''}>
              </th>
            ` : ''}
            <th style="width:220px;">Product Name</th>
            <th style="width:160px;">Color Code &amp; Name</th>
            <th style="width:110px;">Brand</th>
            <th style="width:150px;">Supplier</th>
            <th style="width:90px; text-align:center;">Container Size</th>
            <th class="right" style="width:125px;">Stock Quantity (Units)</th>
            <th class="right" style="width:105px;">Stock Volume (L)</th>
            <th class="right" style="width:135px;">Minimum Threshold (Units)</th>
            <th class="right" style="width:115px;">Threshold Volume (L)</th>
            <th class="center" style="width:130px;">Stock Status</th>
            <th class="center" style="width:150px;">Purchase Order Status</th>
            <th class="center" style="width:115px;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${pagedList.length ? pagedList.map((p, pIdx) => {
            let rawSizes = productSizes(p).slice().sort((a, b) => Number(a) - Number(b));
            if (!rawSizes.length) rawSizes = [1];

            // Filter sizes for this product row
            let sizes = rawSizes.filter(s => {
              const st = LowStockService.getVariantStockStatus(p, s);
              const variant = productSizeVariantBySize(p, s);
              const poSt = LowStockService.getVariantPOStatus(p, s, variant ? variant.sizeId : null);

              if (alertContainerSizeFilter !== 'all' && normalizeCanSize(s) !== normalizeCanSize(alertContainerSizeFilter)) return false;
              if (alertStockStatusFilter !== 'all' && st !== alertStockStatusFilter) return false;

              if (alertSizeFilter === 'all') return true;
              if (alertTab === 'needing_po') return (st === 'low' || st === 'out') && poSt.status !== 'on_order';
              if (alertTab === 'on_order') return poSt.status === 'on_order';
              return st === 'low' || st === 'out';
            });

            if (!sizes.length) return '';

            const rowSpan = sizes.length;
            const bgGroup = pIdx % 2 === 1 ? 'background:#FCFBF9;' : 'background:#FFFFFF;';
            const prodEligible = LowStockService.getProductEligibleSizes(p);
            const parentState = LowStockService.getProductSelectionState(p.id);

            return sizes.map((s, idx) => {
              const isFirst = idx === 0;
              const isLast = idx === rowSpan - 1;
              const variant = productSizeVariantBySize(p, s);
              const sizeId = variant ? variant.sizeId : null;
              const sizeKey = getAlertSizeKey(p.id, s, sizeId);
              const count = productCanCount(p, s);
              const thresh = productSizeThreshold(p, s);
              const stockVol = count * s;
              const threshVol = thresh * s;
              const st = LowStockService.getVariantStockStatus(p, s);
              const poSt = LowStockService.getVariantPOStatus(p, s, sizeId);
              const isEligible = LowStockService.isVariantEligible(p, s, sizeId);
              const isChecked = LowStockService.isSelected(p.id, s, sizeId);
              const borderBottom = isLast ? 'border-bottom: 2px solid #D8D1C4;' : 'border-bottom: 1px solid #F0ECE1;';

              return `
              <tr class="alert-row alert-prod-row-${p.id} ${isLast ? 'product-row-last' : ''} ${isChecked ? 'row-selected' : ''} ${poSt.status === 'on_order' ? 'row-on-order' : ''}" style="${bgGroup}">
                
                <!-- PHASE 4.A: Parent Checkbox (first row only) & PHASE 4.B: Child Size Checkbox -->
                ${canOrder && alertTab !== 'on_order' ? (isFirst ? `
                  <td rowspan="${rowSpan}" style="text-align:center; vertical-align:middle; border-bottom: 2px solid #D8D1C4; border-right: 1px solid #EFE9DC;">
                    <div style="display:flex; flex-direction:column; align-items:center; gap:4px;">
                      <input type="checkbox"
                             class="alert-prod-chk"
                             data-product-id="${p.id}"
                             value="${p.id}"
                             ${parentState === 'checked' ? 'checked' : ''}
                             ${prodEligible.length === 0 ? 'disabled title="No eligible sizes needing reorder"' : `title="Select/deselect all ${prodEligible.length} eligible sizes for ${escapeHtml(p.name)}"`}
                             onchange="toggleSelectProductSizes('${p.id}', this.checked)">
                      ${prodEligible.length > 1 ? `
                        <span style="font-size:10px; color:var(--ink-soft); font-weight:600;" title="${prodEligible.length} eligible sizes">${prodEligible.length}</span>
                      ` : ''}
                    </div>
                  </td>
                ` : '') : ''}

                <!-- Grouped Parent Product Info (First row only) -->
                ${isFirst ? `
                  <!-- Product Name -->
                  <td rowspan="${rowSpan}" style="vertical-align:middle; border-bottom: 2px solid #D8D1C4; border-right: 1px solid #EFE9DC;">
                    <div style="font-weight:700; font-size:13.5px; color:var(--ink); line-height:1.3;" title="${escapeHtml(p.name)}">
                      ${escapeHtml(p.name)}
                    </div>
                    <div class="muted small" style="margin-top:4px; font-size:11px;">
                      Total Stock: <b style="${productHasLowStock(p) ? 'color:var(--danger);' : ''}">${formatLiters(p.stock)}</b>
                    </div>
                  </td>

                  <!-- Color Code and Color Name -->
                  <td rowspan="${rowSpan}" style="vertical-align:middle; border-bottom: 2px solid #D8D1C4; border-right: 1px solid #EFE9DC;">
                    <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                      <span style="display:inline-block; width:12px; height:12px; border-radius:2px; background:${getProductHex(p)}; border:1px solid rgba(0,0,0,0.25);"></span>
                      <code style="font-family:'Space Grotesk',monospace; font-size:11px; font-weight:700; color:var(--teal);">${getProductHex(p)}</code>
                    </div>
                    <div style="font-size:11.5px; color:var(--ink-soft); margin-top:3px; font-weight:500;">
                      ${p.color && p.color !== '-' ? escapeHtml(p.color) : '<span class="muted">—</span>'}
                    </div>
                  </td>

                  <!-- Brand -->
                  <td rowspan="${rowSpan}" style="vertical-align:middle; border-bottom: 2px solid #D8D1C4; border-right: 1px solid #EFE9DC; font-weight:600; font-size:12.5px;">
                    ${escapeHtml(p.brand)}
                  </td>

                  <!-- Supplier -->
                  <td rowspan="${rowSpan}" style="vertical-align:middle; border-bottom: 2px solid #D8D1C4; border-right: 1px solid #EFE9DC;">
                    ${supplierBadgesHtml(p.id)}
                  </td>
                ` : ''}

                <!-- Container Size with Child Checkbox -->
                <td class="center" style="vertical-align:middle; ${borderBottom}">
                  <div style="display:inline-flex; align-items:center; gap:6px;">
                    ${canOrder && alertTab !== 'on_order' ? (isEligible ? `
                      <input type="checkbox"
                             class="alert-size-chk"
                             value="${sizeKey}"
                             data-product-id="${p.id}"
                             data-size="${s}"
                             data-size-id="${sizeId || ''}"
                             ${isChecked ? 'checked' : ''}
                             onchange="onAlertSizeCheck(this, '${p.id}', ${s}, '${sizeId || ''}')"
                             title="Select ${escapeHtml(p.name)} (${fmtSize(s)}) for purchase order">
                    ` : (poSt.status === 'on_order' ? `
                      <span title="Already on order in purchase order ${poSt.poNumber || ''}" style="color:#1B4F72; font-size:12px; opacity:0.8; cursor:help;">🚚</span>
                    ` : `
                      <span style="color:#CBD5E1; font-size:12px;" title="Stock is sufficient — restocking not required">—</span>
                    `)) : ''}
                    <span class="badge" style="background:#FAF8F5; border:1px solid #E5DDCF; font-weight:700; font-family:'Space Grotesk',sans-serif; color:var(--ink); font-size:11.5px; padding:2px 7px;">
                      ${fmtSize(s)}
                    </span>
                  </div>
                </td>

                <!-- Stock Quantity (Units) -->
                <td class="right" style="font-weight:700; font-family:'Space Grotesk',sans-serif; vertical-align:middle; ${borderBottom} ${st === 'out' ? 'color:var(--danger);' : (st === 'low' ? 'color:#B45309;' : 'color:var(--ink);')}">
                  ${count} ${count === 1 ? 'unit' : 'units'}
                </td>

                <!-- Stock Volume (L) -->
                <td class="right" style="font-weight:600; font-family:'Space Grotesk',sans-serif; vertical-align:middle; ${borderBottom} ${st === 'out' ? 'color:var(--danger);' : (st === 'low' ? 'color:#B45309;' : 'color:var(--ink-soft);')}">
                  ${formatLiters(stockVol)}
                </td>

                <!-- Minimum Threshold (Units) -->
                <td class="right" style="font-weight:600; font-family:'Space Grotesk',sans-serif; vertical-align:middle; ${borderBottom} color:var(--ink);">
                  ${thresh} ${thresh === 1 ? 'unit' : 'units'}
                </td>

                <!-- Threshold Volume (L) -->
                <td class="right" style="font-weight:600; font-family:'Space Grotesk',sans-serif; vertical-align:middle; ${borderBottom} color:var(--ink);">
                  ${formatLiters(threshVol)}
                </td>

                <!-- PHASE 1: Stock Status (Separate from PO Status) -->
                <td class="center" style="vertical-align:middle; ${borderBottom}">
                  ${LowStockService.renderStockBadge(st)}
                </td>

                <!-- PHASE 1: Purchase Order Status (Separate from Stock Status) -->
                <td class="center" style="vertical-align:middle; ${borderBottom}">
                  ${LowStockService.renderPOBadge(poSt)}
                </td>

                <!-- PHASE 7: Actions Column -->
                <td class="center" style="vertical-align:middle; white-space:nowrap; ${borderBottom}">
                  ${poSt.status === 'on_order' ? `
                    <button type="button" class="btn secondary small" onclick="openPODetail('${escapeAttr(poSt.primaryPO ? poSt.primaryPO.id : '')}')" title="View Purchase Order ${escapeAttr(poSt.poNumber || '')}" style="padding:3px 8px; font-size:11.5px;">
                      👁️ View PO
                    </button>
                  ` : (isEligible ? `
                    ${canOrder ? `
                      <button type="button" class="btn small" onclick="createPOForSingleSize('${p.id}', ${s}, '${sizeId || ''}')" title="Directly create purchase order for ${escapeHtml(p.name)} (${fmtSize(s)})" style="padding:3px 10px; font-size:11.5px; background:var(--teal); color:#fff; font-weight:600;">
                        + Create PO
                      </button>
                    ` : '<span class="muted small">—</span>'}
                  ` : `
                    <span class="muted small" style="color:#94A3B8; font-size:11px;">In Stock</span>
                  `)}
                </td>
              </tr>`;
            }).join('');
          }).join('') : `
            <tr>
              <td colspan="13" class="empty-state">
                ${alertTab === 'needing_po'
                  ? '🎉 Excellent! No low-stock products currently need purchase orders.'
                  : (alertTab === 'on_order'
                    ? 'No low-stock products are currently on order.'
                    : 'All products and container sizes are above their reorder thresholds.')}
              </td>
            </tr>
          `}
        </tbody>
      </table>
    </div>
    ${pag.html}
  </div>

  <!-- Floating Quick Create Bar when sizes are selected -->
  <div id="alerts-floating-bar" class="alerts-selection-bar" style="${selectedCount > 0 ? 'display:flex;' : 'display:none;'}">
    <div style="display:flex; align-items:center; gap:10px;">
      <span style="font-size:18px;">📋</span>
      <span id="alerts-floating-label" style="font-weight:600;">
        ${selectedCount} container size${selectedCount === 1 ? '' : 's'} across ${selectedProdCount} product${selectedProdCount === 1 ? '' : 's'} selected for purchase order
      </span>
    </div>
    <div style="display:flex; align-items:center; gap:8px;">
      <button class="btn ghost small" onclick="LowStockService.clear()" style="color:#fff; border-color:rgba(255,255,255,0.4);">Cancel</button>
      <button class="btn small" style="background:#fff; color:var(--teal-dark); font-weight:700; box-shadow:var(--shadow-md);" onclick="createPOFromSelectedAlerts()">
        ⚡ Create Purchase Order (${selectedCount === 1 ? '1 Size' : `${selectedCount} Sizes`}) &rarr;
      </button>
    </div>
  </div>
  `;
}
