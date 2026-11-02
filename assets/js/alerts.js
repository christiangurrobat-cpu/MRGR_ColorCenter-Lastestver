/* ============================================================
   18. ALERTS (low-stock products & direct purchase ordering)
   ============================================================ */
let alertTab = 'needing_po'; // 'needing_po' | 'on_order' | 'all'
let selectedAlertProductIds = new Set();

function setAlertTab(tab) {
  alertTab = tab;
  selectedAlertProductIds.clear();
  renderPage();
}

function getAlertsList() {
  const allLow = lowStockProducts().sort((a, b) => {
    const aLow = productLowSizes(a).length;
    const bLow = productLowSizes(b).length;
    if (bLow !== aLow) return bLow - aLow;
    const aThresh = productTotalThresholdLiters(a) || Number(a.threshold) || 0;
    const bThresh = productTotalThresholdLiters(b) || Number(b.threshold) || 0;
    return (a.stock - aThresh) - (b.stock - bThresh);
  });

  if (alertTab === 'needing_po') {
    return allLow.filter(p => !productHasOpenPO(p.id));
  } else if (alertTab === 'on_order') {
    return allLow.filter(p => productHasOpenPO(p.id));
  }
  return allLow;
}

function toggleSelectAllAlerts(checked) {
  const list = getAlertsList();
  if (checked) {
    list.forEach(p => selectedAlertProductIds.add(p.id));
  } else {
    selectedAlertProductIds.clear();
  }
  updateAlertsSelectionUI();
}

function onAlertRowCheck(checkbox, productId) {
  if (checkbox.checked) {
    selectedAlertProductIds.add(productId);
  } else {
    selectedAlertProductIds.delete(productId);
  }
  updateAlertsSelectionUI();
}

function createPOFromSelectedAlerts() {
  const ids = selectedAlertProductIds.size > 0
    ? Array.from(selectedAlertProductIds)
    : lowStockProducts().filter(p => !productHasOpenPO(p.id)).map(p => p.id);
  createPOFromSelectedLowStock(ids);
}

function updateAlertsSelectionUI() {
  const count = selectedAlertProductIds.size;
  const list = getAlertsList();

  const badge = document.getElementById('alerts-po-badge');
  if (badge) badge.textContent = count;

  const chkAll = document.getElementById('chk-all-alerts');
  if (chkAll) {
    chkAll.checked = list.length > 0 && count === list.length;
    chkAll.indeterminate = count > 0 && count < list.length;
  }

  document.querySelectorAll('.alert-prod-chk').forEach(chk => {
    chk.checked = selectedAlertProductIds.has(chk.value);
    const tr = chk.closest('tr');
    if (tr) {
      if (chk.checked) tr.classList.add('row-selected');
      else tr.classList.remove('row-selected');
    }
  });

  const bar = document.getElementById('alerts-floating-bar');
  if (bar) {
    if (count > 0) {
      bar.style.display = 'flex';
      const label = document.getElementById('alerts-floating-label');
      if (label) label.textContent = `${count} product${count === 1 ? '' : 's'} selected for purchase order`;
    } else {
      bar.style.display = 'none';
    }
  }

  const mainBtn = document.getElementById('btn-create-po-alerts');
  if (mainBtn) {
    if (count > 0) {
      mainBtn.classList.add('btn-primary-highlight');
    } else {
      mainBtn.classList.remove('btn-primary-highlight');
    }
  }
}

function alertsPage() {
  const allLow = lowStockProducts();
  const needingPO = allLow.filter(p => !productHasOpenPO(p.id));
  const onOrder = allLow.filter(p => productHasOpenPO(p.id));
  const currentList = getAlertsList();

  const canOrder = currentUser.role === 'admin' || currentUser.role === 'staff';
  const selectedCount = selectedAlertProductIds.size;

  return `
  <!-- Status Banner -->
  ${needingPO.length ? `
    <div class="alert-banner danger" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
      <div>
        ⚠️ <b>${needingPO.length} low-stock product(s)</b> need purchase orders.
        ${onOrder.length ? `<span style="margin-left:8px; opacity:0.9;">(${onOrder.length} other item(s) already have purchase orders en route)</span>` : ''}
      </div>
      ${canOrder && alertTab === 'needing_po' ? `
        <div style="display:flex; align-items:center; gap:8px;">
          <button class="btn small" style="background:#1F6F6B; color:#fff;" onclick="createPOFromSelectedAlerts()">
            📋 ${selectedCount > 0 ? `Create Purchase Order for Selected (${selectedCount})` : 'Create Purchase Order for All Above'} &rarr;
          </button>
        </div>
      ` : ''}
    </div>
  ` : (onOrder.length ? `
    <div class="alert-banner" style="background:#EBF5FB; border-color:#AED6F1; color:#1B4F72; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
      <div>
        ✅ <b>No products currently need purchase orders!</b> All ${onOrder.length} low-stock item(s) already have purchase orders placed and are awaiting delivery.
      </div>
      <button class="btn small secondary" onclick="setAlertTab('on_order')">View On-Order Items (${onOrder.length}) &rarr;</button>
    </div>
  ` : `<div class="alert-banner">✓ All products and can sizes are currently above their reorder thresholds.</div>`)}

  <!-- Tabs to separate products needing PO vs already on order -->
  <div class="report-toggle-bar" style="margin-bottom:14px; border-radius:var(--radius-sm); border:1px solid var(--line); background:#FAF7F2; padding:6px 12px; display:flex; gap:8px;">
    <button type="button" class="report-toggle-btn ${alertTab === 'needing_po' ? 'active' : ''}" onclick="setAlertTab('needing_po')">
      <span class="rt-icon">⚠️</span> Needs Purchase Order (${needingPO.length})
    </button>
    <button type="button" class="report-toggle-btn ${alertTab === 'on_order' ? 'active' : ''}" onclick="setAlertTab('on_order')">
      <span class="rt-icon">🚚</span> On Order / Awaiting Delivery (${onOrder.length})
    </button>
    <button type="button" class="report-toggle-btn ${alertTab === 'all' ? 'active' : ''}" onclick="setAlertTab('all')">
      <span class="rt-icon">📋</span> All Low-Stock (${allLow.length})
    </button>
  </div>

  <div class="panel">
    <div class="panel-head row wrap" style="gap:10px;">
      <div>
        <h3 style="margin:0;">
          ${alertTab === 'needing_po' ? '⚠️ Products Needing Restock Purchase Order' : (alertTab === 'on_order' ? '🚚 Low-Stock Products with Active Purchase Orders' : '📋 All Low-Stock Products')}
        </h3>
        <div class="muted small" style="margin-top:2px;">
          ${alertTab === 'needing_po'
            ? 'Products that meet reorder thresholds and have NO active orders. Once ordered, items automatically move to "On Order" to prevent duplicates.'
            : (alertTab === 'on_order'
              ? 'These products are currently low on physical shelves, but an order has ALREADY been placed with the supplier.'
              : 'Complete view of all items at or below minimum limits, including both pending orders and items needing orders.')}
        </div>
      </div>
      <div class="spacer"></div>
      <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
        ${canOrder && currentList.length && alertTab !== 'on_order' ? `
          <button class="btn small ${selectedCount > 0 ? 'btn-primary-highlight' : ''}" id="btn-create-po-alerts" onclick="createPOFromSelectedAlerts()" title="Create purchase orders for selected products">
            📋 Create Purchase Order (<span id="alerts-po-badge">${selectedCount}</span>)
          </button>
          <button class="btn secondary small" onclick="toggleSelectAllAlerts(true)">Select All</button>
          <button class="btn ghost small" onclick="toggleSelectAllAlerts(false)">Deselect All</button>
        ` : ''}
        <span class="badge ${alertTab === 'on_order' ? 'ok' : (currentList.length ? 'low' : 'ok')}">
          ${currentList.length} Product${currentList.length === 1 ? '' : 's'}
        </span>
      </div>
    </div>
    <div class="panel-body tight table-scroll">
      <table>
        <thead>
          <tr>
            ${canOrder && currentList.length && alertTab !== 'on_order' ? `
              <th style="width:38px; text-align:center;">
                <input type="checkbox" id="chk-all-alerts" onchange="toggleSelectAllAlerts(this.checked)" title="Select all" ${currentList.length && selectedCount === currentList.length ? 'checked' : ''}>
              </th>
            ` : ''}
            <th>Product</th>
            <th>Brand</th>
            <th>Supplier</th>
            <th>Stock per Size vs Threshold (Cans)</th>
            <th class="right">Total Stock (L)</th>
            ${alertTab === 'on_order' ? '<th>Active Purchase Order</th><th>PO Status</th>' : '<th>Suggested Reorder</th>'}
            <th class="center" style="width:130px;">Action</th>
          </tr>
        </thead>
        <tbody>
          ${currentList.length ? currentList.map(p => {
            const sizes = productSizes(p);
            const lowSizes = productLowSizes(p);
            const isChecked = selectedAlertProductIds.has(p.id);
            const openPOs = openPOsForProduct(p.id);
            const hasOpenOrder = openPOs.length > 0;

            const sizeBadges = sizes.map(s => {
              const count = productCanCount(p, s);
              const thresh = productSizeThreshold(p, s);
              const st = productSizeStatus(p, s);
              const bg = st === 'out' ? '#FDE8E8' : (st === 'low' ? '#FDF2E2' : '#EDF7EE');
              const border = st === 'out' ? '#F8B4B4' : (st === 'low' ? '#F8D7A8' : '#C3E6CB');
              const color = st === 'out' ? '#9B1C1C' : (st === 'low' ? '#9A6216' : '#1E6B37');
              const label = st === 'out' ? 'Out' : (st === 'low' ? 'Low' : 'OK');
              const canWord = thresh === 1 ? 'can' : 'cans';
              return `<span style="display:inline-flex; align-items:center; gap:4px; padding:2px 7px; background:${bg}; border:1px solid ${border}; border-radius:4px; font-size:11px; color:${color}; font-family:'Space Grotesk',sans-serif; margin:1px 3px 1px 0;" title="${fmtSize(s)}: Current stock is ${count} ${count === 1 ? 'can' : 'cans'}, minimum threshold is ${thresh} ${canWord} (${formatLiters(thresh * s)})">
                <b>${fmtSize(s)}:</b> ${count}/${thresh} cans <span style="font-size:10px; opacity:0.85;">(${label})</span>
              </span>`;
            }).join('');

            const suggestedList = sizes.map(s => {
              const count = productCanCount(p, s);
              const thresh = productSizeThreshold(p, s);
              if (count <= thresh) {
                const reorderCans = Math.max(1, (thresh * 2) - count);
                return `<b>${reorderCans}</b> ${fmtSize(s)} cans`;
              }
              return null;
            }).filter(Boolean);

            const suggestedStr = suggestedList.length ? suggestedList.join(', ') : `Reorder ${formatLiters(Math.max(0, Number((p.threshold * 2 - p.stock).toFixed(2))))} L`;

            const isTotalDeficit = Number(p.stock) <= (productTotalThresholdLiters(p) || Number(p.threshold) || 0) || Number(p.stock) <= 0;

            return `
            <tr class="${isChecked ? 'row-selected' : ''}">
              ${canOrder && alertTab !== 'on_order' ? `
                <td style="text-align:center;">
                  <input type="checkbox" class="alert-prod-chk" value="${p.id}" ${isChecked ? 'checked' : ''} onchange="onAlertRowCheck(this, '${p.id}')">
                </td>
              ` : ''}
              <td>
                <div style="font-weight:600;">${escapeHtml(p.name)} <code style="font-family:'Space Grotesk',monospace; font-size:11px; font-weight:600; color:var(--teal);">(${getProductHex(p)})</code>${p.color !== '-' ? ' (' + escapeHtml(p.color) + ')' : ''}</div>
                ${lowSizes.length ? `<div style="font-size:11px; color:var(--danger); font-weight:600; margin-top:2px;">⚠️ ${productLowSizesSummary(p)}</div>` : ''}
                ${hasOpenOrder && alertTab === 'all' ? `
                  <div style="margin-top:3px;">
                    <a href="#" onclick="openPODetail('${openPOs[0].id}'); return false;" class="badge" style="background:#EBF5FB; color:#1B4F72; border:1px solid #AED6F1; font-size:10.5px; text-decoration:none;">
                      🚚 On Order: ${openPOs.map(o => o.poNumber).join(', ')}
                    </a>
                  </div>
                ` : ''}
              </td>
              <td>${escapeHtml(p.brand)}</td>
              <td>${supplierBadgesHtml(p.id)}</td>
              <td><div style="display:flex; flex-wrap:wrap; gap:2px;">${sizeBadges}</div></td>
              <td class="right" style="font-weight:700; ${isTotalDeficit ? 'color:var(--danger);' : ''}">${formatLiters(p.stock)}</td>

              ${alertTab === 'on_order' ? `
                <td>
                  ${openPOs.map(o => `<a href="#" onclick="openPODetail('${o.id}'); return false;" style="font-weight:700; color:var(--teal); text-decoration:underline; font-family:'Space Grotesk'; font-size:12.5px;">${o.poNumber}</a>`).join('<br>')}
                </td>
                <td>
                  ${openPOs.map(o => poStatusBadge(o.status)).join('<br>')}
                </td>
              ` : `
                <td style="font-size:12px; color:var(--ink-soft);">${suggestedStr}</td>
              `}

              <td class="center" style="white-space:nowrap;">
                ${hasOpenOrder ? `
                  <button type="button" class="btn secondary small" onclick="openPODetail('${openPOs[0].id}')" title="View existing Purchase Order">
                    👁️ View PO
                  </button>
                ` : `
                  ${canOrder ? `
                    <button type="button" class="btn small" onclick="createPOFromSelectedLowStock(['${p.id}'])" title="Directly create purchase order for ${escapeHtml(p.name)}">
                      + Create PO
                    </button>
                  ` : ''}
                `}
              </td>
            </tr>`;
          }).join('')
          : `<tr><td colspan="${alertTab === 'on_order' ? 8 : (canOrder ? 8 : 7)}" class="empty-state">
              ${alertTab === 'needing_po'
                ? '🎉 Excellent! No low-stock products currently need purchase orders.'
                : (alertTab === 'on_order'
                  ? 'No low-stock products are currently on order.'
                  : 'All products and sizes are above their reorder thresholds.')}
            </td></tr>`}
        </tbody>
      </table>
    </div>
  </div>

  <!-- Floating Quick Create Bar when items are selected -->
  <div id="alerts-floating-bar" class="alerts-selection-bar" style="${selectedCount > 0 ? 'display:flex;' : 'display:none;'}">
    <div style="display:flex; align-items:center; gap:10px;">
      <span style="font-size:18px;">📋</span>
      <span id="alerts-floating-label" style="font-weight:600;">${selectedCount} product${selectedCount === 1 ? '' : 's'} selected for purchase order</span>
    </div>
    <div style="display:flex; align-items:center; gap:8px;">
      <button class="btn ghost small" onclick="toggleSelectAllAlerts(false)" style="color:#fff; border-color:rgba(255,255,255,0.4);">Cancel</button>
      <button class="btn small" style="background:#fff; color:var(--teal-dark); font-weight:700; box-shadow:var(--shadow-md);" onclick="createPOFromSelectedAlerts()">
        ⚡ Create Purchase Order Now &rarr;
      </button>
    </div>
  </div>
  `;
}
