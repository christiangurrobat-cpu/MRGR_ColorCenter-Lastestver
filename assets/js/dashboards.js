/* ============================================================
   8. ADMIN — DASHBOARD
   ============================================================ */
let selectedDashProductIds = new Set();

function toggleSelectAllDash(checked) {
  const low = lowStockProducts();
  if (checked) {
    low.forEach(p => selectedDashProductIds.add(p.id));
  } else {
    selectedDashProductIds.clear();
  }
  updateDashSelectionUI();
}

function onDashRowCheck(checkbox, productId) {
  if (checkbox.checked) {
    selectedDashProductIds.add(productId);
  } else {
    selectedDashProductIds.delete(productId);
  }
  updateDashSelectionUI();
}

function updateDashSelectionUI() {
  const count = selectedDashProductIds.size;
  const badge = document.getElementById('dash-po-badge');
  if (badge) badge.textContent = count;

  const low = lowStockProducts();
  const chkAll = document.getElementById('chk-dash-all');
  if (chkAll) {
    chkAll.checked = low.length > 0 && count === low.length;
    chkAll.indeterminate = count > 0 && count < low.length;
  }

  document.querySelectorAll('.dash-low-chk').forEach(chk => {
    chk.checked = selectedDashProductIds.has(chk.value);
    const tr = chk.closest('tr');
    if (tr) {
      if (chk.checked) tr.classList.add('row-selected');
      else tr.classList.remove('row-selected');
    }
  });
}

function createPOFromSelectedDash() {
  const ids = selectedDashProductIds.size > 0
    ? Array.from(selectedDashProductIds)
    : lowStockProducts().filter(p => !productHasOpenPO(p.id)).map(p => p.id);
  createPOFromSelectedLowStock(ids);
}

function adminDashboard() {
  const todaySales = salesOn(todayISO());
  const low = lowStockProducts();
  const needingPO = low.filter(p => !productHasOpenPO(p.id));
  const onOrder = low.filter(p => productHasOpenPO(p.id));
  const pendingPOs = (db.purchaseOrders || []).filter(o => o.status === 'pending');
  const recent = [...db.sales].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 6);
  const greeting = getGreeting();

  return `
  <!-- Friendly Welcome Banner -->
  <div style="background: linear-gradient(135deg, #FAF6EE 0%, #F1E9DA 100%); border: 1px solid var(--line); border-radius: var(--radius); padding: 18px 22px; margin-bottom: 20px; box-shadow: var(--shadow-sm); display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 14px;">
<div>
  <div style="font-family: 'Space Grotesk'; font-size: 20px; font-weight: 700; color: var(--ink);">
    ${greeting.emoji} ${greeting.text}, ${escapeHtml((currentUser && currentUser.name) || 'User')}!
  </div>
  <div class="muted small" style="margin-top: 4px; font-size: 13px;">
    MRGR Color Center is currently managing <b>${activeProducts().length} active paint products</b> across <b>${db.suppliers.filter(s => s.status === 'active').length} suppliers</b>.
  </div>
</div>
<div class="row" style="gap: 8px;">
  <span class="badge ${low.length ? 'low' : 'ok'}" style="padding: 6px 14px; font-size: 12.5px;">
    ${low.length ? `⚠️ ${low.length} Low-Stock Alert${low.length === 1 ? '' : 's'}` : '✓ All Stock Levels Healthy'}
  </span>
</div>
  </div>

  <div class="dashboard-actions-bar">
<div class="bar-title">
  <span>⚡ Quick Actions</span>
</div>
<div class="bar-buttons">
  <button class="btn small" style="background:var(--teal); color:#fff;" onclick="goTo('approvals')">⏳ Pending Approvals ${getModuleBadgeHtml('approvals')}</button>
  <button class="btn secondary small" onclick="goTo('inventory')">📦 Inventory</button>
  <button class="btn secondary small" onclick="goTo('alerts')">⚠️ Low-Stock Alerts</button>
  <button class="btn secondary small" onclick="goTo('purchaseOrders')">📋 Purchase Orders</button>
  <button class="btn secondary small" onclick="goTo('suppliers')">👥 Suppliers</button>
  <button class="btn secondary small" onclick="goTo('reports')">📊 Reports</button>
</div>
  </div>

  <div class="stat-grid">
<div class="stat-card clickable" onclick="goTo('reports')" title="Click to view sales history in Reports">
  <div class="label">💰 Today's Sales</div>
  <div class="value">${peso(sumSales(todaySales))}</div>
  <div class="sub">${todaySales.length} transaction${todaySales.length === 1 ? '' : 's'} completed</div>
  <div class="stat-card-footer">
    <span class="stat-action-link">View Sales History &rarr;</span>
  </div>
</div>
<div class="stat-card mustard clickable" onclick="goTo('inventory')" title="Click to manage products & inventory">
  <div class="label">📦 Products Tracked</div>
  <div class="value">${activeProducts().length}</div>
  <div class="sub">${activeProducts().filter(p => !productHasLowStock(p)).length} in stock · ${low.length} low / out of stock</div>
  <div class="stat-card-footer">
    <span class="stat-action-link">Manage Inventory &rarr;</span>
  </div>
</div>
<div class="stat-card ${needingPO.length ? 'danger' : (onOrder.length ? 'mustard' : 'sage')} clickable" onclick="goTo('alerts')" title="Click to view low-stock alerts">
  <div class="label">⚠️ Low-Stock Items</div>
  <div class="value">${low.length}</div>
  <div class="sub">${needingPO.length} need PO · ${onOrder.length} on order</div>
  <div class="stat-card-footer">
    <span class="stat-action-link">View Low-Stock Alerts &rarr;</span>
  </div>
</div>
<div class="stat-card orange clickable" onclick="goTo('suppliers')" title="Click to view supplier accounts">
  <div class="label">👥 Registered Suppliers</div>
  <div class="value">${db.suppliers.filter(s => s.status === 'active').length}</div>
  <div class="sub">active supplier accounts</div>
  <div class="stat-card-footer">
    <span class="stat-action-link">Manage Suppliers &rarr;</span>
  </div>
</div>
  </div>

  ${(typeof pendingAdjRequests === 'function' && pendingAdjRequests().length > 0) ? `
    <div class="alert-banner warning" style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; border-left:4px solid var(--mustard); margin-bottom:12px;">
      <span>⚖️ <b>${pendingAdjRequests().length} Stock Adjustment Request${pendingAdjRequests().length === 1 ? '' : 's'} awaiting your approval</b>.</span>
      <a href="#" onclick="goToApprovalsTab('adjustments'); return false;" style="font-weight:700; color:var(--teal); text-decoration:underline;">Review &amp; Approve Adjustments &rarr;</a>
    </div>
  ` : ''}

  ${((db.products || []).filter(p => p.status === 'pending_approval' || Boolean(p.pendingEdit) || (p.pendingSizes && p.pendingSizes.length > 0) || (p.pendingPrice != null && Number(p.pendingPrice) > 0)).length > 0) ? `
    <div class="alert-banner warning" style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; border-left:4px solid var(--mustard); margin-bottom:12px;">
      <span>📦 <b>${(db.products || []).filter(p => p.status === 'pending_approval' || Boolean(p.pendingEdit) || (p.pendingSizes && p.pendingSizes.length > 0) || (p.pendingPrice != null && Number(p.pendingPrice) > 0)).length} Product, Edit, Price, or Size Request(s) awaiting your approval</b>.</span>
      <a href="#" onclick="goToApprovalsTab('products'); return false;" style="font-weight:700; color:var(--teal); text-decoration:underline;">Review in Approvals Hub &rarr;</a>
    </div>
  ` : ''}

  ${pendingPOs.length ? `<div class="alert-banner" style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; border-left:4px solid var(--mustard);">
    <span>📋 <b>${pendingPOs.length} Purchase Order${pendingPOs.length === 1 ? '' : 's'} awaiting your approval</b> (${peso(pendingPOs.reduce((s, o) => s + o.totalAmount, 0))} total).</span>
    <a href="#" onclick="goToApprovalsTab('purchaseOrders'); return false;" style="font-weight:700; color:var(--teal); text-decoration:underline;">Review &amp; Approve &rarr;</a>
  </div>` : ''}

  ${needingPO.length ? `
    <div class="alert-banner danger" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
      <span>⚠️ <b>${needingPO.length} low-stock product${needingPO.length === 1 ? '' : 's'}</b> need restock purchase orders.${onOrder.length ? ` <span style="opacity:0.9;">(${onOrder.length} other item${onOrder.length === 1 ? '' : 's'} already on order)</span>` : ''}</span>
      <a href="#" onclick="goTo('alerts');return false;" style="font-weight:700; text-decoration:underline;">View Low-Stock Alerts &rarr;</a>
    </div>
  ` : (onOrder.length ? `
    <div class="alert-banner" style="background:#EBF5FB; border-color:#AED6F1; color:#1B4F72; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
      <span>✅ <b>All ${onOrder.length} low-stock item${onOrder.length === 1 ? '' : 's'} have purchase orders placed</b> and are awaiting delivery.</span>
      <a href="#" onclick="goTo('alerts');return false;" style="font-weight:700; text-decoration:underline;">View On-Order Items &rarr;</a>
    </div>
  ` : '')}

  <div class="panel">
<div class="panel-head row">
  <h3>Recent Transactions</h3>
  <div class="spacer"></div>
  <button class="btn secondary small" onclick="goTo('reports')">View All Sales &rarr;</button>
</div>
<div class="panel-body tight table-scroll">
  <table>
    <thead><tr><th>Receipt #</th><th>Date</th><th>Cashier</th><th>Customer</th><th>Items</th><th class="center">Status</th><th class="right">Total</th><th></th></tr></thead>
    <tbody>
      ${recent.length ? recent.map(s => {
    const refundTotal = Number(s.refundTotal || 0);
    const netTotal = Number((s.total - refundTotal).toFixed(2));
    return `
        <tr>
          <td><code style="color:var(--teal); font-weight:700;">${escapeHtml(getReceiptNo(s))}</code></td>
          <td>${formatDateTime(s.date)}</td>
          <td>${escapeHtml(s.cashierName)}</td>
          <td>${escapeHtml(s.customerName) || '<span class="muted">—</span>'}</td>
          <td>${s.items.length} item${s.items.length === 1 ? '' : 's'}</td>
          <td class="center">${saleStatusBadge(s.status)}</td>
          <td class="right" style="font-weight:600;">
            ${refundTotal > 0 ? `<span title="Original: ${peso(s.total)}">${peso(netTotal)}</span>` : peso(s.total)}
          </td>
          <td style="text-align:right;"><button class="btn ghost small" onclick='viewSale("${s.id}")'>Receipt</button></td>
        </tr>`;
  }).join('') : `<tr><td colspan="8" class="empty-state">No sales recorded yet.</td></tr>`}
    </tbody>
  </table>
</div>
  </div>

  <div class="panel">
<div class="panel-head row wrap" style="gap:10px;">
  <div>
    <h3 style="margin:0;">Low-Stock Watchlist</h3>
    <div class="muted small" style="margin-top:2px;">
      ${needingPO.length ? `⚠️ <b>${needingPO.length}</b> product(s) need purchase orders.` : '✅ All low-stock products have purchase orders en route.'}
      ${onOrder.length ? `<span style="margin-left:6px; color:#1B4F72;">(${onOrder.length} on order awaiting delivery)</span>` : ''}
    </div>
  </div>
  <div class="spacer"></div>
  <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
    ${needingPO.length ? `
      <button class="btn small" id="btn-dash-create-po" onclick="createPOFromSelectedDash()" title="Directly create purchase order for selected low-stock items">
        📋 Create Purchase Order (<span id="dash-po-badge">${selectedDashProductIds.size}</span>)
      </button>
      <button class="btn secondary small" onclick="toggleSelectAllDash(true)">Select All</button>
      <button class="btn ghost small" onclick="toggleSelectAllDash(false)">Clear</button>
    ` : ''}
    <button class="btn ghost small" onclick="goTo('alerts')">View All Alerts &rarr;</button>
  </div>
</div>
<div class="panel-body tight table-scroll">
  <table>
    <thead>
      <tr>
        ${low.length ? `
          <th style="width:38px; text-align:center;">
            <input type="checkbox" id="chk-dash-all" onchange="toggleSelectAllDash(this.checked)" title="Select all low-stock items" ${low.length && selectedDashProductIds.size === low.length ? 'checked' : ''}>
          </th>
        ` : ''}
        <th>Product</th>
        <th>Brand</th>
        <th>Supplier</th>
        <th class="right">Stock (L)</th>
        <th class="right" style="min-width:180px;" title="Minimum required inventory: Total liters &amp; minimum cans per can size">Threshold (L / Cans)</th>
        <th>Status</th>
        <th class="center" style="width:120px;">Action</th>
      </tr>
    </thead>
    <tbody>
      ${low.length ? low.map(p => {
    const summary = productLowSizesSummary(p);
    const isChecked = selectedDashProductIds.has(p.id);
    const openPOs = openPOsForProduct(p.id);
    const hasOpenOrder = openPOs.length > 0;
    return `
        <tr class="${isChecked ? 'row-selected' : ''}">
          <td style="text-align:center;">
            <input type="checkbox" class="dash-low-chk" value="${p.id}" ${isChecked ? 'checked' : ''} onchange="onDashRowCheck(this, '${p.id}')">
          </td>
          <td>
            <div>${escapeHtml(p.name)} <code style="font-family:'Space Grotesk',monospace; font-size:11px; font-weight:600; color:var(--teal);">(${getProductHex(p)})</code> ${p.color !== '-' ? `(${escapeHtml(p.color)})` : ''}</div>
            ${summary ? `<div style="font-size:11px; color:var(--danger); font-weight:600;">⚠️ ${summary}</div>` : ''}
            ${hasOpenOrder ? `
              <div style="margin-top:3px;">
                <a href="#" onclick="openPODetail('${openPOs[0].id}'); return false;" class="badge" style="background:#EBF5FB; color:#1B4F72; border:1px solid #AED6F1; font-size:10.5px; text-decoration:none;">
                  🚚 On Order (${openPOs[0].poNumber})
                </a>
              </div>
            ` : ''}
          </td>
          <td>${escapeHtml(p.brand)}</td>
          <td>${supplierBadgesHtml(p.id)}</td>
          <td class="right" style="font-weight:700; ${productHasLowStock(p) ? 'color:var(--danger);' : ''}">${formatLiters(p.stock)}</td>
          <td class="right" style="vertical-align:middle;">
            ${productThresholdCellHtml(p)}
          </td>
          <td>${stockBadge(p)}</td>
          <td class="center" style="white-space:nowrap;">
            ${hasOpenOrder ? `
              <button class="btn secondary small" onclick="openPODetail('${openPOs[0].id}')" title="View existing Purchase Order">
                👁️ View PO
              </button>
            ` : `
              <button class="btn small" onclick="createPOFromSelectedLowStock(['${p.id}'])" title="Directly create purchase order for ${escapeHtml(p.name)}">
                + Create PO
              </button>
            `}
          </td>
        </tr>`;
  }).join('') : `<tr><td colspan="7" class="empty-state">All products are above their reorder threshold.</td></tr>`}
    </tbody>
  </table>
</div>
  </div>`;
}

/* ============================================================
   9. STAFF — DASHBOARD
   ============================================================ */
function staffDashboard() {
  const low = lowStockProducts();
  const needingPO = low.filter(p => !productHasOpenPO(p.id));
  const onOrder = low.filter(p => productHasOpenPO(p.id));
  const recentMoves = groupStockMovements(db.movements).slice(0, 8);
  const greeting = getGreeting();

  return `
  <!-- Friendly Staff Welcome Banner -->
  <div style="background: linear-gradient(135deg, #FAF6EE 0%, #F1E9DA 100%); border: 1px solid var(--line); border-radius: var(--radius); padding: 18px 22px; margin-bottom: 20px; box-shadow: var(--shadow-sm); display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 14px;">
<div>
  <div style="font-family: 'Space Grotesk'; font-size: 20px; font-weight: 700; color: var(--ink);">
    ${greeting.emoji} ${greeting.text}, ${escapeHtml((currentUser && currentUser.name) || 'User')}!
  </div>
  <div class="muted small" style="margin-top: 4px; font-size: 13px;">
    Track inbound inventory shipments, audit stock adjustments, and monitor product thresholds.
  </div>
</div>
<button class="btn small" onclick="goTo('receiving')">📥 Log Delivery / Restock</button>
  </div>

  <div class="dashboard-actions-bar">
<div class="bar-title">
  <span>⚡ Quick Actions</span>
</div>
<div class="bar-buttons">
  <button class="btn secondary small" onclick="goTo('inventory')">📦 Inventory ${getModuleBadgeHtml('inventory')}</button>
  <button class="btn secondary small" onclick="goTo('inventory'); setTimeout(()=>openProductModal(), 80);">➕ Add Product</button>
  <button class="btn secondary small" onclick="goTo('alerts')">⚠️ Low-Stock Alerts ${getModuleBadgeHtml('alerts')}</button>
  <button class="btn secondary small" onclick="goTo('purchaseOrders')">📋 Purchase Orders ${getModuleBadgeHtml('purchaseOrders')}</button>
  <button class="btn small" onclick="goTo('receiving')">📥 Stock Receiving ${getModuleBadgeHtml('receiving')}</button>
  <button class="btn secondary small" onclick="goToAdjustment()">⚖️ Stock Adjustment</button>
  <button class="btn secondary small" onclick="goTo('suppliersView')">👥 Supplier Directory</button>
  <button class="btn secondary small" onclick="goTo('reports')">📊 View Reports</button>
</div>
  </div>

  <div class="stat-grid">
<div class="stat-card clickable" onclick="goTo('inventory')" title="Click to view products">
  <div class="label">📦 Total Products</div>
  <div class="value">${activeProducts().length}</div>
  <div class="stat-card-footer"><span class="stat-action-link">View Products &rarr;</span></div>
</div>
<div class="stat-card ${needingPO.length ? 'danger' : (onOrder.length ? 'mustard' : 'sage')} clickable" onclick="goTo('alerts')" title="Click to view alerts">
  <div class="label">⚠️ Low-Stock Items</div>
  <div class="value">${low.length}</div>
  <div class="sub">${needingPO.length} need PO · ${onOrder.length} on order</div>
  <div class="stat-card-footer"><span class="stat-action-link">View Alerts &rarr;</span></div>
</div>
<div class="stat-card orange clickable" onclick="goTo('receiving')" title="Click to view stock movements">
  <div class="label">🚚 Movements Today</div>
  <div class="value">${db.movements.filter(m => m.date.slice(0, 10) === todayISO()).length}</div>
  <div class="stat-card-footer"><span class="stat-action-link">Log Movement &rarr;</span></div>
</div>
  </div>
  ${(typeof pendingAdjRequests === 'function' && pendingAdjRequests().length > 0) ? `
    <div class="alert-banner" style="background:#FAF8F5; border-color:#EFE6D5; display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:14px;">
      <span>⏳ <b>${pendingAdjRequests().length} Stock Adjustment Request(s)</b> are currently waiting for Administrator review and approval.</span>
      <button type="button" class="btn secondary small" onclick="if(typeof switchAdjView==='function') switchAdjView('requests'); goTo('receiving');">View Requests &rarr;</button>
    </div>
  ` : ''}
  ${((db.products || []).filter(p => p.status === 'pending_approval' || Boolean(p.pendingEdit) || (p.pendingSizes && p.pendingSizes.length > 0) || (p.pendingPrice != null && Number(p.pendingPrice) > 0)).length > 0) ? `
    <div class="alert-banner" style="background:#FAF8F5; border-color:#EFE6D5; display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:14px;">
      <span>⏳ <b>${(db.products || []).filter(p => p.status === 'pending_approval' || Boolean(p.pendingEdit) || (p.pendingSizes && p.pendingSizes.length > 0) || (p.pendingPrice != null && Number(p.pendingPrice) > 0)).length} Product / Edit / Price Request(s)</b> waiting for Administrator approval.</span>
      <button type="button" class="btn secondary small" onclick="if(typeof filterPendingApprovalProducts==='function') filterPendingApprovalProducts(); goTo('inventory');">View in Inventory &rarr;</button>
    </div>
  ` : ''}
  ${needingPO.length ? `
    <div class="alert-banner danger" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
      <span>⚠️ <b>${needingPO.length} product(s)</b> need restock purchase orders.${onOrder.length ? ` (${onOrder.length} other item(s) already on order)` : ''}</span>
      <a href="#" onclick="goTo('alerts');return false;" style="font-weight:700; text-decoration:underline;">View Alerts &rarr;</a>
    </div>
  ` : (onOrder.length ? `
    <div class="alert-banner" style="background:#EBF5FB; border-color:#AED6F1; color:#1B4F72; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
      <span>✅ <b>All ${onOrder.length} low-stock item(s) have purchase orders placed</b> and are awaiting delivery.</span>
      <a href="#" onclick="goTo('alerts');return false;" style="font-weight:700; text-decoration:underline;">View On-Order Items &rarr;</a>
    </div>
  ` : '')}
  <div class="panel">
<div class="panel-head row">
  <h3>Recent Stock Movements</h3>
  <div class="spacer"></div>
  <button class="btn secondary small" onclick="goTo('receiving')">+ New Stock Entry</button>
</div>
<div class="panel-body tight table-scroll">
  ${renderStockMovementsTable(recentMoves, { hideStaff: true, emptyText: 'No stock movements yet.' })}
</div>
  </div>`;
}
