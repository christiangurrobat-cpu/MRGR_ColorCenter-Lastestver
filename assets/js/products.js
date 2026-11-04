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

function productSizeGridHtml(p, sizes) {
  const list = sanitizeSizeList(sizes);
  return `<div style="display:grid; grid-template-columns:repeat(${Math.min(Math.max(list.length, 1), 4)},1fr); gap:10px; font-family:'Space Grotesk',sans-serif;">
    ${list.map(s => {
    const open = p ? productOpenedLiters(p, s) : 0;
    const used = p ? productUsedFromOpenedCan(p, s) : 0;
    const currentThresh = productFormThresholds[s] !== undefined ? productFormThresholds[s] : (p ? productSizeThreshold(p, s) : (s >= 16 ? 1 : (s >= 4 ? 2 : 5)));
    return `<div style="border-left:1px dashed var(--line); padding-left:10px; display:flex; flex-direction:column; justify-content:space-between;">
        <div>
          <div style="font-size:11px; color:var(--ink-soft);">${fmtSize(s)} Sealed</div>
          <div style="font-size:16px; font-weight:700;">${p ? productCanCount(p, s) : 0} <span style="font-size:11px; font-weight:500; color:var(--ink-soft);">cans</span></div>
          <div style="font-size:11px; color:#9A6216; font-weight:600; margin-top:4px;">🫙 ${fmtSize(s)} Opened / Used</div>
          ${open > 0
        ? `<div style="font-size:13px; font-weight:700; color:#9A6216;">${formatLiters(open)} left</div><div style="font-size:11px; color:#8A5A24; font-weight:600;">Used: ${formatLiters(used)} of ${fmtSize(s)}</div>`
        : `<div style="font-size:13px; font-weight:700; color:#9A6216; opacity:.5;">0 L</div>`}
        </div>
        <div style="margin-top:8px; padding-top:6px; border-top:1px dashed var(--line);">
          <label style="font-size:11px; font-weight:700; color:var(--ink); display:flex; justify-content:space-between; align-items:center; margin-bottom:3px;">
            <span>Low-Stock Min Cans:</span>
            <span id="pf-thresh-liters-${s}" style="color:var(--teal); font-weight:600;">(${formatLiters(currentThresh * s)})</span>
          </label>
          <input type="number" min="0" step="1" inputmode="numeric"
            class="pf-size-threshold-input"
            id="pf-thresh-size-${s}"
            data-size="${s}"
            value="${currentThresh}"
            style="width:100%; padding:5px 8px; font-size:13px; font-weight:700;"
            placeholder="Min cans"
            oninput="onProductSizeThresholdInput(${s}, this.value)"
            required>
        </div>
      </div>`;
  }).join('')}
  </div>`;
}

function productSizeChipsHtml() {
  const p = productFormEditingId ? productById(productFormEditingId) : null;
  return `<div style="display:flex; flex-wrap:wrap; gap:6px;">${productFormSizes.map(s => {
    const locked = p && (productCanCount(p, s) > 0 || productOpenedLiters(p, s) > 0);
    return `<span class="badge" style="background:#EAF4F3; color:var(--teal-dark); border:1px solid #C5DFDC; font-size:12px; padding:4px 8px; display:inline-flex; align-items:center; gap:6px;">
      ${fmtSize(s)}
      <button type="button" ${locked ? 'disabled title="Still has stock - cannot remove"' : `title="Remove ${fmtSize(s)}"`} onclick="removeProductFormSize(${s})" style="border:none; background:none; cursor:${locked ? 'not-allowed' : 'pointer'}; opacity:${locked ? 0.3 : 0.8}; font-size:14px; line-height:1; padding:0;">×</button>
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
  if (productFormSizes.includes(v)) { showToast(`${fmtSize(v)} already exists for this product.`, 'error'); return; }
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
  if (p && (productCanCount(p, s) > 0 || productOpenedLiters(p, s) > 0)) {
    showToast(`${fmtSize(s)} still has stock - cannot remove.`, 'error');
    return;
  }
  if (productFormSizes.length <= 1) { showToast('A product needs at least one can size.', 'error'); return; }
  productFormSizes = productFormSizes.filter(x => x !== s);
  delete productFormThresholds[s];
  refreshProductSizeUI();
}
function canBreakdownHtml(p) {
  return `<div class="can-breakdown" style="display:flex; flex-direction:column; gap:2px; font-size:12px;">${productSizes(p).map(s => {
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
  productFormSizes.forEach(s => {
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
  const currentColorHex = getProductHex({ color: initialColor, name: initialName });

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
                <span>May nakabinbing edit request mula kay ${escapeHtml(pending.requestedBy || 'Inventory Staff')}</span>
              </div>
              <div style="margin-top:3px; color:#78350F;">
                Isinumite noong ${formatDateTime(pending.requestedAt || nowISO())} (${Object.keys(pending.changes || {}).length} field change(s)). Bilang Administrator, kapag pinindot mo ang <b>Save Changes</b>, direktang mailalapat ang mga detalye at mareresolba ang pending request.
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
            <strong>Administrator Direct Edit:</strong> Lahat ng pagbabago (pangalan, brand, uri, presyo, sukat, at threshold) ay direktang magiging epektibo agad sa buong sistema.
          </div>
        </div>
      `
    ) : `
      <div class="full" style="background:#EAF4F3; border:1px solid #C5DFDC; border-radius:var(--radius-sm); padding:10px 14px; margin-bottom:4px; font-size:12px; color:var(--teal-dark); display:flex; gap:8px; align-items:flex-start;">
        <span style="font-size:16px; line-height:1;">⚡</span>
        <div>
          <strong>Administrator Direct Entry:</strong> Ang bagong produktong ito ay direktang malilikha bilang <b>Active</b> at magiging handa kaagad para sa POS, bodega, at Purchase Orders nang hindi na nangangailangan ng approval.
        </div>
      </div>
    `
  ) : (
    p ? `
      <div class="full" style="background:#FFFBEB; border:1px solid #FCD34D; border-radius:var(--radius-sm); padding:10px 14px; margin-bottom:4px; font-size:12px; color:#92400E; display:flex; gap:8px; align-items:flex-start;">
        <span style="font-size:16px; line-height:1;">ℹ️</span>
        <div>
          <strong>Staff Edit Request:</strong> Bilang Inventory Staff, maaari mong i-edit ang detalye ng produkto (pangalan, brand, type, kulay, presyo, sukat, at minimum thresholds). Lahat ng pagbabago ay isusumite para sa <b>Administrator Approval</b> bago maging aktibo sa tindahan.
        </div>
      </div>
      ${pending ? `
        <div class="full" style="background:#FEF3C7; border:1px solid #FCD34D; border-radius:var(--radius-sm); padding:12px 14px; margin-bottom:4px; font-size:12px; color:#92400E;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px; flex-wrap:wrap;">
            <div style="flex:1; min-width:240px;">
              <div style="font-weight:700; font-size:13px; display:flex; align-items:center; gap:6px;">
                <span>⏳</span>
                <span>May nakabinbin nang edit request para sa produktong ito</span>
              </div>
              <div style="margin-top:3px; color:#78350F;">
                Isinumite ni <b>${escapeHtml(pending.requestedBy || 'Inventory Staff')}</b> noong ${formatDateTime(pending.requestedAt || nowISO())} (${Object.keys(pending.changes || {}).length} field change(s) awaiting Admin approval).
              </div>
              <div style="margin-top:4px; font-size:11.5px; color:#B45309;">
                💡 <em>Naka-load sa form ang kasalukuyang proposed values. Kapag nag-save ka, ia-update nito ang nakabinbing request para sa Admin.</em>
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
          <strong>Staff Product Request:</strong> Bilang Inventory Staff, ang bagong produktong ito ay isusumite bilang <b>Pending Approval</b> para suriin at aprubahan ng Administrator bago maging aktibo sa POS at bodega.
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
        <strong style="color:var(--ink);">Initial Stock: 0.00 L</strong> — Bagong produkto ay magsisimula sa 0 stock. Pagka-save, magiging <b>aktibo agad</b> ito at maaari nang magdagdag ng stock sa Stock Receiving o gumawa ng Purchase Order.
      </div>
    </div>
  ` : `
    <div class="full" style="background:#FAF7F2; border:1px solid var(--line); border-radius:var(--radius-sm); padding:11px 14px; display:flex; align-items:center; gap:12px; margin-top:4px;">
      <span style="font-size:20px; line-height:1;">📦</span>
      <div style="flex:1; font-size:12px; color:var(--ink-soft); line-height:1.4;">
        <strong style="color:var(--ink);">Initial Stock: 0.00 L</strong> — New products start at 0 stock. ⏳ <b>Approval Required:</b> Bilang Inventory Staff, ang produktong ito ay isusumite bilang <b>Pending Approval</b> para sa Administrator bago magamit sa POS at pagtanggap ng delivery.
      </div>
    </div>
  `);

  openModal(modalTitle, `
<form id="product-form" onsubmit="return submitProduct(event, ${p ? `'${p.id}'` : 'null'})">
  <div class="form-grid">
    ${bannerNoticeHtml}
    <div class="field">
      <label>Product Name</label>
      <input id="pf-name" value="${escapeHtml(initialName)}" placeholder="e.g. Boysen Permacoat Latex" oninput="updateProductColorHexPreview(document.getElementById('pf-color') ? document.getElementById('pf-color').value : '')" required>
    </div>
    <div class="field">
      <label>Brand</label>
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
      <label>Color / Hex Code ${p ? `<code id="pf-hex-label" style="font-family:'Space Grotesk',monospace; font-size:11px; font-weight:600; color:var(--teal);">(${currentColorHex})</code>` : ''}</label>
      <div style="display:flex; gap:8px; align-items:center;">
        <input id="pf-color" value="${escapeHtml(initialColor)}" placeholder="e.g. White, #FFFFFF, Sky Blue" oninput="updateProductColorHexPreview(this.value)">
        <label style="position:relative; display:inline-flex; align-items:center; cursor:pointer;" title="Click to pick a color">
          <span id="pf-color-swatch" style="display:inline-block; width:34px; height:34px; border-radius:6px; border:1px solid var(--line); background:${currentColorHex}; flex-shrink:0; box-shadow:0 1px 2px rgba(0,0,0,0.06);" title="${currentColorHex}"></span>
          <input type="color" id="pf-color-picker" value="${currentColorHex}" style="position:absolute; inset:0; opacity:0; width:100%; height:100%; cursor:pointer;" oninput="onProductColorPickerChange(this.value)">
        </label>
      </div>
    </div>
    <div class="field">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
        <label for="pf-price" style="margin:0;">Price per Liter (₱/L)</label>
        <div style="display:flex; gap:6px; align-items:center;">
          ${p && p.pendingPrice != null ? `<span class="badge" style="background:#FEF3C7; color:#92400E; border:1px solid #FCD34D; font-size:11px; padding:2px 6px;">⏳ Pending Approval: ${peso(p.pendingPrice)}</span>` : ''}
          <span id="pf-recent-pill" class="badge" style="${hasSavedRecent ? 'display:inline-flex;' : 'display:none;'} background:#EBF5FB; color:#1B4F72; border:1px solid #AED6F1; font-size:11px; padding:2px 6px;" title="Recent price before last change">
            ${hasSavedRecent ? `Recent: ${peso(p.recentPrice)}` : ''}
          </span>
        </div>
      </div>
      <input id="pf-price" type="number" min="0" step="any" inputmode="decimal"
        value="${currentPriceFormatted}"
        placeholder="${p ? (p.price % 1 === 0 ? p.price : Number(p.price).toFixed(2)) : '0'}"
        onfocus="this.select()"
        oninput="onProductPriceInput(this.value, ${p ? Number(p.price) : 'null'}, ${hasSavedRecent ? Number(p.recentPrice) : 'null'})"
        ${p ? '' : 'required'}>
      ${user && user.role === 'staff' ? `
        <div class="muted small" style="margin-top:4px; color:#92400E; font-size:11.5px;">
          ℹ️ Bilang Inventory Staff, ang pagbago ng presyo ay isusumite para sa approval ng Admin bago magbago sa tindahan.
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
    <div class="full" style="background:#fff; border:1px solid var(--line); border-radius:var(--radius-sm); padding:12px 14px;">
      <div style="font-size:11px; text-transform:uppercase; letter-spacing:0.04em; color:var(--ink-soft); font-weight:600; margin-bottom:8px;">📏 Can Sizes for this Product (Liters)</div>
      <div id="pf-size-chips">${productSizeChipsHtml()}</div>
      <div style="display:flex; gap:8px; align-items:center; margin-top:8px;">
        <input id="pf-size-input" type="number" min="1" step="1" inputmode="numeric" placeholder="e.g. 1, 4, 20" style="max-width:170px;" onkeydown="if(event.key==='Enter'){event.preventDefault();addProductFormSize();}">
        <button type="button" class="btn secondary small" onclick="addProductFormSize()">+ Add Size</button>
      </div>
      <div style="font-size:11.5px; color:var(--ink-soft); margin-top:6px;">Stock, opened / used leftovers, POS buttons and purchase orders follow these sizes. A size that still holds sealed or opened stock can't be removed.</div>
    </div>    <div class="full" style="background:#FAF7F2; border:1px solid var(--line); border-radius:var(--radius-sm); padding:12px 14px;">
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

function onProductColorPickerChange(val) {
  const input = document.getElementById('pf-color');
  if (input) {
    input.value = val.toUpperCase();
    updateProductColorHexPreview(val);
  }
}

function updateProductColorHexPreview(val) {
  const swatch = document.getElementById('pf-color-swatch');
  const picker = document.getElementById('pf-color-picker');
  if (!swatch) return;
  const nameVal = document.getElementById('pf-name') ? document.getElementById('pf-name').value : '';
  const hex = getProductHex({ color: val, name: nameVal });
  swatch.style.backgroundColor = hex;
  swatch.title = hex;
  if (picker && /^#[0-9A-Fa-f]{6}$/.test(hex)) {
    picker.value = hex;
  }
}

async function submitProduct(e, id) {
  if (e && e.preventDefault) e.preventDefault();
  const user = currentUser || (typeof db !== 'undefined' && db && db.users ? db.users.find(u => u.role === 'admin') : null);
  if (!user || (user.role !== 'staff' && user.role !== 'admin')) {
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
  if (isNaN(priceRaw) || priceRaw < 0) {
    showToast('Please enter a valid price per liter (0 or greater).', 'error');
    return false;
  }
  captureProductFormThresholds();
  const thresholdBySize = {};
  sanitizeSizeList(productFormSizes).forEach(s => {
    const v = productFormThresholds[s];
    thresholdBySize[s] = (typeof v === 'number' && !isNaN(v) && v >= 0) ? v : (s >= 16 ? 1 : (s >= 4 ? 2 : 5));
  });

  const supplierSelect = document.getElementById('pf-supplier');
  const selectedSupplierId = supplierSelect ? supplierSelect.value : '';

  const data = {
    name: document.getElementById('pf-name').value.trim(),
    brand: document.getElementById('pf-brand').value.trim(),
    type: document.getElementById('pf-type').value,
    color: document.getElementById('pf-color').value.trim() || '-',
    price: Number(priceRaw.toFixed(2)),
    threshold: Number(document.getElementById('pf-threshold').value),
    thresholdBySize: thresholdBySize,
    sizes: sanitizeSizeList(productFormSizes),
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

    const currentSuppliers = (typeof suppliersForProduct === 'function') ? suppliersForProduct(id) : [];
    const oldSupplierId = currentSuppliers.length > 0 ? currentSuppliers[0].id : '';

    const changes = {};
    if (data.name !== existing.name) changes.name = { label: 'Product Name', old: existing.name, new: data.name };
    if (data.brand !== existing.brand) changes.brand = { label: 'Brand', old: existing.brand, new: data.brand };
    if (data.type !== existing.type) changes.type = { label: 'Type', old: existing.type, new: data.type };
    if (data.color !== existing.color) changes.color = { label: 'Color', old: existing.color, new: data.color };

    const oldPrice = Number(existing.price);
    const newPrice = Number(data.price);
    if (!isNaN(oldPrice) && oldPrice !== newPrice) {
      changes.price = { label: 'Price per Liter', old: oldPrice, new: newPrice };
    }

    const oldSizes = existing.sizes || [];
    const addedSizes = (data.sizes || []).filter(s => !oldSizes.includes(s));
    const removedSizes = (oldSizes || []).filter(s => !(data.sizes || []).includes(s));
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

    if (isAdmin) {
      if (changeKeys.length === 0 && !existing.pendingEdit) {
        showToast(`Product "${existing.name}" saved. No changes made.`, 'ok');
        closeModal();
        return false;
      }

      if (changes.price) {
        existing.recentPrice = oldPrice;
        existing.price = newPrice;
      } else {
        existing.price = newPrice;
      }
      existing.name = data.name;
      existing.brand = data.brand;
      existing.type = data.type;
      existing.color = data.color;
      existing.sizes = data.sizes;
      existing.threshold = data.threshold;
      existing.thresholdBySize = data.thresholdBySize;
      if (existing.status === 'pending_approval') {
        existing.status = 'active';
      }

      const hadPendingEdit = Boolean(existing.pendingEdit);
      existing.pendingEdit = null;
      existing.pendingPrice = null;
      existing.pendingSizes = [];

      const changeSummary = changeKeys.map(k => changes[k].label).join(', ');
      logAudit(
        'PRODUCT_EDIT',
        'Product',
        `Admin updated product ${existing.name}${changeSummary ? ` (${changeSummary})` : ''}${hadPendingEdit ? ' (resolved pending request)' : ''}`
      );
      showToast(`Product "${existing.name}" updated successfully!`, 'ok');
    } else {
      // Staff workflow
      if (changeKeys.length === 0) {
        if (existing.pendingEdit) {
          const confirmed = await showConfirmDialog({
            title: 'Bawiin ang Nakabinbing Edit?',
            message: `Lahat ng detalye para sa <b>${escapeHtml(existing.name)}</b> ay ibinalik sa orihinal nitong estado.<br><br>Nais mo bang kanselahin at bawiin ang nakabinbing edit request?`,
            icon: '🔄',
            confirmText: 'Oo, Bawiin Request',
            cancelText: 'Manatili sa Form',
            danger: true
          });
          if (confirmed) {
            await cancelProductPendingEdit(existing.id, true);
            return false;
          }
        }
        showToast('No changes were made to the product details.', 'info');
        closeModal();
        return false;
      }

      const isUpdate = Boolean(existing.pendingEdit);
      if (isUpdate) {
        const confirmed = await showConfirmDialog({
          title: 'I-update ang Request?',
          message: `May umiiral nang pending edit request para sa <b>${escapeHtml(existing.name)}</b> (isinumite ni <b>${escapeHtml(existing.pendingEdit.requestedBy || 'Staff')}</b>).<br><br>Nais mo bang i-update ang nakabinbing request gamit ang mga bagong pagbabagong ito para sa Admin review?`,
          icon: '✏️',
          confirmText: 'Oo, I-update',
          cancelText: 'Bumalik sa Form',
          danger: false
        });
        if (!confirmed) {
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
          price: data.price,
          sizes: sanitizeSizeList([...(existing.sizes || []), ...addedSizes]),
          threshold: data.threshold,
          thresholdBySize: data.thresholdBySize,
          supplierId: selectedSupplierId
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
      logAudit(
        isUpdate ? 'PRODUCT_EDIT_UPDATE' : 'PRODUCT_EDIT_REQUEST',
        'Product',
        `Staff ${isUpdate ? 'updated' : 'submitted'} edit request for ${existing.name} (${changeSummary}) for Admin approval`
      );
      showToast(
        isUpdate
          ? `Product edit request (${changeSummary}) successfully updated for Admin approval!`
          : `Product edit request (${changeSummary}) submitted for Admin approval!`,
        'ok'
      );
    }
  } else {
    // New product
    if (selectedSupplierId) {
      const targetSupplier = (db.suppliers || []).find(s => s.id === selectedSupplierId);
      if (targetSupplier) {
        if (!Array.isArray(targetSupplier.productIds)) targetSupplier.productIds = [];
      }
    }

    if (isAdmin) {
      data.recentPrice = null;
      data.pendingPrice = null;
      data.pendingSizes = [];
      data.pendingEdit = null;
      const newProd = {
        id: uid('p'),
        status: 'active',
        createdBy: (currentUser && currentUser.name) || 'Administrator',
        createdAt: nowISO(),
        reviewedBy: (currentUser && currentUser.name) || 'Administrator',
        reviewedAt: nowISO(),
        stock: 0,
        canStock: {},
        openedStock: 0,
        openedCanSize: 0,
        openedBySize: {},
        ...data
      };

      if (selectedSupplierId) {
        const targetSupplier = (db.suppliers || []).find(s => s.id === selectedSupplierId);
        if (targetSupplier) {
          if (!Array.isArray(targetSupplier.productIds)) targetSupplier.productIds = [];
          if (!targetSupplier.productIds.includes(newProd.id)) targetSupplier.productIds.push(newProd.id);
        }
      }

      db.products.push(newProd);
      logAudit('PRODUCT_ADD', 'Product', `Admin added new product ${data.name} (price ${peso(data.price)})`);
      showToast(`Product "${data.name}" added successfully and is now active!`, 'ok');
    } else {
      data.recentPrice = null;
      const newProd = {
        id: uid('p'),
        status: 'pending_approval',
        requestedBy: (currentUser && currentUser.name) || 'Inventory Staff',
        requestedAt: nowISO(),
        stock: 0,
        canStock: {},
        openedStock: 0,
        openedCanSize: 0,
        openedBySize: {},
        pendingSizes: [],
        ...data
      };

      if (selectedSupplierId) {
        const targetSupplier = (db.suppliers || []).find(s => s.id === selectedSupplierId);
        if (targetSupplier) {
          if (!Array.isArray(targetSupplier.productIds)) targetSupplier.productIds = [];
          if (!targetSupplier.productIds.includes(newProd.id)) targetSupplier.productIds.push(newProd.id);
        }
      }

      db.products.push(newProd);
      logAudit('PRODUCT_REQUEST', 'Product', `Staff submitted new product ${data.name} (price ${peso(data.price)}) for Admin approval`);
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
  logAudit('PRODUCT_APPROVE', 'Product', `Approved product ${p.name}`);
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
  logAudit('PRODUCT_REJECT', 'Product', `Rejected product request ${p.name}`);
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
  const approvedSizes = [...p.pendingSizes];
  p.sizes = sanitizeSizeList([...(p.sizes || []), ...p.pendingSizes]);
  p.pendingSizes = [];
  logAudit('PRODUCT_SIZE_APPROVE', 'Product', `Approved size(s) [${approvedSizes.map(s => s + 'L').join(', ')}] for ${p.name}`);
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
  logAudit('PRODUCT_SIZE_REJECT', 'Product', `Rejected size(s) [${rejectedSizes.map(s => s + 'L').join(', ')}] for ${p.name}`);
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
  logAudit('PRODUCT_PRICE_APPROVE', 'Product', `Approved price change for ${p.name}: ${peso(oldPrice)} ➔ ${peso(newPrice)}`);
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
  logAudit('PRODUCT_PRICE_REJECT', 'Product', `Rejected price change of ${peso(rejectedPrice)} for ${p.name}`);
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
  const reviewer = (currentUser && currentUser.name) || 'Administrator';

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

  logAudit('PRODUCT_EDIT_APPROVE', 'Product', `Approved edit request for "${p.name}" (requested by ${edit.requestedBy || 'Staff'})`);
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
  p.pendingEdit = null;
  p.pendingPrice = null;
  p.pendingSizes = [];

  logAudit('PRODUCT_EDIT_REJECT', 'Product', `Rejected edit request for "${p.name}" (requested by ${edit.requestedBy || 'Staff'})`);
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
      title: 'Kanselahin ang Edit Request?',
      message: `Sigurado ka bang nais mong kanselahin o bawiin ang nakabinbing edit request para sa <b>${escapeHtml(p.name)}</b>?<br><br><span style="font-size:12px; color:var(--ink-soft);">Mawawala ang isinumiteng pagbabago at mananatili ang kasalukuyang impormasyon ng produkto sa tindahan.</span>`,
      icon: '🗑️',
      confirmText: 'Oo, Kanselahin',
      cancelText: 'Huwag muna',
      danger: true
    });
    if (!confirmed) return;
  }

  p.pendingEdit = null;
  p.pendingPrice = null;
  p.pendingSizes = [];

  logAudit('PRODUCT_EDIT_CANCEL', 'Product', `${(currentUser && currentUser.name) || 'User'} cancelled pending edit request for "${p.name}" (previously requested by ${requester})`);
  await saveDB();
  showToast(`Pending edit request for "${p.name}" has been cancelled.`, 'ok');
  closeModal();
  renderPage();
}

async function toggleProductStatus(id) {
  if (!currentUser || currentUser.role !== 'admin') {
    showToast('Only Administrators can toggle product status.', 'error');
    return;
  }
  const p = productById(id);
  p.status = p.status === 'active' ? 'inactive' : 'active';
  logAudit('PRODUCT_STATUS', 'Product', `Product ${p.name} set to ${p.status}`);
  await saveDB();
  renderPage();
  showToast(`Product ${p.status === 'active' ? 'activated' : 'deactivated'}.`);
}

window.openProductModal = openProductModal;
window.submitProduct = submitProduct;
window.submitProductFormDirectly = submitProductFormDirectly;
