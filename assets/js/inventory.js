/* ============================================================
   12. INVENTORY (admin & inventory staff: full stock + products management + movements)
   ============================================================ */
let invSortField = 'name';
let invSortAsc = true;
let invTypeFilter = '';
let invStatusFilter = '';
let invSearchQuery = '';
let invExpandedProductIds = new Set();
let invExpandedMovementsProductIds = new Set();
let invShowAllMovements = false;

function setInventorySort(field) {
  if (invSortField === field) {
    invSortAsc = !invSortAsc;
  } else {
    invSortField = field;
    invSortAsc = (field === 'stock' || field === 'price') ? true : true;
  }
  const sortSelect = document.getElementById('inv-sort-select');
  if (sortSelect) {
    sortSelect.value = `${invSortField}_${invSortAsc ? 'asc' : 'desc'}`;
  }
  resetPaginationPage('inventory_products');
  renderInventoryTable(true);
}

function onInventorySortSelectChange() {
  const sortSelect = document.getElementById('inv-sort-select');
  if (!sortSelect) return;
  const [field, dir] = sortSelect.value.split('_');
  invSortField = field;
  invSortAsc = dir === 'asc';
  resetPaginationPage('inventory_products');
  renderInventoryTable(true);
}

function filterPendingApprovalProducts() {
  const el = document.getElementById('inv-status-filter');
  if (el) {
    el.value = 'pending';
    resetPaginationPage('inventory_products');
    renderInventoryTable(true);
  }
}

function inventoryMovementsSectionHtml() {
  const allGroupedMoves = groupStockMovements(db.movements);
  const pag = paginateArray(allGroupedMoves, 'inventory_movements', {
    onUpdate: renderInventoryMovementsPanel,
    scrollTarget: '#inv-movements-panel',
    recordLabel: 'movements'
  });
  return `
    <div class="panel-body tight table-scroll">
      ${renderStockMovementsTable(pag.pagedItems, { emptyText: 'No movements recorded yet.' })}
    </div>
    ${pag.html}
  `;
}

function renderInventoryMovementsPanel() {
  const wrap = document.getElementById('inv-movements-content');
  if (wrap) {
    wrap.innerHTML = inventoryMovementsSectionHtml();
  } else if (typeof renderPage === 'function') {
    renderPage();
  }
}

function inventoryPage() {
  const canManage = currentUser && (currentUser.role === 'admin' || currentUser.role === 'staff');
  const readOnly = currentUser && currentUser.role === 'cashier';
  const allGroupedMoves = groupStockMovements(db.movements);
  const pendingProducts = (db.products || []).filter(p => p.status === 'pending_approval' || Boolean(p.pendingEdit) || (p.pendingSizes && p.pendingSizes.length > 0) || (p.pendingPrice != null && Number(p.pendingPrice) > 0));
  const activeProducts = (db && Array.isArray(db.products) ? db.products : []).filter(p => p && (p.type || '').toLowerCase() !== 'accessory');

  const productTypes = Array.from(new Set(activeProducts.map(p => p && (p.type || p.category)).filter(Boolean)));

  return `
  <div class="panel inv-panel" id="inv-products-panel">
  ${pendingProducts.length > 0 ? `
    <div class="alert-banner warning" style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; margin:12px 18px 0;">
      <span>⏳ <b>${pendingProducts.length} Product, Edit, Price, or Size Request${pendingProducts.length === 1 ? ' is' : 's are'} Pending Admin Approval.</b> ${currentUser && currentUser.role === 'admin' ? 'Review and activate them so they become available in POS and Receiving.' : 'Waiting for Administrator review and approval.'}</span>
      ${currentUser && currentUser.role === 'admin' ? `
        <button type="button" class="btn small" onclick="goToApprovalsTab('products')">Review in Approvals Hub (${pendingProducts.length}) &rarr;</button>
      ` : `
        <button type="button" class="btn small" onclick="filterPendingApprovalProducts()">Review Pending (${pendingProducts.length}) &rarr;</button>
      `}
    </div>
  ` : ''}
  <div class="panel-head row wrap inv-header">
    <div class="inv-title-area">
      <div style="display:flex; align-items:center; gap:10px;">
        <h3 style="margin:0;">Inventory &amp; Stock Management</h3>
        <span class="badge ghost small" id="inv-count-badge" style="font-weight:normal;" title="Active Paint Products in Catalog">${activeProducts.length} Products</span>
      </div>
      <div class="muted small inv-header-sub">Monitor warehouse stock levels, container sizes, threshold alerts, and pricing.</div>
    </div>
    <div class="spacer"></div>
    <div class="inv-header-actions">
      ${canManage ? `
        <button type="button" class="btn small inv-header-btn inv-add-prod-btn" onclick="openProductModal()" title="Add a new paint product to the catalog">
          + Add Product
        </button>
      ` : ''}
    </div>
  </div>
  <div class="inv-filter-toolbar">
    <div class="inv-search-wrap">
      <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
      <input id="inv-search" class="inv-input" type="text" placeholder="Search by name, brand, supplier, type, color…" value="${escapeHtml(invSearchQuery)}" oninput="renderInventoryTable()" onchange="renderInventoryTable()">
      ${invSearchQuery ? `<button type="button" class="inv-search-clear" onclick="clearInventorySearch()" title="Clear search">&times;</button>` : ''}
    </div>
    <div class="inv-filter-controls">
      <select id="inv-type-filter" class="inv-select inv-select-type" onchange="renderInventoryTable()" title="Filter by paint category/type">
        <option value="">All Categories</option>
        ${productTypes.map(t => `<option value="${escapeHtml(t)}" ${invTypeFilter === t ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}
      </select>
      <select id="inv-status-filter" class="inv-select inv-select-status" onchange="renderInventoryTable()" title="Filter by stock availability or product status">
        <option value="" ${!invStatusFilter ? 'selected' : ''}>All Status</option>
        <option value="active" ${invStatusFilter === 'active' ? 'selected' : ''}>🟢 Active</option>
        <option value="inactive" ${invStatusFilter === 'inactive' ? 'selected' : ''}>⚪ Inactive</option>
        <option value="discontinued" ${invStatusFilter === 'discontinued' ? 'selected' : ''}>🟠 Discontinued</option>
        <option value="in" ${invStatusFilter === 'in' ? 'selected' : ''}>In Stock</option>
        <option value="low" ${invStatusFilter === 'low' ? 'selected' : ''}>Low Stock</option>
        <option value="out" ${invStatusFilter === 'out' ? 'selected' : ''}>Out of Stock</option>
        <option value="pending" ${invStatusFilter === 'pending' ? 'selected' : ''}>⏳ Pending Approval</option>
      </select>
      <select id="inv-sort-select" class="inv-select inv-select-sort" onchange="onInventorySortSelectChange()" title="Sort products">
        <option value="name_asc" ${invSortField === 'name' && invSortAsc ? 'selected' : ''}>Sort: Name (A &rarr; Z)</option>
        <option value="name_desc" ${invSortField === 'name' && !invSortAsc ? 'selected' : ''}>Sort: Name (Z &rarr; A)</option>
        <option value="stock_asc" ${invSortField === 'stock' && invSortAsc ? 'selected' : ''}>Sort: Stock (Low &rarr; High)</option>
        <option value="stock_desc" ${invSortField === 'stock' && !invSortAsc ? 'selected' : ''}>Sort: Stock (High &rarr; Low)</option>
        <option value="price_asc" ${invSortField === 'price' && invSortAsc ? 'selected' : ''}>Sort: Price (Low &rarr; High)</option>
        <option value="price_desc" ${invSortField === 'price' && !invSortAsc ? 'selected' : ''}>Sort: Price (High &rarr; Low)</option>
        <option value="brand_asc" ${invSortField === 'brand' && invSortAsc ? 'selected' : ''}>Sort: Brand (A &rarr; Z)</option>
        <option value="type_asc" ${invSortField === 'type' && invSortAsc ? 'selected' : ''}>Sort: Type / Category</option>
        <option value="status_asc" ${invSortField === 'status' && invSortAsc ? 'selected' : ''}>Sort: Status (Out / Low First)</option>
      </select>
      ${(invSearchQuery || invTypeFilter || invStatusFilter) ? `
        <button type="button" class="btn ghost small inv-reset-btn" onclick="resetInventoryFilters()" title="Reset search and filters">
          ✕ Reset
        </button>
      ` : ''}
    </div>
  </div>
  <div class="inv-info-bar">
    <span>ℹ️ Click any product row or <b>"Details"</b> to expand container sizes, opened stock, threshold, and status. Hover color swatch to preview pigment tone. ${readOnly ? '<b>Read-only view</b> — check stock levels and container sizes before confirming a sale.' : ''}</span>
  </div>
<div class="panel-body tight table-scroll" id="inventory-table">${inventoryTableHtml()}</div>
  </div>
  <div class="panel" id="inv-movements-panel">
<div class="panel-head row wrap" style="gap:10px;">
  <div>
    <h3 style="margin:0;">Stock Movements &amp; Transactions <span class="badge ghost small" style="margin-left:6px; font-weight:normal;">${allGroupedMoves.length} Total Batches</span></h3>
    <span class="muted small">Complete log of warehouse deliveries, POS sales, color mixing deductions, and stock adjustments.</span>
  </div>
  <div class="spacer"></div>
  <div class="row wrap" style="gap:6px;">
    <button class="btn ghost small" onclick="goTo('reports'); if (typeof setReportTab==='function') setReportTab('previous_inventory');" title="Open Previous Inventory Reports">📋 Previous Inventory Reports &rarr;</button>
  </div>
</div>
<div id="inv-movements-content">
  ${inventoryMovementsSectionHtml()}
</div>
  </div>`;
}

function renderInventoryTable(keepPage = false) {
  const searchInput = document.getElementById('inv-search');
  if (searchInput) invSearchQuery = searchInput.value;
  const typeSelect = document.getElementById('inv-type-filter');
  if (typeSelect) invTypeFilter = typeSelect.value;
  const statusSelect = document.getElementById('inv-status-filter');
  if (statusSelect) invStatusFilter = statusSelect.value;

  if (!keepPage) {
    resetPaginationPage('inventory_products');
  }

  const tableEl = document.getElementById('inventory-table');
  if (tableEl) tableEl.innerHTML = inventoryTableHtml();
}

function clearInventorySearch() {
  invSearchQuery = '';
  const searchInput = document.getElementById('inv-search');
  if (searchInput) {
    searchInput.value = '';
    searchInput.focus();
  }
  resetPaginationPage('inventory_products');
  renderInventoryTable(true);
}

function resetInventoryFilters() {
  invSearchQuery = '';
  invTypeFilter = '';
  invStatusFilter = '';
  const sInput = document.getElementById('inv-search');
  if (sInput) sInput.value = '';
  const tSelect = document.getElementById('inv-type-filter');
  if (tSelect) tSelect.value = '';
  const stSelect = document.getElementById('inv-status-filter');
  if (stSelect) stSelect.value = '';
  resetPaginationPage('inventory_products');
  renderInventoryTable(true);
}

function productStatusBadgeHtml(p) {
  if (!p) return '';
  const st = (p.status || 'active').toLowerCase();
  if (st === 'inactive') {
    return `<span class="badge status-inactive small" title="Inactive: Temporarily unavailable for new transactions">⚪ Inactive</span>`;
  }
  if (st === 'discontinued') {
    return `<span class="badge status-discontinued small" title="Discontinued: Permanently retired from sales and purchasing">🟠 Discontinued</span>`;
  }
  if (st === 'active') {
    return `<span class="badge status-active small" title="Active: Available for normal operations">🟢 Active</span>`;
  }
  return '';
}

function productInventoryAlertBadgesHtml(p) {
  if (!p) return '<span class="muted">—</span>';
  if (p.status === 'inactive') {
    return `<span class="inv-alert-pill" style="background:#F3F4F6; color:#6B7280; border:1px solid #D1D5DB;"><span class="inv-alert-dot" style="background:#9CA3AF;"></span>Inactive</span>`;
  }
  if (p.status === 'discontinued') {
    return `<span class="inv-alert-pill" style="background:#FFF7ED; color:#EA580C; border:1px solid #FDBA74;"><span class="inv-alert-dot" style="background:#F97316;"></span>Discontinued</span>`;
  }
  if (p.status === 'pending_approval') {
    return `<span class="inv-alert-pill alert-pending" title="Awaiting Administrator review and approval"><span class="inv-alert-dot"></span>Pending Approval</span>`;
  }

  const sizes = (productSizes(p) || []).slice().sort((a, b) => Number(a) - Number(b));
  const alerts = [];

  sizes.forEach(s => {
    const st = productSizeStatus(p, s);
    if (st === 'out') {
      alerts.push({
        size: s,
        status: 'out',
        label: `${fmtSize(s)} – Out of Stock`,
        cssClass: 'alert-out'
      });
    } else if (st === 'low') {
      alerts.push({
        size: s,
        status: 'low',
        label: `${fmtSize(s)} – Low Stock`,
        cssClass: 'alert-low'
      });
    }
  });

  if (alerts.length > 0) {
    return `
      <div class="inv-alerts-list">
        ${alerts.map(a => `
          <span class="inv-alert-pill ${a.cssClass}" title="${fmtSize(a.size)} container: ${a.status === 'out' ? '0 units remaining in stock' : 'Stock quantity is at or below individual minimum threshold'}">
            <span class="inv-alert-dot"></span>
            ${escapeHtml(a.label)}
          </span>
        `).join('')}
      </div>
    `;
  }

  const totalStock = Number(p.stock) || 0;
  if (totalStock <= 0) {
    return `<span class="inv-alert-pill alert-out" title="All container sizes are depleted"><span class="inv-alert-dot"></span>Out of Stock</span>`;
  }

  return `<span class="inv-alert-pill alert-ok" title="All container sizes meet healthy stock levels"><span class="inv-alert-dot"></span>In Stock</span>`;
}

function filterInventory() {
  renderInventoryTable();
}

function suppliersForProduct(productId) {
  if (!productId) return [];
  return (db && Array.isArray(db.suppliers) ? db.suppliers : []).filter(s => s && Array.isArray(s.productIds) && s.productIds.includes(productId));
}

function supplierNamesForProduct(productId) {
  return suppliersForProduct(productId).map(s => (s && s.name) ? s.name : '').filter(Boolean).join(', ');
}

function supplierBadgesHtml(productId) {
  const list = suppliersForProduct(productId);
  if (!list.length) return '<span class="muted">—</span>';
  return list.map(s => `<div style="white-space:nowrap;${s.status !== 'active' ? ' opacity:.6;' : ''}">${escapeHtml(s.name)}</div>`).join('');
}

function toggleProductInventoryDetails(productId) {
  const detailRow = document.getElementById(`inv-detail-row-${productId}`);
  const toggleBtn = document.getElementById(`inv-toggle-btn-${productId}`);
  const caret = document.getElementById(`inv-caret-${productId}`);
  const parentRow = document.getElementById(`inv-prod-row-${productId}`);

  if (!detailRow) return;
  const isCurrentlyHidden = detailRow.style.display === 'none';

  if (isCurrentlyHidden) {
    detailRow.style.display = '';
    invExpandedProductIds.add(productId);
    if (toggleBtn) {
      toggleBtn.innerHTML = '▴ Close';
      toggleBtn.classList.remove('secondary');
      toggleBtn.classList.add('ghost');
    }
    if (caret) caret.textContent = '▼';
    if (parentRow) parentRow.classList.add('expanded');
  } else {
    detailRow.style.display = 'none';
    invExpandedProductIds.delete(productId);
    if (toggleBtn) {
      toggleBtn.innerHTML = '▾ Details';
      toggleBtn.classList.remove('ghost');
      toggleBtn.classList.add('secondary');
    }
    if (caret) caret.textContent = '▶';
    if (parentRow) parentRow.classList.remove('expanded');
  }
}

function openProductStockDetailsModal(productId) {
  toggleProductInventoryDetails(productId);
}

function renderPendingEditChangesList(changes) {
  if (!changes || typeof changes !== 'object') return '<span class="muted small">No specific field changes recorded.</span>';
  const items = [];
  if (changes.name) {
    items.push(`<div><b>Product Name:</b> <span class="muted"><del>${escapeHtml(changes.name.old)}</del></span> ➔ <b style="color:var(--teal);">${escapeHtml(changes.name.new)}</b></div>`);
  }
  if (changes.brand) {
    items.push(`<div><b>Brand:</b> <span class="muted"><del>${escapeHtml(changes.brand.old)}</del></span> ➔ <b style="color:var(--teal);">${escapeHtml(changes.brand.new)}</b></div>`);
  }
  if (changes.type) {
    items.push(`<div><b>Type:</b> <span class="muted"><del>${escapeHtml(changes.type.old)}</del></span> ➔ <b style="color:var(--teal);">${escapeHtml(changes.type.new)}</b></div>`);
  }
  if (changes.color) {
    items.push(`<div><b>Color:</b> <span class="muted"><del>${escapeHtml(changes.color.old)}</del></span> ➔ <b style="color:var(--teal);">${escapeHtml(changes.color.new)}</b></div>`);
  }
  if (changes.price) {
    items.push(`<div><b>Price/Liter:</b> <span class="muted"><del>${peso(changes.price.old)}</del></span> ➔ <b style="color:var(--teal); font-size:13px;">${peso(changes.price.new)}</b></div>`);
  }
  if (changes.sizes && changes.sizes.added) {
    items.push(`<div><b>New Container Size(s):</b> <b style="color:var(--teal);">${changes.sizes.added.map(s => s + 'L').join(', ')}</b></div>`);
  }
  if (changes.threshold) {
    items.push(`<div><b>Total Threshold:</b> <span class="muted"><del>${formatLiters(changes.threshold.old)}</del></span> ➔ <b style="color:var(--teal);">${formatLiters(changes.threshold.new)}</b></div>`);
  }
  if (changes.thresholdBySize) {
    items.push(`<div><b>Per-Size Thresholds:</b> <span class="badge" style="background:#EBF5FB; color:#1B4F72; font-size:11px;">Updated min units</span></div>`);
  }
  return items.map(html => `<div style="padding:6px 10px; background:#FAF8F5; border-radius:4px; border-left:3px solid var(--teal); font-size:12px;">${html}</div>`).join('');
}

function productInventoryDetailsHtml(p) {
  const hex = getProductDefaultColor(p);
  const rgb = hexToRgb(hex);
  const detected = detectMixedColorName(rgb.r, rgb.g, rgb.b);
  const canManage = currentUser && (currentUser.role === 'admin' || currentUser.role === 'staff');
  const isAuthorized = Boolean(currentUser && (currentUser.role === 'admin' || currentUser.role === 'staff'));
  const stock = Number(p.stock) || 0;
  const threshold = productTotalThresholdLiters(p) || Number(p.threshold) || 0;
  const isOutOfStock = stock <= 0;
  const lowSizes = productLowSizes(p);
  const isLowStock = !isOutOfStock && productHasLowStock(p);
  const openPOsForThis = openPOsForProduct(p.id);
  const hasOpenPO = openPOsForThis.length > 0;

  // Status info & plain-English message
  let statusClass = 'ok';
  let statusIcon = '🟢';
  let statusTitle = 'Stock is Healthy';
  let statusSubtitle = `Total ${formatLiters(stock)} available across ${productSizes(p).length} container sizes. All sizes meet their minimum limits.`;

  if (p.status === 'inactive') {
    statusClass = 'inactive';
    statusIcon = '⚪';
    statusTitle = 'Product is Inactive';
    statusSubtitle = `Deactivated by ${escapeHtml(p.deactivatedBy || 'Administrator')}${p.deactivationReason ? ` — Reason: "${escapeHtml(p.deactivationReason)}"` : ''}. Temporarily unavailable for new POS sales, stock receiving, or purchase orders.`;
  } else if (p.status === 'discontinued') {
    statusClass = 'discontinued';
    statusIcon = '🟠';
    statusTitle = 'Product is Discontinued';
    statusSubtitle = `Permanently retired from sales & purchasing${p.discontinueReason ? ` — Reason: "${escapeHtml(p.discontinueReason)}"` : ''}. Historical transactions and audit records remain accessible.`;
  } else if (p.status === 'pending_approval') {
    statusClass = 'low';
    statusIcon = '⏳';
    statusTitle = 'Pending Administrator Approval';
    statusSubtitle = `Submitted by ${escapeHtml(p.requestedBy || 'Inventory Staff')}. Requires Administrator approval before becoming active in POS.`;
  } else if (isOutOfStock) {
    statusClass = 'out';
    statusIcon = '🔴';
    statusTitle = 'Out of Stock';
    statusSubtitle = 'All sealed containers are depleted. Restocking is required immediately.';
  } else if (isLowStock) {
    statusClass = 'low';
    statusIcon = '🟡';
    statusTitle = 'Running Low on Stock';
    statusSubtitle = lowSizes.length > 0
      ? `Attention needed: ${lowSizes.length} container size${lowSizes.length === 1 ? '' : 's'} reached or fell below minimum threshold.`
      : `Current total stock (${formatLiters(stock)}) is below the overall threshold (${formatLiters(threshold)}).`;
  }

  // Stock Alert Indicators for affected container sizes (Requirement 1: each affected size has its own readable status indicator)
  let stockAlertIndicatorsHtml = '';
  if (lowSizes.length > 0) {
    stockAlertIndicatorsHtml = lowSizes.map(s => {
      const count = productCanCount(p, s);
      const thresh = productSizeThreshold(p, s);
      const st = productSizeStatus(p, s);
      const isOut = st === 'out' || count === 0;
      const chipClass = isOut ? 'chip-out' : 'chip-low';
      const statusLabel = isOut ? 'Out of Stock' : 'Low Stock';
      const canWord = thresh === 1 ? 'unit' : 'units';
      return `
        <div class="inv-alert-chip ${chipClass}">
          <span class="inv-alert-chip-icon">${isOut ? '⛔' : '⚠️'}</span>
          <span class="inv-alert-chip-size">${fmtSize(s)}</span>
          <span class="inv-alert-chip-sep">–</span>
          <span class="inv-alert-chip-counts"><b>${count}/${thresh}</b> ${canWord}</span>
          <span class="inv-alert-chip-sep">–</span>
          <span class="inv-alert-chip-badge">${statusLabel}</span>
        </div>
      `;
    }).join('');
  }

  // 1. Sealed Cans Rows (Requirement 2: separate row for every size, Size ID, Container Size, Price per Can, Stock Quantity, Total Volume, Stock Level)
  const sortedSizes = (productSizes(p) || []).slice().sort((a, b) => Number(a) - Number(b));
  const canRowsHtml = sortedSizes.map(s => {
    const variant = productSizeVariantBySize(p, s);
    const sizeId = variant ? variant.sizeId : '';
    const count = productCanCount(p, s);
    const sizeThresh = productSizeThreshold(p, s);
    const totalLitersForSize = count * s;
    const threshLitersForSize = sizeThresh * s;
    const canWord = sizeThresh === 1 ? 'unit' : 'units';
    const status = productSizeStatus(p, s);
    const pricePerCan = variant && variant.pricePerCan != null ? Number(variant.pricePerCan) : (Number(p.price) * s);

    const icon = s <= 1 ? '🧴' : (s <= 4 ? '🪣' : '🛢️');
    const unitLabel = s <= 1 ? 'Can' : (s <= 4 ? 'Gallon' : 'Drum');
    const targetScale = Math.max(sizeThresh * 2, 2);
    const fillPct = Math.min(100, Math.max(count > 0 ? 8 : 0, Math.round((count / targetScale) * 100)));

    let rowStatusClass = '';
    let barColor = '#10B981'; // Green for Good
    let statusText = 'Good';

    if (status === 'out') {
      rowStatusClass = 'row-out';
      barColor = '#EF4444'; // Red for Out
      statusText = 'Out of Stock';
    } else if (status === 'low') {
      rowStatusClass = 'row-low';
      barColor = '#F59E0B'; // Amber for Low
      statusText = 'Low Stock';
    }

    const titleText = `${fmtSize(s)} ${unitLabel}: ${count} in stock, minimum ${sizeThresh} ${canWord} (${formatLiters(threshLitersForSize)})`;

    return `
      <tr class="${rowStatusClass}" title="${escapeHtml(titleText)}">
        <td class="inv-td-size" style="text-align:left;">
          <div class="inv-can-cell-size">
            <span class="inv-can-row-icon">${icon}</span>
            <span class="inv-can-row-name">${fmtSize(s)} ${unitLabel}</span>
          </div>
        </td>
        <td class="inv-td-price" style="text-align:right;">
          <span class="inv-price-val">${peso(pricePerCan)}</span>
        </td>
        <td class="inv-td-qty" style="text-align:right;">
          <span class="inv-can-qty-pill ${status === 'out' ? 'is-out' : (status === 'low' ? 'is-low' : '')}">
            <strong>${count}</strong> <small>${count === 1 ? 'unit' : 'units'}</small>
          </span>
        </td>
        <td class="inv-td-vol" style="text-align:right;">
          <span class="inv-can-vol-pill">${formatLiters(totalLitersForSize)}</span>
        </td>
        <td class="inv-td-level" style="text-align:left;">
          <div class="inv-level-block">
            <div class="inv-level-meta">
              <span class="inv-can-status-badge status-${status}">
                <span class="inv-status-dot"></span>
                ${statusText}
              </span>
              <span class="inv-level-threshold" title="Minimum threshold for this container size">Minimum: <b>${sizeThresh}</b> ${canWord}</span>
            </div>
            <div class="inv-can-row-bar-wrap" title="${fillPct}% stock level (${count}/${sizeThresh} units)">
              <div class="inv-can-row-bar-fill" style="width:${status === 'out' ? '0%' : fillPct + '%'}; background:${barColor};"></div>
            </div>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // 2. Opened Cans Section (Requirement 3: separate opened tracking, individual display, compact empty state)
  const openedEntries = productOpenedEntries(p);
  let openedStockHtml = '';
  if (openedEntries.length) {
    openedStockHtml = `
      <div class="inv-opened-list">
        ${openedEntries.map(e => {
      const pctUsed = Math.min(100, Math.round((e.used / e.size) * 100));
      const pctLeft = Math.max(0, 100 - pctUsed);
      const unitLabel = e.size <= 1 ? 'Can' : (e.size <= 4 ? 'Gallon' : 'Drum');
      return `
            <div class="inv-opened-card">
              <div class="inv-opened-card-top">
                <div class="inv-opened-card-title">
                  <span class="inv-opened-card-icon">🫙</span>
                  <strong>${fmtSize(e.size)} ${unitLabel} Opened</strong>
                  <span class="inv-opened-status-badge">Active for Mixing</span>
                </div>
                <div class="inv-opened-card-vol">
                  <strong>${formatLiters(e.left)}</strong> left <span class="muted">(${pctLeft}%)</span>
                </div>
              </div>
              <div class="inv-opened-bar-wrap">
                <div class="inv-opened-bar-fill" style="width:${pctLeft}%;"></div>
              </div>
              <div class="inv-opened-card-sub">
                <span>Used: <b>${formatLiters(e.used)}</b> (${pctUsed}%)</span>
                <span>Original Container: <b>${fmtSize(e.size)}</b></span>
              </div>
            </div>
          `;
    }).join('')}
        <div class="inv-opened-hint">
          <span>💡</span>
          <span>Color mixing automatically draws from this opened container first so no paint is wasted.</span>
        </div>
      </div>
    `;
  } else {
    openedStockHtml = `
      <div class="inv-opened-empty-compact">
        <span class="inv-opened-empty-icon">✨</span>
        <div class="inv-opened-empty-text">
          <strong>No opened containers (0.00 L)</strong> — All current stock is factory sealed. Color mixing will automatically draw from and track the first opened container.
        </div>
      </div>
    `;
  }

  // 3. Quick Price Reference (Requirement 4: cleanly distinguish Price per Liter from Price per Container, no duplicate info)
  const hasRecentPrice = p.recentPrice != null && Number(p.recentPrice) > 0 && Math.abs(Number(p.recentPrice) - Number(p.price)) > 0.01;

  // 4. Product Movement History for this item (Requirement 5: improved readability, spacing, View All)
  const allMoves = getProductStockMovements(p.id);
  const isAllMovesExpanded = invExpandedMovementsProductIds.has(p.id);
  const movesCount = allMoves.length;
  const movesCountText = movesCount > 0
    ? (isAllMovesExpanded ? `All ${movesCount} transactions` : `Latest ${Math.min(5, movesCount)} of ${movesCount} transaction${movesCount === 1 ? '' : 's'}`)
    : 'No transactions recorded yet';

  return `
    <div class="inv-friendly-detail">
      <!-- Friendly Status Banner & Quick Actions -->
      <div class="inv-friendly-banner ${statusClass}">
        <div class="inv-friendly-banner-top">
          <div class="inv-friendly-banner-info">
            <span class="inv-banner-dot">${statusIcon}</span>
            <div>
              <div class="inv-banner-title">${statusTitle}</div>
              <div class="inv-banner-sub">${statusSubtitle}</div>
            </div>
          </div>
          ${p.status === 'pending_approval' && currentUser && currentUser.role === 'admin' ? `
            <div class="inv-friendly-actions">
              <button type="button" class="btn small inv-action-btn" style="background:#1F6F6B; color:#fff;" onclick="event.stopPropagation(); approvePendingProduct('${p.id}')">✓ Approve Product</button>
              <button type="button" class="btn secondary small danger inv-action-btn" onclick="event.stopPropagation(); rejectPendingProduct('${p.id}')">✕ Reject Product</button>
            </div>
          ` : ''}
        </div>

        ${stockAlertIndicatorsHtml ? `
          <div class="inv-alert-chips-wrap">
            <span class="inv-alert-chips-label">Stock Alerts:</span>
            ${stockAlertIndicatorsHtml}
          </div>
        ` : ''}

        ${hasOpenPO ? `
          <div class="inv-alert-po-note">
            🚚 <span>Active Purchase Order <b>${openPOsForThis.map(o => o.poNumber).join(', ')}</b> in progress (${poStatusBadgeText(openPOsForThis[0].status)}). Restock delivery pending.</span>
          </div>
        ` : ''}
      </div>

      ${p.pendingEdit ? `
        <div style="background:#FEF3C7; border:1px solid #FCD34D; border-radius:var(--radius-sm); padding:12px 14px; margin-bottom:4px;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:8px;">
            <div>
              <div style="font-weight:700; color:#92400E; font-size:13.5px; display:flex; align-items:center; gap:6px;">
                <span>⏳</span>
                <span>Product Edit Request Pending Admin Approval</span>
              </div>
              <div class="muted small" style="margin-top:2px;">
                Submitted by <b>${escapeHtml(p.pendingEdit.requestedBy || 'Inventory Staff')}</b> on ${formatDateTime(p.pendingEdit.requestedAt || nowISO())}
              </div>
            </div>
            ${currentUser && currentUser.role === 'admin' ? `
              <div style="display:flex; gap:6px;">
                <button type="button" class="btn small" style="background:#1F6F6B; color:#fff; padding:5px 12px;" onclick="event.stopPropagation(); approveProductPendingEdits('${p.id}')">✓ Approve All Edits</button>
                <button type="button" class="btn secondary small danger" style="padding:5px 10px;" onclick="event.stopPropagation(); rejectProductPendingEdits('${p.id}')">✕ Reject</button>
              </div>
            ` : `
              <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
                <span class="badge" style="background:#FFF; color:#92400E; border:1px solid #FCD34D;">⏳ Waiting for Admin Approval</span>
                ${currentUser && currentUser.role === 'staff' ? `
                  <button type="button" class="btn secondary small" style="padding:4px 9px; font-size:11.5px;" onclick="event.stopPropagation(); openProductModal('${p.id}')" title="Modify your pending request">✏️ Modify</button>
                  <button type="button" class="btn secondary small danger" style="padding:4px 9px; font-size:11.5px;" onclick="event.stopPropagation(); cancelProductPendingEdit('${p.id}')" title="Cancel/withdraw your pending edit request">✕ Cancel Request</button>
                ` : ''}
              </div>
            `}
          </div>
          <div style="background:#fff; border:1px solid #FDE68A; border-radius:6px; padding:10px 12px; margin-top:8px;">
            <div style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; color:var(--ink-soft); margin-bottom:6px;">Proposed Changes:</div>
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:6px;">
              ${renderPendingEditChangesList(p.pendingEdit.changes || {})}
            </div>
          </div>
        </div>
      ` : ''}

      ${!p.pendingEdit && p.pendingSizes && p.pendingSizes.length > 0 ? `
        <div style="background:#FEF3C7; border:1px solid #FCD34D; border-radius:var(--radius-sm); padding:10px 14px; margin-bottom:4px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <div>
            <span style="font-weight:700; color:#92400E;">⏳ New Container Size(s) Pending Admin Approval:</span>
            <span style="margin-left:6px; font-weight:600;">${p.pendingSizes.map(s => s + 'L').join(', ')}</span>
          </div>
          ${currentUser && currentUser.role === 'admin' ? `
            <div style="display:flex; gap:6px;">
              <button type="button" class="btn small" style="padding:4px 10px;" onclick="event.stopPropagation(); approvePendingProductSizes('${p.id}')">✓ Approve Size(s)</button>
              <button type="button" class="btn secondary small danger" style="padding:4px 8px;" onclick="event.stopPropagation(); rejectPendingProductSizes('${p.id}')">✕ Reject</button>
            </div>
          ` : '<span class="muted small">Waiting for Admin approval</span>'}
        </div>
      ` : ''}

      ${!p.pendingEdit && p.pendingPrice != null && Number(p.pendingPrice) > 0 ? `
        <div style="background:#FEF3C7; border:1px solid #FCD34D; border-radius:var(--radius-sm); padding:10px 14px; margin-bottom:4px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <div>
            <span style="font-weight:700; color:#92400E;">⏳ Price Change Pending Admin Approval:</span>
            <span style="margin-left:6px; font-weight:600;">Current: ${peso(p.price)}/L ➔ Requested: <b style="color:var(--teal); font-size:13.5px;">${peso(p.pendingPrice)}/L</b></span>
          </div>
          ${currentUser && currentUser.role === 'admin' ? `
            <div style="display:flex; gap:6px;">
              <button type="button" class="btn small" style="padding:4px 10px;" onclick="event.stopPropagation(); approvePendingProductPrice('${p.id}')">✓ Approve Price</button>
              <button type="button" class="btn secondary small danger" style="padding:4px 8px;" onclick="event.stopPropagation(); rejectPendingProductPrice('${p.id}')">✕ Reject</button>
            </div>
          ` : '<span class="muted small">Waiting for Admin approval</span>'}
        </div>
      ` : ''}

      <!-- 2-Column Responsive Grid -->
      <div class="inv-friendly-grid">
        <!-- 1. Sealed Containers -->
        <div class="inv-friendly-box">
          <div class="inv-box-header">
            <span class="inv-box-title">📦 Ready-to-Sell Sealed Containers</span>
            <span class="inv-box-meta">Total Sealed: <b>${formatLiters(stock)}</b></span>
          </div>
          ${sortedSizes.length ? `
            <div class="inv-can-table-wrap">
              <table class="inv-can-table">
                <thead>
                  <tr>
                    <th class="inv-th-size">Container Size</th>
                    <th class="inv-th-price">Price / Unit</th>
                    <th class="inv-th-qty">Stock Quantity</th>
                    <th class="inv-th-vol">Total Volume</th>
                    <th class="inv-th-level">Stock Level</th>
                  </tr>
                </thead>
                <tbody>
                  ${canRowsHtml}
                </tbody>
              </table>
            </div>
          ` : `
            <div class="inv-can-empty-sizes">
              No container sizes configured for this product.
            </div>
          `}
        </div>

        <!-- 2. Opened Stock & Price Reference -->
        <div class="inv-friendly-box">
          <div class="inv-box-header">
            <span class="inv-box-title">🫙 Opened Containers &amp; Mixing</span>
            <span class="inv-box-meta">${openedEntries.length ? `${openedEntries.length} active unit${openedEntries.length === 1 ? '' : 's'}` : '0.00 L opened'}</span>
          </div>
          <div class="inv-opened-section">
            ${openedStockHtml}
          </div>

          <div class="inv-pricing-section">
            <div class="inv-box-header" style="padding-bottom:6px; margin-bottom:8px; border-bottom:none;">
              <span class="inv-box-title">💵 Quick Price Reference</span>
            </div>

            <!-- Price Per Liter (Base Rate) -->
            <div class="inv-price-rate-block">
              <div class="inv-price-rate-label">Price per Liter (Base Rate)</div>
              <div class="inv-price-rate-value">
                <span class="inv-rate-amount">${peso(p.price)}</span>
                <span class="inv-rate-unit">/ L</span>
                ${hasRecentPrice ? `
                  <span class="inv-rate-prev" title="Price prior to latest adjustment">(Previous: <del>${peso(p.recentPrice)}</del>)</span>
                ` : ''}
              </div>
            </div>

            <!-- Price Per Container -->
            <div>
              <div class="inv-price-containers-label">Price per Container (By Size)</div>
              <div class="inv-price-containers-grid">
                ${sortedSizes.map(s => {
    const variant = productSizeVariantBySize(p, s);
    const pricePerCan = variant && variant.pricePerCan != null ? Number(variant.pricePerCan) : (Number(p.price) * s);
    const sizeId = variant ? variant.sizeId : '';
    const unitLabel = s <= 1 ? 'Can' : (s <= 4 ? 'Gallon' : 'Drum');
    return `
                    <div class="inv-price-card">
                      <div class="inv-price-card-size">
                        <span>${fmtSize(s)} ${unitLabel}</span>
                      </div>
                      <div class="inv-price-card-amt">${peso(pricePerCan)}</div>
                    </div>
                  `;
  }).join('')}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 3. Recent Stock Activity for this Product -->
      <div class="inv-friendly-box inv-activity-box">
        <div class="inv-box-header">
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="inv-box-title">🔄 Recent Stock Activity</span>
            <span class="badge ghost small" style="font-weight:normal;">${movesCountText}</span>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            ${movesCount > 5 ? `
              <button type="button" class="btn ghost small" style="padding:2px 8px; font-size:11px; height:24px;" onclick="event.stopPropagation(); toggleProductMovementHistoryExpanded('${p.id}')">
                ${isAllMovesExpanded ? '▴ Show Latest 5' : `▾ View All (${movesCount})`}
              </button>
            ` : ''}
          </div>
        </div>
        <div class="inv-product-movements-wrap">
          ${productMovementHistoryHtml(p, isAllMovesExpanded)}
        </div>
      </div>
    </div>
  `;
}

function getProductStockMovements(productId) {
  if (!db || !Array.isArray(db.movements)) return [];
  const prod = productById(productId);
  const pName = prod ? String(prod.name || '').trim().toLowerCase() : '';
  const pColor = prod && prod.color && prod.color !== '-' ? String(prod.color).trim().toLowerCase() : '';

  const filtered = db.movements.filter(m => {
    const mPid = m.productId || m.product_id;
    if (mPid && String(mPid) === String(productId)) return true;
    if (!mPid && pName && m.productName) {
      const mn = String(m.productName || '').trim().toLowerCase();
      if (mn === pName || mn.startsWith(pName)) {
        if (!pColor) return true;
        const note = String(m.note || '').toLowerCase();
        return mn.includes(pColor) || note.includes(pColor);
      }
    }
    return false;
  });

  return groupStockMovements(filtered);
}

function toggleProductMovementHistoryExpanded(productId) {
  if (invExpandedMovementsProductIds.has(productId)) {
    invExpandedMovementsProductIds.delete(productId);
  } else {
    invExpandedMovementsProductIds.add(productId);
  }
  const detailRow = document.getElementById(`inv-detail-row-${productId}`);
  if (detailRow) {
    const p = productById(productId);
    if (p) {
      const td = detailRow.querySelector('td');
      if (td) td.innerHTML = productInventoryDetailsHtml(p);
    }
  }
}

function productMovementHistoryHtml(p, isAllExpanded = false) {
  const allMoves = getProductStockMovements(p.id);
  const moves = isAllExpanded ? allMoves : allMoves.slice(0, 5);
  const isAuthorized = Boolean(currentUser && (currentUser.role === 'admin' || currentUser.role === 'staff'));

  if (!moves.length) {
    return `
      <div class="inv-movements-empty">
        <span style="font-size:20px; display:block; margin-bottom:3px;">📋</span>
        <div style="font-weight:600; color:var(--ink); font-size:12.5px;">No stock movements recorded yet for this product.</div>
        <div style="margin-top:2px; opacity:0.85; font-size:11.5px;">Purchases/deliveries, POS sales, color mixing, and inventory adjustments will automatically appear here.</div>
      </div>
    `;
  }

  const rowsHtml = moves.map(m => {
    const lines = m.lines || [];
    const isBatch = lines.length > 1;

    let itemsTdHtml = '';
    if (isBatch) {
      itemsTdHtml = `
        <td colspan="2" class="movement-batch-items-td" style="padding:6px 10px !important;">
          <div class="movement-items-list" style="gap:4px;">
            ${lines.map(l => {
        const sizeLabel = l.size
          ? `${fmtSize(l.size)} ${l.size <= 1 ? 'Can' : (l.size <= 4 ? 'Gallon' : 'Drum')}`
          : (l.openedLiters > 0 ? `🫙 Opened Container (${fmtSize(l.openedCanSize || 1)})` : 'Product Stock');
        return `
                <div class="movement-item-paired-row" style="padding:4px 8px;">
                  <div class="movement-item-left">
                    <span class="movement-item-name" style="font-weight:600; font-size:12px; display:inline-flex; align-items:center; gap:4px;">${escapeHtml(sizeLabel)}</span>
                    ${l.balanceTrail ? `<div class="movement-balance-trail" style="font-size:11px;"><span class="trail-icon">📦</span> ${escapeHtml(l.balanceTrail)}</div>` : ''}
                  </div>
                  <span class="movement-item-delta">${movementLineDeltaBadge(l)}</span>
                </div>
              `;
      }).join('')}
          </div>
        </td>
      `;
    } else {
      const singleLine = lines[0] || { label: movementProductLabel(m), qty: m.qtyChange };
      const sizeLabel = singleLine.size
        ? `${fmtSize(singleLine.size)} ${singleLine.size <= 1 ? 'Can' : (singleLine.size <= 4 ? 'Gallon' : 'Drum')}`
        : (singleLine.openedLiters > 0 ? `🫙 Opened Container (${fmtSize(singleLine.openedCanSize || 1)})` : 'Product Stock');
      itemsTdHtml = `
        <td class="movement-product-td" style="font-size:12px; padding:10px 12px;">
          <div style="font-weight:600; color:var(--ink); display:inline-flex; align-items:center; gap:4px;">${escapeHtml(sizeLabel)}</div>
          ${singleLine.balanceTrail ? `<div class="movement-balance-trail" style="font-size:11px; margin-top:3px;"><span class="trail-icon">📦</span> ${escapeHtml(singleLine.balanceTrail)}</div>` : ''}
        </td>
        <td class="right movement-qty-td" style="font-size:12px; padding:10px 12px;">
          ${movementLineDeltaBadge(singleLine)}
        </td>
      `;
    }

    return `
      <tr class="movement-row ${isBatch ? 'movement-row-batch' : ''}">
        <td class="movement-date-td" style="font-size:12px; padding:10px 12px;">${formatDateTimeStacked(m.date)}</td>
        <td class="movement-type-td" style="font-size:12px; padding:10px 12px;">${movementTypeBadge(m.type)}</td>
        ${itemsTdHtml}
        <td class="movement-staff-td" style="font-size:12px; padding:10px 12px;">${staffLabelStacked(m.staffName)}</td>
        <td class="movement-note-td" style="font-size:12px; padding:10px 12px;">${movementNoteFormatted(m)}</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="inv-movement-table-wrap">
      <table class="movement-table tight" style="margin:0; width:100%; border-collapse:collapse;">
        <thead>
          <tr style="background:#FAF8F5; border-bottom:1px solid var(--line);">
            <th class="movement-date-td" style="font-size:10.5px; padding:8px 12px; text-transform:uppercase; letter-spacing:0.04em; color:var(--ink-soft); font-weight:700;">Date &amp; Time</th>
            <th class="movement-type-td" style="font-size:10.5px; padding:8px 12px; text-transform:uppercase; letter-spacing:0.04em; color:var(--ink-soft); font-weight:700;">Type</th>
            <th style="font-size:10.5px; padding:8px 12px; text-transform:uppercase; letter-spacing:0.04em; color:var(--ink-soft); font-weight:700; text-align:left;">Container Size / Item</th>
            <th class="right movement-qty-td" style="font-size:10.5px; padding:8px 12px; text-transform:uppercase; letter-spacing:0.04em; color:var(--ink-soft); font-weight:700;">Qty Change</th>
            <th class="movement-staff-td" style="font-size:10.5px; padding:8px 12px; text-transform:uppercase; letter-spacing:0.04em; color:var(--ink-soft); font-weight:700;">Staff / User</th>
            <th style="font-size:10.5px; padding:8px 12px; text-transform:uppercase; letter-spacing:0.04em; color:var(--ink-soft); font-weight:700; text-align:left;">Reference &amp; Details</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>
  `;
}

function getProductSearchableText(p) {
  if (!p || typeof p !== 'object') return '';

  const parts = [];

  // 0. Product ID and Size IDs
  if (p.productId != null) parts.push(String(p.productId));
  if (p.product_id != null) parts.push(String(p.product_id));
  if (p.id != null) parts.push(String(p.id));
  (p.sizesData || []).forEach(v => {
    if (v && v.sizeId) parts.push(String(v.sizeId));
  });

  // 1. Product Name
  if (p.name != null) parts.push(String(p.name));

  // 2. Brand
  if (p.brand != null) parts.push(String(p.brand));

  // 3. Supplier(s)
  if (typeof supplierNamesForProduct === 'function') {
    const sNames = supplierNamesForProduct(p.id);
    if (sNames) parts.push(sNames);
  }
  if (typeof p.supplier === 'string' && p.supplier) parts.push(p.supplier);
  if (p.supplier && typeof p.supplier === 'object' && p.supplier.name) parts.push(String(p.supplier.name));
  if (typeof p.supplierName === 'string' && p.supplierName) parts.push(p.supplierName);
  if (typeof p.supplier_name === 'string' && p.supplier_name) parts.push(p.supplier_name);

  // 4. Product Type / Category
  if (p.type != null) parts.push(String(p.type));
  if (p.category != null) parts.push(String(p.category));

  // 5. Color Name
  if (p.color != null && p.color !== '-') parts.push(String(p.color));
  if (p.colorName != null) parts.push(String(p.colorName));
  if (p.color_name != null) parts.push(String(p.color_name));

  // 6. Color Hex Code (e.g. #1F6F6B) & Detected / Related Color Name
  let hex = '';
  try {
    if (typeof getProductDefaultColor === 'function') {
      hex = getProductDefaultColor(p);
    } else if (typeof getProductHex === 'function') {
      hex = getProductHex(p);
    }
  } catch (e) {
    hex = '';
  }
  if (!hex && p.color && typeof p.color === 'string' && p.color.startsWith('#')) {
    hex = p.color;
  }
  if (!hex && p.hex) hex = String(p.hex);
  if (!hex && p.colorHex) hex = String(p.colorHex);
  if (!hex && p.color_hex) hex = String(p.color_hex);

  if (hex) {
    parts.push(hex);
    if (hex.startsWith('#')) {
      parts.push(hex.substring(1));
    }

    try {
      if (typeof hexToRgb === 'function' && typeof detectMixedColorName === 'function') {
        const rgb = hexToRgb(hex);
        if (rgb) {
          const detected = detectMixedColorName(rgb.r, rgb.g, rgb.b);
          if (detected && detected.name) {
            parts.push(detected.name);
          }
        }
      }
    } catch (e) {
      // ignore
    }
  }

  return parts.join(' ').toLowerCase();
}

function inventoryTableHtml() {
  const canManage = currentUser && (currentUser.role === 'admin' || currentUser.role === 'staff');
  const isAuthorized = Boolean(currentUser && (currentUser.role === 'admin' || currentUser.role === 'staff'));
  const searchInput = document.getElementById('inv-search');
  const rawQ = searchInput ? searchInput.value : (invSearchQuery || '');
  invSearchQuery = rawQ;
  const q = String(rawQ || '').trim().toLowerCase();

  const typeFilterEl = document.getElementById('inv-type-filter');
  const typeFilter = typeFilterEl ? typeFilterEl.value : (invTypeFilter || '');
  invTypeFilter = typeFilter;

  const statusFilterEl = document.getElementById('inv-status-filter');
  const statusFilter = statusFilterEl ? statusFilterEl.value : (invStatusFilter || '');
  invStatusFilter = statusFilter;

  let list = (db && Array.isArray(db.products)) ? [...db.products] : [];
  list = list.filter(p => p && (p.type || '').toLowerCase() !== 'accessory');

  // Search filter (real-time, multi-keyword partial matching, case-insensitive, AND logic)
  if (q) {
    const keywords = q
      .split(/\s+/)
      .map(k => k.trim().replace(/^[,;]+|[,;]+$/g, ''))
      .filter(Boolean);
    if (keywords.length > 0) {
      list = list.filter(p => {
        const text = getProductSearchableText(p);
        return keywords.every(kw => text.includes(kw));
      });
    }
  }

  // Type / Category filter
  if (typeFilter) {
    list = list.filter(p => p && ((p.type && p.type === typeFilter) || (p.category && p.category === typeFilter)));
  }

  // Status / Stock filter
  if (statusFilter === 'active') {
    list = list.filter(p => p && (p.status === 'active' || !p.status));
  } else if (statusFilter === 'inactive') {
    list = list.filter(p => p && p.status === 'inactive');
  } else if (statusFilter === 'discontinued') {
    list = list.filter(p => p && p.status === 'discontinued');
  } else if (statusFilter === 'in') {
    list = list.filter(p => p && p.status === 'active' && !productHasLowStock(p) && (Number(p.stock) || 0) > 0);
  } else if (statusFilter === 'low') {
    list = list.filter(p => p && p.status === 'active' && productHasLowStock(p) && (Number(p.stock) || 0) > 0);
  } else if (statusFilter === 'out') {
    list = list.filter(p => p && p.status === 'active' && (Number(p.stock) || 0) <= 0);
  } else if (statusFilter === 'pending') {
    list = list.filter(p => p && (p.status === 'pending_approval' || Boolean(p.pendingEdit) || (p.pendingSizes && p.pendingSizes.length > 0) || (p.pendingPrice != null && Number(p.pendingPrice) > 0)));
  }

  // Sorting
  list = [...list].sort((a, b) => {
    let valA, valB;
    if (invSortField === 'name') {
      valA = (a && a.name ? String(a.name) : '').toLowerCase();
      valB = (b && b.name ? String(b.name) : '').toLowerCase();
    } else if (invSortField === 'brand') {
      valA = (a && a.brand ? String(a.brand) : '').toLowerCase();
      valB = (b && b.brand ? String(b.brand) : '').toLowerCase();
    } else if (invSortField === 'type') {
      valA = (a && (a.type || a.category) ? String(a.type || a.category) : '').toLowerCase();
      valB = (b && (b.type || b.category) ? String(b.type || b.category) : '').toLowerCase();
    } else if (invSortField === 'supplier') {
      valA = supplierNamesForProduct(a ? a.id : '').toLowerCase();
      valB = supplierNamesForProduct(b ? b.id : '').toLowerCase();
    } else if (invSortField === 'price') {
      valA = Number(a ? a.price : 0) || 0;
      valB = Number(b ? b.price : 0) || 0;
    } else if (invSortField === 'stock') {
      valA = Number(a ? a.stock : 0) || 0;
      valB = Number(b ? b.stock : 0) || 0;
    } else if (invSortField === 'openedStock') {
      valA = a ? productOpenedStock(a) : 0;
      valB = b ? productOpenedStock(b) : 0;
    } else if (invSortField === 'threshold') {
      valA = a ? (productTotalThresholdLiters(a) || Number(a.threshold) || 0) : 0;
      valB = b ? (productTotalThresholdLiters(b) || Number(b.threshold) || 0) : 0;
    } else if (invSortField === 'status') {
      const getStatusRank = p => {
        if (!p) return 0;
        const s = Number(p.stock) || 0;
        if (s <= 0) return 0;
        if (productHasLowStock(p)) return 1;
        return 2;
      };
      valA = getStatusRank(a);
      valB = getStatusRank(b);
    } else {
      valA = (a && a.name ? String(a.name) : '').toLowerCase();
      valB = (b && b.name ? String(b.name) : '').toLowerCase();
    }

    if (valA < valB) return invSortAsc ? -1 : 1;
    if (valA > valB) return invSortAsc ? 1 : -1;
    return 0;
  });

  const sortIcon = (field) => {
    if (invSortField !== field) return `<span class="sort-icon">⇅</span>`;
    return `<span class="sort-icon active">${invSortAsc ? '▲' : '▼'}</span>`;
  };

  const thSort = (field, label, extraClass = '') => `
<th class="sortable-th ${extraClass} ${invSortField === field ? 'sorted' : ''}" onclick="setInventorySort('${field}')" title="Click to sort by ${label} (${invSortField === field && invSortAsc ? 'ascending' : 'descending'})">
  <div class="th-content ${extraClass === 'right' ? 'right' : ''}">
    <span>${label}</span>
    ${sortIcon(field)}
  </div>
</th>
  `;

  const pag = paginateArray(list, 'inventory_products', {
    onUpdate: () => renderInventoryTable(true),
    scrollTarget: '#inv-products-panel',
    recordLabel: 'products'
  });
  const pagedList = pag.pagedItems;

  return `
  ${(statusFilter === 'low' || statusFilter === 'out') ? `
    <div class="alert-banner warning" style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; margin:12px 16px;">
      <div>
        <span>⚠️ <b>Low-Stock View:</b> ${list.length} product(s) currently low or out of stock.</span>
      </div>
      <div>
        <button class="btn small" style="background:#1F6F6B; color:#fff;" onclick="goTo('alerts')">
          ⚠️ View in Low-Stock Alerts &rarr;
        </button>
      </div>
    </div>
  ` : ''}
  <table class="inv-main-table">
<thead>
  <tr>
    ${thSort('name', 'Product & Color')}
    ${thSort('brand', 'Brand')}
    ${thSort('supplier', 'Supplier')}
    ${thSort('type', 'Type')}
    ${thSort('price', 'Price / Liter', 'right')}
    ${thSort('stock', 'Total Stock', 'right')}
    ${thSort('status', 'Stock Alerts', 'center')}
    <th class="center" style="width:165px;">Actions</th>
  </tr>
</thead>
<tbody>
  ${pagedList.length ? pagedList.map(p => {
    const hex = getProductDefaultColor(p);
    const rgb = hexToRgb(hex);
    const rgbaBg = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.08)`;
    const detected = detectMixedColorName(rgb.r, rgb.g, rgb.b);
    const isExpanded = invExpandedProductIds.has(p.id);
    const isLow = productHasLowStock(p);
    const lowSizes = productLowSizes(p);
    const openPOs = openPOsForProduct(p.id);
    const hasOpenOrder = openPOs.length > 0;
    const sizes = (productSizes(p) || []).slice().sort((a, b) => Number(a) - Number(b));

    return `
    <tr id="inv-prod-row-${p.id}" class="inv-prod-row ${isExpanded ? 'expanded' : ''}" onclick="toggleProductInventoryDetails('${p.id}')" style="cursor:pointer; --prod-color: ${hex}; --prod-color-alpha: ${rgbaBg};" title="Click anywhere on row or 'Details' to view individual container sizes, opened stock &amp; status">
      <td class="inv-td-product">
        <div class="inv-prod-title-wrap">
          <span class="inv-expand-caret" id="inv-caret-${p.id}">${isExpanded ? '▼' : '▶'}</span>
          <span class="hover-color-swatch inv-swatch-circle" style="background:${hex};" title="Color tone: ${escapeHtml(detected.name)} (${hex})"></span>
          <span class="inv-prod-name">${escapeHtml(p.name)}</span>
          ${productStatusBadgeHtml(p)}
          ${p.status === 'pending_approval' ? `<span class="badge warning small">⏳ Pending Approval</span>` : ''}
          ${p.pendingEdit ? `<span class="badge warning small" title="Edits submitted for Admin approval">⏳ Pending Edits (${Object.keys(p.pendingEdit.changes || {}).length})</span>` : ''}
          ${!p.pendingEdit && p.pendingSizes && p.pendingSizes.length > 0 ? `<span class="badge warning small">⏳ Pending Size (${p.pendingSizes.map(s => s + 'L').join(', ')})</span>` : ''}
          ${!p.pendingEdit && p.pendingPrice != null && Number(p.pendingPrice) > 0 ? `<span class="badge warning small">⏳ Pending Price (${peso(p.pendingPrice)})</span>` : ''}
        </div>
        ${p.color && p.color !== '-' ? `<div class="inv-prod-color-line muted small">Color: <b>${escapeHtml(p.color)}</b> <span class="inv-color-tone">(${detected.name})</span></div>` : ''}
        ${hasOpenOrder ? `
          <div class="inv-prod-order-line">
            <a href="#" onclick="event.stopPropagation(); openPODetail('${openPOs[0].id}'); return false;" class="badge info small inv-on-order-badge" title="Active Purchase Order: ${openPOs.map(o => o.poNumber).join(', ')}">
              🚚 On Order (${openPOs[0].poNumber})
            </a>
          </div>
        ` : ''}
      </td>
      <td class="inv-td-brand">${escapeHtml(p.brand || '—')}</td>
      <td class="inv-td-supplier">${supplierBadgesHtml(p.id)}</td>
      <td class="inv-td-type"><span class="badge" style="background:#F4EFE6; color:#6B6259;">${escapeHtml(p.type || p.category || 'General')}</span></td>
      <td class="right inv-td-price">
        <div style="font-weight:600; color:var(--ink);">${peso(p.price)}<span class="muted small">/L</span></div>
        ${p.pendingEdit && p.pendingEdit.changes && p.pendingEdit.changes.price ? `<div style="font-size:11px; color:#92400E; font-weight:700; margin-top:2px;" title="Requested price awaiting Admin approval">⏳ Req: ${peso(p.pendingEdit.changes.price.new)}</div>` : (!p.pendingEdit && p.pendingPrice != null && Number(p.pendingPrice) > 0 ? `<div style="font-size:11px; color:#92400E; font-weight:700; margin-top:2px;" title="Requested price awaiting Admin approval">⏳ Req: ${peso(p.pendingPrice)}</div>` : '')}
        ${p.recentPrice != null && Number(p.recentPrice) > 0 && Math.abs(Number(p.recentPrice) - Number(p.price)) > 0.01 ? `<div class="muted small" style="font-size:11px; opacity:0.85; margin-top:2px;" title="Recent price before last change">Recent: <del>${peso(p.recentPrice)}</del></div>` : ''}
      </td>
      <td class="right inv-td-total-stock">
        <div class="inv-total-stock-num">${formatLiters(p.stock)}</div>
        <div class="inv-total-stock-sub muted small">${sizes.length} container size${sizes.length === 1 ? '' : 's'}</div>
      </td>
      <td class="inv-td-alerts">
        ${productInventoryAlertBadgesHtml(p)}
      </td>
      <td class="center inv-td-actions" style="white-space:nowrap;">
        <div class="inv-actions-group">
          ${p.status === 'pending_approval' ? `
            ${currentUser && currentUser.role === 'admin' ? `
              <button class="btn small inv-action-btn" onclick="event.stopPropagation(); approvePendingProduct('${p.id}')" title="Approve and activate product">✓ Approve</button>
              <button class="btn secondary small danger inv-action-btn" onclick="event.stopPropagation(); rejectPendingProduct('${p.id}')" title="Reject product request">✕ Reject</button>
            ` : '<span class="muted small">Waiting Admin</span>'}
          ` : ''}
          ${canManage ? `
            <button type="button" id="inv-edit-btn-${p.id}" class="btn secondary small inv-action-btn inv-edit-btn" onclick="event.stopPropagation(); openProductModal('${p.id}')" title="Edit product details">
              ✏️ Edit
            </button>
          ` : ''}
          <button id="inv-toggle-btn-${p.id}" class="btn ${isExpanded ? 'ghost' : 'secondary'} small inv-action-btn inv-toggle-btn" onclick="event.stopPropagation(); toggleProductInventoryDetails('${p.id}')" title="Expand / collapse container size breakdown, opened stock, threshold &amp; status">
            ${isExpanded ? '▴ Close' : '▾ Details'}
          </button>
        </div>
      </td>
    </tr>
    <tr id="inv-detail-row-${p.id}" class="inv-detail-row" style="${isExpanded ? '' : 'display:none;'}">
      <td colspan="8" style="padding:0 !important; border-bottom:1px solid var(--line);">
        ${productInventoryDetailsHtml(p)}
      </td>
    </tr>`;
  }).join('')
      : `<tr><td colspan="8" class="empty-state" style="text-align:center; padding:32px 16px;">No products found</td></tr>`}
</tbody>
  </table>
  ${pag.html}`;
}
