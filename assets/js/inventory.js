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
  renderInventoryTable();
}

function onInventorySortSelectChange() {
  const sortSelect = document.getElementById('inv-sort-select');
  if (!sortSelect) return;
  const [field, dir] = sortSelect.value.split('_');
  invSortField = field;
  invSortAsc = dir === 'asc';
  renderInventoryTable();
}

function filterPendingApprovalProducts() {
  const el = document.getElementById('inv-status-filter');
  if (el) {
    el.value = 'pending';
    renderInventoryTable();
  }
}

function inventoryPage() {
  const canManage = currentUser && (currentUser.role === 'admin' || currentUser.role === 'staff');
  const readOnly = currentUser && currentUser.role === 'cashier';
  const recentMoves = groupStockMovements(db.movements).slice(0, 25);
  const pendingProducts = (db.products || []).filter(p => p.status === 'pending_approval' || Boolean(p.pendingEdit) || (p.pendingSizes && p.pendingSizes.length > 0) || (p.pendingPrice != null && Number(p.pendingPrice) > 0));

  const productTypes = Array.from(new Set((db && Array.isArray(db.products) ? db.products : []).map(p => p && (p.type || p.category)).filter(t => t && String(t).toLowerCase() !== 'accessory')));

  return `
  <div class="panel">
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
      <h3>Inventory &amp; Stock Management</h3>
    </div>
    <div class="spacer"></div>
    <div class="inv-toolbar">
      <div class="inv-search-wrap">
        <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        <input id="inv-search" class="inv-input" type="text" placeholder="Search name, brand, type, color…" value="${escapeHtml(invSearchQuery)}" oninput="renderInventoryTable()" onchange="renderInventoryTable()">
      </div>
      <select id="inv-type-filter" class="inv-select inv-select-type" onchange="renderInventoryTable()">
        <option value="">All Categories</option>
        ${productTypes.map(t => `<option value="${escapeHtml(t)}" ${invTypeFilter === t ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}
      </select>
      <select id="inv-status-filter" class="inv-select inv-select-status" onchange="renderInventoryTable()">
        <option value="" ${!invStatusFilter ? 'selected' : ''}>All Status</option>
        <option value="in" ${invStatusFilter === 'in' ? 'selected' : ''}>In Stock</option>
        <option value="low" ${invStatusFilter === 'low' ? 'selected' : ''}>Low Stock</option>
        <option value="out" ${invStatusFilter === 'out' ? 'selected' : ''}>Out of Stock</option>
        <option value="pending" ${invStatusFilter === 'pending' ? 'selected' : ''}>⏳ Pending Approval</option>
      </select>
      <select id="inv-sort-select" class="inv-select inv-select-sort" onchange="onInventorySortSelectChange()">
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
      ${canManage ? `
        <button class="btn secondary small inv-btn" onclick="goTo('receiving')">📥 Stock Receiving</button>
        <button class="btn secondary small inv-btn" onclick="goToAdjustment()">⚖️ Adjust Stock</button>
        <button class="btn small inv-btn" onclick="openProductModal()">+ Add Product</button>
      ` : ''}
    </div>
  </div>
  <div style="padding:10px 18px; background:#faf7f0; border-bottom:1px solid var(--line); font-size:12px; color:var(--ink-soft); display:flex; align-items:center; gap:8px;">
    <span>ℹ️ Click any product row or "Details" to expand/collapse its sealed can sizes, opened/used stock, threshold, and status. Hover to preview pigment tone. ${readOnly ? '<b>Read-only view</b> — check stock levels and can sizes before confirming a sale.' : (canManage ? `Stock is updated via <a href="#" onclick="goTo('receiving');return false;">Stock Receiving</a> or <a href="#" onclick="goToAdjustment();return false;">Stock Adjustment</a>.` : `Order stock via <a href="#" onclick="goTo('purchaseOrders');return false;">Purchase Orders</a>; physical deliveries &amp; adjustments are logged by Inventory Staff.`)}</span>
  </div>
<div class="panel-body tight table-scroll" id="inventory-table">${inventoryTableHtml()}</div>
  </div>
  <div class="panel">
<div class="panel-head row">
  <h3>Recent Stock Movements <span class="badge ghost small" style="margin-left:6px; font-weight:normal;">Latest 25</span></h3>
  <div class="spacer"></div>
  ${canManage ? `<button class="btn ghost small" onclick="goTo('receiving')">Open Stock Receiving &rarr;</button>` : ''}
</div>
<div class="panel-body tight table-scroll">
  ${renderStockMovementsTable(recentMoves, { emptyText: 'No movements recorded yet.' })}
</div>
  </div>`;
}

function renderInventoryTable() {
  const searchInput = document.getElementById('inv-search');
  if (searchInput) invSearchQuery = searchInput.value;
  const typeSelect = document.getElementById('inv-type-filter');
  if (typeSelect) invTypeFilter = typeSelect.value;
  const statusSelect = document.getElementById('inv-status-filter');
  if (statusSelect) invStatusFilter = statusSelect.value;

  const tableEl = document.getElementById('inventory-table');
  if (tableEl) tableEl.innerHTML = inventoryTableHtml();
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
    items.push(`<div><b>New Can Size(s):</b> <b style="color:var(--teal);">${changes.sizes.added.map(s => s + 'L').join(', ')}</b></div>`);
  }
  if (changes.threshold) {
    items.push(`<div><b>Total Threshold:</b> <span class="muted"><del>${formatLiters(changes.threshold.old)}</del></span> ➔ <b style="color:var(--teal);">${formatLiters(changes.threshold.new)}</b></div>`);
  }
  if (changes.thresholdBySize) {
    items.push(`<div><b>Per-Size Thresholds:</b> <span class="badge" style="background:#EBF5FB; color:#1B4F72; font-size:11px;">Updated min cans</span></div>`);
  }
  return items.map(html => `<div style="padding:6px 10px; background:#FAF8F5; border-radius:4px; border-left:3px solid var(--teal); font-size:12px;">${html}</div>`).join('');
}

function productInventoryDetailsHtml(p) {
  const hex = getProductDefaultColor(p);
  const rgb = hexToRgb(hex);
  const detected = detectMixedColorName(rgb.r, rgb.g, rgb.b);
  const canManage = currentUser && (currentUser.role === 'admin' || currentUser.role === 'staff');
  const stock = Number(p.stock) || 0;
  const threshold = productTotalThresholdLiters(p) || Number(p.threshold) || 0;
  const isOutOfStock = stock <= 0;
  const lowSizes = productLowSizes(p);
  const isLowStock = !isOutOfStock && productHasLowStock(p);

  // Status info & plain-English message
  let statusClass = 'ok';
  let statusIcon = '🟢';
  let statusTitle = 'Stock is Healthy';
  let statusMessage = `Total <b>${formatLiters(stock)}</b> available across ${productSizes(p).length} can size${productSizes(p).length === 1 ? '' : 's'}. All sizes meet their minimum limits.`;

  if (p.status === 'pending_approval') {
    statusClass = 'low';
    statusIcon = '⏳';
    statusTitle = 'Pending Administrator Approval';
    statusMessage = `Submitted by <b>${escapeHtml(p.requestedBy || 'Inventory Staff')}</b>. Requires Administrator approval before becoming active in POS.`;
  } else if (isOutOfStock) {
    statusClass = 'out';
    statusIcon = '🔴';
    statusTitle = 'Out of Stock';
    statusMessage = 'All sealed cans are depleted. Restocking is required immediately.';
  } else if (isLowStock) {
    statusClass = 'low';
    statusIcon = '🟡';
    statusTitle = 'Running Low on Stock';
    statusMessage = lowSizes.length > 0
      ? `Attention needed for: <b>${productLowSizesSummary(p)}</b>. Minimum can threshold reached.`
      : `Current total stock (${formatLiters(stock)}) is below the overall threshold (${formatLiters(threshold)}).`;
  }

  const openPOsForThis = openPOsForProduct(p.id);
  if (openPOsForThis.length > 0) {
    statusTitle = 'Stock Low · Restock Order Placed';
    statusIcon = '🚚';
    statusMessage += ` <span style="display:block; margin-top:4px; color:#1B4F72; font-weight:600;">🚚 Purchase Order ${openPOsForThis.map(o => o.poNumber).join(', ')} is currently active (${poStatusBadgeText(openPOsForThis[0].status)}). Delivery pending.</span>`;
  }

  // Sealed Cans Rows (clean horizontal row-based layout)
  const sortedSizes = (productSizes(p) || []).slice().sort((a, b) => Number(a) - Number(b));
  const canRowsHtml = sortedSizes.map(s => {
    const count = productCanCount(p, s);
    const sizeThresh = productSizeThreshold(p, s);
    const totalLitersForSize = count * s;
    const threshLitersForSize = sizeThresh * s;
    const canWord = sizeThresh === 1 ? 'can' : 'cans';
    const status = productSizeStatus(p, s);

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
      statusText = 'Out';
    } else if (status === 'low') {
      rowStatusClass = 'row-low';
      barColor = '#F59E0B'; // Yellow/Orange for Low
      statusText = 'Low';
    }

    const titleText = `${fmtSize(s)}: ${count} in stock, minimum ${sizeThresh} ${canWord} (${formatLiters(threshLitersForSize)})`;

    return `
      <tr class="${rowStatusClass}" title="${escapeHtml(titleText)}">
        <!-- 1. Container Size (Left aligned) -->
        <td class="inv-td-size">
          <div class="inv-can-cell-size">
            <span class="inv-can-row-icon">${icon}</span>
            <span class="inv-can-row-name">${fmtSize(s)} ${unitLabel}</span>
          </div>
        </td>

        <!-- 2. Stock Quantity (Center aligned) -->
        <td class="inv-td-qty">
          <span class="inv-can-row-qty-num ${status === 'out' ? 'is-out' : (status === 'low' ? 'is-low' : '')}">${count}</span>
          <span class="inv-can-row-qty-unit">${count === 1 ? 'can' : 'cans'}</span>
        </td>

        <!-- 3. Total Volume (Center aligned) -->
        <td class="inv-td-vol">
          <span class="inv-can-row-vol-val">${formatLiters(totalLitersForSize)}</span>
        </td>

        <!-- 4. Stock Progress Bar (Center aligned) -->
        <td class="inv-td-progress" title="${fillPct}% stock level">
          <div class="inv-can-row-bar-wrap">
            <div class="inv-can-row-bar-fill" style="width:${status === 'out' ? '0%' : fillPct + '%'}; background:${barColor};"></div>
          </div>
        </td>

        <!-- 5. Minimum Stock Threshold (Center aligned) -->
        <td class="inv-td-min">
          <span>Min: <strong>${sizeThresh}</strong> ${canWord}</span>
          <span class="inv-can-row-min-liters">(${formatLiters(threshLitersForSize)})</span>
        </td>

        <!-- 6. Stock Status (Center aligned) -->
        <td class="inv-td-status">
          <span class="inv-can-status-badge status-${status}">
            <span class="inv-status-dot"></span>
            ${statusText}
          </span>
        </td>
      </tr>
    `;
  }).join('');

  // Opened Cans Section
  const openedEntries = productOpenedEntries(p);
  let openedStockHtml = '';
  if (openedEntries.length) {
    openedStockHtml = openedEntries.map(e => {
      const pctUsed = Math.min(100, Math.round((e.used / e.size) * 100));
      const pctLeft = Math.max(0, 100 - pctUsed);
      return `
        <div style="background:#FAF8F5; border:1px solid #F0D9B5; border-radius:var(--radius-sm); padding:9px 12px; margin-bottom:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <span style="font-weight:700; font-size:12px; color:#92400E; display:flex; align-items:center; gap:5px;">
              <span>🫙</span> ${fmtSize(e.size)} Can Opened
            </span>
            <span style="font-weight:700; font-family:'Space Grotesk',sans-serif; font-size:11.5px; color:var(--teal);">
              ${formatLiters(e.left)} left (${pctLeft}%)
            </span>
          </div>
          <div style="height:6px; background:#E5DDD0; border-radius:3px; overflow:hidden; margin:4px 0;">
            <div style="height:100%; width:${pctLeft}%; background:linear-gradient(90deg, #D97706, #1F6F6B); border-radius:3px;"></div>
          </div>
          <div style="font-size:11px; color:var(--ink-soft); display:flex; justify-content:space-between;">
            <span>Used: <b>${formatLiters(e.used)}</b></span>
            <span>Original size: <b>${fmtSize(e.size)}</b></span>
          </div>
        </div>
      `;
    }).join('') + `
      <div style="font-size:11px; color:var(--ink-soft); display:flex; align-items:center; gap:6px; margin-top:4px;">
        <span>💡</span>
        <span>Color mixing prioritizes this opened can first so no paint is wasted.</span>
      </div>
    `;
  } else {
    openedStockHtml = `
      <div style="background:#FAF8F5; border:1px dashed var(--line); border-radius:var(--radius-sm); padding:10px 12px; display:flex; align-items:center; gap:8px; color:var(--ink-soft); font-size:12px;">
        <span style="font-size:16px;">✨</span>
        <span><b>No opened cans (0.00 L)</b> — All current stock is brand new and sealed.</span>
      </div>
    `;
  }

  // Price pills
  const hasRecentPrice = p.recentPrice != null && Number(p.recentPrice) > 0 && Number(p.recentPrice) !== Number(p.price);
  const pricePillsHtml = [
    `<span class="inv-price-pill">Per Liter: <strong>${peso(p.price)}</strong>${hasRecentPrice ? ` <span class="muted small" style="margin-left:5px; font-weight:normal;" title="Recent price before last change">(Recent: <del>${peso(p.recentPrice)}</del>)</span>` : ''}</span>`
  ].concat(productSizes(p).map(s => {
    return `<span class="inv-price-pill">${fmtSize(s)} Can: <strong>${peso(Math.round(p.price * s))}</strong></span>`;
  })).join('');

  // Product Movement History for this item
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
        <div class="inv-friendly-banner-info">
          <span class="inv-banner-dot">${statusIcon}</span>
          <div>
            <div class="inv-banner-title">${statusTitle}</div>
            <div class="inv-banner-sub">${statusMessage}</div>
          </div>
        </div>
        <div class="inv-friendly-actions">
          ${p.status === 'pending_approval' && currentUser && currentUser.role === 'admin' ? `
            <button type="button" class="btn small" style="background:#1F6F6B; color:#fff;" onclick="event.stopPropagation(); approvePendingProduct('${p.id}')">✓ Approve Product</button>
            <button type="button" class="btn secondary small danger" onclick="event.stopPropagation(); rejectPendingProduct('${p.id}')">✕ Reject Product</button>
          ` : ''}
          ${canManage ? `
            <button type="button" id="inv-detail-edit-btn-${p.id}" class="btn secondary small inv-detail-edit-btn" onclick="event.stopPropagation(); openProductModal('${p.id}')">
              ${currentUser && currentUser.role === 'admin' ? '✏️ Edit Product' : (p.pendingEdit ? '✏️ Edit / Update Request' : '✏️ Edit Product')}
            </button>
          ` : ''}
          ${currentUser && currentUser.role === 'admin' && p.status !== 'pending_approval' ? `
            <button type="button" class="btn secondary small ${p.status === 'active' ? 'danger' : ''}" onclick="event.stopPropagation(); toggleProductStatus('${p.id}')">
              ${p.status === 'active' ? '🚫 Deactivate' : '✓ Activate'}
            </button>
          ` : ''}
          ${canManage ? `<button type="button" class="btn small" onclick="event.stopPropagation(); goToAdjustment('${p.id}')">⚖️ Adjust Stock</button>` : ''}
          ${productHasOpenPO(p.id) ? `
            <button type="button" class="btn secondary small" style="background:#EBF5FB; border-color:#AED6F1; color:#1B4F72;" onclick="event.stopPropagation(); openPODetail('${openPOsForProduct(p.id)[0].id}')">
              🚚 View Order (${openPOsForProduct(p.id)[0].poNumber})
            </button>
          ` : (canManage && productHasLowStock(p) ? `
            <button type="button" class="btn small" style="background:#1F6F6B; color:#fff;" onclick="event.stopPropagation(); createPOFromSelectedLowStock(['${p.id}'])">📋 Create Purchase Order</button>
          ` : (currentUser && currentUser.role === 'admin' ? `<button type="button" class="btn small" onclick="event.stopPropagation(); goTo('purchaseOrders')">📋 Purchase Order</button>` : ''))}
          ${currentUser && currentUser.role === 'cashier' ? `<button type="button" class="btn small" onclick="event.stopPropagation(); goTo('pos')">🛒 Sell at POS</button>` : ''}
        </div>
      </div>

      ${p.pendingEdit ? `
        <div style="background:#FEF3C7; border:1px solid #FCD34D; border-radius:var(--radius-sm); padding:12px 14px; margin-bottom:12px;">
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
        <div style="background:#FEF3C7; border:1px solid #FCD34D; border-radius:var(--radius-sm); padding:10px 14px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <div>
            <span style="font-weight:700; color:#92400E;">⏳ New Can Size(s) Pending Admin Approval:</span>
            <span style="margin-left:6px; font-weight:600;">${p.pendingSizes.map(s => s + 'L Can').join(', ')}</span>
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
        <div style="background:#FEF3C7; border:1px solid #FCD34D; border-radius:var(--radius-sm); padding:10px 14px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
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

      <!-- 2-Column Friendly Grid -->
      <div class="inv-friendly-grid">
        <!-- 1. Sealed Cans -->
        <div class="inv-friendly-box">
          <div class="inv-box-header">
            <span class="inv-box-title">📦 Ready-to-Sell Sealed Cans</span>
            <span class="inv-box-meta">Total: <b>${formatLiters(stock)}</b></span>
          </div>
          ${sortedSizes.length ? `
            <div class="inv-can-table-wrap">
              <table class="inv-can-table">
                <colgroup>
                  <col style="width: 155px;">
                  <col style="width: 135px;">
                  <col style="width: 125px;">
                  <col style="width: 160px;">
                  <col style="width: 150px;">
                  <col style="width: 105px;">
                </colgroup>
                <thead>
                  <tr>
                    <th class="inv-th-size">Container Size</th>
                    <th class="inv-th-qty">Stock Quantity</th>
                    <th class="inv-th-vol">Total Volume</th>
                    <th class="inv-th-progress">Stock Level</th>
                    <th class="inv-th-min">Min. Threshold</th>
                    <th class="inv-th-status">Status</th>
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
            <span class="inv-box-title">🫙 Opened Cans &amp; Mixing</span>
          </div>
          <div class="inv-opened-section">
            ${openedStockHtml}
          </div>
          <div class="inv-pricing-section">
            <div class="inv-pricing-label">💵 Quick Price Reference:</div>
            <div class="inv-pricing-pills">
              ${pricePillsHtml}
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

  if (!moves.length) {
    return `
      <div style="background:#FAF8F5; border:1px dashed var(--line); border-radius:var(--radius-sm); padding:16px; text-align:center; color:var(--ink-soft); font-size:12px;">
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
          : (l.openedLiters > 0 ? `🫙 Opened Can (${fmtSize(l.openedCanSize || 1)})` : 'Product Stock');
        return `
                <div class="movement-item-paired-row" style="padding:4px 8px;">
                  <div class="movement-item-left">
                    <span class="movement-item-name" style="font-weight:600; font-size:12px;">${escapeHtml(sizeLabel)}</span>
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
        : (singleLine.openedLiters > 0 ? `🫙 Opened Can (${fmtSize(singleLine.openedCanSize || 1)})` : 'Product Stock');
      itemsTdHtml = `
        <td class="movement-product-td" style="font-size:12px; padding:8px 12px;">
          <div style="font-weight:600; color:var(--ink);">${escapeHtml(sizeLabel)}</div>
          ${singleLine.balanceTrail ? `<div class="movement-balance-trail" style="font-size:11px; margin-top:2px;"><span class="trail-icon">📦</span> ${escapeHtml(singleLine.balanceTrail)}</div>` : ''}
        </td>
        <td class="right movement-qty-td" style="font-size:12px; padding:8px 12px;">
          ${movementLineDeltaBadge(singleLine)}
        </td>
      `;
    }

    return `
      <tr class="movement-row ${isBatch ? 'movement-row-batch' : ''}">
        <td class="movement-date-td" style="font-size:12px; padding:8px 12px;">${formatDateTimeStacked(m.date)}</td>
        <td class="movement-type-td" style="font-size:12px; padding:8px 12px;">${movementTypeBadge(m.type)}</td>
        ${itemsTdHtml}
        <td class="movement-staff-td" style="font-size:12px; padding:8px 12px;">${staffLabelStacked(m.staffName)}</td>
        <td class="movement-note-td" style="font-size:12px; padding:8px 12px;">${movementNoteFormatted(m)}</td>
      </tr>
    `;
  }).join('');

  return `
    <div style="overflow-x:auto; background:#fff; border-radius:var(--radius-sm); border:1px solid var(--line);">
      <table class="movement-table tight" style="margin:0; width:100%; border-collapse:collapse;">
        <thead>
          <tr style="background:#FAF8F5; border-bottom:1px solid var(--line);">
            <th class="movement-date-td" style="font-size:11px; padding:7px 12px; text-transform:uppercase; letter-spacing:0.03em; color:var(--ink-soft); font-weight:600;">Date &amp; Time</th>
            <th class="movement-type-td" style="font-size:11px; padding:7px 12px; text-transform:uppercase; letter-spacing:0.03em; color:var(--ink-soft); font-weight:600;">Type</th>
            <th style="font-size:11px; padding:7px 12px; text-transform:uppercase; letter-spacing:0.03em; color:var(--ink-soft); font-weight:600;">Can Size / Item</th>
            <th class="right movement-qty-td" style="font-size:11px; padding:7px 12px; text-transform:uppercase; letter-spacing:0.03em; color:var(--ink-soft); font-weight:600;">Qty Change</th>
            <th class="movement-staff-td" style="font-size:11px; padding:7px 12px; text-transform:uppercase; letter-spacing:0.03em; color:var(--ink-soft); font-weight:600;">Staff / User</th>
            <th style="font-size:11px; padding:7px 12px; text-transform:uppercase; letter-spacing:0.03em; color:var(--ink-soft); font-weight:600;">Reference &amp; Details</th>
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
  if (statusFilter === 'in') {
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
  <table>
<thead>
  <tr>
    ${thSort('name', 'Product & Color')}
    ${thSort('brand', 'Brand')}
    ${thSort('supplier', 'Supplier')}
    ${thSort('type', 'Type')}
    ${thSort('price', 'Price / Liter', 'right')}
    ${thSort('stock', 'Total Stock (L)', 'right')}
    <th class="center" style="width:140px;">Actions</th>
  </tr>
</thead>
<tbody>
  ${list.length ? list.map(p => {
    const hex = getProductDefaultColor(p);
    const rgb = hexToRgb(hex);
    const rgbaBg = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.08)`;
    const detected = detectMixedColorName(rgb.r, rgb.g, rgb.b);
    const isExpanded = invExpandedProductIds.has(p.id);
    const isLow = productHasLowStock(p);
    const lowSizes = productLowSizes(p);
    const openPOs = openPOsForProduct(p.id);
    const hasOpenOrder = openPOs.length > 0;
    return `
    <tr id="inv-prod-row-${p.id}" class="inv-prod-row ${isExpanded ? 'expanded' : ''}" onclick="toggleProductInventoryDetails('${p.id}')" style="cursor:pointer; --prod-color: ${hex}; --prod-color-alpha: ${rgbaBg};" title="Click to expand/collapse stock breakdown, opened stock &amp; status">
      <td>
        <div style="font-weight:600; display:flex; align-items:center; gap:8px;">
          <span class="inv-expand-caret" id="inv-caret-${p.id}">${isExpanded ? '▼' : '▶'}</span>
          <span class="hover-color-swatch" style="background:${hex}; width:18px; height:18px;" title="${hex}"></span>
          <span class="inv-prod-name" style="color:var(--teal); font-weight:600; text-decoration:underline; text-decoration-color:rgba(31,111,107,0.3); text-underline-offset:2px;">${escapeHtml(p.name)}</span>
          <code class="prod-hex" style="font-family:'Space Grotesk',monospace; font-size:11.5px; color:var(--teal); font-weight:600; opacity:0.9;">(${hex})</code>
          ${p.status === 'pending_approval' ? `<span class="badge" style="background:#FEF3C7; color:#92400E; border:1px solid #FCD34D; font-size:10.5px; margin-left:4px;">⏳ Pending Approval</span>` : ''}
          ${p.pendingEdit ? `<span class="badge" style="background:#FEF3C7; color:#92400E; border:1px solid #FCD34D; font-size:10.5px; margin-left:4px;" title="Edits submitted for Admin approval">⏳ Pending Edits (${Object.keys(p.pendingEdit.changes || {}).length})</span>` : ''}
          ${!p.pendingEdit && p.pendingSizes && p.pendingSizes.length > 0 ? `<span class="badge" style="background:#FEF3C7; color:#92400E; border:1px solid #FCD34D; font-size:10.5px; margin-left:4px;">⏳ Pending Size (${p.pendingSizes.map(s => s + 'L').join(', ')})</span>` : ''}
          ${!p.pendingEdit && p.pendingPrice != null && Number(p.pendingPrice) > 0 ? `<span class="badge" style="background:#FEF3C7; color:#92400E; border:1px solid #FCD34D; font-size:10.5px; margin-left:4px;">⏳ Pending Price (${peso(p.pendingPrice)})</span>` : ''}
        </div>
        ${p.color && p.color !== '-' ? `<div class="muted small" style="margin-left:42px;">Color: ${escapeHtml(p.color)} <span style="color:var(--teal);">(${detected.name})</span></div>` : ''}
        ${hasOpenOrder ? `
          <div style="margin-left:42px; margin-top:2px;">
            <a href="#" onclick="event.stopPropagation(); openPODetail('${openPOs[0].id}'); return false;" class="badge" style="background:#EBF5FB; color:#1B4F72; border:1px solid #AED6F1; font-size:10.5px; text-decoration:none; display:inline-flex; align-items:center; gap:4px;" title="Active PO: ${openPOs.map(o => o.poNumber).join(', ')}">
              🚚 On Order (${openPOs[0].poNumber})
            </a>
          </div>
        ` : ''}
      </td>
      <td>${escapeHtml(p.brand)}</td>
      <td>${supplierBadgesHtml(p.id)}</td>
      <td><span class="badge" style="background:#F4EFE6; color:#6B6259;">${escapeHtml(p.type)}</span></td>
      <td class="right">
        <div>${peso(p.price)}<span class="muted small">/L</span></div>
        ${p.pendingEdit && p.pendingEdit.changes && p.pendingEdit.changes.price ? `<div style="font-size:11px; color:#92400E; font-weight:700; margin-top:2px;" title="Requested price awaiting Admin approval">⏳ Req: ${peso(p.pendingEdit.changes.price.new)}</div>` : (!p.pendingEdit && p.pendingPrice != null && Number(p.pendingPrice) > 0 ? `<div style="font-size:11px; color:#92400E; font-weight:700; margin-top:2px;" title="Requested price awaiting Admin approval">⏳ Req: ${peso(p.pendingPrice)}</div>` : '')}
        ${p.recentPrice != null && Number(p.recentPrice) > 0 && Number(p.recentPrice) !== Number(p.price) ? `<div class="muted small" style="font-size:11px; opacity:0.85; margin-top:2px;" title="Recent price before last change">Recent: <del>${peso(p.recentPrice)}</del></div>` : ''}
      </td>
      <td class="right">
        <div style="font-weight:700; font-size:14px; ${isLow ? 'color:var(--danger);' : ''}">${formatLiters(p.stock)}</div>
        ${lowSizes.length ? `<div style="font-size:10.5px; color:var(--danger); font-weight:600; margin-top:2px; line-height:1.2;" title="${escapeHtml(productLowSizesSummary(p))}">⚠️ ${lowSizes.map(s => `${fmtSize(s)} ${productCanCount(p, s) === 0 ? 'Out' : 'Low'}`).join(' · ')}</div>` : ''}
      </td>
      <td class="center" style="white-space:nowrap;">
        ${p.status === 'pending_approval' ? `
          ${currentUser && currentUser.role === 'admin' ? `
            <button class="btn small" style="padding:4px 8px; margin-right:4px;" onclick="event.stopPropagation(); approvePendingProduct('${p.id}')" title="Approve and activate product">✓ Approve</button>
            <button class="btn secondary small danger" style="padding:4px 8px; margin-right:4px;" onclick="event.stopPropagation(); rejectPendingProduct('${p.id}')" title="Reject product request">✕ Reject</button>
          ` : '<span class="muted small" style="margin-right:6px;">Waiting Admin</span>'}
        ` : (hasOpenOrder ? `
          <button class="btn secondary small" style="padding:4px 8px; margin-right:4px;" onclick="event.stopPropagation(); openPODetail('${openPOs[0].id}')" title="View existing Purchase Order ${openPOs[0].poNumber}">
            🚚 PO
          </button>
        ` : (isLow && canManage ? `
          <button class="btn small" style="background:#1F6F6B; color:#fff; padding:4px 8px; margin-right:4px;" onclick="event.stopPropagation(); createPOFromSelectedLowStock(['${p.id}'])" title="Directly create purchase order for ${escapeHtml(p.name)}">
            📋 PO
          </button>
        ` : ''))}
        ${canManage ? `
          <button type="button" id="inv-edit-btn-${p.id}" class="btn secondary small inv-edit-btn" style="padding:4px 8px; margin-right:4px;" onclick="event.stopPropagation(); openProductModal('${p.id}')" title="Edit product details">
            ✏️ Edit
          </button>
        ` : ''}
        <button id="inv-toggle-btn-${p.id}" class="btn ${isExpanded ? 'ghost' : 'secondary'} small" onclick="event.stopPropagation(); toggleProductInventoryDetails('${p.id}')" title="Expand / collapse Stock per Size, Opened/Used, Threshold &amp; Status">
          ${isExpanded ? '▴ Close' : '▾ Details'}
        </button>
      </td>
    </tr>
    <tr id="inv-detail-row-${p.id}" class="inv-detail-row" style="${isExpanded ? '' : 'display:none;'}">
      <td colspan="7" style="padding:0 !important; border-bottom:1px solid var(--line);">
        ${productInventoryDetailsHtml(p)}
      </td>
    </tr>`;
  }).join('')
      : `<tr><td colspan="7" class="empty-state" style="text-align:center; padding:32px 16px;">No products found</td></tr>`}
</tbody>
  </table>`;
}
