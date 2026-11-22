/* ============================================================
   10. POINT OF SALE
   ============================================================ */
let posCategoryFilter = '';
let posSearchQuery = '';
let posCurrentPage = 1;
const POS_PAGE_SIZE = 8;

function setPosPage(newPage) {
  const target = parseInt(newPage, 10);
  if (isNaN(target)) return;
  posCurrentPage = target;
  if (typeof syncRouteState === 'function') syncRouteState({ push: false });
  renderPosProductList();
}

function setPosCategoryFilter(cat) {
  posCategoryFilter = cat;
  posCurrentPage = 1;
  const pills = document.querySelectorAll('.pos-cat-pill');
  pills.forEach(p => p.classList.toggle('active', p.dataset.cat === cat));
  if (typeof syncRouteState === 'function') syncRouteState({ push: false });
  renderPosProductList();
}

function clearPosSearch() {
  posSearchQuery = '';
  const input = document.getElementById('pos-search');
  if (input) { input.value = ''; input.focus(); }
  posCurrentPage = 1;
  if (typeof syncRouteState === 'function') syncRouteState({ push: false });
  renderPosProductList();
}

function onPosCustomerNameInput(val) {
  currentSaleCustomerName = typeof val === 'string' ? val : '';
  if (typeof scheduleRouteStateSync === 'function') scheduleRouteStateSync();
}

function clearPosCart() {
  if (!cart.length) return;
  if (!confirm('Are you sure you want to clear all items from Current Sale?')) return;
  cart = [];
  currentSaleCustomerName = '';
  const custInp = document.getElementById('pos-customer-name');
  if (custInp) custInp.value = '';
  refreshCartUI();
  showToast('Current Sale cart has been cleared.', 'info');
}

let posBatchStatusBySize = {};
let posBatchStatusLoadedAt = 0;
let posBatchStatusAttempted = false;
let posBatchStatusPromise = null;
async function posLoadBatchStatus(force = false) {
  if (!force && Date.now() - posBatchStatusLoadedAt < 10000) return;
  if (!force && posBatchStatusPromise) return posBatchStatusPromise;

  posBatchStatusPromise = (async () => {
    try {
      const res = await fetch('api/batches.php?action=pos_status', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data && data.success && data.bySize) {
          posBatchStatusBySize = data.bySize;
          posBatchStatusLoadedAt = Date.now();
        }
      }
    } catch (e) { /* offline / fallback to server-side check */ }
    finally {
      posBatchStatusAttempted = true;
      posBatchStatusPromise = null;
      if (typeof currentPage !== 'undefined' && currentPage === 'pos' && document.getElementById('pos-product-list')) {
        renderPosProductList();
      }
    }
  })();

  return posBatchStatusPromise;
}

function posGetSizeBatchInfo(p, size) {
  const variant = p ? productSizeVariantBySize(p, size) : null;
  const sizeId = variant ? variant.sizeId : null;
  const batchInfo = (sizeId && posBatchStatusBySize && posBatchStatusBySize[sizeId]) ? posBatchStatusBySize[sizeId] : null;
  const origPrice = variant ? Number(variant.pricePerCan.toFixed(2)) : Number(((p ? p.price : 0) * size).toFixed(2));

  if (!batchInfo) {
    const fallbackQty = p ? (productHasCanBreakdown(p) ? productCanCount(p, size) : Math.floor((p.stock || 0) / size)) : 0;
    return {
      sizeId,
      batchInfo: null,
      nonExpiredQty: fallbackQty,
      expiredQty: 0,
      discountedQty: 0,
      regularQty: fallbackQty,
      bestDiscountPct: 0,
      bestDiscountAmount: 0,
      bestOriginalPrice: origPrice,
      bestDiscountedPrice: origPrice,
      discountedBatches: [],
      regularBatches: [],
      bestRegularBatchId: null,
      bestRegularBatchNumber: null,
      bestRegularExpiryDate: null,
      bestRegularDaysRemaining: null,
      bestRegularQty: fallbackQty
    };
  }

  const nonExpiredQty = Number(batchInfo.nonExpiredQty) || 0;
  const expiredQty = Number(batchInfo.expiredQty) || 0;
  const discountedQty = Number(batchInfo.discountedQty) || 0;
  const regularQty = batchInfo.regularQty !== undefined ? (Number(batchInfo.regularQty) || 0) : Math.max(0, nonExpiredQty - discountedQty);
  const bestDiscountPct = (discountedQty > 0 && Number(batchInfo.bestDiscountPct || batchInfo.fifoDiscountPct) > 0)
    ? Number(batchInfo.bestDiscountPct || batchInfo.fifoDiscountPct)
    : 0;
  const bestDiscountAmount = bestDiscountPct > 0
    ? Number((origPrice * (bestDiscountPct / 100)).toFixed(2))
    : 0;
  const bestDiscountedPrice = bestDiscountPct > 0
    ? Number(Math.max(0, origPrice - bestDiscountAmount).toFixed(2))
    : origPrice;

  return {
    sizeId,
    batchInfo,
    nonExpiredQty,
    expiredQty,
    discountedQty,
    regularQty,
    bestDiscountPct,
    bestDiscountAmount,
    bestOriginalPrice: origPrice,
    bestDiscountedPrice,
    bestDiscountBatchId: batchInfo.bestDiscountBatchId || batchInfo.fifoBatchId || null,
    bestDiscountBatchNumber: batchInfo.bestDiscountBatchNumber || batchInfo.fifoBatchNumber || null,
    bestDiscountExpiryDate: batchInfo.bestDiscountExpiryDate || null,
    bestDiscountDaysRemaining: batchInfo.bestDiscountDaysRemaining !== undefined ? batchInfo.bestDiscountDaysRemaining : batchInfo.fifoDaysRemaining,
    bestDiscountStatus: batchInfo.fifoExpiryStatus || null,
    discountedBatches: Array.isArray(batchInfo.discountedBatches) ? batchInfo.discountedBatches : [],
    regularBatches: Array.isArray(batchInfo.regularBatches) ? batchInfo.regularBatches : [],
    bestRegularBatchId: batchInfo.bestRegularBatchId || null,
    bestRegularBatchNumber: batchInfo.bestRegularBatchNumber || null,
    bestRegularExpiryDate: batchInfo.bestRegularExpiryDate || null,
    bestRegularDaysRemaining: batchInfo.bestRegularDaysRemaining !== undefined ? batchInfo.bestRegularDaysRemaining : null,
    bestRegularQty: Number(batchInfo.bestRegularQty) || 0
  };
}

function posGetProductDiscountSummary(p) {
  if (!p) return { hasDiscount: false, maxPct: 0, totalDiscountedQty: 0, discountedSizes: [] };
  const sizes = productSizes(p) || [];
  const discountedSizes = [];
  let maxPct = 0;
  let totalDiscountedQty = 0;

  sizes.forEach(s => {
    const info = posGetSizeBatchInfo(p, s);
    if (info.discountedQty > 0 && info.bestDiscountPct > 0) {
      maxPct = Math.max(maxPct, info.bestDiscountPct);
      totalDiscountedQty += info.discountedQty;
      discountedSizes.push({
        size: s,
        discountedQty: info.discountedQty,
        regularQty: info.regularQty,
        pct: info.bestDiscountPct,
        origPrice: info.bestOriginalPrice,
        discPrice: info.bestDiscountedPrice,
        savedAmt: info.bestDiscountAmount
      });
    }
  });

  return {
    hasDiscount: discountedSizes.length > 0,
    maxPct,
    totalDiscountedQty,
    discountedSizes
  };
}

function posGetCartSizeUsage(p, sizeId, size, excludeIndex = -1) {
  let discQty = 0;
  let regQty = 0;
  const byBatch = {};
  cart.forEach((c, idx) => {
    if (idx === excludeIndex || c.type !== 'product') return;
    const sameProd = p && (c.productId === p.id || c.productId === p.productId);
    if (!sameProd) return;
    const sameSize = sizeId && c.sizeId ? c.sizeId === sizeId : (Number(c.size) || 1) === size;
    if (!sameSize) return;
    const q = Number(c.qty) || 0;
    if (c.isNearExpiryDiscount || Number(c.nearExpiryDiscountPct) > 0) {
      discQty += q;
    } else {
      regQty += q;
    }
    const bid = c.selectedBatchId || c.nearExpiryBatchId || c.regularBatchId || null;
    if (bid) {
      byBatch[bid] = (byBatch[bid] || 0) + q;
    }
  });
  return { discQty, regQty, totalQty: discQty + regQty, byBatch };
}

function posPage() {
  posLoadBatchStatus(false);
  const categories = (typeof getProductCategories === 'function')
    ? getProductCategories()
    : ['Automotive Paint', 'House Paint', 'Specialty Paint'];
  const cartItemCount = cart.reduce((sum, item) => sum + (item.qty || 1), 0);
  const totalActive = activeProducts().length;

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
            🎨 Select Mixed Color
          </button>
        </div>
        <div class="panel-body" style="padding-bottom:10px;">
          <!-- Search Box with Clear Button -->
          <div class="pos-search-wrap">
            <span class="pos-search-icon">🔍</span>
            <input id="pos-search" type="text" class="pos-search-input" placeholder="Search by paint name, brand, color, or size…" value="${escapeHtml(posSearchQuery)}" oninput="posCurrentPage=1; renderPosProductList()">
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
            ${typeof getPosVatBadgeHtml === 'function' ? getPosVatBadgeHtml() : ''}
            ${(currentUser && currentUser.role === 'admin') ? `
              <button type="button" class="btn ghost small" style="padding:2px 8px; font-size:11px;" onclick="openVatSettingsModal()" title="Manage Philippine VAT Settings">
                ⚙️ VAT Settings
              </button>
            ` : ''}
            ${cart.length ? `<button type="button" class="btn ghost small" style="padding:2px 8px; font-size:11px; color:var(--danger);" onclick="clearPosCart()" title="Empty cart">🗑️ Clear</button>` : ''}
            <span class="badge ${cart.length ? 'ok' : 'mid'}" id="cart-count-badge" style="font-size:11.5px; padding:3px 10px;">
              ${cart.length ? `🛒 ${cart.length} item${cart.length === 1 ? '' : 's'} (${cartItemCount} qty)` : 'Cart Empty'}
            </span>
          </div>
        </div>
        <div class="panel-body">
          <div id="cart-lines">${cartLinesHtml()}</div>

          <div class="pos-customer-field">
            <label for="pos-customer-name" class="pos-customer-label">
              <span>Customer Name (Optional)</span>
            </label>
            <input type="text" id="pos-customer-name" class="pos-customer-input" maxlength="150"
              placeholder="Enter customer name (optional)"
              value="${escapeHtml(currentSaleCustomerName)}"
              oninput="onPosCustomerNameInput(this.value)"
              autocomplete="off">
          </div>

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

function renderPosProductPriceHtml(p) {
  const discSum = posGetProductDiscountSummary(p);
  const primaryDisc = discSum.hasDiscount ? discSum.discountedSizes[0] : null;
  return `
    <span class="price-val">${peso(p.price)}</span>
    <span class="price-unit">/ Liter</span>
    ${primaryDisc ? `
      <div class="pos-pprice-disc" title="Near-Expiry Discount on ${fmtSize(primaryDisc.size)} (${primaryDisc.discountedQty} eligible)">
        <div class="pos-pprice-disc-line">
          <del>${peso(primaryDisc.origPrice)}</del>
          <strong>${peso(primaryDisc.discPrice)}</strong>
        </div>
        <span class="pos-disc-save">Save ${peso(primaryDisc.savedAmt)}/${fmtSize(primaryDisc.size)}</span>
      </div>
    ` : ''}`;
}

function renderPosProductList() {
  const container = document.getElementById('pos-product-list');
  const pagContainer = document.getElementById('pos-pagination');
  if (!container) return;

  if (!posBatchStatusAttempted && posBatchStatusLoadedAt === 0 && posBatchStatusPromise) {
    container.innerHTML = '<div class="muted small" style="padding:24px 16px; text-align:center;">Loading product catalog…</div>';
    return;
  }

  const searchInput = document.getElementById('pos-search');
  if (searchInput) posSearchQuery = searchInput.value;
  const q = (posSearchQuery || '').toLowerCase().trim();
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
    const isOut = typeof isProductOutOfStock === 'function' ? isProductOutOfStock(p) : ((Number(p.stock) || 0) <= 0);
    const resolvedCol = (typeof resolveProductColor === 'function') ? resolveProductColor(p) : { name: p.color || '-', hex: getProductDefaultColor(p), isLinked: false };
    const hex = resolvedCol.hex || getProductDefaultColor(p);
    const rgb = hexToRgb(hex);
    const rgbaBg = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.12)`;
    const rgbaGlow = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.35)`;
    const detected = detectMixedColorName(rgb.r, rgb.g, rgb.b);
    const colorLabel = resolvedCol.isLinked
      ? resolvedCol.name
      : (p.color && p.color !== '-' ? p.color : detected.name);
    const colorTone = (typeof resolveProductColorTone === 'function')
      ? resolveProductColorTone(p, resolvedCol)
      : (detected.family || 'General');

    const discSum = posGetProductDiscountSummary(p);
    const primaryDisc = discSum.hasDiscount ? discSum.discountedSizes[0] : null;
    const discSizeLabel = discSum.hasDiscount
      ? (discSum.discountedSizes.length === 1
        ? `${fmtSize(primaryDisc.size)}: ${primaryDisc.pct}% OFF`
        : discSum.discountedSizes.map(d => `${fmtSize(d.size)} (${d.pct}% OFF)`).join(', '))
      : '';
    const discBadgeHtml = discSum.hasDiscount
      ? `<span class="pos-disc-badge" title="${escapeAttr('Near-Expiry Discount available: ' + discSum.discountedSizes.map(d => `${fmtSize(d.size)} (${d.discountedQty} unit${d.discountedQty === 1 ? '' : 's'} at ${d.pct}% OFF)`).join(', '))}">🏷️ ${discSizeLabel} · ${discSum.totalDiscountedQty} Near-Expiry</span>`
      : '';

    return `
    <div class="pos-product ${isOut ? 'out-of-stock-row' : ''}" 
         style="--prod-color: ${hex}; --prod-color-alpha: ${rgbaBg}; --prod-color-glow: ${rgbaGlow};"
         title="${escapeHtml(p.name)} [${colorLabel}] · Brand: ${escapeHtml(p.brand || '')}">
      <div class="pos-swatch-box" style="background-color:${hex};" title="Color: ${escapeHtml(colorLabel)} (${hex})"></div>
      <div class="pinfo">
        <div class="pname">
          <span>${escapeHtml(p.name)}</span>
          <span class="pos-color-badge" title="Color: ${escapeHtml(colorLabel)} (${escapeHtml(colorTone)} tone)">
            <span class="cm-color-dot" style="background:${hex}; width:8px; height:8px; border-radius:50%; display:inline-block;"></span>
            <span>${escapeHtml(colorLabel)}</span>
            <code class="pos-hex-code">(${hex})</code>
          </span>
          ${discBadgeHtml}
        </div>
        <div class="pmeta">
          <span style="font-weight:600; color:var(--ink);">${escapeHtml(p.brand || '')}</span>
          <span class="muted" style="font-size:11px;">· Tone: <b>${escapeHtml(colorTone)}</b></span>
        </div>
      </div>
      <div class="pprice" id="pos-pprice-${escapeAttr(p.id)}">
        ${renderPosProductPriceHtml(p)}
      </div>
      <div class="pos-size-picker" id="pos-size-picker-${escapeAttr(p.id)}">
        ${renderPosProductSizes(p)}
        <span class="pos-size-hint">${isOut ? 'Currently unavailable' : (discSum.hasDiscount ? 'Click size to select discounted or regular batch' : 'Click size to add to cart')}</span>
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

const posExpandedSizeProducts = new Set();
const posSelectedSizeByProduct = {};

function posGetSizeGroup(size) {
  const s = Number(size) || 0;
  if (s <= 3) return { key: 'small', label: 'Small', range: '1L–3L' };
  if (s <= 8) return { key: 'medium', label: 'Medium', range: '4L–8L' };
  return { key: 'large', label: 'Large', range: '16L+' };
}

function posGetSizeCardData(p, s) {
  const variant = productSizeVariantBySize(p, s);
  const hasBreakdown = productHasCanBreakdown(p);
  const canCount = productCanCount(p, s);
  const bInfo = posGetSizeBatchInfo(p, s);
  const rawInStock = hasBreakdown ? (canCount > 0 && p.stock >= s) : (p.stock >= s);
  const inStock = rawInStock && (!bInfo.batchInfo || bInfo.nonExpiredQty > 0);
  const displayCount = bInfo.batchInfo ? bInfo.nonExpiredQty : (hasBreakdown ? canCount : Math.floor((p.stock || 0) / s));
  const isExpiredOnly = rawInStock && bInfo.batchInfo && bInfo.nonExpiredQty <= 0 && bInfo.expiredQty > 0;
  const hasDisc = inStock && bInfo.discountedQty > 0 && bInfo.bestDiscountPct > 0;
  const canPrice = variant ? Number(variant.pricePerCan.toFixed(2)) : Number(((p.price || 0) * s).toFixed(2));
  return {
    variant,
    bInfo,
    inStock,
    displayCount,
    isExpiredOnly,
    hasDisc,
    canPrice
  };
}

function renderPosSizeCard(p, s) {
  const d = posGetSizeCardData(p, s);
  const { bInfo, inStock, displayCount, isExpiredOnly, hasDisc, canPrice } = d;
  const isSelected = inStock && posSelectedSizeByProduct[p.id] === s;

  const stockText = isExpiredOnly
    ? `Expired (${bInfo.expiredQty})`
    : (!inStock
      ? 'Out of Stock'
      : (hasDisc && bInfo.regularQty > 0
        ? `${bInfo.discountedQty} discounted · ${bInfo.regularQty} regular`
        : (hasDisc ? `${bInfo.discountedQty} near-expiry` : `${displayCount} in stock`)));

  const priceHtml = hasDisc
    ? `<del>${peso(canPrice)}</del> <strong>${peso(bInfo.bestDiscountedPrice)}</strong>`
    : `<strong>${peso(canPrice)}</strong>`;

  const titleText = !inStock
    ? (isExpiredOnly
      ? `Blocked: ${bInfo.expiredQty} expired unit(s) in ${fmtSize(s)}`
      : `Out of stock for ${fmtSize(s)} (0 available)`)
    : (hasDisc
      ? `Select ${fmtSize(s)} — ${peso(bInfo.bestDiscountedPrice)} (was ${peso(canPrice)}, -${bInfo.bestDiscountPct}% on ${bInfo.discountedQty} unit${bInfo.discountedQty === 1 ? '' : 's'}${bInfo.regularQty > 0 ? `, ${bInfo.regularQty} regular` : ''})`
      : `Select ${fmtSize(s)} — ${peso(canPrice)} (${displayCount} available)`);

  return `
    <button type="button"
            class="pos-size-card ${inStock ? 'in-stock' : 'disabled out-of-stock'} ${hasDisc ? 'has-discount' : ''} ${isSelected ? 'is-selected' : ''}"
            data-size="${s}"
            ${!inStock ? 'disabled' : ''}
            title="${escapeAttr(titleText)}"
            onclick="selectPosContainerSize('${escapeAttr(p.id)}', ${s})">
      <div class="psc-top">
        <span class="psc-size">${fmtSize(s)}</span>
        ${hasDisc ? `<span class="psc-disc-badge">-${bInfo.bestDiscountPct}%</span>` : (!inStock ? `<span class="psc-out-pill">${isExpiredOnly ? 'Expired' : 'Out'}</span>` : '')}
      </div>
      <div class="psc-price">${priceHtml}</div>
      <div class="psc-stock">${stockText}</div>
    </button>`;
}

/**
 * Renders an expandable container size selector for a product row in POS Product Catalog.
 * - Displays the first 4 available sizes by default as consistent container size cards.
 * - Provides a "View All Sizes" / "Show Less" toggle when >4 sizes exist.
 * - Organizes expanded sizes into Small (1L-3L), Medium (4L-8L), and Large (16L+) groups,
 *   showing only groups and sizes that actually exist for the product.
 */
function renderPosProductSizes(p) {
  const allSizes = productSizes(p);
  if (!allSizes.length) {
    return '<div class="muted small">No container sizes configured</div>';
  }

  const MAX_VISIBLE_SIZES = 4;
  const hasMore = allSizes.length > MAX_VISIBLE_SIZES;
  const isExpanded = hasMore && posExpandedSizeProducts.has(p.id);
  const remainingCount = allSizes.length - MAX_VISIBLE_SIZES;

  let bodyHtml = '';
  if (!isExpanded) {
    const visibleSizes = allSizes.slice(0, MAX_VISIBLE_SIZES);
    bodyHtml = `
      <div class="pos-size-cards-grid">
        ${visibleSizes.map(s => renderPosSizeCard(p, s)).join('')}
      </div>`;
  } else {
    const groupOrder = [
      { key: 'small', label: 'Small', range: '1L–3L', sizes: [] },
      { key: 'medium', label: 'Medium', range: '4L–8L', sizes: [] },
      { key: 'large', label: 'Large', range: '16L+', sizes: [] }
    ];
    const groupMap = { small: groupOrder[0], medium: groupOrder[1], large: groupOrder[2] };
    allSizes.forEach(s => {
      const g = posGetSizeGroup(s);
      groupMap[g.key].sizes.push(s);
    });
    const activeGroups = groupOrder.filter(g => g.sizes.length > 0);
    bodyHtml = `
      <div class="pos-size-groups">
        ${activeGroups.map(g => `
          <div class="pos-size-group">
            <div class="pos-size-group-head">
              <span class="pos-size-group-title">${g.label}</span>
              <span class="pos-size-group-range">${g.range}</span>
              <span class="pos-size-group-count">${g.sizes.length}</span>
            </div>
            <div class="pos-size-cards-grid">
              ${g.sizes.map(s => renderPosSizeCard(p, s)).join('')}
            </div>
          </div>
        `).join('')}
      </div>`;
  }

  const toggleHtml = hasMore ? `
    <div class="pos-size-toggle-row">
      <button type="button"
              class="pos-size-toggle-btn ${isExpanded ? 'is-expanded' : ''}"
              aria-expanded="${isExpanded ? 'true' : 'false'}"
              onclick="togglePosProductSizes('${escapeAttr(p.id)}')"
              title="${isExpanded ? 'Collapse size list' : `Show all ${allSizes.length} container sizes`}">
        <span>${isExpanded ? 'Show Less' : `View All Sizes (+${remainingCount})`}</span>
        <span class="pos-size-toggle-caret">${isExpanded ? '▴' : '▾'}</span>
      </button>
    </div>` : '';

  return `<div class="pos-size-selector-inner">${bodyHtml}${toggleHtml}</div>`;
}

function togglePosProductSizes(productId) {
  const p = productById(productId);
  if (!p) return;
  if (posExpandedSizeProducts.has(p.id)) {
    posExpandedSizeProducts.delete(p.id);
  } else {
    posExpandedSizeProducts.add(p.id);
  }
  const pickerEl = document.getElementById(`pos-size-picker-${p.id}`);
  if (pickerEl) {
    const isOut = typeof isProductOutOfStock === 'function' ? isProductOutOfStock(p) : ((Number(p.stock) || 0) <= 0);
    const discSum = posGetProductDiscountSummary(p);
    pickerEl.innerHTML = `
      ${renderPosProductSizes(p)}
      <span class="pos-size-hint">${isOut ? 'Currently unavailable' : (discSum.hasDiscount ? 'Click size to select discounted or regular batch' : 'Click size to add to cart')}</span>`;
  } else {
    renderPosProductList();
  }
}

function selectPosContainerSize(productId, size) {
  const p = productById(productId);
  if (!p) return;
  const d = posGetSizeCardData(p, size);
  if (!d.inStock) return;

  posSelectedSizeByProduct[p.id] = size;

  const pickerEl = document.getElementById(`pos-size-picker-${p.id}`);
  if (pickerEl) {
    pickerEl.querySelectorAll('.pos-size-card').forEach(card => {
      card.classList.toggle('is-selected', Number(card.getAttribute('data-size')) === Number(size));
    });
  }

  addSizeToCart(p.id, size);
}

function getCartReservedLitersForProduct(prod, excludeIndex = -1) {
  if (!prod) return { sealed: 0, mix: 0, total: 0 };
  const matchesProd = (pid) => pid && (pid === prod.id || pid === prod.productId);
  let sealed = 0;
  let mix = 0;
  cart.forEach((c, idx) => {
    if (idx === excludeIndex) return;
    if (c.type === 'product' && matchesProd(c.productId)) {
      sealed += (Number(c.qty) || 0) * (Number(c.size) || 1);
    } else if (c.type === 'colormix' && Array.isArray(c.components)) {
      c.components.forEach(comp => {
        if (matchesProd(comp.productId)) {
          mix += Number(comp.liters) || 0;
        }
      });
    }
  });
  return { sealed: Number(sealed.toFixed(2)), mix: Number(mix.toFixed(2)), total: Number((sealed + mix).toFixed(2)) };
}

function addSizeToCart(productId, size = 1) {
  const p = productById(productId);
  if (!p || p.stock <= 0) { showToast('This product is out of stock.', 'error'); return; }

  const bInfo = posGetSizeBatchInfo(p, size);
  const sizeId = bInfo.sizeId;
  const usage = posGetCartSizeUsage(p, sizeId, size);

  // Check available stock in liters across all product & colormix lines in cart
  const reserved = getCartReservedLitersForProduct(p);
  const totalAvail = typeof productMixAvailableStock === 'function' ? productMixAvailableStock(p) : p.stock;
  const availForSealed = Math.min(p.stock - reserved.sealed, totalAvail - reserved.total);

  if (size > availForSealed + 1e-6) {
    showToast(`Not enough stock — only ${formatLiters(Math.max(0, availForSealed))} available.`, 'error');
    return;
  }

  if (productHasCanBreakdown(p)) {
    const availableCans = productCanCount(p, size);
    if (usage.totalQty + 1 > availableCans) {
      showToast(`Only ${availableCans} in stock for ${fmtSize(size)} (${usage.totalQty} already in cart).`, 'error');
      return;
    }
  }

  const nextTotalQty = usage.totalQty + 1;
  if (bInfo.batchInfo && bInfo.nonExpiredQty < nextTotalQty) {
    if (bInfo.expiredQty > 0 && bInfo.nonExpiredQty <= 0) {
      showToast(`Sale blocked: Remaining ${fmtSize(size)} stock for "${p.name}" is expired and cannot be sold.`, 'error');
    } else {
      showToast(`Only ${bInfo.nonExpiredQty} non-expired ${fmtSize(size)} unit(s) available for "${p.name}".`, 'error');
    }
    return;
  }

  const remainingDiscQty = Math.max(0, bInfo.discountedQty - usage.discQty);
  if (remainingDiscQty > 0 && bInfo.bestDiscountPct > 0) {
    openPosDiscountSizeModal(p.id, size);
    return;
  }

  addPosSizeBatchToCart(p.id, size, false, 1);
}

function posFmtBatchExpiry(expDate, daysRemaining) {
  if (!expDate) return { expStr: 'No Expiration', daysStr: 'No expiration limit' };
  const expStr = typeof expFmtDate === 'function' ? expFmtDate(expDate) : expDate;
  let daysStr = '';
  if (daysRemaining !== null && daysRemaining !== undefined) {
    const d = Number(daysRemaining);
    daysStr = d === 0 ? 'Expires today' : (d === 1 ? '1 day left' : `${d} days left`);
  }
  return { expStr, daysStr };
}

function posIsRegularLongerShelfLife(regBatch, discBatch) {
  if (!regBatch) return false;
  if (!discBatch || !discBatch.expirationDate) return false;
  if (!regBatch.expirationDate) return true; // No expiry is strictly longer than a dated near-expiry batch
  return String(regBatch.expirationDate) > String(discBatch.expirationDate);
}

let posOptionModalState = null;

function openPosDiscountSizeModal(productId, size) {
  const p = productById(productId);
  if (!p) return;
  const bInfo = posGetSizeBatchInfo(p, size);
  const usage = posGetCartSizeUsage(p, bInfo.sizeId, size);
  const maxCans = productHasCanBreakdown(p) ? productCanCount(p, size) : Math.floor((p.stock || 0) / size);
  const nonExpAvail = bInfo.batchInfo ? bInfo.nonExpiredQty : maxCans;
  const totalRemaining = Math.max(0, Math.min(maxCans, nonExpAvail) - usage.totalQty);

  const discBatches = (bInfo.discountedBatches || []).map(b => {
    const used = usage.byBatch[b.batchId] || 0;
    return { ...b, availQty: Math.max(0, (Number(b.remainingQty) || 0) - used) };
  }).filter(b => b.availQty > 0);

  const regBatches = (bInfo.regularBatches || []).map(b => {
    const used = usage.byBatch[b.batchId] || 0;
    return { ...b, availQty: Math.max(0, (Number(b.remainingQty) || 0) - used) };
  }).filter(b => b.availQty > 0);

  const remainingDiscQty = Math.min(totalRemaining, discBatches.reduce((s, b) => s + b.availQty, 0) || Math.max(0, bInfo.discountedQty - usage.discQty));
  const remainingRegQty = Math.min(totalRemaining, regBatches.reduce((s, b) => s + b.availQty, 0) || Math.max(0, bInfo.regularQty - usage.regQty));

  const primaryDiscBatch = discBatches[0] || (bInfo.bestDiscountBatchId ? {
    batchId: bInfo.bestDiscountBatchId,
    batchNumber: bInfo.bestDiscountBatchNumber,
    availQty: remainingDiscQty,
    expirationDate: bInfo.bestDiscountExpiryDate,
    daysRemaining: bInfo.bestDiscountDaysRemaining,
    discountPct: bInfo.bestDiscountPct,
    discountAmount: bInfo.bestDiscountAmount,
    discountedPrice: bInfo.bestDiscountedPrice,
    originalPrice: bInfo.bestOriginalPrice
  } : null);

  const primaryRegBatch = regBatches[0] || (bInfo.bestRegularBatchId ? {
    batchId: bInfo.bestRegularBatchId,
    batchNumber: bInfo.bestRegularBatchNumber,
    availQty: remainingRegQty,
    expirationDate: bInfo.bestRegularExpiryDate,
    daysRemaining: bInfo.bestRegularDaysRemaining,
    originalPrice: bInfo.bestOriginalPrice
  } : null);

  const defaultChosen = remainingDiscQty > 0 ? 'disc' : (remainingRegQty > 0 ? 'reg' : null);

  posOptionModalState = {
    productId: p.id,
    size: Number(size),
    discBatches,
    regBatches,
    primaryDiscBatch,
    selectedDiscBatchId: primaryDiscBatch ? primaryDiscBatch.batchId : null,
    selectedRegBatchId: primaryRegBatch ? primaryRegBatch.batchId : null
  };

  const discExp = primaryDiscBatch ? posFmtBatchExpiry(primaryDiscBatch.expirationDate, primaryDiscBatch.daysRemaining) : { expStr: '—', daysStr: '' };
  const regExp = primaryRegBatch ? posFmtBatchExpiry(primaryRegBatch.expirationDate, primaryRegBatch.daysRemaining) : { expStr: '—', daysStr: '' };
  const hasLongerShelf = posIsRegularLongerShelfLife(primaryRegBatch, primaryDiscBatch);

  let availabilityNoticeHtml = '';
  if (remainingDiscQty > 0 && remainingRegQty <= 0) {
    availabilityNoticeHtml = `<div class="pos-option-notice is-info">ℹ️ Only <strong>Discounted Near-Expiry</strong> stock is currently available for ${fmtSize(size)}.</div>`;
  } else if (remainingRegQty > 0 && remainingDiscQty <= 0) {
    availabilityNoticeHtml = `<div class="pos-option-notice is-info">ℹ️ Only <strong>Regular Stock</strong> is currently available for ${fmtSize(size)}.</div>`;
  }

  const discSelectHtml = discBatches.length > 1 ? `
    <div class="pos-batch-select-row">
      <label class="pos-batch-select-label" for="pos-disc-batch-select">Batch:</label>
      <select id="pos-disc-batch-select" class="pos-batch-select" onchange="onPosOptionBatchChange('disc', this.value)">
        ${discBatches.map(b => {
    const ex = posFmtBatchExpiry(b.expirationDate, b.daysRemaining);
    return `<option value="${escapeAttr(b.batchId)}">${escapeHtml(b.batchNumber)} (${b.availQty} avail · Exp: ${escapeHtml(ex.expStr)})</option>`;
  }).join('')}
      </select>
    </div>` : '';

  const regSelectHtml = regBatches.length > 1 ? `
    <div class="pos-batch-select-row">
      <label class="pos-batch-select-label" for="pos-reg-batch-select">Batch (FIFO/FEFO):</label>
      <select id="pos-reg-batch-select" class="pos-batch-select" onchange="onPosOptionBatchChange('reg', this.value)">
        ${regBatches.map(b => {
    const ex = posFmtBatchExpiry(b.expirationDate, b.daysRemaining);
    return `<option value="${escapeAttr(b.batchId)}">${escapeHtml(b.batchNumber)} (${b.availQty} avail · Exp: ${escapeHtml(ex.expStr)})</option>`;
  }).join('')}
      </select>
    </div>` : '';

  const discBatchAvail = primaryDiscBatch ? Math.min(remainingDiscQty, primaryDiscBatch.availQty) : remainingDiscQty;
  const regBatchAvail = primaryRegBatch ? Math.min(remainingRegQty, primaryRegBatch.availQty) : remainingRegQty;

  const body = `
    <div class="pos-option-modal-intro">
      <div class="pos-option-prod-title">${escapeHtml(p.name)} — ${fmtSize(size)}</div>
      <div class="muted small">Compare pricing and expiration dates to choose the best option for the customer.</div>
    </div>
    ${availabilityNoticeHtml}
    <div class="pos-disc-modal-grid">
      <div id="pos-opt-card-disc"
           class="pos-disc-option-card is-discounted ${defaultChosen === 'disc' ? 'is-chosen' : ''} ${remainingDiscQty <= 0 ? 'is-unavailable' : ''}"
           onclick="selectPosOptionCard('disc')">
        <div class="pos-disc-option-head">
          <div class="pos-opt-badges">
            <span id="pos-disc-pct-badge" class="badge" style="background:#059669; color:#fff; font-weight:700;">🏷️ ${bInfo.bestDiscountPct}% OFF</span>
            <span class="pos-near-expiry-pill">Near Expiry</span>
          </div>
          <span id="pos-disc-avail-label" class="pos-opt-qty-badge is-disc">${discBatchAvail} available</span>
        </div>
        <div id="pos-disc-price-wrap" class="pos-disc-option-price">
          <del>${peso(bInfo.bestOriginalPrice)}</del>
          <strong>${peso(bInfo.bestDiscountedPrice)}</strong>
          <span class="pos-disc-save">Save ${peso(bInfo.bestDiscountAmount)} / unit</span>
        </div>
        <p class="pos-opt-desc">Save money with this discounted product. Please check the expiration date before purchasing.</p>
        ${discSelectHtml}
        <div class="pos-opt-batch-meta" id="pos-disc-batch-meta">
          ${primaryDiscBatch ? `
            <div><span>Batch:</span> <code>${escapeHtml(primaryDiscBatch.batchNumber || '—')}</code></div>
            <div><span>Expiration Date:</span> <strong>${escapeHtml(discExp.expStr)}</strong>${discExp.daysStr ? ` <span class="pos-opt-days is-warn">(${escapeHtml(discExp.daysStr)})</span>` : ''}</div>
          ` : '<div class="muted small">No discounted near-expiry batch available.</div>'}
        </div>
        <div class="pos-disc-option-actions" onclick="event.stopPropagation()">
          <button id="pos-disc-submit-btn" type="button" class="btn small" style="background:#059669; color:#fff; flex:1;" ${remainingDiscQty <= 0 ? 'disabled' : ''} onclick="submitPosDiscountSelection('${escapeAttr(p.id)}', ${Number(size)}, true)">
            ${remainingDiscQty > 0 ? `✓ Select ${bInfo.bestDiscountPct}% OFF` : 'Unavailable'}
          </button>
        </div>
      </div>

      <div id="pos-opt-card-reg"
           class="pos-disc-option-card is-regular ${defaultChosen === 'reg' ? 'is-chosen' : ''} ${remainingRegQty <= 0 ? 'is-unavailable' : ''}"
           onclick="selectPosOptionCard('reg')">
        <div class="pos-disc-option-head">
          <div class="pos-opt-badges">
            <span class="badge ghost" style="font-weight:700;">📦 Regular Stock</span>
            ${hasLongerShelf && remainingRegQty > 0 ? '<span class="pos-longer-shelf-pill" id="pos-reg-shelf-pill">✨ Longer Shelf Life</span>' : '<span class="pos-longer-shelf-pill" id="pos-reg-shelf-pill" style="display:none;">✨ Longer Shelf Life</span>'}
          </div>
          <span id="pos-reg-avail-label" class="pos-opt-qty-badge is-reg">${regBatchAvail} available</span>
        </div>
        <div class="pos-disc-option-price">
          <strong style="color:var(--ink);">${peso(bInfo.bestOriginalPrice)}</strong>
          <span class="muted small">/ unit</span>
        </div>
        <p class="pos-opt-desc">Regular-priced product with a longer remaining shelf life.</p>
        ${regSelectHtml}
        <div class="pos-opt-batch-meta" id="pos-reg-batch-meta">
          ${primaryRegBatch ? `
            <div><span>Batch:</span> <code>${escapeHtml(primaryRegBatch.batchNumber || '—')}</code></div>
            <div><span>Expiration Date:</span> <strong>${escapeHtml(regExp.expStr)}</strong>${regExp.daysStr ? ` <span class="pos-opt-days">(${escapeHtml(regExp.daysStr)})</span>` : ''}</div>
          ` : '<div class="muted small">No regular batch available.</div>'}
        </div>
        <div class="pos-disc-option-actions" onclick="event.stopPropagation()">
          <button type="button" class="btn secondary small" style="flex:1;" ${remainingRegQty <= 0 ? 'disabled' : ''} onclick="submitPosDiscountSelection('${escapeAttr(p.id)}', ${Number(size)}, false)">
            ${remainingRegQty > 0 ? '+ Select Regular' : 'No Regular Stock'}
          </button>
        </div>
      </div>
    </div>
  `;

  openModal(`Choose Your Product Option — ${fmtSize(size)}`, body, `<button type="button" class="btn secondary" onclick="closeModal()">Cancel</button>`);
}

function selectPosOptionCard(type) {
  const discCard = document.getElementById('pos-opt-card-disc');
  const regCard = document.getElementById('pos-opt-card-reg');
  if (type === 'disc' && discCard && !discCard.classList.contains('is-unavailable')) {
    discCard.classList.add('is-chosen');
    if (regCard) regCard.classList.remove('is-chosen');
  } else if (type === 'reg' && regCard && !regCard.classList.contains('is-unavailable')) {
    regCard.classList.add('is-chosen');
    if (discCard) discCard.classList.remove('is-chosen');
  }
}

function onPosOptionBatchChange(type, batchId) {
  if (!posOptionModalState) return;
  selectPosOptionCard(type);
  if (type === 'disc') {
    const b = posOptionModalState.discBatches.find(x => x.batchId === batchId);
    if (!b) return;
    posOptionModalState.selectedDiscBatchId = b.batchId;
    const ex = posFmtBatchExpiry(b.expirationDate, b.daysRemaining);
    const metaEl = document.getElementById('pos-disc-batch-meta');
    if (metaEl) {
      metaEl.innerHTML = `
        <div><span>Batch:</span> <code>${escapeHtml(b.batchNumber || '—')}</code></div>
        <div><span>Expiration Date:</span> <strong>${escapeHtml(ex.expStr)}</strong>${ex.daysStr ? ` <span class="pos-opt-days is-warn">(${escapeHtml(ex.daysStr)})</span>` : ''}</div>`;
    }
    const availEl = document.getElementById('pos-disc-avail-label');
    if (availEl) availEl.textContent = `${b.availQty} available`;
    const pctBadge = document.getElementById('pos-disc-pct-badge');
    if (pctBadge && b.discountPct !== undefined) pctBadge.textContent = `🏷️ ${b.discountPct}% OFF`;
    const priceWrap = document.getElementById('pos-disc-price-wrap');
    if (priceWrap && b.discountedPrice !== undefined) {
      priceWrap.innerHTML = `
        <del>${peso(b.originalPrice)}</del>
        <strong>${peso(b.discountedPrice)}</strong>
        <span class="pos-disc-save">Save ${peso(b.discountAmount)} / unit</span>`;
    }
    const submitBtn = document.getElementById('pos-disc-submit-btn');
    if (submitBtn) {
      submitBtn.disabled = (Number(b.availQty) || 0) <= 0;
      submitBtn.textContent = (Number(b.availQty) || 0) > 0 ? `✓ Select ${b.discountPct}% OFF` : 'Unavailable';
    }
  } else {
    const b = posOptionModalState.regBatches.find(x => x.batchId === batchId);
    if (!b) return;
    posOptionModalState.selectedRegBatchId = b.batchId;
    const ex = posFmtBatchExpiry(b.expirationDate, b.daysRemaining);
    const metaEl = document.getElementById('pos-reg-batch-meta');
    if (metaEl) {
      metaEl.innerHTML = `
        <div><span>Batch:</span> <code>${escapeHtml(b.batchNumber || '—')}</code></div>
        <div><span>Expiration Date:</span> <strong>${escapeHtml(ex.expStr)}</strong>${ex.daysStr ? ` <span class="pos-opt-days">(${escapeHtml(ex.daysStr)})</span>` : ''}</div>`;
    }
    const availEl = document.getElementById('pos-reg-avail-label');
    if (availEl) availEl.textContent = `${b.availQty} available`;
    const shelfPill = document.getElementById('pos-reg-shelf-pill');
    if (shelfPill) {
      const hasLonger = posIsRegularLongerShelfLife(b, posOptionModalState.primaryDiscBatch);
      shelfPill.style.display = hasLonger ? '' : 'none';
    }
  }
}

function submitPosDiscountSelection(productId, size, useDiscount) {
  const batchId = posOptionModalState
    ? (useDiscount ? posOptionModalState.selectedDiscBatchId : posOptionModalState.selectedRegBatchId)
    : null;
  if (addPosSizeBatchToCart(productId, size, useDiscount, 1, batchId)) {
    posOptionModalState = null;
    closeModal();
  }
}

function addPosSizeBatchToCart(productId, size = 1, applyNearExpiryDiscount = false, addQty = 1, selectedBatchId = null) {
  const p = productById(productId);
  if (!p || p.stock <= 0) { showToast('This product is out of stock.', 'error'); return false; }

  const qtyToAdd = Math.max(1, parseInt(addQty, 10) || 1);
  const bInfo = posGetSizeBatchInfo(p, size);
  const sizeId = bInfo.sizeId;
  const usage = posGetCartSizeUsage(p, sizeId, size);

  const reserved = getCartReservedLitersForProduct(p);
  const totalAvail = typeof productMixAvailableStock === 'function' ? productMixAvailableStock(p) : p.stock;
  const availForSealed = Math.min(p.stock - reserved.sealed, totalAvail - reserved.total);

  if (qtyToAdd * size > availForSealed + 1e-6) {
    showToast(`Not enough stock — only ${formatLiters(Math.max(0, availForSealed))} available.`, 'error');
    return false;
  }

  if (productHasCanBreakdown(p)) {
    const availableCans = productCanCount(p, size);
    if (usage.totalQty + qtyToAdd > availableCans) {
      showToast(`Only ${availableCans} in stock for ${fmtSize(size)} (${usage.totalQty} already in cart).`, 'error');
      return false;
    }
  }

  if (bInfo.batchInfo && bInfo.nonExpiredQty < usage.totalQty + qtyToAdd) {
    if (bInfo.expiredQty > 0 && bInfo.nonExpiredQty <= 0) {
      showToast(`Sale blocked: Remaining ${fmtSize(size)} stock for "${p.name}" is expired and cannot be sold.`, 'error');
    } else {
      showToast(`Only ${bInfo.nonExpiredQty} non-expired ${fmtSize(size)} unit(s) available for "${p.name}".`, 'error');
    }
    return false;
  }

  let nearExpiryDiscountPct = 0;
  let nearExpiryDiscountAmount = 0;
  const originalUnitPrice = bInfo.bestOriginalPrice;
  let unitPriceForSize = originalUnitPrice;
  let chosenBatchId = null;
  let chosenBatchNumber = null;

  if (applyNearExpiryDiscount) {
    if (bInfo.discountedQty <= 0 || bInfo.bestDiscountPct <= 0) {
      showToast(`No active near-expiry discount is available for ${fmtSize(size)} "${p.name}".`, 'error');
      return false;
    }
    const discBatch = (selectedBatchId && (bInfo.discountedBatches || []).find(b => b.batchId === selectedBatchId))
      || (bInfo.discountedBatches || [])[0]
      || null;
    chosenBatchId = discBatch ? discBatch.batchId : bInfo.bestDiscountBatchId;
    chosenBatchNumber = discBatch ? discBatch.batchNumber : bInfo.bestDiscountBatchNumber;

    const batchUsed = chosenBatchId ? (usage.byBatch[chosenBatchId] || 0) : usage.discQty;
    const batchAvail = discBatch ? Math.max(0, (Number(discBatch.remainingQty) || 0) - batchUsed) : Math.max(0, bInfo.discountedQty - usage.discQty);
    if (qtyToAdd > batchAvail) {
      showToast(`Only ${batchAvail} discounted unit(s) remaining in batch ${chosenBatchNumber || ''} for ${fmtSize(size)} "${p.name}".`, 'error');
      return false;
    }
    nearExpiryDiscountPct = discBatch && discBatch.discountPct ? Number(discBatch.discountPct) : bInfo.bestDiscountPct;
    nearExpiryDiscountAmount = discBatch && discBatch.discountAmount !== undefined ? Number(discBatch.discountAmount) : bInfo.bestDiscountAmount;
    unitPriceForSize = discBatch && discBatch.discountedPrice !== undefined ? Number(discBatch.discountedPrice) : bInfo.bestDiscountedPrice;
  } else if (bInfo.batchInfo) {
    const regBatch = (selectedBatchId && (bInfo.regularBatches || []).find(b => b.batchId === selectedBatchId))
      || (bInfo.regularBatches || [])[0]
      || null;
    chosenBatchId = regBatch ? regBatch.batchId : bInfo.bestRegularBatchId;
    chosenBatchNumber = regBatch ? regBatch.batchNumber : bInfo.bestRegularBatchNumber;

    if (regBatch) {
      const batchUsed = usage.byBatch[regBatch.batchId] || 0;
      const batchAvail = Math.max(0, (Number(regBatch.remainingQty) || 0) - batchUsed);
      if (qtyToAdd > batchAvail) {
        showToast(`Only ${batchAvail} regular-priced unit(s) available in batch ${regBatch.batchNumber} for ${fmtSize(size)} "${p.name}".`, 'error');
        return false;
      }
    } else {
      const remainingRegQty = Math.max(0, bInfo.regularQty - usage.regQty);
      if (qtyToAdd > remainingRegQty) {
        showToast(`Only ${remainingRegQty} regular-priced unit(s) available for ${fmtSize(size)} "${p.name}".`, 'error');
        return false;
      }
    }
  }

  const isDisc = nearExpiryDiscountPct > 0;
  const existing = cart.find(c =>
    c.type === 'product' &&
    (c.productId === p.id || c.productId === p.productId) &&
    (c.sizeId ? c.sizeId === sizeId : (Number(c.size) || 1) === size) &&
    Boolean(c.isNearExpiryDiscount || Number(c.nearExpiryDiscountPct) > 0) === isDisc &&
    ((c.selectedBatchId || c.nearExpiryBatchId || c.regularBatchId || null) === chosenBatchId)
  );

  if (existing) {
    existing.qty += qtyToAdd;
    existing.unitPrice = unitPriceForSize;
    existing.originalUnitPrice = originalUnitPrice;
    existing.isNearExpiryDiscount = isDisc;
    existing.nearExpiryDiscountPct = nearExpiryDiscountPct;
    existing.nearExpiryDiscountAmount = nearExpiryDiscountAmount;
    existing.nearExpiryStatus = isDisc ? bInfo.bestDiscountStatus : null;
    existing.selectedBatchId = chosenBatchId;
    existing.selectedBatchNumber = chosenBatchNumber;
    existing.nearExpiryBatchId = isDisc ? chosenBatchId : null;
    existing.nearExpiryBatchNumber = isDisc ? chosenBatchNumber : null;
    existing.regularBatchId = !isDisc ? chosenBatchId : null;
    existing.regularBatchNumber = !isDisc ? chosenBatchNumber : null;
    existing.lineTotal = Number((existing.qty * existing.unitPrice).toFixed(2));
  } else {
    cart.push({
      type: 'product',
      productId: p.productId || p.id,
      product_id: p.productId || p.id,
      sizeId: sizeId,
      size_id: sizeId,
      containerSize: size,
      name: p.name,
      brand: p.brand,
      color: p.color,
      size: size,
      qty: qtyToAdd,
      unitPrice: unitPriceForSize,
      originalUnitPrice: originalUnitPrice,
      isNearExpiryDiscount: isDisc,
      nearExpiryDiscountPct: nearExpiryDiscountPct,
      nearExpiryDiscountAmount: nearExpiryDiscountAmount,
      nearExpiryStatus: isDisc ? bInfo.bestDiscountStatus : null,
      selectedBatchId: chosenBatchId,
      selectedBatchNumber: chosenBatchNumber,
      nearExpiryBatchId: isDisc ? chosenBatchId : null,
      nearExpiryBatchNumber: isDisc ? chosenBatchNumber : null,
      regularBatchId: !isDisc ? chosenBatchId : null,
      regularBatchNumber: !isDisc ? chosenBatchNumber : null,
      pricePerLiter: p.price,
      lineTotal: Number((qtyToAdd * unitPriceForSize).toFixed(2)),
      taxClassification: p.taxClassification || p.tax_classification || 'vatable'
    });
  }
  refreshCartUI();
  showToast(`Added ${qtyToAdd}x ${fmtSize(size)} ${p.name}${isDisc ? ` (${nearExpiryDiscountPct}% OFF)` : ''} to Current Sale.`, 'ok');
  return true;
}

// Backward compatibility
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
  let newQty = line.type === 'colormix' ? parseFloat(raw) : parseInt(raw, 10);
  if (isNaN(newQty) || newQty <= 0) return;
  if (line.type === 'colormix') newQty = Number(newQty.toFixed(2));

  if (line.type === 'product') {
    const p = productById(line.productId);
    if (p) {
      const size = Number(line.size) || 1;
      const reserved = getCartReservedLitersForProduct(p, index);
      const totalAvail = typeof productMixAvailableStock === 'function' ? productMixAvailableStock(p) : p.stock;
      const availLiters = Math.min(p.stock - reserved.sealed, totalAvail - reserved.total);

      const maxAllowed = Math.floor(Math.max(0, availLiters) / size);
      if (newQty > maxAllowed) {
        showToast(`Not enough stock. Only ${maxAllowed} of ${size}L available (${formatLiters(Math.max(0, availLiters))} remaining).`, 'error');
        if (maxAllowed <= 0) {
          input.value = line.qty;
          return;
        }
        newQty = maxAllowed;
        input.value = newQty;
      }

      if (productHasCanBreakdown(p)) {
        const usage = posGetCartSizeUsage(p, line.sizeId, size, index);
        const maxCans = Math.max(0, productCanCount(p, size) - usage.totalQty);
        if (newQty > maxCans) {
          showToast(`Only ${maxCans} additional unit(s) available in stock for ${fmtSize(size)}.`, 'error');
          if (maxCans <= 0) {
            input.value = line.qty;
            return;
          }
          newQty = maxCans;
          input.value = newQty;
        }
      }

      const bInfo = posGetSizeBatchInfo(p, size);
      if (bInfo.batchInfo) {
        const isDiscLine = Boolean(line.isNearExpiryDiscount || Number(line.nearExpiryDiscountPct) > 0);
        const usage = posGetCartSizeUsage(p, line.sizeId, size, index);
        let maxBatchQty = isDiscLine
          ? Math.max(0, bInfo.discountedQty - usage.discQty)
          : Math.max(0, bInfo.nonExpiredQty - usage.totalQty);
        if (isDiscLine && line.selectedBatchId && Array.isArray(bInfo.discountedBatches)) {
          const selBatch = bInfo.discountedBatches.find(x => x.batchId === line.selectedBatchId);
          if (selBatch) {
            const usedOnBatch = cart.reduce((acc, it, idx) => (
              idx !== index && it && it.type === 'product' && it.selectedBatchId === line.selectedBatchId
                ? acc + (Number(it.qty) || 0) : acc
            ), 0);
            maxBatchQty = Math.min(maxBatchQty, Math.max(0, (Number(selBatch.remainingQty) || 0) - usedOnBatch));
          }
        }
        if (newQty > maxBatchQty) {
          showToast(
            isDiscLine
              ? `Only ${maxBatchQty} discounted unit(s) available for ${fmtSize(size)} "${p.name}". Add additional units at regular price.`
              : `Only ${maxBatchQty} non-expired ${fmtSize(size)} unit(s) available for "${p.name}".`,
            'error'
          );
          if (maxBatchQty <= 0) {
            input.value = line.qty;
            return;
          }
          newQty = maxBatchQty;
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
        if (p) {
          const reserved = getCartReservedLitersForProduct(p, index);
          const avail = (typeof productMixAvailableStock === 'function' ? productMixAvailableStock(p) : p.stock) - reserved.total;
          if (avail + 1e-6 < reqLiters) {
            showToast(`Not enough stock for mix ingredient "${comp.name}" (${formatLiters(Math.max(0, avail))} available).`, 'error');
            input.value = line.qty;
            return;
          }
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
  line.lineTotal = (line.type === 'colormix' && line.baseGrandTotal && line.baseLiters)
    ? Number(((line.qty / line.baseLiters) * line.baseGrandTotal).toFixed(2))
    : Number((line.qty * line.unitPrice).toFixed(2));
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
    const isDiscLine = line.type === 'product' && Number(line.nearExpiryDiscountPct) > 0;
    const origSub = isDiscLine ? Number(((line.originalUnitPrice || line.unitPrice) * line.qty).toFixed(2)) : 0;
    priceEl.innerHTML = isDiscLine
      ? `<del class="muted" style="font-size:11px; display:block; font-weight:400;">${peso(origSub)}</del><span>${peso(line.lineTotal)}</span>`
      : `<span>${peso(line.lineTotal)}</span>`;
  }

  const metaEl = document.getElementById(`cart-meta-${index}`);
  if (metaEl) {
    const isMix = line.type === 'colormix';
    const isDiscLine = !isMix && Number(line.nearExpiryDiscountPct) > 0;
    const perUnitSave = isDiscLine ? Number((line.nearExpiryDiscountAmount || ((line.originalUnitPrice || line.unitPrice) - line.unitPrice)).toFixed(2)) : 0;
    const totalSave = isDiscLine ? Number((perUnitSave * (line.qty || 1)).toFixed(2)) : 0;
    metaEl.innerHTML = isMix
      ? `Custom Mix · <strong>${line.liters}L</strong> · ${peso(line.unitPrice)}/L`
      : `${escapeHtml(line.brand || '')} · Size: <strong>${line.size || 1}L</strong> · ${isDiscLine
        ? `<del class="muted">${peso(line.originalUnitPrice)}</del> <strong style="color:var(--success-text);">${peso(line.unitPrice)}</strong> <span class="badge" style="background:var(--success-bg); color:var(--success-text); border:1px solid var(--success-border); font-size:10px; padding:0 5px;">🏷️ -${line.nearExpiryDiscountPct}% OFF (-${peso(perUnitSave)}/unit · Save ${peso(totalSave)})</span> <span class="badge" style="background:var(--success-bg); color:var(--success-text); border:1px solid var(--success-border); font-size:10px; padding:0 5px;">${line.qty} discounted</span>`
        : `${peso(line.unitPrice)} each`} · <span class="total-liters" style="color:var(--teal-text); font-weight:600;">${(line.qty * (Number(line.size) || 1)).toFixed(2)} L total</span>`;
  }

  const cartCountBadge = document.getElementById('cart-count-badge');
  if (cartCountBadge) {
    const cartItemCount = cart.reduce((sum, item) => sum + (item.qty || 1), 0);
    cartCountBadge.className = `badge ${cart.length ? 'ok' : 'mid'}`;
    cartCountBadge.innerHTML = cart.length ? `🛒 ${cart.length} item${cart.length === 1 ? '' : 's'} (${cartItemCount} qty)` : 'Cart Empty';
  }

  renderCartTotals();
  updateCheckoutButtonState();
  if (typeof scheduleRouteStateSync === 'function') scheduleRouteStateSync();
}

function setCartQty(index, rawVal) {
  const line = cart[index];
  if (!line) return;
  let newQty = line.type === 'colormix' ? parseFloat(rawVal) : parseInt(rawVal, 10);
  if (isNaN(newQty) || newQty <= 0) {
    newQty = line.type === 'colormix' ? 0.5 : 1;
  }
  if (line.type === 'colormix') newQty = Number(newQty.toFixed(2));

  if (line.type === 'product') {
    const p = productById(line.productId);
    if (!p) return;
    const size = Number(line.size) || 1;

    // Check against total stock in liters across other product & colormix lines
    const reserved = getCartReservedLitersForProduct(p, index);
    const totalAvail = typeof productMixAvailableStock === 'function' ? productMixAvailableStock(p) : p.stock;
    const availLiters = Math.min(p.stock - reserved.sealed, totalAvail - reserved.total);

    if (newQty * size > availLiters + 1e-6) {
      const maxAllowed = Math.floor(Math.max(0, availLiters) / size);
      showToast(`Not enough stock. Only ${maxAllowed} of ${size}L available (${formatLiters(Math.max(0, availLiters))} remaining).`, 'error');
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
      const usage = posGetCartSizeUsage(p, line.sizeId, size, index);
      const maxCans = Math.max(0, productCanCount(p, size) - usage.totalQty);
      if (newQty > maxCans) {
        showToast(`Only ${maxCans} in stock for ${fmtSize(size)}.`, 'error');
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

    const bInfo = posGetSizeBatchInfo(p, size);
    if (bInfo.batchInfo) {
      const isDiscLine = Boolean(line.isNearExpiryDiscount || Number(line.nearExpiryDiscountPct) > 0);
      const usage = posGetCartSizeUsage(p, line.sizeId, size, index);
      let maxBatchQty = isDiscLine
        ? Math.max(0, bInfo.discountedQty - usage.discQty)
        : Math.max(0, bInfo.nonExpiredQty - usage.totalQty);
      if (isDiscLine && line.selectedBatchId && Array.isArray(bInfo.discountedBatches)) {
        const selBatch = bInfo.discountedBatches.find(x => x.batchId === line.selectedBatchId);
        if (selBatch) {
          const usedOnBatch = cart.reduce((acc, it, idx) => (
            idx !== index && it && it.type === 'product' && it.selectedBatchId === line.selectedBatchId
              ? acc + (Number(it.qty) || 0) : acc
          ), 0);
          maxBatchQty = Math.min(maxBatchQty, Math.max(0, (Number(selBatch.remainingQty) || 0) - usedOnBatch));
        }
      }
      if (newQty > maxBatchQty) {
        showToast(
          isDiscLine
            ? `Only ${maxBatchQty} discounted unit(s) available for ${fmtSize(size)} "${p.name}". Add additional units at regular price.`
            : `Only ${maxBatchQty} non-expired ${fmtSize(size)} unit(s) available for "${p.name}".`,
          'error'
        );
        if (maxBatchQty <= 0) {
          cart.splice(index, 1);
        } else {
          line.qty = maxBatchQty;
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
        if (p) {
          const reserved = getCartReservedLitersForProduct(p, index);
          const avail = (typeof productMixAvailableStock === 'function' ? productMixAvailableStock(p) : p.stock) - reserved.total;
          if (avail + 1e-6 < reqLiters) {
            showToast(`Not enough stock for mix ingredient "${comp.name}" (need ${formatStock(reqLiters)}L, available ${formatStock(Math.max(0, avail))}L).`, 'error');
            refreshCartUI();
            return;
          }
        }
      }
      line.components = line.components.map(comp => ({
        ...comp,
        liters: Number((newQty * ((Number(comp.percentage) || 0) / 100)).toFixed(2))
      }));
    }
    line.qty = newQty;
    line.liters = newQty;
    line.lineTotal = (line.baseGrandTotal && line.baseLiters)
      ? Number(((line.qty / line.baseLiters) * line.baseGrandTotal).toFixed(2))
      : Number((line.qty * line.unitPrice).toFixed(2));
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
    } catch (e) { }
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
  if (typeof scheduleRouteStateSync === 'function') scheduleRouteStateSync();

  if (focusedInputId) {
    const nextInput = document.getElementById(focusedInputId);
    if (nextInput) {
      nextInput.focus();
      try {
        if (selectionStart !== null && selectionEnd !== null) {
          nextInput.setSelectionRange(selectionStart, selectionEnd);
        }
      } catch (e) { }
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
          ${isMix ? `<span class="badge" style="font-size:10.5px; padding:1px 6px; background:var(--surface-2); border:1px solid var(--line);">${escapeHtml(c.colorName || 'Mix')}</span>` :
        (c.color && c.color !== '-' ? `<span class="badge" style="font-size:10.5px; padding:1px 6px; background:var(--surface-2); border:1px solid var(--line);">${escapeHtml(c.color)}</span>` : '')}
        </div>
        <span class="cmeta" id="cart-meta-${i}">
          ${isMix ? `Custom Mix · <strong>${c.liters}L</strong> · ${peso(c.unitPrice)}/L` :
        `${escapeHtml(c.brand || '')} · Size: <strong>${c.size || 1}L</strong> · ${c.nearExpiryDiscountPct > 0 ? (() => {
          const perSave = Number((c.nearExpiryDiscountAmount || ((c.originalUnitPrice || c.unitPrice) - c.unitPrice)).toFixed(2));
          const totSave = Number((perSave * (c.qty || 1)).toFixed(2));
          return `<del class="muted">${peso(c.originalUnitPrice)}</del> <strong style="color:var(--success-text);">${peso(c.unitPrice)}</strong> <span class="badge" style="background:var(--success-bg); color:var(--success-text); border:1px solid var(--success-border); font-size:10px; padding:0 5px;">🏷️ -${c.nearExpiryDiscountPct}% OFF (-${peso(perSave)}/unit · Save ${peso(totSave)})</span> <span class="badge" style="background:var(--success-bg); color:var(--success-text); border:1px solid var(--success-border); font-size:10px; padding:0 5px;">${c.qty} discounted</span>${c.nearExpiryBatchNumber ? ` <span class="muted">· Batch <code>${escapeHtml(c.nearExpiryBatchNumber)}</code></span>` : ''}`;
        })() : `${peso(c.unitPrice)} each`} · <span class="total-liters" style="color:var(--teal-text); font-weight:600;">${(c.qty * (Number(c.size) || 1)).toFixed(2)} L total</span>`}
        </span>
      </div>
      <div class="cprice" id="cart-price-${i}">
        ${!isMix && Number(c.nearExpiryDiscountPct) > 0 ? `<del class="muted" style="font-size:11px; display:block; font-weight:400;">${peso(Number(((c.originalUnitPrice || c.unitPrice) * (c.qty || 1)).toFixed(2)))}</del>` : ''}
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


/* ============================================================
   PHILIPPINE 12% BIR VALUE-ADDED TAX (VAT) MODULE
   ============================================================ */

function getVatSettings() {
  if (typeof db !== 'undefined' && db) {
    if (db.vatSettings && typeof db.vatSettings === 'object') {
      return db.vatSettings;
    }
    if (db.settings && db.settings.vat_settings) {
      return db.settings.vat_settings;
    }
  }
  return {
    taxStatus: 'vat_registered',
    pricingType: 'inclusive',
    vatRate: 12.00
  };
}

async function saveVatSettings(newSettings) {
  if (!currentUser || currentUser.role !== 'admin') {
    showToast('Access denied: Only Administrators can configure Philippine VAT settings.', 'error');
    return false;
  }
  const taxStatus = (newSettings.taxStatus === 'non_vat') ? 'non_vat' : 'vat_registered';
  const pricingType = (newSettings.pricingType === 'exclusive') ? 'exclusive' : 'inclusive';
  const rawRate = Number(newSettings.vatRate);
  const vatRate = (!isNaN(rawRate) && rawRate >= 0) ? Number(rawRate.toFixed(2)) : 12.00;

  const clean = { taxStatus, pricingType, vatRate };

  if (typeof db !== 'undefined' && db) {
    db.vatSettings = clean;
    if (!db.settings) db.settings = {};
    db.settings.vat_settings = clean;
  }

  try {
    const res = await fetch('api/db.php?action=save_vat_settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vatSettings: clean,
        currentUser: currentUser
      })
    });
    const data = await res.json();
    if (!data.success) {
      showToast(data.error || 'Failed to save VAT settings.', 'error');
      return false;
    }

    if (typeof logAudit === 'function') {
      logAudit('UPDATE_VAT_SETTINGS', 'Settings', `Admin ${currentUser.name} updated Philippine VAT configuration to ${taxStatus.toUpperCase()} (${vatRate}%, ${pricingType})`, {
        entityName: 'Philippine Tax Settings',
        fieldChanged: 'VAT Configuration',
        newValue: JSON.stringify(clean)
      });
    }

    showToast('Philippine VAT configuration saved successfully!', 'success');
    renderCartTotals();
    updateCheckoutButtonState();
    const bEl = document.getElementById('pos-vat-status-badge');
    if (bEl && typeof getPosVatBadgeHtml === 'function') {
      bEl.outerHTML = getPosVatBadgeHtml();
    }
    return true;
  } catch (err) {
    console.error('Error saving VAT settings:', err);
    showToast('Network error while saving VAT settings.', 'error');
    return false;
  }
}

function getPosVatBadgeHtml() {
  const current = getVatSettings();
  const isVatReg = current.taxStatus !== 'non_vat';
  const isExclusive = current.pricingType === 'exclusive';
  const rate = current.vatRate !== undefined ? current.vatRate : 12;
  const label = isVatReg
    ? `🇵🇭 ${rate}% VAT (${isExclusive ? 'Exclusive' : 'Inclusive'})`
    : `🇵🇭 Non-VAT Registered`;
  const bg = isVatReg ? 'var(--teal-tint)' : 'var(--surface-3)';
  const color = isVatReg ? 'var(--teal-dark)' : 'var(--ink-soft)';
  const border = isVatReg ? 'var(--teal-tint-border)' : 'var(--line)';

  return `
    <span id="pos-vat-status-badge" class="badge" style="background:${bg}; color:${color}; border:1px solid ${border}; font-size:11px; font-weight:700;" title="Philippine Tax Status">
      ${label}
    </span>
  `;
}

function openVatSettingsModal() {
  if (!currentUser || currentUser.role !== 'admin') {
    showToast('Access denied: Only Administrators can configure Philippine VAT settings.', 'error');
    return;
  }
  const current = getVatSettings();
  const isVatReg = current.taxStatus !== 'non_vat';
  const isExclusive = current.pricingType === 'exclusive';
  const vatRate = current.vatRate !== undefined ? current.vatRate : 12.00;

  openModal(
    '⚙️ Philippine 12% VAT Configuration',
    `
    <form id="vat-settings-form" onsubmit="event.preventDefault(); submitVatSettingsModal();" style="display:flex; flex-direction:column; gap:16px;">
      <div style="background:var(--teal-tint); border:1px solid var(--teal-tint-border); border-radius:8px; padding:12px 14px; font-size:12.5px; color:var(--teal-dark);">
        <div style="font-weight:700; margin-bottom:3px; display:flex; align-items:center; gap:6px;">
          <span>🇵🇭</span>
          <span>Bureau of Internal Revenue (BIR) Value-Added Tax (VAT)</span>
        </div>
        <div>Configure your business tax registration status, default VAT rate, and pricing method for Point of Sale transactions.</div>
      </div>

      <div class="field">
        <label style="font-weight:700; font-size:13px; color:var(--ink); margin-bottom:6px; display:block;">
          Business Tax Status <span style="color:var(--danger);">*</span>
        </label>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <label style="display:flex; align-items:flex-start; gap:8px; padding:10px 12px; border:2px solid ${isVatReg ? 'var(--teal)' : 'var(--line)'}; border-radius:8px; background:${isVatReg ? 'var(--teal-tint)' : 'var(--surface)'}; cursor:pointer;" id="label-tax-status-vat">
            <input type="radio" name="vat_tax_status" value="vat_registered" ${isVatReg ? 'checked' : ''} onchange="onVatTaxStatusRadioChange(this.value)" style="margin-top:2px;">
            <div>
              <div style="font-weight:700; color:var(--ink); font-size:13px;">VAT Registered</div>
              <div class="muted small" style="font-size:11px; margin-top:2px;">Subject to standard 12% Philippine VAT on VATable sales.</div>
            </div>
          </label>
          <label style="display:flex; align-items:flex-start; gap:8px; padding:10px 12px; border:2px solid ${!isVatReg ? 'var(--teal)' : 'var(--line)'}; border-radius:8px; background:${!isVatReg ? 'var(--teal-tint)' : 'var(--surface)'}; cursor:pointer;" id="label-tax-status-nonvat">
            <input type="radio" name="vat_tax_status" value="non_vat" ${!isVatReg ? 'checked' : ''} onchange="onVatTaxStatusRadioChange(this.value)" style="margin-top:2px;">
            <div>
              <div style="font-weight:700; color:var(--ink); font-size:13px;">Non-VAT Registered</div>
              <div class="muted small" style="font-size:11px; margin-top:2px;">Exempt from charging VAT. No VAT will be calculated on transactions.</div>
            </div>
          </label>
        </div>
      </div>

      <div id="vat-config-details" style="${!isVatReg ? 'display:none;' : ''}">
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div class="field">
            <label style="font-weight:700; font-size:13px; color:var(--ink); margin-bottom:6px; display:block;">
              Pricing Method <span style="color:var(--danger);">*</span>
            </label>
            <select id="vat-pricing-type" style="width:100%; padding:9px 12px; font-size:13px; border:1px solid var(--line); border-radius:6px; background:var(--surface);">
              <option value="inclusive" ${!isExclusive ? 'selected' : ''}>VAT-Inclusive (Item prices already include 12% VAT)</option>
              <option value="exclusive" ${isExclusive ? 'selected' : ''}>VAT-Exclusive (12% VAT is added on top of item prices)</option>
            </select>
            <div class="muted small" style="font-size:11px; margin-top:4px;">
              • <b>VAT-Inclusive:</b> VATable Sales = Amount ÷ 1.12<br>
              • <b>VAT-Exclusive:</b> VAT = Subtotal × 12%
            </div>
          </div>

          <div class="field">
            <label style="font-weight:700; font-size:13px; color:var(--ink); margin-bottom:6px; display:block;">
              VAT Rate (%) <span style="color:var(--danger);">*</span>
            </label>
            <div style="position:relative;">
              <input type="number" id="vat-rate-input" step="0.01" min="0" max="100" value="${vatRate}"
                style="width:100%; padding:9px 28px 9px 12px; font-size:14px; font-weight:700; font-family:'Space Grotesk',monospace; border:1px solid var(--line); border-radius:6px; box-sizing:border-box;">
              <span style="position:absolute; right:10px; top:50%; transform:translateY(-50%); font-weight:700; color:var(--ink-soft); font-size:13px;">%</span>
            </div>
            <div class="muted small" style="font-size:11px; margin-top:4px;">Standard Philippine statutory VAT rate is 12.00%.</div>
          </div>
        </div>
      </div>
    </form>
    `,
    `
    <button type="button" class="btn ghost" onclick="closeModal()">Cancel</button>
    <button type="button" class="btn" onclick="submitVatSettingsModal()" style="background:var(--teal); color:#fff;">Save Configuration</button>
    `
  );
}

function onVatTaxStatusRadioChange(val) {
  const isVat = val === 'vat_registered';
  const details = document.getElementById('vat-config-details');
  if (details) details.style.display = isVat ? 'block' : 'none';
  const lblVat = document.getElementById('label-tax-status-vat');
  const lblNonVat = document.getElementById('label-tax-status-nonvat');
  if (lblVat) {
    lblVat.style.borderColor = isVat ? 'var(--teal)' : 'var(--line)';
    lblVat.style.background = isVat ? 'var(--teal-tint)' : 'var(--surface)';
  }
  if (lblNonVat) {
    lblNonVat.style.borderColor = !isVat ? 'var(--teal)' : 'var(--line)';
    lblNonVat.style.background = !isVat ? 'var(--teal-tint)' : 'var(--surface)';
  }
}

async function submitVatSettingsModal() {
  const statusRadio = document.querySelector('input[name="vat_tax_status"]:checked');
  const taxStatus = statusRadio ? statusRadio.value : 'vat_registered';
  const pricingTypeEl = document.getElementById('vat-pricing-type');
  const pricingType = pricingTypeEl ? pricingTypeEl.value : 'inclusive';
  const rateEl = document.getElementById('vat-rate-input');
  const vatRate = rateEl ? (parseFloat(rateEl.value) || 0) : 12.00;

  const ok = await saveVatSettings({ taxStatus, pricingType, vatRate });
  if (ok) {
    closeModal();
  }
}

/**
 * Centralized Philippine VAT calculation function.
 * Single source of truth for POS cart, confirmation modal, receipt, and sales history.
 */
function calculateSaleVat(items, discountAmount = 0, customVatSettings = null) {
  const vatSettings = customVatSettings || getVatSettings();
  const taxStatus = (vatSettings && vatSettings.taxStatus === 'non_vat') ? 'non_vat' : 'vat_registered';
  const pricingType = (vatSettings && vatSettings.pricingType === 'exclusive') ? 'exclusive' : 'inclusive';
  const rawRate = Number(vatSettings && vatSettings.vatRate);
  const vatRate = (!isNaN(rawRate) && rawRate >= 0) ? rawRate : 12.0;

  const safeItems = Array.isArray(items) ? items : [];
  let sVatable = 0;
  let sExempt = 0;
  let sZeroRated = 0;

  for (const item of safeItems) {
    const lineTotal = Number(item.lineTotal !== undefined ? item.lineTotal : ((Number(item.qty) || 0) * (Number(item.unitPrice) || 0))) || 0;
    const taxType = (item.taxClassification || item.tax_classification || (item.productId && typeof productById === 'function' && productById(item.productId) && (productById(item.productId).taxClassification || productById(item.productId).tax_classification)) || 'vatable').toLowerCase();

    if (taxType === 'exempt' || taxType === 'vat_exempt') {
      sExempt += lineTotal;
    } else if (taxType === 'zero_rated' || taxType === 'zero-rated' || taxType === 'zero') {
      sZeroRated += lineTotal;
    } else {
      sVatable += lineTotal;
    }
  }

  sVatable = Number(sVatable.toFixed(2));
  sExempt = Number(sExempt.toFixed(2));
  sZeroRated = Number(sZeroRated.toFixed(2));
  const subtotal = Number((sVatable + sExempt + sZeroRated).toFixed(2));

  const safeDiscount = Math.max(0, Math.min(subtotal, Number(Number(discountAmount).toFixed(2)) || 0));
  const netSubtotal = Number((subtotal - safeDiscount).toFixed(2));

  if (taxStatus === 'non_vat' || vatRate <= 0) {
    return {
      subtotal,
      discountAmount: safeDiscount,
      netSubtotal,
      vatableSales: 0.00,
      vatAmount: 0.00,
      vatExemptSales: 0.00,
      zeroRatedSales: 0.00,
      total: netSubtotal,
      vatRate: 0.00,
      taxStatus: 'non_vat',
      pricingType
    };
  }

  let nVatable = sVatable;
  let nExempt = sExempt;
  let nZeroRated = sZeroRated;

  if (subtotal > 0 && safeDiscount > 0) {
    const vatableDisc = Number((safeDiscount * (sVatable / subtotal)).toFixed(2));
    const exemptDisc = Number((safeDiscount * (sExempt / subtotal)).toFixed(2));
    nVatable = Number(Math.max(0, sVatable - vatableDisc).toFixed(2));
    nExempt = Number(Math.max(0, sExempt - exemptDisc).toFixed(2));
    if (sZeroRated > 0) {
      nZeroRated = Number(Math.max(0, netSubtotal - nVatable - nExempt).toFixed(2));
    } else {
      nZeroRated = 0.00;
      if (sExempt > 0 && sVatable > 0) {
        nVatable = Number(Math.max(0, netSubtotal - nExempt).toFixed(2));
      } else if (sVatable > 0) {
        nVatable = netSubtotal;
      } else if (sExempt > 0) {
        nExempt = netSubtotal;
      }
    }
  }

  const rateFactor = vatRate / 100.0;
  let vatableSales = 0.00;
  let vatAmount = 0.00;
  let total = 0.00;

  if (pricingType === 'inclusive') {
    // VAT-Inclusive:
    // VATable Sales = VAT-Inclusive Amount / (1 + Rate)
    // VAT Amount = VAT-Inclusive Amount - VATable Sales
    if (nVatable > 0) {
      vatableSales = Number((nVatable / (1.0 + rateFactor)).toFixed(2));
      vatAmount = Number((nVatable - vatableSales).toFixed(2));
    }
    total = netSubtotal;
  } else {
    // VAT-Exclusive:
    // VAT Amount = VATable Sales * Rate
    // Total Amount Due = Net Subtotal + VAT
    vatableSales = nVatable;
    vatAmount = Number((vatableSales * rateFactor).toFixed(2));
    total = Number((netSubtotal + vatAmount).toFixed(2));
  }

  return {
    subtotal,
    discountAmount: safeDiscount,
    netSubtotal,
    vatableSales,
    vatAmount,
    vatExemptSales: nExempt,
    zeroRatedSales: nZeroRated,
    total,
    vatRate,
    taxStatus,
    pricingType
  };
}

function cartTotals() {
  const grossSubtotal = Number(cart.reduce((t, c) => t + (Number(c.lineTotal) || 0), 0).toFixed(2));
  const isEligible = grossSubtotal >= 2500;
  const discountPct = isEligible ? 10 : 0;
  const discountAmount = isEligible ? Number((grossSubtotal * 0.10).toFixed(2)) : 0;
  const neededToQualify = isEligible ? 0 : Number((2500 - grossSubtotal).toFixed(2));

  const vatCalc = calculateSaleVat(cart, discountAmount);

  return {
    subtotal: vatCalc.subtotal,
    discountPct,
    discountPercentage: discountPct,
    discountAmount: vatCalc.discountAmount,
    discount: vatCalc.discountAmount,
    netSubtotal: vatCalc.netSubtotal,
    vatableSales: vatCalc.vatableSales,
    vatAmount: vatCalc.vatAmount,
    vatExemptSales: vatCalc.vatExemptSales,
    zeroRatedSales: vatCalc.zeroRatedSales,
    total: vatCalc.total,
    vatRate: vatCalc.vatRate,
    taxStatus: vatCalc.taxStatus,
    pricingType: vatCalc.pricingType,
    isEligible,
    neededToQualify
  };
}

function cartTotalsHtml() {
  const t = cartTotals();
  const hasItems = cart.length > 0;
  const isVatReg = t.taxStatus !== 'non_vat';

  return `
  <div class="pos-payment-card">
    <div class="cart-total-row">
      <span class="muted">Subtotal</span>
      <span style="font-weight:600; font-family:'Space Grotesk',monospace;">${peso(t.subtotal)}</span>
    </div>
    ${t.isEligible ? `
      <div class="cart-total-row pos-discount-row">
        <span>Discount (${t.discountPct}%)</span>
        <span style="font-weight:700; font-family:'Space Grotesk',monospace;">-${peso(t.discountAmount)}</span>
      </div>
      <div class="pos-promo-indicator qualified">
        <span>🎉</span>
        <span>10% Discount Applied!</span>
      </div>
    ` : (hasItems ? `
      <div class="pos-promo-indicator hint">
        <span>💡</span>
        <span>Add ${peso(t.neededToQualify)} more to qualify for a 10% discount.</span>
      </div>
    ` : '')}

    <!-- Philippine BIR VAT Breakdown -->
    <div class="pos-vat-breakdown" style="border-top:1px dashed var(--line); border-bottom:1px dashed var(--line); padding:6px 0; margin:6px 0; font-size:12px;">
      ${isVatReg ? `
        <div class="cart-total-row" style="padding:2px 0;">
          <span class="muted">VATable Sales:</span>
          <span style="font-family:'Space Grotesk',monospace; font-weight:600;">${peso(t.vatableSales)}</span>
        </div>
        <div class="cart-total-row" style="padding:2px 0;">
          <span class="muted">VAT Amount (${t.vatRate}%):</span>
          <span style="font-family:'Space Grotesk',monospace; font-weight:700; color:var(--teal-text, #1F6F6B);">${peso(t.vatAmount)}</span>
        </div>
        ${(t.vatExemptSales > 0) ? `
          <div class="cart-total-row" style="padding:2px 0;">
            <span class="muted">VAT-Exempt Sales:</span>
            <span style="font-family:'Space Grotesk',monospace; font-weight:600;">${peso(t.vatExemptSales)}</span>
          </div>
        ` : ''}
        ${(t.zeroRatedSales > 0) ? `
          <div class="cart-total-row" style="padding:2px 0;">
            <span class="muted">Zero-Rated Sales:</span>
            <span style="font-family:'Space Grotesk',monospace; font-weight:600;">${peso(t.zeroRatedSales)}</span>
          </div>
        ` : ''}
      ` : `
        <div class="cart-total-row" style="padding:2px 0;">
          <span class="muted">Tax Status:</span>
          <span class="badge" style="background:var(--surface-3); border:1px solid var(--line); font-size:10.5px; padding:1px 6px;">Non-VAT Registered</span>
        </div>
      `}
    </div>

    <div class="cart-total-row grand">
      <span>Total Amount Due</span>
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

  // Stock verification across all items (including colormix ingredients)
  let stockError = '';
  if (hasItems) {
    const litersByProd = {};
    const mixLitersByProd = {};
    const cansBySize = {};
    const prodByIdMap = {};
    for (const c of cart) {
      if (c.type === 'product') {
        const p = productById(c.productId);
        if (!p || p.stock <= 0) {
          stockError = `"${c.name}" is out of stock.`;
          break;
        }
        prodByIdMap[p.id] = p;
        const size = Number(c.size) || 1;
        const qty = Number(c.qty) || 0;
        litersByProd[p.id] = (litersByProd[p.id] || 0) + (qty * size);
        if (litersByProd[p.id] > p.stock + 1e-6) {
          stockError = `Not enough stock for "${p.name}".`;
          break;
        }
        if (productHasCanBreakdown(p)) {
          const key = `${p.id}_${size}`;
          cansBySize[key] = (cansBySize[key] || 0) + qty;
          if (cansBySize[key] > productCanCount(p, size)) {
            stockError = `Not enough ${size}L units for "${p.name}".`;
            break;
          }
        }
      } else if (c.type === 'colormix' && Array.isArray(c.components)) {
        for (const comp of c.components) {
          const p = productById(comp.productId);
          if (!p) continue;
          prodByIdMap[p.id] = p;
          mixLitersByProd[p.id] = (mixLitersByProd[p.id] || 0) + (Number(comp.liters) || 0);
        }
      }
    }
    if (!stockError) {
      for (const pid of Object.keys(prodByIdMap)) {
        const p = prodByIdMap[pid];
        const totalReq = (litersByProd[pid] || 0) + (mixLitersByProd[pid] || 0);
        const totalAvail = typeof productMixAvailableStock === 'function' ? productMixAvailableStock(p) : p.stock;
        if (totalReq > totalAvail + 1e-6) {
          stockError = `Not enough combined stock for "${p.name}".`;
          break;
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
      hintEl.innerHTML = `<span style="color:var(--teal-text); font-weight:600;">✓ Ready to complete sale · Click to review &amp; print receipt</span>`;
    }
  }
}

function posConfirmKeyHandler(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    cancelPosConfirm();
  }
}

/**
 * Single source of truth for Custom Color Mix receipt & breakdown data.
 * Priority 1: Frozen permanent `item.mixSnapshot` saved at sale time (never touches live catalog/inventory).
 * Priority 2: `item.priceBreakdown` (scales accurately if cart qty/liters changed before checkout).
 * Priority 3: Legacy `item.components` reconstruction for historical sales recorded before snapshots existed.
 */
function getCustomColorMixReceiptData(item) {
  if (!item || item.type !== 'colormix') return null;

  const currLiters = Number(item.liters) || Number(item.qty) || 1;
  const lineTotal = Number(item.lineTotal) || 0;
  const containerSizeLabel = item.containerSizeLabel || (typeof fmtSize === 'function' ? `${fmtSize(currLiters)} Mix` : `${currLiters}L Mix`);
  const hexColor = item.hexColor || item.colorHex || '#1F6F6B';
  const colorName = item.colorName || item.detectedColorName || 'Custom Shade';
  const isCustomizedFormula = Boolean(item.isCustomizedFormula);
  const originalCatalogName = item.originalCatalogName || '';

  // Priority 1: Permanent immutable snapshot frozen at transaction completion
  if (item.mixSnapshot && (item.mixSnapshot.basePaint || (Array.isArray(item.mixSnapshot.ingredients) && item.mixSnapshot.ingredients.length))) {
    const snap = item.mixSnapshot;
    const basePct = snap.basePaint ? (Number(snap.basePaint.pct) || 0) : (Number(snap.basePct) || 0);
    const totalColorantPct = snap.totalColorantPct != null
      ? Number(snap.totalColorantPct)
      : Math.round((snap.ingredients || []).reduce((s, ing) => s + (Number(ing.pct) || 0), 0) * 10) / 10;
    const totalFormulaPct = snap.totalFormulaPct != null
      ? Number(snap.totalFormulaPct)
      : Math.round((basePct + totalColorantPct) * 10) / 10;

    return {
      colorName: snap.colorName || colorName,
      detectedColorName: snap.detectedColorName || item.detectedColorName || '',
      hexColor: snap.hexColor || hexColor,
      baseType: snap.baseType || item.baseType || 'Base Paint',
      containerSizeLabel: snap.containerSizeLabel || containerSizeLabel,
      isCustomizedFormula: snap.isCustomizedFormula !== undefined ? Boolean(snap.isCustomizedFormula) : isCustomizedFormula,
      originalCatalogName: snap.originalCatalogName || originalCatalogName,
      basePaint: snap.basePaint ? { ...snap.basePaint } : null,
      basePaintCost: Number(snap.basePaintCost) || 0,
      basePct,
      ingredients: (snap.ingredients || []).map(ing => ({ ...ing })),
      totalColorantCost: Number(snap.totalColorantCost) || 0,
      totalColorantLiters: Number(snap.totalColorantLiters) || 0,
      totalColorantMl: Number(snap.totalColorantMl) || 0,
      totalColorantPct,
      totalFormulaPct,
      materialCost: Number(snap.materialCost) || 0,
      serviceFee: Number(snap.serviceFee) || 0,
      otherCharges: Number(snap.otherCharges) || 0,
      grandTotal: Number(snap.grandTotal) || lineTotal,
      totalLiters: Number(snap.totalLiters) || currLiters
    };
  }

  // Priority 2: Stored priceBreakdown (scales if cart qty/liters changed before sale completion)
  const pb = item.priceBreakdown;
  if (pb && (pb.basePaint || (Array.isArray(pb.ingredients) && pb.ingredients.length))) {
    const baseL = Number(item.baseLiters) || Number(pb.totalLiters) || currLiters || 1;
    const scale = baseL > 0 ? (currLiters / baseL) : 1;
    const isScaled = Math.abs(scale - 1) > 1e-6;

    const basePaint = pb.basePaint ? {
      ...pb.basePaint,
      liters: isScaled ? Number(((Number(pb.basePaint.liters) || 0) * scale).toFixed(4)) : Number(pb.basePaint.liters) || 0,
      ml: isScaled ? Math.round((Number(pb.basePaint.liters) || 0) * scale * 1000) : (Number(pb.basePaint.ml) || Math.round((Number(pb.basePaint.liters) || 0) * 1000)),
      cost: isScaled ? Number(((Number(pb.basePaint.cost) || 0) * scale).toFixed(2)) : Number(pb.basePaint.cost) || 0
    } : null;

    const ingredients = (pb.ingredients || []).map(ing => {
      const scaledLiters = isScaled ? Number(((Number(ing.liters) || 0) * scale).toFixed(4)) : Number(ing.liters) || 0;
      return {
        ...ing,
        liters: scaledLiters,
        ml: isScaled ? Math.round(scaledLiters * 1000) : (Number(ing.ml) || Math.round(scaledLiters * 1000)),
        cost: isScaled ? Number(((Number(ing.cost) || 0) * scale).toFixed(2)) : Number(ing.cost) || 0
      };
    });

    const basePaintCost = basePaint ? basePaint.cost : Number(((Number(pb.basePaintCost) || 0) * scale).toFixed(2));
    const basePct = basePaint ? (Number(basePaint.pct) || 0) : (Number(pb.basePct) || 0);
    const totalColorantCost = ingredients.length
      ? Number(ingredients.reduce((s, ing) => s + (Number(ing.cost) || 0), 0).toFixed(2))
      : Number(((Number(pb.totalColorantCost) || 0) * scale).toFixed(2));
    const totalColorantLiters = ingredients.length
      ? Number(ingredients.reduce((s, ing) => s + (Number(ing.liters) || 0), 0).toFixed(4))
      : Number(((Number(pb.totalColorantLiters) || 0) * scale).toFixed(4));
    const totalColorantMl = Math.round(totalColorantLiters * 1000);
    const totalColorantPct = pb.totalColorantPct != null
      ? Number(pb.totalColorantPct)
      : Math.round(ingredients.reduce((s, ing) => s + (Number(ing.pct) || 0), 0) * 10) / 10;
    const totalFormulaPct = Math.round((basePct + totalColorantPct) * 10) / 10;

    const materialCost = Number((basePaintCost + totalColorantCost).toFixed(2));
    const serviceFee = Number(((Number(pb.serviceFee) || 0) * scale).toFixed(2));
    const grandTotal = lineTotal > 0 ? lineTotal : Number(((Number(pb.grandTotal) || (materialCost + serviceFee)) * scale).toFixed(2));
    const otherCharges = Number((grandTotal - materialCost - serviceFee).toFixed(2));

    return {
      colorName,
      detectedColorName: item.detectedColorName || '',
      hexColor,
      baseType: item.baseType || (basePaint && basePaint.type) || 'Base Paint',
      containerSizeLabel,
      isCustomizedFormula,
      originalCatalogName,
      basePaint,
      basePaintCost,
      basePct,
      ingredients,
      totalColorantCost,
      totalColorantLiters,
      totalColorantMl,
      totalColorantPct,
      totalFormulaPct,
      materialCost,
      serviceFee,
      otherCharges,
      grandTotal,
      totalLiters: currLiters
    };
  }

  // Priority 3: Legacy fallback for older historical sales that only saved `item.components`
  if (Array.isArray(item.components) && item.components.length) {
    let basePaint = null;
    let basePaintCost = 0;
    let basePct = 0;
    const ingredients = [];
    let totalColorantCost = 0;
    let totalColorantLiters = 0;
    let totalColorantPct = 0;

    item.components.forEach((c, idx) => {
      const pct = Number(c.percentage ?? c.pctNum ?? c.pct) || 0;
      const compLiters = Number(c.exactLiters) || Number((currLiters * (pct / 100)).toFixed(4));
      const ml = Number(c.ml) || Math.round(compLiters * 1000);
      const unitPrice = Number(c.price) || 0;
      const cost = c.cost != null ? Number(c.cost) : Number((compLiters * unitPrice).toFixed(2));
      const p = (!c.name || !c.colorName || !c.type) && c.productId && typeof productById === 'function' ? productById(c.productId) : null;
      const entry = {
        productId: c.productId || null,
        name: c.name || (p ? p.name : `Ingredient ${idx + 1}`),
        brand: c.brand || (p ? p.brand : ''),
        type: c.type || (p ? (p.type || p.category) : '') || item.baseType || 'Paint',
        colorName: c.colorName || c.color || (p && typeof getProductColorName === 'function' ? getProductColorName(p) : 'Color'),
        hex: c.hex || c.colorHex || (p && typeof getProductDefaultColor === 'function' ? getProductDefaultColor(p) : '#8E24AA'),
        liters: compLiters,
        ml,
        pct,
        unitPrice,
        cost
      };
      if (idx === 0 && !basePaint) {
        basePaint = entry;
        basePaintCost = cost;
        basePct = pct;
      } else {
        ingredients.push(entry);
        totalColorantCost += cost;
        totalColorantLiters += compLiters;
        totalColorantPct += pct;
      }
    });

    basePaintCost = Number(basePaintCost.toFixed(2));
    totalColorantCost = Number(totalColorantCost.toFixed(2));
    totalColorantLiters = Number(totalColorantLiters.toFixed(4));
    const totalColorantMl = Math.round(totalColorantLiters * 1000);
    totalColorantPct = Math.round(totalColorantPct * 10) / 10;
    const totalFormulaPct = Math.round((basePct + totalColorantPct) * 10) / 10;
    const materialCost = Number((basePaintCost + totalColorantCost).toFixed(2));
    const serviceFee = 50.00;
    const grandTotal = lineTotal > 0 ? lineTotal : Number((materialCost + serviceFee).toFixed(2));
    const otherCharges = Number((grandTotal - materialCost - serviceFee).toFixed(2));

    return {
      colorName,
      detectedColorName: item.detectedColorName || '',
      hexColor,
      baseType: item.baseType || (basePaint && basePaint.type) || 'Base Paint',
      containerSizeLabel,
      isCustomizedFormula,
      originalCatalogName,
      basePaint,
      basePaintCost,
      basePct,
      ingredients,
      totalColorantCost,
      totalColorantLiters,
      totalColorantMl,
      totalColorantPct,
      totalFormulaPct,
      materialCost,
      serviceFee,
      otherCharges,
      grandTotal,
      totalLiters: currLiters
    };
  }

  return null;
}
const getPosConfirmMixBreakdown = getCustomColorMixReceiptData;

/**
 * Freeze a permanent, immutable Custom Color Mix snapshot on a sale item at checkout time.
 * Stored inside `sales.items_json` so historical receipts never drift when catalog/inventory changes.
 */
function freezeColorMixReceiptSnapshot(item) {
  if (!item || item.type !== 'colormix') return item;
  const bd = getCustomColorMixReceiptData(item);
  if (!bd) return item;

  const frozenSnapshot = JSON.parse(JSON.stringify({
    colorName: bd.colorName,
    detectedColorName: bd.detectedColorName,
    hexColor: bd.hexColor,
    baseType: bd.baseType,
    containerSizeLabel: bd.containerSizeLabel,
    isCustomizedFormula: bd.isCustomizedFormula,
    originalCatalogName: bd.originalCatalogName,
    basePaint: bd.basePaint,
    basePaintCost: bd.basePaintCost,
    basePct: bd.basePct,
    ingredients: bd.ingredients,
    totalColorantCost: bd.totalColorantCost,
    totalColorantLiters: bd.totalColorantLiters,
    totalColorantMl: bd.totalColorantMl,
    totalColorantPct: bd.totalColorantPct,
    totalFormulaPct: bd.totalFormulaPct,
    materialCost: bd.materialCost,
    serviceFee: bd.serviceFee,
    otherCharges: bd.otherCharges,
    grandTotal: bd.grandTotal,
    totalLiters: bd.totalLiters,
    capturedAt: typeof nowISO === 'function' ? nowISO() : new Date().toISOString()
  }));

  item.containerSizeLabel = frozenSnapshot.containerSizeLabel;
  item.priceBreakdown = JSON.parse(JSON.stringify(frozenSnapshot));
  item.mixSnapshot = frozenSnapshot;
  if (Array.isArray(item.components)) {
    item.components = JSON.parse(JSON.stringify(item.components));
  }
  return item;
}

function renderPosConfirmMixBreakdownHtml(item, options = {}) {
  const breakdown = getCustomColorMixReceiptData(item);
  if (!breakdown) return '';

  const mode = options.mode || 'confirm'; // 'confirm' | 'receipt' | 'compact'
  const totalLiters = Number(breakdown.totalLiters) || Number(item.liters) || 1;
  const ingredients = Array.isArray(breakdown.ingredients) ? breakdown.ingredients : [];
  const otherCharges = Number(breakdown.otherCharges) || 0;
  const grandTotal = Number(breakdown.grandTotal) || Number(item.lineTotal) || 0;
  const totalFormulaPct = Number(breakdown.totalFormulaPct) || 100;
  const isReceipt = mode === 'receipt';
  const isCompact = mode === 'compact';

  return `
    <div class="pos-confirm-mix-breakdown ${isReceipt ? 'receipt-mode' : (isCompact ? 'compact-mode' : '')}">
      <!-- Card Header -->
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; margin-bottom:8px; padding-bottom:6px; border-bottom:1px solid var(--line);">
        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
          <span style="font-size:10.5px; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; color:var(--teal-dark);">🎨 Color Formula / Ingredients &amp; Price Breakdown</span>
          <span class="muted" style="font-size:10.5px; font-weight:600;">(${formatStock(totalLiters)} Liter${totalLiters === 1 ? '' : 's'})</span>
        </div>
        <div style="display:flex; align-items:center; gap:5px; flex-wrap:wrap;">
          ${breakdown.isCustomizedFormula ? `
            <span class="badge" style="background:var(--warning-bg); color:var(--warning-text); border:1px solid var(--warning-border); font-size:9.5px; padding:1px 6px; font-weight:700;">✏️ Customized Formula</span>
          ` : ''}
          <span class="badge ok" style="font-size:9.5px; padding:1.5px 7px; font-weight:700;">Formula Total: ${totalFormulaPct}%</span>
        </div>
      </div>

      <!-- 1. BASE PAINT DETAILS -->
      <div class="cm-breakdown-section" style="margin-bottom:8px; padding-bottom:7px; border-bottom:1px dashed var(--line);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:3px;">
          <div style="display:flex; align-items:center; gap:5px; flex-wrap:wrap;">
            <span style="display:inline-block; width:7px; height:7px; border-radius:50%; background:var(--teal); flex-shrink:0;"></span>
            <span style="font-weight:700; font-size:10.5px; color:var(--teal-dark); text-transform:uppercase; letter-spacing:0.04em;">Base Paint</span>
            ${breakdown.basePaint ? `
              <span class="badge" style="background:var(--teal-tint); color:var(--teal-dark); border:1px solid var(--teal-tint-border); font-size:9.5px; padding:1px 5px; font-weight:600;">
                ${escapeHtml(breakdown.basePaint.type || breakdown.baseType || 'Base Paint')}
              </span>
            ` : ''}
          </div>
          <strong style="font-family:'Space Grotesk',monospace; font-size:12px; font-weight:700; color:var(--ink);">
            ${peso(breakdown.basePaintCost)}
          </strong>
        </div>
        ${breakdown.basePaint ? `
          <div style="padding-left:12px; font-size:10.5px; color:var(--ink-soft); line-height:1.35;">
            <div style="font-weight:600; color:var(--ink);">
              ${escapeHtml(breakdown.basePaint.name)}
              ${breakdown.basePaint.brand ? `<span class="muted" style="font-weight:400;">(${escapeHtml(breakdown.basePaint.brand)})</span>` : ''}
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:4px; margin-top:2px;">
              <span class="muted">
                Base Color: <b>${escapeHtml(breakdown.basePaint.colorName)}</b>
                ${breakdown.basePaint.hex ? `<span style="display:inline-block; width:9px; height:9px; border-radius:50%; background:${breakdown.basePaint.hex}; border:1px solid rgba(0,0,0,0.18); vertical-align:middle; margin-left:3px;"></span>` : ''}
                ${Number(breakdown.basePaint.unitPrice) > 0 ? ` · Rate: ${peso(breakdown.basePaint.unitPrice)}/L` : ''}
              </span>
              <span style="font-weight:700; font-family:'Space Grotesk',monospace; color:var(--ink);">
                ${formatStock(breakdown.basePaint.liters)} L (${breakdown.basePaint.ml} mL) · ${breakdown.basePaint.pct}%
              </span>
            </div>
          </div>
        ` : `
          <div style="padding-left:12px; font-size:10.5px; color:var(--ink-soft); font-style:italic;">No base paint component in formula.</div>
        `}
      </div>

      <!-- 2. INDIVIDUAL COLORANTS / INGREDIENTS -->
      <div class="cm-breakdown-section" style="margin-bottom:8px; padding-bottom:7px; border-bottom:1px dashed var(--line);">
        <details open class="cm-ingredients-details">
          <summary style="display:flex; justify-content:space-between; align-items:center; cursor:pointer;">
            <div style="display:flex; align-items:center; gap:5px;">
              <span style="display:inline-block; width:7px; height:7px; border-radius:50%; background:#8E24AA; flex-shrink:0;"></span>
              <span style="font-weight:700; font-size:10.5px; color:var(--purple-text); text-transform:uppercase; letter-spacing:0.04em;">Colorants / Ingredients</span>
              <span class="badge" style="background:var(--purple-bg); color:var(--purple-text); border:1px solid var(--purple-border); font-size:9.5px; padding:1px 5px; font-weight:600;">
                ${ingredients.length} item${ingredients.length === 1 ? '' : 's'}
              </span>
              <span class="muted no-print" style="font-size:9.5px; opacity:0.75;">▾</span>
            </div>
            <strong style="font-family:'Space Grotesk',monospace; font-size:12px; font-weight:700; color:var(--ink);">
              ${peso(breakdown.totalColorantCost)}
            </strong>
          </summary>

          ${ingredients.length > 0 ? `
            <div style="padding-left:12px; display:flex; flex-direction:column; gap:4px; margin-top:5px;">
              ${ingredients.map(ing => `
                <div class="pos-mix-ing-card" style="background:var(--surface); border:1px solid var(--line); border-radius:5px; padding:4px 7px; font-size:10.5px;">
                  <div style="display:flex; justify-content:space-between; align-items:center; gap:4px;">
                    <div style="display:flex; align-items:center; gap:5px; min-width:0; overflow:hidden;">
                      <span style="display:inline-block; width:9px; height:9px; border-radius:50%; background:${ing.hex || '#8E24AA'}; border:1px solid rgba(0,0,0,0.18); flex-shrink:0;"></span>
                      <span style="font-weight:700; color:var(--ink); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(ing.name)}</span>
                      ${ing.brand ? `<span class="muted" style="font-size:9.5px;">(${escapeHtml(ing.brand)})</span>` : ''}
                    </div>
                    <strong style="font-family:'Space Grotesk',monospace; font-weight:700; color:var(--ink); flex-shrink:0;">
                      ${peso(ing.cost)}
                    </strong>
                  </div>
                  <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:4px; color:var(--ink-soft); font-size:10px; margin-top:1.5px;">
                    <span>Type: <b>${escapeHtml(ing.colorName || 'Pigment')}</b>${ing.type ? ` (${escapeHtml(ing.type)})` : ''}${Number(ing.unitPrice) > 0 ? ` · Rate: ${peso(ing.unitPrice)}/L` : ''}</span>
                    <span style="font-family:'Space Grotesk',monospace; font-weight:600; color:var(--ink);">
                      ${formatStock(ing.liters)} L (${ing.ml} mL) · ${ing.pct}%
                    </span>
                  </div>
                </div>
              `).join('')}

              <div class="pos-mix-colorant-summary" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:4px; font-size:10px; color:var(--purple-text); font-weight:600; padding:3px 6px; background:var(--purple-bg); border-radius:4px; margin-top:2px;">
                <span>Total Colorants: <b>${formatStock(breakdown.totalColorantLiters)} L (${breakdown.totalColorantMl} mL) · ${breakdown.totalColorantPct}%</b></span>
                <span>Total Colorant Cost: <b>${peso(breakdown.totalColorantCost)}</b></span>
              </div>
            </div>
          ` : `
            <div style="padding-left:12px; font-size:10.5px; color:var(--ink-soft); font-style:italic; margin-top:4px;">No additional colorants used in this formula.</div>
          `}
        </details>
      </div>

      <!-- 3. MATERIAL TOTAL & ADDITIONAL CHARGES -->
      <div class="cm-breakdown-section" style="margin-bottom:6px; font-size:10.5px;">
        <div style="display:flex; justify-content:space-between; align-items:center; padding:1.5px 0;">
          <span style="display:flex; align-items:center; gap:5px; color:var(--ink);">
            <span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#2E7D32;"></span>
            <span style="font-weight:600;">Total Material Cost:</span>
            <span class="muted" style="font-size:9.5px;">(Base + Colorants)</span>
          </span>
          <strong style="font-family:'Space Grotesk',monospace; font-weight:700; color:var(--ink);">${peso(breakdown.materialCost)}</strong>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; padding:1.5px 0;">
          <span style="display:flex; align-items:center; gap:5px; color:var(--ink);">
            <span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#E65100;"></span>
            <span>Mixing Service Fee:</span>
            <span class="muted" style="font-size:9.5px;">(Standard Fee)</span>
          </span>
          <strong style="font-family:'Space Grotesk',monospace; font-weight:700; color:var(--ink);">${peso(breakdown.serviceFee)}</strong>
        </div>

        ${(!isReceipt || otherCharges !== 0) ? `
          <div style="display:flex; justify-content:space-between; align-items:center; padding:1.5px 0;">
            <span style="display:flex; align-items:center; gap:5px; color:var(--ink);">
              <span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#78909C;"></span>
              <span>Other Charges:</span>
              <span class="muted" style="font-size:9.5px;">
                ${otherCharges > 0 ? '(Custom Adjustment)' : (otherCharges < 0 ? '(Custom Discount)' : '')}
              </span>
            </span>
            <strong style="font-family:'Space Grotesk',monospace; font-weight:700; color:var(--ink);">${peso(otherCharges)}</strong>
          </div>
        ` : ''}
      </div>

      <!-- 4. MIX GRAND TOTAL -->
      <div style="border-top:1.5px dashed var(--line); padding-top:6px; display:flex; justify-content:space-between; align-items:center; gap:8px;">
        <div>
          <div style="font-size:10.5px; font-weight:800; color:var(--teal-dark); text-transform:uppercase; letter-spacing:0.04em;">${isReceipt ? 'Custom Mix Subtotal' : 'Grand Total'}</div>
          <div class="muted small" style="font-size:9.5px;">
            Materials: ${peso(breakdown.materialCost)} + Service: ${peso(breakdown.serviceFee)}${otherCharges !== 0 ? ` + Other: ${peso(otherCharges)}` : ''}
          </div>
        </div>
        <div style="font-family:'Space Grotesk',sans-serif; font-size:${isReceipt || isCompact ? '15px' : '18px'}; font-weight:800; color:var(--teal-text); letter-spacing:-0.02em;">
          ${peso(grandTotal)}
        </div>
      </div>
    </div>
  `;
}
window.getCustomColorMixReceiptData = getCustomColorMixReceiptData;
window.renderCustomColorMixReceiptBreakdownHtml = renderPosConfirmMixBreakdownHtml;

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

    const { cashierName, customerName, items, totals } = data;

    const totalCount = items.reduce((sum, i) => sum + (Number(i.qty) || 1), 0);
    const totalLiters = items.reduce((sum, i) => {
      if (i.type === 'colormix') return sum + (Number(i.liters) || 0);
      return sum + ((Number(i.qty) || 0) * (Number(i.size) || 1));
    }, 0);

    const itemsRowsHtml = items.map(i => {
      if (i.type === 'colormix') {
        const hex = i.hexColor || '#1F6F6B';
        const breakdownHtml = renderPosConfirmMixBreakdownHtml(i, { mode: 'confirm' });
        const containerLbl = i.containerSizeLabel || `${fmtSize(i.liters || 1)} Mix`;
        return `
          <tr class="${breakdownHtml ? 'pos-confirm-mix-row' : ''}">
            <td>
              <div style="display:flex; align-items:center; gap:8px;">
                <span class="cm-color-dot" style="background:${hex}; width:16px; height:16px; border-radius:50%; flex-shrink:0; box-shadow:0 1px 3px rgba(0,0,0,0.2);" title="${hex}"></span>
                <div>
                  <div style="font-weight:600; color:var(--ink); display:flex; align-items:center; gap:5px; flex-wrap:wrap;">
                    <span>Custom Color Mix — ${escapeHtml(i.colorName || 'Special Blend')}</span>
                    <code style="font-family:'Space Grotesk',monospace; font-size:11px; font-weight:600; color:var(--teal-text);">(${escapeHtml(hex)})</code>
                  </div>
                  <div class="muted small" style="font-size:11px; color:var(--ink-soft);">
                    ${escapeHtml(i.baseType || 'Custom Paint Mix')} · Total Volume: <b>${formatStock(i.liters || 1)} L</b>${i.isCustomizedFormula ? ' · <b>Customized Formula</b>' : ''}
                  </div>
                </div>
              </div>
            </td>
            <td style="text-align:center;">
              <span class="badge" style="background:var(--surface-3); border:1px solid var(--line); font-size:11.5px; padding:2px 7px; font-weight:600;">
                ${escapeHtml(containerLbl)}
              </span>
            </td>
            <td style="text-align:center;">
              <strong style="font-size:13px;">${formatStock(i.qty || 1)}</strong>
              <div class="muted small" style="font-size:10.5px;">${formatStock(i.liters || 1)} L</div>
            </td>
            <td style="text-align:right; font-family:'Space Grotesk',monospace;">${peso(i.unitPrice)}</td>
            <td style="text-align:right; font-weight:700; font-family:'Space Grotesk',monospace; color:var(--ink);">${peso(i.lineTotal)}</td>
          </tr>
          ${breakdownHtml ? `
            <tr class="pos-confirm-breakdown-row">
              <td colspan="5">
                ${breakdownHtml}
              </td>
            </tr>
          ` : ''}`;
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
                  <span style="font-weight:600; color:var(--ink);">${escapeHtml(i.name)} <code style="font-family:'Space Grotesk',monospace; font-size:11px; font-weight:600; color:var(--teal-text);">(${hex})</code></span>
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
              <span class="badge" style="background:var(--surface-3); border:1px solid var(--line); font-size:11.5px; padding:2px 7px; font-weight:600;">
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

    const totalDue = Number(totals.total) || 0;
    const commonBills = [20, 50, 100, 200, 500, 1000, 1500, 2000, 3000, 5000, 10000];
    const nextBills = commonBills.filter(b => b > totalDue);
    const next100 = Math.ceil(totalDue / 100) * 100;
    if (next100 > totalDue && !nextBills.includes(next100)) nextBills.unshift(next100);
    const next500 = Math.ceil(totalDue / 500) * 500;
    if (next500 > totalDue && !nextBills.includes(next500)) nextBills.push(next500);
    nextBills.sort((a, b) => a - b);
    const quickBills = [...new Set(nextBills)].slice(0, 4);

    const bodyHtml = `
      <div class="pos-confirm-wrapper">
        <div class="pos-confirm-notice">
          <span class="pcn-icon">🔍</span>
          <div style="flex:1;">
            <div class="pcn-title">Order Verification: Are the purchased items accurate?</div>
            <div class="pcn-desc">
              Please review to confirm that paint products, color shades, container sizes, quantities, and totals are correct before completing the sale and printing the receipt.
            </div>
          </div>
        </div>

        <div style="background:var(--surface-2); border:1px solid var(--line); border-radius:8px; padding:10px 14px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; font-size:12.5px;">
          <div>
            <span class="muted">Cashier:</span> <strong>${escapeHtml(cashierName)}</strong>
            ${((customerName || '').trim()) ? `<span style="margin-left:14px;"><span class="muted">Customer:</span> <strong>${escapeHtml(customerName.trim())}</strong></span>` : ''}
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

        <div class="pos-confirm-payment-box" style="background:var(--surface-2); border:1.5px solid var(--line); border-radius:10px; padding:14px; margin-top:14px;">
          <div style="display:flex; justify-content:space-between; font-size:13px; padding:3px 0;">
            <span class="muted">Subtotal:</span>
            <span style="font-weight:600; font-family:'Space Grotesk',monospace;">${peso(totals.subtotal)}</span>
          </div>
          ${(totals.discountAmount > 0) ? `
            <div style="display:flex; justify-content:space-between; font-size:13px; padding:3px 0; color:var(--teal-text, #1F6F6B);">
              <span>Discount (${totals.discountPct}%):</span>
              <span style="font-weight:700; font-family:'Space Grotesk',monospace;">-${peso(totals.discountAmount)}</span>
            </div>
            <div style="display:inline-flex; align-items:center; gap:5px; background:var(--teal-tint); border:1px solid var(--teal-tint-border); color:var(--teal-dark); padding:3px 8px; border-radius:4px; font-size:11px; font-weight:700; margin:4px 0 2px;">
              <span>🎉</span>
              <span>10% Discount Applied!</span>
            </div>
          ` : ''}

          <!-- Philippine BIR VAT Breakdown in Confirmation Modal -->
          <div style="border-top:1px dashed var(--line); border-bottom:1px dashed var(--line); padding:6px 0; margin:6px 0; font-size:12.5px;">
            ${(totals.taxStatus !== 'non_vat') ? `
              <div style="display:flex; justify-content:space-between; padding:2px 0;">
                <span class="muted">VATable Sales:</span>
                <span style="font-family:'Space Grotesk',monospace; font-weight:600;">${peso(totals.vatableSales || 0)}</span>
              </div>
              <div style="display:flex; justify-content:space-between; padding:2px 0;">
                <span class="muted">VAT Amount (${totals.vatRate || 12}%):</span>
                <span style="font-family:'Space Grotesk',monospace; font-weight:700; color:var(--teal-text, #1F6F6B);">${peso(totals.vatAmount || 0)}</span>
              </div>
              ${(Number(totals.vatExemptSales || 0) > 0) ? `
                <div style="display:flex; justify-content:space-between; padding:2px 0;">
                  <span class="muted">VAT-Exempt Sales:</span>
                  <span style="font-family:'Space Grotesk',monospace; font-weight:600;">${peso(totals.vatExemptSales)}</span>
                </div>
              ` : `
                <div style="display:flex; justify-content:space-between; padding:2px 0;">
                  <span class="muted">VAT-Exempt Sales:</span>
                  <span style="font-family:'Space Grotesk',monospace; color:var(--ink-soft);">₱0.00</span>
                </div>
              `}
              ${(Number(totals.zeroRatedSales || 0) > 0) ? `
                <div style="display:flex; justify-content:space-between; padding:2px 0;">
                  <span class="muted">Zero-Rated Sales:</span>
                  <span style="font-family:'Space Grotesk',monospace; font-weight:600;">${peso(totals.zeroRatedSales)}</span>
                </div>
              ` : ''}
            ` : `
              <div style="display:flex; justify-content:space-between; padding:2px 0;">
                <span class="muted">Tax Classification:</span>
                <span class="badge" style="background:var(--surface-3); border:1px solid var(--line); font-size:11px; font-weight:600;">Non-VAT Registered (0% VAT)</span>
              </div>
            `}
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; margin-top:2px;">
            <span style="font-size:15px; font-weight:700; color:var(--ink);">Total Amount Due:</span>
            <span id="pos-confirm-total-due" data-amount="${totalDue}" style="font-size:22px; font-weight:800; font-family:'Space Grotesk',monospace; color:var(--teal-text);">${peso(totalDue)}</span>
          </div>

          <!-- Cash Payment Section (Cash Only Store Policy) -->
          <div style="margin-top:12px; padding-top:12px; border-top:2px solid var(--line);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <label for="pos-cash-tendered-input" style="font-weight:700; font-size:13px; color:var(--ink); display:flex; align-items:center; gap:6px;">
                <span>💵 Cash Tendered (Halagang Ibinayad):</span>
              </label>
              <span class="badge" style="background:var(--teal-tint); color:var(--teal-dark); border:1px solid var(--teal-tint-border); font-size:11px; font-weight:700;">STORE POLICY: CASH ONLY</span>
            </div>

            <div style="position:relative; margin-bottom:8px;">
              <span style="position:absolute; left:12px; top:50%; transform:translateY(-50%); font-weight:700; font-size:18px; color:var(--ink-soft);">₱</span>
              <input type="number" id="pos-cash-tendered-input" step="any" min="0" placeholder="0.00"
                style="width:100%; padding:10px 14px 10px 32px; font-size:18px; font-weight:700; font-family:'Space Grotesk',monospace; border:2px solid var(--teal); border-radius:8px; box-sizing:border-box; outline:none;"
                oninput="onPosCashTenderedChange()" onkeydown="onPosCashTenderedKey(event)">
            </div>

            <!-- Quick Cash Buttons -->
            <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:12px;">
              <span class="muted small" style="align-self:center; margin-right:4px; font-size:11px;">Quick Cash:</span>
              <button type="button" class="btn ghost small" style="padding:4px 10px; font-size:12px; font-weight:700; border:1px solid var(--teal); background:var(--teal-tint); color:var(--teal-text);"
                onclick="setPosQuickCash(${totalDue})">
                Exact (${peso(totalDue)})
              </button>
              ${quickBills.map(b => `
                <button type="button" class="btn ghost small" style="padding:4px 10px; font-size:12px; font-weight:600; border:1px solid var(--line); background:var(--surface);"
                  onclick="setPosQuickCash(${b})">
                  ${peso(b)}
                </button>
              `).join('')}
            </div>

            <!-- Real-time Change Feedback Banner -->
            <div id="pos-change-banner" style="background:var(--danger-bg); border:1.5px solid var(--danger-border); border-radius:8px; padding:10px 14px; display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:13px; font-weight:600; color:var(--danger-text);" id="pos-change-label">⚠️ Please enter cash tendered</span>
              <span id="pos-change-val" style="font-size:18px; font-weight:800; font-family:'Space Grotesk',monospace; color:var(--danger-text);">₱0.00</span>
            </div>
          </div>
        </div>

        <div style="font-size:12px; color:var(--ink-soft); display:flex; align-items:center; gap:8px; padding:6px 4px 2px;">
          <span style="color:var(--teal-text); font-weight:bold; font-size:14px;">✔</span>
          <span>Ensure payment is received and change is counted before finalizing transaction.</span>
        </div>
      </div>
    `;

    const footHtml = `
      <button type="button" class="btn secondary" id="btn-cancel-pos-confirm" onclick="cancelPosConfirm()" style="padding:10px 16px;">
        ✕ Edit / Modify Cart
      </button>
      <button type="button" class="btn" id="btn-submit-pos-confirm" onclick="acceptPosConfirm()" disabled style="background:linear-gradient(135deg, #1F6F6B 0%, #165653 100%); font-weight:700; padding:10px 22px; font-size:14px; box-shadow:0 3px 8px rgba(31,111,107,0.3); opacity:0.5; cursor:not-allowed;">
        ✓ Confirm &amp; Finalize Sale
      </button>
    `;

    openModal('🛒 Confirm Purchase & Cash Payment', bodyHtml, footHtml, 'pos-confirm-modal');

    setTimeout(() => {
      const input = document.getElementById('pos-cash-tendered-input');
      if (input) input.focus();
    }, 80);
  });
}

function onPosCashTenderedChange() {
  const totalEl = document.getElementById('pos-confirm-total-due');
  const inputEl = document.getElementById('pos-cash-tendered-input');
  const bannerEl = document.getElementById('pos-change-banner');
  const labelEl = document.getElementById('pos-change-label');
  const valEl = document.getElementById('pos-change-val');
  const submitBtn = document.getElementById('btn-submit-pos-confirm');
  if (!totalEl || !inputEl || !bannerEl || !labelEl || !valEl || !submitBtn) return;

  const total = Number(totalEl.dataset.amount) || 0;
  const rawVal = inputEl.value.trim();
  const tendered = Number(rawVal);

  if (rawVal === '' || isNaN(tendered) || tendered <= 0) {
    bannerEl.style.background = 'var(--danger-bg)';
    bannerEl.style.borderColor = 'var(--danger-border)';
    labelEl.style.color = 'var(--danger-text)';
    labelEl.innerHTML = '⚠️ Please enter cash tendered';
    valEl.style.color = 'var(--danger-text)';
    valEl.textContent = '₱0.00';
    submitBtn.disabled = true;
    submitBtn.style.opacity = '0.5';
    submitBtn.style.cursor = 'not-allowed';
    return;
  }

  const change = Number((tendered - total).toFixed(2));

  if (change < 0) {
    const lacking = Math.abs(change);
    bannerEl.style.background = 'var(--danger-bg)';
    bannerEl.style.borderColor = 'var(--danger-border)';
    labelEl.style.color = 'var(--danger-text)';
    labelEl.innerHTML = `⚠️ Insufficient Cash (Shortage)`;
    valEl.style.color = 'var(--danger-text)';
    valEl.textContent = `-${peso(lacking)}`;
    submitBtn.disabled = true;
    submitBtn.style.opacity = '0.5';
    submitBtn.style.cursor = 'not-allowed';
  } else {
    bannerEl.style.background = 'var(--teal-tint)';
    bannerEl.style.borderColor = 'var(--teal-tint-border)';
    labelEl.style.color = 'var(--teal-dark)';
    labelEl.innerHTML = `✓ Change Due:`;
    valEl.style.color = 'var(--teal-dark)';
    valEl.textContent = peso(change);
    submitBtn.disabled = false;
    submitBtn.style.opacity = '1';
    submitBtn.style.cursor = 'pointer';
  }
}

function setPosQuickCash(amt) {
  const inputEl = document.getElementById('pos-cash-tendered-input');
  if (!inputEl) return;
  inputEl.value = Number(amt).toFixed(2);
  onPosCashTenderedChange();
  inputEl.focus();
}

function onPosCashTenderedKey(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    const submitBtn = document.getElementById('btn-submit-pos-confirm');
    if (submitBtn && !submitBtn.disabled) {
      acceptPosConfirm();
    }
  }
}

function acceptPosConfirm() {
  const inputEl = document.getElementById('pos-cash-tendered-input');
  const totalEl = document.getElementById('pos-confirm-total-due');
  const total = totalEl ? (Number(totalEl.dataset.amount) || 0) : 0;
  const tendered = inputEl ? Number(inputEl.value.trim() || 0) : 0;
  if (tendered < total) {
    showToast('Cannot complete sale: Cash tendered is less than total amount due.', 'error');
    if (inputEl) inputEl.focus();
    return;
  }
  const change = Number((tendered - total).toFixed(2));

  window.removeEventListener('keydown', posConfirmKeyHandler);
  const btn = document.getElementById('btn-submit-pos-confirm');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '⏳ Processing sale…';
  }
  if (typeof posConfirmPromiseResolve === 'function') {
    const fn = posConfirmPromiseResolve;
    posConfirmPromiseResolve = null;
    fn({ confirmed: true, cashTendered: tendered, changeAmount: change, paymentMethod: 'Cash' });
  }
  closeModal();
}

function cancelPosConfirm() {
  window.removeEventListener('keydown', posConfirmKeyHandler);
  if (typeof posConfirmPromiseResolve === 'function') {
    const fn = posConfirmPromiseResolve;
    posConfirmPromiseResolve = null;
    fn({ confirmed: false });
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
    const prodRefMap = {};

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
        prodRefMap[p.id] = p;
        const sizeKey = `${p.id}_${size}`;
        reqCansByProdSize[sizeKey] = (reqCansByProdSize[sizeKey] || 0) + qty;
        reqSealedLitersByProd[p.id] = Number(((reqSealedLitersByProd[p.id] || 0) + liters).toFixed(2));

        if (productHasCanBreakdown(p) && reqCansByProdSize[sizeKey] > productCanCount(p, size)) {
          showToast(`Not enough ${size}L units for ${p.name} (only ${productCanCount(p, size)} in stock).`, 'error');
          return;
        }
        if (reqSealedLitersByProd[p.id] > p.stock + 1e-6) {
          showToast(`Not enough stock for ${p.name} (${formatLiters(p.stock)} available).`, 'error');
          return;
        }
      } else if (c.type === 'colormix' && c.components && c.components.length) {
        for (const comp of c.components) {
          const p = productById(comp.productId);
          if (p) {
            prodRefMap[p.id] = p;
            reqMixLitersByProd[p.id] = Number(((reqMixLitersByProd[p.id] || 0) + (Number(comp.liters) || 0)).toFixed(2));
          }
        }
      }
    }
    // Cross-validate combined sealed + colormix ingredient requirements in order-independent pass
    for (const pid of Object.keys(prodRefMap)) {
      const p = prodRefMap[pid];
      const combinedReq = Number(((reqSealedLitersByProd[pid] || 0) + (reqMixLitersByProd[pid] || 0)).toFixed(2));
      const totalAvail = Number(productMixAvailableStock(p).toFixed(2));
      if (combinedReq > totalAvail + 1e-6) {
        showToast(`Not enough combined stock for "${p.name}" (${formatStock(totalAvail)}L available, need ${formatStock(combinedReq)}L across sale & color mix).`, 'error');
        return;
      }
    }

    // Prompt cashier to confirm if purchase is correct and collect cash payment
    const custInput = document.getElementById('pos-customer-name');
    const rawCustomerName = custInput ? custInput.value : currentSaleCustomerName;
    const cleanCustomerName = (rawCustomerName || '').trim().slice(0, 150);
    const customerName = cleanCustomerName !== '' ? cleanCustomerName : null;

    const confirmRes = await promptCustomerPurchaseConfirmation({
      cashierName: (currentUser && currentUser.name) || 'Cashier',
      customerName: customerName || '',
      items,
      totals: t
    });

    if (!confirmRes || !confirmRes.confirmed) {
      showToast('Returned to cart. You can review or modify items.', 'info');
      return;
    }

    const receiptNo = generateReceiptNo();
    const cashTendered = Number(confirmRes.cashTendered) || t.total;
    const changeAmount = Number(confirmRes.changeAmount) || 0;

    // Freeze permanent immutable Custom Color Mix snapshots at the exact moment of sale
    // so historical receipts never change when Color Library, catalog, or inventory changes later.
    items.forEach(it => {
      if (it && it.type === 'colormix') {
        freezeColorMixReceiptSnapshot(it);
      }
    });

    const sale = {
      id: uid('sale'),
      receiptNo,
      date: nowISO(),
      customerName: customerName || null,
      customer_name: customerName || null,
      cashierId: (currentUser && currentUser.id) || null,
      cashierName: (currentUser && currentUser.name) || 'Cashier',
      paymentMethod: 'Cash',
      cashTendered,
      changeAmount,
      items,
      subtotal: t.subtotal,
      discountPct: t.discountPct,
      discountPercentage: t.discountPct,
      discountAmount: t.discountAmount,
      discount: t.discountAmount,
      vatRate: t.vatRate,
      vat_rate: t.vatRate,
      vatableSales: t.vatableSales,
      vatable_sales: t.vatableSales,
      vatAmount: t.vatAmount,
      vat_amount: t.vatAmount,
      vatExemptSales: t.vatExemptSales,
      vat_exempt_sales: t.vatExemptSales,
      zeroRatedSales: t.zeroRatedSales,
      zero_rated_sales: t.zeroRatedSales,
      taxStatus: t.taxStatus,
      tax_status: t.taxStatus,
      pricingType: t.pricingType,
      pricing_type: t.pricingType,
      total: t.total,
      status: 'completed',
    };
    const prevSalesLen = db.sales.length;
    const prevMovesLen = db.movements.length;
    const prodSnapshots = Object.keys(prodRefMap).map(pid => {
      const p = prodRefMap[pid];
      return {
        p,
        stock: p.stock,
        canStock: p.canStock ? JSON.parse(JSON.stringify(p.canStock)) : p.canStock,
        openedStock: p.openedStock,
        openedCanSize: p.openedCanSize,
        openedBySize: p.openedBySize ? JSON.parse(JSON.stringify(p.openedBySize)) : p.openedBySize
      };
    });

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
          trailNote = ` · ${size}L Units: ${beforeCans}→${afterCans}, Stock: ${formatStock(beforeStock)}L→${formatStock(p.stock)}L`;
          saleStockChanges.push({
            field: `${p.name} (${size}L)`,
            oldValue: `${beforeCans} units (${formatStock(beforeStock)}L)`,
            newValue: `${afterCans} units (${formatStock(p.stock)}L)`
          });
        }
        const targetBatchId = c.selectedBatchId || c.nearExpiryBatchId || c.regularBatchId || null;
        const targetBatchNumber = c.selectedBatchNumber || c.nearExpiryBatchNumber || c.regularBatchNumber || null;
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
          batch: targetBatchId ? { batchId: targetBatchId, batchNumber: targetBatchNumber } : undefined,
          note: `Sold via POS (${receiptNo}) [Sold ${count} × ${size}L${targetBatchNumber ? ` · Batch ${targetBatchNumber}` : ''}${trailNote}]`,
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
              comp.containerSource = mixNoteExtra ? mixNoteExtra.replace(/^[ ·\[]+|[ ·\]]+$/g, '').trim() : (comp.preferredCanSize ? `${comp.preferredCanSize}L container` : '');
              if (!comp.colorName && typeof getProductColorName === 'function') {
                comp.colorName = getProductColorName(p);
                comp.color = comp.colorName;
              }
              if (!comp.hex && typeof getProductDefaultColor === 'function') {
                comp.hex = getProductDefaultColor(p);
                comp.colorHex = comp.hex;
              }
              saleStockChanges.push({
                field: `${p.name} (Mix Ingredient)`,
                oldValue: `${formatStock(beforeStock)}L`,
                newValue: `${formatStock(p.stock)}L`
              });
              db.movements.push({
                id: uid('mv'),
                date: sale.date,
                type: 'colormix',
                productId: p.productId || p.id,
                product_id: p.productId || p.id,
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
          hexColor: c.hexColor || null,
          colorHex: c.hexColor || null,
          detectedColorName: c.detectedColorName || null,
          receiptNo: receiptNo,
          components: c.components || [],
          formulaJson: JSON.stringify(c.components || []),
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
      `Completed sale ${receiptNo}${customerName ? ' for ' + customerName : ''} — ${items.length} item(s): ${itemSummaryText} · Total: ${peso(sale.total)}`,
      {
        entityName: `Receipt ${receiptNo}`,
        fieldChanged: 'POS Sales Checkout',
        oldValue: saleStockChanges.length ? saleStockChanges.map(sc => `${sc.field}: ${sc.oldValue}`).join(' · ') : `Subtotal: ${peso(sale.subtotal)}`,
        newValue: `${peso(sale.total)} — ${items.length} item(s)`,
        referenceNo: receiptNo,
        reason: 'POS Sale Checkout',
        meta: {
          receiptNo,
          customerName: customerName || null,
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

    const saved = await saveDB();
    if (!saved) {
      db.sales.length = prevSalesLen;
      db.movements.length = prevMovesLen;
      prodSnapshots.forEach(snap => {
        snap.p.stock = snap.stock;
        snap.p.canStock = snap.canStock;
        snap.p.openedStock = snap.openedStock;
        snap.p.openedCanSize = snap.openedCanSize;
        snap.p.openedBySize = snap.openedBySize;
        if (typeof syncProductVariants === 'function') syncProductVariants(snap.p);
      });
      return;
    }
    cart = [];
    posLoadBatchStatus(true);
    currentSaleCustomerName = '';
    const custInp = document.getElementById('pos-customer-name');
    if (custInp) custInp.value = '';
    renderApp();
    showReceipt(sale);
  } finally {
    window._isCompletingSale = false;
    const btn = document.getElementById('btn-complete-sale');
    if (btn) {
      btn.innerHTML = '✓ Complete &amp; Print Receipt';
    }
    updateCheckoutButtonState();
  }
}

function showReceipt(sale) {
  if (!sale) return;
  if (currentUser && currentUser.role === 'cashier' && typeof isCurrentUserSale === 'function' && !isCurrentUserSale(sale)) {
    if (typeof showToast === 'function') {
      showToast('Access denied: You are restricted from viewing other cashiers\' receipts.', 'error');
    }
    return;
  }
  window._activeReceiptSale = sale;
  const receiptNo = getReceiptNo(sale);
  const returnedVal = typeof getSaleReturnedValue === 'function' ? getSaleReturnedValue(sale) : Number(sale.refundTotal || 0);
  const exchangeTotal = typeof getSaleExchangeTotal === 'function' ? getSaleExchangeTotal(sale) : 0;
  const refundTotal = Number(sale.refundTotal || 0);
  const netTotal = Number((sale.total - refundTotal).toFixed(2));
  const status = sale.status || 'completed';

  const itemsHtml = (sale.items || []).map(i => {
    if (i.type === 'colormix') {
      const mixData = getCustomColorMixReceiptData(i);
      const hex = (mixData && mixData.hexColor) || i.hexColor || '#1F6F6B';
      const colorName = (mixData && mixData.colorName) || i.colorName || 'Special Blend';
      const baseType = (mixData && mixData.baseType) || i.baseType || 'Custom Paint Mix';
      const liters = (mixData && mixData.totalLiters) || Number(i.liters) || Number(i.qty) || 1;
      const containerLbl = (mixData && mixData.containerSizeLabel) || i.containerSizeLabel || `${fmtSize(liters)} Mix`;
      const isCustomized = Boolean((mixData && mixData.isCustomizedFormula) || i.isCustomizedFormula);
      const breakdownHtml = renderPosConfirmMixBreakdownHtml(i, { mode: 'receipt' });

      return `
      <tr class="${breakdownHtml ? 'pos-receipt-mix-row' : ''}">
        <td>
          <div style="font-weight:700; color:var(--ink); display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
            <span class="cm-color-dot" style="background:${hex}; width:12px; height:12px; border-radius:50%; display:inline-block; border:1px solid rgba(0,0,0,0.18); flex-shrink:0;" title="${escapeAttr(hex)}"></span>
            <span>Custom Color Mix — ${escapeHtml(colorName)}</span>
            <span style="font-family:'Space Grotesk',monospace; font-size:11px; font-weight:600; color:var(--teal-text);">(${escapeHtml(hex)})</span>
          </div>
          <div style="font-size:11px; color:var(--ink-soft); margin-top:2px;">
            <span>${escapeHtml(baseType)} · Container: <b>${escapeHtml(containerLbl)}</b> · Total Volume: <b>${formatStock(liters)} L</b></span>
            ${isCustomized ? ` · <span style="color:var(--warning-text); font-weight:700;">Customized Formula</span>` : ''}
          </div>
          ${i.returnedQty ? `<div style="margin-top:2px;"><span class="badge sale-refunded" style="font-size:10px; padding:1px 6px;">${formatStock(i.returnedQty)} returned / exchanged</span></div>` : ''}
        </td>
        <td class="right num">${formatStock(i.qty || 1)}<div style="font-size:10px; font-weight:500; color:var(--ink-soft);">${formatStock(liters)} L</div></td>
        <td class="right num">${peso(i.unitPrice)}</td>
        <td class="right num" style="font-weight:700;">${peso(i.lineTotal)}</td>
      </tr>
      ${breakdownHtml ? `
        <tr class="pos-receipt-mix-breakdown-row">
          <td colspan="4">
            ${breakdownHtml}
          </td>
        </tr>
      ` : ''}`;
    }

    const p = i.productId ? productById(i.productId) : null;
    const size = Number(i.size) || (i.type === 'product' ? 1 : null);
    const sizeLabel = size ? ` · ${fmtSize(size)}` : '';
    const litersText = size ? ` (${(i.qty * size).toFixed(2)} L)` : '';
    const hex = i.hexColor || (p ? getProductHex(p) : '');
    const colorLabel = i.colorName || (i.color && i.color !== '-' ? i.color : (p && p.color && p.color !== '-' ? p.color : ''));

    return `
    <tr>
      <td>
        <div style="font-weight:700; color:var(--ink); display:flex; align-items:center; gap:6px;">
          ${hex ? `<span class="cm-color-dot" style="background:${hex}; width:12px; height:12px; border-radius:50%; display:inline-block; border:1px solid rgba(0,0,0,0.15);" title="${hex}"></span>` : ''}
          ${escapeHtml(i.name)}
          ${hex ? `<span style="font-family:'Space Grotesk',monospace; font-size:11px; font-weight:600; color:var(--teal-dark);">(${hex})</span>` : ''}
        </div>
        <div style="font-size:11px; color:var(--ink-soft); margin-top:2px;">
          <span>${escapeHtml(i.brand || (p && p.brand) || '')}${sizeLabel}${litersText}</span>
          ${colorLabel ? ` · Color: <b>${escapeHtml(colorLabel)}</b>` : ''}
        </div>
        ${(Number(i.nearExpiryDiscountPct) > 0) ? `
          <div style="font-size:10.5px; color:var(--success-text); margin-top:2px;">
            🏷️ Near-Expiry Discount: -${Number(i.nearExpiryDiscountPct)}% (Orig: ${peso(i.originalUnitPrice || i.unitPrice)}, Saved: ${peso(i.nearExpiryDiscountAmount || 0)})${i.nearExpiryBatchNumber ? ` · Batch ${escapeHtml(i.nearExpiryBatchNumber)}` : ''}
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
      <img src="assets/images/logo.png" alt="MRGR Logo" style="width:48px; height:48px; border-radius:50%; margin:0 auto 8px auto; display:block; object-fit:cover;">
      <div class="pos-receipt-title">MRGR COLOR CENTER</div>
      <div class="pos-receipt-sub">Paint &amp; Color Formulation Specialists</div>
      <div class="pos-receipt-sub" style="font-size:11px; margin-top:2px;">Official Sales Receipt</div>
      <div class="pos-receipt-badge">Receipt #: <span>${escapeHtml(receiptNo)}</span></div>
      ${status === 'voided' ? `
        <div style="background:var(--danger-bg); border:2px dashed #C1443D; border-radius:8px; padding:10px 14px; margin-top:10px; text-align:center;">
          <div style="font-size:16px; font-weight:800; color:var(--danger-text); letter-spacing:0.05em;">*** TRANSACTION VOIDED ***</div>
          <div style="font-size:11.5px; color:var(--danger-text); margin-top:3px;">
            Voided on <b>${formatDateTime(sale.voidedAt || sale.date)}</b> by <b>${escapeHtml(sale.voidedBy || 'Admin')}</b>
          </div>
          ${sale.voidReason ? `<div style="font-size:11.5px; color:var(--danger-text); margin-top:2px;">Reason: <i>${escapeHtml(sale.voidReason)}</i></div>` : ''}
          <div style="font-size:10.5px; color:var(--danger-text); margin-top:3px;">All stock units have been reversed and restored to inventory.</div>
        </div>
      ` : ''}
    </div>

    <div class="pos-receipt-meta">
      <div>
        <div><span class="muted">Date &amp; Time:</span> <b>${formatDateTime(sale.date)}</b></div>
        <div style="margin-top:3px;"><span class="muted">Cashier:</span> <b>${escapeHtml(sale.cashierName)}</b></div>
        ${((sale.customerName || sale.customer_name || '').trim()) ? `<div style="margin-top:3px;"><span class="muted">Customer:</span> <b>${escapeHtml((sale.customerName || sale.customer_name).trim())}</b></div>` : ''}
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
      ${(Number(sale.discountAmount || sale.discount || 0) > 0) ? `
        <div class="pos-receipt-total-row" style="color:var(--teal-text, #1F6F6B);">
          <span class="muted">Discount (${Number(sale.discountPct || sale.discountPercentage || 10)}%):</span>
          <span class="num" style="font-weight:700;">-${peso(Number(sale.discountAmount || sale.discount || 0))}</span>
        </div>
      ` : ''}

      <!-- Philippine BIR VAT Breakdown on Receipt -->
      ${(() => {
      const vatRate = sale.vatRate !== undefined ? Number(sale.vatRate) : (sale.vat_rate !== undefined ? Number(sale.vat_rate) : null);
      const vatableSales = sale.vatableSales !== undefined ? Number(sale.vatableSales) : (sale.vatable_sales !== undefined ? Number(sale.vatable_sales) : null);
      const vatAmount = sale.vatAmount !== undefined ? Number(sale.vatAmount) : (sale.vat_amount !== undefined ? Number(sale.vat_amount) : null);
      const vatExemptSales = sale.vatExemptSales !== undefined ? Number(sale.vatExemptSales) : (sale.vat_exempt_sales !== undefined ? Number(sale.vat_exempt_sales) : 0);
      const zeroRatedSales = sale.zeroRatedSales !== undefined ? Number(sale.zeroRatedSales) : (sale.zero_rated_sales !== undefined ? Number(sale.zero_rated_sales) : 0);
      const taxStatus = sale.taxStatus || sale.tax_status || (vatRate === 0 ? 'non_vat' : 'vat_registered');

      if (vatAmount === null || isNaN(vatAmount)) return '';

      if (taxStatus !== 'non_vat') {
        return `
            <div style="border-top:1px dashed var(--line, #ddd); border-bottom:1px dashed var(--line, #ddd); padding:4px 0; margin:4px 0; font-size:11.5px;">
              <div class="pos-receipt-total-row" style="padding:1px 0;">
                <span class="muted">VATable Sales:</span>
                <span class="num">${peso(vatableSales || 0)}</span>
              </div>
              <div class="pos-receipt-total-row" style="padding:1px 0;">
                <span class="muted">VAT Amount (${vatRate || 12}%):</span>
                <span class="num" style="font-weight:700; color:var(--teal-text, #1F6F6B);">${peso(vatAmount || 0)}</span>
              </div>
              ${(vatExemptSales > 0) ? `
                <div class="pos-receipt-total-row" style="padding:1px 0;">
                  <span class="muted">VAT-Exempt Sales:</span>
                  <span class="num">${peso(vatExemptSales)}</span>
                </div>
              ` : `
                <div class="pos-receipt-total-row" style="padding:1px 0;">
                  <span class="muted">VAT-Exempt Sales:</span>
                  <span class="num">₱0.00</span>
                </div>
              `}
              ${(zeroRatedSales > 0) ? `
                <div class="pos-receipt-total-row" style="padding:1px 0;">
                  <span class="muted">Zero-Rated Sales:</span>
                  <span class="num">${peso(zeroRatedSales)}</span>
                </div>
              ` : ''}
            </div>
          `;
      } else {
        return `
            <div style="border-top:1px dashed var(--line, #ddd); border-bottom:1px dashed var(--line, #ddd); padding:4px 0; margin:4px 0; font-size:11.5px;">
              <div class="pos-receipt-total-row" style="padding:1px 0;">
                <span class="muted">Tax Classification:</span>
                <span style="font-size:11px; font-weight:600;">Non-VAT Registered</span>
              </div>
            </div>
          `;
      }
    })()}

      <div class="pos-receipt-total-row ${(returnedVal > 0 || refundTotal > 0) ? '' : 'grand'}">
        <span>Total Amount Due:</span>
        <span class="grand-val">${peso(sale.total)}</span>
      </div>
      ${(returnedVal > 0 || refundTotal > 0) ? `
        <div class="pos-receipt-total-row" style="color:var(--danger);"><span class="muted">Returned Credit:</span><span class="num">-${peso(returnedVal || refundTotal)}</span></div>
        ${exchangeTotal > 0 ? `<div class="pos-receipt-total-row" style="color:var(--teal-text);"><span class="muted">Replacement Issued:</span><span class="num">+${peso(exchangeTotal)}</span></div>` : ''}
        <div class="pos-receipt-total-row grand"><span>Net Total:</span><span class="grand-val">${peso(netTotal)}</span></div>
      ` : ''}
      <div class="pos-receipt-total-row" style="margin-top:6px; padding-top:6px; border-top:1px dashed var(--line, #ddd);">
        <span class="muted">Payment Method:</span>
        <span style="font-weight:700;">${escapeHtml(sale.paymentMethod || sale.payment_method || 'Cash')}</span>
      </div>
      <div class="pos-receipt-total-row">
        <span class="muted">Cash Tendered:</span>
        <span class="num" style="font-weight:700;">${peso(sale.cashTendered !== undefined ? sale.cashTendered : sale.total)}</span>
      </div>
      <div class="pos-receipt-total-row">
        <span class="muted">Change Due:</span>
        <span class="num" style="font-weight:700; color:var(--teal-text, #1F6F6B);">${peso(sale.changeAmount !== undefined ? sale.changeAmount : 0)}</span>
      </div>
    </div>

    <div class="pos-receipt-footer">
      <div style="font-weight:600; color:var(--ink);">Thank you for your purchase at MRGR Color Center!</div>
      <div style="margin-top:4px;">Please retain this official receipt for warranty and aftersales support. Returns and exchanges are valid within the same day of purchase with original receipt.</div>
    </div>
  </div>`;

  const footHtml = `
    <button type="button" class="btn secondary" onclick="printReceiptSection('thermal')" title="Print 80mm thermal receipt">🧾 Thermal Print (80mm)</button>
    <button type="button" class="btn secondary" onclick="printReceiptSection('standard')" title="Print standard receipt or Save as PDF">🖨️ Print / Save PDF</button>
    <button type="button" class="btn" onclick="closeModal()">Done</button>
  `;

  openModal('Official Sales Receipt', bodyHtml, footHtml);
}

function buildThermalReceiptHtml(sale) {
  const receiptNo = getReceiptNo(sale);
  const status = sale.status || 'completed';
  const returnedVal = typeof getSaleReturnedValue === 'function' ? getSaleReturnedValue(sale) : Number(sale.refundTotal || 0);
  const exchangeTotal = typeof getSaleExchangeTotal === 'function' ? getSaleExchangeTotal(sale) : 0;
  const refundTotal = Number(sale.refundTotal || 0);
  const netTotal = Number((sale.total - refundTotal).toFixed(2));
  const custName = (sale.customerName || sale.customer_name || '').trim();

  const itemsHtml = (sale.items || []).map(i => {
    if (i.type === 'colormix') {
      const bd = getCustomColorMixReceiptData(i);
      const colorName = (bd && bd.colorName) || i.colorName || 'Special Blend';
      const hex = (bd && bd.hexColor) || i.hexColor || '';
      const liters = (bd && bd.totalLiters) || Number(i.liters) || Number(i.qty) || 1;
      const containerLbl = (bd && bd.containerSizeLabel) || i.containerSizeLabel || `${fmtSize(liters)} Mix`;
      const totalFormulaPct = (bd && bd.totalFormulaPct) || 100;
      const isCustomized = Boolean((bd && bd.isCustomizedFormula) || i.isCustomizedFormula);

      let formulaBlock = '';
      if (bd) {
        const baseLines = bd.basePaint ? `
          <div class="th-sub-row"><span>BASE: ${escapeHtml(bd.basePaint.name)}</span><span>${peso(bd.basePaintCost)}</span></div>
          <div class="th-meta-line">  ${escapeHtml(bd.basePaint.type || bd.baseType || 'Base')} | ${escapeHtml(bd.basePaint.colorName)}</div>
          <div class="th-meta-line">  ${bd.basePaint.pct}% · ${formatStock(bd.basePaint.liters)}L (${bd.basePaint.ml}mL)${Number(bd.basePaint.unitPrice) > 0 ? ` @ ${peso(bd.basePaint.unitPrice)}/L` : ''}</div>
        ` : '';

        const ingLines = (bd.ingredients || []).map(ing => `
          <div class="th-sub-row"><span>+ ${escapeHtml(ing.name)}</span><span>${peso(ing.cost)}</span></div>
          <div class="th-meta-line">  ${escapeHtml(ing.colorName || 'Pigment')}${ing.type ? ` (${escapeHtml(ing.type)})` : ''} · ${ing.pct}% · ${formatStock(ing.liters)}L (${ing.ml}mL)</div>
        `).join('');

        const otherCharges = Number(bd.otherCharges) || 0;
        formulaBlock = `
          <div class="th-section-label">COLOR FORMULA / INGREDIENTS (${totalFormulaPct}%)${isCustomized ? ' [CUSTOM]' : ''}</div>
          ${baseLines}
          ${ingLines}
          <div class="th-sub-row th-bold"><span>Total Colorants (${bd.totalColorantPct}%, ${bd.totalColorantMl}mL)</span><span>${peso(bd.totalColorantCost)}</span></div>
          <div class="th-section-label">PRICING BREAKDOWN</div>
          <div class="th-sub-row"><span>Material Cost (Base+Color)</span><span>${peso(bd.materialCost)}</span></div>
          <div class="th-sub-row"><span>Mixing Service Fee</span><span>${peso(bd.serviceFee)}</span></div>
          ${otherCharges !== 0 ? `<div class="th-sub-row"><span>Other Charges</span><span>${peso(otherCharges)}</span></div>` : ''}
        `;
      }

      return `
        <div class="th-item">
          <div class="th-row th-bold">
            <span>Custom Color Mix - ${escapeHtml(colorName)}${hex ? ` (${escapeHtml(hex)})` : ''}</span>
            <span>${peso(i.lineTotal)}</span>
          </div>
          <div class="th-meta-line">Size: ${escapeHtml(containerLbl)} | Vol: ${formatStock(liters)}L | Qty: ${formatStock(i.qty || 1)} x ${peso(i.unitPrice)}</div>
          ${formulaBlock}
        </div>
      `;
    }

    const p = i.productId ? productById(i.productId) : null;
    const size = Number(i.size) || (i.type === 'product' ? 1 : null);
    const colorLabel = i.colorName || (i.color && i.color !== '-' ? i.color : (p && p.color && p.color !== '-' ? p.color : ''));
    return `
      <div class="th-item">
        <div class="th-row th-bold">
          <span>${escapeHtml(i.name)}</span>
          <span>${peso(i.lineTotal)}</span>
        </div>
        <div class="th-meta-line">${escapeHtml(i.brand || (p && p.brand) || '')}${colorLabel ? ` · ${escapeHtml(colorLabel)}` : ''}${size ? ` · ${fmtSize(size)}` : ''}</div>
        <div class="th-meta-line">${formatStock(i.qty)} x ${peso(i.unitPrice)}${size ? ` (${(i.qty * size).toFixed(2)}L)` : ''}</div>
      </div>
    `;
  }).join('');

  const vatRate = sale.vatRate !== undefined ? Number(sale.vatRate) : (sale.vat_rate !== undefined ? Number(sale.vat_rate) : null);
  const vatableSales = sale.vatableSales !== undefined ? Number(sale.vatableSales) : (sale.vatable_sales !== undefined ? Number(sale.vatable_sales) : 0);
  const vatAmount = sale.vatAmount !== undefined ? Number(sale.vatAmount) : (sale.vat_amount !== undefined ? Number(sale.vat_amount) : null);
  const vatExemptSales = sale.vatExemptSales !== undefined ? Number(sale.vatExemptSales) : (sale.vat_exempt_sales !== undefined ? Number(sale.vat_exempt_sales) : 0);
  const zeroRatedSales = sale.zeroRatedSales !== undefined ? Number(sale.zeroRatedSales) : (sale.zero_rated_sales !== undefined ? Number(sale.zero_rated_sales) : 0);
  const taxStatus = sale.taxStatus || sale.tax_status || (vatRate === 0 ? 'non_vat' : 'vat_registered');

  let vatBlock = '';
  if (vatAmount !== null && !isNaN(vatAmount)) {
    if (taxStatus !== 'non_vat') {
      vatBlock = `
        <div class="th-divider"></div>
        <div class="th-row"><span>VATable Sales:</span><span>${peso(vatableSales)}</span></div>
        <div class="th-row th-bold"><span>VAT Amount (${vatRate || 12}%):</span><span>${peso(vatAmount)}</span></div>
        <div class="th-row"><span>VAT-Exempt Sales:</span><span>${peso(vatExemptSales)}</span></div>
        ${zeroRatedSales > 0 ? `<div class="th-row"><span>Zero-Rated Sales:</span><span>${peso(zeroRatedSales)}</span></div>` : ''}
      `;
    } else {
      vatBlock = `
        <div class="th-divider"></div>
        <div class="th-row"><span>Tax Status:</span><span>Non-VAT Registered</span></div>
      `;
    }
  }

  return `
    <div class="thermal-receipt">
      <div class="th-center">
        <div class="th-title">MRGR COLOR CENTER</div>
        <div class="th-sub">Paint &amp; Color Formulation Specialists</div>
        <div class="th-sub">Official Sales Receipt</div>
        <div class="th-receipt-no">${escapeHtml(receiptNo)}</div>
        ${status === 'voided' ? `<div class="th-void">*** TRANSACTION VOIDED ***</div>` : ''}
      </div>
      <div class="th-divider"></div>
      <div class="th-meta-line">Date: ${formatDateTime(sale.date)}</div>
      <div class="th-meta-line">Cashier: ${escapeHtml(sale.cashierName || 'Cashier')}</div>
      ${custName ? `<div class="th-meta-line">Customer: ${escapeHtml(custName)}</div>` : ''}
      <div class="th-divider"></div>
      ${itemsHtml}
      <div class="th-divider"></div>
      <div class="th-row"><span>Subtotal:</span><span>${peso(sale.subtotal)}</span></div>
      ${(Number(sale.discountAmount || sale.discount || 0) > 0) ? `
        <div class="th-row"><span>Discount (${Number(sale.discountPct || sale.discountPercentage || 10)}%):</span><span>-${peso(Number(sale.discountAmount || sale.discount || 0))}</span></div>
      ` : ''}
      ${vatBlock}
      <div class="th-divider-bold"></div>
      <div class="th-row th-grand"><span>TOTAL AMOUNT DUE:</span><span>${peso(sale.total)}</span></div>
      ${(returnedVal > 0 || refundTotal > 0) ? `
        <div class="th-row"><span>Returned Credit:</span><span>-${peso(returnedVal || refundTotal)}</span></div>
        ${exchangeTotal > 0 ? `<div class="th-row"><span>Replacement:</span><span>+${peso(exchangeTotal)}</span></div>` : ''}
        <div class="th-row th-bold"><span>NET TOTAL:</span><span>${peso(netTotal)}</span></div>
      ` : ''}
      <div class="th-divider"></div>
      <div class="th-row"><span>Payment Method:</span><span>${escapeHtml(sale.paymentMethod || sale.payment_method || 'Cash')}</span></div>
      <div class="th-row"><span>Cash Tendered:</span><span>${peso(sale.cashTendered !== undefined ? sale.cashTendered : sale.total)}</span></div>
      <div class="th-row th-bold"><span>Change Due:</span><span>${peso(sale.changeAmount !== undefined ? sale.changeAmount : 0)}</span></div>
      <div class="th-divider"></div>
      <div class="th-center th-footer">
        <div>Thank you for your purchase!</div>
        <div>Please retain this receipt for warranty &amp; aftersales support.</div>
      </div>
    </div>
  `;
}

function printReceiptSection(mode = 'standard') {
  if (mode === 'thermal') {
    const sale = window._activeReceiptSale;
    if (!sale) {
      showToast('No active receipt found to print.', 'error');
      return;
    }
    const printWin = window.open('', '_blank', 'width=360,height=720');
    if (!printWin) {
      showToast('Popup blocker prevented thermal receipt window from opening. Please allow popups.', 'error');
      return;
    }
    printWin.document.write(`
<!DOCTYPE html>
<html>
  <head>
    <title>Thermal Receipt - ${escapeHtml(getReceiptNo(sale))}</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: 'Courier New', Courier, monospace; font-size: 11px; color: #000; background: #fff; margin: 0; padding: 6px; width: 80mm; }
      .thermal-receipt { width: 100%; }
      .th-center { text-align: center; }
      .th-title { font-size: 14px; font-weight: 700; letter-spacing: 0.04em; }
      .th-sub { font-size: 10px; }
      .th-receipt-no { font-size: 12px; font-weight: 700; margin-top: 4px; border: 1px dashed #000; padding: 2px 6px; display: inline-block; }
      .th-void { font-size: 11px; font-weight: 700; margin-top: 4px; border: 1px solid #000; padding: 2px 4px; }
      .th-divider { border-top: 1px dashed #000; margin: 6px 0; }
      .th-divider-bold { border-top: 2px solid #000; margin: 6px 0; }
      .th-item { padding: 4px 0; border-bottom: 1px dotted #999; }
      .th-item:last-of-type { border-bottom: none; }
      .th-row, .th-sub-row { display: flex; justify-content: space-between; gap: 6px; line-height: 1.35; }
      .th-sub-row { font-size: 10px; padding-left: 4px; }
      .th-meta-line { font-size: 9.5px; line-height: 1.3; color: #111; }
      .th-section-label { font-size: 9.5px; font-weight: 700; margin-top: 4px; border-top: 1px dotted #555; padding-top: 2px; }
      .th-bold { font-weight: 700; }
      .th-grand { font-size: 13px; font-weight: 700; padding: 2px 0; }
      .th-footer { font-size: 9.5px; margin-top: 6px; line-height: 1.35; }
      @media print {
        @page { size: 80mm auto; margin: 2mm; }
        body { padding: 0; width: 76mm; }
      }
    </style>
  </head>
  <body>
    ${buildThermalReceiptHtml(sale)}
    <script>window.onafterprint = function(){ window.close(); }; window.onload = function(){ setTimeout(function(){ window.print(); }, 150); }<\/script>
  </body>
</html>
    `);
    printWin.document.close();
    return;
  }

  const receiptEl = document.getElementById('printable-receipt');
  if (!receiptEl) return;
  const printWin = window.open('', '_blank', 'width=720,height=820');
  if (!printWin) {
    showToast('Popup blocker prevented receipt window from opening. Please allow popups.', 'error');
    return;
  }
  printWin.document.write(`
<!DOCTYPE html>
<html>
  <head>
    <base href="${escapeAttr(window.location.href)}">
    <title>Receipt - MRGR Color Center</title>
    <style>
      :root { --surface: #FFFFFF; --surface-2: #FAF8F5; --surface-3: #F4EFE6; --ink: #26211C; --ink-soft: #6B6259; --line: #E2DACD; --line-light: #ECE6DB; --teal: #1F6F6B; --teal-dark: #17524F; --teal-text: #1F6F6B; --teal-tint: #EAF4F3; --teal-tint-border: #C4E2DF; --success: #3F8358; --success-text: #065F46; --success-bg: #EAF4EC; --success-border: #A7F3D0; --warning: #D97706; --warning-text: #92400E; --warning-bg: #FEF3C7; --warning-border: #FCD34D; --danger: #C1443D; --danger-text: #991B1B; --danger-bg: #FBEAE8; --danger-border: #FCA5A5; --info-text: #1B4F72; --info-bg: #EBF5FB; --info-border: #AED6F1; --purple-text: #6B21A8; --purple-bg: #F3E8FF; --purple-border: #DDD6FE; }
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-sizing: border-box; }
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
      tr.pos-receipt-mix-row td { border-bottom: none; padding-bottom: 4px; }
      tr.pos-receipt-mix-breakdown-row td { padding: 2px 4px 10px 4px; border-bottom: 1px solid #ddd; }
      .pos-confirm-mix-breakdown { background: #FAF8F5; border: 1px solid #D9D0C3; border-radius: 6px; padding: 8px 10px; page-break-inside: avoid; break-inside: avoid; }
      .cm-ingredients-details summary { list-style: none; }
      .cm-ingredients-details summary::-webkit-details-marker { display: none; }
      .badge { display: inline-block; border-radius: 4px; }
      .muted { color: #6B6259; }
      .no-print { display: none !important; }
      .right { text-align: right; }
      .num { font-family: monospace; font-weight: bold; }
      .pos-receipt-totals { border-top: 2px dashed #222; margin-top: 14px; padding-top: 10px; page-break-inside: avoid; }
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
    <script>
      document.querySelectorAll('details').forEach(function(d){ d.setAttribute('open', 'open'); });
      window.onafterprint = function(){ window.close(); };
      window.onload = function(){ setTimeout(function(){ window.print(); }, 150); };
    <\/script>
  </body>
</html>
  `);
  printWin.document.close();
}
