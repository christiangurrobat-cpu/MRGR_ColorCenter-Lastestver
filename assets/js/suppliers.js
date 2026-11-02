/* ============================================================
   15. SUPPLIERS (Admin: full CRUD | Staff: View only)
   ============================================================ */
let expandedSupplierIds = new Set();

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

function suppliersPage() {
  const isAdmin = typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'admin';
  return `
  <div class="panel">
<div class="panel-head row">
  <div>
    <h3>Suppliers</h3>
    <div class="muted small" style="margin-top:2px;">Manage supplier accounts, contact persons, and linked catalog products.</div>
  </div>
  <div class="spacer"></div>
  ${isAdmin ? '<button class="btn small" onclick="openSupplierModal()">+ Add Supplier</button>' : ''}
</div>
<div class="panel-body tight table-scroll">${supplierTableHtml(isAdmin)}</div>
  </div>`;
}

function suppliersViewPage() {
  return `
  <div class="panel">
<div class="panel-head row">
  <div>
    <h3>Supplier Directory</h3>
    <div class="muted small" style="margin-top:2px;">Directory of accredited suppliers, contacts, and supplied products (view-only).</div>
  </div>
  <div class="spacer"></div>
</div>
<div class="panel-body tight table-scroll">${supplierTableHtml(false)}</div>
  </div>`;
}

function supplierTableHtml(editable) {
  const isAdmin = typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'admin';
  const canEdit = Boolean(editable && isAdmin);
  return `
  <table>
<thead><tr><th>Supplier</th><th>Contact</th><th>Phone</th><th>Products Supplied</th><th>Status</th>${canEdit ? '<th></th>' : ''}</tr></thead>
<tbody>
  ${db.suppliers.length ? db.suppliers.map(s => {
    const isExpanded = expandedSupplierIds.has(s.id);
    const validProductIds = (s.productIds || []).filter(id => Boolean(productById(id)));
    const initialProductIds = validProductIds.slice(0, 3);
    const extraProductIds = validProductIds.slice(3);
    const hasMore = extraProductIds.length > 0;

    return `
    <tr>
      <td><strong>${escapeHtml(s.name)}</strong></td>
      <td>${escapeHtml(s.contact || '—')}</td>
      <td>${escapeHtml(s.phone || '—')}</td>
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
      <td>${s.status === 'active' ? '<span class="badge ok">Active</span>' : '<span class="badge inactive">Inactive</span>'}</td>
      ${canEdit ? `<td class="row">
        <button class="btn ghost small" onclick="openSupplierModal('${s.id}')">Edit</button>
        <button class="btn ghost small" onclick="toggleSupplierStatus('${s.id}')">${s.status === 'active' ? 'Deactivate' : 'Activate'}</button>
      </td>` : ''}
    </tr>`;
  }).join('') : `<tr><td colspan="${canEdit ? 6 : 5}" class="empty-state">No suppliers yet.</td></tr>`}
</tbody>
  </table>`;
}

function openSupplierModal(id) {
  if (typeof currentUser !== 'undefined' && currentUser && currentUser.role !== 'admin') {
    showToast('Permission denied: Only administrators can add or edit suppliers.', 'error');
    return;
  }
  const s = id ? supplierById(id) : null;
  const linkedIds = new Set(s ? s.productIds : []);
  const initialCount = linkedIds.size;

  const productRows = db.products.map(p => {
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
        <span class="badge ${p.stock <= p.threshold ? 'low' : 'ok'}">${formatLiters(p.stock)} in stock</span>
      </div>
    </label>`;
  }).join('');

  openModal(s ? 'Edit Supplier' : 'Add Supplier', `
<form id="supplier-form" onsubmit="return submitSupplier(event, ${s ? `'${s.id}'` : 'null'})">
  <div class="form-grid">
    <div class="field full">
      <label>Supplier / Company Name <span style="color:var(--danger);">*</span></label>
      <input id="sf-name" placeholder="e.g. Pacific Paint (Boysen) Philippines, Inc." value="${s ? escapeHtml(s.name) : ''}" required>
    </div>
    <div class="field">
      <label>Contact Person</label>
      <input id="sf-contact" placeholder="e.g. Juan dela Cruz (Sales Executive)" value="${s ? escapeHtml(s.contact) : ''}">
    </div>
    <div class="field">
      <label>Phone / Mobile</label>
      <input id="sf-phone" placeholder="e.g. 0917-123-4567 / (02) 8364-3505" value="${s ? escapeHtml(s.phone) : ''}">
    </div>
    <div class="field full">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; flex-wrap:wrap; gap:6px;">
        <label style="margin:0; font-weight:600; display:flex; align-items:center; gap:8px;">
          Products Supplied
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
    showToast('Permission denied: Only administrators can add or edit suppliers.', 'error');
    return false;
  }
  const productIds = Array.from(document.querySelectorAll('#sf-products input[type="checkbox"]:checked')).map(el => el.value);
  const data = {
    name: document.getElementById('sf-name').value.trim(),
    contact: document.getElementById('sf-contact').value.trim(),
    phone: document.getElementById('sf-phone').value.trim(),
    productIds,
  };
  logAudit(id ? 'SUPPLIER_UPDATE' : 'SUPPLIER_CREATE', 'Supplier', `Supplier ${data.name}`);
  if (id) { Object.assign(supplierById(id), data); showToast('Supplier updated.'); }
  else { db.suppliers.push({ id: uid('s'), status: 'active', ...data }); showToast('Supplier added.'); }
  await saveDB();
  closeModal();
  renderPage();
  return false;
}

async function toggleSupplierStatus(id) {
  if (typeof currentUser !== 'undefined' && currentUser && currentUser.role !== 'admin') {
    showToast('Permission denied: Only administrators can change supplier status.', 'error');
    return;
  }
  const s = supplierById(id);
  s.status = s.status === 'active' ? 'inactive' : 'active';
  logAudit('SUPPLIER_STATUS', 'Supplier', `Supplier ${s.name} set to ${s.status}`);
  await saveDB();
  renderPage();
  showToast(`Supplier ${s.status === 'active' ? 'activated' : 'deactivated'}.`);
}
