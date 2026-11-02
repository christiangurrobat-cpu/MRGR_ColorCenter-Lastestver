/* ============================================================
   18b. PURCHASE ORDERS — order stock from suppliers
   ============================================================ */
let poViewMode = 'list';  // 'list' | 'create' | 'detail'
let poDetailId = null;
let poItemRows = [];
let poSupplierId = '';
let poFilterStatus = '';

function generatePONumber(offset = 0) {
  const now = new Date();
  const dateStr = now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0');
  let seqNum = (db.purchaseOrders ? db.purchaseOrders.length : 0) + 1 + offset;
  let poNum = `PO-${dateStr}-${String(seqNum).padStart(4, '0')}`;
  while ((db.purchaseOrders || []).some(o => o.poNumber === poNum)) {
    seqNum++;
    poNum = `PO-${dateStr}-${String(seqNum).padStart(4, '0')}`;
  }
  return poNum;
}

function poStatusBadge(status) {
  const map = {
    pending: ['po-pending', 'Pending Approval'],
    ordered: ['po-ordered', 'Approved / Ordered'],
    partial: ['po-partial', 'Partially Received'],
    received: ['po-received', 'Received'],
    cancelled: ['po-cancelled', 'Cancelled']
  };
  const [cls, label] = map[status] || ['inactive', status];
  return `<span class="badge ${cls}">${label}</span>`;
}

function poStatusBadgeText(status) {
  const map = {
    pending: 'Pending Approval',
    ordered: 'Approved / Ordered',
    partial: 'Partially Received',
    received: 'Received',
    cancelled: 'Cancelled'
  };
  return map[status] || status;
}

function initPOPage() {
  if (poViewMode === 'create') {
    setTimeout(() => renderPOItemRows(), 0);
  }
}

function purchaseOrdersPage() {
  if (poViewMode === 'create') return poCreatePage();
  if (poViewMode === 'detail' && poDetailId) return poDetailPage();
  return poListPage();
}

/* ----- PO LIST ----- */
let poSearch = '';
let poDateFrom = '';
let poDateTo = '';

function getDateFilteredPOs() {
  const all = [...(db.purchaseOrders || [])].sort((a, b) => new Date(b.orderDate) - new Date(a.orderDate));
  if (!poDateFrom && !poDateTo) return all;
  return all.filter(o => {
    const d = String(o.orderDate || '').slice(0, 10);
    if (poDateFrom && d < poDateFrom) return false;
    if (poDateTo && d > poDateTo) return false;
    return true;
  });
}

function getFilteredPOs(dateFilteredOrders) {
  const orders = dateFilteredOrders || getDateFilteredPOs();
  let filtered = poFilterStatus ? orders.filter(o => {
    if (poFilterStatus === 'open') return o.status === 'pending' || o.status === 'ordered' || o.status === 'partial';
    return o.status === poFilterStatus;
  }) : orders;
  if (poSearch) {
    const q = poSearch.toLowerCase();
    filtered = filtered.filter(o =>
      o.poNumber.toLowerCase().includes(q) ||
      o.supplierName.toLowerCase().includes(q) ||
      (o.notes || '').toLowerCase().includes(q)
    );
  }
  return filtered;
}

function setPODateFilter(from, to) {
  poDateFrom = from || '';
  poDateTo = to || '';
  if (poDateFrom && poDateTo && poDateFrom > poDateTo) {
    const tmp = poDateFrom;
    poDateFrom = poDateTo;
    poDateTo = tmp;
  }
  renderPage();
}

function setPODateShortcut(daysAgo) {
  if (daysAgo === null) {
    poDateFrom = '';
    poDateTo = '';
  } else {
    poDateFrom = daysAgoISO(daysAgo);
    poDateTo = todayISO();
  }
  renderPage();
}

function formatPODateRangeLabel() {
  if (poDateFrom && poDateTo) {
    return poDateFrom === poDateTo ? formatDateOnly(poDateFrom) : `${formatDateOnly(poDateFrom)} – ${formatDateOnly(poDateTo)}`;
  }
  if (poDateFrom) return `From ${formatDateOnly(poDateFrom)}`;
  if (poDateTo) return `Until ${formatDateOnly(poDateTo)}`;
  return 'All time';
}

function poListPage() {
  const orders = getDateFilteredPOs();
  const counts = { all: orders.length, pending: 0, ordered: 0, partial: 0, received: 0, cancelled: 0 };
  orders.forEach(o => { if (counts[o.status] !== undefined) counts[o.status]++; });
  const totalSpend = orders.filter(o => o.status === 'received').reduce((s, o) => s + o.totalAmount, 0);
  const pending = orders.filter(o => o.status === 'pending' || o.status === 'ordered' || o.status === 'partial').reduce((s, o) => s + o.totalAmount, 0);
  const filtered = getFilteredPOs(orders);
  const today = todayISO();
  const d7 = daysAgoISO(6);
  const d30 = daysAgoISO(29);
  const isToday = poDateFrom === today && poDateTo === today;
  const is7D = poDateFrom === d7 && poDateTo === today;
  const is30D = poDateFrom === d30 && poDateTo === today;
  const isAllDates = !poDateFrom && !poDateTo;

  return `
  <div class="dashboard-actions-bar">
    <div class="bar-title">📋 Purchase Orders</div>
    <div class="bar-buttons">
      <button class="btn small" onclick="startCreatePO()">+ New Purchase Order</button>
    </div>
  </div>

  ${counts.pending > 0 ? `
  <div class="alert-banner ${currentUser && currentUser.role === 'admin' ? 'danger' : ''}" style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
    <span>⏳ <b>${counts.pending} Purchase Order${counts.pending === 1 ? ' is' : 's are'} Pending Admin Approval.</b> ${currentUser && currentUser.role === 'admin' ? 'Review and approve them so Inventory Staff can receive deliveries.' : 'Waiting for Administrator approval before delivery can be received.'}</span>
    <button class="btn ${currentUser && currentUser.role === 'admin' ? '' : 'secondary'} small" onclick="poFilterStatus='pending'; poSearch=''; renderPage()">View Pending (${counts.pending}) &rarr;</button>
  </div>` : ''}

  <div class="po-stat-grid">
    <div class="po-stat-card ${!poFilterStatus ? 'active' : ''}" onclick="poFilterStatus=''; poSearch=''; renderPage()">
      <div class="psc-label">Total Orders</div>
      <div class="psc-value">${counts.all}</div>
      <div class="psc-sub">${escapeHtml(formatPODateRangeLabel())}</div>
    </div>
    <div class="po-stat-card pending ${poFilterStatus === 'pending' || poFilterStatus === 'open' || poFilterStatus === 'ordered' || poFilterStatus === 'partial' ? 'active' : ''}" onclick="poFilterStatus='open'; poSearch=''; renderPage()">
      <div class="psc-label">Open / Active</div>
      <div class="psc-value">${counts.pending + counts.ordered + counts.partial}</div>
      <div class="psc-sub">${counts.pending ? counts.pending + ' awaiting approval · ' : ''}${peso(pending)} open</div>
    </div>
    <div class="po-stat-card received ${poFilterStatus === 'received' ? 'active' : ''}" onclick="poFilterStatus='received'; poSearch=''; renderPage()">
      <div class="psc-label">Received</div>
      <div class="psc-value">${counts.received}</div>
      <div class="psc-sub">${peso(totalSpend)} total spend</div>
    </div>
    <div class="po-stat-card cancelled ${poFilterStatus === 'cancelled' ? 'active' : ''}" onclick="poFilterStatus='cancelled'; poSearch=''; renderPage()">
      <div class="psc-label">Cancelled</div>
      <div class="psc-value">${counts.cancelled}</div>
      <div class="psc-sub">&nbsp;</div>
    </div>
  </div>

  <div class="panel">
    <div class="po-date-bar">
      <span class="muted small" style="font-weight:600;">📅 Order Date Between:</span>
      <input id="po-date-from" type="date" value="${escapeHtml(poDateFrom)}" onchange="setPODateFilter(this.value, poDateTo)" title="Start date">
      <span class="muted small">and</span>
      <input id="po-date-to" type="date" value="${escapeHtml(poDateTo)}" onchange="setPODateFilter(poDateFrom, this.value)" title="End date">
      <div class="report-date-shortcuts" style="display:flex; gap:4px; align-items:center;">
        <button type="button" class="btn ${isToday ? '' : 'ghost'} small" onclick="setPODateShortcut(0)" title="Today's purchase orders">Today</button>
        <button type="button" class="btn ${is7D ? '' : 'ghost'} small" onclick="setPODateShortcut(6)" title="Last 7 days">7D</button>
        <button type="button" class="btn ${is30D ? '' : 'ghost'} small" onclick="setPODateShortcut(29)" title="Last 30 days">30D</button>
        <button type="button" class="btn ${isAllDates ? '' : 'ghost'} small" onclick="setPODateShortcut(null)" title="Show all dates">All Dates</button>
      </div>
      ${!isAllDates ? `<span class="badge ok" style="margin-left:auto;">Showing ${orders.length} order${orders.length === 1 ? '' : 's'} (${escapeHtml(formatPODateRangeLabel())})</span>` : ''}
    </div>
    <div class="po-list-search">
      <span style="font-size:15px; color:var(--ink-soft);">🔍</span>
      <input id="po-search-input" type="text" placeholder="Search by PO number, supplier, or notes…" value="${escapeHtml(poSearch)}" oninput="poSearch=this.value; renderPOListRows()" autocomplete="off">
      ${poSearch ? `<button class="btn ghost small" onclick="poSearch=''; document.getElementById('po-search-input').value=''; renderPOListRows()" title="Clear search">✕</button>` : ''}
      <div style="display:flex; gap:6px; margin-left:8px; flex-wrap:wrap;">
        ${['all', 'pending', 'ordered', 'partial', 'received', 'cancelled'].map(s => {
    const isActive = (s === 'all' && !poFilterStatus) || poFilterStatus === s;
    const label = s === 'partial' ? 'Partial' : s.charAt(0).toUpperCase() + s.slice(1);
    return `<button class="btn ${isActive ? '' : 'secondary'} small" onclick="poFilterStatus='${s === 'all' ? '' : s}'; renderPage()">${label}${s !== 'all' ? ' (' + counts[s] + ')' : ''}</button>`;
  }).join('')}
      </div>
    </div>
    <div class="po-list-header">
      <span>PO Number</span><span>Supplier</span><span>Date</span><span>Status</span><span style="text-align:right">Total</span><span style="text-align:center">Action</span>
    </div>
    <div id="po-list-rows">
      ${renderPOListRowsHTML(filtered)}
    </div>
  </div>`;
}

function renderPOListRowsHTML(filtered) {
  if (!filtered) {
    filtered = getFilteredPOs();
  }
  const hasFilters = Boolean(poSearch || poDateFrom || poDateTo || poFilterStatus);
  if (!filtered.length) {
    return `<div style="padding:48px; text-align:center; color:var(--ink-soft);">
      <div style="font-size:32px; margin-bottom:10px;">📋</div>
      <div style="font-weight:600; margin-bottom:6px;">${hasFilters ? 'No purchase orders match your filters' : 'No purchase orders yet'}</div>
      <div style="font-size:12.5px;">${hasFilters ? 'Try adjusting the date range, status filter, or search term.' : 'Click <b>+ New Purchase Order</b> to create one.'}</div>
    </div>`;
  }
  return filtered.map((po, i) => `
    <div class="po-summary-row" style="animation-delay:${i * 30}ms" onclick="viewPODetail('${po.id}')">
      <div class="po-num">${escapeHtml(po.poNumber)}</div>
      <div class="po-supplier">${escapeHtml(po.supplierName)}</div>
      <div class="po-date">${formatDateOnly(po.orderDate)}</div>
      <div>${poStatusBadge(po.status)}</div>
      <div class="po-total">${peso(po.totalAmount)}</div>
      <div class="po-row-actions-cell" onclick="event.stopPropagation()">
        <button type="button" class="po-actions-menu-btn" onclick="togglePORowActionsMenu('${po.id}', this, event)" title="Actions for ${escapeHtml(po.poNumber)}">
          <span>•••</span>
        </button>
      </div>
    </div>`).join('');
}

function renderPOListRows() {
  const el = document.getElementById('po-list-rows');
  if (el) el.innerHTML = renderPOListRowsHTML();
}

function viewPODetail(id) {
  closeAllPOActionsMenus();
  closePOProductPicker();
  poViewMode = 'detail';
  poDetailId = id;
  renderPage();
}

function backToPOList() {
  closeAllPOActionsMenus();
  closePOProductPicker();
  poViewMode = 'list';
  poDetailId = null;
  renderPage();
}

/* ----- PO DETAIL ----- */
function poDetailPage() {
  const po = (db.purchaseOrders || []).find(o => o.id === poDetailId);
  if (!po) { backToPOList(); return ''; }
  const items = getPOItems(po);
  const isAdmin = currentUser && currentUser.role === 'admin';
  const isStaff = currentUser && currentUser.role === 'staff';
  const canApprove = isAdmin && po.status === 'pending';
  const canReceive = isStaff && (po.status === 'ordered' || po.status === 'partial');
  const canCancel = (po.status === 'pending' && (isAdmin || isStaff)) || (po.status === 'ordered' && isAdmin);

  // Timeline
  const cancelled = po.status === 'cancelled';
  let steps = [];
  let currentStepIdx = 0;

  if (cancelled) {
    steps = [{ label: 'Requested', icon: '📋', done: true }, { label: 'Approved / Ordered', icon: '📤', done: false }, { label: 'Cancelled', icon: '✕', done: true, cancel: true }];
    currentStepIdx = 2;
  } else if (po.status === 'partial') {
    steps = [{ label: 'Requested', icon: '📋', done: true }, { label: 'Approved / Ordered', icon: '📤', done: true }, { label: 'Partial Delivery', icon: '🚚', done: true, current: true }, { label: 'Fully Received', icon: '📥', done: false }];
    currentStepIdx = 2;
  } else {
    steps = [
      { label: 'Requested', icon: '📋', done: true },
      { label: 'Approved / Ordered', icon: '📤', done: po.status === 'ordered' || po.status === 'received', current: po.status === 'pending' },
      { label: 'Received', icon: '📥', done: po.status === 'received', current: po.status === 'ordered' }
    ];
    currentStepIdx = po.status === 'received' ? 2 : (po.status === 'ordered' ? 1 : 0);
  }

  const timelineHtml = steps.map((s, i) => {
    const cls = s.cancel ? 'cancelled' : (s.current ? 'current' : (s.done && i < currentStepIdx ? 'done' : (i === currentStepIdx ? (s.done ? 'done' : 'current') : '')));
    return `<div class="po-timeline-step ${cls}"><div class="po-timeline-dot">${s.icon}</div><div class="po-timeline-label">${s.label}</div></div>`;
  }).join('');

  return `
  <div style="display:flex; align-items:center; gap:10px; margin-bottom:18px; flex-wrap:wrap;">
    <button class="btn secondary small" onclick="backToPOList()">← Purchase Orders</button>
    <span style="color:var(--ink-soft); font-size:13px;">›</span>
    <span style="font-size:13px; font-weight:600;">${escapeHtml(po.poNumber)}</span>
    <div style="margin-left:auto; display:flex; gap:8px; flex-wrap:wrap;">
      ${canApprove ? `<button class="btn small" onclick="confirmApprovePO('${po.id}')">✓ Approve &amp; Mark Ordered</button>` : ''}
      ${canReceive ? `<button class="btn small" onclick="goToReceivingForPO('${po.id}')">📥 Receive Delivery</button>` : ''}
      ${canCancel ? `<button class="btn danger small" onclick="confirmCancelPO('${po.id}')">✕ ${po.status === 'pending' && isAdmin ? 'Reject / Cancel' : 'Cancel Order'}</button>` : ''}
      <button class="btn secondary small" onclick="printPO('${po.id}')">🖨️ Print PO</button>
    </div>
  </div>

  ${po.status === 'pending' ? `
  <div class="alert-banner ${isAdmin ? 'danger' : ''}" style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
    <div>
      <strong>⏳ Pending Admin Approval</strong> — Requested by <b>${escapeHtml(po.createdBy)}</b>.
      ${isAdmin
        ? 'Approve this order to authorize purchasing and allow Inventory Staff to receive the delivery.'
        : 'This order must be approved by an Administrator before it can be received in Stock Receiving.'}
    </div>
    ${canApprove ? `<button class="btn small" onclick="confirmApprovePO('${po.id}')">✓ Approve Order Now</button>` : ''}
  </div>` : ''}

  <div class="po-timeline">${timelineHtml}</div>

  <div class="panel">
    <div class="panel-head row">
      <h3>Order Details</h3>
      <div class="spacer"></div>
      ${poStatusBadge(po.status)}
    </div>
    <div class="panel-body">
      <div class="po-info-grid">
        <div class="po-info-cell"><div class="pic-label">PO Number</div><div class="pic-value">${escapeHtml(po.poNumber)}</div></div>
        <div class="po-info-cell"><div class="pic-label">Supplier</div><div class="pic-value">${escapeHtml(po.supplierName)}</div></div>
        <div class="po-info-cell"><div class="pic-label">Order Date</div><div class="pic-value">${formatDateTime(po.orderDate)}</div></div>
        <div class="po-info-cell"><div class="pic-label">Created By</div><div class="pic-value">${escapeHtml(po.createdBy)}</div></div>
        ${po.receivedAt ? `<div class="po-info-cell"><div class="pic-label">Last Received</div><div class="pic-value">${formatDateTime(po.receivedAt)}</div></div>` : ''}
        <div class="po-info-cell"${!po.receivedAt ? ' style="grid-column: 1 / -1;"' : ''}><div class="pic-label">Notes</div><div class="pic-value">${po.notes ? escapeHtml(po.notes) : '<span style="color:var(--ink-soft)">—</span>'}</div></div>
      </div>

      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Product</th>
              <th>Brand</th>
              <th class="right">Unit Cost</th>
              <th class="right">Ordered</th>
              <th class="right">Received</th>
              <th class="right">Remaining</th>
              <th class="center">Status</th>
              <th class="right">Line Total</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((item, i) => {
          const ordered = Number(item.qty || 0);
          const received = Number(item.receivedQty !== undefined ? item.receivedQty : (po.status === 'received' ? ordered : 0));
          const remaining = Math.max(0, Number((ordered - received).toFixed(2)));
          const statusBadge = (po.status === 'received' || remaining <= 0)
            ? `<span class="badge ok">✓ Complete</span>`
            : (received > 0
              ? `<span class="badge po-partial">${formatStock(received)} / ${formatStock(ordered)}</span>`
              : `<span class="badge inactive">0 / ${formatStock(ordered)}</span>`);

          return `
              <tr style="animation:poRowIn .2s ease-out ${i * 30}ms both">
                <td style="color:var(--ink-soft); font-size:12px;">${i + 1}</td>
                <td><strong>${escapeHtml(item.productName)}</strong> <code style="font-family:'Space Grotesk',monospace; font-size:11px; font-weight:600; color:var(--teal);">(${getProductHex(productById(item.productId))})</code>${item.color && item.color !== '-' ? `<span class="muted small"> (${escapeHtml(item.color)})</span>` : ''}</td>
                <td class="muted small">${escapeHtml(item.brand || '')} · <strong>${Number(item.size) || 1}L</strong></td>
                <td class="right">${peso(item.unitCost)}</td>
                <td class="right"><strong>${formatStock(ordered)}</strong></td>
                <td class="right" style="color:${received > 0 ? 'var(--teal)' : 'var(--ink-soft)'}; font-weight:600;">${formatStock(received)}</td>
                <td class="right" style="color:${remaining > 0 ? '#C1443D' : 'var(--success)'}; font-weight:700;">${formatStock(remaining)}</td>
                <td class="center">${statusBadge}</td>
                <td class="right" style="font-weight:700; color:var(--teal-dark);">${peso(item.unitCost * ordered)}</td>
              </tr>`;
        }).join('')}
          </tbody>
        </table>
      </div>

      <div class="po-items-summary">
        <div><div class="po-grand-label">Grand Total · ${items.length} line item${items.length !== 1 ? 's' : ''}</div></div>
        <div class="po-grand-total">${peso(po.totalAmount)}</div>
      </div>
    </div>
  </div>`;
}

function goToReceivingForPO(id) {
  receivingPOId = id;
  goTo('receiving');
}

function confirmApprovePO(id) {
  const po = (db.purchaseOrders || []).find(o => o.id === id);
  if (!po) return;
  showPOConfirm({
    icon: '✅',
    title: 'Approve Purchase Order?',
    message: `Approve <b>${escapeHtml(po.poNumber)}</b> for <b>${escapeHtml(po.supplierName)}</b> (${peso(po.totalAmount)})? Once approved, it will be marked as <b>Ordered</b> and unlocked for Inventory Staff to receive upon delivery.`,
    confirmLabel: '✓ Yes, Approve Order',
    confirmClass: 'btn',
    onConfirm: () => approvePO(id)
  });
}

async function approvePO(id) {
  const po = (db.purchaseOrders || []).find(o => o.id === id);
  if (!po) return;
  po.status = 'ordered';
  logAudit('PO_APPROVE', 'Purchase Order', `Approved ${po.poNumber}`);
  await saveDB();
  showToast(`PO ${po.poNumber} approved and marked as Ordered.`, 'ok');
  renderPage();
}

function confirmCancelPO(id) {
  const po = (db.purchaseOrders || []).find(o => o.id === id);
  if (!po) return;
  showPOConfirm({
    icon: '⚠️',
    title: 'Cancel this Order?',
    message: `<b>${escapeHtml(po.poNumber)}</b> will be marked as cancelled. This cannot be undone.`,
    confirmLabel: 'Yes, Cancel Order',
    confirmClass: 'btn danger',
    onConfirm: () => cancelPO(id)
  });
}

function showPOConfirm({ icon, title, message, confirmLabel, confirmClass, onConfirm }) {
  const overlay = document.createElement('div');
  overlay.className = 'po-confirm-overlay';
  overlay.innerHTML = `
    <div class="po-confirm-box">
      <div class="pcb-icon">${icon}</div>
      <h3>${title}</h3>
      <p>${message}</p>
      <div class="pcb-btns">
        <button class="btn secondary" id="pcb-cancel">Cancel</button>
        <button class="${confirmClass}" id="pcb-confirm">${confirmLabel}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#pcb-cancel').onclick = () => overlay.remove();
  overlay.querySelector('#pcb-confirm').onclick = () => { overlay.remove(); onConfirm(); };
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

/* Adds a PO's ordered/partial quantities to stock, logs movements and updates PO status (partial vs received). */
async function completePOReceiving(po, refNote = '', batchQtys = null) {
  const items = getPOItems(po);
  const date = nowISO();
  let receivedItemCount = 0;

  items.forEach((item, idx) => {
    const p = productById(item.productId);
    const ordered = Number(item.qty || 0);
    const alreadyReceived = Number(item.receivedQty !== undefined ? item.receivedQty : (po.status === 'received' ? ordered : 0));
    const remaining = Math.max(0, Number((ordered - alreadyReceived).toFixed(2)));

    let qtyToReceive = remaining;
    if (batchQtys !== null) {
      qtyToReceive = Math.min(remaining, Math.max(0, Number(batchQtys[idx] ?? batchQtys[item.productId] ?? 0)));
    }

    if (qtyToReceive > 0) {
      receivedItemCount++;
      const newReceivedTotal = Number((alreadyReceived + qtyToReceive).toFixed(2));
      item.receivedQty = newReceivedTotal;

      if (p) {
        const size = Number(item.size) || 1;
        const liters = Number((qtyToReceive * size).toFixed(2));
        const beforeStock = Number(p.stock) || 0;
        const beforeCans = productCanCount(p, size);
        const afterCans = beforeCans + qtyToReceive;
        p.stock = Number((beforeStock + liters).toFixed(2));
        if (!p.canStock || Array.isArray(p.canStock) || typeof p.canStock !== 'object') p.canStock = {};
        p.canStock[size] = afterCans;
        normalizeProductOpenedStock(p);
        db.movements.push({
          id: uid('mv'),
          date,
          type: 'receiving',
          productId: p.id,
          productName: p.name,
          qtyChange: liters,
          note: `PO Delivery: ${po.poNumber} (${po.supplierName}) [Received ${qtyToReceive} × ${size}L (+${formatStock(liters)}L) · ${size}L Cans: ${beforeCans}→${afterCans}, Stock: ${formatStock(beforeStock)}L→${formatStock(p.stock)}L, PO: ${newReceivedTotal}/${ordered}]${refNote ? ' — ' + refNote : ''}`,
          staffName: (currentUser && currentUser.name) || 'Staff'
        });
      }
    } else {
      item.receivedQty = alreadyReceived;
    }
  });

  const allCompleted = items.every(it => Number(it.receivedQty || 0) >= Number(it.qty || 0));
  po.status = allCompleted ? 'received' : 'partial';
  po.receivedAt = date;
  po.items = items;
  po.itemsJson = JSON.stringify(items);
  await saveDB();

  return { items, allCompleted, receivedItemCount };
}

async function cancelPO(id) {
  const po = (db.purchaseOrders || []).find(o => o.id === id);
  if (!po) return;
  po.status = 'cancelled';
  logAudit('PO_CANCEL', 'Purchase Order', `Cancelled ${po.poNumber}`);
  await saveDB();
  showToast(`PO ${po.poNumber} cancelled.`, 'ok');
  renderPage();
}

function printPO(id) {
  const po = (db.purchaseOrders || []).find(o => o.id === id);
  if (!po) return;
  const items = getPOItems(po);
  const win = window.open('', '_blank', 'width=794,height=1123');
  if (!win) {
    showToast('Popup blocker prevented PO print window from opening. Please allow popups.', 'error');
    return;
  }
  win.document.write(`<html><head><title>Purchase Order — ${escapeHtml(po.poNumber)}</title>
    <style>body{font-family:'Inter',Arial,sans-serif;padding:40px;color:#26211C;font-size:13px}
    h1{font-size:22px;margin:0 0 4px}h2{font-size:14px;margin:0 0 16px;color:#6B6259;font-weight:500}
    table{width:100%;border-collapse:collapse;margin:18px 0}th,td{text-align:left;padding:8px 12px;border-bottom:1px solid #E2DACD}
    th{font-size:11px;text-transform:uppercase;color:#6B6259;background:#FBF8F2}td.right,th.right{text-align:right}
    .total-row{font-weight:700;font-size:15px;text-align:right;padding-top:14px}
    .meta{font-size:12.5px;line-height:1.8;margin-bottom:10px;color:#6B6259}
    .badge{display:inline-block;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:600}
    .footer{margin-top:36px;border-top:1px solid #E2DACD;padding-top:14px;font-size:11px;color:#8A8070}
    @page{size:A4 portrait;margin:12mm}
    @media print{body{padding:0}}
    </style></head><body>
    <h1>Purchase Order: ${escapeHtml(po.poNumber)}</h1>
    <h2>MRGR Color Center</h2>
    <div class="meta">
      <strong>Supplier:</strong> ${escapeHtml(po.supplierName)}<br>
      <strong>Date:</strong> ${formatDateTime(po.orderDate)}<br>
      <strong>Status:</strong> ${po.status.charAt(0).toUpperCase() + po.status.slice(1)}<br>
      <strong>Created By:</strong> ${escapeHtml(po.createdBy)}
      ${po.notes ? `<br><strong>Notes:</strong> ${escapeHtml(po.notes)}` : ''}
    </div>
    <table>
      <thead><tr><th>#</th><th>Product</th><th>Brand</th><th class="right">Unit Cost</th><th class="right">Ordered</th><th class="right">Received</th><th class="right">Remaining</th><th class="right">Total</th></tr></thead>
      <tbody>${items.map((item, i) => {
    const ordered = Number(item.qty || 0);
    const received = Number(item.receivedQty !== undefined ? item.receivedQty : (po.status === 'received' ? ordered : 0));
    const remaining = Math.max(0, Number((ordered - received).toFixed(2)));
    const hex = getProductHex(productById(item.productId));
    return `<tr>
          <td>${i + 1}</td>
          <td>${escapeHtml(item.productName)}${hex ? ` (${hex})` : ''}${item.color && item.color !== '-' ? ` (${escapeHtml(item.color)})` : ''}</td>
          <td>${escapeHtml(item.brand || '')}</td>
          <td class="right">₱${Number(item.unitCost).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
          <td class="right">${formatStock(ordered)}</td>
          <td class="right">${formatStock(received)}</td>
          <td class="right">${formatStock(remaining)}</td>
          <td class="right">₱${Number(item.unitCost * ordered).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
        </tr>`;
  }).join('')}</tbody>
    </table>
    <div class="total-row">Grand Total: ₱${Number(po.totalAmount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div>
    <div class="footer">Generated by MRGR Color Center — Sales & Inventory System · ${new Date().toLocaleString('en-PH')}</div>
    </body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 300);
}

/* ----- PO CREATE ----- */
function startCreatePO() {
  closeAllPOActionsMenus();
  closePOProductPicker();
  poViewMode = 'create';
  poSupplierId = '';
  poItemRows = [newPORow('')];
  renderPage();
}

function poCreatePage() {
  const supplierOptions = db.suppliers
    .filter(s => s.status === 'active')
    .map(s => {
      const linkedCount = (s.productIds || []).filter(pid => productById(pid)).length;
      return `<option value="${s.id}" ${s.id === poSupplierId ? 'selected' : ''}>${escapeHtml(s.name)} (${linkedCount} products)</option>`;
    })
    .join('');

  const htmlContent = `
  <div style="display:flex; align-items:center; gap:10px; margin-bottom:18px;">
<button class="btn secondary small" onclick="backToPOList()">← Purchase Orders</button>
<span style="color:var(--ink-soft); font-size:13px;">›</span>
<span style="font-size:13px; font-weight:600;">New Order</span>
  </div>

  <div class="panel">
<div class="panel-head row">
  <h3>📋 Create Purchase Order</h3>
  <div class="spacer"></div>
  <span class="muted small">Fields marked <span style="color:var(--danger);">*</span> are required</span>
</div>
<div class="panel-body">
  ${poItemRows.some(r => r.productId) ? `
    <div class="alert-banner warning" style="display:flex; align-items:center; gap:10px; margin-bottom:16px;">
      <span style="font-size:18px;">🔍</span>
      <div>
        <b>Check Low-Stock Order Before Submitting:</b> The low-stock items you selected have been loaded with recommended quantities. Staff can verify can sizes, change quantities, add notes, and submit for approval.
      </div>
    </div>
  ` : ''}
  <form id="po-create-form" onsubmit="return submitPO(event)">
    <div class="form-grid">
      <div class="field">
        <label>Supplier <span style="color:var(--danger);">*</span></label>
        <select id="po-supplier" onchange="onPOSupplierChange()" required>
          <option value="">-- Select a Supplier --</option>
          ${supplierOptions || '<option value="" disabled>No active suppliers on file</option>'}
        </select>
      </div>
      <div class="field">
        <label>Notes (optional)</label>
        <input id="po-notes" type="text" placeholder="e.g. Urgent restock, monthly order" value="${escapeHtml(window._poInitialNotes || '')}">
      </div>
    </div>

    <div style="margin-top:22px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
        <h4 style="margin:0;">Order Items</h4>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button type="button" class="btn secondary small" onclick="addPOItemRow()">+ Add Row</button>
          <button type="button" class="btn secondary small" onclick="addAllSupplierProductsToPO()">⚡ All Supplier Products</button>
          <button type="button" class="btn secondary small" onclick="addLowStockToPO()">⚠️ Low-Stock Only</button>
        </div>
      </div>
      <div id="po-items-container"></div>
    </div>

    <div id="po-create-total" class="po-items-summary" style="margin-top:16px;">
      <div><div class="po-grand-label">Grand Total · 0 items</div></div>
      <div class="po-grand-total" id="po-grand-total-value">₱0.00</div>
    </div>

    <div style="margin-top:20px; display:flex; gap:10px; justify-content:flex-end; align-items:center;">
      <span class="muted small" style="margin-right:auto;">
        ${currentUser && currentUser.role === 'admin'
      ? '✅ As Administrator, this order will be automatically approved and marked as <b>Ordered</b>.'
      : '⏳ As Inventory Staff, this order will be submitted as <b>Pending Approval</b> for the Administrator to review.'}
      </span>
      <button type="button" class="btn secondary" onclick="backToPOList()">Cancel</button>
      <button type="submit" class="btn" id="btn-submit-po">${currentUser && currentUser.role === 'admin' ? 'Create & Approve Order →' : 'Submit for Approval →'}</button>
    </div>
  </form>
</div>
  </div>`;
  window._poInitialNotes = '';
  return htmlContent;
}

function onPOSupplierChange() {
  const sel = document.getElementById('po-supplier');
  if (!sel) return;
  poSupplierId = sel.value;
  poItemRows = [newPORow('')];
  closePOProductPicker();
  renderPOItemRows();
}

function renderPOItemRows() {
  const container = document.getElementById('po-items-container');
  const totalEl = document.getElementById('po-create-total');
  if (!container) return;

  const supplier = poSupplierId ? db.suppliers.find(s => s.id === poSupplierId) : null;

  if (!supplier) {
    container.innerHTML = `<div class="alert-banner" style="margin-bottom:0;">ℹ️ Please select a supplier above. The item list will show products linked to that supplier.</div>`;
    if (totalEl) {
      totalEl.innerHTML = `<div class="po-grand-label">Grand Total (0 items)</div><div class="po-grand-total">₱0.00</div>`;
    }
    return;
  }

  const allActive = activeProducts();
  const suppliedProducts = allActive.filter(p => supplier.productIds && supplier.productIds.includes(p.id));

  if (allActive.length === 0) {
    container.innerHTML = `<div class="alert-banner danger" style="margin-bottom:0;">⚠️ No active products found in inventory. <a href="#" onclick="goTo('products'); return false;" style="font-weight:600; text-decoration:underline;">Add products in Product Management &rarr;</a></div>`;
    return;
  }

  const unlinkedBanner = suppliedProducts.length === 0
    ? `<div class="alert-banner" style="margin-bottom:14px; font-size:12.5px;">ℹ️ No products are pre-linked to <b>${escapeHtml(supplier.name)}</b> yet. You can select any paint product below — it will be linked to this supplier automatically.</div>`
    : '';

  let grandTotal = 0;
  let validCount = 0;

  const rowsHtml = poItemRows.map((row, index) => {
    const product = row.productId ? productById(row.productId) : null;
    const { lineTotal, hasQty } = poRowTotals(row);
    if (product && hasQty) { grandTotal += lineTotal; validCount++; }

    const stockBadgeHtml = product
      ? `<span class="badge ${productHasLowStock(product) ? 'low' : 'ok'}" title="${productLowSizesSummary(product)}">${formatLiters(product.stock)}</span>`
      : '<span class="muted">—</span>';

    const allSizes = poSizesFor(product);
    const STANDARD_SIZES = [1, 4, 16];
    let baseSizes = allSizes.filter(s => STANDARD_SIZES.includes(s));
    if (!baseSizes.length) baseSizes = allSizes.slice(0, 3);

    // Any size with qty > 0 is always visible
    const activeSizes = allSizes.filter(s => (Number(row.qtys[s]) || 0) > 0);

    const visibleSizes = row.showAllSizes
      ? allSizes
      : allSizes.filter(s => baseSizes.includes(s) || activeSizes.includes(s));

    const hiddenSizes = allSizes.filter(s => !visibleSizes.includes(s));
    const hiddenLowCount = hiddenSizes.filter(s => {
      const st = product ? productSizeStatus(product, s) : 'ok';
      return st === 'low' || st === 'out';
    }).length;

    const sizeInputs = visibleSizes.map(s => {
      const canCount = product ? productCanCount(product, s) : 0;
      const thresh = product ? productSizeThreshold(product, s) : 0;
      const st = product ? productSizeStatus(product, s) : 'ok';
      const isLow = st === 'low' || st === 'out';
      const shortage = Math.max(0, thresh - canCount);
      const cost = poUnitCost(product, s);
      const currentQty = Number(row.qtys[s]) || 0;

      return `
        <div class="po-size-pill ${isLow ? 'is-low' : ''} ${currentQty > 0 ? 'has-qty' : ''}" id="po-card-${index}-${s}"
          onclick="openPOSizeInput(${index}, ${s})"
          title="${product ? `${fmtSize(s)} · Current stock: ${canCount} cans (min: ${thresh}) · Approx. cost: ${peso(cost)}/can` : ''}">
          
          <!-- Inactive View -->
          <div class="po-pill-idle">
            <span class="po-pill-idle-size">${fmtSize(s)}</span>
            ${isLow
              ? (shortage > 0
                ? `<button type="button" class="po-pill-shortage-btn" onclick="event.stopPropagation(); inplacePOQty(${index}, ${s}, ${shortage})" title="Short by ${shortage}. Click to order ${shortage}">⚠️ -${shortage}</button>`
                : `<span class="po-pill-stock-label" style="color:#C1443D; font-weight:600;">0 in stock</span>`
              )
              : `<span class="po-pill-stock-label">${canCount} in stock</span>`
            }
            <span class="po-pill-add-icon" title="Click to enter quantity">+</span>
          </div>

          <!-- Active / Editing View -->
          <div class="po-pill-active">
            <span class="po-pill-size-tag">${fmtSize(s)}</span>
            <input type="number" id="po-qty-${index}-${s}" min="0" max="${PO_MAX_QTY}" step="1"
              value="${currentQty > 0 ? currentQty : ''}"
              placeholder="0"
              class="po-pill-input ${currentQty > 0 ? 'active' : ''}"
              onclick="event.stopPropagation()"
              onfocus="this.select()"
              onblur="onPOSizeInputBlur(${index}, ${s})"
              onkeydown="if(event.key==='Enter'){event.preventDefault(); this.blur();} else if(event.key==='Escape'){event.stopPropagation(); this.blur();} else if(['-','e','E','+'].includes(event.key)){event.preventDefault();}"
              oninput="inplacePOQty(${index}, ${s}, this.value)">
            <span class="po-pill-cans-label">cans</span>
            <button type="button" class="po-pill-clear-btn" onclick="event.stopPropagation(); inplacePOQty(${index}, ${s}, 0)" title="Reset to 0">✕</button>
          </div>
        </div>`;
    }).join('');

    const toggleBtnHtml = hiddenSizes.length > 0
      ? `<button type="button" class="po-pill-toggle-btn" onclick="togglePORowSizes(${index})" title="Show ${hiddenSizes.length} more sizes">
          +${hiddenSizes.length} more${hiddenLowCount > 0 ? `<span class="po-more-sizes-alert" title="${hiddenLowCount} hidden size(s) low in stock">⚠️ ${hiddenLowCount}</span>` : ''}
         </button>`
      : (row.showAllSizes && allSizes.length > baseSizes.length
        ? `<button type="button" class="po-pill-toggle-btn collapse" onclick="togglePORowSizes(${index})" title="Collapse back to standard sizes">
            − Fewer sizes
           </button>`
        : '');

    return `
      <tr style="animation:poRowIn .18s ease-out both">
        <td style="min-width:280px; vertical-align:middle;">
          ${renderPOProductPickerTrigger(index, product)}
        </td>
        <td style="vertical-align:middle;">
          ${product ? `<div class="po-size-pills-row">${sizeInputs}${toggleBtnHtml}</div>` : `<div class="muted small" style="font-style:italic; padding:6px 2px;">Choose a paint above to specify sizes and order quantities.</div>`}
        </td>
        <td class="right" data-poi-line="${index}" style="min-width:115px; font-weight:700; font-family:'Space Grotesk'; font-size:14px; vertical-align:middle; color:${product && hasQty ? 'var(--ink)' : 'var(--ink-soft)'}; transition:color .2s;">
          ${product && hasQty ? peso(lineTotal) : '<span class="muted">—</span>'}
        </td>
        <td class="center" style="width:36px; vertical-align:middle;">
          ${poItemRows.length > 1
        ? `<button type="button" class="btn ghost small" onclick="removePOItemRow(${index})" title="Remove row" style="color:var(--danger); padding:4px 8px; border-radius:50%; width:28px; height:28px;">✕</button>`
        : ''}
        </td>
      </tr>`;
  }).join('');

  container.innerHTML = `
    ${unlinkedBanner}
    <div class="bulk-adj-wrap">
      <table class="bulk-adj-table">
        <thead>
          <tr>
            <th style="min-width:280px;">Product</th>
            <th>Sizes &amp; Quantities to Order</th>
            <th class="right" style="min-width:115px;">Line Total</th>
            <th style="width:36px;"></th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>`;

  if (totalEl) {
    const grandTotalEl = document.getElementById('po-grand-total-value');
    const newHtml = `<div><div class="po-grand-label">Grand Total · ${validCount} item${validCount !== 1 ? 's' : ''}</div></div><div class="po-grand-total" id="po-grand-total-value">${peso(grandTotal)}</div>`;
    if (grandTotalEl) {
      totalEl.innerHTML = newHtml;
      // bump animation
      const newEl = document.getElementById('po-grand-total-value');
      if (newEl) { newEl.classList.remove('bump'); void newEl.offsetWidth; newEl.classList.add('bump'); }
    } else {
      totalEl.innerHTML = newHtml;
    }
  }
}

const PO_MAX_QTY = 1000; // maximum quantity allowed per size per product
const PO_SIZES = [1, 4, 16];
/* Each product has its own can sizes (p.sizes); fall back to the defaults while no product is chosen */
function poSizesFor(product) { return product ? productSizes(product) : PO_SIZES; }

function newPORow(productId, qtys, showAllSizes = false) {
  return { id: uid('poi'), productId: productId || '', qtys: { 1: 0, 4: 0, 16: 0, ...(qtys || {}) }, showAllSizes: !!showAllSizes };
}

function togglePORowSizes(index) {
  if (poItemRows[index]) {
    poItemRows[index].showAllSizes = !poItemRows[index].showAllSizes;
    renderPOItemRows();
  }
}

function poUnitCost(product, size) {
  return product && product.price ? Number((product.price * 0.80 * size).toFixed(2)) : 0;
}

function poRowTotals(row) {
  const product = row.productId ? productById(row.productId) : null;
  let lineTotal = 0;
  let hasQty = false;
  poSizesFor(product).forEach(s => {
    const q = Number(row.qtys[s]) || 0;
    if (q > 0) { hasQty = true; lineTotal += q * poUnitCost(product, s); }
  });
  return { lineTotal, hasQty };
}

function poGrandSummary() {
  let grand = 0;
  let count = 0;
  poItemRows.forEach(r => {
    const p = r.productId ? productById(r.productId) : null;
    const { lineTotal, hasQty } = poRowTotals(r);
    if (p && hasQty) { grand += lineTotal; count++; }
  });
  return { grand, count };
}

function inplacePOQty(index, size, rawValue) {
  const row = poItemRows[index];
  if (!row) return;
  let qty = Math.max(0, Math.floor(parseFloat(rawValue) || 0));
  if (qty > PO_MAX_QTY) {
    qty = PO_MAX_QTY;
    showToast(`Maximum quantity per size is ${PO_MAX_QTY}.`, 'error');
  }
  row.qtys[size] = qty;

  // keep DOM input and card state in sync if triggered programmatically
  // (don't overwrite what the user is typing, e.g. an empty box while they clear it)
  const inputEl = document.getElementById(`po-qty-${index}-${size}`);
  if (inputEl) {
    const display = qty > 0 ? String(qty) : '';
    const isTyping = document.activeElement === inputEl;
    const needsSync = isTyping
      ? (inputEl.value !== '' && Number(inputEl.value) !== qty)
      : inputEl.value !== display;
    if (needsSync) inputEl.value = display;
  }
  const cardEl = document.getElementById(`po-card-${index}-${size}`);
  if (cardEl) {
    if (qty > 0) {
      cardEl.classList.add('has-qty');
    } else {
      cardEl.classList.remove('has-qty');
      cardEl.classList.remove('editing');
    }
  }

  const product = row.productId ? productById(row.productId) : null;
  const { lineTotal, hasQty } = poRowTotals(row);

  // update the line total cell for this row
  const lineTotalCell = document.querySelector(`[data-poi-line="${index}"]`);
  if (lineTotalCell) {
    lineTotalCell.innerHTML = product && hasQty
      ? `<span style="font-weight:700; font-family:'Space Grotesk';">${peso(lineTotal)}</span>`
      : '<span class="muted">—</span>';
    lineTotalCell.style.color = product && hasQty ? 'var(--ink)' : 'var(--ink-soft)';
    lineTotalCell.classList.add('line-bump');
    setTimeout(() => lineTotalCell.classList.remove('line-bump'), 300);
  }

  const { grand, count: validCount } = poGrandSummary();
  const totalEl = document.getElementById('po-create-total');
  if (totalEl) {
    totalEl.innerHTML = `<div><div class="po-grand-label">Grand Total · ${validCount} item${validCount !== 1 ? 's' : ''}</div></div><div class="po-grand-total" id="po-grand-total-value">${peso(grand)}</div>`;
    const grandEl = document.getElementById('po-grand-total-value');
    if (grandEl) { grandEl.classList.remove('bump'); void grandEl.offsetWidth; grandEl.classList.add('bump'); }
  }
}

/* Click a size card → reveal its quantity box and focus it so the user can type any number */
function openPOSizeInput(index, size) {
  const cardEl = document.getElementById(`po-card-${index}-${size}`);
  const inputEl = document.getElementById(`po-qty-${index}-${size}`);
  if (!cardEl || !inputEl) return;
  cardEl.classList.add('editing');
  setTimeout(() => {
    if (inputEl) {
      inputEl.focus();
      inputEl.select();
    }
  }, 10);
}

/* Leaving the box empty / 0 collapses it back to the "+ Qty" hint */
function onPOSizeInputBlur(index, size) {
  const row = poItemRows[index];
  const cardEl = document.getElementById(`po-card-${index}-${size}`);
  const inputEl = document.getElementById(`po-qty-${index}-${size}`);
  const qty = row ? Number(row.qtys[size]) || 0 : 0;
  if (inputEl) inputEl.value = qty > 0 ? String(qty) : '';
  if (cardEl) {
    cardEl.classList.remove('editing');
    if (qty > 0) {
      cardEl.classList.add('has-qty');
    } else {
      cardEl.classList.remove('has-qty');
    }
  }
}

function updatePOItemRow(index, field, value) {
  if (!poItemRows[index]) return;
  poItemRows[index][field] = value;
  renderPOItemRows();
}

function addPOItemRow() {
  poItemRows.push(newPORow(''));
  renderPOItemRows();
}

function removePOItemRow(index) {
  if (poItemRows.length <= 1) return;
  poItemRows.splice(index, 1);
  renderPOItemRows();
}

function poSuggestedQty(p, size = 0) {
  if (!p) return 5;
  const s = size > 0 ? normalizeCanSize(size) : ((productSizes(p) || [])[0] || 1);
  const count = productCanCount(p, s);
  const thresh = productSizeThreshold(p, s);
  const minBatch = s >= 16 ? 1 : (s >= 4 ? 2 : 5);
  const needed = Math.max(minBatch, (thresh * 2) - count);
  return Math.min(PO_MAX_QTY, needed);
}

function addAllSupplierProductsToPO() {
  const supplier = poSupplierId ? db.suppliers.find(s => s.id === poSupplierId) : null;
  if (!supplier) { showToast('Select a supplier first.', 'error'); return; }
  const supplied = activeProducts().filter(p => supplier.productIds && supplier.productIds.includes(p.id));
  if (!supplied.length) { showToast('No products linked to this supplier.', 'error'); return; }
  poItemRows = supplied.map(p => {
    const primarySize = (productSizes(p) || [])[0] || 1;
    return newPORow(p.id, { [primarySize]: poSuggestedQty(p, primarySize) }, ![1, 4, 16].includes(primarySize));
  });
  renderPOItemRows();
  showToast(`Loaded ${supplied.length} product(s) from ${supplier.name}.`);
}

function addLowStockToPO() {
  const supplier = poSupplierId ? db.suppliers.find(s => s.id === poSupplierId) : null;
  if (!supplier) { showToast('Select a supplier first.', 'error'); return; }
  const supplied = activeProducts().filter(p => supplier.productIds && supplier.productIds.includes(p.id));
  const low = supplied.filter(p => productHasLowStock(p));
  if (!low.length) { showToast('No low-stock products from this supplier.', 'ok'); return; }
  if (poItemRows.length === 1 && !poItemRows[0].productId) poItemRows = [];
  low.forEach(p => {
    if (!poItemRows.some(r => r.productId === p.id)) {
      const qtys = {};
      const lowSizes = productLowSizes(p);
      const hasNonStandard = lowSizes.some(s => ![1, 4, 16].includes(s));
      if (lowSizes.length > 0) {
        lowSizes.forEach(s => {
          const count = productCanCount(p, s);
          const thresh = productSizeThreshold(p, s);
          const minBatch = s >= 16 ? 1 : (s >= 4 ? 2 : 5);
          qtys[s] = Math.min(PO_MAX_QTY, Math.max(minBatch, (thresh * 2) - count));
        });
      } else {
        const primarySize = (productSizes(p) || [])[0] || 1;
        qtys[primarySize] = poSuggestedQty(p, primarySize);
      }
      poItemRows.push(newPORow(p.id, qtys, hasNonStandard));
    }
  });
  renderPOItemRows();
  showToast(`Added ${low.length} low-stock item(s).`);
}

async function submitPO(e) {
  e.preventDefault();
  const supplierId = document.getElementById('po-supplier').value;
  const supplier = db.suppliers.find(s => s.id === supplierId);
  if (!supplier) { showToast('Please select a supplier.', 'error'); return false; }

  const validRows = poItemRows.filter(r => r.productId);
  if (validRows.length === 0) { showToast('Add at least one product to the order.', 'error'); return false; }

  for (const row of validRows) {
    const p = productById(row.productId);
    if (!p) { showToast('Invalid product selected.', 'error'); return false; }
    if (!poRowTotals(row).hasQty) { showToast(`Enter a quantity for at least one size of ${p.name}.`, 'error'); return false; }
  }

  // One PO item per product + size (keeps receiving per size)
  const items = [];
  validRows.forEach(row => {
    const p = productById(row.productId);
    poSizesFor(p).forEach(s => {
      const q = Number(row.qtys[s]) || 0;
      if (q > 0) {
        items.push({
          productId: p.id,
          productName: p.name,
          brand: p.brand,
          color: p.color,
          size: s,
          qty: q,
          unitCost: poUnitCost(p, s)
        });
      }
    });
  });

  const totalAmount = items.reduce((sum, it) => sum + (it.qty * it.unitCost), 0);
  const notes = (document.getElementById('po-notes') ? document.getElementById('po-notes').value : '').trim();
  const isAdmin = currentUser && currentUser.role === 'admin';
  const status = isAdmin ? 'ordered' : 'pending';

  const expectedDate = null; // Offline system: no expected delivery date

  const po = {
    id: uid('po'),
    poNumber: generatePONumber(),
    supplierId: supplier.id,
    supplierName: supplier.name,
    orderDate: nowISO(),
    expectedDate,
    status,
    totalAmount: Number(totalAmount.toFixed(2)),
    items,
    itemsJson: JSON.stringify(items),
    notes,
    createdBy: (currentUser && currentUser.name) || 'Staff',
    receivedAt: null
  };

  if (!db.purchaseOrders) db.purchaseOrders = [];
  db.purchaseOrders.push(po);
  await saveDB();

  showToast(
    isAdmin
      ? `Purchase Order ${po.poNumber} created & approved for ${supplier.name}.`
      : `Purchase Order ${po.poNumber} submitted for Admin approval.`,
    'ok'
  );
  poViewMode = 'detail';
  poDetailId = po.id;
  poItemRows = [];
  renderPage();
  return false;
}

/* ============================================================
   DIRECT PO CREATION FROM LOW-STOCK PRODUCTS
   ============================================================ */

/**
 * Directly creates purchase order(s) for the specified product IDs (or currently selected low-stock products).
 * Groups items by supplier, calculates suggested restock quantities based on size thresholds,
 * generates unique PO numbers, saves to DB, logs audit, and navigates straight to the new PO.
 *
 * @param {string[]|string} [productIds] - Array of product IDs or single product ID.
 */
async function createPOFromSelectedLowStock(productIds) {
  let ids = productIds;
  if (typeof ids === 'string') ids = [ids];
  if (!ids || !ids.length) {
    if (typeof selectedAlertProductIds !== 'undefined' && selectedAlertProductIds.size > 0) {
      ids = Array.from(selectedAlertProductIds);
    } else if (typeof selectedDashProductIds !== 'undefined' && selectedDashProductIds.size > 0) {
      ids = Array.from(selectedDashProductIds);
    }
  }

  if (!ids || !ids.length) {
    showToast('Please select at least one low-stock product first.', 'error');
    return;
  }

  const selectedProducts = ids.map(id => productById(id)).filter(Boolean);
  if (!selectedProducts.length) {
    showToast('No valid products found for selected IDs.', 'error');
    return;
  }

  // Duplicate PO guard: check if any selected products already have active open POs
  if (!window._allowDuplicatePOCreation) {
    const alreadyOnOrder = selectedProducts.filter(p => productHasOpenPO(p.id));
    if (alreadyOnOrder.length > 0) {
      const details = alreadyOnOrder.map(p => {
        const openOrders = openPOsForProduct(p.id);
        const orderLabels = openOrders.map(o => `<b>${o.poNumber}</b> (${poStatusBadge(o.status)})`).join(', ');
        return `• <b>${escapeHtml(p.name)}</b>: already in ${orderLabels}`;
      }).join('<br>');

      showPOConfirm({
        icon: '⚠️',
        title: 'Potential Duplicate Purchase Order',
        message: `The following product(s) already have active purchase orders pending delivery:<br><br>${details}<br><br>Creating another purchase order will duplicate the order with your supplier. Do you wish to create a duplicate order anyway?`,
        confirmLabel: 'Proceed & Create Anyway',
        confirmClass: 'btn danger',
        onConfirm: () => {
          window._allowDuplicatePOCreation = true;
          createPOFromSelectedLowStock(ids).finally(() => { window._allowDuplicatePOCreation = false; });
        }
      });
      return;
    }
  }

  // 1. Resolve suppliers for selected products
  const supplierGroups = new Map();
  const unlinkedProducts = [];

  for (const p of selectedProducts) {
    const suppliers = suppliersForProduct(p.id).filter(s => s.status === 'active');
    const supplier = suppliers[0] || (db.suppliers || []).find(s => s.status === 'active' && (s.productIds || []).includes(p.id));
    if (!supplier) {
      unlinkedProducts.push(p);
    } else {
      if (!supplierGroups.has(supplier.id)) {
        supplierGroups.set(supplier.id, { supplier, products: [] });
      }
      supplierGroups.get(supplier.id).products.push(p);
    }
  }

  // Handle unlinked products if any
  if (unlinkedProducts.length > 0) {
    const activeSuppliers = (db.suppliers || []).filter(s => s.status === 'active');
    if (activeSuppliers.length === 1) {
      const fallback = activeSuppliers[0];
      if (!fallback.productIds) fallback.productIds = [];
      unlinkedProducts.forEach(p => {
        if (!fallback.productIds.includes(p.id)) fallback.productIds.push(p.id);
        if (!supplierGroups.has(fallback.id)) {
          supplierGroups.set(fallback.id, { supplier: fallback, products: [] });
        }
        supplierGroups.get(fallback.id).products.push(p);
      });
    } else if (activeSuppliers.length > 1) {
      openUnlinkedSupplierModal(unlinkedProducts, supplierGroups, ids);
      return;
    } else {
      showToast('No active suppliers found in system. Please add an active supplier first.', 'error');
      return;
    }
  }

  if (supplierGroups.size === 0) {
    showToast('Could not match selected products to any active suppliers.', 'error');
    return;
  }

  // If multiple suppliers were selected, let staff pick which supplier order to check and submit:
  if (supplierGroups.size > 1) {
    openMultiSupplierPOPickerModal(supplierGroups);
    return;
  }

  // Single supplier: open the PO Create page pre-filled so staff can check before submitting!
  const [supplierId, group] = Array.from(supplierGroups.entries())[0];
  loadPOWithProducts(group.supplier.id, group.products);
}

function loadPOWithProducts(supplierId, products) {
  poViewMode = 'create';
  poSupplierId = supplierId;

  // Build the item rows pre-filled with suggested quantities
  poItemRows = products.map(p => {
    const qtys = {};
    const sizes = productSizes(p);
    const lowSizes = productLowSizes(p);
    let addedAny = false;

    sizes.forEach(s => {
      const count = productCanCount(p, s);
      const thresh = productSizeThreshold(p, s);
      const st = productSizeStatus(p, s);
      if (st === 'out' || st === 'low' || count <= thresh) {
        const minBatch = s >= 16 ? 1 : (s >= 4 ? 2 : 5);
        qtys[s] = Math.min(PO_MAX_QTY, Math.max(minBatch, (thresh * 2) - count));
        addedAny = true;
      } else {
        qtys[s] = 0;
      }
    });

    if (!addedAny) {
      const primarySize = sizes[0] || 1;
      qtys[primarySize] = poSuggestedQty(p, primarySize);
    }

    return newPORow(p.id, qtys);
  });

  // Pre-fill notes
  window._poInitialNotes = `Low-stock restock order for ${products.length} product(s)`;

  // Clear selections
  if (typeof selectedAlertProductIds !== 'undefined') selectedAlertProductIds.clear();
  if (typeof selectedDashProductIds !== 'undefined') selectedDashProductIds.clear();

  // Navigate to purchase orders page in create mode so staff can check before submitting
  goTo('purchaseOrders');

  const s = supplierById(supplierId);
  showToast(`Loaded ${products.length} product(s) for ${s ? s.name : 'supplier'}. Please check quantities before submitting for approval.`, 'ok');
}

function openMultiSupplierPOPickerModal(supplierGroups) {
  const groups = Array.from(supplierGroups.values());
  const bodyHtml = `
    <div style="font-size:13px; color:var(--ink-soft); margin-bottom:14px;">
      The products you selected belong to <b>${groups.length} different suppliers</b>.
      Please choose which supplier order you want to check and submit for approval:
    </div>
    <div style="display:flex; flex-direction:column; gap:10px;">
      ${groups.map((g, idx) => {
        const prodNames = g.products.map(p => escapeHtml(p.name)).join(', ');
        return `
          <div style="background:#FAF8F5; border:1px solid var(--line); border-radius:var(--radius-sm); padding:12px 14px; display:flex; justify-content:space-between; align-items:center; gap:12px;">
            <div>
              <div style="font-weight:700; color:var(--teal-dark); font-size:14px;">${escapeHtml(g.supplier.name)}</div>
              <div class="muted small" style="margin-top:2px;"><b>${g.products.length}</b> product(s): ${prodNames}</div>
            </div>
            <button class="btn small" onclick="closeModal(); loadPOWithProducts('${g.supplier.id}', window._multiSupplierGroups[${idx}].products);">
              Check &amp; Create Order &rarr;
            </button>
          </div>
        `;
      }).join('')}
    </div>
  `;

  window._multiSupplierGroups = groups;
  openModal('Select Supplier Order to Check', bodyHtml, '<button class="btn secondary" onclick="closeModal()">Cancel</button>', 'modal-md');
}

function openUnlinkedSupplierModal(unlinkedProducts, supplierGroups, allIds) {
  const activeSuppliers = (db.suppliers || []).filter(s => s.status === 'active');
  const prodNames = unlinkedProducts.map(p => escapeHtml(p.name)).join(', ');
  
  const bodyHtml = `
    <div style="font-size:13px; color:var(--ink-soft); margin-bottom:14px;">
      The following product(s) do not have a supplier assigned yet:<br>
      <strong style="color:var(--ink);">${prodNames}</strong><br><br>
      Please select a supplier to create this purchase order with:
    </div>
    <div class="field">
      <label>Supplier <span style="color:var(--danger);">*</span></label>
      <select id="unlinked-supplier-sel" style="width:100%;">
        ${activeSuppliers.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')}
      </select>
    </div>
  `;

  const footHtml = `
    <button class="btn secondary" onclick="closeModal()">Cancel</button>
    <button class="btn" onclick="confirmUnlinkedSupplierAndCreate()">Continue &amp; Create Order &rarr;</button>
  `;

  window._pendingUnlinkedProducts = unlinkedProducts;
  window._pendingAllIds = allIds;
  openModal('Assign Supplier for Order', bodyHtml, footHtml, 'modal-sm');
}

async function confirmUnlinkedSupplierAndCreate() {
  const sel = document.getElementById('unlinked-supplier-sel');
  if (!sel || !sel.value) return;
  const supplier = supplierById(sel.value);
  if (!supplier) return;

  const prods = window._pendingUnlinkedProducts || [];
  if (!supplier.productIds) supplier.productIds = [];
  prods.forEach(p => {
    if (!supplier.productIds.includes(p.id)) supplier.productIds.push(p.id);
  });
  await saveDB();
  closeModal();

  createPOFromSelectedLowStock(window._pendingAllIds);
}

/* ============================================================
   PO LIST ROW ACTIONS DROPDOWN MENU
   ============================================================ */
let activePOActionsMenuId = null;

function closeAllPOActionsMenus() {
  const el = document.getElementById('po-actions-menu-dropdown');
  if (el) el.remove();
  activePOActionsMenuId = null;
  document.querySelectorAll('.po-actions-menu-btn.active').forEach(b => b.classList.remove('active'));
}

function togglePORowActionsMenu(poId, btnEl, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  if (activePOActionsMenuId === poId) {
    closeAllPOActionsMenus();
    return;
  }
  closeAllPOActionsMenus();
  closePOProductPicker();

  const po = (db.purchaseOrders || []).find(o => o.id === poId);
  if (!po) return;

  activePOActionsMenuId = poId;
  btnEl.classList.add('active');

  const isAdmin = currentUser && currentUser.role === 'admin';
  const isStaff = currentUser && currentUser.role === 'staff';
  const canApprove = isAdmin && po.status === 'pending';
  const canReceive = isStaff && (po.status === 'ordered' || po.status === 'partial');
  const canCancel = (po.status === 'pending' && (isAdmin || isStaff)) || (po.status === 'ordered' && isAdmin);

  const menu = document.createElement('div');
  menu.id = 'po-actions-menu-dropdown';
  menu.className = 'po-actions-dropdown';
  menu.onclick = e => e.stopPropagation();

  menu.innerHTML = `
    <button type="button" class="po-action-item" onclick="closeAllPOActionsMenus(); viewPODetail('${po.id}')">
      <span class="po-act-icon">👁️</span>
      <span>View Details</span>
    </button>
    <button type="button" class="po-action-item" onclick="closeAllPOActionsMenus(); printPO('${po.id}')">
      <span class="po-act-icon">🖨️</span>
      <span>Print PO Voucher</span>
    </button>
    ${canApprove ? `
    <button type="button" class="po-action-item accent" onclick="closeAllPOActionsMenus(); confirmApprovePO('${po.id}')">
      <span class="po-act-icon">✓</span>
      <span>Approve Order</span>
    </button>` : ''}
    ${canReceive ? `
    <button type="button" class="po-action-item accent" onclick="closeAllPOActionsMenus(); goToReceivingForPO('${po.id}')">
      <span class="po-act-icon">📥</span>
      <span>Receive Delivery</span>
    </button>` : ''}
    <div class="po-action-divider"></div>
    <button type="button" class="po-action-item" onclick="closeAllPOActionsMenus(); duplicatePO('${po.id}')">
      <span class="po-act-icon">🔄</span>
      <span>Reorder / Duplicate</span>
    </button>
    ${canCancel ? `
    <div class="po-action-divider"></div>
    <button type="button" class="po-action-item danger" onclick="closeAllPOActionsMenus(); confirmCancelPO('${po.id}')">
      <span class="po-act-icon">✕</span>
      <span>Cancel Order</span>
    </button>` : ''}
  `;

  document.body.appendChild(menu);

  // Position anchored to button
  const rect = btnEl.getBoundingClientRect();
  const menuWidth = 195;
  let top = rect.bottom + 5;
  let left = rect.right - menuWidth;

  if (left < 10) left = 10;
  if (left + menuWidth > window.innerWidth - 10) left = window.innerWidth - menuWidth - 10;

  const menuHeight = menu.offsetHeight || 190;
  if (top + menuHeight > window.innerHeight - 10 && rect.top > menuHeight) {
    top = Math.max(10, rect.top - menuHeight - 5);
  }

  menu.style.top = `${top}px`;
  menu.style.left = `${left}px`;
}

function duplicatePO(id) {
  const po = (db.purchaseOrders || []).find(o => o.id === id);
  if (!po) return;
  const items = getPOItems(po);
  poViewMode = 'create';
  poSupplierId = po.supplierId;

  const grouped = {};
  items.forEach(it => {
    if (!grouped[it.productId]) {
      grouped[it.productId] = { qtys: {}, showAllSizes: false };
    }
    const sz = Number(it.size) || 1;
    grouped[it.productId].qtys[sz] = Number(it.qty) || 0;
    if (![1, 4, 16].includes(sz)) {
      grouped[it.productId].showAllSizes = true;
    }
  });

  poItemRows = Object.keys(grouped).map(pid => newPORow(pid, grouped[pid].qtys, grouped[pid].showAllSizes));
  if (!poItemRows.length) poItemRows = [newPORow('')];

  window._poInitialNotes = `Reorder from ${po.poNumber}`;
  renderPage();
  showToast(`Draft created from ${po.poNumber}. Review quantities and submit.`);
}

/* ============================================================
   SMART PRODUCT SEARCH DROPDOWN (CREATE PO)
   ============================================================ */
let poPickerOpenIndex = null;
let poPickerSearchQuery = '';
let poPickerFilterMode = 'all';

function closePOProductPicker() {
  const el = document.getElementById('po-product-picker-dropdown');
  if (el) el.remove();
  poPickerOpenIndex = null;
  poPickerSearchQuery = '';
  poPickerFilterMode = 'all';
  document.querySelectorAll('.po-product-picker-btn.active').forEach(b => b.classList.remove('active'));
}

function renderPOProductPickerTrigger(index, product) {
  if (product) {
    const hex = getProductHex(product);
    return `
      <div class="po-product-picker-trigger-wrap">
        <button type="button" class="po-product-picker-btn selected ${poPickerOpenIndex === index ? 'active' : ''}"
          onclick="togglePOProductPicker(${index}, this, event)"
          title="Click to search or switch paint product">
          <span class="po-picker-avatar" style="background-color:${hex};"></span>
          <div class="po-picker-info">
            <div class="po-picker-title">${escapeHtml(product.name)}</div>
            <div class="po-picker-sub">${escapeHtml(product.brand || '')}${product.color && product.color !== '-' ? ' · ' + escapeHtml(product.color) : ''} · <span style="font-weight:600; color:${productHasLowStock(product) ? '#C1443D' : 'var(--teal-dark)'};">Stock: ${formatLiters(product.stock)}</span></div>
          </div>
          <span class="po-picker-arrow">▾</span>
        </button>
        <button type="button" class="po-picker-reset-btn" onclick="clearPOProductRow(${index}, event)" title="Change / remove product">✕</button>
      </div>`;
  }

  return `
    <button type="button" class="po-product-picker-btn empty ${poPickerOpenIndex === index ? 'active' : ''}"
      onclick="togglePOProductPicker(${index}, this, event)"
      title="Click to select paint product">
      <span class="po-picker-avatar-placeholder">🎨</span>
      <div class="po-picker-info">
        <div class="po-picker-title" style="color:var(--ink-soft); font-weight:600;">Select paint product…</div>
        <div class="po-picker-sub">Search paint name, color swatch, brand, or SKU</div>
      </div>
      <span class="po-picker-arrow">▾</span>
    </button>`;
}

function togglePOProductPicker(index, btnEl, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  if (poPickerOpenIndex === index) {
    closePOProductPicker();
    return;
  }
  closeAllPOActionsMenus();
  closePOProductPicker();

  const supplier = poSupplierId ? db.suppliers.find(s => s.id === poSupplierId) : null;
  if (!supplier) {
    showToast('Select a supplier first.', 'error');
    return;
  }

  const allActive = activeProducts();
  if (!allActive.length) {
    showToast('No active products found in inventory.', 'error');
    return;
  }

  const suppliedProducts = allActive.filter(p => supplier.productIds && supplier.productIds.includes(p.id));

  poPickerOpenIndex = index;
  poPickerSearchQuery = '';
  poPickerFilterMode = suppliedProducts.length > 0 ? 'supplied' : 'all';
  btnEl.classList.add('active');

  const currentProductId = poItemRows[index] ? poItemRows[index].productId : '';

  const dropdown = document.createElement('div');
  dropdown.id = 'po-product-picker-dropdown';
  dropdown.className = 'po-product-picker-dropdown';
  dropdown.onclick = e => e.stopPropagation();

  dropdown.innerHTML = renderPOProductPickerContent(index, suppliedProducts, currentProductId);
  document.body.appendChild(dropdown);

  positionPOProductPicker(btnEl, dropdown);

  setTimeout(() => {
    const input = document.getElementById('po-picker-search-input');
    if (input) input.focus();
  }, 20);
}

function positionPOProductPicker(btnEl, dropdown) {
  const rect = btnEl.getBoundingClientRect();
  const width = Math.max(340, Math.min(460, rect.width));
  let top = rect.bottom + 4;
  let left = rect.left;

  if (left + width > window.innerWidth - 10) {
    left = window.innerWidth - width - 10;
  }
  if (left < 10) left = 10;

  const maxHeight = 340;
  if (top + maxHeight > window.innerHeight - 10 && rect.top > maxHeight) {
    top = Math.max(10, rect.top - maxHeight - 4);
  }

  dropdown.style.top = `${top}px`;
  dropdown.style.left = `${left}px`;
  dropdown.style.width = `${width}px`;
}

function renderPOProductPickerContent(index, suppliedProducts, currentProductId) {
  const q = (poPickerSearchQuery || '').trim().toLowerCase();
  const allProds = activeProducts();
  const hasSupplied = suppliedProducts && suppliedProducts.length > 0;

  let pool = allProds;
  if (poPickerFilterMode === 'supplied' && hasSupplied) {
    pool = suppliedProducts;
  } else if (poPickerFilterMode === 'low') {
    pool = (hasSupplied ? suppliedProducts : allProds).filter(p => productHasLowStock(p));
  }

  let filtered = pool;
  if (q) {
    filtered = pool.filter(p => {
      const hex = getProductHex(p);
      const hay = `${p.name || ''} ${p.color || ''} ${p.brand || ''} ${p.type || ''} ${p.sku || ''} ${hex}`.toLowerCase();
      return hay.includes(q);
    });
    if (filtered.length === 0 && poPickerFilterMode === 'supplied') {
      filtered = allProds.filter(p => {
        const hex = getProductHex(p);
        const hay = `${p.name || ''} ${p.color || ''} ${p.brand || ''} ${p.type || ''} ${p.sku || ''} ${hex}`.toLowerCase();
        return hay.includes(q);
      });
    }
  }

  const lowCount = (hasSupplied ? suppliedProducts : allProds).filter(p => productHasLowStock(p)).length;

  const selectedInOtherRows = new Map();
  poItemRows.forEach((r, rIdx) => {
    if (rIdx !== index && r.productId) {
      selectedInOtherRows.set(r.productId, rIdx + 1);
    }
  });

  const itemsHtml = filtered.length === 0
    ? `<div class="po-picker-empty-state">
         <span>🔍</span>
         <div style="font-weight:600;">No matching products found</div>
         <div style="font-size:11.5px;">Try another search keyword or clear filters.</div>
       </div>`
    : filtered.map(p => {
        const hex = getProductHex(p);
        const isSel = p.id === currentProductId;
        const otherRow = selectedInOtherRows.get(p.id);
        const isLow = productHasLowStock(p);
        const lowSummary = isLow ? productLowSizesSummary(p) : '';
        const price = p.price ? peso(p.price * 0.8) : '—';
        const isLinked = hasSupplied && suppliedProducts.some(sp => sp.id === p.id);

        return `
          <button type="button" class="po-picker-item ${isSel ? 'selected' : ''} ${otherRow ? 'in-other-row' : ''}" onclick="selectPOProduct(${index}, '${p.id}', event)">
            <span class="po-picker-item-avatar" style="background-color:${hex};"></span>
            <div class="po-picker-item-main">
              <div class="po-picker-item-name">
                <span>${escapeHtml(p.name)}</span>
                ${p.color && p.color !== '-' ? `<span class="po-picker-item-color">(${escapeHtml(p.color)})</span>` : ''}
                ${isLinked ? `<span class="badge" style="background:#EAF4F3; color:var(--teal-dark); font-size:9.5px; padding:1px 5px;">Linked</span>` : ''}
              </div>
              <div class="po-picker-item-sub">
                ${escapeHtml(p.brand || '')}${p.type ? ' · ' + escapeHtml(p.type) : ''} · Unit cost: ${price}
              </div>
            </div>
            <div class="po-picker-item-right">
              ${otherRow
                ? `<span class="badge" style="background:#F0EDED; color:var(--ink-soft); font-size:10px;">Row #${otherRow}</span>`
                : (isLow
                    ? `<span class="badge low" title="${escapeHtml(lowSummary)}">⚠️ ${escapeHtml(lowSummary) || 'Low'}</span>`
                    : `<span class="badge ok">🥫 ${formatStock(p.stock)}L</span>`
                  )
              }
              ${isSel ? `<span class="po-picker-check">✓</span>` : ''}
            </div>
          </button>
        `;
      }).join('');

  return `
    <div class="po-picker-header">
      <div class="po-picker-search-bar">
        <span class="po-picker-search-icon">🔍</span>
        <input type="text" id="po-picker-search-input" class="po-picker-search-input"
          placeholder="Search paint name, brand, color, SKU..."
          value="${escapeHtml(poPickerSearchQuery)}"
          oninput="onPOPickerSearchInput(${index}, this.value)"
          autocomplete="off">
        ${poPickerSearchQuery ? `<button type="button" class="po-picker-clear-search" onclick="clearPOPickerSearch(${index})">✕</button>` : ''}
      </div>
      <div class="po-picker-filter-chips">
        ${hasSupplied ? `
          <button type="button" class="po-picker-chip ${poPickerFilterMode === 'supplied' ? 'active' : ''}" onclick="setPOPickerFilterMode(${index}, 'supplied')">
            Linked (${suppliedProducts.length})
          </button>
          <button type="button" class="po-picker-chip ${poPickerFilterMode === 'all' ? 'active' : ''}" onclick="setPOPickerFilterMode(${index}, 'all')">
            All Products (${allProds.length})
          </button>
        ` : `
          <button type="button" class="po-picker-chip ${poPickerFilterMode === 'all' ? 'active' : ''}" onclick="setPOPickerFilterMode(${index}, 'all')">
            All Products (${allProds.length})
          </button>
        `}
        ${lowCount > 0 ? `
          <button type="button" class="po-picker-chip low ${poPickerFilterMode === 'low' ? 'active' : ''}" onclick="setPOPickerFilterMode(${index}, 'low')">
            ⚠️ Low Stock (${lowCount})
          </button>` : ''}
      </div>
    </div>
    <div class="po-picker-list" id="po-picker-list-${index}">
      ${itemsHtml}
    </div>
    <div class="po-picker-footer">
      <span>Showing <b>${filtered.length}</b> of ${pool.length} products</span>
      ${currentProductId ? `<button type="button" class="po-picker-clear-btn" onclick="clearPOProductRow(${index}, event)">✕ Clear Selection</button>` : ''}
    </div>
  `;
}

function onPOPickerSearchInput(index, val) {
  poPickerSearchQuery = val || '';
  const supplier = poSupplierId ? db.suppliers.find(s => s.id === poSupplierId) : null;
  if (!supplier) return;
  const suppliedProducts = activeProducts().filter(p => supplier.productIds && supplier.productIds.includes(p.id));
  const currentProductId = poItemRows[index] ? poItemRows[index].productId : '';
  const dropdown = document.getElementById('po-product-picker-dropdown');
  if (dropdown) {
    dropdown.innerHTML = renderPOProductPickerContent(index, suppliedProducts, currentProductId);
    const input = document.getElementById('po-picker-search-input');
    if (input) {
      input.focus();
      const len = input.value.length;
      input.setSelectionRange(len, len);
    }
  }
}

function clearPOPickerSearch(index) {
  onPOPickerSearchInput(index, '');
}

function setPOPickerFilterMode(index, mode) {
  poPickerFilterMode = mode;
  onPOPickerSearchInput(index, poPickerSearchQuery);
}

function selectPOProduct(index, productId, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  if (!poItemRows[index]) return;
  const p = productById(productId);
  if (!p) return;

  // Duplicate check: check if this product is already selected in another row
  const dupIndex = poItemRows.findIndex((r, i) => i !== index && r.productId === productId);
  if (dupIndex !== -1) {
    showToast(`"${p.name}" is already in row #${dupIndex + 1}. Please adjust quantities there.`, 'error');
    closePOProductPicker();
    return;
  }

  const prevProductId = poItemRows[index].productId;
  poItemRows[index].productId = productId;
  poItemRows[index].qtys = {};

  const sizes = productSizes(p);
  const lowSizes = productLowSizes(p);

  if (lowSizes.length > 0) {
    lowSizes.forEach(s => {
      const count = productCanCount(p, s);
      const thresh = productSizeThreshold(p, s);
      const minBatch = s >= 16 ? 1 : (s >= 4 ? 2 : 5);
      poItemRows[index].qtys[s] = Math.min(PO_MAX_QTY, Math.max(minBatch, (thresh * 2) - count));
    });
    if (lowSizes.some(s => ![1, 4, 16].includes(s))) {
      poItemRows[index].showAllSizes = true;
    }
  } else {
    const primarySize = sizes[0] || 1;
    poItemRows[index].qtys[primarySize] = poSuggestedQty(p, primarySize);
    if (![1, 4, 16].includes(primarySize)) {
      poItemRows[index].showAllSizes = true;
    }
  }

  // Auto-link to supplier if not already linked
  const supplier = poSupplierId ? db.suppliers.find(s => s.id === poSupplierId) : null;
  if (supplier) {
    if (!supplier.productIds) supplier.productIds = [];
    if (!supplier.productIds.includes(productId)) {
      supplier.productIds.push(productId);
    }
  }

  closePOProductPicker();
  renderPOItemRows();
}

function clearPOProductRow(index, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  if (!poItemRows[index]) return;
  poItemRows[index].productId = '';
  poItemRows[index].qtys = {};
  closePOProductPicker();
  renderPOItemRows();
}

/* Global dropdown event listeners */
if (!window._poDropdownListenersAttached) {
  window._poDropdownListenersAttached = true;
  document.addEventListener('click', e => {
    if (!e.target.closest('#po-actions-menu-dropdown') && !e.target.closest('.po-actions-menu-btn')) {
      closeAllPOActionsMenus();
    }
    if (!e.target.closest('#po-product-picker-dropdown') && !e.target.closest('.po-product-picker-btn') && !e.target.closest('.po-picker-reset-btn')) {
      closePOProductPicker();
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeAllPOActionsMenus();
      closePOProductPicker();
    }
  });

  window.addEventListener('resize', () => {
    closeAllPOActionsMenus();
    closePOProductPicker();
  });

  window.addEventListener('scroll', e => {
    // Prevent dropdown from prematurely closing when user scrolls inside the picker list itself
    if (e.target && e.target.closest && (e.target.closest('#po-product-picker-dropdown') || e.target.closest('#po-actions-menu-dropdown'))) {
      return;
    }
    closeAllPOActionsMenus();
    closePOProductPicker();
  }, true);
}
