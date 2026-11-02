/* ============================================================
   17. STOCK RECEIVING / ADJUSTMENTS (inventory staff)
   ============================================================ */
let bulkAdjustmentRows = [];
let bulkAdjSupplierFilter = '';
let bulkAdjBatchNote = '';
let receivingPOId = '';
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

// Stock Adjustment Quantity Safeguards (Option 1: Prevent 100% stock wipeout & cap manual adjustments)
const MAX_ADJ_DEDUCT_CANS = 5;     // Max sealed cans deductible per adjustment entry
const MAX_ADJ_DEDUCT_RATIO = 0.5;  // Max 50% of available cans/stock deductible at once (never wipes out 100% of stock)
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
  const maxByCans = Math.floor(availCans * MAX_ADJ_DEDUCT_RATIO);
  const maxByStock = Math.floor((currentStock * MAX_ADJ_DEDUCT_RATIO) / sizeNum);
  return Math.max(0, Math.min(MAX_ADJ_DEDUCT_CANS, maxByCans, maxByStock));
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
  if (!bulkAdjustmentRows || bulkAdjustmentRows.length === 0) {
    bulkAdjustmentRows = [
      { id: uid('adj'), productId: '', reason: 'Damaged', size: 1, qty: 1, note: '' }
    ];
  } else {
    bulkAdjustmentRows.forEach(r => {
      if (r.size === undefined || r.size === null || r.size === '') {
        r.size = r.reason === 'Dispose Opened / Used Stock' ? openedValueForSize(1) : 1;
      }
    });
  }
}

function receivingPage() {
  initBulkAdjustmentRows();
  const supplierOptions = db.suppliers
    .filter(s => s.status === 'active')
    .map(s => {
      const linkedCount = (s.productIds || []).filter(pid => productById(pid)).length;
      return `<option value="${s.id}">${escapeHtml(s.name)} (${linkedCount} products)</option>`;
    })
    .join('');

  // Drop a stale selection if that PO is no longer open
  const openPOs = openPOsForReceiving();
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
            🎨 Color Mixing
          </button>
        </div>

        <!-- Stock Receiving -->
        <div id="mv-fields-receiving">
          <div id="rcv-po-container"></div>
          <button id="btn-submit-rcv" class="btn" style="margin-top:14px; padding:9px 22px; font-weight:600;" type="submit" disabled>Confirm Delivery Received</button>
        </div>

    <!-- Stock Adjustment -->
    <div id="mv-fields-adjustment" class="hidden" style="margin-top:14px;">
      <!-- Sub-view navigation between Form & Requests -->
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; gap:10px; flex-wrap:wrap;">
        <div style="display:inline-flex; background:#FAF7F2; padding:3px; border-radius:8px; border:1px solid var(--line);">
          <button type="button" class="btn ${adjActiveView === 'entry' ? '' : 'ghost'} small" style="${adjActiveView === 'entry' ? 'box-shadow:var(--shadow-sm);' : ''}" onclick="switchAdjView('entry')">
            ✏️ Adjustment Form
          </button>
          <button type="button" class="btn ${adjActiveView === 'requests' ? '' : 'ghost'} small" style="${adjActiveView === 'requests' ? 'box-shadow:var(--shadow-sm);' : ''}" onclick="switchAdjView('requests')">
            📋 Approval Requests ${pendingAdjRequests().length > 0 ? `<span class="rcv-tab-count" style="margin-left:4px;">${pendingAdjRequests().length}</span>` : `(${(db.adjustmentRequests || []).length})`}
          </button>
        </div>
        ${pendingAdjRequests().length > 0 && currentUser && currentUser.role === 'admin' ? `
          <div style="font-size:12px; color:#92400E; font-weight:600; display:flex; align-items:center; gap:6px;">
            <span>⏳ <b>${pendingAdjRequests().length}</b> stock adjustment request(s) awaiting Admin approval</span>
          </div>
        ` : ''}
        ${pendingAdjRequests().length > 0 && currentUser && currentUser.role === 'staff' ? `
          <div style="font-size:12px; color:#92400E; font-weight:600; display:flex; align-items:center; gap:6px;">
            <span>⏳ <b>${pendingAdjRequests().length}</b> adjustment request(s) pending Admin review</span>
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
  <div class="panel">
<div class="panel-head row">
  <h3>Recent Stock Movements</h3>
  <div class="spacer"></div>
  <span class="muted small">Latest 15 orders / batches</span>
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

function pendingPOsCount() {
  return (db.purchaseOrders || []).filter(o => o.status === 'pending').length;
}

function openedStockShelfHtml() {
  const openedProducts = (db.products || []).filter(p => productOpenedStock(p) > 0);
  // One shelf row per product AND can size (each opened can size is tracked separately)
  const openedList = openedProducts.flatMap(p => productOpenedEntries(p).map(e => ({ p, ...e })));
  const totalLiters = openedList.reduce((sum, r) => sum + r.left, 0);

  return `
  <div style="background:#FFFDF9; border:1px solid #E8DEC8; border-radius:var(--radius); padding:14px 16px; margin-bottom:14px;">
    <div class="row wrap" style="justify-content:space-between; align-items:center; gap:10px; margin-bottom:${openedList.length ? '12px' : '4px'};">
      <div>
        <div style="font-weight:700; font-size:14px; color:var(--ink); display:flex; align-items:center; gap:8px;">
          <span>🫙 Opened / Used Stock Shelf (For Future Color Mixing)</span>
          <span class="badge" style="background:#FDF4E3; color:#9A6216; border:1px solid #F0D9B5;">
            ${openedList.length} can${openedList.length === 1 ? '' : 's'} · ${formatLiters(totalLiters)} available
          </span>
        </div>
        <div class="muted small" style="margin-top:2px;">
          Leftover paint from previously opened cans during Color Mixing. The Mixing Studio automatically uses these first before opening a new sealed can.
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
              <th class="center">Opened Can Size</th>
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
                    <span>${escapeHtml(p.name)} <code style="font-size:11px; color:var(--teal);">(${hex})</code></span>
                  </div>
                </td>
                <td>${escapeHtml(p.brand)}</td>
                <td class="center"><span class="badge" style="background:#F4EFE6; color:#6B6259; font-weight:700;">🥫 ${canSize}L Can</span></td>
                <td class="right" style="color:#C1443D; font-weight:700; font-family:'Space Grotesk',sans-serif;">${formatLiters(used)} used</td>
                <td class="right"><span class="badge" style="background:#FDF4E3; color:#9A6216; border:1px solid #F0D9B5; font-weight:700;">🫙 ${formatLiters(opened)} left</span></td>
                <td class="right">${formatLiters(p.stock)}</td>
                <td class="right">
                  <button type="button" class="btn ghost small" style="color:var(--danger); font-size:11.5px;" onclick="disposeOpenedStock('${p.id}', ${canSize})" title="Dispose dried or unusable leftover paint from this ${canSize}L opened can">🗑️ Dispose</button>
                </td>
              </tr>`;
  }).join('')}
          </tbody>
        </table>
      </div>
    ` : `<div class="muted small" style="padding:6px 0;">No opened cans on the mixing shelf right now. When a sealed can is opened for a partial color mix, the remaining liters will appear here automatically.</div>`}
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
      await saveDB();
      showToast(`Disposed ${formatLiters(opened)} of opened ${p.name}.`, 'ok');
      renderPage();
    }
  });
}

function onReceivingPOChange() {
  const sel = document.getElementById('mv-po');
  if (!sel) return;
  receivingPOId = sel.value;
  renderReceivingPOPreview();
}

function renderReceivingPOPreview() {
  const container = document.getElementById('rcv-po-container');
  const submitBtn = document.getElementById('btn-submit-rcv');
  if (!container) return;

  const openPOs = openPOsForReceiving();
  if (!openPOs.length) {
    if (submitBtn) submitBtn.disabled = true;
    container.innerHTML = `<div class="muted small" style="padding:24px 0; text-align:center;">✓ No approved purchase orders currently awaiting delivery.</div>`;
    return;
  }

  const po = receivingPOId ? openPOs.find(o => o.id === receivingPOId) : openPOs[0];
  if (po && po.id !== receivingPOId) receivingPOId = po.id;
  if (submitBtn) submitBtn.disabled = false;

  const items = getPOItems(po);
  let totalRemainingCans = 0;

  const rowsHtml = items.map((item, i) => {
    const product = productById(item.productId);
    const currentStock = product ? Number(product.stock) || 0 : 0;
    const ordered = Number(item.qty || 0);
    const alreadyReceived = Number(item.receivedQty !== undefined ? item.receivedQty : (po.status === 'received' ? ordered : 0));
    const remaining = Math.max(0, Number((ordered - alreadyReceived).toFixed(2)));
    const size = Number(item.size) || 1;
    const curCans = product ? productCanCount(product, size) : 0;
    const newCans = curCans + remaining;
    const addedLiters = Number((remaining * size).toFixed(2));
    totalRemainingCans += remaining;

    const hex = product ? getProductHex(product) : '#CCCCCC';
    const isDone = remaining === 0;

    return `
    <div class="rcv-item-row ${isDone ? 'done' : ''}">
      <!-- Left: Dot + Title + Can Size -->
      <div class="rcv-item-identity">
        <span class="rcv-item-dot" style="background:${hex};" title="${hex}"></span>
        <div>
          <div class="rcv-item-name">${escapeHtml(item.productName)}</div>
          <div class="rcv-item-sub">
            <span>${escapeHtml(item.brand || '')}</span>
            <span>·</span>
            <span class="badge" style="background:#F4EFE6; color:#6B6259; font-weight:700; padding:1px 6px; font-size:11px;">🥫 ${size}L</span>
            ${product ? `<span>· In stock: <b>${curCans}</b></span>` : ''}
          </div>
        </div>
      </div>

      <!-- Middle: Clean Progress -->
      <div class="rcv-item-progress">
        <span class="muted">${formatStock(alreadyReceived)}/${formatStock(ordered)} received</span>
        ${remaining > 0 ? ` · <b style="color:#C1443D;">${formatStock(remaining)} pending</b>` : ' · <span style="color:var(--success); font-weight:600;">✓ Done</span>'}
      </div>

      <!-- Right: Stepper + Live Pill -->
      <div class="rcv-item-actions">
        <div class="rcv-stepper-compact">
          <button type="button" class="rcv-stepper-btn" onclick="stepReceivingQty(${i}, -1)" ${isDone ? 'disabled' : ''}>−</button>
          <input type="number" id="rcv-qty-input-${i}" class="rcv-stepper-input" min="0" max="${remaining}" step="1" value="${remaining}"
            ${isDone ? 'disabled' : ''}
            oninput="onReceivingQtyChange(${i}, ${currentStock}, ${size}, ${curCans})">
          <button type="button" class="rcv-stepper-btn" onclick="stepReceivingQty(${i}, 1)" ${isDone ? 'disabled' : ''}>+</button>
        </div>
        ${remaining > 0 ? `<button type="button" class="btn ghost small" style="padding:2px 7px; font-size:11px;" onclick="setReceivingQtyMax(${i})">All</button>` : ''}
        
        <div id="rcv-stock-preview-${i}" class="rcv-item-pill ${remaining > 0 ? 'add' : 'done'}">
          ${product && remaining > 0
        ? `➔ ${newCans} cans (+${formatLiters(addedLiters)})`
        : (isDone ? '✓ Fully Received' : 'No change')}
        </div>
      </div>
    </div>`;
  }).join('');

  container.innerHTML = `
    <!-- Minimalist PO Toolbar -->
    <div class="rcv-minimal-toolbar">
      <div class="row wrap" style="align-items:center; gap:10px;">
        <span style="font-size:12px; font-weight:700; color:var(--ink-soft); text-transform:uppercase; letter-spacing:0.4px;">Order:</span>
        <select id="mv-po" onchange="onReceivingPOChange()" class="rcv-minimal-select">
          ${openPOs.map(o => `<option value="${o.id}" ${o.id === po.id ? 'selected' : ''}>${escapeHtml(o.poNumber)}${o.status === 'partial' ? ' [Partial]' : ''} — ${escapeHtml(o.supplierName)} (${peso(o.totalAmount)})</option>`).join('')}
        </select>
        <span class="badge" style="background:#EBF5F4; color:#1F6F6B; font-weight:600; font-size:11.5px;">${totalRemainingCans} cans pending</span>
      </div>
      <div class="row" style="gap:6px;">
        <button type="button" class="btn ghost small" onclick="fillReceivingPageQtys(true)">⚡ Receive All</button>
        <button type="button" class="btn ghost small" onclick="fillReceivingPageQtys(false)">Reset</button>
      </div>
    </div>

    <!-- Minimalist Checklist Rows -->
    <div class="rcv-minimal-list">
      ${rowsHtml}
    </div>

    <!-- Delivery Reference / Receipt Note -->
    <div style="margin-top:14px; padding:10px 14px; background:#FAF8F5; border:1px solid var(--line); border-radius:var(--radius-sm); display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
      <label for="mv-batch-note-r" style="font-size:12.5px; font-weight:600; color:var(--ink-soft); white-space:nowrap;">Delivery Note / DR # (optional):</label>
      <input type="text" id="mv-batch-note-r" class="simple-note-input" placeholder="e.g. DR #10482, Delivered by Apex Trucking..." style="flex:1; min-width:220px; font-size:12.5px; padding:6px 10px; margin:0; background:#fff;">
    </div>
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

function onReceivingQtyChange(idx, currentStock, size = 1, curCans = 0) {
  const input = document.getElementById(`rcv-qty-input-${idx}`);
  const preview = document.getElementById(`rcv-stock-preview-${idx}`);
  if (!input || !preview) return;
  const max = parseFloat(input.max) || 0;
  let val = Math.max(0, parseFloat(input.value) || 0);
  if (val > max) {
    val = max;
    input.value = max;
    showToast(`Cannot receive more than remaining (${max} × ${size}L).`, 'error');
  }
  const addedLiters = Number((val * size).toFixed(2));
  const newCans = curCans + val;
  if (val > 0) {
    preview.className = 'rcv-item-pill add';
    preview.innerHTML = `➔ ${newCans} cans (+${formatLiters(addedLiters)})`;
  } else {
    preview.className = 'rcv-item-pill done';
    preview.innerHTML = `No change (0 cans)`;
  }
}

function fillReceivingPageQtys(isMax) {
  const po = receivingPOId ? openPOsForReceiving().find(o => o.id === receivingPOId) : null;
  if (!po) return;
  const items = getPOItems(po);
  items.forEach((item, i) => {
    const input = document.getElementById(`rcv-qty-input-${i}`);
    if (input && !input.disabled) {
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
  if (bulkAdjSupplierFilter) {
    const supplier = db.suppliers.find(s => s.id === bulkAdjSupplierFilter);
    if (supplier) {
      bulkAdjustmentRows.forEach(r => {
        if (r.productId && (!supplier.productIds || !supplier.productIds.includes(r.productId))) {
          r.productId = '';
        }
      });
    }
  }
  renderBulkAdjustmentView();
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
      subline: 'Real-time can count and liter changes will be previewed here before saving.'
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
      subline: isInvalid ? invalidMsg : `Deducts from the ${openedSize}L leftover pool (${formatLiters(curOpened)} ➔ ${formatLiters(newOpened)}). Sealed cans remain untouched.`
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
    invalidMsg = 'Please enter a valid number of cans (1 or more)';
  } else if (exceedsAddCap) {
    invalidMsg = `Maximum +${MAX_ADJ_ADD_CANS} cans allowed per manual adjustment (use Purchase Orders for supplier deliveries)`;
  } else if (!isAdd) {
    if (curCans <= 0 || currentStock <= 0) {
      invalidMsg = `No ${sizeNum}L cans in stock to deduct`;
    } else if (maxQty <= 0 && curCans === 1) {
      invalidMsg = `Protected: The last 1 can cannot be deducted (50% safety limit against accidental stockout)`;
    } else if (exceedsCans) {
      invalidMsg = `Only ${curCans} can(s) of ${sizeNum}L available in stock`;
    } else if (exceedsStock) {
      invalidMsg = `Exceeds total available inventory (${formatLiters(currentStock)})`;
    } else if (exceedsDeductCap) {
      invalidMsg = `Up to ${maxQty} can(s) can be deducted (50% / ${MAX_ADJ_DEDUCT_CANS}-can safety limit)`;
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
        ? `➕ Adding ${qtyNum} × ${sizeNum}L can${qtyNum === 1 ? '' : 's'} (+${formatLiters(litersAbs)})`
        : `🔻 Deducting ${qtyNum} × ${sizeNum}L can${qtyNum === 1 ? '' : 's'} (-${formatLiters(litersAbs)})`),
    subline: isInvalid
      ? invalidMsg
      : `📦 ${sizeNum}L Cans: ${curCans} ➔ <b>${newCans} cans</b> (Total stock: ${formatLiters(currentStock)} ➔ <b>${formatLiters(newStock)}</b>)`
  };
}

function switchAdjView(view) {
  adjActiveView = view;
  renderPage();
}

function setAdjReqFilter(filter) {
  adjRequestFilterStatus = filter;
  renderPage();
}

function renderBulkAdjustmentView() {
  const container = document.getElementById('bulk-adj-container');
  if (!container) return;

  if (adjActiveView === 'requests') {
    container.innerHTML = renderAdjRequestsViewHtml();
    return;
  }

  const supplier = bulkAdjSupplierFilter ? db.suppliers.find(s => s.id === bulkAdjSupplierFilter) : null;
  let availableProducts = activeProducts();
  if (supplier) {
    availableProducts = availableProducts.filter(p => supplier.productIds && supplier.productIds.includes(p.id));
  }

  const supplierOptions = db.suppliers
    .filter(s => s.status === 'active')
    .map(s => `<option value="${s.id}" ${s.id === bulkAdjSupplierFilter ? 'selected' : ''}>${escapeHtml(s.name)}</option>`)
    .join('');

  if (!bulkAdjustmentRows || bulkAdjustmentRows.length === 0) {
    bulkAdjustmentRows = [{ id: uid('adj'), productId: '', reason: 'Damaged', size: 1, qty: 1, note: '' }];
  }

  const validRows = bulkAdjustmentRows.filter(r => r.productId);
  let hasInvalidRows = false;
  validRows.forEach(r => {
    if (computeBulkAdjRowState(r).isInvalid) hasInvalidRows = true;
  });

  const cardsHtml = bulkAdjustmentRows.map((row, index) => {
    const state = computeBulkAdjRowState(row);
    const product = state.product;

    const productOptionsHtml = availableProducts.map(p => `
      <option value="${p.id}" ${p.id === row.productId ? 'selected' : ''}>
        ${escapeHtml(p.brand)} — ${escapeHtml(p.name)} (${p.color !== '-' ? escapeHtml(p.color) : 'Standard'}) [Stock: ${formatLiters(p.stock)}]
      </option>
    `).join('');

    return `
      <div class="simple-adj-card" id="simple-card-${index}">
        <div class="simple-adj-card-head">
          <span>📦 Item #${index + 1}${product ? `: ${escapeHtml(product.name)}` : ''}</span>
          ${bulkAdjustmentRows.length > 1 ? `
            <button type="button" class="btn ghost small" style="color:var(--danger); padding:2px 8px; font-size:12px;" onclick="removeBulkAdjRow(${index})">✕ Remove</button>
          ` : ''}
        </div>

        <div class="simple-adj-card-body">
          <div class="simple-adj-grid">
            <!-- Left Column: Product Selection, Reason, and Can Size -->
            <div class="simple-adj-col">
              <!-- Step 1: Product -->
              <div class="simple-form-group">
                <label class="simple-label">
                  <span>1. Select Product:</span>
                  ${product ? `<span class="simple-label-help">Total Stock: <b>${formatLiters(product.stock)}</b></span>` : `<span class="simple-label-help" style="color:var(--orange);">Required</span>`}
                </label>
                <select class="simple-select" onchange="updateBulkAdjRow(${index}, 'productId', this.value)">
                  <option value="">-- Choose Product to Adjust --</option>
                  ${productOptionsHtml}
                </select>
                ${product ? `
                  <div class="simple-stock-pills">
                    <span class="muted small" style="font-size:11.5px;">Current stock breakdown:</span>
                    ${productSizes(product).map(s => {
                      const c = productCanCount(product, s);
                      return `<span class="simple-stock-tag">🥫 ${s}L: <b>${c} can${c === 1 ? '' : 's'}</b></span>`;
                    }).join('')}
                    ${productOpenedStock(product) > 0 ? `
                      <span class="simple-stock-tag opened">🫙 ${formatLiters(productOpenedStock(product))} opened leftover</span>
                    ` : ''}
                  </div>
                ` : ''}
              </div>

              ${product ? `
                <!-- Step 2: Reason -->
                <div class="simple-form-group">
                  <label class="simple-label">
                    <span>2. Reason for Adjustment:</span>
                  </label>
                  <select class="simple-select" onchange="setAdjRowReason(${index}, this.value)">
                    <option value="Damaged" ${row.reason === 'Damaged' ? 'selected' : ''}>🔻 Damaged / Leaking Can (Deduct)</option>
                    <option value="Expired" ${row.reason === 'Expired' ? 'selected' : ''}>🔻 Expired Shelf Life (Deduct)</option>
                    <option value="Count Correction (deduct)" ${row.reason === 'Count Correction (deduct)' ? 'selected' : ''}>🔻 Missing / Inventory Count Shortage (Deduct)</option>
                    <option value="Internal Use" ${row.reason === 'Internal Use' ? 'selected' : ''}>🔻 Store / Internal Use (Deduct)</option>
                    <option value="Count Correction (add)" ${row.reason === 'Count Correction (add)' ? 'selected' : ''}>➕ Found Extra / Count Overage (Add)</option>
                    <option value="Dispose Opened / Used Stock" ${row.reason === 'Dispose Opened / Used Stock' ? 'selected' : ''}>🫙 Dispose Leftover Opened Paint (Deduct)</option>
                  </select>
                </div>

                <!-- Step 3: Can Size -->
                <div class="simple-form-group">
                  <label class="simple-label">
                    <span>3. Can Size:</span>
                    <span class="simple-label-help">${state.isOpened ? 'Opened leftover paint' : 'Sealed paint cans'}</span>
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
                            <span class="simple-size-name">🥫 ${s}L Can</span>
                            <span class="simple-size-stock">${state.isAdd ? `${cur} in stock` : (maxDeduct >= 1 ? `${cur} in stock · Max -${maxDeduct}` : (cur === 1 ? '1 can (Protected)' : '0 in stock'))}</span>
                          </button>
                        `;
                      }).join('')
                    )}
                  </div>
                </div>
              ` : `
                <div class="simple-guide-box">
                  <div class="simple-guide-title">ℹ️ How Stock Adjustment Works</div>
                  <div>Select a paint product from the dropdown above to adjust its inventory count. You can deduct damaged or expired cans, record store use, or add extra counts discovered during physical audits.</div>
                </div>
              `}
            </div>

            <!-- Right Column: Quantity, Live Preview, and Remarks -->
            <div class="simple-adj-col">
              ${product ? `
                <!-- Step 4: Quantity -->
                <div class="simple-form-group">
                  <label class="simple-label">
                    <span>4. Adjustment Quantity:</span>
                    <span class="simple-label-help">${state.isOpened ? 'in Liters' : 'in Cans'}</span>
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
                    <span class="simple-qty-unit">${state.isOpened ? 'Liters' : (state.qtyNum === 1 ? 'Can' : 'Cans')}</span>
                    ${state.maxQty > 1 ? `
                      <button type="button" class="simple-btn-pill" onclick="setBulkAdjQtyMax(${index})">Set to Max (${state.maxQty})</button>
                    ` : ''}
                  </div>
                  ${!state.isOpened && !state.isAdd && state.maxQty > 0 && state.maxQty < state.curCans ? `
                    <div class="simple-safeguard-tip">🛡️ Up to ${state.maxQty} cans can be deducted (50% safety safeguard) to prevent accidental stockout.</div>
                  ` : ''}
                  ${!state.isOpened && state.isAdd ? `
                    <div class="simple-safeguard-tip">🛡️ Up to 10 cans can be added via manual adjustment. For supplier deliveries, use the Stock Receiving tab.</div>
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
              ` : `
                <div class="simple-guide-box" style="height:100%; justify-content:center; text-align:center;">
                  <div style="font-size:24px; margin-bottom:4px;">📊</div>
                  <div style="font-weight:700; color:var(--ink);">Real-time Stock Preview</div>
                  <div>Once a product is selected, this panel displays the new inventory count and verifies all deduction safety rules before saving.</div>
                </div>
              `}
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="simple-adj-container">
      <div class="simple-adj-header">
        <div>
          <div class="simple-adj-title">⚖️ Stock Adjustment</div>
          <div class="simple-adj-subtitle">Deduct or add stock for damaged goods, expired paint, internal store use, or inventory audit corrections.</div>
        </div>
        <div class="simple-header-actions">
          <div class="simple-header-stats">
            <span class="simple-stat-pill">Catalog: <b>${availableProducts.length}</b> products</span>
            <span class="simple-stat-pill">Selected: <b>${validRows.length}</b> item${validRows.length === 1 ? '' : 's'}</span>
          </div>
          <div class="simple-adj-supplier-filter">
            <span class="muted">Supplier:</span>
            <select id="bulk-adj-supplier-filter" class="simple-adj-supplier-select" onchange="onBulkAdjSupplierFilterChange()">
              <option value="">All Suppliers</option>
              ${supplierOptions}
            </select>
          </div>
        </div>
      </div>

      ${cardsHtml}

      <div class="simple-action-row">
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
          <button type="button" id="btn-save-adj" class="btn simple-submit-btn" onclick="confirmAndSubmitAdjustments()" ${hasInvalidRows || validRows.length === 0 ? 'disabled' : ''}>
            ${currentUser && currentUser.role === 'staff'
              ? `⏳ Submit for Admin Approval${validRows.length > 1 ? ` (${validRows.length} items)` : ''}`
              : `💾 Save Stock Adjustment${validRows.length > 1 ? ` (${validRows.length} items)` : ''}`}
          </button>
          <button type="button" class="btn secondary small" onclick="addBulkAdjRow()">+ Add Another Product</button>
        </div>
        <button type="button" class="btn ghost small" style="color:var(--ink-soft);" onclick="clearBulkAdjRows()">Clear Form</button>
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

function addBulkAdjRow(productId = '', reason = 'Damaged', qty = 1, note = '', size = 1) {
  const p = productId ? productById(productId) : null;
  const resolvedSize = defaultAdjSizeForProduct(p, reason, size);
  const maxQty = maxAllowedAdjQty(p, reason, resolvedSize);
  const resolvedQty = maxQty >= 1 ? Math.min(qty, maxQty) : qty;
  bulkAdjustmentRows.push({ id: uid('adj'), productId, reason, size: resolvedSize, qty: resolvedQty, note });
  renderBulkAdjustmentView();
}

function removeBulkAdjRow(index) {
  if (bulkAdjustmentRows.length <= 1) return;
  bulkAdjustmentRows.splice(index, 1);
  renderBulkAdjustmentView();
}

function clearBulkAdjRows() {
  bulkAdjustmentRows = [{ id: uid('adj'), productId: '', reason: 'Damaged', size: 1, qty: 1, note: '' }];
  renderBulkAdjustmentView();
}

const renderBulkAdjustmentTable = renderBulkAdjustmentView;

function selectMovementType(type) {
  currentMovementType = type;
  const hidden = document.getElementById('mv-type');
  if (hidden) hidden.value = type;

  ['receiving', 'adjustment', 'colormix'].forEach(t => {
    const card = document.getElementById('mv-card-' + t);
    if (card) {
      const isSelected = (t === type);
      card.classList.toggle('active', isSelected);
      card.setAttribute('aria-checked', isSelected ? 'true' : 'false');
    }
  });

  toggleMovementFields();
}

function toggleMovementFields() {
  const hidden = document.getElementById('mv-type');
  const type = hidden ? hidden.value : (currentMovementType || 'receiving');
  ['receiving', 'adjustment', 'colormix'].forEach(t => {
    const el = document.getElementById('mv-fields-' + t);
    if (el) el.classList.toggle('hidden', t !== type);
  });
  if (type === 'adjustment') {
    renderBulkAdjustmentView();
  } else if (type === 'receiving') {
    renderReceivingPOPreview();
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
    const changeTag = isAdd
      ? `<b style="color:var(--success);">+${r.qty} can${r.qty === 1 ? '' : 's'} (+${formatLiters(state.litersAbs)})</b>`
      : (isOpened
        ? `<b style="color:#9A6216;">Dispose ${formatLiters(r.qty)}</b>`
        : `<b style="color:var(--danger);">-${r.qty} can${r.qty === 1 ? '' : 's'} (-${formatLiters(state.litersAbs)})</b>`);

    return `
      <div style="padding:9px 12px; background:#FAF7F2; border:1px solid var(--line); border-radius:6px; margin-bottom:6px; font-size:13px; text-align:left;">
        <div style="font-weight:700; color:var(--ink);">${escapeHtml(p.name)} (${isOpened ? 'Opened Leftover' : state.sizeNum + 'L Can'})</div>
        <div style="display:flex; justify-content:space-between; margin-top:2px;">
          <span>${changeTag} · ${escapeHtml(r.reason)}</span>
          <span class="muted small">${isOpened ? `Leftover: ${formatLiters(Math.max(0, state.curOpened - r.qty))}` : `Stock: ${state.curCans} ➔ ${state.newCans} cans`}</span>
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
        <p class="muted small" style="color:#92400E; font-weight:600;">⏳ This will be submitted as <b>Pending Approval</b> for Admin review.</p>
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
  if (!db.adjustmentRequests) db.adjustmentRequests = [];
  const reqNumber = generateAdjReqNumber();
  const req = {
    id: uid('adjreq'),
    reqNumber: reqNumber,
    date: nowISO(),
    requestedBy: (currentUser && currentUser.name) || 'Inventory Staff',
    role: (currentUser && currentUser.role) || 'staff',
    status: 'pending',
    rows: validRows.map(r => ({ ...r })),
    rowsJson: JSON.stringify(validRows),
    batchNote: '',
    reviewedBy: null,
    reviewedAt: null,
    rejectReason: null
  };

  db.adjustmentRequests.unshift(req);
  logAudit('ADJ_REQUEST_SUBMIT', 'Stock Adjustment', `Staff submitted adjustment request ${reqNumber} (${validRows.length} item${validRows.length === 1 ? '' : 's'}) for Admin approval`);
  await saveDB();

  bulkAdjustmentRows = [{ id: uid('adj'), productId: '', reason: 'Damaged', size: 1, qty: 1, note: '' }];
  showToast(`✓ Submitted Adjustment Request ${reqNumber} for Admin approval!`, 'ok');
  switchAdjView('requests');
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

      db.movements.push({
        id: uid('mv'),
        date,
        type: 'adjustment',
        productId: p.id,
        productName: `${p.name} [Opened / Used Stock]`,
        qtyChange: 0,
        note: `${row.reason} [Deducted ${formatStock(qty)}L from ${canSize ? canSize + 'L ' : ''}Opened / Used Stock · Opened: ${formatStock(beforeOpened)}L→${formatStock(newOpened)}L]${row.note ? ' — ' + row.note : ''}`,
        staffName: recordedStaff
      });
    } else {
      const sizeNum = adjSealedSize(p, row.size);
      const cans = Math.floor(Number(row.qty));
      const liters = Number((cans * sizeNum).toFixed(2));
      const deltaLiters = isAdd ? liters : -liters;
      const beforeStock = Number(p.stock) || 0;
      const beforeCans = productCanCount(p, sizeNum);
      const afterCans = isAdd ? (beforeCans + cans) : Math.max(0, beforeCans - cans);

      if (!p.canStock || Array.isArray(p.canStock) || typeof p.canStock !== 'object') {
        p.canStock = {};
      }
      p.canStock[sizeNum] = afterCans;
      p.stock = Math.max(0, Number((beforeStock + deltaLiters).toFixed(2)));
      normalizeProductOpenedStock(p);

      db.movements.push({
        id: uid('mv'),
        date,
        type: 'adjustment',
        productId: p.id,
        productName: p.name,
        qtyChange: deltaLiters,
        note: `${row.reason} [${isAdd ? 'Added' : 'Deducted'} ${cans} × ${sizeNum}L (${isAdd ? '+' : '-'}${formatStock(liters)}L) · ${sizeNum}L Cans: ${beforeCans}→${afterCans}, Stock: ${formatStock(beforeStock)}L→${formatStock(p.stock)}L]${row.note ? ' — ' + row.note : ''}`,
        staffName: recordedStaff
      });
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

function confirmApproveAdjRequest(reqId) {
  const req = (db.adjustmentRequests || []).find(r => r.id === reqId);
  if (!req || req.status !== 'pending') return;

  const rows = Array.isArray(req.rows) ? req.rows : (req.rowsJson ? JSON.parse(req.rowsJson) : []);
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
        warningHtml = `<div style="color:var(--danger); font-size:11.5px; font-weight:600; margin-top:2px;">⚠️ Warning: Requested deduction (${r.qty} cans) exceeds current stock (${curCans} cans).</div>`;
      }
    }

    const actionLabel = isAdd
      ? `<span style="color:var(--success); font-weight:700;">➕ Add ${r.qty} × ${sizeNum}L</span>`
      : (isOpened
        ? `<span style="color:#9A6216; font-weight:700;">🫙 Dispose ${formatLiters(r.qty)}</span>`
        : `<span style="color:var(--danger); font-weight:700;">🔻 Deduct ${r.qty} × ${sizeNum}L</span>`);

    return `
      <div style="display:flex; justify-content:space-between; align-items:flex-start; padding:8px 12px; background:#FAF7F2; border-radius:6px; margin-bottom:6px; font-size:12.5px; border:1px solid var(--line);">
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

  showPOConfirm({
    icon: hasStockDiscrepancy ? '⚠️' : '✅',
    title: hasStockDiscrepancy ? 'Approve Stock Adjustment (Stock Alert)?' : 'Approve Stock Adjustment?',
    message: `
      <div style="text-align:left; font-size:13px; color:var(--ink-soft);">
        <p>Do you want to approve request <b>${escapeHtml(req.reqNumber)}</b> submitted by <b>${escapeHtml(req.requestedBy)}</b>?</p>
        <div style="max-height:200px; overflow-y:auto; margin:8px 0;">${reviewHtml}</div>
        <p style="font-size:12px; color:var(--teal); font-weight:600;">✓ Warehouse stock will update automatically and be recorded in Movement History.</p>
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

  const rows = Array.isArray(req.rows) ? req.rows : (req.rowsJson ? JSON.parse(req.rowsJson) : []);
  // Execute updates without triggering premature toast, page render, or resetting the draft form
  await executeStockAdjustment(rows, req.requestedBy, { skipSave: true, skipReset: true, skipToast: true, skipRender: true });

  req.status = 'approved';
  req.reviewedBy = (currentUser && currentUser.name) || 'Administrator';
  req.reviewedAt = nowISO();

  logAudit('ADJ_REQUEST_APPROVE', 'Stock Adjustment', `Approved adjustment request ${req.reqNumber} (submitted by ${req.requestedBy})`);
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

  logAudit('ADJ_REQUEST_REJECT', 'Stock Adjustment', `Rejected adjustment request ${req.reqNumber}. Reason: ${req.rejectReason}`);
  await saveDB();
  showToast(`Rejected adjustment request ${req.reqNumber}.`, 'ok');
  renderPage();
}

function viewAdjRequestDetails(reqId) {
  const req = (db.adjustmentRequests || []).find(r => r.id === reqId);
  if (!req) return;

  const rows = Array.isArray(req.rows) ? req.rows : (req.rowsJson ? JSON.parse(req.rowsJson) : []);
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
        ? `<span style="color:#9A6216; font-weight:700;">🫙 Dispose ${formatLiters(r.qty)}</span>`
        : `<span style="color:var(--danger); font-weight:700;">🔻 Deduct ${r.qty} × ${sizeNum}L</span>`);

    return `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; background:#FAF7F2; border-radius:6px; margin-bottom:8px; border:1px solid var(--line);">
        <div>
          <div style="font-weight:700; color:var(--ink);">${escapeHtml(p ? p.name : 'Unknown Product')} <span style="font-weight:normal; font-size:12px; color:var(--ink-soft);">${p ? `(${p.brand})` : ''}</span></div>
          <div class="muted small" style="margin-top:2px;">Reason: <b>${escapeHtml(r.reason)}</b>${r.note ? ` — "${escapeHtml(r.note)}"` : ''}</div>
        </div>
        <div style="text-align:right;">
          <div>${actionLabel}</div>
        </div>
      </div>
    `;
  }).join('');

  let statusBadge = req.status === 'pending'
    ? '<span class="badge" style="background:#FEF3C7; color:#92400E; border:1px solid #FCD34D;">⏳ Pending Approval</span>'
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

      ${req.batchNote ? `<div style="background:#FAF8F5; border:1px solid var(--line); border-radius:6px; padding:10px 14px; margin-bottom:14px; font-size:13px;"><b>Audit Note:</b> "${escapeHtml(req.batchNote)}"</div>` : ''}
      ${req.rejectReason ? `<div style="background:#FDF2F2; border:1px solid #F8D7DA; color:#721C24; border-radius:6px; padding:10px 14px; margin-bottom:14px; font-size:13px;"><b>Rejection Reason:</b> ${escapeHtml(req.rejectReason)}</div>` : ''}

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

  return `
    <div class="panel" style="margin-top:0; border:none; box-shadow:none;">
      <!-- Filter and Status Pills -->
      <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:14px; flex-wrap:wrap;">
        <div style="display:flex; gap:6px;">
          <button type="button" class="btn ${adjRequestFilterStatus === 'all' ? 'secondary' : 'ghost'} small" onclick="setAdjReqFilter('all')">
            All (${counts.all})
          </button>
          <button type="button" class="btn ${adjRequestFilterStatus === 'pending' ? 'secondary' : 'ghost'} small" style="${adjRequestFilterStatus === 'pending' ? 'border-color:#F59E0B; color:#92400E;' : ''}" onclick="setAdjReqFilter('pending')">
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

      <div class="table-scroll" style="background:#fff; border:1px solid var(--line); border-radius:var(--radius-sm);">
        <table style="width:100%; border-collapse:collapse;">
          <thead>
            <tr style="background:#FAF8F5;">
              <th style="padding:10px 14px; text-align:left;">Request # &amp; Date</th>
              <th style="padding:10px 14px; text-align:left;">Requested By</th>
              <th style="padding:10px 14px; text-align:left;">Items Summary</th>
              <th style="padding:10px 14px; text-align:left;">Status</th>
              <th style="padding:10px 14px; text-align:center;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${list.length ? list.map(req => {
    const rows = Array.isArray(req.rows) ? req.rows : (req.rowsJson ? JSON.parse(req.rowsJson) : []);
    const dateStr = formatDateShort(req.date);
    const isPending = req.status === 'pending';
    const isApproved = req.status === 'approved';
    const isRejected = req.status === 'rejected';

    let statusBadge = '';
    if (isPending) {
      statusBadge = '<span class="badge" style="background:#FEF3C7; color:#92400E; border:1px solid #FCD34D;">⏳ Pending Approval</span>';
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
      const unit = isOpened ? 'L' : (r.qty === 1 ? ' can' : ' cans');
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
    </div>
  `;
}

async function submitMovement(e) {
  e.preventDefault();
  const type = document.getElementById('mv-type').value;
  const date = nowISO();

  if (type === 'receiving') {
    const poSel = document.getElementById('mv-po');
    const po = (db.purchaseOrders || []).find(o => poSel && o.id === poSel.value);
    if (!po || (po.status !== 'ordered' && po.status !== 'partial')) {
      showToast('Please select an approved purchase order to confirm.', 'error');
      return false;
    }

    const items = getPOItems(po);
    const batchQtys = {};
    let totalToReceive = 0;

    for (let i = 0; i < items.length; i++) {
      const input = document.getElementById(`rcv-qty-input-${i}`);
      const val = input ? Math.max(0, parseFloat(input.value) || 0) : 0;
      batchQtys[i] = val;
      totalToReceive += val;
    }

    if (totalToReceive <= 0) {
      showToast('Please enter at least one quantity greater than 0 to receive.', 'error');
      return false;
    }

    const refNote = document.getElementById('mv-batch-note-r') ? document.getElementById('mv-batch-note-r').value.trim() : '';
    const result = await completePOReceiving(po, refNote, batchQtys);

    if (result.allCompleted) {
      receivingPOId = '';
      showToast(`PO ${po.poNumber} confirmed as fully received — all stock updated.`, 'ok');
    } else {
      showToast(`PO ${po.poNumber} partial delivery recorded (${result.receivedItemCount} items updated). PO status is Partial.`, 'ok');
    }
    renderPage();
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