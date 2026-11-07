/* ============================================================
   8. ADMIN — DASHBOARD
   ============================================================ */

function renderAuditCategoryBadgeSimple(cat, action) {
  const catMap = {
    login_logout: { label: '🔐 Session', bg: '#EDE9FE', color: '#5B21B6', border: '#DDD6FE' },
    security_events: { label: '🛡️ Security', bg: '#FEE2E2', color: '#991B1B', border: '#FCA5A5' },
    product_changes: { label: '📦 Product', bg: '#E0F2FE', color: '#0369A1', border: '#BAE6FD' },
    stock_movements: { label: '🚚 Stock Move', bg: '#FEF3C7', color: '#92400E', border: '#FDE68A' },
    purchase_orders: { label: '📋 Purchase Order', bg: '#F0FDF4', color: '#166534', border: '#BBF7D0' },
    sales_transactions: { label: '🛒 POS Sale', bg: '#F3E8FF', color: '#6B21A8', border: '#E9D5FF' },
    returns_refunds: { label: '↩️ Return/Refund', bg: '#FFF1F2', color: '#9F1239', border: '#FECDD3' },
    user_management: { label: '👤 User Admin', bg: '#F1F5F9', color: '#334155', border: '#CBD5E1' }
  };
  const c = catMap[cat] || { label: action || 'Activity', bg: '#F5F1E9', color: 'var(--ink-soft)', border: '#E2DACD' };
  return `<span class="badge" style="background:${c.bg}; color:${c.color}; border:1px solid ${c.border}; font-size:11px; font-weight:700; padding:2px 8px;">${c.label}</span>`;
}

function renderAdminAuditLogRows(rows) {
  if (!rows || !rows.length) {
    return `<tr><td colspan="5" class="empty-state" style="padding:24px 0; text-align:center; color:var(--ink-soft);">No recent user activities recorded.</td></tr>`;
  }
  return rows.map(r => {
    const timeText = renderMovementDateTimeCell(r.created_at || r.createdAt);
    const userRole = escapeHtml(r.user_role || r.userRole || 'User');
    const userName = escapeHtml(r.user_name || r.userName || 'System');
    const action = escapeHtml(r.action || '');
    const rawDetails = (r.details || r.detailsClean || '');
    const details = escapeHtml(typeof cleanDisplayAuditText === 'function' ? cleanDisplayAuditText(rawDetails) : rawDetails);
    const category = typeof getAuditActionCategory === 'function' ? getAuditActionCategory(r.action) : '';
    const categoryBadge = renderAuditCategoryBadgeSimple(category, action);

    return `
      <tr>
        <td style="white-space:nowrap; vertical-align:middle; width:130px;">${timeText}</td>
        <td style="vertical-align:middle; white-space:nowrap;">
          <div style="font-weight:600; font-size:12.5px; color:var(--ink);">${userName}</div>
          <span class="badge" style="font-size:10px; padding:1px 6px; background:#F5F1E9; color:var(--ink-soft); border:1px solid #E2DACD;">${userRole}</span>
        </td>
        <td style="vertical-align:middle; white-space:nowrap; width:140px;">${categoryBadge}</td>
        <td style="vertical-align:middle; font-size:12.5px; color:var(--ink); line-height:1.4;">${details || action}</td>
        <td class="center" style="vertical-align:middle; white-space:nowrap; width:80px;">
          <button type="button" class="btn ghost small" onclick="goTo('auditLog')" title="View in Audit Log">Audit &rarr;</button>
        </td>
      </tr>
    `;
  }).join('');
}

function loadAdminRecentAuditLogs() {
  const container = document.getElementById('admin-audit-table-body');
  if (!container) return;
  const userParam = (typeof currentUser !== 'undefined' && currentUser && currentUser.id) ? `&userId=${encodeURIComponent(currentUser.id)}` : '';
  fetch('api/audit.php?limit=6&page=1' + userParam)
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (data && Array.isArray(data.logs) && data.logs.length) {
        container.innerHTML = renderAdminAuditLogRows(data.logs);
      } else if (data && Array.isArray(data.rows) && data.rows.length) {
        container.innerHTML = renderAdminAuditLogRows(data.rows);
      } else {
        container.innerHTML = `<tr><td colspan="5" class="empty-state" style="padding:24px 0; text-align:center; color:var(--ink-soft);">No recent user activities recorded.</td></tr>`;
      }
    })
    .catch(() => {
      container.innerHTML = `<tr><td colspan="5" class="empty-state" style="padding:24px 0; text-align:center; color:var(--ink-soft);">Audit trail logged in MySQL ledger. <a href="#" onclick="goTo('auditLog'); return false;">Open Full Audit Log &rarr;</a></td></tr>`;
    });
}

function renderAdminAuditLogPanel() {
  return `
  <div class="panel">
    <div class="panel-head row wrap" style="gap:10px;">
      <div>
        <h3 style="margin:0; display:flex; align-items:center; gap:8px;">
          <span>🛡️ User Activity &amp; Audit Log</span>
          <span class="badge" style="background:#EDE9FE; color:#5B21B6; border:1px solid #DDD6FE; font-size:11.5px; padding:2px 8px;">
            Security &amp; Governance
          </span>
        </h3>
        <div class="muted small" style="margin-top:2px;">
          Chronological audit trail of user logins, role modifications, catalog updates, and inventory approvals
        </div>
      </div>
      <div class="spacer"></div>
      <button class="btn secondary small" onclick="goTo('auditLog')">
        View Complete Audit Trail &rarr;
      </button>
    </div>
    <div class="panel-body tight table-scroll">
      <table>
        <thead>
          <tr>
            <th style="min-width:130px;">Timestamp</th>
            <th style="min-width:140px;">Actor &amp; Role</th>
            <th style="min-width:140px;">Category</th>
            <th style="min-width:260px;">Activity Details</th>
            <th class="center" style="width:90px;">Action</th>
          </tr>
        </thead>
        <tbody id="admin-audit-table-body">
          <tr><td colspan="5" class="empty-state" style="padding:24px 0; text-align:center; color:var(--ink-soft);">Loading recent audit activities...</td></tr>
        </tbody>
      </table>
    </div>
  </div>`;
}
function renderAdminPOMonitoringPanel() {
  const openPOs = (db && db.purchaseOrders ? db.purchaseOrders : [])
    .filter(o => o.status === 'pending' || o.status === 'ordered' || o.status === 'partial')
    .sort((a, b) => new Date(b.orderDate || b.date) - new Date(a.orderDate || a.date));

  return `
  <div class="panel">
    <div class="panel-head row wrap" style="gap:10px;">
      <div>
        <h3 style="margin:0; display:flex; align-items:center; gap:8px;">
          <span>📋 Purchase Order Monitoring</span>
          <span class="badge ${openPOs.length ? 'mustard' : 'ok'}" style="font-size:11.5px; padding:2px 8px;">
            ${openPOs.length} Active
          </span>
        </h3>
        <div class="muted small" style="margin-top:2px;">
          Track purchase orders awaiting administrative review or inbound warehouse delivery
        </div>
      </div>
      <div class="spacer"></div>
      <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
        <button class="btn secondary small" onclick="goTo('purchaseOrders')">
          View All POs &rarr;
        </button>
      </div>
    </div>
    <div class="panel-body tight table-scroll">
      <table>
        <thead>
          <tr>
            <th>PO Number</th>
            <th>Supplier</th>
            <th>Order Date</th>
            <th>Items on Order</th>
            <th class="right">Total Amount</th>
            <th class="center">Status</th>
            <th class="center" style="width:140px;">Action</th>
          </tr>
        </thead>
        <tbody>
          ${openPOs.length ? openPOs.map(po => {
    const supplier = supplierById(po.supplierId);
    const items = getPOItems(po);
    const totalQty = items.reduce((sum, it) => sum + (Number(it.qty) || 0), 0);
    return `
            <tr>
              <td><code style="color:var(--teal); font-weight:700;">${escapeHtml(po.poNumber)}</code></td>
              <td><b>${escapeHtml((supplier && supplier.name) || po.supplierName || 'Unknown')}</b></td>
              <td>${formatDateTime(po.orderDate || po.date)}</td>
              <td>${items.length} line item${items.length === 1 ? '' : 's'} (${totalQty} units)</td>
              <td class="right" style="font-weight:700; font-family:'Space Grotesk',sans-serif;">${peso(po.totalAmount || 0)}</td>
              <td class="center">${poStatusBadge(po.status)}</td>
              <td class="center" style="white-space:nowrap;">
                ${po.status === 'pending' ? `
                  <button type="button" class="btn small" style="background:var(--teal); color:#fff; font-size:11.5px; padding:3px 10px;" onclick="goToApprovalsTab('purchaseOrders')" title="Review and authorize purchase order">
                    ⏳ Authorize PO
                  </button>
                ` : `
                  <button type="button" class="btn secondary small" style="font-size:11.5px; padding:3px 10px;" onclick="openPODetail('${po.id}')" title="View Purchase Order details">
                    👁️ View Details
                  </button>
                `}
              </td>
            </tr>`;
  }).join('') : `
            <tr>
              <td colspan="7" class="empty-state" style="padding:24px 0; text-align:center; color:var(--ink-soft);">
                ✓ All purchase orders have been received and completed. No active supplier orders.
              </td>
            </tr>
          `}
        </tbody>
      </table>
    </div>
  </div>`;
}
function renderAdminRecentStockMovementsPanel() {
  const allGrouped = groupStockMovements(db.movements);
  const recent = allGrouped.slice(0, 6);

  return `
  <div class="panel">
    <div class="panel-head row wrap" style="gap:10px;">
      <div>
        <h3 style="margin:0; display:flex; align-items:center; gap:8px;">
          <span>🚚 Recent Stock Movements</span>
          <span class="badge ok" style="font-size:11.5px; padding:2px 8px;">Warehouse Ledger</span>
        </h3>
        <div class="muted small" style="margin-top:2px;">
          Complete ledger of inbound deliveries, POS sales deductions, and physical stock adjustments
        </div>
      </div>
      <div class="spacer"></div>
      <button class="btn secondary small" onclick="goTo('reports'); if (typeof setReportTab==='function') setReportTab('transactions');">
        Full Transaction History &rarr;
      </button>
    </div>
    <div class="panel-body tight table-scroll">
      <table>
        <thead>
          <tr>
            <th style="min-width:110px;">Date &amp; Time</th>
            <th class="center" style="min-width:105px;">Type</th>
            <th style="min-width:200px;">Product &amp; Container</th>
            <th class="center" style="min-width:130px;">Stock Balance Trail</th>
            <th style="min-width:140px;">Reference / Staff</th>
            <th class="center" style="width:85px;">Action</th>
          </tr>
        </thead>
        <tbody>
          ${recent.length ? recent.map(m => {
    const line = (m.lines && m.lines[0]) || {};
    const refInfo = extractMovementReference(m);
    return `
            <tr>
              <td>${renderMovementDateTimeCell(m.date)}</td>
              <td class="center">${renderMovementTypeBadgeClean(m.type)}</td>
              <td>${renderMovementProductCellClean(line, m)}</td>
              <td class="center">${renderMovementQtyBadgeClean(line)}</td>
              <td>
                <div style="font-weight:600; font-size:12px; color:var(--ink);">${escapeHtml(m.staffName || 'System')}</div>
                ${renderMovementRefPillClean(refInfo)}
              </td>
              <td class="center">
                <button type="button" class="btn ghost small" onclick="openStaffMovementDetailModal('${m.id}')" title="View movement details">
                  Details
                </button>
              </td>
            </tr>`;
  }).join('') : `
            <tr>
              <td colspan="6" class="empty-state" style="padding:24px 0; text-align:center; color:var(--ink-soft);">
                No stock movements logged yet.
              </td>
            </tr>
          `}
        </tbody>
      </table>
    </div>
  </div>`;
}
function renderAdminReportsOverviewPanel() {
  const summary = LowStockService.getRestockSummary();
  const invVal = typeof calculateCurrentInventoryValue === 'function' ? calculateCurrentInventoryValue() : 0;
  const totalProds = summary.totalProducts || 1;
  const healthyPct = Math.round((summary.healthyProducts / totalProds) * 100);

  return `
  <div class="panel" style="background:linear-gradient(180deg, #FFFFFF 0%, #FAF8F5 100%);">
    <div class="panel-head row wrap" style="gap:10px;">
      <div>
        <h3 style="margin:0; display:flex; align-items:center; gap:8px;">
          <span>📈 Inventory Reports &amp; Business Intelligence</span>
        </h3>
        <div class="muted small" style="margin-top:2px;">
          Executive analytics on catalog valuation, replenishment health, and supplier performance
        </div>
      </div>
      <div class="spacer"></div>
      <button class="btn small" style="background:var(--teal); color:#fff;" onclick="goTo('reports')">
        Open Comprehensive Reports &rarr;
      </button>
    </div>
    <div class="panel-body" style="padding:18px 20px;">
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(210px, 1fr)); gap:14px; margin-bottom:18px;">
        <div style="background:#fff; border:1px solid var(--line); border-radius:var(--radius); padding:14px 16px; box-shadow:var(--shadow-sm);">
          <div style="font-size:11.5px; color:var(--ink-soft); font-weight:600; text-transform:uppercase; letter-spacing:0.5px;">Catalog Valuation</div>
          <div style="font-family:'Space Grotesk',sans-serif; font-size:22px; font-weight:700; color:var(--ink); margin-top:4px;">${peso(invVal)}</div>
          <div style="font-size:11.5px; color:var(--teal); margin-top:2px;">Estimated warehouse stock value</div>
        </div>

        <div style="background:#fff; border:1px solid var(--line); border-radius:var(--radius); padding:14px 16px; box-shadow:var(--shadow-sm);">
          <div style="font-size:11.5px; color:var(--ink-soft); font-weight:600; text-transform:uppercase; letter-spacing:0.5px;">Stock Health Score</div>
          <div style="font-family:'Space Grotesk',sans-serif; font-size:22px; font-weight:700; color:var(--success); margin-top:4px;">${healthyPct}%</div>
          <div style="font-size:11.5px; color:var(--ink-soft); margin-top:2px;">${summary.healthyProducts} of ${summary.totalProducts} products fully stocked</div>
        </div>

        <div style="background:#fff; border:1px solid var(--line); border-radius:var(--radius); padding:14px 16px; box-shadow:var(--shadow-sm);">
          <div style="font-size:11.5px; color:var(--ink-soft); font-weight:600; text-transform:uppercase; letter-spacing:0.5px;">Reorder Demand</div>
          <div style="font-family:'Space Grotesk',sans-serif; font-size:22px; font-weight:700; color:${summary.needsPOSizes ? 'var(--danger)' : 'var(--success)'}; margin-top:4px;">${summary.needsPOSizes} Sizes</div>
          <div style="font-size:11.5px; color:var(--ink-soft); margin-top:2px;">across ${summary.needsPOProducts} products needing PO</div>
        </div>

        <div style="background:#fff; border:1px solid var(--line); border-radius:var(--radius); padding:14px 16px; box-shadow:var(--shadow-sm);">
          <div style="font-size:11.5px; color:var(--ink-soft); font-weight:600; text-transform:uppercase; letter-spacing:0.5px;">Active Suppliers</div>
          <div style="font-family:'Space Grotesk',sans-serif; font-size:22px; font-weight:700; color:var(--orange); margin-top:4px;">${db.suppliers.filter(s => s.status === 'active').length}</div>
          <div style="font-size:11.5px; color:var(--ink-soft); margin-top:2px;">registered supplier accounts</div>
        </div>
      </div>

      <div style="display:flex; flex-wrap:wrap; gap:10px; align-items:center; padding-top:14px; border-top:1px dashed var(--line);">
        <span style="font-size:12px; font-weight:700; color:var(--ink-soft);">Direct Reports:</span>
        <button type="button" class="btn secondary small" onclick="goTo('reports'); if (typeof setReportTab==='function') setReportTab('sales');">💰 Sales Reports</button>
        <button type="button" class="btn secondary small" onclick="goTo('reports'); if (typeof setReportTab==='function') setReportTab('low_stock');">⚠️ Low-Stock Report</button>
        <button type="button" class="btn secondary small" onclick="goTo('reports'); if (typeof setReportTab==='function') setReportTab('transactions');">🧾 Movement History</button>
        <button type="button" class="btn secondary small" onclick="goTo('reports'); if (typeof setReportTab==='function') setReportTab('supplier_report');">👥 Supplier Analysis</button>
      </div>
    </div>
  </div>`;
}

function renderStaffIncomingDeliveriesPanel() {
  const incoming = (typeof openPOsForReceiving === 'function' ? openPOsForReceiving() : [])
    .filter(o => o.status === 'ordered' || o.status === 'partial');

  return `
  <div class="panel" style="margin-bottom:22px;">
    <div class="panel-head row wrap" style="gap:10px;">
      <div>
        <h3 style="margin:0; display:flex; align-items:center; gap:8px;">
          <span>🚚 Incoming Deliveries &amp; Inbound Shipments</span>
          <span class="badge ${incoming.length ? 'onorder' : 'ok'}" style="font-size:11.5px; padding:2px 8px;">
            ${incoming.length} Expected
          </span>
        </h3>
        <div class="muted small" style="margin-top:2px;">
          Approved purchase orders currently in transit from suppliers awaiting warehouse physical receiving
        </div>
      </div>
      <div class="spacer"></div>
      <button class="btn secondary small" onclick="goTo('receiving')">
        📥 Inbound Receiving Hub &rarr;
      </button>
    </div>
    <div class="panel-body tight table-scroll">
      <table>
        <thead>
          <tr>
            <th>PO Number</th>
            <th>Supplier</th>
            <th>Order Date</th>
            <th>Items Expected</th>
            <th class="right">Total Value</th>
            <th class="center">Status</th>
            <th class="center" style="width:150px;">Action</th>
          </tr>
        </thead>
        <tbody>
          ${incoming.length ? incoming.map(po => {
    const supplier = supplierById(po.supplierId);
    const items = getPOItems(po);
    const totalCans = items.reduce((sum, it) => sum + (Number(it.qty) || 0), 0);
    return `
            <tr>
              <td><code style="color:var(--teal); font-weight:700;">${escapeHtml(po.poNumber)}</code></td>
              <td><b>${escapeHtml((supplier && supplier.name) || po.supplierName || 'Unknown')}</b></td>
              <td>${formatDateTime(po.orderDate || po.date)}</td>
              <td>${items.length} line item${items.length === 1 ? '' : 's'} (${totalCans} units)</td>
              <td class="right" style="font-weight:700; font-family:'Space Grotesk',sans-serif;">${peso(po.totalAmount || 0)}</td>
              <td class="center">${poStatusBadge(po.status)}</td>
              <td class="center" style="white-space:nowrap;">
                <button type="button" class="btn small" style="background:var(--teal); color:#fff; font-size:11.5px; padding:4px 12px;" onclick="if(typeof receivingPOId!=='undefined') receivingPOId='${po.id}'; goTo('receiving');" title="Receive shipment into inventory">
                  📥 Receive Shipment
                </button>
              </td>
            </tr>`;
  }).join('') : `
            <tr>
              <td colspan="7" class="empty-state" style="padding:24px 0; text-align:center; color:var(--ink-soft);">
                ✓ No incoming shipments currently in transit. All placed purchase orders have been received.
              </td>
            </tr>
          `}
        </tbody>
      </table>
    </div>
  </div>`;
}

/* ============================================================
   ADMIN DASHBOARD: ENHANCED RECENT TRANSACTIONS HELPERS & DETAILS
   ============================================================ */

let adminExpandedTxnIds = new Set();

function toggleAdminTxnRow(saleId) {
  if (adminExpandedTxnIds.has(saleId)) {
    adminExpandedTxnIds.delete(saleId);
  } else {
    adminExpandedTxnIds.add(saleId);
  }
  const row = document.getElementById(`dash-txn-details-${saleId}`);
  const btn = document.getElementById(`btn-expand-txn-${saleId}`);
  const parentRow = document.getElementById(`dash-txn-row-${saleId}`);
  const isExpanded = adminExpandedTxnIds.has(saleId);
  if (row) {
    row.style.display = isExpanded ? 'table-row' : 'none';
  }
  if (parentRow) {
    parentRow.classList.toggle('expanded', isExpanded);
  }
  if (btn) {
    btn.innerHTML = isExpanded ? '▴ Close' : '▾ Details';
    btn.classList.toggle('active', isExpanded);
  }
}

function formatAdminTxnProductItem(it) {
  const isBlend = it.type === 'colormix';
  const p = (!isBlend && it.productId) ? productById(it.productId) : null;

  const name = it.name || (p ? p.name : (isBlend ? 'Custom Color Mix' : 'Paint Product'));
  const brand = it.brand || (p ? p.brand : (isBlend ? (it.baseType || 'Custom Mix') : '—'));

  let colorName = '';
  if (isBlend) {
    colorName = it.colorName || it.detectedColorName || 'Custom Shade';
  } else {
    colorName = it.colorName || (it.color && it.color !== '-' ? it.color : (p && p.color && p.color !== '-' ? p.color : 'Standard'));
  }

  const hex = isBlend ? (it.hexColor || '#1F6F6B') : (p ? getProductHex(p) : (it.hexColor || ''));

  const sizeNum = Number(it.size || it.containerSize || (p ? p.size : 0)) || (it.liters ? Number(it.liters) : null);
  const sizeStr = sizeNum ? `${sizeNum}L` : (it.size ? `${it.size}` : '—');

  const qty = Number(it.qty || 1);
  const unitPrice = Number(it.unitPrice !== undefined ? it.unitPrice : (it.price !== undefined ? it.price : (Number(it.lineTotal || 0) / Math.max(1, qty)))) || 0;
  const lineTotal = Number(it.lineTotal !== undefined ? it.lineTotal : (unitPrice * qty)) || 0;

  return {
    name,
    brand,
    colorName,
    hex,
    sizeStr,
    sizeNum,
    qty,
    unitPrice,
    lineTotal,
    isBlend,
    components: Array.isArray(it.components) ? it.components : []
  };
}

function formatAdminTxnProductsSoldSummary(items, saleId) {
  if (!items || !items.length) {
    return '<span class="muted small">—</span>';
  }
  const previewItems = items.slice(0, 2);
  const remainingCount = items.length - previewItems.length;

  const lines = previewItems.map(rawIt => {
    const it = formatAdminTxnProductItem(rawIt);
    const parts = [];
    if (it.sizeStr && it.sizeStr !== '—') parts.push(it.sizeStr);
    if (it.colorName && it.colorName !== 'Standard' && it.colorName !== '-') parts.push(it.colorName);
    const metaStr = parts.length ? ` (${parts.join(', ')})` : '';
    const fullTitle = `${it.name}${metaStr} × ${it.qty}`;

    return `
      <div class="dash-prod-sold-line" title="${escapeAttr(fullTitle)}" style="display:flex; align-items:center; gap:5px; line-height:1.35; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:240px;">
        ${it.isBlend && it.hex ? `<span class="cm-color-dot" style="background:${escapeHtml(it.hex)}; width:9px; height:9px; min-width:9px; border-radius:50%; display:inline-block; border:1px solid rgba(0,0,0,0.15);"></span>` : ''}
        <span style="font-weight:600; color:var(--ink); overflow:hidden; text-overflow:ellipsis;">${escapeHtml(it.name)}</span>
        ${parts.length ? `<span class="muted small" style="font-size:11px; white-space:nowrap;">(${escapeHtml(parts.join(', '))})</span>` : ''}
        <span style="font-weight:700; color:var(--teal); font-size:11.5px; white-space:nowrap;">×${it.qty}</span>
      </div>
    `;
  }).join('');

  return `
    <div style="font-size:12px;">
      ${lines}
      ${remainingCount > 0 ? `
        <div style="margin-top:2px;">
          <a href="#" onclick="toggleAdminTxnRow('${escapeAttr(saleId)}'); return false;" style="color:var(--teal); font-size:11px; font-weight:600; text-decoration:underline;">
            + ${remainingCount} more item${remainingCount === 1 ? '' : 's'} (click for details)
          </a>
        </div>
      ` : ''}
    </div>
  `;
}

function renderAdminRecentTransactionsPanel(recent) {
  return `
  <div class="panel">
    <div class="panel-head row wrap" style="gap:8px; align-items:center;">
      <div>
        <h3 style="margin:0;">Recent Transactions</h3>
        <div class="muted small" style="margin-top:2px;">
          Showing latest ${recent.length} completed retail sales transactions
        </div>
      </div>
      <div class="spacer"></div>
      <button class="btn secondary small" onclick="if (typeof goToReportsSalesHistory === 'function') { goToReportsSalesHistory(); } else { goTo('sales'); }" title="Navigate directly to Reports Sales History page">
        View Sales History &rarr;
      </button>
    </div>
    <div class="panel-body tight table-scroll">
      <table class="table-recent-transactions">
        <thead>
          <tr>
            <th>Receipt #</th>
            <th>Date &amp; Time</th>
            <th>Cashier</th>
            <th>Items</th>
            <th>Products Sold</th>
            <th class="center">Transaction Status</th>
            <th class="right">Total Amount</th>
            <th class="right">Action</th>
          </tr>
        </thead>
        <tbody>
          ${recent.length ? recent.map(s => {
    const receiptNo = getReceiptNo(s);
    const refundTotal = Number(s.refundTotal || 0);
    const netTotal = Number((s.total - refundTotal).toFixed(2));
    const totalAmount = Number(s.total || 0);
    const subtotalAmount = Number(s.subtotal !== undefined ? s.subtotal : totalAmount);
    const itemsList = Array.isArray(s.items) ? s.items : [];
    const itemsCount = itemsList.length;
    const totalCans = itemsList.reduce((acc, it) => acc + Number(it.qty || 0), 0);
    const isExpanded = adminExpandedTxnIds.has(s.id);

    const itemsDetailHtml = itemsList.length ? itemsList.map((rawIt, idx) => {
      const item = formatAdminTxnProductItem(rawIt);
      return `
                <tr style="border-bottom:1px solid var(--line-light);">
                  <td style="padding:7px 10px; color:var(--ink-soft); font-size:11.5px; text-align:center;">${idx + 1}</td>
                  <td style="padding:7px 10px;">
                    <div style="font-weight:600; color:var(--ink); display:flex; align-items:center; gap:6px;">
                      ${item.isBlend && item.hex ? `<span class="cm-color-dot" style="background:${escapeHtml(item.hex)}; width:12px; height:12px; border-radius:50%; display:inline-block; border:1px solid rgba(0,0,0,0.15);"></span>` : ''}
                      ${escapeHtml(item.name)}
                    </div>
                    ${item.components.length ? `
                      <div class="muted small" style="font-size:11px; margin-top:2px; color:#6B6259;">
                        Formula: ${item.components.map(cp => `${cp.percentage}% ${escapeHtml(cp.name)}`).join(' + ')}
                      </div>
                    ` : ''}
                  </td>
                  <td style="padding:7px 10px; color:var(--ink-soft);">${escapeHtml(item.brand)}</td>
                  <td style="padding:7px 10px;">
                    <div style="display:flex; align-items:center; gap:5px;">
                      ${item.hex ? `<span style="font-family:monospace; font-size:11px; font-weight:600; color:var(--teal);">(${escapeHtml(item.hex)})</span>` : ''}
                      <span>${escapeHtml(item.colorName)}</span>
                    </div>
                  </td>
                  <td style="padding:7px 10px; text-align:center; font-weight:600;">
                    <span class="badge" style="background:#F2EDE4; border:1px solid #E5DDCF; color:var(--ink); font-size:11px; padding:2px 7px;">${escapeHtml(item.sizeStr)}</span>
                  </td>
                  <td style="padding:7px 10px; text-align:right; font-weight:600;">${formatStock(item.qty)}</td>
                  <td style="padding:7px 10px; text-align:right;">${peso(item.unitPrice)}</td>
                  <td style="padding:7px 10px; text-align:right; font-weight:700; color:var(--ink);">${peso(item.lineTotal)}</td>
                </tr>
              `;
    }).join('') : `<tr><td colspan="8" class="empty-state" style="padding:14px; text-align:center;">No line items found.</td></tr>`;

    return `
              <tr class="dash-txn-row ${isExpanded ? 'expanded' : ''}" id="dash-txn-row-${s.id}">
                <td>
                  <a href="#" onclick="viewSale('${escapeAttr(s.id)}'); return false;" class="receipt-link" title="Click to view Official Receipt">
                    <code style="color:var(--teal); font-weight:700;">${escapeHtml(getReceiptNo(s))}</code>
                  </a>
                </td>
                <td style="white-space:nowrap; font-size:12.5px;">${formatDateTime(s.date)}</td>
                <td style="white-space:nowrap;">${escapeHtml(s.cashierName || 'Staff')}</td>
                <td style="white-space:nowrap;">
                  <span>${s.items.length} item${s.items.length === 1 ? '' : 's'}</span>
                  ${totalCans !== itemsCount ? `<span class="muted small" style="display:block; font-size:11px;">(${formatStock(totalCans)} pcs)</span>` : ''}
                </td>
                <td>
                  ${formatAdminTxnProductsSoldSummary(itemsList, s.id)}
                </td>
                <td class="center" style="white-space:nowrap;">${saleStatusBadge(s.status)}</td>
                <td class="right" style="text-align:right; white-space:nowrap;">
                  ${refundTotal > 0 ? `
                    <div style="font-weight:700; font-family:'Space Grotesk'; font-size:13px;">${peso(netTotal)}</div>
                    <div class="muted small" style="color:var(--danger); font-size:10.5px;" title="Original: ${peso(s.total)}">Orig: ${peso(s.total)}</div>
                  ` : `
                    <div style="font-weight:700; font-family:'Space Grotesk'; font-size:13px;">${peso(s.total)}</div>
                  `}
                </td>
                <td style="text-align:right; white-space:nowrap;">
                  <div class="row wrap" style="justify-content:flex-end; gap:5px;">
                    <button type="button" class="btn ghost small ${isExpanded ? 'active' : ''}" id="btn-expand-txn-${s.id}" onclick="toggleAdminTxnRow('${s.id}')" title="Toggle detailed product breakdown" style="font-size:11.5px; padding:3px 8px; color:var(--teal);">
                      ${isExpanded ? '▴ Close' : '▾ Details'}
                    </button>
                    <button type="button" class="btn ghost small" onclick='viewSale("${s.id}")' title="View Official Receipt" style="font-size:11.5px; padding:3px 8px;">
                      🧾 Receipt
                    </button>
                  </div>
                </td>
              </tr>

              <!-- Expandable Details Row -->
              <tr id="dash-txn-details-${s.id}" class="dash-txn-details-row" style="display:${isExpanded ? 'table-row' : 'none'}; background:#FAF7F2; border-bottom:2px solid var(--line);">
                <td colspan="8" style="padding:14px 18px; border-top:1px dashed var(--line); border-bottom:2px solid var(--line-light);">
                  <div class="dash-txn-expanded-container" style="background:#FFFFFF; border:1px solid var(--line); border-radius:var(--radius-sm); padding:14px 16px; box-shadow:var(--shadow-sm);">
                    
                    <!-- Header row with meta info -->
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:12px; padding-bottom:10px; border-bottom:1px dashed var(--line);">
                      <div>
                        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                          <span style="font-family:'Space Grotesk'; font-weight:700; font-size:14px; color:var(--teal);">
                            Official Receipt: ${escapeHtml(receiptNo)}
                          </span>
                          ${saleStatusBadge(s.status)}
                        </div>
                        <div class="muted small" style="margin-top:4px; font-size:12px;">
                          <span>📅 <b>Date &amp; Time:</b> ${formatDateTime(s.date)}</span> &nbsp;·&nbsp;
                          <span>👤 <b>Cashier:</b> ${escapeHtml(s.cashierName || 'Staff')}</span>
                        </div>
                      </div>
                      <div style="display:flex; gap:6px;">
                        <button type="button" class="btn secondary small" onclick='viewSale("${s.id}")' title="Open complete printable receipt">
                          🧾 Open Full Receipt Modal &rarr;
                        </button>
                      </div>
                    </div>

                    <!-- Detailed Line Items Table -->
                    <div style="margin-bottom:12px; overflow-x:auto;">
                      <div style="font-weight:700; font-size:12.5px; margin-bottom:6px; color:var(--ink);">
                        📦 Products Sold &amp; Line Items (${itemsCount}):
                      </div>
                      <table style="width:100%; font-size:12px; margin:0; border:1px solid var(--line-light); background:#fff;">
                        <thead>
                          <tr style="background:#F7F4EE; border-bottom:1px solid var(--line);">
                            <th style="padding:6px 10px; width:30px; text-align:center;">#</th>
                            <th style="padding:6px 10px;">Product Name</th>
                            <th style="padding:6px 10px;">Brand</th>
                            <th style="padding:6px 10px;">Color Variant</th>
                            <th style="padding:6px 10px; text-align:center;">Container Size</th>
                            <th style="padding:6px 10px; text-align:right;">Quantity Sold</th>
                            <th style="padding:6px 10px; text-align:right;">Unit Price</th>
                            <th style="padding:6px 10px; text-align:right;">Subtotal</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${itemsDetailHtml}
                        </tbody>
                      </table>
                    </div>

                    <!-- Financial Summary Card (Subtotal, Total Due) -->
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:10px; padding:12px 14px; background:#FAF6EE; border:1px solid var(--line); border-radius:6px; font-size:12px;">
                      <div>
                        <span class="muted" style="display:block; font-size:11px; margin-bottom:2px;">Subtotal:</span>
                        <strong style="font-size:13.5px; font-family:'Space Grotesk';">${peso(subtotalAmount)}</strong>
                      </div>
                      ${(Number(s.discountAmount || s.discount || 0) > 0) ? `
                        <div>
                          <span class="muted" style="display:block; font-size:11px; margin-bottom:2px;">Promo Discount (10%):</span>
                          <strong style="font-size:13.5px; font-family:'Space Grotesk'; color:var(--teal); font-weight:700;">-${peso(Number(s.discountAmount || s.discount || 0))}</strong>
                        </div>
                      ` : ''}
                      <div>
                        <span class="muted" style="display:block; font-size:11px; margin-bottom:2px;">Total Due:</span>
                        <strong style="font-size:14px; font-family:'Space Grotesk'; color:var(--teal);">${peso(totalAmount)}</strong>
                        ${refundTotal > 0 ? `<div class="muted small" style="color:var(--danger); font-size:11px;">Net: ${peso(netTotal)}</div>` : ''}
                      </div>
                    </div>

                  </div>
                </td>
              </tr>
            `;
  }).join('') : `<tr><td colspan="8" class="empty-state">No sales recorded yet.</td></tr>`}
        </tbody>
      </table>
    </div>
  </div>
  `;
}

function adminDashboard() {
  if (currentUser && currentUser.role === 'staff') {
    return staffDashboard();
  }
  const todaySales = salesOn(todayISO());
  const low = lowStockProducts();
  const summary = LowStockService.getRestockSummary();
  const pendingPOs = (db.purchaseOrders || []).filter(o => o.status === 'pending');
  const orderedPOs = (db.purchaseOrders || []).filter(o => o.status === 'ordered' || o.status === 'partial');
  const pendingAdj = (typeof pendingAdjRequests === 'function' ? pendingAdjRequests() : (db.adjustmentRequests || []).filter(r => r.status === 'pending'));
  const pendingVoid = (typeof getPendingVoidRequests === 'function' ? getPendingVoidRequests() : (db.voidRequests || []).filter(v => v.status === 'pending'));
  const pendingInv = (db.products || []).filter(p =>
    p.status === 'pending_approval' ||
    Boolean(p.pendingEdit) ||
    (p.pendingSizes && p.pendingSizes.length > 0) ||
    (p.pendingPrice != null && Number(p.pendingPrice) > 0)
  );
  const totalPending = pendingAdj.length + pendingPOs.length + pendingInv.length + pendingVoid.length;
  const recent = [...db.sales].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);
  const greeting = getGreeting();
  const activeSuppliers = (db.suppliers || []).filter(s => s.status === 'active');
  const openPOCount = summary.openPOCount || (pendingPOs.length + orderedPOs.length);

  // Trigger loading of recent audit logs into the audit panel asynchronously
  setTimeout(loadAdminRecentAuditLogs, 50);

  return `
  <!-- Friendly Welcome Banner -->
  <div style="background: linear-gradient(135deg, #FAF6EE 0%, #F1E9DA 100%); border: 1px solid var(--line); border-radius: var(--radius); padding: 18px 22px; margin-bottom: 20px; box-shadow: var(--shadow-sm); display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 14px;">
    <div>
      <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
        <span style="font-family: 'Space Grotesk'; font-size: 20px; font-weight: 700; color: var(--ink);">
          ${greeting.emoji} ${greeting.text}, ${escapeHtml((currentUser && currentUser.name) || 'User')}!
        </span>
        <span class="badge" style="background:#0F766E; color:#FFFFFF; border:none; font-size:11px; font-weight:700; padding:2px 8px; border-radius:10px;">
          System Administrator
        </span>
      </div>
      <div class="muted small" style="margin-top: 4px; font-size: 13px;">
        Business Management &amp; Decision Hub — Managing <b>${activeProducts().length} active paint products</b> across <b>${activeSuppliers.length} suppliers</b>.
      </div>
    </div>
    <div class="row" style="gap: 8px; flex-wrap:wrap;">
      <span class="badge ${summary.totalLowProducts ? 'low' : 'ok'}" style="padding: 6px 14px; font-size: 12px; font-weight:700;" title="${summary.totalLowSizes} container variants below threshold">
        ${summary.totalLowProducts ? `⚠️ ${summary.totalLowProducts} Products Affected (${summary.totalLowSizes} Variants Low)` : '✓ All Stock Levels Healthy'}
      </span>
      ${summary.criticalOutProducts ? `
        <span class="badge out" style="padding: 6px 14px; font-size: 12px; font-weight:700;" title="${summary.criticalOutSizes} container variants completely out of stock">
          🚨 ${summary.criticalOutProducts} Products Out of Stock (${summary.criticalOutSizes} Variants)
        </span>
      ` : ''}
      <span class="badge" style="background:#EBF5FB; color:#1B4F72; border:1px solid #AED6F1; padding: 6px 14px; font-size: 12px; font-weight:700;" title="${summary.onOrderSizes} container variants on order">
        📋 ${openPOCount} Open PO${openPOCount === 1 ? '' : 's'} (${summary.onOrderSizes} Variants on Order)
      </span>
    </div>
  </div>

  <!-- Admin-Only Quick Actions Bar -->
  <div class="dashboard-actions-bar">
    <div class="bar-title">
      <span>⚡ Quick Actions</span>
    </div>
    <div class="bar-buttons">
      <button class="btn small" style="background:var(--teal); color:#fff;" onclick="goToApprovalsTab('adjustments')" title="Approve or reject pending stock adjustment requests">
        ⚖️ Approve / Reject Adjustments ${pendingAdj.length ? `<span class="nav-badge">${pendingAdj.length}</span>` : ''}
      </button>
      <button class="btn secondary small" onclick="goTo('users')" title="Manage user accounts, roles, and staff permissions">
        👤 Manage Staff &amp; Users ${getModuleBadgeHtml('users')}
      </button>
      <button class="btn secondary small" onclick="goTo('suppliers')" title="Manage supplier accounts, terms, and contacts">
        👥 Manage Suppliers
      </button>
      <button class="btn secondary small" onclick="goToApprovalsTab('purchaseOrders')" title="Review and authorize purchase orders">
        📋 Review Purchase Orders ${pendingPOs.length ? `<span class="nav-badge">${pendingPOs.length}</span>` : ''}
      </button>
      ${pendingVoid.length ? `
        <button class="btn secondary small" style="border-color:var(--danger); color:var(--danger); font-weight:700;" onclick="goToApprovalsTab('voidRequests')" title="Review and authorize cashier void sale requests">
          🚫 Void Requests <span class="nav-badge" style="background:var(--danger); color:#fff;">${pendingVoid.length}</span>
        </button>
      ` : ''}
      <button class="btn secondary small" onclick="goTo('reports')" title="View business analytics, valuation, and sales history">
        📊 View Business Reports
      </button>
      <button class="btn secondary small" onclick="goTo('inventory'); setTimeout(()=>openProductModal(), 80);" title="Create a new paint product entry">
        ➕ Add Product
      </button>
    </div>
  </div>

  <!-- Business Management KPIs Stat Grid (2 Balanced Rows of 4 on Desktop) -->
  <div class="stat-grid admin-kpi-grid">
    <!-- ROW 1: BUSINESS OPERATIONS & GOVERNANCE -->

    <!-- Card 1: Today's Sales -->
    <div class="stat-card clickable" onclick="if (typeof goToReportsSalesHistory === 'function') { goToReportsSalesHistory(); } else { goTo('reports'); }" title="Click to view sales history in Reports">
      <div class="label">💰 Today's Sales</div>
      <div class="value">${peso(sumSales(todaySales))}</div>
      <div class="sub">${todaySales.length} transaction${todaySales.length === 1 ? '' : 's'} completed</div>
      <div class="stat-card-footer">
        <span class="stat-action-link">View Sales History &rarr;</span>
      </div>
    </div>

    <!-- Card 2: Pending Approvals (Unified Approval Center) -->
    <div class="stat-card ${totalPending ? 'highlight-pending' : 'sage'} clickable" onclick="goTo('approvals')" title="Click to view Pending Approvals Hub: ${pendingAdj.length} stock adjustment${pendingAdj.length === 1 ? '' : 's'}, ${pendingPOs.length} purchase order${pendingPOs.length === 1 ? '' : 's'}, ${pendingVoid.length} void request${pendingVoid.length === 1 ? '' : 's'}, ${pendingInv.length} catalog update${pendingInv.length === 1 ? '' : 's'}">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:4px;">
        <div class="label" style="margin-bottom:0;">⏳ Pending Approvals</div>
        ${totalPending ? `<span class="badge warning" style="font-size:10px; font-weight:700; padding:1px 6px;">Action Req.</span>` : `<span class="badge ok" style="font-size:10px; font-weight:600; padding:1px 6px;">Clear</span>`}
      </div>
      <div class="value" style="${totalPending ? 'color:var(--mustard-dark, #92400E);' : ''}">${totalPending}</div>
      <div class="sub" style="font-size:12px; line-height:1.45;">
        ${totalPending > 0 ? `
          <span><b>${pendingAdj.length}</b> adjustments</span> · 
          <span><b>${pendingPOs.length}</b> POs</span> · 
          <span><b>${pendingVoid.length}</b> voids</span> · 
          <span><b>${pendingInv.length}</b> catalog</span>
        ` : `<span>All requests reviewed &amp; up to date</span>`}
      </div>
      <div class="stat-card-footer">
        <span class="stat-action-link">Approvals Hub &rarr;</span>
      </div>
    </div>

    <!-- Card 3: Registered Suppliers (Aligned in Row 1) -->
    <div class="stat-card orange clickable" onclick="goTo('suppliers')" title="Click to view supplier accounts">
      <div class="label">👥 Registered Suppliers</div>
      <div class="value">${activeSuppliers.length}</div>
      <div class="sub">active registered supplier partners</div>
      <div class="stat-card-footer">
        <span class="stat-action-link">Manage Suppliers &rarr;</span>
      </div>
    </div>

    <!-- ROW 2: CATALOG INVENTORY HEALTH & PROCUREMENT -->

    <!-- Card 4: Total Products -->
    <div class="stat-card mustard clickable" onclick="goTo('inventory')" title="Click to manage products & inventory">
      <div class="label">📦 Total Products</div>
      <div class="value">${summary.totalProducts}</div>
      <div class="sub"><b>${summary.healthyProducts}</b> in stock · <b>${summary.totalLowProducts}</b> low / out</div>
      <div class="stat-card-footer">
        <span class="stat-action-link">Manage Inventory &rarr;</span>
      </div>
    </div>

    <!-- Card 5: Low-Stock Items -->
    <div class="stat-card ${summary.needsPOSizes ? 'danger' : (summary.onOrderSizes ? 'mustard' : 'sage')} clickable" onclick="goTo('alerts')" title="Click to view low-stock alerts">
      <div class="label">⚠️ Low-Stock Items</div>
      <div class="value">${summary.totalLowProducts} Products</div>
      <div class="sub"><b>${summary.totalLowSizes}</b> variants low (<b>${summary.needsPOSizes}</b> need PO · <b>${summary.onOrderSizes}</b> on order)</div>
      <div class="stat-card-footer">
        <span class="stat-action-link">View Low-Stock Alerts &rarr;</span>
      </div>
    </div>

    <!-- Card 6: Out-of-Stock Items -->
    <div class="stat-card ${summary.criticalOutProducts ? 'danger' : 'sage'} clickable" onclick="goTo('alerts')" title="Click to review critical out of stock products">
      <div class="label">🚨 Out-of-Stock Items</div>
      <div class="value">${summary.criticalOutProducts} Products</div>
      <div class="sub"><b>${summary.criticalOutSizes}</b> container variants with 0 units remaining</div>
      <div class="stat-card-footer">
        <span class="stat-action-link">Review Critical Out &rarr;</span>
      </div>
    </div>

    <!-- Card 7: Purchase Order Monitoring -->
    <div class="stat-card clickable" onclick="goTo('purchaseOrders')" title="Click to monitor open purchase orders">
      <div class="label">📋 Purchase Orders</div>
      <div class="value">${openPOCount} Open</div>
      <div class="sub"><b>${pendingPOs.length}</b> pending review · <b>${orderedPOs.length}</b> en route</div>
      <div class="stat-card-footer">
        <span class="stat-action-link">Monitor POs &rarr;</span>
      </div>
    </div>
  </div>

  ${totalPending > 0 ? `
    <div class="alert-banner warning" style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; border-left:4px solid var(--mustard); margin-bottom:12px;">
      <span>⏳ <b>${totalPending} Pending Approval Request${totalPending === 1 ? '' : 's'} awaiting your decision</b> (${pendingAdj.length} stock adjustment${pendingAdj.length === 1 ? '' : 's'}, ${pendingPOs.length} purchase order${pendingPOs.length === 1 ? '' : 's'}, ${pendingVoid.length} void request${pendingVoid.length === 1 ? '' : 's'}, ${pendingInv.length} catalog update${pendingInv.length === 1 ? '' : 's'}).</span>
      <a href="#" onclick="goTo('approvals'); return false;" style="font-weight:700; color:var(--teal); text-decoration:underline;">Review in Approvals Hub &rarr;</a>
    </div>
  ` : ''}

  ${summary.needsPOSizes ? `
    <div class="alert-banner danger" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:14px;">
      <span>⚠️ <b>${summary.needsPOProducts} low-stock product${summary.needsPOProducts === 1 ? '' : 's'} (${summary.needsPOSizes} container size${summary.needsPOSizes === 1 ? '' : 's'})</b> need restock purchase orders.${summary.onOrderSizes ? ` <span style="opacity:0.9;">(${summary.onOrderSizes} container size${summary.onOrderSizes === 1 ? '' : 's'} already on order)</span>` : ''}</span>
      <a href="#" onclick="goTo('alerts');return false;" style="font-weight:700; text-decoration:underline;">View Low-Stock Alerts &rarr;</a>
    </div>
  ` : (summary.onOrderSizes ? `
    <div class="alert-banner" style="background:#EBF5FB; border-color:#AED6F1; color:#1B4F72; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:14px;">
      <span>✅ <b>All ${summary.onOrderSizes} low-stock container size${summary.onOrderSizes === 1 ? '' : 's'} have purchase orders placed</b> and are awaiting delivery.</span>
      <a href="#" onclick="goTo('alerts');return false;" style="font-weight:700; text-decoration:underline;">View On-Order Items &rarr;</a>
    </div>
  ` : '')}

  <!-- Panel 1: Recent Transactions -->
  ${renderAdminRecentTransactionsPanel(recent)}

  <!-- Panel 2: Purchase Order Monitoring -->
  ${renderAdminPOMonitoringPanel()}

  <!-- Panel 3: Low-Stock Watchlist (Monitoring-Only) -->
  <div class="panel">
    <div class="panel-head row wrap" style="gap:10px; align-items:center;">
      <div>
        <h3 style="margin:0; display:flex; align-items:center; gap:8px;">
          <span>📋 Low-Stock Watchlist</span>
          <span class="badge ${summary.needsPOSizes ? 'danger' : 'ok'}" style="font-size:11.5px; padding:2px 8px;">
            ${summary.needsPOSizes ? `${summary.needsPOSizes} Sizes Need PO` : 'All Restocked / On Order'}
          </span>
        </h3>
        <div class="muted small" style="margin-top:4px;">
          ${summary.needsPOProducts ? `⚠️ <b>${summary.needsPOProducts}</b> product(s) needing purchase orders (<b>${summary.needsPOSizes}</b> eligible container sizes).` : '✅ All low-stock products have purchase orders en route.'}
          ${summary.onOrderSizes ? `<span style="margin-left:6px; color:#1B4F72; font-weight:600;">(${summary.onOrderSizes} container sizes already on order awaiting delivery)</span>` : ''}
        </div>
      </div>
      <div class="spacer"></div>
      <div>
        <button type="button" class="btn secondary small" onclick="goTo('alerts')" title="Navigate to dedicated Low-Stock Alerts page to select sizes and create purchase orders">
          View All Alerts &rarr;
        </button>
      </div>
    </div>
    <div class="panel-body tight table-scroll">
      <table class="table-grouped-product">
        <thead>
          <tr>
            <th style="min-width:180px;">Product &amp; Color</th>
            <th style="min-width:110px;">Brand</th>
            <th style="min-width:140px;">Supplier</th>
            <th class="center" style="min-width:90px;">Container Size</th>
            <th class="right" style="min-width:110px;">Stock Quantity (Units)</th>
            <th class="right" style="min-width:90px;">Stock Volume (L)</th>
            <th class="right" style="min-width:120px;">Minimum Threshold (Units)</th>
            <th class="right" style="min-width:105px;">Threshold Volume (L)</th>
            <th class="center" style="min-width:95px;">Stock Status</th>
            <th class="center" style="min-width:120px;">PO Status</th>
          </tr>
        </thead>
        <tbody>
          ${low.length ? low.map((p, pIdx) => {
    let sizes = productSizes(p).filter(s => {
      const st = productSizeStatus(p, s);
      return st === 'low' || st === 'out';
    }).sort((a, b) => Number(a) - Number(b));
    if (!sizes.length) return '';
    const rowSpan = sizes.length;
    const bgGroup = pIdx % 2 === 1 ? 'background:#FCFBF9;' : 'background:#FFFFFF;';

    return sizes.map((s, idx) => {
      const isFirst = idx === 0;
      const isLast = idx === rowSpan - 1;
      const sizeRow = (p.sizes || []).find(r => String(r.size) === String(s));
      const sizeId = sizeRow ? sizeRow.id : '';
      const count = productCanCount(p, s);
      const thresh = productSizeThreshold(p, s);
      const stockVol = count * Number(s);
      const threshVol = thresh * Number(s);
      const st = LowStockService.getVariantStockStatus(p, s);
      const poSt = LowStockService.getVariantPOStatus(p, s, sizeId);
      const borderBottom = isLast ? 'border-bottom: 2px solid #D8D1C4;' : 'border-bottom: 1px solid #F0ECE1;';
      const rowClass = `dash-row dash-prod-row-${p.id} ${isLast ? 'product-row-last' : ''} ${poSt.status === 'on_order' ? 'row-on-order' : ''}`;

      return `
            <tr class="${rowClass}" style="${bgGroup}">
              ${isFirst ? `
                <td rowspan="${rowSpan}" style="vertical-align:middle; border-bottom: 2px solid #D8D1C4; border-right: 1px solid #EFE9DC;">
                  <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-bottom:4px;">
                    <span style="font-weight:700; font-size:13.5px; color:var(--ink); line-height:1.3;">
                      ${escapeHtml(p.name)}
                    </span>
                  </div>
                  <div style="font-size:11.5px; color:var(--ink-soft); margin-top:3px; display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                    <code style="font-family:'Space Grotesk',monospace; font-size:11px; font-weight:700; color:var(--teal);">(${getProductHex(p)})</code>
                    ${p.color && p.color !== '-' ? `<span style="font-weight:500;">(${escapeHtml(p.color)})</span>` : ''}
                  </div>
                  <div class="muted small" style="margin-top:4px; font-size:11px;">
                    Total Stock: <b style="${productHasLowStock(p) ? 'color:var(--danger);' : ''}">${formatLiters(p.stock)}</b>
                  </div>
                </td>
                <td rowspan="${rowSpan}" style="vertical-align:middle; border-bottom: 2px solid #D8D1C4; border-right: 1px solid #EFE9DC; font-weight:600;">
                  ${escapeHtml(p.brand)}
                </td>
                <td rowspan="${rowSpan}" style="vertical-align:middle; border-bottom: 2px solid #D8D1C4; border-right: 1px solid #EFE9DC;">
                  ${supplierBadgesHtml(p.id)}
                </td>
              ` : ''}

              <!-- Container Size -->
              <td class="center" style="vertical-align:middle; ${borderBottom}">
                <span class="badge" style="background:#FAF8F5; border:1px solid #E5DDCF; font-weight:700; font-family:'Space Grotesk',sans-serif; color:var(--ink); font-size:12px; padding:2px 8px;">
                  ${fmtSize(s)}
                </span>
              </td>

              <!-- Stock Quantity (Units) -->
              <td class="right" style="font-weight:600; font-family:'Space Grotesk',sans-serif; vertical-align:middle; ${borderBottom} ${st === 'out' ? 'color:var(--danger);' : (st === 'low' ? 'color:#B45309;' : 'color:var(--ink);')}">
                ${count} ${count === 1 ? 'unit' : 'units'}
              </td>

              <!-- Stock Volume (L) -->
              <td class="right" style="font-weight:600; font-family:'Space Grotesk',sans-serif; vertical-align:middle; ${borderBottom} ${st === 'out' ? 'color:var(--danger);' : (st === 'low' ? 'color:#B45309;' : 'color:var(--ink);')}">
                ${formatLiters(stockVol)}
              </td>

              <!-- Minimum Threshold (Units) -->
              <td class="right" style="font-weight:600; font-family:'Space Grotesk',sans-serif; vertical-align:middle; ${borderBottom} color:var(--ink);">
                ${thresh} ${thresh === 1 ? 'unit' : 'units'}
              </td>

              <!-- Threshold Volume (L) -->
              <td class="right" style="font-weight:600; font-family:'Space Grotesk',sans-serif; vertical-align:middle; ${borderBottom} color:var(--ink);">
                ${formatLiters(threshVol)}
              </td>

              <!-- Stock Status -->
              <td class="center" style="vertical-align:middle; ${borderBottom}">
                ${LowStockService.renderStockBadge(st)}
              </td>

              <!-- PO Status -->
              <td class="center" style="vertical-align:middle; ${borderBottom}">
                ${LowStockService.renderPOBadge(poSt)}
              </td>
            </tr>`;
    }).join('');
  }).join('') : `<tr><td colspan="10" class="empty-state">All products are above their reorder threshold.</td></tr>`}
        </tbody>
      </table>
    </div>
  </div>

  <!-- Panel 4: Recent Stock Movements -->
  ${renderAdminRecentStockMovementsPanel()}

  <!-- Panel 5: User Activity / Audit Log -->
  ${renderAdminAuditLogPanel()}

  <!-- Panel 6: Inventory Reports & Business Overview -->
  ${renderAdminReportsOverviewPanel()}
  `;
}

/* ============================================================
   9. STAFF — DASHBOARD (Modernized & Optimized)
   ============================================================ */

let staffMovementsState = {
  search: '',
  typeFilter: 'all', // 'all' | 'receiving' | 'sale' | 'adjustment' | 'colormix' | 'return'
  dateFilter: 'all', // 'all' | 'today' | '7days' | '30days'
  page: 1,
  pageSize: 8
};

function setStaffMovementsSearch(q) {
  staffMovementsState.search = q || '';
  staffMovementsState.page = 1;
  updateStaffMovementsTableContainer();
}

function setStaffMovementsFilter(filterKey, value) {
  if (filterKey === 'type') staffMovementsState.typeFilter = value;
  if (filterKey === 'date') staffMovementsState.dateFilter = value;
  staffMovementsState.page = 1;
  updateStaffMovementsTableContainer();
}

function changeStaffMovementsPage(newPage) {
  staffMovementsState.page = newPage;
  updateStaffMovementsTableContainer();
}

function resetStaffMovementsFilters() {
  staffMovementsState.search = '';
  staffMovementsState.typeFilter = 'all';
  staffMovementsState.dateFilter = 'all';
  staffMovementsState.page = 1;
  const sInput = document.getElementById('staff-movements-search');
  if (sInput) sInput.value = '';
  const tSel = document.getElementById('staff-filter-type');
  if (tSel) tSel.value = 'all';
  const dSel = document.getElementById('staff-filter-date');
  if (dSel) dSel.value = 'all';
  updateStaffMovementsTableContainer();
}

function getFilteredStaffMovements() {
  const allGrouped = groupStockMovements(db.movements);
  const q = (staffMovementsState.search || '').trim().toLowerCase();
  const typeF = staffMovementsState.typeFilter;
  const dateF = staffMovementsState.dateFilter;
  const today = todayISO();

  return allGrouped.filter(m => {
    // 1. Transaction Type filter
    if (typeF !== 'all') {
      const mType = String(m.type || '').toLowerCase();
      if (typeF === 'return') {
        if (!['return', 'refund', 'exchange'].includes(mType)) return false;
      } else if (mType !== typeF) {
        return false;
      }
    }

    // 2. Date filter
    if (dateF !== 'all') {
      const mDate = toLocalISODate(new Date(m.date));
      if (dateF === 'today') {
        if (mDate !== today) return false;
      } else if (dateF === '7days') {
        const d7 = daysAgoISO(7);
        if (mDate < d7) return false;
      } else if (dateF === '30days') {
        const d30 = daysAgoISO(30);
        if (mDate < d30) return false;
      }
    }

    // 3. Search query
    if (q) {
      const refInfo = extractMovementReference(m);
      const refStr = refInfo ? refInfo.ref.toLowerCase() : '';
      const prodNames = (m.lines || []).map(l => (l.label || '') + ' ' + (l.productName || '') + ' ' + (l.note || '')).join(' ').toLowerCase();
      const staff = String(m.staffName || '').toLowerCase();
      const rawNote = String(m.note || '').toLowerCase();
      const match = prodNames.includes(q) || refStr.includes(q) || staff.includes(q) || rawNote.includes(q);
      if (!match) return false;
    }

    return true;
  });
}

function updateStaffMovementsTableContainer() {
  const container = document.getElementById('staff-movements-table-wrap');
  if (container) {
    container.innerHTML = renderStaffStockMovementsTable();
    if (typeof syncRouteState === 'function') syncRouteState({ push: false });
  }
}

/**
 * Renders date and time stacked in a clean, robust format for stock movement tables.
 * Safely handles valid dates (ISO, MySQL datetime, Date objects), null/undefined,
 * empty strings, and invalid date formats.
 */
function renderMovementDateTimeCell(dateVal) {
  if (dateVal === null || dateVal === undefined) {
    return `<div class="movement-datetime-cell"><span class="datetime-day text-muted" style="color:var(--ink-soft); opacity:0.6;">—</span></div>`;
  }

  if (typeof dateVal === 'string' && dateVal.trim() === '') {
    return `<div class="movement-datetime-cell"><span class="datetime-day text-muted" style="color:var(--ink-soft); opacity:0.6;">—</span></div>`;
  }

  let d = null;
  if (dateVal instanceof Date) {
    d = dateVal;
  } else if (typeof dateVal === 'string') {
    const clean = dateVal.trim();
    // Normalize MySQL datetime 'YYYY-MM-DD HH:mm:ss' to ISO format for consistent cross-browser parsing
    const isoCandidate = clean.includes(' ') && !clean.includes('T') ? clean.replace(' ', 'T') : clean;
    d = new Date(isoCandidate);
    if (isNaN(d.getTime())) {
      d = new Date(clean);
    }
  } else {
    d = new Date(dateVal);
  }

  if (!d || isNaN(d.getTime())) {
    return `<div class="movement-datetime-cell"><span class="datetime-day">${escapeHtml(String(dateVal))}</span></div>`;
  }

  const dayStr = d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
  const timeStr = d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });

  return `
    <div class="movement-datetime-cell">
      <div class="datetime-day">${escapeHtml(dayStr)}</div>
      <div class="datetime-time">${escapeHtml(timeStr)}</div>
    </div>
  `;
}

function renderMovementTypeBadgeClean(type) {
  const t = String(type || '').toLowerCase();
  switch (t) {
    case 'sale':
      return `<span class="m-badge m-badge-sale"><span class="m-badge-icon">🛒</span> Sale</span>`;
    case 'receiving':
      return `<span class="m-badge m-badge-receiving"><span class="m-badge-icon">📥</span> Receiving</span>`;
    case 'adjustment':
      return `<span class="m-badge m-badge-adjustment"><span class="m-badge-icon">⚖️</span> Adjustment</span>`;
    case 'colormix':
      return `<span class="m-badge m-badge-colormix"><span class="m-badge-icon">🎨</span> Color Mix</span>`;
    case 'return':
    case 'refund':
    case 'exchange':
      return `<span class="m-badge m-badge-return"><span class="m-badge-icon">↩️</span> Return</span>`;
    default:
      return `<span class="m-badge m-badge-default">${escapeHtml(type || 'Movement')}</span>`;
  }
}

function renderMovementProductCellClean(line, parentMove) {
  const productId = line.productId || (parentMove && parentMove.productId);
  const prod = productId ? productById(productId) : null;
  const name = prod ? prod.name : (line.productName || line.baseLabel || 'Product');
  const brand = prod ? prod.brand : '';
  const color = prod ? prod.color : '';
  const colorHex = prod ? getProductHex(prod) : null;
  const size = line.size || (parentMove && parentMove.containerSize);
  const isOpened = line.openedLiters > 0 || (line.label && line.label.includes('Opened'));

  return `
    <div class="movement-prod-cell">
      <div class="movement-prod-name-row">
        <span class="movement-prod-name">${escapeHtml(name)}</span>
        ${brand ? `<span class="movement-prod-brand">(${escapeHtml(brand)})</span>` : ''}
      </div>
      <div class="movement-prod-variant-row">
        ${colorHex ? `<span class="color-dot-sm" style="background:${escapeHtml(colorHex)};" title="${escapeHtml(color || '')}"></span>` : ''}
        ${color && color !== '-' ? `<span class="movement-prod-color">${escapeHtml(color)}</span>` : ''}
        ${size ? `<span class="badge-size-pill">${fmtSize(size)} ${size <= 1 ? 'Can' : (size <= 4 ? 'Gallon' : 'Drum')}</span>` : (isOpened ? '<span class="badge-size-pill opened">🫙 Opened Stock</span>' : '')}
      </div>
    </div>
  `;
}

function renderMovementQtyBadgeClean(line) {
  const qty = Number(line.qty || 0);
  const isPos = qty > 0;
  const isNeg = qty < 0;
  const sign = isPos ? '+' : (isNeg ? '-' : '');
  const deltaClass = isPos ? 'delta-increase' : (isNeg ? 'delta-decrease' : 'delta-neutral');
  const icon = isPos ? '▲' : (isNeg ? '▼' : '•');

  if (line.size && line.units) {
    const unitsAbs = Math.abs(line.units);
    const unitText = `${unitsAbs} unit${unitsAbs === 1 ? '' : 's'}`;
    const literSign = isPos ? '+' : '';
    return `
      <div class="movement-qty-badge ${deltaClass}" title="${sign}${unitText} (${literSign}${formatStock(qty)} L)">
        <span class="qty-icon">${icon}</span>
        <span class="qty-main">${sign}${unitText}</span>
        <span class="qty-sub">(${literSign}${formatStock(qty)} L)</span>
      </div>
    `;
  }
  if (line.openedLiters > 0) {
    return `
      <div class="movement-qty-badge delta-decrease" title="-${formatStock(line.openedLiters)} L (Opened leftover)">
        <span class="qty-icon">▼</span>
        <span class="qty-main">-${formatStock(line.openedLiters)} L</span>
        <span class="qty-sub">(Opened)</span>
      </div>
    `;
  }
  return `
    <div class="movement-qty-badge ${deltaClass}">
      <span class="qty-icon">${icon}</span>
      <span class="qty-main">${sign}${formatStock(Math.abs(qty))} L</span>
    </div>
  `;
}

function renderMovementRefPillClean(refInfo) {
  if (!refInfo) return '<span class="text-muted" style="color:var(--ink-soft); opacity:0.6;">—</span>';
  if (refInfo.type === 'po') {
    return `<span class="pill-reference pill-po" title="Purchase Order ${escapeHtml(refInfo.ref)}"><span class="pill-icon">📋</span> ${escapeHtml(refInfo.ref)}</span>`;
  }
  if (refInfo.type === 'or') {
    return `<span class="pill-reference pill-or" title="Official Receipt ${escapeHtml(refInfo.ref)}"><span class="pill-icon">🧾</span> ${escapeHtml(refInfo.ref)}</span>`;
  }
  if (refInfo.type === 'adj') {
    return `<span class="pill-reference pill-adj" title="Stock Adjustment ${escapeHtml(refInfo.ref)}"><span class="pill-icon">⚖️</span> ${escapeHtml(refInfo.ref)}</span>`;
  }
  return `<span class="pill-reference pill-rec" title="Reference ${escapeHtml(refInfo.ref)}"><span class="pill-icon">🏷️</span> ${escapeHtml(refInfo.ref)}</span>`;
}

function renderStaffStockMovementsTable() {
  const filtered = getFilteredStaffMovements();
  const total = filtered.length;
  const pageSize = staffMovementsState.pageSize;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (staffMovementsState.page > totalPages) staffMovementsState.page = totalPages;
  const currentPageNum = staffMovementsState.page;
  const startIndex = (currentPageNum - 1) * pageSize;
  const pageItems = filtered.slice(startIndex, startIndex + pageSize);

  const hasFilter = staffMovementsState.search.trim() !== '' ||
    staffMovementsState.typeFilter !== 'all' ||
    staffMovementsState.dateFilter !== 'all';

  if (!pageItems.length) {
    return `
      <div style="padding: 44px 20px; text-align: center; background: #FFFFFF;">
        <div style="font-size: 34px; margin-bottom: 10px;">📦</div>
        <div style="font-family: 'Space Grotesk'; font-size: 16px; font-weight: 700; color: var(--ink);">
          No Stock Movements Found
        </div>
        <div class="muted small" style="margin-top: 5px; max-width: 420px; margin-left: auto; margin-right: auto;">
          ${hasFilter ? 'No transactions match your current search or filter criteria. Try adjusting your query or resetting filters.' : 'No stock movements have been recorded yet.'}
        </div>
        ${hasFilter ? `
          <button type="button" class="btn secondary small" style="margin-top: 14px;" onclick="resetStaffMovementsFilters()">
            Clear All Filters
          </button>
        ` : ''}
      </div>
    `;
  }

  const rowsHtml = pageItems.map(m => {
    const lines = m.lines || [];
    const isBatch = lines.length > 1;
    const refInfo = extractMovementReference(m);
    const dateFormatted = renderMovementDateTimeCell(m.date);
    const typeBadge = renderMovementTypeBadgeClean(m.type);
    const refPill = renderMovementRefPillClean(refInfo);

    if (isBatch) {
      return lines.map((line, idx) => {
        const isFirst = idx === 0;
        const rowSpan = lines.length;
        const bal = extractMovementBalance(line.note || m.note);
        const balHtml = bal && bal.html ? bal.html : '<span class="text-muted" style="color:var(--ink-soft); opacity:0.6;">—</span>';

        return `
          <tr class="staff-move-row ${isFirst ? 'batch-first' : ''}">
            ${isFirst ? `
              <td rowspan="${rowSpan}" style="vertical-align:top; border-right:1px solid var(--line-light);">
                ${dateFormatted}
              </td>
              <td rowspan="${rowSpan}" style="vertical-align:top; text-align:center; border-right:1px solid var(--line-light);">
                ${typeBadge}
                <div class="muted" style="font-size:10.5px; margin-top:3px; font-weight:600;">${rowSpan} items batch</div>
              </td>
            ` : ''}
            <td>
              ${renderMovementProductCellClean(line, m)}
            </td>
            <td style="text-align:center;">
              <div style="display:inline-flex; flex-direction:column; align-items:center; gap:3px;">
                ${renderMovementQtyBadgeClean(line)}
                ${balHtml !== '<span class="text-muted" style="color:var(--ink-soft); opacity:0.6;">—</span>' ? `<div style="font-size:11px; margin-top:1px;">${balHtml}</div>` : ''}
              </div>
            </td>
            ${isFirst ? `
              <td rowspan="${rowSpan}" style="vertical-align:top; border-left:1px solid var(--line-light); border-right:1px solid var(--line-light);">
                <div style="font-weight:600; font-size:12px; color:var(--ink);">${escapeHtml(m.staffName || 'System')}</div>
                ${refPill}
              </td>
              <td rowspan="${rowSpan}" style="vertical-align:top; text-align:center;">
                <button type="button" class="btn ghost small btn-view-detail" onclick="openStaffMovementDetailModal('${m.id}')" title="View Transaction Audit Trail">
                  Details
                </button>
              </td>
            ` : ''}
          </tr>
        `;
      }).join('');
    }

    const singleLine = lines[0] || {
      label: movementProductLabel(m),
      qty: m.qtyChange,
      note: m.note,
      productId: m.productId,
      size: m.containerSize,
      units: null
    };
    const bal = extractMovementBalance(singleLine.note || m.note);
    const balHtml = bal && bal.html ? bal.html : '<span class="text-muted" style="color:var(--ink-soft); opacity:0.6;">—</span>';

    return `
      <tr class="staff-move-row">
        <!-- 1. Date & Time -->
        <td>${dateFormatted}</td>
        <!-- 2. Movement Type -->
        <td style="text-align:center;">${typeBadge}</td>
        <!-- 3. Product & Container -->
        <td>${renderMovementProductCellClean(singleLine, m)}</td>
        <!-- 4. Stock Balance Trail -->
        <td style="text-align:center;">
          <div style="display:inline-flex; flex-direction:column; align-items:center; gap:3px;">
            ${renderMovementQtyBadgeClean(singleLine)}
            ${balHtml !== '<span class="text-muted" style="color:var(--ink-soft); opacity:0.6;">—</span>' ? `<div style="font-size:11px; margin-top:1px;">${balHtml}</div>` : ''}
          </div>
        </td>
        <!-- 5. Reference / Staff -->
        <td>
          <div style="font-weight:600; font-size:12px; color:var(--ink);">${escapeHtml(m.staffName || 'System')}</div>
          ${refPill}
        </td>
        <!-- 6. Details -->
        <td style="text-align:center;">
          <button type="button" class="btn ghost small btn-view-detail" onclick="openStaffMovementDetailModal('${m.id}')" title="View Transaction Audit Trail">
            Details
          </button>
        </td>
      </tr>
    `;
  }).join('');

  const showingStart = total === 0 ? 0 : startIndex + 1;
  const showingEnd = Math.min(startIndex + pageSize, total);

  return `
    <div class="table-scroll" style="overflow-x:auto;">
      <table class="staff-movements-table">
        <thead>
          <tr>
            <th style="min-width:115px;">Date &amp; Time</th>
            <th style="min-width:110px; text-align:center;">Movement Type</th>
            <th style="min-width:210px;">Product &amp; Container</th>
            <th style="min-width:160px; text-align:center;">Stock Balance Trail</th>
            <th style="min-width:140px;">Reference / Staff</th>
            <th style="width:95px; text-align:center;">Details</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>

    <!-- Pagination Controls -->
    <div class="mrgr-pagination" style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; padding:12px 18px; border-top:1px solid var(--line); background:#FAF8F5; gap:12px;">
      <div class="mrgr-pagination-left" style="font-size:12.5px; color:var(--ink-soft);">
        Showing <b>${showingStart}–${showingEnd}</b> of <b>${total}</b> transactions
        ${hasFilter ? '<span style="color:var(--teal); font-weight:600; margin-left:4px;">(filtered)</span>' : ''}
      </div>
      <div class="mrgr-pagination-right" style="display:flex; align-items:center; gap:8px;">
        <button type="button" class="mrgr-page-btn nav-prev" ${currentPageNum <= 1 ? 'disabled' : ''} onclick="changeStaffMovementsPage(${currentPageNum - 1})" title="Previous Page">
          &larr; Previous
        </button>
        <span class="mrgr-page-indicator" style="font-size:12.5px; font-weight:600; color:var(--ink); padding:0 6px;">
          Page <strong>${currentPageNum}</strong> of <strong>${totalPages}</strong>
        </span>
        <button type="button" class="mrgr-page-btn nav-next" ${currentPageNum >= totalPages ? 'disabled' : ''} onclick="changeStaffMovementsPage(${currentPageNum + 1})" title="Next Page">
          Next &rarr;
        </button>
      </div>
    </div>
  `;
}

function openStaffMovementDetailModal(moveId) {
  const allMoves = db.movements || [];
  const move = allMoves.find(m => m.id === moveId);
  const groupedMove = groupStockMovements(allMoves).find(g => g.id === moveId || (g.lines && g.lines.some(l => l.id === moveId)));
  const target = move || groupedMove;

  if (!target) {
    showToast('Transaction details could not be found.', 'error');
    return;
  }

  const refInfo = extractMovementReference(target);
  const prod = target.productId ? productById(target.productId) : null;
  const brand = prod ? prod.brand : 'MRGR Catalog';
  const category = prod ? (prod.category || prod.type || 'Paint') : 'Warehouse Inventory';
  const color = prod ? prod.color : '';
  const hex = prod ? getProductHex(prod) : null;
  const staff = target.staffName || 'System';
  const dateFormatted = formatDateTime(target.date);
  const bal = extractMovementBalance(target.note);

  // Link resolution
  let saleRecord = null;
  let poRecord = null;
  if (refInfo) {
    if (refInfo.type === 'or') {
      saleRecord = (db.sales || []).find(s => getReceiptNo(s) === refInfo.ref || s.id === refInfo.ref);
    } else if (refInfo.type === 'po') {
      poRecord = (db.purchaseOrders || []).find(p => p.poNumber === refInfo.ref || p.id === refInfo.ref);
    }
  }

  const bodyHtml = `
    <div class="movement-modal-body">
      <div class="movement-modal-banner">
        <div>
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
            ${renderMovementTypeBadgeClean(target.type)}
            ${renderMovementRefPillClean(refInfo)}
          </div>
          <div style="font-family:'Space Grotesk'; font-size:15px; font-weight:700; color:var(--ink);">
            ${escapeHtml(target.productName || (prod && prod.name) || 'Stock Movement')}
          </div>
        </div>
        <div style="text-align:right; font-size:12px; color:var(--ink-soft);">
          <div><b>Transaction Time:</b></div>
          <div>${dateFormatted}</div>
        </div>
      </div>

      <div class="movement-modal-grid">
        <div class="movement-modal-field">
          <div class="field-lbl">Product &amp; Brand</div>
          <div class="field-val">${escapeHtml((prod && prod.name) || target.productName || '—')}</div>
          <div class="muted small" style="margin-top:2px;">Brand: <b>${escapeHtml(brand)}</b> · ${escapeHtml(category)}</div>
        </div>

        <div class="movement-modal-field">
          <div class="field-lbl">Variant / Color</div>
          <div class="field-val" style="display:flex; align-items:center; gap:6px;">
            ${hex ? `<span class="color-dot-sm" style="background:${escapeHtml(hex)};"></span>` : ''}
            <span>${escapeHtml(color || 'Standard')}</span>
            ${target.containerSize ? `<span class="badge-size-pill">${fmtSize(target.containerSize)} ${target.containerSize <= 1 ? 'Can' : (target.containerSize <= 4 ? 'Gallon' : 'Drum')}</span>` : ''}
          </div>
        </div>

        <div class="movement-modal-field">
          <div class="field-lbl">Quantity Change</div>
          <div class="field-val">
            ${renderMovementQtyBadgeClean(target.lines && target.lines[0] ? target.lines[0] : { qty: target.qtyChange, size: target.containerSize, units: target.containerSize ? Math.round(target.qtyChange / target.containerSize) : null })}
          </div>
        </div>

        <div class="movement-modal-field">
          <div class="field-lbl">Stock Balance Transition</div>
          <div class="field-val">
            ${bal && bal.html ? bal.html : '<span class="muted">—</span>'}
          </div>
        </div>

        <div class="movement-modal-field">
          <div class="field-lbl">Staff / Logged By</div>
          <div class="field-val">${escapeHtml(staff)}</div>
          <div class="muted small" style="margin-top:2px;">Recorded directly into warehouse movement ledger</div>
        </div>

        <div class="movement-modal-field">
          <div class="field-lbl">Internal Movement ID</div>
          <div class="field-val"><code style="font-family:'Space Grotesk',monospace; font-size:12px; color:var(--teal);">${escapeHtml(target.id)}</code></div>
        </div>
      </div>

      <div>
        <div style="font-size:11.5px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; color:var(--ink-soft); margin-bottom:6px;">
          Transaction Remarks &amp; Audit Reference
        </div>
        <div class="movement-modal-notes">
          ${escapeHtml(target.note || 'No additional remarks provided.')}
        </div>
      </div>
    </div>
  `;

  let footHtml = '';
  if (saleRecord) {
    footHtml += `<button type="button" class="btn small" style="background:var(--teal); color:#fff;" onclick="closeModal(); viewSale('${saleRecord.id}')">🧾 View Sales Receipt</button>`;
  }
  if (poRecord) {
    footHtml += `<button type="button" class="btn small" style="background:var(--teal); color:#fff;" onclick="closeModal(); openPODetail('${poRecord.id}')">📋 View Purchase Order</button>`;
  }
  if (target.type === 'adjustment') {
    footHtml += `<button type="button" class="btn secondary small" onclick="closeModal(); if(typeof switchAdjView==='function') switchAdjView('history'); goTo('receiving');">⚖️ View Adjustment Log</button>`;
  }
  footHtml += `<button type="button" class="btn secondary small" onclick="closeModal()">Close</button>`;

  openModal('Stock Movement Details', bodyHtml, footHtml, 'modal-md');
}

function staffDashboard() {
  if (currentUser && currentUser.role === 'admin') {
    return adminDashboard();
  }
  const greeting = getGreeting();
  const prods = activeProducts();
  const summary = getRestockSummary();
  const todaySummary = getMovementsTodaySummary();
  const staffName = (currentUser && currentUser.name) ? currentUser.name.trim().toLowerCase() : '';
  const staffUsername = (currentUser && currentUser.username) ? currentUser.username.trim().toLowerCase() : '';
  const myPendingAdj = (db.adjustmentRequests || []).filter(r => {
    if (r.status !== 'pending') return false;
    const reqBy = (r.requestedBy || '').trim().toLowerCase();
    if (!staffName && !staffUsername) return true;
    return reqBy === staffName || reqBy === staffUsername;
  });
  const pendingAdj = myPendingAdj;
  const pendingInv = (db.products || []).filter(p =>
    p.status === 'pending_approval' ||
    Boolean(p.pendingEdit) ||
    (p.pendingSizes && p.pendingSizes.length > 0) ||
    (p.pendingPrice != null && Number(p.pendingPrice) > 0)
  );

  const healthyProductsCount = prods.filter(p => !productHasLowStock(p)).length;
  const lowProductsCount = summary.totalLowProducts;

  // Has critical out of stock sizes (0 units)
  const criticalOutCount = summary.criticalOutSizes;
  const needingPOCount = summary.needingPOSizes;
  const onOrderCount = summary.onOrderSizes;
  const totalLowItemsCount = summary.totalLowSizes;

  // Determine low-stock KPI card accent
  const lowCardAccent = needingPOCount > 0 ? 'kpi-danger' : (onOrderCount > 0 ? 'kpi-mustard' : 'kpi-sage');
  const lowCardTag = needingPOCount > 0 ? '<span class="staff-kpi-tag tag-urgent">Urgent Restock</span>' : (onOrderCount > 0 ? '<span class="staff-kpi-tag tag-onorder">On Order</span>' : '<span class="staff-kpi-tag tag-ok">Healthy</span>');

  return `
  <!-- Friendly Staff Welcome Banner -->
  <div class="staff-welcome-banner">
    <div>
      <div class="staff-welcome-greeting">
        ${greeting.emoji} ${greeting.text}, ${escapeHtml((currentUser && currentUser.name) || 'User')}!
      </div>
      <div class="staff-welcome-sub">
        Warehouse Inventory Operations — Monitor stock thresholds, log inbound shipments, and review movement ledgers.
      </div>
    </div>
    <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
      <div class="staff-welcome-badge">
        <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${totalLowItemsCount ? '#DC2626' : '#16A34A'};"></span>
        <span>${totalLowItemsCount ? `${totalLowItemsCount} Low-Stock Alert${totalLowItemsCount === 1 ? '' : 's'}` : 'Stock Levels Healthy'}</span>
      </div>
      <button type="button" class="btn small" style="background:var(--teal); color:#fff;" onclick="goTo('receiving')">
        📥 Log Restock / Delivery
      </button>
    </div>
  </div>

  <!-- 1. SUMMARY CARDS (Compact, modern KPI cards) -->
  <div class="staff-kpi-grid">
    <!-- Card 1: Total Products -->
    <div class="staff-kpi-card kpi-teal" onclick="goTo('inventory')" title="Click to view and manage products in Inventory">
      <div class="staff-kpi-head">
        <div class="staff-kpi-title-wrap">
          <span class="staff-kpi-icon">📦</span>
          <span class="staff-kpi-label">Total Products</span>
        </div>
        <span class="staff-kpi-tag">Active Catalog</span>
      </div>
      <div class="staff-kpi-value">${prods.length}</div>
      <div class="staff-kpi-sub">
        <span><b>${healthyProductsCount}</b> healthy in stock</span>
        <span>·</span>
        <span><b>${lowProductsCount}</b> low / out</span>
      </div>
      <div class="staff-kpi-foot">
        <span>Manage Catalog Inventory &rarr;</span>
      </div>
    </div>

    <!-- Card 2: Low-Stock Alerts -->
    <div class="staff-kpi-card ${lowCardAccent}" onclick="goTo('alerts')" title="Click to view low-stock alerts and purchase order needs">
      <div class="staff-kpi-head">
        <div class="staff-kpi-title-wrap">
          <span class="staff-kpi-icon">⚠️</span>
          <span class="staff-kpi-label">Low-Stock Alerts</span>
        </div>
        ${lowCardTag}
      </div>
      <div class="staff-kpi-value" style="${needingPOCount ? 'color:var(--danger);' : ''}">${totalLowItemsCount} Variants</div>
      <div class="staff-kpi-sub">
        <span>across <b>${lowProductsCount}</b> affected products</span>
      </div>
      <div class="staff-kpi-foot">
        <span>View Restock Alerts Hub &rarr;</span>
      </div>
    </div>

    <!-- Card 3: Critical Out-of-Stock Items -->
    <div class="staff-kpi-card ${criticalOutCount > 0 ? 'kpi-danger' : 'kpi-sage'}" onclick="if(typeof setAlertTab==='function') setAlertTab('needing_po'); goTo('alerts');" title="Click to inspect items completely out of stock">
      <div class="staff-kpi-head">
        <div class="staff-kpi-title-wrap">
          <span class="staff-kpi-icon">🚨</span>
          <span class="staff-kpi-label">Critical Out-of-Stock</span>
        </div>
        ${criticalOutCount > 0 ? '<span class="staff-kpi-tag tag-urgent">0 Units</span>' : '<span class="staff-kpi-tag tag-ok">Healthy</span>'}
      </div>
      <div class="staff-kpi-value" style="${criticalOutCount ? 'color:var(--danger);' : ''}">${criticalOutCount} Variants</div>
      <div class="staff-kpi-sub">
        <span><b>0 units remaining</b> in warehouse</span>
      </div>
      <div class="staff-kpi-foot">
        <span>Review Critical Items &rarr;</span>
      </div>
    </div>

    <!-- Card 4: Pending Restock -->
    <div class="staff-kpi-card ${needingPOCount > 0 ? 'kpi-danger' : 'kpi-sage'}" onclick="if(typeof setAlertTab==='function') setAlertTab('needing_po'); goTo('alerts');" title="Click to view items needing PO">
      <div class="staff-kpi-head">
        <div class="staff-kpi-title-wrap">
          <span class="staff-kpi-icon">📋</span>
          <span class="staff-kpi-label">Pending Restock</span>
        </div>
        <span class="staff-kpi-tag tag-urgent">Need PO</span>
      </div>
      <div class="staff-kpi-value" style="${needingPOCount ? 'color:var(--danger);' : ''}">${needingPOCount} Variants</div>
      <div class="staff-kpi-sub">
        <span>across <b>${summary.needingPOProducts}</b> products needing PO</span>
      </div>
      <div class="staff-kpi-foot">
        <span>Prepare Restock Order &rarr;</span>
      </div>
    </div>

    <!-- Card 5: Products on Order -->
    <div class="staff-kpi-card ${onOrderCount > 0 ? 'kpi-mustard' : 'kpi-sage'}" onclick="if(typeof setAlertTab==='function') setAlertTab('on_order'); goTo('alerts');" title="Click to inspect items currently on order">
      <div class="staff-kpi-head">
        <div class="staff-kpi-title-wrap">
          <span class="staff-kpi-icon">🚚</span>
          <span class="staff-kpi-label">Products on Order</span>
        </div>
        <span class="staff-kpi-tag tag-onorder">${onOrderCount ? 'In Transit' : 'None'}</span>
      </div>
      <div class="staff-kpi-value">${onOrderCount} Variants</div>
      <div class="staff-kpi-sub">
        <span>in <b>${openPOsForReceiving().length}</b> open PO(s) awaiting delivery</span>
      </div>
      <div class="staff-kpi-foot">
        <span>Track On-Order Items &rarr;</span>
      </div>
    </div>

    <!-- Card 6: My Stock Adjustment Requests -->
    <div class="staff-kpi-card ${myPendingAdj.length > 0 ? 'kpi-mustard' : 'kpi-sage'}" onclick="if(typeof switchAdjView==='function') switchAdjView('requests'); goTo('receiving');" title="Click to view submitted adjustment requests and approval status">
      <div class="staff-kpi-head">
        <div class="staff-kpi-title-wrap">
          <span class="staff-kpi-icon">⏳</span>
          <span class="staff-kpi-label">My Stock Adjustment Requests</span>
        </div>
        <span class="staff-kpi-tag ${myPendingAdj.length ? 'tag-urgent' : 'tag-ok'}">${myPendingAdj.length ? 'Awaiting Admin Approval' : 'Clear'}</span>
      </div>
      <div class="staff-kpi-value" style="${myPendingAdj.length ? 'color:var(--mustard-dark, #92400E);' : ''}">${myPendingAdj.length} Request${myPendingAdj.length === 1 ? '' : 's'}</div>
      <div class="staff-kpi-sub">
        <span>${myPendingAdj.length ? 'Awaiting Admin Approval' : 'No pending adjustment requests'}</span>
      </div>
      <div class="staff-kpi-foot">
        <span>View My Requests &rarr;</span>
      </div>
    </div>
  </div>

  <!-- 2. QUICK ACTIONS (Role-Specific Warehouse Operations) -->
  <div class="staff-quick-actions-card">
    <div class="staff-actions-header">
      <div class="staff-actions-title">
        <span>⚡ Quick Actions</span>
      </div>
      <span class="staff-actions-sub">Frequently used warehouse and catalog operations</span>
    </div>
    <div class="staff-actions-container">
      <!-- High-priority Operations -->
      <button type="button" class="staff-action-btn-highlight primary-teal" onclick="goTo('receiving')" title="Log supplier delivery or physical stock arrival">
        <span>📥</span> Stock Receiving ${getModuleBadgeHtml('receiving')}
      </button>
      <button type="button" class="staff-action-btn-highlight accent-adjust" onclick="goToAdjustment()" title="Submit physical count correction or damaged unit adjustment">
        <span>⚖️</span> Stock Adjustment Request
      </button>
      <button type="button" class="staff-action-btn-highlight accent-warm" onclick="goTo('inventory')" title="Browse catalog inventory and check stock counts">
        <span>📦</span> Inventory Management ${getModuleBadgeHtml('inventory')}
      </button>

      <!-- Secondary Shortcuts -->
      <div class="staff-action-secondary-group">
        <button type="button" class="btn secondary small" onclick="goTo('alerts')" title="Inspect items below reorder threshold">
          <span>⚠️</span> Low-Stock Alerts ${getModuleBadgeHtml('alerts')}
        </button>
        <button type="button" class="btn secondary small" onclick="goTo('purchaseOrders')" title="Track purchase orders and incoming delivery schedules">
          <span>📋</span> Purchase Orders ${getModuleBadgeHtml('purchaseOrders')}
        </button>
        <button type="button" class="btn secondary small" onclick="goTo('suppliersView')" title="Browse supplier directory and lead times">
          <span>👥</span> Supplier Directory
        </button>
        <button type="button" class="btn secondary small" onclick="goTo('inventory'); setTimeout(()=>openProductModal(), 80);" title="Submit new product proposal for Admin approval">
          <span>➕</span> Add Product
        </button>
      </div>
    </div>
  </div>

  <!-- 3. INVENTORY NOTIFICATIONS AND ALERTS (Categorized & Accurate) -->
  <div class="staff-alerts-wrapper">
    <!-- Category A: Critical Low Stock (Out of Stock items) -->
    ${criticalOutCount > 0 ? `
      <div class="staff-alert-item alert-critical">
        <div class="staff-alert-left">
          <span class="staff-alert-icon">🚨</span>
          <div class="staff-alert-content">
            <div class="staff-alert-category">Critical Out of Stock</div>
            <div class="staff-alert-message">
              <b>${criticalOutCount} container size variant${criticalOutCount === 1 ? '' : 's'}</b> are completely out of stock (0 units remaining). Immediate reordering required.
            </div>
          </div>
        </div>
        <button type="button" class="staff-alert-btn" onclick="if(typeof setAlertTab==='function') setAlertTab('needing_po'); goTo('alerts');">
          Review Critical Items &rarr;
        </button>
      </div>
    ` : ''}

    <!-- Category B: Pending Restock (Low-stock items needing PO) -->
    ${needingPOCount > 0 ? `
      <div class="staff-alert-item alert-restock">
        <div class="staff-alert-left">
          <span class="staff-alert-icon">⚠️</span>
          <div class="staff-alert-content">
            <div class="staff-alert-category">Pending Restock</div>
            <div class="staff-alert-message">
              <b>${needingPOCount} low-stock item${needingPOCount === 1 ? '' : 's'}</b> across <b>${summary.needingPOProducts} product${summary.needingPOProducts === 1 ? '' : 's'}</b> have dropped below reorder threshold and require Purchase Orders.
            </div>
          </div>
        </div>
        <button type="button" class="staff-alert-btn" onclick="if(typeof setAlertTab==='function') setAlertTab('needing_po'); goTo('alerts');">
          View Restock Alerts &rarr;
        </button>
      </div>
    ` : ''}

    <!-- Category C: Already On Order -->
    ${onOrderCount > 0 ? `
      <div class="staff-alert-item alert-onorder">
        <div class="staff-alert-left">
          <span class="staff-alert-icon">🚚</span>
          <div class="staff-alert-content">
            <div class="staff-alert-category">Already On Order</div>
            <div class="staff-alert-message">
              <b>${onOrderCount} low-stock item${onOrderCount === 1 ? '' : 's'}</b> are already included in open purchase orders and are currently awaiting warehouse delivery.
            </div>
          </div>
        </div>
        <button type="button" class="staff-alert-btn" onclick="if(typeof setAlertTab==='function') setAlertTab('on_order'); goTo('alerts');">
          Track On-Order Items &rarr;
        </button>
      </div>
    ` : ''}

    <!-- Category D: My Stock Adjustment Requests Awaiting Admin Approval -->
    ${myPendingAdj.length > 0 ? `
      <div class="staff-alert-item alert-adjustment">
        <div class="staff-alert-left">
          <span class="staff-alert-icon">⏳</span>
          <div class="staff-alert-content">
            <div class="staff-alert-category">My Stock Adjustment Requests</div>
            <div class="staff-alert-message">
              <b>${myPendingAdj.length} Stock Adjustment Request${myPendingAdj.length === 1 ? '' : 's'}</b> submitted by you ${myPendingAdj.length === 1 ? 'is' : 'are'} currently <b>Awaiting Admin Approval</b>.
            </div>
          </div>
        </div>
        <button type="button" class="staff-alert-btn" onclick="if(typeof switchAdjView==='function') switchAdjView('requests'); goTo('receiving');">
          View My Requests &rarr;
        </button>
      </div>
    ` : ''}

    <!-- Category E: Product / Catalog Updates Awaiting Admin Review -->
    ${pendingInv.length > 0 ? `
      <div class="staff-alert-item alert-adjustment">
        <div class="staff-alert-left">
          <span class="staff-alert-icon">📦</span>
          <div class="staff-alert-content">
            <div class="staff-alert-category">Pending Catalog Submissions</div>
            <div class="staff-alert-message">
              <b>${pendingInv.length} Product / Edit / Price change request(s)</b> have been submitted and are awaiting Administrator authorization.
            </div>
          </div>
        </div>
        <button type="button" class="staff-alert-btn" onclick="if(typeof filterPendingApprovalProducts==='function') filterPendingApprovalProducts(); goTo('inventory');">
          View in Inventory &rarr;
        </button>
      </div>
    ` : ''}

    <!-- All Clear Healthy State -->
    ${(totalLowItemsCount === 0 && pendingAdj.length === 0 && pendingInv.length === 0) ? `
      <div class="staff-alert-item alert-healthy">
        <div class="staff-alert-left">
          <span class="staff-alert-icon">✅</span>
          <div class="staff-alert-content">
            <div class="staff-alert-category">All Stock Healthy</div>
            <div class="staff-alert-message">
              All warehouse products and container sizes are currently above configured minimum reorder thresholds. No pending restocks or approval bottlenecks detected.
            </div>
          </div>
        </div>
        <button type="button" class="staff-alert-btn" onclick="goTo('inventory');">
          View Catalog &rarr;
        </button>
      </div>
    ` : ''}
  </div>

  <!-- 4. INCOMING DELIVERIES (Scheduled & In-Transit PO Shipments) -->
  ${renderStaffIncomingDeliveriesPanel()}

  <!-- 5. RECENT STOCK MOVEMENTS (6 Columns, Filters, Pagination, View Details) -->
  <div class="staff-movements-panel">
    <div class="staff-movements-head">
      <div class="staff-movements-title-group">
        <h3>Recent Stock Movements</h3>
        <div class="sub">Complete ledger of inbound deliveries, POS sales deductions, and inventory adjustments</div>
      </div>
      <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
        <button type="button" class="btn secondary small" onclick="goTo('receiving')">
          + New Stock Entry
        </button>
        ${(currentUser && (currentUser.role === 'admin' || currentUser.role === 'staff')) ? `
          <button type="button" class="btn secondary small" onclick="goTo('reports'); if (typeof setReportTab==='function') setReportTab('transactions');" title="View Full Transaction History in Reports">
            Full Transaction History &rarr;
          </button>
        ` : ''}
      </div>
    </div>

    <!-- Movements Today Summary Strip -->
    <div class="staff-movements-today-strip">
      <div class="today-strip-left">
        <span class="today-strip-icon">📈</span>
        <span class="today-strip-label"><b>Movements Today (${todayISO()}):</b></span>
        <span class="badge ${todaySummary.total > 0 ? 'orange' : 'ok'}" style="font-size:12px; font-weight:700; padding:2px 8px;">
          ${todaySummary.total} ${todaySummary.total === 1 ? 'Movement' : 'Movements'}
        </span>
      </div>
      <div class="today-strip-details">
        ${todaySummary.total > 0 ? `
          <span class="strip-pill in">📥 <b>${todaySummary.receiving}</b> Inbound</span>
          <span class="strip-pill out">🛒 <b>${todaySummary.sale}</b> Sales</span>
          <span class="strip-pill adj">⚖️ <b>${todaySummary.adjustment}</b> Adjustments</span>
          ${todaySummary.colormix ? `<span class="strip-pill">🎨 <b>${todaySummary.colormix}</b> Mixes</span>` : ''}
          ${todaySummary.return ? `<span class="strip-pill">↩️ <b>${todaySummary.return}</b> Returns</span>` : ''}
        ` : `
          <span class="muted small">No warehouse stock movements recorded yet today.</span>
        `}
      </div>
      <div class="today-strip-right">
        <button type="button" class="btn small" style="background:var(--teal); color:#fff; font-size:11.5px; padding:3px 10px;" onclick="goTo('receiving')">
          📥 Log Restock / Receiving
        </button>
      </div>
    </div>

    <!-- Search & Filters Toolbar -->
    <div class="staff-movements-toolbar">
      <div class="staff-movements-filters">
        <div class="staff-search-box">
          <span class="staff-search-icon">🔍</span>
          <input type="text" id="staff-movements-search" placeholder="Search product, ref, note..." value="${escapeHtml(staffMovementsState.search)}" oninput="setStaffMovementsSearch(this.value)">
        </div>

        <select id="staff-filter-type" class="staff-filter-select" onchange="setStaffMovementsFilter('type', this.value)" title="Filter by Transaction Type">
          <option value="all" ${staffMovementsState.typeFilter === 'all' ? 'selected' : ''}>All Transaction Types</option>
          <option value="receiving" ${staffMovementsState.typeFilter === 'receiving' ? 'selected' : ''}>📥 Inbound Receiving</option>
          <option value="sale" ${staffMovementsState.typeFilter === 'sale' ? 'selected' : ''}>🛒 POS Sales</option>
          <option value="adjustment" ${staffMovementsState.typeFilter === 'adjustment' ? 'selected' : ''}>⚖️ Stock Adjustments</option>
          <option value="colormix" ${staffMovementsState.typeFilter === 'colormix' ? 'selected' : ''}>🎨 Color Mixing</option>
          <option value="return" ${staffMovementsState.typeFilter === 'return' ? 'selected' : ''}>↩️ Returns / Exchanges</option>
        </select>

        <select id="staff-filter-date" class="staff-filter-select" onchange="setStaffMovementsFilter('date', this.value)" title="Filter by Date Range">
          <option value="all" ${staffMovementsState.dateFilter === 'all' ? 'selected' : ''}>All Recorded Dates</option>
          <option value="today" ${staffMovementsState.dateFilter === 'today' ? 'selected' : ''}>📅 Today</option>
          <option value="7days" ${staffMovementsState.dateFilter === '7days' ? 'selected' : ''}>Past 7 Days</option>
          <option value="30days" ${staffMovementsState.dateFilter === '30days' ? 'selected' : ''}>Past 30 Days</option>
        </select>

        ${(staffMovementsState.search || staffMovementsState.typeFilter !== 'all' || staffMovementsState.dateFilter !== 'all') ? `
          <button type="button" class="btn ghost small" onclick="resetStaffMovementsFilters()" title="Reset search and filters">
            ✕ Clear Filters
          </button>
        ` : ''}
      </div>
    </div>

    <!-- Table Container -->
    <div id="staff-movements-table-wrap">
      ${renderStaffStockMovementsTable()}
    </div>
  </div>
  `;
}
