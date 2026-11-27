/* ============================================================
   17. STOCK RECEIVING / ADJUSTMENTS (inventory staff)
   ============================================================ */
let bulkAdjustmentRows = [];
let bulkAdjSupplierFilter = '';
let bulkAdjCategoryFilter = '';
let bulkAdjSearchQuery = '';
let bulkAdjSortBy = 'name-asc';
let bulkAdjBatchNote = '';
let receivingPOId = '';
let receivingPOSearchQuery = '';
let receivingPOStatusFilter = 'open'; // 'open' (default: pending + partial), 'all', 'pending', 'partial', 'received'
let receivingPOSortBy = 'date-desc'; // 'date-desc' (default), 'date-asc', 'po-asc', 'po-desc', 'supplier-asc', 'supplier-desc', 'amount-desc', 'amount-asc'
const RECEIVING_PO_SORT_OPTIONS = [
  'date-desc',
  'date-asc',
  'po-asc',
  'po-desc',
  'supplier-asc',
  'supplier-desc',
  'amount-desc',
  'amount-asc'
];
let receivingPOVisibleLimit = 6;
let currentMovementType = 'receiving';
let adjActiveView = 'entry'; // 'entry' or 'requests'
let adjRequestFilterStatus = 'all'; // 'all', 'pending', 'approved', 'rejected'

function generateAdjReqNumber() {
  const year = new Date().getFullYear();
  let count = (db.adjustmentRequests || []).length + 1;
  let reqNum = `ADJ-${year}-${String(count).padStart(4, '0')}`;
  while ((db.adjustmentRequests || []).some(r => r.reqNumber === reqNum)) {
    count++;
    reqNum = `ADJ-${year}-${String(count).padStart(4, '0')}`;
  }
  return reqNum;
}

function pendingAdjRequests() {
  return (db.adjustmentRequests || []).filter(r => r.status === 'pending');
}

/**
 * Direct navigation to Stock Adjustment with optional preselected product.
 * Used across Inventory and Dashboard views.
 */
function goToAdjustment(productId = null) {
  currentMovementType = 'adjustment';
  if (productId) {
    const p = productById(productId);
    const sz = defaultAdjSizeForProduct(p, 'Damaged', 1);
    const maxQty = maxAllowedAdjQty(p, 'Damaged', sz);
    const qty = maxQty >= 1 ? 1 : 1;
    bulkAdjustmentRows = [{ id: uid('adj'), productId: productId, reason: 'Damaged', size: sz, qty: qty, note: '' }];
  } else if (!bulkAdjustmentRows || bulkAdjustmentRows.length === 0) {
    bulkAdjustmentRows = [{ id: uid('adj'), productId: '', reason: 'Damaged', size: 1, qty: 1, note: '' }];
  }
  goTo('receiving');
}

// Stock Adjustment Quantity Safeguards (allows deducting down to 0 so damaged/leaking last unit can be removed; Staff requests still require Admin approval)
const MAX_ADJ_DEDUCT_CANS = 5;     // Max sealed cans deductible per manual adjustment entry
const MAX_ADJ_ADD_CANS = 10;       // Max sealed cans added via Count Correction (+) (use Purchase Orders for restocking)

/* Opened / Used stock is adjusted PER CAN SIZE. Size values: <size> (sealed cans of that size, e.g. 1, 3.5, 20) or 'opened<size>'
   (opened pool of that can size, e.g. 'opened4'). The legacy value 'opened' resolves to the largest size that currently has opened leftover.
   The available sizes come from the product itself (productSizes). */
function isOpenedSizeValue(v) {
  return typeof v === 'string' && v.indexOf('opened') === 0;
}

function openedSizeFromValue(product, v) {
  const n = normalizeCanSize(String(v || '').replace('opened', ''));
  if (n && (!product || productHasSize(product, n))) return n;
  const primary = product ? productOpenedCanSize(product) : 0;
  return primary || (product ? productSizes(product)[0] : 0) || 1;
}

function openedValueForSize(size) {
  return 'opened' + (normalizeCanSize(size) || 1);
}

/* Sealed can size for an adjustment row; falls back to the product's first size when the stored one doesn't exist for this product */
function adjSealedSize(product, size) {
  const n = normalizeCanSize(size);
  if (!product) return n || 1;
  return productHasSize(product, n) ? n : (productSizes(product)[0] || 1);
}

function maxAllowedAdjQty(product, reason = 'Damaged', size = 1) {
  const isAdd = reason === 'Count Correction (add)';
  const isOpened = reason === 'Dispose Opened / Used Stock' || (!isAdd && isOpenedSizeValue(size));
  if (isOpened) {
    return product ? productOpenedLiters(product, openedSizeFromValue(product, size)) : 0;
  }
  if (isAdd) {
    return MAX_ADJ_ADD_CANS;
  }
  if (!product) {
    return MAX_ADJ_DEDUCT_CANS;
  }
  const sizeNum = adjSealedSize(product, size);
  const currentStock = Number(product.stock) || 0;
  const hasBreakdown = productHasCanBreakdown(product);
  const availCans = hasBreakdown ? productCanCount(product, sizeNum) : Math.floor(currentStock / sizeNum);
  const maxByStock = Math.floor(currentStock / sizeNum);
  return Math.max(0, Math.min(MAX_ADJ_DEDUCT_CANS, availCans, maxByStock));
}

function defaultAdjSizeForProduct(product, reason = 'Damaged', currentSize = 1) {
  if (reason === 'Dispose Opened / Used Stock') {
    if (!product) return isOpenedSizeValue(currentSize) ? currentSize : 'opened';
    if (isOpenedSizeValue(currentSize) && productOpenedLiters(product, openedSizeFromValue(product, currentSize)) > 0) {
      return openedValueForSize(openedSizeFromValue(product, currentSize));
    }
    return openedValueForSize(productOpenedCanSize(product) || productSizes(product)[0] || 1);
  }
  if (!product) {
    if (reason === 'Count Correction (add)') return (!isOpenedSizeValue(currentSize) && normalizeCanSize(currentSize)) ? Number(currentSize) : 1;
    return (isOpenedSizeValue(currentSize) || normalizeCanSize(currentSize)) ? currentSize : 1;
  }
  const sizes = productSizes(product);
  const numSize = isOpenedSizeValue(currentSize) ? 0 : normalizeCanSize(currentSize);
  const validNum = numSize && sizes.includes(numSize);
  if (reason === 'Count Correction (add)') {
    return validNum ? numSize : sizes[0];
  }
  if (isOpenedSizeValue(currentSize) && productOpenedLiters(product, openedSizeFromValue(product, currentSize)) > 0) {
    return openedValueForSize(openedSizeFromValue(product, currentSize));
  }
  // Prefer a size that has enough stock to allow deduction (>= 2 cans so 50% rule allows at least 1 can)
  if (validNum && maxAllowedAdjQty(product, reason, numSize) >= 1) {
    return numSize;
  }
  for (const s of sizes) {
    if (maxAllowedAdjQty(product, reason, s) >= 1) return s;
  }
  if (validNum && productCanCount(product, numSize) > 0) {
    return numSize;
  }
  for (const s of sizes) {
    if (productCanCount(product, s) > 0) return s;
  }
  if (productOpenedStock(product) > 0 && (Number(product.stock) || 0) <= 0) return openedValueForSize(productOpenedCanSize(product));
  return validNum ? numSize : sizes[0];
}
function initBulkAdjustmentRows() {
  if (!Array.isArray(bulkAdjustmentRows)) {
    bulkAdjustmentRows = [];
  } else {
    bulkAdjustmentRows = bulkAdjustmentRows.filter(r => r && r.productId);
    bulkAdjustmentRows.forEach(r => {
      if (r.size === undefined || r.size === null || r.size === '') {
        r.size = r.reason === 'Dispose Opened / Used Stock' ? openedValueForSize(1) : 1;
      }
    });
  }
}

function receivingPage() {
  if (currentMovementType === 'returns') currentMovementType = 'receiving';
  initBulkAdjustmentRows();
  const supplierOptions = db.suppliers
    .filter(s => s.status === 'active')
    .map(s => {
      const linkedCount = (s.productIds || []).filter(pid => productById(pid)).length;
      return `<option value="${s.id}">${escapeHtml(s.name)} (${linkedCount} products)</option>`;
    })
    .join('');

  // Drop a stale selection if that PO is no longer open
  const openPOs = sortReceivingPOs(openPOsForReceiving(), receivingPOSortBy);
  if (receivingPOId && !openPOs.some(o => o.id === receivingPOId)) receivingPOId = '';
  if (!receivingPOId && openPOs.length > 0) receivingPOId = openPOs[0].id;

  const poOptions = openPOs
    .map(o => {
      const statusTag = o.status === 'partial' ? ' [PARTIAL]' : '';
      return `<option value="${o.id}" ${o.id === receivingPOId ? 'selected' : ''}>${escapeHtml(o.poNumber)}${statusTag} — ${escapeHtml(o.supplierName)} (${peso(o.totalAmount)})</option>`;
    })
    .join('');

  setTimeout(() => {
    toggleMovementFields();
    if (typeof loadSupplierReturns === 'function') loadSupplierReturns(false);
  }, 0);

  const recentStockMoves = groupStockMovements(db.movements).slice(0, 15);

  return `
  <div class="panel">
    <div class="panel-body" style="padding-top:16px;">
      <form onsubmit="return submitMovement(event)">
        <input type="hidden" id="mv-type" value="${currentMovementType || 'receiving'}">

        <!-- Minimalist Mode Switcher -->
        <div class="rcv-tabs-minimal" role="tablist">
          <button type="button" 
            class="rcv-tab-btn ${(!currentMovementType || currentMovementType === 'receiving') ? 'active' : ''}" 
            id="mv-card-receiving" 
            onclick="selectMovementType('receiving')">
            📥 Stock Receiving ${openPOs.length ? `<span id="rcv-tab-badge-pos" class="rcv-tab-count">${openPOs.length}</span>` : ''}
          </button>
          <button type="button" 
            class="rcv-tab-btn ${currentMovementType === 'adjustment' ? 'active' : ''}" 
            id="mv-card-adjustment" 
            onclick="selectMovementType('adjustment')">
            ⚖️ Stock Adjustment ${pendingAdjRequests().length ? `<span id="rcv-tab-badge-adj" class="rcv-tab-count">${pendingAdjRequests().length}</span>` : ''}
          </button>
          <button type="button" 
            class="rcv-tab-btn ${currentMovementType === 'colormix' ? 'active' : ''}" 
            id="mv-card-colormix" 
            onclick="selectMovementType('colormix')">
            🫙 Opened Containers Shelf
          </button>
        </div>

        <!-- Stock Receiving -->
        <div id="mv-fields-receiving">
          <div id="rcv-po-container"></div>
          <div class="rcv-submit-bar">
            <span class="rcv-submit-hint">Physical inspection required first — only accepted quantities enter sellable stock &amp; FIFO expiration batches.</span>
            <button id="btn-submit-rcv" class="btn rcv-submit-btn" type="submit" disabled>🔍 Review &amp; Confirm Delivery</button>
          </div>
          <div id="rcv-active-replacements-panel"></div>
        </div>

    <!-- Stock Adjustment -->
    <div id="mv-fields-adjustment" class="hidden" style="margin-top:14px;">
      <!-- Sub-view navigation between Form & Requests -->
      <div class="rcv-adj-topbar">
        <div class="rcv-subtabs">
          <button type="button" class="btn ${adjActiveView === 'entry' ? '' : 'ghost'} small" style="${adjActiveView === 'entry' ? 'box-shadow:var(--shadow-sm);' : ''}" onclick="switchAdjView('entry')">
            ✏️ Adjustment Form
          </button>
          <button type="button" class="btn ${adjActiveView === 'requests' ? '' : 'ghost'} small" style="${adjActiveView === 'requests' ? 'box-shadow:var(--shadow-sm);' : ''}" onclick="switchAdjView('requests')">
            📋 Approval Requests ${pendingAdjRequests().length > 0 ? `<span class="rcv-tab-count" style="margin-left:4px;">${pendingAdjRequests().length}</span>` : `(${(db.adjustmentRequests || []).length})`}
          </button>
        </div>
        ${pendingAdjRequests().length > 0 && currentUser && currentUser.role === 'admin' ? `
          <div class="rcv-pending-notice">
            <span>⏳ <b>${pendingAdjRequests().length}</b> stock adjustment request(s) awaiting Admin approval</span>
          </div>
        ` : ''}
        ${pendingAdjRequests().length > 0 && currentUser && currentUser.role === 'staff' ? `
          <div class="rcv-pending-notice">
            <span>⏳ <b>${pendingAdjRequests().length}</b> adjustment request(s) awaiting Admin approval</span>
          </div>
        ` : ''}
      </div>
      <div id="bulk-adj-container"></div>
    </div>

    <!-- Color Mixing Service -->
    <div id="mv-fields-colormix" class="hidden" style="margin-top:14px;">
      ${openedStockShelfHtml()}
    </div>
  </form>
</div>
  </div>
  <div class="panel rcv-movements-panel">
<div class="panel-head row wrap" style="gap:10px;">
  <div>
    <h3 style="margin:0;">Recent Stock Movements</h3>
    <span class="muted small">Latest 15 orders, damaged/rejected records &amp; authorized adjustments</span>
  </div>
  <div class="spacer"></div>
  <button type="button" class="btn secondary small" onclick="openSupplierReturnsHistoryModal()" title="View &amp; manage Supplier Returns and Damaged Stock history">
    ↩ Supplier Returns &amp; Damaged History <span id="rcv-sr-history-count" class="rcv-tab-count" style="display:none; margin-left:4px;">0</span>
  </button>
  <button class="btn secondary small audit-historical-btn" onclick="goTo('reports'); if (typeof setReportTab==='function') setReportTab('transactions');" title="Open complete Transaction History in Reports">🏛️ All Historical Transactions &rarr;</button>
</div>
<div class="panel-body tight table-scroll">
  ${renderStockMovementsTable(recentStockMoves, { emptyText: 'No stock movements recorded yet.' })}
</div>
  </div>`;
}

function openPOsForReceiving() {
  return (db.purchaseOrders || [])
    .filter(o => o.status === 'ordered' || o.status === 'partial')
    .sort((a, b) => new Date(a.orderDate) - new Date(b.orderDate));
}

function hasPOReplacementPending(po) {
  if (!po) return false;
  if (po.receivingStage === 'awaiting_replacement') return true;
  if (typeof getPOReplacementSummary === 'function') {
    const rs = getPOReplacementSummary(po.id);
    if (rs && rs.activeCount > 0) return true;
  }
  return false;
}

function openedStockShelfHtml() {
  const openedProducts = (db.products || []).filter(p => productOpenedStock(p) > 0);
  // One shelf row per product AND can size (each opened can size is tracked separately)
  const openedList = openedProducts.flatMap(p => productOpenedEntries(p).map(e => ({ p, ...e })));
  const totalLiters = openedList.reduce((sum, r) => sum + r.left, 0);

  return `
  <div style="background:var(--surface); border:1px solid var(--line); border-radius:var(--radius); padding:14px 16px; margin-bottom:14px;">
    <div class="row wrap" style="justify-content:space-between; align-items:center; gap:10px; margin-bottom:${openedList.length ? '12px' : '4px'};">
      <div>
        <div style="font-weight:700; font-size:14px; color:var(--ink); display:flex; align-items:center; gap:8px;">
          <span>🫙 Opened / Used Stock Shelf (For Future Color Mixing)</span>
          <span class="badge" style="background:var(--warning-bg); color:var(--warning-text); border:1px solid var(--warning-border);">
            ${openedList.length} unit${openedList.length === 1 ? '' : 's'} · ${formatLiters(totalLiters)} available
          </span>
        </div>
        <div class="muted small" style="margin-top:2px;">
          Leftover paint from previously opened containers during Color Mixing. The Mixing Studio automatically uses these first before opening a new sealed container.
        </div>
      </div>
    </div>
    ${openedList.length ? `
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Product &amp; Color</th>
              <th>Brand</th>
              <th class="center">Opened Container Size</th>
              <th class="right">Stock Used</th>
              <th class="right">Remaining Leftover</th>
              <th class="right">Sealed Stock</th>
              <th class="right">Action</th>
            </tr>
          </thead>
          <tbody>
            ${openedList.map(r => {
    const p = r.p;
    const hex = getProductHex(p);
    const opened = r.left;
    const canSize = r.size;
    const used = r.used;
    return `
              <tr>
                <td>
                  <div style="display:flex; align-items:center; gap:8px; font-weight:600;">
                    <span style="width:14px; height:14px; border-radius:4px; background:${hex}; border:1px solid var(--line); display:inline-block;"></span>
                    <span>${escapeHtml(p.name)} <code style="font-size:11px; color:var(--teal-text);">(${hex})</code></span>
                  </div>
                </td>
                <td>${escapeHtml(p.brand)}</td>
                <td class="center"><span class="badge" style="background:var(--surface-3); color:var(--ink-soft); font-weight:700;">🥫 ${canSize}L Can</span></td>
                <td class="right" style="color:var(--danger-text); font-weight:700; font-family:'Space Grotesk',sans-serif;">${formatLiters(used)} used</td>
                <td class="right"><span class="badge" style="background:var(--warning-bg); color:var(--warning-text); border:1px solid var(--warning-border); font-weight:700;">🫙 ${formatLiters(opened)} left</span></td>
                <td class="right">${formatLiters(p.stock)}</td>
                <td class="right">
                  <button type="button" class="btn ghost small" style="color:var(--danger); font-size:11.5px;" onclick="disposeOpenedStock('${p.id}', ${canSize})" title="Dispose dried or unusable leftover paint from this ${canSize}L opened container">🗑️ Dispose</button>
                </td>
              </tr>`;
  }).join('')}
          </tbody>
        </table>
      </div>
    ` : `<div class="muted small" style="padding:6px 0;">No opened containers on the mixing shelf right now. When a sealed container is opened for a partial color mix, the remaining liters will appear here automatically.</div>`}
  </div>`;
}

async function disposeOpenedStock(productId, size) {
  const p = productById(productId);
  if (!p) return;
  const canSize = (normalizeCanSize(size) && productHasSize(p, size)) ? normalizeCanSize(size) : productOpenedCanSize(p);
  const opened = productOpenedLiters(p, canSize);
  if (opened <= 0) return;

  const isStaff = currentUser && currentUser.role === 'staff';

  if (isStaff) {
    showPOConfirm({
      icon: '⏳',
      title: 'Submit Disposal for Admin Approval?',
      message: `As <b>Inventory Staff</b>, disposing the remaining <b>${formatLiters(opened)}</b> of the opened <b>${canSize}L</b> can of <b>${escapeHtml(p.name)}</b> requires Administrator approval.<br><br>Submit this disposal request for Admin review?`,
      confirmLabel: '✓ Submit for Approval',
      confirmClass: 'btn',
      onConfirm: async () => {
        const row = {
          id: uid('adj'),
          productId: p.id,
          reason: 'Dispose Opened / Used Stock',
          size: openedValueForSize(canSize),
          qty: opened,
          note: `Leftover disposal from Color Mixing Shelf (${canSize}L can)`
        };
        await submitAdjRequestForApproval([row]);
      }
    });
    return;
  }

  showPOConfirm({
    icon: '🗑️',
    title: 'Dispose Opened / Used Stock?',
    message: `Dispose the remaining <b>${formatLiters(opened)}</b> of the opened <b>${canSize}L</b> can of <b>${escapeHtml(p.name)}</b>? This clears the leftover opened paint (e.g. dried out or expired) for that can size only and logs it in the stock movement history.`,
    confirmLabel: '🗑️ Yes, Dispose Leftover',
    confirmClass: 'btn danger',
    onConfirm: async () => {
      const used = productUsedFromOpenedCan(p, canSize);
      const pools = {};
      productSizes(p).forEach(s => { pools[s] = productOpenedLiters(p, s); });
      pools[canSize] = 0;
      setProductOpenedBySize(p, pools);
      if (typeof syncProductVariants === 'function') syncProductVariants(p);
      db.movements.push({
        id: uid('mv'),
        date: nowISO(),
        type: 'adjustment',
        productId: p.id,
        productName: `${p.name} [Opened / Used Stock]`,
        qtyChange: 0,
        note: `Disposed ${formatLiters(opened)} leftover from ${canSize}L opened can (${formatLiters(used)} was used) · Opened: ${formatStock(opened)}L→0.00L`,
        staffName: (currentUser && currentUser.name) || 'Staff'
      });
      if (typeof logAudit === 'function') {
        logAudit('STOCK_ADJUST', 'Inventory', `Disposed ${formatLiters(opened)} leftover from ${canSize}L opened can of ${p.name}`, {
          productId: p.id,
          entityName: p.name,
          fieldChanged: `Opened / Used Stock (${canSize}L Can)`,
          oldValue: `${formatLiters(opened)} remaining`,
          newValue: '0.00 L (Disposed)',
          reason: 'Dispose Opened / Used Stock'
        });
      }
      await saveDB();
      showToast(`Disposed ${formatLiters(opened)} of opened ${p.name}.`, 'ok');
      renderPage();
    }
  });
}

function selectReceivingPO(poId) {
  const po = (db.purchaseOrders || []).find(o => o.id === poId);
  if (!po || (po.status !== 'ordered' && po.status !== 'partial')) return;
  receivingPOId = poId;
  rcvBatchDraft = {};
  renderReceivingPOPreview();
}

function getPOStatusCategory(po) {
  if (!po) return 'pending';
  const stats = getPOQtyStats(po);
  if (hasPOReplacementPending(po)) return 'partial';
  if (po.status === 'received' || stats.pendingItems <= 0) return 'received';
  if (po.status === 'partial' || stats.receivedItems > 0 || stats.damagedItems > 0) return 'partial';
  return 'pending';
}

function getReceivingPOStatusCounts() {
  const all = (db.purchaseOrders || []).filter(o =>
    o.status === 'ordered' || o.status === 'partial' || o.status === 'received'
  );
  let pending = 0;
  let partial = 0;
  let received = 0;
  all.forEach(o => {
    const cat = getPOStatusCategory(o);
    if (cat === 'received') received++;
    else if (cat === 'partial') partial++;
    else pending++;
  });
  return {
    open: pending + partial,
    all: all.length,
    pending,
    partial,
    received
  };
}

function getReceivingPOTimestamp(po) {
  if (!po) return 0;
  const raw = po.orderDate || po.createdAt || po.receivedAt || '';
  if (!raw) return 0;
  const ts = Date.parse(raw);
  return Number.isFinite(ts) ? ts : 0;
}

function compareReceivingPONumber(a, b) {
  const poA = String((a && a.poNumber) || '').trim();
  const poB = String((b && b.poNumber) || '').trim();
  return poA.localeCompare(poB, undefined, { numeric: true, sensitivity: 'base' });
}

function sortReceivingPOs(list, sortBy = receivingPOSortBy) {
  const mode = RECEIVING_PO_SORT_OPTIONS.includes(sortBy) ? sortBy : 'date-desc';
  return (list || []).slice().sort((a, b) => {
    let diff = 0;
    switch (mode) {
      case 'date-asc':
        diff = getReceivingPOTimestamp(a) - getReceivingPOTimestamp(b);
        if (diff !== 0) return diff;
        return compareReceivingPONumber(a, b);
      case 'po-asc':
        diff = compareReceivingPONumber(a, b);
        if (diff !== 0) return diff;
        return getReceivingPOTimestamp(b) - getReceivingPOTimestamp(a);
      case 'po-desc':
        diff = compareReceivingPONumber(b, a);
        if (diff !== 0) return diff;
        return getReceivingPOTimestamp(b) - getReceivingPOTimestamp(a);
      case 'supplier-asc': {
        const supA = String((a && a.supplierName) || '').trim();
        const supB = String((b && b.supplierName) || '').trim();
        diff = supA.localeCompare(supB, undefined, { sensitivity: 'base' });
        if (diff !== 0) return diff;
        diff = getReceivingPOTimestamp(b) - getReceivingPOTimestamp(a);
        return diff !== 0 ? diff : compareReceivingPONumber(b, a);
      }
      case 'supplier-desc': {
        const supA = String((a && a.supplierName) || '').trim();
        const supB = String((b && b.supplierName) || '').trim();
        diff = supB.localeCompare(supA, undefined, { sensitivity: 'base' });
        if (diff !== 0) return diff;
        diff = getReceivingPOTimestamp(b) - getReceivingPOTimestamp(a);
        return diff !== 0 ? diff : compareReceivingPONumber(b, a);
      }
      case 'amount-desc': {
        const amtA = Number(a && a.totalAmount) || 0;
        const amtB = Number(b && b.totalAmount) || 0;
        diff = amtB - amtA;
        if (diff !== 0) return diff;
        diff = getReceivingPOTimestamp(b) - getReceivingPOTimestamp(a);
        return diff !== 0 ? diff : compareReceivingPONumber(b, a);
      }
      case 'amount-asc': {
        const amtA = Number(a && a.totalAmount) || 0;
        const amtB = Number(b && b.totalAmount) || 0;
        diff = amtA - amtB;
        if (diff !== 0) return diff;
        diff = getReceivingPOTimestamp(b) - getReceivingPOTimestamp(a);
        return diff !== 0 ? diff : compareReceivingPONumber(b, a);
      }
      case 'date-desc':
      default:
        diff = getReceivingPOTimestamp(b) - getReceivingPOTimestamp(a);
        if (diff !== 0) return diff;
        return compareReceivingPONumber(b, a);
    }
  });
}

function getReceivingPOPickerList() {
  const all = (db.purchaseOrders || []).filter(o =>
    o.status === 'ordered' || o.status === 'partial' || o.status === 'received'
  );
  let filtered = all;
  if (receivingPOStatusFilter === 'open') {
    filtered = filtered.filter(o => {
      const cat = getPOStatusCategory(o);
      return cat === 'pending' || cat === 'partial';
    });
  } else if (receivingPOStatusFilter !== 'all') {
    filtered = filtered.filter(o => getPOStatusCategory(o) === receivingPOStatusFilter);
  }
  const q = (receivingPOSearchQuery || '').trim().toLowerCase();
  if (q) {
    filtered = filtered.filter(o =>
      (o.poNumber || '').toLowerCase().includes(q) ||
      (o.supplierName || '').toLowerCase().includes(q)
    );
  }
  return sortReceivingPOs(filtered, receivingPOSortBy);
}

function getPOQtyStats(po) {
  const items = getPOItems(po);
  let totalQty = 0;
  let receivedQty = 0;
  let damagedQty = 0;
  let itemRepPending = 0;
  items.forEach(it => {
    const ord = Number(it.qty || 0);
    const rec = Number(it.receivedQty !== undefined ? it.receivedQty : (po.status === 'received' ? ord : 0));
    const dmg = Number(it.damagedQty || 0);
    const rPend = Math.max(0, Number(it.replacementRequestedQty || 0) - Number(it.replacementReceivedQty || 0));
    totalQty += ord;
    receivedQty += Math.min(ord, rec);
    damagedQty += dmg;
    itemRepPending += Math.min(Math.max(0, ord - rec), rPend);
  });
  const repSum = typeof getPOReplacementSummary === 'function' ? getPOReplacementSummary(po.id) : { activeCount: 0, pendingQty: 0 };
  const pendingQty = Math.max(0, Number((totalQty - receivedQty).toFixed(2)));
  const replacementPendingItems = Math.min(pendingQty, Math.max(itemRepPending, Number(repSum.pendingQty || 0)));
  const undeliveredItems = Math.max(0, Number((pendingQty - replacementPendingItems).toFixed(2)));
  return {
    totalItems: totalQty,
    receivedItems: Number(receivedQty.toFixed(2)),
    acceptedItems: Number(receivedQty.toFixed(2)),
    damagedItems: Number(damagedQty.toFixed(2)),
    replacementPendingItems: Number(replacementPendingItems.toFixed(2)),
    undeliveredItems: undeliveredItems,
    pendingItems: pendingQty,
    lineCount: items.length
  };
}

function renderReceivingPOCardsHtml(poList, selectedId) {
  if (!poList.length) {
    return `<div class="rcv-po-empty">No purchase orders match your current filter or search.</div>`;
  }
  const visible = poList.slice(0, receivingPOVisibleLimit);
  return visible.map(o => {
    const stats = getPOQtyStats(o);
    const cat = getPOStatusCategory(o);
    const isFullyReceived = cat === 'received';
    const isReplPending = !isFullyReceived && hasPOReplacementPending(o);
    const isPartial = cat === 'partial';
    const isSelected = !isFullyReceived && o.id === selectedId;
    const statusBadge = isFullyReceived
      ? `<span class="rcv-po-badge received">✓ Fully Received</span>`
      : (isReplPending
        ? `<span class="rcv-po-badge partial">🔄 Partially Received – Replacement Pending</span>`
        : (isPartial
          ? `<span class="rcv-po-badge partial">◐ Partially Received</span>`
          : `<span class="rcv-po-badge pending">⏳ Pending</span>`));
    const dateStr = o.orderDate ? formatDateShort(o.orderDate) : '—';

    return `
      <button type="button"
        class="rcv-po-card ${isSelected ? 'selected' : ''} ${isFullyReceived ? 'disabled' : ''}"
        ${isFullyReceived ? 'disabled aria-disabled="true" title="Fully received — no pending quantities remaining"' : `onclick="selectReceivingPO('${o.id}')"`}>
        <div class="rcv-po-card-top">
          <span class="rcv-po-number">${escapeHtml(o.poNumber)}</span>
          <div class="rcv-po-badges">
            ${isSelected ? `<span class="rcv-po-selected-pill">✓ Selected</span>` : ''}
            ${statusBadge}
          </div>
        </div>
        <div class="rcv-po-supplier">${escapeHtml(o.supplierName || '—')}</div>
        <div class="rcv-po-meta-row">
          <span class="rcv-po-amount">${peso(o.totalAmount)}</span>
          <span class="rcv-po-date">📅 ${escapeHtml(dateStr)}</span>
        </div>
        <div class="rcv-po-counts" style="flex-wrap:wrap; row-gap:4px;">
          <span>Ordered: <b>${formatStock(stats.totalItems)}</b></span>
          <span>Accepted: <b>${formatStock(stats.acceptedItems)}</b></span>
          ${stats.damagedItems > 0 ? `<span class="rcv-po-pending-txt">Damaged: <b>${formatStock(stats.damagedItems)}</b></span>` : ''}
          ${stats.replacementPendingItems > 0 ? `<span style="color:var(--teal-text);">Repl. Pending: <b>${formatStock(stats.replacementPendingItems)}</b></span>` : ''}
          <span class="${stats.undeliveredItems > 0 ? 'rcv-po-pending-txt' : ''}">Undelivered: <b>${formatStock(stats.undeliveredItems)}</b></span>
        </div>
      </button>
    `;
  }).join('');
}

function renderReceivingPOMoreHtml(totalCount) {
  const remaining = totalCount - receivingPOVisibleLimit;
  if (remaining <= 0) return '';
  return `
    <div class="rcv-po-load-more">
      <button type="button" class="btn secondary small" onclick="loadMoreReceivingPOs()">
        Load More Orders (${remaining} remaining)
      </button>
    </div>
  `;
}

function loadMoreReceivingPOs() {
  receivingPOVisibleLimit += 6;
  updateReceivingPOGridOnly();
}

function setReceivingPOStatusFilter(filter) {
  receivingPOStatusFilter = filter || 'open';
  receivingPOVisibleLimit = 6;
  renderReceivingPOPreview();
}

function updateReceivingPOGridOnly() {
  const grid = document.getElementById('rcv-po-picker-grid');
  const countEl = document.getElementById('rcv-po-match-count');
  const moreEl = document.getElementById('rcv-po-more-wrap');
  if (!grid) return;
  const list = getReceivingPOPickerList();
  grid.innerHTML = renderReceivingPOCardsHtml(list, receivingPOId);
  if (countEl) {
    const shown = Math.min(list.length, receivingPOVisibleLimit);
    countEl.innerHTML = `Showing <b>${shown}</b> of <b>${list.length}</b> order${list.length === 1 ? '' : 's'}`;
  }
  if (moreEl) {
    moreEl.innerHTML = renderReceivingPOMoreHtml(list.length);
  }
}

let _rcvPOSearchTimer = null;
function onReceivingPOSearchInput(val) {
  receivingPOSearchQuery = val || '';
  receivingPOVisibleLimit = 6;
  if (_rcvPOSearchTimer) clearTimeout(_rcvPOSearchTimer);
  _rcvPOSearchTimer = setTimeout(() => {
    _rcvPOSearchTimer = null;
    updateReceivingPOGridOnly();
  }, 150);
}

function onReceivingPOSortChange(val) {
  receivingPOSortBy = RECEIVING_PO_SORT_OPTIONS.includes(val) ? val : 'date-desc';
  receivingPOVisibleLimit = 6;
  updateReceivingPOGridOnly();
}

/* Batch / expiration details typed on the receiving form (per PO line index) — feeds Expiration Tracking */
let rcvBatchDraft = {};
function rcvBatchDraftSet(idx, field, value) {
  if (!rcvBatchDraft[idx]) rcvBatchDraft[idx] = { expirationDate: '', notes: '' };
  rcvBatchDraft[idx][field] = value;
}

function renderReceivingPOPreview() {
  const container = document.getElementById('rcv-po-container');
  const submitBtn = document.getElementById('btn-submit-rcv');
  if (!container) return;

  const openPOs = sortReceivingPOs(openPOsForReceiving(), receivingPOSortBy);
  const statusCounts = getReceivingPOStatusCounts();
  const pickerList = getReceivingPOPickerList();
  const shownCount = Math.min(pickerList.length, receivingPOVisibleLimit);
  const po = receivingPOId ? openPOs.find(o => o.id === receivingPOId) : openPOs[0];
  if (po && po.id !== receivingPOId) receivingPOId = po.id;
  if (!po) receivingPOId = '';

  const pickerHtml = `
    <div class="rcv-po-picker">
      <div class="rcv-po-picker-head">
        <div class="rcv-po-search-wrap">
          <span class="rcv-po-search-icon">🔍</span>
          <input type="text" id="rcv-po-search" class="rcv-po-search" placeholder="Search by PO Number or Supplier Name..." value="${escapeAttr(receivingPOSearchQuery)}" oninput="onReceivingPOSearchInput(this.value)">
        </div>
        <div class="rcv-po-sort-wrap">
          <label for="rcv-po-sort" class="rcv-po-sort-label">Sort:</label>
          <select id="rcv-po-sort" class="rcv-po-sort-select" aria-label="Sort Purchase Orders" title="Sort Purchase Orders" onchange="onReceivingPOSortChange(this.value)">
            <option value="date-desc" ${receivingPOSortBy === 'date-desc' ? 'selected' : ''}>Newest Date First</option>
            <option value="date-asc" ${receivingPOSortBy === 'date-asc' ? 'selected' : ''}>Oldest Date First</option>
            <option value="po-asc" ${receivingPOSortBy === 'po-asc' ? 'selected' : ''}>PO Number (Ascending)</option>
            <option value="po-desc" ${receivingPOSortBy === 'po-desc' ? 'selected' : ''}>PO Number (Descending)</option>
            <option value="supplier-asc" ${receivingPOSortBy === 'supplier-asc' ? 'selected' : ''}>Supplier Name (A–Z)</option>
            <option value="supplier-desc" ${receivingPOSortBy === 'supplier-desc' ? 'selected' : ''}>Supplier Name (Z–A)</option>
            <option value="amount-desc" ${receivingPOSortBy === 'amount-desc' ? 'selected' : ''}>Highest Amount First</option>
            <option value="amount-asc" ${receivingPOSortBy === 'amount-asc' ? 'selected' : ''}>Lowest Amount First</option>
          </select>
        </div>
        <div class="rcv-po-picker-stats">
          <span class="simple-stat-pill" id="rcv-po-match-count">Showing <b>${shownCount}</b> of <b>${pickerList.length}</b> order${pickerList.length === 1 ? '' : 's'}</span>
          <span class="simple-stat-pill adj-stat-selected">Awaiting Delivery: <b>${openPOs.length}</b></span>
        </div>
      </div>
      <div class="rcv-po-filter-tabs" role="tablist" aria-label="Filter Purchase Orders by status">
        <button type="button" class="rcv-po-filter-tab ${receivingPOStatusFilter === 'open' ? 'active' : ''}" onclick="setReceivingPOStatusFilter('open')">
          Awaiting Delivery <span class="rcv-po-tab-cnt">${statusCounts.open}</span>
        </button>
        <button type="button" class="rcv-po-filter-tab ${receivingPOStatusFilter === 'all' ? 'active' : ''}" onclick="setReceivingPOStatusFilter('all')">
          All Orders <span class="rcv-po-tab-cnt">${statusCounts.all}</span>
        </button>
        <button type="button" class="rcv-po-filter-tab ${receivingPOStatusFilter === 'pending' ? 'active' : ''}" onclick="setReceivingPOStatusFilter('pending')">
          Pending <span class="rcv-po-tab-cnt">${statusCounts.pending}</span>
        </button>
        <button type="button" class="rcv-po-filter-tab ${receivingPOStatusFilter === 'partial' ? 'active' : ''}" onclick="setReceivingPOStatusFilter('partial')">
          Partially Received <span class="rcv-po-tab-cnt">${statusCounts.partial}</span>
        </button>
        <button type="button" class="rcv-po-filter-tab ${receivingPOStatusFilter === 'received' ? 'active' : ''}" onclick="setReceivingPOStatusFilter('received')">
          Fully Received <span class="rcv-po-tab-cnt">${statusCounts.received}</span>
        </button>
      </div>
      <div id="rcv-po-picker-grid" class="rcv-po-grid">
        ${renderReceivingPOCardsHtml(pickerList, receivingPOId)}
      </div>
      <div id="rcv-po-more-wrap">
        ${renderReceivingPOMoreHtml(pickerList.length)}
      </div>
    </div>
  `;

  if (!openPOs.length || !po) {
    if (submitBtn) submitBtn.disabled = true;
    container.innerHTML = `
      ${pickerHtml}
      <input type="hidden" id="mv-po" value="">
      <div class="muted small" style="padding:20px 0; text-align:center;">✓ No approved purchase orders currently awaiting delivery.</div>
    `;
    return;
  }

  if (submitBtn) submitBtn.disabled = false;

  const items = getPOItems(po);
  let totalRemainingCans = 0;

  const rowsHtml = items.map((item, i) => {
    const product = productById(item.productId);
    const currentStock = product ? Number(product.stock) || 0 : 0;
    const ordered = Number(item.qty || 0);
    const alreadyReceived = Number(item.receivedQty !== undefined ? item.receivedQty : (po.status === 'received' ? ordered : 0));
    const activeRepPending = Math.max(0, Number(item.replacementRequestedQty || 0) - Number(item.replacementReceivedQty || 0));
    const remaining = Math.max(0, Number((ordered - alreadyReceived - activeRepPending).toFixed(2)));
    const size = Number(item.size) || 1;
    const curCans = product ? productCanCount(product, size) : 0;
    const newCans = curCans + remaining;
    const addedLiters = Number((remaining * size).toFixed(2));
    totalRemainingCans += remaining;

    const hex = product ? getProductHex(product) : '#CCCCCC';
    const isDone = remaining === 0;
    const pctReceived = ordered > 0 ? Math.min(100, Math.round((alreadyReceived / ordered) * 100)) : 0;

    return `
    <div class="rcv-item-row ${isDone ? 'done' : ''}">
      <div class="rcv-item-main">
        <!-- Left: Dot + Title + Brand / Size / Current Stock -->
        <div class="rcv-item-identity">
          <span class="rcv-item-dot" style="background:${hex};" title="${hex}"></span>
          <div class="rcv-item-info">
            <div class="rcv-item-name">${escapeHtml(item.productName)}</div>
            <div class="rcv-item-sub">
              ${item.brand ? `<span class="rcv-item-brand">${escapeHtml(item.brand)}</span><span class="rcv-dot-sep">·</span>` : ''}
              <span class="rcv-size-badge">🥫 ${size}L</span>
              ${product ? `<span class="rcv-dot-sep">·</span><span class="rcv-stock-now">Current: <b>${curCans}</b> unit${curCans === 1 ? '' : 's'}</span>` : ''}
            </div>
          </div>
        </div>

        <!-- Middle: Received vs Pending Progress -->
        <div class="rcv-item-progress">
          <div class="rcv-progress-stats">
            <span class="rcv-stat-received">Received <b>${formatStock(alreadyReceived)}</b>/${formatStock(ordered)}</span>
            ${remaining > 0
        ? `<span class="rcv-stat-pending">${formatStock(remaining)} pending</span>`
        : `<span class="rcv-stat-done">✓ Complete</span>`}
          </div>
          <div class="rcv-progress-track" title="${pctReceived}% received">
            <div class="rcv-progress-fill ${isDone ? 'complete' : ''}" style="width:${pctReceived}%;"></div>
          </div>
        </div>

        <!-- Right: Ordered / Actual Delivered / Accepted / Damaged Inspection + Stock Preview -->
        <div class="rcv-item-actions">
          <div class="rcv-inspect-nums">
            <div class="rcv-inspect-col">
              <span class="rcv-inspect-lbl">Ordered</span>
              <div class="rcv-ordered-pill" title="Ordered: ${formatStock(ordered)} · Remaining: ${formatStock(remaining)}">${formatStock(ordered)}</div>
            </div>
            <div class="rcv-inspect-col">
              <span class="rcv-inspect-lbl">Actual Delivered</span>
              <div class="rcv-stepper-wrap">
                <div class="rcv-stepper-compact">
                  <button type="button" class="rcv-stepper-btn" onclick="stepReceivingQty(${i}, -1)" ${isDone ? 'disabled' : ''} aria-label="Decrease delivered quantity">−</button>
                  <input type="number" id="rcv-qty-input-${i}" class="rcv-stepper-input" min="0" max="${remaining}" step="1" value="${remaining}"
                    ${isDone ? 'disabled' : ''}
                    oninput="onReceivingQtyChange(${i}, ${currentStock}, ${size}, ${curCans})">
                  <button type="button" class="rcv-stepper-btn" onclick="stepReceivingQty(${i}, 1)" ${isDone ? 'disabled' : ''} aria-label="Increase delivered quantity">+</button>
                </div>
                ${remaining > 0 ? `<button type="button" class="rcv-all-btn" onclick="setReceivingQtyMax(${i})" title="Set to all ${formatStock(remaining)} remaining">All</button>` : ''}
              </div>
            </div>
            ${isDone ? '' : `
            <div class="rcv-inspect-col">
              <span class="rcv-inspect-lbl good">Accepted</span>
              <input type="number" id="rcv-accepted-input-${i}" class="rcv-inspect-input good" min="0" max="${remaining}" step="1" value="${remaining}"
                oninput="onReceivingAcceptedChange(${i}, ${currentStock}, ${size}, ${curCans})">
            </div>
            <div class="rcv-inspect-col">
              <span class="rcv-inspect-lbl damaged">Damaged / Rej.</span>
              <input type="number" id="rcv-damaged-input-${i}" class="rcv-inspect-input damaged" min="0" max="${remaining}" step="1" value="0"
                oninput="onReceivingDamagedChange(${i}, ${currentStock}, ${size}, ${curCans})">
            </div>`}
          </div>
          <div id="rcv-stock-preview-${i}" class="rcv-item-pill ${remaining > 0 ? 'add' : 'done'}">
            ${product && remaining > 0
        ? `➔ ${newCans} units (+${formatLiters(addedLiters)})`
        : (isDone ? '✓ Fully Received' : '0 units (No change)')}
          </div>
        </div>
      </div>
      ${isDone ? '' : `
      <div id="rcv-damage-box-${i}" class="rcv-damage-box hidden">
        <div class="rcv-damage-head">
          <span>⚠️ Damaged / Rejected Stock Inspection <b id="rcv-damage-badge-${i}"></b></span>
          <span class="hint">Rejected units are NOT counted as accepted stock and NEVER enter sellable inventory</span>
        </div>
        <div class="rcv-dmg-grid">
          <label>
            <span>Damage / Rejection Reason *</span>
            <select id="rcv-dmg-reason-${i}" class="rcv-dmg-select">
              <option value="">— Select Reason (Required) —</option>
              ${(typeof SR_DAMAGE_REASONS !== 'undefined' ? SR_DAMAGE_REASONS : ['Leaking Paint', 'Broken / Damaged Container', 'Missing Product', 'Incorrect Product Delivered', 'Expired Product', 'Contaminated Paint', 'Other'])
          .map(r => `<option value="${escapeAttr(r)}">${escapeHtml(r)}</option>`).join('')}
            </select>
          </label>
          <label>
            <span>Handling / Disposition *</span>
            <select id="rcv-dmg-handling-${i}" class="rcv-dmg-select">
              <option value="returned_to_driver" selected>Return to Delivery Personnel (Auto-Create Replacement Request)</option>
              <option value="quarantine">Quarantine at Store (Auto-Create Replacement Request)</option>
            </select>
          </label>
          <label class="rcv-dmg-notes-col">
            <span>Inspection Notes / Evidence</span>
            <input type="text" id="rcv-dmg-note-${i}" maxlength="255" placeholder="Describe damage condition, leak, dent, or rejection details">
          </label>
        </div>
      </div>
      <div class="rcv-batch-fields" title="Expiration and restocking details (Batch/Lot No. is auto-generated)">
        <div class="rcv-batch-header">
          <div class="rcv-batch-title">
            <span>Expiration &amp; Restocking Details</span>
            <span class="rcv-optional-tag" style="background:var(--warning-bg); color:var(--warning-text); border-color:var(--warning-border);">Required</span>
          </div>
          <span class="hint">🏷️ Batch/Lot No. is auto-generated · Enter the exact expiration date printed on the container</span>
        </div>
        <div class="rcv-batch-grid">
          <label>
            <span>Expiration Date *</span>
            <input type="date" id="rcv-exp-input-${i}" min="${todayISO()}" value="${escapeAttr(rcvBatchDraft[i] ? rcvBatchDraft[i].expirationDate : '')}" onchange="rcvBatchDraftSet(${i}, 'expirationDate', this.value)" required>
          </label>
          <label class="rcv-batch-notes-label">
            <span>Restocking Notes</span>
            <input type="text" id="rcv-note-input-${i}" maxlength="255" placeholder="Delivery / condition note" value="${escapeAttr(rcvBatchDraft[i] ? (rcvBatchDraft[i].notes || '') : '')}" oninput="rcvBatchDraftSet(${i}, 'notes', this.value)">
          </label>
        </div>
      </div>`}
    </div>`;
  }).join('');

  if (submitBtn) submitBtn.disabled = (totalRemainingCans <= 0);

  const poStats = getPOQtyStats(po);
  const initialProcessedAwaitingRepl = (totalRemainingCans <= 0 && hasPOReplacementPending(po));

  container.innerHTML = `
    ${pickerHtml}
    <input type="hidden" id="mv-po" value="${escapeAttr(po.id)}">

    <!-- Selected PO Summary & Quick Actions Toolbar -->
    <div class="rcv-minimal-toolbar">
      <div class="rcv-toolbar-left">
        <span class="rcv-toolbar-label">Receiving Order:</span>
        <span class="rcv-selected-po-title">${escapeHtml(po.poNumber)} — ${escapeHtml(po.supplierName)} (${peso(po.totalAmount)})</span>
        ${initialProcessedAwaitingRepl
          ? `<span class="rcv-po-badge partial">🔄 Partially Received – Replacement Pending (${formatStock(poStats.replacementPendingItems)} unit${poStats.replacementPendingItems === 1 ? '' : 's'})</span>`
          : `<span class="rcv-pending-badge">${totalRemainingCans} unit${totalRemainingCans === 1 ? '' : 's'} undelivered</span>`}
      </div>
      ${initialProcessedAwaitingRepl ? '' : `
      <div class="rcv-toolbar-actions">
        <button type="button" class="btn ghost small" onclick="fillReceivingPageQtys(true)">⚡ Receive All</button>
        <button type="button" class="btn ghost small" onclick="fillReceivingPageQtys(false)">Reset</button>
      </div>`}
    </div>

    ${initialProcessedAwaitingRepl ? `
      <div class="sr-modal-notice warn" style="margin-bottom:10px;">
        🔄 <b>Partially Received – Replacement Pending:</b> Initial delivery for <b>${escapeHtml(po.poNumber)}</b> has been processed (Ordered: <b>${formatStock(poStats.totalItems)}</b> · Accepted: <b>${formatStock(poStats.acceptedItems)}</b> · Damaged: <b>${formatStock(poStats.damagedItems)}</b> · Replacement Pending: <b>${formatStock(poStats.replacementPendingItems)}</b> · Undelivered: <b>0</b>). This PO remains open until all replacement stock is physically inspected and received in <b>Active Replacement Tracking</b> below.
      </div>
    ` : `
      <!-- Physical Inspection Guidance Banner -->
      <div class="rcv-inspect-banner">
        <span>🔎 <b>Physical Inspection First:</b> Count and inspect delivered containers before confirming. <b>Actual Delivered = Accepted + Damaged/Rejected</b>. Only accepted units are added to sellable inventory &amp; FIFO batches.</span>
      </div>
    `}

    <!-- Product Receiving Cards -->
    <div class="rcv-minimal-list">
      ${rowsHtml}
    </div>
    ${typeof renderPOReplacementSummaryBannerHtml === 'function' ? renderPOReplacementSummaryBannerHtml(po) : ''}
  `;
}

function stepReceivingQty(idx, delta) {
  const input = document.getElementById(`rcv-qty-input-${idx}`);
  if (!input || input.disabled) return;
  const max = parseFloat(input.max) || 0;
  let val = (parseFloat(input.value) || 0) + delta;
  val = Math.max(0, Math.min(max, val));
  input.value = val;
  input.dispatchEvent(new Event('input'));
}

function setReceivingQtyMax(idx) {
  const input = document.getElementById(`rcv-qty-input-${idx}`);
  if (!input || input.disabled) return;
  input.value = input.max;
  input.dispatchEvent(new Event('input'));
}

function updateReceivingInspectionPreview(idx, size = 1, curCans = 0) {
  const delEl = document.getElementById(`rcv-qty-input-${idx}`);
  const accEl = document.getElementById(`rcv-accepted-input-${idx}`);
  const dmgEl = document.getElementById(`rcv-damaged-input-${idx}`);
  const preview = document.getElementById(`rcv-stock-preview-${idx}`);
  const dmgBox = document.getElementById(`rcv-damage-box-${idx}`);
  const dmgBadge = document.getElementById(`rcv-damage-badge-${idx}`);
  if (!delEl || !preview) return;

  const delivered = Math.max(0, Math.floor(parseFloat(delEl.value) || 0));
  const accepted = accEl ? Math.max(0, Math.floor(parseFloat(accEl.value) || 0)) : delivered;
  const damaged = dmgEl ? Math.max(0, Math.floor(parseFloat(dmgEl.value) || 0)) : 0;

  if (dmgBox) {
    dmgBox.classList.toggle('hidden', damaged <= 0);
  }
  if (dmgBadge) {
    dmgBadge.textContent = damaged > 0 ? `(${damaged} × ${size}L quarantined)` : '';
  }

  const addedLiters = Number((accepted * size).toFixed(2));
  const newCans = curCans + accepted;
  if (accepted > 0 && damaged > 0) {
    preview.className = 'rcv-item-pill warn';
    preview.innerHTML = `➔ ${newCans} good (+${formatLiters(addedLiters)}) · ⚠ ${damaged} damaged`;
  } else if (accepted > 0) {
    preview.className = 'rcv-item-pill add';
    preview.innerHTML = `➔ ${newCans} units (+${formatLiters(addedLiters)})`;
  } else if (damaged > 0) {
    preview.className = 'rcv-item-pill warn';
    preview.innerHTML = `⚠ ${damaged} damaged (0 added to stock)`;
  } else {
    preview.className = 'rcv-item-pill done';
    preview.innerHTML = `No change (0 units)`;
  }
}

function onReceivingQtyChange(idx, currentStock, size = 1, curCans = 0) {
  const input = document.getElementById(`rcv-qty-input-${idx}`);
  const accEl = document.getElementById(`rcv-accepted-input-${idx}`);
  const dmgEl = document.getElementById(`rcv-damaged-input-${idx}`);
  if (!input) return;
  const max = parseFloat(input.max) || 0;
  let val = Math.max(0, Math.floor(parseFloat(input.value) || 0));
  if (val > max) {
    val = Math.floor(max);
    input.value = val;
    showToast(`Cannot receive more than remaining (${val} × ${size}L).`, 'error');
  }
  if (accEl && dmgEl) {
    let dmg = Math.min(val, Math.max(0, Math.floor(parseFloat(dmgEl.value) || 0)));
    dmgEl.max = val;
    dmgEl.value = dmg;
    accEl.max = val;
    accEl.value = val - dmg;
  }
  updateReceivingInspectionPreview(idx, size, curCans);
}

function onReceivingAcceptedChange(idx, currentStock, size = 1, curCans = 0) {
  const delEl = document.getElementById(`rcv-qty-input-${idx}`);
  const accEl = document.getElementById(`rcv-accepted-input-${idx}`);
  const dmgEl = document.getElementById(`rcv-damaged-input-${idx}`);
  if (!delEl || !accEl || !dmgEl) return;
  const delivered = Math.max(0, Math.floor(parseFloat(delEl.value) || 0));
  let acc = Math.max(0, Math.floor(parseFloat(accEl.value) || 0));
  if (acc > delivered) {
    acc = delivered;
    accEl.value = acc;
  }
  dmgEl.value = delivered - acc;
  updateReceivingInspectionPreview(idx, size, curCans);
}

function onReceivingDamagedChange(idx, currentStock, size = 1, curCans = 0) {
  const delEl = document.getElementById(`rcv-qty-input-${idx}`);
  const accEl = document.getElementById(`rcv-accepted-input-${idx}`);
  const dmgEl = document.getElementById(`rcv-damaged-input-${idx}`);
  if (!delEl || !accEl || !dmgEl) return;
  const delivered = Math.max(0, Math.floor(parseFloat(delEl.value) || 0));
  let dmg = Math.max(0, Math.floor(parseFloat(dmgEl.value) || 0));
  if (dmg > delivered) {
    dmg = delivered;
    dmgEl.value = dmg;
    showToast(`Damaged quantity cannot exceed Delivered Quantity (${delivered}).`, 'error');
  }
  accEl.value = delivered - dmg;
  updateReceivingInspectionPreview(idx, size, curCans);
}

function fillReceivingPageQtys(isMax) {
  const po = receivingPOId ? openPOsForReceiving().find(o => o.id === receivingPOId) : null;
  if (!po) return;
  const items = getPOItems(po);
  items.forEach((item, i) => {
    const input = document.getElementById(`rcv-qty-input-${i}`);
    const dmgEl = document.getElementById(`rcv-damaged-input-${i}`);
    if (input && !input.disabled) {
      if (dmgEl) dmgEl.value = 0;
      input.value = isMax ? input.max : 0;
      const product = productById(item.productId);
      const size = Number(item.size) || 1;
      const curCans = product ? productCanCount(product, size) : 0;
      onReceivingQtyChange(i, product ? product.stock : 0, size, curCans);
    }
  });
}

function onBulkAdjSupplierFilterChange() {
  const filterSelect = document.getElementById('bulk-adj-supplier-filter');
  if (filterSelect) {
    bulkAdjSupplierFilter = filterSelect.value;
  }
  updateAdjPickerGridOnly();
}

function computeBulkAdjRowState(row) {
  const product = row.productId ? productById(row.productId) : null;
  const currentStock = product ? Number(product.stock) || 0 : 0;
  const isAdd = row.reason === 'Count Correction (add)';
  const isOpened = row.reason === 'Dispose Opened / Used Stock' || (!isAdd && isOpenedSizeValue(row.size));
  const openedSize = isOpened ? openedSizeFromValue(product, row.size) : 0;
  const sizeNum = isOpened ? 0 : adjSealedSize(product, row.size);
  const rawQty = parseFloat(row.qty);
  const qtyNum = isOpened ? rawQty : Math.floor(rawQty);
  const validQty = !isNaN(qtyNum) && qtyNum > 0;
  const maxQty = maxAllowedAdjQty(product, row.reason, isOpened ? openedValueForSize(openedSize) : sizeNum);

  if (!product) {
    return {
      product: null,
      isAdd: false,
      isOpened: false,
      sizeNum: 1,
      openedSize: 0,
      qtyNum: 1,
      validQty: false,
      maxQty: MAX_ADJ_DEDUCT_CANS,
      curCans: 0,
      newCans: 0,
      curOpened: 0,
      newOpened: 0,
      litersAbs: 0,
      litersDelta: 0,
      newStock: 0,
      isInvalid: false,
      invalidMsg: '',
      previewClass: '',
      headline: 'Select a product to view stock changes',
      subline: 'Real-time unit count and liter changes will be previewed here before saving.'
    };
  }

  if (isOpened) {
    const curOpened = productOpenedLiters(product, openedSize);
    const litersDelta = validQty ? -Number(qtyNum.toFixed(2)) : 0;
    const newOpened = Math.max(0, Number((curOpened + litersDelta).toFixed(2)));
    const isInvalid = Boolean(curOpened <= 0 || !validQty || qtyNum > curOpened);
    let invalidMsg = '';
    if (curOpened <= 0) {
      invalidMsg = `No leftover opened paint in the ${openedSize}L pool to dispose`;
    } else if (!validQty) {
      invalidMsg = 'Enter a valid quantity in liters (greater than 0)';
    } else if (qtyNum > curOpened) {
      invalidMsg = `Exceeds available opened stock (${formatLiters(curOpened)})`;
    }

    return {
      product,
      isAdd: false,
      isOpened: true,
      sizeNum: 0,
      openedSize,
      qtyNum: isNaN(qtyNum) ? 0 : qtyNum,
      validQty,
      maxQty,
      curCans: 0,
      newCans: 0,
      curOpened,
      newOpened,
      litersAbs: validQty ? qtyNum : 0,
      litersDelta,
      newStock: currentStock,
      isInvalid,
      invalidMsg,
      previewClass: isInvalid ? 'error' : 'opened',
      headline: isInvalid ? '⚠️ Cannot dispose leftover stock' : `🫙 Disposing ${formatLiters(qtyNum)} of opened paint`,
      subline: isInvalid ? invalidMsg : `Deducts from the ${openedSize}L leftover pool (${formatLiters(curOpened)} ➔ ${formatLiters(newOpened)}). Sealed units remain untouched.`
    };
  }

  // Sealed Cans
  const curCans = productCanCount(product, sizeNum);
  const hasBreakdown = productHasCanBreakdown(product);
  const cansDelta = validQty ? (isAdd ? qtyNum : -qtyNum) : 0;
  const litersAbs = validQty ? Number((qtyNum * sizeNum).toFixed(2)) : 0;
  const litersDelta = isAdd ? litersAbs : -litersAbs;
  const newCans = Math.max(0, curCans + cansDelta);
  const newStock = isAdd ? Number((currentStock + litersAbs).toFixed(2)) : Math.max(0, Number((currentStock - litersAbs).toFixed(2)));

  const exceedsCans = Boolean(!isAdd && validQty && hasBreakdown && qtyNum > curCans);
  const exceedsStock = Boolean(!isAdd && validQty && litersAbs > currentStock);
  const exceedsDeductCap = Boolean(!isAdd && (maxQty <= 0 || (validQty && qtyNum > maxQty)));
  const exceedsAddCap = Boolean(isAdd && validQty && qtyNum > MAX_ADJ_ADD_CANS);
  const isInvalid = !validQty || exceedsCans || exceedsStock || exceedsDeductCap || exceedsAddCap;

  let invalidMsg = '';
  if (!validQty) {
    invalidMsg = 'Please enter a valid number of units (1 or more)';
  } else if (exceedsAddCap) {
    invalidMsg = `Maximum +${MAX_ADJ_ADD_CANS} units allowed per manual adjustment (use Purchase Orders for supplier deliveries)`;
  } else if (!isAdd) {
    if (curCans <= 0 || currentStock <= 0) {
      invalidMsg = `No ${sizeNum}L units in stock to deduct`;
    } else if (exceedsCans) {
      invalidMsg = `Only ${curCans} unit(s) of ${sizeNum}L available in stock`;
    } else if (exceedsStock) {
      invalidMsg = `Exceeds total available inventory (${formatLiters(currentStock)})`;
    } else if (exceedsDeductCap) {
      invalidMsg = `Up to ${maxQty} unit(s) can be deducted per adjustment entry (max ${MAX_ADJ_DEDUCT_CANS} units at once)`;
    }
  }

  return {
    product,
    isAdd,
    isOpened: false,
    sizeNum,
    openedSize: 0,
    qtyNum: isNaN(qtyNum) ? 0 : qtyNum,
    validQty,
    maxQty,
    curCans,
    newCans,
    curOpened: 0,
    newOpened: 0,
    litersAbs,
    litersDelta,
    newStock,
    exceedsCans,
    exceedsStock,
    exceedsDeductCap,
    exceedsAddCap,
    isInvalid,
    invalidMsg,
    previewClass: isInvalid ? 'error' : (isAdd ? 'add' : 'deduct'),
    headline: isInvalid
      ? '⚠️ Adjustment cannot be applied'
      : (isAdd
        ? `➕ Adding ${qtyNum} × ${sizeNum}L unit${qtyNum === 1 ? '' : 's'} (+${formatLiters(litersAbs)})`
        : `🔻 Deducting ${qtyNum} × ${sizeNum}L unit${qtyNum === 1 ? '' : 's'} (-${formatLiters(litersAbs)})`),
    subline: isInvalid
      ? invalidMsg
      : `📦 ${sizeNum}L Units: ${curCans} ➔ <b>${newCans} units</b> (Total stock: ${formatLiters(currentStock)} ➔ <b>${formatLiters(newStock)}</b>)`
  };
}

function switchAdjView(view) {
  adjActiveView = view;
  if (view === 'requests') {
    currentMovementType = 'adjustment';
  }
  resetPaginationPage('adj_requests');
  if (typeof syncRouteState === 'function') syncRouteState({ push: true });
  renderPage();
}

function setAdjReqFilter(filter) {
  adjRequestFilterStatus = filter;
  resetPaginationPage('adj_requests');
  if (typeof syncRouteState === 'function') syncRouteState({ push: false });
  renderPage();
}

function getFilteredAdjPickerProducts() {
  const supplier = bulkAdjSupplierFilter ? db.suppliers.find(s => s.id === bulkAdjSupplierFilter) : null;
  let list = activeProducts();
  if (supplier) {
    list = list.filter(p => supplier.productIds && supplier.productIds.includes(p.id));
  }
  if (bulkAdjCategoryFilter) {
    list = list.filter(p => (p.category || p.type || 'General') === bulkAdjCategoryFilter);
  }
  const q = (bulkAdjSearchQuery || '').trim().toLowerCase();
  if (q) {
    list = list.filter(p => {
      const name = (p.name || '').toLowerCase();
      const brand = (p.brand || '').toLowerCase();
      const code = String(p.productId || p.id || p.code || '').toLowerCase();
      const cat = (p.category || p.type || '').toLowerCase();
      return name.includes(q) || brand.includes(q) || code.includes(q) || cat.includes(q);
    });
  }
  const sorted = list.slice();
  if (bulkAdjSortBy === 'name-desc') {
    sorted.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
  } else if (bulkAdjSortBy === 'stock-desc') {
    sorted.sort((a, b) => (Number(b.stock) || 0) - (Number(a.stock) || 0));
  } else if (bulkAdjSortBy === 'stock-asc') {
    sorted.sort((a, b) => (Number(a.stock) || 0) - (Number(b.stock) || 0));
  } else {
    sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }
  return sorted;
}

function renderAdjPickerGridHtml(filteredProducts) {
  const selectedIds = new Set((bulkAdjustmentRows || []).filter(r => r.productId).map(r => String(r.productId)));
  if (!filteredProducts.length) {
    return `
      <div class="adj-picker-empty">
        <div>No products match your search or filters.</div>
        <button type="button" class="btn ghost small" onclick="resetAdjPickerFilters()">Reset Filters</button>
      </div>
    `;
  }
  return filteredProducts.map(p => {
    const isSel = selectedIds.has(String(p.id));
    const hex = getProductHex(p);
    const cat = p.category || p.type || 'General';
    const sizes = productSizes(p);
    const stockNum = Number(p.stock) || 0;
    const sizePills = sizes.map(s => {
      const c = productCanCount(p, s);
      return `<span class="adj-picker-size-pill">${s}L <b>(${c})</b></span>`;
    }).join('');
    return `
      <button type="button" class="adj-picker-card ${isSel ? 'selected' : ''}" onclick="toggleBulkAdjProduct('${p.id}')" aria-pressed="${isSel ? 'true' : 'false'}">
        <div class="adj-picker-card-top">
          <div class="adj-picker-card-title">
            <span class="adj-picker-dot" style="background:${hex};"></span>
            <span class="adj-picker-name">${escapeHtml(p.name)}</span>
          </div>
          <span class="adj-picker-check ${isSel ? 'selected' : ''}">${isSel ? '✓ Selected' : '+ Select'}</span>
        </div>
        <div class="adj-picker-meta">
          <span>${escapeHtml(p.brand || '—')}</span>
          <span class="adj-picker-sep">·</span>
          <span class="adj-picker-cat">${escapeHtml(cat)}</span>
        </div>
        <div class="adj-picker-stock-row">
          <span class="adj-picker-stock-label">Available Stock:</span>
          <span class="adj-picker-stock-val ${stockNum <= 0 ? 'empty' : ''}">${formatLiters(stockNum)}</span>
        </div>
        <div class="adj-picker-sizes">
          ${sizePills}
        </div>
      </button>
    `;
  }).join('');
}

function updateAdjPickerGridOnly() {
  const grid = document.getElementById('adj-picker-grid');
  const countEl = document.getElementById('adj-picker-match-count');
  if (!grid) return;
  const filtered = getFilteredAdjPickerProducts();
  grid.innerHTML = renderAdjPickerGridHtml(filtered);
  if (countEl) {
    countEl.innerHTML = `Showing <b>${filtered.length}</b> product${filtered.length === 1 ? '' : 's'}`;
  }
}

function onAdjPickerSearchInput(val) {
  bulkAdjSearchQuery = val || '';
  updateAdjPickerGridOnly();
}

function onAdjPickerCategoryChange(val) {
  bulkAdjCategoryFilter = val || '';
  updateAdjPickerGridOnly();
}

function onAdjPickerSortChange(val) {
  bulkAdjSortBy = val || 'name-asc';
  updateAdjPickerGridOnly();
}

function resetAdjPickerFilters() {
  bulkAdjSearchQuery = '';
  bulkAdjCategoryFilter = '';
  bulkAdjSupplierFilter = '';
  bulkAdjSortBy = 'name-asc';
  renderBulkAdjustmentView();
}

function toggleBulkAdjProduct(productId) {
  if (!productId) return;
  if (!Array.isArray(bulkAdjustmentRows)) bulkAdjustmentRows = [];
  bulkAdjustmentRows = bulkAdjustmentRows.filter(r => r && r.productId);
  const existingIdx = bulkAdjustmentRows.findIndex(r => String(r.productId) === String(productId));
  if (existingIdx !== -1) {
    bulkAdjustmentRows.splice(existingIdx, 1);
  } else {
    const p = productById(productId);
    const reason = 'Damaged';
    const resolvedSize = defaultAdjSizeForProduct(p, reason, 1);
    const maxQty = maxAllowedAdjQty(p, reason, resolvedSize);
    const resolvedQty = maxQty >= 1 ? 1 : 1;
    bulkAdjustmentRows.push({
      id: uid('adj'),
      productId: productId,
      reason,
      size: resolvedSize,
      qty: resolvedQty,
      note: ''
    });
  }
  renderBulkAdjustmentView();
}

function renderBulkAdjustmentView() {
  const container = document.getElementById('bulk-adj-container');
  if (!container) return;

  if (adjActiveView === 'requests') {
    container.innerHTML = renderAdjRequestsViewHtml();
    return;
  }

  initBulkAdjustmentRows();

  const allActive = activeProducts();
  const categories = Array.from(new Set(allActive.map(p => p.category || p.type || 'General'))).sort((a, b) => a.localeCompare(b));
  const categoryOptions = categories
    .map(c => `<option value="${escapeAttr(c)}" ${c === bulkAdjCategoryFilter ? 'selected' : ''}>${escapeHtml(c)}</option>`)
    .join('');

  const supplierOptions = db.suppliers
    .filter(s => s.status === 'active')
    .map(s => `<option value="${s.id}" ${s.id === bulkAdjSupplierFilter ? 'selected' : ''}>${escapeHtml(s.name)}</option>`)
    .join('');

  const filteredProducts = getFilteredAdjPickerProducts();
  const validRows = bulkAdjustmentRows.filter(r => r.productId);
  let hasInvalidRows = false;
  validRows.forEach(r => {
    if (computeBulkAdjRowState(r).isInvalid) hasInvalidRows = true;
  });

  const cardsHtml = validRows.length ? validRows.map((row, index) => {
    const state = computeBulkAdjRowState(row);
    const product = state.product;
    if (!product) return '';
    const hex = getProductHex(product);
    const cat = product.category || product.type || 'General';

    return `
      <div class="simple-adj-card" id="simple-card-${index}">
        <div class="simple-adj-card-head">
          <div class="simple-adj-card-title-wrap">
            <span class="adj-picker-dot" style="background:${hex};"></span>
            <span>#${index + 1} · ${escapeHtml(product.name)}</span>
            <span class="simple-adj-card-meta">${escapeHtml(product.brand || '—')} · ${escapeHtml(cat)} · Stock: <b>${formatLiters(product.stock)}</b></span>
          </div>
          <button type="button" class="btn ghost small" style="color:var(--danger); padding:3px 9px; font-size:12px;" onclick="removeBulkAdjRow(${index})">✕ Remove</button>
        </div>

        <div class="simple-adj-card-body">
          <div class="simple-adj-grid">
            <!-- Left Column: Stock Breakdown, Reason, and Can Size -->
            <div class="simple-adj-col">
              <div class="simple-stock-pills" style="margin-top:0;">
                <span class="muted small" style="font-size:11.5px;">Current stock:</span>
                ${productSizes(product).map(s => {
      const c = productCanCount(product, s);
      return `<span class="simple-stock-tag">🥫 ${s}L: <b>${c} unit${c === 1 ? '' : 's'}</b></span>`;
    }).join('')}
                ${productOpenedStock(product) > 0 ? `
                  <span class="simple-stock-tag opened">🫙 ${formatLiters(productOpenedStock(product))} opened leftover</span>
                ` : ''}
              </div>

              <!-- Step 1: Reason -->
              <div class="simple-form-group">
                <label class="simple-label">
                  <span>1. Reason for Adjustment:</span>
                </label>
                <select class="simple-select" onchange="setAdjRowReason(${index}, this.value)">
                  <option value="Damaged" ${row.reason === 'Damaged' ? 'selected' : ''}>🔻 Damaged / Leaking Unit (Deduct)</option>
                  <option value="Expired" ${row.reason === 'Expired' ? 'selected' : ''}>🔻 Expired Shelf Life (Deduct)</option>
                  <option value="Count Correction (deduct)" ${row.reason === 'Count Correction (deduct)' ? 'selected' : ''}>🔻 Missing / Inventory Count Shortage (Deduct)</option>
                  <option value="Internal Use" ${row.reason === 'Internal Use' ? 'selected' : ''}>🔻 Store / Internal Use (Deduct)</option>
                  <option value="Count Correction (add)" ${row.reason === 'Count Correction (add)' ? 'selected' : ''}>➕ Found Extra / Count Overage (Add)</option>
                  <option value="Dispose Opened / Used Stock" ${row.reason === 'Dispose Opened / Used Stock' ? 'selected' : ''}>🫙 Dispose Leftover Opened Paint (Deduct)</option>
                </select>
              </div>

              <!-- Step 2: Container Size -->
              <div class="simple-form-group">
                <label class="simple-label">
                  <span>2. Container Size:</span>
                  <span class="simple-label-help">${state.isOpened ? 'Opened leftover paint' : 'Sealed paint units'}</span>
                </label>
                <div class="simple-size-group">
                  ${state.isOpened ? (
        productOpenedEntries(product).length ? productOpenedEntries(product).map(e => {
          const isSel = (row.size === openedValueForSize(e.size));
          return `
                        <button type="button" class="simple-size-btn ${isSel ? 'active' : ''}" onclick="setAdjRowSize(${index}, '${openedValueForSize(e.size)}')">
                          <span class="simple-size-name">🫙 ${e.size}L Opened</span>
                          <span class="simple-size-stock">${formatLiters(e.left)} leftover</span>
                        </button>
                      `;
        }).join('') : `
                      <div class="muted small" style="padding:6px 0; color:var(--danger);">⚠️ No opened leftover stock available for this product.</div>
                    `
      ) : (
        productSizes(product).map(s => {
          const cur = productCanCount(product, s);
          const maxDeduct = maxAllowedAdjQty(product, row.reason, s);
          const isSel = (Number(state.sizeNum) === s);
          const isDis = (!state.isAdd && maxDeduct <= 0);
          return `
                        <button type="button" class="simple-size-btn ${isSel ? 'active' : ''} ${isDis ? 'disabled' : ''}" 
                          onclick="setAdjRowSize(${index}, ${s})" ${isDis ? 'disabled' : ''}>
                          <span class="simple-size-name">🥫 ${s}L ${s <= 1 ? 'Can' : (s <= 4 ? 'Gallon' : 'Drum')}</span>
                          <span class="simple-size-stock">${state.isAdd ? `${cur} in stock` : (maxDeduct >= 1 ? `${cur} in stock · Max -${maxDeduct}` : (cur === 1 ? '1 unit (Protected)' : '0 in stock'))}</span>
                        </button>
                      `;
        }).join('')
      )}
                </div>
              </div>
            </div>

            <!-- Right Column: Quantity, Live Preview, and Remarks -->
            <div class="simple-adj-col">
              <!-- Step 3: Quantity -->
              <div class="simple-form-group">
                <label class="simple-label">
                  <span>3. Adjustment Quantity:</span>
                  <span class="simple-label-help">${state.isOpened ? 'in Liters' : 'in Units'}</span>
                </label>
                <div class="simple-qty-container">
                  <div class="simple-stepper">
                    <button type="button" class="simple-step-btn" onclick="stepBulkAdjQty(${index}, -1)">−</button>
                    <input type="number" 
                      id="simple-qty-input-${index}"
                      class="simple-qty-input" 
                      min="${state.isOpened ? 0.01 : 1}" 
                      max="${state.maxQty > 0 ? state.maxQty : 1}" 
                      step="${state.isOpened ? 0.25 : 1}" 
                      value="${row.qty}" 
                      oninput="onBulkAdjQtyInput(${index}, this.value)">
                    <button type="button" class="simple-step-btn" onclick="stepBulkAdjQty(${index}, 1)">+</button>
                  </div>
                  <span class="simple-qty-unit">${state.isOpened ? 'Liters' : (state.qtyNum === 1 ? 'Unit' : 'Units')}</span>
                  ${state.maxQty > 1 ? `
                    <button type="button" class="simple-btn-pill" onclick="setBulkAdjQtyMax(${index})">Set to Max (${state.maxQty})</button>
                  ` : ''}
                </div>
                ${!state.isOpened && !state.isAdd && state.maxQty > 0 && state.maxQty < state.curCans ? `
                  <div class="simple-safeguard-tip">🛡️ Up to ${state.maxQty} units can be deducted (50% safety safeguard) to prevent accidental stockout.</div>
                ` : ''}
                ${!state.isOpened && state.isAdd ? `
                  <div class="simple-safeguard-tip">🛡️ Up to 10 units can be added via manual adjustment. For supplier deliveries, use the Stock Receiving tab.</div>
                ` : ''}
              </div>

              <!-- Live Result Preview Bar -->
              <div id="simple-preview-${index}" class="simple-preview-bar ${state.previewClass}">
                <span class="simple-preview-icon">${state.isInvalid ? '⚠️' : (state.isAdd ? '➕' : (state.isOpened ? '🫙' : '🔻'))}</span>
                <div class="simple-preview-content">
                  <div class="simple-preview-title" id="simple-preview-title-${index}">${state.headline}</div>
                  <div class="simple-preview-sub" id="simple-preview-sub-${index}">${state.subline}</div>
                </div>
              </div>

              <!-- Note (optional) -->
              <div class="simple-form-group">
                <label class="simple-label">
                  <span>Remarks / Audit Note <span class="muted small" style="font-weight:normal;">(optional)</span>:</span>
                </label>
                <input type="text" class="simple-note-input" placeholder="e.g. Dropped in warehouse, dented lid, audit recount..." value="${escapeHtml(row.note || '')}" oninput="updateBulkAdjRow(${index}, 'note', this.value)">
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('') : `
    <div class="adj-selected-empty">
      <div class="adj-selected-empty-icon">📦</div>
      <div class="adj-selected-empty-title">No products selected yet</div>
      <div class="muted small">Click one or more product cards above to configure stock adjustments.</div>
    </div>
  `;

  container.innerHTML = `
    <div class="simple-adj-container">
      <div class="simple-adj-header">
        <div>
          <div class="simple-adj-title">⚖️ Stock Adjustment</div>
          <div class="simple-adj-subtitle">Search and select one or more products below to deduct damaged/expired stock, record store use, or apply audit corrections.</div>
        </div>
        <div class="simple-header-actions">
          <div class="simple-header-stats">
            <span class="simple-stat-pill" id="adj-picker-match-count">Showing <b>${filteredProducts.length}</b> product${filteredProducts.length === 1 ? '' : 's'}</span>
            <span class="simple-stat-pill adj-stat-selected">Selected: <b>${validRows.length}</b> product${validRows.length === 1 ? '' : 's'}</span>
          </div>
        </div>
      </div>

      <!-- Searchable Product Picker -->
      <div class="adj-picker-section">
        <div class="adj-picker-toolbar">
          <div class="adj-picker-search-wrap">
            <span class="adj-picker-search-icon">🔍</span>
            <input type="text" id="adj-picker-search" class="adj-picker-search" placeholder="Search by product name, brand, or code..." value="${escapeAttr(bulkAdjSearchQuery)}" oninput="onAdjPickerSearchInput(this.value)">
          </div>
          <select id="adj-picker-category" class="adj-picker-filter-select" onchange="onAdjPickerCategoryChange(this.value)" title="Filter by Category">
            <option value="">All Categories</option>
            ${categoryOptions}
          </select>
          <select id="bulk-adj-supplier-filter" class="adj-picker-filter-select" onchange="onBulkAdjSupplierFilterChange()" title="Filter by Supplier">
            <option value="">All Suppliers</option>
            ${supplierOptions}
          </select>
          <select id="adj-picker-sort" class="adj-picker-filter-select" onchange="onAdjPickerSortChange(this.value)" title="Sort Products">
            <option value="name-asc" ${bulkAdjSortBy === 'name-asc' ? 'selected' : ''}>Sort: Name (A → Z)</option>
            <option value="name-desc" ${bulkAdjSortBy === 'name-desc' ? 'selected' : ''}>Sort: Name (Z → A)</option>
            <option value="stock-desc" ${bulkAdjSortBy === 'stock-desc' ? 'selected' : ''}>Sort: Stock (High → Low)</option>
            <option value="stock-asc" ${bulkAdjSortBy === 'stock-asc' ? 'selected' : ''}>Sort: Stock (Low → High)</option>
          </select>
        </div>

        <div id="adj-picker-grid" class="adj-picker-grid">
          ${renderAdjPickerGridHtml(filteredProducts)}
        </div>
      </div>

      <!-- Selected Products Adjustment Forms -->
      <div class="adj-selected-section">
        ${validRows.length ? `
          <div class="adj-selected-header">
            <span>Selected Products for Adjustment (${validRows.length})</span>
            <button type="button" class="btn ghost small" style="color:var(--ink-soft);" onclick="clearBulkAdjRows()">Clear Selection</button>
          </div>
        ` : ''}
        ${cardsHtml}
      </div>

      <div class="simple-action-row">
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
          <button type="button" id="btn-save-adj" class="btn simple-submit-btn" onclick="confirmAndSubmitAdjustments()" ${hasInvalidRows || validRows.length === 0 ? 'disabled' : ''}>
            ${currentUser && currentUser.role === 'staff'
      ? `⏳ Submit for Admin Approval${validRows.length > 1 ? ` (${validRows.length} items)` : ''}`
      : `💾 Save Stock Adjustment${validRows.length > 1 ? ` (${validRows.length} items)` : ''}`}
          </button>
        </div>
        ${validRows.length > 0 ? `<button type="button" class="btn ghost small" style="color:var(--ink-soft);" onclick="clearBulkAdjRows()">Clear Form</button>` : ''}
      </div>
    </div>
  `;
}

function setAdjRowReason(index, reason) {
  const row = bulkAdjustmentRows[index];
  if (!row) return;
  row.reason = reason;
  const p = row.productId ? productById(row.productId) : null;
  if (reason === 'Dispose Opened / Used Stock') {
    row.size = defaultAdjSizeForProduct(p, reason, row.size);
  } else if (isOpenedSizeValue(row.size)) {
    row.size = p ? (productSizes(p)[0] || 1) : 1;
  }
  clampRowQtyToMax(row, index);
  renderBulkAdjustmentView();
}

function setAdjRowSize(index, size) {
  const row = bulkAdjustmentRows[index];
  if (!row) return;
  row.size = isOpenedSizeValue(size) ? size : (Number(size) || 1);
  clampRowQtyToMax(row, index);
  renderBulkAdjustmentView();
}

function stepBulkAdjQty(index, delta) {
  const row = bulkAdjustmentRows[index];
  if (!row) return;
  const state = computeBulkAdjRowState(row);
  let cur = parseFloat(row.qty) || 0;
  if (state.isOpened) {
    let next = Math.max(0.01, Number((cur + (delta * 0.25)).toFixed(2)));
    if (state.maxQty > 0) next = Math.min(state.maxQty, next);
    row.qty = next;
  } else {
    let next = Math.max(1, Math.floor(cur + delta));
    if (state.maxQty > 0) next = Math.min(state.maxQty, next);
    row.qty = next;
  }
  const inputEl = document.getElementById(`simple-qty-input-${index}`);
  if (inputEl) inputEl.value = row.qty;
  onBulkAdjQtyInput(index, row.qty);
}

function setBulkAdjQtyMax(index) {
  const row = bulkAdjustmentRows[index];
  if (!row) return;
  const state = computeBulkAdjRowState(row);
  if (state.maxQty > 0) {
    row.qty = state.maxQty;
    const inputEl = document.getElementById(`simple-qty-input-${index}`);
    if (inputEl) inputEl.value = row.qty;
    onBulkAdjQtyInput(index, row.qty);
  }
}

function onBulkAdjQtyInput(index, val) {
  const row = bulkAdjustmentRows[index];
  if (!row) return;
  row.qty = val;
  const state = computeBulkAdjRowState(row);

  const previewEl = document.getElementById(`simple-preview-${index}`);
  const titleEl = document.getElementById(`simple-preview-title-${index}`);
  const subEl = document.getElementById(`simple-preview-sub-${index}`);

  if (previewEl) {
    previewEl.className = `simple-preview-bar ${state.previewClass}`;
    const iconEl = previewEl.querySelector('.simple-preview-icon');
    if (iconEl) iconEl.textContent = state.isInvalid ? '⚠️' : (state.isAdd ? '➕' : (state.isOpened ? '🫙' : '🔻'));
  }
  if (titleEl) titleEl.textContent = state.headline;
  if (subEl) subEl.innerHTML = state.subline;

  // Update submit button state
  const submitBtn = document.getElementById('btn-save-adj');
  if (submitBtn) {
    const validRows = bulkAdjustmentRows.filter(r => r.productId);
    const anyInvalid = validRows.some(r => computeBulkAdjRowState(r).isInvalid);
    submitBtn.disabled = anyInvalid || validRows.length === 0;
  }
}

function clampRowQtyToMax(row, index) {
  const p = row.productId ? productById(row.productId) : null;
  const maxQty = maxAllowedAdjQty(p, row.reason, row.size);
  if (isOpenedSizeValue(row.size) || row.reason === 'Dispose Opened / Used Stock') {
    if (p && maxQty > 0) {
      row.qty = maxQty;
    }
  } else {
    const cur = Math.max(1, Math.floor(Number(row.qty) || 1));
    row.qty = maxQty >= 1 ? Math.min(cur, maxQty) : 1;
  }
  const qtyEl = document.getElementById(`simple-qty-input-${index}`);
  if (qtyEl) qtyEl.value = row.qty;
}

function updateBulkAdjRow(index, field, value) {
  const row = bulkAdjustmentRows[index];
  if (!row) return;

  if (field === 'productId') {
    row.productId = value;
    const p = value ? productById(value) : null;
    row.size = defaultAdjSizeForProduct(p, row.reason, row.size);
    clampRowQtyToMax(row, index);
    renderBulkAdjustmentView();
  } else if (field === 'reason') {
    setAdjRowReason(index, value);
  } else if (field === 'size') {
    setAdjRowSize(index, value);
  } else if (field === 'qty') {
    row.qty = value;
    onBulkAdjQtyInput(index, value);
  } else if (field === 'note') {
    row.note = value;
  }
}

function removeBulkAdjRow(index) {
  bulkAdjustmentRows.splice(index, 1);
  renderBulkAdjustmentView();
}

function clearBulkAdjRows() {
  bulkAdjustmentRows = [];
  renderBulkAdjustmentView();
}

const renderBulkAdjustmentTable = renderBulkAdjustmentView;

function selectMovementType(type) {
  const safeType = ['receiving', 'adjustment', 'colormix'].includes(type) ? type : 'receiving';
  currentMovementType = safeType;
  const hidden = document.getElementById('mv-type');
  if (hidden) hidden.value = safeType;

  ['receiving', 'adjustment', 'colormix'].forEach(t => {
    const card = document.getElementById('mv-card-' + t);
    if (card) {
      const isSelected = (t === safeType);
      card.classList.toggle('active', isSelected);
      card.setAttribute('aria-checked', isSelected ? 'true' : 'false');
    }
  });

  if (typeof syncRouteState === 'function') syncRouteState({ push: true });
  toggleMovementFields();
}

function toggleMovementFields() {
  const hidden = document.getElementById('mv-type');
  const rawType = hidden ? hidden.value : (currentMovementType || 'receiving');
  const type = ['receiving', 'adjustment', 'colormix'].includes(rawType) ? rawType : 'receiving';
  ['receiving', 'adjustment', 'colormix'].forEach(t => {
    const el = document.getElementById('mv-fields-' + t);
    if (el) el.classList.toggle('hidden', t !== type);
  });
  if (type === 'adjustment') {
    renderBulkAdjustmentView();
  } else if (type === 'receiving') {
    renderReceivingPOPreview();
    if (typeof renderActiveReplacementTrackingPanel === 'function') renderActiveReplacementTrackingPanel();
  }
}

function confirmAndSubmitAdjustments() {
  const validRows = bulkAdjustmentRows.filter(r => r.productId);
  if (validRows.length === 0) {
    showToast('Please select a product before saving.', 'error');
    return false;
  }

  for (let i = 0; i < validRows.length; i++) {
    const state = computeBulkAdjRowState(validRows[i]);
    if (state.isInvalid) {
      showToast(state.invalidMsg, 'error');
      return false;
    }
  }

  const isStaff = currentUser && currentUser.role === 'staff';

  const reviewListHtml = validRows.map(r => {
    const state = computeBulkAdjRowState(r);
    const p = state.product;
    const isAdd = state.isAdd;
    const isOpened = state.isOpened;
    const qDisplay = isOpened ? r.qty : state.qtyNum;
    const changeTag = isAdd
      ? `<b style="color:var(--success);">+${qDisplay} unit${qDisplay === 1 ? '' : 's'} (+${formatLiters(state.litersAbs)})</b>`
      : (isOpened
        ? `<b style="color:var(--warning-text);">Dispose ${formatLiters(qDisplay)}</b>`
        : `<b style="color:var(--danger);">-${qDisplay} unit${qDisplay === 1 ? '' : 's'} (-${formatLiters(state.litersAbs)})</b>`);

    return `
      <div style="padding:9px 12px; background:var(--surface-2); border:1px solid var(--line); border-radius:6px; margin-bottom:6px; font-size:13px; text-align:left;">
        <div style="font-weight:700; color:var(--ink);">${escapeHtml(p.name)} (${isOpened ? 'Opened Leftover' : state.sizeNum + 'L ' + (state.sizeNum <= 1 ? 'Can' : (state.sizeNum <= 4 ? 'Gallon' : 'Drum'))})</div>
        <div style="display:flex; justify-content:space-between; margin-top:2px;">
          <span>${changeTag} · ${escapeHtml(r.reason)}</span>
          <span class="muted small">${isOpened ? `Leftover: ${formatLiters(Math.max(0, state.curOpened - r.qty))}` : `Stock: ${state.curCans} ➔ ${state.newCans} units`}</span>
        </div>
      </div>
    `;
  }).join('');

  if (isStaff) {
    const modalHtml = `
      <div style="text-align:left; font-size:13px;">
        <p style="margin-bottom:10px;">As <b>Inventory Staff</b>, the following stock adjustment for <b>${validRows.length} item(s)</b> requires approval from an <b>Administrator</b> before inventory levels update:</p>
        <div style="max-height:220px; overflow-y:auto; margin-bottom:10px;">
          ${reviewListHtml}
        </div>
        <p class="muted small" style="color:var(--warning-text); font-weight:600;">⏳ This will be submitted as <b>Pending Approval</b> for Admin review.</p>
      </div>
    `;

    if (typeof showPOConfirm === 'function') {
      showPOConfirm({
        icon: '⏳',
        title: 'Submit for Admin Approval?',
        message: modalHtml,
        confirmLabel: '✓ Submit for Approval',
        confirmClass: 'btn',
        onConfirm: () => submitAdjRequestForApproval(validRows)
      });
    } else {
      submitAdjRequestForApproval(validRows);
    }
    return false;
  }

  const modalHtml = `
    <div style="text-align:left; font-size:13px;">
      <p style="margin-bottom:10px;">Are you sure you want to apply the following stock adjustments?</p>
      <div style="max-height:220px; overflow-y:auto; margin-bottom:10px;">
        ${reviewListHtml}
      </div>
      <p class="muted small">Inventory levels will be updated immediately and recorded in Movement History.</p>
    </div>
  `;

  if (typeof showPOConfirm === 'function') {
    showPOConfirm({
      icon: '⚖️',
      title: 'Save Stock Adjustment?',
      message: modalHtml,
      confirmLabel: '✓ Save Stock Adjustment',
      confirmClass: 'btn',
      onConfirm: () => executeStockAdjustment(validRows)
    });
  } else {
    executeStockAdjustment(validRows);
  }
  return false;
}

async function submitAdjRequestForApproval(validRows) {
  if (window._isSubmittingAdjustment) return;
  window._isSubmittingAdjustment = true;
  const btnSave = document.getElementById('btn-save-adj');
  if (btnSave) btnSave.disabled = true;

  try {
    if (!db.adjustmentRequests) db.adjustmentRequests = [];
    const reqNumber = generateAdjReqNumber();
    const enrichedRows = validRows.map(r => {
      const p = productById(r.productId);
      const isAdd = r.reason === 'Count Correction (add)';
      const isOpened = r.reason === 'Dispose Opened / Used Stock' || (!isAdd && isOpenedSizeValue(r.size));
      const sizeNum = p ? (isOpened ? openedSizeFromValue(p, r.size) : adjSealedSize(p, r.size)) : r.size;
      const variant = p && !isOpened ? productSizeVariantBySize(p, sizeNum) : null;
      return {
        ...r,
        productId: p ? (p.productId || p.id) : r.productId,
        product_id: p ? (p.productId || p.id) : r.productId,
        sizeId: variant ? variant.sizeId : (r.sizeId || null),
        size_id: variant ? variant.sizeId : (r.sizeId || null),
        containerSize: sizeNum
      };
    });
    const req = {
      id: uid('adjreq'),
      reqNumber: reqNumber,
      date: nowISO(),
      requestedBy: (currentUser && currentUser.name) || 'Inventory Staff',
      role: (currentUser && currentUser.role) || 'staff',
      status: 'pending',
      rows: enrichedRows,
      rowsJson: JSON.stringify(enrichedRows),
      batchNote: '',
      reason: enrichedRows.length === 1 ? enrichedRows[0].reason : (enrichedRows.length > 1 ? `${enrichedRows[0].reason} (+${enrichedRows.length - 1} more)` : 'Stock Adjustment'),
      reviewedBy: null,
      reviewedAt: null,
      rejectReason: null
    };

    db.adjustmentRequests.unshift(req);
    const reqItemsSummary = enrichedRows.map(r => {
      const prod = productById(r.productId);
      const pName = prod ? prod.name : 'Product';
      return `${pName} (${r.reason}: ${r.qty} × ${r.containerSize || r.size}L)`;
    }).join(', ');
    logAudit('ADJ_REQUEST_SUBMIT', 'Stock Adjustment', `Staff submitted adjustment request ${reqNumber} (${validRows.length} item${validRows.length === 1 ? '' : 's'}): ${reqItemsSummary}`, {
      productId: enrichedRows[0] ? enrichedRows[0].productId : '',
      entityName: reqNumber,
      fieldChanged: 'Stock Adjustment Request',
      oldValue: 'None',
      newValue: `Pending Approval (${reqItemsSummary})`,
      referenceNo: reqNumber,
      reason: enrichedRows.map(r => r.reason).join(', ')
    });
    await saveDB();

    bulkAdjustmentRows = [{ id: uid('adj'), productId: '', reason: 'Damaged', size: 1, qty: 1, note: '' }];
    showToast(`✓ Submitted Adjustment Request ${reqNumber} for Admin approval!`, 'ok');
    switchAdjView('requests');
  } catch (err) {
    console.error('Error submitting adjustment request:', err);
    showToast('Failed to submit adjustment request.', 'error');
  } finally {
    window._isSubmittingAdjustment = false;
    if (btnSave) btnSave.disabled = false;
  }
}

async function executeStockAdjustment(validRows, actorName = null, options = {}) {
  const date = nowISO();
  const recordedStaff = actorName
    ? (actorName === (currentUser && currentUser.name) ? actorName : `${actorName} (Approved by ${(currentUser && currentUser.name) || 'Admin'})`)
    : ((currentUser && currentUser.name) || 'Staff');

  for (const row of validRows) {
    const p = productById(row.productId);
    if (!p) continue;
    const isAdd = row.reason === 'Count Correction (add)';
    const isOpened = row.reason === 'Dispose Opened / Used Stock' || (!isAdd && isOpenedSizeValue(row.size));

    if (isOpened) {
      const qty = Number(Number(row.qty).toFixed(2));
      const canSize = openedSizeFromValue(p, row.size);
      const beforeOpened = productOpenedLiters(p, canSize);
      const newOpened = Math.max(0, Number((beforeOpened - qty).toFixed(2)));
      const pools = {};
      productSizes(p).forEach(s => { pools[s] = productOpenedLiters(p, s); });
      pools[canSize] = newOpened;
      setProductOpenedBySize(p, pools);
      if (typeof syncProductVariants === 'function') syncProductVariants(p);
      syncProductVariants(p);
      const variant = productSizeVariantBySize(p, canSize);
      const sizeId = row.sizeId || (variant ? variant.sizeId : null);

      db.movements.push({
        id: uid('mv'),
        date,
        type: 'adjustment',
        productId: p.productId || p.id,
        product_id: p.productId || p.id,
        sizeId: sizeId,
        size_id: sizeId,
        container_size: canSize,
        productName: `${p.name} [Opened / Used Stock]`,
        qtyChange: 0,
        note: `${row.reason} [Deducted ${formatStock(qty)}L from ${canSize ? canSize + 'L ' : ''}Opened / Used Stock · Opened: ${formatStock(beforeOpened)}L→${formatStock(newOpened)}L]${row.note ? ' — ' + row.note : ''}`,
        staffName: recordedStaff
      });
      if (typeof logAudit === 'function') {
        logAudit('STOCK_ADJUST', 'Inventory', `Adjusted opened stock for ${p.name} (${canSize}L Container): ${formatStock(beforeOpened)}L ➔ ${formatStock(newOpened)}L (${row.reason})`, {
          productId: p.productId || p.id,
          entityName: p.name,
          fieldChanged: `Opened / Used Stock (${canSize}L Container)`,
          oldValue: `${formatStock(beforeOpened)} L`,
          newValue: `${formatStock(newOpened)} L (-${formatStock(qty)} L)`,
          reason: row.reason + (row.note ? ` — ${row.note}` : '')
        });
      }
    } else {
      const sizeNum = adjSealedSize(p, row.size);
      const cans = Math.floor(Number(row.qty));
      const liters = Number((cans * sizeNum).toFixed(2));
      const deltaLiters = isAdd ? liters : -liters;
      const beforeCans = productCanCount(p, sizeNum);
      const afterCans = isAdd ? (beforeCans + cans) : Math.max(0, beforeCans - cans);
      const beforeStock = productHasCanBreakdown(p) ? canBreakdownLiters(p) : (Number(p.stock) || 0);

      if (!p.canStock || Array.isArray(p.canStock) || typeof p.canStock !== 'object') {
        p.canStock = {};
      }
      p.canStock[sizeNum] = afterCans;
      p.canStock[String(sizeNum)] = afterCans;
      const variant = productSizeVariantBySize(p, sizeNum);
      if (variant) {
        variant.sealedQuantity = afterCans;
      }
      syncProductVariants(p);
      normalizeProductOpenedStock(p);
      const afterStock = productHasCanBreakdown(p) ? canBreakdownLiters(p) : Math.max(0, Number((beforeStock + deltaLiters).toFixed(2)));
      p.stock = afterStock;
      syncProductVariants(p);
      const sizeId = row.sizeId || (variant ? variant.sizeId : null);

      db.movements.push({
        id: uid('mv'),
        date,
        type: 'adjustment',
        productId: p.productId || p.id,
        product_id: p.productId || p.id,
        sizeId: sizeId,
        size_id: sizeId,
        container_size: sizeNum,
        productName: p.name,
        qtyChange: deltaLiters,
        note: `${row.reason} [${isAdd ? 'Added' : 'Deducted'} ${cans} × ${sizeNum}L (${isAdd ? '+' : '-'}${formatStock(liters)}L) · ${sizeNum}L Units: ${beforeCans}→${afterCans}, Stock: ${formatStock(beforeStock)}L→${formatStock(p.stock)}L]${row.note ? ' — ' + row.note : ''}`,
        staffName: recordedStaff
      });
      if (typeof logAudit === 'function') {
        const auditAction = isAdd ? 'STOCK_INCREASE' : 'STOCK_DECREASE';
        logAudit(
          auditAction,
          'Inventory',
          `${isAdd ? 'Increased' : 'Decreased'} stock for ${p.name} (${cans} × ${sizeNum}L = ${isAdd ? '+' : '-'}${formatStock(liters)}L) — Reason: ${row.reason}`,
          {
            productId: p.productId || p.id,
            entityName: p.name,
            fieldChanged: `Sealed Stock (${sizeNum}L Container)`,
            oldValue: `${beforeCans} units (${formatStock(beforeStock)} L total)`,
            newValue: `${afterCans} units (${formatStock(p.stock)} L total)`,
            reason: row.reason + (row.note ? ` — ${row.note}` : '')
          }
        );
      }
    }
  }

  if (!options.skipSave) {
    await saveDB();
  }
  if (!options.skipReset) {
    bulkAdjustmentRows = [{ id: uid('adj'), productId: '', reason: 'Damaged', size: 1, qty: 1, note: '' }];
  }
  if (!options.skipToast) {
    showToast(`✓ Successfully updated stock for ${validRows.length} product${validRows.length === 1 ? '' : 's'}!`, 'ok');
  }
  if (!options.skipRender) {
    renderPage();
  }
}

function safeParseAdjRows(req) {
  if (!req) return [];
  if (Array.isArray(req.rows)) return req.rows;
  if (!req.rowsJson) return [];
  try {
    const parsed = JSON.parse(req.rowsJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function confirmApproveAdjRequest(reqId) {
  const req = (db.adjustmentRequests || []).find(r => r.id === reqId);
  if (!req || req.status !== 'pending') return;

  const rows = safeParseAdjRows(req);
  let hasStockDiscrepancy = false;

  const reviewHtml = rows.map(r => {
    const p = productById(r.productId);
    if (!p) return '<div class="muted small" style="color:var(--danger); padding:6px 0;">⚠️ Product no longer exists in catalog.</div>';
    const isAdd = r.reason === 'Count Correction (add)';
    const isOpened = r.reason === 'Dispose Opened / Used Stock' || (!isAdd && isOpenedSizeValue(r.size));
    const sizeNum = p ? (isOpened ? openedSizeFromValue(p, r.size) : adjSealedSize(p, r.size)) : r.size;
    const curCans = !isOpened ? productCanCount(p, sizeNum) : 0;
    const curOpened = isOpened ? productOpenedLiters(p, sizeNum) : 0;

    let warningHtml = '';
    if (!isAdd) {
      if (isOpened && r.qty > curOpened) {
        hasStockDiscrepancy = true;
        warningHtml = `<div style="color:var(--danger); font-size:11.5px; font-weight:600; margin-top:2px;">⚠️ Warning: Requested disposal (${formatLiters(r.qty)}) exceeds current opened stock (${formatLiters(curOpened)}).</div>`;
      } else if (!isOpened && r.qty > curCans) {
        hasStockDiscrepancy = true;
        warningHtml = `<div style="color:var(--danger); font-size:11.5px; font-weight:600; margin-top:2px;">⚠️ Warning: Requested deduction (${r.qty} units) exceeds current stock (${curCans} units).</div>`;
      }
    }

    const actionLabel = isAdd
      ? `<span style="color:var(--success); font-weight:700;">➕ Add ${r.qty} × ${sizeNum}L</span>`
      : (isOpened
        ? `<span style="color:var(--warning-text); font-weight:700;">🫙 Dispose ${formatLiters(r.qty)}</span>`
        : `<span style="color:var(--danger); font-weight:700;">🔻 Deduct ${r.qty} × ${sizeNum}L</span>`);

    return `
      <div style="display:flex; justify-content:space-between; align-items:flex-start; padding:8px 12px; background:var(--surface-2); border-radius:6px; margin-bottom:6px; font-size:12.5px; border:1px solid var(--line);">
        <div>
          <b>${escapeHtml(p.name)}</b> <span class="muted small">(${escapeHtml(r.reason)})</span>
          <div class="muted small">${isOpened ? `Available opened leftover: <b>${formatLiters(curOpened)}</b>` : `Available in stock: <b>${curCans} can${curCans === 1 ? '' : 's'}</b>`}</div>
          ${r.note ? `<div class="muted small">"${escapeHtml(r.note)}"</div>` : ''}
          ${warningHtml}
        </div>
        <div style="text-align:right;">${actionLabel}</div>
      </div>
    `;
  }).join('');

  if (hasStockDiscrepancy) {
    showPOConfirm({
      icon: '🚫',
      title: 'Cannot Approve — Insufficient Stock',
      message: `
        <div style="text-align:left; font-size:13px; color:var(--ink-soft);">
          <p>Request <b>${escapeHtml(req.reqNumber)}</b> cannot be approved because one or more requested deductions exceed current warehouse stock:</p>
          <div style="max-height:200px; overflow-y:auto; margin:8px 0;">${reviewHtml}</div>
          <p style="font-size:12px; color:var(--danger); font-weight:600;">Please reject this request so staff can resubmit with valid quantities.</p>
        </div>
      `,
      confirmLabel: 'OK',
      confirmClass: 'btn secondary',
      onConfirm: () => { }
    });
    return;
  }

  showPOConfirm({
    icon: '✅',
    title: 'Approve Stock Adjustment?',
    message: `
      <div style="text-align:left; font-size:13px; color:var(--ink-soft);">
        <p>Do you want to approve request <b>${escapeHtml(req.reqNumber)}</b> submitted by <b>${escapeHtml(req.requestedBy)}</b>?</p>
        <div style="max-height:200px; overflow-y:auto; margin:8px 0;">${reviewHtml}</div>
        <p style="font-size:12px; color:var(--teal-text); font-weight:600;">✓ Warehouse stock will update automatically and be recorded in Movement History.</p>
      </div>
    `,
    confirmLabel: '✓ Approve & Update Stock',
    confirmClass: 'btn',
    onConfirm: () => approveAdjRequest(reqId)
  });
}

async function approveAdjRequest(reqId) {
  const req = (db.adjustmentRequests || []).find(r => r.id === reqId);
  if (!req || req.status !== 'pending') return;

  const rows = safeParseAdjRows(req);
  // Execute updates without triggering premature toast, page render, or resetting the draft form
  await executeStockAdjustment(rows, req.requestedBy, { skipSave: true, skipReset: true, skipToast: true, skipRender: true });

  req.status = 'approved';
  req.reviewedBy = (currentUser && currentUser.name) || 'Administrator';
  req.reviewedAt = nowISO();

  logAudit('ADJ_REQUEST_APPROVE', 'Stock Adjustment', `Approved adjustment request ${req.reqNumber} (submitted by ${req.requestedBy})`, {
    entityName: req.reqNumber,
    fieldChanged: 'Adjustment Request Status',
    oldValue: 'Pending Approval',
    newValue: 'Approved & Applied',
    referenceNo: req.reqNumber,
    reason: req.batchNote || `Submitted by ${req.requestedBy}`
  });
  await saveDB();
  showToast(`✓ Approved adjustment request ${req.reqNumber} and updated stock!`, 'ok');
  renderPage();
}

function confirmRejectAdjRequest(reqId) {
  const req = (db.adjustmentRequests || []).find(r => r.id === reqId);
  if (!req || req.status !== 'pending') return;

  const reason = prompt(`Enter reason for rejecting adjustment request ${req.reqNumber}:`, 'Count discrepancy or unverified damage');
  if (reason === null) return;

  rejectAdjRequest(reqId, reason.trim() || 'Rejected by Administrator');
}

async function rejectAdjRequest(reqId, reason) {
  const req = (db.adjustmentRequests || []).find(r => r.id === reqId);
  if (!req || req.status !== 'pending') return;

  req.status = 'rejected';
  req.rejectReason = reason || 'Rejected by Administrator';
  req.reviewedBy = (currentUser && currentUser.name) || 'Administrator';
  req.reviewedAt = nowISO();

  logAudit('ADJ_REQUEST_REJECT', 'Stock Adjustment', `Rejected adjustment request ${req.reqNumber}. Reason: ${req.rejectReason}`, {
    entityName: req.reqNumber,
    fieldChanged: 'Adjustment Request Status',
    oldValue: 'Pending Approval',
    newValue: 'Rejected',
    referenceNo: req.reqNumber,
    reason: req.rejectReason
  });
  await saveDB();
  showToast(`Rejected adjustment request ${req.reqNumber}.`, 'ok');
  renderPage();
}

function viewAdjRequestDetails(reqId) {
  const req = (db.adjustmentRequests || []).find(r => r.id === reqId);
  if (!req) return;

  const rows = safeParseAdjRows(req);
  const isAdmin = currentUser && currentUser.role === 'admin';
  const isPending = req.status === 'pending';

  const rowsHtml = rows.map((r, i) => {
    const p = productById(r.productId);
    const isAdd = r.reason === 'Count Correction (add)';
    const isOpened = r.reason === 'Dispose Opened / Used Stock' || (!isAdd && isOpenedSizeValue(r.size));
    const sizeNum = p ? (isOpened ? openedSizeFromValue(p, r.size) : adjSealedSize(p, r.size)) : r.size;
    const actionLabel = isAdd
      ? `<span style="color:var(--success); font-weight:700;">➕ Add ${r.qty} × ${sizeNum}L</span>`
      : (isOpened
        ? `<span style="color:var(--warning-text); font-weight:700;">🫙 Dispose ${formatLiters(r.qty)}</span>`
        : `<span style="color:var(--danger); font-weight:700;">🔻 Deduct ${r.qty} × ${sizeNum}L</span>`);

    const variant = p && !isOpened ? productSizeVariantBySize(p, sizeNum) : null;
    const sizeId = r.sizeId || (variant ? variant.sizeId : null);
    const prodId = p ? (p.productId || p.id) : r.productId;

    return `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; background:var(--surface-2); border-radius:6px; margin-bottom:8px; border:1px solid var(--line);">
        <div>
          <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
            <span style="font-weight:700; color:var(--ink);">${escapeHtml(p ? p.name : 'Unknown Product')}</span>
            <span style="font-weight:normal; font-size:12px; color:var(--ink-soft);">${p ? `(${escapeHtml(p.brand)})` : ''}</span>
          </div>
          <div class="muted small" style="margin-top:2px;">Reason: <b>${escapeHtml(r.reason)}</b>${r.note ? ` — "${escapeHtml(r.note)}"` : ''}</div>
        </div>
        <div style="text-align:right;">
          <div>${actionLabel}</div>
        </div>
      </div>
    `;
  }).join('');

  let statusBadge = req.status === 'pending'
    ? '<span class="badge" style="background:var(--warning-bg); color:var(--warning-text); border:1px solid var(--warning-border);">⏳ Pending Approval</span>'
    : (req.status === 'approved' ? '<span class="badge ok">✅ Approved</span>' : '<span class="badge danger">✕ Rejected</span>');

  const bodyHtml = `
    <div>
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:14px; padding-bottom:12px; border-bottom:1px solid var(--line);">
        <div>
          <div style="font-size:16px; font-weight:700; color:var(--ink); font-family:'Space Grotesk',monospace;">${escapeHtml(req.reqNumber)}</div>
          <div class="muted small" style="margin-top:2px;">Submitted on ${formatDateShort(req.date)} by <b>${escapeHtml(req.requestedBy)}</b></div>
        </div>
        <div>${statusBadge}</div>
      </div>

      ${req.batchNote ? `<div style="background:var(--surface-2); border:1px solid var(--line); border-radius:6px; padding:10px 14px; margin-bottom:14px; font-size:13px;"><b>Audit Note:</b> "${escapeHtml(req.batchNote)}"</div>` : ''}
      ${req.rejectReason ? `<div style="background:var(--danger-bg); border:1px solid var(--danger-border); color:var(--danger-text); border-radius:6px; padding:10px 14px; margin-bottom:14px; font-size:13px;"><b>Rejection Reason:</b> ${escapeHtml(req.rejectReason)}</div>` : ''}

      <div style="font-size:13px; font-weight:700; margin-bottom:8px;">Products (${rows.length}):</div>
      <div style="max-height:280px; overflow-y:auto; margin-bottom:12px;">
        ${rowsHtml}
      </div>
    </div>
  `;

  let footHtml = `<button class="btn secondary" onclick="closeModal()">Close</button>`;
  if (isPending && isAdmin) {
    footHtml = `
      <button class="btn secondary danger" onclick="closeModal(); if(typeof openRejectAdjRequestModal==='function'){ openRejectAdjRequestModal('${req.id}'); } else { confirmRejectAdjRequest('${req.id}'); }">✕ Reject Request</button>
      <button class="btn" onclick="closeModal(); confirmApproveAdjRequest('${req.id}')">✓ Approve & Apply</button>
    `;
  }

  openModal(`Adjustment Request Details`, bodyHtml, footHtml);
}

function renderAdjRequestsViewHtml() {
  const allReqs = (db.adjustmentRequests || []).slice().sort((a, b) => new Date(b.date) - new Date(a.date));
  const counts = {
    all: allReqs.length,
    pending: allReqs.filter(r => r.status === 'pending').length,
    approved: allReqs.filter(r => r.status === 'approved').length,
    rejected: allReqs.filter(r => r.status === 'rejected').length
  };

  let list = allReqs;
  if (adjRequestFilterStatus !== 'all') {
    list = list.filter(r => r.status === adjRequestFilterStatus);
  }

  const isAdmin = currentUser && currentUser.role === 'admin';
  const reqPag = paginateArray(list, 'adj_requests', {
    onUpdate: renderBulkAdjustmentView,
    scrollTarget: '#bulk-adj-container',
    recordLabel: 'requests'
  });

  return `
    <div class="panel" style="margin-top:0; border:none; box-shadow:none;">
      <!-- Filter and Status Pills -->
      <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:14px; flex-wrap:wrap;">
        <div style="display:flex; gap:6px;">
          <button type="button" class="btn ${adjRequestFilterStatus === 'all' ? 'secondary' : 'ghost'} small" onclick="setAdjReqFilter('all')">
            All (${counts.all})
          </button>
          <button type="button" class="btn ${adjRequestFilterStatus === 'pending' ? 'secondary' : 'ghost'} small" style="${adjRequestFilterStatus === 'pending' ? 'border-color:#F59E0B; color:var(--warning-text);' : ''}" onclick="setAdjReqFilter('pending')">
            ⏳ Pending (${counts.pending})
          </button>
          <button type="button" class="btn ${adjRequestFilterStatus === 'approved' ? 'secondary' : 'ghost'} small" onclick="setAdjReqFilter('approved')">
            ✅ Approved (${counts.approved})
          </button>
          <button type="button" class="btn ${adjRequestFilterStatus === 'rejected' ? 'secondary' : 'ghost'} small" onclick="setAdjReqFilter('rejected')">
            ✕ Rejected (${counts.rejected})
          </button>
        </div>
        <div>
          <button type="button" class="btn small" onclick="switchAdjView('entry')">
            + New Adjustment Entry
          </button>
        </div>
      </div>

      <div class="table-scroll" style="background:var(--surface); border:1px solid var(--line); border-radius:var(--radius-sm);">
        <table style="width:100%; border-collapse:collapse;">
          <thead>
            <tr style="background:var(--surface-2);">
              <th style="padding:10px 14px; text-align:left;">Request # &amp; Date</th>
              <th style="padding:10px 14px; text-align:left;">Requested By</th>
              <th style="padding:10px 14px; text-align:left;">Items Summary</th>
              <th style="padding:10px 14px; text-align:left;">Status</th>
              <th style="padding:10px 14px; text-align:center;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${(reqPag.pagedItems || reqPag.pageItems || []).length ? (reqPag.pagedItems || reqPag.pageItems || []).map(req => {
    const rows = safeParseAdjRows(req);
    const dateStr = formatDateShort(req.date);
    const isPending = req.status === 'pending';
    const isApproved = req.status === 'approved';
    const isRejected = req.status === 'rejected';

    let statusBadge = '';
    if (isPending) {
      statusBadge = '<span class="badge" style="background:var(--warning-bg); color:var(--warning-text); border:1px solid var(--warning-border);">⏳ Awaiting Admin Approval</span>';
    } else if (isApproved) {
      statusBadge = `<span class="badge ok" title="Approved at ${formatDateShort(req.reviewedAt)}">✅ Approved ${req.reviewedBy ? 'by ' + escapeHtml(req.reviewedBy) : ''}</span>`;
    } else {
      statusBadge = `<span class="badge danger" title="${escapeHtml(req.rejectReason || 'Rejected')}">✕ Rejected ${req.reviewedBy ? 'by ' + escapeHtml(req.reviewedBy) : ''}</span>`;
    }

    // Mini summary of rows
    const summaryItems = rows.slice(0, 2).map(r => {
      const p = productById(r.productId);
      const pName = p ? p.name : 'Unknown';
      const isAdd = r.reason === 'Count Correction (add)';
      const isOpened = r.reason === 'Dispose Opened / Used Stock' || (!isAdd && isOpenedSizeValue(r.size));
      const sign = isAdd ? '+' : '-';
      const unit = isOpened ? 'L' : (r.qty === 1 ? ' unit' : ' units');
      return `<div style="font-size:12px; line-height:1.3;">• <b>${escapeHtml(pName)}</b>: ${sign}${r.qty}${unit} (${escapeHtml(r.reason)})</div>`;
    }).join('');
    const moreText = rows.length > 2 ? `<div class="muted small" style="margin-top:2px;">+ ${rows.length - 2} more item(s)...</div>` : '';

    return `
                <tr style="border-bottom:1px solid var(--line);">
                  <td style="padding:12px 14px; vertical-align:top;">
                    <div style="font-weight:700; font-family:'Space Grotesk',monospace; color:var(--ink);">${escapeHtml(req.reqNumber)}</div>
                    <div class="muted small" style="margin-top:2px;">${dateStr}</div>
                  </td>
                  <td style="padding:12px 14px; vertical-align:top;">
                    <div style="font-weight:600; color:var(--ink);">${escapeHtml(req.requestedBy)}</div>
                    <div class="muted small">${req.role === 'staff' ? 'Inventory Staff' : escapeHtml(req.role)}</div>
                  </td>
                  <td style="padding:12px 14px; vertical-align:top;">
                    ${summaryItems}
                    ${moreText}
                    ${req.batchNote ? `<div class="muted small" style="margin-top:4px; font-style:italic;">"${escapeHtml(req.batchNote)}"</div>` : ''}
                  </td>
                  <td style="padding:12px 14px; vertical-align:top;">
                    ${statusBadge}
                    ${isRejected && req.rejectReason ? `<div class="muted small" style="color:var(--danger); margin-top:4px;">Reason: ${escapeHtml(req.rejectReason)}</div>` : ''}
                  </td>
                  <td style="padding:12px 14px; vertical-align:top; text-align:center; white-space:nowrap;">
                    ${isPending && isAdmin ? `
                      <button type="button" class="btn small" style="padding:4px 10px; margin-right:4px;" onclick="confirmApproveAdjRequest('${req.id}')" title="Approve adjustment and update stock">✓ Approve</button>
                      <button type="button" class="btn secondary small danger" style="padding:4px 10px; margin-right:4px;" onclick="confirmRejectAdjRequest('${req.id}')" title="Reject this adjustment request">✕ Reject</button>
                    ` : ''}
                    <button type="button" class="btn ghost small" style="padding:4px 8px;" onclick="viewAdjRequestDetails('${req.id}')">👁️ View Details</button>
                  </td>
                </tr>
              `;
  }).join('') : `
              <tr>
                <td colspan="5" style="text-align:center; padding:32px 14px; color:var(--ink-soft);">
                  No stock adjustment requests found matching this filter.
                </td>
              </tr>
            `}
          </tbody>
        </table>
      </div>
      ${reqPag.html}
    </div>
  `;
}

let _pendingReceivingPayload = null;

function openReceivingFinalConfirmModal(po, items, batchQtys, batchMeta, damageMeta) {
  let totalOrdered = 0;
  let totalDelivered = 0;
  let totalAccepted = 0;
  let totalDamaged = 0;
  let totalRemainingAfter = 0;

  const lineRowsHtml = items.map((item, i) => {
    const ordered = Number(item.qty || 0);
    const alreadyAccepted = Number(item.receivedQty !== undefined ? item.receivedQty : (po.status === 'received' ? ordered : 0));
    const dm = damageMeta[i] || { deliveredQty: 0, acceptedQty: 0, damagedQty: 0, reason: '', handling: 'returned_to_driver', inspectionNotes: '' };
    const delivered = Number(dm.deliveredQty || 0);
    const accepted = Number(dm.acceptedQty || 0);
    const damaged = Number(dm.damagedQty || 0);
    const remAfter = Math.max(0, Number((ordered - (alreadyAccepted + accepted)).toFixed(2)));
    const size = Number(item.size) || 1;

    totalOrdered += ordered;
    totalDelivered += delivered;
    totalAccepted += accepted;
    totalDamaged += damaged;
    totalRemainingAfter += remAfter;

    const handlingLabel = damaged > 0
      ? (dm.handling === 'returned_to_driver' ? 'Returned to Driver' : 'Quarantined')
      : '—';

    return `
      <tr>
        <td><b>${escapeHtml(item.productName || 'Item')}</b> <span class="sr-size-pill">${size}L</span></td>
        <td class="right">${formatStock(ordered)}</td>
        <td class="right"><b>${formatStock(delivered)}</b></td>
        <td class="right" style="color:var(--success); font-weight:700;">${formatStock(accepted)}</td>
        <td class="right" style="color:${damaged > 0 ? 'var(--danger)' : 'var(--ink-soft)'}; font-weight:700;">${formatStock(damaged)}</td>
        <td class="right">${formatStock(remAfter)}</td>
        <td>
          ${damaged > 0
            ? `<div style="font-size:11.5px; font-weight:600; color:var(--danger-text);">${escapeHtml(dm.reason)}</div><div class="muted small">${escapeHtml(handlingLabel)}${dm.inspectionNotes ? ' · ' + escapeHtml(dm.inspectionNotes) : ''}</div>`
            : (batchMeta[i] && batchMeta[i].notes ? `<span class="muted small">${escapeHtml(batchMeta[i].notes)}</span>` : '<span class="muted small">Passed</span>')}
        </td>
      </tr>`;
  }).join('');

  const receivingTxKey = `rcvtx_${po.id}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  _pendingReceivingPayload = { po, batchQtys, batchMeta, damageMeta, receivingTxKey };

  const bodyHtml = `
    <div style="margin-bottom:10px;">
      <div style="font-weight:700; font-size:15px; color:var(--ink); font-family:'Space Grotesk',monospace;">${escapeHtml(po.poNumber)} — ${escapeHtml(po.supplierName)}</div>
      <div class="muted small">Review the physical inspection counts below before posting accepted quantities to sellable inventory.</div>
    </div>

    <div class="rcv-confirm-kpi-grid">
      <div class="rcv-confirm-kpi">
        <span class="lbl">Total Ordered</span>
        <span class="val">${formatStock(totalOrdered)}</span>
      </div>
      <div class="rcv-confirm-kpi">
        <span class="lbl">Total Delivered</span>
        <span class="val">${formatStock(totalDelivered)}</span>
      </div>
      <div class="rcv-confirm-kpi good">
        <span class="lbl">Total Accepted</span>
        <span class="val">${formatStock(totalAccepted)}</span>
      </div>
      <div class="rcv-confirm-kpi ${totalDamaged > 0 ? 'damaged' : ''}">
        <span class="lbl">Damaged / Rej.</span>
        <span class="val">${formatStock(totalDamaged)}</span>
      </div>
      <div class="rcv-confirm-kpi">
        <span class="lbl">Remaining / Pending</span>
        <span class="val">${formatStock(totalRemainingAfter)}</span>
      </div>
    </div>

    <div class="table-scroll" style="margin:12px 0; border:1px solid var(--line); border-radius:var(--radius-sm); max-height:240px; overflow-y:auto;">
      <table class="sr-table">
        <thead>
          <tr>
            <th>Product</th>
            <th class="right">Ordered</th>
            <th class="right">Delivered</th>
            <th class="right">Accepted</th>
            <th class="right">Damaged</th>
            <th class="right">Pending</th>
            <th>Inspection / Handling</th>
          </tr>
        </thead>
        <tbody>${lineRowsHtml}</tbody>
      </table>
    </div>

    <label class="rcv-inspect-attest">
      <input type="checkbox" id="rcv-confirm-inspect-cb" onchange="toggleReceivingFinalConfirmBtn()">
      <span>I confirm that <b>physical inspection and counting have been completed</b>${totalDamaged > 0 ? `, all <b>${formatStock(totalDamaged)} damaged/rejected unit(s)</b> are physically returned or documented for return (a linked Supplier Replacement Request will be auto-generated as <b>Awaiting Supplier Confirmation</b>)` : ''}, and only <b>${formatStock(totalAccepted)} accepted unit(s)</b> should be posted to sellable inventory &amp; FIFO batches.</span>
    </label>
  `;

  const footHtml = `
    <button type="button" class="btn secondary" onclick="_pendingReceivingPayload = null; closeModal();">Cancel</button>
    <button type="button" class="btn" id="rcv-final-confirm-btn" disabled onclick="executeConfirmedPOReceiving()">✓ Confirm &amp; Post to Inventory</button>
  `;

  openModal('Final Receiving Inspection Confirmation', bodyHtml, footHtml);
}

function toggleReceivingFinalConfirmBtn() {
  const cb = document.getElementById('rcv-confirm-inspect-cb');
  const btn = document.getElementById('rcv-final-confirm-btn');
  if (btn) btn.disabled = !(cb && cb.checked);
}

async function executeConfirmedPOReceiving() {
  if (window._isSubmittingReceiving || !_pendingReceivingPayload) return;
  const cb = document.getElementById('rcv-confirm-inspect-cb');
  if (!cb || !cb.checked) {
    showToast('Please confirm that physical inspection has been completed.', 'error');
    return;
  }

  const { po, batchQtys, batchMeta, damageMeta, receivingTxKey } = _pendingReceivingPayload;
  _pendingReceivingPayload = null; // Prevent duplicate execution immediately
  window._isSubmittingReceiving = true;

  const confirmBtn = document.getElementById('rcv-final-confirm-btn');
  const rcvBtn = document.getElementById('btn-submit-rcv');
  if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Posting…'; }
  if (rcvBtn) rcvBtn.disabled = true;

  try {
    const result = await completePOReceiving(po, '', batchQtys, batchMeta, damageMeta, receivingTxKey);
    rcvBatchDraft = {};
    closeModal();

    const parts = [];
    if (result.totalAcceptedUnits > 0) parts.push(`${result.totalAcceptedUnits} accepted added to stock`);
    if (result.totalDamagedUnits > 0) parts.push(`${result.totalDamagedUnits} damaged/rejected excluded`);
    if (result.autoReplacementRefs && result.autoReplacementRefs.length) {
      parts.push(`Replacement Request ${result.autoReplacementRefs.join(', ')} auto-generated`);
    }
    if (result.autoReturnRef) parts.push(`Return ${result.autoReturnRef} logged`);
    const summarySuffix = parts.length ? ` (${parts.join(', ')})` : '';

    const updatedPO = (db.purchaseOrders || []).find(o => o.id === po.id);
    const replPending = !!(updatedPO && hasPOReplacementPending(updatedPO));
    if (result.allCompleted) {
      receivingPOId = '';
      showToast(`PO ${po.poNumber} confirmed as fully received${summarySuffix}.`, 'ok');
    } else if (replPending) {
      showToast(`PO ${po.poNumber} is Partially Received – Replacement Pending${summarySuffix}.`, 'ok');
    } else {
      showToast(`PO ${po.poNumber} inspection posted${summarySuffix}. Remaining undelivered units stay Pending.`, 'ok');
    }
    renderPage();
  } finally {
    window._isSubmittingReceiving = false;
    if (rcvBtn) rcvBtn.disabled = false;
  }
}

async function submitMovement(e) {
  e.preventDefault();
  const type = document.getElementById('mv-type').value;
  const date = nowISO();

  if (type === 'receiving') {
    if (window._isSubmittingReceiving) return false;
    const poSel = document.getElementById('mv-po');
    const po = (db.purchaseOrders || []).find(o => poSel && o.id === poSel.value);
    if (!po || (po.status !== 'ordered' && po.status !== 'partial')) {
      showToast('Please select an approved purchase order to confirm.', 'error');
      return false;
    }

    const items = getPOItems(po);
    const batchQtys = {};
    const batchMeta = {};
    const damageMeta = {};
    let totalToReceive = 0;

    for (let i = 0; i < items.length; i++) {
      const input = document.getElementById(`rcv-qty-input-${i}`);
      const accEl = document.getElementById(`rcv-accepted-input-${i}`);
      const dmgEl = document.getElementById(`rcv-damaged-input-${i}`);
      const rawDelivered = input ? Math.max(0, parseFloat(input.value) || 0) : 0;
      const rawAccepted = accEl ? Math.max(0, parseFloat(accEl.value) || 0) : rawDelivered;
      const rawDamaged = dmgEl ? Math.max(0, parseFloat(dmgEl.value) || 0) : 0;

      if ((rawDelivered > 0 && !Number.isInteger(rawDelivered)) ||
        (rawAccepted > 0 && !Number.isInteger(rawAccepted)) ||
        (rawDamaged > 0 && !Number.isInteger(rawDamaged))) {
        showToast(`Quantities for "${items[i].productName || 'Item'}" must be whole numbers of containers.`, 'error');
        return false;
      }
      const valDelivered = Math.floor(rawDelivered);
      const valAccepted = Math.floor(rawAccepted);
      const valDamaged = Math.floor(rawDamaged);

      if (valDelivered !== (valAccepted + valDamaged)) {
        showToast(`Validation failed for "${items[i].productName || 'Item'}": Delivered (${valDelivered}) must equal Accepted (${valAccepted}) + Damaged (${valDamaged}).`, 'error');
        return false;
      }

      batchQtys[i] = valDelivered;
      totalToReceive += valDelivered;

      const dmgReasonEl = document.getElementById(`rcv-dmg-reason-${i}`);
      const dmgHandlingEl = document.getElementById(`rcv-dmg-handling-${i}`);
      const dmgNoteEl = document.getElementById(`rcv-dmg-note-${i}`);
      const dmgReason = dmgReasonEl ? dmgReasonEl.value : '';
      const dmgHandling = dmgHandlingEl ? dmgHandlingEl.value : 'returned_to_driver';
      const dmgNote = dmgNoteEl ? dmgNoteEl.value.trim() : '';
      const ordered = Number(items[i].qty || 0);
      const alreadyAccepted = Number(items[i].receivedQty !== undefined ? items[i].receivedQty : (po.status === 'received' ? ordered : 0));
      const activeRepPending = (typeof getPOItemActiveReplacementPending === 'function')
        ? Number(getPOItemActiveReplacementPending(po.id, items[i]) || 0)
        : Math.max(0, Number(items[i].replacementRequestedQty || 0) - Number(items[i].replacementReceivedQty || 0));
      const remaining = Math.max(0, Number((ordered - alreadyAccepted - activeRepPending).toFixed(2)));

      if (valDelivered > remaining) {
        showToast(`Actual Delivered (${valDelivered}) for "${items[i].productName || 'Item'}" cannot exceed remaining PO quantity (${remaining}).`, 'error');
        return false;
      }
      if (valAccepted > valDelivered) {
        showToast(`Accepted quantity (${valAccepted}) cannot exceed Actual Delivered (${valDelivered}).`, 'error');
        return false;
      }
      if (valDamaged > valDelivered) {
        showToast(`Damaged / Rejected quantity (${valDamaged}) cannot exceed Actual Delivered (${valDelivered}).`, 'error');
        return false;
      }
      if (valDamaged > 0 && !dmgReason) {
        showToast(`Please select a Damage / Rejection Reason for "${items[i].productName || 'Item'}".`, 'error');
        if (dmgReasonEl) dmgReasonEl.focus();
        return false;
      }
      damageMeta[i] = {
        damagedQty: valDamaged,
        acceptedQty: valAccepted,
        deliveredQty: valDelivered,
        reason: dmgReason,
        handling: dmgHandling,
        inspectionNotes: dmgNote
      };

      const exEl = document.getElementById(`rcv-exp-input-${i}`);
      const ntEl = document.getElementById(`rcv-note-input-${i}`);
      const expVal = exEl ? (exEl.value || '').trim() : '';
      const noteText = ntEl ? ntEl.value.trim() : '';

      if (valAccepted > 0) {
        if (!expVal) {
          showToast(`Expiration Date is required for "${items[i].productName || 'Item'}" before confirming accepted stock.`, 'error');
          if (exEl) exEl.focus();
          return false;
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(expVal)) {
          showToast(`Invalid expiration date format for "${items[i].productName || 'Item'}".`, 'error');
          if (exEl) exEl.focus();
          return false;
        }
        const [ey, em, ed] = expVal.split('-').map(Number);
        const chkD = new Date(ey, em - 1, ed);
        if (chkD.getFullYear() !== ey || chkD.getMonth() !== (em - 1) || chkD.getDate() !== ed) {
          showToast(`Invalid calendar date for "${items[i].productName || 'Item'}".`, 'error');
          if (exEl) exEl.focus();
          return false;
        }
        if (expVal < todayISO()) {
          showToast(`Expiration date (${expVal}) for "${items[i].productName || 'Item'}" cannot be earlier than the receiving date (${todayISO()}).`, 'error');
          if (exEl) exEl.focus();
          return false;
        }
      }
      batchMeta[i] = {
        batchNumber: '',
        expirationDate: expVal || '',
        notes: noteText
      };
    }

    if (totalToReceive <= 0) {
      showToast('Please enter at least one Actual Delivered quantity greater than 0.', 'error');
      return false;
    }

    // Open Final Inspection Confirmation Modal before posting to inventory
    openReceivingFinalConfirmModal(po, items, batchQtys, batchMeta, damageMeta);
    return false;
  }
  else if (type === 'adjustment') {
    return confirmAndSubmitAdjustments();
  }
  else if (type === 'colormix') {
    const colorEl = document.getElementById('mv-color');
    if (!colorEl) return false;
    const color = colorEl.value.trim() || 'Unnamed color';
    const litersEl = document.getElementById('mv-liters');
    const liters = litersEl ? (Number(litersEl.value) || 0) : 0;
    if (liters <= 0) {
      showToast('Enter valid liters for color mixing.', 'error');
      return false;
    }
    const noteEl = document.getElementById('mv-note-c');
    db.movements.push({
      id: uid('mv'),
      date,
      type: 'colormix',
      productId: null,
      productName: 'Color Mix — ' + color,
      colorName: color,
      qtyChange: liters,
      note: noteEl ? noteEl.value.trim() : '',
      staffName: (currentUser && currentUser.name) || 'Staff'
    });
    await saveDB();
    showToast('Color mixing service logged.', 'ok');
    renderPage();
    return false;
  }
}