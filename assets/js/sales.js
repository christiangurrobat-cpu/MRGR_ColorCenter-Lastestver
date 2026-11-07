/* ============================================================
   13. SALES HISTORY & AFTERSALES (RETURNS & EXCHANGES)
   ============================================================ */
let salesFilterStatus = 'all';
let salesSearchQuery = '';
let salesDateFrom = currentYearStartISO();
let salesDateTo = currentYearEndISO();
let salesYearFilter = 'current';
let returnExchangeCart = [];

function getSalesDatePreset() {
  return getDateRangePreset(salesDateFrom, salesDateTo);
}

function getSalesSelectedYear() {
  const curY = getCurrentYear();
  if (salesYearFilter === 'current' || !salesYearFilter) return curY;
  const y = parseInt(salesYearFilter, 10);
  if (!isNaN(y)) return y;
  if (salesDateFrom && salesDateFrom.length >= 4) {
    const yf = parseInt(salesDateFrom.slice(0, 4), 10);
    if (!isNaN(yf)) return yf;
  }
  return curY;
}

function openSalesCalendar(target, anchorEl, event) {
  openAppMonthDayPicker({
    target: target,
    anchorEl: anchorEl || document.getElementById(target === 'from' ? 'sh-date-from-wrap' : 'sh-date-to-wrap'),
    event: event,
    currentDate: (target === 'from' ? salesDateFrom : salesDateTo),
    otherDate: (target === 'from' ? salesDateTo : salesDateFrom),
    selectedYear: getSalesSelectedYear,
    onSelect: function(iso) {
      if (target === 'from') {
        salesDateFrom = iso;
        if (salesDateTo && salesDateFrom > salesDateTo) salesDateTo = salesDateFrom;
      } else {
        salesDateTo = iso;
        if (salesDateFrom && salesDateTo < salesDateFrom) salesDateFrom = salesDateTo;
      }
      syncSalesDateInputs();
      renderSalesHistoryTable();
    }
  });
}

function updateSalesDatePresetsUI() {
  const activePreset = getSalesDatePreset();
  document.querySelectorAll('.sh-date-btn').forEach(btn => {
    const p = btn.getAttribute('data-preset');
    if (p === activePreset) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Sync Year dropdown: Preserve selected year! Never reset to custom!
  const yearSelect = document.getElementById('sh-year-select');
  if (yearSelect) {
    if (!salesDateFrom && !salesDateTo) {
      yearSelect.value = 'all';
      salesYearFilter = 'all';
    } else if (salesYearFilter && salesYearFilter !== 'custom') {
      yearSelect.value = salesYearFilter;
    } else {
      yearSelect.value = 'current';
      salesYearFilter = 'current';
    }
  }

  // Sync Historical Records button
  const histBtn = document.getElementById('sh-historical-btn');
  if (histBtn) {
    if (isHistoricalView(salesDateFrom, salesDateTo)) {
      histBtn.classList.add('active');
    } else {
      histBtn.classList.remove('active');
    }
  }

  const summaryEl = document.getElementById('sh-date-summary');
  if (summaryEl) {
    summaryEl.innerHTML = formatDateRangeSummary(salesDateFrom, salesDateTo, 'Date filter:');
  }
  const clearBtn = document.getElementById('sh-clear-date-btn');
  if (clearBtn) {
    clearBtn.style.display = (salesDateFrom || salesDateTo) ? 'inline-flex' : 'none';
  }
}

function syncSalesDateInputs() {
  const fromEl = document.getElementById('sh-date-from');
  const toEl = document.getElementById('sh-date-to');
  if (fromEl) {
    fromEl.value = formatDateInputMMDDYYYY(salesDateFrom);
  }
  if (toEl) {
    toEl.value = formatDateInputMMDDYYYY(salesDateTo);
  }
  updateSalesDatePresetsUI();
}

function onSalesYearChange(val) {
  closeAppMonthDayPicker();
  const curY = getCurrentYear();
  if (val === 'all') {
    salesDateFrom = '';
    salesDateTo = '';
    salesYearFilter = 'all';
  } else {
    const targetYear = (val === 'current') ? curY : (parseInt(val, 10) || curY);
    salesYearFilter = (val === 'current') ? 'current' : String(targetYear);
    salesDateFrom = updateDateYearISO(salesDateFrom, targetYear, '01-01');
    salesDateTo = updateDateYearISO(salesDateTo, targetYear, (targetYear === curY ? todayISO().slice(5) : '12-31'));
    if (salesDateFrom && salesDateTo && salesDateFrom > salesDateTo) {
      salesDateFrom = salesDateTo;
    }
  }
  syncSalesDateInputs();
  renderSalesHistoryTable();
}

function toggleSalesHistoricalRecords() {
  if (isHistoricalView(salesDateFrom, salesDateTo)) {
    // Return to default current calendar year
    setSalesDatePreset('year');
  } else {
    // Switch to all-time historical sales transactions
    salesDateFrom = '';
    salesDateTo = '';
    salesYearFilter = 'all';
    syncSalesDateInputs();
    renderSalesHistoryTable();
  }
}

function setSalesDatePreset(preset) {
  const today = todayISO();
  const curY = getCurrentYear();
  if (preset === 'today') {
    salesDateFrom = today;
    salesDateTo = today;
    salesYearFilter = 'current';
  } else if (preset === 'yesterday') {
    const yest = daysAgoISO(1);
    salesDateFrom = yest;
    salesDateTo = yest;
    salesYearFilter = 'current';
  } else if (preset === '7d') {
    salesDateFrom = daysAgoISO(6);
    salesDateTo = today;
    salesYearFilter = 'current';
  } else if (preset === '30d') {
    salesDateFrom = daysAgoISO(29);
    salesDateTo = today;
    salesYearFilter = 'current';
  } else if (preset === 'month') {
    salesDateFrom = thisMonthStartISO();
    salesDateTo = today;
    salesYearFilter = 'current';
  } else if (preset === 'year') {
    salesDateFrom = currentYearStartISO(curY);
    salesDateTo = currentYearEndISO(curY);
    salesYearFilter = 'current';
  } else if (preset === 'all') {
    salesDateFrom = '';
    salesDateTo = '';
    salesYearFilter = 'all';
  }
  syncSalesDateInputs();
  renderSalesHistoryTable();
}

function onSalesDateRangeChange() {
  const fromEl = document.getElementById('sh-date-from');
  const toEl = document.getElementById('sh-date-to');
  let f = fromEl ? fromEl.value : '';
  let t = toEl ? toEl.value : '';
  if (f && t && f > t) {
    const tmp = f;
    f = t;
    t = tmp;
    if (fromEl) fromEl.value = f;
    if (toEl) toEl.value = t;
  }
  salesDateFrom = f;
  salesDateTo = t;
  updateSalesDatePresetsUI();
  renderSalesHistoryTable();
}

function clearSalesDates() {
  setSalesDatePreset('all');
}

function setSalesDateRange(daysAgo) {
  if (daysAgo === null || daysAgo === undefined) setSalesDatePreset('all');
  else if (daysAgo === 0) setSalesDatePreset('today');
  else if (daysAgo === 1) setSalesDatePreset('yesterday');
  else if (daysAgo === 6) setSalesDatePreset('7d');
  else if (daysAgo === 29) setSalesDatePreset('30d');
  else {
    salesDateFrom = daysAgoISO(daysAgo);
    salesDateTo = todayISO();
    syncSalesDateInputs();
    renderSalesHistoryTable();
  }
}

function resetAllSalesFilters() {
  salesFilterStatus = 'all';
  salesSearchQuery = '';
  const curY = getCurrentYear();
  salesDateFrom = currentYearStartISO(curY);
  salesDateTo = currentYearEndISO(curY);
  salesYearFilter = 'current';
  const searchEl = document.getElementById('sh-search');
  if (searchEl) searchEl.value = '';
  resetPaginationPage('sales_history');
  renderPage();
}

function salesHistoryPage() {
  const curY = getCurrentYear();
  const availableYears = getAvailableRecordYears();
  const selectedYear = getSalesSelectedYear();
  const activePreset = getSalesDatePreset();
  const hasDates = Boolean(salesDateFrom || salesDateTo);
  const isHistorical = isHistoricalView(salesDateFrom, salesDateTo);

  return `
  <div class="panel" id="sales-history-panel" style="padding:0; overflow:hidden;">
    <div class="panel-head row wrap" style="padding:14px 18px 12px; gap:10px;">
      <div>
        <h3 style="margin:0;">Sales History &amp; Aftersales</h3>
        <span class="muted small">Review sales receipts, process same-day product returns &amp; exchanges (within day only), and issue exchange slips</span>
      </div>
      <div class="spacer"></div>
      <div class="row wrap" style="gap:8px; align-items:center;">
        <input id="sh-search" type="text" placeholder="🔍 Search receipt #, cashier…" value="${escapeHtml(salesSearchQuery)}" style="width:250px;" oninput="salesSearchQuery=this.value; renderSalesHistoryTable()">
        <button type="button" class="btn ghost small" onclick="resetAllSalesFilters()" title="Reset all search and date filters to current year">Reset All</button>
      </div>
    </div>

    <!-- Filter Tabs -->
    <div style="padding:10px 18px; display:flex; gap:8px; border-bottom:1px solid var(--line-light); background:#FAF7F2; flex-wrap:wrap;">
      <button class="btn ghost small filter-tab ${salesFilterStatus === 'all' ? 'active' : ''}" onclick="setSalesFilter('all')">All Transactions</button>
      <button class="btn ghost small filter-tab ${salesFilterStatus === 'completed' ? 'active' : ''}" onclick="setSalesFilter('completed')">Completed</button>
      <button class="btn ghost small filter-tab ${salesFilterStatus === 'partially_refunded' ? 'active' : ''}" onclick="setSalesFilter('partially_refunded')">Partial Return / Exchange</button>
      <button class="btn ghost small filter-tab ${salesFilterStatus === 'refunded' ? 'active' : ''}" onclick="setSalesFilter('refunded')">Returned / Exchanged</button>
    </div>

    <!-- Dedicated Date Range Bar, Year Selector & Historical Records Option -->
    <div class="audit-date-bar" style="padding:10px 18px; border-top:none; border-bottom:1px solid var(--line-light); background:#FBF9F4;">
      <div class="audit-date-group">
        <!-- Year Selector (Defaults to Current Year) -->
        <div class="audit-year-wrap">
          <label for="sh-year-select" class="audit-date-label">📅 Year:</label>
          <select id="sh-year-select" class="audit-year-select" onchange="onSalesYearChange(this.value)" title="Filter sales by calendar year">
            <option value="current" ${salesYearFilter === 'current' ? 'selected' : ''}>${curY} (Current Year)</option>
            ${availableYears.filter(y => y !== curY).map(y => `<option value="${y}" ${salesYearFilter === String(y) ? 'selected' : ''}>${y}</option>`).join('')}
            <option value="all" ${salesYearFilter === 'all' ? 'selected' : ''}>All Recorded Years</option>
          </select>
        </div>

        <span class="audit-date-sep">|</span>

        <label class="audit-date-label">Date Range:</label>
        <div class="audit-date-field app-monthday-picker-field" id="sh-date-from-wrap" title="Click to select Month and Day (Year: ${selectedYear})" onclick="openSalesCalendar('from', this, event)">
          <span class="field-tag">From</span>
          <input id="sh-date-from"
            type="text"
            class="app-monthday-input"
            placeholder="MM/DD/YYYY"
            value="${escapeHtml(formatDateInputMMDDYYYY(salesDateFrom))}"
            readonly
            onclick="openSalesCalendar('from', this, event)">
          <button type="button" class="app-cal-trigger-btn" onclick="openSalesCalendar('from', document.getElementById('sh-date-from-wrap'), event)" title="Open calendar (Month and Day)">📅</button>
        </div>
        <span class="audit-date-sep">to</span>
        <div class="audit-date-field app-monthday-picker-field" id="sh-date-to-wrap" title="Click to select Month and Day (Year: ${selectedYear})" onclick="openSalesCalendar('to', this, event)">
          <span class="field-tag">To</span>
          <input id="sh-date-to"
            type="text"
            class="app-monthday-input"
            placeholder="MM/DD/YYYY"
            value="${escapeHtml(formatDateInputMMDDYYYY(salesDateTo))}"
            readonly
            onclick="openSalesCalendar('to', this, event)">
          <button type="button" class="app-cal-trigger-btn" onclick="openSalesCalendar('to', document.getElementById('sh-date-to-wrap'), event)" title="Open calendar (Month and Day)">📅</button>
        </div>
        <button type="button" id="sh-clear-date-btn" class="audit-clear-date-btn" onclick="clearSalesDates()" title="Show all time" style="display:${hasDates ? 'inline-flex' : 'none'};">✕</button>
      </div>

      <div class="audit-date-shortcuts">
        <button type="button" class="audit-date-btn sh-date-btn ${activePreset === 'today' ? 'active' : ''}" data-preset="today" onclick="setSalesDatePreset('today')" title="Transactions today">Today</button>
        <button type="button" class="audit-date-btn sh-date-btn ${activePreset === 'yesterday' ? 'active' : ''}" data-preset="yesterday" onclick="setSalesDatePreset('yesterday')" title="Transactions yesterday">Yesterday</button>
        <button type="button" class="audit-date-btn sh-date-btn ${activePreset === '7d' ? 'active' : ''}" data-preset="7d" onclick="setSalesDatePreset('7d')" title="Last 7 days">7D</button>
        <button type="button" class="audit-date-btn sh-date-btn ${activePreset === '30d' ? 'active' : ''}" data-preset="30d" onclick="setSalesDatePreset('30d')" title="Last 30 days">30D</button>
        <button type="button" class="audit-date-btn sh-date-btn ${activePreset === 'month' ? 'active' : ''}" data-preset="month" onclick="setSalesDatePreset('month')" title="This month to date">This Month</button>
        <button type="button" class="audit-date-btn sh-date-btn ${activePreset === 'year' ? 'active' : ''}" data-preset="year" onclick="setSalesDatePreset('year')" title="Current year transactions">This Year (${curY})</button>
        <button type="button" class="audit-date-btn sh-date-btn ${activePreset === 'custom' ? 'active' : ''}" data-preset="custom" onclick="openSalesCalendar('from', document.getElementById('sh-date-from-wrap'), event)" title="Custom date range">Custom Range</button>

        <!-- Separate Historical Records viewing option for authorized users -->
        <button type="button" id="sh-historical-btn" class="audit-historical-btn ${isHistorical ? 'active' : ''}" onclick="toggleSalesHistoricalRecords()" title="View complete historical records across all years">
          🏛️ Historical Records
        </button>
      </div>

      <div class="audit-date-info" id="sh-date-summary">
        ${formatDateRangeSummary(salesDateFrom, salesDateTo, 'Date filter:')}
      </div>
    </div>

    <div class="panel-body tight table-scroll" id="sales-history-table">
      ${salesHistoryTableHtml()}
    </div>
  </div>`;
}

function setSalesFilter(status) {
  salesFilterStatus = status;
  resetPaginationPage('sales_history');
  renderSalesHistoryTable(true);
  // Update tab visual state
  document.querySelectorAll('.filter-tab').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('onclick').includes(`'${status}'`));
  });
}

function renderSalesHistoryTable(keepPage = false) {
  if (!keepPage) {
    resetPaginationPage('sales_history');
  }
  const el = document.getElementById('sales-history-table');
  if (el) el.innerHTML = salesHistoryTableHtml();
}

function saleStatusBadge(status) {
  const s = String(status || 'completed').trim().toLowerCase();
  if (s === 'voided' || s === 'void') {
    return `<span class="badge out">Voided</span>`;
  }
  if (s === 'cancelled' || s === 'canceled') {
    return `<span class="badge out">Cancelled</span>`;
  }
  if (s === 'refunded' || s === 'exchanged' || s === 'returned') {
    return `<span class="badge sale-refunded">Returned / Exchanged</span>`;
  }
  if (s === 'partially_refunded' || s === 'partially_exchanged' || s === 'partially_returned') {
    return `<span class="badge sale-partial-refund">Partial Return / Exchange</span>`;
  }
  return `<span class="badge sale-completed">Completed</span>`;
}

function getSaleExchangeTotal(sale) {
  if (!sale || !Array.isArray(sale.returns)) return 0;
  return Number(sale.returns.reduce((sum, r) => sum + Number(r.exchangeAmount || 0), 0).toFixed(2));
}

function getSaleReturnedValue(sale) {
  if (!sale) return 0;
  if (Array.isArray(sale.returns) && sale.returns.length > 0) {
    const sumRet = sale.returns.reduce((sum, r) => sum + Number(r.refundAmount || 0), 0);
    if (sumRet > 0) return Number(sumRet.toFixed(2));
  }
  return Number(sale.refundTotal || 0);
}

function isSaleReturnWithinDay(sale) {
  if (!sale || !sale.date) return false;
  const parsed = new Date(sale.date);
  const saleDateISO = !isNaN(parsed.getTime()) ? toLocalISODate(parsed) : String(sale.date).slice(0, 10);
  return saleDateISO === todayISO();
}

function salesHistoryTableHtml() {
  const searchEl = document.getElementById('sh-search');
  if (searchEl) salesSearchQuery = searchEl.value;
  const q = String(salesSearchQuery || '').trim().toLowerCase();
  const fromDate = salesDateFrom;
  const toDate = salesDateTo;
  let list = [...db.sales].sort((a, b) => new Date(b.date) - new Date(a.date));

  if (salesFilterStatus !== 'all') {
    list = list.filter(s => (s.status || 'completed') === salesFilterStatus);
  }
  if (q) {
    list = list.filter(s => {
      const itemsText = (s.items || []).map(it => it.name || it.productName || '').join(' ');
      return (getReceiptNo(s) + ' ' + (s.cashierName || '') + ' ' + itemsText).toLowerCase().includes(q);
    });
  }
  if (fromDate) {
    list = list.filter(s => s.date.slice(0, 10) >= fromDate);
  }
  if (toDate) {
    list = list.filter(s => s.date.slice(0, 10) <= toDate);
  }

  const pag = paginateArray(list, 'sales_history', {
    onUpdate: () => renderSalesHistoryTable(true),
    scrollTarget: '#sales-history-panel',
    recordLabel: 'transactions'
  });
  const pagedList = pag.pagedItems;

  const isHistorical = isHistoricalView(fromDate, toDate);
  const curY = getCurrentYear();
  let histLabel = 'All-Time Historical Records';
  if (fromDate && toDate && fromDate.slice(0, 4) === toDate.slice(0, 4)) {
    histLabel = `Historical Records (Year ${fromDate.slice(0, 4)})`;
  } else if (fromDate && toDate) {
    histLabel = `Historical Period (${formatDateReadable(fromDate)} – ${formatDateReadable(toDate)})`;
  } else if (fromDate) {
    histLabel = `Historical Records from ${formatDateReadable(fromDate)}`;
  } else if (toDate) {
    histLabel = `Historical Records until ${formatDateReadable(toDate)}`;
  }

  return `
  ${isHistorical ? `
    <div class="historical-records-banner">
      <div>
        🏛️ <b>${escapeHtml(histLabel)}:</b> <b>${list.length}</b> transaction(s) found. All historical business records are permanently retained in the database.
      </div>
      <button type="button" class="btn ghost small" onclick="setSalesDatePreset('year')" style="color:#7B4F09; border-color:#D19A42; background:#fff;">Return to Current Year (${curY}) &rarr;</button>
    </div>
  ` : ''}
  ${typeof renderSalesHistorySummaryAndBreakdownsHtml === 'function'
    ? `<div style="padding:14px 18px 0;">${renderSalesHistorySummaryAndBreakdownsHtml(list, fromDate, toDate)}</div>`
    : ''}
  <table>
    <thead>
      <tr>
        <th>Receipt #</th>
        <th>Date &amp; Time</th>
        <th>Cashier</th>
        <th>Items</th>
        <th class="center">Status</th>
        <th class="right">Total / Net</th>
        <th class="right">Actions</th>
      </tr>
    </thead>
    <tbody>
      ${pagedList.length ? pagedList.map(s => {
    const status = s.status || 'completed';
    const returnedVal = getSaleReturnedValue(s);
    const exchangeTotal = getSaleExchangeTotal(s);
    const refundTotal = Number(s.refundTotal || 0);
    const netTotal = Number((s.total - refundTotal).toFixed(2));
    const hasReturns = Array.isArray(s.returns) && s.returns.length > 0;
    const isWithinDay = isSaleReturnWithinDay(s);

    return `
        <tr>
          <td><code style="color:var(--teal); font-weight:700;">${escapeHtml(getReceiptNo(s))}</code></td>
          <td>${formatDateTime(s.date)}</td>
          <td>${escapeHtml(s.cashierName)}</td>
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
  }).join('') : `<tr><td colspan="7" class="empty-state">No sales transactions found matching filters.</td></tr>`}
    </tbody>
  </table>
  ${pag.html}`;
}

function viewSale(id) {
  const sale = db.sales.find(s => s.id === id);
  if (!sale) return;
  showReceipt(sale);
}

/* ============================================================
   RETURN & EXCHANGE MODAL WORKFLOW
   ============================================================ */

function openReturnRefundModal(saleId) {
  const sale = (db.sales || []).find(s => s.id === saleId);
  if (!sale) return;
  if (!isSaleReturnWithinDay(sale)) {
    showToast('Return / Exchange is only allowed within the same day of purchase.', 'error');
    return;
  }
  returnExchangeCart = [];
  openExchangePickerRow = null;
  exchangePickerTab = 'recommended';
  exchangePickerQuery = '';

  const receiptNo = getReceiptNo(sale);
  const saleItems = Array.isArray(sale.items) ? sale.items : [];
  const hasColorMixItems = saleItems.some(it => it.type === 'colormix');

  const rowsHtml = saleItems.map((item, idx) => {
    const qtyPurchased = Number(item.qty || 0);
    const qtyReturned = Number(item.returnedQty || 0);
    const returnable = Math.max(0, Number((qtyPurchased - qtyReturned).toFixed(2)));

    // Unit price per item
    const rawUnitPrice = Number(item.unitPrice !== undefined ? item.unitPrice : (item.price !== undefined ? item.price : (Number(item.lineTotal || 0) / Math.max(1, Number(item.qty || 1))))) || 0;
    const effectiveUnitPrice = Number(rawUnitPrice.toFixed(2));

    const isBlend = item.type === 'colormix';
    const hex = isBlend ? (item.hexColor || '#1F6F6B') : getProductHex(productById(item.productId));
    const prod = !isBlend && item.productId ? productById(item.productId) : null;
    const variant = prod ? productSizeVariantBySize(prod, item.size) : null;
    const sizeId = item.sizeId || (variant ? variant.sizeId : null);
    const prodId = prod ? (prod.productId || prod.id) : item.productId;
    const sizeStr = item.size ? ` · Size: <b>${item.size}L</b>` : '';
    const formulaStr = isBlend && Array.isArray(item.components) && item.components.length
      ? `<div class="muted small" style="font-size:11px; margin-top:2px;">Formula: ${item.components.map(cp => `${cp.percentage}% ${escapeHtml(cp.name)} (${formatStock(cp.liters)}L)`).join(' + ')}</div>`
      : '';
    const desc = isBlend
      ? `<div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
           <span class="cm-color-dot" style="background:${escapeHtml(hex)}; width:12px; height:12px; display:inline-block; border-radius:50%; border:1px solid rgba(0,0,0,0.15);"></span>
           <b>${escapeHtml(item.name)}</b> — <b>${escapeHtml(item.colorName || 'Custom Shade')}</b>
           <span class="muted small">(${item.liters || item.qty}L Mix)</span>
           <span class="badge low" id="ret-cm-badge-${idx}" style="font-size:10px; padding:1px 6px;">🔒 Custom Mix — Final Sale</span>
         </div>
         ${formulaStr}`
      : `<div>
           <div style="display:flex; align-items:center; gap:5px; flex-wrap:wrap;">
             <b>${escapeHtml(item.name)}</b>
             ${hex ? `<code style="font-family:'Space Grotesk',monospace; font-size:11px; font-weight:600; color:var(--teal);">(${hex})</code>` : ''}
             ${item.color && item.color !== '-' ? `(${escapeHtml(item.color)})` : ''}
           </div>
           <div class="muted small">${escapeHtml(item.brand || '')}${sizeStr}</div>
         </div>`;

    // Custom mixes are locked by default unless override is enabled
    const isInputDisabled = returnable === 0 || isBlend;

    return `
    <tr data-ret-row="${idx}" style="${isBlend ? 'background:#FDFBF7;' : ''}">
      <td>${desc}</td>
      <td class="right">${formatStock(qtyPurchased)}${isBlend ? 'L' : ''}</td>
      <td class="right" style="color:var(--ink-soft);">${formatStock(qtyReturned)}${isBlend ? 'L' : ''}</td>
      <td class="right" style="font-weight:700; color:${returnable > 0 ? 'var(--teal)' : 'var(--ink-soft)'};" id="ret-max-${idx}">
        ${formatStock(returnable)}${isBlend ? 'L' : ''}
      </td>
      <td class="right" style="font-family:'Space Grotesk'; font-size:12.5px;">
        ${peso(effectiveUnitPrice)}
      </td>
      <td style="width:130px;">
        <div style="display:flex; gap:4px; align-items:center;">
          <input type="number" id="ret-qty-input-${idx}" min="0" max="${returnable}" step="any" value="0"
            style="width:75px; text-align:right; font-weight:700; font-family:'Space Grotesk';"
            ${isInputDisabled ? 'disabled' : ''}
            data-is-colormix="${isBlend ? '1' : '0'}"
            data-unit-price="${effectiveUnitPrice}"
            data-max="${returnable}"
            oninput="onReturnQtyInput('${sale.id}', ${idx})">
          ${returnable > 0 ? `
            <button type="button" id="ret-max-btn-${idx}" class="btn ghost small" style="padding:2px 6px; font-size:11px; ${isBlend ? 'display:none;' : ''}" onclick="fillMaxReturnLine('${sale.id}', ${idx})">Max</button>
          ` : ''}
        </div>
      </td>
      <td class="right" style="font-weight:700; font-family:'Space Grotesk'; color:var(--danger);" id="ret-line-total-${idx}">
        ₱0.00
      </td>
    </tr>`;
  }).join('');

  const availableProducts = activeProducts().filter(p => Number(p.stock) > 0);
  const productOptionsHtml = availableProducts.length
    ? availableProducts.map(p => {
      const hex = getProductHex(p);
      const col = p.color && p.color !== '-' ? ` (${p.color})` : '';
      return `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}${hex ? ` [${hex}]` : ''}${escapeHtml(col)} — ${escapeHtml(p.brand)} (${formatLiters(p.stock)} avail · ${peso(p.price)}/L)</option>`;
    }).join('')
    : `<option value="">No products in stock</option>`;

  const colorMixPolicyBanner = hasColorMixItems ? `
    <div style="margin-top:10px; padding:10px 14px; background:#FFF8EC; border:1px solid #F0D9B5; border-radius:var(--radius-sm); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
      <div style="flex:1; min-width:240px;">
        <div style="font-weight:700; font-size:12.5px; color:#8A5A24;">🎨 Custom Color-Mixed Paint Policy</div>
        <div class="muted small" style="margin-top:2px;">
          Custom-tinted paints cannot be un-mixed back into sealed base units and are <b>Final Sale</b> by default. Unlock only if the store mixed the wrong formula/shade or the batch was defective.
        </div>
      </div>
      <label style="display:inline-flex; align-items:center; gap:8px; cursor:pointer; font-weight:700; font-size:12.5px; color:var(--danger); background:#fff; padding:6px 10px; border:1px solid #F3C4BF; border-radius:6px; margin:0;">
        <input type="checkbox" id="ret-colormix-override" onchange="onToggleColorMixOverride('${sale.id}', this.checked)">
        <span>⚠️ Unlock Custom Mix (Store Mixing Error / Defective)</span>
      </label>
    </div>
  ` : '';

  openModal(`↩️ Return &amp; Exchange — ${escapeHtml(receiptNo)}`, `
    <div style="background:#FAF7F2; border:1px solid var(--line); border-radius:var(--radius-sm); padding:12px 14px; margin-bottom:14px; display:flex; justify-content:space-between; flex-wrap:wrap; gap:10px;">
      <div>
        <div><span class="muted">Receipt #:</span> <code style="font-weight:700; color:var(--teal);">${escapeHtml(receiptNo)}</code> <span class="badge ok" style="font-size:10.5px; margin-left:6px;">✓ Same-Day Eligible</span></div>
      </div>
      <div>
        <div><span class="muted">Date of Sale:</span> <b>${formatDateTime(sale.date)}</b></div>
        <div><span class="muted">Original Total:</span> <b>${peso(sale.total)}</b></div>
      </div>
    </div>

    <!-- STEP 1: ITEMS BEING RETURNED -->
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; gap:8px; flex-wrap:wrap;">
      <div>
        <strong style="font-size:13.5px; color:var(--ink);">1. Select Items Being Returned</strong>
        <div class="muted small">Enter the quantity of paint units being returned:</div>
      </div>
      <div class="row wrap" style="gap:6px;">
        <button type="button" class="btn secondary small" onclick="fillAllReturnLines('${sale.id}', true)">⚡ Return All Eligible</button>
        <button type="button" class="btn ghost small" onclick="fillAllReturnLines('${sale.id}', false)">Clear All</button>
      </div>
    </div>

    <div class="bulk-adj-wrap" style="max-height:220px; overflow-y:auto;">
      <table class="bulk-adj-table">
        <thead>
          <tr>
            <th>Item Purchased</th>
            <th class="right">Sold</th>
            <th class="right">Returned</th>
            <th class="right">Returnable</th>
            <th class="right">Unit Credit</th>
            <th class="right">Return Qty</th>
            <th class="right">Return Credit</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>

    ${colorMixPolicyBanner}

    <!-- STEP 2: REPLACEMENT ITEMS FOR EXCHANGE (FIXED SIZE & QTY) -->
    <div style="margin-top:16px; padding:12px 14px; background:#F4F8F7; border:1px solid #C8DDD9; border-radius:var(--radius-sm);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; gap:8px; flex-wrap:wrap;">
        <div>
          <strong style="font-size:13.5px; color:var(--teal);">2. Replacement Item(s) for Exchange <span class="badge mid" style="font-size:10.5px; margin-left:6px;">🔒 Fixed Container Size &amp; Qty</span></strong>
          <div class="muted small">Container size and quantity are automatically fixed to match each item being returned above. You may keep the same product or select an alternative product of the same container size:</div>
        </div>
      </div>

      <div id="ret-exchange-cart-wrap"></div>
    </div>

    <div class="form-grid" style="margin-top:14px;">
      <div class="field">
        <label>Reason for Return / Exchange <span style="color:var(--danger);">*</span></label>
        <select id="ret-reason" required>
          <option value="Exchanging for a different color / shade">Exchanging for a different color / shade</option>
          <option value="Wrong product or container size purchased (Exchange)">Wrong product or container size purchased (Exchange)</option>
          <option value="Defective / damaged product container (Replace)">Defective / damaged product container (Replace)</option>
          <option value="Store mixing error / off-shade formula (Re-Mix Exchange)">Store mixing error / off-shade formula (Re-Mix Exchange)</option>
          <option value="Returned unopened / excess paint units">Returned unopened / excess paint units</option>
          <option value="Job cancelled / changed mind">Job cancelled / changed mind</option>
          <option value="Other return / exchange reason">Other return / exchange reason</option>
        </select>
      </div>
      <div class="field">
        <label>Cashier / Manager Note (optional)</label>
        <input id="ret-note" type="text" placeholder="e.g. Unopened units inspected, exchanged for new shade">
      </div>
    </div>

    <div style="margin-top:10px; background:#FAF6EE; border:1px solid #E4D8C5; border-radius:var(--radius-sm); padding:10px 14px;">
      <label style="display:flex; align-items:flex-start; gap:10px; cursor:pointer; font-weight:600; font-size:13px; margin:0;">
        <input type="checkbox" id="ret-restock" checked style="margin-top:3px;">
        <div>
          <span>Restock returned sealed paint units back into inventory</span>
          <div class="muted small" style="font-weight:400; margin-top:2px;">
            Adds returned sealed units back to product stock. (Note: Custom Color-Mixed paints are never restocked into sealed base units and are automatically logged as Miscast / Defective Mix.)
          </div>
        </div>
      </label>
    </div>

    <div style="margin-top:14px; padding:12px 14px; background:#FAF7F2; border:1px dashed var(--line); border-radius:var(--radius-sm); display:flex; flex-direction:column; gap:6px;">
      <div style="display:flex; justify-content:space-between; align-items:center; font-size:13px;">
        <span class="muted">Return Credit (Returned Items):</span>
        <strong id="ret-grand-total" style="font-family:'Space Grotesk'; color:var(--danger);">₱0.00</strong>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; font-size:13px;">
        <span class="muted">Replacement Items Value (Exchange):</span>
        <strong id="ret-exchange-total" style="font-family:'Space Grotesk'; color:var(--teal);">₱0.00</strong>
      </div>
      <div style="border-top:1px solid var(--line); padding-top:8px; margin-top:2px; display:flex; justify-content:space-between; align-items:center;">
        <span id="ret-settlement-label" style="font-size:14px; font-weight:700;">Exchange Balance / Settlement:</span>
        <span id="ret-settlement-value" style="font-size:18px; font-weight:700; color:var(--ink); font-family:'Space Grotesk';">₱0.00</span>
      </div>
    </div>
  `, `
    <button class="btn secondary" onclick="closeModal()">Cancel</button>
    <button class="btn" id="btn-submit-return" onclick="processSaleReturn('${sale.id}')" disabled>Confirm Return &amp; Exchange</button>
  `, 'wide');

  syncFixedExchangeLines(sale.id);
}

const openReturnExchangeModal = openReturnRefundModal;

function onToggleColorMixOverride(saleId, unlocked) {
  const sale = (db.sales || []).find(s => s.id === saleId);
  if (!sale) return;

  sale.items.forEach((item, idx) => {
    if (item.type === 'colormix') {
      const input = document.getElementById(`ret-qty-input-${idx}`);
      const maxBtn = document.getElementById(`ret-max-btn-${idx}`);
      const badge = document.getElementById(`ret-cm-badge-${idx}`);
      const max = input ? (parseFloat(input.dataset.max) || 0) : 0;

      if (input) {
        if (unlocked && max > 0) {
          input.disabled = false;
        } else {
          input.value = 0;
          input.disabled = true;
          onReturnQtyInput(saleId, idx);
        }
      }
      if (maxBtn) {
        maxBtn.style.display = (unlocked && max > 0) ? 'inline-block' : 'none';
      }
      if (badge) {
        badge.className = unlocked ? 'badge mid' : 'badge low';
        badge.innerHTML = unlocked ? '🔓 Unlocked (Mixing Error / Defect)' : '🔒 Custom Mix — Final Sale';
      }
    }
  });

  if (unlocked) {
    const reasonSel = document.getElementById('ret-reason');
    if (reasonSel) {
      reasonSel.value = 'Store mixing error / off-shade formula (Re-Mix Exchange)';
    }
    showToast('Custom Mix unlocked for Store Mixing Error / Defective Re-Mix Exchange.', 'ok');
  } else {
    syncFixedExchangeLines(saleId);
    recalcReturnGrandTotal(saleId);
  }
}

function syncFixedExchangeLines(saleId) {
  const sale = (db.sales || []).find(s => s.id === saleId);
  if (!sale) return;

  // Preserve any user-chosen replacement productId per source row index
  const prevChoiceByRow = {};
  returnExchangeCart.forEach(c => {
    if (c.sourceRowIdx !== undefined && c.productId) {
      prevChoiceByRow[c.sourceRowIdx] = c.productId;
    }
  });

  const nextCart = [];

  sale.items.forEach((item, idx) => {
    const input = document.getElementById(`ret-qty-input-${idx}`);
    const qtyToReturn = input ? Math.max(0, parseFloat(input.value) || 0) : 0;
    if (qtyToReturn <= 0) return;

    const effectiveUnitPrice = input ? (parseFloat(input.dataset.unitPrice) || Number(item.unitPrice || 0)) : Number(item.unitPrice || 0);

    if (item.type === 'colormix') {
      const scaledComponents = Array.isArray(item.components)
        ? item.components.map(cp => ({
          ...cp,
          liters: Number(((Number(cp.percentage || 0) / 100) * qtyToReturn).toFixed(2))
        }))
        : [];
      nextCart.push({
        sourceRowIdx: idx,
        type: 'colormix',
        productId: null,
        name: `Re-Mix: ${item.name}`,
        colorName: item.colorName || 'Custom Shade',
        color: item.colorName || 'Custom Shade',
        hexColor: item.hexColor || '#1F6F6B',
        brand: 'Custom Color Mix',
        size: qtyToReturn,
        liters: qtyToReturn,
        qty: qtyToReturn,
        unitPrice: effectiveUnitPrice,
        lineTotal: Number((qtyToReturn * effectiveUnitPrice).toFixed(2)),
        components: scaledComponents
      });
    } else {
      const fixedSize = Number(item.size) || 1;
      const fixedQty = qtyToReturn;
      const chosenProdId = prevChoiceByRow[idx] || item.productId;
      let p = productById(chosenProdId);

      // If original product isn't found or has 0 stock, fallback to first active product with enough stock of fixedSize
      if (!p || p.stock < fixedQty * fixedSize) {
        const fallback = activeProducts().find(cand => {
          if (cand.stock < fixedQty * fixedSize) return false;
          if (productHasCanBreakdown(cand) && productCanCount(cand, fixedSize) < fixedQty) return false;
          return true;
        });
        if (fallback && (!p || p.stock < fixedQty * fixedSize)) {
          p = fallback;
        }
      }

      if (p) {
        const isSameProduct = p.id === item.productId;
        const unitPrice = isSameProduct
          ? effectiveUnitPrice
          : Number((p.price * fixedSize).toFixed(2));
        nextCart.push({
          sourceRowIdx: idx,
          origProductId: item.productId,
          origUnitPrice: effectiveUnitPrice,
          type: 'product',
          productId: p.id,
          name: p.name,
          brand: p.brand || '',
          color: p.color || '',
          size: fixedSize,
          qty: fixedQty,
          unitPrice,
          lineTotal: Number((fixedQty * unitPrice).toFixed(2))
        });
      }
    }
  });

  returnExchangeCart = nextCart;
  renderExchangeReplacementCart(saleId);
}

let openExchangePickerRow = null;
let exchangePickerTab = 'recommended'; // 'recommended' | 'all'
let exchangePickerQuery = '';

function toggleExchangeCardPicker(saleId, sourceRowIdx) {
  if (openExchangePickerRow === sourceRowIdx) {
    openExchangePickerRow = null;
  } else {
    openExchangePickerRow = sourceRowIdx;
    exchangePickerTab = 'recommended';
    exchangePickerQuery = '';
  }
  renderExchangeReplacementCart(saleId);
}

function setExchangePickerTab(saleId, tab) {
  exchangePickerTab = tab;
  renderExchangeReplacementCart(saleId);
}

function onExchangePickerSearch(saleId, val) {
  exchangePickerQuery = val || '';
  renderExchangePickerCardsOnly(saleId);
}

function onChangeFixedReplacementProduct(saleId, sourceRowIdx, newProductId) {
  const line = returnExchangeCart.find(c => c.sourceRowIdx === sourceRowIdx);
  const p = productById(newProductId);
  if (!line || !p) return;

  const fixedSize = Number(line.size) || 1;
  const fixedQty = Number(line.qty) || 1;

  if (p.stock < fixedQty * fixedSize) {
    showToast(`Not enough stock for ${p.name} (${formatLiters(p.stock)} available, need ${fixedQty * fixedSize}L).`, 'error');
    return;
  }
  if (productHasCanBreakdown(p) && productCanCount(p, fixedSize) < fixedQty) {
    showToast(`Only ${productCanCount(p, fixedSize)} × ${fixedSize}L unit(s) in stock for ${p.name} (need ${fixedQty}).`, 'error');
    return;
  }

  const variant = productSizeVariantBySize(p, fixedSize);
  line.productId = p.productId || p.id;
  line.product_id = p.productId || p.id;
  line.sizeId = variant ? variant.sizeId : null;
  line.size_id = variant ? variant.sizeId : null;
  line.name = p.name;
  line.brand = p.brand || '';
  line.color = p.color || '';
  line.unitPrice = (p.id === line.origProductId && line.origUnitPrice)
    ? line.origUnitPrice
    : (variant ? variant.pricePerCan : Number((p.price * fixedSize).toFixed(2)));
  line.lineTotal = Number((fixedQty * line.unitPrice).toFixed(2));

  openExchangePickerRow = null;
  renderExchangeReplacementCart(saleId);
  recalcReturnGrandTotal(saleId);
}

function buildExchangePickerCardsHtml(saleId, ex) {
  const allProds = activeProducts();
  const fixedSize = Number(ex.size) || 1;
  const fixedQty = Number(ex.qty) || 1;
  const origProd = productById(ex.origProductId);
  const q = exchangePickerQuery.trim().toLowerCase();

  let list = allProds.slice();
  if (exchangePickerTab === 'recommended' && origProd) {
    const rec = list.filter(p => p.id === ex.origProductId || p.type === origProd.type || p.brand === origProd.brand);
    if (rec.length > 0) list = rec;
  }

  if (q) {
    list = list.filter(p => {
      const hex = getProductHex(p) || '';
      return [p.name, p.brand, p.type, p.color, hex].join(' ').toLowerCase().includes(q);
    });
  }

  // Sort: 1. Exact same item first, 2. Same brand & type, 3. In-stock for fixedSize first, 4. Alphabetical
  list.sort((a, b) => {
    const aOrig = a.id === ex.origProductId ? 0 : 1;
    const bOrig = b.id === ex.origProductId ? 0 : 1;
    if (aOrig !== bOrig) return aOrig - bOrig;

    const aHasStock = (productHasCanBreakdown(a) ? (productCanCount(a, fixedSize) >= fixedQty && a.stock >= fixedQty * fixedSize) : (a.stock >= fixedQty * fixedSize)) ? 0 : 1;
    const bHasStock = (productHasCanBreakdown(b) ? (productCanCount(b, fixedSize) >= fixedQty && b.stock >= fixedQty * fixedSize) : (b.stock >= fixedQty * fixedSize)) ? 0 : 1;
    if (aHasStock !== bHasStock) return aHasStock - bHasStock;

    const aSameBrand = origProd && a.brand === origProd.brand ? 0 : 1;
    const bSameBrand = origProd && b.brand === origProd.brand ? 0 : 1;
    if (aSameBrand !== bSameBrand) return aSameBrand - bSameBrand;

    return a.name.localeCompare(b.name);
  });

  if (!list.length) {
    return `<div class="muted small center" style="padding:18px; grid-column:1 / -1;">No matching paint products found. Try switching to <b>🌈 All Products</b>.</div>`;
  }

  return list.map(p => {
    const hasBreakdown = productHasCanBreakdown(p);
    const canCount = productCanCount(p, fixedSize);
    const enoughStock = hasBreakdown
      ? (canCount >= fixedQty && p.stock >= fixedQty * fixedSize)
      : (p.stock >= fixedQty * fixedSize);

    const isSelected = p.id === ex.productId;
    const isOrig = p.id === ex.origProductId;
    const hex = getProductDefaultColor(p);
    const code = getProductHex(p);
    const rgb = hexToRgb(hex);
    const detected = detectMixedColorName(rgb.r, rgb.g, rgb.b);
    const colorLabel = p.color && p.color !== '-' ? p.color : detected.name;
    const unitP = isOrig && ex.origUnitPrice ? ex.origUnitPrice : Number((p.price * fixedSize).toFixed(2));
    const priceDiff = Number((unitP - (ex.origUnitPrice || unitP)).toFixed(2));
    const stockLabel = hasBreakdown
      ? `${canCount} × ${fixedSize}L in stock`
      : `${formatLiters(p.stock)} in stock`;

    const diffTag = isOrig
      ? `<span class="badge ok" style="font-size:10px; padding:1px 6px;">★ Same Item · Even Exchange</span>`
      : (Math.abs(priceDiff) < 0.005
        ? `<span class="badge ok" style="font-size:10px; padding:1px 6px;">Even Exchange</span>`
        : (priceDiff > 0
          ? `<span class="badge mid" style="font-size:10px; padding:1px 6px;">+${peso(priceDiff)}/unit</span>`
          : `<span class="badge low" style="font-size:10px; padding:1px 6px;">${peso(priceDiff)}/unit</span>`));

    return `
      <div onclick="${enoughStock ? `onChangeFixedReplacementProduct('${saleId}', ${ex.sourceRowIdx}, '${p.id}')` : ''}"
           style="display:flex; align-items:center; gap:10px; padding:9px 11px; border-radius:8px; border:${isSelected ? '2px solid var(--teal)' : '1px solid var(--line)'}; background:${isSelected ? '#EDF7F6' : (enoughStock ? '#fff' : '#F7F4EE')}; opacity:${enoughStock ? '1' : '0.55'}; cursor:${enoughStock ? 'pointer' : 'not-allowed'}; transition:all 0.15s ease; box-shadow:${isSelected ? '0 2px 8px rgba(31,111,107,0.15)' : 'none'};"
           title="${enoughStock ? `Click to select ${escapeHtml(p.name)} (${colorLabel})` : `Insufficient stock for ${fixedQty} × ${fixedSize}L`}">
        <span style="width:28px; height:28px; border-radius:50%; background:${escapeHtml(hex)}; border:2px solid rgba(0,0,0,0.15); box-shadow:inset 0 1px 2px rgba(255,255,255,0.4); flex-shrink:0;"></span>
        <div style="flex:1; min-width:0;">
          <div style="display:flex; align-items:center; gap:5px; flex-wrap:wrap;">
            <strong style="font-size:12.5px; color:var(--ink); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(p.name)}</strong>
            ${code ? `<code style="font-size:10.5px; color:var(--teal); font-weight:700;">(${code})</code>` : ''}
          </div>
          <div class="muted small" style="font-size:11px; display:flex; align-items:center; gap:5px; flex-wrap:wrap; margin-top:2px;">
            <span style="font-weight:600; color:var(--ink);">${escapeHtml(colorLabel)}</span>
            <span>· ${escapeHtml(p.brand)}</span>
            <span>· <b style="color:${enoughStock ? 'var(--success)' : 'var(--danger)'};">${stockLabel}</b></span>
          </div>
          <div style="margin-top:4px; display:flex; align-items:center; justify-content:space-between; gap:6px; flex-wrap:wrap;">
            <span style="font-family:'Space Grotesk'; font-weight:700; font-size:12.5px; color:var(--ink);">${peso(unitP)} <span class="muted small" style="font-weight:400;">/${fixedSize}L</span></span>
            ${diffTag}
          </div>
        </div>
        ${isSelected ? `<span style="color:var(--teal); font-weight:800; font-size:15px; flex-shrink:0;" title="Currently Selected">✓</span>` : ''}
      </div>`;
  }).join('');
}

function renderExchangePickerCardsOnly(saleId) {
  if (openExchangePickerRow === null) return;
  const ex = returnExchangeCart.find(c => c.sourceRowIdx === openExchangePickerRow);
  const gridEl = document.getElementById(`ret-ex-card-grid-${openExchangePickerRow}`);
  if (ex && gridEl) {
    gridEl.innerHTML = buildExchangePickerCardsHtml(saleId, ex);
  }
}

function renderExchangeReplacementCart(saleId) {
  const wrap = document.getElementById('ret-exchange-cart-wrap');
  if (!wrap) return;

  if (!returnExchangeCart.length) {
    wrap.innerHTML = `<div class="muted small" style="padding:10px 12px; background:#fff; border:1px dashed #C8DDD9; border-radius:4px; text-align:center;">Enter a <b>Return Qty</b> in Step 1 above — the replacement item card with matching <b>fixed Container Size</b> and <b>fixed Quantity</b> will appear here automatically.</div>`;
    return;
  }

  const allProds = activeProducts();

  wrap.innerHTML = `
    <div class="bulk-adj-wrap" style="max-height:360px; overflow-y:auto; background:#fff;">
      <table class="bulk-adj-table" style="font-size:12.5px;">
        <thead>
          <tr>
            <th>Selected Replacement Paint</th>
            <th class="center">Fixed Container Size</th>
            <th class="center">Fixed Qty</th>
            <th class="right">Unit Price</th>
            <th class="right">Line Total</th>
          </tr>
        </thead>
        <tbody>
          ${returnExchangeCart.map(ex => {
    if (ex.type === 'colormix') {
      const formulaNote = Array.isArray(ex.components) && ex.components.length
        ? ex.components.map(cp => `${cp.percentage}% ${escapeHtml(cp.name)} (${formatStock(cp.liters)}L)`).join(' + ')
        : 'Fresh custom mix batch';
      return `
              <tr style="background:#F8FBFB;">
                <td>
                  <div style="display:flex; align-items:center; gap:8px;">
                    <span class="cm-color-dot" style="background:${escapeHtml(ex.hexColor || '#1F6F6B')}; width:24px; height:24px; display:inline-block; border-radius:50%; border:2px solid rgba(0,0,0,0.15);"></span>
                    <div>
                      <div>
                        <b>${escapeHtml(ex.name)}</b> — <b>${escapeHtml(ex.colorName || ex.color)}</b>
                        <span class="badge ok" style="font-size:10px; padding:1px 5px; margin-left:4px;">🎨 Fresh Re-Mix</span>
                      </div>
                      <div class="muted small" style="font-size:11px;">Deducts ingredients: ${formulaNote}</div>
                    </div>
                  </div>
                </td>
                <td class="center"><span class="badge mid">🔒 ${formatStock(ex.liters || ex.qty)}L Mix</span></td>
                <td class="center"><span class="badge ok">🔒 ${formatStock(ex.qty)}L</span></td>
                <td class="right" style="font-family:'Space Grotesk';">${peso(ex.unitPrice)}</td>
                <td class="right" style="font-weight:700; font-family:'Space Grotesk'; color:var(--teal);">${peso(ex.lineTotal)}</td>
              </tr>`;
    }

    const fixedSize = Number(ex.size) || 1;
    const fixedQty = Number(ex.qty) || 1;
    const origProd = productById(ex.origProductId);
    const selectedProd = productById(ex.productId);
    const isPickerOpen = openExchangePickerRow === ex.sourceRowIdx;

    const selHex = selectedProd ? getProductDefaultColor(selectedProd) : '#1F6F6B';
    const selCode = selectedProd ? getProductHex(selectedProd) : '';
    const selRgb = hexToRgb(selHex);
    const selDetected = detectMixedColorName(selRgb.r, selRgb.g, selRgb.b);
    const selColorLabel = selectedProd && selectedProd.color && selectedProd.color !== '-' ? selectedProd.color : selDetected.name;
    const isOrig = selectedProd && selectedProd.id === ex.origProductId;

    const priceDiffPerCan = Number((ex.unitPrice - (ex.origUnitPrice || ex.unitPrice)).toFixed(2));
    const diffBadge = isOrig
      ? `<span class="badge ok" style="font-size:10px; padding:1px 6px;">★ Same Item · Even Exchange</span>`
      : (Math.abs(priceDiffPerCan) < 0.005
        ? `<span class="badge ok" style="font-size:10px; padding:1px 6px;">Even Exchange (₱0.00)</span>`
        : (priceDiffPerCan > 0
          ? `<span class="badge mid" style="font-size:10px; padding:1px 6px;">+${peso(priceDiffPerCan)}/unit</span>`
          : `<span class="badge low" style="font-size:10px; padding:1px 6px;">${peso(priceDiffPerCan)}/unit</span>`));

    const recCount = origProd
      ? allProds.filter(p => p.id === ex.origProductId || p.type === origProd.type || p.brand === origProd.brand).length
      : allProds.length;

    return `
            <tr>
              <td>
                <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; background:#FAF7F2; border:1px solid var(--line); border-radius:8px; padding:8px 12px;">
                  <div style="display:flex; align-items:center; gap:10px; min-width:0;">
                    <span style="width:28px; height:28px; border-radius:50%; background:${escapeHtml(selHex)}; border:2px solid rgba(0,0,0,0.18); flex-shrink:0;" title="${escapeHtml(selColorLabel)} (${selHex})"></span>
                    <div style="min-width:0;">
                      <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                        <b style="font-size:13px; color:var(--ink);">${escapeHtml(selectedProd ? selectedProd.name : ex.name)}</b>
                        ${selCode ? `<code style="font-size:11px; color:var(--teal); font-weight:700;">(${selCode})</code>` : ''}
                        <span class="color-presentation-pill" style="font-size:11px; padding:1px 7px;">
                          <span class="cm-color-dot" style="background:${escapeHtml(selHex)}; width:8px; height:8px;"></span>
                          ${escapeHtml(selColorLabel)}
                        </span>
                      </div>
                      <div class="muted small" style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-top:2px;">
                        <span>${escapeHtml(selectedProd ? selectedProd.brand : ex.brand)}</span>
                        ${selectedProd && selectedProd.type ? `<span>· ${escapeHtml(selectedProd.type)}</span>` : ''}
                        ${diffBadge}
                      </div>
                    </div>
                  </div>
                  <button type="button" class="btn ${isPickerOpen ? '' : 'secondary'} small" onclick="toggleExchangeCardPicker('${saleId}', ${ex.sourceRowIdx})">
                    ${isPickerOpen ? '✕ Close Swatch Picker' : '🎨 Change Shade / Product'}
                  </button>
                </div>

                ${isPickerOpen ? `
                  <div style="margin-top:8px; padding:12px; background:#F4F8F7; border:1px solid #B5D2CD; border-radius:8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:10px;">
                      <div class="row wrap" style="gap:6px;">
                        <button type="button" class="pos-cat-pill ${exchangePickerTab === 'recommended' ? 'active' : ''}" onclick="setExchangePickerTab('${saleId}', 'recommended')">
                          🎨 Same Brand / Category (${recCount})
                        </button>
                        <button type="button" class="pos-cat-pill ${exchangePickerTab === 'all' ? 'active' : ''}" onclick="setExchangePickerTab('${saleId}', 'all')">
                          🌈 All Products (${allProds.length})
                        </button>
                        ${!isOrig && ex.origProductId ? `
                          <button type="button" class="btn ghost small" style="font-size:11px; padding:3px 8px;" onclick="onChangeFixedReplacementProduct('${saleId}', ${ex.sourceRowIdx}, '${ex.origProductId}')">
                            ★ Reset to Same Item
                          </button>
                        ` : ''}
                      </div>
                      <input type="text" placeholder="🔍 Search shade, color, or brand..." value="${escapeHtml(exchangePickerQuery)}"
                             oninput="onExchangePickerSearch('${saleId}', this.value)"
                             style="width:220px; padding:5px 10px; font-size:12px; border-radius:6px; background:#fff;">
                    </div>
                    <div id="ret-ex-card-grid-${ex.sourceRowIdx}" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(235px, 1fr)); gap:8px; max-height:230px; overflow-y:auto; padding-right:2px;">
                      ${buildExchangePickerCardsHtml(saleId, ex)}
                    </div>
                  </div>
                ` : ''}
              </td>
              <td class="center"><span class="badge mid">🔒 ${fixedSize}L</span></td>
              <td class="center"><span class="badge ok">🔒 ${formatStock(fixedQty)}</span></td>
              <td class="right" style="font-family:'Space Grotesk';">${peso(ex.unitPrice)}</td>
              <td class="right" style="font-weight:700; font-family:'Space Grotesk'; color:var(--teal);">${peso(ex.lineTotal)}</td>
            </tr>`;
  }).join('')}
        </tbody>
      </table>
    </div>`;
}

function openStartReturnPickerModal() {
  const eligibleSales = (db.sales || [])
    .filter(s => (s.status || 'completed') !== 'refunded' && isSaleReturnWithinDay(s))
    .slice()
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const renderPickerList = (filter = '') => {
    const q = filter.trim().toLowerCase();
    const filtered = q
      ? eligibleSales.filter(s => (getReceiptNo(s) + ' ' + (s.cashierName || '')).toLowerCase().includes(q))
      : eligibleSales.slice(0, 15);

    const container = document.getElementById('ret-picker-list');
    if (!container) return;

    if (!filtered.length) {
      container.innerHTML = `<div class="empty-state" style="padding:20px;">No eligible same-day sales transactions found for today (${escapeHtml(todayISO())}). Return / Exchange is only allowed within the same day of purchase.</div>`;
      return;
    }

    container.innerHTML = `
      <table style="width:100%; border-collapse:collapse; font-size:13px;">
        <thead>
          <tr style="border-bottom:1px solid var(--line); background:#FAF7F2;">
            <th style="padding:8px 10px; text-align:left;">Receipt #</th>
            <th style="padding:8px 10px; text-align:left;">Date &amp; Time</th>
            <th style="padding:8px 10px; text-align:right;">Total Paid</th>
            <th style="padding:8px 10px; text-align:right;">Action</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map(s => `
            <tr style="border-bottom:1px solid #F0EAE0;">
              <td style="padding:8px 10px;"><code style="color:var(--teal); font-weight:700;">${escapeHtml(getReceiptNo(s))}</code></td>
              <td style="padding:8px 10px;">${formatDateTime(s.date)}</td>
              <td style="padding:8px 10px; text-align:right; font-weight:700; font-family:'Space Grotesk';">${peso(s.total)}</td>
              <td style="padding:8px 10px; text-align:right;">
                <button type="button" class="btn secondary small" onclick='closeModal(); openReturnRefundModal("${s.id}")'>↩️ Return / Exchange</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  };

  window.onReturnPickerSearch = renderPickerList;

  openModal('↩️ Select Same-Day Sale to Process Return &amp; Exchange', `
    <div style="margin-bottom:10px; padding:8px 12px; background:#EDF7F6; border:1px solid #B5D2CD; border-radius:var(--radius-sm); font-size:12.5px; color:var(--ink);">
      <b>Same-Day Return &amp; Exchange Policy:</b> Only sales transactions completed today (<b>${escapeHtml(todayISO())}</b>) are eligible for return or exchange.
    </div>
    <div style="margin-bottom:12px;">
      <input type="text" id="ret-picker-search" placeholder="Search today's receipt # (e.g. OR-2026...) or cashier..." style="width:100%; padding:9px 12px; font-size:13.5px;" oninput="onReturnPickerSearch(this.value)">
    </div>
    <div id="ret-picker-list" style="max-height:360px; overflow-y:auto; border:1px solid var(--line); border-radius:var(--radius-sm); background:#fff;"></div>
  `, `
    <button class="btn secondary" onclick="closeModal()">Cancel</button>
  `, 'wide');

  setTimeout(() => renderPickerList(''), 0);
}

function onReturnQtyInput(saleId, idx) {
  const input = document.getElementById(`ret-qty-input-${idx}`);
  const lineTotalEl = document.getElementById(`ret-line-total-${idx}`);
  if (!input || !lineTotalEl) return;

  const max = parseFloat(input.dataset.max) || 0;
  const unitPrice = parseFloat(input.dataset.unitPrice) || 0;
  let val = Math.max(0, parseFloat(input.value) || 0);

  if (val > max) {
    val = max;
    input.value = max;
    showToast(`Maximum returnable quantity for this item is ${formatStock(max)}.`, 'error');
  }

  const lineTotal = Number((val * unitPrice).toFixed(2));
  lineTotalEl.textContent = peso(lineTotal);
  syncFixedExchangeLines(saleId);
  recalcReturnGrandTotal(saleId);
}

function fillMaxReturnLine(saleId, idx) {
  const input = document.getElementById(`ret-qty-input-${idx}`);
  if (input && !input.disabled) {
    input.value = input.dataset.max || 0;
    onReturnQtyInput(saleId, idx);
  }
}

function fillAllReturnLines(saleId, isMax) {
  const sale = (db.sales || []).find(s => s.id === saleId);
  if (!sale) return;
  sale.items.forEach((item, idx) => {
    const input = document.getElementById(`ret-qty-input-${idx}`);
    if (input && !input.disabled) {
      input.value = isMax ? (input.dataset.max || 0) : 0;
      onReturnQtyInput(saleId, idx);
    }
  });
}

function recalcReturnGrandTotal(saleId) {
  const sale = (db.sales || []).find(s => s.id === saleId);
  if (!sale) return;

  let grandTotal = 0;
  let hasValidReturn = false;

  sale.items.forEach((item, idx) => {
    const input = document.getElementById(`ret-qty-input-${idx}`);
    if (input) {
      const val = Math.max(0, parseFloat(input.value) || 0);
      const unitPrice = parseFloat(input.dataset.unitPrice) || 0;
      if (val > 0) {
        hasValidReturn = true;
        grandTotal += val * unitPrice;
      }
    }
  });

  grandTotal = Number(grandTotal.toFixed(2));
  const exchangeTotal = Number(returnExchangeCart.reduce((sum, c) => sum + Number(c.lineTotal || 0), 0).toFixed(2));
  const diff = Number((exchangeTotal - grandTotal).toFixed(2));

  const grandTotalEl = document.getElementById('ret-grand-total');
  const exchangeTotalEl = document.getElementById('ret-exchange-total');
  const settlementLabelEl = document.getElementById('ret-settlement-label');
  const settlementValueEl = document.getElementById('ret-settlement-value');
  const submitBtn = document.getElementById('btn-submit-return');

  if (grandTotalEl) grandTotalEl.textContent = peso(grandTotal);
  if (exchangeTotalEl) exchangeTotalEl.textContent = peso(exchangeTotal);

  if (settlementLabelEl && settlementValueEl) {
    if (exchangeTotal > 0 && Math.abs(diff) < 0.005) {
      settlementLabelEl.textContent = 'Exchange Settlement (Even Exchange):';
      settlementValueEl.textContent = '₱0.00 (Even Exchange)';
      settlementValueEl.style.color = 'var(--teal)';
    } else if (exchangeTotal > 0 && diff > 0) {
      settlementLabelEl.textContent = 'Additional Payment Due:';
      settlementValueEl.textContent = `+${peso(diff)}`;
      settlementValueEl.style.color = 'var(--success)';
    } else if (exchangeTotal > 0 && diff < 0) {
      settlementLabelEl.textContent = 'Remaining Return Credit:';
      settlementValueEl.textContent = peso(Math.abs(diff));
      settlementValueEl.style.color = 'var(--danger)';
    } else {
      settlementLabelEl.textContent = 'Total Return / Exchange Credit:';
      settlementValueEl.textContent = peso(grandTotal);
      settlementValueEl.style.color = 'var(--danger)';
    }
  }

  if (submitBtn) {
    submitBtn.disabled = !hasValidReturn || grandTotal <= 0;
    submitBtn.textContent = exchangeTotal > 0
      ? `Confirm Return & Exchange (${peso(exchangeTotal)} Replacement)`
      : `Confirm Return / Exchange (${peso(grandTotal)})`;
  }
}

async function processSaleReturn(saleId) {
  const sale = (db.sales || []).find(s => s.id === saleId);
  if (!sale) return;
  if (!isSaleReturnWithinDay(sale)) {
    showToast('Return / Exchange is only allowed within the same day of purchase.', 'error');
    return;
  }

  const reason = document.getElementById('ret-reason') ? document.getElementById('ret-reason').value : 'Return / exchange';
  const note = document.getElementById('ret-note') ? document.getElementById('ret-note').value.trim() : '';
  const restock = document.getElementById('ret-restock') ? document.getElementById('ret-restock').checked : true;
  const date = nowISO();
  const receiptNo = getReceiptNo(sale);

  // Validate stock for replacement items first (both standard products and custom re-mix formulas)
  for (const exItem of returnExchangeCart) {
    if (exItem.type === 'colormix') {
      if (Array.isArray(exItem.components)) {
        for (const comp of exItem.components) {
          const p = productById(comp.productId);
          if (p && productMixAvailableStock(p) < Number(comp.liters || 0)) {
            showToast(`Insufficient ingredient stock for "${comp.name}" (${formatStock(productMixAvailableStock(p))}L left, need ${comp.liters}L) for Re-Mix.`, 'error');
            return;
          }
        }
      }
    } else {
      const p = productById(exItem.productId);
      if (!p || p.stock < exItem.qty * exItem.size) {
        showToast(`Insufficient stock for replacement item: ${exItem.name}.`, 'error');
        return;
      }
    }
  }

  const returnedItems = [];
  let thisRefundAmount = 0;
  let anySealedRestocked = false;

  for (let idx = 0; idx < sale.items.length; idx++) {
    const item = sale.items[idx];
    const input = document.getElementById(`ret-qty-input-${idx}`);
    const qtyToReturn = input ? Math.max(0, parseFloat(input.value) || 0) : 0;

    if (qtyToReturn > 0) {
      const unitPrice = parseFloat(input.dataset.unitPrice) || Number(item.unitPrice || 0);
      const lineRefund = Number((qtyToReturn * unitPrice).toFixed(2));
      thisRefundAmount += lineRefund;

      // Update item returned quantity
      item.returnedQty = Number(((item.returnedQty || 0) + qtyToReturn).toFixed(2));

      const prodObj = item.productId ? productById(item.productId) : null;
      const sizeNum = Number(item.size) || 1;
      const itemVariant = prodObj ? productSizeVariantBySize(prodObj, sizeNum) : null;
      const resolvedSizeId = item.sizeId || (itemVariant ? itemVariant.sizeId : null);

      returnedItems.push({
        type: item.type || 'product',
        productId: prodObj ? (prodObj.productId || prodObj.id) : (item.productId || null),
        product_id: prodObj ? (prodObj.productId || prodObj.id) : (item.productId || null),
        sizeId: resolvedSizeId,
        size_id: resolvedSizeId,
        name: item.name,
        color: item.color || item.colorName || '',
        brand: item.brand || (item.type === 'colormix' ? 'Custom Color Mix' : ''),
        size: item.size || null,
        qty: qtyToReturn,
        unitPrice,
        lineRefund
      });

      if (item.type === 'colormix') {
        // Custom-mixed paint cannot be un-mixed back into sealed base cans: log as Miscast / Defective Mix
        db.movements.push({
          id: uid('mv'),
          date,
          type: 'adjustment',
          productId: null,
          product_id: null,
          sizeId: null,
          size_id: null,
          productName: `Miscast / Returned Mix — ${item.name} (${item.colorName || 'Custom'})`,
          qtyChange: 0,
          note: `Custom Mix Return / Exchange: ${receiptNo} (${reason}) [${qtyToReturn}L Miscast/Defective — Not Restocked to Base Units]${note ? ' — ' + note : ''}`,
          staffName: (currentUser && currentUser.name) || 'Cashier'
        });
      } else if (restock) {
        if (item.productId) {
          const product = productById(item.productId);
          if (product) {
            const size = Number(item.size) || 1;
            const variant = productSizeVariantBySize(product, size);
            const sizeId = resolvedSizeId || (variant ? variant.sizeId : null);
            const litersRestocked = Number((qtyToReturn * size).toFixed(2));
            const beforeStock = Number(product.stock) || 0;
            const beforeCans = productCanCount(product, size);
            product.stock = Number((product.stock + litersRestocked).toFixed(2));
            if (!product.canStock || typeof product.canStock !== 'object' || Array.isArray(product.canStock)) {
              product.canStock = {};
            }
            product.canStock[size] = (Number(product.canStock[size]) || 0) + qtyToReturn;
            syncProductVariants(product);
            const afterCans = productCanCount(product, size);
            anySealedRestocked = true;
            db.movements.push({
              id: uid('mv'),
              date,
              type: 'return',
              productId: product.productId || product.id,
              product_id: product.productId || product.id,
              sizeId: sizeId,
              size_id: sizeId,
              container_size: size,
              productName: product.name,
              qtyChange: litersRestocked,
              note: `Product Return / Exchange: ${receiptNo} (${reason}) [Return ${qtyToReturn} × ${size}L Restocked · ${size}L Units: ${beforeCans}→${afterCans}, Stock: ${formatStock(beforeStock)}L→${formatStock(product.stock)}L]${note ? ' — ' + note : ''}`,
              staffName: (currentUser && currentUser.name) || 'Cashier'
            });
          }
        }
      } else {
        // Damaged return — logged for audit without adding stock
        const product = item.productId ? productById(item.productId) : null;
        const curStock = product ? Number(product.stock || 0) : 0;
        const variant = product && item.size ? productSizeVariantBySize(product, item.size) : null;
        const sizeId = resolvedSizeId || (variant ? variant.sizeId : null);
        db.movements.push({
          id: uid('mv'),
          date,
          type: 'adjustment',
          productId: product ? (product.productId || product.id) : (item.productId || null),
          product_id: product ? (product.productId || product.id) : (item.productId || null),
          sizeId: sizeId,
          size_id: sizeId,
          container_size: item.size || null,
          productName: item.name,
          qtyChange: 0,
          note: `Product Return / Exchange: ${receiptNo} (${reason}) [Damaged/Not Restocked · Stock: ${formatStock(curStock)}L→${formatStock(curStock)}L]${note ? ' — ' + note : ''}`,
          staffName: (currentUser && currentUser.name) || 'Cashier'
        });
      }
    }
  }

  if (returnedItems.length === 0 || thisRefundAmount <= 0) {
    showToast('Please enter at least one quantity to return.', 'error');
    return;
  }

  thisRefundAmount = Number(thisRefundAmount.toFixed(2));

  // Deduct stock for replacement items & log exchange movements
  const exchangeItems = returnExchangeCart.map(ex => ({ ...ex }));
  const thisExchangeAmount = Number(exchangeItems.reduce((sum, ex) => sum + Number(ex.lineTotal || 0), 0).toFixed(2));

  for (const exItem of exchangeItems) {
    if (exItem.type === 'colormix') {
      // Deduct constituent ingredients for Re-Mix Replacement using Opened / Used Stock first, then sealed cans
      if (Array.isArray(exItem.components)) {
        exItem.components.forEach(comp => {
          const p = productById(comp.productId);
          if (p) {
            const beforeStock = Number(p.stock) || 0;
            const plan = consumeProductForColorMix(p, comp.liters, comp.preferredCanSize || 0);
            const mixNoteExtra = formatMixConsumptionNote(plan);
            db.movements.push({
              id: uid('mv'),
              date,
              type: 'colormix',
              productId: p.id,
              productName: `${p.name} (for ${exItem.colorName || 'Re-Mix'} mix)`,
              colorName: exItem.colorName || 'Custom Shade',
              qtyChange: -comp.liters,
              note: `Exchange Re-Mix ingredient: ${comp.percentage}% of ${exItem.liters || exItem.qty}L (${exItem.colorName || 'Custom'}) · Receipt: ${receiptNo}${mixNoteExtra} · Stock: ${formatStock(beforeStock)}L→${formatStock(p.stock)}L`,
              staffName: (currentUser && currentUser.name) || 'Cashier'
            });
          }
        });
      }
      const formulaSummary = Array.isArray(exItem.components) && exItem.components.length
        ? exItem.components.map(cp => `${cp.percentage}% ${cp.name}`).join(' + ')
        : 'Custom Re-Mix';
      db.movements.push({
        id: uid('mv'),
        date,
        type: 'colormix',
        productId: null,
        productName: `Exchange Re-Mix — ${exItem.colorName || exItem.name}`,
        colorName: exItem.colorName || 'Custom Shade',
        qtyChange: Number(exItem.liters || exItem.qty || 1),
        note: `Aftersales Re-Mix Formula: ${formulaSummary} · Orig Receipt: ${receiptNo}`,
        staffName: (currentUser && currentUser.name) || 'Cashier'
      });
    } else {
      const product = productById(exItem.productId);
      if (product) {
        const size = Number(exItem.size) || 1;
        const variant = productSizeVariantBySize(product, size);
        const sizeId = exItem.sizeId || (variant ? variant.sizeId : null);
        const litersIssued = Number((exItem.qty * size).toFixed(2));
        const beforeStock = Number(product.stock) || 0;
        const beforeCans = productCanCount(product, size);
        product.stock = Math.max(0, Number((product.stock - litersIssued).toFixed(2)));
        if (!product.canStock || typeof product.canStock !== 'object' || Array.isArray(product.canStock)) {
          product.canStock = {};
        }
        product.canStock[size] = Math.max(0, (Number(product.canStock[size]) || 0) - exItem.qty);
        syncProductVariants(product);
        const afterCans = productCanCount(product, size);
        db.movements.push({
          id: uid('mv'),
          date,
          type: 'return',
          productId: product.productId || product.id,
          product_id: product.productId || product.id,
          sizeId: sizeId,
          size_id: sizeId,
          container_size: size,
          productName: product.name,
          qtyChange: -litersIssued,
          note: `Exchange Replacement Issued: ${receiptNo} (${reason}) [Exchange ${exItem.qty} × ${size}L Issued · ${size}L Units: ${beforeCans}→${afterCans}, Stock: ${formatStock(beforeStock)}L→${formatStock(product.stock)}L]${note ? ' — ' + note : ''}`,
          staffName: (currentUser && currentUser.name) || 'Cashier'
        });
      }
    }
  }

  // Net adjustment to sale.refundTotal (returned credit minus replacement items issued)
  const netReduction = Number((thisRefundAmount - thisExchangeAmount).toFixed(2));
  sale.refundTotal = Number(((sale.refundTotal || 0) + netReduction).toFixed(2));
  const allFullyReturned = sale.items.every(it => Number(it.returnedQty || 0) >= Number(it.qty || 0));
  sale.status = allFullyReturned ? 'refunded' : 'partially_refunded';

  const returnRecord = {
    id: uid('ret'),
    voucherNo: `RE-${Date.now().toString(36).toUpperCase()}`,
    date,
    cashierName: (currentUser && currentUser.name) || 'Cashier',
    reason,
    note,
    restocked: Boolean(restock && anySealedRestocked),
    refundAmount: thisRefundAmount,
    exchangeAmount: thisExchangeAmount,
    netDiff: Number((thisExchangeAmount - thisRefundAmount).toFixed(2)),
    items: returnedItems,
    exchangeItems
  };

  if (!Array.isArray(sale.returns)) sale.returns = [];
  sale.returns.push(returnRecord);
  returnExchangeCart = [];

  const auditAction = allFullyReturned ? 'SALE_REFUND' : 'PARTIAL_REFUND';
  const retItemSummary = returnedItems.map(it => `${it.qty}${it.size ? '×' + it.size + 'L' : 'L'} ${it.name} (${peso(it.lineRefund)})`).join(', ');
  const exItemSummary = exchangeItems.length > 0
    ? exchangeItems.map(ex => `${ex.qty}${ex.size ? '×' + ex.size + 'L' : 'L'} ${ex.name} (${peso(ex.lineTotal)})`).join(', ')
    : '';
  const prevNetTotal = Number((sale.total - (sale.refundTotal - netReduction)).toFixed(2));
  const newNetTotal = Number((sale.total - sale.refundTotal).toFixed(2));
  logAudit(
    auditAction,
    `Receipt ${receiptNo}`,
    `${allFullyReturned ? 'Full Sale Refund' : 'Partial Return / Refund'} processed for ${receiptNo} (Voucher ${returnRecord.voucherNo}) — Returned: ${retItemSummary} (${peso(thisRefundAmount)})${exItemSummary ? ' · Exchanged for: ' + exItemSummary + ' (' + peso(thisExchangeAmount) + ')' : ''} · Reason: ${reason}${note ? ' (' + note + ')' : ''}`,
    {
      entityName: `Receipt ${receiptNo}`,
      fieldChanged: allFullyReturned ? 'Full Sale Refund' : (exchangeItems.length > 0 ? 'Partial Return & Exchange' : 'Partial Sale Refund'),
      oldValue: `Net Sale: ${peso(prevNetTotal)} (Orig: ${peso(sale.total)})`,
      newValue: `Net Sale: ${peso(newNetTotal)} (Returned: ${peso(thisRefundAmount)}${thisExchangeAmount > 0 ? ', Replacement: ' + peso(thisExchangeAmount) : ''})`,
      referenceNo: receiptNo,
      reason: `${reason}${note ? ' — ' + note : ''}`,
      meta: {
        voucherNo: returnRecord.voucherNo,
        receiptNo,
        refundAmount: thisRefundAmount,
        exchangeAmount: thisExchangeAmount,
        restocked: returnRecord.restocked,
        returnedItems: returnedItems.map(i => ({ name: i.name, qty: i.qty, size: i.size, unitPrice: i.unitPrice, lineRefund: i.lineRefund })),
        exchangeItems: exchangeItems.map(i => ({ name: i.name, qty: i.qty, size: i.size, unitPrice: i.unitPrice, lineTotal: i.lineTotal }))
      }
    }
  );

  await saveDB();
  closeModal();

  showToast(
    exchangeItems.length > 0
      ? `Return & Exchange processed (${peso(thisRefundAmount)} returned, ${peso(thisExchangeAmount)} replacement issued).`
      : `Return / Exchange credit of ${peso(thisRefundAmount)} processed successfully.`,
    'ok'
  );
  renderSalesHistoryTable();
  if (typeof renderReportBody === 'function' && document.getElementById('report-body')) {
    renderReportBody();
  }

  // Automatically pop up official printable return & exchange voucher
  showReturnVoucherModal(sale.id, returnRecord.id);
}

/* ============================================================
   RETURN & EXCHANGE VOUCHER SLIP (PRINTABLE)
   ============================================================ */

function viewReturnVouchers(saleId) {
  const sale = (db.sales || []).find(s => s.id === saleId);
  if (!sale || !sale.returns || !sale.returns.length) return;
  const latestVoucher = sale.returns[sale.returns.length - 1];
  showReturnVoucherModal(sale.id, latestVoucher.id);
}

function showReturnVoucherModal(saleId, voucherId) {
  const sale = (db.sales || []).find(s => s.id === saleId);
  if (!sale) return;
  const voucher = (sale.returns || []).find(v => v.id === voucherId) || sale.returns[sale.returns.length - 1];
  if (!voucher) return;

  const receiptNo = getReceiptNo(sale);
  const itemsHtml = (voucher.items || []).map(it => {
    const prod = it.productId ? productById(it.productId) : null;
    const itHex = prod ? getProductHex(prod) : '';
    const variant = prod && it.size ? productSizeVariantBySize(prod, it.size) : null;
    const sizeId = it.sizeId || (variant ? variant.sizeId : null);
    const prodId = prod ? (prod.productId || prod.id) : it.productId;
    return `
    <tr>
      <td>
        <div style="display:flex; align-items:center; gap:5px; flex-wrap:wrap;">
          <b>${escapeHtml(it.name)}</b> ${itHex ? `<span class="muted small" style="font-family:monospace; font-weight:600; color:var(--teal);">(${itHex})</span>` : ''}
          ${it.color ? `<span class="muted small"> (${escapeHtml(it.color)})</span>` : ''}
        </div>
        ${it.brand ? `<div class="muted small">${escapeHtml(it.brand || '')}${it.size ? ` · Size: <b>${it.size}L</b>` : ''}</div>` : ''}
      </td>
      <td class="right">${formatStock(it.qty)}</td>
      <td class="right">${peso(it.unitPrice)}</td>
      <td class="right" style="font-weight:700;">${peso(it.lineRefund)}</td>
    </tr>`;
  }).join('');

  const onlyColorMixReturned = (voucher.items || []).length > 0 && (voucher.items || []).every(it => it.type === 'colormix');
  const restockBadgeHtml = voucher.restocked
    ? '<span class="badge ok">✓ Restocked into inventory</span>'
    : (onlyColorMixReturned
      ? '<span class="badge low">🎨 Miscast Mix (Not Restocked to Base Units)</span>'
      : '<span class="badge low">✕ Damaged / Not Restocked</span>');

  const exItems = Array.isArray(voucher.exchangeItems) ? voucher.exchangeItems : [];
  const exchangeHtml = exItems.length ? `
    <div style="margin-top:14px; font-weight:700; font-size:11.5px; text-transform:uppercase; color:var(--teal); letter-spacing:0.03em;">Replacement Items Issued (Exchange)</div>
    <table style="width:100%; border-collapse:collapse; margin-top:4px;">
      <thead>
        <tr style="border-bottom:1px solid var(--line); font-size:11px; text-transform:uppercase; color:var(--ink-soft);">
          <th style="text-align:left; padding:6px 0;">Replacement Item</th>
          <th class="right" style="padding:6px 8px;">Qty</th>
          <th class="right" style="padding:6px 8px;">Unit Price</th>
          <th class="right" style="padding:6px 0;">Line Total</th>
        </tr>
      </thead>
      <tbody>
        ${exItems.map(ex => {
    if (ex.type === 'colormix') {
      const formulaStr = Array.isArray(ex.components) && ex.components.length
        ? ` · Formula: ${ex.components.map(cp => `${cp.percentage}% ${escapeHtml(cp.name)}`).join(' + ')}`
        : '';
      return `
            <tr>
              <td>
                <b>${escapeHtml(ex.name)}</b> <span class="muted small">(${escapeHtml(ex.colorName || ex.color || 'Custom Shade')})</span>
                <div class="muted small">Fresh Custom Re-Mix · Volume: <b>${formatStock(ex.liters || ex.qty)}L</b>${formulaStr}</div>
              </td>
              <td class="right">${formatStock(ex.qty)}L</td>
              <td class="right">${peso(ex.unitPrice)}</td>
              <td class="right" style="font-weight:700; color:var(--teal);">${peso(ex.lineTotal)}</td>
            </tr>`;
    }
    const prod = ex.productId ? productById(ex.productId) : null;
    const exHex = prod ? getProductHex(prod) : '';
    const variant = prod && ex.size ? productSizeVariantBySize(prod, ex.size) : null;
    const sizeId = ex.sizeId || (variant ? variant.sizeId : null);
    const prodId = prod ? (prod.productId || prod.id) : ex.productId;
    return `
          <tr>
            <td>
              <div style="display:flex; align-items:center; gap:5px; flex-wrap:wrap;">
                <b>${escapeHtml(ex.name)}</b> ${exHex ? `<span class="muted small" style="font-family:monospace; font-weight:600; color:var(--teal);">(${exHex})</span>` : ''}
                ${ex.color && ex.color !== '-' ? `<span class="muted small"> (${escapeHtml(ex.color)})</span>` : ''}
              </div>
              <div class="muted small">${escapeHtml(ex.brand || '')}${ex.size ? ` · Size: <b>${ex.size}L</b>` : ''}</div>
            </td>
            <td class="right">${formatStock(ex.qty)}</td>
            <td class="right">${peso(ex.unitPrice)}</td>
            <td class="right" style="font-weight:700; color:var(--teal);">${peso(ex.lineTotal)}</td>
          </tr>`;
  }).join('')}
      </tbody>
    </table>
  ` : '';

  const retVal = Number(voucher.refundAmount || 0);
  const exVal = Number(voucher.exchangeAmount || 0);
  const diff = Number((exVal - retVal).toFixed(2));

  openModal('📋 Return &amp; Exchange Voucher', `
    <div id="printable-return-slip" style="background:#fff; border:1px solid var(--line); border-radius:var(--radius-sm); padding:18px 20px; font-family:'Inter',system-ui,sans-serif; color:#26211C; font-size:12.5px;">
      <div style="text-align:center; padding-bottom:12px; border-bottom:1px dashed var(--line); margin-bottom:12px;">
        <div style="font-family:'Space Grotesk'; font-weight:700; font-size:16px; letter-spacing:-0.01em;">MRGR COLOR CENTER</div>
        <div class="muted small">Official Return &amp; Exchange Slip</div>
        <div style="display:inline-block; margin-top:8px; padding:4px 12px; background:#FBEAE8; border:1px solid #F3C4BF; border-radius:4px; font-family:'Space Grotesk'; font-weight:700; font-size:13px; color:var(--danger);">
          Voucher #: <span>${escapeHtml(voucher.voucherNo || voucher.id)}</span>
        </div>
      </div>

      <div class="row wrap" style="justify-content:space-between; margin-bottom:12px; gap:8px;">
        <div>
          <div><span class="muted">Original Receipt:</span> <b>${escapeHtml(receiptNo)}</b></div>
          <div><span class="muted">Cashier:</span> <b>${escapeHtml(voucher.cashierName)}</b></div>
        </div>
        <div class="right">
          <div><span class="muted">Date:</span> <b>${formatDateTime(voucher.date)}</b></div>
          <div><span class="muted">Restock:</span> ${restockBadgeHtml}</div>
        </div>
      </div>

      <div style="margin-bottom:10px; font-size:12px; background:#FAF7F2; padding:6px 10px; border-radius:4px;">
        <span class="muted">Reason:</span> <b>${escapeHtml(voucher.reason)}</b>
        ${voucher.note ? `<br><span class="muted">Notes:</span> <i>${escapeHtml(voucher.note)}</i>` : ''}
      </div>

      <div style="font-weight:700; font-size:11.5px; text-transform:uppercase; color:var(--ink-soft); letter-spacing:0.03em; margin-top:8px;">Items Returned</div>
      <table style="width:100%; border-collapse:collapse; margin-top:4px;">
        <thead>
          <tr style="border-bottom:1px solid var(--line); font-size:11px; text-transform:uppercase; color:var(--ink-soft);">
            <th style="text-align:left; padding:6px 0;">Item Returned</th>
            <th class="right" style="padding:6px 8px;">Qty</th>
            <th class="right" style="padding:6px 8px;">Unit Credit</th>
            <th class="right" style="padding:6px 0;">Return Credit</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      ${exchangeHtml}

      <div style="margin-top:14px; padding-top:10px; border-top:1px dashed var(--line); display:flex; flex-direction:column; gap:5px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span class="muted">Total Returned Credit:</span>
          <strong style="font-family:'Space Grotesk'; color:var(--danger);">${peso(retVal)}</strong>
        </div>
        ${exItems.length ? `
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span class="muted">Total Replacement Issued:</span>
            <strong style="font-family:'Space Grotesk'; color:var(--teal);">${peso(exVal)}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; padding-top:6px; border-top:1px solid #ECE4D8;">
            <span style="font-weight:700; font-size:14px;">${Math.abs(diff) < 0.005 ? 'Exchange Settlement:' : (diff > 0 ? 'Additional Amount Paid:' : 'Remaining Return Credit:')}</span>
            <span style="font-size:17px; font-weight:700; color:${diff >= 0 ? 'var(--teal)' : 'var(--danger)'}; font-family:'Space Grotesk';">
              ${Math.abs(diff) < 0.005 ? '₱0.00 (Even Exchange)' : (diff > 0 ? `+${peso(diff)}` : peso(Math.abs(diff)))}
            </span>
          </div>
        ` : `
          <div style="display:flex; justify-content:space-between; align-items:center; padding-top:6px; border-top:1px solid #ECE4D8;">
            <span style="font-weight:700; font-size:14px;">Total Return / Exchange Credit:</span>
            <span style="font-size:18px; font-weight:700; color:var(--danger); font-family:'Space Grotesk';">${peso(retVal)}</span>
          </div>
        `}
      </div>

      <div class="row wrap" style="justify-content:space-between; margin-top:30px; padding-top:20px; border-top:1px solid #ECE4D8; gap:20px;">
        <div style="text-align:center; min-width:140px;">
          <div style="border-bottom:1px solid #8A8070; width:100%; height:20px; margin-bottom:4px;"></div>
          <span class="muted small" style="font-size:11px;">Authorized Signature</span>
        </div>
        <div style="text-align:center; min-width:140px;">
          <div style="border-bottom:1px solid #8A8070; width:100%; height:20px; margin-bottom:4px;"></div>
          <span class="muted small" style="font-size:11px;">Cashier / Authorized By</span>
        </div>
      </div>

      <div class="muted center small" style="margin-top:16px; font-size:11px;">
        Official Return &amp; Exchange acknowledgement for the items listed above. Retain copy for accounting and inventory records.
      </div>
    </div>
  `, `
    <button class="btn secondary" onclick="printReturnSlipSection()">🖨️ Print Return / Exchange Slip</button>
    <button class="btn" onclick="closeReturnVoucherModal()">Done</button>
  `);
}

function closeReturnVoucherModal() {
  closeModal();
  renderSalesHistoryTable();
  if (typeof renderReportBody === 'function' && document.getElementById('report-body')) {
    renderReportBody();
  }
}

function printReturnSlipSection() {
  const slipEl = document.getElementById('printable-return-slip');
  if (!slipEl) return;
  const printWin = window.open('', '_blank', 'width=650,height=750');
  if (!printWin) {
    showToast('Popup blocker prevented voucher print window from opening. Please allow popups.', 'error');
    return;
  }
  printWin.document.write(`
<!DOCTYPE html>
<html>
  <head>
    <title>Return &amp; Exchange Voucher - MRGR Color Center</title>
    <style>
      body { font-family: 'Inter', system-ui, sans-serif; font-size: 13px; color: #26211C; padding: 24px; line-height: 1.5; }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; }
      th { text-align: left; font-size: 11px; text-transform: uppercase; border-bottom: 1px solid #ddd; padding: 6px 8px; }
      td { padding: 6px 8px; border-bottom: 1px solid #eee; vertical-align: middle; }
      .right { text-align: right; }
      .center { text-align: center; }
      .muted { color: #666; font-size: 12px; }
      .grand { font-size: 16px; font-weight: bold; border-top: 1px dashed #333; margin-top: 8px; padding-top: 8px; }
      .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: bold; }
      .badge.ok { background: #eaf4ec; color: #2f6b41; }
      .badge.low { background: #fbeae8; color: #c1443d; }
    </style>
  </head>
  <body>
    ${slipEl.outerHTML}
    <script>window.onload = function(){ window.print(); window.close(); }<\/script>
  </body>
</html>
  `);
  printWin.document.close();
}
