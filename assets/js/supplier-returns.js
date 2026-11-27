/* ============================================================
   17b. DAMAGED STOCK INSPECTION & SUPPLIER RETURNS
   ============================================================ */

const SR_DAMAGE_REASONS = [
  'Leaking Paint',
  'Broken / Damaged Container',
  'Missing Product',
  'Incorrect Product Delivered',
  'Expired Product',
  'Contaminated Paint',
  'Other'
];

const SR_RETURN_STATUSES = [
  'Pending Return',
  'Returned to Supplier',
  'Awaiting Replacement',
  'Replacement Received',
  'Credit Issued',
  'Refund Received',
  'Rejected by Supplier',
  'Closed'
];

const SR_ADMIN_ONLY_STATUSES = [
  'Credit Issued',
  'Refund Received',
  'Rejected by Supplier',
  'Closed'
];

const SR_RESOLUTION_TYPES = [
  'Replacement Stock',
  'Supplier Credit',
  'Refund',
  'No Replacement / Write-Off'
];

const SR_REPLACEMENT_STATUSES = [
  'Awaiting Supplier Confirmation',
  'Confirmed by Supplier – Awaiting Delivery',
  'Partially Received',
  'Under Physical Inspection',
  'Completed',
  'Cancelled',
  'Supplier Declined'
];

const srState = {
  loaded: false,
  loading: false,
  damagedRecords: [],
  returns: [],
  replacementRequests: [],
  poReplacementSummary: {},
  activeBatches: [],
  summary: {
    totalDamagedRecords: 0,
    unreturnedDamagedUnits: 0,
    activeReturns: 0,
    pendingApprovalReturns: 0,
    awaitingReplacementUnits: 0,
    resolvedReturns: 0
  },
  subTab: 'history', // 'history' | 'damaged'
  search: '',
  statusFilter: 'all',
  dateFrom: '',
  dateTo: '',
  sortBy: 'date-desc'
};

function srIsAdmin() {
  return !!(typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'admin');
}

function applySupplierReturnsPayload(json) {
  if (!json || !json.success) return;
  srState.loaded = true;
  srState.damagedRecords = Array.isArray(json.damagedRecords) ? json.damagedRecords : [];
  srState.returns = Array.isArray(json.returns) ? json.returns : [];
  srState.replacementRequests = Array.isArray(json.replacementRequests) ? json.replacementRequests : [];
  srState.poReplacementSummary = (json.poReplacementSummary && typeof json.poReplacementSummary === 'object') ? json.poReplacementSummary : {};
  srState.activeBatches = Array.isArray(json.activeBatches) ? json.activeBatches : [];
  if (json.summary) srState.summary = json.summary;
  updateSupplierReturnsHistoryCount();
  renderActiveReplacementTrackingPanel();
  if (typeof updateReceivingPOGridOnly === 'function' && document.getElementById('rcv-po-picker-grid')) {
    updateReceivingPOGridOnly();
  }
}

function renderActiveReplacementTrackingPanel() {
  const el = document.getElementById('rcv-active-replacements-panel');
  if (!el) return;
  const active = (srState.replacementRequests || []).filter(r => !r.isResolved);
  if (!active.length) {
    el.innerHTML = '';
    return;
  }
  const totalPending = active.reduce((sum, r) => sum + (Number(r.remainingQty) || 0), 0);
  el.innerHTML = `
    <div class="panel" style="margin-top:16px; border-color:var(--warning-border);">
      <div class="panel-head row wrap" style="gap:10px;">
        <div>
          <h3 style="margin:0; display:flex; align-items:center; gap:8px;">
            <span>🔄 Active Replacement Tracking</span>
            <span class="badge po-partial">${active.length} Open · ${totalPending} unit${totalPending === 1 ? '' : 's'} pending</span>
          </h3>
          <span class="muted small">Processed damaged receiving transactions moved here automatically — receive replacements via physical inspection without duplicating POs or payables.</span>
        </div>
        <div class="spacer"></div>
        <button type="button" class="btn secondary small" onclick="openSupplierReturnsHistoryModal('replacements')">📋 Full Replacement History</button>
      </div>
      <div class="panel-body tight">
        <div class="table-scroll">
          <table class="sr-table">
            <thead>
              <tr>
                <th>Replacement Ref</th>
                <th>Original PO</th>
                <th>Supplier</th>
                <th>Product &amp; Size</th>
                <th class="right">Requested / Rcvd</th>
                <th>Supplier Confirmation</th>
                <th>Status</th>
                <th class="right">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${active.map(req => {
    return `
                  <tr>
                    <td>
                      <div class="sr-ref-code">${escapeHtml(req.requestRef)}</div>
                      <div class="muted small">${escapeHtml(req.requestDate)} · ${escapeHtml(req.staffResponsible)}</div>
                    </td>
                    <td><span class="sr-po-code">${escapeHtml(req.poNumber)}</span></td>
                    <td>${escapeHtml(req.supplierName)}</td>
                    <td>
                      <div class="sr-item-line">
                        <span class="sr-item-name">${escapeHtml(req.productName)}</span>
                        <span class="sr-size-pill">${req.containerSize}L</span>
                      </div>
                      <div class="muted small">Reason: ${escapeHtml(req.reason)}</div>
                    </td>
                    <td class="right">
                      <div class="sr-qty-val">${req.receivedQty} / ${req.requestedQty}</div>
                      <div class="sr-qty-sub">${req.remainingQty} pending</div>
                    </td>
                    <td>
                      <div>${req.supplierConfirmed ? '<span style="color:var(--success); font-weight:700;">✓ Confirmed</span>' : '<span class="muted">Awaiting</span>'}</div>
                      ${req.confirmationReceipt ? `<div class="muted small"><a href="javascript:void(0)" onclick="openReplacementReceiptModal('${req.id}', 'confirmation')" style="color:var(--teal-text); font-weight:700; text-decoration:none;">🧾 ${escapeHtml(req.confirmationReceipt.receiptNumber)}</a></div>` : (req.confirmationDate ? `<div class="muted small">${escapeHtml(req.confirmationDate)}</div>` : '')}
                    </td>
                    <td><span class="sr-status-badge ${srReplacementStatusBadgeClass(req.status)}">${escapeHtml(req.status)}</span></td>
                    <td class="right sr-actions-cell">
                      <button type="button" class="btn secondary small" onclick="openManageReplacementRequestModal('${req.id}')">Manage</button>
                    </td>
                  </tr>`;
  }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
}

function updateSupplierReturnsHistoryCount() {
  const badge = document.getElementById('rcv-sr-history-count');
  const activeRepCount = (srState.replacementRequests || []).filter(r => !r.isResolved).length;
  const count = (srState.returns ? srState.returns.length : 0) + activeRepCount;
  if (badge) {
    if (count > 0) {
      badge.textContent = String(count);
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }
  }
}

async function loadSupplierReturns(force = false) {
  if (srState.loading) return;
  if (srState.loaded && !force) {
    renderSupplierReturnsHistoryModalBody();
    return;
  }
  srState.loading = true;
  try {
    const resp = await fetch('api/supplier_returns.php?action=list', { cache: 'no-store' });
    const json = await resp.json();
    if (json && json.success) {
      applySupplierReturnsPayload(json);
    }
  } catch (err) {
    console.error('Failed to load supplier returns:', err);
  } finally {
    srState.loading = false;
    renderSupplierReturnsHistoryModalBody();
  }
}

function srStatusBadgeClass(status) {
  switch (status) {
    case 'Pending Return': return 'sr-badge-pending';
    case 'Returned to Supplier': return 'sr-badge-returned';
    case 'Awaiting Replacement': return 'sr-badge-awaiting';
    case 'Replacement Received': return 'sr-badge-replaced';
    case 'Credit Issued': return 'sr-badge-credit';
    case 'Refund Received': return 'sr-badge-refund';
    case 'Rejected by Supplier': return 'sr-badge-rejected';
    case 'Closed': return 'sr-badge-closed';
    default: return 'sr-badge-pending';
  }
}

function srSwitchSubTab(tab) {
  srState.subTab = ['history', 'damaged', 'replacements'].includes(tab) ? tab : 'history';
  renderSupplierReturnsHistoryModalBody();
}

function srOnSearchInput(val) {
  srState.search = val || '';
  renderSupplierReturnsTableOnly();
}

function srOnFilterChange(field, val) {
  srState[field] = val || '';
  renderSupplierReturnsTableOnly();
}

function srResetFilters() {
  srState.search = '';
  srState.statusFilter = 'all';
  srState.dateFrom = '';
  srState.dateTo = '';
  srState.sortBy = 'date-desc';
  renderSupplierReturnsHistoryModalBody();
}

function getFilteredSupplierReturns() {
  const q = (srState.search || '').trim().toLowerCase();
  let list = (srState.returns || []).slice();

  if (srState.statusFilter && srState.statusFilter !== 'all') {
    list = list.filter(r => r.status === srState.statusFilter);
  }
  if (srState.dateFrom) {
    list = list.filter(r => String(r.returnDate || '').slice(0, 10) >= srState.dateFrom);
  }
  if (srState.dateTo) {
    list = list.filter(r => String(r.returnDate || '').slice(0, 10) <= srState.dateTo);
  }
  if (q) {
    list = list.filter(r => {
      const itemMatch = (r.items || []).some(it =>
        String(it.productName || '').toLowerCase().includes(q) ||
        String(it.reason || '').toLowerCase().includes(q) ||
        String(it.batchNumber || '').toLowerCase().includes(q)
      );
      return (
        String(r.returnRef || '').toLowerCase().includes(q) ||
        String(r.poNumber || '').toLowerCase().includes(q) ||
        String(r.supplierName || '').toLowerCase().includes(q) ||
        String(r.reason || '').toLowerCase().includes(q) ||
        String(r.resolutionType || '').toLowerCase().includes(q) ||
        itemMatch
      );
    });
  }

  list.sort((a, b) => {
    const tsA = Date.parse(a.returnDate || a.createdAt || '') || 0;
    const tsB = Date.parse(b.returnDate || b.createdAt || '') || 0;
    switch (srState.sortBy) {
      case 'date-asc':
        return (tsA - tsB) || String(a.returnRef).localeCompare(String(b.returnRef));
      case 'ref-asc':
        return String(a.returnRef).localeCompare(String(b.returnRef), undefined, { numeric: true });
      case 'ref-desc':
        return String(b.returnRef).localeCompare(String(a.returnRef), undefined, { numeric: true });
      case 'supplier-asc':
        return String(a.supplierName || '').localeCompare(String(b.supplierName || ''), undefined, { sensitivity: 'base' }) || (tsB - tsA);
      case 'supplier-desc':
        return String(b.supplierName || '').localeCompare(String(a.supplierName || ''), undefined, { sensitivity: 'base' }) || (tsB - tsA);
      case 'qty-desc':
        return ((Number(b.totalDamagedQty) || 0) - (Number(a.totalDamagedQty) || 0)) || (tsB - tsA);
      case 'qty-asc':
        return ((Number(a.totalDamagedQty) || 0) - (Number(b.totalDamagedQty) || 0)) || (tsB - tsA);
      case 'date-desc':
      default:
        return (tsB - tsA) || String(b.returnRef).localeCompare(String(a.returnRef));
    }
  });

  return list;
}

function getFilteredDamagedRecords() {
  const q = (srState.search || '').trim().toLowerCase();
  let list = (srState.damagedRecords || []).slice();
  if (srState.dateFrom) {
    list = list.filter(d => String(d.recordedAt || '').slice(0, 10) >= srState.dateFrom);
  }
  if (srState.dateTo) {
    list = list.filter(d => String(d.recordedAt || '').slice(0, 10) <= srState.dateTo);
  }
  if (q) {
    list = list.filter(d =>
      String(d.poNumber || '').toLowerCase().includes(q) ||
      String(d.supplierName || '').toLowerCase().includes(q) ||
      String(d.productName || '').toLowerCase().includes(q) ||
      String(d.reason || '').toLowerCase().includes(q) ||
      String(d.batchNumber || '').toLowerCase().includes(q)
    );
  }
  return list;
}

function renderSupplierReturnsTableHtml() {
  const list = getFilteredSupplierReturns();
  const isAdmin = srIsAdmin();

  if (!list.length) {
    return `
      <div class="sr-empty-state">
        <div class="sr-empty-icon">📦</div>
        <div class="sr-empty-title">No supplier return records found</div>
        <div class="muted small">Record damaged items during Stock Receiving or report post-receiving damage, then create a Supplier Return.</div>
      </div>`;
  }

  return `
    <div class="table-scroll sr-table-wrap">
      <table class="sr-table">
        <thead>
          <tr>
            <th>Return Ref</th>
            <th>PO Number</th>
            <th>Supplier</th>
            <th>Product &amp; Size</th>
            <th class="right">Damaged Qty</th>
            <th>Return Reason</th>
            <th>Return Date</th>
            <th>Status</th>
            <th>Resolution</th>
            <th class="right">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${list.map(ret => {
    const items = ret.items || [];
    const prodHtml = items.map(it => `
              <div class="sr-item-line">
                <span class="sr-item-name">${escapeHtml(it.productName)}</span>
                <span class="sr-size-pill">${it.containerSize}L</span>
                ${it.batchNumber ? `<span class="sr-batch-pill" title="Batch">${escapeHtml(it.batchNumber)}</span>` : ''}
              </div>
            `).join('');
    const pendingRep = Math.max(0, (ret.totalDamagedQty || 0) - (ret.totalReplacementReceivedQty || 0));
    const canReceiveRep = ret.resolutionType === 'Replacement Stock' && !ret.isFinalized && pendingRep > 0 && (ret.isApproved || isAdmin);
    const canApprove = isAdmin && !ret.isApproved && !ret.isFinalized;

    return `
              <tr>
                <td>
                  <div class="sr-ref-code">${escapeHtml(ret.returnRef)}</div>
                  ${!ret.isApproved && !ret.isFinalized ? `<div class="sr-approval-pill pending">⏳ Needs Admin Approval</div>` : ''}
                  ${ret.isFinalized ? `<div class="sr-approval-pill locked">🔒 Finalized</div>` : ''}
                </td>
                <td><span class="sr-po-code">${escapeHtml(ret.poNumber || '—')}</span></td>
                <td>${escapeHtml(ret.supplierName || '—')}</td>
                <td>${prodHtml || '<span class="muted">—</span>'}</td>
                <td class="right">
                  <div class="sr-qty-val">${ret.totalDamagedQty} unit${ret.totalDamagedQty === 1 ? '' : 's'}</div>
                  ${ret.resolutionType === 'Replacement Stock' && ret.totalReplacementReceivedQty > 0
        ? `<div class="sr-qty-sub">${ret.totalReplacementReceivedQty}/${ret.totalDamagedQty} replaced</div>` : ''}
                </td>
                <td><span class="sr-reason-txt">${escapeHtml(ret.reason)}</span></td>
                <td class="sr-date-cell">${escapeHtml(formatDateShort ? formatDateShort(ret.returnDate) : ret.returnDate)}</td>
                <td><span class="sr-status-badge ${srStatusBadgeClass(ret.status)}">${escapeHtml(ret.status)}</span></td>
                <td>
                  <div class="sr-res-type">${escapeHtml(ret.resolutionType)}</div>
                  ${ret.creditAmount !== null && ret.creditAmount !== undefined
        ? `<div class="sr-qty-sub">${typeof peso === 'function' ? peso(ret.creditAmount) : ret.creditAmount}</div>` : ''}
                </td>
                <td class="right sr-actions-cell">
                  ${canApprove ? `<button type="button" class="btn small" onclick="srApproveReturn('${ret.id}')" title="Approve Supplier Return">✓ Approve</button>` : ''}
                  ${canReceiveRep ? `<button type="button" class="btn secondary small" onclick="openReceiveReplacementModal('${ret.id}')" title="Receive Replacement Stock">📥 Receive</button>` : ''}
                  <button type="button" class="btn ghost small" onclick="openSupplierReturnDetailModal('${ret.id}')">${ret.isFinalized ? '👁️ View' : '⚙️ Manage'}</button>
                </td>
              </tr>`;
  }).join('')}
        </tbody>
      </table>
    </div>`;
}

function renderDamagedQueueTableHtml() {
  const list = getFilteredDamagedRecords();
  if (!list.length) {
    return `
      <div class="sr-empty-state">
        <div class="sr-empty-icon">✓</div>
        <div class="sr-empty-title">No damaged stock records found</div>
        <div class="muted small">Damaged items discovered during PO receiving or post-receiving inspection will appear here, completely isolated from sellable inventory.</div>
      </div>`;
  }

  return `
    <div class="table-scroll sr-table-wrap">
      <table class="sr-table">
        <thead>
          <tr>
            <th>Recorded</th>
            <th>Source</th>
            <th>PO / Batch</th>
            <th>Supplier</th>
            <th>Product &amp; Size</th>
            <th class="right">Damaged</th>
            <th class="right">Returned</th>
            <th class="right">Eligible</th>
            <th>Reason &amp; Notes</th>
            <th class="right">Action</th>
          </tr>
        </thead>
        <tbody>
          ${list.map(d => `
            <tr>
              <td class="sr-date-cell">
                <div>${escapeHtml(formatDateShort ? formatDateShort(d.recordedAt) : d.recordedAt)}</div>
                <div class="muted small">${escapeHtml(d.recordedBy || '')}</div>
              </td>
              <td>
                <span class="sr-source-badge ${d.source === 'post_receiving' ? 'post' : 'rcv'}">
                  ${d.source === 'post_receiving' ? 'Post-Receiving' : 'On Delivery'}
                </span>
              </td>
              <td>
                <div class="sr-po-code">${escapeHtml(d.poNumber || '—')}</div>
                ${d.batchNumber ? `<div class="sr-batch-pill">${escapeHtml(d.batchNumber)}</div>` : ''}
              </td>
              <td>${escapeHtml(d.supplierName || '—')}</td>
              <td>
                <div class="sr-item-line">
                  <span class="sr-item-name">${escapeHtml(d.productName)}</span>
                  <span class="sr-size-pill">${d.containerSize}L</span>
                </div>
              </td>
              <td class="right"><b>${d.damagedQty}</b></td>
              <td class="right">${d.returnedQty}</td>
              <td class="right"><b class="${d.eligibleQty > 0 ? 'sr-eligible-open' : 'muted'}">${d.eligibleQty}</b></td>
              <td>
                <div class="sr-reason-txt">${escapeHtml(d.reason)}</div>
                ${d.inspectionNotes ? `<div class="muted small">${escapeHtml(d.inspectionNotes)}</div>` : ''}
              </td>
              <td class="right" style="white-space:nowrap;">
                ${d.poId ? `<button type="button" class="btn secondary small" onclick="openCreateReplacementRequestModal('${escapeAttr(d.id)}', '${escapeAttr(d.poId)}')" title="Create Supplier Replacement Request linked to PO">🔄 Replace</button> ` : ''}
                ${d.eligibleQty > 0
      ? `<button type="button" class="btn small" onclick="openCreateSupplierReturnModal('${escapeAttr(d.poId || '')}', '${escapeAttr(d.id)}')">↩ Return</button>`
      : `<span class="muted small">Returned</span>`}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`;
}

function renderSupplierReturnsTableOnly() {
  const wrap = document.getElementById('sr-table-region');
  if (!wrap) return;
  if (srState.subTab === 'damaged') {
    wrap.innerHTML = renderDamagedQueueTableHtml();
  } else if (srState.subTab === 'replacements') {
    wrap.innerHTML = renderReplacementRequestsTableHtml();
  } else {
    wrap.innerHTML = renderSupplierReturnsTableHtml();
  }
}

function openSupplierReturnsHistoryModal(initialTab = null) {
  if (['damaged', 'history', 'replacements'].includes(initialTab)) {
    srState.subTab = initialTab;
  }
  const bodyHtml = `<div id="sr-history-modal-body"><div class="muted small" style="padding:24px; text-align:center;">Loading Supplier Returns, Replacements &amp; Damaged Stock history…</div></div>`;
  const footHtml = `<button type="button" class="btn secondary" onclick="closeModal()">Close</button>`;
  openModal('Supplier Returns, Replacements & Damaged Stock History', bodyHtml, footHtml);
  loadSupplierReturns(true);
}

function renderSupplierReturnsHistoryModalBody() {
  const container = document.getElementById('sr-history-modal-body');
  if (!container) return;

  if (srState.loading && !srState.loaded) {
    container.innerHTML = `<div class="muted small" style="padding:24px; text-align:center;">Loading Supplier Returns, Replacements &amp; Damaged Stock history…</div>`;
    return;
  }

  const eligibleCount = (srState.damagedRecords || []).filter(d => d.eligibleQty > 0).length;
  const activeRepCount = (srState.replacementRequests || []).filter(r => !r.isResolved).length;

  container.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:12px;">
      <!-- Sub-tabs & Actions -->
      <div class="sr-topbar">
        <div class="sr-subtabs">
          <button type="button" class="btn ${srState.subTab === 'replacements' ? '' : 'ghost'} small" onclick="srSwitchSubTab('replacements')">
            🔄 Replacements &amp; Credits (${srState.replacementRequests.length})${activeRepCount > 0 ? ` <span class="rcv-tab-count" style="margin-left:4px;">${activeRepCount}</span>` : ''}
          </button>
          <button type="button" class="btn ${srState.subTab === 'damaged' ? '' : 'ghost'} small" onclick="srSwitchSubTab('damaged')">
            ⚠️ Damaged Stock (${srState.damagedRecords.length})${eligibleCount > 0 ? ` <span class="rcv-tab-count" style="margin-left:4px;">${eligibleCount}</span>` : ''}
          </button>
          ${(srState.returns && srState.returns.length > 0) ? `
            <button type="button" class="btn ${srState.subTab === 'history' ? '' : 'ghost'} small" onclick="srSwitchSubTab('history')" title="Read-only archive of historical SRET supplier return records">
              📋 Legacy Returns Archive (${srState.returns.length})
            </button>
          ` : ''}
        </div>
        <div class="sr-top-actions">
          <button type="button" class="btn small" onclick="openCreateReplacementRequestModal()">
            🔄 Create Replacement Request
          </button>
          <button type="button" class="btn secondary small" onclick="openPostReceivingDamageModal()">
            ⚠️ Report Post-Receiving Damage
          </button>
        </div>
      </div>

      <!-- Search, Date, Status, and Sort Filters -->
      <div class="sr-filter-bar">
        <div class="sr-search-wrap">
          <span class="rcv-po-search-icon">🔍</span>
          <input type="text" class="rcv-po-search" placeholder="Search Ref, PO #, Supplier, Product, Reason..." value="${escapeAttr(srState.search)}" oninput="srOnSearchInput(this.value)">
        </div>
        <input type="date" class="sr-filter-input" title="From Date" value="${escapeAttr(srState.dateFrom)}" onchange="srOnFilterChange('dateFrom', this.value)">
        <input type="date" class="sr-filter-input" title="To Date" value="${escapeAttr(srState.dateTo)}" onchange="srOnFilterChange('dateTo', this.value)">
        ${srState.subTab === 'replacements' ? `
          <select class="sr-filter-select" title="Filter by Replacement Status" onchange="srOnFilterChange('statusFilter', this.value)">
            <option value="all" ${srState.statusFilter === 'all' ? 'selected' : ''}>All Statuses</option>
            ${SR_REPLACEMENT_STATUSES.map(st => `<option value="${escapeAttr(st)}" ${srState.statusFilter === st ? 'selected' : ''}>${escapeHtml(st)}</option>`).join('')}
          </select>
        ` : ''}
        ${srState.subTab === 'history' ? `
          <select class="sr-filter-select" title="Filter by Return Status" onchange="srOnFilterChange('statusFilter', this.value)">
            <option value="all" ${srState.statusFilter === 'all' ? 'selected' : ''}>All Statuses</option>
            ${SR_RETURN_STATUSES.map(st => `<option value="${escapeAttr(st)}" ${srState.statusFilter === st ? 'selected' : ''}>${escapeHtml(st)}</option>`).join('')}
          </select>
          <select class="sr-filter-select" title="Sort Supplier Returns" onchange="srOnFilterChange('sortBy', this.value)">
            <option value="date-desc" ${srState.sortBy === 'date-desc' ? 'selected' : ''}>Newest Date First</option>
            <option value="date-asc" ${srState.sortBy === 'date-asc' ? 'selected' : ''}>Oldest Date First</option>
            <option value="ref-asc" ${srState.sortBy === 'ref-asc' ? 'selected' : ''}>Return Ref (Ascending)</option>
            <option value="ref-desc" ${srState.sortBy === 'ref-desc' ? 'selected' : ''}>Return Ref (Descending)</option>
            <option value="supplier-asc" ${srState.sortBy === 'supplier-asc' ? 'selected' : ''}>Supplier (A–Z)</option>
            <option value="supplier-desc" ${srState.sortBy === 'supplier-desc' ? 'selected' : ''}>Supplier (Z–A)</option>
            <option value="qty-desc" ${srState.sortBy === 'qty-desc' ? 'selected' : ''}>Highest Qty First</option>
            <option value="qty-asc" ${srState.sortBy === 'qty-asc' ? 'selected' : ''}>Lowest Qty First</option>
          </select>
        ` : ''}
        ${(srState.search || srState.dateFrom || srState.dateTo || srState.statusFilter !== 'all') ? `
          <button type="button" class="btn ghost small" onclick="srResetFilters()">Reset</button>
        ` : ''}
      </div>

      <div id="sr-table-region" style="max-height:420px; overflow-y:auto;">
        ${srState.subTab === 'damaged' ? renderDamagedQueueTableHtml() : (srState.subTab === 'replacements' ? renderReplacementRequestsTableHtml() : renderSupplierReturnsTableHtml())}
      </div>
    </div>
  `;
}

/* ============================================================
   MODAL 1: Report Post-Receiving Damage (Quarantine & Deduct)
   ============================================================ */
function openPostReceivingDamageModal() {
  const products = (db.products || []).filter(p => p.status !== 'inactive' && (Number(p.stock) || 0) > 0);
  const pos = (db.purchaseOrders || []).filter(o => o.status === 'partial' || o.status === 'received');

  const bodyHtml = `
    <div class="sr-modal-notice warn">
      ⚠️ <b>Inventory Protection:</b> Reporting damage discovered after receiving immediately deducts the damaged units from sellable inventory &amp; FIFO batch stock and moves them to the Quarantined Damaged Stock Queue. Creating a Supplier Return later will <b>not</b> deduct stock a second time.
    </div>
    <div class="sr-form-grid">
      <label class="sr-field full">
        <span>Product (with available sealed stock) *</span>
        <select id="sr-post-product" onchange="srPostProductChanged()">
          <option value="">— Select Product —</option>
          ${products.map(p => `<option value="${escapeAttr(p.productId || p.id)}">${escapeHtml(p.name)} (${escapeHtml(p.brand || '')}) — ${formatLiters(p.stock)}</option>`).join('')}
        </select>
      </label>
      <label class="sr-field">
        <span>Container Size *</span>
        <select id="sr-post-size" onchange="srPostSizeChanged()">
          <option value="">— Select Product First —</option>
        </select>
      </label>
      <label class="sr-field">
        <span>Damaged Quantity (Cans) *</span>
        <input type="number" id="sr-post-qty" min="1" step="1" value="1" placeholder="1">
        <small id="sr-post-avail-hint" class="muted"></small>
      </label>
      <label class="sr-field full">
        <span>Linked Batch / Lot (Recommended — preserves FIFO &amp; links PO)</span>
        <select id="sr-post-batch" onchange="srPostBatchChanged()">
          <option value="">Auto FIFO (oldest batch first)</option>
        </select>
      </label>
      <label class="sr-field full">
        <span>Related Purchase Order (Optional)</span>
        <select id="sr-post-po">
          <option value="">— None / Auto from Batch —</option>
          ${pos.map(o => `<option value="${escapeAttr(o.id)}">${escapeHtml(o.poNumber)} — ${escapeHtml(o.supplierName)}</option>`).join('')}
        </select>
      </label>
      <label class="sr-field full">
        <span>Damage Reason *</span>
        <select id="sr-post-reason">
          ${SR_DAMAGE_REASONS.map(r => `<option value="${escapeAttr(r)}">${escapeHtml(r)}</option>`).join('')}
        </select>
      </label>
      <label class="sr-field full">
        <span>Inspection Notes / Evidence</span>
        <textarea id="sr-post-notes" rows="2" placeholder="Describe the damage discovered in storage or handling..."></textarea>
      </label>
    </div>
  `;

  const footHtml = `
    <button type="button" class="btn secondary" onclick="closeModal()">Cancel</button>
    <button type="button" class="btn danger" id="sr-post-submit-btn" onclick="submitPostReceivingDamage()">⚠️ Quarantine Damaged Stock</button>
  `;

  openModal('Report Post-Receiving Damaged Stock', bodyHtml, footHtml);
}

function srPostProductChanged() {
  const pid = document.getElementById('sr-post-product')?.value || '';
  const sizeSel = document.getElementById('sr-post-size');
  if (!sizeSel) return;
  const p = productById(pid);
  if (!p) {
    sizeSel.innerHTML = `<option value="">— Select Product First —</option>`;
    srPostSizeChanged();
    return;
  }
  const sizes = productSizes(p);
  sizeSel.innerHTML = sizes.map(sz => {
    const cans = productCanCount(p, sz);
    const v = productSizeVariantBySize(p, sz);
    const sid = v ? v.sizeId : '';
    return `<option value="${sz}" data-size-id="${escapeAttr(sid)}" data-avail="${cans}" ${cans <= 0 ? 'disabled' : ''}>${sz}L Can (${cans} sealed available)</option>`;
  }).join('');
  // Select first available size
  const firstAvail = Array.from(sizeSel.options).find(o => !o.disabled);
  if (firstAvail) sizeSel.value = firstAvail.value;
  srPostSizeChanged();
}

function srPostSizeChanged() {
  const pid = document.getElementById('sr-post-product')?.value || '';
  const sizeSel = document.getElementById('sr-post-size');
  const qtyEl = document.getElementById('sr-post-qty');
  const hintEl = document.getElementById('sr-post-avail-hint');
  const batchSel = document.getElementById('sr-post-batch');
  if (!sizeSel || !batchSel) return;

  const opt = sizeSel.selectedOptions[0];
  const sz = parseFloat(sizeSel.value) || 0;
  const sid = opt ? (opt.dataset.sizeId || '') : '';
  const avail = opt ? (parseInt(opt.dataset.avail || '0', 10) || 0) : 0;

  if (qtyEl) {
    qtyEl.max = avail;
    if ((parseInt(qtyEl.value, 10) || 0) > avail) qtyEl.value = Math.max(1, avail);
  }
  if (hintEl) {
    hintEl.textContent = avail > 0 ? `Max deductible: ${avail} sealed unit(s)` : 'No sealed stock available for this size';
  }

  const matchingBatches = (srState.activeBatches || []).filter(b =>
    (sid && b.sizeId === sid) || (b.productId === pid && Math.abs(Number(b.containerSize) - sz) < 0.01)
  );
  batchSel.innerHTML = `<option value="">Auto FIFO (oldest batch first)</option>` +
    matchingBatches.map(b => `<option value="${escapeAttr(b.batchId)}" data-po-id="${escapeAttr(b.poId || '')}" data-rem="${b.remainingQty}">${escapeHtml(b.batchNumber)} — ${b.remainingQty} left${b.poNumber ? ` (${escapeHtml(b.poNumber)})` : ''}${b.expirationDate ? ` · Exp ${escapeHtml(b.expirationDate)}` : ''}</option>`).join('');
}

function srPostBatchChanged() {
  const batchSel = document.getElementById('sr-post-batch');
  const poSel = document.getElementById('sr-post-po');
  if (!batchSel || !poSel) return;
  const opt = batchSel.selectedOptions[0];
  if (opt && opt.dataset.poId) {
    poSel.value = opt.dataset.poId;
  }
}

async function submitPostReceivingDamage() {
  const pid = document.getElementById('sr-post-product')?.value || '';
  const sizeSel = document.getElementById('sr-post-size');
  const opt = sizeSel ? sizeSel.selectedOptions[0] : null;
  const sz = sizeSel ? (parseFloat(sizeSel.value) || 0) : 0;
  const sid = opt ? (opt.dataset.sizeId || '') : '';
  const qty = parseInt(document.getElementById('sr-post-qty')?.value || '0', 10);
  const batchId = document.getElementById('sr-post-batch')?.value || '';
  const poId = document.getElementById('sr-post-po')?.value || '';
  const reason = document.getElementById('sr-post-reason')?.value || 'Other';
  const notes = (document.getElementById('sr-post-notes')?.value || '').trim();

  if (!pid || !sz || qty <= 0) {
    showToast('Select a product, container size, and valid damaged quantity.', 'error');
    return;
  }

  const po = poId ? (db.purchaseOrders || []).find(o => o.id === poId) : null;
  const btn = document.getElementById('sr-post-submit-btn');
  if (btn) btn.disabled = true;

  try {
    const resp = await fetch('api/supplier_returns.php?action=record_post_receiving_damage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: pid,
        sizeId: sid || null,
        containerSize: sz,
        damagedQty: qty,
        batchId: batchId || null,
        poId: po ? po.id : (poId || null),
        poNumber: po ? po.poNumber : '',
        supplierId: po ? (po.supplierId || null) : null,
        supplierName: po ? (po.supplierName || '') : '',
        reason,
        inspectionNotes: notes
      })
    });
    const json = await resp.json();
    if (!json || !json.success) {
      showToast((json && json.error) || 'Failed to record post-receiving damage.', 'error');
      return;
    }
    applySupplierReturnsPayload(json);
    if (typeof posBatchStatusLoadedAt !== 'undefined') posBatchStatusLoadedAt = 0;
    if (typeof DISC !== 'undefined') DISC.loaded = false;
    if (typeof EXP !== 'undefined') { EXP.loaded = false; EXP.summaryTs = 0; }
    if (typeof loadDB === 'function') await loadDB();
    closeModal();
    showToast(`Quarantined ${qty} damaged unit(s) and deducted from sellable inventory.`, 'ok');
    renderPage();
  } catch (err) {
    showToast('Network error recording post-receiving damage.', 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* ============================================================
   MODAL 2: Create Supplier Return (Partial or Multi-Item)
   ============================================================ */
function openCreateSupplierReturnModal(prePoId = '', preDmgId = '') {
  const eligible = (srState.damagedRecords || []).filter(d => d.eligibleQty > 0);
  if (!eligible.length) {
    showToast('No unreturned damaged stock records are available. Record damaged items during receiving or via "Report Post-Receiving Damage" first.', 'error');
    return;
  }

  // Unique POs & Suppliers present in eligible records
  const poMap = new Map();
  const supMap = new Map();
  eligible.forEach(d => {
    if (d.poId) poMap.set(d.poId, `${d.poNumber || d.poId} — ${d.supplierName || ''}`);
    if (d.supplierName) supMap.set(d.supplierName, d.supplierId || '');
  });

  const bodyHtml = `
    <div class="sr-modal-notice info">
      ℹ️ Select one or more quarantined damaged items below. Partial returns are supported, and quantities are strictly capped at each item's eligible damaged balance. <b>No duplicate stock deduction will occur.</b>
    </div>
    <div class="sr-form-grid">
      <label class="sr-field">
        <span>Filter by Purchase Order</span>
        <select id="sr-new-po" onchange="srNewReturnFilterChanged()">
          <option value="">All POs with Damaged Items</option>
          ${Array.from(poMap.entries()).map(([id, label]) => `<option value="${escapeAttr(id)}" ${id === prePoId ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}
        </select>
      </label>
      <label class="sr-field">
        <span>Supplier *</span>
        <select id="sr-new-supplier">
          <option value="">Auto from Selected Items</option>
          ${Array.from(supMap.entries()).map(([name, sid]) => `<option value="${escapeAttr(name)}" data-sup-id="${escapeAttr(sid)}">${escapeHtml(name)}</option>`).join('')}
        </select>
      </label>
      <label class="sr-field">
        <span>Return Date *</span>
        <input type="date" id="sr-new-date" value="${todayISO()}">
      </label>
      <label class="sr-field">
        <span>Expected Supplier Resolution *</span>
        <select id="sr-new-resolution">
          ${SR_RESOLUTION_TYPES.map(rt => `<option value="${escapeAttr(rt)}">${escapeHtml(rt)}</option>`).join('')}
        </select>
      </label>
      <label class="sr-field full">
        <span>Primary Return Reason *</span>
        <select id="sr-new-reason">
          ${SR_DAMAGE_REASONS.map(r => `<option value="${escapeAttr(r)}">${escapeHtml(r)}</option>`).join('')}
        </select>
      </label>
    </div>

    <div style="margin-top:12px;">
      <div style="font-weight:700; font-size:13px; margin-bottom:6px; color:var(--ink);">Affected Damaged Products (Select &amp; Set Return Qty) *</div>
      <div id="sr-new-items-list" class="sr-pick-list"></div>
    </div>

    <label class="sr-field full" style="margin-top:12px;">
      <span>Return Notes</span>
      <textarea id="sr-new-notes" rows="2" placeholder="Pickup details, supplier contact, claim reference..."></textarea>
    </label>
  `;

  const footHtml = `
    <button type="button" class="btn secondary" onclick="closeModal()">Cancel</button>
    <button type="button" class="btn" id="sr-new-submit-btn" onclick="submitCreateSupplierReturn()">↩ Create Supplier Return</button>
  `;

  openModal('New Supplier Return', bodyHtml, footHtml);
  window._srPreSelectDmgId = preDmgId || '';
  srNewReturnFilterChanged();
}

function srNewReturnFilterChanged() {
  const poFilter = document.getElementById('sr-new-po')?.value || '';
  const supSel = document.getElementById('sr-new-supplier');
  const listEl = document.getElementById('sr-new-items-list');
  if (!listEl) return;

  let eligible = (srState.damagedRecords || []).filter(d => d.eligibleQty > 0);
  if (poFilter) {
    eligible = eligible.filter(d => d.poId === poFilter);
    if (eligible.length && supSel && eligible[0].supplierName) {
      supSel.value = eligible[0].supplierName;
    }
  }

  if (!eligible.length) {
    listEl.innerHTML = `<div class="muted small" style="padding:12px; text-align:center;">No eligible damaged items for this Purchase Order.</div>`;
    return;
  }

  const preId = window._srPreSelectDmgId || '';
  listEl.innerHTML = eligible.map(d => {
    const checked = preId ? (d.id === preId) : (eligible.length === 1);
    return `
      <div class="sr-pick-row">
        <label class="sr-pick-check">
          <input type="checkbox" class="sr-pick-cb" value="${escapeAttr(d.id)}" ${checked ? 'checked' : ''}>
          <div>
            <div class="sr-pick-title">${escapeHtml(d.productName)} <span class="sr-size-pill">${d.containerSize}L</span></div>
            <div class="muted small">
              ${d.poNumber ? `PO: <b>${escapeHtml(d.poNumber)}</b> · ` : ''}${escapeHtml(d.supplierName || '—')} · Reason: ${escapeHtml(d.reason)} · Eligible: <b>${d.eligibleQty}</b>
            </div>
          </div>
        </label>
        <div class="sr-pick-qty-wrap">
          <span class="muted small">Return Qty:</span>
          <input type="number" class="sr-pick-qty" data-dmg-id="${escapeAttr(d.id)}" min="1" max="${d.eligibleQty}" step="1" value="${d.eligibleQty}">
        </div>
      </div>`;
  }).join('');
}

async function submitCreateSupplierReturn() {
  const cbs = Array.from(document.querySelectorAll('.sr-pick-cb:checked'));
  if (!cbs.length) {
    showToast('Select at least one damaged product to return.', 'error');
    return;
  }

  const items = [];
  for (const cb of cbs) {
    const dmgId = cb.value;
    const qtyInput = document.querySelector(`.sr-pick-qty[data-dmg-id="${dmgId}"]`);
    const qty = parseInt(qtyInput ? qtyInput.value : '0', 10);
    const max = parseInt(qtyInput ? qtyInput.max : '0', 10);
    if (!qty || qty <= 0) {
      showToast('Return quantity must be greater than 0 for every selected item.', 'error');
      return;
    }
    if (qty > max) {
      showToast(`Cannot return ${qty} unit(s) — exceeds eligible damaged quantity (${max}).`, 'error');
      return;
    }
    items.push({ damagedRecordId: dmgId, returnQty: qty });
  }

  const poId = document.getElementById('sr-new-po')?.value || '';
  const po = poId ? (db.purchaseOrders || []).find(o => o.id === poId) : null;
  const supSel = document.getElementById('sr-new-supplier');
  const supplierName = supSel ? supSel.value : '';
  const supplierId = supSel && supSel.selectedOptions[0] ? (supSel.selectedOptions[0].dataset.supId || '') : '';
  const returnDate = document.getElementById('sr-new-date')?.value || todayISO();
  const reason = document.getElementById('sr-new-reason')?.value || 'Other';
  const resolutionType = document.getElementById('sr-new-resolution')?.value || 'Replacement Stock';
  const notes = (document.getElementById('sr-new-notes')?.value || '').trim();

  const btn = document.getElementById('sr-new-submit-btn');
  if (btn) btn.disabled = true;

  try {
    const resp = await fetch('api/supplier_returns.php?action=create_return', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        poId: po ? po.id : (poId || null),
        poNumber: po ? po.poNumber : '',
        supplierId: supplierId || (po ? po.supplierId : null),
        supplierName: supplierName || (po ? po.supplierName : ''),
        returnDate,
        reason,
        resolutionType,
        notes,
        items
      })
    });
    const json = await resp.json();
    if (!json || !json.success) {
      showToast((json && json.error) || 'Failed to create supplier return.', 'error');
      return;
    }
    applySupplierReturnsPayload(json);
    closeModal();
    showToast(`Supplier Return ${json.returnRef} created successfully!`, 'ok');
    srState.subTab = 'history';
    openSupplierReturnsHistoryModal('history');
  } catch (err) {
    showToast('Network error creating supplier return.', 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* ============================================================
   MODAL 3: Manage / View Supplier Return & Status Updates
   ============================================================ */
async function srApproveReturn(returnId) {
  try {
    const resp = await fetch('api/supplier_returns.php?action=approve_return', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnId })
    });
    const json = await resp.json();
    if (!json || !json.success) {
      showToast((json && json.error) || 'Approval failed.', 'error');
      return;
    }
    applySupplierReturnsPayload(json);
    showToast('Supplier return approved.', 'ok');
    renderSupplierReturnsHistoryModalBody();
  } catch (err) {
    showToast('Network error approving supplier return.', 'error');
  }
}

function openSupplierReturnDetailModal(returnId) {
  const ret = (srState.returns || []).find(r => r.id === returnId);
  if (!ret) return;
  const isAdmin = srIsAdmin();
  const isLocked = ret.isFinalized && (!isAdmin || ret.status === 'Closed');
  const pendingRep = Math.max(0, (ret.totalDamagedQty || 0) - (ret.totalReplacementReceivedQty || 0));
  const canReceiveRep = ret.resolutionType === 'Replacement Stock' && !ret.isFinalized && pendingRep > 0 && (ret.isApproved || isAdmin);

  const allowedStatuses = isAdmin
    ? (ret.isFinalized ? ['Closed'] : SR_RETURN_STATUSES)
    : SR_RETURN_STATUSES.filter(s => !SR_ADMIN_ONLY_STATUSES.includes(s));

  const itemsHtml = (ret.items || []).map(it => `
    <tr>
      <td><b>${escapeHtml(it.productName)}</b> <span class="sr-size-pill">${it.containerSize}L</span></td>
      <td>${it.batchNumber ? escapeHtml(it.batchNumber) : '<span class="muted">—</span>'}</td>
      <td class="right"><b>${it.damagedQty}</b></td>
      <td class="right">${it.replacementReceivedQty}</td>
      <td>${escapeHtml(it.reason)}</td>
    </tr>
  `).join('');

  const bodyHtml = `
    <div class="sr-detail-head">
      <div>
        <div class="sr-ref-code" style="font-size:16px;">${escapeHtml(ret.returnRef)}</div>
        <div class="muted small">PO: <b>${escapeHtml(ret.poNumber || '—')}</b> · Supplier: <b>${escapeHtml(ret.supplierName)}</b> · Return Date: ${escapeHtml(ret.returnDate)}</div>
        <div class="muted small">Prepared by: <b>${escapeHtml(ret.createdBy)}</b>${ret.approvedBy ? ` · Approved by: <b>${escapeHtml(ret.approvedBy)}</b>` : ' · <i>Awaiting Admin Approval</i>'}</div>
      </div>
      <span class="sr-status-badge ${srStatusBadgeClass(ret.status)}">${escapeHtml(ret.status)}</span>
    </div>

    ${ret.notes ? `<div class="sr-modal-notice info" style="margin-top:10px;"><b>Return Notes:</b> ${escapeHtml(ret.notes)}</div>` : ''}

    <div class="table-scroll" style="margin:12px 0; border:1px solid var(--line); border-radius:var(--radius-sm);">
      <table class="sr-table">
        <thead>
          <tr>
            <th>Product &amp; Size</th>
            <th>Batch</th>
            <th class="right">Returned</th>
            <th class="right">Replaced</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>${itemsHtml}</tbody>
      </table>
    </div>

    ${isLocked ? `
      <div class="sr-modal-notice warn">
        🔒 This supplier return is <b>${escapeHtml(ret.status)}</b> (finalized) and locked for audit integrity.
      </div>
    ` : `
      <div class="sr-form-grid" style="margin-top:12px;">
        <label class="sr-field">
          <span>Return Status</span>
          <select id="sr-upd-status">
            ${allowedStatuses.map(st => `<option value="${escapeAttr(st)}" ${ret.status === st ? 'selected' : ''}>${escapeHtml(st)}</option>`).join('')}
          </select>
        </label>
        <label class="sr-field">
          <span>Expected Resolution</span>
          <select id="sr-upd-resolution" ${ret.isFinalized ? 'disabled' : ''}>
            ${SR_RESOLUTION_TYPES.map(rt => `<option value="${escapeAttr(rt)}" ${ret.resolutionType === rt ? 'selected' : ''}>${escapeHtml(rt)}</option>`).join('')}
          </select>
        </label>
        <label class="sr-field">
          <span>Credit / Refund Amount (Optional, ₱)</span>
          <input type="number" id="sr-upd-credit" min="0" step="0.01" value="${ret.creditAmount !== null && ret.creditAmount !== undefined ? ret.creditAmount : ''}" placeholder="0.00">
        </label>
        <label class="sr-field">
          <span>Resolution / Status Notes</span>
          <input type="text" id="sr-upd-notes" value="${escapeAttr(ret.resolutionNotes || '')}" placeholder="Credit memo #, supplier response...">
        </label>
      </div>
    `}
  `;

  let footHtml = `<button type="button" class="btn secondary" onclick="closeModal()">Close</button>`;
  if (isAdmin && !ret.isApproved && !ret.isFinalized) {
    footHtml += `<button type="button" class="btn secondary" onclick="closeModal(); srApproveReturn('${ret.id}')">✓ Approve Return</button>`;
  }
  if (canReceiveRep) {
    footHtml += `<button type="button" class="btn secondary" onclick="closeModal(); openReceiveReplacementModal('${ret.id}')">📥 Receive Replacement</button>`;
  }
  if (!isLocked) {
    footHtml += `<button type="button" class="btn" id="sr-upd-save-btn" onclick="submitUpdateSupplierReturnStatus('${ret.id}')">💾 Save Status</button>`;
  }

  openModal(`Supplier Return — ${ret.returnRef}`, bodyHtml, footHtml);
}

async function submitUpdateSupplierReturnStatus(returnId) {
  const status = document.getElementById('sr-upd-status')?.value || '';
  const resolutionType = document.getElementById('sr-upd-resolution')?.value || '';
  const creditRaw = document.getElementById('sr-upd-credit')?.value;
  const resolutionNotes = (document.getElementById('sr-upd-notes')?.value || '').trim();

  const btn = document.getElementById('sr-upd-save-btn');
  if (btn) btn.disabled = true;

  try {
    const resp = await fetch('api/supplier_returns.php?action=update_status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        returnId,
        status,
        resolutionType,
        creditAmount: creditRaw !== '' ? parseFloat(creditRaw) : null,
        resolutionNotes
      })
    });
    const json = await resp.json();
    if (!json || !json.success) {
      showToast((json && json.error) || 'Failed to update supplier return.', 'error');
      return;
    }
    applySupplierReturnsPayload(json);
    closeModal();
    showToast(`Supplier return updated to "${status}".`, 'ok');
    openSupplierReturnsHistoryModal('history');
  } catch (err) {
    showToast('Network error updating supplier return.', 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* ============================================================
   MODAL 4: Receive Replacement Stock (Separate Receiving Tx)
   ============================================================ */
function openReceiveReplacementModal(returnId) {
  const ret = (srState.returns || []).find(r => r.id === returnId);
  if (!ret) return;
  const pendingItems = (ret.items || []).filter(it => it.replacementPendingQty > 0);
  if (!pendingItems.length) {
    showToast('All replacement units for this return have already been received.', 'ok');
    return;
  }

  const rowsHtml = pendingItems.map(it => `
    <div class="sr-rep-row">
      <div class="sr-rep-top">
        <div>
          <b>${escapeHtml(it.productName)}</b> <span class="sr-size-pill">${it.containerSize}L</span>
          <div class="muted small">Returned: ${it.damagedQty} · Replaced: ${it.replacementReceivedQty} · Pending: <b>${it.replacementPendingQty}</b></div>
        </div>
        <div class="sr-pick-qty-wrap">
          <span class="muted small">Receive Now:</span>
          <input type="number" class="sr-rep-qty" data-item-id="${escapeAttr(it.id)}" min="0" max="${it.replacementPendingQty}" step="1" value="${it.replacementPendingQty}">
        </div>
      </div>
      <div class="sr-form-grid" style="margin-top:8px;">
        <label class="sr-field">
          <span>Expiration Date *</span>
          <input type="date" class="sr-rep-exp" data-item-id="${escapeAttr(it.id)}" min="${todayISO()}" required>
        </label>
        <label class="sr-field">
          <span>Batch / Delivery Note</span>
          <input type="text" class="sr-rep-note" data-item-id="${escapeAttr(it.id)}" placeholder="Replacement delivery note">
        </label>
      </div>
    </div>
  `).join('');

  const bodyHtml = `
    <div class="sr-modal-notice info">
      📥 <b>Replacement Stock Receiving (${escapeHtml(ret.returnRef)}):</b> Physically received replacement units are recorded as a separate receiving transaction with a new FIFO batch linked to this supplier return and original PO (<b>${escapeHtml(ret.poNumber || '—')}</b>).
    </div>
    <div class="sr-pick-list">${rowsHtml}</div>
    <label class="sr-field full" style="margin-top:10px;">
      <span>Overall Delivery Note</span>
      <input type="text" id="sr-rep-overall-note" placeholder="Driver / delivery receipt note">
    </label>
  `;

  const footHtml = `
    <button type="button" class="btn secondary" onclick="closeModal()">Cancel</button>
    <button type="button" class="btn" id="sr-rep-submit-btn" onclick="submitReceiveReplacement('${ret.id}')">✓ Confirm Replacement Received</button>
  `;

  openModal(`Receive Replacement Stock — ${ret.returnRef}`, bodyHtml, footHtml);
}

async function submitReceiveReplacement(returnId) {
  const qtyInputs = Array.from(document.querySelectorAll('.sr-rep-qty'));
  const items = [];
  let totalNow = 0;

  for (const inp of qtyInputs) {
    const itemId = inp.dataset.itemId;
    const val = parseInt(inp.value || '0', 10);
    const max = parseInt(inp.max || '0', 10);
    if (val < 0 || val > max) {
      showToast(`Replacement quantity must be between 0 and ${max}.`, 'error');
      return;
    }
    if (val > 0) {
      const expEl = document.querySelector(`.sr-rep-exp[data-item-id="${itemId}"]`);
      const noteEl = document.querySelector(`.sr-rep-note[data-item-id="${itemId}"]`);
      const expVal = expEl ? expEl.value.trim() : '';
      if (!expVal) {
        showToast('Please enter an Expiration Date for every replacement item being received.', 'error');
        if (expEl) expEl.focus();
        return;
      }
      if (expVal < todayISO()) {
        showToast('Expiration Date cannot be in the past. Please select today or a future date.', 'error');
        if (expEl) expEl.focus();
        return;
      }
      items.push({
        itemId,
        receiveQty: val,
        expirationDate: expVal,
        notes: noteEl ? noteEl.value.trim() : ''
      });
      totalNow += val;
    }
  }

  if (totalNow <= 0) {
    showToast('Enter at least one replacement quantity greater than 0.', 'error');
    return;
  }

  const notes = (document.getElementById('sr-rep-overall-note')?.value || '').trim();
  const btn = document.getElementById('sr-rep-submit-btn');
  if (btn) btn.disabled = true;

  try {
    const resp = await fetch('api/supplier_returns.php?action=receive_replacement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnId, items, notes })
    });
    const json = await resp.json();
    if (!json || !json.success) {
      showToast((json && json.error) || 'Failed to receive replacement stock.', 'error');
      return;
    }
    applySupplierReturnsPayload(json);
    if (typeof posBatchStatusLoadedAt !== 'undefined') posBatchStatusLoadedAt = 0;
    if (typeof DISC !== 'undefined') DISC.loaded = false;
    if (typeof EXP !== 'undefined') { EXP.loaded = false; EXP.summaryTs = 0; }
    if (typeof loadDB === 'function') await loadDB();
    closeModal();
    showToast(`Received ${json.receivedQty} replacement unit(s) into sellable inventory & FIFO batches!`, 'ok');
    renderPage();
  } catch (err) {
    showToast('Network error receiving replacement stock.', 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}


/* ============================================================
   SUPPLIER REPLACEMENT REQUESTS (Linked to Original PO)
   ============================================================ */

function srReplacementStatusBadgeClass(status) {
  switch (status) {
    case 'Awaiting Supplier Confirmation': return 'sr-badge-pending';
    case 'Confirmed by Supplier – Awaiting Delivery':
    case 'Replacement Approved':
    case 'Awaiting Replacement Delivery': return 'sr-badge-awaiting';
    case 'Partially Received': return 'sr-badge-pending';
    case 'Under Physical Inspection':
    case 'Under Inspection': return 'sr-badge-returned';
    case 'Completed': return 'sr-badge-replaced';
    case 'Cancelled':
    case 'Supplier Declined': return 'sr-badge-rejected';
    default: return 'sr-badge-pending';
  }
}

function getPOReplacementSummary(poId) {
  return (srState.poReplacementSummary && srState.poReplacementSummary[poId]) || {
    activeCount: 0, totalCount: 0, requestedQty: 0, receivedQty: 0, pendingQty: 0
  };
}

function renderReplacementRequestsTableHtml(filterPoId = null) {
  const q = (srState.search || '').trim().toLowerCase();
  let list = (srState.replacementRequests || []).slice();
  if (filterPoId) {
    list = list.filter(r => r.poId === filterPoId);
  } else {
    if (srState.statusFilter && srState.statusFilter !== 'all') {
      list = list.filter(r => r.status === srState.statusFilter);
    }
    if (srState.dateFrom) list = list.filter(r => String(r.requestDate || '').slice(0, 10) >= srState.dateFrom);
    if (srState.dateTo) list = list.filter(r => String(r.requestDate || '').slice(0, 10) <= srState.dateTo);
    if (q) {
      list = list.filter(r =>
        String(r.requestRef || '').toLowerCase().includes(q) ||
        String(r.poNumber || '').toLowerCase().includes(q) ||
        String(r.supplierName || '').toLowerCase().includes(q) ||
        String(r.productName || '').toLowerCase().includes(q) ||
        String(r.reason || '').toLowerCase().includes(q) ||
        String(r.status || '').toLowerCase().includes(q)
      );
    }
  }

  if (!list.length) {
    return `
      <div class="sr-empty-state">
        <div class="sr-empty-icon">🔄</div>
        <div class="sr-empty-title">No replacement requests found</div>
        <div class="muted small">When damaged items are rejected during receiving, create a Replacement Request linked to the original Purchase Order.</div>
      </div>`;
  }

  return `
    <div class="table-scroll sr-table-wrap">
      <table class="sr-table">
        <thead>
          <tr>
            <th>Request Ref</th>
            ${filterPoId ? '' : '<th>Original PO</th>'}
            <th>Supplier</th>
            <th>Product &amp; Size</th>
            <th class="right">Requested / Rcvd</th>
            <th>Supplier Confirmation</th>
            <th>Status</th>
            <th class="right">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${list.map(req => {
    const approvedForReceive = ['Replacement Approved', 'Awaiting Replacement Delivery', 'Partially Received', 'Under Inspection'].includes(req.status);
    const canReceive = approvedForReceive && !req.isResolved && req.remainingQty > 0;
    return `
              <tr>
                <td>
                  <div class="sr-ref-code">${escapeHtml(req.requestRef)}</div>
                  <div class="muted small">${escapeHtml(req.requestDate)} · ${escapeHtml(req.staffResponsible)}</div>
                  ${req.parentRequestId ? `<div class="sr-approval-pill pending">↩ Follow-up</div>` : ''}
                </td>
                ${filterPoId ? '' : `<td><span class="sr-po-code">${escapeHtml(req.poNumber)}</span></td>`}
                <td>${escapeHtml(req.supplierName)}</td>
                <td>
                  <div class="sr-item-line">
                    <span class="sr-item-name">${escapeHtml(req.productName)}</span>
                    <span class="sr-size-pill">${req.containerSize}L</span>
                  </div>
                  <div class="muted small">Reason: ${escapeHtml(req.reason)}</div>
                </td>
                <td class="right">
                  <div class="sr-qty-val">${req.receivedQty} / ${req.requestedQty}</div>
                  <div class="sr-qty-sub">${req.remainingQty > 0 && !req.isResolved ? `${req.remainingQty} pending` : (req.creditIssued ? `${escapeHtml(req.creditType)}: ${peso(req.creditAmount)}` : 'Fulfilled')}</div>
                </td>
                <td>
                  <div>${req.supplierConfirmed ? '<span style="color:var(--success); font-weight:700;">✓ Confirmed</span>' : '<span class="muted">Pending</span>'}</div>
                  ${req.confirmationReceipt ? `<div class="muted small"><a href="javascript:void(0)" onclick="openReplacementReceiptModal('${req.id}', 'confirmation')" style="color:var(--teal-text); font-weight:700; text-decoration:none;">🧾 ${escapeHtml(req.confirmationReceipt.receiptNumber)}</a></div>` : (req.confirmationDate ? `<div class="muted small">${escapeHtml(req.confirmationDate)}</div>` : '')}
                </td>
                <td><span class="sr-status-badge ${srReplacementStatusBadgeClass(req.status)}">${escapeHtml(req.status)}</span></td>
                <td class="right sr-actions-cell">
                  <button type="button" class="btn ${req.isResolved ? 'ghost' : 'secondary'} small" onclick="openManageReplacementRequestModal('${req.id}')">${req.isResolved ? 'View Details' : 'Manage'}</button>
                </td>
              </tr>`;
  }).join('')}
        </tbody>
      </table>
    </div>`;
}

function renderPOReplacementSummaryBannerHtml(po) {
  if (!po) return '';
  const poReqs = (srState.replacementRequests || []).filter(r => r.poId === po.id && !r.isResolved);
  if (!poReqs.length) return '';
  const pendingUnits = poReqs.reduce((s, r) => s + (Number(r.remainingQty) || 0), 0);
  const refs = poReqs.map(r => r.requestRef).join(', ');
  return `
    <div class="sr-modal-notice info" style="margin-top:12px; margin-bottom:0; display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
      <span>🔄 <b>${poReqs.length} Active Replacement Request${poReqs.length === 1 ? '' : 's'}</b> (${escapeHtml(refs)}) · <b>${pendingUnits}</b> unit${pendingUnits === 1 ? '' : 's'} pending — tracked in <b>Active Replacement Tracking</b> below.</span>
      <button type="button" class="btn secondary small" onclick="const el=document.getElementById('rcv-active-replacements-panel'); if(el) el.scrollIntoView({behavior:'smooth', block:'start'});">↓ View in Replacement Tracking</button>
    </div>`;
}

function renderPOReplacementSectionHtml(po) {
  if (!po) return '';
  const poReqs = (srState.replacementRequests || []).filter(r => r.poId === po.id);
  const poDamaged = (srState.damagedRecords || []).filter(d => d.poId === po.id);
  const activeCount = poReqs.filter(r => !r.isResolved).length;

  if (!poReqs.length && !poDamaged.length) return '';

  return `
    <div class="panel" style="margin-top:16px;">
      <div class="panel-head row wrap" style="gap:10px;">
        <div>
          <h3 style="margin:0; display:flex; align-items:center; gap:8px;">
            <span>🔄 Supplier Replacement Requests &amp; Damaged Items</span>
            ${activeCount > 0 ? `<span class="badge po-partial">${activeCount} Unresolved</span>` : ''}
          </h3>
          <div class="muted small">Linked directly to ${escapeHtml(po.poNumber)} — original Purchase Order cost is preserved (no duplicate payable).</div>
        </div>
        <div class="spacer"></div>
        ${poDamaged.length ? `<button type="button" class="btn small" onclick="openCreateReplacementRequestModal('', '${escapeAttr(po.id)}')">🔄 Create Replacement Request</button>` : ''}
      </div>
      <div class="panel-body">
        ${poReqs.length ? renderReplacementRequestsTableHtml(po.id) : `
          <div class="sr-modal-notice warn" style="margin-bottom:0;">
            ⚠️ <b>${poDamaged.length} damaged item record(s)</b> were recorded for this Purchase Order with no replacement request yet. Click <b>Create Replacement Request</b> to request replacement stock from ${escapeHtml(po.supplierName)}.
          </div>`}
      </div>
    </div>`;
}

function openCreateReplacementRequestModal(damagedRecordId = '', prePoId = '', parentRequestId = '') {
  let eligibleDmg = (srState.damagedRecords || []).filter(d => d.poId);
  if (prePoId) eligibleDmg = eligibleDmg.filter(d => d.poId === prePoId);
  if (damagedRecordId) {
    const exact = (srState.damagedRecords || []).find(d => d.id === damagedRecordId);
    if (exact && !eligibleDmg.some(d => d.id === exact.id)) eligibleDmg.unshift(exact);
  }

  if (!eligibleDmg.length) {
    showToast('No damaged PO receiving records found to create a replacement request.', 'error');
    return;
  }

  const selDmg = damagedRecordId
    ? (eligibleDmg.find(d => d.id === damagedRecordId) || eligibleDmg[0])
    : eligibleDmg[0];

  const staffName = (typeof currentUser !== 'undefined' && currentUser && currentUser.name) || 'Staff';

  const bodyHtml = `
    <div class="sr-modal-notice info">
      🔄 <b>Linked Replacement Request:</b> This request links directly to the original Purchase Order — <b>no new Purchase Order or duplicate supplier payable</b> is created.
    </div>
    <div class="sr-form-grid">
      <label class="sr-field full">
        <span>Damaged Stock Record (Original PO &amp; Product) *</span>
        <select id="sr-rep-dmg-sel" onchange="srRepSourceChanged()">
          ${eligibleDmg.map(d => `<option value="${escapeAttr(d.id)}" ${d.id === selDmg.id ? 'selected' : ''}>${escapeHtml(d.poNumber)} — ${escapeHtml(d.productName)} (${d.containerSize}L) · Damaged: ${d.damagedQty} (${escapeHtml(d.reason)})</option>`).join('')}
        </select>
      </label>
      <label class="sr-field">
        <span>Original Purchase Order</span>
        <input type="text" id="sr-rep-po-disp" readonly value="${escapeAttr(selDmg.poNumber || '')}">
      </label>
      <label class="sr-field">
        <span>Supplier</span>
        <input type="text" id="sr-rep-sup-disp" readonly value="${escapeAttr(selDmg.supplierName || '')}">
      </label>
      <label class="sr-field">
        <span>Damaged Qty</span>
        <input type="number" id="sr-rep-dmg-qty" readonly value="${selDmg.damagedQty}">
      </label>
      <label class="sr-field">
        <span>Returned Qty</span>
        <input type="number" id="sr-rep-ret-qty" min="0" max="${selDmg.damagedQty}" value="${selDmg.returnedQty || selDmg.damagedQty}">
      </label>
      <label class="sr-field">
        <span>Requested Replacement Qty *</span>
        <input type="number" id="sr-rep-req-qty" min="1" max="${selDmg.damagedQty}" step="1" value="${selDmg.damagedQty}">
      </label>
      <label class="sr-field">
        <span>Damage Reason *</span>
        <select id="sr-rep-reason">
          ${SR_DAMAGE_REASONS.map(r => `<option value="${escapeAttr(r)}" ${r === selDmg.reason ? 'selected' : ''}>${escapeHtml(r)}</option>`).join('')}
        </select>
      </label>
      <label class="sr-field">
        <span>Request Date *</span>
        <input type="date" id="sr-rep-date" value="${todayISO()}">
      </label>
      <label class="sr-field">
        <span>Staff Responsible</span>
        <input type="text" readonly value="${escapeAttr(staffName)}">
      </label>
      <label class="sr-field full">
        <span>Request Notes</span>
        <textarea id="sr-rep-notes" rows="2" placeholder="Supplier rep name, replacement agreement, inspection remarks..."></textarea>
      </label>
    </div>
    <input type="hidden" id="sr-rep-parent-id" value="${escapeAttr(parentRequestId || '')}">
  `;

  const footHtml = `
    <button type="button" class="btn secondary" onclick="closeModal()">Cancel</button>
    <button type="button" class="btn" id="sr-rep-create-btn" onclick="submitCreateReplacementRequest()">🔄 Create Replacement Request</button>
  `;

  openModal('Create Supplier Replacement Request', bodyHtml, footHtml);
}

function srRepSourceChanged() {
  const dmgId = document.getElementById('sr-rep-dmg-sel')?.value || '';
  const d = (srState.damagedRecords || []).find(x => x.id === dmgId);
  if (!d) return;
  const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  setVal('sr-rep-po-disp', d.poNumber || '');
  setVal('sr-rep-sup-disp', d.supplierName || '');
  setVal('sr-rep-dmg-qty', d.damagedQty);
  setVal('sr-rep-ret-qty', d.returnedQty || d.damagedQty);
  const reqEl = document.getElementById('sr-rep-req-qty');
  if (reqEl) { reqEl.max = d.damagedQty; reqEl.value = d.damagedQty; }
  setVal('sr-rep-reason', d.reason || 'Other');
}

async function submitCreateReplacementRequest() {
  const dmgId = document.getElementById('sr-rep-dmg-sel')?.value || '';
  const d = (srState.damagedRecords || []).find(x => x.id === dmgId);
  if (!d) { showToast('Select a damaged record.', 'error'); return; }

  const requestedQty = parseInt(document.getElementById('sr-rep-req-qty')?.value || '0', 10);
  const returnedQty = parseInt(document.getElementById('sr-rep-ret-qty')?.value || '0', 10);
  const reason = document.getElementById('sr-rep-reason')?.value || d.reason;
  const requestDate = document.getElementById('sr-rep-date')?.value || todayISO();
  const notes = (document.getElementById('sr-rep-notes')?.value || '').trim();
  const parentRequestId = document.getElementById('sr-rep-parent-id')?.value || '';

  if (!requestedQty || requestedQty <= 0) {
    showToast('Requested replacement quantity must be greater than 0.', 'error');
    return;
  }

  const btn = document.getElementById('sr-rep-create-btn');
  if (btn) btn.disabled = true;

  try {
    const resp = await fetch('api/supplier_returns.php?action=create_replacement_request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        damagedRecordId: d.id,
        parentRequestId: parentRequestId || null,
        poId: d.poId,
        poNumber: d.poNumber,
        supplierId: d.supplierId,
        supplierName: d.supplierName,
        productId: d.productId,
        productName: d.productName,
        sizeId: d.sizeId,
        containerSize: d.containerSize,
        damagedQty: d.damagedQty,
        returnedQty,
        requestedQty,
        reason,
        requestDate,
        notes
      })
    });
    const json = await resp.json();
    if (!json || !json.success) {
      showToast((json && json.error) || 'Failed to create replacement request.', 'error');
      return;
    }
    applySupplierReturnsPayload(json);
    if (typeof posBatchStatusLoadedAt !== 'undefined') posBatchStatusLoadedAt = 0;
    if (typeof DISC !== 'undefined') DISC.loaded = false;
    if (typeof EXP !== 'undefined') { EXP.loaded = false; EXP.summaryTs = 0; }
    if (typeof loadDB === 'function') await loadDB();
    closeModal();
    showToast(`Replacement Request ${json.requestRef} created and linked to ${d.poNumber}.`, 'ok');
    renderPage();
  } catch (err) {
    showToast('Network error creating replacement request.', 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

function openManageReplacementRequestModal(requestId) {
  const req = (srState.replacementRequests || []).find(r => r.id === requestId);
  if (!req) return;
  const isAdmin = srIsAdmin();
  const deliveries = req.deliveries || [];
  const delReceipts = req.deliveryReceipts || [];
  const confReceipt = req.confirmationReceipt || null;
  const isAwaitingConfirm = req.status === 'Awaiting Supplier Confirmation';
  const isAwaitingDelivery = [
    'Confirmed by Supplier – Awaiting Delivery',
    'Under Physical Inspection',
    'Replacement Approved',
    'Awaiting Replacement Delivery',
    'Under Inspection'
  ].includes(req.status);
  const isPartiallyReceived = req.status === 'Partially Received';
  const isResolved = req.isResolved || ['Completed', 'Cancelled', 'Supplier Declined'].includes(req.status);

  const delRowsHtml = deliveries.length ? deliveries.map(d => {
    const matchedRcpt = delReceipts.find(dr => dr.deliveryId === d.id);
    return `
    <tr>
      <td>${escapeHtml(formatDateShort ? formatDateShort(d.receivedAt) : d.receivedAt)}</td>
      <td class="right">${d.deliveredQty}</td>
      <td class="right" style="color:var(--success); font-weight:700;">${d.acceptedQty}</td>
      <td class="right" style="color:${d.damagedQty > 0 ? 'var(--danger)' : 'var(--ink-soft)'}; font-weight:700;">${d.damagedQty}</td>
      <td>${d.batchNumber ? `<span class="sr-batch-pill">${escapeHtml(d.batchNumber)}</span>` : '—'}</td>
      <td>
        <div>${escapeHtml(d.damageReason || d.inspectionNotes || 'Passed')}</div>
        ${matchedRcpt ? `<a href="javascript:void(0)" onclick="openReplacementReceiptModal('${req.id}', 'delivery', '${escapeAttr(matchedRcpt.id)}')" style="font-size:11px; color:var(--teal-text); font-weight:700; text-decoration:none;">🧾 ${escapeHtml(matchedRcpt.receiptNumber)}</a>` : ''}
      </td>
    </tr>`;
  }).join('') : `<tr><td colspan="6" class="muted small" style="text-align:center; padding:12px;">No replacement deliveries recorded yet.</td></tr>`;

  const bodyHtml = `
    <div class="sr-detail-head">
      <div>
        <div class="sr-ref-code" style="font-size:16px;">${escapeHtml(req.requestRef)}</div>
        <div class="muted small">Original PO: <b>${escapeHtml(req.poNumber)}</b> · Supplier: <b>${escapeHtml(req.supplierName)}</b></div>
        <div class="muted small">Product: <b>${escapeHtml(req.productName)} (${req.containerSize}L)</b> · Reason: <b>${escapeHtml(req.reason)}</b></div>
      </div>
      <span class="sr-status-badge ${srReplacementStatusBadgeClass(req.status)}">${escapeHtml(req.status)}</span>
    </div>

    <div class="rcv-confirm-kpi-grid" style="margin:12px 0; grid-template-columns:repeat(4, minmax(0, 1fr));">
      <div class="rcv-confirm-kpi damaged">
        <span class="lbl">Damaged</span>
        <span class="val">${req.damagedQty}</span>
      </div>
      <div class="rcv-confirm-kpi">
        <span class="lbl">Requested</span>
        <span class="val">${req.requestedQty}</span>
      </div>
      <div class="rcv-confirm-kpi good">
        <span class="lbl">Received</span>
        <span class="val">${req.receivedQty}</span>
      </div>
      <div class="rcv-confirm-kpi">
        <span class="lbl">Remaining</span>
        <span class="val">${req.remainingQty}</span>
      </div>
    </div>

    ${req.supplierConfirmed ? `
      <div class="sr-modal-notice info" style="margin-bottom:10px;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
          <div>
            <b>🧾 Supplier Confirmation Receipt</b>
            <div style="margin-top:3px;">
              ${confReceipt ? `Receipt No: <b>${escapeHtml(confReceipt.receiptNumber)}</b> · ` : ''}
              Confirmed on <b>${escapeHtml(req.confirmationDate || (req.supplierConfirmedAt ? String(req.supplierConfirmedAt).slice(0, 10) : '—'))}</b>
              ${req.confirmedBy ? ` by <b>${escapeHtml(req.confirmedBy)}</b>` : ''}
            </div>
            ${req.supplierConfirmationNote ? `<div class="muted small" style="margin-top:2px;">Remarks: ${escapeHtml(req.supplierConfirmationNote)}</div>` : ''}
          </div>
          ${confReceipt ? `
            <div style="display:flex; gap:6px; flex-wrap:wrap;">
              <button type="button" class="btn secondary small" onclick="openReplacementReceiptModal('${req.id}', 'confirmation')">🧾 View Receipt</button>
              <button type="button" class="btn secondary small" onclick="openReplacementReceiptModal('${req.id}', 'confirmation', null, true)">🔁 Reprint Receipt</button>
            </div>
          ` : ''}
        </div>
      </div>
    ` : ''}

    ${req.creditIssued ? `
      <div class="sr-modal-notice info" style="margin-bottom:10px;">
        💳 <b>${escapeHtml(req.creditType)} Recorded:</b> ${peso(req.creditAmount)}${req.creditNotes ? ' — ' + escapeHtml(req.creditNotes) : ''} (Original PO cost preserved)
      </div>
    ` : ''}

    ${isAwaitingConfirm ? `
      <div style="padding:12px; background:var(--surface-2); border:1px solid var(--line); border-radius:var(--radius-sm); margin-bottom:12px;">
        <div style="font-weight:700; font-size:13px; color:var(--ink); margin-bottom:4px;">🧾 Confirm Supplier Replacement Agreement</div>
        <div class="muted small" style="margin-bottom:10px;">Clicking <b>Confirm Supplier</b> saves the supplier confirmation, updates status to <b>Confirmed by Supplier – Awaiting Delivery</b>, and automatically generates a printable <b>Supplier Replacement Confirmation Receipt</b> (no inventory is added until physical delivery).</div>
        <label class="sr-field full">
          <span>Supplier Confirmation Remarks (Optional)</span>
          <input type="text" id="sr-mrep-note" value="${escapeAttr(req.supplierConfirmationNote || '')}" placeholder="Supplier representative name, confirmation details, or agreement notes...">
        </label>
      </div>
    ` : ''}

    ${(deliveries.length > 0 || isResolved) ? `
      <div style="font-weight:700; font-size:12.5px; margin:10px 0 6px;">Replacement Delivery &amp; Inspection History</div>
      <div class="table-scroll" style="border:1px solid var(--line); border-radius:var(--radius-sm); margin-bottom:10px;">
        <table class="sr-table">
          <thead>
            <tr><th>Date</th><th class="right">Delivered</th><th class="right">Accepted</th><th class="right">Damaged</th><th>Batch</th><th>Notes / Receipt</th></tr>
          </thead>
          <tbody>${delRowsHtml}</tbody>
        </table>
      </div>
    ` : ''}

    ${!isResolved && isAdmin ? `
      <details style="margin-top:10px; padding:10px; background:var(--surface-2); border:1px solid var(--line); border-radius:var(--radius-sm);">
        <summary style="cursor:pointer; font-weight:700; font-size:12px; color:var(--ink-soft);">More Admin Options (Supplier Credit / Refund, Supplier Declined, or Cancel)</summary>
        <div class="sr-form-grid" style="margin-top:10px;">
          <label class="sr-field">
            <span>Resolution Type</span>
            <select id="sr-mrep-cred-type">
              <option value="Supplier Credit">Supplier Credit</option>
              <option value="Refund">Refund</option>
            </select>
          </label>
          <label class="sr-field">
            <span>Credit / Refund Amount (₱)</span>
            <input type="number" id="sr-mrep-cred-amt" min="0.01" step="0.01" placeholder="0.00">
          </label>
          <label class="sr-field full">
            <span>Credit Memo / Decline / Cancel Reason</span>
            <input type="text" id="sr-mrep-cred-note" placeholder="Credit memo #, supplier decline note, or cancellation reason...">
          </label>
        </div>
        <div style="margin-top:8px; display:flex; justify-content:flex-end; gap:8px; flex-wrap:wrap;">
          <button type="button" class="btn danger small" onclick="submitCancelReplacementRequest('${req.id}', 'Supplier Declined')">✕ Supplier Declined</button>
          <button type="button" class="btn danger small" onclick="submitCancelReplacementRequest('${req.id}', 'Cancelled')">✕ Cancel Request</button>
          <button type="button" class="btn secondary small" onclick="submitUpdateReplacementRequest('${req.id}', true)">💳 Record Credit / Refund</button>
        </div>
      </details>
    ` : ''}
  `;

  let footHtml = `<button type="button" class="btn secondary" onclick="closeModal()">Close</button>`;
  if (isAwaitingConfirm) {
    footHtml += `<button type="button" class="btn" id="sr-mrep-confirm-btn" onclick="submitConfirmSupplierReplacement('${req.id}')">✓ Confirm Supplier</button>`;
  } else if (isAwaitingDelivery && req.remainingQty > 0) {
    footHtml += `<button type="button" class="btn" onclick="closeModal(); openReceiveReplacementDeliveryModal('${req.id}')">📥 Receive Replacement</button>`;
  } else if (isPartiallyReceived && req.remainingQty > 0) {
    footHtml += `<button type="button" class="btn" onclick="closeModal(); openReceiveReplacementDeliveryModal('${req.id}')">📥 Receive Remaining</button>`;
  }

  openModal(isResolved ? `Replacement Details — ${req.requestRef}` : `Manage Replacement — ${req.requestRef}`, bodyHtml, footHtml);
}

async function submitConfirmSupplierReplacement(requestId) {
  if (window._isSubmittingRepAction) return;
  window._isSubmittingRepAction = true;
  const btn = document.getElementById('sr-mrep-confirm-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Confirming…'; }

  try {
    const resp = await fetch('api/supplier_returns.php?action=confirm_supplier_replacement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId,
        remarks: (document.getElementById('sr-mrep-note')?.value || '').trim()
      })
    });
    const json = await resp.json();
    if (!json || !json.success) {
      showToast((json && json.error) || 'Failed to confirm supplier replacement.', 'error');
      return;
    }
    applySupplierReturnsPayload(json);
    if (typeof posBatchStatusLoadedAt !== 'undefined') posBatchStatusLoadedAt = 0;
    if (typeof DISC !== 'undefined') DISC.loaded = false;
    if (typeof EXP !== 'undefined') { EXP.loaded = false; EXP.summaryTs = 0; }
    if (typeof loadDB === 'function') await loadDB();
    closeModal();
    const rcptNo = json.receipt ? json.receipt.receiptNumber : '';
    showToast(`Confirmed by Supplier – Awaiting Delivery${rcptNo ? ` · Receipt ${rcptNo} generated` : ''}.`, 'ok');
    renderPage();
    if (json.receipt) {
      setTimeout(() => openReplacementReceiptModal(requestId, 'confirmation'), 180);
    }
  } catch (err) {
    showToast('Network error confirming supplier replacement.', 'error');
  } finally {
    window._isSubmittingRepAction = false;
    if (btn) btn.disabled = false;
  }
}

/* ============================================================
   POS-STYLE SUPPLIER REPLACEMENT RECEIPT (Preview, Print, Reprint)
   ============================================================ */
function buildReplacementReceiptHtml(rcpt, isReprint = false) {
  const s = rcpt.snapshot || {};
  const sup = s.supplier || { name: rcpt.supplierName };
  const isDelivery = (rcpt.receiptType === 'delivery' || s.receiptType === 'delivery');
  const title = s.receiptTitle || (isDelivery ? 'SUPPLIER REPLACEMENT RECEIVING RECEIPT' : 'SUPPLIER REPLACEMENT CONFIRMATION RECEIPT');
  const issuedStr = typeof formatDateTime === 'function' ? formatDateTime(rcpt.issuedAt) : rcpt.issuedAt;
  const supContactParts = [sup.contact, sup.phone, sup.email, sup.address].filter(Boolean);

  let tableHtml = '';
  if (isDelivery && s.item) {
    const it = s.item;
    tableHtml = `
      <table style="width:100%; border-collapse:collapse; margin-top:8px; font-size:12px;">
        <thead>
          <tr>
            <th style="text-align:left; background:#F7F5F2; color:#26211C; border-bottom:1.5px solid #222; padding:5px 4px;">Product</th>
            <th style="text-align:left; background:#F7F5F2; color:#26211C; border-bottom:1.5px solid #222; padding:5px 4px;">Size</th>
            <th style="text-align:right; background:#F7F5F2; color:#26211C; border-bottom:1.5px solid #222; padding:5px 4px;">Delivered</th>
            <th style="text-align:right; background:#F7F5F2; color:#26211C; border-bottom:1.5px solid #222; padding:5px 4px;">Accepted</th>
            <th style="text-align:right; background:#F7F5F2; color:#26211C; border-bottom:1.5px solid #222; padding:5px 4px;">Damaged</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding:6px 4px; border-bottom:1px solid #ddd;"><b>${escapeHtml(it.productName)}</b>${it.batchNumber ? `<div style="font-size:10.5px; color:#555;">Batch: ${escapeHtml(it.batchNumber)}${it.expirationDate ? ' · Exp: ' + escapeHtml(it.expirationDate) : ''}</div>` : ''}</td>
            <td style="padding:6px 4px; border-bottom:1px solid #ddd;">${it.containerSize}L</td>
            <td style="padding:6px 4px; border-bottom:1px solid #ddd; text-align:right; font-family:monospace;">${it.deliveredQty}</td>
            <td style="padding:6px 4px; border-bottom:1px solid #ddd; text-align:right; font-family:monospace; font-weight:700;">${it.acceptedQty}</td>
            <td style="padding:6px 4px; border-bottom:1px solid #ddd; text-align:right; font-family:monospace;">${it.damagedQty}</td>
          </tr>
        </tbody>
      </table>`;
  } else {
    const items = Array.isArray(s.items) ? s.items : [];
    tableHtml = `
      <table style="width:100%; border-collapse:collapse; margin-top:8px; font-size:12px;">
        <thead>
          <tr>
            <th style="text-align:left; background:#F7F5F2; color:#26211C; border-bottom:1.5px solid #222; padding:5px 4px;">Product</th>
            <th style="text-align:left; background:#F7F5F2; color:#26211C; border-bottom:1.5px solid #222; padding:5px 4px;">Size</th>
            <th style="text-align:right; background:#F7F5F2; color:#26211C; border-bottom:1.5px solid #222; padding:5px 4px;">Damaged Qty</th>
            <th style="text-align:right; background:#F7F5F2; color:#26211C; border-bottom:1.5px solid #222; padding:5px 4px;">Replacement Qty</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(it => `
            <tr>
              <td style="padding:6px 4px; border-bottom:1px solid #ddd;"><b>${escapeHtml(it.productName)}</b></td>
              <td style="padding:6px 4px; border-bottom:1px solid #ddd;">${it.containerSize}L</td>
              <td style="padding:6px 4px; border-bottom:1px solid #ddd; text-align:right; font-family:monospace;">${it.damagedQty}</td>
              <td style="padding:6px 4px; border-bottom:1px solid #ddd; text-align:right; font-family:monospace; font-weight:700;">${it.replacementQty}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  }

  return `
    <div id="printable-sr-receipt" class="pos-receipt-card" style="background:#FFFFFF; color:#26211C; border:1px solid #D9D0C3; border-radius:8px; padding:18px 20px; max-width:540px; margin:0 auto; font-family:'Inter', system-ui, sans-serif; font-size:12.5px;">
      <div class="pos-receipt-header" style="text-align:center; border-bottom:2px dashed #222; padding-bottom:10px; margin-bottom:12px;">
        <div class="pos-receipt-title" style="font-size:17px; font-weight:800; letter-spacing:0.03em;">${escapeHtml(s.businessName || 'MRGR COLOR CENTER')}</div>
        <div class="pos-receipt-sub" style="font-size:11px; color:#555;">${escapeHtml(s.businessSubtitle || 'Paint & Hardware Supply · Sales & Inventory')}</div>
        <div class="pos-receipt-sub" style="font-size:10.5px; color:#555; line-height:1.35; margin-top:3px;">${s.businessAddress && s.businessAddress !== BUSINESS_ADDRESS ? escapeHtml(s.businessAddress) : businessAddressHtml()}</div>
        <div class="pos-receipt-sub" style="font-size:10.5px; color:#555; margin-top:2px;">Contact Number: ${escapeHtml(s.businessContact || BUSINESS_CONTACT_NUMBER)}</div>
        <div style="font-size:12px; font-weight:800; margin-top:6px; letter-spacing:0.03em;">${escapeHtml(title)}</div>
        <div class="pos-receipt-badge" style="display:inline-block; padding:3px 10px; border:1.5px solid #222; margin-top:6px; font-weight:700; font-family:monospace; font-size:13px;">${escapeHtml(rcpt.receiptNumber)}</div>
        ${isReprint || rcpt.reprintCount > 0 ? `<div style="font-size:10.5px; font-weight:700; margin-top:4px; color:#555;">*** REPRINT COPY${rcpt.reprintCount > 0 ? ` (#${rcpt.reprintCount})` : ''} ***</div>` : ''}
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px 12px; font-size:11.5px; border-bottom:1px dashed #999; padding-bottom:10px; margin-bottom:10px;">
        <div><b>Replacement Ref:</b> ${escapeHtml(rcpt.requestRef)}</div>
        <div><b>Original PO:</b> ${escapeHtml(rcpt.poNumber)}</div>
        <div><b>Date &amp; Time:</b> ${escapeHtml(issuedStr)}</div>
        <div><b>${isDelivery ? 'Inspected By' : 'Confirmed By'}:</b> ${escapeHtml(rcpt.confirmedBy)}</div>
      </div>

      <div style="font-size:11.5px; border-bottom:1px dashed #999; padding-bottom:8px; margin-bottom:8px;">
        <div style="font-weight:700; text-transform:uppercase; font-size:10.5px; color:#555; margin-bottom:2px;">Supplier Information</div>
        <div><b>${escapeHtml(sup.name || rcpt.supplierName)}</b></div>
        ${supContactParts.length ? `<div style="color:#444;">${escapeHtml(supContactParts.join(' · '))}</div>` : ''}
      </div>

      ${tableHtml}

      <div style="border-top:2px dashed #222; margin-top:12px; padding-top:8px; font-size:12px;">
        ${s.damageReason ? `<div style="display:flex; justify-content:space-between; gap:8px; padding:2px 0;"><span>Damage Reason:</span><b>${escapeHtml(s.damageReason)}</b></div>` : ''}
        ${(s.remarks || s.inspectionNotes) ? `<div style="display:flex; justify-content:space-between; gap:8px; padding:2px 0;"><span>${isDelivery ? 'Inspection Notes' : 'Supplier Remarks'}:</span><span>${escapeHtml(s.remarks || s.inspectionNotes)}</span></div>` : ''}
        ${!isDelivery ? `<div style="display:flex; justify-content:space-between; gap:8px; padding:4px 0; font-size:13.5px; font-weight:800; border-top:1px solid #222; margin-top:4px;"><span>TOTAL REPLACEMENT QTY:</span><span style="font-family:monospace;">${s.totalReplacementQty} unit${s.totalReplacementQty === 1 ? '' : 's'}</span></div>` : ''}
        <div style="margin-top:6px; padding:5px 8px; border:1px solid #222; text-align:center; font-weight:800; font-size:11px; letter-spacing:0.02em;">
          STATUS: ${escapeHtml(s.status || 'CONFIRMED BY SUPPLIER – AWAITING DELIVERY')}
        </div>
      </div>

      <div class="pos-receipt-footer" style="text-align:center; font-size:10.5px; color:#444; margin-top:14px; border-top:1px dashed #222; padding-top:10px; line-height:1.45;">
        ${isDelivery
      ? `<div>Physical inspection completed. Only accepted replacement quantities have been posted to sellable inventory and FIFO batches.</div>`
      : `<div><b>The supplier has confirmed agreement to replace the damaged items listed above.</b></div>
             <div>Items are still awaiting physical delivery and inspection. This is NOT a sales receipt, payment receipt, or proof of actual delivery.</div>`}
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-top:22px; text-align:center; font-size:10.5px;">
          <div>
            <div style="border-top:1px solid #222; padding-top:4px; font-weight:700;">${escapeHtml(rcpt.confirmedBy)}</div>
            <div style="color:#666;">Authorized Staff Signature</div>
          </div>
          <div>
            <div style="border-top:1px solid #222; padding-top:4px; font-weight:700;">${escapeHtml(sup.name || rcpt.supplierName)}</div>
            <div style="color:#666;">Supplier Representative</div>
          </div>
        </div>
      </div>
    </div>`;
}

function buildThermalReplacementReceiptHtml(rcpt, isReprint = false) {
  const s = rcpt.snapshot || {};
  const sup = s.supplier || { name: rcpt.supplierName };
  const isDelivery = (rcpt.receiptType === 'delivery' || s.receiptType === 'delivery');
  const title = s.receiptTitle || (isDelivery ? 'SUPPLIER REPLACEMENT RECEIVING RECEIPT' : 'SUPPLIER REPLACEMENT CONFIRMATION RECEIPT');
  const issuedStr = typeof formatDateTime === 'function' ? formatDateTime(rcpt.issuedAt) : rcpt.issuedAt;
  const items = isDelivery && s.item ? [s.item] : (Array.isArray(s.items) ? s.items : []);

  return `
    <div class="thermal-receipt">
      <div class="th-center">
        <div class="th-title">${escapeHtml(s.businessName || 'MRGR COLOR CENTER')}</div>
        <div class="th-sub">${escapeHtml(s.businessSubtitle || 'Paint & Hardware Supply')}</div>
        <div class="th-sub" style="font-size:9.5px; line-height:1.3; margin:2px 0; word-break:break-word;">${s.businessAddress && s.businessAddress !== BUSINESS_ADDRESS ? escapeHtml(s.businessAddress) : businessAddressHtml()}</div>
        <div class="th-sub" style="font-size:9.5px; margin-bottom:2px;">Contact Number: ${escapeHtml(s.businessContact || BUSINESS_CONTACT_NUMBER)}</div>
        <div class="th-bold" style="margin-top:4px; font-size:10.5px;">${escapeHtml(title)}</div>
        <div class="th-receipt-no">${escapeHtml(rcpt.receiptNumber)}</div>
        ${isReprint || rcpt.reprintCount > 0 ? `<div class="th-sub th-bold" style="margin-top:2px;">*** REPRINT COPY ***</div>` : ''}
      </div>
      <div class="th-divider"></div>
      <div class="th-row"><span>Req Ref:</span><span class="th-bold">${escapeHtml(rcpt.requestRef)}</span></div>
      <div class="th-row"><span>Orig PO:</span><span class="th-bold">${escapeHtml(rcpt.poNumber)}</span></div>
      <div class="th-row"><span>Date:</span><span>${escapeHtml(issuedStr)}</span></div>
      <div class="th-row"><span>Staff:</span><span>${escapeHtml(rcpt.confirmedBy)}</span></div>
      <div class="th-divider"></div>
      <div class="th-bold">SUPPLIER: ${escapeHtml(sup.name || rcpt.supplierName)}</div>
      ${sup.phone ? `<div class="th-meta-line">Tel: ${escapeHtml(sup.phone)}</div>` : ''}
      ${sup.contact ? `<div class="th-meta-line">Attn: ${escapeHtml(sup.contact)}</div>` : ''}
      <div class="th-divider"></div>
      ${items.map(it => isDelivery
    ? `<div class="th-item">
             <div class="th-bold">${escapeHtml(it.productName)} (${it.containerSize}L)</div>
             <div class="th-sub-row"><span>Delivered: ${it.deliveredQty} · Accepted: ${it.acceptedQty}</span><span>Dmg: ${it.damagedQty}</span></div>
             ${it.batchNumber ? `<div class="th-meta-line">Batch: ${escapeHtml(it.batchNumber)}</div>` : ''}
           </div>`
    : `<div class="th-item">
             <div class="th-bold">${escapeHtml(it.productName)} (${it.containerSize}L)</div>
             <div class="th-sub-row"><span>Damaged: ${it.damagedQty}</span><span class="th-bold">Replace: ${it.replacementQty}</span></div>
           </div>`).join('')}
      <div class="th-divider-bold"></div>
      ${s.damageReason ? `<div class="th-row"><span>Reason:</span><span>${escapeHtml(s.damageReason)}</span></div>` : ''}
      ${(s.remarks || s.inspectionNotes) ? `<div class="th-meta-line">Notes: ${escapeHtml(s.remarks || s.inspectionNotes)}</div>` : ''}
      ${!isDelivery ? `<div class="th-row th-grand"><span>TOTAL REPLACE:</span><span>${s.totalReplacementQty} unit${s.totalReplacementQty === 1 ? '' : 's'}</span></div>` : ''}
      <div class="th-divider"></div>
      <div class="th-center th-bold" style="font-size:10px;">${escapeHtml(s.status || 'CONFIRMED BY SUPPLIER – AWAITING DELIVERY')}</div>
      <div class="th-footer th-center">
        ${isDelivery
      ? 'Physical inspection completed. Accepted units posted to inventory.'
      : 'Supplier confirmed replacement agreement. Awaiting physical delivery & inspection. NOT a sales or delivery receipt.'}
      </div>
      <div class="th-divider"></div>
      <div class="th-center th-meta-line" style="margin-top:16px;">__________________________<br>${escapeHtml(rcpt.confirmedBy)} (Authorized Staff)</div>
    </div>`;
}

function openReplacementReceiptModal(requestId, type = 'confirmation', receiptId = null, triggerReprint = false) {
  const req = (srState.replacementRequests || []).find(r => r.id === requestId);
  if (!req) return;
  let rcpt = null;
  if (type === 'delivery') {
    const list = req.deliveryReceipts || [];
    rcpt = receiptId ? list.find(x => x.id === receiptId) : list[0];
  } else {
    rcpt = req.confirmationReceipt || null;
  }
  if (!rcpt) {
    showToast('No receipt record found for this replacement request.', 'error');
    return;
  }
  window._activeReplacementReceipt = rcpt;
  const bodyHtml = buildReplacementReceiptHtml(rcpt, triggerReprint);
  const footHtml = `
    <button type="button" class="btn secondary" onclick="closeModal()">Close</button>
    <button type="button" class="btn secondary" onclick="printReplacementReceipt('thermal', ${triggerReprint ? 'true' : 'false'})">🧾 Thermal Print</button>
    <button type="button" class="btn" onclick="printReplacementReceipt('standard', ${triggerReprint ? 'true' : 'false'})">${triggerReprint ? '🔁 Reprint Receipt' : '🖨️ Print Receipt'}</button>
  `;
  openModal(`${rcpt.receiptNumber} — Replacement Receipt`, bodyHtml, footHtml);
}

async function printReplacementReceipt(mode = 'standard', isReprint = false) {
  const rcpt = window._activeReplacementReceipt;
  if (!rcpt) return;

  // Log reprint without ever generating a new receipt number
  if (isReprint) {
    try {
      const resp = await fetch('api/supplier_returns.php?action=log_receipt_reprint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiptId: rcpt.id })
      });
      const json = await resp.json();
      if (json && json.success) {
        applySupplierReturnsPayload(json);
        rcpt.reprintCount = json.reprintCount;
      }
    } catch (e) { /* non-blocking */ }
  }

  if (mode === 'thermal') {
    const printWin = window.open('', '_blank', 'width=360,height=720');
    if (!printWin) { showToast('Popup blocker prevented thermal receipt window from opening.', 'error'); return; }
    printWin.document.write(`<!DOCTYPE html><html><head><title>${escapeHtml(rcpt.receiptNumber)}</title><style>
      * { box-sizing: border-box; }
      body { font-family: 'Courier New', Courier, monospace; font-size: 11px; color: #000; background: #fff; margin: 0; padding: 6px; width: 80mm; }
      .thermal-receipt { width: 100%; } .th-center { text-align: center; } .th-title { font-size: 14px; font-weight: 700; }
      .th-sub { font-size: 10px; } .th-receipt-no { font-size: 12px; font-weight: 700; margin-top: 4px; border: 1px dashed #000; padding: 2px 6px; display: inline-block; }
      .th-divider { border-top: 1px dashed #000; margin: 6px 0; } .th-divider-bold { border-top: 2px solid #000; margin: 6px 0; }
      .th-item { padding: 4px 0; border-bottom: 1px dotted #999; } .th-row, .th-sub-row { display: flex; justify-content: space-between; gap: 6px; line-height: 1.35; }
      .th-sub-row { font-size: 10px; padding-left: 4px; } .th-meta-line { font-size: 9.5px; line-height: 1.3; }
      .th-bold { font-weight: 700; } .th-grand { font-size: 12.5px; font-weight: 700; padding: 2px 0; } .th-footer { font-size: 9.5px; margin-top: 6px; line-height: 1.35; }
      @media print { @page { size: 80mm auto; margin: 2mm; } body { padding: 0; width: 76mm; } }
    </style></head><body>${buildThermalReplacementReceiptHtml(rcpt, isReprint)}<script>window.onafterprint=function(){window.close();};window.onload=function(){setTimeout(function(){window.print();},150);};<\/script></body></html>`);
    printWin.document.close();
    return;
  }

  const printWin = window.open('', '_blank', 'width=720,height=820');
  if (!printWin) { showToast('Popup blocker prevented receipt window from opening.', 'error'); return; }
  printWin.document.write(`<!DOCTYPE html><html><head><title>${escapeHtml(rcpt.receiptNumber)} - MRGR Color Center</title><style>
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-sizing: border-box; }
    body { font-family: 'Inter', system-ui, -apple-system, sans-serif; color: #26211C; background: #fff; padding: 24px; margin: 0; }
    @media print { body { padding: 0; } @page { margin: 8mm; } }
  </style></head><body>${buildReplacementReceiptHtml(rcpt, isReprint)}<script>window.onafterprint=function(){window.close();};window.onload=function(){setTimeout(function(){window.print();},150);};<\/script></body></html>`);
  printWin.document.close();
}

async function submitCancelReplacementRequest(requestId, targetStatus = 'Cancelled') {
  if (window._isSubmittingRepAction) return;
  window._isSubmittingRepAction = true;
  try {
    const resp = await fetch('api/supplier_returns.php?action=update_replacement_status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId,
        status: targetStatus,
        notes: (document.getElementById('sr-mrep-cred-note')?.value || '').trim() || `${targetStatus} by Administrator`
      })
    });
    const json = await resp.json();
    if (!json || !json.success) {
      showToast((json && json.error) || 'Failed to update replacement request.', 'error');
      return;
    }
    applySupplierReturnsPayload(json);
    if (typeof posBatchStatusLoadedAt !== 'undefined') posBatchStatusLoadedAt = 0;
    if (typeof DISC !== 'undefined') DISC.loaded = false;
    if (typeof EXP !== 'undefined') { EXP.loaded = false; EXP.summaryTs = 0; }
    if (typeof loadDB === 'function') await loadDB();
    closeModal();
    showToast(`Replacement request marked as ${targetStatus}.`, 'ok');
    renderPage();
  } catch (err) {
    showToast('Network error updating replacement request.', 'error');
  } finally {
    window._isSubmittingRepAction = false;
  }
}

async function submitUpdateReplacementRequest(requestId, recordCredit = false) {
  if (window._isSubmittingRepAction) return;
  window._isSubmittingRepAction = true;
  const payload = { requestId, recordCredit };
  if (recordCredit) {
    payload.creditType = document.getElementById('sr-mrep-cred-type')?.value || 'Supplier Credit';
    payload.creditAmount = parseFloat(document.getElementById('sr-mrep-cred-amt')?.value || '0');
    payload.creditNotes = (document.getElementById('sr-mrep-cred-note')?.value || '').trim();
  }

  try {
    const resp = await fetch('api/supplier_returns.php?action=update_replacement_status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const json = await resp.json();
    if (!json || !json.success) {
      showToast((json && json.error) || 'Failed to update replacement request.', 'error');
      return;
    }
    applySupplierReturnsPayload(json);
    if (typeof posBatchStatusLoadedAt !== 'undefined') posBatchStatusLoadedAt = 0;
    if (typeof DISC !== 'undefined') DISC.loaded = false;
    if (typeof EXP !== 'undefined') { EXP.loaded = false; EXP.summaryTs = 0; }
    if (typeof loadDB === 'function') await loadDB();
    closeModal();
    showToast(recordCredit ? 'Supplier credit/refund recorded & replacement request resolved.' : 'Replacement request updated.', 'ok');
    renderPage();
  } catch (err) {
    showToast('Network error updating replacement request.', 'error');
  } finally {
    window._isSubmittingRepAction = false;
  }
}

let _repDelIdempotencyKey = '';

function openReceiveReplacementDeliveryModal(requestId) {
  const req = (srState.replacementRequests || []).find(r => r.id === requestId);
  if (!req || req.isResolved || req.remainingQty <= 0) {
    showToast('This replacement request has no remaining units to receive.', 'error');
    return;
  }

  _repDelIdempotencyKey = `rdel_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  const bodyHtml = `
    <div class="sr-modal-notice info">
      🔎 <b>Physical Replacement Inspection (${escapeHtml(req.requestRef)} — ${escapeHtml(req.poNumber)}):</b> Inspect delivered replacement units before posting. Only <b>Accepted</b> units enter sellable inventory &amp; FIFO batches.
    </div>
    <div style="margin-bottom:10px; font-size:13px;">
      <b>${escapeHtml(req.productName)}</b> <span class="sr-size-pill">${req.containerSize}L</span> · Supplier: <b>${escapeHtml(req.supplierName)}</b> · Remaining Requested: <b>${req.remainingQty}</b>
    </div>
    <div class="sr-form-grid">
      <label class="sr-field">
        <span>Actual Delivered Qty *</span>
        <input type="number" id="sr-rdel-delivered" min="1" max="${req.remainingQty}" step="1" value="${req.remainingQty}" oninput="srRepDelSync('delivered', ${req.remainingQty})">
      </label>
      <label class="sr-field">
        <span>Accepted Qty (Adds to Stock) *</span>
        <input type="number" id="sr-rdel-accepted" min="0" max="${req.remainingQty}" step="1" value="${req.remainingQty}" oninput="srRepDelSync('accepted', ${req.remainingQty})">
      </label>
      <label class="sr-field">
        <span>Damaged / Rejected Qty</span>
        <input type="number" id="sr-rdel-damaged" min="0" max="${req.remainingQty}" step="1" value="0" oninput="srRepDelSync('damaged', ${req.remainingQty})">
      </label>
      <label class="sr-field">
        <span>Expiration Date (Required when Accepted &gt; 0) *</span>
        <input type="date" id="sr-rdel-exp" min="${todayISO()}">
      </label>
      <label class="sr-field full hidden" id="sr-rdel-reason-wrap">
        <span>Damage Reason (Required when Damaged > 0) *</span>
        <select id="sr-rdel-reason">
          <option value="">— Select Reason —</option>
          ${SR_DAMAGE_REASONS.map(r => `<option value="${escapeAttr(r)}">${escapeHtml(r)}</option>`).join('')}
        </select>
      </label>
      <label class="sr-field full">
        <span>Inspection Notes</span>
        <input type="text" id="sr-rdel-notes" placeholder="Physical inspection remarks...">
      </label>
    </div>
    <label class="rcv-inspect-attest" style="margin-top:12px;">
      <input type="checkbox" id="sr-rdel-attest" onchange="document.getElementById('sr-rdel-submit-btn').disabled = !this.checked;">
      <span>I confirm that physical inspection of this replacement delivery is complete and only accepted units should enter sellable inventory.</span>
    </label>
  `;

  const footHtml = `
    <button type="button" class="btn secondary" onclick="closeModal()">Cancel</button>
    <button type="button" class="btn" id="sr-rdel-submit-btn" disabled onclick="submitReceiveReplacementDelivery('${req.id}')">✓ Confirm Replacement Delivery</button>
  `;

  openModal(`Receive Replacement Delivery — ${req.requestRef}`, bodyHtml, footHtml);
}

function srRepDelSync(changed, maxRem) {
  const delEl = document.getElementById('sr-rdel-delivered');
  const accEl = document.getElementById('sr-rdel-accepted');
  const dmgEl = document.getElementById('sr-rdel-damaged');
  const reasonWrap = document.getElementById('sr-rdel-reason-wrap');
  if (!delEl || !accEl || !dmgEl) return;

  let del = Math.min(maxRem, Math.max(0, Math.floor(parseFloat(delEl.value) || 0)));
  delEl.value = del;
  accEl.max = del;
  dmgEl.max = del;

  if (changed === 'delivered') {
    let dmg = Math.min(del, Math.max(0, Math.floor(parseFloat(dmgEl.value) || 0)));
    dmgEl.value = dmg;
    accEl.value = del - dmg;
  } else if (changed === 'accepted') {
    let acc = Math.min(del, Math.max(0, Math.floor(parseFloat(accEl.value) || 0)));
    accEl.value = acc;
    dmgEl.value = del - acc;
  } else {
    let dmg = Math.min(del, Math.max(0, Math.floor(parseFloat(dmgEl.value) || 0)));
    dmgEl.value = dmg;
    accEl.value = del - dmg;
  }

  if (reasonWrap) {
    reasonWrap.classList.toggle('hidden', (parseInt(dmgEl.value, 10) || 0) <= 0);
  }
}

async function submitReceiveReplacementDelivery(requestId) {
  if (window._isSubmittingRepDelivery) return;
  const del = parseInt(document.getElementById('sr-rdel-delivered')?.value || '0', 10);
  const acc = parseInt(document.getElementById('sr-rdel-accepted')?.value || '0', 10);
  const dmg = parseInt(document.getElementById('sr-rdel-damaged')?.value || '0', 10);
  const damageReason = document.getElementById('sr-rdel-reason')?.value || '';
  const inspectionNotes = (document.getElementById('sr-rdel-notes')?.value || '').trim();
  const expirationDate = document.getElementById('sr-rdel-exp')?.value || '';

  if (del <= 0 || del !== acc + dmg) {
    showToast('Actual Delivered must be > 0 and equal Accepted + Damaged.', 'error');
    return;
  }
  if (dmg > 0 && !damageReason) {
    showToast('Please select a Damage Reason for damaged replacement units.', 'error');
    return;
  }
  if (acc > 0) {
    const expEl = document.getElementById('sr-rdel-exp');
    if (!expirationDate) {
      showToast('Please enter an Expiration Date for accepted replacement units.', 'error');
      if (expEl) expEl.focus();
      return;
    }
    if (expirationDate < todayISO()) {
      showToast('Expiration Date cannot be in the past. Please select today or a future date.', 'error');
      if (expEl) expEl.focus();
      return;
    }
  }

  window._isSubmittingRepDelivery = true;
  const btn = document.getElementById('sr-rdel-submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Posting…'; }

  try {
    const resp = await fetch('api/supplier_returns.php?action=receive_replacement_delivery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId,
        deliveredQty: del,
        acceptedQty: acc,
        damagedQty: dmg,
        damageReason,
        inspectionNotes,
        expirationDate: expirationDate || null,
        idempotencyKey: _repDelIdempotencyKey
      })
    });
    const json = await resp.json();
    if (!json || !json.success) {
      showToast((json && json.error) || 'Failed to post replacement delivery.', 'error');
      return;
    }
    applySupplierReturnsPayload(json);
    if (typeof posBatchStatusLoadedAt !== 'undefined') posBatchStatusLoadedAt = 0;
    if (typeof DISC !== 'undefined') DISC.loaded = false;
    if (typeof EXP !== 'undefined') { EXP.loaded = false; EXP.summaryTs = 0; }
    if (typeof loadDB === 'function') await loadDB();
    closeModal();
    const fuMsg = json.autoFollowUpRef ? ` · Follow-up Replacement Request ${json.autoFollowUpRef} auto-generated` : '';
    showToast(`Replacement delivery posted (${acc} accepted added to stock${dmg > 0 ? `, ${dmg} damaged excluded` : ''}${fuMsg}).`, 'ok');
    renderPage();
  } catch (err) {
    showToast('Network error posting replacement delivery.', 'error');
  } finally {
    window._isSubmittingRepDelivery = false;
    if (btn) btn.disabled = false;
  }
}
