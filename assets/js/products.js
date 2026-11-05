/* ============================================================
   11. PRODUCT MAINTENANCE (admin)
   ============================================================ */
function productsPage() {
  return inventoryPage();
}




/* ---- Per-product can size editor (Add / Edit Product modal) ---- */
let productFormSizes = [];
let productFormEditingId = null;
let productFormThresholds = {};
let productFormSizeVariants = {}; // [sizeNumber] => { sizeId, inventoryId, ... }

function captureProductFormThresholds() {
  productFormSizes.forEach(s => {
    const inp = document.getElementById(`pf-thresh-size-${s}`);
    if (inp) {
      const v = parseInt(inp.value, 10);
      productFormThresholds[s] = (!isNaN(v) && v >= 0) ? v : 0;
    }
  });
}

function updateProductOverallThresholdFromSizes() {
  let sumLiters = 0;
  productFormSizes.forEach(s => {
    const inp = document.getElementById(`pf-thresh-size-${s}`);
    const cans = inp ? Math.max(0, parseInt(inp.value, 10) || 0) : (productFormThresholds[s] || 0);
    sumLiters += cans * s;
    const litersEl = document.getElementById(`pf-thresh-liters-${s}`);
    if (litersEl) litersEl.textContent = `(${formatLiters(cans * s)})`;
  });
  const sumEl = document.getElementById('pf-threshold-sum');
  if (sumEl) sumEl.textContent = formatLiters(sumLiters);
  const overallInp = document.getElementById('pf-threshold');
  if (overallInp) {
    overallInp.value = Number(sumLiters.toFixed(2));
  }
}

function onProductSizeThresholdInput(size, value) {
  const v = Math.max(0, parseInt(value, 10) || 0);
  productFormThresholds[size] = v;
  updateProductOverallThresholdFromSizes();
}

/**
 * Checks whether a container size can be safely removed from a product.
 * Removal is strictly blocked if the container size has:
 * - Existing sealed stock
 * - Active opened stock
 * - Purchase order references
 * - Stock movement transaction history
 * - Past sales transactions
 * - Stock adjustment requests
 */
function canRemoveContainerSize(p, size) {
  const s = normalizeCanSize(size);
  if (!p) return { allowed: true };
  const pid = p.id;
  const altPid = p.productId || p.id;

  // 1. Sealed stock
  const canCount = productCanCount(p, s);
  if (canCount > 0) {
    return {
      allowed: false,
      reason: `Container size ${fmtSize(s)} still holds ${canCount} sealed can(s) in warehouse inventory (${formatLiters(canCount * s)}). Cannot remove.`
    };
  }

  // 2. Opened stock
  const openLit = productOpenedLiters(p, s);
  if (openLit > 0) {
    return {
      allowed: false,
      reason: `Container size ${fmtSize(s)} has active opened paint (${formatLiters(openLit)}) used in color mixing. Cannot remove.`
    };
  }

  const variant = (p.sizesData || []).find(v => normalizeCanSize(v.containerSize) === s);
  const sizeId = variant ? variant.sizeId : null;

  // 3. Purchase orders
  const poMatch = (db.purchaseOrders || []).some(po => {
    return (po.items || []).some(it => {
      const matchPid = (it.productId === pid || it.productId === altPid);
      const matchSize = Number(it.size) === s || (sizeId && it.sizeId === sizeId);
      return matchPid && matchSize;
    });
  });
  if (poMatch) {
    return {
      allowed: false,
      reason: `Container size ${fmtSize(s)} is referenced in purchase orders. Removing size with purchase order history is prohibited.`
    };
  }

  // 4. Movements / stock transaction history
  const moveMatch = (db.movements || []).some(m => {
    const mPid = m.productId || m.product_id;
    if (mPid === pid || mPid === altPid) {
      if (Number(m.containerSize) === s || (sizeId && m.sizeId === sizeId)) return true;
      if (m.note && (m.note.includes(`${s}L`) || (sizeId && m.note.includes(sizeId)))) return true;
    }
    return false;
  });
  if (moveMatch) {
    return {
      allowed: false,
      reason: `Container size ${fmtSize(s)} has historical stock movement transactions. Cannot remove.`
    };
  }

  // 5. Sales history
  const saleMatch = (db.sales || []).some(sl => {
    return (sl.items || []).some(it => {
      const matchPid = (it.productId === pid || it.productId === altPid);
      const matchSize = Number(it.size) === s || (sizeId && it.sizeId === sizeId);
      return matchPid && matchSize;
    });
  });
  if (saleMatch) {
    return {
      allowed: false,
      reason: `Container size ${fmtSize(s)} is referenced in past customer sales receipts. Cannot remove.`
    };
  }

  // 6. Adjustment requests
  const adjMatch = (db.adjustmentRequests || []).some(ar => {
    return (ar.rows || []).some(rw => {
      const matchPid = (rw.productId === pid || rw.productId === altPid);
      const matchSize = Number(rw.size) === s || (sizeId && rw.sizeId === sizeId);
      return matchPid && matchSize;
    });
  });
  if (adjMatch) {
    return {
      allowed: false,
      reason: `Container size ${fmtSize(s)} is referenced in stock adjustment requests. Cannot remove.`
    };
  }

  return { allowed: true };
}

function productSizeGridHtml(p, sizes) {
  const list = sanitizeSizeList(sizes);
  const priceInput = document.getElementById('pf-price');
  const basePrice = priceInput && priceInput.value ? Number(priceInput.value) : (p ? Number(p.price) : 0);

  if (!list.length) {
    return `<div class="muted small" style="padding:12px; text-align:center;">No container sizes added yet. Use "+ Add Size" above.</div>`;
  }

  return `
    <div style="overflow-x:auto;">
      <table class="tight" style="width:100%; font-size:12px; margin:0; border-collapse:collapse; background:#fff; border-radius:var(--radius-sm); border:1px solid var(--line);">
        <thead>
          <tr style="background:#FAF8F5; border-bottom:1px solid var(--line);">
            <th style="padding:6px 10px; font-size:11px; text-transform:uppercase; color:var(--ink-soft); font-weight:700;">Container Size</th>
            <th class="right" style="padding:6px 10px; font-size:11px; text-transform:uppercase; color:var(--ink-soft); font-weight:700;">Price / Can</th>
            <th class="center" style="padding:6px 10px; font-size:11px; text-transform:uppercase; color:var(--ink-soft); font-weight:700;">Sealed Stock</th>
            <th class="center" style="padding:6px 10px; font-size:11px; text-transform:uppercase; color:var(--ink-soft); font-weight:700;">Opened Stock</th>
            <th style="padding:6px 10px; font-size:11px; text-transform:uppercase; color:var(--ink-soft); font-weight:700; width:140px;">Min Stock (Cans)</th>
            <th class="center" style="padding:6px 10px; font-size:11px; text-transform:uppercase; color:var(--ink-soft); font-weight:700; width:60px;">Action</th>
          </tr>
        </thead>
        <tbody>
          ${list.map(s => {
    const open = p ? productOpenedLiters(p, s) : 0;
    const count = p ? productCanCount(p, s) : 0;
    const remCheck = p ? canRemoveContainerSize(p, s) : { allowed: true };
    const locked = !remCheck.allowed;
    const currentThresh = productFormThresholds[s] !== undefined ? productFormThresholds[s] : (p ? productSizeThreshold(p, s) : (s >= 16 ? 1 : (s >= 4 ? 2 : 5)));
    const priceForCan = Number((basePrice * s).toFixed(2));
    const icon = s <= 1 ? '🧴' : (s <= 4 ? '🪣' : '🛢️');
    const unitLabel = s <= 1 ? 'Can' : (s <= 4 ? 'Gallon' : 'Drum');

    return `
              <tr style="border-bottom:1px solid var(--line);">
                <td style="padding:8px 10px; vertical-align:middle; font-weight:600;">
                  <span>${icon} ${fmtSize(s)} ${unitLabel}</span>
                </td>
                <td class="right" style="padding:8px 10px; vertical-align:middle; font-weight:600; color:var(--teal-dark);">
                  ${peso(priceForCan)}
                </td>
                <td class="center" style="padding:8px 10px; vertical-align:middle;">
                  <span style="font-weight:700; font-size:13px; ${count === 0 ? 'opacity:0.4;' : ''}">${count}</span>
                  <span class="muted small">cans</span>
                </td>
                <td class="center" style="padding:8px 10px; vertical-align:middle;">
                  ${open > 0
        ? `<span style="font-weight:700; color:#9A6216;">${formatLiters(open)}</span>`
        : `<span class="muted small" style="opacity:0.5;">0 L</span>`}
                </td>
                <td style="padding:8px 10px; vertical-align:middle;">
                  <div style="display:flex; align-items:center; gap:6px;">
                    <input type="number" min="0" step="1" inputmode="numeric"
                      class="pf-size-threshold-input"
                      id="pf-thresh-size-${s}"
                      data-size="${s}"
                      value="${currentThresh}"
                      style="width:70px; padding:4px 6px; font-size:12px; font-weight:700;"
                      placeholder="Min"
                      oninput="onProductSizeThresholdInput(${s}, this.value)"
                      required>
                    <span id="pf-thresh-liters-${s}" style="font-size:10.5px; color:var(--teal); font-weight:600; white-space:nowrap;">(${formatLiters(currentThresh * s)})</span>
                  </div>
                </td>
                <td class="center" style="padding:8px 10px; vertical-align:middle;">
                  <button type="button" class="btn ghost small"
                    ${locked ? `disabled title="${escapeHtml(remCheck.reason)}"` : `title="Remove ${fmtSize(s)}"`}
                    onclick="removeProductFormSize(${s})"
                    style="color:${locked ? 'var(--ink-soft)' : 'var(--danger)'}; padding:2px 6px; font-size:13px; opacity:${locked ? 0.35 : 1}; cursor:${locked ? 'not-allowed' : 'pointer'};">
                    ${locked ? '🔒' : '✕'}
                  </button>
                </td>
              </tr>
            `;
  }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function productSizeChipsHtml() {
  const p = productFormEditingId ? productById(productFormEditingId) : null;
  return `<div style="display:flex; flex-wrap:wrap; gap:6px;">${productFormSizes.map(s => {
    const remCheck = p ? canRemoveContainerSize(p, s) : { allowed: true };
    const locked = !remCheck.allowed;
    return `<span class="badge" style="background:#EAF4F3; color:var(--teal-dark); border:1px solid #C5DFDC; font-size:12px; padding:4px 8px; display:inline-flex; align-items:center; gap:6px;">
      <b>${fmtSize(s)}</b>
      <button type="button" ${locked ? `disabled title="${escapeHtml(remCheck.reason)}"` : `title="Remove ${fmtSize(s)}"`} onclick="removeProductFormSize(${s})" style="border:none; background:none; cursor:${locked ? 'not-allowed' : 'pointer'}; opacity:${locked ? 0.35 : 0.8}; font-size:13px; line-height:1; padding:0; color:${locked ? 'var(--ink-soft)' : 'inherit'};">${locked ? '🔒' : '×'}</button>
    </span>`;
  }).join('') || '<span class="muted small">No sizes yet</span>'}</div>`;
}

function refreshProductSizeUI() {
  const chips = document.getElementById('pf-size-chips');
  if (chips) chips.innerHTML = productSizeChipsHtml();
  const grid = document.getElementById('pf-size-grid');
  if (grid) grid.innerHTML = productSizeGridHtml(productFormEditingId ? productById(productFormEditingId) : null, productFormSizes);
  updateProductOverallThresholdFromSizes();
}

function addProductFormSize() {
  captureProductFormThresholds();
  const input = document.getElementById('pf-size-input');
  const raw = Number(input ? input.value : 0);
  if (!Number.isInteger(raw)) { showToast('Can size must be a whole number (e.g. 1, 4, 20).', 'error'); return; }
  const v = normalizeCanSize(raw);
  if (!v) { showToast('Enter a valid can size in liters (e.g. 1, 4, 20).', 'error'); return; }
  if (v > 1000) { showToast('Can size is too large.', 'error'); return; }
  if (productFormSizes.includes(v)) {
    showToast(`Container size ${fmtSize(v)} already exists for this product. Duplicate sizes are not allowed.`, 'error');
    return;
  }

  // Allocate unique Size ID
  if (!productFormSizeVariants[v]) {
    const p = productFormEditingId ? productById(productFormEditingId) : null;
    const parentPid = p ? (p.productId || p.id) : null;
    productFormSizeVariants[v] = {
      sizeId: nextSizeId(),
      productId: parentPid,
      containerSize: v,
      minimumStock: v >= 16 ? 1 : (v >= 4 ? 2 : 5),
      sealedQuantity: 0,
      openedQuantity: 0,
      remainingVolume: 0,
      isActive: true,
      inventoryId: nextInventoryId()
    };
  }

  productFormSizes = sanitizeSizeList(productFormSizes.concat(v));
  if (productFormThresholds[v] === undefined) {
    productFormThresholds[v] = v >= 16 ? 1 : (v >= 4 ? 2 : 5);
  }
  if (input) input.value = '';
  refreshProductSizeUI();
}

function removeProductFormSize(size) {
  captureProductFormThresholds();
  const s = normalizeCanSize(size);
  const p = productFormEditingId ? productById(productFormEditingId) : null;
  if (p) {
    const remCheck = canRemoveContainerSize(p, s);
    if (!remCheck.allowed) {
      showToast(remCheck.reason, 'error');
      return;
    }
  }
  if (productFormSizes.length <= 1) { showToast('A product needs at least one container size.', 'error'); return; }
  productFormSizes = productFormSizes.filter(x => x !== s);
  delete productFormThresholds[s];
  // Note: we do not delete from productFormSizeVariants so the Size ID is not reused
  refreshProductSizeUI();
}

function canBreakdownHtml(p) {
  const variants = productSizeVariants(p);
  return `<div class="can-breakdown" style="display:flex; flex-direction:column; gap:2px; font-size:12px;">${variants.map(v => {
    const s = v.containerSize;
    const n = productCanCount(p, s);
    return `<div style="white-space:nowrap; ${n === 0 ? 'opacity:.45;' : ''}"><strong>${fmtSize(s)}</strong>: ${n}</div>`;
  }).join('')}</div>`;
}

function openProductModal(id) {
  const user = currentUser || (typeof db !== 'undefined' && db && db.users ? db.users.find(u => u.role === 'admin') : null);
  if (!user || (user.role !== 'staff' && user.role !== 'admin')) {
    showToast('Only Administrators and Inventory Staff can add or edit products.', 'error');
    return;
  }
  const isAdmin = user.role === 'admin';
  const p = id ? productById(id) : null;
  productFormEditingId = p ? p.id : null;

  const pending = p && p.pendingEdit ? p.pendingEdit : null;
  const prop = pending && pending.proposed ? pending.proposed : null;

  // Prefill form sizes and thresholds using proposed values if an edit is pending
  const initialSizes = (prop && Array.isArray(prop.sizes) && prop.sizes.length > 0)
    ? prop.sizes
    : (p ? productSizes(p) : CAN_SIZES.slice());

  productFormSizes = sanitizeSizeList(initialSizes);
  productFormThresholds = {};
  productFormSizeVariants = {};
  if (p && Array.isArray(p.sizesData)) {
    p.sizesData.forEach(v => {
      productFormSizeVariants[v.containerSize] = { ...v };
    });
  }
  productFormSizes.forEach(s => {
    if (!productFormSizeVariants[s]) {
      productFormSizeVariants[s] = {
        sizeId: p ? (productSizeVariantBySize(p, s) ? productSizeVariantBySize(p, s).sizeId : nextSizeId()) : nextSizeId(),
        productId: p ? (p.productId || p.id) : null,
        containerSize: s,
        minimumStock: s >= 16 ? 1 : (s >= 4 ? 2 : 5),
        sealedQuantity: p ? productCanCount(p, s) : 0,
        openedQuantity: p && productOpenedLiters(p, s) > 0 ? 1 : 0,
        remainingVolume: p ? productOpenedLiters(p, s) : 0,
        isActive: true,
        inventoryId: nextInventoryId()
      };
    }
    if (prop && prop.thresholdBySize && prop.thresholdBySize[s] !== undefined && !isNaN(Number(prop.thresholdBySize[s]))) {
      productFormThresholds[s] = Number(prop.thresholdBySize[s]);
    } else {
      productFormThresholds[s] = p ? productSizeThreshold(p, s) : (s >= 16 ? 1 : (s >= 4 ? 2 : 5));
    }
  });

  const editPrice = (prop && prop.price !== undefined && !isNaN(Number(prop.price)))
    ? Number(prop.price)
    : (p ? Number(p.price) : null);
  const hasSavedRecent = p && p.recentPrice != null && Number(p.recentPrice) > 0 && Number(p.recentPrice) !== Number(p.price);
  const currentPriceFormatted = editPrice !== null ? (editPrice % 1 === 0 ? editPrice : Number(editPrice).toFixed(2)) : '';
  const initialName = (prop && prop.name !== undefined) ? prop.name : (p ? p.name : '');
  const initialBrand = (prop && prop.brand !== undefined) ? prop.brand : (p ? p.brand : '');
  const initialType = (prop && prop.type !== undefined) ? prop.type : (p ? p.type : 'Automotive Paint');
  const initialColor = (prop && prop.color !== undefined) ? prop.color : (p ? p.color : '');
  const initialStatus = (prop && prop.status !== undefined) ? prop.status : (p ? (p.status || 'active') : 'active');

  let initialColorName = '';
  let initialColorHex = '#FFFFFF';
  if (initialColor && initialColor !== '-') {
    if (initialColor.startsWith('#')) {
      initialColorHex = initialColor;
      const rgb = typeof hexToRgb === 'function' ? hexToRgb(initialColor) : null;
      initialColorName = (rgb && typeof detectMixedColorName === 'function') ? detectMixedColorName(rgb.r, rgb.g, rgb.b).name : '';
    } else {
      initialColorName = initialColor;
      initialColorHex = getProductHex({ color: initialColor, name: initialName });
    }
  } else {
    initialColorHex = getProductHex({ color: initialColor, name: initialName });
  }
  const currentColorHex = initialColorHex || '#FFFFFF';

  const currentSuppliers = p ? (typeof suppliersForProduct === 'function' ? suppliersForProduct(p.id) : []) : [];
  const initialSupplierId = (prop && prop.supplierId !== undefined)
    ? prop.supplierId
    : (currentSuppliers.length > 0 ? currentSuppliers[0].id : (p && p.supplierId ? p.supplierId : ''));

  const defaultTypes = ['Automotive Paint', 'House Paint', 'Specialty Paint'];
  const existingTypes = (db && Array.isArray(db.products) ? db.products : []).map(x => x && (x.type || x.category)).filter(Boolean);
  const allTypes = Array.from(new Set([...defaultTypes, ...existingTypes, initialType].filter(Boolean)));
  const allSuppliers = (db && Array.isArray(db.suppliers) ? db.suppliers : []);

  const modalTitle = p ? `Edit Product: ${p.name}` : (isAdmin ? 'Add New Product' : 'Add New Product (Staff Request)');
  const submitButtonLabel = p ? 'Save Changes' : (isAdmin ? 'Save Product' : 'Submit for Approval →');

  const bannerNoticeHtml = isAdmin ? (
    p ? (
      pending ? `
        <div class="full" style="background:#FEF3C7; border:1px solid #FCD34D; border-radius:var(--radius-sm); padding:12px 14px; margin-bottom:4px; font-size:12px; color:#92400E;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px; flex-wrap:wrap;">
            <div style="flex:1; min-width:240px;">
              <div style="font-weight:700; font-size:13px; display:flex; align-items:center; gap:6px;">
                <span>⏳</span>
                <span>Pending edit request submitted by ${escapeHtml(pending.requestedBy || 'Inventory Staff')}</span>
              </div>
              <div style="margin-top:3px; color:#78350F;">
                Submitted on ${formatDateTime(pending.requestedAt || nowISO())} (${Object.keys(pending.changes || {}).length} field change(s)). As Administrator, clicking <b>Save Changes</b> will directly apply these details and resolve the pending request.
              </div>
            </div>
            <div>
              <button type="button" class="btn secondary small danger" style="padding:5px 12px; font-size:11.5px; white-space:nowrap;" onclick="cancelProductPendingEdit('${p.id}')">✕ Reject / Cancel Request</button>
            </div>
          </div>
        </div>
      ` : `
        <div class="full" style="background:#EAF4F3; border:1px solid #C5DFDC; border-radius:var(--radius-sm); padding:10px 14px; margin-bottom:4px; font-size:12px; color:var(--teal-dark); display:flex; gap:8px; align-items:flex-start;">
          <span style="font-size:16px; line-height:1;">⚡</span>
          <div>
            <strong>Administrator Direct Edit:</strong> All changes (name, brand, type, price, sizes, and thresholds) will take effect immediately across the entire system.
          </div>
        </div>
      `
    ) : `
      <div class="full" style="background:#EAF4F3; border:1px solid #C5DFDC; border-radius:var(--radius-sm); padding:10px 14px; margin-bottom:4px; font-size:12px; color:var(--teal-dark); display:flex; gap:8px; align-items:flex-start;">
        <span style="font-size:16px; line-height:1;">⚡</span>
        <div>
          <strong>Administrator Direct Entry:</strong> This new product will be created directly as <b>Active</b> and ready immediately for POS, inventory, and Purchase Orders without requiring approval.
        </div>
      </div>
    `
  ) : (
    p ? `
      <div class="full" style="background:#FFFBEB; border:1px solid #FCD34D; border-radius:var(--radius-sm); padding:10px 14px; margin-bottom:4px; font-size:12px; color:#92400E; display:flex; gap:8px; align-items:flex-start;">
        <span style="font-size:16px; line-height:1;">ℹ️</span>
        <div>
          <strong>Staff Edit Request:</strong> As Inventory Staff, you can edit product details (name, brand, type, color, price, sizes, and minimum thresholds). All changes will be submitted for <b>Administrator Approval</b> before taking effect.
        </div>
      </div>
      ${pending ? `
        <div class="full" style="background:#FEF3C7; border:1px solid #FCD34D; border-radius:var(--radius-sm); padding:12px 14px; margin-bottom:4px; font-size:12px; color:#92400E;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px; flex-wrap:wrap;">
            <div style="flex:1; min-width:240px;">
              <div style="font-weight:700; font-size:13px; display:flex; align-items:center; gap:6px;">
                <span>⏳</span>
                <span>There is already a pending edit request for this product</span>
              </div>
              <div style="margin-top:3px; color:#78350F;">
                Submitted by <b>${escapeHtml(pending.requestedBy || 'Inventory Staff')}</b> on ${formatDateTime(pending.requestedAt || nowISO())} (${Object.keys(pending.changes || {}).length} field change(s) awaiting Admin approval).
              </div>
              <div style="margin-top:4px; font-size:11.5px; color:#B45309;">
                💡 <em>The form is currently loaded with proposed values. Saving will update the pending request for Admin review.</em>
              </div>
            </div>
            <div>
              <button type="button" class="btn secondary small danger" style="padding:5px 12px; font-size:11.5px; white-space:nowrap;" onclick="cancelProductPendingEdit('${p.id}')">✕ Cancel / Withdraw Request</button>
            </div>
          </div>
        </div>
      ` : ''}
    ` : `
      <div class="full" style="background:#FFFBEB; border:1px solid #FCD34D; border-radius:var(--radius-sm); padding:10px 14px; margin-bottom:4px; font-size:12px; color:#92400E; display:flex; gap:8px; align-items:flex-start;">
        <span style="font-size:16px; line-height:1;">ℹ️</span>
        <div>
          <strong>Staff Product Request:</strong> As Inventory Staff, this new product will be submitted as <b>Pending Approval</b> for Administrator review and approval before becoming active in POS and inventory.
        </div>
      </div>
    `
  );

  const stockNoteHtml = p ? `
    <div class="full" style="background:#FAF7F2; border:1px solid var(--line); border-radius:var(--radius-sm); padding:12px 14px; display:flex; align-items:center; justify-content:space-between; gap:12px; margin-top:4px;">
      <div style="display:flex; align-items:center; gap:10px;">
        <span style="font-size:20px; line-height:1;">🔒</span>
        <div>
          <div style="font-size:11px; text-transform:uppercase; letter-spacing:0.04em; color:var(--ink-soft); font-weight:600;">Current Stock Level (Audited)</div>
          <div style="font-size:14.5px; font-weight:700; color:var(--ink); font-family:'Space Grotesk',sans-serif; display:flex; align-items:center; gap:8px;">
            ${formatLiters(p.stock)}
            ${stockBadge(p)}
          </div>
        </div>
      </div>
      <div style="font-size:11.5px; text-align:right; color:var(--ink-soft); line-height:1.4;">
        Stock cannot be edited directly.<br>
        <a href="#" onclick="closeModal();goTo('receiving');return false;" style="color:var(--teal); font-weight:600; text-decoration:underline;">Stock Receiving / Adjust &rarr;</a>
      </div>
    </div>
  ` : (isAdmin ? `
    <div class="full" style="background:#EAF4F3; border:1px solid #C5DFDC; border-radius:var(--radius-sm); padding:11px 14px; display:flex; align-items:center; gap:12px; margin-top:4px;">
      <span style="font-size:20px; line-height:1;">📦</span>
      <div style="flex:1; font-size:12px; color:var(--teal-dark); line-height:1.4;">
        <strong style="color:var(--ink);">Initial Stock: 0.00 L</strong> — New products start at 0 stock. Once saved, it will become <b>immediately active</b> and stock can be added via Stock Receiving or ordered via Purchase Order.
      </div>
    </div>
  ` : `
    <div class="full" style="background:#FAF7F2; border:1px solid var(--line); border-radius:var(--radius-sm); padding:11px 14px; display:flex; align-items:center; gap:12px; margin-top:4px;">
      <span style="font-size:20px; line-height:1;">📦</span>
      <div style="flex:1; font-size:12px; color:var(--ink-soft); line-height:1.4;">
        <strong style="color:var(--ink);">Initial Stock: 0.00 L</strong> — New products start at 0 stock. ⏳ <b>Approval Required:</b> As Inventory Staff, this product will be submitted as <b>Pending Approval</b> for the Administrator before it can be used in POS and stock receiving.
      </div>
    </div>
  `);

  openModal(modalTitle, `
<form id="product-form" onsubmit="return submitProduct(event, ${p ? `'${p.id}'` : 'null'})">
  <div class="form-grid">
    ${bannerNoticeHtml}
    <div class="field">
      <label>Product ID</label>
      <div style="display:flex; align-items:center; gap:8px; padding-top:4px;">
        ${formatProductIdBadge(p ? (p.productId || p.id) : nextProductId())}
        <span class="muted small" style="font-size:11.5px;">${p ? 'Unique permanent Product ID (Read-only)' : 'Auto-generated permanent Product ID'}</span>
      </div>
    </div>
    <div class="field">
      <label>Product Name <span style="color:var(--danger);">*</span></label>
      <input id="pf-name" value="${escapeHtml(initialName)}" placeholder="e.g. Boysen Permacoat Latex" oninput="onProductColorNameInput(document.getElementById('pf-color-name') ? document.getElementById('pf-color-name').value : '')" required>
    </div>
    <div class="field">
      <label>Brand <span style="color:var(--danger);">*</span></label>
      <input id="pf-brand" value="${escapeHtml(initialBrand)}" placeholder="e.g. Boysen, Davies, K92" required>
    </div>
    <div class="field">
      <label>Supplier</label>
      <select id="pf-supplier">
        <option value="">-- No Supplier Linked --</option>
        ${allSuppliers.map(s => `
          <option value="${escapeHtml(s.id)}" ${initialSupplierId === s.id ? 'selected' : ''}>${escapeHtml(s.name)}${s.status !== 'active' ? ' (Inactive)' : ''}</option>
        `).join('')}
      </select>
    </div>
    <div class="field">
      <label>Product Type / Category</label>
      <select id="pf-type">
        ${allTypes.map(t => `<option ${initialType === t ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}
      </select>
    </div>
    <div class="field">
      <label>Color Name <span class="muted small">(e.g. White, Sky Blue, Gloss Black)</span></label>
      <input id="pf-color-name" value="${escapeHtml(initialColorName)}" placeholder="e.g. White, Sky Blue" oninput="onProductColorNameInput(this.value)">
    </div>
    <div class="field">
      <label>Color Hex Code <span class="muted small">(Format: #FFFFFF)</span></label>
      <div style="display:flex; gap:8px; align-items:center;">
        <input id="pf-color-hex" value="${escapeHtml(currentColorHex)}" placeholder="#FFFFFF" maxlength="7" style="font-family:'Space Grotesk',monospace; font-weight:700; text-transform:uppercase;" oninput="onProductColorHexInput(this.value)">
        <label style="position:relative; display:inline-flex; align-items:center; cursor:pointer;" title="Click to pick a color visually">
          <span id="pf-color-swatch" style="display:inline-block; width:34px; height:34px; border-radius:6px; border:1px solid var(--line); background:${currentColorHex}; flex-shrink:0; box-shadow:0 1px 2px rgba(0,0,0,0.06);" title="${currentColorHex}"></span>
          <input type="color" id="pf-color-picker" value="${currentColorHex}" style="position:absolute; inset:0; opacity:0; width:100%; height:100%; cursor:pointer;" oninput="onProductColorPickerChange(this.value)">
        </label>
      </div>
      <div id="pf-hex-error" style="color:var(--danger); font-size:11.5px; margin-top:3px; display:none;">Hex Code must follow valid #FFFFFF format (e.g. #FFFFFF).</div>
    </div>
    <div class="field">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
        <label for="pf-price" style="margin:0;">Price per Liter (₱/L) <span style="color:var(--danger);">*</span></label>
        <div style="display:flex; gap:6px; align-items:center;">
          ${p && p.pendingPrice != null ? `<span class="badge" style="background:#FEF3C7; color:#92400E; border:1px solid #FCD34D; font-size:11px; padding:2px 6px;">⏳ Pending Approval: ${peso(p.pendingPrice)}</span>` : ''}
          <span id="pf-recent-pill" class="badge" style="${hasSavedRecent ? 'display:inline-flex;' : 'display:none;'} background:#EBF5FB; color:#1B4F72; border:1px solid #AED6F1; font-size:11px; padding:2px 6px;" title="Recent price before last change">
            ${hasSavedRecent ? `Recent: ${peso(p.recentPrice)}` : ''}
          </span>
        </div>
      </div>
      <input id="pf-price" type="number" min="0.01" step="any" inputmode="decimal"
        value="${currentPriceFormatted}"
        placeholder="${p ? (p.price % 1 === 0 ? p.price : Number(p.price).toFixed(2)) : '0.00'}"
        onfocus="this.select()"
        oninput="onProductPriceInput(this.value, ${p ? Number(p.price) : 'null'}, ${hasSavedRecent ? Number(p.recentPrice) : 'null'})"
        required>
      ${user && user.role === 'staff' ? `
        <div class="muted small" style="margin-top:4px; color:#92400E; font-size:11.5px;">
          ℹ️ As Inventory Staff, price changes will be submitted for Admin approval before updating in the system.
        </div>
      ` : ''}
      <div id="pf-recent-price-msg" style="${hasSavedRecent ? 'margin-top:6px;' : 'margin-top:6px; display:none;'}">
        ${hasSavedRecent ? `
          <div style="font-size:11.5px; color:var(--ink-soft); display:flex; align-items:center; gap:6px;">
            <span style="font-size:13px;">🕒</span>
            <span>Recent price: <strong style="color:var(--ink);">${peso(p.recentPrice)}</strong></span>
          </div>
        ` : ''}
      </div>
    </div>
    <div class="field">
      <label>Product Status</label>
      <select id="pf-status" onchange="onProductFormStatusChange(this.value)">
        <option value="active" ${(initialStatus === 'active') ? 'selected' : ''}>🟢 Active — Available for normal inventory operations</option>
        <option value="inactive" ${(initialStatus === 'inactive') ? 'selected' : ''}>⚪ Inactive — Temporarily unavailable for new transactions</option>
        <option value="discontinued" ${(initialStatus === 'discontinued') ? 'selected' : ''}>🟠 Discontinued — Permanently retired from sales &amp; purchasing</option>
      </select>
      <div id="pf-status-reason-box" style="${(initialStatus === 'inactive' || initialStatus === 'discontinued') ? 'margin-top:6px;' : 'margin-top:6px; display:none;'}">
        <label id="pf-status-reason-label" style="font-size:11px; font-weight:700; color:var(--ink-soft);">${initialStatus === 'discontinued' ? 'Discontinuation Reason' : 'Deactivation Reason'} <span style="color:var(--danger);">*</span></label>
        <input id="pf-status-reason" value="${escapeHtml(p ? (p.deactivationReason || p.discontinueReason || '') : '')}" placeholder="Reason for status change" style="font-size:12px;">
      </div>
    </div>
    <div class="full" style="background:#fff; border:1px solid var(--line); border-radius:var(--radius-sm); padding:12px 14px;">
      <div style="font-size:11px; text-transform:uppercase; letter-spacing:0.04em; color:var(--ink-soft); font-weight:600; margin-bottom:8px;">📏 Can Sizes for this Product (Liters)</div>
      <div id="pf-size-chips">${productSizeChipsHtml()}</div>
      <div style="display:flex; gap:8px; align-items:center; margin-top:8px;">
        <input id="pf-size-input" type="number" min="1" step="1" inputmode="numeric" placeholder="e.g. 1, 4, 20" style="max-width:170px;" onkeydown="if(event.key==='Enter'){event.preventDefault();addProductFormSize();}">
        <button type="button" class="btn secondary small" onclick="addProductFormSize()">+ Add Size</button>
      </div>
      <div style="font-size:11.5px; color:var(--ink-soft); margin-top:6px;">Stock, opened / used leftovers, POS buttons and purchase orders follow these sizes. Container sizes with stock, POs, or transactions cannot be removed.</div>
    </div>
    <div class="full" style="background:#FAF7F2; border:1px solid var(--line); border-radius:var(--radius-sm); padding:12px 14px;">
      <div style="font-size:11px; text-transform:uppercase; letter-spacing:0.04em; color:var(--ink-soft); font-weight:600; margin-bottom:8px;">🔒 Stock per Size &amp; Separate Low-Stock Thresholds</div>
      <div id="pf-size-grid">${productSizeGridHtml(p, productFormSizes)}</div>
      <div style="font-size:11.5px; color:var(--ink-soft); margin-top:8px;">Each size has its own independent low-stock threshold in cans. Sealed cans change when POs are received or items sold.</div>
    </div>
    <div class="field">
      <label>Calculated Overall Threshold (Total Liters)</label>
      <div style="display:flex; align-items:center; gap:10px;">
        <input id="pf-threshold" type="number" min="0" step="0.01" value="${p ? formatStock(p.threshold) : 5}" placeholder="5.00" required style="max-width:180px; background:#FAF8F5;" readonly title="Auto-calculated from per-size thresholds above">
        <span class="muted small" style="font-size:12px;">
          Sum of size thresholds: <strong id="pf-threshold-sum" style="color:var(--teal); font-family:'Space Grotesk',sans-serif;">0.00 L</strong>
        </span>
      </div>
      <div style="font-size:11.5px; color:var(--ink-soft); margin-top:4px;">
        ℹ️ Automatically computed from the per-size can thresholds above. Reorder alerts and stock monitoring trigger individually per can size.
      </div>
    </div>
    ${stockNoteHtml}
  </div>
</form>`,
    `<button type="button" class="btn secondary" id="pf-cancel-btn" onclick="closeModal()">Cancel</button><button type="button" class="btn" id="pf-submit-btn" onclick="submitProductFormDirectly(${p ? `'${p.id}'` : 'null'})">${submitButtonLabel}</button>`
  );
  setTimeout(() => updateProductOverallThresholdFromSizes(), 20);
}

function submitProductFormDirectly(id) {
  const form = document.getElementById('product-form');
  if (form && form.reportValidity && !form.reportValidity()) {
    return;
  }
  submitProduct(null, id);
}

function onProductPriceInput(val, origPrice, savedRecentPrice) {
  const msgEl = document.getElementById('pf-recent-price-msg');
  const pillEl = document.getElementById('pf-recent-pill');
  if (!msgEl) return;

  if (origPrice === null || origPrice === undefined || isNaN(origPrice)) {
    msgEl.style.display = 'none';
    if (pillEl) pillEl.style.display = 'none';
    return;
  }

  const trimmed = String(val === undefined || val === null ? '' : val).trim();
  const num = parseFloat(trimmed);

  if (trimmed !== '' && !isNaN(num) && num !== origPrice) {
    const diff = num - origPrice;
    const diffText = diff > 0 ? `+${peso(diff)}` : `-${peso(Math.abs(diff))}`;
    const diffColor = diff > 0 ? '#1F6F6B' : '#B03A2E';
    const arrow = diff > 0 ? '▲' : '▼';

    if (pillEl) {
      pillEl.style.display = 'inline-flex';
      pillEl.textContent = `Recent: ${peso(origPrice)}`;
      pillEl.title = `Recent price before this change was ${peso(origPrice)}`;
    }

    msgEl.style.display = 'block';
    msgEl.innerHTML = `
      <div style="background:#F0F7F6; border:1px solid #CBE5E2; border-radius:6px; padding:6px 10px; display:flex; align-items:center; justify-content:space-between; gap:8px;">
        <div style="display:flex; align-items:center; gap:6px;">
          <span style="font-size:13px;">🕒</span>
          <span style="color:var(--ink-soft); font-size:11.5px;">Recent price: <strong style="color:var(--ink); font-size:12.5px;">${peso(origPrice)}</strong></span>
        </div>
        <div style="font-size:11.5px; font-weight:700; color:${diffColor}; display:flex; align-items:center; gap:3px;">
          <span>${arrow}</span>
          <span>${diffText}</span>
          <span style="font-size:10.5px; opacity:0.8; font-weight:normal;">(${peso(num)}/L)</span>
        </div>
      </div>
    `;
  } else if (savedRecentPrice !== null && savedRecentPrice !== undefined && !isNaN(savedRecentPrice) && savedRecentPrice !== origPrice) {
    if (pillEl) {
      pillEl.style.display = 'inline-flex';
      pillEl.textContent = `Recent: ${peso(savedRecentPrice)}`;
      pillEl.title = `Recent price before last change`;
    }
    msgEl.style.display = 'block';
    msgEl.innerHTML = `
      <div style="font-size:11.5px; color:var(--ink-soft); display:flex; align-items:center; gap:6px;">
        <span style="font-size:13px;">🕒</span>
        <span>Recent price: <strong style="color:var(--ink);">${peso(savedRecentPrice)}</strong></span>
      </div>
    `;
  } else {
    if (pillEl) pillEl.style.display = 'none';
    msgEl.style.display = 'none';
    msgEl.innerHTML = '';
  }
}

function onProductColorNameInput(val) {
  const hexInput = document.getElementById('pf-color-hex');
  if (hexInput && (!hexInput.value || hexInput.value === '#FFFFFF')) {
    const nameVal = document.getElementById('pf-name') ? document.getElementById('pf-name').value : '';
    const suggested = getProductHex({ color: val, name: nameVal });
    if (suggested && /^#[0-9A-Fa-f]{6}$/.test(suggested)) {
      hexInput.value = suggested.toUpperCase();
      updateProductColorHexPreview(suggested);
    }
  }
}

function onProductColorHexInput(val) {
  val = (val || '').trim();
  const errEl = document.getElementById('pf-hex-error');
  const isValid = /^#[0-9A-Fa-f]{6}$/.test(val);
  if (errEl) {
    errEl.style.display = (val && !isValid) ? 'block' : 'none';
  }
  if (isValid) {
    updateProductColorHexPreview(val);
  }
}

function onProductColorPickerChange(val) {
  const hexInput = document.getElementById('pf-color-hex');
  if (hexInput) {
    hexInput.value = val.toUpperCase();
  }
  const errEl = document.getElementById('pf-hex-error');
  if (errEl) errEl.style.display = 'none';
  updateProductColorHexPreview(val);
}

function updateProductColorHexPreview(val) {
  const swatch = document.getElementById('pf-color-swatch');
  const picker = document.getElementById('pf-color-picker');
  if (!swatch) return;
  if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
    swatch.style.backgroundColor = val;
    swatch.title = val;
    if (picker) picker.value = val;
  }
}

function onProductFormStatusChange(val) {
  const box = document.getElementById('pf-status-reason-box');
  const label = document.getElementById('pf-status-reason-label');
  const input = document.getElementById('pf-status-reason');
  if (!box) return;
  if (val === 'inactive') {
    box.style.display = 'block';
    if (label) label.innerHTML = 'Deactivation Reason <span style="color:var(--danger);">*</span>';
    if (input) input.placeholder = 'e.g. Temporarily unavailable / supplier stockout';
  } else if (val === 'discontinued') {
    box.style.display = 'block';
    if (label) label.innerHTML = 'Discontinuation Reason <span style="color:var(--danger);">*</span>';
    if (input) input.placeholder = 'e.g. Phased out / permanently discontinued by manufacturer';
  } else {
    box.style.display = 'none';
  }
}

async function submitProduct(e, id) {
  if (e && e.preventDefault) e.preventDefault();
  if (window._isSubmittingProduct) return false;
  window._isSubmittingProduct = true;
  const submitBtn = document.getElementById('pf-submit-btn');
  if (submitBtn) submitBtn.disabled = true;
  const user = currentUser || (typeof db !== 'undefined' && db && db.users ? db.users.find(u => u.role === 'admin') : null);
  if (!user || (user.role !== 'staff' && user.role !== 'admin')) {
    if (typeof logAudit === 'function') {
      logAudit('UNAUTHORIZED_ACCESS', 'Security', `Unauthorized attempt to add or edit product by ${(user && user.name) || 'Guest'}`, {
        entityName: 'Product Catalog',
        fieldChanged: 'Access Control',
        oldValue: (user && user.role) || 'unauthenticated',
        newValue: 'Denied (Admin/Staff Required)',
        reason: 'Insufficient permissions for product management'
      });
    }
    showToast('Only Administrators and Inventory Staff can add or edit products.', 'error');
    return false;
  }
  const isAdmin = user.role === 'admin';
  const priceInput = document.getElementById('pf-price');
  let priceVal = priceInput.value.trim();
  if (!priceVal && id && priceInput.placeholder) {
    priceVal = priceInput.placeholder;
  }
  const priceRaw = Number(priceVal);
  if (isNaN(priceRaw) || priceRaw <= 0) {
    showToast('Price per Liter must be a valid positive number greater than 0.', 'error');
    if (priceInput) priceInput.focus();
    return false;
  }

  // Color name & Hex validation
  const colorNameInput = document.getElementById('pf-color-name');
  const colorHexInput = document.getElementById('pf-color-hex');
  const colorName = (colorNameInput ? colorNameInput.value.trim() : '') || 'White';
  let colorHex = (colorHexInput ? colorHexInput.value.trim().toUpperCase() : '') || '#FFFFFF';
  if (!colorHex.startsWith('#')) colorHex = '#' + colorHex;

  if (!/^#[0-9A-Fa-f]{6}$/.test(colorHex)) {
    const hexErr = document.getElementById('pf-hex-error');
    if (hexErr) hexErr.style.display = 'block';
    showToast('Invalid Hex Code format. Please enter a valid hex color like #FFFFFF.', 'error');
    if (colorHexInput) colorHexInput.focus();
    return false;
  }

  captureProductFormThresholds();
  const thresholdBySize = {};
  const cleanSizes = sanitizeSizeList(productFormSizes);

  // Validate threshold values are valid integers >= 0
  for (const s of cleanSizes) {
    const v = productFormThresholds[s];
    const numV = Number(v);
    if (v !== undefined && (isNaN(numV) || numV < 0 || !Number.isInteger(numV))) {
      showToast(`Minimum stock threshold for ${fmtSize(s)} must be a whole number 0 or greater.`, 'error');
      const threshInp = document.getElementById(`pf-thresh-size-${s}`);
      if (threshInp) threshInp.focus();
      return false;
    }
    thresholdBySize[s] = (typeof v === 'number' && !isNaN(v) && v >= 0) ? v : (s >= 16 ? 1 : (s >= 4 ? 2 : 5));
  }

  const supplierSelect = document.getElementById('pf-supplier');
  const selectedSupplierId = supplierSelect ? supplierSelect.value : '';

  const statusSelect = document.getElementById('pf-status');
  const chosenStatus = statusSelect ? statusSelect.value : 'active';
  const statusReasonInput = document.getElementById('pf-status-reason');
  const statusReason = statusReasonInput ? statusReasonInput.value.trim() : '';

  const data = {
    name: document.getElementById('pf-name').value.trim(),
    brand: document.getElementById('pf-brand').value.trim(),
    type: document.getElementById('pf-type').value,
    color: colorName,
    colorHex: colorHex,
    color_hex: colorHex,
    price: Number(priceRaw.toFixed(2)),
    threshold: Number(document.getElementById('pf-threshold').value),
    thresholdBySize: thresholdBySize,
    sizes: cleanSizes,
    status: chosenStatus
  };
  if (!data.name) {
    showToast('Please enter a product name.', 'error');
    return false;
  }
  if (!data.brand) {
    showToast('Please enter a brand name.', 'error');
    return false;
  }
  if (!data.sizes.length) {
    showToast('Add at least one can size for this product.', 'error');
    return false;
  }
  const sameKey = p => ['name', 'brand', 'color'].every(k => String(p[k] || '').trim().toLowerCase() === String(data[k] || '').trim().toLowerCase());
  if (db.products.some(p => p.id !== id && sameKey(p))) {
    showToast('A product with the same name, brand and color already exists.', 'error');
    return false;
  }

  if (id) {
    const existing = productById(id);
    if (!existing) {
      showToast('Product not found.', 'error');
      return false;
    }

    // Check removed sizes against stock/transaction history
    const oldSizes = existing.sizes || [];
    const addedSizes = (data.sizes || []).filter(s => !oldSizes.includes(s));
    const removedSizes = (oldSizes || []).filter(s => !(data.sizes || []).includes(s));

    for (const remS of removedSizes) {
      const remCheck = canRemoveContainerSize(existing, remS);
      if (!remCheck.allowed) {
        showToast(remCheck.reason, 'error');
        return false;
      }
    }

    // Require reason if deactivating or discontinuing
    if (chosenStatus === 'inactive' && existing.status !== 'inactive' && !statusReason) {
      showToast('Please provide a reason for setting this product to Inactive.', 'error');
      if (statusReasonInput) statusReasonInput.focus();
      return false;
    }
    if (chosenStatus === 'discontinued' && existing.status !== 'discontinued' && !statusReason) {
      showToast('Please provide a reason for setting this product to Discontinued.', 'error');
      if (statusReasonInput) statusReasonInput.focus();
      return false;
    }

    const currentSuppliers = (typeof suppliersForProduct === 'function') ? suppliersForProduct(id) : [];
    const oldSupplierId = currentSuppliers.length > 0 ? currentSuppliers[0].id : '';

    const changes = {};
    if (data.name !== existing.name) changes.name = { label: 'Product Name', old: existing.name, new: data.name };
    if (data.brand !== existing.brand) changes.brand = { label: 'Brand', old: existing.brand, new: data.brand };
    if (data.type !== existing.type) changes.type = { label: 'Type', old: existing.type, new: data.type };
    if (data.color !== existing.color) changes.color = { label: 'Color', old: existing.color, new: data.color };
    if (data.colorHex !== (existing.colorHex || existing.color_hex)) changes.colorHex = { label: 'Hex Code', old: existing.colorHex || existing.color_hex || '#FFFFFF', new: data.colorHex };
    if (chosenStatus !== (existing.status || 'active')) changes.status = { label: 'Status', old: existing.status || 'active', new: chosenStatus };

    const oldPrice = Number(existing.price);
    const newPrice = Number(data.price);
    if (!isNaN(oldPrice) && oldPrice !== newPrice) {
      changes.price = { label: 'Price per Liter', old: oldPrice, new: newPrice };
    }

    if (addedSizes.length > 0 || removedSizes.length > 0) {
      changes.sizes = { label: 'Can Sizes', old: oldSizes, new: data.sizes, added: addedSizes, removed: removedSizes };
    }

    const oldThresh = Number(existing.threshold);
    const newThresh = Number(data.threshold);
    if (!isNaN(oldThresh) && oldThresh !== newThresh) {
      changes.threshold = { label: 'Overall Threshold', old: oldThresh, new: newThresh };
    }

    const oldTBS = existing.thresholdBySize || {};
    const newTBS = data.thresholdBySize || {};
    let tbsChanged = false;
    for (const s of (data.sizes || [])) {
      if (Number(oldTBS[s] || 0) !== Number(newTBS[s] || 0)) {
        tbsChanged = true;
        break;
      }
    }
    if (tbsChanged) {
      changes.thresholdBySize = { label: 'Per-Size Thresholds', old: oldTBS, new: newTBS };
    }

    if (selectedSupplierId !== oldSupplierId) {
      const oldS = supplierById(oldSupplierId);
      const newS = supplierById(selectedSupplierId);
      changes.supplier = { label: 'Supplier', old: oldS ? oldS.name : 'None', new: newS ? newS.name : 'None' };
    }

    const changeKeys = Object.keys(changes);

    // Sync supplier in db.suppliers
    if (selectedSupplierId) {
      (db.suppliers || []).forEach(s => {
        if (s.id === selectedSupplierId) {
          if (!Array.isArray(s.productIds)) s.productIds = [];
          if (!s.productIds.includes(id)) s.productIds.push(id);
        } else {
          if (Array.isArray(s.productIds)) {
            s.productIds = s.productIds.filter(pid => pid !== id);
          }
        }
      });
    } else {
      (db.suppliers || []).forEach(s => {
        if (Array.isArray(s.productIds)) {
          s.productIds = s.productIds.filter(pid => pid !== id);
        }
      });
    }

    const adminName = (currentUser && currentUser.name) || 'Administrator';
    window._isSubmittingProduct = true;
    const submitBtn = document.getElementById('pf-submit-btn');
    if (submitBtn) submitBtn.disabled = true;

    if (isAdmin) {
      if (changeKeys.length === 0 && !existing.pendingEdit) {
        window._isSubmittingProduct = false;
        if (submitBtn) submitBtn.disabled = false;
        showToast(`Product "${existing.name}" saved. No changes made.`, 'ok');
        closeModal();
        return false;
      }

      const prevProductName = existing.name;

      // Record price history & dedicated PRODUCT_PRICE_CHANGE event
      if (changes.price) {
        if (!Array.isArray(existing.priceHistory)) existing.priceHistory = [];
        existing.priceHistory.push({
          oldPrice: oldPrice,
          newPrice: newPrice,
          changedBy: adminName,
          changedAt: nowISO(),
          reason: 'Price updated in Edit Product'
        });
        existing.recentPrice = oldPrice;
        existing.price = newPrice;
        logAudit('PRODUCT_PRICE_CHANGE', 'Product', `Price changed for ${prevProductName} from ${peso(oldPrice)} to ${peso(newPrice)}`, {
          productId: existing.id,
          entityName: prevProductName,
          fieldChanged: 'Price per Liter',
          oldValue: peso(oldPrice),
          newValue: peso(newPrice),
          reason: statusReason || 'Price updated via Product Management'
        });
      } else {
        existing.price = newPrice;
      }

      // Record container size additions / removals
      if (addedSizes.length > 0) {
        logAudit('CONTAINER_SIZE_ADD', 'Inventory', `Added container size(s) ${addedSizes.map(s => s + 'L').join(', ')} to ${prevProductName}`, {
          productId: existing.id,
          entityName: prevProductName,
          fieldChanged: 'Container Sizes',
          oldValue: oldSizes.length ? oldSizes.map(s => s + 'L').join(', ') : 'None',
          newValue: data.sizes.map(s => s + 'L').join(', ')
        });
      }
      if (removedSizes.length > 0) {
        logAudit('CONTAINER_SIZE_REMOVE', 'Inventory', `Removed container size(s) ${removedSizes.map(s => s + 'L').join(', ')} from ${prevProductName}`, {
          productId: existing.id,
          entityName: prevProductName,
          fieldChanged: 'Container Sizes',
          oldValue: oldSizes.map(s => s + 'L').join(', '),
          newValue: data.sizes.map(s => s + 'L').join(', ')
        });
      }

      // Record stock threshold changes
      if (changes.threshold || changes.thresholdBySize) {
        const oldThreshDesc = `${formatLiters(oldThresh)} (${oldSizes.map(s => `${s}L: ${oldTBS[s] ?? 0} cans`).join(', ')})`;
        const newThreshDesc = `${formatLiters(newThresh)} (${data.sizes.map(s => `${s}L: ${newTBS[s] ?? 0} cans`).join(', ')})`;
        logAudit('STOCK_THRESHOLD_CHANGE', 'Inventory', `Updated stock threshold for ${prevProductName} from ${formatLiters(oldThresh)} to ${formatLiters(newThresh)}`, {
          productId: existing.id,
          entityName: prevProductName,
          fieldChanged: 'Minimum Stock Threshold',
          oldValue: oldThreshDesc,
          newValue: newThreshDesc
        });
      }

      // Record status changes & audit
      const oldStatus = existing.status || 'active';
      if (chosenStatus !== oldStatus) {
        existing.status = chosenStatus;
        if (chosenStatus === 'inactive') {
          existing.deactivationReason = statusReason;
          existing.deactivatedAt = nowISO();
          existing.deactivatedBy = adminName;
          logAudit('PRODUCT_DEACTIVATE', 'Product', `Product ${prevProductName} deactivated by ${adminName}. Reason: ${statusReason}`, {
            productId: existing.id,
            entityName: prevProductName,
            fieldChanged: 'Product Status',
            oldValue: oldStatus.charAt(0).toUpperCase() + oldStatus.slice(1),
            newValue: 'Inactive',
            reason: statusReason
          });
        } else if (chosenStatus === 'discontinued') {
          existing.discontinueReason = statusReason;
          logAudit('PRODUCT_DISCONTINUE', 'Product', `Product ${prevProductName} discontinued by ${adminName}. Reason: ${statusReason}`, {
            productId: existing.id,
            entityName: prevProductName,
            fieldChanged: 'Product Status',
            oldValue: oldStatus.charAt(0).toUpperCase() + oldStatus.slice(1),
            newValue: 'Discontinued',
            reason: statusReason
          });
        } else if (chosenStatus === 'active') {
          existing.deactivationReason = null;
          existing.deactivatedAt = null;
          existing.deactivatedBy = null;
          logAudit('PRODUCT_REACTIVATE', 'Product', `Product ${prevProductName} reactivated by ${adminName}`, {
            productId: existing.id,
            entityName: prevProductName,
            fieldChanged: 'Product Status',
            oldValue: oldStatus.charAt(0).toUpperCase() + oldStatus.slice(1),
            newValue: 'Active',
            reason: 'Reactivated for store operations'
          });
        }
      } else if (chosenStatus === 'inactive' && statusReason) {
        existing.deactivationReason = statusReason;
      } else if (chosenStatus === 'discontinued' && statusReason) {
        existing.discontinueReason = statusReason;
      }

      existing.name = data.name;
      existing.productName = data.name;
      existing.product_name = data.name;
      existing.brand = data.brand;
      existing.type = data.type;
      existing.category = data.type;
      existing.color = data.color;
      existing.colorHex = data.colorHex;
      existing.color_hex = data.colorHex;
      existing.sizes = data.sizes;
      existing.threshold = data.threshold;
      existing.thresholdBySize = data.thresholdBySize;
      existing.supplierId = selectedSupplierId;
      existing.supplier_id = selectedSupplierId;
      existing.updatedBy = adminName;
      existing.updatedAt = nowISO();

      // Sync variant list keeping existing size IDs intact
      const prevVariants = existing.sizesData || [];
      existing.sizesData = (data.sizes || []).map(s => {
        let v = prevVariants.find(x => normalizeCanSize(x.containerSize) === s);
        if (!v) v = productFormSizeVariants[s];
        const sizeId = (v && v.sizeId) ? v.sizeId : nextSizeId();
        const invId = (v && v.inventoryId) ? v.inventoryId : nextInventoryId();
        return {
          sizeId: sizeId,
          productId: existing.productId || existing.id,
          containerSize: s,
          pricePerLiter: Number(data.price),
          pricePerCan: Number((Number(data.price) * s).toFixed(2)),
          minimumStock: data.thresholdBySize[s] !== undefined ? Number(data.thresholdBySize[s]) : (s >= 16 ? 1 : (s >= 4 ? 2 : 5)),
          sealedQuantity: v ? Number(v.sealedQuantity || 0) : productCanCount(existing, s),
          openedQuantity: v ? Number(v.openedQuantity || 0) : (productOpenedLiters(existing, s) > 0 ? 1 : 0),
          remainingVolume: v ? Number(v.remainingVolume || 0) : productOpenedLiters(existing, s),
          isActive: true,
          inventoryId: invId
        };
      });

      const hadPendingEdit = Boolean(existing.pendingEdit);
      existing.pendingEdit = null;
      existing.pendingPrice = null;
      existing.pendingSizes = [];

      // Log PRODUCT_UPDATE only when general product attributes changed (or pending edit was resolved), avoiding duplicate events when only price/status/size/threshold changed
      const generalChangeKeys = changeKeys.filter(k => !['price', 'status', 'sizes', 'threshold', 'thresholdBySize'].includes(k));
      if (generalChangeKeys.length > 0 || (hadPendingEdit && changeKeys.length === 0)) {
        const changeSummary = generalChangeKeys.map(k => changes[k].label).join(', ');
        const oldParts = generalChangeKeys.map(k => `${changes[k].label}: ${changes[k].old}`).join(' · ');
        const newParts = generalChangeKeys.map(k => `${changes[k].label}: ${changes[k].new}`).join(' · ');
        logAudit(
          'PRODUCT_UPDATE',
          'Product',
          `Updated product ${existing.name}${changeSummary ? ` (${changeSummary})` : ''}${hadPendingEdit ? ' (resolved pending request)' : ''}`,
          {
            productId: existing.id,
            entityName: existing.name,
            fieldChanged: changeSummary || 'Product Attributes',
            oldValue: oldParts || 'Pending Edit State',
            newValue: newParts || 'Updated State',
            meta: { changes }
          }
        );
      }
      showToast(`Product "${existing.name}" updated successfully!`, 'ok');
    } else {
      // Staff workflow
      if (changeKeys.length === 0) {
        if (existing.pendingEdit) {
          const confirmed = await showConfirmDialog({
            title: 'Withdraw Pending Edit Request?',
            message: `All details for <b>${escapeHtml(existing.name)}</b> have been reverted to their original state.<br><br>Do you want to cancel and withdraw the pending edit request?`,
            icon: '🔄',
            confirmText: 'Yes, Withdraw Request',
            cancelText: 'Stay in Form',
            danger: true
          });
          if (confirmed) {
            window._isSubmittingProduct = false;
            if (submitBtn) submitBtn.disabled = false;
            await cancelProductPendingEdit(existing.id, true);
            return false;
          }
        }
        window._isSubmittingProduct = false;
        if (submitBtn) submitBtn.disabled = false;
        showToast('No changes were made to the product details.', 'info');
        closeModal();
        return false;
      }

      const isUpdate = Boolean(existing.pendingEdit);
      if (isUpdate) {
        const confirmed = await showConfirmDialog({
          title: 'Update Pending Request?',
          message: `There is an existing pending edit request for <b>${escapeHtml(existing.name)}</b> (submitted by <b>${escapeHtml(existing.pendingEdit.requestedBy || 'Staff')}</b>).<br><br>Do you want to update the pending request with these new changes for Admin review?`,
          icon: '✏️',
          confirmText: 'Yes, Update Request',
          cancelText: 'Back to Form',
          danger: false
        });
        if (!confirmed) {
          window._isSubmittingProduct = false;
          if (submitBtn) submitBtn.disabled = false;
          return false;
        }
      }

      existing.pendingEdit = {
        requestedBy: (currentUser && currentUser.name) || 'Inventory Staff',
        requestedAt: nowISO(),
        changes: changes,
        proposed: {
          name: data.name,
          brand: data.brand,
          type: data.type,
          color: data.color,
          colorHex: data.colorHex,
          price: data.price,
          sizes: sanitizeSizeList([...(existing.sizes || []), ...addedSizes]),
          threshold: data.threshold,
          thresholdBySize: data.thresholdBySize,
          supplierId: selectedSupplierId,
          status: chosenStatus
        }
      };

      if (changes.price) {
        existing.pendingPrice = changes.price.new;
      } else {
        existing.pendingPrice = null;
      }
      if (changes.sizes && addedSizes.length > 0) {
        existing.pendingSizes = addedSizes;
      } else {
        existing.pendingSizes = [];
      }

      const changeSummary = changeKeys.map(k => changes[k].label).join(', ');
      const oldParts = changeKeys.map(k => `${changes[k].label}: ${k === 'price' ? peso(changes[k].old) : (Array.isArray(changes[k].old) ? changes[k].old.map(s => s + 'L').join(', ') : (typeof changes[k].old === 'object' ? JSON.stringify(changes[k].old) : changes[k].old))}`).join(' · ');
      const newParts = changeKeys.map(k => `${changes[k].label}: ${k === 'price' ? peso(changes[k].new) : (Array.isArray(changes[k].new) ? changes[k].new.map(s => s + 'L').join(', ') : (typeof changes[k].new === 'object' ? JSON.stringify(changes[k].new) : changes[k].new))}`).join(' · ');
      logAudit(
        isUpdate ? 'PRODUCT_EDIT_UPDATE' : 'PRODUCT_EDIT_REQUEST',
        'Product',
        `Staff ${isUpdate ? 'updated' : 'submitted'} edit request for ${existing.name} (${changeSummary}) for Admin approval`,
        {
          productId: existing.id,
          entityName: existing.name,
          fieldChanged: changeSummary,
          oldValue: oldParts,
          newValue: newParts,
          meta: { changes }
        }
      );
      showToast(
        isUpdate
          ? `Product edit request (${changeSummary}) successfully updated for Admin approval!`
          : `Product edit request (${changeSummary}) submitted for Admin approval!`,
        'ok'
      );
    }
  } else {
    window._isSubmittingProduct = true;
    const submitBtn = document.getElementById('pf-submit-btn');
    if (submitBtn) submitBtn.disabled = true;
    // New product
    if (selectedSupplierId) {
      const targetSupplier = (db.suppliers || []).find(s => s.id === selectedSupplierId);
      if (targetSupplier) {
        if (!Array.isArray(targetSupplier.productIds)) targetSupplier.productIds = [];
      }
    }

    const newPid = nextProductId();
    const newSizesData = (data.sizes || []).map(s => {
      const v = productFormSizeVariants[s];
      return {
        sizeId: (v && v.sizeId) ? v.sizeId : nextSizeId(),
        productId: newPid,
        containerSize: s,
        pricePerLiter: Number(data.price),
        pricePerCan: Number((Number(data.price) * s).toFixed(2)),
        minimumStock: data.thresholdBySize[s] !== undefined ? Number(data.thresholdBySize[s]) : (s >= 16 ? 1 : (s >= 4 ? 2 : 5)),
        sealedQuantity: 0,
        openedQuantity: 0,
        remainingVolume: 0,
        isActive: true,
        inventoryId: (v && v.inventoryId) ? v.inventoryId : nextInventoryId()
      };
    });

    if (isAdmin) {
      data.recentPrice = null;
      data.pendingPrice = null;
      data.pendingSizes = [];
      data.pendingEdit = null;
      const newProd = {
        id: newPid,
        productId: newPid,
        product_id: newPid,
        productName: data.name,
        product_name: data.name,
        category: data.type,
        supplierId: selectedSupplierId || null,
        supplier_id: selectedSupplierId || null,
        status: chosenStatus || 'active',
        colorHex: colorHex,
        color_hex: colorHex,
        priceHistory: [],
        createdBy: (currentUser && currentUser.name) || 'Administrator',
        createdAt: nowISO(),
        updatedBy: (currentUser && currentUser.name) || 'Administrator',
        updatedAt: nowISO(),
        reviewedBy: (currentUser && currentUser.name) || 'Administrator',
        reviewedAt: nowISO(),
        stock: 0,
        canStock: {},
        openedStock: 0,
        openedCanSize: 0,
        openedBySize: {},
        sizesData: newSizesData,
        ...data
      };
      if (chosenStatus === 'inactive' && statusReason) {
        newProd.deactivationReason = statusReason;
        newProd.deactivatedAt = nowISO();
        newProd.deactivatedBy = (currentUser && currentUser.name) || 'Administrator';
      } else if (chosenStatus === 'discontinued' && statusReason) {
        newProd.discontinueReason = statusReason;
      }

      if (selectedSupplierId) {
        const targetSupplier = (db.suppliers || []).find(s => s.id === selectedSupplierId);
        if (targetSupplier) {
          if (!Array.isArray(targetSupplier.productIds)) targetSupplier.productIds = [];
          if (!targetSupplier.productIds.includes(newProd.id)) targetSupplier.productIds.push(newProd.id);
        }
      }

      db.products.push(newProd);
      logAudit('PRODUCT_CREATE', 'Product', `Created new product ${data.name} (${data.brand} · ${data.type}, Base Price: ${peso(data.price)}/L)`, {
        productId: newPid,
        entityName: data.name,
        fieldChanged: 'New Product Record',
        oldValue: 'None',
        newValue: `${data.name} (${data.brand} · ${data.type}, Color: ${data.color}, Price: ${peso(data.price)}/L, Sizes: ${data.sizes.map(s => s + 'L').join(', ')})`,
        referenceNo: newPid
      });
      showToast(`Product "${data.name}" added successfully and is now ${chosenStatus}!`, 'ok');
    } else {
      data.recentPrice = null;
      const newProd = {
        ...data,
        id: newPid,
        productId: newPid,
        product_id: newPid,
        productName: data.name,
        product_name: data.name,
        category: data.type,
        supplierId: selectedSupplierId || null,
        supplier_id: selectedSupplierId || null,
        status: 'pending_approval',
        colorHex: colorHex,
        color_hex: colorHex,
        priceHistory: [],
        requestedBy: (currentUser && currentUser.name) || 'Inventory Staff',
        requestedAt: nowISO(),
        stock: 0,
        canStock: {},
        openedStock: 0,
        openedCanSize: 0,
        openedBySize: {},
        sizesData: newSizesData,
        pendingSizes: []
      };

      if (selectedSupplierId) {
        const targetSupplier = (db.suppliers || []).find(s => s.id === selectedSupplierId);
        if (targetSupplier) {
          if (!Array.isArray(targetSupplier.productIds)) targetSupplier.productIds = [];
          if (!targetSupplier.productIds.includes(newProd.id)) targetSupplier.productIds.push(newProd.id);
        }
      }

      db.products.push(newProd);
      logAudit('PRODUCT_REQUEST', 'Product', `Staff submitted new product ${data.name} (price ${peso(data.price)}) for Admin approval`, {
        productId: newPid,
        entityName: data.name,
        fieldChanged: 'New Product Request',
        oldValue: 'None',
        newValue: `Pending Approval (${data.brand} · ${data.type}, Price: ${peso(data.price)}/L, Sizes: ${data.sizes.map(s => s + 'L').join(', ')})`,
        referenceNo: newPid
      });
      showToast(`Product "${data.name}" submitted for Admin approval!`, 'ok');
    }
  }
  try {
    await saveDB();
    closeModal();
    if (typeof renderInventoryTable === 'function') renderInventoryTable();
    if (typeof renderPage === 'function') renderPage();
  } catch (err) {
    console.error('Error saving to database:', err);
    showToast('Failed to save product changes to database.', 'error');
  } finally {
    window._isSubmittingProduct = false;
    const submitBtn = document.getElementById('pf-submit-btn');
    if (submitBtn) submitBtn.disabled = false;
  }
  return false;
}

async function approvePendingProduct(id) {
  if (!currentUser || currentUser.role !== 'admin') {
    showToast('Only Administrators can approve product requests.', 'error');
    return;
  }
  const p = productById(id);
  if (!p || p.status !== 'pending_approval') return;
  p.status = 'active';
  p.reviewedBy = (currentUser && currentUser.name) || 'Administrator';
  p.reviewedAt = nowISO();
  logAudit('PRODUCT_APPROVE', 'Product', `Approved and activated new product ${p.name}`, {
    productId: p.id,
    entityName: p.name,
    fieldChanged: 'Product Status',
    oldValue: 'Pending Approval',
    newValue: 'Active',
    reason: `Requested by ${p.requestedBy || 'Inventory Staff'}`
  });
  await saveDB();
  showToast(`Product "${p.name}" approved and activated!`, 'ok');
  renderPage();
}

async function rejectPendingProduct(id) {
  if (!currentUser || currentUser.role !== 'admin') {
    showToast('Only Administrators can reject product requests.', 'error');
    return;
  }
  const p = productById(id);
  if (!p || p.status !== 'pending_approval') return;
  const confirmed = await showConfirmDialog({
    title: 'Reject Product Request?',
    message: `Are you sure you want to reject and remove product request <b>${escapeHtml(p.name)}</b>? This will be permanently removed.`,
    icon: '🗑️',
    confirmText: 'Yes, Reject & Remove',
    cancelText: 'Cancel',
    danger: true
  });
  if (!confirmed) return;
  db.products = db.products.filter(item => item.id !== id);
  logAudit('PRODUCT_REJECT', 'Product', `Rejected product request ${p.name}`, {
    productId: p.id,
    entityName: p.name,
    fieldChanged: 'Product Request Status',
    oldValue: 'Pending Approval',
    newValue: 'Rejected & Removed',
    reason: `Requested by ${p.requestedBy || 'Inventory Staff'}`
  });
  await saveDB();
  showToast(`Product request "${p.name}" rejected.`, 'ok');
  renderPage();
}

async function approvePendingProductSizes(id) {
  if (!currentUser || currentUser.role !== 'admin') {
    showToast('Only Administrators can approve product sizes.', 'error');
    return;
  }
  const p = productById(id);
  if (!p || !p.pendingSizes || !p.pendingSizes.length) return;
  const prevSizes = [...(p.sizes || [])];
  const approvedSizes = [...p.pendingSizes];
  p.sizes = sanitizeSizeList([...(p.sizes || []), ...p.pendingSizes]);
  p.pendingSizes = [];
  syncProductVariants(p);
  logAudit('CONTAINER_SIZE_ADD', 'Inventory', `Approved and added container size(s) ${approvedSizes.map(s => s + 'L').join(', ')} for ${p.name}`, {
    productId: p.id,
    entityName: p.name,
    fieldChanged: 'Container Sizes',
    oldValue: prevSizes.map(s => s + 'L').join(', '),
    newValue: p.sizes.map(s => s + 'L').join(', ')
  });
  await saveDB();
  showToast(`Approved size(s) [${approvedSizes.map(s => s + 'L').join(', ')}] for "${p.name}".`, 'ok');
  renderPage();
}

async function rejectPendingProductSizes(id) {
  if (!currentUser || currentUser.role !== 'admin') {
    showToast('Only Administrators can reject product sizes.', 'error');
    return;
  }
  const p = productById(id);
  if (!p || !p.pendingSizes || !p.pendingSizes.length) return;
  const rejectedSizes = [...p.pendingSizes];
  p.pendingSizes = [];
  logAudit('PRODUCT_SIZE_REJECT', 'Product', `Rejected size(s) [${rejectedSizes.map(s => s + 'L').join(', ')}] for ${p.name}`, {
    productId: p.id,
    entityName: p.name,
    fieldChanged: 'Pending Container Sizes',
    oldValue: `Pending: ${rejectedSizes.map(s => s + 'L').join(', ')}`,
    newValue: 'Rejected'
  });
  await saveDB();
  showToast(`Rejected new sizes for "${p.name}".`, 'ok');
  renderPage();
}

async function approvePendingProductPrice(id) {
  if (!currentUser || currentUser.role !== 'admin') {
    showToast('Only Administrators can approve product prices.', 'error');
    return;
  }
  const p = productById(id);
  if (!p || p.pendingPrice === null || p.pendingPrice === undefined) return;
  const oldPrice = Number(p.price);
  const newPrice = Number(p.pendingPrice);
  p.recentPrice = oldPrice;
  p.price = newPrice;
  p.pendingPrice = null;
  logAudit('PRODUCT_PRICE_CHANGE', 'Product', `Approved price change for ${p.name}: ${peso(oldPrice)} ➔ ${peso(newPrice)}`, {
    productId: p.id,
    entityName: p.name,
    fieldChanged: 'Price per Liter',
    oldValue: peso(oldPrice),
    newValue: peso(newPrice),
    reason: 'Approved Staff Price Change Request'
  });
  await saveDB();
  showToast(`✓ Price for "${p.name}" updated to ${peso(newPrice)}!`, 'ok');
  renderPage();
}

async function rejectPendingProductPrice(id) {
  if (!currentUser || currentUser.role !== 'admin') {
    showToast('Only Administrators can reject product prices.', 'error');
    return;
  }
  const p = productById(id);
  if (!p || p.pendingPrice === null || p.pendingPrice === undefined) return;
  const rejectedPrice = Number(p.pendingPrice);
  p.pendingPrice = null;
  logAudit('PRODUCT_PRICE_REJECT', 'Product', `Rejected price change of ${peso(rejectedPrice)} for ${p.name}`, {
    productId: p.id,
    entityName: p.name,
    fieldChanged: 'Requested Price per Liter',
    oldValue: `Current: ${peso(p.price)} (Requested: ${peso(rejectedPrice)})`,
    newValue: `${peso(p.price)} (Request Rejected)`
  });
  await saveDB();
  showToast(`Price change for "${p.name}" was rejected.`, 'ok');
  renderPage();
}

async function approveProductPendingEdits(id) {
  if (!currentUser || currentUser.role !== 'admin') {
    showToast('Only Administrators can approve product edits.', 'error');
    return;
  }
  const p = productById(id);
  if (!p || !p.pendingEdit) return;

  const edit = p.pendingEdit;
  const prop = edit.proposed || {};
  const chg = edit.changes || {};
  const reviewer = (currentUser && currentUser.name) || 'Administrator';
  const prevName = p.name;

  if (prop.name) p.name = prop.name;
  if (prop.brand) p.brand = prop.brand;
  if (prop.type) p.type = prop.type;
  if (prop.color) p.color = prop.color;
  if (prop.threshold !== undefined && !isNaN(Number(prop.threshold))) {
    p.threshold = Number(prop.threshold);
  }
  if (prop.thresholdBySize && typeof prop.thresholdBySize === 'object' && !Array.isArray(prop.thresholdBySize)) {
    p.thresholdBySize = prop.thresholdBySize;
  }
  if (Array.isArray(prop.sizes) && prop.sizes.length > 0) {
    p.sizes = sanitizeSizeList([...(p.sizes || []), ...prop.sizes]);
  }
  if (prop.price !== undefined && !isNaN(Number(prop.price))) {
    const oldPrice = Number(p.price);
    const newPrice = Number(prop.price);
    if (oldPrice !== newPrice) {
      p.recentPrice = oldPrice;
      p.price = newPrice;
    }
  }

  p.pendingEdit = null;
  p.pendingPrice = null;
  p.pendingSizes = [];
  p.reviewedBy = reviewer;
  p.reviewedAt = nowISO();

  const chgKeys = Object.keys(chg);
  const fieldLabels = chgKeys.map(k => chg[k].label || k).join(', ');
  const oldParts = chgKeys.map(k => `${chg[k].label || k}: ${k === 'price' ? peso(chg[k].old) : (Array.isArray(chg[k].old) ? chg[k].old.map(s => s + 'L').join(', ') : (typeof chg[k].old === 'object' ? JSON.stringify(chg[k].old) : chg[k].old))}`).join(' · ');
  const newParts = chgKeys.map(k => `${chg[k].label || k}: ${k === 'price' ? peso(chg[k].new) : (Array.isArray(chg[k].new) ? chg[k].new.map(s => s + 'L').join(', ') : (typeof chg[k].new === 'object' ? JSON.stringify(chg[k].new) : chg[k].new))}`).join(' · ');

  logAudit('PRODUCT_EDIT_APPROVE', 'Product', `Approved edit request for "${p.name}" (requested by ${edit.requestedBy || 'Staff'})`, {
    productId: p.id,
    entityName: p.name,
    fieldChanged: fieldLabels || 'Product Attributes',
    oldValue: oldParts || prevName,
    newValue: newParts || p.name,
    reason: `Approved edit request from ${edit.requestedBy || 'Staff'}`,
    meta: { changes: chg }
  });
  await saveDB();
  showToast(`✓ All edits for "${p.name}" approved and updated!`, 'ok');
  renderPage();
}

async function rejectProductPendingEdits(id) {
  if (!currentUser || currentUser.role !== 'admin') {
    showToast('Only Administrators can reject product edits.', 'error');
    return;
  }
  const p = productById(id);
  if (!p || !p.pendingEdit) return;

  const confirmed = await showConfirmDialog({
    title: 'Reject Product Edits?',
    message: `Are you sure you want to reject the pending edit request for <b>${escapeHtml(p.name)}</b>?`,
    icon: '❌',
    confirmText: 'Yes, Reject Edits',
    cancelText: 'Cancel',
    danger: true
  });
  if (!confirmed) return;

  const edit = p.pendingEdit;
  const chg = edit.changes || {};
  const chgKeys = Object.keys(chg);
  const fieldLabels = chgKeys.map(k => chg[k].label || k).join(', ');
  p.pendingEdit = null;
  p.pendingPrice = null;
  p.pendingSizes = [];

  logAudit('PRODUCT_EDIT_REJECT', 'Product', `Rejected edit request for "${p.name}" (requested by ${edit.requestedBy || 'Staff'})`, {
    productId: p.id,
    entityName: p.name,
    fieldChanged: fieldLabels || 'Pending Product Edits',
    oldValue: `Pending Request by ${edit.requestedBy || 'Staff'}`,
    newValue: 'Rejected (Original values retained)',
    meta: { changes: chg }
  });
  await saveDB();
  showToast(`Edit request for "${p.name}" was rejected.`, 'ok');
  renderPage();
}

async function cancelProductPendingEdit(id, skipConfirm = false) {
  if (!currentUser) return;
  const p = productById(id);
  if (!p || !p.pendingEdit) return;

  const isAdmin = currentUser.role === 'admin';
  const isStaff = currentUser.role === 'staff';
  if (!isAdmin && !isStaff) {
    showToast('You do not have permission to cancel this edit request.', 'error');
    return;
  }

  const edit = p.pendingEdit;
  const requester = edit.requestedBy || 'Staff';

  if (!skipConfirm) {
    const confirmed = await showConfirmDialog({
      title: 'Cancel Edit Request?',
      message: `Are you sure you want to cancel or withdraw the pending edit request for <b>${escapeHtml(p.name)}</b>?<br><br><span style="font-size:12px; color:var(--ink-soft);">The submitted changes will be discarded and current product information will be kept.</span>`,
      icon: '🗑️',
      confirmText: 'Yes, Cancel Request',
      cancelText: 'Never Mind',
      danger: true
    });
    if (!confirmed) return;
  }

  p.pendingEdit = null;
  p.pendingPrice = null;
  p.pendingSizes = [];

  logAudit('PRODUCT_EDIT_CANCEL', 'Product', `${(currentUser && currentUser.name) || 'User'} cancelled pending edit request for "${p.name}" (previously requested by ${requester})`, {
    productId: p.id,
    entityName: p.name,
    fieldChanged: 'Pending Edit Request',
    oldValue: `Pending Request by ${requester}`,
    newValue: 'Cancelled / Withdrawn'
  });
  await saveDB();
  showToast(`Pending edit request for "${p.name}" has been cancelled.`, 'ok');
  closeModal();
  renderPage();
}

/**
 * Checks all dependencies for a product across local state and backend database.
 * Returns an array of human-readable dependency descriptions.
 */
async function getProductDependencies(productId) {
  const p = productById(productId);
  const pid = productId;
  const altPid = p ? (p.productId || p.id) : productId;
  const ids = [pid, altPid].filter(Boolean);

  const deps = [];

  // 1. Check stock in current memory
  if (p) {
    let sealedCans = 0;
    (p.sizes || []).forEach(s => {
      sealedCans += productCanCount(p, s);
    });
    if (sealedCans > 0) {
      deps.push(`Has ${sealedCans} sealed can(s) currently in stock (${formatLiters(p.stock)})`);
    }
    const openedVol = productOpenedStock(p);
    if (openedVol > 0) {
      deps.push(`Has active opened paint (${formatLiters(openedVol)}) used in color mixing`);
    }
  }

  // 2. Check local movements
  const movesCount = (db.movements || []).filter(m => {
    const mPid = m.productId || m.product_id;
    return ids.includes(mPid);
  }).length;
  if (movesCount > 0) {
    deps.push(`Has ${movesCount} recorded stock movement transaction(s)`);
  }

  // 3. Check local purchase orders
  let poCount = 0;
  (db.purchaseOrders || []).forEach(po => {
    const hasItem = (po.items || []).some(it => ids.includes(it.productId || it.product_id));
    if (hasItem) poCount++;
  });
  if (poCount > 0) {
    deps.push(`Referenced in ${poCount} purchase order(s)`);
  }

  // 4. Check local customer sales receipts
  let salesCount = 0;
  (db.sales || []).forEach(sl => {
    const hasItem = (sl.items || []).some(it => ids.includes(it.productId || it.product_id));
    if (hasItem) salesCount++;
  });
  if (salesCount > 0) {
    deps.push(`Referenced in ${salesCount} customer sales transaction(s)`);
  }

  // 5. Check local adjustment requests
  let adjCount = 0;
  (db.adjustmentRequests || []).forEach(ar => {
    const hasItem = (ar.rows || []).some(rw => ids.includes(rw.productId || rw.product_id));
    if (hasItem) adjCount++;
  });
  if (adjCount > 0) {
    deps.push(`Referenced in ${adjCount} stock adjustment request(s)`);
  }

  // 6. Query backend dependency check endpoint for safety
  try {
    const resp = await fetch(`api/db.php?action=check_product_dependencies&id=${encodeURIComponent(pid)}&productId=${encodeURIComponent(altPid)}`);
    if (resp.ok) {
      const json = await resp.json();
      if (json && json.success && Array.isArray(json.dependencies)) {
        json.dependencies.forEach(d => {
          if (!deps.includes(d)) deps.push(d);
        });
      }
    }
  } catch (e) {
    console.warn('Could not query backend dependency check:', e);
  }

  return Array.from(new Set(deps));
}

function openDeactivateProductModal(id) {
  if (!currentUser || currentUser.role !== 'admin') {
    showToast('Only Administrators can deactivate products.', 'error');
    return;
  }
  const p = productById(id);
  if (!p) {
    showToast('Product not found.', 'error');
    return;
  }

  // Stock summary
  const sizes = sanitizeSizeList(p.sizes || []);
  const sealedBreakdown = sizes.map(s => {
    const count = productCanCount(p, s);
    return `<b>${count}</b> × ${fmtSize(s)}`;
  }).join(', ');

  const totalStock = Number(p.stock) || 0;
  const openedLiters = productOpenedStock(p);
  const hasInventory = totalStock > 0 || openedLiters > 0;

  // Pending POs
  const activePOs = (db.purchaseOrders || []).filter(po => {
    const isActiveStatus = ['pending', 'ordered', 'partial'].includes((po.status || '').toLowerCase());
    if (!isActiveStatus) return false;
    return (po.items || []).some(it => (it.productId === p.id || it.productId === (p.productId || p.id)));
  });

  const modalHtml = `
    <div style="font-size:13px; line-height:1.5; color:var(--ink);">
      <div style="background:#FAF8F5; border:1px solid var(--line); border-radius:var(--radius-sm); padding:12px 14px; margin-bottom:14px; display:flex; align-items:center; justify-content:space-between; gap:10px;">
        <div>
          <div style="font-weight:700; font-size:15px; color:var(--ink);">${escapeHtml(p.name)}</div>
          <div style="font-size:12px; color:var(--ink-soft); margin-top:2px;">
            ${escapeHtml(p.brand || '—')} · ${escapeHtml(p.type || p.category || 'General')}
          </div>
        </div>
        <div>
          <span class="badge status-inactive">Will be set to Inactive</span>
        </div>
      </div>

      <div style="background:#FFF; border:1px solid var(--line); border-radius:var(--radius-sm); padding:12px 14px; margin-bottom:12px;">
        <div style="font-size:11px; text-transform:uppercase; letter-spacing:0.04em; color:var(--ink-soft); font-weight:700; margin-bottom:6px;">Current Stock Inventory</div>
        <div style="font-size:13.5px; font-weight:700; color:var(--ink);">
          Total Stock: <span style="color:var(--teal);">${formatLiters(totalStock)}</span>
        </div>
        <div style="font-size:12px; color:var(--ink-soft); margin-top:3px;">
          Sealed cans: ${sealedBreakdown || '0 cans'}<br>
          Opened cans: <b>${formatLiters(openedLiters)}</b> in active mixing
        </div>
      </div>

      ${hasInventory ? `
        <div style="background:#FFFBEB; border:1px solid #FCD34D; border-radius:var(--radius-sm); padding:10px 12px; margin-bottom:12px; font-size:12px; color:#92400E; display:flex; gap:8px; align-items:flex-start;">
          <span style="font-size:16px; line-height:1;">⚠️</span>
          <div>
            <strong>Remaining Stock Warning:</strong> This product currently holds <b>${formatLiters(totalStock)}</b> sealed inventory and <b>${formatLiters(openedLiters)}</b> opened paint. Deactivating will exclude it from POS sales, receiving, and purchase orders.
          </div>
        </div>
      ` : ''}

      ${activePOs.length > 0 ? `
        <div style="background:#FEF2F2; border:1px solid #FECACA; border-radius:var(--radius-sm); padding:10px 12px; margin-bottom:12px; font-size:12px; color:#991B1B; display:flex; gap:8px; align-items:flex-start;">
          <span style="font-size:16px; line-height:1;">🚚</span>
          <div>
            <strong>Active Purchase Order Warning:</strong> This product is referenced in <b>${activePOs.length} active Purchase Order(s)</b> (${activePOs.map(o => o.poNumber).join(', ')}).
          </div>
        </div>
      ` : ''}

      <div style="background:#F0FDF4; border:1px solid #BBF7D0; border-radius:var(--radius-sm); padding:10px 12px; margin-bottom:14px; font-size:12px; color:#166534; display:flex; gap:8px; align-items:center;">
        <span style="font-size:16px;">🛡️</span>
        <div>
          <b>Data Safety Guaranteed:</b> Deactivation never deletes stock records or historical transactions. All past sales, movements, price logs, and audit trails remain permanently accessible. You can reactivate this product at any time.
        </div>
      </div>

      <div class="field" style="margin-bottom:0;">
        <label for="deact-modal-reason">Reason for Deactivation <span style="color:var(--danger);">*</span></label>
        <textarea id="deact-modal-reason" class="input" style="width:100%; height:75px; font-size:12.5px; padding:8px 10px; resize:vertical;" placeholder="State mandatory reason for deactivation (e.g. Temporarily out of stock from manufacturer, seasonal suspension, pending reformulation)..." required></textarea>
        <div class="muted small" style="margin-top:4px; font-size:11.5px;">A reason is required for administrative and audit compliance.</div>
      </div>
    </div>
  `;

  openModal(`Deactivate Product: ${p.name}`, modalHtml, `
    <button type="button" class="btn secondary" onclick="closeModal()">Cancel</button>
    <button type="button" class="btn danger" onclick="confirmDeactivateProduct('${p.id}')">🚫 Deactivate Product</button>
  `);
}

async function confirmDeactivateProduct(id) {
  if (!currentUser || currentUser.role !== 'admin') {
    showToast('Only Administrators can deactivate products.', 'error');
    return;
  }
  const p = productById(id);
  if (!p) return;

  const reasonEl = document.getElementById('deact-modal-reason');
  const reason = reasonEl ? reasonEl.value.trim() : '';
  if (!reason) {
    showToast('Please enter a mandatory reason for deactivating this product.', 'error');
    if (reasonEl) reasonEl.focus();
    return;
  }

  const adminName = (currentUser && currentUser.name) || 'Administrator';
  const prevStatus = (p.status || 'active').charAt(0).toUpperCase() + (p.status || 'active').slice(1);
  p.status = 'inactive';
  p.deactivationReason = reason;
  p.deactivatedAt = nowISO();
  p.deactivatedBy = adminName;
  p.updatedBy = adminName;
  p.updatedAt = nowISO();

  logAudit(
    'PRODUCT_DEACTIVATE',
    'Product',
    `Product ${p.name} deactivated by ${adminName}. Reason: ${reason}`,
    {
      productId: p.id,
      entityName: p.name,
      fieldChanged: 'Product Status',
      oldValue: prevStatus,
      newValue: 'Inactive',
      reason: reason
    }
  );

  try {
    await saveDB();
    closeModal();
    showToast(`Product "${p.name}" has been deactivated.`, 'ok');
    if (typeof renderInventoryTable === 'function') renderInventoryTable();
    if (typeof renderPage === 'function') renderPage();
  } catch (err) {
    console.error('Failed to deactivate product:', err);
    showToast('Failed to save product deactivation to database.', 'error');
  }
}

function openReactivateProductModal(id) {
  if (!currentUser || currentUser.role !== 'admin') {
    showToast('Only Administrators can reactivate products.', 'error');
    return;
  }
  const p = productById(id);
  if (!p) {
    showToast('Product not found.', 'error');
    return;
  }

  // Pre-reactivation checks
  const errors = [];
  if (!p.name || !p.name.trim()) errors.push('Product Name is missing');
  if (!p.brand || !p.brand.trim()) errors.push('Brand is missing');
  if (!p.sizes || !p.sizes.length) errors.push('No container sizes configured');
  if (isNaN(Number(p.price)) || Number(p.price) <= 0) errors.push('Price per Liter must be greater than 0');

  if (errors.length > 0) {
    openModal(`Cannot Reactivate: ${p.name}`, `
      <div style="font-size:13px; line-height:1.5;">
        <div style="background:#FEF2F2; border:1px solid #FECACA; border-radius:var(--radius-sm); padding:12px 14px; margin-bottom:12px; color:#991B1B;">
          <strong>Pre-Reactivation Check Failed:</strong> The following product details must be completed before reactivation:
          <ul style="margin:8px 0 0 18px; padding:0;">
            ${errors.map(e => `<li>${escapeHtml(e)}</li>`).join('')}
          </ul>
        </div>
        <p style="font-size:12.5px; color:var(--ink-soft);">Please edit the product first and provide valid values before reactivating.</p>
      </div>
    `, `
      <button type="button" class="btn secondary" onclick="closeModal()">Close</button>
      <button type="button" class="btn" onclick="closeModal(); openProductModal('${p.id}');">✏️ Edit Product</button>
    `);
    return;
  }

  const sizes = sanitizeSizeList(p.sizes || []);
  const sizesText = sizes.map(s => `${fmtSize(s)} (${peso(Number(p.price) * s)})`).join(', ');

  const modalHtml = `
    <div style="font-size:13px; line-height:1.5; color:var(--ink);">
      <div style="background:#FAF8F5; border:1px solid var(--line); border-radius:var(--radius-sm); padding:12px 14px; margin-bottom:14px; display:flex; align-items:center; justify-content:space-between; gap:10px;">
        <div>
          <div style="font-weight:700; font-size:15px; color:var(--ink);">${escapeHtml(p.name)}</div>
          <div style="font-size:12px; color:var(--ink-soft); margin-top:2px;">
            ${escapeHtml(p.brand || '—')} · ${peso(p.price)}/L
          </div>
        </div>
        <div>
          <span class="badge status-active">Will become Active</span>
        </div>
      </div>

      <div style="background:#FFF; border:1px solid var(--line); border-radius:var(--radius-sm); padding:12px 14px; margin-bottom:12px;">
        <div style="font-size:11px; text-transform:uppercase; letter-spacing:0.04em; color:var(--ink-soft); font-weight:700; margin-bottom:6px;">Pre-Reactivation Verification</div>
        <table style="width:100%; font-size:12px; border-collapse:collapse;">
          <tr>
            <td style="padding:4px 0; color:var(--ink-soft); width:130px;">✓ Product Info:</td>
            <td style="padding:4px 0; font-weight:600; color:var(--ink);">${escapeHtml(p.name)} (${escapeHtml(p.brand)})</td>
          </tr>
          <tr>
            <td style="padding:4px 0; color:var(--ink-soft);">✓ Current Inventory:</td>
            <td style="padding:4px 0; font-weight:600; color:var(--teal);">${formatLiters(p.stock || 0)} sealed · ${formatLiters(productOpenedStock(p))} opened</td>
          </tr>
          <tr>
            <td style="padding:4px 0; color:var(--ink-soft);">✓ Container Sizes:</td>
            <td style="padding:4px 0; font-weight:600; color:var(--ink);">${sizesText}</td>
          </tr>
          <tr>
            <td style="padding:4px 0; color:var(--ink-soft);">✓ Base Price:</td>
            <td style="padding:4px 0; font-weight:600; color:var(--ink);">${peso(p.price)} / Liter</td>
          </tr>
        </table>
      </div>

      <div style="background:#F0FDF4; border:1px solid #BBF7D0; border-radius:var(--radius-sm); padding:10px 12px; font-size:12px; color:#166534; display:flex; gap:8px; align-items:center;">
        <span style="font-size:16px;">🟢</span>
        <div>
          Reactivating this product will return its status to <b>ACTIVE</b>, making it immediately available for POS transactions, Stock Receiving, and Purchase Orders.
        </div>
      </div>
    </div>
  `;

  openModal(`Reactivate Product: ${p.name}`, modalHtml, `
    <button type="button" class="btn secondary" onclick="closeModal()">Cancel</button>
    <button type="button" class="btn" style="background:#1F6F6B; color:#fff;" onclick="confirmReactivateProduct('${p.id}')">✓ Confirm Reactivation</button>
  `);
}

async function confirmReactivateProduct(id) {
  if (!currentUser || currentUser.role !== 'admin') {
    showToast('Only Administrators can reactivate products.', 'error');
    return;
  }
  const p = productById(id);
  if (!p) return;

  const adminName = (currentUser && currentUser.name) || 'Administrator';
  const prevStatus = (p.status || 'inactive').charAt(0).toUpperCase() + (p.status || 'inactive').slice(1);
  p.status = 'active';
  p.deactivationReason = null;
  p.deactivatedAt = null;
  p.deactivatedBy = null;
  p.discontinueReason = null;
  p.updatedBy = adminName;
  p.updatedAt = nowISO();

  logAudit(
    'PRODUCT_REACTIVATE',
    'Product',
    `Product ${p.name} reactivated by ${adminName}`,
    {
      productId: p.id,
      entityName: p.name,
      fieldChanged: 'Product Status',
      oldValue: prevStatus,
      newValue: 'Active',
      reason: 'Reactivated for store operations'
    }
  );

  try {
    await saveDB();
    closeModal();
    showToast(`Product "${p.name}" has been reactivated and is now active!`, 'ok');
    if (typeof renderInventoryTable === 'function') renderInventoryTable();
    if (typeof renderPage === 'function') renderPage();
  } catch (err) {
    console.error('Failed to reactivate product:', err);
    showToast('Failed to save product reactivation to database.', 'error');
  }
}

function openDiscontinueProductModal(id) {
  if (!currentUser || currentUser.role !== 'admin') {
    showToast('Only Administrators can discontinue products.', 'error');
    return;
  }
  const p = productById(id);
  if (!p) {
    showToast('Product not found.', 'error');
    return;
  }

  const totalStock = Number(p.stock) || 0;
  const openedLiters = productOpenedStock(p);

  const modalHtml = `
    <div style="font-size:13px; line-height:1.5; color:var(--ink);">
      <div style="background:#FAF8F5; border:1px solid var(--line); border-radius:var(--radius-sm); padding:12px 14px; margin-bottom:14px; display:flex; align-items:center; justify-content:space-between; gap:10px;">
        <div>
          <div style="font-weight:700; font-size:15px; color:var(--ink);">${escapeHtml(p.name)}</div>
          <div style="font-size:12px; color:var(--ink-soft); margin-top:2px;">
            ${escapeHtml(p.brand || '—')}
          </div>
        </div>
        <div>
          <span class="badge status-discontinued">Will be set to Discontinued</span>
        </div>
      </div>

      <div style="background:#FFF7ED; border:1px solid #FDBA74; border-radius:var(--radius-sm); padding:10px 12px; margin-bottom:12px; font-size:12px; color:#C2410C;">
        <strong>Notice on Discontinuation:</strong> Product will be permanently retired from future purchasing and stock replenishment. All historical transaction logs and reports remain fully accessible.
      </div>

      <div class="field" style="margin-bottom:0;">
        <label for="disc-modal-reason">Reason for Discontinuation <span style="color:var(--danger);">*</span></label>
        <textarea id="disc-modal-reason" class="input" style="width:100%; height:75px; font-size:12.5px; padding:8px 10px; resize:vertical;" placeholder="State reason (e.g. End of life, manufacturer stopped production, replaced by new line)..." required></textarea>
      </div>
    </div>
  `;

  openModal(`Discontinue Product: ${p.name}`, modalHtml, `
    <button type="button" class="btn secondary" onclick="closeModal()">Cancel</button>
    <button type="button" class="btn warning" onclick="confirmDiscontinueProduct('${p.id}')">🟠 Discontinue Product</button>
  `);
}

async function confirmDiscontinueProduct(id) {
  if (!currentUser || currentUser.role !== 'admin') {
    showToast('Only Administrators can discontinue products.', 'error');
    return;
  }
  const p = productById(id);
  if (!p) return;

  const reasonEl = document.getElementById('disc-modal-reason');
  const reason = reasonEl ? reasonEl.value.trim() : '';
  if (!reason) {
    showToast('Please enter a mandatory reason for discontinuing this product.', 'error');
    if (reasonEl) reasonEl.focus();
    return;
  }

  const adminName = (currentUser && currentUser.name) || 'Administrator';
  const prevStatus = (p.status || 'active').charAt(0).toUpperCase() + (p.status || 'active').slice(1);
  p.status = 'discontinued';
  p.discontinueReason = reason;
  p.updatedBy = adminName;
  p.updatedAt = nowISO();

  logAudit(
    'PRODUCT_DISCONTINUE',
    'Product',
    `Product ${p.name} discontinued by ${adminName}. Reason: ${reason}`,
    {
      productId: p.id,
      entityName: p.name,
      fieldChanged: 'Product Status',
      oldValue: prevStatus,
      newValue: 'Discontinued',
      reason: reason
    }
  );

  try {
    await saveDB();
    closeModal();
    showToast(`Product "${p.name}" marked as Discontinued.`, 'ok');
    if (typeof renderInventoryTable === 'function') renderInventoryTable();
    if (typeof renderPage === 'function') renderPage();
  } catch (err) {
    console.error('Failed to discontinue product:', err);
    showToast('Failed to save product status to database.', 'error');
  }
}

async function openDeleteProductModal(id) {
  if (!currentUser || currentUser.role !== 'admin') {
    showToast('Only Administrators can delete products.', 'error');
    return;
  }
  const p = productById(id);
  if (!p) {
    showToast('Product not found.', 'error');
    return;
  }

  // Check dependencies
  const deps = await getProductDependencies(id);

  if (deps.length > 0) {
    // BLOCKED DELETION
    const modalHtml = `
      <div style="font-size:13px; line-height:1.5; color:var(--ink);">
        <div style="background:#FEF2F2; border:1px solid #FECACA; border-radius:var(--radius-sm); padding:14px; margin-bottom:14px; display:flex; gap:10px; align-items:flex-start;">
          <span style="font-size:24px; line-height:1;">🛑</span>
          <div>
            <div style="font-size:14.5px; font-weight:700; color:#991B1B;">Permanent Deletion Blocked</div>
            <div style="font-size:12px; color:#7F1D1D; margin-top:2px;">
              Product <b>${escapeHtml(p.name)}</b> cannot be deleted because it has active inventory or historical dependencies.
            </div>
          </div>
        </div>

        <div style="background:#FFF; border:1px solid var(--line); border-radius:var(--radius-sm); padding:12px 14px; margin-bottom:14px;">
          <div style="font-size:11px; text-transform:uppercase; letter-spacing:0.04em; color:var(--ink-soft); font-weight:700; margin-bottom:8px;">Identified System Dependencies:</div>
          <ul style="margin:0; padding-left:18px; font-size:12.5px; color:#B91C1C; display:flex; flex-direction:column; gap:4px;">
            ${deps.map(d => `<li><b>${escapeHtml(d)}</b></li>`).join('')}
          </ul>
        </div>

        <div style="background:#FAF8F5; border:1px solid var(--line); border-radius:var(--radius-sm); padding:12px 14px; margin-bottom:14px; font-size:12px; color:var(--ink-soft); line-height:1.45;">
          💡 <strong>Accounting &amp; Audit Compliance:</strong> To maintain strict audit trails, accurate financial records, and historical movement history, products with past records cannot be deleted.<br><br>
          Please <b>Deactivate</b> (temporary pause) or <b>Discontinue</b> (permanent phase-out) this product instead.
        </div>
      </div>
    `;

    openModal(`Cannot Delete: ${p.name}`, modalHtml, `
      <button type="button" class="btn secondary" onclick="closeModal()">Close</button>
      <button type="button" class="btn secondary" onclick="closeModal(); openDeactivateProductModal('${p.id}');">🚫 Deactivate Instead</button>
      <button type="button" class="btn warning" onclick="closeModal(); openDiscontinueProductModal('${p.id}');">🟠 Discontinue Instead</button>
    `);
    return;
  }

  // Product is CLEAN — proceed to Step 1 confirmation
  openDeleteProductConfirmStep1(p);
}

function openDeleteProductConfirmStep1(p) {
  const modalHtml = `
    <div style="font-size:13px; line-height:1.5; color:var(--ink);">
      <div style="background:#FFFBEB; border:1px solid #FCD34D; border-radius:var(--radius-sm); padding:12px 14px; margin-bottom:14px; display:flex; gap:10px; align-items:flex-start;">
        <span style="font-size:22px; line-height:1;">⚠️</span>
        <div>
          <div style="font-size:14px; font-weight:700; color:#92400E;">Permanent Deletion Warning</div>
          <div style="font-size:12px; color:#78350F; margin-top:2px;">
            This action will permanently delete <b>${escapeHtml(p.name)}</b> from the system. This cannot be undone.
          </div>
        </div>
      </div>

      <div style="background:#FFF; border:1px solid var(--line); border-radius:var(--radius-sm); padding:12px 14px; margin-bottom:14px;">
        <div style="font-size:11px; text-transform:uppercase; letter-spacing:0.04em; color:var(--ink-soft); font-weight:700; margin-bottom:6px;">Clean Product Verification</div>
        <table style="width:100%; font-size:12px; border-collapse:collapse;">
          <tr>
            <td style="padding:3px 0; color:var(--ink-soft); width:130px;">Product Name:</td>
            <td style="padding:3px 0; font-weight:600; color:var(--ink);">${escapeHtml(p.name)}</td>
          </tr>
          <tr>
            <td style="padding:3px 0; color:var(--ink-soft);">Brand:</td>
            <td style="padding:3px 0; color:var(--ink);">${escapeHtml(p.brand || '—')}</td>
          </tr>
          <tr>
            <td style="padding:3px 0; color:var(--ink-soft);">Stock Status:</td>
            <td style="padding:3px 0; font-weight:700; color:var(--teal);">0.00 L (Zero inventory)</td>
          </tr>
          <tr>
            <td style="padding:3px 0; color:var(--ink-soft);">Transactions:</td>
            <td style="padding:3px 0; font-weight:700; color:var(--teal);">None (No POs, sales, or movements)</td>
          </tr>
        </table>
      </div>

      <p style="font-size:12.5px; color:var(--ink-soft);">Click below to proceed to the final confirmation step.</p>
    </div>
  `;

  openModal(`Confirm Deletion: ${p.name}`, modalHtml, `
    <button type="button" class="btn secondary" onclick="closeModal()">Cancel</button>
    <button type="button" class="btn danger" onclick="openDeleteProductConfirmStep2('${p.id}')">Proceed to Final Confirmation &rarr;</button>
  `);
}

function openDeleteProductConfirmStep2(id) {
  const p = productById(id);
  if (!p) return;

  const expectedCode = String(p.productId || p.id).toUpperCase();

  const modalHtml = `
    <div style="font-size:13px; line-height:1.5; color:var(--ink);">
      <div style="background:#FEF2F2; border:1px solid #FECACA; border-radius:var(--radius-sm); padding:14px; margin-bottom:14px; text-align:center;">
        <span style="font-size:28px;">🗑️</span>
        <div style="font-size:15px; font-weight:700; color:#991B1B; margin-top:4px;">Final Permanent Deletion Step</div>
        <div style="font-size:12px; color:#7F1D1D; margin-top:4px;">
          To permanently delete <b>${escapeHtml(p.name)}</b>, please type <b>DELETE</b> in the box below.
        </div>
      </div>

      <div class="field" style="margin-bottom:0;">
        <label for="delete-confirm-input">Type <b>DELETE</b> to confirm:</label>
        <input id="delete-confirm-input" class="input" style="text-align:center; font-family:'Space Grotesk',monospace; font-size:14px; font-weight:700; letter-spacing:0.05em;" placeholder="Type DELETE" oninput="onDeleteConfirmInput(this.value, '${expectedCode}')">
      </div>
    </div>
  `;

  openModal(`Final Confirmation: Delete ${p.name}`, modalHtml, `
    <button type="button" class="btn secondary" onclick="closeModal()">Cancel</button>
    <button type="button" class="btn danger" id="delete-execute-btn" disabled onclick="executePermanentDelete('${p.id}')">🗑️ Permanently Delete</button>
  `);
}

function onDeleteConfirmInput(val, expected) {
  const btn = document.getElementById('delete-execute-btn');
  if (!btn) return;
  const trimmed = String(val || '').trim().toUpperCase();
  const matches = (trimmed === 'DELETE' || trimmed === expected.toUpperCase());
  btn.disabled = !matches;
}

async function executePermanentDelete(id) {
  if (!currentUser || currentUser.role !== 'admin') {
    showToast('Only Administrators can delete products.', 'error');
    return;
  }
  const p = productById(id);
  if (!p) return;

  // Final server check for dependencies
  const deps = await getProductDependencies(id);
  if (deps.length > 0) {
    closeModal();
    showToast(`Deletion blocked: ${deps[0]}`, 'error');
    return;
  }

  const adminName = (currentUser && currentUser.name) || 'Administrator';
  const prodCode = p.productId || p.id;
  const prodName = p.name;

  // Track deleted IDs for backend synchronization
  db.deletedProductIds = db.deletedProductIds || [];
  if (!db.deletedProductIds.includes(p.id)) {
    db.deletedProductIds.push(p.id);
  }

  // Remove child variants and inventory
  if (Array.isArray(db.allProductSizes)) {
    db.allProductSizes = db.allProductSizes.filter(s => s.productId !== p.id && s.productId !== prodCode);
  }
  if (Array.isArray(db.allInventory)) {
    const remainingSizeIds = new Set((db.allProductSizes || []).map(s => s.sizeId));
    db.allInventory = db.allInventory.filter(inv => remainingSizeIds.has(inv.sizeId));
  }

  // Remove product from memory
  const prevDetails = `${prodName} (${p.brand || '—'}, Price: ${peso(p.price)}/L, Status: ${p.status || 'inactive'})`;
  db.products = (db.products || []).filter(item => item.id !== id);

  logAudit(
    'PRODUCT_DELETE',
    'Product',
    `Product ${prodName} permanently deleted by ${adminName}`,
    {
      productId: prodCode,
      entityName: prodName,
      fieldChanged: 'Product Record',
      oldValue: prevDetails,
      newValue: 'Permanently Deleted',
      reason: 'Clean product record permanently removed by Administrator'
    }
  );

  try {
    await saveDB();
    closeModal();
    showToast(`Product "${prodName}" permanently deleted.`, 'ok');
    if (typeof renderInventoryTable === 'function') renderInventoryTable();
    if (typeof renderPage === 'function') renderPage();
  } catch (err) {
    console.error('Failed to permanently delete product:', err);
    showToast('Failed to delete product from database.', 'error');
  }
}

async function toggleProductStatus(id) {
  if (!currentUser || currentUser.role !== 'admin') {
    showToast('Only Administrators can change product status.', 'error');
    return;
  }
  const p = productById(id);
  if (!p) return;

  if (p.status === 'active') {
    openDeactivateProductModal(id);
  } else {
    openReactivateProductModal(id);
  }
}

window.openProductModal = openProductModal;
window.submitProduct = submitProduct;
window.submitProductFormDirectly = submitProductFormDirectly;
window.getProductDependencies = getProductDependencies;
window.openDeactivateProductModal = openDeactivateProductModal;
window.confirmDeactivateProduct = confirmDeactivateProduct;
window.openReactivateProductModal = openReactivateProductModal;
window.confirmReactivateProduct = confirmReactivateProduct;
window.openDiscontinueProductModal = openDiscontinueProductModal;
window.confirmDiscontinueProduct = confirmDiscontinueProduct;
window.openDeleteProductModal = openDeleteProductModal;
window.openDeleteProductConfirmStep1 = openDeleteProductConfirmStep1;
window.openDeleteProductConfirmStep2 = openDeleteProductConfirmStep2;
window.onDeleteConfirmInput = onDeleteConfirmInput;
window.executePermanentDelete = executePermanentDelete;
window.toggleProductStatus = toggleProductStatus;
window.onProductColorNameInput = onProductColorNameInput;
window.onProductColorHexInput = onProductColorHexInput;
window.onProductColorPickerChange = onProductColorPickerChange;
window.updateProductColorHexPreview = updateProductColorHexPreview;
window.onProductFormStatusChange = onProductFormStatusChange;
