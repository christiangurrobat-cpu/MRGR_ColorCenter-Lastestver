/* ============================================================
   10. POINT OF SALE
   ============================================================ */
let posCategoryFilter = '';

function setPosCategoryFilter(cat) {
  posCategoryFilter = cat;
  const pills = document.querySelectorAll('.pos-cat-pill');
  pills.forEach(p => p.classList.toggle('active', p.dataset.cat === cat));
  renderPosProductList();
}

function clearPosSearch() {
  const input = document.getElementById('pos-search');
  if (input) { input.value = ''; input.focus(); }
  renderPosProductList();
}

function setPosCustomer(val) {
  const input = document.getElementById('pos-customer');
  if (input) { input.value = val; input.focus(); }
}

function posPage() {
  const categories = ['Automotive Paint', 'House Paint', 'Specialty Paint'];
  const cartItemCount = cart.reduce((sum, item) => sum + (item.qty || 1), 0);

  return `
  <div class="pos-grid">
<div>
  <div class="panel">
    <div class="panel-head row wrap" style="justify-content:space-between; gap:10px;">
      <div class="row" style="gap:8px;">
        <span style="font-size:20px;">🛒</span>
        <div>
          <h3 style="margin:0;">Product Catalog</h3>
          <div class="muted small">Hover to preview color shade · Click to add to cart</div>
        </div>
      </div>
      <button class="btn small" style="background:linear-gradient(135deg, #1F6F6B 0%, #298C87 100%); box-shadow:0 2px 8px rgba(31,111,107,0.25);" onclick="openColorMixModal(true)">
        🎨 + Add Custom Color Mix
      </button>
    </div>
    <div class="panel-body" style="padding-bottom:10px;">
      <!-- Search Box with Clear Button -->
      <div style="position:relative; margin-bottom:12px;">
        <span style="position:absolute; left:12px; top:50%; transform:translateY(-50%); font-size:14px; opacity:0.6;">🔍</span>
        <input id="pos-search" type="text" placeholder="Search by paint name, brand, color, or size…" style="padding-left:34px; padding-right:32px; border-radius:var(--radius-sm); font-size:13.5px;" oninput="renderPosProductList()">
        <button type="button" onclick="clearPosSearch()" style="position:absolute; right:10px; top:50%; transform:translateY(-50%); background:none; border:none; color:var(--ink-soft); font-size:14px; cursor:pointer; padding:2px;" title="Clear search">✕</button>
      </div>

      <!-- Category Filter Pills -->
      <div class="pos-cat-pills">
        <button class="pos-cat-pill ${posCategoryFilter === '' ? 'active' : ''}" data-cat="" onclick="setPosCategoryFilter('')">🌈 All Products (${activeProducts().filter(p => Number(p.stock) > 0).length})</button>
        ${categories.map(cat => {
    const count = activeProducts().filter(p => p.type === cat && Number(p.stock) > 0).length;
    return `<button class="pos-cat-pill ${posCategoryFilter === cat ? 'active' : ''}" data-cat="${escapeHtml(cat)}" onclick="setPosCategoryFilter('${escapeHtml(cat)}')">${escapeHtml(cat)} (${count})</button>`;
  }).join('')}
      </div>
    </div>
    <div class="panel-body tight" id="pos-product-list" style="border-top:1px solid var(--line); max-height:460px; overflow-y:auto;"></div>
  </div>
</div>
<div>
  <div class="panel" style="box-shadow:var(--shadow-md);">
    <div class="panel-head row" style="justify-content:space-between;">
      <div class="row" style="gap:8px;">
        <span style="font-size:20px;">🧾</span>
        <h3 style="margin:0;">Current Sale</h3>
      </div>
      <span class="badge ${cart.length ? 'ok' : 'mid'}" id="cart-count-badge" style="font-size:11.5px; padding:3px 10px;">
        ${cart.length ? `🛒 ${cart.length} item${cart.length === 1 ? '' : 's'} (${cartItemCount} qty)` : 'Cart Empty'}
      </span>
    </div>
    <div class="panel-body">
      <div class="field">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
          <label for="pos-customer" style="margin:0;">Customer Name (optional)</label>
          <div class="row wrap" style="gap:4px;">
            <button type="button" class="btn ghost small" style="padding:1px 6px; font-size:11px;" onclick="setPosCustomer('Walk-in Customer')">Walk-in</button>
            <button type="button" class="btn ghost small" style="padding:1px 6px; font-size:11px;" onclick="setPosCustomer('VIP Regular')">VIP Regular</button>
            <button type="button" class="btn ghost small" style="padding:1px 6px; font-size:11px;" onclick="setPosCustomer('Auto Repair Shop')">Auto Shop</button>
          </div>
        </div>
        <input id="pos-customer" type="text" placeholder="e.g. Juan Dela Cruz / Auto Shop">
      </div>

      <div id="cart-lines">${cartLinesHtml()}</div>

      <div id="cart-totals">${cartTotalsHtml()}</div>

      <button class="btn block" style="margin-top:14px; padding:12px; font-size:15px; font-weight:700; background:linear-gradient(135deg, #1F6F6B 0%, #165653 100%);" onclick="completeSale()">
        ✓ Complete &amp; Print Receipt
      </button>
      <div class="muted small" style="margin-top:6px; font-size:11px; text-align:center; display:flex; align-items:center; justify-content:center; gap:4px;">
        <span>🔍 Order review &amp; verification appears before finalizing</span>
      </div>
    </div>
  </div>
</div>
  </div>`;
}

function renderPosProductList() {
  const searchInput = document.getElementById('pos-search');
  const q = (searchInput ? searchInput.value : '').toLowerCase().trim();
  let list = activeProducts().filter(p => Number(p.stock) > 0);

  if (posCategoryFilter) {
    list = list.filter(p => p.type === posCategoryFilter);
  }

  if (q) {
    list = list.filter(p => [p.name, p.brand, p.type, p.color].join(' ').toLowerCase().includes(q));
  }

  const container = document.getElementById('pos-product-list');
  if (!container) return;

  if (!list.length) {
    container.innerHTML = `
  <div class="empty-state" style="padding:32px 20px;">
    <div style="font-size:32px; margin-bottom:8px;">🎨</div>
    <div style="font-weight:600; margin-bottom:4px; color:var(--ink);">No products found matching your search.</div>
    <div class="muted small" style="margin-bottom:14px;">Looking for a custom color or pigment blend?</div>
    <button class="btn secondary small" onclick="openColorMixModal(true)">+ Launch Color Mixing Studio</button>
  </div>`;
    return;
  }

  container.innerHTML = list.map(p => {
    const isOut = p.stock <= 0;
    const isLow = p.stock > 0 && productHasLowStock(p);
    const lowSizes = productLowSizes(p);
    const hex = getProductDefaultColor(p);
    const rgb = hexToRgb(hex);
    const rgbaBg = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.12)`;
    const rgbaGlow = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.35)`;
    const detected = detectMixedColorName(rgb.r, rgb.g, rgb.b);
    const colorLabel = p.color && p.color !== '-' ? p.color : detected.name;

    return `
<div class="pos-product" 
     style="--prod-color: ${hex}; --prod-color-alpha: ${rgbaBg}; --prod-color-glow: ${rgbaGlow};"
     title="🎨 ${escapeHtml(p.name)} [${colorLabel}] · Tone: ${detected.family} (${hex})">
  <span class="hover-color-swatch" style="background-color:${hex};" title="${colorLabel} (${hex})"></span>
  <div class="pinfo">
    <div class="pname">
      <span>${escapeHtml(p.name)} <code style="font-family:'Space Grotesk',monospace; font-size:11px; font-weight:600; color:var(--teal); opacity:0.9;">(${hex})</code></span>
      <span class="color-presentation-pill" title="Color: ${escapeHtml(colorLabel)} (${detected.family} Tone)">
        <span class="cm-color-dot" style="background:${hex}; width:8px; height:8px;"></span>
        ${escapeHtml(colorLabel)}
      </span>
    </div>
    <div class="pmeta">
      <span>${escapeHtml(p.brand)}</span>
      <span style="margin:0 4px;">·</span>
      <span class="muted" style="font-size:11px;">Tone: <b>${detected.family}</b></span>
      <span style="margin:0 4px;">·</span>
      ${isOut ? `<span style="color:var(--danger); font-weight:600;">✕ Out of stock</span>` :
        (isLow ? `<span style="color:#D9622B; font-weight:600;" title="${escapeHtml(productLowSizesSummary(p))}">⚠️ Low (${lowSizes.length ? `${lowSizes.map(s => fmtSize(s)).join(', ')} low` : `${formatLiters(p.stock)} left`})</span>` :
          `<span style="color:var(--success);">✓ ${formatLiters(p.stock)} in stock</span>`)}
    </div>
  </div>
  <div class="pprice">
    <span>${peso(p.price)}</span>
    <span style="font-size:11.5px; font-weight:600; color:var(--ink-soft);">/Liters</span>
  </div>
  <div class="pos-size-picker" style="display:flex; flex-direction:column; align-items:flex-end; gap:5px; min-width:250px;">
    <div style="display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end;">
      ${productSizes(p).map(s => {
        const hasBreakdown = productHasCanBreakdown(p);
        const canCount = productCanCount(p, s);
        const inStock = hasBreakdown ? (canCount > 0 && p.stock >= s) : (p.stock >= s);
        const countLabel = hasBreakdown ? ` (${canCount})` : '';
        const priceLabel = peso(p.price * s);
        return `
          <button type="button" 
                  class="pos-size-btn ${inStock ? '' : 'disabled'}" 
                  ${!inStock ? `disabled title="Out of stock for ${s}L"` : `title="Click to add 1x ${s}L to Current Sale — ${priceLabel}"`}
                  onclick="addSizeToCart('${p.id}', ${s})">
            <span class="ps-size-tag">+ ${fmtSize(s)}</span>
            <span class="ps-stock-tag">${inStock ? countLabel : ' (0)'}</span>
          </button>`;
      }).join('')}
    </div>
    <div class="pos-can-badge" style="display:${isOut ? 'none' : 'inline-flex'}; font-size:10.5px; padding:2px 8px;">
      🛒 Click size to add 1 to Current Sale
    </div>
  </div>
</div>`;
  }).join('');
}

function addSizeToCart(productId, size = 1) {
  const p = productById(productId);
  if (!p || p.stock <= 0) { showToast('This product is out of stock.', 'error'); return; }

  // Check available stock in liters across all lines of this product
  const existingForProduct = cart.filter(c => c.type === 'product' && c.productId === productId);
  const currentLitersInCart = existingForProduct.reduce((sum, c) => sum + (c.qty * (Number(c.size) || 1)), 0);

  if (currentLitersInCart + size > p.stock) {
    showToast(`Not enough stock — only ${formatLiters(p.stock - currentLitersInCart)} available.`, 'error');
    return;
  }

  // If canStock breakdown is tracked, check can count for this size
  if (productHasCanBreakdown(p)) {
    const existingSameSize = cart.find(c => c.type === 'product' && c.productId === productId && (Number(c.size) || 1) === size);
    const cansInCart = existingSameSize ? existingSameSize.qty : 0;
    const availableCans = productCanCount(p, size);
    if (cansInCart + 1 > availableCans) {
      showToast(`Only ${availableCans} in stock for ${size}L (${cansInCart} already in cart).`, 'error');
      return;
    }
  }

  const existing = cart.find(c => c.type === 'product' && c.productId === productId && (Number(c.size) || 1) === size);
  const unitPriceForSize = Number((p.price * size).toFixed(2));

  if (existing) {
    existing.qty += 1;
    existing.lineTotal = Number((existing.qty * existing.unitPrice).toFixed(2));
  } else {
    cart.push({
      type: 'product',
      productId: p.id,
      name: p.name,
      brand: p.brand,
      color: p.color,
      size: size,
      qty: 1,
      unitPrice: unitPriceForSize,
      pricePerLiter: p.price,
      lineTotal: unitPriceForSize
    });
  }
  refreshCartUI();
  showToast(`Added 1x ${size}L ${p.name} to Current Sale.`, 'ok');
}

// Backward compatibility
function addToCart(productId, qty = 1, size = 1) {
  addSizeToCart(productId, size);
}

function changeCartQty(index, delta) {
  const line = cart[index];
  if (!line) return;
  setCartQty(index, (Number(line.qty) || 0) + delta);
}

function setCartQty(index, rawVal) {
  const line = cart[index];
  if (!line) return;
  const newQty = parseInt(rawVal, 10);
  if (isNaN(newQty) || newQty <= 0) {
    cart.splice(index, 1);
    refreshCartUI();
    return;
  }

  if (line.type === 'product') {
    const p = productById(line.productId);
    if (!p) return;
    const size = Number(line.size) || 1;

    // Check against total stock in liters across other lines of this product
    const otherLiters = cart
      .filter((c, idx) => idx !== index && c.type === 'product' && c.productId === line.productId)
      .reduce((sum, c) => sum + (c.qty * (Number(c.size) || 1)), 0);

    if (otherLiters + (newQty * size) > p.stock) {
      const maxAllowed = Math.floor((p.stock - otherLiters) / size);
      showToast(`Not enough stock. Only ${Math.max(0, maxAllowed)} of ${size}L available (${formatLiters(p.stock)} total stock).`, 'error');
      if (maxAllowed <= 0) {
        cart.splice(index, 1);
      } else {
        line.qty = maxAllowed;
        line.lineTotal = Number((line.qty * line.unitPrice).toFixed(2));
      }
      refreshCartUI();
      return;
    }

    if (productHasCanBreakdown(p)) {
      const maxCans = productCanCount(p, size);
      if (newQty > maxCans) {
        showToast(`Only ${maxCans} in stock for ${size}L.`, 'error');
        if (maxCans <= 0) {
          cart.splice(index, 1);
        } else {
          line.qty = maxCans;
          line.lineTotal = Number((line.qty * line.unitPrice).toFixed(2));
        }
        refreshCartUI();
        return;
      }
    }

    line.qty = newQty;
    line.lineTotal = Number((line.qty * line.unitPrice).toFixed(2));
  } else {
    // colormix
    if (Array.isArray(line.components) && line.components.length) {
      for (const comp of line.components) {
        const p = productById(comp.productId);
        const reqLiters = Number((newQty * ((Number(comp.percentage) || 0) / 100)).toFixed(2));
        if (p && productMixAvailableStock(p) < reqLiters) {
          showToast(`Not enough stock for mix ingredient "${comp.name}" (need ${formatStock(reqLiters)}L, available ${formatStock(productMixAvailableStock(p))}L).`, 'error');
          refreshCartUI();
          return;
        }
      }
      line.components = line.components.map(comp => ({
        ...comp,
        liters: Number((newQty * ((Number(comp.percentage) || 0) / 100)).toFixed(2))
      }));
    }
    line.qty = newQty;
    line.liters = newQty;
    line.lineTotal = Number((line.qty * line.unitPrice).toFixed(2));
  }
  refreshCartUI();
}

function removeCartLine(index) { cart.splice(index, 1); refreshCartUI(); }

function refreshCartUI() {
  const cartLinesEl = document.getElementById('cart-lines');
  if (cartLinesEl) cartLinesEl.innerHTML = cartLinesHtml();
  renderCartTotals();
  if (typeof updateNavBadges === 'function') {
    try { updateNavBadges(); } catch (e) { }
  }
}


function tenderFeedbackHtml(t, cash) {
  if (cash > 0) {
    const isShort = cash < t.total;
    const change = Math.max(0, cash - t.total);
    return `
      <div style="margin-top:8px; display:flex; justify-content:space-between; align-items:center; padding:7px 10px; border-radius:6px; background:${isShort ? '#FBEAE8' : '#EAF4EC'}; font-size:12.5px; font-weight:700; color:${isShort ? 'var(--danger)' : 'var(--success)'};">
        <span>${isShort ? '⚠️ Amount Short (Must be higher than total):' : '🪙 Change to Return:'}</span>
        <span>${peso(isShort ? t.total - cash : change)}</span>
      </div>`;
  }
  if (t.total > 0) {
    return `
      <div style="margin-top:6px; font-size:11.5px; color:#A04035; font-weight:600; display:flex; align-items:center; gap:4px;">
        <span>⚠️ Enter Amount is required (must be higher than or equal to ${peso(t.total)}).</span>
      </div>`;
  }
  return '';
}

function updateTenderDisplayOnly() {
  const t = cartTotals();
  const cash = Number(posCashTendered) || 0;
  const isShort = cash > 0 && cash < t.total;
  const isCovered = cash >= t.total && t.total > 0;

  const feedbackEl = document.getElementById('pos-cash-feedback');
  if (feedbackEl) feedbackEl.innerHTML = tenderFeedbackHtml(t, cash);

  const clearBtn = document.getElementById('pos-cash-clear-btn');
  if (clearBtn) clearBtn.style.display = cash > 0 ? 'inline-block' : 'none';

  const input = document.getElementById('pos-cash-input');
  if (input) {
    input.style.borderColor = isShort ? 'var(--danger)' : (isCovered ? 'var(--success)' : '');
    input.style.boxShadow = isShort ? '0 0 0 2px rgba(193,68,61,0.18)' : (isCovered ? '0 0 0 2px rgba(63,131,88,0.18)' : '');
  }
}

function setExactTender() {
  const t = cartTotals();
  posCashTendered = t.total;
  const input = document.getElementById('pos-cash-input');
  if (input) input.value = posCashTendered > 0 ? posCashTendered : '';
  updateTenderDisplayOnly();
}

function addTenderAmount(amt) {
  posCashTendered = (Number(posCashTendered) || 0) + amt;
  const input = document.getElementById('pos-cash-input');
  if (input) input.value = posCashTendered > 0 ? posCashTendered : '';
  updateTenderDisplayOnly();
}

function clearTenderAmount() {
  posCashTendered = 0;
  const input = document.getElementById('pos-cash-input');
  if (input) {
    input.value = '';
    input.focus();
  }
  updateTenderDisplayOnly();
}

function onTenderInputChange(val) {
  posCashTendered = val === '' ? 0 : (Number(val) || 0);
  updateTenderDisplayOnly();
}

function cartLinesHtml() {
  if (!cart.length) return `
<div class="empty-state" style="padding:28px 14px; text-align:center;">
  <div style="font-size:32px; margin-bottom:6px;">🎨</div>
  <div style="font-weight:600; font-size:13.5px; color:var(--ink); margin-bottom:2px;">Your cart is empty</div>
  <div class="muted small">Pick a product from the left catalog or formulate a custom color blend.</div>
</div>`;
  return cart.map((c, i) => `
<div class="cart-line">
  <div class="cname">
    ${c.type === 'colormix' ? `
      <div style="display:flex; align-items:center; gap:8px;">
        <span class="cm-color-dot" style="background:${c.hexColor || '#1F6F6B'}; width:16px; height:16px;" title="${c.hexColor}"></span>
        <span style="font-weight:600;">${escapeHtml(c.name)} — ${escapeHtml(c.colorName)}</span>
      </div>
      ${c.components && c.components.length ? `
        <div class="muted small" style="margin-top:2px; font-size:11px; color:#6B6259;">
          Formula: ${c.components.map(cp => `${cp.percentage}% ${escapeHtml(cp.name)}`).join(' + ')}
        </div>
      ` : ''}
    ` : `
      ${escapeHtml(c.name)} ${c.productId && getProductHex(productById(c.productId)) ? `<span style="font-family:monospace; font-size:11px; font-weight:600; color:var(--teal);">(${getProductHex(productById(c.productId))})</span>` : ''} ${c.colorName ? '— ' + escapeHtml(c.colorName) : (c.color && c.color !== '-' ? '— ' + escapeHtml(c.color) : '')}
    `}
    <span class="cmeta">
      ${c.type === 'product' ? `${escapeHtml(c.brand)} · Size: <strong>${c.size || 1}L</strong> · ${peso(c.unitPrice)} each <span class="muted">(${peso(c.pricePerLiter || c.unitPrice)}/L)</span> · <span style="color:var(--teal); font-weight:600;">${(c.qty * (Number(c.size) || 1)).toFixed(2)} L total</span>` : 'Color mix · ' + c.liters + 'L' + (c.baseType ? ' · ' + escapeHtml(c.baseType) : '') + ' · ' + peso(c.unitPrice) + ' /Liters'}
    </span>
  </div>
  <div class="cprice">
    <span>${peso(c.lineTotal)}</span>
  </div>
  <div class="qty-control" style="display:flex; align-items:center; gap:3px;">
    <button type="button" onclick="changeCartQty(${i},-1)">−</button>
    <input type="number" min="1" step="1" value="${c.qty}" 
           style="width:46px; text-align:center; font-weight:700; font-family:'Space Grotesk'; font-size:13px; padding:2px 3px; border:1px solid var(--line); border-radius:4px;"
           onchange="setCartQty(${i}, this.value)"
           oninput="setCartQty(${i}, this.value)">
    <button type="button" onclick="changeCartQty(${i},1)">+</button>
  </div>
  <button class="btn ghost small" onclick="removeCartLine(${i})" style="color:var(--danger); font-size:15px; padding:2px 6px;" title="Remove item">✕</button>
</div>`).join('');
}

function cartTotals() {
  const subtotal = cart.reduce((t, c) => t + c.lineTotal, 0);
  const discountPct = Number(document.getElementById('pos-discount') ? document.getElementById('pos-discount').value : 0) || 0;
  const discount = Math.round(subtotal * discountPct) / 100;
  const total = subtotal - discount;
  return { subtotal, discountPct, discount, total };
}

function cartTotalsHtml() {
  const t = cartTotals();
  const cash = Number(posCashTendered) || 0;
  const change = Math.max(0, cash - t.total);
  const isShort = cash > 0 && cash < t.total;
  const isCovered = cash >= t.total && t.total > 0;

  return `
<div style="background:#FAF7F2; border:1px solid var(--line); border-radius:var(--radius-sm); padding:12px 14px; margin-top:12px;">
  <div class="cart-total-row"><span class="muted">Subtotal</span><span>${peso(t.subtotal)}</span></div>
  <div class="cart-total-row grand"><span>Total Due</span><span style="color:var(--teal);">${peso(t.total)}</span></div>

  <!-- Quick Tender Cash Calculator -->
  <div style="margin-top:12px; padding-top:10px; border-top:1px dashed var(--line);">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
      <span style="font-size:12px; font-weight:700; color:var(--ink);">💵 Cash Tendered: <span style="color:var(--danger);">*</span></span>
      <div class="row wrap" style="gap:4px;">
        <button type="button" class="btn ghost small" style="padding:1px 6px; font-size:11px; background:#fff; border:1px solid var(--line);" onclick="setExactTender()">Exact</button>
        <button type="button" class="btn ghost small" style="padding:1px 6px; font-size:11px; background:#fff; border:1px solid var(--line);" onclick="addTenderAmount(100)">+₱100</button>
        <button type="button" class="btn ghost small" style="padding:1px 6px; font-size:11px; background:#fff; border:1px solid var(--line);" onclick="addTenderAmount(500)">+₱500</button>
        <button type="button" class="btn ghost small" style="padding:1px 6px; font-size:11px; background:#fff; border:1px solid var(--line);" onclick="addTenderAmount(1000)">+₱1k</button>
      </div>
    </div>
    <div style="display:flex; gap:8px; align-items:center;">
      <input id="pos-cash-input" type="number" min="0" step="any" value="${posCashTendered || ''}" placeholder="Enter Amount (₱)" 
        style="background:#fff; font-weight:700; font-size:14px; padding:7px 10px; ${isShort ? 'border-color:var(--danger); box-shadow:0 0 0 2px rgba(193,68,61,0.18);' : (isCovered ? 'border-color:var(--success); box-shadow:0 0 0 2px rgba(63,131,88,0.18);' : '')}" 
        oninput="onTenderInputChange(this.value)"
        onkeydown="if(event.key==='Enter'){event.preventDefault(); completeSale();}">
      <button id="pos-cash-clear-btn" type="button" class="btn ghost small" style="padding:6px 8px; color:var(--ink-soft); display:${cash > 0 ? 'inline-block' : 'none'};" onclick="clearTenderAmount()" title="Clear cash">✕</button>
    </div>

    <div id="pos-cash-feedback">
      ${tenderFeedbackHtml(t, cash)}
    </div>
  </div>
</div>`;
}

function renderCartTotals() {
  const currentInput = document.getElementById('pos-cash-input');
  if (currentInput && currentInput.value !== '') {
    posCashTendered = Number(currentInput.value) || 0;
  }
  const cartTotalsEl = document.getElementById('cart-totals');
  if (cartTotalsEl) cartTotalsEl.innerHTML = cartTotalsHtml();
}

function posConfirmKeyHandler(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    cancelPosConfirm();
  }
}

function promptCustomerPurchaseConfirmation(data) {
  return new Promise((resolve) => {
    if (typeof posConfirmPromiseResolve === 'function') {
      const prevResolve = posConfirmPromiseResolve;
      posConfirmPromiseResolve = null;
      prevResolve(false);
    }
    posConfirmPromiseResolve = resolve;

    window.removeEventListener('keydown', posConfirmKeyHandler);
    window.addEventListener('keydown', posConfirmKeyHandler);

    const { customerName, cashierName, items, totals, cash, change } = data;

    const totalCount = items.reduce((sum, i) => sum + (Number(i.qty) || 1), 0);
    const totalLiters = items.reduce((sum, i) => {
      if (i.type === 'colormix') return sum + (Number(i.liters) || 0);
      return sum + ((Number(i.qty) || 0) * (Number(i.size) || 1));
    }, 0);

    const itemsRowsHtml = items.map(i => {
      if (i.type === 'colormix') {
        const hex = i.hexColor || '#1F6F6B';
        const formulaSummary = i.components && i.components.length
          ? i.components.map(cp => `${cp.percentage}% ${escapeHtml(cp.name)}`).join(' + ')
          : (i.note || '');
        return `
          <tr>
            <td>
              <div style="display:flex; align-items:center; gap:8px;">
                <span class="cm-color-dot" style="background:${hex}; width:16px; height:16px; border-radius:50%; flex-shrink:0; box-shadow:0 1px 3px rgba(0,0,0,0.2);" title="${hex}"></span>
                <div>
                  <div style="font-weight:600; color:var(--ink);">Custom Color Mix — ${escapeHtml(i.colorName || 'Special Blend')}</div>
                  <div class="muted small" style="font-size:11px; color:#6B6259;">
                    Formula: ${formulaSummary}
                  </div>
                </div>
              </div>
            </td>
            <td style="text-align:center;">
              <span class="badge" style="background:#F2EDE4; border:1px solid var(--line); font-size:11.5px; padding:2px 7px; font-weight:600;">
                ${fmtSize(i.liters || 1)} Mix
              </span>
            </td>
            <td style="text-align:center;">
              <strong style="font-size:13px;">${i.qty || 1}</strong>
              <div class="muted small" style="font-size:10.5px;">${formatStock(i.liters || 1)} L</div>
            </td>
            <td style="text-align:right; font-family:'Space Grotesk',monospace;">${peso(i.unitPrice)}</td>
            <td style="text-align:right; font-weight:700; font-family:'Space Grotesk',monospace; color:var(--ink);">${peso(i.lineTotal)}</td>
          </tr>`;
      }

      const p = productById(i.productId);
      const hex = (p && getProductHex(p)) || '#1F6F6B';
      const size = Number(i.size) || 1;
      const sizeUnit = size <= 1 ? 'Can' : (size <= 4 ? 'Gallon' : 'Drum');
      const totalL = (Number(i.qty) * size).toFixed(2);
      const colorLabel = i.colorName || (i.color && i.color !== '-' ? i.color : (p && p.color && p.color !== '-' ? p.color : ''));

      return `
        <tr>
          <td>
            <div style="display:flex; align-items:center; gap:8px;">
              <span class="cm-color-dot" style="background:${hex}; width:16px; height:16px; border-radius:50%; flex-shrink:0; box-shadow:0 1px 3px rgba(0,0,0,0.2);" title="${hex}"></span>
              <div>
                <div style="font-weight:600; color:var(--ink);">${escapeHtml(i.name)} <code style="font-family:'Space Grotesk',monospace; font-size:11px; font-weight:600; color:var(--teal);">(${hex})</code></div>
                <div class="muted small" style="font-size:11px;">
                  ${escapeHtml(i.brand || (p && p.brand) || '')}
                  ${colorLabel ? ` · Color: <b>${escapeHtml(colorLabel)}</b>` : ''}
                </div>
              </div>
            </div>
          </td>
          <td style="text-align:center;">
            <span class="badge" style="background:#F2EDE4; border:1px solid var(--line); font-size:11.5px; padding:2px 7px; font-weight:600;">
              ${fmtSize(size)} <span class="muted" style="font-size:10.5px;">(${sizeUnit})</span>
            </span>
          </td>
          <td style="text-align:center;">
            <strong style="font-size:13px;">${i.qty}</strong>
            <div class="muted small" style="font-size:10.5px;">${totalL} L</div>
          </td>
          <td style="text-align:right; font-family:'Space Grotesk',monospace;">${peso(i.unitPrice)}</td>
          <td style="text-align:right; font-weight:700; font-family:'Space Grotesk',monospace; color:var(--ink);">${peso(i.lineTotal)}</td>
        </tr>`;
    }).join('');

    const bodyHtml = `
      <div class="pos-confirm-wrapper">
        <div class="pos-confirm-notice">
          <span class="pcn-icon">🔍</span>
          <div style="flex:1;">
            <div class="pcn-title">Order Verification: Are the purchased items accurate?</div>
            <div class="pcn-desc">
              Please review with the customer to confirm that paint products, color shades, can sizes, quantities, and cash/change are correct before completing the sale and printing the receipt.
            </div>
          </div>
        </div>

        <div style="background:#FAF8F5; border:1px solid var(--line); border-radius:8px; padding:10px 14px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; font-size:12.5px;">
          <div>
            <span class="muted">Customer:</span> <strong style="color:var(--ink); font-size:13.5px;">${escapeHtml(customerName)}</strong>
          </div>
          <div>
            <span class="muted">Cashier:</span> <strong>${escapeHtml(cashierName)}</strong>
          </div>
          <div>
            <span class="muted">Total Volume:</span> <span class="badge ok" style="font-size:11.5px; padding:2px 8px; font-weight:700;">${totalCount} item${totalCount === 1 ? '' : 's'} (${formatStock(totalLiters)} L total)</span>
          </div>
        </div>

        <div class="pos-confirm-table-wrap">
          <table class="pos-confirm-table">
            <thead>
              <tr>
                <th style="text-align:left;">Product &amp; Color</th>
                <th style="text-align:center;">Size</th>
                <th style="text-align:center;">Qty</th>
                <th style="text-align:right;">Price</th>
                <th style="text-align:right;">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${itemsRowsHtml}
            </tbody>
          </table>
        </div>

        <div class="pos-confirm-payment-box">
          <div style="display:flex; justify-content:space-between; font-size:12.5px; padding:3px 0;">
            <span class="muted">Subtotal:</span>
            <span style="font-weight:600;">${peso(totals.subtotal)}</span>
          </div>
          ${totals.discount > 0 ? `
            <div style="display:flex; justify-content:space-between; font-size:12.5px; padding:3px 0; color:var(--danger);">
              <span>Discount (${totals.discountPct}%):</span>
              <span>-${peso(totals.discount)}</span>
            </div>
          ` : ''}
          <div style="display:flex; justify-content:space-between; align-items:center; padding:7px 0; border-top:1px dashed var(--line); margin-top:4px;">
            <span style="font-size:13.5px; font-weight:700; color:var(--ink);">Total Due:</span>
            <span style="font-size:18px; font-weight:800; font-family:'Space Grotesk',monospace; color:var(--teal);">${peso(totals.total)}</span>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; font-size:13px; padding:5px 0; border-top:1px dashed var(--line); margin-top:4px;">
            <span class="muted" style="font-weight:600;">💵 Cash Tendered:</span>
            <span style="font-weight:700; font-family:'Space Grotesk',monospace; font-size:14.5px;">${peso(cash)}</span>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; font-size:13.5px; font-weight:700; padding:8px 12px; border-radius:8px; background:#EAF4EC; color:var(--success); margin-top:6px; border:1px solid rgba(47,107,65,0.2);">
            <span>🪙 Change to Return:</span>
            <span style="font-size:17px; font-family:'Space Grotesk',monospace;">${peso(change)}</span>
          </div>
        </div>

        <div style="font-size:12px; color:var(--ink-soft); display:flex; align-items:center; gap:8px; padding:2px 4px;">
          <span style="color:var(--teal); font-weight:bold; font-size:14px;">✔</span>
          <span>Click <b>Confirm &amp; Finalize Sale</b> if all items and amounts are verified. Click <b>Edit / Modify Cart</b> to make adjustments.</span>
        </div>
      </div>
    `;

    const footHtml = `
      <button type="button" class="btn secondary" id="btn-cancel-pos-confirm" onclick="cancelPosConfirm()" style="padding:10px 16px;">
        ✕ Edit / Modify Cart
      </button>
      <button type="button" class="btn" id="btn-submit-pos-confirm" onclick="acceptPosConfirm()" style="background:linear-gradient(135deg, #1F6F6B 0%, #165653 100%); font-weight:700; padding:10px 22px; font-size:14px; box-shadow:0 3px 8px rgba(31,111,107,0.3);">
        ✓ Confirm &amp; Finalize Sale
      </button>
    `;

    openModal('🛒 Confirm Customer Purchase', bodyHtml, footHtml, 'pos-confirm-modal');

    setTimeout(() => {
      const btn = document.getElementById('btn-submit-pos-confirm');
      if (btn) btn.focus();
    }, 60);
  });
}

function acceptPosConfirm() {
  window.removeEventListener('keydown', posConfirmKeyHandler);
  const btn = document.getElementById('btn-submit-pos-confirm');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '⏳ Processing sale…';
  }
  if (typeof posConfirmPromiseResolve === 'function') {
    const fn = posConfirmPromiseResolve;
    posConfirmPromiseResolve = null;
    fn(true);
  }
}

function cancelPosConfirm() {
  window.removeEventListener('keydown', posConfirmKeyHandler);
  if (typeof posConfirmPromiseResolve === 'function') {
    const fn = posConfirmPromiseResolve;
    posConfirmPromiseResolve = null;
    fn(false);
  }
  closeModal();
}

async function completeSale() {
  if (!cart.length) { showToast('Add at least one item first.', 'error'); return; }
  const t = cartTotals();
  const cash = Number(posCashTendered) || 0;

  // Validation: Enter Amount is required
  if (!cash || cash <= 0) {
    showToast('Enter Amount is required to complete the sale.', 'error');
    const cashInput = document.getElementById('pos-cash-input');
    if (cashInput) {
      cashInput.focus();
      cashInput.style.borderColor = 'var(--danger)';
      cashInput.style.boxShadow = '0 0 0 3px rgba(193, 68, 61, 0.25)';
    }
    return;
  }

  // Validation: Amount must be higher than or equal to total due
  if (cash < t.total) {
    showToast(`Amount short by ${peso(t.total - cash)}. Enter Amount must be higher than or equal to total due (${peso(t.total)}).`, 'error');
    const cashInput = document.getElementById('pos-cash-input');
    if (cashInput) {
      cashInput.focus();
      cashInput.style.borderColor = 'var(--danger)';
      cashInput.style.boxShadow = '0 0 0 3px rgba(193, 68, 61, 0.25)';
    }
    return;
  }

  const customerName = document.getElementById('pos-customer').value.trim();
  const items = cart.map(c => ({ ...c }));

  // check stock is still sufficient right before saving (accounting for per-size cans, total liters, and mix ingredients)
  const reqCansByProdSize = {};
  const reqSealedLitersByProd = {};
  const reqMixLitersByProd = {};

  for (const c of items) {
    if (c.type === 'product') {
      const p = productById(c.productId);
      const size = Number(c.size) || 1;
      const qty = Number(c.qty) || 0;
      const liters = Number((qty * size).toFixed(2));
      if (!p) {
        showToast(`Product "${c.name}" is no longer available.`, 'error');
        return;
      }
      const sizeKey = `${p.id}_${size}`;
      reqCansByProdSize[sizeKey] = (reqCansByProdSize[sizeKey] || 0) + qty;
      reqSealedLitersByProd[p.id] = Number(((reqSealedLitersByProd[p.id] || 0) + liters).toFixed(2));

      if (productHasCanBreakdown(p) && reqCansByProdSize[sizeKey] > productCanCount(p, size)) {
        showToast(`Not enough ${size}L cans for ${p.name} (only ${productCanCount(p, size)} in stock).`, 'error');
        return;
      }
      if (reqSealedLitersByProd[p.id] > p.stock) {
        showToast(`Not enough stock for ${p.name} (${formatLiters(p.stock)} available).`, 'error');
        return;
      }
    } else if (c.type === 'colormix' && c.components && c.components.length) {
      for (const comp of c.components) {
        const p = productById(comp.productId);
        if (p) {
          reqMixLitersByProd[p.id] = Number(((reqMixLitersByProd[p.id] || 0) + (Number(comp.liters) || 0)).toFixed(2));
          const remainingAvail = Number((productMixAvailableStock(p) - (reqSealedLitersByProd[p.id] || 0)).toFixed(2));
          if (remainingAvail < reqMixLitersByProd[p.id]) {
            showToast(`Not enough stock on ingredient "${comp.name}" (${formatStock(Math.max(0, remainingAvail))}L available, need ${formatStock(reqMixLitersByProd[p.id])}L) for ${c.colorName} mix.`, 'error');
            return;
          }
        }
      }
    }
  }

  const change = Math.max(0, cash - t.total);

  // Prompt cashier to confirm if customer's purchase is correct
  const isConfirmed = await promptCustomerPurchaseConfirmation({
    customerName: customerName || 'Walk-in Customer',
    cashierName: (currentUser && currentUser.name) || 'Cashier',
    items,
    totals: t,
    cash,
    change
  });

  if (!isConfirmed) {
    showToast('Returned to cart. You can review or modify items.', 'info');
    return;
  }

  const receiptNo = generateReceiptNo();
  const sale = {
    id: uid('sale'),
    receiptNo,
    date: nowISO(),
    cashierName: (currentUser && currentUser.name) || 'Cashier',
    customerName,
    items,
    subtotal: t.subtotal,
    discountPct: t.discountPct,
    discount: t.discount,
    total: t.total,
    cashTendered: cash,
    change: change,
  };
  db.sales.push(sale);

  items.forEach(c => {
    if (c.type === 'product') {
      const p = productById(c.productId);
      const size = Number(c.size) || 1;
      const count = Number(c.qty) || 0;
      const litersDeducted = Number((count * size).toFixed(2));
      let trailNote = '';
      if (p) {
        const beforeStock = Number(p.stock) || 0;
        const beforeCans = productCanCount(p, size);
        p.stock = Math.max(0, Number((p.stock - litersDeducted).toFixed(2)));
        if (!p.canStock || typeof p.canStock !== 'object' || Array.isArray(p.canStock)) {
          p.canStock = {};
        }
        p.canStock[size] = Math.max(0, (Number(p.canStock[size]) || 0) - count);
        const afterCans = productCanCount(p, size);
        trailNote = ` · ${size}L Cans: ${beforeCans}→${afterCans}, Stock: ${formatStock(beforeStock)}L→${formatStock(p.stock)}L`;
      }
      db.movements.push({
        id: uid('mv'),
        date: sale.date,
        type: 'sale',
        productId: p ? p.id : null,
        productName: p ? p.name : c.name,
        qtyChange: -litersDeducted,
        note: `Sold via POS (${receiptNo}) [Sold ${count} × ${size}L${trailNote}]`,
        staffName: (currentUser && currentUser.name) || 'Cashier'
      });
    } else {
      // Color Mix: Deduct constituent ingredient stocks (using Opened / Used Stock first, then sealed cans) and log movement details
      if (c.components && c.components.length) {
        c.components.forEach(comp => {
          const p = productById(comp.productId);
          if (p) {
            const beforeStock = Number(p.stock) || 0;
            const plan = consumeProductForColorMix(p, comp.liters, comp.preferredCanSize || 0);
            const mixNoteExtra = formatMixConsumptionNote(plan);
            db.movements.push({
              id: uid('mv'),
              date: sale.date,
              type: 'colormix',
              productId: p.id,
              productName: `${p.name} (for ${c.colorName} mix)`,
              colorName: c.colorName,
              qtyChange: -comp.liters,
              note: `Color mix ingredient: ${comp.percentage}% of ${c.liters}L (${c.colorName}) · Receipt: ${receiptNo}${mixNoteExtra} · Stock: ${formatStock(beforeStock)}L→${formatStock(p.stock)}L`,
              staffName: (currentUser && currentUser.name) || 'Cashier'
            });
          }
        });
      }

      const formulaSummary = c.components && c.components.length
        ? c.components.map(cp => `${cp.percentage}% ${cp.name}`).join(' + ')
        : (c.note || '');

      db.movements.push({
        id: uid('mv'),
        date: sale.date,
        type: 'colormix',
        productId: null,
        productName: `Custom Color Mix — ${c.colorName}` + (c.detectedColorName ? ` [${c.detectedColorName}]` : ''),
        colorName: c.colorName,
        qtyChange: c.liters,
        note: `Formula: ${formulaSummary} · Receipt: ${receiptNo}`,
        staffName: (currentUser && currentUser.name) || 'Cashier'
      });
    }
  });

  await saveDB();
  cart = [];
  posCashTendered = 0;
  renderApp();
  showReceipt(sale);
}

function showReceipt(sale) {
  const receiptNo = getReceiptNo(sale);
  const returnedVal = typeof getSaleReturnedValue === 'function' ? getSaleReturnedValue(sale) : Number(sale.refundTotal || 0);
  const exchangeTotal = typeof getSaleExchangeTotal === 'function' ? getSaleExchangeTotal(sale) : 0;
  const refundTotal = Number(sale.refundTotal || 0);
  const netTotal = Number((sale.total - refundTotal).toFixed(2));
  const status = sale.status || 'completed';

  const itemsHtml = sale.items.map(i => {
    const size = Number(i.size) || (i.type === 'product' ? 1 : null);
    const sizeLabel = size ? ` · ${size}L` : '';
    const litersText = size ? ` (${(i.qty * size).toFixed(2)} L)` : '';
    return `
<tr>
  <td>
    <div style="font-weight:600; display:flex; align-items:center; gap:6px;">
      ${i.type === 'colormix' && i.hexColor ? `<span class="cm-color-dot" style="background:${i.hexColor}; width:13px; height:13px;"></span>` : ''}
      ${escapeHtml(i.name)} ${i.productId && getProductHex(productById(i.productId)) ? `<span class="muted small" style="font-family:monospace; font-weight:600; color:var(--teal);">(${getProductHex(productById(i.productId))})</span>` : ''}
    </div>
    <div class="muted small">
      ${escapeHtml(i.brand || '')}${sizeLabel}${litersText}
      ${i.colorName ? ` · Color: <b>${escapeHtml(i.colorName)}</b>` : (i.color && i.color !== '-' ? ` · Color: ${escapeHtml(i.color)}` : '')}
    </div>
    ${i.components && i.components.length ? `
      <div class="muted small" style="font-size:11px; margin-top:2px; color:#6B6259;">
        Blend Formula: ${i.components.map(cp => `${cp.percentage}% ${escapeHtml(cp.name)} (${formatStock(cp.liters)}L)`).join(', ')}
      </div>
    ` : ''}
    ${i.returnedQty ? `<div style="margin-top:2px;"><span class="badge sale-refunded" style="font-size:10px; padding:1px 6px;">${formatStock(i.returnedQty)} returned / exchanged</span></div>` : ''}
  </td>
  <td class="right">${formatStock(i.qty)}${size ? ` (${size}L)` : ''}</td>
  <td class="right">${peso(i.unitPrice)}</td>
  <td class="right" style="font-weight:600;">${peso(i.lineTotal)}</td>
</tr>`;
  }).join('');

  openModal('Official Sales Receipt', `
<div id="printable-receipt" style="background:#fff; border:1px solid var(--line); border-radius:var(--radius-sm); padding:16px 18px; margin-bottom:12px;">
  <div style="text-align:center; padding-bottom:12px; border-bottom:1px dashed var(--line); margin-bottom:12px;">
    <div style="font-family:'Space Grotesk'; font-weight:700; font-size:16px; letter-spacing:-0.01em;">MRGR COLOR CENTER</div>
    <div class="muted small">Sales &amp; Inventory Management System</div>
    <div style="display:inline-block; margin-top:8px; padding:4px 12px; background:#F4EFE6; border:1px solid var(--line); border-radius:4px; font-family:'Space Grotesk'; font-weight:700; font-size:14px; color:var(--teal);">
      Official Receipt #: <span>${escapeHtml(receiptNo)}</span>
    </div>
  </div>
  
  <div class="row wrap" style="justify-content:space-between; font-size:12.5px; margin-bottom:12px; gap:8px;">
    <div>
      <div><span class="muted">Date:</span> <b>${formatDateTime(sale.date)}</b></div>
      <div><span class="muted">Cashier:</span> <b>${escapeHtml(sale.cashierName)}</b></div>
    </div>
    <div class="right">
      <div><span class="muted">Customer:</span> <b>${escapeHtml(sale.customerName) || 'Walk-in Customer'}</b></div>
      <div><span class="muted">Status:</span> ${saleStatusBadge(status)}</div>
    </div>
  </div>

  <table style="margin-top:8px;">
    <thead>
      <tr>
        <th>Item</th>
        <th class="right">Qty</th>
        <th class="right">Price</th>
        <th class="right">Total</th>
      </tr>
    </thead>
    <tbody>
      ${itemsHtml}
    </tbody>
  </table>

  <div style="margin-top:12px; padding-top:10px; border-top:1px dashed var(--line);">
    <div class="cart-total-row"><span class="muted">Subtotal</span><span>${peso(sale.subtotal)}</span></div>
    ${sale.discount > 0 ? `<div class="cart-total-row"><span class="muted">Discount (${sale.discountPct}%)</span><span>-${peso(sale.discount)}</span></div>` : ''}
    <div class="cart-total-row ${(returnedVal > 0 || refundTotal > 0) ? '' : 'grand'}"><span>Total Amount</span><span>${peso(sale.total)}</span></div>
    ${(returnedVal > 0 || refundTotal > 0) ? `
      <div class="cart-total-row" style="color:var(--danger);"><span class="muted">Returned Credit</span><span>-${peso(returnedVal || refundTotal)}</span></div>
      ${exchangeTotal > 0 ? `<div class="cart-total-row" style="color:var(--teal);"><span class="muted">Replacement Issued (Exchange)</span><span>+${peso(exchangeTotal)}</span></div>` : ''}
      <div class="cart-total-row grand"><span>Net Total</span><span style="color:var(--teal);">${peso(netTotal)}</span></div>
    ` : ''}
    ${sale.cashTendered ? `
      <div class="cart-total-row" style="margin-top:6px; padding-top:6px; border-top:1px dashed var(--line);"><span class="muted">Cash Tendered</span><span>${peso(sale.cashTendered)}</span></div>
      <div class="cart-total-row" style="font-weight:600; color:var(--success);"><span>Change Returned</span><span>${peso(sale.change || 0)}</span></div>
    ` : ''}
  </div>

  <div class="muted center small" style="margin-top:14px; font-size:11px; line-height:1.4;">
    Thank you for purchasing at MRGR Color Center! Retain this receipt for aftersales support. Returns &amp; exchanges are valid within the same day of purchase only.
  </div>
</div>
  `, `
<button class="btn secondary" onclick="printReceiptSection()">🖨️ Print Receipt</button>
<button class="btn" onclick="closeModal()">Done</button>
  `);
}

function printReceiptSection() {
  const receiptEl = document.getElementById('printable-receipt');
  if (!receiptEl) return;
  const printWin = window.open('', '_blank', 'width=650,height=750');
  if (!printWin) {
    showToast('Popup blocker prevented receipt window from opening. Please allow popups.', 'error');
    return;
  }
  printWin.document.write(`
<!DOCTYPE html>
<html>
  <head>
    <title>Receipt - MRGR Color Center</title>
    <style>
      body { font-family: 'Inter', system-ui, sans-serif; font-size: 13px; color: #26211C; padding: 24px; line-height: 1.5; }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; }
      th { text-align: left; font-size: 11px; text-transform: uppercase; border-bottom: 1px solid #ddd; padding: 6px 8px; }
      td { padding: 6px 8px; border-bottom: 1px solid #eee; vertical-align: middle; }
      .right { text-align: right; }
      .center { text-align: center; }
      .muted { color: #666; font-size: 12px; }
      .grand { font-size: 16px; font-weight: bold; border-top: 1px dashed #333; margin-top: 8px; padding-top: 8px; }
      .cart-total-row { display: flex; justify-content: space-between; padding: 3px 0; }
      .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: bold; background: #eaf4ec; color: #2f6b41; }
    </style>
  </head>
  <body>
    ${receiptEl.outerHTML}
    <script>window.onload = function(){ window.print(); window.close(); }<\/script>
  </body>
</html>
  `);
  printWin.document.close();
}
