/* ============================================================
   14. REPORTS (admin: full · staff: inventory-focused)
   ============================================================ */
let reportActiveTab = 'all'; // 'all', 'sales', 'inventory', 'mixing', 'history', 'returns'
let reportDateFrom = daysAgoISO(6);
let reportDateTo = todayISO();

function getReportDatePreset() {
  return getDateRangePreset(reportDateFrom, reportDateTo);
}

function updateReportDatePresetsUI() {
  const activePreset = getReportDatePreset();
  document.querySelectorAll('.rep-date-btn').forEach(btn => {
    const p = btn.getAttribute('data-preset');
    if (p === activePreset) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  const summaryEl = document.getElementById('rep-date-summary');
  if (summaryEl) {
    summaryEl.innerHTML = formatDateRangeSummary(reportDateFrom, reportDateTo, 'Report period:');
  }
  const clearBtn = document.getElementById('rep-clear-date-btn');
  if (clearBtn) {
    clearBtn.style.display = (reportDateFrom || reportDateTo) ? 'inline-flex' : 'none';
  }
}

function syncReportDateInputs() {
  const fromEl = document.getElementById('rep-from');
  const toEl = document.getElementById('rep-to');
  if (fromEl) {
    fromEl.value = reportDateFrom || '';
    fromEl.max = reportDateTo || '';
  }
  if (toEl) {
    toEl.value = reportDateTo || '';
    toEl.min = reportDateFrom || '';
  }
  updateReportDatePresetsUI();
}

function setReportDatePreset(preset) {
  const today = todayISO();
  if (preset === 'today') {
    reportDateFrom = today;
    reportDateTo = today;
  } else if (preset === 'yesterday') {
    const yest = daysAgoISO(1);
    reportDateFrom = yest;
    reportDateTo = yest;
  } else if (preset === '7d') {
    reportDateFrom = daysAgoISO(6);
    reportDateTo = today;
  } else if (preset === '30d') {
    reportDateFrom = daysAgoISO(29);
    reportDateTo = today;
  } else if (preset === 'month') {
    reportDateFrom = thisMonthStartISO();
    reportDateTo = today;
  } else if (preset === 'all') {
    reportDateFrom = '';
    reportDateTo = '';
  }
  syncReportDateInputs();
  renderReportBody();
}

function onReportDateChange() {
  const fromEl = document.getElementById('rep-from');
  const toEl = document.getElementById('rep-to');
  let f = fromEl ? fromEl.value : '';
  let t = toEl ? toEl.value : '';
  if (f && t && f > t) {
    const tmp = f;
    f = t;
    t = tmp;
    if (fromEl) fromEl.value = f;
    if (toEl) toEl.value = t;
  }
  reportDateFrom = f;
  reportDateTo = t;
  if (fromEl) fromEl.max = t || '';
  if (toEl) toEl.min = f || '';
  updateReportDatePresetsUI();
  renderReportBody();
}

function clearReportDates() {
  setReportDatePreset('all');
}

function setReportDateRange(daysAgo) {
  if (daysAgo === null || daysAgo === undefined) setReportDatePreset('all');
  else if (daysAgo === 0) setReportDatePreset('today');
  else if (daysAgo === 1) setReportDatePreset('yesterday');
  else if (daysAgo === 6) setReportDatePreset('7d');
  else if (daysAgo === 29) setReportDatePreset('30d');
  else {
    reportDateFrom = daysAgoISO(daysAgo);
    reportDateTo = todayISO();
    syncReportDateInputs();
    renderReportBody();
  }
}

function reportsPage() {
  const isAdmin = currentUser && currentUser.role === 'admin';
  const low = lowStockProducts();
  const activePreset = getReportDatePreset();
  const hasDates = Boolean(reportDateFrom || reportDateTo);

  // If non-admin had admin-only tab selected, default to inventory
  if (!isAdmin && (reportActiveTab === 'sales' || reportActiveTab === 'history' || reportActiveTab === 'returns')) {
    reportActiveTab = 'all';
  }

  return `
  <div class="panel" style="padding:0; overflow:hidden;">
    <div class="panel-head row wrap" style="gap:12px; padding:14px 18px 10px;">
      <div>
        <h3 style="margin:0; font-size:16px;">Reports &amp; Analytics</h3>
        <span class="muted small">Business performance, inventory turnover, and transaction logs</span>
      </div>
      <div class="spacer"></div>
      <div class="row" style="gap:6px;">
        <button type="button" class="btn secondary small" onclick="renderReportBody()">↻ Refresh</button>
      </div>
    </div>

    <!-- Dedicated Date Range Bar & Quick Presets (matches Audit Log) -->
    <div class="audit-date-bar" style="padding:10px 18px; border-top:1px dashed var(--line-light); border-bottom:1px solid var(--line-light); background:#FBF9F4;">
      <div class="audit-date-group">
        <label class="audit-date-label">📅 Date Range:</label>
        <div class="audit-date-field" title="Start date">
          <span class="field-tag">From</span>
          <input id="rep-from" type="date" value="${reportDateFrom}" max="${reportDateTo || ''}" onchange="onReportDateChange()">
        </div>
        <span class="audit-date-sep">to</span>
        <div class="audit-date-field" title="End date">
          <span class="field-tag">To</span>
          <input id="rep-to" type="date" value="${reportDateTo}" min="${reportDateFrom || ''}" onchange="onReportDateChange()">
        </div>
        <button type="button" id="rep-clear-date-btn" class="audit-clear-date-btn" onclick="clearReportDates()" title="Show all time" style="display:${hasDates ? 'inline-flex' : 'none'};">✕</button>
      </div>

      <div class="audit-date-shortcuts">
        <button type="button" class="audit-date-btn rep-date-btn ${activePreset === 'today' ? 'active' : ''}" data-preset="today" onclick="setReportDatePreset('today')" title="Today's data">Today</button>
        <button type="button" class="audit-date-btn rep-date-btn ${activePreset === 'yesterday' ? 'active' : ''}" data-preset="yesterday" onclick="setReportDatePreset('yesterday')" title="Yesterday's data">Yesterday</button>
        <button type="button" class="audit-date-btn rep-date-btn ${activePreset === '7d' ? 'active' : ''}" data-preset="7d" onclick="setReportDatePreset('7d')" title="Last 7 days">7D</button>
        <button type="button" class="audit-date-btn rep-date-btn ${activePreset === '30d' ? 'active' : ''}" data-preset="30d" onclick="setReportDatePreset('30d')" title="Last 30 days">30D</button>
        <button type="button" class="audit-date-btn rep-date-btn ${activePreset === 'month' ? 'active' : ''}" data-preset="month" onclick="setReportDatePreset('month')" title="This month to date">This Month</button>
        <button type="button" class="audit-date-btn rep-date-btn ${activePreset === 'all' ? 'active' : ''}" data-preset="all" onclick="setReportDatePreset('all')" title="Show all recorded history">All</button>
      </div>

      <div class="audit-date-info" id="rep-date-summary">
        ${formatDateRangeSummary(reportDateFrom, reportDateTo, 'Report period:')}
      </div>
    </div>

    <!-- Toggle Menu Bar -->
    <div class="report-toggle-bar">
      <button type="button" class="report-toggle-btn ${reportActiveTab === 'all' ? 'active' : ''}" data-tab="all" onclick="setReportTab('all')">
        <span class="rt-icon">📑</span> All Reports
      </button>
      ${isAdmin ? `
        <button type="button" class="report-toggle-btn ${reportActiveTab === 'sales' ? 'active' : ''}" data-tab="sales" onclick="setReportTab('sales')">
          <span class="rt-icon">📊</span> Sales &amp; Revenue
        </button>
      ` : ''}
      <button type="button" class="report-toggle-btn ${reportActiveTab === 'inventory' ? 'active' : ''}" data-tab="inventory" onclick="setReportTab('inventory')">
        <span class="rt-icon">📦</span> Stock &amp; Movements
        ${low.length ? `<span class="badge low" style="margin-left:5px; font-size:10.5px; padding:1px 6px;">${low.length} Low</span>` : ''}
      </button>
      <button type="button" class="report-toggle-btn ${reportActiveTab === 'mixing' ? 'active' : ''}" data-tab="mixing" onclick="setReportTab('mixing')">
        <span class="rt-icon">🎨</span> Color Mixing Log
      </button>
      ${isAdmin ? `
        <button type="button" class="report-toggle-btn ${reportActiveTab === 'history' ? 'active' : ''}" data-tab="history" onclick="setReportTab('history')">
          <span class="rt-icon">🧾</span> Sales History
        </button>
        <button type="button" class="report-toggle-btn ${reportActiveTab === 'returns' ? 'active' : ''}" data-tab="returns" onclick="setReportTab('returns')">
          <span class="rt-icon">↩️</span> Returns &amp; Exchanges
        </button>
      ` : ''}
    </div>
  </div>

  <div id="report-body">${reportBodyHtml(reportDateFrom, reportDateTo)}</div>
  `;
}

function setReportTab(tab) {
  reportActiveTab = tab;
  document.querySelectorAll('.report-toggle-btn').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-tab') === tab);
  });
  renderReportBody();
}

function renderReportBody() {
  const container = document.getElementById('report-body');
  if (container) {
    container.innerHTML = reportBodyHtml(reportDateFrom, reportDateTo);
  }
}

function reportBodyHtml(from, to) {
  from = (from !== undefined) ? from : reportDateFrom;
  to = (to !== undefined) ? to : reportDateTo;
  const sales = salesBetween(from, to);
  const moves = movementsBetween(from, to);
  const isAdmin = currentUser && currentUser.role === 'admin';

  // Per-day totals for the bar chart
  const dayList = [];
  const chartFrom = from || (sales.length ? sales[sales.length - 1].date.slice(0, 10) : daysAgoISO(29));
  const chartTo = to || todayISO();
  let cur = new Date(chartFrom + 'T00:00:00');
  let end = new Date(chartTo + 'T00:00:00');
  if (isNaN(cur.getTime())) cur = new Date(daysAgoISO(29) + 'T00:00:00');
  if (isNaN(end.getTime())) end = new Date(todayISO() + 'T00:00:00');
  while (cur <= end && dayList.length < 35) {
    const iso = toLocalISODate(cur);
    dayList.push({ iso, total: sumSales(salesOn(iso).filter(s => (!from || s.date.slice(0, 10) >= from) && (!to || s.date.slice(0, 10) <= to))) });
    cur.setDate(cur.getDate() + 1);
  }
  const maxVal = Math.max(1, ...dayList.map(d => d.total));

  // Top products by qty sold within range
  const productTotals = {};
  sales.forEach(s => s.items.forEach(i => {
    if (i.type !== 'product') return;
    if (!productTotals[i.productId]) productTotals[i.productId] = { id: i.productId, name: i.name, brand: i.brand, qty: 0, revenue: 0 };
    productTotals[i.productId].qty += i.qty;
    productTotals[i.productId].revenue += i.lineTotal;
  }));
  const topProducts = Object.values(productTotals).sort((a, b) => b.qty - a.qty).slice(0, 8);

  const sortedMoves = moves.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
  const stockMoves = groupStockMovements(moves);
  const fmtQty = q => (q > 0 ? '+' : '') + formatStock(q);
  const colorMixMoves = sortedMoves.filter(m => m.type === 'colormix' && !m.productId);
  const mixColorLabel = m => {
    if (m.colorName) return m.colorName;
    const pn = String(m.productName || '').trim();
    // 1. Clean from productName if it contains a color (e.g. "Custom Color Mix — Baby Blue", "Color Mix - Leaf Green [Leaf Green]")
    const stripped = pn
      .replace(/^(Custom\s+)?Color\s+Mix\s*([—–\-:·]\s*|\s+)/i, '')
      .replace(/\s*\[.*?\]$/, '')
      .replace(/^.*\(for\s+(.*?)\s+mix\)$/i, '$1')
      .trim();
    if (stripped && !/^(custom\s+)?color\s+mix$/i.test(stripped)) return stripped;

    // 2. Recover from sibling ingredient rows of the same date/staff: "<product> (for X mix)" or note containing "(ColorName)"
    const sib = db.movements.find(x => x.type === 'colormix' && x.date === m.date && x.staffName === m.staffName && (
      /\(for\s+(.*?)\s+mix\)/i.test(x.productName || '') ||
      /\b(?:of\s+\d+(?:\.\d+)?L\s+)\(([^)]+)\)/i.test(x.note || '')
    ));
    if (sib) {
      const sibPnMatch = String(sib.productName || '').match(/\(for\s+(.*?)\s+mix\)/i);
      if (sibPnMatch && sibPnMatch[1]) return sibPnMatch[1].trim();
      const sibNoteMatch = String(sib.note || '').match(/\b(?:of\s+\d+(?:\.\d+)?L\s+)\(([^)]+)\)/i);
      if (sibNoteMatch && sibNoteMatch[1]) return sibNoteMatch[1].trim();
    }

    // 3. Recover from linked sale receipt if present in note
    const note = String(m.note || '');
    const rc = (note.match(/OR-\d+-\d+/) || [])[0];
    if (rc) {
      const sale = (db.sales || []).find(s => (s.receiptNo === rc || getReceiptNo(s) === rc));
      const mixes = sale ? (sale.items || []).filter(i => i.type === 'colormix' && i.colorName) : [];
      if (mixes.length) {
        return mixes[0].colorName;
      }
    }

    return pn || 'Color Mix';
  };
  const staffLabel = name => {
    const u = (db.users || []).find(x => x.name === name);
    const role = u ? { admin: 'Admin', cashier: 'Cashier', staff: 'Inventory Staff' }[u.role] : '';
    return escapeHtml(name || '') + (role ? ` (${role})` : '');
  };
  const low = lowStockProducts();

  // Sales calculations
  const grossSales = sales.reduce((t, s) => t + Number(s.total || 0), 0);
  const periodRefunds = sales.reduce((t, s) => t + Number(s.refundTotal || 0), 0);
  const netSales = Number((grossSales - periodRefunds).toFixed(2));

  // Sales Section (Stats cards + Daily Bar Chart + Top Products)
  const salesHtml = `
    <div class="stat-grid">
      <div class="stat-card"><div class="label">Net Revenue</div><div class="value">${peso(netSales)}</div></div>
      <div class="stat-card mustard"><div class="label">Gross Sales</div><div class="value">${peso(grossSales)}</div></div>
      <div class="stat-card low"><div class="label">Returns / Exchanges</div><div class="value">${peso(periodRefunds)}</div></div>
      <div class="stat-card sage"><div class="label">Transactions</div><div class="value">${sales.length}</div></div>
    </div>
    <div class="panel">
      <div class="panel-head"><h3>Sales by Day</h3></div>
      <div class="panel-body">
        <div class="bar-chart">
          ${dayList.map(d => `
            <div class="bar-col">
              <span class="bar-val">${d.total ? Math.round(d.total).toLocaleString() : ''}</span>
              <div class="bar" style="height:${Math.max(2, (d.total / maxVal) * 100)}%"></div>
              <span class="bar-label">${formatDateOnly(d.iso)}</span>
            </div>`).join('')}
        </div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-head"><h3>Top Products Sold</h3></div>
      <div class="panel-body tight table-scroll">
        <table>
          <thead><tr><th>Product</th><th>Brand</th><th class="right">Qty Sold</th><th class="right">Revenue</th></tr></thead>
          <tbody>${topProducts.length ? topProducts.map(t => `<tr><td>${escapeHtml(t.name)} <code style="font-family:'Space Grotesk',monospace; font-size:11px; font-weight:600; color:var(--teal);">(${getProductHex(productById(t.id))})</code></td><td>${escapeHtml(t.brand)}</td><td class="right">${t.qty}</td><td class="right">${peso(t.revenue)}</td></tr>`).join('') : `<tr><td colspan="4" class="empty-state">No sales in this range.</td></tr>`}</tbody>
        </table>
      </div>
    </div>`;

  // Inventory & Stock Section (Low stock + Movement Log)
  const inventoryHtml = `
    <div class="panel">
      <div class="panel-head row">
        <h3>Low-Stock Report</h3>
        <div class="spacer"></div>
        ${low.length ? `<span class="badge low">${low.length} Item(s) Below Threshold</span>` : '<span class="badge ok">All Stock Healthy</span>'}
      </div>
      <div class="panel-body tight table-scroll">
        <table>
          <thead><tr><th>Product</th><th>Brand</th><th>Low Sizes / Thresholds</th><th class="right">Stock (L)</th><th class="right">Threshold (L)</th></tr></thead>
          <tbody>${low.length ? low.map(p => {
    const summary = productLowSizesSummary(p);
    return `<tr><td>${escapeHtml(p.name)} <code style="font-family:'Space Grotesk',monospace; font-size:11px; font-weight:600; color:var(--teal);">(${getProductHex(p)})</code></td><td>${escapeHtml(p.brand)}</td><td>${summary ? `<span class="badge low" style="font-size:11px;">${summary}</span>` : '<span class="muted small">Overall deficit</span>'}</td><td class="right"><span class="badge low">${formatLiters(p.stock)}</span></td><td class="right" style="font-weight:700;">${formatLiters(productTotalThresholdLiters(p) || p.threshold || 0)}</td></tr>`;
  }).join('') : `<tr><td colspan="5" class="empty-state">Nothing below threshold. All items are sufficiently stocked.</td></tr>`}</tbody>
        </table>
      </div>
    </div>
    <div class="panel">
      <div class="panel-head row">
        <h3>Stock Movement Log</h3>
        <div class="spacer"></div>
        <span class="muted small">${stockMoves.length} movement batch${stockMoves.length === 1 ? '' : 'es'}</span>
      </div>
      <div class="panel-body tight table-scroll">
        ${renderStockMovementsTable(stockMoves, { emptyText: 'No movements in this range.' })}
      </div>
    </div>`;

  // Color Mixing Service Log Section
  const mixingHtml = `
    <div class="panel">
      <div class="panel-head row">
        <h3>Color Mixing Service Log</h3>
        <div class="spacer"></div>
        <span class="muted small">${colorMixMoves.length} mixing log(s)</span>
      </div>
      <div class="panel-body tight table-scroll">
        <table>
          <thead><tr><th>Date</th><th>Description</th><th class="right">Liters</th><th>Staff / User</th><th>Note</th></tr></thead>
          <tbody>${colorMixMoves.length ? colorMixMoves.map(m => `<tr><td>${formatDateTime(m.date)}</td><td>${escapeHtml(mixColorLabel(m))}</td><td class="right">${formatStock(m.qtyChange)} L</td><td>${staffLabel(m.staffName)}</td><td class="muted small">${escapeHtml(m.note || '')}</td></tr>`).join('') : `<tr><td colspan="5" class="empty-state">No color mixing services in this range.</td></tr>`}</tbody>
        </table>
      </div>
    </div>`;

  // Sales History Section (filtered to date range)
  const historyHtml = `
    <div class="panel">
      <div class="panel-head row wrap" style="gap:10px;">
        <div>
          <h3 style="margin:0;">Sales History</h3>
          <span class="muted small">${sales.length} transaction(s) recorded in this range</span>
        </div>
      </div>
      <div class="panel-body tight table-scroll">
        <table>
          <thead>
            <tr>
              <th>Receipt #</th>
              <th>Date &amp; Time</th>
              <th>Cashier</th>
              <th>Customer</th>
              <th>Items</th>
              <th class="center">Status</th>
              <th class="right">Total / Net</th>
              <th class="right">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${sales.length ? sales.slice().sort((a, b) => new Date(b.date) - new Date(a.date)).map(s => {
    const status = s.status || 'completed';
    const returnedVal = typeof getSaleReturnedValue === 'function' ? getSaleReturnedValue(s) : Number(s.refundTotal || 0);
    const exchangeTotal = typeof getSaleExchangeTotal === 'function' ? getSaleExchangeTotal(s) : 0;
    const refundTotal = Number(s.refundTotal || 0);
    const netTotal = Number((s.total - refundTotal).toFixed(2));
    const hasReturns = Array.isArray(s.returns) && s.returns.length > 0;
    const isWithinDay = typeof isSaleReturnWithinDay === 'function' ? isSaleReturnWithinDay(s) : (String(s.date || '').slice(0, 10) === todayISO());
    return `
              <tr>
                <td><code style="color:var(--teal); font-weight:700;">${escapeHtml(getReceiptNo(s))}</code></td>
                <td>${formatDateTime(s.date)}</td>
                <td>${staffLabel(s.cashierName)}</td>
                <td>${escapeHtml(s.customerName) || '<span class="muted">—</span>'}</td>
                <td>${s.items.length} item${s.items.length === 1 ? '' : 's'}</td>
                <td class="center">${saleStatusBadge(status)}</td>
                <td class="right">
                  ${(returnedVal > 0 || refundTotal > 0)
        ? `<div><strong style="font-family:'Space Grotesk'; font-size:13.5px;">${peso(netTotal)}</strong></div>
                       <div class="muted small" style="color:${exchangeTotal > 0 ? 'var(--teal)' : 'var(--danger)'}; font-size:11px;">
                         ${exchangeTotal > 0
          ? `Exchanged: ${peso(exchangeTotal)}`
          : `Returned: -${peso(returnedVal || refundTotal)}`}
                       </div>`
        : `<strong style="font-family:'Space Grotesk'; font-size:13.5px;">${peso(s.total)}</strong>`}
                </td>
                <td class="right" style="white-space:nowrap;">
                  <div class="row wrap" style="justify-content:flex-end; gap:6px;">
                    <button class="btn ghost small" onclick='viewSale("${s.id}")' title="View Sales Receipt">🧾 Receipt</button>
                    ${status !== 'refunded' ? (
        isWithinDay
          ? `<button class="btn secondary small" onclick='openReturnRefundModal("${s.id}")' title="Return cans and process exchange (same-day only)">↩️ Return / Exchange</button>`
          : `<button class="btn ghost small" disabled style="opacity:0.55; cursor:not-allowed;" title="Return / Exchange is only allowed within the same day of purchase">🔒 Return Expired</button>`
      ) : ''}
                    ${hasReturns ? `
                      <button class="btn ghost small" onclick='viewReturnVouchers("${s.id}")' title="View return &amp; exchange slips" style="color:#856404; background:#FFF3CD; border:1px solid #FFEBAA;">📋 Slip (${s.returns.length})</button>
                    ` : ''}
                  </div>
                </td>
              </tr>`;
  }).join('') : `<tr><td colspan="8" class="empty-state">No sales transactions found in this date range.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;

  // Returns & Exchanges Section (dedicated audited log)
  const allReturns = [];
  (db.sales || []).forEach(sale => {
    (sale.returns || []).forEach(ret => {
      const d = toLocalISODate(new Date(ret.date || sale.date));
      if ((!from || d >= from) && (!to || d <= to)) {
        allReturns.push({
          ...ret,
          saleId: sale.id,
          receiptNo: getReceiptNo(sale),
          customerName: sale.customerName
        });
      }
    });
  });
  allReturns.sort((a, b) => new Date(b.date) - new Date(a.date));
  const totalRefundedInRange = allReturns.reduce((sum, r) => sum + Number(r.refundAmount || 0), 0);

  const returnsHtml = `
    <div class="panel">
      <div class="panel-head row wrap" style="gap:10px; align-items:center;">
        <div>
          <h3 style="margin:0;">Returns &amp; Exchanges Log</h3>
          <span class="muted small">Audited customer return &amp; exchange vouchers and item replacements</span>
        </div>
        <div class="spacer"></div>
        <div class="row wrap" style="gap:8px; align-items:center;">
          <button type="button" class="btn secondary small" onclick="openStartReturnPickerModal()" style="display:inline-flex; align-items:center; gap:5px;" title="Process a new customer return &amp; exchange">
            ↩️ Process Return / Exchange
          </button>
          ${allReturns.length
      ? `<span class="badge low" style="font-size:12px; padding:3px 8px;">${allReturns.length} Return(s) · Value: ${peso(totalRefundedInRange)}</span>`
      : '<span class="badge ok">No Returns in Range</span>'}
        </div>
      </div>
      <div class="panel-body tight table-scroll">
        <table>
          <thead>
            <tr>
              <th>Voucher / Date</th>
              <th>Orig. Receipt</th>
              <th>Customer</th>
              <th>Items Returned</th>
              <th>Replacement Issued</th>
              <th>Reason &amp; Condition</th>
              <th class="right">Return / Exchange Value</th>
              <th>Processed By</th>
              <th class="right">Slip</th>
            </tr>
          </thead>
          <tbody>
            ${allReturns.length ? allReturns.map(r => {
        const exItems = Array.isArray(r.exchangeItems) ? r.exchangeItems : [];
        const exVal = Number(r.exchangeAmount || 0);
        const retVal = Number(r.refundAmount || 0);
        return `
              <tr>
                <td>
                  <strong style="font-family:'Space Grotesk'; font-size:12px; color:var(--ink);">${escapeHtml(r.voucherNo || r.id)}</strong>
                  <div class="muted small" style="font-size:11px;">${formatDateTime(r.date)}</div>
                </td>
                <td><code style="color:var(--teal); font-weight:700;">${escapeHtml(r.receiptNo)}</code></td>
                <td>${escapeHtml(r.customerName) || '<span class="muted">—</span>'}</td>
                <td>
                  ${(r.items || []).map(it => {
          const col = it.color || it.colorName;
          const colStr = col ? ` — ${escapeHtml(col)}` : '';
          return `<div>${escapeHtml(it.name)}${colStr} <strong>&times; ${formatStock(it.qty)}</strong> (${peso(it.lineRefund)})</div>`;
        }).join('') || '<span class="muted">Returned item</span>'}
                </td>
                <td>
                  ${exItems.length ? exItems.map(ex => {
          const colStr = ex.color && ex.color !== '-' ? ` — ${escapeHtml(ex.color)}` : '';
          return `<div>${escapeHtml(ex.name)}${colStr} (${ex.size || 1}L) <strong>&times; ${formatStock(ex.qty)}</strong> (${peso(ex.lineTotal)})</div>`;
        }).join('') : '<span class="muted small">Return Credit Only</span>'}
                </td>
                <td>
                  <div style="font-weight:600; font-size:12px;">${escapeHtml(r.reason || 'Customer Return / Exchange')}</div>
                  <div style="margin-top:2px;">
                    ${r.restocked
            ? '<span class="badge ok" style="font-size:10px; padding:1px 5px;">Restocked</span>'
            : '<span class="badge low" style="font-size:10px; padding:1px 5px;">Damaged / Not Restocked</span>'}
                    ${r.note ? `<span class="muted small" style="margin-left:4px;">${escapeHtml(r.note)}</span>` : ''}
                  </div>
                </td>
                <td class="right" style="font-family:'Space Grotesk'; font-weight:700; font-size:13.5px;">
                  <div style="color:var(--danger);">-${peso(retVal)}</div>
                  ${exVal > 0 ? `<div class="small" style="color:var(--teal); font-size:11px;">Exch: +${peso(exVal)}</div>` : ''}
                </td>
                <td>${staffLabel(r.cashierName)}</td>
                <td class="right">
                  <button class="btn ghost small" onclick='showReturnVoucherModal("${r.saleId}", "${r.id}")' title="View return &amp; exchange slip" style="color:#856404; background:#FFF3CD; border:1px solid #FFEBAA; padding:2px 7px; font-size:11px;">📋 Slip</button>
                </td>
              </tr>`;
      }).join('') : `<tr><td colspan="9" class="empty-state">No product returns or exchanges in this date range.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;

  // Render according to active toggle menu tab
  if (reportActiveTab === 'sales') {
    return isAdmin ? salesHtml : '<div class="empty-state">Sales reports are restricted to administrators.</div>';
  } else if (reportActiveTab === 'inventory') {
    return inventoryHtml;
  } else if (reportActiveTab === 'mixing') {
    return mixingHtml;
  } else if (reportActiveTab === 'history') {
    return isAdmin ? historyHtml : '<div class="empty-state">Sales history is restricted to administrators.</div>';
  } else if (reportActiveTab === 'returns') {
    return isAdmin ? returnsHtml : '<div class="empty-state">Returns report is restricted to administrators.</div>';
  } else {
    // 'all' tab: render all relevant report sections
    return `
      ${isAdmin ? salesHtml : ''}
      ${inventoryHtml}
      ${mixingHtml}
      ${isAdmin ? historyHtml : ''}
      ${isAdmin ? returnsHtml : ''}
    `;
  }
}
