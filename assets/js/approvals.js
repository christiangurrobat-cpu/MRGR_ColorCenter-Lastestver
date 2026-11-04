/* ============================================================
   PENDING APPROVALS HUB (Admin Action Center)
   Consolidates Stock Adjustments, Product & Price Requests,
   and Purchase Order approvals in a single organized hub.
   ============================================================ */

let currentApprovalsTab = 'adjustments'; // 'adjustments' | 'products' | 'purchaseOrders' | 'history'
let approvalsSearchQuery = '';
let approvalsHistoryFilter = 'all'; // 'all' | 'approved' | 'rejected'
let approvalsDateFrom = '';
let approvalsDateTo = '';

function getApprovalsDatePreset() {
  return getDateRangePreset(approvalsDateFrom, approvalsDateTo);
}

function setApprovalsDatePreset(preset) {
  const today = todayISO();
  if (preset === 'today') {
    approvalsDateFrom = today;
    approvalsDateTo = today;
  } else if (preset === 'yesterday') {
    const yest = daysAgoISO(1);
    approvalsDateFrom = yest;
    approvalsDateTo = yest;
  } else if (preset === '7d') {
    approvalsDateFrom = daysAgoISO(6);
    approvalsDateTo = today;
  } else if (preset === '30d') {
    approvalsDateFrom = daysAgoISO(29);
    approvalsDateTo = today;
  } else if (preset === 'month') {
    approvalsDateFrom = thisMonthStartISO();
    approvalsDateTo = today;
  } else if (preset === 'all') {
    approvalsDateFrom = '';
    approvalsDateTo = '';
  }
  const contentEl = document.getElementById('approvals-tab-content');
  if (contentEl) contentEl.innerHTML = renderHistoryTab();
  else renderPage();
}

function onApprovalsDateChange() {
  const fromEl = document.getElementById('appr-date-from');
  const toEl = document.getElementById('appr-date-to');
  let f = fromEl ? fromEl.value : '';
  let t = toEl ? toEl.value : '';
  if (f && t && f > t) {
    const tmp = f;
    f = t;
    t = tmp;
    if (fromEl) fromEl.value = f;
    if (toEl) toEl.value = t;
  }
  approvalsDateFrom = f;
  approvalsDateTo = t;
  const contentEl = document.getElementById('approvals-tab-content');
  if (contentEl) contentEl.innerHTML = renderHistoryTab();
  else renderPage();
}

function clearApprovalsDates() {
  setApprovalsDatePreset('all');
}

/* Quick tab navigation helper */
function switchApprovalsTab(tab) {
  currentApprovalsTab = tab;
  const contentEl = document.getElementById('approvals-tab-content');
  if (contentEl) {
    contentEl.innerHTML = renderApprovalsTabContent();
    updateApprovalsTabUI();
  } else {
    renderPage();
  }
}

function goToApprovalsTab(tab) {
  currentApprovalsTab = tab;
  goTo('approvals');
}

function focusFirstPendingApprovalsTab() {
  const adjCount = getPendingAdjustmentRequests().length;
  const prodCount = getPendingProductsList().length;
  const poCount = getPendingPurchaseOrders().length;
  if (adjCount > 0) switchApprovalsTab('adjustments');
  else if (prodCount > 0) switchApprovalsTab('products');
  else if (poCount > 0) switchApprovalsTab('purchaseOrders');
  else switchApprovalsTab('history');
}

function setApprovalsSearch(query) {
  approvalsSearchQuery = String(query || '').trim().toLowerCase();
  const contentEl = document.getElementById('approvals-tab-content');
  if (contentEl) {
    contentEl.innerHTML = renderApprovalsTabContent();
  }
}

function clearApprovalsSearch() {
  approvalsSearchQuery = '';
  const inputEl = document.getElementById('approvals-search-input');
  if (inputEl) inputEl.value = '';
  const contentEl = document.getElementById('approvals-tab-content');
  if (contentEl) {
    contentEl.innerHTML = renderApprovalsTabContent();
  }
}

function setApprovalsHistoryFilter(filter) {
  approvalsHistoryFilter = filter;
  const contentEl = document.getElementById('approvals-tab-content');
  if (contentEl) {
    contentEl.innerHTML = renderApprovalsTabContent();
  }
}

/* ------------------------------------------------------------
   Data Query Helpers
   ------------------------------------------------------------ */
function getPendingAdjustmentRequests() {
  return (db.adjustmentRequests || []).filter(r => r.status === 'pending');
}

function getPendingProductsList() {
  const list = [];
  (db.products || []).forEach(p => {
    // 1. Completely new product
    if (p.status === 'pending_approval') {
      list.push({
        type: 'new_product',
        typeLabel: 'New Product',
        typeBadgeClass: 'ok',
        product: p,
        id: p.id,
        name: p.name,
        brand: p.brand,
        category: p.type,
        requestedBy: p.requestedBy || 'Staff',
        date: p.createdAt || p.updatedAt || nowISO(),
        detailsHtml: `<span>Initial price: <b>${peso(p.price)}</b> · Sizes: [${(p.sizes || []).map(s => s + 'L').join(', ')}] · Min threshold: ${p.threshold || 5}</span>`
      });
    }

    // 2. Price change request
    if (p.pendingPrice != null && Number(p.pendingPrice) > 0) {
      const oldPrice = Number(p.price);
      const newPrice = Number(p.pendingPrice);
      const diff = newPrice - oldPrice;
      const pct = oldPrice > 0 ? ((diff / oldPrice) * 100).toFixed(1) : '0';
      const pctClass = diff >= 0 ? 'up' : 'down';
      const pctSign = diff >= 0 ? '+' : '';

      list.push({
        type: 'price_change',
        typeLabel: 'Price Change',
        typeBadgeClass: 'mustard',
        product: p,
        id: p.id,
        name: p.name,
        brand: p.brand,
        category: p.type,
        requestedBy: p.pendingPriceBy || p.updatedBy || 'Staff',
        date: p.pendingPriceAt || p.updatedAt || nowISO(),
        detailsHtml: `
          <div class="price-diff-box">
            <span class="price-diff-old">${peso(oldPrice)}</span>
            <span class="price-diff-arrow">➔</span>
            <span class="price-diff-new">${peso(newPrice)}</span>
            <span class="price-diff-percent ${pctClass}">${pctSign}${pct}%</span>
          </div>
        `
      });
    }

    // 3. New sizes request
    if (Array.isArray(p.pendingSizes) && p.pendingSizes.length > 0) {
      list.push({
        type: 'sizes_add',
        typeLabel: 'New Sizes',
        typeBadgeClass: 'teal',
        product: p,
        id: p.id,
        name: p.name,
        brand: p.brand,
        category: p.type,
        requestedBy: p.pendingSizesBy || p.updatedBy || 'Staff',
        date: p.pendingSizesAt || p.updatedAt || nowISO(),
        detailsHtml: `
          <span>Existing: <b>[${(p.sizes || []).map(s => s + 'L').join(', ')}]</b> ➔ Adding: <b style="color:var(--teal); font-weight:700;">+ [${p.pendingSizes.map(s => s + 'L').join(', ')}]</b></span>
        `
      });
    }

    // 4. Product info edit
    if (p.pendingEdit && typeof p.pendingEdit === 'object') {
      const prop = p.pendingEdit.proposed || {};
      const changes = [];
      if (prop.name && prop.name !== p.name) changes.push(`Name: "${escapeHtml(prop.name)}"`);
      if (prop.brand && prop.brand !== p.brand) changes.push(`Brand: "${escapeHtml(prop.brand)}"`);
      if (prop.threshold !== undefined && Number(prop.threshold) !== Number(p.threshold)) {
        changes.push(`Min threshold: ${p.threshold} ➔ ${prop.threshold}`);
      }

      list.push({
        type: 'info_edit',
        typeLabel: 'Details Edit',
        typeBadgeClass: 'ghost',
        product: p,
        id: p.id,
        name: p.name,
        brand: p.brand,
        category: p.type,
        requestedBy: p.pendingEdit.requestedBy || 'Staff',
        date: p.pendingEdit.requestedAt || p.updatedAt || nowISO(),
        detailsHtml: `<span>${changes.length ? changes.join(' · ') : 'Product specification revisions'}</span>`
      });
    }
  });

  return list;
}

function getPendingPurchaseOrders() {
  return (db.purchaseOrders || []).filter(o => o.status === 'pending');
}

function getTotalPendingApprovalsCount() {
  const adjCount = getPendingAdjustmentRequests().length;
  const prodCount = getPendingProductsList().length;
  const poCount = getPendingPurchaseOrders().length;
  return adjCount + prodCount + poCount;
}

/* ------------------------------------------------------------
   Main Page Render
   ------------------------------------------------------------ */
function approvalsPage() {
  if (!currentUser || currentUser.role !== 'admin') {
    return `
      <div class="panel" style="padding:40px; text-align:center;">
        <h3>Access Restricted</h3>
        <p class="muted">Only Administrators have permission to review and approve requests.</p>
        <button class="btn small" onclick="goTo(defaultPageFor(currentUser ? currentUser.role : 'staff'))">Go to Dashboard</button>
      </div>
    `;
  }

  const adjList = getPendingAdjustmentRequests();
  const prodList = getPendingProductsList();
  const poList = getPendingPurchaseOrders();
  const totalPending = adjList.length + prodList.length + poList.length;

  // Auto-switch to a tab that has items if current is empty and total > 0
  if (totalPending > 0) {
    if (currentApprovalsTab === 'adjustments' && adjList.length === 0) {
      if (prodList.length > 0) currentApprovalsTab = 'products';
      else if (poList.length > 0) currentApprovalsTab = 'purchaseOrders';
    } else if (currentApprovalsTab === 'products' && prodList.length === 0) {
      if (adjList.length > 0) currentApprovalsTab = 'adjustments';
      else if (poList.length > 0) currentApprovalsTab = 'purchaseOrders';
    } else if (currentApprovalsTab === 'purchaseOrders' && poList.length === 0) {
      if (adjList.length > 0) currentApprovalsTab = 'adjustments';
      else if (prodList.length > 0) currentApprovalsTab = 'products';
    }
  }

  return `
    <div class="approvals-header">
      <div class="approvals-title-group">
        <h2>⏳ Pending Approvals Hub</h2>
        <div class="approvals-subtitle">
          Centralized governance hub for Administrator decisions on Stock Adjustments, Product Catalog updates, and Purchase Orders.
        </div>
      </div>
      <div style="display:flex; align-items:center; gap:8px;">
        <button class="btn secondary small" onclick="goTo('dashboard')" title="Back to main Dashboard">📊 Dashboard</button>
        <button class="btn secondary small" onclick="renderPage()" title="Refresh approvals data">🔄 Refresh</button>
      </div>
    </div>

    <!-- Metric KPI Cards (Click to switch tab) -->
    <div class="approvals-metric-grid">
      <div class="approvals-metric-card ${currentApprovalsTab === 'adjustments' ? 'active' : ''} ${adjList.length ? 'has-pending' : 'all-clear'}"
           onclick="switchApprovalsTab('adjustments')" title="Click to view Stock Adjustment requests">
        <div class="card-top">
          <span class="card-label">⚖️ Stock Adjustments</span>
          ${adjList.length ? `<span class="badge danger">${adjList.length} pending</span>` : '<span class="badge ok">✓ All clear</span>'}
        </div>
        <div class="card-value">${adjList.length}</div>
        <div class="card-sub">Damage, spillage & count recount requests</div>
      </div>

      <div class="approvals-metric-card ${currentApprovalsTab === 'products' ? 'active' : ''} ${prodList.length ? 'has-pending' : 'all-clear'}"
           onclick="switchApprovalsTab('products')" title="Click to view Product and Price change requests">
        <div class="card-top">
          <span class="card-label">📦 Products & Pricing</span>
          ${prodList.length ? `<span class="badge danger">${prodList.length} pending</span>` : '<span class="badge ok">✓ All clear</span>'}
        </div>
        <div class="card-value">${prodList.length}</div>
        <div class="card-sub">New items, price adjustments & size additions</div>
      </div>

      <div class="approvals-metric-card ${currentApprovalsTab === 'purchaseOrders' ? 'active' : ''} ${poList.length ? 'has-pending' : 'all-clear'}"
           onclick="switchApprovalsTab('purchaseOrders')" title="Click to view Purchase Order requests">
        <div class="card-top">
          <span class="card-label">📋 Purchase Orders</span>
          ${poList.length ? `<span class="badge danger">${poList.length} pending</span>` : '<span class="badge ok">✓ All clear</span>'}
        </div>
        <div class="card-value">${poList.length}</div>
        <div class="card-sub">Restock orders awaiting authorization</div>
      </div>

      <div class="approvals-metric-card ${totalPending ? 'has-pending' : 'all-clear'}"
           onclick="focusFirstPendingApprovalsTab()" style="background:#FAF8F5;" title="Click to focus active pending requests">
        <div class="card-top">
          <span class="card-label">⚡ Total Pending Actions</span>
          ${totalPending ? `<span class="badge danger">Action required</span>` : '<span class="badge ok">Up to date</span>'}
        </div>
        <div class="card-value">${totalPending}</div>
        <div class="card-sub">${totalPending === 1 ? '1 item awaiting decision' : `${totalPending} items awaiting decision`} (click to jump)</div>
      </div>
    </div>

    <!-- Tabs and Filter Bar -->
    <div class="approvals-tabs-bar">
      <div class="approvals-tabs" id="approvals-tabs-container">
        ${renderApprovalsTabButtons(adjList.length, prodList.length, poList.length)}
      </div>

      <div style="display:flex; align-items:center; gap:8px;">
        <div style="position:relative; display:inline-flex; align-items:center;">
          <input type="search" id="approvals-search-input" placeholder="Search requests..." value="${escapeHtml(approvalsSearchQuery)}"
                 oninput="setApprovalsSearch(this.value)"
                 style="padding:6px 28px 6px 12px; border:1px solid var(--line); border-radius:6px; font-size:13px; width:220px;" />
          ${approvalsSearchQuery ? `
            <button type="button" onclick="clearApprovalsSearch()"
                    style="position:absolute; right:6px; background:none; border:none; color:var(--ink-soft); cursor:pointer; font-size:13px; padding:2px 6px;" title="Clear search">✕</button>
          ` : ''}
        </div>
      </div>
    </div>

    <!-- Active Tab Content Container -->
    <div id="approvals-tab-content">
      ${renderApprovalsTabContent()}
    </div>
  `;
}

function renderApprovalsTabButtons(adjCount, prodCount, poCount) {
  return `
    <button type="button" class="approvals-tab-btn ${currentApprovalsTab === 'adjustments' ? 'active' : ''}"
            onclick="switchApprovalsTab('adjustments')" title="Stock Adjustment Requests">
      <span>⚖️ Stock Adjustments</span>
      <span class="approvals-tab-badge ${adjCount === 0 ? 'zero' : ''}">${adjCount}</span>
    </button>
    <button type="button" class="approvals-tab-btn ${currentApprovalsTab === 'products' ? 'active' : ''}"
            onclick="switchApprovalsTab('products')" title="Product, Price & Size Requests">
      <span>📦 Products & Pricing</span>
      <span class="approvals-tab-badge ${prodCount === 0 ? 'zero' : ''}">${prodCount}</span>
    </button>
    <button type="button" class="approvals-tab-btn ${currentApprovalsTab === 'purchaseOrders' ? 'active' : ''}"
            onclick="switchApprovalsTab('purchaseOrders')" title="Purchase Orders for Authorization">
      <span>📋 Purchase Orders</span>
      <span class="approvals-tab-badge ${poCount === 0 ? 'zero' : ''}">${poCount}</span>
    </button>
    <button type="button" class="approvals-tab-btn ${currentApprovalsTab === 'history' ? 'active' : ''}"
            onclick="switchApprovalsTab('history')" title="Audit Log of Past Approval Decisions">
      <span>📜 Decision History</span>
    </button>
  `;
}

function updateApprovalsTabUI() {
  const container = document.getElementById('approvals-tabs-container');
  if (container) {
    const adjCount = getPendingAdjustmentRequests().length;
    const prodCount = getPendingProductsList().length;
    const poCount = getPendingPurchaseOrders().length;
    container.innerHTML = renderApprovalsTabButtons(adjCount, prodCount, poCount);
  }
}

function renderApprovalsTabContent() {
  if (currentApprovalsTab === 'adjustments') return renderAdjustmentsTab();
  if (currentApprovalsTab === 'products') return renderProductsTab();
  if (currentApprovalsTab === 'purchaseOrders') return renderPurchaseOrdersTab();
  if (currentApprovalsTab === 'history') return renderHistoryTab();
  return renderAdjustmentsTab();
}

/* ------------------------------------------------------------
   Tab 1: Stock Adjustments
   ------------------------------------------------------------ */
function renderAdjustmentsTab() {
  let list = getPendingAdjustmentRequests();

  if (approvalsSearchQuery) {
    const q = approvalsSearchQuery;
    list = list.filter(r => {
      const basicMatch = (r.reqNumber || '').toLowerCase().includes(q) ||
        (r.requestedBy || '').toLowerCase().includes(q) ||
        (r.reason || '').toLowerCase().includes(q) ||
        (r.batchNote || '').toLowerCase().includes(q);
      if (basicMatch) return true;
      const rows = Array.isArray(r.rows) ? r.rows : (r.rowsJson ? JSON.parse(r.rowsJson) : []);
      return rows.some(row => {
        const p = productById(row.productId);
        const pName = p ? p.name.toLowerCase() : '';
        const pBrand = p ? p.brand.toLowerCase() : '';
        const reason = (row.reason || '').toLowerCase();
        const note = (row.note || '').toLowerCase();
        return pName.includes(q) || pBrand.includes(q) || reason.includes(q) || note.includes(q);
      });
    });
  }

  if (list.length === 0) {
    const totalPending = getTotalPendingApprovalsCount();
    return `
      <div class="approvals-empty-state">
        <div class="approvals-empty-icon">🎉</div>
        <div class="approvals-empty-title">No pending Stock Adjustment requests!</div>
        <div class="approvals-empty-desc">
          All damage, spoilage, and recount discrepancy requests submitted by warehouse staff have been reviewed and resolved.
        </div>
        <div style="display:flex; justify-content:center; gap:10px; margin-top:16px; flex-wrap:wrap;">
          <button type="button" class="btn secondary small" onclick="switchApprovalsTab('history')">📜 View Decision History</button>
          ${totalPending > 0 ? `<button type="button" class="btn small" onclick="focusFirstPendingApprovalsTab()">⚡ Check Other Pending Items (${totalPending}) &rarr;</button>` : ''}
          <button type="button" class="btn ghost small" onclick="goTo('dashboard')">📊 Back to Dashboard</button>
        </div>
      </div>
    `;
  }

  return `
    <div class="panel">
      <div class="panel-head row" style="background:#FAF8F5;">
        <div style="font-weight:700; font-size:13.5px; color:var(--ink);">
          Awaiting Review (${list.length} request${list.length === 1 ? '' : 's'})
        </div>
        <div class="spacer"></div>
        ${list.length > 1 ? `
          <button type="button" class="btn secondary small" onclick="approveAllPendingAdjustmentsBatch()" style="font-size:12px; margin-right:8px;">
            ✓ Approve All Adjustments (${list.length})
          </button>
        ` : ''}
        <span class="muted small">Staff cannot modify stock until you approve these requests.</span>
      </div>
      <div class="panel-body tight table-scroll">
        <table>
          <thead>
            <tr>
              <th>Request #</th>
              <th>Date Submitted</th>
              <th>Staff Requester</th>
              <th>Category / Reason</th>
              <th>Items & Qty Impact</th>
              <th>Staff Notes</th>
              <th class="right">Action</th>
            </tr>
          </thead>
          <tbody>
            ${list.map(r => {
    const rows = Array.isArray(r.rows) ? r.rows : (r.rowsJson ? JSON.parse(r.rowsJson) : []);
    const totalItems = rows.length;
    let totalCans = 0;
    rows.forEach(row => { totalCans += Math.abs(Number(row.qty) || 0); });

    return `
                <tr>
                  <td>
                    <a href="#" onclick="viewAdjRequestDetails('${r.id}'); return false;"
                       class="badge ghost approvals-clickable-ref"
                       style="font-family:'Space Grotesk',monospace; font-weight:700; color:var(--teal-dark);"
                       title="Click to view complete adjustment details">
                      ${escapeHtml(r.reqNumber)}
                    </a>
                  </td>
                  <td style="font-size:12.5px; color:var(--ink-soft); white-space:nowrap;">
                    ${formatDateTime(r.date || r.createdAt)}
                  </td>
                  <td>
                    <div style="font-weight:600; color:var(--ink);">${escapeHtml(r.requestedBy)}</div>
                    <span class="badge ghost small" style="font-size:10px;">Staff</span>
                  </td>
                  <td>
                    <span class="badge mustard" style="font-weight:600;">
                      ${escapeHtml(r.reason || 'Stock Adjustment')}
                    </span>
                  </td>
                  <td>
                    <div style="font-weight:600; color:var(--ink);">${totalItems} item${totalItems === 1 ? '' : 's'} (${totalCans} cans)</div>
                    <div class="muted small">${rows.map(x => {
      const p = productById(x.productId);
      return p ? p.name : 'Item';
    }).slice(0, 2).join(', ')}${totalItems > 2 ? '…' : ''}</div>
                  </td>
                  <td style="max-width:200px; font-size:12.5px; color:var(--ink-soft);">
                    ${r.batchNote ? `"${escapeHtml(r.batchNote)}"` : '<span class="muted">-</span>'}
                  </td>
                  <td class="right" style="white-space:nowrap;">
                    <div class="approvals-action-group" style="justify-content:flex-end;">
                      <button type="button" class="btn ghost small" onclick="viewAdjRequestDetails('${r.id}')" title="View breakdown of products and sizes">
                        🔍 Details
                      </button>
                      <button type="button" class="btn small" onclick="confirmApproveAdjRequest('${r.id}')" title="Approve adjustment and commit inventory change">
                        ✓ Approve
                      </button>
                      <button type="button" class="btn secondary small danger" onclick="openRejectAdjRequestModal('${r.id}')" title="Reject this adjustment request">
                        ✕ Reject
                      </button>
                    </div>
                  </td>
                </tr>
              `;
  }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

/* ------------------------------------------------------------
   Tab 2: Products & Pricing
   ------------------------------------------------------------ */
function renderProductsTab() {
  let list = getPendingProductsList();

  if (approvalsSearchQuery) {
    const q = approvalsSearchQuery;
    list = list.filter(it =>
      (it.name || '').toLowerCase().includes(q) ||
      (it.brand || '').toLowerCase().includes(q) ||
      (it.category || '').toLowerCase().includes(q) ||
      (it.requestedBy || '').toLowerCase().includes(q) ||
      (it.typeLabel || '').toLowerCase().includes(q)
    );
  }

  if (list.length === 0) {
    const totalPending = getTotalPendingApprovalsCount();
    return `
      <div class="approvals-empty-state">
        <div class="approvals-empty-icon">🎉</div>
        <div class="approvals-empty-title">No pending Product or Price requests!</div>
        <div class="approvals-empty-desc">
          There are currently no new products, price alterations, or size variant additions waiting for Administrator approval.
        </div>
        <div style="display:flex; justify-content:center; gap:10px; margin-top:16px; flex-wrap:wrap;">
          <button type="button" class="btn secondary small" onclick="switchApprovalsTab('history')">📜 View Decision History</button>
          ${totalPending > 0 ? `<button type="button" class="btn small" onclick="focusFirstPendingApprovalsTab()">⚡ Check Other Pending Items (${totalPending}) &rarr;</button>` : ''}
          <button type="button" class="btn ghost small" onclick="goTo('dashboard')">📊 Back to Dashboard</button>
        </div>
      </div>
    `;
  }

  return `
    <div class="panel">
      <div class="panel-head row" style="background:#FAF8F5;">
        <div style="font-weight:700; font-size:13.5px; color:var(--ink);">
          Product Requests (${list.length} item${list.length === 1 ? '' : 's'})
        </div>
        <div class="spacer"></div>
        <button type="button" class="btn secondary small" onclick="approveAllPendingProductsBatch()" style="font-size:12px;">
          ✓ Approve All Products (${list.length})
        </button>
      </div>
      <div class="panel-body tight table-scroll">
        <table>
          <thead>
            <tr>
              <th>Request Type</th>
              <th>Product Information</th>
              <th>Proposed Update / Details</th>
              <th>Requested By</th>
              <th class="right">Action</th>
            </tr>
          </thead>
          <tbody>
            ${list.map(it => {
    return `
                <tr>
                  <td>
                    <span class="badge ${it.typeBadgeClass}" style="font-weight:700; font-size:11px;">
                      ${it.typeLabel}
                    </span>
                  </td>
                  <td>
                    <div>
                      <a href="#" onclick="openProductApprovalPreviewModal('${it.id}'); return false;"
                         class="approvals-clickable-ref"
                         style="font-weight:700; color:var(--ink);"
                         title="Click to preview complete product specifications">
                        ${escapeHtml(it.name)}
                      </a>
                    </div>
                    <div class="muted small">${escapeHtml(it.brand || '')} · ${escapeHtml(it.category || '')}</div>
                  </td>
                  <td>
                    ${it.detailsHtml}
                  </td>
                  <td style="font-size:12px; color:var(--ink-soft);">
                    <div><b>${escapeHtml(it.requestedBy)}</b></div>
                    <div class="muted small">${formatDateTime(it.date)}</div>
                  </td>
                  <td class="right" style="white-space:nowrap;">
                    <div class="approvals-action-group" style="justify-content:flex-end;">
                      ${renderProductActionButtons(it)}
                    </div>
                  </td>
                </tr>
              `;
  }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderProductActionButtons(it) {
  if (it.type === 'new_product') {
    return `
      <button type="button" class="btn ghost small" onclick="openProductApprovalPreviewModal('${it.id}')" title="Preview product details">
        🔍 Details
      </button>
      <button type="button" class="btn small" onclick="approvePendingProduct('${it.id}')" title="Approve and activate this new product">
        ✓ Approve
      </button>
      <button type="button" class="btn secondary small danger" onclick="rejectPendingProduct('${it.id}')" title="Reject and delete this product draft">
        ✕ Reject
      </button>
    `;
  }
  if (it.type === 'price_change') {
    return `
      <button type="button" class="btn small" onclick="approvePendingProductPrice('${it.id}')" title="Approve new price">
        ✓ Approve
      </button>
      <button type="button" class="btn secondary small danger" onclick="confirmRejectProductPrice('${it.id}')" title="Reject new price">
        ✕ Reject
      </button>
    `;
  }
  if (it.type === 'sizes_add') {
    return `
      <button type="button" class="btn small" onclick="approvePendingProductSizes('${it.id}')" title="Approve new size variants">
        ✓ Approve
      </button>
      <button type="button" class="btn secondary small danger" onclick="confirmRejectProductSizes('${it.id}')" title="Reject size additions">
        ✕ Reject
      </button>
    `;
  }
  if (it.type === 'info_edit') {
    return `
      <button type="button" class="btn small" onclick="approveProductPendingEdits('${it.id}')" title="Approve product edits">
        ✓ Approve
      </button>
      <button type="button" class="btn secondary small danger" onclick="rejectProductPendingEdits('${it.id}')" title="Reject product edits">
        ✕ Reject
      </button>
    `;
  }
  return '';
}

async function confirmRejectProductPrice(id) {
  const p = productById(id);
  if (!p || p.pendingPrice === null || p.pendingPrice === undefined) return;

  const confirmed = await showConfirmDialog({
    title: 'Reject Price Change?',
    message: `Reject proposed price change for <b>${escapeHtml(p.name)}</b> from <b>${peso(p.price)}</b> to <b>${peso(p.pendingPrice)}</b>?`,
    icon: '⚠️',
    confirmText: 'Yes, Reject Price',
    cancelText: 'Cancel',
    danger: true
  });
  if (!confirmed) return;

  await rejectPendingProductPrice(id);
}

async function confirmRejectProductSizes(id) {
  const p = productById(id);
  if (!p || !Array.isArray(p.pendingSizes) || !p.pendingSizes.length) return;

  const confirmed = await showConfirmDialog({
    title: 'Reject Size Additions?',
    message: `Reject proposed size additions [${p.pendingSizes.map(s => s + 'L').join(', ')}] for <b>${escapeHtml(p.name)}</b>?`,
    icon: '⚠️',
    confirmText: 'Yes, Reject Sizes',
    cancelText: 'Cancel',
    danger: true
  });
  if (!confirmed) return;

  await rejectPendingProductSizes(id);
}

async function approveAllPendingProductsBatch() {
  const list = getPendingProductsList();
  if (!list.length) {
    showToast('No pending products to approve.', 'warn');
    return;
  }

  const confirmed = await showConfirmDialog({
    title: 'Approve All Product Requests?',
    message: `Are you sure you want to approve all <b>${list.length} pending product, price, and size update(s)</b> at once?`,
    icon: '✅',
    confirmText: `Yes, Approve All (${list.length})`,
    cancelText: 'Cancel'
  });
  if (!confirmed) return;

  for (const it of list) {
    if (it.type === 'new_product') {
      const p = productById(it.id);
      if (p && p.status === 'pending_approval') {
        p.status = 'active';
        p.reviewedBy = (currentUser && currentUser.name) || 'Administrator';
        p.reviewedAt = nowISO();
      }
    } else if (it.type === 'price_change') {
      const p = productById(it.id);
      if (p && p.pendingPrice != null) {
        p.recentPrice = Number(p.price);
        p.price = Number(p.pendingPrice);
        p.pendingPrice = null;
      }
    } else if (it.type === 'sizes_add') {
      const p = productById(it.id);
      if (p && Array.isArray(p.pendingSizes)) {
        p.sizes = sanitizeSizeList([...(p.sizes || []), ...p.pendingSizes]);
        p.pendingSizes = [];
      }
    } else if (it.type === 'info_edit') {
      const p = productById(it.id);
      if (p && p.pendingEdit && p.pendingEdit.proposed) {
        Object.assign(p, p.pendingEdit.proposed);
        p.pendingEdit = null;
      }
    }
  }

  logAudit('PRODUCT_BATCH_APPROVE', 'Product', `Batch approved ${list.length} pending product request(s)`);
  await saveDB();
  showToast(`Successfully approved all ${list.length} product request(s)!`, 'ok');
  renderPage();
}

async function approveAllPendingAdjustmentsBatch() {
  const list = getPendingAdjustmentRequests();
  if (!list.length) return;

  const confirmed = await showConfirmDialog({
    title: 'Approve All Adjustment Requests?',
    message: `Are you sure you want to approve all <b>${list.length} pending stock adjustment request(s)</b> at once? Warehouse inventory levels will be updated immediately.`,
    icon: '✅',
    confirmText: `Yes, Approve All (${list.length})`,
    cancelText: 'Cancel'
  });
  if (!confirmed) return;

  for (const req of list) {
    const rows = Array.isArray(req.rows) ? req.rows : (req.rowsJson ? JSON.parse(req.rowsJson) : []);
    await executeStockAdjustment(rows, req.requestedBy);
    req.status = 'approved';
    req.reviewedBy = (currentUser && currentUser.name) || 'Administrator';
    req.reviewedAt = nowISO();
  }

  logAudit('ADJ_BATCH_APPROVE', 'Stock Adjustment', `Batch approved ${list.length} stock adjustment request(s)`);
  await saveDB();
  showToast(`Approved all ${list.length} adjustment request(s) and updated stock!`, 'ok');
  renderPage();
}

/* ------------------------------------------------------------
   Tab 3: Purchase Orders
   ------------------------------------------------------------ */
function renderPurchaseOrdersTab() {
  let list = getPendingPurchaseOrders();

  if (approvalsSearchQuery) {
    const q = approvalsSearchQuery;
    list = list.filter(o =>
      (o.poNumber || '').toLowerCase().includes(q) ||
      (o.supplierName || '').toLowerCase().includes(q) ||
      (o.createdBy || '').toLowerCase().includes(q) ||
      (o.notes || '').toLowerCase().includes(q)
    );
  }

  if (list.length === 0) {
    const totalPending = getTotalPendingApprovalsCount();
    return `
      <div class="approvals-empty-state">
        <div class="approvals-empty-icon">🎉</div>
        <div class="approvals-empty-title">No pending Purchase Orders!</div>
        <div class="approvals-empty-desc">
          All purchase order restock requests submitted by staff have been reviewed and authorized.
        </div>
        <div style="display:flex; justify-content:center; gap:10px; margin-top:16px; flex-wrap:wrap;">
          <button type="button" class="btn secondary small" onclick="switchApprovalsTab('history')">📜 View Decision History</button>
          ${totalPending > 0 ? `<button type="button" class="btn small" onclick="focusFirstPendingApprovalsTab()">⚡ Check Other Pending Items (${totalPending}) &rarr;</button>` : ''}
          <button type="button" class="btn ghost small" onclick="goTo('dashboard')">📊 Back to Dashboard</button>
        </div>
      </div>
    `;
  }

  return `
    <div class="panel">
      <div class="panel-head row" style="background:#FAF8F5;">
        <div style="font-weight:700; font-size:13.5px; color:var(--ink);">
          Awaiting Authorization (${list.length} order${list.length === 1 ? '' : 's'})
        </div>
        <div class="spacer"></div>
        ${list.length > 1 ? `
          <button type="button" class="btn secondary small" onclick="authorizeAllPendingPOsBatch()" style="font-size:12px; margin-right:8px;">
            ✓ Authorize All Orders (${list.length})
          </button>
        ` : ''}
        <span class="muted small">Staff can only receive shipments after your authorization.</span>
      </div>
      <div class="panel-body tight table-scroll">
        <table>
          <thead>
            <tr>
              <th>PO #</th>
              <th>Order Date</th>
              <th>Supplier</th>
              <th>Items & Cans</th>
              <th class="right">Total Cost</th>
              <th>Created By</th>
              <th class="right">Action</th>
            </tr>
          </thead>
          <tbody>
            ${list.map(o => {
    const items = Array.isArray(o.items) ? o.items : [];
    const totalCans = items.reduce((sum, it) => sum + (Number(it.orderedQty) || 0), 0);

    return `
                <tr>
                  <td>
                    <a href="#" onclick="openPOPreviewModal('${o.id}'); return false;"
                       class="badge ghost approvals-clickable-ref"
                       style="font-family:'Space Grotesk',monospace; font-weight:700; color:var(--teal-dark);"
                       title="Click to preview order items and totals">
                      ${escapeHtml(o.poNumber)}
                    </a>
                  </td>
                  <td style="font-size:12.5px; color:var(--ink-soft); white-space:nowrap;">
                    ${formatDateOnly(o.orderDate || o.createdAt)}
                  </td>
                  <td>
                    <div style="font-weight:700; color:var(--ink);">${escapeHtml(o.supplierName || 'Unknown')}</div>
                  </td>
                  <td>
                    <div style="font-weight:600; color:var(--ink);">${items.length} item${items.length === 1 ? '' : 's'} (${totalCans} cans)</div>
                    <div class="muted small">${items.slice(0, 2).map(it => escapeHtml(it.productName || '')).join(', ')}${items.length > 2 ? '…' : ''}</div>
                  </td>
                  <td class="right" style="font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:14px; color:var(--ink);">
                    ${peso(o.totalAmount)}
                  </td>
                  <td>
                    <div style="font-weight:600; color:var(--ink);">${escapeHtml(o.createdBy || 'Staff')}</div>
                  </td>
                  <td class="right" style="white-space:nowrap;">
                    <div class="approvals-action-group" style="justify-content:flex-end;">
                      <button type="button" class="btn ghost small" onclick="openPOPreviewModal('${o.id}')" title="View order line items and details">
                        🔍 View PO
                      </button>
                      <button type="button" class="btn small" onclick="confirmApprovePO('${o.id}')" title="Approve this PO and unlock for staff receiving">
                        ✓ Authorize
                      </button>
                      <button type="button" class="btn secondary small danger" onclick="confirmCancelPO('${o.id}')" title="Cancel/reject this PO">
                        ✕ Cancel
                      </button>
                    </div>
                  </td>
                </tr>
              `;
  }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function authorizeAllPendingPOsBatch() {
  const list = getPendingPurchaseOrders();
  if (!list.length) return;

  const totalSum = list.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);
  const confirmed = await showConfirmDialog({
    title: 'Authorize All Purchase Orders?',
    message: `Are you sure you want to authorize all <b>${list.length} pending Purchase Orders</b> (${peso(totalSum)} total)? Staff will immediately be unlocked to receive these shipments.`,
    icon: '✅',
    confirmText: `Yes, Authorize All (${list.length})`,
    cancelText: 'Cancel'
  });
  if (!confirmed) return;

  for (const po of list) {
    po.status = 'ordered';
  }

  logAudit('PO_BATCH_APPROVE', 'Purchase Order', `Batch authorized ${list.length} purchase order(s)`);
  await saveDB();
  showToast(`Authorized all ${list.length} purchase orders!`, 'ok');
  renderPage();
}

/* ------------------------------------------------------------
   Tab 4: Decision History
   ------------------------------------------------------------ */
function renderHistoryTab() {
  const events = [];

  // 1. Past Adjustment Requests
  (db.adjustmentRequests || []).forEach(r => {
    if (r.status === 'approved' || r.status === 'rejected') {
      events.push({
        id: r.id,
        date: r.reviewedAt || r.date || r.createdAt,
        type: 'Stock Adjustment',
        category: 'adjustment',
        ref: r.reqNumber,
        requester: r.requestedBy,
        reviewedBy: r.reviewedBy || 'Administrator',
        decision: r.status,
        remarks: r.status === 'rejected' ? (r.rejectReason || 'Rejected') : (r.batchNote || 'Approved & stock adjusted')
      });
    }
  });

  // 2. Past Purchase Orders
  (db.purchaseOrders || []).forEach(o => {
    if (o.status === 'ordered' || o.status === 'partial' || o.status === 'received' || o.status === 'cancelled') {
      events.push({
        id: o.id,
        date: o.updatedAt || o.orderDate || o.createdAt,
        type: 'Purchase Order',
        category: 'purchaseOrder',
        ref: o.poNumber,
        requester: o.createdBy || 'Staff',
        reviewedBy: 'Administrator',
        decision: o.status === 'cancelled' ? 'rejected' : 'approved',
        remarks: o.status === 'cancelled' ? 'Order cancelled' : `Authorized order for ${escapeHtml(o.supplierName)} (${peso(o.totalAmount)})`
      });
    }
  });

  // 3. Past Product Approvals from Audit Log
  (db.auditLog || []).forEach(a => {
    const act = a.action || '';
    if (act.includes('PRODUCT_APPROVE') || act.includes('PRODUCT_REJECT') || act.includes('PRODUCT_PRICE_APPROVE') || act.includes('PRODUCT_PRICE_REJECT')) {
      events.push({
        id: null,
        date: a.timestamp || a.date,
        type: 'Product Catalog',
        category: 'product',
        ref: a.details || 'Product Update',
        requester: 'Staff',
        reviewedBy: a.userName || 'Administrator',
        decision: act.includes('REJECT') ? 'rejected' : 'approved',
        remarks: a.details || ''
      });
    }
  });

  // Sort latest first
  events.sort((a, b) => new Date(b.date) - new Date(a.date));

  let filtered = events;
  if (approvalsHistoryFilter !== 'all') {
    filtered = filtered.filter(e => e.decision === approvalsHistoryFilter);
  }

  if (approvalsDateFrom) {
    filtered = filtered.filter(e => String(e.date || '').slice(0, 10) >= approvalsDateFrom);
  }
  if (approvalsDateTo) {
    filtered = filtered.filter(e => String(e.date || '').slice(0, 10) <= approvalsDateTo);
  }

  if (approvalsSearchQuery) {
    const q = approvalsSearchQuery;
    filtered = filtered.filter(e =>
      (e.ref || '').toLowerCase().includes(q) ||
      (e.type || '').toLowerCase().includes(q) ||
      (e.requester || '').toLowerCase().includes(q) ||
      (e.reviewedBy || '').toLowerCase().includes(q) ||
      (e.remarks || '').toLowerCase().includes(q)
    );
  }

  const activePreset = getApprovalsDatePreset();
  const hasDates = Boolean(approvalsDateFrom || approvalsDateTo);

  return `
    <div class="panel" style="padding:0; overflow:hidden;">
      <div class="panel-head row" style="background:#FAF8F5; padding:12px 16px;">
        <div style="font-weight:700; font-size:13.5px; color:var(--ink);">
          Recent Approvals &amp; Decisions Log (${filtered.length})
        </div>
        <div class="spacer"></div>
        <div class="filter-pills" style="margin:0;">
          <button type="button" class="filter-pill ${approvalsHistoryFilter === 'all' ? 'active' : ''}" onclick="setApprovalsHistoryFilter('all')">All</button>
          <button type="button" class="filter-pill ${approvalsHistoryFilter === 'approved' ? 'active' : ''}" onclick="setApprovalsHistoryFilter('approved')">Approved Only</button>
          <button type="button" class="filter-pill ${approvalsHistoryFilter === 'rejected' ? 'active' : ''}" onclick="setApprovalsHistoryFilter('rejected')">Rejected Only</button>
        </div>
      </div>

      <!-- Dedicated Date Range Bar & Quick Presets (matches Audit Log) -->
      <div class="audit-date-bar" style="padding:10px 16px; border-top:1px dashed var(--line-light); border-bottom:1px solid var(--line-light); background:#FBF9F4;">
        <div class="audit-date-group">
          <label class="audit-date-label">📅 Date Range:</label>
          <div class="audit-date-field" title="Start date">
            <span class="field-tag">From</span>
            <input id="appr-date-from" type="date" value="${escapeHtml(approvalsDateFrom)}" max="${escapeHtml(approvalsDateTo || '')}" onchange="onApprovalsDateChange()">
          </div>
          <span class="audit-date-sep">to</span>
          <div class="audit-date-field" title="End date">
            <span class="field-tag">To</span>
            <input id="appr-date-to" type="date" value="${escapeHtml(approvalsDateTo)}" min="${escapeHtml(approvalsDateFrom || '')}" onchange="onApprovalsDateChange()">
          </div>
          <button type="button" id="appr-clear-date-btn" class="audit-clear-date-btn" onclick="clearApprovalsDates()" title="Clear date range" style="display:${hasDates ? 'inline-flex' : 'none'};">✕</button>
        </div>

        <div class="audit-date-shortcuts">
          <button type="button" class="audit-date-btn ${activePreset === 'today' ? 'active' : ''}" data-preset="today" onclick="setApprovalsDatePreset('today')" title="Decisions made today">Today</button>
          <button type="button" class="audit-date-btn ${activePreset === 'yesterday' ? 'active' : ''}" data-preset="yesterday" onclick="setApprovalsDatePreset('yesterday')" title="Decisions made yesterday">Yesterday</button>
          <button type="button" class="audit-date-btn ${activePreset === '7d' ? 'active' : ''}" data-preset="7d" onclick="setApprovalsDatePreset('7d')" title="Last 7 days">7D</button>
          <button type="button" class="audit-date-btn ${activePreset === '30d' ? 'active' : ''}" data-preset="30d" onclick="setApprovalsDatePreset('30d')" title="Last 30 days">30D</button>
          <button type="button" class="audit-date-btn ${activePreset === 'month' ? 'active' : ''}" data-preset="month" onclick="setApprovalsDatePreset('month')" title="This month to date">This Month</button>
          <button type="button" class="audit-date-btn ${activePreset === 'all' ? 'active' : ''}" data-preset="all" onclick="setApprovalsDatePreset('all')" title="Show all decision history">All</button>
        </div>

        <div class="audit-date-info" id="appr-date-summary">
          ${formatDateRangeSummary(approvalsDateFrom, approvalsDateTo, 'Decision date:')}
        </div>
      </div>
      <div class="panel-body tight table-scroll">
        ${filtered.length === 0 ? `
          <div style="text-align:center; padding:36px; color:var(--ink-soft);">
            No past approval decisions found matching this filter.
          </div>
        ` : `
          <table>
            <thead>
              <tr>
                <th>Date & Time</th>
                <th>Category</th>
                <th>Reference / Target</th>
                <th>Requester</th>
                <th>Decision</th>
                <th>Decided By</th>
                <th>Remarks / Reason</th>
                <th class="right">Action</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.slice(0, 50).map(e => `
                <tr>
                  <td style="font-size:12.5px; color:var(--ink-soft); white-space:nowrap;">
                    ${formatDateTime(e.date)}
                  </td>
                  <td>
                    <span class="badge ghost small" style="font-weight:600;">${e.type}</span>
                  </td>
                  <td>
                    ${renderHistoryRefCell(e)}
                  </td>
                  <td style="font-size:12.5px; color:var(--ink-soft);">
                    ${escapeHtml(e.requester || 'Staff')}
                  </td>
                  <td>
                    ${e.decision === 'approved'
      ? '<span class="badge ok" style="font-weight:700;">✓ Approved</span>'
      : '<span class="badge danger" style="font-weight:700;">✕ Rejected</span>'}
                  </td>
                  <td style="font-size:12.5px; color:var(--ink-soft);">
                    ${escapeHtml(e.reviewedBy)}
                  </td>
                  <td style="font-size:12px; color:var(--ink-soft); max-width:240px;">
                    ${escapeHtml(e.remarks)}
                  </td>
                  <td class="right" style="white-space:nowrap;">
                    ${renderHistoryActionBtn(e)}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `}
      </div>
    </div>
  `;
}

function renderHistoryRefCell(e) {
  if (e.category === 'adjustment' && e.id) {
    return `<a href="#" onclick="viewAdjRequestDetails('${e.id}'); return false;"
               class="approvals-clickable-ref" style="font-weight:600; color:var(--teal);"
               title="Click to view full adjustment record">${escapeHtml(e.ref)}</a>`;
  }
  if (e.category === 'purchaseOrder' && e.id) {
    return `<a href="#" onclick="openPOPreviewModal('${e.id}'); return false;"
               class="approvals-clickable-ref" style="font-weight:600; color:var(--teal);"
               title="Click to view purchase order record">${escapeHtml(e.ref)}</a>`;
  }
  return `<span style="font-weight:600; color:var(--ink);">${escapeHtml(e.ref)}</span>`;
}

function renderHistoryActionBtn(e) {
  if (e.category === 'adjustment' && e.id) {
    return `<button type="button" class="btn ghost small" onclick="viewAdjRequestDetails('${e.id}')" title="View details of this adjustment">🔍 Details</button>`;
  }
  if (e.category === 'purchaseOrder' && e.id) {
    return `<button type="button" class="btn ghost small" onclick="openPOPreviewModal('${e.id}')" title="View details of this purchase order">🔍 View PO</button>`;
  }
  return '<span class="muted small">-</span>';
}

/* ------------------------------------------------------------
   Custom Rejection Modal for Stock Adjustments
   ------------------------------------------------------------ */
function openRejectAdjRequestModal(reqId) {
  const req = (db.adjustmentRequests || []).find(r => r.id === reqId);
  if (!req || req.status !== 'pending') return;

  const bodyHtml = `
    <div>
      <div style="background:#FAF8F5; border:1px solid var(--line); border-radius:6px; padding:12px 14px; margin-bottom:14px; font-size:13px;">
        <div>Request: <b style="font-family:'Space Grotesk',monospace; color:var(--ink);">${escapeHtml(req.reqNumber)}</b></div>
        <div class="muted small" style="margin-top:2px;">Submitted by <b>${escapeHtml(req.requestedBy)}</b> · Category: <b>${escapeHtml(req.reason)}</b></div>
      </div>

      <label style="font-weight:600; font-size:13px; color:var(--ink); display:block; margin-bottom:6px;">
        Reason for Rejection:
      </label>
      <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:8px;">
        <button type="button" class="reason-chip-btn" onclick="document.getElementById('adj-reject-reason-input').value='Discrepancy in physical count / recount needed'">Count Discrepancy</button>
        <button type="button" class="reason-chip-btn" onclick="document.getElementById('adj-reject-reason-input').value='Unverified damage or spillage'">Unverified Damage</button>
        <button type="button" class="reason-chip-btn" onclick="document.getElementById('adj-reject-reason-input').value='Duplicate adjustment request'">Duplicate Request</button>
        <button type="button" class="reason-chip-btn" onclick="document.getElementById('adj-reject-reason-input').value='Incorrect product or size chosen'">Wrong Product / Size</button>
      </div>
      <textarea id="adj-reject-reason-input" rows="3" style="width:100%; padding:9px 12px; border:1px solid var(--line); border-radius:6px; font-family:inherit; font-size:13px; box-sizing:border-box;"
                placeholder="Provide a clear explanation for warehouse staff..."></textarea>
    </div>
  `;

  const footHtml = `
    <button class="btn secondary" onclick="closeModal()">Keep Request</button>
    <button class="btn secondary danger" onclick="submitRejectAdjRequestModal('${req.id}')">✕ Confirm Rejection</button>
  `;

  openModal('Reject Stock Adjustment Request', bodyHtml, footHtml);
}

async function submitRejectAdjRequestModal(reqId) {
  const input = document.getElementById('adj-reject-reason-input');
  const reason = (input && input.value.trim()) || 'Rejected by Administrator';
  closeModal();
  await rejectAdjRequest(reqId, reason);
}

/* ------------------------------------------------------------
   Product Approval Preview Modal
   ------------------------------------------------------------ */
function openProductApprovalPreviewModal(productId) {
  const p = productById(productId);
  if (!p) return;

  const hex = typeof getProductHex === 'function' ? getProductHex(p) : '#e0e0e0';
  const isNew = p.status === 'pending_approval';
  const hasPrice = p.pendingPrice != null && Number(p.pendingPrice) > 0;
  const hasSizes = Array.isArray(p.pendingSizes) && p.pendingSizes.length > 0;
  const hasEdit = Boolean(p.pendingEdit);

  const bodyHtml = `
    <div>
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:14px; padding-bottom:12px; border-bottom:1px solid var(--line);">
        <div style="display:flex; align-items:center; gap:12px;">
          <div style="width:36px; height:36px; border-radius:8px; background:${hex}; border:1px solid rgba(0,0,0,0.15); box-shadow:0 1px 3px rgba(0,0,0,0.1); flex-shrink:0;"></div>
          <div>
            <div style="font-size:17px; font-weight:700; color:var(--ink);">${escapeHtml(p.name)}</div>
            <div class="muted small">${escapeHtml(p.brand || '')} · ${escapeHtml(p.type || '')} ${p.color ? `· ${escapeHtml(p.color)}` : ''}</div>
          </div>
        </div>
        <div>
          ${isNew ? '<span class="badge ok">✨ New Product</span>' : '<span class="badge mustard">Update Request</span>'}
        </div>
      </div>

      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:10px; margin-bottom:14px;">
        <div style="background:#FAF8F5; border:1px solid var(--line); border-radius:6px; padding:10px 12px;">
          <div class="muted small">Current Price</div>
          <div style="font-size:16px; font-weight:700; font-family:'Space Grotesk',sans-serif; color:var(--ink);">${peso(p.price)}</div>
          ${hasPrice ? `<div style="font-size:12px; color:var(--teal); font-weight:700; margin-top:2px;">➔ Proposed: ${peso(p.pendingPrice)}</div>` : ''}
        </div>
        <div style="background:#FAF8F5; border:1px solid var(--line); border-radius:6px; padding:10px 12px;">
          <div class="muted small">Sealed Can Sizes</div>
          <div style="font-size:13px; font-weight:700; color:var(--ink);">${(p.sizes || []).map(s => s + 'L').join(', ') || 'None'}</div>
          ${hasSizes ? `<div style="font-size:12px; color:var(--teal); font-weight:700; margin-top:2px;">➔ Adding: +[${p.pendingSizes.map(s => s + 'L').join(', ')}]</div>` : ''}
        </div>
        <div style="background:#FAF8F5; border:1px solid var(--line); border-radius:6px; padding:10px 12px;">
          <div class="muted small">Current Stock / Threshold</div>
          <div style="font-size:14px; font-weight:700; color:var(--ink);">${formatStock(p.stock)} cans (Min: ${p.threshold || 5})</div>
        </div>
      </div>

      ${hasEdit && p.pendingEdit.proposed ? `
        <div style="background:#FAF8F5; border:1px solid var(--line); border-radius:6px; padding:10px 14px; margin-bottom:14px; font-size:12.5px;">
          <b>Proposed Edits:</b>
          <div style="margin-top:4px;">${JSON.stringify(p.pendingEdit.proposed)}</div>
        </div>
      ` : ''}
    </div>
  `;

  let footHtml = `<button class="btn secondary" onclick="closeModal()">Close</button>`;

  if (currentUser && currentUser.role === 'admin') {
    if (isNew) {
      footHtml = `
        <button class="btn secondary" onclick="closeModal()">Close</button>
        <button class="btn secondary danger" onclick="closeModal(); rejectPendingProduct('${p.id}')">✕ Reject & Delete</button>
        <button class="btn" onclick="closeModal(); approvePendingProduct('${p.id}')">✓ Approve & Activate</button>
      `;
    } else if (hasPrice) {
      footHtml = `
        <button class="btn secondary" onclick="closeModal()">Close</button>
        <button class="btn secondary danger" onclick="closeModal(); confirmRejectProductPrice('${p.id}')">✕ Reject Price</button>
        <button class="btn" onclick="closeModal(); approvePendingProductPrice('${p.id}')">✓ Approve Price</button>
      `;
    } else if (hasSizes) {
      footHtml = `
        <button class="btn secondary" onclick="closeModal()">Close</button>
        <button class="btn secondary danger" onclick="closeModal(); confirmRejectProductSizes('${p.id}')">✕ Reject Sizes</button>
        <button class="btn" onclick="closeModal(); approvePendingProductSizes('${p.id}')">✓ Approve Sizes</button>
      `;
    } else if (hasEdit) {
      footHtml = `
        <button class="btn secondary" onclick="closeModal()">Close</button>
        <button class="btn secondary danger" onclick="closeModal(); rejectProductPendingEdits('${p.id}')">✕ Reject Edits</button>
        <button class="btn" onclick="closeModal(); approveProductPendingEdits('${p.id}')">✓ Approve Edits</button>
      `;
    }
  }

  openModal('Product Specifications & Approval', bodyHtml, footHtml);
}

/* ------------------------------------------------------------
   PO Preview Modal Helper (Stay in Approvals Hub)
   ------------------------------------------------------------ */
function openPOPreviewModal(poId) {
  const po = (db.purchaseOrders || []).find(o => o.id === poId);
  if (!po) return;

  const items = Array.isArray(po.items) ? po.items : [];
  const isPending = po.status === 'pending';

  const rowsHtml = items.map((it, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td>
        <div style="font-weight:600; color:var(--ink);">${escapeHtml(it.productName || 'Item')}</div>
        <div class="muted small">${escapeHtml(it.brand || '')}</div>
      </td>
      <td><span class="badge ghost">${it.size ? `${it.size}L` : 'Standard'}</span></td>
      <td class="right">${it.orderedQty || 1} cans</td>
      <td class="right">${peso(it.unitCost || 0)}</td>
      <td class="right" style="font-weight:600;">${peso(it.subtotal || ((it.orderedQty || 1) * (it.unitCost || 0)))}</td>
    </tr>
  `).join('');

  const bodyHtml = `
    <div>
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:14px; padding-bottom:12px; border-bottom:1px solid var(--line);">
        <div>
          <div style="font-size:18px; font-weight:700; color:var(--ink); font-family:'Space Grotesk',monospace;">${escapeHtml(po.poNumber)}</div>
          <div class="muted small" style="margin-top:2px;">Supplier: <b>${escapeHtml(po.supplierName)}</b> · Created by <b>${escapeHtml(po.createdBy || 'Staff')}</b> on ${formatDateOnly(po.orderDate || po.createdAt)}</div>
        </div>
        <div>
          <span class="badge ${isPending ? 'mustard' : 'ok'}" style="font-weight:700;">
            ${isPending ? '⏳ Awaiting Authorization' : po.status.toUpperCase()}
          </span>
        </div>
      </div>

      ${po.notes ? `<div style="background:#FAF8F5; border:1px solid var(--line); border-radius:6px; padding:10px 14px; margin-bottom:14px; font-size:13px;"><b>Order Notes:</b> "${escapeHtml(po.notes)}"</div>` : ''}

      <div style="max-height:300px; overflow-y:auto; border:1px solid var(--line); border-radius:6px;">
        <table class="po-preview-table">
          <thead>
            <tr>
              <th style="width:36px;">#</th>
              <th>Product</th>
              <th>Size</th>
              <th class="right">Quantity</th>
              <th class="right">Unit Cost</th>
              <th class="right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
          <tfoot>
            <tr class="po-preview-total-row">
              <td colspan="5" style="text-align:right; font-weight:700;">Grand Total:</td>
              <td class="right" style="font-size:15px; font-weight:700; color:var(--ink); font-family:'Space Grotesk',sans-serif;">${peso(po.totalAmount)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  `;

  let footHtml = `
    <button class="btn secondary" onclick="closeModal()">Close</button>
    <button class="btn ghost" onclick="printPO('${po.id}')">🖨️ Print Order</button>
  `;

  if (isPending && currentUser && currentUser.role === 'admin') {
    footHtml = `
      <button class="btn secondary" onclick="closeModal()">Close</button>
      <button class="btn ghost" onclick="printPO('${po.id}')">🖨️ Print Order</button>
      <button class="btn secondary danger" onclick="closeModal(); confirmCancelPO('${po.id}')">✕ Cancel Order</button>
      <button class="btn" onclick="closeModal(); confirmApprovePO('${po.id}')">✓ Authorize Order</button>
    `;
  }

  openModal(`Purchase Order Details`, bodyHtml, footHtml, 'modal-lg');
}
