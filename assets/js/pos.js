/* ============================================================
   10. POINT OF SALE
   ============================================================ */
let posCategoryFilter = '';
let posCurrentPage = 1;
const POS_PAGE_SIZE = 8;

function setPosPage(newPage) {
  const target = parseInt(newPage, 10);
  if (isNaN(target)) return;
  posCurrentPage = target;
  renderPosProductList();
}

function setPosCategoryFilter(cat) {
  posCategoryFilter = cat;
  const pills = document.querySelectorAll('.pos-cat-pill');
  pills.forEach(p => p.classList.toggle('active', p.dataset.cat === cat));
  renderPosProductList();
}

function clearPosSearch() {
  const input = document.getElementById('pos-search');
  if (input) { input.value = ''; input.focus(); }
  posCurrentPage = 1;
  renderPosProductList();
}

function clearPosCart() {
  if (!cart.length) return;
  if (!confirm('Are you sure you want to clear all items from Current Sale?')) return;
  cart = [];
  refreshCartUI();
  showToast('Current Sale cart has been cleared.', 'info');
}

function posPage() {
  const categories = ['Automotive Paint', 'House Paint', 'Specialty Paint'];
  const cartItemCount = cart.reduce((sum, item) => sum + (item.qty || 1), 0);
  const totalActive = activeProducts().length;

  setTimeout(() => {
    updateCheckoutButtonState();
  }, 20);

  return `
  <div class="pos-grid">
    <div>
      <div class="panel">
        <div class="panel-head row wrap" style="justify-content:space-between; gap:10px;">
          <div class="row" style="gap:8px;">
            <span style="font-size:20px;">🛒</span>
            <div>
              <h3 style="margin:0;">Product Catalog</h3>
              <div class="muted small">Select paint products or formulation to add to cart</div>
            </div>
          </div>
          <button class="btn small" style="background:linear-gradient(135deg, #1F6F6B 0%, #298C87 100%); box-shadow:0 2px 8px rgba(31,111,107,0.25);" onclick="openColorMixModal(true)">
            🎨 + Add Custom Color Mix
          </button>
        </div>
        <div class="panel-body" style="padding-bottom:10px;">
          <!-- Search Box with Clear Button -->
          <div class="pos-search-wrap">
            <span class="pos-search-icon">🔍</span>
            <input id="pos-search" type="text" class="pos-search-input" placeholder="Search by paint name, brand, color, or size…" oninput="renderPosProductList()">
            <button type="button" class="pos-search-clear" onclick="clearPosSearch()" title="Clear search">✕</button>
          </div>

          <!-- Category Filter Pills -->
          <div class="pos-cat-pills">
            <button class="pos-cat-pill ${posCategoryFilter === '' ? 'active' : ''}" data-cat="" onclick="setPosCategoryFilter('')">
              <span>🌈 All Products</span>
              <span class="pill-count">${totalActive}</span>
            </button>
            ${categories.map(cat => {
    const count = activeProducts().filter(p => p.type === cat).length;
    return `
              <button class="pos-cat-pill ${posCategoryFilter === cat ? 'active' : ''}" data-cat="${escapeHtml(cat)}" onclick="setPosCategoryFilter('${escapeHtml(cat)}')">
                <span>${escapeHtml(cat)}</span>
                <span class="pill-count">${count}</span>
              </button>`;
  }).join('')}
          </div>
        </div>
        <div class="panel-body tight" id="pos-product-list"></div>
        <div id="pos-pagination" class="pos-pagination-bar"></div>
      </div>
    </div>
    <div>
      <div class="panel" style="box-shadow:var(--shadow-md);">
        <div class="panel-head row" style="justify-content:space-between;">
          <div class="row" style="gap:8px;">
            <span style="font-size:20px;">🧾</span>
            <h3 style="margin:0;">Current Sale</h3>
          </div>
          <div class="row" style="gap:6px; align-items:center;">
            ${cart.length ? `<button type="button" class="btn ghost small" style="padding:2px 8px; font-size:11px; color:var(--danger);" onclick="clearPosCart()" title="Empty cart">🗑️ Clear</button>` : ''}
            <span class="badge ${cart.length ? 'ok' : 'mid'}" id="cart-count-badge" style="font-size:11.5px; padding:3px 10px;">
              ${cart.length ? `🛒 ${cart.length} item${cart.length === 1 ? '' : 's'} (${cartItemCount} qty)` : 'Cart Empty'}
            </span>
          </div>
        </div>
        <div class="panel-body">
          <div id="cart-lines">${cartLinesHtml()}</div>

          <div id="cart-totals">${cartTotalsHtml()}</div>

          <button id="btn-complete-sale" class="btn block" onclick="completeSale()" disabled>
            ✓ Complete &amp; Print Receipt
          </button>
          <div id="pos-checkout-hint" class="pos-checkout-hint">
            <span>🛒 Cart is empty · Add products to continue</span>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

function renderPosProductList() {
  const searchInput = document.getElementById('pos-search');
  const q = (searchInput ? searchInput.value : '').toLowerCase().trim();
  let list = activeProducts();

  if (posCategoryFilter) {
    list = list.filter(p => p.type === posCategoryFilter);
  }

  if (q) {
    list = list.filter(p => {
      const searchBlob = [
        p.name,
        p.brand,
        p.type,
        p.color,
        p.productId || '',
        p.product_id || '',
        p.id || '',
        productSizeVariants(p).map(v => `${v.sizeId} ${v.containerSize}L`).join(' ')
      ].join(' ').toLowerCase();
      return searchBlob.includes(q);
    });
  }

  const container = document.getElementById('pos-product-list');
  const pagContainer = document.getElementById('pos-pagination');
  if (!container) return;

  const totalItems = list.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / POS_PAGE_SIZE));

  // Requirement 5: Automatically recalculate pagination.
  // If the current page exceeds the available pages after filtering, automatically return to the nearest valid page.
  if (posCurrentPage > totalPages) {
    posCurrentPage = totalPages;
  }
  if (posCurrentPage < 1) {
    posCurrentPage = 1;
  }

  if (!totalItems) {
    container.innerHTML = `
    <div class="empty-state" style="padding:36px 20px; text-align:center;">
      <div style="font-size:36px; margin-bottom:8px;">🎨</div>
      <div style="font-weight:700; margin-bottom:4px; color:var(--ink);">No products found matching your search.</div>
      <div class="muted small" style="margin-bottom:14px;">Looking for a custom color or pigment blend?</div>
      <button class="btn secondary small" onclick="openColorMixModal(true)">+ Launch Color Mixing Studio</button>
    </div>`;

    if (pagContainer) {
      pagContainer.innerHTML = `
      <div class="pos-pagination-inner">
        <div class="pos-pagination-info">
          <span>Showing <strong>0</strong> of <strong>0</strong> products</span>
        </div>
        <div class="pos-pagination-controls">
          <button type="button" class="pos-pagination-btn nav-prev" id="pos-prev-btn" disabled title="No previous page">‹ Previous</button>
          <span class="pos-pagination-counter">Page <strong>1</strong> of <strong>1</strong></span>
          <button type="button" class="pos-pagination-btn nav-next" id="pos-next-btn" disabled title="No next page">Next ›</button>
        </div>
      </div>`;
    }
    return;
  }

  // Requirement 3: Display a maximum of 8-10 products per page
  const startIndex = (posCurrentPage - 1) * POS_PAGE_SIZE;
  const endIndex = Math.min(startIndex + POS_PAGE_SIZE, totalItems);
  const pagedList = list.slice(startIndex, endIndex);

  container.innerHTML = pagedList.map(p => {
    const isOut = Number(p.stock) <= 0;
    const hex = getProductDefaultColor(p);
    const rgb = hexToRgb(hex);
    const rgbaBg = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.12)`;
    const rgbaGlow = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.35)`;
    const detected = detectMixedColorName(rgb.r, rgb.g, rgb.b);
    const colorLabel = p.color && p.color !== '-' ? p.color : detected.name;

    // Stock availability status indicator (Only show Out of Stock if 0 available)
    const stockBadgeHtml = isOut
      ? `<span>·</span> <span class="pos-stock-tag out-of-stock" title="Out of stock (0L available)"><span class="dot"></span> Out of Stock</span>`
      : '';

    return `
    <div class="pos-product ${isOut ? 'out-of-stock-row' : ''}" 
         style="--prod-color: ${hex}; --prod-color-alpha: ${rgbaBg}; --prod-color-glow: ${rgbaGlow};"
         title="${escapeHtml(p.name)} [${colorLabel}] · Brand: ${escapeHtml(p.brand || '')}">
      <div class="pos-swatch-box" style="background-color:${hex};" title="Color: ${escapeHtml(colorLabel)} (${hex})"></div>
      <div class="pinfo">
        <div class="pname">
          <span>${escapeHtml(p.name)}</span>
          <span class="pos-color-badge" title="Color: ${escapeHtml(colorLabel)} (${detected.family} tone)">
            <span class="cm-color-dot" style="background:${hex}; width:8px; height:8px; border-radius:50%; display:inline-block;"></span>
            <span>${escapeHtml(colorLabel)}</span>
            <code class="pos-hex-code">(${hex})</code>
          </span>
        </div>
        <div class="pmeta">
          <span style="font-weight:600; color:var(--ink);">${escapeHtml(p.brand || '')}</span>
          <span class="muted" style="font-size:11px;">· Tone: <b>${detected.family}</b></span>
          ${stockBadgeHtml}
        </div>
      </div>
      <div class="pprice">
        <span class="price-val">${peso(p.price)}</span>
        <span class="price-unit">/ Liter</span>
      </div>
      <div class="pos-size-picker">
        <div class="pos-size-buttons">
          ${productSizes(p).map(s => {
      const variant = productSizeVariantBySize(p, s);
      const hasBreakdown = productHasCanBreakdown(p);
      const canCount = productCanCount(p, s);
      const inStock = hasBreakdown ? (canCount > 0 && p.stock >= s) : (p.stock >= s);
      const countLabel = hasBreakdown ? `(${canCount})` : '';
      const canPrice = variant ? variant.pricePerCan : (p.price * s);
      const priceLabel = peso(canPrice);
      return `
              <button type="button" 
                      class="pos-size-btn ${inStock ? '' : 'disabled'}" 
                      ${!inStock ? `disabled title="Out of stock for ${fmtSize(s)}"` : `title="Add 1x ${fmtSize(s)} to cart — ${priceLabel}"`}
                      onclick="addSizeToCart('${p.id}', ${s})">
                <span class="ps-size-tag">+ ${fmtSize(s)}</span>
                <span class="ps-stock-tag">${inStock ? countLabel : '(0)'}</span>
              </button>`;
    }).join('')}
        </div>
        <span class="pos-size-hint">${isOut ? 'Currently unavailable' : 'Click size to add to cart'}</span>
      </div>
    </div>`;
  }).join('');

  if (pagContainer) {
    const isFirstPage = posCurrentPage <= 1;
    const isLastPage = posCurrentPage >= totalPages;

    let pageButtonsHtml = '';
    if (totalPages > 1) {
      const pageNums = typeof buildPaginationPageNumbers === 'function'
        ? buildPaginationPageNumbers(posCurrentPage, totalPages)
        : Array.from({ length: totalPages }, (_, i) => i + 1);

      pageButtonsHtml = pageNums.map(pn => {
        if (pn === '...') {
          return '<span class="pos-pagination-ellipsis" aria-hidden="true">…</span>';
        }
        const isActive = pn === posCurrentPage;
        return `<button type="button" 
                        class="pos-pagination-btn pos-page-num ${isActive ? 'active' : ''}" 
                        ${isActive ? 'aria-current="page"' : ''}
                        onclick="setPosPage(${pn})" 
                        title="Page ${pn}">
                  ${pn}
                </button>`;
      }).join('');
    }

    pagContainer.innerHTML = `
      <div class="pos-pagination-inner">
        <div class="pos-pagination-info">
          <span>Showing <strong>${startIndex + 1}–${endIndex}</strong> of <strong>${totalItems}</strong> products</span>
        </div>
        <div class="pos-pagination-controls">
          <button type="button" 
                  class="pos-pagination-btn nav-prev" 
                  id="pos-prev-btn" 
                  onclick="setPosPage(${posCurrentPage - 1})" 
                  ${isFirstPage ? 'disabled' : ''} 
                  title="Previous page">
            ‹ Previous
          </button>
          ${pageButtonsHtml ? `<div class="pos-pagination-pages">${pageButtonsHtml}</div>` : ''}
          <span class="pos-pagination-counter">Page <strong>${posCurrentPage}</strong> of <strong>${totalPages}</strong></span>
          <button type="button" 
                  class="pos-pagination-btn nav-next" 
                  id="pos-next-btn" 
                  onclick="setPosPage(${posCurrentPage + 1})" 
                  ${isLastPage ? 'disabled' : ''} 
                  title="Next page">
            Next ›
          </button>
        </div>
      </div>`;
  }
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

  const variant = productSizeVariantBySize(p, size);
  const existing = cart.find(c => c.type === 'product' && (c.productId === p.id || c.productId === p.productId) && (c.sizeId ? c.sizeId === (variant ? variant.sizeId : null) : (Number(c.size) || 1) === size));
  const unitPriceForSize = variant ? Number(variant.pricePerCan.toFixed(2)) : Number((p.price * size).toFixed(2));

  if (existing) {
    existing.qty += 1;
    existing.lineTotal = Number((existing.qty * existing.unitPrice).toFixed(2));
  } else {
    cart.push({
      type: 'product',
      productId: p.productId || p.id,
      product_id: p.productId || p.id,
      sizeId: variant ? variant.sizeId : null,
      size_id: variant ? variant.sizeId : null,
      containerSize: size,
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
  showToast(`Added 1x ${fmtSize(size)} ${p.name} to Current Sale.`, 'ok');
}

// Backward compatibility
function addToCart(productId, qty = 1, size = 1) {
  addSizeToCart(productId, size);
}

function changeCartQty(index, delta) {
  const line = cart[index];
  if (!line) return;
  const next = (Number(line.qty) || 0) + delta;
  if (next <= 0) {
    cart.splice(index, 1);
    refreshCartUI();
    return;
  }
  setCartQty(index, next);
}

function handleCartQtyInput(index, input) {
  const line = cart[index];
  if (!line) return;
  const raw = input.value.trim();
  if (raw === '') return;
  let newQty = parseInt(raw, 10);
  if (isNaN(newQty) || newQty < 1) return;

  if (line.type === 'product') {
    const p = productById(line.productId);
    if (p) {
      const size = Number(line.size) || 1;
      const otherLiters = cart
        .filter((c, idx) => idx !== index && c.type === 'product' && c.productId === line.productId)
        .reduce((sum, c) => sum + (c.qty * (Number(c.size) || 1)), 0);

      const maxAllowed = Math.floor((p.stock - otherLiters) / size);
      if (newQty > maxAllowed) {
        showToast(`Not enough stock. Only ${Math.max(0, maxAllowed)} of ${size}L available (${formatLiters(p.stock)} total stock).`, 'error');
        newQty = Math.max(1, maxAllowed);
        input.value = newQty;
      }

      if (productHasCanBreakdown(p)) {
        const maxCans = productCanCount(p, size);
        if (newQty > maxCans) {
          showToast(`Only ${maxCans} in stock for ${size}L.`, 'error');
          newQty = Math.max(1, maxCans);
          input.value = newQty;
        }
      }
    }
  } else {
    // colormix
    if (Array.isArray(line.components) && line.components.length) {
      for (const comp of line.components) {
        const p = productById(comp.productId);
        const reqLiters = Number((newQty * ((Number(comp.percentage) || 0) / 100)).toFixed(2));
        if (p && productMixAvailableStock(p) < reqLiters) {
          showToast(`Not enough stock for mix ingredient "${comp.name}".`, 'error');
          return;
        }
      }
      line.components = line.components.map(comp => ({
        ...comp,
        liters: Number((newQty * ((Number(comp.percentage) || 0) / 100)).toFixed(2))
      }));
    }
    line.liters = newQty;
  }

  line.qty = newQty;
  line.lineTotal = Number((line.qty * line.unitPrice).toFixed(2));
  updateCartLineDOM(index);
}

function handleCartQtyChange(index, input) {
  const line = cart[index];
  if (!line) return;
  const raw = input.value.trim();
  let newQty = parseInt(raw, 10);
  if (isNaN(newQty) || newQty < 1) {
    newQty = 1;
    input.value = 1;
  }
  setCartQty(index, newQty);
}

function handleCartQtyBlur(index, input) {
  handleCartQtyChange(index, input);
}

function updateCartLineDOM(index) {
  const line = cart[index];
  if (!line) return;

  const priceEl = document.getElementById(`cart-price-${index}`);
  if (priceEl) {
    priceEl.innerHTML = `<span>${peso(line.lineTotal)}</span>`;
  }

  const metaEl = document.getElementById(`cart-meta-${index}`);
  if (metaEl) {
    const isMix = line.type === 'colormix';
    metaEl.innerHTML = isMix
      ? `Custom Mix · <strong>${line.liters}L</strong> · ${peso(line.unitPrice)}/L`
      : `${escapeHtml(line.brand || '')} · Size: <strong>${line.size || 1}L</strong> · ${peso(line.unitPrice)} each · <span class="total-liters" style="color:var(--teal); font-weight:600;">${(line.qty * (Number(line.size) || 1)).toFixed(2)} L total</span>`;
  }

  const cartCountBadge = document.getElementById('cart-count-badge');
  if (cartCountBadge) {
    const cartItemCount = cart.reduce((sum, item) => sum + (item.qty || 1), 0);
    cartCountBadge.className = `badge ${cart.length ? 'ok' : 'mid'}`;
    cartCountBadge.innerHTML = cart.length ? `🛒 ${cart.length} item${cart.length === 1 ? '' : 's'} (${cartItemCount} qty)` : 'Cart Empty';
  }

  renderCartTotals();
  updateCheckoutButtonState();
}

function setCartQty(index, rawVal) {
  const line = cart[index];
  if (!line) return;
  let newQty = parseInt(rawVal, 10);
  if (isNaN(newQty) || newQty <= 0) {
    newQty = 1;
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
  const activeEl = document.activeElement;
  let focusedInputId = null;
  let selectionStart = null;
  let selectionEnd = null;

  if (activeEl && activeEl.id && activeEl.id.startsWith('cart-qty-input-')) {
    focusedInputId = activeEl.id;
    try {
      selectionStart = activeEl.selectionStart;
      selectionEnd = activeEl.selectionEnd;
    } catch (e) {}
  }

  const cartLinesEl = document.getElementById('cart-lines');
  if (cartLinesEl) cartLinesEl.innerHTML = cartLinesHtml();

  const cartCountBadge = document.getElementById('cart-count-badge');
  if (cartCountBadge) {
    const cartItemCount = cart.reduce((sum, item) => sum + (item.qty || 1), 0);
    cartCountBadge.className = `badge ${cart.length ? 'ok' : 'mid'}`;
    cartCountBadge.innerHTML = cart.length ? `🛒 ${cart.length} item${cart.length === 1 ? '' : 's'} (${cartItemCount} qty)` : 'Cart Empty';
  }

  renderCartTotals();
  updateCheckoutButtonState();

  if (typeof updateNavBadges === 'function') {
    try { updateNavBadges(); } catch (e) { }
  }

  if (focusedInputId) {
    const nextInput = document.getElementById(focusedInputId);
    if (nextInput) {
      nextInput.focus();
      try {
        if (selectionStart !== null && selectionEnd !== null) {
          nextInput.setSelectionRange(selectionStart, selectionEnd);
        }
      } catch (e) {}
    }
  }
}

function cartLinesHtml() {
  if (!cart.length) {
    return `
    <div class="empty-cart-state">
      <div class="empty-cart-icon">🛒</div>
      <div class="empty-cart-title">Your cart is empty</div>
      <div class="empty-cart-desc">Pick a product from the left catalog or formulate a custom color blend.</div>
    </div>`;
  }
  return cart.map((c, i) => {
    const isMix = c.type === 'colormix';
    const p = c.productId ? productById(c.productId) : null;
    const hex = c.hexColor || (p ? getProductHex(p) : '#1F6F6B');

    return `
    <div class="cart-line">
      <span class="cm-color-dot" style="background:${hex}; width:16px; height:16px; border-radius:50%; flex-shrink:0; border:1px solid rgba(0,0,0,0.15);" title="${hex}"></span>
      <div class="cname">
        <div class="cname-title">
          <span>${escapeHtml(c.name)}</span>
          ${isMix ? `<span class="badge" style="font-size:10.5px; padding:1px 6px; background:#FAF7F2; border:1px solid var(--line);">${escapeHtml(c.colorName || 'Mix')}</span>` :
        (c.color && c.color !== '-' ? `<span class="badge" style="font-size:10.5px; padding:1px 6px; background:#FAF7F2; border:1px solid var(--line);">${escapeHtml(c.color)}</span>` : '')}
        </div>
        <span class="cmeta" id="cart-meta-${i}">
          ${isMix ? `Custom Mix · <strong>${c.liters}L</strong> · ${peso(c.unitPrice)}/L` :
        `${escapeHtml(c.brand || '')} · Size: <strong>${c.size || 1}L</strong> · ${peso(c.unitPrice)} each · <span class="total-liters" style="color:var(--teal); font-weight:600;">${(c.qty * (Number(c.size) || 1)).toFixed(2)} L total</span>`}
        </span>
      </div>
      <div class="cprice" id="cart-price-${i}">
        <span>${peso(c.lineTotal)}</span>
      </div>
      <div class="qty-control">
        <button type="button" onclick="changeCartQty(${i},-1)" title="Decrease quantity">−</button>
        <input type="number" min="1" step="1" id="cart-qty-input-${i}" value="${c.qty}" 
               onchange="handleCartQtyChange(${i}, this)"
               oninput="handleCartQtyInput(${i}, this)"
               onblur="handleCartQtyBlur(${i}, this)">
        <button type="button" onclick="changeCartQty(${i},1)" title="Increase quantity">+</button>
      </div>
      <button class="btn ghost small" onclick="removeCartLine(${i})" style="color:var(--danger); font-size:14px; padding:3px 6px;" title="Remove item">✕</button>
    </div>`;
  }).join('');
}

function cartTotals() {
  const subtotal = Number(cart.reduce((t, c) => t + (Number(c.lineTotal) || 0), 0).toFixed(2));
  const total = subtotal;
  return { subtotal, total };
}

function cartTotalsHtml() {
  const t = cartTotals();
  return `
  <div class="pos-payment-card">
    <div class="cart-total-row">
      <span class="muted">Subtotal</span>
      <span style="font-weight:600; font-family:'Space Grotesk',monospace;">${peso(t.subtotal)}</span>
    </div>
    <div class="cart-total-row grand">
      <span>Total Due</span>
      <span class="total-amount">${peso(t.total)}</span>
    </div>
  </div>`;
}

function renderCartTotals() {
  const cartTotalsEl = document.getElementById('cart-totals');
  if (cartTotalsEl) cartTotalsEl.innerHTML = cartTotalsHtml();
}

function updateCheckoutButtonState() {
  const btn = document.getElementById('btn-complete-sale');
  const hintEl = document.getElementById('pos-checkout-hint');
  if (!btn) return;

  const hasItems = cart.length > 0;
  const t = cartTotals();

  // Stock verification across all items
  let stockError = '';
  if (hasItems) {
    const litersByProd = {};
    const cansBySize = {};
    for (const c of cart) {
      if (c.type === 'product') {
        const p = productById(c.productId);
        if (!p || p.stock <= 0) {
          stockError = `"${c.name}" is out of stock.`;
          break;
        }
        const size = Number(c.size) || 1;
        const qty = Number(c.qty) || 0;
        litersByProd[p.id] = (litersByProd[p.id] || 0) + (qty * size);
        if (litersByProd[p.id] > p.stock) {
          stockError = `Not enough stock for "${p.name}".`;
          break;
        }
        if (productHasCanBreakdown(p)) {
          const key = `${p.id}_${size}`;
          cansBySize[key] = (cansBySize[key] || 0) + qty;
          if (cansBySize[key] > productCanCount(p, size)) {
            stockError = `Not enough ${size}L cans for "${p.name}".`;
            break;
          }
        }
      }
    }
  }

  const isStockValid = !stockError;
  const canCheckout = hasItems && isStockValid && !window._isCompletingSale;

  btn.disabled = !canCheckout;

  if (hintEl) {
    if (!hasItems) {
      hintEl.innerHTML = `<span style="opacity:0.7;">🛒 Cart is empty · Add products to continue</span>`;
    } else if (!isStockValid) {
      hintEl.innerHTML = `<span style="color:var(--danger); font-weight:600;">⚠️ ${escapeHtml(stockError)}</span>`;
    } else {
      hintEl.innerHTML = `<span style="color:var(--teal); font-weight:600;">✓ Ready to complete sale · Click to review &amp; print receipt</span>`;
    }
  }
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

    const { cashierName, items, totals } = data;

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
      const variant = p ? productSizeVariantBySize(p, size) : null;
      const sizeId = i.sizeId || (variant ? variant.sizeId : null);
      const sizeUnit = size <= 1 ? 'Can' : (size <= 4 ? 'Gallon' : 'Drum');
      const totalL = (Number(i.qty) * size).toFixed(2);
      const colorLabel = i.colorName || (i.color && i.color !== '-' ? i.color : (p && p.color && p.color !== '-' ? p.color : ''));

      return `
        <tr>
          <td>
            <div style="display:flex; align-items:center; gap:8px;">
              <span class="cm-color-dot" style="background:${hex}; width:16px; height:16px; border-radius:50%; flex-shrink:0; box-shadow:0 1px 3px rgba(0,0,0,0.2);" title="${hex}"></span>
              <div>
                <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                  <span style="font-weight:600; color:var(--ink);">${escapeHtml(i.name)} <code style="font-family:'Space Grotesk',monospace; font-size:11px; font-weight:600; color:var(--teal);">(${hex})</code></span>
                </div>
                <div class="muted small" style="font-size:11px; margin-top:2px;">
                  ${escapeHtml(i.brand || (p && p.brand) || '')}
                  ${colorLabel ? ` · Color: <b>${escapeHtml(colorLabel)}</b>` : ''}
                </div>
              </div>
            </div>
          </td>
          <td style="text-align:center;">
            <div style="display:flex; flex-direction:column; align-items:center; gap:3px;">
              <span class="badge" style="background:#F2EDE4; border:1px solid var(--line); font-size:11.5px; padding:2px 7px; font-weight:600;">
                ${fmtSize(size)} <span class="muted" style="font-size:10.5px;">(${sizeUnit})</span>
              </span>
            </div>
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
              Please review to confirm that paint products, color shades, can sizes, quantities, and totals are correct before completing the sale and printing the receipt.
            </div>
          </div>
        </div>

        <div style="background:#FAF8F5; border:1px solid var(--line); border-radius:8px; padding:10px 14px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; font-size:12.5px;">
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
          <div style="display:flex; justify-content:space-between; align-items:center; padding:7px 0; border-top:1px dashed var(--line); margin-top:4px;">
            <span style="font-size:13.5px; font-weight:700; color:var(--ink);">Total Due:</span>
            <span style="font-size:18px; font-weight:800; font-family:'Space Grotesk',monospace; color:var(--teal);">${peso(totals.total)}</span>
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

    openModal('🛒 Confirm Purchase', bodyHtml, footHtml, 'pos-confirm-modal');

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
  if (window._isCompletingSale) return;
  window._isCompletingSale = true;
  const completeBtn = document.getElementById('btn-complete-sale');
  if (completeBtn) {
    completeBtn.disabled = true;
    completeBtn.innerText = '⏳ Processing Sale…';
  }

  try {
    if (!cart.length) { showToast('Add at least one item first.', 'error'); return; }
    const t = cartTotals();
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

    // Prompt cashier to confirm if purchase is correct
    const isConfirmed = await promptCustomerPurchaseConfirmation({
      cashierName: (currentUser && currentUser.name) || 'Cashier',
      items,
      totals: t
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
      items,
      subtotal: t.subtotal,
      total: t.total,
      status: 'completed',
    };
    db.sales.push(sale);

    const saleStockChanges = [];
    items.forEach(c => {
      if (c.type === 'product') {
        const p = productById(c.productId);
        const size = Number(c.size) || 1;
        const count = Number(c.qty) || 0;
        const litersDeducted = Number((count * size).toFixed(2));
        const variant = p ? productSizeVariantBySize(p, size) : null;
        const sizeId = c.sizeId || (variant ? variant.sizeId : null);
        c.productId = p ? (p.productId || p.id) : c.productId;
        c.product_id = c.productId;
        c.sizeId = sizeId;
        c.size_id = sizeId;
        let trailNote = '';
        if (p) {
          const beforeStock = Number(p.stock) || 0;
          const beforeCans = productCanCount(p, size);
          p.stock = Math.max(0, Number((p.stock - litersDeducted).toFixed(2)));
          if (!p.canStock || typeof p.canStock !== 'object' || Array.isArray(p.canStock)) {
            p.canStock = {};
          }
          p.canStock[size] = Math.max(0, (Number(p.canStock[size]) || 0) - count);
          syncProductVariants(p);
          const afterCans = productCanCount(p, size);
          trailNote = ` · ${size}L Cans: ${beforeCans}→${afterCans}, Stock: ${formatStock(beforeStock)}L→${formatStock(p.stock)}L`;
          saleStockChanges.push({
            field: `${p.name} (${size}L)`,
            oldValue: `${beforeCans} cans (${formatStock(beforeStock)}L)`,
            newValue: `${afterCans} cans (${formatStock(p.stock)}L)`
          });
        }
        db.movements.push({
          id: uid('mv'),
          date: sale.date,
          type: 'sale',
          productId: p ? (p.productId || p.id) : (c.productId || null),
          product_id: p ? (p.productId || p.id) : (c.productId || null),
          sizeId: sizeId,
          size_id: sizeId,
          container_size: size,
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
              saleStockChanges.push({
                field: `${p.name} (Mix Ingredient)`,
                oldValue: `${formatStock(beforeStock)}L`,
                newValue: `${formatStock(p.stock)}L`
              });
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

        logAudit(
          'MIXING_COMPLETE',
          c.colorName || 'Custom Color Mix',
          `Completed ${c.liters}L "${c.colorName}" (${c.detectedColorName || 'Custom'}) color mix for POS Sale ${receiptNo} — Formula: ${formulaSummary} (${peso(c.lineTotal)})`,
          {
            entityName: c.colorName || 'Custom Color Mix',
            fieldChanged: 'Paint Color Mix Formula',
            oldValue: formulaSummary || 'Base Pigments',
            newValue: `${c.liters}L ${c.colorName} [${c.hexColor || ''}] (${peso(c.lineTotal)})`,
            referenceNo: receiptNo,
            reason: c.note || c.baseType || 'POS Custom Paint Mixing'
          }
        );
      }
    });

    const itemSummaryText = items.map(i => `${i.qty}${i.size ? '×' + i.size + 'L' : 'L'} ${i.name}${i.colorName ? ' (' + i.colorName + ')' : ''}`).join(', ');
    logAudit(
      'SALE',
      `Receipt ${receiptNo}`,
      `Completed sale ${receiptNo} — ${items.length} item(s): ${itemSummaryText} · Total: ${peso(sale.total)}`,
      {
        entityName: `Receipt ${receiptNo}`,
        fieldChanged: 'POS Sales Checkout',
        oldValue: saleStockChanges.length ? saleStockChanges.map(sc => `${sc.field}: ${sc.oldValue}`).join(' · ') : `Subtotal: ${peso(sale.subtotal)}`,
        newValue: `${peso(sale.total)} — ${items.length} item(s)`,
        referenceNo: receiptNo,
        reason: 'POS Sale Checkout',
        meta: {
          receiptNo,
          cashierName: sale.cashierName,
          subtotal: sale.subtotal,
          total: sale.total,
          changes: saleStockChanges,
          items: items.map(i => ({ name: i.name, qty: i.qty, size: i.size, unitPrice: i.unitPrice, lineTotal: i.lineTotal }))
        }
      }
    );

    logAudit(
      'RECEIPT_GENERATED',
      `Receipt ${receiptNo}`,
      `Official Receipt ${receiptNo} generated — Total: ${peso(sale.total)}`,
      {
        entityName: `Receipt ${receiptNo}`,
        fieldChanged: 'Official Sales Receipt',
        oldValue: 'Pending Checkout',
        newValue: `Receipt ${receiptNo} Issued (${peso(sale.total)})`,
        referenceNo: receiptNo,
        reason: 'Issued via POS'
      }
    );

    await saveDB();
    cart = [];
    renderApp();
    showReceipt(sale);
  } finally {
    window._isCompletingSale = false;
    const btn = document.getElementById('btn-complete-sale');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '✓ Complete &amp; Print Receipt';
    }
  }
}

function showReceipt(sale) {
  const receiptNo = getReceiptNo(sale);
  const returnedVal = typeof getSaleReturnedValue === 'function' ? getSaleReturnedValue(sale) : Number(sale.refundTotal || 0);
  const exchangeTotal = typeof getSaleExchangeTotal === 'function' ? getSaleExchangeTotal(sale) : 0;
  const refundTotal = Number(sale.refundTotal || 0);
  const netTotal = Number((sale.total - refundTotal).toFixed(2));
  const status = sale.status || 'completed';

  const itemsHtml = (sale.items || []).map(i => {
    const p = i.productId ? productById(i.productId) : null;
    const size = Number(i.size) || (i.type === 'product' ? 1 : null);
    const sizeLabel = size ? ` · ${fmtSize(size)}` : '';
    const litersText = size ? ` (${(i.qty * size).toFixed(2)} L)` : '';
    const hex = i.hexColor || (p ? getProductHex(p) : '');
    const colorLabel = i.colorName || (i.color && i.color !== '-' ? i.color : (p && p.color && p.color !== '-' ? p.color : ''));

    return `
    <tr>
      <td>
        <div style="font-weight:700; color:#1E1B18; display:flex; align-items:center; gap:6px;">
          ${hex ? `<span class="cm-color-dot" style="background:${hex}; width:12px; height:12px; border-radius:50%; display:inline-block; border:1px solid rgba(0,0,0,0.15);" title="${hex}"></span>` : ''}
          ${escapeHtml(i.name)}
          ${hex ? `<span style="font-family:'Space Grotesk',monospace; font-size:11px; font-weight:600; color:#1F6F6B;">(${hex})</span>` : ''}
        </div>
        <div style="font-size:11px; color:#6B6259; margin-top:2px;">
          <span>${escapeHtml(i.brand || (p && p.brand) || '')}${sizeLabel}${litersText}</span>
          ${colorLabel ? ` · Color: <b>${escapeHtml(colorLabel)}</b>` : ''}
        </div>
        ${i.components && i.components.length ? `
          <div style="font-size:10.5px; color:#786F66; margin-top:2px;">
            Blend Formula: ${i.components.map(cp => `${cp.percentage}% ${escapeHtml(cp.name)} (${formatStock(cp.liters)}L)`).join(', ')}
          </div>
        ` : ''}
        ${i.returnedQty ? `<div style="margin-top:2px;"><span class="badge sale-refunded" style="font-size:10px; padding:1px 6px;">${formatStock(i.returnedQty)} returned / exchanged</span></div>` : ''}
      </td>
      <td class="right num">${formatStock(i.qty)}${size ? ` (${fmtSize(size)})` : ''}</td>
      <td class="right num">${peso(i.unitPrice)}</td>
      <td class="right num" style="font-weight:700;">${peso(i.lineTotal)}</td>
    </tr>`;
  }).join('');

  const bodyHtml = `
  <div id="printable-receipt" class="pos-receipt-card">
    <div class="pos-receipt-header">
      <div class="pos-receipt-title">MRGR COLOR CENTER</div>
      <div class="pos-receipt-sub">Paint &amp; Color Formulation Specialists</div>
      <div class="pos-receipt-sub" style="font-size:11px; margin-top:2px;">Official Sales Receipt</div>
      <div class="pos-receipt-badge">Receipt #: <span>${escapeHtml(receiptNo)}</span></div>
    </div>

    <div class="pos-receipt-meta">
      <div>
        <div><span class="muted">Date &amp; Time:</span> <b>${formatDateTime(sale.date)}</b></div>
        <div style="margin-top:3px;"><span class="muted">Cashier:</span> <b>${escapeHtml(sale.cashierName)}</b></div>
      </div>
      <div class="right">
        <div><span class="muted">Transaction Status:</span> ${saleStatusBadge(status)}</div>
      </div>
    </div>

    <table class="pos-receipt-table">
      <thead>
        <tr>
          <th>Product Description</th>
          <th class="right">Qty</th>
          <th class="right">Unit Price</th>
          <th class="right">Line Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
    </table>

    <div class="pos-receipt-totals">
      <div class="pos-receipt-total-row">
        <span class="muted">Subtotal:</span>
        <span class="num">${peso(sale.subtotal)}</span>
      </div>
      <div class="pos-receipt-total-row ${(returnedVal > 0 || refundTotal > 0) ? '' : 'grand'}">
        <span>Total Due:</span>
        <span class="grand-val">${peso(sale.total)}</span>
      </div>
      ${(returnedVal > 0 || refundTotal > 0) ? `
        <div class="pos-receipt-total-row" style="color:var(--danger);"><span class="muted">Returned Credit:</span><span class="num">-${peso(returnedVal || refundTotal)}</span></div>
        ${exchangeTotal > 0 ? `<div class="pos-receipt-total-row" style="color:var(--teal);"><span class="muted">Replacement Issued:</span><span class="num">+${peso(exchangeTotal)}</span></div>` : ''}
        <div class="pos-receipt-total-row grand"><span>Net Total:</span><span class="grand-val">${peso(netTotal)}</span></div>
      ` : ''}
    </div>

    <div class="pos-receipt-footer">
      <div style="font-weight:600; color:#1E1B18;">Thank you for your purchase at MRGR Color Center!</div>
      <div style="margin-top:4px;">Please retain this official receipt for warranty and aftersales support. Returns and exchanges are valid within the same day of purchase with original receipt.</div>
    </div>
  </div>`;

  const footHtml = `
    <button type="button" class="btn secondary" onclick="printReceiptSection()">🖨️ Print Receipt</button>
    <button type="button" class="btn" onclick="closeModal()">Done</button>
  `;

  openModal('Official Sales Receipt', bodyHtml, footHtml);
}

function printReceiptSection() {
  const receiptEl = document.getElementById('printable-receipt');
  if (!receiptEl) return;
  const printWin = window.open('', '_blank', 'width=680,height=780');
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
      body { font-family: 'Inter', system-ui, -apple-system, sans-serif; font-size: 13px; color: #26211C; padding: 24px; line-height: 1.45; background: #fff; }
      .pos-receipt-card { border: none !important; box-shadow: none !important; max-width: 100% !important; padding: 0 !important; }
      .pos-receipt-header { text-align: center; border-bottom: 2px dashed #222; padding-bottom: 12px; margin-bottom: 14px; }
      .pos-receipt-title { font-size: 18px; font-weight: bold; letter-spacing: 0.02em; }
      .pos-receipt-sub { font-size: 11px; color: #555; }
      .pos-receipt-badge { display: inline-block; padding: 4px 12px; border: 1.5px solid #222; margin-top: 8px; font-weight: bold; font-family: monospace; font-size: 13px; }
      .pos-receipt-meta { display: flex; justify-content: space-between; font-size: 12px; border-bottom: 1px solid #ddd; padding-bottom: 10px; margin-bottom: 12px; }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
      th { text-align: left; font-size: 11px; text-transform: uppercase; border-bottom: 1.5px solid #222; padding: 6px 4px; }
      td { padding: 7px 4px; border-bottom: 1px solid #eee; vertical-align: top; }
      .right { text-align: right; }
      .num { font-family: monospace; font-weight: bold; }
      .pos-receipt-totals { border-top: 2px dashed #222; margin-top: 14px; padding-top: 10px; }
      .pos-receipt-total-row { display: flex; justify-content: space-between; padding: 3px 0; font-size: 12.5px; }
      .pos-receipt-total-row.grand { font-size: 15px; font-weight: bold; border-top: 1.5px solid #222; margin-top: 6px; padding-top: 6px; }
      .pos-receipt-total-row.grand .grand-val { font-size: 17px; }
      .pos-receipt-footer { text-align: center; font-size: 11px; color: #555; margin-top: 18px; border-top: 1px dashed #222; padding-top: 10px; }
      @media print {
        body { padding: 0; }
        @page { margin: 8mm; }
      }
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
