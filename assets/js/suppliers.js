/* ============================================================
   15. SUPPLIERS (Admin: full CRUD | Staff: View only)
   ============================================================ */
let expandedSupplierIds = new Set();
let supplierSearchQuery = '';
let supplierStatusFilter = 'all'; // 'all' | 'active' | 'inactive' | 'pending_po'
let supplierSortBy = 'name_asc'; // 'name_asc' | 'name_desc' | 'products_desc' | 'products_asc' | 'status_active'

function refreshSuppliersView() {
  const container = document.getElementById('suppliers-table-container');
  const editable = container ? container.getAttribute('data-editable') === '1' : (typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'admin');
  if (container) {
    container.innerHTML = supplierTableHtml(editable);
    updateSupplierSummaryCardsUI();
  } else {
    renderPage();
  }
}

function updateSupplierSummaryCardsUI() {
  const cardsWrap = document.getElementById('suppliers-summary-cards');
  if (cardsWrap) {
    cardsWrap.innerHTML = renderSupplierSummaryCardsHtml();
  }
}

function setSupplierSearch(val) {
  supplierSearchQuery = String(val || '');
  resetPaginationPage('suppliers');
  refreshSuppliersView();
}

function setSupplierStatusFilter(val) {
  supplierStatusFilter = val || 'all';
  resetPaginationPage('suppliers');
  refreshSuppliersView();
}

function setSupplierSort(val) {
  supplierSortBy = val || 'name_asc';
  resetPaginationPage('suppliers');
  refreshSuppliersView();
}

function clearSupplierFilters() {
  supplierSearchQuery = '';
  supplierStatusFilter = 'all';
  supplierSortBy = 'name_asc';
  const searchEl = document.getElementById('supplier-search-input');
  const statusEl = document.getElementById('supplier-status-filter');
  const sortEl = document.getElementById('supplier-sort-select');
  if (searchEl) searchEl.value = '';
  if (statusEl) statusEl.value = 'all';
  if (sortEl) sortEl.value = 'name_asc';
  resetPaginationPage('suppliers');
  refreshSuppliersView();
}

function toggleSupplierProducts(sId) {
  if (expandedSupplierIds.has(sId)) {
    expandedSupplierIds.delete(sId);
  } else {
    expandedSupplierIds.add(sId);
  }
  const isExpanded = expandedSupplierIds.has(sId);
  const extraChips = document.querySelectorAll(`.sp-extra-chip-${sId}`);
  const btn = document.getElementById(`sp-more-btn-${sId}`);
  const s = supplierById(sId);
  const validProductIds = s ? (s.productIds || []).filter(id => Boolean(productById(id))) : [];
  const moreCount = Math.max(0, validProductIds.length - 3);

  extraChips.forEach(chip => {
    chip.style.display = isExpanded ? 'inline-flex' : 'none';
  });

  if (btn) {
    btn.innerHTML = isExpanded ? '▲ Collapse' : `+${moreCount} more ▼`;
    btn.title = isExpanded ? 'Collapse product list' : `Show all ${validProductIds.length} products (+${moreCount} more)`;
    btn.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
    btn.classList.toggle('expanded', isExpanded);
  }
}

function renderSupplierProductChip(id, isExtra, sId, isExpanded) {
  const p = productById(id);
  if (!p) return '';
  const hex = getProductHex(p);
  const extraClass = isExtra ? ` sp-extra-chip-${sId}` : '';
  const displayStyle = isExtra ? (isExpanded ? 'display:inline-flex;' : 'display:none;') : 'display:inline-flex;';
  return `<span class="supplier-prod-chip${extraClass}" style="${displayStyle} align-items:center; gap:5px; background:#F4EFE7; padding:3px 8px; border-radius:4px; font-size:11.5px; font-weight:500; max-width:240px; white-space:nowrap;" title="${escapeHtml(p.name)}${hex ? ' (' + hex + ')' : ''}">
    <span style="width:8px; height:8px; border-radius:2px; background:${hex && hex.startsWith('#') ? hex : '#ccc'}; display:inline-block; flex-shrink:0;"></span>
    <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(p.name)}</span>
    ${hex ? `<code style="color:var(--teal); font-size:10.5px; flex-shrink:0;">(${hex})</code>` : ''}
  </span>`;
}

function renderSupplierSummaryCardsHtml() {
  const suppliers = db.suppliers || [];
  const totalCount = suppliers.length;
  const activeCount = suppliers.filter(s => s.status === 'active').length;
  const inactiveCount = suppliers.filter(s => s.status === 'inactive').length;
  
  const pendingPOIds = new Set(
    (db.purchaseOrders || []).filter(po => po.status === 'pending').map(po => po.supplierId)
  );
  const withPendingPOCount = suppliers.filter(s => pendingPOIds.has(s.id)).length;

  return `
    <div class="stat-grid" style="margin-bottom:18px;">
      <div class="stat-card ${supplierStatusFilter === 'all' ? 'active' : ''}" style="cursor:pointer;" onclick="setSupplierStatusFilter('all')" title="Click to view all suppliers">
        <div class="label">Total Suppliers</div>
        <div class="value">${totalCount}</div>
        <div class="sub">Accredited partner accounts</div>
      </div>
      <div class="stat-card teal ${supplierStatusFilter === 'active' ? 'active' : ''}" style="cursor:pointer;" onclick="setSupplierStatusFilter('active')" title="Click to filter active suppliers">
        <div class="label">Active Suppliers</div>
        <div class="value">${activeCount}</div>
        <div class="sub">Ready for purchase orders</div>
      </div>
      <div class="stat-card mustard ${supplierStatusFilter === 'pending_po' ? 'active' : ''}" style="cursor:pointer;" onclick="setSupplierStatusFilter('pending_po')" title="Click to filter suppliers with pending POs">
        <div class="label">Pending Purchase Orders</div>
        <div class="value">${withPendingPOCount}</div>
        <div class="sub">Suppliers awaiting restock authorization</div>
      </div>
      <div class="stat-card ${supplierStatusFilter === 'inactive' ? 'active' : ''}" style="cursor:pointer;" onclick="setSupplierStatusFilter('inactive')" title="Click to filter inactive suppliers">
        <div class="label">Inactive Suppliers</div>
        <div class="value">${inactiveCount}</div>
        <div class="sub">Archived or paused accounts</div>
      </div>
    </div>
  `;
}

function renderSupplierFilterToolbarHtml() {
  return `
    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
      <div style="position:relative; display:inline-flex; align-items:center;">
        <input type="search" id="supplier-search-input" placeholder="Search name, contact, phone, email, address, product..." value="${escapeHtml(supplierSearchQuery)}"
          oninput="setSupplierSearch(this.value)"
          style="padding:6px 28px 6px 10px; border:1px solid var(--line); border-radius:6px; font-size:12.5px; min-width:240px;">
        ${supplierSearchQuery ? `
          <button type="button" onclick="setSupplierSearch(''); document.getElementById('supplier-search-input').value='';"
                  style="position:absolute; right:6px; background:none; border:none; color:var(--ink-soft); cursor:pointer; font-size:12px; padding:2px 4px;" title="Clear search">✕</button>
        ` : ''}
      </div>
      <select id="supplier-status-filter" onchange="setSupplierStatusFilter(this.value)"
        style="padding:6px 10px; border:1px solid var(--line); border-radius:6px; font-size:12.5px;" title="Filter by status">
        <option value="all" ${supplierStatusFilter === 'all' ? 'selected' : ''}>All Statuses</option>
        <option value="active" ${supplierStatusFilter === 'active' ? 'selected' : ''}>Active Only</option>
        <option value="inactive" ${supplierStatusFilter === 'inactive' ? 'selected' : ''}>Inactive Only</option>
        <option value="pending_po" ${supplierStatusFilter === 'pending_po' ? 'selected' : ''}>With Pending POs</option>
      </select>
      <select id="supplier-sort-select" onchange="setSupplierSort(this.value)"
        style="padding:6px 10px; border:1px solid var(--line); border-radius:6px; font-size:12.5px;" title="Sort supplier records">
        <option value="name_asc" ${supplierSortBy === 'name_asc' ? 'selected' : ''}>Sort: Name (A → Z)</option>
        <option value="name_desc" ${supplierSortBy === 'name_desc' ? 'selected' : ''}>Sort: Name (Z → A)</option>
        <option value="products_desc" ${supplierSortBy === 'products_desc' ? 'selected' : ''}>Sort: Most Products</option>
        <option value="products_asc" ${supplierSortBy === 'products_asc' ? 'selected' : ''}>Sort: Fewest Products</option>
        <option value="status_active" ${supplierSortBy === 'status_active' ? 'selected' : ''}>Sort: Active First</option>
      </select>
      ${(supplierSearchQuery || supplierStatusFilter !== 'all' || supplierSortBy !== 'name_asc') ? `
        <button type="button" class="btn ghost small" onclick="clearSupplierFilters()" title="Reset all filters">Reset</button>
      ` : ''}
    </div>
  `;
}

function suppliersPage() {
  const isAdmin = typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'admin';
  const heading = isAdmin ? 'Suppliers' : 'Supplier Directory';
  const subtitle = isAdmin
    ? 'Manage supplier accounts, contact persons, linked catalog products, and procurement history.'
    : 'Directory of accredited suppliers, contacts, and supplied products (view-only).';
  return `
  <div class="panel" id="suppliers-panel">
    <div class="panel-head row wrap" style="gap:10px;">
      <div>
        <h3 style="margin:0;">${heading}</h3>
        <div class="muted small" style="margin-top:2px;">${subtitle}</div>
      </div>
      <div class="spacer"></div>
      ${renderSupplierFilterToolbarHtml()}
      ${isAdmin ? '<button class="btn small" onclick="openSupplierModal()">+ Add Supplier</button>' : ''}
    </div>
    <div style="padding:16px 18px 0;" id="suppliers-summary-cards">
      ${renderSupplierSummaryCardsHtml()}
    </div>
    <div id="suppliers-table-container" data-editable="${isAdmin ? '1' : '0'}">${supplierTableHtml(isAdmin)}</div>
  </div>`;
}

function suppliersViewPage() {
  return suppliersPage();
}

function supplierTableHtml(editable) {
  const isAdmin = typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'admin';
  const canEdit = Boolean(editable && isAdmin);
  const q = String(supplierSearchQuery || '').trim().toLowerCase();

  const pendingPOIds = new Set(
    (db.purchaseOrders || []).filter(po => po.status === 'pending').map(po => po.supplierId)
  );

  let list = (db.suppliers || []).filter(s => {
    if (supplierStatusFilter === 'active' && s.status !== 'active') return false;
    if (supplierStatusFilter === 'inactive' && s.status !== 'inactive') return false;
    if (supplierStatusFilter === 'pending_po' && !pendingPOIds.has(s.id)) return false;

    if (q) {
      const prodNames = (s.productIds || []).map(id => {
        const p = productById(id);
        return p ? `${p.name} ${p.brand} ${p.type} ${p.color || ''}` : '';
      }).join(' ').toLowerCase();
      const hay = `${s.name || ''} ${s.contact || ''} ${s.phone || ''} ${s.email || ''} ${s.address || ''} ${prodNames}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  // Sorting
  list = list.slice().sort((a, b) => {
    if (supplierSortBy === 'name_asc') return (a.name || '').localeCompare(b.name || '');
    if (supplierSortBy === 'name_desc') return (b.name || '').localeCompare(a.name || '');
    if (supplierSortBy === 'products_desc') return (b.productIds || []).length - (a.productIds || []).length;
    if (supplierSortBy === 'products_asc') return (a.productIds || []).length - (b.productIds || []).length;
    if (supplierSortBy === 'status_active') {
      if (a.status === b.status) return (a.name || '').localeCompare(b.name || '');
      return a.status === 'active' ? -1 : 1;
    }
    return 0;
  });

  const pag = paginateArray(list, 'suppliers', {
    onUpdate: refreshSuppliersView,
    scrollTarget: '#suppliers-panel',
    recordLabel: 'suppliers'
  });

  const pagedList = pag.pagedItems || pag.pageItems || [];

  return `
  <div class="panel-body tight table-scroll">
    <table>
      <thead>
        <tr>
          <th>Supplier Name</th>
          <th>Contact Person</th>
          <th>Contact Number</th>
          <th>Email Address</th>
          <th>Address</th>
          <th>Associated Products</th>
          <th>Status</th>
          <th class="right">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${pagedList.length ? pagedList.map(s => {
          const isExpanded = expandedSupplierIds.has(s.id);
          const validProductIds = (s.productIds || []).filter(id => Boolean(productById(id)));
          const initialProductIds = validProductIds.slice(0, 3);
          const extraProductIds = validProductIds.slice(3);
          const hasMore = extraProductIds.length > 0;
          const hasPendingPO = pendingPOIds.has(s.id);

          return `
          <tr>
            <td>
              <a href="#" onclick="openSupplierDetailsModal('${s.id}'); return false;"
                 style="font-weight:700; color:var(--ink); text-decoration:none;"
                 title="Click to view full supplier profile, PO history, and catalog">
                ${escapeHtml(s.name)}
              </a>
              ${hasPendingPO ? `<span class="badge warning small" style="margin-left:6px; font-size:10px; background:#FEF3C7; color:#92400E; border:1px solid #FCD34D;">Pending PO</span>` : ''}
            </td>
            <td>${escapeHtml(s.contact || '—')}</td>
            <td style="font-size:12.5px;">${escapeHtml(s.phone || '—')}</td>
            <td style="font-size:12.5px;">${s.email ? `<a href="mailto:${escapeHtml(s.email)}" style="color:var(--teal); text-decoration:none;">${escapeHtml(s.email)}</a>` : '<span class="muted">—</span>'}</td>
            <td style="font-size:12px; max-width:180px; color:var(--ink-soft);">${escapeHtml(s.address || '—')}</td>
            <td class="small">
              ${validProductIds.length ? `
                <div style="display:flex; flex-wrap:wrap; align-items:center; gap:6px;">
                  ${initialProductIds.map(id => renderSupplierProductChip(id, false, s.id, isExpanded)).join('')}
                  ${extraProductIds.map(id => renderSupplierProductChip(id, true, s.id, isExpanded)).join('')}
                  ${hasMore ? `
                    <button type="button" 
                      id="sp-more-btn-${s.id}" 
                      class="supplier-more-btn ${isExpanded ? 'expanded' : ''}" 
                      onclick="toggleSupplierProducts('${s.id}')"
                      title="${isExpanded ? 'Collapse product list' : `Show all ${validProductIds.length} products (+${extraProductIds.length} more)`}"
                      aria-expanded="${isExpanded ? 'true' : 'false'}">
                      ${isExpanded ? '▲ Collapse' : `+${extraProductIds.length} more ▼`}
                    </button>
                  ` : ''}
                </div>
              ` : '<span class="muted">None linked</span>'}
            </td>
            <td>
              ${s.status === 'active' 
                ? '<span class="badge ok" style="font-weight:600;">Active</span>' 
                : '<span class="badge inactive" style="font-weight:600;">Inactive</span>'}
            </td>
            <td class="right" style="white-space:nowrap;">
              <div style="display:inline-flex; align-items:center; gap:6px; justify-content:flex-end;">
                <button class="btn ghost small" onclick="openSupplierDetailsModal('${s.id}')" title="View details, products & PO history">🔍 Details</button>
                ${canEdit ? `
                  <button class="btn ghost small" onclick="openSupplierModal('${s.id}')" title="Edit supplier profile">✏️ Edit</button>
                  <button class="btn ghost small" onclick="toggleSupplierStatus('${s.id}')" title="${s.status === 'active' ? 'Deactivate supplier' : 'Activate supplier'}">
                    ${s.status === 'active' ? 'Deactivate' : 'Activate'}
                  </button>
                ` : ''}
              </div>
            </td>
          </tr>`;
        }).join('') : `
          <tr>
            <td colspan="8" class="empty-state" style="padding:36px; text-align:center;">
              ${q || supplierStatusFilter !== 'all' ? 'No suppliers match your search/filter.' : 'No suppliers registered in catalog yet.'}
            </td>
          </tr>
        `}
      </tbody>
    </table>
  </div>
  ${pag.html}`;
}

/* ------------------------------------------------------------
   Supplier Details Modal
   ------------------------------------------------------------ */
function openSupplierDetailsModal(id) {
  const s = supplierById(id);
  if (!s) return;

  const isAdmin = typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'admin';
  const pos = (db.purchaseOrders || []).filter(o => o.supplierId === s.id);
  const totalPOs = pos.length;
  const pendingPOs = pos.filter(o => o.status === 'pending').length;
  const completedPOs = pos.filter(o => o.status === 'received' || o.status === 'completed').length;
  const totalSpend = pos.filter(o => o.status === 'received' || o.status === 'completed').reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);

  // Associated products
  const validProductIds = (s.productIds || []).filter(pId => Boolean(productById(pId)));
  const products = validProductIds.map(pId => productById(pId));

  // Recent transactions (receiving movements for products from this supplier)
  const prodIdSet = new Set(validProductIds);
  const recentMovements = (db.movements || [])
    .filter(m => m.type === 'receiving' && prodIdSet.has(m.productId))
    .slice()
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 10);

  const bodyHtml = `
    <div>
      <!-- Supplier Profile Header -->
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px; padding-bottom:14px; border-bottom:1px solid var(--line);">
        <div>
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <h3 style="margin:0; font-size:18px; color:var(--ink);">${escapeHtml(s.name)}</h3>
            ${s.status === 'active' ? '<span class="badge ok">Active</span>' : '<span class="badge inactive">Inactive</span>'}
          </div>
          <div class="muted small" style="margin-top:4px;">ID: <code style="font-family:'Space Grotesk',monospace; color:var(--teal);">${escapeHtml(s.id)}</code></div>
        </div>
        <div style="text-align:right;">
          ${isAdmin ? `<button class="btn secondary small" onclick="closeModal(); openSupplierModal('${s.id}')">✏️ Edit Details</button>` : ''}
        </div>
      </div>

      <!-- Contact Information Cards -->
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:10px; margin-bottom:16px;">
        <div style="background:#FAF8F5; border:1px solid var(--line); border-radius:6px; padding:10px 12px; font-size:12.5px;">
          <div class="muted small">Contact Person</div>
          <div style="font-weight:600; color:var(--ink); margin-top:2px;">${escapeHtml(s.contact || '—')}</div>
        </div>
        <div style="background:#FAF8F5; border:1px solid var(--line); border-radius:6px; padding:10px 12px; font-size:12.5px;">
          <div class="muted small">Phone / Mobile</div>
          <div style="font-weight:600; color:var(--ink); margin-top:2px;">${escapeHtml(s.phone || '—')}</div>
        </div>
        <div style="background:#FAF8F5; border:1px solid var(--line); border-radius:6px; padding:10px 12px; font-size:12.5px;">
          <div class="muted small">Email Address</div>
          <div style="font-weight:600; color:var(--ink); margin-top:2px;">${s.email ? `<a href="mailto:${escapeHtml(s.email)}" style="color:var(--teal);">${escapeHtml(s.email)}</a>` : '—'}</div>
        </div>
        <div style="background:#FAF8F5; border:1px solid var(--line); border-radius:6px; padding:10px 12px; font-size:12.5px;">
          <div class="muted small">Business Address</div>
          <div style="font-weight:600; color:var(--ink); margin-top:2px;">${escapeHtml(s.address || '—')}</div>
        </div>
      </div>

      <!-- PO Metrics -->
      <div class="stat-grid" style="margin-bottom:18px;">
        <div class="stat-card" style="padding:12px 14px;">
          <div class="label" style="font-size:11px;">Total Purchase Orders</div>
          <div class="value" style="font-size:20px;">${totalPOs}</div>
        </div>
        <div class="stat-card mustard" style="padding:12px 14px;">
          <div class="label" style="font-size:11px;">Pending Authorization</div>
          <div class="value" style="font-size:20px;">${pendingPOs}</div>
        </div>
        <div class="stat-card sage" style="padding:12px 14px;">
          <div class="label" style="font-size:11px;">Completed Deliveries</div>
          <div class="value" style="font-size:20px;">${completedPOs}</div>
        </div>
        <div class="stat-card teal" style="padding:12px 14px;">
          <div class="label" style="font-size:11px;">Total Completed Spend</div>
          <div class="value" style="font-size:18px;">${peso(totalSpend)}</div>
        </div>
      </div>

      <!-- Associated Products Tab / Section -->
      <div style="margin-bottom:18px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <div style="font-weight:700; font-size:13.5px; color:var(--ink);">Associated Catalog Products (${products.length})</div>
        </div>
        ${products.length ? `
          <div class="table-scroll" style="max-height:220px; overflow-y:auto; border:1px solid var(--line); border-radius:6px;">
            <table>
              <thead>
                <tr style="background:#FAF8F5;">
                  <th>Product</th>
                  <th>Brand</th>
                  <th>Category</th>
                  <th class="right">Base Price</th>
                  <th class="right">Total In-Stock</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${products.map(p => {
                  const hex = getProductHex(p);
                  return `
                    <tr>
                      <td>
                        <div style="display:flex; align-items:center; gap:6px;">
                          <span style="width:10px; height:10px; border-radius:2px; background:${hex || '#ccc'}; display:inline-block;"></span>
                          <span style="font-weight:600; color:var(--ink);">${escapeHtml(p.name)}</span>
                          ${p.color && p.color !== '-' ? `<span class="muted small">(${escapeHtml(p.color)})</span>` : ''}
                        </div>
                      </td>
                      <td style="font-size:12px;">${escapeHtml(p.brand || '—')}</td>
                      <td style="font-size:12px;">${escapeHtml(p.type || p.category || '—')}</td>
                      <td class="right" style="font-size:12.5px; font-weight:600;">${peso(p.price)}</td>
                      <td class="right" style="font-size:12.5px; font-weight:600;">${formatLiters(p.stock)}</td>
                      <td>${p.status === 'active' ? '<span class="badge ok small">Active</span>' : '<span class="badge inactive small">Inactive</span>'}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        ` : '<div class="muted small" style="padding:16px; background:#FAF8F5; border-radius:6px; text-align:center;">No catalog products currently linked to this supplier.</div>'}
      </div>

      <!-- Purchase Order History -->
      <div style="margin-bottom:18px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <div style="font-weight:700; font-size:13.5px; color:var(--ink);">Purchase Order History (${pos.length})</div>
        </div>
        ${pos.length ? `
          <div class="table-scroll" style="max-height:220px; overflow-y:auto; border:1px solid var(--line); border-radius:6px;">
            <table>
              <thead>
                <tr style="background:#FAF8F5;">
                  <th>PO #</th>
                  <th>Date</th>
                  <th>Items Summary</th>
                  <th class="right">Total Amount</th>
                  <th>Status</th>
                  <th class="right">Action</th>
                </tr>
              </thead>
              <tbody>
                ${pos.slice().sort((a, b) => new Date(b.orderDate) - new Date(a.orderDate)).map(po => {
                  const items = Array.isArray(po.items) ? po.items : [];
                  const totalCans = items.reduce((sum, it) => sum + (Number(it.qty !== undefined ? it.qty : (it.orderedQty || 0))), 0);
                  const stBadge = po.status === 'received' || po.status === 'completed'
                    ? '<span class="badge ok small">✓ Received</span>'
                    : (po.status === 'pending'
                      ? '<span class="badge warning small" style="background:#FEF3C7; color:#92400E;">⏳ Pending</span>'
                      : (po.status === 'ordered'
                        ? '<span class="badge teal small">Ordered</span>'
                        : '<span class="badge danger small">✕ Cancelled</span>'));

                  return `
                    <tr>
                      <td style="font-family:'Space Grotesk',monospace; font-weight:700;">${escapeHtml(po.poNumber)}</td>
                      <td style="font-size:12px; color:var(--ink-soft);">${formatDateShort(po.orderDate)}</td>
                      <td style="font-size:12px;">${items.length} item${items.length === 1 ? '' : 's'} (${totalCans} units)</td>
                      <td class="right" style="font-family:'Space Grotesk',monospace; font-weight:700; font-size:13px;">${peso(po.totalAmount)}</td>
                      <td>${stBadge}</td>
                      <td class="right">
                        <button class="btn ghost small" onclick="closeModal(); if(typeof viewPODetailsModal === 'function') { viewPODetailsModal('${po.id}'); } else if(typeof openPOPreviewModal === 'function') { openPOPreviewModal('${po.id}'); }">View PO</button>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        ` : '<div class="muted small" style="padding:16px; background:#FAF8F5; border-radius:6px; text-align:center;">No purchase orders issued to this supplier yet.</div>'}
      </div>

      <!-- Recent Transactions / Stock Receipts -->
      ${recentMovements.length ? `
        <div>
          <div style="font-weight:700; font-size:13.5px; color:var(--ink); margin-bottom:8px;">Recent Stock Receiving Transactions (${recentMovements.length})</div>
          <div class="table-scroll" style="max-height:180px; overflow-y:auto; border:1px solid var(--line); border-radius:6px;">
            <table>
              <thead>
                <tr style="background:#FAF8F5;">
                  <th>Date &amp; Time</th>
                  <th>Product</th>
                  <th class="right">Quantity Received</th>
                  <th>Received By</th>
                  <th>Reference / Note</th>
                </tr>
              </thead>
              <tbody>
                ${recentMovements.map(m => `
                  <tr>
                    <td style="font-size:12px; color:var(--ink-soft);">${formatDateTime(m.date)}</td>
                    <td style="font-size:12px; font-weight:600;">${escapeHtml(m.productName || 'Stock Inflow')}</td>
                    <td class="right" style="font-weight:700; color:var(--success); font-size:12.5px;">+${formatLiters(m.qtyChange)}</td>
                    <td style="font-size:12px;">${escapeHtml(m.staffName || 'Staff')}</td>
                    <td style="font-size:11.5px; color:var(--ink-soft);">${escapeHtml(m.note || m.reference || 'Stock receipt')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      ` : ''}
    </div>
  `;

  const footHtml = `
    <button class="btn secondary" onclick="closeModal()">Close</button>
    ${isAdmin ? `<button class="btn" onclick="closeModal(); openSupplierModal('${s.id}')">✏️ Edit Supplier</button>` : ''}
  `;

  openModal(`Supplier Profile: ${s.name}`, bodyHtml, footHtml, 'wide');
}

/* ------------------------------------------------------------
   Add / Edit Supplier Modal
   ------------------------------------------------------------ */
function openSupplierModal(id) {
  if (typeof currentUser !== 'undefined' && currentUser && currentUser.role !== 'admin') {
    showToast('Permission denied: Only administrators can add or edit suppliers.', 'error');
    return;
  }
  const s = id ? supplierById(id) : null;
  const linkedIds = new Set(s ? s.productIds : []);
  const initialCount = linkedIds.size;

  const productRows = (db.products || []).map(p => {
    const isChecked = linkedIds.has(p.id);
    const hex = getProductHex(p);
    const swatchBg = hex && hex.startsWith('#') ? hex : (p.color && p.color.startsWith('#') ? p.color : '#e0dbd1');
    return `
    <label class="supplier-prod-item ${isChecked ? 'selected' : ''}" id="sp-item-${p.id}" for="sp-check-${p.id}"
      data-search="${escapeHtml([p.name, p.brand, p.type, hex, p.color].join(' ').toLowerCase())}">
      <input type="checkbox" id="sp-check-${p.id}" value="${p.id}" ${isChecked ? 'checked' : ''} onchange="onSupplierProductCheckChange(this)">
      <div class="sp-swatch" style="background:${swatchBg};"></div>
      <div class="sp-info">
        <div class="sp-name-row">
          <span class="sp-name">${escapeHtml(p.name)}</span>
          ${hex ? `<code class="sp-hex">(${hex})</code>` : ''}
          ${p.color && p.color !== '-' ? `<span class="muted small">(${escapeHtml(p.color)})</span>` : ''}
        </div>
        <div class="sp-meta">
          <span class="sp-brand">${escapeHtml(p.brand || 'Generic')}</span>
          ${p.type ? `<span class="sp-dot">·</span><span class="sp-type-pill">${escapeHtml(p.type)}</span>` : ''}
        </div>
      </div>
      <div class="sp-stock">
        <span class="badge ${p.stock <= (p.threshold || 5) ? 'low' : 'ok'}">${formatLiters(p.stock)} in stock</span>
      </div>
    </label>`;
  }).join('');

  openModal(s ? 'Edit Supplier' : 'Add Supplier', `
<form id="supplier-form" onsubmit="return submitSupplier(event, ${s ? `'${s.id}'` : 'null'})">
  <div class="form-grid">
    <div class="field full">
      <label for="sf-name">Supplier / Company Name <span style="color:var(--danger);">*</span></label>
      <input id="sf-name" placeholder="e.g. Pacific Paint (Boysen) Philippines, Inc." value="${s ? escapeHtml(s.name) : ''}" required>
    </div>
    <div class="field">
      <label for="sf-contact">Contact Person</label>
      <input id="sf-contact" placeholder="e.g. Juan dela Cruz (Sales Executive)" value="${s ? escapeHtml(s.contact || '') : ''}">
    </div>
    <div class="field">
      <label for="sf-phone">Contact Number (Phone / Mobile)</label>
      <input id="sf-phone" placeholder="e.g. 0917-123-4567 / (02) 8364-3505" value="${s ? escapeHtml(s.phone || '') : ''}">
    </div>
    <div class="field">
      <label for="sf-email">Email Address</label>
      <input id="sf-email" type="email" placeholder="e.g. sales@boysen.com.ph" value="${s ? escapeHtml(s.email || '') : ''}">
    </div>
    <div class="field">
      <label for="sf-address">Business Address</label>
      <input id="sf-address" placeholder="e.g. 292 D. Tuazon St., Quezon City" value="${s ? escapeHtml(s.address || '') : ''}">
    </div>
    <div class="field full">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; flex-wrap:wrap; gap:6px;">
        <label style="margin:0; font-weight:600; display:flex; align-items:center; gap:8px;">
          Associated Catalog Products
          <span id="sf-selected-count" class="badge ok" style="font-size:11px; font-weight:600;">${initialCount} linked</span>
        </label>
        <div class="supplier-products-actions">
          <button type="button" class="btn ghost small" style="padding:3px 8px; font-size:11.5px;" onclick="toggleAllSupplierProducts(true)">Select All</button>
          <button type="button" class="btn ghost small" style="padding:3px 8px; font-size:11.5px;" onclick="toggleAllSupplierProducts(false)">Clear</button>
        </div>
      </div>
      <div class="supplier-products-box">
        <div class="supplier-products-toolbar">
          <div class="supplier-prod-search-wrap">
            <span class="search-icon">🔍</span>
            <input id="sf-product-search" type="text" placeholder="Filter by product, brand, category, or hex…" autocomplete="off" oninput="filterSupplierProducts(this.value)">
          </div>
        </div>
        <div class="supplier-product-list" id="sf-products">
          ${productRows.length ? productRows : '<div style="padding:24px; text-align:center; color:var(--ink-soft); font-size:13px; grid-column:1 / -1;">No products found in catalog.</div>'}
        </div>
      </div>
    </div>
  </div>
</form>`,
    `<button class="btn secondary" onclick="closeModal()">Cancel</button><button class="btn" onclick="document.getElementById('supplier-form').requestSubmit()">Save Supplier</button>`,
    'wide'
  );
}

function onSupplierProductCheckChange(cb) {
  const label = cb.closest('.supplier-prod-item');
  if (label) {
    if (cb.checked) label.classList.add('selected');
    else label.classList.remove('selected');
  }
  updateSupplierSelectedCount();
}

function toggleAllSupplierProducts(check) {
  const items = document.querySelectorAll('#sf-products .supplier-prod-item');
  items.forEach(item => {
    if (item.style.display !== 'none') {
      const cb = item.querySelector('input[type="checkbox"]');
      if (cb) {
        cb.checked = check;
        if (check) item.classList.add('selected');
        else item.classList.remove('selected');
      }
    }
  });
  updateSupplierSelectedCount();
}

function updateSupplierSelectedCount() {
  const countEl = document.getElementById('sf-selected-count');
  if (!countEl) return;
  const count = document.querySelectorAll('#sf-products input[type="checkbox"]:checked').length;
  countEl.textContent = `${count} linked`;
  if (count > 0) {
    countEl.className = 'badge ok';
  } else {
    countEl.className = 'badge inactive';
  }
}

function filterSupplierProducts(q) {
  const term = (q || '').trim().toLowerCase();
  const items = document.querySelectorAll('#sf-products .supplier-prod-item');
  let matchCount = 0;
  items.forEach(item => {
    const haystack = item.getAttribute('data-search') || '';
    const match = !term || haystack.includes(term);
    item.style.display = match ? 'flex' : 'none';
    if (match) matchCount++;
  });

  let noMatchEl = document.getElementById('sf-no-matches');
  const container = document.getElementById('sf-products');
  if (!matchCount && term) {
    if (!noMatchEl && container) {
      noMatchEl = document.createElement('div');
      noMatchEl.id = 'sf-no-matches';
      noMatchEl.style.cssText = 'padding:24px; text-align:center; color:var(--ink-soft); font-size:12.5px; grid-column:1 / -1;';
      noMatchEl.textContent = `No products matching "${q}"`;
      container.appendChild(noMatchEl);
    }
  } else if (noMatchEl) {
    noMatchEl.remove();
  }
}

async function submitSupplier(e, id) {
  e.preventDefault();
  if (typeof currentUser !== 'undefined' && currentUser && currentUser.role !== 'admin') {
    logAudit(
      'UNAUTHORIZED_ACCESS',
      'Supplier Management',
      `Unauthorized attempt to add/edit supplier by ${(currentUser && currentUser.name) || 'User'}`,
      {
        entityName: 'Supplier Management',
        fieldChanged: 'Access Control Check',
        oldValue: `Role: ${(currentUser && currentUser.role) || 'none'}`,
        newValue: 'Blocked (Admin Required)',
        reason: 'Only administrators can add or edit suppliers'
      }
    );
    showToast('Permission denied: Only administrators can add or edit suppliers.', 'error');
    return false;
  }

  const nameVal = document.getElementById('sf-name').value.trim();
  const contactVal = (document.getElementById('sf-contact') ? document.getElementById('sf-contact').value.trim() : '');
  const phoneVal = (document.getElementById('sf-phone') ? document.getElementById('sf-phone').value.trim() : '');
  const emailVal = (document.getElementById('sf-email') ? document.getElementById('sf-email').value.trim() : '');
  const addressVal = (document.getElementById('sf-address') ? document.getElementById('sf-address').value.trim() : '');

  if (!nameVal) {
    showToast('Supplier Name is required.', 'error');
    return false;
  }

  // Prevent duplicate supplier names
  const normName = nameVal.toLowerCase();
  const duplicate = (db.suppliers || []).find(s => s.id !== id && (s.name || '').trim().toLowerCase() === normName);
  if (duplicate) {
    showToast(`A supplier named "${nameVal}" already exists. Please use a distinct name.`, 'error');
    return false;
  }

  const productIds = Array.from(document.querySelectorAll('#sf-products input[type="checkbox"]:checked')).map(el => el.value);

  const data = {
    name: nameVal,
    contact: contactVal,
    phone: phoneVal,
    email: emailVal,
    address: addressVal,
    productIds,
  };

  if (id) {
    const existing = supplierById(id);
    const changes = [];
    if (existing) {
      if ((existing.name || '') !== data.name) changes.push({ field: 'Supplier Name', oldValue: existing.name || '—', newValue: data.name });
      if ((existing.contact || '') !== data.contact) changes.push({ field: 'Contact Person', oldValue: existing.contact || '—', newValue: data.contact || '—' });
      if ((existing.phone || '') !== data.phone) changes.push({ field: 'Phone Number', oldValue: existing.phone || '—', newValue: data.phone || '—' });
      if ((existing.email || '') !== data.email) changes.push({ field: 'Email Address', oldValue: existing.email || '—', newValue: data.email || '—' });
      if ((existing.address || '') !== data.address) changes.push({ field: 'Address', oldValue: existing.address || '—', newValue: data.address || '—' });
      const oldProdCount = Array.isArray(existing.productIds) ? existing.productIds.length : 0;
      if (oldProdCount !== productIds.length) {
        changes.push({ field: 'Linked Products', oldValue: `${oldProdCount} product(s)`, newValue: `${productIds.length} product(s)` });
      }
      Object.assign(existing, data);
    }
    logAudit(
      'SUPPLIER_UPDATE',
      data.name,
      `Updated supplier "${data.name}" (Contact: ${data.contact || '—'}, Phone: ${data.phone || '—'}, Linked Products: ${productIds.length})${changes.length ? ' — ' + changes.map(c => `${c.field}: "${c.oldValue}" → "${c.newValue}"`).join(', ') : ''}`,
      {
        entityName: data.name,
        fieldChanged: changes.length === 1 ? changes[0].field : 'Supplier Profile',
        oldValue: changes.length === 1 ? changes[0].oldValue : (changes.map(c => `${c.field}: ${c.oldValue}`).join(' · ') || 'Previous Details'),
        newValue: changes.length === 1 ? changes[0].newValue : (`Contact: ${data.contact || '—'} · Phone: ${data.phone || '—'} · ${productIds.length} product(s)`),
        meta: { changes }
      }
    );
    showToast('Supplier profile updated successfully.', 'ok');
  } else {
    const newId = uid('s');
    db.suppliers.push({ id: newId, status: 'active', ...data });
    logAudit(
      'SUPPLIER_CREATE',
      data.name,
      `Added new supplier "${data.name}" (Contact: ${data.contact || '—'}, Phone: ${data.phone || '—'}, Linked Products: ${productIds.length})`,
      {
        entityName: data.name,
        fieldChanged: 'New Supplier Account',
        oldValue: 'None (New Supplier)',
        newValue: `${data.name} · Contact: ${data.contact || '—'} · Phone: ${data.phone || '—'} (${productIds.length} linked products)`
      }
    );
    showToast('New supplier added successfully.', 'ok');
  }

  await saveDB();
  closeModal();
  renderPage();
  return false;
}

async function toggleSupplierStatus(id) {
  if (typeof currentUser !== 'undefined' && currentUser && currentUser.role !== 'admin') {
    logAudit(
      'UNAUTHORIZED_ACCESS',
      'Supplier Management',
      `Unauthorized attempt to toggle supplier status by ${(currentUser && currentUser.name) || 'User'}`,
      {
        entityName: 'Supplier Management',
        fieldChanged: 'Access Control Check',
        oldValue: `Role: ${(currentUser && currentUser.role) || 'none'}`,
        newValue: 'Blocked (Admin Required)',
        reason: 'Only administrators can change supplier status'
      }
    );
    showToast('Permission denied: Only administrators can change supplier status.', 'error');
    return;
  }
  const s = supplierById(id);
  if (!s) return;
  const prevStatus = s.status === 'active' ? 'Active' : 'Inactive';
  s.status = s.status === 'active' ? 'inactive' : 'active';
  const newStatus = s.status === 'active' ? 'Active' : 'Inactive';
  logAudit(
    'SUPPLIER_STATUS',
    s.name,
    `Supplier "${s.name}" status changed from ${prevStatus} to ${newStatus}`,
    {
      entityName: s.name,
      fieldChanged: 'Supplier Status',
      oldValue: prevStatus,
      newValue: newStatus
    }
  );
  await saveDB();
  renderPage();
  showToast(`Supplier ${s.status === 'active' ? 'activated' : 'deactivated'}.`);
}

function deleteSupplier(id) {
  if (typeof currentUser !== 'undefined' && currentUser && currentUser.role !== 'admin') {
    showToast('Permission denied: Only administrators can manage suppliers.', 'error');
    return;
  }
  const s = supplierById(id);
  if (!s) return;

  // Prevent deletion of suppliers with historical purchase order references
  const hasPOs = (db.purchaseOrders || []).some(po => po.supplierId === id);
  if (hasPOs) {
    showToast(`Cannot delete supplier "${s.name}": Historical purchase orders exist for this supplier. You may deactivate the account instead.`, 'error');
    return;
  }

  showConfirm({
    title: `Delete Supplier "${s.name}"?`,
    message: `Are you sure you want to permanently delete this supplier? If you wish to preserve records, choose Deactivate instead.`,
    confirmLabel: 'Delete Supplier',
    confirmClass: 'btn danger',
    onConfirm: async () => {
      db.suppliers = (db.suppliers || []).filter(sup => sup.id !== id);
      logAudit('SUPPLIER_DELETE', s.name, `Deleted supplier "${s.name}"`, {
        entityName: s.name,
        fieldChanged: 'Supplier Account',
        oldValue: s.name,
        newValue: 'Deleted'
      });
      await saveDB();
      renderPage();
      showToast(`Supplier "${s.name}" deleted.`, 'ok');
    }
  });
}
